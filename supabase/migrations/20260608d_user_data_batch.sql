-- ════════════════════════════════════════════════════════════════════════════
-- ATOMICITÀ multi-write: scrivere più chiavi user_data in UNA transazione.
-- Prima i flussi produzione/cassa facevano 2 ssave separati (es. magazzino +
-- giornaliero): se il secondo falliva, il primo restava → drift giornaliero↔magazzino.
-- Questa RPC fa gli upsert in un'unica transazione (la chiamata a funzione è atomica).
--
-- Sicurezza:
--   - utente autenticato → organization_id FORZATA dal suo profilo (get_user_org_id):
--     non può scrivere in un'altra org passando p_org (no spoofing). Se è dipendente,
--     può scrivere SOLO chiavi operative (come la RLS).
--   - service_role (auth.uid() null: endpoint server) → usa p_org (verificato lato server).
--   - revoke da anon.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.fos_user_data_set_batch(p_items jsonb, p_org uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_dip  boolean;
  it     jsonb;
  v_key  text;
  v_val  jsonb;
  v_sede uuid;
begin
  if auth.uid() is not null then
    v_org := public.get_user_org_id();   -- org dal profilo: niente spoofing
    v_dip := public.is_dipendente();
  else
    v_org := p_org;                       -- solo service_role arriva qui
    v_dip := false;
  end if;
  if v_org is null then raise exception 'Organizzazione non determinabile'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_key  := it->>'data_key';
    v_val  := it->'data_value';
    v_sede := nullif(it->>'sede_id', '')::uuid;

    -- Un dipendente può scrivere solo chiavi operative (replica la RLS di user_data).
    if v_dip and not public.is_chiave_operativa(v_key) then
      raise exception 'Operazione non consentita sulla chiave %', v_key;
    end if;

    update public.user_data
       set data_value = v_val, updated_at = now()
     where organization_id = v_org and data_key = v_key
       and (sede_id = v_sede or (v_sede is null and sede_id is null));
    if not found then
      insert into public.user_data (organization_id, sede_id, data_key, data_value, updated_at)
      values (v_org, v_sede, v_key, v_val, now());
    end if;
  end loop;
end $$;

revoke execute on function public.fos_user_data_set_batch(jsonb, uuid) from anon;
grant execute on function public.fos_user_data_set_batch(jsonb, uuid) to authenticated;
