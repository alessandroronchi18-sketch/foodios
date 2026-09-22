// @vitest-environment happy-dom
//
// ── La Cassa prevista sul dito, e con i due rossi al posto giusto ──────────
//
// Tre famiglie di difetti della stessa pagina, misurate il 20/09/2026
// montandola alle tre larghezze del progetto (390 telefono, 768 tablet, 1440
// computer).
//
// **1. I bersagli.** «Aggiungi evento» era `padding: '7px 14px'` e basta:
// circa 31px di altezza, su telefono come su tablet. Il cestino che cancella
// un evento e le pastiglie 30/60/90 giorni stavano a 40. La misura di un
// polpastrello è 44, e vale per il telefono E per il tablet — è la regola
// arrivata il 18/09/2026 dopo i comandi dei gusti alti 30 su iPad. In
// `theme.js` la misura c'è già, una volta sola: `ui.ctrlH`.
//
// **2. Il riquadro che sfonda la pagina sul tablet.** L'avviso «Non ho
// abbastanza chiusure» era scritto `gridColumn: isMobile ? 'span 2' : 'span 3'`
// dentro una griglia che su tablet ha DUE colonne (`ui.grid4`). Una cella che
// ne occupa tre in una griglia da due inventa una terza colonna: la pagina
// esce dallo schermo in orizzontale. Sul tablet succedeva davvero, ed è il
// ramo che vede oggi Mara — che di chiusure di cassa registrate ne ha zero,
// quindi quel riquadro lo vede sempre.
//
// **3. I due rossi scambiati.** Regola del titolare, 14/09/2026: il bordeaux
// del marchio (#6E0E1A) è il colore delle AZIONI, il rosso segnale (#DC2626)
// quello degli ALLARMI. Una cassa prevista sotto zero è un allarme — è
// «giacenza sotto zero», la voce che la regola nomina per prima — e invece
// era dipinta col bordeaux dei pulsanti. Il riquadro del giorno rosso era
// anche peggio: fondo d'allarme (#FEF2F2, cioè `T.redLight`) e bordo
// d'azione, i due rossi mescolati nello stesso riquadro.
//
// In fondo c'è il cricchetto sui token di design: questa pagina aveva 49
// valori scritti a mano su 671 righe (25 colori, 23 misure di testo, 1
// ternario a tre vie). Adesso zero, e questa prova non li lascia tornare.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { color as T, font, ui } from '../../src/lib/theme.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

vi.mock('../../src/lib/supabase', async () => {
  const { supabaseFinto } = await import('./aiutoCashflow.jsx')
  return { supabase: supabaseFinto }
})
vi.mock('../../src/lib/storage', async () => {
  const { storageFinto } = await import('./aiutoCashflow.jsx')
  return storageFinto
})

const { reset, fattura, evento, montaCashflow, schermo, LARGHEZZA } =
  await import('./aiutoCashflow.jsx')
const { default: CashflowView } = await import('../../src/views/CashflowView.jsx')

async function apri(props = {}) {
  const v = montaCashflow(CashflowView, props)
  await waitFor(() => expect(v.container.textContent).not.toContain('Caricamento…'))
  return v
}

const alto = (el) => parseInt(String(el.style.minHeight || el.style.height || '0'), 10)

/** Il riquadro del KPI, cercato per etichetta. */
function valoreKpi(v, etichetta) {
  const lab = [...v.container.querySelectorAll('div')]
    .find(d => (d.textContent || '').trim() === etichetta)
  return lab ? lab.nextElementSibling : null
}

beforeEach(() => { schermo(LARGHEZZA.computer); reset() })
afterEach(() => { cleanup() })

