# FoodOS — Analisi prodotto (stile McKinsey, scoring 1–100)

> Aggiornato: 2026-06-06 · Basata su evidenza diretta dal codice (LOC, test, migration, pattern).
> I numeri di mercato/competitor sono stime ragionate (knowledge cutoff gen-2026).
>
> **Rifare periodicamente** e confrontare i punteggi nel tempo.

### Storico compositi
| Data | Prodotto | Ingegneria | Business | Maturità azienda |
|---|---:|---:|---:|---:|
| 2026-06-05 | 76 | 70 | 22 | ~30 |
| 2026-06-06 | **79** | **75** | **22** | **~31** |

Δ 6 giu: sessione tutta prodotto/UX (Personale rifondato, home+nav premium, +68 test, RLS stipendi solo-titolare). Business invariato → la forbice prodotto↔mercato si allarga.

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
| Personale | 80 | (6 giu) Organigramma per reparto editabile, copertura turni per reparto, consuntivo ore + straordinari, analisi costo (incidenza su fatturato), viste gg/sett/mese, RLS solo-titolare. |
| Cassa + OCR scontrini | 77 | Claude Vision, drift porzioni, merge delivery; (6 giu) fix toggle foto/manuale, tabella ordinabile. OCR non testato e2e. |
| Produzione giornaliera | 77 | Save-first anti-dataloss, stock PF, double-submit guard; (6 giu) modifica sessione storico con doppia conferma. |
| Magazzino / stock PF | 74 | Per-sede, soglie, RPC atomiche; (6 giu) fix bug isTablet, formattazione. Manca paginazione. |
| Sprechi / omaggi | 68 | Causali, impatto food cost. |
| HACCP | 62 | Range temperature, trigger. Sottile vs tool dedicati. |
| Onboarding wizard | 60 | 3–4 step. Attivazione non validata. |
| AI Assistant | 58 | Azioni suggerite, cache. Consulente proattivo non costruito. |
| Integrazioni (15 parser) | 55 | Ampiezza senza profondità/validazione. Over-built. |
| Fatturazione SDI | 50 | Endpoint esiste, non testato in produzione. Blocco legale n°1. |
| Moduli adiacenti | 56 | Tanta superficie, profondità variabile. |

**Composito capacità prodotto: ~79/100** (era 76 il 5 giu).

## 2. Ingegneria & piattaforma

| Dimensione | Score | Giudizio |
|---|---:|---|
| UX / design system | 83 | (6 giu) Home premium (hero brand, KPI con icone, stock a barre), nav orizzontale in topbar con mega-menu + dropdown profilo, chrome a gradiente brand, primitivi premium condivisi (KPI, classi .fos-tile), separatore migliaia + tooltip ovunque. Da finire: replica stile a tutte le pagine interne. |
| Documentazione interna | 84 | CLAUDE.md (+ regole permanenti mobile/numeri), STATO_PROGETTO, NEXT_STEPS, ROADMAP, TESTING. |
| Sicurezza | 85 | RLS FORCE, webhook idempotenti, AES-256-GCM, rate-limit, session fingerprint, zero-trust /api/ai, watermark; (6 giu) RLS solo-titolare su dipendenti/turni (chiuso leak stipendi). |
| Qualità codice | 77 | Error handling, retry esponenziale, sanitize; (6 giu) 3 bug reali risolti. Dashboard.jsx cresciuto con la nav. |
| Performance | 74 | Bundle 246KB (-78%), code-splitting. Manca paginazione su liste. |
| Test coverage | 62 | (6 giu) 259 test verdi (28 file), +46 nuovi, 2 suite rotte risolte. Scoperti ancora OCR, email, admin. |
| Mobile | 73 | useIsMobile/useIsTablet sistematici, tabelle scrollabili, regole permanenti; (6 giu) nav nuova da verificare su mobile. |
| Architettura / scalabilità | 72 | Buona estrazione views/components; Dashboard.jsx ~2.700 righe + stato globale mutabile (`_ctx_*`). |
| Accessibilità | 58 | role/aria/keyboard sui nuovi controlli; WCAG ancora non validato. |
| DevOps / CI | 60 | CI unit, autodeploy. Niente staging. |
| Osservabilità | 48 | error_log + Sentry collegato; alerting ancora minimale. |

**Composito ingegneria: ~75/100** (era 70 il 5 giu).

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
Capacità PRODOTTO      79/100   "ottimo prodotto" (era 76)
Ingegneria/piattaforma 75/100   "solida"           (era 70)
Business / commerciale 22/100   "non validato"     (invariato)
MATURITÀ AZIENDA (blend) ~31/100                    (era ~30)
```

Il gap prodotto↔business è salito a **57 punti** (79 vs 22): ogni sessione di build lo allarga. Non c'è un problema di prodotto — c'è un prodotto sempre più eccellente in cerca della prova che qualcuno lo paghi. Il prossimo punto che muove la maturità azienda è commerciale (call design-partner martedì), non codice.

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
