import React, { useEffect, useRef, useState } from 'react'
import FoodOSLogo from '../components/FoodOSLogo'

/* ─── TOKENS ──────────────────────────────────────────────────────────────── */
const C = {
  bg:       '#FFFFFF',
  bgAlt:    '#F8FAFC',
  bgDark:   '#0F172A',
  text:     '#0F172A',
  textMid:  '#475569',
  textSoft: '#94A3B8',
  border:   '#E2E8F0',
  accent:   '#C0392B',
  accentBg: '#FEF2F2',
}

/* ─── ANIMATION HOOK ──────────────────────────────────────────────────────── */
function useFadeIn(threshold = 0.15) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, visible]
}

/* ─── INLINE SVG ICONS ────────────────────────────────────────────────────── */
const Icon = ({ name, size = 20, color = C.text }) => {
  const icons = {
    book:     <><rect x="3" y="3" width="13" height="18" rx="1" stroke={color} strokeWidth="1.5" fill="none"/><path d="M3 8h13" stroke={color} strokeWidth="1.5"/><path d="M7 3v18" stroke={color} strokeWidth="1.5"/></>,
    trending: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke={color} strokeWidth="1.5" fill="none"/><polyline points="17 6 23 6 23 12" stroke={color} strokeWidth="1.5" fill="none"/></>,
    clock:    <><circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill="none"/><path d="M12 7v5l3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none"/></>,
    barChart: <><line x1="18" y1="20" x2="18" y2="10" stroke={color} strokeWidth="1.5"/><line x1="12" y1="20" x2="12" y2="4" stroke={color} strokeWidth="1.5"/><line x1="6" y1="20" x2="6" y2="14" stroke={color} strokeWidth="1.5"/></>,
    zap:      <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke={color} strokeWidth="1.5" fill="none"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" stroke={color} strokeWidth="1.5" fill="none"/><line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="1.5"/><line x1="8" y1="2" x2="8" y2="6" stroke={color} strokeWidth="1.5"/><line x1="16" y1="2" x2="16" y2="6" stroke={color} strokeWidth="1.5"/></>,
    check:    <><polyline points="20 6 9 17 4 12" stroke={color} strokeWidth="2" fill="none"/></>,
    arrow:    <><line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth="1.5"/><polyline points="13 6 19 12 13 18" stroke={color} strokeWidth="1.5" fill="none"/></>,
    x:        <><line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth="1.5"/><line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth="1.5"/></>,
    menu:     <><line x1="3" y1="6" x2="21" y2="6" stroke={color} strokeWidth="1.5"/><line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth="1.5"/><line x1="3" y1="18" x2="21" y2="18" stroke={color} strokeWidth="1.5"/></>,
    plus:     <><line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth="1.5"/><line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth="1.5"/></>,
    chevron:  <><polyline points="6 9 12 15 18 9" stroke={color} strokeWidth="1.5" fill="none"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      {icons[name]}
    </svg>
  )
}

