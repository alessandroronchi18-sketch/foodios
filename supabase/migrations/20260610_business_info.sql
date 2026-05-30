-- 20260610 — Dati fatturazione su organizations
-- Per emettere fattura elettronica (SDI) in Italia serve raccogliere:
-- ragione sociale, P.IVA, codice destinatario (o PEC come fallback) e
-- indirizzo completo. Aggiunti come colonne nullable: si possono compilare
-- in onboarding o piu' tardi dalla view Impostazioni > Profilo azienda.
-- Idempotente.

alter table public.organizations
  add column if not exists ragione_sociale  text,
  add column if not exists partita_iva      text,
  add column if not exists codice_fiscale   text,
  add column if not exists codice_destinatario text,
  add column if not exists pec              text,
  add column if not exists indirizzo        text,
  add column if not exists cap              text,
  add column if not exists citta            text,
  add column if not exists provincia        text,
  add column if not exists nazione          text default 'IT';

-- Constraint soft sulla forma di P.IVA italiana (11 cifre) se valorizzata.
-- Non blocchiamo P.IVA estere (UE possibili in futuro) ma marchiamo "IT".
alter table public.organizations
  drop constraint if exists organizations_piva_format_check;
alter table public.organizations
  add constraint organizations_piva_format_check
  check (
    partita_iva is null
    or nazione <> 'IT'
    or partita_iva ~ '^[0-9]{11}$'
  );

-- Codice destinatario SDI: 7 caratteri alfanumerici. PEC e' fallback se manca.
alter table public.organizations
  drop constraint if exists organizations_codice_destinatario_check;
alter table public.organizations
  add constraint organizations_codice_destinatario_check
  check (
    codice_destinatario is null
    or codice_destinatario ~ '^[A-Z0-9]{7}$'
  );

-- Track when business info was last updated (utile per "fatturazione attiva?")
alter table public.organizations
  add column if not exists business_info_updated_at timestamptz;

-- Index per ricerca admin per P.IVA
create index if not exists idx_org_piva on public.organizations(partita_iva)
  where partita_iva is not null;
