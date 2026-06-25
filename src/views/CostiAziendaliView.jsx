// Gestione costi aziendali extra-food.
// L'utente popola autonomamente: consumabili (fazzoletti/coppette),
// manutenzione, ammortamenti, utenze, affitti, ecc. Le voci entrano nel
// calcolo P&L con importo MENSILE normalizzato (annuali/12, una_tantum/12).

import React, { useEffect, useState } from 'react'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmModal'
import { C, TNUM, PageHeader } from './_shared'
import {
  CATEGORIE_DEFAULT, PERIODICITA,
  caricaCostiAziendali, salvaVoceCosto, eliminaVoceCosto,
  importoMensile, totaleMensile, aggregaPerCategoria,
} from '../lib/costiAziendali'

const fmt0 = v => `${Math.round(Number(v) || 0).toLocaleString('it-IT')} €`
const fmt2 = v => `${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export default function CostiAziendaliView({ orgId, sedeId, sedi, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const confirmDialog = useConfirm()
  const [voci, setVoci] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // null = nessun form, oggetto = edit/create
  const [filterCategoria, setFilterCategoria] = useState('')

  async function reload() {
    setLoading(true)
    const arr = await caricaCostiAziendali(orgId, null)  // tutte
    setVoci(arr)
    setLoading(false)
  }
  useEffect(() => { if (orgId) reload() }, [orgId])

  const totMese = totaleMensile(voci)
  const totAnno = totMese * 12
  const perCategoria = aggregaPerCategoria(voci)
  const vociFiltrate = filterCategoria
    ? voci.filter(v => v.categoria === filterCategoria)
    : voci

  function nuovaVoce() {
    setForm({
      organization_id: orgId,
      sede_id: null,
      categoria: 'consumabili',
      voce: '',
      importo: '',
      periodicita: 'mensile',
      note: '',
    })
  }

  async function salva() {
    if (!form.voce?.trim() || !(Number(form.importo) > 0)) {
      notify?.('Compila descrizione e importo (>0)', false)
      return
    }
    try {
      await salvaVoceCosto(form)
      setForm(null)
      await reload()
      notify?.('Voce salvata')
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    }
  }

  async function elimina(id) {
    const ok = await confirmDialog({
      title: 'Eliminare voce di costo?',
      message: 'La voce sara rimossa dal P&L. Le voci storiche restano.',
      confirmLabel: 'Elimina', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    try {
      await eliminaVoceCosto(id, false)
      await reload()
      notify?.('Voce eliminata')
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader subtitle="Costi extra-food: consumabili, manutenzione, ammortamenti, utenze. Confluiscono nel P&L mensile normalizzati alla periodicità scelta." />

      {/* KPI riepilogativi */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        <KpiBox label="Costo mensile totale" value={fmt0(totMese)} color={T.brand} />
        <KpiBox label="Costo annuo stimato" value={fmt0(totAnno)} color={C.textMid} />
        <KpiBox label="N° voci attive" value={voci.length} color={C.textSoft} />
      </div>

      {/* Filtri + bottone aggiungi */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}
          style={{ padding: '8px 12px', minHeight: 40, fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8, background: '#FFFFFF', color: C.text }}>
          <option value="">Tutte le categorie</option>
          {CATEGORIE_DEFAULT.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={nuovaVoce}
          style={{ padding: '8px 16px', minHeight: 40, background: T.brand, color: '#FFFFFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="plus" size={14} color="#FFFFFF" />
          Aggiungi voce
        </button>
      </div>

      {/* Tabella voci */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
      ) : vociFiltrate.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: C.textSoft, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          <Icon name="package" size={36} color={C.textSoft} />
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12, color: C.textMid }}>
            Nessuna voce di costo {filterCategoria ? 'in questa categoria' : 'configurata'}
          </div>
          <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
            Aggiungi le tue voci (consumabili, utenze, manutenzione…) per vederle riflesse nel P&L mensile.
          </div>
        </div>
      ) : (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: S.sm }}>
          {perCategoria
            .filter(g => !filterCategoria || g.categoria === filterCategoria)
            .map(gruppo => {
              const catLabel = CATEGORIE_DEFAULT.find(c => c.id === gruppo.categoria)?.label || gruppo.categoria
              return (
                <div key={gruppo.categoria}>
                  <div style={{
                    padding: '10px 16px', background: '#F8FAFC',
                    borderBottom: `1px solid ${C.borderSoft}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    <span>{catLabel}</span>
                    <span style={{ color: T.brand, ...TNUM }}>{fmt2(gruppo.totaleMensile)}/mese</span>
                  </div>
                  {gruppo.voci.map(v => (
                    <div key={v.id} style={{
                      padding: '12px 16px', borderBottom: `1px solid ${C.borderSoft}`,
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{v.voce}</div>
                        {v.note && <div style={{ fontSize: 11.5, color: C.textSoft, marginTop: 2 }}>{v.note}</div>}
                        <div style={{ fontSize: 11, color: C.textSoft, marginTop: 3 }}>
                          {PERIODICITA.find(p => p.id === v.periodicita)?.label}
                          {v.sede_id ? ` · ${(sedi || []).find(s => s.id === v.sede_id)?.nome || 'sede'}` : ' · tutte le sedi'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, ...TNUM }}>{fmt2(v.importo)}</div>
                        <div style={{ fontSize: 10.5, color: T.brand, ...TNUM, marginTop: 2 }}>{fmt2(importoMensile(v))}/mese</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setForm({ ...v })} title="Modifica"
                          style={{ padding: 8, minWidth: 36, background: '#F8FAFC', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}>
                          <Icon name="edit" size={13} color={C.textMid} />
                        </button>
                        <button onClick={() => elimina(v.id)} title="Elimina"
                          style={{ padding: 8, minWidth: 36, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, cursor: 'pointer' }}>
                          <Icon name="trash" size={13} color={T.brand} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
        </div>
      )}

      {form && (
        <DialogFormCosto
          form={form} setForm={setForm} sedi={sedi}
          onClose={() => setForm(null)} onSave={salva}
        />
      )}
    </div>
  )
}

