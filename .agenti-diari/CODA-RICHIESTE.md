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
- [ ] D. Il suggerimento «Le ricette esistenti vengono saltate» non si
      capisce. Riscriverlo in italiano da pasticceria.
- [ ] E. «Aggiungi note di cottura o congelabilità»: si apre ma non si
      richiude. Deve fare da interruttore.
- [ ] F. I nomi degli ingredienti con la prima maiuscola anche **mentre si
      aggiungono**, non solo quando si rileggono.
- [ ] H. Il riquadro «Somma ingredienti 0 g / Resa dichiarata 1.000 g» è
      troppo grande e invadente. Ridimensionarlo.
- [ ] Riga 1408: la frase sugli allergeni va allineata alla decisione
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

## TROVATO PER STRADA — da decidere
**Il ramo «semilavorato» dentro `TortaCard` (RicettarioView.jsx) è codice
morto.** Dopo aver tolto i semilavorati dalla scheda Gusti, nessuno passa più
`variant="semilavorato"`: restano 27 diramazioni su `isSemi` che non si
eseguono mai. Non l'ho tolto adesso — si tocca una scheda che è appena andata
online e che il titolare sta guardando — ma va tolto, perché prima o poi
qualcuno lo «corregge» credendolo vivo.

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
- [ ] **DA FARE: la pagina Materie prime nasconde `base bianca`.**
      Esclude tutti i semilavorati — giusto in linea di principio, perché il
      loro costo esce dalla loro ricetta. Ma quando una base ha un prezzo
      scritto a mano, quel prezzo **è il numero che il prodotto usa** (29
      ricette), e adesso non si può più né vedere né cambiare da nessuna parte:
      il campo «Costo al kg della base» in Nuovo gusto compare solo per il tipo
      `interno`, e BASE BIANCA è `semilavorato`.
      → Rimedio: nell'elenco tenere i semilavorati **che hanno un prezzo
      scritto a mano**, segnalati per quello che sono.
      Non fatto subito perché il file era in mano a un agente.
