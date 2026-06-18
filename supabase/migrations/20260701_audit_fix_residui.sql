-- Audit 17 giu — batch finale residui (MEDIUM/LOW espliciti dai 3 audit
-- precedenti, mai chiusi nei batch 95b327d/a81f94d/6d657a2/a54f232).
--
-- Tutte idempotenti, dollar-quote nominati, niente UTF8 box-drawing.
-- Pattern statement-separati per CHECK (parser SQL editor Supabase ostile
-- agli inline su ADD COLUMN).

-- ---------------------------------------------------------------------------
-- 1) competitor_prices CHECK: prezzo >= 0, distance_km >= 0
--    (audit MED 12 giu): user puo' inserire prezzi negativi via UI, corrompe
--    confronti AI e medie.
-- ---------------------------------------------------------------------------
do $cp_check$ begin
  if to_regclass('public.competitor_prices') is not null then
    alter table public.competitor_prices
      drop constraint if exists comp_prices_prezzo_nn;
    alter table public.competitor_prices
      add constraint comp_prices_prezzo_nn
      check (prezzo is null or prezzo >= 0);

    alter table public.competitor_prices
      drop constraint if exists comp_prices_distance_nn;
    alter table public.competitor_prices
      add constraint comp_prices_distance_nn
      check (distance_km is null or distance_km >= 0);
  end if;
end $cp_check$;

-- ---------------------------------------------------------------------------
-- 2) brain_conversations RLS per user_id
--    (audit MED 12 giu): policy oggi e' org-scope -> titolare puo' leggere
--    conversazioni del dipendente nella stessa org. Le conversazioni sono
--    personali per natura: stringiamo a user_id = auth.uid().
-- ---------------------------------------------------------------------------
do $brain_rls$ begin
  if to_regclass('public.brain_conversations') is not null then
    drop policy if exists brain_all_org on public.brain_conversations;
    -- SELECT/INSERT/UPDATE/DELETE solo sulle proprie conversazioni, all'interno
    -- della propria org. Doppio gate: org match + user match.
    create policy brain_own_user on public.brain_conversations
      for all
      using (
        user_id = auth.uid()
        and organization_id in (
          select organization_id from public.profiles where id = auth.uid()
        )
      )
      with check (
        user_id = auth.uid()
        and organization_id in (
          select organization_id from public.profiles where id = auth.uid()
        )
      );
  end if;
end $brain_rls$;

-- ---------------------------------------------------------------------------
-- 3) whatsapp_links UNIQUE per-org (no piu' globale)
--    (audit MED 12 giu): unique globale su phone_number permette intra-org
--    probing: inserisci un numero, se INSERT fallisce con unique_violation
--    sai che esiste altrove. Cambiamo a (organization_id, phone_number).
-- ---------------------------------------------------------------------------
do $wa_unique$ begin
  if to_regclass('public.whatsapp_links') is not null then
    drop index if exists public.uq_wa_phone;
    create unique index if not exists uq_wa_org_phone
      on public.whatsapp_links (organization_id, phone_number);
  end if;
end $wa_unique$;

-- ---------------------------------------------------------------------------
-- 4) audit_log retention policy
--    (audit MED 12 giu): audit_log cresce indefinitamente. Funzione di
--    cleanup richiamabile da cron (>= 180 giorni). Idempotente.
-- ---------------------------------------------------------------------------
do $audit_retention$ begin
  if to_regclass('public.audit_log') is not null then
    create or replace function public.audit_log_cleanup_old(p_days int default 180)
    returns bigint as $cleanup_body$
    declare
      v_deleted bigint;
    begin
      delete from public.audit_log
      where created_at < (now() - (p_days || ' days')::interval);
      get diagnostics v_deleted = row_count;
      return v_deleted;
    end;
    $cleanup_body$ language plpgsql security definer
    set search_path = public, pg_temp;

    -- Solo service_role puo' invocarla (cron-cleanup notturno).
    revoke all on function public.audit_log_cleanup_old(int) from public, anon, authenticated;
    grant execute on function public.audit_log_cleanup_old(int) to service_role;
  end if;
end $audit_retention$;

