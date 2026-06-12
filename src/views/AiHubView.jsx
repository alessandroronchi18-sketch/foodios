// AiHubView — Landing hub di tutte le funzioni AI.
//
// Design: futuristico + elegante. Glass-morphism cards con border gradient,
// hero scuro brand, hover-lift, ChainBadge SVG sui Chain-only.
// Boxes raggruppate in 5 cluster per funzione (Consulente, Previsione,
// Automazione, Creativo, Network).

import React from 'react'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from '../components/Icon'
import ChainBadge from '../components/ChainBadge'

const BRAND = T.brand || '#6E0E1A'
const BRAND_DARK = '#4A0612'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const SOFT = T.textSoft || '#8B95A7'
const CARD = T.bgCard || '#FFFFFF'
const BORDER = T.border || '#E5E9EF'

// Per ogni cluster: titolo + sottotitolo + features array
const CLUSTERS = [
  {
    id: 'consulente',
    label: 'Consulente AI',
    sub: 'Capisce i tuoi dati e ti spiega cosa fare',
    accent: '#6E0E1A',
    icon: 'sparkles',
    features: [
      {
        id: 'ai-brain', view: 'ai-brain', chain: true,
        title: 'FoodOS Brain',
        body: 'Chat conversazionale dedicata. Chiedi qualsiasi cosa sui tuoi dati: ricavi, margini, scadenze, andamenti.',
        cta: 'Apri la chat',
      },
      {
        id: 'daily-brief', view: 'home',
        title: 'Brief del mattino',
        body: 'Ogni mattina alle 7, l\'AI ti manda 3 frasi narrative con i numeri di ieri + 1 azione concreta per oggi.',
        cta: 'Vedi in home',
      },
      {
        id: 'spiega-pl', view: 'pl',
        title: 'Spiega P&L',
        body: 'Bottone "Spiegami" su ogni KPI: l\'AI scrive 2 paragrafi narrativi che spiegano il numero usando i tuoi dati.',
        cta: 'Vai al P&L',
      },
      {
        id: 'documentary', view: 'documentary', chain: true,
        title: 'Documentary AI',
        body: 'Ogni trimestre l\'AI scrive un riassunto narrativo del tuo trimestre con headline + 3 paragrafi + highlights.',
        cta: 'Apri archivio',
      },
      {
        id: 'recensioni', view: 'recensioni',
        title: 'Rispondi alle recensioni',
        body: 'Incolla una recensione → AI genera 3 risposte in italiano impeccabile (caldo, formale, fattuale).',
        cta: 'Apri Recensioni AI',
      },
    ],
  },
  {
    id: 'previsione',
    label: 'Previsione & Strategia',
    sub: 'Vedi prima cosa succede e prepara la mossa',
    accent: '#7C2D12',
    icon: 'trendUp',
    features: [
      {
        id: 'forecast', view: 'forecast',
        title: 'Forecast vendite 7gg',
        body: 'Storico + meteo + stagionalità → previsione giornaliera per prodotto. Pre-compila la produzione del giorno.',
        cta: 'Apri Forecast',
      },
      {
        id: 'cashflow', view: 'cashflow',
        title: 'Cashflow predittivo',
        body: 'Cassa attesa 30/60/90 giorni con 3 scenari. Alert sui giorni in rosso prima che arrivino.',
        cta: 'Apri Cashflow',
      },
      {
        id: 'menu-eng', view: 'menu-engineering',
        title: 'Menu engineering',
        body: 'Matrice Kasavana-Smith automatica: Star/Plowhorse/Puzzle/Dog con consigli AI per ognuno.',
        cta: 'Apri Menu engineering',
      },
      {
        id: 'competitor', view: 'competitor-pricing',
        title: 'Pricing vs competitor',
        body: 'Confronta i tuoi prezzi con i competitor in zona. Verdetto AI: sottoprezzato / in linea / sovrapprezzato.',
        cta: 'Apri Pricing',
      },
    ],
  },
  {
    id: 'automazione',
    label: 'Automazioni operative',
    sub: 'Le cose noiose le fa lui per te',
    accent: '#0F766E',
    icon: 'bolt',
    features: [
      {
        id: 'suggestions', view: 'home',
        title: 'AI Suggestions proattive',
        body: 'L\'AI controlla ogni mattina e ti avvisa di: scorte, fatture, food cost alto, ricavi in calo. Campanella in topbar.',
        cta: 'Vedi suggerimenti',
      },
      {
        id: 'ordini-ai', view: 'ordini-ai',
        title: 'Ordini AI consigliati',
        body: 'L\'AI calcola consumo medio + soglie minime + safety stock → testo ordine pronto da copia-incollare al fornitore.',
        cta: 'Apri Ordini AI',
      },
      {
        id: 'ocr-fatture', view: 'scadenzario',
        title: 'OCR fatture in entrata',
        body: 'Foto/PDF fattura → l\'AI estrae fornitore, P.IVA, scadenza, importi, righe. Conferma e salva in 5 secondi.',
        cta: 'Vai a Scadenzario',
      },
      {
        id: 'cmdk', view: 'home',
        title: 'Cerca/chiedi con Cmd+K',
        body: 'Premi Cmd+K (o Ctrl+K) ovunque. Cerca ricette, naviga, chiedi all\'AI in linguaggio naturale.',
        cta: 'Prova adesso',
        shortcut: '⌘K',
      },
    ],
  },
  {
    id: 'creativo',
    label: 'Creativo',
    sub: 'L\'AI come pastry chef e art director',
    accent: '#A21CAF',
    icon: 'lightbulb',
    features: [
      {
        id: 'ricette-ai', view: 'ricette-ai', chain: true,
        title: 'Inventa ricetta AI',
        body: 'L\'AI crea 3 ricette nuove originali con nome, plating, ingredienti precisi e food cost calcolato.',
        cta: 'Crea ricetta',
      },
      {
        id: 'reformulation', view: 'reformulation',
        title: 'Ottimizza ricetta',
        body: 'Imposta un food cost target. L\'AI propone 3 varianti (sostituzioni, rese, pricing) con impatto stimato.',
        cta: 'Ottimizza',
      },
    ],
  },
  {
    id: 'network',
    label: 'Network & Canali',
    sub: 'I tuoi clienti e fornitori, sempre connessi',
    accent: '#0369A1',
    icon: 'globe',
    features: [
      {
        id: 'whatsapp', view: 'whatsapp', chain: true,
        title: 'WhatsApp Bot',
        body: 'Gestisci FoodOS direttamente da WhatsApp: chiedi KPI, registra sprechi, ricevi alert. Tier Chain.',
        cta: 'Configura',
      },
      {
        id: 'marketplace', view: 'marketplace', chain: true,
        title: 'Marketplace fornitori',
        body: 'Fornitori HORECA italiani verificati con rating community. AI matching prodotto + contatto diretto.',
        cta: 'Esplora',
      },
    ],
  },
]

