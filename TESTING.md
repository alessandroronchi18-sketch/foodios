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

Spec in `tests/e2e/`. CI in `.github/workflows/playwright.yml` (su push a `main`,
usa i GitHub Secrets). Priorità di copertura da aggiungere (vedi CLAUDE.md):
isolamento RLS tra clienti, stock prodotti finiti (carico/scarico), webhook Stripe.

## Convenzione

Quando si scrive un fix per un bug, aggiungere prima un test che lo riproduce
(red → green). Le librerie in `src/lib/` e `api/lib/` sono pure: vanno testate a
livello unit. Per testare funzioni interne, esportarle (come `parseNum`).
