// @vitest-environment happy-dom
//
// Caricamento del registro incassi: test del percorso completo.
//
// Quello che difendono: che dal foglio grezzo si arrivi all'anteprima giusta,
// che le sedi del foglio finiscano sui punti vendita giusti, e soprattutto che
// premendo "Importa" partano le scritture corrette — perché qui si scrive un
// mese intero di incassi in un colpo, e un errore non si vede a occhio.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Stessa forma del foglio reale: tabelle affiancate, intestazioni scritte a
// mano, spese in testo libero con la notazione sul documento.
const FOGLIO = [
  ['GIORNO','Berthollet POS','Berthollet- Contanti','Totale Berthollet','De Gasperi- POS','De Gasperi Contanti','Totale De Gasperi ','Totale Giornaliero',null,'GIORNO','delivery berthollet','delivery de gasperi',null,null,null,'Berthollet','spesa',null,'De Gasperi','spesa'],
  [1, 788.1, 288.3, 1076.4, 1202.55, 369.15, 1571.7, 2648.1, null, 1, 70, 277.4, null, null, 1, null, null, 1, null, null],
  [2, 1129.5, 424.1, 1553.6, 1301.1, 499.2, 1800.3, 3353.9, null, 2, 122.7, 120.8, null, null, 2, 10, 'limoni (No F)', 2, null, null],
  [3, 1652.9, 577.3, 2230.2, 1670.8, 662.2, 2333, 4563.2, null, 3, 136.6, 169.7, null, null, 3, 60, 'PESCHE E ANGURIA(NO F)', 3, 30, 'timut(F)'],
  ['TOTALE MESE', 3570.5, 1289.7, 4860.2, 4174.45, 1530.55, 5705, 10565.2, null, 'TOT MESE', 329.3, 567.9, null, null, 'TOT', 70, null, 'TOT', 30],
]

const scritture = { chiusure: [], svuotati: [], movimenti: [], letturaImportate: [] }
// Righe di uscita che finge di trovare in DB come "già importate da un
// registro precedente": sono le sole che l'import può cancellare.
let importateInDb = []

vi.mock('../../src/lib/xlsx', () => ({ loadXLSX: () => Promise.resolve({}) }))

vi.mock('../../src/lib/importParse', () => ({
  fileToArrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  parseWorkbook: () => ({
    sheetNames: ['Foglio1'],
    rawSheets: { Foglio1: FOGLIO },
  }),
}))

vi.mock('../../src/lib/chiusure', async () => {
  const real = await vi.importActual('../../src/lib/chiusure')
  return {
    ...real,
    importaChiusureIncassi: vi.fn((orgId, sedeId, righe) => {
      scritture.chiusure.push({ orgId, sedeId, righe })
      return Promise.resolve({ nuove: righe.length, aggiornate: 0 })
    }),
  }
})

vi.mock('../../src/lib/primaNota', async () => {
  const real = await vi.importActual('../../src/lib/primaNota')
  return {
    ...real,
    movimentiImportatiPeriodo: vi.fn((orgId, sedeId, from, to) => {
      scritture.letturaImportate.push({ sedeId, from, to })
      return Promise.resolve(importateInDb.filter(m => m.sede_id === sedeId))
    }),
    eliminaMovimentiPerId: vi.fn((ids) => {
      // L'ordine conta: la cancellazione deve arrivare DOPO l'inserimento,
      // così un errore a metà lascia dei doppioni e non un buco.
      scritture.svuotati.push({ ids, movimentiGiaScritti: scritture.movimenti.length })
      return Promise.resolve(ids.length)
    }),
    aggiungiMovimentiInBlocco: vi.fn((orgId, righe) => {
      scritture.movimenti.push(...righe)
      return Promise.resolve(righe.length)
    }),
  }
})

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: () => ({}) } }))

const { default: ImportRegistroIncassi } = await import('../../src/components/ImportRegistroIncassi.jsx')

