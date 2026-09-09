# Audit Produzione — parziale, da finire

> `src/views/ProduzioneGiornalieraView.jsx` (~1150 righe). Pagina dove si
> registra cosa si è prodotto ogni giorno e da cui si scarica il magazzino.
>
> **STATO: INCOMPLETO.** Il workflow è stato ucciso dal limite di sessione dopo
> un solo agente su otto (reset alle 22:00 Europe/Rome). Delle cinque aree
> previste: una letta e strutturata, una salvata solo come parziale su file,
> tre mai partite. Nessuna verifica adversariale è girata.
>
> **Però il lavoro non è andato perso**, e questa è la novità: gli agenti
> avevano istruzione di scrivere i parziali su file mentre lavoravano (regola
> chiesta dall'utente il 07/09). L'agente dell'area "form nuova sessione" è
> morto prima di consegnare, ma le sue 279 righe di analisi erano già su disco.
> Ieri, con lo stesso incidente, quel lavoro sarebbe svanito.
>
> **NIENTE DI QUESTO È VERIFICATO.** Prima di correggere un difetto, rileggere
> la riga citata: in un audit simile del 07/09, tre presunti bug si sono
> rivelati artefatti di dati di prova sbagliati, e 4 su 29 sono stati smontati
> dagli scettici.
>
> Forme dati vere (dal database di produzione):
> `giornaliero[]` = `{ id, data, prodotti: [{ nome, stampi, vendibile }], note }` ·
> ingredienti di ricetta con **`qty1stampo`** (non "quantita" né "g") ·
> `ingredienti_costi[k]` = oggetto `{ costoKg, costoG }` ·
> `magazzino` con chiavi **minuscole**, non sempre canoniche
>
> **Per finire dopo il reset** (i letti tornano dalla cache, riparte solo il resto):
> `Workflow({scriptPath: '~/.claude/projects/-Users-aler-foodos/9f6951b3-*/workflows/scripts/audit-produzione-profondo-wf_39f23348-967.js', resumeFromRunId: 'wf_39f23348-967'})`
>
> ## Aree ancora da leggere
> - storico sessioni, modifica ed eliminazione (**la più importante**: quando si
>   modifica o elimina una sessione, gli ingredienti scaricati tornano in
>   magazzino? Se no, la giacenza resta sbagliata per sempre)
> - pannello foto/OCR
> - struttura, etichette e testo


---

## Salvataggio e scarico magazzino — 16 difetti sostenuti (NON verificati)

### ALTA · riga 535 · perdita-dati
**Il messaggio di errore dei movimenti stock viene cancellato da quello di successo**

- **perché**: Quando il carico in vetrina o il trasferimento falliscono, il pasticcere legge solo il messaggio verde "magazzino e stock vetrina aggiornati". Non sa che in vetrina mancano i pezzi, quindi non va a correggere, e da quel momento le vendite scaricano da uno stock che non esiste. Nella stessa funzione l'eliminazione sessione (righe 251-266) lo fa nel modo giusto, con if/else.
- **prova addotta**: riga 528-535:
      if (stockErrors.length || transferErrors.length) {
        notify('Alcuni movimenti stock falliti: ' + [...].join('; '), false)
      }
    }
    setQtaMap({}); ...
    notify(`Produzione registrata${msgDest} - magazzino e stock vetrina aggiornati`)
Dashboard.jsx 1474-1478: `notify` ha un solo slot -> `clearTimeout(notifyTimerRef.current); setToast({msg,ok})`. Le due chiamate sono nello stesso giro sincrono: il secondo toast sostituisce il primo prima che venga disegnato.
- **proposta**: Un solo messaggio, costruito con if/else come in handleDeleteSessione: se ci sono errori, dire quali prodotti e dove si sistema ("Vai in Magazzino, tab Prodotti finiti") e non dire che la vetrina e' aggiornata.

### ALTA · riga 474 · perdita-dati
**Lo scarico salta in silenzio gli ingredienti salvati col nome al plurale**

- **perché**: In produzione ci sono voci di magazzino con la chiave "uova", "nocciole", "mirtilli"; le ricette passano da normIng che le porta al singolare. La chiave non combacia, il ramo `if (nm[k])` e' falso e l'ingrediente NON viene scalato: le uova restano a magazzino per sempre, il riordino non scatta mai e nessuno se ne accorge perche' non c'e' un messaggio. Lo stesso mismatch fa apparire l'ingrediente a giacenza 0 nel pannello di controllo (righe 339-344 e 924) e accende il rosso su merce che c'e'.
- **prova addotta**: riga 472-475:
    const nm = { ...(magazzino || {}) }
    for (const [k, qty] of Object.entries(riepilogo.ings)) {
      if (nm[k]) nm[k] = { ...nm[k], giacenza_g: Math.max(0, (nm[k].giacenza_g || 0) - qty) }
    }
