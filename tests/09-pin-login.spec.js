// @ts-check
// FLUSSO PIN LOGIN end-to-end (a livello DB+RPC, niente browser):
//   1. Titolare imposta PIN dipendente via RPC set_dipendente_pin
//   2. verify_dipendente_pin(org_slug, PIN) ritorna user_id sul match
//   3. 5 miss consecutivi → pin_failed_count incrementa fino al lock 15min
//   4. Lock attivo: anche PIN corretto ritorna null finché pin_locked_until > now
//   5. Cross-org: il PIN di org A non funziona col slug di org B
//   6. Reset counter al match valido (post-lock-expiry, simulato a DB)
//
// Audit 2026-06-19 CRITICAL: il bug originale era che verify_dipendente_pin NON
// incrementava pin_failed_count sui miss. La migration 20260702_pin_lockout
// enforcement corregge. Questo test garantisce non si regredisca.
//
// Gira se ci sono: SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY.

import { test, expect } from '@playwright/test'
import { hasDbEnv, serviceClient, createEphemeralOrg, createDipendenteIn, cleanupOrg } from './helpers/db.js'

// verify_dipendente_pin è SECURITY DEFINER + revoked from authenticated:
// solo il service_role la può chiamare. Wrap per chiarezza nei test.
async function verifyPin(svc, orgSlug, pin) {
  const { data, error } = await svc.rpc('verify_dipendente_pin', {
    p_org_slug: orgSlug,
    p_pin: pin,
  })
  return { userId: data, error }
}

async function readPinState(svc, userId) {
  const { data } = await svc
    .from('profiles')
    .select('pin_hash, pin_failed_count, pin_locked_until, pin_last_used_at')
    .eq('id', userId)
    .maybeSingle()
  return data
}

// Forza l'unlock di un utente nel DB (simula scadenza dei 15min senza dover
// aspettare davvero). Equivalente al passare-del-tempo nella verify.
async function unlockUser(svc, userId) {
  await svc
    .from('profiles')
    .update({ pin_failed_count: 0, pin_locked_until: null })
    .eq('id', userId)
}

