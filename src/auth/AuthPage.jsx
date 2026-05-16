import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import FoodOSLogo from '../components/FoodOSLogo'

const T = {
  cream:      '#FBF8F4',
  creamDeep:  '#F4ECE3',
  paper:      '#FFFFFF',
  ink:        '#0F0907',
  inkSoft:    '#1A0F0D',
  textMid:    '#5C4842',
  textSoft:   '#9C887F',
  textOnDark: '#F4ECE3',
  red:        '#C0392B',
  redDeep:    '#8B2415',
  redSoft:    '#FDF2EE',
  green:      '#1F7A48',
  greenSoft:  '#E8F4ED',
  amber:      '#E6BD5A',
  border:     '#EBE3DC',
  danger:     '#DC2626',
  dangerSoft: '#FEF2F2',
}

const SERIF = "'Fraunces', 'Iowan Old Style', 'Apple Garamond', Georgia, serif"
const SANS  = "'Inter', system-ui, -apple-system, sans-serif"

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

const TIPI_ATTIVITA = ['Pasticceria','Bar / Caffè','Gelateria','Ristorante','Pizzeria','Panetteria','Altro']

function useIsMobile(bp = 920) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false)
  useEffect(() => {
    const onR = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [bp])
  return m
}

const Icon = ({ name, size = 18, color = 'currentColor', stroke = 1.7 }) => {
  const i = {
    arrowR:    <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 5 19 12 13 19" fill="none"/></>,
    arrowL:    <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="11 5 5 12 11 19" fill="none"/></>,
    check:     <polyline points="20 6 9 17 4 12" fill="none"/>,
    checkCirc: <><circle cx="12" cy="12" r="9.5" fill="none"/><polyline points="8 12 11 15 16 9" fill="none"/></>,
    mail:      <><rect x="3" y="5" width="18" height="14" rx="2" fill="none"/><polyline points="3 7 12 13 21 7" fill="none"/></>,
    lock:      <><rect x="5" y="11" width="14" height="10" rx="2" fill="none"/><path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none"/></>,
    eye:       <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none"/><circle cx="12" cy="12" r="3" fill="none"/></>,
    eyeOff:    <><path d="M17.94 17.94A10.06 10.06 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.06-5.94M9.9 4.24A10 10 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.16 3.19" fill="none"/><line x1="3" y1="3" x2="21" y2="21"/></>,
    user:      <><circle cx="12" cy="8" r="4" fill="none"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7" fill="none"/></>,
    bag:       <><path d="M5 7h14l-1 13H6L5 7z" fill="none"/><path d="M8 7a4 4 0 0 1 8 0" fill="none"/></>,
    map:       <><path d="M12 2c-4 0-7 3-7 7 0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" fill="none"/><circle cx="12" cy="9" r="2.5" fill="none"/></>,
    star:      <polygon points="12 2 14.5 8.5 21 9 16 13.5 17.5 20 12 16.5 6.5 20 8 13.5 3 9 9.5 8.5" />,
    x:         <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      {i[name]}
    </svg>
  )
}

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
  if (!password) return null
  const c = checkPwd(password)
  const score = Object.values(c).filter(Boolean).length
  const barColor =
    score <= 2 ? T.danger :
    score <= 3 ? '#F97316' :
    score === 4 ? T.amber : T.green
  const label =
    score <= 2 ? 'Debole' :
    score <= 3 ? 'Discreta' :
    score === 4 ? 'Buona' : 'Ottima'

  const req = [
    [c.length,  '8+ caratteri'],
    [c.upper,   'Maiuscola'],
    [c.lower,   'Minuscola'],
    [c.number,  'Numero'],
    [c.special, 'Speciale'],
  ]

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 4, background: T.creamDeep, borderRadius: 999 }}>
          <div style={{ width: `${(score / 5) * 100}%`, height: '100%', background: barColor, borderRadius: 999, transition: 'all 0.3s' }}/>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: barColor, minWidth: 50, textAlign: 'right' }}>{label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 10px' }}>
        {req.map(([ok, txt]) => (
          <div key={txt} style={{ fontSize: 11, color: ok ? T.green : T.textSoft, display: 'flex', alignItems: 'center', gap: 4, fontWeight: ok ? 600 : 500 }}>
            <span style={{ fontSize: 9 }}>{ok ? '●' : '○'}</span>{txt}
          </div>
        ))}
      </div>
    </div>
  )
}

