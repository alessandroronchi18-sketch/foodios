// @vitest-environment happy-dom
//
// ── Di un file a più fogli, quali leggere: lo chiede ────────────────────
//
// Un Excel con le schede «Gusti», «Torte», «Archivio 2024»: fino al
// 22/09/2026 ne entrava **solo il primo**. Dal 19/09 il programma almeno lo
// diceva a cose fatte, ma sceglieva lui — e il primo foglio non è quasi mai
// quello giusto: nei file veri davanti c'è la copertina, o il riepilogo, o
// l'anno scorso.
//
// Decisione del titolare, 22/09/2026: «chiede quali leggere».
//
// Chiedere e poi decidere da soli sarebbe peggio che non chiedere: finché la
// risposta non arriva, il programma non va avanti.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act, screen } from '@testing-library/react'
import * as XLSX from 'xlsx'

vi.mock('../../src/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }) },
  from: () => ({ select: () => ({ eq: () => ({ then: r => r({ data: [], error: null }) }) }) }),
} }))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

vi.mock('../../src/lib/xlsx', () => ({ loadXLSX: async () => XLSX }))

// Il riconoscimento del formato e l'abbinamento delle colonne passano dal
// server: qui non c'entrano, e si sostituiscono con risposte ferme.
const mappaturaFinta = { mapping: { nome: 'Nome' }, confidence: {}, notes: '' }
vi.mock('../../src/lib/importAiMap', () => ({
  callImportMap: async () => mappaturaFinta,
  callImportDetectFormat: async () => ({ format: 'long', unpivot_config: null, notes: '' }),
  saveImportMapping: () => {},
}))

const { default: ImportWizard } = await import('../../src/components/ImportWizard.jsx')

/** Un file Excel vero, con i fogli che gli si passano. */
function fileExcel(fogli, nome = 'listino.xlsx') {
  const wb = XLSX.utils.book_new()
  for (const [foglio, righe] of Object.entries(fogli)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), foglio)
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const f = new File([buf], nome, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  f.arrayBuffer = async () => buf
  return f
}

const TRE_FOGLI = {
  Copertina: [['Listino 2026'], ['Molino Rossi']],
  Gusti: [['Nome', 'Prezzo'], ['Pistacchio', '30'], ['Nocciola', '28']],
  Torte: [['Nome', 'Prezzo'], ['Sacher', '22']],
}

async function caricaFile(file) {
  render(<ImportWizard orgId="org-1" initialEntity="fornitori" notify={() => {}} />)
  const input = document.getElementById('import-file-input')
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Avanti$/ })) })
}

beforeEach(() => { mappaturaFinta.mapping = { nome: 'Nome' } })
afterEach(() => { cleanup(); vi.resetModules() })

describe('Con più fogli, si ferma e chiede', () => {
  it('dice quanti sono e li elenca', async () => {
    await caricaFile(fileExcel(TRE_FOGLI))
    await waitFor(() => expect(document.body.textContent).toMatch(/quali leggo/i))
    expect(document.body.textContent).toMatch(/Gusti/)
    expect(document.body.textContent).toMatch(/Torte/)
  })

  it('di ognuno dice righe, colonne e intestazioni', async () => {
    // Sono le tre cose con cui si riconosce il foglio giusto senza aprire il
    // file. «Foglio 2» da solo non aiuta nessuno.
    await caricaFile(fileExcel(TRE_FOGLI))
    await waitFor(() => expect(document.body.textContent).toMatch(/quali leggo/i))
    expect(document.body.textContent).toMatch(/2 righe/)
    expect(document.body.textContent).toMatch(/2 colonne/)
    expect(document.body.textContent).toMatch(/Nome \| Prezzo/)
  })

  it('e NON va avanti da solo', async () => {
    // Il difetto di prima: sceglieva il primo foglio e tirava dritto.
    await caricaFile(fileExcel(TRE_FOGLI))
    await waitFor(() => expect(document.body.textContent).toMatch(/quali leggo/i))
    expect(document.body.textContent, 'è passato alla schermata dopo senza chiedere')
      .not.toMatch(/Controlla che sia tutto giusto/)
  })

  it('il comando resta spento se non si sceglie niente', async () => {
    await caricaFile(fileExcel(TRE_FOGLI))
    await waitFor(() => expect(document.body.textContent).toMatch(/quali leggo/i))
    const caselle = [...document.querySelectorAll('input[type="checkbox"]')]
    act(() => { caselle.forEach(c => { if (c.checked) fireEvent.click(c) }) })
    await waitFor(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Leggi questo foglio|Leggi questi/.test(x.textContent || ''))
      expect(b.disabled).toBe(true)
    })
  })
})

describe('Con un foglio solo non chiede niente', () => {
  it('va avanti come prima', async () => {
    await caricaFile(fileExcel({ Gusti: [['Nome', 'Prezzo'], ['Pistacchio', '30']] }))
    await waitFor(() => expect(document.body.textContent).toMatch(/Controlla che sia tutto giusto/), { timeout: 5000 })
    expect(document.body.textContent).not.toMatch(/quali leggo/i)
  })

  it('e nemmeno se gli altri fogli sono vuoti', async () => {
    // Un foglio vuoto non è una scelta: chiederlo sarebbe una domanda finta.
    await caricaFile(fileExcel({
      Gusti: [['Nome', 'Prezzo'], ['Pistacchio', '30']],
      Vuoto: [],
    }))
    await waitFor(() => expect(document.body.textContent).toMatch(/Controlla che sia tutto giusto/), { timeout: 5000 })
    expect(document.body.textContent).not.toMatch(/quali leggo/i)
  })
})

describe('Scegliendo, si va avanti con quello che si è scelto', () => {
  it('un foglio solo: entra quello', async () => {
    await caricaFile(fileExcel(TRE_FOGLI))
    await waitFor(() => expect(document.body.textContent).toMatch(/quali leggo/i))
    // si toglie la Copertina (prima, scelta di suo) e si prende Gusti
    const caselle = [...document.querySelectorAll('input[type="checkbox"]')]
    act(() => { fireEvent.click(caselle[0]) })   // via la Copertina
    act(() => { fireEvent.click(caselle[1]) })   // dentro Gusti
    const avanti = [...document.querySelectorAll('button')].find(x => /Leggi questo foglio/.test(x.textContent || ''))
    await act(async () => { fireEvent.click(avanti) })
    await waitFor(() => expect(document.body.textContent).toMatch(/Controlla che sia tutto giusto/), { timeout: 5000 })
  })
})

describe('Il righello di questo file', () => {
  it('il file di prova ha davvero tre fogli con righe diverse', () => {
    expect(Object.keys(TRE_FOGLI)).toHaveLength(3)
    expect(TRE_FOGLI.Gusti.length).not.toBe(TRE_FOGLI.Torte.length)
  })
})
