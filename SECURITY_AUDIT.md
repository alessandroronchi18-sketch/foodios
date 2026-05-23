# FoodOS — Security Audit 2026-05-23

Audit completo di `api/`, `src/lib/`, `src/components/`, `vercel.json` e schema Supabase. Riporta findings + fix applicate in questa sessione, e residual risk con piano di rientro.

---

## 🔴 Critiche (fixate ora)

### C1. Fail-open sui secret dei cron e webhook
**Pattern bug**: `if (SECRET && actual === SECRET) reject` — se la env var non è configurata, l'`if` non scatta e l'endpoint accetta chiunque.
**Endpoint affetti** (prima della fix):
- `api/cron-notifiche.js`
- `api/cron-report-mensile.js`
- `api/sync-delivery.js`
- `api/webhook-zucchetti.js`

**Conseguenza**: chiunque conoscendo l'URL poteva triggerare cron arbitrari (spedizione email di massa, sync arbitrari) o iniettare chiusure cassa fittizie.

**Fix**:
- Nuovo `api/lib/cryptoCompare.js` con `verifyBearerSecret` / `verifyRawSecret`.
- **Fail-closed**: se `process.env.X` è vuoto/non valido, l'auth ritorna `ok: false`.
- **Constant-time compare**: previene timing attacks sui secret (anche se in pratica difficili via HTTPS, è best practice).
- Lunghezza minima 16 char richiesta sul secret (rifiuta accidental empty strings o secret deboli).

**Azione richiesta**: configurare su Vercel **(obbligatorio per il funzionamento)**:
- `CRON_SECRET` — usato dai 3 cron Vercel
- `ZUCCHETTI_WEBHOOK_SECRET` — solo se si abilita il webhook Zucchetti
- `INTERNAL_API_SECRET` — usato per chiamate server→server (es. admin.js → send-email.js per 'approvazione')

### C2. User enumeration via admin.js
**Bug**: l'endpoint admin restituiva `{ reason: "not_admin:vittima@example.com" }` in caso di Bearer valido di non-admin.
**Conseguenza**: chi era loggato in FoodOS poteva inviare il proprio Bearer e ricevere conferma della sua email — utile per OAuth-style enumeration / verifica account compromessi.

**Fix**: `api/admin.js` ora restituisce solo `{ error: "Accesso negato" }` e logga il reason solo internamente (`admin_log`).

### C3. View admin_overview potenzialmente leggibile dal client
**Bug**: `public.admin_overview` non aveva REVOKE esplicito. Su PostgreSQL ≥ 15, le view con `security_invoker = off` (default) bypassano la RLS dell'invoker — un utente loggato poteva fare `SELECT * FROM admin_overview` via PostgREST e leggere tutte le organizzazioni.

**Fix**: aggiunta sezione 2.4-bis in `supabase_security_audit.sql`:
- `REVOKE ALL ON public.admin_overview FROM anon, authenticated`
- `ALTER VIEW ... SET (security_invoker = true)` su PG ≥ 15

**Azione richiesta**: rilanciare `supabase_security_audit.sql` su Supabase.

---

## 🟠 Alte (fixate ora)

### A1. HTML injection nelle email transazionali
**Bug**: in `send-email.js` (approvazione, benvenuto) e `cron-report-mensile.js`, i campi `prof.nome_completo`, `org.nome`, `nomeAttivita` venivano interpolati in HTML tramite `sanitize()` — che è un anti-XSS debole (rimuove `<script>` e `javascript:` ma non `<a href>`, `<img>`, `<style>`).
**Conseguenza**: un utente che registra account con nome `<a href="http://phishing">Vinci €100</a>` riceve la propria email "personalizzata" con phishing link cliccabile inviata dal `noreply@foodios.it` ufficiale.

**Fix**: tutti i campi user-controlled in HTML email passano ora attraverso `escapeHtml()` (vera entity escape: `&<>"'`).

### A2. CSP `unsafe-eval`
**Findings**: la CSP aveva `'unsafe-eval'` su `script-src`. Non risulta necessario: jsPDF, XLSX, Recharts non usano `eval()`.

**Fix**: rimosso `'unsafe-eval'`. Build verde, runtime ok. Resta `'unsafe-inline'` (ineliminabile senza nonce dinamico, che richiederebbe SSR).

Aggiunti anche:
- `Cross-Origin-Opener-Policy: same-origin` (protegge da window.opener attacks)
- `Cross-Origin-Resource-Policy: same-origin`

### A3. CORS troppo permissivo
**Bug**: `getCorsHeaders` ritornava sempre `Access-Control-Allow-Origin: <primo_dominio>` anche per origin non whitelistati.
**Fix**: ora il header `Allow-Origin` viene emesso **solo** se l'origin è in whitelist (o matcha il pattern dei preview Vercel del nostro team). Origin sconosciuti non ricevono header → browser blocca.

### A4. Action admin "pulisci_demo_fatture" troppo permissiva
**Bug**: la guard era `if (valore === 'preview') return preview; else delete`. Qualunque valore diverso da 'preview' (vuoto, refused, typo) cancellava.
**Fix**: ora accetta solo `'esegui'` per cancellare; default = preview.

