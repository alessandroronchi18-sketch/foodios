// Inventario settimanale — metodo differenziale (gelateria/yogurt/pasta fresca).
//
// Esperienza utente che replica il foglio Excel che i dipendenti gia' usano:
//   righe   = gusti (ricette con is_gusto=true)
//   colonne = 7 giorni × (PROD | RIMAN), in piu' colonna VENDUTO SETTIMANA
//
// I 7 giorni vanno da lunedi a domenica. Navigazione +/- settimana.
//
// Il venduto del giorno N e' calcolato come
//   riman(N-1) + prod(N) - riman(N) - scarto(N)
// usando il dato del lunedi della settimana precedente come "riman(N-1)" del
// lunedi corrente (la query carica un giorno in piu' a sinistra).
//
// Salvataggio per-cella su blur: ogni modifica di PROD o RIMAN scrive subito
// la riga (upsert su unique org+sede+gusto+data). UX da foglio di calcolo.
//
// La voce menu che porta qui appare in Dashboard solo se la sede attiva e'
// is_sede_produzione=true AND metodo_produzione='inventario' (filtraggio nel
// componente Dashboard, non qui).

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from '../components/Icon'
import { C, TNUM, PageHeader } from './_shared'
import { ssave } from '../lib/storage'
import { SK_MAG } from '../lib/storageKeys'
import {
  elencoGusti, caricaSettimana, salvaCella, calcolaVendutoSettimana,
  totaliVenduti, lunediDellaSettimana, normGusto,
  scaloMagazzinoPerGusto, ricettaDelGusto,
} from '../lib/inventarioProduzione'

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

