// @vitest-environment happy-dom
//
// ── Il calendario dei turni era vuoto, e nessuno lo sapeva ─────────────────
//
// Il difetto, trovato il 20/09/2026 leggendo la pagina Personale sui dati
// veri del design partner: 288 turni registrati sul database, e la timeline
// della settimana che disegnava un trattino su ogni riga.
//
// Postgres restituisce le colonne `time` **coi secondi**: `ora_inizio` arriva
// come "08:00:00", non "08:00". `oraValida` in `src/lib/turni.js` accetta solo
// la forma `HH:MM`, quindi rispondeva di no, e `finMin` ripiegava sull'ora di
// inizio. Risultato: **ogni turno letto dal database durava zero minuti**.
//
// Da lì in giù cadeva tutto insieme:
//   · `analizzaCopertura` scarta i turni con `fin <= ini` → timeline vuota
//   · la barra della copertura e il «2 persone in turno» non comparivano mai
//   · l'avviso sui turni accavallati confrontava intervalli lunghi zero, e
//     quindi non scattava mai: la stessa persona poteva finire su due turni
//     sovrapposti senza una parola
//
// La beffa è che il totale in cima diceva la verità — le ore vengono dalla
// colonna `ore`, già calcolata al salvataggio. Si leggeva «32,0h» sopra e si
// vedeva un calendario vuoto sotto, e la contraddizione non aveva spiegazione.
//
// Come riprodurlo sul codice di prima: `oreTurno('08:00:00','16:00:00')` → 0.
// Con "08:00"/"16:00" → 8.
//
// La correzione sta in `Personale.jsx`: `soloOreMinuti()` taglia i secondi
// una volta sola, al caricamento, prima che li tocchi qualunque conto.
//
// Qui dentro ci sono anche le prove di quello che c'è intorno: mezzanotte,
// fine prima dell'inizio, sovrapposizioni, il cambio dell'ora legale e le
// settimane a cavallo d'anno.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { lunediDellaSettimana, aggiungiGiorni } from '../../src/lib/dateLocal'
import { oreTurno } from '../../src/lib/turni'

const DB = { dipendenti: [], turni: [] }
const CHIAMATE = []

function fluente(nome) {
  const h = {
    get(_t, p) {
      if (p === 'then') return (res) => res({ data: DB[nome] || [], error: null, count: (DB[nome] || []).length })
      if (p === 'single' || p === 'maybeSingle') return () => Promise.resolve({ data: (DB[nome] || [])[0] || null, error: null })
      return (...args) => { CHIAMATE.push({ tabella: nome, op: p, args }); return new Proxy({}, h) }
    },
  }
  return new Proxy({}, h)
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'x' } } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (nome) => fluente(nome),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

// Nomi inventati: sui dati veri ci sono persone vere.
const ANNA = { id: 'd1', nome: 'Anna Pedrini', ruolo: 'Pasticciera', tipo_contratto: 'Full-time', attivo: true, costo_orario: 15, ore_settimana: 40, stipendio_lordo_mensile: 0 }
const BRUNO = { id: 'd2', nome: 'Bruno Salis', ruolo: 'Banco', tipo_contratto: 'Part-time', attivo: true, costo_orario: 12, ore_settimana: 24, stipendio_lordo_mensile: 0 }
const SENZA_COSTO = { id: 'd3', nome: 'Carla Innocenti', ruolo: 'Aiuto', tipo_contratto: 'Stagionale', attivo: true, costo_orario: 0, ore_settimana: 20, stipendio_lordo_mensile: 0 }

// Il lunedì della settimana mostrata: l'ancora della scheda Turni è oggi.
const OGGI = new Date(2026, 8, 16, 10, 0, 0) // mercoledì 16 settembre 2026
const LUNEDI = lunediDellaSettimana('2026-09-16')

