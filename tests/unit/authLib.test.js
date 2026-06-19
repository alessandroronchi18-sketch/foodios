// Test per `api/lib/auth.js` (verificaToken / verificaAdmin / logAzione).
//
// `auth.js` ha due peculiarità che dettano la struttura del file:
//  1) verificaToken fa `await import('@supabase/supabase-js')` e chiama
//     `createClient(...)` → mockiamo il modulo con vi.mock factory.
//  2) ADMIN_EMAIL è letto a module-load (top-level const), quindi per
//     testare i branch "admin configurato" / "admin assente" / "email
//     match" usiamo vi.resetModules() + dynamic import dentro ogni gruppo
//     (stesso pattern di safeError.test.js).
//
// verificaAdmin riceve invece supabase come parametro → niente module-level
// mocking necessario per quel client, ma serve un JWT con payload aal=aal2
// per i test "ok" (decodeJwtClaim legge il claim direttamente dal token).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkSupabase, mkReq, mkJwt } from '../helpers/supabaseAuthMock.js'

const ORIG_ENV = { ...process.env }

// Holder mutabile per il client che createClient(@supabase/supabase-js) ritorna
// nel singolo test. Lo settiamo PRIMA del dynamic import del modulo.
let currentClient = null

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => {
    // ricordiamo gli args ultimi per i pochi test che li ispezionano
    createClientSpy.calls.push(args)
    return currentClient
  },
}))

const createClientSpy = { calls: [] }

async function loadModule({ adminEmail = '' } = {}) {
  vi.resetModules()
  process.env = { ...ORIG_ENV, ADMIN_EMAIL: adminEmail }
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'service-key'
  // by default niente VERCEL_URL / VERCEL_ENV → isLocalDev = true
  delete process.env.VERCEL_URL
  delete process.env.VERCEL_ENV
  delete process.env.DISABLE_ADMIN_MFA
  delete process.env.ADMIN_MFA_WHITELIST
  return await import('../../api/lib/auth.js')
}

beforeEach(() => {
  createClientSpy.calls = []
  currentClient = null
})

afterEach(() => {
  process.env = { ...ORIG_ENV }
})

