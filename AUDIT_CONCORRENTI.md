# Audit concorrenti — Foodos

Data: 19/09/2026.

Prezzi Foodos citati in questo documento (fonte: `src/lib/usePlanPricing.js`): Standard 69 €/mese (una sede), Plus 149 €/mese (tutto, senza limiti di sede o utenti — piano oggi in vendita), Ultra 399 €/mese (gruppi e catene, non ancora attivo).

Legenda usata in tutto il documento: **[V]** verificato su fonte con URL aperto — **[S]** supposto o dedotto da fonte terza non verificata direttamente — **[KO]** fonte non apribile, dato mancante dichiarato come tale. Dove un prezzo non è pubblicato è scritto «non pubblicato»: mai stimato, mai inventato.

---

## Le cinque cose che contano

1. **Nessuno dei concorrenti controllati — 18 su 18 fuori Italia, 3 su 3 verticali italiani — fa food cost ricorsivo su più livelli di semilavorati.** Tutti calcolano il costo di una ricetta dai suoi ingredienti diretti; nessuno gestisce nativamente «semilavorato dentro semilavorato dentro semilavorato» con controllo dei cicli, che è esattamente il modo in cui si costruisce un gelato o una torta. È il differenziale tecnico vero di Foodos e oggi non è scritto da nessuna parte in vetrina.
2. **I prodotti generalisti, anche i migliori, non calzano su un laboratorio artigianale — e lo dicono i loro stessi clienti.** Un panificio cliente di Nory: *«completely geared towards restaurants... nothing fitting how a bakery actually works»*, definito *«a half-finished product»* (Trustpilot). Un titolare di pasticceria cliente di Meez: il database ingredienti è *«fairly centered around culinary ingredients»* e va riempito a mano. È la controprova che nascere verticali su gelato e pasticceria, come ha fatto Foodos, non è una scelta stretta: è l'unica che regge quando il prodotto arriva davvero in laboratorio.
3. **Il buco più citato nell'incumbent generalista italiano è testuale, verificabile, e coincide esattamente con la casella che Foodos occupa.** Recensione su Cassa in Cloud (Capterra IT, 3,6/5 su 69 recensioni): *«Mancanza di gestione di magazzino su base ricetta»*.
4. **La reputazione degli incumbent italiani è misurata, non percepita: è pessima.** TeamSystem 2,4/5 su 1.531 recensioni Trustpilot (54% a 1 stella); Zucchetti 1,3/5 su 402 (69% a 1 stella). È una leva commerciale vera con fonte pubblica, non uno slogan.
5. **Il prezzo colloca Foodos in una terra di mezzo che va spiegata, non nascosta.** Plus (149 €/mese) costa più del tetto dei verticali italiani (Qubi 68, Gelatobalance 99, LabManager 45) ma una frazione dei generalisti internazionali (MarketMan da 249 $, Restaurant365 da 499 $, MarginEdge da 350 $). È un posizionamento difendibile — Foodos fa cassa+P&L+scadenzario+multi-sede che i verticali italiani più economici non fanno — ma solo se il cliente capisce perché costa di più di Qubi, non se lo scopre da solo confrontando due numeri.

---

## Tabella dei concorrenti

### Verticali artigianali italiani (concorrenti diretti)

| Nome | A chi si rivolge | Prezzo | Punto forte | Nostra posizione |
|---|---|---|---|---|
| **Qubi** | Gelaterie/pasticcerie/panifici/ristoranti IT | 38 / 51 / 68 €/mese + Custom [V] | Banca dati 11.341 alimenti con barcode, HACCP digitale, magazzino con lotti/scadenze | Foodos aggiunge cassa/prima nota, P&L, scadenzario SEPA, multi-sede: Qubi resta ricettario+magazzino |
| **LabManager** | Laboratori pasticceria/panificio/gelateria IT | 19,99 / 44,99 €/mese [V] | Prezzo d'ingresso più basso del segmento | Foodos copre cassa, P&L, scadenzario, AI: LabManager Plus si ferma a produzione/ordini/magazzino |
| **Gelatobalance** | Gelaterie IT | 25 / 49 / 99 €/mese [V] | Nel piano Business ha già Conto Economico, cash flow, break-even e lettura AI delle fatture fornitori | Food cost Foodos ricorsivo sui semilavorati; il loro è a ricetta singola |
| **RicetteInCloud** | Pasticcerie/gelaterie/gastronomie IT | 300 / 570 / 900 €/anno + 120 € attivazione [V] | Oltre 1,2 milioni di etichette 1169/2011 stampate, tracciabilità lotti con foto AI | Nessuna cassa/prima nota/scadenzario; Foodos è l'unico che chiude il ciclo fino ai soldi |
| **Cooki** | Gelaterie/pasticcerie IT | Da 1,50 €/giorno (~45 €/mese), impegno 12 mesi [V] | Cartellini da banco automatici, portale per il cliente finale | Solo informazioni alimentari, non gestionale: nessun food cost strutturato, nessun magazzino |
| **Pastry Skill** | Pasticcerie professionali IT | Non pubblicato [V] | 22 parametri per ingrediente, lancio automatico di produzione | Perimetro sovrapponibile a Ricettario+Produzione Foodos, senza cassa né P&L |
| **FOODCOST in Cloud** | Ristorazione generica IT | Non pubblicato [V] | Ricette con AI, multi-ristorante/franchising | Foodos è verticale sull'artigianale, loro sono generalisti ristorazione |

