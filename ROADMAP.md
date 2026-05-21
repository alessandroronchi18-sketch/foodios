# FoodOS — Roadmap delle feature bloccate
> Aggiornato: 2026-05-21

Le feature qui elencate **non sono implementate** perché richiedono decisioni di prodotto o credenziali esterne che servono prima di poter scrivere codice utile. Per ciascuna è indicato cosa serve per sbloccarla.

---

## A) Modalità offline mobile

**Stato:** non implementata. Esiste già `src/lib/useOnlineStatus.js` ma non c'è Service Worker né IndexedDB.

**Cosa serve per sbloccare:**
- Decisione architetturale sulla strategia di sync. Opzioni:
  - **stale-while-revalidate** sui dati read-only (ricettario, sedi) — semplice ma non gestisce le scritture offline
  - **outbox queue** (registra le scritture in IndexedDB, le sincronizza al ritorno online) — robusta ma richiede conflict resolution sulle chiavi `user_data` UNIQUE
- Scelta libreria: nativo `caches` API + `idb-keyval`, oppure Workbox.
- Lista delle "operazioni offline-safe" che vogliamo davvero supportare (probabilmente: marcare prodotti come venduti, salvare bozza produzione/cassa).
- Banner UI in `App.jsx` quando `navigator.onLine === false`.

**Stima:** 3-5 giorni di lavoro serio. Va fatta in branch dedicato.

**File da creare:** `public/sw.js`, `src/lib/offlineQueue.js`, `src/components/OfflineBanner.jsx`.

---

## B) Report automatico WhatsApp serale (22:00)

**Stato:** non implementata.

**Bloccanti reali:**
1. **Scelta provider**:
   - **Twilio WhatsApp Business** — più semplice da integrare, costa per messaggio (~€0.05/IT)
   - **Meta WhatsApp Cloud API** (diretta) — più economica ma richiede account business Meta verificato + numero approvato
2. **Credenziali necessarie su Vercel** (a seconda del provider):
   - Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
   - Meta: `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID`, `META_BUSINESS_ACCOUNT_ID`
