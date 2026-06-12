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
| **2026-06-11** | **84** | **78** | **27** | **~33** | Inventario gusti, costi azienda P&L, stipendi CCNL, Confronto/Trasferimenti rimodellati, Skeleton, tablet fix, SDI scaffolding agnostico (decision log Fatture in Cloud) |

Δ 11 giu: sessione mix prodotto + maturità. Prodotto sale (+5) grazie a feature di alto valore (inventario differenziale, P&L con costi reali, stipendi calcolati). Business sale **di poco** (+5) per il primo passo concreto verso il go-live SDI (scaffolding + decisione frozen) — non muove ancora PMF/Traction ma sblocca il critical path.

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

## 1. Capacità di prodotto

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

**Composito capacità prodotto: ~84/100** (era 79 il 6 giu, +5).

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

**Composito ingegneria: ~78/100** (era 75 il 6 giu, +3).

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

**Composito business: ~27/100** (era 22 il 6 giu, +5). I numeri che pesano restano bassissimi (PMF 8, traction 3) ma il critical path legale SDI ha fatto un passo concreto.

---

## 4. Verdetto a due velocità

```
Capacità PRODOTTO      84/100   "molto forte"     (era 79, +5)
Ingegneria/piattaforma 78/100   "solida+"          (era 75, +3)
Business / commerciale 27/100   "non validato+"    (era 22, +5)
MATURITÀ AZIENDA (blend) ~33/100                    (era ~31, +2)
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
