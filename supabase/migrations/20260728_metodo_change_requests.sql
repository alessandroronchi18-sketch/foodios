-- Migration: workflow di approvazione admin per il cambio del metodo di
-- produzione (stampi ↔ inventario). MOTIVAZIONE (audit 2026-07-28): un
-- cambio di metodo tocca profondamente ricettario, formati vendita, viste
-- inventario, produzione. Rendendolo self-service il titolare puo' rompersi
-- l'operativita' con un click; ora la richiesta passa da admin (founder)
-- che valuta e applica in un momento controllato.
--
-- Idempotente. Nessuna dipendenza sulle tabelle esistenti a parte
-- organizations (foreign key) e auth.users (soft ref).

-- 1) Tabella richieste
create table if not exists public.metodo_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_email text,
  from_metodo text not null check (from_metodo in ('stampi','inventario')),
  to_metodo   text not null check (to_metodo   in ('stampi','inventario')),
  motivazione text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  admin_note text,
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz not null default now()
);

-- 2) Solo UNA richiesta pending per org (evita spam di richieste sovrapposte)
create unique index if not exists uniq_pending_per_org
  on public.metodo_change_requests(organization_id)
  where status = 'pending';

-- 3) Indici per admin (lista pending in ordine cronologico)
create index if not exists idx_metodo_req_status_created
  on public.metodo_change_requests(status, created_at desc);
create index if not exists idx_metodo_req_org
  on public.metodo_change_requests(organization_id, created_at desc);

-- 4) RLS: il titolare vede/crea/cancella le richieste della propria org.
--    Aggiornamenti di decisione (approved/rejected + admin_note) sono fatti
--    solo dal service_role via api/admin.js → verificaAdmin.
alter table public.metodo_change_requests enable row level security;

drop policy if exists metodo_req_select_own_org on public.metodo_change_requests;
create policy metodo_req_select_own_org on public.metodo_change_requests
  for select to authenticated
  using (organization_id = public.get_user_org_id());

drop policy if exists metodo_req_insert_own_org on public.metodo_change_requests;
create policy metodo_req_insert_own_org on public.metodo_change_requests
  for insert to authenticated
  with check (
    organization_id = public.get_user_org_id()
    and status = 'pending'
    -- il richiedente deve essere un titolare (il dipendente non fa richieste
    -- amministrative sulla struttura dell'org).
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = organization_id
        and coalesce(p.ruolo, 'titolare') = 'titolare'
    )
  );

-- Il tenant puo' cancellare (status='cancelled') solo le proprie richieste PENDING.
drop policy if exists metodo_req_cancel_own on public.metodo_change_requests;
create policy metodo_req_cancel_own on public.metodo_change_requests
  for update to authenticated
  using (organization_id = public.get_user_org_id() and status = 'pending')
  with check (organization_id = public.get_user_org_id() and status = 'cancelled');

-- Nessuna DELETE per tenant (storico immutabile).
