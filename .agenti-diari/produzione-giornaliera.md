# Diario — Produzione giornaliera

File assegnato: `src/views/ProduzioneGiornalieraView.jsx` (1.391 righe)
Stato iniziale: voto 52/100, 8 prove, 132 deviazioni dai token.

## 0% — avvio (19/09/2026)
- Letto CLAUDE.md. Diario creato.
- Prossimo passo: leggere il file per intero e i moduli che usa (rese.js, stockPF.js, storage.js).

## 20% — lettura fatta, difetti candidati (19-20/09/2026)
Letto tutto il file + `scaricoIngredienti.js`, `rese.js`, `dateLocal.js`, `foodcost.js`, `_shared.jsx`, `theme.js`.
Prove esistenti: 8, in `tests/unit/produzioneScarico.test.jsx` (buon modello: happy-dom + render).
Deviazioni token (baseline): colore-a-mano 50, testo-a-mano 80, tripla-a-mano 2 = **132**. Bersaglio ≤ 27.

### Difetti trovati (da correggere)
1. **La resa non entra nello scarico.** `calcolaFC` divide il costo per la resa
   (`costoNettoPerG`), lo scarico (`ingredientiDaScaricare`) usa `qty1stampo` grezzo.
   Con uova all'85% il food cost conta 117 g e il magazzino ne scala 100.
   Oggi latente: `select ... data_key='pasticceria-rese-v1'` → **0 righe in tutto il database**.
2. **Un valore che manca diventa zero.** Storico: `s.ricavoTot || 0`, `s.fcTot || 0`.
   Dati veri Mara dei Boschi: la sessione `g-evento-hnop3x43mu3515iv-...` (nata da Eventi)
   NON ha `fcTot` né `ricavoTot` né `ingredientiUsati`. La scheda scrive «Food cost 0 €»
   e «Margine 0 €» su una produzione di cui non sappiamo il costo.
3. **Sessione con data nel futuro**: quella stessa sessione è datata **2026-09-30**
   (oggi è il 19/09). Il campo data ha `max={todayLocal()}`, ma l'evento scavalca.
4. **Formato vecchio ignorato**: Gelateria Demo ha 142 sessioni con `ricette: [{nome, numStampi}]`
   invece di `prodotti: [{nome, stampi}]`. La view legge solo `sess.prodotti` → 142 schede
   vuote e «0 stampi totali».
- Prossimo passo: verificare 4 su StoricoProduzioneView/demoSeed, poi cercare le finestre
  del browser, i bersagli tablet e le date.

## 25% — difetti confermati sui dati veri, comincio a correggere (20/09/2026)
Numeri veri di Mara dei Boschi (solo letture):
- 68 ricette, **5 semilavorati**, 62 gusti. **2 semilavorati stanno in magazzino**
  (`base bianca`, `salsa zabaione`) e **29 ricette su 68 usano `base bianca`** come ingrediente.
- `pasticceria-rese-v1`: **0 righe in tutto il database** (la resa oggi è sempre 1,0).
- Gelateria Demo: 142 sessioni nel formato vecchio.

### Difetti confermati, in ordine di costo
5. **Il semilavorato finisce in vetrina.** `handleConferma` (riga ~660) carica in
   `stock_prodotti_finiti` TUTTO quello che si produce. Il guardiano
   `if (reg.tipo === 'semilavorato') continue` c'è solo in `eseguiTrasferimentoAuto`
   (audit 9 set): corretto in un posto, non nell'altro. Mara produce BASE BIANCA →
   la vetrina si riempie di una riga che la cassa non scaricherà mai.
6. **Il semilavorato prodotto non rientra in magazzino.** Il giro è aperto: produrre
   BASE BIANCA scala latte e zucchero, ma non aumenta `magazzino['base bianca']`;
   poi i 29 gusti la scalano. La giacenza può solo scendere.
7. **La modifica di una sessione ricalcola gli ingredienti col motore VECCHIO.**
   `computeSessione` (riga ~128) legge `ric.ingredienti` grezzi invece di
   `ingredientiDaScaricare`: correggere una sessione con una crostata restituisce
   farina e burro e toglie una voce «pasta frolla» che non esiste. Il magazzino cresce.
8. **«non basta» su un ingrediente pieno**, terza ricomparsa: il pannello
   «Ingredienti da scalare» legge `magazzino?.[k]?.giacenza_g` (chiave canonica)
   mentre il magazzino tiene «uova». `problemi` era stato corretto il 14 set, il pannello no.
