# FoodOS — Roadmap AI: dettaglio implementativo delle 33 feature residue
> Documento operativo (non strategico). Per la visione di alto livello vedi STRATEGIA_AI_FEATURES.md.

## Indice rapido
- Tier A (Quick wins): 6 feature
- Tier B (Game changers): 10 feature
- Tier C (Moonshot): 7 feature
- Tier D (Wildcard): 5 idee non-codice
- Tier E (Moat): 4 deep moat plays
- **Totale**: 32 (A1 e B2 sono già fatti — Daily Brief, AI Suggestions; le altre 33 elencate)

Per ognuna trovi: **Obiettivo · UX · Stack · Effort · Metriche · Rischi · Dipendenze**.

---

## Tier A — Quick wins (1-3 settimane)

### A2. Onboarding conversazionale
**Obiettivo** — Sostituire wizard rigido con chat che capisce il contesto.

**UX** —
- Schermata bianca con bolla AI: *"Ciao! Per partire ho bisogno di sapere 3 cose. Ti aiuto. Come si chiama la tua attività?"*
- L'AI fa domande una alla volta, accetta risposte libere, estrae con NLP (tipo attività, sedi, numero dipendenti, prodotti tipici).
- Skip e salto contestuale: se utente dice "ho 1 sede" non chiede secondo step.
- Completamento: l'AI riassume *"Ok perfetto: pasticceria con 1 sede a Torino, 2 dipendenti, ricettario da caricare. Ti porto in dashboard?"*

**Stack** — Claude Haiku (cheap), tool-use per scrivere su `organizations`/`sedi`/`profiles`.

**Effort** — 2 settimane (UI chat + parsing + integration).

**Metriche di successo** —
- Onboarding completion rate: 35% → 70%+
- Tempo medio: 8min → 4min
- Drop-off: misurato su tabella `onboarding_events` (da aggiungere)

**Rischi** — Hallucination su parsing (mitigato: estrai → mostra conferma editabile).

**Dipendenze** — Nessuna nuova. Sostituisce OnboardingWizard.jsx esistente.

---

### A3. AI Reply suggerito ai feedback / recensioni
**Obiettivo** — Aiutare il titolare a rispondere a recensioni Google Maps/social in 30 secondi invece di 15 minuti.

**UX** —
- Tab "Recensioni" nella sezione Marketing/Azienda.
- Card per ogni review: testo originale → 3 bottoni "Genera risposta" con tono (formale/caldo/fattuale).
- Risposta editabile prima di copiare/condividere. Bottone "Copia" o "Pubblica su Google" (Google My Business API).

**Stack** — Claude Sonnet (qualità tono), Google Business Profile API (read reviews + post reply), tabella `recensioni` per cache.

**Effort** — 1 settimana (no GBP API) / 3 settimane (con GBP integration).

**Metriche** — % recensioni risposte (~30% media settore → target 80%).

**Rischi** — Google API rate limit, OAuth complesso (rinvio v2).

**Dipendenze** — Da fare senza Google API in v1: il titolare incolla testo recensione, l'AI risponde.

---

### A4. Briefing settimanale (riassunto del lunedì mattina)
**Obiettivo** — Estensione del Daily Brief: ogni lunedì mattina invia un riassunto della settimana scorsa con KPI + 1 insight strategico.

**UX** —
- Stesso template email del Daily Brief ma più ricco: KPI hero (ricavi/FC/margine), top/dog prodotti, 1 grafico mini, 1 azione strategica.
- Versione web: pagina "Report settimanale" archivio.

**Stack** — Riusa `cron-daily-brief.js` con tipo='settimanale' se `dayOfWeek === 1`. Claude prompt diverso (più narrativo, meno operativo).

