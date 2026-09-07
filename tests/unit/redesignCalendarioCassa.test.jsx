// @vitest-environment happy-dom
//
// Il redesign del 7 set con DATI VERI, non con le prop vuote.
//
// I render-smoke esistenti montano le viste con array vuoti: passano anche se
// la mappa di calore, il confronto col solito giorno e la fila di statistiche
// esplodono al primo numero. Le strade nuove si percorrono solo con dei dati
// dentro, ed e' esattamente dove il redesign puo' rompersi.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

function fluente(risultato = { data: [], error: null }) {
  const h = {
    get(_t, prop) {
      if (prop === 'then') return (res) => res(risultato)
      if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: null, error: null })
      return () => new Proxy({}, h)
    },
  }
  return new Proxy({}, h)
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => fluente(),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

vi.mock('../../src/lib/storage', () => ({
  ssave: () => Promise.resolve(), sload: () => Promise.resolve(null),
  ssaveBatch: () => Promise.resolve(), sloadAllSedi: () => Promise.resolve({}),
}))

vi.mock('../../src/lib/aiClient', () => ({
  callAi: () => Promise.resolve({ text: '', json: null }),
  parseAiJson: () => null,
  friendlyAiError: () => 'Errore AI (mock).',
  sanitizeUserInput: (t) => String(t || ''),
  default: () => Promise.resolve({ text: '', json: null }),
}))

vi.mock('../../src/lib/primaNota', async () => {
  const real = await vi.importActual('../../src/lib/primaNota')
  return {
    ...real,
    caricaMovimenti: () => Promise.resolve([]),
    totaliPeriodo: () => Promise.resolve({ totale: 0, conFattura: 0, senzaFattura: 0, daVerificare: 0, numero: 0 }),
  }
})

vi.mock('../../src/lib/giorniChiusura', async () => {
  const real = await vi.importActual('../../src/lib/giorniChiusura')
  return { ...real, caricaRegoleChiusura: () => Promise.resolve({ ricorrenti: [], periodi: [] }) }
})

const { default: CalendarioOperativo } = await import('../../src/components/CalendarioOperativo.jsx')
const { default: ChiusuraView } = await import('../../src/views/ChiusuraView.jsx')
const { ConfirmProvider } = await import('../../src/components/ConfirmModal.jsx')

// Il mese corrente, perche' e' quello che entrambe le pagine aprono.
const _o = new Date()
const MESE = `${_o.getFullYear()}-${String(_o.getMonth() + 1).padStart(2, '0')}`
const g = (n) => `${MESE}-${String(Math.min(n, _o.getDate())).padStart(2, '0')}`

/**
 * Un archivio verosimile: sabati forti, martedì deboli, e TRE MESI di storia.
 *
 * La storia serve davvero: sia il confronto col solito giorno sia la frase sul
 * giorno forte della settimana si rifiutano di pronunciarsi sotto un minimo di
 * riferimenti — che è il comportamento giusto. Con solo il mese corrente i
 * test non proverebbero niente e passerebbero per il motivo sbagliato.
 */
function archivio({ giorni = 84 } = {}) {
  const out = []
  const oggi = new Date(`${_o.getFullYear()}-${String(_o.getMonth() + 1).padStart(2, '0')}-${String(_o.getDate()).padStart(2, '0')}T12:00`)
  for (let i = giorni; i >= 0; i--) {
    const d = new Date(oggi.getTime() - i * 86400000)
    const data = d.toISOString().slice(0, 10)
    const dow = d.getDay()
    const base = dow === 6 ? 980 : dow === 0 ? 640 : dow === 2 ? 310 : 420
    out.push({
      data, venduto: [],
      kpi: { totV: base, totFC: base * 0.3, totM: base * 0.7, totS: 0, totMP: 70, avgST: 8.4,
             pos: base * 0.7, contanti: base * 0.3, delivery: null },
    })
  }
  return out
}
const mesePieno = archivio

const propsCal = {
  giornaliero: [], chiusure: mesePieno(), orgId: 'org-1', sedeId: 'sede-1',
  setView: () => {}, notify: () => {}, isMobile: false,
}

const propsCassa = {
  ricettario: { ricette: {}, ingredienti_costi: {} }, giornaliero: [],
  chiusure: mesePieno(), setChiusure: () => {}, notify: () => {},
  orgId: 'org-1', sedeId: 'sede-1',
}

beforeEach(() => cleanup())