-- ---------------------------------------------------------------------------
-- 5) cron_runs dedup table per idempotenza Vercel retry
--    (audit MED 12 giu): Vercel cron puo' ritrigger lo stesso job se il
--    primo lock supera la finestra. Tabella di lock con (job_name, day) UNIQUE
--    + helper RPC che alza unique_violation se gia' eseguito.
-- ---------------------------------------------------------------------------
create table if not exists public.cron_runs (
  job_name text not null,
  run_date date not null default current_date,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','error')),
  error_message text,
  primary key (job_name, run_date)
);

alter table public.cron_runs enable row level security;
-- service_role bypassa RLS; per default nessun grant ad authenticated/anon.
revoke all on public.cron_runs from public, anon, authenticated;
grant select, insert, update on public.cron_runs to service_role;

create or replace function public.cron_run_claim(p_job_name text)
returns boolean as $claim$
begin
  insert into public.cron_runs (job_name, run_date, started_at, status)
  values (p_job_name, current_date, now(), 'running');
  return true;
exception
  when unique_violation then
    return false; -- gia' eseguito oggi
end;
$claim$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.cron_run_claim(text) from public, anon, authenticated;
grant execute on function public.cron_run_claim(text) to service_role;

create or replace function public.cron_run_mark(p_job_name text, p_status text, p_error text default null)
returns void as $mark$
begin
  update public.cron_runs
  set status = p_status,
      completed_at = now(),
      error_message = p_error
  where job_name = p_job_name and run_date = current_date;
end;
$mark$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.cron_run_mark(text, text, text) from public, anon, authenticated;
grant execute on function public.cron_run_mark(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6) Trigger audit_log con exception handler (CRITICAL #2 residuo 17 giu)
--    (audit 7 CRITICAL): se INSERT su audit_log fallisce per qualsiasi
--    motivo (FK, NOT NULL, disk full), non vogliamo bloccare l'operazione
--    utente. Wrap completo della funzione log_user_data_change con BEGIN/
--    EXCEPTION/END che ingoia tutto in WARNING.
--    Nella migration precedente (20260630 sez 13) c'era solo lo stub;
--    qui scriviamo il body completo.
-- ---------------------------------------------------------------------------
do $audit_trg_wrap$ begin
  if to_regprocedure('public.log_user_data_change()') is not null then
    create or replace function public.log_user_data_change()
    returns trigger as $log_body$
    declare
      v_actor uuid;
    begin
      begin
        v_actor := auth.uid();
      exception when others then
        v_actor := null;
      end;

      begin
        insert into public.audit_log (
          actor_id, organization_id, action, table_name,
          row_id, old_data, new_data, created_at
        )
        values (
          v_actor,
          coalesce(new.organization_id, old.organization_id),
          tg_op,
          tg_table_name,
          coalesce(new.id::text, old.id::text),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
          now()
        );
      exception when others then
        -- Audit failure non blocca: log su Postgres notice level.
        raise warning 'audit_log insert failed for table %: %', tg_table_name, sqlerrm;
      end;

      return coalesce(new, old);
    end;
    $log_body$ language plpgsql security definer
    set search_path = public, pg_temp;
  end if;
end $audit_trg_wrap$;

-- ---------------------------------------------------------------------------
-- 7) Index su error_log (admin filter MED): permette filtri rapidi
--    per endpoint + codice da pannello admin.
-- ---------------------------------------------------------------------------
do $errlog_idx$ begin
  if to_regclass('public.error_log') is not null then
    create index if not exists idx_error_log_endpoint_code
      on public.error_log (endpoint, status_code, created_at desc);
  end if;
end $errlog_idx$;

-- ---------------------------------------------------------------------------
-- 8) Index su ai_usage_daily per query budget hot path
-- ---------------------------------------------------------------------------
do $ai_usage_idx$ begin
  if to_regclass('public.ai_usage_daily') is not null then
    create index if not exists idx_ai_usage_org_day
      on public.ai_usage_daily (organization_id, day desc);
  end if;
end $ai_usage_idx$;

-- ---------------------------------------------------------------------------
-- 8b) feedback + audit_log forensic fields (client_ip + user_agent)
--     Audit 2026-07-01 HIGH: feedback inbox + admin actions hanno valore
--     forensico solo se possiamo correlare IP. Aggiungiamo le colonne se
--     mancanti.
-- ---------------------------------------------------------------------------
do $feedback_forensic$ begin
  if to_regclass('public.feedback') is not null then
    alter table public.feedback add column if not exists client_ip text;
  end if;
  if to_regclass('public.audit_log') is not null then
    alter table public.audit_log add column if not exists client_ip text;
    alter table public.audit_log add column if not exists user_agent text;
  end if;