const SEDI = [
  { id: 'sede-bert', nome: 'Mara dei Boschi Berthollet' },
  { id: 'sede-dega', nome: 'De Gasperi' },
]

const monta = (p = {}) => render(
  <ImportRegistroIncassi orgId="org-1" sedi={SEDI} notify={() => {}} onClose={() => {}} {...p} />
)

/** Sceglie il file: il nome porta con sé il mese, come nei registri veri. */
async function caricaFile(view, nome = 'INCASSI MARAMA LUGLIO 2026.xlsx') {
  const input = view.container.querySelector('input[type="file"]')
  const file = new File(['x'], nome, { type: 'application/vnd.ms-excel' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
  await waitFor(() => expect(view.container.textContent).toContain('Cosa abbiamo capito'))
}

beforeEach(() => {
  scritture.chiusure = []; scritture.svuotati = []; scritture.movimenti = []
  scritture.letturaImportate = []
  importateInDb = []
  vi.clearAllMocks()
  cleanup()
})

describe('ImportRegistroIncassi', () => {
  it('deduce il mese dal nome del file e lo mostra da confermare', async () => {
    const view = monta()
    await caricaFile(view)
    expect(view.container.querySelector('#fos-ri-periodo').value).toBe('2026-07')
    expect(view.container.textContent).toContain('luglio 2026')
  })

  it('riconosce le due sedi del foglio con i loro totali per canale', async () => {
    const view = monta()
    await caricaFile(view)
    const t = view.container.textContent
    expect(t).toContain('Berthollet')
    expect(t).toContain('De Gasperi')
    expect(t).toContain('3 giornate nel foglio')
    // Incassato di Berthollet: 1076,40 + 1553,60 + 2230,20 = 4.860,20 → arrotondato.
    expect(t).toContain('4.860 €')
  })

  it('abbina da solo il nome del foglio al punto vendita che gli somiglia', async () => {
    // Nel foglio c'è scritto "Berthollet", in Foodos "Mara dei Boschi
    // Berthollet": senza il confronto per contenimento sarebbe da mappare a mano.
    const view = monta()
    await caricaFile(view)
    const select = view.getByLabelText('Punto vendita per Berthollet')
    expect(select.value).toBe('sede-bert')
  })

  it('dice quali somme non tornano invece di scegliere in silenzio', async () => {
    const foglioRotto = FOGLIO.map(r => [...r])
    foglioRotto[1][3] = 1000            // totale scritto ≠ POS + contanti
    const parse = await import('../../src/lib/importParse')
    vi.spyOn(parse, 'parseWorkbook').mockReturnValue({
      sheetNames: ['Foglio1'], rawSheets: { Foglio1: foglioRotto },
    })
    const view = monta()
    await caricaFile(view)
    expect(view.container.textContent).toContain('Una somma non torna')
    vi.restoreAllMocks()
  })

  it('avverte se un nome del foglio non è abbinato a nessun punto vendita', async () => {
    const view = monta({ sedi: [SEDI[0]] })
    await caricaFile(view)
    expect(view.container.textContent).toContain('non è abbinato a nessun punto vendita')
  })

  it('importa incassi e spese sulla sede giusta, e sostituisce solo le uscite già importate', async () => {
    const view = monta()
    await caricaFile(view)
    fireEvent.click(view.getByText('Importa il registro'))

    await waitFor(() => expect(view.container.textContent).toContain('Fatto'))

    // Una chiamata per sede, con le sole giornate di quella sede.
    expect(scritture.chiusure).toHaveLength(2)
    const bert = scritture.chiusure.find(c => c.sedeId === 'sede-bert')
    expect(bert.righe).toHaveLength(3)
    expect(bert.righe[0]).toMatchObject({ data: '2026-07-01', totale: 1076.4, pos: 788.1, contanti: 288.3, delivery: 70 })

    // Reimportare non raddoppia: si guarda cosa c'è già di importato nel
    // periodo, una sede per volta.
    // AGGIORNATO 10/09/2026: prima l'import cancellava TUTTE le uscite del
    // periodo, comprese quelle scritte a mano nell'app, e lo faceva sempre,
    // anche con un foglio senza colonna spese. Ora cancella solo le proprie,
    // solo se il foglio porta delle spese, e DOPO aver inserito le nuove.
    expect(scritture.letturaImportate).toEqual(expect.arrayContaining([
      { sedeId: 'sede-bert', from: '2026-07-01', to: '2026-07-31' },
      { sedeId: 'sede-dega', from: '2026-07-01', to: '2026-07-31' },
    ]))
    expect(scritture.letturaImportate).toHaveLength(2)
    // Niente da sostituire: in DB non c'era nessuna uscita importata prima.
    expect(scritture.svuotati).toHaveLength(0)

    // Le spese portano la sede e la notazione sul documento letta dal testo.
    const limoni = scritture.movimenti.find(m => m.descrizione === 'limoni')
    expect(limoni).toMatchObject({ data: '2026-07-02', importo: 10, documento: 'senza', sede_id: 'sede-bert' })
    const timut = scritture.movimenti.find(m => m.descrizione === 'timut')
    expect(timut).toMatchObject({ importo: 30, documento: 'fattura', sede_id: 'sede-dega' })
  })

  it('una sede messa su "Non importare" viene saltata', async () => {
    const view = monta()
    await caricaFile(view)
    fireEvent.change(view.getByLabelText('Punto vendita per De Gasperi'), { target: { value: '' } })
    fireEvent.click(view.getByText('Importa il registro'))

    await waitFor(() => expect(scritture.chiusure).toHaveLength(1))
    expect(scritture.chiusure[0].sedeId).toBe('sede-bert')
    expect(scritture.letturaImportate).toHaveLength(1)
  })

  it('le uscite già importate si sostituiscono, e la cancellazione arriva DOPO l\'inserimento', async () => {
    importateInDb = [
      { id: 'vecchia-1', sede_id: 'sede-bert', importo: 10 },
      { id: 'vecchia-2', sede_id: 'sede-dega', importo: 30 },
    ]
    const view = monta()
    await caricaFile(view)
    fireEvent.click(view.getByText('Importa il registro'))
    await waitFor(() => expect(view.container.textContent).toContain('Fatto'))

    const ids = scritture.svuotati.flatMap(s => s.ids)
    expect(ids).toEqual(expect.arrayContaining(['vecchia-1', 'vecchia-2']))
    // Nessuna cancellazione a mani vuote: quando si cancella, le righe nuove
    // sono già scritte.
    for (const s of scritture.svuotati) {
      expect(s.movimentiGiaScritti).toBeGreaterThan(0)
    }
  })

  it('cambiare il mese sposta tutte le date, senza rileggere il file', async () => {
    const view = monta()
    await caricaFile(view)
    fireEvent.change(view.container.querySelector('#fos-ri-periodo'), { target: { value: '2026-08' } })
    await waitFor(() => expect(view.container.textContent).toContain('agosto 2026'))

    fireEvent.click(view.getByText('Importa il registro'))
    await waitFor(() => expect(scritture.chiusure.length).toBeGreaterThan(0))
    expect(scritture.chiusure[0].righe[0].data).toBe('2026-08-01')
    expect(scritture.letturaImportate[0]).toMatchObject({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('un file senza mese nel nome chiede di indicarlo, e non importa nulla', async () => {
    const view = monta()
    const input = view.container.querySelector('input[type="file"]')
    const file = new File(['x'], 'incassi.xlsx', {})
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(view.container.textContent).toContain('non si capisce il mese'))
    expect(view.container.textContent).not.toContain('Importa il registro')
  })

  it('non mostra emoji: le icone sono SVG', async () => {
    const view = monta()
    await caricaFile(view)
    expect(view.container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(view.container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })
})
