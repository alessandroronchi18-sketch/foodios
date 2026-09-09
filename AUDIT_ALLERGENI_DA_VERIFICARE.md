# Audit Scheda allergeni — sostenuto, da verificare

> `src/views/SchedaAllergeniView.jsx` (158 righe) + `src/lib/allergeni.js`.
>
> Quattro agenti hanno letto la pagina, la libreria del riconoscimento, il PDF
> esportato e cosa manca come utilità: **74 difetti sostenuti**, 36 di gravità alta.
>
> **NESSUNO È STATO VERIFICATO.** Tutti e 14 gli agenti scettici sono morti sul
> limite di sessione. Prima di correggere, rileggere la riga citata: negli audit
> precedenti 4 difetti su 29 sono stati smontati, e tre presunti bug si sono
> rivelati artefatti di dati di prova sbagliati.
>
> Riprendere la verifica (i lettori tornano dalla cache, costa poco):
> `Workflow({scriptPath: '~/.claude/projects/-Users-aler-foodos/9f6951b3-*/workflows/scripts/audit-allergeni-wf_fa21284e-6ac.js', resumeFromRunId: 'wf_fa21284e-6ac'})`

## Già corretto (verificato da me sui dati di produzione)

Il difetto strutturale: `detectAllergeniFromIngredienti` restituiva un elenco
piatto, e un elenco vuoto voleva dire due cose opposte — "riconosciuto e privo"
oppure "non riconosciuto". La scheda mostrava una casella vuota identica.

Misurato sui 123 nomi di ingrediente realmente presenti nel database: **81 non
producevano nessun allergene**. Cinque prodotti da gelateria costruiti con quei
nomi davano una riga **completamente vuota**: "base bianca + cioccolato
fondente", "cioccolato callebaut + acqua + zucchero + neutro", "copertura
fondente + massa 58", "gocce di cioccolato + zucchero", "base agrimontana
cioccolato + acqua". Nella mappa dei 275 pattern la parola **"cioccolato" non
c'era**, e nemmeno "cacao", "fondente", "copertura", "massa".

Aggiunto `analizzaAllergeni()` con tre stati — certi / da verificare / non
riconosciuti — più i pattern mancanti del cioccolato, delle basi da gelateria,
dei lieviti chimici e dei liquori alle mandorle. Test in
`tests/unit/allergeniTreStati.test.js`.

## Domanda aperta per il titolare

Le **castagne** vengono segnalate come "frutta a guscio". L'allegato II del
Reg. UE 1169/2011 elenca solo mandorle, nocciole, noci, anacardi, pecan, noci
del Brasile, pistacchi e macadamia: la castagna non c'è, quindi segnalarla è un
falso positivo sul piano legale. Non l'ho toccato perché ridurre un allergene
dichiarato va nella direzione pericolosa, e la decisione non spetta al
programma. Nel frattempo ho allineato "marroni" a "castagne", che prima davano
risposte diverse per la stessa cosa.


---

## Sicurezza del riconoscimento automatico degli allergeni (src/lib/aller — 19 sostenuti

### ALTA · libreria riga 393 · sicurezza
**"Non lo so" e "non contiene" sono lo stesso valore**

- **perché**: È il difetto che regge tutti gli altri. La funzione può solo dire quali allergeni ha trovato, non che non ha capito un ingrediente. La scheda quindi non ha modo di distinguere una torta davvero senza latte da una torta di cui non sa niente, e disegna la stessa casella vuota. Su un documento che il cliente legge per decidere se mangiare o no, questo è il passaggio che manda qualcuno in ospedale.
- **prova addotta**: Eseguita la funzione vera sui dati veri: ["acqua","zucchero","sale"] restituisce []; ["base bianca","massa 58","copertura fondente"] restituisce []; ingredienti undefined restituisce [] (riga 368); array vuoto restituisce []. Quattro situazioni diverse, un solo risultato. La vista lo rende con lo stesso quadratino grigio e con aria-label "Senza {allergene}" (SchedaAllergeniView.jsx:139), cioè afferma l'assenza. Nello stesso progetto calcolaFC fa il contrario: foodcost.js:927 tiene `mancanti = []` e a riga 966 ci scrive dentro quello che non sa calcolare. La funzione che tocca i soldi è più prudente di quella che tocca la salute.
- **proposta**: Cambiare il ritorno in { allergeni: string[], nonRiconosciuti: string[] } tenendo un wrapper compatibile per i chiamanti esistenti; nonRiconosciuti raccoglie ogni ingrediente su cui nessun pattern ha fatto centro. Nella scheda serve un terzo stato visivo, diverso sia dalla crocetta sia dal vuoto (per esempio un punto interrogativo con il testo "da verificare"), e in cima alla pagina la riga "3 ingredienti da controllare a mano" con l'elenco. Sopra, un registro per ingrediente: l'utente risolve una volta "cioccolato callebaut = soia" e vale per tutte le ricette che lo usano (il ricettario ha già ingredienti_costi keyed per nome normalizzato, foodcost.js:905, è il posto giusto).

### ALTA · libreria riga 56 · correttezza
**"zucchero semolato" dichiara glutine**

- **perché**: Lo zucchero semolato sta in quasi tutte le ricette di una pasticceria, quindi buona parte del ricettario si marca glutine senza motivo. I danni sono due: un prodotto senza glutine sembra non sicuro (e chi è celiaco lo evita per niente), e soprattutto l'utente impara che le crocette sbagliano e smette di fidarsi anche di quelle giuste.
- **prova addotta**: allergeni.js:56 'semola': ['glutine'] e allergeni.js:383 `nome.indexOf(key)` senza controllo di confine parola: "zucchero semolato".indexOf("semola") = 9. La funzione vera su quel nome restituisce ["glutine"]. Passata l'intera lista dei 123 nomi: gli unici pattern che cadono dentro una parola diversa sono 'semola' in "zucchero semolato" (dannoso), 'butter'/'milk' in "buttermilk" e 'pistacchi' in "pasta pistacchio" (questi due innocui, il risultato è comunque giusto).
- **proposta**: Sostituire indexOf con un match sui confini di parola: precompilare per ogni chiave una RegExp `new RegExp('(^|\\s)' + escape(key) + '($|\\s)')`, oppure confrontare sequenze di token invece di sottostringhe. Aggiungere ai test in tests/unit/allergeni.test.js il caso "zucchero semolato" -> [] e, meglio, un test che gira su tutti i 123 nomi veri con l'esito atteso congelato, così un pattern nuovo non può più creare danni di questo tipo in silenzio.

### ALTA · libreria riga 222 · sicurezza
**Tutta la famiglia del cioccolato non esiste nel mapping**

- **perché**: Nel cioccolato di copertura la lecitina di soia è lo standard di categoria, e la soia è uno dei 14 allergeni obbligatori. Sono 9 nomi veri su 123, e in una pasticceria il cioccolato entra in mezzo ricettario: è il falso negativo più diffuso della pagina.
- **prova addotta**: Nessuna delle 275 chiavi di ALLERGENI_MAPPING contiene "ciocc" (verificato filtrando Object.keys). Esito della funzione vera: "cioccolato" [], "cioccolato callebaut" [], "cioccolato_fondente" [], "copertura fondente" [], "gocce di cioccolato" [], "massa 58" [], "base cioccolato" [], "base agrimontana cioccolato" [], "base agrimontana ciocolato" []. L'unico che passa è "cioccolato_latte" -> ["latte"], e passa per caso, perché nel nome c'è scritto latte: non perché il codice sappia cos'è il cioccolato.
- **proposta**: Aggiungere le chiavi del cioccolato, ma NON come certezza: 'cioccolato', 'copertura', 'gocce di cioccolato', 'massa' e le basi commerciali vanno in una seconda lista, tipo PROBABILI, che produce lo stato "da verificare in etichetta" del difetto 1, non la crocetta. Poi l'utente conferma una volta per ingrediente. Per il cioccolato al latte ('cioccolato al latte', 'cioccolato_latte') latte e soia insieme. Attenzione a 'massa' da solo: troppo generico, meglio 'massa 58' e 'massa di cacao'.

### ALTA · libreria riga 190 · sicurezza
**"pasta gianduiotto": glutine inventato e nocciole perse sullo stesso nome**

- **perché**: È il caso peggiore in assoluto: la scheda dichiara un allergene che non c'è e tace quello che c'è. Il gianduiotto è nocciole più latte, cioè frutta a guscio, la famiglia che dà le reazioni più violente. Un cliente allergico alle nocciole legge la casella vuota e mangia.
- **prova addotta**: Le chiavi 'gianduia' e 'gianduja' (allergeni.js:190-191) non sono contenute in "gianduiotto", quindi non matchano. Resta 'pasta' (riga 69). Esito della funzione vera: "pasta gianduiotto" -> ["glutine"]. Frutta a guscio e latte, che ci sono davvero, non compaiono.
- **proposta**: Aggiungere 'gianduiotto' e 'gianduiotti' -> ['fruttasc','latte'] accanto a gianduia/gianduja, e togliere il glutine risolvendo il difetto sul pattern 'pasta'. Poi una regola di controllo: quando un nome contiene una parola non riconosciuta accanto a un pattern generico, l'ingrediente va nella lista "da verificare" invece di essere considerato risolto.

### ALTA · libreria riga 367 · struttura
**I semilavorati non entrano nella scheda: la funzione non riceve mai il ricettario**

- **perché**: Una crostata scritta come "pasta frolla + crema pasticcera + fruit" ha tre ingredienti, tutti semilavorati, e ognuno porta i suoi allergeni. Se la scheda guarda solo i tre nomi, la crostata risulta senza latte, senza uova e senza glutine. È il modo più normale di scrivere le ricette in laboratorio, quindi non è un caso limite.
- **prova addotta**: La firma a riga 367 è `detectAllergeniFromIngredienti(ingredienti)`, arity 1: non ha il ricettario, quindi non può risalire alla ricetta del semilavorato. Esito su nomi che il progetto stesso registra come semilavorati (foodcost.js:699-702): "crema pasticcera" [], "ganache vegana" [], "fruit per crostate" [], "base bianca" []. Confronto diretto: calcolaFC (foodcost.js:936-959) prende LO STESSO nome, trova la chiave del semilavorato confrontando sia la chiave sia r.nome, e ricorre dentro (max 3 livelli, con rilevazione dei cicli). Il costo si espande, l'allergene no. "pasta frolla" funziona solo perché è finita a mano nel mapping a riga 71.
- **proposta**: Aggiungere un secondo parametro opzionale: detectAllergeniFromIngredienti(ingredienti, ricettario, depth = 0). Per ogni ingrediente, cercare prima una ricetta omonima con lo stesso criterio di foodcost.js:937-941; se c'è, unire i suoi allergeni (salvati, o rilevati ricorrendo) invece di guardare il nome. Stesse guardie di calcolaFC: max 3 livelli e ciclo-detect via path, e se il limite scatta l'ingrediente finisce fra i nonRiconosciuti, non a zero. SchedaAllergeniView ha già il ricettario come prop, basta passarlo (riga 19).

### ALTA · libreria riga 106 · sicurezza
**Le basi da gelato non dichiarano il latte**

- **perché**: Le basi commerciali per gelato sono in gran parte latte scremato in polvere. Il latte è l'allergene più comune fra i clienti di una gelateria e queste basi finiscono in ogni vaschetta: se la scheda dice che non c'è, dice la cosa sbagliata al banco, tutti i giorni.
- **prova addotta**: Esito della funzione vera: "base bianca" [], "base cioccolato" [], "base agrimontana cioccolato" [], "base agrimontana ciocolato" []. Nessuna chiave del mapping copre la parola "base", e la sezione latte (righe 106-161) elenca 56 forme di latticino ma nessun semilavorato da gelateria.
- **proposta**: Le basi vanno trattate come il cioccolato: chiave 'base' abbinata a un nome non riconosciuto porta l'ingrediente nello stato "da verificare", con suggerimento "le basi per gelato contengono quasi sempre latte in polvere". Non inventare la crocetta: chiedere una conferma una volta sola per ingrediente e ricordarla. In più "base bianca" e "base cioccolato" nel ricettario di Mara sono candidati naturali a diventare semilavorati con ingredienti veri, e allora il difetto sui semilavorati li risolve da solo.

