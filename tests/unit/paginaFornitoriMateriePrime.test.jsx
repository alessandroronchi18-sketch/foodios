// @vitest-environment happy-dom
//
// La pagina «Fornitori e materie prime».
//
// Richiesta del titolare, 19/09/2026: «crea una nuova pagina molto semplice,
// intuitiva, intelligente e migliore di sempre, con i nomi dei fornitori e le
// materie prime a loro collegate. Uno può modificare quando vuole i
// collegamenti tra materie prime e fornitori o viceversa. Una materia prima
// può avere più fornitori e un fornitore può dare più materie prime. Questa è
// la pagina dove si atterra se nella pagina Materie prime clicco nella colonna
// Fornitori su un nome».
//
// Cosa c'era prima: niente. Il fornitore di una materia prima era UNO, si
// scriveva solo dalla riga della pagina Materie prime, e non esisteva nessun
// posto dove vedere «di questo fornitore compro queste otto cose».
//
// Cosa protegge questo file, in ordine di quanto costa se si rompe:
//
//  1. **l'atterraggio.** Chi clicca un nome dalla pagina Materie prime deve
//     trovarsi SU quel fornitore. In cima a un elenco non ci si atterra: ci si
//     perde, e la gente smette di cliccare;
//  2. **i due versi.** Partire dal fornitore e partire dalla materia prima
//     sono la stessa relazione, e devono funzionare tutti e due;
//  3. **il molti-a-molti scritto bene.** Quando si collega il secondo
//     fornitore, quello che finisce in archivio deve avere l'array `fornitori`
//     E il vecchio campo `fornitore` allineato al primo — se no la colonna
//     della pagina Materie prime, che legge ancora il vecchio campo, si svuota;
//  4. **i numeri per cui la pagina esiste.** Quante materie prime per
//     fornitore e quante di quelle senza prezzo; e le materie prime senza
//     nessun fornitore, che sono il lavoro da fare;
//  5. **il salvataggio che fallisce non cambia niente a schermo.**

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const schermo = vi.hoisted(() => ({ mobile: false, tablet: false }))
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => schermo.mobile,
  useIsTablet: () => schermo.tablet,
}))

import FornitoriMateriePrimeView from '../../src/views/FornitoriMateriePrimeView.jsx'
import { fornitoriDiVoce } from '../../src/lib/fornitoriMateriePrime'

// Un ricettario come quelli veri: qualche fornitore scritto col vecchio campo,
// una materia prima con due fornitori, una senza prezzo, una senza nessuno.
const RICETTARIO = {
  ricette: {},
  ingredienti_costi: {
    panna:     { costoKg: 4.7, costoG: 0.0047, fornitore: 'Latteria Rossi', fornitori: ['Latteria Rossi', 'Cash & Carry Zeta'] },
    burro:     { costoKg: 9.2, costoG: 0.0092, fornitore: 'Latteria Rossi' },
    pistacchi: { costoKg: null, costoG: null, fornitore: 'Az. Agricola Bianchi' },
    zucchero:  { costoKg: 1.66, costoG: 0.00166 },
  },
}

function apri(extra = {}) {
  const salvataggi = []
  const avvisi = []
  const v = render(
    <FornitoriMateriePrimeView
      ricettario={RICETTARIO}
      onSalvaRicettario={async (nuovo) => { salvataggi.push(nuovo) }}
      notify={(msg, ok = true) => avvisi.push({ msg, ok })}
      onNavigate={() => {}}
      {...extra} />,
  )
  return { v, salvataggi, avvisi }
}

const bottoni = (v) => [...v.container.querySelectorAll('button')]
const bottone = (v, testo) => bottoni(v).find(b => b.textContent.trim() === testo)
const bottoneChe = (v, re) => bottoni(v).find(b => re.test(b.textContent))

beforeEach(() => { schermo.mobile = false; schermo.tablet = false })

// ────────────────────────────────────────────────────────────────────────────

