import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import Icon from './Icon'

// Card del Brief del mattino — appare in alto nella Home se il brief di
// oggi e' stato generato dal cron. Riassume in 3-4 frasi la situazione.
//
// Tap su "Spiegami" → mostra dettagli KPI snapshot.
// Tap su "Chiudi" → marca come letto (idempotente RPC brief_mark_opened).

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

export default function DailyBriefCard({ orgId }) {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    let alive = true
    async function load() {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)
      // Preferenza: brief settimanale (al lunedi) > giornaliero.
      const { data: briefs } = await supabase
        .from('daily_briefs')
        .select('id, data, tipo, contenuto, kpi_snapshot, opened_at')
        .eq('organization_id', orgId)
        .is('sede_id', null)
        .eq('data', today)
        .order('tipo', { ascending: false })  // 'settimanale' viene prima di 'giornaliero'
      const pick = (briefs || [])[0] || null
      if (alive) { setBrief(pick); setLoading(false) }
    }
    load()
    return () => { alive = false }
  }, [orgId])

  if (loading || !brief) return null

  async function dismiss() {
    try { await supabase.rpc('brief_mark_opened', { brief_id: brief.id }) } catch {}
    setBrief(null)
  }

  // Hide automaticamente se gia' letto da piu' di 6h (per non occupare home)
  if (brief.opened_at && (Date.now() - new Date(brief.opened_at).getTime()) > 6 * 3600 * 1000) {
    return null
  }

  const k = brief.kpi_snapshot || {}
  const kpiBox = (label, value, hint) => (
    <div style={{ background: '#FAFAF6', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: TXT, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 10.5, color: SOFT, marginTop: 2 }}>{hint}</div>}
    </div>
  )

  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: '20px 22px', marginBottom: 18,
      boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${BRAND} 0%, #4A0612 100%)`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFF',
          }}>
            <Icon name="sun" size={14} />
          </span>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {brief.tipo === 'settimanale' ? 'Brief della settimana' : 'Brief del mattino'}
            </div>
            <div style={{ fontSize: 11, color: SOFT, marginTop: 2 }}>{new Date(brief.data + 'T00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          </div>
        </div>
        <button onClick={dismiss} title="Chiudi (resta nello storico)"
          style={{ background: 'transparent', border: 'none', color: SOFT, cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div style={{ fontSize: 14.5, lineHeight: 1.65, color: TXT }}>
        {brief.contenuto.split(/\n+/).map((p, i) => (
          <p key={i} style={{ margin: i === 0 ? '0 0 8px' : '0 0 8px' }}>{p}</p>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setExpanded(e => !e)}
          style={{
            background: 'transparent', border: `1px solid ${BORDER}`,
            color: TXT, fontSize: 12, fontWeight: 700,
            padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
          }}>
          {expanded ? '— Nascondi dettagli' : '+ Dettagli KPI'}
        </button>
        <div style={{ marginLeft: 'auto', fontSize: 10.5, color: SOFT }}>generato dall'AI 🤖</div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {k.ricaviIeri > 0 && kpiBox('Ricavi ieri', `€ ${Number(k.ricaviIeri).toLocaleString('it-IT', { maximumFractionDigits: 0 })}`)}
          {k.ricaviSettCorr > 0 && kpiBox('Settimana in corso', `€ ${Number(k.ricaviSettCorr).toLocaleString('it-IT', { maximumFractionDigits: 0 })}`,
            k.ricaviSettPrec > 0 ? `${(((k.ricaviSettCorr - k.ricaviSettPrec) / k.ricaviSettPrec) * 100).toFixed(1)}% vs prec.` : null)}
          {k.foodCostMedio != null && kpiBox('Food cost', `${k.foodCostMedio.toFixed(1)}%`, 'media 7gg')}
          {k.topProdotto && kpiBox('Bestseller', k.topProdotto.nome, `${k.topProdotto.qta} pz`)}
          {k.mpSottoSoglia?.length > 0 && kpiBox('MP sotto soglia', `${k.mpSottoSoglia.length}`, k.mpSottoSoglia.slice(0, 2).map(m => m.nome).join(', '))}
          {k.fattureScadute?.length > 0 && kpiBox('Fatture scadute', `${k.fattureScadute.length}`, 'attenzione')}
        </div>
      )}
    </div>
  )
}
