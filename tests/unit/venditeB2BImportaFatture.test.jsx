// @vitest-environment happy-dom
//
// ── Vendite B2B: pagina vuota che spiega, importatore con anteprima ───────
// 06/10/2026. La tabella `vendite_b2b` di Mara ha ZERO righe. La pagina vuota
// mostrava quattro box con un trattino, un'icona e «Nessuna vendita B2B
// registrata»: niente diceva cosa fosse l'ingrosso né come cominciare. E per
// riempirla c'erano 187 fatture emesse in un Excel di Fattura SMART, senza un
// modo di caricarle. Qui si prova: la spiegazione, l'anteprima SENZA nessuna
// scrittura, la scrittura solo dopo il pulsante «Carica», i doppioni e il
// cliente scritto in due modi.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import * as XLSX from 'xlsx'

let VENDITE = []
const scritture = []
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))
vi.mock('../../src/lib/xlsx', () => ({ loadXLSX: async () => XLSX }))
vi.mock('../../src/lib/supabase', () => {
  const catena = (tabella) => {
    const st = { tabella, op: 'select', payload: null }
    const c = {
      select: () => c, eq: () => c, or: () => c, order: () => c, range: () => c,
      insert: (p) => { st.op = 'insert'; st.payload = p; scritture.push({ ...st }); return c },
      then: (ok, ko) => Promise.resolve(
        st.op === 'insert' && tabella === 'clienti_b2b'
          ? { data: st.payload.map((x, i) => ({ id: 'c' + i, nome: x.nome, partita_iva: x.partita_iva })), error: null }
          : st.op === 'select' && tabella === 'vendite_b2b' ? { data: VENDITE, error: null } : { data: [], error: null },
      ).then(ok, ko),
    }
    return c
  }
  return { supabase: { from: catena, rpc: async () => ({ data: 5, error: null }) } }
})
vi.mock('../../src/components/ConfirmModal', () => ({ useConfirm: () => async () => true }))

const { default: VenditeB2BView } = await import('../../src/views/VenditeB2BView.jsx')

const INTEST = ['Numero', 'Suffisso', 'Anno', 'Data', 'Tipo Documento', 'Cliente', 'Codice Fiscale', 'Partita IVA', 'Imponibile', 'Tipo cassa previdenza', 'Cassa Previdenza', 'Imposta', 'Importo Art. 15', 'Bollo', 'Totale', 'Ritenuta', 'Netto a pagare', 'Note piede', 'Stato', 'Esito']
const f = (n, anno, data, cliente, imp, iva, piva) => [String(n), '', anno, new Date(data + 'T12:00:00'), 'Fattura - SERVIZI', cliente, piva, piva, imp, 'x', 0, iva, 0, 0, imp + iva, 0, imp + iva, '', 'Scaduta', 'Accettato dal Cliente']
const FOGLIO = [['Elenco documenti'], [''], [''], INTEST,
  f(31, 2026, '2026-09-23', 'I CARBONARI S.R.L', 560, 56, '111'),
  f(30, 2026, '2026-09-17', 'SAVOIA21 SOCIETA\' A RESPONSABILITA\' LIMITATA', 132, 29.04, '222'),
  f(29, 2025, '2025-01-10', 'SAVOIA21 SRL', 100, 22, '222'),
  f(28, 2025, '2025-01-10', 'SAVOIA21 SRL', 100, 22, '222'),
  f(28, 2025, '2025-01-10', 'SAVOIA21 SRL', 100, 22, '222'),
]
function fileExcel(righe = FOGLIO) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const file = new File([buf], 'fatture.xlsx')
  file.arrayBuffer = async () => buf
  return file
}
const testo = () => document.body.textContent
const bottone = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.textContent))
async function apri() {
  const u = render(<VenditeB2BView orgId="o1" sedeId="s1" sedi={[]} sedeAttiva={{ id: 's1' }} ricettario={{ ricette: {} }} notify={() => {}} tipoAttivita="gelateria" />)
  await waitFor(() => { if (/Caricamento/.test(testo())) throw new Error('attendo') })
  return u
}
async function scegliFile(righe) {
  await act(async () => { bottone(/Importa le fatture già emesse|Importa fatture emesse/).click() })
  const input = document.querySelector('input[type="file"]')
  await act(async () => { fireEvent.change(input, { target: { files: [fileExcel(righe)] } }) })
  await waitFor(() => { if (!/Carica \d+ fatt/.test(testo()) && !/non è un elenco|vuoto/.test(testo())) throw new Error('attendo') })
}
beforeEach(() => { VENDITE = []; scritture.length = 0 })
afterEach(() => cleanup())

