// @vitest-environment happy-dom
//
// ── Il wizard deve dichiarare cosa carica e cosa lascia fuori ─────────────
//
// Audit del 19/09/2026. Domanda del titolare: «la pagina è studiata per la
// ricezione di un Excel abbastanza generico: se carico un Excel con nome
// fornitore, prodotti, prezzo per prodotto, è pronta ad accoglierlo?».
//
// Passando dentro il wizard i file come li manda un fornitore sono venute
// fuori quattro cose che il programma decideva da solo senza dirlo. Tutte
// nello stesso punto del flusso — il passo 2 e il passo 3 — cioè l'ultimo
// momento in cui l'utente può ancora tornare indietro e sistemare il file.
//
// 1. DI UN FILE A PIU' FOGLI SE NE LEGGEVA UNO. Il riquadro che racconta cosa
//    è stato letto compariva solo per il formato WIDE. Un listino con un
//    foglio per famiglia di prodotti entrava per un terzo e la schermata
//    finale diceva «Tutto caricato!».
//
// 2. LE RIGHE SALTATE IN CIMA NON SI SAPEVANO. Adesso `parseWorkbook` trova la
//    riga delle intestazioni anche sotto il titolo del listino: se salta delle
//    righe, va detto, perché è un'ipotesi e può essere sbagliata.
//
// 3. LE COLONNE NON CARICATE NON ERANO SCRITTE DA NESSUNA PARTE. In un listino
//    fornitore sono «Prodotto», «Prezzo», «U.M.»: cioè quasi tutto il file.
//    Chi carica pensa di aver caricato anche quelle.
//
// 4. I NUMERI DI RIGA NEGLI ERRORI ERANO SBAGLIATI (seconda metà del difetto
//    del 18/09, vedere `rigaDelFoglioNonSiSposta.test.js`): con tre righe
//    bianche in mezzo il wizard diceva «Riga 3» per un errore che nel foglio
//    sta alla riga 6.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as XLSX from 'xlsx'

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) }),
  },
}))

vi.mock('../../src/lib/xlsx', () => ({ loadXLSX: async () => XLSX }))

// Il riconoscimento automatico delle colonne è una chiamata di rete: qui si
// decide da fuori cosa ha risposto, così si prova il wizard e non il server.
const mappaturaFinta = { mapping: {}, confidence: {}, notes: '' }
vi.mock('../../src/lib/importAiMap', () => ({
  callImportMap: async () => mappaturaFinta,
  callImportDetectFormat: async () => ({ format: 'long', unpivot_config: null, notes: '' }),
  saveImportMapping: () => {},
}))

const { default: ImportWizard } = await import('../../src/components/ImportWizard.jsx')

/** Un file Excel vero, come oggetto File da dare all'input. */
function fileExcel(fogli, nome = 'listino.xlsx') {
  const wb = XLSX.utils.book_new()
  for (const [nomeFoglio, aoa] of Object.entries(fogli)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nomeFoglio)
  }
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new File([bytes], nome, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Apre il wizard, carica il file, e arriva al passo 2. */
async function finoAlPasso2(file, mapping = {}, confidence = {}) {
  mappaturaFinta.mapping = mapping
  mappaturaFinta.confidence = confidence
  const vista = render(<ImportWizard orgId="org-1" initialEntity="fornitori" notify={() => {}} />)
  const input = document.getElementById('import-file-input')
  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: /^Avanti$/ }))
  await waitFor(() => expect(screen.getByText(/Controlla che sia tutto giusto/)).toBeTruthy())
  return vista
}

beforeEach(() => { mappaturaFinta.mapping = {}; mappaturaFinta.confidence = {} })

describe('Un file a piu’ fogli dice quali fogli restano fuori', () => {
  it('nomina il foglio caricato e quelli ignorati, con quante righe', async () => {
    const { container } = await finoAlPasso2(fileExcel({
      Farine: [['Fornitore', 'Prodotto'], ['Molino Rossi SRL', 'Farina 00']],
      Latticini: [['Fornitore', 'Prodotto'], ['Latteria Alpina', 'Panna'], ['Latteria Alpina', 'Burro']],
      'Frutta secca': [['Fornitore', 'Prodotto'], ['Frutta Secca Piemonte', 'Nocciola']],
    }), { nome: 'Fornitore' })
    expect(container.textContent).toContain('Carico solo il foglio')
    expect(container.textContent).toContain('Farine')
    expect(container.textContent).toContain('Latticini (2 righe)')
    expect(container.textContent).toContain('Frutta secca (1 righe)')
  })

  it('con un foglio solo non dice niente: non c’è niente da dire', async () => {
    const { container } = await finoAlPasso2(fileExcel({
      Listino: [['Fornitore', 'Prodotto'], ['Molino Rossi SRL', 'Farina 00']],
    }), { nome: 'Fornitore' })
    expect(container.textContent).not.toContain('Carico solo il foglio')
  })
})

