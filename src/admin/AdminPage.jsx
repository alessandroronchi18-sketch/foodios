import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { color as T, radius as R, shadow as S, motion as M, tnum as _tnum, typo } from '../lib/theme'
import { useToast } from '../components/Toast'
import { apiFetch } from '../lib/apiFetch'
import Icon from '../components/Icon'
import PersonalizeDemoModal from './PersonalizeDemoModal'

// ─── Costanti ──────────────────────────────────────────────────────────────
const PIANI = ['trial', 'base', 'pro', 'enterprise']
const PIANO_PREZZO = { trial: 0, base: 39, pro: 89, enterprise: 199 }

// Etichette per le chiavi di user_data - allineate ai label scritti dai trigger
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
const fmtData = iso => iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'
const fmtDataOra = iso => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'
// useGrouping:'always' obbligatorio: senza, "4715" appare senza separatore migliaia
// su Safari iOS private / Node senza ICU full. Vedi _shared.jsx.
const _ADMIN_NF = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const fmtEuro = n => '€' + _ADMIN_NF.format(Number(n || 0))

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
    pagante:   { bg: COLORS.okBg,      fg: COLORS.ok,      icon: 'checkCircle', lbl: 'Pagante' },
    trial:     { bg: COLORS.warnBg,    fg: COLORS.warn,    icon: 'hourglass',   lbl: `Trial${giorni != null ? ` (${giorni}gg)` : ''}` },
    scaduto:   { bg: COLORS.errBg,     fg: COLORS.err,     icon: 'xCircle',     lbl: 'Scaduto' },
    bloccato:  { bg: COLORS.blockedBg, fg: COLORS.blocked, icon: 'lock',        lbl: 'Bloccato' },
  }
  const s = m[stato] || m.scaduto
  return (
    <span style={{
      background: s.bg, color: s.fg, padding: '3px 10px',
      borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}><Icon name={s.icon} size={12} /> {s.lbl}</span>
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

// Audit 2026-07-01 batch 10 Performance: React.memo per KpiCard (rendererizzata
// 12-20 volte nelle grid Overview/Health/Stats; non cambia mai se le props
// stesse non cambiano).
const KpiCard = React.memo(function KpiCard({ label, value, sub, color }) {
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
})

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
    <Modal title={`Email a ${cliente.nome_attivita}`} onClose={onClose} width={580}>
      <div style={{ fontSize: 12, color: COLORS.textMute, marginBottom: 14 }}>
        Destinatario: <strong style={{ color: COLORS.text }}>{cliente.email}</strong>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {tpl(<><Icon name="party" size={12} /> Benvenuto</>,
          'Benvenuto in Foodos!',
          `Ciao ${cliente.nome_completo || ''},\n\ngrazie per aver registrato ${cliente.nome_attivita} su Foodos. Sono qui per aiutarti a iniziare - fammi sapere se hai bisogno di una breve demo o di chiarimenti.\n\nA presto!`)}
        {tpl(<><Icon name="clock" size={12} /> Trial in scadenza</>,
          'La tua prova Foodos sta per scadere',
          `Ciao ${cliente.nome_completo || ''},\n\nho visto che il tuo trial sta per terminare. Vuoi continuare con Foodos? Posso prepararti un'offerta dedicata, fammi sapere.\n\nGrazie,\nAlessandro`)}
        {tpl(<><Icon name="chat" size={12} /> Check-in</>,
          'Come va con Foodos?',
          `Ciao ${cliente.nome_completo || ''},\n\nti scrivo per sapere come ti stai trovando con Foodos. C'è qualche funzione che ti manca o che vorresti migliorata?\n\nIl tuo feedback è importante.\n\nAlessandro`)}
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
        }}><Icon name="warning" size={14} /> {err}</div>
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
    <Modal title={`Email a ${clienti.length} clienti`} onClose={busy ? () => {} : onClose} width={620}>
      {done ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 40 }}>{progress.ko === 0 ? <Icon name="checkCircle" size={40} color={COLORS.ok} /> : <Icon name="warning" size={40} color={COLORS.warn} />}</div>
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
            placeholder={`Ciao {{nome_completo}},\n\nun saluto da Alessandro di Foodos.\nCome vanno le cose con {{nome_attivita}}?\n\nA presto.`}
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
            }}><Icon name="warning" size={14} /> {err}</div>
          )}
          {busy && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: COLORS.blueBg, borderRadius: 8, color: COLORS.blue, fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
              <Icon name="hourglass" size={12} /> Invio in corso… {progress.ok + progress.ko} / {progress.tot} (ok {progress.ok} · errori {progress.ko})
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
    <Modal title={`Elimina ${cliente.nome_attivita}`} onClose={onClose}>
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
        }}><Icon name="warning" size={14} /> {err}</div>
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
    <Modal title={`Pulisci fatture demo · ${cliente.nome_attivita}`} onClose={onClose} width={560}>
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
                    <td style={{ padding: '8px 12px', color: COLORS.textSoft, whiteSpace: 'nowrap' }}>{f.data_fattura || '-'}</td>
                    <td style={{ padding: '8px 12px', color: COLORS.text, fontWeight: 500 }}>{f.fornitore}</td>
                    <td style={{ padding: '8px 12px', color: COLORS.textSoft, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>{f.numero_rif || '-'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: COLORS.text, whiteSpace: 'nowrap' }}>€ {Number(f.totale || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
        }}><Icon name="warning" size={14} /> {err}</div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn kind="neutral" onClick={onClose} disabled={busy}>Annulla</Btn>
        {matches.length > 0 && (
          <Btn kind="danger" onClick={submit} disabled={busy}>
            {busy ? 'Eliminazione…' : <><Icon name="trash" size={13} /> Elimina {matches.length} fatture</>}
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
    <Modal title="Nuovo codice sconto" onClose={onClose} width={620}>
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
              <Icon name="gift" size={12} /> Sconto 100% = abbonamento gratis
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
        <div style={{ padding: '8px 12px', background: '#FEE2E2', border: '1px solid #991B1B', borderRadius: 8, color: '#991B1B', fontSize: 12, marginBottom: 12 }}><Icon name="warning" size={14} /> {err}</div>
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
    <Modal title={`Regala mesi · ${cliente.nome_attivita}`} onClose={onClose} width={500}>
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
          <option value="">- Nessuno (regalo manuale) -</option>
          {(codici || []).filter(c => c.attivo).map(c => (
            <option key={c.id} value={c.codice}>{c.codice} ({c.descrizione || 'senza descrizione'})</option>
          ))}
        </select>
      </div>

      {err && (
        <div style={{ padding: '8px 12px', background: '#FEE2E2', border: '1px solid #991B1B', borderRadius: 8, color: '#991B1B', fontSize: 12, marginBottom: 12 }}><Icon name="warning" size={14} /> {err}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn kind="neutral" onClick={onClose} disabled={busy}>Annulla</Btn>
        <Btn kind="success" onClick={submit} disabled={busy || mesi < 1}>
          {busy ? 'Applicazione…' : <><Icon name="gift" size={13} /> Regala {mesi} mesi</>}
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
    <Modal title={`Link di accesso - ${cliente.nome_attivita}`} onClose={onClose}>
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

function useIsNarrowScreen(maxWidth = 720) {
  const [isNarrow, setIsNarrow] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(max-width:${maxWidth}px)`)
    const upd = () => setIsNarrow(mq.matches)
    upd()
    if (mq.addEventListener) mq.addEventListener('change', upd); else mq.addListener(upd)
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', upd); else mq.removeListener(upd) }
  }, [maxWidth])
  return isNarrow
}

function ClienteDettaglioModal({ cliente, dettaglio, loading, onClose, onAzione, onSalvaNote }) {
  // 900px copre anche iPad portrait (768) e landscape (1024).
  const isNarrow = useIsNarrowScreen(900)
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
    if (d == null) return { bg: COLORS.blockedBg, fg: COLORS.blocked, dot: null, lbl: '- Sconosciuto' }
    if (d <= 2) return { bg: COLORS.okBg, fg: COLORS.ok, dot: '#0E9F6E', lbl: 'Attivo' }
    if (d <= 7) return { bg: COLORS.warnBg, fg: COLORS.warn, dot: '#D97706', lbl: `A rischio (${d}gg)` }
    return { bg: COLORS.errBg, fg: COLORS.err, dot: '#6E0E1A', lbl: `Dormiente (${d}gg)` }
  })()

  const sedi = dettaglio?.sedi || []
  const usage = dettaglio?.usage || []
  const eventi = dettaglio?.eventi || []
  const org = dettaglio?.org || null
  const activation = dettaglio?.activation || null
  const counts = dettaglio?.counts || null
  // Audit 2026-06-19 Customer 360: 7 aree precedentemente invisibili
  const c360 = {
    integrazioni: dettaglio?.integrazioni || null,
    b2b: dettaglio?.b2b || null,
    pos: dettaglio?.pos || null,
    push: dettaglio?.push || null,
    scadenzario: dettaglio?.scadenzario || null,
    costi: dettaglio?.costi || null,
    stipendi: dettaglio?.stipendi || null,
  }
  const has360 = c360.integrazioni || c360.b2b || c360.pos || c360.push || c360.scadenzario || c360.costi || c360.stipendi

  const usageOperativo = usage.filter(u => CHIAVI_OPERATIVE_SET.has(u.data_key))
  const usageAltro = usage.filter(u => !CHIAVI_OPERATIVE_SET.has(u.data_key))

  return (
    <Modal title={`${cliente.nome_attivita}`} onClose={onClose} width={780}>
      {/* Header: stato + KPI in linea. Audit 2026-06-17: collassa su narrow. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: 10,
        padding: '12px 14px', background: COLORS.rowAlt, borderRadius: 10, marginBottom: 16,
      }}>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Stato</div>
          <StatoBadge stato={stato} giorni={giorni} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Salute</div>
          <span style={{ background: healthBadge.bg, color: healthBadge.fg, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{healthBadge.dot && <Icon name="dot" size={9} color={healthBadge.dot} />}{healthBadge.lbl}</span>
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
          <div style={{ fontSize: 12, color: COLORS.text }}>{cliente.ultimo_accesso ? fmtDataOra(cliente.ultimo_accesso) : '-'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Trial scade</div>
          <div style={{ fontSize: 12, color: COLORS.text }}>{cliente.trial_ends_at ? fmtData(cliente.trial_ends_at) : '-'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Stripe</div>
          <div style={{ fontSize: 11, color: COLORS.text }}>
            {org?.stripe_subscription_id
              ? <><b>{org.stripe_status || 'attivo'}</b>{org.stripe_current_period_end ? <> · al {fmtData(org.stripe_current_period_end)}</> : null}</>
              : <span style={{ color: COLORS.textMute }}>- (nessuna sub)</span>}
          </div>
        </div>
      </div>

      {/* Activation: progressione "primo valore" */}
      {activation && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: COLORS.text }}>
              <Icon name="bolt" size={13} /> Activation · {activation.score}/{activation.totale}
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
        <Btn kind="warn" size="sm" onClick={() => onAzione('impersona')}><Icon name="key" size={13} /> Impersona</Btn>
        <Btn kind="neutral" size="sm" onClick={() => onAzione('email')}><Icon name="mail" size={13} /> Email</Btn>
        <Btn kind="success" size="sm" onClick={() => onAzione('regala')}><Icon name="gift" size={13} /> Regala mesi</Btn>
        <Btn kind="neutral" size="sm" onClick={() => onAzione('reset_password')}><Icon name="refresh" size={13} /> Reset password</Btn>
        {/* Audit 2026-06-20: bottone demo data per test scenari realistici */}
        <Btn kind="ghost" size="sm" onClick={() => onAzione('seed_demo_full')} title="Popola questa org con 3 mesi di dati demo generici (per testare tutte le sezioni dell'app)">
          <Icon name="sparkles" size={13} /> Demo generica
        </Btn>
        {/* Audit 2026-06-20: bottone demo personalizzata (pitch-ready) */}
        <Btn kind="warn" size="sm" onClick={() => onAzione('personalize_demo')} title="Pre-pitch: estrai menu reale del cliente da foto/testo e popola la demo con i SUOI prodotti">
          <Icon name="sparkles" size={13} /> 🪄 Demo personalizzata
        </Btn>
      </div>

      {/* Note CRM (autosave 1.5s) */}
      <section style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: COLORS.text }}>
            <Icon name="edit" size={13} /> Note interne (solo admin)
          </h3>
          <span style={{ fontSize: 10, color:
            notaStatus === 'saving' ? COLORS.textMute :
            notaStatus === 'saved' ? COLORS.ok :
            notaStatus === 'error' ? COLORS.err : COLORS.textMute,
            fontWeight: 600,
          }}>
            {notaStatus === 'dirty'  && '○ modifiche non salvate'}
            {notaStatus === 'saving' && <><Icon name="hourglass" size={10} /> salvataggio…</>}
            {notaStatus === 'saved'  && '✓ salvato'}
            {notaStatus === 'error'  && <><Icon name="warning" size={10} /> errore salvataggio</>}
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
          {/* Customer 360 - moduli e operazioni (Audit 2026-06-19).
              Aree prima invisibili: integrazioni, B2B, POS, push subs, scadenzario,
              costi aziendali, stipendi. Grid 2col mobile / 4col desktop. */}
          {has360 && (
            <section style={{ marginBottom: 18 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: COLORS.text }}>
                <Icon name="layers" size={13} /> Moduli &amp; operazioni
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isNarrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: 8,
              }}>
                {/* Integrazioni */}
                {c360.integrazioni && (
                  <div style={{ padding: 10, background: COLORS.rowAlt, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      <Icon name="integ" size={10} /> Integrazioni
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c360.integrazioni.n_attive > 0 ? COLORS.blue : COLORS.textMute, ...tnum }}>
                      {c360.integrazioni.n_attive}<span style={{ fontSize: 11, color: COLORS.textMute, fontWeight: 500 }}>/{c360.integrazioni.n_totali}</span>
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                      {c360.integrazioni.items.filter(i => i.attiva).slice(0, 3).map(i => i.tipo).join(', ') || 'nessuna attiva'}
                    </div>
                  </div>
                )}
                {/* Vendite B2B */}
                {c360.b2b && (
                  <div style={{ padding: 10, background: COLORS.rowAlt, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      <Icon name="building" size={10} /> Vendite B2B (mese)
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c360.b2b.ricavo_mtd > 0 ? COLORS.ok : COLORS.textMute, ...tnum }}>
                      €{Number(c360.b2b.ricavo_mtd || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                      {c360.b2b.n_vendite_mtd} vendite · {c360.b2b.n_clienti_attivi} clienti attivi
                    </div>
                  </div>
                )}
                {/* POS scontrini */}
                {c360.pos && (
                  <div style={{ padding: 10, background: COLORS.rowAlt, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      <Icon name="creditCard" size={10} /> POS (mese)
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c360.pos.ricavo_mtd > 0 ? COLORS.ok : COLORS.textMute, ...tnum }}>
                      €{Number(c360.pos.ricavo_mtd || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                      {c360.pos.n_scontrini_mtd} scontrini
                      {c360.pos.providers.length > 0 && ` · ${c360.pos.providers.slice(0, 2).join(', ')}`}
                    </div>
                  </div>
                )}
                {/* Push subscriptions */}
                {c360.push && (
                  <div style={{ padding: 10, background: COLORS.rowAlt, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      <Icon name="bell" size={10} /> Push subs
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c360.push.n_attive > 0 ? COLORS.blue : COLORS.textMute, ...tnum }}>
                      {c360.push.n_attive}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                      {c360.push.devices.length > 0
                        ? c360.push.devices.slice(0, 2).map(d => d.label || 'tablet').join(', ')
                        : 'nessun dispositivo'}
                    </div>
                  </div>
                )}
                {/* Scadenzario fatture */}
                {c360.scadenzario && (
                  <div style={{ padding: 10, background: c360.scadenzario.n_overdue > 0 ? COLORS.errBg : COLORS.rowAlt, borderRadius: 8, border: `1px solid ${c360.scadenzario.n_overdue > 0 ? COLORS.err : COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      <Icon name="warning" size={10} /> Fatture scadute
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c360.scadenzario.n_overdue > 0 ? COLORS.err : COLORS.textMute, ...tnum }}>
                      {c360.scadenzario.n_overdue}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                      {c360.scadenzario.n_overdue > 0
                        ? `€${Number(c360.scadenzario.totale_overdue).toLocaleString('it-IT', { maximumFractionDigits: 0 })} non pagato`
                        : `${c360.scadenzario.n_prossime_7gg} in scadenza 7gg`}
                    </div>
                  </div>
                )}
                {/* Costi aziendali */}
                {c360.costi && (
                  <div style={{ padding: 10, background: COLORS.rowAlt, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      <Icon name="receipt" size={10} /> Costi mensili
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c360.costi.totale_mensile > 0 ? COLORS.warn : COLORS.textMute, ...tnum }}>
                      €{Number(c360.costi.totale_mensile || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                      {c360.costi.n_voci_attive} voci attive
                    </div>
                  </div>
                )}
                {/* Stipendi */}
                {c360.stipendi && (
                  <div style={{ padding: 10, background: COLORS.rowAlt, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      <Icon name="users" size={10} /> Stipendi (lordo/mese)
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c360.stipendi.lordo_mensile > 0 ? COLORS.warn : COLORS.textMute, ...tnum }}>
                      €{Number(c360.stipendi.lordo_mensile || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                      {c360.stipendi.n_dipendenti} dipendenti attivi
                    </div>
                  </div>
                )}
              </div>

              {/* Audit 2026-06-19 Customer 360 write: liste con revoca per
                  integrazioni attive + dispositivi push. Solo se count > 0. */}
              {c360.integrazioni && c360.integrazioni.items?.filter(i => i.attiva).length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: COLORS.bg || '#FAFAFA', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, fontWeight: 700 }}>
                    Integrazioni attive - clic su × per revocare
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {c360.integrazioni.items.filter(i => i.attiva).map(i => (
                      <span key={i.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 4px 3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: COLORS.blueBg, color: COLORS.blue,
                        border: `1px solid ${COLORS.blue}`,
                      }}>
                        {i.tipo}
                        {i.ultimo_sync && <span style={{ fontSize: 9, opacity: 0.7 }}>· {new Date(i.ultimo_sync).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</span>}
                        <button
                          onClick={() => onAzione('integrazione_disattiva', { integrazione_id: i.id, tipo: i.tipo })}
                          title={`Revoca integrazione ${i.tipo}`}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: COLORS.blue, padding: '0 4px', fontSize: 14, lineHeight: 1, opacity: 0.7,
                          }}
                        >×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {c360.push && c360.push.devices?.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: COLORS.bg || '#FAFAFA', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, fontWeight: 700 }}>
                    Dispositivi push sottoscritti - clic su × per revocare
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {c360.push.devices.map(d => (
                      <span key={d.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 4px 3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: COLORS.rowAlt, color: COLORS.text,
                        border: `1px solid ${COLORS.border}`,
                      }} title={d.ua_short || ''}>
                        {d.label || 'tablet senza nome'}
                        <button
                          onClick={() => onAzione('push_sub_revoca', { sub_id: d.id, label: d.label || 'dispositivo' })}
                          title="Revoca dispositivo"
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: COLORS.textMute, padding: '0 4px', fontSize: 14, lineHeight: 1, opacity: 0.7,
                          }}
                        >×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Sedi */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: COLORS.text }}>
              <Icon name="building" size={13} /> Sedi ({sedi.length})
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
                    {s.is_default && <Icon name="star" size={10} style={{ marginRight: 3 }} />}{s.nome}{!s.attiva && ' (inattiva)'}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Uso per area */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: COLORS.text }}>
              <Icon name="barChart" size={13} /> Uso per area
            </h3>
            {usage.length === 0 ? (
              <div style={{ fontSize: 12, color: COLORS.textMute, padding: '12px 0' }}>
                Nessun dato salvato - il cliente non ha mai inserito nulla.
              </div>
            ) : (
              <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: COLORS.rowAlt }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Area</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Record</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sedi</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ultimo</th>
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
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontWeight: 600, color: COLORS.text }}>
                              {LABEL_CHIAVE[u.data_key] || u.data_key}
                            </span>
                            {CHIAVI_OPERATIVE_SET.has(u.data_key) && (
                              <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: COLORS.blueBg, color: COLORS.blue, fontWeight: 700, textTransform: 'uppercase' }}>op</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: COLORS.textSoft, fontWeight: 600 }}>{u.conteggio}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: COLORS.textMute }}>{u.n_sedi || '-'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: fresca ? COLORS.ok : COLORS.textMute, whiteSpace: 'nowrap', fontWeight: fresca ? 600 : 400 }}>
                            {u.ultimo ? fmtDataOra(u.ultimo) : '-'}
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
              <Icon name="clock" size={13} /> Eventi recenti ({eventi.length})
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
                          {e.user_email || '-'}
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
  const isAdminNarrow = useIsNarrowScreen(900)
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
  // Audit 2026-06-19 Customer 360 filtri: solo clienti con condizione attiva.
  const [filtroFlag, setFiltroFlag] = useState('tutti')  // tutti | scadute | integrazioni | push
  const [filtroSignal, setFiltroSignal] = useState('tutti')  // tutti | hot | silent | churning | new_value | errors
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
  const [personalizeFor, setPersonalizeFor] = useState(null)  // cliente target demo personalizzata
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
  // Audit 2026-06-14: AI Telemetry + Health + Security
  const [aiTelemetry, setAiTelemetry] = useState(null)
  const [aiTelemetryLoading, setAiTelemetryLoading] = useState(false)
  const [aiTelemetryDays, setAiTelemetryDays] = useState(7)
  const [healthSnap, setHealthSnap] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [securitySnap, setSecuritySnap] = useState(null)
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityHours, setSecurityHours] = useState(24)
  // Audit 2026-06-14: Usage analytics
  const [usageStats, setUsageStats] = useState(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageDays, setUsageDays] = useState(30)
  // Tab navigation (audit 2026-06-14 PM): pagina divisa in 6 sezioni navigabili
  // invece di scroll infinito. Persistenza in sessionStorage per non perdere
  // il tab quando si fa F5.
  const [adminTab, setAdminTab] = useState(() => {
    try { return sessionStorage.getItem('admin_tab') || 'overview' } catch { return 'overview' }
  })
  useEffect(() => {
    try { sessionStorage.setItem('admin_tab', adminTab) } catch {}
  }, [adminTab])

  // ── Helpers di chiamata API ─────────────────────────────────────────
  // Wrapper apiFetch gestisce già auth + retry 401 + redirect a /login se la
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

  // Audit 2026-06-14: AI Telemetry
  const fetchAiTelemetry = useCallback(async (days = aiTelemetryDays) => {
    setAiTelemetryLoading(true)
    try {
      const res = await apiCall(`/api/admin?action=ai_telemetry&days=${days}`)
      const data = await res.json()
      setAiTelemetry(data.telemetry || null)
    } catch (err) {
      console.error('ai telemetry:', err.message)
    } finally {
      setAiTelemetryLoading(false)
    }
  }, [apiCall, aiTelemetryDays])

  // Audit 2026-06-14: Health snapshot (cron + deploy + errori)
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const res = await apiCall('/api/admin?action=health')
      const data = await res.json()
      setHealthSnap(data.health || null)
    } catch (err) {
      console.error('health:', err.message)
    } finally {
      setHealthLoading(false)
    }
  }, [apiCall])

  // Audit 2026-06-14: Usage analytics (quali view i clienti usano di più)
  const fetchUsageStats = useCallback(async (days = usageDays) => {
    setUsageLoading(true)
    try {
      const res = await apiCall(`/api/admin?action=usage_stats&days=${days}`)
      const data = await res.json()
      setUsageStats(data.usage || null)
    } catch (err) {
      console.error('usage stats:', err.message)
    } finally {
      setUsageLoading(false)
    }
  }, [apiCall, usageDays])

  // Audit 2026-06-14: Security snapshot
  const fetchSecurity = useCallback(async (hours = securityHours) => {
    setSecurityLoading(true)
    try {
      const res = await apiCall(`/api/admin?action=security&hours=${hours}`)
      const data = await res.json()
      setSecuritySnap(data.security || null)
    } catch (err) {
      console.error('security:', err.message)
    } finally {
      setSecurityLoading(false)
    }
  }, [apiCall, securityHours])

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
          nome_display: priceDraft.nome_display || '',
          descrizione: priceDraft.descrizione || '',
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

  // Audit 2026-06-19 Customer 360: email domain blocklist
  const [blocklist, setBlocklist] = useState([])
  const [blocklistLoading, setBlocklistLoading] = useState(false)
  const [nuovoBlocco, setNuovoBlocco] = useState({ domain: '', motivo: '' })
  const fetchBlocklist = useCallback(async () => {
    setBlocklistLoading(true)
    try {
      const res = await apiCall('/api/admin?action=email_blocklist')
      const data = await res.json()
      setBlocklist(data.blocklist || [])
    } catch (err) {
      console.error('blocklist:', err.message)
    } finally {
      setBlocklistLoading(false)
    }
  }, [apiCall])
  const aggiungiBlocco = useCallback(async () => {
    const d = (nuovoBlocco.domain || '').trim().toLowerCase()
    if (!d) { toast.error('Inserisci un dominio (es. mailinator.com)'); return }
    try {
      await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'email_blocklist_aggiungi', domain: d, motivo: nuovoBlocco.motivo }),
      })
      setNuovoBlocco({ domain: '', motivo: '' })
      await fetchBlocklist()
      toast.success(`Dominio ${d} bloccato`)
    } catch (e) {
      toast.error('Errore: ' + e.message)
    }
  }, [nuovoBlocco, apiCall, fetchBlocklist, toast])
  const rimuoviBlocco = useCallback(async (domain) => {
    if (!confirm(`Sbloccare il dominio ${domain}?\nGli utenti con email @${domain} potranno tornare a registrarsi.`)) return
    try {
      await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'email_blocklist_rimuovi', domain }),
      })
      await fetchBlocklist()
      toast.success(`Dominio ${domain} sbloccato`)
    } catch (e) {
      toast.error('Errore: ' + e.message)
    }
  }, [apiCall, fetchBlocklist, toast])

  // ─── ADMIN v2 - Audit 2026-06-20 ────────────────────────────────────────
  // Activity feed (live poll 12s)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const fetchActivity = useCallback(async () => {
    setActivityLoading(true)
    try {
      const res = await apiCall('/api/admin?action=activity_feed&limit=80')
      const data = await res.json()
      setActivity(data.events || [])
    } catch (err) { console.error('activity:', err.message) }
    finally { setActivityLoading(false) }
  }, [apiCall])

  // Customer signals (hot/silent/churning/...)
  const [signals, setSignals] = useState({})  // org_id → { status, detail }
  const [signalsLoading, setSignalsLoading] = useState(false)
  const fetchSignals = useCallback(async () => {
    setSignalsLoading(true)
    try {
      const res = await apiCall('/api/admin?action=customer_signals')
      const data = await res.json()
      const map = {}
      for (const s of (data.signals || [])) map[s.org_id] = s
      setSignals(map)
    } catch (err) { console.error('signals:', err.message) }
    finally { setSignalsLoading(false) }
  }, [apiCall])

  // Onboarding funnel
  const [funnel, setFunnel] = useState(null)
  const [funnelDays, setFunnelDays] = useState(60)
  const [funnelLoading, setFunnelLoading] = useState(false)
  const fetchFunnel = useCallback(async () => {
    setFunnelLoading(true)
    try {
      const res = await apiCall(`/api/admin?action=onboarding_funnel&days=${funnelDays}`)
      const data = await res.json()
      setFunnel(data)
    } catch (err) { console.error('funnel:', err.message) }
    finally { setFunnelLoading(false) }
  }, [apiCall, funnelDays])

  // Errors raggruppati
  const [errorsGrouped, setErrorsGrouped] = useState([])
  const [errorsGroupedDays, setErrorsGroupedDays] = useState(7)
  const [errorsGroupedLoading, setErrorsGroupedLoading] = useState(false)
  const fetchErrorsGrouped = useCallback(async () => {
    setErrorsGroupedLoading(true)
    try {
      const res = await apiCall(`/api/admin?action=errors_grouped&days=${errorsGroupedDays}`)
      const data = await res.json()
      setErrorsGrouped(data.groups || [])
    } catch (err) { console.error('errorsGrouped:', err.message) }
    finally { setErrorsGroupedLoading(false) }
  }, [apiCall, errorsGroupedDays])

  // AI cost per customer
  const [aiCost, setAiCost] = useState(null)
  const [aiCostDays, setAiCostDays] = useState(30)
  const [aiCostLoading, setAiCostLoading] = useState(false)
  const fetchAiCost = useCallback(async () => {
    setAiCostLoading(true)
    try {
      const res = await apiCall(`/api/admin?action=ai_cost_by_customer&days=${aiCostDays}`)
      const data = await res.json()
      setAiCost(data)
    } catch (err) { console.error('aiCost:', err.message) }
    finally { setAiCostLoading(false) }
  }, [apiCall, aiCostDays])

  // Cmd+K global search
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [cmdkQuery, setCmdkQuery] = useState('')
  const [cmdkResults, setCmdkResults] = useState(null)
  const [cmdkLoading, setCmdkLoading] = useState(false)
  // Cmd+K listener globale
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdkOpen(o => !o)
      } else if (e.key === 'Escape' && cmdkOpen) {
        setCmdkOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cmdkOpen])
  // Debounced search
  useEffect(() => {
    if (!cmdkOpen || cmdkQuery.trim().length < 2) {
      setCmdkResults(null)
      return
    }
    setCmdkLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await apiCall(`/api/admin?action=global_search&q=${encodeURIComponent(cmdkQuery.trim())}`)
        const data = await res.json()
        setCmdkResults(data)
      } catch (err) {
        console.error('cmdk:', err.message)
      } finally {
        setCmdkLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [cmdkQuery, cmdkOpen, apiCall])

  // Pending signups (audit 2026-06-21)
  const [pendingOrgs, setPendingOrgs] = useState([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const fetchPending = useCallback(async () => {
    setPendingLoading(true)
    try {
      const res = await apiCall('/api/admin?action=pending_approvals')
      const data = await res.json()
      setPendingOrgs(data.orgs || [])
    } catch (err) { console.error('pending:', err.message) }
    finally { setPendingLoading(false) }
  }, [apiCall])
  const approvaSignup = useCallback(async (orgId) => {
    try {
      await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ orgId, tipo: 'approva_signup' }) })
      // Audit 2026-06-21: ottimistic UI remove + skip doppio refresh per
      // rispettare rate limit su delete bulk.
      setPendingOrgs(prev => prev.filter(o => o.id !== orgId))
      toast.success('Cliente approvato. Ora può entrare.')
    } catch (e) { toast.error('Errore: ' + e.message) }
  }, [apiCall, toast])
  const rifiutaSignup = useCallback(async (orgId, nome) => {
    if (!confirm(`Rifiutare e CANCELLARE "${nome}"?\n\nL'org + utente vengono eliminati definitivamente. Operazione irreversibile.\n\nUsa solo per scam evidenti.`)) return
    try {
      await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ orgId, tipo: 'rifiuta_signup', confirm: 'rifiuta' }) })
      // Audit 2026-06-21: rimosso doppio refresh (pending + data). Aggiorno
      // solo lista pending lato UI; la lista clienti si aggiornera` al prossimo
      // poll naturale (no urgenza, l'utente non si vede piu` su entrambe).
      setPendingOrgs(prev => prev.filter(o => o.id !== orgId))
      toast.success('Org rifiutata e cancellata.')
    } catch (e) { toast.error('Errore: ' + e.message) }
  }, [apiCall, toast])

  // Codici sconto: redemptions viewer + ad-hoc generator (G2 batch 19b)
  const [redemptionsFor, setRedemptionsFor] = useState(null) // codice currently viewed
  const [redemptions, setRedemptions] = useState([])
  const [redemptionsLoading, setRedemptionsLoading] = useState(false)
  const openRedemptions = useCallback(async (codice) => {
    setRedemptionsFor(codice); setRedemptions([]); setRedemptionsLoading(true)
    try {
      const res = await apiCall(`/api/admin?action=codice_redemptions&codice=${encodeURIComponent(codice)}`)
      const data = await res.json()
      setRedemptions(data.items || [])
    } catch (e) { toast.error(e.message) }
    finally { setRedemptionsLoading(false) }
  }, [apiCall, toast])
  const [adHocOpen, setAdHocOpen] = useState(false)
  const [adHocForm, setAdHocForm] = useState({ target_org_id: '', tipo_sconto: 'percent', valore_sconto: 20, durata: 'once', descrizione: '' })
  const generaAdHoc = useCallback(async () => {
    if (!adHocForm.target_org_id) { toast.error('Seleziona un cliente'); return }
    try {
      const res = await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'genera_codice_ad_hoc', ...adHocForm }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Codice ad-hoc creato - copialo dalla lista in alto')
      setAdHocOpen(false)
      setAdHocForm({ target_org_id: '', tipo_sconto: 'percent', valore_sconto: 20, durata: 'once', descrizione: '' })
      fetchCodici()
    } catch (e) { toast.error(e.message) }
  }, [adHocForm, apiCall, fetchCodici, toast])

  // Referral admin (G3 batch 19b)
  const [refAdmin, setRefAdmin] = useState(null)
  const [refAdminLoading, setRefAdminLoading] = useState(false)
  const fetchRefAdmin = useCallback(async () => {
    setRefAdminLoading(true)
    try {
      const res = await apiCall('/api/admin?action=referral_admin')
      setRefAdmin(await res.json())
    } catch (e) { console.error('ref admin:', e.message) }
    finally { setRefAdminLoading(false) }
  }, [apiCall])
  useEffect(() => {
    if (adminTab === 'ops' && !refAdmin && !refAdminLoading) fetchRefAdmin()
  }, [adminTab, refAdmin, refAdminLoading, fetchRefAdmin])

  // SQL editor
  const [sqlQuery, setSqlQuery] = useState('select id, nome, created_at\nfrom organizations\norder by created_at desc\nlimit 20')
  const [sqlResult, setSqlResult] = useState(null)
  const [sqlError, setSqlError] = useState('')
  const [sqlRunning, setSqlRunning] = useState(false)
  const runSqlQuery = useCallback(async () => {
    setSqlRunning(true); setSqlError(''); setSqlResult(null)
    try {
      const res = await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'sql_query', query: sqlQuery }),
      })
      const data = await res.json()
      if (data.ok === false || data.error) {
        setSqlError(data.error || 'Errore query')
      } else {
        setSqlResult(data)
      }
    } catch (err) {
      setSqlError(err.message)
    } finally { setSqlRunning(false) }
  }, [apiCall, sqlQuery])

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

  useEffect(() => { fetchData(); fetchAudit(); fetchCodici(); fetchPricing(); fetchBanners(); fetchBlocklist() },
    [fetchData, fetchAudit, fetchCodici, fetchPricing, fetchBanners, fetchBlocklist])
  useEffect(() => { fetchFeedback() }, [fetchFeedback])
  // Stripe MRR + events: caricamento on-demand (1 sola volta all'apertura
  // pannello, refresh manuale). Stripe API ha rate limit 100/s ma chiamate
  // ripetute hanno costo, meglio non spammare.
  useEffect(() => { fetchStripeMrr(); fetchStripeEvents(); fetchErrori() },
    [fetchStripeMrr, fetchStripeEvents, fetchErrori])
  // Audit 2026-06-21: pending signups al mount + poll 30s (per email-notification-less workflow)
  useEffect(() => {
    fetchPending()
    const t = setInterval(fetchPending, 30_000)
    return () => clearInterval(t)
  }, [fetchPending])
  // Audit 2026-06-20 admin v2: signals + activity al mount, poll activity 12s
  useEffect(() => { fetchSignals() }, [fetchSignals])
  useEffect(() => {
    fetchActivity()
    const t = setInterval(fetchActivity, 12_000)
    return () => clearInterval(t)
  }, [fetchActivity])
  // Funnel / errors grouped / ai cost: caricano alla prima visita del tab
  useEffect(() => {
    if (adminTab === 'funnel' && !funnel && !funnelLoading) fetchFunnel()
  }, [adminTab, funnel, funnelLoading, fetchFunnel])
  useEffect(() => {
    if (adminTab === 'health' && errorsGrouped.length === 0 && !errorsGroupedLoading) fetchErrorsGrouped()
    if (adminTab === 'health' && !aiCost && !aiCostLoading) fetchAiCost()
  }, [adminTab, errorsGrouped.length, errorsGroupedLoading, fetchErrorsGrouped, aiCost, aiCostLoading, fetchAiCost])
  useEffect(() => { fetchFunnel() }, [funnelDays, fetchFunnel])
  useEffect(() => { fetchErrorsGrouped() }, [errorsGroupedDays, fetchErrorsGrouped])
  useEffect(() => { fetchAiCost() }, [aiCostDays, fetchAiCost])
  // Audit 2026-06-14: AI telemetry + health + security + usage caricati on-demand
  useEffect(() => { fetchAiTelemetry(); fetchHealth(); fetchSecurity(); fetchUsageStats() },
    [fetchAiTelemetry, fetchHealth, fetchSecurity, fetchUsageStats])

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
      // Audit 2026-06-17 HIGH: il server non restituisce più `link` per privacy
      // (manda magic-link via email + notifica titolare). Cliente legacy era
      // muto. Mostra conferma esplicita.
      if (data?.link) {
        setImpersona({ cliente: c, link: data.link })
      } else if (data?.link_sent_to) {
        toast.success(`Magic link inviato a ${data.link_sent_to}`)
      } else if (data?.ok) {
        toast.success('Magic link inviato al titolare (controlla email).')
      }
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
      } else if (data?.sent_to) {
        toast.success(`Email di recovery inviata a ${data.sent_to}`)
      } else if (data?.ok) {
        toast.success('Email di recovery inviata al titolare.')
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
      a.download = `clienti_foodos_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(`Errore export: ${err.message}`)
    }
  }

  async function handleCleanupE2E() {
    try {
      // 1) Preview: conta quanti account E2E ci sono + lista email
      const previewRes = await apiCall('/api/admin?action=cleanup_e2e_preview')
      const preview = await previewRes.json()
      const n = preview.orgs_count || 0
      if (n === 0) { toast.info('Nessun account E2E test trovato (pattern @foodios-e2e.test)'); return }
      // 2) Conferma esplicita con lista email (audit 2026-06-14 PM: prima
      // c'era solo count, ora mostriamo le prime 20 email così l'admin verifica
      // visivamente che non ci sia mai un'email reale).
      const orgs = preview.orgs || []
      const sampleEmails = orgs.slice(0, 20).flatMap(o => o.emails || []).slice(0, 20)
      const ok = confirm(
        `Stai per cancellare ${n} account test E2E (email @foodios-e2e.test).\n\n` +
        `Esempi delle email che verranno eliminate:\n` +
        sampleEmails.map(e => `  • ${e}`).join('\n') +
        (orgs.length > 20 ? `\n  ... e altre ${orgs.length - 20} org` : '') +
        `\n\nVerranno eliminati:\n` +
        `- ${n} organizations\n` +
        `- tutti i profili associati\n` +
        `- tutti i dati su 22 tabelle (sedi, fatture, ricette, ecc.)\n` +
        `- gli utenti auth.users corrispondenti\n\n` +
        `Operazione irreversibile. Procedere?`
      )
      if (!ok) return
      // 3) Esegui con conferma stringa
      const res = await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'cleanup_e2e', conferma: 'CLEANUP_E2E' }),
      })
      const data = await res.json()
      const elim = data.eliminate ?? 0
      const fail = data.falliti ?? 0
      toast.success(`Cleanup completato: ${elim} eliminati${fail > 0 ? `, ${fail} falliti` : ''}`)
      fetchData()
      fetchAudit()
    } catch (err) {
      toast.error(`Errore cleanup E2E: ${err.message}`)
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
            oggetto: 'La tua prova Foodos scade tra pochi giorni',
            messaggio: `Ciao ${c.nome_completo || ''},\n\nla tua prova gratuita di Foodos scade tra ${giorniRimanenti(c)} giorni.\n\nSe vuoi continuare ad accedere ai tuoi dati e alle analisi, rispondi a questa email e ti preparo l'attivazione.\n\nA presto,\nAlessandro`,
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
    // Cap UI: il server limita 10/min, oltre questa soglia partono N richieste
    // ma 90% finisce in 429 e l'admin vede "ko=N" criptico (audit 2026-06-17
    // HIGH). Limitiamo qui a 50 clienti per batch.
    const BULK_CAP = 50
    if (selezionati.size > BULK_CAP) {
      toast.error(`Bulk limitato a ${BULK_CAP} clienti per volta (selezionati ${selezionati.size}). Deseleziona o esegui in più tornate.`)
      return
    }
    const giorni = prompt(`Estendi trial di quanti giorni a ${selezionati.size} clienti selezionati?`, '30')
    if (!giorni) return
    const n = parseInt(giorni, 10)
    if (!Number.isFinite(n) || n < 1) { toast.error('Giorni non validi'); return }
    if (!confirm(`Confermi: estendere il trial di ${n}gg a ${selezionati.size} clienti?`)) return
    let ok = 0, ko = 0
    const errori = []
    for (const orgId of selezionati) {
      try { await azione(orgId, 'estendi_trial', { valore: n }); ok++ }
      catch (e) { ko++; if (errori.length < 3) errori.push(e?.message || 'errore') }
    }
    setSelezionati(new Set())
    if (ko === 0) toast.success(`Trial esteso a ${ok} clienti`)
    else toast.warn(`Trial esteso: ${ok} ok · ${ko} errori (${errori.join('; ')})`)
  }

  function bulkExportCsv() {
    if (selezionati.size === 0) return
    const sel = clienti.filter(c => selezionati.has(c.org_id))
    const header = 'Nome attivita,Tipo,Email,Nome completo,Piano,Stato,Sedi,Record,Registrata,Ultimo accesso,Trial scade'
    const rows = sel.map(c => {
      const stato = !c.attivo ? 'Bloccato'
        : c.org_approvata ? 'Pagante'
        : (c.trial_ends_at && new Date(c.trial_ends_at) > new Date()) ? 'Trial' : 'Scaduto'
      const q = v => {
        let s = String(v ?? '')
        // Anti-CSV-injection (audit 2026-06-17 MEDIUM)
        if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = "'" + s
        return `"${s.replace(/"/g, '""')}"`
      }
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
      // Audit 2026-06-19 Customer 360 flag filter
      if (filtroFlag === 'scadute' && !(c.n_fatture_scadute > 0)) return false
      if (filtroFlag === 'integrazioni' && !(c.n_integrazioni_attive > 0)) return false
      if (filtroFlag === 'push' && !(c.n_push_subs > 0)) return false
      // Audit 2026-06-20: filtro per signal status
      if (filtroSignal !== 'tutti') {
        const s = signals[c.org_id]
        if (!s || s.status !== filtroSignal) return false
      }
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
  }, [clienti, search, filtroStato, filtroTipo, filtroFlag, filtroSignal, signals, sortBy, sortDir])

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
            <Icon name="gift" size={17} /> Foodos <span style={{ color: COLORS.accent }}>Admin</span>
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
            Pannello amministrazione · {lastFetch
              ? `aggiornato alle ${lastFetch.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'caricamento…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setCmdkOpen(true)} title="Cerca tutto (Cmd+K)"
            style={{
              background: COLORS.rowAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8,
              padding: '6px 10px', fontSize: 12, color: COLORS.textMute, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <Icon name="search" size={12} /> Cerca <span style={{ fontFamily: 'monospace', fontSize: 10, padding: '1px 4px', background: '#FFF', borderRadius: 3, border: `1px solid ${COLORS.border}` }}>⌘K</span>
          </button>
          <Btn kind="neutral" onClick={() => { fetchData(); fetchAudit() }} disabled={loading}>
            {loading ? '…' : <><Icon name="refresh" size={14} /> Aggiorna</>}
          </Btn>
          <Btn kind="neutral" onClick={() => { window.location.href = '/' }}>← Sito</Btn>
          <Btn kind="ghost" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }}>Esci</Btn>
        </div>
      </div>

      {/* Tab navigation: 6 sezioni accessibili senza scroll */}
      <div style={{
        background: '#FFF', borderBottom: `1px solid ${COLORS.border}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 2, overflowX: 'auto' }}>
          {[
            { id: 'overview',  label: 'Overview',  icon: 'home',     desc: 'KPI, MRR, crescita, customer 360 globale' },
            { id: 'pending',   label: '⏳ In attesa', icon: 'hourglass', desc: 'Approva o rifiuta nuove iscrizioni (anti-scam gate)' },
            { id: 'clienti',   label: 'Clienti',   icon: 'users',    desc: 'Tabella con badge hot/silent/churning, filtri, bulk' },
            { id: 'activity',  label: 'Attività',  icon: 'bolt',     desc: 'Live feed eventi: errori, audit, feedback, azioni admin' },
            { id: 'funnel',    label: 'Funnel',    icon: 'trendUp',  desc: 'Onboarding step funnel, drop-off, time-to-value' },
            { id: 'health',    label: 'Health',    icon: 'shield',   desc: 'Errori raggruppati, AI cost per cliente, cron status' },
            { id: 'security',  label: 'Security',  icon: 'lock',     desc: 'Login attempts, anomalie, audit admin actions' },
            { id: 'ops',       label: 'Ops',       icon: 'cog',      desc: 'Pricing, codici sconto, feedback, banner, blocklist, SQL editor' },
            { id: 'ai',        label: 'AI',        icon: 'sparkles', desc: 'Telemetria AI feature-by-feature, modelli, costi totali' },
          ].map(t => {
            const active = adminTab === t.id
            // Badge counter feedback non gestiti su tab "Ops" (feedback inbox è qui).
            const feedbackPending = t.id === 'ops'
              ? feedback.filter(f => !f.gestito).length
              : 0
            return (
              <button
                key={t.id}
                onClick={() => setAdminTab(t.id)}
                title={t.desc}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? `3px solid ${COLORS.accent || '#6E0E1A'}` : '3px solid transparent',
                  padding: '14px 18px',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? (COLORS.accent || '#6E0E1A') : COLORS.textMute,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                  position: 'relative',
                }}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
                {feedbackPending > 0 && (
                  <span style={{
                    background: COLORS.err || '#DC2626', color: '#FFF',
                    fontSize: 10, fontWeight: 800,
                    padding: '2px 7px', borderRadius: 999,
                    marginLeft: 4, minWidth: 18, textAlign: 'center',
                  }}>{feedbackPending}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {errore && (
          <div style={{
            background: COLORS.accentSoft, border: `1px solid ${COLORS.err}`,
            borderRadius: 8, padding: '12px 16px', color: COLORS.err, marginBottom: 20, fontSize: 13,
          }}><Icon name="warning" size={14} /> {errore}</div>
        )}

        {adminTab === 'overview' && (<>
        {/* Alert visibile: feedback non gestiti - il founder li deve vedere subito */}
        {feedback.filter(f => !f.gestito).length > 0 && (
          <div
            onClick={() => setAdminTab('ops')}
            style={{
              background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
              border: `1px solid ${COLORS.warn || '#D97706'}`,
              borderRadius: 12, padding: '14px 18px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(217,119,6,0.18)',
            }}
          >
            <Icon name="mail" size={20} color="#92400E"/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#78350F' }}>
                {feedback.filter(f => !f.gestito).length}{' '}
                {feedback.filter(f => !f.gestito).length === 1 ? 'nuovo feedback da leggere' : 'nuovi feedback da leggere'}
              </div>
              <div style={{ fontSize: 12, color: '#92400E', marginTop: 2 }}>
                Tocca per aprire l'inbox in tab Ops
              </div>
            </div>
            <Icon name="chevR" size={16} color="#92400E"/>
          </div>
        )}

        {/* ── KPI ─────────────────────────────────────────────────── */}
        {/* Audit 2026-07-01 MED: 6-col su mobile rendeva i numeri <60px.
            Stesso pattern di responsive usato per la grid sottostante. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isAdminNarrow ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)',
          gap: 12, marginBottom: 20,
        }}>
          <KpiCard label="Totale clienti" value={stats?.totale ?? '-'} sub={stats?.nuoviMese != null ? `+${stats.nuoviMese} ultimo mese` : null} />
          <KpiCard
            label="Trial attivi"
            value={stats?.trial ?? '-'}
            sub={stats?.giorniMediTrial != null ? `Media ${stats.giorniMediTrial}gg rimasti` : null}
            color={COLORS.warn}
          />
          <KpiCard
            label="Paganti"
            value={stats?.paganti ?? '-'}
            sub={metricheAvanzate?.conversion != null ? `Conversion ${metricheAvanzate.conversion}%` : null}
            color={COLORS.ok}
          />
          <KpiCard
            label="Trial scaduti"
            value={stats?.scaduti ?? '-'}
            sub="Da convertire"
            color={COLORS.err}
          />
          <KpiCard
            label="MRR stimato"
            value={stats ? fmtEuro(stats.mrrStimato) : '-'}
            sub="Su piani attivi"
            color={COLORS.blue}
          />
          <KpiCard
            label="Nuovi 7gg"
            value={stats?.nuoviSettimana ?? '-'}
            sub="Registrazioni"
          />
        </div>

        {/* ── Grafico crescita ───────────────────────────────────── */}
        {stats?.crescita && (
          <Card style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}><Icon name="trendUp" size={14} /> Crescita registrazioni</h3>
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
              <Icon name="card" size={14} /> MRR reale (Stripe)
              <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMute, marginLeft: 10 }}>
                calcolato dalle subscription Stripe, non da paganti × prezzo
              </span>
            </h3>
            <Btn kind="neutral" size="sm" onClick={fetchStripeMrr} disabled={stripeMrrLoading}>{stripeMrrLoading ? '…' : <Icon name="refresh" size={13} />}</Btn>
          </div>
          {stripeMrrLoading && !stripeMrr ? (
            <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>Caricamento da Stripe…</div>
          ) : stripeMrr?.unavailable ? (
            <div style={{ padding: '10px 14px', background: COLORS.warnBg, border: `1px solid ${COLORS.warn}`, borderRadius: 8, color: COLORS.warn, fontSize: 12 }}>
              <Icon name="pause" size={14} /> Stripe non disponibile: {stripeMrr.reason || 'configurazione mancante'}
              <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
                Pre-revenue: aspettato. Configura <code>STRIPE_SECRET_KEY</code> su Vercel quando passi a Stripe live.
              </div>
            </div>
          ) : stripeMrr?.error ? (
            <div style={{ padding: '10px 14px', background: COLORS.errBg, border: `1px solid ${COLORS.err}`, borderRadius: 8, color: COLORS.err, fontSize: 12 }}>
              <Icon name="warning" size={13} /> Errore Stripe: {stripeMrr.error}
            </div>
          ) : stripeMrr ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isAdminNarrow ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
              gap: 10
            }}>
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

        {/* ── Customer 360 globale (Audit 2026-06-19): KPI cross-org ─ */}
        {stats?.customer360 && (() => {
          const c360 = stats.customer360
          const i = c360.integrazioni || {}
          const b = c360.b2b || {}
          const p = c360.pos || {}
          const pu = c360.push || {}
          const s = c360.scadenzario || {}
          return (
            <Card style={{ padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
                  <Icon name="layers" size={14} /> Moduli &amp; operazioni (cross-cliente)
                </h3>
                <span style={{ fontSize: 11, color: COLORS.textMute }}>Mese in corso</span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isAdminNarrow ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
                gap: 10,
              }}>
                <div style={{ padding: '10px 12px', background: COLORS.blueBg, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    <Icon name="integ" size={10} /> Integrazioni
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.blue }}>{i.n_attive_totali ?? 0}</div>
                  <div style={{ fontSize: 10, color: COLORS.blue, opacity: 0.85 }}>
                    su {i.n_clienti ?? 0} clienti
                    {i.top_tipi?.length > 0 && ` · top: ${i.top_tipi.slice(0, 2).map(t => t.tipo).join(', ')}`}
                  </div>
                </div>
                <div style={{ padding: '10px 12px', background: COLORS.okBg, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.ok, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    <Icon name="building" size={10} /> B2B (mese)
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.ok }}>{fmtEuro(b.ricavo_mtd || 0)}</div>
                  <div style={{ fontSize: 10, color: COLORS.ok, opacity: 0.85 }}>
                    {b.n_vendite_mtd ?? 0} vendite · {b.n_clienti_attivi_mtd ?? 0} clienti
                  </div>
                </div>
                <div style={{ padding: '10px 12px', background: COLORS.okBg, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.ok, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    <Icon name="creditCard" size={10} /> POS (mese)
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.ok }}>{fmtEuro(p.ricavo_mtd || 0)}</div>
                  <div style={{ fontSize: 10, color: COLORS.ok, opacity: 0.85 }}>
                    {p.n_scontrini_mtd ?? 0} scontrini · {p.n_clienti_attivi_mtd ?? 0} clienti
                  </div>
                </div>
                <div style={{ padding: '10px 12px', background: COLORS.blueBg, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    <Icon name="bell" size={10} /> Push subs
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.blue }}>{pu.n_dispositivi ?? 0}</div>
                  <div style={{ fontSize: 10, color: COLORS.blue, opacity: 0.85 }}>
                    su {pu.n_clienti ?? 0} clienti
                  </div>
                </div>
                <div style={{ padding: '10px 12px', background: (s.n_clienti_overdue || 0) > 0 ? COLORS.errBg : COLORS.blockedBg, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: (s.n_clienti_overdue || 0) > 0 ? COLORS.err : COLORS.blocked, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    <Icon name="warning" size={10} /> Fatture scadute
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: (s.n_clienti_overdue || 0) > 0 ? COLORS.err : COLORS.blocked }}>
                    {s.n_clienti_overdue ?? 0}
                  </div>
                  <div style={{ fontSize: 10, color: (s.n_clienti_overdue || 0) > 0 ? COLORS.err : COLORS.blocked, opacity: 0.85 }}>
                    clienti · {fmtEuro(s.totale_overdue || 0)}
                  </div>
                </div>
              </div>
            </Card>
          )
        })()}

        {/* ── Azioni rapide ──────────────────────────────────────── */}
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}><Icon name="bolt" size={14} /> Azioni rapide</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn kind="neutral" onClick={handleEmailTrialScadenza}>
              <Icon name="mail" size={14} /> Email a trial in scadenza (7gg)
            </Btn>
            <Btn kind="neutral" onClick={handleEsportaCsv}>
              <Icon name="barChart" size={14} /> Esporta CSV clienti
            </Btn>
            <Btn kind="neutral" onClick={fetchAudit}>
              <Icon name="refresh" size={14} /> Aggiorna log
            </Btn>
            <Btn kind="ghost" onClick={() => window.open('https://supabase.com/dashboard', '_blank')}>
              Supabase →
            </Btn>
            <Btn kind="ghost" onClick={() => window.open('https://vercel.com/dashboard', '_blank')}>
              ▲ Vercel →
            </Btn>
            <Btn kind="danger" onClick={handleCleanupE2E}
              title="Cancella in batch tutti gli account creati dai test Playwright (email @foodios-e2e.test, e2e+*, e2e-acc-titolare-*). Mostra preview prima della conferma.">
              <Icon name="broom" size={14} /> Pulisci account E2E test
            </Btn>
          </div>
        </Card>

        </>)}

        {adminTab === 'clienti' && (<>
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
              placeholder="Cerca per nome, email…"
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
            {/* Audit 2026-06-19 Customer 360: filtri rapidi flag */}
            <select
              value={filtroFlag} onChange={e => setFiltroFlag(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12, background: '#FFF' }}
              title="Filtra per condizioni Customer 360"
            >
              <option value="tutti">Tutti (no filtro 360)</option>
              <option value="scadute">Solo con fatture scadute</option>
              <option value="integrazioni">Solo con integrazioni attive</option>
              <option value="push">Solo con push subscribed</option>
            </select>
            {/* Audit 2026-06-20: filtro signal */}
            <select
              value={filtroSignal} onChange={e => setFiltroSignal(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12, background: '#FFF' }}
              title="Filtra per segnale comportamentale"
            >
              <option value="tutti">Tutti (no filtro signal)</option>
              <option value="hot">Hot - da chiamare</option>
              <option value="silent">Silent - trial inattivo</option>
              <option value="churning">Churn risk - pagante in calo</option>
              <option value="new_value">New value - primo wow</option>
              <option value="errors">⚠ Errors - bug ricorrenti</option>
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
                <Icon name="mail" size={14} /> Email
              </Btn>
              <Btn kind="neutral" size="sm" onClick={bulkEstendiTrial}>
                <Icon name="clock" size={14} /> Estendi trial
              </Btn>
              <Btn kind="neutral" size="sm" onClick={bulkExportCsv}>
                <Icon name="barChart" size={14} /> Export CSV
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
                          <div style={{ fontWeight: 700, color: COLORS.accent, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {c.nome_attivita || '-'}
                            {/* Audit 2026-06-20: signal badge inline */}
                            {signals[c.org_id] && signals[c.org_id].status !== 'normal' && (() => {
                              const s = signals[c.org_id]
                              const cfg = {
                                hot: { bg: '#FEF3C7', fg: '#92400E', txt: 'hot' },
                                silent: { bg: '#E0E7FF', fg: '#3730A3', txt: 'silent' },
                                churning: { bg: COLORS.errBg, fg: COLORS.err, txt: 'churn' },
                                new_value: { bg: COLORS.okBg, fg: COLORS.ok, txt: 'new value' },
                                errors: { bg: COLORS.errBg, fg: COLORS.err, txt: '⚠ errors' },
                                blocked: { bg: COLORS.blockedBg, fg: COLORS.blocked, txt: 'blocked' },
                              }[s.status] || { bg: COLORS.rowAlt, fg: COLORS.textMute, txt: s.status }
                              return (
                                <span title={s.detail} style={{
                                  fontSize: 9, padding: '2px 6px', borderRadius: 99,
                                  background: cfg.bg, color: cfg.fg, fontWeight: 700,
                                  textTransform: 'uppercase', letterSpacing: '0.04em',
                                }}>{cfg.txt}</span>
                              )
                            })()}
                          </div>
                          {c.nome_completo && <div style={{ fontSize: 11, color: COLORS.textMute }}>{c.nome_completo}</div>}
                        </td>
                        <td style={{ ...td(), color: COLORS.textSoft, textTransform: 'capitalize' }}>{c.tipo || '-'}</td>
                        <td style={{ ...td(), color: COLORS.textSoft }}>
                          {c.email}
                          {!c.email_confermata && (
                            <div style={{ fontSize: 10, color: COLORS.warn, marginTop: 2 }}><Icon name="mail" size={11} /> non confermata</div>
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
                          {c.ultimo_accesso ? fmtDataOra(c.ultimo_accesso) : <span style={{ color: COLORS.textMute }}>-</span>}
                        </td>
                        <td style={td()}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {!c.org_approvata && (
                              <Btn kind="success" size="sm" onClick={() => azione(c.org_id, 'approva')} disabled={inAzione('approva')}
                                title="Approva attività: imposta org_approvata=true. Il cliente diventa 'pagante' e perde il limite del trial." aria-label="Approva">
                                ✓
                              </Btn>
                            )}
                            {c.attivo === false ? (
                              <Btn kind="success" size="sm" onClick={() => azione(c.org_id, 'riattiva')} disabled={inAzione('riattiva')}
                                title="Riattiva: imposta attivo=true. Il cliente può rifare login e usare l'app." aria-label="Riattiva">
                                ▶
                              </Btn>
                            ) : (
                              <Btn kind="danger" size="sm" onClick={() => { if (confirm(`Bloccare ${c.nome_attivita}?`)) azione(c.org_id, 'blocca') }} disabled={inAzione('blocca')}
                                title="Blocca: imposta attivo=false. Il cliente non può più fare login né chiamate API." aria-label="Blocca">
                                <Icon name="pause" size={14} />
                              </Btn>
                            )}
                            <Btn kind="neutral" size="sm" onClick={() => {
                              const g = prompt(`Estendi trial di ${c.nome_attivita} di quanti giorni?`, '30')
                              if (g) azione(c.org_id, 'estendi_trial', { valore: g })
                            }} disabled={inAzione('estendi_trial')}
                              title="Estendi trial: somma X giorni a trial_ends_at (modale chiede quanti)." aria-label="Estendi trial">
                              <Icon name="clock" size={14} />
                            </Btn>
                            <Btn kind="neutral" size="sm" onClick={() => setEmailFor(c)}
                              title="Invia email al titolare con template personalizzabile (Resend)." aria-label="Invia email">
                              <Icon name="mail" size={14} />
                            </Btn>
                            <Btn kind="warn" size="sm" onClick={() => handleImpersona(c)} disabled={inAzione('impersona')}
                              title="Impersona: spedisce magic link via email al titolare per accedere come lui (no link in response, solo email)." aria-label="Impersona">
                              <Icon name="key" size={14} />
                            </Btn>
                            <Btn kind="neutral" size="sm" onClick={() => handleResetPassword(c)} disabled={inAzione('reset_password')}
                              title="Reset password: spedisce email recovery al titolare per scegliere nuova password." aria-label="Reset password">
                              <Icon name="refresh" size={14} />
                            </Btn>
                            <Btn kind="success" size="sm" onClick={() => setRegalaFor(c)}
                              title="Regala mesi: applica codice sconto per X mesi gratuiti (modale chiede quanti e quale codice)." aria-label="Regala mesi">
                              <Icon name="gift" size={14} />
                            </Btn>
                            <Btn kind="neutral" size="sm" onClick={() => handlePulisciDemo(c)} disabled={inAzione('pulisci_demo_fatture')}
                              title="Pulisci fatture demo: cancella le 20 fatture fingerprint demo dallo scadenzario (no fatture vere)." aria-label="Pulisci fatture demo">
                              <Icon name="broom" size={14} />
                            </Btn>
                            <Btn kind="danger" size="sm" onClick={() => setDeleteFor(c)}
                              title="Elimina: cancella org + tutti i dati su 22 tabelle (mostra preview con conteggio prima della conferma definitiva)." aria-label="Elimina">
                              <Icon name="trash" size={14} />
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

        </>)}

        {/* ═══ PENDING APPROVALS (NEW · audit 2026-06-21) ═════════════ */}
        {adminTab === 'pending' && (<>
          <Card style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong style={{ fontSize: 14 }}>⏳ Iscrizioni in attesa di approvazione</strong>
                <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
                  Nuove organizzazioni che hanno fatto signup. Approva quelle vere, rifiuta lo scam.
                </div>
              </div>
              <Btn kind="neutral" size="sm" onClick={fetchPending} disabled={pendingLoading}>
                {pendingLoading ? '…' : <Icon name="refresh" size={13} />}
              </Btn>
            </div>
            {pendingOrgs.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
                {pendingLoading ? 'Caricamento…' : 'Nessuna org in attesa. Tutti i nuovi signup sono stati gestiti.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingOrgs.map(o => {
                  const ageH = (Date.now() - new Date(o.created_at).getTime()) / 3600000
                  const ageLabel = ageH < 1 ? `${Math.round(ageH * 60)}min`
                    : ageH < 24 ? `${Math.round(ageH)}h`
                    : `${Math.round(ageH / 24)}gg`
                  const isOld = ageH > 24
                  return (
                    <div key={o.id} style={{
                      padding: '14px 16px',
                      background: isOld ? COLORS.warnBg : COLORS.card,
                      border: `1px solid ${isOld ? COLORS.warn : COLORS.border}`,
                      borderRadius: 10,
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 12, alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: COLORS.text, marginBottom: 4 }}>
                          {o.nome} <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.textMute, textTransform: 'capitalize' }}>· {o.tipo || 'attività'}</span>
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.textSoft }}>
                          {o.titolare_email}
                          {o.titolare_nome && <> · <span style={{ color: COLORS.textMute }}>{o.titolare_nome}</span></>}
                        </div>
                        <div style={{ fontSize: 11, color: isOld ? COLORS.warn : COLORS.textMute, marginTop: 4 }}>
                          iscritta {ageLabel} fa {isOld && <strong>(da rispondere)</strong>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Btn kind="success" size="sm" onClick={() => approvaSignup(o.id)}>
                          <Icon name="check" size={13} /> Approva
                        </Btn>
                        <Btn kind="danger" size="sm" onClick={() => rifiutaSignup(o.id, o.nome)}>
                          <Icon name="x" size={13} /> Rifiuta e cancella
                        </Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ marginTop: 14, padding: 10, background: COLORS.blueBg, borderRadius: 8, fontSize: 11, color: COLORS.blue, border: `1px solid ${COLORS.blue}` }}>
              <strong>Come funziona:</strong> ogni nuovo titolare che si registra parte con <code>in_attesa=true</code>. Vede una schermata "Stiamo verificando il tuo account" e non può usare l'app finché non lo approvi qui. Si refresha ogni 30s. Le org si possono anche bloccare/sbloccare dopo dalla tabella Clienti.
            </div>
          </Card>
        </>)}

        {/* ═══ ACTIVITY (NEW · audit 2026-06-20) ═══════════════════════ */}
        {adminTab === 'activity' && (<>
          <Card style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
                <Icon name="bolt" size={14} /> Cosa succede adesso
                <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.textMute, marginLeft: 10 }}>
                  ultimi 80 eventi · si aggiorna ogni 12 secondi
                </span>
              </h3>
              <Btn kind="neutral" size="sm" onClick={fetchActivity} disabled={activityLoading}>
                {activityLoading ? '…' : <Icon name="refresh" size={13} />}
              </Btn>
            </div>
            {activity.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
                Nessun evento recente. {activityLoading && '(caricamento…)'}
              </div>
            ) : (
              <div style={{ maxHeight: 600, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
                {activity.map((ev, i) => {
                  const sevColor = ev.severity === 'err' ? COLORS.err : ev.severity === 'warn' ? COLORS.warn : COLORS.textMute
                  const sevBg = ev.severity === 'err' ? COLORS.errBg : ev.severity === 'warn' ? COLORS.warnBg : 'transparent'
                  const ago = (() => {
                    const ms = Date.now() - new Date(ev.ts).getTime()
                    if (ms < 60_000) return 'adesso'
                    if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m fa`
                    if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h fa`
                    return `${Math.floor(ms / 86400_000)}g fa`
                  })()
                  const cliente = ev.org_id ? clienti.find(c => c.org_id === ev.org_id) : null
                  return (
                    <div key={`${ev.kind}-${ev.ref_id || i}`} style={{
                      padding: '10px 14px',
                      borderBottom: i < activity.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                      display: 'grid',
                      gridTemplateColumns: isAdminNarrow ? '70px 1fr' : '80px 90px 1fr 100px',
                      gap: 10, alignItems: 'center', fontSize: 12,
                      background: sevBg,
                      cursor: cliente ? 'pointer' : 'default',
                    }} onClick={() => cliente && apriDettaglio(cliente)}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                        color: sevColor, padding: '2px 6px', background: '#FFF', borderRadius: 4, textAlign: 'center',
                        border: `1px solid ${sevColor}`,
                      }}>{ev.kind}</span>
                      <span style={{ color: COLORS.textMute, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{ago}</span>
                      <div>
                        <div style={{ fontWeight: 600, color: COLORS.text }}>{ev.title}</div>
                        {ev.detail && <div style={{ color: COLORS.textMute, fontSize: 11, marginTop: 2 }}>{ev.detail}</div>}
                      </div>
                      <div style={{ color: COLORS.textMute, fontSize: 10, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cliente ? cliente.nome_attivita : (ev.code || '')}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </>)}

        {/* ═══ FUNNEL (NEW · audit 2026-06-20) ═════════════════════════ */}
        {adminTab === 'funnel' && (<>
          <Card style={{ marginBottom: 20, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
                <Icon name="trendUp" size={14} /> Onboarding funnel
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {[30, 60, 90, 180].map(d => (
                  <Btn key={d} kind={funnelDays === d ? 'primary' : 'neutral'} size="sm" onClick={() => setFunnelDays(d)}>
                    {d}gg
                  </Btn>
                ))}
                <Btn kind="neutral" size="sm" onClick={fetchFunnel} disabled={funnelLoading}>
                  {funnelLoading ? '…' : <Icon name="refresh" size={13} />}
                </Btn>
              </div>
            </div>
            {!funnel ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
                {funnelLoading ? 'Caricamento…' : 'Premi un periodo per caricare il funnel.'}
              </div>
            ) : funnel.n === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
                Nessun cliente registrato negli ultimi {funnelDays} giorni.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: COLORS.textMute, marginBottom: 14 }}>
                  Base: <strong style={{ color: COLORS.text }}>{funnel.n}</strong> clienti registrati ultimi {funnel.days} giorni
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {funnel.steps.map((s, i) => {
                    const prev = i > 0 ? funnel.steps[i - 1] : null
                    const dropOff = prev && prev.n > 0 ? Math.round(100 - 100 * s.n / prev.n) : 0
                    return (
                      <div key={s.key} style={{ display: 'grid', gridTemplateColumns: isAdminNarrow ? '1fr 60px 60px' : '180px 1fr 80px 80px', gap: 12, alignItems: 'center', fontSize: 13 }}>
                        <div style={{ fontWeight: 600, color: COLORS.text }}>{s.label}</div>
                        <div style={{ height: 22, background: COLORS.rowAlt, borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                          <div style={{
                            position: 'absolute', top: 0, left: 0, bottom: 0,
                            width: `${s.pct}%`,
                            background: s.pct >= 75 ? COLORS.ok : s.pct >= 40 ? COLORS.blue : s.pct >= 20 ? COLORS.warn : COLORS.err,
                            transition: 'width 250ms',
                          }} />
                          <span style={{ position: 'absolute', left: 8, top: 2, fontSize: 11, fontWeight: 700, color: '#FFF', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                            {s.n}
                          </span>
                        </div>
                        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, textAlign: 'right' }}>{s.pct}%</div>
                        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: dropOff > 30 ? COLORS.err : COLORS.textMute, textAlign: 'right' }}>
                          {prev && dropOff > 0 ? `-${dropOff}%` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 16, padding: 12, background: COLORS.warnBg, borderRadius: 8, fontSize: 11, color: COLORS.warn, border: `1px solid ${COLORS.warn}` }}>
                  <strong>Drop-off grossi</strong>: i punti dove perdi più del 30% sono opportunità di copy/UX da rifinire.
                </div>
              </>
            )}
          </Card>
        </>)}

        {adminTab === 'ops' && (<>
        {/* ── Metriche avanzate ──────────────────────────────────── */}
        {metricheAvanzate && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <Card style={{ padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800 }}><Icon name="trophy" size={16} /> Top 5 clienti più attivi</h3>
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
                Inattivi da &gt;7 giorni ({metricheAvanzate.inattivi.length})
              </h3>
              {metricheAvanzate.inattivi.length === 0 ? (
                <div style={{ color: COLORS.textMute, fontSize: 12 }}>Tutti i clienti sono attivi <Icon name="party" size={14} /></div>
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
              <strong style={{ fontSize: 14 }}><Icon name="euro" size={16} /> Prezzi piani</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>display landing + pannello abbonamento · checkout</span>
            </div>
            <Btn kind="neutral" size="sm" onClick={fetchPricing} disabled={pricingLoading}>{pricingLoading ? '…' : <Icon name="refresh" size={14} />}</Btn>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: COLORS.textMute, marginBottom: 12, lineHeight: 1.5 }}>
              Modifica il prezzo mostrato. Per cambiare l'importo <b>realmente addebitato</b>, crea un nuovo Price su Stripe
              e incolla qui il suo ID (<code>price_…</code>): il checkout userà quello. Ogni modifica richiede una conferma esplicita.
            </div>
            {['base', 'pro', 'enterprise'].map(plan => {
              const defaults = { base: { prezzo_mese_cents: 6900, nome_display: 'Bottega', descrizione: 'Per il banco singolo' }, pro: { prezzo_mese_cents: 14900, nome_display: 'Maestro', descrizione: 'Sostituisce un controller part-time' }, enterprise: { prezzo_mese_cents: 39900, nome_display: 'Insegna', descrizione: 'Per chi ha 3+ sedi' } }
              const def = defaults[plan]
              const row = pricing.find(p => p.plan === plan) || { plan, ...def, stripe_price_id: null }
              const inEdit = priceDraft?.plan === plan
              const euroAttuale = Number(row.prezzo_mese_cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              const nomeAttuale = row.nome_display || def.nome_display
              const descrAttuale = row.descrizione || def.descrizione
              return (
                <div key={plan} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10, background: inEdit ? '#FFFBEB' : COLORS.card }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 14 }}>{nomeAttuale}</strong>
                        <span style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>(DB: {plan})</span>
                        <span style={{ marginLeft: 6, fontSize: 18, fontWeight: 800, color: COLORS.accent }}>€{euroAttuale}</span>
                        <span style={{ fontSize: 11, color: COLORS.textMute }}>/mese</span>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 4, lineHeight: 1.4 }}>
                        {descrAttuale}
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 4 }}>
                        Stripe price: <code>{row.stripe_price_id || '- (usa env)'}</code>
                      </div>
                    </div>
                    {!inEdit && (
                      <Btn kind="neutral" size="sm" onClick={() => { setPriceDraft({ plan, euro: euroAttuale, stripe_price_id: row.stripe_price_id || '', nome_display: nomeAttuale, descrizione: descrAttuale }); setPriceConfirm(false) }}>
                        <Icon name="edit" size={14} /> Modifica
                      </Btn>
                    )}
                  </div>
                  {inEdit && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 11, color: COLORS.textSoft }}>
                          Nome display
                          <input type="text" value={priceDraft.nome_display || ''} maxLength={60}
                            onChange={e => { setPriceDraft(d => ({ ...d, nome_display: e.target.value })); setPriceConfirm(false) }}
                            style={{ display: 'block', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13, fontWeight: 700, width: 180 }} />
                        </label>
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
                      <label style={{ fontSize: 11, color: COLORS.textSoft }}>
                        Descrizione (claim ROI)
                        <textarea value={priceDraft.descrizione || ''} maxLength={300} rows={2}
                          onChange={e => { setPriceDraft(d => ({ ...d, descrizione: e.target.value })); setPriceConfirm(false) }}
                          style={{ display: 'block', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                      </label>
                      {!priceConfirm ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Btn kind="primary" size="sm" onClick={() => setPriceConfirm(true)}>Salva…</Btn>
                          <Btn kind="neutral" size="sm" onClick={() => { setPriceDraft(null); setPriceConfirm(false) }}>Annulla</Btn>
                        </div>
                      ) : (
                        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 8 }}>
                            Confermi piano <b>{plan}</b>: nome "{priceDraft.nome_display}" · prezzo <b>€{euroAttuale}</b> → <b>€{(parseFloat(String(priceDraft.euro).replace(',', '.')) || 0).toFixed(2)}</b>/mese?
                            {priceDraft.stripe_price_id && <> Stripe price <code>{priceDraft.stripe_price_id}</code>.</>}
                            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>
                              ⚠ I clienti già abbonati restano al loro prezzo Stripe attuale finché non disdicono.
                              Le nuove sottoscrizioni useranno il nuovo prezzo.
                            </div>
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
              <strong style={{ fontSize: 14 }}><Icon name="ticket" size={16} /> Codici sconto</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>
                {codici.length} codici · {codici.filter(c => c.attivo).length} attivi · {codici.reduce((s, c) => s + (c.redemptions || 0), 0)} utilizzi totali
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn kind="neutral" size="sm" onClick={fetchCodici} disabled={codiciLoading}>
                {codiciLoading ? '…' : <Icon name="refresh" size={14} />}
              </Btn>
              <Btn kind="warn" size="sm" onClick={() => setAdHocOpen(true)} title="Genera un codice personale per un cliente specifico (1 utilizzo)">
                <Icon name="gift" size={13} /> Ad-hoc per cliente
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
                            {c.tipo_sconto === 'percent' ? `-${c.valore_sconto}%` : `-€${Number(c.valore_sconto / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </span>
                          {c.valore_sconto === 100 && c.tipo_sconto === 'percent' && (
                            <div style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}><Icon name="gift" size={11} /> Gratis</div>
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
                          {c.scade_il ? fmtData(c.scade_il) : '-'}
                        </td>
                        <td style={td()}>
                          {!c.attivo ? <StatoBadge stato="bloccato" />
                            : scaduto ? <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Scaduto</span>
                            : limiteRaggiunto ? <span style={{ background: '#FEF3C7', color: '#92400E', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Esaurito</span>
                            : <span style={{ background: COLORS.okBg, color: COLORS.ok, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Attivo</span>}
                        </td>
                        <td style={{ ...td(), color: COLORS.textSoft, fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.descrizione || ''}>
                          {c.descrizione || '-'}
                        </td>
                        <td style={td()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Btn kind="neutral" size="sm" onClick={() => { navigator.clipboard.writeText(c.codice).catch(() => {}) }} title="Copia codice">
                              <Icon name="clipboard" size={14} />
                            </Btn>
                            <Btn kind="neutral" size="sm" onClick={() => openRedemptions(c.codice)} title="Vedi chi ha usato questo codice">
                              <Icon name="users" size={14} />
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
                                <Icon name="pause" size={14} />
                              </Btn>
                            )}
                            <Btn kind="danger" size="sm"
                              onClick={async () => {
                                if (!confirm(`Eliminare definitivamente il codice ${c.codice}?\n${usato > 0 ? 'Ha già ' + usato + ' utilizzi.' : ''}`)) return
                                try {
                                  await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ tipo: 'elimina_codice_sconto', id: c.id }) })
                                  fetchCodici()
                                } catch (e) { toast.error(e.message) }
                              }}
                              title="Elimina">
                              <Icon name="trash" size={14} />
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

        {/* ═══ REFERRAL admin (audit 2026-06-21) ═════════════════════ */}
        <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong style={{ fontSize: 14 }}><Icon name="gift" size={14} /> Programma referral</strong>
              <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
                Top referrer · mesi gratis distribuiti · cap anti-scam
              </div>
            </div>
            <Btn kind="neutral" size="sm" onClick={fetchRefAdmin} disabled={refAdminLoading}>
              {refAdminLoading ? '…' : <Icon name="refresh" size={13} />}
            </Btn>
          </div>
          {!refAdmin ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              {refAdminLoading ? 'Caricamento…' : 'Apri la sezione per caricare i dati.'}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: 14 }}>
                <div style={{ padding: 12, background: COLORS.rowAlt, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: COLORS.textMute, textTransform: 'uppercase', fontWeight: 700 }}>Codici usati totali</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{refAdmin.totale_utilizzi || 0}</div>
                </div>
                <div style={{ padding: 12, background: COLORS.okBg, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: COLORS.ok, textTransform: 'uppercase', fontWeight: 700 }}>Mesi gratis distribuiti</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.ok }}>{refAdmin.totale_mesi_distribuiti || 0}</div>
                </div>
                <div style={{ padding: 12, background: COLORS.blueBg, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: COLORS.blue, textTransform: 'uppercase', fontWeight: 700 }}>Top referrer attivi</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.blue }}>{(refAdmin.top || []).length}</div>
                </div>
              </div>
              {(refAdmin.top || []).length > 0 && (
                <div style={{ borderTop: `1px solid ${COLORS.border}`, maxHeight: 300, overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: COLORS.rowAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                        <th style={th()}>Cliente</th>
                        <th style={th()}>Codice</th>
                        <th style={{ ...th(), textAlign: 'right' }}>Inviti</th>
                        <th style={{ ...th(), textAlign: 'right' }}>Mesi bonus accumulati</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refAdmin.top.map(r => {
                        const cliente = clienti.find(c => c.org_id === r.organization_id)
                        return (
                          <tr key={r.codice} style={{ borderBottom: `1px solid ${COLORS.border}`, cursor: cliente ? 'pointer' : 'default' }}
                            onClick={() => cliente && apriDettaglio(cliente)}>
                            <td style={{ ...td(), fontWeight: 700 }}>{r.nome}</td>
                            <td style={{ ...td(), fontFamily: 'monospace', color: COLORS.accent }}>{r.codice}</td>
                            <td style={{ ...td(), textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.utilizzi}</td>
                            <td style={{ ...td(), textAlign: 'right', fontWeight: 700, color: COLORS.ok, fontVariantNumeric: 'tabular-nums' }}>{r.mesi_bonus_totali}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>

        {/* ── Stripe events feed ─────────────────────────────────── */}
        <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 14 }}>Eventi Stripe recenti</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>{stripeEvents.length} eventi · subscription, charge, invoice, checkout</span>
            </div>
            <Btn kind="neutral" size="sm" onClick={fetchStripeEvents} disabled={stripeEventsLoading}>{stripeEventsLoading ? '…' : <Icon name="refresh" size={14} />}</Btn>
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
                          {e.customer_email || (e.customer_id ? <code>{e.customer_id.slice(0, 16)}…</code> : '-')}
                        </td>
                        <td style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {e.amount_cents != null ? `${Number(e.amount_cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${(e.currency || 'EUR').toUpperCase()}` : ''}
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
              <strong style={{ fontSize: 14 }}><Icon name="mail" size={16} /> Feedback dai clienti</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>
                {feedback.length}{feedbackSoloDaGestire ? ' da gestire' : ' totali'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: COLORS.textSoft, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={feedbackSoloDaGestire} onChange={e => setFeedbackSoloDaGestire(e.target.checked)} />
                Solo da gestire
              </label>
              <Btn kind="neutral" size="sm" onClick={fetchFeedback} disabled={feedbackLoading}>{feedbackLoading ? '…' : <Icon name="refresh" size={14} />}</Btn>
            </div>
          </div>
          {feedback.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              {feedbackSoloDaGestire ? 'Nessun feedback da gestire' : 'Nessun feedback ricevuto ancora'}
            </div>
          ) : (
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {feedback.map(f => {
                const sentMap = {
                  bug:         { bg: COLORS.errBg,  fg: COLORS.err,  icon: 'bug',  lbl: 'Bug' },
                  feature:     { bg: COLORS.blueBg, fg: COLORS.blue, icon: 'bulb', lbl: 'Idea' },
                  feedback:    { bg: COLORS.rowAlt, fg: COLORS.textSoft, icon: 'chat', lbl: 'Feedback' },
                  complimento: { bg: COLORS.okBg,   fg: COLORS.ok,   icon: 'party', lbl: 'Complimento' },
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
                      <span style={{ background: s.bg, color: s.fg, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={s.icon} size={11} /> {s.lbl}</span>
                      <strong style={{ fontSize: 13, color: COLORS.text }}>{f.nome_attivita || '-'}</strong>
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
                      {f.view_corrente && <span><Icon name="pin" size={11} /> {f.view_corrente}</span>}
                      {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ color: COLORS.accent, textDecoration: 'none' }}>apri pagina</a>}
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
              <strong style={{ fontSize: 14 }}>Banner globali</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>annuncio mostrato a tutti i clienti in cima all'app</span>
            </div>
            <Btn kind="neutral" size="sm" onClick={fetchBanners} disabled={bannersLoading}>{bannersLoading ? '…' : <Icon name="refresh" size={14} />}</Btn>
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
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="critical">critical</option>
                <option value="success">success</option>
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
                  info: { bg: '#EFF6FF', fg: '#1E3A8A', icon: null, lbl: 'info' },
                  warn: { bg: '#FEF9C3', fg: '#854D0E', icon: 'warning', lbl: 'warn' },
                  critical: { bg: '#FEE2E2', fg: '#991B1B', icon: 'alert', lbl: 'critical' },
                  success: { bg: '#DCFCE7', fg: '#166534', icon: 'checkCircle', lbl: 'success' },
                }
                const t = tipoMap[b.tipo] || tipoMap.info
                return (
                  <div key={b.id} style={{
                    padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`,
                    background: b.attivo && !scaduto ? COLORS.card : COLORS.rowAlt,
                    opacity: !b.attivo || scaduto ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ background: t.bg, color: t.fg, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{t.icon && <Icon name={t.icon} size={11} />}{t.lbl}</span>
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
                        }}><Icon name="pause" size={14} /> Disattiva</Btn>
                      )}
                      <Btn kind="danger" size="sm" onClick={async () => {
                        if (!confirm('Eliminare definitivamente?')) return
                        try {
                          await apiCall('/api/admin', { method: 'POST', body: JSON.stringify({ tipo: 'banner_elimina', id: b.id }) })
                          fetchBanners()
                        } catch (e) { toast.error(e.message) }
                      }}><Icon name="trash" size={14} /></Btn>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* ── Email domain blocklist (Audit 2026-06-19) ─────────────── */}
        <Card style={{ marginBottom: 30, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <strong style={{ fontSize: 14 }}>
              <Icon name="lock" size={14} /> Blocklist domini email
            </strong>
            <span style={{ fontSize: 12, color: COLORS.textMute }}>
              {blocklist.length} domini bloccati
            </span>
            <div style={{ flex: 1 }} />
            <Btn kind="neutral" size="sm" onClick={fetchBlocklist} disabled={blocklistLoading}>
              {blocklistLoading ? '…' : <Icon name="refresh" size={14} />}
            </Btn>
          </div>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, background: COLORS.rowAlt }}>
            <div style={{ fontSize: 11, color: COLORS.textMute, marginBottom: 8 }}>
              Aggiungi un dominio (es. <code>mailinator.com</code>, <code>tempmail.io</code>): chi prova
              a registrarsi con un'email @dominio verrà respinto al signup. Il check è in
              <code> handle_new_user</code> trigger Supabase, fail-open su errori.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={nuovoBlocco.domain}
                onChange={e => setNuovoBlocco({ ...nuovoBlocco, domain: e.target.value })}
                placeholder="dominio.com"
                style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12, minWidth: 200 }}
              />
              <input
                value={nuovoBlocco.motivo}
                onChange={e => setNuovoBlocco({ ...nuovoBlocco, motivo: e.target.value })}
                placeholder="Motivo (opzionale, es. 'email temporanea')"
                style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 12, flex: 1, minWidth: 200 }}
              />
              <Btn kind="danger" size="sm" onClick={aggiungiBlocco}>
                <Icon name="plus" size={13} /> Blocca
              </Btn>
            </div>
          </div>
          {blocklist.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              Nessun dominio bloccato. La blocklist è vuota.
            </div>
          ) : (
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: COLORS.rowAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={th()}>Dominio</th>
                  <th style={th()}>Motivo</th>
                  <th style={th()}>Aggiunto da</th>
                  <th style={th()}>Quando</th>
                  <th style={th()}></th>
                </tr>
              </thead>
              <tbody>
                {blocklist.map(b => (
                  <tr key={b.domain} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ ...td(), fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 700, color: COLORS.err }}>
                      @{b.domain}
                    </td>
                    <td style={td()}>{b.motivo || <span style={{ color: COLORS.textMute }}>-</span>}</td>
                    <td style={{ ...td(), color: COLORS.textMute }}>{b.created_by || '-'}</td>
                    <td style={{ ...td(), color: COLORS.textMute }}>{fmtDataOra(b.created_at)}</td>
                    <td style={{ ...td(), textAlign: 'right' }}>
                      <Btn kind="ghost" size="sm" onClick={() => rimuoviBlocco(b.domain)} title="Sblocca">
                        <Icon name="x" size={13} />
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* ═══ SQL EDITOR read-only (audit 2026-06-20) ════════════════ */}
        <Card style={{ marginBottom: 30, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong style={{ fontSize: 14 }}><Icon name="tool" size={14} /> SQL editor (read-only)</strong>
              <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
                Solo SELECT/WITH · max 500 righe · whitelist tabelle · 0 DDL/DML
              </div>
            </div>
            <Btn kind="primary" onClick={runSqlQuery} disabled={sqlRunning}>
              {sqlRunning ? <><Icon name="hourglass" size={13} /> Esecuzione…</> : <><Icon name="bolt" size={13} /> Run query</>}
            </Btn>
          </div>
          {/* Pre-built queries */}
          <div style={{ fontSize: 11, color: COLORS.textMute, marginBottom: 6, fontWeight: 600 }}>Query rapide:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {[
              { label: 'Top 20 paganti per MRR', q: `select o.id, o.nome, o.piano, o.stripe_status, o.created_at\nfrom organizations o\nwhere o.approvato = true\norder by o.created_at desc\nlimit 20` },
              { label: 'Clienti trial >30gg senza pagare', q: `select o.id, o.nome, o.trial_ends_at, o.created_at\nfrom organizations o\nwhere o.approvato = false\n  and o.created_at < now() - interval '30 days'\norder by o.created_at\nlimit 50` },
              { label: 'Top 10 per # user_data', q: `select organization_id, count(*) as n_rows, max(updated_at) as last_update\nfrom user_data\ngroup by organization_id\norder by n_rows desc\nlimit 10` },
              { label: 'Errori ultime 24h per endpoint', q: `select endpoint, code, count(*) as n\nfrom error_log\nwhere created_at > now() - interval '24 hours'\ngroup by endpoint, code\norder by n desc\nlimit 30` },
              { label: 'Cost AI per cliente ultimo mese', q: `select organization_id, sum(cost_usd_estimated) as cost, sum(calls) as calls\nfrom ai_usage_daily\nwhere date > current_date - 30\ngroup by organization_id\norder by cost desc\nlimit 30` },
              { label: 'Fatture aperte over 60gg', q: `select organization_id, fornitore_nome, importo, data_scadenza\nfrom fatture\nwhere data_scadenza < now() - interval '60 days'\n  and coalesce(importo_pagato, 0) < importo\norder by data_scadenza\nlimit 50` },
              { label: 'Push subscriptions per org', q: `select organization_id, count(*) as n_dispositivi\nfrom push_subscriptions\nwhere active = true\ngroup by organization_id\norder by n_dispositivi desc\nlimit 30` },
              { label: 'Feedback non gestiti', q: `select id, sentiment, user_email, messaggio, created_at\nfrom feedback\nwhere coalesce(gestito, false) = false\norder by created_at desc\nlimit 30` },
            ].map((p, i) => (
              <button key={i} onClick={() => setSqlQuery(p.q)}
                style={{ background: COLORS.rowAlt, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, color: COLORS.textSoft, cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            value={sqlQuery}
            onChange={e => setSqlQuery(e.target.value)}
            rows={8}
            spellCheck={false}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 12,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              border: `1px solid ${COLORS.border}`, background: '#FAFAFA',
              resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
            }}
          />
          {sqlError && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: COLORS.errBg, color: COLORS.err, borderRadius: 8, fontSize: 12, border: `1px solid ${COLORS.err}` }}>
              <Icon name="warning" size={13} /> {sqlError}
              {sqlError.includes('admin_safe_select') && (
                <div style={{ marginTop: 6, fontSize: 11 }}>
                  Applica la migration <code>20260704_admin_safe_select.sql</code> in Supabase SQL editor per abilitare l'editor.
                </div>
              )}
            </div>
          )}
          {sqlResult && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: COLORS.textMute, marginBottom: 6 }}>
                {sqlResult.count} righe · query: <code style={{ fontSize: 10 }}>{(sqlResult.query || '').slice(0, 120)}…</code>
              </div>
              {sqlResult.rows.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>Nessuna riga.</div>
              ) : (
                <div style={{ overflowX: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8, maxHeight: 400, overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 11, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                    <thead>
                      <tr style={{ background: COLORS.rowAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                        {Object.keys(sqlResult.rows[0]).map(col => (
                          <th key={col} style={{ ...th(), fontSize: 10, fontFamily: 'inherit' }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sqlResult.rows.slice(0, 100).map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                          {Object.values(row).map((v, j) => (
                            <td key={j} style={{ ...td(), fontFamily: 'inherit', fontSize: 11, color: COLORS.textSoft, whiteSpace: 'nowrap', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}
                              title={String(v)}>
                              {v === null ? <span style={{ color: COLORS.textMute, fontStyle: 'italic' }}>null</span>
                                : typeof v === 'object' ? JSON.stringify(v).slice(0, 80)
                                : String(v).slice(0, 80)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sqlResult.rows.length > 100 && (
                    <div style={{ padding: 8, textAlign: 'center', fontSize: 10, color: COLORS.textMute, background: COLORS.rowAlt }}>
                      Mostro le prime 100 righe su {sqlResult.count}. Stringi la query per vedere tutto.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        </>)}

        {adminTab === 'security' && (<>
        {/* ── Log attività ───────────────────────────────────────── */}
        <Card style={{ padding: 0, marginBottom: 30 }}>
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <strong style={{ fontSize: 14 }}><Icon name="clipboard" size={16} /> Log attività recenti</strong>
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

        </>)}

        {adminTab === 'ops' && (<>
        {/* ── Manutenzione: migra integrazioni legacy → encrypted ─────────── */}
        <Card style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}><Icon name="lock" size={16} /> Migrazione integrazioni → AES-256-GCM</h3>
              <div style={{ fontSize: 11, color: COLORS.textMute, maxWidth: 600 }}>
                Cifra in batch tutte le righe <code>public.integrazioni</code> con <code>encryption_version=0</code> (legacy). Idempotente: ri-eseguire non tocca le righe già v=1. Richiede <code>INTEGRATIONS_ENCRYPTION_KEY</code> in Vercel.
              </div>
            </div>
            <Btn kind="warn" size="sm"
              onClick={async () => {
                if (!confirm('Cifrare tutte le integrazioni legacy?\nL\'operazione e\' idempotente.')) return
                try {
                  const res = await apiCall('/api/admin?action=migrate_integrazioni')
                  const data = await res.json()
                  toast.success(`✓ Migrate ${data.migrated}/${data.total} integrazioni - errori: ${data.errors?.length || 0}`)
                  if (data.errors?.length) console.error('migrate errors:', data.errors)
                } catch (e) {
                  toast.error(`Errore migrazione: ${e.message}`)
                }
              }}>
              <Icon name="lock" size={14} /> Esegui migrazione
            </Btn>
          </div>
        </Card>

        </>)}

        {adminTab === 'health' && (<>
        {/* ── Errori produzione (alternativa Sentry, da public.error_log) ── */}
        <Card style={{ marginBottom: 30, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 14 }}><Icon name="bug" size={16} /> Errori produzione</strong>
              <span style={{ fontSize: 12, color: COLORS.textMute }}>
                {errori.length} eventi · raccolti via safeError(supabase) da edge functions
              </span>
            </div>
            <Btn kind="neutral" size="sm" onClick={fetchErrori} disabled={erroriLoading}>{erroriLoading ? '…' : <Icon name="refresh" size={14} />}</Btn>
          </div>
          {errori.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              {erroriLoading ? 'Caricamento…' : 'Nessun errore catturato. Bene così.'}
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {errori.map(e => (
                <div key={e.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, padding: '1px 6px', background: COLORS.rowAlt, borderRadius: 4, color: COLORS.text, fontWeight: 600 }}>
                      {e.endpoint || '-'}{e.operation ? `:${e.operation}` : ''}
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

        {/* ═══ ERRORS GROUPED (NEW · audit 2026-06-20) ════════════════ */}
        <Card style={{ marginTop: 16, padding: 0 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}><Icon name="warning" size={14} /> Errori raggruppati</strong>
            <span style={{ fontSize: 11, color: COLORS.textMute }}>per endpoint + codice · ultimi {errorsGroupedDays} giorni</span>
            <span style={{ flex: 1 }} />
            <select value={errorsGroupedDays} onChange={e => setErrorsGroupedDays(parseInt(e.target.value, 10))}
              style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: '#fff' }}>
              <option value={1}>24h</option>
              <option value={7}>7gg</option>
              <option value={30}>30gg</option>
              <option value={90}>90gg</option>
            </select>
            <Btn kind="neutral" size="sm" onClick={fetchErrorsGrouped} disabled={errorsGroupedLoading}>
              {errorsGroupedLoading ? '…' : <Icon name="refresh" size={13} />}
            </Btn>
          </div>
          {errorsGrouped.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              {errorsGroupedLoading ? 'Caricamento…' : 'Nessun errore raggruppato in questo periodo.'}
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: COLORS.rowAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                    <th style={th()}>Endpoint:operation</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Count</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Users</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Orgs</th>
                    <th style={th()}>Codice</th>
                    <th style={th()}>Sample message</th>
                  </tr>
                </thead>
                <tbody>
                  {errorsGrouped.slice(0, 50).map((g, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ ...td(), fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 600 }}>
                        {g.endpoint}{g.operation ? `:${g.operation}` : ''}
                      </td>
                      <td style={{ ...td(), textAlign: 'right', fontWeight: 700, color: g.count > 20 ? COLORS.err : COLORS.text, fontVariantNumeric: 'tabular-nums' }}>{g.count}</td>
                      <td style={{ ...td(), textAlign: 'right', color: COLORS.textMute, fontVariantNumeric: 'tabular-nums' }}>{g.n_users}</td>
                      <td style={{ ...td(), textAlign: 'right', color: COLORS.textMute, fontVariantNumeric: 'tabular-nums' }}>{g.n_orgs}</td>
                      <td style={{ ...td(), fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10 }}>
                        <span style={{ padding: '1px 5px', background: COLORS.errBg, color: COLORS.err, borderRadius: 4, fontWeight: 700 }}>{g.code}</span>
                      </td>
                      <td style={{ ...td(), fontSize: 11, color: COLORS.textSoft, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.sample_message}>
                        {g.sample_message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ═══ AI COST PER CUSTOMER (NEW · audit 2026-06-20) ══════════ */}
        <Card style={{ marginTop: 16, padding: 0 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}><Icon name="coins" size={14} /> Costi AI per cliente</strong>
            <span style={{ fontSize: 11, color: COLORS.textMute }}>
              ultimi {aiCostDays} gg · totale {aiCost ? '$' + Number(aiCost.total_cost_usd || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
            </span>
            <span style={{ flex: 1 }} />
            <select value={aiCostDays} onChange={e => setAiCostDays(parseInt(e.target.value, 10))}
              style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: '#fff' }}>
              <option value={7}>7gg</option>
              <option value={30}>30gg</option>
              <option value={90}>90gg</option>
              <option value={365}>1 anno</option>
            </select>
            <Btn kind="neutral" size="sm" onClick={fetchAiCost} disabled={aiCostLoading}>
              {aiCostLoading ? '…' : <Icon name="refresh" size={13} />}
            </Btn>
          </div>
          {!aiCost || (aiCost.customers || []).length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              {aiCostLoading ? 'Caricamento…' : 'Nessuna chiamata AI in questo periodo.'}
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: COLORS.rowAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                    <th style={th()}>Cliente</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Costo USD</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Calls</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Tokens in/out</th>
                    <th style={th()}>Top feature</th>
                    <th style={th()}>Ultima call</th>
                  </tr>
                </thead>
                <tbody>
                  {aiCost.customers.slice(0, 100).map((c, i) => {
                    const cliente = clienti.find(cl => cl.org_id === c.organization_id)
                    return (
                      <tr key={c.organization_id} style={{ borderBottom: `1px solid ${COLORS.border}`, cursor: cliente ? 'pointer' : 'default' }}
                        onClick={() => cliente && apriDettaglio(cliente)}>
                        <td style={{ ...td(), fontWeight: 600 }}>
                          {c.nome || (c.organization_id || '').slice(0, 8) + '…'}
                        </td>
                        <td style={{ ...td(), textAlign: 'right', fontWeight: 700, color: c.total_cost_usd > 5 ? COLORS.err : c.total_cost_usd > 1 ? COLORS.warn : COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                          ${Number(c.total_cost_usd).toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </td>
                        <td style={{ ...td(), textAlign: 'right', color: COLORS.textMute, fontVariantNumeric: 'tabular-nums' }}>{c.total_calls}</td>
                        <td style={{ ...td(), textAlign: 'right', color: COLORS.textMute, fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>
                          {Math.round(c.tokens_in / 1000)}k / {Math.round(c.tokens_out / 1000)}k
                        </td>
                        <td style={{ ...td(), fontSize: 11 }}>
                          {c.top_features.map(f => `${f.feature} $${Number(f.cost_usd).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(' · ')}
                        </td>
                        <td style={{ ...td(), color: COLORS.textMute, fontSize: 11 }}>{c.last_call_at ? fmtDataOra(c.last_call_at) : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        </>)}

        {adminTab === 'ai' && (<>
        {/* ── AI Telemetry & Costs (audit 2026-06-14) ──────────── */}
        <Card style={{ marginTop: 16, padding: 0 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 14 }}><Icon name="sparkles" size={16} /> AI Telemetry & Costs</strong>
              <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
                Volumi e costo stimato per le 12+ feature AI (Claude API) negli ultimi {aiTelemetry?.periodo_giorni || aiTelemetryDays} giorni
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <select value={aiTelemetryDays} onChange={e => { const d = parseInt(e.target.value, 10); setAiTelemetryDays(d); fetchAiTelemetry(d) }} style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: '#fff' }}>
              <option value={1}>24h</option>
              <option value={7}>7 giorni</option>
              <option value={30}>30 giorni</option>
            </select>
            <button onClick={() => fetchAiTelemetry()} style={{ fontSize: 11, padding: '4px 10px', background: COLORS.rowAlt, border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: 'pointer' }}>↻</button>
          </div>
          {aiTelemetryLoading ? (
            <div style={{ padding: 18, fontSize: 12, color: COLORS.textMute }}>Caricamento telemetria…</div>
          ) : !aiTelemetry ? (
            <div style={{ padding: 18, fontSize: 12, color: COLORS.textMute }}>Nessun dato.</div>
          ) : (
            <>
              <div style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.rowAlt }}>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>Costo stimato (USD)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    ${(aiTelemetry.costi?.usd_estimated || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                    ≈ € {(aiTelemetry.costi?.eur_estimated || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>Daily Brief</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {(aiTelemetry.daily_brief?.tot ?? 0).toLocaleString('it-IT')}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                    {aiTelemetry.daily_brief?.sent ?? 0} inviati · OR {aiTelemetry.daily_brief?.open_rate ?? '-'}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>Brain msgs</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {(aiTelemetry.brain?.messaggi_tot ?? 0).toLocaleString('it-IT')}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                    {aiTelemetry.brain?.conversazioni ?? 0} conv
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>OCR fatture</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {(aiTelemetry.ocr_fatture?.estratte ?? 0).toLocaleString('it-IT')}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                    avg conf {aiTelemetry.ocr_fatture?.avg_confidence ?? '-'}
                  </div>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead style={{ background: COLORS.rowAlt }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 600 }}>Feature AI</th>
                      <th style={{ textAlign: 'right', padding: '8px 14px', fontWeight: 600 }}>Metrica principale</th>
                      <th style={{ textAlign: 'right', padding: '8px 14px', fontWeight: 600 }}>Valore</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '6px 14px' }}>AI Suggestions</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', color: COLORS.textMute }}>azione</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{aiTelemetry.ai_suggestions?.agito ?? 0}/{aiTelemetry.ai_suggestions?.tot ?? 0} ({aiTelemetry.ai_suggestions?.action_rate ?? '-'}%)</td>
                    </tr>
                    <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '6px 14px' }}>Recipe Inventor</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', color: COLORS.textMute }}>salvate</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{aiTelemetry.recipe_inventor?.ricette_salvate ?? 0}/{aiTelemetry.recipe_inventor?.ricette_generate ?? 0} ({aiTelemetry.recipe_inventor?.save_rate ?? '-'}%)</td>
                    </tr>
                    <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '6px 14px' }}>Forecast vendite</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', color: COLORS.textMute }}>righe</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(aiTelemetry.forecast?.righe_generate ?? 0).toLocaleString('it-IT')}</td>
                    </tr>
                    <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '6px 14px' }}>Documentary AI</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', color: COLORS.textMute }}>snapshot</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{aiTelemetry.documentary?.snapshot_creati ?? 0}</td>
                    </tr>
                    <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '6px 14px' }}>Competitor pricing</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', color: COLORS.textMute }}>prezzi</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(aiTelemetry.competitor_pricing?.prezzi_tracciati ?? 0).toLocaleString('it-IT')}</td>
                    </tr>
                    <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '6px 14px' }}>POS scontrini</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', color: COLORS.textMute }}>ricevuti</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(aiTelemetry.pos_scontrini?.ricevuti ?? 0).toLocaleString('it-IT')}</td>
                    </tr>
                    <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '6px 14px' }}>WhatsApp Bot</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', color: COLORS.textMute }}>numeri attivi</td>
                      <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{aiTelemetry.whatsapp?.numeri_attivi ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {aiTelemetry.costi?.detail && (
                <div style={{ padding: '8px 18px', fontSize: 10, color: COLORS.textMute, borderTop: `1px solid ${COLORS.border}`, background: COLORS.rowAlt }}>
                  {aiTelemetry.costi.detail}
                </div>
              )}
            </>
          )}
        </Card>

        </>)}

        {adminTab === 'health' && (<>
        {/* ── Health: cron + deploy + esterni (audit 2026-06-14) ── */}
        <Card style={{ marginTop: 16, padding: 0 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 14 }}><Icon name="bolt" size={16} /> Health & Cron</strong>
              <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
                Stato job notturni, ultime build Vercel e dimensioni tabelle critiche
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <button onClick={() => fetchHealth()} style={{ fontSize: 11, padding: '4px 10px', background: COLORS.rowAlt, border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: 'pointer' }}>↻ Aggiorna</button>
          </div>
          {healthLoading ? (
            <div style={{ padding: 18, fontSize: 12, color: COLORS.textMute }}>Caricamento snapshot…</div>
          ) : !healthSnap ? (
            <div style={{ padding: 18, fontSize: 12, color: COLORS.textMute }}>Nessun dato.</div>
          ) : (
            <>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Cron status</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  {(healthSnap.cron || []).map(c => {
                    const ok = c.status === 'ok'
                    const bg = ok ? '#ecfdf5' : c.status === 'late' || c.status === 'error' ? '#fef2f2' : '#fffbeb'
                    const sym = ok ? '✓' : c.status === 'pending' ? '⏳' : '✗'
                    return (
                      <div key={c.id} style={{ padding: '8px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: bg }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{sym} {c.id}</div>
                        <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                          Tabella: <code>{c.table || '-'}</code> · atteso ~{c.expected_hour_utc ?? '?'}:00 UTC
                        </div>
                        <div style={{ fontSize: 10, color: COLORS.textMute, marginTop: 2 }}>
                          Ultimo run: {c.last_run ? fmtDataOra(c.last_run) : '-'}{c.hours_ago != null ? ` (${c.hours_ago}h fa)` : ''}
                        </div>
                        {c.error && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{c.error}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Errori produzione 24h</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: (healthSnap.errori_ultime_24h || 0) > 0 ? '#dc2626' : '#059669' }}>
                  {healthSnap.errori_ultime_24h ?? '-'}
                </div>
              </div>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Build Vercel</div>
                <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                  commit: <strong>{healthSnap.build?.git_commit || '-'}</strong> · branch: {healthSnap.build?.git_branch || '-'} · env: {healthSnap.build?.vercel_env || '-'}
                </div>
              </div>
              <div style={{ padding: '12px 18px' }}>
                <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Dimensioni tabelle</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
                  {Object.entries(healthSnap.table_counts || {}).map(([t, n]) => (
                    <div key={t} style={{ padding: '4px 8px', background: COLORS.rowAlt, borderRadius: 4, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: COLORS.textMute }}>{t}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{typeof n === 'number' ? n.toLocaleString('it-IT') : (n ?? '-')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>

        </>)}

        {adminTab === 'ai' && (<>
        {/* ── Usage analytics: quali view i clienti usano (audit 2026-06-14) ── */}
        <Card style={{ marginTop: 16, padding: 0 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 14 }}><Icon name="barChart" size={16} /> Utilizzo feature</strong>
              <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
                Quali view/tool i clienti aprono di più o di meno (ultimi {usageStats?.periodo_giorni || usageDays} giorni)
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <select value={usageDays} onChange={e => { const d = parseInt(e.target.value, 10); setUsageDays(d); fetchUsageStats(d) }} style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: '#fff' }}>
              <option value={7}>7 giorni</option>
              <option value={30}>30 giorni</option>
              <option value={90}>90 giorni</option>
            </select>
            <button onClick={() => fetchUsageStats()} style={{ fontSize: 11, padding: '4px 10px', background: COLORS.rowAlt, border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: 'pointer' }}>↻</button>
          </div>
          {usageLoading ? (
            <div style={{ padding: 18, fontSize: 12, color: COLORS.textMute }}>Caricamento…</div>
          ) : !usageStats || (usageStats.top_view?.length || 0) === 0 ? (
            <div style={{ padding: 18, fontSize: 12, color: COLORS.textMute }}>
              Nessun dato di utilizzo ancora. Il tracking (RPC <code>track_view_open</code>) inizia a popolare la tabella view_usage_daily dal prossimo deploy: ogni cliente che apre una view genera un record giornaliero.
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.rowAlt }}>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>View tracciate</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {(usageStats.totale_view_tracciate || 0).toLocaleString('it-IT')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>Picco DAU</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {Math.max(0, ...(usageStats.dau_daily || []).map(d => d.dau || 0))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>Giorni con attività</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {(usageStats.dau_daily?.length || 0)}
                  </div>
                </div>
              </div>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Top 15 view più aperte</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead style={{ background: COLORS.rowAlt }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>#</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>View</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>Aperture</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>Utenti unici</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>Org uniche</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>Giorni attivi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(usageStats.top_view || []).map((v, i) => (
                        <tr key={v.view} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                          <td style={{ padding: '6px 10px', color: COLORS.textMute, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                          <td style={{ padding: '6px 10px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v.view}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{v.opens.toLocaleString('it-IT')}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v.utenti_unici}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v.org_uniche}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: COLORS.textMute }}>{v.giorni_attivi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {(usageStats.bottom_view?.length || 0) > 0 && (
                <div style={{ padding: '12px 18px' }}>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>10 view meno usate (candidate alla deprecazione o onboarding)</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead style={{ background: COLORS.rowAlt }}>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>View</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>Aperture</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>Utenti unici</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>Org uniche</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(usageStats.bottom_view || []).map(v => (
                          <tr key={v.view} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                            <td style={{ padding: '6px 10px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{v.view}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{v.opens}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v.utenti_unici}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v.org_uniche}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        </>)}

        {adminTab === 'security' && (<>
        {/* ── Security & Anomalie (audit 2026-06-14) ──────────── */}
        <Card style={{ marginTop: 16, marginBottom: 24, padding: 0 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 14 }}><Icon name="shield" size={16} /> Sicurezza & Anomalie</strong>
              <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>
                Login attempts, brute-force suspect, anomalie comportamentali e log azioni admin
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <select value={securityHours} onChange={e => { const h = parseInt(e.target.value, 10); setSecurityHours(h); fetchSecurity(h) }} style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: '#fff' }}>
              <option value={24}>24h</option>
              <option value={72}>3 giorni</option>
              <option value={168}>7 giorni</option>
            </select>
            <button onClick={() => fetchSecurity()} style={{ fontSize: 11, padding: '4px 10px', background: COLORS.rowAlt, border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: 'pointer' }}>↻</button>
          </div>
          {securityLoading ? (
            <div style={{ padding: 18, fontSize: 12, color: COLORS.textMute }}>Caricamento…</div>
          ) : !securitySnap ? (
            <div style={{ padding: 18, fontSize: 12, color: COLORS.textMute }}>Nessun dato.</div>
          ) : (
            <>
              <div style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.rowAlt }}>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>Login OK</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.ok, fontVariantNumeric: 'tabular-nums' }}>
                    {(securitySnap.login?.ok ?? 0).toLocaleString('it-IT')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>Login falliti</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: (securitySnap.login?.failed ?? 0) > 0 ? COLORS.err : COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {(securitySnap.login?.failed ?? 0).toLocaleString('it-IT')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>Anomalie</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: (securitySnap.anomalie?.length ?? 0) > 0 ? COLORS.warn : COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {(securitySnap.anomalie?.length ?? 0).toLocaleString('it-IT')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5 }}>Azioni admin</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {(securitySnap.admin_log?.length ?? 0).toLocaleString('it-IT')}
                  </div>
                </div>
              </div>
              {(securitySnap.login?.top_fail_emails?.length || 0) > 0 && (
                <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Brute-force suspect (≥3 fallimenti/email)</div>
                  {securitySnap.login.top_fail_emails.map(r => (
                    <div key={r.email} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderTop: `1px dashed ${COLORS.border}` }}>
                      <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{r.email}</span>
                      <span style={{ color: COLORS.err, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.fail_count} fail</span>
                    </div>
                  ))}
                </div>
              )}
              {(securitySnap.anomalie?.length || 0) > 0 && (
                <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Anomalie rilevate</div>
                  {securitySnap.anomalie.slice(0, 20).map(a => (
                    <div key={a.id} style={{ padding: '6px 0', fontSize: 12, borderTop: `1px dashed ${COLORS.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 }}>{a.user_id ? a.user_id.slice(0, 8) + '…' : '-'}</span>
                        <span style={{ color: COLORS.textMute, fontSize: 11 }}>{fmtDataOra(a.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>{JSON.stringify(a.details || {}).slice(0, 200)}</div>
                    </div>
                  ))}
                </div>
              )}
              {(securitySnap.admin_log?.length || 0) > 0 && (
                <div style={{ padding: '12px 18px' }}>
                  <div style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Azioni admin recenti</div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {securitySnap.admin_log.slice(0, 50).map((l, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, padding: '4px 0', fontSize: 11, borderTop: `1px dashed ${COLORS.border}` }}>
                        <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{l.admin_email || '-'}</span>
                        <span style={{ color: COLORS.text }}>{l.azione || '-'}</span>
                        <span style={{ color: COLORS.textMute }}>{fmtDataOra(l.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        </>)}

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
          onAzione={async (tipo, payload) => {
            const c = dettaglioFor
            // Audit 2026-06-19: write actions Customer 360 → restano nel modal
            // e fanno reload del dettaglio (UI aggiornata in-place).
            if (tipo === 'integrazione_disattiva') {
              if (!confirm(`Revocare integrazione "${payload?.tipo || ''}" per ${c.nome_attivita}?\nIl cliente smette di sincronizzare dati con quella terza parte.`)) return
              try {
                await azione(c.org_id, 'integrazione_disattiva', { integrazione_id: payload.integrazione_id })
                const fresh = await apiCall(`/api/admin?action=cliente_dettaglio&org_id=${c.org_id}`)
                setDettaglio(await fresh.json())
                toast.success(`Integrazione ${payload.tipo} revocata`)
              } catch { /* azione() ha gia notificato */ }
              return
            }
            if (tipo === 'push_sub_revoca') {
              if (!confirm(`Revocare dispositivo "${payload?.label || 'tablet'}" per ${c.nome_attivita}?\nNon riceverà più notifiche push.`)) return
              try {
                await azione(c.org_id, 'push_sub_revoca', { sub_id: payload.sub_id })
                const fresh = await apiCall(`/api/admin?action=cliente_dettaglio&org_id=${c.org_id}`)
                setDettaglio(await fresh.json())
                toast.success(`Dispositivo ${payload.label || ''} revocato`)
              } catch { /* azione() ha gia notificato */ }
              return
            }
            if (tipo === 'personalize_demo') {
              // Audit 2026-06-20: apre il wizard demo personalizzata
              // (chiude il modal corrente, apre PersonalizeDemoModal)
              setDettaglioFor(null); setDettaglio(null)
              setPersonalizeFor(c)
              return
            }
            if (tipo === 'seed_demo_full') {
              // Audit 2026-06-20: popola demo data 3 mesi su org di test.
              // Idempotente (cleanup [Demo data] precedenti prima di reinsert).
              const msg = `Popolare "${c.nome_attivita}" con dati demo realistici?\n\n` +
                `→ 15 ricette · 90gg chiusure cassa · ~140 sessioni produzione\n` +
                `→ 5 dipendenti + turni 12 settimane\n` +
                `→ 6 fornitori + 18 fatture · 4 clienti B2B + 24 vendite\n` +
                `→ 8 costi aziendali · sprechi/omaggi a campione\n\n` +
                `Operazione IDEMPOTENTE: pulisce le righe demo precedenti.\n` +
                `Consigliata SOLO su org di test, non su account reali con dati.`
              if (!confirm(msg)) return
              try {
                const data = await azione(c.org_id, 'seed_demo_full', {})
                const cnt = data?.counts || {}
                const fresh = await apiCall(`/api/admin?action=cliente_dettaglio&org_id=${c.org_id}`)
                setDettaglio(await fresh.json())
                toast.success(`Demo popolato: ${cnt.ricette || 0} ricette · ${cnt.chiusure || 0} chiusure · ${cnt.dipendenti || 0} dip · ${cnt.fatture || 0} fatture · ${cnt.vendite_b2b || 0} vendite B2B · ${cnt.costi_aziendali || 0} costi`)
              } catch { /* azione() ha gia notificato */ }
              return
            }
            // Azioni "legacy": chiudono il modal e aprono il flow dedicato
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
              body: JSON.stringify({ orgId: demoFor.cliente.org_id, tipo: 'pulisci_demo_fatture', valore: 'esegui' }),
            })
            const data = await res.json().catch(() => ({}))
            await fetchData()
            fetchAudit()
            if (data?.deleted >= 0) {
              toast.success(`✓ Eliminate ${data.deleted} fatture demo`)
            }
          }}
        />
      )}
      {/* Audit 2026-06-21: Redemptions viewer modal */}
      {redemptionsFor && (
        <Modal title={`Utilizzi del codice ${redemptionsFor}`} onClose={() => setRedemptionsFor(null)} width={640}>
          {redemptionsLoading ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>Caricamento…</div>
          ) : redemptions.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
              Nessuno ha ancora usato questo codice.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {redemptions.map(r => (
                <div key={r.id} style={{ padding: '10px 12px', background: COLORS.rowAlt, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.nome_org || (r.organization_id || '').slice(0, 8) + '…'}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2 }}>{fmtDataOra(r.utilizzato_il)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: COLORS.ok, fontSize: 13 }}>
                      €{Number((r.ammontare_scontato_cents || 0) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} scontati
                    </div>
                    {r.stripe_invoice_id && (
                      <div style={{ fontSize: 10, color: COLORS.textMute, fontFamily: 'monospace' }}>{r.stripe_invoice_id.slice(0, 18)}…</div>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ padding: 10, background: COLORS.blueBg, borderRadius: 8, fontSize: 11, color: COLORS.blue }}>
                Totale risparmiato: <strong>€{Number(redemptions.reduce((s, r) => s + (r.ammontare_scontato_cents || 0), 0) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> · {redemptions.length} utilizzi
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Audit 2026-06-21: Modal genera codice ad-hoc per cliente */}
      {adHocOpen && (
        <Modal title="Codice sconto ad-hoc per un cliente" onClose={() => setAdHocOpen(false)} width={560}>
          <div style={{ fontSize: 12, color: COLORS.textMute, marginBottom: 14, lineHeight: 1.5 }}>
            Genera un codice unico (1 solo utilizzo) per un cliente specifico. Utile dopo un pitch:
            "ti faccio uno sconto se ti iscrivi ora".
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: COLORS.textMute, fontWeight: 700 }}>Cliente</span>
              <select value={adHocForm.target_org_id} onChange={e => setAdHocForm({ ...adHocForm, target_org_id: e.target.value })}
                style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 12, background: '#FFF' }}>
                <option value="">- seleziona -</option>
                {clienti.filter(c => c.nome_attivita).map(c => (
                  <option key={c.org_id} value={c.org_id}>{c.nome_attivita} ({c.email})</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: COLORS.textMute, fontWeight: 700 }}>Tipo sconto</span>
                <select value={adHocForm.tipo_sconto} onChange={e => setAdHocForm({ ...adHocForm, tipo_sconto: e.target.value })}
                  style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 12, background: '#FFF' }}>
                  <option value="percent">Percentuale</option>
                  <option value="amount">Importo fisso (€ cent)</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: COLORS.textMute, fontWeight: 700 }}>
                  Valore {adHocForm.tipo_sconto === 'percent' ? '(1-100)' : '(cents, es. 1000 = €10)'}
                </span>
                <input type="number" value={adHocForm.valore_sconto} onChange={e => setAdHocForm({ ...adHocForm, valore_sconto: parseInt(e.target.value, 10) || 0 })}
                  style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 12 }} />
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: COLORS.textMute, fontWeight: 700 }}>Durata</span>
              <select value={adHocForm.durata} onChange={e => setAdHocForm({ ...adHocForm, durata: e.target.value })}
                style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 12, background: '#FFF' }}>
                <option value="once">1 fattura (sconto una volta)</option>
                <option value="forever">Per sempre (sconto su ogni fattura)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: COLORS.textMute, fontWeight: 700 }}>Note interne (opzionale)</span>
              <input value={adHocForm.descrizione} onChange={e => setAdHocForm({ ...adHocForm, descrizione: e.target.value })}
                placeholder="es. Pitch del 21/06, sconto post-incontro"
                style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 12 }} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Btn kind="neutral" onClick={() => setAdHocOpen(false)}>Annulla</Btn>
            <Btn kind="primary" onClick={generaAdHoc} disabled={!adHocForm.target_org_id}>
              <Icon name="gift" size={13} /> Genera codice
            </Btn>
          </div>
        </Modal>
      )}

      {/* Audit 2026-06-20: Cmd+K global search overlay */}
      {cmdkOpen && (
        <div onClick={() => setCmdkOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: '12vh', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#FFF', borderRadius: 12, width: '92%', maxWidth: 680,
            maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="search" size={14} color={COLORS.textMute} />
              <input
                autoFocus
                value={cmdkQuery}
                onChange={e => setCmdkQuery(e.target.value)}
                placeholder="Cerca cliente, errore, feedback, audit…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent' }}
              />
              <span style={{ fontSize: 10, color: COLORS.textMute, padding: '2px 6px', background: COLORS.rowAlt, borderRadius: 4, fontFamily: 'monospace' }}>esc</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {!cmdkResults && cmdkQuery.length < 2 && (
                <div style={{ padding: 24, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
                  Almeno 2 caratteri. Cerca tra clienti (nome/email), errori, feedback, audit log.
                </div>
              )}
              {cmdkLoading && (
                <div style={{ padding: 24, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
                  Cercando…
                </div>
              )}
              {cmdkResults && !cmdkLoading && (
                <>
                  {[
                    ['clienti', 'Clienti', 'users'],
                    ['errori', 'Errori', 'warning'],
                    ['feedback', 'Feedback', 'mail'],
                    ['audit', 'Audit log', 'shield'],
                  ].map(([k, label, icon]) => {
                    const items = cmdkResults[k] || []
                    if (items.length === 0) return null
                    return (
                      <div key={k} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px' }}>
                          <Icon name={icon} size={10} /> {label} ({items.length})
                        </div>
                        {items.map((it, i) => {
                          let title, subtitle, onClick
                          if (k === 'clienti') {
                            const cliente = clienti.find(c => c.org_id === it.id)
                            title = it.nome
                            subtitle = it.tipo || ''
                            onClick = () => { if (cliente) { apriDettaglio(cliente); setCmdkOpen(false) } }
                          } else if (k === 'errori') {
                            const cliente = clienti.find(c => c.org_id === it.org_id)
                            title = `${it.endpoint || '?'}:${it.operation || ''} · ${it.code || ''}`
                            subtitle = it.message
                            onClick = () => { if (cliente) { apriDettaglio(cliente); setCmdkOpen(false) } }
                          } else if (k === 'feedback') {
                            const cliente = clienti.find(c => c.org_id === it.organization_id)
                            title = `${it.sentiment}: ${it.user_email || 'anon'}`
                            subtitle = it.messaggio
                            onClick = () => { setAdminTab('ops'); setCmdkOpen(false) }
                          } else if (k === 'audit') {
                            title = `${it.azione} (${it.admin_email})`
                            subtitle = it.org_id ? `org: ${it.org_id.slice(0, 8)}…` : ''
                            onClick = () => { setAdminTab('security'); setCmdkOpen(false) }
                          }
                          return (
                            <div key={`${k}-${it.id || i}`} onClick={onClick} style={{
                              padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                              borderBottom: `1px solid ${COLORS.border}`,
                            }} onMouseEnter={e => e.currentTarget.style.background = COLORS.rowAlt}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <div style={{ fontWeight: 600, color: COLORS.text }}>{title}</div>
                              {subtitle && <div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                  {Object.values(cmdkResults).every(arr => (arr || []).length === 0) && (
                    <div style={{ padding: 24, textAlign: 'center', color: COLORS.textMute, fontSize: 12 }}>
                      Niente trovato per "{cmdkQuery}".
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Audit 2026-06-20: wizard demo personalizzata (pitch-ready) */}
      {personalizeFor && (
        <PersonalizeDemoModal
          cliente={personalizeFor}
          apiCall={apiCall}
          toast={toast}
          onClose={() => setPersonalizeFor(null)}
          onImpersona={(c) => { handleImpersona(c) }}
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
