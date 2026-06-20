-- =========================================================================
-- Audit 2026-06-19 CRITICAL: PIN brute-force enforcement
-- =========================================================================
-- Il filone 18/06 ha aggiunto le colonne pin_failed_count + pin_locked_until
-- (vedi 20260618_dipendente_pin_login.sql) MA `verify_dipendente_pin` non le
-- aggiorna mai sui miss → l'unica protezione attiva era il rate-limit per-IP
-- in /api/pin-login (10 tentativi/15min). Bypassabile con rotazione proxy.
--
-- Per un PIN a 4 cifre (10.000 combinazioni) + rate limit ~960 tentativi/24h,
-- bastano ~10 giorni di proxy rotation per esaurire lo spazio chiavi.
--
-- Fix: incremento pin_failed_count su ogni miss; lock 15 min dopo 5 fallimenti
-- consecutivi per-account. log_pin_attempt resta per audit globale per-org.
-- =========================================================================

create or replace function public.verify_dipendente_pin(
  p_org_slug text,
  p_pin text
) returns uuid as $verify_pin$
declare
  v_user_id uuid;
  v_hash text;
  v_locked timestamptz;
  v_failed int;
  v_org_id uuid;
  v_match_user_id uuid := null;
  v_candidates_with_pin int := 0;
begin
  if p_pin !~ '^[0-9]{4,6}$' then return null; end if;

  select id into v_org_id from public.organizations
  where slug = p_org_slug or id::text = p_org_slug
  limit 1;
  if v_org_id is null then return null; end if;

  -- Cerca un match tra i dipendenti dell'org. Conta i candidati con PIN attivo
  -- e non locked: serve per decidere se incrementare i contatori di failure
  -- (se TUTTI sono locked, non incrementiamo — sarebbe un loop infinito di lock).
  for v_user_id, v_hash, v_locked, v_failed in
    select id, pin_hash, pin_locked_until, pin_failed_count
    from public.profiles
    where organization_id = v_org_id
      and ruolo = 'dipendente'
      and pin_hash is not null
      and coalesce(approvato, true) = true
  loop
    if v_locked is not null and v_locked > now() then
      continue;
    end if;
    v_candidates_with_pin := v_candidates_with_pin + 1;
    if v_hash = crypt(p_pin, v_hash) then
      v_match_user_id := v_user_id;
      exit;
    end if;
  end loop;

  if v_match_user_id is not null then
    -- Match: reset failed + update last_used per l'utente trovato.
    update public.profiles
    set pin_failed_count = 0,
        pin_last_used_at = now(),
        pin_locked_until = null
    where id = v_match_user_id;
    return v_match_user_id;
  end if;

  -- Nessun match. Incrementa pin_failed_count su TUTTI i candidati non-locked
  -- (non sappiamo chi stava cercando di entrare → puniamo l'org intera).
  -- Lock a 15 min dopo 5 fallimenti consecutivi per-account.
  if v_candidates_with_pin > 0 then
    update public.profiles
    set pin_failed_count = coalesce(pin_failed_count, 0) + 1,
        pin_locked_until = case
          when coalesce(pin_failed_count, 0) + 1 >= 5 then now() + interval '15 minutes'
          else pin_locked_until
        end
    where organization_id = v_org_id
      and ruolo = 'dipendente'
      and pin_hash is not null
      and coalesce(approvato, true) = true
      and (pin_locked_until is null or pin_locked_until <= now());
  end if;

  return null;
end;
$verify_pin$ language plpgsql security definer
set search_path = public, pg_temp;

-- Grant invariato: solo service_role può chiamarla.
revoke all on function public.verify_dipendente_pin(text, text) from public, anon, authenticated;
grant execute on function public.verify_dipendente_pin(text, text) to service_role;
