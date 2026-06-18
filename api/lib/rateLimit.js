/**
 * Rate limiter con Supabase come backing store.
 * Default fail-open (lascia passare se DB down): adatto per endpoint pubblici.
 * Per azioni distruttive/admin passare opts.failClosed = true: in caso di errore
 * Supabase la richiesta viene rifiutata (audit 2026-06-17 HIGH: bypass via DB
 * saturation altrimenti possibile).
 */
export async function checkRateLimit(supabase, key, maxCount, windowSec, blockSec = 900, opts = {}) {
  const failClosed = !!opts.failClosed
  const now = new Date()
  try {
    const { data } = await supabase
      .from('rate_limits')
      .select('count, window_start, blocked_until')
      .eq('key', key)
      .maybeSingle()

    if (data?.blocked_until && new Date(data.blocked_until) > now) {
      const retryAfter = Math.ceil((new Date(data.blocked_until) - now) / 1000)
      return { allowed: false, retryAfter }
    }

    const windowStart = data?.window_start ? new Date(data.window_start) : null
    const windowExpired = !windowStart || (now - windowStart) > windowSec * 1000

    if (windowExpired) {
      await supabase.from('rate_limits').upsert(
        { key, count: 1, window_start: now.toISOString(), blocked_until: null },
        { onConflict: 'key' }
      )
      return { allowed: true }
    }

    // Atomico via RPC (audit 2026-06-17 HIGH: il read+upsert non atomico
    // permetteva di superare maxCount con N richieste concorrenti).
    // Fallback al pattern non atomico se la RPC non esiste (schema legacy o test).
    let newCount = null
    if (typeof supabase.rpc === 'function') {
      try {
        const { data: incRes, error: incErr } = await supabase.rpc('rate_limit_increment', { p_key: key })
        if (!incErr && Number.isFinite(Number(incRes))) newCount = Number(incRes)
      } catch { /* legacy schema */ }
    }
    if (newCount == null) newCount = (data?.count || 0) + 1

    if (newCount > maxCount) {
      const blockedUntil = new Date(now.getTime() + blockSec * 1000)
      await supabase.from('rate_limits').upsert(
        { key, count: newCount, window_start: data?.window_start || now.toISOString(), blocked_until: blockedUntil.toISOString() },
        { onConflict: 'key' }
      )
      return { allowed: false, retryAfter: blockSec }
    }

    await supabase.from('rate_limits').upsert(
      { key, count: newCount, window_start: data?.window_start || now.toISOString(), blocked_until: null },
      { onConflict: 'key' }
    )
    return { allowed: true }
  } catch (e) {
    if (failClosed) {
      console.error('[rateLimit] fail-closed on DB error:', e?.message)
      return { allowed: false, retryAfter: 60, reason: 'rate_limit_unavailable' }
    }
    return { allowed: true }
  }
}

export function rateLimitResponse(retryAfter = 60) {
  return new Response(
    JSON.stringify({ error: 'Troppe richieste. Riprova più tardi.', retryAfter }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    }
  )
}
