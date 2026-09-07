# FoodOS — Stato del Progetto
> Aggiornato: 2026-09-07 (sera) — `main` oltre `4172405` (19 commit sopra
> `49c683a`, tutti in produzione: verificato leggendo `CACHE_VERSION` da
> `/sw.js` in prod). Il lotto prima nota di cassa + import registro incassi e'
> committato in locale e **non ancora pushato**.
>
> **Repo di lavoro: `/Users/aler/foodos`.** La copia in `~/Desktop/foodos` e' ferma
> al 1 set, sta dentro iCloud Drive (git lentissimo) e va ignorata.
>
> **Salute**: test 1721/1721 verdi (99 file, 46s), ESLint pulito su `src/` e `api/`,
> build Vite 18s, grammar check OK, controllo token di design OK.
> 84 migration SQL in repo (ultima `20260907f_prima_nota_cassa`), **tutte applicate in
> produzione** — verificato via SQL diretto il 7/09 (vedi `foodos-db-access`).
>
> Architettura: code splitting completo, tablet 3-tier responsive, theme tokens
> centralizzati, ICONS modulo dedicato, safeStorage Safari-safe.
> `Dashboard.jsx` sceso da ~6700 a **3488 righe** grazie allo scorporo in `src/views/`
> (32 view estratte), `src/components/` (66), `src/lib/` (79 moduli), `api/` (45 endpoint).

---

## 🌐 URL e Accessi

| Risorsa | URL / Valore |
|---|---|
| **App live (produzione)** | https://foodos-rose.vercel.app |
| **Repository GitHub** | https://github.com/alessandroronchi18-sketch/foodos |
| **Git remote effettivo** | `https://github.com/alessandroronchi18-sketch/foodios.git` (ancora il nome vecchio, funziona per redirect — da rinominare) |
| **Vercel dashboard** | https://vercel.com/alessandroronchi18-7807s-projects/foodos |
| **Supabase dashboard** | https://supabase.com/dashboard/project/rmecvymnwzgrfigljlid |
| **Supabase URL** | https://rmecvymnwzgrfigljlid.supabase.co |
| **Admin email (login app)** | `alessandro.ronchi18@gmail.com` — verificato nel bundle di prod il 07/09. E' il valore di `VITE_ADMIN_EMAIL` (client, mostra la UI `/admin`) e deve combaciare con `ADMIN_EMAIL` lato server su Vercel, che e' il gate vero e fail-closed. Non c'entra con `alessandroar@maradeiboschi.com`, che e' solo l'email autore dei commit git. |

---

## 🔑 Variabili d'Ambiente

File locale: `/Users/aler/foodos/.env.local` (gitignored, va creato a mano da `.env.example`)

```
VITE_SUPABASE_URL=https://rmecvymnwzgrfigljlid.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtZWN2eW1ud3pncmZpZ2xqbGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NjIzNDksImV4cCI6MjA5NDEzODM0OX0._105TIELhkeq9hnwzqXQNSqTgILzW9_p8DmSYWpnVpo
VITE_ADMIN_EMAIL=alessandroar@maradeiboschi.com
```

Su **Vercel** queste stesse variabili vanno aggiunte in Settings → Environment Variables
(più eventuali server-side come `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`).

---

## 🏗️ Stack Tecnico

- **Frontend**: React 18 + Vite 5
- **Backend/DB**: Supabase (PostgreSQL + Auth + RLS)
- **Deploy**: Vercel (Edge Functions per `/api/*`)
- **Grafici**: Recharts
- **Email**: Resend
- **AI**: Claude API (Anthropic) via `/api/ai.js`
- **Excel**: xlsx (caricato dinamicamente)

---

## 📁 Struttura File Chiave

```
foodos/
├── src/
│   ├── App.jsx                    # Router principale, gestisce auth state
│   ├── Dashboard.jsx              # App principale (6700+ righe) — tutto il UI
│   ├── main.jsx                   # Entry point React
│   ├── auth/
│   │   ├── AuthPage.jsx           # Login / Registrazione / Reset password
│   │   ├── useAuth.js             # Hook auth (user, org, sedi, signIn/Out)
│   ├── admin/
│   │   └── AdminPage.jsx          # Pannello admin (solo alessandroar@)
│   ├── onboarding/
│   │   └── OnboardingWizard.jsx   # Wizard 3 step al primo accesso
│   ├── components/
│   │   └── SedeSelector.jsx       # Dropdown sede (sidebar) — già pronto
│   └── lib/
│       ├── supabase.js            # Client Supabase
│       └── storage.js             # sload/ssave con logica shared vs per-sede
├── api/
│   ├── ai.js                      # Proxy Claude API (Vercel Function)
│   ├── admin.js                   # API admin (lista clienti, approva, ecc.)
│   └── send-email.js              # Invio email via Resend
├── supabase_setup.sql             # Schema completo DB (già eseguito)
├── vercel.json                    # Config Vercel (rewrites + maxDuration)
├── vite.config.js
└── .env.local                     # Variabili locali (NON committato)
```

