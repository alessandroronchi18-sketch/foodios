# FoodOS — Roadmap Integrazioni

> Analisi 2026 dell'ecosistema software/tool che le PMI food italiane usano,
> con prioritizzazione per FoodOS in base a impatto su revenue / sales /
> retention.

---

## 🎯 Logica di priorità

Una integrazione vale la pena se soddisfa **almeno 2 di 3** criteri:

1. **Blocco di vendita**: senza, il cliente non puo' chiudere il deal (es. SDI in Italia B2B = legge)
2. **Adozione >30%** del segmento target (pasticcerie/gelaterie/bar artigianali italiani)
3. **Riduce churn** di almeno il 20% nei primi 90gg (es. POS che evita doppia inserimento dati)

Tutto il resto e' "nice to have" e va dopo €30k MRR.

---

## 🔴 BLOCCANTI (P0) — Senza non vendiamo

### 1. Fatturazione elettronica SDI

**Status FoodOS**: ❌ NON FATTO. Bug-bear principale per Italia B2B.

**Provider candidati** (con valutazione):

| Provider | Prezzo | API | Pro | Contro | Reco |
|---|---|---|---|---|---|
| **Fatture in Cloud** (TeamSystem) | €4-51/mese | REST v2 docs ottime | 580k partite IVA, brand strong, supporto IT | Tariffa per-org se passiamo through, oppure singolo account FoodOS che emette per i clienti | **CONSIGLIATO** per MVP |
| **Aruba Fatturazione Elettronica** | ~€10/mese | SOAP + REST | Hardware fiscale + PEC bundle | API meno friendly, SOAP-style | Alternativa |
| **Danea Easyfatt** | €4-35/mese | Limited API | 100k aziende, magazzino fortissimo | API non-public per piano base | No |
| **Aruba/Acubitt SDI direct** | Pagamento on-demand | XML SDI raw | Massima libertà | Devi scrivere tu il parser/firma | No, troppa complessità |

