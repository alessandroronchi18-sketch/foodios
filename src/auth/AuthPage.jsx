import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import FoodosLogo from '../components/FoodosLogo'
import COMUNI_ITALIANI from '../lib/comuniItaliani'
import { temaPubblico, SERIF_PUBBLICO, SANS_PUBBLICO } from '../lib/temaPubblico'
import { font } from '../lib/theme'
import { useCaptcha } from './Captcha'

/* ────────────────────────────────────────────────────────────────────────────
   ACCESSO E REGISTRAZIONE

   Rivisto il 16/09/2026. È la prima schermata che il titolare vede ogni
   mattina, prima del caffè: deve chiedere due cose e togliersi di mezzo.
   Cosa non andava:

   1. Due strade per registrarsi sulla stessa schermata — la linguetta
      "Registrati" in cima alla scheda e il "Non hai un account? Registrati
      gratis" in fondo. Chi torna ogni giorno per accedere aveva metà della
      scheda occupata da un invito che non lo riguarda, e una linguetta
      "Accedi" già selezionata sopra un titolo che diceva di nuovo "Accedi".
   2. Sette bersagli su nove sotto i 44 px: la linguetta, "Dimenticata?",
      l'occhio della password. Sul telefono si sbaglia.
   3. Su un computer da 1440 px c'era una scheda da 460 px in mezzo al vuoto.

   Adesso: una colonna sola col modulo, e sul computer una seconda colonna
   scura con il marchio — così lo schermo largo serve a qualcosa. Niente
   linguette: si accede, e chi non ha l'account trova un link in fondo.
   Le misure di carattere vengono dalla scala di src/lib/theme.js.
─────────────────────────────────────────────────────────────────────────── */

const T = temaPubblico
const SERIF = SERIF_PUBBLICO
const SANS = SANS_PUBBLICO

// I gradini della scala di theme.js, con i nomi che servono qui.
// Sotto i 12 px non si scende.
const TESTO = {
  nota: font.size.sm,          // 12 — note, piè di modulo
  piccolo: font.size.base,     // 13 — etichette dei campi, errori
  corpo: font.size.md,         // 14 — testo corrente
  campo: font.size.lg,         // 16 — quello che si scrive dentro ai campi
  sottotitolo: font.size.xl,   // 18
  titolo: font.size['2xl'],    // 22
  grande: font.size['3xl'],    // 28 — il titolo della schermata
}

// L'altezza minima di tutto quello che si tocca. Sotto, il dito sbaglia.
const TOCCO = 48

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

// Prefissi telefonici internazionali - default Italia (+39)
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