---

## 💶 Piani

Pricing 3-tier dal 24/06. Nome, prezzo e descrizione sono **dinamici dal pannello
admin** (tabella `plan_pricing_meta`); i default sono in `api/pricing.js` e
`src/lib/usePlanPricing.js`. Trial 3 mesi gratis senza carta.

| Piano (marketing) | Chiave DB | Prezzo | Posizionamento |
|---|---|---|---|
| **Bottega** | `base` | €69/mese | Una sede, l'essenziale. |
| **Maestro** | `pro` | €149/mese | Sostituisce un controller part-time. |
| **Insegna** | `chain` | €399/mese | Sostituisce 1 controller + IT contractor. |

> Nessuna limitazione sul numero di sedi in alcun piano. La differenziazione e' su
> utenti multipli, integrazioni API, branding e livello di supporto.
> Il gating per feature sta in `src/lib/planAccess.js`.

> DB: il valore della colonna `piano` è validato dal CHECK constraint `('trial','base','pro','enterprise')`. Il naming marketing "Chain" mappa internamente su `enterprise` (oppure si può aggiungere `chain` al constraint se si preferisce coerenza letterale).

---

## 🗄️ Schema Database (già in produzione)

### `organizations`
| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| nome | text | Nome attività |
| tipo | text | pasticceria / bar / ecc. |
| piano | text | trial / base / pro / enterprise (vedi sezione Piani) |
| trial_ends_at | timestamptz | Default: now + 90 giorni |
| approvato | boolean | true = cliente pagante |
| attivo | boolean | soft delete |

### `sedi`
| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK → organizations |
| nome | text | |
| indirizzo | text | |
| citta | text | |
| is_default | boolean | |
| attiva | boolean | soft delete |

### `profiles`
| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK = auth.users.id |
| organization_id | uuid | FK → organizations |
| email | text | |
| nome_completo | text | |
| ruolo | text | titolare / dipendente |
| approvato | boolean | |

### `user_data`
| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK → organizations |
| sede_id | uuid | NULL per dati condivisi |
| data_key | text | chiave storage |
| data_value | jsonb | payload |
| UNIQUE | | (organization_id, sede_id, data_key) |

**Chiavi condivise tra sedi** (sede_id = NULL):
`pasticceria-ricettario-v1`, `pasticceria-ai-v1`, `pasticceria-actions-v1`,
`pasticceria-esclusi-v1`, `pasticceria-prezzi-importati-v1`,
`pasticceria-regole-v1`, `pasticceria-semilavorati-v1`,
`pasticceria-formati-vendita-v1` (SK_FORMATI)

**Chiavi per sede** (sede_id = UUID sede):
`pasticceria-magazzino-v1`, `pasticceria-produzione-v1`,
`pasticceria-giornaliero-v1`, `pasticceria-chiusure-v1`,
`pasticceria-logrif-v1`, `pasticceria-movimenti-speciali-v1` (SK_MOV)

**Chiavi operative** (scrivibili anche da `dipendente` via `is_chiave_operativa`):
`pasticceria-magazzino-v1`, `pasticceria-produzione-v1`,
`pasticceria-giornaliero-v1`, `pasticceria-chiusure-v1`,
`pasticceria-logrif-v1`, `pasticceria-movimenti-speciali-v1`

### `audit_log` (registro attività)
Riempita dai trigger `trg_log_user_data/profile/sede/org` (mig. `20260606`).
Lettura solo titolare via guard `not is_dipendente()`. UI: Azienda → Registro attività.

---

## ✅ Cosa è Stato Fatto

### Autenticazione & Routing
- [x] Login / Registrazione con Supabase Auth
- [x] Trigger DB auto-crea `organization` + `sede` + `profile` alla registrazione
- [x] Flusso reset password completo (`PASSWORD_RECOVERY` intercettato in `App.jsx` prima del routing)
- [x] Schermata trial scaduto
- [x] Pannello Admin (solo `VITE_ADMIN_EMAIL`) — lista clienti, KPI, approva/trial
- [x] Onboarding Wizard 3 step al primo accesso