### ALTA · libreria riga 79 · sicurezza
**Lievito chimico e lievito per dolci non dichiarano il glutine**

- **perché**: Il lievito per dolci in bustina contiene di norma amido di frumento come supporto, quindi glutine. Sono 3 nomi su 123 e stanno in tutte le torte da forno. Un celiaco che legge "senza glutine" su una torta lievitata con la bustina sta bene per caso.
- **prova addotta**: Esito della funzione vera: "lievito chimico" [], "lievito per dolci" [], "lievito_chimico" []. Nel mapping l'unica chiave con "lievito" è 'lievito madre' -> ['glutine'] (riga 79). Correttamente non segnalato "lievito fresco" (lievito di birra, non è un allergene).
- **proposta**: Aggiungere 'lievito chimico', 'lievito per dolci', 'lievito vanigliato', 'lievito istantaneo' e 'cremor tartaro' alla lista PROBABILI (glutine da amido di frumento), con nota "controlla la bustina: alcune marche usano amido di mais e sono senza glutine". Lasciare fuori 'lievito' da solo, che è ambiguo, e mandarlo fra i nonRiconosciuti.

### ALTA · libreria riga 75 · sicurezza
**"amaretto" al singolare non matcha 'amaretti': frutta a guscio persa**

- **perché**: Gli amaretti sono mandorle o armelline, cioè frutta a guscio, l'allergene con le reazioni più gravi. Che il riconoscimento salti per una lettera finale è il tipo di errore che nessuno va a cercare, perché la pagina non sbaglia in modo visibile: mostra solo una casella vuota.
- **prova addotta**: Esito della funzione vera: "amaretti" -> ["glutine","uova","fruttasc"], "amaretto" -> []. La chiave nel mapping è solo 'amaretti' (riga 75). Nella stessa lista di ingredienti veri ci sono entrambe le scritture, quindi si tratta dello stesso prodotto scritto in due modi. Se invece fosse il liquore, il nome resta comunque da risolvere a mano: quello che non deve fare è valere zero.
- **proposta**: Nel breve: aggiungere 'amaretto' -> ['glutine','uova','fruttasc']. Nel giusto: la soluzione è quella del difetto sulla normalizzazione, perché di casi come questo ne nasce uno ogni volta che si aggiunge un pattern.

### ALTA · libreria riga 348 · struttura
**Nessuna tolleranza a plurali e errori di battitura, mentre il progetto ha già la tabella**

- **perché**: È il moltiplicatore di tutti i falsi negativi: ogni pattern copre una sola scrittura, e chi inserisce le ricette scrive come viene. Finché il riconoscimento è per sottostringa esatta, la mappa va tenuta aggiornata a mano su 275 righe e continuerà a bucarsi in silenzio.
- **prova addotta**: normalizeIngName (righe 348-356) fa tre cose: minuscole, NFD con rimozione degli accenti, non-alfanumerici sostituiti da spazio. Quindi gli underscore e gli accenti sono coperti (verificato: "farina_00" -> ["glutine"], "cocco rape" e "caffe" normalizzati bene). Manca tutto il resto. Plurali: nessuno stemming, "amaretti" contro "amaretto" come sopra. Errori di battitura: nessuna tolleranza, e nei dati veri convivono "base agrimontana cioccolato" e "base agrimontana ciocolato" — stesso prodotto, due scritture, e la seconda non matcherebbe nemmeno dopo aver aggiunto 'cioccolato' al mapping. Intanto foodcost.js:496 SING_PLUR e :522 normIng hanno già una tabella di sinonimi che copre ["mandorle","mandorla"], ["noci","noce"], ["cioccolato fondente 72%","cioccolato fondente"], ["latte di cocco","cocco disidratato"]: il motore del food cost conosce i nomi meglio di quello degli allergeni.
- **proposta**: Estrarre un unico normalizzatore condiviso (normalizeIngName più normIng e SING_PLUR) e passarci sia i nomi ingrediente sia le CHIAVI del mapping. Attenzione: SING_PLUR porta "biscotti" a "biscotto", quindi senza normalizzare anche le chiavi la riga 73 smette di funzionare, va fatto in un colpo solo con i test davanti. Per i typo, prima di dare buca fare un ultimo tentativo con distanza di Levenshtein 1 sulle chiavi lunghe almeno 6 caratteri, e in quel caso non dichiarare l'allergene ma mandare l'ingrediente fra i "da verificare" con scritto "forse è cioccolato".

### ALTA · vista riga 19 · sicurezza
**Lo snapshot salvato congela l'errore: correggere la libreria non aggiorna le ricette**

- **perché**: Vale la pena saperlo prima di mettere mano al mapping: sistemare il cioccolato non cambierà nulla nelle ricette già in archivio. Il negozio continuerà a stampare la scheda sbagliata pensando di aver aggiornato, che è la situazione peggiore di tutte.
- **prova addotta**: NuovaRicettaView.jsx:340 e :474 salvano `allergeni: detectAllergeniFromIngredienti(ings)` una volta sola, al momento dell'import (foto e batch). SchedaAllergeniView.jsx:19 usa `salvati.length ? salvati : detect(...)`: se lo snapshot non è vuoto vince sempre e il riconoscimento non viene più eseguito. Solo le ricette il cui snapshot era vuoto ricadono sul detect. Effetto collaterale opposto: una ricetta dove l'utente ha spuntato a mano il solo glutine non mostrerà mai il latte del burro, perché salvati.length è 1. mergeAllergeni (allergeni.js:402) esiste per questo, ma la scheda non la importa nemmeno (riga 6).
- **proposta**: Nella scheda usare sempre mergeAllergeni(detect(ingredienti, ricettario), salvati) invece dell'aut-aut: gli allergeni messi a mano si aggiungono, non sostituiscono. In NuovaRicettaView non salvare più lo snapshot automatico come se fosse un dato dell'utente: salvare solo `allergeniManual` e ricalcolare l'automatico a ogni lettura. Se serve mantenere lo snapshot per lo storico, tenerlo in un campo a parte con la data (allergeni_auto_v, calcolato_il) e ricalcolarlo quando la versione del mapping cambia.

### ALTA · vista riga 647 · sicurezza
**La matrice HACCP e la Scheda allergeni danno due risposte diverse**

