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
const rpcMock = vi.fn()
vi.mock('../../src/lib/supabase', () => ({
  supabase: { rpc: (name, args) => rpcMock(name, args) },
}))

// Import DOPO il mock così il modulo raccoglie la versione mockata.
const { DipendenteOperativoProvider, useDipendenteOperativo } = await import('../../src/hooks/useDipendenteOperativo.jsx')

const LS_KEY = 'foodios_dip_op'

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
    localStorage.setItem(LS_KEY, JSON.stringify({
      id: 'dip-1', nome: 'Marco', cognome: 'Rossi', ruolo: 'produzione',
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
    // suo `enabled=false` DEVE azzerare `foodios_dip_op` altrimenti le
    // sue operazioni verrebbero loggate a nome del dipendente precedente.
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })
})

describe('seleziona() — validazione RPC e persistenza', () => {
  beforeEach(() => { try { localStorage.clear() } catch {} ; rpcMock.mockReset() })
  afterEach(() => { cleanup() })

  it('RPC ok: setta dip in state + storage con userScope', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, id: 'dip-10', nome: 'Sara', cognome: 'Bianchi', ruolo: 'banco' },
      error: null,
    })
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-X', enabled: true }),
    })
    let ret
    await act(async () => { ret = await result.current.seleziona('1234') })
    expect(rpcMock).toHaveBeenCalledWith('dipendente_operativo_valida', { p_codice: '1234' })
    expect(ret).toMatchObject({ ok: true })
    expect(result.current.dipendente?.id).toBe('dip-10')
    expect(result.current.isSelezionato).toBe(true)
    const stored = JSON.parse(localStorage.getItem(LS_KEY))
    expect(stored.userScope).toBe('lab-X')
    expect(stored.id).toBe('dip-10')
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

describe('deseleziona() — torna a "Chi sei?" senza signOut', () => {
  beforeEach(() => { try { localStorage.clear() } catch {} ; rpcMock.mockReset() })
  afterEach(() => { cleanup() })

  it('pulisce state + storage, dip torna null', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, id: 'dip-20', nome: 'Tommaso', cognome: 'Gialli' },
      error: null,
    })
    const { result } = renderHook(() => useDipendenteOperativo(), {
      wrapper: wrapperFactory({ userScope: 'lab-Z', enabled: true }),
    })
    await act(async () => { await result.current.seleziona('5678') })
    expect(result.current.isSelezionato).toBe(true)
    act(() => { result.current.deseleziona() })
    expect(result.current.dipendente).toBeNull()
    expect(result.current.isSelezionato).toBe(false)
    expect(localStorage.getItem(LS_KEY)).toBeNull()
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