### Dashboard
- [x] Sidebar navigazione con icone e sezioni
- [x] Home dashboard con KPI riassuntivi
- [x] Ricettario (carica .xlsx, analisi food cost per ricetta)
- [x] Semilavorati (gestione ricette interne)
- [x] Simulatore prezzi / Food Cost
- [x] P&L (Profit & Loss)
- [x] Produzione giornaliera
- [x] Storico produzione
- [x] Magazzino (giacenze, alert soglia, rifornimenti, import prezzi)
- [x] Chiusura cassa (con OCR scontrini via Claude Vision)
- [x] AI Assistant (azioni suggerite)
- [x] Impostazioni (nome attività, import prezzi, account)
- [x] Pulsante logout in sidebar (rosso, sempre visibile)

### Storage & Multi-sede ✅ completo
- [x] `storage.js` — logica `sload`/`ssave` con `sede_id` corretto per shared vs per-sede
- [x] `SedeSelector.jsx` — dropdown integrato nella sidebar (`Dashboard.jsx:8923`)
- [x] Reload dati al cambio sede — `useEffect([orgId, sedeId])` in `Dashboard.jsx:8598` ricarica ricettario, produzione, magazzino, logRif, giornaliero, chiusure, esclusi
- [x] `ImpostazioniSedi.jsx` — CRUD completo (lista, aggiungi, modifica inline, disattiva/riattiva, set default) + ScenarioOperativoCard
- [x] `ConfrontoSedi.jsx` — visibile solo se `sedi.length > 1` (vincolo sia sul nav item `Dashboard.jsx:8956` sia interno al componente). KPI: ricavi settimana, food cost medio, prodotti oggi, stock vetrina, trasferimenti in arrivo, fatture da pagare. Best/worst evidenziati verde/rosso, mobile responsive.
- [x] Onboarding step 4 "Hai altri punti vendita?" in `OnboardingWizard.jsx` con form nome/indirizzo/città e insert su `sedi`
- [x] Trasferimenti tra sedi (movimento stock reale) — `TrasferimentiView.jsx` (visibile solo se `sedi.length > 1`)
- [x] Stock prodotti finiti per sede (`stock_prodotti_finiti`) — produzione e vendita aggiornano stock automaticamente
- [x] Scenario operativo A/B/C/D (laboratorio centrale / sedi autonome / più produttori / rete distribuita)

### Ruoli & Permessi (PR #5 – mig. `20260605`)
- [x] Campo `profiles.ruolo` ∈ {`titolare` (default/null), `dipendente`}
- [x] RLS: dipendente può scrivere solo le 6 chiavi operative (helper `is_chiave_operativa`)
- [x] UI gating via `DIPENDENTE_VIEWS` in `Dashboard.jsx` (dipendente vede: Produzione, Cassa, Magazzino, Sprechi/omaggi, Eventi, Calendario, HACCP, Scadenzario)

### Pagamenti & Billing (PR #5 – mig. `20260604`)
- [x] Webhook Stripe idempotente (`stripe_webhook_events`)

### Formati di vendita (PR #5 + PR #7)
- [x] Vista `FormatiVendita.jsx` (shared, SK_FORMATI)
- [x] Componenti distinta materiali per formato: `componenti:[{nome,qta,costo}]`

### Registro attività (PR #6 – mig. `20260606`)
- [x] Audit log multi-utente (chi, cosa, quando) via trigger DB
- [x] Vista in Azienda → Registro attività (solo titolare)
- [x] Label leggibili per ogni chiave operativa

### Sprechi & Omaggi (PR #7 – mig. `20260607`)
- [x] Vista `SpreciOmaggi.jsx` per-sede (titolare + dipendente)
- [x] Causali predefinite spreco/omaggio + qta in g o pz + food cost e ricavo mancato
- [x] Drift porzioni in Chiusura cassa (calcolo prodotti+sprechi+omaggi vs vendite)
- [x] Aggregazione per categoria/prodotto + totali in €

