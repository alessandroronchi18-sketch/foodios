-- 20260615 — DB hardening: search_path, ENUM check, index, retention.
-- =======================================================================
-- Fix vari da audit DB:
--   1. guard_profile_escalation senza search_path (security definer ok ma
--      esplicito è best practice anti schema-injection).
--   2. movimenti_stock_pf.causale è TEXT libero → ENUM check per evitare
--      typo che falsificano report.
--   3. Index su (organization_id, updated_at desc) per stock_prodotti_finiti
--      — query 'cosa è cambiato di recente' senza index scan full table.
--   4. Retention audit_log: trigger non utile, faccio policy cleanup
--      delete via funzione che la chiamiamo dal cron-giornaliero.
--      Cancella entry > 365 giorni.
-- =======================================================================

-- 1. guard_profile_escalation: explicit search_path
do $$
declare fn_exists boolean;
begin
  select exists(select 1 from pg_proc where proname = 'guard_profile_escalation') into fn_exists;
  if fn_exists then
    -- alter function ... set search_path = public
    alter function public.guard_profile_escalation() set search_path = public, pg_temp;
  end if;
end$$;

-- 2. movimenti_stock_pf.causale ENUM via CHECK (idempotente)
do $$
declare has_check boolean;
begin
  select exists(
    select 1 from pg_constraint
    where conname = 'movimenti_stock_pf_causale_check'
      and conrelid = 'public.movimenti_stock_pf'::regclass
  ) into has_check;
  if not has_check then
    -- Pulisci eventuali valori legacy fuori standard prima del check
    update public.movimenti_stock_pf
       set causale = lower(trim(causale))
     where causale is not null;
    -- Aggiungi check; NOT VALID per non bloccare se ci sono righe legacy con
    -- causali rare (verranno trovate via validate constraint future).
    alter table public.movimenti_stock_pf
      add constraint movimenti_stock_pf_causale_check
      check (causale in (
        'produzione','vendita','scarto',
        'trasferimento_invio','trasferimento_ricezione','annullo_trasferimento',
        'rettifica_manuale','rettifica_admin'
      )) not valid;
  end if;
end$$;

-- 3. Index per query 'recente' su stock_prodotti_finiti
create index if not exists idx_stock_pf_org_updated
  on public.stock_prodotti_finiti(organization_id, updated_at desc);

-- 4. Audit log retention function (chiamabile da cron giornaliero)
create or replace function public.cleanup_audit_log(retain_days int default 365)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  removed int;
begin
  with del as (
    delete from public.audit_log
     where created_at < now() - (retain_days || ' days')::interval
     returning id
  )
  select count(*) into removed from del;
  return removed;
end;
$fn$;

revoke all on function public.cleanup_audit_log(int) from anon, authenticated;
grant execute on function public.cleanup_audit_log(int) to service_role;

comment on function public.cleanup_audit_log is
  'Elimina audit_log piu vecchi di N giorni (default 365). Chiamato dal cron giornaliero per limitare crescita tabella. Solo service_role.';
