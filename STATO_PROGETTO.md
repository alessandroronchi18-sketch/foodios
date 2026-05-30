# FoodOS — Stato del Progetto
> Aggiornato: 2026-05-28 (post-merge PR #7 — commit `f4a31a8`)

---

## 🌐 URL e Accessi

| Risorsa | URL / Valore |
|---|---|
| **App live (produzione)** | https://foodios-rose.vercel.app |
| **Repository GitHub** | https://github.com/alessandroronchi18-sketch/foodios |
| **Vercel dashboard** | https://vercel.com/alessandroronchi18-7807s-projects/foodios |
| **Supabase dashboard** | https://supabase.com/dashboard/project/rmecvymnwzgrfigljlid |
| **Supabase URL** | https://rmecvymnwzgrfigljlid.supabase.co |
| **Admin email** | alessandroar@maradeiboschi.com |

---

## 🔑 Variabili d'Ambiente

File locale: `~/Desktop/foodios/.env.local`

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
foodios/
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

### Piano Pro — €89/mese
- Sedi illimitate
- Ricettario illimitato
- Food cost automatico
- AI Assistant
- Export PDF
- Scadenzario fatture
- Supporto email

### Piano Chain — €149/mese
- Tutto il piano Pro
- Utenti multipli per sede (collaboratori)
- API access
- White label (logo personalizzato)
- Supporto prioritario dedicato
- SLA garantito

> Nessuna limitazione sul numero di sedi in alcun piano. La differenziazione tra Pro e Chain è su utenti multipli, integrazioni API, branding e livello di supporto.

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

### Deploy
- [x] Vercel deploy manuale (`vercel --prod`) funzionante
- [x] GitHub → Vercel autodeploy connesso e funzionante (verificato)
- [x] Dominio: `foodios-rose.vercel.app`

---

## ❌ Cosa Manca (TODO)

### Operativo / DB

1. **Fix profilo utente `7aebcbe5-2b75-4a82-a1ec-9418433f7379`** — da eseguire su Supabase SQL editor:
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
6. **Dependabot triage** — 4 PR aperte (patch-deps, recharts 3.8.1, resend 6.12.3, supabase-js 2.106.1). Da valutare almeno supabase-js e resend che toccano integrazioni live.
7. **Refactoring `Dashboard.jsx`** — monolitico ~6700 righe, in scorporo progressivo verso `src/views/` (es. `ChiusuraView.jsx` già estratta).

---

## 🔄 Flusso di Deploy

```bash
# Sviluppo locale
cd ~/Desktop/foodios
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

- **Duplicate key warnings** nel build: oggetto prezzi ingredienti in Dashboard.jsx ha alcune chiavi duplicate (es. "philadelphia", "cream cheese"). Non bloccante, solo warning.
- **Git author non configurato**: `git config --global user.name` e `user.email` non impostati — i commit mostrano il hostname invece del nome reale.

---

## 📝 Note Architetturali

- `Dashboard.jsx` è monolitico (~6700 righe). Tutti i sub-componenti (`MagazzinoView`, `ImpostazioniView`, `PLView`, ecc.) sono definiti nello stesso file. Funziona ma rende difficile la navigazione.
- Il modello di storage usa variabili di modulo (`_ctx_orgId`, `_ctx_sedeId`) per evitare prop drilling. Queste vengono aggiornate a ogni render di Dashboard (righe 6487-6488).
- Il pannello admin (`AdminPage.jsx`) usa `/api/admin` che legge da Supabase lato server con service key.
- Il reset password intercetta l'evento `PASSWORD_RECOVERY` in `App.jsx` (non in `AuthPage`) per gestire correttamente il caso in cui Supabase crea una sessione recovery prima che l'utente veda il form.
