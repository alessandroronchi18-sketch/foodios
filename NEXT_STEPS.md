# FoodOS — Cose da fare per andare LIVE

> Questo documento elenca **solo le azioni che richiedono chiavi/account esterni** o decisioni umane.
> Il codice e' pronto, ma alcune configurazioni sono fuori da git.

## STATO DEPLOY (11 giu 2026)

- Vercel Pro attivo ($20/mese). Limite 12 functions Hobby risolto.
- Prod live (`foodios-rose.vercel.app`) allineata a `main` HEAD `ff3da0a`.
- Migration applicate in Supabase: 20260624 (stripe webhook processed_at),
  20260625 (hot-path indexes), 20260626 (inventario produzione).
- Feature live: audit profondo + follow-up + metodo inventario gelaterie
  Phase 1 (foglio settimanale, scalo magazzino) + Phase 2 (dashboard
  quadratura inventario↔cassa, vista oggi mobile).

Deploy d'ora in poi: autodeploy via push su main, o `vercel --prod --yes`
da locale per deploy forzato.

---

## 🔴 Bloccanti per il primo pagante

### 1. Dominio `foodios.it` agganciato
- [ ] Registrare `foodios.it` (Aruba/Namecheap/Cloudflare ~ €15/anno)
- [ ] Vercel → Settings → Domains → Add `foodios.it` + `www.foodios.it`
- [ ] Aggiungere i record DNS suggeriti da Vercel (A/CNAME)
- [ ] Verifica: aprire `https://foodios.it` deve mostrare la landing in HTTPS

**Perche'**: le email mandano da `noreply@foodios.it` e i link nei template puntano a `foodios.it`. Senza dominio agganciato, le email partono ma falliscono DKIM check → finiscono in spam.

---

### 2. Resend domain verification
- [ ] Account Resend (resend.com) → Add Domain `foodios.it`
- [ ] Copiare i record DNS proposti (SPF + DKIM + DMARC) sul registrar/Vercel DNS
- [ ] Verificare il dominio dal pannello Resend (status: verified)
- [ ] Su Vercel → Env Vars → aggiungere `RESEND_API_KEY` (Production)
- [ ] Test: `POST /api/send-email` con `tipo=benvenuto` → l'email arriva in inbox (non spam)

---

### 3. Stripe LIVE mode
- [ ] Stripe Dashboard → switch a **Live mode** (non test!)
- [ ] Crea due Products + Prices:
  - **Pro** mensile €89.00 EUR → annotare `price_id`
  - **Chain** mensile €149.00 EUR → annotare `price_id`
- [ ] Vercel Env Vars (Production):
  - `STRIPE_SECRET_KEY` = `sk_live_...`
  - `STRIPE_PRO_PRICE_ID` = `price_...`
  - `STRIPE_CHAIN_PRICE_ID` = `price_...`
