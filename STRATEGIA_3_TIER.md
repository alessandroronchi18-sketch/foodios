# FoodOS — 3 tier abbonamento (v2 post implementazione 18 feature AI)
> Aggiornato: 2026-06-12 · Decisioni operative frozen + tutte le feature implementate finora.

## Filosofia di base

Tre tier che corrispondono a **tre archetipi di proprietario**, non a tre livelli di "potenza tecnologica":

| Tier | Archetipo proprietario | Slogan |
|---|---|---|
| **Base** | "Marco 65 anni, pasticceria di famiglia" / "Sara 28 anni, ha appena aperta" | *Smetto di scrivere su carta. Vedo il food cost.* |
| **Pro** | "Andrea 42 anni, gestisce 1-2 sedi e vuole crescere" | *Il mio braccio destro. Lavora mentre dormo.* |
| **Chain** | "Famiglia che gestisce 3+ sedi" / "Holding multi-brand" | *Quello che mio commercialista, mio team e mio CFO non sanno.* |

**Principio cardine**:
- Il **Base** **deve essere buonissimo**. Risolve il 70% dei problemi di un proprietario single-sede. Altrimenti non upgrada mai.
- Il **Pro** **deve essere figo**. 70% dei clienti lo prendono. Standard di mercato + 3-4 chicche AI uniche.
- Il **Chain** **deve essere irresistibile**. Quando lo vedi in demo dici "lo voglio". Trasforma il proprietario in CFO.

---

## TIER 1 — **BASE** · €49/mese (€39 annuale, -20%)

> Per chi inizia o gestisce 1 sola sede. Tutto quello che serve per smettere di scrivere su carta.

### Cliente Base
- **Marco**, 65 anni: pasticceria di famiglia. Quaderno cartaceo. Vuole capire se la cassata rende.
- **Sara**, 28 anni: ha aperto da 6 mesi. **Paura**: bruciarsi i risparmi. **Bisogno**: capire dove perde soldi.

### Feature incluse

#### 🟢 Core operativo (tutte)
- ✅ **1 sede attiva**
- ✅ **Ricettario** completo (import Excel + manuale + scheda allergeni + PDF watermark)
- ✅ **Food cost ricorsivo** (crown jewel: semilavorati, depth, cycle-detect, 39 test)
- ✅ **Database HORECA 427 prezzi** (proprietario in tutti i tier)
- ✅ **Produzione giornaliera** (carico vetrina, stock PF atomico)
- ✅ **Magazzino MP** (soglie min, alert)
- ✅ **Chiusura cassa** (manuale + foto OCR scontrini)
- ✅ **Cassa OCR continua** (Claude Vision) — **max 50 scontrini/mese**, sopra → upgrade Pro
- ✅ **Scadenzario fornitori**
- ✅ **Storico produzione** (6 mesi)
- ✅ **Sprechi + omaggi tracking**
- ✅ **HACCP base** (temperature manuali)

#### 🤖 AI essenziale (la magia, anche al €49)
- ✅ **Daily Brief AI via email** — ricevi ogni mattina 3 frasi narrative con KPI + 1 azione (3 giorni/sett: lun-mer-ven)
- ✅ **AI Suggestions proattive** — campanella in topbar con 3-5 avvisi/giorno (food cost alto, scorte, fatture, prodotti in calo)
- ✅ **AI Spiega P&L** — bottone 🤖 su ogni KPI, l'AI scrive 2-3 paragrafi che spiegano il numero
- ✅ **Search globale Cmd+K** — barra di ricerca con AI intent parser (naviga / trova / chiedi)
- ✅ **AI Reply recensioni** — copia-incolla recensione → 3 risposte (caldo/formale/fattuale) editabili

#### 📊 Visualizzazione semplice
- ✅ Dashboard Home con 4 KPI principali (oggi/settimana)
- ✅ P&L semplice (ricavi, FC%, margine lordo)
- ✅ Storico prodotti

#### 📤 Output essenziali
- ✅ Export Excel (ricettario, magazzino, chiusure)
- ✅ PDF ricettario (allergeni, watermark)
- ✅ Email scadenze settimanali