end $feedback_forensic$;

-- ---------------------------------------------------------------------------
-- 9) Index su pos_scontrini per dedup hot path (org, provider, data, numero)
--    NB: gia' c'e' unique partial. Aggiungiamo solo composite per query freq.
-- ---------------------------------------------------------------------------
do $pos_idx$ begin
  if to_regclass('public.pos_scontrini') is not null then
    create index if not exists idx_pos_org_data
      on public.pos_scontrini (organization_id, data desc);
  end if;
end $pos_idx$;

-- ---------------------------------------------------------------------------
-- 10) sdi_invoice_log: aggiungere stati 'partial_fic_created' (invoice creata
--     su FiC ma errore prima del completamento) e 'emessa_non_trasmessa'
--     (creata ma trasmissione SDI fallita). Audit 2026-07-01 HIGH+LOW.
-- ---------------------------------------------------------------------------
do $sdi_states$ begin
  if to_regclass('public.sdi_invoice_log') is not null then
    alter table public.sdi_invoice_log
      drop constraint if exists sdi_invoice_log_status_check;
    alter table public.sdi_invoice_log
      add constraint sdi_invoice_log_status_check
      check (status in (
        'pending','emessa','emessa_non_trasmessa','partial_fic_created',
        'trasmessa_sdi','accettata_sdi','scartata_sdi','annullata','errore'
      ));
  end if;
end $sdi_states$;

-- ---------------------------------------------------------------------------
-- 11) admin_org_cascade_delete: rimuovere marketplace_listings (non ha
--     organization_id — e' catalogo shared, listings sono pubbliche).
--     Audit 2026-07-01 CRITICAL DB.
-- ---------------------------------------------------------------------------
do $cascade_fix$ begin
  if to_regprocedure('public.admin_org_cascade_delete(uuid)') is not null then
    -- Riscriviamo la funzione con array corretto. Idempotente: CREATE OR REPLACE.
    create or replace function public.admin_org_cascade_delete(p_org_id uuid)
    returns table(table_name text, rows_deleted bigint) as $cascade_body$
    declare
      v_tables text[] := array[
        'user_data', 'turni', 'dipendenti', 'dipendenti_stipendio',
        'fornitori', 'ordini_fornitori', 'righe_ordine', 'notifiche',
        'integrazioni', 'sync_log', 'fatture', 'note_giornaliere', 'referral',
        'daily_briefs', 'ai_suggestions', 'brain_conversations',
        'recipe_inventions', 'forecast_giornaliero', 'cashflow_eventi',
        'competitor_prices', 'documentary_snapshots', 'whatsapp_links',
        'extracted_invoices', 'pos_scontrini', 'haccp_temperature',
        'haccp_checklist_log', 'costi_aziendali', 'scadenzario_pagamenti',
        'inventario_produzione', 'stock_prodotti_finiti',
        'movimenti_stock_pf', 'vendite_b2b', 'sdi_invoice_log',
        'sdi_emission_queue', 'trasferimenti', 'ai_usage_daily',
        'view_usage_daily', 'feedback', 'audit_log', 'error_log',
        'plan_pricing_log', 'discount_redemptions', 'login_attempts',
        'rate_limits', 'admin_log', 'org_inviti', 'sedi'
      ];
      v_table text;
      v_rows_deleted bigint;
      v_sql text;
    begin
      foreach v_table in array v_tables loop
        if to_regclass('public.' || v_table) is null then
          continue;
        end if;
        begin
          v_sql := 'delete from public.' || quote_ident(v_table) ||
                   ' where organization_id = $1';
          execute v_sql using p_org_id;
          get diagnostics v_rows_deleted = row_count;
          table_name := v_table;
          rows_deleted := v_rows_deleted;
          return next;
        exception when others then
          -- Tabella senza organization_id: skip e segnala 0 righe.
          table_name := v_table;
          rows_deleted := -1;
          return next;
        end;
      end loop;

      -- Profili e organization a fine. profiles -> ON DELETE CASCADE da
      -- organizations, ma esplicitiamo per atomicita'.
      delete from public.profiles where organization_id = p_org_id;
      get diagnostics v_rows_deleted = row_count;
      table_name := 'profiles';
      rows_deleted := v_rows_deleted;
      return next;

      delete from public.organizations where id = p_org_id;
      get diagnostics v_rows_deleted = row_count;
      table_name := 'organizations';
      rows_deleted := v_rows_deleted;
      return next;
    end;
    $cascade_body$ language plpgsql security definer
    set search_path = public, pg_catalog, pg_temp;

    revoke all on function public.admin_org_cascade_delete(uuid) from public, anon, authenticated;
    grant execute on function public.admin_org_cascade_delete(uuid) to service_role;
  end if;
end $cascade_fix$;

-- ---------------------------------------------------------------------------
-- 12) search_path su funzioni con argomenti: la migration 20260630 ha provato
--     `alter function name()` (no args) → exception silenziosa, search_path
--     non applicato. Rifacciamo con signature corrette. Audit 2026-07-01 HIGH.
-- ---------------------------------------------------------------------------
do $sp_args$ begin
  if to_regprocedure('public.increment_discount_redemption(uuid)') is not null then
    alter function public.increment_discount_redemption(uuid)
      set search_path = public, pg_catalog, pg_temp;
  end if;
  if to_regprocedure('public.is_chiave_operativa(text)') is not null then
    alter function public.is_chiave_operativa(text)
      set search_path = public, pg_catalog, pg_temp;
  end if;
  if to_regprocedure('public.inventario_venduto_giornaliero(uuid, text, date)') is not null then
    alter function public.inventario_venduto_giornaliero(uuid, text, date)
      set search_path = public, pg_catalog, pg_temp;
  end if;
  if to_regprocedure('public.get_user_org_id()') is not null then
    alter function public.get_user_org_id()
      set search_path = public, pg_catalog, pg_temp;
  end if;
  if to_regprocedure('public.fn_audit_organizations()') is not null then
    alter function public.fn_audit_organizations()
      set search_path = public, pg_catalog, pg_temp;
  end if;
