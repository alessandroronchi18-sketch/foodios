import React, { useState } from 'react'

const RED    = '#C0392B'
const DARK   = '#1C0A0A'
const MID    = '#6B4C44'
const LIGHT  = '#F8F4F2'
const WHITE  = '#FFFFFF'
const BORDER = '#EDE8E6'

const features = [
  { icon: '🍰', title: 'Ricettario & Food Cost', desc: 'Calcola il costo esatto di ogni ricetta, aggiorna i prezzi delle materie prime e monitora i margini in tempo reale.' },
  { icon: '📊', title: 'P&L Mensile', desc: 'Conto economico automatico per ogni mese: ricavi, food cost, margine lordo e benchmark di settore.' },
  { icon: '📅', title: 'Produzione Giornaliera', desc: 'Pianifica gli stampi da produrre, traccia il venduto e calcola l\'efficienza di ogni sessione.' },
  { icon: '📦', title: 'Magazzino', desc: 'Gestisci le scorte delle materie prime, ricevi alert di riordino e monitora gli sprechi.' },
  { icon: '🔗', title: 'Integrazioni Delivery', desc: 'Importa ordini da Deliveroo, JustEat e Glovo. Sincronizzazione automatica ogni notte.' },
  { icon: '🤖', title: 'AI Advisor', desc: 'Analisi automatica dei dati con suggerimenti personalizzati per aumentare i margini.' },
]

const stats = [
  { value: '28%', label: 'food cost medio pasticceria' },
  { value: '€2.400', label: 'risparmio medio annuo per locale' },
  { value: '< 5 min', label: 'per chiudere una giornata' },
]