// Un turno come lo restituisce Postgres: orari CON i secondi.
const turno = (id, dipId, nome, data, dalle, alle, extra = {}) => ({
  id, dipendente_id: dipId, data,
  ora_inizio: dalle, ora_fine: alle,
  ore: oreTurno(dalle.slice(0, 5), alle.slice(0, 5)),
  costo: 0, note: '', dipendenti: { nome, costo_orario: 15, stipendio_lordo_mensile: 0, ore_settimana: 40 },
  ...extra,
})

beforeEach(() => {
  DB.dipendenti = [ANNA, BRUNO, SENZA_COSTO]
  DB.turni = []
  CHIAMATE.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(OGGI)
})
afterEach(() => { vi.useRealTimers(); cleanup(); vi.resetModules() })

// La pagina e il provider delle conferme si caricano INSIEME, dallo stesso
// registro dei moduli. Con `vi.resetModules()` fra un test e l'altro, un
// import statico del provider e un import dinamico della pagina danno due
// copie di `ConfirmModal`, quindi due contesti React diversi: `useConfirm()`
// dentro la pagina non trova niente e ripiega sul `confirm` del browser. Le
// finestre di conferma non comparivano, e il test passava senza provare nulla.
async function monta(props = {}) {
  const [{ default: Personale }, { ConfirmProvider }] = await Promise.all([
    import('../../src/components/Personale.jsx'),
    import('../../src/components/ConfirmModal.jsx'),
  ])
  return render(
    <ConfirmProvider>
      <Personale orgId="org-1" sedeId="s1" sedi={[{ id: 's1', nome: 'Centro', attiva: true }]}
        notify={() => {}} adminNome="Anita" nomeAttivita="Pasticceria di prova" {...props} />
    </ConfirmProvider>
  )
}

async function apriTurni() {
  const r = await monta()
  // Aspetta che la lista dipendenti sia arrivata: «Turni» è scritto sulla
  // linguetta fin dal primo disegno, aspettare quella non prova niente.
  await waitFor(() => expect(r.container.textContent).toContain(ANNA.nome), { timeout: 8000 })
  fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Turni'))
  // E qui si aspetta che i turni siano stati caricati e disegnati: il totale
  // delle ore in cima esce dai dati, non dallo stato iniziale.
  await waitFor(() => expect(r.container.textContent).toContain('Costo lavoro'), { timeout: 8000 })
  return r
}

const barre = (c) => [...c.querySelectorAll('[aria-label^="Turno "]')]

describe('I turni letti dal database si vedono nel calendario', () => {
  it('un turno con gli orari coi secondi compare nella timeline', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
  })

  it('la barra dice l\'orario giusto, non «dalle 08:00 alle 08:00»', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
    expect(barre(container)[0].getAttribute('aria-label')).toContain('dalle 08:00 alle 16:00')
  })

  it('la barra ha una larghezza vera, non zero', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
    expect(barre(container)[0].style.width).not.toMatch(/^calc\(0%/)
  })

  it('due turni nello stesso giorno si vedono tutti e due', async () => {
    DB.turni = [
      turno('t1', 'd1', ANNA.nome, LUNEDI, '06:00:00', '14:00:00'),
      turno('t2', 'd2', BRUNO.nome, LUNEDI, '14:00:00', '22:00:00'),
    ]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(2), { timeout: 8000 })
  })

  it('la riga della copertura dice quante persone ci sono', async () => {
    DB.turni = [
      turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00'),
      turno('t2', 'd2', BRUNO.nome, LUNEDI, '10:00:00', '18:00:00'),
    ]
    const { container } = await apriTurni()
    await waitFor(() => expect(container.textContent).toMatch(/1–2 persone|2 persone/), { timeout: 8000 })
  })

  it('un giorno senza turni resta «riposo», e non si confonde col difetto', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
    expect(container.textContent).toContain('riposo')
  })

  it('anche gli orari già senza secondi continuano a funzionare', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '09:00', '13:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
    expect(barre(container)[0].getAttribute('aria-label')).toContain('dalle 09:00 alle 13:00')
  })

  it('un turno a cavallo di mezzanotte si disegna fino a dopo le 24', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '19:00:00', '00:30:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
    expect(barre(container)[0].getAttribute('aria-label')).toContain('dalle 19:00 alle 00:30')
  })

  it('un turno che finisce quando comincia non si disegna: è un errore, non un turno', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '08:00:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(container.textContent).toContain('Costo lavoro'), { timeout: 8000 })
    expect(barre(container).length).toBe(0)
  })

  it('il totale delle ore in cima e il calendario raccontano la stessa cosa', async () => {
    DB.turni = [
      turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00'),
      turno('t2', 'd2', BRUNO.nome, aggiungiGiorni(LUNEDI, 1), '08:00:00', '16:00:00'),
    ]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(2), { timeout: 8000 })
    expect(container.textContent).toContain('16.0h')
  })
})

