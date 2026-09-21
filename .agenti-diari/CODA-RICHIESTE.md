# Coda delle richieste del titolare

## FATTO — 17/09, terzo giro

- [x] **12. I mouseover non funzionano.** Causa vera: `Tip` copre 23
      spiegazioni, ma nel prodotto ce ne sono **226 come `title=` nativi**, che
      su schermo tattile non si aprono mai e col mouse arrivano dopo ~1s.
      Nuovo `src/components/SpiegazioniAlTocco.jsx`, montato una volta al tetto
      dell'app: vale per tutte, presenti e future. 11 test.
- [x] **Selettore sedi nel Ricettario** → nascosto dietro
      `SELETTORE_SEDI_NEL_RICETTARIO = false` in `Dashboard.jsx`. Audit sui
      dati veri: **0 righe** di prezzi per sede in tutto il prodotto. Si
      rimette con una parola. 6 test.
- [x] **Fascia legale** (Privacy · Termini · Cookie · Contatti · © Foodos):
      su tablet 20px invece di 28, senza ombra, testo al 26%.
- [x] **Cestino del Listino scentrato**: mancava `justifyContent`. Trovato e
      corretto anche il secondo caso (× della chiusura di cassa). 3 test.
- [x] **Nota «ingredienti per 1 kg»**: era dentro la colonna «Tipo» (un terzo
      di riga) e sfondava la griglia. Ora riga sola sotto i tre campi.
- [x] **Tessere semilavorati**: avvisi «senza prezzo» incolonnati anche quando
      manca «prezzo stimato»; targhetta «Costo / kg» da 56px a 40px, alta come
      i pulsanti Costo e Dove. 5 test.

## DA FARE — Ricettario

1. **Nella scheda «Gusti» il riquadro «Semilavorati» a destra non serve.**
   Metterci qualcos'altro di utile.
2. **Audit: i due pulsanti «Nuovo gusto» e «Aggiorna ricettario gusti» stanno
   bene lì?**
3. **La scheda che si apre cliccando un gusto: troppe informazioni messe a
   caso.** Riorganizzare.
4. **Le quattro tessere a destra vanno a quadrato**, due sopra e due sotto.
5. **Togliere la scritta grigia piccola a sinistra** («cost 2,39 ecc»).
6. **Allergeni dietro un pulsante** «Allergeni».
7. **Nomi degli ingredienti con la prima maiuscola e il resto minuscolo**,
   in Ricettario e in Nuovo gusto.
8. **Restringere ancora le barre di ogni gusto e il loro contenuto.**
9. **Idem le tessere nella visualizzazione a riquadri.**
10. **Nei riquadri, il nome del gusto in grassetto e nel rosso di Foodos.**

## RISPOSTE DATE

- «Dove vedo tutte le materie prime e i prezzi?» → **Magazzino → scheda
  «Prezzi ingredienti»** (nascosta ai dipendenti).

## REGOLA IMPARATA (tre volte)

La fotografia dei token (`check-design-tokens.mjs --aggiorna`) va rifatta **per
ultima**, subito prima del commit.

## DA FARE — 18/09, quarto giro

### Ricettario (lo fa il capo)
- [x] A. Via la scritta grigia «Ricavo / kg : 28,91» nella barra dei gusti.
- [x] B. I quattro pulsanti a quadrato, due sopra e due sotto, e scesi da 34
      a 30px sul computer. «Riduci» sta fuori dal quadrato: non è un'azione
      sulla ricetta.
- [x] C. Via le quattro tessere dall'intestazione: gli stessi quattro numeri
      sono già dentro **Dettaglio → Conto al kg** (verificato, sono
      esattamente quelli). Nota emersa dal controllo: NON è vero che stiano
      in tutte le pagine di analisi — «Food cost» esclude apposta i gusti e
      «Menu engineering» li mostra solo se hanno vendite. Per questo sono
      stati spostati, non tolti.

### Nuovo gusto — AGENTE 1 (proprietario di NuovaRicettaView.jsx)
- [x] D. Il suggerimento «Le ricette esistenti vengono saltate» non si
      capisce. Riscriverlo in italiano da pasticceria.
- [x] E. «Aggiungi note di cottura o congelabilità»: si apre ma non si
      richiude. Deve fare da interruttore.
- [x] F. I nomi degli ingredienti con la prima maiuscola anche **mentre si
      aggiungono**, non solo quando si rileggono.
- [x] H. Il riquadro «Somma ingredienti 0 g / Resa dichiarata 1.000 g» è
      troppo grande e invadente. Ridimensionarlo.
