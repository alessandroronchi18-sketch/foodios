# Audit Magazzino — esito

> `src/views/MagazzinoView.jsx`. Sei agenti hanno letto le cinque schede più la
> struttura e hanno sostenuto **113 difetti**. Una seconda ondata di agenti ha
> provato a RIFIUTARLI rileggendo il codice.
>
> **Verificati: 29 su 113.** 25 confermati, 4 rifiutati. Gli altri 84 sono
> rimasti senza verifica: il limite di sessione ha ucciso gli agenti a metà.
>
> Perché la distinzione conta: in questa giornata tre difetti che sembravano
> bug veri erano artefatti di dati di prova sbagliati, e fra i 4 rifiutati qui
> sotto c'è dello stesso genere. **Non correggere un difetto NON VERIFICATO
> senza aver prima riletto la riga citata.**
>
> Forme dati vere (dal database di produzione):
> `magazzino` chiavi **minuscole**, campi `giacenza_g`/`soglia_g`/`nome`/`ultimoRifornimento` ·
> ingredienti di ricetta con **`qty1stampo`** · `ingredienti_costi[k]` = **oggetto** `{costoKg,costoG}`
>
> Riprendere la verifica dei restanti 84 (i lettori tornano dalla cache):
> `Workflow({scriptPath: '~/.claude/projects/-Users-aler-foodos/9f6951b3-*/workflows/scripts/audit-magazzino-profondo-wf_57cd1808-fd9.js', resumeFromRunId: 'wf_57cd1808-fd9'})`

---

## CONFERMATI (25) — verificati riga per riga da un secondo agente

### ALTA · riga 43 · materie-prime
**I KPI dicono "clicca per vedere cosa ordinare" ma il componente KPI non riceve onClick: il click non fa niente**

- **perché**: E' la scorciatoia per arrivare alla lista di riordino da un magazzino di cento voci, e la card lo promette per iscritto. Chi clicca non ottiene niente, non c'e' nemmeno il cursore a mano che confermi che sia cliccabile: l'utente conclude che l'app non risponde e scorre a mano.
- **prova**: riga 43: `function KPI({ label, value, sub, color, highlight, icon })` — `onClick` non e' fra le props destrutturate e nel corpo (righe 44-73) non compare, quindi viene scartato. I chiamanti lo passano: righe 952-955 e 959-962 `onClick={critici.length > 0 ? () => { const el = document.getElementById('riordino-urgente'); ... } : undefined}`, con il sottotitolo `sub={critici.length > 0 ? 'clicca per vedere cosa ordinare' : 'tutto ok'}` a riga 951 e `'clicca per vedere quali'` a riga 958.
- **proposta dell'analista**: Aggiungere `onClick` alla firma e metterlo sul div esterno, con `cursor: onClick ? 'pointer' : 'default'`, `role="button"`, `tabIndex={0}` e Enter/Spazio quando e' presente. Finche' non funziona, il sottotitolo non deve dire "clicca".
- **rischio della correzione**: basso
- **nota del verificatore**: Difetto confermato dal codice, non un artefatto. Riga 43: `function KPI({ label, value, sub, color, highlight, icon })` — `onClick` non e' fra le props e non esiste rest spread (nessun `...` nelle righe 43-54); nel corpo (44-71) il div esterno `className="fos-tile"` ha solo `style`, nessun handler: la prop viene scartata senza warning. E' l'unica definizione di KPI nel modulo (dichiarato "inline, uso interno al modulo" alla riga 2; grep KPI da 43 come unica dichiarazione + 8 callsite), quindi non e' gestito altrove. I callsite passano davvero l'handler: righe 951-955 (`sub={critici.length > 0 ? 'clicca per vedere cosa ordinare' : 'tutto ok'}` + `onClick={... getElementById('riordino-urgente') ...}`) e 958-962 (`'clicca per vedere quali'`). L'intento era reale: l'ancora esiste alla riga 993 `<div id="riordino-urgente" ... scrollMarginTop: 70>` e la sezione si monta sotto la stessa condizione del click (riga 970 `{(critici.length > 0 || attenzione.length > 0) && ...}`) — manca solo il filo in mezzo. Confermata anche l'assenza di affordance: `.fos-tile` in src/views/_shared.jsx righe 111-129 fa solo hover lift/ombra/accent strip, nessun `cursor: pointer`. Nessuna forma dati coinvolta (puro wiring JSX; critici/attenzione usati solo come booleani di lunghezza), quindi il sospetto dati di prova non si applica. Unico margine, non bloccante: se tutte le righe critiche hanno riordinoG <

### ALTA · riga 136 · prodotti-finiti
**Se la rete cade la scheda dice "nessun prodotto in stock" invece di dire che non ha letto niente**

- **perché**: È il caso peggiore: un numero inventato spacciato per misurato. Il pasticcere guarda il tablet in laboratorio, legge "Nessun prodotto in stock", Sotto soglia 0 e Stock negativo 0 in verde, e conclude che il gestionale è a posto o che la vetrina è vuota. In realtà la scheda non ha letto nulla. E il messaggio d'errore previsto non arriva mai.
- **prova**: Il catch a riga 135-137 (notify?.('Errore caricamento stock: '...)) è codice morto: loadStockPF (src/lib/stockPF.js:30) e loadMovimentiPF (src/lib/stockPF.js:62) fanno `if (error) { console.error(...); return [] }`, non rilanciano. Quindi stock=[] e movimenti=[] anche su errore rete/RLS → riga 197 `stock.length === 0` → stato vuoto di riga 200-201, e righe 193-194 colorano i KPI in C.green.
- **proposta dell'analista**: Far tornare l'errore a chi chiama (es. `return { rows, error }` o rilancio in stockPF), tenere uno stato `errore` nel componente e mostrare al posto della tabella un riquadro: "Non riesco a leggere lo stock di questa sede. Controlla la connessione." con pulsante "Riprova". Quando il dato non c'è, i KPI vanno a "—", non a 0 verde.
- **rischio della correzione**: medio
- **nota del verificatore**: Difetto confermato citando il codice. stockPF.js:30 e :62 fanno `if (error) { console.error(...); return [] }` senza rilanciare, e supabase-js restituisce gli errori in-band (non lancia): quindi il catch di MagazzinoView.jsx:135-137 con notify('Errore caricamento stock: ') è codice morto per queste due letture. Su errore rete/RLS/5xx/JWT scaduto si ha stock=[] e movimenti=[] → riga 197 `stock.length === 0` → stato vuoto 200-201 che afferma anche una spiegazione falsa ("Lo stock si popola automaticamente alla conferma di una sessione di produzione"), righe 193-194 mostrano "Sotto soglia 0" e "Stock negativo 0" in C.green, e riga 250 (`movimenti.length > 0 &&`) fa sparire la tabella movimenti senza avviso: zero tracce a schermo. Nessuno stato errore/retry altrove nel file (grep su error/errore/offline: solo i toast di scrittura). Nessuna forma dati sbagliata: la claim usa solo le colonne del select a stockPF.js:26 (quantita, soglia_min, updated_at), non tocca giacenza_g/qty1stampo/costoKg. Attenuante trovata, che ridimensiona il titolo ma non il difetto: Dashboard.jsx:3290 mostra un banner globale "Connessione assente" quando !isOnline, quindi il caso letterale "rete che cade" un avviso lo dà (in contraddizione col testo sotto); restano scoperti Wi-Fi senza internet/captive portal, 5xx/timeout Supabase, JWT scaduto, RLS sbagliata, dove navigator.onLine è true e offlineMode non sc

### ALTA · riga 160 · prodotti-finiti
**Uno scarto registrato qui non entra nel registro sprechi né nel conto dei soldi persi**

- **perché**: Due porte per la stessa azione reale, e solo una tiene il conto. Il pasticcere registra qui "20 bignè buttati", lo stock scende, e a fine mese la scheda Sprechi e Omaggi dice che non ha buttato niente. Il valore in euro della perdita non esiste da nessuna parte.
- **prova**: riga 160 scrive solo la RPC stock_pf_scarto → tabella movimenti_stock_pf, che nessun altro file legge (unico consumer: src/lib/stockPF.js). Il registro canonico è SK_MOV: src/components/SpreciOmaggi.jsx:8 ("Store canonico = SK_MOV") e :373 ("il modello SK_MOV e' la verita' contabile"), che infatti chiama scartoPF come effetto collaterale (SpreciOmaggi.jsx:380) e non il contrario. Inoltre il select dei movimenti (stockPF.js:57) non porta `valore_unit`, quindi il costo non è nemmeno calcolabile qui.
- **proposta dell'analista**: Far scrivere anche il movimento SK_MOV (tipo spreco, causale scelta dall'utente) dentro handleScarto, oppure togliere il form da qui e mandare al modulo Sprechi con prodotto e sede già compilati. Un solo posto dove finiscono le perdite.
- **rischio della correzione**: medio
- **nota del verificatore**: Difetto CONFERMATO, ho provato a smontarlo e regge. (1) MagazzinoView.jsx:160 fa una sola scrittura, `await scartoPF({...})`, e nient'altro in tutto handleScarto (155-169). (2) Non e' igiene di stock ma registrazione di sprechi a tutti gli effetti: il modale a MagazzinoView.jsx:285-298 dice "Registra scarto", "Quantita' scartata (pz)", placeholder "es. caduti per terra, scaduti, dati a omaggio" (il pulsante "Azzera" a riga 236 e' invece lo strumento di igiene, e non e' questo). (3) Il registro canonico e' davvero SK_MOV: storageKeys.js:17 lo etichetta "per-sede (sprechi e omaggi)" e i suoi consumer sono proprio i percorsi dei soldi - SpreciOmaggi.jsx:180, ChiusuraView.jsx:295 e :612 (aggregaGiorno), api/chiusura-registra.js:94 ("Food cost di sprechi/omaggi del giorno"), api/spreco-registra.js:132. Nessuno di questi legge movimenti_stock_pf. (4) L'asimmetria e' esplicita e nel verso sbagliato: SpreciOmaggi.jsx:364 scrive prima SK_MOV, poi SpreciOmaggi.jsx:380 chiama scartoPF best-effort, con il commento a :373 "il modello SK_MOV e' la verita' contabile". Magazzino scrive solo lo store che nessuno riconcilia. (5) Nessun lettore nascosto: grep su tutto il repo per movimenti_stock_pf trova solo migrazioni SQL, un test e2e e src/lib/stockPF.js:56, il cui unico consumer applicativo e' il pannello "Movimenti recenti" della stessa pagina. Il valore in euro non esiste: la tabella (20260

### ALTA · riga 192 · prodotti-finiti
**"Pezzi totali" somma grammi e pezzi nello stesso numero**

- **perché**: Su una gelateria che sposta gusti in grammi tra sedi, il KPI più grande della pagina diventa un numero senza senso: 8 kg di pistacchio ricevuti fanno "8.020 pezzi totali". Il pasticcere legge un numero grosso e non sa che cosa conta. Meglio nessun numero che questo.
- **prova**: riga 174 `stock.reduce((s, r) => s + Number(r.quantita || 0), 0)` ignora `r.unita`, che invece esiste ed è usata a riga 222. Le righe in grammi sono reali: src/views/InventarioSettimanaleView.jsx:1182-1184 chiama `caricoProduzionePF({ ..., quantita: qtaG, unita: 'g' })` per i trasferimenti di gusti.
- **proposta dell'analista**: Raggruppare per unità e mostrare solo il totale dei pezzi nel KPI, con i kg nel sub: value "20 pz", sub "più 8,4 kg sfusi". Oppure due KPI separati. Mai una somma tra unità diverse.
- **rischio della correzione**: basso
- **nota del verificatore**: CONFERMATO. Ho letto le righe citate e reggono tutte.

1) Il codice dice esattamente quello che il difetto sostiene. `/Users/aler/foodos/src/views/MagazzinoView.jsx:174` è `const totPezzi = stock.reduce((s, r) => s + Number(r.quantita || 0), 0)` — nessun riferimento a `r.unita`. La riga 192 lo stampa come KPI `label="Pezzi totali"`. La riga 222 usa `{q.toLocaleString(...)} {r.unita}` per ogni riga della tabella, quindi il campo `unita` esiste davvero sull'oggetto riga e il file stesso lo sa: è la stessa `stock` array, la stessa `r`.

2) Non è un artefatto di dati di prova, e la forma dati è quella vera. Qui non c'entrano `giacenza_g/soglia_g` (magazzino jsonb) né `qty1stampo` né `{costoKg,costoG}`: la sorgente è un'altra tabella. `/Users/aler/foodos/src/lib/stockPF.js:26` fa `.select('id, prodotto_nome, quantita, unita, valore_unit, soglia_min, updated_at')` su `stock_prodotti_finiti`. Quindi `quantita` numerica + `unita` testuale sono lo schema reale di queste righe.

