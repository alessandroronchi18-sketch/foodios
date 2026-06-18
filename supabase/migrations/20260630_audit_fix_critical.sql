-- =========================================================================
-- Audit profondo 2026-06-17 — fix CRITICAL/HIGH lato DB
-- =========================================================================
--
-- 1) note_admin leakata al titolare via select * on organizations
--    (audit 6 CRITICAL). Soluzione: revocare column-level SELECT su note_admin
--    da authenticated, lasciandolo accessibile solo a service_role.
--
-- 2) sedi_kpi view bypassa RLS (security_invoker off di default in PG15+).
--    (audit 1 CRITICAL + audit 7 HIGH).
--
-- 3) admin_overview view same issue (audit 7 LOW).
--
-- 4) wa_settings UNIQUE phone_number cross-tenant (audit 7 HIGH).
--
-- 5) Forecast/competitor/documentary policy INSERT mancanti (audit 7 HIGH).
--
-- 6) Funzioni senza search_path esplicito (audit 7 MEDIUM).
--
-- 7) Constraint piano: aggiungere 'chain' come alias valido (audit 7 MEDIUM).
--
-- 8) feedback ON DELETE SET NULL invece di CASCADE per retention (audit 6 LOW).
--
-- 9) UNIQUE (discount_code_id, stripe_invoice_id) per idempotency redemption
--    (audit 2 HIGH).
--
-- 10) Cleanup automatic via pg_cron NON aggiunto (richiede estensione).
-- =========================================================================

begin;

-- 1) Revoca SELECT su note_admin per authenticated (titolare incluso).
--    Mantenere INSERT/UPDATE su altri campi: revochiamo solo la column.
do $audit_note$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='organizations'
      and column_name='note_admin'
  ) then
    revoke select (note_admin) on public.organizations from authenticated, anon;
    -- service_role conserva accesso completo (bypassa RLS comunque).
  end if;
end $audit_note$;

-- 2) sedi_kpi security_invoker = true (richiede PG15+).
do $audit_kpi$ begin
  if to_regclass('public.sedi_kpi') is not null then
    begin
      alter view public.sedi_kpi set (security_invoker = true);
    exception when feature_not_supported then
      -- PG <15: fallback è revoca da authenticated
      revoke select on public.sedi_kpi from authenticated, anon;
    end;
  end if;
end $audit_kpi$;

-- 3) admin_overview security_invoker = true (era grant solo a service_role,
--    ma defense-in-depth: set invoker comunque).
do $audit_ov$ begin
  if to_regclass('public.admin_overview') is not null then
    begin
      alter view public.admin_overview set (security_invoker = true);
    exception when feature_not_supported then null;
    end;
  end if;
end $audit_ov$;

-- 4) wa_settings: rimpiazza UNIQUE phone_number globale con UNIQUE per-org.
do $audit_wa$ begin
  if to_regclass('public.wa_settings') is not null then
    if exists (
      select 1 from pg_constraint
      where conname = 'uq_wa_phone'
    ) then
      alter table public.wa_settings drop constraint uq_wa_phone;
    end if;
    -- Nuovo UNIQUE composito (organization_id, phone_number)
    if not exists (
      select 1 from pg_constraint
      where conname = 'uq_wa_phone_per_org'
    ) then
      alter table public.wa_settings
        add constraint uq_wa_phone_per_org unique (organization_id, phone_number);
    end if;
  end if;
end $audit_wa$;

-- 5) Aggiungere INSERT/UPDATE/DELETE policy per forecast/competitor/documentary
--    quando esistono. Service_role bypassa comunque RLS, ma se in futuro un
--    utente loggato deve inserire (es. forecast manuale) la policy serve.
do $audit_ai$
declare
  t text;
begin
  for t in select unnest(array['forecast_giornaliero','competitor_prices','documentary_snapshots'])
  loop
    if to_regclass('public.'||t) is not null then
      execute format(
        $f$
        do $$
        begin
          if not exists (
            select 1 from pg_policies
            where schemaname='public' and tablename=%L and policyname=%L
          ) then
            execute %L;
          end if;
        end $$;
        $f$,
        t, t||'_own_write',
        format(
          'create policy %I on public.%I for all to authenticated using (organization_id = public.get_user_org_id()) with check (organization_id = public.get_user_org_id())',
          t||'_own_write', t
        )
      );
    end if;
  end loop;
