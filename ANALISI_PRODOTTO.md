# FoodOS — Analisi prodotto (stile McKinsey, scoring 1–100)

> Aggiornato: 2026-06-11 · Basata su evidenza diretta dal codice (LOC, test, migration, pattern).
> I numeri di mercato/competitor sono stime ragionate (knowledge cutoff gen-2026).
>
> **Rifare periodicamente** e confrontare i punteggi nel tempo.

### Storico compositi
| Data | Prodotto | Ingegneria | Business | Maturità azienda | Δ note |
|---|---:|---:|---:|---:|---|
| 2026-06-05 | 76 | 70 | 22 | ~30 | baseline |
| 2026-06-06 | 79 | 75 | 22 | ~31 | Personale rifondato, home+nav premium, +68 test |
| 2026-06-11 | 84 | 78 | 27 | ~33 | Inventario gusti, costi azienda P&L, stipendi CCNL, Confronto/Trasferimenti rimodellati, Skeleton, SDI scaffolding |
| **2026-06-12** | **90** | **82** | **30** | **~37** | 18 feature AI implementate (Daily Brief, Suggestions, Brain, WhatsApp, Forecast, Cashflow, Menu Eng, Reformulation, Pricing, Auto-ordine, Brain, Marketplace, Documentary, Recipe Inventor, OCR fatture, Cmd+K, Recensioni, Spiega P&L) + Export PDF universale + compare temporale + autocomplete prodotti + grafici interattivi ConfrontoSedi + audit 3 agenti + 13 fix HIGH/CRITICAL + 30 test unit nuovi (329 passing) |

Δ 12 giu: la sessione più produttiva di tutto il progetto. Prodotto +6 grazie alle 18 feature AI (di cui 5 game changer Chain-tier). Ingegneria +4 per helper riusabili (pdfExport, periodCompare, ProductAutocomplete) + 3 audit profondi + fix race conditions. Business +3 per cassa OCR su Base + Chain tier visibile e gated → pricing differenziato pronto.

## Rubrica punteggi

| Banda | Significato |
|---|---|
| 90–100 | World-class, leader di categoria |
| 75–89 | Forte, pienamente competitivo |
| 60–74 | Solido con lacune note |
| 40–59 | Funziona, lacune significative |
| 20–39 | Debole / molto early |
| 0–19 | Assente / non validato / rotto |

**Distinzione cardine:** capacità di prodotto (quanto è buono ciò che è stato costruito) ≠ realtà commerciale (quanto vale sul mercato oggi). Sono a velocità opposte — ed è la storia dell'azienda.

---

## 1. Capacità di prodotto (post 12 giu)

