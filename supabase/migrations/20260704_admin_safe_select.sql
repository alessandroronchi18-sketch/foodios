-- =========================================================================
-- Admin SQL editor: RPC che esegue una query SELECT dinamica e ritorna le
-- righe come jsonb. La validation di safety è lato Node (api/admin.js
-- validateSafeSelectSQL): qui c'è solo l'esecuzione dinamica.
--
-- Sicurezza: solo service_role può chiamare. Limite hard 500 righe enforced
-- da Node (LIMIT injection). search_path fisso, no funzioni esposte.
-- =========================================================================

create or replace function public.admin_safe_select(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_query is null or length(p_query) > 4500 then
    raise exception 'query non valida';
  end if;
  -- Esegue il SELECT dinamico aggregando le righe in jsonb array.
  -- Wrappiamo in jsonb_agg per uniformità (anche su 0 righe ritorna []).
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', p_query)
    into v_result;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.admin_safe_select(text) from public, anon, authenticated;
grant execute on function public.admin_safe_select(text) to service_role;
