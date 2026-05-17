import React from 'react'

/* ────────────────────────────────────────────────────────────────────────────
   LOGO PREVIEW — concept "vedo non vedo"
   La F emerge dallo spazio negativo. 4 varianti dello stesso concept.
   Route temporanea: /logo-preview
─────────────────────────────────────────────────────────────────────────── */

const RED   = '#C0392B'
const DARK  = '#1F1812'
const LIGHT = '#FDFAF7'

const SERIF = "'Fraunces', 'Iowan Old Style', Georgia, serif"
const SANS  = "'Inter', system-ui, -apple-system, sans-serif"

/* ──────────────────────────────────────────────────────────
   VARIANTE 1 — ANGOLI
   Quadrato arrotondato pieno, F sottratta come spazio negativo.
   Minimal geometrico.
─────────────────────────────────────────────────────────── */
function LogoV1({ size = 64, color = RED }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block' }} aria-label="FoodOS">
      <path
        fill={color}
        fillRule="evenodd"
        d="M 14 0 L 50 0 C 58 0 64 6 64 14 L 64 50 C 64 58 58 64 50 64 L 14 64 C 6 64 0 58 0 50 L 0 14 C 0 6 6 0 14 0 Z M 16 12 L 50 12 L 50 22 L 26 22 L 26 27 L 40 27 L 40 35 L 26 35 L 26 52 L 16 52 Z"
      />
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────
   VARIANTE 2 — CURVE
   Cerchio pieno + F con angoli arrotondati. Organico, caldo.
─────────────────────────────────────────────────────────── */
function LogoV2({ size = 64, color = RED }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block' }} aria-label="FoodOS">
      <path
        fill={color}
        fillRule="evenodd"
        d="M 32 0 A 32 32 0 1 1 32 64 A 32 32 0 1 1 32 0 Z M 18 12 L 48 12 Q 50 12 50 14 L 50 20 Q 50 22 48 22 L 26 22 L 26 27 L 38 27 Q 40 27 40 29 L 40 33 Q 40 35 38 35 L 26 35 L 26 50 Q 26 52 24 52 L 18 52 Q 16 52 16 50 L 16 14 Q 16 12 18 12 Z"
      />
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────
   VARIANTE 3 — SOLIDO CON TAGLIO
   Quadrato netto (no rounding) + F più spessa, taglio aggressivo.
   Bold, contemporaneo.
─────────────────────────────────────────────────────────── */
function LogoV3({ size = 64, color = RED }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block' }} aria-label="FoodOS">
      <path
        fill={color}
        fillRule="evenodd"
        d="M 0 0 L 64 0 L 64 64 L 0 64 Z M 14 10 L 54 10 L 54 23 L 26 23 L 26 28 L 42 28 L 42 36 L 26 36 L 26 54 L 14 54 Z"
      />
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────
   VARIANTE 4 — LIBERA (esagono)
   Esagono flat-top + F nel negativo. Concept: tessera/piastrella
   italiana — distintiva, premium, memorabile.
─────────────────────────────────────────────────────────── */
function LogoV4({ size = 64, color = RED }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block' }} aria-label="FoodOS">
      <path
        fill={color}
        fillRule="evenodd"
        d="M 16 0 L 48 0 L 64 32 L 48 64 L 16 64 L 0 32 Z M 18 14 L 48 14 L 48 23 L 28 23 L 28 28 L 40 28 L 40 35 L 28 35 L 28 50 L 18 50 Z"
      />
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────
   SWATCH CARD — mostra una variante su uno sfondo
─────────────────────────────────────────────────────────── */
function SwatchCard({ bg, label, sublabel, Logo }) {
  const isDark = bg === DARK
  return (
    <div style={{
      background: bg,
      borderRadius: 18,
      padding: '36px 32px 28px',
      border: `1px solid ${isDark ? 'rgba(244,236,227,0.06)' : '#EBE3DC'}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 22,
    }}>
      <Logo size={96} color={RED}/>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo size={32} color={RED}/>
        <span style={{
          fontFamily: SERIF, fontSize: 26, fontWeight: 600,
          color: isDark ? LIGHT : DARK,
          letterSpacing: '-0.03em',
        }}>FoodOS</span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        paddingTop: 16,
        borderTop: `1px solid ${isDark ? 'rgba(244,236,227,0.08)' : '#F0E7DD'}`,
        width: '100%', justifyContent: 'center',
      }}>
        <Logo size={20} color={RED}/>
        <Logo size={16} color={RED}/>
        <Logo size={12} color={RED}/>
      </div>

      <div style={{
        fontSize: 10, fontWeight: 700,
        color: isDark ? 'rgba(244,236,227,0.45)' : '#9C887F',
        letterSpacing: '0.14em', textTransform: 'uppercase',
        marginTop: -6, textAlign: 'center',
      }}>
        {label}
        {sublabel && (
          <div style={{
            fontSize: 11,
            color: isDark ? 'rgba(244,236,227,0.42)' : '#9C887F',
            letterSpacing: '0.02em', textTransform: 'none', fontWeight: 500,
            marginTop: 4,
          }}>{sublabel}</div>
        )}
      </div>
    </div>
  )
}

const VARIANTS = [
  {
    id: 'v1',
    title: 'Variante 1 — Angoli',
    tagline: 'Minimal geometrico',
    desc: "Quadrato arrotondato in pieno colore: la F appare come spazio sottratto. Il più sobrio dei quattro: facile da scalare, ottima leggibilità a tutte le dimensioni, neutralità da brand SaaS.",
    Logo: LogoV1,
  },
  {
    id: 'v2',
    title: 'Variante 2 — Curve',
    tagline: 'Organico e caldo',
    desc: "Cerchio pieno, F con angoli morbidi (Bézier). La forma circolare evoca il piatto / la padella; più caldo e amichevole, meno aggressivo del quadrato. Italiano = artigianato.",
    Logo: LogoV2,
  },
  {
    id: 'v3',
    title: 'Variante 3 — Solido con taglio',
    tagline: 'Bold e contemporaneo',
    desc: "Quadrato senza raggi, F più spessa e tagliata a filo. Aggressivo, tipografico, da brand serio. Dominante anche a dimensioni piccole, funziona forte su sfondi chiari.",
    Logo: LogoV3,
  },
  {
    id: 'v4',
    title: 'Variante 4 — Esagono',
    tagline: 'Libera interpretazione',
    desc: "Esagono flat-top come 'tessera' del menù / piastrella italiana. Sei lati netti = forte memorabilità ottica. Bilancia il geometrico (V1) con qualcosa di distintivo (V3) — meno banale, più riconoscibile a distanza.",
    Logo: LogoV4,
  },
]

/* ════════════════════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════════════════ */
export default function LogoPreview() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#FBF8F4',
      fontFamily: SANS, color: DARK,
      WebkitFontSmoothing: 'antialiased',
      padding: '40px 24px 80px',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        <a href="/" style={{
          fontSize: 13, color: '#5C4842', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 36,
        }}>← Torna alla home</a>

        <div style={{ marginBottom: 64 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: RED,
            letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14,
          }}>
            Logo concept
          </div>
          <h1 style={{
            fontFamily: SERIF, fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 500, lineHeight: 1.05,
            letterSpacing: '-0.035em', color: DARK, margin: '0 0 18px',
          }}>
            Vedo / <em style={{ fontStyle: 'italic', color: RED }}>non vedo</em>
          </h1>
          <p style={{ fontSize: 17, color: '#5C4842', lineHeight: 1.65, maxWidth: 660, margin: 0 }}>
            Quattro varianti dello stesso concept: la <strong style={{ color: DARK }}>F</strong> non
            viene disegnata, <em>emerge</em> dallo spazio negativo delle forme che la contengono.
            Tutte usano il rosso brand <code style={{ background: '#F4ECE3', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>#C0392B</code> su
            sfondo scuro <code style={{ background: '#F4ECE3', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>#1F1812</code> o
            chiaro <code style={{ background: '#F4ECE3', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>#FDFAF7</code>.
          </p>
        </div>

        {VARIANTS.map(({ id, title, tagline, desc, Logo }) => (
          <section key={id} style={{ marginBottom: 56 }}>
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <h2 style={{
                fontFamily: SERIF, fontSize: 30, fontWeight: 600,
                color: DARK, letterSpacing: '-0.025em', margin: 0,
              }}>{title}</h2>
              <span style={{
                fontSize: 11, fontWeight: 700, color: RED,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                padding: '4px 10px', background: '#FDF2EE', borderRadius: 999,
              }}>{tagline}</span>
            </div>
            <p style={{ fontSize: 14, color: '#5C4842', margin: '0 0 22px', lineHeight: 1.6, maxWidth: 760 }}>{desc}</p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 20,
            }}>
              <SwatchCard bg={DARK} Logo={Logo} label="su sfondo scuro" sublabel="#1F1812"/>
              <SwatchCard bg={LIGHT} Logo={Logo} label="su sfondo chiaro" sublabel="#FDFAF7"/>
            </div>
          </section>
        ))}

        <div style={{
          marginTop: 56, padding: '24px 28px',
          background: '#F4ECE3', borderRadius: 16,
          fontSize: 13, color: '#5C4842', lineHeight: 1.7,
        }}>
          <strong style={{ color: DARK }}>Da scegliere:</strong> dimmi quale variante preferisci
          (V1 / V2 / V3 / V4) — o se vuoi una combinazione/iterazione — e procedo a sostituire
          il logo corrente in <code style={{ background: '#FFF', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>src/components/Logo.jsx</code> in
          modo che si aggiorni ovunque venga usato (landing, auth, dashboard).
        </div>
      </div>
    </div>
  )
}
