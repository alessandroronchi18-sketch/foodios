import React, { useEffect, useRef, useState } from 'react'
import Logo from '../components/Logo'
import CatIcon from '../components/Icon'
import usePlanPricing, { fmtPrezzo } from '../lib/usePlanPricing'
import { temaPubblico, SERIF_PUBBLICO, SANS_PUBBLICO } from '../lib/temaPubblico'
import { inVendita, PLAN_LABEL } from '../lib/planAccess'

/* ────────────────────────────────────────────────────────────────────────────
   LA PAGINA DI BENVENUTO

   Rifatta il 16/09/2026. Quella di prima era lunga 9.729 px sul computer e
   13.201 px sul telefono: quindici schermate e mezzo, 1.280 parole, undici
   blocchi, dieci pulsanti che portano tutti allo stesso posto, e la frase
   "3 mesi gratis" scritta nove volte. Chi arriva non legge quindici schermate:
   guarda la prima, e se non capisce cos'è se ne va.

   Le cinque domande a cui deve rispondere in pochi secondi:
     cos'è · per chi · cosa ci guadagno · quanto costa · come comincio.

   L'impaginazione viene da notco.ai, letta e non ricordata: un'idea per
   blocco, il titolo grande su due righe, un paragrafo corto sotto, tre
   colonne di confronto, un percorso in tre tappe, i numeri come prova invece
   degli aggettivi, e un solo invito all'azione — in alto e in fondo, non a
   ogni schermata. Da notco.ai si prende il ritmo, non il vestito: quello di
   Foodos resta il suo, crema e bordeaux con la serif nei titoli.
─────────────────────────────────────────────────────────────────────────── */

const T = temaPubblico
const SERIF = SERIF_PUBBLICO
const SANS = SANS_PUBBLICO

// La scala di questa pagina. Prima le misure di carattere erano 24 diverse
// (da 12 a 84 px), scritte a mano una per una: bastava che due riquadri
// affiancati ne usassero due vicine — 13 e 14 — perché le parole non
// partissero dalla stessa altezza. Qui sono sette, hanno un nome, e la pagina
// non ne usa altre. Sotto i 12 px non si scende.
const S = {
  display: 'clamp(38px, 7vw, 68px)',  // il titolo dell'apertura
  titolo: 'clamp(26px, 3.4vw, 38px)', // i titoli dei blocchi
  cifra: 'clamp(28px, 3.2vw, 40px)',  // i numeri grandi (prezzo, tappe)
  sottotitolo: 20,                    // la riga sotto il titolo dell'apertura
  guida: 16,                          // il testo corrente
  corpo: 14,                          // le descrizioni brevi
  nota: 12,                           // etichette, note, piè di pagina
}

const MAX = 1120   // la larghezza del testo sul computer
const SPAZIO = 96  // il respiro fra un blocco e l'altro (64 sul telefono)

/* ── strumenti ───────────────────────────────────────────────────────────── */

function useIsMobile(bp = 860) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false)
  useEffect(() => {
    const onR = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [bp])
  return m
}

// Vero se nelle impostazioni del sistema è attivo "riduci le animazioni".
const menoAnimazioni = () => {
  if (typeof window === 'undefined') return true
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}

// I blocchi entrano scorrendo. Una volta sola, e senza spostamenti grandi:
// l'effetto deve accompagnare la lettura, non farsi notare.
function Reveal({ children, delay = 0, style }) {
  const ref = useRef(null)
  // Si parte già visibili in due casi, e in tutti e due l'animazione è un
  // danno: chi ha chiesto meno animazioni nelle impostazioni del telefono, e
  // il browser che non sa osservare lo scorrimento. Prima, in quel secondo
  // caso, mezza pagina restava bianca per sempre: il testo c'era, ma a zero.
  const [visto, setVisto] = useState(() =>
    typeof IntersectionObserver === 'undefined' || menoAnimazioni())
  useEffect(() => {
    if (visto) return
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisto(true); obs.disconnect() }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [visto])
  return (
    <div ref={ref} style={{
      opacity: visto ? 1 : 0,
      transform: visto ? 'none' : 'translateY(16px)',
      transition: `opacity .6s ${delay}ms cubic-bezier(.16,1,.3,1), transform .6s ${delay}ms cubic-bezier(.16,1,.3,1)`,
      // Reveal sta fra la griglia e la tessera: senza altezza piena spezza lo
      // stretch dei figli e le colonne affiancate vengono alte in modo diverso.
      height: '100%',
      ...style,
    }}>{children}</div>
  )
}