end $sp_args$;

-- ---------------------------------------------------------------------------
-- 13) vendite_b2b: FK su sede_id (audit HIGH DB)
-- ---------------------------------------------------------------------------
do $vb2b_fk$ begin
  if to_regclass('public.vendite_b2b') is not null and to_regclass('public.sedi') is not null then
    alter table public.vendite_b2b
      drop constraint if exists vendite_b2b_sede_fk;
    alter table public.vendite_b2b
      add constraint vendite_b2b_sede_fk
      foreign key (sede_id) references public.sedi(id) on delete set null;
  end if;
end $vb2b_fk$;

-- ---------------------------------------------------------------------------
-- 14) extracted_invoices: FK su sede_id (audit LOW DB)
-- ---------------------------------------------------------------------------
do $exi_fk$ begin
  if to_regclass('public.extracted_invoices') is not null and to_regclass('public.sedi') is not null then
    alter table public.extracted_invoices
      drop constraint if exists extracted_inv_sede_fk;
    alter table public.extracted_invoices
      add constraint extracted_inv_sede_fk
      foreign key (sede_id) references public.sedi(id) on delete set null;
  end if;
end $exi_fk$;

-- ---------------------------------------------------------------------------
-- 15) CHECK constraint vari per integrita business (audit MED DB)
-- ---------------------------------------------------------------------------
do $checks_misc$ begin
  if to_regclass('public.costi_aziendali') is not null then
    alter table public.costi_aziendali
      drop constraint if exists costi_az_importo_nonneg;
    alter table public.costi_aziendali
      add constraint costi_az_importo_nonneg
      check (importo >= 0);
  end if;

  if to_regclass('public.dipendenti') is not null then
    alter table public.dipendenti
      drop constraint if exists dipendenti_stipendio_lordo_nonneg;
    alter table public.dipendenti
      add constraint dipendenti_stipendio_lordo_nonneg
      check (stipendio_lordo_mensile is null or stipendio_lordo_mensile >= 0);

    alter table public.dipendenti
      drop constraint if exists dipendenti_stipendio_netto_nonneg;
    alter table public.dipendenti
      add constraint dipendenti_stipendio_netto_nonneg
      check (stipendio_netto_mensile is null or stipendio_netto_mensile >= 0);
  end if;

  if to_regclass('public.haccp_apparecchi') is not null then
    alter table public.haccp_apparecchi
      drop constraint if exists haccp_app_range_check;
    alter table public.haccp_apparecchi
      add constraint haccp_app_range_check
      check (temp_min is null or temp_max is null or temp_min <= temp_max);
  end if;

  if to_regclass('public.pos_scontrini') is not null then
    alter table public.pos_scontrini
      drop constraint if exists pos_scontrini_totale_nonneg;
    alter table public.pos_scontrini
      add constraint pos_scontrini_totale_nonneg
      check (totale_lordo >= 0);
  end if;

  if to_regclass('public.vendite_b2b') is not null then
    alter table public.vendite_b2b
      drop constraint if exists vendite_b2b_totale_nonneg;
    alter table public.vendite_b2b
      add constraint vendite_b2b_totale_nonneg
      check (totale >= 0);
  end if;

  if to_regclass('public.forecast_giornaliero') is not null then
    alter table public.forecast_giornaliero
      drop constraint if exists forecast_range_check;
    alter table public.forecast_giornaliero
      add constraint forecast_range_check
      check (
        qta_min is null or qta_max is null or
        (qta_min <= coalesce(qta_prevista, qta_min) and coalesce(qta_prevista, qta_max) <= qta_max)
      );
  end if;
