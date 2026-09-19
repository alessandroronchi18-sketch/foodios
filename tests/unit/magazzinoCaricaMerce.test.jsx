// @vitest-environment happy-dom
//
// Scheda "Carica merce": i difetti verificati il 14/09/2026.
//
// Tutti e quattro nascono dallo stesso posto — il tablet appoggiato al bancone,
// che e' dove questa scheda si usa davvero: la virgola della tastiera italiana
// che il campo scartava, la barra spaziatrice sfiorata per sbaglio che creava
// una riga senza nome, il modo "scarico" che restava impostato dopo il
// salvataggio, e l'Invio che non confermava.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const salvato = []
vi.mock('../../src/lib/storage', () => ({
  ssave: async (k, v) => { salvato.push([k, v]) },
  sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
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

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')

let magazzino
const base = () => ({
  ricettario: { ricette: { r1: { nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30, ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } }, ingredienti_costi: {} },
  magazzino, setMagazzino: (m) => { magazzino = m }, logRif: [], setLogRif: () => {},
  giornaliero: [], logPrezzi: [], notify: () => {}, orgId: 'org-1', sedeId: 's1',
})

async function apriCarica() {
  const v = render(<MagazzinoView {...base()} />)
  await waitFor(() => expect(v.container.textContent).toContain('Carica merce'))
  fireEvent.click(v.getByText('Carica merce'))
  await waitFor(() => expect(document.getElementById('mag-qty-input')).toBeTruthy())
  return v
}

beforeEach(() => {
  // La scheda aperta si ricorda in sessionStorage: fra un test e l'altro si azzera.
  try { sessionStorage.clear() } catch { /* niente */ }
  cleanup()
  salvato.length = 0
  magazzino = { burro: { nome: 'Burro', giacenza_g: 4000, soglia_g: 1000 } }
})

describe('carica merce — il tablet sul bancone', () => {
  it('il campo quantita accetta la virgola della tastiera italiana', async () => {
    const v = await apriCarica()
    const qty = document.getElementById('mag-qty-input')
    // type="number" scartava "1,5" e lasciava il campo vuoto: il pulsante
    // restava grigio e il programma sembrava rotto.
    expect(qty.getAttribute('type')).toBe('text')
    expect(qty.getAttribute('inputmode')).toBe('decimal')
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(qty, { target: { value: '1,5' } })
    expect(qty.value).toBe('1,5')
    const bottone = v.getByText(/Aggiungi al magazzino/).closest('button')
    expect(bottone.disabled).toBe(false)
  })

  it('un nome fatto di soli spazi non crea una riga senza nome', async () => {
    const v = await apriCarica()
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: '   ' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    const bottone = v.getByText(/Aggiungi al magazzino/).closest('button')
    expect(bottone.disabled).toBe(true)
  })

  it('si conferma con Invio dal campo quantita', async () => {
    await apriCarica()
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(salvato.length).toBeGreaterThan(0))
    const [, mag] = salvato.find(([k]) => String(k).includes('magazzino'))
    expect(mag.burro.giacenza_g).toBe(4500)
  })

  it('i suggerimenti propongono il nome vero, non la chiave normalizzata', async () => {
    await apriCarica()
    const opzioni = [...document.querySelectorAll('#ing-list option')].map(o => o.value)
    // "Burro" con la maiuscola, com'e' scritto in magazzino: la lista proponeva
    // "burro" normalizzato e il carico rinominava l'ingrediente.
    expect(opzioni).toContain('Burro')
  })
})

// ── Il modo «scarico» che restava acceso dopo il salvataggio ──────────────
//
// Il quarto difetto del 14/09/2026, quello che l'intestazione di questo file
// annuncia e che fino al 19/09/2026 **nessun test provava**: l'unica guardia
// era un `expect(src).toMatch(/setQuickLoad\(null\); setFormMode\('carico'\)/)`
// dentro `magazzinoLetturaUso.test.js`, cioè una stringa cercata nel sorgente.
// Messa alla prova il 19/09 rinominando una variabile senza cambiare niente,
// quel file diventava rosso; messo alla prova con la pagina che non disegnava
// più niente, restava verde. Qui invece si fa il gesto: si registra uno
// scarico, e poi si guarda se il form è tornato in carico.
//
// Perché conta: chi registra uno scarico e poi carica merce nuova, se il modo
// resta impostato, **sottrae invece di aggiungere**. Il magazzino scende del
// doppio della merce arrivata e nessuno se ne accorge fino all'inventario.
describe('carica merce — dopo un salvataggio il modo torna su «carico»', () => {
  it('registrato uno scarico, il carico successivo somma invece di sottrarre', async () => {
    const v = await apriCarica()
    // 1. Passo in «Scarico / Rettifica» e tolgo 500 g dei 4.000 che ci sono.
    fireEvent.click(v.getByText('Scarico / Rettifica').closest('button'))
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(salvato.length).toBeGreaterThan(0))
    const [, dopoScarico] = salvato.find(([k]) => String(k).includes('magazzino'))
    expect(dopoScarico.burro.giacenza_g, 'lo scarico deve togliere').toBe(3500)

    // 2. Senza toccare niente, carico 1.000 g di merce arrivata.
    salvato.length = 0
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '1000' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(salvato.length).toBeGreaterThan(0))
    const [, dopoCarico] = salvato.find(([k]) => String(k).includes('magazzino'))
    // La prop `magazzino` non viene rialimentata al componente fra un
    // salvataggio e l'altro, quindi la base resta 4.000: il segno è
    // comunque inequivocabile. Col difetto: 4.000 − 1.000 = 3.000.
    // Senza: 4.000 + 1.000 = 5.000.
    expect(dopoCarico.burro.giacenza_g,
      'il modo «scarico» è rimasto acceso: il carico ha sottratto').toBe(5000)
  })

  it('e il pulsante «Carico merce» è quello selezionato quando si riapre', async () => {
    const v = await apriCarica()
    fireEvent.click(v.getByText('Scarico / Rettifica').closest('button'))
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '100' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(salvato.length).toBeGreaterThan(0))
    // L'etichetta del campo quantità dice in che modo si è: «in arrivo» per il
    // carico, «da rimuovere» per lo scarico. È quello che vede chi guarda.
    await waitFor(() => expect(v.container.textContent).toContain('in arrivo'))
    expect(v.container.textContent).not.toContain('da rimuovere')
  })
})