foodcost.js 480-487: SING_PLUR contiene ["uova","uovo"],["nocciole","nocciola"],["mirtilli","mirtillo"]. MagazzinoView.jsx 760-800 ha gia' l'antidoto (`magPerNorm` con `chiaviRaw`) e il commento dice "BUG in produzione, trovato il 7/09 e verificato sui dati reali". Qui quell'aggregazione non c'e'.
- **proposta**: Costruire la stessa mappa canonica -> chiaviRaw di MagazzinoView e scalare sulle chiavi grezze (proporzionalmente se sono piu' di una). Se per un ingrediente non esiste nessuna voce, dirlo nel messaggio finale invece di ignorarlo.

### ALTA · riga 211 · perdita-dati
**Eliminando una sessione il magazzino si gonfia: la restituzione crea una seconda voce**

- **perché**: La conferma non crea la voce mancante, l'eliminazione si': su un magazzino con la chiave "uova", confermare non scala nulla ed eliminare aggiunge una voce nuova "uovo" con tutto il consumo della sessione. MagazzinoView somma le due chiavi (`acc.giacenza_g +=`), quindi dopo un annullo il pasticcere vede in dispensa uova che non ha mai avuto. Stesso schema alla riga 152 nella modifica sessione. E' un numero inventato mostrato come misurato.
- **prova addotta**: riga 209-212 (handleDeleteSessione):
      for (const [k, qty] of Object.entries(sess.ingredientiUsati)) {
        if (nm[k]) nm[k] = { ...nm[k], giacenza_g: (nm[k].giacenza_g || 0) + qty }
        else nm[k] = { nome: k, giacenza_g: qty, soglia_g: 0, ultimoRifornimento: null }
      }
da confrontare con la riga 474 che invece NON crea nulla. MagazzinoView.jsx 787: `acc.giacenza_g += Number(v?.giacenza_g) || 0`.
In piu' la conferma taglia a zero (`Math.max(0, ...)`, riga 474) mentre qui si restituisce l'intero importo: 500 g di farina in dispensa, sessione da 2.000 g -> conferma porta a 0, annullo riporta a 2.000.
- **proposta**: Restituire solo quanto e' stato realmente scalato (salvare nella sessione il consumo effettivo, non quello teorico) e scrivere sulle stesse chiavi grezze da cui si e' scalato, senza mai crearne di nuove in restituzione.

### ALTA · riga 507 · correttezza
**"Pezzi al banco" a zero viene sostituito dagli stampi: vetrina e ricavo gonfiati**

- **perché**: Sui prodotti congelabili il pasticcere scrive quanti pezzi mette al banco: se scrive 0 (tutto in freezer) lo zero e' falsy e viene sostituito dagli stampi. Risultato: la vetrina si carica di tutta l'infornata che invece e' nel congelatore, e il ricavo potenziale della sessione viene salvato piu' alto del vero (riga 480, sess.ricavoTot). Il pannello di anteprima dice il contrario, perche' lui usa il controllo giusto: la schermata promette una cosa e il salvataggio ne scrive un'altra.
- **prova addotta**: riga 505-508 (loop stock PF):
        const vendibile = vendibileMap[r.nome] || stampi
riga 479 (sessione salvata):
        nome: r.nome, stampi: qtaMap[r.nome] || 0, vendibile: vendibileMap[r.nome] || qtaMap[r.nome] || 0, ...
riga 325 (ricavo): `const qv = vendibileMap[ric.nome] || q`
L'anteprima usa invece `!= null` -> riga 906: `const qv = vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : q` e riga 925 filtra i prodotti con 0.
Il server fa la cosa corretta: api/produzione-registra.js riga 112 `const qv = p.vendibile != null ? Math.max(0, Number(p.vendibile) || 0) : q`. Stesso dato, due risultati diversi fra titolare e dipendente.
Si ripete alle righe 170-171 (modifica) e 236 (eliminazione).
- **proposta**: Usare sempre `vendibileMap[nome] != null ? vendibileMap[nome] : stampi` (come l'anteprima e come il server) in tutti e cinque i punti: salvataggio sessione, carico vetrina, trasferimento, modifica, eliminazione.

### ALTA · riga 331 · correttezza
**Lo scarico non apre i semilavorati: il food cost li conta, il magazzino no**

- **perché**: Se una torta ha fra gli ingredienti "frolla" (che e' una ricetta semilavorato), lo scarico sottrae 400 g alla voce di magazzino "frolla", che non esiste, e non tocca farina, burro e zucchero. Il costo invece scende fino alle materie prime, perche' calcolaFC ricorre. Cosi' il food cost dice che hai consumato e il magazzino dice che hai ancora tutto: le due schermate non tornano mai e la lista di riordino non chiede la farina che stai finendo.
- **prova addotta**: riga 331-334 (riepilogo) e riga 131 (computeSessione):
      for (const ing of (ric.ingredienti || [])) {
        const k = normIng(ing.nome)
        ings[k] = (ings[k] || 0) + ing.qty1stampo * q
      }
Nessuna ricerca del semilavorato. foodcost.js 936-960 (calcolaFC) invece lo trova e ricorre:
      const semiKey = Object.keys(ricettario.ricette).find(k => { ... r.tipo !== 'semilavorato' ... })
      if (semiKey) { ... calcolaFC(semiRic, ingCosti, ricettario, depth + 1, ...) }
- **proposta**: Estrarre da foodcost.js una `esplodiIngredienti(ricetta, ricettario)` che restituisca le quantita' foglia (stessa ricorsione, stessi limiti di profondita' e ciclo di calcolaFC) e usarla per costruire riepilogo.ings e computeSessione.

### ALTA · riga 450 · perdita-dati
**Il messaggio invita a riprovare, ma un secondo invio registra la sessione due volte**

- **perché**: Flusso dipendente: se il server scrive e la risposta si perde (tablet in laboratorio, wifi che salta), il catch dice "I dati non sono stati persi, riprova". Il dipendente riprova e il server aggiunge una seconda sessione identica scalando il magazzino un'altra volta. Nessuno se ne accorge subito, e il magazzino resta sbagliato del doppio di una giornata di produzione.
- **prova addotta**: riga 448-452:
      } catch (e) {
        setSalvando(false)
        notify(`Salvataggio fallito: ${e.message || 'errore di rete'}. I dati non sono stati persi, riprova.`, false)
        return
      }
api/produzione-registra.js: nessuna idempotenza (grep di idempot|dedup|requestId: nessun risultato), l'id e' generato lato server `id: \`g-${Date.now()}\`` (riga 129) e la sessione viene sempre messa in testa: `const ng = [sess, ...giornaliero]` (riga 142). Il flusso titolare non ha il problema perche' ssaveBatch riscrive il blob intero.
- **proposta**: Generare un id sul client (data + ora della sessione) e mandarlo nel corpo della richiesta; sul server, se una sessione con quell'id esiste gia' nel giornaliero, non riscrivere nulla e restituire lo stato attuale.

### MEDIA · riga 524 · correttezza
**La protezione contro lo stock orfano sta in una funzione che nessuno chiama**

- **perché**: Se il trasferimento verso l'altra sede falla e anche lo storno di rimbalzo falla, i pezzi restano caricati nella sede che ha prodotto: doppio conteggio permanente fra le due sedi. La registrazione dell'orfano per il recupero manuale esiste, ma nel percorso vivo c'e' solo un console.error, che nessuno legge dietro un banco. L'utente non lo sa e l'assistenza non ha traccia.
- **prova addotta**: riga 519-526 (percorso vivo, dentro handleConferma):
            try {
              await scartoPF({ ... note: 'Rollback trasferimento fallito' })
            } catch (rb) { console.error('Rollback carico fallito:', rb) }
La versione con la protezione e' `eseguiStockPF` (righe 383-427) che chiama `registraStockOrfano` (righe 30-41), ma grep su tutto il file trova solo la definizione alle righe 383: nessun punto di chiamata. Duplicato anche il codice: eseguiStockPF e il blocco 500-531 fanno la stessa cosa.
- **proposta**: Cancellare il blocco duplicato in handleConferma e chiamare `eseguiStockPF`, oppure spostare la chiamata a registraStockOrfano nel percorso vivo. E aggiungere il caso al messaggio finale, cosi' l'utente sa che deve controllare le due sedi.

### MEDIA · riga 509 · correttezza
**Un batch di semilavorato viene caricato in vetrina come prodotto da vendere**

- **perché**: La stessa riga della tabella dichiara che un semilavorato e' "base per altre ricette" (righe 782-783), ma alla conferma viene caricato nello stock prodotti finiti come pezzi vendibili. In vetrina compaiono 3 pezzi di FROLLA, che gonfiano il valore dello stock e restano li' per sempre perche' nessuno li vendera' mai alla cassa.
- **prova addotta**: righe 500-513: il loop gira su `ricette`, che per scelta include i semilavorati (righe 87-90: "Escludiamo solo tipo='interno'"), e chiama
          await caricoProduzionePF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: pezzi, unita: 'pz', ... })
