// @vitest-environment happy-dom
//
// ── I fili fra il Dashboard e la pagina Materie prime ─────────────────────
//
// Il buco, trovato il 18/09/2026 da un audit dei test.
//
// Cambiando i nomi delle prop nel punto in cui il Dashboard disegna la pagina
// — `onUpdatePrezzoIng` al posto di `onUpdatePrezzo`, `onCreaMateria` al posto
// di `onCreaMateriaPrima` — la pagina **smette di salvare i prezzi e di creare
// materie prime**, e restavano verdi 241 test su 241. In React passare una
// prop con il nome sbagliato non è un errore: arriva `undefined`, il pulsante
// c'è, si preme, e non succede niente.
//
// ── Reso più solido il 19/09/2026 ─────────────────────────────────────────
//
// La prima versione teneva insieme i due capi del filo con due espressioni
// regolari sul testo dei file: `export default function MateriePrimeView\(\{
// ([\s\S]*?)\}\)` da una parte e `<MateriePrimeView([^/>]*)\/>` dall'altra.
// Funzionava, ma stava appesa alla forma del codice invece che alla cosa:
// bastava andare a capo in un punto diverso, o mettere un figlio dentro il
// tag, per farla diventare rossa senza che niente fosse rotto — e due delle
// cinque prove cercavano `const handleUpdatePrezzoIng`, cioè il nome di una
// variabile.
//
// Adesso il capo della PAGINA si legge dalla funzione vera, importata ed
// eseguita, non dal file; e il filo si prova anche **tirandolo**: si disegna
// la pagina con i nomi che il Dashboard usa e si controlla che il salvataggio
// del prezzo arrivi a destinazione. Se qualcuno rinomina la prop da una parte
// sola, questo test lo vede perché il prezzo non si salva più — che è
// esattamente il danno.
//
// Il capo del DASHBOARD resta una lettura del sorgente: non c'è altro modo di
// sapere con che nomi una pagina viene disegnata senza montare il Dashboard
// intero. Ma adesso lo spazio bianco non conta, e se il punto non si trova la
// prova lo dice invece di passare.

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import fs from 'node:fs'

vi.mock('../../src/lib/storage', () => ({ ssave: async () => {}, sload: async () => null }))
vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) },
}))

const { default: MateriePrimeView } = await import('../../src/views/MateriePrimeView.jsx')

const DASH = fs.readFileSync('src/Dashboard.jsx', 'utf8')
// Lo spazio bianco non deve poter rompere niente: si guarda il testo appiattito.
const DASH_PIATTO = DASH.replace(/\s+/g, ' ')