- [ ] Stripe Dashboard → Webhooks → Add endpoint `https://foodios.it/api/stripe-webhook`
  - Eventi da abilitare:
    - `checkout.session.completed`
    - `customer.updated`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_succeeded`
    - `invoice.payment_failed`
  - Copiare il `signing secret` (`whsec_...`) → Vercel env var `STRIPE_WEBHOOK_SECRET`
- [ ] Stripe Tax: attivare per Italia (Settings → Tax) — calcolo automatico IVA
- [ ] Test end-to-end:
  1. Registra account nuovo
  2. Vai a Impostazioni → Abbonamento → Sottoscrivi Pro
  3. Carta test fallback `4242 4242 4242 4242` (in test mode) o vera (live)
  4. Torna in app → vedere `piano=pro`, `approvato=true`
  5. Stripe Dashboard → Customers → verifica P.IVA + indirizzo raccolti
  6. Stripe Dashboard → Customers → portal session → cancel → vedere `stripe_status=canceled` in DB

---

### 4. Fatturazione elettronica SDI
**Il blocco piu' grosso per Italia B2B.** Senza, non puoi fatturare legalmente.

Scelta provider (consigliato **Fatture in Cloud** per documentazione + supporto italiano):
- [ ] Aprire account Fatture in Cloud (~€8/mese piano "Standard")
- [ ] Generare API token in Impostazioni
- [ ] Vercel env vars:
  - `FATTUREINCLOUD_API_TOKEN`
  - `FATTUREINCLOUD_COMPANY_ID` (il tuo studio_id)
- [ ] Implementare endpoint `api/sdi-emit-invoice.js` (chiamato dal webhook `invoice.payment_succeeded`):
  - Recupera org da `stripe_customer_id`
  - Estrae P.IVA + ragione_sociale + indirizzo + codice_destinatario
  - POST a Fatture in Cloud `/c/{company_id}/issued_documents` con type=invoice + e_invoice=true
  - Salva PDF restituito su Supabase Storage
  - Invia email cliente con link fattura

Alternative: Aruba Fatturazione Elettronica (~€10/mese), Easyfatture, integrazione manuale via Agyo. **L'API differisce tra provider**, quindi non posso scrivere lo scaffolding senza sapere quale scegli.

**Mentre questa parte non e' pronta**: puoi vendere a uso ridotto (max 2-3 clienti) emettendo fatture manualmente da provider esterno. Non scala oltre i 5 paganti.

---

## 🟡 Importanti pre-launch (ma non blocker tecnici)

### 5. Compilare placeholder legali
Nei file `src/pages/PrivacyPolicy.jsx`, `TerminiServizio.jsx`, `Contatti.jsx`, sostituire `[PLACEHOLDER]`:
- [ ] `[RAGIONE SOCIALE]` → es. "Mara dei Boschi S.r.l." o "Alessandro Ronchi P.IVA XXX"
- [ ] `[INDIRIZZO COMPLETO]` → indirizzo sede legale
- [ ] `[NOME LEGALE]`, `[CITTA' SEDE LEGALE]` (foro competente)
- [ ] `[INSERIRE PEC]` in Contatti.jsx
- [ ] `[PROVIDER SDI]` nella sezione 7 di Privacy Policy

Se vuoi una versione legale revisionata, **Iubenda** (~€27/anno) genera Privacy + Cookie + Termini in formato compliant + aggiornamento automatico al GDPR. Sostituirebbe i nostri file con uno script embed `<script src="iubenda.com/..."></script>`.

---

### 6. Supabase Pro plan (backup affidabili)
- [ ] Supabase Dashboard → Project Settings → Billing → Pro ($25/mese)
- [ ] Backup giornalieri automatici + Point-in-Time Recovery 7 giorni
- [ ] Database size aumentato a 8GB → 500GB con limiti uso ragionevole

Senza Pro plan: PITR limitato, backup limitati, niente alerting su uso.

---

### 7. Configurare MFA TOTP per admin
La hotfix MFA aveva aggiunto `DISABLE_ADMIN_MFA=true` come bypass d'emergenza. **Riattivare appena possibile**:
- [ ] Login admin a `/admin`
- [ ] Account → Security → Enable 2FA TOTP (Google Authenticator, Authy, 1Password)
- [ ] Salvare codici di recovery
- [ ] Vercel env vars → rimuovere `DISABLE_ADMIN_MFA` (o impostarlo a `false`)
- [ ] Redeploy

---

### 8. Migrations da applicare su Supabase
In ordine:
- [x] `20260608_admin_tier1.sql` (gia' applicata?)
- [x] `20260609_admin_tier2.sql` (gia' applicata?)
- [ ] **`20260610_business_info.sql`** ← aggiunta in questa PR — applicare prima del merge

Verifica:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='organizations'
  and column_name in ('partita_iva','codice_destinatario','ragione_sociale','indirizzo');
-- attesa: 4 righe
```

---

### 9. Inbox email
- [ ] Creare un account email reale `support@foodios.it`, `hello@foodios.it`, `legal@foodios.it`
  - Soluzione semplice: Google Workspace (~€6/mese/casella) o forward da Cloudflare a tua mail personale
- [ ] Verificare che `noreply@foodios.it` (in send-email.js linea 9) sia "verified sender" su Resend

---

### 10. Stock vetrina fix da mergiare
- [ ] PR `fix/dashboard-menu-stock` non e' ancora in main. Bug fix critico: cancellare una sessione di produzione lasciava prodotti "fantasma" in stock. Mergiare prima di esporre al primo cliente.

---

## 🟢 Nice to have (post-launch)

### 11. Status page
- [ ] Account su **instatus.com** (gratis fino a 5 componenti)
- [ ] Aggiungere link footer landing: "Stato del servizio"

### 12. Sentry per alerting
La tabella `error_log` (admin tier 2) ti permette di vedere gli errori dopo che accadono, ma non ti notifica. Per email/Slack alert su errori in prod:
- [ ] Account Sentry (gratis fino a 5k eventi/mese)
- [ ] `SENTRY_DSN` env var
- [ ] Aggiungere `@sentry/edge` agli endpoint critici

### 13. Status banner condizionale
In caso di disservizio Stripe/Supabase, pubblicare un banner manualmente dall'admin tier 1 (gia' implementato).

---

## Ordine operativo consigliato

**Giorno 1-2** (config, no codice):
1. Compra dominio
2. Vercel Domains + DNS
3. Resend domain + DKIM
4. Apri account Stripe live + crea Prices
5. Crea inbox email
6. Supabase Pro upgrade

**Giorno 3** (test):
7. Mergi questa PR (`feat/go-live-prep`)
8. Mergi `fix/dashboard-menu-stock`
9. Applica migration `20260610_business_info.sql`
10. Test signup + checkout end-to-end con la TUA carta su Stripe live (poi rimborsi)

**Giorno 4-7** (SDI):
11. Scegli + configura provider SDI
12. Implementa endpoint emissione fattura
13. Test fatturazione con la tua P.IVA

**Giorno 8-10** (compliance):
14. Compila placeholder legali (o Iubenda)
15. Riattiva MFA admin
16. Soft launch con i 3 design partner

**Quando tutto sopra e' ✅**: stappa una bottiglia, manda il link a Mara, fatturale il primo mese.