// ── verificaToken ───────────────────────────────────────────────────────────
describe('verificaToken', () => {
  let mod

  beforeEach(async () => {
    mod = await loadModule()
  })

  it('senza Authorization header → Token mancante', async () => {
    const res = await mod.verificaToken(mkReq({}))
    expect(res.user).toBeNull()
    expect(res.profile).toBeNull()
    expect(res.error).toBe('Token mancante')
  })

  it('header presente ma senza prefisso Bearer → Token mancante', async () => {
    const res = await mod.verificaToken(mkReq({ Authorization: 'Basic abc' }))
    expect(res.error).toBe('Token mancante')
  })

  it('Bearer ma token troppo corto → Token non valido', async () => {
    const res = await mod.verificaToken(mkReq({ Authorization: 'Bearer short' }))
    expect(res.error).toBe('Token non valido')
  })

  it('auth.getUser ritorna error → Token scaduto o non valido', async () => {
    currentClient = mkSupabase({ authError: { message: 'jwt expired' } })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.user).toBeNull()
    expect(res.error).toBe('Token scaduto o non valido')
  })

  it('auth.getUser ritorna user=null senza error → Token scaduto', async () => {
    // simuliamo data.user=null senza error (caso teorico)
    currentClient = mkSupabase()
    // override puntuale: getUser ritorna { data: { user: null }, error: null }
    currentClient.auth.getUser = vi.fn(async () => ({
      data: { user: null },
      error: null,
    }))
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toBe('Token scaduto o non valido')
  })

  it('profile assente → Account non configurato', async () => {
    currentClient = mkSupabase({ profile: null })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.user).toBeNull()
    expect(res.error).toBe('Account non configurato')
  })

  it('profile senza organization_id → Account non configurato', async () => {
    currentClient = mkSupabase({
      profile: { organization_id: null, approvato: true, ruolo: 'titolare' },
    })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toBe('Account non configurato')
  })

  it('organizations row mancante → Organizzazione non trovata (status 403)', async () => {
    currentClient = mkSupabase({ org: null })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toBe('Organizzazione non trovata')
    expect(res.status).toBe(403)
  })

  it('organizations errore → Organizzazione non trovata (status 403)', async () => {
    currentClient = mkSupabase({ orgError: { message: 'db down' } })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toBe('Organizzazione non trovata')
    expect(res.status).toBe(403)
  })

  it('organization attivo=false → Organizzazione disattivata (status 403)', async () => {
    currentClient = mkSupabase({
      org: { attivo: false, approvato: true, trial_ends_at: '2030-01-01' },
    })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toBe('Organizzazione disattivata')
    expect(res.status).toBe(403)
  })

  it('approvato=false + trial scaduto → Trial scaduto (status 402)', async () => {
    currentClient = mkSupabase({
      org: { attivo: true, approvato: false, trial_ends_at: '2020-01-01' },
    })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toContain('Trial scaduto')
    expect(res.status).toBe(402)
  })

  it('approvato=false + trial_ends_at NULL → Trial scaduto (no trial set)', async () => {
    currentClient = mkSupabase({
      org: { attivo: true, approvato: false, trial_ends_at: null },
    })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toContain('Trial scaduto')
    expect(res.status).toBe(402)
  })

  it('approvato=false ma trial ancora attivo → OK', async () => {
    currentClient = mkSupabase({
      org: {
        attivo: true,
        approvato: false,
        trial_ends_at: '2099-01-01T00:00:00.000Z',
      },
    })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toBeNull()
    expect(res.user).toMatchObject({ id: 'user-id' })
    expect(res.profile).toMatchObject({ organization_id: 'org-id' })
    expect(res.supabase).toBeDefined()
  })

  it('happy path: user + profile + org approvato → OK', async () => {
    currentClient = mkSupabase()
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toBeNull()
    expect(res.user.id).toBe('user-id')
    expect(res.profile.ruolo).toBe('titolare')
    expect(res.supabase).toBeDefined()
  })

  it('skipOrgCheck=true bypassa controllo organizations (org disattivata OK)', async () => {
    currentClient = mkSupabase({
      org: { attivo: false, approvato: false, trial_ends_at: null },
    })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
      { skipOrgCheck: true },
    )
    expect(res.error).toBeNull()
    expect(res.user.id).toBe('user-id')
  })

  it('ruolo=dipendente viene propagato in profile', async () => {
    currentClient = mkSupabase({
      profile: {
        organization_id: 'org-id',
        approvato: true,
        ruolo: 'dipendente',
      },
    })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toBeNull()
    expect(res.profile.ruolo).toBe('dipendente')
  })

  it('estrae correttamente il token dopo "Bearer "', async () => {
    currentClient = mkSupabase()
    const longTok = 'abcdef1234567890abcdef1234567890ZZZZZZ'
    await mod.verificaToken(mkReq({ Authorization: `Bearer ${longTok}` }))
    expect(currentClient.auth.getUser).toHaveBeenCalledWith(longTok)
  })

  it('exception nel try → wrappata in errore "Errore autenticazione: ..."', async () => {
    currentClient = mkSupabase()
    currentClient.auth.getUser = vi.fn(async () => {
      throw new Error('network kaboom')
    })
    const res = await mod.verificaToken(
      mkReq({ Authorization: 'Bearer ' + 'x'.repeat(40) }),
    )
    expect(res.error).toContain('Errore autenticazione')
    expect(res.error).toContain('network kaboom')
  })
})

// ── rallentaSeNecessario ───────────────────────────────────────────────────
describe('rallentaSeNecessario', () => {
  let mod
  beforeEach(async () => {
    mod = await loadModule()
  })

  it('attende fino a minMs se elapsed minore', async () => {
    const start = Date.now()
    await mod.rallentaSeNecessario(start, 60)
    const elapsed = Date.now() - start
    // tolleranza generosa per la CI (timer non sono precisi)
    expect(elapsed).toBeGreaterThanOrEqual(50)
  })

  it('non attende se elapsed gia` superiore a minMs', async () => {
    const start = Date.now() - 500
    const t0 = Date.now()
    await mod.rallentaSeNecessario(start, 100)
    expect(Date.now() - t0).toBeLessThan(50)
  })
})