3) Le righe in unità diverse da 'pz' non sono ipotetiche, sono una feature esposta in UI. Oltre al call site indicato dal difetto (`/Users/aler/foodos/src/views/InventarioSettimanaleView.jsx` ~1182, `caricoProduzionePF({ ..., quantita: qtaG, unita: 'g' })` nel ramo in cui la sede destinazione non usa l'inventario differenziale), c'è una strada ancora più diretta: in `/Users/aler/foodos/src/components/Trasferiment

### ALTA · riga 288 · prodotti-finiti
**Il modale scarto dice sempre "(pz)" anche per una riga in grammi, e non passa l'unità al salvataggio**

- **perché**: Chi butta 3 kg di gelato in una riga registrata in grammi legge "Quantità scartata (pz)", scrive 3 e scarica 3 grammi. Lo scarico non torna, lo stock resta gonfio e nessuno capisce perché. La riga sa qual è la sua unità, il form la butta via.
- **prova**: riga 231 e 236 costruiscono scartoForm con { prodotto, qty, note, azzera } senza `unita: r.unita`; riga 288 ha l'etichetta fissa 'Quantità scartata (pz)'; riga 160 chiama `scartoPF({ sedeId, prodotto, quantita, note })` e scartoPF (src/lib/stockPF.js:103-117) non ha parametro unità.
- **proposta dell'analista**: Portare `unita: r.unita` e `disponibile: q` nello scartoForm; etichetta dinamica "Quantità scartata (g)" / "(pz)"; sotto il campo scrivere "Disponibili adesso: 8.400 g"; bloccare qty maggiore del disponibile con un messaggio, non con un errore SQL.
- **rischio della correzione**: basso
- **nota del verificatore**: Il nucleo del difetto regge, la seconda meta' no.

Cosa ho verificato riga per riga:
- /Users/aler/foodos/src/views/MagazzinoView.jsx:288 ha davvero l'etichetta fissa "Quantità scartata (pz)", dentro un modale position fixed inset 0 che copre la tabella: mentre l'utente digita non vede piu' la colonna "Disponibili".
- Righe 231 e 236: setScartoForm({ prodotto, qty, note, azzera }) non porta r.unita, che pero' e' disponibile (riga 222 la stampa: {q} {r.unita}).
- Nel modale (righe 281-306) non c'e' nessun altro punto che mostri unita' o disponibile: non e' gestito altrove.

Le righe con unita' diversa da pz esistono per davvero, non sono un artefatto di dati di prova. Due percorsi reali:
1. /Users/aler/foodos/src/views/InventarioSettimanaleView.jsx:1181-1184 chiama caricoProduzionePF({ quantita: qtaG, unita: 'g' }) quando si spedisce un gusto a una sede che non usa l'inventario differenziale. Crea in stock_prodotti_finiti esattamente la riga in grammi dello scenario (gelato, 8.400 g).
2. Trasferimenti tipo "prodotto": /Users/aler/foodos/src/components/TrasferimentiView.jsx:689-690 offre ['pz','vassoi','kg','g','l','ml'] e la RPC trasferimento_ricevi passa v_t.unita ad applica_delta_stock_pf.
La scheda "Prodotti finiti" non filtra per unita' (MagazzinoView.jsx:1073 e stockPF.loadStockPF), quindi quelle righe compaiono in tabella col bottone Scarto sopra. Conferma indiretta che l'

### ALTA · riga 290 · prodotti-finiti
**Nel campo quantità non si possono scrivere decimali: la virgola viene mangiata**

- **perché**: Per scartare 1,5 kg il pasticcere digita 1, poi la virgola: il campo torna a "1" e la virgola sparisce. Ci riprova, sparisce di nuovo. Se svuota il campo per riscrivere compare uno "0" che deve cancellare a mano. È il difetto che fa dire "questa cosa non funziona".
- **prova**: riga 290 `onChange={e => setScartoForm(f => ({ ...f, qty: parseFloat(e.target.value) || 0 }))}`: allo stato intermedio "1." parseFloat dà 1, lo stato diventa 1, il value controllato torna "1" e il separatore è perso; a campo vuoto parseFloat('') è NaN → `|| 0` → il campo mostra 0.
- **proposta dell'analista**: Tenere la stringa grezza nello stato (`qty: e.target.value`) e convertire una volta sola in handleScarto con `parseFloat(String(qty).replace(',', '.'))`. Niente `|| 0`: se è vuoto, il pulsante resta disabilitato.
- **rischio della correzione**: basso
- **nota del verificatore**: Difetto confermato leggendo il codice. MagazzinoView.jsx:289-290 e' un input controllato type="number" inputMode="decimal" con value={scartoForm.qty} e onChange={e => setScartoForm(f => ({ ...f, qty: parseFloat(e.target.value) || 0 }))}: esattamente quanto sostenuto. Su React 18.3 (package.json:35) il restoreControlledState per type=number riscrive il DOM quando value===0 && node.value==='', quindi (a) sullo stato intermedio non parsabile ("1," / "1.") il browser espone e.target.value==='' -> parseFloat NaN -> || 0 -> il campo viene riscritto a "0" e il separatore e' perso; (b) svuotando il campo ricompare uno "0" che si riscrive da solo, campo non azzerabile. Non e' gestito altrove: handleScarto (riga 157) fa solo if (!(scartoForm.qty > 0)) return, nessun replace della virgola. Prova decisiva: nello stesso file il tab materie prime usa gia' il pattern corretto - riga 1297 onChange={e => setFormQty(e.target.value)} e riga 782 parseFloat(String(formQty).replace(',', '.')) con commento di audit "locale IT usa la virgola decimale". Il modale scarto e' l'unico rimasto fuori dalla convenzione del progetto, quindi la proposta non e' peggiore del male: e' allineamento al pattern esistente. Correzione parziale della motivazione addotta: la scena "1,5 kg" non e' letterale (label "Quantita scartata (pz)", step="1"), ma i decimali sono reali in quest'area - stock_prodotti_finiti.quantita 

### ALTA · riga 732 · carica-merce
**Una giacenza negativa puo' comparire come "OK" in verde e non viene contata da nessun contatore**

- **perché**: La giacenza negativa la crea solo questa scheda (lo scarico oltre la giacenza, per scelta esplicita a riga 787-790), ed e' il caso in cui c'e' davvero qualcosa da fare: qualcuno ha sbagliato a registrare, o la merce e' uscita senza carico. Invece a -500 g con soglia a zero e senza storico consumi la riga si legge "OK" verde, mentre a 0 g esatti si legge "Esaurito" rosso. Meno di zero e' peggio di zero, e viene mostrato come meglio.
- **prova**: riga 732 `giacenza === 0 ? 'esaurito' :` con uguaglianza stretta: -500 non e' 0. Con soglia 0 salta anche il ramo `soglia > 0 && giacenza <= soglia` (riga 733), e se `giorniScorta` e' null (nessun consumo, riga 730) si arriva a 'ok'. `esauriti` (riga 762) e la banda di salute (righe 773-775) non vedono nulla. Il tab Prodotti finiti invece ha la KPI dedicata "Stock negativo" (riga 194): le materie prime non l'hanno.
- **proposta dell'analista**: Aggiungere uno stato `negativo` in cima alla catena (`giacenza < 0 ? 'negativo'`), con etichetta "Da correggere", colore rosso e un conteggio nella banda di salute, come la KPI "Stock negativo" dei prodotti finiti.
- **rischio della correzione**: medio
- **nota del verificatore**: CONFERMATO. Ho letto il codice e le righe dicono esattamente quello che il difetto sostiene.

Catena di stato (/Users/aler/foodos/src/views/MagazzinoView.jsx:726-736):
  const giacenza = m.giacenza_g || 0        // 726: nessun clamp, il negativo passa
  const soglia = m.soglia_g || 0            // 727
  const giorniScorta = consumoG > 0 ? giacenza / consumoG : null   // 730
  giacenza === 0 ? 'esaurito' :             // 732 uguaglianza stretta: -500 non entra
  soglia > 0 && giacenza <= soglia ? ...    // 733 con soglia 0 il ramo non parte
  ... : 'ok'                                // 736

Con giacenza = -500, soglia = 0 e fabb = 0 (→ consumoG 0 → giorniScorta null) lo stato e' 'ok'. E 'ok' rende verde con etichetta "OK": statoColor/statoBg/statoLabel (righe 861-867) mandano tutto quello che non e' esaurito/critico/attenzione su C.green + 'OK'. La riga mostra "-500 g" in verde (fmtG stampa il segno, riga 1159 e 1168 colorano con statoColor). A 0 g esatti invece e' rosso "Esaurito": l'asimmetria denunciata c'e'.

Nessun contatore la vede: esauriti (762) e sottoSoglia (763) filtrano su stato, la banda salute (773-775) deriva solo da quelli, e la lista "da riordinare" (971-981) parte da critici+attenzione. Il riordino calcolato (riordinoG = 500 a riga 750) viene poi nascosto dal gate di riga 1182, che stampa il suggerimento solo per critico/esaurito/attenzione. Quindi la riga peg

### ALTA · riga 785 · carica-merce
**Lo scarico legge la giacenza dalla chiave grezza, non da quella aggregata: falso allarme e numero sbagliato**

- **perché**: Chi ha in magazzino 5 kg di uova e ne scarica 500 g si vede scritto che sta scaricando piu' di quello che ha, e nel messaggio finale legge "giacenza: -500g" invece di 4.500 g. Il file stesso documenta (righe 662-685) che sui dati reali di Gelateria Demo 5 chiavi su 35 non sono canoniche: uova, noci, nocciole, mirtilli, mandorle. Sono esattamente gli ingredienti che si scaricano a mano.
- **prova**: riga 780 `const k = normIng(formIng.toLowerCase().trim())` + riga 785 `const attuale = magazzino?.[k]?.giacenza_g || 0`. La tabella invece legge da `magPerNorm` (riga 724-726), che aggrega le chiavi. `SING_PLUR` in foodcost.js:481 mappa ["uova","uovo"], e il clic rapido di riga 1154 precompila `setFormIng(r.nome)` cioe' "uova": quindi k="uovo", `magazzino["uovo"]` non esiste, attuale=0, nuova=-500. Anche la riga 795 scrive `soglia_g: magazzino?.[k]?.soglia_g || 0`, azzerando la soglia salvata sotto "uova".
- **proposta dell'analista**: Leggere `const gruppo = magPerNorm[k] || {}; const attuale = gruppo.giacenza_g || 0` e `soglia_g: gruppo.soglia_g || 0`. In scrittura consolidare il gruppo sulla chiave canonica come fa gia' handleDeleteIng (righe 639-641): cancellare le `raw` con `normIng(raw) === k` e scrivere una sola voce `k` con il totale.
- **rischio della correzione**: medio
- **nota del verificatore**: Il difetto regge, e l'ho riprodotto eseguendo il vero normIng sui dati veri del seed.

Cosa dice il codice, letto riga per riga:
- /Users/aler/foodos/src/views/MagazzinoView.jsx:780 `const k = normIng(formIng.toLowerCase().trim())`
- riga 785 `const attuale = magazzino?.[k]?.giacenza_g || 0` — legge il dizionario grezzo
- riga 725 la tabella invece legge `const m = magPerNorm[k] || {}` — legge l'aggregato
Due letture diverse per lo stesso ingrediente, e l'aggregato esiste proprio perche le chiavi salvate non sono canoniche.

La forma dei dati e' quella giusta, non un artefatto: /Users/aler/foodos/src/lib/demoSeedFull.js:313 salva `uova: mk('uova', 4800, 1500)` — chiave minuscola, campi giacenza_g/soglia_g. Stessa cosa per `nocciole` (riga 319) e `mandorle` (riga 320). E /Users/aler/foodos/src/lib/foodcost.js:481 contiene `["uova","uovo"]`, con normIng che fa solo un lookup su mappa: normIng("uova") = "uovo", verificato eseguendolo.

La catena si chiude: il clic rapido alla riga 1154 fa `setFormIng(r.nome)`, e `r.nome` viene da `acc.nome = v?.nome || raw` (riga 695), cioe' "uova". Quindi k = "uovo", `magazzino["uovo"]` non esiste, attuale = 0. Chi ha 4.800 g di uova e ne scarica 500 legge due frasi sbagliate:
- il falso allarme della riga 790: "scarico maggiore della giacenza (uova: 0g -> -500g)"
- la conferma della riga 810: "giacenza: -500g" invece di 4.300 g
Sono esattamente 

### ALTA · riga 792 · carica-merce
**L'avviso "scarico maggiore della giacenza" viene cancellato dal toast di successo**

- **perché**: E' l'unico avviso che dice al pasticcere che il magazzino e' andato sotto zero, e in pratica non lo legge mai: pochi decimi di secondo dopo (il tempo delle due scritture) al suo posto compare il messaggio verde con la spunta. Resta sullo schermo la conferma, non l'anomalia.
- **prova**: riga 792 `notify(...)` e riga 810 `notify(...)` nella stessa esecuzione. `notify` in Dashboard.jsx:1474 e' a slot unico: `if (notifyTimerRef.current) clearTimeout(...); setToast({msg,ok})` sovrascrive il precedente.
- **proposta dell'analista**: Chiedere conferma prima di scrivere ("In magazzino ci sono 1.200 g, ne stai togliendo 1.500. Registro comunque?") oppure fondere i due messaggi in uno solo: "Registrato. Attenzione: burro va a -300 g".
- **rischio della correzione**: basso
- **nota del verificatore**: Verificato riga per riga: il difetto regge, anche se la motivazione addotta e' in parte sbagliata.

COSA HO CONFERMATO
- /Users/aler/foodos/src/views/MagazzinoView.jsx:791-793 — `if (nuova < 0) notify('Attenzione: scarico maggiore della giacenza (...). Registrato.', false)`. Chiamata sincrona, prima di qualsiasi await.
- Riga 802: `await ssave(SK_MAG, nm); await ssave(SK_LOGRIF, log)` — due round-trip Supabase (con retry interno a ssave).
- Riga 810: `notify('✓ ...')` nella stessa esecuzione.
- /Users/aler/foodos/src/Dashboard.jsx:1474-1477 — notify e' a slot unico: `clearTimeout(notifyTimerRef.current); setToast({msg,ok}); setTimeout(...3000)`. Nessuna coda.

Il punto decisivo: NON esiste un percorso in cui l'avviso di riga 792 sopravviva. Se le ssave riescono, lo sovrascrive il toast di riga 810. Se falliscono, lo sovrascrive quello di riga 804. In entrambi i casi resta a schermo il messaggio successivo. La riga 792 e' codice utente-visibile morto: vive solo per la durata delle due scritture (qualche decimo di secondo su rete normale). Questo e' dimostrabile dal codice, non e' gusto.

Forma dati: corretta. Usa `magazzino?.[k]?.giacenza_g` con chiave normalizzata minuscola (`normIng(formIng.toLowerCase().trim())`) e scrive `giacenza_g`/`soglia_g`. Nessun coinvolgimento di qty1stampo o ingredienti_costi. Non e' un artefatto di dati di prova.

Gestito altrove? No, non per gli in

### ALTA · riga 810 · carica-merce
**I numeri dei messaggi di carico non sono in formato italiano, e uno stampa il float grezzo**

- **perché**: Chi carica un sacco di farina legge "+25000g" e deve contare gli zeri per capire se sono 25 kg o 2,5 kg. Nel resto della pagina lo stesso numero e' scritto "25,00 kg" o "25.000 g" da `fmtG`. Nel messaggio di sforamento puo' uscire anche una coda di decimali binari, che sembra un errore del programma.
- **prova**: riga 810 `notify(`✓ ${segno}${qty}g di ${formIng} - giacenza: ${Math.round(nuova)}g`)`: nessun separatore migliaia, nessuno spazio prima dell'unita'. riga 792 `${attuale}g → ${nuova}g` stampa `nuova` non arrotondato: con attuale 1000,2 e scarico 1000,3 esce "-0.09999999999999998g".
- **proposta dell'analista**: Riusare `fmtG` (riga 870), che rispetta anche il toggle kg/g scelto dall'utente: `notify(`${segno}${fmtG(qty)} di ${formIng} — in magazzino ora ${fmtG(nuova)}`)`.
- **rischio della correzione**: basso
- **nota del verificatore**: Verificato riga per riga sul file reale: il difetto regge su entrambi i capi.

1) MagazzinoView.jsx:810 e' letteralmente `notify(`✓ ${segno}${qty}g di ${formIng} - giacenza: ${Math.round(nuova)}g`)`. Interpolazione nuda: nessun separatore migliaia IT, nessuno spazio prima dell'unita'. Un carico di 25 kg esce "+25000g", mentre nella stessa pagina lo stesso numero passa da `fmtG` (definito a 870) e si legge "25.000 g" o "25,00 kg" (usi a 1031, 1159, 1167, 1200, 1344). Non e' gusto: c'e' la regola di progetto sui numeri in formato italiano, e il commento a 868-869 sopra `fmtG` dice esplicitamente "Niente piu mix" — le due notify la aggirano.

2) MagazzinoView.jsx:792 stampa `${attuale}g → ${nuova}g` con `nuova` NON arrotondato. Riprodotto con node usando i valori addotti (attuale 1000,2, scarico 1000,3): esce `-0.09999999999990905g`. Le ultime cifre della coda differiscono da quelle scritte nel report, il fenomeno e' identico. La stessa riga stampa anche `attuale` come "1000.2g", con punto decimale anglosassone in una UI italiana: punto ulteriore che il report non aveva nemmeno rilevato.

Raggiungibile senza dati finti: riga 782 fa `parseFloat(String(formQty).replace(',', '.'))`, quindi le giacenze frazionarie sono previste dall'autore stesso; inoltre ProduzioneGiornalieraView.jsx:152, :211, :474 scrivono in `giacenza_g` quantita' di ricetta non arrotondate (a differenza di invent

### ALTA · riga 818 · materie-prime
**Salvare la soglia su un ingrediente con chiave al plurale crea una seconda voce: la soglia non si puo' più abbassare e il nome viene riscritto**

- **perché**: Il file stesso documenta che in produzione esistono chiavi non canoniche ("uova", "nocciole", "mandorle" su Gelateria Demo). Su quelle righe l'utente abbassa la soglia da 2 kg a 500 g, la pagina non protesta, e la soglia resta 2 kg: continua a ricevere l'avviso di riordino su merce che ha deciso di tenere più bassa. E la riga cambia nome sotto gli occhi.
- **prova**: riga 818: `const nm = { ...magazzino, [k]: { ...(magazzino?.[k] || {}), nome: k, soglia_g: ... } }` scrive sotto la chiave CANONICA `k`, ma `magazzino` e' indicizzato con le chiavi grezze (commento righe 665-690). Con raw='uova' e k=normIng('uova')='uovo' (foodcost.js riga 481) `magazzino['uovo']` e' undefined → nasce una voce nuova senza `giacenza_g`, mentre 'uova' conserva la vecchia soglia. Poi riga 680: `acc.soglia_g = Math.max(acc.soglia_g, ...)` → vince sempre la più alta. E riga 684 `if (!acc.nome || raw === k) acc.nome = v?.nome || raw` → la voce nuova ha raw===k, quindi il nome visualizzato passa da "Uova" a "uovo".
- **proposta dell'analista**: `handleSoglia` deve scrivere su tutte le chiavi grezze della riga (in `magPerNorm` c'e' già `chiaviRaw`, riga 686), come fa `handleDeleteIng` alle righe 631-633. E non deve toccare `nome`: togliere `nome: k`, che oltre a questo appiattisce a minuscolo l'etichetta scritta dall'utente ("Cioccolato Fondente 70%").
- **rischio della correzione**: basso
- **nota del verificatore**: Difetto CONFERMATO, verificato leggendo il codice ed eseguendolo. (1) La riga 818 di /Users/aler/foodos/src/views/MagazzinoView.jsx e' esattamente quella sostenuta: `const nm = { ...magazzino, [k]: { ...(magazzino?.[k] || {}), nome: k, soglia_g: ... } }`. (2) `handleSoglia` e' chiamata solo da riga 1195 come `handleSoglia(r.k, editSoglia.val)`; `r.k` viene da `righe` (724) -> `tuttiIngNomi` (710) -> `Object.keys(magPerNorm)` + `normIng` sulle ricette, quindi `k` e' SEMPRE canonica, mentre `magazzino` resta indicizzato con le chiavi grezze (commento 662-685: aggregazione in lettura, nessuna migrazione). (3) `normIng('uova') === 'uovo'` (/Users/aler/foodos/src/lib/foodcost.js:522 + SING_PLUR riga 482). (4) La forma dati NON e' un artefatto di test: le chiavi al plurale le scrive il codice spedito, /Users/aler/foodos/src/lib/demoSeedFull.js righe 313/321/322/332/334 (`uova: mk('uova', 4800, 1500)`, nocciole, mandorle, mirtilli, noci) con campi giacenza_g/soglia_g regolari; nessuna canonicalizzazione in lettura/scrittura (mergeMag in /Users/aler/foodos/src/lib/multiSediMerge.js non tocca le chiavi). (5) Prova per esecuzione, copiando 1:1 `magPerNorm` e la riga 818 e importando il vero `normIng`: partendo da {uova:{nome:'Uova',giacenza_g:4800,soglia_g:1500}} e abbassando la soglia a 500 -> DB {"uova":{...soglia_g:1500},"uovo":{"nome":"uovo","soglia_g":500}}, riga mostrata soglia_g 1

### ALTA · riga 836 · materie-prime
**"Aggiungi ingrediente" su un ingrediente che esiste già azzera la giacenza e la soglia, senza avviso e senza riga di log**

- **perché**: Il pasticcere non ricorda se il burro c'e' già in elenco, apre il pannello, scrive "burro", lascia vuoti i due campi numerici e clicca Aggiungi: i 12 kg di burro in giacenza diventano 0 e la soglia sparisce. Nessun messaggio, nessuna riga nel Log rifornimenti da cui risalire, e la riga diventa rossa "ESAURITO". Questo e' l'unico punto della pagina che perde giacenza senza tracciarla.
- **prova**: riga 836: `const nm = { ...magazzino, [k]: { nome: newIngNome.trim(), giacenza_g: parseFloat(newIngQty) || 0, soglia_g: parseFloat(newIngSoglia) || 0, ultimoRifornimento: new Date().toISOString() } }` — nessuna lettura di `magazzino[k]` prima di sovrascrivere, nessun `ssave(SK_LOGRIF, ...)` (`handleCarica` a riga 789 invece scrive il log). Riga 834 `if (!newIngNome) return`, quindi il nome duplicato non e' nemmeno controllato.
- **proposta dell'analista**: Se `magPerNorm[k]` esiste già, non salvare: mostrare "Burro e' già in magazzino con 12,00 kg. Vuoi caricarne altro?" con il pulsante che porta a Carica merce (`setTab('carica')`, come fa il click sul nome a riga 1154). Se il nome e' vuoto, un notify invece del `return` muto.
- **rischio della correzione**: basso
- **nota del verificatore**: Difetto CONFERMATO, dimostrabile dal codice. Riga 836 di /Users/aler/foodos/src/views/MagazzinoView.jsx e' verbatim come sostenuto: `const nm = { ...magazzino, [k]: { nome: newIngNome.trim(), giacenza_g: parseFloat(newIngQty) || 0, soglia_g: parseFloat(newIngSoglia) || 0, ultimoRifornimento: new Date().toISOString() } }` — nessuna lettura di magazzino[k]/magPerNorm[k], nessun ssave(SK_LOGRIF, ...). (1) COLLISIONE REALE: normIng (src/lib/foodcost.js:522) fa toLowerCase().trim() + collasso spazi + mappa plurale->singolare, quindi "Burro"/"burro"/" burro " -> k="burro" e "uova" -> "uovo"; le scritture correnti sono canoniche (commento riga 686: "le scritture nuove sono gia' canoniche"), percio' lo spread sostituisce l'intero record: 12 kg -> 0 (parseFloat('') = NaN -> || 0) e soglia -> 0. Forma dati corretta (chiavi minuscole, giacenza_g/soglia_g): non e' artefatto di dati di prova. (2) NON GESTITO ALTROVE: ssave (src/lib/storage.js:150) persiste data_value: value intero, nessun merge server-side; il pannello UI (righe 1109-1128) ha tre input nudi, nessun datalist/avviso, bottone non disabilitato per nomi esistenti; il toast a riga 852 e' di successo ("aggiunto al magazzino"). Grep su SK_LOGRIF: scritture solo a 802 (handleCarica) e 1246 (OCR), non in handleAddIngrediente. (3) STATO ROSSO: righe -> `giacenza === 0 ? 'esaurito'` -> C.red, quindi la riga diventa Esaurito. (4) ASIMME

### ALTA · riga 1128 · materie-prime
**La tabella parte da 11px e scende a 10 e 10,5 nelle colonne Ultimo riforn. e Soglia; l'header e' a 10px**

- **perché**: E' la regola scritta a riga 34 di questo stesso file: sotto i 12px non si legge, dietro un banco, a sessant'anni. La data dell'ultimo rifornimento a 10px e la soglia a 10,5px sono i due dati su cui si decide un ordine; l'header a 10px maiuscolo spaziato e' quello che dice cosa sono le nove colonne.
- **prova**: riga 1128: `fontSize: 11` sull'elemento table, ereditato da ogni cella che non lo sovrascrive (nome riga 1152, Fabb. sett. riga 1167, Giorni scorta riga 1168, l'importo di Valore riga 1173). Riga 1207: `fontSize: 10` sulla data. Riga 1199: `fontSize: 10.5` sul pulsante soglia. Header: `SortTH` in _shared.jsx riga 442 `fontSize: 10`. Il commento a righe 30-40 lo ammette: "Restano da alzare i 10 e gli 11 residui: si tocca la larghezza delle colonne di una tabella a nove colonne".
- **proposta dell'analista**: Base tabella a 13, header a 11 (minimo per il maiuscoletto spaziato, coerente con il resto della pagina), data e pulsante soglia a 12. Le nove colonne non ci stanno più in 760px: e' il momento di togliere "Fabb. sett." (informazione che serve solo a spiegare "Giorni scorta", puo' stare nel tooltip) e di alzare `minWidth` a ~900, il contenitore ha già `overflowX: 'auto'` a riga 1127.
- **rischio della correzione**: medio
- **nota del verificatore**: Difetto accettato: il codice dice esattamente quello che il difetto sostiene, verificato riga per riga. Riga 1128 `<table style={{ ... fontSize: 11, minWidth: 760 }}>`, e le celle citate non hanno un fontSize proprio quindi ereditano l'11 (1152 nome, 1167 Fabb. sett., 1168 Giorni scorta, 1172-1173 Valore). Riga 1207 `fontSize: 10` sulla data dell'ultimo rifornimento. Riga 1199 `fontSize: 10.5` sul pulsante soglia. E _shared.jsx riga 443 `fontSize: 10` dentro SortTH, con maiuscolo e letterSpacing 0.05em: l'header delle nove colonne e' davvero a 10px.

Non e' gusto: la regola e' scritta a righe 30-40 di questo stesso file ("sotto i 12px non si legge"), e' gia' stata applicata a Chiusura e Calendario, e il commento a riga 38 ammette in chiaro che i 10 e gli 11 sono rimasti fuori dalla bonifica. Un commento che rinvia non e' "gia' gestito".

Controlli di rigetto tutti negativi: nessuna regola CSS globale sovrascrive il font della tabella; nessuna variante a schede per mobile, il tab giacenze (riga 1087) rende questa stessa tabella su ogni schermo con solo overflowX; il conteggio residuo nel file (7 volte 10, 2 volte 10,5, 38 volte 11, zero a 8 e 9) combacia con quanto dichiarato. Il difetto e' puramente tipografico, non assume nessuna forma dati, quindi non e' un artefatto dei dati di prova.

Accetto il difetto ma non tutta la proposta, con due riserve. Primo: l'header non si corre

### ALTA · riga 1193 · materie-prime
**L'editor della soglia mostra i grammi ma la riga mostra i kg, e non c'e' nessuna unita' di misura nel campo**

- **perché**: Il pulsante dice "0,50 kg". Lo clicchi e nel campo trovi "500". Chi ha appena letto kg scrive "0,5" e conferma: la soglia diventa mezzo grammo e l'avviso di riordino su quell'ingrediente non suonera' mai più, senza un messaggio e senza modo di accorgersene, perche' il pulsante tornera' a mostrare "0,001 kg" in 10,5px.
- **prova**: riga 1198: `setEditSoglia({ nome: r.k, val: r.soglia || '' })` — `r.soglia` e' `soglia_g`, in grammi. Riga 1200 il display e' `fmtG(r.soglia)`, che con unitMode 'kg' (default, riga 579) restituisce "0,50 kg". Riga 1193 l'input non ha né suffisso, né placeholder, né label. Riga 818 `handleSoglia` fa `parseFloat(String(val).replace(',', '.')) || 0` → "0,5" diventa 0.5 grammi.
- **proposta dell'analista**: Mostrare l'unita' accanto al campo e usare la stessa del toggle: se unitMode e' 'kg' precaricare `r.soglia/1000` e moltiplicare per 1000 al salvataggio, con il suffisso "kg" visibile dentro la riga. In più un controllo di sanita': una soglia sotto 1 g su un ingrediente che ne consuma centinaia va confermata ("Sicura? 0,5 g e' mezzo grammo").
- **rischio della correzione**: basso
- **nota del verificatore**: ACCETTATO. Ho provato a smontarlo e non si smonta: ogni anello della catena e' verificabile nel file /Users/aler/foodos/src/views/MagazzinoView.jsx.

VERIFICATO RIGA PER RIGA
- Riga 579: `const [unitMode, setUnitMode] = useState('kg')` — default kg, confermato.
- Riga 1200: `{r.soglia > 0 ? fmtG(r.soglia) : 'Imposta'}` — il display passa da fmtG.
- Righe 870-874: fmtG con unitMode 'kg' fa `(n / 1000)` e stampa " kg". Eseguito davvero: 500 -> "0,500 kg", 0.5 -> "0,001 kg".
- Riga 1198: `setEditSoglia({ nome: r.k, val: r.soglia || '' })` — precarica il grezzo, nessuna divisione.
- Riga 727: `const soglia = m.soglia_g || 0` e riga 751 lo espone come `soglia`. Quindi `r.soglia` E' `soglia_g`, in grammi: forma dati corretta (chiavi minuscole, campo soglia_g). NON e' un artefatto di dati di prova.
- Riga 1193-1195 (stampate integrali): l'input ha solo `type="number"`, `value`, `onChange`, `style`. Zero placeholder, zero aria-label, zero title, zero suffisso. Il div flex contiene solo input + bottone di conferma. Confermato: nessuna unita' da nessuna parte.
- Riga 1137: header `Soglia alert`, tip "Soglia minima sotto la quale scatta l'alert di riordino" — nemmeno l'intestazione o il tooltip dicono l'unita'.
- Riga 818: `soglia_g: parseFloat(String(val).replace(',', '.')) || 0` — salva grezzo, nessuna conversione, nessuna validazione.
- Riga 733: `soglia > 0 && giacenza <= soglia ? 'cr

### ALTA · riga 1193 · materie-prime
**Su tablet e telefono l'editor della soglia e il toggle kg/g sono sotto i 40px, e il campo a 11px fa zoomare iOS**

- **perché**: La soglia si imposta in laboratorio col tablet in mano, spesso con le dita infarinate. Un campo alto 22px e un pulsante di conferma da 24×24 accanto al pulsante Elimina della stessa riga sono un invito a sbagliare cella. E l'input a 11px fa zoomare Safari sul campo appena lo tocchi, spostando la tabella e nascondendo la riga che stavi modificando.
- **prova**: riga 1193-1194: input `width: 70, padding: '4px 6px', fontSize: 11` → circa 22px di altezza, sotto i 16px richiesti da iOS. Riga 1195: pulsante ✓ `padding: '4px 8px', fontSize: 11` → circa 24×24. Riga 1096-1099 toggle kg/g: `padding: '6px 12px', fontSize: 11.5` → circa 28px. Riga 1105 "+ Aggiungi ingrediente": `padding: '8px 16px', fontSize: 12` → circa 34px. Riga 1213 pulsante Elimina: `width: isMobile ? 40 : 30` e `useIsMobile` (useIsMobile.js riga 4) e' true solo sotto 768px → su iPad (768-1023, `useIsTablet`) resta 30×30. Il pannello di aggiunta a righe 1117-1122 e' fatto giusto: `minHeight: 44` e `fontSize: isMobile ? 16 : 13`.
- **proposta dell'analista**: Applicare all'editor soglia lo stesso schema del pannello di aggiunta: `minHeight: 44` e `fontSize: isMobile ? 16 : 13` sull'input, pulsanti da 44px su touch. Per il pulsante Elimina la condizione giusta e' `isMobile || isTablet` (isTablet e' già importata a riga 574), non solo `isMobile`. Toggle e pulsante Aggiungi: 40px su touch, sul desktop possono restare della dimensione del testo.
- **rischio della correzione**: basso
- **nota del verificatore**: ACCETTATO SOLO IN FORMA RIDOTTA (touch target su tablet + pulsante di conferma). Metà delle prove addotte è falsa: va corretta prima di intervenire.

VERIFICATO VERO
- /Users/aler/foodos/src/views/MagazzinoView.jsx:1194 — input soglia: `width: 70, padding: '4px 6px', fontSize: 11`, nessun `minHeight`, nessuna branch responsive.
- riga 1195 — pulsante di conferma: `padding: '4px 8px', fontSize: 11`, ~24x21px, NESSUN `aria-label`.
- righe 1096-1099 (toggle kg/g, ~26-28px) e 1105 (+ Aggiungi ingrediente, ~30-34px): nessuna branch touch.
- riga 1213 — Elimina: `width: isMobile ? 40 : 30`; /Users/aler/foodos/src/lib/useIsMobile.js:4 conferma `breakpoint = 768`, quindi su iPad (768-1023) resta 30x30 mentre `useIsTablet` (riga 17-27) è già importata e calcolata a riga 575 e usata a riga 935. Il gap tablet è reale e la fascia 768-1023 è esattamente il device di laboratorio.
- CLAUDE.md ha una REGOLA PERMANENTE esplicita: "Touch target >= ~40px; font input >= 16px su mobile", valida "anche su mobile e tablet". Quindi non è gusto: è violazione di regola scritta, con il pattern corretto già presente nello stesso file a righe 1117 e 1122 (`minHeight: 44`).

RESPINTO (il difetto non ha cercato fuori dal file)
1. Lo zoom iOS sul telefono NON esiste: /Users/aler/foodos/index.html:64-66 contiene `@media (max-width: 767px) { input, textarea, select { font-size: 16px !important; } }`. Un `!impor

### ALTA · riga 1253 · carica-merce
**Dopo l'OCR il messaggio conta anche gli ingredienti che non ha caricato**

- **perché**: La foto della bolla ha dieci righe, tre con la quantita' illeggibile: il ciclo le salta, il messaggio dice "Caricati 10 ingredienti" e nessuno va a controllare quali tre mancano. E' un numero inventato presentato come misurato, sul dato piu' delicato della scheda. Nel caso limite in cui nessuna quantita' e' leggibile, il messaggio dichiara un carico che non e' avvenuto.
- **prova**: riga 1239 `if (qtaG <= 0) continue` (con `qtaG` gia' 0 quando l'OCR non legge, riga 1237-1238 e prompt FotoOCR.jsx:88 "If quantity unreadable set quantita_g:0"), mentre riga 1253 conta `(res.ingredienti || []).length`, cioe' tutte le righe estratte.
- **proposta dell'analista**: Contare i caricati veri e dire l'altra meta': `notify(newLogs.length ? `Caricati ${newLogs.length} ingredienti${scartati ? `. ${scartati} senza quantita' leggibile, da mettere a mano` : ''}` : 'Nessuna quantita\' leggibile nella foto', newLogs.length > 0)`, e non salvare se `newLogs` e' vuoto.
- **rischio della correzione**: basso
- **nota del verificatore**: Difetto confermato dal codice. MagazzinoView.jsx:1239 salta le righe senza quantita' (`if (qtaG <= 0) continue`), ma riga 1253 notifica `Caricati ${(res.ingredienti || []).length} ingredienti`, cioe' tutte le righe estratte dall'OCR, non quelle effettivamente caricate in `newLogs`. Non e' ipotetico: il prompt FotoOCR.jsx:88 impone esplicitamente `If quantity unreadable set quantita_g:0`, quindi le righe a zero sono un output previsto, e il merge multi-foto (FotoOCR.jsx:194) le preserva sommando `(i.quantita_g || 0)`. Non e' gestito altrove: il preview (FotoOCR.jsx:312) mostra la riga come "0g" ma non avvisa che verra' scartata, e dopo la conferma il toast e' l'unico feedback. L'asimmetria col ramo prezzi accanto (righe 1257-1259: filtra `prezzo_kg > 0`, conta `validi.length`, early return se vuoto) conferma che nel ramo magazzino e' una dimenticanza, non una scelta. Caso limite verificato: con tutte le quantita' illeggibili `newLogs` e' vuoto, i due ssave si eseguono comunque come no-op e il messaggio dichiara un carico mai avvenuto. Forma dati corretta (magazzino con chiavi minuscole da normIng e campi giacenza_g/soglia_g); nessuna assunzione su qty1stampo o ingredienti_costi. La proposta e' sana e rispetta le regole progetto: notify(msg, ok=true) esiste con quella firma (Dashboard.jsx:1474), nessuna emoji, testo breve in italiano umano, conteggi sotto 1000 quindi nessun probl

### ALTA · riga 1283 · carica-merce
**Le etichette dei tre campi del form sono a 10px**

- **perché**: Sono le tre parole che dicono cosa scrivere in quale casella, in maiuscoletto spaziato, che e' il modo piu' faticoso di leggere. A 10px, dietro il banco, con le mani sporche di farina e sessant'anni, non si leggono: si va a memoria sulla posizione. Il commento in testa a questo file (righe 29-41) dice esattamente questo e queste tre sono rimaste indietro.
- **prova**: righe 1283 ("Ingrediente"), 1294 ("Quantita' (g)") e 1301 ("Note (opzionale)") hanno `fontSize: 10` con `textTransform: 'uppercase', letterSpacing: '0.07em'`. Anche i due pulsanti di modo sono sotto soglia: riga 1275 `fontSize: 11` per "Carico merce"/"Scarico / Rettifica" e riga 1277 `fontSize: 11, opacity: 0.7` per i sottotitoli, che sono contenuto e non micro-etichetta.
- **proposta dell'analista**: Portare le tre etichette a 12px e i testi dei pulsanti di modo a 13/12px. Qui non si tocca nessuna colonna di tabella: e' una colonna sola larga 680px, lo spazio c'e'.
- **rischio della correzione**: basso
- **nota del verificatore**: Difetto confermato, citazioni verbatim. Righe 1283/1294/1301 hanno tutte e tre `fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em'` sulle etichette "Ingrediente", "Quantità (g) - {da rimuovere|in arrivo}" e "Note (opzionale)". Righe 1275 e 1277 hanno `fontSize: 11` per il testo dei bottoni di modo e `fontSize: 11, opacity: 0.7` per i sottotitoli. Non è gestito altrove: nello stesso file il form di scarto PF (righe 288 e 294, "Quantità scartata (pz)" e "Motivo (opzionale)") usa il pattern identico ma già a 11, e in tutto il file ci sono 12 micro-etichette maiuscoletto a 11 (209, 288, 294, 403, 432-434, 1018, 1115, 1335) contro solo queste tre a 10: sono stragglers, non una variante voluta. L'alibi del commento in testa (righe 38-41) non copre questo caso perché rinvia i residui solo dove "si tocca la larghezza delle colonne di una tabella a nove colonne", mentre qui la riga 1226 è `<div style={{ maxWidth: 680 }}>`, colonna singola in `flexDirection: 'column', gap: 16` senza tabella. Nessuna forma dati coinvolta (niente giacenza_g/soglia_g, qty1stampo o {costoKg,costoG}): è puramente presentazionale, quindi la trappola dei dati di prova non si applica. Unica correzione alla proposta: il target di 12px per le tre etichette sfora la convenzione della pagina stessa (theme.js:136 `caption: { fontSize: 11 }` e le 12 sorelle in-file a 

### ALTA · riga 1362 · materie-prime
**Il modale di eliminazione mostra un nome diverso da quello della riga: la chiave normalizzata invece del nome scritto dall'utente**

- **perché**: E' l'unica conferma prima di un'operazione dichiarata permanente, e serve a rispondere a una sola domanda: sto cancellando la cosa giusta? La riga dice "Uova", il modale dice "Uovo" (o addirittura la chiave grezza in minuscolo per un ingrediente che sta solo nel ricettario). Chi ha un dubbio annulla; chi non lo nota cancella dopo aver letto un nome che non aveva chiesto.
- **prova**: riga 1362: `{magazzino?.[deleteIngConf]?.nome || deleteIngConf}` — `deleteIngConf` e' impostato a riga 1211 con `r.k`, la chiave CANONICA, mentre `magazzino` e' indicizzato con le chiavi grezze. Con la chiave salvata "uova" e k='uovo' (foodcost.js riga 481) il lookup e' undefined e cade sul fallback, stampando 'uovo'. Il file stesso, righe 670-674, elenca le chiavi non canoniche viste in produzione: "uova, noci, nocciole, mirtilli, mandorle".
- **proposta dell'analista**: Salvare la riga, non la chiave: `setDeleteIngConf(r)` a riga 1211 e nel modale usare `deleteIngConf.nome` (lo stesso `r.nome` che la tabella mostra), passando `deleteIngConf.k` a `handleDeleteIng`. In più mostrare la giacenza che si sta buttando: "Uova — 2,40 kg in giacenza".
- **rischio della correzione**: basso — il fix minimo e' un token a riga 1362, riusando l'aggregazione gia' presente: magPerNorm[deleteIngConf]?.nome || deleteIngConf. magPerNorm e' in scope, e' keyed canonicamente e tiene gia' il nome preferito dell'utente (riga 692). Nessun tocco alla logica di salvataggio (handleDeleteIng continua a ricevere la chiave canonica), nessun cambio di layout, nessuna migrazione dati. La proposta come scritta (setDeleteIngConf(r) con stato a oggetto) sale invece a rischio medio: cambia la forma dello stato e obbliga a toccare tre call site (righe 1367 e 1371 passano deleteIngConf a handleDeleteIng, dovrebbero passare .k) piu' l'aggiunta della riga giacenza nel modale, che tocca il layout. Se si aggiunge la giacenza va usato fmtG (gia' nel file) per rispettare il formato numerico IT, non un formato nuovo.
- **nota del verificatore**: Difetto confermato, riprodotto con la forma dati vera (magazzino a chiavi minuscole, campi giacenza_g/soglia_g). Catena: riga 751 costruisce la riga come { k, nome: m.nome || k } dove k e' la chiave CANONICA (tuttiIngNomi passa tutto da normIng) e nome e' quello scritto dall'utente ripescato da magPerNorm; riga 1211 fa setDeleteIngConf(r.k), cioe' salva la chiave canonica; riga 1362 fa il lookup magazzino?.[deleteIngConf]?.nome, ma magazzino e' indicizzato con le chiavi GREZZE salvate — che e' proprio il motivo per cui esiste magPerNorm (commento righe 663-685, con l'elenco reale uova/noci/nocciole/mirtilli/mandorle). Con chiave salvata "uova" il lookup e' undefined e cade sul fallback, stampando la chiave canonica. Repro con il normIng reale (foodcost.js:522-525, SING_PLUR riga 481): tabella "Uova" vs modale "uovo"; tabella "Latte di cocco" vs modale "cocco disidratato"; tabella "Croissant" vs modale "cornetto". I casi gravi non sono i plurali ma le mappature NON sinonime presenti in SING_PLUR (latte di cocco->cocco disidratato, croissant->cornetto, cioccolato fondente 64%->cioccolato domori): lì l'unica conferma prima di un'operazione dichiarata permanente nomina un ingrediente diverso da quello su cui si e' cliccato. Non e' gestito altrove: gli altri consumatori di deleteIngConf (useEffect ESC 621-627, righe 1367 e 1371) lo trattano come valore opaco. Scartata come falsa una

### MEDIA · riga 876 · materie-prime
**La colonna "Da ordinare" ignora il toggle kg/g: nella stessa riga si leggono "28.000 g" e "~ 1,5 kg"**

- **perché**: Il toggle promette che tutti i pesi della pagina cambiano insieme (lo dice il commento a riga 1094). Se in modalita' grammi la giacenza e' in grammi e la quantita' da ordinare in chili, per capire se l'ordine copre la scorta bisogna convertire a mente, e questo e' proprio il "mix" che il commento di fmtG dichiarava di aver eliminato.
- **prova**: riga 876-880: `fmtRiordino` non legge `unitMode`: `if (g < 1000) return Math.ceil(g/100)*100 + ' g'`, altrimenti kg. Usata a riga 1184 nella colonna "Da ordinare" (e a riga 1023 nella lista di riordino) nella stessa riga in cui riga 1159 usa `fmtG(r.giacenza)`.
- **proposta dell'analista**: Passare `unitMode` anche a `fmtRiordino`: arrotondare agli step pratici come oggi (100 g / 0,5 kg) e poi formattare con `fmtG`, così le due colonne restano nella stessa unita'.
- **rischio della correzione**: basso
- **nota del verificatore**: Difetto confermato dal codice. Righe 876-881: `fmtRiordino = g => { if (!(g > 0)) return null; if (g < 1000) return `${Math.ceil(g/100)*100} g`; const kg = Math.ceil((g/1000)*2)/2; return `${kg.toLocaleString('it-IT',{maximumFractionDigits:1})} kg` }` — non legge mai `unitMode`, mentre `fmtG` (870-874) sì. Le due funzioni compaiono nella stessa `<tr>`: riga 1159 `fmtG(r.giacenza)` e riga 1184 `~ {fmtRiordino(r.riordinoG)}`; identico accoppiamento nella lista di riordino (1031 vs 1036). Il `grep unitMode` restituisce solo 579, 868-872, 1097-1100: non è gestito altrove nel file. L'invariante violata è scritta nel file stesso, quindi non è questione di gusto: riga 1094 «Toggle unità kg / g: tutti i pesi della pagina cambiano insieme» e riga 869 «'g' -> sempre grammi (anche grandi, "28.000 g"). Niente piu mix». La forma dati assunta dal difetto è quella vera: riga 726-727 `m.giacenza_g` / `m.soglia_g` con chiavi minuscole, riga 738-739 `ingCosti[k]?.costoG` / `costoKg` come oggetto, riga 750 `riordinoG = targetG - giacenza` in grammi — stesso dominio di unità della giacenza, quindi il confronto tra le due colonne è un bisogno reale. Il bug sta nella funzione di formattazione, non nei dati, quindi non è un artefatto di dati di prova. Effetto bidirezionale: in modalità g con giacenza_g=28000 e soglia_g=30000 (targetG=45000, riordinoG=17000) la riga mostra "28.000 g" accanto a "~ 17 k

### MEDIA · riga 1126 · materie-prime
**Con zero ingredienti la tabella resta una card con la sola riga di intestazione, senza nessuna spiegazione**

- **perché**: E' la schermata del primo giorno, quella che decide se il cliente capisce da dove si comincia. Nove intestazioni maiuscole a 10px e il vuoto sotto non dicono "aggiungi il primo ingrediente", dicono "e' rotto". Le altre tre schede della stessa pagina questo problema lo hanno già risolto.
- **prova**: righe 1126-1220: nessun controllo su `righe.length === 0`, il `<tbody>` si limita a mappare l'array vuoto. Nella stessa pagina: riga 197 `{stock.length === 0 ? ...}` "Nessun prodotto in stock per questa sede", riga 438-440 "Nessun ingrediente disponibile.", riga 1324-1327 "Nessun rifornimento registrato".
- **proposta dell'analista**: Se `righe.length === 0`, al posto della tabella: "Il magazzino e' vuoto. Aggiungi il primo ingrediente, o carica il ricettario e li trovi già in elenco." con il pulsante che apre il pannello di aggiunta (`setShowAddIng(true)`).
- **rischio della correzione**: basso
- **nota del verificatore**: Difetto confermato leggendo il codice. Riga 1126 apre la card tabella e il tbody (righe 1143-1150) fa solo `sortMag(righe, ...).map(...)`: nessun ramo per `righe.length === 0`, quindi con array vuoto resta la card con il solo thead (9 SortTH + 1 th vuoto, righe 1131-1140). Lo stato e' realmente raggiungibile: `righe` (riga 724) deriva da `tuttiIngNomi` (righe 704-712) = unione ingredienti ricettario + chiavi magPerNorm meno `esclusi`, quindi vuoto per org senza ricette e senza magazzino; Dashboard.jsx:3379 monta la view senza gating sui dati e l'onboarding e' esplicitamente skip-friendly (OnboardingWizard.jsx:4, "Salta tutto" alle righe 302/369). I tre comparatori citati esistono e sono esatti (riga 197-201 stock PF, righe 438-441 con `colSpan={3}`, righe 1324-1327 log rifornimenti): tre schede su quattro nello stesso file gestiscono il vuoto, le giacenze no. Nessun errore di forma dati: `righe` e' un array locale costruito nel file e magPerNorm legge giacenza_g/soglia_g da chiavi minuscole normalizzate (righe 686-701); il difetto non assume `quantita`/`g` ne costi come numeri nudi. Aggravante extra non citata: a zero righe la banda diagnosi (righe 884-893) cade nel ramo 'ok' e scrive "Scorte in equilibrio - Le giacenze coprono il fabbisogno previsto", falso con zero ingredienti. Attenuante: il CTA "+ Aggiungi ingrediente" e' gia' visibile sopra la tabella (riga 1105), quindi m

### MEDIA · riga 1132 · materie-prime
**L'header e' allineato a destra e i numeri sotto sono centrati: sei colonne su nove non sono incolonnate**

- **perché**: Su una tabella a nove colonne l'occhio scende lungo la colonna. Se "GIACENZA" e' a destra e i valori sono al centro, ogni numero e' spostato di venti pixel rispetto alla sua intestazione, e i numeri fra loro non sono incolonnati (2,40 kg e 28,00 kg centrati hanno la virgola in due posti diversi). E' anche uno spreco del `tabular-nums` che il codice imposta riga per riga proprio per allineare le cifre.
- **prova**: header a destra: righe 1132 (giacenza), 1133 (fabb), 1134 (giorniScorta), 1137 (soglia), 1139 (ultimoRif) con `right`; riga 1138 (stato) a sinistra. Celle corrispondenti tutte `textAlign: 'center'`: 1157, 1167, 1168, 1190, 1204, 1207. Le due colonne fatte bene sono Valore (header 1135 right, cella 1172 right) e Da ordinare (1136 / 1181).
- **proposta dell'analista**: Le colonne numeriche (Giacenza, Fabb. sett., Giorni scorta, Soglia) a destra sia nell'header sia nella cella; Stato e Ultimo riforn. a sinistra in entrambi. Un solo posto in cui decidere l'allineamento: un array di definizione delle colonne condiviso da `<thead>` e `<tbody>`, invece di nove `SortTH` e dieci `<td>` da tenere d'accordo a mano.
- **rischio della correzione**: basso
- **nota del verificatore**: ACCETTATO - difetto verificato riga per riga, nessuna riga smentita.

VERIFICA DEL CODICE. `SortTH` (/Users/aler/foodos/src/views/_shared.jsx:442) fa esattamente `textAlign: right ? 'right' : 'left'`, quindi il prop `right` negli header significa davvero allineamento a destra. Confronto header/cella nella tabella materie-prime di /Users/aler/foodos/src/views/MagazzinoView.jsx: Giacenza header 1132 `right` vs cella 1157 `center`; Fabb. sett. 1133 `right` vs 1167 `center`; Giorni scorta 1134 `right` vs 1168 `center`; Soglia alert 1137 `right` vs 1190 `center`; Stato 1138 (sinistra) vs 1204 `center`; Ultimo riforn. 1139 `right` vs 1207 `center`. Le uniche due coerenti sono Valore (1135 right / 1172 right) e Da ordinare (1136 right / 1181 right). Sei colonne su nove disallineate: il conteggio del difetto e' corretto.

NON E' UN ARTEFATTO DI DATI. Il difetto e' CSS statico nel JSX, non dipende da alcun valore di riga. Ho comunque controllato la costruzione di `righe` (righe 724-751): legge `m.giacenza_g`, `m.soglia_g` e `ingCosti[k]?.costoG` / `costoKg` come oggetti, cioe' esattamente le forme dati vere. Nessun campo inventato tipo "quantita" o numeri nudi.

NON E' GIA' GESTITO ALTROVE. /Users/aler/foodos/src/styles/global.css non ha nessuna regola `text-align` ne selettori th/td: non esiste override globale che salvi la situazione.

NON E' GUSTO. La prova decisiva e' nello stesso f

### MEDIA · riga 1152 · materie-prime
**Tutta la cella del nome e' cliccabile e cambia scheda; l'unico indizio e' una freccia a 11px con opacita' 0,4 e un tooltip che dice "precompila form"**

- **perché**: Su tablet non esiste il passaggio del mouse: quel tooltip non lo leggera' nessuno, e toccare il nome per scorrere la lista o per leggerlo meglio porta l'utente su un'altra scheda con il campo già compilato — sembra un errore dell'app. "Form" poi e' una parola da software: nella pagina si chiama "Carica merce". E la cella non e' un pulsante, quindi da tastiera non e' raggiungibile.
- **prova**: riga 1152-1155: `<td ... cursor: 'pointer'` con `title="Clic rapido → precompila form"` e `onClick={() => { setQuickLoad(r.k); setFormIng(r.nome); setTab('carica'); focusQtyDeferred() }}`; l'affordance e' `<span style={{ fontSize: 11, opacity: 0.4 }}>↗</span>`. Nessun `role`, `tabIndex` o gestione tastiera (il `SortTH` di _shared.jsx riga 427-436 invece li ha tutti).
- **proposta dell'analista**: Un vero pulsante visibile in fondo alla riga, con l'icona e la parola: `<Icon name="plus" /> Carica`, esattamente come quello della lista di riordino a righe 1042-1045 di questa stessa pagina. La cella del nome torna testo selezionabile, e l'azione diventa raggiungibile anche da tastiera.
- **rischio della correzione**: medio
- **nota del verificatore**: Il difetto regge, e il codice dice esattamente quello che l'accusa sostiene. Verificato in /Users/aler/foodos/src/views/MagazzinoView.jsx:

- riga 1152: `<td style={{ padding: '10px 14px', fontWeight: 600, ..., cursor: 'pointer' }}` — tutta la cella del nome, non un elemento interattivo.
- riga 1153: `title="Clic rapido → precompila form"` — unica occorrenza in tutto src/ (grep). "form" non compare da nessuna parte nella UI: la scheda di destinazione si chiama "Carica merce" (riga 1074 e SectHead a riga 1223). Quindi è gergo da software in una pagina che quella cosa la chiama con un altro nome.
- riga 1154: `onClick={() => { setQuickLoad(r.k); setFormIng(r.nome); setTab('carica'); focusQtyDeferred() }}` — cambia scheda e sposta il focus.
- riga 1155: l'unica affordance visiva è `<span style={{ fontSize: 11, opacity: 0.4 }}>↗</span>`.
- nessun `role`, `tabIndex`, `onKeyDown` sul `<td>`: da tastiera l'azione non esiste.

Non è gusto, per tre motivi verificabili:

1. Il progetto ha già stabilito il contrario a mano sua. In /Users/aler/foodos/src/views/_shared.jsx:425-436 c'è `SortTH` con `role="button"`, `tabIndex={0}`, `aria-sort` e `onKeyDown` su Enter/Space, precedute dal commento `// Audit 2026-07-01 LOW: a11y keyboard. role=button + tabIndex + Enter/Space.` Stessa pagina, stessa tabella, stessa classe di problema: là è stata sistemata, qui no.

2. Il tooltip su tablet è irrag

### MEDIA · riga 1195 · materie-prime
**Nel corpo della tabella si usano i caratteri ✓ ✕ ↗ invece del componente Icon**

- **perché**: E' la regola del progetto: mai glifi decorativi, si usa Icon (SVG). Non e' solo coerenza visiva — questi caratteri cambiano forma e peso da un dispositivo all'altro (su alcuni Android/iOS il ✓ viene reso come glifo colorato) e uno screen reader legge "segno di spunta" su un pulsante il cui unico scopo e' salvare la soglia. Nella stessa riga il pulsante Elimina, fatto giusto, usa `<Icon name="trash" />` con `aria-label`.
- **prova**: riga 1195: `>✓</button>` (conferma soglia, nessun aria-label). Riga 1122: `>✕</button>` (chiude il pannello di aggiunta). Riga 1155: `↗` nella cella del nome. Fuori dalla tabella la stessa abitudine: riga 645 `notify('✓ Ingrediente eliminato dal sistema')`, riga 852 `notify('✓ ' + newIngNome + ' aggiunto al magazzino')`, riga 1105 il "+" testuale di "+ Aggiungi ingrediente" (mentre riga 1044 usa `<Icon name="plus" size={12} />`).
- **proposta dell'analista**: `<Icon name="check" size={14} />` con `aria-label="Salva soglia"` sul pulsante di conferma, `<Icon name="x" />` sulla chiusura, `<Icon name="plus" />` su "Aggiungi ingrediente". La freccia ↗ sparisce insieme alla cella cliccabile. Nei notify il ✓ va togliuto e basta: "Burro aggiunto al magazzino" e' già una conferma.
- **rischio della correzione**: medio
- **nota del verificatore**: ACCETTATO. Verificato byte per byte: riga 1195 e' davvero `>✓</button>` (E2 9C 93 = U+2713) senza aria-label ne title, quindi l'unico nome accessibile del pulsante e' il glifo, mentre il pulsante Elimina nella STESSA <tr> (riga 1213) ha `aria-label="Elimina ingrediente"` + `<Icon name="trash" />`: l'incoerenza e' dimostrata dentro la stessa riga. Confermati anche ✕ a riga 1122 (U+2715, ma quello ha gia' aria-label="Chiudi", quindi li vale solo la parte glifo-vs-Icon), ↗ a riga 1155 (U+2197) e il "+" testuale a riga 1105 contro `<Icon name="plus" size={12} />` a riga 1044. Icon.jsx espone gia' check, x, plus, arrowR: la proposta e' applicabile senza aggiungere asset. Non e' gusto: ANALISI_PRODOTTO.md:30 documenta una pulizia passata ("rimosse 15+ emoji ✓/✕/⚠ residue dai notify()") e questi sono i residui sopravvissuti — grep li trova ancora vive alle righe 161, 659, 810, 852. Nessun assunto sbagliato sulla forma dati: handleSoglia (815-827) scrive soglia_g su chiave minuscola r.k, coerente. Inesattezze minori non fatali: la riga citata 645 e' un commento (il notify sta alla 659); i notify con ✓ sono 4 e non 2 (sottostima, non gonfiaggio); e la motivazione "su Android il ✓ arriva come glifo colorato" e' tecnicamente falsa per U+2713 e U+2715 (non sono Unicode Emoji, non hanno presentazione emoji) e vale solo per ↗ U+2197 — resta valido l'argomento su forma/peso/baseline dipendent

### MEDIA · riga 1263 · carica-merce
**L'import prezzi da foto va in errore silenzioso se il prezzo arriva come stringa**

- **perché**: Il pasticcere vede l'anteprima con i prezzi giusti, tocca conferma e non succede niente: nessun messaggio, nessun prezzo salvato, la foto sparisce. Non ha modo di capire che deve rifarla, e il food cost resta calcolato sulle stime HORECA.
- **prova**: riga 1258 `filter(i => i.prezzo_kg > 0)` passa anche la stringa "12.50" per coercizione, poi riga 1263 chiama `i.prezzo_kg.toFixed(4)` → TypeError dentro una `onResult` async, quindi promise rifiutata e nessun notify. Che il valore non sia garantito numerico lo dicono gli altri due punti dello stesso flusso: righe 1237-1238 `const qg = Number(ing.quantita_g); Number.isFinite(qg) ? ...` con commento sul guard NaN, e FotoOCR.jsx:322 che avvolge in `Number(ing.prezzo_kg)` per l'anteprima.
- **proposta dell'analista**: Normalizzare in ingresso: `const pk = Number(String(i.prezzo_kg).replace(',', '.')); if (!Number.isFinite(pk) || pk <= 0) continue`, e avvolgere il corpo dell'handler in try/catch con notify in errore.
- **rischio della correzione**: basso
- **nota del verificatore**: ACCETTATO. Il codice dice esattamente quello che il difetto sostiene.

VERIFICA DEL CODICE (/Users/aler/foodos/src/views/MagazzinoView.jsx:1258-1263):
  const validi = ing_list.filter(i => i.prezzo_kg > 0)
  nuoviCosti[k] = { costoKg: parseFloat(i.prezzo_kg.toFixed(4)), costoG: parseFloat((i.prezzo_kg / 1000).toFixed(6)), isStima: false }
Nessun Number(), nessun try/catch. Riprodotto in node: "12.50" > 0 e' true (coercizione), poi .toFixed → TypeError: i.prezzo_kg.toFixed is not a function. Anche "12" crasha. Invece "12,50" e "€ 12.50" vengono filtrati via (NaN > 0 = false).

LA SILENZIOSITA' E' CONFERMATA, con causa a monte (/Users/aler/foodos/src/components/FotoOCR.jsx:311-316):
  const handleConferma = () => { if (!parsed) return; onResult(parsed); setImg(null); setPreview(null); setParsed(null); ... }
onResult e' async ma non e' awaited e non ha .catch → unhandled rejection. In produzione finisce solo in Sentry (/Users/aler/foodos/src/main.jsx:103-111: il dump in pagina e' dentro `if (import.meta.env.DEV)`). Lo stato viene azzerato comunque, quindi la foto e l'anteprima sparispono senza nessun notify e senza prezzi salvati. Scenario utente descritto = scenario reale.

PERCHE' NON E' UN ARTEFATTO DI DATI DI PROVA:
- La forma scritta e' quella vera: ingredienti_costi con oggetti {costoKg, costoG, isStima}, non numeri nudi. Il difetto non assume forme sbagliate (non parla di m

### MEDIA · riga 1345 · materie-prime
**Il modale non dice la cosa che conta: l'ingrediente resta nelle ricette ma esce per sempre dal magazzino**

- **perché**: "Questa azione e' permanente" non spiega cosa diventa permanente. L'eliminazione aggiunge la chiave agli esclusi, quindi se l'ingrediente e' usato in una ricetta continuera' a pesare sul food cost ma non avra' più giacenza, né soglia, né avviso di riordino, e non ricomparira' in elenco. Il pasticcere si aspetta "lo togli dalla lista", non "smetti di controllarlo".
- **prova**: riga 1345 `Stai per eliminare ... dal magazzino.` e riga 1347 `Questa azione è permanente.`. `handleDeleteIng` righe 628-642: cancella tutte le chiavi grezze E fa `nuoviEsclusi.add(k)` + `ssave(SK_EXCL, ...)`; a riga 707 `tuttiIngNomi` filtra `.filter(k => !esclusi.has(k))`, quindi la riga non torna nemmeno se una ricetta la usa.
- **proposta dell'analista**: Frase concreta al posto di "permanente": "Sparisce dall'elenco e non riceverai più avvisi di riordino. Se una ricetta lo usa, continuera' a essere calcolato nel costo." E se l'ingrediente e' in una ricetta, dirlo per nome: "Usato in 3 ricette (Sacher, Millefoglie, Bignè)".
- **rischio della correzione**: basso
- **nota del verificatore**: ACCETTATO, ma con due correzioni al difetto come e' stato scritto.

Cosa ho verificato riga per riga in /Users/aler/foodos/src/views/MagazzinoView.jsx:

1) La riga citata e' sbagliata: 1345 e' una cella della tabella del log rifornimenti (`{r.note || '-'}`). Il testo esiste davvero ma a riga 1362 (`Stai per eliminare ... dal magazzino.`) e 1364 (`Questa azione è permanente.`). Drift di ~17 righe, non un errore di sostanza: le due frasi sono verbatim quelle sostenute.

2) La catena tecnica regge, tutta:
- `handleDeleteIng` (righe 630-660) cancella ogni chiave raw che normalizza su `k` (`if (raw === k || normIng(raw) === k) delete nm[raw]`), poi `nuoviEsclusi.add(k)` e `await ssave(SK_EXCL, [...nuoviEsclusi])`. Quindi si perdono giacenza_g, soglia_g e ultimoRifornimento della voce.
- `tuttiIngNomi` (righe 705-712) costruisce l'elenco da ricette + magazzino e chiude con `.filter(k => !esclusi.has(k))`. Confermato: la riga non torna da sola nemmeno se una ricetta usa quell'ingrediente, quindi niente soglia e niente comparsa nella lista di riordino.
- Il food cost continua a contarlo: `esclusi`/`SK_EXCL` non compaiono da nessuna parte in src/lib (grep su tutto src: solo Dashboard.jsx e MagazzinoView.jsx). src/lib/foodcost.js non legge ne' `magazzino` ne' `giacenza` (grep: zero hit) e calcola su `ing.qty1stampo` x prezzo da `ricettario.ingredienti_costi`, che `handleDeleteIng` non to


---

## RIFIUTATI (4) — NON correggere, gli scettici li hanno smontati

- **riga 836** (materie-prime) — Il pannello di aggiunta legge le quantita' con parseFloat senza la virgola: "1,5" diventa 1
  - motivo del rifiuto: RIFIUTATO: la riga 836 e' come descritta (parseFloat(newIngQty) senza replace), ma il meccanismo di guasto non regge. La stessa riga 1116 citata come prova rende il campo con type={type || 'text'} e le righe 1112-1113 passano type:'number' per Giacenza e Soglia: inputMode="decimal" viene impostato SOLO insieme a type="number". Per un input type=number l'algoritmo di sanitizzazione HTML forza .value a '' quando il contenuto non e' un floating-point valido, e la virgola non lo e' mai: Chrome/Safari/iOS restituiscono '', Firefox localizza e restituisce '1.5'. Quindi newIngQty non puo' contenere '1,5' e l'esito sostenuto ("1 g in giacenza") e' irraggiungibile. Verificati gli unici writer dello s

- **riga 870** (materie-prime) — Il toggle kg su quantita' piccole: la vaniglia da 120 g si legge "0,120 kg", e sotto il grammo diventa "0,000 kg"
  - motivo del rifiuto: Rifiutato. Il codice alle righe 870-874 dice quello che il report sostiene e la forma dati è corretta (giacenza_g/soglia_g), ma il difetto cade su tre punti. (1) È già gestito: alle righe 1093-1102 c'è un toggle kg/g visibile all'utente; in modalità 'g' la riga 872 stampa già "120 g", cioè esattamente ciò che la proposta chiede. Il comportamento kg è una decisione documentata al commento 868-869 ("Niente piu mix") e il default 'kg' è motivato alla riga 578 per farine e latte. (2) Il "caso peggiore" non regge e la proposta non lo corregge: lo stato alla riga 732 è `giacenza === 0 ? 'esaurito'`, quindi 0,4 g non è "Esaurito", ma anche in modalità 'g' `Math.round(0.4)` stampa "0 g", e la propos

- **riga 872** (materie-prime) — Numeri fra 1.000 e 9.999 senza il punto delle migliaia: "1500 g" nella colonna Giacenza, "5000 gg" in Giorni scorta
  - motivo del rifiuto: RIFIUTATO: la prova centrale non regge, perché è stata raccolta fuori dall'app.

1) La riga 872 dice davvero `${Math.round(n).toLocaleString('it-IT')} g`, senza opzioni. Fin qui la citazione è corretta. Ma nell'app quella chiamata non è quella di Node nudo: /Users/aler/foodos/src/lib/numberFormatPatch.js sostituisce `Number.prototype.toLocaleString` e, quando la locale è `it`/`it-IT` e `options.useGrouping` è `undefined`, riinoltra la chiamata con `{ useGrouping: 'always' }`. La patch è il primo import di /Users/aler/foodos/src/main.jsx (riga 3, prima di React e di ogni view) e il suo commento dichiara lo scopo esatto: "per evitare di toccare 200+ call site nel codebase". Quindi `fmtG` in un