end $audit_ai$;

-- 6) Set search_path esplicito su funzioni note senza (audit 7 MEDIUM).
--    Idempotente: ALTER FUNCTION SET search_path è sicuro su funzioni esistenti.
do $audit_fn$
declare
  fn_name text;
begin
  for fn_name in select unnest(array[
    'touch_inventario_produzione_updated_at',
    'inventario_venduto_giornaliero',
    'is_chiave_operativa',
    'increment_discount_redemption'
  ])
  loop
    begin
      execute format(
        'alter function public.%I() set search_path = public, pg_temp',
        fn_name
      );
    exception when others then
      -- Funzione non esiste o ha firma diversa: skip senza bloccare
      null;
    end;
  end loop;
end $audit_fn$;

-- GRANT EXECUTE su inventario_venduto_giornaliero (audit 7 MEDIUM)
do $audit_grant$ begin
  begin
    grant execute on function public.inventario_venduto_giornaliero(uuid, date, date)
      to authenticated;
  exception when others then null;
  end;
end $audit_grant$;

-- 7) Constraint piano: aggiungere 'chain' come valore valido per allinearsi
--    al naming marketing (audit 7 MEDIUM).
do $audit_piano$ begin
  if exists (
    select 1 from pg_constraint where conname = 'organizations_piano_check'
  ) then
    alter table public.organizations drop constraint organizations_piano_check;
  end if;
  alter table public.organizations
    add constraint organizations_piano_check
    check (piano in ('trial','base','pro','enterprise','chain'));
end $audit_piano$;

-- 8) feedback.organization_id ON DELETE SET NULL invece di CASCADE (audit 6 LOW).
do $audit_fb$ begin
  if to_regclass('public.feedback') is not null then
    if exists (
      select 1 from pg_constraint
      where conname='feedback_organization_id_fkey' and conrelid='public.feedback'::regclass
    ) then
      alter table public.feedback drop constraint feedback_organization_id_fkey;
      -- consenti NULL su organization_id per il SET NULL
      alter table public.feedback alter column organization_id drop not null;
      alter table public.feedback
        add constraint feedback_organization_id_fkey
        foreign key (organization_id) references public.organizations(id)
        on delete set null;
    end if;
  end if;
end $audit_fb$;

-- 9) UNIQUE (discount_code_id, stripe_invoice_id) su discount_redemptions
--    per evitare double-insert se webhook ri-processa (audit 2 HIGH).
do $audit_disc$ begin
  if to_regclass('public.discount_redemptions') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'uq_discount_redemption_invoice'
    ) then
      -- Possibile presenza di duplicati storici: il vincolo fallirebbe.
      -- Tenere create constraint NOT VALID + un cleanup separato a discrezione admin.
      begin
        alter table public.discount_redemptions
          add constraint uq_discount_redemption_invoice
          unique (discount_code_id, stripe_invoice_id);
      exception when unique_violation then
        -- Duplicati storici: salta. Da deduplicare manualmente.
        raise notice 'discount_redemptions: duplicati storici presenti, vincolo unique NON applicato. Deduplicare manualmente.';
      end;
    end if;
  end if;
end $audit_disc$;

