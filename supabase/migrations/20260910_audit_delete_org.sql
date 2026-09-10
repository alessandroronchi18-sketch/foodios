-- Registrare la cancellazione di un'azienda senza rendere la cancellazione
-- impossibile.
--
-- COSA E' SUCCESSO. Appena corretto fn_audit_organizations (che scriveva su
-- colonne inesistenti e non registrava niente da tre mesi), cancellare
-- un'azienda ha iniziato a FALLIRE: la riga di registro porta
-- `organization_id` con un vincolo verso organizations, e quell'azienda in
-- quel momento non esiste più. Lo stesso vale per log_ricettario_change,
-- che scatta sui dati cancellati a cascata.
--
-- Non è un problema del vincolo: è che su una cancellazione l'azienda non si
-- può referenziare. L'informazione però non si perde — l'id resta in `row_id`
-- e i dati in `old_data`, che è esattamente il posto giusto per una riga di
-- registro che dice "questa azienda è stata cancellata".
--
-- Quindi: su DELETE si scrive organization_id = NULL, e l'id vero sta nel
-- corpo della riga.

create or replace function public.fn_audit_organizations()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  begin
    insert into public.audit_log (
      changed_by, organization_id, operation, table_name, row_id,
      old_data, new_data, created_at
    )
    values (
      auth.uid(),
      -- Su DELETE nessun riferimento: l'azienda non c'è più. L'id resta in
      -- row_id e i dati completi in old_data.
      case when tg_op = 'DELETE' then null else new.id end,
      tg_op,
      tg_table_name,
      coalesce(new.id::text, old.id::text),
      case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
      case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
      now()
    );
  exception when others then
    begin
      insert into public.error_log (endpoint, operation, org_id, code, message, context, created_at)
      values ('trigger:fn_audit_organizations', tg_op,
              case when tg_op = 'DELETE' then null else new.id end,
              sqlstate, sqlerrm, jsonb_build_object('tabella', tg_table_name), now());
    exception when others then null;
    end;
    raise warning 'audit fn_audit_organizations failed: %', sqlerrm;
  end;
  return coalesce(new, old);
end;
$function$;

-- Stessa cosa per il registro delle modifiche al ricettario: quando l'azienda
-- viene cancellata, i suoi dati se ne vanno a cascata e questo trigger
-- scatta su righe di un'azienda che non esiste più.
-- Qui aggiungiamo anche la rete di sicurezza che mancava del tutto: un
-- registro che si rompe non deve impedire di salvare un ricettario.
create or replace function public.log_ricettario_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    v_op text;
    v_org uuid;
    v_uid uuid;
    v_email text;
  begin
    v_op := lower(tg_op);
    v_org := coalesce(new.organization_id, old.organization_id);
    v_uid := auth.uid();
    select email into v_email from auth.users where id = v_uid;

    -- Solo per la chiave del ricettario (riduce il rumore).
    if (new is not null and new.data_key <> 'pasticceria-ricettario-v1')
       and (old is null or old.data_key <> 'pasticceria-ricettario-v1')
    then
      return coalesce(new, old);
    end if;

    begin
      insert into public.audit_log (organization_id, user_id, user_email, table_name, operation, row_id, new_data, changed_by, created_at)
      values (
        -- Su DELETE l'azienda può essere in corso di cancellazione: nessun
        -- riferimento, l'id resta nel corpo della riga.
        case when tg_op = 'DELETE' then null else v_org end,
        v_uid, v_email, 'user_data', 'ricettario_' || v_op, coalesce(new.id, old.id),
        jsonb_build_object(
          'data_key', coalesce(new.data_key, old.data_key),
          'sede_id',  coalesce(new.sede_id, old.sede_id),
          'organization_id', v_org,
          'n_ricette', case when new.data_value ? 'ricette'
                            then jsonb_array_length(jsonb_path_query_array(new.data_value, '$.ricette.keyvalue().key'))
                            else null end
        ),
        v_uid, now()
      );
    exception when others then
      -- Un registro rotto non deve impedire di salvare il ricettario: è il
      -- lavoro dell'utente, e viene prima della nostra tracciabilità.
      begin
        insert into public.error_log (endpoint, operation, org_id, code, message, created_at)
        values ('trigger:log_ricettario_change', tg_op,
                case when tg_op = 'DELETE' then null else v_org end,
                sqlstate, sqlerrm, now());
      exception when others then null;
      end;
      raise warning 'log_ricettario_change failed: %', sqlerrm;
    end;
    return coalesce(new, old);
  end;
  $function$;