3. **Template messaggio approvato** lato provider (WhatsApp richiede approvazione preventiva dei template transazionali).
4. **Cron Vercel alle 22:00** in `vercel.json`: `{ "path": "/api/cron-whatsapp", "schedule": "0 22 * * *" }`. Attenzione al fuso: Vercel cron è in UTC, quindi `0 20 * * *` per le 22:00 Roma in inverno, `0 19 * * *` in estate (oppure salva il fuso preferito per org e gestiscilo nell'handler).

**Cosa è già pronto:**
- Tabella `profiles` con i contatti utente — manca un campo `telefono` o `whatsapp_number` per il titolare. **SQL nuovo:**
  ```sql
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
  ```
- Pattern cron già esistente (`api/cron-notifiche.js`, `api/cron-report-mensile.js`).

**File da creare:**
- `api/cron-whatsapp.js` (handler 22:00)
- `api/lib/whatsapp.js` (wrapper provider scelto)
- `src/components/ImpostazioniWhatsapp.jsx` (UI configurazione numero + opt-in)
- Tab "WhatsApp" in `ImpostazioniView`

**Stima:** 1 giorno una volta scelto il provider e ottenuti i secret.

---

## C) Previsione scorte con ordine automatico al fornitore

**Stato:** non implementata. La logica di "fornitore" è già presente (`src/components/Fornitori.jsx`).

**Cosa serve per sbloccare:**
- **`RESEND_API_KEY` configurato su Vercel** (per inviare l'email al fornitore). Lo scaffold `api/send-email.js` c'è già ma non risulta che la chiave sia stata aggiunta su Vercel.
- Decisione su algoritmo previsione:
  - **MA semplice 30 giorni** (media mobile dei consumi) — più trasparente, sottostima i picchi
  - **EWMA** (exponential weighted) — reagisce ai trend recenti
  - **Stagionalità settimanale** (consumo lun-dom × N settimane) — più accurato per pasticceria/bar ma più complesso
- Approvazione utente o invio automatico? Default consigliato: genera bozza, l'utente conferma, FoodOS invia.
- Dove "vivono" le quantità di riordino minime: nel magazzino c'è già una soglia, ma non sempre compilata.

**Cosa è già pronto:**
- `api/send-email.js` scaffolded con Resend.
- `Fornitori.jsx` con elenco e email contatto.
- Magazzino con soglie e logRif (storico rifornimenti).

**File da creare:**
- `src/components/PrevisioneScorte.jsx` (nuova view o aggiunta in Magazzino)
- `src/lib/previsioneConsumi.js` (algoritmo)
- Nav item "Riordini" in sidebar

**Stima:** 1 giorno.

---

## F) Integrazione POS fiscale nativa (Epson RT XML, Custom RT, Olivetti)

**Stato:** non implementata. Esiste `src/lib/importCassa.js` con parser delivery (Glovo, Deliveroo, JustEat) ma niente POS fiscali.

**Bloccanti reali:**
- **Mancano esempi di XML reali** dei tre formati. I formati registratori di cassa italiani non sono pubblicamente standardizzati: ogni produttore ha il proprio schema. Scrivere un parser senza un file campione produce codice che andrà rifatto.
- I tre formati hanno strutture molto diverse:
  - **Epson RT** — esporta tipicamente un XML "FiscalReport" con elementi `Z`/`Tax`/`Department`
  - **Custom RT** — esporta CSV/XML proprietari, spesso via `RT-Manager`
  - **Olivetti** — formato CSV `XRZ`/`XRD` o XML proprietario

**Cosa serve per sbloccare:**
1. **Almeno 1-2 file di esempio per ciascuno dei tre produttori** (anche anonimizzati). Anche uno solo è sufficiente per iniziare.
2. Conferma del flusso utente: upload file dal pannello Integrazioni? Polling automatico da una directory cloud (es. Google Drive)?
3. Mappatura desiderata: corrispettivi giornalieri → chiusure cassa `pasticceria-chiusure-v1`.

**File da creare:**
- `src/lib/importPosEpson.js`, `importPosCustom.js`, `importPosOlivetti.js`
- Card in `Integrazioni.jsx` (esistente)

**Stima:** 2-3 giorni una volta forniti i file di esempio.

---

## J) Consulente AI proattivo (lunedì 9:00)

**Stato:** non implementato.

**Cosa serve per sbloccare:**
- `CRON_SECRET` su Vercel (per proteggere l'endpoint cron — pattern già usato dagli altri cron in `api/cron-*`).
- `ANTHROPIC_API_KEY` su Vercel — già presente perché `/api/ai` la usa.
- `RESEND_API_KEY` su Vercel — **non configurata**.
- Decidere il canale di "notifica in-app": esiste già `useNotifiche.js` + tabella `notifiche`. È idoneo, basta inserire una riga per org con `tipo='ai_insight'`.
- Decidere il prompt di analisi (3 insight tipici: prodotto FC aumentato, prodotto più redditizio, alert ricavi in calo). Lo scrivo io quando si fa, ma vale la pena rivederlo con l'utente per il tono.

**Cron Vercel:**
```json
{ "path": "/api/cron-insight", "schedule": "0 7 * * 1" }
```
(le 7 UTC del lunedì = 9 Roma inverno / 9 estate. Stesso problema fuso orario di B.)

**File da creare:**
- `api/cron-insight.js` (handler)
- `api/lib/insightPrompt.js` (template prompt italiano)

**Schema dati necessari:** già tutti in `user_data` (chiusure, giornaliero, ricettario) — niente migration richiesta. Per memorizzare gli insight generati e mostrarli in Dashboard:
```sql
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  anno_settimana TEXT NOT NULL, -- "2026-W21"
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, anno_settimana)
);
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org owner can read own insights" ON public.ai_insights
  FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
```

**Stima:** 4-6 ore una volta configurati i secret.

---

## Prossimi passi

1. **Sblocca C** configurando `RESEND_API_KEY` su Vercel (è il prerequisito anche per il workflow di notifica admin nel pannello).
2. **Decidi provider WhatsApp** (B) — Twilio è il path di minor resistenza.
3. **Raccogli file campione POS** per F. Senza, non si parte.
4. Una volta sbloccati B+J, hanno il flusso più simile e si possono pianificare insieme.
