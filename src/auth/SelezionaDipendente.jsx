// SelezionaDipendente — schermata post-login per account laboratorio.
//
// Flusso: l'account laboratorio (email condivisa + password condivisa) è già
// loggato via Supabase. Prima di far vedere la Dashboard, chiediamo alla
// persona che sta usando il tablet di identificarsi con il proprio codice
// personale a 4 cifre. Il codice viene validato dalla RPC
// dipendente_operativo_valida. Se ok, il dipendente e' selezionato in
// Context e la Dashboard si apre col suo nome.
//
// UX: tastierino XL 0-9 (mani sporche / laboratorio), 4 pallini di feedback,
// auto-submit al 4° carattere, messaggio "chiedi al titolare" se sbaglia.

import React, { useCallback, useEffect, useState } from 'react'
import { useDipendenteOperativo } from '../hooks/useDipendenteOperativo'

const BRAND = '#6E0E1A'
const CODICE_LEN = 4

export default function SelezionaDipendente({ nomeLaboratorio, nomeSede, onSignOut }) {
  const { seleziona } = useDipendenteOperativo()
  const [codice, setCodice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = useCallback(async (c) => {
    if (submitting || !c || c.length !== CODICE_LEN) return
    setSubmitting(true)
    setError(null)
    const res = await seleziona(c)
    if (!res.ok) {
      if (res.error === 'codice_formato_invalido') {
        setError('Il codice deve essere di 4 cifre.')
      } else if (res.error === 'codice_non_valido') {
        setError('Codice non valido. Chiedi al titolare di verificare il tuo codice.')
      } else if (res.error === 'not_authenticated' || res.error === 'no_org') {
        setError('Sessione scaduta. Ricarica la pagina.')
      } else {
        setError('Impossibile verificare il codice. Controlla la connessione.')
      }
      setCodice('')
      setSubmitting(false)
    }
    // Se ok, il Context viene aggiornato e App fa il re-render mostrando Dashboard.
  }, [seleziona, submitting])

  function pressDigit(d) {
    if (submitting) return
    setError(null)
    const next = (codice + String(d)).slice(0, CODICE_LEN)
    setCodice(next)
    if (next.length === CODICE_LEN) {
      // Piccolo delay per far vedere l'ultimo pallino pieno prima del submit
      setTimeout(() => submit(next), 150)
    }
  }
  function pressBack() {
    if (submitting) return
    setCodice(c => c.slice(0, -1))
    setError(null)
  }

  useEffect(() => {
    function onKey(e) {
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key)
      else if (e.key === 'Backspace') pressBack()
      else if (e.key === 'Enter' && codice.length === CODICE_LEN) submit(codice)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codice, submitting])

  const sottotitolo = [nomeLaboratorio, nomeSede].filter(Boolean).join(' · ')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0B0408 0%, #1C0A0A 100%)',
      color: '#FFF',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 800,
          letterSpacing: '-0.02em', color: '#FFF',
        }}>Chi sei?</h1>
        {sottotitolo ? (
          <p style={{ marginTop: 6, marginBottom: 4, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {sottotitolo}
          </p>
        ) : null}
        <p style={{ marginTop: 6, marginBottom: 28, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          Inserisci il tuo codice personale a 4 cifre
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, margin: '24px 0 24px' }}>
          {Array.from({ length: CODICE_LEN }).map((_, i) => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: '50%',
              background: i < codice.length ? '#FFE7C7' : 'rgba(255,255,255,0.18)',
              border: `1px solid ${i < codice.length ? '#FFE7C7' : 'rgba(255,255,255,0.18)'}`,
              transition: 'background 0.12s ease',
            }}/>
          ))}
        </div>

        {error && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'rgba(220,38,38,0.18)',
            border: '1px solid rgba(220,38,38,0.40)',
            borderRadius: 10,
            color: '#FECACA', fontSize: 13, fontWeight: 600,
          }}>{error}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[1,2,3,4,5,6,7,8,9].map(d => (
            <button key={d}
              aria-label={`Cifra ${d}`}
              onClick={() => pressDigit(d)}
              disabled={submitting}
              style={{
                aspectRatio: '1', minHeight: 64,
                fontSize: 30, fontWeight: 700,
                background: 'rgba(255,255,255,0.10)',
                color: '#FFF', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 14, cursor: submitting ? 'wait' : 'pointer',
                touchAction: 'manipulation',
              }}
            >{d}</button>
          ))}
          <button onClick={pressBack} disabled={submitting}
            aria-label="Cancella ultima cifra"
            style={{
              aspectRatio: '1', minHeight: 64,
              background: 'transparent', color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 14, cursor: 'pointer', fontSize: 22,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            ⌫
          </button>
          <button onClick={() => pressDigit(0)} disabled={submitting}
            aria-label="Cifra 0"
            style={{
              aspectRatio: '1', minHeight: 64,
              fontSize: 30, fontWeight: 700,
              background: 'rgba(255,255,255,0.10)',
              color: '#FFF', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 14, cursor: submitting ? 'wait' : 'pointer',
            }}>0</button>
          <button disabled aria-hidden
            style={{ aspectRatio: '1', minHeight: 64, background: 'transparent', border: 'none' }}/>
        </div>

        <div style={{ marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
          Non trovi il tuo codice? Chiedi al titolare, te lo comunica lui.
        </div>

        {onSignOut ? (
          <button onClick={onSignOut}
            style={{
              marginTop: 24, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.75)', fontSize: 12,
              cursor: 'pointer', fontWeight: 500,
              padding: '10px 18px', minHeight: 40,
              borderRadius: 10,
            }}>
            Esci dal laboratorio
          </button>
        ) : null}
      </div>
    </div>
  )
}