**Architettura proposta FoodOS**:
- Account master FoodOS su Fatture in Cloud (uno per noi)
- Quando un cliente Stripe paga `invoice.payment_succeeded`, FoodOS emette fattura elettronica via Fatture in Cloud API per conto suo verso il cliente cliente.
- Endpoint `api/sdi-emit-invoice.js` (stub gia' scaffolded, vedi sotto)
- Env vars: `FATTUREINCLOUD_ACCESS_TOKEN`, `FATTUREINCLOUD_COMPANY_ID`

**Effort**: 1 settimana.

### 2. Stripe checkout LIVE mode

**Status FoodOS**: 🟡 codice pronto (in `feat/go-live-prep` mergiato), ma config Vercel ancora in test mode.

**Da fare**:
- `STRIPE_SECRET_KEY = sk_live_...`
- `STRIPE_PRO_PRICE_ID`, `STRIPE_CHAIN_PRICE_ID` con price_id LIVE
- Webhook URL configurato in Stripe Dashboard live
- Stripe Tax attivato per Italia (calcolo IVA auto)

**Effort**: 30 minuti config.

---

## 🟠 HIGH IMPACT (P1) — Differenziatori vs competitor

### 3. POS Cassa in Cloud (TeamSystem)

**Adozione**: ~40% delle pasticcerie/gelaterie con cassa cloud italiana.

**Status FoodOS**: 🟡 endpoint stub gia' presente (`api/sync-delivery.js` riga 32-47), tipo='cassaincloud'. Manca: API token reale, parsing vendite, sync verso `pasticceria-chiusure-v1`.

**API**: [Cassa in Cloud API](https://www.cassaincloud.it/) — REST documentata, OAuth2 token-based.

**Flow**:
- L'utente da Impostazioni → Integrazioni → "Connetti Cassa in Cloud" inserisce API key
- Salva in `integrazioni.config_encrypted` (post-fix audit-final con encryption)
- Cron giornaliero alle 2am sync vendite del giorno precedente → genera record in `pasticceria-chiusure-v1` per ogni sede
- Cliente non deve piu' inserire chiusura manualmente → **riduce churn drasticamente**

**Effort**: 2 giorni di sviluppo + 1 giorno test con tester.

### 4. Tilby / Sumup POS

**Adozione**: 15-25% (Tilby), 30%+ (SumUp negli ultimi 2 anni).

**Status FoodOS**: stub presente per SumUp (`api/sync-delivery.js` riga 48). Manca implementazione completa.

**Effort**: 1 giorno per provider (Tilby ha API REST simile a CiC).

### 5. Glovo / Deliveroo / JustEat / Uber Eats (delivery)

**Adozione**: 60-80% dei food artigianali con vendita digitale.

**Status FoodOS**: 🟢 **CSV import gia' implementato** in `src/lib/importDelivery.js` (parseDeliveroo, parseJustEat, parseGlovo, parseGenericCSV). L'utente carica CSV mensile e i ricavi entrano in `pasticceria-chiusure-v1`.

**Upgrade naturale**: API live (richiede partnership business con le piattaforme — Deliveroo Partner API, Glovo Partner, ecc.). Stato attuale e' OK per soft launch.

**Alternative consigliate (third-party aggregator)**:
- **Deliverart** (italiano, Roma, già in 11 città) — aggrega tutti i delivery in un'unica API
- **Deliverect** (internazionale, partner Glovo certified)
- **YellGO** (italiano)

Vedere [Deliverart integrazioni](https://www.deliverart.it/integrazioni/) e [Deliverect Glovo POS](https://www.deliverect.com/en/integrations/glovo).

**Effort per integrazione diretta una piattaforma**: 3-5 giorni. Effort per Deliverart aggregator: 2 giorni.

### 6. WhatsApp Business notify ai clienti

**Adozione**: 90% dei pasticceri italiani usano WhatsApp Business.

**Status FoodOS**: 🟡 endpoint `api/cron-whatsapp.js` esiste ma e' per report serale al titolare, non per notify ai clienti finali.

**Use cases**:
- "La tua torta e' pronta" (B2C, opzionale)
- Report serale al titolare con KPI (gia' implementato)
- Notifica scadenza fatture fornitori al titolare

**Provider**: Twilio WhatsApp Business API o `whatsapp-web.js` self-hosted.

**Effort**: 1 giorno (Twilio), 3 giorni (self-hosted).

### 7. Telegram bot (alternativa B2C)

**Adozione**: bassa nel food artigianale ma a costo zero. Skip.

---

## 🟡 MEDIUM (P2) — Quando i paganti superano 10

### 8. Zucchetti TS Pay / TS Studio (commercialisti)

**Adozione**: il 70% dei commercialisti italiani usa Zucchetti per gestionali clienti.

**Status FoodOS**: webhook `api/webhook-zucchetti.js` esiste (con signature check). Significa che possiamo ricevere notifiche da Zucchetti. NON significa che il commercialista vede i dati FoodOS dentro Zucchetti.

**Upgrade**: integrazione bidirezionale — esporta dati contabili FoodOS in formato Zucchetti, ricevi pagamenti da Zucchetti.

**Effort**: 5+ giorni (richiede partnership Zucchetti).

### 9. Hardware POS (Epson TM-T20, RCH, Olivetti)

**Adozione**: 100% delle attività al banco (legge italiana sui registratori telematici).

**Status FoodOS**: ❌ niente.

**Decisione strategica**: integrare hardware fisico aumenta scope tecnico enormemente. Meglio integrarsi al cloud-POS che a sua volta parla con l'hardware (vedi P1 Cassa in Cloud).

**Effort**: skip per ora.

### 10. Google Analytics 4 / Plausible Analytics

**Per FoodOS landing/app**: tracking interno per analizzare conversion.

**Status FoodOS**: ❌ niente. La policy cookie e' "solo tecnici" — se aggiungiamo GA va aggiunto banner consenso.

**Reco**: **Plausible self-hosted** (privacy-friendly, no cookie banner). Costo: €9/mese cloud o gratis self-hosted.

**Effort**: 1 ora.

### 11. PostHog / Mixpanel (product analytics)

**Per capire come i clienti usano FoodOS**.

**Status FoodOS**: ❌. Il pannello admin Tier 1+2 ha gia' activation score + audit_log per-cliente, sufficiente per i primi 50 clienti.

**Reco**: aspettare €5k MRR poi PostHog cloud (€450/mese fino a 1M events).

### 12. Banche italiane (CBI / PagoPA)

**Per riconciliazione bancaria automatica delle fatture pagate**.

**Adozione**: 5-10% delle PMI artigianali (richiede commercialista evoluto).

**Reco**: skip per ora. Importanza per FoodOS bassa (siamo SaaS, non gestionale contabile completo).

---

## 🟢 LOW (P3) — Solo se richiesto da cliente specifico

### 13. SAP Business One / Microsoft Dynamics

**Adozione**: zero nel segmento pasticcerie artigianali. Skip.

### 14. HubSpot CRM / Salesforce

**Adozione**: zero. Skip.

### 15. Mailchimp / Klaviyo

**Per marketing email FoodOS**. Per ora `api/send-email.js` con Resend basta. Quando MRR >€10k → Klaviyo.

### 16. Calendly / Cal.com

**Per book demo da landing page**. Quando il pipeline qualificato > 20/settimana.

---

## 📊 Riepilogo prioritizzato

| Priorità | Integrazione | Adozione segmento | Effort | Status |
|---|---|---:|---|---|
| **P0** | Fatturazione SDI (Fatture in Cloud) | 100% B2B IT | 5gg | ❌ |
| **P0** | Stripe LIVE mode | 100% checkout | 30min | 🟡 config |
| **P1** | Cassa in Cloud POS | 40% | 3gg | 🟡 stub |
| **P1** | SumUp POS | 30% | 1gg | 🟡 stub |
| **P1** | Tilby POS | 20% | 1gg | ❌ |
| **P1** | Delivery (Deliveroo/Glovo/JustEat) CSV | 70% | ✅ | 🟢 fatto |
| **P1** | Delivery API live (via Deliverart) | 70% | 2gg | ❌ |
| **P1** | WhatsApp Business notify | 90% | 1gg (Twilio) | 🟡 cron own report |
| **P2** | Zucchetti TS commercialisti | 70% via commercialista | 5gg | 🟡 webhook |
| **P2** | Plausible Analytics | n/a interno | 1h | ❌ |
| **P3** | Calendly demo book | n/a | 1h | ❌ |
| skip | Hardware POS diretto | 100% | settimane | skip |
| skip | SAP / HubSpot / Mailchimp | <5% | n/a | skip |

---

## 🛣️ Sequenza consigliata (12 mesi)

**Mese 1** (giu 2026):
- ✅ Stripe LIVE config (30min)
- ✅ Fatturazione SDI Fatture in Cloud — endpoint + cron — **sblocca primi 3 paganti**

**Mese 2-3** (lug-ago):
- ✅ Cassa in Cloud POS — sync vendite — **riduce churn -30%**
- ✅ Telegram bot notify titolare (proof-of-concept)
- ✅ Plausible analytics (1h)

**Mese 4-6** (set-nov):
- ✅ SumUp + Tilby POS
- ✅ WhatsApp Business notify titolare via Twilio
- ✅ Deliverart per delivery API live

**Mese 7-12** (dic-mag 2027):
- Zucchetti partnership (canale commercialisti, alta complessita')
- PostHog analytics (quando >€5k MRR)
- Klaviyo email marketing (quando >€10k MRR)
- Calendly demo book

---

## 🏗️ Architettura tecnica integrazioni

### Tabella `public.integrazioni` (mig. 20260512 + 20260611 encryption)

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK |
| tipo | text | 'cassaincloud', 'sumup', 'tilby', 'fattureincloud', 'deliverart', 'whatsapp', ecc. |
| attiva | boolean | |
| config_encrypted | text | AES-256-GCM ciphertext (post audit-final mig. 20260611) |
| config_iv | text | IV 12 byte |
| config_tag | text | GCM tag 16 byte |
| encryption_version | int | 0=legacy plaintext, 1=AES-GCM |
| ultimo_sync | timestamptz | |
| created_at | timestamptz | |

### Registry provider — `api/lib/integrationProviders.js`

Definizioni metadata dei provider supportati: nome display, campi config attesi,
icona, link docs, scopes OAuth (se applicabile). Aggiunto in questa PR.

### Endpoint SDI — `api/sdi-emit-invoice.js`

Stub aggiunto in questa PR. Chiamato dal webhook Stripe `invoice.payment_succeeded`,
emette fattura elettronica via Fatture in Cloud API. Disabilitato finche'
`FATTUREINCLOUD_ACCESS_TOKEN` non e' configurato (fail-closed).

### Cron per integrazioni (vercel.json)

- `0 2 * * *` → `sync-delivery` (carica vendite cassa POS notte precedente)
- `30 8 * * *` → `cron-notifiche` (notifica trial + magazzino sotto soglia)
- `0 20 * * *` → `cron-whatsapp` (report serale titolare)

---

## Sources

- [Fatturazione elettronica 2026 conformità (pmi.it)](https://www.pmi.it/tecnologia/software-e-web/492982/fatturazione-elettronica-novita-fatture-in-cloud.html)
- [Fatture in Cloud per PMI](https://www.fattureincloud.it/pmi/)
- [Migliori software fatturazione elettronica 2026 (Punto Informatico)](https://www.punto-informatico.it/fattura-elettronica-migliori-software/)
- [Software gestionali PMI Italia (Factorial)](https://factorial.it/blog/software-gestionale-per-le-pmi/)
- [YellGO — Integrazione delivery](https://www.yellgo.it/piattaforme-delivery-integrazione-justeat-deliveroo-glovo/)
- [Deliverart aggregatore delivery (StartupItalia)](https://startupitalia.eu/lifestyle/food-tech/deliverart-la-piattaforma-per-i-ristoratori-che-gestisce-tutti-i-delivery/)
- [Deliverect Glovo POS integration](https://www.deliverect.com/en/integrations/glovo)
- [Cassa in Cloud TeamSystem](https://www.cassaincloud.it/)