- **riga 1265** (carica-merce) — I prezzi da foto si dichiarano aggiornati prima che il salvataggio sia finito
  - motivo del rifiuto: RIFIUTATO. La riga 1265 e' come descritta (`if (onImportPrezziOCR) onImportPrezziOCR(nuoviCosti)` senza await, notify subito dopo), ma la conseguenza sostenuta non si verifica e la proposta e' una regressione netta.

1) Il danno narrato non accade. Il parent /Users/aler/foodos/src/Dashboard.jsx:1728-1735 implementa GIA' il save-first, intercetta lui il reject di ssave e chiama `notify('Errore salvataggio prezzi: ...', false)`. E `notify` (Dashboard.jsx:1474-1478) e' a slot singolo: `if (notifyTimerRef.current) clearTimeout(...); setToast({msg,ok})` — il toast nuovo SOSTITUISCE il precedente. Quindi con la rete che cade la sequenza reale e': flash "12 prezzi aggiornati" -> sostituito da "Erro


---

## NON VERIFICATI (84) — sostenuti da un agente, mai messi in dubbio


### Prodotti finiti — 19 da verificare

- **media** · riga `268` · colore — La lista movimenti è tutta rossa in una giornata normale
  - Vendere e spedire fanno scendere lo stock: il delta negativo è la normalità, non un problema. Così il pasticcere apre i movimenti e vede venti righe rosse ogni giorno. Un allarme che suona sempre insegna a spegnere gli allarmi, e il giorno che c'è davvero un ammanco quella riga rossa non la guarda n
  - proposta: Delta in grigio scuro col segno (-20, +40), rosso solo quando quel movimento porta la giacenza sotto zero. "Inviato" in blu o grigio come "Vendita": è un fatto normale, non un guasto.