describe('si atterra sul fornitore, non in cima all’elenco', () => {
  it('con `fornitoreDaAprire` la scheda aperta è quella di quel fornitore', () => {
    const { v } = apri({ fornitoreDaAprire: 'Latteria Rossi' })
    const titolo = v.container.querySelector('h2')
    expect(titolo.textContent).toBe('Latteria Rossi')
    // E dentro ci sono le sue materie prime, non quelle di un altro.
    expect(v.container.textContent).toContain('burro')
    expect(v.container.textContent).toContain('panna')
  })

  it('il nome si riconosce anche scritto con altre maiuscole o spazi doppi', () => {
    // Nelle materie prime è scritto come compare in fattura: la stessa persona
    // può essere «Latteria Rossi» in un posto e «latteria  rossi» in un altro.
    const { v } = apri({ fornitoreDaAprire: '  latteria   rossi ' })
    expect(v.container.querySelector('h2').textContent).toBe('Latteria Rossi')
  })

  it('e avvisa chi l’ha mandata che l’atterraggio è avvenuto', () => {
    const fatto = vi.fn()
    apri({ fornitoreDaAprire: 'Latteria Rossi', onFornitoreAperto: fatto })
    expect(fatto).toHaveBeenCalled()
  })

  it('un fornitore in anagrafica ma senza niente collegato si apre lo stesso, vuoto', () => {
    // È il caso di chi l'ha appena aggiunto: non è un errore, è il momento in
    // cui gli si collega la prima materia prima.
    const { v } = apri({ fornitoreDaAprire: 'Molino Nuovo' })
    expect(v.container.querySelector('h2').textContent).toBe('Molino Nuovo')
    expect(v.container.textContent).toContain('Non gli hai ancora collegato niente')
    expect(screen.getByLabelText('Materia prima da collegare a Molino Nuovo')).toBeTruthy()
  })
})

describe('i due versi della stessa relazione', () => {
  it('partendo dal fornitore si vede cosa gli compri', () => {
    const { v } = apri()
    fireEvent.click(bottoneChe(v, /^Latteria Rossi/))
    expect(v.container.querySelector('h2').textContent).toBe('Latteria Rossi')
    expect(v.container.textContent).toContain('2 materie prime')
  })

  it('partendo dalla materia prima si vede chi te la vende', () => {
    const { v } = apri()
    fireEvent.click(bottone(v, 'Dalle materie prime'))
    fireEvent.click(bottoneChe(v, /^panna/))
    expect(v.container.querySelector('h2').textContent).toBe('panna')
    expect(screen.getByLabelText('Scollega Latteria Rossi da panna')).toBeTruthy()
    expect(screen.getByLabelText('Scollega Cash & Carry Zeta da panna')).toBeTruthy()
  })

  it('dal fornitore si salta alla materia prima e si resta su quella', () => {
    // «o viceversa»: è la stessa riga di dati guardata dall'altro lato.
    const { v } = apri({ fornitoreDaAprire: 'Latteria Rossi' })
    fireEvent.click(bottone(v, 'burro'))
    expect(v.container.querySelector('h2').textContent).toBe('burro')
  })
})

