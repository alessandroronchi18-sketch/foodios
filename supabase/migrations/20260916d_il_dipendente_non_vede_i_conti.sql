-- Le due funzioni che «puliscono» i dati per il dipendente lasciano passare i
-- conti, e quattro funzioni non si accorgono che un dipendente è stato sospeso.
--
-- Trovato il 16/09/2026 con l'audit di sicurezza, leggendo il database di
-- produzione in sola lettura. Sono difetti della stessa famiglia: non si entra
-- da fuori, si resta dentro più di quanto si dovrebbe.
--
--
-- ── 1. Il food cost esce lo stesso ──────────────────────────────────────────
--
-- Il dipendente non può leggere `pasticceria-ricettario-v1` (sta in
-- `is_chiave_sensibile`): la RLS glielo nega. Legge invece la versione
-- ripulita da `fos_ricettario_dip()`, e il commento in `src/Dashboard.jsx`
-- (riga ~1309) dice cosa si aspetta:
--
--     «ricettario e giornaliero arrivano SANITIZZATI dal server
--      (senza ingredienti/quantità/costi/ingredientiUsati)»
--
-- Solo che la funzione toglie `ingredienti_costi` e, dentro ogni ricetta,
-- `ingredienti` e `ingredienti_semilavorati` — e lascia `foodCost1`, che è il
-- food cost della ricetta. Cioè proprio il numero per cui esiste l'elenco
-- delle chiavi sensibili.
--
-- Misurato il 16/09/2026, ricette che portano `foodCost1` fuori:
--     Mara dei Boschi       58 ricette su 58   (7 con un valore diverso da zero)
--     Pasticceria Mara 1    23 su 23
--     Gelateria Demo        15 su 15
--
-- Il prezzo di vendita resta, ed è voluto: è scritto sul cartellino in
-- vetrina, il dipendente lo legge dieci volte al giorno, e le sue schermate lo
-- usano davvero (`REGOLE[r.nome] = { unita, prezzo, tipo }`, Dashboard.jsx
-- riga ~1353). Il food cost no: prezzo meno food cost è il margine, e il
-- margine è del titolare.
--
-- Stesso difetto in `fos_giornaliero_dip(p_sede)`: toglie `fcTot` e
-- `ingredientiUsati`, lascia `ricavoTot` — l'incasso della giornata. Oggi ce
-- l'hanno due giornate (Mara dei Boschi, Pasticceria Mara 1), ma è la stessa
-- dimenticanza, e la prossima volta sarà su tutte.
--
-- Perché era sfuggito: `tests/08-accessi-dipendenti.spec.js` prova che
-- `ingredienti` e `ingredienti_costi` non escano. Sono le due cose che la
-- funzione toglie. Il test misurava quello che il codice faceva, non quello
-- che doveva fare.
--
-- La correzione cambia il verso del filtro: da «togli queste» a **«fai passare
-- solo queste»**. Un elenco di cose da togliere si dimentica di aggiornare —
-- è esattamente quello che è successo; un elenco di cose che passano, quando
-- ci si dimentica, nasconde un campo in più. Sbagliare per eccesso di
-- prudenza, in una funzione che esiste per nascondere, è il verso giusto.
--
-- ATTENZIONE per chi aggiungerà un campo al ricettario o al giornaliero: se
-- serve anche in laboratorio, va aggiunto all'elenco qui sotto, altrimenti il
-- dipendente non lo vedrà. Se è un numero che parla di soldi, non aggiungerlo.
--
--
-- ── 2. Il dipendente sospeso lavora ancora ──────────────────────────────────
--
-- In «Personale → Laboratori» c'è il pulsante «Sospendi»
-- (`src/components/Personale.jsx` riga ~1738): mette `approvato = false`, e
-- l'etichetta diventa «Sospeso». Il titolare legge «sospeso» e pensa: è fuori.
--
-- Il database la pensa uguale: `get_user_org_id()` chiede
-- `coalesce(approvato, true) = true`, quindi per un sospeso risponde NULL e
-- ogni regola di riga lo taglia fuori. Ma quattro funzioni SECURITY DEFINER
-- non passano da lì: si leggono l'azienda da sole, con
--
--     select organization_id from public.profiles where id = auth.uid()
--
-- e basta — senza guardare `approvato`. Girano in SECURITY DEFINER, quindi la
-- RLS non le ferma. Il token di chi è stato sospeso resta valido (i JWT non si
-- accorgono di niente: durano un'ora e si rinnovano), e il tablet del
-- laboratorio in mano a chi se n'è andato continua a poter:
--
--   `ai_usage_increment`  scrivere spesa AI a nome dell'azienda. Il tetto è
--                         5,00 $ al giorno (`api/lib/aiBudget.js`), e il
--                         parametro `p_cost_usd` lo decide chi chiama: una
--                         chiamata sola con 5 e l'assistente dell'azienda si
--                         spegne fino a domani. Nessuno se ne accorge: la
--                         risposta al titolare è «per oggi l'assistente ha
--                         lavorato abbastanza».
--   `suggestion_set_state` archiviare i suggerimenti dell'AI del titolare
--                         («rifiutato», con una motivazione a scelta).
--   `brief_mark_opened`   segnare come già letto il riepilogo del mattino, che
--                         così sparisce dalla schermata del titolare.
--   `track_view_open`     gonfiare le statistiche di utilizzo.
--
-- Quanto è grave oggi: nessuno è sospeso. Il 16/09/2026 tutti e 579 i profili
-- hanno `approvato = true`. Non è mai successo, e si corregge adesso proprio
-- perché costa niente: il giorno in cui un titolare licenzia qualcuno, il
-- pulsante «Sospendi» deve fare quello che dice.
--
-- La correzione è una riga per funzione: chiedere l'azienda a
-- `get_user_org_id()`, che è l'unico posto dove la regola «approvato» è
-- scritta. Due porte non devono mai avere due definizioni di «chi è dentro» —
-- è lo stesso difetto corretto lo stesso giorno in `api/lib/auth.js`.
--
--
-- ── 3. Due funzioni che nessuno chiama più ──────────────────────────────────
--
-- `ai_usage_increment()` e `ai_usage_today_total()` sono rimaste eseguibili da
-- `anon` e da `authenticated`, ma il prodotto non le usa più da nessuna parte
-- (cercato in `src/` e in `api/`): il server passa da
-- `ai_usage_increment_org(p_org, …)` e `ai_usage_today_total_org(p_org)`, che
-- sono di `service_role` soltanto. Sono superficie di attacco e basta, e sono
-- la superficie da cui si spegne l'assistente di un'azienda. Si toglie il
-- permesso; il corpo resta corretto, per chi dovesse rimetterlo.
--
-- Migrazione additiva e ripetibile: si può applicare due volte.


-- ── 1a. Il ricettario che vede il laboratorio ───────────────────────────────
create or replace function public.fos_ricettario_dip()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'ricette',
    coalesce(
      (select jsonb_object_agg(e.key, coalesce(
         (select jsonb_object_agg(c.key, c.value)
          from jsonb_each(case when jsonb_typeof(e.value) = 'object' then e.value else '{}'::jsonb end) as c
          where c.key in (
            -- Quello che serve per produrre e per vendere al banco.
            'nome', 'categoria', 'tipo', 'unita', 'prezzo',
            'numStampi', 'totImpasto1', 'resa_g',
            'note', 'allergeni', 'allergeniDaVerificare', 'congelabile',
            'sheetName', 'ingredientiNonRiconosciuti'
          )),
         '{}'::jsonb))
       from jsonb_each(coalesce(v.dv->'ricette', '{}'::jsonb)) as e),
      '{}'::jsonb
    )
  )
  from (
    select data_value as dv
    from public.user_data
    where organization_id = public.get_user_org_id()
      and data_key = 'pasticceria-ricettario-v1'
      and sede_id is null
    order by updated_at desc
    limit 1
  ) v
