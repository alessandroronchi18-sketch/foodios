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
import {
  parseNomeFile, lunediSettimana1DelMese, parseFoglioInventario, diffConDb,
} from '../lib/inventarioImport'
import { loadXLSX } from '../lib/xlsx'

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
  // Ordinamento gusti: di default alfabetico ascendente. Click sui label di
  // header colonna (PROD/RIMAN giorno N o VENDUTO SETT) toggla la metrica
  // di sort e direzione.
  // sort.by: 'nome' | { tipo: 'prod'|'riman', giorno: 0..6 } | 'venduto'
  // sort.dir: 'asc' | 'desc'
  const [sort, setSort] = useState({ by: 'nome', dir: 'asc' })
  // Stato dialog import file (multi-step). null = chiuso.
  const [importDlg, setImportDlg] = useState(null)

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

  // Gusti ordinati secondo `sort`. Lo applichiamo SOLO alla lista per il
  // rendering, non ai dati sottostanti (matrice resta indicizzata per nome).
  const gustiOrdinati = useMemo(() => {
    const arr = [...(gusti || [])]
    const key = sort.by
    const sgn = sort.dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const an = (a.nome || '').toUpperCase()
      const bn = (b.nome || '').toUpperCase()
      if (key === 'nome') return sgn * an.localeCompare(bn, 'it')
      const ak = normGusto(a.nome); const bk = normGusto(b.nome)
      if (key === 'venduto') {
        return sgn * ((totali[ak] || 0) - (totali[bk] || 0))
      }
      // { tipo: 'prod'|'riman', giorno }
      const dIso = (() => { const d = new Date(lunediIso); d.setDate(d.getDate() + key.giorno); return d.toISOString().slice(0, 10) })()
      const av = (matrice[ak]?.[dIso] || {})[key.tipo === 'prod' ? 'prod' : 'riman'] || 0
      const bv = (matrice[bk]?.[dIso] || {})[key.tipo === 'prod' ? 'prod' : 'riman'] || 0
      return sgn * (av - bv)
    })
    return arr
  }, [gusti, sort, matrice, totali, lunediIso])

  // Toggle sort: se key e' uguale a quella attuale, inverte direzione; altrimenti
  // imposta nuova key con direzione 'desc' (numerici) o 'asc' (nome).
  const toggleSort = (key) => {
    setSort(prev => {
      const isSame = JSON.stringify(prev.by) === JSON.stringify(key)
      if (isSame) return { by: key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { by: key, dir: key === 'nome' ? 'asc' : 'desc' }
    })
  }

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
          Nessun gusto nel ricettario
        </h2>
        <p style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.6 }}>
          Vai nel <strong>Ricettario</strong> e crea le tue ricette (gusti di gelato, yogurt, ecc.).
          Tutte le ricette tipo <em>fetta</em> o <em>pezzo</em> compariranno automaticamente qui per
          la registrazione settimanale. I semilavorati restano fuori.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader subtitle={`Foglio settimanale per la registrazione di produzione e rimanenze. Il sistema calcola automaticamente il venduto: rimanenza(ieri) + produzione(oggi) − rimanenza(oggi) − scarto.`} />

      {/* Segmented control Oggi/Settimana + bottone Importa file */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{
          display: 'inline-flex', gap: 2, padding: 4,
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
        <button onClick={() => setImportDlg({ step: 'pick' })}
          style={{
            padding: '8px 16px', minHeight: 40,
            background: T.brand, color: '#FFFFFF', border: 'none', borderRadius: 8,
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          <Icon name="download" size={14} color="#FFFFFF" />
          Importa file
        </button>
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
          gusti={gustiOrdinati} matrice={matrice} saving={saving}
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
                <SortableHeader
                  label="GUSTO"
                  onClick={() => toggleSort('nome')}
                  active={sort.by === 'nome'} dir={sort.dir}
                  style={thGusto}
                />
                {GIORNI.map((g, i) => (
                  <th key={g} colSpan={2} style={{ ...thGiorno, borderLeft: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text, textTransform: 'uppercase' }}>{g} {i + 1}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4 }}>
                      <SortChip label="PROD" color="#0EA5E9"
                        active={sort.by?.tipo === 'prod' && sort.by?.giorno === i} dir={sort.dir}
                        onClick={() => toggleSort({ tipo: 'prod', giorno: i })}
                      />
                      <SortChip label="RIMAN" color="#F59E0B"
                        active={sort.by?.tipo === 'riman' && sort.by?.giorno === i} dir={sort.dir}
                        onClick={() => toggleSort({ tipo: 'riman', giorno: i })}
                      />
                    </div>
                  </th>
                ))}
                <SortableHeader
                  label="VENDUTO SETT."
                  onClick={() => toggleSort('venduto')}
                  active={sort.by === 'venduto'} dir={sort.dir}
                  style={{ ...thTot, borderLeft: `2px solid ${C.borderStr}` }}
                />
              </tr>
            </thead>
            <tbody>
              {gustiOrdinati.map(({ nome }) => {
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

      {importDlg && (
        <DialogImport
          orgId={orgId} sedeId={sedeId}
          righeDb={righe}
          state={importDlg}
          setState={setImportDlg}
          onCommit={async (nuoveRighe) => {
            // upsert in serie tutte le righe accettate
            let ok = 0, ko = 0
            for (const r of nuoveRighe) {
              try {
                await salvaCella(orgId, sedeId, r.gusto_nome, r.data, {
                  produzione_g: r.produzione_g,
                  rimanenza_g: r.rimanenza_g,
                  scarto_g: 0,
                })
                ok++
              } catch (e) { console.error('salvaCella import:', e); ko++ }
            }
            // ricarica settimana corrente
            const fresh = await caricaSettimana(orgId, sedeId, lunediIso)
            setRighe(fresh)
            setImportDlg(null)
            notify?.(ko > 0
              ? `Import: ${ok} righe salvate, ${ko} errori`
              : `Import: ${ok} righe salvate con successo`,
              ko === 0)
          }}
        />
      )}
    </div>
  )
}

// ── Dialog import file (wizard 4 step) ────────────────────────────────────
// Step:
//   1. 'pick'    — scegli file (drag&drop o input)
//   2. 'mese'    — se mese non rilevato dal nome file, scelta manuale
//   3. 'preview' — mostra diff vs DB (nuovi/divergenti/identici)
//   4. 'apply'   — confermato, applica via onCommit
function DialogImport({ orgId, sedeId, righeDb, state, setState, onCommit }) {
  const dlg = state || {}
  const close = () => setState(null)

  return (
    <div role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 16, maxWidth: 700, width: '100%',
        boxShadow: '0 20px 60px rgba(15,23,42,0.30)',
        padding: '22px 24px', maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.text }}>
            Importa file inventario
          </h2>
          <button onClick={close}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: C.textSoft }}>
            ✕
          </button>
        </div>

        {dlg.step === 'pick' && <StepPick onParsed={(parsed) => setState({ ...dlg, ...parsed, step: parsed.bisognaSceglieMese ? 'mese' : 'preview' })} onCancel={close} />}

        {dlg.step === 'mese' && <StepMese fileName={dlg.fileName} matrice={dlg.matrice}
          onChosen={(mese, anno) => {
            const lun = lunediSettimana1DelMese(mese, anno)
            const parsed = parseFoglioInventario(dlg.matrice, lun)
            setState({ ...dlg, mese, anno, lunediBase: lun, parsato: parsed, step: 'preview' })
          }}
          onBack={() => setState({ ...dlg, step: 'pick' })}
        />}

        {dlg.step === 'preview' && <StepPreview parsato={dlg.parsato} righeDb={righeDb}
          mese={dlg.mese} anno={dlg.anno}
          onBack={() => setState({ ...dlg, step: 'pick' })}
          onConferma={(righeAccettate) => onCommit(righeAccettate)}
        />}
      </div>
    </div>
  )
}

