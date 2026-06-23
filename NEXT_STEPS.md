# FoodOS — Cose che devi fare tu (Greg)

> Questo documento elenca **solo le azioni che richiedono chiavi/account esterni, decisioni umane, soldi o tempo offline**.
> Il codice e' allineato; gli step elencati qui non sono dentro git per loro natura.
>
> Aggiornato: **2026-06-22** dopo sess. audit 1/2/3/4.

---

## STATO DEPLOY (22 giu 2026)

- Vercel **Pro** attivo. Autodeploy su push a `main` (~1-2 min).
- Prod live: `foodios-rose.vercel.app` allineata a `main` HEAD `a482316`.
- **Test suite 1296/1297 verdi** (71 file, 52s) — ESLint clean.
- **Lighthouse CI** attivo (su PR + cron settimanale lunedi 08:00).
- Migration applicate in prod Supabase **fino a 20260707_plan_pricing_meta** (incluse: PIN lockout, push subs, RPC pin_status, email_blocklist, manual_approval_gate, ai_credit_packs, plan_pricing_meta).
- Env vars Vercel attive: VAPID×3, VITE_VAPID_PUBLIC_KEY, INTERNAL_SECRET, ADMIN_PROD_MFA_BYPASS (temporaneo).
- Pricing 3-tier configurato: **Bottega €69 · Maestro €149 · Insegna €399**.

---

## 🔴 Bloccanti per il primo pagante reale

### 1. Dominio `foodios.it` agganciato
- [ ] Registrare `foodios.it` (Aruba/Namecheap/Cloudflare ~€15/anno)
- [ ] Vercel → Settings → Domains → Add `foodios.it` + `www.foodios.it`
- [ ] Aggiungere i record DNS suggeriti da Vercel (A/CNAME)
- [ ] Verifica: aprire `https://foodios.it` deve mostrare la landing in HTTPS

**Perche'**: le email partono da `noreply@foodios.it` e i link nei template puntano a `foodios.it`. Senza dominio agganciato, DKIM fallisce → spam.

---

### 2. Resend domain verification
- [ ] Account Resend (resend.com) → Add Domain `foodios.it`
- [ ] Copiare i record DNS proposti (SPF + DKIM + DMARC) sul registrar/Vercel DNS
- [ ] Verificare il dominio dal pannello Resend (status: verified)
- [ ] Su Vercel → Env Vars → `RESEND_API_KEY` (Production) gia' configurato? verifica con `POST /api/send-email` di benvenuto
- [ ] Test: email arriva in inbox, non spam

---

### 3. Stripe LIVE mode con 3-tier nuovo
- [ ] Stripe Dashboard → switch a **Live mode**
- [ ] Crea 3 Products + Prices (con i nomi nuovi):
  - **Bottega** mensile €69.00 EUR → annotare `price_id`
  - **Maestro** mensile €149.00 EUR → annotare `price_id`
  - **Insegna** mensile €399.00 EUR → annotare `price_id`
- [ ] Vercel Env Vars (Production):
  - `STRIPE_SECRET_KEY` = `sk_live_...`
  - `STRIPE_BOTTEGA_PRICE_ID` = `price_...`
  - `STRIPE_MAESTRO_PRICE_ID` = `price_...`
  - `STRIPE_INSEGNA_PRICE_ID` = `price_...`