describe('La settimana mostrata, e i confini che la spostano', () => {
  it('comincia dal lunedì della settimana di oggi', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
    expect(LUNEDI).toBe('2026-09-14')
    expect(container.textContent).toContain('14 settembre')
  })

  it('«successiva» sposta di sette giorni esatti, non di sei', async () => {
    DB.turni = []
    const { container } = await apriTurni()
    await waitFor(() => expect(container.textContent).toContain('14 settembre'), { timeout: 8000 })
    fireEvent.click(container.querySelector('[aria-label="Periodo successivo"]'))
    await waitFor(() => expect(container.textContent).toContain('21 settembre'), { timeout: 8000 })
  })

  it('attraversa il cambio dell\'ora legale senza saltare un giorno', async () => {
    // 25 ottobre 2026: l'Italia torna da +2 a +1. Con l'aritmetica sui
    // millisecondi la settimana dopo il 19 ottobre finiva un giorno storta.
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0)) // lunedì 19 ottobre
    DB.turni = []
    const { container } = await apriTurni()
    await waitFor(() => expect(container.textContent).toContain('19 ottobre'), { timeout: 8000 })
    fireEvent.click(container.querySelector('[aria-label="Periodo successivo"]'))
    await waitFor(() => expect(container.textContent).toContain('26 ottobre'), { timeout: 8000 })
  })

  it('una settimana a cavallo d\'anno mostra dicembre e gennaio insieme', async () => {
    vi.setSystemTime(new Date(2026, 11, 30, 12, 0, 0)) // mercoledì 30 dicembre 2026
    DB.turni = []
    const { container } = await apriTurni()
    await waitFor(() => expect(container.textContent).toContain('dicembre'), { timeout: 8000 })
    expect(container.textContent).toContain('gennaio')
  })

  it('un turno del 31 dicembre si vede nella settimana che scavalca l\'anno', async () => {
    vi.setSystemTime(new Date(2026, 11, 30, 12, 0, 0))
    DB.turni = [turno('t1', 'd1', ANNA.nome, '2026-12-31', '18:00:00', '23:00:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
  })
})

