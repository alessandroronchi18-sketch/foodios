import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import FoodOSLogo from '../components/FoodOSLogo'
import COMUNI_ITALIANI from '../lib/comuniItaliani'
import PinLoginPad from './PinLoginPad'

const T = {
  cream:      '#FBF8F4',
  creamDeep:  '#F4ECE3',
  paper:      '#FFFFFF',
  ink:        '#0F0907',
  inkSoft:    '#1A0F0D',
  textMid:    '#5C4842',
  textSoft:   '#9C887F',
  textOnDark: '#F4ECE3',
  red:        '#6E0E1A',
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

// {label mostrato, slug stabile salvato su organizations.tipo}.
// Lo slug è la chiave usata da src/lib/lessico.js per la terminologia.
const TIPI_ATTIVITA = [
  { label: 'Pasticceria',                slug: 'pasticceria' },
  { label: 'Gelateria',                  slug: 'gelateria' },
  { label: 'Cioccolateria',              slug: 'cioccolateria' },
  { label: 'Panificio / Forno',          slug: 'panificio' },
  { label: 'Pizzeria',                   slug: 'pizzeria' },
  { label: 'Pasta fresca / Laboratorio', slug: 'pasta_fresca' },
  { label: 'Gastronomia / Rosticceria',  slug: 'gastronomia' },
  { label: 'Bar / Caffetteria',          slug: 'bar' },
  { label: 'Ristorante',                 slug: 'ristorante' },
  { label: 'Altro',                      slug: 'altro' },
]

// Prefissi telefonici internazionali — default Italia (+39)
const PREFISSI_TELEFONO = [
  { code: '+39',  label: 'Italia' },
  { code: '+378', label: 'San Marino' },
  { code: '+377', label: 'Monaco' },
  { code: '+33',  label: 'Francia' },
  { code: '+34',  label: 'Spagna' },
  { code: '+41',  label: 'Svizzera' },
  { code: '+49',  label: 'Germania' },
  { code: '+44',  label: 'Regno Unito' },
  { code: '+43',  label: 'Austria' },
  { code: '+30',  label: 'Grecia' },
  { code: '+31',  label: 'Paesi Bassi' },
  { code: '+32',  label: 'Belgio' },
  { code: '+351', label: 'Portogallo' },
  { code: '+352', label: 'Lussemburgo' },
  { code: '+1',   label: 'USA / Canada' },
]

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
    phone:     <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" fill="none"/>,
    bag:       <><path d="M5 7h14l-1 13H6L5 7z" fill="none"/><path d="M8 7a4 4 0 0 1 8 0" fill="none"/></>,
    map:       <><path d="M12 2c-4 0-7 3-7 7 0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" fill="none"/><circle cx="12" cy="9" r="2.5" fill="none"/></>,
    star:      <polygon points="12 2 14.5 8.5 21 9 16 13.5 17.5 20 12 16.5 6.5 20 8 13.5 3 9 9.5 8.5" />,
    x:         <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>,
    key:       <><circle cx="8" cy="15" r="3" fill="none"/><path d="M10.5 13L21 2.5" fill="none"/><path d="M17 6l3 3" fill="none"/><path d="M14.5 9l3 3" fill="none"/></>,
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
  const isMobile = useIsMobile()
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '4px 10px' }}>
        {req.map(([ok, txt]) => (
          <div key={txt} style={{ fontSize: 11, color: ok ? T.green : T.textSoft, display: 'flex', alignItems: 'center', gap: 4, fontWeight: ok ? 600 : 500 }}>
            <span style={{ fontSize: 9 }}>{ok ? '●' : '○'}</span>{txt}
          </div>
        ))}
      </div>
    </div>
  )
}

function Input({ id, icon, type = 'text', value, onChange, placeholder, required, autoComplete, name, onFocus, onBlur, inputMode, maxLength }) {
  // Audit 2026-07-01 MEDIUM: id pass-through per a11y htmlFor su <label>.
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
      boxSizing: 'border-box', width: '100%', minWidth: 0,
    }}>
      {icon && <Icon name={icon} size={18} color={focused ? T.ink : T.textSoft}/>}
      <input
        id={id}
        name={name}
        type={inputType}
        required={required}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={onChange}
        onFocus={(e) => { setFocused(true); onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); onBlur?.(e) }}
        placeholder={placeholder}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 16, color: T.ink, fontFamily: SANS, fontWeight: 500,
          padding: 0, minWidth: 0, width: '100%',
        }}
      />
      {type === 'password' && (
        <button type="button" tabIndex={-1}
          onClick={() => setShowPwd(s => !s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: 0, color: T.textSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, flexShrink: 0 }}
          aria-label={showPwd ? 'Nascondi password' : 'Mostra password'}>
          <Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} color={T.textSoft}/>
        </button>
      )}
    </div>
  )
}

