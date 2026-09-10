-- Il registro di controllo sulle organizzazioni non registrava più niente.
--
-- COM'ERA: fn_audit_organizations scriveva su `actor_id` e `action`, colonne
-- che in audit_log NON esistono (i nomi veri sono `changed_by` e
-- `operation`). L'insert falliva a ogni scrittura su organizations, e la
-- funzione lo trasformava in un WARNING dentro un blocco exception: quindi
-- l'operazione dell'utente andava a buon fine e nessuno vedeva niente.
-- L'ultima riga registrata è del 19/06/2026: da allora, quasi tre mesi di
-- creazioni, modifiche e cancellazioni di aziende senza traccia.
--
-- Questo è lo stesso difetto trovato dieci volte in questo progetto: una
-- query su una colonna che non c'è, con l'errore ingoiato.
--
-- COSA CAMBIA:
--   1. i nomi delle colonne sono quelli veri;
--   2. la rete di sicurezza resta (un registro rotto non deve bloccare la
--      creazione di un'azienda) MA il fallimento finisce in error_log, che il
--      pannello admin guarda, invece di solo in un warning che nessuno legge.

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
      coalesce(new.id, old.id),
      tg_op,
      tg_table_name,
      coalesce(new.id::text, old.id::text),
      case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
      case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
      now()
    );
  exception when others then
    -- La rete di sicurezza resta, ma non in silenzio: se il registro si
    -- rompe di nuovo, si vede dal pannello errori invece di scoprirlo tre
    -- mesi dopo.
    begin
      insert into public.error_log (endpoint, operation, org_id, code, message, context, created_at)
      values ('trigger:fn_audit_organizations', tg_op, coalesce(new.id, old.id),
              sqlstate, sqlerrm,
              jsonb_build_object('tabella', tg_table_name), now());
    exception when others then null;  -- se anche error_log non risponde, si va avanti
    end;
    raise warning 'audit fn_audit_organizations failed: %', sqlerrm;
  end;
  return coalesce(new, old);
end;
$function$;