- **media** · riga `205` · mobile — Su telefono la tabella dello stock si schiaccia invece di scorrere
  - Il contenitore ha lo scroll orizzontale ma la tabella non supera mai la sua larghezza, quindi non scorre: le cinque colonne si comprimono, la data va a capo e i due pulsanti si accavallano. Dietro il banco, col telefono in mano, la riga diventa illeggibile.
  - proposta: Aggiungere `minWidth: 580` alla table di riga 205, come già fatto nelle altre tre tabelle del file.

- **media** · riga `255` · mobile — La tabella dei movimenti è dentro overflow hidden: non scorre e taglia le note
  - Cinque colonne, di cui una è una nota scritta a mano libera, in un contenitore che non scorre e che taglia. Su tablet la colonna della nota si riduce a due parole: il motivo dello scarto, cioè l'unica informazione utile di quella riga, non si legge.
  - proposta: Wrapper esterno col bordo e il raggio, dentro un div con `overflowX: 'auto'` e la table a `minWidth: 620`. La nota va a capo su due righe, non tagliata.

- **media** · riga `238` · mobile — "Azzera" è alto 23px e sta a 4px da "Scarto": si sbaglia col dito
  - Il pulsante che porta a zero la giacenza è il più piccolo della riga e sta appiccicato all'altro. Sul tablet in laboratorio, con le mani unte, si centra per sbaglio. È l'unico pulsante distruttivo della scheda e non ha nessuna conferma dedicata: il modale che si apre è lo stesso dello scarto, con la
  - proposta: Su mobile e tablet i due pulsanti a piena larghezza, uno sotto l'altro, `minHeight: 44` e gap 8. Il modale aperto da "Azzera" deve avere titolo suo ("Porta a zero la giacenza") e dire quanto sta azzerando.

