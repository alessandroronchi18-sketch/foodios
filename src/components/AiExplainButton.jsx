import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import { callAi } from '../lib/aiClient'
import Icon from './Icon'

// AiExplainButton — bottone "Spiegami" accanto a un KPI o numero importante.
// Quando clicchi, l'AI riceve un payload strutturato (kpi + dati a contorno)
// e scrive 2-3 paragrafi narrativi in italiano che spiegano il numero.
//
// Uso:
//   <AiExplainButton
//     label="Food cost"
//     value="33.2%"
//     context={{
//       kpi: 'food_cost_percent',
//       value: 33.2,
//       periodo: 'maggio 2026',
//       sede: 'Centro',
//       ingredienti_top: [{ nome: 'Pistacchio', delta_prezzo_pct: 12 }],
//       prodotti_top: [{ nome: 'Cannolo', fc: 38, peso_vendite_pct: 22 }],
//     }}
//   />

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

export default function AiExplainButton({ label, value, context, compact }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [explanation, setExplanation] = useState(null)
  const [error, setError] = useState(null)

  async function ask() {
    setOpen(true)
    if (explanation) return
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessione scaduta — rifai login')

      const system = `Sei un consulente food cost per pasticcerie/gelaterie italiane.
Spiega in 2-3 paragrafi brevi (max 120 parole TOTALI) cosa significa il KPI
dato, perche' ha quel valore in base al contesto fornito, e 1 azione concreta
da fare. Italiano corrente, niente saluti, niente emoji. NON inventare numeri
non presenti nel contesto: se mancano, dillo brevemente.`

      const userMsg = `KPI: ${label}
Valore: ${value}
Contesto (JSON):
${JSON.stringify(context, null, 2)}`

      const { text } = await callAi({
        feature: 'explain-kpi',
        model: 'claude-sonnet-4-6',
        system,
        prompt: userMsg,
        maxTokens: 400,
        timeoutMs: 25_000,
      })
      setExplanation((text || '').trim())
    } catch (e) {
      setError(e.friendly || e.message)
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <>
        <button onClick={ask} title="Spiegami questo KPI"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: BRAND, opacity: 0.7,
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}>
          <Icon name="sparkles" size={13} />
        </button>
        {open && (
          <ExplainModal
            label={label} value={value}
            loading={loading} explanation={explanation} error={error}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <button onClick={ask}
        style={{
          background: 'transparent', border: `1px solid ${BORDER}`,
          padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
          color: BRAND, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
        <Icon name="sparkles" size={12} /> Spiegami
      </button>
      {open && (
        <ExplainModal
          label={label} value={value}
          loading={loading} explanation={explanation} error={error}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ExplainModal({ label, value, loading, explanation, error, onClose }) {
  return (
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 16,
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: CARD, borderRadius: 14, padding: 24,
          maxWidth: 540, width: '100%',
          boxShadow: '0 24px 60px rgba(15,23,42,0.30)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10,
            background: `linear-gradient(135deg, ${BRAND}, #4A0612)`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFF',
          }}>
            <Icon name="sparkles" size={15} />
          </span>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: BRAND }}>
              Lettura AI
            </div>
            <div style={{ fontSize: 13, color: MID, marginTop: 1 }}>
              <strong>{label}</strong> · {value}
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: SOFT, padding: 4 }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {loading && (
          <div style={{ padding: '30px 0', textAlign: 'center', color: SOFT, fontSize: 13 }}>
            L'AI sta analizzando i tuoi dati…
          </div>
        )}
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', color: '#991B1B', fontSize: 12.5 }}>
            {error}
          </div>
        )}
        {!loading && explanation && (
          <div style={{ fontSize: 14, color: TXT, lineHeight: 1.65 }}>
            {explanation.split(/\n+/).map((p, i) => (
              <p key={i} style={{ margin: i === 0 ? '0 0 10px' : '0 0 10px' }}>{p}</p>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`, fontSize: 10.5, color: SOFT }}>
          Generato dall'AI in base ai tuoi dati. Verifica sempre prima di prendere decisioni.
        </div>
      </div>
    </div>
  )
}
