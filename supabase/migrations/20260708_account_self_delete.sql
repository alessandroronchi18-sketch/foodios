-- Cancellazione account self-service (soft delete con recupero).
--
-- Quando un titolare cancella il proprio account dall'UI:
--  - organizations.deleted_at = now()      → la sessione viene rifiutata al login
--  - organizations.attivo = false          → coerente col blocco admin esistente
--  - organizations.deletion_reason = '...' → testo (cosa hanno scelto dalle opzioni)
--  - organizations.deletion_feedback = ...  → testo libero opzionale
--
-- I dati restano: l'admin può riabilitare l'org settando deleted_at=null e
-- attivo=true. Il GDPR-hard-delete fisico resta solo via pannello admin
-- (azione 'elimina') che gia' esiste.
--
-- Idempotente.

alter table public.organizations
  add column if not exists deleted_at timestamptz null,
  add column if not exists deletion_reason text null,
  add column if not exists deletion_feedback text null;

comment on column public.organizations.deleted_at is
  'Timestamp di self-cancellazione utente (soft delete). NULL = attiva. Distinguibile da admin-block (attivo=false ma deleted_at IS NULL).';
comment on column public.organizations.deletion_reason is
  'Motivo selezionato al momento della cancellazione (es. troppo_costoso, manca_feature, non_lo_uso, cambio_software, altro).';
comment on column public.organizations.deletion_feedback is
  'Feedback libero opzionale lasciato al momento della cancellazione.';

-- Indice per ritrovare velocemente gli account cancellati nel pannello admin.
create index if not exists idx_organizations_deleted_at
  on public.organizations (deleted_at)
  where deleted_at is not null;
