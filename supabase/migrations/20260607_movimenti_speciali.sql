-- Movimenti speciali (sprechi e omaggi): la nuova chiave
-- pasticceria-movimenti-speciali-v1 e operativa, quindi un dipendente DEVE
-- poterla scrivere. Aggiorniamo is_chiave_operativa e la label
-- in log_user_data_change per il registro attivita. Idempotente.

create or replace function public.is_chiave_operativa(k text)
returns boolean
language sql immutable
as $fn$
  select k in (
    'pasticceria-magazzino-v1',
    'pasticceria-produzione-v1',
    'pasticceria-giornaliero-v1',
    'pasticceria-chiusure-v1',
    'pasticceria-logrif-v1',
    'pasticceria-movimenti-speciali-v1'
  )
$fn$;
grant execute on function public.is_chiave_operativa(text) to anon, authenticated;

-- Aggiorna log_user_data_change per dare etichetta leggibile alla nuova chiave.
create or replace function public.log_user_data_change()
returns trigger language plpgsql security definer
set search_path = public
as $audit$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_ruolo  text;
  v_org    uuid := coalesce(NEW.organization_id, OLD.organization_id);
  v_sede   uuid := coalesce(NEW.sede_id, OLD.sede_id);
  v_key    text := coalesce(NEW.data_key, OLD.data_key);
  v_op     text := lower(TG_OP);
  v_value  jsonb := coalesce(NEW.data_value, OLD.data_value);
  v_label  text;
  v_meta   jsonb;
begin
  if v_uid is null then
    return coalesce(NEW, OLD);
  end if;

  select email, ruolo into v_email, v_ruolo
  from public.profiles where id = v_uid;

  if v_key = 'pasticceria-magazzino-v1' then
    v_label := 'Magazzino aggiornato';
    v_meta := jsonb_build_object('n_voci', public._jsonb_keys_count(v_value));
  elsif v_key = 'pasticceria-giornaliero-v1' then
    v_label := 'Produzione registrata';
    v_meta := jsonb_build_object('n_sessioni', public._jsonb_array_len(v_value));
  elsif v_key = 'pasticceria-chiusure-v1' then
    v_label := 'Chiusura cassa salvata';
    v_meta := jsonb_build_object('n_chiusure', public._jsonb_array_len(v_value));
  elsif v_key = 'pasticceria-logrif-v1' then
    v_label := 'Rifornimento magazzino';
    v_meta := jsonb_build_object('n_movimenti', public._jsonb_array_len(v_value));
  elsif v_key = 'pasticceria-movimenti-speciali-v1' then
    v_label := 'Sprechi/omaggi aggiornati';
    v_meta := jsonb_build_object('n_movimenti', public._jsonb_array_len(v_value));
  elsif v_key = 'pasticceria-ricettario-v1' then
    v_label := 'Ricettario modificato';
    v_meta := jsonb_build_object(
      'n_ricette',
      public._jsonb_keys_count(
        case when v_value ? 'ricette' then v_value->'ricette' else null end
      )
    );
  elsif v_key = 'pasticceria-semilavorati-v1' then
    v_label := 'Semilavorati modificati';
    v_meta := jsonb_build_object('n_voci', public._jsonb_keys_count(v_value));
  elsif v_key = 'pasticceria-prezzi-importati-v1' then
    v_label := 'Prezzi ingredienti aggiornati';
    v_meta := jsonb_build_object('n_voci', public._jsonb_keys_count(v_value));
  elsif v_key = 'pasticceria-formati-vendita-v1' then
    v_label := 'Formati di vendita aggiornati';
    v_meta := jsonb_build_object('n_formati', public._jsonb_array_len(v_value));
  elsif v_key = 'pasticceria-regole-v1' then
    v_label := 'Regole vendita aggiornate';
    v_meta := jsonb_build_object('n_regole', public._jsonb_keys_count(v_value));
  elsif v_key = 'pasticceria-actions-v1' then
    v_label := 'Azioni AI aggiornate';
    v_meta := '{}'::jsonb;
  elsif v_key = 'pasticceria-ai-v1' then
    v_label := 'Assistente AI aggiornato';
    v_meta := '{}'::jsonb;
  elsif v_key = 'pasticceria-esclusi-v1' then
    v_label := 'Esclusioni aggiornate';
    v_meta := '{}'::jsonb;
  elsif v_key = 'pasticceria-scenario-operativo-v1' then
    v_label := 'Scenario operativo aggiornato';
    v_meta := '{}'::jsonb;
  else
    v_label := concat('Dato aggiornato (', v_key, ')');
    v_meta := '{}'::jsonb;
  end if;

  if v_op = 'delete' then
    v_label := concat('Eliminato: ', v_label);
  end if;

  insert into public.audit_log (
    organization_id, user_id, user_email, table_name, operation,
    row_id, new_data, changed_by, created_at
  ) values (
    v_org, v_uid, v_email, 'user_data',
    concat(v_op, ':', v_key),
    coalesce(NEW.id, OLD.id),
    v_meta || jsonb_build_object(
      'data_key', v_key,
      'sede_id', v_sede,
      'ruolo', v_ruolo,
      'label', v_label
    ),
    v_uid, now()
  );

  return coalesce(NEW, OLD);
end;
$audit$;