describe('Le righe saltate in cima si dicono', () => {
  const listinoColTitolo = {
    Listino: [
      ['LISTINO PREZZI 2026 — MOLINO ROSSI SRL'],
      ['Via Garibaldi 12, Torino'],
      [],
      ['Codice', 'Descrizione', 'U.M.', 'Prezzo'],
      ['FAR001', 'Farina 00 W300', 'kg', 1.15],
    ],
  }

  it('dice quante righe ha saltato e da dove ha preso le colonne', async () => {
    const { container } = await finoAlPasso2(fileExcel(listinoColTitolo), { nome: 'Descrizione' })
    expect(container.textContent).toContain('ho saltato le prime 3 righe')
    expect(container.textContent).toContain('dalla riga 4')
  })

  it('quando l’intestazione è in cima non dice niente', async () => {
    const { container } = await finoAlPasso2(fileExcel({
      Listino: [['Codice', 'Descrizione'], ['FAR001', 'Farina 00 W300']],
    }), { nome: 'Descrizione' })
    expect(container.textContent).not.toContain('ho saltato le prime')
  })
})

describe('Le colonne che non carico sono scritte', () => {
  it('le elenca per nome', async () => {
    const { container } = await finoAlPasso2(fileExcel({
      Listino: [
        ['Fornitore', 'Prodotto', 'U.M.', 'Prezzo'],
        ['Molino Rossi SRL', 'Farina 00 W300', 'kg', '1,15'],
      ],
    }), { nome: 'Fornitore' })
    // Dentro il riquadro, non da qualche altra parte: i nomi delle colonne
    // compaiono anche nei menu a tendina, e trovarli li' non proverebbe niente.
    const riquadro = screen.getByText(/colonne del tuo file non le carico/).parentElement
    expect(riquadro.textContent).toContain('Prodotto')
    expect(riquadro.textContent).toContain('Prezzo')
    expect(riquadro.textContent).toContain('U.M.')
    expect(container.textContent).toContain('3 colonne del tuo file non le carico')
  })

  it('se le carico tutte non compare il riquadro', async () => {
    const { container } = await finoAlPasso2(fileExcel({
      Listino: [['Nome', 'Email'], ['Molino Rossi SRL', 'a@b.it']],
    }), { nome: 'Nome', email: 'Email' })
    expect(container.textContent).not.toContain('non le carico')
  })
})

describe('Un abbinamento indovinato a meta’ lo dice', () => {
  it('marca «da controllare» sotto la soglia di sicurezza', async () => {
    await finoAlPasso2(
      fileExcel({ Listino: [['Ditta', 'Prodotto'], ['Molino Rossi SRL', 'Farina']] }),
      { nome: 'Ditta' }, { nome: 0.5 })
    expect(screen.getByText('da controllare')).toBeTruthy()
  })

  it('quando è sicuro non aggiunge rumore', async () => {
    await finoAlPasso2(
      fileExcel({ Listino: [['Fornitore', 'Prodotto'], ['Molino Rossi SRL', 'Farina']] }),
      { nome: 'Fornitore' }, { nome: 1 })
    expect(screen.queryByText('da controllare')).toBeNull()
  })
})