- [x] Riga 1408: la frase sugli allergeni va allineata alla decisione
      legale qui sotto.

### Allergeni, responsabilità — AGENTE 2
(proprietario di SchedaAllergeniView.jsx, Haccp.jsx, exportPDF)

Due domande del titolare, 18/09:
  1. «Calcolati automaticamente dagli ingredienti (Reg. UE 1169/2011): se
     cambiano le direttive come facciamo noi a saperlo e ad aggiornarci?»
  2. «Non dobbiamo avere nessuna ripercussione legale, dobbiamo lasciare al
     cliente l'ultima parola, noi al massimo diamo un consiglio.»

Decisione: il programma **propone**, il cliente **conferma**. Nessuna frase
del prodotto deve far credere che l'elenco sia a norma per il solo fatto di
essere stato calcolato.

### Materie prime chiuse — DOPO l'agente 1 (stesso file)
- [~] G. **Meccanismo pronto** in `_shared.jsx`: `CampoConElenco` accetta
      `soloDallElenco`, riconosce il nome che non esiste, propone quello che
      gli assomiglia (distanza di Levenshtein, soglia che cresce con la
      lunghezza della parola) e offre di crearlo. 12 test verdi in
      `materiePrimeChiuse.test.jsx`. Resta da **collegarlo** in Nuovo gusto,
      appena l'agente 1 rilascia il file.

## DA FARE — 18/09, pagina Listino (formati vendita)
Arrivata mentre gli agenti del quarto giro erano ancora al lavoro. Parte
quando quelli hanno finito. File: `src/components/FormatiVendita.jsx`.

1. **Le due spiegazioni lunghe in cima vanno dietro due pulsanti.**
   La prima è «A cosa serve» (il testo che comincia con «Se la tua cassa batte
   righe senza il gusto…»); la seconda è l'avviso «Nessun formato ha i
   materiali di confezionamento» con la spiegazione del cono, della vaschetta,
   del coperchio e del fazzoletto. Testuale: «queste scritte sono troppo
   invasive, racchiudile in due pulsanti, così se uno ha bisogno di sapere a
   cosa serve clicca e viene fuori la spiegazione, e l'altro è un alert idem
   che si deve cliccare, così la pagina viene più pulita ed elegante».

2. **«Composizione del food cost per unità»: rifare l'impaginazione.**
   Oggi è un elenco di righe scollegate — Materiali 0,000 €, Prodotto (100g)
   0,184 €, Food cost stimato / unità 0,184 €, Margine (prezzo 3,50 €) 95%.
   Testuale: «rivedi impaginazione di tutte queste cose, miglioratele tutte da
   qualsiasi punto di vista: ottimizzazione dello spazio, intuitività,
   bellezza ed eleganza anche nei colori».

3. **Audit profondo: il modo di inserire i formati è quello giusto?**
   Due problemi veri sollevati dal titolare:
   - **l'errore di battitura**: se uno scrive «coppettp» o «fazzolettp» il
     materiale nasce sbagliato e nessuno se ne accorge (stessa famiglia del
     difetto di «Nuovo gusto»);
   - **i costi unitari sono minuscoli** (centesimi a pezzo) e scriverli ogni
     volta a mano è fragile.
   Proposta del titolare, da valutare e poi realizzare: **invertire il
   flusso.** Nella pagina Listino si inseriscono PRIMA tutti i prodotti di
   confezionamento che si usano — cucchiaini, fazzoletti, coppette, coni — con
   quanto si spende al kg o a confezione per ognuno. Salvati quelli, quando si
   clicca «Nuovo formato» e si scrive «cono piccolo», il comando «aggiungi
   materiale» mostra **l'elenco fisso** di quei prodotti. Se un prodotto non è
   stato aggiunto prima, non compare nell'elenco e non si può scrivere a mano.
   È lo stesso principio delle materie prime chiuse (punto G).

4. **Le box di «Nuovo formato» sono troppo grandi.**
   Testuale: «rivedi la grandezza di tutte le box quando si clicca nuovo
   formato, falle anche più piccole, intelligenti e coerenti, non usando
   spazio inutile».

## CHIUSO — NON era codice morto (18/09 sera)
Avevo scritto che il ramo «semilavorato» dentro `TortaCard` fosse codice morto
e andasse tolto. **Era una valutazione sbagliata mia.** `isSemi` non guarda
solo `variant`:

    const isSemi = variant === 'semilavorato' || tipoEff === 'semilavorato'