export default function LandingPage({ onLogin, onRegister }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: WHITE, color: DARK, minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${BORDER}`, padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: `linear-gradient(135deg, ${RED}, #E74C3C)`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: `0 4px 12px rgba(192,57,43,0.3)` }}>🍰</div>
            <span style={{ fontSize: 18, fontWeight: 900, color: DARK, letterSpacing: '-0.02em' }}>FoodOS</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={onLogin} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, fontWeight: 600, color: MID, cursor: 'pointer' }}>
              Accedi
            </button>
            <button onClick={onRegister} style={{ padding: '8px 20px', background: RED, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: WHITE, cursor: 'pointer', boxShadow: `0 2px 8px rgba(192,57,43,0.3)` }}>
              Prova gratis →
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background: `linear-gradient(160deg, #FFF9F8 0%, #F8F4F2 100%)`, padding: '80px 24px 72px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FEF0EE', border: `1px solid #F5C6C0`, borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 600, color: RED, marginBottom: 28 }}>
            🚀 Gestionale per pasticcerie e bar artigianali
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em', color: DARK, marginBottom: 20 }}>
            Conosci il tuo <span style={{ color: RED }}>margine</span><br />su ogni dolce che vendi
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: MID, lineHeight: 1.7, marginBottom: 36, maxWidth: 560, margin: '0 auto 36px' }}>
            FoodOS calcola food cost, produzione e P&L in automatico — così sai esattamente quanto guadagni su ogni torta, cornetto e caffè.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onRegister} style={{ padding: '14px 32px', background: RED, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, color: WHITE, cursor: 'pointer', boxShadow: `0 4px 20px rgba(192,57,43,0.35)` }}>
              Inizia gratis — 3 mesi trial
            </button>
            <button onClick={onLogin} style={{ padding: '14px 28px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 12, fontSize: 15, fontWeight: 600, color: MID, cursor: 'pointer' }}>
              Ho già un account
            </button>
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: '#B09090' }}>
            Nessuna carta di credito richiesta · Disdici quando vuoi
          </div>
        </div>
      </section>

      {/* STATS */}
      <section style={{ background: RED, padding: '36px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 0 }}>
          {stats.map(({ value, label }) => (
            <div key={label} style={{ textAlign: 'center', padding: '12px 24px', borderRight: `1px solid rgba(255,255,255,0.15)` }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: WHITE, fontFamily: 'Georgia, serif' }}>{value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4, fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '72px 24px', background: WHITE }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, color: DARK, marginBottom: 12, letterSpacing: '-0.02em' }}>
              Tutto quello che serve al tuo locale
            </h2>
            <p style={{ fontSize: 15, color: MID, maxWidth: 480, margin: '0 auto' }}>
              Un unico strumento per tenere sotto controllo produzione, costi e margini ogni giorno.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {features.map(({ icon, title, desc }) => (
              <div key={title} style={{ background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px 26px' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: DARK, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 13, color: MID, lineHeight: 1.65 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ padding: '72px 24px', background: LIGHT }}>
        <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, color: DARK, marginBottom: 12, letterSpacing: '-0.02em' }}>
            Prezzi semplici e trasparenti
          </h2>
          <p style={{ fontSize: 15, color: MID, marginBottom: 40 }}>3 mesi di prova gratuita, poi decidi tu.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { name: 'Trial', price: 'Gratis', period: '3 mesi', features: ['Tutte le funzioni', '1 sede', 'Supporto email'], cta: 'Inizia ora', primary: false },
              { name: 'Base', price: '€39', period: '/mese', features: ['Tutte le funzioni', '1 sede', 'Supporto prioritario', 'Export PDF/Excel'], cta: 'Passa a Base', primary: true },
              { name: 'Pro', price: '€69', period: '/mese', features: ['Tutto di Base', 'Fino a 3 sedi', 'AI Advisor avanzato', 'API & integrazioni'], cta: 'Passa a Pro', primary: false },
            ].map(({ name, price, period, features: fs, cta, primary }) => (
              <div key={name} style={{ background: primary ? RED : WHITE, border: `2px solid ${primary ? RED : BORDER}`, borderRadius: 20, padding: '28px 24px', position: 'relative' }}>
                {primary && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: DARK, color: WHITE, fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.1em' }}>PIÙ SCELTO</div>}
                <div style={{ fontSize: 13, fontWeight: 700, color: primary ? 'rgba(255,255,255,0.7)' : MID, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{name}</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: primary ? WHITE : DARK, fontFamily: 'Georgia, serif' }}>{price}<span style={{ fontSize: 14, fontWeight: 500 }}>{period}</span></div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0', textAlign: 'left' }}>
                  {fs.map(f => (
                    <li key={f} style={{ fontSize: 13, color: primary ? 'rgba(255,255,255,0.85)' : MID, padding: '5px 0', borderBottom: `1px solid ${primary ? 'rgba(255,255,255,0.1)' : BORDER}`, display: 'flex', gap: 8 }}>
                      <span style={{ color: primary ? 'rgba(255,255,255,0.5)' : '#A0C090' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={onRegister} style={{ width: '100%', padding: '12px', background: primary ? WHITE : RED, color: primary ? RED : WHITE, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  {cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINALE */}
      <section style={{ padding: '72px 24px', background: DARK, textAlign: 'center' }}>
        <div style={{ maxWidth: 580, margin: '0 auto' }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>🍰</div>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 900, color: WHITE, marginBottom: 14, letterSpacing: '-0.02em' }}>
            Pronto a conoscere il tuo vero margine?
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginBottom: 32, lineHeight: 1.7 }}>
            Unisciti alle pasticcerie che usano FoodOS per prendere decisioni basate sui dati, non sull'istinto.
          </p>
          <button onClick={onRegister} style={{ padding: '14px 36px', background: RED, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, color: WHITE, cursor: 'pointer', boxShadow: `0 4px 20px rgba(192,57,43,0.5)` }}>
            Inizia gratis — 3 mesi trial →
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#120505', padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
          <a href="/privacy" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="/termini" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>Termini di Servizio</a>
          <a href="mailto:support@foodios.it" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>Supporto</a>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>© {new Date().getFullYear()} FoodOS · Fatto con 🍰 in Italia</div>
      </footer>

    </div>
  )
}