**Effort** — 4 giorni (riusa l'80% del Daily Brief).

**Metriche** — Open rate email > 60%, click-through > 20%.

**Rischi** — Stesso del Daily Brief.

**Dipendenze** — Daily Brief già fatto.

---

### A5. Search globale AI ("cerca tutto")
**Obiettivo** — Una barra di ricerca in topbar che capisce intent e naviga/risponde.

**UX** —
- Cmd+K (desktop) o tap icona lente → modal centrale con input.
- Quattro modalità:
  1. **Naviga**: *"food cost"* → suggerisce view "P&L"
  2. **Trova**: *"cannolo siciliano"* → apre la ricetta
  3. **Calcola**: *"food cost cannolo questo mese"* → mostra il numero in modal
  4. **Azione**: *"crea ricetta tiramisù"* → apre Nuova ricetta precompilata
- Cronologia ricerche recenti.

**Stack** — Claude Haiku con tool-use (4 tools: `navigate`, `search_recipe`, `query_kpi`, `create_recipe`). Database vector embedding opzionale per ricette (Supabase pgvector).

**Effort** — 2-3 settimane (interfaccia + 4 tools + indexing ricette).

**Metriche** — % utenti che usano Cmd+K almeno 1×/settimana > 40%.

**Rischi** — UX cattiva se l'AI sbaglia intent. Fallback: mostra sempre i risultati nudi sotto.

**Dipendenze** — Nessuna. Top-priority per UX moderna.

---

### A6. AI esplica P&L ("perché il margine è sceso?")
**Obiettivo** — Trasformare i KPI inerti in narrazione.

**UX** —
- Bottone 🤖 piccolo accanto a ogni KPI in P&L/Storico/Confronto sedi.
- Click → modal: 2 paragrafi che spiegano il numero usando i dati sottostanti.
- *"Il food cost di giugno è 33% perché:* 1) cannolo siciliano vende +40% e ha FC 38% (sopra media), 2) il pistacchio bronte è salito a €58/kg (+12% vs maggio), 3) settimana 24 c'è stata una sessione con resa anomala (forse errore inserimento?)."*

**Stack** — Claude Sonnet (richiede ragionamento), client fa un fetch dei dati pertinenti + prompt strutturato. No nuova tabella.

**Effort** — 1 settimana per primo KPI (food cost), poi 2 giorni per ogni KPI aggiuntivo.

**Metriche** — Click rate bottone "spiega" > 30% degli utenti settimanalmente. NPS qualitativo.

**Rischi** — Hallucination (mitigato: prompt esplicito "usa SOLO i dati nel payload").

**Dipendenze** — Nessuna. È la naturale estensione del Daily Brief.

---

### A7. AI categorization fatture in entrata (OCR fornitore)
**Obiettivo** — Eliminare data-entry su fatture fornitore.

**UX** —
- Modulo "Fatture" → bottone "Carica fattura" (foto/PDF).
- Claude Vision estrae: ragione sociale, P.IVA, data, scadenza, importo lordo/netto/IVA, righe ingredienti.
- Auto-match fornitore esistente (fuzzy) o crea nuovo.
- Auto-categoria (MP/utenze/manutenzione/affitto) con confidence score.
- L'utente conferma in 5 secondi, salva. Tutto già pre-compilato.

**Stack** — Claude Vision (`anthropic-version: 2023-06-01`, vision-enabled), tabella `fatture_estratti` per audit log, tabella esistente `fatture` per salvataggio.

**Effort** — 2-3 settimane (parser robusto su 5-10 layout fatture italiane).

**Metriche** — % fatture inserite via OCR > 50%; tempo medio inserimento -90%.

**Rischi** — Layout fatture molto vari. Calibrazione iniziale richiede 100+ fatture test.

**Dipendenze** — Claude Vision già attivo (chiusura cassa).

---

## Tier B — Game changers (4-8 settimane)

### B1. AI Forecast vendite con meteo + eventi locali
**Obiettivo** — Il consulente IT di prima fascia gli direbbe: questo è il moat.

**UX** —
- Sezione "Previsione" già esistente (`src/views/PrevisioneView.jsx` se presente, altrimenti nuova).
- Header: *"Domani, sabato 14 giugno"* + meteo + eventi rilevati.
- Tabella: per ogni prodotto/gusto → previsione vendite (range con confidence).
- Bottone "Genera produzione consigliata" → pre-compila la produzione giornaliera.
- Spiegazione AI: *"Domani 28°C piovoso + Juve-Inter ore 21 → -30% vaschette, +20% caffè e brioche"*.

**Stack** —
- Modello statistico ibrido: Prophet (Python su Vercel Edge Functions NO → cron Node) o algoritmo custom JS:
  - Baseline: media mobile 4 settimane stesso giorno
  - Correzione meteo: regressione lineare (Open-Meteo API gratuita)
  - Eventi: scraping calendario manifestazioni comune + Google Calendar fiere
  - Stagionalità: termine sinusoidale annuale
- Tabella `forecast_giornaliero` con id, org_id, sede_id, prodotto, data, qta_prevista, qta_min, qta_max, confidence, fattori_json.
- Cron `cron-forecast-daily.js` esegue ogni notte (3:00 UTC).

**Effort** — 5-6 settimane:
- Settimana 1: dataset cleaning + Open-Meteo integration
- Settimana 2-3: modello statistico + validation backtesting su Mara dei Boschi
- Settimana 4: scraping eventi locali (priorità Torino dove sta il design partner)
- Settimana 5: UI + auto-pre-compile produzione
- Settimana 6: test + ottimizzazione

**Metriche** —
- MAPE (Mean Absolute Percentage Error) < 25% per prodotti top 10
- % utenti che usano "Pre-compila produzione" > 60%
- Sprechi -20% vs baseline

**Rischi** —
- Modello statistico debole con < 6 mesi di dati per cliente (mitigato: usa benchmark settore globale come bayesian prior)
- Eventi locali scraping fragile (mitigato: AI fallback che ammette "evento non rilevato")

**Dipendenze** — Storico chiusure cassa già raccolto. Open-Meteo è gratuito.

---

### B2. Voice-input produzione
**Obiettivo** — *"Claude, oggi ho fatto 12 cassate, 8 bavaresi, manca lo zucchero"* → entry diretta.

**UX** —
- Bottone microfono fluttuante in basso a destra in Produzione/Magazzino/Spreco.
- Tap → registrazione (max 30 sec) → Whisper API → testo.
- Claude parse intent: produzione/spreco/magazzino/note.
- Mostra preview testuale dell'intent estratto: *"Hai detto: 12 cassate + 8 bavaresi. Confermi?"* → tap Conferma → save.

**Stack** —
- OpenAI Whisper API (italiano) — $0.006/min
- Claude Sonnet per parsing intent strutturato (tool-use)
- Tabella `voice_logs` (audit + retraining futuro)

**Effort** — 3-4 settimane:
- Settimana 1: registrazione client (MediaRecorder) + upload
- Settimana 2: integrazione Whisper + parser intent base (produzione)
- Settimana 3: estensione magazzino/spreco/note
- Settimana 4: edge cases (rumore laboratorio, accenti regionali)

**Metriche** —
- % entry produzione fatte via voce > 30% (target utenti che testano)
- Accuracy intent parser > 90%

**Rischi** — Rumore laboratorio = Whisper accuracy bassa. Mitigato: noise gate client-side + retry.

**Dipendenze** — Permission microfono browser (richiede HTTPS — già OK su Vercel).

---

### B3. AI Reformulation engine
**Obiettivo** — *"Voglio cannolo a food cost 26%"* → AI propone modifiche ingredienti/rese.

**UX** —
- Pagina Ricettario → ricetta cannolo → tab "Ottimizza".
- Input: food cost target (slider o numero).
- L'AI propone 3 varianti:
  1. **Sostituzioni ingredienti**: *"Zucchero raffinato → zucchero canna grezzo (-€0.18/cannolo). Test gradimento previsto: -2%"*
  2. **Riduzione rese**: *"Vaniglia da 5g a 4g (-€0.08/cannolo). Impatto sensoriale: minimo"*
  3. **Pricing**: *"Cannolo da €3.20 a €3.60: tieni margine target ma -8% vendite previste"*
- Side-by-side: prima vs dopo.
- Bottone "Applica variante" → modifica la ricetta (con backup automatico).

**Stack** —
- Database tassonomia ingredienti (sostituibilità, profilo gusto)
- Modello statistico per stimare impatto vendita (price elasticity da storico)
- Claude Opus per ragionamento creativo (sostituzioni non ovvie)

**Effort** — 6-8 settimane:
- Settimana 1-2: tassonomia sostituibilità ingredienti (mano + AI)
- Settimana 3-4: modello price elasticity da chiusure
- Settimana 5-6: UI side-by-side + apply with backup
- Settimana 7-8: calibrazione con chef veri (Mara dei Boschi pilota)

**Metriche** — # ottimizzazioni applicate; tempo dall'idea al test ricetta.

**Rischi** — Suggerimenti che cambiano "l'anima" del prodotto. Mitigato: chef veri validano i suggerimenti.

**Dipendenze** — Database HORECA prezzi (già 427 ingredienti). Storico chiusure.

---

### B4. AI Auto-ordine fornitore
**Obiettivo** — Generare ordine ottimale settimanale al fornitore preferito.

**UX** —
- Ogni venerdì mattina → notifica "Ho preparato l'ordine settimanale".
- Tab "Ordini AI" mostra l'ordine pronto: per ogni ingrediente → qtà ottimale (formula EOQ + safety stock), fornitore consigliato (per prezzo storico), totale.
- L'utente può editare quantità o swappare fornitore. Bottone "Invia via email" → manda PDF DDT al fornitore.

**Stack** —
- Modello EOQ (Economic Order Quantity): √(2DK/H) dove D=domanda, K=costo ordine, H=costo stoccaggio
- Tabella `fornitori_prodotti` (mapping fornitore↔ingredienti↔prezzo storico)
- Generatore PDF DDT
- Resend per invio email

**Effort** — 4-6 settimane:
- Settimana 1-2: modello EOQ + safety stock + lead time
- Settimana 3: UI ordine ottimale
- Settimana 4: PDF DDT + invio
- Settimana 5-6: test su Mara dei Boschi

**Metriche** —
- % ordini emessi via AI > 50%
- Sprechi MP -15%
- Tempo gestione ordini -70%

**Rischi** — Lead time fornitore non noto → modello impreciso. Mitigato: form per impostare lead time fornitore.

**Dipendenze** — Tabella `fornitori` esistente.

---

### B5. AI HACCP Auto-fill (geofence + foto)
**Obiettivo** — Da 60 min/giorno per HACCP a 5 min/giorno.

**UX** —
- App mobile (PWA installata): all'apertura in negozio (GPS geofence 50m) → notifica "Controlla frigo A".
- Tap → foto frigo+termometro → Claude Vision legge temperatura → entry HACCP automatica.
- Auditor ASL: 1 click → PDF report.

**Stack** —
- PWA con `navigator.geolocation` + push notifications
- Claude Vision per leggere display termometro
- Tabella `haccp_records` esistente

**Effort** — 5-7 settimane:
- Settimana 1-2: PWA installable + geolocation
- Settimana 3: Claude Vision termometro reading
- Settimana 4: integrazione con tabella haccp_records esistente
- Settimana 5-6: notification scheduling (worker)
- Settimana 7: PDF report ASL-ready

**Metriche** — # controlli HACCP/giorno; tempo medio per controllo.

**Rischi** — Browser permission geolocation/push spesso negate. Mitigato: onboarding educa.

**Dipendenze** — HACCP esistente.

---

### B6. AI Menu engineering (Kasavana-Smith)
**Obiettivo** — Mappa stars/dogs/plowhorses/puzzles automaticamente con consigli.

**UX** —
- Nuova view "Menu engineering" sotto Andamento & costi.
- Matrice 2x2: ascissa = popularity, ordinata = margine.
- Quadranti: ⭐ STARS (alto/alto), 🐕 DOGS (basso/basso), 🐎 PLOWHORSES (alto popularity, basso margine), 🧩 PUZZLES (basso popularity, alto margine).
- Per ogni prodotto → bubble cliccabile → consiglio AI.

**Stack** — Calcolo statistico (no AI necessaria per la matrice). Claude per i consigli narrativi su ogni prodotto.

**Effort** — 3-4 settimane.

**Metriche** — # ricette messe in promo/rimosse via suggerimento AI.

**Rischi** — Definizione "popularity" controversa (qta vs frequency-of-purchase).

**Dipendenze** — Storico chiusure + ricettario.

---

### B7. AI Cashflow predittivo 30/60/90 giorni
**Obiettivo** — Il problema #1 dei piccoli ristoratori: *"avrò i soldi per pagare?"*.

**UX** —
- Nuova view "Cashflow" sotto Andamento & costi.
- Grafico timeline 90gg con cassa attesa e cassa pessimistica/ottimistica.
- Eventi: stipendi (calcolati da Personale stipendi), fatture fornitore (scadenze), IVA in uscita, ricavi previsti (da B1 forecast).
- Alert: *"Il 28 luglio rischi cassa a €-2.400. Suggerimento: spostare pagamento fattura X o emettere nota credito Y."*

**Stack** — Simulazione Monte Carlo (1000 traiettorie con varianza ricavi) + scenari "fisso/ottimistico/pessimistico". Tabella `cashflow_eventi` per tracciare eventi pianificati.

**Effort** — 4 settimane.

**Metriche** — # utenti che pianificano azioni dal cashflow > 30%.

**Rischi** — Predizione errata se input incompleti (mitigato: notifica "completa dati per migliorare").

**Dipendenze** — B1 forecast ricavi è bonus, non bloccante.

---

### B8. Benchmark anonimo settoriale
**Obiettivo** — *"La tua food cost media è 31%. Settore: 28%. Top quartile: 24%."*

**UX** —
- Nuova sezione "Benchmark" (visibile solo se >10 clienti nella tua categoria business).
- Cruscotto: per ogni KPI principale → la tua posizione vs settore (percentile).
- Drill: "Perché stai sotto?" → AI confronta i tuoi processi vs i pattern dei top quartile (es. *"i top quartile registrano sprechi ogni giorno, tu solo settimanalmente"*).

**Stack** —
- Tabella `benchmark_aggregate` con KPI medi per categoria business (calcolato via cron settimanale)
- Tutti i dati AGGREGATI e ANONIMI (no PII)
- View materializzata Postgres per performance

**Effort** — 3-4 settimane (codice) + serve **mass critical >10 clienti per attivare**.

**Metriche** — % utenti che aprono Benchmark > 1×/settimana.

**Rischi** — Catch-22 cliente: senza dati clienti non hai benchmark, senza benchmark non hai cliente. Mitigato: lancia con dati Mara dei Boschi + 2-3 design partner anonimizzati.

**Dipendenze** — Customer base >10 organizations.

---

### B9. AI Pricing dinamico (competitor scraping)
**Obiettivo** — Suggerire pricing in base a competitor in zona.

**UX** —
- Tab "Pricing" → AI scrapa menu pubblici (Just Eat, Deliveroo, Glovo, Google Maps) di competitor in raggio 1km.
- Per ogni tuo prodotto: confronto con media/min/max competitor.
- Suggerimento: *"Il cannolo siciliano costa €3.50. In zona altri 4 lo vendono €3.80-€4.50. Hai €0.40-€1.00 di margine inutilizzato."*

**Stack** — Scraping (rispetto robots.txt) via Cloudflare Worker o Vercel Edge cron settimanale. Tabella `competitor_prices`.

**Effort** — 4-6 settimane.

**Metriche** — % suggerimenti pricing applicati → impatto ricavi.

**Rischi** — Legalità scraping. Mitigato: solo dati pubblici, no robots.txt block.

**Dipendenze** — Geolocalizzazione sede.

---

### B10. AI Camera vetrina (inventory visivo continuo)
**Obiettivo** — Webcam €30 in vetrina + AI conta automaticamente prodotti rimasti.

**UX** —
- Setup: posizioni una webcam economica → l'AI fa training su 10 foto di ciascun prodotto.
- Funzionamento continuo: ogni 5 minuti screenshot → AI conta vassoi/coni/torte.
- Alert: *"Cannolo siciliano in vetrina: rimangono 4 pz. Soglia: 6."*

**Stack** —
- YOLO o Claude Vision per object detection
- Worker locale (Raspberry Pi) o webcam IP + processing server-side
- Tabella `vetrina_inventory` aggiornata ogni 5min

**Effort** — 6-8 settimane (hardware + model + UX).

**Metriche** — Accuracy conteggio > 90%.

**Rischi** — Hardware-dependent → friction onboarding. Modello cambia con prodotti diversi. Mitigato: tier Chain only, supporto setup incluso.

**Dipendenze** — Hardware optional (webcam IP) o smartphone old.

---

## Tier C — Moonshot (3-6 mesi)

### C1. "FoodOS Brain" — Copilota AI tier premium
**Obiettivo** — Chat conversazionale che risponde a domande aperte sui dati del cliente.

**UX** —
- Sezione "Brain" in app + integrazione WhatsApp/email.
- *"Perché il pistacchio bronte è raddoppiato?"* → Brain analizza i tuoi acquisti negli ultimi 6 mesi + report DOP bronte fonti pubbliche → risponde.
- *"Cosa devo fare per arrivare a €5k di margine a luglio?"* → genera piano operativo settimanale.
- *"Mio commercialista vuole il report di giugno"* → genera PDF report bel formattato.
- Memoria persistente per utente (preferenze, decisioni passate, stile risposta).

**Stack** —
- Claude Opus (long context, ragionamento)
- Tabella `brain_conversations` (memoria)
- Tool-use con 20+ tool (query DB, generate PDF, send email, schedule reminder)
- Pricing: €149-199/mese tier separato

**Effort** — 3-4 mesi.

**Metriche** — Conversion tier upgrade > 15% del Pro.

**Rischi** — Hallucination su domande complesse. Mitigato: prompt rigoroso + sempre cita dati fonte.

**Dipendenze** — Stack AI già pronto.

---

### C2. WhatsApp Bot operativo
**Obiettivo** — Gestire FoodOS via chat WhatsApp (per chi vive lì).

**UX** —
- Setup: titolare scansiona QR code per linkare il suo numero al suo account.
- Comandi naturali via chat:
  - *"Quanto ho incassato oggi?"* → risposta con KPI
  - *"Carica spreco: 3 vaschette nocciola contaminate"* → log
  - *"Quante vaschette ho in magazzino?"* → risposta
  - *"Stipendio Maria"* → risposta
- Conferma con bottoni (WhatsApp Business buttons).
- Notifiche push importanti (stesso engine del Daily Brief, canale WhatsApp).

**Stack** —
- WhatsApp Business API (Twilio o Meta diretto)
- Claude Sonnet per intent parsing + tool-use
- Tabella `whatsapp_links` (org ↔ phone number)

**Effort** — 6-10 settimane.

**Metriche** — % utenti che usano WhatsApp > 40% (target italiano alto).

**Rischi** — Costo €0.05/messaggio Twilio. Da inserire nei piani Pro/Chain.

**Dipendenze** — Meta Business Account verificato.

---

### C3. AI Recipe Inventor (chef artigianale virtuale)
**Obiettivo** — *"Inventami una torta estiva con quello che ho in magazzino."*

**UX** —
- Sezione "Crea ricetta" → bottone "Genera con AI".
- Input opzionale: stagione, mood ("fresca", "ricca", "low-cost"), ingredienti disponibili, allergie da evitare.
- Output: 3 ricette nuove con nome accattivante, descrizione plating, lista ingredienti precisa, food cost calcolato automaticamente, varianti dietetiche.
- Bottone "Salva nel ricettario" → crea voce ricettario.

**Stack** —
- Claude Opus fine-tuning con dataset pasticceria italiana
- Cross-reference con magazzino MP corrente
- Cross-reference con database 427 prezzi HORECA per calcolo costo

**Effort** — 8-12 settimane (serve fine-tuning o RAG).

**Metriche** — # ricette generate e salvate.

**Rischi** — Ricette "improbabili". Mitigato: validazione chef veri sui primi 100 output.

**Dipendenze** — Database HORECA. Eventualmente Claude fine-tuning.

---

### C4. AI Marketplace fornitori
**Obiettivo** — Marketplace B2B fornitori-pasticcerie con AI raccomandazione.

**UX** —
- Sezione "Marketplace" → lista fornitori con prezzi aggregati di tutta la base FoodOS.
- AI raccomanda: *"Per il tuo consumo di pistacchio bronte, ti consiglio Fornitore X: ha prezzo medio €52/kg (vs il tuo €58), lead time 3gg, 4.7/5 da 18 clienti FoodOS"*.
- One-click order → trasmette ordine al fornitore.
- Fee transazione 2-3% al fornitore.

**Stack** —
- Tabella `marketplace_listings` (fornitore, prodotto, prezzo, MOQ)
- AI matching engine
- Stripe Connect per pagamenti split

**Effort** — 4-6 mesi.

**Metriche** — GMV transato.

**Rischi** — Two-sided marketplace difficile da bootstrappare. Mitigato: parti con 3-5 fornitori cardine identificati da clienti esistenti.

**Dipendenze** — Customer base >50.

---

### C5. AI Audit ASL pre-compilato
**Obiettivo** — Audit ASL pronto in 1 click invece di settimane di preparazione.

**UX** —
- Tab "Audit ASL" → bottone "Genera report".
- L'AI compila PDF formattato 30-50 pagine:
  - Timeline temperature 12 mesi
  - Log sprechi e cause (dato)
  - Log sanificazioni (con foto se HACCP automatico, B5)
  - Mappatura allergeni ricettario
  - Procedure documentate (auto-generate da pattern uso app)
  - Foto frigoriferi (da B5 se attivo)
- Confidence level: *"Documento al 87% completo. Mancano: registro pesti, contratto disinfestazione."*

**Stack** —
- PDF generation (jsPDF + react-pdf)
- Template ASL conforme
- Claude per generazione "procedure documentate" da pattern uso

**Effort** — 3-4 mesi.

**Metriche** — # report generati; feedback ASL real (con design partner).

**Rischi** — Format ASL cambia per regione/ATS. Mitigato: template per le 3-4 principali ATS.

**Dipendenze** — HACCP usage data.

---

### C6. Smart fridge integration (IoT)
**Obiettivo** — Sensori frigo H24 + anomaly detection AI.

**UX** —
- Partner con SensorPush, Inkbird, Coolblue (sensori BLE/WiFi €30-100).
- Setup: scan QR code sensore → link al frigo "A".
- Cruscotto temperature 24/7. Alert AI: *"Il frigo A ha aperto 47 volte in 1 ora vs media 12. Verifica chiusura sportello."*
- Compliance HACCP automatica.

**Stack** —
- API SensorPush (ufficiale)
- Webhook + tabella `sensor_readings`
- Anomaly detection con z-score + isolation forest

**Effort** — 4-6 mesi.

**Metriche** — # sensori installati; # alert generati.

**Rischi** — Hardware dependency. Tier Chain only.

**Dipendenze** — Vendor relationships.

---

### C7. Documentary AI generator
**Obiettivo** — Spotify Wrapped per pasticcerie.

**UX** —
- Ogni 3 mesi (e a fine anno) → email "Il tuo trimestre".
- Pagina web shareable: timeline cose fatte, foto prodotti più venduti, KPI in crescita, citazioni AI ("hai prodotto 1.247 cannoli! Il bestseller resta sempre lo stesso da 3 trimestri 🏆").
- Pacchetto export per social: 10 immagini Instagram-ready con stat e foto.

**Stack** —
- Claude per testo creativo
- Canva API o template SVG per immagini auto-generate
- Foto prodotti dal ricettario esistente

**Effort** — 2-3 mesi.

**Metriche** — Share rate; engagement social posts.

**Rischi** — Bassi.

**Dipendenze** — Customer storico >6 mesi.

---

## Tier D — Wildcard / vento contrario

### D1. Non costruire più feature. Vendi.
**Implementazione**:
- Stop al codice per 30 giorni
- 30 demo dirette a pasticcerie/gelaterie Torino+Milano
- Obiettivo: chiudere 5 paganti a €89/mese
- Risultato: composito Business +7 punti, prodotto invariato a 84

**Costo**: 30 giorni del fondatore. Zero codice.

**ROI**: il più alto possibile (vedi matematica composito).

---

### D2. M&A artigianale
**Implementazione**:
- Identifica 2-3 SaaS food IT con <100 clienti e founder bruciato
- Offri acquisto base clienti (no codice) per €30-100k
- Migra clienti a FoodOS in 90gg

**Costo**: €60-200k cash o equity swap.

**Rischio**: serve capitale. Per quando arriverà il seed round.

---

### D3. Open API HORECA (leadgen organico)
**Implementazione**:
- Espongo `/api/public/horeca-prices?ingrediente=pistacchio` gratis
- Landing SEO-friendly su foodios.it/api
- Documenta su Postman + ProductHunt launch
- Sotto: registrazione per "non perdere mai aggiornamenti prezzi" → email funnel

**Costo**: 2 settimane di codice + marketing.

**ROI**: leadgen organico settoriale.

---

### D4. AI Consulente come servizio
**Implementazione**:
- Tier €99/mese aggiuntivo (oltre al SaaS)
- 1 sessione/settimana con Brain AI (FoodOS Brain — C1)
- Più una call umana mensile con un consulente food
- Targetting: attività >€300k/anno fatturato

**Costo**: rete consulenti convenzionati.

**ROI**: 3x ARR sui top 10-15%.

---

### D5. Embed AI in altri SaaS food
**Implementazione**:
- Wrapper API per il motore food cost ricorsivo
- Pricing: €0.10/calcolo o €99/mese flat
- Target: gestionali cassa/POS che non hanno food cost

**Costo**: 1 settimana per pacchettizzare API.

**ROI**: secondo revenue stream zero-friction.

---

## Tier E — Moat hard-to-copy

### E1. Database HORECA 427 → 2000+ prezzi
**Implementazione**:
- 3 mesi di lavoro:
  - Mese 1: scraping legale di 30 distributori IT pubblici
  - Mese 2: crowdsource (clienti FoodOS contribuiscono prezzi)
  - Mese 3: cleaning + validation + categorizzazione AI
- Aggiungi metadati: stagionalità, alternative valide, DOP/IGP

**Effort** — 3 mesi part-time.

**ROI** — Asset insostituibile. Differenza enorme nel modello food cost.

---

### E2. Network effect via benchmark anonimo (vedi B8)
Stessa cosa di B8 ma scalata: con 100+ clienti il benchmark diventa lo standard di settore. Citato sui media, pubblicato come report annuale → posizionamento da leader.

---

### E3. Plugin marketplace per food artigianale
**Implementazione**:
- API pubblica + SDK + portal sviluppatori
- 30% rev share su plugin a pagamento
- 5-10 plugin proprietari (cassa POS, e-commerce, contabilità)

**Effort** — 6 mesi.

**ROI** — Ecosistema = lock-in totale.

---

### E4. Newsletter "Food Cost Insights"
**Implementazione**:
- 1 articolo/settimana di insight settoriale (con dati anonimi)
- LinkedIn + email
- Target: 5k iscritti in 6 mesi
- Diventi voce autorevole

**Costo** — 4h/settimana scrittura.

**ROI** — Authority brand + leadgen.

---

## Matrice riassuntiva

| Tier | # feature | Effort medio | Score impact |
|---|---:|---|---|
| A (quick wins) | 6 | 1-2 settimane/feature | +3-5 punti prodotto/feature |
| B (game changers) | 10 | 4-8 settimane/feature | +5-8 punti prodotto, +10 pricing power |
| C (moonshot) | 7 | 3-6 mesi/feature | +10-15 punti, nuovo revenue stream |
| D (wildcard) | 5 | 0-30gg | +5-10 punti business (NON prodotto) |
| E (moat) | 4 | 3-12 mesi | +5-15 punti competitive position |

---

## Note operative

- **Stack AI**: Claude (Haiku per volumi cron, Sonnet per UX interattiva, Opus per ragionamento profondo). OpenAI Whisper per voice. Hugging Face per modelli custom se serve.
- **Costo Claude**: con Haiku 4.5 e cache, ~€0.001-0.005/interazione → trascurabile fino a 1000+ clienti.
- **Database vector**: Supabase pgvector per embedding ricette/ingredienti (per A5, B3, C3).
- **Mobile/Voice**: PWA installable già supportata da Vercel.

---

## Riferimenti file

- AI proxy esistente: `api/ai.js`
- AI engine (lib): `api/lib/aiEngine.js`
- Daily Brief: `api/cron-daily-brief.js`
- AI Suggestions: `api/cron-ai-suggestions.js`
- UI bell+brief: `src/components/AISuggestionsBell.jsx`, `src/components/DailyBriefCard.jsx`
- Strategia high-level: `STRATEGIA_AI_FEATURES.md`
- Decision SDI: `SDI_GO_LIVE.md`
- Audit prodotto: `ANALISI_PRODOTTO.md`
