import React, { useState, useEffect } from 'react'

const PIANI = ['trial', 'base', 'pro', 'multi', 'chain']

function formatData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatoTag({ org }) {
  const now = new Date()
  const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null

  if (org.org_approvata) {
    return <span style={{ background: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>✅ Pagante</span>
  }
  if (trialEnd && trialEnd > now) {
    const giorni = Math.ceil((trialEnd - now) / 86400000)
    return <span style={{ background: '#FEF9C3', color: '#92400E', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>⏳ Trial ({giorni}gg)</span>
  }
  return <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>❌ Scaduto</span>
}

export default function AdminPage() {
  const [clienti, setClienti] = useState([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [actionLoading, setActionLoading] = useState({})

  useEffect(() => { fetchClienti() }, [])

  async function fetchClienti() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin', { method: 'GET' })
      if (!res.ok) throw new Error(`Errore ${res.status}`)
      const data = await res.json()
      setClienti(data.clienti || [])
    } catch (err) {
      setErrore('Errore nel caricamento: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function azione(orgId, tipo, valore) {
    setActionLoading(prev => ({ ...prev, [orgId + tipo]: true }))
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, tipo, valore }),
      })
      if (!res.ok) throw new Error(`Errore ${res.status}`)
      await fetchClienti()
    } catch (err) {
      alert('Errore: ' + err.message)
    } finally {
      setActionLoading(prev => ({ ...prev, [orgId + tipo]: false }))
    }
  }

  const now = new Date()
  const kpi = {
    totale: clienti.length,
    trial: clienti.filter(c => !c.org_approvata && c.trial_ends_at && new Date(c.trial_ends_at) > now).length,
    paganti: clienti.filter(c => c.org_approvata).length,
    scaduti: clienti.filter(c => !c.org_approvata && c.trial_ends_at && new Date(c.trial_ends_at) <= now).length,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FDFAF7', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1C0A0A', color: '#FFF', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 900, fontSize: 18 }}>🍰 FoodOS</span>
          <span style={{ opacity: 0.5, marginLeft: 12, fontSize: 13 }}>Pannello Admin</span>
        </div>
        <button onClick={fetchClienti} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#FFF', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
          🔄 Aggiorna
        </button>
      </div>

      <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Totale clienti', val: kpi.totale, color: '#1C0A0A' },
            { label: 'Trial attivi', val: kpi.trial, color: '#92400E' },
            { label: 'Paganti', val: kpi.paganti, color: '#065F46' },
            { label: 'Trial scaduti', val: kpi.scaduti, color: '#991B1B' },
          ].map(k => (
            <div key={k.label} style={{ background: '#FFF', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.val}</div>
              <div style={{ fontSize: 12, color: '#9C7B76', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {errore && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', color: '#C0392B', marginBottom: 20, fontSize: 13 }}>
            ⚠️ {errore}
          </div>
        )}

        {/* Tabella */}
        <div style={{ background: '#FFF', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8DDD8', fontWeight: 700, fontSize: 14, color: '#1C0A0A' }}>
            Clienti registrati
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9C7B76' }}>Caricamento…</div>
          ) : clienti.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9C7B76' }}>Nessun cliente registrato</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#FAF5F3' }}>
                    {['Attività', 'Tipo', 'Email', 'Registrata il', 'Piano', 'Stato', 'Azioni'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9C7B76', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E8DDD8' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clienti.map((c, i) => (
                    <tr key={c.org_id} style={{ borderBottom: i < clienti.length - 1 ? '1px solid #E8DDD8' : 'none', background: i % 2 === 0 ? '#FFF' : '#FDFAF7' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1C0A0A' }}>
                        {c.nome_attivita}
                        {c.nome_completo && <div style={{ fontSize: 11, color: '#9C7B76', fontWeight: 400 }}>{c.nome_completo}</div>}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#6B4C44', textTransform: 'capitalize' }}>{c.tipo}</td>
                      <td style={{ padding: '12px 14px', color: '#6B4C44' }}>{c.email}</td>
                      <td style={{ padding: '12px 14px', color: '#6B4C44' }}>{formatData(c.registrata_il)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <select
                          value={c.piano}
                          onChange={e => azione(c.org_id, 'cambia_piano', e.target.value)}
                          disabled={actionLoading[c.org_id + 'cambia_piano']}
                          style={{ border: '1px solid #E8DDD8', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', background: '#FFF', color: '#1C0A0A' }}
                        >
                          {PIANI.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatoTag org={c} />
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!c.org_approvata && (
                            <button
                              onClick={() => azione(c.org_id, 'approva', true)}
                              disabled={actionLoading[c.org_id + 'approva']}
                              style={{ padding: '4px 10px', background: '#059669', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              {actionLoading[c.org_id + 'approva'] ? '…' : 'Approva'}
                            </button>
                          )}
                          <button
                            onClick={() => azione(c.org_id, 'blocca', true)}
                            disabled={actionLoading[c.org_id + 'blocca']}
                            style={{ padding: '4px 10px', background: '#DC2626', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            {actionLoading[c.org_id + 'blocca'] ? '…' : 'Blocca'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
