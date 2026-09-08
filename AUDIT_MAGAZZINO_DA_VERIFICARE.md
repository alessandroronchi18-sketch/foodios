# Audit Magazzino — 113 difetti da verificare

> Prodotto il 2026-09-07 sera da sei agenti in parallelo (uno per scheda + uno
> sulla struttura), sul file `src/views/MagazzinoView.jsx`.
>
> **STATO: NON VERIFICATI.** La fase di verifica adversariale — un secondo
> agente che prova a RIFIUTARE ogni difetto leggendo il codice — si è fermata
> al settimo su 113 perché è scattato il limite di sessione.
>
> **Perché conta.** In questa stessa giornata tre difetti che sembravano bug
> veri si sono rivelati artefatti dei miei dati di prova sbagliati: le chiavi
> del magazzino sembravano avere maiuscole miste (sono tutte minuscole in
> produzione, 0 su 100), il campo del fabbisogno sembrava sbagliato
> (`qty1stampo` è corretto), e i prezzi sembravano non applicarsi (la forma è
> `{costoKg, costoG}`, non un numero). **Non correggere niente da questa lista
> senza aver prima riletto la riga di codice citata.**
>
> Le forme dati vere, verificate sul database di produzione:
> - `magazzino`: chiavi **minuscole**, campi `giacenza_g` / `soglia_g` / `nome` / `ultimoRifornimento`
> - `ricettario.ricette[].ingredienti[]`: `{ nome, qty1stampo, costoPerG, costo1stampo }`
> - `ricettario.ingredienti_costi[k]`: **oggetto** `{ costoKg, costoG }`
> - `giornaliero[]`: `{ data, prodotti: [{ nome, stampi }] }`
>
> Per riprendere la verifica: il workflow è `wf_57cd1808-fd9`, lo script sta in
> `~/.claude/projects/-Users-aler-foodos/9f6951b3-*/workflows/scripts/audit-magazzino-profondo-*.js`
> e si riprende con `Workflow({scriptPath, resumeFromRunId: 'wf_57cd1808-fd9'})`:
> i sei agenti di lettura tornano dalla cache, riparte solo la verifica.
>
> Già corretto e in produzione (non ripetere): righe fantasma da chiavi non
> canoniche, prezzi stimati dichiarati, rosso solo per l'esaurito, "Da ordinare"
> invece di "Critico", i 18 testi da 8-9px, € dopo la cifra, la lista di
> riordino limitata a 6 con ordine per urgenza, la banda sede ripetuta.


---

## Prodotti finiti

_24 difetti sostenuti_

### ALTA · Se la rete cade la scheda dice "nessun prodotto in stock" invece di dire che non ha letto niente

- **riga** `136` · **categoria** correttezza
- **perché è un difetto**: È il caso peggiore: un numero inventato spacciato per misurato. Il pasticcere guarda il tablet in laboratorio, legge "Nessun prodotto in stock", Sotto soglia 0 e Stock negativo 0 in verde, e conclude che il gestionale è a posto o che la vetrina è vuota. In realtà la scheda non ha letto nulla. E il messaggio d'errore previsto non arriva mai.
- **prova addotta**: Il catch a riga 135-137 (notify?.('Errore caricamento stock: '...)) è codice morto: loadStockPF (src/lib/stockPF.js:30) e loadMovimentiPF (src/lib/stockPF.js:62) fanno `if (error) { console.error(...); return [] }`, non rilanciano. Quindi stock=[] e movimenti=[] anche su errore rete/RLS → riga 197 `stock.length === 0` → stato vuoto di riga 200-201, e righe 193-194 colorano i KPI in C.green.
- **proposta**: Far tornare l'errore a chi chiama (es. `return { rows, error }` o rilancio in stockPF), tenere uno stato `errore` nel componente e mostrare al posto della tabella un riquadro: "Non riesco a leggere lo stock di questa sede. Controlla la connessione." con pulsante "Riprova". Quando il dato non c'è, i KPI vanno a "—", non a 0 verde.

### ALTA · "Pezzi totali" somma grammi e pezzi nello stesso numero

- **riga** `192` · **categoria** correttezza
- **perché è un difetto**: Su una gelateria che sposta gusti in grammi tra sedi, il KPI più grande della pagina diventa un numero senza senso: 8 kg di pistacchio ricevuti fanno "8.020 pezzi totali". Il pasticcere legge un numero grosso e non sa che cosa conta. Meglio nessun numero che questo.
- **prova addotta**: riga 174 `stock.reduce((s, r) => s + Number(r.quantita || 0), 0)` ignora `r.unita`, che invece esiste ed è usata a riga 222. Le righe in grammi sono reali: src/views/InventarioSettimanaleView.jsx:1182-1184 chiama `caricoProduzionePF({ ..., quantita: qtaG, unita: 'g' })` per i trasferimenti di gusti.
- **proposta**: Raggruppare per unità e mostrare solo il totale dei pezzi nel KPI, con i kg nel sub: value "20 pz", sub "più 8,4 kg sfusi". Oppure due KPI separati. Mai una somma tra unità diverse.

### ALTA · Il modale scarto dice sempre "(pz)" anche per una riga in grammi, e non passa l'unità al salvataggio

- **riga** `288` · **categoria** correttezza
- **perché è un difetto**: Chi butta 3 kg di gelato in una riga registrata in grammi legge "Quantità scartata (pz)", scrive 3 e scarica 3 grammi. Lo scarico non torna, lo stock resta gonfio e nessuno capisce perché. La riga sa qual è la sua unità, il form la butta via.
- **prova addotta**: riga 231 e 236 costruiscono scartoForm con { prodotto, qty, note, azzera } senza `unita: r.unita`; riga 288 ha l'etichetta fissa 'Quantità scartata (pz)'; riga 160 chiama `scartoPF({ sedeId, prodotto, quantita, note })` e scartoPF (src/lib/stockPF.js:103-117) non ha parametro unità.
- **proposta**: Portare `unita: r.unita` e `disponibile: q` nello scartoForm; etichetta dinamica "Quantità scartata (g)" / "(pz)"; sotto il campo scrivere "Disponibili adesso: 8.400 g"; bloccare qty maggiore del disponibile con un messaggio, non con un errore SQL.

### ALTA · Nel campo quantità non si possono scrivere decimali: la virgola viene mangiata

- **riga** `290` · **categoria** correttezza
- **perché è un difetto**: Per scartare 1,5 kg il pasticcere digita 1, poi la virgola: il campo torna a "1" e la virgola sparisce. Ci riprova, sparisce di nuovo. Se svuota il campo per riscrivere compare uno "0" che deve cancellare a mano. È il difetto che fa dire "questa cosa non funziona".
- **prova addotta**: riga 290 `onChange={e => setScartoForm(f => ({ ...f, qty: parseFloat(e.target.value) || 0 }))}`: allo stato intermedio "1." parseFloat dà 1, lo stato diventa 1, il value controllato torna "1" e il separatore è perso; a campo vuoto parseFloat('') è NaN → `|| 0` → il campo mostra 0.
- **proposta**: Tenere la stringa grezza nello stato (`qty: e.target.value`) e convertire una volta sola in handleScarto con `parseFloat(String(qty).replace(',', '.'))`. Niente `|| 0`: se è vuoto, il pulsante resta disabilitato.

### ALTA · Uno scarto registrato qui non entra nel registro sprechi né nel conto dei soldi persi

