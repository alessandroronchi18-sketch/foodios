// Pricing dinamico competitor (B9) - MVP
//
// MVP: l'utente inserisce prezzi competitor a mano (è la versione "lite"
// del scraping). L'AI analizza il proprio prezzo vs i competitor e
// suggerisce un range di prezzo + impatto stimato sul margine.
//
// V2: scraping automatico Google Maps + Just Eat + Deliveroo per coordinate
// sede + raggio. Salva su public.competitor_prices.

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import { buildIngCosti, calcolaFC, getR } from '../lib/foodcost'
import Icon from '../components/Icon'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'
const GREEN = T.green || '#16A34A'
const AMBER = T.amber || '#D97706'

export default function CompetitorPricingView({ orgId, sedeId, ricettario }) {
  const isMobile = useIsMobile()
  const ricetteArr = Array.isArray(ricettario) ? ricettario : []
  const [ricSel, setRicSel] = useState('')
  const [competitors, setCompetitors] = useState([])
  const [newComp, setNewComp] = useState({ nome: '', prezzo: '' })
  const [aiInsight, setAiInsight] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  // Persist competitors locale via supabase
  useEffect(() => {
    if (!orgId) return
    let alive = true
    async function load() {
      const { data } = await supabase
        .from('competitor_prices')
        .select('*')
        .eq('organization_id', orgId)
        .order('scraped_at', { ascending: false })
        .limit(50)
      if (alive) setCompetitors(data || [])
    }
    load()
    return () => { alive = false }
  }, [orgId])

  const ricCurrent = useMemo(() => ricetteArr.find(r => (r.nome || '') === ricSel), [ricSel, ricetteArr])

  const fcInfo = useMemo(() => {
    if (!ricCurrent) return null
    const ic = buildIngCosti(ricetteArr)
    const fc = calcolaFC(ricCurrent, ic, ricetteArr) || {}
    return {
      fcPezzo: Number(fc.fcPerPezzo) || Number(fc.fc) || 0,
      prezzo: Number(getR(ricCurrent, 'prezzo')) || 0,
    }
  }, [ricCurrent, ricetteArr])

  const compFiltered = useMemo(() => {
    if (!ricSel) return []
    return competitors.filter(c => c.prodotto?.toUpperCase().trim() === ricSel.toUpperCase().trim())
  }, [competitors, ricSel])

  const compStats = useMemo(() => {
    if (compFiltered.length === 0) return null
    const prezzi = compFiltered.map(c => Number(c.prezzo)).filter(x => x > 0)
    if (prezzi.length === 0) return null
    return {
      min: Math.min(...prezzi),
      max: Math.max(...prezzi),
      media: prezzi.reduce((s, x) => s + x, 0) / prezzi.length,
      n: prezzi.length,
    }
  }, [compFiltered])

  async function aggiungiCompetitor() {
    if (!ricSel || !newComp.nome.trim() || !newComp.prezzo) return
    try {
      const { data, error } = await supabase.from('competitor_prices').insert({
        organization_id: orgId,
        sede_id: sedeId || null,
        competitor_nome: newComp.nome.trim(),
        prodotto: ricSel,
        prezzo: Number(newComp.prezzo),
      }).select().single()
      if (error) throw error
      setCompetitors(prev => [data, ...prev])
      setNewComp({ nome: '', prezzo: '' })
    } catch (e) { alert('Errore: ' + e.message) }
  }

  async function rimuoviCompetitor(id) {
    try {
      await supabase.from('competitor_prices').delete().eq('id', id)
      setCompetitors(prev => prev.filter(c => c.id !== id))
    } catch {}
  }

  async function chiediAi() {
    if (!compStats || !fcInfo) return
    setAiLoading(true); setAiInsight(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const system = `Sei un pricing consultant per pasticcerie italiane.
Ricevi: il tuo prezzo, food cost, e prezzi competitor (min/max/media).
Restituisci JSON ESATTO:
{
  "verdetto": "sottoprezzato"|"in_linea"|"sovrapprezzato",
  "prezzo_consigliato": <num>,
  "spiegazione": "<2 frasi italiano>",
  "azione": "<1 frase azione concreta>"
}
Niente markdown, solo JSON.`

      const userMsg = `Prodotto: ${ricSel}
Tuo prezzo: €${fcInfo.prezzo.toFixed(2)}
Tuo food cost: €${fcInfo.fcPezzo.toFixed(2)} (${(fcInfo.fcPezzo/fcInfo.prezzo*100).toFixed(1)}%)

Competitor (${compStats.n} rilevati):
- Prezzo min: €${compStats.min.toFixed(2)}
- Prezzo max: €${compStats.max.toFixed(2)}
- Prezzo medio: €${compStats.media.toFixed(2)}`

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          temperature: 0.3,
          system,
          messages: [{ role: 'user', content: userMsg }],
        }),
      })
      if (!res.ok) {
        if (res.status === 429) throw new Error('Troppe richieste AI. Riprova fra 1 minuto.')
        if (res.status === 401) throw new Error('Sessione scaduta. Esci e rientra.')
        throw new Error(`Servizio AI indisponibile (HTTP ${res.status}). Riprova fra poco.`)
      }
      const json = await res.json()
      const text = (json.content || []).find(c => c.type === 'text')?.text || ''
      const m = text.match(/\{[\s\S]*\}/)
      if (m) {
        try { setAiInsight(JSON.parse(m[0])) }
        catch { setAiInsight({ verdetto: 'errore', spiegazione: 'AI ha prodotto JSON non valido' }) }
      } else {
        setAiInsight({ verdetto: 'errore', spiegazione: 'AI non ha prodotto JSON' })
      }
    } catch (e) {
      setAiInsight({ verdetto: 'errore', spiegazione: e.message })
    } finally { setAiLoading(false) }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Pricing strategy
        </div>
        <h1 style={{ margin: '6px 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 800, color: TXT, letterSpacing: '-0.02em' }}>
          Confronto prezzi vs competitor
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: SOFT, lineHeight: 1.5 }}>
          Inserisci i prezzi dei competitor in zona. L'AI valuta se sei sotto/sopra prezzo e suggerisce range.
        </p>
      </div>

      {/* Selettore ricetta */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
          Prodotto da confrontare
        </div>
        <select value={ricSel} onChange={e => { setRicSel(e.target.value); setAiInsight(null) }}
          style={{ width: '100%', maxWidth: 400, padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, color: TXT, fontFamily: 'inherit' }}>
          <option value="">— Scegli prodotto —</option>
          {ricetteArr.map(r => <option key={r.nome} value={r.nome}>{r.nome}</option>)}
        </select>
      </div>

      {ricSel && fcInfo && (
        <>
          {/* Tuo prezzo */}
          <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#0369A1', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Il tuo prezzo</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: TXT, marginTop: 2 }}>€{fcInfo.prezzo.toFixed(2)}</div>
            </div>
            <div style={{ fontSize: 12, color: MID, lineHeight: 1.5 }}>
              Food cost €{fcInfo.fcPezzo.toFixed(2)} ({(fcInfo.fcPezzo / fcInfo.prezzo * 100).toFixed(1)}%)<br/>
              Margine lordo €{(fcInfo.prezzo - fcInfo.fcPezzo).toFixed(2)}
            </div>
          </div>

          {/* Aggiungi competitor */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 10 }}>
              Aggiungi un competitor che vende {ricSel}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 120px 120px', gap: 8 }}>
              <input value={newComp.nome} onChange={e => setNewComp(s => ({ ...s, nome: e.target.value }))} placeholder="Nome competitor (es. Pasticceria Rossi)"
                style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: 'inherit' }}/>
              <input type="number" step="0.01" value={newComp.prezzo} onChange={e => setNewComp(s => ({ ...s, prezzo: e.target.value }))} placeholder="Prezzo €"
                style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: 'inherit' }}/>
              <button onClick={aggiungiCompetitor} disabled={!newComp.nome.trim() || !newComp.prezzo}
                style={{ background: BRAND, color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Aggiungi
              </button>
            </div>
          </div>

          {/* Lista competitor + stats */}
          {compStats && (
            <>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                  <Stat label="Media zona" value={`€${compStats.media.toFixed(2)}`} hint={`${compStats.n} rilevati`}/>
                  <Stat label="Range min-max" value={`€${compStats.min.toFixed(2)} - €${compStats.max.toFixed(2)}`}/>
                  <Stat label="Tuo prezzo" value={`€${fcInfo.prezzo.toFixed(2)}`}
                    color={fcInfo.prezzo < compStats.media * 0.9 ? AMBER : fcInfo.prezzo > compStats.media * 1.1 ? BRAND : GREEN}/>
                  <button onClick={chiediAi} disabled={aiLoading}
                    style={{ marginLeft: 'auto', background: BRAND, color: '#FFF', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="sparkles" size={12}/> {aiLoading ? 'Analizzo…' : 'Verdetto AI'}
                  </button>
                </div>

                {aiInsight && (
                  <div style={{
                    background: aiInsight.verdetto === 'sottoprezzato' ? '#FEF3C7' : aiInsight.verdetto === 'sovrapprezzato' ? '#FEF2F2' : '#F0FDF4',
                    border: `1px solid ${aiInsight.verdetto === 'sottoprezzato' ? AMBER : aiInsight.verdetto === 'sovrapprezzato' ? BRAND : GREEN}`,
                    borderRadius: 10, padding: '12px 14px', marginTop: 12,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: TXT, marginBottom: 6, textTransform: 'capitalize' }}>
                      Verdetto: {(aiInsight.verdetto || '').replace('_', ' ')}
                      {aiInsight.prezzo_consigliato && <> · suggerito €{aiInsight.prezzo_consigliato.toFixed(2)}</>}
                    </div>
                    <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.5 }}>{aiInsight.spiegazione}</div>
                    {aiInsight.azione && <div style={{ fontSize: 12.5, color: TXT, marginTop: 6, fontWeight: 600 }}>→ {aiInsight.azione}</div>}
                  </div>
                )}
              </div>

              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Competitor monitorati per "{ricSel}"
                </div>
                {compFiltered.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 6px', borderTop: `1px solid ${BORDER}` }}>
                    <span style={{ flex: 1, fontSize: 13, color: TXT }}>{c.competitor_nome}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TXT, fontVariantNumeric: 'tabular-nums' }}>€{Number(c.prezzo).toFixed(2)}</span>
                    <button onClick={() => rimuoviCompetitor(c.id)} style={{ background: 'transparent', border: 'none', color: SOFT, cursor: 'pointer', padding: 4 }}>
                      <Icon name="x" size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: SOFT, textAlign: 'center', lineHeight: 1.5 }}>
        💡 V2 in roadmap: scraping automatico menu pubblici (Google Maps / Just Eat) in raggio 1km dalla sede.
      </div>
    </div>
  )
}

function Stat({ label, value, color, hint }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: SOFT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || TXT, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: 10.5, color: SOFT, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}