9. **`Number(e.stampi) || 0`** nella modifica: «1,5» diventa 0 e la riga sparisce.
10. **Le date della scheda**: `new Date('2026-01-01')` è mezzanotte a Greenwich.
    A ovest di Greenwich la sessione del 1° gennaio si legge «31/12/2025»: giorno,
    mese e anno sbagliati.
11. **Bersagli sul tablet**: Modifica/Elimina e i campi della modifica usano
    `isMobile ? … : 'auto'` → sul tablet restano da mouse.
- Prossimo passo: scrivere le correzioni, una famiglia alla volta.

## 50% — correzioni scritte (20/09/2026)
Fatti (tutti in `src/views/ProduzioneGiornalieraView.jsx`, `npx eslint` pulito dopo ognuno):
- [x] `vaInVetrina(reg)`: il semilavorato non entra più in vetrina — conferma, modifica ed
      eliminazione, tutti e tre. Prima il guardiano stava solo nel trasferimento fra sedi.
- [x] `rientroSemilavorato(...)`: la base tenuta in magazzino (base bianca, salsa zabaione)
      rientra a scaffale quando la si produce. Il giro era aperto da una parte sola.
- [x] `applicaConsumo` / `annullaConsumo`: un motore solo per conferma, modifica ed
      eliminazione. La modifica non ricalcola più con la logica pre-9 settembre e aggiorna
      `scalatoPerChiave` (prima restava quello della sessione vecchia).
- [x] `grammiLordi(...)`: la resa entra nello scarico. Dichiarato nel commento cosa NON copre
      (resa impostata sul nome di un semilavorato).
- [x] `numeroNoto(...)`: nello Storico un `fcTot`/`ricavoTot` mancante è «—», non 0, e i KPI
      dicono su quante sessioni su quante è fatto il totale.
- [x] `prodottiDiSessione(...)`: le sessioni nel formato vecchio (`ricette`/`numStampi`) si
      vedono — erano 142 schede vuote sull'account dimostrativo.
- [x] `giornoIT(...)`: le date si leggono come giorni, non come istanti UTC.
- [x] `parseIT` nella modifica: «1,5» non diventa più 0.
- [x] «Ingredienti da scalare» legge `disponibileDi(k)`: basta «non basta» su un ingrediente pieno.
- Prossimo passo: bersagli del tablet, poi le 132 deviazioni dai token, poi i test.

## 75% — bersagli del tablet e token (20/09/2026)
- [x] `const dito = isMobile || isTablet`. Portati a 44 px: i +/− degli stampi e dei pezzi al
      banco, i campi numerici, Modifica/Elimina, i campi della modifica sessione, le linguette,
      il pulsante PDF, data, ricerca, note, destinazione, i chip che si toccano.
      Prima su tablet erano 30 px (i +/−) e 28 px (Modifica/Elimina).
- [x] Deviazioni dai token: **132 → 4** (0,2 ogni 100 righe).
      `colore-a-mano` 50 → 2, `testo-a-mano` 80 → 0, `tripla-a-mano` 2 → 2.
      - misure: `const FS = font.size`, come in MagazzinoView (84 sostituzioni).
      - colori: uno alla volta, `npx eslint` dopo ogni gruppo. #92400E → `C.amberDark`
        (identico), #FFF → `T.white`, la famiglia ambra → `C.amberLight`/`C.amberDark`,
        la verde → `C.greenLight`/`C.green`, #2980B9 e #0369A1 → `T.blue`,
        #FEF7F5/#FFF9F9 → `C.redLight`/`T.brandLight`, #DDD → `C.borderStr`, #EEE → `C.borderSoft`,
        #9C887F → `T.textMid`.
      - restano 2: `#F8F4F2` e `#FDFAF7`, le due superfici calde del prodotto. In theme.js un
        token per loro non c'è (i neutri del tema sono freddi) e inventarlo è una decisione di
        chi disegna. Ora sono due costanti in cima al file invece di cinque copie sparse.
      - le 2 `tripla-a-mano` sono griglie KPI `1fr 1fr / repeat(2,1fr) / repeat(4,1fr)`: sono
        LAYOUT, non misure di testo, e il ternario a tre vie lì è la forma giusta.
- Prossimo passo: `tests/unit/produzioneScarico.test.jsx` è rosso su «scala anche
  l'ingrediente salvato al plurale» — capire se è la correzione o una rottura, poi i test nuovi.