describe('pagina vuota', () => {
  it('dice a cosa serve e come cominciare, senza i quattro box col trattino', async () => {
    await apri()
    expect(testo()).toMatch(/Qui registri quello che vendi a bar e ristoranti/)
    expect(testo()).toMatch(/non passano dalla cassa/)
    expect(bottone(/Registra la prima vendita/)).toBeTruthy()
    expect(bottone(/Importa le fatture già emesse/)).toBeTruthy()
    expect(testo()).not.toMatch(/Venduto B2B \(mese\)|Da incassare/)
    expect(testo()).not.toMatch(/Nessuna vendita B2B registrata/)
  })
  it('con delle vendite la pagina è quella di prima: box e pulsante «Nuova vendita»', async () => {
    VENDITE = [{ id: 'v1', data: '2026-10-01', stato: 'consegnata', pagata: false, totale: 100, righe: [{ prodotto: 'NOCCIOLA', qta: 5, unita: 'kg', prezzo: 20, totale: 100 }], clienti_b2b: { nome: 'BAR' } }]
    await apri()
    expect(testo()).toMatch(/Venduto B2B \(mese\)/)
    expect(bottone(/Nuova vendita B2B/)).toBeTruthy()
    expect(testo()).not.toMatch(/Qui registri quello che vendi/)
  })
})

describe('importatore', () => {
  it('l\'anteprima non scrive niente: solo il pulsante «Carica» scrive', async () => {
    await apri()
    await scegliFile()
    expect(testo()).toMatch(/4 fatture/)             // 5 righe, 1 doppione
    expect(testo()).toMatch(/1 doppione nel file/)
    expect(testo()).toMatch(/2 clienti/)             // SAVOIA21 scritto in due modi
    expect(scritture).toHaveLength(0)
    await act(async () => { bottone(/Carica 4 fatture/).click() })
    await waitFor(() => { if (!scritture.length) throw new Error('attendo') })
    const clienti = scritture.find(s => s.tabella === 'clienti_b2b').payload
    expect(clienti.map(c => c.nome)).toEqual(['I CARBONARI S.R.L', 'SAVOIA21 SOCIETA\' A RESPONSABILITA\' LIMITATA'])
    const vendite = scritture.filter(s => s.tabella === 'vendite_b2b').flatMap(s => s.payload)
    expect(vendite).toHaveLength(4)
    expect(vendite.every(x => x.stock_scaricato === false && x.stato === 'fatturata' && x.organization_id === 'o1')).toBe(true)
    expect(vendite.filter(x => x.cliente_id === 'c1')).toHaveLength(3)   // le tre SAVOIA21, stesso cliente
  })
  it('«Non caricare» chiude e non scrive', async () => {
    await apri()
    await scegliFile()
    await act(async () => { bottone(/Non caricare/).click() })
    expect(scritture).toHaveLength(0)
    expect(testo()).toMatch(/Qui registri quello che vendi/)
  })
  it('«Solo le fatture del anno» lascia fuori le vecchie e il pulsante cambia numero', async () => {
    await apri()
    await scegliFile()
    await act(async () => { document.querySelector('input[type="checkbox"]').click() })
    expect(testo()).toMatch(/Carica 2 fatture/)
    expect(testo()).toMatch(/2 fatture restano fuori/)
  })
  it('un file che non è un elenco di fatture emesse non si carica e dice perché', async () => {
    await apri()
    await scegliFile([['Numero', 'Data', 'Fornitore', 'Imponibile'], ['1', '2026-01-01', 'X', 10]])
    expect(testo()).toMatch(/non è un elenco di fatture emesse/)
    expect(bottone(/Carica \d+ fatt/)).toBeFalsy()
    expect(scritture).toHaveLength(0)
  })
  it('le fatture già caricate (stessa nota) non si ricaricano', async () => {
    VENDITE = [{ id: 'v1', data: '2026-09-23', stato: 'fatturata', pagata: false, totale: 560, note: 'Fattura 31/2026 · Fattura SMART', righe: [{ prodotto: 'FATTURA 31/2026', qta: 1, unita: 'pz', fonte: 'fattura_smart' }], clienti_b2b: { nome: 'X' } }]
    await apri()
    await scegliFile()
    expect(testo()).toMatch(/1 fattura è già caricata/)
    expect(testo()).toMatch(/Carica 3 fatture/)
  })
})