senza mai controllare `reg.tipo`. Poco sopra, alla riga 777, lo stesso `reg.tipo === 'semilavorato'` viene calcolato per l'etichetta "Semi".
- **proposta**: Nel loop dello stock vetrina saltare le ricette con `getR(r.nome, r).tipo === 'semilavorato'` (continuando a scalarne gli ingredienti dal magazzino), e togliere i semilavorati dal pannello "Stock vetrina dopo la sessione".

### MEDIA · riga 333 · perdita-dati
**Una quantita' scritta con la virgola azzera la giacenza dell'ingrediente**

- **perché**: `ing.qty1stampo` non passa da Number(): se una ricetta importata ha "1,5" invece di 1.5, la moltiplicazione da' NaN, `Math.max(0, NaN)` resta NaN e il salvataggio in jsonb lo trasforma in null. La giacenza di quell'ingrediente sparisce e viene letta come 0: banner rosso, riordino sbagliato, e il valore del magazzino sottostimato. Il resto del file usa Number() ovunque, e il server fa proprio cosi'.
- **prova addotta**: riga 333: `ings[k] = (ings[k] || 0) + ing.qty1stampo * q`
riga 474: `giacenza_g: Math.max(0, (nm[k].giacenza_g || 0) - qty)`  // NaN
api/produzione-registra.js riga 121: `ings[k] = (ings[k] || 0) + (Number(ing.qty1stampo) || 0) * q`
Stessa mancanza alla riga 131 in computeSessione.
- **proposta**: `(Number(ing.qty1stampo) || 0) * q` in entrambi i punti, e un ultimo controllo prima di ssaveBatch che scarta i valori non finiti invece di scriverli.