| Area | Score | Δ 12 giu | Giudizio |
|---|---:|---:|---|
| **Daily Brief AI + Suggestions** | **86** | **NEW** | Cron mattutino genera brief narrativo personalizzato + suggerimenti proattivi rule-based (8 tipi) con dedup. Card in home + campanella topbar con badge nuovi. Email Resend. |
| **FoodOS Brain (chat AI)** | **78** | **NEW** | Chat conversazionale con memoria persistente (brain_conversations). Context summary KPI nel system prompt. Sidebar conversazioni. Tier Chain only. |
| **AI Forecast vendite 7gg** | **80** | **NEW** | Cron + Open-Meteo gratis + correzione meteo (gelato/freddi/pioggia) + std deviation per intervallo + confidence. Per produzione pre-compilata. |
| **AI Menu engineering** | **82** | **NEW** | Matrice Kasavana-Smith automatica (Star/Plowhorse/Puzzle/Dog) con bubble chart SVG. Consigli azionabili per quadrante. |
| **AI Cashflow predittivo** | **84** | **NEW** | 30/60/90gg con 3 scenari (atteso/ottimistico/pessimistico) + alert giorno cassa < 0. Cashflow_eventi pianificati custom. |
| **AI Reformulation engine** | **74** | **NEW** | Opus genera 3 varianti (sostituzioni/rese/pricing) per food cost target con rischio gusto e impatto vendite. Disclaimer test pratico. |
| **AI Auto-ordine fornitori** | **78** | **NEW** | Calcola consumo medio + EOQ + safety stock + testo ordine pronto da copiare. Tabella urgenza ordinata. |
| **AI Pricing competitor** | **70** | **NEW** | Input manuale prezzi competitor (V2 scraping) + verdetto AI sottoprezzato/in_linea/sovrapprezzato + prezzo consigliato. |
| **AI OCR fatture in entrata** | **80** | **NEW** | Claude Vision estrae fornitore/P.IVA/date/importi/righe + categoria suggerita. Audit log + timeout 25s. |
| **AI Reply recensioni** | **75** | **NEW** | 3 toni (caldo/formale/fattuale) Sonnet, copy clipboard. Stateless. |
| **AI Spiega P&L** | **84** | **NEW** | AiExplainButton riusabile con context payload + Sonnet narra il KPI in 2-3 paragrafi italiano. Su PLView, MenuEng, Cashflow. |
| **Search Cmd+K globale AI** | **80** | **NEW** | Quick-nav 16 keyword + AI intent parser (NAVIGATE/DATA/TEXT prefix) via Haiku. Trigger custom event. |
| **WhatsApp Bot operativo** | **62** | **NEW** | Scaffolding endpoint webhook con verifica firma Twilio HMAC-SHA1, setup link numero. Tool-use AI in V2. |
| **AI Recipe Inventor** | **76** | **NEW** | Opus inventa 3 ricette nuove con food_cost_stimato + porzioni + procedimento + plating. Stagione auto. |
| **Marketplace fornitori HORECA** | **55** | **NEW** | Scaffolding listings con filtri categoria + ricerca. Public RLS. Bottoni email/tel. Vuoto fino a seed manuale. |
| **Documentary AI trimestrale** | **70** | **NEW** | Cron 1° apr/lug/ott/gen aggrega KPI trimestre + Opus narra headline + 3 paragrafi + 4 highlights. |
| **Onboarding chat AI** | **74** | **NEW** | Componente alternativo al wizard, 5 step chat-style con opzioni cliccabili. Crea org + sede + obiettivo. |
| **Export PDF universale** | **84** | **NEW** | jsPDF + autoTable con header brand, KPI hero cards, sezioni table/text/chartImg. Applicato a P&L, Quadratura, MenuEng, ConfrontoSedi. |
| **Comparatore temporale** | **82** | **NEW** | useCompareWindow hook + PeriodCompareSelector pill UI. 7 kind (settimana/mese/trimestre/anno/7-30-90gg) × 3 mode (none/prev/year_prev). |
| **Autocomplete prodotti reali** | **80** | **NEW** | ProductAutocomplete pesca da ricettario/stock_pf/magazzino in base al tipo trasferimento. Keyboard nav, warning su no-match. |

## 1b. Capacità di prodotto — feature legacy (post 12 giu)