test.describe('PIN login — lockout enforcement + cross-org isolation', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  test('5 fallimenti consecutivi → account locked 15min; match valido resetta il counter', async () => {
    const svc = serviceClient()
    let titolare = null
    let dipRef = null
    try {
      titolare = await createEphemeralOrg(svc, 'pin-tit')
      // Verifica che lo slug sia stato generato dal trigger di handle_new_user
      const { data: orgRow } = await svc.from('organizations').select('slug').eq('id', titolare.orgId).maybeSingle()
      expect(orgRow?.slug, 'org deve avere uno slug (migration 20260618 backfill)').toBeTruthy()
      const orgSlug = orgRow.slug

      dipRef = await createDipendenteIn(svc, titolare.orgId, 'pin-dip')
      const PIN_CORRECT = '4271'
      const PIN_WRONG = '0000'

      // Il titolare imposta il PIN al dipendente (RPC autenticata col token del titolare)
      const { data: setOk, error: setErr } = await titolare.userClient.rpc('set_dipendente_pin', {
        p_user_id: dipRef.userId,
        p_pin: PIN_CORRECT,
      })
      expect(setErr, 'set_dipendente_pin OK').toBeFalsy()
      expect(setOk).toBe(true)

      // Stato iniziale: hash settato, counter 0, niente lock
      const init = await readPinState(svc, dipRef.userId)
      expect(init?.pin_hash, 'pin_hash settato').toBeTruthy()
      expect(init?.pin_failed_count).toBe(0)
      expect(init?.pin_locked_until).toBeNull()

      // ── 1) Match valido → ritorna user_id, resetta counter, set last_used ─────
      const okFirst = await verifyPin(svc, orgSlug, PIN_CORRECT)
      expect(okFirst.error).toBeFalsy()
      expect(okFirst.userId, 'PIN corretto → userId').toBe(dipRef.userId)
      const afterOk = await readPinState(svc, dipRef.userId)
      expect(afterOk?.pin_last_used_at, 'last_used aggiornato').toBeTruthy()
      expect(afterOk?.pin_failed_count).toBe(0)

      // ── 2) 4 miss → counter incrementa, nessun lock ───────────────────────────
      for (let i = 1; i <= 4; i++) {
        const r = await verifyPin(svc, orgSlug, PIN_WRONG)
        expect(r.userId, `miss ${i} → null`).toBeNull()
        const s = await readPinState(svc, dipRef.userId)
        expect(s?.pin_failed_count, `counter dopo ${i} miss`).toBe(i)
        expect(s?.pin_locked_until, `nessun lock dopo ${i} miss (<5)`).toBeNull()
      }

      // ── 3) 5° miss → account locked 15min ─────────────────────────────────────
      const miss5 = await verifyPin(svc, orgSlug, PIN_WRONG)
      expect(miss5.userId).toBeNull()
      const locked = await readPinState(svc, dipRef.userId)
      expect(locked?.pin_failed_count, 'counter al 5° miss').toBe(5)
      expect(locked?.pin_locked_until, 'lock impostato').toBeTruthy()
      const lockedUntilMs = new Date(locked.pin_locked_until).getTime()
      const now = Date.now()
      // Lock 15min ±60s di tolleranza per latenza clock DB↔runner
      expect(lockedUntilMs - now, 'lock ~15min nel futuro').toBeGreaterThan(14 * 60 * 1000 - 60_000)
      expect(lockedUntilMs - now).toBeLessThan(16 * 60 * 1000)

      // ── 4) Durante il lock, anche il PIN corretto ritorna null ────────────────
      const blocked = await verifyPin(svc, orgSlug, PIN_CORRECT)
      expect(blocked.userId, 'PIN corretto durante lock → null (skip via lock check)').toBeNull()

      // ── 5) Unlock manuale (simula scadenza 15min) → il match valido funziona di nuovo ─
      await unlockUser(svc, dipRef.userId)
      const recovered = await verifyPin(svc, orgSlug, PIN_CORRECT)
      expect(recovered.userId, 'post-unlock: PIN corretto → userId').toBe(dipRef.userId)
      const afterRecover = await readPinState(svc, dipRef.userId)
      expect(afterRecover?.pin_failed_count, 'counter resettato a 0 sul match').toBe(0)
      expect(afterRecover?.pin_locked_until, 'lock pulito sul match').toBeNull()
    } finally {
      if (dipRef) {
        try { await svc.auth.admin.deleteUser(dipRef.userId) } catch { /* noop */ }
      }
      await cleanupOrg(svc, titolare)
    }
  })

  test('cross-org: PIN di org A non autentica con slug di org B', async () => {
    const svc = serviceClient()
    let orgA = null
    let orgB = null
    let dipA = null
    try {
      orgA = await createEphemeralOrg(svc, 'pin-A')
      orgB = await createEphemeralOrg(svc, 'pin-B')
      dipA = await createDipendenteIn(svc, orgA.orgId, 'pin-dipA')

      const PIN = '9876'
      const { error: setErr } = await orgA.userClient.rpc('set_dipendente_pin', {
        p_user_id: dipA.userId, p_pin: PIN,
      })
      expect(setErr).toBeFalsy()

      const { data: rowB } = await svc.from('organizations').select('slug').eq('id', orgB.orgId).maybeSingle()
      expect(rowB?.slug).toBeTruthy()

      // Stesso PIN, ma slug di un'altra org: deve NON autenticare
      const wrongOrg = await verifyPin(svc, rowB.slug, PIN)
      expect(wrongOrg.userId, 'PIN dipA + slug orgB → null (isolamento tenant)').toBeNull()

      // Sanity: con lo slug di A invece funziona
      const { data: rowA } = await svc.from('organizations').select('slug').eq('id', orgA.orgId).maybeSingle()
      const rightOrg = await verifyPin(svc, rowA.slug, PIN)
      expect(rightOrg.userId).toBe(dipA.userId)
    } finally {
      if (dipA) { try { await svc.auth.admin.deleteUser(dipA.userId) } catch { /* noop */ } }
      await cleanupOrg(svc, orgA)
      await cleanupOrg(svc, orgB)
    }
  })

  test('validazione: PIN non numerico / lunghezza errata → null senza incrementare counter', async () => {
    const svc = serviceClient()
    let titolare = null
    let dipRef = null
    try {
      titolare = await createEphemeralOrg(svc, 'pin-val-tit')
      const { data: orgRow } = await svc.from('organizations').select('slug').eq('id', titolare.orgId).maybeSingle()
      const orgSlug = orgRow.slug
      dipRef = await createDipendenteIn(svc, titolare.orgId, 'pin-val-dip')
      await titolare.userClient.rpc('set_dipendente_pin', { p_user_id: dipRef.userId, p_pin: '1234' })

      // Format invalidi: la RPC fa early return, NON deve incrementare counter
      // (regex check è la PRIMA cosa che fa la function).
      const cases = ['abc', '12', '1234567', '12.4', '   ', '']
      for (const bad of cases) {
        const r = await verifyPin(svc, orgSlug, bad)
        expect(r.userId, `format invalido '${bad}' → null`).toBeNull()
      }
      const s = await readPinState(svc, dipRef.userId)
      expect(s?.pin_failed_count, 'format invalidi NON incrementano counter').toBe(0)
    } finally {
      if (dipRef) { try { await svc.auth.admin.deleteUser(dipRef.userId) } catch { /* noop */ } }
      await cleanupOrg(svc, titolare)
    }
  })
})