/* ─── MOCK APP ────────────────────────────────────────────────────────────── */
function MockApp() {
  const navItems = ['Dashboard', 'Ricettario', 'Produzione', 'P&L', 'Magazzino', 'Azioni']
  const kpis = [
    { label: 'Ricavi oggi', value: '€ 1.240', sub: '+8% vs ieri', pos: true },
    { label: 'Food Cost', value: '27,4%', sub: 'Ottimo — target < 30%', pos: true },
    { label: 'Margine lordo', value: '€ 901', sub: '72,6% del ricavo', pos: true },
    { label: 'Pezzi prod.', value: '47', sub: '38 venduti · 9 rimasti', pos: null },
  ]
  return (
    <div style={{
      background: C.bgDark,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 40px 80px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.12)',
      border: '1px solid #1E293B',
      maxWidth: 820,
      width: '100%',
    }}>
      {/* Browser chrome */}
      <div style={{ background: '#1E293B', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF5F57' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FFBD2E' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28C840' }} />
        <div style={{ flex: 1, background: '#0F172A', borderRadius: 6, height: 26, display: 'flex', alignItems: 'center', paddingLeft: 12, marginLeft: 12 }}>
          <span style={{ fontSize: 11, color: '#475569', letterSpacing: '0.02em' }}>app.foodios.it/dashboard</span>
        </div>
      </div>

      {/* App layout */}
      <div style={{ display: 'flex', height: 380, background: '#F8FAFC' }}>
        {/* Sidebar */}
        <div style={{ width: 180, background: '#0F172A', padding: '20px 0', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0 16px 20px', borderBottom: '1px solid #1E293B', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FoodOSLogo size={26} style={{ borderRadius: 6 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.01em' }}>FoodOS</span>
            </div>
          </div>
          {navItems.map((n, i) => (
            <div key={n} style={{
              padding: '9px 16px',
              fontSize: 12,
              fontWeight: i === 0 ? 600 : 400,
              color: i === 0 ? '#F8FAFC' : '#64748B',
              background: i === 0 ? '#1E293B' : 'transparent',
              borderLeft: i === 0 ? `2px solid ${C.accent}` : '2px solid transparent',
              cursor: 'default',
              letterSpacing: '0.01em',
            }}>{n}</div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ padding: '12px 16px', borderTop: '1px solid #1E293B' }}>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Pasticceria Rossi</div>
            <div style={{ fontSize: 10, color: '#334155' }}>Piano Pro · attivo</div>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Buongiorno, Marco</div>
          <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 20 }}>Mercoledì 14 maggio 2026 · Sede principale</div>

          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {kpis.map(({ label, value, sub, pos }) => (
              <div key={label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: 'Georgia, serif', lineHeight: 1, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 9, color: pos === true ? '#16A34A' : pos === false ? C.accent : C.textSoft }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Chart placeholder */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.text, marginBottom: 12 }}>Ricavi vs Food Cost — ultimi 7 giorni</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
              {[65, 82, 58, 90, 72, 88, 95].map((h, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                  <div style={{ width: '100%', height: h * 0.5, background: i === 6 ? C.accent : '#E2E8F0', borderRadius: 3, transition: 'height 0.3s' }} />
                  <div style={{ width: '100%', height: h * 0.15, background: '#FEF2F2', borderRadius: 3 }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: C.accent }} /><span style={{ fontSize: 9, color: C.textSoft }}>Ricavi</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#FEF2F2', border: '1px solid #FECACA' }} /><span style={{ fontSize: 9, color: C.textSoft }}>Food Cost</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── FAQ ITEM ────────────────────────────────────────────────────────────── */
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{q}</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <Icon name="chevron" size={18} color={C.textMid} />
        </span>
      </button>
      {open && (
        <div style={{ fontSize: 14, color: C.textMid, lineHeight: 1.75, paddingBottom: 20, maxWidth: 680 }}>{a}</div>
      )}
    </div>
  )
}

/* ─── SECTION WRAPPER ─────────────────────────────────────────────────────── */
function Section({ children, style = {} }) {
  const [ref, visible] = useFadeIn()
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: 'opacity 0.55s ease, transform 0.55s ease',
      ...style,
    }}>
      {children}
    </div>
  )
}

/* ─── BTN ─────────────────────────────────────────────────────────────────── */
function Btn({ children, primary, onClick, style: s = {} }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: primary ? '13px 28px' : '12px 24px',
        background: primary ? C.text : 'transparent',
        color: primary ? '#fff' : C.text,
        border: `1.5px solid ${primary ? C.text : C.border}`,
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '-0.01em',
        transform: hover ? 'scale(1.02)' : 'scale(1)',
        transition: 'transform 0.2s ease, background 0.15s ease, color 0.15s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        ...s,
      }}
    >{children}</button>
  )
}

