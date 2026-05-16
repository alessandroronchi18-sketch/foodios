import React, { useEffect, useRef, useState } from 'react'
import Logo from '../components/Logo'


/* ────────────────────────────────────────────────────────────────────────────
   DESIGN TOKENS — warm italian premium
─────────────────────────────────────────────────────────────────────────── */
const T = {
  cream:      '#FBF8F4',
  creamDeep:  '#F4ECE3',
  paper:      '#FFFFFF',
  ink:        '#0F0907',
  inkSoft:    '#1A0F0D',
  text:       '#0F0907',
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
  borderSoft: '#F4ECE3',
}

const SERIF = "'Fraunces', 'Iowan Old Style', 'Apple Garamond', Georgia, serif"
const SANS  = "'Inter', system-ui, -apple-system, sans-serif"

/* ────────────────────────────────────────────────────────────────────────────
   HOOKS
─────────────────────────────────────────────────────────────────────────── */
function useReveal(threshold = 0.12) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, visible]
}

function useIsMobile(bp = 860) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false)
  useEffect(() => {
    const onR = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [bp])
  return m
}

function Reveal({ children, delay = 0, style }) {
  const [ref, visible] = useReveal()
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(20px)',
      transition: `opacity 0.7s ${delay}ms cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s ${delay}ms cubic-bezier(0.16, 1, 0.3, 1)`,
      ...style,
    }}>{children}</div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   ICONS
