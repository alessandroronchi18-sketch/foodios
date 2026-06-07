# Testing — FoodOS

Due livelli: **unit** (logica pura, veloci, sempre eseguibili) e **e2e** (flussi
reali sul prodotto via Playwright, richiedono account + secret).

## Unit (Vitest)

```bash
npm test            # esegue tutta la suite una volta
npm run test:watch  # modalità watch durante lo sviluppo
```

Test in `tests/unit/**`. Coprono la logica core e blindano i fix:

| File | Cosa verifica |
|---|---|
| `foodcost.test.js` | food cost, semilavorati, **resa che sostituisce le foglie**, **prezzo storico 0 = costo reale**, cicli senza loop, mancanti |
| `rese.test.js` | resa default/clamp, `hasResaIngrediente`, `costoNettoPerG` |
| `lessico.test.js` | terminologia per categoria + fallback generico |
| `storage.test.js` | classificazione shared/per-sede (**log-prezzi shared**) |
| `formatiVendita.test.js` | formati, match, **riconciliazione categoria case-insensitive** |
| `importCassa.test.js` | `parseNum` numeri italiani (virgola/punto), merge chiusure |
| `validate.test.js` | sanitize/validate (XSS, email, UUID, importi, URL) |
| `cryptoCompare.test.js` | confronto constant-time, secret **fail-closed** |

Girano in CI ad ogni push/PR via `.github/workflows/unit.yml` (nessun secret).

## E2E (Playwright)

```bash
npm run test:e2e:install   # solo la prima volta (Chromium)
npm run test:e2e           # richiede env: BASE_URL, TEST_EMAIL, TEST_PASSWORD,
                           # SUPABASE_URL, SUPABASE_SERVICE_KEY
```

CI in `.github/workflows/playwright.yml` (su push a `main`, usa i GitHub Secrets).

### Secret richiesti in CI (GitHub → Settings → Secrets and variables → Actions)
| Secret | Valore |
|---|---|
| `SUPABASE_URL` | URL del progetto Supabase (pubblico) |
| `SUPABASE_SERVICE_KEY` | chiave **secret** `sb_secret_…` (cifrata; mai nei log; non passata alle PR da fork) |
| `VITE_SUPABASE_ANON_KEY` | chiave **publishable** `sb_publishable_…` (pubblica) |
| `TEST_EMAIL` / `TEST_PASSWORD` | account **titolare** reale per gli smoke browser |

Senza questi secret: in CI `global-setup` fallisce con messaggio azionabile (i
test di sicurezza DEVONO girare); in locale skippa in modo pulito (vedi `SEED_OK`).

### Copertura sicurezza (self-contained, girano col solo service key)
- `06-rls-isolation` — un cliente non vede/scrive i dati di un altro.
- `07-dipendente-rls` — il dipendente non legge dati sensibili (stipendi, ricette, ecc.).
- `08-accessi-dipendenti` — invito→attesa→attivazione→accesso; ricette sanitizzate via RPC.
- `07-stripe-webhook`, `08-stock-pf` — firma webhook, stock PF carico/scarico/scarto.

## Convenzione

Quando si scrive un fix per un bug, aggiungere prima un test che lo riproduce
(red → green). Le librerie in `src/lib/` e `api/lib/` sono pure: vanno testate a
livello unit. Per testare funzioni interne, esportarle (come `parseNum`).