$function$;

-- ── 1b. Lo storico di produzione che vede il laboratorio ────────────────────
create or replace function public.fos_giornaliero_dip(p_sede uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select jsonb_agg(coalesce(
       (select jsonb_object_agg(c.key, c.value)
        from jsonb_each(case when jsonb_typeof(elem) = 'object' then elem else '{}'::jsonb end) as c
        where c.key in (
          -- Cosa si è prodotto, quando, e dov'è andato. Nessun numero di soldi.
          'id', 'data', 'creataAt', 'note', 'ricette', 'prodotti',
          'destinazioneSedeId', 'destinazioneSedeNome', 'daEvento', '_demo'
        )),
       '{}'::jsonb))
     from jsonb_array_elements(v.dv) as elem),
    '[]'::jsonb
  )
  from (
    select data_value as dv
    from public.user_data
    where organization_id = public.get_user_org_id()
      and data_key = 'pasticceria-giornaliero-v1'
      and (sede_id = p_sede or (p_sede is null and sede_id is null))
    order by updated_at desc
    limit 1
  ) v
  where jsonb_typeof(v.dv) = 'array'
$function$;


-- ── 2. «Sospeso» vuol dire sospeso, anche per queste quattro ────────────────
create or replace function public.ai_usage_increment(
  p_feature text, p_tokens_in integer default 0,
  p_tokens_out integer default 0, p_cost_usd numeric default 0)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org_id uuid;
