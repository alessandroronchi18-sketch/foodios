# FoodOS — Proposta 3 tier abbonamento
> Aggiornato: 2026-06-11 · Da discutere prima di toccare planAccess.js / Stripe / landing.

## Filosofia di base

Tre tier che corrispondono a **tre archetipi di proprietario**, non a tre livelli di "potenza tecnologica". L'errore classico SaaS è impilare feature random in Pro/Enterprise senza pensare al psyche del compratore.

| Tier | Archetipo proprietario | Slogan |
|---|---|---|
| **Base** | "Marco 65 anni, pasticceria di famiglia" / "Sara 28 anni, ha appena aperto" | *Smetto di scrivere su carta. Vedo il food cost.* |
| **Pro** | "Andrea 42 anni, gestisce 1-2 sedi e vuole crescere" | *Il mio braccio destro. Lavora mentre dormo.* |
| **Chain** | "Famiglia che gestisce 3+ sedi" / "Holding multi-brand" | *Quello che mio commercialista, mio team e mio CFO non sanno.* |

**Principio cardine**: il Base **deve essere buonissimo**. Non un tier monco. Deve risolvere il 70% dei problemi di un proprietario single-sede. Altrimenti **non upgrada mai a Pro**.

Il Pro **deve essere figo**. È quello che vede 70% dei clienti. Deve essere **lo standard di mercato** ma con 2-3 chicche AI uniche.

Il Chain **deve essere irresistibile**. Quando lo vedi in demo dici "lo voglio". Trasforma il proprietario in CFO.

---

## TIER 1 — **BASE** · €49/mese (o €39 annuale)

> Per chi inizia o gestisce 1 sola sede. Tutto quello che serve per smettere di scrivere su carta.

### Chi è il cliente Base
- **Marco**, 65 anni: pasticceria di famiglia ereditata. Usa un quaderno. Vuole capire se la cassata che fa da 30 anni rende o no. **Paura**: tecnologia complicata. **Bisogno**: 1 numero chiaro al giorno.
- **Sara**, 28 anni: ha aperto da 6 mesi. Smartphone-native. **Paura**: bruciarsi i risparmi. **Bisogno**: capire dove sta perdendo soldi.

### Feature incluse (Base = 100% delle necessità single-sede)

#### 🟢 Core operativo
- ✅ **1 sede attiva**
- ✅ **Ricettario** completo (import Excel + manuale + scheda allergeni)
- ✅ **Food cost** ricorsivo con semilavorati (il crown jewel, non lo togli mai)
- ✅ **Database HORECA 427 prezzi** (proprietario in tutti i tier)
- ✅ **Produzione giornaliera** (registrazione carico vetrina)
- ✅ **Magazzino MP** con soglie minime + alert visivi
- ✅ **Chiusura cassa** (manuale + foto scontrini con OCR — *anche al Base*)
- ✅ **Scadenzario fornitori** (1 sede)
- ✅ **Storico produzione** 12 mesi

#### 🤖 AI essenziale (la magia che fa dire "wow" al primo giorno)
- ✅ **Daily Brief AI via email** ("Ieri €420 ricavi, food cost cannolo 32% — sopra il tuo target")
- ✅ **AI Suggestions** (campanella con 3 avvisi al giorno: scorte, fatture, food cost alto)
- ✅ **AI "Spiegami P&L"** (A6 — ogni KPI ha bottone 🤖 che spiega in italiano)
- ✅ **Search globale AI** (A5 — Cmd+K, trova ricetta/voce/risposta)

#### 📊 Visualizzazione semplice
- ✅ **Dashboard Home** con 4 KPI principali (oggi/settimana)
- ✅ **P&L semplice** (ricavi, FC%, margine lordo)
- ✅ **Sprechi + omaggi** tracking
- ✅ **HACCP base** (temperature manuali)

#### 📤 Output essenziali
- ✅ **Export Excel** (ricettario, magazzino, chiusure)
- ✅ **PDF ricettario** (con allergeni, formattato)
- ✅ **Email scadenze settimanali**