e `tipoEff` legge `ricetta.tipo`, mentre il filtro dell'elenco usa
`getR(nome, ricetta).tipo` — che se la ricetta non ha il campo `unita` ignora
del tutto `ricetta.tipo`. Quindi una base **importata senza `unita`** passa il
filtro e arriva alla scheda con `isSemi` vero. Sui dati di Mara oggi non
capita (tutti e 5 i semilavorati hanno `unita: 0`), ma è raggiungibile.

→ Le diramazioni **restano**. Al loro posto c'è
`tests/unit/semilavoratiFuoriDallElencoProdotti.test.jsx`, che fissa la regola
vera: nell'elenco dei prodotti i semilavorati non ci vanno, nemmeno senza
`unita`.

## AUDIT 18/09 — trovato sui dati veri di Mara (68 ricette)

- [x] **Due funzioni, due food cost diversi.** `calcolaFC` e
      `calcolaFCDettaglio` davano numeri diversi su **29 ricette su 68** (totale
      189,94 € contro 160,81 €, 18% di scarto). La decisione del 16/09 — «il
      prezzo scritto dal titolare vince sul calcolo» — era stata applicata a
      una sola delle due. Allineate; 8 test, 3 rossi sul codice di prima.
- [x] **La pagina Semilavorati mostrava un costo che il prodotto non usa.**
      BASE BIANCA compariva a 1,22 €/kg mentre alle 29 ricette che la usano ne
      venivano addebitati 2,31. Ora mostra quello vero e, quando i due numeri
      divergono, dice anche l'altro. 5 test, 2 rossi sul codice di prima.
- [x] **DA FARE: la pagina Materie prime nasconde `base bianca`.**
      Esclude tutti i semilavorati — giusto in linea di principio, perché il
      loro costo esce dalla loro ricetta. Ma quando una base ha un prezzo
      scritto a mano, quel prezzo **è il numero che il prodotto usa** (29
      ricette), e adesso non si può più né vedere né cambiare da nessuna parte:
      il campo «Costo al kg della base» in Nuovo gusto compare solo per il tipo
      `interno`, e BASE BIANCA è `semilavorato`.
      → Rimedio: nell'elenco tenere i semilavorati **che hanno un prezzo
      scritto a mano**, segnalati per quello che sono.
      Non fatto subito perché il file era in mano a un agente.

## DA FARE — 18/09 sera, pagina Materie prime (9 punti + 1)

1. **«Nuova materia prima» sta nel posto sbagliato.** Spostarlo e rifarlo.
   E le due tessere «stima di mercato» e «prezzo tuo»: servono ancora?
2. **Lo storico modifiche diventa una pagina a sé.** Il pulsante resta nelle
   Materie prime, ma apre una pagina sua. Ogni modifica deve dire: prodotto,
   da quanto a quanto, in che data, e da chi.
3. **La riga «75 materie prime non hanno prezzo…» su una riga sola da PC.**
4. **Ogni materia prima ha il fornitore.** Serve a collegare tutto: nella
   pagina Fornitori si vedranno poi le materie prime di ognuno.
5. **La colonna «in quante ricette» diventa un pulsante**: cliccandolo si
   aprono sotto, incolonnate, le ricette che usano quella materia prima. Il
   suggerimento al passaggio del mouse non serve — mostra solo le prime.
6. **Il segnaposto «12,50» nel campo del prezzo è fuorviante**: schiarirlo o
   toglierlo.
7. **Le date allo scoccare dell'anno.** Controllare che gli storici dei
   prezzi reggano il passaggio al 01/01.
8. **Import prezzi in blocco**, accanto a «Nuova materia prima», più un
   pulsante che scarica un Excel di esempio con le colonne già scritte:
   *nome materia prima / prezzo al kg / fornitore*. Per il fornitore va detto
   che il nome dev'essere **esattamente quello che compare in fattura**.
9. **Modificando si può cambiare anche il nome** (uno lo salva sbagliato), e
   il cambio deve propagarsi ovunque nel prodotto.

**+1 (segnalato aprendo la ricetta MAROTTO):** «Base agrimontana ciocolato»
esce abbreviata con i puntini anche quando di spazio ce n'è. Troncare solo se
serve davvero.

## FATTO — 18/09 sera
- [x] Selettore sedi nascosto anche in «Materie prime»: i prezzi stanno nel
      ricettario, che è uno solo per l'azienda, e la pagina non legge `sedeId`.
