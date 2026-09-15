-- Un dipendente deve vedere SOLO le sue pagine. Anche dal database.
--
-- Il titolare l'ha messa come condizione assoluta, ed è giusta: il personale
-- opera (registra produzione, cassa, sprechi, magazzino) ma non deve vedere
-- quanto costa l'affitto, a quanto si comprano le materie prime, quanto
-- guadagna l'azienda o quanto prende un collega.
--
-- ── Dove stava il buco ─────────────────────────────────────────────────────
--
-- Nell'interfaccia il filtro c'era (l'elenco DIPENDENTE_VIEWS in Dashboard.jsx)
-- ma era una porta di legno: il controllo girava in un `useEffect`, cioè DOPO
-- che React aveva già disegnato la pagina vietata. Per un fotogramma il P&L
-- compariva davvero e le sue richieste al database partivano lo stesso. E la
-- ricerca rapida (Cmd+K) offriva la scorciatoia: si scriveva "stipendi" e
-- usciva "Personale". Quello si corregge nel codice, ed è stato corretto.
--
-- Ma la parete vera è qui. Provato il 15/09/2026 su un'organizzazione con dati
-- veri, dentro una transazione annullata: un dipendente **leggeva 8 righe di
-- `costi_aziendali`** — affitti, utenze, costi fissi. Non da una pagina: con
-- una chiamata diretta, che chiunque sappia aprire gli strumenti del browser
-- può rifare.
--
-- Il pattern è sempre lo stesso, ed è quello che va imparato: **la porta
-- principale era chiusa e la finestra di lato no.** `fatture` escludeva il
-- dipendente, `extracted_invoices` (le stesse fatture, lette dall'OCR) no.
-- `ordini_fornitori` lo escludeva, e `righe_ordine` — dove ci sono i prezzi
-- unitari d'acquisto — si salvava solo per caso, perché la sua regola passa
-- dalla tabella padre.
--
-- ── Cosa si chiude ─────────────────────────────────────────────────────────
--
-- La regola seguita: **il database rispecchia l'interfaccia.** Se una pagina
-- non è nell'elenco del dipendente, i dati di quella pagina non si leggono.
--
--   costi_aziendali     → pagina "Costi aziendali": non è sua. 8 righe vere.
--   extracted_invoices  → sono fatture. `fatture` era già chiusa.
--   competitor_prices   → prezzi dei concorrenti, pagina non sua.
--   benchmarks_anonimi  → confronti di settore, pagina non sua.
--   trasferimenti       → pagina "Trasferimenti": non è sua.
--
-- Restano leggibili, perché servono a pagine che SONO sue: chiusure_cassa e
-- movimenti_cassa (Cassa), stock_prodotti_finiti e inventario_produzione
-- (Produzione e Magazzino), user_data non sensibile.
--
-- Nota su `marketplace_listings`: si lascia com'è. La sua regola è
-- `attivo = true` e basta — è un elenco pubblico di fornitori, uguale per
-- tutti, senza niente dell'azienda dentro.

-- ── costi_aziendali ────────────────────────────────────────────────────────
drop policy if exists costi_az_select_org on public.costi_aziendali;
create policy costi_az_select_org on public.costi_aziendali
  for select using (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  );

drop policy if exists costi_az_write_org on public.costi_aziendali;
create policy costi_az_write_org on public.costi_aziendali
  for all using (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  ) with check (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  );

-- ── extracted_invoices ─────────────────────────────────────────────────────
drop policy if exists extracted_inv_all_org on public.extracted_invoices;
create policy extracted_inv_all_org on public.extracted_invoices
  for all using (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  ) with check (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  );

-- ── competitor_prices ──────────────────────────────────────────────────────
drop policy if exists comp_prices_select_org on public.competitor_prices;
drop policy if exists comp_prices_write_org on public.competitor_prices;
drop policy if exists competitor_prices_own_write on public.competitor_prices;
create policy competitor_prices_own on public.competitor_prices
  for all using (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  ) with check (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  );

-- ── trasferimenti ──────────────────────────────────────────────────────────
-- Nota per domani: se un giorno la pagina Trasferimenti si aprirà al
-- dipendente (perché è lui che riceve il furgone alla sede), questa è la riga
-- da cambiare — e va cambiata QUI, non solo nell'elenco delle pagine.
drop policy if exists trasferimenti_own on public.trasferimenti;
create policy trasferimenti_own on public.trasferimenti
  for all using (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  ) with check (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  );

-- ── benchmarks_anonimi ─────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select polname from pg_policy where polrelid = 'public.benchmarks_anonimi'::regclass
  loop
    execute format('drop policy if exists %I on public.benchmarks_anonimi', r.polname);
  end loop;
end $$;
create policy benchmarks_no_dipendente on public.benchmarks_anonimi
  for select using (not public.is_dipendente());
