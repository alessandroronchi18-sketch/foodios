// VenditeB2BView - vendite all'ingrosso a clienti business (canale separato dal retail).
// Audit UI 2026-06-24: KPI uniformi, € dopo cifra, mobile column-first, font 16px input,
// touch target 40/44, nowrap+ellipsis, aria-label, tabelle overflowX+minWidth,
// filtri pill wrap, helper fmt/fmt0 IT.
import React, { useEffect, useMemo, useState } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import { isRicettaValida, getR, buildIngCosti, calcolaFC } from '../lib/foodcost'
import { todayLocal } from '../lib/dateLocal'
import {
  loadClientiB2B, salvaClienteB2B, eliminaClienteB2B,
  loadVenditeB2B, salvaVenditaB2B, setStatoVenditaB2B, eliminaVenditaB2B,
  setPagamentoVenditaB2B,
} from '../lib/venditeB2B'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmModal'
import { C, PageHeader, KPI, fmt, fmt0, TNUM } from './_shared'

// Stati vendita: label + chip color. "consegnata" è il default operativo (consegnata, da fatturare).
const STATI = {
  bozza:       { lbl: 'Bozza',         bg: '#F1F5F9',     fg: '#475569' },
  consegnata:  { lbl: 'Da fatturare',  bg: C.amberLight,  fg: C.amber   },
  fatturata:   { lbl: 'Fatturata',     bg: C.greenLight,  fg: C.green   },
  annullata:   { lbl: 'Annullata',     bg: '#FEE2E2',     fg: C.red     },
}

