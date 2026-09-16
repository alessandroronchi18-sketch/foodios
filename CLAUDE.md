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

Live: `foodos-rose.vercel.app` (dominio custom `foodos.it` ancora da agganciare — vedi `NEXT_STEPS.md`).

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
| `src/Dashboard.jsx` | Layout principale (~3500 righe), sidebar, switch view |
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
- **I due rossi — REGOLA PERMANENTE** (scelta del titolare, 14/09/2026): il
  bordeaux del marchio (`T.brand` / `C.red`, #6E0E1A) è il colore delle
  **azioni** — pulsanti principali, voce di menu attiva, link, valori di costo
  in evidenza. Il rosso segnale (`T.red` / `C.alert`, #DC2626) è il colore
  degli **allarmi**: giacenza sotto zero, ingrediente esaurito, fattura
  scaduta, salvataggio fallito, scorte insufficienti. Prima li faceva lo stesso
  bordeaux, e in una pagina con un allarme vero l'occhio non sapeva dove
  guardare. Il test `dueRossi.test.js` tiene la regola sugli stati principali.
- **Le pagine AI usano l'intestazione di tutti** (`AiPageHero`, riscritta il
  14/09/2026): nome della pagina nella scala del tema, una riga che dice cosa
  fa, i numeri in linea, un filo sotto. Niente gradienti animati, aloni o
  titoli in oro sfumato: facevano sembrare quelle pagine un'altra applicazione.
- **Console.log**: vengono droppati in build di produzione (vite.config.js). Solo `console.error` / `console.warn` sopravvivono.

---

## Come avviare in locale

```bash
npm install                 # installa anche i git hooks via postinstall
cp .env.example .env.local  # poi inserisci le tue chiavi Supabase + admin email
npm run dev                 # http://localhost:5173
```

**Git pre-push hook attivo**: ogni push su `main` esegue automaticamente
`eslint src/` + `npm test` + `npm run build`. Se uno fallisce, il push e'
bloccato. Per bypassare in emergenza: `git push --no-verify` (sconsigliato).
Branch personali (feat/* fix/*) pushano senza gate — il check lo fa la CI
sulla PR.

Per testare le API in locale serve Vercel Dev:
```bash
npm i -g vercel
vercel dev                  # avvia anche le edge functions su :3000
```

---

## Test

```bash
npm test                  # unit (vitest): 87 file, 1511 test, ~50s
npm run test:coverage     # con coverage
npm run test:e2e          # Playwright e2e (13 spec)
npm run test:e2e:install  # installa Chromium (prima volta)
npm run test:e2e:ui       # apre la UI di Playwright per debug
```

**I test unitari richiedono le env Vite.** Senza `.env.local` (o senza
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` esportate) 5 file falliscono
all'import con un errore fuorviante che non c'entra col test. Valori fittizi
bastano:

```bash
VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test npm test
```

Le tre priorita' storiche (RLS isolation, Stock PF, Stripe webhook) sono coperte:
`tests/06-rls-isolation.spec.js`, `08-stock-pf.spec.js`, `07-stripe-webhook.spec.js`.

Soglie coverage attualmente abbassate (lines 30 / functions 50 / statements 30 /
branches 60) da quando il calcolo include `src/components` e `src/views`.

---

## Deploy

```bash
npm run push                # git push + verifica che il deploy sia ANDATO
git push                    # autodeploy GitHub → Vercel (1-2 min)
vercel --prod --yes         # deploy forzato dal locale
```

**Usa `npm run push`, non `git push` liscio.** Il 14/09/2026 due push sono
passati dal gate pre-push con il build rotto: su Vercel il deploy è fallito in
quattro secondi, due volte, e la produzione è rimasta ferma tre commit indietro
senza nessun segnale. Il push dice "ok", il deploy muore in silenzio, e l'unico
modo di accorgersene è che il sito non cambia.

Due strati di protezione, da allora:
1. il gate pre-push ora fa contare davvero l'esito del build (`set -o pipefail`:
   prima il risultato passava per `| tail -5`, e in una pipeline conta l'ultimo
   comando, che riesce sempre);
2. `npm run push` dopo il push aspetta che la produzione serva **quel** commit
   (lo legge da `CACHE_VERSION` in `/sw.js`) e, se non arriva, dice cosa
   guardare (`npx vercel ls`, `npx vercel inspect --logs`).

Il sospetto numero uno quando il deploy fallisce è il **prebuild**: controllo
grammaticale italiano e cricchetto sui token di design. In locale girano solo
con `npm run build` — `npx vite build` li salta.

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

## Ogni difetto corretto lascia dei test

Regola del titolare, 16/09/2026: **«per ogni difetto o errore individuato,
dopo la correzione si creano test per far sì che non accada più e che
controllano la correzione e tutto ciò che c'è vicino»**.

Non è «aggiungi un test». Sono tre cose, e la terza è quella che ripaga:

1. **Il test che riproduce il difetto.** Deve fallire sul codice di prima e
   passare su quello di adesso. Se passa anche prima, non stai proteggendo
   niente.
2. **Il test della correzione.** Verifica che la soluzione faccia quello che
   dice, non solo che il sintomo sia sparito.
3. **I test di quello che c'è intorno.** Un difetto è quasi sempre il membro
   visibile di una famiglia. Se rinominare una ricetta ne lasciava due, si
   prova anche: rinominare senza cambiare nome, creare una ricetta nuova, chi
   la usava come ingrediente, il costo rimasto nel listino. Se una data
   sbagliava per il fuso, si provano le altre date dello stesso file.

**Il commento in cima al file di test dice il difetto vero, con la data e
com'è stato scoperto.** Serve a chi lo leggerà fra sei mesi: un test senza il
racconto del difetto sembra una regola arbitraria, e prima o poi qualcuno lo
cancella perché «dà fastidio».

Il posto dei test è `tests/unit/`, un file per famiglia di difetti, nome in
italiano che dice cosa protegge (`rinominaRicetta.test.jsx`,
`avvioSenzaPdf.test.js`, `tabelleLargheTelefono.test.js`).

---

## Agenti: il diario è obbligatorio

Un agente che lavora in parallelo **deve tenere un diario su file** e
aggiornarlo mentre lavora, non alla fine. Regola del titolare, 16/09/2026:
«gli agenti devono sempre lasciare tracce, così se si interrompono per
problemi, quando riprendono non ripartono dall'inizio ma dal punto in cui si
sono fermati».

Non è teoria: il 16/09/2026 due agenti su tre si sono fermati a metà per un
errore di autenticazione. Quello che avevano scritto sul diario si è potuto
riprendere; quello che avevano solo in testa no.

**Come si fa.** Ogni agente riceve un percorso suo, in `scratchpad`:

```
<scratchpad>/agente-<nome>.md
```

e queste istruzioni:

1. **Prima cosa da fare: leggere il proprio diario.** Se esiste ed è pieno, si
   riparte dall'ultima riga, non dall'inizio.
2. Scrivere sul diario **a ogni pezzo finito**, non a percentuali fisse: il
   file toccato, cosa è cambiato, cosa manca ancora. Un elenco con le voci
   fatte spuntate.
3. Sul diario ci vanno anche **i difetti veri trovati per strada** (file:riga,
   cosa succede, come riprodurlo): sono la parte più preziosa del lavoro e
   sono quella che si perde per prima se l'agente si interrompe.
4. L'ultima riga del diario dice sempre **qual è il prossimo passo**.

Chi lancia l'agente: dagli il percorso del diario nel prompt, e digli di
leggerlo per primo.

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