- **riga** `160` · **categoria** correttezza
- **perché è un difetto**: Due porte per la stessa azione reale, e solo una tiene il conto. Il pasticcere registra qui "20 bignè buttati", lo stock scende, e a fine mese la scheda Sprechi e Omaggi dice che non ha buttato niente. Il valore in euro della perdita non esiste da nessuna parte.
- **prova addotta**: riga 160 scrive solo la RPC stock_pf_scarto → tabella movimenti_stock_pf, che nessun altro file legge (unico consumer: src/lib/stockPF.js). Il registro canonico è SK_MOV: src/components/SpreciOmaggi.jsx:8 ("Store canonico = SK_MOV") e :373 ("il modello SK_MOV e' la verita' contabile"), che infatti chiama scartoPF come effetto collaterale (SpreciOmaggi.jsx:380) e non il contrario. Inoltre il select dei movimenti (stockPF.js:57) non porta `valore_unit`, quindi il costo non è nemmeno calcolabile qui.
- **proposta**: Far scrivere anche il movimento SK_MOV (tipo spreco, causale scelta dall'utente) dentro handleScarto, oppure togliere il form da qui e mandare al modulo Sprechi con prodotto e sede già compilati. Un solo posto dove finiscono le perdite.

### MEDIA · La lista movimenti è tutta rossa in una giornata normale

- **riga** `268` · **categoria** colore
- **perché è un difetto**: Vendere e spedire fanno scendere lo stock: il delta negativo è la normalità, non un problema. Così il pasticcere apre i movimenti e vede venti righe rosse ogni giorno. Un allarme che suona sempre insegna a spegnere gli allarmi, e il giorno che c'è davvero un ammanco quella riga rossa non la guarda nessuno.
- **prova addotta**: riga 268 `color: d > 0 ? C.green : d < 0 ? C.red : C.textSoft` colora di rosso ogni delta negativo, cioè tutte le causali vendita, trasferimento_invio e scarto. In più riga 180 `trasferimento_invio: { lbl: 'Inviato', ic: 'truck', col: '#DC2626' }`: una spedizione a un'altra sede è rossa due volte (etichetta e numero).
- **proposta**: Delta in grigio scuro col segno (-20, +40), rosso solo quando quel movimento porta la giacenza sotto zero. "Inviato" in blu o grigio come "Vendita": è un fatto normale, non un guasto.

### MEDIA · Su telefono la tabella dello stock si schiaccia invece di scorrere

- **riga** `205` · **categoria** mobile
- **perché è un difetto**: Il contenitore ha lo scroll orizzontale ma la tabella non supera mai la sua larghezza, quindi non scorre: le cinque colonne si comprimono, la data va a capo e i due pulsanti si accavallano. Dietro il banco, col telefono in mano, la riga diventa illeggibile.
- **prova addotta**: riga 204 `overflowX: 'auto'` ma riga 205 `<table style={{ width: '100%', ... }}>` senza minWidth. Le altre tabelle dello stesso file lo mettono: riga 429 `minWidth: 480`, riga 1014 `minWidth: 540`, riga 1111 `minWidth: 760`.
- **proposta**: Aggiungere `minWidth: 580` alla table di riga 205, come già fatto nelle altre tre tabelle del file.

### MEDIA · La tabella dei movimenti è dentro overflow hidden: non scorre e taglia le note

- **riga** `255` · **categoria** mobile
- **perché è un difetto**: Cinque colonne, di cui una è una nota scritta a mano libera, in un contenitore che non scorre e che taglia. Su tablet la colonna della nota si riduce a due parole: il motivo dello scarto, cioè l'unica informazione utile di quella riga, non si legge.
- **prova addotta**: riga 255 `borderRadius: 18, overflow: 'hidden'` (non 'auto') e riga 256 table `width: '100%'` senza minWidth; la colonna nota è a riga 271.
- **proposta**: Wrapper esterno col bordo e il raggio, dentro un div con `overflowX: 'auto'` e la table a `minWidth: 620`. La nota va a capo su due righe, non tagliata.

### MEDIA · "Azzera" è alto 23px e sta a 4px da "Scarto": si sbaglia col dito

- **riga** `238` · **categoria** mobile
- **perché è un difetto**: Il pulsante che porta a zero la giacenza è il più piccolo della riga e sta appiccicato all'altro. Sul tablet in laboratorio, con le mani unte, si centra per sbaglio. È l'unico pulsante distruttivo della scheda e non ha nessuna conferma dedicata: il modale che si apre è lo stesso dello scarto, con la quantità già piena.
- **prova addotta**: riga 238 `padding: '4px 10px', fontSize: 11` → circa 23px di altezza; riga 232 "Scarto" ha `minHeight: 36` e `marginRight: 4`. `isMobile` è già calcolato a riga 117 e in questa cella non viene usato.
- **proposta**: Su mobile e tablet i due pulsanti a piena larghezza, uno sotto l'altro, `minHeight: 44` e gap 8. Il modale aperto da "Azzera" deve avere titolo suo ("Porta a zero la giacenza") e dire quanto sta azzerando.

### MEDIA · Data e note dei movimenti a 10px

- **riga** `263` · **categoria** tipografia
- **perché è un difetto**: Dieci pixel non è testo piccolo, è testo che nessuno leggerà: lo dice il commento in cima a questo stesso file. E qui sotto i 12px non ci sono micro-etichette in maiuscoletto, ma il contenuto: quando è avvenuto il movimento e perché.
- **prova addotta**: riga 263 `fontSize: 10` per la data, riga 271 `fontSize: 10` per la nota, riga 256 tabella a `fontSize: 11`, riga 267 causale a `fontSize: 11`, riga 227 "Aggiornato" a `fontSize: 11`. Il vincolo è scritto alle righe 31-41 dello stesso file.
- **proposta**: Data, causale e nota a 12, nome prodotto a 13. Se la larghezza non basta, sacrificare la colonna della nota mandandola a capo sotto il nome, non rimpicciolire il testo.

### MEDIA · "Azzera" registra una correzione tecnica come spreco vero

- **riga** `236` · **categoria** correttezza
- **perché è un difetto**: L'azzeramento serve a cancellare un dato sbagliato, non a dire che il prodotto è stato buttato. Ma finisce a DB con causale scarto, quindi gonfia le perdite: il pasticcere pulisce una giacenza fantasma e si vede peggiorare i numeri degli sprechi. E la nota precompilata è gergo informatico, non italiano da laboratorio.
- **prova addotta**: riga 236 nota 'Azzeramento stock (dato fantasma o reset)' → riga 160 scartoPF → RPC stock_pf_scarto, che scrive causale 'scarto'. La causale giusta esiste già nella legenda (riga 185 `rettifica: { lbl: 'Rettifica', ... }`) ma nessuna funzione di src/lib/stockPF.js la scrive.
- **proposta**: Aggiungere una `rettificaPF` che scrive causale 'rettifica' e usarla per l'azzeramento; nota di default "Correzione della giacenza". Il conto degli sprechi deve contenere solo roba buttata per davvero.

### MEDIA · Ogni ricarica cancella la schermata e mostra "Caricamento…", anche quando non serve

- **riga** `172` · **categoria** struttura
- **perché è un difetto**: Il pasticcere sta guardando la tabella e questa sparisce da sotto gli occhi, sostituita da una scritta grigia, per poi tornare. Succede dopo ogni scarto e anche senza che lui tocchi niente: basta che l'app mostri un avviso qualsiasi. Perde il punto in cui era, e sul telefono perde anche la posizione dello scroll.
- **prova addotta**: riga 127 `setLoading(true)` in ogni `carica`, e riga 172 `if (loading) return <div>Caricamento…</div>` sostituisce tutta la scheda (modale compreso, che è renderizzato dopo, a riga 281). Il riaggancio: `carica` dipende da `notify` (riga 138) e `notify` in src/Dashboard.jsx:1474 è una arrow ricreata a ogni render che fa `setToast` (:1476) più un `setToast(null)` dopo 3 secondi (:1477); ogni toast dell'app cambia quindi l'identità di notify, invalida `carica` e riesegue l'effetto di riga 140.
- **proposta**: Tenere `notify` in una useRef dentro il componente (o avvolgerlo in useCallback in Dashboard) e togliere la dipendenza da `carica`. Distinguere primo caricamento da aggiornamento: al refresh lasciare la tabella a schermo con un piccolo "aggiorno…" nell'intestazione.

### MEDIA · Date senza anno: una giacenza vecchia di un anno sembra aggiornata oggi

- **riga** `228` · **categoria** correttezza
- **perché è un difetto**: La colonna "Aggiornato" serve esattamente a capire se un numero è ancora vero. Scritta senza anno, una riga ferma dal settembre scorso mostra "07/09, 14:32", identica a una di stamattina: la giacenza fantasma diventa invisibile proprio nella colonna che dovrebbe smascherarla.
- **prova addotta**: riga 228 `toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })` senza `year`; stesso formato a riga 264 per i movimenti.
- **proposta**: Formato relativo quando è vicino ("oggi 14:32", "ieri 18:05", "3 giorni fa") e data completa con l'anno oltre la settimana. In grigio se è più vecchia di 7 giorni, così si vede a occhio quale riga non è stata toccata.

### MEDIA · Nessun movimento: la sezione sparisce senza dire niente, e i movimenti sono tagliati a 30 senza avvisare

- **riga** `251` · **categoria** struttura
- **perché è un difetto**: Chi cerca lo scarto registrato lunedì e non lo trova pensa di non averlo registrato, e lo registra di nuovo. Il taglio ai 30 più recenti non è scritto da nessuna parte e non c'è modo di vedere oltre. Se poi i movimenti sono zero, al posto della sezione c'è il vuoto: non si capisce se non è mai successo niente o se qualcosa non funziona.
- **prova addotta**: riga 251 `{movimenti.length > 0 && (` senza ramo else; riga 131 `loadMovimentiPF(orgId, sedeId, { limit: 30 })`; il sottotitolo di riga 253 dice solo 'Ultimi carichi, scarichi e trasferimenti', senza il numero.
- **proposta**: Sezione sempre presente. A zero movimenti: "Ancora nessun movimento in questa sede." Nel sottotitolo scrivere "ultimi 30 movimenti" e mettere un pulsante "Mostra i precedenti" che alza il limite.

### MEDIA · Il modale scarto non si chiude con Esc, si chiude toccando fuori anche mentre salva, e non mette il cursore nel campo

- **riga** `282` · **categoria** accessibilita
- **perché è un difetto**: Il tocco fuori dal riquadro butta via quello che è stato scritto senza chiedere niente, e se capita durante il salvataggio il modale scompare mentre la scrittura va avanti: il pasticcere crede di aver annullato e invece lo scarto è passato, così lo registra di nuovo. Chi lavora da tastiera non ha Esc, e sul tablet servono due tocchi in più perché il cursore non è nel campo.
- **prova addotta**: riga 282-283 `onClick={() => setScartoForm(null)}` sul backdrop, senza controllo su `saving` (che esiste, riga 123). Nessun listener per Escape: quello a riga 607-614 è dentro MagazzinoView e vale solo per `deleteIngConf`. Il riquadro a riga 284 non ha role="dialog" né aria-modal, e l'input di riga 289 non ha autoFocus.
- **proposta**: autoFocus sul campo quantità; Escape che chiude; backdrop inerte quando `saving` è true; `role="dialog" aria-modal="true"` con aria-label "Registra scarto".

### MEDIA · Il delta dei movimenti è un numero grezzo, senza punto delle migliaia e senza unità

- **riga** `269` · **categoria** tipografia
- **perché è un difetto**: Un trasferimento di ottomila grammi si legge "+8000", che a colpo d'occhio si confonde con 800. E senza unità non si sa se sono pezzi o grammi: nella tabella sopra l'unità c'è (riga 222), qui è scomparsa. Sono due numeri della stessa scheda scritti con due regole diverse.
- **prova addotta**: riga 269 `{d > 0 ? '+' : ''}{d}` stampa il Number così com'è, senza toLocaleString('it-IT') usato invece a righe 192, 222 e 225. L'unità non è nemmeno disponibile: il select di src/lib/stockPF.js:57 non porta `unita`.
- **proposta**: `{d > 0 ? '+' : ''}{d.toLocaleString('it-IT')}` e aggiungere `unita` al select di loadMovimentiPF per stampare "+8.000 g".

### MEDIA · "Prodotti in stock" conta anche le righe a zero

- **riga** `191` · **categoria** correttezza
- **perché è un difetto**: È il primo numero che il proprietario legge entrando. La sera, con la vetrina svuotata e tutte le righe a zero, dice ancora "12 prodotti in stock". Un KPI che non cambia mai non è un'informazione.
- **prova addotta**: riga 191 `value={stock.length}` e loadStockPF (src/lib/stockPF.js:22-32) non filtra sulla quantità: le righe restano in tabella con quantita 0 o negativa dopo lo scarico vendite.
- **proposta**: Contare solo `stock.filter(r => Number(r.quantita) > 0).length`, con sub "su 12 prodotti censiti" per non perdere l'altro dato.

### BASSA · Freccia testuale al posto dell'Icon nell'etichetta "Annullo"

- **riga** `184` · **categoria** tipografia
- **perché è un difetto**: Tutte le altre sei causali usano il componente Icon; questa infila un glifo dentro la stringa. Su Windows e su Android quel carattere si rende in modo diverso, a volte come emoji colorata, a volte come quadratino. Ed è l'unica riga della legenda senza icona, quindi l'incolonnamento della colonna causale salta.
- **prova addotta**: riga 184 `annullo_trasferimento: { lbl: '↩ Annullo', col: '#94A3B8' }`: manca la chiave `ic`, che tutte le altre voci hanno (righe 179-185), e il glifo è nel testo. La riga 267 stampa l'icona solo `{c.ic && <Icon .../>}`. Stesso problema minore a riga 161: `notify('✓ Scarto registrato')`.
- **proposta**: `annullo_trasferimento: { lbl: 'Annullo', ic: 'undo', col: '#94A3B8' }` (o l'icona equivalente già presente in components/Icon), e toglere il glifo dal testo del toast.

### BASSA · Lo stato vuoto spiega solo metà di come si popola lo stock, e lo dice da software

- **riga** `201` · **categoria** copy
- **perché è un difetto**: "Lo stock si popola automaticamente" non è come parla una pasticcera: si popola è roba da programmatori. E la frase è anche incompleta, perché i prodotti arrivano pure dalle spedizioni tra sedi: chi aspetta la merce dall'altro punto vendita legge questa frase e va a cercare l'errore nella produzione.
- **prova addotta**: righe 200-201 'Nessun prodotto in stock per questa sede.' + 'Lo stock si popola automaticamente alla conferma di una sessione di produzione.' Ma lo stock viene caricato anche da src/views/InventarioSettimanaleView.jsx:1182-1186 (`caricoProduzionePF` con nota 'Trasferimento da ...').
- **proposta**: "Qui non c'è ancora niente. I prodotti compaiono quando chiudi una produzione o quando ricevi una spedizione da un'altra sede."

### BASSA · Il sottotitolo dello stock negativo usa la notazione matematica "vendite > carico"

- **riga** `194` · **categoria** copy
- **perché è un difetto**: Il maggiore matematico non si legge a colpo d'occhio dietro un banco, e comunque non dice cosa fare. Quel KPI è rosso, quindi è il momento in cui la frase deve spiegare il problema in italiano.
- **prova addotta**: riga 194 `sub={negativi.length > 0 ? 'vendite > carico' : ''}`
- **proposta**: "Hai venduto più di quello che risulta caricato: controlla la produzione di questi prodotti."

### BASSA · Il pulsante "Scarto" disabilitato non dice perché

- **riga** `231` · **categoria** copy
- **perché è un difetto**: Chi ha buttato via merce che il sistema non vede (giacenza a zero perché il carico non è mai stato registrato) trova il pulsante spento, ci clicca due o tre volte e non capisce. Il pulsante accanto ha un title, questo no.
- **prova addotta**: riga 231 `disabled={q <= 0}` e riga 232 imposta solo colore e cursore; nessun `title` né testo di spiegazione, mentre l'"Azzera" di riga 237 ce l'ha.
- **proposta**: `title="Giacenza a zero: non c'è niente da scartare"` e, se serve poterlo fare comunque, lasciarlo attivo avvisando che la giacenza andrà sotto zero.

### BASSA · I messaggi d'errore arrivano in inglese tecnico

- **riga** `165` · **categoria** copy
- **perché è un difetto**: Se salta la rete mentre registra lo scarto, il pasticcere legge "Errore: Failed to fetch". Non capisce se lo scarto è passato o no, e non sa cosa fare. Esiste già l'helper che traduce, e qui non viene usato.
- **prova addotta**: riga 165 `notify('Errore: ' + e.message, false)` e riga 136 `notify?.('Errore caricamento stock: ' + e.message, false)`. src/lib/errors.js espone `friendlyErrorMessage`, e `throwIfError` (usato da scartoPF) rimappa solo l'errore di sessione operativa: tutto il resto passa grezzo.
- **proposta**: `notify(friendlyErrorMessage(e), false)` con fallback "Non sono riuscito a registrare lo scarto. Controlla la connessione e riprova: lo stock non è stato toccato."

### BASSA · Il modale non dice quanto vale lo scarto, pur avendo già il dato in mano

- **riga** `284` · **categoria** struttura
- **perché è un difetto**: È l'unico momento in cui il pasticcere si ferma a pensare a quello che sta buttando. Vedere "stai buttando circa 34 €" cambia il comportamento; vedere solo un numero di pezzi no. Il costo unitario è già stato letto dal database e non viene usato da nessuna parte.
- **prova addotta**: loadStockPF seleziona `valore_unit` (src/lib/stockPF.js:26) ma la stringa `valore_unit` non compare mai nelle righe 116-309 del componente.
- **proposta**: Portare `valore_unit` nello scartoForm e sotto il campo quantità scrivere il valore aggiornato mentre si digita: "Valore di quello che scarti: 34 €" (simbolo dopo la cifra).

### BASSA · Funzione di focus morta dentro il componente: punta a un campo di un'altra scheda

- **riga** `147` · **categoria** struttura
- **perché è un difetto**: Tredici righe che non fanno niente, con un timer e un cleanup, in un componente che si legge già male. Chi domani cerca di capire perché il cursore non finisce nel campo quantità del modale trova questa funzione, crede che il problema sia qui, e perde tempo.
- **prova addotta**: `focusQtyDeferred` è definita alle righe 147-153 di ProdottiFinitiTab e non viene mai chiamata dentro il componente (le uniche chiamate, righe 1013 e 1108, sono nella copia di MagazzinoView definita a riga 587). Cerca `document.getElementById('mag-qty-input')` (riga 150), un id che esiste solo a riga 1251, cioè nella scheda "Carica".
- **proposta**: Cancellare le righe 142-153 (funzione, ref e useEffect di cleanup) e mettere `autoFocus` sull'input di riga 289, che è il comportamento che quella funzione voleva ottenere.


---

## Materie prime

_21 difetti sostenuti_

### ALTA · L'ordinamento di default mette gli ingredienti OK in cima e gli esauriti in fondo

- **riga** `597` · **categoria** correttezza
- **perché è un difetto**: E' la prima schermata del magazzino. Con 100 ingredienti il pasticcere apre la scheda, vede le prime venti righe verdi "OK" e deve scorrere fino in fondo per trovare il burro finito. La colonna Stato esiste proprio per portare in cima quello che ferma la produzione, e fa l'opposto.
- **prova addotta**: riga 597: `useSortable('stato')` → in _shared.jsx riga 406 `defaultDir = 'desc'`, e il comparatore fa `mul = sortDir === 'desc' ? -1 : 1`. La mappa a riga 1148 e' `{ esaurito: 0, critico: 1, attenzione: 2, ok: 3 }`, quindi 'desc' ordina 3→0. Verificato: farina:ok | uova:attenzione | zucchero:critico | burro:esaurito.
- **proposta**: `useSortable('stato', 'asc')`, oppure invertire la mappa (`{ esaurito: 3, critico: 2, attenzione: 1, ok: 0 }`) lasciando 'desc'. La freccia ▼ accanto a "Stato" deve corrispondere a "prima i problemi".

### ALTA · Con 100 ingredienti la tabella rende 100 righe: nessuna ricerca e nessuna paginazione, mentre la scheda Prezzi ha entrambe

- **riga** `1144` · **categoria** struttura
- **perché è un difetto**: E' la tabella piu' pesante delle cinque: 10 colonne per riga, un pulsante soglia, un pulsante elimina, una barra di avanzamento. Per trovare "vaniglia" in un ricettario da 200 voci l'unica strada e' Ctrl+F del browser, che su tablet dietro il banco non esiste. E il commento della scheda accanto dice già che il problema e' noto.
- **prova addotta**: riga 1144: `sortMag(righe, ...).map(...)` senza filtro né limite; nessun `search` né `maxVisible` nel corpo del tab 'giacenze' (righe 1070-1222). Nella stessa pagina, PrezziIngredientiTab righe 346-360: `const [maxVisible, setMaxVisible] = useState(80)` con il commento "Pasticcerie con ricettario completo possono avere 200-500 ingredienti; renderizzarli tutti = 500 row + form input = lag tangibile su mobile", più un campo ricerca a riga 378.
- **proposta**: Portare lo stesso schema della scheda Prezzi: campo "Cerca ingrediente" sopra la tabella (che bypassa il limite) + `maxVisible` 80 con il piede "Mostrati 80 di 214" e "Mostra altri 80" già scritto alle righe 487-505.

### ALTA · Un ingrediente mai inventariato viene mostrato ESAURITO in rosso e conteggiato tra quelli a zero

- **riga** `725` · **categoria** colore
- **perché è un difetto**: Un cliente nuovo carica il ricettario e apre Materie prime: tutte le righe rosse "ESAURITO", la banda rossa "Ingredienti finiti", il KPI "A zero: 35" e una lista di riordino di tutto il magazzino. Non e' vero: quella roba c'e', non e' ancora stata contata. Un allarme che suona alla prima apertura insegna a spegnere gli allarmi. E zero grammi non e' un numero misurato, e' un numero assente.
- **prova addotta**: riga 705-710 `tuttiIngNomi` = unione delle chiavi delle ricette e del magazzino; riga 725 `const m = magPerNorm[k] || {}` → riga 726 `giacenza = m.giacenza_g || 0` → riga 729 `giacenza === 0 ? 'esaurito'`. Per un ingrediente presente solo nel ricettario `magPerNorm[k]` e' undefined, quindi la giacenza diventa 0 e lo stato 'esaurito'. Riga 758: `esauriti = righe.filter(r => r.stato === 'esaurito')` alimenta banda rossa e KPI.
- **proposta**: Distinguere "contato e a zero" da "mai contato": la stessa riga ha già il dato (`m.ultimoRifornimento` undefined → colonna Ultimo riforn. mostra "-"). Aggiungere uno stato 'mai_contato' grigio con etichetta "Da contare", escluso da `esauriti`, dalla banda rossa e dalla lista di riordino.

### ALTA · "Fabb. sett." e "Giorni scorta" usano le ultime 7 SESSIONI, non gli ultimi 7 giorni: il tooltip dell'header dice il falso

- **riga** `1133` · **categoria** correttezza
- **perché è un difetto**: La pasticceria chiude tre settimane ad agosto. Al rientro la pagina prende le ultime 7 giornate di produzione (luglio), le divide per 7 come se fossero una settimana e annuncia "2 gg di scorta" in rosso, con una lista di riordino e una spesa stimata. Il numero e' inventato ma e' presentato come misurato, e sopra c'e' scritto "dal consumo degli ultimi 7 giorni".
- **prova addotta**: riga 1133: `tip="Fabbisogno settimanale stimato dal consumo degli ultimi 7 giorni"`. La funzione che lo calcola, riga 90: `const ultimi7 = [...(giornaliero || [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 7)` — `slice(0,7)` prende 7 elementi dell'array, senza nessun confronto con la data di oggi. Poi riga 728: `const consumoG = fabb / 7`.
- **proposta**: Filtrare per data reale: `.filter(s => s.data >= dataMenoGiorni(todayLocal(), 7))` e dividere per i giorni effettivamente coperti, non per 7 fisso. Se le sessioni nella finestra sono zero, colonna "-" e stato senza copertura (come già fa `giorniScorta === null`). Il tooltip va riscritto solo dopo che dice il vero.

### ALTA · Al dipendente e' nascosta la scheda "Prezzi ingredienti" ma la colonna Valore gli mostra ogni €/kg e il valore totale del magazzino

- **riga** `1057` · **categoria** struttura
- **perché è un difetto**: Se si e' deciso che un dipendente non deve vedere i costi d'acquisto, nasconderli in una scheda e stamparli nella scheda che apre per prima non protegge niente: e' la stessa informazione, riga per riga, più il totale in cima. E fa sembrare che il permesso funzioni.
- **prova addotta**: riga 1057: `.filter(([id]) => !(isDipendente && id === 'prezzi'))` e riga 1339 `{tab === 'prezzi' && !isDipendente && ...}`: sono le uniche due occorrenze di `isDipendente` in tutto il file. Nel tab 'giacenze' righe 1172-1179 la colonna Valore mostra `fmt0(r.valore)` e sotto `{r.costoKg.toLocaleString(...)} €/kg`; riga 936 il KPI "Valore a magazzino" mostra `fmt0(valoreStock)`.
- **proposta**: Se `isDipendente`, non rendere la colonna Valore (né il suo SortTH a riga 1135) e sostituire il KPI "Valore a magazzino" con qualcosa di utile a lui, per esempio "Ingredienti da contare". Stessa decisione anche per il pulsante Elimina di riga 1211, che oggi un dipendente puo' usare su ogni ingrediente.

### ALTA · L'editor della soglia mostra i grammi ma la riga mostra i kg, e non c'e' nessuna unita' di misura nel campo

- **riga** `1193` · **categoria** correttezza
- **perché è un difetto**: Il pulsante dice "0,50 kg". Lo clicchi e nel campo trovi "500". Chi ha appena letto kg scrive "0,5" e conferma: la soglia diventa mezzo grammo e l'avviso di riordino su quell'ingrediente non suonera' mai più, senza un messaggio e senza modo di accorgersene, perche' il pulsante tornera' a mostrare "0,001 kg" in 10,5px.
- **prova addotta**: riga 1198: `setEditSoglia({ nome: r.k, val: r.soglia || '' })` — `r.soglia` e' `soglia_g`, in grammi. Riga 1200 il display e' `fmtG(r.soglia)`, che con unitMode 'kg' (default, riga 579) restituisce "0,50 kg". Riga 1193 l'input non ha né suffisso, né placeholder, né label. Riga 818 `handleSoglia` fa `parseFloat(String(val).replace(',', '.')) || 0` → "0,5" diventa 0.5 grammi.
- **proposta**: Mostrare l'unita' accanto al campo e usare la stessa del toggle: se unitMode e' 'kg' precaricare `r.soglia/1000` e moltiplicare per 1000 al salvataggio, con il suffisso "kg" visibile dentro la riga. In più un controllo di sanita': una soglia sotto 1 g su un ingrediente che ne consuma centinaia va confermata ("Sicura? 0,5 g e' mezzo grammo").

### ALTA · Salvare la soglia su un ingrediente con chiave al plurale crea una seconda voce: la soglia non si puo' più abbassare e il nome viene riscritto

- **riga** `818` · **categoria** correttezza
- **perché è un difetto**: Il file stesso documenta che in produzione esistono chiavi non canoniche ("uova", "nocciole", "mandorle" su Gelateria Demo). Su quelle righe l'utente abbassa la soglia da 2 kg a 500 g, la pagina non protesta, e la soglia resta 2 kg: continua a ricevere l'avviso di riordino su merce che ha deciso di tenere più bassa. E la riga cambia nome sotto gli occhi.
- **prova addotta**: riga 818: `const nm = { ...magazzino, [k]: { ...(magazzino?.[k] || {}), nome: k, soglia_g: ... } }` scrive sotto la chiave CANONICA `k`, ma `magazzino` e' indicizzato con le chiavi grezze (commento righe 665-690). Con raw='uova' e k=normIng('uova')='uovo' (foodcost.js riga 481) `magazzino['uovo']` e' undefined → nasce una voce nuova senza `giacenza_g`, mentre 'uova' conserva la vecchia soglia. Poi riga 680: `acc.soglia_g = Math.max(acc.soglia_g, ...)` → vince sempre la più alta. E riga 684 `if (!acc.nome || raw === k) acc.nome = v?.nome || raw` → la voce nuova ha raw===k, quindi il nome visualizzato passa da "Uova" a "uovo".
- **proposta**: `handleSoglia` deve scrivere su tutte le chiavi grezze della riga (in `magPerNorm` c'e' già `chiaviRaw`, riga 686), come fa `handleDeleteIng` alle righe 631-633. E non deve toccare `nome`: togliere `nome: k`, che oltre a questo appiattisce a minuscolo l'etichetta scritta dall'utente ("Cioccolato Fondente 70%").

### ALTA · "Aggiungi ingrediente" su un ingrediente che esiste già azzera la giacenza e la soglia, senza avviso e senza riga di log

- **riga** `836` · **categoria** correttezza
- **perché è un difetto**: Il pasticcere non ricorda se il burro c'e' già in elenco, apre il pannello, scrive "burro", lascia vuoti i due campi numerici e clicca Aggiungi: i 12 kg di burro in giacenza diventano 0 e la soglia sparisce. Nessun messaggio, nessuna riga nel Log rifornimenti da cui risalire, e la riga diventa rossa "ESAURITO". Questo e' l'unico punto della pagina che perde giacenza senza tracciarla.
- **prova addotta**: riga 836: `const nm = { ...magazzino, [k]: { nome: newIngNome.trim(), giacenza_g: parseFloat(newIngQty) || 0, soglia_g: parseFloat(newIngSoglia) || 0, ultimoRifornimento: new Date().toISOString() } }` — nessuna lettura di `magazzino[k]` prima di sovrascrivere, nessun `ssave(SK_LOGRIF, ...)` (`handleCarica` a riga 789 invece scrive il log). Riga 834 `if (!newIngNome) return`, quindi il nome duplicato non e' nemmeno controllato.
- **proposta**: Se `magPerNorm[k]` esiste già, non salvare: mostrare "Burro e' già in magazzino con 12,00 kg. Vuoi caricarne altro?" con il pulsante che porta a Carica merce (`setTab('carica')`, come fa il click sul nome a riga 1154). Se il nome e' vuoto, un notify invece del `return` muto.

### ALTA · La tabella parte da 11px e scende a 10 e 10,5 nelle colonne Ultimo riforn. e Soglia; l'header e' a 10px

- **riga** `1128` · **categoria** tipografia
- **perché è un difetto**: E' la regola scritta a riga 34 di questo stesso file: sotto i 12px non si legge, dietro un banco, a sessant'anni. La data dell'ultimo rifornimento a 10px e la soglia a 10,5px sono i due dati su cui si decide un ordine; l'header a 10px maiuscolo spaziato e' quello che dice cosa sono le nove colonne.
- **prova addotta**: riga 1128: `fontSize: 11` sull'elemento table, ereditato da ogni cella che non lo sovrascrive (nome riga 1152, Fabb. sett. riga 1167, Giorni scorta riga 1168, l'importo di Valore riga 1173). Riga 1207: `fontSize: 10` sulla data. Riga 1199: `fontSize: 10.5` sul pulsante soglia. Header: `SortTH` in _shared.jsx riga 442 `fontSize: 10`. Il commento a righe 30-40 lo ammette: "Restano da alzare i 10 e gli 11 residui: si tocca la larghezza delle colonne di una tabella a nove colonne".
- **proposta**: Base tabella a 13, header a 11 (minimo per il maiuscoletto spaziato, coerente con il resto della pagina), data e pulsante soglia a 12. Le nove colonne non ci stanno più in 760px: e' il momento di togliere "Fabb. sett." (informazione che serve solo a spiegare "Giorni scorta", puo' stare nel tooltip) e di alzare `minWidth` a ~900, il contenitore ha già `overflowX: 'auto'` a riga 1127.

