/**
 * Rate limiter con Supabase come backing store.
 * Fail-open: se Supabase non risponde, lascia passare la richiesta.
 */
export async function checkRateLimit(supabase, key, maxCount, windowSec, blockSec = 900) {
  const now = new Date()
  try {
    const { data } = await supabase
      .from('rate_limits')
      .select('count, window_start, blocked_until')
      .eq('key', key)
      .maybeSingle()

    // Controlla blocco attivo
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

    const newCount = (data?.count || 0) + 1

    if (newCount > maxCount) {
      const blockedUntil = new Date(now.getTime() + blockSec * 1000)
      await supabase.from('rate_limits').upsert(
        { key, count: newCount, window_start: data.window_start, blocked_until: blockedUntil.toISOString() },
        { onConflict: 'key' }
      )
      return { allowed: false, retryAfter: blockSec }
    }

    await supabase.from('rate_limits').upsert(
      { key, count: newCount, window_start: data.window_start, blocked_until: null },
      { onConflict: 'key' }
    )
    return { allowed: true }
  } catch {
    return { allowed: true } // fail open
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