- [x] **La stima di mercato non fa più il conto.** Misurato sui dati veri di
      Mara: 99 righe su 161 erano costate col listino medio di mercato, il
      **47% del food cost** dell'azienda, e 55 ricette su 68 ne erano toccate.
      Adesso vale come prezzo mancante. Conseguenza dichiarata: le ricette con
      costo completo passano da ~65 a **3 su 68** — è la verità, e manda a
      scrivere i prezzi. Interruttore: `STIMA_DI_MERCATO_FA_IL_CONTO`.
10. **Eliminare una materia prima**, con un doppio controllo serio prima:
    è un dato da cui dipendono le ricette che la usano.
11. **Il filtro data in «modifica prezzi» non fa scrivere bene l'anno.**
    Segnalato dal titolare il 18/09: va controllato con attenzione.

## DECISIONE APERTA — come si legge «1.250» in un prezzo
`leggiPrezzoKg` (in `formatIt.js`) legge `1.250` come **1,25**, non come 1.250.
In italiano il punto è il separatore delle migliaia, quindi chi scrive «1.250»
quasi sempre intende milleduecentocinquanta — e non è un caso di scuola: la
bacca di vaniglia nel listino di Mara sta a **380 €/kg**, lo zafferano di più.
Ma il punto è anche il decimale di chi copia da un gestionale in inglese.
→ Nell'import l'agente ha già aggiunto `resoconto.ambigue`, che mostra le due
letture possibili prima di scrivere. Per il campo singolo (finestra del prezzo)
la decisione è aperta: **chiedere invece di indovinare** quando c'è un punto
con esattamente tre cifre dopo e nessuna virgola.
→ **APPROVATA dal titolare il 18/09.** `letturaPrezzoKg` la scrive l'agente
delle date (proprietario di `formatIt.js`); l'aggancio in «Nuovo gusto» lo fa
il capo, quello in «Materie prime» l'agente della pagina. `leggiPrezzoKg` non
si tocca: ha già dei chiamanti e deve rispondere come prima.

## DA GUARDARE — un test intermittente
`tests/unit/rese.test.js › se il database rifiuta, lo dice invece di far
credere che sia salvato` è caduto una volta nella suite intera e passa sempre
da solo. È interferenza fra test (stato di modulo condiviso), non un difetto
del prodotto — ma un test che va e viene è un difetto a sé: la prossima volta
che cade nessuno gli crederà.

## DA FARE — 19/09, pagina Scadenzario / Fornitori (11 punti)

1. **Nel menu si chiama «Fornitori», aprendola si chiama «Scadenzario».**
   Rinominare: un nome solo.
2. **Le tre tessere grandi** (da pagare, scadute, in scadenza) devono essere
   **cliccabili e aprire tre pagine diverse**, non filtrare in questa.
3. **«24 fatture senza punto vendita»**: il pulsante deve aprire una pagina con
   l'elenco e permettere di **smistarle a sedi diverse**, non assegnarle tutte
   allo stesso negozio.
4. **«Il bonifico automatico non può partire: manca l'IBAN a 38 fornitori»**:
   ridurre a un riquadro di una o due righe con un pulsante che porta a una
   pagina dove si sistemano.
5. **Vista per fornitore: le colonne non sono incolonnate.** Le cifre devono
   stare sempre nella stessa colonna, le tessere verdi «ho pagato» fra loro, e
   se in una riga manca una tessera le altre **non devono scalare**.
6. **Anagrafica: Partita IVA / Giorni di consegna / Minimo d'ordine** vanno
   incolonnate e allineate. «Giorni di consegna» è troppo lungo e manda a capo
   il riquadro.
7. **La sezione Ordini è vuota** («0 ordini · 0,00 €»): capire perché.
8. **Sezione Spesa: mostrare TUTTI i fornitori**, non «altri 25 fornitori».
9. **Pagina nuova: fornitori ↔ materie prime.** Semplice e intuitiva. Una
   materia prima può avere più fornitori e viceversa; i collegamenti si
   modificano da lì. **È la pagina dove si atterra cliccando il nome del
   fornitore nella pagina Materie prime.**
10. **Anagrafica, Categoria**: oggi è fissa. Dev'essere scegliibile prima e poi
    comparire come elenco fisso quando si scrive.
11. **Audit: la pagina è pronta a ricevere un Excel** con nome fornitore,
    prodotti, prezzo per prodotto?

## FATTO — 19/09, Materie prime (5 punti)
- [x] Nomi con la prima maiuscola nell'elenco.
- [x] Via la scritta «mercato 1,80 €/kg»: non fa più il conto del food cost, e
      chi ha accordi coi fornitori la leggeva come il prezzo che dovrebbe pagare.
