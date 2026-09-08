// @vitest-environment happy-dom
//
// La soglia di riordino: due bug confermati dall'audit del 7/09/2026.
//
// 1. SI SCRIVEVA SULLA CHIAVE SBAGLIATA. `handleSoglia` scriveva sotto la
//    chiave canonica, ma il magazzino e' indicizzato con le chiavi come sono
//    state salvate. Su una riga che in archivio si chiama "uova" (canonica:
//    "uovo") nasceva una voce NUOVA e la vecchia soglia restava: poi
//    l'aggregazione in lettura fa Math.max fra le due, quindi ABBASSARE la
//    soglia non aveva alcun effetto e l'avviso di riordino continuava a
//    suonare. Senza messaggi e senza modo di accorgersene.
//
// 2. RISCRIVEVA IL NOME. Passava `nome: k`, cioe' lo slug minuscolo:
//    "Cioccolato Fondente 70%" diventava "cioccolato fondente".

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
const scritto = { mag: null }
vi.mock('../../src/lib/storage', () => ({
  ssave: async (key, val) => { if (key === 'pasticceria-magazzino-v1') scritto.mag = val },
  sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')

const base = {
  ricettario: { ricette: {}, ingredienti_costi: {} },
  logRif: [], setLogRif: () => {}, logPrezzi: [], giornaliero: [],
  notify: () => {}, orgId: 'org-1', sedeId: 's1',
}

/** Apre l'editor della soglia sulla prima riga e scrive un valore. */
async function impostaSoglia(v, valore) {
  await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
  const bottoni = [...v.container.querySelectorAll('td button')]
  const apri = bottoni.find(b => /^(Imposta|[\d.,]+ (kg|g))$/.test(b.textContent.trim()))
  expect(apri).toBeTruthy()
  fireEvent.click(apri)
  const campo = await waitFor(() => {
    const i = v.container.querySelector('input[aria-label="Soglia di riordino in grammi"]')
    expect(i).toBeTruthy(); return i
  })
  fireEvent.change(campo, { target: { value: String(valore) } })
  fireEvent.click(v.getByLabelText('Conferma la soglia'))
}

beforeEach(() => { scritto.mag = null; cleanup() })

describe('soglia di riordino', () => {
  it('abbassare la soglia funziona anche se la chiave in archivio e\' al plurale', async () => {
    // Il caso reale: in produzione "Gelateria Demo" ha la chiave "uova".
    const magazzino = { uova: { giacenza_g: 4800, soglia_g: 2000, nome: 'Uova' } }
    const v = render(<MagazzinoView {...base} magazzino={magazzino} setMagazzino={() => {}} />)
    await impostaSoglia(v, 500)

    await waitFor(() => expect(scritto.mag).toBeTruthy())
    // Prima: nasceva scritto.mag['uovo'] = {soglia_g:500} e 'uova' restava a
    // 2000; Math.max in lettura teneva 2000 e l'abbassamento era invisibile.
    expect(scritto.mag.uova.soglia_g).toBe(500)
    expect(scritto.mag.uovo).toBeUndefined()
    // E la giacenza non si perde per strada.
    expect(scritto.mag.uova.giacenza_g).toBe(4800)
  })

  it('non riscrive il nome scelto dall\'utente con lo slug minuscolo', async () => {
    const magazzino = { 'cioccolato fondente': { giacenza_g: 1000, soglia_g: 2000, nome: 'Cioccolato Fondente 70%' } }
    const v = render(<MagazzinoView {...base} magazzino={magazzino} setMagazzino={() => {}} />)
    await impostaSoglia(v, 800)

    await waitFor(() => expect(scritto.mag).toBeTruthy())
    expect(scritto.mag['cioccolato fondente'].nome).toBe('Cioccolato Fondente 70%')
  })

  it('su una chiave già canonica si comporta come prima', async () => {
    const magazzino = { burro: { giacenza_g: 3000, soglia_g: 1000, nome: 'burro' } }
    const v = render(<MagazzinoView {...base} magazzino={magazzino} setMagazzino={() => {}} />)
    await impostaSoglia(v, 6000)

    await waitFor(() => expect(scritto.mag).toBeTruthy())
    expect(scritto.mag.burro.soglia_g).toBe(6000)
    expect(Object.keys(scritto.mag)).toEqual(['burro'])
  })

  it('il campo dichiara che sono grammi', async () => {
    // Il pulsante mostrava "0,500 kg" e dentro c'era "500": chi leggeva kg
    // scriveva "0,5" e la soglia diventava mezzo grammo.
    const v = render(<MagazzinoView {...base}
      magazzino={{ burro: { giacenza_g: 3000, soglia_g: 500 } }} setMagazzino={() => {}} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    // Il pulsante della soglia sta in una cella di tabella: il toggle kg/g
    // dell'intestazione ha lo stesso testo e va escluso.
    const apri = [...v.container.querySelectorAll('td button')]
      .find(b => /^([\d.,]+ (kg|g)|Imposta)$/.test(b.textContent.trim()))
    expect(apri).toBeTruthy()
    fireEvent.click(apri)
    await waitFor(() => expect(v.container.querySelector('input[aria-label="Soglia di riordino in grammi"]')).toBeTruthy())
    // L'unita' e' scritta accanto al campo, non lasciata indovinare.
    const cella = v.container.querySelector('input[aria-label="Soglia di riordino in grammi"]').parentElement
    expect(cella.textContent).toContain('g')
  })

  it('la conferma e\' un\'icona SVG, non il carattere ✓', async () => {
    const v = render(<MagazzinoView {...base}
      magazzino={{ burro: { giacenza_g: 3000, soglia_g: 500 } }} setMagazzino={() => {}} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    fireEvent.click([...v.container.querySelectorAll('td button')]
      .find(b => /^([\d.,]+ (kg|g)|Imposta)$/.test(b.textContent.trim())))
    const ok = await waitFor(() => v.getByLabelText('Conferma la soglia'))
    expect(ok.querySelector('svg')).toBeTruthy()
    expect(ok.textContent).not.toContain('✓')
  })
})

describe('aggiungi ingrediente', () => {
  it('non azzera la giacenza di un ingrediente che c\'e\' gia\'', async () => {
    // Bug confermato: la voce veniva sovrascritta per intero, quindi digitare
    // "burro" con 3 kg in magazzino li azzerava in silenzio.
    const avvisi = []
    const v = render(<MagazzinoView {...base}
      magazzino={{ burro: { giacenza_g: 3000, soglia_g: 5000, nome: 'burro' } }}
      setMagazzino={() => {}} notify={(m, ok) => avvisi.push([m, ok])} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))

    fireEvent.click(v.getByText('+ Aggiungi ingrediente'))
    const nome = await waitFor(() => {
      const i = v.container.querySelector('input[placeholder="es. burro"]')
      expect(i).toBeTruthy(); return i
    })
    fireEvent.change(nome, { target: { value: 'burro' } })
    fireEvent.click(v.getByText('Aggiungi'))

    await waitFor(() => expect(avvisi.length).toBeGreaterThan(0))
    expect(avvisi[0][0]).toMatch(/è già in magazzino/)
    expect(avvisi[0][1]).toBe(false)
    // E soprattutto: NON ha scritto niente.
    expect(scritto.mag).toBeNull()
  })

  it('riconosce anche la voce salvata col nome al plurale', async () => {
    const avvisi = []
    const v = render(<MagazzinoView {...base}
      magazzino={{ uova: { giacenza_g: 4800, soglia_g: 1000, nome: 'Uova' } }}
      setMagazzino={() => {}} notify={(m) => avvisi.push(m)} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    fireEvent.click(v.getByText('+ Aggiungi ingrediente'))
    const nome = await waitFor(() => v.container.querySelector('input[placeholder="es. burro"]'))
    // Si digita il singolare: normIng lo porta sulla stessa voce.
    fireEvent.change(nome, { target: { value: 'uovo' } })
    fireEvent.click(v.getByText('Aggiungi'))
    await waitFor(() => expect(avvisi.length).toBeGreaterThan(0))
    expect(avvisi[0]).toMatch(/Uova/)
    expect(scritto.mag).toBeNull()
  })
})

describe('materie prime — dettagli confermati', () => {
  it('il modale di eliminazione mostra il nome della riga, non la chiave', async () => {
    // Su una voce salvata come "Uova" il modale chiedeva conferma per "uovo",
    // un nome che l'utente non ha mai scritto.
    const v = render(<MagazzinoView {...base}
      magazzino={{ uova: { giacenza_g: 2400, soglia_g: 1000, nome: 'Uova' } }}
      setMagazzino={() => {}} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    fireEvent.click(v.getByLabelText('Elimina ingrediente'))
    await waitFor(() => expect(v.container.textContent).toContain('Stai per eliminare'))
    expect(v.container.textContent).toContain('Uova')
    // E dice quello che conta: cosa succede alle ricette.
    expect(v.container.textContent).toContain('continuerà a essere calcolato nel costo')
    expect(v.container.textContent).not.toContain('Questa azione è permanente')
  })

  it('con il magazzino vuoto lo dice, invece di mostrare solo le intestazioni', async () => {
    const v = render(<MagazzinoView {...base} magazzino={{}} setMagazzino={() => {}} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    expect(v.container.textContent).toContain('Il magazzino è vuoto')
    expect(v.container.textContent).toContain('Aggiungi ingrediente')
  })

  it('il nome non e\' piu\' un pulsante nascosto: c\'e\' un vero "Carica"', async () => {
    const v = render(<MagazzinoView {...base}
      magazzino={{ burro: { giacenza_g: 3000, soglia_g: 1000 } }} setMagazzino={() => {}} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    // La freccia ↗ e il tooltip da gergo non ci sono piu'.
    expect(v.container.textContent).not.toContain('↗')
    expect(v.container.innerHTML).not.toContain('precompila form')
    // Al loro posto un pulsante che dice cosa fa.
    const carica = [...v.container.querySelectorAll('td button')].find(b => b.textContent.trim() === 'Carica')
    expect(carica).toBeTruthy()
    expect(carica.title).toContain('Carica burro')
  })

  it('il riquadro "Da ordinare" segue il toggle kg/g come le altre colonne', async () => {
    // Prima nella stessa riga si leggeva "28.000 g" di giacenza e "~ 1,5 kg"
    // da ordinare: due unita' diverse, da convertire a mente.
    const v = render(<MagazzinoView {...base}
      magazzino={{ burro: { giacenza_g: 500, soglia_g: 9000 } }} setMagazzino={() => {}} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    // Modo predefinito kg: entrambe le colonne in kg.
    expect(v.container.textContent).toContain('0,500 kg')
    expect(v.container.textContent).toMatch(/~ \d+[.,]?\d* kg/)
  })
})