describe('Prima di cancellare un turno, si chiede', () => {
  async function apriPrimoTurno(container) {
    await waitFor(() => expect(barre(container).length).toBeGreaterThan(0), { timeout: 8000 })
    fireEvent.click(barre(container)[0])
    await waitFor(() => expect(container.textContent).toContain('Modifica turno'), { timeout: 8000 })
  }

  it('il cestino apre una domanda invece di cancellare subito', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container, baseElement } = await apriTurni()
    await apriPrimoTurno(container)
    fireEvent.click(container.querySelector('[title="Elimina turno"]'))
    await waitFor(() => expect(baseElement.textContent).toContain('Eliminare il turno?'), { timeout: 8000 })
  })

  it('la domanda dice di che turno si tratta', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container, baseElement } = await apriTurni()
    await apriPrimoTurno(container)
    fireEvent.click(container.querySelector('[title="Elimina turno"]'))
    await waitFor(() => expect(baseElement.textContent).toContain('08:00–16:00'), { timeout: 8000 })
  })

  it('rispondendo «Annulla» non si cancella niente', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container, baseElement } = await apriTurni()
    await apriPrimoTurno(container)
    // Il registro si azzera PRIMA del cestino: se la domanda non fosse attesa
    // con `await`, la cancellazione partirebbe subito e azzerare dopo la
    // nasconderebbe.
    CHIAMATE.length = 0
    fireEvent.click(container.querySelector('[title="Elimina turno"]'))
    await waitFor(() => expect(baseElement.textContent).toContain('Eliminare il turno?'), { timeout: 8000 })
    fireEvent.click([...baseElement.querySelectorAll('button')].find(b => b.textContent.trim() === 'Annulla'))
    await waitFor(() => expect(baseElement.textContent).not.toContain('Eliminare il turno?'), { timeout: 8000 })
    expect(CHIAMATE.filter(c => c.tabella === 'turni' && c.op === 'delete')).toHaveLength(0)
  })

  it('rispondendo «Elimina» il turno viene cancellato davvero', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container, baseElement } = await apriTurni()
    await apriPrimoTurno(container)
    fireEvent.click(container.querySelector('[title="Elimina turno"]'))
    await waitFor(() => expect(baseElement.textContent).toContain('Eliminare il turno?'), { timeout: 8000 })
    CHIAMATE.length = 0
    fireEvent.click([...baseElement.querySelectorAll('button')].find(b => b.textContent.trim() === 'Elimina'))
    await waitFor(() => expect(CHIAMATE.filter(c => c.tabella === 'turni' && c.op === 'delete').length).toBe(1), { timeout: 8000 })
  })
})