function Input({ icon, type = 'text', value, onChange, placeholder, required, autoComplete, name, onFocus, onBlur }) {
  const [focused, setFocused] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const inputType = type === 'password' && showPwd ? 'text' : type

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: focused ? T.paper : T.cream,
      border: `1.5px solid ${focused ? T.ink : T.border}`,
      borderRadius: 12, padding: '0 14px', height: 48,
      transition: 'all 0.18s ease',
      boxShadow: focused ? `0 0 0 4px ${T.creamDeep}` : 'none',
    }}>
      {icon && <Icon name={icon} size={18} color={focused ? T.ink : T.textSoft}/>}
      <input
        name={name}
        type={inputType}
        required={required}
        value={value}
        autoComplete={autoComplete}
        onChange={onChange}
        onFocus={(e) => { setFocused(true); onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); onBlur?.(e) }}
        placeholder={placeholder}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 15, color: T.ink, fontFamily: SANS, fontWeight: 500,
          padding: 0, minWidth: 0,
        }}
      />
      {type === 'password' && (
        <button type="button" tabIndex={-1}
          onClick={() => setShowPwd(s => !s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T.textSoft, display: 'flex' }}
          aria-label={showPwd ? 'Nascondi password' : 'Mostra password'}>
          <Icon name={showPwd ? 'eyeOff' : 'eye'} size={16} color={T.textSoft}/>
        </button>
      )}
    </div>
  )
}

function Field({ label, hint, children, error }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, letterSpacing: '0.01em' }}>{label}</label>
          {hint && <span style={{ fontSize: 11, color: T.textSoft }}>{hint}</span>}
        </div>
      )}
      {children}
      {error && (
        <div style={{ fontSize: 12, color: T.danger, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="x" size={12} color={T.danger}/> {error}
        </div>
      )}
    </div>
  )
}

function PrimaryBtn({ children, disabled, type = 'submit', onClick, style }) {
  const [h, setH] = useState(false)
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: '100%', padding: '14px 20px',
        background: disabled ? T.creamDeep : h ? T.redDeep : T.red,
        color: disabled ? T.textSoft : '#FFF',
        border: 'none', borderRadius: 12,
        fontSize: 15, fontWeight: 700, fontFamily: SANS,
        letterSpacing: '-0.005em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: disabled ? 'none' : h ? '0 12px 30px rgba(192,57,43,0.28)' : '0 6px 18px rgba(192,57,43,0.20)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        ...style,
      }}
    >{children}</button>
  )
}

