-- Registro attivita - chi ha fatto cosa quando.
-- Tracciamento automatico (trigger DB) di tutte le scritture in user_data,
-- profiles, sedi e organizations. Non aggirabile lato client perche vive nel DB.
-- Riepilogo compatto (chi/quando/ruolo/azione/dati salienti) per non gonfiare lo storage.
-- Idempotente: safe da rieseguire.

-- Helper per riepiloghi.
create or replace function public._jsonb_keys_count(j jsonb)
returns int language sql immutable
as $fn$
  select case
    when j is null then 0
    when jsonb_typeof(j) <> 'object' then 0
    else (select count(*) from jsonb_object_keys(j))::int
  end
$fn$;

create or replace function public._jsonb_array_len(j jsonb)
returns int language sql immutable
as $fn$
  select case
    when j is null then 0
    when jsonb_typeof(j) <> 'array' then 0
    else jsonb_array_length(j)
  end
$fn$;

-- Funzione di logging per user_data (sostituisce il vecchio trigger solo-ricettario).
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
  -- Senza utente identificato (service role, cron) non logghiamo (rumore).
  if v_uid is null then
    return coalesce(NEW, OLD);
  end if;

  select email, ruolo into v_email, v_ruolo
  from public.profiles where id = v_uid;

  -- Riepilogo per tipo di dato (etichetta leggibile + 1-2 numeri salienti).
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

-- Sostituisci il vecchio trigger solo-ricettario con quello generico.
drop trigger if exists trg_user_data_ricettario_audit on public.user_data;
drop trigger if exists trg_log_user_data on public.user_data;
create trigger trg_log_user_data
after insert or update or delete on public.user_data
for each row execute function public.log_user_data_change();

-- Logging per cambi di profilo (ruolo/approvato/email).
create or replace function public.log_profile_change()
returns trigger language plpgsql security definer
set search_path = public
as $audit$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_ruolo text;
  v_changes jsonb := '{}'::jsonb;
  v_label text;
begin
  if v_uid is null then
    return coalesce(NEW, OLD);
  end if;

  select email, ruolo into v_email, v_ruolo
  from public.profiles where id = v_uid;

  if TG_OP = 'UPDATE' then
    if NEW.ruolo is distinct from OLD.ruolo then
      v_changes := v_changes || jsonb_build_object(
        'ruolo', jsonb_build_array(OLD.ruolo, NEW.ruolo)
      );
    end if;
    if NEW.approvato is distinct from OLD.approvato then
      v_changes := v_changes || jsonb_build_object(
        'approvato', jsonb_build_array(OLD.approvato, NEW.approvato)
      );
    end if;
    if NEW.organization_id is distinct from OLD.organization_id then
      v_changes := v_changes || jsonb_build_object(
        'organization_id',
        jsonb_build_array(OLD.organization_id, NEW.organization_id)
      );
    end if;
    if v_changes = '{}'::jsonb then
      return NEW;
    end if;
    v_label := concat('Profilo ', coalesce(NEW.email, OLD.email), ' modificato');
  elsif TG_OP = 'INSERT' then
    v_label := concat('Profilo ', NEW.email, ' creato');
  else
    v_label := concat('Profilo ', OLD.email, ' eliminato');
  end if;

  insert into public.audit_log (
    organization_id, user_id, user_email, table_name, operation,
    row_id, new_data, changed_by, created_at
  ) values (
    coalesce(NEW.organization_id, OLD.organization_id),
    v_uid, v_email, 'profiles', lower(TG_OP),
    coalesce(NEW.id, OLD.id),
    jsonb_build_object(
      'target_email', coalesce(NEW.email, OLD.email),
      'target_ruolo', coalesce(NEW.ruolo, OLD.ruolo),
      'ruolo', v_ruolo,
      'changes', v_changes,
      'label', v_label
    ),
    v_uid, now()
  );
  return coalesce(NEW, OLD);
end;
$audit$;

drop trigger if exists trg_log_profile on public.profiles;
create trigger trg_log_profile
after insert or update or delete on public.profiles
for each row execute function public.log_profile_change();

