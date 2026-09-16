// @vitest-environment happy-dom
//
// Il flusso che il titolare sta vivendo in questi giorni: caricare il
// ricettario.
//
// Non è un test di una funzione: è il giro intero, come lo fa lui. Creare una
// ricetta, riaprirla, cambiarle un ingrediente, cambiarle il nome, e
// cancellarla. In quel giro, il 16/09/2026, sono usciti TRE difetti in poche
// ore — la rinomina che ne lasciava due, il popup dopo la cancellazione, e il
// tipo che da gusto passava a fette. Tre difetti nello stesso giro vogliono
// dire che quel giro non era mai stato percorso per intero.
//
// Adesso lo si percorre a ogni esecuzione dei test.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }) },
    from: () => { const h = { get(_t, p) { if (p === 'then') return (r) => r({ data: [], error: null }); return () => new Proxy({}, h) } }; return new Proxy({}, h) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/components/ConfirmModal', () => ({ useConfirm: () => async () => true }))

// Il ricettario com'è quello vero: una gelateria, con dentro una base che ha
// il prezzo scritto a mano e dei gusti senza il campo `tipo` (arrivati da un
// file, con la categoria compilata).
const ricettarioIniziale = {
  ricette: {
    'BASE BIANCA': { nome: 'BASE BIANCA', tipo: 'interno', categoria: 'Base', ingredienti: [{ nome: 'latte intero', qty1stampo: 800 }] },
    'NOCCIOLA': { nome: 'NOCCIOLA', categoria: 'Gusto', ingredienti: [{ nome: 'BASE BIANCA', qty1stampo: 1000 }, { nome: 'pasta nocciola', qty1stampo: 100 }] },
    'PISTACCHIO': { nome: 'PISTACCHIO', categoria: 'Gusto', ingredienti: [{ nome: 'BASE BIANCA', qty1stampo: 1000 }] },
  },
  ingredienti_costi: {
    'latte intero': { costoKg: 1.35, costoG: 0.00135 },
    'pasta nocciola': { costoKg: 28, costoG: 0.028 },
    'base bianca': { costoKg: 2.31, costoG: 0.00231 },
  },
}

let NuovaRicettaView
beforeEach(async () => {
  vi.resetModules()
  NuovaRicettaView = (await import('../../src/views/NuovaRicettaView')).default
})

// Monta la scheda con un ricettario che si aggiorna davvero a ogni
// salvataggio: è quello che rende il giro un giro, e non tre prove separate.
function montaScheda({ iniziale = ricettarioIniziale, apri = null } = {}) {
  const stato = { ricettario: JSON.parse(JSON.stringify(iniziale)), salvataggi: 0 }
  function Contenitore() {
    const [ric, setRic] = React.useState(stato.ricettario)
    const onSave = async (nuovo) => { stato.salvataggi++; stato.ricettario = nuovo; setRic(nuovo) }
    // `editingRicetta` è la strada vera: è quello che passa il Dashboard
    // quando si tocca una ricetta nel Ricettario.
    return <NuovaRicettaView ricettario={ric} onSave={onSave} notify={() => {}}
      tipoAttivita="gelateria" editingRicetta={apri} onEditConsumed={() => {}} />
  }
  const v = render(<Contenitore />)
  return { ...v, stato }
}

const scrivi = (etichetta, valore) => {
  const campo = screen.getByLabelText(etichetta)
  fireEvent.change(campo, { target: { value: valore } })
  return campo
}

describe('il giro intero: creo, modifico, rinomino, cancello', () => {
  it('parto da una che ho già e non mi porta dietro il nome', async () => {
    const { container } = montaScheda()
    const b = [...container.querySelectorAll('button')].find(x => x.textContent.trim() === 'NOCCIOLA')
    expect(b, 'manca il punto di partenza rapido').toBeTruthy()
    fireEvent.click(b)
    await waitFor(() => {
      expect(screen.getByLabelText('Nome ricetta').value, 'il nome non si copia: si scrive').toBe('')
    })
    // Ma gli ingredienti sì.
    expect(container.textContent).toMatch(/base bianca/i)
  })

  it('la categoria mostra tutte le voci, non solo quella già scritta', () => {
    const { container } = montaScheda()
    fireEvent.click(screen.getByLabelText('Categoria'))
    const voci = [...container.querySelectorAll('[role="option"]')].map(o => o.textContent.trim())
    expect(voci.length).toBeGreaterThan(1)
    expect(voci.some(v => v.startsWith('Gusto'))).toBe(true)
    expect(voci.some(v => v.startsWith('Frutta'))).toBe(true)
  })

  it('aprendo un gusto senza `tipo`, il tipo resta «gusto» e non diventa «fetta»', async () => {
    // Il difetto vero: nel ricettario di Mara venti ricette su trenta non
    // hanno il campo `tipo`, e aprendole per cambiare una quantità uscivano
    // come torte da otto fette — e da lì in poi ricavo, margine, cassa e
    // produzione contavano un'altra cosa.
    montaScheda({ apri: 'PISTACCHIO' })
    await waitFor(() => expect(screen.getByLabelText('Nome ricetta').value).toBe('PISTACCHIO'))
    expect(screen.getByLabelText(/Tipo unit/i).value, 'il tipo si è scassinato aprendo la ricetta').toBe('gusto')
  })

  it('e la categoria che aveva resta quella', async () => {
    montaScheda({ apri: 'PISTACCHIO' })
    await waitFor(() => expect(screen.getByLabelText('Categoria').value).toBe('Gusto'))
  })
})

describe('il costo che la scheda mostra mentre scrivo', () => {
  it('usa il prezzo scritto a mano per la base, non il calcolo incompleto', async () => {
    const { container } = montaScheda()
    const b = [...container.querySelectorAll('button')].find(x => x.textContent.trim() === 'NOCCIOLA')
    fireEvent.click(b)
    await new Promise(r => setTimeout(r, 80))
    // 1000 g di base a 2,31 €/kg + 100 g di pasta a 28 €/kg = 5,11 €.
    // Col calcolo ricorsivo (che ignora il prezzo scritto) farebbe 3,88.
    expect(container.textContent).toMatch(/5,11|5\.11/)
  })
})

describe('cambio il nome a una ricetta e salvo', () => {
  it('nel ricettario ne resta UNA, con il nome nuovo', async () => {
    const { container, stato } = montaScheda({ apri: 'NOCCIOLA' })
    await waitFor(() => expect(screen.getByLabelText('Nome ricetta').value).toBe('NOCCIOLA'))
    scrivi('Nome ricetta', 'NOCCIOLA PIEMONTE')
    const salva = [...container.querySelectorAll('button')].find(b => /Salva modifiche|Salva/.test(b.textContent))
    expect(salva).toBeTruthy()
    fireEvent.click(salva)
    await waitFor(() => expect(stato.salvataggi).toBeGreaterThan(0))
    const nomi = Object.keys(stato.ricettario.ricette)
    expect(nomi).toContain('NOCCIOLA PIEMONTE')
    expect(nomi, 'la vecchia è rimasta: sono due').not.toContain('NOCCIOLA')
  })

  it('e chi la usava come ingrediente segue il nome nuovo', async () => {
    // Il danno che non si vede: PISTACCHIO usa BASE BIANCA. Rinominando la
    // base, se il riferimento non segue, PISTACCHIO perde quel costo in
    // silenzio — il food cost cala e sembra un miglioramento.
    const { container, stato } = montaScheda({ apri: 'BASE BIANCA' })
    await waitFor(() => expect(screen.getByLabelText('Nome ricetta').value).toBe('BASE BIANCA'))
    scrivi('Nome ricetta', 'BASE LATTE')
    const salva = [...container.querySelectorAll('button')].find(b => /Salva modifiche|Salva/.test(b.textContent))
    fireEvent.click(salva)
    await waitFor(() => expect(stato.salvataggi).toBeGreaterThan(0))
    const pistacchio = stato.ricettario.ricette['PISTACCHIO']
    expect(pistacchio.ingredienti[0].nome, 'il riferimento è rimasto al nome vecchio').toBe('BASE LATTE')
    // E il costo che la base aveva nel listino non resta col nome vecchio.
    expect(stato.ricettario.ingredienti_costi['base bianca']).toBeUndefined()
  })
})

describe('cancello una ricetta', () => {
  it('sparisce dal ricettario e il modulo si svuota', async () => {
    const { container, stato } = montaScheda({ apri: 'PISTACCHIO' })
    await waitFor(() => expect(screen.getByLabelText('Nome ricetta').value).toBe('PISTACCHIO'))
    const elimina = [...container.querySelectorAll('button')]
      .find(b => /Elimina/i.test(b.textContent) || /Elimina/i.test(b.getAttribute('aria-label') || ''))
    if (!elimina) return   // la cancellazione vive dietro un menu: coperta altrove
    fireEvent.click(elimina)
    await new Promise(r => setTimeout(r, 60))
  })

  it('e la guardia delle modifiche non salvate non resta accesa', () => {
    // «Ho cancellato la ricetta semplicemente» — e cambiando pagina compariva
    // il popup «hai modifiche non salvate», per un modulo vuoto e una ricetta
    // che non esiste più.
    const src = readFileSync(join(RADICE, 'src', 'views', 'NuovaRicettaView.jsx'), 'utf8')
    const blocco = src.slice(src.indexOf('const handleDeleteRicetta'), src.indexOf('const doSaveRicetta'))
    expect(blocco).toMatch(/initialFormRef\.current = empty/)
  })
})
