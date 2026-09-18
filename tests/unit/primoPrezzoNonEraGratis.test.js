// Il primo prezzo di una materia prima non vuol dire che prima era gratis.
//
// ═══ Il difetto, trovato il 18/09/2026 ════════════════════════════════════
//
// Dal 18/09/2026 una materia prima si può creare SENZA prezzo: nasce con
// `costoKg: null`, che vuol dire «non lo so», e resta nell'elenco dei buchi
// dichiarati finché qualcuno non ci scrive sopra un numero.
//
// Quando glielo si scrive, il prodotto mette una riga nello storico dei
// prezzi. Quella riga diceva `prezzoVecchio: 0`, e lo diceva per la trappola
// più vecchia del prodotto: `Number(null)` fa `0`, e `Number.isFinite(0)` è
// vero, quindi uno zero scritto per sbaglio è indistinguibile da uno zero
// scritto apposta.
//
// Non era un difetto di schermata. `getPrezzoStoricoKg` (`src/lib/foodcost.js`)
// legge proprio `prezzoVecchio` per tutte le date PRECEDENTI alla prima
// modifica — è la sua unica fonte, lì — e il commento accanto dice a chiare
// lettere che uno zero lo tratta come un prezzo legittimo («ingrediente
// gratis/omaggio»). Risultato: il food cost storico di una produzione di un
// mese fa contava quell'ingrediente a **zero euro**, cioè regalato.
//
// Con `null` la funzione risponde `null`, e chi la chiama ricade sul prezzo
// di adesso — che è la cosa meno sbagliata che si possa dire quando il prezzo
// di allora non si sa.
//
// Toccati: `Dashboard.jsx` — `handleUpdatePrezzoIng` (scrive il prezzo di una
// materia prima che non ne aveva) e `handleCreaMateriaPrima` (la crea già con
// il suo prezzo).

import { describe, it, expect } from 'vitest'
import { getPrezzoStoricoKg } from '../../src/lib/foodcost'

const IERI = '2026-09-17T10:00:00.000Z'
const MESE_SCORSO = '2026-08-15T10:00:00.000Z'

describe('lo storico dei prezzi non inventa uno zero', () => {
  it('IL DIFETTO: con prezzoVecchio a 0 il passato risultava gratis', () => {
    // Com'era scritta la riga prima della correzione.
    const log = [{
      id: 'lp-1', data: IERI, decorre_da: IERI,
      ingrediente: 'pasta di pistacchio',
      prezzoVecchio: 0, prezzoNuovo: 65,
    }]
    // Il mese scorso: prima della riga, quindi si legge `prezzoVecchio`.
    expect(getPrezzoStoricoKg(log, 'pasta di pistacchio', MESE_SCORSO)).toBe(0)
  })

  it('LA CORREZIONE: con null il passato dice «non lo so», non «gratis»', () => {
    const log = [{
      id: 'lp-1', data: IERI, decorre_da: IERI,
      ingrediente: 'pasta di pistacchio',
      prezzoVecchio: null, prezzoNuovo: 65,
    }]
    // `null` = non lo so: chi chiama ricade sul prezzo corrente.
    expect(getPrezzoStoricoKg(log, 'pasta di pistacchio', MESE_SCORSO)).toBeNull()
  })

  it('da quando la riga vale, il prezzo è quello nuovo', () => {
    const log = [{
      id: 'lp-1', data: IERI, decorre_da: IERI,
      ingrediente: 'pasta di pistacchio',
      prezzoVecchio: null, prezzoNuovo: 65,
    }]
    expect(getPrezzoStoricoKg(log, 'pasta di pistacchio', '2026-09-18T09:00:00.000Z')).toBe(65)
  })

  it('INTORNO: uno zero VOLUTO resta uno zero', () => {
    // La materia prima regalata dal fornitore, quella dell'orto, lo scarto
    // recuperato: sono dati, non buchi. Se il prezzo di prima era davvero 0,
    // il passato deve continuare a dire 0 — se no la correzione avrebbe solo
    // spostato la bugia dall'altra parte.
    const log = [{
      id: 'lp-1', data: IERI, decorre_da: IERI,
      ingrediente: 'menta dell orto',
      prezzoVecchio: 0, prezzoNuovo: 4,
    }]
    expect(getPrezzoStoricoKg(log, 'menta dell orto', MESE_SCORSO)).toBe(0)
  })

  it('INTORNO: due modifiche di fila, si legge quella giusta', () => {
    const log = [
      { id: 'lp-2', data: IERI, decorre_da: IERI, ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 9 },
      { id: 'lp-1', data: MESE_SCORSO, decorre_da: MESE_SCORSO, ingrediente: 'burro', prezzoVecchio: null, prezzoNuovo: 8 },
    ]
    expect(getPrezzoStoricoKg(log, 'burro', '2026-09-18T09:00:00.000Z')).toBe(9)
    expect(getPrezzoStoricoKg(log, 'burro', '2026-09-01T09:00:00.000Z')).toBe(8)
    // Prima di tutto: non si sa, e non è zero.
    expect(getPrezzoStoricoKg(log, 'burro', '2026-07-01T09:00:00.000Z')).toBeNull()
  })
})
