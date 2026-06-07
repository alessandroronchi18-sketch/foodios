// SpreciOmaggi — pagina OPERATIVA di registrazione e diagnosi di sprechi e omaggi.
//
// Metodo Food Cost: DIAGNOSI (banda KPI del periodo) → CAPISCI (classifica dei
// prodotti piu' sprecati) → AGISCI (form di inserimento + lista registrazioni).
// POV proprietario: ogni euro perso o regalato e' margine che esce dalla cassa.
//
// Sia il titolare sia il dipendente possono registrare. La RLS sul DB consente
// la scrittura della chiave operativa pasticceria-movimenti-speciali-v1.
// Tutti gli eventi finiscono anche nel registro attivita' (audit_log) via trigger.
//
// IMPORTANTE: handler salvataggio invariati (SAVE-FIRST via aggiungiMovimento/
// eliminaMovimento che fanno `await ssave` prima di restituire). Formato dati e
// firma export immutati.

import React, { useEffect, useMemo, useState } from 'react'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from './Icon'
import { KPI, SH, PageHeader } from '../views/_shared'
import { buildIngCosti, calcolaFC, getR, isRicettaValida } from '../lib/foodcost'
import { todayLocal } from '../lib/dateLocal'
import {
  CAUSALI_SPRECO, CAUSALI_OMAGGIO,
  nuovoMovimento, caricaMovimenti, aggiungiMovimento, eliminaMovimento,
  filtraPerIntervallo,
} from '../lib/movimentiSpeciali'

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'
const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

const C = {
  bg: T.bg, bgCard: T.bgCard, bgSubtle: T.bgSubtle, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.bgCard,
  border: T.border, borderStr: T.borderStr, borderSoft: T.borderSoft,
}
// Azzurro coerente per "omaggio" (era hardcoded nella vecchia versione).
const BLU = '#0369A1'
const BLU_LIGHT = '#E0F2FE'

