// @vitest-environment happy-dom
//
// Scadenziario: su 211 fatture scadute, "Segna pagata" non funzionava su 151.
//
// Quattro componenti (Gruppo, RigaTabella, CardMobile, ActionsCell) erano
// definiti DENTRO Scadenzario e usati come JSX. React confronta l'identità del
// tipo di componente: essendo ridefiniti a ogni render del padre, il tipo
// cambia e React smonta e rimonta tutto il sottoalbero invece di aggiornarlo.
//
// Due danni concreti, misurati:
//   - lo stato "Mostra tutte (211)" vive dentro Gruppo. Al primo clic su
//     "Segna pagata" il gruppo si rimontava, shownAll tornava false, la lista
//     tornava a 60 righe e la riga cliccata spariva senza aprire il popup.
//     Mara ha 211 fatture scadute: 151 non si potevano pagare per niente.
//   - l'input "Importo" del popup si smontava a ogni carattere digitato
//     (lo stato è del padre): per scrivere 1.250,00 servivano sette clic, col
//     rischio di registrare un acconto da 1,00 € su una fattura da 1.250.
//
// Il fix era già noto e applicato SOLO a RollupView, con un commento che lo
// spiega (riga 1619): chiamare il componente come funzione invece che come JSX.
// Qui si applica ai quattro rimasti, e lo stato di Gruppo sale nel padre —
// perché una funzione chiamata dentro un .map() non può avere hook propri.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const src = readFileSync(join(RADICE, 'src', 'components', 'Scadenzario.jsx'), 'utf8')