### A5. `/api/ai` accetta role:'system' iniettato dal client
**Bug**: i `messages` venivano proxied così come arrivavano. Un client poteva iniettare `{ role: 'system', content: '...ignore previous instructions...' }`.
**Fix**: `api/ai.js` ora filtra `messages` accettando solo `role: user|assistant`.

### A6. Console.log con email/userId in produzione
**Bug**: `useAuth.js` loggava email e UUID completi → leak da DevTools su computer condivisi.
**Fix**: log avviene solo in `import.meta.env.DEV`; in prod log abbreviato a 8 char di UUID, niente email.

---

## 🟡 Medie (fixate ora)

### M1. Referral code 4 cifre brute-forceable
**Bug**: `Math.floor(1000 + Math.random() * 9000)` = 9.000 combinazioni. Con rate limit 10 req/min IP e un attaccante distribuito, brute-forzabile in ore.
**Fix**: 6 caratteri da alfabeto 32-char crypto-random (`crypto.getRandomValues`) → ~10⁹ combinazioni. Codici esistenti restano validi (varia solo la generazione futura).

### M2. Log table revoke
**Bug**: `admin_log` e `rate_limits` non avevano RLS esplicita né REVOKE — su PG con permessi default potevano essere letti da anyone con auth token.
**Fix**: sezione 2.4-ter di `supabase_security_audit.sql` revoca anon/authenticated e abilita RLS.

---

## 🟢 Già attive prima di questo audit

- RLS attiva su `user_data`, `organizations`, `sedi`, `profiles` (vedi `supabase_setup.sql`)
- Audit log `audit_log` con trigger automatico su modifiche al ricettario (vedi `supabase_security_audit.sql` sezione 2.2-2.3)
- Rate limit export PDF (10/h ricettario) — `api/audit-export.js`
- Watermark PDF (email + nome attività + diagonale + metadata) — `src/lib/exportPDF.js`
- Zero-trust su `/api/ai` (blocca cross-org se body dichiara organization_id diverso)
- UA fingerprint binding sessione — `src/lib/sessionGuard.js`
- CSP con `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`
- HSTS, X-Content-Type-Options, X-Frame-Options DENY, Permissions-Policy

---

## 🔵 Residual risk (non risolto, motivato)

### R1. localStorage per token Supabase
Supabase salva il session token in `localStorage` di default. Se un XSS passa (improbabile con la CSP attuale ma non zero), il token è esfiltrabile.

**Mitigazione attuale**: CSP senza `unsafe-eval`, `frame-ancestors 'none'`, niente `dangerouslySetInnerHTML` con dati user-controlled (verificato con grep).

**Per fix completo**: configurare Supabase a usare cookie httpOnly invece di localStorage — richiede SSR (Vercel functions) per il refresh token. Non fattibile con architettura SPA attuale senza refactor.

### R2. `'unsafe-inline'` su `script-src`
React non lo richiede direttamente, ma alcuni snippet `<script>` inline in `index.html` e librerie 3rd-party lo richiedono. Eliminabile solo con nonce-based CSP (richiede SSR).

### R3. Cifratura at-rest ricettario
**Decisione**: non implementata perché client-side con salt nel bundle = security theater. Implementazione vera richiede pgcrypto + KMS server-side (Supabase Vault). 2-3 giorni di refactor che impatta `sloadAllSedi`, `/api/benchmark`, cron — vedi `ROADMAP.md`.

### R4. Magic link impersonation in `admin.azImpersona`
L'admin può generare magic link per qualunque utente. **Mitigazione**: tutte le impersonation finiscono in `admin_log` con email admin + IP + UA + timestamp. Non eliminabile come funzione (serve per supporto), solo loggabile.

### R5. Spam email "benvenuto"
`send-email.js` con `tipo: 'benvenuto'` può essere chiamato da chiunque (con rate limit 5/h IP). Un attaccante distribuito può inviare email FROM `noreply@foodios.it` a destinatari arbitrari, ma il **content** è hardcoded (template benvenuto FoodOS) e l'unica vittima sono email-bombing dei target. Non implementabile gate auth perché lo chiamiamo subito dopo signUp quando l'utente non ha ancora session token. **Mitigazione**: rate limit 5/h per IP attivo, no API key esposta, content non controllabile dall'attacker (no phishing arbitrario).

### R6. cron-notifiche.js usa schema obsoleto
Il file legge `key='magazzino'` ma la chiave reale è `data_key='pasticceria-magazzino-v1'`. Il cron è **funzionalmente rotto** ma non è una vuln di sicurezza — semplicemente non manda alert. Da fixare separatamente.

---

## Azioni richieste dopo deploy

1. **Configurare le env vars su Vercel** (obbligatorio):
   - `CRON_SECRET` (≥ 32 caratteri random)
   - `INTERNAL_API_SECRET` (≥ 32 caratteri random)
   - `ZUCCHETTI_WEBHOOK_SECRET` (solo se si usa l'integrazione)
   - Senza queste, i cron e i webhook **rifiuteranno tutto** (fail-closed).

2. **Rilanciare `supabase_security_audit.sql`** su Supabase SQL Editor:
   - Diagnosi (sezione 1) per identificare anomalie
   - Hardening (sezione 2) per applicare RLS forzata, audit log, revoke su admin_overview

3. **Generare i secret** con un comando come:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Verificare in dashboard Vercel** che le funzioni cron non stiano fallendo (potrebbero restituire 401 finché non aggiungi `CRON_SECRET`).
