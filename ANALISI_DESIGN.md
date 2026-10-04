# La nuova Analisi — regole comuni

Rifondazione decisa il 03/10/2026. Il titolare: «la parte di analisi è fatta
male e inutile». Alle domande ha risposto: **non capisco cosa guardare**,
**grafici inutili o brutti**, **mancano le cose che servono**. La prima
domanda a cui rispondere è **«quanto guadagno e perché»**. Ampiezza:
rifondare, ma **foto prima di pubblicare**.

Gli audit del 03/10 (voti: P&L 18, Costi fissi 35, Storico 18, Quadratura 12,
Previsioni 15, B2B 35) e la ricerca sui migliori software sono la base. Questo
file è il contratto fra le pagine: chi rifà una pagina lo legge per primo.

## 1. Cosa sa davvero Foodos (dati veri di Mara, 03/10/2026)

- **Cassa**: nessuna chiusura registrata. Gli incassi si **stimano**
  dall'inventario (venduto × prezzo medio dei formati), e l'inventario si
  ferma al **31/08**.
- **Fatture fornitori**: 3.104 dal 2023, quasi tutte con **imponibile 0**
  (dall'Excel arriva solo il totale IVA compresa). Lo ZIP dell'Agenzia le
  completerà. 315 fornitori, **nessuno con la categoria**.
- **Personale**: un solo dipendente attivo, con stipendio 0; tre segnati
  inattivi (circa 12.100 €/mese).
- **Produzione/inventario**: maggio–agosto completi; 28% dei kg venduti con un
  nome di gusto che non trova la ricetta.

Quindi la regola più importante: **ogni pagina dice cosa sa e cosa no, prima
del numero**. Un dato che manca non è zero, una stima si chiama stima.

## 2. Le regole (valgono per ogni pagina)

1. **Una pagina, una domanda.** Il titolo della pagina è la domanda
   («Quanto ho guadagnato a settembre?»), il primo numero è la risposta.
2. **Un numero non sta mai da solo.** Accanto c'è il confronto: **stesso
   periodo dell'anno prima** (attività stagionale: il mese prima inganna) e,
   se non c'è, il periodo prima **con gli stessi giorni registrati**. Mai
   confrontare 29 giorni registrati con 62.
3. **La copertura dei dati è in cima**, in una riga: da dove viene ogni numero
   e cosa manca, con il pulsante per sistemarlo («Incassi stimati
   dall'inventario fino al 31/08 · 92 fatture, 31 senza imponibile ·
   Personale incompleto → Sistema»). Componente `CoperturaDati`.
4. **Stima ≠ dato.** Un numero stimato porta la parola «stimato» dentro la
   tessera, non in una nota a piè di pagina.
5. **I titoli dei grafici dicono la conclusione**: «Su 100 € incassati te ne
   restano 18», non «Andamento». Il sottotitolo dice cosa è disegnato.
6. **Percentuali e punti.** Le quote in % con al massimo un decimale; le
   variazioni di una quota in **punti** («food cost +1,8 punti»); ogni % ha
   accanto gli €. Numeri italiani, punto delle migliaia sempre, € dopo la
   cifra, euro grandi all'unità.
7. **Niente semafori, tachimetri, torte, 3D.** Per una quota contro un
   obiettivo: `BarraObiettivo` (barra, tacca dell'obiettivo, 2 fasce di
   grigio). Lo stato si scrive a parole e con l'icona, mai col colore solo.
8. **Il conto economico è una tabella**, non un muro di tessere: voce · € ·
   % sui ricavi · anno prima · scostamento · andamento 12 mesi in piccolo.
   Sopra, la **cascata** dai ricavi all'utile.
9. **Le previsioni sono un intervallo** («fra 380 e 450»), con la data
   dell'ultimo dato usato e l'errore che il metodo ha fatto davvero nelle
   settimane passate.
10. **Prima il telefono.** Ogni pagina si legge a 420 px: tessere in colonna,
    tabelle che scorrono dentro il loro riquadro, niente righe tagliate.
11. **Parole del banco.** Niente «drift», «sell-through», «Holt», «stampi» a
    una gelateria (usare `lessico(tipoAttivita)`), niente «P&L» nei testi
    lunghi (va bene nel menu).
12. **Due rossi.** Bordeaux (`T.brand`) solo per le azioni; rosso
    (`T.red`) solo per gli allarmi veri e gli scostamenti in peggio.

## 3. Colori dei grafici (`src/lib/graficiTema.js`)

Non sono categorie: sono ruoli. Validati con lo script della guida dataviz
il 03/10: come tavolozza a categorie falliscono, ed è voluto — non devono mai
distinguere serie fra loro.

| Ruolo | Colore | Uso |
|---|---|---|
| `reale` | `#3B4A5E` (ardesia) | il dato del periodo, pieno |
| `confronto` | `#B8C2CF` | anno prima / periodo prima, pieno chiaro |
| `obiettivo` | contorno `#475264` | tacca o linea dell'obiettivo |
| `stima` | `#3B4A5E` tratteggiato o al 35% | previsioni, valori stimati |
| `meglio` | `T.green` `#0A7350` | solo scostamenti in meglio, con segno e parola |
| `peggio` | `T.red` `#DC2626` | solo scostamenti in peggio, con segno e parola |
| `incompleto` | `T.amber` `#B45309` | solo «dato incompleto», mai accanto al rosso |
| griglia | `#EEF1F6`, 1 px pieno | recessiva |

Segni: barre ≤ 24 px con l'estremo arrotondato 4 px, linee 2 px, punti ≥ 8 px,
2 px di spazio fra barre che si toccano. **Un solo asse** sempre. Etichette
solo dove servono (fine linea, massimo, valore della storia). Ogni grafico ha
il passaggio del mouse con il valore e, a richiesta, la tabella dei numeri.

## 4. I pezzi comuni (`src/components/analisi/`)

| Pezzo | Cosa fa |
|---|---|
| `CoperturaDati` | la riga in cima: fonti, buchi, azioni |
| `NumeroConConfronto` | tessera: etichetta, valore (eventuale «stimato»), confronto in € e %/punti con icona e parola, riga di contesto |
| `BarraObiettivo` | quota contro obiettivo, con fasce |
| `Cascata` | grafico a cascata ricavi → utile |
| `Andamentino` | linea minuscola da tabella (sparkline) |
| `TitoloGrafico` | titolo-conclusione + sottotitolo |
| `FraseInsight` | una frase con il numero dietro, cliccabile verso il dettaglio |

Tutti in italiano, con `font.size.*`/`typo.*` e `color as T` (il cricchetto
dei token vale per i file nuovi).

## 5. Le pagine

- **Il mese** (nuova, prima voce dell'Analisi): quanto ho guadagnato e perché.
  Utile (o perché non si può dire), cascata, le 3-5 cause della differenza con
  l'anno prima, food cost / personale / prime cost contro obiettivo, le tre
  sedi affiancate, 2-3 cose da fare.
- **Conto economico** (ex P&L): la tabella completa per mese, costi dalle
  **fatture per natura** (categoria del fornitore), senza IVA, per data della
  fattura; investimenti fuori dal conto del mese; personale; incassi veri o
  stimati. Il listino teorico per stampo esce da qui (va in Food cost).
- **Spese fisse** (ex Costi fissi): solo quello che non arriva in fattura.
- **Produzione** (ex Storico): quanto ho prodotto, venduto e buttato,
  per gusto e per sede, con i giorni coperti.
- **Torna il conto?** (Quadratura): senza cassa dice che non si può fare e
  perché, invece di -100%.
- **Previsioni**: cosa fare domani, a lotti, in kg, con intervallo ed errore
  passato.
- **Vendite B2B**: corretta il 03/10 (54a5df1); nessuna rifondazione finché
  non c'è un cliente che la usa.

## 6. Il disegno al millimetro (04/10/2026)

Dopo l'audit misurato al pixel (`/Users/aler/foodos-lavori/audit-design.md`) e
la ricerca sui migliori pannelli (`/Users/aler/foodos-lavori/ricerca-design.md`).
Il titolare: «il più figo, innovativo, intuitivo e semplice possibile;
incolonnare tutto, allineare tutto al millimetro; appena atterro non devo
vedere tutto sto ammasso di cose».

**Spazi, una regola sola** (l'audit ne ha contati quattro sistemi di colonne e
spazi fra i blocchi da 10 a 18 px):

| | computer | telefono |
|---|---|---|
| dentro un riquadro (orizzontale e verticale) | 20 | 16 |
| fra un riquadro e l'altro | 24 | 16 |
| fra una sezione e l'altra | 40 | 32 |
| altezza delle righe di testo | pixel tondi (niente 21 o 16,2 px) | idem |

Lo spazio fra i blocchi lo possiede il contenitore della pagina
(`PaginaAnalisi`), non i pezzi: niente `marginBottom` sparsi.

**All'arrivo si vedono i numeri, non i comandi.** Filtri, copertura dei dati,
opzioni delle tabelle: una riga sola che dice lo stato e si apre al tocco
(come il periodo, `BarraPeriodo`). Mai righe di pulsanti sempre aperte.

**Un avvertimento che cambia come si legge un numero sta accanto al numero**,
non solo dentro la copertura chiusa. Trovato il 04/10 nella prima foto dopo la
copertura chiusa: le spese di agosto (50.497 €) sono IVA compresa, perché le
fatture di WebDesk non hanno l'imponibile finché non arriva lo ZIP, e la pagina
diceva «dagli incassi all'utile, senza IVA»; «contati con l'IVA» stava solo
dietro il tocco. «IVA compresa», «stimato», «mancano N giorni» vanno nella riga
sotto il numero che toccano. La copertura chiusa riassume, non nasconde.

**Una risposta grande per pagina**, 36-48 px al computer, con unità piccola,
confronto e una frase. Il titolo è una frase di 10 parole al massimo, e il
grafico evidenzia la stessa cosa: se il titolo parla del burro, la barra del
burro è l'unica scura.

**Numeri incolonnati**: tessere affiancate con le righe interne condivise
(etichetta, numero, confronto sulla stessa linea anche se un'etichetta va a
capo); colonne di numeri della stessa larghezza in tabella, cascata e cause;
numeri e intestazioni a destra, cifre tabellari, € nell'intestazione quando
la colonna è tutta in euro, il meno vero (−, non il trattino). La freccia
segue il segno del numero, il colore il giudizio.

**Cambiano tre regole di sopra:**
- la **cascata** del conto non sta sopra la tabella: è la tabella (voce,
  barra, €, % sui ricavi, differenza con l'anno prima come barretta);
- la **barra con l'obiettivo** segue la specifica di Few (barra spessa un
  terzo, segno dell'obiettivo e dell'anno prima, tre fasce di grigio davvero
  distinte);
- l'**incompleto** oltre al colore ambra è una zona tratteggiata dentro il
  grafico, con la scritta (come Stripe).

**Telefono**: il conto diventa un elenco di schede (voce, € a destra, sotto
«31,2% · +1,8 punti»); col dito sul grafico cambia il numero grande in alto
invece di aprire un fumetto che il dito copre; si tocca tutta la colonna.

**Movimento** solo per non perdere il filo: le barre cambiano in un quarto di
secondo, mentre carica resta il grafico vecchio sbiadito. Niente numeri che
contano da soli, niente scintille.