// Helpers locali: formattazione data breve IT e pluralizzazione vendite.
const fmtData = (d) => {
  if (!d) return '-'
  try { return new Date(d + 'T12:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}
const plural = (n, s, p) => `${n.toLocaleString('it-IT')} ${n === 1 ? s : p}`

export default function VenditeB2BView({ orgId, sedeId, ricettario, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const confirmDialog = useConfirm()

  const [tab, setTab] = useState('vendite')
  const [clienti, setClienti] = useState([])
  const [vendite, setVendite] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // form nuova vendita / cliente
  const [vForm, setVForm] = useState(null)
  const [cForm, setCForm] = useState(null)
  // avvisi scorte insufficienti (banner persistente, non toast)
  const [stockWarn, setStockWarn] = useState([])

  // filtri pill (tab "vendite")
  const [fPeriodo, setFPeriodo] = useState('all')      // all | mese | trim
  const [fCliente, setFCliente] = useState('all')      // all | <cliente_id>
  const [fPagamento, setFPagamento] = useState('all')  // all | da_incassare | da_fatturare | fatturate

  useEffect(() => { if (orgId) ricarica() }, [orgId])
  async function ricarica() {
    setLoading(true)
    try {
      const [c, v] = await Promise.all([loadClientiB2B(orgId), loadVenditeB2B(orgId)])
      setClienti(c); setVendite(v)
    } catch (e) { notify?.('Errore caricamento: ' + e.message, false) }
    setLoading(false)
  }

  const nomiProdotti = useMemo(() => Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato')
    .map(r => r.nome).sort(), [ricettario])

  const mese = new Date().toISOString().slice(0, 7)
  const ricavoMese = vendite.filter(v => (v.data || '').startsWith(mese)).reduce((s, v) => s + Number(v.totale || 0), 0)
  const daFatturare = vendite.filter(v => v.stato === 'consegnata')
  const totDaFatturare = daFatturare.reduce((s, v) => s + Number(v.totale || 0), 0)

  // Food cost per pezzo di ogni prodotto (dal ricettario) → margine per vendita.
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const fcUnit = useMemo(() => {
    const m = {}
    for (const r of Object.values(ricettario?.ricette || {})) {
      const reg = getR(r.nome, r)
      const { tot } = calcolaFC(r, ingCosti, ricettario)
      m[(r.nome || '').toUpperCase().trim()] = reg.unita > 0 ? tot / reg.unita : 0
    }
    return m
  }, [ricettario, ingCosti])
  const fcVendita = (v) => (v.righe || []).reduce((s, r) => s + (fcUnit[(r.prodotto || '').toUpperCase().trim()] || 0) * (Number(r.qta) || 0), 0)

  // Vendite arricchite con margine + stato pagamento
  const venditeExt = useMemo(() => vendite.map(v => {
    const foodcost = fcVendita(v)
    const tot = Number(v.totale || 0)
    return { ...v, foodcost, margine: tot - foodcost, margPct: tot > 0 ? (tot - foodcost) / tot * 100 : 0, nonPagata: v.stato !== 'annullata' && !v.pagata }
  }), [vendite, fcUnit])

  // Vendite filtrate per la tab "vendite"
  const venditeFiltered = useMemo(() => {
    const oggi = new Date(todayLocal())
    return venditeExt.filter(v => {
      if (fPeriodo === 'mese' && !(v.data || '').startsWith(mese)) return false
      if (fPeriodo === 'trim') {
        const d = new Date((v.data || '') + 'T12:00')
        if (isNaN(d) || (oggi - d) / 86400000 > 90) return false
      }
      if (fCliente !== 'all' && v.cliente_id !== fCliente) return false
      if (fPagamento === 'da_incassare' && !v.nonPagata) return false
      if (fPagamento === 'da_fatturare' && v.stato !== 'consegnata') return false
      if (fPagamento === 'fatturate'    && v.stato !== 'fatturata')   return false
      return true
    })
  }, [venditeExt, fPeriodo, fCliente, fPagamento, mese])

  // Rollup per cliente
  const rollupClienti = useMemo(() => {
    const oggi = todayLocal()
    const m = {}
    for (const v of venditeExt) {
      if (v.stato === 'annullata') continue
      const k = v.cliente_id || v.clienti_b2b?.nome || 'sconosciuto'
      if (!m[k]) m[k] = { nome: v.clienti_b2b?.nome || clienti.find(c => c.id === v.cliente_id)?.nome || 'Cliente', n: 0, fatturato: 0, margine: 0, insoluto: 0, ultimo: '' }
      const g = m[k]
      g.n++; g.fatturato += Number(v.totale || 0); g.margine += v.margine
      if (v.nonPagata) g.insoluto += Number(v.totale || 0)
      if (!g.ultimo || (v.data || '') > g.ultimo) g.ultimo = v.data || ''
    }
    return Object.values(m).map(g => ({
      ...g, margPct: g.fatturato > 0 ? g.margine / g.fatturato * 100 : 0,
      giorniDaUltimo: g.ultimo ? Math.round((new Date(oggi) - new Date(g.ultimo)) / 86400000) : null,
    })).sort((a, b) => b.fatturato - a.fatturato)
  }, [venditeExt, clienti])

  // Ranking prodotti B2B
  const rankProdotti = useMemo(() => {
    const m = {}
    for (const v of venditeExt) {
      if (v.stato === 'annullata') continue
      for (const r of (v.righe || [])) {
        const k = (r.prodotto || '').toUpperCase().trim(); if (!k) continue
        if (!m[k]) m[k] = { nome: r.prodotto, qta: 0, ricavo: 0 }
        m[k].qta += Number(r.qta) || 0
        m[k].ricavo += (Number(r.qta) || 0) * (Number(r.prezzo) || 0)
      }
    }
    return Object.values(m).sort((a, b) => b.ricavo - a.ricavo)
  }, [venditeExt])

  // KPI estesi
  const margineMese  = venditeExt.filter(v => (v.data || '').startsWith(mese)).reduce((s, v) => s + v.margine, 0)
  const totInsoluto  = venditeExt.filter(v => v.nonPagata).reduce((s, v) => s + Number(v.totale || 0), 0)
  const nInsoluti    = venditeExt.filter(v => v.nonPagata).length
  const margPctMese  = ricavoMese > 0 ? margineMese / ricavoMese * 100 : 0

  if (!orgId) return <div style={{ padding: 24, color: C.textSoft, fontSize: 13 }}>Caricamento…</div>

  // ── handlers vendita ──
  const apriVendita = () => setVForm({ id: null, cliente_id: '', data: todayLocal(), note: '', righe: [{ prodotto: '', qta: '', prezzo: '' }] })
  const modificaVendita = (v) => setVForm({
    id: v.id, cliente_id: v.cliente_id || '', data: v.data, note: v.note || '',
    righe: (v.righe || []).map(r => ({ prodotto: r.prodotto, qta: String(r.qta ?? ''), prezzo: String(r.prezzo ?? '') })),
  })
  const salvaV = async () => {
    if (saving) return
    setSaving(true)
    try {
      const cliente = clienti.find(c => c.id === vForm.cliente_id)
      const res = await salvaVenditaB2B({ orgId, sedeId, clienteId: vForm.cliente_id || null, clienteNome: cliente?.nome, data: vForm.data, righe: vForm.righe, note: vForm.note, id: vForm.id || null })
      notify?.(`Vendita B2B ${vForm.id ? 'aggiornata' : 'salvata'} · ${fmt(res.totale)}`)
      setStockWarn(res.warnings?.length ? res.warnings : [])
      setVForm(null); ricarica()
    } catch (e) { notify?.(e.message, false) }
    setSaving(false)
  }

  // ── handlers cliente ──
  const apriCliente = (c) => setCForm(c ? { ...c } : { nome: '', partita_iva: '', codice_destinatario: '', pec: '', indirizzo: '', cap: '', citta: '', provincia: '', referente: '', email: '', telefono: '', note: '' })
  const salvaC = async () => {
    if (saving) return
    setSaving(true)
    try { await salvaClienteB2B(orgId, cForm); notify?.('Cliente salvato'); setCForm(null); ricarica() }
    catch (e) { notify?.(e.message, false) }
    setSaving(false)
  }
  const toggleFattura = async (v) => {
    try { await setStatoVenditaB2B(v.id, v.stato === 'fatturata' ? 'consegnata' : 'fatturata'); ricarica() }
    catch (e) { notify?.(e.message, false) }
  }
  const togglePagata = async (v) => {
    try {
      const res = await setPagamentoVenditaB2B(v.id, !v.pagata, todayLocal())
      if (res?.degraded) { notify?.('Applica la migration pagamenti B2B per tracciare gli incassi.', false); return }
      notify?.(v.pagata ? 'Segnata come da incassare' : 'Incasso registrato')
      ricarica()
    } catch (e) { notify?.(e.message, false) }
  }

  // ── stili condivisi ──
  // Audit: input ≥16px su mobile per non scatenare zoom iOS, border-box + width 100%.
  const inp = {
    padding: isMobile ? '12px 12px' : '9px 11px',
    borderRadius: 8, border: `1px solid ${C.borderStr}`,
    fontSize: isMobile ? 16 : 13, color: C.text, background: C.white,
    fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
    minHeight: isMobile ? 44 : 'auto',
    outline: 'none',
  }
  // Label uniforme per i form.
  const lbl = {
    fontSize: 10, fontWeight: 700, color: C.textSoft,
    textTransform: 'uppercase', letterSpacing: '0.07em',
    display: 'block', marginBottom: 5,
  }
  // Touch target generico per icon/button (40 mobile, 44 tablet)
  const tt = isTablet ? 44 : isMobile ? 40 : 32
  const minTT = isMobile ? 44 : 36

  // Card surface usata per tabelle / liste / form panel
  const surface = {
    background: C.bgCard,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
    boxSizing: 'border-box',
  }

  // Pill segment per tab principale
  const tabBtn = (id, lbl, icon) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      style={{
        flex: isMobile ? 1 : '0 0 auto',
        padding: isMobile ? '10px 14px' : '8px 18px',
        minHeight: minTT,
        borderRadius: R.md, border: 'none', cursor: 'pointer',
        fontWeight: tab === id ? 700 : 500, fontSize: 13, letterSpacing: '-0.005em',
        background: tab === id ? T.bgCard : 'transparent',
        color: tab === id ? T.text : T.textSoft,
        boxShadow: tab === id ? S.sm : 'none',
        transition: 'background .15s, color .15s',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        whiteSpace: 'nowrap',
      }}>
      {icon}{lbl}
    </button>
  )

  // Pill di filtro (periodo/cliente/pagamento)
  const filterPill = (active, label, onClick, count) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: isMobile ? '8px 12px' : '6px 12px',
        minHeight: minTT,
        borderRadius: 999,
        border: `1px solid ${active ? C.red : C.border}`,
        background: active ? C.red : C.white,
        color: active ? C.white : C.textMid,
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        whiteSpace: 'nowrap',
        transition: 'background .15s, color .15s, border-color .15s',
      }}>
      {label}
      {typeof count === 'number' && (
        <span style={{
          background: active ? 'rgba(255,255,255,0.2)' : C.bgSubtle,
          color: active ? C.white : C.textSoft,
          padding: '1px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          ...TNUM,
        }}>{count.toLocaleString('it-IT')}</span>
      )}
    </button>
  )

  // Conteggi per le pill di pagamento
  const cntDaIncassare = venditeExt.filter(v => v.nonPagata).length
  const cntDaFatturare = venditeExt.filter(v => v.stato === 'consegnata').length
  const cntFatturate   = venditeExt.filter(v => v.stato === 'fatturata').length

  // Layout vendite riga (desktop)
  const VENDITA_COLS = isMobile ? '1fr' : isTablet ? 'minmax(0,1.6fr) 120px 110px 1fr' : 'minmax(0,2fr) 130px 120px 220px'

  return (
    <div style={{ maxWidth: 1180, width: '100%', boxSizing: 'border-box' }}>
      <PageHeader subtitle="Vendite all'ingrosso a clienti business (bar, ristoranti) - canale separato dal banco" />

      {/* ── KPI: griglia uniforme (2 col mobile/tablet, 4 col desktop) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)',
        gap: isMobile ? 10 : 16, marginBottom: 18,
      }}>
        <KPI
          icon={<Icon name="briefcase" size={18} />}
          label="Ricavo B2B (mese)"
          value={fmt0(ricavoMese)}
          color={C.green} highlight
          sub={ricavoMese > 0 ? 'incassato finora questo mese' : 'nessuna vendita questo mese'}
        />
        <KPI
          icon={<Icon name="trendUp" size={18} />}
          label="Margine (mese)"
          value={fmt0(margineMese)}
          sub={ricavoMese > 0 ? `${margPctMese.toFixed(1).replace('.', ',')}% sul ricavo` : 'in attesa di vendite'}
          color={C.green}
        />
        <KPI
          icon={<Icon name="receipt" size={18} />}
          label="Da fatturare"
          value={daFatturare.length.toLocaleString('it-IT')}
          sub={totDaFatturare > 0 ? `${fmt0(totDaFatturare)} in sospeso` : 'nessuna vendita aperta'}
          color={daFatturare.length ? C.amber : C.textSoft}
        />
        <KPI
          icon={<Icon name="card" size={18} />}
          label="Da incassare"
          value={fmt0(totInsoluto)}
          sub={nInsoluti > 0 ? plural(nInsoluti, 'vendita scoperta', 'vendite scoperte') : 'tutto incassato'}
          color={totInsoluto > 0 ? C.red : C.green}
        />
      </div>

      {/* ── Banner scorte insufficienti ── */}
      {stockWarn.length > 0 && (
        <div style={{
          background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16,
          display: 'flex', gap: 12, alignItems: 'flex-start',
          boxSizing: 'border-box',
        }}>
          <span style={{ color: '#C2410C', flexShrink: 0, marginTop: 1 }}><Icon name="warning" size={18} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#9A3412', marginBottom: 4 }}>Scorte insufficienti dopo l'ultima vendita</div>
            <div style={{ fontSize: 12, color: '#9A3412', lineHeight: 1.5 }}>
              La vendita è stata salvata, ma alcuni prodotti sono ora in negativo in magazzino:
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {stockWarn.map((w, i) => (
                  <span key={i} style={{ background: '#FFEDD5', color: '#9A3412', fontWeight: 700, fontSize: 11, padding: '3px 9px', borderRadius: 8 }}>{w}</span>
                ))}
              </div>
              <div style={{ marginTop: 6, color: '#B45309' }}>
                Registra un <b>carico merce</b> (Magazzino) o un <b>trasferimento</b> tra sedi per riallineare.
              </div>
            </div>
          </div>
          <button
            onClick={() => setStockWarn([])}
            aria-label="Chiudi avviso scorte"
            style={{
              flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#9A3412', padding: 4, borderRadius: 6,
              minWidth: tt, minHeight: tt,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {/* ── Tab segmented ── */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 18,
        background: T.bgSubtle, borderRadius: R.lg, padding: 3,
        width: isMobile ? '100%' : 'fit-content',
        border: `1px solid ${T.borderSoft}`, overflowX: 'auto',
        boxSizing: 'border-box',
      }}>
        {tabBtn('vendite', 'Vendite', <Icon name="money" size={14} />)}
        {tabBtn('analisi', 'Analisi', <Icon name="barChart" size={14} />)}
        {tabBtn('clienti', 'Clienti', <Icon name="building" size={14} />)}
      </div>

      {/* ─────────────────────────  ANALISI  ───────────────────────── */}
      {!loading && tab === 'analisi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Per cliente */}
          <div style={surface}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 700, color: C.text }}>
              Per cliente
            </div>
            {rollupClienti.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Nessuna vendita registrata.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: '#FAFAF8' }}>
                      {[
                        { lbl: 'Cliente', align: 'left',  sticky: true },
                        { lbl: 'Ordini', align: 'right' },
                        { lbl: 'Ultimo', align: 'right' },
                        { lbl: 'Fatturato', align: 'right' },
                        { lbl: 'Margine', align: 'right' },
                        { lbl: 'Da incassare', align: 'right' },
                      ].map((h) => (
                        <th key={h.lbl} style={{
                          padding: '10px 14px', textAlign: h.align,
                          fontSize: 10, fontWeight: 700, color: C.textSoft,
                          textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${C.border}`,
                          position: h.sticky ? 'sticky' : 'static',
                          left: h.sticky ? 0 : 'auto',
                          background: h.sticky ? '#FAFAF8' : 'transparent',
                          zIndex: h.sticky ? 1 : 'auto',
                        }}>{h.lbl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rollupClienti.map((g, i) => (
                      <tr key={i} style={{ borderTop: i ? `1px solid ${C.borderSoft}` : 'none' }}>
                        <td style={{
                          padding: '12px 14px', fontWeight: 700, color: C.text,
                          maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          position: 'sticky', left: 0, background: C.bgCard, zIndex: 1,
                        }} title={g.nome}>{g.nome}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: C.textMid, ...TNUM }}>{g.n.toLocaleString('it-IT')}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: g.giorniDaUltimo > 30 ? C.amber : C.textSoft, ...TNUM, whiteSpace: 'nowrap' }}>
                          {g.giorniDaUltimo != null ? `${g.giorniDaUltimo.toLocaleString('it-IT')}g fa` : '-'}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: C.text, ...TNUM, whiteSpace: 'nowrap' }}>{fmt(g.fatturato)}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: C.green, ...TNUM, whiteSpace: 'nowrap' }}>
                          {fmt(g.margine)} <span style={{ color: C.textSoft, fontSize: 10 }}>{g.margPct.toFixed(0)}%</span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: g.insoluto > 0 ? C.red : C.textSoft, ...TNUM, whiteSpace: 'nowrap' }}>
                          {g.insoluto > 0 ? fmt(g.insoluto) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Per prodotto */}
          <div style={surface}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 700, color: C.text }}>
              Prodotti più venduti all'ingrosso
            </div>
            {rankProdotti.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Nessun prodotto venduto.</div>
            ) : (
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 10 }}>
                {rankProdotti.slice(0, 12).map((p, i) => {
                  const max = rankProdotti[0].ricavo || 1
                  const widthPct = Math.min(100, p.ricavo / max * 100)
                  if (isMobile) {
                    return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                          <span title={p.nome} style={{
                            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontSize: 13, fontWeight: i === 0 ? 700 : 600, color: C.text,
                          }}>{p.nome}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, ...TNUM, whiteSpace: 'nowrap' }}>{fmt0(p.ricavo)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1, height: 8, background: T.bgSubtle, borderRadius: 5, overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${widthPct}%`, background: i === 0 ? C.green : 'rgba(31,122,72,0.5)' }} />
                          </span>
                          <span style={{ fontSize: 11, color: C.textSoft, ...TNUM, whiteSpace: 'nowrap' }}>
                            {p.qta.toLocaleString('it-IT')} pz
                          </span>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span title={p.nome} style={{
                        flex: '0 0 38%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontSize: 12.5, fontWeight: i === 0 ? 700 : 500, color: C.text,
                      }}>{p.nome}</span>
                      <span style={{ flex: 1, height: 16, background: T.bgSubtle, borderRadius: 5, overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${widthPct}%`, background: i === 0 ? C.green : 'rgba(31,122,72,0.5)' }} />
                      </span>
                      <span style={{ flex: '0 0 70px', textAlign: 'right', fontSize: 11.5, color: C.textSoft, ...TNUM, whiteSpace: 'nowrap' }}>
                        {p.qta.toLocaleString('it-IT')} pz
                      </span>
                      <span style={{ flex: '0 0 110px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: C.text, ...TNUM, whiteSpace: 'nowrap' }}>
                        {fmt(p.ricavo)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────  VENDITE  ───────────────────────── */}
      {loading ? (
        <div style={{ color: C.textSoft, fontSize: 13 }}>Caricamento…</div>
      ) : tab === 'vendite' ? (
        <>
          {/* Toolbar: nuova vendita + filtri pill */}
          {!vForm && (
            <div style={{
              display: 'flex', flexDirection: isMobile ? 'column' : 'row',
              gap: 12, marginBottom: 16, alignItems: isMobile ? 'stretch' : 'center', flexWrap: 'wrap',
            }}>
              <button onClick={apriVendita} style={{
                padding: '12px 20px', minHeight: 44,
                background: C.red, color: C.white, border: 'none',
                borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: isMobile ? '100%' : 'auto',
                boxShadow: '0 2px 8px rgba(110,14,26,0.18)',
              }}>
                <Icon name="plus" size={16} /> Nuova vendita B2B
              </button>

              {/* Filtri pill: periodo / cliente (select) / pagamento */}
              <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                marginLeft: isMobile ? 0 : 'auto',
                width: isMobile ? '100%' : 'auto',
              }}>
                {filterPill(fPeriodo === 'all',  'Sempre',     () => setFPeriodo('all'))}
                {filterPill(fPeriodo === 'mese', 'Questo mese',() => setFPeriodo('mese'))}
                {filterPill(fPeriodo === 'trim', 'Ultimi 90g', () => setFPeriodo('trim'))}

                {/* Separatore verticale solo desktop */}
                {!isMobile && <span style={{ width: 1, height: 22, background: C.border }} />}

                {filterPill(fPagamento === 'all',          'Tutte',         () => setFPagamento('all'))}
                {filterPill(fPagamento === 'da_incassare', 'Da incassare',  () => setFPagamento('da_incassare'), cntDaIncassare)}
                {filterPill(fPagamento === 'da_fatturare', 'Da fatturare',  () => setFPagamento('da_fatturare'), cntDaFatturare)}
                {filterPill(fPagamento === 'fatturate',    'Fatturate',     () => setFPagamento('fatturate'),    cntFatturate)}

                {/* Cliente filter */}
                {clienti.length > 0 && (
                  <select
                    value={fCliente}
                    onChange={e => setFCliente(e.target.value)}
                    aria-label="Filtra per cliente"
                    style={{
                      ...inp,
                      width: isMobile ? '100%' : 'auto',
                      minWidth: isMobile ? '100%' : 180,
                      padding: isMobile ? '10px 12px' : '8px 12px',
                      minHeight: minTT,
                      borderRadius: 999,
                      fontSize: isMobile ? 16 : 12,
                      fontWeight: 600,
                      color: fCliente === 'all' ? C.textMid : C.text,
                    }}>
                    <option value="all">Tutti i clienti</option>
                    {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Form nuova/modifica vendita */}
          {vForm && (
            <div style={{
              background: T.brandLight, border: `1px solid ${C.red}30`, borderRadius: 16,
              padding: isMobile ? '16px 14px' : '20px 22px', marginBottom: 18,
              boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
              boxSizing: 'border-box',
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                {vForm.id ? <><Icon name="edit" size={15} /> Modifica vendita</> : <><Icon name="plus" size={15} /> Nuova vendita B2B</>}
              </div>

              {/* Cliente + data: colonna su mobile */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 200px', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={lbl} htmlFor="b2b-cliente">Cliente</label>
                  <select id="b2b-cliente" value={vForm.cliente_id} onChange={e => setVForm(f => ({ ...f, cliente_id: e.target.value }))} style={inp}>
                    <option value="">Seleziona cliente…</option>
                    {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl} htmlFor="b2b-data">Data consegna</label>
                  <input id="b2b-data" type="date" value={vForm.data} onChange={e => setVForm(f => ({ ...f, data: e.target.value }))} style={inp} />
                </div>
              </div>

              <datalist id="b2b-prod-list">{nomiProdotti.map(n => <option key={n} value={n} />)}</datalist>

              {/* Righe: card stack su mobile, grid su desktop */}
              <label style={lbl}>Righe vendita</label>
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {vForm.righe.map((r, i) => {
                    const tot = (Number(String(r.qta).replace(',', '.')) || 0) * (Number(String(r.prezzo).replace(',', '.')) || 0)
                    const set = (k, val) => setVForm(f => ({ ...f, righe: f.righe.map((x, j) => j === i ? { ...x, [k]: val } : x) }))
                    return (
                      <div key={i} style={{
                        background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
                        padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
                        boxSizing: 'border-box',
                      }}>
                        <input
                          list="b2b-prod-list" value={r.prodotto}
                          placeholder="Prodotto (es. FOCACCIA)"
                          onChange={e => set('prodotto', e.target.value)}
                          style={{ ...inp, fontWeight: 600 }}
                          aria-label={`Prodotto riga ${i + 1}`}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ ...lbl, marginBottom: 3 }}>Quantità</label>
                            <input type="number" inputMode="decimal" value={r.qta} placeholder="0"
                              onChange={e => set('qta', e.target.value)} style={{ ...inp, textAlign: 'right' }}
                              aria-label={`Quantità riga ${i + 1}`} />
                          </div>
                          <div>
                            <label style={{ ...lbl, marginBottom: 3 }}>Prezzo cad.</label>
                            <input type="number" inputMode="decimal" value={r.prezzo} placeholder="0,00"
                              onChange={e => set('prezzo', e.target.value)} style={{ ...inp, textAlign: 'right' }}
                              aria-label={`Prezzo riga ${i + 1}`} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                          <span style={{ fontSize: 12, color: C.textSoft, fontWeight: 600 }}>Totale riga</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: C.text, ...TNUM }}>{fmt(tot)}</span>
                        </div>
                        <button
                          aria-label={`Rimuovi riga ${i + 1}`}
                          onClick={() => setVForm(f => ({ ...f, righe: f.righe.length > 1 ? f.righe.filter((_, j) => j !== i) : f.righe }))}
                          style={{
                            alignSelf: 'flex-end', minHeight: 40, padding: '8px 14px',
                            borderRadius: 8, border: `1px solid ${C.border}`,
                            background: C.white, color: C.red, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          }}>
                          Rimuovi
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 540 }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 80px 100px 90px 36px',
                      gap: 8, fontSize: 10, fontWeight: 700, color: C.textSoft,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      padding: '0 6px', marginBottom: 6,
                    }}>
                      <span>Prodotto</span>
                      <span style={{ textAlign: 'right' }}>Qtà</span>
                      <span style={{ textAlign: 'right' }}>Prezzo cad.</span>
                      <span style={{ textAlign: 'right' }}>Totale</span>
                      <span />
                    </div>
                    {vForm.righe.map((r, i) => {
                      const tot = (Number(String(r.qta).replace(',', '.')) || 0) * (Number(String(r.prezzo).replace(',', '.')) || 0)
                      const set = (k, val) => setVForm(f => ({ ...f, righe: f.righe.map((x, j) => j === i ? { ...x, [k]: val } : x) }))
                      return (
                        <div key={i} style={{
                          display: 'grid', gridTemplateColumns: '1fr 80px 100px 90px 36px',
                          gap: 8, alignItems: 'center', marginBottom: 8,
                        }}>
                          <input list="b2b-prod-list" value={r.prodotto} placeholder="es. FOCACCIA"
                            onChange={e => set('prodotto', e.target.value)} style={{ ...inp, fontWeight: 600 }}
                            aria-label={`Prodotto riga ${i + 1}`} />
                          <input type="number" inputMode="decimal" value={r.qta} placeholder="0"
                            onChange={e => set('qta', e.target.value)} style={{ ...inp, textAlign: 'right' }}
                            aria-label={`Quantità riga ${i + 1}`} />
                          <input type="number" inputMode="decimal" value={r.prezzo} placeholder="0,00"
                            onChange={e => set('prezzo', e.target.value)} style={{ ...inp, textAlign: 'right' }}
                            aria-label={`Prezzo riga ${i + 1}`} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, textAlign: 'right', ...TNUM, whiteSpace: 'nowrap' }}>{fmt(tot)}</span>
                          <button
                            aria-label={`Rimuovi riga ${i + 1}`}
                            onClick={() => setVForm(f => ({ ...f, righe: f.righe.length > 1 ? f.righe.filter((_, j) => j !== i) : f.righe }))}
                            style={{
                              width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`,
                              background: C.white, color: C.red, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                            <Icon name="x" size={14} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Aggiungi riga + note + azioni */}
              <button
                onClick={() => setVForm(f => ({ ...f, righe: [...f.righe, { prodotto: '', qta: '', prezzo: '' }] }))}
                style={{
                  marginTop: 10, padding: '10px 14px', minHeight: 44,
                  background: C.white, border: `1px dashed ${C.borderStr}`, borderRadius: 10,
                  fontSize: 13, fontWeight: 700, color: C.textMid, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  width: isMobile ? '100%' : 'auto', justifyContent: 'center',
                }}>
                <Icon name="plus" size={14} /> Aggiungi riga
              </button>

              <div style={{ marginTop: 14 }}>
                <label style={lbl} htmlFor="b2b-note">Note (opzionale)</label>
                <input
                  id="b2b-note" value={vForm.note}
                  onChange={e => setVForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Es. consegnare entro le 9:00, scaricare al retro"
                  style={inp}
                />
              </div>

              <div style={{
                display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                gap: 8, marginTop: 16,
                justifyContent: isMobile ? 'stretch' : 'flex-end',
              }}>
                <button onClick={() => setVForm(null)} style={{
                  flex: isMobile ? 1 : 'unset',
                  padding: '12px 18px', minHeight: 44,
                  background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.textSoft, cursor: 'pointer',
                }}>
                  Annulla
                </button>
                <button onClick={salvaV} disabled={saving} style={{
                  flex: isMobile ? 1 : 'unset',
                  padding: '12px 20px', minHeight: 44,
                  background: C.green, color: C.white, border: 'none',
                  borderRadius: 10, fontWeight: 800, fontSize: 14,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <Icon name="save" size={15} /> {saving ? 'Salvataggio…' : 'Salva vendita'}
                </button>
              </div>

              {sedeId ? (
                <div style={{ fontSize: 11, color: C.textSoft, marginTop: 10 }}>
                  Lo stock dei prodotti finiti verrà scaricato dalla sede attiva.
                </div>
              ) : (
                <div style={{ fontSize: 11, color: C.amber, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="warning" size={13} /> Nessuna sede attiva: la vendita viene registrata ma lo stock non sarà scaricato.
                </div>
              )}
            </div>
          )}

          {/* Lista vendite */}
          {vendite.length === 0 ? (
            <div style={{ ...surface, padding: '48px 24px', textAlign: 'center', color: C.textSoft, fontSize: 13 }}>
              <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}><Icon name="briefcase" size={32} color={C.textSoft} /></div>
              Nessuna vendita B2B registrata.
            </div>
          ) : venditeFiltered.length === 0 ? (
            <div style={{ ...surface, padding: '40px 24px', textAlign: 'center', color: C.textSoft, fontSize: 13 }}>
              Nessuna vendita corrisponde ai filtri selezionati.
              <div style={{ marginTop: 12 }}>
                <button onClick={() => { setFPeriodo('all'); setFCliente('all'); setFPagamento('all') }} style={{
                  padding: '8px 14px', minHeight: 40,
                  background: C.white, border: `1px solid ${C.border}`, borderRadius: 999,
                  fontSize: 12, fontWeight: 700, color: C.textMid, cursor: 'pointer',
                }}>
                  Azzera filtri
                </button>
              </div>
            </div>
          ) : (
            <div style={surface}>
              {/* Header desktop */}
              {!isMobile && (
                <div style={{
                  display: 'grid', gridTemplateColumns: VENDITA_COLS,
                  alignItems: 'center', gap: 12,
                  padding: '12px 18px', background: '#F8F4F2', borderBottom: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft }}>Cliente</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, textAlign: 'center' }}>Stato</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, textAlign: 'right' }}>Totale</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, textAlign: 'right' }}>Azioni</span>
                </div>
              )}

              {venditeFiltered.map((v, i) => {
                const st = STATI[v.stato] || STATI.consegnata
                const last = i === venditeFiltered.length - 1
                const btnAct = {
                  padding: isMobile ? '10px 12px' : '7px 12px',
                  borderRadius: 8, border: `1px solid ${C.border}`,
                  background: C.white, fontSize: isMobile ? 12 : 11.5,
                  fontWeight: 700, color: C.textMid, cursor: 'pointer',
                  minHeight: minTT, whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }

                if (isMobile) {
                  // Card mobile: header (cliente + totale), meta, chip stato/pagamento, azioni full width
                  return (
                    <div key={v.id} style={{
                      padding: '14px 14px',
                      borderBottom: last ? 'none' : `1px solid ${C.border}`,
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div title={v.clienti_b2b?.nome || 'Cliente eliminato'} style={{
                            fontSize: 15, fontWeight: 700, color: C.text,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{v.clienti_b2b?.nome || 'Cliente eliminato'}</div>
                          <div style={{ fontSize: 11.5, color: C.textSoft, marginTop: 3, lineHeight: 1.5 }}>
                            {fmtData(v.data)} · {plural((v.righe || []).length, 'prodotto', 'prodotti')} · {(v.righe || []).reduce((s, r) => s + (Number(r.qta) || 0), 0).toLocaleString('it-IT')} pz
                          </div>
                          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>
                            Margine <span style={{ fontWeight: 700, color: C.green, ...TNUM }}>{fmt(v.margine)}</span>
                            {v.margPct > 0 && <span style={{ color: C.textSoft, marginLeft: 4 }}>({v.margPct.toFixed(0)}%)</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, ...TNUM, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {fmt0(v.totale)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                          background: st.bg, color: st.fg, whiteSpace: 'nowrap',
                        }}>{st.lbl}</span>
                        {v.stato !== 'annullata' && (
                          <button
                            onClick={() => togglePagata(v)}
                            aria-label={v.pagata ? 'Segna come da incassare' : 'Segna come incassata'}
                            style={{
                              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                              background: v.pagata ? C.greenLight : '#FEE2E2',
                              color: v.pagata ? C.green : C.red,
                              minHeight: 28,
                            }}>
                            {v.pagata ? 'Incassato' : 'Da incassare'}
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {v.stato !== 'annullata' && (
                          <button onClick={() => modificaVendita(v)} aria-label="Modifica vendita" style={{ ...btnAct, flex: 1 }}>
                            <Icon name="edit" size={13} /> Modifica
                          </button>
                        )}
                        <button onClick={() => toggleFattura(v)} aria-label={v.stato === 'fatturata' ? 'Segna da fatturare' : 'Segna fatturata'} style={{ ...btnAct, flex: 1 }}>
                          {v.stato === 'fatturata' ? 'Riapri' : 'Fattura'}
                        </button>
                        <button
                          aria-label="Elimina vendita"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: 'Eliminare vendita B2B?',
                              message: 'Lo stock dei prodotti verrà ripristinato.',
                              confirmLabel: 'Elimina', cancelLabel: 'Annulla', destructive: true,
                            })
                            if (!ok) return
                            try { await eliminaVenditaB2B(v.id); ricarica() } catch (e) { notify?.(e.message, false) }
                          }}
                          style={{ ...btnAct, color: C.red, flex: '0 0 auto', minWidth: minTT }}>
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </div>
                  )
                }

                // Desktop / tablet row
                return (
                  <div key={v.id} style={{
                    display: 'grid', gridTemplateColumns: VENDITA_COLS,
                    alignItems: 'center', gap: 12,
                    padding: '14px 18px',
                    borderBottom: last ? 'none' : `1px solid ${C.border}`,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div title={v.clienti_b2b?.nome || 'Cliente eliminato'} style={{
                        fontSize: 14, fontWeight: 700, color: C.text,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{v.clienti_b2b?.nome || 'Cliente eliminato'}</div>
                      <div style={{ fontSize: 11.5, color: C.textSoft, marginTop: 3 }}>
                        {fmtData(v.data)} · {plural((v.righe || []).length, 'prodotto', 'prodotti')} · {(v.righe || []).reduce((s, r) => s + (Number(r.qta) || 0), 0).toLocaleString('it-IT')} pz
                        <span style={{ color: C.textSoft }}> · margine </span>
                        <span style={{ fontWeight: 700, color: C.green, ...TNUM }}>{fmt(v.margine)}</span>
                      </div>
                    </div>

                    <div style={{ justifySelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                        background: st.bg, color: st.fg, whiteSpace: 'nowrap',
                      }}>{st.lbl}</span>
                      {v.stato !== 'annullata' && (
                        <button
                          onClick={() => togglePagata(v)}
                          aria-label={v.pagata ? 'Segna come da incassare' : 'Segna come incassata'}
                          title={v.pagata ? 'Segna da incassare' : 'Segna incassata'}
                          style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: v.pagata ? C.greenLight : '#FEE2E2',
                            color: v.pagata ? C.green : C.red,
                          }}>
                          {v.pagata ? 'incassato' : 'da incassare'}
                        </button>
                      )}
                    </div>

                    <span style={{ fontSize: 15, fontWeight: 800, color: C.text, ...TNUM, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {fmt(v.totale)}
                    </span>

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {v.stato !== 'annullata' && (
                        <button onClick={() => modificaVendita(v)} aria-label="Modifica vendita" title="Modifica vendita" style={btnAct}>
                          Modifica
                        </button>
                      )}
                      <button
                        onClick={() => toggleFattura(v)}
                        aria-label={v.stato === 'fatturata' ? 'Segna da fatturare' : 'Segna fatturata'}
                        title={v.stato === 'fatturata' ? 'Segna da fatturare' : 'Segna fatturata'}
                        style={btnAct}>
                        {v.stato === 'fatturata' ? 'Riapri' : 'Fattura'}
                      </button>
                      <button
                        aria-label="Elimina vendita"
                        title="Elimina vendita"
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: 'Eliminare vendita B2B?',
                            message: 'Lo stock dei prodotti verrà ripristinato.',
                            confirmLabel: 'Elimina', cancelLabel: 'Annulla', destructive: true,
                          })
                          if (!ok) return
                          try { await eliminaVenditaB2B(v.id); ricarica() } catch (e) { notify?.(e.message, false) }
                        }}
                        style={{ ...btnAct, color: C.red, minWidth: minTT, padding: '7px 10px' }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : tab === 'clienti' ? (
        /* ─────────────────────────  CLIENTI  ───────────────────────── */
        <>
          {!cForm && (
            <button onClick={() => apriCliente(null)} style={{
              padding: '12px 20px', minHeight: 44,
              background: C.red, color: C.white, border: 'none',
              borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer',
              marginBottom: 16, width: isMobile ? '100%' : 'auto',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 2px 8px rgba(110,14,26,0.18)',
            }}>
              <Icon name="plus" size={16} /> Nuovo cliente
            </button>
          )}

          {cForm && (
            <div style={{
              background: T.brandLight, border: `1px solid ${C.red}30`, borderRadius: 16,
              padding: isMobile ? '16px 14px' : '20px 22px', marginBottom: 18,
              boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
              boxSizing: 'border-box',
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                {cForm.id ? <><Icon name="edit" size={15} /> Modifica cliente</> : <><Icon name="plus" size={15} /> Nuovo cliente B2B</>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                {[
                  ['nome', 'Nome / Ragione sociale *'],
                  ['partita_iva', 'Partita IVA'],
                  ['codice_destinatario', 'Codice destinatario SDI'],
                  ['pec', 'PEC'],
                  ['indirizzo', 'Indirizzo'],
                  ['citta', 'Città'],
                  ['cap', 'CAP'],
                  ['provincia', 'Provincia'],
                  ['referente', 'Referente'],
                  ['telefono', 'Telefono'],
                  ['email', 'Email'],
                ].map(([k, label]) => (
                  <div key={k}>
                    <label style={lbl} htmlFor={`b2b-cli-${k}`}>{label}</label>
                    <input
                      id={`b2b-cli-${k}`}
                      value={cForm[k] || ''}
                      onChange={e => setCForm(f => ({ ...f, [k]: e.target.value }))}
                      style={inp}
                      inputMode={k === 'telefono' ? 'tel' : k === 'email' ? 'email' : 'text'}
                      autoCapitalize={k === 'email' || k === 'pec' ? 'none' : 'sentences'}
                    />
                  </div>
                ))}
              </div>

              <div style={{
                display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                gap: 8, marginTop: 16,
                justifyContent: isMobile ? 'stretch' : 'flex-end',
              }}>
                <button onClick={() => setCForm(null)} style={{
                  flex: isMobile ? 1 : 'unset',
                  padding: '12px 18px', minHeight: 44,
                  background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.textSoft, cursor: 'pointer',
                }}>
                  Annulla
                </button>
                <button onClick={salvaC} disabled={saving} style={{
                  flex: isMobile ? 1 : 'unset',
                  padding: '12px 20px', minHeight: 44,
                  background: C.green, color: C.white, border: 'none',
                  borderRadius: 10, fontWeight: 800, fontSize: 14,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <Icon name="save" size={15} /> {saving ? 'Salvataggio…' : 'Salva cliente'}
                </button>
              </div>
            </div>
          )}

          {clienti.length === 0 ? (
            <div style={{ ...surface, padding: '48px 24px', textAlign: 'center', color: C.textSoft, fontSize: 13 }}>
              <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}><Icon name="building" size={32} color={C.textSoft} /></div>
              Nessun cliente B2B. Aggiungi i bar/ristoranti a cui vendi all'ingrosso.
            </div>
          ) : (
            <div style={surface}>
              {clienti.map((c, i) => {
                const meta = [c.partita_iva && `P.IVA ${c.partita_iva}`, c.citta, c.telefono].filter(Boolean).join(' · ') || '-'
                const last = i === clienti.length - 1
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center',
                    gap: isMobile ? 8 : 12,
                    padding: '14px 16px',
                    borderBottom: last ? 'none' : `1px solid ${C.border}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div title={c.nome} style={{
                        fontSize: 14, fontWeight: 700, color: C.text,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{c.nome}</div>
                      <div title={meta} style={{
                        fontSize: 11.5, color: C.textSoft, marginTop: 3,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{meta}</div>
                    </div>
                    <button
                      onClick={() => apriCliente(c)}
                      aria-label={`Modifica cliente ${c.nome}`}
                      style={{
                        padding: isMobile ? '9px 14px' : '7px 14px',
                        borderRadius: 8, border: `1px solid ${C.border}`,
                        background: C.white, fontSize: isMobile ? 12 : 12,
                        fontWeight: 700, color: C.textMid, cursor: 'pointer',
                        minHeight: minTT, whiteSpace: 'nowrap',
                      }}>
                      Modifica
                    </button>
                    <button
                      aria-label={`Elimina cliente ${c.nome}`}
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: `Eliminare cliente "${c.nome}"?`,
                          message: 'Le vendite storiche di questo cliente non saranno cancellate, ma il riferimento sarà perso.',
                          confirmLabel: 'Elimina', cancelLabel: 'Annulla', destructive: true,
                        })
                        if (!ok) return
                        try { await eliminaClienteB2B(c.id); ricarica() } catch (e) { notify?.(e.message, false) }
                      }}
                      style={{
                        padding: isMobile ? '9px 12px' : '7px 10px',
                        borderRadius: 8, border: `1px solid ${C.border}`,
                        background: C.white, fontSize: 14, color: C.red, cursor: 'pointer',
                        minHeight: minTT, minWidth: minTT,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