function Field({ label, hint, children, error, htmlFor }) {
  // Audit 2026-07-01 MEDIUM: htmlFor accoppia label all'input -> tap su label
  // focusa l'input (a11y screen reader + UX click-area).
  return (
    <div style={{ marginBottom: 16, minWidth: 0 }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
          <label htmlFor={htmlFor} style={{ fontSize: 12, fontWeight: 600, color: T.textMid, letterSpacing: '0.01em' }}>{label}</label>
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
        boxShadow: disabled ? 'none' : h ? '0 12px 30px rgba(110,14,26,0.28)' : '0 6px 18px rgba(110,14,26,0.20)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        ...style,
      }}
    >{children}</button>
  )
}

function CittaInput({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(value)
  const [hi, setHi] = useState(0)
  const ref = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setQ(value) }, [value])

  const matches = q && q.length >= 2
    ? (() => {
        const needle = q.toLowerCase()
        const starts = []
        const contains = []
        for (const c of COMUNI_ITALIANI) {
          const cl = c.toLowerCase()
          if (cl.startsWith(needle)) starts.push(c)
          else if (cl.includes(needle)) contains.push(c)
          if (starts.length >= 8) break
        }
        return [...starts, ...contains].slice(0, 8)
      })()
    : []

  useEffect(() => { setHi(0) }, [q])

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleKey(e) {
    if (!open || matches.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = matches[hi] || matches[0]
      if (pick) { setQ(pick); onChange(pick); setOpen(false) }
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} onKeyDown={handleKey}>
      <Input icon="map" value={q} placeholder="Es. Torino" required autoComplete="off"
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}/>
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 999,
          background: T.paper, border: `1px solid ${T.border}`, borderRadius: 12,
          boxShadow: '0 14px 40px rgba(15,9,7,0.12)', overflow: 'hidden',
        }}>
          {matches.map((c, i) => (
            <div key={c}
              onMouseDown={e => { e.preventDefault(); setQ(c); onChange(c); setOpen(false) }}
              onMouseEnter={() => setHi(i)}
              style={{
                padding: '11px 16px', fontSize: 14, cursor: 'pointer',
                color: T.ink, fontWeight: i === hi ? 700 : 500,
                background: i === hi ? T.cream : 'transparent',
                transition: 'background 0.1s',
              }}>
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PhoneInput({ prefisso, numero, onPrefisso, onNumero }) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const ref = useRef(null)
  const sel = PREFISSI_TELEFONO.find(p => p.code === prefisso) || PREFISSI_TELEFONO[0]

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} style={{
      display: 'flex', alignItems: 'stretch', gap: 8,
      background: focused ? T.paper : T.cream,
      border: `1.5px solid ${focused ? T.ink : T.border}`,
      borderRadius: 12, height: 48, padding: 0,
      boxSizing: 'border-box', width: '100%', minWidth: 0,
      boxShadow: focused ? `0 0 0 4px ${T.creamDeep}` : 'none',
      transition: 'all 0.18s ease', position: 'relative',
    }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 10px 0 12px', background: 'transparent',
          border: 'none', borderRight: `1px solid ${T.border}`,
          fontSize: 14, color: T.ink, fontWeight: 600, cursor: 'pointer',
          fontFamily: SANS, minWidth: 84,
        }}>
        <span>{sel.code}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.textSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 140ms' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <input
        type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={15}
        value={numero}
        onChange={e => onNumero(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="333 1234567"
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none',
          background: 'transparent', fontSize: 16, color: T.ink,
          fontFamily: SANS, fontWeight: 500, padding: '0 14px 0 0',
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          minWidth: 230, zIndex: 999, background: T.paper,
          border: `1px solid ${T.border}`, borderRadius: 12,
          boxShadow: '0 14px 40px rgba(15,9,7,0.12)',
          maxHeight: 260, overflowY: 'auto',
        }}>
          {PREFISSI_TELEFONO.map(p => (
            <button type="button" key={p.code}
              onMouseDown={e => { e.preventDefault(); onPrefisso(p.code); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', background: p.code === prefisso ? T.cream : 'transparent',
                border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: SANS,
                color: T.ink, textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.cream}
              onMouseLeave={e => e.currentTarget.style.background = p.code === prefisso ? T.cream : 'transparent'}>
              <span style={{ fontWeight: 600, minWidth: 50 }}>{p.code}</span>
              <span style={{ color: T.textMid }}>{p.label}</span>
            </button>
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

export function ResetPasswordPage({ onDone }) {
  const [pwd, setPwd]         = useState('')
  const [conf, setConf]       = useState('')
  const [loading, setLoading] = useState(false)
  const [errore, setErrore]   = useState('')
  const [successo, setSuccesso] = useState(false)
  // Audit 2026-07-01 HIGH: cleanup setTimeout. Se il componente unmounta nei
  // 2s post-success, signOut/onDone partirebbero su componente smontato.
  const signoutTimerRef = useRef(null)
  useEffect(() => () => {
    if (signoutTimerRef.current) clearTimeout(signoutTimerRef.current)
  }, [])

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
      if (signoutTimerRef.current) clearTimeout(signoutTimerRef.current)
      signoutTimerRef.current = setTimeout(async () => {
        await supabase.auth.signOut()
        onDone()
      }, 2000)
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
            <FoodOSLogo size={56} style={{ borderRadius: 14, boxShadow: '0 8px 28px rgba(110,14,26,0.28)' }}/>
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
              <Field label="Nuova password" htmlFor="reset-newpwd">
                <Input id="reset-newpwd" icon="lock" type="password" required value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password"/>
                <PasswordStrength password={pwd}/>
              </Field>
              <Field label="Conferma password" htmlFor="reset-confpwd"
                error={conf && pwd !== conf ? 'Le password non coincidono' : null}>
                <Input id="reset-confpwd" icon="lock" type="password" required value={conf}
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

export default function AuthPage({ onSignIn, onSignUp, initialReferralCode = '', initialMode = null }) {
  const isMobile = useIsMobile()
  // mode: 'login' | 'registrati' | 'reset-request' | 'reset-password' | 'pin-login'
  const [mode, setMode] = useState(initialMode || (initialReferralCode ? 'registrati' : 'login'))

  // Se il dipendente ha già usato il PIN su questo device, mostra entry PIN
  // come default (è la modalità preferita su tablet condiviso).
  useEffect(() => {
    try {
      const lastPinOrg = localStorage.getItem('foodios_dip_org')
      const lastPinAt = parseInt(localStorage.getItem('foodios_dip_pin_last') || '0', 10)
      const recentlyUsed = lastPinAt && (Date.now() - lastPinAt) < 30 * 24 * 60 * 60 * 1000  // 30gg
      if (lastPinOrg && recentlyUsed && !initialMode) setMode('pin-login')
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [regStep, setRegStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState('')
  const [msg, setMsg] = useState('')
  const [emailEsistente, setEmailEsistente] = useState('')  // email già registrata in fase di signup

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
    nome: '', cognome: '', prefisso: '+39', telefono: '', nome_attivita: '',
    tipo_attivita: 'pasticceria', citta: '',
    email: '', password: '', codice_invito: initialReferralCode,
    accept_terms: false,
  })
  const [otpCode, setOtpCode]   = useState('')
  const [otpSent, setOtpSent]   = useState(false)
  const [otpVerified, setOtpVerified] = useState(false)
  const [otpSkipped, setOtpSkipped]   = useState(false)
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
  function clear() { setErrore(''); setMsg(''); setEmailEsistente('') }

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
      // ── Server-side brute-force check (PRIMA del signIn) ──
      // Il lockout client-side è bypassabile (localStorage.clear()): il server è la fonte di verità.
      try {
        const guard = await fetch('/api/login-guard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check', email: loginEmail }),
        })
        if (guard.status === 423) {
          const j = await guard.json().catch(() => ({}))
          const mins = Math.ceil((j.retryAfter || 1800) / 60)
          setErrore(`Account temporaneamente bloccato per troppi tentativi. Riprova tra ${mins} minuti.`)
          setLoading(false)
          return
        }
      } catch { /* guard giù: fail-open, supabase rate-limit interno è il fallback */ }

      await onSignIn(loginEmail, loginPwd)
      // Notifica successo (fire-and-forget): serve per resettare contatore e per anomaly detection
      fetch('/api/login-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'success', email: loginEmail }),
      }).catch(() => {})
      setLoginAttempts(0); setLockoutUntil(0)
      localStorage.removeItem('foodios-login-attempts')
      localStorage.removeItem('foodios-lockout-until')
    } catch (err) {
      // Log fail server-side (fire-and-forget). Soglia raggiunta = notifica email al titolare.
      fetch('/api/login-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fail', email: loginEmail }),
      }).catch(() => {})

      const next = loginAttempts + 1
      setLoginAttempts(next)
      try { localStorage.setItem('foodios-login-attempts', String(next)) } catch {}
      let blockMs = 0
      if (next >= 10) blockMs = 60 * 60 * 1000
      else if (next >= 5) blockMs = 15 * 60 * 1000
      else if (next >= 3) blockMs = 60 * 1000
      if (blockMs > 0) {
        const until = Date.now() + blockMs
        setLockoutUntil(until)
        try { localStorage.setItem('foodios-lockout-until', String(until)) } catch {}
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

  // Telefono richiesto: 6-15 cifre dopo aver tolto il prefisso (regola E.164 lasca).
  function isNumeroValido(numero) {
    const v = (numero || '').replace(/[^0-9]/g, '')
    return v.length >= 6 && v.length <= 15
  }

  function telefonoCompleto() {
    return (reg.prefisso + reg.telefono.replace(/[^0-9]/g, '')).trim()
  }

  // Regole nome/cognome: solo lettere (anche accentate), apostrofi e spazi, niente cifre.
  const NAME_RX = /^[A-Za-zÀ-ÖØ-öø-ÿ' \-]+$/
  function isNomeValido(s) {
    const v = (s || '').trim()
    return v.length >= 3 && NAME_RX.test(v)
  }
  function isCognomeValido(s) {
    const v = (s || '').trim()
    return v.length >= 2 && NAME_RX.test(v)
  }
  function isEmailValida(s) {
    const v = (s || '').trim()
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
  }

  function regStep1Valid() {
    return !!(isNomeValido(reg.nome) && isCognomeValido(reg.cognome) &&
              isEmailValida(reg.email) &&
              isNumeroValido(reg.telefono) &&
              Object.values(checkPwd(reg.password)).every(Boolean))
  }
  function regStep2Valid() {
    return !!(reg.nome_attivita.trim().length >= 2 && reg.citta.trim().length >= 2 && reg.tipo_attivita && reg.accept_terms)
  }

  async function nextRegStep(e) {
    e.preventDefault(); clear()
    if (!isNomeValido(reg.nome)) { setErrore('Il nome deve contenere almeno 3 lettere.'); return }
    if (!isCognomeValido(reg.cognome)) { setErrore('Il cognome deve contenere almeno 2 lettere.'); return }
    if (!isEmailValida(reg.email)) { setErrore('Inserisci un indirizzo email valido.'); return }
    if (!isNumeroValido(reg.telefono)) { setErrore('Numero di telefono non valido (6-15 cifre).'); return }
    if (!Object.values(checkPwd(reg.password)).every(Boolean)) {
      setErrore('La password non soddisfa tutti i requisiti di sicurezza.'); return
    }
    if (!regStep1Valid()) {
      setErrore('Compila tutti i campi e scegli una password sicura.'); return
    }
    // Tenta invio OTP SMS. Se il backend (Supabase Phone Auth) non è configurato,
    // saltiamo la verifica e procediamo: il numero viene comunque salvato.
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: telefonoCompleto(),
        options: { shouldCreateUser: false },
      })
      if (error) {
        // Backend non configurato o numero non collegato a un user: skip verifica
        setOtpSkipped(true)
        setRegStep(2)
      } else {
        setOtpSent(true)
        setRegStep(1.5)
      }
    } catch {
      setOtpSkipped(true)
      setRegStep(2)
    } finally { setLoading(false) }
  }

  async function verificaOtp(e) {
    e.preventDefault(); clear()
    if (!/^[0-9]{6}$/.test(otpCode)) {
      setErrore('Il codice deve essere di 6 cifre.'); return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: telefonoCompleto(),
        token: otpCode,
        type: 'sms',
      })
      if (error) throw error
      // Verifica OK: sign out della sessione OTP per non interferire col signUp
      // email+password. Se il signOut fallisce il signup successivo userebbe
      // l'utente OTP (telefono-only) come parent — bloccato in fase di insert
      // sui profili. Loggiamo + abortiamo invece di silenziare.
      try {
        const { error: outErr } = await supabase.auth.signOut()
        if (outErr) throw outErr
      } catch (e) {
        console.error('[OTP signOut]', e?.message)
        setErrore('Errore interno (logout sessione OTP). Ricarica la pagina e riprova.')
        return
      }
      setOtpVerified(true)
      setRegStep(2)
    } catch (err) {
      setErrore(err.message || 'Codice non valido o scaduto.')
    } finally { setLoading(false) }
  }

  async function rinviaOtp() {
    clear(); setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: telefonoCompleto(),
        options: { shouldCreateUser: false },
      })
      if (error) throw error
      setMsg('Codice rinviato.')
    } catch (err) {
      setErrore(err.message || 'Errore nel rinvio.')
    } finally { setLoading(false) }
  }

  async function handleRegistrazione(e) {
    e.preventDefault(); clear()
    if (!isNomeValido(reg.nome) || !isCognomeValido(reg.cognome)) {
      setErrore('Nome (3+ lettere) e cognome (2+ lettere) sono obbligatori.'); return
    }
    if (reg.nome_attivita.trim().length < 2) {
      setErrore("Inserisci il nome dell'attività (almeno 2 caratteri)."); return
    }
    if (reg.citta.trim().length < 2) {
      setErrore('Inserisci la città.'); return
    }
    if (!reg.tipo_attivita) {
      setErrore("Seleziona il tipo di attività."); return
    }
    setLoading(true)
    try {
      const telNorm = telefonoCompleto()

      await onSignUp(reg.email, reg.password, {
        nome_completo: `${reg.nome.trim()} ${reg.cognome.trim()}`.trim(),
        nome_attivita: reg.nome_attivita,
        tipo_attivita: reg.tipo_attivita, // già uno slug stabile (vedi TIPI_ATTIVITA)
        citta: reg.citta,
        telefono: telNorm,
        telefono_verificato: otpVerified,
        ...(reg.codice_invito.trim() && { codice_invito: reg.codice_invito.trim() }),
      })
      setSuccesso(true)
    } catch (err) {
      if (err.message === 'EMAIL_ESISTENTE') setEmailEsistente(reg.email)
      else setErrore(err.message)
    } finally { setLoading(false) }
  }

  const isReset = mode === 'reset-request' || mode === 'reset-password'

  // Modalità Dipendente PWA: PIN login standalone (tema scuro), bypass del layout normale.
  if (mode === 'pin-login') {
    return <PinLoginPad onBack={() => setMode('login')} />
  }

  return (
    <div style={{
      minHeight: '100vh', background: T.cream,
      fontFamily: SANS, color: T.ink,
      WebkitFontSmoothing: 'antialiased',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background ornament — discreto, warm */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle at 80% 0%, rgba(110,14,26,0.06), transparent 50%), radial-gradient(circle at 0% 100%, rgba(230,189,90,0.05), transparent 55%)',
      }}/>

      <div style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh',
        padding: isMobile ? '32px 20px 40px' : '48px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 460 }}>

          {/* Header — logo + brand */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12, marginBottom: isMobile ? 28 : 36,
          }}>
            <FoodOSLogo size={isMobile ? 44 : 52} style={{ borderRadius: 13, boxShadow: '0 8px 24px rgba(110,14,26,0.28)' }}/>
            <span style={{ fontFamily: SERIF, fontSize: isMobile ? 28 : 32, fontWeight: 600, color: T.ink, letterSpacing: '-0.03em' }}>FoodOS</span>
          </div>

          {/* Card */}
          <div style={{
            background: T.paper,
            border: `1px solid ${T.border}`,
            borderRadius: 20,
            padding: isMobile ? '28px 22px' : '36px 36px',
            boxShadow: '0 20px 50px rgba(15,9,7,0.06), 0 4px 14px rgba(15,9,7,0.04)',
          }}>

          {isReset && (
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h1 style={{
                fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: T.ink,
                letterSpacing: '-0.025em', margin: '0 0 6px',
              }}>
                {mode === 'reset-request' ? 'Password dimenticata?' : 'Imposta nuova password'}
              </h1>
              <p style={{ margin: 0, fontSize: 14, color: T.textMid, lineHeight: 1.55 }}>
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
            }} role="tablist" aria-label="Scegli login o registrazione">
              {[['login', 'Accedi'], ['registrati', 'Registrati']].map(([id, lbl]) => (
                <button key={id} role="tab" aria-selected={mode === id}
                  onClick={() => { setMode(id); setRegStep(1); clear(); setSuccesso(false) }} style={{
                  padding: '9px 22px', border: 'none', cursor: 'pointer',
                  background: mode === id ? T.paper : 'transparent',
                  color: mode === id ? T.ink : T.textMid,
                  fontFamily: SANS, fontWeight: mode === id ? 700 : 500, fontSize: 13,
                  borderRadius: 8,
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
                {mode === 'login' ? 'Accedi al tuo account' : (regStep === 1 ? 'Crea il tuo account' : regStep === 1.5 ? 'Verifica il telefono' : 'Parlaci della tua attività')}
              </h2>
              <p style={{ fontSize: 14, color: T.textMid, margin: 0, lineHeight: 1.55 }}>
                {mode === 'login'
                  ? 'Inserisci email e password per continuare.'
                  : (regStep === 1
                    ? 'Bastano 30 secondi.'
                    : regStep === 1.5
                      ? `Inserisci il codice di 6 cifre inviato al ${reg.prefisso} ${reg.telefono}.`
                      : "Ultimo passo per personalizzare la tua FoodOS.")}
              </p>
            </div>
          )}

          {errore && <ErrorAlert>{errore}</ErrorAlert>}
          {msg && <SuccessAlert>{msg}</SuccessAlert>}

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <Field label="Email" htmlFor="login-email">
                <Input id="login-email" icon="mail" type="email" required value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="tua@email.com" autoComplete="email"/>
              </Field>
              <Field label="Password" htmlFor="login-pwd" hint={
                <button type="button" onClick={() => { setMode('reset-request'); clear() }}
                  style={{ background: 'none', border: 'none', color: T.red, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  Dimenticata?
                </button>
              }>
                <Input id="login-pwd" icon="lock" type="password" required value={loginPwd}
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

              {/* Entry alternativo: PIN login per dipendenti su tablet condiviso */}
              <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px dashed ${T.border}`, textAlign: 'center' }}>
                <button type="button" onClick={() => { setMode('pin-login'); clear() }}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 14px', minHeight: 40,
                    color: T.textMid, fontFamily: SANS, fontSize: 13, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
                  <Icon name="key" size={14} color={T.textMid}/>
                  Sono un dipendente — entra col PIN
                </button>
              </div>
            </form>
          )}

          {mode === 'reset-request' && (
            <form onSubmit={handleResetRequest}>
              <Field label="Email" htmlFor="reset-email">
                <Input id="reset-email" icon="mail" type="email" required value={resetEmail}
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
              <Field label="Nuova password" htmlFor="rp-newpwd">
                <Input id="rp-newpwd" icon="lock" type="password" required value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password"/>
                <PasswordStrength password={newPwd}/>
              </Field>
              <Field label="Conferma password" htmlFor="rp-confpwd"
                error={newPwdConf && newPwd !== newPwdConf ? 'Le password non coincidono' : null}>
                <Input id="rp-confpwd" icon="lock" type="password" required value={newPwdConf}
                  onChange={e => setNewPwdConf(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password"/>
              </Field>
              <PrimaryBtn disabled={loading}>
                {loading ? 'Aggiornamento…' : <>Salva nuova password <Icon name="arrowR" size={15} color="#FFF"/></>}
              </PrimaryBtn>
            </form>
          )}

          {emailEsistente && (
            <div onClick={() => setEmailEsistente('')} style={{ position: 'fixed', inset: 0, background: 'rgba(15,9,7,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
              <div onClick={e => e.stopPropagation()} style={{ background: T.paper, borderRadius: 18, padding: isMobile ? '24px 20px' : '28px 26px', maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: T.redSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="mail" size={22} color={T.red} /></div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.red, marginBottom: 8 }}>Sei già registrato</div>
                <div style={{ fontSize: 14, color: T.textMid, lineHeight: 1.55, marginBottom: 20, wordBreak: 'break-word' }}>
                  L'email <b style={{ color: T.ink }}>{emailEsistente}</b> è già associata a un account. Accedi con la tua password, oppure recuperala se l'hai dimenticata.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button type="button" onClick={() => { setMode('login'); setLoginEmail(emailEsistente); clear() }} style={{ padding: '14px', minHeight: 48, background: T.red, color: '#FFF', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>Accedi</button>
                  <button type="button" onClick={() => { setMode('reset-request'); setResetEmail(emailEsistente); clear() }} style={{ padding: '14px', minHeight: 48, background: 'transparent', color: T.red, border: `1px solid ${T.border}`, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Recupera password</button>
                </div>
              </div>
            </div>
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
                  <StepDot active={regStep === 1.5} done={regStep > 1.5}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="3" width="12" height="18" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/>
                    </svg>
                  </StepDot>
                  <div style={{ flex: 1, height: 1.5, background: regStep > 1.5 ? T.ink : T.border, transition: 'background 0.3s' }}/>
                  <StepDot active={regStep === 2} done={false}>2</StepDot>
                </div>

                {regStep === 1 && (
                  <form onSubmit={nextRegStep}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 0 : 12, alignItems: 'start' }}>
                      <Field label="Nome" htmlFor="reg-nome"
                        error={reg.nome && !isNomeValido(reg.nome) ? 'Almeno 3 lettere, niente cifre.' : null}>
                        <Input id="reg-nome" icon="user" required value={reg.nome} onChange={setR('nome')} placeholder="Mario" autoComplete="given-name"/>
                      </Field>
                      <Field label="Cognome" htmlFor="reg-cognome"
                        error={reg.cognome && !isCognomeValido(reg.cognome) ? 'Almeno 2 lettere, niente cifre.' : null}>
                        <Input id="reg-cognome" icon="user" required value={reg.cognome} onChange={setR('cognome')} placeholder="Rossi" autoComplete="family-name"/>
                      </Field>
                    </div>
                    <Field label="Email" htmlFor="reg-email"
                      error={reg.email && !isEmailValida(reg.email) ? 'Email non valida.' : null}>
                      <Input id="reg-email" icon="mail" type="email" required value={reg.email} onChange={setR('email')}
                        placeholder="tua@email.com" autoComplete="email"/>
                    </Field>
                    <Field label="Telefono" htmlFor="reg-tel"
                      error={reg.telefono && !isNumeroValido(reg.telefono) ? 'Numero non valido (6-15 cifre).' : null}>
                      <PhoneInput
                        prefisso={reg.prefisso}
                        numero={reg.telefono}
                        onPrefisso={v => setReg(p => ({ ...p, prefisso: v }))}
                        onNumero={v => setReg(p => ({ ...p, telefono: v }))}
                      />
                      <div style={{ fontSize: 11, color: T.textSoft, marginTop: 6, lineHeight: 1.4 }}>
                        Ti invieremo un codice SMS di conferma. Useremo il numero per notifiche e 2FA.
                      </div>
                    </Field>
                    <Field label="Password" htmlFor="reg-pwd">
                      <Input id="reg-pwd" icon="lock" type="password" required value={reg.password} onChange={setR('password')}
                        placeholder="••••••••" autoComplete="new-password"/>
                      <PasswordStrength password={reg.password}/>
                    </Field>
                    <PrimaryBtn type="submit" disabled={loading || !regStep1Valid()} style={{ marginTop: 8 }}>
                      {loading ? 'Invio codice…' : <>Continua <Icon name="arrowR" size={15} color={regStep1Valid() ? '#FFF' : T.textSoft}/></>}
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

                {regStep === 1.5 && (
                  <form onSubmit={verificaOtp}>
                    <Field label="Codice SMS" htmlFor="reg-otp"
                      hint={<button type="button" onClick={rinviaOtp} disabled={loading}
                        style={{ background: 'none', border: 'none', color: T.red, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                        Rinvia codice
                      </button>}>
                      <Input id="reg-otp" icon="lock" type="text" inputMode="numeric" maxLength={6}
                        required autoComplete="one-time-code"
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="123456"/>
                      <div style={{ fontSize: 11, color: T.textSoft, marginTop: 6, lineHeight: 1.4 }}>
                        Non hai ricevuto l'SMS? Controlla il numero o riprova tra qualche secondo.
                      </div>
                    </Field>

                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button type="button" aria-label="Indietro" onClick={() => { setRegStep(1); clear(); setOtpCode(''); setOtpSent(false) }} style={{
                        padding: '14px 18px', minHeight: 48,
                        background: 'transparent', color: T.textMid,
                        border: `1.5px solid ${T.border}`, borderRadius: 12,
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        fontFamily: SANS, display: 'flex', alignItems: 'center', gap: 6,
                        flexShrink: 0,
                      }}>
                        <Icon name="arrowL" size={14} color={T.textMid}/>
                      </button>
                      <div style={{ flex: 1 }}>
                        <PrimaryBtn disabled={loading || otpCode.length !== 6}>
                          {loading ? 'Verifica…' : <>Verifica e continua <Icon name="arrowR" size={15} color="#FFF"/></>}
                        </PrimaryBtn>
                      </div>
                    </div>
                  </form>
                )}

                {regStep === 2 && (
                  <form onSubmit={handleRegistrazione}>
                    <Field label="Nome attività" htmlFor="reg-attivita">
                      <Input id="reg-attivita" icon="bag" required value={reg.nome_attivita} onChange={setR('nome_attivita')}
                        placeholder="Pasticceria Rossi"/>
                    </Field>

                    <Field label="Tipo di attività">
                      <div role="radiogroup" aria-label="Tipo di attività" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                        {TIPI_ATTIVITA.map(t => {
                          const selected = reg.tipo_attivita === t.slug
                          return (
                            <button key={t.slug} type="button"
                              onClick={() => setReg(p => ({ ...p, tipo_attivita: t.slug }))}
                              style={{
                                padding: '11px 12px', minHeight: 44,
                                background: selected ? T.ink : T.paper,
                                color: selected ? T.cream : T.textMid,
                                border: `1.5px solid ${selected ? T.ink : T.border}`,
                                borderRadius: 10, fontSize: 13, fontWeight: selected ? 700 : 500,
                                cursor: 'pointer', fontFamily: SANS,
                                transition: 'all 0.15s ease', textAlign: 'center',
                              }}>
                              {t.label}
                            </button>
                          )
                        })}
                      </div>
                    </Field>

                    <Field label="Città" htmlFor="reg-citta">
                      <CittaInput value={reg.citta} onChange={v => setReg(p => ({ ...p, citta: v }))}/>
                    </Field>

                    <Field label="Codice invito" htmlFor="reg-invito" hint="opzionale">
                      <Input id="reg-invito" value={reg.codice_invito} onChange={setR('codice_invito')}
                        placeholder="Lascia vuoto se non ce l'hai"/>
                    </Field>

                    <label style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, marginBottom: 4,
                      padding: '12px 14px', border: `1.5px solid ${reg.accept_terms ? T.ink : T.border}`,
                      borderRadius: 10, cursor: 'pointer', fontFamily: SANS, background: reg.accept_terms ? T.cream : 'transparent',
                      transition: 'all 0.15s ease',
                    }}>
                      <input
                        type="checkbox"
                        checked={!!reg.accept_terms}
                        onChange={e => setReg(p => ({ ...p, accept_terms: e.target.checked }))}
                        style={{ marginTop: 3, flexShrink: 0, cursor: 'pointer', accentColor: T.red }}
                      />
                      <span style={{ fontSize: 12.5, color: T.textMid, lineHeight: 1.55 }}>
                        Confermo di aver letto e di accettare i{' '}
                        <a href="/termini" target="_blank" rel="noreferrer" style={{ color: T.red, textDecoration: 'underline', fontWeight: 600 }}>Termini di servizio</a>
                        {' '}e la{' '}
                        <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: T.red, textDecoration: 'underline', fontWeight: 600 }}>Privacy Policy</a>.
                        Dichiaro di essere maggiorenne e di registrarmi per finalita' professionali (B2B).
                      </span>
                    </label>

                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <button type="button" aria-label="Indietro" onClick={() => { setRegStep(1); clear() }} style={{
                        padding: '14px 18px', minHeight: 48,
                        background: 'transparent', color: T.textMid,
                        border: `1.5px solid ${T.border}`, borderRadius: 12,
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        fontFamily: SANS, display: 'flex', alignItems: 'center', gap: 6,
                        flexShrink: 0,
                      }}>
                        <Icon name="arrowL" size={14} color={T.textMid}/>
                      </button>
                      <div style={{ flex: 1 }}>
                        <PrimaryBtn disabled={loading || !regStep2Valid()}>
                          {loading ? 'Creazione account…' : <>Crea il mio account <Icon name="arrowR" size={15} color="#FFF"/></>}
                        </PrimaryBtn>
                      </div>
                    </div>
                  </form>
                )}
              </>
            )
          )}
          </div>
          {/* /Card */}

          <p style={{
            textAlign: 'center', fontSize: 12, color: T.textSoft,
            marginTop: 22, lineHeight: 1.6,
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