─────────────────────────────────────────────────────────────────────────── */
const Icon = ({ name, size = 18, color = 'currentColor', stroke = 1.6 }) => {
  const i = {
    arrowR:    <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 5 19 12 13 19" fill="none"/></>,
    check:     <polyline points="20 6 9 17 4 12" fill="none"/>,
    checkCirc: <><circle cx="12" cy="12" r="9.5" fill="none"/><polyline points="8 12 11 15 16 9" fill="none"/></>,
    chevDown:  <polyline points="6 9 12 15 18 9" fill="none"/>,
    chart:     <><path d="M4 19h16M4 14l4-4 4 3 6-7" fill="none"/></>,
    receipt:   <><path d="M5 3v18l3-2 3 2 3-2 3 2 3-2V3H5z" fill="none"/><line x1="9" y1="9" x2="17" y2="9"/><line x1="9" y1="13" x2="17" y2="13"/></>,
    clock:     <><circle cx="12" cy="12" r="9" fill="none"/><polyline points="12 7 12 12 15 14" fill="none"/></>,
    sparkles:  <><path d="M12 3l1.5 5 5 1.5-5 1.5-1.5 5-1.5-5-5-1.5 5-1.5z" fill="none"/><path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill="none"/></>,
    play:      <polygon points="8 5 19 12 8 19" />,
    star:      <polygon points="12 2 14.5 8.5 21 9 16 13.5 17.5 20 12 16.5 6.5 20 8 13.5 3 9 9.5 8.5" />,
    boltSm:    <polygon points="13 2 4 13 11 13 10 22 20 10 13 10 13 2" />,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      {i[name]}
    </svg>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   BUTTON
─────────────────────────────────────────────────────────────────────────── */
function Button({ children, variant = 'primary', onClick, style, size = 'md' }) {
  const [h, setH] = useState(false)
  const px = size === 'lg' ? '16px 28px' : size === 'sm' ? '9px 18px' : '13px 22px'
  const fs = size === 'lg' ? 15 : size === 'sm' ? 13 : 14

  const styles = {
    primary: {
      background: h ? T.redDeep : T.red,
      color: '#FFF',
      border: `1px solid ${h ? T.redDeep : T.red}`,
      boxShadow: h ? '0 8px 28px rgba(192,57,43,0.28)' : '0 4px 14px rgba(192,57,43,0.18)',
    },
    secondary: {
      background: h ? T.creamDeep : 'transparent',
      color: T.ink,
      border: `1px solid ${T.border}`,
      boxShadow: 'none',
    },
    ghost: { background: 'transparent', color: T.ink, border: 'none', boxShadow: 'none' },
    light: {
      background: h ? T.cream : T.paper,
      color: T.ink,
      border: `1px solid ${h ? T.cream : T.paper}`,
      boxShadow: h ? '0 10px 30px rgba(15,9,7,0.18)' : '0 4px 16px rgba(15,9,7,0.10)',
    },
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        padding: px, fontSize: fs, fontWeight: 600, fontFamily: SANS,
        borderRadius: 999, letterSpacing: '-0.005em',
        cursor: 'pointer', transition: 'all 0.2s ease',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        ...styles[variant], ...style,
      }}
    >{children}</button>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   DASHBOARD PREVIEW
─────────────────────────────────────────────────────────────────────────── */
function DashboardPreview() {
  return (
    <div style={{
      background: T.paper, borderRadius: 18, overflow: 'hidden',
      boxShadow: '0 30px 80px rgba(15,9,7,0.18), 0 8px 24px rgba(15,9,7,0.08), 0 0 0 1px rgba(15,9,7,0.04)',
      maxWidth: 640, width: '100%',
    }}>
      <div style={{
        background: T.cream, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E66B5A' }}/>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E6BD5A' }}/>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#5AB877' }}/>
        <div style={{ flex: 1, height: 22, borderRadius: 6, background: T.paper, marginLeft: 10,
          display:'flex', alignItems:'center', padding:'0 10px',
          fontSize: 10, color: T.textSoft, letterSpacing:'0.02em',
          border: `1px solid ${T.border}`,
        }}>app.foodos.it · Pasticceria del Corso</div>
      </div>

      <div style={{ display: 'flex', background: T.cream }}>
        <div style={{
          width: 150, background: T.inkSoft, padding: '16px 0',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          <div style={{ padding: '0 14px 14px', borderBottom: '1px solid rgba(244,236,227,0.08)', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <Logo size={22} style={{ borderRadius: 5 }}/>
            <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14, color: T.cream, letterSpacing: '-0.02em' }}>FoodOS</span>
          </div>
          {[
            ['Dashboard', true],
            ['Ricettario', false],
            ['Produzione', false],
            ['P&L', false],
            ['Magazzino', false],
            ['Fornitori', false],
            ['AI Assistant', false],
          ].map(([n, active], i) => (
            <div key={i} style={{
              padding: '8px 14px',
              fontSize: 11, fontWeight: active ? 600 : 400,
              color: active ? '#FFF' : 'rgba(244,236,227,0.55)',
              background: active ? T.red : 'transparent',
              borderRadius: active ? '0 18px 18px 0' : 0,
              letterSpacing: '0.005em',
            }}>{n}</div>
          ))}
        </div>

        <div style={{ flex: 1, padding: '18px 20px', minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
            Mercoledì · 13 maggio
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: T.ink, letterSpacing: '-0.02em', marginBottom: 14 }}>
            Buongiorno, Marco
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { l: 'Ricavi oggi', v: '€ 847',  sub: '+12%' },
              { l: 'Food cost',   v: '26,8%',  sub: 'target 30%' },
              { l: 'Margine',     v: '€ 618',  sub: '73% ricavo' },
            ].map((k, i) => (
              <div key={i} style={{ background: T.paper, borderRadius: 10, border: `1px solid ${T.border}`, padding: '9px 11px' }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{k.l}</div>
                <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: T.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>{k.v}</div>
                <div style={{ fontSize: 9, color: T.green, marginTop: 4, fontWeight: 600 }}>↑ {k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ background: T.paper, borderRadius: 10, border: `1px solid ${T.border}`, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.ink }}>Ricette più redditizie</div>
              <div style={{ fontSize: 8, color: T.textSoft }}>maggio 2026</div>
            </div>
            {[
              { n: 'Sfogliatella riccia classica', fc: '24%', m: '€ 2,15' },
              { n: 'Crostata frutta fresca',        fc: '31%', m: '€ 5,40' },
              { n: 'Babà al rum',                   fc: '19%', m: '€ 1,85' },
            ].map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 0',
                borderTop: i > 0 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div style={{ width: 5, height: 18, borderRadius: 4, background: i === 0 ? T.red : i === 1 ? T.amber : T.green }}/>
                  <div style={{ fontSize: 10, color: T.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.n}</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: T.textSoft }}>FC <span style={{ color: T.ink, fontWeight: 700 }}>{r.fc}</span></div>
                  <div style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 700, color: T.ink }}>{r.m}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function FloatBadge({ children, style }) {
  return (
    <div style={{
      position: 'absolute',
      background: T.paper, border: `1px solid ${T.border}`,
      borderRadius: 14, boxShadow: '0 14px 32px rgba(15,9,7,0.10)',
      padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      ...style,
    }}>{children}</div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   FAQ ITEM
─────────────────────────────────────────────────────────────────────────── */
function Faq({ q, a, open, onToggle }) {
  return (
    <div style={{ borderTop: `1px solid ${T.border}` }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '22px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        fontFamily: SANS, color: T.ink, gap: 16,
      }}>
        <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>{q}</span>
        <span style={{
          width: 32, height: 32, borderRadius: 999, border: `1px solid ${T.border}`,
          background: open ? T.ink : 'transparent',
          color: open ? T.cream : T.ink,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'all 0.2s ease',
          flexShrink: 0,
        }}>
          <Icon name="chevDown" size={14} color={open ? T.cream : T.ink}/>
        </span>
      </button>
      <div style={{
        maxHeight: open ? 400 : 0, overflow: 'hidden',
        transition: 'max-height 0.35s ease, opacity 0.3s ease',
        opacity: open ? 1 : 0,
      }}>
        <div style={{ fontSize: 15, color: T.textMid, lineHeight: 1.75, paddingBottom: 24, maxWidth: 680 }}>{a}</div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   ROI CALCULATOR
─────────────────────────────────────────────────────────────────────────── */
function RoiCalculator() {
  const [ricavi, setRicavi] = useState(15000)
  const fcReduzione = 2
  const risparmio = Math.round(ricavi * (fcReduzione / 100))
  const annualSavings = risparmio * 12
  const annualCost = 89 * 12
  const netGain = annualSavings - annualCost
  const roi = Math.round((annualSavings / annualCost - 1) * 100)

  return (
    <div style={{
      background: T.paper, border: `1px solid ${T.border}`,
      borderRadius: 24, padding: '36px 36px',
      boxShadow: '0 20px 60px rgba(15,9,7,0.06)',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 36, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>
            Calcola il tuo risparmio
          </div>
          <div style={{ fontSize: 13, color: T.textMid, marginBottom: 18, lineHeight: 1.6 }}>
            Quanto fatturi al mese (medio)?
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
            <span style={{ fontFamily: SERIF, fontSize: 44, fontWeight: 600, color: T.ink, letterSpacing: '-0.04em' }}>
              € {ricavi.toLocaleString('it-IT')}
            </span>
            <span style={{ fontSize: 13, color: T.textSoft }}>/ mese</span>
          </div>
          <input type="range" min="5000" max="80000" step="1000"
            value={ricavi} onChange={e => setRicavi(parseInt(e.target.value))}
            style={{ width: '100%', cursor: 'pointer', accentColor: T.red, height: 6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textSoft, marginTop: 6 }}>
            <span>€ 5.000</span><span>€ 80.000+</span>
          </div>
        </div>

        <div style={{ background: T.border, width: 1, height: '80%', margin: '0 auto' }}/>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.green, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>
            Risparmio stimato
          </div>
          <div style={{ fontSize: 13, color: T.textMid, marginBottom: 18, lineHeight: 1.6 }}>
            Riducendo il food cost solo del <strong style={{ color: T.ink }}>{fcReduzione}%</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 700, color: T.green, letterSpacing: '-0.04em', lineHeight: 1 }}>
              € {annualSavings.toLocaleString('it-IT')}
            </span>
          </div>
          <div style={{ fontSize: 13, color: T.textMid, marginTop: 8 }}>risparmiati ogni anno</div>
          <div style={{
            marginTop: 18, padding: '12px 14px', background: T.greenSoft, borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Icon name="checkCirc" size={18} color={T.green}/>
            <div style={{ fontSize: 12, color: T.green, fontWeight: 600 }}>
              ROI di <strong>{roi}%</strong> · costo annuo €{annualCost} → guadagno netto €{netGain.toLocaleString('it-IT')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   FEATURE VISUALS
─────────────────────────────────────────────────────────────────────────── */
function CardShell({ children, style }) {
  return (
    <div style={{
      background: T.paper, border: `1px solid ${T.border}`,
      borderRadius: 20, padding: 28,
      boxShadow: '0 20px 50px rgba(15,9,7,0.08)',
      ...style,
    }}>{children}</div>
  )
}

function VisualFoodCost() {
  return (
    <CardShell>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>
        Tiramisù · 8 porzioni
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {[
          ['Mascarpone 500g',  '€ 8,40', T.red],
          ['Savoiardi 250g',   '€ 2,10', T.amber],
          ['Uova fresche · 4', '€ 1,20', T.green],
          ['Caffè espresso',   '€ 0,80', T.textMid],
          ['Cacao amaro',      '€ 0,60', T.textSoft],
        ].map(([n, p, c], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? `1px solid ${T.borderSoft}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 22, borderRadius: 3, background: c }}/>
              <span style={{ fontSize: 14, color: T.ink, fontWeight: 500 }}>{n}</span>
            </div>
            <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: T.ink }}>{p}</span>
          </div>
        ))}
      </div>
      <div style={{
        background: T.creamDeep, borderRadius: 12,
        padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Food cost</div>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: T.ink, letterSpacing: '-0.03em' }}>26,4%</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Costo / porzione</div>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: T.red, letterSpacing: '-0.03em' }}>€ 1,64</div>
        </div>
      </div>
    </CardShell>
  )
}

function VisualMargini() {
  const items = [
    { n: 'Tiramisù',        m: 73, c: T.green },
    { n: 'Crostata frutta', m: 68, c: T.green },
    { n: 'Sfogliatella',    m: 62, c: T.amber },
    { n: 'Babà al rum',     m: 81, c: T.green },
    { n: 'Cannolo',         m: 44, c: T.red },
  ]
  return (
    <CardShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Ranking ricette · maggio
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.green, padding: '3px 10px', background: T.greenSoft, borderRadius: 999 }}>↑ +4 pt vs aprile</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((it, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: T.textSoft, width: 20 }}>{String(i+1).padStart(2,'0')}</span>
                <span style={{ fontSize: 14, color: T.ink, fontWeight: 500 }}>{it.n}</span>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 500 }}>margine</span>
                <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: T.ink, minWidth: 40, textAlign: 'right' }}>{it.m}%</span>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: T.borderSoft, overflow: 'hidden' }}>
              <div style={{ width: `${it.m}%`, height: '100%', background: it.c, borderRadius: 999, transition: 'width 1s' }}/>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

function VisualProduzione() {
  return (
    <CardShell>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18 }}>
        Chiusura del 13 maggio
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { n: 'Sfogliatella', prod: 48, vend: 42, color: T.green },
          { n: 'Tiramisù',     prod: 24, vend: 24, color: T.green },
          { n: 'Babà',         prod: 18, vend: 11, color: T.red },
          { n: 'Crostata',     prod: 12, vend: 12, color: T.green },
        ].map((r, i) => {
          const pct = (r.vend / r.prod) * 100
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 90, fontSize: 13, color: T.ink, fontWeight: 500 }}>{r.n}</div>
              <div style={{ flex: 1, height: 24, background: T.borderSoft, borderRadius: 6, overflow: 'hidden' }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: r.color, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  paddingRight: 8, color: '#FFF', fontSize: 10, fontWeight: 700,
                }}>{r.vend}/{r.prod}</div>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: r.color, minWidth: 38, textAlign: 'right' }}>
                {Math.round(pct)}%
              </div>
            </div>
          )
        })}
      </div>
      <div style={{
        marginTop: 18, padding: '12px 14px', background: T.cream, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, color: T.textMid }}>Sell-through medio</span>
        <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: '-0.02em' }}>87%</span>
      </div>
    </CardShell>
  )
}

function VisualAI() {
  return (
    <CardShell>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        paddingBottom: 14, borderBottom: `1px solid ${T.borderSoft}`,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 999,
          background: `linear-gradient(135deg, ${T.red}, ${T.redDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(192,57,43,0.30)',
        }}>
          <Icon name="sparkles" size={16} color="#FFF" stroke={2}/>
        </div>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700, color: T.ink }}>AI Assistant</div>
          <div style={{ fontSize: 11, color: T.green, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green }}/> Online · in italiano
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
          <div style={{
            background: T.cream, borderRadius: '16px 16px 4px 16px',
            padding: '12px 14px', fontSize: 14, color: T.ink, lineHeight: 1.5,
            border: `1px solid ${T.border}`,
          }}>
            Qual è la mia ricetta meno redditizia di maggio?
          </div>
        </div>

        <div style={{ alignSelf: 'flex-start', maxWidth: '95%' }}>
          <div style={{
            background: T.creamDeep, borderRadius: '16px 16px 16px 4px',
            padding: '14px 16px', fontSize: 14, color: T.ink, lineHeight: 1.55,
          }}>
            Il <strong>Cannolo siciliano</strong> ha solo il <strong style={{ color: T.red }}>44% di margine</strong> — il più basso del menù. Costa €1,38 e lo vendi a €2,50.
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(15,9,7,0.06)', fontSize: 13, color: T.textMid }}>
              Suggerimento: alzando il prezzo a €2,90 (+16%) il margine salirebbe al <strong style={{ color: T.green }}>52%</strong>, in linea con la media del banco.
            </div>
          </div>
        </div>
      </div>
    </CardShell>
  )
}

function FeatureVisual({ index }) {
  return (
    <div style={{ direction: 'ltr' }}>
      {index === 0 && <VisualFoodCost/>}
      {index === 1 && <VisualMargini/>}
      {index === 2 && <VisualProduzione/>}
      {index === 3 && <VisualAI/>}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════════════════ */
export default function LandingPage({ onLogin, onRegister }) {
  const [openFaq, setOpenFaq] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [heroIn, setHeroIn] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setHeroIn(true), 60)
    return () => clearTimeout(t)
  }, [])

  const features = [
    {
      eyebrow: 'Food cost',
      title: <>Il costo di ogni piatto, <em style={{ fontStyle: 'italic', color: T.red }}>aggiornato da solo</em>.</>,
      body: "Quando cambia il prezzo dell'olio o della farina, il food cost di tutte le ricette si ricalcola da solo. Niente Excel, niente formule rotte. Lavori sui margini reali — non su quelli che pensavi di avere tre mesi fa.",
      bullets: ['Importa il tuo Excel in 5 minuti', 'Cambia un prezzo, si aggiorna tutto', 'Costo per porzione, ricetta, categoria'],
      icon: 'chart',
    },
    {
      eyebrow: 'Margini & P&L',
      title: <>Scopri quali piatti <em style={{ fontStyle: 'italic', color: T.red }}>ti fanno guadagnare</em> davvero.</>,
      body: "Non tutti i piatti più venduti sono i più redditizi. FoodOS ti mostra il margine reale di ogni ricetta, per categoria e per giornata. Vedi subito quali alzare di prezzo, quali tagliare dal menù e quali spingere.",
      bullets: ['Ranking ricette per margine', 'P&L mensile sempre aggiornato', 'Confronto periodo su periodo'],
      icon: 'receipt',
    },
    {
      eyebrow: 'Produzione',
      title: <>Chiudi la giornata <em style={{ fontStyle: 'italic', color: T.red }}>in 3 minuti</em>.</>,
      body: "Registri quanti pezzi hai prodotto e venduto. FoodOS calcola lo sell-through, gli avanzi e il costo della giornata. Capisci subito se hai prodotto troppo o troppo poco. Si decide sui dati, non sul mal di testa.",
      bullets: ['Sell-through per ricetta', 'Avanzi tracciati automaticamente', 'Storico produzione consultabile'],
      icon: 'clock',
    },
    {
      eyebrow: 'AI Assistant',
      title: <>Un consulente che <em style={{ fontStyle: 'italic', color: T.red }}>conosce i tuoi numeri</em>.</>,
      body: 'Chiedi: "Qual è la mia ricetta meno redditizia di maggio?" o "Quanto devo alzare il prezzo del tiramisù per restare sotto il 30% di food cost?" L\'AI risponde con i tuoi dati. Non è ChatGPT generico — è un sous-chef finanziario.',
      bullets: ['Domande in italiano naturale', 'Risposte basate sui tuoi dati', 'Analisi e raccomandazioni proattive'],
      icon: 'sparkles',
    },
  ]

  const problems = [
    "Ho alzato i prezzi a gennaio ma non so se è bastato a coprire l'aumento delle farine.",
    "Il mio piatto più venduto è anche quello che mi rende meno. Ma non l'ho mai calcolato davvero.",
    "Il P&L lo leggo a marzo per l'anno prima. Quando arriva è già tardi per cambiare qualcosa.",
  ]

  const testimonials = [
    {
      q: "In due mesi ho capito che il babà mi costava il 18% in più di quanto pensassi. Ho corretto il prezzo e il margine del reparto pasticceria è salito di 4 punti.",
      name: 'Marco Esposito',
      role: 'Titolare · Pasticceria del Corso',
      city: 'Napoli',
    },
    {
      q: 'Prima passavo due ore al mese a sistemare Excel. Adesso chiudo la giornata in tre minuti dal cellulare. E vedo il P&L senza aspettare il commercialista.',
      name: 'Anna Conti',
      role: 'Titolare · Bistrot Conti',
      city: 'Milano',
    },
    {
      q: "Avevo 47 ricette su un quaderno. L'ho caricato in FoodOS in mezza mattinata e da subito vedo cosa mi rende e cosa no. Mi ha cambiato il modo di pensare al menù.",
      name: 'Giuseppe Lo Cascio',
      role: 'Chef · Trattoria Da Pino',
      city: 'Palermo',
    },
  ]

  const faqs = [
    { q: 'Funziona anche per ristoranti e bar, non solo pasticcerie?', a: "Sì. FoodOS è pensato per tutta la ristorazione italiana: ristoranti, bar, pasticcerie, gelaterie, panetterie, pizzerie, gastronomie. Ovunque ci siano ingredienti, ricette e margini da tenere sotto controllo, FoodOS funziona." },
    { q: 'Devo essere bravo con i computer?', a: 'No. Se sai usare WhatsApp, sai usare FoodOS. È pensato per essere usato dal titolare, non dal nipote bravo con la tecnologia. Niente formule, niente Excel da non rompere.' },
    { q: 'Posso importare il mio ricettario esistente?', a: "Sì. Carichi un file Excel o CSV e FoodOS lo converte in automatico. L'AI sa leggere anche foto di ricette scritte a mano sul quaderno e immagini delle etichette per registrare i costi automaticamente." },
    { q: 'Quanto dura la prova gratuita?', a: 'Tre mesi pieni, gratis. Senza carta di credito. Se dopo i tre mesi non ti convince, scarichi i tuoi dati e basta. Nessun addebito automatico, mai.' },
    { q: 'Posso gestire più sedi o brand?', a: "Sì, con il piano Multi-sede gestisci fino a 5 punti vendita con dati separati e dashboard aggregata. Per catene più grandi, scrivici: c'è il piano Enterprise." },
    { q: 'Cosa succede ai miei dati se smetto?', a: 'Sono tuoi. Puoi esportarli in Excel/PDF in qualsiasi momento, anche durante il trial. Non li condividiamo con nessuno e non li usiamo per addestrare AI di terzi.' },
  ]

  return (
    <div style={{
      fontFamily: SANS, background: T.cream, color: T.ink,
      minHeight: '100vh', overflowX: 'hidden',
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* NAV */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: scrolled ? 'rgba(251,248,244,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        borderBottom: scrolled ? `1px solid ${T.border}` : '1px solid transparent',
        transition: 'all 0.3s ease',
      }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '0 24px',
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={32} style={{ borderRadius: 8, boxShadow: '0 4px 12px rgba(192,57,43,0.22)' }}/>
            <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: T.ink }}>
              FoodOS
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={onLogin} style={{
              padding: '8px 16px', background: 'none', border: 'none',
              fontSize: 14, fontWeight: 500, color: T.textMid, cursor: 'pointer',
              fontFamily: SANS, borderRadius: 999,
            }}>Accedi</button>
            <Button variant="primary" size="sm" onClick={onRegister}>
              Prova gratis <Icon name="arrowR" size={14} color="#FFF"/>
            </Button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at 80% 0%, rgba(192,57,43,0.06), transparent 50%), radial-gradient(circle at 0% 80%, rgba(192,57,43,0.04), transparent 50%)',
          pointerEvents: 'none',
        }}/>

        <div style={{
          maxWidth: 1180, margin: '0 auto',
          padding: isMobile ? '40px 24px 80px' : '72px 24px 100px',
          position: 'relative',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.05fr 1fr',
            gap: 56, alignItems: 'center',
          }}>

            <div style={{
              opacity: heroIn ? 1 : 0,
              transform: heroIn ? 'translateY(0)' : 'translateY(24px)',
              transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 14px',
                background: T.paper, border: `1px solid ${T.border}`, borderRadius: 999,
                fontSize: 12, fontWeight: 500, color: T.textMid,
                marginBottom: 28, boxShadow: '0 2px 8px rgba(15,9,7,0.04)',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: `0 0 0 4px ${T.greenSoft}` }}/>
                Per ristoranti, bar, pasticcerie italiane
              </div>

              <h1 style={{
                fontFamily: SERIF,
                fontSize: isMobile ? 'clamp(38px, 9vw, 52px)' : 'clamp(44px, 5.2vw, 70px)',
                fontWeight: 500, lineHeight: 1.02, letterSpacing: '-0.035em',
                color: T.ink, margin: '0 0 24px',
              }}>
                Sai quanto<br/>
                <em style={{ fontStyle: 'italic', fontWeight: 400, color: T.red }}>guadagni davvero</em><br/>
                su ogni piatto?
              </h1>

              <p style={{
                fontSize: isMobile ? 16 : 19, color: T.textMid,
                lineHeight: 1.6, maxWidth: 520, margin: '0 0 36px',
              }}>
                FoodOS calcola il food cost di ogni ricetta, traccia la produzione giornaliera e
                ti mostra i margini reali. <strong style={{ color: T.ink, fontWeight: 600 }}>In italiano, con i tuoi numeri,
                dal tuo telefono.</strong>
              </p>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
                <Button variant="primary" size="lg" onClick={onRegister}>
                  Inizia 3 mesi gratis <Icon name="arrowR" size={16} color="#FFF"/>
                </Button>
                <Button variant="secondary" size="lg" onClick={() => {
                  document.getElementById('come-funziona')?.scrollIntoView({ behavior: 'smooth' })
                }}>
                  <Icon name="play" size={12} color={T.ink}/> Vedi come funziona
                </Button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', fontSize: 13, color: T.textMid }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCirc" size={16} color={T.green}/> Senza carta di credito
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCirc" size={16} color={T.green}/> Disdici quando vuoi
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCirc" size={16} color={T.green}/> In italiano
                </span>
              </div>
            </div>

            <div style={{
              position: 'relative',
              opacity: heroIn ? 1 : 0,
              transform: heroIn ? 'translateY(0)' : 'translateY(40px)',
              transition: 'opacity 0.9s 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.9s 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
              <DashboardPreview/>
              {!isMobile && (
                <>
                  <FloatBadge style={{ top: -18, left: -28 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: T.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="boltSm" size={18} color={T.green}/>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Food cost</div>
                      <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: T.ink, letterSpacing: '-0.02em' }}>aggiornato in 2 sec</div>
                    </div>
                  </FloatBadge>

                  <FloatBadge style={{ bottom: 24, right: -32 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: T.redSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="star" size={18} color={T.red}/>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Valutazione</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: T.ink, letterSpacing: '-0.02em' }}>4.9</span>
                        <span style={{ fontSize: 11, color: T.textSoft }}>/ 5 · 240+ locali</span>
                      </div>
                    </div>
                  </FloatBadge>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* STAT STRIP */}
      <section style={{
        background: T.paper,
        borderTop: `1px solid ${T.border}`,
        borderBottom: `1px solid ${T.border}`,
        padding: '48px 24px',
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 32 }}>
            Quello che cambia con FoodOS
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: isMobile ? 28 : 0,
          }}>
            {[
              ['+ 4 pt', 'margine medio recuperato'],
              ['3 min', 'per chiudere una giornata'],
              ['€ 2.400', 'risparmio medio annuo'],
              ['240+', 'locali italiani usano FoodOS'],
            ].map(([v, l], i) => (
              <div key={i} style={{
                textAlign: 'center',
                padding: isMobile ? 0 : '0 24px',
                borderLeft: !isMobile && i > 0 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div style={{
                  fontFamily: SERIF, fontSize: 'clamp(28px, 4.5vw, 40px)',
                  fontWeight: 600, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1,
                }}>{v}</div>
                <div style={{ fontSize: 12, color: T.textSoft, marginTop: 8, fontWeight: 500 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEMS */}
      <section style={{ padding: isMobile ? '80px 24px' : '120px 24px', background: T.cream }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <Reveal>
            <div style={{ maxWidth: 720, marginBottom: 56 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18 }}>
                Suona familiare?
              </div>
              <h2 style={{
                fontFamily: SERIF, fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 500,
                color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0,
              }}>
                Le frasi che <em style={{ fontStyle: 'italic', color: T.red }}>ogni titolare</em> ha detto almeno una volta.
              </h2>
            </div>
          </Reveal>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 20,
          }}>
            {problems.map((p, i) => (
              <Reveal key={i} delay={i * 80}>
                <div style={{
                  background: T.paper, border: `1px solid ${T.border}`,
                  borderRadius: 18, padding: '32px 28px 28px',
                  height: '100%',
                }}>
                  <div style={{
                    color: T.red, fontFamily: SERIF, fontSize: 60, fontWeight: 600, lineHeight: 0.6,
                    marginBottom: 16, opacity: 0.7,
                  }}>"</div>
                  <p style={{
                    fontFamily: SERIF, fontSize: 19, fontWeight: 400, fontStyle: 'italic',
                    color: T.ink, lineHeight: 1.45, letterSpacing: '-0.01em', margin: 0,
                  }}>{p}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={300}>
            <div style={{
              marginTop: 56, padding: '36px 36px',
              background: T.inkSoft, color: T.textOnDark,
              borderRadius: 20, display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between', gap: 24,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                  C'è un altro modo
                </div>
                <h3 style={{
                  fontFamily: SERIF, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 500,
                  color: T.cream, letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0,
                }}>
                  Gestisci i numeri della tua attività<br/>
                  <em style={{ fontStyle: 'italic', color: T.amber }}>basandoti sui fatti, non sull'istinto.</em>
                </h3>
              </div>
              <Button variant="light" size="lg" onClick={onRegister} style={{ flexShrink: 0 }}>
                Inizia gratis <Icon name="arrowR" size={16} color={T.ink}/>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: isMobile ? '40px 24px 80px' : '40px 24px 120px', background: T.cream }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 80px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18 }}>
                Funzionalità
              </div>
              <h2 style={{
                fontFamily: SERIF, fontSize: 'clamp(30px, 4.5vw, 48px)', fontWeight: 500,
                color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 18px',
              }}>
                Tutto quello che <em style={{ fontStyle: 'italic', color: T.red }}>serve davvero</em>.
              </h2>
              <p style={{ fontSize: 17, color: T.textMid, lineHeight: 1.6, margin: 0 }}>
                Niente moduli inutili, niente formazione di tre giorni. Le quattro cose che cambiano davvero come gestisci.
              </p>
            </div>
          </Reveal>

          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 64 : 96 }}>
            {features.map((f, i) => (
              <Reveal key={i} delay={i * 60}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: isMobile ? 32 : 80,
                  alignItems: 'center',
                  direction: !isMobile && i % 2 === 1 ? 'rtl' : 'ltr',
                }}>
                  <div style={{ direction: 'ltr' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14,
                      background: T.redSoft,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 24,
                    }}>
                      <Icon name={f.icon} size={22} color={T.red}/>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>
                      {f.eyebrow}
                    </div>
                    <h3 style={{
                      fontFamily: SERIF, fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 500,
                      color: T.ink, letterSpacing: '-0.025em', lineHeight: 1.15, margin: '0 0 18px',
                    }}>{f.title}</h3>
                    <p style={{ fontSize: 16, color: T.textMid, lineHeight: 1.65, margin: '0 0 24px' }}>
                      {f.body}
                    </p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {f.bullets.map((b, j) => (
                        <li key={j} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: T.ink, fontWeight: 500 }}>
                          <Icon name="checkCirc" size={18} color={T.green}/>{b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <FeatureVisual index={i}/>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="come-funziona" style={{
        padding: isMobile ? '80px 24px' : '120px 24px',
        background: T.paper, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 64px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18 }}>
                Come funziona
              </div>
              <h2 style={{
                fontFamily: SERIF, fontSize: 'clamp(30px, 4.5vw, 48px)', fontWeight: 500,
                color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 16px',
              }}>
                Operativo <em style={{ fontStyle: 'italic', color: T.red }}>in meno di 10 minuti</em>.
              </h2>
              <p style={{ fontSize: 16, color: T.textMid, lineHeight: 1.6, margin: 0 }}>
                Senza installazione, senza training. Apri il browser e inizi.
              </p>
            </div>
          </Reveal>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: isMobile ? 36 : 24,
          }}>
            {[
              { n: '01', t: 'Carica il tuo menù', d: "Importi le ricette da Excel, foto del quaderno o le inserisci a mano. FoodOS calcola il food cost di ogni piatto in automatico." },
              { n: '02', t: 'Registra la produzione', d: 'Ogni sera, dal cellulare, segni cosa hai prodotto e venduto. Tre minuti netti — meno della chiusura di cassa.' },
              { n: '03', t: 'Leggi i numeri che contano', d: 'Dashboard, P&L mensile e consigli AI sempre aggiornati. Decidi prezzi, menù e turni guardando i fatti.' },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div style={{ padding: isMobile ? 0 : '0 8px' }}>
                  <div style={{
                    fontFamily: SERIF, fontSize: 80, fontWeight: 500,
                    color: T.creamDeep, letterSpacing: '-0.05em',
                    lineHeight: 0.85, marginBottom: 24,
                  }}>{s.n}</div>
                  <h3 style={{
                    fontFamily: SERIF, fontSize: 24, fontWeight: 500,
                    color: T.ink, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 12px',
                  }}>{s.t}</h3>
                  <p style={{ fontSize: 15, color: T.textMid, lineHeight: 1.7, margin: 0 }}>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: isMobile ? '80px 24px' : '120px 24px', background: T.cream }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <Reveal>
            <div style={{ maxWidth: 720, marginBottom: 56 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18 }}>
                Hanno provato FoodOS
              </div>
              <h2 style={{
                fontFamily: SERIF, fontSize: 'clamp(30px, 4.5vw, 46px)', fontWeight: 500,
                color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0,
              }}>
                Le storie di chi <em style={{ fontStyle: 'italic', color: T.red }}>l'ha già fatto</em>.
              </h2>
            </div>
          </Reveal>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 20,
          }}>
            {testimonials.map((t, i) => (
              <Reveal key={i} delay={i * 80}>
                <div style={{
                  background: T.paper, border: `1px solid ${T.border}`,
                  borderRadius: 20, padding: '36px 32px', height: '100%',
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 22 }}>
                    {[0,1,2,3,4].map(s => <Icon key={s} name="star" size={14} color={T.amber}/>)}
                  </div>
                  <p style={{
                    fontFamily: SERIF, fontSize: 18, fontWeight: 400, fontStyle: 'italic',
                    color: T.ink, lineHeight: 1.55, letterSpacing: '-0.01em',
                    margin: '0 0 28px', flex: 1,
                  }}>"{t.q}"</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderTop: `1px solid ${T.borderSoft}`, paddingTop: 18 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 999,
                      background: `linear-gradient(135deg, ${T.red}, ${T.redDeep})`,
                      color: '#FFF', fontFamily: SERIF, fontWeight: 600, fontSize: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>{t.name.split(' ').map(n => n[0]).join('').slice(0,2)}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>{t.role} · {t.city}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ROI — desktop only */}
      {!isMobile && (
        <section style={{ padding: '40px 24px 120px', background: T.cream }}>
          <div style={{ maxWidth: 980, margin: '0 auto' }}>
            <Reveal><RoiCalculator/></Reveal>
          </div>
        </section>
      )}

      {/* PRICING */}
      <section style={{
        padding: isMobile ? '80px 24px' : '120px 24px',
        background: T.paper, borderTop: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18 }}>
                Prezzo
              </div>
              <h2 style={{
                fontFamily: SERIF, fontSize: 'clamp(30px, 4.5vw, 48px)', fontWeight: 500,
                color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 16px',
              }}>
                Un prezzo. <em style={{ fontStyle: 'italic', color: T.red }}>Nessuna sorpresa.</em>
              </h2>
              <p style={{ fontSize: 16, color: T.textMid, lineHeight: 1.6, margin: 0 }}>
                3 mesi gratis. Senza carta di credito. Senza commissioni nascoste.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.9fr',
              gap: 20, alignItems: 'stretch',
            }}>
              <div style={{
                background: T.inkSoft,
                borderRadius: 24, padding: '40px 40px',
                color: T.textOnDark, position: 'relative', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}>
                <div aria-hidden style={{
                  position: 'absolute', top: -60, right: -60,
                  width: 240, height: 240, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(192,57,43,0.20), transparent 70%)',
                  pointerEvents: 'none',
                }}/>

                <div style={{
                  display: 'inline-flex', alignSelf: 'flex-start',
                  background: T.red, color: '#FFF',
                  fontSize: 10, fontWeight: 700,
                  padding: '5px 12px', borderRadius: 999,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  marginBottom: 24,
                }}>Piano standard</div>

                <div style={{
                  fontFamily: SERIF, fontWeight: 600,
                  fontSize: 26, color: T.cream, letterSpacing: '-0.02em', marginBottom: 4,
                }}>FoodOS Pro</div>
                <div style={{ fontSize: 14, color: 'rgba(244,236,227,0.65)', marginBottom: 24 }}>
                  Per una sede. Tutto incluso.
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 72, fontWeight: 600, color: '#FFF', letterSpacing: '-0.045em', lineHeight: 1 }}>€89</span>
                  <span style={{ fontSize: 16, color: 'rgba(244,236,227,0.55)' }}>/ mese</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(244,236,227,0.5)', marginBottom: 28 }}>
                  IVA esclusa · fatturato mensile
                </div>

                <Button variant="primary" size="lg" onClick={onRegister} style={{ marginBottom: 28 }}>
                  Inizia 3 mesi gratis <Icon name="arrowR" size={16} color="#FFF"/>
                </Button>

                <div style={{
                  display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                  gap: '12px 24px',
                }}>
                  {[
                    'Ricettario illimitato',
                    'Food cost automatico',
                    'P&L mensile',
                    'Produzione giornaliera',
                    'AI Assistant',
                    'Magazzino & scadenze',
                    'Import fatture SDI',
                    'Allergeni (Reg. UE 1169)',
                    'Export PDF & Excel',
                    'Aggiornamenti inclusi',
                  ].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(244,236,227,0.85)' }}>
                      <Icon name="check" size={14} color={T.red}/>{f}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                background: T.cream,
                border: `1px solid ${T.border}`,
                borderRadius: 24, padding: '40px 36px',
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 24 }}>
                  Hai più sedi?
                </div>

                <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 24, color: T.ink, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  FoodOS Multi-sede
                </div>
                <div style={{ fontSize: 14, color: T.textMid, marginBottom: 24 }}>
                  Per chi gestisce più punti vendita.
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 600, color: T.ink, letterSpacing: '-0.045em', lineHeight: 1 }}>€149</span>
                  <span style={{ fontSize: 14, color: T.textSoft }}>/ mese</span>
                </div>
                <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 24 }}>
                  Fino a 5 sedi · oltre, scrivici
                </div>

                <Button variant="secondary" onClick={onRegister} style={{ marginBottom: 24, justifyContent: 'center' }}>
                  Prova gratis
                </Button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    'Tutto di FoodOS Pro',
                    'Fino a 5 sedi',
                    'Dashboard aggregata',
                    'Confronto sedi',
                    'Supporto prioritario',
                  ].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: T.textMid }}>
                      <Icon name="check" size={14} color={T.green}/>{f}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: T.textSoft }}>
              Catena con più di 5 sedi? <a href="mailto:support@foodios.it" style={{ color: T.ink, fontWeight: 600, textDecoration: 'none', borderBottom: `1px solid ${T.ink}` }}>Scrivici per il piano Enterprise →</a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: isMobile ? '80px 24px' : '120px 24px', background: T.cream }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18 }}>
                FAQ
              </div>
              <h2 style={{
                fontFamily: SERIF, fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 500,
                color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0,
              }}>
                Le domande che <em style={{ fontStyle: 'italic', color: T.red }}>ci fanno di più</em>.
              </h2>
            </div>
          </Reveal>

          <div>
            {faqs.map((f, i) => (
              <Faq key={i} q={f.q} a={f.a}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
              />
            ))}
            <div style={{ borderTop: `1px solid ${T.border}` }}/>
          </div>

          <div style={{ textAlign: 'center', marginTop: 40, fontSize: 14, color: T.textMid }}>
            Altre domande?{' '}
            <a href="mailto:support@foodios.it" style={{ color: T.ink, fontWeight: 600, textDecoration: 'none', borderBottom: `1px solid ${T.ink}` }}>
              Scrivici a support@foodios.it →
            </a>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{
        padding: isMobile ? '80px 24px' : '120px 24px',
        background: T.ink, position: 'relative', overflow: 'hidden',
      }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at 50% 0%, rgba(192,57,43,0.18), transparent 60%)',
          pointerEvents: 'none',
        }}/>

        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <Reveal>
            <div style={{ display: 'inline-flex', gap: 6, marginBottom: 20 }}>
              {[0,1,2,3,4].map(s => <Icon key={s} name="star" size={18} color={T.amber}/>)}
            </div>
            <h2 style={{
              fontFamily: SERIF, fontSize: 'clamp(34px, 5vw, 56px)', fontWeight: 500,
              color: T.cream, letterSpacing: '-0.035em', lineHeight: 1.05,
              margin: '0 0 24px',
            }}>
              Inizia a gestire i numeri.<br/>
              <em style={{ fontStyle: 'italic', color: T.amber }}>Non l'istinto.</em>
            </h2>
            <p style={{ fontSize: 18, color: 'rgba(244,236,227,0.65)', lineHeight: 1.6, margin: '0 auto 40px', maxWidth: 540 }}>
              3 mesi gratis, senza carta. Dopo, 89€/mese — o niente. Decidi tu, basandoti sui tuoi numeri.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" size="lg" onClick={onRegister}>
                Crea il tuo account <Icon name="arrowR" size={16} color="#FFF"/>
              </Button>
              <button onClick={onLogin} style={{
                padding: '16px 28px', background: 'transparent',
                border: '1px solid rgba(244,236,227,0.2)',
                color: T.cream, borderRadius: 999, fontSize: 15, fontWeight: 500,
                cursor: 'pointer', fontFamily: SANS, transition: 'all 0.2s',
              }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,236,227,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                Ho già un account
              </button>
            </div>
            <div style={{ marginTop: 28, fontSize: 12, color: 'rgba(244,236,227,0.4)' }}>
              ✓ Senza carta · ✓ Senza vincoli · ✓ In italiano
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#070302', padding: '48px 24px 32px', borderTop: '1px solid rgba(244,236,227,0.06)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            flexWrap: 'wrap', gap: 32, marginBottom: 36, paddingBottom: 32,
            borderBottom: '1px solid rgba(244,236,227,0.06)',
          }}>
            <div style={{ maxWidth: 320 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Logo size={28} style={{ borderRadius: 7, opacity: 0.9 }}/>
                <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: T.cream, letterSpacing: '-0.02em' }}>FoodOS</span>
              </div>
              <p style={{ fontSize: 13, color: 'rgba(244,236,227,0.4)', lineHeight: 1.6, margin: 0 }}>
                Il gestionale food cost per la ristorazione italiana. Pensato, fatto e supportato in Italia.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 56, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(244,236,227,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Prodotto</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <a onClick={onRegister} style={{ fontSize: 13, color: 'rgba(244,236,227,0.7)', cursor: 'pointer', textDecoration: 'none' }}>Prova gratis</a>
                  <a onClick={onLogin} style={{ fontSize: 13, color: 'rgba(244,236,227,0.7)', cursor: 'pointer', textDecoration: 'none' }}>Accedi</a>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(244,236,227,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Supporto</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <a href="mailto:support@foodios.it" style={{ fontSize: 13, color: 'rgba(244,236,227,0.7)', textDecoration: 'none' }}>Contatti</a>
                  <a href="mailto:support@foodios.it" style={{ fontSize: 13, color: 'rgba(244,236,227,0.7)', textDecoration: 'none' }}>support@foodios.it</a>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(244,236,227,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Legale</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <a href="/privacy" style={{ fontSize: 13, color: 'rgba(244,236,227,0.7)', textDecoration: 'none' }}>Privacy Policy</a>
                  <a href="/termini" style={{ fontSize: 13, color: 'rgba(244,236,227,0.7)', textDecoration: 'none' }}>Termini di Servizio</a>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: 11, color: 'rgba(244,236,227,0.3)' }}>
              © {new Date().getFullYear()} FoodOS · Tutti i diritti riservati
            </div>
            <div style={{ fontSize: 11, color: 'rgba(244,236,227,0.3)' }}>
              Fatto in Italia
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
