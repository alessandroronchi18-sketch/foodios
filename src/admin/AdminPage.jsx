import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { color as T, radius as R, shadow as S, motion as M, tnum as _tnum, typo } from '../lib/theme'

// ─── Costanti ──────────────────────────────────────────────────────────────
const PIANI = ['trial', 'base', 'pro', 'enterprise']
const PIANO_PREZZO = { trial: 0, base: 39, pro: 89, enterprise: 199 }

const COLORS = {
  bg: T.bg,
  card: T.bgCard,
  border: T.border,
  rowAlt: T.bgSubtle,
  rowHover: T.bgMuted,
  text: T.text,
  textSoft: T.textMid,
  textMute: T.textSoft,
  accent: T.brand,
  accentSoft: T.brandLight,
  ok: '#065F46',
  okBg: T.greenLight,
  warn: '#92400E',
  warnBg: T.amberLight,
  err: '#991B1B',
  errBg: '#FEE2E2',
  blocked: T.textMid,
  blockedBg: T.bgSubtle,
  blue: '#1D4ED8',
  blueBg: T.blueLight,
}
const tnum = _tnum;

// ─── Utility ───────────────────────────────────────────────────────────────
const fmtData = iso => iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
const fmtDataOra = iso => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtEuro = n => '€' + Number(n || 0).toLocaleString('it-IT')

function statoCliente(c) {
  const now = new Date()
  if (c.attivo === false) return 'bloccato'
  if (c.org_approvata) return 'pagante'
  if (c.trial_ends_at && new Date(c.trial_ends_at) > now) return 'trial'
  return 'scaduto'
}

function giorniRimanenti(c) {
  if (!c.trial_ends_at) return null
  const d = new Date(c.trial_ends_at)
  const diff = Math.ceil((d - new Date()) / 86400000)
  return diff
}

// ─── Componenti UI riutilizzabili ──────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.border}`,
      borderRadius: R.xl, boxShadow: S.sm, ...style,
    }}>{children}</div>
  )
}

function StatoBadge({ stato, giorni }) {
  const m = {
    pagante:   { bg: COLORS.okBg,      fg: COLORS.ok,      lbl: '✅ Pagante' },
    trial:     { bg: COLORS.warnBg,    fg: COLORS.warn,    lbl: `⏳ Trial${giorni != null ? ` (${giorni}gg)` : ''}` },
    scaduto:   { bg: COLORS.errBg,     fg: COLORS.err,     lbl: '❌ Scaduto' },
    bloccato:  { bg: COLORS.blockedBg, fg: COLORS.blocked, lbl: '🔒 Bloccato' },
  }
  const s = m[stato] || m.scaduto
  return (
    <span style={{
      background: s.bg, color: s.fg, padding: '3px 10px',
      borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{s.lbl}</span>
  )
}

function Btn({ children, kind = 'primary', size = 'md', onClick, disabled, title, style }) {
  const palette = {
    primary:   { bg: COLORS.accent, fg: '#FFF',       border: COLORS.accent },
    success:   { bg: '#059669',     fg: '#FFF',       border: '#059669' },
    danger:    { bg: '#DC2626',     fg: '#FFF',       border: '#DC2626' },
    warn:      { bg: '#F59E0B',     fg: '#FFF',       border: '#F59E0B' },
    neutral:   { bg: '#FFF',        fg: COLORS.text,  border: COLORS.border },
    ghost:     { bg: 'transparent', fg: COLORS.text,  border: 'transparent' },
  }
  const p = palette[kind] || palette.primary
  const sizing = {
    sm: { padding: '4px 10px', fontSize: 11 },
    md: { padding: '8px 14px', fontSize: 13 },
    lg: { padding: '10px 18px', fontSize: 14 },
  }[size]
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      style={{
        background: p.bg, color: p.fg, border: `1px solid ${p.border}`,
        borderRadius: 8, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
        ...sizing, ...style,
      }}
    >{children}</button>
  )
}

function KpiCard({ label, value, sub, color }) {
  return (
    <Card style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: color || COLORS.text, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 4 }}>{sub}</div>
      )}
    </Card>
  )
}

