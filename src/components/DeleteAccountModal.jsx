// Modal di cancellazione account self-service.
//
// Flusso a 4 step pensato per minimizzare cancellazioni-per-errore E
// recuperare il cliente quando ha un problema risolvibile:
//   1. Motivo                → scelta singola fra 6 categorie
//   2. Alternativa proposta  → contestuale al motivo (sconto, pausa, supporto…)
//                              l'utente puo' "fermarsi qui" e tornare indietro
//   3. Feedback libero        → opzionale, va al supporto come email
//   4. Conferma nome attivita' → typing esatto del nome (anti-tap-accidentale)
//
// La cancellazione e' SOFT: i dati restano. Admin puo' riabilitare l'org
// pulendo deleted_at. Il GDPR-hard-delete fisico resta separato (azione admin).

import React, { useState } from 'react'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import Icon from '../lib/icons'
import { supabase } from '../lib/supabase'
import useIsMobile from '../lib/useIsMobile'

const MOTIVI = [
  { id: 'troppo_costoso',    label: 'Costa troppo per quello che mi serve' },
  { id: 'manca_feature',     label: 'Manca una funzionalità che mi serve' },
  { id: 'non_lo_uso',        label: 'Non lo sto usando abbastanza' },
  { id: 'cambio_software',   label: 'Sto passando a un altro software' },
  { id: 'troppo_complicato', label: 'È troppo complicato' },
  { id: 'altro',             label: 'Altro motivo' },
]

const ALTERNATIVE = {
  troppo_costoso: {
    titolo: 'Possiamo trovare una soluzione sul prezzo',
    body: 'Prima di cancellare, scrivici: spesso troviamo uno sconto o un piano più adatto. Cancellare e ripartire da zero più avanti significa perdere lo storico.',
    cta: 'Parla con il supporto',
    mail: 'subject=Sconto%20o%20piano%20diverso&body=Ciao%2C%20vorrei%20capire%20se%20esiste%20un%20piano%20pi%C3%B9%20adatto%20al%20mio%20budget.',
  },
  manca_feature: {
    titolo: 'Dicci quale funzionalità ti manca',
    body: 'Aggiungiamo nuove funzioni ogni settimana basandoci sui feedback dei clienti. Dicci cosa ti manca: se è in roadmap te lo confermiamo subito.',
    cta: 'Scrivi al supporto',
    mail: 'subject=Funzionalit%C3%A0%20mancante&body=Mi%20serve%3A%20',
  },
  non_lo_uso: {
    titolo: 'Vuoi mettere in pausa invece di cancellare?',
    body: 'Possiamo congelare il tuo account: non paghi nulla, i dati restano intatti, e quando vuoi ripartire trovi tutto come prima. Scrivici e organizziamo la pausa.',
    cta: 'Chiedi una pausa',
    mail: 'subject=Pausa%20account&body=Vorrei%20mettere%20in%20pausa%20l%27account%20per%20qualche%20mese.',
  },
  cambio_software: {
    titolo: 'Esporta prima tutti i tuoi dati',
    body: 'Da Impostazioni → Esporta dati puoi scaricare ricettario, magazzino, chiusure e fatture in Excel/CSV. Fallo prima di cancellare: dopo non potrai più scaricare nulla.',
    cta: 'Vai a Esporta dati',
    mail: null,
  },
  troppo_complicato: {
    titolo: 'Una mezz\'ora con noi può cambiare tutto',
    body: 'Molti clienti hanno trovato l\'app pesante all\'inizio e poi non possono più farne a meno. Un onboarding 1-a-1 di 30 minuti via call risolve la maggior parte dei dubbi.',
    cta: 'Prenota una call',
    mail: 'subject=Onboarding%201-a-1&body=Vorrei%20prenotare%20una%20call%20di%20onboarding.',
  },
  altro: {
    titolo: 'Ci dispiace vederti andare via',
    body: 'Se c\'è qualcosa che possiamo fare, scrivici prima di cancellare. Bastano due righe — leggiamo tutto.',
    cta: 'Scrivi al supporto',
    mail: 'subject=Sto%20pensando%20di%20cancellare%20l%27account&body=',
  },
}