## 80% — primo file di prove chiuso (21/09/2026)
`tests/unit/produzioneSemilavorati.test.jsx` — **17 prove, verdi**. Montano la pagina.
Prova della mutazione fatta e ripristinata, tre volte:
- tolto `if (!vaInVetrina(reg)) continue` da `handleConferma` → 2 prove rosse;
- tolto il rientro del semilavorato dal `riepilogo` → 5 prove rosse;
- tolto il guardiano dallo scarto dell'eliminazione → 1 prova rossa.
`npx eslint` pulito dopo il ripristino. Copia buona del file in
`<scratchpad>/VISTA_BUONA.jsx` per fare le mutazioni senza rischi.
- Prossimo passo: prove sulla modifica di una sessione (motore vecchio, «1,5» → 0,
  `scalatoPerChiave` stantio).

## 90% — quattro file di prove chiusi (21/09/2026)
| file | prove | mutazioni provate |
|---|---|---|
| `produzioneSemilavorati.test.jsx` | 17 | guardiano vetrina (2 rosse), rientro in magazzino (5), guardiano nello scarto (1) |
| `produzioneModificaSessione.test.jsx` | 16 | motore vecchio (6 rosse), `Number()` al posto di `parseIT` (3), `scalatoPerChiave` non riscritto (3) |
| `produzioneStoricoNumeriEDate.test.jsx` | 24 | `|| 0` sui numeri mancanti (6 rosse), formato vecchio ignorato (4), date come istanti (2) |
| `produzioneSulTablet.test.jsx` | 19 | `dito` → `isMobile` (7 rosse) |
Totale nuove: **76**, più le 8 che c'erano = **84** su questa pagina.
Ogni mutazione ripristinata subito, `npx eslint src/ --quiet` pulito dopo ognuna.

Una cosa detta e non nascosta: la prova del fuso orario **non** dimostra il difetto
delle date. `vitest.config.js` fissa TZ=Europe/Rome per tutti i worker e da un singolo
file non si sposta (i worker a thread non rileggono `process.env.TZ`). In ora italiana
`new Date('2026-01-01')` dà il giorno giusto. Quello che si prova davvero è
«Invalid Date» stampato a schermo su una data mancante o storta. Sta scritto nel
cappello del file di prova.
- Prossimo passo: prove su resa e sul riquadro «Ingredienti da scalare», poi le verifiche finali.

## 100% — finito (21/09/2026)
**Prove**: 8 → **106** su questa pagina (98 nuove in 5 file, più le 8 che c'erano).
| file | prove |
|---|---|
| `produzioneSemilavorati.test.jsx` | 17 |
| `produzioneModificaSessione.test.jsx` | 16 |
| `produzioneStoricoNumeriEDate.test.jsx` | 27 |
| `produzioneSulTablet.test.jsx` | 19 |
| `produzioneScaricoRealeMagazzino.test.jsx` | 19 |
| `produzioneScarico.test.jsx` (c'era già) | 8 |

**Deviazioni dai token**: 132 → **4** (0,24 ogni 100 righe su 1.658; il bersaglio era sotto 2).
Restano solo `#F8F4F2` e `#FDFAF7` — le due superfici calde del prodotto, senza un token in
theme.js — e due griglie KPI a tre vie, che sono layout e non misure di testo.

**Prove della mutazione**: 12, tutte rosse al punto giusto e tutte ripristinate.

**Verifiche finali**
- `npx eslint src/views/ProduzioneGiornalieraView.jsx --quiet` pulito.
  (`npx eslint src/` completo segnala un errore di sintassi in `src/components/Personale.jsx`
  riga 2060 — è l'altro agente a metà lavoro, non mio.)
- `npm run grammar` pulito.
- 128 prove verdi sui file che toccano questa pagina, 0 rosse.
- `grep '${${'` → 0. Nessun danno da regex.

**Da fare dopo il commit, non da me**: `node scripts/check-design-tokens.mjs --aggiorna`.
Il cricchetto confronta la fotografia con **HEAD**, e la fotografia dichiara ancora 132
deviazioni per questa pagina. `cricchettoTokenDiDesign.test.js` è già rosso adesso per
CashflowView, SpreciOmaggi e FormatiVendita (agenti che hanno committato senza rifare lo
scatto): serve un solo `--aggiorna` alla fine, per tutti.