### MEDIA · riga 497 · colore
**Appena il salvataggio va a buon fine si accende "Scorte insufficienti"**

- **perché**: Il magazzino viene aggiornato alla riga 497 ma il modulo si svuota solo alla riga 533, dopo tutte le chiamate allo stock una dietro l'altra: con venti prodotti sono diversi secondi in cui il pannello rosso elenca come insufficienti proprio gli ingredienti appena usati (basta che il residuo sia minore del consumo, cioe' quasi sempre). L'ultima cosa che il pasticcere vede dopo aver fatto tutto giusto e' un allarme rosso. E' esattamente l'allarme che insegna a spegnere gli allarmi.
- **prova addotta**: riga 497: `setMagazzino(nm); setGiornaliero(ng)`
righe 500-531: loop con `await caricoProduzionePF(...)` per ogni prodotto
riga 533: `setQtaMap({}); setVendMap({}); ...`
riga 339-344: `problemi` ricalcola su [riepilogo, magazzino] -> con qtaMap ancora pieno e giacenza gia' scalata, `giac < qty` diventa vero per ogni ingrediente con residuo inferiore al consumo.
- **proposta**: Azzerare qtaMap/vendibileMap subito dopo il salvataggio riuscito (riga 497), prima del giro sullo stock vetrina: i pannelli sparirebbero invece di diventare rossi.

### MEDIA · riga 142 · perdita-dati
**Nella modifica sessione un campo svuotato cancella il prodotto senza dirlo**

- **perché**: Gli input della modifica salvano il testo grezzo e poi `Number(e.stampi) || 0`: se il pasticcere svuota la casella per riscriverla, o scrive "1,5" (che un campo numerico rifiuta e lascia vuoto), il valore diventa 0, il prodotto viene tolto dalla sessione e i suoi ingredienti tornano a magazzino. Il testo di aiuto dice "Metti 0 per togliere un prodotto", non dice che vuoto vale come zero. Nel modulo di inserimento nuovo il problema era gia' noto e risolto con parseIT (riga 309).
- **prova addotta**: righe 141-143:
    const nuoviProdotti = (sess.prodotti || [])
      .map(p => { const e = editRows[p.nome] || {}; return { ...p, stampi: Number(e.stampi) || 0, vendibile: Number(e.vendibile) || 0 } })
      .filter(p => p.stampi > 0 || p.vendibile > 0)
righe 1068 e 1071: `onChange={e => setEditRows(m => ({ ...m, [p.nome]: { ...m[p.nome], stampi: e.target.value } }))}`
riga 308-309: `// Audit 2026-07-01 MEDIUM: parseFloat('1,5') tronca a 1 (locale IT). const parseIT = ...`
- **proposta**: Usare parseIT anche qui, distinguere il campo vuoto (lascia il valore di prima) dallo zero scritto a mano, e nel riquadro di conferma elencare i prodotti che verranno rimossi.

### MEDIA · riga 926 · accessibilita
**I numeri che dicono cosa esce dal magazzino sono scritti a 9 e 10 pixel**

- **perché**: "Ingredienti da scalare" e "Scorte insufficienti" sono le due schermate che il pasticcere legge prima di premere Conferma: sono l'unico posto dove vede quanti grammi escono e quanto resta. Sono a 10px, e il residuo a 9px, con l'abbreviazione "insuff.". A sessant'anni, in laboratorio, non si leggono: si conferma alla cieca. Il limite del progetto e' 12px.
- **prova addotta**: riga 926: `... fontSize: 10, padding: '5px 8px', borderRadius: 6, background: ok ? '#F8FAF8' : C.redLight }}>`
riga 932: `<span style={{ color: ok ? C.green : C.red, fontSize: 9 }}>{ok ? `→ ${fmtG(giac - qty)}` : 'insuff.'}</span>`
riga 945: `<div key={p.nome} style={{ fontSize: 10, color: C.red, marginBottom: 4 }}>`
riga 949: `<div style={{ fontSize: 10, color: C.red, marginTop: 8, opacity: 0.7 }}>Puoi procedere comunque - il magazzino andrà a 0.</div>`
- **proposta**: Portare a 12-13px nome, quantita' e residuo, scrivere "non basta" invece di "insuff." e togliere l'opacity 0.7 dalla riga che spiega cosa succede confermando.

### MEDIA · riga 1120 · tipografia
**Nella conferma di eliminazione i chili sono scritti col punto e senza spazio**

- **perché**: L'elenco degli ingredienti che tornano a magazzino mostra "1.23kg": punto decimale invece della virgola e unita' appiccicata. In italiano "1.23kg" si legge come milleventitre, e questo e' il numero su cui il pasticcere decide se annullare una giornata di produzione. Nello stesso file, venti righe piu' su, la funzione fmtG (riga 539) lo scrive giusto.
- **prova addotta**: riga 1120:
                      {k}: +{qty >= 1000 ? (qty / 1000).toFixed(2) + 'kg' : Math.round(qty) + 'g'}