const inputS = { width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.borderStr}`, fontSize: 14, color: C.text, boxSizing: 'border-box', fontFamily: 'inherit', background: C.white }
const labelS = { fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, display: 'block' }

const fmt = n => `€ ${(Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmt0 = n => { const v = Number(n); return `€ ${Math.round(Number.isFinite(v) ? v : 0).toLocaleString('it-IT')}` }
const fmtQta = (q, u) => `${(Number(q) || 0).toLocaleString('it-IT')} ${u || ''}`.trim()
const fmtN = n => (Number(n) || 0).toLocaleString('it-IT')
const fmtTs = iso => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function cardStyle() { return { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: SHADOW_PREMIUM } }

export default function SpreciOmaggi({ orgId, sedeId, sedeAttiva, ricettario, auth, notify }) {
  const isMobile = useIsMobile()
  const isDip = auth?.isDipendente
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])

  const [movs, setMovs] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('tutti')
  const today = todayLocal()
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const [dataDa, setDataDa] = useState(sevenAgo)
  const [dataA, setDataA] = useState(today)

  // Suggerimenti per il campo "Cosa" (ricette valide vendibili + categorie).
  const suggerimenti = useMemo(() => {
    const out = new Set()
    for (const r of Object.values(ricettario?.ricette || {})) {
      if (!isRicettaValida(r.nome)) continue
      const tipo = getR(r.nome, r).tipo
      if (tipo === 'semilavorato' || tipo === 'interno') continue
      out.add(r.nome)
      const cat = String(r.categoria || '').trim()
      if (cat) out.add(cat)
    }
    return [...out].sort()
  }, [ricettario])

  useEffect(() => {
    let alive = true
    if (!orgId || !sedeId) { setLoading(false); return }
    caricaMovimenti(orgId, sedeId).then(arr => { if (alive) { setMovs(arr); setLoading(false) } })
    return () => { alive = false }
  }, [orgId, sedeId])

  const lista = useMemo(() => {
    let arr = filtraPerIntervallo(movs, dataDa, dataA)
    if (filtroTipo !== 'tutti') arr = arr.filter(m => m.tipo === filtroTipo)
    return arr
  }, [movs, dataDa, dataA, filtroTipo])

  // ── DIAGNOSI: aggregati sul periodo selezionato (rispetta sempre l'intervallo) ──
  const periodo = useMemo(() => filtraPerIntervallo(movs, dataDa, dataA), [movs, dataDa, dataA])
  const diag = useMemo(() => {
    let valSpreco = 0, valOmaggio = 0, ricavoMancato = 0, nSpreco = 0, nOmaggio = 0
    const perProdotto = {}   // nome → { eur, qtaG, qtaPz, n }
    for (const m of periodo) {
      const nome = m.prodotto || m.categoria || '(senza nome)'
      const fc = Number(m.fcTot) || (Number(m.fcUnit) || 0) * (Number(m.qta) || 0)
      const qta = Number(m.qta) || 0
      if (m.tipo === 'spreco') {
        valSpreco += fc; nSpreco++
        if (!perProdotto[nome]) perProdotto[nome] = { nome, eur: 0, qtaG: 0, qtaPz: 0, n: 0 }
        perProdotto[nome].eur += fc
        if (m.unita === 'g') perProdotto[nome].qtaG += qta; else perProdotto[nome].qtaPz += qta
        perProdotto[nome].n++
      } else if (m.tipo === 'omaggio') {
        valOmaggio += fc; nOmaggio++
        ricavoMancato += (Number(m.valoreOmaggio) || 0)
      }
    }
    const classifica = Object.values(perProdotto)
      .filter(p => p.eur > 0)
      .sort((a, b) => b.eur - a.eur)
      .slice(0, 8)
    const maxEur = classifica.length ? classifica[0].eur : 0
    const piuSprecato = classifica[0] || null
    return {
      valSpreco, valOmaggio, ricavoMancato, nSpreco, nOmaggio,
      nTot: periodo.length, classifica, maxEur, piuSprecato,
    }
  }, [periodo])

  // Semaforo sul valore sprechi del periodo (food cost perso).
  // verde sotto 30€ · ambra fino a 100€ · rosso oltre (soglie indicative per la sede).
  const sprecoColor = diag.valSpreco <= 30 ? C.green : diag.valSpreco <= 100 ? C.amber : C.red
  const sprecoLabel = diag.valSpreco <= 30 ? 'Sotto controllo' : diag.valSpreco <= 100 ? 'Da tenere d’occhio' : 'Alto — indagare'

  // Quando l'utente digita "Cosa", se combacia con una ricetta nota proviamo a
  // suggerire un fcUnit calcolato dalla ricetta (per pezzo unita').
  const autoFcDaRicetta = (nome) => {
    const ric = ricettario?.ricette?.[(nome || '').toUpperCase().trim()] || ricettario?.ricette?.[nome]
    if (!ric) return null
    const reg = getR(ric.nome, ric)
    const { tot } = calcolaFC(ric, ingCosti, ricettario)
    if (!Number.isFinite(tot) || !reg?.unita) return null
    return { fcUnit: tot / reg.unita, unita: 'pz', categoria: ric.categoria || '' }
  }

  const apri = (tipo) => setForm(nuovoMovimento(tipo))

  const onProdottoChange = (nome) => {
    const auto = autoFcDaRicetta(nome)
    setForm(f => ({
      ...f,
      prodotto: nome,
      ...(auto ? { fcUnit: auto.fcUnit.toFixed(3), unita: auto.unita, categoria: auto.categoria } : {}),
    }))
  }

  // ── SALVATAGGIO — SAVE-FIRST: aggiungiMovimento fa `await ssave` prima di tornare,
  // solo dopo aggiorniamo lo state. Handler e formato dati INVARIATI. ──
  const salva = async () => {
    if (!form) return
    if (!form.prodotto.trim() && !form.categoria.trim()) {
      notify?.('Specifica almeno il prodotto o la categoria', false); return
    }
    if (!(Number(form.qta) > 0)) { notify?.('Quantita non valida', false); return }
    if (!sedeId) { notify?.('Seleziona una sede prima', false); return }
    const fcUnit = Number(form.fcUnit) || 0
    const qta = Number(form.qta) || 0
    const fcTot = fcUnit * qta
    const valoreOmaggio = form.tipo === 'omaggio' ? (Number(form.valoreOmaggio) || 0) * qta : 0
    try {
      const saved = await aggiungiMovimento(orgId, sedeId, {
        ...form,
        prodotto: form.prodotto.trim(),
        categoria: (form.categoria || '').trim(),
        qta, fcUnit, fcTot, valoreOmaggio,
      })
      setMovs(prev => [saved, ...prev])
      setForm(null)
      notify?.(`${form.tipo === 'spreco' ? 'Spreco' : 'Omaggio'} registrato`)
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    }
  }

  const elimina = async (mov) => {
    if (!confirm(`Eliminare ${mov.tipo === 'spreco' ? 'lo spreco' : "l'omaggio"} del ${fmtTs(mov.ts)}?`)) return
    try {
      const arr = await eliminaMovimento(orgId, sedeId, mov.id)
      setMovs(arr)
      notify?.('Eliminato')
    } catch (e) { notify?.(e.message, false) }
  }

  const tipoBadge = (t) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 11,
      background: t === 'spreco' ? C.amberLight : BLU_LIGHT,
      color: t === 'spreco' ? C.amber : BLU,
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      <Icon name={t === 'spreco' ? 'trash' : 'gift'} size={11} /> {t}
    </span>
  )

  const filtriPeriodo = (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <label style={labelS}>Da</label>
        <input style={{ ...inputS, width: 'auto' }} type="date" value={dataDa} onChange={e => setDataDa(e.target.value)} />
      </div>
      <div>
        <label style={labelS}>A</label>
        <input style={{ ...inputS, width: 'auto' }} type="date" value={dataA} onChange={e => setDataA(e.target.value)} />
      </div>
      <div>
        <label style={labelS}>Tipo</label>
        <select style={{ ...inputS, width: 'auto' }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="tutti">Tutti</option>
          <option value="spreco">Solo sprechi</option>
          <option value="omaggio">Solo omaggi</option>
        </select>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader
        subtitle={`Registra cio' che va perso (caduto, scaduto, errori) o che regali, cosi' non sembra un ammanco di cassa ma una scelta gestionale${sedeAttiva ? ` · sede ${sedeAttiva.nome}` : ''}.`}
      />

      {/* Filtri periodo — pilotano sia la diagnosi sia la lista */}
      <div style={{ ...cardStyle(), padding: isMobile ? '12px 14px' : '12px 18px', marginBottom: 16 }}>
        {filtriPeriodo}
      </div>

      {/* (1) DIAGNOSI — banda KPI del periodo */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: isMobile ? 10 : 16, marginBottom: 14 }}>
        <KPI icon={<Icon name="trash" size={18} />} label="Sprechi nel periodo" value={fmt0(diag.valSpreco)} color={sprecoColor}
          sub={`${sprecoLabel} · ${fmtN(diag.nSpreco)} reg.`} />
        <KPI icon={<Icon name="receipt" size={18} />} label="Registrazioni" value={fmtN(diag.nTot)} color={T.brand}
          sub={`${fmtN(diag.nSpreco)} sprechi · ${fmtN(diag.nOmaggio)} omaggi`} />
        <KPI icon={<Icon name="trendDown" size={18} />} label="Piu' sprecato" value={diag.piuSprecato ? diag.piuSprecato.nome : '—'} color={T.text}
          sub={diag.piuSprecato ? fmt(diag.piuSprecato.eur) : 'nessuno spreco'} />
        <KPI icon={<Icon name="gift" size={18} />} label="Omaggi nel periodo" value={fmt0(diag.valOmaggio)} color={BLU}
          sub={diag.ricavoMancato > 0 ? `${fmt0(diag.ricavoMancato)} ricavo mancato` : `${fmtN(diag.nOmaggio)} reg.`} />
      </div>

      {/* Azioni rapide — apertura form */}
      {!form && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => apri('spreco')}
            style={{ flex: 1, minWidth: 160, padding: '14px', background: C.amberLight, color: C.amber, border: `1px solid ${C.amber}40`, borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="trash" size={16} /> Registra spreco
          </button>
          <button onClick={() => apri('omaggio')}
            style={{ flex: 1, minWidth: 160, padding: '14px', background: BLU_LIGHT, color: BLU, border: `1px solid ${BLU}40`, borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="gift" size={16} /> Registra omaggio
          </button>
        </div>
      )}

      {/* Form di inserimento */}
      {form && (
        <div style={{ ...cardStyle(), padding: isMobile ? 16 : 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: form.tipo === 'spreco' ? C.amberLight : BLU_LIGHT, color: form.tipo === 'spreco' ? C.amber : BLU, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={form.tipo === 'spreco' ? 'trash' : 'gift'} size={16} />
            </span>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Nuova registrazione</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[['spreco', 'trash', 'Spreco'], ['omaggio', 'gift', 'Omaggio']].map(([k, ico, lbl]) => (
              <button key={k} onClick={() => setForm(f => ({ ...f, tipo: k, causale: k === 'spreco' ? CAUSALI_SPRECO[0] : CAUSALI_OMAGGIO[0] }))}
                style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none',
                  background: form.tipo === k ? (k === 'spreco' ? C.amber : BLU) : C.bgSubtle,
                  color: form.tipo === k ? '#fff' : C.textMid,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name={ico} size={15} /> {lbl}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
              <label style={labelS}>Cosa (prodotto o categoria)</label>
              <input style={inputS} list="prod-sugg-list" value={form.prodotto || ''}
                onChange={e => onProdottoChange(e.target.value)}
                placeholder="Es. Torta di carote, Gelato, Pistacchio…" />
              <datalist id="prod-sugg-list">
                {suggerimenti.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label style={labelS}>Quantità</label>
              <input style={inputS} type="number" min="0" step="0.01" value={form.qta || ''}
                onChange={e => setForm(f => ({ ...f, qta: e.target.value }))} placeholder="80" />
            </div>
            <div>
              <label style={labelS}>Unità</label>
              <select style={inputS} value={form.unita || 'g'} onChange={e => setForm(f => ({ ...f, unita: e.target.value }))}>
                <option value="g">grammi</option>
                <option value="pz">pezzi</option>
              </select>
            </div>
            <div>
              <label style={labelS}>Costo unitario (€/{form.unita || 'unità'})</label>
              <input style={inputS} type="number" min="0" step="0.001" value={form.fcUnit || ''}
                onChange={e => setForm(f => ({ ...f, fcUnit: e.target.value }))} placeholder="0.012" />
            </div>
            {form.tipo === 'omaggio' && (
              <div>
                <label style={labelS}>Prezzo unitario di vendita (€)</label>
                <input style={inputS} type="number" min="0" step="0.01" value={form.valoreOmaggio || ''}
                  onChange={e => setForm(f => ({ ...f, valoreOmaggio: e.target.value }))} placeholder="2.60" />
              </div>
            )}
            <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
              <label style={labelS}>Causale</label>
              <select style={inputS} value={form.causale} onChange={e => setForm(f => ({ ...f, causale: e.target.value }))}>
                {(form.tipo === 'spreco' ? CAUSALI_SPRECO : CAUSALI_OMAGGIO).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
              <label style={labelS}>Note (opzionale)</label>
              <input style={inputS} value={form.note || ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="dettagli aggiuntivi…" />
            </div>
          </div>

          <div style={{ marginTop: 14, padding: '11px 14px', background: C.bgSubtle, border: `1px dashed ${C.border}`, borderRadius: 10, fontSize: 12.5, color: C.textMid }}>
            Costo totale: <b style={{ color: C.text, ...TNUM }}>{fmt((Number(form.fcUnit) || 0) * (Number(form.qta) || 0))}</b>
            {form.tipo === 'omaggio' && Number(form.valoreOmaggio) > 0 && (
              <> · ricavo mancato: <b style={{ color: BLU, ...TNUM }}>{fmt((Number(form.valoreOmaggio) || 0) * (Number(form.qta) || 0))}</b></>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={salva}
              style={{ padding: '11px 22px', background: C.green, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon name="plus" size={15} /> Registra
            </button>
            <button onClick={() => setForm(null)}
              style={{ padding: '11px 22px', background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13.5, cursor: 'pointer' }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* (2) CLASSIFICA — prodotti piu' sprecati (capisci dove perdi) */}
      <SH sub="Dove perdi piu' valore nel periodo selezionato. Parti da qui: il primo prodotto e' quello su cui agire.">Prodotti piu' sprecati</SH>
      <div style={{ ...cardStyle(), padding: isMobile ? 14 : 18, marginBottom: 24 }}>
        {diag.classifica.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.textSoft, padding: '8px 0' }}>
            <Icon name="checkCircle" size={16} color={C.green} /> Nessuno spreco registrato nel periodo. Ottimo controllo.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {diag.classifica.map((p, i) => {
              const pct = diag.maxEur > 0 ? (p.eur / diag.maxEur * 100) : 0
              const qtaStr = [p.qtaG ? `${fmtN(p.qtaG)} g` : null, p.qtaPz ? `${fmtN(p.qtaPz)} pz` : null].filter(Boolean).join(' · ')
              return (
                <div key={p.nome} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
                  <span style={{ flex: isMobile ? '0 0 38%' : '0 0 30%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: i === 0 ? 700 : 500, color: C.text }} title={p.nome}>{p.nome}</span>
                  <span style={{ flex: 1, height: 18, background: C.bgSubtle, borderRadius: 6, overflow: 'hidden', minWidth: 40 }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.max(4, pct)}%`, background: i === 0 ? C.amber : 'rgba(217,119,6,0.45)', transition: 'width 0.3s' }} />
                  </span>
                  <span style={{ flex: '0 0 70px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: C.text, ...TNUM }}>{fmt(p.eur)}</span>
                  {!isMobile && <span style={{ flex: '0 0 96px', textAlign: 'right', fontSize: 11.5, color: C.textSoft, ...TNUM }}>{qtaStr || `${fmtN(p.n)} reg.`}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* (3) LISTA REGISTRAZIONI */}
      <SH sub="Tutte le registrazioni del periodo, dalla piu' recente.">Registrazioni</SH>
      <div style={{ ...cardStyle(), overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {['Quando', 'Tipo', 'Cosa', 'Qta', 'Causale', 'Costo', 'Autore', ''].map((h, i) => (
                  <th key={i} title={h === 'Qta' ? 'Quantità (grammi o pezzi)' : h === 'Costo' ? 'Costo food cost del prodotto perso/omaggiato' : undefined}
                    style={{ padding: '11px 14px', textAlign: (i === 3 || i === 5) ? 'right' : 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', ...((h === 'Qta' || h === 'Costo') ? { cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3 } : null) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: C.textSoft }}>Caricamento…</td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: C.textSoft }}>Nessun movimento nel periodo selezionato.</td></tr>
              ) : lista.map((m, i) => (
                <tr key={m.id} style={{ borderTop: i ? `1px solid ${C.borderSoft}` : 'none' }}>
                  <td style={{ padding: '11px 14px', color: C.textMid, whiteSpace: 'nowrap', ...TNUM }}>{fmtTs(m.ts)}</td>
                  <td style={{ padding: '11px 14px' }}>{tipoBadge(m.tipo)}</td>
                  <td style={{ padding: '11px 14px', color: C.text, fontWeight: 600 }}>
                    {m.prodotto || m.categoria || '—'}
                    {m.note && <span style={{ color: C.textSoft, fontWeight: 400 }}> — {m.note}</span>}
                  </td>
                  <td style={{ padding: '11px 14px', color: C.text, whiteSpace: 'nowrap', textAlign: 'right', ...TNUM }}>{fmtQta(m.qta, m.unita)}</td>
                  <td style={{ padding: '11px 14px', color: C.textMid }}>{m.causale || '—'}</td>
                  <td style={{ padding: '11px 14px', color: m.tipo === 'spreco' ? C.amber : BLU, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right', ...TNUM }}>
                    {fmt(m.fcTot)}
                    {m.tipo === 'omaggio' && Number(m.valoreOmaggio) > 0 && (
                      <span style={{ color: C.textSoft, fontWeight: 400, marginLeft: 6 }}>(− {fmt(m.valoreOmaggio)} ricavo)</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px', color: C.textSoft, fontSize: 11 }}>
                    {m.autore_email || '—'}
                    {m.autore_ruolo === 'dipendente' && <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: C.amberLight, color: C.amber, fontSize: 8, fontWeight: 700 }}>DIP</span>}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {(!isDip || m.autore_uid === auth?.user?.id) && (
                      <button onClick={() => elimina(m)} title="Elimina"
                        style={{ padding: '5px 8px', background: 'transparent', color: C.red, border: `1px solid ${C.redLight}`, borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="trash" size={12} /> Elimina
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