### NON incluse nel Base
- ❌ Multi-sede + confronto + trasferimenti
- ❌ Costi aziendali avanzati P&L
- ❌ Personale stipendi CCNL (solo anagrafica base)
- ❌ Inventario differenziale gelaterie
- ❌ Cassa OCR illimitata (limite 50/mese)
- ❌ Integrazioni esterne
- ❌ Voice-input
- ❌ Forecast meteo+eventi
- ❌ Brief settimanale del lunedì
- ❌ OCR fatture entrata
- ❌ Cashflow predittivo
- ❌ Menu engineering
- ❌ Reformulation AI
- ❌ Pricing competitor
- ❌ FoodOS Brain / WhatsApp / Recipe Inventor / Marketplace / Documentary

### Limitazioni soft
- Max **3 dipendenti** (anagrafica + turni base, no stipendi calcolati)
- Max **50 ricette**
- Storico **6 mesi** (oltre archiviato non interrogabile UI)
- Daily Brief email: **3 giorni/sett**

### Pricing & trial
- **€49/mese** o **€39/mese annuale** (-20%)
- Trial **14 giorni** + **+14gg stretch** se Base attiva 3 azioni chiave (carica ricetta, registra chiusura, riceve primo Brief)
- Upgrade 1 click a Pro

**Tagline**: *"Smetti di scrivere su carta. Vedi quanto guadagni davvero. €49/mese, prova 14 giorni gratis."*

---

## TIER 2 — **PRO** · €119/mese (€95 annuale, -20%) — MAINSTREAM

> Per chi vuole crescere. Il braccio destro digitale che lavora mentre dormi.

### Cliente Pro
- **Andrea**, 42 anni: 1-2 sedi, 5-15 dipendenti. Già ha cassa+commercialista. **Bisogno**: assistente che dica cosa è importante.
- **Giulia**, 35 anni: 1 sede grande con laboratorio + delivery. Passa 3 ore/sett su Excel. **Bisogno**: automazione.

### Feature aggiuntive sopra Base

#### 🏢 Multi-sede
- ✅ **Fino a 2 sedi** attive
- ✅ **Confronto sedi** (ranking medaglie, alerts, KPI side-by-side, sede critica/champion, trend sparkline 8 sett)
- ✅ **Trasferimenti** tra le 2 sedi (template ricorrenti, KPI accuratezza, ripeti rapido)

#### 💰 Gestione economica avanzata
- ✅ **Costi aziendali personalizzati** (consumabili, manutenzione, ammortamenti, utenze, affitti, marketing → P&L netto reale)
- ✅ **Personale stipendi CCNL** (lordo↔netto IRPEF scaglioni, INPS 9.19%, costo azienda con TFR)
- ✅ **P&L avanzato** con margine netto stimato
- ✅ **Storico illimitato**
- ✅ **Cassa OCR illimitata** (no limite 50/mese del Base)

#### 🍦 Verticale gelaterie/laboratori
- ✅ **Inventario differenziale gusti↔formati** (produce gusti, vende coni/coppette)
- ✅ **Quadratura inventario↔cassa** con drift detector

#### 🤖 AI Game changers
- ✅ **Daily Brief AI giornaliero** (7gg/sett) + opzione brief WhatsApp
- ✅ **Brief settimanale del lunedì** — riassunto narrativo della settimana chiusa + 1 azione strategica
- ✅ **AI OCR fatture in entrata** — foto/PDF fattura → estrae fornitore/P.IVA/scadenza/importi/righe (Claude Vision)
- ✅ **Menu engineering** (Kasavana-Smith automatico, matrice 2×2 stars/dogs/puzzles/plowhorses con consigli AI)
- ✅ **Cashflow predittivo 30/60/90gg** — saldo + 3 scenari (atteso/ottimistico/pessimistico) + alert giorni rossi
- ✅ **Forecast vendite 7gg** — storico + meteo Open-Meteo + correzione stagionale per produzione ottimale
- ✅ **AI Reformulation engine** — *"porta il cannolo a FC 26%"* → 3 varianti con impact stimato
- ✅ **AI Auto-ordine fornitori** — calcolo consumo medio + EOQ + testo ordine pronto da copia-incollare
- ✅ **AI Pricing vs competitor** — confronto prezzi zonali + verdetto AI con suggerimenti

#### 🔌 Integrazioni
- ✅ TeamSystem / Fatture in Cloud (sync 2-vie)
- ✅ Stripe / cassa POS (import vendite)
- ✅ Resend per email transactional

#### 📤 Output Pro
- ✅ Briefing settimanale + mensile
- ✅ Export contabilità (CSV + XML)
- ✅ Report HACCP base PDF