### Audit final: re-auth 401 + encryption integrazioni + TV hash + test stubs + OCR 401 + JSPDF lazy (branch `fix/audit-final` – mig. `20260611`)
- [x] **Auto re-auth on 401** (`src/lib/apiFetch.js`): wrapper unificato `apiFetch(path, opts)` con auto-iniezione Bearer token, refresh session su 401, redirect a `/login?reason=session_expired` se anche dopo refresh la sessione e' invalida. Applicato in `AdminPage`, `AbbonamentoPanel`, `FeedbackButton`.
- [x] **Integrazioni encryption AES-256-GCM** (`api/lib/integrationsCrypto.js` + mig. `20260611_integrazioni_encryption.sql`): nuove colonne `config_encrypted`/`config_iv`/`config_tag` + `encryption_version`. Helper `encryptConfig`/`decryptConfig`/`loadIntegrazione`/`saveIntegrazione` via Web Crypto. Env `INTEGRATIONS_ENCRYPTION_KEY` 32-byte base64. `api/sync-delivery.js` aggiornato per decifratura on-the-fly con fallback legacy (encryption_version=0).
- [x] **TV token hash** (lookup costant-time): `ImpostazioniTv` ora salva anche `data_value.token_hash = SHA-256(token)`. `api/tv.js` cerca per hash via SQL `data_value->>'token_hash' = ?` invece del scan di 50 row + plaintext compare (no timing attack). Fallback legacy per token pre-fix.
- [x] **OCR 401 distinguished message**: in `Dashboard.jsx analizzaImmagineAI` e `FotoOCR.jsx analyzeOneImage`, ora 401 = "Sessione scaduta", 429 = "Troppe richieste", altri 4xx/5xx = "Errore servizio AI". Prima era tutto "Impossibile leggere".
- [x] **JSPDF lazy in Dashboard + MenuDinamico**: rimossi `import jsPDF from 'jspdf'` static, sostituiti con `await import('jspdf')` solo al click di export. Riduce il main bundle anche senza manualChunks.
- [x] **Test stubs gated** (skipped se env mancanti, ready-to-run):
  - `tests/07-stripe-webhook.spec.js` — verifica `customer.subscription.updated` end-to-end con signature reale via `stripe.webhooks.generateTestHeaderString`
  - `tests/08-stock-pf.spec.js` — produce → vendita → delete → stock=0

### Audit improvements: bug critici + performance + reliability (branch `fix/audit-improvements`)
- [x] **Data loss bug fix** in `ProduzioneGiornalieraView.handleConferma`: pattern `await ssave(...)` PRIMA di `setState`. Se save fallisce, niente state mutation + toast errore. Idem `handleDeleteSessione`.
- [x] **Stock vetrina fantasma fix**: eliminare sessione produzione ora chiama `scartoPF` per ogni prodotto (causale 'scarto'). Se sessione era con destinazione altra sede, lasciamo trasferimento da gestire manualmente con warn esplicito.
- [x] **Double-submit protection**: nuovo state `salvando` distinto da `confermando` (UI), bottoni `disabled` durante async; idem `deletingSess` per delete modal.
- [x] **Modal Escape handler** nel delete confirm di Produzione.
- [x] **Mobile responsive** fix: grid 3-col `ChiusuraView` (import delivery generic) e 4-col `MagazzinoView` (aggiungi ingrediente) ora `1fr` sotto la breakpoint.
- [x] **Code splitting** via `vite.config.js` `manualChunks`: chunks separati per `react`, `react-dom`, `supabase`, `charts`, `pdf`. **Build prod: gzip iniziale ~540KB (era 663KB monolitico), 8 chunks vs 1, build time 18s vs 7m47s.**
- [x] **stockPF imports unificati static**: rimossi 3 `import()` dinamici (`MagazzinoView`, `DashboardHomeView`) che invalidavano code splitting.
- [x] **Console.log droppati in prod**: vite `esbuild.pure` rimuove `console.log/debug/info/trace`; preserva `console.error/warn` per logging.
- [x] **Retry wrapper su ssave/sload**: errori transient (5xx, network, fetch timeout) → retry x3 con backoff esponenziale (300/600/1200ms). Errori "permanenti" (RLS 42501, integrity 23xxx, 4xx) → fail-fast.
- [x] **Pricing endpoint rate limit**: `/api/pricing` con `checkRateLimit` 30/min/IP (era pubblico senza limit).
- [x] **Semilavorato ciclo + depth warning**: `calcolaFC` e `calcolaFCStorico` tracciano il path di ricorsione, rilevano ciclo diretto/indiretto, e segnalano in `mancanti[]` con label leggibile invece di tornare silenziosamente 0.
- [x] **`CLAUDE.md`**: documento di onboarding per dev nuovi con architettura, file map, pattern (save-first), common pitfalls.

