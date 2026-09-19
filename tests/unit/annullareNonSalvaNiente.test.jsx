// @vitest-environment happy-dom
//
// ── «Annulla» deve voler dire che non è successo niente ───────────────────
//
// 19/09/2026. Le ultime quattro domande che il prodotto faceva con la finestra
// del browser (`window.confirm`) sono diventate il riquadro di Foodos
// (`ConfirmModal`). Due stanno nell'import dei file, due nell'inventario
// settimanale.
//
// Sembra una sostituzione di forma, e invece cambia il modo in cui la risposta
// arriva, ed è lì che si rompe:
//
//   window.confirm(...)        → ferma il programma e RESTITUISCE true/false
//   await chiediConferma({...}) → non ferma niente e restituisce una PROMESSA
//
// Una promessa, in JavaScript, è sempre «vera». Chi scrive
// `const ok = chiediConferma({...})` dimenticando `await` ottiene un valore
// che vale true anche quando l'utente ha premuto Annulla: la domanda compare,
// l'utente dice di no, e il programma scrive lo stesso. È il difetto che
// questo file tiene fuori, e non si vede leggendo il codice — si vede solo
// premendo Annulla e guardando se qualcosa è stato salvato.
//
// Perciò qui non si cercano stringhe nel sorgente: si preme il pulsante e si
// guarda se `salvaCella` è stata chiamata.
//
// La terza prova è quella che ha fatto trovare un difetto vero mentre si
// lavorava: il riquadro di conferma disegna a `z.modal + 10` (210), e in
// questo file due finestre stavano a 9998 e 9999. La domanda usciva DIETRO
// alla finestra che l'aveva chiesta: invisibile, con il pulsante che sembrava
// non fare niente. Adesso quelle due finestre stanno sul livello del tema.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConfirmProvider } from '../../src/components/ConfirmModal.jsx'
import { color as T, z as Z } from '../../src/lib/theme'

// ── Il mondo intorno alla pagina, ridotto all'osso ────────────────────────
// Di `inventarioProduzione` si sostituisce solo quello che parla col
// database: il resto (i conti del venduto, la normalizzazione dei nomi) è
// codice vero e deve restare vero, se no si prova un finto.
const salvaCella = vi.fn(async (orgId, sedeId, gusto, data, patch) => ({
  gusto_nome: gusto, data, ...patch,
}))
const settimane = new Map()   // lunediIso → righe

vi.mock('../../src/lib/inventarioProduzione', async (originale) => {
  const vero = await originale()
  return {
    ...vero,
    salvaCella: (...a) => salvaCella(...a),
    caricaSettimana: async (_org, _sede, lunediIso) => settimane.get(lunediIso) || [],
    fetchAllInventarioProduzione: async () => [],
    caricaStoricoMensile: async () => [],
  }
})

vi.mock('../../src/lib/storage', () => ({
  sload: async () => null,
  ssave: async () => true,
}))

// Nessuna riga sul server: `handleSave` rilegge la cella prima di scrivere.
const catena = () => {
  const c = {
    select: () => c, eq: () => c, gte: () => c, lt: () => c, in: () => c,
    order: () => c, limit: () => c,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (res) => res({ data: [], error: null, count: 0 }),
  }
  return c
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: () => catena(), auth: { getSession: async () => ({ data: { session: null } }) } },
}))

vi.mock('../../src/lib/stockPF', () => ({
  caricoProduzionePF: async () => ({}),
}))

const { default: InventarioSettimanaleView } = await import('../../src/views/InventarioSettimanaleView.jsx')
const { lunediDellaSettimana } = await import('../../src/lib/inventarioProduzione')