const Freccia = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 5 19 12 13 19" />
  </svg>
)

function Bottone({ children, variant = 'primary', onClick, style }) {
  const [h, setH] = useState(false)
  const pelle = {
    primary: {
      background: h ? T.redDeep : T.red, color: T.textOnDark,
      border: `1px solid ${h ? T.redDeep : T.red}`,
      boxShadow: h ? '0 8px 26px rgba(110,14,26,0.26)' : '0 4px 14px rgba(110,14,26,0.16)',
    },
    secondary: {
      background: h ? T.creamDeep : 'transparent', color: T.ink,
      border: `1px solid ${T.border}`, boxShadow: 'none',
    },
    light: {
      background: h ? T.cream : T.paper, color: T.ink,
      border: `1px solid ${h ? T.cream : T.paper}`,
      boxShadow: h ? '0 10px 28px rgba(15,9,7,0.16)' : '0 4px 14px rgba(15,9,7,0.10)',
    },
  }[variant]
  return (
    <button onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        // 48 px di altezza minima: è la misura sotto la quale un dito sbaglia.
        minHeight: 48, padding: '0 26px', fontSize: S.guida, fontWeight: 600,
        fontFamily: SANS, borderRadius: 999, letterSpacing: '-0.005em',
        cursor: 'pointer', transition: 'all .2s ease', whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        ...pelle, ...style,
      }}>{children}</button>
  )
}

// L'etichetta sopra il titolo di ogni blocco. Una riga, maiuscoletto.
function Occhiello({ children }) {
  return (
    <div style={{
      fontSize: S.nota, fontWeight: 700, color: T.red,
      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14,
    }}>{children}</div>
  )
}

function Titolo({ children, style }) {
  return (
    <h2 style={{
      fontFamily: SERIF, fontSize: S.titolo, fontWeight: 500, color: T.ink,
      letterSpacing: '-0.03em', lineHeight: 1.12, margin: 0, ...style,
    }}>{children}</h2>
  )
}

/* ── la fotografia del prodotto ──────────────────────────────────────────── */

