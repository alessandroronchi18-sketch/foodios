// Snapshot HTML dei template email Resend.
//
// Pin di non-regressione: se un template cambia copy/struttura, il snapshot
// fallisce e l'autore deve confermare l'intenzione con `vitest -u`.
// Cattura: tipo email rotto, copy regression (l'AI suggerirebbe variazioni
// "miglioranti" che non sono mai migliori — vedi memory feedback-no-ai-copy),
// link href cambiato, escapeHtml dimenticato.

import { describe, it, expect } from 'vitest'
import {
  templateBenvenuto,
  templateApprovazione,
  templateCustom,
  templateScadenzaTrial,
  templateMagazzinoSottoSoglia,
  templateFattureInScadenza,
  templateReportMensile,
  escapeHtml,
} from '../../api/lib/emailTemplates.js'

describe('Email templates — snapshot per non-regressione', () => {
  it('benvenuto', () => {
    const t = templateBenvenuto({ nomeAttivita: 'Pasticceria Mara dei Boschi' })
    expect(t.subject).toMatchSnapshot()
    expect(t.html).toMatchSnapshot()
  })

  it('benvenuto escapa nomi con HTML', () => {
    const t = templateBenvenuto({ nomeAttivita: '<script>alert(1)</script>' })
    expect(t.html).not.toContain('<script>alert(1)')
    expect(t.html).toContain('&lt;script&gt;')
  })

  it('approvazione', () => {
    const t = templateApprovazione({ nomeOrg: 'Mara dei Boschi SRL', nomeCompleto: 'Mara Rossi' })
    expect(t.subject).toMatchSnapshot()
    expect(t.html).toMatchSnapshot()
  })

  it('approvazione fallback su nomeOrg vuoto', () => {
    const t = templateApprovazione({ nomeOrg: '', nomeCompleto: '' })
    expect(t.html).toContain('la tua attività')
  })

  it('custom — escapa messaggio e converte newline in <br>', () => {
    const t = templateCustom({ oggetto: 'Test', messaggio: 'Riga 1\nRiga 2\n<b>bold</b>' })
    expect(t.subject).toBe('Test')
    expect(t.html).toContain('Riga 1<br>Riga 2<br>')
    expect(t.html).toContain('&lt;b&gt;bold&lt;/b&gt;')
    expect(t.html).not.toContain('<b>bold')
  })

  it('scadenza_trial', () => {
    const t = templateScadenzaTrial()
    expect(t.subject).toMatchSnapshot()
    expect(t.html).toMatchSnapshot()
  })

  it('magazzino_sotto_soglia — lista 3 ingredienti', () => {
    const t = templateMagazzinoSottoSoglia({
      nomeAttivita: 'Mara dei Boschi',
      ingredienti: [
        { nome: 'Farina 00', sede: 'Torino', giacenza: '2 kg', soglia: '10 kg' },
        { nome: 'Zucchero', giacenza: '500 g', soglia: '3 kg' },
        { nome: 'Burro', sede: 'Lab', giacenza: '0 kg', soglia: '5 kg' },
      ],
    })
    expect(t.subject).toContain('3 ingredienti sotto soglia')
    expect(t.html).toMatchSnapshot()
  })

  it('magazzino — singolare con 1 elemento', () => {
    const t = templateMagazzinoSottoSoglia({
      nomeAttivita: 'Test',
      ingredienti: [{ nome: 'X', giacenza: 1, soglia: 10 }],
    })
    expect(t.subject).toContain('1 ingrediente sotto')   // singolare, no 'i'
  })

  it('fatture_in_scadenza — formato italiano migliaia', () => {
    const t = templateFattureInScadenza({
      nomeAttivita: 'Mara',
      fatture: [
        { fornitore: 'Fornitore A', data_fattura: '2026-07-15', totale: 1234.56 },
        { fornitore: 'Fornitore B', data_fattura: '2026-07-20', totale: 89.00 },
      ],
    })
    expect(t.subject).toContain('2 fatture')
    // 1234.56 deve essere formattato con virgola decimale italiana
    expect(t.html).toMatch(/€ 1\.?234,56/)
    expect(t.html).toMatch(/€ 89,00/)
  })

  it('fatture — singolare con 1 elemento', () => {
    const t = templateFattureInScadenza({
      nomeAttivita: 'X',
      fatture: [{ fornitore: 'A', data_fattura: '2026-07-15', totale: 100 }],
    })
    expect(t.subject).toContain('1 fattura')
  })

  it('report_mensile — completo', () => {
    const t = templateReportMensile({
      nomeAttivita: 'Mara',
      mese: 'giugno 2026',
      ricaviTotali: 12345.67,
      foodCostMedio: 28.5,
      prodottoPiuVenduto: 'Torta Sacher',
      prodottoMenoVenduto: 'Bignè crema',
    })
    expect(t.subject).toBe('📊 Report giugno 2026 — FoodOS')
    expect(t.html).toContain('Torta Sacher')
    expect(t.html).toContain('Bignè crema')
    expect(t.html).toContain('28.5%')
    expect(t.html).toMatch(/€ 12\.?345,67/)
    expect(t.html).toMatchSnapshot()
  })

  it('report — senza prodottoPiuVenduto/menoVenduto', () => {
    const t = templateReportMensile({
      nomeAttivita: 'X',
      mese: 'maggio 2026',
      ricaviTotali: 1000,
      foodCostMedio: 30,
    })
    expect(t.html).not.toContain('🥇')
    expect(t.html).not.toContain('🐢')
  })

  it('escapeHtml — entities standard', () => {
    expect(escapeHtml('<a>&"\'')).toBe('&lt;a&gt;&amp;&quot;&#39;')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(0)).toBe('0')
  })
})