### ALTA · Su tablet e telefono l'editor della soglia e il toggle kg/g sono sotto i 40px, e il campo a 11px fa zoomare iOS

- **riga** `1193` · **categoria** mobile
- **perché è un difetto**: La soglia si imposta in laboratorio col tablet in mano, spesso con le dita infarinate. Un campo alto 22px e un pulsante di conferma da 24×24 accanto al pulsante Elimina della stessa riga sono un invito a sbagliare cella. E l'input a 11px fa zoomare Safari sul campo appena lo tocchi, spostando la tabella e nascondendo la riga che stavi modificando.
- **prova addotta**: riga 1193-1194: input `width: 70, padding: '4px 6px', fontSize: 11` → circa 22px di altezza, sotto i 16px richiesti da iOS. Riga 1195: pulsante ✓ `padding: '4px 8px', fontSize: 11` → circa 24×24. Riga 1096-1099 toggle kg/g: `padding: '6px 12px', fontSize: 11.5` → circa 28px. Riga 1105 "+ Aggiungi ingrediente": `padding: '8px 16px', fontSize: 12` → circa 34px. Riga 1213 pulsante Elimina: `width: isMobile ? 40 : 30` e `useIsMobile` (useIsMobile.js riga 4) e' true solo sotto 768px → su iPad (768-1023, `useIsTablet`) resta 30×30. Il pannello di aggiunta a righe 1117-1122 e' fatto giusto: `minHeight: 44` e `fontSize: isMobile ? 16 : 13`.
- **proposta**: Applicare all'editor soglia lo stesso schema del pannello di aggiunta: `minHeight: 44` e `fontSize: isMobile ? 16 : 13` sull'input, pulsanti da 44px su touch. Per il pulsante Elimina la condizione giusta e' `isMobile || isTablet` (isTablet e' già importata a riga 574), non solo `isMobile`. Toggle e pulsante Aggiungi: 40px su touch, sul desktop possono restare della dimensione del testo.

### ALTA · Il modale di eliminazione mostra un nome diverso da quello della riga: la chiave normalizzata invece del nome scritto dall'utente

- **riga** `1362` · **categoria** correttezza
- **perché è un difetto**: E' l'unica conferma prima di un'operazione dichiarata permanente, e serve a rispondere a una sola domanda: sto cancellando la cosa giusta? La riga dice "Uova", il modale dice "Uovo" (o addirittura la chiave grezza in minuscolo per un ingrediente che sta solo nel ricettario). Chi ha un dubbio annulla; chi non lo nota cancella dopo aver letto un nome che non aveva chiesto.
- **prova addotta**: riga 1362: `{magazzino?.[deleteIngConf]?.nome || deleteIngConf}` — `deleteIngConf` e' impostato a riga 1211 con `r.k`, la chiave CANONICA, mentre `magazzino` e' indicizzato con le chiavi grezze. Con la chiave salvata "uova" e k='uovo' (foodcost.js riga 481) il lookup e' undefined e cade sul fallback, stampando 'uovo'. Il file stesso, righe 670-674, elenca le chiavi non canoniche viste in produzione: "uova, noci, nocciole, mirtilli, mandorle".
- **proposta**: Salvare la riga, non la chiave: `setDeleteIngConf(r)` a riga 1211 e nel modale usare `deleteIngConf.nome` (lo stesso `r.nome` che la tabella mostra), passando `deleteIngConf.k` a `handleDeleteIng`. In più mostrare la giacenza che si sta buttando: "Uova — 2,40 kg in giacenza".

### ALTA · I KPI dicono "clicca per vedere cosa ordinare" ma il componente KPI non riceve onClick: il click non fa niente

- **riga** `43` · **categoria** correttezza
- **perché è un difetto**: E' la scorciatoia per arrivare alla lista di riordino da un magazzino di cento voci, e la card lo promette per iscritto. Chi clicca non ottiene niente, non c'e' nemmeno il cursore a mano che confermi che sia cliccabile: l'utente conclude che l'app non risponde e scorre a mano.
- **prova addotta**: riga 43: `function KPI({ label, value, sub, color, highlight, icon })` — `onClick` non e' fra le props destrutturate e nel corpo (righe 44-73) non compare, quindi viene scartato. I chiamanti lo passano: righe 952-955 e 959-962 `onClick={critici.length > 0 ? () => { const el = document.getElementById('riordino-urgente'); ... } : undefined}`, con il sottotitolo `sub={critici.length > 0 ? 'clicca per vedere cosa ordinare' : 'tutto ok'}` a riga 951 e `'clicca per vedere quali'` a riga 958.
- **proposta**: Aggiungere `onClick` alla firma e metterlo sul div esterno, con `cursor: onClick ? 'pointer' : 'default'`, `role="button"`, `tabIndex={0}` e Enter/Spazio quando e' presente. Finche' non funziona, il sottotitolo non deve dire "clicca".

### MEDIA · Il pannello di aggiunta legge le quantita' con parseFloat senza la virgola: "1,5" diventa 1

- **riga** `836` · **categoria** correttezza
- **perché è un difetto**: Su tablet i due campi hanno la tastiera decimale italiana, quindi il tasto e' la virgola. Chi scrive "1,5" per un chilo e mezzo si ritrova 1 g in giacenza (il campo e' in grammi) e nessun errore. Nella stessa pagina lo stesso problema era già stato trovato e corretto due volte.
- **prova addotta**: riga 836: `parseFloat(newIngQty) || 0` e `parseFloat(newIngSoglia) || 0`, senza replace. A riga 776 lo stesso calcolo e' `parseFloat(String(formQty).replace(',', '.'))` con il commento "Audit 2026-07-01 MEDIUM: locale IT usa la virgola decimale", e a riga 818 `handleSoglia` fa la replace. Verificato: `parseFloat('1,5')` = 1, con replace = 1.5. Riga 1116 imposta `inputMode="decimal"`, cioe' la tastiera con la virgola.
- **proposta**: Un solo helper nel file, `numIT = v => parseFloat(String(v).replace(',', '.'))`, usato in `handleCarica`, `handleSoglia` e `handleAddIngrediente`, così la prossima aggiunta non ripete l'errore.

### MEDIA · Il toggle kg su quantita' piccole: la vaniglia da 120 g si legge "0,120 kg", e sotto il grammo diventa "0,000 kg"

