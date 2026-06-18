// usageTracking — dedup analytics view open (no noise re-render).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) },
}))

import { trackViewOpen } from '../../src/lib/usageTracking'
import { supabase } from '../../src/lib/supabase'

describe('trackViewOpen', () => {
  beforeEach(() => {
    supabase.rpc.mockClear()
    vi.useRealTimers()
  })

  it('viewName null/undefined/non-string → no-op', async () => {
    await trackViewOpen(null)
    await trackViewOpen(undefined)
    await trackViewOpen(42)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('view valida → RPC track_view_open chiamata', async () => {
    await trackViewOpen('dashboard-' + Math.random())  // unique per evitare dedup
    expect(supabase.rpc).toHaveBeenCalledWith('track_view_open', expect.objectContaining({
      p_view_name: expect.any(String),
    }))
  })

  it('dedup: stessa view in rapida successione → 1 sola chiamata', async () => {
    const view = 'dedup-' + Math.random()
    await trackViewOpen(view)
    await trackViewOpen(view)
    await trackViewOpen(view)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('view diverse → entrambe trackate', async () => {
    await trackViewOpen('a-' + Math.random())
    await trackViewOpen('b-' + Math.random())
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('exception silente (best-effort)', async () => {
    supabase.rpc.mockImplementationOnce(async () => { throw new Error('rpc down') })
    await expect(trackViewOpen('fail-' + Math.random())).resolves.toBeUndefined()
  })
})
