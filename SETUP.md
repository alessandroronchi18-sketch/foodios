# FoodOS — Guida Setup Completa

Questa guida ti porta da zero a deploy in produzione in ~30 minuti.

---

## 1. Prerequisiti

Installa se non li hai già:
- [Node.js 18+](https://nodejs.org) — controlla con `node --version`
- [Git](https://git-scm.com)

---

## 2. Installa le dipendenze

```bash
cd foodios
npm install
```

---

## 3. Configura Supabase

### 3a. Crea il progetto
1. Vai su [supabase.com](https://supabase.com) → **New project**
2. Scegli un nome (es. `foodios`) e una password sicura per il database
3. Seleziona la regione **West EU (Ireland)** — più vicina all'Italia
4. Aspetta ~2 minuti che il progetto si avvii

### 3b. Esegui lo script SQL
1. Nel menu a sinistra: **SQL Editor** → **New query**
2. Copia e incolla tutto il contenuto di `supabase_setup.sql`
3. Clicca **Run** — dovresti vedere "Success. No rows returned"

### 3c. Recupera le chiavi
1. **Settings** → **API**
2. Copia:
   - **Project URL** → `https://XXXX.supabase.co`
   - **anon public** key → inizia con `eyJ...`
   - **service_role** key → inizia con `eyJ...` (TIENILA SEGRETA)

### 3d. Configura le email (opzionale ma consigliato)
1. **Authentication** → **Email Templates** → personalizza i template
2. **Authentication** → **URL Configuration** → aggiungi `http://localhost:5173` ai redirect URL

---

## 4. Configura le variabili d'ambiente locali

Apri `.env.local` e compila:

```
VITE_SUPABASE_URL=https://XXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  ← la anon key
VITE_ADMIN_EMAIL=alessandroar@maradeiboschi.com
```

⚠️ **Non mettere mai** `ANTHROPIC_API_KEY` o `SUPABASE_SERVICE_KEY` in `.env.local` — vanno solo su Vercel.

---

## 5. Avvia in locale

```bash
npm run dev
```

Apri [http://localhost:5173](http://localhost:5173).

Registrati con la tua email admin (`alessandroar@maradeiboschi.com`) per accedere al pannello admin.

> ⚠️ In locale, le chiamate AI a `/api/ai` non funzioneranno perché la Edge Function gira solo su Vercel. Il resto dell'app funziona normalmente.

---

## 6. Deploy su Vercel

### 6a. Crea account e collega il progetto
```bash
npm install -g vercel
vercel login
vercel  # segui le istruzioni (seleziona "foodios" come nome progetto)
```

Oppure:
1. Vai su [vercel.com](https://vercel.com) → **Add New Project**
2. Importa da GitHub (carica prima il codice su GitHub)

### 6b. Aggiungi le variabili d'ambiente su Vercel
**Dashboard Vercel** → **Settings** → **Environment Variables**

Aggiungi queste (tutte con scope `Production` + `Preview`):

| Chiave | Valore |
|--------|--------|
| `VITE_SUPABASE_URL` | `https://XXXX.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` (anon key) |
| `VITE_ADMIN_EMAIL` | `alessandroar@maradeiboschi.com` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SUPABASE_URL` | `https://XXXX.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (service_role key) |
| `RESEND_API_KEY` | `re_...` (vedi sezione Resend sotto) |

### 6c. Deploy
```bash
vercel --prod
```

---

## 7. Configura Resend (email transazionali)

1. Vai su [resend.com](https://resend.com) → crea account gratuito
2. **API Keys** → crea una nuova chiave
3. Aggiungi `RESEND_API_KEY` su Vercel (vedi step 6b)
4. (Opzionale) Verifica un dominio per inviare da `noreply@tuodominio.it`

> Il piano gratuito di Resend include 3.000 email/mese — più che sufficiente per iniziare.

---

## 8. Configura il dominio custom (opzionale)

```bash
vercel domains add foodios.it
```
Poi aggiorna i record DNS del tuo dominio seguendo le istruzioni di Vercel.

Aggiorna anche Supabase:
- **Authentication** → **URL Configuration** → aggiungi `https://foodios.it` ai redirect

---

## 9. Checklist sicurezza ✅

- [x] `ANTHROPIC_API_KEY` mai nel browser — solo nella Edge Function `/api/ai`
- [x] `SUPABASE_SERVICE_KEY` mai nel browser — solo nelle Edge Functions `/api/admin`, `/api/send-email`
- [x] RLS attivo su tutte le tabelle (`organizations`, `sedi`, `profiles`, `user_data`)
- [x] Ogni utente vede solo i dati della propria organization
- [x] Token Supabase verificato prima di ogni chiamata AI
- [x] Il pannello admin è accessibile solo da `VITE_ADMIN_EMAIL`

---

## 10. Primo utilizzo

1. Vai sull'URL del tuo deploy Vercel
2. Registrati con `alessandroar@maradeiboschi.com` → avrai accesso al pannello admin
3. Registra un secondo account per testare il flusso cliente normale
4. Dal pannello admin, approva l'account di test

---

## Struttura del progetto

```
foodios/
├── src/
│   ├── App.jsx                  # Root: routing auth/dashboard/admin
│   ├── Dashboard.jsx            # Dashboard principale (~408KB, logica originale)
│   ├── auth/
│   │   ├── AuthPage.jsx         # Login + registrazione
│   │   └── useAuth.js           # Hook autenticazione
│   ├── admin/
│   │   └── AdminPage.jsx        # Pannello admin approvazioni
│   ├── onboarding/
│   │   └── OnboardingWizard.jsx # Wizard primo accesso
│   ├── lib/
│   │   ├── supabase.js          # Client Supabase
│   │   └── storage.js           # sload/ssave → Supabase
│   └── components/
│       └── SedeSelector.jsx     # Switcher multi-sede
├── api/
│   ├── ai.js                    # Edge Function proxy Anthropic
│   ├── admin.js                 # Edge Function pannello admin
│   └── send-email.js            # Edge Function email Resend
├── supabase_setup.sql           # Script SQL da eseguire in Supabase
├── .env.local                   # Variabili locali (non committare!)
├── .env.example                 # Template variabili
├── vercel.json                  # Configurazione Vercel
└── SETUP.md                     # Questa guida
```

---

## Supporto

Per qualsiasi problema: [support@foodios.it](mailto:support@foodios.it)
