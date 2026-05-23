# FoodOS — Runbook rotazione secret

Procedura per ruotare ogni secret usato dall'app **senza downtime**. Tutti i secret sono in env vars su Vercel: `Settings → Environment Variables`.

---

## Tabella secret

| Nome | Dove è usato | Frequenza rotazione suggerita | Impatto rotazione | Procedura |
|---|---|---|---|---|
| `SUPABASE_SERVICE_KEY` | Tutti gli endpoint server (`api/*.js`) | **Solo se compromesso** | Critico: spegne tutto il backend | Vedi §1 |
| `SUPABASE_URL` | Client + server | Mai (cambia solo con migrazione progetto Supabase) | Cambia URL endpoint | Vedi §2 |
| `VITE_SUPABASE_ANON_KEY` | Client (bundle) | Quando rigeneri progetto Supabase | Richiede re-deploy | Vedi §2 |
| `ANTHROPIC_API_KEY` | `/api/ai` | Ogni 90 giorni | Breve (~30 sec) | Vedi §3 |
| `RESEND_API_KEY` | `/api/send-email`, `cron-report-mensile`, `cron-notifiche`, `anomaly-detect` | Ogni 180 giorni | Le email non parte finché non aggiornata | Vedi §3 |
| `CRON_SECRET` | Vercel cron triggers (`cron-*`, `sync-delivery`, `anomaly-detect`) | Ogni 180 giorni | I cron si fermano finché non aggiornato | Vedi §4 |
| `INTERNAL_API_SECRET` | Chiamate server→server (es. admin.js → send-email.js per approvazione) | Ogni 180 giorni | Email transazionali non partono | Vedi §4 |
| `ZUCCHETTI_WEBHOOK_SECRET` | `/api/webhook-zucchetti` | Su richiesta cliente Zucchetti | Webhook respingono fino sync | Vedi §5 |
| `ADMIN_EMAIL` | `api/admin.js`, `cron-report-mensile`, `anomaly-detect` | Mai (è l'email titolare) | Solo titolare cambia | Aggiorna su Vercel + ridepoy |
| `ADMIN_IPS` (opzionale) | `api/admin.js` allowlist IP admin | Quando cambi sede | L'admin viene bloccato finché non aggiornata | Vedi §6 |
| `SENTRY_DSN` (opzionale) | `/api/error-report` | Mai (è il progetto Sentry) | Senza, errori vanno solo su audit_log | Crea progetto su sentry.io |
| `VITE_ADMIN_EMAIL` | Client `AdminPage.jsx` | Mai (gate UI lato client, double-check è server) | UI admin non si apre | Aggiorna + redeploy |
| `VITE_ERROR_REPORTING_ENABLED` | Client `errorReporting.js` | Mai | Toggle on/off reporting errori | Setta a `1` per attivare |

---

## §1. Rotazione `SUPABASE_SERVICE_KEY`

⚠️ La service key bypassa la RLS. Compromettere significa accesso completo al DB.

Supabase **non supporta** la rotazione automatica delle service key, ma puoi farlo manualmente:

1. **Supabase Dashboard → Settings → API → Project API keys**
2. Clicca "Reveal" sulla **service_role** → "Reset"
3. Copia la nuova chiave (la vecchia smette di funzionare immediatamente)
4. **Su Vercel** → `Settings → Environment Variables` → aggiorna `SUPABASE_SERVICE_KEY` per Production + Preview + Development
5. Redeploy: `vercel --prod --yes`
6. **Verifica**: chiama `GET /api/health` → deve rispondere `200 { "db": true }`

**Downtime previsto:** 30-60 secondi tra reset e completion del redeploy. Per zero downtime serve un blue/green deploy che Vercel non supporta nativamente.

---

## §2. Migrazione progetto Supabase intero

Solo se cambi region/account. Procedura completa:

1. Crea nuovo progetto Supabase
2. Esegui in ordine:
   - `supabase_setup.sql`
   - `supabase_sync_log.sql`
   - `supabase_notifiche.sql`
   - `supabase_security_audit.sql` (sez. 2 hardening)
3. Migra i dati con `pg_dump`/`pg_restore` (vecchio→nuovo)
4. Aggiorna su Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `VITE_SUPABASE_URL` (client)
   - `VITE_SUPABASE_ANON_KEY` (client)
5. Redeploy → invalida cache client (CDN)

**Downtime previsto:** 5-15 minuti (dipende dalla dimensione del DB).

---

## §3. Rotazione API key di provider (Anthropic / Resend)

Procedura "blue-green" senza downtime:

1. **Genera nuova key** dalla dashboard del provider (Anthropic Console / Resend)
2. **Vercel**: aggiorna la env var (es. `ANTHROPIC_API_KEY`) sostituendo il valore vecchio con quello nuovo
3. Vercel applica il cambiamento al prossimo cold start (~1 minuto) — non serve redeploy
4. **Aspetta 5 minuti** (per essere certo che tutte le instance abbiano refreshato l'env)
5. **Revoca la key vecchia** dalla dashboard del provider

**Downtime previsto:** zero, se segui l'ordine.

---

## §4. Rotazione `CRON_SECRET` / `INTERNAL_API_SECRET`

Sono secret interni al sistema FoodOS, generati localmente.

1. **Genera nuovo secret**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Vercel**: aggiorna la env var
3. Per `CRON_SECRET`: Vercel cron usa automaticamente il valore aggiornato al prossimo trigger
4. Per `INTERNAL_API_SECRET`: cambia immediatamente alla prossima invocazione (cold start)

**Downtime previsto:** zero (entrambi sono fail-closed: il cron salta un'esecuzione se c'è race tra update e trigger, ma riprende all'esecuzione successiva).

---

## §5. Rotazione `ZUCCHETTI_WEBHOOK_SECRET`

Coordinarsi con il cliente Zucchetti.

1. Genera nuovo secret (vedi §4)
2. **Vercel**: aggiorna `ZUCCHETTI_WEBHOOK_SECRET`
3. **Comunica al cliente** il nuovo secret da impostare nel pannello Zucchetti Enterprise (Impostazioni → Webhook → Secret)
4. Tra il punto 2 e il 3, i webhook in arrivo vengono respinti con 401. Sono accodati lato Zucchetti, ritrasmessi quando il secret è coerente

**Downtime previsto:** finestra di alcuni minuti durante l'aggiornamento.

---

## §6. Aggiornamento `ADMIN_IPS`

L'IP allowlist per `/api/admin`. Se lo aggiorni male, ti chiudi fuori.

1. **Verifica il tuo IP corrente**: `curl ifconfig.me`
2. **Vercel**: imposta `ADMIN_IPS=ip1,ip2,ip3` (lista CSV, senza spazi)
3. Se ti escludi per errore: rimuovi la env var (ADMIN_IPS vuoto = whitelist disabilitata) e redeploy

**Best practice:** lascia `ADMIN_IPS` vuoto in development/preview, attivo solo in production.

---

## Verifica post-rotazione

Dopo ogni rotazione di un secret server-side, esegui:

```bash
# 1) Health check
curl https://foodios-rose.vercel.app/api/health
# atteso: { "status": "ok", "db": true }

# 2) Verifica admin (richiede tuo Bearer admin)
curl https://foodios-rose.vercel.app/api/admin?action=lista \
  -H "Authorization: Bearer <YOUR_TOKEN>"
# atteso: 200 con elenco clienti
```

E controlla in Supabase SQL Editor:

```sql
SELECT operation, count(*)
FROM audit_log
WHERE created_at > now() - interval '1 hour'
GROUP BY operation
ORDER BY count DESC;
```

Se vedi spike di `*_blocked` o errori, la rotazione ha rotto qualcosa.

---

## Disaster recovery

Se ti accorgi che un secret è compromesso (es. visto su GitHub pubblico, log Vercel pubblico):

1. **Ruota immediatamente** quel secret seguendo la procedura sopra
2. **Controlla `audit_log`**: cerca operazioni anomale nel periodo tra leak e rotazione
   ```sql
   SELECT * FROM audit_log
   WHERE created_at BETWEEN '<leak_ts>' AND now()
   ORDER BY created_at DESC LIMIT 200;
   ```
3. **Se SERVICE_KEY compromessa**: oltre alla rotazione, considera reset password forzato per tutti gli utenti (Supabase Auth Admin → bulk reset)
4. **Notifica titolari** se hanno dati potenzialmente esposti (GDPR Art. 33: notifica entro 72h al Garante)
