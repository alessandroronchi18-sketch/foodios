// ── Il file Excel della pagina Produzione ─────────────────────────────────
//
// Una riga per gusto con gli stessi numeri della tabella, e la riga del
// totale. Le regole sono quelle della fase 1 (03/10/2026): un margine che non
// si sa resta vuoto (al commercialista arrivava «100,0» su ogni gusto), uno
// scarto mai scritto resta vuoto e l'intestazione lo dice.
import { loadXLSX } from '../../lib/xlsx'

const due = (n) => (n == null || !Number.isFinite(Number(n)) ? '' : Number(Number(n).toFixed(2)))
const uno = (n) => (n == null || !Number.isFinite(Number(n)) ? '' : Number(Number(n).toFixed(1)))
const zero = (n) => (n == null || !Number.isFinite(Number(n)) ? '' : Number(Number(n).toFixed(0)))

/** Le righe del foglio, senza scrivere niente: si prova da sola. */
export function righeEsportazione({ righe = [], totali, scartoRegistrato, andamento = null }) {
  const extra = (g) => andamento?.gusti?.[g] || {}
  const intestazione = [
    'Gusto', 'Prodotto kg', 'Venduto kg', 'Venduto su prodotto %', 'Giorni in vetrina',
    scartoRegistrato ? 'Scarto kg' : 'Scarto kg (non registrato)',
    'Ricavo/kg €', 'Ricavo €', 'Costo al kg €', 'Food cost €', 'Margine €', 'Margine %',
  ]
  const corpo = righe.map(r => [
    r.gusto, due(r.prodKg), due(r.vendKg), uno(extra(r.gusto).quotaVenduta), uno(extra(r.gusto).giorniVetrina),
    scartoRegistrato ? due(r.scartoKg) : '',
    due(r.ricavoKg), zero(r.ricavo), r.fcKg > 0 ? due(r.fcKg) : '', zero(r.fc),
    r.margine == null ? '' : zero(r.margine), r.margPct == null ? '' : uno(r.margPct),
  ])
  const totale = [
    'Totale', due(totali.prod), due(totali.vend), totali.prod > 0 ? uno((totali.vend / totali.prod) * 100) : '', '',
    scartoRegistrato ? due(totali.scarto) : '',
    '', zero(totali.ricavo), '', zero(totali.fc),
    totali.margine == null ? '' : zero(totali.margine), totali.margPct == null ? '' : uno(totali.margPct),
  ]
  return [intestazione, ...corpo, totale]
}

export async function esportaXlsx({ dateFrom, dateTo, ...dati }) {
  try {
    const XLSX = await loadXLSX()
    const ws = XLSX.utils.aoa_to_sheet(righeEsportazione(dati))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Produzione')
    const periodo = `${dateFrom || 'inizio'}_${dateTo || 'fine'}`.replace(/[^0-9_-]/g, '')
    XLSX.writeFile(wb, `produzione-${periodo}.xlsx`)
    return true
  } catch (e) {
    console.error('Export xlsx fallito:', e)
    return false
  }
}