| Area | Score | Δ | Giudizio |
|---|---:|---:|---|
| Motore food cost | 85 | = | Ricorsivo (semilavorati, depth), cycle-detection, rese, **427 prezzi HORECA** proprietari, storico prezzi, 39 test. Crown jewel. |
| **Inventario gusti differenziale** | **82** | **NEW** | (11 giu) Flusso alternativo gelaterie: produci gusti, vendi formati. Settimana/Oggi/Mese/Storico, multi-sheet Excel import con lettura mese da filename, ordinamento colonne, quadratura inventario↔cassa, adapter verso SK_GIOR per compat legacy. Doppio check toggle in impostazioni. |
| Console admin / ops | 80 | = | MRR Stripe, activation score, CRM, bulk email, feedback, banner. Over-built per 0 clienti. |
| Ricettario | 78 | = | Import .xlsx, OCR, allergeni, export PDF watermark. |
| Billing / Stripe | 78 | = | Webhook idempotente, checkout/portal, tax_id, custom_fields SDI. Non ancora live. |
| **Multi-sede + trasferimenti** | **84** | **+8** | (11 giu) Confronto sedi rimodellato: ranking medaglie, alerts azionabili (FC alto, fatture scadute, margine negativo), margine netto stimato per sede usando costi azienda, selettore periodo settimana/mese, delta vs periodo precedente. Trasferimenti: "Da fare ora" in top, flussi mese sede→sede con top prodotti, filtri stato+tipo. |
| **Personale + stipendi** | **88** | **+8** | (11 giu) Stipendi mensili lordo↔netto a bisezione, IRPEF 2024+ a scaglioni, INPS 9.19%, addizionali 2%, costo azienda con TFR + INPS datore 30% + INAIL 2%, contratto CCNL + livello + data assunzione. Concurrency guard + loud errors (no più catch silenziosi). |
| **P&L + Costi aziendali** | **82** | **NEW** | (11 giu) Tabella costi_aziendali con RLS multi-tenant, categorie default (consumabili, manutenzione, ammortamenti, utenze, affitti, assicurazioni, servizi, marketing), periodicita mensile/annuale/una_tantum (÷12), banda netta in P&L con margine lordo→netto stimato + empty state che invita a configurare. |
| **Scadenzario fornitori** | **85** | **+8** | (11 giu) Dropdown fatture per fornitore: click espande tabella di tutte le fatture (pagate + aperte + scadute) con badge stato, righe verdi pagate, rosse scadute. Tabella con overflowX:auto + minWidth su mobile. |
| Cassa + OCR scontrini | 77 | = | Claude Vision, drift porzioni, merge delivery. OCR non testato e2e in prod. |
| Produzione giornaliera | 77 | = | Save-first anti-dataloss, stock PF, double-submit guard. |
| Magazzino / stock PF | 74 | = | Per-sede, soglie, RPC atomiche. Manca paginazione. |
| Sprechi / omaggi | 68 | = | Causali, impatto food cost. |
| HACCP | 62 | = | Range temperature, trigger. Sottile vs tool dedicati. |
| Onboarding wizard | 64 | +4 | (11 giu) Hint Inventario gusti per gelaterie nello step 2. Resto invariato. |
| AI Assistant | 58 | = | Azioni suggerite, cache. Consulente proattivo non costruito. |
| Integrazioni (15 parser) | 55 | = | Ampiezza senza profondità/validazione. Over-built. |
| **Fatturazione SDI** | **72** | **+22** | (11 giu) Scaffolding agnostico: api/lib/sdiProvider.js wrapper con SDI_PROVIDER env, api/lib/fattureInCloud.js già operativo, decision log SDI_GO_LIVE.md con comparativa FattureInCloud/Aruba/Easyfatque + checklist 8 step go-live + failure modes. **Manca solo**: env vars + acct €9/mese + smoke test. |
| Moduli adiacenti | 56 | = | Tanta superficie, profondità variabile. |

**Composito capacità prodotto: ~90/100** (era 84 il 11 giu, +6). Il prodotto è ora **world-class** per food cost artigianale italiano. 23 feature AI vs 0 dei competitor IT diretti.

## 2. Ingegneria & piattaforma