- **media** · riga `263` · tipografia — Data e note dei movimenti a 10px
  - Dieci pixel non è testo piccolo, è testo che nessuno leggerà: lo dice il commento in cima a questo stesso file. E qui sotto i 12px non ci sono micro-etichette in maiuscoletto, ma il contenuto: quando è avvenuto il movimento e perché.
  - proposta: Data, causale e nota a 12, nome prodotto a 13. Se la larghezza non basta, sacrificare la colonna della nota mandandola a capo sotto il nome, non rimpicciolire il testo.

- **media** · riga `236` · correttezza — "Azzera" registra una correzione tecnica come spreco vero
  - L'azzeramento serve a cancellare un dato sbagliato, non a dire che il prodotto è stato buttato. Ma finisce a DB con causale scarto, quindi gonfia le perdite: il pasticcere pulisce una giacenza fantasma e si vede peggiorare i numeri degli sprechi. E la nota precompilata è gergo informatico, non itali
  - proposta: Aggiungere una `rettificaPF` che scrive causale 'rettifica' e usarla per l'azzeramento; nota di default "Correzione della giacenza". Il conto degli sprechi deve contenere solo roba buttata per davvero.

- **media** · riga `172` · struttura — Ogni ricarica cancella la schermata e mostra "Caricamento…", anche quando non serve
  - Il pasticcere sta guardando la tabella e questa sparisce da sotto gli occhi, sostituita da una scritta grigia, per poi tornare. Succede dopo ogni scarto e anche senza che lui tocchi niente: basta che l'app mostri un avviso qualsiasi. Perde il punto in cui era, e sul telefono perde anche la posizione
  - proposta: Tenere `notify` in una useRef dentro il componente (o avvolgerlo in useCallback in Dashboard) e togliere la dipendenza da `carica`. Distinguere primo caricamento da aggiornamento: al refresh lasciare la tabella a schermo con un piccolo "aggiorno…" nell'intestazione.

- **media** · riga `228` · correttezza — Date senza anno: una giacenza vecchia di un anno sembra aggiornata oggi
  - La colonna "Aggiornato" serve esattamente a capire se un numero è ancora vero. Scritta senza anno, una riga ferma dal settembre scorso mostra "07/09, 14:32", identica a una di stamattina: la giacenza fantasma diventa invisibile proprio nella colonna che dovrebbe smascherarla.
  - proposta: Formato relativo quando è vicino ("oggi 14:32", "ieri 18:05", "3 giorni fa") e data completa con l'anno oltre la settimana. In grigio se è più vecchia di 7 giorni, così si vede a occhio quale riga non è stata toccata.

- **media** · riga `251` · struttura — Nessun movimento: la sezione sparisce senza dire niente, e i movimenti sono tagliati a 30 senza avvisare
  - Chi cerca lo scarto registrato lunedì e non lo trova pensa di non averlo registrato, e lo registra di nuovo. Il taglio ai 30 più recenti non è scritto da nessuna parte e non c'è modo di vedere oltre. Se poi i movimenti sono zero, al posto della sezione c'è il vuoto: non si capisce se non è mai succe
  - proposta: Sezione sempre presente. A zero movimenti: "Ancora nessun movimento in questa sede." Nel sottotitolo scrivere "ultimi 30 movimenti" e mettere un pulsante "Mostra i precedenti" che alza il limite.

- **media** · riga `282` · accessibilita — Il modale scarto non si chiude con Esc, si chiude toccando fuori anche mentre salva, e non mette il cursore nel campo
  - Il tocco fuori dal riquadro butta via quello che è stato scritto senza chiedere niente, e se capita durante il salvataggio il modale scompare mentre la scrittura va avanti: il pasticcere crede di aver annullato e invece lo scarto è passato, così lo registra di nuovo. Chi lavora da tastiera non ha Es
  - proposta: autoFocus sul campo quantità; Escape che chiude; backdrop inerte quando `saving` è true; `role="dialog" aria-modal="true"` con aria-label "Registra scarto".