describe('Calendario — la mappa del mese', () => {
  it('apre con il mese in una frase, non con quattro tessere di compilazione', async () => {
    const v = render(<CalendarioOperativo {...propsCal} />)
    await waitFor(() => expect(v.container.textContent).toContain('Incassato nel mese'))
    // La frase dice quanto e in quante giornate.
    expect(v.container.textContent).toMatch(/€ in \d+ giornat/)
    expect(v.container.textContent).toContain('al giorno in media')
    // E non usa piu' il lessico da pagella.
    expect(v.container.textContent).not.toContain('Copertura mese')
    expect(v.container.textContent).not.toContain('molti giorni scoperti')
  })

  it('riconosce il giorno forte della settimana e lo dice in italiano', async () => {
    const v = render(<CalendarioOperativo {...propsCal} />)
    await waitFor(() => expect(v.container.textContent).toContain('Incassato nel mese'))
    // Sabati da 980 contro martedì da 310: oltre il triplo.
    expect(v.container.textContent).toContain('Il sabato incassa più del triplo del martedì')
  })

  it('la legenda spiega una scala di incasso, non un elenco di stati', async () => {
    const v = render(<CalendarioOperativo {...propsCal} />)
    await waitFor(() => expect(v.container.textContent).toContain('molto incassato'))
    expect(v.container.textContent).toContain('poco')
    expect(v.container.textContent).toContain('da registrare')
  })

  it('mostra il ritmo della settimana con la mediana, e lo dichiara', async () => {
    const v = render(<CalendarioOperativo {...propsCal} />)
    await waitFor(() => expect(v.container.textContent).toContain('Il ritmo della settimana'))
    expect(v.container.textContent).toContain('mediana e non la media')
  })

  it('aprire un giorno mostra l\'incasso e lo scostamento dal solito', async () => {
    const v = render(<CalendarioOperativo {...propsCal} />)
    await waitFor(() => expect(v.container.textContent).toContain('Incassato nel mese'))
    // Il primo giorno del mese con incasso.
    const bottone = v.container.querySelector(`button[aria-label*="${new Date(g(1) + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric' })}"]`)
    expect(bottone).toBeTruthy()
    fireEvent.click(bottone)
    await waitFor(() => expect(v.container.textContent).toContain('Nota del giorno'))
    expect(v.container.textContent).toContain('Incassato')
  })

  it('senza dati non rimprovera e non mostra numeri finti', async () => {
    // Senza nessuna chiusura in archivio l'azienda non usa la cassa: la pagina
    // parla di produzione invece di mostrare "0 €".
    const v = render(<CalendarioOperativo {...propsCal} chiusure={[]} />)
    await waitFor(() => expect(v.container.textContent).toContain('produzione registrata'))
    expect(v.container.textContent).toContain('Nessuna giornata di produzione registrata')
    expect(v.container.textContent).not.toContain('NaN')
    expect(v.container.textContent).not.toContain('0 giornate')
  })

  it('la colonna del giorno esiste anche vuota, cosi\' la griglia non si sposta', async () => {
    const v = render(<CalendarioOperativo {...propsCal} />)
    await waitFor(() => expect(v.container.textContent).toContain('Tocca un giorno'))
  })

  it('niente emoji: le icone sono SVG', async () => {
    const v = render(<CalendarioOperativo {...propsCal} />)
    await waitFor(() => expect(v.container.textContent).toContain('Incassato nel mese'))
    expect(v.container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

describe('Cassa — la giornata', () => {
  const monta = (p = {}) => render(
    <ConfirmProvider><ChiusuraView {...propsCassa} {...p} /></ConfirmProvider>
  )

  it('il titolo e\' il giorno, e la frase dice com\'e\' andata', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Quanto è entrato'))
    expect(v.container.textContent).toContain('Oggi')
    expect(v.container.textContent).toMatch(/Incassati|non è ancora registrato/)
    // Il vecchio sottotitolo da manuale d'istruzioni non c'e' piu'.
    expect(v.container.textContent).not.toContain('foto scontrino, import delivery o manuale')
  })

  it('con la giornata registrata confronta con un giorno come quello', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Quanto è entrato'))
    // Oggi e' dentro mesePieno(), quindi la chiusura esiste.
    expect(v.container.textContent).toContain('Incassato')
    expect(v.container.textContent).toMatch(/un \w+ fa|in linea con un \w+/i)
  })

  it('entrate e uscite stanno affiancate', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Quanto è entrato'))
    expect(v.container.textContent).toContain('Uscite di cassa')
  })

  it('i due import stanno in un menu, non come bottoni in cima', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Quanto è entrato'))
    expect(v.container.textContent).not.toContain('Importa delivery')
    expect(v.container.textContent).not.toContain('Sistema cassa')

    fireEvent.click(v.getByText('Importa'))
    await waitFor(() => expect(v.container.textContent).toContain('Da una piattaforma delivery'))
    expect(v.container.textContent).toContain('Dal sistema di cassa')
  })

  it('"Solo il totale" e\' il primo dei tre modi', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Solo il totale'))
    const tab = v.container.querySelectorAll('[role="tab"]')
    expect(tab).toHaveLength(3)
    expect(tab[0].textContent).toContain('Solo il totale')
    expect(tab[0].getAttribute('aria-selected')).toBe('true')
  })

  it('il dipendente non vede il navigatore dei giorni ne\' gli import', async () => {
    const v = monta({ isDipendente: true })
    await waitFor(() => expect(v.container.textContent).toContain('Quanto è entrato'))
    expect(v.container.querySelector('input[type="date"]')).toBeNull()
    expect(v.container.textContent).not.toContain('Importa')
  })

  it('senza chiusura salvata invita a registrare, senza numeri finti', async () => {
    const v = monta({ chiusure: [] })
    await waitFor(() => expect(v.container.textContent).toContain('Quanto è entrato'))
    expect(v.container.textContent).toContain('non è ancora registrato')
    expect(v.container.textContent).not.toContain('NaN')
  })

  it('niente emoji: le icone sono SVG', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Quanto è entrato'))
    expect(v.container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
