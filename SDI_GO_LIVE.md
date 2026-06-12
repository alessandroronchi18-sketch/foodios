# SDI — Go-live checklist & decision log

## TL;DR

**Scelta operativa**: **Fatture in Cloud** (TeamSystem).

- Modulo `api/lib/fattureInCloud.js` già implementato (158 LOC).
- Endpoint `api/sdi-emit-invoice.js` già scrive su SDI via Stripe webhook
  (fire-and-forget) o admin manuale.
- Architettura agnostica via `api/lib/sdiProvider.js`: swap provider
  cambiando 1 env var (`SDI_PROVIDER`) + un modulo lib.

**Stato go-live**: ⚠️ scaffolded ma **NON in produzione** finché:

1. Env vars `FATTUREINCLOUD_API_TOKEN` + `FATTUREINCLOUD_COMPANY_ID` su Vercel ❌
2. Account Fatture in Cloud "Startup" attivato (€9/mese) ❌
3. Smoke test con organizzazione reale (Mara dei Boschi) ❌
4. Failure monitoring: dashboard admin tab "SDI errori" ❌

---

## Comparativa provider (decisione frozen 2026-06-11)

| Provider | Pricing | API REST | Sandbox | Pro | Contro |
|---|---|---|---|---|---|
| **🥇 Fatture in Cloud** | €0 free / **€9/mese Startup** / €19 Pro / €29 Premium | ✅ OpenAPI v2, JWT | ✅ buona | TeamSystem-owned, mercato leader IT (~500k clienti); SDK JS comunità; webhook stato fattura; gestione anagrafica clienti incorporata; emissione + ricezione + conservazione AdE 10 anni inclusa | API token user-bound (non service account) → rotazione manuale; rate limit 60 req/min (basta x noi); costo cresce con n° clienti |
| 🥈 Aruba | €15-€25/mese | ✅ SOAP + REST | 🟡 ostica | Aruba PEC bundling se serve PEC; certificato qualificato AdE | API SOAP-first (REST nuovo, meno docs); UX vecchia; setup VAT-id più lungo |
| 🥉 Easyfatque | €7-€12/mese | ✅ REST | ✅ | Più economico; UX pulita | Provider giovane, meno adozione, doc EN parziale; rischio liquidità/M&A |

**Perché Fatture in Cloud**:
1. **TeamSystem owner** = stabilità, no rischio shutdown
2. **Pricing trasparente** + tier free per test
3. **API JS quality** = il modulo esistente è già produttivo in <200 LOC
4. **Comunità + Stack Overflow**: troviamo risposte 5x più velocemente

---

## Cosa fa il modulo oggi

`api/lib/fattureInCloud.js` espone:

```js
upsertCliente({
  ragioneSociale, partitaIva, codiceFiscale,
  indirizzo, cap, citta, provincia, nazione,
  codiceDestinatario, pec, email,
})  // → { id_cliente_fattureincloud }

emettiFatturaElettronica({
  clienteId, dataEmissione, numero,
  importoNetto, aliquotaIva, descrizione,
  metodoPagamento, dataScadenza,
})  // → { invoice_id, sdi_status }

getInvoicePdfUrl(invoiceId)  // → url temporaneo per download PDF
```

`api/sdi-emit-invoice.js` (POST) gestisce:
- Auth: `x-internal-secret` (webhook Stripe) o Bearer admin
- Body validato (cap 64KB, body-stream limit)
- Idempotenza via tabella `sdi_invoice_log(stripe_invoice_id, org_id)`
- Errori: ritorna `{ error, missing: [env vars] }` con status 503 se non configurato

`api/sdi-emit-invoice.js` chiama il provider via `loadSdiProvider()` →
**zero couplings hard-coded a Fatture in Cloud nel codice business**.

---

## Checklist go-live (8 step, ~3-5 giorni operativi)