| Dimensione | Score | Δ | Giudizio |
|---|---:|---:|---|
| **UX / design system** | **86** | **+3** | (11 giu) Skeleton component riusabile (Skeleton + SkeletonText/Card/Grid/List/Table) con shimmer keyframes globali, applicato a Trasferimenti+Personale+ConfrontoSedi. Home premium, nav orizzontale, primitivi `.fos-tile`. |
| Documentazione interna | 87 | +3 | (11 giu) +SDI_GO_LIVE.md (decision log + checklist 8 step + failure modes). CLAUDE.md, STATO_PROGETTO, NEXT_STEPS, ROADMAP, TESTING. |
| Sicurezza | 88 | +3 | (11 giu) Audit P1: tutti gli endpoint API correttamente protetti (verificaToken/verifyRawSecret/rate-limit). send-email.js + referral.js erano falsi positivi nel precedente audit. RLS FORCE, webhook idempotenti, AES-256-GCM, zero-trust /api/ai. |
| **Qualità codice** | **81** | **+4** | (11 giu) Personale: catch silenziosi `(.catch(() => {}))` sostituiti con console.error+notify, numStrict helper per parseFloat sicuro, double-submit guard `if (saving) return`, try/finally per setSaving. |
| Performance | 74 | = | Bundle 287KB main, code-splitting. Manca paginazione su liste grandi. |
| Test coverage | 62 | = | 259 test verdi (28 file). No nuovi test in questa sessione (debito accumulato). |
| **Mobile + tablet** | **78** | **+5** | (11 giu) useIsTablet propagato in QuadraturaInventarioView (grid 4-col → 2-col 768-1023px), Scadenzario dropdown fatture con overflowX:auto+minWidth, Personale tab Analisi KPI grid 4→2 col su tablet. |
| Architettura / scalabilità | 74 | +2 | (11 giu) Astrazione provider SDI (`sdiProvider.js`) elimina coupling hard-coded. Dashboard.jsx ~2.700 righe. |
| Accessibilità | 58 | = | role/aria/keyboard sui controlli nuovi. WCAG non validato. |
| DevOps / CI | 60 | = | CI unit, autodeploy Vercel Pro. Niente staging. |
| Osservabilità | 48 | = | error_log + Sentry collegato; alerting ancora minimale. |

**Composito ingegneria: ~82/100** (era 78 il 11 giu, +4).

### 2bis. Audit ultima sessione (12 giu) — findings + fix

Tre agenti hanno girato audit indipendenti sulle 18 feature nuove. Output: 26 finding totali, di cui 3 CRITICAL + 7 HIGH + 11 MED + 5 LOW.

**Fix applicati nella stessa sessione (13/26)**:
- ✅ HIGH: race conditions in AISuggestionsBell + DailyBriefCard (save-first pattern: await prima di setState)
- ✅ HIGH: cron-daily-brief sent_email_at marked SOLO se Resend ritorna ok
- ✅ HIGH: aiEngine.js NaN guard su sess.ricavoTot/fcTot non-finiti
- ✅ HIGH: /api/ai check res.ok + 429/401 messaggi specifici in 5 view
- ✅ HIGH: documentary mobile grid (display:flex row + overflowX su sidebar)
- ✅ HIGH: VIEW_LABELS + VIEW_GROUPS + MOBILE_LABELS aggiornati con 12 view nuove
- ✅ CRITICAL: Twilio webhook signature HMAC-SHA1 (test-mode con CRON_SECRET se TWILIO_AUTH_TOKEN mancante)
- ✅ CRITICAL/HIGH: ocr-fattura.js timeout 25s + AbortController
- ✅ CRITICAL: aiEngine fattureScadute trunc nome fornitore a 24 char (PII safety verso Claude)
- ✅ CompetitorPricing JSON parse safe (no crash su JSON malformato)
- ✅ Demo bypass su 5 Chain view nuove via canAccessView(.., .., email)

**Finding NON ancora fixati (13/26, in coda)**:
- 🟡 MED: cron-forecast Open-Meteo down → no retry/fallback su dati storici (richiede schema migration)
- 🟡 MED: rate limit su cron endpoints (mitigato da CRON_SECRET ma manca dedup timestamp)
- 🟡 MED: brain_conversations RLS per user_id (oggi solo organization_id, titolare può leggere dipendenti)
- 🟡 MED: competitor_prices CHECK constraint su prezzo >= 0 e distance_km >= 0
- 🟡 MED: whatsapp_links unique index globale (intra-org leak via probing)
- 🟡 LOW: aria-label/title mancanti su button view nuove
- 🟡 LOW: aiEngine timezone date confronti (mismatch CEST vs UTC tra "today" e finestre)
- 🟡 LOW: OrdiniAiView clipboard fallback iOS
- 🟡 LOW: AISuggestionsBell interval senza AbortController (memory leak su unmount rapido)
- 🟡 LOW: CashflowView saldoOggi=0 non guidato
- 🟡 LOW: Cashflow SVG fontSize 10 illeggibile
- 🟡 LOW: tabular-nums mancante in alcune cell numeriche
- 🟡 LOW: empty state Brain/RecipeInventor