describe('Salvare un turno: quello che il programma rifiuta e quello che chiede', () => {
  async function apriModulo(container) {
    fireEvent.click([...container.querySelectorAll('button')].find(b => /Turno$/.test(b.textContent.trim())))
    await waitFor(() => expect(container.textContent).toContain('Nuovo turno'), { timeout: 8000 })
  }
  const campo = (container, tipo, i = 0) => container.querySelectorAll(`input[type="${tipo}"]`)[i]

  it('non salva un turno che finisce quando comincia', async () => {
    const avvisi = []
    const r = await monta({ notify: (m) => avvisi.push(m) })
    await waitFor(() => expect(r.container.textContent).toContain(ANNA.nome), { timeout: 8000 })
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Turni'))
    await waitFor(() => expect(r.container.textContent).toContain('Costo lavoro'), { timeout: 8000 })
    await apriModulo(r.container)
    fireEvent.change(r.container.querySelector('select'), { target: { value: 'd1' } })
    fireEvent.change(campo(r.container, 'date'), { target: { value: LUNEDI } })
    fireEvent.change(campo(r.container, 'time', 0), { target: { value: '09:00' } })
    fireEvent.change(campo(r.container, 'time', 1), { target: { value: '09:00' } })
    CHIAMATE.length = 0
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salva'))
    await waitFor(() => expect(avvisi.join(' ')).toContain('zero ore'), { timeout: 8000 })
    expect(CHIAMATE.filter(c => c.tabella === 'turni' && c.op === 'insert')).toHaveLength(0)
  })

  it('avvisa prima di registrare ore di una persona senza costo', async () => {
    const r = await monta()
    await waitFor(() => expect(r.container.textContent).toContain(ANNA.nome), { timeout: 8000 })
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Turni'))
    await waitFor(() => expect(r.container.textContent).toContain('Costo lavoro'), { timeout: 8000 })
    await apriModulo(r.container)
    fireEvent.change(r.container.querySelector('select'), { target: { value: 'd3' } })
    fireEvent.change(campo(r.container, 'date'), { target: { value: LUNEDI } })
    fireEvent.change(campo(r.container, 'time', 0), { target: { value: '09:00' } })
    fireEvent.change(campo(r.container, 'time', 1), { target: { value: '13:00' } })
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salva'))
    await waitFor(() => expect(r.baseElement.textContent).toContain('Manca il costo di questa persona'), { timeout: 8000 })
  })

  it('e se si annulla, il turno non viene scritto', async () => {
    const r = await monta()
    await waitFor(() => expect(r.container.textContent).toContain(ANNA.nome), { timeout: 8000 })
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Turni'))
    await waitFor(() => expect(r.container.textContent).toContain('Costo lavoro'), { timeout: 8000 })
    await apriModulo(r.container)
    fireEvent.change(r.container.querySelector('select'), { target: { value: 'd3' } })
    fireEvent.change(campo(r.container, 'date'), { target: { value: LUNEDI } })
    fireEvent.change(campo(r.container, 'time', 0), { target: { value: '09:00' } })
    fireEvent.change(campo(r.container, 'time', 1), { target: { value: '13:00' } })
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salva'))
    await waitFor(() => expect(r.baseElement.textContent).toContain('Manca il costo di questa persona'), { timeout: 8000 })
    CHIAMATE.length = 0
    fireEvent.click([...r.baseElement.querySelectorAll('button')].find(b => b.textContent.trim() === 'Annulla'))
    await waitFor(() => expect(r.baseElement.textContent).not.toContain('Manca il costo di questa persona'), { timeout: 8000 })
    expect(CHIAMATE.filter(c => c.tabella === 'turni' && c.op === 'insert')).toHaveLength(0)
  })

  it('i turni del giorno si rileggono dal database prima di avvisare sulla sovrapposizione', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
    await apriModulo(container)
    fireEvent.change(container.querySelector('select'), { target: { value: 'd1' } })
    fireEvent.change(campo(container, 'date'), { target: { value: LUNEDI } })
    fireEvent.change(campo(container, 'time', 0), { target: { value: '10:00' } })
    fireEvent.change(campo(container, 'time', 1), { target: { value: '14:00' } })
    CHIAMATE.length = 0
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salva'))
    // La lettura mirata per dipendente e giorno: prima il controllo guardava
    // solo la lista già a schermo, e fuori dal periodo mostrato era cieco.
    await waitFor(() => {
      const perGiorno = CHIAMATE.filter(c => c.tabella === 'turni' && c.op === 'eq' && String(c.args[0]) === 'data')
      expect(perGiorno.length).toBeGreaterThan(0)
    }, { timeout: 8000 })
  })

  it('e quella lettura avvisa davvero che il turno si accavalla', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '08:00:00', '16:00:00')]
    const { container, baseElement } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
    await apriModulo(container)
    fireEvent.change(container.querySelector('select'), { target: { value: 'd1' } })
    fireEvent.change(campo(container, 'date'), { target: { value: LUNEDI } })
    fireEvent.change(campo(container, 'time', 0), { target: { value: '10:00' } })
    fireEvent.change(campo(container, 'time', 1), { target: { value: '14:00' } })
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salva'))
    await waitFor(() => expect(baseElement.textContent).toContain('Turno sovrapposto'), { timeout: 8000 })
  })

  it('l\'avviso dice l\'ora di fine giusta anche per un turno di notte', async () => {
    DB.turni = [turno('t1', 'd1', ANNA.nome, LUNEDI, '19:00:00', '00:30:00')]
    const { container, baseElement } = await apriTurni()
    await waitFor(() => expect(barre(container).length).toBe(1), { timeout: 8000 })
    await apriModulo(container)
    fireEvent.change(container.querySelector('select'), { target: { value: 'd1' } })
    fireEvent.change(campo(container, 'date'), { target: { value: LUNEDI } })
    fireEvent.change(campo(container, 'time', 0), { target: { value: '20:00' } })
    fireEvent.change(campo(container, 'time', 1), { target: { value: '22:00' } })
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salva'))
    await waitFor(() => expect(baseElement.textContent).toContain('dalle 19:00 alle 00:30'), { timeout: 8000 })
  })
})