function addDays(dateIso, n) {
  const d = new Date(dateIso); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtRange(lunediIso) {
  const lun = new Date(lunediIso)
  const dom = new Date(lunediIso); dom.setDate(dom.getDate() + 6)
  const f = d => d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  return `${f(lun)} - ${f(dom)} ${dom.getFullYear()}`
}

function fmtG(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('it-IT')
}

export default function InventarioSettimanaleView({ orgId, sedeId, ricettario, magazzino, setMagazzino, tipoAttivita, notify }) {
  const isMobile = useIsMobile()
  const [lunediIso, setLunediIso] = useState(() => lunediDellaSettimana())
  const [righe, setRighe] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({}) // key = `${gusto}|${data}|${campo}`
  // Vista: 'settimana' (foglio Excel completo) | 'oggi' (lista verticale
  // mobile-friendly per il dipendente che compila in laboratorio dal cellulare).
  // Default: oggi su mobile, settimana su desktop.
  const [vista, setVista] = useState(() => isMobile ? 'oggi' : 'settimana')

  const gusti = useMemo(() => elencoGusti(ricettario, tipoAttivita), [ricettario, tipoAttivita])

  useEffect(() => {
    let alive = true
    if (!orgId || !sedeId) { setLoading(false); return }
    setLoading(true)
    caricaSettimana(orgId, sedeId, lunediIso)
      .then(data => { if (alive) { setRighe(data); setLoading(false) } })
      .catch(e => { if (alive) { console.error(e); setLoading(false) } })
    return () => { alive = false }
  }, [orgId, sedeId, lunediIso])

  const matrice = useMemo(() => calcolaVendutoSettimana(righe, lunediIso), [righe, lunediIso])
  const totali = useMemo(() => totaliVenduti(matrice), [matrice])

  // Salva una cella e aggiorna lo state locale ottimisticamente. In caso di
  // errore mostriamo il toast — lo state torna allo stato precedente al
  // prossimo reload (sufficiente per evitare drift duraturo).
  const handleSave = useCallback(async (gustoNome, dataIso, campo, valore) => {
    const k = `${gustoNome}|${dataIso}|${campo}`
    setSaving(s => ({ ...s, [k]: true }))
    try {
      // Riga corrente (se gia' esiste in DB) per non perdere gli altri campi.
      const esistente = righe.find(r => r.gusto_nome === gustoNome && r.data === dataIso) || {}
      const patch = {
        produzione_g: esistente.produzione_g || 0,
        rimanenza_g: esistente.rimanenza_g || 0,
        scarto_g: esistente.scarto_g || 0,
        [campo]: Number(valore) || 0,
      }
      // Salvataggio dati inventario: deve riuscire PRIMA di toccare il magazzino,
      // cosi se l'utente perde la rete vediamo l'errore e non scaliamo nulla.
      const saved = await salvaCella(orgId, sedeId, gustoNome, dataIso, patch)

      // Scalo magazzino MP solo se il campo modificato e' produzione_g.
      // Calcoliamo il delta rispetto al valore precedente: positivo = ho
      // prodotto in piu' (ingredienti scendono), negativo = correzione al
      // ribasso (ingredienti risalgono). save-first sul magazzino: se ssave
      // fallisce, l'inventario resta salvato ma notify warning e
      // l'utente capira' che il magazzino non e' stato aggiornato.
      if (campo === 'produzione_g' && setMagazzino && ricettario) {
        const ric = ricettaDelGusto(ricettario, gustoNome)
        const oldProd = Number(esistente.produzione_g) || 0
        const newProd = Number(valore) || 0
        const delta = newProd - oldProd
        if (ric && delta !== 0) {
          const { nuovoMagazzino, ingredientiScalati } = scaloMagazzinoPerGusto(magazzino || {}, ric, delta)
          if (ingredientiScalati.length > 0) {
            try {
              await ssave(SK_MAG, nuovoMagazzino, orgId, sedeId)
              setMagazzino(nuovoMagazzino)
            } catch (e) {
              console.error('ssave magazzino dopo inventario:', e)
              notify?.('Inventario salvato ma magazzino non aggiornato (errore rete)', false)
            }
          }
        }
      }

      setRighe(prev => {
        const idx = prev.findIndex(r => r.gusto_nome === gustoNome && r.data === dataIso)
        if (idx >= 0) {
          const next = [...prev]; next[idx] = { ...prev[idx], ...saved }
          return next
        }
        return [...prev, saved]
      })
    } catch (e) {
      console.error('salvaCella:', e)
      notify?.(`Errore salvataggio: ${e.message || 'rete'}`, false)
    } finally {
      setSaving(s => { const n = { ...s }; delete n[k]; return n })
    }
  }, [orgId, sedeId, righe, ricettario, magazzino, setMagazzino, notify])

  const settimanaPrec = () => setLunediIso(addDays(lunediIso, -7))
  const settimanaSucc = () => setLunediIso(addDays(lunediIso, 7))
  const oggi = () => setLunediIso(lunediDellaSettimana())

  // ── Render ─────────────────────────────────────────────────────────────

  if (!orgId || !sedeId) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Seleziona una sede</div>
  }

  if (gusti.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <Icon name="bulb" size={48} color={T.brand} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 16, marginBottom: 8 }}>
          Nessun gusto configurato
        </h2>
        <p style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.6 }}>
          Vai nel <strong>Ricettario</strong>, apri o crea una ricetta e attiva l'opzione
          <em> "È un gusto da inventario"</em>. Quel gusto apparirà qui per la registrazione settimanale.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader subtitle={`Foglio settimanale per la registrazione di produzione e rimanenze. Il sistema calcola automaticamente il venduto: rimanenza(ieri) + produzione(oggi) − rimanenza(oggi) − scarto.`} />

      {/* Segmented control Oggi/Settimana */}
      <div style={{
        display: 'inline-flex', gap: 2, marginBottom: 12, padding: 4,
        background: C.bgSubtle, borderRadius: 10,
      }}>
        {[['oggi','Oggi'], ['settimana','Settimana']].map(([k, lbl]) => {
          const sel = vista === k
          return (
            <button key={k} onClick={() => setVista(k)}
              style={{
                padding: '8px 16px', minHeight: 38, fontSize: 12.5, fontWeight: 700,
                border: 'none', borderRadius: 8, cursor: 'pointer',
                background: sel ? C.bgCard : 'transparent',
                color: sel ? C.text : C.textMid,
                boxShadow: sel ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
              }}>{lbl}</button>
          )
        })}
      </div>

      {/* Toolbar navigazione settimana (solo modalita' settimana) */}
      {vista === 'settimana' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '12px 16px',
        }}>
          <button onClick={settimanaPrec}
            style={{ padding: '8px 14px', minHeight: 40, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, color: C.textMid, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ← Sett. prec.
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSoft }}>Settimana</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmtRange(lunediIso)}</div>
          </div>
          <button onClick={oggi}
            style={{ padding: '8px 14px', minHeight: 40, background: '#F8FAFC', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, color: C.textMid }}>
            Questa sett.
          </button>
          <button onClick={settimanaSucc}
            style={{ padding: '8px 14px', minHeight: 40, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, color: C.textMid, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Sett. succ. →
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
      ) : vista === 'oggi' ? (
        <VistaOggi
          gusti={gusti} matrice={matrice} saving={saving}
          onSave={handleSave}
        />
      ) : (
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
          overflowX: 'auto', overflowY: 'visible',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
        }}>
          <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={thGusto}>GUSTO</th>
                {GIORNI.map((g, i) => (
                  <th key={g} colSpan={2} style={{ ...thGiorno, borderLeft: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text, textTransform: 'uppercase' }}>{g} {i + 1}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4 }}>
                      <span style={{ fontSize: 9, color: '#0EA5E9', fontWeight: 600 }}>PROD</span>
                      <span style={{ fontSize: 9, color: '#F59E0B', fontWeight: 600 }}>RIMAN</span>
                    </div>
                  </th>
                ))}
                <th style={{ ...thTot, borderLeft: `2px solid ${C.borderStr}` }}>VENDUTO SETT.</th>
              </tr>
            </thead>
            <tbody>
              {gusti.map(({ nome }) => {
                const gustoKey = normGusto(nome)
                const byData = matrice[gustoKey] || {}
                return (
                  <tr key={gustoKey} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                    <td style={tdGusto}>{nome}</td>
                    {GIORNI.map((_, i) => {
                      const dIso = addDays(lunediIso, i)
                      const cell = byData[dIso] || { prod: 0, riman: 0 }
                      const kProd = `${gustoKey}|${dIso}|produzione_g`
                      const kRim = `${gustoKey}|${dIso}|rimanenza_g`
                      return (
                        <React.Fragment key={dIso}>
                          <td style={{ ...tdInput, borderLeft: `1px solid ${C.border}` }}>
                            <CellInput
                              value={cell.prod || ''}
                              saving={!!saving[kProd]}
                              accent="#0EA5E9"
                              onCommit={v => handleSave(gustoKey, dIso, 'produzione_g', v)}
                            />
                          </td>
                          <td style={tdInput}>
                            <CellInput
                              value={cell.riman || ''}
                              saving={!!saving[kRim]}
                              accent="#F59E0B"
                              onCommit={v => handleSave(gustoKey, dIso, 'rimanenza_g', v)}
                            />
                          </td>
                        </React.Fragment>
                      )
                    })}
                    <td style={{ ...tdTot, borderLeft: `2px solid ${C.borderStr}` }}>
                      {fmtG(totali[gustoKey] || 0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11.5, color: C.textSoft, lineHeight: 1.6 }}>
        Tutte le quantità sono in <strong>grammi</strong>. Il valore della cella si salva automaticamente quando esci dal campo (clic fuori o Tab).
        Per modificare il giorno precedente o successivo cambia settimana con i bottoni sopra.
      </div>
    </div>
  )
}

// ── VistaOggi: lista verticale mobile-first per il dipendente ─────────────
// Mostra SOLO il giorno corrente (today). Per ogni gusto, 2 input grandi
// (PROD, RIMAN). Pensata per essere usata in laboratorio dal cellulare.
function VistaOggi({ gusti, matrice, saving, onSave }) {
  const oggiIso = new Date().toISOString().slice(0, 10)
  return (
    <div>
      <div style={{
        background: '#FEF9EB', border: '1px solid #FCD34D', borderRadius: 10,
        padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400E',
      }}>
        <strong>Oggi {new Date(oggiIso).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' })}</strong>
        &nbsp;— Compila PROD (quanto hai prodotto) e RIMAN (quanto e' rimasto a fine giornata). I valori si salvano automaticamente.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {gusti.map(({ nome }) => {
          const gKey = normGusto(nome)
          const byData = matrice[gKey] || {}
          const cell = byData[oggiIso] || { prod: 0, riman: 0, venduto: null }
          const kProd = `${gKey}|${oggiIso}|produzione_g`
          const kRim = `${gKey}|${oggiIso}|rimanenza_g`
          return (
            <div key={gKey} style={{
              background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: '14px 16px',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{nome}</div>
                {cell.venduto != null && (
                  <div style={{ fontSize: 11, color: C.textSoft }}>
                    venduto stimato: <strong style={{ color: T.brand, ...TNUM }}>
                      {Number(cell.venduto).toLocaleString('it-IT')} g
                    </strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <BigField
                  label="PROD oggi"
                  accent="#0EA5E9"
                  value={cell.prod || 0}
                  saving={!!saving[kProd]}
                  onCommit={v => onSave(gKey, oggiIso, 'produzione_g', v)}
                />
                <BigField
                  label="RIMAN. fine giornata"
                  accent="#F59E0B"
                  value={cell.riman || 0}
                  saving={!!saving[kRim]}
                  onCommit={v => onSave(gKey, oggiIso, 'rimanenza_g', v)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Campo grande per la VistaOggi: input touch-friendly con label sopra.
function BigField({ label, accent, value, saving, onCommit }) {
  const [local, setLocal] = useState(value === 0 ? '' : String(value))
  useEffect(() => { setLocal(value === 0 ? '' : String(value)) }, [value])
  const commit = () => {
    const n = Number((local || '').replace(',', '.')) || 0
    if (n !== Number(value || 0)) onCommit(n)
  }
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: saving ? 'rgba(110,14,26,0.04)' : '#FAFBFC',
        border: `2px solid ${local ? accent : C.border}`,
        borderRadius: 10, padding: '0 10px',
        minHeight: 52,
      }}>
        <input
          type="text"
          inputMode="numeric"
          value={local}
          onChange={e => setLocal(e.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          placeholder="0"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 18, fontWeight: 700, color: C.text, textAlign: 'right',
            padding: '12px 0', ...TNUM,
          }}
        />
        <span style={{ fontSize: 12, color: C.textSoft, fontWeight: 600 }}>g</span>
      </div>
    </label>
  )
}

// ── Cella input controllata con salvataggio on-blur ───────────────────────
// Lo state locale serve solo a non commitare ad ogni keypress. Su blur (o
// Enter) chiama onCommit con il valore numerico finale.
function CellInput({ value, saving, accent, onCommit }) {
  const [local, setLocal] = useState(value === '' || value === 0 ? '' : String(value))
  // Quando il valore di props cambia (refresh dati), riallineiamo lo state.
  useEffect(() => {
    setLocal(value === '' || value === 0 ? '' : String(value))
  }, [value])
  const commit = () => {
    const n = Number((local || '').replace(',', '.')) || 0
    if (n !== Number(value || 0)) onCommit(n)
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      value={local}
      onChange={e => setLocal(e.target.value.replace(/[^\d.,]/g, ''))}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
      style={{
        width: '100%', minWidth: 56, padding: '8px 6px', textAlign: 'right',
        fontSize: 13, fontFamily: 'inherit',
        border: 'none', outline: 'none',
        background: saving ? 'rgba(110,14,26,0.05)' : 'transparent',
        color: C.text, fontWeight: local ? 600 : 400,
        borderBottom: `2px solid ${local ? accent : 'transparent'}`,
        ...TNUM,
      }}
    />
  )
}

// ── Stili tabella ─────────────────────────────────────────────────────────
const thGusto = {
  padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em',
  position: 'sticky', left: 0, background: '#F8FAFC', zIndex: 1,
  minWidth: 160,
}
const thGiorno = { padding: '6px 4px', textAlign: 'center' }
const thTot = {
  padding: '12px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700,
  color: C.text, textTransform: 'uppercase', letterSpacing: '0.06em',
  background: '#FEF3C7', minWidth: 110,
}
const tdGusto = {
  padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text,
  position: 'sticky', left: 0, background: C.bgCard, zIndex: 1,
}
const tdInput = { padding: 0, minWidth: 64 }
const tdTot = {
  padding: '10px 14px', textAlign: 'right', fontSize: 14, fontWeight: 800,
  color: T.brand, background: '#FEF9EB',
  fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'",
}