- [x] Un titolo solo sopra l'elenco delle ricette (erano due, uguali).
- [x] Il riquadro grigio arriva al bordo: `colSpan` diceva 4 su cinque colonne.
- [x] Un solo «Modifica» nelle azioni; cambio nome ed eliminazione dentro.


## CHIUSO — 19/09/2026 sera
Le sei caselle qui sopra erano rimaste vuote, ma il lavoro era fatto e con i
suoi test. Verificato nel codice una per una prima di spuntarle.

Restano aperte solo le **quattro decisioni sull'import**, che aspettano una
risposta del titolare, non del codice.

## DA FARE — 21/09, Materie prime: lo storico diventa una sezione

Richiesta del titolare: **il pulsante «Storico modifiche» non deve solo aprire
un elenco**, deve portare a un'altra sezione — sempre dentro la pagina Materie
prime — dove si possa **filtrare per fornitore, materia prima, prezzo** e
vedere tutte le modifiche relative.

Il perché, con parole sue: «quando ci saranno un sacco di modifiche di
ingredienti uno deve avere la possibilità di filtrare».

Nota di contesto: lo storico oggi mostra le ultime 50 righe e basta. Da oggi
ci scrivono dentro **anche le bolle** (ogni carico merce che cambia un prezzo
lascia una riga con fornitore, numero del documento e data), quindi la
crescita non è un'ipotesi: è la conseguenza diretta della funzione appena
messa in produzione. Con due consegne a settimana per dieci materie prime
sono ottanta righe al mese.

Da tenere presente quando si fa:
- i filtri utili sono **fornitore**, **materia prima**, **periodo** e
  **quanto è cambiato** (solo aumenti / solo ribassi / oltre il tot %)
- l'origine c'è già nel dato (`origine: {tipo, fornitore, numero, data}`):
  va mostrata, se no non si sa da dove viene un prezzo
- le righe «solo storico» (bolla più vecchia dell'ultimo cambio) vanno
  distinte, se no sembrano prezzi che non sono mai entrati in vigore

## DA FARE — 21/09, due cose sugli accessi

### 1. Una mail già usata deve dirlo, ovunque sia

Richiesta del titolare: inserendo una mail il sistema **deve controllare se
quella mail è già presente in qualsiasi punto del sistema** e, se c'è, dire
«mail già in uso».

«In qualsiasi punto» è la parte che conta: non basta controllare la tabella
dei dipendenti. Una stessa mail può stare fra i titolari, fra i dipendenti di
un'altra sede, fra gli account di autenticazione, o fra gli inviti mai
accettati. Due persone che condividono una mail sono due accessi che si
sovrascrivono a vicenda, ed è il tipo di guaio che si scopre quando qualcuno
non riesce più a entrare.

### 2. Il codice di quattro cifre non si può impostare — SEMBRA UN BLOCCO

Il titolare, entrando con la mail di un dipendente: «mi chiede il codice di 4
numeri ma non mi dà la possibilità di impostarlo o modificarlo».

Se è come sembra, chi entra la prima volta resta chiuso fuori: il programma
chiede una cosa che non esiste ancora e non offre il modo di crearla. Va
guardato per primo fra i due, perché non è una rifinitura — è una porta
chiusa.

Da verificare: dove viene chiesto, dove si dovrebbe impostare, e cosa succede
a un dipendente appena creato che non ha mai avuto un codice.

### 3. Archiviare non basta: si deve poter eliminare (con doppio controllo)

Richiesta del titolare, 21/09: in **Personale → archivio dipendenti** si deve
poter anche **eliminare** una persona, «ovviamente con doppio check per non
rischiare di fare un errore».

Attenzione a cosa si porta dietro, perché qui non è come cancellare una
materia prima: a un dipendente sono attaccati **i turni, il costo del lavoro
dei mesi passati e le righe del Registro attività**. Cancellare la persona e
lasciare i turni orfani vuol dire che il costo del lavoro di marzo cambia da
solo, mesi dopo, senza che nessuno abbia toccato marzo.

Da decidere prima di scrivere: cosa succede ai turni già registrati. Le tre
strade sono tenere i turni e scollegarli (il costo storico resta), cancellare
tutto (il costo storico cambia), o permettere l'eliminazione **solo** a chi
non ha nessun turno registrato. La terza è la più prudente e probabilmente la
più giusta: chi ha lavorato resta negli archivi, si archivia e basta.