function KpiBox({ label, value, color }) {
  return (
    <div style={{ padding: 14, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: S.sm }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, ...TNUM }}>{value}</div>
    </div>
  )
}

function DialogFormCosto({ form, setForm, sedi, onClose, onSave }) {
  const isEdit = !!form.id
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const catInfo = CATEGORIE_DEFAULT.find(c => c.id === form.categoria)
  return (
    <div role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, maxWidth: 540, width: '100%', padding: '24px 26px', boxShadow: '0 20px 60px rgba(15,23,42,0.30)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.text }}>
            {isEdit ? 'Modifica voce di costo' : 'Nuova voce di costo'}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: C.textSoft }}>✕</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Categoria</label>
          <select value={form.categoria} onChange={e => update('categoria', e.target.value)} style={inp}>
            {CATEGORIE_DEFAULT.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {catInfo?.esempi && (
            <div style={{ fontSize: 11, color: C.textSoft, marginTop: 4 }}>es. {catInfo.esempi}</div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Descrizione voce</label>
          <input type="text" value={form.voce} onChange={e => update('voce', e.target.value)}
            placeholder="es. Coppette piccole 80g" style={inp} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Importo (€)</label>
            <input type="number" min="0" step="0.01" value={form.importo}
              onChange={e => update('importo', e.target.value)} placeholder="0.00" style={inp} />
          </div>
          <div>
            <label style={lbl}>Periodicità</label>
            <select value={form.periodicita} onChange={e => update('periodicita', e.target.value)} style={inp}>
              {PERIODICITA.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Sede (opzionale)</label>
          <select value={form.sede_id || ''} onChange={e => update('sede_id', e.target.value || null)} style={inp}>
            <option value="">Tutte le sedi</option>
            {(sedi || []).filter(s => s.attiva !== false).map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={lbl}>Note (opzionale)</label>
          <input type="text" value={form.note || ''} onChange={e => update('note', e.target.value)}
            placeholder="es. fornitore, contratto, scadenza..." style={inp} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={btnSecondary}>Annulla</button>
          <button onClick={onSave} style={btnPrimary}>{isEdit ? 'Salva modifiche' : 'Aggiungi'}</button>
        </div>
      </div>
    </div>
  )
}

const lbl = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textSoft, marginBottom: 6 }
const inp = { width: '100%', padding: '10px 12px', minHeight: 42, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.text, outline: 'none', background: '#FFFFFF' }
const btnPrimary = { padding: '10px 22px', minHeight: 44, background: T.brand, color: '#FFFFFF', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnSecondary = { padding: '10px 22px', minHeight: 44, background: '#FFFFFF', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
