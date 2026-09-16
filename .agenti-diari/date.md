# Diario agente DATE — audit Foodos 16/09/2026

## Mandato
La famiglia di difetti più ostinata: la data calcolata in UTC invece che
nell'ora locale italiana. Uscita cinque volte, corretta ogni volta solo dove
si vedeva.

## Piano (scritto prima di cominciare)
1. Leggere `dateLocal.js`, `periodoAnalisi.js`, `vitest.config.js` e
   `fusoOrarioDeiTest.test.js` per capire la forma della famiglia. [fatto]
2. Inventario: ogni `new Date(` su stringa, ogni `toISOString`, ogni
   `getTime()`, ogni `gte`/`lte`, nei MIEI file. Poi giudizio uno per uno.
3. Ora legale: il 25/10/2026 l'Italia passa da +2 a +1. Verificare le
   finestre che attraversano quel giorno (30 giorni, periodo precedente).
4. Cercare date del database finite sotto gli occhi del titolare.
5. Correzioni + tre test per famiglia (riproduce / correzione / intorno).
6. Verifica con TZ=Europe/Rome, UTC, Pacific/Auckland, America/Los_Angeles.

## Stato
- [x] Letto REGOLE.md, CLAUDE.md, dateLocal.js, periodoAnalisi.js
- [x] Letto vitest.config.js e fusoOrarioDeiTest.test.js (le due correzioni di oggi)
- [ ] Inventario dei punti data nei miei file
- [ ] Giudizio punto per punto
- [ ] Correzioni
- [ ] Test

## Nota sui file assegnati
`src/views/StoricoView.jsx`, `src/views/PrevisioneView.jsx` e
`src/lib/previsione*.js` non esistono con quel nome: cerco i veri.

## Prossimo passo
Inventario dei punti data.

---

## 25% — inventario fatto (16/09/2026)

### Difetti trovati (da correggere)
| # | dove | cosa vede il titolare |
|---|---|---|
| D1 | `RegistroAttivita.jsx:336` `(r.created_at\|\|'').slice(0,10)` | il registro raggruppa per giorno **UTC**: le azioni fra mezzanotte e le 02:00 finiscono sotto l'intestazione di ieri |
| D2 | `RegistroAttivita.jsx:74-82` `fmtDayHeader` con `toISOString()` | «Oggi»/«Ieri» calcolati in UTC: ieri sera etichettata «Oggi» |
| D3 | `RegistroAttivita.jsx:315` | «Azioni oggi» conta il giorno UTC contro `today` locale: sottoconta |
| D4 | `RegistroAttivita.jsx:187` preset periodo `toISOString().slice(0,10)` | «Ultimi 30 giorni» parte da un giorno prima |
| D5 | `RegistroAttivita.jsx:207-208,231-232` `gte('created_at', '<g>T00:00:00')` | la finestra verso il DB è 02:00→01:59: un'ora e mezza di lavoro notturno nel giorno sbagliato |
| D6 | `ForecastView.jsx:80` `.gte('data', oggiUTC)` | fra mezzanotte e le due la previsione di ieri torna in cima |
| D7 | `ForecastView.jsx:52-53` finestra 60 giorni mista | la diagnosi «pochi giorni» conta 59 o 60 secondo l'ora |
| D8 | `StoricoProduzioneView.jsx:124-125` | il periodo di default parte **sempre** un giorno prima del dovuto |
| D9 | `periodCompare.js:108,130` `end-start` in millisecondi | ora legale: il periodo precedente di «ultimi 30 giorni» a cavallo del 25/10 ne prende 31 |
| D10 | `periodCompare.js:160` `new Date('AAAA-MM-GG')` in `inPeriod` | mezzanotte UTC contro mezzanotte locale |
| D11 | crons: `new Date().toISOString().slice(0,10)` | oggi **non** è rotto (schedule 07:00/20:00 UTC) ma dipende in silenzio dall'orario dello schedule |

### Giudicati CORRETTI (con la ragione)
- `ChiusuraView.jsx`: usa `todayLocal()` e ovunque il pattern `+'T12:00'`. `salvatoAt: new Date().toISOString()` è un **istante**, UTC giusto.
- `CalendarioOperativo.jsx`: `toISO()` è un formattatore locale, la griglia è costruita con `new Date(anno, mese, g)`.
- `periodoAnalisi.js:giorniDelPeriodo`: `Math.round` sui giorni — già a prova di ora legale (da verificare col test).
- cron `expires_at`/`sent_email_at`/`started_at`/`triggered_at`: istanti assoluti, UTC giusto.

## Prossimo passo
Scrivere gli helper nuovi in `dateLocal.js` e `periodoAnalisi.js`, poi correggere D1-D11.

---

## 50% — ripresa dopo interruzione (16/09/2026)

### D1-D11: CHIUSI, verificati riga per riga
Il lavoro era già stato fatto prima dell'interruzione, il diario si era
fermato al 25%. Verifica fatta adesso, una per una:

- D1 `RegistroAttivita.jsx` → `giornoDiTimestamp(r.created_at)` [ok]
- D2 → `nomeDelGiorno()` da `periodoAnalisi` [ok]
- D3 → `giornoDiTimestamp` contro `today` locale [ok]
- D4 → `giorniFaLocal(preset.giorni)` [ok]
- D5 → `inizioGiornoLocale` / `fineGiornoLocale` con `.lt()` [ok]
- D6 `ForecastView.jsx:96` → `.gte('data', todayLocal())` [ok]
- D7 → `giorniFaLocal(59)` + confronto fra stringhe [ok]
- D8 `StoricoProduzioneView.jsx:136` → `formatLocalDate(new Date(y, m-2, d))` [ok]
- D9 `periodCompare.js:giorniFra` → `Math.round(ms/86400000)` [ok]
- D10 `periodCompare.js:inPeriod` → `'<giorno>T12:00:00'` [ok]
- D11 crons → esiste `giornoItaliano()` in `dateLocal.js` (Intl su Europe/Rome)

Baseline verde: `dateLocal`, `periodCompare`, `periodoAnalisi`,
`dateLocaliNonUTC`, `fusoOrarioDeiTest` passano con TZ=Europe/Rome.

### Il censimento del sotto-agente NON è su disco
`.agenti-diari/censimento-date.md` non esiste (cartella verificata). Riparto
dai file:riga che mi sono stati dettati, e rifaccio la spazzata da solo sui
miei file.

## Prossimo passo
Fascia 1 — i difetti che spostano un incasso o una data fiscale.