function Modal({ title, onClose, children, width = 520 }) {
  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.card, borderRadius: 14, width: '100%', maxWidth: width,
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.text }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 22, color: COLORS.textMute, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Modali specifiche ─────────────────────────────────────────────────────
function EmailModal({ cliente, onClose, onInvia }) {
  const [oggetto, setOggetto] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!oggetto.trim() || !messaggio.trim()) { setErr('Oggetto e messaggio obbligatori'); return }
    setBusy(true); setErr('')
    try {
      await onInvia({ destinatario: cliente.email, oggetto, messaggio })
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally { setBusy(false) }
  }

  const tpl = (lbl, og, msg) => (
    <button onClick={() => { setOggetto(og); setMessaggio(msg) }} style={{
      padding: '4px 10px', background: '#F1F5F9', border: `1px solid ${COLORS.border}`,
      borderRadius: 99, fontSize: 11, cursor: 'pointer', color: COLORS.textSoft,
    }}>{lbl}</button>
  )

  return (
    <Modal title={`📧 Email a ${cliente.nome_attivita}`} onClose={onClose} width={580}>
      <div style={{ fontSize: 12, color: COLORS.textMute, marginBottom: 14 }}>
        Destinatario: <strong style={{ color: COLORS.text }}>{cliente.email}</strong>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {tpl('🎉 Benvenuto',
          'Benvenuto in FoodOS!',
          `Ciao ${cliente.nome_completo || ''},\n\ngrazie per aver registrato ${cliente.nome_attivita} su FoodOS. Sono qui per aiutarti a iniziare — fammi sapere se hai bisogno di una breve demo o di chiarimenti.\n\nA presto!`)}
        {tpl('⏰ Trial in scadenza',
          'La tua prova FoodOS sta per scadere',
          `Ciao ${cliente.nome_completo || ''},\n\nho visto che il tuo trial sta per terminare. Vuoi continuare con FoodOS? Posso prepararti un'offerta dedicata, fammi sapere.\n\nGrazie,\nAlessandro`)}
        {tpl('💬 Check-in',
          'Come va con FoodOS?',
          `Ciao ${cliente.nome_completo || ''},\n\nti scrivo per sapere come ti stai trovando con FoodOS. C'è qualche funzione che ti manca o che vorresti migliorata?\n\nIl tuo feedback è importante.\n\nAlessandro`)}
      </div>

      <input
        value={oggetto} onChange={e => setOggetto(e.target.value)}
        placeholder="Oggetto"
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: `1px solid ${COLORS.border}`, fontSize: 13, marginBottom: 10,
          boxSizing: 'border-box',
        }}
      />
      <textarea
        value={messaggio} onChange={e => setMessaggio(e.target.value)}
        placeholder="Messaggio…"
        rows={9}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: `1px solid ${COLORS.border}`, fontSize: 13, resize: 'vertical',
          fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      {err && (
        <div style={{
          marginTop: 10, padding: '8px 12px', background: COLORS.accentSoft,
          border: `1px solid ${COLORS.err}`, borderRadius: 8, color: COLORS.err, fontSize: 12,
        }}>⚠️ {err}</div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Btn kind="neutral" onClick={onClose} disabled={busy}>Annulla</Btn>
        <Btn kind="primary" onClick={submit} disabled={busy}>{busy ? 'Invio…' : 'Invia'}</Btn>
      </div>
    </Modal>
  )
}