begin
  v_org_id := public.get_user_org_id();
  if v_org_id is null then return; end if;
  insert into public.ai_usage_daily (
    organization_id, date, feature, calls,
    tokens_in_estimated, tokens_out_estimated, cost_usd_estimated, last_call_at
  ) values (
    v_org_id, current_date, coalesce(p_feature, 'generic'), 1,
    coalesce(p_tokens_in, 0), coalesce(p_tokens_out, 0), coalesce(p_cost_usd, 0), now()
  )
  on conflict (organization_id, date, feature)
  do update set
    calls = ai_usage_daily.calls + 1,
    tokens_in_estimated = ai_usage_daily.tokens_in_estimated + coalesce(p_tokens_in, 0),
    tokens_out_estimated = ai_usage_daily.tokens_out_estimated + coalesce(p_tokens_out, 0),
    cost_usd_estimated = ai_usage_daily.cost_usd_estimated + coalesce(p_cost_usd, 0),
    last_call_at = now();
end;
$function$;

create or replace function public.ai_usage_today_total()
 returns numeric
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_total numeric;
begin
  v_org_id := public.get_user_org_id();
  if v_org_id is null then return 0; end if;
  select coalesce(sum(cost_usd_estimated), 0) into v_total
  from public.ai_usage_daily
  where organization_id = v_org_id and date = current_date;
  return v_total;
end;
$function$;

create or replace function public.track_view_open(p_view_name text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org_id uuid;
begin
  v_org_id := public.get_user_org_id();
  if v_org_id is null then
    return;
  end if;
  insert into public.view_usage_daily (organization_id, user_id, view_name, date, open_count, last_opened_at)
  values (v_org_id, auth.uid(), p_view_name, current_date, 1, now())
  on conflict (organization_id, user_id, view_name, date)
  do update set
    open_count = view_usage_daily.open_count + 1,
    last_opened_at = now();
end;
$function$;

create or replace function public.brief_mark_opened(brief_id uuid)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update public.daily_briefs
  set opened_at = coalesce(opened_at, now())
  where id = brief_id
    and organization_id = public.get_user_org_id();
$function$;

create or replace function public.suggestion_set_state(sugg_id uuid, new_state text, reason text default null)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update public.ai_suggestions
  set stato = new_state,
      dismissed_at = case
        when new_state = 'rifiutato' then now()
        else dismissed_at
      end,
      dismissed_reason = case
        when new_state = 'rifiutato' then reason
        else dismissed_reason
      end,
      acted_at = case
        when new_state = 'agito' then now()
        else acted_at
      end
  where id = sugg_id
    and organization_id = public.get_user_org_id()
    and new_state in ('nuovo','letto','agito','rifiutato','scaduto');
$function$;


-- ── 3. Permessi ────────────────────────────────────────────────────────────
-- Le due funzioni AI di prima: nessuno le chiama dal browser, e da lì si
-- spegne l'assistente di un'azienda. Restano al server.
revoke execute on function public.ai_usage_increment(text, integer, integer, numeric) from public, anon, authenticated;
grant  execute on function public.ai_usage_increment(text, integer, integer, numeric) to service_role;
revoke execute on function public.ai_usage_today_total() from public, anon, authenticated;
grant  execute on function public.ai_usage_today_total() to service_role;

-- Le altre le chiama il browser, ma sempre con un utente dentro: `anon` non
-- serve a nessuna delle tre.
revoke execute on function public.track_view_open(text) from public, anon;
grant  execute on function public.track_view_open(text) to authenticated, service_role;
revoke execute on function public.brief_mark_opened(uuid) from public, anon;
grant  execute on function public.brief_mark_opened(uuid) to authenticated, service_role;
revoke execute on function public.suggestion_set_state(uuid, text, text) from public, anon;
grant  execute on function public.suggestion_set_state(uuid, text, text) to authenticated, service_role;

-- Le due «dip» le chiama il dipendente dal browser: restano com'erano, con
-- `anon` che comunque non ottiene niente (`get_user_org_id()` è NULL).
revoke execute on function public.fos_ricettario_dip() from public, anon;
grant  execute on function public.fos_ricettario_dip() to authenticated, service_role;
revoke execute on function public.fos_giornaliero_dip(uuid) from public, anon;
grant  execute on function public.fos_giornaliero_dip(uuid) to authenticated, service_role;