- **perché**: Il negozio stampa due documenti che dovrebbero dire la stessa cosa, e la versione HACCP, quella che si mostra all'ASL, è sistematicamente più vuota. Se l'allergene non risulta da nessuna ricetta la riga scompare del tutto, quindi il lettore vede "qui la soia non c'è" dove la verità è "non lo sappiamo".
- **prova addotta**: Haccp.jsx:642 prende `Object.values(ricettario?.ricette || {})` senza filtrare i tipi, e :647 e :722 leggono solo `(r.allergeni || [])`: nessun auto-detect, nessun fallback. SchedaAllergeniView.jsx:13 invece esclude semilavorato e interno e :19 ricade sul riconoscimento. Quindi le due tabelle differiscono sia nelle righe (l'HACCP mostra anche i semilavorati, che non si vendono) sia nel contenuto. In più Haccp.jsx:724 `if (totale === 0) return null` cancella la riga di un allergene che nessuno dichiara.
- **proposta**: Un solo punto di verità: una funzione condivisa allergeniPerRicetta(ricetta, ricettario) in src/lib/allergeni.js che applica lo stesso filtro sui tipi, la stessa ricorsione sui semilavorati e lo stesso merge fra salvati e rilevati, usata da SchedaAllergeniView, dalla matrice HACCP e dai badge del Ricettario (RicettarioView.jsx:305). In HACCP non nascondere le righe a zero: tenerle e distinguere "nessuna ricetta lo contiene" da "nessuna ricetta è stata verificata".

### ALTA · vista riga 68 · tipografia
**Nel PDF la spunta non è una spunta, e non c'è la legenda**

- **perché**: Il PDF è il documento che si consegna al cliente e si mostra al controllo. Il carattere di spunta non esiste nel font standard di jsPDF, quindi nella casella "contiene" viene stampato un segno sbagliato. Resta il riempimento rosso, che su una stampante in bianco e nero diventa un grigio; e in nessun punto del foglio è scritto che la casella piena vuol dire "contiene". Chi legge deve indovinare.
- **prova addotta**: Eseguito jsPDF del progetto: scrivendo '✓' con Helvetica il flusso di testo del PDF contiene `(\x27\x13) Tj`, cioè un apostrofo più un byte non stampabile. U+2713 non è in WinAnsiEncoding. Il riempimento rosso è disegnato prima (righe 65-66) e le celle vuote sono solo un bordo grigio (riga 71). Nel PDF non c'è nessuna legenda: dopo la tabella c'è solo il disclaimer (riga 84). Stessa violazione della regola nella UI a riga 137, dove '✓' è usato come icona invece del componente Icon.
- **proposta**: Nel PDF sostituire il testo con un segno disegnato: due segmenti con doc.line dentro la cella, o la cella piena più la lettera X in Helvetica se serve qualcosa di sicuro in stampa. Nella UI usare Icon (per esempio name="check") come vuole la regola del progetto. E aggiungere sotto la tabella una legenda di tre voci: casella piena "contiene", casella vuota "non contiene", terzo segno "da verificare" — quest'ultimo serve comunque per il difetto 1.

### MEDIA · libreria riga 69 · correttezza
**Il pattern 'pasta' mette glutine su tutte le paste di frutta secca**

- **perché**: In pasticceria "pasta" non è la pasta di grano: è la pasta di nocciole, di pistacchio, di mandorla, il caramello. Sono 5 nomi veri su 123 e sono ingredienti costosi che stanno nei gusti principali. Dichiarare glutine dove non c'è fa perdere clienti celiaci per niente e abitua il negozio a considerare le crocette approssimative.
- **prova addotta**: allergeni.js:69 'pasta': ['glutine']. Esito della funzione vera: "pasta caramello" ["glutine"] (e qui manca il latte, che nel caramello mou c'è), "pasta di anacardi" ["fruttasc","glutine"], "pasta mandorla" ["fruttasc","glutine"], "pasta nocciola" ["fruttasc","glutine"], "pasta pistacchio" ["fruttasc","glutine"]. Il controllo dei range a riga 387 salta un match solo se è interamente dentro uno già preso, e "pasta" in "pasta nocciola" non è dentro "nocciola", quindi il glutine passa.
- **proposta**: Togliere 'pasta' da solo e tenere solo le forme complete che sono davvero grano: 'pasta sfoglia', 'pasta frolla', 'pasta brisée', 'pasta all'uovo', 'pasta di semola'. Aggiungere le paste di frutta secca che mancano: 'pasta mandorla', 'pasta nocciola', 'pasta pistacchio', 'pasta di anacardi' (frutta a guscio), 'pasta caramello' fra i probabili con il latte. Un nome che comincia per "pasta " e non è in nessuna delle due liste va fra i "da verificare".

### MEDIA · libreria riga 229 · correttezza
**"latte di avena" dichiara latte**

- **perché**: Il latte di avena serve proprio a chi non può bere il latte. Marcarlo latte rende la scheda inutile su tutta la linea vegana, e visto che 'latte di soia' è già gestito è chiaro che il rimedio è a metà.
- **prova addotta**: Esito della funzione vera: "latte di soia" -> ["soia"] (funziona per l'override a riga 229, che essendo più lungo di 'latte' vince e ne consuma il range), "latte di avena" -> ["glutine","latte"]. Il glutine è giusto, l'avena è un cereale con glutine; il latte è falso, non esiste una chiave 'latte di avena'.
- **proposta**: Aggiungere gli override che mancano con lo stesso trucco della riga 229: 'latte di avena' -> ['glutine'], 'latte di riso' -> [], 'latte di mandorla' e 'latte di mandorle' -> ['fruttasc'], 'latte di cocco' -> [], 'latte di nocciola' -> ['fruttasc'], 'latte vegetale' -> []. Meglio ancora, sostituire il trucco della lunghezza con una regola esplicita: se il nome contiene "latte di" seguito da qualcosa che non è un animale, il latte non si dichiara.

### MEDIA · libreria riga 375 · sicurezza
**Un ingrediente senza nome ma con il peso sparisce in silenzio**

- **perché**: Le ricette importate da Excel arrivano con righe sporche, e una cella nome vuota con 200 g accanto è una riga che esiste davvero nella ricetta. Il codice la salta senza dire niente, e la scheda risulta completa quando non lo è.
- **prova addotta**: allergeni.js:374-376: se il nome normalizzato è vuoto si fa `continue`, senza registrare niente. Verificato: [{nome:"",qty1stampo:200},{qty1stampo:100}] restituisce []; [{nome:"burro"},{nome:"",qty1stampo:500}] restituisce ["latte"], cioè la mezza ricetta ignota non lascia traccia. foodcost.js:929-932 fa lo stesso salto, ma lì l'effetto è solo un costo più basso; qui è una dichiarazione di legge.
- **proposta**: Se il nome è vuoto ma la riga ha un peso maggiore di zero, aggiungerla ai nonRiconosciuti con l'etichetta "riga senza nome, 200 g", così la scheda la mostra fra le cose da controllare. Le righe di scarto vere (le voci fittizie tipo "ingrediente", "n/d", "nan" che foodcost.js:926 elenca in SKIP_ING) vanno saltate come adesso: conviene riusare la stessa lista, così i due motori scartano le stesse righe.

### MEDIA · libreria riga 393 · utilita
**Il risultato non dice da quale ingrediente arriva la crocetta**

- **perché**: Chi ha sessant'anni ed è dietro il banco deve poter controllare una crocetta in dieci secondi, e chi la corregge deve sapere cosa toccare. Adesso per capire perché una torta risulta con la soia bisogna rileggere a mano tutta la lista degli ingredienti e indovinare il pattern che ha fatto centro.
- **prova addotta**: allergeni.js:369 `const found = new Set()` accumula su tutti gli ingredienti e riga 393 restituisce solo gli id degli allergeni: la provenienza viene buttata dentro il ciclo, a riga 390 dove si fa `found.add(aid)`. Senza quella informazione i falsi positivi di questo elenco (per esempio lo zucchero semolato che diventa glutine) sono invisibili all'utente: vede la crocetta e non ha modo di risalire allo zucchero.
- **proposta**: Restituire anche una mappa allergene -> ingredienti che l'hanno prodotto ({ latte: ['burro','panna'] }), riempita a riga 390 dove si conosce già sia l'ingrediente sia la chiave che ha matchato. Nella scheda usarla come tooltip e testo del title sulla crocetta ("Latte: burro, panna"), che è anche il modo più rapido per far scoprire al negozio i pattern sbagliati.

### BASSA · libreria riga 96 · correttezza
**"farina riso" senza il "di" torna glutine**

- **perché**: Gli override delle farine senza glutine sono un trucco che funziona solo sulla scrittura esatta con il "di". Chi inserisce le ricette il "di" lo salta spesso, e in quel caso la farina di riso diventa glutine: l'opposto di quello che il commento a riga 92-95 dice di voler ottenere.
- **prova addotta**: allergeni.js:96-103 e il commento alle righe 92-95 spiegano che le chiavi più lunghe consumano il range della chiave 'farina'. Verificato: "farina di riso" -> [] ma "farina riso" -> ["glutine"]; "farina di cocco" -> [] ma "farina cocco" -> ["glutine"]. Che quello stile di scrittura esista nei dati veri lo dimostra "pasta mandorla", presente fra i 123 mentre il mapping ha 'pasta di mandorle'.
- **proposta**: Rendere il "di" opzionale generando le varianti in automatico: per ogni chiave che contiene " di ", registrare anche la versione senza. Da fare una volta sola all'inizializzazione del modulo, così le due liste non possono più andare fuori sincrono. In più aggiungere le forme al singolare e al plurale del complemento ('farina mandorla' e 'farina mandorle').

### BASSA · libreria riga 204 · correttezza
**Le castagne sono dichiarate frutta a guscio, ma non sono fra i 14**

- **perché**: L'Allegato II del 1169/2011 elenca mandorle, nocciole, noci, anacardi, pecan, noci del Brasile, pistacchi e macadamia: le castagne non ci sono. Dichiararle è una sovra-dichiarazione, e come tutte le sovra-dichiarazioni fa passare il documento per approssimativo. Nel caso specifico la mappa si contraddice anche da sola.
- **prova addotta**: allergeni.js:204-206 'castagna', 'castagne' e 'farina di castagne' -> ['fruttasc']. Nei dati veri i nomi usati sono "crema marroni" e "marrone a pezzi", che per fortuna non matchano e restituiscono []. Quindi la stessa mappa dichiara le castagne quando le trova scritte castagne e non le dichiara quando si chiamano marroni: due risposte diverse per lo stesso ingrediente.
- **proposta**: Togliere castagna, castagne e farina di castagne dai pattern con allergene e metterle fra i riconosciuti-sicuri (mapping a []), come è già stato fatto per farina di cocco. Cocco e semi di papavero, che pure non sono fra i 14, sono già gestiti bene: "cocco", "cocco rapé" e "semi papavero" restituiscono [] correttamente. Se si vuole comunque avvertire, va detto come nota informativa e non come allergene di legge: "marroni e castagne non sono fra i 14 allergeni obbligatori".

### BASSA · vista riga 20 · correttezza
**La mappa degli allergeni è indicizzata per nome ricetta**

- **perché**: Due ricette con lo stesso nome si sovrascrivono, e la prima riga finisce per mostrare gli allergeni della seconda. È raro ma è il tipo di errore che nessuno nota, perché la tabella resta piena e credibile.
- **prova addotta**: SchedaAllergeniView.jsx:20 `m[r.nome] = new Set(eff)` costruisce la mappa sulla stringa nome, mentre le ricette arrivano da `Object.values` (riga 13), quindi da chiavi che possono essere diverse dal nome: che chiave e nome possano divergere è assunto anche da foodcost.js:939-940, che per trovare un semilavorato confronta sia `k` sia `r.nome`. Anche il React key a riga 127 e 128 usa r.nome, quindi due omonime generano chiavi duplicate.
- **proposta**: Indicizzare per la chiave dell'oggetto: usare `Object.entries(ricettario.ricette)` e portare avanti la chiave, poi `m[chiave]` e `key={chiave}` sia nella tabella sia nel ciclo del PDF (riga 58). Il nome resta quello mostrato a schermo.


---

## Pagina /Users/aler/foodos/src/views/SchedaAllergeniView.jsx — impagina — 23 sostenuti

### ALTA · vista riga 139 · sicurezza
**La casella vuota dichiara "Senza <allergene>" a chi usa il lettore di schermo**

- **perché**: La casella e' vuota anche solo perche' il riconoscimento non ha trovato niente, non perche' l'allergene non c'e'. Detto ad alta voce diventa un'affermazione: "senza latte". E' esattamente il falso negativo che deve mandare qualcuno in ospedale.
- **prova addotta**: Riga 139: `<span aria-label={`Senza ${a.label}`} ...>` sulla cella non piena. La riga 19 dice da dove viene il dato: `const eff = salvati.length ? salvati : detectAllergeniFromIngredienti(r.ingredienti || [])`. Sui 123 ingredienti veri (/tmp/audit-allergeni/prova-riconoscimento.txt) 81 non producono nessun allergene, fra cui "base bianca" (contiene latte), tutta la famiglia del cioccolato (lecitina di soia), "amaretto" (mandorle), "lievito chimico" (amido di frumento). Una ricetta con base bianca e cioccolato oggi viene letta come "Senza latte, senza soia, senza frutta a guscio".
- **proposta**: Tre stati, non due: PIENA = contiene, VUOTA = verificato, non contiene, TERZO STATO = da verificare (ingrediente che il riconoscimento non sa leggere). L'aria-label della casella vuota deve dire "Nessun <allergene> rilevato: da verificare" fino a quando una persona non conferma. Nessuna cella deve mai dire "Senza" per default.

### ALTA · vista riga 132 · sicurezza
**Allergeni confermati a mano e allergeni indovinati sono disegnati identici**

- **perché**: Chi espone la scheda non ha modo di sapere quali righe ha controllato una persona e quali sono uscite da un confronto di stringhe. Un documento di legge in cui il dato certo e la supposizione hanno lo stesso aspetto e' un documento che non si puo' firmare.
- **prova addotta**: Righe 18-19 scelgono fra salvati e auto-detect, poi le righe 132-143 disegnano lo stesso quadratino in entrambi i casi. Non esiste in tutta la pagina un solo riferimento a `r.allergeni` dopo la riga 18: l'informazione "questa riga e' una stima" viene buttata via subito.
- **proposta**: Tenere in algMap anche l'origine (`fonte: 'confermata' | 'stimata'`), disegnare le righe stimate con un contorno tratteggiato piu' una colonna "Stato" con "Da verificare", e mettere in testa alla pagina il conto: "38 ricette su 214 non sono ancora state verificate". Su chi non e' verificato l'export PDF deve stampare la dicitura, non un vuoto.

### ALTA · vista riga 19 · sicurezza
**Gli allergeni salvati sostituiscono il riconoscimento invece di sommarsi**

- **perché**: Il campo `allergeni` e' una fotografia scattata al salvataggio. Se domani si aggiunge il pattern "cioccolato -> soia", tutte le ricette che hanno la fotografia continuano a mostrare il vecchio risultato per sempre: correggere la libreria non corregge la scheda. E la stessa ricetta mostra piu' allergeni nella sua schermata di modifica che nel documento esposto al pubblico.
- **prova addotta**: Riga 19: `const eff = salvati.length ? salvati : detect(...)`. NuovaRicettaView.jsx:105 fa l'opposto: `mergeAllergeni(autoAllergeni, form.allergeniManual)`; NuovaRicettaView.jsx:226 salva quel risultato come `allergeni`. La libreria esporta `mergeAllergeni` proprio per questo caso e la riga 6 della scheda non la importa.
- **proposta**: `const eff = mergeAllergeni(detectAllergeniFromIngredienti(r.ingredienti||[]), salvati)`: il riconoscimento gira sempre e il salvato aggiunge, non toglie. Se serve permettere a una persona di negare un allergene rilevato, servira' un campo esplicito `allergeniEsclusi` con nome di chi ha escluso e data, non un array che silenziosamente vince su tutto.

### ALTA · vista riga 139 · colore
**La casella vuota e' invisibile: 1,25:1 di contrasto**

- **perché**: La griglia funziona solo se si distingue una casella vuota da un buco. A 1,25:1 dietro il banco, con luce di taglio sul vetro, non si vede: e chi legge ha sessant'anni. Il rischio concreto e' leggere una riga sbagliata e dire al cliente che un dolce e' senza nocciole.
- **prova addotta**: Riga 139: bordo `#E8E0DC` su fondo `#FAFAFA`. Contrasto calcolato: 1,25:1 (serve almeno 3:1 per un bordo che porta informazione). Peggio: il fondo `#FAFAFA` della casella contro la riga zebra `#FDFAF8` (riga 128) fa 1,00:1, cioe' zero.
- **proposta**: Bordo della casella vuota almeno #C9CFD8 (circa 3,2:1 sul bianco) e fondo trasparente, cosi' la zebra si vede sotto. Meglio ancora: sostituire la casella vuota con un trattino visibile (Icon `minus`) allineato al centro, cosi' l'informazione non dipende da un bordo di 1px.

### ALTA · vista riga 121 · tipografia
**Le intestazioni delle colonne sono tagliate a 8 caratteri, sempre, anche quando c'e' spazio**

- **perché**: "Frutta …" non e' il nome di un allergene: sul documento previsto dal Reg. UE 1169/2011 la colonna deve dire "Frutta a guscio". "Frutta …" si puo' leggere anche come frutta secca (che sta sotto i solfiti) e il taglio non serve a niente perche' lo spazio c'e'.
- **prova addotta**: Riga 121: `a.label.length>8?a.label.substring(0,7)+"…":a.label`. Provato sui 14 label veri: "Crostac…", "Frutta …" (con lo spazio prima dei puntini), "Mollusc…". La tabella ha `width:"100%"` (riga 115) dentro un `maxWidth:1200` (riga 90): su desktop restano circa 75px per colonna, piu' che sufficienti per "Crostacei" a 9,5px. Il nome intero sta solo nel `title` (riga 120), che sul touch non si apre.
- **proposta**: Niente troncamento: nome intero su due righe (`lineHeight:1.15`, il `whiteSpace:"normal"` c'e' gia'), oppure intestazione ruotata di 90 gradi sul desktop. Se in un caso estremo va abbreviato, usare abbreviazioni decise a mano e leggibili ("Frutta a guscio" -> "Fr. guscio"), mai `substring`.

### ALTA · vista riga 120 · tipografia
**Cinque testi sotto i 12px, e il piu' piccolo e' quello che nomina gli allergeni**

- **perché**: Regola del progetto: niente sotto i 12px. Qui la gerarchia e' rovesciata: la cosa piu' importante della pagina (quale allergene e' quale colonna) e' scritta piu' piccola di tutto il resto, e il disclaimer legale e' a 11px.
- **prova addotta**: Riga 93 fontSize 10 ("Sicurezza alimentare"), riga 118 fontSize 10 ("Ricetta"), riga 120 fontSize 9,5 (le 14 intestazioni allergene), riga 151 fontSize 11 (tutto il disclaimer). Nel PDF (righe 37, 50, 59, 83) si scende a 6-7pt.
- **proposta**: Intestazioni allergene a 12px minimo (13px su desktop) accettando due righe di altezza; occhiello e "Ricetta" a 12px; disclaimer a 13px. Nel PDF non scendere sotto 8pt per le colonne e 8pt per il disclaimer: e' un foglio che viene appeso e letto da lontano.

### ALTA · vista riga 137 · struttura
**Il segno di spunta e' un carattere tipografico, non il componente Icon**

- **perché**: Regola del progetto: mai caratteri come icone, si usa Icon (SVG). Qui non e' formale: nel PDF quel carattere non viene stampato affatto, quindi il documento consegnato al cliente perde il segno.
- **prova addotta**: Riga 137 `>✓</span>` (fontWeight 900, fontSize 13) e riga 68 `doc.text('✓', ...)`. Icon ha gia' `check` (`Icon.jsx:73`) e viene usato correttamente due righe sopra e sotto (`Icon name="fileText"` riga 98, `Icon name="warning"` riga 152). Provato con la jspdf del progetto: '✓' finisce nel content stream come byte 0x13 con font helvetica/WinAnsiEncoding, che non ha glifo -> nel PDF i riquadri rossi escono vuoti.
- **proposta**: Nella UI `<Icon name="check" size={16} />` dentro la casella. Nel PDF disegnare il segno a vettori (due `doc.line`) oppure riempire il riquadro e scrivere una lettera che esiste nel font; e comunque aggiungere una legenda "riquadro pieno = contiene" su ogni pagina.

### ALTA · vista riga 76 · correttezza
**Il PDF ripete i nomi degli allergeni solo a pagina 1**

- **perché**: Dalla seconda pagina in poi ci sono 14 colonne senza titolo. Su un documento che il cliente legge da solo, senza nessuno accanto, sono colonne mute: e' come non averle.
- **prova addotta**: Righe 76-79: `if (y > doc.internal.pageSize.getHeight() - 14) { doc.addPage(); y = 14 }`. Nessuna ristampa della riga costruita alle righe 50-56. In A4 orizzontale (210mm di altezza) con `rowH = 8` (riga 30) stanno circa 21 righe per pagina: con 200 ricette 9 pagine su 10 sono senza intestazione. Manca anche la ripetizione del titolo e del disclaimer (righe 82-85, stampati una volta sola in fondo).
- **proposta**: Estrarre `disegnaIntestazione(doc, y)` e chiamarla dopo ogni `addPage()`, insieme a titolo, riferimento normativo e numero di pagina ("Pagina 2 di 10"). Il disclaimer va in fondo a ogni pagina, non solo all'ultima.

### MEDIA · vista riga 114 · struttura
**Con 200 ricette si scrolla e le intestazioni delle colonne spariscono**

- **perché**: La prima colonna e' stata resa fissa per non perdere il contesto scorrendo di lato (lo dice il commento alle righe 108-113), ma il problema simmetrico e' peggiore: scorrendo in basso di 200 righe non si sa piu' quale colonna e' il glutine e quale il sesamo, e sono 14 quadratini identici.
- **prova addotta**: Riga 114: contenitore `overflow:"auto"` senza `maxHeight`, quindi cresce fino all'altezza del contenuto e lo scroll verticale e' quello della finestra. Il `<thead>` (riga 116) non ha `position:"sticky"`; l'unico sticky e' la prima colonna (righe 118 e 129). Con 200 righe da circa 42px la tabella e' alta circa 8.400px.
- **proposta**: Dare al contenitore un `maxHeight` (per esempio `calc(100vh - 260px)`) e mettere `position:"sticky", top:0` sul `<thead>`, con la prima cella `left:0, top:0, zIndex:3`. Cosi' funzionano insieme colonna fissa e riga fissa.

### MEDIA · vista riga 127 · utilita
**Nessun modo di cercare, filtrare o ordinare: la scheda risponde alla domanda sbagliata**

- **perché**: La domanda vera al banco e' una sola: "mia figlia e' celiaca, cosa puo' prendere?". Questa pagina risponde solo a "cosa contiene questa torta", e solo se si trova la riga a occhio in un elenco non ordinato.
- **prova addotta**: Riga 13: `Object.values(ricettario?.ricette||{}).filter(...)` senza nessun `sort` (l'ordine e' quello di import da Excel). Righe 127-145: nessun campo di ricerca, nessun click sulle intestazioni, nessun filtro. In tutta la pagina non compare mai un conteggio delle ricette.
- **proposta**: Sopra la tabella: un campo di ricerca sul nome, l'ordinamento alfabetico per default, e 14 pulsanti allergene che filtrano al contrario ("mostra solo le ricette SENZA glutine"), con l'avvertenza che le righe non verificate restano fuori dall'elenco "senza". In testa il conto: "214 ricette, 176 verificate".

### MEDIA · vista riga 115 · utilita
**Non c'e' nessuna legenda: non e' scritto da nessuna parte cosa significa la casella piena**

- **perché**: Una griglia di quadratini colorati senza legenda si interpreta a intuito. Un dipendente nuovo puo' leggere la casella vuota come "non ancora controllato" e la piena come "controllato", cioe' il contrario esatto. Su questa pagina l'ambiguita' e' pericolosa.
- **prova addotta**: Fra la riga 100 (fine intestazione) e la riga 115 (tabella) non c'e' nulla. L'unica spiegazione e' nel `title`/`aria-label` delle celle (righe 137 e 139), che si vede solo passando il mouse su una cella alla volta e sul touch non si vede mai.
- **proposta**: Una riga di legenda sopra la tabella, a 13px: quadratino pieno + "contiene", quadratino vuoto + "non contiene", quadratino tratteggiato + "da verificare". La stessa legenda va ripetuta nel PDF su ogni pagina.

### MEDIA · vista riga 115 · mobile
**Su telefono si vedono 4 colonne su 14 e la pagina non ha un solo breakpoint**

- **perché**: Regola permanente del progetto: ogni modifica va curata anche su mobile e tablet. Questa pagina e' pensata solo per il desktop, e il telefono e' proprio il posto dove il dipendente la apre quando un cliente chiede se c'e' la frutta a guscio.
- **prova addotta**: Riga 11: la view riceve solo `ricettario` e `tipoAttivita`, `useIsMobile` non e' mai importato e in 158 righe non c'e' un solo breakpoint. Riga 115: `minWidth: 140 + ALLERGENI.length * 52` = 868px. Su iPhone (375px meno il padding del Dashboard) restano circa 200px per gli allergeni, cioe' meno di 4 colonne su 14: per leggere una riga intera servono quattro scorrimenti laterali con il rischio di sbagliare riga.
- **proposta**: Sotto i 768px cambiare forma, non stringere: una scheda per ricetta con il nome per intero e l'elenco a righe degli allergeni presenti ("Contiene: glutine, uova, latte") piu' l'eventuale "Da verificare: ...". La griglia a 14 colonne resta da tablet in su.

### MEDIA · vista riga 129 · mobile
**Il nome della ricetta e' tagliato a circa 18 caratteri e sul touch non si puo' leggere per intero**

- **perché**: Su un documento di legge la riga deve identificare il prodotto. "TORTA DI NOCCIOLE E CIOCC…" non identifica niente, e se in ricettario ci sono due varianti che iniziano uguale diventano indistinguibili.
- **prova addotta**: Riga 129: `minWidth:140, maxWidth:140, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"` con `fontSize:12` grassetto: dentro 120px utili (140 meno 20 di padding) stanno circa 18 caratteri. Il nome intero e' solo nel `title` della stessa riga, che su telefono e tablet non si apre.
- **proposta**: Togliere il `nowrap` e lasciare andare a capo su due righe (la colonna resta a 140-180px, la riga cresce), oppure allargare la prima colonna a 200px su desktop. Il `title` va tenuto in aggiunta, non come unico modo di leggere il dato.

### MEDIA · vista riga 96 · correttezza
**Il pulsante Esporta PDF non si blocca, non dice niente e non gestisce l'errore**

- **perché**: Convenzione del progetto: i bottoni async vanno `disabled` durante l'attesa. Qui il click importa jspdf dalla rete e cicla su tutte le ricette: doppio tap fa due PDF, e se il pacchetto non si carica (rete lenta in laboratorio) non succede assolutamente nulla e nessuno capisce perche'.
- **prova addotta**: Riga 25 `const esportaPDF = async () => {` con `await import('jspdf')` alla riga 26; riga 96 `<button onClick={esportaPDF}` senza `disabled`, senza stato di attesa, senza try/catch. La view non riceve nemmeno `notify` (riga 11), quindi oggi non ha modo di segnalare un errore.
- **proposta**: Uno stato `esportando`: `disabled={esportando}`, etichetta "Sto preparando il PDF…", try/catch con `notify('Non riesco a generare il PDF, riprova', false)`. Passare `notify` come prop dal Dashboard (riga 3369) come fanno le altre view.

### MEDIA · vista riga 34 · sicurezza
**Il PDF non dice di quale locale e', la pagina non dice di quando e'**

- **perché**: Una scheda allergeni consegnata al cliente senza il nome del locale non e' riferibile a nessuno; una scheda a schermo senza data non dice se e' aggiornata alla ricetta di oggi o a quella di due anni fa. E il PDF, che e' la copia che il cliente si porta via, ha il disclaimer piu' povero di quello a schermo.
- **prova addotta**: Righe 34-41: nel PDF solo "Scheda Allergeni" e il riferimento normativo, nessun nome o indirizzo (la view alla riga 11 non riceve nemmeno l'organization). Riga 85: la data c'e' solo nel PDF; a schermo (righe 91-100) non compare da nessuna parte. Riga 84 (PDF): "possono variare in base ai fornitori. Verificare sempre le etichette" — manca la contaminazione crociata che la UI invece scrive (riga 152).
- **proposta**: Passare nome del locale e sede alla view e stamparli in testa al PDF con data e ora di generazione; mostrare a schermo "Aggiornata al <data>" accanto al titolo; usare per PDF e UI lo stesso testo di disclaimer, tenuto in una costante unica.

### MEDIA · vista riga 151 · struttura
**Il disclaimer e' in fondo, dopo duemila pixel di tabella**

- **perché**: E' l'unica frase che rende onesta la tabella ("le informazioni sono indicative", "contaminazione crociata"). Metterla sotto significa che nessuno la legge: con 200 ricette e' a circa 8.000px dal titolo.
- **prova addotta**: Riga 151: il blocco arriva dopo la chiusura della tabella (riga 148). La tabella non ha `maxHeight` (riga 114), quindi cresce quanto le ricette: 200 righe da circa 42px.
- **proposta**: Spostare sopra la tabella una versione breve e leggibile ("Le informazioni sono indicative: verifica sempre le etichette dei fornitori. In laboratorio c'e' contaminazione crociata.") e lasciare sotto il testo completo con l'articolo di legge.

### MEDIA · vista riga 137 · colore
**Il colore d'allarme e' su tutta la tabella e non c'e' dove serve**

- **perché**: Regola del progetto: il colore d'allarme solo dove c'e' davvero qualcosa da fare. Che una torta contenga latte e uova non e' un problema, e' normale. Invece la cosa da fare (le righe che nessuno ha verificato) non ha nessun colore. La tabella grida dove e' tutto a posto e tace dove c'e' un rischio.
- **prova addotta**: Riga 137: 14 tinte forti diverse, fra cui il rosso pieno `#DC2626` per i crostacei e `#9F1239` per i solfiti (ALLERGENE_COLORS in allergeni.js). Ogni colonna e' gia' un solo allergene, quindi il colore non distingue niente che il titolo di colonna non dica: e' decorazione. In parallelo la riga 151 spende l'unico riquadro ambra su un testo fisso che c'e' sempre.
- **proposta**: Un solo colore neutro-scuro per "contiene" (il segno e il bordo bastano a leggere la griglia), e riservare l'ambra alle righe da verificare e al conteggio in testa alla pagina ("38 ricette da verificare"). Se si vuole tenere una distinzione di colore, limitarla ai tre-quattro allergeni piu' gravi.

### MEDIA · vista riga 137 · accessibilita
**Il nome accessibile delle celle sta su uno span senza ruolo: il lettore di schermo puo' non leggere niente**

- **perché**: Su un elemento generico l'aria-label non e' garantito: molti lettori di schermo lo ignorano perche' lo span non ha un ruolo. Nel caso peggiore chi non vede sente 14 celle vuote di fila, cioe' una scheda allergeni completamente muta.
- **prova addotta**: Righe 137 e 139: `<span aria-label=...>` senza `role`. Inoltre la tabella (righe 115-147) non ha `<caption>`, i `<th>` non hanno `scope="col"` e il nome della ricetta e' un `<td>` (riga 129) invece di `<th scope="row">`: manca l'aggancio riga/colonna su cui i lettori di schermo si basano per dire "Sacher, glutine, contiene".
- **proposta**: `role="img"` sugli span (o meglio: testo nascosto visivamente dentro la cella), `<caption>` con "Allergeni per ricetta", `scope="col"` su tutte le intestazioni e `<th scope="row">` sul nome ricetta. Il nome accessibile della colonna deve essere il nome intero dell'allergene, non "Frutta …".

### MEDIA · vista riga 93 · accessibilita
**La pagina non ha ne' un titolo ne' un solo elemento di intestazione**

- **perché**: Con il lettore di schermo si naviga per intestazioni: qui non ce n'e' nessuna e non c'e' scritto in nessun punto "Scheda allergeni". Il PDF esportato ha un titolo, la pagina no.
- **prova addotta**: In tutte le 158 righe non compare nessun `<h1>`/`<h2>`/`<h3>` (verificato con grep). L'unica cosa in testa e' un occhiello a 10px "Sicurezza alimentare" (riga 93) e un `<p>` a 13px (riga 94).
- **proposta**: `<h1>Scheda allergeni</h1>` a 20-22px con l'occhiello sopra, e la frase esplicativa come `<p>` sotto. Da qui poi si prende anche il titolo del PDF, cosi' i due documenti si chiamano allo stesso modo.

### MEDIA · vista riga 94 · copy
**"Panoramica degli allergeni per tutte le piatti": il plurale non si accorda**

- **perché**: E' la prima frase della pagina. "tutte le piatti" e' italiano rotto e si vede subito. In piu' per le gelaterie la pagina dice "ricette" mentre tutto il resto dell'app dice "gusti": sembrano due programmi diversi.
- **prova addotta**: Riga 94: `Panoramica degli allergeni per tutte le {LEX.ricette} - Regolamento UE 1169/2011`. In lessico.js il ristorante ha `ricette: 'piatti'` (riga 60) -> "tutte le piatti"; la gelateria non sostituisce `ricette` (righe 44-48) quindi resta "ricette" anche se `Ricettario` diventa "Ricettario gusti". Anche "Panoramica" e "per visualizzare la scheda" (riga 104) sono modi di dire da programma, non da pasticceria.
- **proposta**: Frase senza concordanze da indovinare: "Gli allergeni di tutto il {LEX.Ricettario.toLowerCase()}, come previsto dal Regolamento UE 1169/2011". Nell'empty-state: "Qui compare la scheda quando in {LEX.Ricettario} c'e' almeno una {LEX.ricetta}".

### MEDIA · vista riga 152 · copy
**"Disclaimer:" in inglese sul pezzo piu' importante della pagina**

- **perché**: Copy in italiano umano, mai gergo. Chi legge ha sessant'anni e questa e' l'unica frase che spiega perche' la tabella va verificata: se la prima parola e' inglese, la frase la salta.
- **prova addotta**: Riga 152: `<strong ...><Icon name="warning" size={13} />Disclaimer:</strong> Le informazioni sugli allergeni sono indicative e si basano sulle ricette inserite...`. Segue "contaminazione crociata durante la produzione" e "aggiornare la scheda ad ogni modifica di ricetta o fornitore": un unico blocco di 45 parole a 11px, `lineHeight:1.7`.
- **proposta**: "Attenzione:" al posto di "Disclaimer:", e il testo spezzato in tre righe brevi: "Questa scheda si basa sulle ricette inserite. Gli ingredienti dei fornitori cambiano: controlla sempre le etichette. In laboratorio c'e' contaminazione crociata. Aggiorna la scheda ogni volta che cambi una ricetta o un fornitore." Il riferimento all'art. 21 in fondo, piu' piccolo ma non sotto i 12px.

### BASSA · vista riga 102 · copy
**Se in ricettario ci sono solo semilavorati la pagina dice che non c'e' nessuna ricetta**

- **perché**: L'utente ha caricato venti basi e legge "Nessuna ricetta caricata nel ricettario": pensa di aver perso i dati, o che l'import non sia andato. Il messaggio deve dire la verita', cioe' che quelle non vanno in scheda perche' non si vendono al banco.
- **prova addotta**: Riga 13 esclude `tipo!=="semilavorato"` e `tipo!=="interno"`; righe 102-105 mostrano `{LEX.nessunaRicetta} nel {LEX.Ricettario.toLowerCase()}. Aggiungi {LEX.ricette} con i loro allergeni per visualizzare la scheda.` senza distinguere "ricettario vuoto" da "ricettario con soli semilavorati".
- **proposta**: Due messaggi distinti: a ricettario vuoto quello attuale (riscritto), altrimenti "In {LEX.Ricettario} ci sono solo semilavorati e preparazioni interne: nella scheda allergeni finiscono solo i prodotti che vendi." Aggiungere in entrambi i casi un pulsante che porta al ricettario.

### BASSA · vista riga 13 · struttura
**Con 200 ricette la tabella si ricalcola per intero a ogni render: 55 ms misurati**

- **perché**: Il `useMemo` non memorizza niente perche' la sua dipendenza cambia identita' a ogni render. Ogni toast, ogni cambio sede, ogni render del Dashboard rifa' il riconoscimento su tutte le ricette e ridisegna tremila celle: sul tablet del laboratorio si sente.
- **prova addotta**: Riga 13: `const ricette = Object.values(...).filter(...)` fuori da `useMemo`, quindi array nuovo a ogni render; riga 23: `}, [ricette])`. Misurato con node sui pattern veri (275): 55 ms per 200 ricette da 10 ingredienti, 168 ms per 5 render, e la libreria rifa' il `sort` delle 275 chiavi a ogni chiamata. In piu' 200 righe x 15 celle = 3.000 nodi con oggetti style inline nuovi ogni volta, senza virtualizzazione.
- **proposta**: Avvolgere la riga 13 in `useMemo(..., [ricettario])` e cambiare la dipendenza della riga 23 di conseguenza. Estrarre la riga in un componente memoizzato e spostare gli oggetti style fuori dal ciclo. Il `sort` delle chiavi va calcolato una volta sola nella libreria.


---

## utilita — 14 sostenuti

### ALTA · libreria riga 528 · utilita
**Il terzo stato "da verificare" e' scritto nella libreria ma la pagina non lo usa**

- **perché**: La funzione che distingue "contiene" da "non lo so" esiste, funziona ed e' proprio quella che serve a non firmare un falso negativo. Ma nessuna vista la chiama, quindi in negozio la scheda continua a mostrare due soli stati: spunta rossa o casella vuota. Il cioccolato, la base bianca e il lievito chimico restano caselle vuote identiche all'acqua.
- **prova addotta**: grep su tutto src/ per analizzaAllergeni e ALLERGENI_PROBABILI: compaiono solo nella loro definizione (libreria righe 437 e 528) e nei test. La vista importa solo detectAllergeniFromIngredienti (vista riga 6) e la usa a riga 19. Provato con node importando la libreria vera: "base bianca" da' daVerificare=latte, "cioccolato callebaut" soia+latte, "amaretto" fruttasc, "lievito chimico" glutine, "neutro" latte+soia. Tutta roba che oggi sullo schermo non si vede.
- **proposta**: Nella vista sostituire la riga 19 con analizzaAllergeni(r.ingredienti) e disegnare tre celle diverse: piena "contiene", tratteggiata "da verificare in etichetta", vuota "non contiene", con legenda sopra la tabella e la stessa distinzione nel PDF. Costa poco: 3-4 ore, la logica c'e' gia'. Vale tantissimo: e' il motivo per cui la pagina esiste.

### ALTA · vista riga 115 · utilita
**Manca il verso opposto: non si puo' partire dall'allergene**

- **perché**: La domanda vera al banco e' "cosa posso dare a chi non tollera il glutine?". Con la tabella prodotti per allergeni bisogna leggere a occhio una colonna stretta su tutte le righe, con i nomi dei prodotti tagliati. E' lento e si sbaglia proprio dove sbagliare costa un ricovero.
- **prova addotta**: La tabella (righe 115-147) e' fissa: nel componente non c'e' nessun useState, solo due useMemo (righe 12 e 15). Niente filtro, niente ricerca, niente selezione dell'allergene. Le colonne allergene sono minWidth 48 (riga 120) con etichetta tagliata a 7 caratteri (riga 121), e il nome prodotto e' nowrap con ellipsis (riga 129).
- **proposta**: Sopra la tabella una riga sola: "Chi e' intollerante a [Glutine v]" e sotto due elenchi, "Puoi proporre" e "Non proporre". Nel primo solo i prodotti con zero allergeni certi, zero da verificare e zero ingredienti non riconosciuti; tutto il resto nel secondo, con scritto il motivo accanto. Costa medio: circa un giorno. Vale tantissimo: e' la domanda di ogni giorno, e oggi la pagina non la risponde.

### ALTA · vista riga 11 · utilita
**Da questa pagina non si corregge niente, e un falso positivo non si toglie da nessuna parte**

- **perché**: Chi vede una casella sbagliata deve ricordarsi il nome, uscire, andare nel ricettario, aprire la ricetta. E se l'errore e' un allergene di troppo messo dal riconoscimento automatico, non lo puo' togliere nemmeno la': l'editor sa solo aggiungere. Quindi la scheda che si consegna al cliente contiene errori che il locale non ha modo di correggere.
- **prova addotta**: vista riga 11: le props sono solo { ricettario, tipoAttivita }. Dashboard.jsx riga 3369 non passa altro, mentre alla riga 3364 RicettarioView riceve gia' onEditRicetta e alla 3374 HaccpView riceve nomeAttivita e notify. Nell'editor NuovaRicettaView riga 105: mergeAllergeni(autoAllergeni, form.allergeniManual), cioe' unione, il manuale solo aggiunge. Provato sui nomi veri del database: "pasta caramello" da' glutine, "pasta di anacardi" da' fruttasc + glutine, "pasta gianduiotto" da' glutine (dal pattern "pasta", libreria riga 69). Tre glutine inesistenti e nessun modo di cancellarli.
- **proposta**: Due cose. Click sulla riga che apre la ricetta, riusando lo stesso onEditRicetta che il Dashboard passa gia' al ricettario: mezz'ora. E nell'editor una terza lista "esclusi a mano" con obbligo di scrivere il motivo (per esempio "la pasta caramello non contiene farina, etichetta del 09/09/2026"), salvata su un campo allergeniEsclusi che la vista rispetta: mezza giornata. Vale tantissimo.

### ALTA · vista riga 15 · utilita
**Non si distingue un allergene confermato a mano da uno indovinato**

- **perché**: Su un documento che ha valore legale conta chi ha verificato e quando. Oggi una spunta letta sull'etichetta dalla titolare e una spunta messa da un pattern sul nome hanno esattamente lo stesso aspetto, sullo schermo e sul PDF. Nessuno sa piu' cosa e' stato controllato davvero.
- **prova addotta**: vista righe 15-23: gli allergeni salvati e quelli riconosciuti finiscono nello stesso Set senza distinzione (riga 19), e la cella (righe 136-140) e' identica nei due casi. La provenienza non e' nemmeno salvata: NuovaRicettaView riga 188 la ricostruisce per sottrazione, manual = r.allergeni.filter(a => !auto.includes(a)), quindi un allergene confermato a mano che coincide con quello automatico torna a essere automatico. Nella forma dati della ricetta non esiste nessun campo di verifica.
- **proposta**: Due campi nuovi sulla ricetta, allergeniVerificatoIl e allergeniVerificatoDa, scritti quando si salva dall'editor. In tabella una colonna "Verificata" con la data in formato italiano o la scritta "Mai verificata", e la stessa riga nel PDF. Costa medio: un giorno compreso il riempimento dei campi sulle ricette esistenti. Vale tantissimo: e' la prima cosa che chiede un controllo, e l'unica difesa se un cliente contesta.

### ALTA · vista riga 152 · utilita
**Cambio fornitore: la pagina lo raccomanda e non lo aiuta a fare**

- **perché**: Quando cambia il fornitore della base bianca o del cioccolato, cambiano gli allergeni di tutti i gusti che li usano. La pagina scrive nel disclaimer di aggiornare la scheda, ma non nomina un solo ingrediente: non si sa quali prodotti toccare, e bisogna riaprire una per una tutte le ricette.
- **prova addotta**: Il disclaimer (riga 152) dice "aggiornare la scheda ad ogni modifica di ricetta o fornitore". La tabella (righe 115-147) ha per riga il nome del prodotto e per colonna l'allergene: la parola ingrediente non compare da nessuna parte nella vista. Sui 123 ingredienti veri del database, "base bianca", "cioccolato callebaut", "massa 58" e "neutro" tornano in piu' gusti ciascuno.
- **proposta**: Sotto la tabella una seconda sezione "Ingredienti": una riga per ingrediente (sono 123 in tutto), i suoi allergeni, se vengono dall'etichetta o dal riconoscimento, "usato in N prodotti", e un posto dove segnare cosa dice l'etichetta nuova. Quello che si scrive sull'ingrediente vale per tutti i prodotti che lo usano. Costa tanto: 2-3 giorni, serve una chiave di salvataggio nuova accanto a ingredienti_costi. Vale tantissimo: e' l'unico modo perche' la scheda sia ancora vera fra sei mesi.

### ALTA · vista riga 19 · utilita
**La scheda non guarda dentro i semilavorati**

- **perché**: In pasticceria gli ingredienti di una torta sono spesso altre ricette: la crema pasticcera, la ganache, la frolla. Se il programma legge solo il nome e non entra nella ricetta, il latte e le uova della crema non arrivano nella scheda della torta. E' un falso negativo prodotto dal modo in cui il locale lavora normalmente.
- **prova addotta**: vista riga 19 passa al riconoscimento i soli nomi degli ingredienti. Che un ingrediente sia una ricetta e' normale: demoSeedFull.js riga 142, CROSTATA ALBICOCCA ha { nome: 'PASTA FROLLA', qty1stampo: 450 }, e "pasta frolla" e' anche fra i 123 ingredienti veri. Funziona per caso, perche' "pasta frolla" e' anche un pattern (libreria riga 71). Provato con gli altri semilavorati di default (foodcost.js righe 698-701): CREMA PASTICCERA, GANACHE VEGANA e FRUIT PER CROSTATE danno zero allergeni, mentre la ricetta CREMA PASTICCERA contiene latte, tuorlo e farina_00 (demoSeedFull righe 116-123), cioe' latte, uova e glutine. Il food cost la ricorsione la fa (foodcost.js righe 862 e 938, tre livelli con controllo dei cicli); la scheda allergeni no.
- **proposta**: Prima di riconoscere il nome, controllare se quel nome e' una ricetta del ricettario: in quel caso prendere i suoi allergeni (salvati o riconosciuti) e scendere, con lo stesso schema a tre livelli che usa il food cost. Costa medio: mezza giornata. Vale tantissimo, e' un falso negativo puro.

### ALTA · vista riga 19 · utilita
**Una ricetta senza ingredienti risulta priva di tutti i 14 allergeni**

- **perché**: Un prodotto di cui il programma non sa niente viene stampato sul documento che si consegna al cliente come senza glutine, senza latte e senza frutta a guscio. E' il caso peggiore possibile su questa pagina: silenzio scambiato per garanzia.
- **prova addotta**: vista riga 19: detectAllergeniFromIngredienti(r.ingredienti || []) su una lista vuota restituisce [] (libreria righe 368-369). Con l'insieme vuoto la riga 133 e' falsa 14 volte su 14 e la riga 139 disegna 14 caselle vuote, le stesse di un prodotto verificato. Capita: NuovaRicettaView righe 340 e 474 salvano ricette costruite da foto e da OCR, dove la lista ingredienti puo' restare corta o vuota.
- **proposta**: Se la ricetta non ha ingredienti non entra in tabella con la riga tutta bianca: finisce in un riquadro in cima, "3 prodotti senza ingredienti: di questi non sappiamo dire niente. Completa la ricetta", con il link per aprirli. E nel PDF non ci va per niente. Costa poco: 2 ore. Vale tantissimo.

### ALTA · vista riga 25 · utilita
**Il PDF non e' un documento che si possa esporre o consegnare**

- **perché**: E' l'unica cosa della pagina che esce dal negozio e finisce in mano al cliente o a un controllo. Cosi' com'e' non dice di chi e', non dice a quando e' aggiornato, non spiega i simboli, e dalla seconda pagina non si capisce quale colonna sia quale.
- **prova addotta**: vista righe 25-87. Intestazione (righe 34-39): solo "Scheda Allergeni" e il regolamento, nessun nome di attivita' ne' sede; il nome c'e' ed e' a portata di mano, Dashboard riga 3374 passa nomeAttivita a HaccpView, la riga 3369 alla scheda allergeni non passa nulla. Riga 85: stampa "Generato il", cioe' quando si e' premuto il bottone, non da quando i dati sono verificati. Nessuna legenda: il quadrato rosso (righe 65-68) non e' spiegato e il quadrato vuoto (riga 71) vale sia per "non contiene" sia per "non lo so". Righe 76-79: al cambio pagina si azzera solo y, i nomi degli allergeni (righe 50-55) non vengono ridisegnati. Caratteri da 6 e 7 punti (righe 50, 59, 83), nomi tagliati a 17 caratteri (riga 60).
- **proposta**: Intestazione con nome attivita' e indirizzo della sede, "Aggiornata al gg/mm/aaaa", legenda con i tre stati, intestazione ripetuta a ogni pagina, "Pagina 1 di 3", caratteri minimi 9 punti e nomi interi mandati a capo invece che troncati. Costa poco: mezza giornata. Vale molto.

### MEDIA · vista riga 127 · utilita
**Manca la scheda del singolo prodotto e il perche' di ogni spunta**

- **perché**: Chi risponde al telefono a chi ordina una torta, e chi scrive il cartellino in vetrina, ha bisogno del foglio di quel prodotto, non della tabella di tutto il negozio. E chi vede una spunta non sa quale ingrediente l'ha causata, quindi non puo' controllarla ne' contestarla.
- **prova addotta**: vista righe 127-145: la riga e' nome piu' 14 caselle, non e' cliccabile, non mostra gli ingredienti e non c'e' nessun pannello di dettaglio nel file (158 righe in tutto). Che serva vedere l'ingrediente responsabile lo dimostrano i casi veri: il glutine di "pasta caramello" e di "pasta di anacardi" arriva dal pattern "pasta" (libreria riga 69), e dalla tabella e' impossibile accorgersene.
- **proposta**: Click sulla riga: si apre un pannello con gli ingredienti del prodotto e accanto a ognuno gli allergeni che porta, con scritto se sono certi o da verificare, piu' un bottone "Stampa la scheda di questo prodotto" in A5 con caratteri grandi. Costa medio: un giorno. Vale molto, ed e' quello che rende verificabile tutto il resto della pagina.

### MEDIA · vista riga 13 · utilita
**La scheda copre solo il ricettario, non tutto quello che si vende**

- **perché**: L'informazione va data su tutto quello che si serve, non solo su quello che si impasta. Le brioche del fornitore, i coni e le cialde, la panna spray, le bibite, il latte di soia del caffe' sono proprio i casi dove l'allergene sta su un'etichetta che il locale non controlla, e nella scheda non hanno posto.
- **prova addotta**: vista riga 13: l'elenco nasce da Object.values(ricettario.ricette), quindi esiste solo cio' che e' ricetta. Sempre riga 13, il filtro guarda solo r.tipo, mentre il resto dell'app decide con getR (foodcost.js riga 716) dove REGOLE vince sul campo della ricetta ed e' scrivibile a runtime (Dashboard righe 1583 e 1965): un prodotto venduto a fette perche' la regola dice "fetta" ma rimasto con tipo "semilavorato" dentro la ricetta sparisce dalla scheda che si consegna al cliente.
- **proposta**: Per il filtro usare getR(nome, r).tipo, come fa isSemilavorato in foodcost.js riga 728: mezza giornata. E una sezione "Altri prodotti che vendiamo", nome piu' spunte manuali degli allergeni, salvata in una chiave sua e stampata nello stesso PDF: un giorno. Vale molto, e senza questo il documento e' incompleto per definizione.

### MEDIA · vista riga 152 · utilita
**Contaminazione crociata: c'e' la frase, non c'e' il dato**

- **perché**: In un laboratorio dove si lavorano mandorle e farina sullo stesso banco, "ma lo fate insieme alla frutta secca?" e' una domanda di tutti i giorni. La pagina la nomina in una frase generica uguale per tutti i locali e non tiene da nessuna parte la risposta di questo locale.
- **prova addotta**: vista riga 152: la contaminazione crociata compare solo dentro il testo del disclaimer, come stringa fissa. Nel componente non c'e' nessun dato ne' impostazione che dica quali allergeni sono presenti in laboratorio, e la vista riceve solo ricettario e tipoAttivita (riga 11).
- **proposta**: Una volta sola, nelle impostazioni, la lista degli allergeni lavorati in laboratorio. Poi in fondo al PDF una riga vera al posto della frase generica: "Nel nostro laboratorio si lavorano glutine, frutta a guscio, latte e uova: non possiamo escludere tracce". E nella vista per allergene i prodotti senza quell'allergene nella ricetta ma con tracce possibili tenuti separati da quelli sicuri. Costa poco: mezza giornata. Vale molto, ed e' la risposta onesta.

### MEDIA · vista riga 89 · utilita
**Niente ricerca e niente conteggi: non si sa quanto fidarsi della scheda**

- **perché**: Prima di stampare un documento da consegnare, la titolare deve sapere se e' pronto: quanti prodotti hanno gli allergeni confermati a mano e quanti sono solo indovinati. La pagina non le da' un numero. E con cento prodotti, rispondere al banco vuol dire scorrere a mano.
- **prova addotta**: vista righe 89-100: l'intestazione contiene una riga di testo (riga 94) e il bottone del PDF (righe 96-99), nessun numero e nessun campo di ricerca in tutto il file. Quanto pesa lo dicono i dati veri: 81 ingredienti su 123 non producono nessun allergene, e fra questi ci sono cioccolato, base bianca, amaretto e lievito chimico.
- **proposta**: Tre riquadri in cima: "Prodotti in scheda", "Con allergeni confermati a mano", "Da controllare", con i numeri in formato italiano (punto delle migliaia) e il terzo colorato solo se e' maggiore di zero. Piu' una casella di ricerca sul nome e un interruttore "mostra solo da controllare". Costa poco: mezza giornata. Vale molto: dice se la scheda si puo' stampare o no.

### MEDIA · vista riga 15 · utilita
**Il calcolo degli allergeni veri e' chiuso in questa vista, e il menu al cliente dice un'altra cosa**

- **perché**: La regola "usa quelli salvati, altrimenti riconoscili dagli ingredienti" e' l'unica cosa che tiene in piedi la scheda, ed e' scritta dentro il componente. Nessun altro pezzo dell'app la riusa, cosi' due documenti che finiscono in mano allo stesso cliente non dicono la stessa cosa.
- **prova addotta**: vista righe 15-23: la regola sta in un useMemo dentro il componente. MenuDinamico.jsx riga 95 costruisce la voce di menu con allergeni: ric.allergeni||[], senza nessun ripiego sul riconoscimento: per le ricette importate da Excel, che il commento in cima alla vista (righe 2-3) dice essere la maggior parte, il menu non ha allergeni mentre la scheda si'.
- **proposta**: Spostare la regola in allergeni.js come allergeniEffettivi(ricetta, ricettario), che risolve anche i semilavorati, e usarla nella scheda, nel menu, nelle etichette e nell'HACCP. Costa poco: 2-3 ore. Vale molto: un solo posto decide, e tutto quello che esce dal negozio concorda.

### BASSA · vista riga 86 · utilita
**Nessuna copia della scheda come era il giorno in cui e' stata consegnata**

- **perché**: Se fra tre mesi un cliente segnala una reazione, il locale deve poter mostrare cosa diceva la scheda quel giorno. Intanto le ricette sono cambiate e quella scheda non esiste piu' da nessuna parte.
- **prova addotta**: vista riga 86: esportaPDF finisce con doc.save('scheda-allergeni.pdf') e niente altro. Nessuna scrittura, nessuna chiave di salvataggio, e la vista non riceve nemmeno orgId o sedeId (riga 11), quindi non potrebbe salvare nulla.
- **proposta**: Al momento dell'export salvare uno scatto in una chiave dedicata: data, chi ha esportato, e per ogni prodotto gli allergeni con il loro stato. In cima alla pagina "Ultima scheda esportata il 09/09/2026" e l'elenco delle precedenti da riscaricare. Costa medio: un giorno, e vanno passate le props orgId e sedeId. Vale molto solo in caso di contestazione, poco nel lavoro di ogni giorno.


---

## Esportazione PDF (funzione esportaPDF, riga 25) — 18 sostenuti

### ALTA · vista riga 19 · sicurezza
**Il PDF stampa "non contiene" anche quando non ha capito l'ingrediente**

- **perché**: Questo e' il foglio che finisce in mano al cliente. La riga 19 chiama detectAllergeniFromIngredienti, che torna un elenco piatto: elenco vuoto vuol dire sia "nessun allergene" sia "non ho riconosciuto niente". Nel PDF (righe 62-73) i due casi disegnano lo stesso riquadro vuoto. Nella stessa libreria esiste gia' analizzaAllergeni (riga 522) che restituisce certi / daVerificare / nonRiconosciuti: la vista non la usa.
- **prova addotta**: Sui 123 nomi di ingrediente veri in produzione, 81 non producono nessun allergene (prova-riconoscimento.txt). Un gelato fatto con "base bianca" + "cioccolato fondente" esce dal PDF con tutte e 14 le caselle vuote, cioe' dichiarato privo dei 14 allergeni UE. La base bianca contiene latte, nel cioccolato la lecitina di soia e' la norma.
- **proposta**: Passare ad analizzaAllergeni e stampare tre segni diversi: pieno = contiene, riquadro con tratteggio o con la lettera V = da verificare in etichetta, vuoto = non contiene. Sotto la tabella, l'elenco dei nomi di ingrediente non riconosciuti, ricetta per ricetta, con la frase "su questi ingredienti la scheda non si pronuncia: controllare l'etichetta del fornitore". Se una ricetta ha ingredienti non riconosciuti, la sua riga non deve poter apparire tutta vuota.

### ALTA · vista riga 68 · correttezza
**Il segno di spunta non e' un segno di spunta: si stampa un apostrofo**

- **perché**: doc.text('✓', ...) usa Helvetica, che nei font standard di jsPDF ha la codifica WinAnsi. U+2713 non c'e'. Il carattere viene troncato a due byte e sul foglio, sopra il blocco rosso, si stampa un apostrofo bianco minuscolo. L'unica cosa che distingue "contiene" resta il riempimento rosso. Vale anche la regola di progetto: mai caratteri tipografici come icone, si usa un disegno.
- **prova addotta**: Provato in node con la jsPDF installata (4.2.1): la stringa finisce nel content stream come i byte 27 13, cioe' quotesingle piu' un codice non mappato. Con '…' (riga 60) invece funziona, diventa il byte 0x85 che in cp1252 esiste.
- **proposta**: Non usare caratteri: disegnare il segno con due linee (doc.lines) dentro il riquadro, oppure stampare una lettera che esiste in WinAnsi. Meglio ancora, dato che il rosso da solo non dice nulla: riquadro pieno con la sigla dell'allergene o una spunta disegnata, piu' la legenda (vedi difetto sulla legenda).

### ALTA · vista riga 50 · struttura
**Dalla seconda pagina le colonne non hanno piu' un nome**

- **perché**: L'intestazione con i nomi degli allergeni si disegna una volta sola, prima del ciclo (righe 50-56). Il salto pagina e' dentro il ciclo (righe 76-79) e rimette solo y a 14, senza ridisegnare l'intestazione. Chi guarda la pagina 2 vede 14 colonne anonime di quadrati rossi: impossibile sapere quale allergene sia quale.
- **prova addotta**: Simulato con la geometria del codice: 100 ricette danno 5 pagine (21 righe la prima, 23 le successive). Quattro pagine su cinque sono senza intestazione delle colonne.
- **proposta**: Estrarre il disegno dell'intestazione in una funzione e richiamarla dopo ogni addPage(). Nello stesso punto ristampare anche il titolo, il nome del locale, la data e il numero di pagina: ogni pagina di un documento di legge deve reggersi da sola.

### ALTA · vista riga 84 · sicurezza
**Il disclaimer del PDF e' piu' debole di quello che si vede a schermo**

- **perché**: A schermo (riga 152) l'avviso dice tre cose in piu': la contaminazione crociata durante la produzione, l'obbligo di aggiornare la scheda ad ogni modifica di ricetta o fornitore, e il riferimento all'Art. 21. Nel PDF resta solo "possono variare in base ai fornitori". Cioe' proprio la versione che esce dal locale e' quella che dice meno, e la contaminazione crociata, che in un laboratorio dove si lavorano mandorle e farina sulla stessa piastra e' il rischio principale, non e' scritta da nessuna parte.
- **prova addotta**: Confronto testuale diretto: riga 84 (PDF) contro riga 152 (schermo). La parola "crociata" e il riferimento all'Art. 21 compaiono solo nella riga 152.
- **proposta**: Un unico testo per lo schermo e per il PDF, tenuto in una costante condivisa, con dentro: contaminazione crociata nello stesso laboratorio, invito a chiedere al personale, obbligo di verifica etichette, Art. 21 Reg. UE 1169/2011. Nel PDF va ripetuto in fondo a ogni pagina, non solo all'ultima. Alla larghezza attuale il testo misura 109 mm su 297 di pagina: lo spazio per scriverlo per intero c'e'.

### ALTA · vista riga 60 · correttezza
**I nomi tagliati a 17 caratteri diventano identici fra ricette diverse**

- **perché**: Il taglio a 17 caratteri fa collassare nomi diversi nella stessa scritta. Sul foglio si vedono due righe con lo stesso nome e allergeni diversi, e il cliente allergico non ha modo di sapere quale sia il suo prodotto. Il taglio non serve nemmeno: nella colonna ci sono 54 mm e i nomi ci stanno interi.
- **prova addotta**: Misurato con jsPDF a 7pt: "Plumcake senza glutine alle mandorle" (36 caratteri) occupa 41,3 mm su 54 disponibili, ci sta tutto; il nome tagliato "Crostata di frutt…" occupa 19,3 mm. Collisioni su nomi da pasticceria veri: "Crostata di frutta secca" e "Crostata di frutta fresca" diventano entrambi "Crostata di frutt…" (una porta frutta a guscio, l'altra no); "Plumcake senza glutine alle mandorle" e "Plumcake senza glutine al cacao" diventano "Plumcake senza gl…"; "Millefoglie con crema chantilly" e "Millefoglie con crema al pistacchio" diventano "Millefoglie con c…".
- **proposta**: Togliere il taglio. Allargare labW da 56 a 100 mm (i 65 mm liberi a destra bastano) e lasciare che jsPDF vada a capo con splitTextToSize su due righe, alzando rowH a 10 mm quando serve. Se un nome resta comunque troppo lungo, mandarlo a capo, non troncarlo: su questo foglio il nome e' l'unica chiave per collegare la riga al prodotto in vetrina.

### ALTA · vista riga 35 · sicurezza
**Il documento non dice di chi e'**

- **perché**: Il PDF si intitola "Scheda Allergeni" e non riporta il nome del locale, la sede, l'indirizzo, ne' chi risponde delle informazioni. Un documento che il locale espone o consegna al cliente e' anonimo, e due pasticcerie diverse producono due file uguali nell'intestazione e con lo stesso nome. Se il foglio viene contestato non e' riconducibile a nessuno. La vista non riceve nemmeno i dati per farlo: alla riga 11 le props sono solo ricettario e tipoAttivita.
- **prova addotta**: Riga 11: SchedaAllergeniView({ ricettario, tipoAttivita }). Righe 34-39: nel PDF si scrivono solo il titolo e la riga sul Regolamento. Riga 86: il nome file e' la costante 'scheda-allergeni.pdf'.
- **proposta**: Passare alla vista l'organizzazione e la sede attiva (sono in useAuth e vengono gia' propagate ad altre view) e stampare in testata: nome del locale, sede, indirizzo. Nel nome file mettere locale e data, per esempio 'scheda-allergeni-mara-dei-boschi-2026-09-09.pdf'.

### ALTA · vista riga 50 · tipografia
**Testo a 6pt: sotto la soglia di leggibilita' della norma, e grigio**

- **perché**: I nomi degli allergeni (riga 50) e il disclaimer (riga 83) sono a 6pt, e il disclaimer e' anche grigio (setTextColor(120)). Chi legge questo foglio ha sessant'anni e sta dietro un banco, spesso a un metro di distanza. E' lo stesso spirito della regola "niente testo sotto i 12px" a schermo.
- **prova addotta**: 6pt Helvetica: em 2,12 mm, altezza della x 1,107 mm. Il riferimento dell'Allegato IV del Reg. UE 1169/2011 per le informazioni obbligatorie e' 1,2 mm di altezza della x. I nomi delle ricette a 7pt danno 1,292 mm, appena sopra. In pagina restano 65 mm orizzontali non usati, quindi non e' un problema di spazio.
- **proposta**: Minimo 9pt per le intestazioni degli allergeni e per il disclaimer, 10pt per i nomi delle ricette, nero su bianco e non grigio. Se cosi' non ci stanno 14 colonne, ridurre il numero di righe per pagina: meglio un foglio in piu' che un foglio illeggibile.

### ALTA · vista riga 19 · correttezza
**Gli allergeni salvati battono il rilevamento aggiornato, e il PDF non dice quale riga sia confermata da una persona**

- **perché**: salvati.length ? salvati : detect(...) da' sempre la precedenza a quello che c'e' nel database. Le ricette salvate prima dell'ampliamento della mappa tengono per sempre la vecchia rilevazione: migliorare il riconoscimento non migliora il loro PDF. E sul foglio stampato una riga confermata da una persona e una indovinata dalla macchina hanno esattamente lo stesso aspetto.
- **prova addotta**: Riga 19 della vista; NuovaRicettaView riga 226 e riga 340 salvano allergeni al momento della creazione, quindi salvati.length e' diverso da zero e vince. ALLERGENI_PROBABILI nella libreria (riga 437) non arriva mai a quelle ricette.
- **proposta**: Nel calcolo che alimenta il PDF, unire: certi = unione fra salvati e rilevati adesso (mai la sola versione congelata), e portare in "da verificare" quello che il rilevamento nuovo trova in piu'. Nel PDF, una colonna o un simbolo che distingua le ricette con allergeni verificati da una persona da quelle solo dedotte dagli ingredienti, con la data dell'ultima verifica.

### MEDIA · vista riga 65 · struttura
**Nessuna legenda, e un solo rosso per tutti e 14 gli allergeni**

- **perché**: Nel PDF non c'e' una riga che spieghi che il blocco pieno vuol dire "contiene" e il riquadro vuoto "non contiene": chi riceve il foglio deve indovinarlo. E il colore e' lo stesso rosso per qualunque allergene, mentre a schermo (riga 137) ogni allergene ha il suo colore preso da ALLERGENE_COLORS: chi ha usato la pagina e poi guarda la stampa non ritrova quello che ha visto. In fotocopia in bianco e nero resta solo grigio pieno contro bianco.
- **prova addotta**: Riga 65: doc.setFillColor(220,50,50) fisso dentro il ciclo, per ogni allergene. Riga 137: background e border presi da ALLERGENE_COLORS[a.id]. Nessuna chiamata che disegni una legenda in tutta la funzione (righe 25-87).
- **proposta**: Una legenda in testata, ripetuta su ogni pagina, con i tre stati disegnati come sono nella tabella e la frase accanto: "contiene", "da verificare sull'etichetta", "non contiene". Usare gli stessi colori dello schermo, e non affidare la distinzione al solo colore: forma diversa per ogni stato, cosi' regge anche la fotocopia.

### MEDIA · vista riga 53 · copy
**"Frutta a guscio" nella stampa diventa "Frutta a ."**

- **perché**: L'abbreviazione a 9 caratteri colpisce una sola etichetta su 14, e per forza di cose proprio quella che in pasticceria conta di piu': mandorle, nocciole, pistacchi. Esce "Frutta a .", con lo spazio prima del punto, e senza legenda non si capisce cosa voglia dire. Nessuna delle altre 13 etichette viene toccata, quindi il taglio non risolve nessun problema di spazio: lo crea.
- **prova addotta**: Passate tutte le 14 etichette nella formula della riga 53: 13 restano intatte, "Frutta a guscio" diventa "Frutta a .". Misurato con jsPDF a 6pt: "Frutta a ." occupa 8,91 mm e "Crostacei" intero 9,59 mm, entrambi dentro la cella da 12 mm. Nessuna etichetta ha bisogno di essere abbreviata.
- **proposta**: Togliere l'abbreviazione e scrivere le etichette per intero, andando a capo su due righe nella cella ("Frutta" / "a guscio"), che e' quello che si fa gia' a schermo con whiteSpace normal. Se serve piu' spazio, il posto c'e': 65 mm liberi a destra.

### MEDIA · vista riga 47 · struttura
**Il calcolo della larghezza delle colonne non calcola niente**

- **perché**: Math.min(colW, availW/totCols) puo' solo stringere, mai allargare: con 14 allergeni fissi il risultato e' sempre 12 mm, cioe' la costante di riga 29. Il calcolo sembra adattivo e non lo e'. Il danno vero e' che avanzano 65 mm di pagina inutilizzati mentre i nomi delle ricette vengono troncati e le etichette abbreviate.
- **prova addotta**: availW = 297 - 8 - 56 - 8 = 225 mm; 225 / 14 = 16,07 mm; cW = Math.min(12; 16,07) = 12. Bordo destro della tabella a 232 mm su una pagina da 297: 65,0 mm non usati.
- **proposta**: Distribuire tutta la larghezza: cW = (pw - startX - labW - margineDestro) / totCols, e prendere per labW quello che serve al nome piu' lungo. Con labW = 100 mm restano 13 mm per colonna, i nomi ci stanno interi e le etichette non vanno abbreviate.

### MEDIA · vista riga 76 · struttura
**Le pagine non sono numerate**

- **perché**: Il salto pagina fa solo addPage(). Su un documento di piu' fogli, esposto al banco o consegnato, senza "Pagina 1 di 5" nessuno si accorge se un foglio manca o si e' staccato: e il foglio che manca e' quello con gli allergeni di venti prodotti. Nel resto del progetto si fa gia' nel modo giusto.
- **prova addotta**: Righe 76-79: addPage() e y = 14, nient'altro. In /Users/aler/foodos/src/lib/pdfExport.js righe 89-96 e in /Users/aler/foodos/src/lib/exportPDF.js righe 76-105 si cicla su doc.internal.getNumberOfPages() con doc.setPage(i) e si stampa il numero su ogni pagina.
- **proposta**: Alla fine, prima del save, ciclare su getNumberOfPages() e scrivere in fondo a ogni pagina "Pagina i di n" insieme al nome del locale e alla data, come fa gia' pdfExport.js.

### MEDIA · vista riga 85 · sicurezza
**La data c'e' solo sull'ultima pagina, ed e' la data di stampa, non quella di revisione**

- **perché**: Il foglio che si appende al banco e' la pagina 1, e la pagina 1 e' senza data. E "Generato il" cambia a ogni ristampa anche se nessuno ha toccato le ricette: e' la data della stampante, non quella della scheda. Cosi' non si distingue una ristampa di dati vecchi da una scheda davvero aggiornata, che e' esattamente quello che il disclaimer a schermo chiede di fare ("aggiornare la scheda ad ogni modifica di ricetta o fornitore").
- **prova addotta**: Riga 85: la data si scrive una volta sola, dopo il ciclo, quindi solo sull'ultima pagina. Riga 86: nome file costante 'scheda-allergeni.pdf', quindi tre ristampe in tre mesi sono indistinguibili. Il formato in se' e' corretto: toLocaleDateString('it-IT') da' 09/09/2026.
- **proposta**: Su ogni pagina, in fondo: "Scheda aggiornata al <data dell'ultima modifica del ricettario>" e accanto, piu' piccolo, "stampata il <data>". Se la data di ultima modifica non e' disponibile nel ricettario, va salvata: senza quella una scheda allergeni non e' tracciabile. Nome file con locale e data.

### MEDIA · vista riga 58 · tipografia
**Si legge la riga sbagliata: nessun filo, nessuna banda, 38 mm di bianco**

- **perché**: Nel ciclo si disegnano solo i riquadri delle celle: nessuna linea di riga, nessuna banda alterna, niente che tenga insieme il nome e i suoi segni lungo 232 mm di foglio. A schermo le righe sono a bande alterne (riga 128), nella stampa no. Su una scheda allergeni scivolare di una riga vuol dire leggere gli allergeni del prodotto sbagliato.
- **prova addotta**: Righe 58-74: le uniche primitive grafiche sono doc.rect sulle celle. Il nome, tagliato a 17 caratteri, finisce intorno ai 27 mm (19,3 mm misurati a 7pt partendo da x = 8) e la prima casella comincia a 65 mm: circa 38 mm di bianco senza alcun riferimento visivo.
- **proposta**: Bande alterne come a schermo (rettangolo di sfondo chiaro sulle righe pari) oppure un filo sottile sotto ogni riga, e nome della ricetta accostato alla prima colonna di caselle allargando labW e togliendo il taglio.

### MEDIA · vista riga 13 · utilita
**Le ricette non sono in ordine**

- **perché**: Object.values da' l'ordine con cui le ricette sono state inserite o importate dall'Excel. Su una pagina web si scorre e si cerca; su cinque fogli stampati, senza ordine alfabetico, trovare un prodotto e' una caccia al tesoro, e chi lo cerca e' un cliente allergico davanti al banco con la commessa che aspetta.
- **prova addotta**: Riga 13: Object.values(ricettario?.ricette||{}).filter(...), nessun sort. Riga 58: il ciclo del PDF usa quello stesso array nell'ordine in cui arriva.
- **proposta**: Ordinare per nome con localeCompare('it'): ricette.slice().sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'it')). Se le categorie sono valorizzate, raggruppare per categoria con un titolo di sezione e ordine alfabetico dentro.

### MEDIA · vista riga 96 · correttezza
**Nessun try/catch, nessun bottone disabilitato, nessun messaggio se l'esportazione fallisce**

- **perché**: esportaPDF e' async e il bottone non ha disabled: due clic danno due download e due import di jspdf. E se qualcosa va storto la promise muore in silenzio: l'utente ha premuto il bottone e non succede niente, senza sapere perche'. La vista non riceve nemmeno notify fra le props, quindi non ha modo di dirlo. Va contro la convenzione di progetto "Bottoni async: SEMPRE disabled={saving}".
- **prova addotta**: Righe 96-99: <button onClick={esportaPDF}> senza disabled e senza stato. Righe 25-87: nessun try/catch attorno all'import dinamico ne' al disegno. Riga 60: r.nome.length su un nome mancante fa saltare tutta l'esportazione (la riga 63 lo stesso valore lo legge con l'optional chaining, quindi la prudenza c'era ed e' stata dimenticata qui). Riga 11: props solo ricettario e tipoAttivita, notify non c'e'.
- **proposta**: Stato locale esportando, disabled={esportando} sul bottone con la scritta che diventa "Preparo il PDF...", try/catch attorno a tutto con notify('Non sono riuscito a creare il PDF. Riprova.', false), e String(r.nome||'').trim() con un ripiego tipo "(ricetta senza nome)" invece di far cadere l'intera esportazione per una riga.

### BASSA · vista riga 76 · struttura
**Con 21, 22, 44 o 45 ricette l'ultima pagina contiene solo il disclaimer**

- **perché**: Il controllo del salto pagina sta in coda al ciclo: se l'ultima riga lo fa scattare si apre una pagina nuova, il ciclo finisce e su quel foglio si scrive solo il disclaimer. Nel caso opposto il disclaimer cade a 202 mm su una pagina da 210, dentro il margine non stampabile di diverse stampanti laser, e rischia di sparire dal foglio.
- **prova addotta**: Simulata la geometria del codice: 21 ricette danno 2 pagine con la seconda che ha solo il disclaimer a y = 20 mm; 22 uguale; 44 e 45 danno 3 pagine con la terza quasi vuota. Nel caso peggiore opposto il disclaimer va a y = 202 mm, a 8 mm dal bordo.
- **proposta**: Spostare il controllo prima di disegnare la riga (se y + rowH supera il limite, nuova pagina e intestazione) e riservare in fondo a ogni pagina una fascia fissa per disclaimer, data e numero di pagina, con il limite delle righe calcolato di conseguenza.

### BASSA · vista riga 51 · tipografia
**Intestazione e contenuto della colonna nome non sono incolonnati**

- **perché**: La parola "Ricetta" e i nomi delle ricette partono da due x diverse, e nella stessa riga il nome e i segni delle caselle stanno su due basi diverse. Su un foglio con decine di righe questi scarti si notano e fanno sembrare la tabella storta. Vale la regola di progetto sull'allineamento fra scritte affiancate.
- **prova addotta**: Riga 51: doc.text('Ricetta', startX + 1, y), cioe' 9 mm. Riga 61: doc.text(nome, startX, ...), cioe' 8 mm: 1 mm di scarto. Riga 61 la base del nome e' y + rowH*0.6 (y + 4,8 mm), riga 68 quella del segno e' y + rowH*0.65 (y + 5,2 mm): 0,4 mm di differenza dentro la stessa riga.
- **proposta**: Un'unica costante per la x della colonna nome usata sia dall'intestazione sia dalle righe, e un'unica costante per la base verticale del testo di riga, usata sia per il nome sia per il contenuto delle celle.