describe('Scadenziario — le righe non si rimontano a ogni render', () => {
  it('nessuno dei quattro componenti interni è usato come JSX', () => {
    for (const nome of ['Gruppo', 'RigaTabella', 'CardMobile', 'ActionsCell']) {
      const usiJsx = src.match(new RegExp(`<${nome}[\\s/>]`, 'g')) || []
      expect(usiJsx, `<${nome}/> usato come JSX: si rimonta a ogni render`).toEqual([])
    }
  })

  it('sono chiamati come funzioni, come già si faceva per RollupView', () => {
    expect(src).toMatch(/Gruppo\(\{ keyU: k, items \}\)/)
    expect(src).toMatch(/RigaTabella\(\{ f, cfg, i, last:/)
    expect(src).toMatch(/CardMobile\(\{ f, cfg \}\)/)
    expect(src).toMatch(/ActionsCell\(\{ f \}\)/)
    // Quello che era già corretto deve restarlo.
    expect(src).toMatch(/RollupView\(\)/)
  })

  it('le liste conservano la key sul nodo restituito', () => {
    // Chiamando la funzione, la key non arriva più dalle prop JSX: senza key
    // React perde l'identità delle righe, cioè il problema di partenza.
    expect(src).toMatch(/<React\.Fragment key=\{f\.id\}>/)
    expect(src).toMatch(/<div key=\{f\.id\} style=\{\{\s*\n\s*background: T\.bgCard,/)
    expect(src).toMatch(/<section key=\{keyU\} style=\{\{/)
  })

  it('Gruppo non chiama hook: sarebbero hook del padre dentro un .map()', () => {
    const i = src.indexOf('function Gruppo({ keyU, items })')
    expect(i).toBeGreaterThan(-1)
    // Fino alla fine della funzione (la successiva dichiarazione al primo livello).
    const fine = src.indexOf('\n  function ', i + 10)
    const corpo = src.slice(i, fine > 0 ? fine : i + 6000)
    expect(corpo).not.toMatch(/\buseState\(/)
    expect(corpo).not.toMatch(/\buseEffect\(/)
    expect(corpo).not.toMatch(/\buseMemo\(/)
  })

  it('lo stato "mostra tutte" vive nel padre, così non si azzera', () => {
    expect(src).toMatch(/const \[gruppiEspansi, setGruppiEspansi\] = useState\(\{\}\)/)
    expect(src).toMatch(/const shownAll = !!gruppiEspansi\[keyU\]/)
  })
})

// ── Gli altri difetti dello Scadenziario ─────────────────────────────────────

describe('Scadenziario — numeri, date e testi', () => {
  it('la ricerca senza risultati non lascia la pagina bianca', () => {
    // I contatori non applicavano matchSearch: cercando un fornitore che non
    // esiste, le righe diventavano zero ma `n` restava > 0, quindi il messaggio
    // "Nessuna fattura per questo filtro" non compariva mai e in cima si
    // leggeva ancora "70 fatture · 9.415,00 €".
    expect(src).toMatch(/gruppiVisibili\.flatMap\(k => gruppi\[k\] \|\| \[\]\)\.filter\(matchSearch\)/)
  })

  it('il totale dei filtri usa il residuo, come i KPI in cima', () => {
    // Sommava `f.totale` (il lordo) mentre le card KPI usano il residuo netto
    // di acconti e note di credito: due numeri diversi per la stessa cosa
    // nella stessa schermata.
    const i = src.indexOf('const totaliFiltrati = useMemo')
    const fn = src.slice(i, i + 700)
    expect(fn).toMatch(/Number\(f\.residuo\)/)
    expect(fn).not.toMatch(/s \+ \(f\.totale \|\| 0\)/)
  })

  it('matchSearch è definito prima di chi lo usa', () => {
    // Un useMemo esegue subito al render: con la definizione più sotto sarebbe
    // un ReferenceError alla prima apertura della pagina.
    expect(src.indexOf('const matchSearch =')).toBeLessThan(src.indexOf('const totaliFiltrati ='))
  })

  it('la data di pagamento proposta è quella locale, non UTC', () => {
    // new Date().toISOString() dà la data UTC: in Italia fra mezzanotte e le 2
    // proponeva IERI. Nel file c'è già un commento che spiega perché non si fa.
    expect(src).toMatch(/setDataPag\(todayLocal\(\)\)/)
    expect(src).not.toMatch(/setDataPag\(new Date\(\)\.toISOString\(\)/)
  })

  it('non chiama "fatturato" la spesa verso i fornitori', () => {
    // Diceva "82.676 € fatturato registrato" sulle fatture dei FORNITORI, cioè
    // su quello che l'azienda spende: letto come fatturato dice l'opposto della
    // verità sul suo stato di salute.
    expect(src).not.toMatch(/fatturato registrato/)
    expect(src).toMatch(/di spesa registrata/)
  })

  it('dichiara quando la scadenza è calcolata e non presa dal documento', () => {
    // data_scadenza è vuota su 418 fatture su 418: la data mostrata è sempre
    // data_fattura + 30 giorni, ma veniva scritta come un fatto. 106 di quelle
    // date cadono di sabato o domenica.
    expect(src).toMatch(/dueStimata:/)
    expect(src).toMatch(/scadenza calcolata/)
    expect(src).toMatch(/Data calcolata: data fattura \+ 30 giorni/)
  })

  it('si possono segnare pagate più fatture in una volta', () => {
    // Su 211 fatture scadute erano 211 clic, ognuno col popup da confermare.
    expect(src).toMatch(/async function segnaPagateInBlocco/)
    // Con una conferma che dice quante e quanto, e una sola data.
    expect(src).toMatch(/Segno pagate \{daFare\.length\}/)
    expect(src).toMatch(/usa il giorno in cui è partito il bonifico/)
    // E se qualcuna non passa, lo dice invece di dichiarare tutto fatto.
    expect(src).toMatch(/Segnate \$\{fatte\.length\} di \$\{daFare\.length\}/)
  })
})

describe('PDF dello scadenziario — tre colonne erano vuote su tutte le righe', () => {
  const pdf = readFileSync(join(RADICE, 'src', 'lib', 'exportPDF.js'), 'utf8')

  it('usa numero_rif, che è la colonna vera', () => {
    // `numero_fattura` non esiste: il numero era "-" su 217 righe su 217, e un
    // documento per il commercialista senza il numero non serve a niente.
    expect(pdf).not.toMatch(/f\.numero_fattura/)
    expect(pdf).toMatch(/f\.numero_rif \|\| '-'/)
  })

  it('deriva la scadenza e marca quelle calcolate', () => {
    expect(pdf).toMatch(/const sc = scadenzaFattura\(f\)/)
    expect(pdf).toMatch(/sc\.stimata \? ' \*' : ''/)
    // Con la legenda, altrimenti l'asterisco non si capisce.
    expect(pdf).toMatch(/Scadenza calcolata come data fattura \+ 30 giorni/)
  })

  it('scrive "n.d." dove imponibile e imposta non ci sono', () => {
    // Sono vuoti su 198 righe su 217 (gli import valorizzano solo il totale):
    // "0,00 €" faceva sembrare che l'IVA fosse zero.
    expect(pdf).toMatch(/f\.imponibile == null \? 'n\.d\.'/)
    expect(pdf).toMatch(/f\.imposta == null \? 'n\.d\.'/)
  })
})