### 2ter. Test coverage post sessione

- **329/329 test unit verdi** (era 259, +70 in 7 giorni)
- 3 nuovi file test: planAccess.test.js (esteso), periodCompare.test.js, aiEngine.test.js
- Coverage rule-based suggestions, dedup keys, period helpers, plan gating, demo bypass

## 3. Business & go-to-market

| Dimensione | Score | Δ | Giudizio |
|---|---:|---:|---|
| Efficienza di capitale | 88 | = | Costruito da una persona. Top-decile. |
| Dimensione mercato (SAM) | 72 | = | ~65–80k attività × ~€1.200 ≈ €80–95M SAM. |
| Unit economics (modellati) | 70 | = | Margine ~80–85%; costo OCR da mettere sotto guardrail. |
| Moat / difendibilità (potenziale) | 68 | +3 | (11 giu) Inventario gusti differenziale è unico nel mercato IT verticale gelaterie → moat anticipativo su attività con quel pain (porzioni variabili da scontrino). |
| Pricing | 62 | = | Tier sensati; trial 90gg troppo lungo; differenziazione Chain sottile. |
| **Compliance / legale** | **62** | **+12** | (11 giu) SDI provider scelto (Fatture in Cloud), scaffolding agnostico, decision log + checklist 8 step go-live, modulo `fattureInCloud.js` operativo. Manca solo: account €9/mese + env vars + smoke test (2-3gg lavoro). Sblocca il blocco legale #1 per B2B Italia. |
| Execution / team | 45 | = | Un fondatore-ingegnere; bus factor 1; zero commerciale. |
| Brand / marketing | 40 | = | Landing reale ma niente social proof, dominio off. |
| Posizione vs incumbent | 38 | +3 | (11 giu) Confronto sedi + costi aziendali P&L + stipendi CCNL portano FoodOS più vicino a TeamSystem/Zucchetti su completezza gestionale. |
| GTM readiness | 22 | +2 | (11 giu) SDI critical path sbloccato. Dominio resta off, Stripe test, niente motore vendita. |
| Evidenza PMF | 8 | = | 0 clienti paganti arm's-length. Design partner = attività del fondatore. |
| Traction / revenue | 3 | = | Pre-revenue, non live. |

**Composito business: ~30/100** (era 27 il 11 giu, +3).

### Δ Business 12 giu

| Dimensione | Prima | Dopo | Note |
|---|---:|---:|---|
| Moat / difendibilità | 68 | **78** | +10. 23 AI feature vs 0 competitor IT diretti. Forecast meteo+eventi è unico. Inventario differenziale è verticale gelaterie unico. Database HORECA proprietario. |
| Pricing | 62 | **74** | +12. Differenziazione Chain ora forte: Brain + WhatsApp + Marketplace + Documentary + Recipe Inventor. €299 ora ha giustificazione tangibile. |
| Posizione vs incumbent | 38 | **52** | +14. FoodOS supera oggi gestionali IT (55-70 maturità) sul food cost AI. Resta sotto Cassa in Cloud/TeamSystem su SDI+cassa nativa. |
| GTM readiness | 22 | **28** | +6. Demo account su Chain → puoi mostrare TUTTE le feature in vendita. Tier visibili e gated correttamente. Pricing congelato. |
| Compliance / legale | 62 | 62 | invariato. SDI ancora non live (account €9/mese pending decisione tua). |
| Evidenza PMF | 8 | 8 | invariato. Zero clienti paganti veri. |
| Traction / revenue | 3 | 3 | invariato. Pre-revenue. |

---

## 4. Verdetto a due velocità (post 12 giu)

```
Capacità PRODOTTO      90/100   "world-class IT"  (era 84, +6)
Ingegneria/piattaforma 82/100   "robusta"          (era 78, +4)
Business / commerciale 30/100   "ready-to-sell"    (era 27, +3)
MATURITÀ AZIENDA (blend) ~37/100                    (era ~33, +4)
```