function StepPick({ onParsed, onCancel }) {
  const [parsing, setParsing] = useState(false)
  const [err, setErr] = useState(null)
  const [drag, setDrag] = useState(false)

  async function handleFile(file) {
    if (!file) return
    setParsing(true); setErr(null)
    try {
      const XLSX = await loadXLSX()
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const matrice = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
      const meseAnno = parseNomeFile(file.name)
      if (meseAnno) {
        const lun = lunediSettimana1DelMese(meseAnno.mese, meseAnno.anno)
        const parsato = parseFoglioInventario(matrice, lun)
        onParsed({
          fileName: file.name,
          matrice,
          mese: meseAnno.mese, anno: meseAnno.anno,
          lunediBase: lun, parsato,
          bisognaSceglieMese: false,
        })
      } else {
        // Mese non rilevato: passa allo step manuale.
        onParsed({
          fileName: file.name,
          matrice,
          bisognaSceglieMese: true,
        })
      }
    } catch (e) {
      console.error(e)
      setErr(`Errore nel leggere il file: ${e.message || 'formato non valido'}`)
    } finally {
      setParsing(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.55, marginTop: 0, marginBottom: 14 }}>
        Carica un file <strong>Excel</strong> o <strong>CSV</strong> con il foglio inventario.
        Il sistema legge il <strong>mese</strong> dal nome del file (es. <code>inventario_giugno_2026.xlsx</code>).
        Se non riesce, ti chiederà di sceglierlo manualmente.
      </p>
      <label
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
        style={{
          display: 'block', padding: '36px 24px', textAlign: 'center',
          background: drag ? '#FEF2F2' : '#F8FAFC',
          border: `2px dashed ${drag ? T.brand : C.border}`,
          borderRadius: 12, cursor: 'pointer',
        }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>
          {parsing ? 'Analisi del file in corso...' : 'Trascina qui il file o clicca per selezionarlo'}
        </div>
        <div style={{ fontSize: 12, color: C.textSoft }}>
          Formati supportati: .xlsx, .xls, .csv
        </div>
        <input type="file" accept=".xlsx,.xls,.csv" disabled={parsing}
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])} />
      </label>
      {err && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12.5, color: '#7F1D1D' }}>
          {err}
        </div>
      )}
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnSecondary}>Annulla</button>
      </div>
    </div>
  )
}

