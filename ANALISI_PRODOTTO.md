# FoodOS — Analisi prodotto (stile McKinsey, scoring 1–100)

> Aggiornato: 2026-06-05 · Basata su evidenza diretta dal codice (LOC, test, migration, pattern).
> I numeri di mercato/competitor sono stime ragionate (knowledge cutoff gen-2026).
>
> **Rifare periodicamente** e confrontare i punteggi nel tempo.

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

| Area | Score | Giudizio |
|---|---:|---|
| Motore food cost | 85 | Ricorsivo (semilavorati, depth), cycle-detection, rese, **427 prezzi HORECA** proprietari, storico prezzi, 39 test. Crown jewel. |
| Console admin / ops | 80 | MRR Stripe, activation score, CRM, bulk email, feedback, banner. Over-built per 0 clienti. |
| Ricettario | 78 | Import .xlsx, OCR, allergeni, export PDF watermark. |
| Billing / Stripe | 78 | Webhook idempotente, checkout/portal, tax_id, custom_fields SDI. Non ancora live. |
| Multi-sede + trasferimenti | 76 | Shared vs per-sede, scenari A/B/C/D, confronto sedi. |
| Cassa + OCR scontrini | 75 | Claude Vision, drift porzioni, merge delivery. OCR non testato e2e. |
| Produzione giornaliera | 74 | Save-first anti-dataloss, stock PF, double-submit guard. |
| Magazzino / stock PF | 72 | Per-sede, soglie, RPC atomiche. Manca paginazione. |
| Sprechi / omaggi | 68 | Causali, impatto food cost. |
| HACCP | 62 | Range temperature, trigger. Sottile vs tool dedicati. |
| Onboarding wizard | 60 | 3–4 step. Attivazione non validata. |
| AI Assistant | 58 | Azioni suggerite, cache. Consulente proattivo non costruito. |
| Integrazioni (15 parser) | 55 | Ampiezza senza profondità/validazione. Over-built. |
| Fatturazione SDI | 50 | Endpoint esiste, non testato in produzione. Blocco legale n°1. |
| Moduli adiacenti | 56 | Tanta superficie, profondità variabile. |

**Composito capacità prodotto: ~76/100.**

## 2. Ingegneria & piattaforma

| Dimensione | Score | Giudizio |
|---|---:|---|
| Documentazione interna | 82 | CLAUDE.md, STATO_PROGETTO, NEXT_STEPS, ROADMAP, TESTING. |
| Sicurezza | 80 | RLS FORCE, webhook idempotenti, AES-256-GCM, rate-limit, session fingerprint, zero-trust /api/ai, watermark. |
| Qualità codice | 75 | Error handling, retry esponenziale, sanitize. 1 TODO, ~0 dead code. |
| Performance | 74 | Bundle 246KB (-78%), code-splitting. Manca paginazione su liste. |
| Architettura / scalabilità | 72 | Buona estrazione views/components; Dashboard.jsx ~2.500 righe + stato globale mutabile (`_ctx_*`). |
| UX / design system | 70 | theme.js + uiKit.js maturi; landing non sincronizzata ai token. |
| Mobile | 68 | useIsMobile/useIsTablet sistematici; rifiniture residue. |
| DevOps / CI | 60 | CI unit, autodeploy. Niente staging. |
| Accessibilità | 55 | aria/role presenti ma WCAG non validato, niente focus-mgmt/contrast audit. |
| Test coverage | 50 | Forte su core; scoperti OCR, email, admin, integrazioni. ~45–55%. |
| Osservabilità | 45 | error_log esiste ma niente alerting (Sentry off). |

**Composito ingegneria: ~70/100.**

## 3. Business & go-to-market

| Dimensione | Score | Giudizio |
|---|---:|---|
| Efficienza di capitale | 88 | Costruito da una persona. Top-decile. |
| Dimensione mercato (SAM) | 72 | ~65–80k attività × ~€1.200 ≈ €80–95M SAM. |
| Unit economics (modellati) | 70 | Margine ~80–85%; costo OCR da mettere sotto guardrail. |
| Moat / difendibilità (potenziale) | 65 | Lock-in dati + profondità IT + DB HORECA. Non attivato. |
| Pricing | 62 | Tier sensati; trial 90gg troppo lungo; differenziazione Chain sottile. |
| Compliance / legale | 50 | Placeholder legali, SDI non live, MFA admin bypassato. |
| Execution / team | 45 | Un fondatore-ingegnere; bus factor 1; zero commerciale. |
| Brand / marketing | 40 | Landing reale ma niente social proof, dominio off. |
| Posizione vs incumbent | 35 | Incumbent con SDI/cassa nativi + rete vendita. |
| GTM readiness | 20 | Dominio off, Stripe test, niente motore vendita. |
| Evidenza PMF | 8 | 0 clienti paganti arm's-length. Design partner = attività del fondatore. |
| Traction / revenue | 3 | Pre-revenue, non live. |

**Composito business: ~22/100.** I numeri che pesano (PMF 8, traction 3, GTM 20) sono i più bassi.

---

## 4. Verdetto a due velocità

```
Capacità PRODOTTO      76/100   "ottimo prodotto"
Ingegneria/piattaforma 70/100   "solida"
Business / commerciale 22/100   "non validato"
MATURITÀ AZIENDA (blend) ~30/100
```

Il gap di 54 punti tra prodotto (76) e business (22) È l'azienda. Non c'è un problema di prodotto: c'è un prodotto eccellente in cerca della prova che qualcuno lo paghi.

## 5. Benchmark — competitor stesso settore (maturità azienda)

| Player | Maturità |
|---|---:|
| Fatture in Cloud (TeamSystem) | 90 |
| Cassa in Cloud (Zucchetti) | 88 |
| MarketMan / Foodics | 80 |
| Gestionali verticali IT | 55–70 |
| **FoodOS — capacità prodotto** | **76** |
| **FoodOS — come azienda oggi** | **18** |

Sul pezzo che conta (food cost artigianale + produzione + cassa OCR) il prodotto regge. Come azienda c'è un ordine di grandezza — colmabile, perché il vantaggio degli incumbent è distribuzione e fiducia, non tecnologia.

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
| **FoodOS — azienda oggi** | **~18–20** |
| **FoodOS — craft/efficienza capitale** | **~88** |

Il confronto come azienda non è significativo (fasi di vita diverse). Ma su output-per-risorsa-investita FoodOS è nella loro lega.

## 7. So what

Il composito d'azienda è ~30 non perché il prodotto sia a 30 (è a 76) ma perché la media è zavorrata dai numeri commerciali a una cifra. Portare PMF 8→40 e Traction 3→25 (= 5–10 paganti veri) muove il composito più di qualsiasi punto di prodotto sopra 76. È l'argomento matematico per il feature-freeze e il piano a 90 giorni (vedi analisi strategica).
