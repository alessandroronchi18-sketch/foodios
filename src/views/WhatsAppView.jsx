// Foodos su WhatsApp — la pagina dove il titolare lascia il suo numero.
//
// Stato reale al 14/09/2026: il collegamento NON è ancora acceso. Manca il
// numero WhatsApp Business (Twilio) intestato a Foodos. Finché non c'è, questa
// pagina non deve far finta di niente: fino a oggi mostrava un numero di
// cellulare inventato, scritto nel codice come "placeholder", e diceva al
// cliente di salvarlo in rubrica e di mandargli "aiuto". Quel numero, se
// esiste, è di un'altra persona.
//
// Adesso la pagina dice come stanno le cose e raccoglie il numero di chi vuole
// essere fra i primi. Quando il collegamento si accende, basta valorizzare
// VITE_WA_NUMERO e la pagina cambia da sola: le istruzioni compaiono.

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T, radius as R, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'
import { useConfirm } from '../components/ConfirmModal'
import { PLAN_LABEL } from '../lib/planAccess'

// Il numero vero, quando ci sarà. Vuoto = collegamento non ancora acceso.
const WA_NUMERO = (import.meta.env?.VITE_WA_NUMERO || '').trim()
const ACCESO = WA_NUMERO.length > 0

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
      setError('Scrivilo con il prefisso del paese, per esempio +39 339 1234567.')
      return
    }
    setSaving(true); setError(null)
    try {
      const { data, error: err } = await supabase
        .from('whatsapp_links').insert({
          organization_id: orgId, user_id: user?.id,
          phone_number: clean, attivo: false,
        }).select().single()
      if (err) {
        if (err.code === '23505') throw new Error('Questo numero è già collegato a un account.')
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
      title: 'Togliere questo numero?',
      message: 'Non riceverà più niente da Foodos su WhatsApp.',
      confirmLabel: 'Togli', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    await supabase.from('whatsapp_links').delete().eq('id', id)
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  const scheda = {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: R.xl, padding: isMobile ? 14 : 16, marginBottom: 16,
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: isMobile ? 12 : isTablet ? 16 : 0 }}>
      <AiPageHero
        eyebrow="WhatsApp"
        title="Foodos"
        accentText="in chat"
        subtitle={ACCESO
          ? 'Scrivimi su WhatsApp come faresti a un dipendente: ti rispondo con i numeri del giorno, registro uno spreco al volo, ti mando gli avvisi importanti. In italiano normale.'
          : 'L\'idea è questa: scrivere a Foodos come si scrive a un dipendente, e ricevere i numeri del giorno o registrare uno spreco senza aprire niente. Il collegamento non è ancora acceso — qui sotto lasci il tuo numero e sei fra i primi.'}
        chainOnly
        statusBadge={ACCESO ? 'BETA' : 'IN ARRIVO'}
        stats={ACCESO ? [
          { n: 'WhatsApp', l: 'Lo stesso che usi già' },
          { n: '0 app', l: 'In più da scaricare' },
        ] : [
          { n: 'WhatsApp', l: 'Lo stesso che usi già' },
          { n: '0 app', l: 'Da scaricare, mai' },
        ]}
      />

      {/* Come funziona: solo quando c'è davvero un numero a cui scrivere */}
      {ACCESO ? (
        <div style={{ ...scheda, background: T.greenLight, border: `1px solid ${T.green}33`, padding: 18 }}>
          <div style={{ ...typo.small, fontWeight: 800, color: T.green, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="chat" size={14} color={T.green} /> Come si accende
          </div>
          <ol style={{ margin: 0, paddingLeft: 22, ...typo.small, color: T.textMid, lineHeight: 1.7 }}>
            <li>Scrivi qui sotto il tuo numero, con il prefisso del paese</li>
            <li>Salva in rubrica <strong>Foodos</strong> · <code style={{ background: T.bgCard, padding: '2px 6px', borderRadius: R.xs }}>{WA_NUMERO}</code></li>
            <li>Mandagli un messaggio con scritto <strong>aiuto</strong>: ti elenco cosa so fare</li>
            <li>Da lì in poi rispondo in chat come farebbe un dipendente</li>
          </ol>
        </div>
      ) : (
        <div style={{ ...scheda, background: T.amberLight, border: `1px solid ${T.amber}33`, padding: 18 }}>
          <div style={{ ...typo.small, fontWeight: 800, color: T.amberDark, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={14} color={T.amberDark} /> A che punto siamo
          </div>
          <div style={{ ...typo.small, color: T.textMid, lineHeight: 1.7 }}>
            Ci manca il numero WhatsApp Business intestato a Foodos: è una pratica
            che si fa con l'operatore, non una riga di codice. Finché non c'è,
            non ti diamo un numero a cui scrivere — preferiamo dirtelo che
            farti provare a vuoto.
            <br /><br />
            Lascia qui il tuo: quando si accende ti scriviamo noi per primi, e
            tu non devi fare più niente.
          </div>
        </div>
      )}

      {/* Numero */}
      <div style={scheda}>
        <label htmlFor="wa-numero" style={{ ...typo.small, fontWeight: 700, color: T.text, marginBottom: 8, display: 'block' }}>
          {ACCESO ? 'Aggiungi un numero' : 'Il tuo numero WhatsApp'}
        </label>
        <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
          <input id="wa-numero" type="tel" value={phone}
            onChange={e => { setPhone(e.target.value); if (error) setError(null) }}
            onKeyDown={e => { if (e.key === 'Enter' && phone.trim() && !saving) aggiungi() }}
            placeholder="+39 339 1234567"
            style={{ flex: 1, minWidth: 0, padding: '11px 14px', minHeight: 44, borderRadius: R.md,
              border: `1px solid ${T.borderStr}`, fontSize: isMobile ? 16 : 14, fontFamily: 'inherit',
              color: T.text, boxSizing: 'border-box' }} />
          <button onClick={aggiungi} disabled={saving || !phone.trim()}
            style={{ background: phone.trim() && !saving ? T.brand : T.borderStr, color: T.white,
              border: 'none', padding: '11px 18px', minHeight: 44, borderRadius: R.md,
              ...typo.small, fontWeight: 700, cursor: saving ? 'wait' : phone.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', flexShrink: 0 }}>
            {saving ? 'Salvo…' : ACCESO ? 'Collega' : 'Avvisami'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 8, ...typo.small, color: T.red, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="alert" size={12} color={T.red} /> {error}
          </div>
        )}
      </div>

      {/* Numeri registrati */}
      <div style={{ ...scheda, marginBottom: 0 }}>
        <div style={{ ...typo.overline, color: T.textSoft, marginBottom: 10 }}>
          {ACCESO ? `Numeri collegati (${links.length})` : `In lista d'attesa (${links.length})`}
        </div>
        {links.length === 0 ? (
          <div style={{ padding: 20, color: T.textSoft, ...typo.small, textAlign: 'center' }}>
            Nessun numero, per ora.
          </div>
        ) : links.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 6px', borderTop: `1px solid ${T.border}` }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: l.attivo ? T.green : T.amber }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...typo.code, fontSize: 14, fontWeight: 700, color: T.text }}>{l.phone_number}</div>
              <div style={{ ...typo.small, color: T.textSoft, marginTop: 2 }}>
                {l.attivo
                  ? `Attivo${l.verificato_at ? ` · verificato il ${new Date(l.verificato_at).toLocaleDateString('it-IT')}` : ''}`
                  : ACCESO
                    ? 'Da confermare: manda "aiuto" al numero Foodos'
                    : 'In lista: ti scriviamo noi quando si accende'}
              </div>
            </div>
            <button onClick={() => rimuovi(l.id)} aria-label={`Togli il numero ${l.phone_number}`}
              style={{ background: 'transparent', border: 'none', color: T.textSoft, cursor: 'pointer', padding: 8, minHeight: 44, minWidth: 44,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, ...typo.small, color: T.textSoft, textAlign: 'center', lineHeight: 1.5 }}>
        {ACCESO
          ? `Il costo dei messaggi è compreso nel piano ${PLAN_LABEL.enterprise}.`
          : `Quando sarà acceso, il costo dei messaggi è compreso nel piano ${PLAN_LABEL.enterprise}.`}
      </div>
    </div>
  )
}