- **media** · riga `269` · tipografia — Il delta dei movimenti è un numero grezzo, senza punto delle migliaia e senza unità
  - Un trasferimento di ottomila grammi si legge "+8000", che a colpo d'occhio si confonde con 800. E senza unità non si sa se sono pezzi o grammi: nella tabella sopra l'unità c'è (riga 222), qui è scomparsa. Sono due numeri della stessa scheda scritti con due regole diverse.
  - proposta: `{d > 0 ? '+' : ''}{d.toLocaleString('it-IT')}` e aggiungere `unita` al select di loadMovimentiPF per stampare "+8.000 g".

- **media** · riga `191` · correttezza — "Prodotti in stock" conta anche le righe a zero
  - È il primo numero che il proprietario legge entrando. La sera, con la vetrina svuotata e tutte le righe a zero, dice ancora "12 prodotti in stock". Un KPI che non cambia mai non è un'informazione.
  - proposta: Contare solo `stock.filter(r => Number(r.quantita) > 0).length`, con sub "su 12 prodotti censiti" per non perdere l'altro dato.

- **bassa** · riga `184` · tipografia — Freccia testuale al posto dell'Icon nell'etichetta "Annullo"
  - Tutte le altre sei causali usano il componente Icon; questa infila un glifo dentro la stringa. Su Windows e su Android quel carattere si rende in modo diverso, a volte come emoji colorata, a volte come quadratino. Ed è l'unica riga della legenda senza icona, quindi l'incolonnamento della colonna cau
  - proposta: `annullo_trasferimento: { lbl: 'Annullo', ic: 'undo', col: '#94A3B8' }` (o l'icona equivalente già presente in components/Icon), e toglere il glifo dal testo del toast.

- **bassa** · riga `201` · copy — Lo stato vuoto spiega solo metà di come si popola lo stock, e lo dice da software
  - "Lo stock si popola automaticamente" non è come parla una pasticcera: si popola è roba da programmatori. E la frase è anche incompleta, perché i prodotti arrivano pure dalle spedizioni tra sedi: chi aspetta la merce dall'altro punto vendita legge questa frase e va a cercare l'errore nella produzione
  - proposta: "Qui non c'è ancora niente. I prodotti compaiono quando chiudi una produzione o quando ricevi una spedizione da un'altra sede."

- **bassa** · riga `194` · copy — Il sottotitolo dello stock negativo usa la notazione matematica "vendite > carico"
  - Il maggiore matematico non si legge a colpo d'occhio dietro un banco, e comunque non dice cosa fare. Quel KPI è rosso, quindi è il momento in cui la frase deve spiegare il problema in italiano.
  - proposta: "Hai venduto più di quello che risulta caricato: controlla la produzione di questi prodotti."

- **bassa** · riga `231` · copy — Il pulsante "Scarto" disabilitato non dice perché
  - Chi ha buttato via merce che il sistema non vede (giacenza a zero perché il carico non è mai stato registrato) trova il pulsante spento, ci clicca due o tre volte e non capisce. Il pulsante accanto ha un title, questo no.
  - proposta: `title="Giacenza a zero: non c'è niente da scartare"` e, se serve poterlo fare comunque, lasciarlo attivo avvisando che la giacenza andrà sotto zero.

- **bassa** · riga `165` · copy — I messaggi d'errore arrivano in inglese tecnico
  - Se salta la rete mentre registra lo scarto, il pasticcere legge "Errore: Failed to fetch". Non capisce se lo scarto è passato o no, e non sa cosa fare. Esiste già l'helper che traduce, e qui non viene usato.
  - proposta: `notify(friendlyErrorMessage(e), false)` con fallback "Non sono riuscito a registrare lo scarto. Controlla la connessione e riprova: lo stock non è stato toccato."

- **bassa** · riga `284` · struttura — Il modale non dice quanto vale lo scarto, pur avendo già il dato in mano
  - È l'unico momento in cui il pasticcere si ferma a pensare a quello che sta buttando. Vedere "stai buttando circa 34 €" cambia il comportamento; vedere solo un numero di pezzi no. Il costo unitario è già stato letto dal database e non viene usato da nessuna parte.
  - proposta: Portare `valore_unit` nello scartoForm e sotto il campo quantità scrivere il valore aggiornato mentre si digita: "Valore di quello che scarti: 34 €" (simbolo dopo la cifra).

- **bassa** · riga `147` · struttura — Funzione di focus morta dentro il componente: punta a un campo di un'altra scheda
  - Tredici righe che non fanno niente, con un timer e un cleanup, in un componente che si legge già male. Chi domani cerca di capire perché il cursore non finisce nel campo quantità del modale trova questa funzione, crede che il problema sia qui, e perde tempo.
  - proposta: Cancellare le righe 142-153 (funzione, ref e useEffect di cleanup) e mettere `autoFocus` sull'input di riga 289, che è il comportamento che quella funzione voleva ottenere.


### Materie prime — 5 da verificare

- **alta** · riga `597` · correttezza — L'ordinamento di default mette gli ingredienti OK in cima e gli esauriti in fondo
  - E' la prima schermata del magazzino. Con 100 ingredienti il pasticcere apre la scheda, vede le prime venti righe verdi "OK" e deve scorrere fino in fondo per trovare il burro finito. La colonna Stato esiste proprio per portare in cima quello che ferma la produzione, e fa l'opposto.
  - proposta: `useSortable('stato', 'asc')`, oppure invertire la mappa (`{ esaurito: 3, critico: 2, attenzione: 1, ok: 0 }`) lasciando 'desc'. La freccia ▼ accanto a "Stato" deve corrispondere a "prima i problemi".

- **alta** · riga `1144` · struttura — Con 100 ingredienti la tabella rende 100 righe: nessuna ricerca e nessuna paginazione, mentre la scheda Prezzi ha entrambe
  - E' la tabella piu' pesante delle cinque: 10 colonne per riga, un pulsante soglia, un pulsante elimina, una barra di avanzamento. Per trovare "vaniglia" in un ricettario da 200 voci l'unica strada e' Ctrl+F del browser, che su tablet dietro il banco non esiste. E il commento della scheda accanto dice
  - proposta: Portare lo stesso schema della scheda Prezzi: campo "Cerca ingrediente" sopra la tabella (che bypassa il limite) + `maxVisible` 80 con il piede "Mostrati 80 di 214" e "Mostra altri 80" già scritto alle righe 487-505.

- **alta** · riga `725` · colore — Un ingrediente mai inventariato viene mostrato ESAURITO in rosso e conteggiato tra quelli a zero
  - Un cliente nuovo carica il ricettario e apre Materie prime: tutte le righe rosse "ESAURITO", la banda rossa "Ingredienti finiti", il KPI "A zero: 35" e una lista di riordino di tutto il magazzino. Non e' vero: quella roba c'e', non e' ancora stata contata. Un allarme che suona alla prima apertura in
  - proposta: Distinguere "contato e a zero" da "mai contato": la stessa riga ha già il dato (`m.ultimoRifornimento` undefined → colonna Ultimo riforn. mostra "-"). Aggiungere uno stato 'mai_contato' grigio con etichetta "Da contare", escluso da `esauriti`, dalla banda rossa e dalla lista di riordino.

- **alta** · riga `1133` · correttezza — "Fabb. sett." e "Giorni scorta" usano le ultime 7 SESSIONI, non gli ultimi 7 giorni: il tooltip dell'header dice il falso
  - La pasticceria chiude tre settimane ad agosto. Al rientro la pagina prende le ultime 7 giornate di produzione (luglio), le divide per 7 come se fossero una settimana e annuncia "2 gg di scorta" in rosso, con una lista di riordino e una spesa stimata. Il numero e' inventato ma e' presentato come misu
  - proposta: Filtrare per data reale: `.filter(s => s.data >= dataMenoGiorni(todayLocal(), 7))` e dividere per i giorni effettivamente coperti, non per 7 fisso. Se le sessioni nella finestra sono zero, colonna "-" e stato senza copertura (come già fa `giorniScorta === null`). Il tooltip va riscritto solo dopo ch

- **alta** · riga `1057` · struttura — Al dipendente e' nascosta la scheda "Prezzi ingredienti" ma la colonna Valore gli mostra ogni €/kg e il valore totale del magazzino
  - Se si e' deciso che un dipendente non deve vedere i costi d'acquisto, nasconderli in una scheda e stamparli nella scheda che apre per prima non protegge niente: e' la stessa informazione, riga per riga, più il totale in cima. E fa sembrare che il permesso funzioni.
  - proposta: Se `isDipendente`, non rendere la colonna Valore (né il suo SortTH a riga 1135) e sostituire il KPI "Valore a magazzino" con qualcosa di utile a lui, per esempio "Ingredienti da contare". Stessa decisione anche per il pulsante Elimina di riga 1211, che oggi un dipendente puo' usare su ogni ingredien


### Carica merce — 10 da verificare

- **media** · riga `1248` · copy — Il messaggio d'errore dell'OCR dice "Riprova" ma i dati letti sono gia' stati buttati
  - Non c'e' nulla da riprovare: nel momento in cui compare quel messaggio la foto e l'elenco riconosciuto non ci sono piu', quindi bisogna rifare la foto della bolla. Un messaggio che chiede un gesto impossibile fa perdere fiducia in tutto il resto dei messaggi.
  - proposta: In FotoOCR: `await onResult(parsed)` e azzerare preview/parsed solo se non ha lanciato. Cosi' "Riprova" torna vero, e il pulsante conferma resta li' con i dati dentro.

- **media** · riga `811` · correttezza — Il modo carico/scarico resta impostato dopo il salvataggio e il clic rapido non lo resetta
  - Il caso reale: la sera si scarica quello che si e' consumato, la mattina arriva il fornitore. Si clicca sul nome dell'ingrediente nella tabella per precompilare, si digita 2000 e si tocca il pulsante: il form e' ancora in scarico e invece di caricare 2 kg li toglie. Il pasticcere lo scopre giorni do
  - proposta: Aggiungere `setFormMode('carico')` alla riga 811 dopo il salvataggio e al clic della riga 1154. Il modo distruttivo si sceglie ogni volta, non si eredita.

- **media** · riga `1297` · mobile — Campo quantita' type=number: su iPad la virgola decimale non arriva mai
  - Sul tablet la tastiera numerica italiana ha la virgola. Chi scrive "1,5" su Safari vede il pulsante restare grigio e non capisce perche': il campo sembra pieno e il programma sembra rotto. Su iPad dietro il banco e' il caso normale, non un caso limite.
  - proposta: `type="text" inputMode="decimal"` (che tiene la tastiera numerica su iOS e Android) e lasciare la normalizzazione della virgola alla riga 782, che e' gia' scritta. In piu' cosi' si puo' dare un messaggio quando il testo non e' un numero, invece di un pulsante grigio muto.

- **media** · riga `1305` · struttura — I suggerimenti propongono la chiave normalizzata, e il carico rinomina l'ingrediente
  - Il pasticcere scrive "uova", il campo gli propone "uovo", accetta con Invio e da quel momento l'ingrediente in tabella si chiama "Uovo". Lo stesso vale per le maiuscole: "Farina 00 Caputo" torna "farina 00 caputo". Il programma corregge il nome che ha scelto lui, senza dirglielo e senza motivo visib
  - proposta: Alimentare la datalist e l'autocomplete con i nomi visualizzati (`righe.map(r => r.nome)`), e alla riga 795 conservare il nome gia' salvato quando la voce esiste: `nome: gruppo.nome || formIng.trim()`.

- **media** · riga `1297` · struttura — Non si conferma con Invio: il flusso da tastiera si interrompe all'ultimo passo
  - Chi carica una bolla da dodici righe fa dodici volte: scrivi ingrediente, Invio, scrivi quantita', e qui deve mollare la tastiera e cercare il pulsante col mouse o col dito. Poi deve tornare col mouse sul primo campo, perche' dopo il salvataggio il fuoco non torna da nessuna parte. Su un lavoro ripe
  - proposta: Su quantita' e note: `onKeyDown={e => { if (e.key === 'Enter' && formIng && formQty && !saving) handleCarica() }}`. Dopo il salvataggio riportare il fuoco sul campo ingrediente (serve dargli un id, oggi non ce l'ha).

- **media** · riga `1293` · struttura — Il form non mostra la giacenza attuale dell'ingrediente scelto
  - Lo scarico si registra alla cieca. Il campo dice "Quantita' (g) - da rimuovere" e chi lo compila non ha davanti quanto ce n'e': deve tornare alla scheda giacenze, guardare, tornare qui. E' anche il motivo per cui si finisce sotto zero.
  - proposta: Sotto il campo quantita', quando `formIng` corrisponde a una voce nota: "In magazzino ora: 4.500 g" e, in modo scarico con quantita' inserita, "Dopo lo scarico: 4.000 g" (in ambra se va sotto zero). Testo a 12px, formattato con fmtG.

- **media** · riga `1344` · colore — Nel log rifornimenti gli scarichi sono scritti in verde come i carichi
  - Il log e' il posto dove si va a controllare cos'e' successo quando la giacenza non torna. Se carichi e scarichi hanno lo stesso colore, l'unico segno che li distingue e' un meno piccolo davanti al numero: si scorre venti righe verdi e si legge un carico dove c'era un'uscita.
  - proposta: `color: r.quantita_g < 0 ? C.amber : C.green` e segno esplicito (`+2,00 kg` / `−0,50 kg`), coerente con l'ambra che questa pagina usa gia' per lo scarico.

- **bassa** · riga `810` · tipografia — La spunta "✓" nel messaggio di conferma e' un carattere nel testo, non l'Icon
  - E' la regola del progetto: i simboli nella UI si fanno col componente Icon, anche nelle notifiche. Un glifo dentro la stringa viene reso dal font di sistema, quindi cambia forma tra desktop e tablet e su iOS puo' colorarsi come un'emoji, dentro un toast che ha gia' il suo colore per dire se e' andat
  - proposta: Togliere il carattere dal testo e lasciare che l'esito lo dica il toast (colore + eventuale Icon name="check" nel componente del toast, una volta sola per tutta l'app).

- **bassa** · riga `779` · correttezza — Un nome fatto di soli spazi passa la validazione e crea una voce vuota in magazzino
  - Sul tablet si sfiora la barra spaziatrice per errore molto piu' facilmente che sul desktop. Il risultato e' una riga senza nome in mezzo alla dispensa, con dentro dei grammi veri, che si porta dietro il suo stato e il suo valore e non si capisce come togliere.
  - proposta: Validare sul trim: `const nome = formIng.trim(); if (!nome || !formQty) return` e `disabled={!formIng.trim() || !formQty || saving}`.

- **bassa** · riga `1283` · accessibilita — Le etichette dei campi non sono <label>: toccarle non porta il cursore nel campo
  - Su tablet il bersaglio utile diventa solo la casella: la parola sopra, che e' la cosa piu' grande e ovvia da toccare, non fa niente. E chi ingrandisce la pagina o usa la lettura vocale non sente a cosa si riferisce la casella.
  - proposta: Trasformarle in `<label htmlFor="mag-ing-input">` / `htmlFor="mag-qty-input"` / `htmlFor="mag-note-input"` e dare gli id ai tre input. Zero cambiamenti visivi, e il tocco sull'etichetta apre la tastiera sul campo giusto.


### Prezzi ingredienti — 20 da verificare

- **alta** · riga `415` · correttezza — Il log dei prezzi va in crash se una riga non ha il campo delta
  - Basta premere "Log modifiche" e la scheda muore: schermata bianca o errore, e il pasticcere non ha piu' nessun modo di vedere lo storico prezzi ne' di lavorare in quella scheda finche' non ricarica. Le due righe sopra (412-413) si difendono con `|| 0`, questa no.
  - proposta: Calcolare il delta in modo difensivo prima del render: `const dl = Number.isFinite(Number(l.delta)) ? Number(l.delta) : (Number(l.prezzoNuovo)||0) - (Number(l.prezzoVecchio)||0)` e usare `dl` sia per il colore (riga 414) sia per il testo. Stessa cosa per `deltaPct`, ricalcolandolo da prezzoVecchio q

- **alta** · riga `412` · tipografia — Simbolo € prima della cifra in tutti i punti della scheda, e percentuali col punto
  - E' la regola scritta del progetto e qui e' violata sei volte di fila, nell'unico posto dove il pasticcere legge dei prezzi. Nella stessa pagina la scheda Giacenze scrive "8,50 €/kg" (riga 1176) e qui si legge "€ 8,50/kg": due modi diversi nella stessa schermata. E "+€ 1,50" (riga 534) non e' italian
  - proposta: Importare `fmt` e `fmtp` da ./_shared e sostituire tutte le formattazioni a mano: `{fmt(l.prezzoVecchio)}/kg`, `{fmt(confirmVal)}/kg`, `{delta > 0 ? '+' : ''}{fmt(delta)}`, `({deltaPct > 0 ? '+' : ''}{fmtp(deltaPct)})`. Risolve in un colpo posizione dell'euro, virgola decimale e separatore migliaia 

- **alta** · riga `330` · correttezza — La scheda non distingue prezzo inserito da prezzo stimato: chi ha una stima HORECA in uso vede "-"
  - Il food cost gira su un prezzo indovinato (farina 0,88 €/kg dal listino hardcoded) e la scheda dei prezzi - l'unico posto dove si va a sistemare - dice solo "Prezzo da impostare" senza mostrare quale numero sta girando nel frattempo. Il pasticcere non ha modo di capire se il suo food cost e' misurat
  - proposta: Costruire la lista da `buildIngCosti(ricettario?.ingredienti_costi)` e portare `isStima` nella riga. Per gli stimati mostrare il valore vero con l'etichetta "stima" (stesso trattamento della riga 1177) invece di "-", e cambiare il chip in "Stima di mercato" cliccabile; tenere "Prezzo da impostare" s