- **riga** `870` · **categoria** tipografia
- **perché è un difetto**: Nessun pasticcere pensa la vaniglia, il pistacchio o l'agar in chili. "0,120 kg" costringe a contare gli zeri per capire se sono 120 grammi o 12, in una cella da 11px accanto ad altre otto colonne. E il caso peggiore e' silenzioso: una giacenza residua sotto il grammo viene stampata "0,000 kg", che si legge come zero mentre lo stato della riga non dice "Esaurito" — due informazioni che si contraddicono nella stessa riga.
- **prova addotta**: riga 870-873: `if (unitMode === 'g') return ...; return (n/1000).toLocaleString('it-IT', { minimumFractionDigits: n >= 1000 ? 2 : 3, maximumFractionDigits: n >= 1000 ? 2 : 3 }) + ' kg'`. Verificato: 120 → "0,120 kg"; 5 → "0,005 kg"; 0,4 → "0,000 kg"; 0 → "0,000 kg". `fmtG` e' usata su Giacenza (riga 1159), Fabb. sett. (1167) e Soglia (1200).
- **proposta**: Anche in modalita' kg, sotto il chilo mostrare i grammi: `if (n < 1000) return Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' }) + ' g'`. Non e' il "mix" che il commento a riga 869 voleva evitare — quello era mostrare 28.000 g e 0,80 kg nella stessa colonna; questo e' scegliere l'unita' in cui l'ingrediente viene davvero pesato. In più: per una giacenza a zero stampare "0 g", non tre decimali di niente.

### MEDIA · Numeri fra 1.000 e 9.999 senza il punto delle migliaia: "1500 g" nella colonna Giacenza, "5000 gg" in Giorni scorta

- **riga** `872` · **categoria** tipografia
- **perché è un difetto**: E' la regola dei numeri italiani, e la fascia 1.000-9.999 e' esattamente quella dei sacchi di farina e zucchero: la colonna che si guarda più spesso e' quella che perde il separatore. Il problema era già stato trovato e risolto in _shared.jsx, ma `fmtG` non ha ricevuto la correzione.
- **prova addotta**: riga 872: `Math.round(n).toLocaleString('it-IT')` senza opzioni. La locale it-IT ha minimumGroupingDigits=2, quindi non raggruppa i numeri a 4 cifre: verificato con ICU 78.2, `(1500).toLocaleString('it-IT')` = "1500", con `{useGrouping:'always'}` = "1.500" (12000 invece viene già "12.000"). _shared.jsx righe 41-47 documenta il caso e forza `useGrouping: 'always'` su tutti e tre gli helper valuta. Stessa mancanza a riga 1170: `${r.giorniScorta.toFixed(0)} gg` — `toFixed` non raggruppa mai.
- **proposta**: `fmtG`: `toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })`. Per Giorni scorta usare lo stesso formattatore e tagliare i valori assurdi: un ingrediente con 5.000 giorni di scorta non ha bisogno di un numero, gli basta "oltre 90 gg".

### MEDIA · La colonna "Da ordinare" ignora il toggle kg/g: nella stessa riga si leggono "28.000 g" e "~ 1,5 kg"

- **riga** `876` · **categoria** tipografia
- **perché è un difetto**: Il toggle promette che tutti i pesi della pagina cambiano insieme (lo dice il commento a riga 1094). Se in modalita' grammi la giacenza e' in grammi e la quantita' da ordinare in chili, per capire se l'ordine copre la scorta bisogna convertire a mente, e questo e' proprio il "mix" che il commento di fmtG dichiarava di aver eliminato.
- **prova addotta**: riga 876-880: `fmtRiordino` non legge `unitMode`: `if (g < 1000) return Math.ceil(g/100)*100 + ' g'`, altrimenti kg. Usata a riga 1184 nella colonna "Da ordinare" (e a riga 1023 nella lista di riordino) nella stessa riga in cui riga 1159 usa `fmtG(r.giacenza)`.
- **proposta**: Passare `unitMode` anche a `fmtRiordino`: arrotondare agli step pratici come oggi (100 g / 0,5 kg) e poi formattare con `fmtG`, così le due colonne restano nella stessa unita'.

### MEDIA · Il modale non dice la cosa che conta: l'ingrediente resta nelle ricette ma esce per sempre dal magazzino

- **riga** `1345` · **categoria** copy
- **perché è un difetto**: "Questa azione e' permanente" non spiega cosa diventa permanente. L'eliminazione aggiunge la chiave agli esclusi, quindi se l'ingrediente e' usato in una ricetta continuera' a pesare sul food cost ma non avra' più giacenza, né soglia, né avviso di riordino, e non ricomparira' in elenco. Il pasticcere si aspetta "lo togli dalla lista", non "smetti di controllarlo".
- **prova addotta**: riga 1345 `Stai per eliminare ... dal magazzino.` e riga 1347 `Questa azione è permanente.`. `handleDeleteIng` righe 628-642: cancella tutte le chiavi grezze E fa `nuoviEsclusi.add(k)` + `ssave(SK_EXCL, ...)`; a riga 707 `tuttiIngNomi` filtra `.filter(k => !esclusi.has(k))`, quindi la riga non torna nemmeno se una ricetta la usa.
- **proposta**: Frase concreta al posto di "permanente": "Sparisce dall'elenco e non riceverai più avvisi di riordino. Se una ricetta lo usa, continuera' a essere calcolato nel costo." E se l'ingrediente e' in una ricetta, dirlo per nome: "Usato in 3 ricette (Sacher, Millefoglie, Bignè)".

### MEDIA · L'header e' allineato a destra e i numeri sotto sono centrati: sei colonne su nove non sono incolonnate

- **riga** `1132` · **categoria** tipografia
- **perché è un difetto**: Su una tabella a nove colonne l'occhio scende lungo la colonna. Se "GIACENZA" e' a destra e i valori sono al centro, ogni numero e' spostato di venti pixel rispetto alla sua intestazione, e i numeri fra loro non sono incolonnati (2,40 kg e 28,00 kg centrati hanno la virgola in due posti diversi). E' anche uno spreco del `tabular-nums` che il codice imposta riga per riga proprio per allineare le cifre.
- **prova addotta**: header a destra: righe 1132 (giacenza), 1133 (fabb), 1134 (giorniScorta), 1137 (soglia), 1139 (ultimoRif) con `right`; riga 1138 (stato) a sinistra. Celle corrispondenti tutte `textAlign: 'center'`: 1157, 1167, 1168, 1190, 1204, 1207. Le due colonne fatte bene sono Valore (header 1135 right, cella 1172 right) e Da ordinare (1136 / 1181).
- **proposta**: Le colonne numeriche (Giacenza, Fabb. sett., Giorni scorta, Soglia) a destra sia nell'header sia nella cella; Stato e Ultimo riforn. a sinistra in entrambi. Un solo posto in cui decidere l'allineamento: un array di definizione delle colonne condiviso da `<thead>` e `<tbody>`, invece di nove `SortTH` e dieci `<td>` da tenere d'accordo a mano.

### MEDIA · Con zero ingredienti la tabella resta una card con la sola riga di intestazione, senza nessuna spiegazione

- **riga** `1126` · **categoria** struttura
- **perché è un difetto**: E' la schermata del primo giorno, quella che decide se il cliente capisce da dove si comincia. Nove intestazioni maiuscole a 10px e il vuoto sotto non dicono "aggiungi il primo ingrediente", dicono "e' rotto". Le altre tre schede della stessa pagina questo problema lo hanno già risolto.
- **prova addotta**: righe 1126-1220: nessun controllo su `righe.length === 0`, il `<tbody>` si limita a mappare l'array vuoto. Nella stessa pagina: riga 197 `{stock.length === 0 ? ...}` "Nessun prodotto in stock per questa sede", riga 438-440 "Nessun ingrediente disponibile.", riga 1324-1327 "Nessun rifornimento registrato".
- **proposta**: Se `righe.length === 0`, al posto della tabella: "Il magazzino e' vuoto. Aggiungi il primo ingrediente, o carica il ricettario e li trovi già in elenco." con il pulsante che apre il pannello di aggiunta (`setShowAddIng(true)`).

### MEDIA · Tutta la cella del nome e' cliccabile e cambia scheda; l'unico indizio e' una freccia a 11px con opacita' 0,4 e un tooltip che dice "precompila form"

- **riga** `1152` · **categoria** copy
- **perché è un difetto**: Su tablet non esiste il passaggio del mouse: quel tooltip non lo leggera' nessuno, e toccare il nome per scorrere la lista o per leggerlo meglio porta l'utente su un'altra scheda con il campo già compilato — sembra un errore dell'app. "Form" poi e' una parola da software: nella pagina si chiama "Carica merce". E la cella non e' un pulsante, quindi da tastiera non e' raggiungibile.
- **prova addotta**: riga 1152-1155: `<td ... cursor: 'pointer'` con `title="Clic rapido → precompila form"` e `onClick={() => { setQuickLoad(r.k); setFormIng(r.nome); setTab('carica'); focusQtyDeferred() }}`; l'affordance e' `<span style={{ fontSize: 11, opacity: 0.4 }}>↗</span>`. Nessun `role`, `tabIndex` o gestione tastiera (il `SortTH` di _shared.jsx riga 427-436 invece li ha tutti).
- **proposta**: Un vero pulsante visibile in fondo alla riga, con l'icona e la parola: `<Icon name="plus" /> Carica`, esattamente come quello della lista di riordino a righe 1042-1045 di questa stessa pagina. La cella del nome torna testo selezionabile, e l'azione diventa raggiungibile anche da tastiera.

### MEDIA · Nel corpo della tabella si usano i caratteri ✓ ✕ ↗ invece del componente Icon

- **riga** `1195` · **categoria** accessibilita
- **perché è un difetto**: E' la regola del progetto: mai glifi decorativi, si usa Icon (SVG). Non e' solo coerenza visiva — questi caratteri cambiano forma e peso da un dispositivo all'altro (su alcuni Android/iOS il ✓ viene reso come glifo colorato) e uno screen reader legge "segno di spunta" su un pulsante il cui unico scopo e' salvare la soglia. Nella stessa riga il pulsante Elimina, fatto giusto, usa `<Icon name="trash" />` con `aria-label`.
- **prova addotta**: riga 1195: `>✓</button>` (conferma soglia, nessun aria-label). Riga 1122: `>✕</button>` (chiude il pannello di aggiunta). Riga 1155: `↗` nella cella del nome. Fuori dalla tabella la stessa abitudine: riga 645 `notify('✓ Ingrediente eliminato dal sistema')`, riga 852 `notify('✓ ' + newIngNome + ' aggiunto al magazzino')`, riga 1105 il "+" testuale di "+ Aggiungi ingrediente" (mentre riga 1044 usa `<Icon name="plus" size={12} />`).
- **proposta**: `<Icon name="check" size={14} />` con `aria-label="Salva soglia"` sul pulsante di conferma, `<Icon name="x" />` sulla chiusura, `<Icon name="plus" />` su "Aggiungi ingrediente". La freccia ↗ sparisce insieme alla cella cliccabile. Nei notify il ✓ va togliuto e basta: "Burro aggiunto al magazzino" e' già una conferma.


---

## Prezzi ingredienti

_20 difetti sostenuti_

### ALTA · Il log dei prezzi va in crash se una riga non ha il campo delta

- **riga** `415` · **categoria** correttezza
- **perché è un difetto**: Basta premere "Log modifiche" e la scheda muore: schermata bianca o errore, e il pasticcere non ha piu' nessun modo di vedere lo storico prezzi ne' di lavorare in quella scheda finche' non ricarica. Le due righe sopra (412-413) si difendono con `|| 0`, questa no.
- **prova addotta**: Riga 415: `{l.delta.toLocaleString('it-IT', {...})}` senza guard. Le entry seminate da /Users/aler/foodos/src/lib/demoSeedFull.js:527-536 (buildLogPrezzi) sono `{ id, ingrediente, prezzoVecchio, prezzoNuovo, data, note }` - NON hanno `delta` ne' `deltaPct`. `undefined.toLocaleString()` -> TypeError in render. Righe 412-413 invece usano `(l.prezzoVecchio || 0)`.
- **proposta**: Calcolare il delta in modo difensivo prima del render: `const dl = Number.isFinite(Number(l.delta)) ? Number(l.delta) : (Number(l.prezzoNuovo)||0) - (Number(l.prezzoVecchio)||0)` e usare `dl` sia per il colore (riga 414) sia per il testo. Stessa cosa per `deltaPct`, ricalcolandolo da prezzoVecchio quando manca.

### ALTA · Simbolo € prima della cifra in tutti i punti della scheda, e percentuali col punto

- **riga** `412` · **categoria** tipografia
- **perché è un difetto**: E' la regola scritta del progetto e qui e' violata sei volte di fila, nell'unico posto dove il pasticcere legge dei prezzi. Nella stessa pagina la scheda Giacenze scrive "8,50 €/kg" (riga 1176) e qui si legge "€ 8,50/kg": due modi diversi nella stessa schermata. E "+€ 1,50" (riga 534) non e' italiano, il segno finisce prima del simbolo.
- **prova addotta**: Riga 412 e 413: `€ {(l.prezzoVecchio || 0).toLocaleString(...)}/kg`. Riga 525: `€ {row.prezzoKg.toLocaleString(...)}/kg`. Riga 529: `€ {confirmVal.toLocaleString(...)}/kg`. Riga 534: `{delta > 0 ? '+' : ''}€ {delta.toLocaleString(...)}`. Percentuali con il punto decimale: riga 416 `{l.deltaPct.toFixed(1)}%` e riga 534 `{deltaPct.toFixed(1)}%` -> "12.5%" accanto a "12,50". In /Users/aler/foodos/src/views/_shared.jsx:50-58 esistono gia' `fmt` ("1.234,56 €") e `fmtp` ("12,5%"), con un commento (righe 53-56) che spiega proprio perche' toFixed(1) e' stato bandito. Riga 20 importa solo `fmt0`, non `fmt` ne' `fmtp`.
- **proposta**: Importare `fmt` e `fmtp` da ./_shared e sostituire tutte le formattazioni a mano: `{fmt(l.prezzoVecchio)}/kg`, `{fmt(confirmVal)}/kg`, `{delta > 0 ? '+' : ''}{fmt(delta)}`, `({deltaPct > 0 ? '+' : ''}{fmtp(deltaPct)})`. Risolve in un colpo posizione dell'euro, virgola decimale e separatore migliaia (i toLocaleString a mano non passano `useGrouping: 'always'`, il bug documentato in _shared.jsx:42-46).

### ALTA · La scheda non distingue prezzo inserito da prezzo stimato: chi ha una stima HORECA in uso vede "-"

- **riga** `330` · **categoria** correttezza
- **perché è un difetto**: Il food cost gira su un prezzo indovinato (farina 0,88 €/kg dal listino hardcoded) e la scheda dei prezzi - l'unico posto dove si va a sistemare - dice solo "Prezzo da impostare" senza mostrare quale numero sta girando nel frattempo. Il pasticcere non ha modo di capire se il suo food cost e' misurato o inventato. La scheda Giacenze, nello stesso file, lo fa correttamente.
- **prova addotta**: Riga 323 legge il dato grezzo: `const costi = ricettario?.ingredienti_costi || {}`, mai `buildIngCosti`. Riga 330: `prezzoKg: c?.costoKg || 0, haPrezzo: !!c && c.costoKg > 0`. In /Users/aler/foodos/src/lib/foodcost.js:767-780 `buildIngCosti` riempie i buchi con `PREZZI_HORECA` marcandoli `isStima: true` e marca `isStima: false` quelli dell'utente; quel valore e' quello che alimenta i food cost (Dashboard.jsx:522). Nello stesso file, righe 745 e 1177, la scheda Giacenze fa `const prezzoStimato = !!ingCosti[k]?.isStima` e stampa "8,50 €/kg · stima" con il commento (righe 740-744) "un numero inventato presentato come misurato e' peggio di un numero assente".
- **proposta**: Costruire la lista da `buildIngCosti(ricettario?.ingredienti_costi)` e portare `isStima` nella riga. Per gli stimati mostrare il valore vero con l'etichetta "stima" (stesso trattamento della riga 1177) invece di "-", e cambiare il chip in "Stima di mercato" cliccabile; tenere "Prezzo da impostare" solo per chi non ha nemmeno la stima. Derivare inoltre il €/kg da costoG quando costoKg manca (`costoKg ?? costoG*1000`): le entry di demoSeedFull.js:80-107 hanno solo `costoG`, e con la riga 330 attuale finiscono tutte a "-" con il chip giallo pur avendo il prezzo.

### ALTA · Nessun blocco sul doppio clic di "Conferma e salva": la prima riga di log si perde

- **riga** `557` · **categoria** correttezza
- **perché è un difetto**: Dietro il banco, con la rete lenta, il secondo clic e' la norma. Il risultato non e' un doppione innocuo: la seconda scrittura ricostruisce il log dalla lista vecchia e cancella la riga appena scritta. Lo storico prezzi e' quello che regge i food cost retroattivi, perderci una riga significa un P&L sbagliato senza che nessuno lo veda.
- **prova addotta**: Riga 557: `<button onClick={confermaSalva} ...>` senza `disabled`. `confermaSalva` (righe 363-371) non ha nessuno stato `saving`. Il gestore in /Users/aler/foodos/src/Dashboard.jsx:1841 fa `const nextLog = [entry, ...(logPrezzi||[])]` con la `logPrezzi` catturata dalla closure: due chiamate ravvicinate vedono la stessa lista, la seconda ssave sovrascrive senza la entry della prima. Gli id sono `lp-${Date.now()}` (Dashboard.jsx:1830), nello stesso millisecondo collidono anche come key React. Nello stesso file MagazzinoView i pulsanti di scrittura usano il pattern giusto (`disabled={saving}`, righe 302 e 1371).
- **proposta**: Aggiungere `const [saving, setSaving] = useState(false)` nella tab; in `confermaSalva` uscire subito se `saving`, mettere `setSaving(true)` prima dell'await e `setSaving(false)` in finally; sul pulsante `disabled={saving}` con testo "Salvataggio…". Chiudere la modale solo se la scrittura e' andata a buon fine (oggi righe 369-370 chiudono comunque: se ssave fallisce la modale si chiude come se avesse salvato e in tabella resta il prezzo vecchio).

### ALTA · Prezzo con decorrenza futura: si salva e non si vede niente, ne' in tabella ne' nel log

- **riga** `543` · **categoria** correttezza
- **perché è un difetto**: E' la funzione centrale di questa modale. Il pasticcere imposta il burro a 9,20 €/kg dal 1 ottobre, conferma, e la tabella continua a mostrare 7,20 €/kg senza una parola. Pensa che non sia salvato e ripete l'operazione: tre righe di log, tre prezzi programmati. Un errore di battitura sull'anno (2062 e' un carattere di distanza) sparisce nel nulla e non si puo' correggere, perche' la scheda non mostra mai i prezzi programmati.
- **prova addotta**: La modale scrive `decorreISO` (riga 367) e il gestore /Users/aler/foodos/src/Dashboard.jsx:1809-1826 con `isFuture` vero NON aggiorna `ingredienti_costi`, scrive solo la entry di log con `pianificato: true` (riga 1839). In PrezziIngredientiTab il campo `pianificato` e `decorre_da` non compaiono mai (grep su tutto il file: nessuna occorrenza), quindi ne' la riga della tabella ne' la tabella del log li mostrano. L'input di riga 543 e' un `type="date"` senza `min` ne' `max`.
- **proposta**: Nella riga della tabella, se esiste una entry di log con `pianificato === true` per quella chiave, mostrare sotto il prezzo attuale una seconda riga tipo "dal 01/10: 9,20 €/kg" con un pulsante per annullarla. Nel log, aggiungere la colonna "Decorre da" (il dato c'e' gia': `decorre_da`, Dashboard.jsx:1832) e distinguere le righe programmate. Mettere `min={todayLocal()}` e un `max` a un anno (o un avviso esplicito per le date passate: oggi il testo di riga 546 promette che "le produzioni precedenti mantengono il prezzo storico", ma con una decorrenza retrodatata i food cost passati cambiano davvero).

### ALTA · Prezzo scritto male: il pulsante Salva non fa niente e non dice niente

- **riga** `356` · **categoria** correttezza
- **perché è un difetto**: Chi scrive "7,20" con la virgola (cioe' chiunque, in Italia, e sull'iPad il tastierino mostra la virgola) rischia un campo che il browser considera non valido: clicca Salva, non succede nulla, nessun messaggio, la riga resta aperta in modifica. Da fuori sembra il gestionale rotto. Lo stesso vale per il campo lasciato vuoto.
- **prova addotta**: Riga 355-356: `const v = parseFloat(editVal.replace(',', '.')); if (isNaN(v) || v < 0) return` - ritorno muto. Il campo e' `type="number"` (riga 458): quando il valore non e' un numero valido `e.target.value` arriva stringa vuota, quindi `parseFloat('')` = NaN. La tab non riceve nemmeno `notify` fra le props (riga 312: `{ ricettario, logPrezzi, onUpdatePrezzo, isMobile }`), quindi non ha alcun canale per avvisare. Il `.replace(',', '.')` dimostra che la virgola era prevista, ma con type=number non arriva.
- **proposta**: Passare `notify` alla tab (c'e' gia' fra le props di MagazzinoView, riga 570) e in `tentaSalva` avvisare: `notify('Scrivi il prezzo al chilo, per esempio 7,20', false)`. Meglio ancora: `type="text"` con `inputMode="decimal"`, cosi' la virgola arriva sempre e il `replace` funziona, e bordo rosso sul campo finche' il valore non e' leggibile.

### ALTA · Testo a 10px sulla spiegazione della decorrenza, e 11px su chip e pulsante

- **riga** `545` · **categoria** tipografia
- **perché è un difetto**: Quelle tre righe a 10px sono l'unico posto dove si spiega che il prezzo vale da una data in poi e che le produzioni vecchie tengono il prezzo storico. E' il concetto piu' delicato della scheda, scritto nel corpo piu' piccolo della pagina: chi ha sessant'anni non lo legge e sbaglia la data. Il file stesso, righe 29-41, dice che sotto i 12px non si legge.
- **prova addotta**: Riga 545: `fontSize: 10` sul blocco "Il nuovo prezzo si applica dalla data scelta in poi…". Altri sotto-soglia nella stessa scheda: riga 381 `fontSize: 11` sul pulsante "Log modifiche" (testo, non etichetta), riga 453 `fontSize: 11` sul chip "Prezzo da impostare", riga 416 `fontSize: 11` sulla percentuale nel log, righe 524/528/532 `fontSize: 11` sulle etichette della modale.
- **proposta**: Portare riga 545 a 12px (e' testo, non micro-etichetta) e a 12px anche il chip di riga 453, il pulsante di riga 381 e la percentuale di riga 416. Se la modale diventa troppo alta, accorciare il testo invece di rimpicciolirlo: "Il prezzo vale dal giorno che scegli. Le produzioni di prima tengono il prezzo vecchio."

### ALTA · Su tablet e telefono i campi zoomano: isMobile arriva alla tab e non viene mai usato

- **riga** `378` · **categoria** mobile
- **perché è un difetto**: Su iPad e iPhone, toccare un input sotto i 16px fa zoomare la pagina: il pasticcere tocca il prezzo del burro, la schermata salta, deve pinchare per tornare indietro, e lo fa per ogni ingrediente. Nello stesso file i campi della scheda Carica/Scarica sono fatti giusti, qui no.
- **prova addotta**: Riga 312: `isMobile` e' fra le props ed e' passato dal chiamante (riga 1318), ma nel corpo della tab non compare mai. Riga 378 ricerca: `fontSize: 12`. Riga 465 campo prezzo: `fontSize: 13`. Confronto nello stesso file, righe 1117, 1291, 1298, 1303: `fontSize: isMobile ? 16 : 13`.
- **proposta**: Applicare lo stesso pattern gia' usato nel file: `fontSize: isMobile ? 16 : 13` sul campo prezzo (riga 465) e sulla ricerca (riga 378), e `fontSize: isMobile ? 16 : 13` anche sull'input data della modale (riga 544).

### MEDIA · Bersagli da toccare sotto i 40px: il prezzo cliccabile e' alto 22px

- **riga** `467` · **categoria** mobile
- **perché è un difetto**: Il modo principale per modificare un prezzo e' toccare il numero, e su tablet quel numero e' un bersaglio da 22px: si sbaglia riga e si apre in modifica l'ingrediente sbagliato. Anche i pulsanti Salva/Annulla/Modifica restano sotto la soglia. Sul desktop 36px vanno benissimo, il problema e' solo che non c'e' la variante mobile.
- **prova addotta**: Righe 467-468: `<span onClick={() => startEdit(row)} ... padding: '4px 8px'>` con font ereditato 12px -> circa 22px di altezza, nessun minHeight. Righe 476, 477, 480: `minHeight: 36`. Riga 378 ricerca: `padding: '9px 14px'` con fontSize 12 -> circa 34px. `isMobile` e' disponibile e inutilizzato (riga 312).
- **proposta**: `minHeight: isMobile ? 40 : 36` sui tre pulsanti (476, 477, 480), `padding: isMobile ? '10px 12px' : '4px 8px'` con `minHeight: isMobile ? 40 : 0` sullo span del prezzo, `padding: isMobile ? '12px 14px' : '9px 14px'` sulla ricerca. Come nella riga 1213 dello stesso file, che usa gia' `isMobile ? 40 : 30`.

### MEDIA · Il log non dice da quando vale il prezzo, ne' chi l'ha cambiato

- **riga** `402` · **categoria** struttura
- **perché è un difetto**: Il log serve a due domande vere: "da quando pago il burro 9,20?" e "chi l'ha cambiato?". Mostra solo il momento del salvataggio, quindi una modifica registrata il 28 settembre e decorrente dal 1 ottobre appare come se fosse in vigore dal 28: quando il commercialista chiede perche' il food cost di settembre non torna, il log risponde la cosa sbagliata. Entrambi i dati sono gia' salvati e semplicemente non vengono mostrati.
- **prova addotta**: Riga 402: `['Data', 'Ingrediente', 'Vecchio', 'Nuovo', 'Δ']`. Le entry contengono anche `decorre_da` (/Users/aler/foodos/src/Dashboard.jsx:1832), `utente` (1838) e `pianificato` (1839); nessuno di questi campi compare nel file (grep: nessuna occorrenza in MagazzinoView.jsx). Il calcolo storico usa proprio `decorre_da` (foodcost.js:796-799), quindi il log mostra una data diversa da quella che conta.
- **proposta**: Colonne: "Modificato il" | "Vale dal" (`l.decorre_da || l.data`) | "Ingrediente" | "Vecchio" | "Nuovo" | "Differenza" | "Chi" (`l.utente`). Sulle righe con `pianificato === true` un'etichetta "programmato".

### MEDIA · Il log dice "ultime 50" ma non ordina: con i dati esistenti mostra le piu' vecchie

- **riga** `408` · **categoria** correttezza
- **perché è un difetto**: Chi apre lo storico si aspetta in cima l'ultima modifica, quella che gli serve. Se l'array arriva in ordine cronologico crescente, il taglio a 50 tiene le piu' vecchie e butta via proprio le recenti: con 60 righe di storico le ultime 10 modifiche diventano invisibili, e l'intestazione afferma il contrario.
- **prova addotta**: Riga 408: `logPrezzi.slice(0, 50).map(...)`, nessun `sort`. Riga 393: "ultime {Math.min(50, ...)} di {...}". L'ordine e' solo una convenzione (commento in /Users/aler/foodos/src/lib/foodcost.js:786 "ordinato dal piu' recente al piu' vecchio") e il seed la viola: /Users/aler/foodos/src/lib/demoSeedFull.js:527-536 costruisce le entry da -75 giorni a -7, cioe' dalla piu' vecchia alla piu' recente. `getPrezzoStoricoKg` si difende ordinando da solo (foodcost.js:819), questa tabella no.
- **proposta**: Ordinare prima di tagliare: `[...(logPrezzi||[])].sort((a,b) => new Date(b.decorre_da||b.data) - new Date(a.decorre_da||a.data)).slice(0, 50)`.

### MEDIA · Cerco "farina 00" e non lo trova, e in tabella si legge "Farina_00"

- **riga** `340` · **categoria** correttezza
- **perché è un difetto**: Con 200-500 ingredienti la ricerca e' l'unico modo di arrivare alla riga giusta, e fallisce sul nome piu' comune di una pasticceria perche' il pasticcere scrive lo spazio e il dato ha il trattino basso. Nel frattempo la colonna nome mostra sigle da database ("Farina_00", "Marmellata_albicocca"), che in una schermata dove si mettono i soldi fanno sembrare il gestionale non finito.
- **prova addotta**: Riga 340: `ingredienti.filter(i => (i.nome || '').toLowerCase().includes(search.toLowerCase().trim()))` - confronto letterale, nessun `normIng`, nessuna gestione dei trattini bassi. Riga 335: `map.set(k, { key: k, nome: k, ... })` usa la chiave come nome visibile. Le chiavi reali hanno il trattino basso: /Users/aler/foodos/src/lib/demoSeedFull.js:80-107 e le ricette a righe 120, 130, 132, 143 (`farina_00`, `zucchero_velo`, `marmellata_albicocca`). Il `textTransform: 'capitalize'` di riga 447 lascia il trattino basso.
- **proposta**: Nome leggibile alla riga 335: `nome: k.replace(/_/g, ' ')`. Ricerca su testo normalizzato: costruire per ogni riga un `haystack = normIng(row.nome).replace(/_/g,' ')` e confrontarlo con `normIng(search)` ripulito dai trattini bassi, cosi' "farina 00", "farina_00" e "uovo/uova" (che `normIng` mappa) trovano la stessa riga.

### MEDIA · La modale dichiara "Prezzo attuale 0,00 €/kg" per un ingrediente che non ha prezzo

- **riga** `525` · **categoria** correttezza
- **perché è un difetto**: Zero non e' il prezzo del burro, e' l'assenza del prezzo: mostrarlo come misurato fa credere che il food cost fin qui girasse a costo zero (mentre girava sulla stima HORECA). Di conseguenza anche la riga "Variazione" mostra "+ 12,50 €" come se fosse un aumento, quando e' semplicemente il primo inserimento.
- **prova addotta**: Riga 525: `€ {row.prezzoKg.toLocaleString(...)}/kg` con `row.prezzoKg` = 0 quando `haPrezzo` e' false (riga 330). Righe 512-513: `delta = confirmVal - row.prezzoKg` e `deltaPct = row.prezzoKg > 0 ? ... : null`, quindi il codice sa di essere nel caso "nessun prezzo" e lo stampa comunque come 0,00.
- **proposta**: Se `!row.haPrezzo`: scrivere "Prezzo attuale: mai inserito" (o il valore di stima con l'etichetta "stima", vedi il difetto sul distinguo stimato/inserito), nascondere la riga "Variazione" e cambiare il titolo in "Conferma il primo prezzo".

### MEDIA · Verde per una variazione di zero, rosso col colore del marchio

- **riga** `414` · **categoria** colore
- **perché è un difetto**: Una modifica che lascia il prezzo dov'era viene dipinta di verde come se fosse un risparmio, e il pasticcere legge il colore prima del numero. In piu' il "rosso" degli aumenti e' lo stesso colore del pulsante Salva e dell'intera identita' della pagina, quindi non segnala nulla: e' un allarme che suona sempre.
- **prova addotta**: Riga 414: `color: l.delta > 0 ? C.red : C.green` e riga 533: `color: delta > 0 ? C.red : C.green` - il caso `delta === 0` cade nel ramo verde. In /Users/aler/foodos/src/views/_shared.jsx:26 `red: T.brand`, cioe' il rosso di allarme e il colore del marchio sono lo stesso valore.
- **proposta**: Tre rami espliciti: `delta > 0 ? C.amber : delta < 0 ? C.green : C.textMid`. Ambra per l'aumento (e' un'informazione da guardare, non un'emergenza), verde solo per un calo vero, grigio per zero. E tenere C.red per i pulsanti.

### MEDIA · Glifi ✕ e ✓ al posto del componente Icon

- **riga** `382` · **categoria** tipografia
- **perché è un difetto**: Sono caratteri tipografici messi dove il progetto vuole SVG: cambiano forma e allineamento da un dispositivo all'altro (su Android il ✓ puo' arrivare colorato come emoji) e nello stesso pulsante convivono con un'icona vera, quindi si vede la differenza di peso. Le icone che servono esistono gia'.
- **prova addotta**: Riga 382: `{showLog ? <>✕ Chiudi log</> : <><Icon name="fileText" size={13} />…</>}` - lo stato aperto usa un glifo, quello chiuso un Icon. Riga 557: `>✓ Conferma e salva<`. In /Users/aler/foodos/src/components/Icon.jsx:73-74 sono definiti `check` e `x`.
- **proposta**: Riga 382: `<><Icon name="x" size={13} />Chiudi lo storico</>`. Riga 557: `<><Icon name="check" size={13} />Conferma e salva</>`.

### MEDIA · Copy da manuale del software: "richiede conferma esplicita", "registrata nel log"

- **riga** `387` · **categoria** copy
- **perché è un difetto**: E' la prima frase che si legge nella scheda e suona scritta da un programma, non da chi lavora in pasticceria: "conferma esplicita", "registrata nel log", "con un click" (sul tablet si tocca). Poi il pulsante dice "Log modifiche" e il riquadro che apre dice "Storico modifiche prezzi": due nomi per la stessa cosa, a un metro di distanza.
- **prova addotta**: Riga 387: "Modifica il prezzo €/kg di un ingrediente con un click. La modifica richiede conferma esplicita per evitare errori e viene registrata nel log." Riga 382: "Log modifiche · N" contro riga 393: "Storico modifiche prezzi". Riga 520: "Sei sicuro di voler aggiornare il prezzo di X?". Riga 402: intestazione di colonna "Δ".
- **proposta**: Riga 387: "Tocca il prezzo per cambiarlo. Prima di salvare ti chiediamo conferma, e ogni cambio resta nello storico." Riga 382: "Storico prezzi · N", uguale al titolo del riquadro. Riga 520: "Aggiorno il prezzo di X?". Riga 402: "Differenza" invece di "Δ", con l'unita' (€/kg) nella cella o nell'intestazione: oggi la colonna mostra un numero nudo che si confonde con la percentuale accanto.

### MEDIA · Salvare senza toccare il campo puo' cambiare il prezzo di nascosto

- **riga** `351` · **categoria** correttezza
- **perché è un difetto**: I prezzi sono salvati con quattro decimali, il campo di modifica li mostra arrotondati a due. Chi apre una riga per controllare e poi preme Salva per uscire scrive un prezzo diverso da quello che c'era, si becca una conferma con "Variazione + 0,00 €" (che sembra dire "non e' cambiato niente") e lascia in archivio una modifica mai voluta.
- **prova addotta**: Riga 351: `setEditVal(row.prezzoKg ? row.prezzoKg.toFixed(2) : '')`. I costi sono salvati a 4 decimali: /Users/aler/foodos/src/Dashboard.jsx:1819 `costoKg: parseFloat(newKg.toFixed(4))`, e gli import da file (parseRicettario.js:44-47) non arrotondano affatto. Riga 357 confronta `v === row.prezzoKg` sul valore pieno, quindi 7,2456 -> "7.25" non e' considerato uguale e passa al salvataggio.
- **proposta**: Confrontare sui centesimi, non sul valore pieno: `if (Math.abs(v - row.prezzoKg) < 0.005) { cancelEdit(); return }`, cosi' "non ho cambiato nulla" chiude e basta. E nascondere il pulsante Conferma quando la variazione arrotondata e' zero.

### BASSA · La paginazione salta proprio quando servirebbe: la ricerca mostra tutto

- **riga** `348` · **categoria** struttura
- **perché è un difetto**: Il commento sopra dice che i risultati filtrati sono comunque pochi, ma su un ricettario da 500 ingredienti basta cercare "a" (o cancellare a meta' una parola) per far comparire quasi tutte le righe con dentro i campi di modifica: sul tablet la digitazione si incolla, ed e' l'unico momento in cui il pasticcere sta scrivendo davvero.
- **prova addotta**: Riga 348: `const isPaginated = !search.trim() && filtered.length > maxVisible`; riga 349 rende `filtered` intero quando si sta cercando. Il commento alle righe 341-345 dichiara l'assunzione ("la ricerca bypassa il limite, i risultati filtrati sono comunque pochi") che una ricerca di una lettera smentisce.
- **proposta**: Applicare il limite sempre: `const isPaginated = filtered.length > maxVisible`, e nel piede scrivere "Mostrati 80 di 214. Scrivi qualche lettera in piu' per restringere." Il contatore e il pulsante ci sono gia' (righe 493-503).

### BASSA · La modale si comanda solo col mouse: Invio e Esc non funzionano

- **riga** `509` · **categoria** accessibilita
- **perché è un difetto**: Il flusso da tastiera si interrompe a meta': in laboratorio si scrive il prezzo e si preme Invio, la conferma si apre, e da li' Invio non conferma piu' e Esc non chiude - bisogna mollare la tastiera e cercare il pulsante. Chi inserisce venti prezzi di fila lo fa venti volte.
- **prova addotta**: Righe 460-463 gestiscono Enter/Escape sull'input della riga, ma il blocco della modale (righe 509-562) non ha nessun handler di tastiera, nessun `role="dialog"`/`aria-modal`, e il focus resta sull'input della riga sotto. La chiusura c'e' solo su clic (riga 516 sul fondale, 556 sul pulsante).
- **proposta**: Nella modale: `role="dialog" aria-modal="true"`, un `useEffect` che su `keydown` chiama `confermaSalva` per Enter e `setConfirmKey(null)` per Escape mentre `confirmKey` e' attivo, e focus iniziale sul pulsante di conferma.

### BASSA · Il chip "Prezzo da impostare" non resta incolonnato con i nomi lunghi

- **riga** `452` · **categoria** struttura
- **perché è un difetto**: Il commento sopra promette che il badge sta sempre alla stessa distanza dal bordo, e infatti con nomi corti e' cosi'; ma con "cioccolato fondente 70% Valrhona" scivola a destra e la colonna dei chip diventa una scaletta. In una lista di 80 righe l'occhio cerca i chip in colonna e li perde.
- **prova addotta**: Righe 448-450 (commento): "nome in colonna fissa 180px, badge sempre alla stessa x indipendentemente dalla lunghezza del nome". Riga 452: `<span style={{ minWidth: 180, display: 'inline-block' }}>` dentro un flex (riga 451): con `minWidth` l'elemento cresce oltre i 180px quando il testo e' piu' lungo, quindi la x del badge dipende dal nome - il contrario di quanto dice il commento.
- **proposta**: Larghezza fissa piu' troncamento: `width: 180, flex: '0 0 180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` con `title={row.nome}` per il nome intero. Oppure due colonne di tabella separate, nome e stato.


