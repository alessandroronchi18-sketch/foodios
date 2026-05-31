import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { color as T, radius as R, shadow as S, motion as M, tnum as _tnum, typo } from '../lib/theme'
import { useToast } from '../components/Toast'
import { apiFetch } from '../lib/apiFetch'

// ─── Costanti ──────────────────────────────────────────────────────────────
const PIANI = ['trial', 'base', 'pro', 'enterprise']
const PIANO_PREZZO = { trial: 0, base: 39, pro: 89, enterprise: 199 }

// Etichette per le chiavi di user_data — allineate ai label scritti dai trigger
// di audit (mig. 20260606). Tenere in sync se cambiano lì.
const LABEL_CHIAVE = {
  'pasticceria-magazzino-v1':            'Magazzino',
  'pasticceria-giornaliero-v1':          'Produzione giornaliera',
  'pasticceria-produzione-v1':           'Produzione',
  'pasticceria-chiusure-v1':             'Chiusure cassa',
  'pasticceria-logrif-v1':               'Rifornimenti',
  'pasticceria-movimenti-speciali-v1':   'Sprechi / Omaggi',
  'pasticceria-ricettario-v1':           'Ricettario',
  'pasticceria-semilavorati-v1':         'Semilavorati',
  'pasticceria-formati-vendita-v1':      'Formati di vendita',
  'pasticceria-prezzi-importati-v1':     'Prezzi ingredienti',
  'pasticceria-regole-v1':               'Regole vendita',
  'pasticceria-esclusi-v1':              'Esclusioni',
  'pasticceria-actions-v1':              'Azioni AI',
  'pasticceria-ai-v1':                   'Assistente AI',
  'pasticceria-scenario-operativo-v1':   'Scenario operativo',
}
const CHIAVI_OPERATIVE_SET = new Set([
  'pasticceria-magazzino-v1', 'pasticceria-giornaliero-v1',
  'pasticceria-chiusure-v1', 'pasticceria-logrif-v1',
  'pasticceria-movimenti-speciali-v1', 'pasticceria-produzione-v1',
])

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
          <button onClick={onClose} aria-label="Chiudi modale" style={{
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

function BulkEmailModal({ clienti, onClose, onInvia }) {
  const [oggetto, setOggetto] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ ok: 0, ko: 0, tot: 0 })
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function submit() {
    if (!oggetto.trim() || !messaggio.trim()) { setErr('Oggetto e messaggio obbligatori'); return }
    if (!confirm(`Invio email a ${clienti.length} clienti. Sei sicuro?`)) return
    setBusy(true); setErr(''); setProgress({ ok: 0, ko: 0, tot: clienti.length })
    let ok = 0, ko = 0
    for (const c of clienti) {
      const corpo = messaggio.replaceAll('{{nome_completo}}', c.nome_completo || '')
                              .replaceAll('{{nome_attivita}}', c.nome_attivita || '')
      try {
        await onInvia({ destinatario: c.email, oggetto, messaggio: corpo })
        ok++
      } catch { ko++ }
      setProgress({ ok, ko, tot: clienti.length })
    }
    setBusy(false)
    setDone(true)
  }

  return (
    <Modal title={`📧 Email a ${clienti.length} clienti`} onClose={busy ? () => {} : onClose} width={620}>
      {done ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 40 }}>{progress.ko === 0 ? '✅' : '⚠️'}</div>
          <div style={{ fontSize: 14, color: COLORS.text, fontWeight: 700, marginTop: 12 }}>
            Inviate {progress.ok} email · {progress.ko} errori
          </div>
          <Btn kind="primary" onClick={onClose} style={{ marginTop: 16 }}>Chiudi</Btn>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: COLORS.textMute, marginBottom: 10, lineHeight: 1.5 }}>
            Destinatari: <strong style={{ color: COLORS.text }}>{clienti.length}</strong> ·
            usa <code>{'{{nome_completo}}'}</code> e <code>{'{{nome_attivita}}'}</code> nel testo per personalizzare.
          </div>

          <input
            value={oggetto} onChange={e => setOggetto(e.target.value)}
            placeholder="Oggetto"
            disabled={busy}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${COLORS.border}`, fontSize: 13, marginBottom: 10,
              boxSizing: 'border-box',
            }}
          />
          <textarea
            value={messaggio} onChange={e => setMessaggio(e.target.value)}
            placeholder={`Ciao {{nome_completo}},\n\nun saluto da Alessandro di FoodOS.\nCome vanno le cose con {{nome_attivita}}?\n\nA presto.`}
            rows={9}
            disabled={busy}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${COLORS.border}`, fontSize: 13, resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {err && (
            <div style={{
              marginTop: 10, padding: '8px 12px', background: COLORS.errBg,
              border: `1px solid ${COLORS.err}`, borderRadius: 8, color: COLORS.err, fontSize: 12,
            }}>⚠️ {err}</div>
          )}
          {busy && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: COLORS.blueBg, borderRadius: 8, color: COLORS.blue, fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
              ⏳ Invio in corso… {progress.ok + progress.ko} / {progress.tot} (ok {progress.ok} · errori {progress.ko})
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn kind="neutral" onClick={onClose} disabled={busy}>Annulla</Btn>
            <Btn kind="primary" onClick={submit} disabled={busy}>{busy ? 'Invio…' : `Invia a ${clienti.length}`}</Btn>
          </div>
        </>
      )}
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

