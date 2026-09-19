# Diario — togliere le ultime finestre del browser

Agente: finestre-browser. Inizio 19/09/2026.

## Obiettivo
4 `window.confirm` da sostituire con `ConfirmModal` (`useConfirm`):
- `src/components/ImportWizard.jsx` — righe 300 e 360
- `src/views/InventarioSettimanaleView.jsx` — righe 683 e 1644

File che NON devo toccare: `src/Dashboard.jsx`, `src/views/MagazzinoView.jsx` (ci lavorano altri).

## 25% — censimento fatto

Contate le violazioni con la stessa logica del cricchetto
(`tests/unit/nienteDomandeDelBrowser.test.js`, funzione `violazioni()`), non a occhio:

| file | violazioni vere | nel cricchetto |
|---|---|---|
| `src/Dashboard.jsx` | 1 | 1 (ok, non mio) |
| `src/components/ImportWizard.jsx` | **2** | 3 (numero vecchio) |
| `src/views/InventarioSettimanaleView.jsx` | 2 | 2 |

Trovato subito: il numero 3 di `ImportWizard.jsx` nel cricchetto **è già scaduto**.
La terza era il `window.prompt` del mese, tolto da altri (resta solo il racconto nel
commento a riga 70, e i commenti il setaccio non li conta). Quindi ImportWizard passa
da 2 a 0, non da 3 a 1: **esce del tutto dalla mappa**, come InventarioSettimanaleView.
Dopo il lavoro in `DA_CORREGGERE` deve restare solo `src/Dashboard.jsx: 1`.

- [x] letto CLAUDE.md, ConfirmModal.jsx, il cricchetto
- [x] contate le violazioni vere
- [ ] ImportWizard: 2 sostituzioni
- [ ] InventarioSettimanaleView: 2 sostituzioni
- [ ] aggiornata la mappa del cricchetto
- [ ] test di comportamento (annullo = non salvo niente)
- [ ] eslint + i tre file di test + prova della mutazione

**Prossimo passo:** sostituire le due di ImportWizard (sono entrambe dentro
`goToStep4`, che è già `async`; `chiediConferma` esiste già a riga 80).

## 50% — ImportWizard fatto

Due sostituzioni in `src/components/ImportWizard.jsx`, tutte e due dentro
`goToStep4` (già `async`, `chiediConferma` già presente a riga 80):

1. **righe già in Foodos** (era riga 300). Tolte le due righe «OK = le salto /
   Annulla = le carico comunque»: adesso lo dicono i pulsanti
   (`Salta le doppie` / `Caricale comunque`). Aggiunto il caso che prima non
   c'era: se le doppie sono **tutte** le righe del file, il messaggio dice
   «se le salti, non carico niente» invece di «Le altre 0».
