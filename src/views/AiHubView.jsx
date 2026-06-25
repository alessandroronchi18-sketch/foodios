// AiHubView — Landing hub di tutte le 23+ funzioni AI.
//
// Design v2 (2026-06-13): futuristico premium.
//  - Hero mesh gradient animato + dot grid + glow blobs + stats bar
//  - Cluster con index number monospace + linea divider neon
//  - Feature cards con neon glow hover + status badge + numerazione
//  - Chain-only features raggruppate in cluster finale dedicato

import React, { useEffect, useRef, useState } from 'react'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from '../components/Icon'
import ChainBadge from '../components/ChainBadge'
import UpgradeModal from '../components/UpgradeModal'
import { canAccessView, VIEW_MIN_PLAN, viewDisplayLabel } from '../lib/planAccess'

const BRAND      = T.brand     || '#6E0E1A'
const BRAND_DARK = '#4A0612'
const TXT        = T.text      || '#0E1726'
const MID        = T.textMid   || '#475264'
const SOFT       = T.textSoft  || '#8B95A7'
const CARD       = T.bgCard    || '#FFFFFF'
const BORDER     = T.border    || '#E5E9EF'

// ──────────────────────────────────────────────────────────────────────────
// Cluster: feature non-Chain. Le Chain (chain:true) sono raggruppate
// in un cluster finale dedicato dopo, in ordine di apparizione.
// ──────────────────────────────────────────────────────────────────────────
const CLUSTERS = [
  {
    id: 'consulente',
    label: 'Consulente AI',
    sub: 'Capisce i tuoi dati e ti spiega cosa fare',
    accent: '#E84B3A',
    icon: 'sparkles',
    features: [
      { id: 'daily-brief',  view: 'home',         title: 'Brief del mattino',
        body: 'Ogni mattina alle 7, l\'AI ti manda 3 frasi narrative con i numeri di ieri + 1 azione concreta per oggi.',
        cta: 'Vedi in home', status: 'LIVE' },
      { id: 'spiega-pl',    view: 'pl',           title: 'Spiega P&L',
        body: 'Bottone "Spiegami" su ogni KPI: l\'AI scrive 2 paragrafi narrativi che spiegano il numero con i tuoi dati.',
        cta: 'Vai al P&L', status: 'LIVE' },
      { id: 'recensioni',   view: 'recensioni',   title: 'Rispondi alle recensioni',
        body: 'Incolla una recensione → AI genera 3 risposte in italiano impeccabile (caldo, formale, fattuale).',
        cta: 'Apri Recensioni AI', status: 'LIVE' },
    ],
  },
  {
    id: 'previsione',
    label: 'Previsione & Strategia',
    sub: 'Vedi prima cosa succede e prepara la mossa',
    accent: '#D97706',
    icon: 'trendUp',
    features: [
      { id: 'forecast',     view: 'forecast',     title: 'Forecast vendite 7gg',
        body: 'Storico + meteo + stagionalità → previsione giornaliera per prodotto. Pre-compila la produzione del giorno.',
        cta: 'Apri Forecast', status: 'LIVE' },
      { id: 'cashflow',     view: 'cashflow',     title: 'Cashflow predittivo',
        body: 'Cassa attesa 30/60/90 giorni con 3 scenari. Alert sui giorni in rosso prima che arrivino.',
        cta: 'Apri Cashflow', status: 'LIVE' },
      { id: 'menu-eng',     view: 'menu-engineering', title: 'Menu engineering',
        body: 'Matrice Kasavana-Smith automatica: Star / Plowhorse / Puzzle / Dog con consigli AI per ognuno.',
        cta: 'Apri Menu engineering', status: 'LIVE' },
      { id: 'competitor',   view: 'competitor-pricing', title: 'Pricing vs competitor',
        body: 'Confronta i tuoi prezzi con i competitor in zona. Verdetto AI: sottoprezzato / in linea / sovrapprezzato.',
        cta: 'Apri Pricing', status: 'LIVE' },
    ],
  },
  {
    id: 'automazione',
    label: 'Automazioni operative',
    sub: 'Le cose noiose le fa lui per te',
    accent: '#16A34A',
    icon: 'bolt',
    features: [
      { id: 'suggestions',  view: 'home',         title: 'AI Suggestions proattive',
        body: 'L\'AI controlla ogni mattina e ti avvisa di: scorte, fatture, food cost alto, ricavi in calo. Campanella in topbar.',
        cta: 'Vedi suggerimenti', status: 'LIVE' },
      { id: 'ordini-ai',    view: 'ordini-ai',    title: 'Ordini AI consigliati',
        body: 'L\'AI calcola consumo medio + soglie minime + safety stock → testo ordine pronto da copiare al fornitore.',
        cta: 'Apri Ordini AI', status: 'LIVE' },
      { id: 'ocr-fatture',  view: 'scadenzario',  title: 'OCR fatture in entrata',
        body: 'Foto/PDF fattura → l\'AI estrae fornitore, P.IVA, scadenza, importi, righe. Conferma e salva in 5 secondi.',
        cta: 'Vai a Scadenzario', status: 'LIVE' },
      { id: 'cmdk',         view: 'home',         title: 'Cerca/chiedi con Cmd+K',
        body: 'Premi Cmd+K (o Ctrl+K) ovunque. Cerca ricette, naviga, chiedi all\'AI in linguaggio naturale.',
        cta: 'Prova adesso', status: 'LIVE', shortcut: '⌘K' },
    ],
  },
  {
    id: 'creativo',
    label: 'Creativo',
    sub: 'L\'AI come pastry chef e art director',
    accent: '#A21CAF',
    icon: 'lightbulb',
    features: [
      { id: 'reformulation', view: 'reformulation', title: 'Ottimizza ricetta',
        body: 'Imposta un food cost target. L\'AI propone 3 varianti (sostituzioni, rese, pricing) con impatto stimato.',
        cta: 'Ottimizza', status: 'LIVE' },
    ],
  },
]

