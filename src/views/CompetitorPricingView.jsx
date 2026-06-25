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
import { callAi } from '../lib/aiClient'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'
const GREEN = T.green || '#16A34A'
const AMBER = T.amber || '#D97706'

export default function CompetitorPricingView({ orgId, sedeId, ricettario, notify }) {
  const notifyFn = notify || ((m) => console.debug('[competitor]', m))
  const isMobile = useIsMobile()
  const ricetteArr = useMemo(
    () => (ricettario?.ricette ? Object.values(ricettario.ricette) : []),
    [ricettario]
  )
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
    const ic = buildIngCosti(ricettario?.ingredienti_costi || {})
    const { tot: fcPezzo } = calcolaFC(ricCurrent, ic, ricettario)
    return {
      fcPezzo,
      prezzo: Number(getR(ricCurrent.nome, ricCurrent).prezzo) || 0,
    }
  }, [ricCurrent, ricettario])

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
    } catch (e) { notifyFn('Errore: ' + (e?.message || 'rete'), false) }
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

    // Numeri italiani (memory feedback-numeri-italiani)
    const _e = n => `€ ${Number(n||0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const fcPct = (fcInfo.fcPezzo / fcInfo.prezzo * 100)
    const targetFC = 30  // benchmark pasticceria sana
    const yourMargPct = 100 - fcPct
    const distMin = ((fcInfo.prezzo - compStats.min) / compStats.min * 100)
    const distMax = ((fcInfo.prezzo - compStats.max) / compStats.max * 100)
    const distMed = ((fcInfo.prezzo - compStats.media) / compStats.media * 100)

    // Prompt potenziato: include benchmark settore, distanza % dai competitor,
    // chiede output strutturato esteso (verdetto + range + impatto margine + confidence).
    // Anti AI-tone: "Mara pasticcera" persona (memory feedback-no-ai-copy).
    const system = `Sei Mara, una consulente di pricing per pasticcerie e gelaterie italiane.
Parli come una collega esperta, frasi brevi, italiano umano. Niente "Mi dispiace ma...",
niente "Vorrei suggerire", niente lessico da AI. Vai dritta al punto.

Benchmark settore (pasticceria artigianale IT):
- Food cost sano: 25-30% del prezzo vendita
- Margine lordo target: 70-75%
- Differenza prezzo vs competitor media: ±15% è "in linea", oltre è sotto/sovra

Restituisci SOLO JSON valido (no markdown), con questi campi esatti:
{
  "verdetto": "sottoprezzato" | "in_linea" | "sovrapprezzato",
  "prezzo_consigliato": <num decimale, mai stringa>,
  "range_consigliato": { "min": <num>, "max": <num> },
  "impatto_margine_pct": <num — differenza punti % vs margine attuale>,
  "confidence": <0.0-1.0 — quanta certezza nel verdetto, in base al n. competitor>,
  "spiegazione": "<max 2 frasi: cosa vedo nei dati, in italiano umano>",
  "azione": "<1 frase imperativa: cosa fare lunedì, tipo 'alza il prezzo a X' o 'tieni il prezzo, lavora sul food cost'>",
  "rischio": "<1 frase: cosa potrebbe andare male se applichi l'azione>"
}`

    const userMsg = `Prodotto: ${ricSel}

Tuo posizionamento attuale:
- Tuo prezzo: ${_e(fcInfo.prezzo)}
- Tuo food cost: ${_e(fcInfo.fcPezzo)} (${fcPct.toFixed(1)}% del prezzo)
- Tuo margine lordo: ${yourMargPct.toFixed(1)}% (benchmark sano: ${100-targetFC}%)

Competitor in zona (${compStats.n} ${compStats.n === 1 ? 'rilevato' : 'rilevati'}):
- Min: ${_e(compStats.min)} (tu sei ${distMin >= 0 ? '+' : ''}${distMin.toFixed(1)}% rispetto al min)
- Max: ${_e(compStats.max)} (tu sei ${distMax >= 0 ? '+' : ''}${distMax.toFixed(1)}% rispetto al max)
- Media: ${_e(compStats.media)} (tu sei ${distMed >= 0 ? '+' : ''}${distMed.toFixed(1)}% rispetto alla media)

