// @vitest-environment happy-dom
//
// ── Il fornitore e l'import in blocco, nella pagina ───────────────────────
//
// Due richieste del titolare del 18/09/2026, agganciate alla pagina «Materie
// prime» dopo che due agenti ne avevano costruito le parti.
//
// **Il fornitore.** «Molto importante: ogni materia prima deve avere anche il
// nome del fornitore associato, così riusciamo a collegare tutto meglio.» Il
// campo esisteva già nel dato — veniva letto — ma non si poteva né vedere né
// scrivere da nessuna parte: una casella vuota che nessuno poteva riempire.
//
// **L'import in blocco.** Su 117 materie prime, 75 non hanno prezzo. Non
// perché il titolare non li sappia: perché scriverli uno per uno non lo fa
// nessuno. E accanto all'import ci va il modello da scaricare, che serve
// ancora di più — chi non sa che colonne mettere non ci prova nemmeno.
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MateriePrimeView from '../../src/views/MateriePrimeView.jsx'

const RICETTARIO = {
  ingredienti_costi: {
    panna: { costoKg: 4.7, costoG: 0.0047, fornitore: 'Latteria Rossi' },
    zucchero: { costoKg: 1.66, costoG: 0.00166 },
  },
  ricette: {
    'FIOR DI LATTE': { nome: 'FIOR DI LATTE', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'panna', qty1stampo: 500 }, { nome: 'zucchero', qty1stampo: 150 }] },
  },
}

function apri(extra = {}) {
  return render(<MateriePrimeView ricettario={RICETTARIO} logPrezzi={[]}
    onUpdatePrezzo={async () => {}} onCreaMateriaPrima={async () => ({ ok: true })}
    onRinominaMateriaPrima={async () => ({ ok: true })} onEliminaMateriaPrima={async () => ({ ok: true })}
    onImportPrezzi={async () => {}} onAssegnaFornitore={async () => {}}
    notify={() => {}} onNavigate={() => {}} {...extra} />)
}

describe('Il fornitore si vede e si scrive', () => {
  it('c’è una colonna «Fornitore»', () => {
    apri()
    expect(screen.getByText('Fornitore')).toBeTruthy()
  })

  it('e mostra chi ti vende quella materia prima', () => {
    apri()
    expect(screen.getByText('Latteria Rossi')).toBeTruthy()
  })

  it('quella senza fornitore dice «—», non una casella vuota che sembra un errore', () => {
    const { container } = apri()
    expect(container.textContent).toContain('—')
  })

  it('premendo «Modifica» si può scriverlo', () => {
    apri()
    fireEvent.click(screen.getAllByRole('button', { name: /modifica/i })[0])
    const campo = screen.getByLabelText(/^Fornitore di /i)
    expect(campo).toBeTruthy()
    expect(campo.getAttribute('placeholder')).toMatch(/fattura/i)
  })

  it('si salva da solo, senza passare dalla conferma dei prezzi', () => {
    // Cambiare chi ti vende una cosa non cambia nessun costo del passato: la
    // finestra di conferma esiste per i prezzi, che il food cost storico lo
    // toccano davvero, e qui sarebbe solo un ostacolo.
    const assegna = vi.fn()
    apri({ onAssegnaFornitore: assegna })
    fireEvent.click(screen.getAllByRole('button', { name: /modifica/i })[0])
    const campo = screen.getByLabelText(/^Fornitore di /i)
    fireEvent.change(campo, { target: { value: 'Caseificio Bianchi' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(assegna).toHaveBeenCalled()
    expect(assegna.mock.calls[0][1]).toBe('Caseificio Bianchi')
  })
})

describe('I prezzi si possono portare dentro tutti insieme', () => {
  it('c’è il comando per importare', () => {
    apri()
    expect(screen.getByText(/importa prezzi/i)).toBeTruthy()
  })

  it('e quello per scaricare il modello, che serve ancora di più', () => {
    apri()
    expect(screen.getByRole('button', { name: /scarica l/i })).toBeTruthy()
  })

  it('l’import accetta i formati che arrivano davvero dai fornitori', () => {
    const { container } = apri()
    const campo = container.querySelector('input[type="file"]')
    expect(campo).toBeTruthy()
    const accetta = campo.getAttribute('accept')
    for (const est of ['.xlsx', '.xls', '.csv']) expect(accetta).toContain(est)
  })
})
