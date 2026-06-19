// Helpers per mockare il client Supabase usato in `api/lib/auth.js`.
//
// verificaToken() fa `await import('@supabase/supabase-js').createClient(...)`,
// quindi `mkSupabase()` ritorna l'oggetto che createClient deve restituire.
// verificaAdmin() invece riceve `supabase` come parametro: si passa
// direttamente `mkSupabase({...})`.
//
// Le query DB ('profiles', 'organizations', 'audit_log') seguono il pattern
// fluent `from(t).select(c).eq(col,val).maybeSingle()` → emuliamo solo i
// metodi davvero usati da auth.js.
//
// NB: `vi` è globale (vitest config: `globals: true`), quindi non lo importiamo.

/* global vi */

// Mini fluent builder: `.select().eq().maybeSingle()` → ritorna { data, error }
function mockChain(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(result),
    insert: () => Promise.resolve(result),
  }
  return chain
}

/**
 * Factory di un client Supabase mock per i test di auth.js.
 * Accetta override per ciascuna risposta:
 *  - user           → utente ritornato da auth.getUser
 *  - profile        → riga da `from('profiles').maybeSingle()`
 *  - org            → riga da `from('organizations').maybeSingle()`
 *  - factors        → array MFA factors per `auth.admin.mfa.listFactors`
 *  - authError      → errore di auth.getUser (se !=null, user diventa null)
 *  - profileError   → errore per profiles
 *  - orgError       → errore per organizations
 *  - listFactorsThrow → se true, listFactors lancia (test mfa_check_transient)
 *  - listFactorsError → errore strutturato da listFactors (data.error popolato)
 *  - auditInsert    → spy opzionale per intercettare audit_log.insert
 */
export function mkSupabase(opts = {}) {
  const {
    user = { id: 'user-id', email: 'u@test.it' },
    profile = {
      organization_id: 'org-id',
      approvato: true,
      ruolo: 'titolare',
      email: 'u@test.it',
    },
    org = {
      attivo: true,
      approvato: true,
      trial_ends_at: '2030-01-01T00:00:00.000Z',
    },
    factors = [],
    authError = null,
    profileError = null,
    orgError = null,
    listFactorsThrow = false,
    listFactorsError = null,
    auditInsert = null,
  } = opts

  const getUser = vi.fn(async () => ({
    data: { user: authError ? null : user },
    error: authError,
  }))

  const listFactors = vi.fn(async () => {
    if (listFactorsThrow) throw new Error('listFactors boom')
    if (listFactorsError) {
      return { data: { factors: [] }, error: listFactorsError }
    }
    return { data: { factors }, error: null }
  })

  const fromSpy = vi.fn((table) => {
    if (table === 'profiles') {
      return mockChain({ data: profile, error: profileError })
    }
    if (table === 'organizations') {
      return mockChain({ data: org, error: orgError })
    }
    if (table === 'audit_log') {
      return {
        insert: vi.fn(async (row) => {
          if (auditInsert) auditInsert(row)
          return { data: null, error: null }
        }),
      }
    }
    return mockChain({ data: null, error: null })
  })

  return {
    auth: {
      getUser,
      admin: { mfa: { listFactors } },
    },
    from: fromSpy,
    _spies: { getUser, listFactors, from: fromSpy },
  }
}

/**
 * Helper per costruire un Request-like con headers tipo Fetch API.
 */
export function mkReq(headers = {}) {
  // normalizza chiavi a lowercase per emulare Fetch Headers (case-insensitive)
  const lower = {}
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v
  return {
    headers: {
      get: (name) => lower[String(name).toLowerCase()] ?? null,
    },
  }
}

/**
 * Genera un token JWT-like (header.payload.signature) con payload arbitrario.
 * Usato per testare il branch aal=aal2 in verificaAdmin (decodeJwtClaim).
 * NB: la firma non viene mai verificata (è il mock di getUser a decidere).
 */
export function mkJwt(payloadObj = {}) {
  const b64url = (s) =>
    Buffer.from(s)
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify(payloadObj))
  // signature fake — non viene mai validata localmente
  const sig = b64url('signature-placeholder-x'.repeat(2))
  return `${header}.${payload}.${sig}`
}