-- Logging per cambi di sedi (creazione/modifica/eliminazione).
create or replace function public.log_sede_change()
returns trigger language plpgsql security definer
set search_path = public
as $audit$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_ruolo text;
  v_label text;
begin
  if v_uid is null then
    return coalesce(NEW, OLD);
  end if;

  select email, ruolo into v_email, v_ruolo
  from public.profiles where id = v_uid;

  if TG_OP = 'INSERT' then
    v_label := concat('Sede creata: ', NEW.nome);
  elsif TG_OP = 'UPDATE' then
    if NEW.nome is distinct from OLD.nome
       or NEW.attiva is distinct from OLD.attiva
       or NEW.is_default is distinct from OLD.is_default then
      v_label := concat('Sede aggiornata: ', NEW.nome);
    else
      return NEW;
    end if;
  else
    v_label := concat('Sede eliminata: ', OLD.nome);
  end if;

  insert into public.audit_log (
    organization_id, user_id, user_email, table_name, operation,
    row_id, new_data, changed_by, created_at
  ) values (
    coalesce(NEW.organization_id, OLD.organization_id),
    v_uid, v_email, 'sedi', lower(TG_OP),
    coalesce(NEW.id, OLD.id),
    jsonb_build_object(
      'nome', coalesce(NEW.nome, OLD.nome),
      'attiva', coalesce(NEW.attiva, OLD.attiva),
      'is_default', coalesce(NEW.is_default, OLD.is_default),
      'ruolo', v_ruolo,
      'label', v_label
    ),
    v_uid, now()
  );
  return coalesce(NEW, OLD);
end;
$audit$;

drop trigger if exists trg_log_sede on public.sedi;
create trigger trg_log_sede
after insert or update or delete on public.sedi
for each row execute function public.log_sede_change();

-- Logging per organizations (solo cambi di piano/nome/attivo).
create or replace function public.log_org_change()
returns trigger language plpgsql security definer
set search_path = public
as $audit$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_ruolo text;
  v_changes jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    return NEW;
  end if;

  if TG_OP <> 'UPDATE' then
    return NEW;
  end if;

  select email, ruolo into v_email, v_ruolo
  from public.profiles where id = v_uid;

  if NEW.piano is distinct from OLD.piano then
    v_changes := v_changes || jsonb_build_object(
      'piano', jsonb_build_array(OLD.piano, NEW.piano)
    );
  end if;
  if NEW.nome is distinct from OLD.nome then
    v_changes := v_changes || jsonb_build_object(
      'nome', jsonb_build_array(OLD.nome, NEW.nome)
    );
  end if;
  if NEW.attivo is distinct from OLD.attivo then
    v_changes := v_changes || jsonb_build_object(
      'attivo', jsonb_build_array(OLD.attivo, NEW.attivo)
    );
  end if;
  if NEW.approvato is distinct from OLD.approvato then
    v_changes := v_changes || jsonb_build_object(
      'approvato', jsonb_build_array(OLD.approvato, NEW.approvato)
    );
  end if;
  if v_changes = '{}'::jsonb then
    return NEW;
  end if;

  insert into public.audit_log (
    organization_id, user_id, user_email, table_name, operation,
    row_id, new_data, changed_by, created_at
  ) values (
    NEW.id, v_uid, v_email, 'organizations', 'update',
    NEW.id,
    jsonb_build_object(
      'changes', v_changes,
      'ruolo', v_ruolo,
      'label', concat('Organizzazione aggiornata: ', NEW.nome)
    ),
    v_uid, now()
  );
  return NEW;
end;
$audit$;

drop trigger if exists trg_log_org on public.organizations;
create trigger trg_log_org
after update on public.organizations
for each row execute function public.log_org_change();

-- Lettura del registro: solo titolare (un dipendente non lo deve vedere).
drop policy if exists "audit_read_own" on public.audit_log;
create policy "audit_read_own" on public.audit_log
for select using (
  organization_id in (
    select organization_id from public.profiles where id = auth.uid()
  )
  and not public.is_dipendente()
);

-- Indice extra per filtro per utente.
create index if not exists idx_audit_log_org_user_created
on public.audit_log (organization_id, user_id, created_at desc);