### NON incluse nel Pro (riserva Chain)
- ❌ Più di 2 sedi
- ❌ FoodOS Brain (chat conversazionale dedicata)
- ❌ WhatsApp Bot completo
- ❌ AI Recipe Inventor
- ❌ Marketplace fornitori
- ❌ Documentary AI trimestrale
- ❌ Multi-brand + governance
- ❌ SSO / API esterne
- ❌ Account manager dedicato

### Limitazioni soft
- Max **15 dipendenti**
- Max **2 sedi**
- Max **500 ricette**
- Voice-input: *coming in v2* (lo aggiungeremo qui)

### Pricing & trial
- **€119/mese** o **€95/mese annuale** (-20%)
- Trial **30 giorni**
- Upgrade 1 click a Chain

**Tagline**: *"Il tuo braccio destro digitale. Lavora mentre dormi. Da €95/mese."*

---

## TIER 3 — **CHAIN** · €299/mese (€239 annuale, -20%) — GAME CHANGER

> Per famiglie 3+ sedi o multi-brand. Tutto quello che il tuo commercialista, il tuo team e il tuo CFO non sanno.

### Cliente Chain
- **Famiglia Rossi**: 4 pasticcerie a Torino, padre a figli. 25 dipendenti. **Bisogno**: capire quale sede rende, replicare il modello vincente.
- **Holding multi-brand**: pasticceria + gelateria + ristorante. **Bisogno**: dashboard CFO-level unificato.

### Feature aggiuntive sopra Pro

#### 🌐 Multi-sede illimitato + governance
- ✅ **Sedi illimitate** (fino a 10 in listino, sopra → "Contattaci")
- ✅ **Multi-brand** (gruppi di sedi con brand diversi sotto stessa org)
- ✅ **Role-based access avanzato**: manager sede, regional, CFO, owner
- ✅ **Audit log avanzato**

#### 🚀 AI esclusivi Chain (il vero motivo per pagare €299)
- ✅ **🧠 FoodOS Brain** — chat conversazionale dedicata stile ChatGPT con memoria persistente. Conosce la tua attività, risponde a domande aperte, genera report, scava nei dati.
- ✅ **📱 WhatsApp Bot operativo** — gestisci FoodOS da WhatsApp (KPI giornata, registra sprechi, alert push). Twilio Business incluso.
- ✅ **👨‍🍳 AI Recipe Inventor** — *"inventami una torta estiva low-cost"* → 3 ricette nuove con food cost stimato + procedimento + prezzo consigliato
- ✅ **🛒 Marketplace fornitori HORECA** — listings verificati con rating community + AI matching prodotto
- ✅ **🎬 Documentary AI trimestrale** — ogni 3 mesi l'AI scrive un riassunto narrativo (headline + 3 paragrafi + 4 highlights) pronto da condividere col team/social/commercialista

#### 🤝 Service tier
- ✅ **Account manager dedicato** (1 call/mese + Slack/WhatsApp diretto)
- ✅ **Setup assistito onsite** (1 giornata per sede)
- ✅ **Training dipendenti** (2h live ogni quarter)
- ✅ **Priority support** (SLA 2h business hours)

#### 📤 Output enterprise
- ✅ Report board CFO mensile (PDF per CDA)
- ✅ API read per BI esterni (PowerBI, Tableau)
- ✅ SSO (Google Workspace, Microsoft Entra)
- ✅ White-label opzionale (per consulenti food)

### Limitazioni (nessuna, è "tutto incluso")
- Sedi: **illimitate** (>10 → contatti commerciali)
- Dipendenti: **illimitati**
- Ricette: **illimitate**
- Storico: **illimitato**

### Pricing & trial
- **€299/mese** o **€239/mese annuale** (-20%)
- **Setup fee €990 obbligatorio** + clausola rimborso 100% entro 60gg se non soddisfatto
- Trial **30 giorni con onboarding assistito**

**Tagline**: *"Quello che il tuo commercialista, il tuo team e il tuo CFO non sanno. Da €239/mese."*

---

## Matrice completa Base / Pro / Chain

