// Scaffold UI shared per tutte le card AI di FoodOS.
// Risolve i 5 anti-pattern visti nelle view AI esistenti:
//   1. Loading state diverso per ogni view → spinner uniforme + skeleton
//   2. Error mostrato come `notify()` toast → user perde il contesto del retry
//   3. Empty state assente → la view sembra rotta finché non l'utente capisce di cliccare
//   4. No copy-to-clipboard sull'output → l'utente lo seleziona e copia a mano
//   5. No timestamp "generato il" → l'utente non sa se il risultato è di 2gg fa
//
// Usage:
//   <AICard
//     icon="bulb"
//     title="Analisi food cost"
//     subtitle="Suggerimenti AI dai tuoi dati"
//     state={state}                         // 'idle' | 'loading' | 'ok' | 'error'
//     error={errorMsg}                      // stringa friendly (usa friendlyAiError)
//     generatedAt={timestamp}               // Date o ISO string
//     onRetry={() => runAi()}
//     onClear={() => setState('idle')}
//     ctaLabel="Genera analisi"
//     onCta={() => runAi()}
//     emptyExample="Es. analizza il mese di giugno"  // mostrato in idle state
//     copyable={resultText}                 // se valorizzato mostra bottone copia
//   >
//     {ok ? <Result data={result}/> : null}
//   </AICard>

import React, { useState } from 'react'
import Icon from './Icon'

const C = {
  bgCard: '#FFFFFF',
  border: '#E8E0DC',
  text: '#1C0A0A',
  textSoft: '#6B4C44',
  textMute: '#9C7B76',
  brand: '#C0392B',
  brandLight: '#FBE9E7',
  green: '#0C7C56',
  amber: '#E89B43',
  red: '#C0392B',
}

function Skeleton() {
  // Skeleton uniforme: 3 righe shimmer.
  return (
    <div role="status" aria-live="polite" aria-label="Generazione AI in corso">
      {[100, 86, 70].map((w, i) => (
        <div key={i} style={{
          height: 12, width: `${w}%`, marginBottom: 10, borderRadius: 6,
          background: 'linear-gradient(90deg, #F5EDE8 0%, #ECDED7 50%, #F5EDE8 100%)',
          backgroundSize: '200% 100%',
          animation: 'fosShimmer 1.4s ease-in-out infinite',
        }}/>
      ))}
      <style>{`@keyframes fosShimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  )
}

function fmtAgo(ts) {
  if (!ts) return null
  const t = typeof ts === 'string' ? new Date(ts) : ts
  if (isNaN(t.getTime())) return null
  const sec = Math.round((Date.now() - t.getTime()) / 1000)
  if (sec < 60) return `Generato ${sec}s fa`
  if (sec < 3600) return `Generato ${Math.round(sec / 60)}min fa`
  if (sec < 86400) return `Generato ${Math.round(sec / 3600)}h fa`
  return `Generato il ${t.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}`
}

export default function AICard({
  icon = 'bulb',
  title,
  subtitle,
  state = 'idle',           // 'idle' | 'loading' | 'ok' | 'error'
  error,
  generatedAt,
  onRetry,
  onClear,
  ctaLabel = 'Genera con AI',
  onCta,
  emptyExample,
  copyable,
  children,
  compact = false,
}) {
  const [copyOk, setCopyOk] = useState(false)

  const doCopy = async () => {
    if (!copyable) return
    try {
      await navigator.clipboard.writeText(copyable)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 1800)
    } catch {
      // Fallback su iOS quando clipboard API è gated.
      try {
        const ta = document.createElement('textarea')
        ta.value = copyable
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopyOk(true)
        setTimeout(() => setCopyOk(false), 1800)
      } catch {}
    }
  }

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: compact ? 16 : '20px 22px',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: state === 'idle' ? 14 : 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: C.brandLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name={icon} size={18} color={C.brand} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, lineHeight: 1.3 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2, lineHeight: 1.4 }}>{subtitle}</div>}
        </div>
        {generatedAt && state === 'ok' && (
          <div style={{ fontSize: 10, color: C.textMute, flexShrink: 0 }}>{fmtAgo(generatedAt)}</div>
        )}
      </div>

      {/* Body — varia per state */}
      {state === 'loading' && <Skeleton />}

      {state === 'error' && (
        <div role="alert" style={{
          padding: '12px 14px', background: '#FEF2F2', border: `1px solid #FCA5A5`,
          borderRadius: 8, color: C.red, fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Icon name="alertCircle" size={14} />
            <div style={{ flex: 1 }}>{error || 'Errore. Riprova fra qualche secondo.'}</div>
          </div>
          {onRetry && (
            <button onClick={onRetry} style={{
              marginTop: 10, padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.red}`,
              background: '#FFF', color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>Riprova</button>
          )}
        </div>
      )}

      {state === 'idle' && (
        <div>
          {emptyExample && (
            <div style={{
              padding: '10px 14px', background: '#FAFAF7', border: `1px dashed ${C.border}`,
              borderRadius: 8, fontSize: 12, color: C.textSoft, marginBottom: 12, fontStyle: 'italic',
            }}>
              {emptyExample}
            </div>
          )}
          {onCta && (
            <button onClick={onCta} style={{
              padding: '10px 18px', borderRadius: 8, border: 'none',
              background: C.brand, color: '#FFF', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              <Icon name="sparkles" size={14} /> {ctaLabel}
            </button>
          )}
        </div>
      )}

      {state === 'ok' && (
        <>
          {children}
          {(copyable || onClear) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {copyable && (
                <button onClick={doCopy} style={{
                  padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
                  background: copyOk ? '#DCFCE7' : '#FFF', color: copyOk ? C.green : C.text,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex',
                  alignItems: 'center', gap: 6,
                }}>
                  <Icon name={copyOk ? 'check' : 'copy'} size={12} />
                  {copyOk ? 'Copiato' : 'Copia testo'}
                </button>
              )}
              {onClear && (
                <button onClick={onClear} style={{
                  padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
                  background: '#FFF', color: C.textSoft, fontSize: 11, cursor: 'pointer',
                }}>Cancella</button>
              )}
              {onRetry && (
                <button onClick={onRetry} style={{
                  padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
                  background: '#FFF', color: C.textSoft, fontSize: 11, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <Icon name="refresh" size={12} /> Rigenera
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
