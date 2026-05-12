import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─── CITTÀ ITALIANE (>30.000 abitanti) ────────────────────────────────────────
const CITTA_ITALIANE = [
  'Agrigento','Alessandria','Altamura','Ancona','Andria','Aprilia','Arezzo',
  'Asti','Bari','Barletta','Bergamo','Biella','Bologna','Bolzano','Brescia',
  'Brindisi','Busto Arsizio','Cagliari','Caltanissetta','Campobasso','Carrara',
  'Caserta','Catania','Catanzaro','Cesena','Como','Cosenza','Cremona','Crotone',
  'Enna','Ferrara','Firenze','Fiumicino','Foggia','Forlì','Genova','Gela',
  'Giugliano in Campania','Grosseto','Guidonia Montecelio','Imola','La Spezia',
  'L\'Aquila','Latina','Lecce','Lecco','Livorno','Lodi','Lucca','Mantova',
  'Marsala','Massa','Matera','Messina','Milano','Modena','Molfetta','Monza',
  'Napoli','Novara','Olbia','Padova','Palermo','Parma','Perugia','Pescara',
  'Piacenza','Pisa','Pistoia','Potenza','Prato','Quartu Sant\'Elena','Ragusa',
  'Ravenna','Reggio Calabria','Reggio Emilia','Rimini','Roma','Salerno','Sassari',
  'Savona','Sesto San Giovanni','Siracusa','Taranto','Teramo','Terni','Torre del Greco',
  'Torino','Trapani','Trento','Trieste','Udine','Varese','Venezia','Verbania',
  'Verona','Vibo Valentia','Vicenza','Vittoria',
].sort()

// ─── COSTANTI STILE ───────────────────────────────────────────────────────────
const S = {
  input: {
    width: '100%', padding: '11px 14px', border: '1px solid #E2E8F0',
    borderRadius: 10, fontSize: 14, background: '#F8FAFC', color: '#0F172A',
    outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box',
  },
  label: {
    display: 'block', fontSize: 12, fontWeight: 600, color: '#475569',
    marginBottom: 6, letterSpacing: '0.01em',
  },
  btn: (disabled) => ({
    width: '100%', padding: '13px', background: disabled ? '#CBD5E1' : '#C0392B',
    color: '#FFF', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', marginTop: 8,
    transition: 'background 0.15s', letterSpacing: '-0.01em',
  }),
  link: { color: '#C0392B', fontSize: 13, cursor: 'pointer', background: 'none',
    border: 'none', padding: 0, textDecoration: 'none' },
  card: {
    background: '#FFF', borderRadius: 20, boxShadow: '0 8px 40px rgba(15,23,42,0.10)',
    overflow: 'visible', border: '1px solid #E2E8F0',
  },
  error: {
    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, color: '#C0392B', marginBottom: 20,
  },
  success: {
    background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, color: '#166534', marginBottom: 20,
  },
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )
}