---

## Carica merce

_18 difetti sostenuti_

### ALTA · Lo scarico legge la giacenza dalla chiave grezza, non da quella aggregata: falso allarme e numero sbagliato

- **riga** `785` · **categoria** correttezza
- **perché è un difetto**: Chi ha in magazzino 5 kg di uova e ne scarica 500 g si vede scritto che sta scaricando piu' di quello che ha, e nel messaggio finale legge "giacenza: -500g" invece di 4.500 g. Il file stesso documenta (righe 662-685) che sui dati reali di Gelateria Demo 5 chiavi su 35 non sono canoniche: uova, noci, nocciole, mirtilli, mandorle. Sono esattamente gli ingredienti che si scaricano a mano.
- **prova addotta**: riga 780 `const k = normIng(formIng.toLowerCase().trim())` + riga 785 `const attuale = magazzino?.[k]?.giacenza_g || 0`. La tabella invece legge da `magPerNorm` (riga 724-726), che aggrega le chiavi. `SING_PLUR` in foodcost.js:481 mappa ["uova","uovo"], e il clic rapido di riga 1154 precompila `setFormIng(r.nome)` cioe' "uova": quindi k="uovo", `magazzino["uovo"]` non esiste, attuale=0, nuova=-500. Anche la riga 795 scrive `soglia_g: magazzino?.[k]?.soglia_g || 0`, azzerando la soglia salvata sotto "uova".
- **proposta**: Leggere `const gruppo = magPerNorm[k] || {}; const attuale = gruppo.giacenza_g || 0` e `soglia_g: gruppo.soglia_g || 0`. In scrittura consolidare il gruppo sulla chiave canonica come fa gia' handleDeleteIng (righe 639-641): cancellare le `raw` con `normIng(raw) === k` e scrivere una sola voce `k` con il totale.

### ALTA · Una giacenza negativa puo' comparire come "OK" in verde e non viene contata da nessun contatore

- **riga** `732` · **categoria** correttezza
- **perché è un difetto**: La giacenza negativa la crea solo questa scheda (lo scarico oltre la giacenza, per scelta esplicita a riga 787-790), ed e' il caso in cui c'e' davvero qualcosa da fare: qualcuno ha sbagliato a registrare, o la merce e' uscita senza carico. Invece a -500 g con soglia a zero e senza storico consumi la riga si legge "OK" verde, mentre a 0 g esatti si legge "Esaurito" rosso. Meno di zero e' peggio di zero, e viene mostrato come meglio.
- **prova addotta**: riga 732 `giacenza === 0 ? 'esaurito' :` con uguaglianza stretta: -500 non e' 0. Con soglia 0 salta anche il ramo `soglia > 0 && giacenza <= soglia` (riga 733), e se `giorniScorta` e' null (nessun consumo, riga 730) si arriva a 'ok'. `esauriti` (riga 762) e la banda di salute (righe 773-775) non vedono nulla. Il tab Prodotti finiti invece ha la KPI dedicata "Stock negativo" (riga 194): le materie prime non l'hanno.
- **proposta**: Aggiungere uno stato `negativo` in cima alla catena (`giacenza < 0 ? 'negativo'`), con etichetta "Da correggere", colore rosso e un conteggio nella banda di salute, come la KPI "Stock negativo" dei prodotti finiti.

### ALTA · L'avviso "scarico maggiore della giacenza" viene cancellato dal toast di successo

- **riga** `792` · **categoria** correttezza
- **perché è un difetto**: E' l'unico avviso che dice al pasticcere che il magazzino e' andato sotto zero, e in pratica non lo legge mai: pochi decimi di secondo dopo (il tempo delle due scritture) al suo posto compare il messaggio verde con la spunta. Resta sullo schermo la conferma, non l'anomalia.
- **prova addotta**: riga 792 `notify(...)` e riga 810 `notify(...)` nella stessa esecuzione. `notify` in Dashboard.jsx:1474 e' a slot unico: `if (notifyTimerRef.current) clearTimeout(...); setToast({msg,ok})` sovrascrive il precedente.
- **proposta**: Chiedere conferma prima di scrivere ("In magazzino ci sono 1.200 g, ne stai togliendo 1.500. Registro comunque?") oppure fondere i due messaggi in uno solo: "Registrato. Attenzione: burro va a -300 g".

### ALTA · I numeri dei messaggi di carico non sono in formato italiano, e uno stampa il float grezzo

- **riga** `810` · **categoria** tipografia
- **perché è un difetto**: Chi carica un sacco di farina legge "+25000g" e deve contare gli zeri per capire se sono 25 kg o 2,5 kg. Nel resto della pagina lo stesso numero e' scritto "25,00 kg" o "25.000 g" da `fmtG`. Nel messaggio di sforamento puo' uscire anche una coda di decimali binari, che sembra un errore del programma.
- **prova addotta**: riga 810 `notify(`✓ ${segno}${qty}g di ${formIng} - giacenza: ${Math.round(nuova)}g`)`: nessun separatore migliaia, nessuno spazio prima dell'unita'. riga 792 `${attuale}g → ${nuova}g` stampa `nuova` non arrotondato: con attuale 1000,2 e scarico 1000,3 esce "-0.09999999999999998g".
- **proposta**: Riusare `fmtG` (riga 870), che rispetta anche il toggle kg/g scelto dall'utente: `notify(`${segno}${fmtG(qty)} di ${formIng} — in magazzino ora ${fmtG(nuova)}`)`.

### ALTA · Dopo l'OCR il messaggio conta anche gli ingredienti che non ha caricato

- **riga** `1253` · **categoria** correttezza
- **perché è un difetto**: La foto della bolla ha dieci righe, tre con la quantita' illeggibile: il ciclo le salta, il messaggio dice "Caricati 10 ingredienti" e nessuno va a controllare quali tre mancano. E' un numero inventato presentato come misurato, sul dato piu' delicato della scheda. Nel caso limite in cui nessuna quantita' e' leggibile, il messaggio dichiara un carico che non e' avvenuto.
- **prova addotta**: riga 1239 `if (qtaG <= 0) continue` (con `qtaG` gia' 0 quando l'OCR non legge, riga 1237-1238 e prompt FotoOCR.jsx:88 "If quantity unreadable set quantita_g:0"), mentre riga 1253 conta `(res.ingredienti || []).length`, cioe' tutte le righe estratte.
- **proposta**: Contare i caricati veri e dire l'altra meta': `notify(newLogs.length ? `Caricati ${newLogs.length} ingredienti${scartati ? `. ${scartati} senza quantita' leggibile, da mettere a mano` : ''}` : 'Nessuna quantita\' leggibile nella foto', newLogs.length > 0)`, e non salvare se `newLogs` e' vuoto.