function NuovoCodiceScontoModal({ onClose, onCreato }) {
  const [codice, setCodice] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [tipoSconto, setTipoSconto] = useState('percent')
  const [valore, setValore] = useState(100)
  const [durata, setDurata] = useState('once')
  const [durataMesi, setDurataMesi] = useState(1)
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [scadenza, setScadenza] = useState('')
  const [pianiValidi, setPianiValidi] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const codNorm = codice.toUpperCase().replace(/[^A-Z0-9_-]/g, '')

  async function submit() {
    if (codNorm.length < 3) { setErr('Codice: minimo 3 caratteri'); return }
    setBusy(true); setErr('')
    try {
      await onCreato({
        codice: codNorm,
        descrizione,
        tipo_sconto: tipoSconto,
        valore_sconto: tipoSconto === 'amount' ? Math.round(parseFloat(valore) * 100) : parseInt(valore, 10),
        durata,
        durata_mesi: durata === 'repeating' ? parseInt(durataMesi, 10) : null,
        max_redemptions: maxRedemptions === '' ? null : parseInt(maxRedemptions, 10),
        scade_il: scadenza || null,
        piani_validi: pianiValidi.length > 0 ? pianiValidi : null,
      })
      onClose()
    } catch (e) {
      setErr(e.message); setBusy(false)
    }
  }

  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
  const inp = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 13, boxSizing: 'border-box' }

  return (
    <Modal title="🎟 Nuovo codice sconto" onClose={onClose} width={620}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Codice</label>
          <input value={codice} onChange={e => setCodice(e.target.value)}
            placeholder="Es. FOODIOS2026"
            style={{ ...inp, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.06em' }}/>
          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
            {codNorm ? `Sarà salvato come: ${codNorm}` : 'Solo lettere, numeri, - e _'}
          </div>
        </div>
        <div>
          <label style={lbl}>Descrizione interna</label>
          <input value={descrizione} onChange={e => setDescrizione(e.target.value)}
            placeholder="Es. Beta tester, Influencer X" style={inp}/>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Tipo sconto</label>
          <select value={tipoSconto} onChange={e => setTipoSconto(e.target.value)} style={inp}>
            <option value="percent">Percentuale (%)</option>
            <option value="amount">Importo fisso (€)</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Valore {tipoSconto === 'percent' ? '(1-100)' : '(€)'}</label>
          <input type="number" min="1" max={tipoSconto === 'percent' ? 100 : 10000}
            value={valore} onChange={e => setValore(e.target.value)}
            style={{ ...inp, fontWeight: 700 }}/>
          {tipoSconto === 'percent' && valore == 100 && (
            <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, marginTop: 4 }}>
              🎁 Sconto 100% = abbonamento gratis
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: durata === 'repeating' ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Durata applicazione</label>
          <select value={durata} onChange={e => setDurata(e.target.value)} style={inp}>
            <option value="once">Solo prima fattura</option>
            <option value="repeating">Per N mesi</option>
            <option value="forever">Per sempre</option>
          </select>
        </div>
        {durata === 'repeating' && (
          <div>
            <label style={lbl}>Mesi</label>
            <input type="number" min="1" max="60" value={durataMesi}
              onChange={e => setDurataMesi(e.target.value)} style={inp}/>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Utilizzi massimi (vuoto = illimitato)</label>
          <input type="number" min="1" value={maxRedemptions}
            onChange={e => setMaxRedemptions(e.target.value)}
            placeholder="es. 50" style={inp}/>
        </div>
        <div>
          <label style={lbl}>Scade il (opzionale)</label>
          <input type="datetime-local" value={scadenza}
            onChange={e => setScadenza(e.target.value)} style={inp}/>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Piani applicabili (lascia vuoto per tutti)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['pro', 'chain'].map(p => {
            const selected = pianiValidi.includes(p)
            return (
              <button key={p} type="button"
                onClick={() => setPianiValidi(prev => selected ? prev.filter(x => x !== p) : [...prev, p])}
                style={{
                  padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                  border: `1px solid ${selected ? '#6E0E1A' : '#E2E8F0'}`,
                  background: selected ? '#FEF7F5' : '#FFF',
                  color: selected ? '#6E0E1A' : '#64748B', cursor: 'pointer',
                }}>
                {selected && '✓ '}{p === 'pro' ? 'Pro (€89)' : 'Chain (€149)'}
              </button>
            )
          })}
        </div>
      </div>

      {err && (
        <div style={{ padding: '8px 12px', background: '#FEE2E2', border: '1px solid #991B1B', borderRadius: 8, color: '#991B1B', fontSize: 12, marginBottom: 12 }}>⚠️ {err}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn kind="neutral" onClick={onClose} disabled={busy}>Annulla</Btn>
        <Btn kind="primary" onClick={submit} disabled={busy || codNorm.length < 3}>
          {busy ? 'Creazione…' : 'Crea codice'}
        </Btn>
      </div>
    </Modal>
  )
}

function RegalaMesiModal({ cliente, codici, onClose, onRegala }) {
  const [mesi, setMesi] = useState(1)
  const [codiceRif, setCodiceRif] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setBusy(true); setErr('')
    try { await onRegala({ mesi, codice: codiceRif }); onClose() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Modal title={`🎁 Regala mesi · ${cliente.nome_attivita}`} onClose={onClose} width={500}>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 14, lineHeight: 1.55 }}>
        Estende la subscription Stripe (o il trial interno) per <strong>{cliente.nome_attivita}</strong> senza addebiti.
        Se l'utente ha già un abbonamento attivo, Stripe applicherà <code>trial_end</code> alla data calcolata.
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
          Mesi da regalare (1-60)
        </label>
        <input type="number" min="1" max="60" value={mesi}
          onChange={e => setMesi(parseInt(e.target.value, 10) || 1)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, fontWeight: 700, boxSizing: 'border-box' }}/>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
          Codice associato (opzionale, per audit)
        </label>
        <select value={codiceRif} onChange={e => setCodiceRif(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, background: '#FFF', boxSizing: 'border-box' }}>
          <option value="">— Nessuno (regalo manuale) —</option>
          {(codici || []).filter(c => c.attivo).map(c => (
            <option key={c.id} value={c.codice}>{c.codice} ({c.descrizione || 'senza descrizione'})</option>
          ))}
        </select>
      </div>

      {err && (
        <div style={{ padding: '8px 12px', background: '#FEE2E2', border: '1px solid #991B1B', borderRadius: 8, color: '#991B1B', fontSize: 12, marginBottom: 12 }}>⚠️ {err}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn kind="neutral" onClick={onClose} disabled={busy}>Annulla</Btn>
        <Btn kind="success" onClick={submit} disabled={busy || mesi < 1}>
          {busy ? 'Applicazione…' : `🎁 Regala ${mesi} mesi`}
        </Btn>
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

function ClienteDettaglioModal({ cliente, dettaglio, loading, onClose, onAzione, onSalvaNote }) {
  const stato = statoCliente(cliente)
  const giorni = giorniRimanenti(cliente)

  // Note CRM con autosave debounced (1.5s).
  const [nota, setNota] = useState('')
  const [notaStatus, setNotaStatus] = useState('idle') // idle | dirty | saving | saved | error
  const [notaSync, setNotaSync] = useState(false)
  useEffect(() => {
    if (dettaglio?.org && !notaSync) {
      setNota(dettaglio.org.note_admin || '')
      setNotaSync(true)
    }
  }, [dettaglio, notaSync])
  useEffect(() => {
    if (!notaSync || notaStatus !== 'dirty') return
    const t = setTimeout(async () => {
      setNotaStatus('saving')
      try {
        await onSalvaNote(nota)
        setNotaStatus('saved')
        setTimeout(() => setNotaStatus(s => s === 'saved' ? 'idle' : s), 1500)
      } catch {
        setNotaStatus('error')
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [nota, notaStatus, notaSync, onSalvaNote])

  const giorniDa = iso => {
    if (!iso) return null
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  }

  const healthBadge = (() => {
    const ref = cliente.ultimo_accesso || cliente.registrata_il
    const d = giorniDa(ref)
    if (d == null) return { bg: COLORS.blockedBg, fg: COLORS.blocked, lbl: '— Sconosciuto' }
    if (d <= 2) return { bg: COLORS.okBg, fg: COLORS.ok, lbl: '🟢 Attivo' }
    if (d <= 7) return { bg: COLORS.warnBg, fg: COLORS.warn, lbl: `🟡 A rischio (${d}gg)` }
    return { bg: COLORS.errBg, fg: COLORS.err, lbl: `🔴 Dormiente (${d}gg)` }
  })()

  const sedi = dettaglio?.sedi || []
  const usage = dettaglio?.usage || []
  const eventi = dettaglio?.eventi || []
  const org = dettaglio?.org || null
  const activation = dettaglio?.activation || null
  const counts = dettaglio?.counts || null

  const usageOperativo = usage.filter(u => CHIAVI_OPERATIVE_SET.has(u.data_key))
  const usageAltro = usage.filter(u => !CHIAVI_OPERATIVE_SET.has(u.data_key))

  return (
    <Modal title={`📋 ${cliente.nome_attivita}`} onClose={onClose} width={780}>
      {/* Header: stato + KPI in linea */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
        padding: '12px 14px', background: COLORS.rowAlt, borderRadius: 10, marginBottom: 16,
      }}>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Stato</div>
          <StatoBadge stato={stato} giorni={giorni} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Salute</div>
          <span style={{ background: healthBadge.bg, color: healthBadge.fg, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{healthBadge.lbl}</span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Piano</div>
          <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize' }}>{cliente.piano || 'trial'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Sedi · Record</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{cliente.num_sedi || 0} · {cliente.num_record || 0}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Registrata</div>
          <div style={{ fontSize: 12, color: COLORS.text }}>{fmtData(cliente.registrata_il)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Ultimo accesso</div>
          <div style={{ fontSize: 12, color: COLORS.text }}>{cliente.ultimo_accesso ? fmtDataOra(cliente.ultimo_accesso) : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Trial scade</div>
          <div style={{ fontSize: 12, color: COLORS.text }}>{cliente.trial_ends_at ? fmtData(cliente.trial_ends_at) : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Stripe</div>
          <div style={{ fontSize: 11, color: COLORS.text }}>
            {org?.stripe_subscription_id
              ? <><b>{org.stripe_status || 'attivo'}</b>{org.stripe_current_period_end ? <> · al {fmtData(org.stripe_current_period_end)}</> : null}</>
              : <span style={{ color: COLORS.textMute }}>— (nessuna sub)</span>}
          </div>
        </div>
      </div>

      {/* Activation: progressione "primo valore" */}
      {activation && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: COLORS.text }}>
              🚀 Activation · {activation.score}/{activation.totale}
            </h3>
            <span style={{ fontSize: 10, color: COLORS.textMute }}>
              {counts?.fatture != null && `${counts.fatture} fatture`}
              {counts?.dipendenti != null && ` · ${counts.dipendenti} dipendenti`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {activation.steps.map(s => (
              <div key={s.key} title={s.label} style={{
                flex: 1, height: 6, borderRadius: 3,
                background: s.done ? COLORS.ok : COLORS.border,
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
            {activation.steps.map(s => (
              <span key={s.key} style={{
                padding: '2px 8px', borderRadius: 99,
                background: s.done ? COLORS.okBg : COLORS.bg || '#F8FAFC',
                color: s.done ? COLORS.ok : COLORS.textMute,
                fontWeight: s.done ? 600 : 400,
                border: `1px solid ${s.done ? COLORS.ok : COLORS.border}`,
              }}>
                {s.done ? '✓' : '○'} {s.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Azioni rapide */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <Btn kind="warn" size="sm" onClick={() => onAzione('impersona')}>🔑 Impersona</Btn>
        <Btn kind="neutral" size="sm" onClick={() => onAzione('email')}>📧 Email</Btn>
        <Btn kind="success" size="sm" onClick={() => onAzione('regala')}>🎁 Regala mesi</Btn>
        <Btn kind="neutral" size="sm" onClick={() => onAzione('reset_password')}>🔁 Reset password</Btn>
      </div>

      {/* Note CRM (autosave 1.5s) */}
      <section style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: COLORS.text }}>
            📝 Note interne (solo admin)
          </h3>
          <span style={{ fontSize: 10, color:
            notaStatus === 'saving' ? COLORS.textMute :
            notaStatus === 'saved' ? COLORS.ok :
            notaStatus === 'error' ? COLORS.err : COLORS.textMute,
            fontWeight: 600,
          }}>
            {notaStatus === 'dirty'  && '○ modifiche non salvate'}
            {notaStatus === 'saving' && '⏳ salvataggio…'}
            {notaStatus === 'saved'  && '✓ salvato'}
            {notaStatus === 'error'  && '⚠ errore salvataggio'}
          </span>
        </div>
        <textarea
          value={nota}
          onChange={e => { setNota(e.target.value); setNotaStatus('dirty') }}
          placeholder="Appunti, contesto conversazioni, decisioni in sospeso… Visibili solo a te."
          rows={3}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8,
            border: `1px solid ${COLORS.border}`, fontSize: 12,
            resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
            background: '#FFFEF7',
          }}
        />
      </section>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMute }}>Caricamento dettaglio…</div>
      ) : (
        <>
          {/* Sedi */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: COLORS.text }}>
              🏢 Sedi ({sedi.length})
            </h3>
            {sedi.length === 0 ? (
              <div style={{ fontSize: 12, color: COLORS.textMute }}>Nessuna sede registrata</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sedi.map(s => (
                  <span key={s.id} style={{
                    padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                    background: s.attiva ? COLORS.okBg : COLORS.blockedBg,
                    color: s.attiva ? COLORS.ok : COLORS.blocked,
                    border: `1px solid ${s.attiva ? COLORS.ok : COLORS.border}`,
                  }}>
                    {s.is_default && '★ '}{s.nome}{!s.attiva && ' (inattiva)'}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Uso per area */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: COLORS.text }}>
              📊 Uso per area
            </h3>
            {usage.length === 0 ? (
              <div style={{ fontSize: 12, color: COLORS.textMute, padding: '12px 0' }}>
                Nessun dato salvato — il cliente non ha mai inserito nulla.
              </div>
            ) : (
              <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: COLORS.rowAlt }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Area</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Record</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sedi</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ultimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...usageOperativo, ...usageAltro].map((u, i) => {
                      const d = giorniDa(u.ultimo)
                      const fresca = d != null && d <= 7
                      return (
                        <tr key={u.data_key} style={{
                          borderTop: i === 0 ? 'none' : `1px solid ${COLORS.border}`,
                          background: COLORS.card,
                        }}>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{ fontWeight: 600, color: COLORS.text }}>
                              {LABEL_CHIAVE[u.data_key] || u.data_key}
                            </span>
                            {CHIAVI_OPERATIVE_SET.has(u.data_key) && (
                              <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: COLORS.blueBg, color: COLORS.blue, fontWeight: 700, textTransform: 'uppercase' }}>op</span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: COLORS.textSoft, fontWeight: 600 }}>{u.conteggio}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: COLORS.textMute }}>{u.n_sedi || '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: fresca ? COLORS.ok : COLORS.textMute, whiteSpace: 'nowrap', fontWeight: fresca ? 600 : 400 }}>
                            {u.ultimo ? fmtDataOra(u.ultimo) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Eventi recenti */}
          <section>
            <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: COLORS.text }}>
              🕒 Eventi recenti ({eventi.length})
            </h3>
            {eventi.length === 0 ? (
              <div style={{ fontSize: 12, color: COLORS.textMute, padding: '12px 0' }}>
                Nessun evento registrato per questo cliente.
              </div>
            ) : (
              <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {eventi.map((e, i) => (
                      <tr key={e.id} style={{
                        borderTop: i === 0 ? 'none' : `1px solid ${COLORS.border}`,
                        background: COLORS.card,
                      }}>
                        <td style={{ padding: '6px 10px', color: COLORS.textMute, whiteSpace: 'nowrap', width: 130 }}>
                          {fmtDataOra(e.when)}
                        </td>
                        <td style={{ padding: '6px 10px', color: COLORS.textSoft, fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.user_email || ''}>
                          {e.user_email || '—'}
                          {e.ruolo === 'dipendente' && <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', borderRadius: 3, background: COLORS.warnBg, color: COLORS.warn, fontWeight: 700 }}>dip</span>}
                        </td>
                        <td style={{ padding: '6px 10px', color: COLORS.text }}>
                          {e.label || `${e.table_name} · ${e.operation}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <Btn kind="neutral" onClick={onClose}>Chiudi</Btn>
      </div>
    </Modal>
  )
}

// ─── Componente principale ─────────────────────────────────────────────────
export default function AdminPage() {
  const toast = useToast()
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
  const [regalaFor, setRegalaFor] = useState(null) // cliente target del regalo mesi
  const [codici, setCodici] = useState([])
  const [codiciLoading, setCodiciLoading] = useState(false)
  const [showNuovoCodice, setShowNuovoCodice] = useState(false)
  const [pricing, setPricing] = useState([])
  const [pricingLoading, setPricingLoading] = useState(false)
  const [priceDraft, setPriceDraft] = useState(null) // { plan, euro, stripe_price_id }
  const [priceConfirm, setPriceConfirm] = useState(false)
  const [priceSaving, setPriceSaving] = useState(false)
  const [dettaglioFor, setDettaglioFor] = useState(null)  // cliente target del dettaglio
  const [dettaglio, setDettaglio] = useState(null)
  const [dettaglioLoading, setDettaglioLoading] = useState(false)
  // Tier 1: feedback inbox + banner globali
  const [feedback, setFeedback] = useState([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackSoloDaGestire, setFeedbackSoloDaGestire] = useState(true)
  const [banners, setBanners] = useState([])
  const [bannersLoading, setBannersLoading] = useState(false)
  const [nuovoBanner, setNuovoBanner] = useState({ messaggio: '', tipo: 'info', scade_il: '' })
  const [bannerSaving, setBannerSaving] = useState(false)
  // Tier 2: Stripe MRR + events feed + errori produzione + bulk actions
  const [stripeMrr, setStripeMrr] = useState(null)
  const [stripeMrrLoading, setStripeMrrLoading] = useState(false)
  const [stripeEvents, setStripeEvents] = useState([])
  const [stripeEventsLoading, setStripeEventsLoading] = useState(false)
  const [errori, setErrori] = useState([])
  const [erroriLoading, setErroriLoading] = useState(false)
  const [selezionati, setSelezionati] = useState(() => new Set())
  const [bulkEmailFor, setBulkEmailFor] = useState(null) // array di clienti

  // ── Helpers di chiamata API ─────────────────────────────────────────
  // Wrapper apiFetch gestisce gia' auth + retry 401 + redirect a /login se la
  // sessione muore. Qui apiCall e' solo un alias per non cambiare i callsite.
  const apiCall = useCallback((path, opts = {}) => apiFetch(path, opts), [])

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

  const fetchCodici = useCallback(async () => {
    setCodiciLoading(true)
    try {
      const res = await apiCall('/api/admin?action=codici_sconto')
      const data = await res.json()
      setCodici(data.codici || [])
    } catch (err) {
      // non bloccare la pagina
      console.error('codici sconto:', err.message)
    } finally {
      setCodiciLoading(false)
    }
  }, [apiCall])

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true)
    try {
      const res = await apiCall('/api/admin?action=plan_pricing')
      const data = await res.json()
      setPricing(data.piani || [])
    } catch (err) {
      console.error('plan pricing:', err.message)
    } finally {
      setPricingLoading(false)
    }
  }, [apiCall])

  // Salvataggio prezzo piano con conferma esplicita (guard anti-errore: 2 step).
  const salvaPrezzo = useCallback(async () => {
    if (!priceDraft) return
    const cents = Math.round(parseFloat(String(priceDraft.euro).replace(',', '.')) * 100)
    if (!Number.isFinite(cents) || cents < 0) { toast.error('Prezzo non valido'); return }
    setPriceSaving(true)
    try {
      await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({
          tipo: 'set_plan_pricing',
          plan: priceDraft.plan,
          prezzo_mese_cents: cents,
          stripe_price_id: priceDraft.stripe_price_id || '',
        }),
      })
      setPriceDraft(null); setPriceConfirm(false)
      await fetchPricing()
    } catch (err) {
      toast.error('Errore: ' + err.message)
    } finally {
      setPriceSaving(false)
    }
  }, [priceDraft, apiCall, fetchPricing])

  // Tier 1: fetch feedback + banner
  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true)
    try {
      const q = feedbackSoloDaGestire ? '&solo_da_gestire=1' : ''
      const res = await apiCall(`/api/admin?action=feedback${q}`)
      const data = await res.json()
      setFeedback(data.feedback || [])
    } catch (err) {
      console.error('feedback:', err.message)
    } finally {
      setFeedbackLoading(false)
    }
  }, [apiCall, feedbackSoloDaGestire])

  const fetchBanners = useCallback(async () => {
    setBannersLoading(true)
    try {
      const res = await apiCall('/api/admin?action=banners')
      const data = await res.json()
      setBanners(data.banners || [])
    } catch (err) {
      console.error('banners:', err.message)
    } finally {
      setBannersLoading(false)
    }
  }, [apiCall])

  // Tier 2 fetches: Stripe MRR + events + errori produzione
  const fetchStripeMrr = useCallback(async () => {
    setStripeMrrLoading(true)
    try {
      const res = await apiCall('/api/admin?action=stripe_mrr')
      const data = await res.json()
      setStripeMrr(data)
    } catch (err) {
      console.error('stripe mrr:', err.message)
      setStripeMrr({ error: err.message })
    } finally {
      setStripeMrrLoading(false)
    }
  }, [apiCall])

  const fetchStripeEvents = useCallback(async () => {
    setStripeEventsLoading(true)
    try {
      const res = await apiCall('/api/admin?action=stripe_events')
      const data = await res.json()
      setStripeEvents(data.events || [])
    } catch (err) {
      console.error('stripe events:', err.message)
    } finally {
      setStripeEventsLoading(false)
    }
  }, [apiCall])

  const fetchErrori = useCallback(async () => {
    setErroriLoading(true)
    try {
      const res = await apiCall('/api/admin?action=errori_recenti&limit=100')
      const data = await res.json()
      setErrori(data.errori || [])
    } catch (err) {
      console.error('errori:', err.message)
    } finally {
      setErroriLoading(false)
    }
  }, [apiCall])

  useEffect(() => { fetchData(); fetchAudit(); fetchCodici(); fetchPricing(); fetchBanners() },
    [fetchData, fetchAudit, fetchCodici, fetchPricing, fetchBanners])
  useEffect(() => { fetchFeedback() }, [fetchFeedback])
  // Stripe MRR + events: caricamento on-demand (1 sola volta all'apertura
  // pannello, refresh manuale). Stripe API ha rate limit 100/s ma chiamate
  // ripetute hanno costo, meglio non spammare.
  useEffect(() => { fetchStripeMrr(); fetchStripeEvents(); fetchErrori() },
    [fetchStripeMrr, fetchStripeEvents, fetchErrori])

  // Salva nota CRM (chiamata dalla modale dettaglio).
  const salvaNoteAdmin = useCallback(async (orgId, nota) => {
    await apiCall('/api/admin', {
      method: 'POST',
      body: JSON.stringify({ orgId, tipo: 'salva_note_admin', nota }),
    })
    // Aggiorna anche la cache del dettaglio in memoria (la prossima riapertura riprende dal DB).
    setDettaglio(d => d ? { ...d, org: { ...(d.org || {}), note_admin: nota } } : d)
  }, [apiCall])

  // Crea banner (severity = info/warn/critical/success).
  const creaBanner = useCallback(async () => {
    if (!nuovoBanner.messaggio.trim()) return
    setBannerSaving(true)
    try {
      await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({
          tipo: 'banner_crea',
          messaggio: nuovoBanner.messaggio,
          severity: nuovoBanner.tipo,
          scade_il: nuovoBanner.scade_il || null,
        }),
      })
      setNuovoBanner({ messaggio: '', tipo: 'info', scade_il: '' })
      await fetchBanners()
    } catch (err) {
      toast.error('Errore creazione banner: ' + err.message)
    } finally {
      setBannerSaving(false)
    }
  }, [nuovoBanner, apiCall, fetchBanners])

  const apriDettaglio = useCallback(async c => {
    setDettaglioFor(c)
    setDettaglio(null)
    setDettaglioLoading(true)
    try {
      const res = await apiCall(`/api/admin?action=cliente_dettaglio&org_id=${encodeURIComponent(c.org_id)}`)
      const data = await res.json()
      setDettaglio(data)
    } catch (err) {
      toast.error(`Errore caricamento dettaglio: ${err.message}`)
      setDettaglioFor(null)
    } finally {
      setDettaglioLoading(false)
    }
  }, [apiCall])

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
      toast.error(`Errore: ${err.message}`)
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
      toast.error(`Errore: ${err.message}`)
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
      toast.error(`Errore export: ${err.message}`)
    }
  }

  async function handleEmailTrialScadenza() {
    const target = clienti.filter(c => {
      if (c.org_approvata || c.attivo === false) return false
      const g = giorniRimanenti(c)
      return g != null && g > 0 && g <= 7
    })
    if (target.length === 0) { toast.info('Nessun trial in scadenza nei prossimi 7 giorni'); return }
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
    if (ko === 0) toast.success(`Email inviate: ${ok}`)
    else toast.warn(`Email inviate: ${ok} ok · ${ko} errori`)
  }

  // ── Bulk actions sulla tabella clienti ──────────────────────────────
  const toggleSelezione = useCallback(orgId => {
    setSelezionati(prev => {
      const s = new Set(prev)
      if (s.has(orgId)) s.delete(orgId)
      else s.add(orgId)
      return s
    })
  }, [])

  async function bulkEstendiTrial() {
    if (selezionati.size === 0) return
    const giorni = prompt(`Estendi trial di quanti giorni a ${selezionati.size} clienti selezionati?`, '30')
    if (!giorni) return
    const n = parseInt(giorni, 10)
    if (!Number.isFinite(n) || n < 1) { toast.error('Giorni non validi'); return }
    if (!confirm(`Confermi: estendere il trial di ${n}gg a ${selezionati.size} clienti?`)) return
    let ok = 0, ko = 0
    for (const orgId of selezionati) {
      try { await azione(orgId, 'estendi_trial', { valore: n }); ok++ }
      catch { ko++ }
    }
    setSelezionati(new Set())
    if (ko === 0) toast.success(`Trial esteso a ${ok} clienti`)
    else toast.warn(`Trial esteso: ${ok} ok · ${ko} errori`)
  }

  function bulkExportCsv() {
    if (selezionati.size === 0) return
    const sel = clienti.filter(c => selezionati.has(c.org_id))
    const header = 'Nome attivita,Tipo,Email,Nome completo,Piano,Stato,Sedi,Record,Registrata,Ultimo accesso,Trial scade'
    const rows = sel.map(c => {
      const stato = !c.attivo ? 'Bloccato'
        : c.org_approvata ? 'Pagante'
        : (c.trial_ends_at && new Date(c.trial_ends_at) > new Date()) ? 'Trial' : 'Scaduto'
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
      return [
        q(c.nome_attivita), q(c.tipo), q(c.email), q(c.nome_completo),
        q(c.piano), q(stato), c.num_sedi || 0, c.num_record || 0,
        q(c.registrata_il || ''), q(c.ultimo_accesso || ''), q(c.trial_ends_at || ''),
      ].join(',')
    })
    const csv = '﻿' + [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clienti_selezionati_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
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

        {/* ── Stripe MRR reale ───────────────────────────────────── */}
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
              💳 MRR reale (Stripe)
              <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMute, marginLeft: 10 }}>
                calcolato dalle subscription Stripe, non da paganti × prezzo
              </span>
            </h3>
            <Btn kind="neutral" size="sm" onClick={fetchStripeMrr} disabled={stripeMrrLoading}>{stripeMrrLoading ? '…' : '🔄'}</Btn>
          </div>
          {stripeMrrLoading && !stripeMrr ? (
            <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>Caricamento da Stripe…</div>
          ) : stripeMrr?.unavailable ? (
            <div style={{ padding: '10px 14px', background: COLORS.warnBg, border: `1px solid ${COLORS.warn}`, borderRadius: 8, color: COLORS.warn, fontSize: 12 }}>
              ⏸ Stripe non disponibile: {stripeMrr.reason || 'configurazione mancante'}
              <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
                Pre-revenue: aspettato. Configura <code>STRIPE_SECRET_KEY</code> su Vercel quando passi a Stripe live.
              </div>
            </div>
          ) : stripeMrr?.error ? (
            <div style={{ padding: '10px 14px', background: COLORS.errBg, border: `1px solid ${COLORS.err}`, borderRadius: 8, color: COLORS.err, fontSize: 12 }}>
              ⚠️ Errore Stripe: {stripeMrr.error}
            </div>
          ) : stripeMrr ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              <div style={{ padding: '10px 12px', background: COLORS.okBg, borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.ok, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>MRR fatturato</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.ok }}>{fmtEuro((stripeMrr.mrr_cents || 0) / 100)}</div>
                <div style={{ fontSize: 10, color: COLORS.ok, opacity: 0.8 }}>{stripeMrr.sub_active} sub active</div>
              </div>
              <div style={{ padding: '10px 12px', background: COLORS.warnBg, borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.warn, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>MRR in trial</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.warn }}>{fmtEuro((stripeMrr.mrr_trialing_cents || 0) / 100)}</div>
                <div style={{ fontSize: 10, color: COLORS.warn, opacity: 0.8 }}>{stripeMrr.sub_trialing} sub trialing</div>
              </div>
              <div style={{ padding: '10px 12px', background: COLORS.errBg, borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.err, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Past due</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.err }}>{stripeMrr.sub_past_due}</div>
                <div style={{ fontSize: 10, color: COLORS.err, opacity: 0.8 }}>sub in arretrato</div>
              </div>
              <div style={{ padding: '10px 12px', background: COLORS.errBg, borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.err, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Charge falliti 30gg</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.err }}>{stripeMrr.failed_30d}</div>
                <div style={{ fontSize: 10, color: COLORS.err, opacity: 0.8 }}>da retrying / dunning</div>
              </div>
              <div style={{ padding: '10px 12px', background: COLORS.blockedBg, borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.blocked, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Canceled</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.blocked }}>{stripeMrr.sub_canceled}</div>
                <div style={{ fontSize: 10, color: COLORS.blocked, opacity: 0.8 }}>sub annullate</div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>Nessun dato Stripe</div>
          )}
        </Card>

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

          {/* Bulk action bar (appare quando >=1 selezione) */}
          {selezionati.size > 0 && (
            <div style={{
              padding: '10px 18px',
              background: COLORS.blueBg,
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <strong style={{ fontSize: 13, color: COLORS.blue }}>
                {selezionati.size} selezionat{selezionati.size === 1 ? 'o' : 'i'}
              </strong>
              <span style={{ flex: 1 }} />
              <Btn kind="primary" size="sm" onClick={() => setBulkEmailFor(clienti.filter(c => selezionati.has(c.org_id)))}>
                📧 Email
              </Btn>
              <Btn kind="neutral" size="sm" onClick={bulkEstendiTrial}>
                ⏱ Estendi trial
              </Btn>
              <Btn kind="neutral" size="sm" onClick={bulkExportCsv}>
                📊 Export CSV
              </Btn>
              <Btn kind="ghost" size="sm" onClick={() => setSelezionati(new Set())}>
                ✕ Deseleziona
              </Btn>
            </div>
          )}

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
                    <th style={{ ...th(), width: 32, paddingRight: 0 }}>
                      <input
                        type="checkbox"
                        aria-label="Seleziona tutti i clienti visibili"
                        title="Seleziona tutti i visibili"
                        checked={clientiVisibili.length > 0 && clientiVisibili.every(c => selezionati.has(c.org_id))}
                        ref={el => { if (el) el.indeterminate = clientiVisibili.some(c => selezionati.has(c.org_id)) && !clientiVisibili.every(c => selezionati.has(c.org_id)) }}
                        onChange={e => {
                          if (e.target.checked) setSelezionati(new Set(clientiVisibili.map(c => c.org_id)))
                          else setSelezionati(new Set())
                        }}
                      />
                    </th>
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
                        <td style={{ ...td(), width: 32, paddingRight: 0 }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Seleziona ${c.nome_attivita}`}
                            checked={selezionati.has(c.org_id)}
                            onChange={() => toggleSelezione(c.org_id)}
                          />
                        </td>
                        <td style={{ ...td(), cursor: 'pointer' }} onClick={() => apriDettaglio(c)} title="Apri dettaglio cliente">
                          <div style={{ fontWeight: 700, color: COLORS.accent, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                            {c.nome_attivita || '—'}
                          </div>
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
                            <Btn kind="success" size="sm" onClick={() => setRegalaFor(c)} title="Regala mesi gratis">
                              🎁
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

        {/* ── Prezzi piani ─────────────────────────────────────────── */}
        <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 14 }}>💶 Prezzi piani</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>display landing + pannello abbonamento · checkout</span>
            </div>
            <Btn kind="neutral" size="sm" onClick={fetchPricing} disabled={pricingLoading}>{pricingLoading ? '…' : '🔄'}</Btn>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: COLORS.textMute, marginBottom: 12, lineHeight: 1.5 }}>
              Modifica il prezzo mostrato. Per cambiare l'importo <b>realmente addebitato</b>, crea un nuovo Price su Stripe
              e incolla qui il suo ID (<code>price_…</code>): il checkout userà quello. Ogni modifica richiede una conferma esplicita.
            </div>
            {['pro', 'chain'].map(plan => {
              const row = pricing.find(p => p.plan === plan) || { plan, prezzo_mese_cents: plan === 'pro' ? 8900 : 14900, stripe_price_id: null }
              const inEdit = priceDraft?.plan === plan
              const euroAttuale = (row.prezzo_mese_cents / 100).toFixed(2)
              return (
                <div key={plan} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10, background: inEdit ? '#FFFBEB' : COLORS.card }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontSize: 13, textTransform: 'capitalize' }}>{plan}</strong>
                      <span style={{ marginLeft: 10, fontSize: 18, fontWeight: 800, color: COLORS.accent }}>€{euroAttuale}</span>
                      <span style={{ fontSize: 11, color: COLORS.textMute }}>/mese</span>
                      <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                        Stripe price: <code>{row.stripe_price_id || '— (usa env)'}</code>
                      </div>
                    </div>
                    {!inEdit && (
                      <Btn kind="neutral" size="sm" onClick={() => { setPriceDraft({ plan, euro: euroAttuale, stripe_price_id: row.stripe_price_id || '' }); setPriceConfirm(false) }}>
                        ✏️ Modifica
                      </Btn>
                    )}
                  </div>
                  {inEdit && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 11, color: COLORS.textSoft }}>
                          Prezzo €/mese
                          <input type="number" min="0" step="0.01" value={priceDraft.euro}
                            onChange={e => { setPriceDraft(d => ({ ...d, euro: e.target.value })); setPriceConfirm(false) }}
                            style={{ display: 'block', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, width: 120 }} />
                        </label>
                        <label style={{ fontSize: 11, color: COLORS.textSoft, flex: 1, minWidth: 200 }}>
                          Stripe price ID (opzionale)
                          <input type="text" value={priceDraft.stripe_price_id} placeholder="price_..."
                            onChange={e => { setPriceDraft(d => ({ ...d, stripe_price_id: e.target.value })); setPriceConfirm(false) }}
                            style={{ display: 'block', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13, fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }} />
                        </label>
                      </div>
                      {!priceConfirm ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Btn kind="primary" size="sm" onClick={() => setPriceConfirm(true)}>Salva…</Btn>
                          <Btn kind="neutral" size="sm" onClick={() => { setPriceDraft(null); setPriceConfirm(false) }}>Annulla</Btn>
                        </div>
                      ) : (
                        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 8 }}>
                            Confermi il prezzo del piano <b>{plan}</b>: <b>€{euroAttuale}</b> → <b>€{(parseFloat(String(priceDraft.euro).replace(',', '.')) || 0).toFixed(2)}</b>/mese?
                            {priceDraft.stripe_price_id && <> Il checkout userà <code>{priceDraft.stripe_price_id}</code>.</>}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Btn kind="primary" size="sm" onClick={salvaPrezzo} disabled={priceSaving}>{priceSaving ? 'Salvataggio…' : '✓ Conferma e salva'}</Btn>
                            <Btn kind="neutral" size="sm" onClick={() => setPriceConfirm(false)}>← Indietro</Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        {/* ── Codici sconto ────────────────────────────────────────── */}
        <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 14 }}>🎟 Codici sconto</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>
                {codici.length} codici · {codici.filter(c => c.attivo).length} attivi · {codici.reduce((s, c) => s + (c.redemptions || 0), 0)} utilizzi totali
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn kind="neutral" size="sm" onClick={fetchCodici} disabled={codiciLoading}>
                {codiciLoading ? '…' : '🔄'}
              </Btn>
              <Btn kind="primary" size="sm" onClick={() => setShowNuovoCodice(true)}>
                + Nuovo codice
              </Btn>
            </div>
          </div>
          {codici.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              Nessun codice sconto creato. Crea il primo per regalare o scontare abbonamenti.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: COLORS.rowAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                    <th style={th()}>Codice</th>
                    <th style={th()}>Sconto</th>
                    <th style={th()}>Durata</th>
                    <th style={th()}>Utilizzi</th>
                    <th style={th()}>Scade</th>
                    <th style={th()}>Stato</th>
                    <th style={th()}>Descrizione</th>
                    <th style={th()}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {codici.map((c, i) => {
                    const usato = c.redemptions || 0
                    const limiteRaggiunto = c.max_redemptions && usato >= c.max_redemptions
                    const scaduto = c.scade_il && new Date(c.scade_il) < new Date()
                    return (
                      <tr key={c.id} style={{ background: i % 2 === 0 ? COLORS.card : COLORS.rowAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                        <td style={td()}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 800, color: COLORS.text, letterSpacing: '0.04em' }}>{c.codice}</div>
                          {c.piani_validi && (
                            <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                              Solo: {c.piani_validi.join(', ')}
                            </div>
                          )}
                        </td>
                        <td style={td()}>
                          <span style={{ fontWeight: 700, color: c.valore_sconto === 100 && c.tipo_sconto === 'percent' ? '#059669' : COLORS.accent }}>
                            {c.tipo_sconto === 'percent' ? `-${c.valore_sconto}%` : `-€${(c.valore_sconto / 100).toFixed(2)}`}
                          </span>
                          {c.valore_sconto === 100 && c.tipo_sconto === 'percent' && (
                            <div style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>🎁 Gratis</div>
                          )}
                        </td>
                        <td style={{ ...td(), color: COLORS.textSoft }}>
                          {c.durata === 'once' ? '1ª fattura'
                            : c.durata === 'forever' ? 'Sempre'
                            : `${c.durata_mesi} mesi`}
                        </td>
                        <td style={{ ...td(), textAlign: 'center', color: COLORS.textSoft, fontWeight: 600 }}>
                          {usato}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''}
                        </td>
                        <td style={{ ...td(), color: COLORS.textSoft, whiteSpace: 'nowrap' }}>
                          {c.scade_il ? fmtData(c.scade_il) : '—'}
                        </td>
                        <td style={td()}>
                          {!c.attivo ? <StatoBadge stato="bloccato" />
                            : scaduto ? <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Scaduto</span>
                            : limiteRaggiunto ? <span style={{ background: '#FEF3C7', color: '#92400E', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Esaurito</span>
                            : <span style={{ background: COLORS.okBg, color: COLORS.ok, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Attivo</span>}
                        </td>
                        <td style={{ ...td(), color: COLORS.textSoft, fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.descrizione || ''}>
                          {c.descrizione || '—'}
                        </td>
                        <td style={td()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Btn kind="neutral" size="sm" onClick={() => { navigator.clipboard.writeText(c.codice).catch(() => {}) }} title="Copia codice">
                              📋
                            </Btn>
                            {c.attivo && (
                              <Btn kind="warn" size="sm"
                                onClick={async () => {
                                  if (!confirm(`Disattivare il codice ${c.codice}? Non potrà più essere usato (ma le subscription già scontate restano).`)) return
                                  try {
                                    await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ tipo: 'disattiva_codice_sconto', id: c.id }) })
                                    fetchCodici()
                                  } catch (e) { toast.error(e.message) }
                                }}
                                title="Disattiva">
                                ⏸
                              </Btn>
                            )}
                            <Btn kind="danger" size="sm"
                              onClick={async () => {
                                if (!confirm(`Eliminare definitivamente il codice ${c.codice}?\n${usato > 0 ? '⚠️ Ha già ' + usato + ' utilizzi.' : ''}`)) return
                                try {
                                  await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ tipo: 'elimina_codice_sconto', id: c.id }) })
                                  fetchCodici()
                                } catch (e) { toast.error(e.message) }
                              }}
                              title="Elimina">
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

        {/* ── Stripe events feed ─────────────────────────────────── */}
        <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 14 }}>🔔 Eventi Stripe recenti</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>{stripeEvents.length} eventi · subscription, charge, invoice, checkout</span>
            </div>
            <Btn kind="neutral" size="sm" onClick={fetchStripeEvents} disabled={stripeEventsLoading}>{stripeEventsLoading ? '…' : '🔄'}</Btn>
          </div>
          {stripeEvents.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              {stripeEventsLoading ? 'Caricamento…' : 'Nessun evento Stripe recente'}
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {stripeEvents.map(e => {
                    const typeColor = e.type.includes('failed') || e.type.includes('deleted') ? COLORS.err
                      : e.type.includes('succeeded') || e.type.includes('completed') || e.type.includes('created') ? COLORS.ok
                      : e.type.includes('updated') || e.type.includes('trial') ? COLORS.warn
                      : COLORS.textSoft
                    return (
                      <tr key={e.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                        <td style={{ padding: '8px 18px', color: COLORS.textMute, whiteSpace: 'nowrap', width: 140 }}>
                          {fmtDataOra(new Date(e.created).toISOString())}
                        </td>
                        <td style={{ padding: '8px 0', color: typeColor, fontWeight: 600, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, whiteSpace: 'nowrap' }}>
                          {e.type}
                          {!e.livemode && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 3, background: COLORS.warnBg, color: COLORS.warn, fontWeight: 700, textTransform: 'uppercase' }}>test</span>}
                        </td>
                        <td style={{ padding: '8px 12px', color: COLORS.textSoft, fontSize: 11 }}>
                          {e.customer_email || (e.customer_id ? <code>{e.customer_id.slice(0, 16)}…</code> : '—')}
                        </td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {e.amount_cents != null ? `${(e.amount_cents / 100).toFixed(2)} ${(e.currency || 'EUR').toUpperCase()}` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Feedback inbox ─────────────────────────────────────── */}
        <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 14 }}>📨 Feedback dai clienti</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>
                {feedback.length}{feedbackSoloDaGestire ? ' da gestire' : ' totali'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: COLORS.textSoft, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={feedbackSoloDaGestire} onChange={e => setFeedbackSoloDaGestire(e.target.checked)} />
                Solo da gestire
              </label>
              <Btn kind="neutral" size="sm" onClick={fetchFeedback} disabled={feedbackLoading}>{feedbackLoading ? '…' : '🔄'}</Btn>
            </div>
          </div>
          {feedback.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              {feedbackSoloDaGestire ? 'Nessun feedback da gestire 🎉' : 'Nessun feedback ricevuto ancora'}
            </div>
          ) : (
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {feedback.map(f => {
                const sentMap = {
                  bug:         { bg: COLORS.errBg,  fg: COLORS.err,  lbl: '🐛 Bug' },
                  feature:     { bg: COLORS.blueBg, fg: COLORS.blue, lbl: '💡 Idea' },
                  feedback:    { bg: COLORS.rowAlt, fg: COLORS.textSoft, lbl: '💬 Feedback' },
                  complimento: { bg: COLORS.okBg,   fg: COLORS.ok,   lbl: '🎉 Complimento' },
                }
                const s = sentMap[f.sentiment] || sentMap.feedback
                return (
                  <div key={f.id} style={{
                    padding: '12px 18px',
                    borderBottom: `1px solid ${COLORS.border}`,
                    background: f.gestito ? COLORS.rowAlt : COLORS.card,
                    opacity: f.gestito ? 0.7 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ background: s.bg, color: s.fg, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{s.lbl}</span>
                      <strong style={{ fontSize: 13, color: COLORS.text }}>{f.nome_attivita || '—'}</strong>
                      <span style={{ fontSize: 11, color: COLORS.textMute }}>·</span>
                      <span style={{ fontSize: 11, color: COLORS.textSoft }}>{f.user_email}</span>
                      {f.ruolo === 'dipendente' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: COLORS.warnBg, color: COLORS.warn, fontWeight: 700, textTransform: 'uppercase' }}>dip</span>}
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 11, color: COLORS.textMute }}>{fmtDataOra(f.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: COLORS.text, whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 8 }}>
                      {f.messaggio}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: COLORS.textMute }}>
                      {f.view_corrente && <span>📍 {f.view_corrente}</span>}
                      {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ color: COLORS.accent, textDecoration: 'none' }}>🔗 apri pagina</a>}
                      <span style={{ flex: 1 }} />
                      {f.gestito ? (
                        <>
                          <span style={{ color: COLORS.ok, fontWeight: 600 }}>✓ Gestito da {f.gestito_by} il {fmtData(f.gestito_at)}</span>
                          <Btn kind="ghost" size="sm" onClick={async () => {
                            try {
                              await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ tipo: 'feedback_marca_gestito', id: f.id, gestito: false }) })
                              fetchFeedback()
                            } catch (e) { toast.error(e.message) }
                          }}>↩ Riapri</Btn>
                        </>
                      ) : (
                        <Btn kind="success" size="sm" onClick={async () => {
                          try {
                            await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ tipo: 'feedback_marca_gestito', id: f.id, gestito: true }) })
                            fetchFeedback()
                          } catch (e) { toast.error(e.message) }
                        }}>✓ Segna gestito</Btn>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* ── Banner globali ─────────────────────────────────────── */}
        <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 14 }}>📢 Banner globali</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>annuncio mostrato a tutti i clienti in cima all'app</span>
            </div>
            <Btn kind="neutral" size="sm" onClick={fetchBanners} disabled={bannersLoading}>{bannersLoading ? '…' : '🔄'}</Btn>
          </div>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, background: COLORS.rowAlt }}>
            <div style={{ fontSize: 11, color: COLORS.textMute, marginBottom: 8 }}>Nuovo banner</div>
            <textarea
              value={nuovoBanner.messaggio}
              onChange={e => setNuovoBanner(b => ({ ...b, messaggio: e.target.value }))}
              placeholder="Es. Sabato dalle 22 manutenzione programmata, possibili disservizi di ~10 minuti."
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${COLORS.border}`, fontSize: 13,
                resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8,
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={nuovoBanner.tipo} onChange={e => setNuovoBanner(b => ({ ...b, tipo: e.target.value }))}
                style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12, background: '#FFF' }}>
                <option value="info">ℹ️ info</option>
                <option value="warn">⚠️ warn</option>
                <option value="critical">🚨 critical</option>
                <option value="success">✅ success</option>
              </select>
              <input type="datetime-local" value={nuovoBanner.scade_il}
                onChange={e => setNuovoBanner(b => ({ ...b, scade_il: e.target.value }))}
                style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12 }}
                title="Scadenza (opzionale)" />
              <span style={{ fontSize: 10, color: COLORS.textMute }}>scadenza opzionale</span>
              <span style={{ flex: 1 }} />
              <Btn kind="primary" size="sm" onClick={creaBanner} disabled={bannerSaving || !nuovoBanner.messaggio.trim()}>
                {bannerSaving ? 'Pubblicazione…' : 'Pubblica'}
              </Btn>
            </div>
          </div>
          {banners.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              Nessun banner pubblicato finora
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {banners.map(b => {
                const scaduto = b.scade_il && new Date(b.scade_il) < new Date()
                const tipoMap = {
                  info: { bg: '#EFF6FF', fg: '#1E3A8A', lbl: 'ℹ️ info' },
                  warn: { bg: '#FEF9C3', fg: '#854D0E', lbl: '⚠️ warn' },
                  critical: { bg: '#FEE2E2', fg: '#991B1B', lbl: '🚨 critical' },
                  success: { bg: '#DCFCE7', fg: '#166534', lbl: '✅ success' },
                }
                const t = tipoMap[b.tipo] || tipoMap.info
                return (
                  <div key={b.id} style={{
                    padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`,
                    background: b.attivo && !scaduto ? COLORS.card : COLORS.rowAlt,
                    opacity: !b.attivo || scaduto ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ background: t.bg, color: t.fg, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{t.lbl}</span>
                      {b.attivo && !scaduto && <span style={{ background: COLORS.okBg, color: COLORS.ok, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>● live</span>}
                      {!b.attivo && <span style={{ background: COLORS.blockedBg, color: COLORS.blocked, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>spento</span>}
                      {scaduto && <span style={{ background: COLORS.errBg, color: COLORS.err, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>scaduto</span>}
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 11, color: COLORS.textMute }}>{fmtDataOra(b.creato_il)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 6 }}>{b.messaggio}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {b.scade_il && <span style={{ fontSize: 11, color: COLORS.textMute }}>Scade: {fmtDataOra(b.scade_il)}</span>}
                      <span style={{ flex: 1 }} />
                      {b.attivo && (
                        <Btn kind="warn" size="sm" onClick={async () => {
                          if (!confirm('Disattivare questo banner? Sparirà dall\'app entro 5 minuti.')) return
                          try {
                            await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ tipo: 'banner_disattiva', id: b.id }) })
                            fetchBanners()
                          } catch (e) { toast.error(e.message) }
                        }}>⏸ Disattiva</Btn>
                      )}
                      <Btn kind="danger" size="sm" onClick={async () => {
                        if (!confirm('Eliminare definitivamente?')) return
                        try {
                          await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ tipo: 'banner_elimina', id: b.id }) })
                          fetchBanners()
                        } catch (e) { toast.error(e.message) }
                      }}>🗑</Btn>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

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

        {/* ── Manutenzione: migra integrazioni legacy → encrypted ─────────── */}
        <Card style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>🔐 Migrazione integrazioni → AES-256-GCM</h3>
              <div style={{ fontSize: 11, color: COLORS.textMute, maxWidth: 600 }}>
                Cifra in batch tutte le righe <code>public.integrazioni</code> con <code>encryption_version=0</code> (legacy). Idempotente: ri-eseguire non tocca le righe gia' v=1. Richiede <code>INTEGRATIONS_ENCRYPTION_KEY</code> in Vercel.
              </div>
            </div>
            <Btn kind="warn" size="sm"
              onClick={async () => {
                if (!confirm('Cifrare tutte le integrazioni legacy?\nL\'operazione e\' idempotente.')) return
                try {
                  const res = await apiCall('/api/admin?action=migrate_integrazioni')
                  const data = await res.json()
                  toast.success(`✓ Migrate ${data.migrated}/${data.total} integrazioni — errori: ${data.errors?.length || 0}`)
                  if (data.errors?.length) console.error('migrate errors:', data.errors)
                } catch (e) {
                  toast.error(`Errore migrazione: ${e.message}`)
                }
              }}>
              🔐 Esegui migrazione
            </Btn>
          </div>
        </Card>

        {/* ── Errori produzione (alternativa Sentry, da public.error_log) ── */}
        <Card style={{ marginBottom: 30, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 14 }}>🐛 Errori produzione</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>
                {errori.length} eventi · raccolti via safeError(supabase) da edge functions
              </span>
            </div>
            <Btn kind="neutral" size="sm" onClick={fetchErrori} disabled={erroriLoading}>{erroriLoading ? '…' : '🔄'}</Btn>
          </div>
          {errori.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              {erroriLoading ? 'Caricamento…' : '✅ Nessun errore catturato. Bene così.'}
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {errori.map(e => (
                <div key={e.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, padding: '1px 6px', background: COLORS.rowAlt, borderRadius: 4, color: COLORS.text, fontWeight: 600 }}>
                      {e.endpoint || '—'}{e.operation ? `:${e.operation}` : ''}
                    </span>
                    {e.code && <span style={{ fontSize: 10, padding: '1px 5px', background: COLORS.errBg, color: COLORS.err, borderRadius: 4, fontWeight: 700 }}>{e.code}</span>}
                    {e.status && <span style={{ fontSize: 10, padding: '1px 5px', background: COLORS.warnBg, color: COLORS.warn, borderRadius: 4, fontWeight: 700 }}>{e.status}</span>}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: COLORS.textMute }}>{fmtDataOra(e.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.text, fontFamily: "'JetBrains Mono', ui-monospace, monospace", lineHeight: 1.5, marginBottom: 4 }}>
                    {e.message || '(nessun messaggio)'}
                  </div>
                  {(e.org_id || e.user_id || e.hint) && (
                    <div style={{ fontSize: 10, color: COLORS.textMute, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                      {e.org_id && <>org: {e.org_id.slice(0, 8)}… </>}
                      {e.user_id && <>user: {e.user_id.slice(0, 8)}… </>}
                      {e.hint && <>· hint: {e.hint}</>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

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
      {bulkEmailFor && (
        <BulkEmailModal
          clienti={bulkEmailFor}
          onClose={() => { setBulkEmailFor(null); setSelezionati(new Set()); fetchAudit() }}
          onInvia={async payload => {
            await apiCall('/api/admin', {
              method: 'POST',
              body: JSON.stringify({ tipo: 'invia_email', ...payload }),
            })
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
      {showNuovoCodice && (
        <NuovoCodiceScontoModal
          onClose={() => setShowNuovoCodice(false)}
          onCreato={async body => {
            await apiCall('/api/admin', {
              method: 'POST',
              body: JSON.stringify({ tipo: 'crea_codice_sconto', ...body }),
            })
            fetchCodici(); fetchAudit()
          }}
        />
      )}
      {regalaFor && (
        <RegalaMesiModal
          cliente={regalaFor}
          codici={codici}
          onClose={() => setRegalaFor(null)}
          onRegala={async ({ mesi, codice }) => {
            await apiCall('/api/admin', {
              method: 'POST',
              body: JSON.stringify({ orgId: regalaFor.org_id, tipo: 'regala_mesi', mesi, codice }),
            })
            await fetchData()
            fetchAudit()
            toast.success(`✓ ${mesi} mese/i regalati a ${regalaFor.nome_attivita}`)
          }}
        />
      )}
      {dettaglioFor && (
        <ClienteDettaglioModal
          cliente={dettaglioFor}
          dettaglio={dettaglio}
          loading={dettaglioLoading}
          onClose={() => { setDettaglioFor(null); setDettaglio(null) }}
          onAzione={tipo => {
            const c = dettaglioFor
            setDettaglioFor(null); setDettaglio(null)
            if (tipo === 'impersona') handleImpersona(c)
            else if (tipo === 'email') setEmailFor(c)
            else if (tipo === 'regala') setRegalaFor(c)
            else if (tipo === 'reset_password') handleResetPassword(c)
          }}
          onSalvaNote={nota => salvaNoteAdmin(dettaglioFor.org_id, nota)}
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
              toast.success(`✓ Eliminate ${data.deleted} fatture demo`)
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
