-- ════════════════════════════════════════════════════════════════════════════
-- ACCESSI DIPENDENTI — solo il titolare autorizza/attiva/disattiva.
--
-- Modello "invito via email": un estraneo NON può entrare nell'azienda. Solo
-- un'email PRE-AUTORIZZATA dal titolare (riga in org_inviti) può unirsi, e parte
-- come dipendente NON approvato (approvato=false → accesso ZERO finché il titolare
-- non lo attiva). Il titolare può disattivare (revoca istantanea) o eliminare.
--
-- Barriera vera a livello DB:
--   - get_user_org_id() ritorna l'org SOLO se il profilo è approvato → un
--     dipendente non approvato/disattivato fallisce TUTTE le RLS (zero dati).
--   - handle_new_user(): se esiste un invito pending per l'email → unisce all'org
--     come dipendente approvato=false; altrimenti crea una nuova org (titolare
--     approvato=true), come prima.
-- Idempotente. Paste-safe (un solo livello di $$).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0) BACKFILL: tutti i profili esistenti (titolari) restano approvati ───────
-- Senza questo, il gate su approvato bloccherebbe gli utenti attuali (default
-- della colonna era false). I dipendenti veri (nessuno in prod) restano da approvare.
update public.profiles
set approvato = true
where coalesce(ruolo, 'titolare') <> 'dipendente';

-- ── 1) Tabella inviti (email pre-autorizzate dal titolare) ────────────────────
create table if not exists public.org_inviti (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  email            text not null,
  ruolo            text not null default 'dipendente',
  stato            text not null default 'pending',  -- pending | accettato | revocato
  invited_by       uuid references auth.users(id),
  accepted_user_id uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz
);
-- email normalizzata (lowercase) per il match in handle_new_user.
create index if not exists org_inviti_email_idx on public.org_inviti (lower(email));
create index if not exists org_inviti_org_idx   on public.org_inviti (organization_id);

alter table public.org_inviti enable row level security;
-- Solo il titolare dell'org gestisce i propri inviti. Il dipendente: nessun accesso.
drop policy if exists "org_inviti_titolare" on public.org_inviti;
create policy "org_inviti_titolare"
on public.org_inviti
for all
using (
  organization_id = public.get_user_org_id()
  and not public.is_dipendente()
)
with check (
  organization_id = public.get_user_org_id()
  and not public.is_dipendente()
);

-- ── 2) get_user_org_id(): gate su approvato ───────────────────────────────────
-- Un profilo non approvato (dipendente in attesa o disattivato) → org NULL → la
-- RLS nega ovunque. La self-read del profilo resta possibile (policy profile_own
-- usa id = auth.uid()), così l'app può mostrare "in attesa".
create or replace function public.get_user_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from public.profiles
  where id = auth.uid() and approvato = true
$$;
revoke all on function public.get_user_org_id() from public;
grant execute on function public.get_user_org_id() to anon, authenticated;

-- ── 3) handle_new_user(): consuma l'invito o crea una nuova org ───────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id    uuid;
  new_sede_id   uuid;
  invite_org_id uuid;
  nome_attivita text;
  tipo_attivita text;
  nome_citta    text;
begin
  -- GUARD: profilo già esistente → non duplicare nulla.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  -- INVITO: c'è un'email pre-autorizzata e ancora pending? → unisci come dipendente.
  select organization_id into invite_org_id
  from public.org_inviti
  where lower(email) = lower(new.email) and stato = 'pending'
  order by created_at desc
  limit 1;

  if invite_org_id is not null then
    insert into public.profiles (id, organization_id, email, nome_completo, ruolo, approvato)
    values (
      new.id,
      invite_org_id,
      new.email,
      coalesce(new.raw_user_meta_data->>'nome_completo', ''),
      'dipendente',
      false  -- accesso ZERO finché il titolare non attiva
    );
    update public.org_inviti
      set stato = 'accettato', accepted_user_id = new.id, accepted_at = now()
      where lower(email) = lower(new.email) and stato = 'pending';
    return new;
  end if;

  -- Nessun invito → nuova org, utente titolare (approvato).
  nome_attivita := coalesce(new.raw_user_meta_data->>'nome_attivita', 'La mia attività');
  tipo_attivita := coalesce(new.raw_user_meta_data->>'tipo_attivita', 'bar');
  nome_citta    := coalesce(new.raw_user_meta_data->>'citta', 'Torino');

  insert into public.organizations (nome, tipo)
  values (nome_attivita, tipo_attivita)
  returning id into new_org_id;

  insert into public.sedi (organization_id, nome, citta, is_default)
  values (new_org_id, 'Sede principale', nome_citta, true)
  returning id into new_sede_id;

  insert into public.profiles (id, organization_id, email, nome_completo, ruolo, approvato)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome_completo', ''),
    'titolare',
    true
  );

  return new;
end;
$$;
