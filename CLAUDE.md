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

## Le sostituzioni di massa sul codice: la regola del 19/09/2026

Il 19/09/2026 una sostituzione automatica su tutto il file (`#FCD34D` → `T.amber`) ha rotto
`ImportWizard.jsx` e sporcato un commento in `theme.js`. Non deve succedere mai più. Le regole,
in ordine di importanza:

1. **Un colore, o qualsiasi altro letterale, vive in almeno tre contesti diversi, e ognuno vuole
   una scrittura diversa.** Un solo pattern non può essere giusto per tutti e tre:

   | dove si trova | prima | dopo |
   |---|---|---|
   | valore in un oggetto JS | `color: '#FCD34D'` | `color: T.amber` |
   | dentro un template | `` `1px solid #FCD34D` `` | `` `1px solid ${T.amber}` `` |
   | attributo JSX | `color="#FCD34D"` | `color={T.amber}` |

   Quindi: **un pattern per contesto**, ancorato al contesto (`: '#XXX'`, `` `…#XXX…` ``,
   `="#XXX"`), mai un `replace` nudo del letterale.

2. **Dopo ogni sostituzione di massa si passa subito dal parser, prima di toccare qualunque
   altra cosa**: `npx eslint src/ api/ --quiet` e, se il file è nel bundle, `npm run build`.
   Il costo è venti secondi; il costo di non farlo è stato un errore di sintassi scoperto tre
   passaggi dopo, quando non era più chiaro quale regex l'avesse prodotto.

3. **Un danno da regex NON si ripara con un'altra regex.** È il momento in cui si peggiora:
   il secondo passaggio ha messo `${T.amber}` dentro un oggetto (errore di sintassi),
   `${${T.amber}}` dentro un template e ha corrotto un commento. Si ripara così: `grep -n` di
   tutte le occorrenze, l'elenco davanti agli occhi, **una per una**.

4. **Una regex non sa cos'è un commento, una stringa di testo o il nome di una variabile.**
   Prima di scrivere, si conta: `grep -c` del pattern, e se il numero non torna con quello che
   ci si aspetta, non si scrive. Se le occorrenze sono meno di una ventina si modificano a mano
   e basta: è più veloce che verificare una regex.

5. **Il controllo che chiude il lavoro**, oltre a lint e build:
   `grep -rn '${${' src/` (doppia interpolazione) e
   `grep -rn ':\s*${' src/` (interpolazione fuori da un template).

---

## «Fai tutto come sempre» — cosa vuol dire

Regola del titolare, 19/09/2026: quando dice **«fai tutto come sempre»**, o
«nel migliore dei modi», intende **due cose insieme, non una**:

1. **Nel migliore dei modi.** La qualità non si abbassa mai: la correzione vera
   invece del sintomo, i test che riproducono il difetto, i numeri verificati
   sui dati veri invece che dedotti, e dire sempre quello che non si sa.
2. **E contemporaneamente nel modo più efficiente.** Ogni token speso bene:
   non rileggere quello che si sa già, non rifare una misura che c'è, non
   scrivere tre paragrafi dove ne basta uno, non lanciare un agente per un
   lavoro da cinque minuti — e lanciarne quattro quando i lavori sono quattro
   e stanno su file diversi.

Non sono in conflitto, ed è questo il punto: **il lavoro fatto bene la prima
volta è anche quello che costa meno.** Quasi tutto il tempo perso in questo
progetto se n'è andato in cose rifatte — una misura presa con lo strumento
sbagliato, un test che non provava niente, una correzione applicata a metà.

Quello che NON vuol dire: tagliare la verifica per andare più veloce. Un
risultato consegnato senza averlo provato non è efficiente, è solo veloce a
sbagliare.

---

## Le sette lenti

Regola del titolare, 16/09/2026: lavorare su Foodos **come il miglior designer
UX/UI + imprenditore + CEO + CFO + direttore del personale + ingegnere +
economista**, non solo come chi scrive codice.

Non è una richiesta di tono: è una richiesta di angoli di lettura. Le cose che
hanno cambiato di più questo prodotto non erano difetti di codice — 413
organizzazioni su 423 erano account di prova, il dominio era in vendita, i
piani a listino non erano quelli nel database, la pagina in vetrina si
contraddiceva da sola sui limiti. Nessuna di queste si vede compilando.

Prima di consegnare, passare le sette domande:

1. **Design** — si capisce in tre secondi? Un numero senza un riferimento è un
   numero, non un'informazione. Se il programma non sa una cosa lo dice,
   invece di scrivere zero.
2. **Imprenditore** — serve al cliente che c'è oggi, o a uno immaginario? Mara
   ha due sedi, trenta gusti e zero chiusure di cassa registrate.
3. **CEO** — avvicina o allontana il primo cliente pagante? Il prodotto è a
   zero ricavi: ogni ora va giustificata contro quella domanda.
4. **CFO** — dove sono i soldi in questa schermata? Ogni numero che tocca
   incassi, food cost o pagamenti va trattato come un numero di bilancio: si
   dice su quante giornate è calcolato, e un dato mancante non si inventa mai
   (food cost zero non è «gratis», è «non lo so»).
5. **Personale** — chi lo usa? Il dipendente in laboratorio non deve vedere
   comandi che il database gli rifiuta; il titolare non deve restare chiuso
   fuori da una regola di sicurezza.
6. **Ingegnere** — verificare il righello prima della misura, e lasciare test
   che riproducano il difetto.
7. **Economista** — quanto costa il difetto se resta, e quanto costa toglierlo?
   Si comincia da quello che costa di più lasciato lì.

**La regola che le tiene insieme:** dire sempre quello che non si sa. Un
prodotto che dichiara i propri buchi vale più di uno che sembra completo.

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
