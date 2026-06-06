# FoodOS — Guida per sviluppatori (e per Claude Code)

> Lo trovi anche tu, Claude? Leggi questo file PRIMA di toccare il codice. Risparmierai 2 ore.

## Cos'e' FoodOS

SaaS B2B per la ristorazione artigianale italiana (pasticcerie, gelaterie, bar).
Gestionale all-in-one: ricettario + food cost + produzione + magazzino + cassa + fatturazione fornitori + HACCP + AI + multi-sede.

Pre-revenue, design-partner-driven. **Mara dei Boschi** (Torino) e' il primo design partner.

---

## Stack

- **Frontend**: React 18 + Vite 5 (`src/`)
- **API**: Vercel Edge/Node Functions (`api/`)
- **DB**: Supabase (Postgres + Auth + RLS) — schema in `supabase/migrations/`
- **Pagamenti**: Stripe (subscription + checkout + portal)
- **Email**: Resend
- **AI**: Claude API (Anthropic) via `api/ai.js`

Live: `foodios-rose.vercel.app` (dominio custom `foodios.it` ancora da agganciare — vedi `NEXT_STEPS.md`).

---

## Architettura mentale in 5 punti

### 1. Multi-tenant via RLS
**Ogni tabella ha `organization_id`** + policy `for all using (organization_id = get_user_org_id())`. Il client non puo' MAI vedere dati di un'altra org. Per le pagine admin si usa `service_role` key che bypassa RLS (solo da Vercel Functions).

### 2. Multi-sede via `sede_id`
Le organization hanno 1+ sedi (`public.sedi`). Alcuni dati sono **shared** (ricettario, prezzi, regole — `sede_id = NULL`), altri sono **per-sede** (magazzino, produzione, chiusure, sprechi).

L'utente ha sempre una `sedeAttiva` in memoria (`useAuth`); `sedeId` viene propagato come prop ai componenti per leggere/scrivere il dato giusto.

### 3. Storage astratto via `sload`/`ssave`
`src/lib/storage.js` astrae le scritture su `public.user_data` (jsonb generico keyed per `data_key`). Lista delle chiavi in `src/lib/storageKeys.js`.

```js
import { sload, ssave } from '../lib/storage'
await ssave('pasticceria-magazzino-v1', magazzino, orgId, sedeId)
const m = await sload('pasticceria-magazzino-v1', orgId, sedeId)
```

`ssave` gia' include retry su errori transient e gestisce duplicati legacy.

### 4. Pattern scrittura → state
Per evitare data loss, SEMPRE:
1. Calcola lo state nuovo
2. `await ssave(...)` PRIMA di `setState`
3. Solo se save riesce, applica `setState`
4. Su error, NON toccare lo state e mostra toast

Esempio: `ProduzioneGiornalieraView.handleConferma` (riga ~100).

### 5. Ruoli
`profiles.ruolo` ∈ {`titolare`, `dipendente`}. Il dipendente vede solo le view operative (vedere `DIPENDENTE_VIEWS` in `Dashboard.jsx`) e a livello DB puo' scrivere solo le 6 chiavi operative (`is_chiave_operativa` SQL function).

---

## Mappa file chiave

| File | Ruolo |
|---|---|
| `src/App.jsx` | Router minimale (path-based) + auth gating |
| `src/Dashboard.jsx` | Layout principale (~2400 righe), sidebar, switch view |
| `src/auth/useAuth.js` | Hook auth (user, org, sedi, sedeAttiva) |
| `src/auth/AuthPage.jsx` | Login + registrazione 2 step |
| `src/admin/AdminPage.jsx` | Pannello admin (solo `VITE_ADMIN_EMAIL`) |
| `src/onboarding/OnboardingWizard.jsx` | 4 step al primo accesso |
| `src/lib/foodcost.js` | Calcolo food cost (ricorsivo per semilavorati, depth 3 + ciclo-detect) |
| `src/lib/storage.js` | ssave/sload + retry |
| `src/lib/stockPF.js` | Wrapper RPC su `stock_prodotti_finiti` (carico/scarico/scarto) |
| `src/lib/trasferimenti.js` | Wrapper RPC trasferimenti tra sedi |
| `src/views/*.jsx` | View estratte da Dashboard (Produzione, Chiusura, Magazzino, ecc.) |
| `api/admin.js` | Endpoint admin (lista clienti, KPI, azioni, MRR Stripe, errori, banner) |
| `api/ai.js` | Proxy Claude API |
| `api/feedback.js` | Inbox feedback (POST) |
| `api/stripe-*.js` | Checkout, portal, webhook |
| `api/lib/auth.js` | `verificaToken`/`verificaAdmin` helpers |
| `api/lib/safeError.js` | Error handler con logging su DB |
| `supabase/migrations/*.sql` | Schema DB versionato (idempotenti) |

---

## Flusso utente core (data flow)

```
[Utente apre app]
  ↓ useAuth → fetch session → fetch organization + sedi + profile
  ↓ setSedeAttiva(default sede)
  ↓ Dashboard mount → ricarica tutti i dati via sload(key, orgId, sedeId)
  ↓
[Cambia sede]
  ↓ setSedeAttiva(altraSede)
  ↓ useEffect([orgId, sedeId]) → ricarica solo le chiavi PER-SEDE
  ↓
[Registra produzione]
  ↓ handleConferma() in ProduzioneGiornalieraView
  ↓ calcola riepilogo (decrement magazzino + sessione)
  ↓ await ssave(SK_MAG, ...) + await ssave(SK_GIOR, ...)
  ↓ se ok → setMagazzino(...) + setGiornaliero(...) + RPC caricoProduzionePF
  ↓ se ko → toast errore, niente state mutation
```