describe('Il file del titolare: cinque righe, tre fornitori', () => {
  // «Nome fornitore, prodotti, prezzo per prodotto»: una riga per prodotto, e
  // il fornitore che si ripete. Prima entravano cinque anagrafiche per tre
  // fornitori e la schermata finale diceva «Tutto caricato!».
  const listino = {
    Prezzi: [
      ['Fornitore', 'Prodotto', 'Prezzo'],
      ['Molino Rossi SRL', 'Farina 00 W300', '1,15'],
      ['Molino Rossi SRL', 'Farina manitoba', '1,48'],
      ['Latteria Alpina', 'Panna 35%', '4,20'],
      ['Latteria Alpina', 'Burro di centrifuga', '8,90'],
      ['Frutta Secca Piemonte', 'Nocciola Piemonte IGP', '24,50'],
    ],
  }

  async function finoAlPasso3() {
    await finoAlPasso2(fileExcel(listino), { nome: 'Fornitore' })
    fireEvent.click(screen.getByRole('button', { name: /^Avanti$/ }))
    await waitFor(() => expect(screen.getByText(/Ecco cosa ho capito/)).toBeTruthy())
  }

  it('dice che lo stesso nome torna più volte, e quali', async () => {
    const { container } = render(<div/>)
    await finoAlPasso3()
    expect(document.body.textContent).toContain('lo stesso nome torna più volte')
    expect(document.body.textContent).toContain('Molino Rossi SRL (2 righe)')
    expect(document.body.textContent).toContain('Latteria Alpina (2 righe)')
    expect(container).toBeTruthy()
  })

  it('e propone di crearne uno solo per nome: 3 invece di 5', async () => {
    await finoAlPasso3()
    expect(document.body.textContent).toContain('3')
    expect(screen.getByRole('button', { name: /Carica 3 righe/ })).toBeTruthy()
  })

  it('la scelta si puo’ togliere, e allora le carica tutte e cinque', async () => {
    await finoAlPasso3()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /Carica 5 righe/ })).toBeTruthy()
  })

  it('la domanda non la fa il browser', async () => {
    // La regola di CLAUDE.md: le finestre di Safari non hanno il nome
    // dell'applicazione e arrivano senza il contesto di quello che succede.
    const finto = vi.fn(() => true)
    const vero = window.confirm
    window.confirm = finto
    await finoAlPasso3()
    expect(finto).not.toHaveBeenCalled()
    window.confirm = vero
  })

  it('con nomi tutti diversi non compare niente', async () => {
    await finoAlPasso2(fileExcel({
      Prezzi: [['Fornitore'], ['Molino Rossi SRL'], ['Latteria Alpina']],
    }), { nome: 'Fornitore' })
    fireEvent.click(screen.getByRole('button', { name: /^Avanti$/ }))
    await waitFor(() => expect(screen.getByText(/Ecco cosa ho capito/)).toBeTruthy())
    expect(document.body.textContent).not.toContain('lo stesso nome torna')
  })
})

describe('Le caselle vuote che diventano zero si dicono prima', () => {
  // La regola più importante del prodotto: zero non è «non lo so». Nel costo
  // del lavoro uno zero vuol dire che quella persona lavora gratis, e dopo il
  // caricamento non si distingue da uno zero scritto davvero.
  it('dice quante sono e cosa ci mette dentro', async () => {
    mappaturaFinta.mapping = { nome: 'Nome', costo_orario: 'Costo' }
    mappaturaFinta.confidence = {}
    render(<ImportWizard orgId="org-1" initialEntity="dipendenti" notify={() => {}} />)
    const input = document.getElementById('import-file-input')
    fireEvent.change(input, { target: { files: [fileExcel({
      Personale: [
        ['Nome', 'Costo'],
        ['Anna Bianchi', '15,00'],
        ['Luca Verdi', null],
        ['Sara Neri', null],
      ],
    }, 'personale.xlsx')] } })
    fireEvent.click(screen.getByRole('button', { name: /^Avanti$/ }))
    await waitFor(() => expect(screen.getByText(/Controlla che sia tutto giusto/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^Avanti$/ }))
    await waitFor(() => expect(screen.getByText(/Ecco cosa ho capito/)).toBeTruthy())

    expect(document.body.textContent).toContain('Alcune caselle del tuo file sono vuote')
    expect(document.body.textContent).toContain('2 caselle vuote')
    expect(document.body.textContent).toContain('resta 0')
  })
})

describe('Le righe da rivedere indicano la riga vera del foglio', () => {
  it('dice riga 6 e riga 8, non riga 3 e riga 4', async () => {
    const { container } = await finoAlPasso2(fileExcel({
      Fornitori: [
        ['Fornitore', 'Email'],                          // riga 1
        ['Molino Rossi SRL', 'ordini@molinorossi.it'],   // riga 2
        [],                                               // riga 3
        [],                                               // riga 4
        [],                                               // riga 5
        ['Latteria Alpina', 'non-una-email'],             // riga 6
        [],                                               // riga 7
        ['Frutta Secca Piemonte', 'tel. 011 123456'],     // riga 8
      ],
    }), { nome: 'Fornitore', email: 'Email' })

    fireEvent.click(screen.getByRole('button', { name: /^Avanti$/ }))
    await waitFor(() => expect(screen.getByText(/Ecco cosa ho capito/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Vedi i dettagli delle 2 righe/ }))

    expect(container.textContent).toContain('Riga 6:')
    expect(container.textContent).toContain('Riga 8:')
    expect(container.textContent).not.toContain('Riga 3:')
    expect(container.textContent).not.toContain('Riga 4:')
  })
})