describe('i bersagli si misurano sul dito, non sulla larghezza', () => {
  const dati = { impostazioni: { saldoOggi: 10000, fissi: [] }, eventi: [evento({ id: 'e1', descrizione: 'Affitto', fra: 5 })] }

  for (const [dove, px, attesa] of [['telefono', LARGHEZZA.telefono, 44], ['tablet', LARGHEZZA.tablet, 44]]) {
    it(`sul ${dove} «Aggiungi evento» è alto almeno ${attesa}`, async () => {
      schermo(px); reset(dati)
      await apri()
      expect(alto(screen.getByText(/Aggiungi evento/).closest('button'))).toBeGreaterThanOrEqual(attesa)
    })

    it(`sul ${dove} il cestino che cancella è almeno ${attesa}x${attesa}`, async () => {
      schermo(px); reset(dati)
      await apri()
      const b = screen.getByLabelText('Elimina evento Affitto')
      expect(alto(b)).toBeGreaterThanOrEqual(attesa)
      expect(parseInt(String(b.style.minWidth), 10)).toBeGreaterThanOrEqual(attesa)
    })

    it(`sul ${dove} il campo del saldo è almeno ${attesa}`, async () => {
      schermo(px); reset(dati)
      await apri()
      expect(alto(screen.getByLabelText(/Saldo cassa\+banca oggi/i))).toBeGreaterThanOrEqual(attesa)
    })

    it(`sul ${dove} i quattro campi del nuovo evento sono almeno ${attesa}, e il testo almeno 16`, async () => {
      schermo(px); reset(dati)
      await apri()
      fireEvent.click(screen.getByText(/Aggiungi evento/))
      await waitFor(() => expect(screen.getByLabelText(/Importo in euro/i)).toBeTruthy())
      for (const et of [/Tipo di evento/i, /Descrizione dell'evento/i, /Data in cui te lo aspetti/i, /Importo in euro/i]) {
        const c = screen.getByLabelText(et)
        expect(alto(c), String(et)).toBeGreaterThanOrEqual(attesa)
        expect(parseInt(String(c.style.fontSize), 10), String(et)).toBeGreaterThanOrEqual(16)
      }
    })
  }

  it('le pastiglie 30/60/90 rispettano la misura dei comandi piccoli su tutte e tre le larghezze', async () => {
    const attese = { telefono: ui.ctrlHsm.telefono, tablet: ui.ctrlHsm.tablet, computer: ui.ctrlHsm.computer }
    for (const dove of ['telefono', 'tablet', 'computer']) {
      schermo(LARGHEZZA[dove]); reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
      await apri()
      expect(alto(screen.getByText('60gg')), dove).toBe(attese[dove])
      cleanup()
    }
  })

  it('a 767 e a 768 la misura non cambia: di qua e di là c\'è un dito', async () => {
    const misure = []
    for (const px of [767, 768, 1023]) {
      schermo(px); reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
      await apri()
      misure.push(alto(screen.getByLabelText(/Saldo cassa\+banca oggi/i)))
      cleanup()
    }
    expect(misure).toEqual([44, 44, 44])
  })

  it('sul computer i comandi possono restare più bassi: lì si clicca col mouse', async () => {
    schermo(LARGHEZZA.computer); reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    await apri()
    expect(alto(screen.getByLabelText(/Saldo cassa\+banca oggi/i))).toBe(ui.ctrlH.computer)
  })
})

describe('niente riquadri che sfondano lo schermo', () => {
  // Con zero chiusure — la situazione vera di Mara — compare l'avviso sui
  // ricavi non stimabili. È largo, e su una griglia da due colonne non può
  // occuparne tre.
  const senzaChiusure = { impostazioni: { saldoOggi: 10000, fissi: [] }, chiusure: [] }

  function avviso(v) {
    return [...v.container.querySelectorAll('div')]
      .find(d => (d.textContent || '').startsWith('Non ho abbastanza chiusure'))
  }

  for (const [dove, px, colonne] of [['telefono', LARGHEZZA.telefono, 2], ['tablet', LARGHEZZA.tablet, 2]]) {
    it(`sul ${dove} l'avviso occupa al massimo le ${colonne} colonne che ci sono`, async () => {
      schermo(px); reset(senzaChiusure)
      const v = await apri()
      const span = Number(/span (\d+)/.exec(avviso(v).style.gridColumn || '')[1])
      expect(span).toBeLessThanOrEqual(colonne)
    })
  }

  it('sul computer, dove le colonne sono quattro, ne occupa tre come deve', async () => {
    schermo(LARGHEZZA.computer); reset(senzaChiusure)
    const v = await apri()
    expect(avviso(v).style.gridColumn).toBe('span 3')
  })

  it('la griglia dei KPI collassa sul telefono e sul tablet', async () => {
    for (const dove of ['telefono', 'tablet']) {
      schermo(LARGHEZZA[dove]); reset(senzaChiusure)
      const v = await apri()
      const griglia = [...v.container.querySelectorAll('div')]
        .find(d => (d.style.display === 'grid') && /Cassa fra|Variazione di cassa/.test(d.textContent || ''))
      expect(griglia.style.gridTemplateColumns, dove).toBe(ui.grid4[dove])
      cleanup()
    }
  })

  it('il grafico sta in un contenitore che si può scorrere, non compresso', async () => {
    schermo(LARGHEZZA.telefono); reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    const v = await apri()
    const svg = v.container.querySelector('svg[role="img"]')
    expect(svg.parentElement.style.overflowX).toBe('auto')
  })
})

describe('i due rossi: il bordeaux agisce, il rosso avvisa', () => {
  it('una cassa prevista sotto zero è scritta col rosso d\'allarme', async () => {
    reset({ impostazioni: { saldoOggi: 100, fissi: [] }, fatture: [fattura({ id: 'f1', totale: 5000, scadeFra: 10 })] })
    const v = await apri()
    expect(valoreKpi(v, 'Cassa fra 60gg (atteso)').style.color).toBe(T.red)
  })

  it('e NON col bordeaux del marchio, che è il colore dei pulsanti', async () => {
    reset({ impostazioni: { saldoOggi: 100, fissi: [] }, fatture: [fattura({ id: 'f1', totale: 5000, scadeFra: 10 })] })
    const v = await apri()
    expect(valoreKpi(v, 'Cassa fra 60gg (atteso)').style.color).not.toBe(T.brand)
  })

  it('una cassa prevista sopra zero resta verde', async () => {
    reset({ impostazioni: { saldoOggi: 50000, fissi: [] } })
    const v = await apri()
    expect(valoreKpi(v, 'Cassa fra 60gg (atteso)').style.color).toBe(T.green)
  })

  it('il riquadro del giorno rosso ha il bordo d\'allarme, non quello d\'azione', async () => {
    reset({ impostazioni: { saldoOggi: 100, fissi: [] }, fatture: [fattura({ id: 'f1', totale: 5000, scadeFra: 10 })] })
    const v = await apri()
    const riquadro = [...v.container.querySelectorAll('div')]
      .find(d => (d.textContent || '').startsWith('Attenzione: cassa attesa negativa'))
      .closest('div[style*="border"]')
    expect(riquadro.style.border).toContain(T.red)
    expect(riquadro.style.border).not.toContain(T.brand)
  })

  it('l\'avviso dello scaduto fornitori è un allarme anche lui', async () => {
    reset({ impostazioni: { saldoOggi: 50000, fissi: [] }, fatture: [fattura({ id: 'f1', totale: 554, scadeFra: -5 })] })
    const v = await apri()
    const riquadro = [...v.container.querySelectorAll('div')]
      .find(d => d.style.background === T.redLight && /Scaduto da pagare/.test(d.textContent || ''))
    expect(riquadro).toBeTruthy()
  })

  it('il pulsante «Aggiungi evento» resta bordeaux: è un\'azione, non un allarme', async () => {
    reset({ impostazioni: { saldoOggi: 50000, fissi: [] } })
    await apri()
    expect(screen.getByText(/Aggiungi evento/).closest('button').style.background).toBe(T.brand)
  })

  it('il pallino del giorno rosso sul grafico è rosso d\'allarme', async () => {
    reset({ impostazioni: { saldoOggi: 100, fissi: [] }, fatture: [fattura({ id: 'f1', totale: 5000, scadeFra: 10 })] })
    const v = await apri()
    const cerchio = v.container.querySelector('svg circle')
    expect(cerchio.getAttribute('fill')).toBe(T.red)
  })
})

describe('si legge anche senza guardare: etichette e didascalie', () => {
  it('il grafico si presenta come immagine e si racconta in una riga', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    const v = await apri()
    const svg = v.container.querySelector('svg[role="img"]')
    const didascalia = svg.getAttribute('aria-label')
    expect(didascalia).toContain('Andamento della cassa nei prossimi 60 giorni')
    expect(didascalia).toContain('€')
  })

  it('e quando c\'è un giorno rosso lo dice nella didascalia', async () => {
    reset({ impostazioni: { saldoOggi: 100, fissi: [] }, fatture: [fattura({ id: 'f1', totale: 5000, scadeFra: 10 })] })
    const v = await apri()
    expect(v.container.querySelector('svg[role="img"]').getAttribute('aria-label')).toContain('sotto zero dal')
  })

  it('quando non c\'è, lo dice lo stesso: «sempre sopra zero»', async () => {
    reset({ impostazioni: { saldoOggi: 50000, fissi: [] } })
    const v = await apri()
    expect(v.container.querySelector('svg[role="img"]').getAttribute('aria-label')).toContain('sempre sopra zero')
  })

  it('il campo del saldo ha un\'etichetta vera, non solo un testo lì vicino', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    const v = await apri()
    const campo = screen.getByLabelText(/Saldo cassa\+banca oggi/i)
    expect(v.container.querySelector(`label[for="${campo.id}"]`)).toBeTruthy()
  })

  it('i quattro campi del nuovo evento si chiamano per nome', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    await apri()
    fireEvent.click(screen.getByText(/Aggiungi evento/))
    await waitFor(() => expect(screen.getByLabelText(/Importo in euro/i)).toBeTruthy())
    for (const et of [/Tipo di evento/i, /Descrizione dell'evento/i, /Data in cui te lo aspetti/i, /Importo in euro/i]) {
      expect(screen.getByLabelText(et), String(et)).toBeTruthy()
    }
  })

  it('le pastiglie dell\'orizzonte dicono quale è scelta', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    await apri()
    expect(screen.getByText('60gg').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('30gg').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByText('30gg'))
    await waitFor(() => expect(screen.getByText('30gg').getAttribute('aria-pressed')).toBe('true'))
  })

  it('cambiare orizzonte cambia davvero il numero e la didascalia', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    const v = await apri()
    fireEvent.click(screen.getByText('90gg'))
    await waitFor(() => expect(v.container.textContent).toContain('Cassa fra 90gg'))
    expect(v.container.querySelector('svg[role="img"]').getAttribute('aria-label')).toContain('prossimi 90 giorni')
  })

  it('in tutta la pagina non c\'è una sola emoji', async () => {
    reset({
      impostazioni: { saldoOggi: 100, fissi: [] },
      fatture: [fattura({ id: 'f1', totale: 5000, scadeFra: 10 }), fattura({ id: 'f2', totale: 200, scadeFra: -5 })],
      eventi: [evento({ id: 'e1', descrizione: 'Affitto', fra: -3 })],
    })
    const v = await apri()
    expect(v.container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

describe('il cricchetto dei token: erano 49 su 671 righe, adesso zero', () => {
  // Stesse regole di `scripts/check-design-tokens.mjs`: i commenti non si
  // contano (un commento che RACCONTA il difetto contiene il difetto), le
  // stringhe sì — `background: '#FFF'` è esattamente la deviazione cercata.
  const sorgente = readFileSync(join(RADICE, 'src', 'views', 'CashflowView.jsx'), 'utf8')
  const senzaCommenti = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const codice = senzaCommenti(sorgente)

  it('il setaccio guarda un file vero e sa riconoscere quello che cerca', () => {
    expect(sorgente.length).toBeGreaterThan(5000)
    expect(senzaCommenti("background: '#FFF'").match(/#[0-9a-fA-F]{3,8}/g)).toHaveLength(1)
    expect(senzaCommenti("// era background: '#FFF'\nbackground: T.white").match(/#[0-9a-fA-F]{3,8}/g)).toBe(null)
  })

  it('nessun colore esadecimale scritto a mano', () => {
    const trovati = codice.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g) || []
    expect(trovati).toEqual([])
  })

  it('nessuna misura di testo scritta a mano', () => {
    expect(codice.match(/fontSize:\s*'?\d+/g) || []).toEqual([])
  })

  it('nessuna misura scritta tre volte (computer/tablet/telefono)', () => {
    expect(codice.match(/is(?:Mobile|Tablet)\s*\?[^?:\n]{0,70}:\s*is(?:Tablet|Mobile)\s*\?/g) || []).toEqual([])
  })

  it('le misure di testo usate esistono tutte nella scala del tema', () => {
    const scala = new Set(Object.values(font.size))
    const usate = [...codice.matchAll(/font\.size(?:\.(\w+)|\['([^']+)'\])/g)]
      .map(m => m[1] || m[2])
    expect(usate.length).toBeGreaterThan(5)
    for (const chiave of usate) {
      expect(font.size[chiave], `font.size.${chiave} non esiste`).toBeDefined()
      expect(scala.has(font.size[chiave])).toBe(true)
    }
  })

  it('i colori usati sono chiavi vere di theme.js', () => {
    const usati = [...codice.matchAll(/\bT\.(\w+)/g)].map(m => m[1])
    expect(usati.length).toBeGreaterThan(10)
    for (const chiave of new Set(usati)) {
      expect(T[chiave], `color.${chiave} non esiste in theme.js`).toBeDefined()
    }
  })
})