Confidence calibration: ${compStats.n} competitor → confidence max ${Math.min(0.95, 0.3 + compStats.n * 0.15).toFixed(2)}.
Valuta se sono sotto, in linea o sopra, e dimmi cosa farei al posto mio.`

    try {
      const { json } = await callAi({
        feature: 'competitor-pricing',
        model: 'claude-sonnet-4-6',
        system,
        prompt: userMsg,
        maxTokens: 500,
        parseJson: true,
        timeoutMs: 25_000,
      })
      if (!json || !json.verdetto) {
        throw Object.assign(new Error('Output AI malformato'), { friendly: 'L\'AI non ha risposto correttamente. Riprova.' })
      }
      setAiInsight({ ...json, _generatedAt: new Date().toISOString() })
    } catch (e) {
      setAiInsight({ verdetto: 'errore', spiegazione: e.friendly || e.message })
    } finally { setAiLoading(false) }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <AiPageHero
        eyebrow="AI · Pricing strategy"
        title="Tuoi prezzi"
        accentText="vs competitor"
        subtitle="Inserisci i prezzi dei competitor in zona. L'AI valuta se sei sottoprezzato, in linea o sovrapprezzato e suggerisce il range corretto."
        statusBadge="LIVE"
        stats={[
          { n: '1km', l: 'Raggio competitor' },
          { n: 'AI', l: 'Verdetto narrativo' },
        ]}
      />

      {/* Selettore ricetta */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
          Prodotto da confrontare
        </div>
        <select value={ricSel} onChange={e => { setRicSel(e.target.value); setAiInsight(null) }}
          style={{ width: '100%', maxWidth: isMobile ? '100%' : 400, padding: isMobile ? '12px 12px' : '10px 12px', minHeight: isMobile ? 46 : 'auto', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 16, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box', background: '#FFF' }}>
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
              <div style={{ fontSize: 24, fontWeight: 900, color: TXT, marginTop: 2 }}>€ {Number(fcInfo.prezzo).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div style={{ fontSize: 12, color: MID, lineHeight: 1.5 }}>
              Food cost € {Number(fcInfo.fcPezzo).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({(fcInfo.fcPezzo / fcInfo.prezzo * 100).toFixed(1)}%)<br/>
              Margine lordo € {Number(fcInfo.prezzo - fcInfo.fcPezzo).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* Aggiungi competitor */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Aggiungi un competitor che vende {ricSel}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 120px 120px', gap: 8 }}>
              <input value={newComp.nome} onChange={e => setNewComp(s => ({ ...s, nome: e.target.value }))} placeholder="Nome competitor (es. Pasticceria Rossi)"
                style={{ padding: isMobile ? '12px 12px' : '10px 12px', minHeight: isMobile ? 46 : 'auto', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box' }}/>
              <input type="number" step="0.01" value={newComp.prezzo} onChange={e => setNewComp(s => ({ ...s, prezzo: e.target.value }))} placeholder="Prezzo €"
                style={{ padding: isMobile ? '12px 12px' : '10px 12px', minHeight: isMobile ? 46 : 'auto', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box' }}/>
              <button onClick={aggiungiCompetitor} disabled={!newComp.nome.trim() || !newComp.prezzo}
                style={{ background: !newComp.nome.trim() || !newComp.prezzo ? '#CBD5E1' : BRAND, color: '#FFF', border: 'none', borderRadius: 8, fontSize: isMobile ? 14 : 13, fontWeight: 700, cursor: !newComp.nome.trim() || !newComp.prezzo ? 'not-allowed' : 'pointer', minHeight: isMobile ? 46 : 'auto', padding: isMobile ? '12px 16px' : '0' }}>
                Aggiungi
              </button>
            </div>
          </div>

          {/* Lista competitor + stats */}
          {compStats && (
            <>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, alignItems: isMobile ? 'start' : 'center', gap: isMobile ? 14 : 16, flexWrap: 'wrap', marginBottom: 14 }}>
                  <Stat label="Media zona" value={`€ ${Number(compStats.media).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} hint={`${Number(compStats.n).toLocaleString('it-IT')} rilevati`}/>
                  <Stat label="Range min-max" value={`€ ${Number(compStats.min).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} – € ${Number(compStats.max).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}/>
                  <Stat label="Tuo prezzo" value={`€ ${Number(fcInfo.prezzo).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    color={fcInfo.prezzo < compStats.media * 0.9 ? AMBER : fcInfo.prezzo > compStats.media * 1.1 ? BRAND : GREEN}/>
                  <button onClick={chiediAi} disabled={aiLoading}
                    style={{ marginLeft: isMobile ? '0' : 'auto', gridColumn: isMobile ? '1 / -1' : undefined, background: BRAND, color: '#FFF', border: 'none', padding: isMobile ? '12px 14px' : '8px 14px', minHeight: isMobile ? 44 : 'auto', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center', width: isMobile ? '100%' : 'auto' }}>
                    <Icon name="sparkles" size={13}/> {aiLoading ? 'Analizzo…' : 'Verdetto AI'}
                  </button>
                </div>

                {aiInsight && (
                  <div style={{
                    background: aiInsight.verdetto === 'sottoprezzato' ? '#FEF3C7' : aiInsight.verdetto === 'sovrapprezzato' ? '#FEF2F2' : aiInsight.verdetto === 'errore' ? '#FFF3F3' : '#F0FDF4',
                    border: `1px solid ${aiInsight.verdetto === 'sottoprezzato' ? AMBER : aiInsight.verdetto === 'sovrapprezzato' ? BRAND : aiInsight.verdetto === 'errore' ? BRAND : GREEN}`,
                    borderRadius: 10, padding: '12px 14px', marginTop: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: TXT, textTransform: 'capitalize' }}>
                        Verdetto: {(aiInsight.verdetto || '').replace('_', ' ')}
                      </div>
                      {aiInsight.prezzo_consigliato && (
                        <div style={{ fontSize: 12.5, color: MID, fontWeight: 700 }}>
                          → € {Number(aiInsight.prezzo_consigliato).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {aiInsight.range_consigliato?.min && aiInsight.range_consigliato?.max && (
                            <span style={{ fontWeight: 500, color: SOFT }}> (€ {Number(aiInsight.range_consigliato.min).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} – € {Number(aiInsight.range_consigliato.max).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                          )}
                        </div>
                      )}
                      {typeof aiInsight.confidence === 'number' && (
                        <div title="Quanta certezza ha l'AI nel verdetto, sulla base del numero di competitor"
                          style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 4, background: '#FFF', color: SOFT, fontWeight: 600 }}>
                          {Math.round(aiInsight.confidence * 100)}% sicurezza
                        </div>
                      )}
                    </div>
                    {aiInsight.spiegazione && (
                      <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.55 }}>{aiInsight.spiegazione}</div>
                    )}
                    {aiInsight.azione && (
                      <div style={{ fontSize: 12.5, color: TXT, marginTop: 8, fontWeight: 700 }}>
                        → {aiInsight.azione}
                      </div>
                    )}
                    {typeof aiInsight.impatto_margine_pct === 'number' && aiInsight.impatto_margine_pct !== 0 && (
                      <div style={{ fontSize: 11.5, color: SOFT, marginTop: 6 }}>
                        Impatto stimato sul margine: <strong style={{ color: aiInsight.impatto_margine_pct > 0 ? GREEN : BRAND }}>
                          {aiInsight.impatto_margine_pct > 0 ? '+' : ''}{Number(aiInsight.impatto_margine_pct).toFixed(1)} punti %
                        </strong>
                      </div>
                    )}
                    {aiInsight.rischio && (
                      <div style={{ fontSize: 11.5, color: SOFT, marginTop: 6, fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Icon name="warning" size={12}/> <span>{aiInsight.rischio}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Competitor monitorati per "{ricSel}"
                </div>
                {compFiltered.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 6px', borderTop: `1px solid ${BORDER}` }}>
                    <span style={{ flex: 1, fontSize: 13, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.competitor_nome}>{c.competitor_nome}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TXT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>€ {Number(c.prezzo).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <button aria-label={`Rimuovi competitor ${c.competitor_nome}`} onClick={() => rimuoviCompetitor(c.id)} style={{ background: 'transparent', border: 'none', color: SOFT, cursor: 'pointer', padding: 0, width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, flexShrink: 0 }}>
                      <Icon name="x" size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: SOFT, textAlign: 'center', lineHeight: 1.5 }}>
        V2 in roadmap: scraping automatico menu pubblici (Google Maps / Just Eat) in raggio 1km dalla sede.
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