### ALTA · Le etichette dei tre campi del form sono a 10px

- **riga** `1283` · **categoria** tipografia
- **perché è un difetto**: Sono le tre parole che dicono cosa scrivere in quale casella, in maiuscoletto spaziato, che e' il modo piu' faticoso di leggere. A 10px, dietro il banco, con le mani sporche di farina e sessant'anni, non si leggono: si va a memoria sulla posizione. Il commento in testa a questo file (righe 29-41) dice esattamente questo e queste tre sono rimaste indietro.
- **prova addotta**: righe 1283 ("Ingrediente"), 1294 ("Quantita' (g)") e 1301 ("Note (opzionale)") hanno `fontSize: 10` con `textTransform: 'uppercase', letterSpacing: '0.07em'`. Anche i due pulsanti di modo sono sotto soglia: riga 1275 `fontSize: 11` per "Carico merce"/"Scarico / Rettifica" e riga 1277 `fontSize: 11, opacity: 0.7` per i sottotitoli, che sono contenuto e non micro-etichetta.
- **proposta**: Portare le tre etichette a 12px e i testi dei pulsanti di modo a 13/12px. Qui non si tocca nessuna colonna di tabella: e' una colonna sola larga 680px, lo spazio c'e'.

### MEDIA · I prezzi da foto si dichiarano aggiornati prima che il salvataggio sia finito

- **riga** `1265` · **categoria** correttezza
- **perché è un difetto**: Rompe il save-first proprio dove costa: se la rete cade, il pasticcere ha letto "12 prezzi aggiornati", chiude la pagina e i prezzi non ci sono. E' l'unico dei due handler OCR di questa scheda che non aspetta la scrittura: quello del magazzino, dieci righe sopra, lo fa.
- **prova addotta**: riga 1265 `if (onImportPrezziOCR) onImportPrezziOCR(nuoviCosti)` senza `await`, riga 1266 `notify(`${validi.length} prezzi aggiornati`)` eseguita subito. L'handler passato e' async (Dashboard.jsx:1728) e in errore fa `notify('Errore salvataggio prezzi...', false); return` (riga 1733). Confronto: righe 1244-1253 fanno `await ssave(...)` e notificano dopo.
- **proposta**: `try { await onImportPrezziOCR?.(nuoviCosti) } catch (e) { notify(...); return }` e notificare il successo solo dopo. Se `onImportPrezziOCR` manca, non dire che ha aggiornato qualcosa.

### MEDIA · L'import prezzi da foto va in errore silenzioso se il prezzo arriva come stringa

- **riga** `1263` · **categoria** correttezza
- **perché è un difetto**: Il pasticcere vede l'anteprima con i prezzi giusti, tocca conferma e non succede niente: nessun messaggio, nessun prezzo salvato, la foto sparisce. Non ha modo di capire che deve rifarla, e il food cost resta calcolato sulle stime HORECA.
- **prova addotta**: riga 1258 `filter(i => i.prezzo_kg > 0)` passa anche la stringa "12.50" per coercizione, poi riga 1263 chiama `i.prezzo_kg.toFixed(4)` → TypeError dentro una `onResult` async, quindi promise rifiutata e nessun notify. Che il valore non sia garantito numerico lo dicono gli altri due punti dello stesso flusso: righe 1237-1238 `const qg = Number(ing.quantita_g); Number.isFinite(qg) ? ...` con commento sul guard NaN, e FotoOCR.jsx:322 che avvolge in `Number(ing.prezzo_kg)` per l'anteprima.
- **proposta**: Normalizzare in ingresso: `const pk = Number(String(i.prezzo_kg).replace(',', '.')); if (!Number.isFinite(pk) || pk <= 0) continue`, e avvolgere il corpo dell'handler in try/catch con notify in errore.

### MEDIA · Il messaggio d'errore dell'OCR dice "Riprova" ma i dati letti sono gia' stati buttati

- **riga** `1248` · **categoria** copy
- **perché è un difetto**: Non c'e' nulla da riprovare: nel momento in cui compare quel messaggio la foto e l'elenco riconosciuto non ci sono piu', quindi bisogna rifare la foto della bolla. Un messaggio che chiede un gesto impossibile fa perdere fiducia in tutto il resto dei messaggi.
- **prova addotta**: riga 1248 `notify(`Salvataggio OCR fallito: ${e.message || 'rete'}. Riprova.`, false)`. In FotoOCR.jsx `handleConferma` (righe 211-216) chiama `onResult(parsed)` senza `await` e alla riga successiva fa `setImg(null); setPreview(null); setParsed(null)`: quando la ssave rifiuta, lo stato del componente e' gia' azzerato.
- **proposta**: In FotoOCR: `await onResult(parsed)` e azzerare preview/parsed solo se non ha lanciato. Cosi' "Riprova" torna vero, e il pulsante conferma resta li' con i dati dentro.

### MEDIA · Il modo carico/scarico resta impostato dopo il salvataggio e il clic rapido non lo resetta

- **riga** `811` · **categoria** correttezza
- **perché è un difetto**: Il caso reale: la sera si scarica quello che si e' consumato, la mattina arriva il fornitore. Si clicca sul nome dell'ingrediente nella tabella per precompilare, si digita 2000 e si tocca il pulsante: il form e' ancora in scarico e invece di caricare 2 kg li toglie. Il pasticcere lo scopre giorni dopo, guardando una giacenza che non torna.
- **prova addotta**: riga 811 `setFormIng(''); setFormQty(''); setFormNote(''); setQuickLoad(null)` non azzera `formMode`. Il clic sul nome della riga (riga 1154) fa `setQuickLoad(r.k); setFormIng(r.nome); setTab('carica')` senza `setFormMode`, mentre il pulsante "Carica" (riga 1042) lo imposta correttamente a 'carico'.
- **proposta**: Aggiungere `setFormMode('carico')` alla riga 811 dopo il salvataggio e al clic della riga 1154. Il modo distruttivo si sceglie ogni volta, non si eredita.

### MEDIA · Campo quantita' type=number: su iPad la virgola decimale non arriva mai

- **riga** `1297` · **categoria** mobile
- **perché è un difetto**: Sul tablet la tastiera numerica italiana ha la virgola. Chi scrive "1,5" su Safari vede il pulsante restare grigio e non capisce perche': il campo sembra pieno e il programma sembra rotto. Su iPad dietro il banco e' il caso normale, non un caso limite.
- **prova addotta**: riga 1297 `<input id="mag-qty-input" type="number" inputMode="decimal" ...>`: con type=number Safari scarta il valore non valido e `e.target.value` diventa stringa vuota, quindi `disabled={!formIng || !formQty || saving}` (riga 1306) resta true. Che la virgola fosse attesa lo dice la riga 782, `parseFloat(String(formQty).replace(',', '.'))` con commento "locale IT usa la virgola decimale": con type=number quella replace non vede mai una virgola, e' codice morto.
- **proposta**: `type="text" inputMode="decimal"` (che tiene la tastiera numerica su iOS e Android) e lasciare la normalizzazione della virgola alla riga 782, che e' gia' scritta. In piu' cosi' si puo' dare un messaggio quando il testo non e' un numero, invece di un pulsante grigio muto.

### MEDIA · I suggerimenti propongono la chiave normalizzata, e il carico rinomina l'ingrediente

- **riga** `1305` · **categoria** struttura
- **perché è un difetto**: Il pasticcere scrive "uova", il campo gli propone "uovo", accetta con Invio e da quel momento l'ingrediente in tabella si chiama "Uovo". Lo stesso vale per le maiuscole: "Farina 00 Caputo" torna "farina 00 caputo". Il programma corregge il nome che ha scelto lui, senza dirglielo e senza motivo visibile.
- **prova addotta**: riga 1305 `<datalist id="ing-list">{tuttiIngNomi.map(k => <option key={k} value={k}/>)}</datalist>`: `tuttiIngNomi` (righe 705-712) sono chiavi passate da `normIng`, quindi minuscole e al singolare. `onEnterAutoComplete` (riga 1286) sostituisce il testo digitato col primo match, e la riga 795 scrive `nome: formIng.trim()` sovrascrivendo il nome esistente.
- **proposta**: Alimentare la datalist e l'autocomplete con i nomi visualizzati (`righe.map(r => r.nome)`), e alla riga 795 conservare il nome gia' salvato quando la voce esiste: `nome: gruppo.nome || formIng.trim()`.

### MEDIA · Non si conferma con Invio: il flusso da tastiera si interrompe all'ultimo passo

- **riga** `1297` · **categoria** struttura
- **perché è un difetto**: Chi carica una bolla da dodici righe fa dodici volte: scrivi ingrediente, Invio, scrivi quantita', e qui deve mollare la tastiera e cercare il pulsante col mouse o col dito. Poi deve tornare col mouse sul primo campo, perche' dopo il salvataggio il fuoco non torna da nessuna parte. Su un lavoro ripetitivo e' il difetto che si sente ogni giorno.
- **prova addotta**: riga 1297 (quantita') e riga 1302 (note) non hanno nessun `onKeyDown`, e non c'e' un `<form onSubmit>`: solo il campo ingrediente ha `onEnterAutoComplete` (riga 1286) che sposta il fuoco su `mag-qty-input`. La riga 811 azzera i campi senza rimettere il fuoco sull'ingrediente (`focusQtyDeferred`, riga 587, esiste ma punta alla quantita' e non e' chiamata dopo il salvataggio).
- **proposta**: Su quantita' e note: `onKeyDown={e => { if (e.key === 'Enter' && formIng && formQty && !saving) handleCarica() }}`. Dopo il salvataggio riportare il fuoco sul campo ingrediente (serve dargli un id, oggi non ce l'ha).

### MEDIA · Il form non mostra la giacenza attuale dell'ingrediente scelto

- **riga** `1293` · **categoria** struttura
- **perché è un difetto**: Lo scarico si registra alla cieca. Il campo dice "Quantita' (g) - da rimuovere" e chi lo compila non ha davanti quanto ce n'e': deve tornare alla scheda giacenze, guardare, tornare qui. E' anche il motivo per cui si finisce sotto zero.
- **prova addotta**: il blocco del form, righe 1281-1305, contiene solo i tre input: non legge mai `magPerNorm[normIng(formIng)]`. L'unico segnale di contesto e' il bordo ambra del campo quantita' (riga 1298) e del contenitore (riga 1268). Il dato serve gia' calcolato a riga 785 dentro handleCarica, ma solo al momento del salvataggio.
- **proposta**: Sotto il campo quantita', quando `formIng` corrisponde a una voce nota: "In magazzino ora: 4.500 g" e, in modo scarico con quantita' inserita, "Dopo lo scarico: 4.000 g" (in ambra se va sotto zero). Testo a 12px, formattato con fmtG.

### MEDIA · Nel log rifornimenti gli scarichi sono scritti in verde come i carichi

- **riga** `1344` · **categoria** colore
- **perché è un difetto**: Il log e' il posto dove si va a controllare cos'e' successo quando la giacenza non torna. Se carichi e scarichi hanno lo stesso colore, l'unico segno che li distingue e' un meno piccolo davanti al numero: si scorre venti righe verdi e si legge un carico dove c'era un'uscita.
- **prova addotta**: riga 1344 `<td style={{ ..., color: C.green }}>{fmtG(r.quantita_g)}</td>`, colore fisso, mentre `logEntry` scrive `quantita_g: formMode === 'scarico' ? -qty : qty` (riga 797). `fmtG(-500)` rende "-0,500 kg" in verde.
- **proposta**: `color: r.quantita_g < 0 ? C.amber : C.green` e segno esplicito (`+2,00 kg` / `−0,50 kg`), coerente con l'ambra che questa pagina usa gia' per lo scarico.

### BASSA · La spunta "✓" nel messaggio di conferma e' un carattere nel testo, non l'Icon

- **riga** `810` · **categoria** tipografia
- **perché è un difetto**: E' la regola del progetto: i simboli nella UI si fanno col componente Icon, anche nelle notifiche. Un glifo dentro la stringa viene reso dal font di sistema, quindi cambia forma tra desktop e tablet e su iOS puo' colorarsi come un'emoji, dentro un toast che ha gia' il suo colore per dire se e' andata bene.
- **prova addotta**: riga 810 `notify(`✓ ${segno}${qty}g di ${formIng} ...`)`, stesso schema alle righe 161, 659 e 852. Il toast riceve gia' il flag `ok` (Dashboard.jsx:1474 `setToast({msg,ok})`) per rappresentare l'esito.
- **proposta**: Togliere il carattere dal testo e lasciare che l'esito lo dica il toast (colore + eventuale Icon name="check" nel componente del toast, una volta sola per tutta l'app).

### BASSA · Un nome fatto di soli spazi passa la validazione e crea una voce vuota in magazzino

- **riga** `779` · **categoria** correttezza
- **perché è un difetto**: Sul tablet si sfiora la barra spaziatrice per errore molto piu' facilmente che sul desktop. Il risultato e' una riga senza nome in mezzo alla dispensa, con dentro dei grammi veri, che si porta dietro il suo stato e il suo valore e non si capisce come togliere.
- **prova addotta**: riga 779 `if (!formIng || !formQty) return`: la stringa " " e' truthy, quindi passa. `normIng(' ')` restituisce '' (foodcost.js:523, trim senza guard), poi riga 795 scrive `nm[''] = { nome: '', giacenza_g: qty, ... }`. `tuttiIngNomi` (riga 711) include '' e la tabella genera una riga senza nome. Il pulsante e' abilitato per lo stesso motivo (riga 1306 `disabled={!formIng || ...}`).
- **proposta**: Validare sul trim: `const nome = formIng.trim(); if (!nome || !formQty) return` e `disabled={!formIng.trim() || !formQty || saving}`.

### BASSA · Le etichette dei campi non sono <label>: toccarle non porta il cursore nel campo

- **riga** `1283` · **categoria** accessibilita
- **perché è un difetto**: Su tablet il bersaglio utile diventa solo la casella: la parola sopra, che e' la cosa piu' grande e ovvia da toccare, non fa niente. E chi ingrandisce la pagina o usa la lettura vocale non sente a cosa si riferisce la casella.
- **prova addotta**: righe 1283, 1294 e 1301 sono `<div>`; nessun `htmlFor`, e il campo ingrediente (riga 1284) non ha nemmeno un `id` a cui agganciarsi. Solo `mag-qty-input` (riga 1297) ha un id, usato per il focus programmatico.
- **proposta**: Trasformarle in `<label htmlFor="mag-ing-input">` / `htmlFor="mag-qty-input"` / `htmlFor="mag-note-input"` e dare gli id ai tre input. Zero cambiamenti visivi, e il tocco sull'etichetta apre la tastiera sul campo giusto.


---

## Struttura e etichette

_17 difetti sostenuti_

### ALTA · Tutto il cappello (sottotitolo, banner, 4 tessere, lista di riordino) è fuori dalle schede: appare anche su Prodotti finiti, Prezzi e Log

- **riga** `971` · **categoria** struttura
- **perché è un difetto**: Sono dati di materie prime. Chi apre "Prodotti finiti" per vedere quanti bignè ha in vetrina si trova prima il valore del magazzino ingredienti, il banner sulle scorte e la lista della spesa della farina: quattro blocchi che non c'entrano con quello che ha chiesto. Sulla scheda "Prodotti finiti" le tessere diventano otto (quattro di ingredienti + quattro di prodotti), e due si chiamano quasi uguale ("Da ordinare" e "Sotto soglia"): il pasticcere non sa più quale numero parla di cosa. E siccome la lista di riordino sta sopra la barra, il pulsante "Carica" di riga 1043 cambia la scheda attiva 400px più in basso, fuori dal campo visivo.
- **prova addotta**: Riga 971 `{(critici.length > 0 || attenzione.length > 0) && (() => {` e riga 935 `<div style={{ display: 'grid', gridTemplateColumns: ...}}>` stanno prima della barra schede (riga 1073) e non sono dentro nessun `tab === '...'`. La prima condizione su `tab` compare solo a riga 1085. A riga 190 ProdottiFinitiTab renderizza il suo secondo gruppo di 4 KPI.
- **proposta**: Spostare banner + 4 tessere + lista di riordino DENTRO il ramo `tab === 'giacenze'`, subito sotto la barra delle schede. Sopra la barra resta solo il sottotitolo con il conteggio. Così la barra è visibile entro i primi 150px in qualsiasi stato, la lista non spinge più niente, e ogni scheda mostra solo i propri numeri.

### ALTA · La lista di riordino aperta non ha tetto d'altezza: con 56 ingredienti spinge la barra delle schede circa 2.000px più in basso

- **riga** `1054` · **categoria** struttura
- **perché è un difetto**: Il limite a 6 righe esiste (`RIORDINO_VISIBILI = 6`) e regge, ma appena il pasticcere premte "Vedi gli altri 47 da ordinare" la lista si apre per intero: la lista include esauriti + sotto soglia + in calo, quindi su un'org con 56 ingredienti può arrivare a più di 50 righe da ~37px, cioè circa 1.900px di tabella. Barra delle schede, tabella giacenze e tutto il resto finiscono due schermate sotto. Peggio: il pulsante per richiudere è in fondo al blocco, quindi per tornare indietro devi scorrere tutte le righe che hai appena aperto.
- **prova addotta**: Riga 991 `const visibili = riordinoTutti ? daRiordinare : daRiordinare.slice(0, RIORDINO_VISIBILI)` e riga 977 `[...critici, ...attenzione]`; il contenitore della tabella a riga 1013 è `style={{ overflowX: 'auto' }}` — nessun `maxHeight`, nessun `overflowY`. Il pulsante di chiusura è a riga 1054, dopo la tabella.
- **proposta**: Dare al contenitore della tabella `maxHeight: isMobile ? 320 : 420, overflowY: 'auto'` quando `riordinoTutti` è true: la lista scorre dentro il suo riquadro e la pagina non si allunga di un pixel. In più, portare il pulsante di apri/chiudi nell'intestazione scura del blocco (accanto a "Spesa stimata"), che resta sempre a portata di pollice.

### ALTA · Due tessere dicono "clicca per vedere" ma non sono cliccabili: la KPI locale non ha la prop onClick

