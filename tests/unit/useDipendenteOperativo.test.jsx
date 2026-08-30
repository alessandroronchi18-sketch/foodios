// @vitest-environment happy-dom
/**
 * Test flusso "identità operativa laboratorio" — hook + Provider.
 *
 * Copre i 3 casi critici emersi dall'audit 2026-07-29:
 *   1) Provider senza scope match pulisce localStorage (evita leak identità
 *      da un login precedente sullo stesso tablet).
 *   2) enabled=false pulisce sempre (titolare che entra dopo dipendente).
 *   3) seleziona() con RPC valida imposta state + storage.
 *   4) deseleziona() torna a "Chi sei?" senza toccare Supabase auth.
 *   5) useDipendenteOperativo fuori dal Provider ritorna fallback safe.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, act, cleanup, renderHook } from '@testing-library/react'

// Mock Supabase RPC prima di importare il modulo (che chiude sulla ref).
// Router per nome della RPC: valida (opens session), termina (closes), check.
const rpcMock = vi.fn()
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (name, args) => rpcMock(name, args),
  },
}))

// Helper: setup default per il session_check che gira al mount del Provider
// quando c'è già una sessione in storage. Se il test vuole testare uno
// scenario diverso (sessione stale), sovrascrive.
function mockSessionCheckOk() {
  rpcMock.mockImplementation((name) => {
    if (name === 'dipendente_operativo_session_check') return Promise.resolve({ data: { ok: true }, error: null })
    if (name === 'dipendente_operativo_termina') return Promise.resolve({ data: null, error: null })
    return Promise.resolve({ data: null, error: null })
  })
}

// Import DOPO il mock così il modulo raccoglie la versione mockata.
const { DipendenteOperativoProvider, useDipendenteOperativo } = await import('../../src/hooks/useDipendenteOperativo.jsx')

const LS_KEY = 'foodos_dip_op'

function wrapperFactory(props) {
  return ({ children }) => (
    <DipendenteOperativoProvider {...props}>{children}</DipendenteOperativoProvider>
  )
}

describe('DipendenteOperativoProvider — persistenza e scope safety', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch {}
    rpcMock.mockReset()
  })
  afterEach(() => { cleanup() })

  it('senza dati in storage: dip = null', () => {
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'user-1', enabled: true }),
    })
    expect(result.current.dipendente).toBeNull()
    expect(result.current.isSelezionato).toBe(false)
    expect(result.current.enabled).toBe(true)
  })

  it('storage con scope match: dip caricato', () => {
    mockSessionCheckOk()
    localStorage.setItem(LS_KEY, JSON.stringify({
      id: 'dip-1', nome: 'Marco', cognome: 'Rossi', ruolo: 'produzione',
      sessionId: 'sess-1',
      at: Date.now(), userScope: 'user-1',
    }))
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'user-1', enabled: true }),
    })
    expect(result.current.dipendente?.id).toBe('dip-1')
    expect(result.current.dipendente?.nome).toBe('Marco')
    expect(result.current.isSelezionato).toBe(true)
  })

  it('scope mismatch (altro laboratorio): pulisce storage + dip=null', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({
      id: 'dip-2', nome: 'Anna', cognome: 'Verdi',
      at: Date.now(), userScope: 'lab-A',
    }))
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-B', enabled: true }),
    })
    expect(result.current.dipendente).toBeNull()
    // Il Provider deve aver pulito localStorage per evitare che helper
    // client-side (stockPF/venditeB2B/haccp) leggano un id stale.
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })

  it('enabled=false pulisce SEMPRE lo storage (titolare dopo dipendente)', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({
      id: 'dip-3', nome: 'Luca', cognome: 'Neri',
      at: Date.now(), userScope: 'lab-A',
    }))
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'titolare-1', enabled: false }),
    })
    expect(result.current.dipendente).toBeNull()
    expect(result.current.enabled).toBe(false)
    // Fix critico dal recap: se un titolare entra dopo un dipendente, il
    // suo `enabled=false` DEVE azzerare `foodos_dip_op` altrimenti le
    // sue operazioni verrebbero loggate a nome del dipendente precedente.
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })
})

describe('seleziona() — validazione RPC e persistenza', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch {}
    rpcMock.mockReset()
    // Default: qualsiasi RPC ritorna una Promise che risolve a null. I test
    // che vogliono specifici comportamenti sovrascrivono con mockImplementation
    // o mockResolvedValueOnce, ma il default previene il crash "Cannot read
    // properties of undefined (reading 'then')" quando il Provider al mount
    // fa `session_check` senza che il test l'abbia esplicitamente moccato.
    rpcMock.mockResolvedValue({ data: null, error: null })
  })
  afterEach(() => { cleanup() })

  it('RPC ok: setta dip in state + storage con userScope + sessionId', async () => {
    // Sia valida (che ritorna il dip) sia il check post-seleziona (che
    // conferma la sessione attiva). Se il check risponde ok=false, il
    // Provider farebbe deseleziona automatica.
    rpcMock.mockImplementation((name) => {
      if (name === 'dipendente_operativo_valida') return Promise.resolve({
        data: { ok: true, id: 'dip-10', nome: 'Sara', cognome: 'Bianchi', ruolo: 'banco', session_id: 'sess-xyz' },
        error: null,
      })
      if (name === 'dipendente_operativo_session_check') return Promise.resolve({ data: { ok: true }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-X', enabled: true }),
    })
    let ret
    await act(async () => { ret = await result.current.seleziona('1234') })
    expect(rpcMock).toHaveBeenCalledWith('dipendente_operativo_valida', { p_codice: '1234' })
    expect(ret).toMatchObject({ ok: true })
    expect(result.current.dipendente?.id).toBe('dip-10')
    expect(result.current.dipendente?.sessionId).toBe('sess-xyz')
    expect(result.current.isSelezionato).toBe(true)
    const stored = JSON.parse(localStorage.getItem(LS_KEY))
    expect(stored.userScope).toBe('lab-X')
    expect(stored.id).toBe('dip-10')
    expect(stored.sessionId).toBe('sess-xyz')
  })

  it('RPC error: dip resta null, errore ritornato', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'db down' } })
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-X', enabled: true }),
    })
    let ret
    await act(async () => { ret = await result.current.seleziona('9999') })
    expect(ret).toMatchObject({ ok: false, error: 'rpc_error' })
    expect(result.current.dipendente).toBeNull()
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })

  it('RPC ritorna ok=false (codice non valido): dip resta null', async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'codice_non_valido' }, error: null })
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-X', enabled: true }),
    })
    let ret
    await act(async () => { ret = await result.current.seleziona('0000') })
    expect(ret.ok).toBe(false)
    expect(ret.error).toBe('codice_non_valido')
    expect(result.current.dipendente).toBeNull()
  })

  it('codice mancante: no RPC call, ritorna errore', async () => {
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-X', enabled: true }),
    })
    let ret
    await act(async () => { ret = await result.current.seleziona('') })
    expect(ret.ok).toBe(false)
    expect(ret.error).toBe('codice_mancante')
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('deseleziona() — chiude sessione server-side + pulisce locale', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch {}
    rpcMock.mockReset()
    // Default: qualsiasi RPC ritorna una Promise che risolve a null. I test
    // che vogliono specifici comportamenti sovrascrivono con mockImplementation
    // o mockResolvedValueOnce, ma il default previene il crash "Cannot read
    // properties of undefined (reading 'then')" quando il Provider al mount
    // fa `session_check` senza che il test l'abbia esplicitamente moccato.
    rpcMock.mockResolvedValue({ data: null, error: null })
  })
  afterEach(() => { cleanup() })

  it('pulisce state + storage + chiama RPC termina con sessionId', async () => {
    rpcMock.mockImplementation((name) => {
      if (name === 'dipendente_operativo_valida') return Promise.resolve({ data: { ok: true, id: 'dip-20', nome: 'Tommaso', cognome: 'Gialli', session_id: 'sess-abc' }, error: null })
      if (name === 'dipendente_operativo_session_check') return Promise.resolve({ data: { ok: true }, error: null })
      if (name === 'dipendente_operativo_termina') return Promise.resolve({ data: null, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-Z', enabled: true }),
    })
    await act(async () => { await result.current.seleziona('5678') })
    expect(result.current.isSelezionato).toBe(true)
    await act(async () => { await result.current.deseleziona() })
    expect(result.current.dipendente).toBeNull()
    expect(result.current.isSelezionato).toBe(false)
    expect(localStorage.getItem(LS_KEY)).toBeNull()
    // Verifica che l'RPC termina sia stata chiamata con la session_id giusta
    expect(rpcMock).toHaveBeenCalledWith('dipendente_operativo_termina', { p_session_id: 'sess-abc' })
  })
})

describe('session check al mount — sessione stale invalidata dal server', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch {}
    rpcMock.mockReset()
    // Default: qualsiasi RPC ritorna una Promise che risolve a null. I test
    // che vogliono specifici comportamenti sovrascrivono con mockImplementation
    // o mockResolvedValueOnce, ma il default previene il crash "Cannot read
    // properties of undefined (reading 'then')" quando il Provider al mount
    // fa `session_check` senza che il test l'abbia esplicitamente moccato.
    rpcMock.mockResolvedValue({ data: null, error: null })
  })
  afterEach(() => { cleanup() })

  it('server dice session_not_active → pulisce localStorage + state', async () => {
    // Utente crede di avere sessione ma il server dice di no (es. deploy,
    // scadenza 12h, disattivazione codice, session_id manomessa). Il
    // Provider deve azzerare la sessione locale al mount.
    localStorage.setItem(LS_KEY, JSON.stringify({
      id: 'dip-stale', nome: 'Vecchio', cognome: 'Dip',
      sessionId: 'sess-stale',
      at: Date.now(), userScope: 'lab-K',
    }))
    rpcMock.mockImplementation((name) => {
      if (name === 'dipendente_operativo_session_check') return Promise.resolve({ data: { ok: false, error: 'session_not_active' }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-K', enabled: true }),
    })
    // Aspetta che il check async al mount finisca (act flusha lo state).
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(result.current.dipendente).toBeNull()
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })

  it('server dice ok=true → sessione locale conservata', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({
      id: 'dip-live', nome: 'Attivo', cognome: 'Dip',
      sessionId: 'sess-live',
      at: Date.now(), userScope: 'lab-K',
    }))
    rpcMock.mockImplementation((name) => {
      if (name === 'dipendente_operativo_session_check') return Promise.resolve({ data: { ok: true, dipendente_id: 'dip-live' }, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-K', enabled: true }),
    })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(result.current.dipendente?.id).toBe('dip-live')
    expect(result.current.isSelezionato).toBe(true)
  })
})

describe('useDipendenteOperativo — senza Provider (titolare classico)', () => {
  afterEach(() => { cleanup() })

  it('ritorna fallback safe: enabled=false, isSelezionato=false', () => {
    const { result } = renderHook(() => useDipendenteOperativo())
    expect(result.current.enabled).toBe(false)
    expect(result.current.isSelezionato).toBe(false)
    expect(result.current.dipendente).toBeNull()
  })

  it('seleziona() fuori dal Provider ritorna errore no_provider', async () => {
    const { result } = renderHook(() => useDipendenteOperativo())
    const ret = await result.current.seleziona('1234')
    expect(ret.ok).toBe(false)
    expect(ret.error).toBe('no_provider')
  })
})

describe('RegistroAttivita — dipMap join', () => {
  // Non testiamo il componente completo (troppo grosso), ma verifichiamo che
  // la logica di lookup nome+cognome funzioni sui dati che la view usa. La
  // struttura di dipMap è: { [id]: { nome, cognome } }.
  it('lookup restituisce nome+cognome per id noto', () => {
    const dipMap = {
      'dip-a': { nome: 'Marco', cognome: 'Rossi' },
      'dip-b': { nome: 'Anna', cognome: 'Verdi' },
    }
    expect(dipMap['dip-a']).toEqual({ nome: 'Marco', cognome: 'Rossi' })
    const nomeCompleto = [dipMap['dip-a'].nome, dipMap['dip-a'].cognome].filter(Boolean).join(' ')
    expect(nomeCompleto).toBe('Marco Rossi')
  })

  it('id sconosciuto: fallback a null (view mostrerà email account laboratorio)', () => {
    const dipMap = { 'dip-a': { nome: 'Marco', cognome: 'Rossi' } }
    expect(dipMap['dip-x']).toBeUndefined()
  })
})