// Gli errori di Supabase arrivano in inglese e tecnici. Qui diventano una
// frase che dice cosa fare, non cosa e' successo dentro.
function messaggioPassword(err) {
  const m = String(err?.message || '')
  if (/same.*password|should be different/i.test(m)) return 'Questa è già la tua password di adesso: scegline una diversa.'
  if (/weak|should be at least|too short/i.test(m)) return 'Password troppo corta: servono almeno 8 caratteri.'
  if (/expired|invalid.*token|not found/i.test(m)) return 'Questo link è scaduto. Chiedine uno nuovo dalla pagina di accesso.'
  if (/rate limit|too many/i.test(m)) return 'Hai riprovato troppe volte di fila. Aspetta qualche minuto.'
  if (/network|fetch|timeout/i.test(m)) return 'Connessione caduta a metà. Riprova.'
  return 'Non sono riuscito a salvare la password. Riprova fra un momento.'
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
  // Tre stati, non cinque: rosso finché manca il minimo, ambra mentre ci si
  // arriva, verde quando c'è tutto. Prima c'era anche un arancione scritto a
  // mano, un colore che nella tavolozza di Foodos non esiste.
  const barColor = score <= 2 ? T.danger : score <= 4 ? T.amber : T.green
  const label = score <= 2 ? 'Debole' : score <= 3 ? 'Discreta' : score === 4 ? 'Buona' : 'Ottima'

  const req = [
    [c.length,  '8 caratteri'],
    [c.upper,   'Maiuscola'],
    [c.lower,   'Minuscola'],
    [c.number,  'Numero'],
    [c.special, 'Simbolo'],
  ]

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 4, background: T.creamDeep, borderRadius: 999 }}>
          <div style={{ width: `${(score / 5) * 100}%`, height: '100%', background: barColor, borderRadius: 999, transition: 'all 0.3s' }}/>
        </div>
        <span style={{ fontSize: TESTO.nota, fontWeight: 700, color: barColor, minWidth: 52, textAlign: 'right' }}>{label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '4px 10px' }}>
        {req.map(([ok, txt]) => (
          <div key={txt} style={{ fontSize: TESTO.nota, color: ok ? T.green : T.textSoft, display: 'flex', alignItems: 'center', gap: 5, fontWeight: ok ? 600 : 500 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
              background: ok ? T.green : 'transparent', border: ok ? 'none' : `1.5px solid ${T.border}` }}/>{txt}
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
      borderRadius: 12, padding: '0 6px 0 14px', height: TOCCO,
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
          fontSize: TESTO.campo, color: T.ink, fontFamily: SANS, fontWeight: 500,
          padding: 0, minWidth: 0, width: '100%',
          // La cornice è alta 48, il campo dentro ne occupava 20 e stava in
          // mezzo: toccando il bordo alto o basso non si metteva a fuoco
          // niente. Sul telefono era un riquadro che si vede e non risponde.
          // `stretch` fa arrivare il campo ai due bordi: si tocca dove capita.
          alignSelf: 'stretch',
        }}
      />
      {type === 'password' && (
        // Era 24x24: si sbagliava a colpirlo, e chi sbaglia si ritrova la
        // password scritta in chiaro davanti al banco.
        <button type="button" tabIndex={-1}
          onClick={() => setShowPwd(s => !s)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: 0,
            color: T.textSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, flexShrink: 0, borderRadius: 10,
          }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 7, minHeight: 20 }}>
          <label htmlFor={htmlFor} style={{ fontSize: TESTO.piccolo, fontWeight: 600, color: T.textMid }}>{label}</label>
          {hint}
        </div>
      )}
      {children}
      {error && (
        <div style={{ fontSize: TESTO.piccolo, color: T.danger, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
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
        width: '100%', minHeight: TOCCO, padding: '12px 20px',
        background: disabled ? T.creamDeep : h ? T.redDeep : T.red,
        color: disabled ? T.textSoft : T.textOnDark,
        border: 'none', borderRadius: 12,
        fontSize: TESTO.campo, fontWeight: 700, fontFamily: SANS,
        letterSpacing: '-0.005em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: disabled ? 'none' : h ? '0 12px 30px rgba(110,14,26,0.26)' : '0 6px 18px rgba(110,14,26,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        ...style,
      }}
    >{children}</button>
  )
}

// Il link discreto: testo, niente riquadro, ma alto quanto un bersaglio.
function LinkBtn({ children, onClick, colore = T.red, style }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px',
      minHeight: 44, color: colore, fontFamily: SANS,
      fontSize: TESTO.piccolo, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      ...style,
    }}>{children}</button>
  )
}

