// VenditeB2BView — vendite all'ingrosso a clienti business (canale separato dal retail).
import React, { useEffect, useMemo, useState } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { isRicettaValida, getR } from '../lib/foodcost'
import { todayLocal } from '../lib/dateLocal'
import {
  loadClientiB2B, salvaClienteB2B, eliminaClienteB2B,
  loadVenditeB2B, salvaVenditaB2B, setStatoVenditaB2B, eliminaVenditaB2B,
} from '../lib/venditeB2B'
import { C, PageHeader, KPI } from './_shared'

const eur = v => `€ ${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const STATI = {
  bozza:       { lbl: 'Bozza',       bg: '#F1F5F9', fg: '#475569' },
  consegnata:  { lbl: 'Da fatturare', bg: C.amberLight, fg: C.amber },
  fatturata:   { lbl: 'Fatturata',   bg: C.greenLight, fg: C.green },
  annullata:   { lbl: 'Annullata',   bg: '#FEE2E2', fg: C.red },
}

export default function VenditeB2BView({ orgId, sedeId, ricettario, notify }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('vendite')
  const [clienti, setClienti] = useState([])
  const [vendite, setVendite] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // form nuova vendita
  const [vForm, setVForm] = useState(null) // null = chiuso
  // form cliente
  const [cForm, setCForm] = useState(null)

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
      if (res.warnings?.length) notify?.(`✓ Vendita salvata (${eur(res.totale)}) · ⚠ ${res.warnings.slice(0, 2).join(' · ')}`, false)
      else notify?.(`✓ Vendita B2B ${vForm.id ? 'aggiornata' : 'salvata'} · ${eur(res.totale)}`)
      setVForm(null); ricarica()
    } catch (e) { notify?.('⚠ ' + e.message, false) }
    setSaving(false)
  }

  // ── handlers cliente ──
  const apriCliente = (c) => setCForm(c ? { ...c } : { nome: '', partita_iva: '', codice_destinatario: '', pec: '', indirizzo: '', cap: '', citta: '', provincia: '', referente: '', email: '', telefono: '', note: '' })
  const salvaC = async () => {
    if (saving) return
    setSaving(true)
    try { await salvaClienteB2B(orgId, cForm); notify?.('✓ Cliente salvato'); setCForm(null); ricarica() }
    catch (e) { notify?.('⚠ ' + e.message, false) }
    setSaving(false)
  }
  const toggleFattura = async (v) => {
    try { await setStatoVenditaB2B(v.id, v.stato === 'fatturata' ? 'consegnata' : 'fatturata'); ricarica() }
    catch (e) { notify?.('⚠ ' + e.message, false) }
  }

  const inp = { padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 13, color: C.text, background: C.white, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }
  const tabBtn = (id, lbl) => (
    <button key={id} onClick={() => setTab(id)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: tab === id ? C.red : 'transparent', color: tab === id ? C.white : C.textMid }}>{lbl}</button>
  )

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader subtitle="Vendite all'ingrosso a clienti business (bar, ristoranti) — canale separato dal banco" />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3,1fr)' : 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
        <KPI icon="💼" label="Ricavo B2B (mese)" value={eur(ricavoMese)} color={C.green} highlight />
        <KPI icon="🏢" label="Clienti" value={clienti.length} />
        <KPI icon="🧾" label="Da fatturare" value={daFatturare.length} sub={totDaFatturare > 0 ? eur(totDaFatturare) : ''} color={daFatturare.length ? C.amber : C.textSoft} />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: '#F0EAE6', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {tabBtn('vendite', '💰 Vendite')}{tabBtn('clienti', '🏢 Clienti')}
      </div>

      {loading ? <div style={{ color: C.textSoft, fontSize: 13 }}>Caricamento…</div> : tab === 'vendite' ? (
        <>
          {!vForm && (
            <button onClick={apriVendita} style={{ padding: '11px 20px', background: C.red, color: C.white, border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>➕ Nuova vendita B2B</button>
          )}
          {vForm && (
            <div style={{ background: '#FFF0F0', border: `1px solid ${C.red}30`, borderRadius: 12, padding: '18px 20px', marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>{vForm.id ? '✏️ Modifica vendita' : '➕ Nuova vendita B2B'}</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <select value={vForm.cliente_id} onChange={e => setVForm(f => ({ ...f, cliente_id: e.target.value }))} style={{ ...inp, flex: 1, minWidth: 160 }}>
                  <option value="">Cliente…</option>
                  {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <input type="date" value={vForm.data} onChange={e => setVForm(f => ({ ...f, data: e.target.value }))} style={{ ...inp, width: isMobile ? '100%' : 160 }} />
              </div>
              <datalist id="b2b-prod-list">{nomiProdotti.map(n => <option key={n} value={n} />)}</datalist>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 70px 28px', gap: 6, fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', padding: '0 4px', marginBottom: 4 }}>
                <span>Prodotto</span><span style={{ textAlign: 'right' }}>Qtà</span><span style={{ textAlign: 'right' }}>€ cad.</span><span style={{ textAlign: 'right' }}>Tot</span><span />
              </div>
              {vForm.righe.map((r, i) => {
                const tot = (Number(String(r.qta).replace(',', '.')) || 0) * (Number(String(r.prezzo).replace(',', '.')) || 0)
                const set = (k, val) => setVForm(f => ({ ...f, righe: f.righe.map((x, j) => j === i ? { ...x, [k]: val } : x) }))
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 70px 28px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <input list="b2b-prod-list" value={r.prodotto} placeholder="es. FOCACCIA" onChange={e => set('prodotto', e.target.value)} style={{ ...inp, fontWeight: 600 }} />
                    <input type="number" inputMode="decimal" value={r.qta} placeholder="0" onChange={e => set('qta', e.target.value)} style={{ ...inp, textAlign: 'right' }} />
                    <input type="number" inputMode="decimal" value={r.prezzo} placeholder="0,00" onChange={e => set('prezzo', e.target.value)} style={{ ...inp, textAlign: 'right' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{eur(tot)}</span>
                    <button aria-label="Rimuovi riga" onClick={() => setVForm(f => ({ ...f, righe: f.righe.length > 1 ? f.righe.filter((_, j) => j !== i) : f.righe }))} style={{ width: 28, height: 34, borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, color: C.red, cursor: 'pointer' }}>✕</button>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setVForm(f => ({ ...f, righe: [...f.righe, { prodotto: '', qta: '', prezzo: '' }] }))} style={{ padding: '8px 14px', background: C.white, border: `1px dashed ${C.borderStr}`, borderRadius: 8, fontSize: 12, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>+ Riga</button>
                <input value={vForm.note} onChange={e => setVForm(f => ({ ...f, note: e.target.value }))} placeholder="Note (opz.)" style={{ ...inp, flex: 1, minWidth: 120 }} />
                <button onClick={() => setVForm(null)} style={{ padding: '9px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.textSoft, cursor: 'pointer' }}>Annulla</button>
                <button onClick={salvaV} disabled={saving} style={{ padding: '9px 18px', background: C.green, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '💾 …' : '💾 Salva vendita'}</button>
              </div>
              {sedeId ? <div style={{ fontSize: 10, color: C.textSoft, marginTop: 8 }}>Lo stock dei prodotti finiti verrà scaricato dalla sede attiva.</div>
                      : <div style={{ fontSize: 10, color: C.amber, marginTop: 8 }}>⚠ Nessuna sede attiva: la vendita viene registrata ma lo stock non sarà scaricato.</div>}
            </div>
          )}

          {vendite.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, color: C.textSoft, fontSize: 13, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>💼</div>Nessuna vendita B2B registrata.
            </div>
          ) : (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
              {(() => {
                const COLS = isMobile ? '1fr' : 'minmax(0,1fr) 130px 110px 184px'
                const cellHead = { fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft }
                return (
                  <>
                    {!isMobile && (
                      <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', gap: 12, padding: '10px 16px', background: '#F8F4F2', borderBottom: `1px solid ${C.border}` }}>
                        <span style={cellHead}>Cliente</span>
                        <span style={{ ...cellHead, textAlign: 'center' }}>Stato</span>
                        <span style={{ ...cellHead, textAlign: 'right' }}>Totale</span>
                        <span style={{ ...cellHead, textAlign: 'right' }}>Azioni</span>
                      </div>
                    )}
                    {vendite.map((v, i) => {
                      const st = STATI[v.stato] || STATI.consegnata
                      return (
                        <div key={v.id} style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', gap: isMobile ? 8 : 12, padding: '12px 16px', borderBottom: i < vendite.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.clienti_b2b?.nome || 'Cliente eliminato'}</div>
                            <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>
                              {new Date(v.data + 'T12:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })} · {(v.righe || []).length} prodotti · {(v.righe || []).reduce((s, r) => s + (Number(r.qta) || 0), 0)} pz
                            </div>
                          </div>
                          <div style={{ justifySelf: isMobile ? 'start' : 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.fg, whiteSpace: 'nowrap' }}>{st.lbl}</span>
                          </div>
                          <span style={{ fontSize: 15, fontWeight: 800, color: C.green, fontVariantNumeric: 'tabular-nums', textAlign: isMobile ? 'left' : 'right' }}>{eur(v.totale)}</span>
                          <div style={{ display: 'flex', gap: 6, justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
                            {v.stato !== 'annullata' && (
                              <button onClick={() => modificaVendita(v)} title="Modifica vendita" style={{ padding: '6px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, fontSize: 11, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>Modifica</button>
                            )}
                            <button onClick={() => toggleFattura(v)} title={v.stato === 'fatturata' ? 'Segna da fatturare' : 'Segna fatturata'} style={{ padding: '6px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, fontSize: 11, fontWeight: 700, color: C.textMid, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {v.stato === 'fatturata' ? '↩ Riapri' : '✓ Fattura'}
                            </button>
                            <button aria-label="Elimina vendita" onClick={async () => { if (confirm('Eliminare questa vendita B2B? Lo stock dei prodotti verrà ripristinato.')) { try { await eliminaVenditaB2B(v.id); ricarica() } catch (e) { notify?.('⚠ ' + e.message, false) } } }} style={{ padding: '6px 9px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, color: C.red, cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )
              })()}
            </div>
          )}
        </>
      ) : (
        <>
          {!cForm && (
            <button onClick={() => apriCliente(null)} style={{ padding: '11px 20px', background: C.red, color: C.white, border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>➕ Nuovo cliente</button>
          )}
          {cForm && (
            <div style={{ background: '#FFF0F0', border: `1px solid ${C.red}30`, borderRadius: 12, padding: '18px 20px', marginBottom: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                {[
                  ['nome', 'Nome / Ragione sociale *', 'text'], ['partita_iva', 'Partita IVA', 'text'],
                  ['codice_destinatario', 'Codice destinatario SDI', 'text'], ['pec', 'PEC', 'text'],
                  ['indirizzo', 'Indirizzo', 'text'], ['citta', 'Città', 'text'],
                  ['cap', 'CAP', 'text'], ['provincia', 'Provincia', 'text'],
                  ['referente', 'Referente', 'text'], ['telefono', 'Telefono', 'text'],
                  ['email', 'Email', 'text'],
                ].map(([k, lbl]) => (
                  <div key={k}>
                    <label style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{lbl}</label>
                    <input value={cForm[k] || ''} onChange={e => setCForm(f => ({ ...f, [k]: e.target.value }))} style={inp} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button onClick={() => setCForm(null)} style={{ padding: '9px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.textSoft, cursor: 'pointer' }}>Annulla</button>
                <button onClick={salvaC} disabled={saving} style={{ padding: '9px 18px', background: C.green, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '💾 …' : '💾 Salva cliente'}</button>
              </div>
            </div>
          )}
          {clienti.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, color: C.textSoft, fontSize: 13, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>Nessun cliente B2B. Aggiungi i bar/ristoranti a cui vendi all'ingrosso.</div>
          ) : (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
              {clienti.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < clienti.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{c.nome}</div>
                    <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>{[c.partita_iva && `P.IVA ${c.partita_iva}`, c.citta, c.telefono].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <button onClick={() => apriCliente(c)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, fontSize: 11, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>Modifica</button>
                  <button aria-label="Elimina cliente" onClick={async () => { if (confirm(`Eliminare ${c.nome}?`)) { try { await eliminaClienteB2B(c.id); ricarica() } catch (e) { notify?.('⚠ ' + e.message, false) } } }} style={{ padding: '6px 9px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, color: C.red, cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