// ── verificaAdmin ──────────────────────────────────────────────────────────
describe('verificaAdmin', () => {
  it('ADMIN_EMAIL non configurato → admin_email_not_configured', async () => {
    const mod = await loadModule({ adminEmail: '' })
    const supa = mkSupabase()
    const res = await mod.verificaAdmin(mkReq({}), supa)
    expect(res.user).toBeNull()
    expect(res.reason).toBe('admin_email_not_configured')
  })

  it('senza Authorization header → no_bearer', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const res = await mod.verificaAdmin(mkReq({}), mkSupabase())
    expect(res.reason).toBe('no_bearer')
  })

  it('header lowercase "authorization" funziona', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({ user: { id: 'u1', email: 'other@x.it' } })
    const res = await mod.verificaAdmin(
      mkReq({ authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    // arriva fino al check email → reason "not_admin:..."
    expect(res.reason).toMatch(/^not_admin:/)
  })

  it('Bearer prefix ma token vuoto → empty_token', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' }),
      mkSupabase(),
    )
    expect(res.reason).toBe('empty_token')
  })

  it('getUser error → getUser_error:<msg>', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({ authError: { message: 'jwt malformed' } })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal2' }) }),
      supa,
    )
    expect(res.reason).toBe('getUser_error:jwt malformed')
  })

  it('getUser ritorna user=null senza error → no_user', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase()
    supa.auth.getUser = vi.fn(async () => ({
      data: { user: null },
      error: null,
    }))
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal2' }) }),
      supa,
    )
    expect(res.reason).toBe('no_user')
  })

  it('email utente diversa da ADMIN_EMAIL → not_admin:<email>', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({ user: { id: 'u1', email: 'mario@x.it' } })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal2' }) }),
      supa,
    )
    expect(res.reason).toBe('not_admin:mario@x.it')
  })

  it('email match (case-insensitive) + aal2 → ok', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'Admin@FoodIOS.it' },
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal2' }) }),
      supa,
    )
    expect(res.user?.id).toBe('admin-id')
    expect(res.reason).toBe('ok')
  })

  it('aal!=aal2 + no factors verificati → mfa_not_enrolled', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
      factors: [],
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.user).toBeNull()
    expect(res.reason).toBe('mfa_not_enrolled')
  })

  it('aal!=aal2 + factor "verified" presente → mfa_required', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
      factors: [{ status: 'verified', id: 'f1', factor_type: 'totp' }],
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.reason).toBe('mfa_required')
  })

  it('aal!=aal2 + factor non verified → mfa_not_enrolled', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
      factors: [{ status: 'unverified', id: 'f1' }],
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.reason).toBe('mfa_not_enrolled')
  })

  it('listFactors throw → mfa_check_transient', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
      listFactorsThrow: true,
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.reason).toBe('mfa_check_transient')
  })

  it('listFactors restituisce error strutturato → mfa_check_transient', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
      listFactorsError: { message: 'transient' },
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.reason).toBe('mfa_check_transient')
  })

  it('DISABLE_ADMIN_MFA=true + isLocalDev → ok_mfa_disabled_dev_only', async () => {
    process.env.DISABLE_ADMIN_MFA = 'true'
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    // loadModule resetta DISABLE_ADMIN_MFA → ri-settiamo dopo il load
    process.env.DISABLE_ADMIN_MFA = 'true'
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.reason).toBe('ok_mfa_disabled_dev_only')
  })

  it('VERCEL_ENV=production → DISABLE_ADMIN_MFA ignorato (no bypass)', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    process.env.VERCEL_ENV = 'production'
    process.env.DISABLE_ADMIN_MFA = 'true'
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
      factors: [],
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.reason).toBe('mfa_not_enrolled')
  })

  it('VERCEL_URL set → isLocalDev=false → bypass disabilitato', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    process.env.VERCEL_URL = 'foodios-rose.vercel.app'
    process.env.DISABLE_ADMIN_MFA = 'true'
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
      factors: [{ status: 'verified', id: 'f1' }],
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.reason).toBe('mfa_required')
  })

  it('ADMIN_MFA_WHITELIST + dev locale → ok_mfa_whitelisted_dev_only', async () => {
    process.env.ADMIN_MFA_WHITELIST = 'admin@foodios.it,other@x.it'
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    process.env.ADMIN_MFA_WHITELIST = 'admin@foodios.it,other@x.it'
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.reason).toBe('ok_mfa_whitelisted_dev_only')
  })

  it('ADMIN_MFA_WHITELIST + email NON whitelisted → cade su MFA check', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    process.env.ADMIN_MFA_WHITELIST = 'someone-else@x.it'
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
      factors: [],
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal1' }) }),
      supa,
    )
    expect(res.reason).toBe('mfa_not_enrolled')
  })

  it('exception nel try (es. token JWT malformato → atob throw) → exception:<msg>', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
    })
    // forziamo un throw dentro auth.getUser per innescare il catch esterno
    supa.auth.getUser = vi.fn(async () => {
      throw new Error('boom auth')
    })
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer ' + mkJwt({ aal: 'aal2' }) }),
      supa,
    )
    expect(res.user).toBeNull()
    expect(res.reason).toBe('exception:boom auth')
  })

  it('JWT con payload non base64 valido → aal=null → cade su MFA check', async () => {
    const mod = await loadModule({ adminEmail: 'admin@foodios.it' })
    const supa = mkSupabase({
      user: { id: 'admin-id', email: 'admin@foodios.it' },
      factors: [],
    })
    // token con 3 parti ma payload spazzatura → JSON.parse failure → claim null
    const res = await mod.verificaAdmin(
      mkReq({ Authorization: 'Bearer aaaa.notb64!!!.cccc' }),
      supa,
    )
    expect(res.reason).toBe('mfa_not_enrolled')
  })
})