- **alta** · riga `557` · correttezza — Nessun blocco sul doppio clic di "Conferma e salva": la prima riga di log si perde
  - Dietro il banco, con la rete lenta, il secondo clic e' la norma. Il risultato non e' un doppione innocuo: la seconda scrittura ricostruisce il log dalla lista vecchia e cancella la riga appena scritta. Lo storico prezzi e' quello che regge i food cost retroattivi, perderci una riga significa un P&L 
  - proposta: Aggiungere `const [saving, setSaving] = useState(false)` nella tab; in `confermaSalva` uscire subito se `saving`, mettere `setSaving(true)` prima dell'await e `setSaving(false)` in finally; sul pulsante `disabled={saving}` con testo "Salvataggio…". Chiudere la modale solo se la scrittura e' andata a

- **alta** · riga `543` · correttezza — Prezzo con decorrenza futura: si salva e non si vede niente, ne' in tabella ne' nel log
  - E' la funzione centrale di questa modale. Il pasticcere imposta il burro a 9,20 €/kg dal 1 ottobre, conferma, e la tabella continua a mostrare 7,20 €/kg senza una parola. Pensa che non sia salvato e ripete l'operazione: tre righe di log, tre prezzi programmati. Un errore di battitura sull'anno (2062
  - proposta: Nella riga della tabella, se esiste una entry di log con `pianificato === true` per quella chiave, mostrare sotto il prezzo attuale una seconda riga tipo "dal 01/10: 9,20 €/kg" con un pulsante per annullarla. Nel log, aggiungere la colonna "Decorre da" (il dato c'e' gia': `decorre_da`, Dashboard.jsx

- **alta** · riga `356` · correttezza — Prezzo scritto male: il pulsante Salva non fa niente e non dice niente
  - Chi scrive "7,20" con la virgola (cioe' chiunque, in Italia, e sull'iPad il tastierino mostra la virgola) rischia un campo che il browser considera non valido: clicca Salva, non succede nulla, nessun messaggio, la riga resta aperta in modifica. Da fuori sembra il gestionale rotto. Lo stesso vale per
  - proposta: Passare `notify` alla tab (c'e' gia' fra le props di MagazzinoView, riga 570) e in `tentaSalva` avvisare: `notify('Scrivi il prezzo al chilo, per esempio 7,20', false)`. Meglio ancora: `type="text"` con `inputMode="decimal"`, cosi' la virgola arriva sempre e il `replace` funziona, e bordo rosso sul 

- **alta** · riga `545` · tipografia — Testo a 10px sulla spiegazione della decorrenza, e 11px su chip e pulsante
  - Quelle tre righe a 10px sono l'unico posto dove si spiega che il prezzo vale da una data in poi e che le produzioni vecchie tengono il prezzo storico. E' il concetto piu' delicato della scheda, scritto nel corpo piu' piccolo della pagina: chi ha sessant'anni non lo legge e sbaglia la data. Il file s
  - proposta: Portare riga 545 a 12px (e' testo, non micro-etichetta) e a 12px anche il chip di riga 453, il pulsante di riga 381 e la percentuale di riga 416. Se la modale diventa troppo alta, accorciare il testo invece di rimpicciolirlo: "Il prezzo vale dal giorno che scegli. Le produzioni di prima tengono il p

- **alta** · riga `378` · mobile — Su tablet e telefono i campi zoomano: isMobile arriva alla tab e non viene mai usato
  - Su iPad e iPhone, toccare un input sotto i 16px fa zoomare la pagina: il pasticcere tocca il prezzo del burro, la schermata salta, deve pinchare per tornare indietro, e lo fa per ogni ingrediente. Nello stesso file i campi della scheda Carica/Scarica sono fatti giusti, qui no.
  - proposta: Applicare lo stesso pattern gia' usato nel file: `fontSize: isMobile ? 16 : 13` sul campo prezzo (riga 465) e sulla ricerca (riga 378), e `fontSize: isMobile ? 16 : 13` anche sull'input data della modale (riga 544).

- **media** · riga `467` · mobile — Bersagli da toccare sotto i 40px: il prezzo cliccabile e' alto 22px
  - Il modo principale per modificare un prezzo e' toccare il numero, e su tablet quel numero e' un bersaglio da 22px: si sbaglia riga e si apre in modifica l'ingrediente sbagliato. Anche i pulsanti Salva/Annulla/Modifica restano sotto la soglia. Sul desktop 36px vanno benissimo, il problema e' solo che
  - proposta: `minHeight: isMobile ? 40 : 36` sui tre pulsanti (476, 477, 480), `padding: isMobile ? '10px 12px' : '4px 8px'` con `minHeight: isMobile ? 40 : 0` sullo span del prezzo, `padding: isMobile ? '12px 14px' : '9px 14px'` sulla ricerca. Come nella riga 1213 dello stesso file, che usa gia' `isMobile ? 40 

- **media** · riga `402` · struttura — Il log non dice da quando vale il prezzo, ne' chi l'ha cambiato
  - Il log serve a due domande vere: "da quando pago il burro 9,20?" e "chi l'ha cambiato?". Mostra solo il momento del salvataggio, quindi una modifica registrata il 28 settembre e decorrente dal 1 ottobre appare come se fosse in vigore dal 28: quando il commercialista chiede perche' il food cost di se
  - proposta: Colonne: "Modificato il" | "Vale dal" (`l.decorre_da || l.data`) | "Ingrediente" | "Vecchio" | "Nuovo" | "Differenza" | "Chi" (`l.utente`). Sulle righe con `pianificato === true` un'etichetta "programmato".

- **media** · riga `408` · correttezza — Il log dice "ultime 50" ma non ordina: con i dati esistenti mostra le piu' vecchie
  - Chi apre lo storico si aspetta in cima l'ultima modifica, quella che gli serve. Se l'array arriva in ordine cronologico crescente, il taglio a 50 tiene le piu' vecchie e butta via proprio le recenti: con 60 righe di storico le ultime 10 modifiche diventano invisibili, e l'intestazione afferma il con
  - proposta: Ordinare prima di tagliare: `[...(logPrezzi||[])].sort((a,b) => new Date(b.decorre_da||b.data) - new Date(a.decorre_da||a.data)).slice(0, 50)`.

- **media** · riga `340` · correttezza — Cerco "farina 00" e non lo trova, e in tabella si legge "Farina_00"
  - Con 200-500 ingredienti la ricerca e' l'unico modo di arrivare alla riga giusta, e fallisce sul nome piu' comune di una pasticceria perche' il pasticcere scrive lo spazio e il dato ha il trattino basso. Nel frattempo la colonna nome mostra sigle da database ("Farina_00", "Marmellata_albicocca"), che
  - proposta: Nome leggibile alla riga 335: `nome: k.replace(/_/g, ' ')`. Ricerca su testo normalizzato: costruire per ogni riga un `haystack = normIng(row.nome).replace(/_/g,' ')` e confrontarlo con `normIng(search)` ripulito dai trattini bassi, cosi' "farina 00", "farina_00" e "uovo/uova" (che `normIng` mappa) 

- **media** · riga `525` · correttezza — La modale dichiara "Prezzo attuale 0,00 €/kg" per un ingrediente che non ha prezzo
  - Zero non e' il prezzo del burro, e' l'assenza del prezzo: mostrarlo come misurato fa credere che il food cost fin qui girasse a costo zero (mentre girava sulla stima HORECA). Di conseguenza anche la riga "Variazione" mostra "+ 12,50 €" come se fosse un aumento, quando e' semplicemente il primo inser
  - proposta: Se `!row.haPrezzo`: scrivere "Prezzo attuale: mai inserito" (o il valore di stima con l'etichetta "stima", vedi il difetto sul distinguo stimato/inserito), nascondere la riga "Variazione" e cambiare il titolo in "Conferma il primo prezzo".

- **media** · riga `414` · colore — Verde per una variazione di zero, rosso col colore del marchio
  - Una modifica che lascia il prezzo dov'era viene dipinta di verde come se fosse un risparmio, e il pasticcere legge il colore prima del numero. In piu' il "rosso" degli aumenti e' lo stesso colore del pulsante Salva e dell'intera identita' della pagina, quindi non segnala nulla: e' un allarme che suo
  - proposta: Tre rami espliciti: `delta > 0 ? C.amber : delta < 0 ? C.green : C.textMid`. Ambra per l'aumento (e' un'informazione da guardare, non un'emergenza), verde solo per un calo vero, grigio per zero. E tenere C.red per i pulsanti.

- **media** · riga `382` · tipografia — Glifi ✕ e ✓ al posto del componente Icon
  - Sono caratteri tipografici messi dove il progetto vuole SVG: cambiano forma e allineamento da un dispositivo all'altro (su Android il ✓ puo' arrivare colorato come emoji) e nello stesso pulsante convivono con un'icona vera, quindi si vede la differenza di peso. Le icone che servono esistono gia'.
  - proposta: Riga 382: `<><Icon name="x" size={13} />Chiudi lo storico</>`. Riga 557: `<><Icon name="check" size={13} />Conferma e salva</>`.

- **media** · riga `387` · copy — Copy da manuale del software: "richiede conferma esplicita", "registrata nel log"
  - E' la prima frase che si legge nella scheda e suona scritta da un programma, non da chi lavora in pasticceria: "conferma esplicita", "registrata nel log", "con un click" (sul tablet si tocca). Poi il pulsante dice "Log modifiche" e il riquadro che apre dice "Storico modifiche prezzi": due nomi per l
  - proposta: Riga 387: "Tocca il prezzo per cambiarlo. Prima di salvare ti chiediamo conferma, e ogni cambio resta nello storico." Riga 382: "Storico prezzi · N", uguale al titolo del riquadro. Riga 520: "Aggiorno il prezzo di X?". Riga 402: "Differenza" invece di "Δ", con l'unita' (€/kg) nella cella o nell'inte

- **media** · riga `351` · correttezza — Salvare senza toccare il campo puo' cambiare il prezzo di nascosto
  - I prezzi sono salvati con quattro decimali, il campo di modifica li mostra arrotondati a due. Chi apre una riga per controllare e poi preme Salva per uscire scrive un prezzo diverso da quello che c'era, si becca una conferma con "Variazione + 0,00 €" (che sembra dire "non e' cambiato niente") e lasc
  - proposta: Confrontare sui centesimi, non sul valore pieno: `if (Math.abs(v - row.prezzoKg) < 0.005) { cancelEdit(); return }`, cosi' "non ho cambiato nulla" chiude e basta. E nascondere il pulsante Conferma quando la variazione arrotondata e' zero.

- **bassa** · riga `348` · struttura — La paginazione salta proprio quando servirebbe: la ricerca mostra tutto
  - Il commento sopra dice che i risultati filtrati sono comunque pochi, ma su un ricettario da 500 ingredienti basta cercare "a" (o cancellare a meta' una parola) per far comparire quasi tutte le righe con dentro i campi di modifica: sul tablet la digitazione si incolla, ed e' l'unico momento in cui il
  - proposta: Applicare il limite sempre: `const isPaginated = filtered.length > maxVisible`, e nel piede scrivere "Mostrati 80 di 214. Scrivi qualche lettera in piu' per restringere." Il contatore e il pulsante ci sono gia' (righe 493-503).

- **bassa** · riga `509` · accessibilita — La modale si comanda solo col mouse: Invio e Esc non funzionano
  - Il flusso da tastiera si interrompe a meta': in laboratorio si scrive il prezzo e si preme Invio, la conferma si apre, e da li' Invio non conferma piu' e Esc non chiude - bisogna mollare la tastiera e cercare il pulsante. Chi inserisce venti prezzi di fila lo fa venti volte.
  - proposta: Nella modale: `role="dialog" aria-modal="true"`, un `useEffect` che su `keydown` chiama `confermaSalva` per Enter e `setConfirmKey(null)` per Escape mentre `confirmKey` e' attivo, e focus iniziale sul pulsante di conferma.

- **bassa** · riga `452` · struttura — Il chip "Prezzo da impostare" non resta incolonnato con i nomi lunghi
  - Il commento sopra promette che il badge sta sempre alla stessa distanza dal bordo, e infatti con nomi corti e' cosi'; ma con "cioccolato fondente 70% Valrhona" scivola a destra e la colonna dei chip diventa una scaletta. In una lista di 80 righe l'occhio cerca i chip in colonna e li perde.
  - proposta: Larghezza fissa piu' troncamento: `width: 180, flex: '0 0 180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` con `title={row.nome}` per il nome intero. Oppure due colonne di tabella separate, nome e stato.


### Log rifornimenti — 13 da verificare

- **alta** · riga `1344` · colore — Gli scarichi sono verdi come i carichi: si distinguono solo dal segno meno a 11px
  - Il sottotitolo promette "Storico carichi e scarichi", ma la colonna Quantità è verde fissa per tutte le righe. Chi rilegge il log per capire dove è finito il burro vede una colonna tutta verde e deve accorgersi di un trattino largo tre pixel, dietro il banco, su una tabella a 11px. Carico e scarico 
  - proposta: Aggiungere una colonna "Tipo" con etichetta testuale ("Carico" / "Scarico") e colorare la quantità in base al segno: carico in C.text (nero) con "+", scarico in C.amber con "−". Il verde non serve: un carico è la normalità, non un evento positivo da festeggiare. Esempio: `const isScarico = r.quantit

- **alta** · riga `872` · tipografia — Migliaia senza punto: un sacco da 2 kg si legge "2000 g" invece di "2.000 g"
  - È esattamente il bug che _shared.jsx dice di aver già corretto sugli importi. `toLocaleString('it-IT')` senza opzioni non raggruppa i numeri a 4 cifre: tutte le quantità tra 1.000 e 9.999 (cioè quasi tutti i rifornimenti reali: 2 kg di burro, 5 kg di farina) perdono il punto delle migliaia proprio n
  - proposta: Riusare lo stesso pattern di _shared.jsx: due `Intl.NumberFormat('it-IT', { useGrouping: 'always', … })` precostruiti dentro fmtG (uno a 0 decimali per i grammi, uno a 2/3 per i kg) invece di `toLocaleString` nudo. Cambia una riga e sistema tutta la pagina, non solo il log.

- **alta** · riga `1340` · struttura — Nessuna paginazione né limite: con anni di storico la scheda stampa tutte le righe
  - `logRif.map` renderizza l'array intero. Ogni carico, ogni scarico, ogni riga da foto, dal primo giorno. Mara carica merce 2-3 volte a settimana su ~60 ingredienti: dopo due anni sono migliaia di <tr> in un colpo, il tablet si impunta e — peggio — non c'è modo di arrivare a quello che cerchi. Il log 
  - proposta: Testa di tabella con il conteggio ("1.284 movimenti · mostro gli ultimi 100"), un filtro ingrediente (la datalist `ing-list` esiste già, riga 1304) e un filtro mese/anno, più un "Mostra altri 100" in fondo. Ordinare e filtrare prima di stampare, con `useMemo`.

- **alta** · riga `1341` · correttezza — Una riga sbagliata non si può correggere né annullare
  - Battere 20000 invece di 2000 sul form carico è l'errore più comune di questa pagina, e il log è il posto dove uno va a cercarlo. Ma la riga non ha nessuna azione: né modifica, né annullo, né storno. La giacenza resta gonfia di 18 kg di burro che non esistono, il valore a magazzino è falso e l'unico 
  - proposta: Azione per riga "Annulla questo movimento" che NON cancella la storia ma scrive lo storno: nuova riga con quantità opposta, `note: 'rettifica del 08/09/2026 14:30'`, e la giacenza aggiornata di conseguenza — save-first (await ssave(SK_MAG) e ssave(SK_LOGRIF) prima dei setState, come handleCarica a r

- **alta** · riga `1330` · mobile — La tabella non scorre in orizzontale: sul telefono le 4 colonne vengono schiacciate
  - Il contenitore ha `overflow: 'hidden'` e la tabella non ha `minWidth` né wrapper scrollabile: su un telefono da 360px le colonne Data, Ingrediente, Quantità e Note si compattano fino a rompersi, e le note tipo "Metro - bolla 1234" spariscono o spezzano la riga. È la regola scritta in CLAUDE.md ("mai
  - proposta: Avvolgere la tabella in `<div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>` e dare `minWidth: 560` alla table, identico al pattern di riga 1129. Meglio ancora: su `isMobile` mostrare card a due righe (data + ingrediente sopra, quantità grande sotto) invece della tabella.

- **media** · riga `1331` · accessibilita — Tutta la tabella del log è a 11px, sotto il minimo di progetto
  - Il testo del log — date, ingredienti, quantità, note — è a 11px, e le intestazioni pure, in maiuscoletto spaziato che a 11px è ancora più chiuso. Chi legge ha sessant'anni e sta in piedi in laboratorio con le mani sporche. Il file stesso, in testa, dice che gli 11 residui restano da alzare.
  - proposta: Table a `fontSize: 13`, th a 12 (le th sono 4, non nove come nelle giacenze: c'è tutto lo spazio). La quantità, che è il numero che si cerca, a 14 e in grassetto.

- **media** · riga `1342` · mobile — La data va a capo spezzata, mentre nel log prezzi lo stesso valore è protetto
  - "08/09/2026, 14:30" senza `whiteSpace: 'nowrap'` si rompe in "08/09/2026," più "14:30" appena la colonna si stringe (e si stringe, vedi il difetto della tabella non scrollabile). Una data spezzata su due righe in un log da rileggere in fretta è rumore, e disallinea tutta la riga.
  - proposta: Aggiungere `whiteSpace: 'nowrap'` e togliere la virgola dell'anno completo: data su una riga ("08/09/2026") e ora sotto in grigio piccolo ("14:30"), come si legge una bolla. Oppure `year: '2-digit'` come già fa il log prezzi.

- **media** · riga `1344` · tipografia — I numeri della colonna Quantità non sono incolonnati né tabellari
  - La cella è allineata a sinistra e senza `TNUM`: una colonna di "2,00 kg", "−28,000 kg", "0,500 kg" resta a bandiera con cifre di larghezza diversa, quindi non si confrontano a occhio due carichi dello stesso ingrediente — che è il motivo per cui si apre questa scheda. Tutte le celle numeriche delle 
  - proposta: `textAlign: 'right'` su th e td della colonna Quantità (la th di riga 1335 forza `textAlign: 'left'` su tutte e quattro: passare a `textAlign: i === 2 ? 'right' : 'left'`, come fa la th del log prezzi a riga 403) e aggiungere `...TNUM`.

- **media** · riga `1340` · correttezza — Nessun ordinamento esplicito: la scheda si fida dell'ordine in cui i dati sono arrivati
  - La tabella stampa l'array così com'è. Funziona per caso, perché i due writer mettono le nuove righe davanti; ma niente garantisce l'ordine dopo un merge o un import, e le intestazioni non sono cliccabili — mentre il resto della pagina ha le colonne ordinabili. Un log di magazzino che potrebbe mostra
  - proposta: Ordinare in un `useMemo`: `[...(logRif||[])].sort((a,b) => new Date(b.data) - new Date(a.data))`, e rendere ordinabili Data / Ingrediente / Quantità con SortTH già disponibile nel file, così "tutti i carichi di burro" si trovano con un click.

- **media** · riga `1327` · copy — Lo stato vuoto è un vicolo cieco: dice che non c'è niente e non dice cosa fare
  - Al primo accesso — cioè quando la frase la legge chi non ha ancora capito il flusso — la scheda mostra un'icona e "Nessun rifornimento registrato", e finisce lì. Il posto dove si registra un rifornimento è la scheda accanto, e nessuno glielo dice. Costa un bottone.
  - proposta: Due righe: "Qui finisce ogni carico e ogni scarico di materie prime. Per ora non c'è niente." più un bottone "Registra un carico" che fa `setTab('carica')`. Testo a 13, bottone con altezza 44 su mobile.

- **media** · riga `797` · struttura — Il log non dice chi ha registrato il movimento
  - In un laboratorio con due o tre dipendenti la domanda vera davanti al log è "chi ha scaricato 8 kg di panna martedì?". La riga salvata non contiene l'utente, quindi la domanda non ha risposta — e la scheda è visibile anche ai dipendenti (il filtro dei tab esclude solo "Prezzi ingredienti"). Un regis
  - proposta: Aggiungere `utente` all'entry (nome o email del profilo, già disponibile nel Dashboard che passa le prop) e una colonna "Registrato da". Le righe vecchie senza campo mostrano "-": non si inventa un nome, si lascia vuoto.

- **bassa** · riga `872` · correttezza — L'unità è kg per default e dal log non si può cambiare: 500 g diventano "0,500 kg"
  - `unitMode` parte da 'kg' e il selettore kg/g sta solo dentro la scheda "Materie prime": chi apre il log senza passare da là legge ogni quantità in chilogrammi, quindi un carico di 500 g di gelatina — digitato in grammi, perché il form chiede i grammi — compare come "0,500 kg". Tre decimali per un nu
  - proposta: Portare il toggle kg/g accanto al titolo del log (SectHead accetta già `right`, vedi riga 1088) oppure, più semplice, nel log mostrare i grammi sotto il chilo e i kg sopra, con l'unità sempre scritta accanto al numero.

- **bassa** · riga `1343` · tipografia — Il nome ingrediente in capitalize spezza le maiuscole delle parole reali
  - `textTransform: 'capitalize'` mette l'iniziale maiuscola a ogni parola: "olio di semi" diventa "Olio Di Semi", "pasta di nocciole" diventa "Pasta Di Nocciole". Non è italiano, e in un elenco lungo lo si nota subito.
  - proposta: Maiuscola solo sulla prima lettera (`::first-letter` o una piccola funzione `capitalizzaPrima(nome)` condivisa), lasciando il resto come l'utente l'ha scritto. Vale anche per le altre celle che usano lo stesso capitalize in questa view (righe 1149, 411).


### Struttura e etichette — 17 da verificare

- **alta** · riga `971` · struttura — Tutto il cappello (sottotitolo, banner, 4 tessere, lista di riordino) è fuori dalle schede: appare anche su Prodotti finiti, Prezzi e Log
  - Sono dati di materie prime. Chi apre "Prodotti finiti" per vedere quanti bignè ha in vetrina si trova prima il valore del magazzino ingredienti, il banner sulle scorte e la lista della spesa della farina: quattro blocchi che non c'entrano con quello che ha chiesto. Sulla scheda "Prodotti finiti" le 
  - proposta: Spostare banner + 4 tessere + lista di riordino DENTRO il ramo `tab === 'giacenze'`, subito sotto la barra delle schede. Sopra la barra resta solo il sottotitolo con il conteggio. Così la barra è visibile entro i primi 150px in qualsiasi stato, la lista non spinge più niente, e ogni scheda mostra so

- **alta** · riga `1054` · struttura — La lista di riordino aperta non ha tetto d'altezza: con 56 ingredienti spinge la barra delle schede circa 2.000px più in basso
  - Il limite a 6 righe esiste (`RIORDINO_VISIBILI = 6`) e regge, ma appena il pasticcere premte "Vedi gli altri 47 da ordinare" la lista si apre per intero: la lista include esauriti + sotto soglia + in calo, quindi su un'org con 56 ingredienti può arrivare a più di 50 righe da ~37px, cioè circa 1.900p
  - proposta: Dare al contenitore della tabella `maxHeight: isMobile ? 320 : 420, overflowY: 'auto'` quando `riordinoTutti` è true: la lista scorre dentro il suo riquadro e la pagina non si allunga di un pixel. In più, portare il pulsante di apri/chiudi nell'intestazione scura del blocco (accanto a "Spesa stimata

- **alta** · riga `63` · correttezza — Due tessere dicono "clicca per vedere" ma non sono cliccabili: la KPI locale non ha la prop onClick
  - La tessera "Da ordinare" scrive sotto al numero "clicca per vedere cosa ordinare" e la tessera "In esaurimento" scrive "clicca per vedere quali". Il pasticcere clicca e non succede nulla: nessuno scorrimento, nemmeno il cursore a manina, perché la copia locale della KPI non riceve `onClick` e non im
  - proposta: Cancellare la KPI locale (righe 43-72) e importare quella condivisa: `import { C, TNUM, PageHeader, useSortable, SortTH, fmt0, KPI } from './_shared'`. Il click funziona subito, il cursore diventa una manina e le due scritte tornano vere.

- **alta** · riga `43` · mobile — La KPI locale è una copia vecchia della condivisa: su telefono il valore sfora e i numeri delle tessere non sono incolonnati
  - La copia locale ha perso tre cose che la condivisa ha: il `minHeight` sull'etichetta, il ridimensionamento del valore e l'altezza piena. Su telefono la griglia va a due colonne, quindi ogni tessera è larga circa 175px e ne restano 135 dentro le imbottiture: "VALORE A MAGAZZINO" va a capo su due righ
  - proposta: Eliminare le righe 43-72 e usare la KPI di `_shared.jsx`. Una sola tessera per tutta l'app: etichette a altezza fissa, valori incolonnati, testo che si adatta alla larghezza. Se serve una differenza, si cambia nella condivisa così vale su Chiusura e Produzione.

- **alta** · riga `63` · tipografia — Le etichette delle quattro tessere sono a 10,5px, sotto il minimo di 12
  - L'etichetta è l'unica cosa che dice cosa significa il numerone: senza "VALORE A MAGAZZINO" quel 12.480 può essere qualsiasi cosa. È scritta a 10,5px, tutta maiuscola e con le lettere distanziate di 0,09em, che è la combinazione più faticosa da leggere: maiuscoletto spaziato piccolo. Dietro il banco,
  - proposta: Portare l'etichetta a 12px e scendere con la spaziatura a 0,06em (`fontSize: 12, letterSpacing: '0.06em'`). A 12px "VALORE A MAGAZZINO" resta su una riga anche nella tessera stretta da 135px se si tiene il `minHeight` a due righe. Correzione in `_shared.jsx` riga 210, così vale per tutte le pagine.

- **alta** · riga `966` · correttezza — Senza storico di produzione i giorni di scorta sono calcolati su un consumo inventato, e la tessera li presenta come misurati
  - Se non ci sono sessioni di produzione, il fabbisogno viene stimato a "1 stampo per ricetta a settimana": un numero inventato dal codice, non misurato. Da lì escono i giorni di scorta, la copertura media, la colonna "Giorni scorta" della tabella e la quantità "Da ordinare" della lista della spesa. La
  - proposta: Portare fuori un flag dal calcolo (`fabbisognoStimato = ultimi7.length === 0`) e usarlo: se è stimato, la tessera scrive `sub: 'stima, ancora senza storico'` e la lista di riordino scrive in intestazione "quantità stimate: registra qualche produzione e diventano vere". Come già si fa per i prezzi (`

- **media** · riga `886` · struttura — Gli stessi due numeri sono scritti tre volte nei primi 300px, e la prima riga di dati arriva a circa 840px
  - "3 a zero · 12 da ordinare" compare nel sottotitolo, poi nel banner colorato riformulato a parole, poi come numero nelle tessere due e tre. Tre modi di dire la stessa cosa costano circa 310px e non aggiungono una informazione. Sommando: sottotitolo 64px, banner 73, tessere 177, lista di riordino chi
  - proposta: Togliere il banner (le tessere due e tre dicono già gli stessi numeri con lo stesso colore) e togliere la SectHead "Materie prime" a riga 1089, spostando il toggle kg/g e il pulsante "+ Aggiungi ingrediente" sulla destra della barra delle schede. Si recuperano circa 120px e la prima riga di dati sal

- **media** · riga `963` · correttezza — La tessera "Copertura media" non dice niente di azionabile e può essere verde mentre un ingrediente finisce domani
  - È la media aritmetica dei giorni di scorta di tutti gli ingredienti che hanno uno storico: mette insieme la vaniglia che dura otto mesi e il latte che dura un giorno. Con 50 ingredienti a 60 giorni e il latte a 1, la media viene 58 e la tessera si accende verde: il pasticcere legge "58 gg" e sta tra
  - proposta: Sostituirla con il numero che si può usare: "Prima scadenza" = il minimo dei giorni di scorta con il nome dell'ingrediente sotto (`sub` = il nome). "2 gg — panna" dice cosa fare stamattina; "58 gg" non dice niente. Il minimo non si può nemmeno mediare via.

- **media** · riga `948` · struttura — La seconda tessera cambia identità: quando qualcosa va a zero il numero "da ordinare" spariscere
  - La stessa casella, nella stessa posizione, un giorno si chiama "Da ordinare" e mostra 12, il giorno dopo si chiama "A zero" e mostra 2. Il pasticcere impara la posizione, non l'etichetta: guarda nell'angolo e legge un numero che è diventato un'altra cosa. E lo scambio avviene nel momento peggiore: q
  - proposta: Etichetta fissa "Da ordinare" con `value={sottoSoglia.length + esauriti.length}` e `sub` che scompone: `${esauriti.length} già a zero` quando ce ne sono, altrimenti "nessuno a zero". Il numero in quella posizione significa sempre la stessa cosa, e l'urgenza la porta il colore rosso più la riga sotto

- **media** · riga `1074` · copy — "Log rifornimenti": "log" è parola da informatico, e la scheda contiene anche gli scarichi
  - Nessuno in laboratorio ha mai chiamato "log" un registro. Ed è anche imprecisa: dentro non ci sono solo rifornimenti, ci sono gli scarichi manuali e le rettifiche, che il form salva nella stessa lista con quantità negativa. Il sottotitolo della sezione lo ammette ("Storico carichi e scarichi"), quin
  - proposta: Etichetta "Carichi e scarichi" e titolo di sezione uguale, sottotitolo "Tutto quello che è entrato e uscito dal magazzino". Due parole che un pasticcere usa già, e coprono davvero il contenuto.

- **media** · riga `1344` · colore — Nello storico le quantità sono sempre verdi, anche gli scarichi negativi
  - Il verde nel resto della pagina vuol dire merce entrata (a riga 268 la stessa tabella dei movimenti prodotti finiti usa verde per il più e rosso per il meno). Qui il colore è fisso: uno scarico di 2 chili di burro si legge "-2,00 kg" in verde, con lo stesso aspetto di un carico. Chi scorre la colonn
  - proposta: `color: r.quantita_g < 0 ? C.red : C.green` e il segno esplicito anche sul positivo (`+2,00 kg`), come già fa la tabella movimenti a riga 269. In più una colonna o una pillola "Carico / Scarico", che è la cosa che si cerca per prima.

- **media** · riga `1074` · struttura — "Carica merce" è un'azione messa in fila a quattro luoghi, e la si raggiunge solo passando per una scheda
  - Le altre quattro schede sono posti dove si guarda; questa è un gesto che si fa. Metterla in mezzo obbliga a un cambio di modo mentale, e soprattutto la rende raggiungibile solo se sei già dentro Magazzino sulla scheda giusta: registrare una bolla è la cosa che un pasticcere fa più spesso qui dentro,
  - proposta: Togliere "Carica merce" dalla barra e farne un pulsante primario sempre visibile accanto a "Importa prezzi" nell'intestazione ("Registra carico"), che apre il form in un pannello laterale: funziona da qualsiasi scheda e il pulsante "Carica" della lista di riordino lo apre già precompilato, senza cam

- **media** · riga `1074` · struttura — L'ordine delle schede non segue la frequenza d'uso: i prezzi stanno prima del carico merce
  - L'ordine è: giacenze, prodotti finiti, prezzi, carico, storico. Ma un pasticcere guarda le giacenze ogni giorno, registra la merce che arriva ogni giorno o quasi, controlla lo stock dei prodotti finiti ogni giorno, e tocca i prezzi degli ingredienti quando arriva un aumento dal fornitore: qualche vo
  - proposta: Riordinare per frequenza: Materie prime, Prodotti finiti, Carichi e scarichi, Prezzi ingredienti. Se "Carica merce" diventa il pulsante sempre visibile, restano quattro schede, tutte luoghi: Materie prime, Prodotti finiti, Carichi e scarichi, Prezzi ingredienti — che stanno su una riga anche su un t

- **media** · riga `1073` · mobile — Su telefono due schede su cinque restano fuori schermo e niente dice che la barra si scorre
  - Le cinque etichette a 13px con 32px di imbottitura fanno circa 650px di larghezza; su un telefono ne sono disponibili circa 360. Si vedono "Materie prime", "Prodotti finiti" e mezza "Prezzi ingredienti": "Carica merce" e "Log rifornimenti" non esistono. La barra scorre in orizzontale, ma non c'è nes
  - proposta: Due mosse insieme: ridurre a quattro schede con nomi corti ("Materie prime", "Prodotti finiti", "Carichi", "Prezzi") e su telefono aggiungere la sfumatura di taglio a destra (un gradiente da trasparente a bianco, 24px, `pointerEvents: 'none'`) che scompare quando si è a fondo scorrimento. Così si ca

- **media** · riga `957` · colore — Due tessere si accendono in ambra mentre il banner sopra dice "niente di rotto"
  - Nello stato normale di una pasticceria che ordina una volta a settimana ci sono sempre qualche ingrediente sotto soglia e qualcuno che scenderà nei sette giorni. Il banner ha già fatto la scelta giusta: colore neutro e la frase "Niente di rotto: è la lista della spesa". Ma dieci pixel più sotto le t
  - proposta: Lasciare "Da ordinare" e "In esaurimento" in colore neutro (`C.textMid`) e riservare l'ambra a chi ha meno di 3 giorni di scorta e il rosso solo agli esauriti. Sotto i numeri, `sub` con l'azione ("metti in lista"), non un colore. Coerente con la scelta già fatta sul banner e con il commento a riga 8

- **bassa** · riga `1073` · accessibilita — La barra delle schede è fatta di cinque bottoni senza ruolo: da tastiera e da lettore di schermo non è una barra
  - Non c'è `role="tablist"`, non c'è `role="tab"`, non c'è `aria-selected`: chi usa un lettore di schermo sente cinque pulsanti generici uno dopo l'altro, senza sapere quale è quello attivo (l'informazione è affidata solo al colore del testo e a un bordino da 2px). Da tastiera le frecce destra/sinistra
  - proposta: `role="tablist"` sul contenitore, e su ogni pulsante `role="tab"`, `aria-selected={tab === id}`, `id={`tab-${id}`}`, `aria-controls={`pane-${id}`}`; il contenitore del contenuto con `role="tabpanel"`. Due righe di attributi, nessun cambio visivo.

- **bassa** · riga `576` · struttura — La scheda aperta non viene ricordata: si torna sempre su "Materie prime"
  - Chi sta registrando bolle apre "Carica merce", va a controllare una ricetta in un'altra pagina e torna: la vista viene smontata e rimontata, quindi si ritrova su "Materie prime" e deve rifare il percorso. Con dieci bolle da inserire e qualche controllo in mezzo, sono dieci tocchi in più.
  - proposta: Ricordare la scheda per sessione: inizializzare da `sessionStorage.getItem('mag-tab')` con fallback 'giacenze' e salvarla in `setTab`. Sono tre righe e chi lavora a raffica non perde più il punto.