describe('una materia prima può avere più fornitori', () => {
  it('collegandone un altro, in archivio finisce la lista intera', async () => {
    const { v, salvataggi } = apri()
    fireEvent.click(bottone(v, 'Dalle materie prime'))
    fireEvent.click(bottoneChe(v, /^burro/))
    const campo = screen.getByLabelText('Fornitore da collegare a burro')
    fireEvent.change(campo, { target: { value: 'Cash & Carry Zeta' } })
    await act(async () => { fireEvent.click(bottone(v, 'Collega')) })

    const voce = salvataggi.at(-1).ingredienti_costi.burro
    expect(fornitoriDiVoce(voce)).toEqual(['Latteria Rossi', 'Cash & Carry Zeta'])
  })

  it('e il vecchio campo `fornitore` resta allineato al primo', async () => {
    // La colonna «Fornitore» della pagina Materie prime legge ancora quello:
    // se non lo si tiene allineato, si svuota appena si aggiunge il secondo.
    const { v, salvataggi } = apri()
    fireEvent.click(bottone(v, 'Dalle materie prime'))
    fireEvent.click(bottoneChe(v, /^burro/))
    fireEvent.change(screen.getByLabelText('Fornitore da collegare a burro'), { target: { value: 'Cash & Carry Zeta' } })
    await act(async () => { fireEvent.click(bottone(v, 'Collega')) })

    const voce = salvataggi.at(-1).ingredienti_costi.burro
    expect(voce.fornitore).toBe('Latteria Rossi')
    expect(voce.fornitori).toEqual(['Latteria Rossi', 'Cash & Carry Zeta'])
  })

  it('collegare lo stesso due volte non scrive niente e lo dice', async () => {
    const { v, salvataggi, avvisi } = apri()
    fireEvent.click(bottone(v, 'Dalle materie prime'))
    fireEvent.click(bottoneChe(v, /^burro/))
    fireEvent.change(screen.getByLabelText('Fornitore da collegare a burro'), { target: { value: 'latteria rossi' } })
    await act(async () => { fireEvent.click(bottone(v, 'Collega')) })
    expect(salvataggi).toHaveLength(0)
    expect(avvisi.at(-1).ok).toBe(false)
    expect(avvisi.at(-1).msg).toContain('già')
  })

  it('scollegare toglie solo quello scelto', async () => {
    const { v, salvataggi } = apri({ fornitoreDaAprire: 'Latteria Rossi' })
    await act(async () => { fireEvent.click(screen.getByLabelText('Scollega panna da Latteria Rossi')) })
    const voce = salvataggi.at(-1).ingredienti_costi.panna
    expect(fornitoriDiVoce(voce)).toEqual(['Cash & Carry Zeta'])
    expect(voce.costoKg).toBe(4.7)   // il prezzo non c'entra con chi te la vende
  })

  it('il fornitore abituale si può cambiare', async () => {
    // È quello che si vede fuori di qui: nella colonna Fornitore, nei messaggi
    // di riordino. Chi ne ha due deve poter dire qual è quello di tutti i giorni.
    const { v, salvataggi } = apri()
    fireEvent.click(bottone(v, 'Dalle materie prime'))
    fireEvent.click(bottoneChe(v, /^panna/))
    await act(async () => { fireEvent.click(bottone(v, 'Rendi abituale')) })
    expect(salvataggi.at(-1).ingredienti_costi.panna.fornitore).toBe('Cash & Carry Zeta')
  })

  it('collegare una materia prima a un fornitore, dall’altro verso', async () => {
    const { v, salvataggi } = apri({ fornitoreDaAprire: 'Az. Agricola Bianchi' })
    fireEvent.change(screen.getByLabelText('Materia prima da collegare a Az. Agricola Bianchi'), { target: { value: 'zucchero' } })
    await act(async () => { fireEvent.click(bottone(v, 'Collega')) })
    const voce = salvataggi.at(-1).ingredienti_costi.zucchero
    expect(voce.fornitore).toBe('Az. Agricola Bianchi')
  })
})

