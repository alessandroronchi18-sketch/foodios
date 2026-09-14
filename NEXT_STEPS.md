# FoodOS — Cose che devi fare tu (Greg)

> Questo documento elenca **solo le azioni che richiedono chiavi/account esterni, decisioni umane, soldi o tempo offline**.
> Il codice e' allineato; gli step elencati qui non sono dentro git per loro natura.
>
> Aggiornato: **2026-09-14**.

---

## STATO DEPLOY (14 set 2026)

- Vercel **Pro** attivo. Autodeploy su push a `main` (~1-2 min).
- Prod live: `foodos-rose.vercel.app`, allineata a `main`.
- **Test 2.255 verdi** (155 file), ESLint pulito su `src/` e `api/`, build ~20s,
  grammar check OK, cricchetto sui token di design OK.
- Migration **tutte applicate e verificate in produzione** via SQL diretto il
  14/09, comprese due che mancavano da mesi:
  - `20260621_stock_b2b_rpc` — le due funzioni delle vendite all'ingrosso non
    erano mai state create: ogni vendita B2B scaricava il magazzino come una
    vendita al banco, e il codice aveva un ripiego silenzioso che nascondeva la
    cosa. Trovata controllando tutte le 37 RPC chiamate dal codice contro
    quelle presenti nel database (le altre 35 ci sono tutte).
  - `20260914_stock_pf_rettifica` — nuova: serve per correggere una giacenza
    sbagliata senza dichiararla merce buttata.
- Lighthouse CI attivo (su PR + cron settimanale lunedì 08:00).

### Nota su dove si lavora

Esistono due copie del repo sul Mac. Quella buona e' **`/Users/aler/foodos`**
(branch `main`, allineata a `origin/main`). La copia in `~/Desktop/foodos` e'
ferma al 1 set, sta dentro iCloud Drive (git lentissimo) e va ignorata.

---

## 🔴 Bloccanti per il primo pagante reale

### 1. Dominio `foodos.it` agganciato
- [ ] Registrare `foodos.it` (Aruba/Namecheap/Cloudflare ~€15/anno)
- [ ] Vercel → Settings → Domains → Add `foodos.it` + `www.foodos.it`
- [ ] Aggiungere i record DNS suggeriti da Vercel (A/CNAME)
- [ ] Verifica: aprire `https://foodos.it` deve mostrare la landing in HTTPS

**Perche'**: le email partono da `noreply@foodos.it` e i link nei template puntano a `foodos.it`. Senza dominio agganciato, DKIM fallisce → spam.

---

### 2. Resend domain verification
- [ ] Account Resend (resend.com) → Add Domain `foodos.it`
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
- [ ] Stripe Dashboard → Webhooks → Add endpoint `https://foodos.it/api/stripe-webhook`
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
- [ ] Creare `support@foodos.it`, `hello@foodos.it`, `legal@foodos.it`
  - Google Workspace (~€6/mese/casella) o forward Cloudflare → tua personale
- [ ] Verificare `noreply@foodos.it` "verified sender" su Resend

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

### 14. Rifiniture della cassa (non bloccanti, nate col lavoro del 7 set)
La cassa e la prima nota sono in piedi e usabili. Quello che manca e' rifinitura,
da fare col feedback di chi la usa e non prima:

- [ ] **Memoria del mapping fra un mese e l'altro** nell'import registro incassi.
      Oggi l'abbinamento nomi-foglio → punti vendita si ripropone da zero a ogni
      caricamento (l'auto-match per contenimento funziona, ma se il cliente
      scrive la sede in modo diverso va rifatto a mano). Esiste gia'
      l'infrastruttura giusta: `import_mappings_library` + RPC
      `save_import_mapping` della mig. `20260901`.
- [ ] **Piu' fogli in un colpo**: oggi si importa un mese alla volta. Chi arriva
      con tre anni di storico fa 36 caricamenti.
- [ ] **Categorie nella prima nota**: il campo `categoria` esiste in
      `movimenti_cassa` ma la UI non lo chiede. Volutamente: imporre un elenco
      chiuso al primo giro produce solo una categoria "altro" piena. Da decidere
      guardando cosa scrive la gente nelle descrizioni dopo qualche settimana.
- [ ] **Uscite di cassa nell'export contabilita'**: la distinzione con fattura /
      senza / da verificare e' registrata e sommata, ma l'export per il
      commercialista non la porta ancora fuori.
- [ ] Le chiusure importate portano `fonte_incassi: 'registro'` in `extra`.
      Nessuna vista lo mostra: servirebbe per distinguere a schermo una giornata
      ricostruita dal foglio da una registrata sul momento.

---

### 15. Le tre funzioni che non si sbloccano scrivendo codice (11 set 2026)

Nel giro sulle funzioni mancanti ne sono uscite 15. Dodici sono state scritte e
sono in produzione. Tre no, e non perche' siano difficili: dipendono da qualcosa
che sta fuori dal repository. Le lascio qui con i numeri veri misurati sul
database, cosi' quando decidi sai cosa stai comprando.

- [ ] **Riconciliazione bancaria automatica — serve un fornitore di open banking.**
      Mara ha **3.104 fatture fornitore** caricate, di cui **978 ancora aperte**.
      Oggi per sapere se una e' stata pagata bisogna guardare l'home banking e
      spuntarla a mano: nessuno lo fa, e infatti la prima nota ha **0 movimenti**
      su tutto il database. Per leggere l'estratto conto serve un intermediario
      autorizzato PSD2 (in Italia si valutano Fabrick, Nexi, Salt Edge, Enable
      Banking, TrueLayer): sono contratti a canone, con adesione della banca e
      consenso dell'utente da rinnovare periodicamente. **Decisione tua: quanto
      costa il fornitore e se il canone sta dentro il prezzo dell'abbonamento.**
      Senza banca resta il ripiego gia' possibile: importare il CSV dei movimenti
      e abbinarlo agli importi delle fatture. Quello e' codice, e si puo' fare.

- [ ] **Sonde di temperatura HACCP — serve hardware.**
      Le tabelle ci sono da mesi (`haccp_apparecchi`, `haccp_temperature`), ma il
      database contiene **0 letture** e **1 solo apparecchio censito**, per di piu'
      sull'organizzazione demo e non su Mara. Non e' un buco di codice: senza
      sonde collegate qualcuno deve girare coi frigoriferi e scrivere i numeri a
      mano, e non lo fara'. Le sonde con gateway esistono (Testo Saveris, Elpro,
      sensori LoRaWAN), costano per punto di misura piu' un canone cloud.
      **Decisione tua: se e' una funzione da vendere o una casella da spuntare
      per l'ASL.** Se e' la seconda, la checklist manuale che c'e' gia' basta.

- [ ] **Stock vetrina — non e' un problema di codice, e' un problema di uso.**
      Su Mara c'e' **1 sola riga** di stock prodotti finiti, ferma al 1 settembre.
      Il meccanismo funziona (carico da produzione, scarico da vendita,
      trasferimenti fra sedi): semplicemente non lo usa nessuno, perche' il gelato
      lo governa l'inventario differenziale e i prodotti finiti sono un giro a
      parte. **Prima di scrivere altro codice qui, guarda se qualcuno lo apre.**
      Se dopo un mese di uso vero resta a una riga, la risposta giusta e'
      togliere la voce dal menu, non aggiungerci funzioni.

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