### Casse e gestionali generalisti italiani (concorrenti adiacenti)

| Nome | A chi si rivolge | Prezzo | Punto forte | Nostra posizione |
|---|---|---|---|---|
| **Cassa in Cloud (TeamSystem)** | Bar/ristoranti/retail generico | Non pubblicato [V] | Ecosistema cassa+fatturazione ampio | 3,6/5 su Capterra; lamentela testuale **«mancanza di gestione di magazzino su base ricetta»** — il gap che Foodos riempie |
| **Tilby** | Bar/ristoranti generico | Non pubblicato, quote-generator [V] | 8+ integrazioni delivery/PMS (Glovo, Just Eat, Deliveroo, TheFork) | Zero integrazione food cost/ricettario: Foodos si integra con Tilby via webhook, non il contrario |
| **RistoManager** | Ristoranti IT | Non pubblicato; «chiavi in mano» con **36 mesi minimi** [V] | Funziona offline (server locale) | Il vincolo lungo è una leva commerciale per Foodos, che non lega nessuno |
| **Passepartout** | Retail/ristorazione enterprise IT | Non pubblicato [S] | Diffusione storica, radicamento commercialisti | Percepito rigido e vecchio stile; posizionamento enterprise lontano dal piccolo artigiano |
| **Bacco (Dylog)** | Gelaterie/cremerie IT | Non pubblicato [V] | Vendita a peso con bilancia, fidelity cross-locale | Nessun food cost ricorsivo né cassa/P&L integrati nello stesso dato |
| **TeamSystem (incumbent)** | Tutto il mercato gestionale IT | — | Scala, distribuzione | **2,4/5 su Trustpilot (1.531 recensioni)**, 54% a 1 stella: «assistenza irraggiungibile» |
| **Zucchetti (incumbent)** | Tutto il mercato gestionale IT | — | Scala, distribuzione | **1,3/5 su Trustpilot (402 recensioni)**, 69% a 1 stella: «assistenza lenta, praticamente inesistente» |

### Food cost / inventory internazionali (USA, UK, Irlanda, Belgio)