end $checks_misc$;

-- ---------------------------------------------------------------------------
-- 16) documentary_snapshots: UNIQUE su shareable_slug per evitare collision
--     sul path /d/<slug> tra org diverse. Audit LOW DB.
-- ---------------------------------------------------------------------------
do $doc_slug$ begin
  if to_regclass('public.documentary_snapshots') is not null then
    create unique index if not exists uq_doc_snap_slug
      on public.documentary_snapshots (shareable_slug)
      where shareable_slug is not null;
  end if;
end $doc_slug$;

-- ---------------------------------------------------------------------------
-- 17) plan_pricing CHECK allinearlo con organizations.piano_check
--     organizations: 'trial','base','pro','enterprise','chain'
--     plan_pricing prima: 'pro','chain'. Aggiungere 'base'. Audit MED DB.
-- ---------------------------------------------------------------------------
do $pp_check$ begin
  if to_regclass('public.plan_pricing') is not null then
    alter table public.plan_pricing
      drop constraint if exists plan_pricing_plan_check;
    alter table public.plan_pricing
      add constraint plan_pricing_plan_check
      check (plan in ('base','pro','chain'));
  end if;
end $pp_check$;

-- ---------------------------------------------------------------------------
-- 18) error_log + stripe_webhook_events cleanup function (parallele a
--     audit_log_cleanup_old). Service_role only. Audit LOW DB.
-- ---------------------------------------------------------------------------
do $logs_cleanup$ begin
  if to_regclass('public.error_log') is not null then
    create or replace function public.error_log_cleanup_old(p_days int default 90)
    returns bigint as $errlog_body$
    declare v_deleted bigint;
    begin
      delete from public.error_log
      where created_at < (now() - (p_days || ' days')::interval);
      get diagnostics v_deleted = row_count;
      return v_deleted;
    end;
    $errlog_body$ language plpgsql security definer
    set search_path = public, pg_catalog, pg_temp;

    revoke all on function public.error_log_cleanup_old(int) from public, anon, authenticated;
    grant execute on function public.error_log_cleanup_old(int) to service_role;
  end if;

  if to_regclass('public.stripe_webhook_events') is not null then
    create or replace function public.stripe_webhook_events_cleanup_old(p_days int default 90)
    returns bigint as $stw_body$
    declare v_deleted bigint;
    begin
      delete from public.stripe_webhook_events
      where created_at < (now() - (p_days || ' days')::interval);
      get diagnostics v_deleted = row_count;
      return v_deleted;
    end;
    $stw_body$ language plpgsql security definer
    set search_path = public, pg_catalog, pg_temp;

    revoke all on function public.stripe_webhook_events_cleanup_old(int) from public, anon, authenticated;
    grant execute on function public.stripe_webhook_events_cleanup_old(int) to service_role;
  end if;

  if to_regclass('public.login_attempts') is not null then
    create or replace function public.login_attempts_cleanup_old(p_days int default 90)
    returns bigint as $la_body$
    declare v_deleted bigint;
    begin
      delete from public.login_attempts
      where created_at < (now() - (p_days || ' days')::interval);
      get diagnostics v_deleted = row_count;
      return v_deleted;
    end;
    $la_body$ language plpgsql security definer
    set search_path = public, pg_catalog, pg_temp;

    revoke all on function public.login_attempts_cleanup_old(int) from public, anon, authenticated;
    grant execute on function public.login_attempts_cleanup_old(int) to service_role;
  end if;
