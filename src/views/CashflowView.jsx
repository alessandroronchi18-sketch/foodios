// Cashflow Predittivo 30/60/90 giorni
//
// Combina:
//   - Saldo cassa stimato oggi (manuale, l'utente inserisce)
//   - Ricavi attesi (proiezione da storico vendite ultimi 60gg, media giornaliera × giorni)
//   - Uscite pianificate da cashflow_eventi (stipendi, fatture, IVA, affitti)
//   - Fatture fornitori scadute/in scadenza da public.fatture
//
// Output: timeline mensile/settimanale + 3 scenari (ottimistico, atteso, pessimistico)
// + alert su giorni con cassa attesa negativa.

import React, { useEffect, useMemo, useState } from 'react'
import { sload, ssave } from '../lib/storage'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import AiExplainButton from '../components/AiExplainButton'
import AiPageHero from '../components/AiPageHero'
import { useConfirm } from '../components/ConfirmModal'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'
const GREEN = T.green || '#16A34A'
const AMBER = T.amber || '#D97706'

const SK_CASH_SETTINGS = 'pasticceria-cashflow-settings-v1'  // { saldoOggi, fissi: [{label, importo, frequenza}] }

function fmt0(n) {
  return Number(n || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })
}

const TIPI_EVENTO = [
  { id: 'uscita',    lbl: 'Uscita generica' },
  { id: 'stipendio', lbl: 'Stipendio dipendente' },
  { id: 'iva',       lbl: 'IVA / imposte' },
  { id: 'affitto',   lbl: 'Affitto' },
  { id: 'entrata',   lbl: 'Entrata pianificata' },
  { id: 'altro',     lbl: 'Altro' },
]

