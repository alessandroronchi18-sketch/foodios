// @vitest-environment happy-dom
//
// Materie prime: dove stanno i comandi, e le ricette che si possono leggere.
//
// ═══ I tre difetti, 18/09/2026, guardando la pagina sui dati veri ═══════
//
// **1. «Nuova materia prima» era nel posto sbagliato.** Stava dentro
// l'intestazione della pagina (`PageHeader action`), cioè a destra del
// paragrafo che spiega a cosa serve la pagina: tre righe di testo, e in fondo
// a destra il comando che crea una riga dell'elenco. Lontano dall'elenco su
// cui agisce, e sul telefono — dove l'intestazione va a capo — finiva sotto il
// paragrafo, in un punto dove nessuno lo cerca. Adesso sta in una barra sua,
// sopra l'elenco, dove andranno anche «Importa in blocco» e «Scarica un
// esempio».
//
// **2. «In quante ricette» era un numero con il suggerimento del mouse.** Il
// `title` mostrava le prime otto ricette separate da virgole e poi tre
// puntini. Tre problemi in uno: sul telefono e sul tablet il suggerimento non
// esiste (e quella colonna si tocca col dito), le ricette dalla nona in poi
// non si vedevano mai, e quello che si vedeva non si poteva copiare. Il
// titolare: «il suggerimento al passaggio del mouse va tolto: mostra solo le
// prime e non serve a niente». Adesso il numero è un pulsante e l'elenco si
// apre sotto, incolonnato.
//
// **3. Il segnaposto «12,50» nel campo del prezzo era fuorviante.** In un
// campo vuoto, scritto in grigio chiaro, «12,50» non si legge come un
// esempio: si legge come una cifra che il programma propone. Su una materia
// prima senza prezzo — cioè proprio la riga che si apre per correggere — è il
// suggerimento più pericoloso possibile, perché è inventato. Il titolare: «chi
// arriva lì sa cosa scrivere».

// 19/09/2026 — i nomi delle materie prime si leggono con la prima
// maiuscola («Burro», non «burro»): nel database restano minuscoli, perché
// quella è la chiave con cui il food cost trova il prezzo, e cambiarla
// farebbe sparire un costo in silenzio. Qui cambiano solo le prove su
// quello che si legge a schermo; i dati di prova restano com'erano.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MateriePrimeView } = await import('../../src/views/MateriePrimeView.jsx')

// «burro» in dieci ricette: più delle otto che il vecchio suggerimento
// mostrava, così si vede che adesso ci sono tutte.
const DIECI = ['BAVARESE', 'CHANTILLY', 'SACHER', 'TIRAMISU', 'PROFITEROL',
  'MILLEFOGLIE', 'SEMIFREDDO', 'PANNACOTTA', 'ZUPPA INGLESE', 'CREMA CARAMEL']

const ricettario = {
  ricette: Object.fromEntries(DIECI.map((n, i) => (
    [`r${i}`, { nome: n, ingredienti: [{ nome: 'burro', qty1stampo: 100 }] }]
  ))),
  ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 } },
}

const monta = (props = {}) => render(<MateriePrimeView
  ricettario={ricettario} logPrezzi={[]}
  onUpdatePrezzo={async () => {}} onCreaMateriaPrima={async () => ({ ok: true })}
  onRinominaMateriaPrima={async () => ({ ok: true })}
  onEliminaMateriaPrima={async () => ({ ok: true })}
  {...props} />)

beforeEach(() => { cleanup() })

describe('dove sta «Nuova materia prima»', () => {
  it('sta in una barra sua, non appeso all’intestazione', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('nuova materia prima'))
    const barra = v.container.querySelector('[data-barra="azioni-materie-prime"]')
    expect(barra, 'non c’è la barra dei comandi').toBeTruthy()
    const dentro = [...barra.querySelectorAll('button')].map(b => b.textContent.trim())
    expect(dentro).toContain('Nuova materia prima')
  })

  it('la barra sta sopra l’elenco, non sotto', async () => {
    // Un comando che crea una riga dell'elenco va letto prima dell'elenco.
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('nuova materia prima'))
    const barra = v.container.querySelector('[data-barra="azioni-materie-prime"]')
    const tabella = v.container.querySelector('table')
    expect(barra.compareDocumentPosition(tabella) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('l’intestazione della pagina non ha più nessun pulsante dentro', async () => {
    // Il paragrafo che spiega la pagina resta, il comando no.
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('gli ingredienti che compri'))
    // Il riquadro più stretto che comincia con quel paragrafo: partendo
    // dall'alto si prenderebbe la pagina intera, che i pulsanti ce li ha.
    const intestazione = [...v.container.querySelectorAll('div')]
      .filter(d => d.textContent.startsWith('Gli ingredienti che compri'))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0]
    expect(intestazione.textContent).toMatch(/più basso di quello vero\.$/)
    expect(intestazione.querySelectorAll('button')).toHaveLength(0)
  })

  it('c’è posto accanto per gli altri due comandi, e si apre il modulo', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('nuova materia prima'))
    const barra = v.container.querySelector('[data-barra="azioni-materie-prime"]')
    // I pulsanti si affiancano e vanno a capo da soli: aggiungerne due non
    // rompe niente.
    expect(barra.style.display).toBe('flex')
    expect(barra.style.flexWrap).toBe('wrap')
    fireEvent.click([...barra.querySelectorAll('button')][0])
    await waitFor(() => expect(v.getByLabelText('Come si chiama')).toBeTruthy())
  })
})

