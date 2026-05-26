# FoodOS — E2E tests (Playwright)

Suite Playwright sui 5 flussi critici di FoodOS, eseguita contro l ambiente production (`https://foodios-rose.vercel.app`) o un BASE_URL custom.

## Setup locale

```bash
# 1. Installa i browser (~300 MB, una sola volta)
npm run test:e2e:install

# 2. Configura le credenziali di test
cp .env.test.example .env.test
# (modifica .env.test con le credenziali di un account di test dedicato)

# 3. Esegui i test
export $(cat .env.test | xargs)
npm run test:e2e

# UI mode per debug
npm run test:e2e:ui
```

## CI

Workflow `.github/workflows/playwright.yml` esegue la suite ad ogni push su `main`.

**Secrets richiesti** (Repo Settings → Secrets and variables → Actions):
- `TEST_EMAIL` — email account di test
- `TEST_PASSWORD` — password account di test

**Variables opzionali**:
- `BASE_URL` — override del default `https://foodios-rose.vercel.app`
- `TEST_SIGNUP_DOMAIN` — dominio per le email del signup test (default `foodios-e2e.test`)

## I 5 test

| File | Cosa verifica |
| --- | --- |
| `01-login-logout.spec.js` | Login → dashboard visibile → logout → redirect → re-login → dati persistono |
| `02-signup.spec.js` | Registrazione con email temp → onboarding wizard appare (= org creata) |
| `03-ricettario.spec.js` | Aggiungi ricetta con 2 ingredienti → reload → ricetta presente |
| `04-food-cost.spec.js` | Cambia prezzo ingrediente → fc% aggiornato |
| `05-chiusura-cassa.spec.js` | Inserisci dati chiusura → totali corretti → reload → persistono |

## Note importanti

- Account di test **dedicato**: non usare credenziali reali. Crea un account specifico (es. `playwright@tua-email.com`) con un organizzazione di test isolata.
- Il test signup crea account nuovi ogni run. Se Supabase ha email confirmation ON, il test verifica la schermata di "controlla email" anziché l onboarding completo.
- Screenshot e video dei test falliti sono caricati come artifact del workflow.
- Su failure locale, i risultati sono in `playwright-report/` (apri con `npx playwright show-report`).

## Aggiornare i selettori

I test usano selettori "morbidi" (testo italiano, placeholder, ruoli) per resistere ai refactor. Se l UI cambia in modo significativo:

1. Esegui i test in UI mode (`npm run test:e2e:ui`) e usa il picker per identificare il nuovo selettore.
2. Considera l aggiunta di `data-testid` ai componenti chiave (sidebar items, pulsanti salva, ecc.) per renderli stabili.