function CittaInput({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(value)
  const [hi, setHi] = useState(0)
  const ref = useRef(null)

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
      <Input id="reg-citta" icon="map" value={q} placeholder="Es. Torino" required autoComplete="off"
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
                display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 16px',
                fontSize: TESTO.corpo, cursor: 'pointer',
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
      borderRadius: 12, height: TOCCO, padding: 0,
      boxSizing: 'border-box', width: '100%', minWidth: 0,
      boxShadow: focused ? `0 0 0 4px ${T.creamDeep}` : 'none',
      transition: 'all 0.18s ease', position: 'relative',
    }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        aria-label={`Prefisso ${sel.code}, ${sel.label}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 10px 0 12px', background: 'transparent',
          border: 'none', borderRight: `1px solid ${T.border}`,
          fontSize: TESTO.corpo, color: T.ink, fontWeight: 600, cursor: 'pointer',
          fontFamily: SANS, minWidth: 84,
        }}>
        <span>{sel.code}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.textSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 140ms' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <input
        id="reg-tel"
        type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={15}
        value={numero}
        onChange={e => onNumero(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="333 1234567"
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none',
          background: 'transparent', fontSize: TESTO.campo, color: T.ink,
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
                minHeight: 44, padding: '0 14px',
                background: p.code === prefisso ? T.cream : 'transparent',
                border: 'none', cursor: 'pointer', fontSize: TESTO.corpo, fontFamily: SANS,
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
      fontSize: TESTO.piccolo, color: T.danger, lineHeight: 1.5,
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
      fontSize: TESTO.piccolo, color: T.green, lineHeight: 1.5,
    }}>
      <Icon name="checkCirc" size={16} color={T.green}/>
      <span>{children}</span>
    </div>
  )
}

/* ── l'impaginazione ─────────────────────────────────────────────────────── */

// Due colonne sul computer, una sul telefono. A sinistra il marchio, a destra
// il modulo: lo schermo largo smette di essere vuoto e il modulo resta della
// sua misura, quella giusta per leggere una riga di campi.
function Schermata({ children, isMobile, titolo, sotto }) {
  return (
    <div style={{
      minHeight: '100vh', background: T.paper, fontFamily: SANS, color: T.ink,
      WebkitFontSmoothing: 'antialiased',
      display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '5fr 7fr',
    }}>
      {!isMobile && <ColonnaMarchio/>}

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: isMobile ? '28px 20px 40px' : '48px 40px',
        minWidth: 0,
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {isMobile && (
            <a href="/" aria-label="Torna alla pagina di Foodos" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              textDecoration: 'none', marginBottom: 28, minHeight: 44,
            }}>
              <FoodosLogo size={34} style={{ borderRadius: 9 }}/>
              <span style={{ fontFamily: SERIF, fontSize: TESTO.titolo, fontWeight: 600, color: T.ink, letterSpacing: '-0.03em' }}>Foodos</span>
            </a>
          )}

          <h1 style={{
            fontFamily: SERIF, fontSize: TESTO.grande, fontWeight: 600, color: T.ink,
            letterSpacing: '-0.03em', lineHeight: 1.15, margin: 0,
          }}>{titolo}</h1>
          {sotto && (
            <p style={{ fontSize: TESTO.corpo, color: T.textMid, margin: '8px 0 0', lineHeight: 1.55 }}>{sotto}</p>
          )}

          <div style={{ marginTop: 26 }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

function ColonnaMarchio() {
  return (
    <div style={{
      background: T.ink, color: T.textOnDark, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '48px 44px',
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle at 20% 0%, rgba(110,14,26,0.30), transparent 60%)',
      }}/>

      <a href="/" aria-label="Torna alla pagina di Foodos" style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 12,
        textDecoration: 'none', alignSelf: 'flex-start', minHeight: 44,
      }}>
        <FoodosLogo size={38} style={{ borderRadius: 10 }}/>
        <span style={{ fontFamily: SERIF, fontSize: TESTO.titolo, fontWeight: 600, color: T.cream, letterSpacing: '-0.03em' }}>Foodos</span>
      </a>

      <p style={{
        position: 'relative', fontFamily: SERIF, fontSize: TESTO.grande, fontWeight: 500,
        color: T.cream, letterSpacing: '-0.03em', lineHeight: 1.2,
        margin: '40px 0', maxWidth: 380,
      }}>
        Apri la mattina e i numeri di ieri
        <em style={{ fontStyle: 'italic', color: T.amber }}> sono già fatti.</em>
      </p>

      <div style={{ position: 'relative', fontSize: TESTO.piccolo, color: 'rgba(244,236,227,0.55)', lineHeight: 1.6 }}>
        Problemi con l&apos;accesso? Scrivi a{' '}
        <a href="mailto:support@foodos.it" style={{ color: T.cream, textDecoration: 'none', borderBottom: '1px solid rgba(244,236,227,0.4)' }}>
          support@foodos.it
        </a>
      </div>
    </div>
  )
}

/* ── la pagina "scegli una nuova password" (arrivo dal link via email) ───── */

export function ResetPasswordPage({ onDone }) {
  const isMobile = useIsMobile()
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
      setErrore('Alla password manca ancora qualcosa: guarda i pallini qui sotto.'); return
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
      setErrore(messaggioPassword(err))
    } finally { setLoading(false) }
  }

  return (
    <Schermata isMobile={isMobile}
      titolo={successo ? 'Password aggiornata' : 'Scegli la nuova password'}
      sotto={successo ? 'Fra un momento ti riportiamo alla pagina di accesso.' : 'Otto caratteri, una maiuscola, un numero e un simbolo.'}>
      {errore && <ErrorAlert>{errore}</ErrorAlert>}
      {successo ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: T.greenSoft, borderRadius: 12, padding: '14px 16px',
          fontSize: TESTO.corpo, color: T.green, fontWeight: 600,
        }}>
          <Icon name="checkCirc" size={20} color={T.green}/> Fatto.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <Field label="Nuova password" htmlFor="reset-newpwd">
            <Input id="reset-newpwd" icon="lock" type="password" required value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder="••••••••" autoComplete="new-password"/>
            <PasswordStrength password={pwd}/>
          </Field>
          <Field label="Ripeti la password" htmlFor="reset-confpwd"
            error={conf && pwd !== conf ? 'Le due password non sono uguali' : null}>
            <Input id="reset-confpwd" icon="lock" type="password" required value={conf}
              onChange={e => setConf(e.target.value)}
              placeholder="••••••••" autoComplete="new-password"/>
          </Field>
          <PrimaryBtn disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Salvataggio…' : <>Salva la password <Icon name="arrowR" size={15} color={T.textOnDark}/></>}
          </PrimaryBtn>
        </form>
      )}
    </Schermata>
  )
}

/* ── accesso e registrazione ─────────────────────────────────────────────── */

export default function AuthPage({ onSignIn, onSignUp, initialReferralCode = '', initialMode = null }) {
  const isMobile = useIsMobile()
  // mode: 'login' | 'registrati' | 'reset-request' | 'reset-password'
  const [mode, setMode] = useState(initialMode || (initialReferralCode ? 'registrati' : 'login'))
  const [regStep, setRegStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState('')
  const [msg, setMsg] = useState('')
  const [emailEsistente, setEmailEsistente] = useState('')  // email già registrata in fase di signup

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPwd, setLoginPwd]     = useState('')

  // Fino al 15/09/2026 qui c'era un secondo blocco, tenuto nel browser: dopo 5
  // errori scriveva una scadenza in localStorage e non lasciava più premere
  // "Accedi" per un quarto d'ora. Non fermava nessuno — chi attacca non usa il
  // nostro modulo, e in ogni caso bastava svuotare i dati del sito — mentre
  // chiudeva fuori sul serio il titolare che aveva appena ricordato la
  // password giusta, e il blocco gli restava addosso anche riaprendo il
  // browser. Il conto serio lo tiene il server (api/login-guard), che sa
  // distinguere il tempo fra un tentativo e l'altro. Qui non si tiene niente.

  const [resetEmail, setResetEmail] = useState('')
  const [newPwd, setNewPwd]         = useState('')
  const [newPwdConf, setNewPwdConf] = useState('')

  const [reg, setReg] = useState({
    nome: '', cognome: '', prefisso: '+39', telefono: '', nome_attivita: '',
    tipo_attivita: 'pasticceria', citta: '',
    email: '', password: '', codice_invito: initialReferralCode,
    accept_terms: false,
  })
  const [successo, setSuccesso] = useState(false)

  // Il controllo "sei una persona?". Senza VITE_TURNSTILE_SITE_KEY non disegna
  // niente e `pronto` è sempre vero: la pagina si comporta come prima.
  const { token: captchaToken, pronto: captchaPronto, reset: resetCaptcha, Widget: Captcha } = useCaptcha()

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

  // Quanto manca, detto come lo direbbe una persona.
  function quandoRiprovare(secondi) {
    const s = Math.max(1, Math.ceil(secondi))
    if (s < 60) return `${s} second${s === 1 ? 'o' : 'i'}`
    const m = Math.ceil(s / 60)
    return `${m} minut${m === 1 ? 'o' : 'i'}`
  }

  async function handleLogin(e) {
    e.preventDefault(); clear()
    setLoading(true)
    try {
      // Il server tiene il conto degli errori recenti e dice se bisogna
      // aspettare. Attesa progressiva, non muro: dopo i primi errori servono
      // pochi secondi, e solo insistendo si allunga. Il messaggio deve dirlo
      // con calma — chi ha appena sbagliato la password non deve sentirsi
      // accusato di essere un intruso.
      try {
        const guard = await fetch('/api/login-guard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check', email: loginEmail }),
        })
        if (guard.status === 423) {
          const j = await guard.json().catch(() => ({}))
          const sec = Math.max(1, Number(j.retryAfter) || 5)
          setErrore(sec <= 60
            ? `Aspetta ${quandoRiprovare(sec)} e riprova.`
            : `Hai sbagliato password più volte. Riprova fra ${quandoRiprovare(sec)}, oppure usa "Password dimenticata" qui sotto per rifarla.`)
          setLoading(false)
          return
        }
      } catch { /* guardiano giù: si va avanti, il limite di Supabase resta */ }

      await onSignIn(loginEmail, loginPwd, captchaToken || undefined)
      fetch('/api/login-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'success', email: loginEmail }),
      }).catch(() => {})
    } catch (err) {
      fetch('/api/login-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fail', email: loginEmail }),
      }).catch(() => {})
      setErrore(err.message)
      // Un captcha si usa una volta sola: dopo un tentativo fallito ne serve
      // uno nuovo, altrimenti il secondo "Accedi" viene rifiutato.
      resetCaptcha()
    } finally { setLoading(false) }
  }

  async function handleResetRequest(e) {
    e.preventDefault(); clear(); setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        // Era inchiodato all'indirizzo di Vercel: il link di reimpostazione
        // portava sempre lì, anche a chi aveva aperto Foodos altrove.
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        ...(captchaToken ? { captchaToken } : {}),
      })
      if (error) throw error
      // Non si dice mai se quell'indirizzo ha un account: sarebbe un modo per
      // scoprire chi è cliente di Foodos provando indirizzi a caso.
      setMsg(`Se ${resetEmail} ha un account, fra poco arriva il link per rifare la password. Controlla anche nello spam.`)
    } catch (err) {
      // Anche in caso di errore vero (rete, limite del provider) non si
      // racconta al visitatore cosa è successo dentro.
      setMsg(`Se ${resetEmail} ha un account, fra poco arriva il link per rifare la password. Controlla anche nello spam.`)
      if (import.meta.env?.DEV) console.warn('[reset password]', err?.message)
      resetCaptcha()
    } finally { setLoading(false) }
  }

  async function handleNewPassword(e) {
    e.preventDefault(); clear()
    const c = checkPwd(newPwd)
    if (!Object.values(c).every(Boolean)) {
      setErrore('Alla password manca ancora qualcosa: guarda i pallini qui sotto.'); return
    }
    if (newPwd !== newPwdConf) { setErrore('Le password non coincidono'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd })
      if (error) throw error
      setMsg('Password aggiornata. Adesso puoi entrare.')
      setMode('login')
    } catch (err) {
      setErrore(messaggioPassword(err))
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
  const NAME_RX = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/
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

  // Il passo di verifica del telefono via SMS è stato tolto il 15/09/2026.
  //
  // Chiedeva a Supabase un accesso via codice SMS con l'opzione "non creare
  // l'utente se non esiste". Ma in registrazione l'utente NON esiste ancora,
  // per definizione: quindi la chiamata falliva sempre e il codice andava
  // dritto al passo 2. Quel passo non poteva riuscire nemmeno una volta. In
  // compenso faceva due cose che non doveva:
  //
  //   - diceva se un numero è già registrato. Se il numero apparteneva a un
  //     utente, l'SMS partiva e compariva il campo del codice; se no, si
  //     saltava al passo 2. Bastava guardare quale delle due schermate usciva
  //     per sapere se una persona ha un account Foodos.
  //   - faceva partire una richiesta SMS vera a ogni registrazione, con il
  //     costo e i limiti che comporta.
  //
  // Il numero si continua a raccogliere e a salvare: serve per il riepilogo
  // della sera su WhatsApp. Semplicemente non si finge di averlo verificato.
  function nextRegStep(e) {
    e.preventDefault(); clear()
    if (!isNomeValido(reg.nome)) { setErrore('Il nome deve contenere almeno 3 lettere.'); return }
    if (!isCognomeValido(reg.cognome)) { setErrore('Il cognome deve contenere almeno 2 lettere.'); return }
    if (!isEmailValida(reg.email)) { setErrore('Inserisci un indirizzo email valido.'); return }
    if (!isNumeroValido(reg.telefono)) { setErrore('Il numero di telefono non sembra giusto: servono dalle 6 alle 15 cifre.'); return }
    if (!Object.values(checkPwd(reg.password)).every(Boolean)) {
      setErrore('La password non ha ancora tutto quello che serve: guarda i pallini qui sotto.'); return
    }
    setRegStep(2)
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

      await onSignUp(reg.email, reg.password, captchaToken || undefined, {
        nome_completo: `${reg.nome.trim()} ${reg.cognome.trim()}`.trim(),
        nome_attivita: reg.nome_attivita,
        tipo_attivita: reg.tipo_attivita, // già uno slug stabile (vedi TIPI_ATTIVITA)
        citta: reg.citta,
        telefono: telNorm,
        telefono_verificato: false,
        ...(reg.codice_invito.trim() && { codice_invito: reg.codice_invito.trim() }),
      })
      setSuccesso(true)
    } catch (err) {
      if (err.message === 'EMAIL_ESISTENTE') setEmailEsistente(reg.email)
      else setErrore(err.message)
      resetCaptcha()
    } finally { setLoading(false) }
  }

  // Titolo e sottotitolo della schermata: uno solo, mai ripetuto dentro.
  const intestazione = {
    'login': ['Accedi', null],
    'reset-request': ['Password dimenticata', 'Ti mandiamo un link per rifarla.'],
    'reset-password': ['Scegli la nuova password', 'Otto caratteri, una maiuscola, un numero e un simbolo.'],
  }[mode] || (successo
    ? ['Controlla la posta', null]
    : regStep === 1
      ? ['Crea il tuo account', 'Trenta secondi, poi tre mesi di prova.']
      : ['La tua attività', 'Ultimo passo, poi entri.'])

  return (
    <Schermata isMobile={isMobile} titolo={intestazione[0]} sotto={intestazione[1]}>

      {errore && <ErrorAlert>{errore}</ErrorAlert>}
      {msg && <SuccessAlert>{msg}</SuccessAlert>}

      {mode === 'login' && (
        <form onSubmit={handleLogin}>
          <Field label="Email" htmlFor="login-email">
            <Input id="login-email" icon="mail" type="email" required value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              placeholder="tua@email.com" autoComplete="email"/>
          </Field>
          <Field label="Password" htmlFor="login-pwd">
            <Input id="login-pwd" icon="lock" type="password" required value={loginPwd}
              onChange={e => setLoginPwd(e.target.value)}
              placeholder="••••••••" autoComplete="current-password"/>
          </Field>
          <Captcha />
          <PrimaryBtn disabled={loading || !captchaPronto}>
            {loading ? 'Un momento…' : <>Entra <Icon name="arrowR" size={15} color={T.textOnDark}/></>}
          </PrimaryBtn>

          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            justifyContent: 'space-between', gap: 8, marginTop: 10,
          }}>
            <LinkBtn colore={T.textMid} onClick={() => { setMode('reset-request'); clear() }}>
              Password dimenticata
            </LinkBtn>
            <LinkBtn onClick={() => { setMode('registrati'); setRegStep(1); clear() }}>
              Crea un account
            </LinkBtn>
          </div>

          {isMobile && <PiedeAiuto/>}
        </form>
      )}

      {mode === 'reset-request' && (
        <form onSubmit={handleResetRequest}>
          <Field label="Email" htmlFor="reset-email">
            <Input id="reset-email" icon="mail" type="email" required value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              placeholder="tua@email.com" autoComplete="email"/>
          </Field>
          <Captcha />
          <PrimaryBtn disabled={loading || !captchaPronto}>
            {loading ? 'Invio in corso…' : <>Mandami il link <Icon name="arrowR" size={15} color={T.textOnDark}/></>}
          </PrimaryBtn>
          <div style={{ marginTop: 10 }}>
            <LinkBtn colore={T.textMid} onClick={() => { setMode('login'); clear() }}>
              <Icon name="arrowL" size={14} color={T.textMid}/> Torna all&apos;accesso
            </LinkBtn>
          </div>
          {isMobile && <PiedeAiuto/>}
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
          <Field label="Ripeti la password" htmlFor="rp-confpwd"
            error={newPwdConf && newPwd !== newPwdConf ? 'Le due password non sono uguali' : null}>
            <Input id="rp-confpwd" icon="lock" type="password" required value={newPwdConf}
              onChange={e => setNewPwdConf(e.target.value)}
              placeholder="••••••••" autoComplete="new-password"/>
          </Field>
          <PrimaryBtn disabled={loading}>
            {loading ? 'Salvataggio…' : <>Salva la password <Icon name="arrowR" size={15} color={T.textOnDark}/></>}
          </PrimaryBtn>
        </form>
      )}

      {emailEsistente && (
        <div onClick={() => setEmailEsistente('')} style={{ position: 'fixed', inset: 0, background: 'rgba(15,9,7,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.paper, borderRadius: 18, padding: isMobile ? '24px 20px' : '28px 26px', maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: T.redSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="mail" size={22} color={T.red} /></div>
            <div style={{ fontFamily: SERIF, fontSize: TESTO.sottotitolo, fontWeight: 600, color: T.ink, marginBottom: 8 }}>Questa email è già registrata</div>
            <div style={{ fontSize: TESTO.corpo, color: T.textMid, lineHeight: 1.55, marginBottom: 20, wordBreak: 'break-word' }}>
              L&apos;indirizzo <b style={{ color: T.ink }}>{emailEsistente}</b> ha già un account. Entra con la tua password, oppure rifalla se non te la ricordi.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PrimaryBtn type="button" onClick={() => { setMode('login'); setLoginEmail(emailEsistente); clear() }}>Vai all&apos;accesso</PrimaryBtn>
              <button type="button" onClick={() => { setMode('reset-request'); setResetEmail(emailEsistente); clear() }} style={{ minHeight: TOCCO, padding: '12px', background: 'transparent', color: T.red, border: `1px solid ${T.border}`, borderRadius: 12, fontWeight: 600, fontSize: TESTO.corpo, fontFamily: SANS, cursor: 'pointer' }}>Rifai la password</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'registrati' && (
        successo ? (
          <div>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              background: T.greenSoft, borderRadius: 12, padding: '16px 18px',
              fontSize: TESTO.corpo, color: T.ink, lineHeight: 1.6,
            }}>
              <span style={{ marginTop: 2 }}><Icon name="mail" size={20} color={T.green}/></span>
              <span>
                Abbiamo mandato un link di conferma a <strong>{reg.email}</strong>.
                Aprilo e l&apos;account è attivo.
              </span>
            </div>
            <p style={{ fontSize: TESTO.piccolo, color: T.textSoft, lineHeight: 1.6, margin: '14px 0 0' }}>
              Non lo vedi? Guarda nello spam, o aspetta qualche minuto.
            </p>
            {isMobile && <PiedeAiuto/>}
          </div>
        ) : (
          <>
            {/* Due passi, e si vede a che punto si è. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <StepDot active={regStep === 1} done={regStep > 1}>1</StepDot>
              <div style={{ flex: 1, height: 1.5, background: regStep > 1 ? T.ink : T.border, transition: 'background 0.3s' }}/>
              <StepDot active={regStep === 2} done={false}>2</StepDot>
            </div>

            {regStep === 1 && (
              <form onSubmit={nextRegStep}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
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
                  error={reg.email && !isEmailValida(reg.email) ? 'Questo indirizzo non sembra giusto.' : null}>
                  <Input id="reg-email" icon="mail" type="email" required value={reg.email} onChange={setR('email')}
                    placeholder="tua@email.com" autoComplete="email"/>
                </Field>
                <Field label="Telefono" htmlFor="reg-tel"
                  hint={<span style={{ fontSize: TESTO.nota, color: T.textSoft }}>serve per il riepilogo della sera</span>}
                  error={reg.telefono && !isNumeroValido(reg.telefono) ? 'Servono dalle 6 alle 15 cifre.' : null}>
                  <PhoneInput
                    prefisso={reg.prefisso}
                    numero={reg.telefono}
                    onPrefisso={v => setReg(p => ({ ...p, prefisso: v }))}
                    onNumero={v => setReg(p => ({ ...p, telefono: v }))}
                  />
                </Field>
                <Field label="Password" htmlFor="reg-pwd">
                  <Input id="reg-pwd" icon="lock" type="password" required value={reg.password} onChange={setR('password')}
                    placeholder="••••••••" autoComplete="new-password"/>
                  <PasswordStrength password={reg.password}/>
                </Field>
                <PrimaryBtn type="submit" disabled={loading || !regStep1Valid()} style={{ marginTop: 8 }}>
                  Continua <Icon name="arrowR" size={15} color={regStep1Valid() ? T.textOnDark : T.textSoft}/>
                </PrimaryBtn>

                <div style={{ marginTop: 10 }}>
                  <LinkBtn colore={T.textMid} onClick={() => { setMode('login'); clear() }}>
                    <Icon name="arrowL" size={14} color={T.textMid}/> Ho già un account
                  </LinkBtn>
                </div>
                {isMobile && <PiedeAiuto/>}
              </form>
            )}

            {regStep === 2 && (
              <form onSubmit={handleRegistrazione}>
                <Field label="Nome dell'attività" htmlFor="reg-attivita">
                  <Input id="reg-attivita" icon="bag" required value={reg.nome_attivita} onChange={setR('nome_attivita')}
                    placeholder="Pasticceria Rossi"/>
                </Field>

                <Field label="Che cosa fate">
                  <div role="radiogroup" aria-label="Tipo di attività" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {TIPI_ATTIVITA.map(t => {
                      const selected = reg.tipo_attivita === t.slug
                      return (
                        <button key={t.slug} type="button"
                          role="radio" aria-checked={selected}
                          onClick={() => setReg(p => ({ ...p, tipo_attivita: t.slug }))}
                          style={{
                            padding: '10px 12px', minHeight: 44,
                            background: selected ? T.ink : T.paper,
                            color: selected ? T.cream : T.textMid,
                            border: `1.5px solid ${selected ? T.ink : T.border}`,
                            borderRadius: 10, fontSize: TESTO.piccolo, fontWeight: selected ? 700 : 500,
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

                <Field label="Codice invito" htmlFor="reg-invito"
                  hint={<span style={{ fontSize: TESTO.nota, color: T.textSoft }}>se ce l&apos;hai</span>}>
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
                    style={{ marginTop: 3, flexShrink: 0, cursor: 'pointer', accentColor: T.red, width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: TESTO.nota, color: T.textMid, lineHeight: 1.55 }}>
                    Ho letto e accetto i{' '}
                    <a href="/termini" target="_blank" rel="noreferrer" style={{ color: T.red, textDecoration: 'underline', fontWeight: 600 }}>Termini di servizio</a>
                    {' '}e la{' '}
                    <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: T.red, textDecoration: 'underline', fontWeight: 600 }}>Privacy Policy</a>.
                    Sono maggiorenne e mi registro per lavoro.
                  </span>
                </label>

                <Captcha style={{ marginTop: 14, marginBottom: 0 }} />

                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button type="button" aria-label="Torna al passo precedente" onClick={() => { setRegStep(1); clear() }} style={{
                    width: TOCCO, minHeight: TOCCO,
                    background: 'transparent', color: T.textMid,
                    border: `1.5px solid ${T.border}`, borderRadius: 12,
                    cursor: 'pointer', fontFamily: SANS, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name="arrowL" size={16} color={T.textMid}/>
                  </button>
                  <div style={{ flex: 1 }}>
                    <PrimaryBtn disabled={loading || !regStep2Valid() || !captchaPronto}>
                      {loading ? 'Ci siamo…' : <>Crea l&apos;account <Icon name="arrowR" size={15} color={T.textOnDark}/></>}
                    </PrimaryBtn>
                  </div>
                </div>
                {isMobile && <PiedeAiuto/>}
              </form>
            )}
          </>
        )
      )}
    </Schermata>
  )
}

// Sul telefono non c'è la colonna scura: l'indirizzo dell'assistenza va messo
// in fondo al modulo, altrimenti chi resta fuori non sa a chi scrivere.
function PiedeAiuto() {
  return (
    <p style={{
      textAlign: 'center', fontSize: TESTO.nota, color: T.textSoft,
      margin: '24px 0 0', lineHeight: 1.6,
    }}>
      Non riesci a entrare? Scrivi a{' '}
      <a href="mailto:support@foodos.it" style={{ color: T.red, fontWeight: 600, textDecoration: 'none' }}>
        support@foodos.it
      </a>
    </p>
  )
}

function StepDot({ active, done, children }) {
  const acceso = active || done
  return (
    <div style={{
      width: 26, height: 26, borderRadius: 999,
      background: acceso ? T.ink : T.paper,
      color: acceso ? T.cream : T.textSoft,
      border: `1.5px solid ${acceso ? T.ink : T.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: TESTO.nota, fontWeight: 700, fontFamily: SANS,
      transition: 'all 0.2s ease', flexShrink: 0,
    }}>
      {done ? <Icon name="check" size={13} color={T.cream} stroke={2.5}/> : children}
    </div>
  )
}