| Nome | A chi si rivolge | Prezzo | Punto forte | Nostra posizione |
|---|---|---|---|---|
| **MarketMan** | Ristoranti indipendenti e catene, ghost kitchen | 249 / 299 $/mese, Enterprise da 449 $ [V] | EDI fornitori, smart ordering, modulo Commissary per laboratori centrali | Nessuna fiscalità IT; Trustpilot 2,0/5 (17 rec., 88% a 1 stella): *«This company is a scam»*, disdetta impossibile |
| **Apicbase** | Gruppi multi-sede da 5 outlet in su, hotel, catering | Non pubblicato, fatturazione annuale [V] | Forecasting su base storica, BOM, moduli HACCP/Tracciabilità come add-on | Esclude strutturalmente chi ha meno di 5 sedi: l'intero segmento gelateria 1-4 punti vendita è fuori mercato per loro |
| **Nory** | Catene UK/Irlanda 5-centinaia di location | Non pubblicato, solo demo [V] | Forecast a 5 settimane con meteo; **cliente Badiani (gelaterie fiorentine), 96% di accuratezza dichiarata** | Un cliente panificio: *«completely geared towards restaurants»*, *«half-finished product»* (Trustpilot); attività mono-sede rifiutate |
| **MarginEdge** | Ristoranti indipendenti USA, filosofia più vicina a Foodos | 350 $/mese/sede, +Freepour 500 $ [V] | OCR fatture illimitato, bill pay integrato | *«You have to put A LOT of work into adding the recipes»*; una modifica in una sede impatta le altre |
| **xtraCHEF (Toast)** | Clienti Toast POS (USA) | Da 149 $/mese (dato Capterra, non listino ufficiale) [S] | AP automation con rebate produttori | Funziona bene solo dentro l'ecosistema Toast, quasi irrilevante per l'Italia; *«spend a large portion of their day watching a spinning wheel»* |
| **Craftable** | Ristoranti/bar/hotel USA, forte su beverage | Non pubblicato; un cliente cita «$300/mese è già alto» [S] | AP Automation con sync GL/ERP in tempo reale | *«You can't easily make mass recipe changes»* — manca la propagazione ricorsiva che Foodos ha di serie |
| **Restaurant365** | Catene e gruppi USA, >52.000 ristoranti clienti | 499 / 749 $/mese [V] | Contabilità GL completa + payroll/HR integrati | Overkill/costoso per 1-10 punti vendita; *«wasted 30k almost on this junk»* (Trustpilot) per una funzione di costo-per-articolo mai attivata |
| **Fourth** | Hospitality enterprise (hotel, catene, 1.100 clienti in 60 paesi) | Non pubblicato [V] | Workforce management e payroll su scala enterprise | Trustpilot 2,0/5 (12 rec., 100% a 1 stella): *«outdated, overpriced, achingly complicated»*, funzioni bloccate dietro fee extra |
| **Kitchen CUT** | Hotel/pub/catering UK, piccole realtà hospitality | Da 13,20 £/utente/mese (stima terzi) [S] | Nutritional analysis, buffet analysis | Prezzo per-utente cresce in fretta con lo staff; *«Pricing seems a little bit high for just one location»* |
| **Meez** | Gruppi ristorazione USA multi-unità | 19-199 $/mese + add-on, Enterprise custom [V] | AI import ricette, training visivo per lo staff | Nessuna app nativa; database ingredienti *«centered around culinary ingredients»*, non su pasticceria |
| **Galley Solutions** | Foodservice non-commerciale (mense, ospedali, università) | SMB 99 $/mese solo costing, Enterprise custom [V] | Free tier «Test Kitchen» | A 99 $/mese non include magazzino/ordini; nessuna app mobile (*«I wish that there was a mobile app»*) |
| **Parsley** | Caffetterie/corporate dining/catering USA | 129 / 189 / 379 $/mese + add-on [V] | Il più trasparente sul prezzo dei 18; agente AI «Herb», conformità FSMA 204 | Per avere l'equivalente di Foodos (ricettario+magazzino+acquisti) serve il piano da 379 $; nessuna fiscalità IT |
| **Optimum Control (TracRite)** | Ristoranti indipendenti/piccoli multi-unit USA/Canada | 150-300 $/mese + setup 250-1.000 $ [V] | 70+ report ideal-vs-actual cost | Architettura desktop Windows; *«not the most visually appealing»*, avvio lento |
| **CostGuard → reciProfity** | Ristoranti indipendenti-multi-unit, hotel USA | 65-124 $/mese (annuale) [V] | Modulo nutrizionale USDA 2017 | Solo 2 recensioni pubbliche, una con addebiti dopo cancellazione trial contestati |
| **Recipe Cost Calculator** | Ristoranti, panifici/pasticcerie, piccoli produttori USA | 24-108 $/mese [V] | Il più vicino a Foodos per prezzo e feature-set (sotto-ricette, storico prezzi, import Excel) | Si vende esplicitamente come «5-10× più economico di MarginEdge/MarketMan»: conferma che il mercato USA ha uno spazio prezzo basso rimasto scoperto dai grandi player |

### Bakery / pastry / gelato specifici, fuori Italia