### Pre-flight (1 giorno)
- [ ] Account Fatture in Cloud "Startup" (€9/mese) registrato con ragione sociale FoodOS
- [ ] Cassetto fiscale + delega AdE per emissione SDI configurati
- [ ] API token generato (scopes: `entity.clients`, `issued_documents`, `e_invoices`)
- [ ] Company ID copiato dalla URL del workspace

### Vercel (15 min)
- [ ] `FATTUREINCLOUD_API_TOKEN` → Settings → Env Vars → **Production**
- [ ] `FATTUREINCLOUD_COMPANY_ID` → idem
- [ ] `INTERNAL_API_SECRET` (32+ char random) → Settings → Env Vars (se non già presente)
- [ ] `SDI_PROVIDER=fattureincloud` (opzionale, è il default)
- [ ] Redeploy production

### Smoke test (2-3 giorni)
- [ ] Curl manuale `POST /api/sdi-emit-invoice` con admin Bearer + payload Mara dei Boschi (importo simbolico €1)
- [ ] Verifica fattura creata su dashboard Fatture in Cloud
- [ ] Verifica `sdi_invoice_log` ha la riga con `invoice_id` valido
- [ ] Attendi callback SDI (tipicamente 2-24h) — stato dovrebbe diventare "consegnata"
- [ ] Re-emit idempotente: secondo POST con stesso `stripe_invoice_id` deve ritornare l'invoice_id esistente senza ri-emettere

### Hook Stripe (mezza giornata)
- [ ] In `api/stripe-webhook.js`, dopo `invoice.payment_succeeded`, aggiungere fire-and-forget verso `/api/sdi-emit-invoice` con `x-internal-secret`
- [ ] Catch silenzioso → log su tabella `errori_produzione` per visibilità admin
- [ ] Test con Stripe CLI: `stripe trigger invoice.payment_succeeded`

### Monitoraggio (1 giorno)
- [ ] In `src/admin/AdminPage.jsx`, aggiungere tab "SDI errori" con query su `sdi_invoice_log` filtrato per `status != 'consegnata'`
- [ ] Email admin se >0 fatture in errore da >24h
- [ ] Documentare il rollback: come ri-emettere manualmente una fattura falita

---

## Failure modes e fallback

| Failure | Effetto | Fallback |
|---|---|---|
| Fatture in Cloud down | sdi-emit-invoice 502/503 | Retry in coda; admin notifica; emissione manuale dal portale FattureInCloud |
| API token revocato/scaduto | 401 da FIC | Banner admin "ruota token" + endpoint validator |
| Company ID errato | 404 | Pre-check in dashboard "valida config SDI" |
| Codice destinatario cliente errato | SDI rifiuta dopo 24h | Webhook FIC `invoice.rejected` → notify titolare + retry con codice corretto |
| Stripe webhook non triggera | Fattura non emessa | Cron giornaliero che riconcilia: per ogni Stripe invoice pagata senza sdi_invoice_log, emetti |

---

## Domande aperte (decisioni differite)

1. **Sezionale**: una sola sezionale FoodOS, oppure una per region? → **una unica** per ora (semplice)
2. **Numerazione**: anno/progressivo (es. `2026/0001`) o serie A/B? → **anno/progressivo**, gestito da FIC automaticamente
3. **Conservazione AdE**: inclusa nel piano €9? → **sì, 10 anni inclusi**, no extra setup
4. **Fatture B2C consumer privati**: emettere fattura semplificata sotto soglia €400 o sempre fattura ordinaria? → **fattura ordinaria sempre** (semplifica, accettato fiscalmente)
5. **Notifica titolare**: email all'utente quando fattura emessa? → **sì**, via `send-email.js` tipo `'fattura_emessa'` (nuovo tipo da aggiungere)

---

## Riferimenti

- API docs Fatture in Cloud: <https://developers.fattureincloud.it/api-reference/>
- OpenAPI YAML: <https://github.com/fattureincloud/fattureincloud-openapi>
- Modulo wrapper: `api/lib/fattureInCloud.js`
- Astrazione provider: `api/lib/sdiProvider.js`
- Endpoint: `api/sdi-emit-invoice.js`
- Decisione frozen: 2026-06-11
