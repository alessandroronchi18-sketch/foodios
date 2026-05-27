# FoodOS

SPA React + Vite, backend Supabase (Postgres + Auth + RLS), deploy su Vercel
(produzione: `foodios-rose.vercel.app`).

## Test E2E (Playwright)

Suite end-to-end in `tests/`, eseguita con Chromium contro l'ambiente di
produzione (o un `BASE_URL` custom). Copre login/logout, signup 2-step,
ricettario, food cost e chiusura cassa.

### Eseguire in locale

```bash
cp .env.test.example .env.test     # compila i valori reali
export $(grep -v '^#' .env.test | xargs)
export SUPABASE_URL=...            # URL progetto Supabase
export SUPABASE_SERVICE_KEY=...    # service_role key (sensibile!)
npx playwright install chromium
npx playwright test --reporter=list
```

`global-setup.js` semina una ricetta deterministica (`SEED TORTA TEST`) per
l'account di test e scrive `tests/.seed-state.json` (ignorato da git).

### CI — GitHub Secrets & Variables

Il workflow `.github/workflows/playwright.yml` gira su push a `main` e via
`workflow_dispatch`. Configura su GitHub → **Settings → Secrets and variables → Actions**:

#### Secrets (`Settings → Secrets → Actions → New repository secret`)

| Nome | Descrizione |
|------|-------------|
| `TEST_EMAIL` | Email dell'account di test dedicato (es. `playwright-e2e@foodios-internal.com`). |
| `TEST_PASSWORD` | Password dell'account di test. |
| `SUPABASE_URL` | URL del progetto Supabase (lo stesso valore di `VITE_SUPABASE_URL`). |
| `SUPABASE_SERVICE_KEY` | **service_role** key Supabase — usata solo da `global-setup.js` per seminare i dati. Non esporre mai lato client. |

#### Variables (`Settings → Variables → Actions → New repository variable`)

| Nome | Default | Descrizione |
|------|---------|-------------|
| `BASE_URL` | `https://foodios-rose.vercel.app` | URL da testare. Opzionale: override per ambienti di staging. |
| `TEST_SIGNUP_DOMAIN` | `foodios-e2e.test` | Dominio per le email effimere generate dal test di signup. |

> Nota: il test di signup (`02`) genera account effimeri ma su run ripetuti
> Supabase applica un rate-limit email a livello di progetto ("Troppi
> tentativi…"). Il test accetta quell'alert come esito valido, perché dimostra
> che il flusso UI ha raggiunto il backend.
