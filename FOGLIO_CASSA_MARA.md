# Il foglio di chiusura di Mara — cosa c'è, cosa entra, cosa proporre

Letto dalla foto del **4 settembre 2026, sede Carlina**, firmata Camilla.
Documento scritto il 21/09/2026.

Serve a due cose: capire **quanto di quel foglio può entrare in Foodos oggi**,
e proporre a Mara **un foglio rifatto** che dia a noi i dati che servono senza
chiedere a chi chiude la cassa nemmeno un minuto in più.

---

## 1. Cosa c'è scritto sul foglio

Il foglio ha quattro blocchi, e ognuno risponde a una domanda diversa.

### Blocco A — la chiusura, divisa su **due casse**

|  | CAFFÈ | GELATO |
|---|---:|---:|
| Fondo cassa mattina | 143,50 | 129,40 |
| Fondo cassa sera | 146,70 | 151,90 |
| POS | \multicolumn: 2.181,60 (una cifra sola) | |
| Contanti | 120 | 530 |

Poi, senza divisione per cassa:

- Glovo 73,00
- Just Eat 39,00
- Deliveroo 89,50

### Blocco B — la busta dei contanti

Il conteggio per taglio: 50× 2, 10× 2 (gli altri vuoti), e
**contanti totali busta: 650**.

### Blocco C — i parziali orari

Due colonne (caffè e gelato), una riga per ogni ora dalle 9 all'01. Sono
**totali progressivi**, non incassi dell'ora: si legge il display della cassa
e si trascrive.

| ora | caffè | gelato |
|---:|---:|---:|
| 10 | 82,00 | |
| 11 | 167,80 | |
| 13 | 215,50 | 76,50 |
| 14 | 274,60 | 127,50 |
| 15 | 380,10 | 232,00 |
| 16 | 439,70 | 433,50 |
| 17 | 544,90 | 637,30 |
| 18 | 656,90 | 876,30 |
| 19 | 664,90 | 1.016,30 |
| 20 | | 1.235,90 |
| 21 | | 1.330,40 |
| 22 | | 1.769,90 |
| 23 | | 2.152,00 |
| 24 | | 2.393,30 |
| 01 | | +11,50 |

### Blocco D — chi c'era, e cosa si è pagato di tasca

**Personale in turno:** Anto 8-16 · Riri 10-16.30 · Iss 9-15.30 · Diego
14-20 · Camilla 19-20 · Mame 17-23 · Beb 18-1 (più una riga cancellata).

**Spese:** «1 lava Spices 97,00» e «Bazar 19,00 (bicchieri/tazza)».

---

## 2. Le quattro cose che questo foglio dice e Foodos non sa

Verificato leggendo `src/views/ChiusuraView.jsx`: oggi la Cassa raccoglie
**incasso, POS, contanti, delivery (un campo solo), numero scontrini e costo
materie**. Quindi:

### a) Il fondo cassa non c'è, e senza non si quadra niente

Sul foglio ci sono **fondo cassa mattina e fondo cassa sera**, per ognuna
delle due casse. È il numero con cui si controlla se i contanti tornano:

    contanti attesi = fondo sera − fondo mattina + incassi contanti − spese pagate in cassa

Senza il fondo, «contanti 650» è un numero che nessuno può verificare. Con il
fondo, un ammanco si vede la sera stessa invece che a fine mese.

**Questo è il buco più importante dei quattro**, perché è l'unico che rende
verificabile tutto il resto.

### b) Le casse sono due, per Foodos è una