### NON incluse nel Base
- ❌ Multi-sede + confronto sedi + trasferimenti
- ❌ Costi aziendali avanzati P&L (consumabili, ammortamenti, utenze custom)
- ❌ Personale & stipendi calcolo lordo↔netto CCNL
- ❌ Inventario differenziale gusti/formati (gelaterie)
- ❌ Cassa OCR automatica continua (solo manuale o foto)
- ❌ Integrazioni esterne (TeamSystem, Fatture in Cloud, cassa POS)
- ❌ Voice-input
- ❌ Forecast meteo+eventi
- ❌ Benchmark settoriale
- ❌ AI Reformulation
- ❌ HACCP foto automatico

### Limitazioni soft
- Max **3 dipendenti** (anagrafica + turni base, no stipendi)
- Max **50 ricette** (sopra → suggerisce upgrade)
- Storico **6 mesi** (oltre archiviato ma non interrogabile dalla UI)
- Email brief: **3 giorni/settimana** (lun-mer-ven)

### Pricing
- **€49/mese** o **€39/mese annuale** (-20%)
- Trial **14 giorni** (NON 90 come oggi — riduce decision fatigue)
- Upgrade in 1 click a Pro

### Marketing tagline
> *"Smetti di scrivere su carta. Vedi quanto guadagni davvero. €49/mese, prova 14 giorni gratis."*

---

## TIER 2 — **PRO** · €119/mese (o €99 annuale)

> Per chi vuole crescere. Il braccio destro digitale che lavora mentre dormi.

### Chi è il cliente Pro
- **Andrea**, 42 anni: 1-2 sedi, 5-15 dipendenti. Già ha cassa+commercialista. **Frustrazione**: deve aprire 5 strumenti per capire cosa fare lunedì. **Bisogno**: un assistente che gli dica cosa è importante.
- **Giulia**, 35 anni: 1 sede grande con laboratorio + delivery. **Frustrazione**: passa 3 ore a settimana su fogli Excel. **Bisogno**: automazione.

### Feature aggiuntive sopra Base

#### 🏢 Multi-sede leggero
- ✅ **Fino a 2 sedi** attive
- ✅ **Confronto sedi** (ranking, alerts, KPI side-by-side)
- ✅ **Trasferimenti** tra le 2 sedi

#### 💰 Gestione economica avanzata
- ✅ **Costi aziendali personalizzati** (consumabili, ammortamenti, utenze, affitti, ecc. — P&L netto reale)
- ✅ **Personale stipendi** (lordo↔netto CCNL, IRPEF a scaglioni, costo azienda)
- ✅ **P&L avanzato** con margine netto stimato
- ✅ **Cashflow predittivo 30/60/90gg** (B7)
- ✅ **Storico illimitato**

#### 🍦 Verticale gelaterie (su richiesta)
- ✅ **Inventario differenziale gusti↔formati** (per chi produce gusti ma vende coni/coppette)
- ✅ **Quadratura inventario↔cassa** con drift detector

#### 🤖 AI avanzata (le chicche del Pro)
- ✅ **Daily Brief AI** **ogni giorno** + opzione WhatsApp
- ✅ **AI Reply recensioni** (Google Maps copy-paste mode)
- ✅ **AI Categorization fatture entrata** (carica foto/PDF → estrae tutto)
- ✅ **AI HACCP foto-assistita** (foto frigo + termometro → entry automatica)
- ✅ **AI Menu engineering** (Kasavana-Smith automatico)
- ✅ **AI Onboarding conversazionale** (per il setup iniziale e i dipendenti)

#### 🎙️ Voice
- ✅ **Voice-input produzione** ("Claude, oggi 12 cassate")
- ✅ **Voice HACCP** ("temperatura frigo A: 4 gradi")

#### 🔌 Integrazioni
- ✅ **Fatture in Cloud / TeamSystem** (sync 2-vie)
- ✅ **Stripe / cassa POS** import vendite
- ✅ **Resend / Mailchimp** (per recensioni clienti)

#### 📤 Output Pro
- ✅ **Briefing settimanale** (lunedì) + **mensile** (1° del mese)
- ✅ **Export contabilità** per commercialista (CSV + XML)
- ✅ **Report HACCP** PDF ASL-ready (in beta)