// L'unica immagine della pagina: il pannello del mattino, con i numeri di una
// pasticceria. Vale più di tre paragrafi che raccontano com'è fatto.
function Anteprima() {
  const isMobile = useIsMobile()
  const riquadri = [
    ['Incassi oggi', '847 €', '+12%'],
    ['Food cost', '26,8%', 'obiettivo 30%'],
    ['Margine', '618 €', '73% degli incassi'],
  ]
  const ricette = [
    ['Sfogliatella riccia', '24%', '2,15 €'],
    ['Crostata di frutta', '31%', '5,40 €'],
    ['Babà al rum', '19%', '1,85 €'],
  ]
  return (
    <div style={{
      background: T.paper, borderRadius: 16, overflow: 'hidden', width: '100%',
      boxShadow: '0 30px 70px rgba(15,9,7,0.16), 0 0 0 1px rgba(15,9,7,0.05)',
    }}>
      <div style={{
        background: T.cream, padding: '10px 14px', display: 'flex',
        alignItems: 'center', gap: 8, borderBottom: `1px solid ${T.border}`,
      }}>
        {[T.textSoft, T.textSoft, T.textSoft].map((c, i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.45 }} />
        ))}
        <div style={{
          flex: 1, height: 22, borderRadius: 6, background: T.paper, marginLeft: 8,
          display: 'flex', alignItems: 'center', padding: '0 10px', minWidth: 0,
          fontSize: S.nota, color: T.textSoft, border: `1px solid ${T.border}`,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{isMobile ? 'app.foodos.it' : 'app.foodos.it · Pasticceria del Corso'}</div>
      </div>

      <div style={{ background: T.cream, padding: isMobile ? '16px 14px' : '22px 24px' }}>
        <div style={{
          fontSize: S.nota, fontWeight: 700, color: T.textSoft,
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
        }}>Mercoledì 13 maggio</div>
        <div style={{
          fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: T.ink,
          letterSpacing: '-0.02em', marginBottom: 16,
        }}>Buongiorno, Marco</div>

        <div style={{
          display: 'grid', gap: 10, marginBottom: 12,
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
        }}>
          {riquadri.map(([l, v, sub]) => (
            <div key={l} style={{
              background: T.paper, borderRadius: 10, border: `1px solid ${T.border}`,
              padding: '10px 12px',
            }}>
              <div style={{
                fontSize: S.nota, fontWeight: 700, color: T.textSoft,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                marginBottom: 6, minHeight: 16,
              }}>{l}</div>
              <div style={{
                fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: T.ink,
                letterSpacing: '-0.02em', lineHeight: 1, minHeight: 22,
              }}>{v}</div>
              <div style={{ fontSize: S.nota, color: T.green, marginTop: 6, fontWeight: 600, minHeight: 16 }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ background: T.paper, borderRadius: 10, border: `1px solid ${T.border}`, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
            <div style={{ fontSize: S.corpo, fontWeight: 700, color: T.ink }}>Quali dolci rendono di più</div>
            <div style={{ fontSize: S.nota, color: T.textSoft, whiteSpace: 'nowrap' }}>maggio 2026</div>
          </div>
          {ricette.map(([n, fc, m], i) => (
            <div key={n} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, padding: '7px 0', borderTop: i > 0 ? `1px solid ${T.borderSoft}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <div style={{ width: 4, height: 18, borderRadius: 4, background: T.red, opacity: 1 - i * 0.3, flexShrink: 0 }} />
                <div style={{
                  fontSize: S.nota, color: T.ink, fontWeight: 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{n}</div>
              </div>
              <div style={{ display: 'flex', gap: 14, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontSize: S.nota, color: T.textSoft }}>food cost <span style={{ color: T.ink, fontWeight: 700 }}>{fc}</span></div>
                <div style={{ fontFamily: SERIF, fontSize: S.nota, fontWeight: 700, color: T.ink }}>{m}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── la pagina ───────────────────────────────────────────────────────────── */

export default function LandingPage({ onLogin, onRegister }) {
  const prezzi = usePlanPricing()
  // Quali piani si mostrano in vetrina. Comanda `attivo` sulla riga di
  // plan_pricing, che il titolare cambia dal pannello admin; l'elenco nel
  // codice interviene solo se quella riga non si riesce a leggere.
  const mostraPiano = (chiave) => inVendita(chiave, prezzi?.meta?.[chiave])
  const nPianiMostrati = ['base', 'pro', 'chain'].filter(mostraPiano).length
  const [sceso, setSceso] = useState(false)
  // Chi ha chiesto meno animazioni trova l'apertura già al suo posto.
  const [aperto, setAperto] = useState(() => menoAnimazioni())
  const isMobile = useIsMobile()

  useEffect(() => {
    const onScroll = () => setSceso(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setAperto(true), 60)
    return () => clearTimeout(t)
  }, [])

  const vaiA = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  const padBlocco = isMobile ? '64px 20px' : `${SPAZIO}px 24px`
  const dentro = { maxWidth: MAX, margin: '0 auto', width: '100%' }

  // Le tre cose che si fanno con Foodos. Una frase ciascuna: se ne servono due
  // per spiegarla, vuol dire che sono due cose.
  const coseCheFa = [
    {
      icona: 'camera',
      titolo: 'La fattura la legge lui',
      testo: 'Fotografi la bolla del fornitore e i prezzi nuovi entrano nelle ricette. Il food cost si rifà da solo, su tutto il ricettario.',
    },
    {
      icona: 'clock',
      titolo: 'La sera chiudi dal telefono',
      testo: 'Segni quanto hai prodotto e quanto hai venduto. Avanzi, sprechi e costo della giornata li conta lui.',
    },
    {
      icona: 'barChart',
      titolo: 'Vedi chi ti rende e chi no',
      testo: 'Margine e food cost ricetta per ricetta, con il P&L del mese sempre aggiornato. Si capisce subito cosa alzare di prezzo.',
    },
  ]

  const tappe = [
    ['01', 'Carichi il ricettario', 'Da un file Excel, da una foto del quaderno, o a mano. I costi degli ingredienti li calcola lui.'],
    ['02', 'Registri la giornata', 'Ogni sera, dal telefono: quanto è uscito dal forno e quanto è andato via dal banco.'],
    ['03', 'Guardi i numeri', 'Food cost, margini, P&L e scorte. Aggiornati, non di tre mesi fa.'],
  ]

  const dentroIlPiano = [
    'Ricettario e semilavorati senza limiti',
    'Food cost e margini per ricetta',
    'Produzione, magazzino, sprechi',
    'Cassa e prima nota',
    'Fatture fornitori e scadenzario',
    'P&L mensile e costi fissi',
    'Assistente AI sui tuoi numeri',
    'Più sedi, con ricettario in comune',
    'Esportazione in Excel e PDF',
  ]

  return (
    <div style={{
      fontFamily: SANS, background: T.cream, color: T.ink,
      minHeight: '100vh', overflowX: 'hidden', WebkitFontSmoothing: 'antialiased',
    }}>

      {/* ── BARRA ──────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: sceso ? 'rgba(251,248,244,0.92)' : 'transparent',
        backdropFilter: sceso ? 'blur(18px) saturate(180%)' : 'none',
        WebkitBackdropFilter: sceso ? 'blur(18px) saturate(180%)' : 'none',
        borderBottom: `1px solid ${sceso ? T.border : 'transparent'}`,
        transition: 'background .3s ease, border-color .3s ease',
      }}>
        <div style={{
          ...dentro, padding: isMobile ? '0 16px' : '0 24px', height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Logo size={30} style={{ borderRadius: 8, flexShrink: 0 }} />
            <span style={{
              fontFamily: SERIF, fontSize: 22, fontWeight: 600,
              letterSpacing: '-0.03em', color: T.ink,
            }}>Foodos</span>
          </div>

          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
              {[['come-funziona', 'Come si comincia'], ['prezzi', 'Prezzo']].map(([id, lbl]) => (
                <button key={id} onClick={() => vaiA(id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS,
                  fontSize: S.corpo, fontWeight: 500, color: T.textMid,
                  minHeight: 44, padding: 0, whiteSpace: 'nowrap',
                }}>{lbl}</button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={onLogin} style={{
              minHeight: 44, padding: '0 14px', background: 'none', border: 'none',
              fontSize: S.corpo, fontWeight: 600, color: T.ink, cursor: 'pointer',
              fontFamily: SANS, borderRadius: 999, whiteSpace: 'nowrap',
            }}>Accedi</button>
            <Bottone onClick={onRegister} style={{ minHeight: 44, padding: '0 20px', fontSize: S.corpo }}>
              Prova gratis
            </Bottone>
          </div>
        </div>
      </nav>

      {/* ── 1. APERTURA — cos'è, per chi, quanto costa, come comincio ──── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(circle at 50% -15%, rgba(110,14,26,0.07), transparent 55%)',
        }} />

        <div style={{
          ...dentro, position: 'relative',
          padding: isMobile ? '40px 20px 56px' : '72px 24px 96px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          opacity: aperto ? 1 : 0,
          transform: aperto ? 'none' : 'translateY(18px)',
          transition: 'opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1)',
        }}>
          <div style={{ maxWidth: 820, textAlign: 'center', width: '100%' }}>
            <h1 style={{
              fontFamily: SERIF, fontSize: S.display, fontWeight: 500,
              lineHeight: 1.03, letterSpacing: '-0.04em', color: T.ink,
              margin: '0 0 22px',
            }}>
              Sai quanto ti resta<br />
              <em style={{ fontStyle: 'italic', fontWeight: 400, color: T.red }}>su ogni dolce che vendi?</em>
            </h1>

            <p style={{
              fontSize: isMobile ? S.guida : S.sottotitolo, color: T.textMid,
              lineHeight: 1.55, maxWidth: 600, margin: '0 auto 32px',
            }}>
              Il gestionale di pasticcerie, gelaterie, bar e ristoranti. Carichi le
              ricette, fotografi le fatture, chiudi la giornata dal telefono.
              <strong style={{ color: T.ink, fontWeight: 600 }}> I conti si aggiornano da soli.</strong>
            </p>

            <div style={{
              display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
              marginBottom: 20,
            }}>
              <Bottone onClick={onRegister}>
                Prova tre mesi gratis <Freccia size={16} color={T.textOnDark} />
              </Bottone>
              <Bottone variant="secondary" onClick={() => vaiA('prezzi')}>
                Quanto costa
              </Bottone>
            </div>

            {/* Il prezzo sta nella prima schermata, non sette blocchi più in
                basso: è la seconda cosa che si vuole sapere. */}
            <p style={{
              fontSize: S.corpo, color: T.textMid, lineHeight: 1.6,
              margin: '0 auto', maxWidth: 440,
            }}>
              Tre mesi di prova, senza carta di credito.
              Poi {fmtPrezzo(prezzi.pro)} € al mese, e si disdice quando vuoi.
            </p>
          </div>

          <div style={{ width: '100%', maxWidth: 880, margin: isMobile ? '40px auto 0' : '64px auto 0' }}>
            <Anteprima />
          </div>
        </div>
      </section>

      {/* ── 2. PER CHI — una riga, non quattro tessere ─────────────────── */}
      <section style={{
        background: T.paper, borderTop: `1px solid ${T.border}`,
        borderBottom: `1px solid ${T.border}`, padding: isMobile ? '28px 20px' : '32px 24px',
      }}>
        <div style={{
          ...dentro, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          justifyContent: 'center', gap: isMobile ? '14px 20px' : '16px 36px',
        }}>
          <span style={{
            fontSize: S.nota, fontWeight: 700, color: T.textSoft,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>Per chi è</span>
          {[
            ['cake', 'Pasticcerie'],
            ['iceCream', 'Gelaterie'],
            ['coffee', 'Bar e caffetterie'],
            ['restaurant', 'Ristoranti e forni'],
          ].map(([icona, nome]) => (
            <span key={nome} style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              fontSize: S.corpo, fontWeight: 500, color: T.ink,
            }}>
              <CatIcon name={icona} size={20} strokeWidth={1.6} />{nome}
            </span>
          ))}
        </div>
      </section>

      {/* ── 3. COSA FA — tre colonne, una frase ciascuna ───────────────── */}
      <section style={{ padding: padBlocco, background: T.cream }}>
        <div style={dentro}>
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 48px' }}>
            <Occhiello>Cosa fa</Occhiello>
            <Titolo>
              Tre conti che <em style={{ fontStyle: 'italic', color: T.red }}>non fai più a mano</em>.
            </Titolo>
          </div>

          <div style={{
            display: 'grid', gap: isMobile ? 20 : 24,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
          }}>
            {coseCheFa.map((c, i) => (
              <Reveal key={c.titolo} delay={i * 80}>
                <div style={{
                  background: T.paper, border: `1px solid ${T.border}`, borderRadius: 18,
                  padding: isMobile ? '26px 22px' : '32px 28px', height: '100%',
                  display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14, background: T.redSoft,
                    color: T.red, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', marginBottom: 20, flexShrink: 0,
                  }}>
                    <CatIcon name={c.icona} size={22} strokeWidth={1.7} />
                  </div>
                  <h3 style={{
                    fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: T.ink,
                    letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 10px',
                    minHeight: isMobile ? 0 : 52,
                  }}>{c.titolo}</h3>
                  <p style={{ fontSize: S.corpo, color: T.textMid, lineHeight: 1.6, margin: 0 }}>
                    {c.testo}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* I numeri come prova, su una riga sola: quanto ci si mette davvero. */}
          <div style={{
            marginTop: isMobile ? 24 : 32, textAlign: 'center',
            fontSize: S.corpo, color: T.textMid, lineHeight: 1.7,
          }}>
            Una ricetta si carica in <strong style={{ color: T.ink, fontWeight: 600 }}>un minuto</strong>,
            una fattura si fotografa in <strong style={{ color: T.ink, fontWeight: 600 }}>tre secondi</strong>,
            la giornata si chiude in <strong style={{ color: T.ink, fontWeight: 600 }}>tre minuti</strong>.
          </div>
        </div>
      </section>

      {/* ── 4. COME SI COMINCIA — tre tappe ────────────────────────────── */}
      <section id="come-funziona" style={{
        padding: padBlocco, background: T.paper,
        borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={dentro}>
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 48px' }}>
            <Occhiello>Come si comincia</Occhiello>
            <Titolo>
              <em style={{ fontStyle: 'italic', color: T.red }}>Dieci minuti</em> il primo giorno.
            </Titolo>
          </div>

          <div style={{
            display: 'grid', gap: 32,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
          }}>
            {tappe.map(([n, t, d], i) => (
              <Reveal key={n} delay={i * 80}>
                <div style={{ height: '100%' }}>
                  <div style={{
                    fontFamily: SERIF, fontSize: S.cifra, fontWeight: 500,
                    color: T.creamDeep, letterSpacing: '-0.04em', lineHeight: 1,
                    marginBottom: 14,
                  }}>{n}</div>
                  <div aria-hidden style={{ height: 1, background: T.border, marginBottom: 18 }} />
                  <h3 style={{
                    fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: T.ink,
                    letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 10px',
                    minHeight: isMobile ? 0 : 30,
                  }}>{t}</h3>
                  <p style={{ fontSize: S.corpo, color: T.textMid, lineHeight: 1.6, margin: 0 }}>{d}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <div style={{
            marginTop: isMobile ? 32 : 40, textAlign: 'center',
            fontSize: S.corpo, color: T.textMid,
          }}>
            Non si installa niente e non serve un corso. Se sai usare WhatsApp, sai usare Foodos.
          </div>
        </div>
      </section>

      {/* ── 5. PREZZO ──────────────────────────────────────────────────── */}
      <section id="prezzi" style={{ padding: padBlocco, background: T.cream }}>
        <div style={{ ...dentro, maxWidth: 1000 }}>
          <div style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto 40px' }}>
            <Occhiello>Prezzo</Occhiello>
            <Titolo>
              Un prezzo solo, <em style={{ fontStyle: 'italic', color: T.red }}>scritto qui</em>.
            </Titolo>
            <p style={{ fontSize: S.guida, color: T.textMid, lineHeight: 1.6, margin: '14px 0 0' }}>
              I primi tre mesi non paghi niente. Poi decidi tu, guardando i tuoi numeri.
            </p>
          </div>

          <div style={{
            display: 'grid', gap: isMobile ? 16 : 20, alignItems: 'stretch',
            // Quante tessere ci sono davvero. Con un piano solo in vendita,
            // tre colonne lascerebbero due buchi e la tessera sola
            // sembrerebbe messa storta.
            gridTemplateColumns: isMobile ? '1fr' : `repeat(${nPianiMostrati}, minmax(0, 1fr))`,
            maxWidth: nPianiMostrati === 1 ? 460 : nPianiMostrati === 2 ? 800 : 'none',
            margin: nPianiMostrati < 3 ? '0 auto' : undefined,
          }}>
            {/* Le tre tessere hanno le stesse fasce di altezza: il giorno che se
                ne riaccende una, torna già incolonnata con le altre. */}
            {mostraPiano('base') && (
              <Piano
                etichetta="Una sede"
                nome={prezzi.nome?.base || PLAN_LABEL.base}
                desc={prezzi.desc?.base || "Una sede, l'essenziale."}
                prezzo={prezzi.base}
                voci={dentroIlPiano.slice(0, 6)}
                azione="Inizia gratis"
                onAzione={onRegister}
                isMobile={isMobile}
              />
            )}
            {mostraPiano('pro') && (
              <Piano
                scuro
                etichetta="Unico piano"
                nome={prezzi.nome?.pro || PLAN_LABEL.pro}
                desc={prezzi.desc?.pro || 'Tutto Foodos, senza limiti di sede o di utenti.'}
                prezzo={prezzi.pro}
                voci={dentroIlPiano}
                azione="Prova tre mesi gratis"
                onAzione={onRegister}
                isMobile={isMobile}
              />
            )}
            {mostraPiano('chain') && (
              <Piano
                etichetta="Catene"
                nome={prezzi.nome?.chain || PLAN_LABEL.enterprise}
                desc={prezzi.desc?.chain || 'Per gruppi e catene.'}
                prezzo={prezzi.chain}
                voci={dentroIlPiano}
                azione="Parla con noi"
                onAzione={onRegister}
                isMobile={isMobile}
              />
            )}
          </div>

          {/* Le tre cose che un titolare chiede prima di firmare. Tre righe. */}
          <div style={{
            display: 'grid', gap: isMobile ? 20 : 28, marginTop: isMobile ? 36 : 48,
            paddingTop: isMobile ? 28 : 36, borderTop: `1px solid ${T.border}`,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
          }}>
            {[
              ['Beta privata', 'Foodos si costruisce con chi ci lavora dentro. Niente recensioni inventate: lo provi coi tuoi numeri.'],
              ['I dati sono tuoi', 'Li esporti in Excel o PDF quando vuoi, anche durante la prova. Stanno su server europei.'],
              ['Rispondiamo noi', 'Scrivi a support@foodos.it e ti risponde chi lo ha fatto, non un modulo.'],
            ].map(([t, d]) => (
              <div key={t}>
                <div style={{
                  fontFamily: SERIF, fontSize: S.guida, fontWeight: 600, color: T.ink,
                  letterSpacing: '-0.01em', marginBottom: 8, minHeight: 24,
                }}>{t}</div>
                <div style={{ fontSize: S.corpo, color: T.textMid, lineHeight: 1.6 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. ULTIMO INVITO ───────────────────────────────────────────── */}
      <section style={{
        background: T.ink, padding: isMobile ? '64px 20px' : '88px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(circle at 50% 0%, rgba(110,14,26,0.20), transparent 60%)',
        }} />
        <div style={{ ...dentro, maxWidth: 680, textAlign: 'center', position: 'relative' }}>
          <h2 style={{
            fontFamily: SERIF, fontSize: S.titolo, fontWeight: 500, color: T.cream,
            letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 18px',
          }}>
            Decidi i prezzi guardando i conti,<br />
            <em style={{ fontStyle: 'italic', color: T.amber }}>non a naso.</em>
          </h2>
          <p style={{
            fontSize: S.guida, color: 'rgba(244,236,227,0.7)', lineHeight: 1.6,
            margin: '0 auto 30px', maxWidth: 460,
          }}>
            Tre mesi per provarlo con le tue ricette e le tue fatture.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Bottone variant="light" onClick={onRegister}>
              Crea il tuo account <Freccia size={16} color={T.ink} />
            </Bottone>
            <button onClick={onLogin} style={{
              minHeight: 48, padding: '0 26px', background: 'transparent',
              border: '1px solid rgba(244,236,227,0.24)', color: T.cream,
              borderRadius: 999, fontSize: S.guida, fontWeight: 500,
              cursor: 'pointer', fontFamily: SANS,
            }}>Ho già un account</button>
          </div>
        </div>
      </section>

      {/* ── PIÈ DI PAGINA ──────────────────────────────────────────────── */}
      <footer style={{ background: T.ink, padding: isMobile ? '36px 20px 28px' : '44px 24px 32px', borderTop: '1px solid rgba(244,236,227,0.08)' }}>
        <div style={dentro}>
          <div style={{
            display: 'grid', alignItems: 'start',
            gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr 1fr 1fr',
            gap: isMobile ? 28 : 40, marginBottom: 28, paddingBottom: 24,
            borderBottom: '1px solid rgba(244,236,227,0.08)',
          }}>
            <div style={{ maxWidth: 320 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Logo size={26} style={{ borderRadius: 7, opacity: 0.9 }} />
                <span style={{ fontFamily: SERIF, fontSize: S.guida, fontWeight: 600, color: T.cream, letterSpacing: '-0.02em' }}>Foodos</span>
              </div>
              <p style={{ fontSize: S.nota, color: 'rgba(244,236,227,0.5)', lineHeight: 1.6, margin: 0 }}>
                Il gestionale della ristorazione artigianale italiana. Pensato, scritto e assistito in Italia.
              </p>
            </div>

            {[
              ['Prodotto', [['Prova gratis', onRegister], ['Accedi', onLogin]]],
              ['Supporto', [['Contatti', '/contatti'], ['Chi siamo', '/chi-siamo'], ['support@foodos.it', 'mailto:support@foodos.it']]],
              ['Legale', [['Privacy Policy', '/privacy'], ['Termini di Servizio', '/termini'], ['Cookie Policy', '/cookie'], ['Rimborsi', '/rimborsi']]],
            ].map(([titolo, voci]) => (
              <div key={titolo}>
                <div style={{
                  fontSize: S.nota, fontWeight: 700, color: 'rgba(244,236,227,0.8)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
                }}>{titolo}</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {voci.map(([lbl, dove]) => (
                    typeof dove === 'function' ? (
                      <button key={lbl} onClick={dove} style={{
                        background: 'none', border: 'none', padding: 0, textAlign: 'left',
                        minHeight: 44, fontSize: S.nota, color: 'rgba(244,236,227,0.72)',
                        cursor: 'pointer', fontFamily: SANS,
                      }}>{lbl}</button>
                    ) : (
                      <a key={lbl} href={dove} style={{
                        display: 'flex', alignItems: 'center', minHeight: 44,
                        fontSize: S.nota, color: 'rgba(244,236,227,0.72)', textDecoration: 'none',
                      }}>{lbl}</a>
                    )
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 12, fontSize: S.nota, color: 'rgba(244,236,227,0.4)',
          }}>
            <div>© {new Date().getFullYear()} Foodos · Tutti i diritti riservati</div>
            <div>Fatto in Italia</div>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ── la tessera del prezzo ───────────────────────────────────────────────── */

// Una sola tessera, usata da tutti e tre i piani. Prima erano tre blocchi di
// JSX copiati: le fasce si erano già disallineate fra loro (il prezzo del
// centrale stava 23 px più in basso degli altri due). Con un componente solo
// non possono più divergere, e il piano in evidenza si distingue col colore,
// non con misure diverse.
function Piano({ scuro, etichetta, nome, desc, prezzo, voci, azione, onAzione, isMobile }) {
  const suScuro = (c) => (scuro ? c : null)
  return (
    <div style={{
      background: scuro ? T.inkSoft : T.paper,
      border: `1px solid ${scuro ? T.inkSoft : T.border}`,
      borderRadius: 22, padding: isMobile ? '28px 22px' : '34px 30px',
      display: 'flex', flexDirection: 'column', height: '100%',
      boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
    }}>
      {scuro && (
        <div aria-hidden style={{
          position: 'absolute', top: -70, right: -70, width: 240, height: 240,
          borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(110,14,26,0.24), transparent 70%)',
        }} />
      )}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{
          minHeight: 24, display: 'flex', alignItems: 'center', marginBottom: 14,
          fontSize: S.nota, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: suScuro('rgba(244,236,227,0.62)') || T.textSoft,
        }}>{etichetta}</div>

        <div style={{
          fontFamily: SERIF, fontWeight: 600, fontSize: 26, letterSpacing: '-0.02em',
          lineHeight: 1.2, marginBottom: 6, minHeight: 32,
          color: suScuro(T.cream) || T.ink,
        }}>{nome}</div>

        <div style={{
          fontSize: S.corpo, lineHeight: 1.5, marginBottom: 20, minHeight: 42,
          color: suScuro('rgba(244,236,227,0.68)') || T.textMid,
        }}>{desc}</div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, minHeight: 48 }}>
          <span style={{
            fontFamily: SERIF, fontSize: S.cifra, fontWeight: 600,
            letterSpacing: '-0.04em', lineHeight: 1,
            color: suScuro(T.cream) || T.ink,
          }}>{fmtPrezzo(prezzo)} €</span>
          <span style={{
            fontSize: S.corpo,
            color: suScuro('rgba(244,236,227,0.72)') || T.textSoft,
          }}>al mese</span>
        </div>
        <div style={{
          fontSize: S.nota, marginBottom: 22, minHeight: 18,
          color: suScuro('rgba(244,236,227,0.62)') || T.textSoft,
        }}>IVA esclusa · primi tre mesi gratis</div>

        <Bottone
          variant={scuro ? 'light' : 'secondary'}
          onClick={onAzione}
          style={{ width: '100%', marginBottom: 24 }}
        >{azione}</Bottone>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {voci.map(v => (
            <div key={v} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: S.corpo,
              lineHeight: 1.45,
              color: suScuro('rgba(244,236,227,0.88)') || T.textMid,
            }}>
              <span style={{ marginTop: 2, flexShrink: 0, color: scuro ? T.amber : T.green, display: 'flex' }}>
                <CatIcon name="check" size={16} strokeWidth={2} />
              </span>
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