// Le 5 Chain-exclusive in cluster dedicato finale
const CHAIN_CLUSTER = {
  id: 'chain',
  label: 'Esclusive piano Chain',
  sub: 'Le funzioni che giustificano il tier premium',
  accent: '#FFD86B',
  icon: 'sparkles',
  features: [
    { id: 'ai-brain',     view: 'ai-brain',     title: 'FoodOS Brain',
      body: 'Chat conversazionale dedicata. Chiedi qualsiasi cosa sui tuoi dati: ricavi, margini, scadenze, andamenti.',
      cta: 'Apri la chat', status: 'LIVE', chain: true },
    { id: 'ricette-ai',   view: 'ricette-ai',   title: 'Inventa ricetta AI',
      body: 'L\'AI crea 3 ricette nuove originali con nome, plating, ingredienti precisi e food cost calcolato.',
      cta: 'Crea ricetta', status: 'LIVE', chain: true },
    { id: 'whatsapp',     view: 'whatsapp',     title: 'WhatsApp Bot',
      body: 'Gestisci FoodOS direttamente da WhatsApp: chiedi KPI, registra sprechi, ricevi alert giornalieri.',
      cta: 'Configura', status: 'BETA', chain: true },
    { id: 'marketplace',  view: 'marketplace',  title: 'Marketplace fornitori',
      body: 'Fornitori HORECA italiani verificati con rating community. AI matching prodotto + contatto diretto.',
      cta: 'Esplora', status: 'BETA', chain: true },
    { id: 'documentary',  view: 'documentary',  title: 'Documentary AI',
      body: 'Ogni trimestre l\'AI scrive un riassunto narrativo del tuo trimestre. Pronto da condividere col team.',
      cta: 'Apri archivio', status: 'LIVE', chain: true },
  ],
}

const STATUS_STYLE = {
  LIVE: { bg: 'rgba(22,163,74,0.10)',   fg: '#15803D', label: 'LIVE' },
  BETA: { bg: 'rgba(217,119,6,0.10)',   fg: '#A16207', label: 'BETA' },
  SOON: { bg: 'rgba(148,163,184,0.16)', fg: '#64748B', label: 'COMING SOON' },
}