riga 539 (corretta, gia' disponibile):
  const fmtG = g => g >= 1000 ? `${(Number(g) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(g)||0).toLocaleString('it-IT')} g`
- **proposta**: `{k}: +{fmtG(qty)}` — spostando fmtG sopra il return o in _shared.

### MEDIA · riga 889 · tipografia
**Il margine percentuale del riquadro di conferma usa il punto decimale**

- **perché**: Nello stesso riquadro si legge "418,30 €" di margine e "71.0%" di percentuale: accanto a un importo con la virgola il punto sembra un errore di battitura, e in un prodotto italiano si nota. Il file usa fmtp (che nasce proprio per questo) in tutti gli altri KPI e qui no.
- **prova addotta**: riga 889:
                            <span style={{ fontWeight: 700, color: mc, ...TNUM }}>{margPct.toFixed(1)}%</span>
_shared.jsx 52-58: `// Prima era toFixed(1), che usa SEMPRE il punto ... const NF_IT_PCT = new Intl.NumberFormat('it-IT', ...)` / `export const fmtp = ...`
- **proposta**: `{fmtp(margPct)}` (fmtp e' gia' importato alla riga 23).

### MEDIA · riga 529 · copy
**Nel messaggio d'errore finisce il testo grezzo dell'errore del database**

- **perché**: I trasferimenti falliti vengono accodati con `e.message`, quindi il toast puo' diventare "Alcuni movimenti stock falliti: TORTA DI CAROTE: new row violates row-level security policy". Non e' italiano, non e' comprensibile a chi sta dietro un banco e non dice cosa fare. Nella stessa funzione i carichi usano friendlyErrorMessage: due pesi e due misure.
- **prova addotta**: riga 521: `transferErrors.push(`${r.nome}: ${e.message}`)`
riga 516: `} catch (e) { stockErrors.push(`${r.nome}: ${friendlyErrorMessage(e)}`); continue }`
riga 529: `notify('Alcuni movimenti stock falliti: ' + [...stockErrors, ...transferErrors].slice(0, 2).join('; '), false)`
Stesso problema alla riga 246 per gli storni dell'eliminazione.
- **proposta**: friendlyErrorMessage anche sui trasferimenti, e nel messaggio solo i nomi dei prodotti piu' l'indicazione di cosa fare ("il trasferimento a Sede X non e' partito: rifallo da Trasferimenti").

### BASSA · riga 1103 · struttura
**Toccando lo sfondo si chiude la finestra mentre l'eliminazione e' in corso**

- **perché**: Durante l'eliminazione il tasto Annulla e' bloccato e anche Escape e' protetto, ma un tocco sullo sfondo chiude tutto: su un tablet con le mani sporche succede facilmente. La finestra sparisce a metà operazione, il pasticcere non vede piu' ne' l'esito ne' l'eventuale avviso sullo stock rimasto in vetrina, e non sa se l'eliminazione e' andata.
- **prova addotta**: riga 1102-1103:
        <div style={{ position: 'fixed', inset: 0, ... }}
          onClick={e => { if (e.target === e.currentTarget) { setDeleteSessConf(null); setDeleteSessPin('') } }}>
da confrontare con la protezione che esiste altrove, riga 286-290:
      if (e.key === 'Escape' && !deletingSess) { setDeleteSessConf(null); setDeleteSessPin('') }
- **proposta**: Aggiungere `&& !deletingSess` anche al click sullo sfondo.


---

## Form nuova sessione — solo parziale su file, non strutturato

Salvato dall'agente prima di morire. Testo grezzo, da rileggere e verificare:


```
# Audit — scheda "Nuova sessione" (ProduzioneGiornalieraView.jsx)
File: /Users/aler/foodos/src/views/ProduzioneGiornalieraView.jsx (1148 righe)

## PARZIALE 1 (~1/4)

### 1. [ALTA / perdita-dati] "0 pezzi al banco" viene salvato come "tutti al banco"
Riga 479 (e 434 per il dipendente, 507 per lo stock vetrina, 323 nel riepilogo).
Prova:
  riga 479: `vendibile: vendibileMap[r.nome] || qtaMap[r.nome] || 0`
  riga 507: `const vendibile = vendibileMap[r.nome] || stampi`
  riga 323: `const qv = vendibileMap[ric.nome] || q`
  riga 771 (UI):  `const vq = vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : q`
Il valore 0 e' falsy: chi mette 0 nella colonna "Pezzi al banco" di un prodotto
congelabile (10 stampi di banana bread tutti in freezer, niente in vetrina)
vede il campo VUOTO (riga 810: `value={vq || .0. ? ...}` -> `vq || ''` rende '') ma il salvataggio scrive 10 e carica
10 pezzi nello stock vetrina. Schermo e database dicono cose diverse.
Proposta: helper unico `const vend = (n) => vendibileMap[n] != null ? vendibileMap[n] : (qtaMap[n] || 0)` usato in TUTTI i punti (479, 434, 507, 323, 371, 392, 906).

### 2. [ALTA / correttezza] Un numero negativo negli stampi RIEMPIE il magazzino
Righe 310-316 + 333 + 474.
Prova:
  riga 310: `const parseIT = (val) => parseFloat(String(val).replace(',', '.')) || 0`  // -5 passa
  riga 333: `ings[k] = (ings[k] || 0) + ing.qty1stampo * q`                            // q = -5
  riga 474: `nm[k] = { ...nm[k], giacenza_g: Math.max(0, (nm[k].giacenza_g || 0) - qty) }` // - (-7500) = +7500
`min="0"` sull'input (riga 801) e' solo validazione HTML: non c'e' un <form>, non
si chiama checkValidity(), quindi il valore entra nello stato. Con un prodotto a
+2 e uno a -5 `hasQta` e' vero, la conferma parte e la farina AUMENTA di 7,5 kg.
Proposta: in parseIT `Math.max(0, ...)` e scarto dei valori non finiti; in piu' `if (qty <= 0) continue` nel ciclo di riga 473.

### 3. [ALTA / correttezza] La virgola italiana negli stampi non arriva mai a parseIT
Righe 310 e 801.
Prova:
  riga 801: `<input type="number" min="0" value={q || ''} onChange={e => setQ(ric.nome, e.target.value)}`
  riga 310: `parseFloat(String(val).replace(',', '.')) || 0`
Su input `type="number"` il browser sanifica: Safari (iPad, il caso d'uso vero)
restituisce `e.target.value === ''` quando si digita "1,5" → parseIT('') → NaN
→ `|| 0` → 0. La correzione del 2026-07-01 e' inefficace dove serve. Si perde
mezzo stampo in silenzio, senza nessun avviso.
Proposta: `type="text" inputMode="decimal"` + parseIT (che gia' gestisce la virgola), come si fa nelle righe di modifica (righe 1069-1072 usano inputMode="decimal").

### 4. [ALTA / correttezza] Ricettario vuoto o ancora in caricamento: "Nessun prodotto trovato per """
Righe 750-758.
Prova:
  riga 751: `const filtered = q ? ricette.filter(...) : ricette`
  riga 752: `if (filtered.length === 0) return (<td ...>Nessun prodotto trovato per "{ricSearch}".{' '}<button>Pulisci ricerca</button>`
Con `ricSearch` vuoto (primo render, ricettario non ancora arrivato dal
Dashboard, o pasticceria nuova senza ricette) la tabella mostra la frase con le
virgolette vuote e un bottone "Pulisci ricerca" che non pulisce niente. Nessuno
stato di caricamento, nessun invito ad aggiungere la prima ricetta.
Proposta: tre stati distinti — caricamento (scheletro), ricettario vuoto ("Non hai ancora ricette" + bottone al ricettario), filtro senza risultati (solo se `ricSearch` non e' vuoto).

## PARZIALE 2 (~1/2)

### 5. [ALTA / correttezza] I tasti +/- della colonna "Pezzi al banco" partono dal numero sbagliato quando il campo e' a 0
Righe 809 e 812.
Prova:
  riga 809: `onClick={() => setV(ric.nome, Math.max(0, (vendibileMap[ric.nome] || q) - 1))}`
  riga 812: `onClick={() => setV(ric.nome, (vendibileMap[ric.nome] || q) + 1)}`
Con 10 stampi e "Pezzi al banco" portato a 0, il campo mostra 0 (riga 771) ma il
tasto "+" scrive 11 e il tasto "-" scrive 9. Il pasticcere vede il numero
saltare da 0 a 9 senza capire perche'.
Proposta: leggere il valore corrente con lo stesso criterio della UI (`!= null ? ... : q`) in entrambi i tasti.

### 6. [ALTA / correttezza] Si possono mettere piu' pezzi al banco degli stampi prodotti, senza nessun avviso
Righe 810 e 868 + 328.
Prova:
  riga 868: `{q !== qv && <span ...>({qv} vendibili oggi, {q - qv} in freezer)</span>}`
  riga 328: `ricavoTot += qv * (Number(reg.unita) || 0) * (Number(reg.prezzo) || 0)`
Con 2 stampi e 20 pezzi al banco il riepilogo scrive "(20 vendibili oggi, -18 in
freezer)" e il ricavo potenziale conta 20 stampi mai fatti; lo stock vetrina
viene caricato con pezzi che non esistono. Nessun blocco, nessun colore.
Proposta: limitare il vendibile a `<= stampi` (clamp in setV) oppure avviso rosso esplicito "Hai messo al banco piu' pezzi di quanti ne hai prodotti".

### 7. [ALTA / correttezza] Margine 100% inventato: prodotti presi dal freezer contano ricavo con food cost zero
Righe 322-324 + 854 + 889.
Prova:
  righe 322-324: `const q = qtaMap[ric.nome] || 0; const qv = vendibileMap[ric.nome] || q; if (!q && !qv) continue`
  riga 330: `fcTot += q * fc`   // q = 0 -> food cost 0
  riga 854: `{ricette.filter(r => qtaMap[r.nome] > 0).map(...)}`  // il prodotto NON viene elencato
Un tap sul "+" della colonna "Pezzi al banco" di un congelabile (stampi 0,
vendibili 1) fa comparire il pannello "Riepilogo sessione" senza nessun prodotto
in elenco, con "Margine lordo" pieno e "100,0%" in verde. Il margine e' un
numero inventato presentato come misurato: quel prodotto e' stato pagato in un
altro giorno.
Proposta: nel riepilogo elencare anche i prodotti con soli pezzi al banco, e escludere dal calcolo del margine i pezzi che vengono dal freezer (o etichettarli "dal freezer - costo gia' registrato").

### 8. [ALTA / tipografia] Nella stessa scheda si legge "71,0%" e "71.0%"
Riga 889.
Prova:
  riga 889: `<span style={{ ... }}>{margPct.toFixed(1)}%</span>`   // -> "71.0%" col PUNTO
  riga 699 e 702 (KPI, stessa schermata) usano `fmtp(...)` -> "71,0%" con la virgola
`toFixed` usa sempre il punto. src/views/_shared.jsx riga 52-58 documenta questo
stesso errore come gia' corretto con `fmtp`, ma il pannello laterale e' rimasto
indietro. Accanto a "418,30 €" il punto sembra un errore di battitura.
Proposta: `{fmtp(margPct)}` (l'helper e' gia' importato a riga 23).

## PARZIALE 3 (~3/4)

### 9. [ALTA / correttezza] "8 fette × 4,00 €" inventate per ogni ricetta importata
Righe 786, 791, 328, 511 + src/lib/foodcost.js righe 717-726.
Prova:
  foodcost.js 720: `if (ricetta?.unita != null) return { unita: ricetta.unita || 0, prezzo: ricetta.prezzo || 0, ... }`
  foodcost.js 725: `return { unita:8, prezzo:4, tipo:"fetta" }`
Le ricette vere hanno il campo `porzioni` (piu' `prezzo`), NON `unita`: getR non
legge `porzioni`, quindi cade sul fallback e restituisce 8 pezzi a 4 €.
Conseguenze visibili nel form: riga 786 scrive "1 stampo → 8 fette × 4,00 €",
riga 791 "3 × 8 = 24 pezzi al banco", il KPI "Ricavo potenziale" (riga 696) e il
carico in vetrina (riga 511 `pezzi = vendibile * unitaFactor`) sono calcolati su
numeri che nessuno ha inserito.
Proposta: `unita: ricetta.unita ?? ricetta.porzioni ?? null` e, se manca, NON inventare: mostrare "porzioni da impostare" e non calcolare ricavo/pezzi.

### 10. [ALTA / colore] Semilavorati e gusti: allarme rosso "Margine basso - rivedi i prezzi" ogni giorno
Righe 688-689, 875-876, 696.
Prova:
  riga 689: `: margPct >= 60 ? 'Margine sano' : margPct >= 40 ? '...' : 'Margine basso - rivedi i prezzi'`
  riga 876: `const mbg = margPct >= 60 ? C.greenLight : margPct >= 40 ? C.amberLight : C.redLight`
  riga 785 (il codice lo sa): `<>1 batch → {reg.unita} kg di gusto</b> (prezzo su formati vendita)</>`
Un semilavorato ha per definizione `prezzo: 0` (foodcost.js 699-702) e un gusto
gelateria ha il prezzo sui formati di vendita: il ricavo esce 0, il margine esce
negativo e la scheda diventa rossa con "rivedi i prezzi". Il file include i
semilavorati per scelta (commento righe 88-91), quindi e' la condizione NORMALE.
Un allarme che suona sempre insegna a spegnere gli allarmi.
Proposta: se tutti i prodotti in sessione hanno prezzo 0, non mostrare margine/semaforo ma "Batch di base - il costo verra' conteggiato nel prodotto finito".

### 11. [ALTA / perdita-dati] La destinazione (e la data) restano impostate per la sessione dopo
Righe 533 e 462.
Prova:
  riga 533: `setQtaMap({}); setVendMap({}); setSessNote(''); setConfermando(false); setSalvando(false)`
  (manca `setDestinazioneSedeId(null)`, manca il reset di `data`, manca `setProdottiNonRicettario([])`)
  riga 536: `setTab('storico')`  // la scheda con la tendina sparisce dalla vista
Chi registra una produzione "Per: Sede di Torino" e poi ne registra un'altra
nella stessa mezz'ora si ritrova un secondo trasferimento automatico verso
Torino che non ha chiesto: i pezzi partono davvero (creaTrasferimento, riga
519, con `autoInvia: true`). Stesso problema con una data passata rimasta
selezionata.
Proposta: resettare destinazione, data (a `todayLocal()`) e la lista dei prodotti non riconosciuti insieme al resto a riga 533/462.

### 12. [ALTA / correttezza] Ingrediente salvato col nome vecchio: allarme falso E consumo mai scalato
Righe 333, 341-343, 473-474.
Prova:
  riga 333: `const k = normIng(ing.nome); ings[k] = (ings[k] || 0) + ing.qty1stampo * q`
  riga 341: `const giac = magazzino?.[k]?.giacenza_g || 0`
  riga 474: `if (nm[k]) nm[k] = { ...nm[k], giacenza_g: Math.max(0, (nm[k].giacenza_g || 0) - qty) }`
In magazzino esistono chiavi non canoniche ("uova", "nocciole", "mirtilli")
mentre `normIng` porta al singolare: `magazzino["uovo"]` non c'e'. Doppio danno:
(1) il pannello "Scorte insufficienti" (riga 943) si accende in rosso su un
ingrediente che in realta' c'e'; (2) a riga 474 il ramo `if (nm[k])` e' falso,
quindi quel consumo NON viene mai scalato: la giacenza resta alta per sempre.
Lo stesso vale per un ingrediente semplicemente non tracciato (giac 0): rosso
identico a "finito davvero".
Proposta: risolvere la chiave con un lookup tollerante (chiave esatta -> normIng -> alias plurale) e distinguere a schermo "non tracciato" da "scorta finita".

### 13. [MEDIA / correttezza] La data si puo' svuotare e si puo' mettere nel futuro; a mezzanotte resta quella di ieri
Righe 272, 714, 477.
Prova:
  riga 272: `const [data, setData] = useState(todayLocal())`   // calcolata una volta al mount
  riga 714: `<input type="date" value={data} onChange={e => setData(e.target.value)}`  // nessun min/max, niente required
  riga 477: `id: \`g-${Date.now()}\`, data,`   // salvata cosi' com'e'
Un tablet lasciato aperto in laboratorio dalle 23:00 registra la produzione col
giorno prima. Se il campo viene svuotato (i date picker si possono azzerare) si
salva `data: ''` e lo storico stampa "Invalid Date" (riga 1013
`new Date(sess.data).toLocaleDateString('it-IT', ...)`).
Proposta: bloccare la conferma se `data` e' vuota, `max={todayLocal()}` sull'input, e ricalcolare "oggi" quando la scheda torna visibile.

### 14. [MEDIA / perdita-dati] Nessun avviso se esiste gia' una sessione per quella data
Righe 476-485.
Prova:
  riga 485: `const ng = [sess, ...(giornaliero || [])]`   // nessun controllo su `s.data === data`
Chi conferma due volte (pagina ricaricata, dubbio "l'ho salvata?") crea due
sessioni per lo stesso giorno e scala il magazzino due volte. La guardia su
`salvando` (riga 424) protegge solo dal doppio clic ravvicinato.
Proposta: se esiste una sessione con la stessa data, chiedere "Oggi hai gia' registrato una produzione: la aggiungo come seconda sessione?".

## PARZIALE 4 (finale)

### 15. [MEDIA / tipografia] Etichette e intestazioni a 8-9px, sotto la soglia dei 12px
Righe 713, 718, 746, 781, 790, 794, 827, 833, 866, 924-930, 943-949.
Prova:
  riga 746 (intestazioni della tabella): `fontSize: 8, ... textTransform: 'uppercase', letterSpacing: '0.07em'`
  riga 713 / 718 / 827 / 833: `fontSize: 9, fontWeight: 700, ... textTransform: 'uppercase'` (Data produzione, Cerca prodotto, Note sessione, Destinazione)
  riga 781: `<span style={{ fontSize: 9, color: C.textSoft }}>` (1 stampo -> N fette x prezzo)
  riga 790 / 794: `fontSize: 8` (badge "pezzi al banco", badge "congelabile")
Le quattro colonne che dicono cosa scrivere dove sono le scritte piu' piccole
della pagina, in maiuscolo e in grigio chiaro. Chi ha 60 anni e il laboratorio
poco illuminato le indovina.
Proposta: minimo 12px per le etichette, 13px per le intestazioni di colonna; togliere il maiuscolo che riduce la leggibilita'.

### 16. [MEDIA / mobile] Il campo degli stampi resta alto ~27px fra due tasti da 40px
Righe 801-802 e 810-811.
Prova:
  riga 802: `style={{ width: 48, padding: '4px', ... fontSize: isMobile ? 16 : 13 }}`   // nessun minHeight
  riga 800: `style={{ width: isMobile ? 40 : 26, height: isMobile ? 40 : 26, ...`        // i tasti si', 40px
Con le mani sporche si centra il "-" e non il campo; e i tre elementi non sono
nemmeno allineati in altezza. Nelle righe di modifica dello storico il minHeight
c'e' (righe 1069-1072: `minHeight: isMobile ? 40 : 'auto'`), qui manca.
Anche il tasto x che pulisce la ricerca e' 26x26 (riga 729).
Proposta: `minHeight: isMobile ? 40 : 'auto'`, larghezza 56-64px sui campi numerici e 40px sul tasto di pulizia.

### 17. [MEDIA / struttura] Con 100 ricette la scheda ricalcola 100 food cost a ogni tasto premuto
Righe 91-92, 751, 769.
Prova:
  riga 91: `const ricette = Object.values(ricettario?.ricette || {}).filter(...).sort(...)`   // NON memoizzato
  riga 337: `}, [qtaMap, vendibileMap, ricette, ingCosti, ricettario])`                       // dipende da `ricette`: nuovo array a ogni render -> memo inutile
  riga 769: `const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)`                        // dentro la map, per ogni riga visibile
`calcolaFC` per ogni ingrediente fa `Object.keys(ricettario.ricette).find(...)`
(foodcost.js 936-941): 100 ricette x ~10 ingredienti x 100 chiavi a ogni
carattere digitato nella ricerca o nelle note. Su un 
```
