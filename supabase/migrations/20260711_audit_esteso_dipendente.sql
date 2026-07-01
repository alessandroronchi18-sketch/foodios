-- ════════════════════════════════════════════════════════════════════════════
-- AUDIT ESTESO — traccia ogni azione dipendente su tabelle dedicate
-- ════════════════════════════════════════════════════════════════════════════
-- Il vecchio audit_log tracciava solo scritture su user_data (magazzino,
-- produzione, chiusure, ricettario). Le operazioni che passano per tabelle
-- dedicate (stock_prodotti_finiti, haccp_temperature, trasferimenti, etc.)
-- non erano loggate → un dipendente che registra 200 movimenti PF era
-- invisibile nell'audit.
--
-- Aggiunge triggers su: stock_prodotti_finiti, trasferimenti, haccp_temperature,
-- haccp_checklist_log. Ogni riga logga user_id + user_email + operazione + delta.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Helper: logga una riga sull'audit_log in modo uniforme ───────────────────
create or replace function public._audit_log_row(
  p_org uuid,
  p_table text,
  p_op text,
  p_row_id text,
  p_label text,
  p_meta jsonb
) returns void as $log_row$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_ruolo text;
begin
  if v_uid is null then return; end if;
  select email, ruolo into v_email, v_ruolo
  from public.profiles where id = v_uid;

  insert into public.audit_log (
    organization_id, user_id, user_email, table_name, operation,
    row_id, new_data, changed_by, created_at
  ) values (
    p_org, v_uid, v_email, p_table, p_op,
    p_row_id,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('ruolo', v_ruolo, 'label', p_label),
    v_uid, now()
  );
end;
$log_row$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public._audit_log_row(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- ── 1) Trigger su stock_prodotti_finiti (movimenti scorta PF) ────────────────
create or replace function public.log_stock_pf_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $log_pf$
declare
  v_op text := lower(TG_OP);
  v_row record := coalesce(NEW, OLD);
  v_label text;
  v_delta numeric;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := format('Movimento scorta prodotto: %s (%s pz)',
      coalesce(NEW.prodotto_nome, '?'),
      coalesce(NEW.qta_delta::text, '0'));
    v_delta := NEW.qta_delta;
  elsif v_op = 'update' then
    v_label := format('Movimento scorta modificato: %s', coalesce(NEW.prodotto_nome, '?'));
    v_delta := NEW.qta_delta;
  else
    v_label := format('Movimento scorta annullato: %s', coalesce(OLD.prodotto_nome, '?'));
    v_delta := OLD.qta_delta;
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'stock_prodotti_finiti', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'sede_id', coalesce(NEW.sede_id, OLD.sede_id),
      'prodotto', coalesce(NEW.prodotto_nome, OLD.prodotto_nome),
      'delta', v_delta,
      'tipo', coalesce(NEW.tipo, OLD.tipo)
    )
  );
  return coalesce(NEW, OLD);
end;
$log_pf$;

do $mig_pf$ begin
  if to_regclass('public.stock_prodotti_finiti') is not null then
    drop trigger if exists trg_log_stock_pf on public.stock_prodotti_finiti;
    execute 'create trigger trg_log_stock_pf
      after insert or update or delete on public.stock_prodotti_finiti
      for each row execute function public.log_stock_pf_change()';
  end if;
end $mig_pf$;

-- ── 2) Trigger su trasferimenti (spedizioni tra sedi) ────────────────────────
create or replace function public.log_trasferimento_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $log_tra$
declare
  v_op text := lower(TG_OP);
  v_label text;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := format('Trasferimento creato: %s (%s pz)',
      coalesce(NEW.prodotto_nome, '?'),
      coalesce(NEW.qta::text, '0'));
  elsif v_op = 'update' then
    v_label := format('Trasferimento aggiornato: %s (stato: %s)',
      coalesce(NEW.prodotto_nome, '?'),
      coalesce(NEW.stato, '?'));
  else
    v_label := format('Trasferimento annullato: %s', coalesce(OLD.prodotto_nome, '?'));
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'trasferimenti', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'sede_partenza', coalesce(NEW.sede_partenza_id, OLD.sede_partenza_id),
      'sede_arrivo', coalesce(NEW.sede_arrivo_id, OLD.sede_arrivo_id),
      'prodotto', coalesce(NEW.prodotto_nome, OLD.prodotto_nome),
      'qta', coalesce(NEW.qta, OLD.qta),
      'stato', coalesce(NEW.stato, OLD.stato)
    )
  );
  return coalesce(NEW, OLD);
