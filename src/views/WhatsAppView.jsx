// WhatsApp Bot setup (C2) - SCAFFOLDING
//
// L'utente registra il proprio numero di telefono. Il sistema genera un
// "magic word" da inviare al numero Twilio Foodos per attivare il link.
//
// MVP: lista linkati + bottone per aggiungerne uno.

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'
import { useConfirm } from '../components/ConfirmModal'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'
const GREEN = T.green || '#16A34A'

// Numero WhatsApp ufficiale Foodos - placeholder finché non attivi Twilio Business
const WA_NUMBER = '+39 351 234 5678'

export default function WhatsAppView({ orgId, user }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const confirmDialog = useConfirm()
  const [links, setLinks] = useState([])
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    async function load() {
      const { data } = await supabase
        .from('whatsapp_links').select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
      if (alive) setLinks(data || [])
    }
    load()
    return () => { alive = false }
  }, [orgId])

  async function aggiungi() {
    const clean = phone.trim().replace(/\s+/g, '')
    if (!/^\+\d{8,15}$/.test(clean)) {
      setError('Inserisci numero in formato internazionale: +39...')
      return
    }
    setSaving(true); setError(null)
    try {
      const { data, error: err } = await supabase
        .from('whatsapp_links').insert({
          organization_id: orgId, user_id: user?.id,
          phone_number: clean, attivo: false,  // sarà attivo dopo verifica via msg
        }).select().single()
      if (err) {
        if (err.code === '23505') throw new Error('Questo numero è già collegato a un account')
        throw err
      }
      setLinks(prev => [data, ...prev])
      setPhone('')
    } catch (e) {
      setError(e.message)
    } finally { setSaving(false) }
  }

  async function rimuovi(id) {
    const ok = await confirmDialog({
      title: 'Scollegare numero?',
      message: 'Il numero non riceverà più report o alert da Foodos via WhatsApp.',
      confirmLabel: 'Scollega', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    await supabase.from('whatsapp_links').delete().eq('id', id)
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: isMobile ? 12 : isTablet ? 16 : 0 }}>
      <AiPageHero
        eyebrow="WhatsApp"
        title="Foodos"
        accentText="in chat"
        subtitle="Scrivimi su WhatsApp come faresti a un dipendente: ti rispondo con i numeri del giorno, registro uno spreco al volo, ti mando gli alert importanti. In italiano normale."
        chainOnly
        statusBadge="BETA"
        stats={[
          { n: 'WhatsApp', l: 'Lo stesso che usi già' },
          { n: '0 app', l: 'In più da scaricare' },
        ]}
      />

      {/* Setup */}
      <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#166534', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="chat" size={14} color="#166534"/> Come attivare
        </div>
        <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13, color: MID, lineHeight: 1.7 }}>
          <li>Scrivi sotto il tuo numero WhatsApp (con il prefisso paese)</li>
          <li>Salva il contatto: <strong>Foodos</strong> · <code style={{ background: '#FFF', padding: '2px 6px', borderRadius: 4 }}>{WA_NUMBER}</code></li>
          <li>Mandagli un messaggio con scritto <strong>aiuto</strong>: ti elenco i comandi</li>
          <li>Da lì in poi rispondo in chat come un dipendente</li>
        </ol>
      </div>

      {/* Aggiungi numero */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 8 }}>
          Aggiungi un numero
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="+39 339 1234567"
            style={{ flex: 1, padding: '11px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: 'inherit' }}/>
          <button onClick={aggiungi} disabled={saving || !phone.trim()}
            style={{ background: BRAND, color: '#FFF', border: 'none', padding: '11px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            Collega
          </button>
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 12, color: '#991B1B' }}>{error}</div>}
      </div>

      {/* Lista linkati */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          Numeri collegati ({links.length})
        </div>
        {links.length === 0 ? (
          <div style={{ padding: 20, color: SOFT, fontSize: 13, textAlign: 'center' }}>
            Nessun numero collegato.
          </div>
        ) : links.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 6px', borderTop: `1px solid ${BORDER}` }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.attivo ? GREEN : '#D97706' }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TXT, fontFamily: 'ui-monospace, monospace' }}>{l.phone_number}</div>
              <div style={{ fontSize: 11, color: SOFT, marginTop: 2 }}>
                {l.attivo ? `Attivo${l.verificato_at ? ` · verificato il ${new Date(l.verificato_at).toLocaleDateString('it-IT')}` : ''}` : 'Da verificare: manda "aiuto" al numero Foodos'}
              </div>
            </div>
            <button onClick={() => rimuovi(l.id)} style={{ background: 'transparent', border: 'none', color: SOFT, cursor: 'pointer', padding: 4 }}>
              <Icon name="trash" size={14}/>
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: SOFT, textAlign: 'center', lineHeight: 1.5 }}>
        Funzioni complete in arrivo. Il costo per messaggio è compreso nel piano Insegna.
      </div>
    </div>
  )
}
