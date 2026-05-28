-- 20260608 — Admin tier 1: note CRM + feedback inbox + banner globali
-- Idempotente. Safe da rieseguire.
-- =======================================================================

-- ─── 1. Note admin per organizzazione (CRM lite) ─────────────────────────
-- Campo di testo libero per appunti del admin sul cliente. Mai visibile
-- al cliente: solo lo admin (via /api/admin) legge/scrive questa colonna.
alter table public.organizations
  add column if not exists note_admin text;

-- ─── 2. Feedback inbox in-app ────────────────────────────────────────────
-- Tabella per i feedback inviati dai clienti tramite il bottone in app.
-- Insert da utenti autenticati (per la loro stessa organization), lettura
-- e update solo dal admin via service_role.
create table if not exists public.feedback (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  user_email      text,
  ruolo           text,
  view_corrente   text,
  messaggio       text not null,
  sentiment       text default 'feedback'
                  check (sentiment in ('bug','feature','feedback','complimento')),
  url             text,
  user_agent      text,
  gestito         boolean default false,
  gestito_at      timestamptz,
  gestito_by      text,
  created_at      timestamptz default now()
);
alter table public.feedback enable row level security;

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own"
  on public.feedback for insert
  to authenticated
  with check (
    organization_id = (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

-- Niente policy SELECT/UPDATE per authenticated: lo utente NON deve vedere
-- ne i propri feedback (per non creare aspettative sulle risposte) ne
-- quelli altrui. Lo admin legge tutto via service_role bypassando RLS.
revoke select, update, delete on public.feedback from anon, authenticated;
grant select, update on public.feedback to service_role;

create index if not exists idx_feedback_org on public.feedback(organization_id);
create index if not exists idx_feedback_gestito
  on public.feedback(gestito, created_at desc)
  where gestito = false;

-- ─── 3. Banner globali per annunci ───────────────────────────────────────
-- Tabella per messaggi mostrati a tutti gli utenti in cima alla app.
-- Lettura da tutti gli autenticati (solo attivi + non scaduti).
-- Scrittura solo service_role (admin).
create table if not exists public.app_banners (
  id          uuid default gen_random_uuid() primary key,
  messaggio   text not null,
  tipo        text default 'info'
              check (tipo in ('info','warn','critical','success')),
  attivo      boolean default true,
  scade_il    timestamptz,
  creato_da   text,
  creato_il   timestamptz default now()
);
alter table public.app_banners enable row level security;

drop policy if exists "app_banners_read_active" on public.app_banners;
create policy "app_banners_read_active"
  on public.app_banners for select
  to authenticated
  using (attivo = true and (scade_il is null or scade_il > now()));

revoke insert, update, delete on public.app_banners from anon, authenticated;
grant all on public.app_banners to service_role;

create index if not exists idx_banner_attivo
  on public.app_banners(creato_il desc)
  where attivo = true;