### NON incluse nel Pro (per spingere a Chain)
- ❌ Più di 2 sedi
- ❌ Forecast meteo+eventi avanzato
- ❌ Benchmark anonimo settoriale
- ❌ AI Reformulation engine
- ❌ FoodOS Brain (chat conversazionale)
- ❌ WhatsApp Bot completo
- ❌ AI Auto-ordine fornitore
- ❌ AI Pricing dinamico competitor
- ❌ AI Audit ASL pre-compilato
- ❌ Smart fridge IoT
- ❌ AI Camera vetrina
- ❌ Account manager dedicato

### Limitazioni soft
- Max **15 dipendenti**
- Max **2 sedi**
- Max **500 ricette**
- WhatsApp brief solo **1 numero**
- Voice input: **50 minuti/mese** (sopra → pay-per-use o upgrade)

### Pricing
- **€119/mese** o **€99/mese annuale** (-17%)
- Trial **30 giorni**
- Upgrade in 1 click a Chain

### Marketing tagline
> *"Il tuo braccio destro digitale. Lavora mentre dormi. Da €99/mese."*

---

## TIER 3 — **CHAIN** · €299/mese (o €249 annuale)

> Per famiglie con 3+ sedi o multi-brand. Tutto quello che il tuo commercialista, il tuo team e il tuo CFO non sanno.

### Chi è il cliente Chain
- **Famiglia Rossi**: 4 pasticcerie a Torino, da padre a figli. 25 dipendenti. **Sogno**: capire quale sede rende davvero e replicare il modello vincente.
- **Holding multi-brand**: 1 brand pasticceria + 1 brand gelateria + 1 ristorante. **Bisogno**: dashboard unificato CFO-level + governance.

### Feature aggiuntive sopra Pro

#### 🌐 Multi-sede illimitato + governance
- ✅ **Sedi illimitate**
- ✅ **Multi-brand** (gruppi di sedi con brand diversi sotto la stessa org)
- ✅ **Role-based access** avanzato: manager di sede, regional manager, CFO, owner
- ✅ **Audit log avanzato** (chi ha cambiato cosa, quando)
- ✅ **Approval workflow** (es. ordini > €500 richiedono firma owner)

#### 🚀 AI Game changer (il vero motivo per pagare €299)
- ✅ **🌦️ AI Forecast vendite meteo+eventi locali** (B1 — il moat)
- ✅ **📊 Benchmark anonimo settoriale** (B8 — "sei nel top 25%?")
- ✅ **🧠 FoodOS Brain** — chat conversazionale dedicata (C1)
- ✅ **📱 WhatsApp Bot completo** (operativo + notifiche + comandi)
- ✅ **🛒 AI Auto-ordine fornitori** (B4)
- ✅ **💲 AI Pricing dinamico competitor** (B9)
- ✅ **🧪 AI Reformulation engine** (B3 — *"voglio cannolo a FC 26%"*)
- ✅ **📄 AI Audit ASL pre-compilato** (C5)
- ✅ **📸 AI Camera vetrina** (B10 — inventario visivo, hardware opzionale)
- ✅ **🥶 Smart Fridge IoT** (C6 — SensorPush integration)
- ✅ **🎬 Documentary AI generator** (C7 — trimestrale Spotify-Wrapped-like)

#### 🛒 Marketplace
- ✅ **Marketplace fornitori** con AI matching (C4)
- ✅ **Sconti gruppo** (la holding negozia per tutte le sedi)

#### 🤝 Service tier
- ✅ **Account manager dedicato** (1 call/mese + Slack/WhatsApp diretto)
- ✅ **Setup assistito** (1 giornata onsite per sede)
- ✅ **Training dipendenti** (2 ore live ogni quarter)
- ✅ **Priority support** (SLA 2h business hours)

#### 📤 Output enterprise
- ✅ **Report board CFO mensile** (PDF formattato per CDA)
- ✅ **API read** per integrare con BI esterni (PowerBI, Tableau, Looker)
- ✅ **SSO** (Google Workspace, Microsoft Entra)
- ✅ **White-label opzionale** (per consulenti food che rivendono)

