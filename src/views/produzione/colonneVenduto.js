// ── Le colonne del grafico del venduto ────────────────────────────────────
//
// Il venduto per settimana (o per giorno, o per mese) viene da
// `serieVenduto` (lib/produzioneQuadro, il motore sede per sede). Qui si
// decide solo come si disegna: la chiave, l'etichetta, e se la colonna è
// INTERA.
//
// Una settimana tagliata dal periodo (il periodo parte di mercoledì) o dalla
// registrazione (i dati si fermano il 31/08, lunedì) è più bassa delle altre
// senza che si sia venduto di meno: in mezzo alle intere sembrava un calo.
// Quelle colonne vanno in un'altra serie, impilata sulla stessa colonna, che
// si colora in ambra («dato incompleto», ANALISI_DESIGN.md §3). Due serie e
// non una con i colori per colonna: il grafico riceve solo dati, e la prova
// in settimaneACavalloDAnno legge proprio quelli.
//
// Un giorno di chiusura dentro la settimana NON la rende incompleta: quel
// giorno non si è venduto davvero.
import { serieVenduto } from '../../lib/produzioneQuadro'
import { dataBreve, nomeMese } from '../../lib/formatoAnalisi'

const piu = (iso, n) => {
  const t = new Date(`${iso}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
const lunediDi = (iso) => {
  const g = new Date(`${iso}T12:00:00Z`).getUTCDay() || 7
  return piu(iso, 1 - g)
}
const fineMese = (chiave) => {
  const [y, m] = chiave.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10)
}

/** Primo e ultimo giorno di calendario che la colonna rappresenta. */
export function estremiColonna(chiave, primo, passo) {
  if (passo === 'giorno') return { dal: chiave, al: chiave }
  if (passo === 'mese') return { dal: `${chiave}-01`, al: fineMese(chiave) }
  const lun = lunediDi(primo)
  return { dal: lun, al: piu(lun, 6) }
}

/**
 * @param {Array} righe  righe di inventario_produzione (anche di più sedi)
 * @param {object} o
 * @param {string} o.da, o.a  il periodo guardato
 * @param {'giorno'|'settimana'|'mese'} o.passo
 * @param {{ primo: string|null, ultimo: string|null }} o.registrati  primo e ultimo giorno registrato
 * @returns {{ key, label, dal, al, prod, vend, vendParziale, intera, giorni, daSistemare }[]}
 *   chili; `vend` per le colonne intere, `vendParziale` per le altre (una
 *   delle due è sempre 0).
 */
export function colonneVenduto(righe, { da = null, a = null, passo = 'settimana', registrati = {} } = {}) {
  const serie = serieVenduto(righe, { da, a, passo })
  // La finestra in cui una colonna può essere intera: dentro il periodo E
  // dentro i giorni registrati.
  const inizio = [da, registrati.primo].filter(Boolean).sort().pop() || null
  const fine = [a, registrati.ultimo].filter(Boolean).sort()[0] || null
  const anni = new Set(serie.map(s => s.chiave.slice(0, 4)))
  return serie.map(s => {
    const { dal, al } = estremiColonna(s.chiave, s.primo, passo)
    const intera = passo === 'giorno' || ((!inizio || dal >= inizio) && (!fine || al <= fine))
    const vend = s.vendutoG / 1000
    const label = passo === 'giorno' ? dataBreve(s.chiave)
      : passo === 'mese' ? `${nomeMese(s.chiave, { anno: false }).slice(0, 3)}${anni.size > 1 ? ` ${s.chiave.slice(2, 4)}` : ''}`
        : dataBreve(dal)
    return {
      key: s.chiave, label, dal, al,
      prod: s.prodottoG / 1000,
      vend: intera ? vend : 0,
      vendParziale: intera ? 0 : vend,
      intera, giorni: s.giorni, daSistemare: s.daSistemare,
    }
  })
}

const NOME = { giorno: 'Il giorno', settimana: 'La settimana', mese: 'Il mese' }
const kgT = (n) => `${new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: n >= 100 ? 0 : 1 }).format(n)} kg`
const nomeColonna = (c, passo) => (passo === 'mese' ? nomeMese(c.key, { anno: false })
  : passo === 'giorno' ? `del ${dataBreve(c.key)}` : `del ${dataBreve(c.dal)}`)

/**
 * Il titolo del grafico: la conclusione, sulle sole colonne intere. «La
 * settimana migliore è quella del 13/07: 1.654 kg, contro i 900 kg di quella
 * del 10/08».
 */
export function titoloVenduto(colonne, passo = 'settimana') {
  const intere = colonne.filter(c => c.intera && c.vend > 0)
  if (!intere.length) {
    if (!colonne.length || colonne.every(c => c.intera)) return 'Niente venduto nel periodo'
    return `${passo === 'mese' ? 'Nessun mese intero' : 'Nessuna settimana intera'} nel periodo: le colonne sono parziali`
  }
  const max = intere.reduce((x, y) => (y.vend > x.vend ? y : x))
  const min = intere.reduce((x, y) => (y.vend < x.vend ? y : x))
  const art = passo === 'settimana' ? 'quella' : 'quello'
  if (intere.length === 1 || max === min) return `${NOME[passo]} ${nomeColonna(max, passo)}: ${kgT(max.vend)} venduti`
  if (passo === 'mese') return `Il mese migliore è ${nomeColonna(max, passo)}: ${kgT(max.vend)}, contro i ${kgT(min.vend)} di ${nomeColonna(min, passo)}`
  return `${NOME[passo]} migliore è ${art} ${nomeColonna(max, passo)}: ${kgT(max.vend)}, contro i ${kgT(min.vend)} di ${art} ${nomeColonna(min, passo)}`
}