end;
$log_tra$;

do $mig_tra$ begin
  if to_regclass('public.trasferimenti') is not null then
    drop trigger if exists trg_log_trasferimento on public.trasferimenti;
    execute 'create trigger trg_log_trasferimento
      after insert or update or delete on public.trasferimenti
      for each row execute function public.log_trasferimento_change()';
  end if;
end $mig_tra$;

-- ── 3) Trigger su haccp_temperature (rilevazioni frigo/congelatore/vetrina) ──
create or replace function public.log_haccp_temperature_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $log_ht$
declare
  v_op text := lower(TG_OP);
  v_label text;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := format('Rilevata temperatura: %s C', coalesce(NEW.temperatura::text, '?'));
    if NEW.fuori_range = true then
      v_label := v_label || ' (FUORI RANGE)';
    end if;
  elsif v_op = 'update' then
    v_label := 'Rilevazione temperatura modificata';
  else
    v_label := 'Rilevazione temperatura eliminata';
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'haccp_temperature', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'apparecchio_id', coalesce(NEW.apparecchio_id, OLD.apparecchio_id),
      'temperatura', coalesce(NEW.temperatura, OLD.temperatura),
      'fuori_range', coalesce(NEW.fuori_range, OLD.fuori_range),
      'operatore', coalesce(NEW.operatore, OLD.operatore)
    )
  );
  return coalesce(NEW, OLD);
end;
$log_ht$;

do $mig_ht$ begin
  if to_regclass('public.haccp_temperature') is not null then
    drop trigger if exists trg_log_haccp_temperature on public.haccp_temperature;
    execute 'create trigger trg_log_haccp_temperature
      after insert or update or delete on public.haccp_temperature
      for each row execute function public.log_haccp_temperature_change()';
  end if;
end $mig_ht$;

-- ── 4) Trigger su haccp_checklist_log (pulizie/task completati) ──────────────
create or replace function public.log_haccp_checklist_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $log_hc$
declare
  v_op text := lower(TG_OP);
  v_label text;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := 'Task HACCP completato';
  elsif v_op = 'update' then
    v_label := 'Task HACCP aggiornato';
  else
    v_label := 'Task HACCP eliminato';
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'haccp_checklist_log', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'template_id', coalesce(NEW.template_id, OLD.template_id),
      'operatore', coalesce(NEW.operatore, OLD.operatore),
      'esito', coalesce(NEW.esito, OLD.esito)
    )
  );
  return coalesce(NEW, OLD);
end;
$log_hc$;

do $mig_hc$ begin
  if to_regclass('public.haccp_checklist_log') is not null then
    drop trigger if exists trg_log_haccp_checklist on public.haccp_checklist_log;
    execute 'create trigger trg_log_haccp_checklist
      after insert or update or delete on public.haccp_checklist_log
      for each row execute function public.log_haccp_checklist_change()';
  end if;
end $mig_hc$;

-- ── 5) Trigger su vendite_b2b (fatturazione clienti B2B) ─────────────────────
create or replace function public.log_vendita_b2b_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $log_vb$
declare
  v_op text := lower(TG_OP);
  v_label text;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := format('Vendita B2B registrata: %s',
      coalesce(NEW.cliente_nome, NEW.numero_documento, '?'));
  elsif v_op = 'update' then
    v_label := format('Vendita B2B modificata: %s', coalesce(NEW.numero_documento, '?'));
  else
    v_label := format('Vendita B2B eliminata: %s', coalesce(OLD.numero_documento, '?'));
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'vendite_b2b', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'cliente', coalesce(NEW.cliente_nome, OLD.cliente_nome),
      'documento', coalesce(NEW.numero_documento, OLD.numero_documento),
      'totale', coalesce(NEW.totale, OLD.totale)
    )
  );
  return coalesce(NEW, OLD);
end;
$log_vb$;

do $mig_vb$ begin
  if to_regclass('public.vendite_b2b') is not null then
    drop trigger if exists trg_log_vendita_b2b on public.vendite_b2b;
    execute 'create trigger trg_log_vendita_b2b
      after insert or update or delete on public.vendite_b2b
      for each row execute function public.log_vendita_b2b_change()';
  end if;
end $mig_vb$;