export default function DeleteAccountModal({ open, onClose, auth, notify }) {
  const isMobile = useIsMobile()
  const [step, setStep] = useState(1)
  const [motivo, setMotivo] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [confermaNome, setConfermaNome] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const nomeAttivita = auth?.org?.nome || auth?.organization?.nome || ''
  const supportEmail = (typeof window !== 'undefined' && window.__SUPPORT_EMAIL__) || 'supporto@foodios.it'

  function reset() {
    setStep(1); setMotivo(null); setFeedback(''); setConfermaNome(''); setSubmitting(false)
  }

  function chiudi() {
    if (submitting) return
    reset()
    onClose?.()
  }

  function vaiAlternativaMailto() {
    const alt = ALTERNATIVE[motivo]
    if (!alt?.mail) return
    window.location.href = `mailto:${supportEmail}?${alt.mail}`
  }

  function vaiEsportaDati() {
    chiudi()
    setTimeout(() => {
      // Naviga via hash al sottoframe Impostazioni → Dati → Esporta
      window.location.hash = '#impostazioni:dati:export-dati'
      window.dispatchEvent(new Event('hashchange'))
    }, 50)
  }

  async function confermaCancellazione() {
    if (submitting) return
    if (confermaNome.trim().toLowerCase() !== (nomeAttivita || '').trim().toLowerCase()) {
      notify?.('Il nome attività non corrisponde.', false)
      return
    }
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/account-self-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          motivo,
          feedback: feedback.trim(),
          conferma_nome: confermaNome.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notify?.(data.error || 'Cancellazione non riuscita.', false)
        setSubmitting(false)
        return
      }
      notify?.('Account cancellato. Ti contatteremo via email se vuoi recuperare i dati.')
      // Logout client-side: il server ha gia' invalidato le sessioni.
      try { await supabase.auth.signOut() } catch { /* silent */ }
      setTimeout(() => { window.location.href = '/' }, 800)
    } catch (e) {
      notify?.('Errore di rete. Riprova tra qualche secondo.', false)
      setSubmitting(false)
    }
  }

  if (!open) return null

  const alt = motivo ? ALTERNATIVE[motivo] : null
  const confermaOk = confermaNome.trim().toLowerCase() === (nomeAttivita || '').trim().toLowerCase()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cancellazione account"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000,
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 20, animation: 'fade-in 0.18s ease-out' }}
      onClick={chiudi}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#FFF', borderRadius: isMobile ? '16px 16px 0 0' : R.xl, width: '100%',
          maxWidth: 520, maxHeight: isMobile ? '95vh' : '90vh', overflowY: 'auto', boxShadow: S.lg,
          display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 22px 14px', borderBottom: `1px solid ${T.borderSoft}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.red || '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Zona pericolosa
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>
              Cancella account
            </h2>
            <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>
              Step {step} di 4
            </div>
          </div>
          <button onClick={chiudi} aria-label="Chiudi"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, color: T.textSoft, lineHeight: 0 }}>
            <Icon name="x" size={20}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', flex: 1 }}>
          {step === 1 && (
            <div>
              <p style={{ fontSize: 14, color: T.text, lineHeight: 1.55, margin: '0 0 18px' }}>
                Prima di salutarci, ci aiuti a capire perché? Ci serve per migliorare — e magari abbiamo una soluzione che non hai considerato.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {MOTIVI.map(m => (
                  <label key={m.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px', border: `1.5px solid ${motivo === m.id ? T.brand : T.border}`,
                      borderRadius: R.md, cursor: 'pointer', background: motivo === m.id ? '#FFF5F5' : '#FFF',
                      transition: 'all 0.15s' }}>
                    <input type="radio" name="motivo" value={m.id}
                      checked={motivo === m.id}
                      onChange={() => setMotivo(m.id)}
                      style={{ accentColor: T.brand, width: 16, height: 16 }}/>
                    <span style={{ fontSize: 14, color: T.text, fontWeight: motivo === m.id ? 600 : 500 }}>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && alt && (
            <div>
              <div style={{ padding: '16px 18px', borderRadius: R.md, background: '#F0F9FF',
                border: '1px solid #BAE6FD', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#075985', marginBottom: 8, letterSpacing: '-0.01em' }}>
                  {alt.titolo}
                </div>
                <div style={{ fontSize: 13.5, color: '#0C4A6E', lineHeight: 1.55 }}>
                  {alt.body}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
                <button onClick={alt.mail ? vaiAlternativaMailto : vaiEsportaDati}
                  style={{ flex: 1, padding: '11px 16px', borderRadius: R.md, border: 'none',
                    background: T.brand, color: '#FFF', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                  {alt.cta}
                </button>
                <button onClick={() => setStep(3)}
                  style={{ flex: 1, padding: '11px 16px', borderRadius: R.md, border: `1px solid ${T.border}`,
                    background: '#FFF', color: T.textSoft, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                  Continua a cancellare
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <p style={{ fontSize: 14, color: T.text, lineHeight: 1.55, margin: '0 0 12px' }}>
                Vuoi lasciarci due righe? Ci aiuta a capire dove migliorare. È opzionale.
              </p>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Cosa non ha funzionato?"
                maxLength={1000}
                rows={5}
                style={{ width: '100%', padding: '10px 12px', borderRadius: R.md,
                  border: `1px solid ${T.border}`, fontSize: isMobile ? 16 : 14, fontFamily: 'inherit', resize: 'vertical',
                  color: T.text, outline: 'none', boxSizing: 'border-box' }}/>
              <div style={{ fontSize: 11, color: T.textFaint, textAlign: 'right', marginTop: 4 }}>
                {feedback.length}/1000
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div style={{ padding: '14px 16px', borderRadius: R.md, background: '#FEF2F2',
                border: '1px solid #FCA5A5', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="alertCircle" size={16} color="#991B1B"/>
                  Stai per cancellare l'account
                </div>
                <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12.5, color: '#7F1D1D', lineHeight: 1.6 }}>
                  <li>Verrai disconnesso immediatamente</li>
                  <li>I tuoi collaboratori non potranno più accedere</li>
                  <li>I dati restano archiviati per 90 giorni: entro questo periodo possiamo riattivare l'account su tua richiesta</li>
                  <li>Dopo 90 giorni la cancellazione è definitiva</li>
                </ul>
              </div>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Per confermare, scrivi: <span style={{ color: T.text, textTransform: 'none', letterSpacing: 'normal' }}>{nomeAttivita || '—'}</span>
              </label>
              <input
                value={confermaNome}
                onChange={e => setConfermaNome(e.target.value)}
                placeholder={nomeAttivita}
                autoComplete="off"
                style={{ width: '100%', padding: '10px 12px', borderRadius: R.md,
                  border: `1.5px solid ${confermaOk ? '#86EFAC' : T.border}`,
                  fontSize: isMobile ? 16 : 14, fontFamily: 'inherit', color: T.text, outline: 'none', boxSizing: 'border-box',
                  background: confermaOk ? '#F0FDF4' : '#FFF' }}/>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px 18px', borderTop: `1px solid ${T.borderSoft}`,
          display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, justifyContent: 'space-between' }}>
          {step > 1 ? (
            <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={submitting}
              style={{ padding: '10px 16px', minHeight: isMobile ? 44 : 40, borderRadius: R.md, border: `1px solid ${T.border}`,
                background: '#FFF', color: T.textSoft, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
              ← Indietro
            </button>
          ) : (
            <button onClick={chiudi} disabled={submitting}
              style={{ padding: '10px 16px', minHeight: isMobile ? 44 : 40, borderRadius: R.md, border: `1px solid ${T.border}`,
                background: '#FFF', color: T.textSoft, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
              Annulla
            </button>
          )}

          {step === 1 && (
            <button onClick={() => setStep(2)} disabled={!motivo}
              style={{ padding: '10px 18px', borderRadius: R.md, border: 'none',
                background: motivo ? T.text : '#CBD5E1', color: '#FFF',
                fontSize: 13.5, fontWeight: 700, cursor: motivo ? 'pointer' : 'not-allowed' }}>
              Avanti →
            </button>
          )}
          {step === 3 && (
            <button onClick={() => setStep(4)}
              style={{ padding: '10px 18px', borderRadius: R.md, border: 'none',
                background: T.text, color: '#FFF', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              Avanti →
            </button>
          )}
          {step === 4 && (
            <button onClick={confermaCancellazione}
              disabled={!confermaOk || submitting}
              style={{ padding: '10px 18px', borderRadius: R.md, border: 'none',
                background: confermaOk && !submitting ? '#B91C1C' : '#FCA5A5', color: '#FFF',
                fontSize: 13.5, fontWeight: 700, cursor: confermaOk && !submitting ? 'pointer' : 'not-allowed' }}>
              {submitting ? 'Cancellazione…' : 'Cancella definitivamente'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