---

## Convenzioni codice

- **Naming prodotto**: SEMPRE `.toUpperCase().trim()` quando si scrive su `stock_prodotti_finiti.prodotto_nome`. Vedere `prodottoKey` in `ProduzioneGiornalieraView`.
- **Imports stockPF**: tutti STATIC (`import { caricoProduzionePF } from '../lib/stockPF'`). Dynamic imports invalidano code splitting.
- **alert()**: NON usare in flussi utente. Usare `notify()` (passato come prop dal Dashboard, mostra un toast). `alert()` ammesso solo in admin per azioni distruttive (delete codici, ecc).
- **Bottoni async**: SEMPRE `disabled={saving}` durante operazioni await. Evita double-submit.
- **Mobile/Tablet — REGOLA PERMANENTE**: ogni modifica all'UI va resa equivalente e curata anche su **mobile e tablet**, non solo desktop. Prima di considerare finita una modifica:
  - Usa `useIsMobile` (e `isTablet` dove serve) per i breakpoint.
  - Grid con > 2 colonne devono collassare (`1fr` o 2 colonne) su mobile.
  - Le tabelle larghe devono stare in un contenitore con `overflowX: 'auto'` (mai `overflow: 'hidden'` che le comprime su mobile).
  - Touch target ≥ ~40px; font input ≥ 16px su mobile (evita lo zoom iOS).
  - Verifica che nessuna riga/etichetta vada a capo in modo rotto e che i numeri restino allineati.
- **Formattazione numeri — REGOLA PERMANENTE**: importi e numeri a schermo SEMPRE con separatore migliaia IT (`toLocaleString('it-IT')`). Usa gli helper in `src/views/_shared.jsx`: `fmt` (€ 2 decimali), `fmt0` (€ arrotondato all'unità), `fmtp` (%). I box/KPI grandi vanno arrotondati all'unità; i dettagli in tabella possono avere 2 decimali; le percentuali restano %. Celle numeriche con `fontVariantNumeric: 'tabular-nums'` e allineate a destra. Etichette con abbreviazioni criptiche → `title` (tooltip) + `cursor: 'help'`.
- **Console.log**: vengono droppati in build di produzione (vite.config.js). Solo `console.error` / `console.warn` sopravvivono.

---

## Come avviare in locale

```bash
npm install
cp .env.example .env.local  # poi inserisci le tue chiavi Supabase + admin email
npm run dev                 # http://localhost:5173
```

Per testare le API in locale serve Vercel Dev:
```bash
npm i -g vercel
vercel dev                  # avvia anche le edge functions su :3000
```

---

## Test

```bash
npm run test:e2e          # Playwright e2e (auth, signup, ricettario, food cost, chiusura)
npm run test:e2e:install  # installa Chromium (prima volta)
npm run test:e2e:ui       # apre la UI di Playwright per debug
```

Coverage attuale ~5% (5 spec). **Priorita' test da scrivere**:
1. RLS isolation (cliente A non vede dati cliente B)
2. Stock PF (carico produzione + scarico vendita)
3. Stripe webhook (subscription lifecycle)

---

## Deploy

```bash
git push                    # autodeploy GitHub → Vercel (1-2 min)
vercel --prod --yes         # deploy forzato dal locale
```

⚠️ **Vercel CLI deploya il working tree LOCALE**, NON il branch remote. Se hai modifiche non pushate, finiscono in prod.

---

## Common pitfalls

1. **"Stock vetrina con prodotti fantasma"**: stock_prodotti_finiti non e' allineato con cosa l'utente ricorda di aver prodotto. Cause possibili:
   - Trasferimento da altra sede mai ricevuto (vai a /trasferimenti)
   - Eliminata una sessione produzione PRIMA del fix (PR `fix/dashboard-menu-stock`)
   - Caso mismatch tra produzione e cassa — NON DOVREBBE PIU' SUCCEDERE post-audit, ma se accade vedere `MagazzinoView` bottone "Azzera"

2. **"Data loss su produzione"**: se l'utente vede `setMagazzino(nm)` chiamato PRIMA di `await ssave(...)`, e' la formula da invertire. Cerca pattern `setX(...); await ssave(...)` e converti in `await ssave(...); setX(...)`. Audit del 2026-05-30 ha trovato 6+ callsite cosi'.

3. **"L'admin login dice Accesso negato"**: probabile `mfa_check_failed`. Vedere `api/admin.js:verificaAdmin` + flag `DISABLE_ADMIN_MFA`.

4. **"Il pannello cliente non carica"**: orgId/sedeId null durante il primissimo render. Tutti i componenti devono avere `if (!orgId) return ...` come guard.

---

## Documenti correlati

- `STATO_PROGETTO.md` — feature timeline + URL chiave
- `NEXT_STEPS.md` — TODO esterni (dominio, SDI, Stripe live, ecc.)
- `README.md` — setup test + CI

---

## Stile commit messages

Convenzione semantica:
- `feat(area):` nuova funzionalita'
- `fix(area):` bugfix
- `chore:` deps, build, ecc.
- `docs:` documentazione

Esempio: `feat(admin): tier 2 — Stripe MRR + errori produzione + bulk actions`

Footer: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` se la PR e' assistita da AI.