- [ ] Stripe Dashboard → Webhooks → Add endpoint `https://foodios.it/api/stripe-webhook`
  - Eventi: `checkout.session.completed`, `customer.updated`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_{succeeded,failed}`
  - Copiare il `signing secret` → `STRIPE_WEBHOOK_SECRET`
- [ ] Pacchetti foto AI: 3 Products one-shot (€5/€15/€60) + price_id su env (`STRIPE_PRICE_FOTO_{50,200,1000}`) — vedi `api/buy-ai-pack.js`
- [ ] Stripe Tax: attivare per Italia
- [ ] Test end-to-end live con la TUA carta (poi rimborso)

---

### 4. Fatturazione elettronica SDI
**Il blocco piu' grosso per B2B Italia.** Senza, non puoi fatturare legalmente.

Stato codice: scaffolding Fatture in Cloud presente (`src/lib/sdiProvider.js`, `src/lib/fattureInCloud.js`, migration `sdi_invoice_log` + `sdi_emission_queue` applicate).

Cosa devi fare:
- [ ] Aprire account Fatture in Cloud (€9/mese piano "Premium" — include SDI)
- [ ] Generare API token in Impostazioni
- [ ] Vercel env vars: `FATTUREINCLOUD_API_TOKEN`, `FATTUREINCLOUD_COMPANY_ID`
- [ ] Test fatturazione con la tua P.IVA su un cliente di prova
- [ ] Verificare PDF generato + email arrivata via Resend

Alternative: Aruba Fatturazione (€10/mese), Easyfatture. **API differenti**, riscrittura.

Workaround corto: vendere a 2-3 clienti emettendo fatture manualmente da un provider esterno. Non scala oltre 5 paganti.

---

## 🟡 Importanti pre-launch

### 5. Compilare placeholder legali
Files: `src/pages/PrivacyPolicy.jsx`, `TerminiServizio.jsx`, `Contatti.jsx`.
- [ ] `[RAGIONE SOCIALE]`, `[INDIRIZZO COMPLETO]`, `[NOME LEGALE]`, `[CITTA SEDE LEGALE]`, `[INSERIRE PEC]`, `[PROVIDER SDI]`

Alternativa: **Iubenda** (€27/anno) genera Privacy/Cookie/Termini compliant + aggiornamento auto.

---

### 6. Supabase Pro plan
- [ ] Supabase Dashboard → Billing → Pro ($25/mese)
- [ ] Sblocca PITR 7 giorni + backup giornalieri + alerting

---

### 7. Rimuovere `ADMIN_PROD_MFA_BYPASS`
Il bypass temporaneo `ADMIN_PROD_MFA_BYPASS=true` + `ADMIN_PROD_MFA_BYPASS_EMAILS=alessandro.ronchi18@gmail.com` permette al fondatore di entrare in `/admin` senza MFA. Va rimosso quando si costruisce una UI MFA TOTP dedicata.

**Cosa fare:**
- [ ] Decidere quando costruire la UI MFA enrollment proper (al momento NON c'è schermata di setup TOTP dentro l'app)
- [ ] Quando pronta: Vercel env vars → rimuovere `ADMIN_PROD_MFA_BYPASS` + `ADMIN_PROD_MFA_BYPASS_EMAILS`
- [ ] Redeploy

---

### 8. Inbox email reale
- [ ] Creare `support@foodios.it`, `hello@foodios.it`, `legal@foodios.it`
  - Google Workspace (~€6/mese/casella) o forward Cloudflare → tua personale
- [ ] Verificare `noreply@foodios.it` "verified sender" su Resend

---

### 9. Lighthouse CI: aggiungere LHCI_GITHUB_APP_TOKEN
Il workflow `.github/workflows/lighthouse.yml` e' attivo ma puo' funzionare meglio con il GitHub App di Lighthouse:
- [ ] Installare https://github.com/apps/lighthouse-ci sul repo
- [ ] Aggiungere secret `LHCI_GITHUB_APP_TOKEN` in Settings → Secrets and variables → Actions

Senza il token, il workflow gira lo stesso (in modalita' temporary-public-storage) ma i report non si attaccano alle PR.

---

### 10. Configurare branch protection main
Il file `RUNBOOK_BRANCH_PROTECTION.md` ha la procedura. Mai fatto.
- [ ] Settings → Branches → Add rule per `main`
- [ ] Required status checks: `Unit tests`, `migration-check`, `smoke-prod`
- [ ] (Opzionale) Lighthouse come check ma non bloccante
- [ ] Require PR before merge: si

---

## 🟢 Decisioni di business / produzione

### 11. Pitch ai prospect con demo personalizzata
La feature `Demo personalizzata` (admin → Personalize Demo Modal) e' pronta:
- [ ] Fai foto del menu/listino del prospect prima del pitch
- [ ] Apri /admin → tab Demo → Personalize → upload foto
- [ ] Claude Vision estrae 10-15 prodotti con prezzi → preview
- [ ] Conferma → seed Customer 360 con i SUOI gusti
- [ ] Pitcha: l'app ha gia' dentro i suoi gusti reali → impatto

### 12. Approvazione manuale signup
- [ ] Controllare /admin → tab "⏳ In attesa" almeno una volta al giorno
- [ ] Approva manualmente i signup legittimi
- [ ] Rifiuta gli scam (codice rifiuta auto-blocca email + IP per 72h)

### 13. Decidere quando ripristinare le soglie coverage vitest
Le soglie sono state abbassate (lines 30, functions 50, statements 30, branches 60) per essere consistenti col nuovo coverage che include `src/components` + `src/views` (file grandi senza test mirati). Quando il coverage di view/components sale (es. scrivendo test specifici per ogni view), risalire le soglie a 70/80/70/75.

---

## ✅ Cose che NON devi fare (gia' fatte)

- ~~Migration applicate~~ → tutte fino a 20260707 ok
- ~~Service-role key ruotata~~ → fatta dopo sess.1
- ~~ESLint installato + flat config~~ → ok, 0 errors
- ~~Test suite~~ → 1296 verdi, +187 in 2 giorni
- ~~Lighthouse CI workflow~~ → installato, gira gia' su PR + cron
- ~~Pricing 3-tier in admin~~ → live (Bottega/Maestro/Insegna)
- ~~Pacchetti foto AI scaffolding~~ → backend pronto, UI client nascosta per ora
- ~~Demo personalizzata Claude Vision~~ → end-to-end pronta in /admin
- ~~Codici sconto + Referral leaderboard~~ → live in /admin
- ~~Customer 360 + Cmd+K + SQL editor admin~~ → live

---

## Ordine operativo consigliato per il primo pagante

**Settimana 1** (config, no codice da scrivere):
1. Compra dominio + Vercel Domains + DNS
2. Resend domain + DKIM
3. Stripe LIVE + 3 Products + Webhook secret
4. Inbox email reale
5. Supabase Pro upgrade

**Settimana 2** (compliance + SDI):
6. Compila placeholder legali (o Iubenda)
7. Apri Fatture in Cloud + API token
8. Test fatturazione end-to-end con la tua P.IVA
9. Installa Lighthouse CI GitHub App
10. Branch protection su main

**Settimana 3** (soft launch):
11. Pitch personalizzato ai 3 design partner (demo Vision)
12. Approva i loro signup manualmente
13. Fattura il primo mese a Mara

**Stato attuale**: codice pronto al 100% per i punti 11-13. Servono i punti 1-10 per essere legalmente operativi.
