-- Audit integrity 2026-06-14 PM: aggiunta `version` su user_data per
-- optimistic concurrency. Senza, 2 utenti dello stesso org/sede che
-- leggono e salvano la stessa chiave in parallelo si sovrascrivono.
-- Causa root del 70% dei "drift" di magazzino/giornaliero/chiusure.
--
-- Modello: ssave include la `version` letta. Su UPDATE WHERE version=$old,
-- se ritorna 0 row = un altro client ha già scritto → ssave rifà sload+merge
-- e ritenta (client-side, in storage.js).
--
-- Idempotente: se la colonna esiste, ALTER fa errore "already exists" che
-- catturiamo. Default 0 per backward compat.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_data' and column_name='version'
  ) then
    alter table public.user_data add column version integer not null default 0;
  end if;
end $$;

-- RPC atomica per UPSERT con version check.
-- - Se non esiste: insert con version=1
-- - Se esiste con version=expected: update + version+1
-- - Se esiste con version != expected: ritorna NULL (caller deve refetch + retry)
create or replace function public.user_data_set_versioned(
  p_org_id uuid,
  p_data_key text,
  p_data_value jsonb,
  p_sede_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_version integer;
  v_uid uuid;
  v_user_org uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'user_data_set_versioned: not authenticated';
  end if;
  -- Verifica org match con il profile chiamante (defense-in-depth oltre RLS)
  select organization_id into v_user_org from public.profiles where id = v_uid;
  if v_user_org is null or v_user_org != p_org_id then
    raise exception 'user_data_set_versioned: org mismatch';
  end if;
  -- Tentativo: UPDATE con check version
  update public.user_data
    set data_value = p_data_value,
        version = version + 1,
        updated_at = now()
    where organization_id = p_org_id
      and data_key = p_data_key
      and sede_id is not distinct from p_sede_id
      and version = p_expected_version
    returning version into v_new_version;
  if v_new_version is not null then
    return v_new_version;
  end if;
  -- Nessuna row aggiornata → o non esiste, o version mismatch.
  -- Se non esiste, expected deve essere 0 → insert con version 1.
  if p_expected_version = 0 and not exists (
    select 1 from public.user_data
    where organization_id = p_org_id and data_key = p_data_key
      and sede_id is not distinct from p_sede_id
  ) then
    insert into public.user_data (organization_id, data_key, data_value, sede_id, version, updated_at)
    values (p_org_id, p_data_key, p_data_value, p_sede_id, 1, now())
    on conflict (organization_id, data_key, sede_id) do nothing
    returning version into v_new_version;
    if v_new_version is not null then return v_new_version; end if;
  end if;
  -- Version mismatch: ritorna NULL → caller fa refetch+retry
  return null;
end;
$$;

grant execute on function public.user_data_set_versioned(uuid, text, jsonb, uuid, integer) to authenticated;

comment on function public.user_data_set_versioned is
'Optimistic concurrency UPSERT su user_data. Ritorna nuova version (>0) se OK, NULL se mismatch (caller refetch+retry). Audit 2026-06-14.';
