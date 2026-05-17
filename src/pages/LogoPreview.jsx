import React from 'react'
import Logo from '../components/Logo'

/**
 * /logo — public brand preview page.
 *
 * Showcases the FoodOS logo at all relevant sizes, in both icon-only and
 * horizontal lockup variants, on light and dark surfaces. Useful for design
 * review, marketing exports and ensuring the mark renders correctly across
 * contexts (favicon → hero).
 */

const INK = '#0E1726'
const INK_SOFT = '#475264'
const MUTED = '#8B95A7'
const FAINT = '#B5BCC8'
const BG = '#F7F8FA'
const BG_CARD = '#FFFFFF'
const BORDER = '#E5E9EF'
const DARK_BG = '#0A0D14'
const DARK_RAISED = '#11151E'

const SANS = "'Inter', system-ui, -apple-system, sans-serif"

const ICON_SIZES = [16, 24, 32, 48, 64, 96, 128, 192]

function Section({ title, hint, children, dark }) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: dark ? 'rgba(255,255,255,0.55)' : MUTED,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>{title}</h2>
        {hint && (
          <p style={{
            margin: '6px 0 0',
            fontSize: 13,
            color: dark ? 'rgba(255,255,255,0.55)' : INK_SOFT,
            letterSpacing: '-0.005em',
            lineHeight: 1.5,
          }}>{hint}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function Tile({ children, dark, padding = '32px 24px', minHeight = 140 }) {
  return (
    <div style={{
      background: dark ? DARK_RAISED : BG_CARD,
      border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : BORDER}`,
      borderRadius: 14,
      padding,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16,
      minHeight,
      boxShadow: dark ? 'none' : '0 1px 2px rgba(15,23,42,0.04)',
    }}>{children}</div>
  )
}

function Label({ children, dark }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 500,
      color: dark ? 'rgba(255,255,255,0.42)' : MUTED,
      letterSpacing: '0.02em',
      fontVariantNumeric: 'tabular-nums',
    }}>{children}</span>
  )
}

function ColorSwatch({ hex, name, sub, textLight }) {
  return (
    <div style={{
      background: BG_CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      <div style={{
        background: hex,
        height: 96,
        display: 'flex',
        alignItems: 'flex-end',
        padding: 14,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 500,
          color: textLight ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,38,0.65)',
          letterSpacing: '0.04em',
          fontVariantNumeric: 'tabular-nums',
        }}>{hex.toUpperCase()}</span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: INK,
          letterSpacing: '-0.01em',
        }}>{name}</div>
        {sub && (
          <div style={{
            fontSize: 11,
            color: MUTED,
            marginTop: 2,
            letterSpacing: '-0.005em',
          }}>{sub}</div>
        )}
      </div>
    </div>
  )
}

export default function LogoPreview() {
  return (
    <div style={{
      minHeight: '100vh',
      background: BG,
      fontFamily: SANS,
      color: INK,
      WebkitFontSmoothing: 'antialiased',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 32px 96px' }}>

        {/* Page header */}
        <header style={{ marginBottom: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
            <Logo size={56} style={{ borderRadius: 14, boxShadow: '0 10px 30px rgba(192,57,43,0.22)' }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Brand book
              </div>
              <h1 style={{ margin: '4px 0 0', fontSize: 36, fontWeight: 700, color: INK, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                FoodOS Logo
              </h1>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 15, color: INK_SOFT, lineHeight: 1.55, maxWidth: 640, letterSpacing: '-0.005em' }}>
            Monogramma "F" geometrico con bracci calligrafici a punta su fondo coal caldo. Rosso crimson <code style={{ background: BG_CARD, padding: '1px 6px', borderRadius: 4, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: 'inherit' }}>#C0392B</code>, container quasi-nero per garantire contrasto su qualsiasi superficie. Wordmark Inter ExtraBold.
          </p>
        </header>

        {/* Icon sizes on light */}
        <Section title="Icon · superficie chiara" hint="Resa del marchio sullo sfondo standard dell'app. Il container scuro caldo offre contrasto naturale.">
          <Tile padding="32px 16px">
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 28, flexWrap: 'wrap', width: '100%' }}>
              {ICON_SIZES.map(s => (
                <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <Logo size={s} />
                  <Label>{s}px</Label>
                </div>
              ))}
            </div>
          </Tile>
        </Section>

        {/* Icon sizes on dark */}
        <Section title="Icon · superficie scura" hint="Stesso marchio su sidebar / dark mode. Il container nero caldo continua a leggere.">
          <Tile dark padding="32px 16px">
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 28, flexWrap: 'wrap', width: '100%' }}>
              {ICON_SIZES.map(s => (
                <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <Logo size={s} />
                  <Label dark>{s}px</Label>
                </div>
              ))}
            </div>
          </Tile>
        </Section>

        {/* Horizontal lockup */}
        <Section title="Lockup orizzontale" hint="Icona + wordmark per header e firme. Il tono del wordmark si adatta al fondo.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Tile>
              <Logo variant="horizontal" tone="light" size={56} />
              <Label>tone="light" — 56px</Label>
            </Tile>
            <Tile dark>
              <Logo variant="horizontal" tone="dark" size={56} />
              <Label dark>tone="dark" — 56px</Label>
            </Tile>
            <Tile>
              <Logo variant="horizontal" tone="light" size={32} />
              <Label>tone="light" — 32px</Label>
            </Tile>
            <Tile dark>
              <Logo variant="horizontal" tone="dark" size={32} />
              <Label dark>tone="dark" — 32px</Label>
            </Tile>
          </div>
        </Section>

        {/* Wordmark only */}
        <Section title="Wordmark" hint="Solo testo, per contesti in cui l'icona è già presente (es. nei pulsanti).">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Tile>
              <Logo variant="wordmark" tone="light" size={56} />
            </Tile>
            <Tile dark>
              <Logo variant="wordmark" tone="dark" size={56} />
            </Tile>
          </div>
        </Section>

        {/* Favicon test */}
        <Section title="Favicon" hint="Resa nel tab del browser. Test reale del minimo leggibile.">
          <Tile>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px 8px 8px',
              background: '#EEF1F6',
              borderRadius: 10,
              border: `1px solid ${BORDER}`,
              maxWidth: 360,
              width: '100%',
            }}>
              <Logo size={16} />
              <div style={{ flex: 1, fontSize: 13, color: INK, fontWeight: 500, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                FoodOS — Gestionale Food Cost
              </div>
              <span style={{ fontSize: 11, color: MUTED }}>×</span>
            </div>
            <Label>simulazione tab @ 16px</Label>
          </Tile>
        </Section>

        {/* Palette */}
        <Section title="Palette" hint="Colori chiave del sistema. Il rosso crimson è il cuore del brand; il coal warm è il fondamento di tutte le superfici scure.">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 14,
          }}>
            <ColorSwatch hex="#C0392B" name="Brand"        sub="warm crimson · CTA, accenti" textLight />
            <ColorSwatch hex="#A02617" name="Brand Dark"   sub="hover / pressed"             textLight />
            <ColorSwatch hex="#1F1812" name="Coal Warm"    sub="container icona"             textLight />
            <ColorSwatch hex="#0A0D14" name="Side"         sub="sidebar / dark surface"     textLight />
            <ColorSwatch hex="#0E1726" name="Ink"          sub="testo primario"              textLight />
            <ColorSwatch hex="#475264" name="Ink Soft"     sub="testo secondario"            textLight />
            <ColorSwatch hex="#8B95A7" name="Muted"        sub="micro-copy, label"  />
            <ColorSwatch hex="#F7F8FA" name="Background"   sub="app surface" />
            <ColorSwatch hex="#FFFFFF" name="Card"         sub="superficie cards" />
            <ColorSwatch hex="#E5E9EF" name="Border"       sub="bordi standard" />
          </div>
        </Section>

        {/* Typography */}
        <Section title="Tipografia" hint="Inter — geometric sans, tracking stretto sui titoli, tabular nums sui numeri.">
          <Tile padding="28px 32px" minHeight={0}>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: INK, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                Buongiorno, Pasticceria del Corso
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: INK, letterSpacing: '-0.025em' }}>
                Food cost medio — <span style={{ fontVariantNumeric: 'tabular-nums' }}>32,4%</span>
              </div>
              <div style={{ fontSize: 14, color: INK_SOFT, letterSpacing: '-0.005em', lineHeight: 1.55, maxWidth: 560 }}>
                FoodOS analizza il food cost di ogni ricetta, traccia il magazzino e ti dice in tempo reale quanto stai guadagnando per ogni prodotto venduto.
              </div>
              <div style={{ fontSize: 11, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                Eyebrow / Label
              </div>
            </div>
          </Tile>
        </Section>

        {/* Footer */}
        <footer style={{
          paddingTop: 32,
          borderTop: `1px solid ${BORDER}`,
          fontSize: 12,
          color: MUTED,
          letterSpacing: '-0.005em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <span>FoodOS · brand book · uso interno</span>
          <a href="/" style={{ color: INK_SOFT, textDecoration: 'none', borderBottom: `1px dashed ${FAINT}` }}>
            ← torna all'app
          </a>
        </footer>

      </div>
    </div>
  )
}