### Limitazioni soft (nessuna, è la versione "tutto incluso")
- Voice input: **illimitato**
- WhatsApp: **3 numeri linkabili**
- Dipendenti: **illimitati**
- Ricette: **illimitate**
- Sedi: **illimitate**
- Storico: **illimitato**

### Pricing
- **€299/mese** o **€249/mese annuale** (-17%)
- Setup fee **€990** one-time (include 1 giornata onsite + dataset HORECA personalizzato)
- Trial **30 giorni** con onboarding assistito
- Volume discount per chain >10 sedi (negotiated)

### Marketing tagline
> *"Quello che il tuo commercialista, il tuo team e il tuo CFO non sanno. Da €249/mese, scopri perché un proprietario su quattro ci paga il triplo."*

---

## Matrice riassuntiva (tabella di confronto)

| Feature | Base €49 | Pro €119 | Chain €299 |
|---|:---:|:---:|:---:|
| **Ricettario + food cost ricorsivo** | ✅ | ✅ | ✅ |
| **Database HORECA 427+ prezzi** | ✅ | ✅ | ✅ |
| Produzione + magazzino | ✅ | ✅ | ✅ |
| Cassa manuale + foto OCR | ✅ | ✅ | ✅ |
| Scadenzario fornitori | ✅ | ✅ | ✅ |
| **Daily Brief AI + AI Suggestions** | ✅ (3gg/sett) | ✅ (giornaliero) | ✅ (giornaliero + WA) |
| AI "Spiegami P&L" | ✅ | ✅ | ✅ |
| Search globale AI (Cmd+K) | ✅ | ✅ | ✅ |
| **Sedi** | 1 | 2 | ∞ |
| Confronto sedi + Trasferimenti | — | ✅ | ✅ |
| Costi aziendali P&L (custom) | — | ✅ | ✅ |
| Personale stipendi CCNL | — | ✅ | ✅ |
| Cashflow predittivo 30/60/90gg | — | ✅ | ✅ |
| Inventario differenziale gelaterie | — | ✅ | ✅ |
| AI Reply recensioni | — | ✅ | ✅ |
| AI OCR fatture entrata | — | ✅ | ✅ |
| AI HACCP foto-assistita | — | ✅ | ✅ |
| AI Menu engineering | — | ✅ | ✅ |
| Voice-input produzione | — | ✅ (50min/mese) | ✅ ∞ |
| Integrazioni TeamSystem/FattureInCloud | — | ✅ | ✅ |
| **🌦️ Forecast meteo+eventi** | — | — | ✅ |
| **📊 Benchmark settoriale anonimo** | — | — | ✅ |
| **🧠 FoodOS Brain (chat)** | — | — | ✅ |
| **📱 WhatsApp Bot completo** | — | — | ✅ |
| AI Auto-ordine fornitori | — | — | ✅ |
| AI Pricing competitor | — | — | ✅ |
| AI Reformulation engine | — | — | ✅ |
| AI Audit ASL pre-compilato | — | — | ✅ |
| AI Camera vetrina | — | — | ✅ |
| Smart Fridge IoT | — | — | ✅ |
| Marketplace fornitori | — | — | ✅ |
| Multi-brand + governance | — | — | ✅ |
| Account manager dedicato | — | — | ✅ |
| SSO + API esterne | — | — | ✅ |
| Dipendenti | 3 | 15 | ∞ |
| Ricette | 50 | 500 | ∞ |
| Storico | 6 mesi | ∞ | ∞ |
| Trial | 14 gg | 30 gg | 30 gg + onboarding |

---

## Razionale strategico per ogni tier

