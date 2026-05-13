import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

export function useNotifiche(orgId) {
  const [notifiche, setNotifiche] = useState([])

  const load = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase
      .from('notifiche')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setNotifiche(data)
  }, [orgId])

  useEffect(() => {
    load()
    if (!orgId) return

    const channel = supabase
      .channel(`notifiche-${orgId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifiche',
        filter: `organization_id=eq.${orgId}`,
      }, () => load())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [orgId, load])

  const segnaLetta = useCallback(async (id) => {
    await supabase.from('notifiche').update({ letta: true }).eq('id', id)
    setNotifiche(prev => prev.map(n => n.id === id ? { ...n, letta: true } : n))
  }, [])

  const segnaTutte = useCallback(async () => {
    if (!orgId) return
    await supabase
      .from('notifiche')
      .update({ letta: true })
      .eq('organization_id', orgId)
      .eq('letta', false)
    setNotifiche(prev => prev.map(n => ({ ...n, letta: true })))
  }, [orgId])

  const nonLette = notifiche.filter(n => !n.letta).length

  return { notifiche, nonLette, segnaLetta, segnaTutte }
}