/* ─── MAIN COMPONENT ──────────────────────────────────────────────────────── */
export default function LandingPage({ onLogin, onRegister }) {
  const [menuOpen, setMenuOpen] = useState(false)

  // Hero fade-in
  const [heroVisible, setHeroVisible] = useState(false)
  useEffect(() => { setTimeout(() => setHeroVisible(true), 80) }, [])

  const features = [
    { icon: 'book',     title: 'Ricettario digitale',      desc: 'Importa il tuo Excel. Food cost calcolato in automatico su ogni piatto, aggiornato ai prezzi reali delle materie prime.' },
    { icon: 'trending', title: 'Margini reali',             desc: 'Scopri quali piatti ti fanno guadagnare e quali ti costano più di quanto pensi. Senza fogli di calcolo.' },
    { icon: 'clock',    title: 'Produzione giornaliera',    desc: 'Registra cosa produci ogni giorno. Tieni traccia dei costi in tempo reale e monitora il sell-through.' },
    { icon: 'barChart', title: 'P&L mensile',               desc: 'Il conto economico della tua attività, sempre aggiornato e leggibile. Senza aspettare il commercialista.' },
    { icon: 'calendar', title: 'Scadenzario fornitori',     desc: 'Non perdere mai una scadenza. Importa le fatture SDI in un click e ricevi alert automatici.' },
    { icon: 'zap',      title: 'AI Assistant',              desc: "Chiedi consigli su prezzi, ricette e ottimizzazioni. L'AI risponde con i tuoi dati, non con risposte generiche." },
  ]

  const steps = [
    { n: '01', title: 'Inserisci il tuo menù',      desc: 'Carica le ricette con gli ingredienti. FoodOS calcola il food cost di ogni piatto in automatico.' },
    { n: '02', title: 'Registra la produzione',     desc: 'Ogni giorno, segna cosa hai prodotto e venduto. Bastano 3 minuti.' },
    { n: '03', title: 'Leggi i numeri che contano', desc: 'Dashboard, P&L e consigli AI aggiornati in tempo reale. Sai sempre se stai guadagnando.' },
  ]

  const problems = [
    { bad: 'Calcoli il food cost su un foglio Excel che non aggiorni mai', good: 'Food cost aggiornato in automatico ad ogni cambio prezzo fornitore' },
    { bad: "Non sai quali piatti ti fanno guadagnare e quali no", good: 'Margine per piatto, per categoria e per giornata — sempre sotto controllo' },
    { bad: 'Il P&L lo vedi solo quando arriva il commercialista', good: 'Conto economico in tempo reale, leggibile anche senza essere contabili' },
  ]

  const faqs = [
    { q: 'FoodOS funziona solo per le pasticcerie?', a: 'No. FoodOS è pensato per tutta la ristorazione italiana: ristoranti, bar, pasticcerie, gelaterie, panetterie, pizzerie e qualsiasi attività food che voglia tenere sotto controllo i propri costi.' },
    { q: 'Devo essere bravo con la tecnologia?', a: 'No. FoodOS è progettato per essere semplice: niente formule, niente Excel complicati. Se sai usare WhatsApp, sai usare FoodOS.' },
    { q: 'Posso importare le mie ricette esistenti?', a: "Sì. Puoi importare le ricette da Excel o CSV, e FoodOS le converte in automatico nel suo formato. L'AI può anche leggere foto di ricette scritte a mano." },
    { q: 'Cosa succede dopo i 30 giorni di trial?', a: 'Puoi scegliere il piano che fa per te o smettere di usarlo — i tuoi dati restano sempre scaricabili. Nessun addebito automatico senza conferma.' },
    { q: 'Posso gestire più sedi?', a: 'Sì, con il piano Chain puoi gestire fino a 5 sedi distinte con dati separati e un unico accesso. Per esigenze enterprise contattaci.' },
  ]

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: C.bg, color: C.text, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <FoodOSLogo size={32} style={{ borderRadius: 8, boxShadow: '0 2px 10px rgba(192,57,43,0.28)' }} />
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: C.text }}>FoodOS</span>
          </div>

          {/* Desktop nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onLogin} style={{ padding: '8px 16px', background: 'none', border: 'none', fontSize: 13, fontWeight: 500, color: C.textMid, cursor: 'pointer', borderRadius: 6 }}>
              Accedi
            </button>
            <Btn primary onClick={onRegister}>
              Inizia gratis <Icon name="arrow" size={14} color="#fff" />
            </Btn>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 24px 0', background: C.bg }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          {/* Copy */}
          <div style={{
            textAlign: 'center',
            opacity: heroVisible ? 1 : 0,
            transform: heroVisible ? 'translateY(0)' : 'translateY(32px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              border: `1px solid ${C.border}`, borderRadius: 20,
              padding: '5px 14px', fontSize: 12, fontWeight: 500, color: C.textMid,
              marginBottom: 32, letterSpacing: '0.01em',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }} />
              Gestionale food cost per la ristorazione italiana
            </div>

            <h1 style={{
              fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.08,
              letterSpacing: '-0.04em', color: C.text, marginBottom: 20,
              maxWidth: 760, margin: '0 auto 20px',
            }}>
              Gestisci i numeri<br />della tua attività.<br />
              <span style={{ color: C.accent }}>Senza stress.</span>
            </h1>

            <p style={{
              fontSize: 'clamp(15px, 2vw, 18px)', color: C.textMid, lineHeight: 1.7,
              maxWidth: 580, margin: '0 auto 36px', fontWeight: 400,
            }}>
              FoodOS calcola il food cost di ogni piatto, traccia la produzione giornaliera e ti mostra i margini reali. Per ristoranti, bar, pasticcerie e tutto il food.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <Btn primary onClick={onRegister}>
                Inizia gratis per 30 giorni <Icon name="arrow" size={14} color="#fff" />
              </Btn>
              <Btn onClick={onLogin}>Accedi al tuo account</Btn>
            </div>
            <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 64 }}>
              Nessuna carta di credito richiesta · Disdici quando vuoi
            </div>
          </div>

          {/* Mock App */}
          <div style={{
            display: 'flex', justifyContent: 'center',
            opacity: heroVisible ? 1 : 0,
            transform: heroVisible ? 'translateY(0)' : 'translateY(40px)',
            transition: 'opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s',
          }}>
            <MockApp />
          </div>
        </div>

        {/* Gradient fade */}
        <div style={{ height: 80, background: `linear-gradient(to bottom, transparent, ${C.bgAlt})`, marginTop: -1 }} />
      </section>

      {/* ── SOCIAL PROOF BAR ───────────────────────────────────────────────── */}
      <section style={{ background: C.bgAlt, padding: '32px 24px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>
            Scelto da ristoranti, bar, pasticcerie, gelaterie e panetterie
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
            {[
              ['€ 2.400', 'risparmio medio annuo per locale'],
              ['< 5 min', 'per chiudere una giornata'],
              ['28%', 'food cost medio monitorato'],
              ['3 mesi', 'trial gratuito completo'],
            ].map(([v, l]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.03em', fontFamily: 'Georgia, serif' }}>{v}</div>
                <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEM / SOLUTION ─────────────────────────────────────────────── */}
      <section style={{ padding: '96px 24px', background: C.bg }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <Section>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
              {problems.map(({ bad, good }, i) => (
                <div key={i} style={{ padding: '28px', border: `1px solid ${C.border}`, borderRadius: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Icon name="x" size={10} color="#EF4444" />
                    </div>
                    <span style={{ fontSize: 13, color: C.textMid, lineHeight: 1.55, fontStyle: 'italic' }}>{bad}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Icon name="check" size={10} color="#22C55E" />
                    </div>
                    <span style={{ fontSize: 13, color: C.text, lineHeight: 1.55, fontWeight: 500 }}>{good}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────────── */}
      <section style={{ padding: '96px 24px', background: C.bgAlt, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <Section>
            <div style={{ maxWidth: 560, marginBottom: 56 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Funzionalità</div>
              <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 14 }}>
                Smetti di lavorare senza sapere se guadagni
              </h2>
              <p style={{ fontSize: 15, color: C.textMid, lineHeight: 1.7 }}>
                Tutto quello che ti serve per tenere i numeri sotto controllo. Nessun foglio Excel, nessuna formula.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 1, background: C.border, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {features.map(({ icon, title, desc }) => (
                <div key={title} style={{ background: C.bg, padding: '28px 28px' }}>
                  <div style={{ width: 40, height: 40, background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <Icon name={icon} size={18} color={C.text} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8, letterSpacing: '-0.01em' }}>{title}</div>
                  <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.65 }}>{desc}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </section>

      {/* ── COME FUNZIONA ──────────────────────────────────────────────────── */}
      <section style={{ padding: '96px 24px', background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <Section>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Come funziona</div>
              <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em' }}>
                Operativo in meno di 10 minuti
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 0, position: 'relative' }}>
              {steps.map(({ n, title, desc }, i) => (
                <div key={n} style={{ padding: '0 32px', borderLeft: i > 0 ? `1px solid ${C.border}` : 'none', marginBottom: 24 }}>
                  <div style={{ fontSize: 48, fontWeight: 900, color: C.border, letterSpacing: '-0.04em', fontFamily: 'Georgia, serif', marginBottom: 12, lineHeight: 1 }}>{n}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 10, letterSpacing: '-0.02em' }}>{title}</div>
                  <div style={{ fontSize: 14, color: C.textMid, lineHeight: 1.7 }}>{desc}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <section style={{ padding: '96px 24px', background: C.bgAlt, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <Section>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Prezzi</div>
              <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 10 }}>
                Prezzi chiari. Nessuna sorpresa.
              </h2>
              <p style={{ fontSize: 15, color: C.textMid }}>Inizia gratis per 30 giorni. Nessuna carta di credito.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              {[
                {
                  name: 'Pro', price: '€ 89', period: '/mese',
                  desc: 'Per attività con una sede',
                  features: ['Ricettario illimitato', 'P&L mensile', 'Produzione giornaliera', 'Magazzino & scadenzario', 'Integrazioni delivery', 'AI Assistant', 'Export PDF & Excel'],
                  primary: false,
                },
                {
                  name: 'Chain', price: '€ 149', period: '/mese',
                  desc: 'Per chi ha più punti vendita',
                  features: ['Tutto di Pro', 'Fino a 5 sedi', 'Dashboard multi-sede', 'Confronto sedi', 'Reportistica aggregata', 'Supporto prioritario', 'API access'],
                  primary: true,
                },
              ].map(({ name, price, period, desc, features: fs, primary }) => (
                <div key={name} style={{
                  background: primary ? C.text : C.bg,
                  border: `1.5px solid ${primary ? C.text : C.border}`,
                  borderRadius: 16, padding: '32px 28px',
                  position: 'relative',
                }}>
                  {primary && (
                    <div style={{ position: 'absolute', top: -12, left: 28, background: C.accent, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 12px', borderRadius: 20, letterSpacing: '0.08em' }}>
                      PIÙ SCELTO
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 600, color: primary ? 'rgba(255,255,255,0.5)' : C.textSoft, marginBottom: 6, letterSpacing: '0.05em' }}>{name}</div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 40, fontWeight: 800, color: primary ? '#fff' : C.text, letterSpacing: '-0.04em', fontFamily: 'Georgia, serif' }}>{price}</span>
                    <span style={{ fontSize: 14, color: primary ? 'rgba(255,255,255,0.5)' : C.textSoft }}>{period}</span>
                  </div>
                  <div style={{ fontSize: 13, color: primary ? 'rgba(255,255,255,0.6)' : C.textMid, marginBottom: 24 }}>{desc}</div>
                  <Btn
                    primary={!primary}
                    onClick={onRegister}
                    style={{
                      width: '100%', justifyContent: 'center', marginBottom: 24,
                      background: primary ? '#fff' : C.text,
                      color: primary ? C.text : '#fff',
                      border: primary ? '1.5px solid #fff' : `1.5px solid ${C.text}`,
                    }}
                  >
                    Inizia gratis
                  </Btn>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {fs.map(f => (
                      <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: primary ? 'rgba(255,255,255,0.75)' : C.textMid }}>
                        <Icon name="check" size={14} color={primary ? 'rgba(255,255,255,0.5)' : '#22C55E'} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: C.textSoft }}>
              Hai esigenze particolari? <a href="mailto:support@foodios.it" style={{ color: C.text, fontWeight: 600, textDecoration: 'none' }}>Scrivici →</a>
            </div>
          </Section>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section style={{ padding: '96px 24px', background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Section>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>FAQ</div>
              <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em' }}>
                Domande frequenti
              </h2>
            </div>
            {faqs.map(faq => <FaqItem key={faq.q} {...faq} />)}
          </Section>
        </div>
      </section>

      {/* ── CTA FINALE ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '96px 24px', background: C.bgDark }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <Section>
            <div style={{ width: 48, height: 48, background: C.accent, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px' }}>
              <Icon name="barChart" size={22} color="#fff" />
            </div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 16 }}>
              Inizia gratis per 30 giorni.<br />Nessuna carta di credito.
            </h2>
            <p style={{ fontSize: 15, color: '#64748B', lineHeight: 1.7, marginBottom: 36 }}>
              Unisciti ai locali che usano FoodOS per prendere decisioni basate sui numeri reali, non sull'istinto.
            </p>
            <Btn
              primary
              onClick={onRegister}
              style={{ background: '#fff', color: C.text, border: '1.5px solid #fff', fontSize: 15, padding: '14px 32px' }}
            >
              Crea il tuo account gratuito <Icon name="arrow" size={16} color={C.text} />
            </Btn>
          </Section>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#070E1A', padding: '40px 24px', borderTop: '1px solid #1E293B' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FoodOSLogo size={24} style={{ borderRadius: 6, opacity: 0.7 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#334155', letterSpacing: '-0.02em' }}>FoodOS</span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[['Privacy Policy', '/privacy'], ['Termini di Servizio', '/termini'], ['Supporto', 'mailto:support@foodios.it']].map(([label, href]) => (
              <a key={label} href={href} style={{ fontSize: 12, color: '#334155', textDecoration: 'none' }}>{label}</a>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#1E293B' }}>© {new Date().getFullYear()} FoodOS</div>
        </div>
      </footer>

    </div>
  )
}