- **riga** `63` · **categoria** correttezza
- **perché è un difetto**: La tessera "Da ordinare" scrive sotto al numero "clicca per vedere cosa ordinare" e la tessera "In esaurimento" scrive "clicca per vedere quali". Il pasticcere clicca e non succede nulla: nessuno scorrimento, nemmeno il cursore a manina, perché la copia locale della KPI non riceve `onClick` e non imposta `cursor: 'pointer'`. Un'istruzione scritta a schermo che non funziona insegna a non fidarsi delle altre.
- **prova addotta**: Riga 43 `function KPI({ label, value, sub, color, highlight, icon }) {` — `onClick` non è nella firma e non viene mai applicato al div. A righe 952-955 e 959-962 viene passato `onClick={... scrollIntoView ...}` e a righe 951 e 958 il testo `'clicca per vedere cosa ordinare'` / `'clicca per vedere quali'`. La KPI condivisa in `src/views/_shared.jsx` riga 169 lo accetta (`{ label, value, sub, color, highlight, icon, onClick }`) e a riga 176 imposta `cursor: onClick ? 'pointer' : 'default'`, ma a riga 20 MagazzinoView importa solo `C, TNUM, PageHeader, useSortable, SortTH, fmt0`.
- **proposta**: Cancellare la KPI locale (righe 43-72) e importare quella condivisa: `import { C, TNUM, PageHeader, useSortable, SortTH, fmt0, KPI } from './_shared'`. Il click funziona subito, il cursore diventa una manina e le due scritte tornano vere.

### ALTA · La KPI locale è una copia vecchia della condivisa: su telefono il valore sfora e i numeri delle tessere non sono incolonnati

- **riga** `43` · **categoria** mobile
- **perché è un difetto**: La copia locale ha perso tre cose che la condivisa ha: il `minHeight` sull'etichetta, il ridimensionamento del valore e l'altezza piena. Su telefono la griglia va a due colonne, quindi ogni tessera è larga circa 175px e ne restano 135 dentro le imbottiture: "VALORE A MAGAZZINO" va a capo su due righe mentre "A ZERO" accanto ne occupa una, e i due numeroni grossi finiscono a due altezze diverse — esattamente il disallineamento dei box già segnalato. E il valore resta fisso a 30px: "12.480 €" in 135px non ci sta e va a capo o esce.
- **prova addotta**: Riga 63-64 locale: `fontSize: 10.5, ... marginBottom: 6 }}>{label}` senza `minHeight`; riga 65 `fontSize: 30` fisso. In `_shared.jsx` riga 210-212 c'è `minHeight: 28, lineHeight: 1.25`, righe 220-228 il calcolo `const fs = isMobile ? (len <= 6 ? 24 : len <= 12 ? 19 : 14) : ...` con `whiteSpace: 'nowrap', overflow: 'hidden', minHeight: isMobile ? 28 : 32`, riga 181 `display: 'flex', flexDirection: 'column', height: '100%'`. Griglia a due colonne su telefono e tablet: riga 935.
- **proposta**: Eliminare le righe 43-72 e usare la KPI di `_shared.jsx`. Una sola tessera per tutta l'app: etichette a altezza fissa, valori incolonnati, testo che si adatta alla larghezza. Se serve una differenza, si cambia nella condivisa così vale su Chiusura e Produzione.

### ALTA · Le etichette delle quattro tessere sono a 10,5px, sotto il minimo di 12

- **riga** `63` · **categoria** tipografia
- **perché è un difetto**: L'etichetta è l'unica cosa che dice cosa significa il numerone: senza "VALORE A MAGAZZINO" quel 12.480 può essere qualsiasi cosa. È scritta a 10,5px, tutta maiuscola e con le lettere distanziate di 0,09em, che è la combinazione più faticosa da leggere: maiuscoletto spaziato piccolo. Dietro il banco, a 60 anni, con la luce del laboratorio, quelle quattro etichette non si leggono e restano quattro numeri senza nome. Il commento in testa al file (righe 29-41) dice che la bonifica sotto i 12px era stata fatta: queste sono rimaste fuori.
- **prova addotta**: Riga 63 `fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase'`. Stesso valore nella condivisa (`_shared.jsx` riga 210), quindi la correzione va fatta là.
- **proposta**: Portare l'etichetta a 12px e scendere con la spaziatura a 0,06em (`fontSize: 12, letterSpacing: '0.06em'`). A 12px "VALORE A MAGAZZINO" resta su una riga anche nella tessera stretta da 135px se si tiene il `minHeight` a due righe. Correzione in `_shared.jsx` riga 210, così vale per tutte le pagine.

### ALTA · Senza storico di produzione i giorni di scorta sono calcolati su un consumo inventato, e la tessera li presenta come misurati

- **riga** `966` · **categoria** correttezza
- **perché è un difetto**: Se non ci sono sessioni di produzione, il fabbisogno viene stimato a "1 stampo per ricetta a settimana": un numero inventato dal codice, non misurato. Da lì escono i giorni di scorta, la copertura media, la colonna "Giorni scorta" della tabella e la quantità "Da ordinare" della lista della spesa. La tessera scrive sotto "giorni di scorta", senza una parola che dica che è una stima; il ramo che avvisa (`'storico assente'`) non si accende mai, perché scatta solo se `coperturaMedia` è null, cioè solo se non c'è nemmeno una ricetta. Un pasticciere appena entrato in Foodos vede "18 gg" e ordina di conseguenza.
- **prova addotta**: Righe 102-111: `// Fallback: nessun storico → stima 1 stampo/ricetta/settimana` con `fabb[k] = (fabb[k] || 0) + ing.qty1stampo`. Riga 966 `sub={coperturaMedia !== null ? 'giorni di scorta' : 'storico assente'}`: con il fallback attivo `consumoG > 0` per ogni ingrediente delle ricette (riga 729-730), quindi `giorniScorta` non è mai null e il ramo 'storico assente' non viene mostrato.
- **proposta**: Portare fuori un flag dal calcolo (`fabbisognoStimato = ultimi7.length === 0`) e usarlo: se è stimato, la tessera scrive `sub: 'stima, ancora senza storico'` e la lista di riordino scrive in intestazione "quantità stimate: registra qualche produzione e diventano vere". Come già si fa per i prezzi (`prezzoStimato`, riga 741 e sub della prima tessera). Meglio un numero dichiarato incerto che un numero finto presentato come letto dal magazzino.

### MEDIA · Gli stessi due numeri sono scritti tre volte nei primi 300px, e la prima riga di dati arriva a circa 840px

- **riga** `886` · **categoria** struttura
- **perché è un difetto**: "3 a zero · 12 da ordinare" compare nel sottotitolo, poi nel banner colorato riformulato a parole, poi come numero nelle tessere due e tre. Tre modi di dire la stessa cosa costano circa 310px e non aggiungono una informazione. Sommando: sottotitolo 64px, banner 73, tessere 177, lista di riordino chiusa 374, barra schede 68, intestazione di sezione che ripete la parola "Materie prime" già scritta sulla scheda attiva 48, testa della tabella 34: circa 840px prima della prima giacenza su desktop, più la topbar. Su telefono e tablet le tessere vanno su due file e si arriva intorno ai 1.000px, cioè una schermata e mezza di scorrimento per vedere quanto burro c'è.
- **prova addotta**: Sottotitolo righe 886-890 (`${esauriti.length} a zero`, `${sottoSoglia.length} da ordinare`); banner righe 916-919 (`hanno toccato la soglia di riordino`); tessere righe 947-949 e 956. Intestazione ripetuta: `title="Materie prime"` a riga 1089, mentre l'etichetta della scheda attiva è già 'Materie prime' a riga 1074.
- **proposta**: Togliere il banner (le tessere due e tre dicono già gli stessi numeri con lo stesso colore) e togliere la SectHead "Materie prime" a riga 1089, spostando il toggle kg/g e il pulsante "+ Aggiungi ingrediente" sulla destra della barra delle schede. Si recuperano circa 120px e la prima riga di dati sale sopra i 700px.

### MEDIA · La tessera "Copertura media" non dice niente di azionabile e può essere verde mentre un ingrediente finisce domani

- **riga** `963` · **categoria** correttezza
- **perché è un difetto**: È la media aritmetica dei giorni di scorta di tutti gli ingredienti che hanno uno storico: mette insieme la vaniglia che dura otto mesi e il latte che dura un giorno. Con 50 ingredienti a 60 giorni e il latte a 1, la media viene 58 e la tessera si accende verde: il pasticcere legge "58 gg" e sta tranquillo mentre domani non fa le creme. E nessuno ordina in base a una media: non esiste una decisione che cambia guardando quel numero. È l'unica delle quattro che non si può usare per fare qualcosa.
- **prova addotta**: Riga 964 `value={coperturaMedia !== null ? `${coperturaMedia.toFixed(0)} gg` : '-'}` alimentata da `coperturaMedia = conCopertura.reduce((s, r) => s + r.giorniScorta, 0) / conCopertura.length` (media non ponderata, righe 765-768); riga 965 colora verde per media >= 7.
- **proposta**: Sostituirla con il numero che si può usare: "Prima scadenza" = il minimo dei giorni di scorta con il nome dell'ingrediente sotto (`sub` = il nome). "2 gg — panna" dice cosa fare stamattina; "58 gg" non dice niente. Il minimo non si può nemmeno mediare via.

### MEDIA · La seconda tessera cambia identità: quando qualcosa va a zero il numero "da ordinare" spariscere

- **riga** `948` · **categoria** struttura
- **perché è un difetto**: La stessa casella, nella stessa posizione, un giorno si chiama "Da ordinare" e mostra 12, il giorno dopo si chiama "A zero" e mostra 2. Il pasticcere impara la posizione, non l'etichetta: guarda nell'angolo e legge un numero che è diventato un'altra cosa. E lo scambio avviene nel momento peggiore: quando un ingrediente finisce sparisce dalla vista quanti sono da ordinare, cioè proprio quando si sta per fare l'ordine.
- **prova addotta**: Righe 947-949: `label={esauriti.length > 0 ? 'A zero' : 'Da ordinare'}` e `value={esauriti.length > 0 ? esauriti.length : sottoSoglia.length}`.
- **proposta**: Etichetta fissa "Da ordinare" con `value={sottoSoglia.length + esauriti.length}` e `sub` che scompone: `${esauriti.length} già a zero` quando ce ne sono, altrimenti "nessuno a zero". Il numero in quella posizione significa sempre la stessa cosa, e l'urgenza la porta il colore rosso più la riga sotto.

### MEDIA · "Log rifornimenti": "log" è parola da informatico, e la scheda contiene anche gli scarichi

- **riga** `1074` · **categoria** copy
- **perché è un difetto**: Nessuno in laboratorio ha mai chiamato "log" un registro. Ed è anche imprecisa: dentro non ci sono solo rifornimenti, ci sono gli scarichi manuali e le rettifiche, che il form salva nella stessa lista con quantità negativa. Il sottotitolo della sezione lo ammette ("Storico carichi e scarichi"), quindi l'etichetta della scheda dice meno di quello che la scheda contiene: chi cerca lo scarico di ieri non pensa di guardare sotto "rifornimenti".
- **prova addotta**: Riga 1074 `['log', 'Log rifornimenti']`; riga 1323 `title="Log rifornimenti" sub="Storico carichi e scarichi di materie prime"`; riga 797 `quantita_g: formMode === 'scarico' ? -qty : qty` scrive gli scarichi nello stesso `logRif`.
- **proposta**: Etichetta "Carichi e scarichi" e titolo di sezione uguale, sottotitolo "Tutto quello che è entrato e uscito dal magazzino". Due parole che un pasticcere usa già, e coprono davvero il contenuto.

### MEDIA · Nello storico le quantità sono sempre verdi, anche gli scarichi negativi

- **riga** `1344` · **categoria** colore
- **perché è un difetto**: Il verde nel resto della pagina vuol dire merce entrata (a riga 268 la stessa tabella dei movimenti prodotti finiti usa verde per il più e rosso per il meno). Qui il colore è fisso: uno scarico di 2 chili di burro si legge "-2,00 kg" in verde, con lo stesso aspetto di un carico. Chi scorre la colonna per capire cosa è entrato questa settimana somma anche quello che è uscito.
- **prova addotta**: Riga 1344 `<td style={{ padding: '10px 14px', fontWeight: 700, color: C.green }}>{fmtG(r.quantita_g)}</td>` — nessuna condizione sul segno, mentre `fmtG` restituisce il valore col meno.
- **proposta**: `color: r.quantita_g < 0 ? C.red : C.green` e il segno esplicito anche sul positivo (`+2,00 kg`), come già fa la tabella movimenti a riga 269. In più una colonna o una pillola "Carico / Scarico", che è la cosa che si cerca per prima.

### MEDIA · "Carica merce" è un'azione messa in fila a quattro luoghi, e la si raggiunge solo passando per una scheda

- **riga** `1074` · **categoria** struttura
- **perché è un difetto**: Le altre quattro schede sono posti dove si guarda; questa è un gesto che si fa. Metterla in mezzo obbliga a un cambio di modo mentale, e soprattutto la rende raggiungibile solo se sei già dentro Magazzino sulla scheda giusta: registrare una bolla è la cosa che un pasticcere fa più spesso qui dentro, ogni mattina, e richiede due tocchi in mezzo a nomi di sezioni. Nella stessa scheda ci sono anche i due riquadri Foto: quello dei prezzi non c'entra niente con il carico merce e si sovrappone alla scheda "Prezzi ingredienti" e al pulsante "Importa prezzi" dell'intestazione — tre punti diversi per lo stesso lavoro.
- **prova addotta**: Riga 1074 `['carica', 'Carica merce']` in fila con 'Materie prime', 'Prodotti finiti', 'Prezzi ingredienti', 'Log rifornimenti'. Nella scheda: `<FotoOCR mode="magazzino"` riga 1227 e `<FotoOCR mode="prezzi"` riga 1255, mentre il caricamento file prezzi è nell'intestazione a riga 897 e la modifica manuale nella scheda 'prezzi' a riga 1317.
- **proposta**: Togliere "Carica merce" dalla barra e farne un pulsante primario sempre visibile accanto a "Importa prezzi" nell'intestazione ("Registra carico"), che apre il form in un pannello laterale: funziona da qualsiasi scheda e il pulsante "Carica" della lista di riordino lo apre già precompilato, senza cambiare scheda sotto i piedi. E spostare `FotoOCR mode="prezzi"` nella scheda "Prezzi ingredienti", dove il pasticcere lo cerca.

### MEDIA · L'ordine delle schede non segue la frequenza d'uso: i prezzi stanno prima del carico merce

- **riga** `1074` · **categoria** struttura
- **perché è un difetto**: L'ordine è: giacenze, prodotti finiti, prezzi, carico, storico. Ma un pasticcere guarda le giacenze ogni giorno, registra la merce che arriva ogni giorno o quasi, controlla lo stock dei prodotti finiti ogni giorno, e tocca i prezzi degli ingredienti quando arriva un aumento dal fornitore: qualche volta al mese. La cosa più rara sta al terzo posto, davanti a una delle più frequenti, e nella barra è anche l'etichetta più lunga, quindi la più ingombrante.
- **prova addotta**: Riga 1074 `[['giacenze', 'Materie prime'], ['pf', 'Prodotti finiti'], ['prezzi', 'Prezzi ingredienti'], ['carica', 'Carica merce'], ['log', 'Log rifornimenti']]`.
- **proposta**: Riordinare per frequenza: Materie prime, Prodotti finiti, Carichi e scarichi, Prezzi ingredienti. Se "Carica merce" diventa il pulsante sempre visibile, restano quattro schede, tutte luoghi: Materie prime, Prodotti finiti, Carichi e scarichi, Prezzi ingredienti — che stanno su una riga anche su un telefono.

### MEDIA · Su telefono due schede su cinque restano fuori schermo e niente dice che la barra si scorre

- **riga** `1073` · **categoria** mobile
- **perché è un difetto**: Le cinque etichette a 13px con 32px di imbottitura fanno circa 650px di larghezza; su un telefono ne sono disponibili circa 360. Si vedono "Materie prime", "Prodotti finiti" e mezza "Prezzi ingredienti": "Carica merce" e "Log rifornimenti" non esistono. La barra scorre in orizzontale, ma non c'è nessun segnale (nessuna sfumatura al bordo, nessuna freccia), e i tagli non cadono a metà di un'etichetta per caso: cadono dentro la terza, che è quella che sembra l'ultima. Dietro il banco col telefono in mano, la funzione più usata è invisibile.
- **prova addotta**: Riga 1073 `overflowX: 'auto', WebkitOverflowScrolling: 'touch'` senza indicatore; riga 1077-1081 ogni pulsante `padding: '12px 16px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0`. Cinque etichette: 'Materie prime', 'Prodotti finiti', 'Prezzi ingredienti', 'Carica merce', 'Log rifornimenti'.
- **proposta**: Due mosse insieme: ridurre a quattro schede con nomi corti ("Materie prime", "Prodotti finiti", "Carichi", "Prezzi") e su telefono aggiungere la sfumatura di taglio a destra (un gradiente da trasparente a bianco, 24px, `pointerEvents: 'none'`) che scompare quando si è a fondo scorrimento. Così si capisce che c'è altro anche senza provare.

### MEDIA · Due tessere si accendono in ambra mentre il banner sopra dice "niente di rotto"

- **riga** `957` · **categoria** colore
- **perché è un difetto**: Nello stato normale di una pasticceria che ordina una volta a settimana ci sono sempre qualche ingrediente sotto soglia e qualcuno che scenderà nei sette giorni. Il banner ha già fatto la scelta giusta: colore neutro e la frase "Niente di rotto: è la lista della spesa". Ma dieci pixel più sotto le tessere due e tre diventano ambra per gli stessi fatti. Lo stesso stato raccontato con due gravità diverse nella stessa occhiata: il pasticcere impara che l'ambra non vuol dire nulla, e quando servirà davvero non la guarderà.
- **prova addotta**: Riga 934 il banner in stato 'attenzione' usa `{ col: C.textMid, bg: T.bgSubtle, lbl: 'Da mettere in lista' }` (righe 906-909) e il messaggio finisce con `'. Niente di rotto: è la lista della spesa.'` (riga 919); riga 950 `color={esauriti.length > 0 ? C.red : sottoSoglia.length > 0 ? C.amber : C.green}` e riga 957 `color={attenzione.length > 0 ? C.amber : C.green}`.
- **proposta**: Lasciare "Da ordinare" e "In esaurimento" in colore neutro (`C.textMid`) e riservare l'ambra a chi ha meno di 3 giorni di scorta e il rosso solo agli esauriti. Sotto i numeri, `sub` con l'azione ("metti in lista"), non un colore. Coerente con la scelta già fatta sul banner e con il commento a riga 838.