function StepMese({ fileName, matrice, onChosen, onBack }) {
  const [mese, setMese] = useState(new Date().getMonth() + 1)
  const [anno, setAnno] = useState(new Date().getFullYear())
  const MESI_LABEL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
  return (
    <div>
      <div style={{
        padding: '12px 14px', background: '#FEF9EB',
        border: '1px solid #FDE68A', borderRadius: 10, marginBottom: 14,
        fontSize: 12.5, color: '#78350F', lineHeight: 1.55,
      }}>
        <strong>Non riesco a capire quale mese sia.</strong>&nbsp;
        Il nome del file (<code style={{ background: '#FFFFFF', padding: '1px 6px', borderRadius: 4 }}>{fileName}</code>) non contiene un mese riconoscibile.
        Scegli manualmente mese e anno qui sotto.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div>
          <label style={lblForm}>Mese</label>
          <select value={mese} onChange={e => setMese(+e.target.value)} style={inpForm}>
            {MESI_LABEL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={lblForm}>Anno</label>
          <input type="number" value={anno} min={2020} max={2099}
            onChange={e => setAnno(+e.target.value)} style={inpForm} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button onClick={onBack} style={btnSecondary}>← Indietro</button>
        <button onClick={() => onChosen(mese, anno)} style={btnPrimary}>
          Continua
        </button>
      </div>
    </div>
  )
}

function StepPreview({ parsato, righeDb, mese, anno, onBack, onConferma }) {
  const MESI_LABEL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
  const diff = useMemo(() => diffConDb(parsato?.righe || [], righeDb || []), [parsato, righeDb])
  const haDivergenze = diff.divergenti.length > 0
  const totRighe = (parsato?.righe || []).length

  return (
    <div>
      <div style={{ fontSize: 13, color: C.textMid, marginBottom: 12, lineHeight: 1.55 }}>
        File: <strong>{MESI_LABEL[mese - 1]} {anno}</strong> &middot; {parsato?.gusti?.length || 0} gusti riconosciuti &middot; {totRighe} righe.
      </div>

      {parsato?.warnings?.length > 0 && (
        <div style={{ padding: '10px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, marginBottom: 12, fontSize: 12.5, color: '#78350F' }}>
          <strong>Avvisi:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            {parsato.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        <KpiBoxDlg label="Nuovi" val={diff.nuovi.length} color="#0E9F6E" />
        <KpiBoxDlg label="Identici" val={diff.identici.length} color={C.textSoft} />
        <KpiBoxDlg label="Divergenti" val={diff.divergenti.length} color={haDivergenze ? '#DC2626' : C.textSoft} />
      </div>

      {haDivergenze && (
        <div style={{ padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 8 }}>
            ⚠️ Trovate {diff.divergenti.length} celle con valori diversi rispetto a quelli già nel sistema.
            Ricontrolla i dati: i valori del file sovrascriveranno quelli attuali.
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#FAFBFC' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: C.textSoft, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Gusto</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: C.textSoft, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Data</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', color: C.textSoft, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>PROD prima → nuovo</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', color: C.textSoft, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>RIMAN prima → nuovo</th>
                </tr>
              </thead>
              <tbody>
                {diff.divergenti.slice(0, 100).map((d, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: C.text }}>{d.gusto_nome}</td>
                    <td style={{ padding: '6px 10px', color: C.textMid }}>{d.data}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', ...TNUM,
                                 color: d.produzione.vecchio === d.produzione.nuovo ? C.textSoft : C.text }}>
                      {d.produzione.vecchio} → <strong>{d.produzione.nuovo}</strong>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', ...TNUM,
                                 color: d.rimanenza.vecchio === d.rimanenza.nuovo ? C.textSoft : C.text }}>
                      {d.rimanenza.vecchio} → <strong>{d.rimanenza.nuovo}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diff.divergenti.length > 100 && (
              <div style={{ padding: '6px 10px', fontSize: 11, color: C.textSoft, textAlign: 'center' }}>
                ... e altre {diff.divergenti.length - 100} righe divergenti.
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button onClick={onBack} style={btnSecondary}>← Carica altro file</button>
        <button onClick={() => onConferma(parsato?.righe || [])}
          disabled={totRighe === 0} style={{ ...btnPrimary, opacity: totRighe === 0 ? 0.5 : 1 }}>
          {haDivergenze ? `Sovrascrivi ${diff.divergenti.length + diff.nuovi.length} righe` : `Importa ${totRighe} righe`}
        </button>
      </div>
    </div>
  )
}

function KpiBoxDlg({ label, val, color }) {
  return (
    <div style={{ padding: '10px 12px', background: C.bgSubtle, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, ...TNUM, marginTop: 2 }}>{val}</div>
    </div>
  )
}

const btnPrimary = {
  padding: '10px 18px', minHeight: 42, background: T.brand,
  color: '#FFFFFF', border: 'none', borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const btnSecondary = {
  padding: '10px 18px', minHeight: 42, background: '#FFFFFF',
  color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 10,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const lblForm = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textSoft, marginBottom: 6 }
const inpForm = {
  width: '100%', padding: '10px 12px', minHeight: 42,
  border: `1px solid ${T.border}`, borderRadius: 8,
  fontSize: 14, color: T.text, outline: 'none', background: '#FFFFFF',
}

// ── Header tabella ordinabile (click = toggle sort) ───────────────────────
function SortableHeader({ label, onClick, active, dir, style }) {
  return (
    <th onClick={onClick} title="Clicca per ordinare"
      style={{ ...style, cursor: 'pointer', userSelect: 'none' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <span style={{ fontSize: 9, color: active ? T.brand : 'transparent', fontWeight: 800 }}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '▲'}
        </span>
      </span>
    </th>
  )
}

function SortChip({ label, color, active, dir, onClick }) {
  return (
    <span onClick={onClick} title="Clicca per ordinare i gusti su questa colonna"
      style={{
        cursor: 'pointer', userSelect: 'none',
        fontSize: 9, color: active ? T.brand : color, fontWeight: 700,
        padding: '2px 4px', borderRadius: 4,
        background: active ? '#FEE2E2' : 'transparent',
        display: 'inline-flex', alignItems: 'center', gap: 2,
      }}>
      {label}
      {active && <span style={{ fontSize: 8 }}>{dir === 'asc' ? '▲' : '▼'}</span>}
    </span>
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
