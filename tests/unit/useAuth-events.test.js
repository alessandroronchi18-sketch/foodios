/**
 * Test sull'event-handling di useAuth.
 *
 * Bug storico: Supabase SDK emette `INITIAL_SESSION` da onAuthStateChange
 * PRIMA che getSession() finisca il refresh del token. Se INITIAL_SESSION
 * arriva con session=null, l'app flashava la LandingPage prima di Dashboard.
 *
 * Garanzia minima qui: il source useAuth.js IGNORA INITIAL_SESSION nel
 * handler di onAuthStateChange. Lo test legge il sorgente per assicurarsi
 * che il fix non venga rimosso per sbaglio in futuri refactor.
 *
 * Niente test di runtime su useAuth perché richiede mock complesso di
 * supabase-js e React hooks — qui ci bastano gli invariant strutturali.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(__dirname, '../../src/auth/useAuth.js'), 'utf8')

describe('useAuth.js — invariant: skip INITIAL_SESSION', () => {
  it('ignora INITIAL_SESSION in onAuthStateChange', () => {
    // Cerchiamo il pattern: dentro la callback di onAuthStateChange ci deve
    // essere un early-return su event === 'INITIAL_SESSION'
    expect(src).toMatch(/event\s*===\s*'INITIAL_SESSION'/)
    // Deve esserci anche un return early (skip) collegato
    const m = src.match(/if\s*\(\s*event\s*===\s*'INITIAL_SESSION'\s*\)\s*return/)
    expect(m).toBeTruthy()
  })

  it('skip TOKEN_REFRESHED / USER_UPDATED senza re-loadProfile', () => {
    expect(src).toMatch(/event\s*===\s*'TOKEN_REFRESHED'\s*\|\|\s*event\s*===\s*'USER_UPDATED'/)
  })

  it('SIGNED_IN ripetuto per stesso user.id non re-loadProfila', () => {
    expect(src).toMatch(/session\.user\.id\s*===\s*lastProfiledUserId\.current/)
  })

  it('safety timeout 8s su loading (no spinner infinito)', () => {
    expect(src).toMatch(/setTimeout\s*\(\s*\(\)\s*=>\s*setLoading\(false\)\s*,\s*8000\s*\)/)
  })
})
