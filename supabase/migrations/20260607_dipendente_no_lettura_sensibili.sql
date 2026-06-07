-- ════════════════════════════════════════════════════════════════════════════
-- SICUREZZA: il DIPENDENTE non può LEGGERE i dati sensibili (oltre al gate UI).
-- "Dipendente" = profiles.ruolo='dipendente' (funzione is_dipendente()).
-- Barriera a livello DB: anche bypassando l'interfaccia, l'API nega i dati.
-- Idempotente. Il service_role (server) bypassa la RLS, quindi i job server restano ok.
-- Versione paste-safe: un solo livello di dollar-quoting ($$), niente quoting annidato.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Funzione: chiavi user_data sensibili (dietro viste vietate ai dipendenti) ──
create or replace function public.is_chiave_sensibile(k text)
returns boolean language sql immutable
set search_path = public
as $$
  select k = any (array[
    'pasticceria-ai-v1',
    'pasticceria-actions-v1',
    'pasticceria-eventi-v1',
    'azienda-pagamenti-v1',
    'pasticceria-organigramma-v1',
    'pasticceria-consuntivo-turni-v1',
    'menu-giorno-v1',
    'pl-costi-fissi-v1'
  ])
$$;
grant execute on function public.is_chiave_sensibile(text) to anon, authenticated;

-- ── 2) user_data: il dipendente non legge le chiavi sensibili ─────────────────
-- (ricettario e 5 chiavi operative restano leggibili: servono a Produzione/Cassa/Magazzino)
do $$
begin
  if to_regclass('public.user_data') is not null then
    execute 'drop policy if exists "data_select_own" on public.user_data';
    execute 'create policy "data_select_own" on public.user_data for select using (organization_id = public.get_user_org_id() and not (public.is_dipendente() and public.is_chiave_sensibile(data_key)))';
  end if;
end $$;

-- ── 3) Tabelle dedicate: vietate ai dipendenti in ogni operazione ─────────────
-- (scadenzario=fatture, fornitori, ordini, vendite/clienti B2B, registro=audit_log)
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['fatture','fornitori','ordini_fornitori','vendite_b2b','clienti_b2b','audit_log'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format('create policy %I on public.%I for all using (organization_id = public.get_user_org_id() and not public.is_dipendente()) with check (organization_id = public.get_user_org_id() and not public.is_dipendente())', t || '_solo_titolare', t);
    end if;
  end loop;
end $$;

-- ── 4) righe_ordine: protetta in modo transitivo (no organization_id proprio) ─
do $$
declare p record;
begin
  if to_regclass('public.righe_ordine') is not null then
    execute 'alter table public.righe_ordine enable row level security';
    for p in select policyname from pg_policies where schemaname='public' and tablename='righe_ordine' loop
      execute format('drop policy if exists %I on public.righe_ordine', p.policyname);
    end loop;
    execute 'create policy righe_ordine_solo_titolare on public.righe_ordine for all using (not public.is_dipendente() and ordine_id in (select id from public.ordini_fornitori where organization_id = public.get_user_org_id())) with check (not public.is_dipendente() and ordine_id in (select id from public.ordini_fornitori where organization_id = public.get_user_org_id()))';
  end if;
end $$;