| Feature | Base €49 | Pro €119 | Chain €299 |
|---|:---:|:---:|:---:|
| **Core operativo** | | | |
| Ricettario + food cost ricorsivo | ✅ | ✅ | ✅ |
| Database HORECA 427+ prezzi | ✅ | ✅ | ✅ |
| Produzione + magazzino | ✅ | ✅ | ✅ |
| Cassa OCR Claude Vision | ✅ (50/mese) | ✅ ∞ | ✅ ∞ |
| Scadenzario fornitori | ✅ | ✅ | ✅ |
| Sprechi + omaggi | ✅ | ✅ | ✅ |
| HACCP base | ✅ | ✅ | ✅ |
| **AI essenziale (tutti i tier)** | | | |
| Daily Brief AI | ✅ (3gg/sett) | ✅ (giornaliero) | ✅ (giornaliero + WA) |
| AI Suggestions proattive | ✅ | ✅ | ✅ |
| AI Spiega P&L (bottone 🤖 su KPI) | ✅ | ✅ | ✅ |
| Search globale AI (Cmd+K) | ✅ | ✅ | ✅ |
| AI Reply recensioni | ✅ | ✅ | ✅ |
| **Multi-sede & gestione (Pro+)** | | | |
| Sedi | 1 | 2 | ∞ |
| Confronto sedi (ranking, alerts, sparkline) | — | ✅ | ✅ |
| Trasferimenti tra sedi (template, KPI accuratezza) | — | ✅ | ✅ |
| Costi aziendali P&L | — | ✅ | ✅ |
| Personale stipendi CCNL | — | ✅ | ✅ |
| Storico illimitato | — | ✅ | ✅ |
| Inventario differenziale gelaterie | — | ✅ | ✅ |
| Brief settimanale del lunedì | — | ✅ | ✅ |
| **AI Game changers (Pro+)** | | | |
| AI OCR fatture in entrata | — | ✅ | ✅ |
| Menu engineering (Kasavana-Smith) | — | ✅ | ✅ |
| Cashflow predittivo 30/60/90gg | — | ✅ | ✅ |
| Forecast vendite 7gg + meteo | — | ✅ | ✅ |
| AI Reformulation engine | — | ✅ | ✅ |
| AI Auto-ordine fornitori | — | ✅ | ✅ |
| AI Pricing vs competitor | — | ✅ | ✅ |
| Integrazioni TeamSystem/FattureInCloud | — | ✅ | ✅ |
| **AI esclusivi Chain** | | | |
| 🧠 FoodOS Brain (chat conversazionale) | — | — | ✅ |
| 📱 WhatsApp Bot operativo | — | — | ✅ |
| 👨‍🍳 AI Recipe Inventor (chef virtuale) | — | — | ✅ |
| 🛒 Marketplace fornitori HORECA | — | — | ✅ |
| 🎬 Documentary AI trimestrale | — | — | ✅ |
| Multi-brand + governance + RBAC | — | — | ✅ |
| Account manager dedicato | — | — | ✅ |
| Setup onsite + training | — | — | ✅ |
| SSO + API esterne BI | — | — | ✅ |
| **Limiti** | | | |
| Dipendenti | 3 | 15 | ∞ |
| Ricette | 50 | 500 | ∞ |
| Storico | 6 mesi | ∞ | ∞ |
| Trial | 14gg (+14 stretch) | 30gg | 30gg + onboarding |
| Setup fee | — | — | €990 (rimborso 60gg) |

---

## Razionale strategico

### Perché €49 / €119 / €299 (e non altri prezzi)