describe('«in quante ricette» si apre e si legge', () => {
  it('il numero è un pulsante, non un numero col suggerimento', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    const tutti = [...v.container.querySelectorAll('[title]')].map(t => t.getAttribute('title'))
    expect(tutti.some(t => t && t.includes('BAVARESE'))).toBe(false)
    const pulsante = [...v.container.querySelectorAll('button[aria-expanded]')]
      .find(b => /10 ricette usano burro/.test(b.getAttribute('aria-label') || ''))
    expect(pulsante).toBeTruthy()
    expect(pulsante.textContent.trim()).toBe('10')
  })

  it('aperto, mostra TUTTE le ricette e non solo le prime otto', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    const pulsante = [...v.container.querySelectorAll('button[aria-expanded]')]
      .find(b => /ricette usano burro/.test(b.getAttribute('aria-label') || ''))
    fireEvent.click(pulsante)
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('bavarese'))
    for (const nome of DIECI) expect(v.container.textContent).toContain(nome)
  })

  it('le ricette stanno incolonnate, una per riga', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click([...v.container.querySelectorAll('button[aria-expanded]')]
      .find(b => /ricette usano burro/.test(b.getAttribute('aria-label') || '')))
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('bavarese'))
    // 18/09/2026 — l'elenco è passato da una colonna sola a una griglia:
    // con ventinove ricette (BASE BIANCA le ha) una colonna sola era lunga
    // come la pagina. Quello che il test protegge resta lo stesso: ogni
    // ricetta è un elemento suo, non un blocco di testo separato da virgole.
    const colonna = [...v.container.querySelectorAll('div')]
      .find(d => (d.style.display === 'grid') && d.textContent.includes('BAVARESE') && d.textContent.includes('CREMA CARAMEL'))
    expect(colonna, 'le ricette non sono incolonnate').toBeTruthy()
    expect(colonna.children).toHaveLength(DIECI.length)
  })

  it('e stanno in ordine alfabetico', async () => {
    // Prima uscivano nell'ordine in cui capitavano nell'archivio, che per chi
    // legge non è un ordine: con ventinove nomi, trovare quello che si cerca
    // voleva dire leggerli tutti.
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click([...v.container.querySelectorAll('button[aria-expanded]')]
      .find(b => /ricette usano burro/.test(b.getAttribute('aria-label') || '')))
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('bavarese'))
    const griglia = [...v.container.querySelectorAll('div')]
      .find(d => (d.style.display === 'grid') && d.textContent.includes('BAVARESE'))
    const nomi = [...griglia.children].map(c => c.textContent)
    expect(nomi).toEqual([...nomi].sort((a, b) => a.localeCompare(b, 'it')))
  })

  it('si richiude, e lo dichiara a chi legge con la voce', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    const pulsante = () => [...v.container.querySelectorAll('button[aria-expanded]')]
      .find(b => /ricette usano burro/.test(b.getAttribute('aria-label') || ''))
    expect(pulsante().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(pulsante())
    await waitFor(() => expect(pulsante().getAttribute('aria-expanded')).toBe('true'))
    fireEvent.click(pulsante())
    await waitFor(() => expect(v.container.textContent).not.toContain('BAVARESE'))
  })

  it('una materia prima che non usa nessuno non ha niente da aprire', async () => {
    const v = monta({ ricettario: { ricette: {}, ingredienti_costi: { burro: { costoKg: 8.4 } } } })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    expect(v.container.textContent.toLowerCase()).toContain('in nessuna')
    expect(v.container.querySelectorAll('button[aria-expanded]')).toHaveLength(1) // solo «Nuova materia prima»
  })
})

describe('nessun prezzo inventato nei campi vuoti', () => {
  it('il campo per correggere il prezzo non suggerisce nessuna cifra', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Modifica'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    expect(campo.getAttribute('placeholder')).toBeFalsy()
  })

  it('e nemmeno quello della materia prima nuova', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('nuova materia prima'))
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.includes('Nuova materia prima')))
    const campo = await waitFor(() => v.getByLabelText('Prezzo al chilo'))
    expect(campo.getAttribute('placeholder')).toBeFalsy()
  })

  it('l’esempio «12,50» resta dove serve: nel messaggio di errore', async () => {
    // Toglierlo dal campo non vuol dire nascondere come si scrive un prezzo:
    // quando uno sbaglia, glielo si dice.
    const v = monta()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Modifica'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: '12,5o' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salva'))
    await waitFor(() => expect(v.container.textContent).toContain('12,50'))
  })
})