### Go-live prep: legale + dati fatturazione + Stripe tax (branch `feat/go-live-prep` – mig. `20260610`)
- [x] **Pagine legali complete e GDPR-compliant** (con placeholder umani da compilare): `PrivacyPolicy.jsx` (11 sezioni, sub-processors list, SCC, retention), `TerminiServizio.jsx` (16 sezioni B2B), `CookiePolicy.jsx` (technical-only, no banner necessario), `Rimborsi.jsx`, `Contatti.jsx`, `ChiSiamo.jsx` — layout condiviso `_LegalLayout.jsx`
- [x] **Routing**: aggiunto `/cookie`, `/rimborsi`, `/contatti`, `/chi-siamo` in `App.jsx`
- [x] **Footer landing aggiornato**: link a tutte le pagine legali (Cookie, Rimborsi, Contatti, Chi siamo)
- [x] **Consenso GDPR esplicito in registrazione**: checkbox `accept_terms` obbligatoria nel form signup, `regStep2Valid()` blocca submit senza consenso, link Termini + Privacy in nuova tab
- [x] **Migration `20260610_business_info.sql`**: colonne `partita_iva`, `codice_destinatario`, `pec`, `ragione_sociale`, `indirizzo`, `cap`, `citta`, `provincia`, `nazione` su `organizations` con check constraint P.IVA (11 cifre IT) + codice destinatario SDI (7 char alfanumerici)
- [x] **Stripe checkout esteso**: `tax_id_collection.enabled=true` + `billing_address_collection='required'` + `customer_update.name/address='auto'` → P.IVA + indirizzo raccolti nativamente da Stripe
- [x] **Stripe webhook `customer.updated`**: sincronizza tax_id (anche listTaxIds fallback) + indirizzo su `organizations.{partita_iva, ragione_sociale, indirizzo, cap, citta, provincia, nazione, business_info_updated_at}`; normalizza P.IVA italiana rimuovendo prefisso "IT"
- [x] **`NEXT_STEPS.md`**: roadmap puntuale di tutto quello che richiede chiavi/account esterni (dominio, Resend DKIM, Stripe Live, SDI provider, MFA admin, Supabase Pro, ecc.)

### Admin tier 2: Stripe MRR/events + errori produzione + bulk actions (branch `feat/admin-tier2` – mig. `20260609`)
- [x] **MRR reale da Stripe**: nuova action `stripe_mrr` paginazione subs + breakdown active/trialing/past_due/canceled, charge falliti ultimi 30gg; KPI card prima delle Azioni rapide
- [x] **Stripe events feed**: nuova action `stripe_events`, 14 tipi filtrati (subscription/charge/invoice/checkout/customer), card con timeline colorata (verde succeeded, rosso failed, giallo updated/trial), badge `test` per non-livemode
- [x] **Errori produzione** (alternativa Sentry): nuova tabella `error_log` (service_role only, RLS attivo), `safeError()` esteso con param `supabase` opzionale per insert fire-and-forget; sezione admin "🐛 Errori produzione" sotto Log attività con endpoint/operation/code/status/message/hint
- [x] **Bulk actions** sulla tabella clienti: checkbox per riga + select-all in header con stato indeterminato, toolbar attiva su selezione ≥1 con Email/Estendi trial/Export CSV/Deseleziona, nuovo `BulkEmailModal` con template var `{{nome_completo}}` `{{nome_attivita}}` e progress bar
- [x] safeError calls in admin.js + feedback.js aggiornate per persistere errori su DB