- **€49** = "una cena fuori". Il proprietario non ci pensa. Più caro di Spreafico/Foodcheck (€25-35) ma giustifichi con AI (loro non ce l'hanno).
- **€119** = "10€ meno di €130" — soglia psicologica accessibile per uno strumento serio. 2.4× il Base, giustificato da multi-sede + 10 AI game changers.
- **€299** = prezzo di un CFO outsourced (€200-400/mese). 2.5× il Pro, giustificato dai 5 AI esclusivi + service tier.

### Salto non-lineare voluto
Il salto Pro→Chain è volutamente "premio premium giustificato":
- Pro è il *commodity premium* (tutti i SaaS gestionali decenti)
- Chain è *categoria a parte* (Brain + WhatsApp + Marketplace nessuno IT ce li ha)

### Modello ricavi (100 clienti distribuiti)

| Distribuzione | Calcolo | MRR |
|---|---|---|
| 60 Base × €49 | | €2.940 |
| 35 Pro × €119 | | €4.165 |
| 5 Chain × €299 | + €4.950 setup | €1.495 + €4.950 una-tantum |
| **Totale annuo** | **€103.200 + €4.950 setup** | **€108k ARR primo anno** |

A confronto con piano flat €99 × 100 clienti = €118.800: i 3 tier rendono **leggermente meno in ARR** ma:
1. **Accessibilità maggiore** (Base attira piccole PMI)
2. **Upsell path chiaro** (cliente cresce dentro il prodotto)
3. **Anchor pricing** (€299 fa sembrare €119 ragionevolissimo)

### Distribuzione attesa nei primi 12 mesi
- Primi 30 clienti: 70% Base, 25% Pro, 5% Chain
- Maturità 100 clienti: 60% Base, 35% Pro, 5% Chain
- Maturità 500 clienti: 50% Base, 40% Pro, 10% Chain (più chain con tempo)

---

## Decisioni operative congelate (8 domande risposte)

1. **Cassa OCR Base** → SI con limite 50/mese (sopra → upgrade Pro)
2. **HACCP foto-assistita** → fuori roadmap immediata (task #94 in coda)
3. **Trial differenziato** → 14gg Base + stretch 14gg / 30gg Pro / 30gg+onboarding Chain
4. **Setup fee Chain** → €990 OBBLIGATORIO + rimborso 100% entro 60gg
5. **Plan Family** → no, listino fino a 10 sedi, sopra "Contattaci"
6. **Sconto annuale** → -20% uniforme su tutti i tier
7. **Card-on-file** → no per primi 12 mesi (priorità trust)
8. **Founder discount** → no, listino pieno day-one

---

## Cosa è stato implementato (giugno 2026)

### 23 AI features funzionanti
- Daily Brief AI + AI Suggestions proattive (cron giornaliero, RLS, dedup)
- AI Spiega su KPI (componente AiExplainButton riusabile)
- Search globale Cmd+K (CommandPalette)
- AI Reply recensioni (3 toni)
- AI OCR fatture (Claude Vision + extracted_invoices)
- AI OCR scontrini (già esistente, ampliato)
- Brief settimanale del lunedì
- Menu engineering Kasavana-Smith
- Cashflow predittivo 30/60/90gg (cashflow_eventi)
- Forecast vendite 7gg + meteo Open-Meteo (forecast_giornaliero)
- AI Reformulation engine
- AI Auto-ordine fornitori
- AI Pricing competitor (competitor_prices)
- Onboarding conversazionale (OnboardingChat alternativo)
- FoodOS Brain chat conversazionale (brain_conversations)
- WhatsApp Bot scaffolding (webhook + setup view)
- AI Recipe Inventor (recipe_inventions)
- Marketplace fornitori (marketplace_listings)
- Documentary AI trimestrale (documentary_snapshots)
- Inventario gusti differenziale (gelaterie)
- Confronto sedi rimodellato (ranking, alerts, trend, sede champion/critica)
- Trasferimenti rimodellati (template ricorrenti, KPI accuratezza)
- AI engine condiviso (api/lib/aiEngine.js)

### Cron orchestrato (cron-giornaliero.js)
1. cron-notifiche (alert magazzino + fatture scadenza)
2. anomaly-detect
3. cron-report-mensile (1° del mese)
3b. **cron-daily-brief** (giornaliero + settimanale lunedì)
3c. **cron-ai-suggestions** (dedup 7gg)
3d. **cron-forecast** (Open-Meteo + 60gg storico)
3e. **cron-documentary** (1° apr/lug/ott/gen)
4. cleanup-audit-log

---

## Roadmap residua (in coda)

| # | Task | Priorità |
|---|---|---|
| #94 | B5 HACCP foto-assistita | Bassa |
| #95 | Trasferimenti autocomplete prodotti reali | Media |
| #96 | ConfrontoSedi: nascondi SedeSelector + grafici interattivi + filtri + tipo chart | Alta |
| #97 | Export PDF universale su tutte le view con dati | Alta |
| #98 | Comparatore temporale universale (vs mese prec / stesso mese anno scorso) | Alta |

---

## Implementazione tecnica residua per go-live pricing

1. **Aggiornare `src/lib/planAccess.js`** con tutte le nuove view-id e FEATURE_MIN_PLAN granulare
2. **Endpoint `api/pricing.js`** che espone listino aggiornato per landing
3. **Stripe products** — 3 prodotti × 2 prezzi mensile/annuale = 6 price_ids + setup fee Chain una-tantum
4. **Landing page** con tabella tier + calcolatore "quanto risparmi"
5. **UI app**: banner upgrade contestuale su feature lockate + sidebar mostra tier corrente