// ── logAzione ──────────────────────────────────────────────────────────────
describe('logAzione', () => {
  let mod
  beforeEach(async () => {
    mod = await loadModule()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('inserisce row su audit_log con i campi attesi', async () => {
    const captured = []
    const supa = mkSupabase({ auditInsert: (row) => captured.push(row) })
    await mod.logAzione(supa, 'user-1', 'org-1', 'create_order', {
      foo: 'bar',
    })
    expect(captured).toHaveLength(1)
    const row = captured[0]
    expect(row.table_name).toBe('actions')
    expect(row.operation).toBe('create_order')
    expect(row.row_id).toBe('org-1')
    expect(row.changed_by).toBe('user-1')
    expect(row.new_data.foo).toBe('bar')
    expect(row.new_data.timestamp).toBeDefined()
  })

  it('estrae client_ip + user_agent dalle headers del req', async () => {
    const captured = []
    const supa = mkSupabase({ auditInsert: (row) => captured.push(row) })
    const req = mkReq({
      'user-agent': 'Mozilla/5.0 test',
      'x-forwarded-for': '1.2.3.4, 10.0.0.1',
    })
    await mod.logAzione(supa, 'u', 'o', 'act', {}, req)
    expect(captured[0].user_agent).toBe('Mozilla/5.0 test')
    expect(captured[0].client_ip).toBe('1.2.3.4')
  })

  it('preferisce x-real-ip a x-forwarded-for', async () => {
    const captured = []
    const supa = mkSupabase({ auditInsert: (row) => captured.push(row) })
    const req = mkReq({
      'x-real-ip': '9.9.9.9',
      'x-forwarded-for': '1.1.1.1',
    })
    await mod.logAzione(supa, 'u', 'o', 'act', {}, req)
    expect(captured[0].client_ip).toBe('9.9.9.9')
  })

  it('user_agent troncato a 300 caratteri', async () => {
    const captured = []
    const supa = mkSupabase({ auditInsert: (row) => captured.push(row) })
    const long = 'A'.repeat(500)
    await mod.logAzione(supa, 'u', 'o', 'act', {}, mkReq({ 'user-agent': long }))
    expect(captured[0].user_agent.length).toBe(300)
  })

  it('req=null → row con client_ip/user_agent null', async () => {
    const captured = []
    const supa = mkSupabase({ auditInsert: (row) => captured.push(row) })
    await mod.logAzione(supa, 'u', 'o', 'act', { x: 1 }, null)
    expect(captured[0].client_ip).toBeNull()
    expect(captured[0].user_agent).toBeNull()
  })

  it('exception durante insert → swallow (best-effort, console.error)', async () => {
    const broken = {
      from: () => {
        throw new Error('rls denied')
      },
    }
    await expect(
      mod.logAzione(broken, 'u', 'o', 'act', {}, null),
    ).resolves.toBeUndefined()
    // console.error usato per log diagnostico
    // (spy montato in beforeEach)
    expect(console.error).toHaveBeenCalled()
  })

  it('dettagli opzionale (default {}) → row.new_data ha solo timestamp', async () => {
    const captured = []
    const supa = mkSupabase({ auditInsert: (row) => captured.push(row) })
    await mod.logAzione(supa, 'u', 'o', 'act')
    expect(Object.keys(captured[0].new_data)).toEqual(['timestamp'])
  })
})