function DeleteModal({ cliente, onClose, onConferma }) {
  const [conferma, setConferma] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setBusy(true); setErr('')
    try { await onConferma(conferma); onClose() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Modal title={`🗑️ Elimina ${cliente.nome_attivita}`} onClose={onClose}>
      <div style={{
        padding: '12px 14px', background: COLORS.errBg, border: `1px solid ${COLORS.err}`,
        borderRadius: 8, color: COLORS.err, fontSize: 13, marginBottom: 16,
      }}>
        <strong>Attenzione</strong>: questa azione è <strong>irreversibile</strong>.
        Verranno eliminati:
        <ul style={{ margin: '8px 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.7 }}>
          <li>Tutti i dati operativi (ricette, dipendenti, turni, fornitori, ordini, fatture, note…)</li>
          <li>Le sedi e i profili utente</li>
          <li>L'organizzazione e gli account auth associati</li>
        </ul>
      </div>
      <div style={{ fontSize: 13, color: COLORS.textSoft, marginBottom: 8 }}>
        Per confermare, scrivi <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, color: COLORS.err, fontWeight: 700 }}>ELIMINA</code>:
      </div>
      <input
        value={conferma} onChange={e => setConferma(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: `1px solid ${COLORS.border}`, fontSize: 13, boxSizing: 'border-box',
        }}
        autoFocus
      />
      {err && (
        <div style={{
          marginTop: 10, padding: '8px 12px', background: COLORS.accentSoft,
          border: `1px solid ${COLORS.err}`, borderRadius: 8, color: COLORS.err, fontSize: 12,
        }}>⚠️ {err}</div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Btn kind="neutral" onClick={onClose} disabled={busy}>Annulla</Btn>
        <Btn kind="danger" onClick={submit} disabled={busy || conferma !== 'ELIMINA'}>
          {busy ? 'Eliminazione…' : 'Elimina definitivamente'}
        </Btn>
      </div>
    </Modal>
  )
}

function DemoCleanupModal({ cliente, matches, onClose, onConferma }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setBusy(true); setErr('')
    try { await onConferma(); onClose() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Modal title={`🧹 Pulisci fatture demo · ${cliente.nome_attivita}`} onClose={onClose} width={560}>
      {matches.length === 0 ? (
        <div style={{
          padding: '14px 16px', background: COLORS.greenBg || '#F0FDF4',
          border: `1px solid ${COLORS.green || '#16A34A'}`, borderRadius: 8,
          color: COLORS.green || '#15803D', fontSize: 13,
        }}>
          ✓ Nessuna fattura demo trovata per questo cliente. Niente da eliminare.
        </div>
      ) : (
        <>
          <div style={{
            padding: '12px 14px', background: COLORS.accentSoft || '#FEF9C3',
            border: `1px solid ${COLORS.amber || '#D97706'}`, borderRadius: 8,
            color: '#92400E', fontSize: 13, marginBottom: 14,
          }}>
            Trovate <strong>{matches.length}</strong> fatture demo. Verranno eliminate definitivamente dal database. L'azione non è reversibile.
          </div>
          <div style={{
            border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden',
            marginBottom: 14, maxHeight: 280, overflowY: 'auto',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: '#FAFAFA' }}>
                <tr>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textMute, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${COLORS.border}` }}>Data</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textMute, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${COLORS.border}` }}>Fornitore</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textMute, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${COLORS.border}` }}>Numero</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: COLORS.textMute, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${COLORS.border}` }}>Totale</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((f, i) => (
                  <tr key={f.id} style={{ borderBottom: i < matches.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
                    <td style={{ padding: '7px 10px', color: COLORS.textSoft, whiteSpace: 'nowrap' }}>{f.data_fattura || '—'}</td>
                    <td style={{ padding: '7px 10px', color: COLORS.text, fontWeight: 500 }}>{f.fornitore}</td>
                    <td style={{ padding: '7px 10px', color: COLORS.textSoft, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>{f.numero_rif || '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: COLORS.text, whiteSpace: 'nowrap' }}>€ {Number(f.totale || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {err && (
        <div style={{
          marginBottom: 14, padding: '8px 12px', background: COLORS.accentSoft,
          border: `1px solid ${COLORS.err}`, borderRadius: 8, color: COLORS.err, fontSize: 12,
        }}>⚠️ {err}</div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn kind="neutral" onClick={onClose} disabled={busy}>Annulla</Btn>
        {matches.length > 0 && (
          <Btn kind="danger" onClick={submit} disabled={busy}>
            {busy ? 'Eliminazione…' : `🗑️ Elimina ${matches.length} fatture`}
          </Btn>
        )}
      </div>
    </Modal>
  )
}

function ImpersonaModal({ cliente, link, onClose }) {
  const [copiato, setCopiato] = useState(false)
  async function copia() {
    try { await navigator.clipboard.writeText(link); setCopiato(true); setTimeout(() => setCopiato(false), 2000) }
    catch { /* ignore */ }
  }
  return (
    <Modal title={`🔑 Link di accesso — ${cliente.nome_attivita}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: COLORS.textSoft, lineHeight: 1.6, marginBottom: 14 }}>
        Magic link generato per <strong>{cliente.email}</strong>.<br/>
        Apri il link in una <strong>finestra anonima</strong> per accedere come quell'utente
        senza interferire con la tua sessione admin.
      </div>
      <div style={{
        padding: '10px 12px', background: '#F1F5F9', borderRadius: 8,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: COLORS.text,
        wordBreak: 'break-all', maxHeight: 120, overflow: 'auto',
      }}>{link}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Btn kind="neutral" onClick={onClose}>Chiudi</Btn>
        <Btn kind="primary" onClick={copia}>{copiato ? '✓ Copiato' : 'Copia link'}</Btn>
        <Btn kind="warn" onClick={() => window.open(link, '_blank')}>Apri link</Btn>
      </div>
    </Modal>
  )
}

// ─── Componente principale ─────────────────────────────────────────────────
export default function AdminPage() {
  const [clienti, setClienti] = useState([])
  const [stats, setStats] = useState(null)
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [lastFetch, setLastFetch] = useState(null)
  const [actionLoading, setActionLoading] = useState({})

  // Filtri / ordinamento
  const [search, setSearch] = useState('')
  const [filtroStato, setFiltroStato] = useState('tutti')
  const [filtroTipo, setFiltroTipo] = useState('tutti')
  const [sortBy, setSortBy] = useState('registrata_il')
  const [sortDir, setSortDir] = useState('desc')

  // Modali
  const [emailFor, setEmailFor] = useState(null)
  const [deleteFor, setDeleteFor] = useState(null)
  const [impersona, setImpersona] = useState(null) // { cliente, link }
  const [demoFor, setDemoFor] = useState(null)     // { cliente, matches }

  // ── Helpers di chiamata API ─────────────────────────────────────────
  const apiCall = useCallback(async (path, opts = {}) => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Sessione non valida — ricarica la pagina')

    const res = await fetch(path, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
    })
    if (!res.ok) {
      let msg = `Errore ${res.status}`
      try {
        const data = await res.json()
        if (data?.error) msg = data.error + (data.reason ? ` (${data.reason})` : '')
      } catch { /* not json */ }
      throw new Error(msg)
    }
    return res
  }, [])

  // ── Fetch principale (clienti + stats) ──────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true); setErrore('')
    try {
      const res = await apiCall('/api/admin?action=stats')
      const data = await res.json()
      setClienti(data.clienti || [])
      setStats(data.stats || null)
      setLastFetch(new Date())
    } catch (err) {
      setErrore(err.message)
    } finally {
      setLoading(false)
    }
  }, [apiCall])

  const fetchAudit = useCallback(async () => {
    try {
      const res = await apiCall('/api/admin?action=audit')
      const data = await res.json()
      setAuditLog(data.log || [])
    } catch { /* non bloccare */ }
  }, [apiCall])

  useEffect(() => { fetchData(); fetchAudit() }, [fetchData, fetchAudit])

  // ── Azioni ──────────────────────────────────────────────────────────
  const azione = useCallback(async (orgId, tipo, payload = {}) => {
    const key = `${orgId || 'global'}-${tipo}`
    setActionLoading(prev => ({ ...prev, [key]: true }))
    try {
      const res = await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ orgId, tipo, ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      await fetchData()
      fetchAudit()
      return data
    } catch (err) {
      alert(`Errore: ${err.message}`)
      throw err
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }))
    }
  }, [apiCall, fetchData, fetchAudit])

  async function handleImpersona(c) {
    try {
      const data = await azione(c.org_id, 'impersona')
      if (data?.link) setImpersona({ cliente: c, link: data.link })
    } catch { /* già notificato */ }
  }

  async function handlePulisciDemo(c) {
    try {
      const res = await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ orgId: c.org_id, tipo: 'pulisci_demo_fatture', valore: 'preview' }),
      })
      const data = await res.json().catch(() => ({}))
      setDemoFor({ cliente: c, matches: data.matches || [] })
    } catch (err) {
      alert(`Errore: ${err.message}`)
    }
  }

  async function handleResetPassword(c) {
    try {
      const data = await azione(c.org_id, 'reset_password')
      if (data?.link) {
        if (window.confirm(`Link di recovery generato per ${c.email}.\n\nClicca OK per copiarlo negli appunti.`)) {
          try { await navigator.clipboard.writeText(data.link) } catch { /* ignore */ }
        }
      }
    } catch { /* già notificato */ }
  }

  async function handleEsportaCsv() {
    try {
      const res = await apiCall('/api/admin?action=esporta_csv')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clienti_foodios_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Errore export: ${err.message}`)
    }
  }

  async function handleEmailTrialScadenza() {
    const target = clienti.filter(c => {
      if (c.org_approvata || c.attivo === false) return false
      const g = giorniRimanenti(c)
      return g != null && g > 0 && g <= 7
    })
    if (target.length === 0) { alert('Nessun trial in scadenza nei prossimi 7 giorni'); return }
    if (!confirm(`Inviare email di promemoria scadenza a ${target.length} clienti?`)) return

    let ok = 0, ko = 0
    for (const c of target) {
      try {
        await apiCall('/api/admin', {
          method: 'POST',
          body: JSON.stringify({
            tipo: 'invia_email',
            destinatario: c.email,
            oggetto: 'La tua prova FoodOS scade tra pochi giorni ⏰',
            messaggio: `Ciao ${c.nome_completo || ''},\n\nla tua prova gratuita di FoodOS scade tra ${giorniRimanenti(c)} giorni.\n\nSe vuoi continuare ad accedere ai tuoi dati e alle analisi, rispondi a questa email e ti preparo l'attivazione.\n\nA presto,\nAlessandro`,
          }),
        })
        ok++
      } catch { ko++ }
    }
    alert(`Email inviate: ${ok} ok, ${ko} errori`)
  }

  // ── Filtri + ordinamento ────────────────────────────────────────────
  const tipiDisponibili = useMemo(() => {
    const s = new Set(clienti.map(c => c.tipo).filter(Boolean))
    return Array.from(s).sort()
  }, [clienti])

  const clientiVisibili = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = clienti.filter(c => {
      if (q) {
        const hay = `${c.nome_attivita || ''} ${c.nome_completo || ''} ${c.email || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filtroTipo !== 'tutti' && c.tipo !== filtroTipo) return false
      if (filtroStato !== 'tutti' && statoCliente(c) !== filtroStato) return false
      return true
    })

    out.sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy]
      if (sortBy === 'registrata_il' || sortBy === 'ultimo_accesso' || sortBy === 'trial_ends_at') {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      } else if (sortBy === 'num_record' || sortBy === 'num_sedi') {
        av = Number(av || 0); bv = Number(bv || 0)
      } else {
        av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase()
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return out
  }, [clienti, search, filtroStato, filtroTipo, sortBy, sortDir])

  // ── Metriche avanzate ────────────────────────────────────────────────
  const metricheAvanzate = useMemo(() => {
    if (!stats || clienti.length === 0) return null
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)

    const topAttivi = [...clienti]
      .filter(c => c.num_record > 0)
      .sort((a, b) => (b.num_record || 0) - (a.num_record || 0))
      .slice(0, 5)

    const inattivi = clienti.filter(c => {
      const ref = c.ultimo_accesso ? new Date(c.ultimo_accesso) : (c.registrata_il ? new Date(c.registrata_il) : null)
      return ref && ref < sevenDaysAgo
    })

    return { topAttivi, inattivi, conversion: stats.conversionRate }
  }, [stats, clienti])

  // ── Header sort helper ───────────────────────────────────────────────
  function HeaderSort({ field, children }) {
    const active = sortBy === field
    return (
      <button
        onClick={() => {
          if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
          else { setSortBy(field); setSortDir('desc') }
        }}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 0, fontSize: 11, fontWeight: 700, color: active ? COLORS.text : COLORS.textMute,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        {children}
        {active && <span style={{ fontSize: 9 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 14,
    }}>
      {/* Header */}
      <div style={{
        background: '#FFF', borderBottom: `1px solid ${COLORS.border}`,
        padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 17, color: COLORS.text }}>
            🍰 FoodOS <span style={{ color: COLORS.accent }}>Admin</span>
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
            Pannello amministrazione · {lastFetch
              ? `aggiornato alle ${lastFetch.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'caricamento…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="neutral" onClick={() => { fetchData(); fetchAudit() }} disabled={loading}>
            {loading ? '…' : '🔄 Aggiorna'}
          </Btn>
          <Btn kind="neutral" onClick={() => { window.location.href = '/' }}>← Sito</Btn>
          <Btn kind="ghost" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }}>Esci</Btn>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {errore && (
          <div style={{
            background: COLORS.accentSoft, border: `1px solid ${COLORS.err}`,
            borderRadius: 8, padding: '12px 16px', color: COLORS.err, marginBottom: 20, fontSize: 13,
          }}>⚠️ {errore}</div>
        )}

        {/* ── KPI ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20,
        }}>
          <KpiCard label="Totale clienti" value={stats?.totale ?? '—'} sub={stats?.nuoviMese != null ? `+${stats.nuoviMese} ultimo mese` : null} />
          <KpiCard
            label="Trial attivi"
            value={stats?.trial ?? '—'}
            sub={stats?.giorniMediTrial != null ? `Media ${stats.giorniMediTrial}gg rimasti` : null}
            color={COLORS.warn}
          />
          <KpiCard
            label="Paganti"
            value={stats?.paganti ?? '—'}
            sub={metricheAvanzate?.conversion != null ? `Conversion ${metricheAvanzate.conversion}%` : null}
            color={COLORS.ok}
          />
          <KpiCard
            label="Trial scaduti"
            value={stats?.scaduti ?? '—'}
            sub="Da convertire"
            color={COLORS.err}
          />
          <KpiCard
            label="MRR stimato"
            value={stats ? fmtEuro(stats.mrrStimato) : '—'}
            sub="Su piani attivi"
            color={COLORS.blue}
          />
          <KpiCard
            label="Nuovi 7gg"
            value={stats?.nuoviSettimana ?? '—'}
            sub="Registrazioni"
          />
        </div>

        {/* ── Grafico crescita ───────────────────────────────────── */}
        {stats?.crescita && (
          <Card style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>📈 Crescita registrazioni</h3>
              <div style={{ fontSize: 11, color: COLORS.textMute }}>Ultime 12 settimane</div>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={stats.crescita} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="settimana" stroke={COLORS.textMute} fontSize={11} />
                  <YAxis stroke={COLORS.textMute} fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12 }}
                    labelStyle={{ fontWeight: 700, color: COLORS.text }}
                  />
                  <Line
                    type="monotone" dataKey="registrazioni"
                    stroke={COLORS.accent} strokeWidth={2.5}
                    dot={{ fill: COLORS.accent, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* ── Azioni rapide ──────────────────────────────────────── */}
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>⚡ Azioni rapide</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn kind="neutral" onClick={handleEmailTrialScadenza}>
              📧 Email a trial in scadenza (7gg)
            </Btn>
            <Btn kind="neutral" onClick={handleEsportaCsv}>
              📊 Esporta CSV clienti
            </Btn>
            <Btn kind="neutral" onClick={fetchAudit}>
              🔄 Aggiorna log
            </Btn>
            <Btn kind="ghost" onClick={() => window.open('https://supabase.com/dashboard', '_blank')}>
              🛢️ Supabase →
            </Btn>
            <Btn kind="ghost" onClick={() => window.open('https://vercel.com/dashboard', '_blank')}>
              ▲ Vercel →
            </Btn>
          </div>
        </Card>

        {/* ── Tabella clienti ────────────────────────────────────── */}
        <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
          {/* Filtri */}
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <strong style={{ fontSize: 14 }}>Clienti</strong>
            <span style={{ fontSize: 12, color: COLORS.textMute }}>
              {clientiVisibili.length} / {clienti.length}
            </span>
            <div style={{ flex: 1 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Cerca per nome, email…"
              style={{
                padding: '6px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`,
                fontSize: 12, minWidth: 220,
              }}
            />
            <select
              value={filtroStato} onChange={e => setFiltroStato(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12, background: '#FFF' }}
            >
              <option value="tutti">Tutti gli stati</option>
              <option value="trial">Trial</option>
              <option value="pagante">Paganti</option>
              <option value="scaduto">Scaduti</option>
              <option value="bloccato">Bloccati</option>
            </select>
            <select
              value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12, background: '#FFF' }}
            >
              <option value="tutti">Tutti i tipi</option>
              {tipiDisponibili.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMute }}>Caricamento…</div>
          ) : clientiVisibili.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMute }}>
              {clienti.length === 0 ? 'Nessun cliente registrato' : 'Nessun cliente corrisponde ai filtri'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: COLORS.rowAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                    <th style={th()}><HeaderSort field="nome_attivita">Attività</HeaderSort></th>
                    <th style={th()}><HeaderSort field="tipo">Tipo</HeaderSort></th>
                    <th style={th()}><HeaderSort field="email">Email</HeaderSort></th>
                    <th style={th()}><HeaderSort field="registrata_il">Registrata</HeaderSort></th>
                    <th style={th()}>Piano</th>
                    <th style={th()}>Stato</th>
                    <th style={th()}><HeaderSort field="num_sedi">Sedi</HeaderSort></th>
                    <th style={th()}><HeaderSort field="num_record">Dati</HeaderSort></th>
                    <th style={th()}><HeaderSort field="ultimo_accesso">Ultimo accesso</HeaderSort></th>
                    <th style={th()}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {clientiVisibili.map((c, i) => {
                    const stato = statoCliente(c)
                    const giorni = giorniRimanenti(c)
                    const inAzione = key => actionLoading[`${c.org_id}-${key}`]
                    return (
                      <tr
                        key={c.org_id}
                        style={{
                          background: i % 2 === 0 ? COLORS.card : COLORS.rowAlt,
                          borderBottom: `1px solid ${COLORS.border}`,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = COLORS.rowHover}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? COLORS.card : COLORS.rowAlt}
                      >
                        <td style={td()}>
                          <div style={{ fontWeight: 700, color: COLORS.text }}>{c.nome_attivita || '—'}</div>
                          {c.nome_completo && <div style={{ fontSize: 11, color: COLORS.textMute }}>{c.nome_completo}</div>}
                        </td>
                        <td style={{ ...td(), color: COLORS.textSoft, textTransform: 'capitalize' }}>{c.tipo || '—'}</td>
                        <td style={{ ...td(), color: COLORS.textSoft }}>
                          {c.email}
                          {!c.email_confermata && (
                            <div style={{ fontSize: 10, color: COLORS.warn, marginTop: 2 }}>✉️ non confermata</div>
                          )}
                        </td>
                        <td style={{ ...td(), color: COLORS.textSoft, whiteSpace: 'nowrap' }}>{fmtData(c.registrata_il)}</td>
                        <td style={td()}>
                          <select
                            value={c.piano || 'trial'}
                            onChange={e => azione(c.org_id, 'cambia_piano', { valore: e.target.value })}
                            disabled={inAzione('cambia_piano')}
                            style={{
                              border: `1px solid ${COLORS.border}`, borderRadius: 6,
                              padding: '4px 8px', fontSize: 12, cursor: 'pointer', background: '#FFF',
                            }}
                          >
                            {PIANI.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td style={td()}><StatoBadge stato={stato} giorni={giorni} /></td>
                        <td style={{ ...td(), color: COLORS.textSoft, textAlign: 'center' }}>{c.num_sedi || 0}</td>
                        <td style={{ ...td(), color: COLORS.textSoft, textAlign: 'center' }}>{c.num_record || 0}</td>
                        <td style={{ ...td(), color: COLORS.textSoft, whiteSpace: 'nowrap' }}>
                          {c.ultimo_accesso ? fmtDataOra(c.ultimo_accesso) : <span style={{ color: COLORS.textMute }}>—</span>}
                        </td>
                        <td style={td()}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {!c.org_approvata && (
                              <Btn kind="success" size="sm" onClick={() => azione(c.org_id, 'approva')} disabled={inAzione('approva')} title="Approva e attiva">
                                ✓
                              </Btn>
                            )}
                            {c.attivo === false ? (
                              <Btn kind="success" size="sm" onClick={() => azione(c.org_id, 'riattiva')} disabled={inAzione('riattiva')} title="Riattiva">
                                ▶
                              </Btn>
                            ) : (
                              <Btn kind="danger" size="sm" onClick={() => { if (confirm(`Bloccare ${c.nome_attivita}?`)) azione(c.org_id, 'blocca') }} disabled={inAzione('blocca')} title="Blocca">
                                ⏸
                              </Btn>
                            )}
                            <Btn kind="neutral" size="sm" onClick={() => {
                              const g = prompt(`Estendi trial di ${c.nome_attivita} di quanti giorni?`, '30')
                              if (g) azione(c.org_id, 'estendi_trial', { valore: g })
                            }} disabled={inAzione('estendi_trial')} title="Estendi trial">
                              ⏱
                            </Btn>
                            <Btn kind="neutral" size="sm" onClick={() => setEmailFor(c)} title="Invia email">
                              📧
                            </Btn>
                            <Btn kind="warn" size="sm" onClick={() => handleImpersona(c)} disabled={inAzione('impersona')} title="Genera magic link">
                              🔑
                            </Btn>
                            <Btn kind="neutral" size="sm" onClick={() => handleResetPassword(c)} disabled={inAzione('reset_password')} title="Reset password">
                              🔁
                            </Btn>
                            <Btn kind="neutral" size="sm" onClick={() => handlePulisciDemo(c)} disabled={inAzione('pulisci_demo_fatture')} title="Pulisci fatture demo">
                              🧹
                            </Btn>
                            <Btn kind="danger" size="sm" onClick={() => setDeleteFor(c)} title="Elimina">
                              🗑
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Metriche avanzate ──────────────────────────────────── */}
        {metricheAvanzate && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <Card style={{ padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800 }}>🏆 Top 5 clienti più attivi</h3>
              {metricheAvanzate.topAttivi.length === 0 ? (
                <div style={{ color: COLORS.textMute, fontSize: 12 }}>Nessuna attività registrata</div>
              ) : (
                <table style={{ width: '100%', fontSize: 12 }}>
                  <tbody>
                    {metricheAvanzate.topAttivi.map(c => (
                      <tr key={c.org_id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                        <td style={{ padding: '6px 0', fontWeight: 600 }}>{c.nome_attivita}</td>
                        <td style={{ padding: '6px 0', color: COLORS.textMute }}>{c.tipo}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: COLORS.blue }}>
                          {c.num_record} record
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card style={{ padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800 }}>
                😴 Inattivi da &gt;7 giorni ({metricheAvanzate.inattivi.length})
              </h3>
              {metricheAvanzate.inattivi.length === 0 ? (
                <div style={{ color: COLORS.textMute, fontSize: 12 }}>Tutti i clienti sono attivi 🎉</div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {metricheAvanzate.inattivi.slice(0, 10).map(c => (
                    <div key={c.org_id} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '6px 0', borderBottom: `1px solid ${COLORS.border}`, fontSize: 12,
                    }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{c.nome_attivita}</div>
                        <div style={{ color: COLORS.textMute, fontSize: 10 }}>{c.email}</div>
                      </div>
                      <div style={{ color: COLORS.textMute, fontSize: 11, textAlign: 'right' }}>
                        {c.ultimo_accesso ? `Ult. ${fmtData(c.ultimo_accesso)}` : 'Mai loggato'}
                      </div>
                    </div>
                  ))}
                  {metricheAvanzate.inattivi.length > 10 && (
                    <div style={{ color: COLORS.textMute, fontSize: 11, padding: '6px 0' }}>
                      …e altri {metricheAvanzate.inattivi.length - 10}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Log attività ───────────────────────────────────────── */}
        <Card style={{ padding: 0, marginBottom: 30 }}>
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <strong style={{ fontSize: 14 }}>📋 Log attività recenti</strong>
            <span style={{ fontSize: 11, color: COLORS.textMute }}>{auditLog.length} eventi</span>
          </div>
          {auditLog.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              Nessun evento registrato
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <tbody>
                  {auditLog.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '8px 18px', color: COLORS.textMute, whiteSpace: 'nowrap', width: 140 }}>
                        {fmtDataOra(r.when)}
                      </td>
                      <td style={{ padding: '8px 0', color: COLORS.textSoft, width: 180 }}>{r.actor}</td>
                      <td style={{ padding: '8px 0', fontWeight: 600 }}>{r.action}</td>
                      <td style={{ padding: '8px 18px', color: COLORS.textMute, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10 }}>
                        {r.target ? r.target.slice(0, 8) + '…' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Modali ──────────────────────────────────────────────── */}
      {emailFor && (
        <EmailModal
          cliente={emailFor}
          onClose={() => setEmailFor(null)}
          onInvia={async payload => {
            await apiCall('/api/admin', {
              method: 'POST',
              body: JSON.stringify({ tipo: 'invia_email', ...payload }),
            })
            fetchAudit()
          }}
        />
      )}
      {deleteFor && (
        <DeleteModal
          cliente={deleteFor}
          onClose={() => setDeleteFor(null)}
          onConferma={async conferma => {
            await apiCall('/api/admin', {
              method: 'POST',
              body: JSON.stringify({ orgId: deleteFor.org_id, tipo: 'elimina', conferma }),
            })
            await fetchData()
            fetchAudit()
          }}
        />
      )}
      {impersona && (
        <ImpersonaModal
          cliente={impersona.cliente}
          link={impersona.link}
          onClose={() => setImpersona(null)}
        />
      )}
      {demoFor && (
        <DemoCleanupModal
          cliente={demoFor.cliente}
          matches={demoFor.matches}
          onClose={() => setDemoFor(null)}
          onConferma={async () => {
            const res = await apiCall('/api/admin', {
              method: 'POST',
              body: JSON.stringify({ orgId: demoFor.cliente.org_id, tipo: 'pulisci_demo_fatture', valore: 'execute' }),
            })
            const data = await res.json().catch(() => ({}))
            await fetchData()
            fetchAudit()
            if (data?.deleted >= 0) {
              // un piccolo toast-like via alert per coerenza con le altre azioni
              setTimeout(() => alert(`✓ Eliminate ${data.deleted} fatture demo`), 0)
            }
          }}
        />
      )}
    </div>
  )
}

// ─── Stili tabella ─────────────────────────────────────────────────────────
function th() {
  return {
    padding: '10px 12px', textAlign: 'left',
    fontSize: 11, fontWeight: 700, color: COLORS.textMute,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  }
}
function td() {
  return { padding: '10px 12px', verticalAlign: 'middle' }
}
