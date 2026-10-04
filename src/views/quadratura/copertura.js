// ── «Torna il conto?»: da dove vengono i numeri, e cosa manca ─────────────
//
// ANALISI_DESIGN.md, regola 3: prima del numero, una frase per fonte. Per la
// Quadratura le fonti sono l'inventario (quali giorni), la cassa (quali
// giorni: la differenza si calcola solo su quelli che hanno tutte e due), i
// prezzi dei formati (l'incasso dall'inventario è una stima), le caselle da
// sistemare, l'ingrosso tolto dal banco, lo scarto.
//
// Prima la pagina diceva queste cose in cinque riquadri colorati sparsi
// sotto le tessere (grigio, blu, ambra, ambra, rosso), e la riga «dopo il …
// non c'è niente» stava sopra, staccata.
import { conGiorno } from '../../lib/produzioneAnalisi'
import { euro } from '../../lib/formatoAnalisi'
import { kg, intero, quanti } from '../produzione/numeri'

/**
 * @param {object} p
 * @param {{ n: number }} p.giorni  i giorni registrati della settimana
 * @param {object} p.kpi  da `kpiQuadraturaSettimana`
 * @param {number|null} p.euroKg
 * @param {boolean} p.scartoRegistrato
 * @param {{ ultimo: string|null, spostata: boolean }|null} [p.apertura]
 * @param {{ cassa?: Function, caselle?: Function }} [p.azioni]
 */
export function vociCoperturaQuadratura({ giorni, kpi, euroKg, scartoRegistrato = true, apertura = null, azioni = {} }) {
  const voci = []
  if (!giorni?.n || !kpi) return voci

  // 1. L'inventario della settimana.
  const inventario = `${quanti(giorni.n, 'giorno', 'giorni')} su 7 con l'inventario`
  // La pagina si è spostata da sola: se è sull'ultima settimana intera lo
  // dice così (l'ultimo giorno può essere dopo), se no come prima.
  const settimanaIntera = apertura?.intera && apertura.lunedi && apertura.ultimo > piu(apertura.lunedi, 6)
  voci.push(apertura?.spostata && apertura.ultimo
    ? (settimanaIntera
      ? { id: 'inventario', stato: giorni.n === 7 ? 'ok' : 'parziale', breve: 'ultima settimana intera', testo: `L'ultimo giorno registrato è ${conGiorno('il', apertura.ultimo, { lunga: true })}: ti mostro l'ultima settimana intera (${inventario})` }
      : { id: 'inventario', stato: 'parziale', breve: `dati fino ${conGiorno('al', apertura.ultimo)}`, testo: `Dopo ${conGiorno('il', apertura.ultimo, { lunga: true })} non c'è niente di registrato: ti mostro l'ultima settimana con i dati (${inventario})` })
    : { id: 'inventario', stato: giorni.n === 7 ? 'ok' : 'parziale', breve: giorni.n === 7 ? undefined : `${giorni.n} giorni su 7`, testo: maiuscola(inventario) })

  // 2. La cassa: c'è, c'è in parte, non c'è.
  if (!kpi.cassaRegistrata) {
    voci.push({
      id: 'cassa', stato: 'manca', breve: 'cassa non registrata', sistemabile: true,
      testo: 'la cassa: nessuna chiusura in questa settimana, quindi la differenza non si calcola',
      azione: azioni.cassa ? { etichetta: 'Registra la cassa', onClick: azioni.cassa } : null,
    })
  } else if (kpi.giorniConfrontati < kpi.giorniInventario) {
    voci.push({
      id: 'cassa', stato: 'parziale', sistemabile: true,
      breve: `cassa in ${intero(kpi.giorniConfrontati)} ${kpi.giorniConfrontati === 1 ? 'giorno' : 'giorni'} su ${intero(kpi.giorniInventario)}`,
      testo: `cassa in ${intero(kpi.giorniConfrontati)} ${kpi.giorniConfrontati === 1 ? 'giorno' : 'giorni'} su ${intero(kpi.giorniInventario)} con l'inventario: il confronto è fatto solo su quelli`,
      azione: azioni.cassa ? { etichetta: 'Registra la cassa', onClick: azioni.cassa } : null,
    })
  } else {
    voci.push({ id: 'cassa', stato: 'ok', testo: `Cassa registrata in tutti i giorni con l'inventario (${intero(kpi.giorniCassa)})` })
  }

  // 3. L'incasso dall'inventario è una stima, e si dice con cosa.
  if (euroKg) {
    voci.push({ id: 'stima', stato: 'stima', breve: 'incasso stimato', testo: `incasso dall'inventario: chili venduti al banco per ${euro(euroKg, { decimali: 2 })}/kg, il prezzo medio dei formati` })
  }

  // 4. L'ingrosso non passa dalla cassa del banco.
  if (kpi.b2bKg > 0) {
    voci.push({ id: 'ingrosso', stato: 'ok', testo: `${kg(kpi.b2bKg)} kg venduti all'ingrosso tolti dal banco (${euro(kpi.ricaviB2b)} fatturati)` })
  }

  // 5. Le caselle dell'inventario da sistemare.
  const caselle = (kpi.celleNonQuadrate || 0) + (kpi.celleNonCalcolabili || 0)
  if (caselle > 0) {
    voci.push({
      id: 'caselle', stato: 'parziale', sistemabile: true, breve: `${quanti(caselle, 'casella', 'caselle')} da sistemare`,
      testo: `${quanti(caselle, 'casella', 'caselle')} da sistemare nell'inventario`,
      azione: azioni.caselle ? { etichetta: 'Vedi', onClick: azioni.caselle } : null,
    })
  }

  // 6. Lo scarto mai scritto finisce nel venduto, e quindi nell'incasso stimato.
  if (!scartoRegistrato) {
    voci.push({ id: 'scarto', stato: 'manca', breve: 'scarto mai scritto', testo: 'lo scarto, quindi quello che si butta è contato come venduto' })
  }
  return voci
}

const maiuscola = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t)
const piu = (iso, n) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
