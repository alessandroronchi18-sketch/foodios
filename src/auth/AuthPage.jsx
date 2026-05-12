import React, { useState } from 'react'

const TIPI_ATTIVITA = [
  'Pasticceria', 'Bar / Caffè', 'Gelateria', 'Ristorante', 'Pizzeria', 'Panetteria', 'Altro'
]

const INPUT_STYLE = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid #E8DDD8',
  borderRadius: 8,
  fontSize: 15,
  background: '#FFF',
  color: '#1C0A0A',
  outline: 'none',
  transition: 'border-color 0.2s',
}

const LABEL_STYLE = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#6B4C44',
  marginBottom: 6,
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  )
}

export default function AuthPage({ onSignIn, onSignUp }) {
  const [tab, setTab] = useState('accedi') // 'accedi' | 'registrati'
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState('')
  const [successo, setSuccesso] = useState(false)

  // Accedi
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPwd,   setLoginPwd]   = useState('')

  // Registrati
  const [reg, setReg] = useState({
    nome_completo: '',
    nome_attivita: '',
    tipo_attivita: 'Pasticceria',
    citta: '',
    email: '',
    password: '',
  })

  async function handleLogin(e) {
    e.preventDefault()
    setErrore('')
    setLoading(true)
    try {
      await onSignIn(loginEmail, loginPwd)
    } catch (err) {
      setErrore(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRegistrazione(e) {
    e.preventDefault()
    setErrore('')
    if (reg.password.length < 8) {
      setErrore('La password deve essere di almeno 8 caratteri')
      return
    }
    setLoading(true)
    try {
      await onSignUp(reg.email, reg.password, {
        nome_completo: reg.nome_completo,
        nome_attivita: reg.nome_attivita,
        tipo_attivita: reg.tipo_attivita.toLowerCase().replace(' / ', '_').replace('/', '_'),
        citta: reg.citta,
      })
      setSuccesso(true)
    } catch (err) {
      setErrore(err.message)
    } finally {
      setLoading(false)
    }
  }

  function setR(field) {
    return e => setReg(prev => ({ ...prev, [field]: e.target.value }))
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FDFAF7',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo / header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🍰</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#1C0A0A', letterSpacing: '-0.5px' }}>
            FoodOS
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#9C7B76' }}>
            Gestionale food cost per la ristorazione italiana
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#FFF',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(28,10,10,0.08)',
          overflow: 'hidden',
        }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E8DDD8' }}>
            {['accedi', 'registrati'].map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setErrore(''); setSuccesso(false) }}
                style={{
                  flex: 1,
                  padding: '14px 0',
                  border: 'none',
                  background: tab === t ? '#FFF' : '#FAF5F3',
                  color: tab === t ? '#C0392B' : '#9C7B76',
                  fontWeight: tab === t ? 700 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  borderBottom: tab === t ? '2px solid #C0392B' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'all 0.15s',
                }}
              >
                {t === 'accedi' ? 'Accedi' : 'Registrati'}
              </button>
            ))}
          </div>

          <div style={{ padding: '28px 28px 32px' }}>
            {/* Errore */}
            {errore && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                color: '#C0392B',
                marginBottom: 20,
              }}>
                ⚠️ {errore}
              </div>
            )}

            {/* ── ACCEDI ── */}
            {tab === 'accedi' && (
              <form onSubmit={handleLogin}>
                <Field label="Email">
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    style={INPUT_STYLE}
                    placeholder="tua@email.com"
                    autoComplete="email"
                  />
                </Field>
                <Field label="Password">
                  <input
                    type="password"
                    required
                    value={loginPwd}
                    onChange={e => setLoginPwd(e.target.value)}
                    style={INPUT_STYLE}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </Field>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: loading ? '#E8DDD8' : '#C0392B',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginTop: 8,
                    transition: 'background 0.15s',
                  }}
                >
                  {loading ? 'Accesso in corso…' : 'Accedi →'}
                </button>
              </form>
            )}

            {/* ── REGISTRATI ── */}
            {tab === 'registrati' && (
              successo ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                  <h3 style={{ color: '#1C0A0A', margin: '0 0 12px' }}>Registrazione ricevuta!</h3>
                  <p style={{ color: '#6B4C44', fontSize: 14, lineHeight: 1.7 }}>
                    Controlla la tua email <strong>{reg.email}</strong> per confermare l'account.
                    Ti contatteremo entro 24 ore per attivare il tuo profilo.
                  </p>
                  <div style={{
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginTop: 20,
                    fontSize: 12,
                    color: '#166534',
                  }}>
                    🎁 Hai <strong>3 mesi gratuiti</strong> — nessuna carta di credito richiesta
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRegistrazione}>
                  <div style={{
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: '#166534',
                    marginBottom: 20,
                    textAlign: 'center',
                  }}>
                    🎁 3 mesi gratuiti · Nessuna carta di credito
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Nome completo">
                      <input type="text" required value={reg.nome_completo} onChange={setR('nome_completo')} style={INPUT_STYLE} placeholder="Mario Rossi" />
                    </Field>
                    <Field label="Città">
                      <input type="text" required value={reg.citta} onChange={setR('citta')} style={INPUT_STYLE} placeholder="Torino" />
                    </Field>
                  </div>

                  <Field label="Nome attività">
                    <input type="text" required value={reg.nome_attivita} onChange={setR('nome_attivita')} style={INPUT_STYLE} placeholder="Bar Rossi" />
                  </Field>

                  <Field label="Tipo attività">
                    <select required value={reg.tipo_attivita} onChange={setR('tipo_attivita')} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                      {TIPI_ATTIVITA.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>

                  <Field label="Email">
                    <input type="email" required value={reg.email} onChange={setR('email')} style={INPUT_STYLE} placeholder="tua@email.com" autoComplete="email" />
                  </Field>

                  <Field label="Password (min. 8 caratteri)">
                    <input type="password" required minLength={8} value={reg.password} onChange={setR('password')} style={INPUT_STYLE} placeholder="••••••••" autoComplete="new-password" />
                  </Field>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: loading ? '#E8DDD8' : '#C0392B',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: 10,
                      fontSize: 15,
                      fontWeight: 800,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      marginTop: 8,
                      transition: 'background 0.15s',
                    }}
                  >
                    {loading ? 'Registrazione in corso…' : 'Inizia gratis →'}
                  </button>

                  <p style={{ fontSize: 11, color: '#9C7B76', textAlign: 'center', marginTop: 16 }}>
                    Registrandoti accetti i nostri Termini di Servizio.
                    I tuoi dati non vengono condivisi con terzi.
                  </p>
                </form>
              )
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#9C7B76', marginTop: 20 }}>
          Problemi? Scrivici a{' '}
          <a href="mailto:support@foodios.it" style={{ color: '#C0392B' }}>support@foodios.it</a>
        </p>
      </div>
    </div>
  )
}