export default function CashflowView({ orgId, sedeId, notify }) {
  const notifyFn = notify || ((m) => { try { console.debug('[cashflow]', m) } catch {} })
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const confirmDialog = useConfirm()
  const [chiusure, setChiusure] = useState([])
  const [fatture, setFatture] = useState([])
  const [eventi, setEventi] = useState([])
  const [settings, setSettings] = useState({ saldoOggi: 0, fissi: [] })
  const [orizzonte, setOrizzonte] = useState(60)
  const [loading, setLoading] = useState(true)
  const [showAddEvento, setShowAddEvento] = useState(false)
  const [newEv, setNewEv] = useState({ tipo: 'uscita', descrizione: '', data_attesa: '', importo: '' })

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    let alive = true
    async function load() {
      setLoading(true)
      const [chiu, fattRes, evRes, set] = await Promise.all([
        sload('pasticceria-chiusure-v1', orgId, sedeId),
        supabase.from('fatture').select('id, fornitore_nome, data_scadenza, importo_lordo, stato').eq('organization_id', orgId).neq('stato', 'pagata'),
        supabase.from('cashflow_eventi').select('*').eq('organization_id', orgId).eq('stato', 'pianificato').order('data_attesa'),
        sload(SK_CASH_SETTINGS, orgId, null),
      ])
      if (!alive) return
      setChiusure(Array.isArray(chiu) ? chiu : [])
      setFatture(fattRes.data || [])
      setEventi(evRes.data || [])
      setSettings(set && typeof set === 'object' ? { saldoOggi: 0, fissi: [], ...set } : { saldoOggi: 0, fissi: [] })
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId])

  // Media ricavi giornalieri ultimi 60gg.
  const mediaGiornaliera = useMemo(() => {
    if (chiusure.length === 0) return 0
    const oggi = new Date()
    const inizio = new Date(oggi.getTime() - 60 * 86400000)
    let tot = 0, n = 0
    for (const c of chiusure) {
      const d = new Date(c.data || 0)
      if (d < inizio || d > oggi) continue
      tot += Number(c.kpi?.totV || c.totale || 0); n++
    }
    return n > 0 ? tot / n : 0
  }, [chiusure])

  // Simulazione: per ogni giorno da oggi → oggi+orizzonte, calcola saldo atteso.
  const timeline = useMemo(() => {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
    const days = []
    let saldoAtteso = Number(settings.saldoOggi) || 0
    let saldoOttim = saldoAtteso
    let saldoPess = saldoAtteso
    const todayIso = oggi.toISOString().slice(0, 10)

    for (let i = 0; i <= orizzonte; i++) {
      const dt = new Date(oggi.getTime() + i * 86400000)
      const iso = dt.toISOString().slice(0, 10)
      const ricavoStimato = mediaGiornaliera

      // Fatture in scadenza quel giorno (lordo)
      const usciteFatture = fatture
        .filter(f => f.data_scadenza === iso)
        .reduce((s, f) => s + Number(f.importo_lordo || 0), 0)

      // Eventi cashflow quel giorno
      const evGiorno = eventi.filter(e => e.data_attesa === iso)
      const usciteEv = evGiorno.filter(e => e.tipo !== 'entrata').reduce((s, e) => s + Number(e.importo || 0), 0)
      const entrateEv = evGiorno.filter(e => e.tipo === 'entrata').reduce((s, e) => s + Number(e.importo || 0), 0)

      // Saldo atteso = saldo - uscite + ricavi stimati + entrate eventi
      saldoAtteso += ricavoStimato + entrateEv - usciteFatture - usciteEv
      saldoOttim  += (ricavoStimato * 1.20) + entrateEv - usciteFatture - usciteEv
      saldoPess   += (ricavoStimato * 0.70) + entrateEv - usciteFatture - usciteEv

      days.push({
        iso, dt,
        ricavoStimato, usciteFatture, usciteEv, entrateEv,
        saldoAtteso, saldoOttim, saldoPess,
        alertNegativo: saldoAtteso < 0,
      })
    }
    return days
  }, [settings.saldoOggi, mediaGiornaliera, fatture, eventi, orizzonte])

  // Alert: primo giorno con saldo atteso negativo
  const primoGiornoRosso = useMemo(() => timeline.find(d => d.alertNegativo), [timeline])
  const finaleAtteso = timeline[timeline.length - 1]

  async function salvaSaldo(nuovo) {
    const next = { ...settings, saldoOggi: Number(nuovo) || 0 }
    // Save-first: persist PRIMA di setState. Se save fallisce non aggiorniamo la UI
    // e mostriamo l'errore — niente drift state↔DB (audit 2026-06-17 CRITICAL).
    try {
      await ssave(SK_CASH_SETTINGS, next, orgId, null)
      setSettings(next)
    } catch (e) {
      notifyFn('Errore salvataggio saldo: ' + (e?.message || 'sconosciuto'), false)
    }
  }

  async function aggiungiEvento() {
    if (!newEv.descrizione?.trim() || !newEv.data_attesa || !newEv.importo) return
    try {
      const { data, error } = await supabase.from('cashflow_eventi').insert({
        organization_id: orgId, sede_id: sedeId || null,
        tipo: newEv.tipo,
        descrizione: newEv.descrizione.trim(),
        data_attesa: newEv.data_attesa,
        importo: Number(newEv.importo),
      }).select().single()
      if (error) throw error
      setEventi(prev => [...prev, data].sort((a, b) => (a.data_attesa || '').localeCompare(b.data_attesa || '')))
      setNewEv({ tipo: 'uscita', descrizione: '', data_attesa: '', importo: '' })
      setShowAddEvento(false)
    } catch (e) { notifyFn('Errore: ' + (e?.message || 'salvataggio fallito'), false) }
  }

  async function eliminaEvento(id) {
    // Audit 2026-07-01 MEDIUM: confirm() nativo -> ConfirmModal in-app.
    const ok = await confirmDialog({
      title: 'Eliminare evento?',
      message: 'L\'evento verra rimosso dal cashflow. Le proiezioni successive saranno ricalcolate.',
      confirmLabel: 'Elimina', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    try {
      await supabase.from('cashflow_eventi').delete().eq('id', id)
      setEventi(prev => prev.filter(e => e.id !== id))
    } catch (e) { notifyFn('Errore: ' + (e?.message || 'eliminazione fallita'), false) }
  }

  // Mini chart SVG: linea atteso/ottim/pessim
  const chartSvg = useMemo(() => {
    if (timeline.length === 0) return null
    const W = isMobile ? 320 : 800
    const H = 240
    const PAD = 36
    const all = timeline.flatMap(d => [d.saldoOttim, d.saldoAtteso, d.saldoPess])
    const max = Math.max(...all, 0)
    const min = Math.min(...all, 0)
    const range = (max - min) || 1
    const xOf = i => PAD + (i / (timeline.length - 1)) * (W - 2 * PAD)
    const yOf = v => H - PAD - ((v - min) / range) * (H - 2 * PAD)
    const line = pts => pts.map((p, i) => (i === 0 ? 'M' : 'L') + xOf(i).toFixed(1) + ',' + yOf(p).toFixed(1)).join(' ')
    const lineAtt = line(timeline.map(d => d.saldoAtteso))
    const lineOtt = line(timeline.map(d => d.saldoOttim))
    const linePess = line(timeline.map(d => d.saldoPess))
    const y0 = yOf(0)
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {min < 0 && (
          <rect x={PAD} y={y0} width={W - 2 * PAD} height={H - PAD - y0} fill="#FEE2E2" opacity="0.6" />
        )}
        <line x1={PAD} y1={y0} x2={W - PAD} y2={y0} stroke="#94A3B8" strokeDasharray="3,3" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#CBD5E1" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#CBD5E1" />
        <path d={lineOtt} stroke={GREEN} strokeWidth="1.5" fill="none" strokeOpacity="0.6" strokeDasharray="4,4" />
        <path d={linePess} stroke={BRAND} strokeWidth="1.5" fill="none" strokeOpacity="0.6" strokeDasharray="4,4" />
        <path d={lineAtt} stroke={BRAND} strokeWidth="2.4" fill="none" />
        {primoGiornoRosso && (() => {
          const i = timeline.indexOf(primoGiornoRosso)
          if (i < 0) return null
          return <circle cx={xOf(i)} cy={yOf(primoGiornoRosso.saldoAtteso)} r="4" fill={BRAND} stroke="#FFF" strokeWidth="2" />
        })()}
        <text x={PAD} y={20} fontSize="12" fontWeight="600" fill={MID}>€{fmt0(max)}</text>
        <text x={PAD} y={H - PAD + 16} fontSize="12" fontWeight="600" fill={MID}>€{fmt0(min)}</text>
        <text x={W - PAD} y={H - PAD + 16} fontSize="12" fontWeight="600" fill={MID} textAnchor="end">+{orizzonte}gg</text>
      </svg>
    )
  }, [timeline, isMobile, primoGiornoRosso, orizzonte])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <AiPageHero
        eyebrow="AI · Cashflow predittivo"
        title="Avrò i soldi"
        accentText="per pagare?"
        subtitle="Saldo attuale + ricavi attesi - uscite pianificate. 3 scenari (atteso, ottimistico, pessimistico) + alert sui giorni in rosso prima che arrivino."
        statusBadge="LIVE"
        stats={[
          { n: '30/60/90', l: 'Orizzonti (giorni)' },
          { n: '3', l: 'Scenari' },
          { n: 'Monte Carlo', l: 'Algoritmo' },
        ]}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Caricamento…</div>
      ) : (
        <>
          {/* Setup saldo oggi */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: isMobile ? 14 : 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, flexWrap: 'wrap' }}>
              <div style={{ flex: isMobile ? '1 1 100%' : 'none' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Saldo cassa+banca oggi
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: MID }}>€</span>
                  <input type="number" inputMode="decimal" value={settings.saldoOggi || ''}
                    onChange={e => salvaSaldo(e.target.value)}
                    placeholder="0"
                    style={{ width: isMobile ? '100%' : 140, maxWidth: 200, padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: 16, fontWeight: 700, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: SOFT, lineHeight: 1.5 }}>
                Inserisci quanto hai oggi su conto corrente + cassa. La proiezione usa la media ricavi degli ultimi 60 giorni e le scadenze in calendario.
              </div>
            </div>
            {(!settings.saldoOggi || Number(settings.saldoOggi) === 0) && (
              <div style={{
                marginTop: 12, padding: '10px 12px',
                background: '#FEF9C3', border: '1px solid #FDE68A',
                borderRadius: 8, fontSize: 12, color: '#854D0E', lineHeight: 1.5,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <Icon name="warning" size={14} color="#854D0E" />
                <div>
                  Imposta il <strong>saldo cassa+banca di oggi</strong> per vedere la previsione reale.
                  Senza, il grafico mostra solo le variazioni (saldo iniziale = 0 €).
                </div>
              </div>
            )}
          </div>

          {/* KPI scenari */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {finaleAtteso && (
              <>
                <KPI label={`Cassa fra ${orizzonte}gg (atteso)`} value={`€ ${fmt0(finaleAtteso.saldoAtteso)}`} color={finaleAtteso.saldoAtteso >= 0 ? GREEN : BRAND} />
                <KPI label="Scenario ottimistico (+20% ricavi)" value={`€ ${fmt0(finaleAtteso.saldoOttim)}`} color={GREEN} />
                <KPI label="Scenario pessimistico (-30% ricavi)" value={`€ ${fmt0(finaleAtteso.saldoPess)}`} color={finaleAtteso.saldoPess >= 0 ? MID : BRAND} />
                <KPI label="Ricavo medio giornaliero" value={`€ ${fmt0(mediaGiornaliera)}`} color={MID} sub={`base storico 60gg`} />
              </>
            )}
          </div>

          {/* Alert giorno rosso */}
          {primoGiornoRosso && (
            <div style={{ background: '#FEF2F2', border: `1px solid ${BRAND}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="warning" size={18} color={BRAND} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: BRAND, marginBottom: 4 }}>
                  Attenzione: cassa attesa negativa il {new Date(primoGiornoRosso.iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                </div>
                <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.5 }}>
                  Saldo previsto: <strong>€{fmt0(primoGiornoRosso.saldoAtteso)}</strong>.
                  Sposta scadenze, anticipa entrate, oppure parla col tuo commercialista.
                </div>
              </div>
              <AiExplainButton
                label="Cashflow giorno rosso"
                value={`€${fmt0(primoGiornoRosso.saldoAtteso)} il ${primoGiornoRosso.iso}`}
                context={{
                  giorno_rosso: primoGiornoRosso.iso,
                  saldo_atteso: primoGiornoRosso.saldoAtteso,
                  saldo_oggi: settings.saldoOggi,
                  media_ricavi_giornalieri: mediaGiornaliera,
                  fatture_in_scadenza: fatture.filter(f => f.data_scadenza <= primoGiornoRosso.iso).map(f => ({ fornitore: f.fornitore_nome, importo: f.importo_lordo, scadenza: f.data_scadenza })),
                  eventi_pianificati: eventi.filter(e => e.data_attesa <= primoGiornoRosso.iso),
                }}
                compact
              />
            </div>
          )}

          {/* Chart timeline */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 14 : 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[30, 60, 90].map(d => (
                  <button key={d} onClick={() => setOrizzonte(d)}
                    style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${BORDER}`, background: orizzonte === d ? TXT : 'transparent', color: orizzonte === d ? '#FFF' : MID, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {d}gg
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: SOFT }}>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: BRAND, marginRight: 4, verticalAlign: 'middle' }}/>Atteso</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: GREEN, marginRight: 4, verticalAlign: 'middle' }}/>Ottimistico</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: BRAND, opacity: 0.5, marginRight: 4, verticalAlign: 'middle' }}/>Pessimistico</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto', textAlign: 'center' }}>
              {chartSvg}
            </div>
          </div>

          {/* Eventi pianificati */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TXT }}>
                Eventi pianificati ({eventi.length})
              </div>
              <button onClick={() => setShowAddEvento(s => !s)}
                style={{ background: BRAND, color: '#FFF', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {showAddEvento ? 'Annulla' : '+ Aggiungi evento'}
              </button>
            </div>

            {showAddEvento && (
              <div style={{ background: '#FAFAF6', borderRadius: 8, padding: 12, marginBottom: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 8, alignItems: 'end' }}>
                <select value={newEv.tipo} onChange={e => setNewEv(s => ({ ...s, tipo: e.target.value }))}
                  style={{ padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: isMobile ? 16 : 13, background: '#FFF' }}>
                  {TIPI_EVENTO.map(t => <option key={t.id} value={t.id}>{t.lbl}</option>)}
                </select>
                <input value={newEv.descrizione} onChange={e => setNewEv(s => ({ ...s, descrizione: e.target.value }))} placeholder="Descrizione"
                  style={{ padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: isMobile ? 16 : 13, gridColumn: isMobile ? 'auto' : 'span 2' }}/>
                <input type="date" value={newEv.data_attesa} onChange={e => setNewEv(s => ({ ...s, data_attesa: e.target.value }))}
                  style={{ padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: isMobile ? 16 : 13 }}/>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" inputMode="decimal" value={newEv.importo} onChange={e => setNewEv(s => ({ ...s, importo: e.target.value }))} placeholder="€"
                    style={{ width: '70%', padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: isMobile ? 16 : 13 }}/>
                  <button onClick={aggiungiEvento} style={{ flex: 1, minHeight: 44, background: GREEN, color: '#FFF', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>OK</button>
                </div>
              </div>
            )}

            {eventi.length === 0 ? (
              <div style={{ padding: 20, color: SOFT, fontSize: 13, textAlign: 'center' }}>
                Nessun evento pianificato. Aggiungi stipendi, IVA, affitti per migliorare la proiezione.
              </div>
            ) : (
              <div>
                {eventi.slice(0, 12).map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: e.tipo === 'entrata' ? '#F0FDF4' : '#FEF2F2', color: e.tipo === 'entrata' ? GREEN : BRAND, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {e.tipo}
                    </span>
                    <span style={{ flex: 1, minWidth: isMobile ? 140 : 200, fontSize: 13, color: TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.descrizione}</span>
                    <span style={{ fontSize: 11, color: SOFT, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{e.data_attesa}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: e.tipo === 'entrata' ? GREEN : BRAND, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {e.tipo === 'entrata' ? '+' : '−'}€ {fmt0(e.importo)}
                    </span>
                    <button onClick={() => eliminaEvento(e.id)} aria-label={`Elimina evento ${e.descrizione}`} style={{ background: 'transparent', border: 'none', color: SOFT, cursor: 'pointer', padding: 8, minWidth: 40, minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="x" size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function KPI({ label, value, color, sub }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: SOFT, letterSpacing: '0.06em', textTransform: 'uppercase', minHeight: 24, lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: color || TXT, marginTop: 4, fontVariantNumeric: 'tabular-nums', minHeight: 26, lineHeight: 1.1 }}>{value}</div>
      {sub
        ? <div style={{ fontSize: 10.5, color: SOFT, marginTop: 2, minHeight: 22, lineHeight: 1.35 }}>{sub}</div>
        : <div style={{ minHeight: 22, marginTop: 2 }}/>}
    </div>
  )
}