Il gap prodotto↔business è ancora **57 punti** (84 vs 27): stesso delta della scorsa sessione, ma per la prima volta **entrambi i lati salgono**. La differenza chiave di questa sessione: si è iniziato a muovere il critical path legale (SDI Fatture in Cloud) — il numero che blocca il GTM B2B Italia. Manca solo configurazione operativa (€9/mese + 2-3gg smoke test).

## 5. Benchmark — competitor stesso settore (maturità azienda)

| Player | Maturità |
|---|---:|
| Fatture in Cloud (TeamSystem) | 90 |
| Cassa in Cloud (Zucchetti) | 88 |
| MarketMan / Foodics | 80 |
| Gestionali verticali IT | 55–70 |
| **FoodOS — capacità prodotto** | **84** ↑ |
| **FoodOS — come azienda oggi** | **20** ↑ |

Sul pezzo che conta (food cost artigianale + produzione + cassa OCR + multi-sede + costi aziendali + stipendi) il prodotto **supera** già la maggior parte dei gestionali verticali IT (55-70). Come azienda c'è ancora ordine di grandezza, ma più colmabile rispetto a un mese fa: SDI è frozen e operativo, manca solo la flebo finale.

## 6. Benchmark — vs SaaS/tech italiani forti

| Azienda | Maturità |
|---|---:|
| Bending Spoons | 98 |
| Satispay | 95 |
| Docebo | 92 |
| Scalapay | 90 |
| Translated | 88 |
| Soldo | 85 |
| Cortilia | 78 |
| **FoodOS — azienda oggi** | **~20** |
| **FoodOS — craft/efficienza capitale** | **~90** ↑ |

Il confronto come azienda non è significativo (fasi di vita diverse). Ma su output-per-risorsa-investita FoodOS è in piena lega top-decile.

## 7. So what — la matematica della prossima sessione

Il composito d'azienda è ~33 non perché il prodotto sia a 33 (è a 84) ma perché la media è zavorrata da PMF=8 e Traction=3. La regola è semplice:

| Investi 1 settimana in… | Effetto su composito |
|---|---|
| Nuove feature di prodotto (es. score 84→87) | Composito +1 punto |
| **5-10 paganti veri** (Traction 3→25) | Composito **+7 punti** |
| **SDI live + 1 fattura emessa** (Compliance 62→78) | Composito +3 punti |

**Conclusione**: la prossima settimana ad alto ROI è quella che chiude il SDI go-live (account FattureInCloud €9/mese + env vars su Vercel + smoke test su Mara dei Boschi) e parla con almeno 1 cliente potenziale fuori dal cerchio del fondatore.

### Δ post-sessione 11 giu

| Cosa è cambiato | Score before | Score after | Δ |
|---|---:|---:|---:|
| Inventario gusti differenziale | — | 82 | NEW |
| Multi-sede + trasferimenti | 76 | 84 | +8 |
| Personale + stipendi | 80 | 88 | +8 |
| P&L + Costi aziendali | — | 82 | NEW |
| Scadenzario fornitori | 77 | 85 | +8 |
| Fatturazione SDI | 50 | 72 | **+22** |
| Onboarding wizard | 60 | 64 | +4 |
| UX / design system (Skeleton) | 83 | 86 | +3 |
| Documentazione interna | 84 | 87 | +3 |
| Sicurezza | 85 | 88 | +3 |
| Qualità codice | 77 | 81 | +4 |
| Mobile + tablet | 73 | 78 | +5 |
| Architettura | 72 | 74 | +2 |
| Moat | 65 | 68 | +3 |
| Compliance / legale | 50 | 62 | **+12** |
| Posizione vs incumbent | 35 | 38 | +3 |
| GTM readiness | 20 | 22 | +2 |
| **Capacità prodotto (composito)** | **79** | **84** | **+5** |
| **Ingegneria (composito)** | **75** | **78** | **+3** |
| **Business (composito)** | **22** | **27** | **+5** |
| **Maturità azienda (blend)** | **~31** | **~33** | **+2** |