| Nome | A chi si rivolge | Prezzo | Punto forte | Nostra posizione |
|---|---|---|---|---|
| **BakeSmart** | Bakery artigianali/mid-size Nord America, torte custom + wholesale | 99 $/mese/sede + setup 499 $ [V] | Cake Matrix: pricing dinamico torte su misura, Wholesale Portal self-service | Nessun food cost ricorsivo; un cliente: implementazione *«a huge wreck»* |
| **Streamline (Mountain Stream)** | Bakery wholesale 11-200+ dipendenti | Setup da 499 $ + 0,50 $/ordine (min. 299,50 $/mese) [V] | Tracciabilità lotti completa fino al recall, route planning consegne | Tarato su B2B/wholesale, non su vendita diretta al banco; interfaccia *«dated»*, *«overcomplicated»* |
| **Cybake** | Bakery retail+wholesale UK/Irlanda/Nord America/Australia, dal 1998 | Non pubblicato [V] | In-Store Bakery module, integrazioni Xero/Sage/QuickBooks | UK/Azure-centrico, nessuna fiscalità IT; solo 3 recensioni pubbliche |
| **RecipeCosting → Culvana** | Da ristoranti a bakery a navi da crociera (rebrand AI 2026) | 199 $/sede/mese all-inclusive + 2,5%+0,10 $/transazione [V] | POS incluso nell'abbonamento, non solo integrato | Generalista orizzontale, zero recensioni pubbliche (rebrand troppo recente): prodotto in transizione |

### Benchmark europeo continentale