2. **mese già caricato** (era riga 360). `destructive: true`. Il riepilogo
   diceva `- Mese 2026-07: 1.240 righe già presenti`; adesso
   `- luglio 2026: 1.240 righe` (c'era già `MESI_IT` nel file).

`npx eslint src/components/ImportWizard.jsx --quiet` pulito; il conteggio con la
logica del cricchetto dà **0** su ImportWizard.

### Difetto trovato per strada (importante)

`ConfirmModal` disegna a `z.modal + 10` = **210**. In
`InventarioSettimanaleView.jsx` due finestre stanno a **9998** (il contenitore
dell'ImportWizard, riga 787) e **9999** (`DialogSpedizione`, riga 1573): il
riquadro di conferma finirebbe **sotto**, invisibile, e il pulsante sembrerebbe
morto. Non è teoria: sono esattamente due dei quattro punti che devo cambiare.
Lo correggo nel mio file portando quei due contenitori sul livello del tema
(`z.modal`), che è la scala che il progetto usa già.
In tutto il prodotto ci sono ~33 contenitori sopra 210: chi userà `useConfirm`
dentro uno di quelli avrà lo stesso problema. Vale la pena guardarlo a parte.

**Prossimo passo:** le due di `InventarioSettimanaleView.jsx`.

## 75% — tutte e quattro sostituite, cricchetto aggiornato

`src/views/InventarioSettimanaleView.jsx`:
- aggiunto `import { useConfirm } from '../components/ConfirmModal'` e `z as Z` dal tema
- `const chiediConferma = useConfirm()` nel corpo del componente principale
  **e** in `DialogSpedizione` (sono due componenti diversi: l'hook va in tutti e due)
- **copia della settimana scorsa** (era riga 683): `Copia` / `Annulla`, celle
  contate all'italiana
- **spedizione oltre il disponibile** (era riga 1644): `onClick` diventato
  `async`, `Spedisci comunque` / `Annulla`, `destructive: true`
- i due contenitori a 9998 e 9999 portati su `Z.modal`

Cricchetto (`tests/unit/nienteDomandeDelBrowser.test.js`): `DA_CORREGGERE` adesso
ha **solo** `src/Dashboard.jsx: 1`. Tolti gli altri due (erano a 0: il test
«quando uno viene corretto, questo elenco si accorcia» sarebbe diventato rosso se
li avessi lasciati). Aggiornato anche il cappello del file, che diceva «ce ne
sono cinque», e il nome del test «e i cinque casi noti non aumentano».

Verificato finora:
- `npx eslint src/ --quiet` → pulito
- `npx esbuild src/views/InventarioSettimanaleView.jsx` → compila
- `npx vitest run tests/unit/nienteDomandeDelBrowser.test.js` → 6/6 verde

Restano: il test di comportamento (annullo = non salvo niente), i due test del
wizard, e la prova della mutazione.

**Prossimo passo:** scrivere `tests/unit/annullareNonSalvaNiente.test.jsx`.

## 100% — finito

### Test di comportamento
`tests/unit/annullareNonSalvaNiente.test.jsx`, 7 prove. Non guarda il sorgente:
monta la pagina dell'inventario dentro il `ConfirmProvider`, preme i pulsanti e
controlla se `salvaCella` è stata chiamata.
1. copia settimana scorsa + Annulla → nessuna cella scritta
2. copia settimana scorsa + Copia → due celle scritte davvero (il righello:
   senza questa, la prima sarebbe verde anche con il pulsante rotto)
3. «Celle da copiare: 1.240» col punto delle migliaia
4. dentro il riquadro non ci sono più «OK =» e «Annulla =»
5. il riquadro esce sopra le finestre della pagina (livelli letti dal DOM)
6. spedizione oltre il disponibile + Annulla → non parte niente, e il riquadro
   esce sopra la finestra della spedizione
7. «copio la settimana» NON è marcata pericolosa (non cancella niente)

### Prova della mutazione — fatta tre volte, tutte rosse
| cosa ho rimesso | cosa è diventato rosso |
|---|---|
| `window.confirm` in `ripetiSettimanaScorsa` | cricchetto: «nessun file nuovo chiede col browser» |
| tolto `await` davanti a `chiediConferma` (copia settimana) | comportamento: 2 prove |
| tolto `await` (spedizione) + rimesso `zIndex: 9999` | comportamento: la prova della spedizione, in tutti e due i casi |

Tutto ripristinato dopo ogni prova; il conteggio finale dice
`src/Dashboard.jsx 1` e basta.

### Verifiche finali
- `npx eslint src/ --quiet` → pulito
- `npx vitest run` sui quattro file chiesti → 43/43 verdi
- `npm run grammar` → le mie righe sono a posto (avevo scritto «piu'» e
  «perche'» in due commenti nuovi, corretti). Restano tre segnalazioni
  preesistenti in `ImportWizard.jsx` (righe 78, 112, 140) che non sono mie.
- `npm test` completo: 15 rossi, **nessuno nei miei file** — sono
  `Dashboard.jsx` (troppo lunga), `MagazzinoView.jsx` (5 file di prove) e
  `FotoOCR.jsx`, cioè i file su cui stanno lavorando gli altri. Durante quel
  giro `temaChiaviEsistenti` e `scalaTipografica` erano rossi su
  `ImportWizard.jsx`: rilanciati dopo, verdi. Erano un'istantanea presa mentre
  un altro agente stava scrivendo nello stesso file.

### Rimasto aperto (non mio)
1. `src/Dashboard.jsx` ha ancora un `window.confirm` (la domanda «sovrascrivo
   il ricettario?»), l'ultimo del prodotto.
2. **Il livello del riquadro di conferma.** `ConfirmModal` disegna a
   `z.modal + 10` = 210, e nel prodotto ci sono circa 33 contenitori che stanno
   sopra (undici a 1000, quindici a 9999, uno a 99999...). Io ho sistemato i due
   della mia pagina, ma chiunque usi `useConfirm` dentro uno degli altri avrà la
   domanda invisibile e un pulsante che sembra morto. Si risolve in una riga,
   in `ConfirmModal.jsx`, ma è un file che tocca 19 punti del prodotto e mentre
   lavoravo c'era un altro agente dentro: meglio farlo a parte, con la sua
   verifica.