// ─── CITY AUTOCOMPLETE ────────────────────────────────────────────────────────
function CittaInput({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(value)
  const ref = useRef(null)

  const matches = q.length >= 1
    ? CITTA_ITALIANE.filter(c => c.toLowerCase().startsWith(q.toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        required
        autoComplete="off"
        value={q}
        placeholder="Es. Torino"
        style={S.input}
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', marginTop: 4, overflow: 'hidden',
        }}>
          {matches.map(c => (
            <div
              key={c}
              onMouseDown={e => { e.preventDefault(); setQ(c); onChange(c); setOpen(false) }}
              style={{
                padding: '10px 14px', fontSize: 13, cursor: 'pointer', color: '#0F172A',
                borderBottom: '1px solid #F1F5F9', transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PASSWORD STRENGTH ────────────────────────────────────────────────────────
function checkPwd(p) {
  return {
    length:  p.length >= 8,
    upper:   /[A-Z]/.test(p),
    lower:   /[a-z]/.test(p),
    number:  /[0-9]/.test(p),
    special: /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(p),
  }
}

function PasswordStrength({ password }) {
  const c = checkPwd(password)
  const score = Object.values(c).filter(Boolean).length
  if (!password) return null

  const barColor = score <= 2 ? '#EF4444' : score <= 3 ? '#F97316' : score === 4 ? '#EAB308' : '#22C55E'
  const label    = score <= 2 ? 'Debole' : score <= 3 ? 'Discreta' : score === 4 ? 'Buona' : 'Ottima'

  const req = [
    [c.length,  '8+ caratteri'],
    [c.upper,   'Una maiuscola'],
    [c.lower,   'Una minuscola'],
    [c.number,  'Un numero'],
    [c.special, 'Un carattere speciale (!@#...)'],
  ]

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 4, background: '#E2E8F0', borderRadius: 9 }}>
          <div style={{
            width: `${(score / 5) * 100}%`, height: '100%',
            background: barColor, borderRadius: 9, transition: 'all 0.3s',
          }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: barColor, minWidth: 40 }}>{label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
        {req.map(([ok, txt]) => (
          <div key={txt} style={{ fontSize: 11, color: ok ? '#16A34A' : '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{ok ? '✓' : '○'}</span>{txt}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── RESET PASSWORD PAGE (usata da App.jsx quando arriva il link recovery) ────
export function ResetPasswordPage({ onDone }) {
  const [pwd, setPwd]         = useState('')
  const [conf, setConf]       = useState('')
  const [loading, setLoading] = useState(false)
  const [errore, setErrore]   = useState('')
  const [successo, setSuccesso] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrore('')
    if (!Object.values(checkPwd(pwd)).every(Boolean)) {
      setErrore('La password non soddisfa tutti i requisiti di sicurezza'); return
    }
    if (pwd !== conf) { setErrore('Le password non coincidono'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd })
      if (error) throw error
      setSuccesso(true)
      setTimeout(async () => { await supabase.auth.signOut(); onDone() }, 2000)
    } catch (err) {
      setErrore(err.message || 'Errore nell\'aggiornamento della password')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg,#F8FAFC 0%,#F1F5F9 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, background: 'linear-gradient(135deg,#C0392B,#E74C3C)',
            borderRadius: 14, display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 24, marginBottom: 12,
            boxShadow: '0 6px 20px rgba(192,57,43,0.25)',
          }}>🍰</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            Imposta nuova password
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94A3B8' }}>
            Scegli una password sicura per il tuo account
          </p>
        </div>
        <div style={S.card}>
          <div style={{ padding: '24px 28px 28px' }}>
            {errore && <div style={S.error}>⚠️ {errore}</div>}
            {successo ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
                <h3 style={{ color: '#0F172A', margin: '0 0 10px', fontWeight: 700 }}>Password aggiornata!</h3>
                <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                  Tra un momento verrai reindirizzato al login…
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p style={{ fontSize: 13, color: '#475569', marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
                  Scegli una nuova password sicura per il tuo account.
                </p>
                <Field label="Nuova password">
                  <input type="password" required value={pwd}
                    onChange={e => setPwd(e.target.value)}
                    style={S.input} placeholder="••••••••" autoComplete="new-password" />
                  <PasswordStrength password={pwd} />
                </Field>
                <Field label="Conferma password">
                  <input type="password" required value={conf}
                    onChange={e => setConf(e.target.value)}
                    style={{ ...S.input, borderColor: conf && pwd !== conf ? '#EF4444' : '#E2E8F0' }}
                    placeholder="••••••••" autoComplete="new-password" />
                  {conf && pwd !== conf && (
                    <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>Le password non coincidono</div>
                  )}
                </Field>
                <button type="submit" disabled={loading} style={S.btn(loading)}>
                  {loading ? 'Aggiornamento…' : 'Salva nuova password →'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── COMPONENTE PRINCIPALE ────────────────────────────────────────────────────
const TIPI_ATTIVITA = ['Pasticceria','Bar / Caffè','Gelateria','Ristorante','Pizzeria','Panetteria','Altro']

export default function AuthPage({ onSignIn, onSignUp }) {
  // 'login' | 'registrati' | 'reset-request' | 'reset-password'
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState('')
  const [msg, setMsg] = useState('')

  // LOGIN
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPwd, setLoginPwd]     = useState('')

  // RESET REQUEST
  const [resetEmail, setResetEmail] = useState('')

  // RESET NEW PASSWORD
  const [newPwd, setNewPwd]         = useState('')
  const [newPwdConf, setNewPwdConf] = useState('')

  // REGISTRAZIONE
  const [reg, setReg] = useState({
    nome: '', cognome: '', nome_attivita: '',
    tipo_attivita: 'Pasticceria', citta: '',
    email: '', password: '', codice_invito: '',
  })
  const [successo, setSuccesso] = useState(false)

  // Intercetta PASSWORD_RECOVERY (link dal link di reset)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset-password')
        setErrore('')
        setMsg('')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  function setR(field) { return e => setReg(p => ({ ...p, [field]: e.target.value })) }
  function clear() { setErrore(''); setMsg('') }

  // ── HANDLERS ────────────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault(); clear(); setLoading(true)
    try { await onSignIn(loginEmail, loginPwd) }
    catch (err) { setErrore(err.message) }
    finally { setLoading(false) }
  }

  async function handleResetRequest(e) {
    e.preventDefault(); clear(); setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: 'https://foodios-rose.vercel.app',
      })
      if (error) throw error
      setMsg(`Link di reset inviato a ${resetEmail}. Controlla la posta.`)
    } catch (err) {
      setErrore(err.message || 'Errore nell\'invio del link')
    } finally { setLoading(false) }
  }

  async function handleNewPassword(e) {
    e.preventDefault(); clear()
    const c = checkPwd(newPwd)
    if (!Object.values(c).every(Boolean)) {
      setErrore('La password non soddisfa tutti i requisiti di sicurezza'); return
    }
    if (newPwd !== newPwdConf) { setErrore('Le password non coincidono'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd })
      if (error) throw error
      setMsg('Password aggiornata! Puoi ora effettuare il login.')
      setMode('login')
    } catch (err) {
      setErrore(err.message || 'Errore nell\'aggiornamento della password')
    } finally { setLoading(false) }
  }

  async function handleRegistrazione(e) {
    e.preventDefault(); clear()
    const c = checkPwd(reg.password)
    if (!Object.values(c).every(Boolean)) {
      setErrore('La password non soddisfa tutti i requisiti di sicurezza'); return
    }
    setLoading(true)
    try {
      await onSignUp(reg.email, reg.password, {
        nome_completo: `${reg.nome.trim()} ${reg.cognome.trim()}`.trim(),
        nome_attivita: reg.nome_attivita,
        tipo_attivita: reg.tipo_attivita.toLowerCase().replace(' / ', '_').replace('/', '_'),
        citta: reg.citta,
        ...(reg.codice_invito.trim() && { codice_invito: reg.codice_invito.trim() }),
      })
      setSuccesso(true)
    } catch (err) {
      setErrore(err.message)
    } finally { setLoading(false) }
  }

  // ── RENDER ───────────────────────────────────────────────────────────────────
  const isReset = mode === 'reset-request' || mode === 'reset-password'

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg,#F8FAFC 0%,#F1F5F9 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: isReset ? 400 : mode === 'registrati' ? 480 : 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, background: 'linear-gradient(135deg,#C0392B,#E74C3C)',
            borderRadius: 14, display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 24, marginBottom: 12,
            boxShadow: '0 6px 20px rgba(192,57,43,0.25)',
          }}>🍰</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            FoodOS
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94A3B8' }}>
            Gestionale food cost per la ristorazione italiana
          </p>
        </div>

        {/* Card */}
        <div style={S.card}>

          {/* Tab bar — solo per login/registrati */}
          {!isReset && (
            <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0' }}>
              {[['login','Accedi'],['registrati','Registrati']].map(([id, lbl]) => (
                <button key={id} onClick={() => { setMode(id); clear(); setSuccesso(false) }} style={{
                  flex: 1, padding: '13px 0', border: 'none',
                  background: mode === id ? '#FFF' : '#F8FAFC',
                  color: mode === id ? '#C0392B' : '#94A3B8',
                  fontWeight: mode === id ? 700 : 500, fontSize: 14, cursor: 'pointer',
                  borderBottom: mode === id ? '2px solid #C0392B' : '2px solid transparent',
                  marginBottom: -1, transition: 'all 0.15s', fontFamily: 'inherit',
                }}>{lbl}</button>
              ))}
            </div>
          )}

          <div style={{ padding: '24px 28px 28px' }}>

            {/* Messaggi globali */}
            {errore && <div style={S.error}>⚠️ {errore}</div>}
            {msg    && <div style={S.success}>✓ {msg}</div>}

            {/* ══════════════════════════════════════════════════════
                LOGIN
            ══════════════════════════════════════════════════════ */}
            {mode === 'login' && (
              <form onSubmit={handleLogin}>
                <Field label="Email">
                  <input type="email" required value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    style={S.input} placeholder="tua@email.com" autoComplete="email" />
                </Field>
                <Field label="Password" style={{ marginBottom: 6 }}>
                  <input type="password" required value={loginPwd}
                    onChange={e => setLoginPwd(e.target.value)}
                    style={S.input} placeholder="••••••••" autoComplete="current-password" />
                </Field>
                <div style={{ textAlign: 'right', marginBottom: 20 }}>
                  <button type="button" style={S.link}
                    onClick={() => { setMode('reset-request'); clear() }}>
                    Password dimenticata?
                  </button>
                </div>
                <button type="submit" disabled={loading} style={S.btn(loading)}>
                  {loading ? 'Accesso in corso…' : 'Accedi →'}
                </button>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════
                RESET — richiesta link
            ══════════════════════════════════════════════════════ */}
            {mode === 'reset-request' && (
              <form onSubmit={handleResetRequest}>
                <p style={{ fontSize: 13, color: '#475569', marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
                  Inserisci la tua email: ti mandiamo un link per reimpostare la password.
                </p>
                <Field label="Email">
                  <input type="email" required value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    style={S.input} placeholder="tua@email.com" autoComplete="email" />
                </Field>
                <button type="submit" disabled={loading} style={S.btn(loading)}>
                  {loading ? 'Invio in corso…' : 'Invia link di reset →'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button type="button" style={{ ...S.link, fontSize: 12, color: '#94A3B8' }}
                    onClick={() => { setMode('login'); clear() }}>
                    ← Torna al login
                  </button>
                </div>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════
                RESET — nuova password
            ══════════════════════════════════════════════════════ */}
            {mode === 'reset-password' && (
              <form onSubmit={handleNewPassword}>
                <p style={{ fontSize: 13, color: '#475569', marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
                  Scegli una nuova password sicura per il tuo account.
                </p>
                <Field label="Nuova password">
                  <input type="password" required value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    style={S.input} placeholder="••••••••" autoComplete="new-password" />
                  <PasswordStrength password={newPwd} />
                </Field>
                <Field label="Conferma password">
                  <input type="password" required value={newPwdConf}
                    onChange={e => setNewPwdConf(e.target.value)}
                    style={{
                      ...S.input,
                      borderColor: newPwdConf && newPwd !== newPwdConf ? '#EF4444' : '#E2E8F0',
                    }}
                    placeholder="••••••••" autoComplete="new-password" />
                  {newPwdConf && newPwd !== newPwdConf && (
                    <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>Le password non coincidono</div>
                  )}
                </Field>
                <button type="submit" disabled={loading} style={S.btn(loading)}>
                  {loading ? 'Aggiornamento…' : 'Salva nuova password →'}
                </button>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════
                REGISTRAZIONE
            ══════════════════════════════════════════════════════ */}
            {mode === 'registrati' && (
              successo ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
                  <h3 style={{ color: '#0F172A', margin: '0 0 10px', fontWeight: 700 }}>Registrazione completata!</h3>
                  <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                    Controlla la tua email <strong>{reg.email}</strong> e clicca il link per attivare l'account.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleRegistrazione}>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Nome">
                      <input type="text" required value={reg.nome} onChange={setR('nome')}
                        style={S.input} placeholder="Mario" />
                    </Field>
                    <Field label="Cognome">
                      <input type="text" required value={reg.cognome} onChange={setR('cognome')}
                        style={S.input} placeholder="Rossi" />
                    </Field>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Nome attività">
                      <input type="text" required value={reg.nome_attivita} onChange={setR('nome_attivita')}
                        style={S.input} placeholder="Pasticceria Rossi" />
                    </Field>
                    <Field label="Tipo attività">
                      <select required value={reg.tipo_attivita} onChange={setR('tipo_attivita')}
                        style={{ ...S.input, cursor: 'pointer' }}>
                        {TIPI_ATTIVITA.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                  </div>

                  <Field label="Città">
                    <CittaInput value={reg.citta} onChange={v => setReg(p => ({ ...p, citta: v }))} />
                  </Field>

                  <Field label="Email">
                    <input type="email" required value={reg.email} onChange={setR('email')}
                      style={S.input} placeholder="tua@email.com" autoComplete="email" />
                  </Field>

                  <Field label="Password" style={{ marginBottom: 8 }}>
                    <input type="password" required value={reg.password} onChange={setR('password')}
                      style={S.input} placeholder="••••••••" autoComplete="new-password" />
                    <PasswordStrength password={reg.password} />
                  </Field>

                  <Field label="Codice invito (opzionale)" style={{ marginTop: 8 }}>
                    <input type="text" value={reg.codice_invito} onChange={setR('codice_invito')}
                      style={S.input} placeholder="Lascia vuoto se non ce l'hai" />
                  </Field>

                  <button type="submit"
                    disabled={loading || !Object.values(checkPwd(reg.password)).every(Boolean)}
                    style={S.btn(loading || !Object.values(checkPwd(reg.password)).every(Boolean))}>
                    {loading ? 'Registrazione in corso…' : 'Crea account →'}
                  </button>

                  <p style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
                    Registrandoti accetti i nostri Termini di Servizio.
                    I tuoi dati non vengono condivisi con terzi.
                  </p>
                </form>
              )
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 20 }}>
          Problemi? Scrivici a{' '}
          <a href="mailto:support@foodios.it" style={{ color: '#C0392B' }}>support@foodios.it</a>
        </p>
      </div>
    </div>
  )
}