### Perché Base €49 (e non €19 o €89)
- **€19** lo positiona come "freemium" = non lo prendono sul serio
- **€89** taglia fuori i 65% di pasticcerie italiane con fatturato <€150k/anno
- **€49** è la "media coffee shop" che il proprietario paga senza pensarci
- Pricing power: a €49 sei più caro della concorrenza fragile (Spreafico, Foodcheck @ €25-35) ma giustifichi con AI (loro non ce l'hanno)

### Perché Pro €119 (e non €99 o €149)
- **€99** è troppo basso per la quantità di feature → segnale "bassa qualità"
- **€149** è la soglia psicologica del "lo devo proprio motivare al socio"
- **€119** è "10 euro meno di €130" — il prezzo che senti più basso

### Perché Chain €299 (e non €249 o €399)
- **€249** è troppo vicino al Pro → non differenzia abbastanza
- **€399** spaventa il small-chain (3-5 sedi)
- **€299** è il prezzo del CFO outsourced (€200-400/mese): paghi quello in più, ottieni un CFO automatico

### La regola del 3-to-1
La differenza di prezzo deve essere **chiara**:
- Pro è **2.4×** Base → giustificato da multi-sede + 10 feature AI
- Chain è **2.5×** Pro → giustificato da AI Forecast + Brain + WhatsApp + account manager

Volutamente **non-lineare**: il salto perceived dal Pro al Chain deve sentirsi "premium ma giustificato".

---

## Effetto sui ricavi (modello)

Assumendo 100 clienti totali distribuiti:
- **60 Base** × €49 = €2.940/mese
- **35 Pro** × €119 = €4.165/mese
- **5 Chain** × €299 = €1.495/mese (+ €4.950 una-tantum setup)
- **Totale ARR**: €103.200/anno

Vs scenario "solo Pro €99 per tutti": €99 × 100 = €118.800/anno

**Conclusione**: con i 3 tier guadagni **circa lo stesso**, ma:
1. **Accessibilità maggiore** (Base attira PMI piccole che non comprerebbero Pro)
2. **Upsell path chiaro** (il cliente cresce dentro il prodotto)
3. **Anchor pricing** (€299 fa sembrare €119 ragionevolissimo — comportamento di prezzo classico)

---

## Domande aperte (da discutere)

1. **Cassa OCR continua**: la tengo al Pro+ oppure la sblocco al Base (con limite mensile)?
2. **HACCP foto-assistita**: Pro o Chain only? È un asset enorme da gridare.
3. **Trial 14gg Base vs 30gg Pro**: misurare conversion. Forse 14gg per tutti riduce decision fatigue.
4. **Setup fee Chain**: opzionale o mandatory? Pro: filtra clienti seri. Contro: friction iniziale.
5. **Plan "Famiglia" custom** (chiamiamolo "Family")? Per chain >10 sedi con pricing custom (es. €249 + €20/sede aggiuntiva).
6. **Sconto annuale**: -17% (Pro/Chain) e -20% (Base). Tenere o uniformare?
7. **Free trial card-on-file** (Stripe) o no? Conversione +30% ma più friction iniziale.
8. **Discount founder**: applichi -50% lifetime ai primi 10 paganti come "design partner"? Buon trade off PR vs revenue.

---

## Implementazione tecnica (cosa serve)

### 1. Aggiornare `src/lib/planAccess.js`
- Espandere `VIEW_MIN_PLAN` con tutte le view nuove
- Aggiungere `FEATURE_MIN_PLAN` per micro-feature (es. WhatsApp, voice, AI forecast)
- Funzione `canUseFeature(featureId, piano, userEmail)` per check fine-grained

### 2. Aggiornare `api/pricing.js`
- Endpoint pubblico che restituisce i 3 tier con feature/prezzi
- Usato da landing + portal cliente

### 3. Stripe products
- 3 prodotti × 2 prezzi (mensile + annuale) = 6 price IDs
- Setup fee Chain come one-time invoice item

### 4. Landing page
- Tabella tier
- Calcolatore "quanto risparmi/anno" (Base vs cartaceo)
- Testimonianza Mara dei Boschi per ogni tier

### 5. UI app
- Banner upgrade contestuale ("Questa feature è nel Pro — passa ora")
- Sidebar shows tier corrente + "scopri di più"

---

## Riferimenti

- Tier attuale (da sostituire): `src/lib/planAccess.js` (PLAN_RANK, VIEW_MIN_PLAN)
- Stripe checkout: `api/stripe-checkout.js`
- Strategia feature: `STRATEGIA_AI_FEATURES.md`, `STRATEGIA_AI_DETTAGLIO.md`
- Audit prodotto: `ANALISI_PRODOTTO.md`
