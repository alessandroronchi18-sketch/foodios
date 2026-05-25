import React, { useEffect, useState } from 'react'
import { sload, ssave } from '../lib/storage'
import { supabase } from '../lib/supabase'

export const BMK_KEY = 'pasticceria-benchmark-optin-v1'
const SK_CHIUS = 'pasticceria-chiusure-v1'
const SK_GIOR = 'pasticceria-giornaliero-v1'

const card = { background: '#FFF', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20 }

function annoMeseCorrente() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function calcolaFoodCostMeseCorrente(orgId, sedeId) {
  // Aggregato semplice: media food_cost_pct delle sessioni giornaliero del mese corrente.
  const v = await sload(SK_GIOR, orgId, sedeId || null)
  const arr = Array.isArray(v) ? v : []
  const am = annoMeseCorrente()
  let sum = 0, cnt = 0
  for (const sess of arr) {
    if (!sess?.data?.startsWith(am)) continue
    const ric = Number(sess.ricavoTot || 0)
    const fc = Number(sess.fcTot || 0)
    if (ric > 0) {
      sum += (fc / ric) * 100
      cnt++
    }
  }
  return cnt > 0 ? { fcPct: sum / cnt, sample: cnt, anno_mese: am } : null
}

async function inviaBenchmark({ orgId, tipoAttivita, citta, fcPct, anno_mese }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { stored: false, reason: 'sessione non disponibile' }
  const r = await fetch('/api/benchmark', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      organization_id: orgId,
      tipo_attivita: (tipoAttivita || '').toLowerCase(),
      citta: citta || null,
      food_cost_pct: fcPct,
      anno_mese,
    }),
  })
  return r.json().catch(() => ({ stored: false }))
}

export default function BenchmarkOptin({ orgId, sedeId, tipoAttivita, sedi, notify }) {
  const [optin, setOptin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  useEffect(() => {
    if (!orgId) return
    sload(BMK_KEY, orgId, null).then(v => {
      setOptin(!!v?.attivo)
      setLoading(false)
    })
  }, [orgId])

  async function toggle(nuovo) {
    setOptin(nuovo)
    try {
      await ssave(BMK_KEY, { attivo: nuovo, aggiornato_il: new Date().toISOString() }, orgId, null)
      notify?.(nuovo ? '✓ Benchmark attivati' : '✓ Benchmark disattivati')
      if (nuovo) await contribuisci()
    } catch (e) {
      notify?.('⚠ Errore salvataggio', false)
      setOptin(!nuovo)
    }
  }

  async function contribuisci() {
    setSending(true)
    try {
      const cittaDefault = (sedi || []).find(s => s.is_default)?.citta
        || (sedi || [])[0]?.citta || null
      const sedeDefault = (sedi || []).find(s => s.is_default)?.id || sedeId
      const r = await calcolaFoodCostMeseCorrente(orgId, sedeDefault)
      if (!r) {
        notify?.('⚠ Nessun dato sufficiente per contribuire', false)
        setLastResult({ ok: false, reason: 'no_data' })
        return
      }
      const out = await inviaBenchmark({
        orgId, tipoAttivita, citta: cittaDefault,
        fcPct: Number(r.fcPct.toFixed(2)),
        anno_mese: r.anno_mese,
      })
      setLastResult({ ok: !!out?.stored, fcPct: r.fcPct, sample: r.sample, reason: out?.reason })
      if (out?.stored) notify?.('✓ Dato anonimo condiviso')
      else if (out?.reason) notify?.('⚠ ' + out.reason, false)
    } catch (e) {
      notify?.('⚠ ' + (e.message || 'Errore invio'), false)
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: '#94A3B8', padding: 24 }}>Caricamento…</div>

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>📈 Benchmark anonimi</div>
          <button onClick={() => toggle(!optin)}
            style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
              background: optin ? '#10B981' : '#CBD5E1', transition: 'background 0.2s' }}>
            <span style={{ position: 'absolute', top: 3, left: optin ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#FFF', transition: 'left 0.2s' }} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.7 }}>
          Se attivo, FoodOS invierà <strong style={{ color: '#0F172A' }}>solo dati aggregati</strong> e anonimi (food cost %, tipo attività, città) per costruire benchmark di settore. Niente nome attività, indirizzi, ricette o numeri privati.
          In cambio, vedrai nella sezione <strong>Food Cost</strong> la media del tuo settore confrontata con la tua.
        </div>

        {optin && (
          <div style={{ marginTop: 16, padding: 14, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#166534', marginBottom: 8 }}>
              Contributo automatico al mese corrente. Puoi forzarlo ora:
            </div>
            <button onClick={contribuisci} disabled={sending}
              style={{ padding: '8px 16px', background: '#0F766E', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: sending ? 'wait' : 'pointer' }}>
              {sending ? 'Invio…' : 'Contribuisci ora'}
            </button>
            {lastResult && (
              <div style={{ fontSize: 11, color: lastResult.ok ? '#166534' : '#92400E', marginTop: 10 }}>
                {lastResult.ok
                  ? `✓ Inviato (FC ${lastResult.fcPct?.toFixed(1)}%, ${lastResult.sample} sessioni)`
                  : `⚠ Non inviato${lastResult.reason ? ': ' + lastResult.reason : ''}`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Widget compatto per la view Food Cost — mostra media settore vs tu
export function BenchmarkBadge({ tipoAttivita, miaFcPct, citta }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!tipoAttivita) return
    const q = new URLSearchParams({ tipo: tipoAttivita })
    if (citta) q.set('citta', citta)
    fetch(`/api/benchmark?${q.toString()}`).then(r => r.json()).then(setData).catch(() => setData({ available: false }))
  }, [tipoAttivita, citta])

  if (!data) return null
  if (!data.available) return null
  if (!data.sample) return (
    <div style={{ fontSize: 11, color: '#64748B', padding: '6px 10px', background: '#F1F5F9', borderRadius: 8, display: 'inline-block' }}>
      Benchmark settore: dati insufficienti — sii il primo a contribuire dalle Impostazioni
    </div>
  )

  const media = data.media_settore
  const delta = miaFcPct != null ? (miaFcPct - media) : null
  const color = delta == null ? '#64748B' : delta < -1 ? '#10B981' : delta > 1 ? '#6E0E1A' : '#92400E'

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 14, padding: '10px 16px',
      background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12,
    }}>
      <div>
        <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
          Media settore{data.media_citta ? ` · ${citta}` : ''}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
          {(data.media_citta?.valore ?? media).toFixed(1)}%
        </div>
        <div style={{ fontSize: 10, color: '#94A3B8' }}>n={data.media_citta?.sample ?? data.sample}</div>
      </div>
      {miaFcPct != null && (
        <div style={{ borderLeft: '1px solid #E2E8F0', paddingLeft: 14 }}>
          <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Tu sei a</div>
          <div style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
            {miaFcPct.toFixed(1)}%
          </div>
          {delta != null && (
            <div style={{ fontSize: 10, color, fontWeight: 600 }}>
              {delta > 0 ? `+${delta.toFixed(1)} pt più alto` : `${delta.toFixed(1)} pt più basso`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