function CittaInput({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(value)
  const ref = useRef(null)

  useEffect(() => { setQ(value) }, [value])

  const matches = q && q.length >= 1
    ? CITTA_ITALIANE.filter(c => c.toLowerCase().startsWith(q.toLowerCase())).slice(0, 7)
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
      <Input icon="map" value={q} placeholder="Es. Torino" required autoComplete="off"
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}/>
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 999,
          background: T.paper, border: `1px solid ${T.border}`, borderRadius: 12,
          boxShadow: '0 14px 40px rgba(15,9,7,0.12)', overflow: 'hidden',
        }}>
          {matches.map(c => (
            <div key={c}
              onMouseDown={e => { e.preventDefault(); setQ(c); onChange(c); setOpen(false) }}
              style={{
                padding: '11px 16px', fontSize: 14, cursor: 'pointer',
                color: T.ink, fontWeight: 500, transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.cream}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ErrorAlert({ children }) {
  return (
    <div style={{
      background: T.dangerSoft, border: `1px solid ${T.danger}30`,
      borderRadius: 12, padding: '11px 14px', marginBottom: 18,
      display: 'flex', alignItems: 'flex-start', gap: 10,
      fontSize: 13, color: T.danger, lineHeight: 1.5,
    }}>
      <Icon name="x" size={16} color={T.danger}/>
      <span>{children}</span>
    </div>
  )
}

function SuccessAlert({ children }) {
  return (
    <div style={{
      background: T.greenSoft, border: `1px solid ${T.green}30`,
      borderRadius: 12, padding: '11px 14px', marginBottom: 18,
      display: 'flex', alignItems: 'flex-start', gap: 10,
      fontSize: 13, color: T.green, lineHeight: 1.5,
    }}>
      <Icon name="checkCirc" size={16} color={T.green}/>
      <span>{children}</span>
    </div>
  )
}

function BrandPanel({ mode, isMobile }) {
  const isReg = mode === 'registrati'

  if (isMobile) {
    return (
      <div style={{
        background: T.ink, color: T.cream,
        padding: '32px 28px 28px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div aria-hidden style={{
          position: 'absolute', top: -40, right: -40, width: 180, height: 180,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(192,57,43,0.22), transparent 70%)',
        }}/>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <FoodOSLogo size={36} style={{ borderRadius: 9, boxShadow: '0 6px 18px rgba(192,57,43,0.28)' }}/>
          <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: T.cream, letterSpacing: '-0.02em' }}>FoodOS</span>
        </div>
        <h1 style={{
          fontFamily: SERIF, fontSize: 22, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.02em',
          color: T.cream, margin: 0, position: 'relative',
        }}>
          {isReg
            ? <>Inizia <em style={{ fontStyle: 'italic', color: T.amber }}>3 mesi gratis</em>.</>
            : <>Bentornato. <em style={{ fontStyle: 'italic', color: T.amber }}>I tuoi numeri ti aspettano.</em></>
          }
        </h1>
      </div>
    )
  }

  return (
    <div style={{
      background: T.ink, color: T.cream,
      padding: '48px 48px', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', minHeight: '100vh',
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: '-10%', right: '-10%', width: 480, height: 480,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(192,57,43,0.20), transparent 65%)',
        pointerEvents: 'none',
      }}/>
      <div aria-hidden style={{
        position: 'absolute', bottom: '-15%', left: '-20%', width: 420, height: 420,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(230,189,90,0.10), transparent 65%)',
        pointerEvents: 'none',
      }}/>

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <FoodOSLogo size={42} style={{ borderRadius: 11, boxShadow: '0 8px 24px rgba(192,57,43,0.30)' }}/>
          <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: T.cream, letterSpacing: '-0.025em' }}>FoodOS</span>
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: 'rgba(244,236,227,0.07)', border: '1px solid rgba(244,236,227,0.1)',
          borderRadius: 999,
          fontSize: 11, fontWeight: 500, color: T.textOnDark,
          marginBottom: 24, letterSpacing: '0.01em',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: '0 0 0 4px rgba(31,122,72,0.18)' }}/>
          Per la ristorazione italiana
        </div>

        <h1 style={{
          fontFamily: SERIF, fontSize: 38, fontWeight: 500,
          lineHeight: 1.08, letterSpacing: '-0.03em',
          color: T.cream, margin: '0 0 18px',
        }}>
          {isReg ? (
            <>Inizia <em style={{ fontStyle: 'italic', color: T.amber }}>3 mesi gratis</em>.<br/>Decidi dopo.</>
          ) : (
            <>Bentornato.<br/><em style={{ fontStyle: 'italic', color: T.amber }}>I tuoi numeri</em><br/>ti aspettano.</>
          )}
        </h1>

        <p style={{ fontSize: 15, color: 'rgba(244,236,227,0.65)', lineHeight: 1.65, margin: 0, maxWidth: 380 }}>
          {isReg
            ? "Crea il tuo account in 30 secondi. Senza carta di credito, senza vincoli. Cancelli quando vuoi."
            : "Accedi per vedere food cost aggiornati, margini reali e i consigli dell'AI per la tua attività."}
        </p>
      </div>

      <div style={{ position: 'relative', margin: '48px 0' }}>
        <div style={{
          color: T.amber, fontFamily: SERIF, fontSize: 64, fontWeight: 600,
          lineHeight: 0.4, marginBottom: 18, opacity: 0.5,
        }}>"</div>
        <p style={{
          fontFamily: SERIF, fontSize: 22, fontWeight: 400, fontStyle: 'italic',
          color: T.cream, lineHeight: 1.45, letterSpacing: '-0.01em',
          margin: '0 0 20px', maxWidth: 420,
        }}>
          In due mesi ho capito che il babà mi costava il 18% in più di quanto pensassi.
          Ho corretto il prezzo e il margine è salito di 4 punti.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 999,
            background: `linear-gradient(135deg, ${T.red}, ${T.redDeep})`,
            color: '#FFF', fontFamily: SERIF, fontWeight: 600, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>ME</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.cream }}>Marco Esposito</div>
            <div style={{ fontSize: 12, color: 'rgba(244,236,227,0.55)' }}>Pasticceria del Corso · Napoli</div>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', gap: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            {[0,1,2,3,4].map(s => <Icon key={s} name="star" size={13} color={T.amber}/>)}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(244,236,227,0.6)' }}>
            <strong style={{ color: T.cream }}>4.9/5</strong> · 240+ locali
          </div>
        </div>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: T.cream, letterSpacing: '-0.02em', lineHeight: 1 }}>€ 2.400</div>
          <div style={{ fontSize: 11, color: 'rgba(244,236,227,0.6)', marginTop: 4 }}>risparmio annuo medio</div>
        </div>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: T.cream, letterSpacing: '-0.02em', lineHeight: 1 }}>3 min</div>
          <div style={{ fontSize: 11, color: 'rgba(244,236,227,0.6)', marginTop: 4 }}>chiusura giornaliera</div>
        </div>
      </div>
    </div>
  )
}

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
      minHeight: '100vh', background: T.cream,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: SANS,
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <FoodOSLogo size={56} style={{ borderRadius: 14, boxShadow: '0 8px 28px rgba(192,57,43,0.28)' }}/>
          </div>
          <h1 style={{
            margin: 0, fontFamily: SERIF, fontSize: 28, fontWeight: 600,
            color: T.ink, letterSpacing: '-0.025em',
          }}>
            Imposta nuova password
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: T.textMid }}>
            Scegli una password sicura per il tuo account.
          </p>
        </div>

        <div style={{
          background: T.paper, borderRadius: 20,
          boxShadow: '0 12px 40px rgba(15,9,7,0.08)',
          border: `1px solid ${T.border}`, padding: '28px 32px',
        }}>
          {errore && <ErrorAlert>{errore}</ErrorAlert>}
          {successo ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 60, height: 60, borderRadius: 999,
                background: T.greenSoft, color: T.green,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <Icon name="check" size={28} color={T.green} stroke={2.5}/>
              </div>
              <h3 style={{ fontFamily: SERIF, color: T.ink, margin: '0 0 8px', fontWeight: 600, fontSize: 20 }}>
                Password aggiornata!
              </h3>
              <p style={{ color: T.textMid, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                Tra un momento verrai reindirizzato al login.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <Field label="Nuova password">
                <Input icon="lock" type="password" required value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password"/>
                <PasswordStrength password={pwd}/>
              </Field>
              <Field label="Conferma password" error={conf && pwd !== conf ? 'Le password non coincidono' : null}>
                <Input icon="lock" type="password" required value={conf}
                  onChange={e => setConf(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password"/>
              </Field>
              <PrimaryBtn disabled={loading} style={{ marginTop: 8 }}>
                {loading ? 'Aggiornamento…' : <>Salva nuova password <Icon name="arrowR" size={15} color="#FFF"/></>}
              </PrimaryBtn>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AuthPage({ onSignIn, onSignUp, initialReferralCode = '' }) {
  const isMobile = useIsMobile()
  const [mode, setMode] = useState(initialReferralCode ? 'registrati' : 'login')
  const [regStep, setRegStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState('')
  const [msg, setMsg] = useState('')

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPwd, setLoginPwd]     = useState('')

  const [loginAttempts, setLoginAttempts] = useState(() => {
    try { return parseInt(localStorage.getItem('foodios-login-attempts') || '0', 10) } catch { return 0 }
  })
  const [lockoutUntil, setLockoutUntil] = useState(() => {
    try { return parseInt(localStorage.getItem('foodios-lockout-until') || '0', 10) } catch { return 0 }
  })

  const [resetEmail, setResetEmail] = useState('')
  const [newPwd, setNewPwd]         = useState('')
  const [newPwdConf, setNewPwdConf] = useState('')

  const [reg, setReg] = useState({
    nome: '', cognome: '', nome_attivita: '',
    tipo_attivita: 'Pasticceria', citta: '',
    email: '', password: '', codice_invito: initialReferralCode,
  })
  const [successo, setSuccesso] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset-password')
        setErrore(''); setMsg('')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  function setR(field) { return e => setReg(p => ({ ...p, [field]: e.target.value })) }
  function clear() { setErrore(''); setMsg('') }

  function getLockoutMessage(until) {
    const secs = Math.ceil((until - Date.now()) / 1000)
    if (secs <= 0) return ''
    if (secs < 120) return `Troppi tentativi. Riprova tra ${secs} secondi.`
    return `Troppi tentativi. Riprova tra ${Math.ceil(secs / 60)} minuti.`
  }

  async function handleLogin(e) {
    e.preventDefault(); clear()
    const now = Date.now()
    if (lockoutUntil > now) { setErrore(getLockoutMessage(lockoutUntil)); return }
    setLoading(true)
    try {
      await onSignIn(loginEmail, loginPwd)
      setLoginAttempts(0); setLockoutUntil(0)
      localStorage.removeItem('foodios-login-attempts')
      localStorage.removeItem('foodios-lockout-until')
    } catch (err) {
      const next = loginAttempts + 1
      setLoginAttempts(next)
      localStorage.setItem('foodios-login-attempts', String(next))
      let blockMs = 0
      if (next >= 10) blockMs = 60 * 60 * 1000
      else if (next >= 5) blockMs = 15 * 60 * 1000
      else if (next >= 3) blockMs = 60 * 1000
      if (blockMs > 0) {
        const until = Date.now() + blockMs
        setLockoutUntil(until)
        localStorage.setItem('foodios-lockout-until', String(until))
        setErrore(getLockoutMessage(until))
      } else {
        setErrore(err.message)
      }
    } finally { setLoading(false) }
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

  function regStep1Valid() {
    return !!(reg.nome.trim() && reg.cognome.trim() && reg.email.trim() &&
              Object.values(checkPwd(reg.password)).every(Boolean))
  }

  function nextRegStep(e) {
    e.preventDefault(); clear()
    if (!regStep1Valid()) {
      setErrore('Compila tutti i campi e scegli una password sicura.'); return
    }
    setRegStep(2)
  }

  async function handleRegistrazione(e) {
    e.preventDefault(); clear()
    if (!reg.nome_attivita.trim() || !reg.citta.trim()) {
      setErrore("Inserisci nome attività e città."); return
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

  const isReset = mode === 'reset-request' || mode === 'reset-password'

  return (
    <div style={{
      minHeight: '100vh', background: T.cream,
      fontFamily: SANS, color: T.ink,
      WebkitFontSmoothing: 'antialiased',
      display: isMobile ? 'block' : 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '0.92fr 1.08fr',
    }}>
      {!isReset && <BrandPanel mode={mode} isMobile={isMobile}/>}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? '32px 20px 48px' : '48px 48px',
        minHeight: isReset ? '100vh' : (isMobile ? 'auto' : '100vh'),
        background: T.cream,
      }}>
        <div style={{ width: '100%', maxWidth: 440 }}>

          {isReset && (
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <FoodOSLogo size={52} style={{ borderRadius: 13, boxShadow: '0 8px 24px rgba(192,57,43,0.28)' }}/>
              <h1 style={{
                fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: T.ink,
                letterSpacing: '-0.025em', margin: '18px 0 6px',
              }}>
                {mode === 'reset-request' ? 'Password dimenticata?' : 'Imposta nuova password'}
              </h1>
              <p style={{ margin: 0, fontSize: 14, color: T.textMid }}>
                {mode === 'reset-request'
                  ? 'Ti mandiamo un link per reimpostarla.'
                  : 'Scegli una nuova password sicura.'}
              </p>
            </div>
          )}

          {!isReset && (
            <div style={{
              display: 'inline-flex', padding: 4, marginBottom: 28,
              background: T.creamDeep, borderRadius: 12, gap: 4,
            }}>
              {[['login', 'Accedi'], ['registrati', 'Registrati']].map(([id, lbl]) => (
                <button key={id} onClick={() => { setMode(id); setRegStep(1); clear(); setSuccesso(false) }} style={{
                  padding: '9px 22px', border: 'none', cursor: 'pointer',
                  background: mode === id ? T.paper : 'transparent',
                  color: mode === id ? T.ink : T.textMid,
                  fontFamily: SANS, fontWeight: mode === id ? 700 : 500, fontSize: 13,
                  borderRadius: 9,
                  boxShadow: mode === id ? '0 2px 8px rgba(15,9,7,0.06)' : 'none',
                  transition: 'all 0.18s ease', letterSpacing: '-0.005em',
                }}>{lbl}</button>
              ))}
            </div>
          )}

          {!isReset && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{
                fontFamily: SERIF, fontSize: 28, fontWeight: 600,
                color: T.ink, letterSpacing: '-0.025em',
                margin: '0 0 6px',
              }}>
                {mode === 'login' ? 'Accedi al tuo account' : (regStep === 1 ? 'Crea il tuo account' : 'Parlaci della tua attività')}
              </h2>
              <p style={{ fontSize: 14, color: T.textMid, margin: 0, lineHeight: 1.55 }}>
                {mode === 'login'
                  ? 'Inserisci email e password per continuare.'
                  : (regStep === 1
                    ? 'Bastano 30 secondi. Senza carta di credito.'
                    : "Ultimo passo per personalizzare la tua FoodOS.")}
              </p>
            </div>
          )}

          {errore && <ErrorAlert>{errore}</ErrorAlert>}
          {msg && <SuccessAlert>{msg}</SuccessAlert>}

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <Field label="Email">
                <Input icon="mail" type="email" required value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="tua@email.com" autoComplete="email"/>
              </Field>
              <Field label="Password" hint={
                <button type="button" onClick={() => { setMode('reset-request'); clear() }}
                  style={{ background: 'none', border: 'none', color: T.red, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  Dimenticata?
                </button>
              }>
                <Input icon="lock" type="password" required value={loginPwd}
                  onChange={e => setLoginPwd(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"/>
              </Field>
              <PrimaryBtn disabled={loading || lockoutUntil > Date.now()}>
                {loading ? 'Accesso in corso…' : <>Accedi <Icon name="arrowR" size={15} color="#FFF"/></>}
              </PrimaryBtn>

              <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: T.textMid }}>
                Non hai un account?{' '}
                <button type="button" onClick={() => { setMode('registrati'); clear() }} style={{
                  background: 'none', border: 'none', color: T.red,
                  fontWeight: 700, cursor: 'pointer', padding: 0,
                  fontFamily: SANS, fontSize: 13, borderBottom: `1px solid ${T.red}`,
                }}>
                  Registrati gratis
                </button>
              </div>
            </form>
          )}

          {mode === 'reset-request' && (
            <form onSubmit={handleResetRequest}>
              <Field label="Email">
                <Input icon="mail" type="email" required value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="tua@email.com" autoComplete="email"/>
              </Field>
              <PrimaryBtn disabled={loading}>
                {loading ? 'Invio in corso…' : <>Invia link di reset <Icon name="arrowR" size={15} color="#FFF"/></>}
              </PrimaryBtn>
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button type="button"
                  onClick={() => { setMode('login'); clear() }}
                  style={{ background: 'none', border: 'none', color: T.textMid, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: SANS, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="arrowL" size={14} color={T.textMid}/> Torna al login
                </button>
              </div>
            </form>
          )}

          {mode === 'reset-password' && (
            <form onSubmit={handleNewPassword}>
              <Field label="Nuova password">
                <Input icon="lock" type="password" required value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password"/>
                <PasswordStrength password={newPwd}/>
              </Field>
              <Field label="Conferma password" error={newPwdConf && newPwd !== newPwdConf ? 'Le password non coincidono' : null}>
                <Input icon="lock" type="password" required value={newPwdConf}
                  onChange={e => setNewPwdConf(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password"/>
              </Field>
              <PrimaryBtn disabled={loading}>
                {loading ? 'Aggiornamento…' : <>Salva nuova password <Icon name="arrowR" size={15} color="#FFF"/></>}
              </PrimaryBtn>
            </form>
          )}

          {mode === 'registrati' && (
            successo ? (
              <div style={{
                background: T.paper, border: `1px solid ${T.border}`,
                borderRadius: 18, padding: '36px 32px', textAlign: 'center',
                boxShadow: '0 12px 40px rgba(15,9,7,0.06)',
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 999,
                  background: T.greenSoft, color: T.green,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 18px',
                }}>
                  <Icon name="mail" size={28} color={T.green} stroke={2}/>
                </div>
                <h3 style={{
                  fontFamily: SERIF, color: T.ink, margin: '0 0 10px',
                  fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em',
                }}>
                  Controlla la tua email
                </h3>
                <p style={{ color: T.textMid, fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                  Ti abbiamo inviato un link di conferma a<br/>
                  <strong style={{ color: T.ink }}>{reg.email}</strong>.<br/>
                  Aprilo per attivare il tuo account.
                </p>
                <div style={{
                  marginTop: 28, padding: 14, background: T.cream, borderRadius: 12,
                  fontSize: 12, color: T.textSoft, lineHeight: 1.5,
                }}>
                  Non vedi l'email? Controlla in spam o riprova fra qualche minuto.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <StepDot active={regStep === 1} done={regStep > 1}>1</StepDot>
                  <div style={{ flex: 1, height: 1.5, background: regStep > 1 ? T.ink : T.border, transition: 'background 0.3s' }}/>
                  <StepDot active={regStep === 2} done={false}>2</StepDot>
                </div>

                {regStep === 1 && (
                  <form onSubmit={nextRegStep}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Field label="Nome">
                        <Input icon="user" required value={reg.nome} onChange={setR('nome')} placeholder="Mario"/>
                      </Field>
                      <Field label="Cognome">
                        <Input required value={reg.cognome} onChange={setR('cognome')} placeholder="Rossi"/>
                      </Field>
                    </div>
                    <Field label="Email">
                      <Input icon="mail" type="email" required value={reg.email} onChange={setR('email')}
                        placeholder="tua@email.com" autoComplete="email"/>
                    </Field>
                    <Field label="Password">
                      <Input icon="lock" type="password" required value={reg.password} onChange={setR('password')}
                        placeholder="••••••••" autoComplete="new-password"/>
                      <PasswordStrength password={reg.password}/>
                    </Field>
                    <PrimaryBtn type="submit" disabled={!regStep1Valid()} style={{ marginTop: 8 }}>
                      Continua <Icon name="arrowR" size={15} color={regStep1Valid() ? '#FFF' : T.textSoft}/>
                    </PrimaryBtn>

                    <div style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: T.textMid }}>
                      Hai già un account?{' '}
                      <button type="button" onClick={() => { setMode('login'); clear() }} style={{
                        background: 'none', border: 'none', color: T.red,
                        fontWeight: 700, cursor: 'pointer', padding: 0,
                        fontFamily: SANS, fontSize: 13, borderBottom: `1px solid ${T.red}`,
                      }}>
                        Accedi
                      </button>
                    </div>
                  </form>
                )}

                {regStep === 2 && (
                  <form onSubmit={handleRegistrazione}>
                    <Field label="Nome attività">
                      <Input icon="bag" required value={reg.nome_attivita} onChange={setR('nome_attivita')}
                        placeholder="Pasticceria Rossi"/>
                    </Field>

                    <Field label="Tipo di attività">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                        {TIPI_ATTIVITA.map(t => {
                          const selected = reg.tipo_attivita === t
                          return (
                            <button key={t} type="button"
                              onClick={() => setReg(p => ({ ...p, tipo_attivita: t }))}
                              style={{
                                padding: '11px 12px',
                                background: selected ? T.ink : T.paper,
                                color: selected ? T.cream : T.textMid,
                                border: `1.5px solid ${selected ? T.ink : T.border}`,
                                borderRadius: 10, fontSize: 13, fontWeight: selected ? 700 : 500,
                                cursor: 'pointer', fontFamily: SANS,
                                transition: 'all 0.15s ease', textAlign: 'center',
                              }}>
                              {t}
                            </button>
                          )
                        })}
                      </div>
                    </Field>

                    <Field label="Città">
                      <CittaInput value={reg.citta} onChange={v => setReg(p => ({ ...p, citta: v }))}/>
                    </Field>

                    <Field label="Codice invito" hint="opzionale">
                      <Input value={reg.codice_invito} onChange={setR('codice_invito')}
                        placeholder="Lascia vuoto se non ce l'hai"/>
                    </Field>

                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button type="button" onClick={() => { setRegStep(1); clear() }} style={{
                        padding: '14px 18px',
                        background: 'transparent', color: T.textMid,
                        border: `1.5px solid ${T.border}`, borderRadius: 12,
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        fontFamily: SANS, display: 'flex', alignItems: 'center', gap: 6,
                        flexShrink: 0,
                      }}>
                        <Icon name="arrowL" size={14} color={T.textMid}/>
                      </button>
                      <div style={{ flex: 1 }}>
                        <PrimaryBtn disabled={loading || !reg.nome_attivita.trim() || !reg.citta.trim()}>
                          {loading ? 'Creazione account…' : <>Crea il mio account <Icon name="arrowR" size={15} color="#FFF"/></>}
                        </PrimaryBtn>
                      </div>
                    </div>

                    <p style={{
                      fontSize: 11, color: T.textSoft, textAlign: 'center',
                      marginTop: 16, lineHeight: 1.6,
                    }}>
                      Registrandoti accetti i nostri <a href="/termini" style={{ color: T.textMid, textDecoration: 'underline' }}>Termini</a> e la <a href="/privacy" style={{ color: T.textMid, textDecoration: 'underline' }}>Privacy Policy</a>.
                    </p>
                  </form>
                )}
              </>
            )
          )}

          <p style={{
            textAlign: 'center', fontSize: 12, color: T.textSoft,
            marginTop: 32, lineHeight: 1.6,
          }}>
            Problemi con l'accesso? Scrivici a{' '}
            <a href="mailto:support@foodios.it" style={{ color: T.red, fontWeight: 600, textDecoration: 'none' }}>
              support@foodios.it
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

function StepDot({ active, done, children }) {
  const bg = (active || done) ? T.ink : T.paper
  const color = (active || done) ? T.cream : T.textSoft
  const border = (active || done) ? T.ink : T.border
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 999,
      background: bg, color,
      border: `1.5px solid ${border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, fontFamily: SANS,
      transition: 'all 0.2s ease',
      flexShrink: 0,
    }}>
      {done ? <Icon name="check" size={13} color={T.cream} stroke={2.5}/> : children}
    </div>
  )
}