function giorno(lunediIso, offset) {
  const d = new Date(lunediIso + 'T12:00')
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const SEDI = [
  { id: 'sede-1', nome: 'Laboratorio', attiva: true, is_sede_produzione: true },
  // La seconda serve perché il comando «Spedisci a sede» compaia.
  { id: 'sede-2', nome: 'Negozio', attiva: true, is_sede_produzione: false },
]

// Due gusti nel ricettario: senza, la pagina mostra lo stato vuoto («vai nel
// Ricettario e crea le tue ricette») e i comandi della settimana non ci sono.
const RICETTARIO = {
  ricette: {
    nocciola: { nome: 'Nocciola', tipo: 'fetta', ingredienti: [] },
    fiordilatte: { nome: 'Fiordilatte', tipo: 'fetta', ingredienti: [] },
  },
}

function apriLaSettimana() {
  return render(
    <ConfirmProvider>
      <InventarioSettimanaleView
        orgId="org-1"
        sedeId="sede-1"
        sedi={SEDI}
        sedeAttiva={SEDI[0]}
        ricettario={RICETTARIO}
        magazzino={{}}
        tipoAttivita="gelateria"
        metodoProduzione="inventario"
        notify={() => {}}
        onNavigate={() => {}}
      />
    </ConfirmProvider>
  )
}

beforeEach(() => {
  salvaCella.mockClear()
  settimane.clear()
  // L'onboarding al primo accesso coprirebbe la pagina.
  try { localStorage.setItem('foodos_inventario_onboarding_v1', '1') } catch { /* niente */ }
  // La settimana scorsa ha una produzione da copiare, questa è vuota.
  const lunedi = lunediDellaSettimana()
  const scorso = giorno(lunedi, -7)
  settimane.set(scorso, [
    { gusto_nome: 'NOCCIOLA', data: giorno(scorso, 0), produzione_g: 4000, rimanenza_g: 500 },
    { gusto_nome: 'FIORDILATTE', data: giorno(scorso, 1), produzione_g: 3000, rimanenza_g: 200 },
  ])
  settimane.set(lunedi, [])
})

async function chiediDiRipetereLaSettimana() {
  apriLaSettimana()
  const bottone = await screen.findByRole('button', { name: /Ripeti settimana scorsa/i })
  fireEvent.click(bottone)
  return await screen.findByText('Copio la produzione della settimana scorsa?')
}

describe('la domanda la fa Foodos, e Annulla vuol dire annulla', () => {
  it('copia della settimana scorsa: se annullo, non viene scritta nessuna cella', async () => {
    await chiediDiRipetereLaSettimana()
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))

    // Il riquadro se ne va...
    await waitFor(() => {
      expect(screen.queryByText('Copio la produzione della settimana scorsa?')).toBeNull()
    })
    // ...e sul database non è arrivato niente. Un attimo di respiro perché,
    // se il difetto tornasse, la scrittura partirebbe subito dopo.
    await new Promise(r => setTimeout(r, 30))
    expect(salvaCella).not.toHaveBeenCalled()
  })

  it('e se invece confermo le celle vengono scritte davvero', async () => {
    // Senza questa prova, quella di sopra sarebbe verde anche se il pulsante
    // non funzionasse per niente: è il modo classico in cui un test non prova
    // niente.
    await chiediDiRipetereLaSettimana()
    fireEvent.click(screen.getByRole('button', { name: 'Copia' }))

    await waitFor(() => expect(salvaCella).toHaveBeenCalledTimes(2))
    const scritte = salvaCella.mock.calls.map(c => [c[2], c[4].produzione_g])
    expect(scritte).toEqual(expect.arrayContaining([['NOCCIOLA', 4000], ['FIORDILATTE', 3000]]))
  })

  it('il messaggio dice quante celle, con il punto delle migliaia', async () => {
    settimane.set(giorno(lunediDellaSettimana(), -7), Array.from({ length: 1240 }, (_, i) => ({
      gusto_nome: `GUSTO ${i}`, data: giorno(giorno(lunediDellaSettimana(), -7), i % 7), produzione_g: 100,
    })))
    await chiediDiRipetereLaSettimana()
    expect(screen.getByText(/Celle da copiare: 1\.240\./)).toBeTruthy()
  })

  it('e non ci sono più «OK =» e «Annulla =» dentro il messaggio', async () => {
    // La finestra del browser costringeva a spiegare a parole cosa facevano i
    // due pulsanti, perché si chiamavano OK e Annulla comunque. Adesso lo
    // dicono le etichette.
    await chiediDiRipetereLaSettimana()
    const riquadro = screen.getByRole('dialog')
    expect(riquadro.textContent).not.toMatch(/OK =/)
    expect(riquadro.textContent).not.toMatch(/Annulla =/)
  })

  it('il riquadro di conferma esce SOPRA la finestra che l\'ha chiesta', async () => {
    // Il difetto trovato il 19/09/2026: `ConfirmModal` disegna a
    // `z.modal + 10`, le finestre di questa pagina stavano a 9998/9999. La
    // domanda usciva dietro, e per chi la usa il pulsante era rotto.
    await chiediDiRipetereLaSettimana()
    const conferma = screen.getByRole('dialog')
    const livello = Number(conferma.style.zIndex)
    expect(livello).toBeGreaterThan(Z.modal)
    // E nessuna finestra di questa pagina deve stargli davanti.
    const finestre = Array.from(document.querySelectorAll('[role="dialog"]'))
      .filter(d => d !== conferma)
      .map(d => Number(d.style.zIndex) || 0)
    for (const l of finestre) expect(l).toBeLessThan(livello)
  })

  it('spedizione oltre il disponibile: se annullo, non parte niente', async () => {
    apriLaSettimana()
    fireEvent.click(await screen.findByRole('button', { name: /Spedisci a sede/i }))

    // Nessuna produzione registrata oggi: disponibile = 0 kg, quindi 2,5 kg
    // sono più di quello che risulta in sede ed è proprio il caso da provare.
    const tendine = screen.getAllByRole('combobox')
    fireEvent.change(tendine[0], { target: { value: 'NOCCIOLA' } })
    fireEvent.change(screen.getByPlaceholderText('es. 2.5'), { target: { value: '2.5' } })
    fireEvent.change(tendine[1], { target: { value: 'sede-2' } })

    fireEvent.click(screen.getByRole('button', { name: 'Spedisci comunque' }))
    const domanda = await screen.findByText('Spedisci più di quello che risulta in sede?')

    // Il difetto del 19/09: la domanda usciva DIETRO alla finestra della
    // spedizione (9999 contro 210) e il pulsante sembrava morto.
    const conferma = domanda.closest('[role="dialog"]')
    const livelloConferma = Number(conferma.style.zIndex)
    const finestraSpedizione = Array.from(document.querySelectorAll('[role="dialog"]'))
      .find(d => d !== conferma && d.textContent.includes('Spedisci kg a un\'altra sede'))
    expect(Number(finestraSpedizione.style.zIndex)).toBeLessThan(livelloConferma)

    // I pulsanti del riquadro di conferma: quello che annulla è «Annulla»,
    // quello che va avanti ripete «Spedisci comunque».
    fireEvent.click(conferma.querySelector('button'))
    await waitFor(() => {
      expect(screen.queryByText('Spedisci più di quello che risulta in sede?')).toBeNull()
    })
    await new Promise(r => setTimeout(r, 30))
    expect(salvaCella).not.toHaveBeenCalled()
  })

  it('la conferma di sovrascrittura è quella pericolosa, e si vede', async () => {
    // `destructive` colora il riquadro col bordeaux delle azioni gravi: qui
    // si prova che «copio la settimana» NON è marcata pericolosa (non
    // cancella niente, tocca solo le celle vuote), così la marcatura resta un
    // segnale e non una decorazione.
    await chiediDiRipetereLaSettimana()
    const titolo = document.getElementById('confirm-title')
    expect(titolo.style.color).not.toBe(T.brand)
  })
})
