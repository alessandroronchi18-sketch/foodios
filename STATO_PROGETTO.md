# FoodOS — Stato del Progetto
> Aggiornato: 2026-05-12

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

## 🗄️ Schema Database (già in produzione)

### `organizations`
| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| nome | text | Nome attività |
| tipo | text | pasticceria / bar / ecc. |
| piano | text | trial / base / pro / multi / chain |
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
`pasticceria-regole-v1`, `pasticceria-semilavorati-v1`

**Chiavi per sede** (sede_id = UUID sede):
`pasticceria-magazzino-v1`, `pasticceria-produzione-v1`,
`pasticceria-giornaliero-v1`, `pasticceria-chiusure-v1`,
`pasticceria-logrif-v1`

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

### Storage & Multi-sede (parziale)
- [x] `storage.js` — logica `sload`/`ssave` con `sede_id` corretto per shared vs per-sede
- [x] `SedeSelector.jsx` — componente dropdown già costruito
- [x] Props `sedi`, `sedeAttiva`, `onSetSedeAttiva` passati a Dashboard
- [ ] **SedeSelector NON ancora inserito nella sidebar** — componente esiste ma non è posizionato nel JSX
- [ ] **Reload dati al cambio sede** — non implementato (useEffect con `[sedeId]`)

### Deploy
- [x] Vercel deploy manuale (`vercel --prod`) funzionante
- [x] GitHub → Vercel autodeploy connesso e funzionante (verificato)
- [x] Dominio: `foodios-rose.vercel.app`

---

## ❌ Cosa Manca (TODO)

### URGENTE / Prossimo Sprint

1. **Multi-sede — Gestione in Impostazioni**
   - Aggiungere card "Punti vendita" in `ImpostazioniView` (Dashboard.jsx ~riga 6382)
   - CRUD: lista sedi, aggiungi (nome/indirizzo/città), disattiva, set default
   - Usa `supabase.from('sedi')`

2. **Multi-sede — SedeSelector nella sidebar**
   - Inserire `<SedeSelector>` nel JSX sidebar (Dashboard.jsx ~riga 6807, dopo il logo div)
   - Aggiungere `useEffect` con dep `[sedeId]` per ricaricare dati per-sede al cambio

3. **Multi-sede — Confronto Sedi**
   - Nuovo componente `ConfrontoSediView` con tabella KPI fianco a fianco per ogni sede
   - Nav item "📊 Confronto Sedi" (visibile solo se `sedi.length > 1`)
   - KPI: produzione settimanale, ricavi, magazzino critico per sede

4. **Onboarding — Step opzionale seconda sede**
   - Aggiungere step 3 in `OnboardingWizard.jsx` ("Hai altri punti vendita?")
   - Richiede passare `orgId` da `App.jsx` al wizard
   - Usa `supabase.from('sedi').insert(...)` per creare la sede

5. **Fix profile 500 per utenti senza profilo**
   - Query SQL da eseguire su Supabase per utente `7aebcbe5-2b75-4a82-a1ec-9418433f7379`:
   ```sql
   INSERT INTO public.profiles (id, organization_id, email, ruolo, approvato)
   SELECT u.id, o.id, u.email, 'titolare', false
   FROM auth.users u
   LEFT JOIN public.organizations o ON o.nome = coalesce(u.raw_user_meta_data->>'nome_attivita', 'La mia attività')
   WHERE u.id NOT IN (SELECT id FROM public.profiles)
   ON CONFLICT (id) DO NOTHING;
   ```

### Features Future

6. **Email transazionali** — `api/send-email.js` con Resend è scaffolded, configurare `RESEND_API_KEY` su Vercel
7. **Approvazione admin** — il pannello admin ha già i bottoni, ma il workflow di notifica email all'admin quando si registra un nuovo utente non è completo
8. **Dipendenti** — ruolo `dipendente` nel profilo ma nessuna UI specifica per loro
9. **Piano multi/chain** — logica piano verificata ma nessun gate sul confronto sedi o feature premium
10. **Mobile responsive** — UI non ottimizzata per mobile

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