### BASSA · La barra delle schede è fatta di cinque bottoni senza ruolo: da tastiera e da lettore di schermo non è una barra

- **riga** `1073` · **categoria** accessibilita
- **perché è un difetto**: Non c'è `role="tablist"`, non c'è `role="tab"`, non c'è `aria-selected`: chi usa un lettore di schermo sente cinque pulsanti generici uno dopo l'altro, senza sapere quale è quello attivo (l'informazione è affidata solo al colore del testo e a un bordino da 2px). Da tastiera le frecce destra/sinistra non spostano tra le schede, quindi bisogna tabulare su tutti e cinque i pulsanti per arrivare al contenuto.
- **prova addotta**: Righe 1073-1082: il contenitore è un `div` con solo stili; ogni voce è `<button key={id} onClick={() => setTab(id)} style={{...}}>` — nessun attributo `role`, `aria-selected` o `aria-controls`, e lo stato attivo è solo `color: tab === id ? T.text : T.textSoft` con `borderBottom`.
- **proposta**: `role="tablist"` sul contenitore, e su ogni pulsante `role="tab"`, `aria-selected={tab === id}`, `id={`tab-${id}`}`, `aria-controls={`pane-${id}`}`; il contenitore del contenuto con `role="tabpanel"`. Due righe di attributi, nessun cambio visivo.

### BASSA · La scheda aperta non viene ricordata: si torna sempre su "Materie prime"

- **riga** `576` · **categoria** struttura
- **perché è un difetto**: Chi sta registrando bolle apre "Carica merce", va a controllare una ricetta in un'altra pagina e torna: la vista viene smontata e rimontata, quindi si ritrova su "Materie prime" e deve rifare il percorso. Con dieci bolle da inserire e qualche controllo in mezzo, sono dieci tocchi in più.
- **prova addotta**: Riga 576 `const [tab, setTab] = useState('giacenze')`; in `src/Dashboard.jsx` riga 3379 la vista è dentro `{view==="magazzino" && ... && <MagazzinoView .../>}`, quindi cambiando pagina il componente si smonta e lo stato locale si perde.
- **proposta**: Ricordare la scheda per sessione: inizializzare da `sessionStorage.getItem('mag-tab')` con fallback 'giacenze' e salvarla in `setTab`. Sono tre righe e chi lavora a raffica non perde più il punto.


---

## Log rifornimenti

_13 difetti sostenuti_

### ALTA · Gli scarichi sono verdi come i carichi: si distinguono solo dal segno meno a 11px

- **riga** `1344` · **categoria** colore
- **perché è un difetto**: Il sottotitolo promette "Storico carichi e scarichi", ma la colonna Quantità è verde fissa per tutte le righe. Chi rilegge il log per capire dove è finito il burro vede una colonna tutta verde e deve accorgersi di un trattino largo tre pixel, dietro il banco, su una tabella a 11px. Carico e scarico sono le due cose opposte che questa scheda esiste per raccontare.
- **prova addotta**: riga 1344: `<td style={{ ..., color: C.green }}>{fmtG(r.quantita_g)}</td>` — colore costante; riga 797 scrive gli scarichi come negativi: `quantita_g: formMode === 'scarico' ? -qty : qty`. Nessun altro segnale di tipo nella riga.
- **proposta**: Aggiungere una colonna "Tipo" con etichetta testuale ("Carico" / "Scarico") e colorare la quantità in base al segno: carico in C.text (nero) con "+", scarico in C.amber con "−". Il verde non serve: un carico è la normalità, non un evento positivo da festeggiare. Esempio: `const isScarico = r.quantita_g < 0` e poi `color: isScarico ? C.amber : C.text` con prefisso `{isScarico ? '−' : '+'}{fmtG(Math.abs(r.quantita_g))}`.

### ALTA · Migliaia senza punto: un sacco da 2 kg si legge "2000 g" invece di "2.000 g"

- **riga** `872` · **categoria** tipografia
- **perché è un difetto**: È esattamente il bug che _shared.jsx dice di aver già corretto sugli importi. `toLocaleString('it-IT')` senza opzioni non raggruppa i numeri a 4 cifre: tutte le quantità tra 1.000 e 9.999 (cioè quasi tutti i rifornimenti reali: 2 kg di burro, 5 kg di farina) perdono il punto delle migliaia proprio nella colonna che conta.
- **prova addotta**: riga 872: `return `${Math.round(n).toLocaleString('it-IT')} g`` (e riga 873 per i kg, anch'essa senza `useGrouping`). Verificato in node con lo stesso codice: 2000 → "2000 g", 9999 → "9999 g", 28000 → "28.000 g"; in kg 1500 → "1500,00 kg", 12000 → "12.000,00 kg". _shared.jsx righe 42-47 documenta il fix già fatto altrove: «CRITICAL FIX 2026-06-25 … Forziamo useGrouping: 'always'».
- **proposta**: Riusare lo stesso pattern di _shared.jsx: due `Intl.NumberFormat('it-IT', { useGrouping: 'always', … })` precostruiti dentro fmtG (uno a 0 decimali per i grammi, uno a 2/3 per i kg) invece di `toLocaleString` nudo. Cambia una riga e sistema tutta la pagina, non solo il log.

### ALTA · Nessuna paginazione né limite: con anni di storico la scheda stampa tutte le righe

- **riga** `1340` · **categoria** struttura
- **perché è un difetto**: `logRif.map` renderizza l'array intero. Ogni carico, ogni scarico, ogni riga da foto, dal primo giorno. Mara carica merce 2-3 volte a settimana su ~60 ingredienti: dopo due anni sono migliaia di <tr> in un colpo, il tablet si impunta e — peggio — non c'è modo di arrivare a quello che cerchi. Il log prezzi, nello stesso file, si limita a 50 righe e lo dice.
- **prova addotta**: riga 1340: `{logRif.map((r, i) => (` — nessuno `slice`, nessun filtro, nessun campo di ricerca in tutto il blocco 1321-1353. Confronto interno: riga 408 `{logPrezzi.slice(0, 50).map(l => (` e riga 393 `Storico modifiche prezzi · ultime {Math.min(50, …)} di {logPrezzi?.length || 0}`.
- **proposta**: Testa di tabella con il conteggio ("1.284 movimenti · mostro gli ultimi 100"), un filtro ingrediente (la datalist `ing-list` esiste già, riga 1304) e un filtro mese/anno, più un "Mostra altri 100" in fondo. Ordinare e filtrare prima di stampare, con `useMemo`.

### ALTA · Una riga sbagliata non si può correggere né annullare

- **riga** `1341` · **categoria** correttezza
- **perché è un difetto**: Battere 20000 invece di 2000 sul form carico è l'errore più comune di questa pagina, e il log è il posto dove uno va a cercarlo. Ma la riga non ha nessuna azione: né modifica, né annullo, né storno. La giacenza resta gonfia di 18 kg di burro che non esistono, il valore a magazzino è falso e l'unico rimedio (uno scarico compensativo dalla scheda "Carica merce") non è suggerito da nessuna parte. La tabella delle giacenze, due tab più in là, ha il bottone cestino per ingrediente: qui non c'è niente.
- **prova addotta**: righe 1340-1347: la `<tr>` ha solo 4 `<td>` (Data, Ingrediente, Quantità, Note), nessun bottone. `setLogRif` è chiamato solo in due punti, entrambi di scrittura in aggiunta: riga 808 (`setMagazzino(nm); setLogRif(log)`) e riga 1250 (OCR). Confronto: riga 1210 nella tabella giacenze ha `<button aria-label="Elimina ingrediente" …>`.
- **proposta**: Azione per riga "Annulla questo movimento" che NON cancella la storia ma scrive lo storno: nuova riga con quantità opposta, `note: 'rettifica del 08/09/2026 14:30'`, e la giacenza aggiornata di conseguenza — save-first (await ssave(SK_MAG) e ssave(SK_LOGRIF) prima dei setState, come handleCarica a riga 800-808). Con conferma, perché tocca la giacenza.

### ALTA · La tabella non scorre in orizzontale: sul telefono le 4 colonne vengono schiacciate

- **riga** `1330` · **categoria** mobile
- **perché è un difetto**: Il contenitore ha `overflow: 'hidden'` e la tabella non ha `minWidth` né wrapper scrollabile: su un telefono da 360px le colonne Data, Ingrediente, Quantità e Note si compattano fino a rompersi, e le note tipo "Metro - bolla 1234" spariscono o spezzano la riga. È la regola scritta in CLAUDE.md ("mai overflow hidden che le comprime su mobile") e la tabella gemella delle giacenze, nello stesso file, è fatta giusta.
- **prova addotta**: riga 1330: `borderRadius: 18, overflow: 'hidden'`; riga 1331: `<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>` senza minWidth. Confronto righe 1129-1131: stesso contenitore ma con `<div style={{ overflowX: 'auto' }}>` e `<table style={{ …, minWidth: 760 }}>`.
- **proposta**: Avvolgere la tabella in `<div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>` e dare `minWidth: 560` alla table, identico al pattern di riga 1129. Meglio ancora: su `isMobile` mostrare card a due righe (data + ingrediente sopra, quantità grande sotto) invece della tabella.

### MEDIA · Tutta la tabella del log è a 11px, sotto il minimo di progetto

- **riga** `1331` · **categoria** accessibilita
- **perché è un difetto**: Il testo del log — date, ingredienti, quantità, note — è a 11px, e le intestazioni pure, in maiuscoletto spaziato che a 11px è ancora più chiuso. Chi legge ha sessant'anni e sta in piedi in laboratorio con le mani sporche. Il file stesso, in testa, dice che gli 11 residui restano da alzare.
- **prova addotta**: riga 1331: `fontSize: 11` sulla table (eredita a tutte le celle); riga 1335: `fontSize: 11, … letterSpacing: '0.07em', textTransform: 'uppercase'` sulle th. Commento del file righe 27-40: «Restano da alzare i 10 e gli 11 residui».
- **proposta**: Table a `fontSize: 13`, th a 12 (le th sono 4, non nove come nelle giacenze: c'è tutto lo spazio). La quantità, che è il numero che si cerca, a 14 e in grassetto.

### MEDIA · La data va a capo spezzata, mentre nel log prezzi lo stesso valore è protetto

- **riga** `1342` · **categoria** mobile
- **perché è un difetto**: "08/09/2026, 14:30" senza `whiteSpace: 'nowrap'` si rompe in "08/09/2026," più "14:30" appena la colonna si stringe (e si stringe, vedi il difetto della tabella non scrollabile). Una data spezzata su due righe in un log da rileggere in fretta è rumore, e disallinea tutta la riga.
- **prova addotta**: riga 1342: `<td style={{ padding: '10px 14px', color: C.textMid }}>{new Date(r.data).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>` — nessun nowrap. Confronto riga 410 (log prezzi, stessa formattazione): `color: C.textMid, whiteSpace: 'nowrap'`, e lì l'anno è a 2 cifre.
- **proposta**: Aggiungere `whiteSpace: 'nowrap'` e togliere la virgola dell'anno completo: data su una riga ("08/09/2026") e ora sotto in grigio piccolo ("14:30"), come si legge una bolla. Oppure `year: '2-digit'` come già fa il log prezzi.

### MEDIA · I numeri della colonna Quantità non sono incolonnati né tabellari

- **riga** `1344` · **categoria** tipografia
- **perché è un difetto**: La cella è allineata a sinistra e senza `TNUM`: una colonna di "2,00 kg", "−28,000 kg", "0,500 kg" resta a bandiera con cifre di larghezza diversa, quindi non si confrontano a occhio due carichi dello stesso ingrediente — che è il motivo per cui si apre questa scheda. Tutte le celle numeriche delle giacenze usano TNUM e sono allineate.
- **prova addotta**: riga 1344: `style={{ padding: '10px 14px', fontWeight: 700, color: C.green }}` — nessun `textAlign`, nessuno spread `...TNUM`. TNUM è definito in _shared.jsx riga 32 e usato per esempio alle righe 1159, 1167, 1031 della stessa view.
- **proposta**: `textAlign: 'right'` su th e td della colonna Quantità (la th di riga 1335 forza `textAlign: 'left'` su tutte e quattro: passare a `textAlign: i === 2 ? 'right' : 'left'`, come fa la th del log prezzi a riga 403) e aggiungere `...TNUM`.

### MEDIA · Nessun ordinamento esplicito: la scheda si fida dell'ordine in cui i dati sono arrivati

- **riga** `1340` · **categoria** correttezza
- **perché è un difetto**: La tabella stampa l'array così com'è. Funziona per caso, perché i due writer mettono le nuove righe davanti; ma niente garantisce l'ordine dopo un merge o un import, e le intestazioni non sono cliccabili — mentre il resto della pagina ha le colonne ordinabili. Un log di magazzino che potrebbe mostrare il 2024 sopra il 2026, senza che nulla lo dichiari, non è consultabile: e non si può nemmeno raggruppare per ingrediente.
- **prova addotta**: riga 1340 `{logRif.map((r, i) => (` senza `sort`; righe 1334-1336 sono `<th>` semplici, mentre `useSortable, SortTH` sono importati a riga 20 e usati alle righe 1134-1142. `mergeArr` (src/lib/multiSediMerge.js righe 12-14) è una `flat()` che non riordina, e le righe da foto (righe 1237-1242) condividono lo stesso `Date.now()`.
- **proposta**: Ordinare in un `useMemo`: `[...(logRif||[])].sort((a,b) => new Date(b.data) - new Date(a.data))`, e rendere ordinabili Data / Ingrediente / Quantità con SortTH già disponibile nel file, così "tutti i carichi di burro" si trovano con un click.

### MEDIA · Lo stato vuoto è un vicolo cieco: dice che non c'è niente e non dice cosa fare

- **riga** `1327` · **categoria** copy
- **perché è un difetto**: Al primo accesso — cioè quando la frase la legge chi non ha ancora capito il flusso — la scheda mostra un'icona e "Nessun rifornimento registrato", e finisce lì. Il posto dove si registra un rifornimento è la scheda accanto, e nessuno glielo dice. Costa un bottone.
- **prova addotta**: righe 1324-1328: il ramo vuoto contiene solo `<Icon name="clipboard" size={32} />` e `<div style={{ fontSize: 13, fontWeight: 600 }}>Nessun rifornimento registrato</div>`. Nessun bottone, nessun rimando a `setTab('carica')`, mentre il pattern esiste già a riga 1152 (il click sul nome ingrediente fa `setTab('carica')`).
- **proposta**: Due righe: "Qui finisce ogni carico e ogni scarico di materie prime. Per ora non c'è niente." più un bottone "Registra un carico" che fa `setTab('carica')`. Testo a 13, bottone con altezza 44 su mobile.

### MEDIA · Il log non dice chi ha registrato il movimento

- **riga** `797` · **categoria** struttura
- **perché è un difetto**: In un laboratorio con due o tre dipendenti la domanda vera davanti al log è "chi ha scaricato 8 kg di panna martedì?". La riga salvata non contiene l'utente, quindi la domanda non ha risposta — e la scheda è visibile anche ai dipendenti (il filtro dei tab esclude solo "Prezzi ingredienti"). Un registro che non attribuisce non chiude nessuna discussione.
- **prova addotta**: riga 797: `const logEntry = { id: `r-${Date.now()}`, data: now, ingrediente: formIng.trim(), quantita_g: …, note: … }` — nessun campo utente; idem la riga da foto a riga 1242. Riga 1074: il filtro dei tab è `.filter(([id]) => !(isDipendente && id === 'prezzi'))`, quindi il log lo vede anche il dipendente.
- **proposta**: Aggiungere `utente` all'entry (nome o email del profilo, già disponibile nel Dashboard che passa le prop) e una colonna "Registrato da". Le righe vecchie senza campo mostrano "-": non si inventa un nome, si lascia vuoto.

### BASSA · L'unità è kg per default e dal log non si può cambiare: 500 g diventano "0,500 kg"

- **riga** `872` · **categoria** correttezza
- **perché è un difetto**: `unitMode` parte da 'kg' e il selettore kg/g sta solo dentro la scheda "Materie prime": chi apre il log senza passare da là legge ogni quantità in chilogrammi, quindi un carico di 500 g di gelatina — digitato in grammi, perché il form chiede i grammi — compare come "0,500 kg". Tre decimali per un numero che l'utente ha scritto come 500 è un piccolo attrito ogni volta.
- **prova addotta**: riga 579: `const [unitMode, setUnitMode] = useState('kg')`; il toggle è alle righe 1092-1102, dentro il blocco `{tab === 'giacenze' && (` che inizia a riga 1086; la label del form a riga ~1280 dice `Quantità (g) - …`. fmtG (riga 873) in modalità kg produce "0,500 kg" per 500 (verificato).
- **proposta**: Portare il toggle kg/g accanto al titolo del log (SectHead accetta già `right`, vedi riga 1088) oppure, più semplice, nel log mostrare i grammi sotto il chilo e i kg sopra, con l'unità sempre scritta accanto al numero.

### BASSA · Il nome ingrediente in capitalize spezza le maiuscole delle parole reali

- **riga** `1343` · **categoria** tipografia
- **perché è un difetto**: `textTransform: 'capitalize'` mette l'iniziale maiuscola a ogni parola: "olio di semi" diventa "Olio Di Semi", "pasta di nocciole" diventa "Pasta Di Nocciole". Non è italiano, e in un elenco lungo lo si nota subito.
- **prova addotta**: riga 1343: `<td style={{ padding: '10px 14px', fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{r.ingrediente}</td>`.
- **proposta**: Maiuscola solo sulla prima lettera (`::first-letter` o una piccola funzione `capitalizzaPrima(nome)` condivisa), lasciando il resto come l'utente l'ha scritto. Vale anche per le altre celle che usano lo stesso capitalize in questa view (righe 1149, 411).
