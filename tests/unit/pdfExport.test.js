// pdfExport — wrapper jsPDF + autoTable per report (KPI + sezioni).
// Lo strato e' UI-bound (disegna su jsPDF), quindi mockiamo jspdf e
// jspdf-autotable per smoke test: verifichiamo che buildAndDownloadPdf
// invochi le primitive giuste senza crashare, e che svgNodeToPng gestisca
// gli edge case (input nullo, errore di rendering).
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Mock jsPDF ----------------------------------------------------------
// Costruttore -> oggetto "doc" con tutte le API usate nel modulo.
const docCalls = { addPage: 0, save: [], text: [] }

class FakeJsPDF {
  constructor(_opts) {
    this.internal = { getNumberOfPages: () => this._pages }
    this._pages = 1
    this.lastAutoTable = { finalY: 70 }
  }
  setFillColor() {}
  setDrawColor() {}
  setTextColor() {}
  setFont() {}
  setFontSize() {}
  rect() {}
  roundedRect() {}
  text(...args) { docCalls.text.push(args) }
  splitTextToSize(str, _w) { return [String(str)] }
  addImage() {}
  addPage() { this._pages++; docCalls.addPage++ }
  setPage() {}
  save(name) { docCalls.save.push(name) }
}

vi.mock('jspdf', () => ({
  jsPDF: FakeJsPDF,
  default: FakeJsPDF,
}))

const autoTableSpy = vi.fn((doc, _opts) => { doc.lastAutoTable = { finalY: 80 } })
vi.mock('jspdf-autotable', () => ({
  default: autoTableSpy,
}))

const mod = await import('../../src/lib/pdfExport.js')

describe('buildAndDownloadPdf', () => {
  beforeEach(() => {
    docCalls.addPage = 0
    docCalls.save = []
    docCalls.text = []
    autoTableSpy.mockClear()
  })

  it('smoke: chiamata minima non crasha e salva file con default name', async () => {
    await mod.buildAndDownloadPdf({})
    expect(docCalls.save).toEqual(['foodios-report.pdf'])
  })

  it('usa fileName custom', async () => {
    await mod.buildAndDownloadPdf({ fileName: 'pl_giugno_2026.pdf', title: 'PL' })
    expect(docCalls.save).toContain('pl_giugno_2026.pdf')
  })

  it('renderizza KPI + sezione con tabella -> autoTable invocata', async () => {
    await mod.buildAndDownloadPdf({
      fileName: 'r.pdf',
      title: 'Conto economico',
      subtitle: 'Mara dei Boschi',
      periodo: 'vs maggio',
      kpi: [
        { label: 'Ricavi', value: '€12.000', sub: '+5%' },
        { label: 'Food cost', value: '32%' },
      ],
      sections: [{
        title: 'Top prodotti',
        text: 'Riepilogo del mese.',
        table: {
          columns: ['Prodotto', 'Qta', '€'],
          rows: [['Cannolo', 42, 168], ['Babà', 21, 84]],
          alignments: ['left', 'right', 'right'],
        },
      }],
    })
    expect(autoTableSpy).toHaveBeenCalledTimes(1)
    const [, opts] = autoTableSpy.mock.calls[0]
    expect(opts.head).toEqual([['Prodotto', 'Qta', '€']])
    expect(opts.body.length).toBe(2)
  })

  it('sezione con chartImg -> non crasha (addImage chiamato, try/catch interno)', async () => {
    await mod.buildAndDownloadPdf({
      sections: [{ title: 'Andamento', chartImg: 'data:image/png;base64,XXX' }],
    })
    expect(docCalls.save.length).toBe(1)
  })

  it('rispetta sections vuoto', async () => {
    await mod.buildAndDownloadPdf({ kpi: [], sections: [] })
    expect(autoTableSpy).not.toHaveBeenCalled()
  })

  it('tabella senza rows -> non chiama autoTable', async () => {
    await mod.buildAndDownloadPdf({
      sections: [{ title: 'Vuota', table: { columns: ['A'], rows: [] } }],
    })
    expect(autoTableSpy).not.toHaveBeenCalled()
  })

  it('KPI > 4 -> taglia a 4 cards (nessun crash, save invocata)', async () => {
    await mod.buildAndDownloadPdf({
      kpi: Array.from({ length: 7 }, (_, i) => ({ label: `K${i}`, value: i })),
    })
    expect(docCalls.save.length).toBe(1)
  })
})

describe('svgNodeToPng', () => {
  it('input null -> ritorna null', async () => {
    const r = await mod.svgNodeToPng(null)
    expect(r).toBeNull()
  })

  it('cattura errore di rendering -> ritorna null (catch interno)', async () => {
    // Forziamo XMLSerializer a throware -> il try/catch del modulo restituisce null.
    const orig = globalThis.XMLSerializer
    globalThis.XMLSerializer = class { serializeToString() { throw new Error('boom') } }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const r = await mod.svgNodeToPng({ clientWidth: 100, clientHeight: 50 })
      expect(r).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      globalThis.XMLSerializer = orig
      warnSpy.mockRestore()
    }
  })
})

describe('pdfExport module', () => {
  it('export buildAndDownloadPdf + svgNodeToPng', () => {
    expect(typeof mod.buildAndDownloadPdf).toBe('function')
    expect(typeof mod.svgNodeToPng).toBe('function')
  })
})