end $logs_cleanup$;

-- ---------------------------------------------------------------------------
-- 19) WAVE 2 trigger di audit con BEGIN/EXCEPTION wrap completo. La 20260630
--     sez.13 era solo stub. Qui scriviamo i 5 wrapper richiesti dall'audit:
--     log_user_data_change, log_profile_change, log_sede_change,
--     log_org_change, fn_audit_organizations. Audit 2026-07-01 HIGH DB.
--     NB: log_user_data_change e' gia' coperto in 20260701_audit_fix_residui
--     (sezione 6). Qui solo le altre 4.
-- ---------------------------------------------------------------------------
do $audit_trg_wrap2$ begin
  if to_regprocedure('public.log_profile_change()') is not null then
    create or replace function public.log_profile_change()
    returns trigger as $lpc$
    begin
      begin
        insert into public.audit_log (actor_id, organization_id, action, table_name, row_id, old_data, new_data, created_at)
        values (auth.uid(),
                coalesce(new.organization_id, old.organization_id),
                tg_op, tg_table_name,
                coalesce(new.id::text, old.id::text),
                case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
                case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
                now());
      exception when others then
        raise warning 'audit_log profile insert failed: %', sqlerrm;
      end;
      return coalesce(new, old);
    end;
    $lpc$ language plpgsql security definer
    set search_path = public, pg_catalog, pg_temp;
  end if;

  if to_regprocedure('public.log_sede_change()') is not null then
    create or replace function public.log_sede_change()
    returns trigger as $lsc$
    begin
      begin
        insert into public.audit_log (actor_id, organization_id, action, table_name, row_id, old_data, new_data, created_at)
        values (auth.uid(),
                coalesce(new.organization_id, old.organization_id),
                tg_op, tg_table_name,
                coalesce(new.id::text, old.id::text),
                case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
                case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
                now());
      exception when others then
        raise warning 'audit_log sede insert failed: %', sqlerrm;
      end;
      return coalesce(new, old);
    end;
    $lsc$ language plpgsql security definer
    set search_path = public, pg_catalog, pg_temp;
  end if;

  if to_regprocedure('public.log_org_change()') is not null then
    create or replace function public.log_org_change()
    returns trigger as $loc$
    begin
      begin
        insert into public.audit_log (actor_id, organization_id, action, table_name, row_id, old_data, new_data, created_at)
        values (auth.uid(),
                coalesce(new.id, old.id),
                tg_op, tg_table_name,
                coalesce(new.id::text, old.id::text),
                case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
                case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
                now());
      exception when others then
        raise warning 'audit_log org insert failed: %', sqlerrm;
      end;
      return coalesce(new, old);
    end;
    $loc$ language plpgsql security definer
    set search_path = public, pg_catalog, pg_temp;
  end if;

  if to_regprocedure('public.fn_audit_organizations()') is not null then
    create or replace function public.fn_audit_organizations()
    returns trigger as $fao$
    begin
      begin
        insert into public.audit_log (actor_id, organization_id, action, table_name, row_id, old_data, new_data, created_at)
        values (auth.uid(),
                coalesce(new.id, old.id),
                tg_op, tg_table_name,
                coalesce(new.id::text, old.id::text),
                case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
                case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
                now());
      exception when others then
        raise warning 'audit_log fn_audit_organizations insert failed: %', sqlerrm;
      end;
      return coalesce(new, old);
    end;
    $fao$ language plpgsql security definer
    set search_path = public, pg_catalog, pg_temp;
  end if;
end $audit_trg_wrap2$;
