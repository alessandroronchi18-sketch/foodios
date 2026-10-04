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
export function colonneVenduto(righe, { da = null, a = null, passo = 'settimana', registrati = {}, finoA = null } = {}) {
  const serie = serieVenduto(righe, { da, a, passo })
  // La finestra in cui una colonna può essere intera: dentro il periodo E
  // dentro i giorni registrati.
  const inizio = [da, registrati.primo].filter(Boolean).sort().pop() || null
  const fine = [a, registrati.ultimo].filter(Boolean).sort()[0] || null
  const anni = new Set(serie.map(s => s.chiave.slice(0, 4)))
  const colonne = serie.map(s => {
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
      intera, vuota: false, giorni: s.giorni, daSistemare: s.daSistemare,
    }
  })
  // Dopo l'ultimo giorno registrato, fino a `finoA` (di solito oggi, o la
  // fine del periodo se viene prima), il periodo continua ma non c'è niente:
  // quelle colonne ci sono, vuote e segnate (`vuota`), invece di far finire il
  // grafico prima del periodo. Un mese senza dati sembrava un calo; così si
  // vede che è un buco (ANALISI_DESIGN.md §6: l'incompleto è una zona).
  const ultimo = registrati.ultimo
  if (ultimo && finoA && finoA > ultimo) {
    const presenti = new Set(colonne.map(c => c.key))
    const chiaveDi = (d) => (passo === 'giorno' ? d : passo === 'mese' ? d.slice(0, 7) : settimanaChiave(d))
    for (let d = piu(ultimo, 1); d <= finoA; d = piu(d, 1)) {
      const k = chiaveDi(d)
      if (presenti.has(k)) continue
      presenti.add(k)
      const { dal, al } = estremiColonna(k, d, passo)
      colonne.push({
        key: k, label: passo === 'giorno' ? dataBreve(k) : passo === 'mese' ? `${nomeMese(k, { anno: false }).slice(0, 3)}${anni.size > 1 ? ` ${k.slice(2, 4)}` : ''}` : dataBreve(dal),
        dal, al, prod: 0, vend: 0, vendParziale: 0, intera: false, vuota: true, giorni: 0, daSistemare: 0,
      })
    }
  }
  return colonne
}

// La settimana ISO, «2026-W36», con lo stesso conto di produzioneQuadro.
function settimanaChiave(iso) {
  const tmp = new Date(`${iso}T12:00:00Z`)
  const dow = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dow)
  const ys = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const n = Math.ceil((((tmp - ys) / 86400000) + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(n).padStart(2, '0')}`
}

const kgT = (n) => `${new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: n >= 100 ? 0 : 1 }).format(n)} kg`
const nomeColonna = (c, passo) => (passo === 'mese' ? nomeMese(c.key, { anno: false })
  : passo === 'giorno' ? `il ${dataBreve(c.key)}` : `quella del ${dataBreve(c.dal)}`)
const maiuscolaIniziale = (t) => t[0].toUpperCase() + t.slice(1)
const PIU_BASSA = { giorno: 'Il giorno più basso', settimana: 'La più bassa', mese: 'Il più basso' }
const MIGLIORE = { giorno: 'Il giorno migliore è', settimana: 'La settimana migliore è', mese: 'Il mese migliore è' }

/**
 * La conclusione del grafico, sulle sole colonne intere: il titolo (dieci
 * parole al massimo), il dettaglio per il sottotitolo, e la colonna di cui
 * parla il titolo, che è l'unica disegnata scura (ANALISI_DESIGN.md §6: «se
 * il titolo parla del burro, la barra del burro è l'unica scura»).
 *
 * @returns {{ titolo: string, dettaglio: string, forte: string|null }}
 */
export function conclusioneVenduto(tutte, passo = 'settimana') {
  // Le colonne vuote (dopo l'ultimo giorno registrato) non contano.
  const colonne = tutte.filter(c => !c.vuota)
  const intere = colonne.filter(c => c.intera && c.vend > 0)
  if (!intere.length) {
    if (!colonne.length || colonne.every(c => c.intera)) return { titolo: 'Niente venduto nel periodo', dettaglio: '', forte: null }
    return { titolo: passo === 'mese' ? 'Nessun mese intero nel periodo' : 'Nessuna settimana intera nel periodo', dettaglio: 'Le colonne sono tutte parziali.', forte: null }
  }
  const max = intere.reduce((x, y) => (y.vend > x.vend ? y : x))
  const min = intere.reduce((x, y) => (y.vend < x.vend ? y : x))
  // Con una colonna intera sola non c'è una «migliore».
  if (intere.length === 1) {
    const sola = passo === 'mese' ? maiuscolaIniziale(nomeMese(max.key, { anno: false }))
      : passo === 'giorno' ? `Il ${dataBreve(max.key)}` : `La settimana del ${dataBreve(max.dal)}`
    return { titolo: `${sola}: ${kgT(max.vend)} venduti`, dettaglio: '', forte: max.key }
  }
  const nome = nomeColonna(max, passo)
  const titolo = `${MIGLIORE[passo]} ${nome}: ${kgT(max.vend)}`
  const dettaglio = max !== min ? `${PIU_BASSA[passo]}, ${nomeColonna(min, passo)}: ${kgT(min.vend)}.` : ''
  return { titolo, dettaglio, forte: max.key }
}

/** Il solo titolo (per chi non disegna). */
export function titoloVenduto(colonne, passo = 'settimana') {
  return conclusioneVenduto(colonne, passo).titolo
}