/** I nomi delle prop che la pagina accetta, letti dalla FUNZIONE, non dal file. */
function propAccettate() {
  const m = MateriePrimeView.toString().match(/^\s*function[^(]*\(\s*\{([\s\S]*?)\}\s*\)/)
  if (!m) return null
  return m[1].split(',').map(x => x.trim().split(/[:=]/)[0].trim()).filter(Boolean)
}

/** I nomi delle prop che il Dashboard passa davvero. */
function propPassate() {
  const m = DASH_PIATTO.match(/<MateriePrimeView\s([^>]*?)\/>/)
  if (!m) return null
  return [...m[1].matchAll(/(\w+)=\{/g)].map(x => x[1])
}

describe('le due estremità del filo combaciano', () => {
  it('il righello: tutti e due i capi si leggono', () => {
    // Se un capo non si legge, le prove qui sotto non provano niente: prima
    // questo file ci passava sopra con un `toBeTruthy` in mezzo alle altre
    // asserzioni. Qui è una prova sua, e non si può saltare.
    expect(propAccettate(), 'la firma di MateriePrimeView non si legge: aggiorna il test').toBeTruthy()
    expect(propPassate(), 'il punto dove il Dashboard disegna MateriePrimeView non si trova: aggiorna il test').toBeTruthy()
    expect(propAccettate().length).toBeGreaterThanOrEqual(8)
    expect(propPassate().length).toBeGreaterThanOrEqual(8)
  })

  it('ogni prop che il Dashboard manda, la pagina la riceve', () => {
    const accettate = propAccettate()
    const orfane = propPassate().filter(p => !accettate.includes(p))
    expect(orfane,
      `il Dashboard passa prop che la pagina non riceve (arrivano undefined): ${orfane.join(', ')}`).toEqual([])
  })

  it('e le tre che fanno scrivere sul database ci sono da tutte e due le parti', () => {
    const accettate = propAccettate()
    const passate = propPassate()
    for (const nome of ['ricettario', 'onUpdatePrezzo', 'onCreaMateriaPrima']) {
      expect(accettate, `la pagina non accetta più «${nome}»`).toContain(nome)
      expect(passate, `il Dashboard non passa più «${nome}»`).toContain(nome)
    }
  })

  it('e quello che il Dashboard aggancia a quelle prop esiste nel file', () => {
    // Prima si cercava `const handleUpdatePrezzoIng`, cioè la forma della
    // dichiarazione. Adesso si legge il nome dal punto di attacco e si
    // controlla solo che sia definito: se domani diventa una `function` o
    // arriva da una destrutturazione, va bene lo stesso.
    const m = DASH_PIATTO.match(/<MateriePrimeView\s([^>]*?)\/>/)
    const agganci = [...m[1].matchAll(/(\w+)=\{(\w+)\}/g)].map(x => x[2])
    expect(agganci.length).toBeGreaterThanOrEqual(8)
    for (const nome of agganci) {
      expect(new RegExp(`\\b${nome}\\b`).test(DASH.replace(new RegExp(`${nome}=\\{${nome}\\}`, 'g'), '')),
        `il Dashboard passa «${nome}» ma non lo definisce da nessuna parte`).toBe(true)
    }
  })

  it('tirando il filo, il prezzo arriva davvero a destinazione', async () => {
    // La prova che nessuna espressione regolare può dare: si disegna la
    // pagina con i nomi che il Dashboard usa e si salva un prezzo. Se la
    // pagina cambia nome alla prop, qui non arriva più niente — ed è
    // esattamente il guasto silenzioso che ha fatto nascere questo file.
    const chiamate = []
    const propDelDashboard = {
      ricettario: {
        ricette: { r1: { nome: 'SACHER', tipo: 'torta', unita: 8, prezzo: 30,
          ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } },
        ingredienti_costi: { burro: { costoKg: 8, costoG: 0.008 } },
      },
      logPrezzi: [],
      onUpdatePrezzo: async (...a) => { chiamate.push(a) },
      onCreaMateriaPrima: async () => {},
      onRinominaMateriaPrima: async () => {},
      onEliminaMateriaPrima: async () => {},
      onImportPrezzi: async () => {},
      onAssegnaFornitore: async () => {},
      onApriFornitore: () => {},
      onNavigate: () => {},
      notify: () => {},
    }
    const v = render(<MateriePrimeView {...propDelDashboard} />)
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: '9,50' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    // La finestra di conferma, e poi il salvataggio vero.
    const conferma = await waitFor(() => {
      const b = [...v.container.querySelectorAll('button')].find(x => /Conferma e salva/.test(x.textContent))
      expect(b, 'la finestra di conferma del prezzo non si è aperta').toBeTruthy()
      return b
    })
    fireEvent.click(conferma)
    await waitFor(() => expect(chiamate.length,
      'il prezzo non è arrivato al Dashboard: il filo è staccato').toBeGreaterThan(0))
    expect(chiamate[0].some(a => a === 9.5 || a?.prezzoKg === 9.5 || a?.costoKg === 9.5)
      || JSON.stringify(chiamate[0]).includes('9.5'),
      `il prezzo arrivato non è 9,50: ${JSON.stringify(chiamate[0])}`).toBe(true)
  })

  it('la pagina resta chiusa ai dipendenti', () => {
    // Tre reti: non nel menu, non fra le viste del dipendente, e il ramo che
    // la disegna ha il suo controllo. Qui si tiene la terza, che è l'unica
    // che regge se uno arriva da un link. Lo spazio bianco non conta.
    expect(DASH_PIATTO).toMatch(/vista\s*===\s*"materie-prime"\s*&&\s*!isDip/)
  })
})
