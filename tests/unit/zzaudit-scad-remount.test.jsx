// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// 70 fatture tutte scadute (data_fattura vecchia, +30gg < oggi)
const FATT = Array.from({ length: 70 }, (_, i) => ({
  id: 'f' + i,
  organization_id: 'org1',
  sede_id: null,
  numero_rif: 'N' + i,
  data_fattura: '2026-01-' + String((i % 28) + 1).padStart(2, '0'),
  data_scadenza: null,
  fornitore: 'FORNITORE ' + i,
  totale: 100 + i,
  imponibile: 0, imposta: 0,
  stato: 'da_pagare',
  tipo: 'fattura',
  importo_pagato: 0,
  iban: null,
}))

function thenable(data) {
  const obj = {
    select: () => obj,
    eq: () => obj,
    or: () => obj,
    order: () => obj,
    then: (res) => Promise.resolve({ data, error: null }).then(res),
  }
  return obj
}

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    from: (t) => thenable(t === 'fatture' ? FATT : []),
  },
}))
vi.mock('../../src/lib/storage.js', () => ({
  sload: () => Promise.resolve(null),
  ssave: () => Promise.resolve(),
}))
vi.mock('../../src/lib/useIsMobile.js', () => ({
  default: () => false,
  useIsTablet: () => false,
}))

const { default: Scadenzario } = await import('../../src/components/Scadenzario.jsx')

describe('Scadenzario: remount dei componenti interni', () => {
  it('"Mostra tutte" si azzera e l\'input Importo perde il focus', async () => {
    render(<Scadenzario orgId="org1" sedeId={null} sedi={[]} />)
    // attende loadFatture
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    const conta = () => document.querySelectorAll('button[aria-label="Segna come pagata"]').length
    console.log('righe visibili all\'inizio:', conta())
    expect(conta()).toBe(60)

    const mostraTutte = screen.getByRole('button', { name: /Mostra tutte le 70 fatture/i })
    await act(async () => { fireEvent.click(mostraTutte) })
    console.log('righe visibili dopo "Mostra tutte (70)":', conta())
    expect(conta()).toBe(70)

    // Gesto reale: clicco "Segna pagata" sull'ultima riga (la 70esima)
    const bottoni = document.querySelectorAll('button[aria-label="Segna come pagata"]')
    const ultimo = bottoni[bottoni.length - 1]
    await act(async () => { fireEvent.click(ultimo) })
    console.log('righe visibili dopo click su "Segna pagata":', conta())

    // Il form di pagamento e' aperto?
    const importo = document.querySelector('input[aria-label="Importo pagato"]')
    console.log('form pagamento presente:', !!importo)
    if (importo) {
      importo.focus()
      console.log('focus prima di digitare:', document.activeElement === importo)
      await act(async () => { fireEvent.change(importo, { target: { value: '1' } }) })
      const dopo = document.querySelector('input[aria-label="Importo pagato"]')
      console.log('stesso nodo DOM dopo 1 carattere:', dopo === importo)
      console.log('focus dopo 1 carattere:', document.activeElement === dopo, '| activeElement =', document.activeElement?.tagName, document.activeElement?.getAttribute?.('aria-label'))
    }
  })

  it('focus perso digitando nell\'Importo (riga dentro le prime 60)', async () => {
    render(<Scadenzario orgId="org1" sedeId={null} sedi={[]} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const primo = document.querySelectorAll('button[aria-label="Segna come pagata"]')[0]
    await act(async () => { fireEvent.click(primo) })
    let importo = document.querySelector('input[aria-label="Importo pagato"]')
    console.log('AA form aperto:', !!importo)
    importo.focus()
    console.log('AA focus prima:', document.activeElement === importo)
    await act(async () => { fireEvent.change(importo, { target: { value: '2' } }) })
    const dopo = document.querySelector('input[aria-label="Importo pagato"]')
    console.log('AA stesso nodo DOM:', dopo === importo, '| valore:', dopo.value)
    console.log('AA focus dopo 1 carattere:', document.activeElement === dopo, '| activeElement:', document.activeElement?.tagName)
  })

  it('ricerca senza risultati: pagina vuota, contatori invariati', async () => {
    render(<Scadenzario orgId="org1" sedeId={null} sedi={[]} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const search = document.querySelector('#scad-search')
    await act(async () => { fireEvent.change(search, { target: { value: 'GRANDI SALUMI' } }) })
    const righe = document.querySelectorAll('button[aria-label="Segna come pagata"]').length
    const testo = document.body.textContent
    console.log('BB righe dopo ricerca senza risultati:', righe)
    console.log('BB compare "Nessuna fattura":', /Nessuna fattura/.test(testo))
    const m = testo.match(/(\d+) fatture · ([\d.,]+ €)/)
    console.log('BB contatore in pagina:', m && m[0])
    console.log('BB header:', (testo.match(/[\d.]+ fatture totali · [^·]+/) || [''])[0].trim())
  })

})
