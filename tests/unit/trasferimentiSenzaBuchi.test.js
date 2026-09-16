// I trasferimenti fra sedi: tre buchi che toccavano il magazzino.
//
// Trovati il 16/09/2026 scrivendo i test di `TrasferimentiView`. Hanno in
// comune una cosa: il magazzino veniva toccato e poi qualcosa non andava a
// buon fine, e nessuno rimetteva le cose a posto.
//
// 1. **I comandi che il dipendente non può usare erano lì lo stesso.** Le
//    guardie `!soloRicezione` c'erano su «Annulla» e «Ripeti» e mancavano su
//    «Invia», «Elimina bozza» ed «Elimina». Il database glieli rifiuta, quindi
//    nel migliore dei casi premeva per niente; nel peggiore — «Invia» su una
//    materia prima — il magazzino veniva scalato PRIMA della scrittura che
//    sarebbe stata rifiutata, e il magazzino è una chiave che il dipendente
//    può scrivere davvero.
// 2. **Annullare senza rimettere a posto.** `azAnnulla` rimette la merce nella
//    sede di partenza e poi aggiorna la riga; se la riga non si aggiorna
//    (qualcun altro l'ha già ricevuta) lanciava l'errore e la merce restava
//    rientrata: contata due volte. Il percorso della ricezione questa rimessa
//    a posto ce l'aveva già.
// 3. **«Invia subito» su un semilavorato diceva una bugia.** L'invio
//    automatico partiva solo per `tipo === 'prodotto'`, quindi per un
//    semilavorato non partiva niente — restava una bozza — e il messaggio
//    diceva «Trasferimento inviato». Chi lo leggeva andava a cercare la merce
//    dall'altra parte.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src', 'components', 'TrasferimentiView.jsx'), 'utf8')

// I commenti raccontano i difetti, e citano per forza le cose vietate («era
// `window.confirm`…»). Un controllo che cerca una parola nel codice deve
// guardare il codice, non il racconto.
const senzaCommenti = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(r => r.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n')

describe('i comandi che il dipendente non può usare non si vedono', () => {
  it('«Invia» ed «Elimina bozza» hanno la guardia', () => {
    expect(SRC).toMatch(/\{t\.stato === 'bozza' && !soloRicezione && \(/)
  })

  it('e anche «Elimina» su un trasferimento annullato', () => {
    expect(SRC).toMatch(/\{t\.stato === 'annullato' && !soloRicezione && \(/)
  })

  it('tutti i comandi che scrivono passano da una guardia', () => {
    // Il conto: ogni azione che modifica qualcosa deve stare dentro un blocco
    // con `!soloRicezione`. L'unica che il dipendente DEVE poter fare è
    // confermare quello che è arrivato.
    const guardie = (SRC.match(/!soloRicezione/g) || []).length
    expect(guardie).toBeGreaterThanOrEqual(6)
  })
})

describe('annullare un trasferimento', () => {
  const fn = SRC.slice(SRC.indexOf('async function azAnnulla'), SRC.indexOf('async function azElimina'))

  it('se la riga non si aggiorna, la merce rientrata viene ritolta', () => {
    expect(fn).toMatch(/if \(errAnn \|\| !righeTocche \|\| righeTocche\.length === 0\)/)
    expect(fn).toMatch(/await scaricoMP\(\{ orgId, sedeId: t\.sede_da/)
  })

  it('e se non si riesce nemmeno a ritoglierla, lo dice invece di tacere', () => {
    // Un magazzino sbagliato in silenzio è peggio di un errore: nessuno lo
    // cerca finché non manca la merce.
    expect(fn).toMatch(/non sono riuscito a ritoglierlo\. Controlla la giacenza a mano/)
  })

  it('l\'errore arriva comunque a chi ha premuto', () => {
    expect(fn).toMatch(/throw errAnn \|\| new Error\('Annullamento non registrato'\)/)
  })
})

describe('«Invia subito»', () => {
  it('parte anche per i semilavorati, non solo per i prodotti finiti', () => {
    expect(SRC).toMatch(/autoInvia: autoInvia && form\.tipo !== 'materia_prima'/)
    expect(SRC).not.toMatch(/autoInvia: autoInvia && form\.tipo === 'prodotto'/)
  })

  it('la materia prima resta fuori: è già stata scalata a mano qui sopra', () => {
    const fn = SRC.slice(SRC.indexOf('async function salvaBozza'), SRC.indexOf('async function azInvia'))
    expect(fn).toMatch(/if \(autoInvia && form\.tipo === 'materia_prima'\)/)
    expect(fn).toMatch(/await scaricoMP\(/)
  })
})

describe('il nome di un template si chiede col programma, non col browser', () => {
  it('niente `prompt()`', () => {
    // `prompt()` su iOS arriva senza il nome dell'applicazione, non si legge
    // in due righe sul telefono, e non assomiglia a nessun'altra domanda che
    // questo programma fa. CLAUDE.md lo vieta nei flussi utente.
    expect(senzaCommenti(SRC)).not.toMatch(/[^.\w]prompt\(/)
  })

  it('c\'è una finestrella con il suo campo', () => {
    expect(SRC).toMatch(/const \[nomeTemplate, setNomeTemplate\] = useState\(null\)/)
    expect(SRC).toMatch(/aria-label="Nome del template"/)
    // Invio conferma, Esc chiude: come tutte le altre finestre del programma.
    expect(SRC).toMatch(/if \(e\.key === 'Enter' && nomeTemplate\.trim\(\)\)/)
    expect(SRC).toMatch(/if \(e\.key === 'Escape'\) setNomeTemplate\(null\)/)
  })
})

describe('e nei fornitori le domande sono quelle del programma', () => {
  const F = readFileSync(join(RADICE, 'src', 'components', 'Fornitori.jsx'), 'utf8')

  it('niente `window.confirm`', () => {
    expect(senzaCommenti(F)).not.toMatch(/window\.confirm/)
  })

  it('il totale di una riga d\'ordine è arrotondato come quello dell\'ordine', () => {
    // 12,5 × 9,2 finiva nel database come 114,99999999999999 sulla riga e 115
    // sull'ordine: due numeri diversi per la stessa cosa.
    expect(F).toMatch(/totale_riga: parseFloat\(\(\(parseFloat\(r\.quantita\) \|\| 0\) \* \(parseFloat\(r\.prezzo_unitario\) \|\| 0\)\)\.toFixed\(2\)\)/)
  })
})