export default function AiHubView({ orgId, setView, goToUpgrade, piano, userEmail }) {
  const isMobile = useIsMobile()
  const [upgrade, setUpgrade] = useState(null)

  // Handler centralizzato: se feature lockata apre modal, altrimenti naviga.
  function onFeatureClick(viewId) {
    if (!viewId) return
    if (!canAccessView(viewId, piano, userEmail)) {
      setUpgrade({
        featureName: viewDisplayLabel(viewId),
        requiredPlan: VIEW_MIN_PLAN[viewId] || 'enterprise',
      })
      return
    }
    setView?.(viewId)
  }

  // Counter totale: tutte le features (per stats hero)
  const totFeatures = CLUSTERS.reduce((s, c) => s + c.features.length, 0) + CHAIN_CLUSTER.features.length

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <style>{`
        @keyframes _ai_grad {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes _ai_pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        @keyframes _ai_float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .ai-card {
          position: relative;
          isolation: isolate;
          transition: transform .25s cubic-bezier(.32,.72,0,1), box-shadow .25s ease, border-color .25s ease;
        }
        .ai-card::before {
          content: ""; position: absolute; inset: -1px;
          border-radius: inherit;
          background: linear-gradient(135deg, transparent 30%, var(--accent, #E84B3A) 50%, transparent 70%);
          opacity: 0;
          transition: opacity .35s ease;
          z-index: -1;
          filter: blur(8px);
        }
        .ai-card:hover {
          transform: translateY(-5px) scale(1.005);
          box-shadow: 0 22px 60px rgba(15,23,42,0.14), 0 8px 18px rgba(110,14,26,0.12);
          border-color: var(--accent, #E84B3A);
        }
        .ai-card:hover::before { opacity: 0.30; }
        .ai-card.chain {
          background: linear-gradient(180deg, #FFFCF0 0%, #FFFFFF 50%);
          border-color: rgba(217,119,6,0.30) !important;
        }
        .ai-card.chain:hover {
          box-shadow: 0 24px 70px rgba(217,119,6,0.22), 0 8px 18px rgba(110,14,26,0.10);
        }
        .ai-index {
          font-family: ui-monospace, "JetBrains Mono", "SF Mono", monospace;
          font-feature-settings: "tnum";
        }
      `}</style>

      {/* ───── HERO ───── */}
      <div style={{
        position: 'relative', borderRadius: 24, padding: isMobile ? '32px 22px' : '52px 48px',
        marginBottom: isMobile ? 24 : 32, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0B0408 0%, #1C0A0A 24%, #2E0814 50%, #4A0612 78%, #6E0E1A 100%)',
        backgroundSize: '300% 300%',
        animation: '_ai_grad 14s ease-in-out infinite',
        boxShadow: '0 28px 80px rgba(110,14,26,0.42), inset 0 1px 0 rgba(255,255,255,0.10)',
      }}>
        {/* glow blobs */}
        <div style={{ position: 'absolute', top: -110, right: -90, width: 380, height: 380, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,75,58,0.40) 0%, transparent 60%)',
          pointerEvents: 'none', animation: '_ai_float 7s ease-in-out infinite' }}/>
        <div style={{ position: 'absolute', bottom: -130, left: 80, width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,216,107,0.22) 0%, transparent 65%)',
          pointerEvents: 'none', animation: '_ai_float 9s ease-in-out infinite reverse' }}/>
        {/* dot grid */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.10, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)',
          backgroundSize: '22px 22px' }}/>
        {/* mesh line decorativo */}
        {!isMobile && <div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '100%',
          background: 'linear-gradient(115deg, transparent 0%, transparent 49%, rgba(255,255,255,0.04) 50%, transparent 51%)',
          pointerEvents: 'none' }}/>}

        <div style={{ position: 'relative', zIndex: 1, color: '#FFF' }}>
          {/* Eyebrow */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderRadius: 999,
            background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.20em', textTransform: 'uppercase',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 10px #22C55E', animation: '_ai_pulse 2s ease-in-out infinite' }}/>
            <ChainBadge size={12}/> Intelligence layer · {totFeatures} funzioni live
          </div>

          <h1 style={{ margin: '20px 0 12px', fontSize: isMobile ? 30 : 52, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.05 }}>
            FoodOS<br/>
            <span style={{
              background: 'linear-gradient(120deg, #FFD86B 0%, #FBD7C9 45%, #E89B43 75%, #FFD86B 100%)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              animation: '_ai_grad 6s ease-in-out infinite',
            }}>
              Atelier AI
            </span>
          </h1>
          <p style={{ margin: 0, maxWidth: 680, fontSize: isMobile ? 14 : 15, lineHeight: 1.65, color: 'rgba(255,255,255,0.80)' }}>
            Il laboratorio dove l’intelligenza artificiale lavora per te: previsioni, ottimizzazioni, automazioni, chat strategica.
            Tutte le funzioni in un solo posto, gratuite con il tuo piano.
          </p>

          {/* Stat strip */}
          <div style={{ display: 'flex', gap: isMobile ? 14 : 28, marginTop: 26, flexWrap: 'wrap' }}>
            <HeroStat n={`${totFeatures}`} l="Funzioni AI live"/>
            <HeroStat n="4" l="Modelli Claude attivi"/>
            <HeroStat n="24/7" l="Cron orchestrati"/>
            <HeroStat n="0" l="Setup richiesto"/>
          </div>

          {/* CTA */}
          <div style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => onFeatureClick('ai-brain')}
              style={{ background: '#FFF', color: BRAND, border: 'none', padding: isMobile ? '14px 22px' : '13px 24px', minHeight: 48, borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                boxShadow: '0 8px 22px rgba(0,0,0,0.30)', flex: isMobile ? '1 1 auto' : 'unset', justifyContent: 'center' }}>
              <Icon name="sparkles" size={14}/> Parla con FoodOS Brain
            </button>
            <button onClick={() => setView?.('home')}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#FFF', border: '1px solid rgba(255,255,255,0.28)', padding: isMobile ? '14px 20px' : '13px 22px', minHeight: 48, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', flex: isMobile ? '1 1 auto' : 'unset', justifyContent: 'center', display: 'inline-flex', alignItems: 'center' }}>
              Vedi il Brief di oggi →
            </button>
          </div>
        </div>
      </div>

      {/* ───── CLUSTER NON-CHAIN ───── */}
      {CLUSTERS.map((cluster, idx) => (
        <ClusterSection key={cluster.id} cluster={cluster} idx={idx} onFeatureClick={onFeatureClick} isMobile={isMobile} piano={piano} userEmail={userEmail}/>
      ))}

      {/* ───── CHAIN CLUSTER (dedicato, in fondo) ───── */}
      <section style={{ marginTop: isMobile ? 32 : 48, marginBottom: isMobile ? 24 : 32 }}>
        <ClusterIntro
          idx={CLUSTERS.length}
          cluster={CHAIN_CLUSTER}
          isChain
        />
        <div style={{
          background: 'linear-gradient(135deg, #1C0A0A 0%, #2E0814 60%, #4A0612 100%)',
          borderRadius: 18,
          padding: isMobile ? 16 : 22,
          marginTop: 14,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(110,14,26,0.30)',
        }}>
          <div style={{ position: 'absolute', top: -60, right: -40, width: 240, height: 240, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,216,107,0.18) 0%, transparent 70%)', pointerEvents: 'none' }}/>
          <div style={{ position: 'relative', display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 14 }}>
            {CHAIN_CLUSTER.features.map((f, i) => {
              const locked = !canAccessView(f.view, piano, userEmail)
              return (
                <FeatureCard key={f.id} f={f} accent={CHAIN_CLUSTER.accent}
                  idx={i+1} total={CHAIN_CLUSTER.features.length}
                  locked={locked}
                  onClick={() => onFeatureClick(f.view)} dark/>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div style={{ marginTop: 22, padding: '18px 14px', textAlign: 'center', borderTop: `1px solid ${BORDER}`, color: SOFT, fontSize: 12, lineHeight: 1.7 }}>
        {totFeatures} funzioni AI integrate · Modelli: Claude Opus + Sonnet + Haiku + Whisper + Vision · Aggiornato 2026-06-13
      </div>

      {/* Upgrade modal: si apre quando si clicca una feature non accessibile */}
      {upgrade && (
        <UpgradeModal
          featureName={upgrade.featureName}
          requiredPlan={upgrade.requiredPlan}
          onClose={() => setUpgrade(null)}
          onCta={() => goToUpgrade?.()}
        />
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────

function HeroStat({ n, l }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#FFF', letterSpacing: '-0.02em', lineHeight: 1, fontFeatureSettings: "'tnum'" }}>{n}</div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,0.60)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>{l}</div>
    </div>
  )
}

function ClusterIntro({ idx, cluster, isChain }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 4 }}>
      <div className="ai-index" style={{
        fontSize: 13, fontWeight: 700, color: isChain ? '#FFD86B' : cluster.accent,
        background: isChain ? 'rgba(255,216,107,0.12)' : `${cluster.accent}14`,
        padding: '6px 12px', borderRadius: 8,
        border: `1px solid ${isChain ? 'rgba(255,216,107,0.30)' : `${cluster.accent}33`}`,
        flexShrink: 0,
      }}>
        {String(idx + 1).padStart(2, '0')} / {String(idx + 1 + (isChain ? 0 : 0))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: isChain ? '#A16207' : cluster.accent, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {cluster.label}
          </span>
          <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${isChain ? '#FFD86B' : cluster.accent}, transparent)`, opacity: 0.4, minWidth: 24 }}/>
          {isChain && <ChainBadge size={13}/>}
        </div>
        <div style={{ fontSize: 15, color: MID, lineHeight: 1.5 }}>{cluster.sub}</div>
      </div>
    </div>
  )
}

function ClusterSection({ cluster, idx, onFeatureClick, isMobile, piano, userEmail }) {
  return (
    <section style={{ marginBottom: isMobile ? 28 : 40 }}>
      <ClusterIntro idx={idx} cluster={cluster}/>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(290px, 1fr))',
        gap: 14,
        marginTop: 16,
      }}>
        {cluster.features.map((f, i) => {
          const locked = !canAccessView(f.view, piano, userEmail)
          return (
            <FeatureCard
              key={f.id}
              f={f}
              accent={cluster.accent}
              idx={i + 1}
              total={cluster.features.length}
              locked={locked}
              onClick={() => onFeatureClick(f.view)}
            />
          )
        })}
      </div>
    </section>
  )
}

function FeatureCard({ f, accent, idx, total, onClick, dark = false, locked = false }) {
  const status = STATUS_STYLE[f.status] || STATUS_STYLE.LIVE
  // Badge "premium" visibile SOLO se la feature è lockata per l'utente corrente.
  // Per un Chain user → niente badge. Per Pro user → badge solo sui Chain.
  // Per Base user → badge sia sui Pro che sui Chain.
  const showBadge = locked
  return (
    <div
      className={`ai-card ${locked ? 'chain' : ''}`}
      onClick={onClick}
      style={{
        '--accent': accent,
        background: dark ? 'rgba(255,255,255,0.05)' : CARD,
        border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : BORDER}`,
        borderRadius: 16,
        padding: 20,
        cursor: 'pointer',
        boxShadow: dark ? '0 4px 12px rgba(0,0,0,0.30)' : '0 2px 8px rgba(15,23,42,0.05)',
        display: 'flex', flexDirection: 'column', gap: 12,
        minHeight: 188,
        backdropFilter: dark ? 'blur(8px)' : 'none',
        WebkitBackdropFilter: dark ? 'blur(8px)' : 'none',
      }}>
      {/* Header row: index + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="ai-index" style={{
          fontSize: 10, fontWeight: 700, color: dark ? 'rgba(255,255,255,0.45)' : SOFT,
          letterSpacing: '0.08em',
        }}>
          {String(idx).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {f.shortcut && (
            <kbd style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace',
              color: dark ? 'rgba(255,255,255,0.65)' : SOFT,
              padding: '2px 7px',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : BORDER}`,
              borderRadius: 5,
              background: dark ? 'rgba(255,255,255,0.04)' : '#FAFAF6' }}>
              {f.shortcut}
            </kbd>
          )}
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
            padding: '3px 8px', borderRadius: 999,
            background: status.bg, color: status.fg,
            border: `1px solid ${status.fg}33`,
          }}>{status.label}</span>
          {showBadge && <ChainBadge size={14}/>}
        </div>
      </div>

      {/* Title */}
      <h3 style={{
        margin: 0, fontSize: 17, fontWeight: 800,
        color: dark ? '#FFF' : TXT,
        letterSpacing: '-0.018em',
        lineHeight: 1.25,
      }}>{f.title}</h3>

      {/* Body */}
      <p style={{
        margin: 0, fontSize: 12.5,
        color: dark ? 'rgba(255,255,255,0.70)' : MID,
        lineHeight: 1.6, flex: 1,
      }}>{f.body}</p>

      {/* CTA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 12.5, fontWeight: 700,
          color: dark ? '#FBD7C9' : accent,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {f.cta}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </span>
      </div>
    </div>
  )
}