### Admin tier 1: note CRM + activation + feedback + banner (branch `feat/admin-tier1` – mig. `20260608`)
- [x] **Note CRM** per cliente: campo `note_admin` su `organizations`, textarea nella modale Dettaglio con autosave debounced 1.5s, visibile solo all'admin
- [x] **Activation score** per cliente: 6 step (email verificata, sede creata, ricettario popolato, prima chiusura cassa, prima fattura, attivo ultimi 7gg) calcolati al volo, indicatore progress bar + chip leggibili nella modale
- [x] **Feedback inbox** in-app: bottone floating 💬 in `Dashboard` (via `FeedbackButton`), tabella `feedback` (RLS: insert proprio org via policy, lettura solo service_role), nuova endpoint `api/feedback.js`, sezione admin "📨 Feedback dai clienti" con filtro "da gestire" + sentiment (bug/idea/feedback/complimento) + segna gestito
- [x] **Banner globali**: tabella `app_banners` (RLS: read se attivo+non scaduto), componente `AppBanner` in cima al Dashboard (dismissable per sessione via sessionStorage), sezione admin "📢 Banner globali" con form crea + lista + disattiva/elimina, 4 severity (info/warn/critical/success)
- [x] Refresh banner ogni 5 minuti (l'admin pubblica → utenti vedono entro 5min senza reload)

### Vista cliente arricchita in admin (branch `feat/admin-vista-cliente-arricchita`)
- [x] Nuova action `cliente_dettaglio` in `api/admin.js`: aggrega sedi, uso per `data_key` (count + ultimo update + n. sedi coinvolte), audit_log filtrato per org_id (ultimi 25 eventi), dati Stripe da `organizations`
- [x] Modale `ClienteDettaglioModal` in `AdminPage.jsx`: header con stato/salute/piano/KPI/Stripe, sedi (badge), uso per area (operative vs altre), eventi recenti
- [x] Click sul nome attività nella tabella clienti apre la modale (no nuova colonna)
- [x] Health score: 🟢 ≤2gg / 🟡 3-7gg / 🔴 >7gg dall'ultimo accesso
- [x] Azioni rapide nella modale: 🔑 impersona · 📧 email · 🎁 regala mesi · 🔁 reset password
- [ ] Niente DB migration (riusa `user_data`, `sedi`, `audit_log`, `organizations`)

### Import wizard multi-formato (1-3 set 2026 — commit `91e795c` → `e63fd5a`)
- [x] **Wizard client-side privacy-first** (`src/components/ImportWizard.jsx`), 4 step: file → mapping AI → validazione → insert. L'insert va dal browser **direttamente** a Supabase con JWT+RLS: a Vercel arrivano solo gli header e 5 righe campione, i valori pieni (stipendi, dati sensibili) non transitano mai da Foodos.
- [x] Moduli condivisi browser+node: `importSchemas.js` (schema dichiarativo), `importValidateCore.js`, `importParse.js` (SheetJS in-memory), `importAiMap.js`
- [x] **Mapping library cross-cliente** (mig. `20260901`): tabella globale `import_mappings_library` + RPC `save_import_mapping` / `lookup_import_mapping`. Se un altro cliente ha gia' confermato quel mapping, match diretto a costo zero senza chiamare Claude. La base clienti diventa un asset che migliora crescendo.
- [x] **Primitive per schemi complessi**: type `lookup` (valore cliente "Torino Centro" → uuid sede) e conversioni unita' opzionali via checkbox
- [x] **Detect automatico WIDE/LONG** (`api/import-detect-format.js`) + engine unpivot puro (`src/lib/importUnpivot.js`). Nato dal file reale di Mara: registri Excel WIDE con header multi-riga, un tab per sede, coppie (PROD, RIMAN.), colonne "VENDUTO SETTIMANA" calcolate e riga TOTALE da ignorare. Pattern documentato come reference cross-cliente.
- [x] Upsert per stesso mese/anno gia' caricato, per non raddoppiare le righe al secondo import (`1495e76`)
- [x] CLI founder-assisted `scripts/import-any.mjs` per le prime importazioni (guida in `scripts/README-import.md`)

### Metodo inventario in Produzione, Storico e P&L (3-4 set 2026 — commit `17a66cd` → `49c683a`)
- [x] **Sezione dedicata metodo inventario** in Storico Produzione e in P&L: KPI, trend, top 10, tabella, export xlsx, deep-link Produzione↔Storico
- [x] **RPC di aggregazione lato DB** `storico_inventario_per_mese` (mig. `20260904`) + indice composto `(organization_id, sede_id, data desc)`: il client non scarica piu' decine di migliaia di righe grezze per aggregarle in JS
- [x] **Fetch paginato** per bypassare il `db-max-rows=1000` di PostgREST (il `.limit()` del client veniva cappato lato server)
- [x] "Tutte le sedi" nello Storico, filtri periodo con preset, confronto flessibile, tooltip formattati
- [x] Foglio produzione: toggle "Solo compilati", ripeti settimana scorsa, drilldown gusto con sparkline 90 giorni, KPI banner, alert rimanenza, sort
- [x] Colonne totali uniformi nelle 3 viste (Settimana/Mese/Storico) con sticky-right
- [x] Rimosse 519 righe di codice import legacy

### Cassa come si registra davvero (7 set 2026 — mig. `20260907b` → `20260907f`)
Nato dallo studio del file con cui Mara tiene gli incassi (`INCASSI MARAMA LUGLIO 2026.xlsx`).
Diceva tre cose che il prodotto non sapeva registrare, e non valgono solo per lei.

- [x] **Chiusure dal blob jsonb alla tabella `chiusure_cassa`** (mig. `20260907b`, `20260907c`): prima le chiusure stavano in un unico blob per sede, scaricato tutto intero a ogni apertura. La forma dati esposta ai sei consumatori (P&L, Quadratura, Export contabilita', Integrazioni, Benchmark, Dashboard) e' rimasta identica: il cambio di modello e' confinato in `src/lib/chiusure.js`
- [x] **Basta il totale per chiudere la giornata**: su tutto il database esistevano 2 chiusure reali, perche' inserire ogni prodotto con quantita' e prezzo chiedeva mezz'ora al giorno. Il calcolo che da' valore alla cassa usa solo il totale; il dettaglio resta possibile ma non e' piu' il pedaggio d'ingresso
- [x] **Incasso scomposto per canale** (mig. `20260907f`): `incasso_pos`, `incasso_contanti`, `incasso_delivery` su `chiusure_cassa`. Nullable di proposito — null e' "non rilevato", diverso da zero. Compilando i canali il totale si somma da solo: nel foglio di luglio la somma a mano era sbagliata su una giornata
- [x] **Prima nota di cassa** (mig. `20260907f`, tabella `movimenti_cassa` + RPC `movimenti_cassa_periodo`): le piccole uscite di giornata — "limoni 10 euro", "carrefour 11,56" — non avevano casa. `costi_aziendali` e' fatto per i costi ricorrenti mensili con periodicita', non per l'acquisto di limoni del 3 luglio. UI in `src/components/PrimaNotaCassa.jsx`, dentro la pagina Cassa: si compila quando si conta il cassetto
- [x] **Il campo `documento` come cittadino di prima classe**: `fattura` / `senza` / `incerto`, che e' la notazione con cui Mara annota da anni — (F), (no F), (?). Non e' una nota personale: separa cio' che il commercialista puo' scaricare da cio' che non puo', e i totali di periodo tengono le tre voci distinte
- [x] **Import del registro incassi** (`src/lib/importIncassi.js` + `src/components/ImportRegistroIncassi.jsx`, in Importa dati): legge il foglio COM'E'. Riconosce le tabelle affiancate separate da colonne vuote, le intestazioni scritte a mano ("Berthollet- Contanti", "Totale De Gasperi "), la colonna dei giorni anche senza etichetta, e le spese in testo libero con piu' voci per cella separate da ";". Abbina da solo i nomi del foglio ai punti vendita, deduce il mese dal nome del file e lo fa confermare. Provato sul file reale: 62 giornate e 37 uscite su 2 sedi, somme combacianti (39.865 POS / 12.652 contanti Berthollet, 41.994 / 16.110 De Gasperi) e una segnalazione su una somma sbagliata a mano nel foglio
- [x] **Reimportare non raddoppia**: gli incassi si sovrascrivono per giorno preservando il dettaglio prodotti eventualmente gia' inserito, le uscite del periodo si rifanno da zero, e la UI lo dice prima di scrivere
- [x] **Le uscite di cassa entrano nel conto economico**: `totaliPeriodo` era scritto "per il P&L" ma non collegato a niente — la prima nota registrava le spese e l'utile le ignorava. Ora c'e' una riga "Uscite di cassa (prima nota)" nella cascata, con quante voci sono e quanto di quelle e' senza fattura; la somma la fa il database (RPC `movimenti_cassa_periodo`), non il browser
- [x] **Il P&L non conta piu' come zero il food cost che non conosce**: `foodcost_noto` veniva scritto ma nessuno lo leggeva, quindi ogni chiusura col solo totale entrava nel conto con food cost 0 e gonfiava il margine di tutto l'incasso. Ora la percentuale di food cost si misura sui soli giorni misurati, con "non noto" quando non ce n'e' nessuno, e sopra i numeri c'e' scritto quante giornate restano fuori e come sistemarle
- [x] **Calendario chiusure a periodi** (mig. `20260907d`, `20260907e`): `chiusure_ricorrenti` con finestra di validita' (cambiare abitudine non riscrive il passato) + `chiusure_periodo` per ferie e chiusure straordinarie. Corretto il caso in cui cambiare idea nello stesso giorno lasciava due regole attive e il giorno non si poteva piu' togliere

### Deploy
- [x] Vercel deploy manuale (`vercel --prod`) funzionante
- [x] GitHub → Vercel autodeploy connesso e funzionante (verificato)
- [x] Dominio: `foodos-rose.vercel.app`

---

## ❌ Cosa Manca (TODO)

### Operativo / DB

1. **Fix profilo utente `7aebcbe5-2b75-4a82-a1ec-9418433f7379`** — voce aperta da
   maggio, con ogni probabilita' gia' superata. Esegui prima il controllo
   preventivo qui sotto: se ritorna una riga, cancella questa voce dal documento.
   Da eseguire su Supabase SQL editor:
   ```sql
   INSERT INTO public.profiles (id, organization_id, email, ruolo, approvato)
   SELECT u.id, o.id, u.email, 'titolare', false
   FROM auth.users u
   LEFT JOIN public.organizations o
     ON o.nome = coalesce(u.raw_user_meta_data->>'nome_attivita', 'La mia attività')
   WHERE u.id = '7aebcbe5-2b75-4a82-a1ec-9418433f7379'
     AND u.id NOT IN (SELECT id FROM public.profiles)
   ON CONFLICT (id) DO NOTHING;
   ```
   Controllo preventivo:
   ```sql
   SELECT id, email FROM public.profiles WHERE id = '7aebcbe5-2b75-4a82-a1ec-9418433f7379';
   ```
   Se ritorna una riga, il profilo esiste già e non serve eseguire l'INSERT.

### Features Future

2. **Email transazionali** — `api/send-email.js` con Resend è scaffolded, configurare `RESEND_API_KEY` su Vercel
3. **Approvazione admin** — il pannello admin ha già i bottoni, ma il workflow di notifica email all'admin quando si registra un nuovo utente non è completo
4. **Piano Chain — gate feature premium** — sedi illimitate sono ora in tutti i piani. Da implementare: gate su utenti multipli, API access, white-label per il piano Chain (vedi sezione Piani)
5. **Mobile responsive** — perfezionamenti residui (la maggior parte delle view usa già `useIsMobile`, ma alcune sezioni di Dashboard.jsx vanno ancora rifinite)
6. **Dependabot triage** — elenco non verificato dal 31/05 (`gh` non è installato sulla macchina, controlla dal sito). `npm install` del 7/09 segnala vulnerabilità: lancia `npm audit` per il dettaglio. Da valutare con priorità `supabase-js` e `resend`, che toccano integrazioni live.
7. **Refactoring `Dashboard.jsx`** — sceso da ~6700 a 3488 righe, scorporo verso `src/views/` ben avviato (32 view estratte). Resta layout + sidebar + switch view.
8. **Import wizard v2** — le entità coperte sono `fornitori` e `dipendenti`. Da estendere a `ricettario`, `magazzino`, `chiusure` (richiedono adapter dedicati, vedi `scripts/README-import.md`). Limite noto v1: nessun upsert sulle anagrafiche, rilanciare un import raddoppia le righe (l'upsert per mese/anno esiste solo sulla produzione, commit `1495e76`).
9. **Ripristinare le soglie coverage vitest** — abbassate a lines 30 / functions 50 / statements 30 / branches 60 quando il coverage ha iniziato a includere `src/components` e `src/views`. Risalire a 70/80/70/75 man mano che arrivano test mirati per view.

---

## 🔄 Flusso di Deploy

```bash
# Sviluppo locale
cd ~/Desktop/foodos
npm run dev          # http://localhost:5173

# Deploy
git add .
git commit -m "descrizione"
git push             # → autodeploy GitHub → Vercel (1-2 min)

# Deploy forzato immediato (se autodeploy lento)
vercel --prod --yes 2>&1 | tail -5
```

---

## 🐛 Bug Noti

- **Duplicate key warnings** nel build: oggetto prezzi ingredienti in Dashboard.jsx ha alcune chiavi duplicate (es. "philadelphia", "cream cheese"). Non bloccante, solo warning. Da riverificare dopo lo scorporo delle view.
- ~~Git author non configurato~~ → risolto, i commit sono firmati `Alessandro Ronchi <alessandroar@maradeiboschi.com>`.

### Risolti il 7 set 2026

- **Migration `20260904` mancante in produzione**: era stata committata il 4/09 ma mai applicata al database. Lo Storico inventario funzionava lo stesso solo grazie al fallback esplicito in `inventarioProduzione.js`, che scarica le righe grezze quando la RPC non c'e' — quindi il degrado era invisibile e sarebbe peggiorato col crescere dei dati. Applicata e collaudata il 7/09.

- **P&L andava in ReferenceError con metodo inventario** (`src/views/PLView.jsx`): la useEffect passava `{ dataFrom, dataTo }` in shorthand, ma le variabili di stato si chiamano `dateFrom`/`dateTo`. Colpiva esattamente le gelaterie con `metodo_produzione = 'inventario'`, cioe' il design partner. Trovato da ESLint (`no-undef`), non da un test.
- **Suite di test rossa su `main`**: il mock Supabase di `tests/unit/inventarioProduzioneExt.test.js` non era stato aggiornato quando il 4/09 e' arrivata la paginazione (`.order().range()`).
- **Pre-push hook mai installato**: `package.json` non aveva lo script `postinstall` che `scripts/install-hooks.sh` dichiara di avere. Senza gate, i due bug qui sopra sono finiti su `main`. Ripristinato, e il lint del hook ora copre anche `api/` (non solo `src/`).

---

## 📝 Note Architetturali

- `Dashboard.jsx` non è più monolitico: **3488 righe** (era ~6700). Le view sono state scorporate in `src/views/*.jsx` (32 file: `MagazzinoView`, `PLView`, `ChiusuraView`, `StoricoProduzioneView`, ecc.). Nel file restano layout, sidebar e switch delle view. Lo scorporo prosegue.
- Il modello di storage usa variabili di modulo (`_ctx_orgId`, `_ctx_sedeId`) per evitare prop drilling. Vengono aggiornate a ogni render di Dashboard — cerca `_ctx_orgId =` invece di affidarti al numero di riga.
- Il pannello admin (`AdminPage.jsx`) usa `/api/admin` che legge da Supabase lato server con service key.
- Il reset password intercetta l'evento `PASSWORD_RECOVERY` in `App.jsx` (non in `AuthPage`) per gestire correttamente il caso in cui Supabase crea una sessione recovery prima che l'utente veda il form.
