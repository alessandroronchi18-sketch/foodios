-- Onboarding seen — persistito a livello organization invece di localStorage.
--
-- Motivo: il design partner accede da Safari Private e da device multipli;
-- localStorage e' per-browser-per-device → il wizard ricompariva ad ogni
-- accesso "nuovo" (privata, altro telefono, altro mac). Spostiamo il flag
-- a DB cosi' l'onboarding si vede UNA SOLA volta dopo la creazione dell'org,
-- da qualsiasi device l'utente acceda.
--
-- Idempotente.

alter table public.organizations
  add column if not exists onboarding_completato_at timestamptz null;

comment on column public.organizations.onboarding_completato_at is
  'Timestamp di completamento (o skip) del wizard onboarding al primo accesso. NULL = onboarding mai mostrato. Sostituisce localStorage che era per-device.';