describe('i numeri per cui la pagina esiste', () => {
  it('ogni fornitore dice quante materie prime NON hanno prezzo', () => {
    // È il numero su cui si decide chi chiamare: ogni materia prima senza
    // prezzo è un buco nel food cost che non si vede da nessuna parte.
    const { v } = apri()
    const riga = bottoneChe(v, /^Az\. Agricola Bianchi/)
    expect(riga.textContent).toContain('1 senza prezzo')
  })

  it('un fornitore con tutti i prezzi non mostra nessun avviso', () => {
    const { v } = apri()
    expect(bottoneChe(v, /^Latteria Rossi/).textContent).not.toContain('senza prezzo')
  })

  it('le materie prime senza nessun fornitore sono in elenco, non nascoste', () => {
    const { v } = apri()
    const riga = bottoneChe(v, /^Senza fornitore/)
    expect(riga).toBeTruthy()
    fireEvent.click(riga)
    expect(v.container.querySelector('h2').textContent).toBe('Materie prime senza fornitore')
    expect(v.container.textContent).toContain('zucchero')
  })

  it('le tessere in cima contano collegate, senza prezzo e senza fornitore', () => {
    const { v } = apri()
    const testo = v.container.textContent
    expect(testo).toContain('Materie prime collegate')
    expect(testo).toContain('su 4 in archivio')
    expect(testo).toContain('Senza fornitore')
  })

  it('il prezzo si scrive all’italiana, col simbolo dopo la cifra', () => {
    const { v } = apri({ fornitoreDaAprire: 'Latteria Rossi' })
    expect(v.container.textContent).toContain('9,20 €/kg')
    expect(v.container.textContent).not.toContain('€ 9,20')
  })

  it('il prezzo che manca si dichiara, non diventa zero', () => {
    // Food cost zero non è «gratis», è «non lo so».
    const { v } = apri({ fornitoreDaAprire: 'Az. Agricola Bianchi' })
    expect(v.container.textContent).toContain('prezzo da mettere')
    expect(v.container.textContent).not.toContain('0,00 €/kg')
  })

  it('due grafie dello stesso nome si dicono, invece di nasconderle', () => {
    const storto = { ricette: {}, ingredienti_costi: {
      panna: { costoKg: 4.7, fornitore: 'Molino Rossi' },
      farina: { costoKg: 1.1, fornitore: 'molino  rossi' },
    } }
    const { v } = apri({ ricettario: storto, fornitoreDaAprire: 'Molino Rossi' })
    expect(v.container.textContent).toContain('scritto in 2 modi diversi')
  })
})

describe('quando il salvataggio non riesce', () => {
  it('lo dice e non fa finta di niente', async () => {
    const { v, avvisi } = apri({
      fornitoreDaAprire: 'Latteria Rossi',
      onSalvaRicettario: async () => { throw new Error('rete assente') },
    })
    await act(async () => { fireEvent.click(screen.getByLabelText('Scollega burro da Latteria Rossi')) })
    expect(avvisi.at(-1).ok).toBe(false)
    expect(avvisi.at(-1).msg).toContain('rete assente')
    // E a schermo il collegamento c'è ancora: lo state è il ricettario vero.
    expect(v.container.textContent).toContain('burro')
  })
})

describe('senza niente in archivio', () => {
  it('non mostra una pagina vuota, dice da dove si comincia', () => {
    const { v } = apri({ ricettario: { ricette: {}, ingredienti_costi: {} } })
    expect(v.container.textContent).toContain('Non hai ancora materie prime in archivio')
    expect(bottone(v, 'Vai alle materie prime')).toBeTruthy()
  })
})

describe('col dito: telefono e tablet', () => {
  for (const [come, stato] of [['telefono', { mobile: true, tablet: false }], ['tablet', { mobile: false, tablet: true }]]) {
    it(`su ${come} i comandi sono grandi almeno 44px e si torna indietro`, () => {
      schermo.mobile = stato.mobile
      schermo.tablet = stato.tablet
      const { v } = apri({ fornitoreDaAprire: 'Latteria Rossi' })
      // Il tablet si tocca col dito come il telefono: la soglia vale per tutti
      // e due, non solo per il più piccolo.
      const indietro = screen.getByLabelText('Torna all’elenco')
      expect(parseInt(indietro.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
      const scollega = screen.getByLabelText('Scollega burro da Latteria Rossi')
      expect(parseInt(scollega.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
      // Il campo di testo a 16px: sotto, iOS ingrandisce la pagina da solo.
      const campo = screen.getByLabelText('Materia prima da collegare a Latteria Rossi')
      expect(parseInt(campo.style.fontSize, 10)).toBeGreaterThanOrEqual(16)
    })
  }

  it('sul telefono elenco e scheda non stanno affiancati', () => {
    schermo.mobile = true
    const { v } = apri()
    // Senza niente scelto si vede l'elenco; scegliendo, si vede la scheda. Due
    // colonne su 390px vorrebbero dire due colonne da 180, illeggibili.
    expect(screen.getByLabelText('Cerca un fornitore')).toBeTruthy()
    fireEvent.click(bottoneChe(v, /^Latteria Rossi/))
    expect(v.container.querySelector('h2').textContent).toBe('Latteria Rossi')
    expect(v.container.querySelector('input[aria-label="Cerca un fornitore"]')).toBeNull()
  })
})
