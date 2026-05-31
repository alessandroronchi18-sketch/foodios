// SpreciOmaggi - registrazione e storico di sprechi e omaggi per la sede attiva.
//
// Sia il titolare sia il dipendente possono registrare. La RLS sul DB consente
// la scrittura della chiave operativa pasticceria-movimenti-speciali-v1.
// Tutti gli eventi finiscono anche nel registro attivita' (audit_log) via trigger.

import React, { useEffect, useMemo, useState } from 'react'
import { color as T } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR, isRicettaValida } from '../lib/foodcost'
import { todayLocal } from '../lib/dateLocal'
import {
  CAUSALI_SPRECO, CAUSALI_OMAGGIO,
  nuovoMovimento, caricaMovimenti, aggiungiMovimento, eliminaMovimento,
  filtraPerIntervallo,
} from '../lib/movimentiSpeciali'

const C = {
  bg: T.bg, bgCard: T.bgCard, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.white,
  border: T.border, borderStr: T.borderStr,
}
const inputS = { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 13, color: C.text, boxSizing: 'border-box', fontFamily: 'inherit', background: C.white }
const labelS = { fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' }
const fmt = n => `€ ${(Number.isFinite(Number(n)) ? Number(n) : 0).toFixed(2)}`
const fmtQta = (q, u) => `${(Number(q) || 0).toLocaleString('it-IT')} ${u || ''}`.trim()
const fmtTs = iso => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function SpreciOmaggi({ orgId, sedeId, sedeAttiva, ricettario, auth, notify }) {
  const isDip = auth?.isDipendente
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])

  const [movs, setMovs] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('tutti')
  const today = todayLocal()
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const [dataDa, setDataDa] = useState(sevenAgo)
  const [dataA,  setDataA]  = useState(today)

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

  const apri = (tipo) => {
    setForm(nuovoMovimento(tipo))
  }

  const onProdottoChange = (nome) => {
    const auto = autoFcDaRicetta(nome)
    setForm(f => ({
      ...f,
      prodotto: nome,
      ...(auto ? { fcUnit: auto.fcUnit.toFixed(3), unita: auto.unita, categoria: auto.categoria } : {}),
    }))
  }

  const salva = async () => {
    if (!form) return
    if (!form.prodotto.trim() && !form.categoria.trim()) {
      notify?.('⚠ Specifica almeno il prodotto o la categoria', false); return
    }
    if (!(Number(form.qta) > 0)) { notify?.('⚠ Quantita non valida', false); return }
    if (!sedeId) { notify?.('⚠ Seleziona una sede prima', false); return }
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
      notify?.(`✓ ${form.tipo === 'spreco' ? 'Spreco' : 'Omaggio'} registrato`)
    } catch (e) {
      notify?.('⚠ Errore: ' + e.message, false)
    }
  }

  const elimina = async (mov) => {
    if (!confirm(`Eliminare ${mov.tipo === 'spreco' ? 'lo spreco' : "l'omaggio"} del ${fmtTs(mov.ts)}?`)) return
    try {
      const arr = await eliminaMovimento(orgId, sedeId, mov.id)
      setMovs(arr)
      notify?.('✓ Eliminato')
    } catch (e) { notify?.('⚠ ' + e.message, false) }
  }

  const tipoBadge = (t) => (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
      background: t === 'spreco' ? C.amberLight : '#E0F2FE',
      color: t === 'spreco' ? C.amber : '#0369A1',
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>{t}</span>
  )

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', marginBottom: 14, fontSize: 12.5, color: C.textMid, lineHeight: 1.6 }}>
        <b style={{ color: C.text }}>Sprechi e omaggi</b> — registra qui i prodotti che vanno persi
        (caduti, scaduti, errori) o che regali a un cliente. Servono per non far sembrare ammanchi
        di cassa cio' che e' una scelta gestionale.
        {sedeAttiva && <> Sede attiva: <b>{sedeAttiva.nome}</b>.</>}
      </div>

      {!form && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button onClick={() => apri('spreco')}
            style={{ flex: 1, padding: '14px', background: C.amberLight, color: C.amber, border: `1px solid ${C.amber}40`, borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            🗑 Registra spreco
          </button>
          <button onClick={() => apri('omaggio')}
            style={{ flex: 1, padding: '14px', background: '#E0F2FE', color: '#0369A1', border: `1px solid #38BDF840`, borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            🎁 Registra omaggio
          </button>
        </div>
      )}

      {form && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {[['spreco', '🗑 Spreco'], ['omaggio', '🎁 Omaggio']].map(([k, lbl]) => (
              <button key={k} onClick={() => setForm(f => ({ ...f, tipo: k, causale: k === 'spreco' ? CAUSALI_SPRECO[0] : CAUSALI_OMAGGIO[0] }))}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                  background: form.tipo === k ? (k === 'spreco' ? C.amber : '#0369A1') : '#F4F4F5',
                  color: form.tipo === k ? '#fff' : C.textMid,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{lbl}</button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelS}>Cosa (prodotto o categoria)</label>
              <input style={inputS} list="prod-sugg-list" value={form.prodotto || ''}
                onChange={e => onProdottoChange(e.target.value)}
                placeholder="Es. Torta di carote, Gelato, Pistacchio…"/>
              <datalist id="prod-sugg-list">
                {suggerimenti.map(s => <option key={s} value={s}/>)}
              </datalist>
            </div>
            <div>
              <label style={labelS}>Quantità</label>
              <input style={inputS} type="number" min="0" step="0.01" value={form.qta || ''}
                onChange={e => setForm(f => ({ ...f, qta: e.target.value }))} placeholder="80"/>
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
                onChange={e => setForm(f => ({ ...f, fcUnit: e.target.value }))} placeholder="0.012"/>
            </div>
            {form.tipo === 'omaggio' && (
              <div>
                <label style={labelS}>Prezzo unitario di vendita (€)</label>
                <input style={inputS} type="number" min="0" step="0.01" value={form.valoreOmaggio || ''}
                  onChange={e => setForm(f => ({ ...f, valoreOmaggio: e.target.value }))} placeholder="2.60"/>
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelS}>Causale</label>
              <select style={inputS} value={form.causale} onChange={e => setForm(f => ({ ...f, causale: e.target.value }))}>
                {(form.tipo === 'spreco' ? CAUSALI_SPRECO : CAUSALI_OMAGGIO).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelS}>Note (opzionale)</label>
              <input style={inputS} value={form.note || ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="dettagli aggiuntivi…"/>
            </div>
          </div>

          <div style={{ marginTop: 12, padding: '10px 14px', background: C.bgCard, border: `1px dashed ${C.border}`, borderRadius: 9, fontSize: 12, color: C.textMid }}>
            Costo totale: <b>{fmt((Number(form.fcUnit) || 0) * (Number(form.qta) || 0))}</b>
            {form.tipo === 'omaggio' && Number(form.valoreOmaggio) > 0 && (
              <> · ricavo mancato: <b>{fmt((Number(form.valoreOmaggio) || 0) * (Number(form.qta) || 0))}</b></>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={salva}
              style={{ padding: '10px 20px', background: C.green, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Registra
            </button>
            <button onClick={() => setForm(null)}
              style={{ padding: '10px 20px', background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 13, cursor: 'pointer' }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelS}>Da</label>
          <input style={inputS} type="date" value={dataDa} onChange={e => setDataDa(e.target.value)}/>
        </div>
        <div>
          <label style={labelS}>A</label>
          <input style={inputS} type="date" value={dataA} onChange={e => setDataA(e.target.value)}/>
        </div>
        <div>
          <label style={labelS}>Tipo</label>
          <select style={inputS} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="tutti">Tutti</option>
            <option value="spreco">Solo sprechi</option>
            <option value="omaggio">Solo omaggi</option>
          </select>
        </div>
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                {['Quando', 'Tipo', 'Cosa', 'Qta', 'Causale', 'Costo', 'Autore', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: C.textSoft }}>Caricamento…</td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: C.textSoft }}>Nessun movimento nel periodo selezionato.</td></tr>
              ) : lista.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                  <td style={{ padding: '10px 14px', color: C.textMid, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtTs(m.ts)}</td>
                  <td style={{ padding: '10px 14px' }}>{tipoBadge(m.tipo)}</td>
                  <td style={{ padding: '10px 14px', color: C.text, fontWeight: 600 }}>
                    {m.prodotto || m.categoria || '—'}
                    {m.note && <span style={{ color: C.textSoft, fontWeight: 400 }}> — {m.note}</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: C.text, whiteSpace: 'nowrap' }}>{fmtQta(m.qta, m.unita)}</td>
                  <td style={{ padding: '10px 14px', color: C.textMid }}>{m.causale || '—'}</td>
                  <td style={{ padding: '10px 14px', color: m.tipo === 'spreco' ? C.amber : '#0369A1', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmt(m.fcTot)}
                    {m.tipo === 'omaggio' && Number(m.valoreOmaggio) > 0 && (
                      <span style={{ color: C.textSoft, fontWeight: 400, marginLeft: 6 }}>(− {fmt(m.valoreOmaggio)} ricavo)</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: C.textSoft, fontSize: 11 }}>
                    {m.autore_email || '—'}
                    {m.autore_ruolo === 'dipendente' && <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 3, background: C.amberLight, color: C.amber, fontSize: 8, fontWeight: 700 }}>DIP</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {(!isDip || m.autore_uid === auth?.user?.id) && (
                      <button onClick={() => elimina(m)}
                        style={{ padding: '4px 10px', background: 'transparent', color: C.red, border: `1px solid ${C.redLight}`, borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                        Elimina
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