| Nome | A chi si rivolge | Prezzo | Punto forte | Nostra posizione |
|---|---|---|---|---|
| **FoodNotify** (Austria) | Ristorazione/hotel/catering DACH | Starter 174,90 €/mese, 1 sede, solo 2 moduli [V] | Ordini automatizzati con EDI fornitori, allergeni e prezzi auto-aggiornati | È il prezzo europeo più vicino a Foodos Plus (149 €) per una sede sola, ma con molto meno dentro (2 moduli contro l'intera suite Foodos) |

---

## Corpo dell'audit

### A. Verticali artigianali italiani — i concorrenti diretti

- **Qubi ha l'HACCP digitale in vetrina, con alert sulle temperature; il nostro è nascosto.** Cosa hanno loro: modulo HACCP visibile e venduto come funzione di punta del piano Premium AI. Cosa abbiamo noi oggi: la pagina HACCP esiste nel codice (`haccp` in `VISTE_DISEGNATE`, `src/lib/menuFoodos.js`) ma è fuori menu, irraggiungibile per l'utente normale. Cosa cambieremmo: decidere — o la finiamo e la rimettiamo in vetrina, o la togliamo del tutto invece di lasciarla come pagina morta. Quanto vale: **medio** — obbligo di legge per ogni laboratorio, ma non il motivo per cui un cliente sceglie o lascia Foodos oggi.

- **Qubi ha una banca dati di 11.341 alimenti con barcode; noi partiamo da zero ingrediente per ingrediente.** Cosa hanno loro: catalogo precompilato, scansione barcode e il dato è già lì. Cosa abbiamo noi oggi: le materie prime si creano a mano nell'onboarding. Cosa cambieremmo: un catalogo di partenza per le materie prime più comuni della gelateria/pasticceria italiana, precaricato in ogni nuovo tenant a partire dai 427 prezzi HORECA che il food cost già usa internamente. Quanto vale: **grande** — l'onboarding lento è il primo punto di abbandono, e il dato per farlo Foodos ce l'ha già senza comprare nulla da terzi.

- **RicetteInCloud ha stampato oltre 1,2 milioni di etichette 1169/2011 con riconoscimento lotti via foto AI; il nostro allergeni/HACCP è nascosto.** Cosa hanno loro: tracciabilità lotti con foto e riconoscimento automatico. Cosa abbiamo noi oggi: nessuna gestione lotti, nessuna etichetta stampabile conforme al Regolamento UE 1169/2011. Cosa cambieremmo: nulla nel breve termine — è un modulo intero, non una rifinitura — ma va segnato come gap dichiarato, non taciuto. Quanto vale: **medio**, perché tocca un obbligo di legge (sanzioni 1.000-24.000 € per allergeni omessi o indicati male, da confermare sul testo del D.lgs. 231/2017) ma il gelato sfuso in vetrina rientra nel regime «non preimballato», più leggero, dove basta un cartello anche digitale.

- **Gelatobalance ha già la lettura AI delle fatture fornitori nel piano Business (99 €/mese), lo stesso genere di funzione che Foodos sta costruendo ora sull'aggiornamento prezzi da bolla.** Cosa hanno loro: OCR fatture che aggiorna in automatico i prezzi delle materie prime, oggi, in un prodotto verticale italiano a un prezzo inferiore a Foodos Plus. Cosa abbiamo noi oggi: la funzione è in corso. Cosa cambieremmo: non trattarla come primato — vedere sezione D più sotto per i difetti noti di questo genere di automazione altrove, da evitare fin dal primo commit. Quanto vale: **grande**, perché è la funzione su cui un concorrente diretto italiano ci ha già preceduto sul mercato: va fatta bene, non fatta per prima.

- **Gelatobalance vende già un Conto Economico e un Break Even Point pronti nel piano Business; il nostro P&L parte vuoto finché non si configurano i costi fissi.** Cosa cambieremmo: un wizard che propone 5-6 costi fissi tipici (affitto, utenze, personale) al primo accesso al P&L, con valori di default modificabili, invece di una tabella vuota che sembra un difetto. Quanto vale: **medio**, un problema di prima impressione più che di sostanza.

- **Nessuno dei sette prodotti italiani verticali censiti ha un motore di food cost ricorsivo su più livelli di semilavorati con rilevazione dei cicli.** Cosa abbiamo noi oggi: calcolo ricorsivo fino a profondità 3 con cycle-detection (`src/lib/foodcost.js`), la parte di prodotto già definita «crown jewel» nell'analisi interna. Cosa cambieremmo: niente nel motore — va **detto meglio** in vetrina, perché oggi non è un argomento di vendita esplicito da nessuna parte visibile al cliente. Quanto vale: **grande** — è il vero differenziale tecnico, confermato anche dal mercato internazionale (vedi punto 1 del riassunto), e oggi è invisibile a chi confronta i prodotti prima di comprare.

### B. Casse e gestionali generalisti italiani — i concorrenti adiacenti

- **Cassa in Cloud ha l'unico difetto che conta per Foodos scritto nero su bianco dai suoi stessi utenti.** Cosa cambieremmo: usare la frase «mancanza di gestione di magazzino su base ricetta», verificata e datata, nel materiale di vendita quando ci si confronta con un cliente che già usa Cassa in Cloud e ha un laboratorio dietro il banco. Quanto vale: **grande** — argomento di vendita con fonte verificabile, non un'opinione nostra.

- **Tilby ha 8+ integrazioni con piattaforme delivery e prenotazione e zero con qualunque food cost o ricettario.** Cosa cambieremmo: proporsi esplicitamente ai clienti Tilby come «il pezzo di ricettario e food cost che a Tilby manca», con un caso d'uso scritto per l'onboarding di chi arriva da lì (l'integrazione tecnica via webhook c'è già). Quanto vale: **medio** — lavoro commerciale, non tecnico.

- **RistoManager lega il cliente a 36 mesi minimi sulla formula «chiavi in mano»; Foodos non lega nessuno.** Cosa cambieremmo: nulla nel prodotto, va solo detto chiaramente nel materiale commerciale che non c'è vincolo. Quanto vale: **piccolo**, ma a costo zero da comunicare.

- **TeamSystem e Zucchetti hanno una reputazione di assistenza pessima misurata, non percepita.** Cosa cambieremmo: mettere per iscritto, da adesso, un impegno di tempo di risposta all'assistenza (anche informale, tipo «rispondiamo entro un giorno lavorativo») mentre il prodotto è ancora piccolo abbastanza da poterlo mantenere. Quanto vale: **grande** — è l'unica cosa che un incumbent con più soldi non può replicare in fretta: la dimensione stessa glielo impedisce.

### C. Mercato internazionale — food cost e ricettari professionali

- **Nory ha già una gelateria italiana come cliente-vetrina: Badiani, le gelaterie fiorentine, con il 96% di accuratezza di previsione dichiarata.** Cosa hanno loro: un concorrente internazionale finanziato (Series B da 31 milioni di euro, settembre 2025) che ha già messo piede nel segmento gelato italiano, anche se con un prodotto tarato su ristoranti. Cosa abbiamo noi oggi: nessuna previsione della domanda per singolo gusto/prodotto. Cosa cambieremmo: non è un'emergenza — Nory resta un prodotto per catene multi-sede, non per il singolo laboratorio — ma è il primo segnale concreto che il terreno della previsione gelato in Italia non è più vuoto. Quanto vale: **medio come urgenza tecnica, grande come segnale strategico**: va tenuto d'occhio, non ignorato.

- **In tutti e 14 i prodotti food-cost/inventory internazionali censiti, il tema più ricorrente nelle recensioni è lo stesso: il setup e l'inserimento ricette all'inizio sono lentissimi.** Citazioni dirette: MarketMan *«Setup is very tedious and takes a LOT of work»*; MarginEdge *«You have to put A LOT of work into adding the recipes. The conversions are very time consuming»*; Parsley *«you must be prepared to invest the time to initially enter recipes, ingredients and vendors»*; Craftable *«The initial data input was intense and time consuming»*. Cosa abbiamo noi oggi: import Excel via wizard, ma non misurato quanto tempo impiega davvero un nuovo cliente al primo ricettario completo. Cosa cambieremmo: misurare il tempo reale di onboarding di un cliente vero fino al primo food cost corretto, e trattarlo come north-star metric contro cui questo intero mercato perde clienti. Quanto vale: **grande** — è il singolo punto di abbandono più citato ovunque, in ogni lingua, su ogni piattaforma di recensioni.

- **Craftable non propaga la modifica di un ingrediente su tutte le ricette che lo usano: bisogna cambiarle una per una.** Citazione: *«You can't easily make mass recipe changes... I have to go manually change every recipe that uses well vermouth»*. Cosa abbiamo noi oggi: il food cost ricorsivo di Foodos ricalcola automaticamente ogni ricetta che dipende da un ingrediente o da un semilavorato quando il suo prezzo cambia. Cosa cambieremmo: nulla — è già un differenziale, va solo detto in vetrina come al punto precedente. Quanto vale: **grande** per la comunicazione, **zero fatica** perché il lavoro tecnico è già fatto.

- **Apicbase esclude dal mercato chi ha meno di 5 punti vendita (piano Growth minimo), MarketMan parte da 249 $/mese, Restaurant365 da 499 $/mese: tre dei concorrenti più capitalizzati del settore non possono nemmeno vendere a una gelateria con 1-3 sedi.** Cosa abbiamo noi oggi: Foodos serve esattamente quella fascia. Cosa cambieremmo: nulla nel prodotto, ma è un argomento di posizionamento da usare anche fuori dall'Italia in futuro: il segmento «1-10 punti vendita artigianali» è strutturalmente ignorato dai player USA/UK più grandi, non solo dai verticali italiani. Quanto vale: **medio**, orizzonte non immediato ma da tenere in mente per un'eventuale espansione.

### D. Aggiornamento prezzi materie prime da bolla — come lo fanno gli altri

Foodos sta costruendo l'aggiornamento automatico dei prezzi delle materie prime dalla bolla caricata in magazzino, con storico prezzi. Non è una novità di categoria: MarketMan lo fa via OCR con «50 scansioni fattura AI/mese» nel piano base e illimitate da Growth in su; MarginEdge lo fa con fatture illimitate incluse in ogni piano; Gelatobalance, concorrente diretto italiano, lo ha già nel piano Business a 99 €/mese; Culvana (ex RecipeCosting) lo vende come funzione centrale del suo abbonamento a 199 $/sede/mese. È una funzione ormai attesa in categoria, non un vantaggio da annunciare come primato.

- **Due difetti noti e ricorrenti in questo genere di automazione altrove, da evitare da subito.** Primo: la sincronizzazione fornitore/prezzo che si rompe quando cambia il nome di un prodotto o di un fornitore — Apicbase: *«Inconsistent price management integration»*; MarketMan: *«Marketman struggled to sync with Square causing products to multiply»* quando un nome cambiava, con articoli duplicati invece che aggiornati. Secondo: le unità di misura che non tornano — un caso descritto da un fornitore di settore (Supy): una cassa da 5 kg letta come 1 unità fa risultare 40 kg di consumo reale come 8 unità, sottostimando il consumo dell'80%. Cosa cambieremmo: prima di attivare l'aggiornamento automatico in produzione, un test che verifica esplicitamente cosa succede quando (a) lo stesso ingrediente arriva da bolle con nomi leggermente diversi, e (b) l'unità di misura sulla bolla non coincide con quella usata nella ricetta. Quanto vale: **grande** — è il tipo di difetto che, se sfugge, corrompe silenziosamente il food cost di ogni ricetta a valle, ed è documentato che è già successo a concorrenti con più risorse di collaudo di Foodos.

- **La lettura della fattura via fotocamera da cellulare ha un problema tecnico noto su iPhone se Foodos la offre come PWA installata.** Fonte tecnica (STRICH, knowledge base per SDK di scansione, agosto 2026): su iOS, quando una PWA installata (non aperta dentro Safari) chiede l'accesso alla fotocamera, **il permesso non viene ricordato e va richiesto ogni volta**, con nessun fix definitivo alla data. Cosa cambieremmo: verificare in laboratorio, su un iPhone vero, cosa succede quando un dipendente fotografa una bolla dalla app installata in home screen più volte di fila nello stesso turno. Quanto vale: **medio** — non blocca la funzione, ma può renderla fastidiosa proprio nel momento (banco di carico merce, mani sporche) in cui deve essere più veloce, non più lenta.

### E. Specifici bakery/pastry/gelato fuori dall'Italia

- **BakeSmart e Streamline sono tarati su ordini custom e wholesale (torte su misura, consegne a rivenditori), non su food cost strutturato.** Cosa hanno loro: BakeSmart ha un «Cake Matrix» che calcola il prezzo di una torta su misura in base a dimensione, farcitura e decorazioni in tempo reale — funzione che Foodos non ha e che serve solo a chi vende su ordinazione, non al banco. Cosa abbiamo noi oggi: nessun configuratore di prodotto custom. Cosa cambieremmo: nulla per ora — Mara dei Boschi vende principalmente al banco, non su ordinazione custom — ma va tenuto come possibile modulo futuro se un cliente pasticceria con forte quota torte-su-misura entrasse in trattativa. Quanto vale: **piccolo** oggi, potenzialmente **medio** per un profilo cliente diverso da quello attuale.

- **Cybake ha un modulo di riordino negozio basato sullo storico vendite (sales-based shop ordering) che Foodos non ha.** Cosa hanno loro: il sistema propone da solo quanto riordinare in base a cosa si è venduto. Cosa abbiamo noi oggi: le soglie di scorta sono impostate manualmente in Magazzino. Cosa cambieremmo: valutare, non ora, un suggerimento di riordino calcolato sullo storico consumi per materia prima — è un'estensione naturale del modulo Previsioni già esistente. Quanto vale: **medio**, fatica **media-alta** (serve storico consumi affidabile, che oggi dipende dalla qualità dei dati di produzione inseriti).

- **RecipeCosting/Culvana ha rifatto sé stesso come «POS incluso nell'abbonamento», non più «software di costing collegato a un POS terzo».** Segnale di mercato, non funzione da copiare: il costing puro, da solo, non basta più come prodotto — tre concorrenti passati in rassegna (Craftybase→Stocksmith, RecipeCosting→Culvana, e la spinta di Gelatobalance verso conto economico/cash flow) si stanno spostando dal calcolo verso la gestione operativa completa. Cosa abbiamo noi oggi: Foodos è già nato come suite completa (ricettario+cassa+P&L+scadenzario), quindi è già nel punto di arrivo verso cui questi concorrenti stanno migrando. Quanto vale: **conferma di rotta**, nessun intervento richiesto.

---

## Cosa NON dobbiamo copiare

- **I piani senza prezzo pubblico («contattaci»).** Cassa in Cloud, Tilby, RistoManager, Passepartout, Apicbase, Nory, Fourth, Cybake, Restaurant365: la maggioranza dei concorrenti censiti, italiani e internazionali, non pubblica un prezzo reale. Perché non copiarlo: nasconde il prezzo per aprire una trattativa commerciale che Foodos, senza una rete vendita, non può permettersi di replicare — e un artigiano che confronta prodotti scarta prima quello che non gli dice quanto costa.
- **Il vincolo contrattuale lungo o la disdetta resa volutamente difficile.** RistoManager lega 36 mesi; MarketMan è descritto su Trustpilot come *«jumping through flaming hoops»* per disdire, con un cliente che si è visto addebitare l'intero anno nonostante il tentativo di uscita. Perché non copiarlo: è il tipo di clausola che genera sistematicamente le recensioni peggiori di ogni prodotto che la applica, e va contro il posizionamento di Foodos come prodotto che si può lasciare quando si vuole.
- **Le funzioni essenziali bloccate dietro fee aggiuntive dopo la vendita.** Fourth, secondo una recensione: *«Many basic features are locked behind additional fees. Simple data uploads that should be standard functionality instead come with a request for more money»*. Fatture in Cloud mette le API pubbliche solo nel piano più caro (Complete, 51 €/mese). Perché non copiarlo: insegna al cliente a diffidare del prezzo iniziale, non a fare upgrade volentieri.
- **Il magazzino disallineato dalla ricetta (il buco di Cassa in Cloud).** Perché non copiarlo: è il difetto più citato dagli utenti stessi — conferma che legare produzione, magazzino e food cost allo stesso dato, come fa Foodos, è la scelta giusta, non un'area dove «semplificare» imitando i generalisti.
- **Il modello a consumo con commissione per transazione (Culvana: 2,5% + 0,10 $ a transazione, oltre al canone).** Perché non copiarlo: su una gelateria con centinaia di scontrini al giorno d'estate, una commissione per transazione diventa rapidamente più cara e meno prevedibile di un canone fisso — ed è più difficile da spiegare a un titolare che ragiona in euro al mese, non in punti percentuali.

---

## I dieci interventi, in ordine di valore/fatica

1. **Dire in vetrina che il food cost è ricorsivo sui semilavorati, con un esempio concreto (basi gelato → gusto finito).** Nessun concorrente censiti, italiano o estero, lo fa nativamente. Fatica: quasi nulla (testo, non codice). Valore: **grande**. Costo stimato: poche ore.
2. **Usare la citazione verificata di Cassa in Cloud («mancanza di gestione di magazzino su base ricetta») nel materiale di vendita.** Fatica: quasi nulla. Valore: **grande**. Costo stimato: poche ore.
3. **Catalogo materie prime precaricato all'onboarding**, a partire dai 427 prezzi HORECA già presenti nel motore food cost (gap con Qubi). Fatica: piccola. Valore: **grande**. Costo stimato: 1-2 giornate.
4. **Test di regressione sull'aggiornamento prezzi da bolla in corso**, mirati sui due difetti noti altrove: nomi fornitore/prodotto che cambiano leggermente, unità di misura che non coincidono tra bolla e ricetta. Fatica: piccola-media (va fatto comunque prima del rilascio). Valore: **grande** — previene un difetto che ha già rotto i dati di più concorrenti internazionali. Costo stimato: 2-3 giornate.
5. **Comunicare esplicitamente «nessun vincolo, nessuna API riservata al piano più caro» come garanzia commerciale**, contro RistoManager (36 mesi) e MarketMan (disdetta impossibile). Fatica: quasi nulla. Valore: **medio-grande**. Costo stimato: poche ore.
6. **Wizard costi fissi al primo accesso al P&L** (gap con Gelatobalance: il loro Conto Economico è pronto all'uso, il nostro parte vuoto). Fatica: media. Valore: **medio**. Costo stimato: 2-3 giornate.
7. **Misurare il tempo reale di onboarding di un cliente vero fino al primo food cost corretto**, e trattarlo come metrica di prodotto. È il singolo punto di abbandono più citato in tutte le recensioni internazionali censiti. Fatica: media (serve strumentazione, non solo intuizione). Valore: **grande**. Costo stimato: 2-3 giornate per la misura, poi interventi mirati a seconda del risultato.
8. **Verificare su un iPhone vero il comportamento della fotocamera per l'OCR bolle/fatture quando Foodos è installata come PWA**, per il problema noto del permesso camera che non si ricorda su iOS. Fatica: media (test manuale + eventuale rimozione del tag PWA per quel flusso). Valore: **medio**. Costo stimato: 1-2 giornate.
9. **Decidere il destino della pagina HACCP: finirla e rimetterla in vetrina, o toglierla dal codice.** Fatica: media se si finisce (2-4 giornate), piccola se si toglie (mezza giornata). Valore: **medio**.
10. **Tenere sotto osservazione Nory in Italia** (cliente Badiani, gelaterie fiorentine, 96% di accuratezza di previsione dichiarata): nessun intervento tecnico ora, ma un punto fisso nel prossimo confronto trimestrale di prodotto, perché è il primo segnale concreto di un concorrente internazionale finanziato che mette piede nel segmento gelato italiano. Fatica: nessuna oggi. Valore: **strategico**, da non perdere di vista.

---

**Nota di onestà**: questo documento distingue sempre dato verificato (con URL aperto, marcato [V]) da dato supposto o dedotto da fonte terza (marcato [S]) o da fonte non apribile (marcato [KO]). Dove un prezzo non è pubblicato, è scritto «non pubblicato»: non è mai stato stimato o inventato. Alcuni campioni di recensioni citati sono molto piccoli (Cybake 3, Parsley 8, CostGuard/reciProfity 2): il tema è comunque riportato perché coerente con pattern più ampi visti su prodotti simili, ma il numero di recensioni è sempre indicato accanto alla percentuale, mai nascosto.
