// @vitest-environment happy-dom
//
// ── I semilavorati non compaiono fra i prodotti ───────────────────────────
//
// 18/09/2026. Questo file nasce da una cosa che stavo per fare e che era
// sbagliata, e il racconto vale più della regola.
//
// Tolti i semilavorati dal fondo della scheda «Gusti», nessun punto del
// prodotto passa più `variant="semilavorato"` a `TortaCard`. Avevo concluso
// che le 27 diramazioni su `isSemi` dentro quel componente fossero codice
// morto, e stavo per cancellarle.
//
// Non lo sono. `isSemi` non guarda solo il `variant`:
//
//     const isSemi = variant === 'semilavorato' || tipoEff === 'semilavorato'
//
// e `tipoEff` legge `ricetta.tipo`, mentre il filtro dell'elenco usa
// `getR(nome, ricetta).tipo`. Le due cose **non sono la stessa**: `getR`, se
// la ricetta non ha il campo `unita`, non guarda affatto `ricetta.tipo` e
// ripiega su una tabella interna. Quindi una ricetta con `tipo:
// 'semilavorato'` **e senza `unita`** — che un'importazione può benissimo
// produrre — passa il filtro e arriva alla scheda con `isSemi` vero.
//
// Sui dati veri di Mara dei Boschi oggi non capita: tutti e cinque i
// semilavorati hanno `unita: 0`, che basta a farli filtrare. Ma «oggi non
// capita» non è «non può capitare», e quelle diramazioni sono l'unica cosa
// che impedisce a una base di comparire fra i gusti vestita da torta.
//
// Quindi restano, e questo file tiene fissa la regola vera: nell'elenco dei
// prodotti i semilavorati non ci vanno. Se un domani ci finissero, si vede
// qui invece che nel Ricettario di un cliente.
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import RicettarioView from '../../src/views/RicettarioView.jsx'

function disegna(ricette) {
  return render(
    <RicettarioView ricettario={{ ingredienti_costi: { panna: { costoKg: 4.7, costoG: 0.0047 } }, ricette }}
      onUpdateRegola={() => {}} onUpload={() => {}} onEditRicetta={() => {}} onNuovaRicetta={() => {}}
      orgId="o1" sedi={[]} sedeAttiva={null} notify={() => {}} metodoProduzione="stampi" />
  )
}

const GUSTO = {
  nome: 'FIOR DI LATTE', tipo: 'gusto', unita: 1, prezzo: 0,
  ingredienti: [{ nome: 'panna', qty1stampo: 500 }],
}

describe('Nell’elenco dei prodotti i semilavorati non ci sono', () => {
  it('un semilavorato con `unita: 0` resta fuori', () => {
    const { container } = disegna({
      'FIOR DI LATTE': GUSTO,
      'BASE BIANCA': { nome: 'BASE BIANCA', tipo: 'semilavorato', unita: 0, prezzo: 0,
        ingredienti: [{ nome: 'panna', qty1stampo: 1000 }] },
    })
    expect(container.textContent).toContain('FIOR DI LATTE')
    expect(container.textContent).not.toContain('BASE BIANCA')
  })

  it('e resta fuori anche SENZA il campo `unita` — è il caso che mi era sfuggito', () => {
    // Questa è la forma che può arrivare da un'importazione: il tipo c'è, il
    // numero di porzioni no. `getR` in quel caso ignora `ricetta.tipo`, quindi
    // il filtro va scritto in modo da non dipendere solo da lui.
    const { container } = disegna({
      'FIOR DI LATTE': GUSTO,
      'BASE IMPORTATA': { nome: 'BASE IMPORTATA', tipo: 'semilavorato', prezzo: 0,
        ingredienti: [{ nome: 'panna', qty1stampo: 1000 }] },
    })
    expect(container.textContent).toContain('FIOR DI LATTE')
    expect(container.textContent, 'una base è comparsa fra i prodotti').not.toContain('BASE IMPORTATA')
  })

  it('anche una base «interna» (costo scritto a mano) resta fuori', () => {
    const { container } = disegna({
      'FIOR DI LATTE': GUSTO,
      'BASE MARA': { nome: 'BASE MARA', tipo: 'interno', unita: 0, prezzo: 0,
        ingredienti: [{ nome: 'panna', qty1stampo: 1000 }] },
    })
    expect(container.textContent).not.toContain('BASE MARA')
  })
})

describe('Le diramazioni per i semilavorati restano nel componente', () => {
  it('`isSemi` guarda anche il tipo della ricetta, non solo il `variant`', async () => {
    // Se qualcuno le togliesse credendole morte — stavo per farlo io — una
    // base importata senza `unita` comparirebbe fra i gusti vestita da torta.
    const fs = await import('node:fs')
    const src = fs.readFileSync('src/views/RicettarioView.jsx', 'utf8')
    expect(src).toMatch(/const isSemi = variant === 'semilavorato' \|\| tipoEff === 'semilavorato'/)
  })
})