export default function AiHubView({ orgId, setView, piano, userEmail }) {
  const isMobile = useIsMobile()

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <style>{`
        @keyframes _ai_grad {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .ai-card {
          transition: transform .22s cubic-bezier(.32,.72,0,1), box-shadow .22s ease, border-color .22s ease;
        }
        .ai-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 18px 50px rgba(110,14,26,0.18), 0 4px 14px rgba(15,23,42,0.08);
        }
        @keyframes _ai_shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(120%); }
        }
        .ai-shine:hover::before {
          animation: _ai_shine 0.9s ease-out forwards;
        }
      `}</style>

      {/* HERO */}
      <div style={{
        position: 'relative', borderRadius: 24, padding: isMobile ? '28px 22px' : '40px 44px',
        marginBottom: isMobile ? 20 : 28, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0B0408 0%, #1C0A0A 30%, #4A0612 70%, #6E0E1A 100%)',
        backgroundSize: '300% 300%',
        animation: '_ai_grad 12s ease-in-out infinite',
        boxShadow: '0 20px 60px rgba(110,14,26,0.4), inset 0 1px 0 rgba(255,255,255,0.10)',
      }}>
        {/* glow blobs decorativi */}
        <div style={{ position: 'absolute', top: -80, right: -60, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,75,58,0.35) 0%, transparent 60%)', pointerEvents: 'none' }}/>
        <div style={{ position: 'absolute', bottom: -100, left: 100, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,216,107,0.18) 0%, transparent 65%)', pointerEvents: 'none' }}/>
        {/* dot grid sottile */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.10, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '24px 24px' }}/>

        <div style={{ position: 'relative', zIndex: 1, color: '#FFF' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999,
            background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            <ChainBadge size={13}/> Intelligence layer
          </div>
          <h1 style={{ margin: '16px 0 8px', fontSize: isMobile ? 30 : 44, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05 }}>
            FoodOS AI<br/>
            <span style={{ background: 'linear-gradient(120deg, #FFD86B 0%, #FBD7C9 50%, #E89B43 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              {'lavora mentre dormi'}
            </span>
          </h1>
          <p style={{ margin: 0, maxWidth: 620, fontSize: 14.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.78)' }}>
            23 funzioni AI integrate nel tuo gestionale: dalla previsione vendite al pricing competitor, dal chef virtuale alla chat strategica. Sono qui, gratis con il tuo piano.
          </p>
          <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setView?.('ai-brain')}
              style={{ background: '#FFF', color: BRAND, border: 'none', padding: '12px 22px', borderRadius: 12, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
                boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}>
              <Icon name="sparkles" size={14}/> Parla con FoodOS Brain
            </button>
            <button onClick={() => setView?.('home')}
              style={{ background: 'rgba(255,255,255,0.10)', color: '#FFF', border: '1px solid rgba(255,255,255,0.30)', padding: '12px 22px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              Vedi il Brief di oggi →
            </button>
          </div>
        </div>
      </div>

      {/* CLUSTERS */}
      {CLUSTERS.map(cluster => (
        <section key={cluster.id} style={{ marginBottom: isMobile ? 26 : 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: `linear-gradient(135deg, ${cluster.accent}, ${BRAND_DARK})`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFF', boxShadow: `0 8px 22px ${cluster.accent}33`,
            }}>
              <Icon name={cluster.icon} size={20}/>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: cluster.accent, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                {cluster.label}
              </div>
              <div style={{ fontSize: 14, color: MID, marginTop: 2 }}>{cluster.sub}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {cluster.features.map(f => (
              <FeatureCard key={f.id} f={f} accent={cluster.accent} onClick={() => setView?.(f.view)}/>
            ))}
          </div>
        </section>
      ))}

      <div style={{ marginTop: 30, padding: 20, textAlign: 'center', borderTop: `1px solid ${BORDER}`, color: SOFT, fontSize: 12 }}>
        🤖 23 funzioni AI integrate · Modelli: Claude Opus / Sonnet / Haiku + Whisper · Aggiornato 2026-06-13
      </div>
    </div>
  )
}

function FeatureCard({ f, accent, onClick }) {
  return (
    <div className="ai-card ai-shine"
      onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden',
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
        padding: 18, cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(15,23,42,0.04)',
        display: 'flex', flexDirection: 'column', gap: 10,
        minHeight: 168,
      }}>
      {/* Border accent top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accent} 0%, ${BRAND} 100%)`, opacity: 0.85 }}/>
      {/* Shine animation overlay (hidden until hover) */}
      <span aria-hidden="true" style={{
        position: 'absolute', top: 0, bottom: 0, width: 80, left: 0,
        background: 'linear-gradient(90deg, transparent, rgba(255,216,107,0.18), transparent)',
        transform: 'translateX(-100%)',
        pointerEvents: 'none',
      }}/>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TXT, letterSpacing: '-0.015em' }}>
          {f.title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {f.shortcut && (
            <kbd style={{ fontSize: 10.5, fontFamily: 'ui-monospace, monospace', color: SOFT, padding: '2px 7px', border: `1px solid ${BORDER}`, borderRadius: 5, background: '#FAFAF6' }}>
              {f.shortcut}
            </kbd>
          )}
          {f.chain && <ChainBadge size={14}/>}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: MID, lineHeight: 1.55, flex: 1 }}>
        {f.body}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {f.cta}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </span>
      </div>
    </div>
  )
}