Caffè e gelato hanno cassa separata, fondo separato e andamento orario
separato. Sono due attività diverse: il caffè lavora la mattina, il gelato la
sera — si vede benissimo dai parziali (alle 19 il caffè è fermo a 664,90 e il
gelato è già a 1.016,30 e continua fino all'una).

Foodos oggi tiene **un totale per sede**. Sommandole si perde esattamente
l'informazione per cui esistono due casse.

### c) I parziali orari non esistono da nessuna parte

Sono il dato più prezioso del foglio e il più faticoso da scrivere a mano
(quindici righe, due colonne, ogni ora). Da lì si legge:

- **quando entra davvero il fatturato**: il gelato fa il 57% dell'incasso
  dopo le 19
- **quante persone servono e quando**: i turni si costruiscono su questo, non
  a sentimento
- **se una serata è andata male davvero o solo diversamente**

### d) Il delivery è diviso in tre, Foodos ha un campo solo

Glovo, Just Eat e Deliveroo hanno commissioni diverse (dal 15% al 30%): un
totale unico da 201,50 € non dice quanto resta in tasca. I lettori dei file
delle tre piattaforme in Foodos **ci sono già** (`src/lib/importDelivery.js`),
ma il campo scritto a mano è uno solo.

---

## 3. Il foglio rifatto, da proporre a Mara

Il criterio: **non chiedere niente in più**, riordinare quello che già si
scrive, e aggiungere solo i due campi che rendono il foglio verificabile.

    ┌─────────────────────────────────────────────────────────────┐
    │ CHIUSURA GIORNATA        Sede: ............  Data: ../../.. │
    │ Chi chiude: ...........................  Ora: ......        │
    ├─────────────────────────────────────────────────────────────┤
    │                                CAFFÈ        GELATO          │
    │  Fondo cassa APERTURA          ........     ........        │
    │  Fondo cassa CHIUSURA          ........     ........        │
    │  Incasso POS                   ........     ........   ←NEW │
    │  Incasso CONTANTI              ........     ........        │
    │  Scontrini emessi (numero)     ........     ........   ←NEW │
    ├─────────────────────────────────────────────────────────────┤
    │  DELIVERY     Glovo ......  Just Eat ......  Deliveroo .....│
    ├─────────────────────────────────────────────────────────────┤
    │  SPESE PAGATE DALLA CASSA        (scontrino allegato: SÌ/NO)│
    │   ..................... €......   □ ho lo scontrino         │
    │   ..................... €......   □ ho lo scontrino         │
    ├─────────────────────────────────────────────────────────────┤
    │  CONTA BUSTA  100×__ 50×__ 20×__ 10×__ 5×__ monete €.....   │
    │  TOTALE BUSTA €........                                     │
    │  ► QUADRATURA (la fa Foodos, non tu)                        │
    ├─────────────────────────────────────────────────────────────┤
    │  PARZIALI ORARI — scrivi il TOTALE del display, non l'ora   │
    │   ora  │ caffè │ gelato        ora  │ caffè │ gelato        │
    │   09   │       │               17   │       │               │
    │   …                                                          │
    ├─────────────────────────────────────────────────────────────┤
    │  PERSONALE IN TURNO   (nome — dalle — alle)                 │
    │   .............. __:__ → __:__                              │
    └─────────────────────────────────────────────────────────────┘

**Le sei differenze rispetto al foglio di adesso, e perché**

1. **POS diviso per cassa.** Oggi è una cifra sola: così non si può quadrare
   nessuna delle due casse separatamente, e se una sera i conti non tornano
   non si sa nemmeno da che parte guardare.
2. **«Fondo apertura / chiusura»** al posto di «FC mattina / FC sera».
   «Mattina» e «sera» sembrano due momenti della giornata; quello che serve
   sapere è *com'era quando hai aperto* e *com'è ora che chiudi*.
3. **Numero scontrini.** Una riga, e da lì esce lo scontrino medio — che è il
   numero che dice se una giornata storta è andata male perché è entrata meno
   gente o perché ognuno ha speso meno. Sono due problemi diversi con due
   rimedi diversi.
4. **Le spese con la casella «ho lo scontrino».** Foodos distingue già le
   spese con documento da quelle senza (è la prima nota): segnarlo sul foglio
   costa un segno di penna e fa risparmiare la telefonata al commercialista.
5. **La conta della busta resta, la quadratura sparisce.** Chi chiude conta i
   soldi; il conto se tornano lo fa il programma. Un conto fatto a mano alle
   una di notte è il posto dove nascono gli errori.
6. **Turni con l'orario in colonna** invece che a testo libero. Oggi si trova
   «8-16», «10-16.30», «9-15.30», «14.00-20.00»: quattro modi di scrivere la
   stessa cosa, e chi li ricopia deve interpretarli.

**Una cosa che toglierei, se Mara è d'accordo:** i parziali orari su *tutte* e
due le colonne per tutte le ore. Dal foglio si vede che il caffè dopo le 19 è
fermo e il gelato prima delle 13 non parte: metà delle caselle sono vuote per
forza. Basterebbero le ore in cui quella cassa lavora davvero.

---

## 4. Cosa serve in Foodos perché quel foglio entri

In ordine di valore, con quello che manca davvero:

| # | Cosa | Perché | Quanto |
|---|---|---|---|
| 1 | **Fondo cassa apertura/chiusura** nella Cassa, con la quadratura dei contanti calcolata | È l'unico modo per accorgersi di un ammanco la sera stessa. Oggi «contanti 650» non è verificabile da nessuno | medio |
| 2 | **Delivery diviso per piattaforma** nel campo scritto a mano | I lettori dei file ci sono già: manca solo che il campo manuale sia tre invece di uno. Commissioni dal 15% al 30% | piccolo |
| 3 | **Più casse per sede** (caffè / gelato) | Sono due attività con due curve diverse. Sommarle butta via il motivo per cui esistono due casse | grande |
| 4 | **Parziali orari** | Il dato che oggi non ha nessuno e che decide i turni. Da valutare se chiederlo a mano o leggerlo dalla cassa | grande |
| 5 | **Numero scontrini per cassa** | Il campo c'è già, ma è uno solo | piccolo |

**Il punto 3 va deciso, non implementato di slancio.** «Più casse per sede»
tocca il modello dei dati di tutto il prodotto: chiusure, P&L, quadratura,
confronto fra sedi. C'è un'alternativa che costa un decimo: trattare caffè e
gelato come **due sedi** dentro la stessa azienda, visto che Foodos il
multi-sede ce l'ha già e funziona. Non è elegante — non sono due negozi — ma
darebbe a Mara fondo, POS, contanti, scontrini e andamento separati **domani**
invece che fra un mese.

---

## 5. Quello che non so, e che chiederei a Mara

1. **I parziali orari li scrive a mano leggendo il display, o la cassa li
   stampa?** Se li stampa, il foglio può sparire e si legge il file. Cambia
   tutto: da «quindici righe scritte a mano ogni sera» a «zero».
2. **Il POS è uno solo per le due casse, o due e li somma sul foglio?** Sul
   foglio è una cifra sola, ma potrebbe essere una somma fatta a mano.
3. **Le spese pagate dalla cassa rientrano nella busta o restano fuori?**
   Cambia la formula della quadratura.
4. **Quel «+11,50» dell'una di notte** è un incasso dopo la mezzanotte o una
   correzione? Se è il primo, la giornata contabile non finisce a mezzanotte,
   e il programma invece dà per scontato di sì.