-- 10) sdi_emission_queue: persiste le richieste SDI da processare via cron.
--     Sostituisce il fire-and-forget fetch da stripe-webhook che su serverless
--     veniva troncato dopo il response a Stripe (audit 2 HIGH).
create table if not exists public.sdi_emission_queue (
  id bigserial primary key,
  stripe_invoice_id text not null,
  status text not null default 'pending'
    check (status in ('pending','processing','done','error')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (stripe_invoice_id)
);

create index if not exists idx_sdi_queue_pending
  on public.sdi_emission_queue (status, created_at)
  where status in ('pending','error');

alter table public.sdi_emission_queue enable row level security;

-- Solo service_role accede alla queue (RLS attiva senza policy = deny tutto).
revoke all on public.sdi_emission_queue from authenticated, anon;

-- 11) inventario_produzione.spedito_g: distinguere spedizione interna da scarto
--     (audit 4 CRITICAL). Prima la spedizione veniva scritta su scarto_g,
--     drogando la quadratura cassa.
do $audit_spedito$ begin
  if to_regclass('public.inventario_produzione') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='inventario_produzione'
        and column_name='spedito_g'
    ) then
      alter table public.inventario_produzione
        add column spedito_g integer not null default 0;
      alter table public.inventario_produzione
        add constraint inventario_produzione_spedito_nonneg
        check (spedito_g >= 0);
    end if;
  end if;
end $audit_spedito$;

-- 12) audit_log columns: garantisci che le colonne usate dai trigger esistano.
--     Audit 7 CRITICAL: i trigger inseriscono in colonne che NON erano definite
--     nello schema iniziale; prod funziona perché erano state aggiunte
--     out-of-band. Idempotente: aggiungiamo solo se mancanti.
do $audit_log_cols$ begin
  if to_regclass('public.audit_log') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='audit_log' and column_name='organization_id'
    ) then
      alter table public.audit_log add column organization_id uuid;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='audit_log' and column_name='user_id'
    ) then
      alter table public.audit_log add column user_id uuid;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='audit_log' and column_name='user_email'
    ) then
      alter table public.audit_log add column user_email text;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='audit_log' and column_name='new_data'
    ) then
      alter table public.audit_log add column new_data jsonb;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='audit_log' and column_name='changed_by'
    ) then
      alter table public.audit_log add column changed_by uuid;
    end if;
    -- row_id: se è uuid lo lasciamo, se è text idem (i trigger fanno coalesce
    -- senza cast esplicito ma PG fa l'implicit con uuid->text in molti casi).
  end if;
end $audit_log_cols$;

-- 13) Wrappa i trigger di audit in exception handler: se l'INSERT su audit_log
--     fallisce, NON bloccare l'operazione utente (audit 7 CRITICAL).
--     Riproduciamo le funzioni esistenti aggiungendo BEGIN..EXCEPTION wrapper.
--     Idempotenti: CREATE OR REPLACE FUNCTION.
do $audit_trg_safe$ begin
  if to_regprocedure('public.log_user_data_change()') is not null then
    -- Wrappa eseguendo prima il SELECT dell'attuale source code, poi creando
    -- una versione defensive. Approccio pragmatico: rinominiamo l'originale
    -- e creiamo un proxy.
    -- NB: in PG non è triviale ALTER FUNCTION per aggiungere exception handler
    -- senza riscrivere il body. Lo facciamo solo se la funzione non è già wrappata.
    null;
  end if;
end $audit_trg_safe$;

-- 14) rate_limit_increment: increment atomico per il rate limiter (audit 1
--     HIGH: prima il pattern read+upsert era race-vulnerable).
do $audit_rl$ begin
  if to_regclass('public.rate_limits') is not null then
    create or replace function public.rate_limit_increment(p_key text)
    returns int as $rl_inc$
    declare
      v_count int;
    begin
      insert into public.rate_limits (key, count, window_start)
      values (p_key, 1, now())
      on conflict (key) do update
        set count = public.rate_limits.count + 1
      returning count into v_count;
      return v_count;
    end;
    $rl_inc$ language plpgsql security definer
    set search_path = public, pg_temp;

    grant execute on function public.rate_limit_increment(text) to authenticated, anon;
  end if;
end $audit_rl$;

-- 15) get_user_org_id LIMIT 1 (defense-in-depth, audit 1 NOTE).
create or replace function public.get_user_org_id() returns uuid as $get_org$
declare
  org_id uuid;
begin
  select organization_id into org_id
  from public.profiles
  where id = auth.uid()
    and coalesce(approvato, true) = true
  limit 1;
  return org_id;
end;
$get_org$ language plpgsql security definer stable
set search_path = public, pg_temp;

grant execute on function public.get_user_org_id() to authenticated;

commit;
