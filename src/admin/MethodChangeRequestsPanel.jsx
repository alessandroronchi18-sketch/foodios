// MethodChangeRequestsPanel — pannello admin per gestire le richieste
// di cambio metodo di produzione (stampi ↔ inventario) inviate dai tenant.
//
// L'admin approva o rifiuta. Il rifiuto richiede una nota (arriva al tenant
// via notifica in-app). L'approvazione applica il cambio + sync sedi + seed
// formati default se target='inventario'.

import React, { useEffect, useState, useCallback } from 'react'
import Icon from '../components/Icon'
import { apiFetch } from '../lib/apiFetch'

const COLORS = {
  card: '#FFF', border: '#E2E8F0', text: '#0F172A', textSoft: '#334155',
  textMute: '#64748B', brand: '#6E0E1A', brandSoft: '#FEF0EE',
  warn: '#B45309', warnBg: '#FEF3C7',
  ok: '#065F46', okBg: '#D1FAE5',
  err: '#B91C1C', errBg: '#FEE2E2',
  blue: '#1D4ED8', blueBg: '#DBEAFE',
}

const labelMetodo = (m) => m === 'inventario' ? 'Inventario differenziale' : 'Stampi / unità'

export default function MethodChangeRequestsPanel({ onCountChange }) {
  const [richieste, setRichieste] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null) // id per cui e' aperto il form rifiuto
  const [rejectNote, setRejectNote] = useState('')
  const [err, setErr] = useState(null)

  const fetchRichieste = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await apiFetch('/api/admin?action=metodo_richieste_pending')
      const data = await res.json()
      const arr = data?.richieste || []
      setRichieste(arr)
      onCountChange?.(arr.length)
    } catch (e) { setErr(e.message || 'errore') } finally { setLoading(false) }
  }, [onCountChange])

  useEffect(() => { fetchRichieste() }, [fetchRichieste])

  async function approva(id) {
    if (busyId) return
    setBusyId(id); setErr(null)
    try {
      await apiFetch('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'metodo_richiesta_approva', richiesta_id: id }),
      })
      await fetchRichieste()
    } catch (e) { setErr(e.message || 'errore') } finally { setBusyId(null) }
  }

  async function confermaRifiuto(id) {
    const nota = rejectNote.trim()
    if (!nota) { setErr('Scrivi una nota che spieghi il rifiuto al cliente'); return }
    if (busyId) return
    setBusyId(id); setErr(null)
    try {
      await apiFetch('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'metodo_richiesta_rifiuta', richiesta_id: id, admin_note: nota }),
      })
      setRejectingId(null); setRejectNote('')
      await fetchRichieste()
    } catch (e) { setErr(e.message || 'errore') } finally { setBusyId(null) }
  }

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <strong style={{ fontSize: 14 }}><Icon name="settings" size={14}/> Richieste cambio metodo produzione</strong>
          <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
            Tenant che chiedono di passare stampi ↔ inventario. Approvi solo se hai verificato che i dati esistenti reggano il cambio.
          </div>
        </div>
        <button onClick={fetchRichieste} disabled={loading}
          style={{ padding: '6px 10px', background: COLORS.card, color: COLORS.textSoft, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 12, cursor: loading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="refresh" size={13}/> {loading ? '…' : 'Aggiorna'}
        </button>
      </div>

      {err && (
        <div style={{ marginBottom: 10, padding: '8px 12px', background: COLORS.errBg, color: COLORS.err, border: `1px solid ${COLORS.err}`, borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{err}</div>
      )}

      {richieste.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
          {loading ? 'Caricamento…' : 'Nessuna richiesta in attesa.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {richieste.map(r => {
            const ageH = (Date.now() - new Date(r.created_at).getTime()) / 3600000
            const ageLabel = ageH < 1 ? `${Math.round(ageH * 60)}min`
              : ageH < 24 ? `${Math.round(ageH)}h`
              : `${Math.round(ageH / 24)}gg`
            const isOld = ageH > 48
            const rejecting = rejectingId === r.id
            return (
              <div key={r.id} style={{
                padding: '14px 16px',
                background: isOld ? COLORS.warnBg : COLORS.card,
                border: `1px solid ${isOld ? COLORS.warn : COLORS.border}`,
                borderRadius: 10,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: COLORS.text, marginBottom: 4 }}>
                      {r.org_nome || r.organization_id.slice(0, 8)}
                      {r.org_tipo && <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.textMute, textTransform: 'capitalize' }}> · {r.org_tipo}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: COLORS.textSoft, lineHeight: 1.5, marginBottom: 4 }}>
                      Vuole passare da <b>{labelMetodo(r.from_metodo)}</b> a <b>{labelMetodo(r.to_metodo)}</b>
                    </div>
                    {r.motivazione && (
                      <div style={{ fontSize: 12, color: COLORS.textSoft, fontStyle: 'italic', background: '#F8FAFC', padding: '8px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 6, marginBottom: 6 }}>
                        &ldquo;{r.motivazione}&rdquo;
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: isOld ? COLORS.warn : COLORS.textMute }}>
                      {r.requested_by_email || '—'} · richiesta {ageLabel} fa{isOld && <strong> · da rispondere</strong>}
                    </div>
                  </div>
                  {!rejecting && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => approva(r.id)} disabled={busyId === r.id}
                        style={{ padding: '8px 12px', background: '#059669', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: busyId === r.id ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="check" size={13}/> Approva
                      </button>
                      <button onClick={() => { setRejectingId(r.id); setRejectNote(''); setErr(null) }} disabled={busyId === r.id}
                        style={{ padding: '8px 12px', background: '#DC2626', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: busyId === r.id ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="x" size={13}/> Rifiuta
                      </button>
                    </div>
                  )}
                </div>
                {rejecting && (
                  <div style={{ padding: 10, background: COLORS.errBg, border: `1px solid ${COLORS.err}`, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.err, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motivo del rifiuto (visibile al tenant)</div>
                    <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value.slice(0, 500))}
                      placeholder="Es: prima di passare all'inventario dobbiamo migrare i tuoi 40 gusti — ti scrivo con la procedura"
                      rows={3}
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${COLORS.err}`, borderRadius: 6, fontSize: 13, color: COLORS.text, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setRejectingId(null); setRejectNote(''); setErr(null) }} disabled={busyId === r.id}
                        style={{ padding: '6px 12px', background: 'transparent', color: COLORS.textSoft, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                        Annulla
                      </button>
                      <button onClick={() => confermaRifiuto(r.id)} disabled={busyId === r.id || !rejectNote.trim()}
                        style={{ padding: '6px 12px', background: COLORS.err, color: '#FFF', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: busyId === r.id ? 'wait' : 'pointer' }}>
                        Conferma rifiuto
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 14, padding: 10, background: COLORS.blueBg, borderRadius: 8, fontSize: 11, color: COLORS.blue, border: `1px solid ${COLORS.blue}` }}>
        <strong>Cosa succede all'approvazione:</strong> aggiornamento <code>organizations.metodo_produzione</code> + sync <code>sedi.metodo_produzione</code> + seed di 3 formati vendita default se target=inventario e org non ne ha. Notifica in-app al tenant. La modifica cambia le viste operative (Produzione ↔ Inventario gusti) al prossimo reload.
      </div>
    </div>
  )
}
