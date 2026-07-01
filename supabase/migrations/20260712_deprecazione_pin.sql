-- ════════════════════════════════════════════════════════════════════════════
-- DEPRECAZIONE VECCHIO SISTEMA PIN
-- ════════════════════════════════════════════════════════════════════════════
-- Sostituito da email + codice personale (vedi 20260710). Rimuove RPC,
-- indici e colonne relative al vecchio flusso PIN. Sicuro da eseguire dopo
-- che tutti i client sono passati al nuovo login (deploy Foodos post-2026-06-30).
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Drop RPC PIN ──────────────────────────────────────────────────────────
drop function if exists public.verify_dipendente_pin(text, text);
drop function if exists public.set_dipendente_pin(uuid, text);
drop function if exists public.remove_dipendente_pin(uuid);
drop function if exists public.log_pin_attempt(text, boolean, text, text);
drop function if exists public.fos_dipendente_pin_status();

-- ── 2) Drop tabella pin_attempts (audit specifico PIN, non piu' rilevante) ────
drop table if exists public.pin_attempts;

-- ── 3) Drop colonne PIN da profiles ──────────────────────────────────────────
-- Le nuove colonne (dipendente_codice_set_at, dipendente_last_login_at) restano.
do $drop_pin$ begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles drop column if exists pin_hash;
    alter table public.profiles drop column if exists pin_set_at;
    alter table public.profiles drop column if exists pin_last_used_at;
    alter table public.profiles drop column if exists pin_failed_count;
    alter table public.profiles drop column if exists pin_locked_until;
  end if;
end $drop_pin$;

-- ── 4) La colonna organizations.slug resta utile per altri usi (URL pubblici,
-- referrals, ecc.) - NON la droppiamo.
