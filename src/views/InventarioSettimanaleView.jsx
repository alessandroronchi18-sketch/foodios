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
  classificaSheet, trovaSedePerSheet, checkTotaliCrossSheet,
} from '../lib/inventarioImport'
import { loadXLSX } from '../lib/xlsx'
import { supabase } from '../lib/supabase'

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
  // Vista: 'oggi' (mobile-friendly) | 'settimana' (Excel-like) | 'mese' (KPI
  // settimanali del mese intero) | 'storico' (timeline multi-mese kg/mese).
  // Default: oggi su mobile, settimana su desktop.
  const [vista, setVista] = useState(() => isMobile ? 'oggi' : 'settimana')
  // Stato dati per le viste estese (mese, storico)
  const [meseData, setMeseData] = useState(null)
  const [storicoData, setStoricoData] = useState(null)
  // Ordinamento gusti: di default alfabetico ascendente. Click sui label di
  // header colonna (PROD/RIMAN giorno N o VENDUTO SETT) toggla la metrica
  // di sort e direzione.
  // sort.by: 'nome' | { tipo: 'prod'|'riman', giorno: 0..6 } | 'venduto'
  // sort.dir: 'asc' | 'desc'
  const [sort, setSort] = useState({ by: 'nome', dir: 'asc' })
  // Stato dialog import file (multi-step). null = chiuso.
  const [importDlg, setImportDlg] = useState(null)

  // Lista gusti = unione di ricettario + gusti orfani (presenti in DB ma
  // non nel ricettario). Cosi' un file importato con nomi non ancora a
  // ricettario non viene "nascosto" nel foglio settimanale.
  const gusti = useMemo(() => elencoGusti(ricettario, righe), [ricettario, righe])

  useEffect(() => {
    let alive = true
    if (!orgId || !sedeId) { setLoading(false); return }
    setLoading(true)
    caricaSettimana(orgId, sedeId, lunediIso)
      .then(data => { if (alive) { setRighe(data); setLoading(false) } })
      .catch(e => { if (alive) { console.error(e); setLoading(false) } })
    return () => { alive = false }
  }, [orgId, sedeId, lunediIso])

  // Caricamento dati MESE quando si seleziona la vista mese.
  // Carica tutte le righe del mese corrente del lunediIso.
  useEffect(() => {
    if (vista !== 'mese' || !orgId || !sedeId) return
    const d = new Date(lunediIso)
    const inizio = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    const fine = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
    supabase.from('inventario_produzione')
      .select('gusto_nome, data, produzione_g, rimanenza_g, scarto_g')
      .eq('organization_id', orgId).eq('sede_id', sedeId)
      .gte('data', inizio).lt('data', fine)
      .then(({ data }) => setMeseData({ righe: data || [], inizio, fine }))
  }, [vista, orgId, sedeId, lunediIso])

  // Caricamento dati STORICO (ultimi 6 mesi) quando si apre vista storico.
  useEffect(() => {
    if (vista !== 'storico' || !orgId || !sedeId) return
    const oggi = new Date()
    const inizio = new Date(oggi.getFullYear(), oggi.getMonth() - 5, 1).toISOString().slice(0, 10)
    supabase.from('inventario_produzione')
      .select('gusto_nome, data, produzione_g, rimanenza_g, scarto_g')
      .eq('organization_id', orgId).eq('sede_id', sedeId)
      .gte('data', inizio)
      .order('data')
      .then(({ data }) => setStoricoData({ righe: data || [], inizio }))
  }, [vista, orgId, sedeId])

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
          {[['oggi','Oggi'], ['settimana','Settimana'], ['mese','Mese'], ['storico','Storico']].map(([k, lbl]) => {
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
      ) : vista === 'mese' ? (
        <VistaMese gusti={gustiOrdinati} righeMese={meseData?.righe || []} lunediIso={lunediIso} />
      ) : vista === 'storico' ? (
        <VistaStorico gusti={gustiOrdinati} righeStorico={storicoData?.righe || []} inizio={storicoData?.inizio} />
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
              {gustiOrdinati.map(({ nome, orfano }) => {
                const gustoKey = normGusto(nome)
                const byData = matrice[gustoKey] || {}
                return (
                  <tr key={gustoKey} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                    <td style={tdGusto}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {nome}
                        {orfano && (
                          <span title="Questo gusto non e' nel ricettario. Per gestirne food cost e allergeni aggiungilo da Ricettario → Nuova ricetta."
                            style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            non a ricettario
                          </span>
                        )}
                      </div>
                    </td>
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
          ricettario={ricettario}
          state={importDlg}
          setState={setImportDlg}
          onCommit={async (batch) => {
            // batch: [{sheetName, sedeId, righe}] — uno per sheet sede.
            // Upsertiamo in serie. Conta totale ok/ko.
            let ok = 0, ko = 0
            const sediCoinvolte = new Set()
            for (const blocco of (batch || [])) {
              for (const r of (blocco.righe || [])) {
                try {
                  await salvaCella(orgId, blocco.sedeId, r.gusto_nome, r.data, {
                    produzione_g: r.produzione_g,
                    rimanenza_g: r.rimanenza_g,
                    scarto_g: 0,
                  })
                  ok++
                } catch (e) { console.error('salvaCella import:', e); ko++ }
              }
              sediCoinvolte.add(blocco.sedeId)
            }
            // Ricarica la settimana corrente per la sede attiva.
            const fresh = await caricaSettimana(orgId, sedeId, lunediIso)
            setRighe(fresh)
            setImportDlg(null)
            const nSedi = sediCoinvolte.size
            notify?.(ko > 0
              ? `Import: ${ok} righe salvate, ${ko} errori (su ${nSedi} sedi)`
              : `Import: ${ok} righe salvate in ${nSedi} ${nSedi === 1 ? 'sede' : 'sedi'}`,
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
function DialogImport({ orgId, sedeId, righeDb, ricettario: ricettarioProp, state, setState, onCommit }) {
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
        background: '#FFFFFF', borderRadius: 16, maxWidth: 860, width: '100%',
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

        {dlg.step === 'pick' && <StepPick
          onParsed={(parsed) => setState({ ...dlg, ...parsed, step: 'setup' })}
          onCancel={close}
        />}

        {dlg.step === 'setup' && <StepSetupMulti
          orgId={orgId} sedeCorrenteId={sedeId}
          classif={dlg.classif}
          fileName={dlg.fileName}
          meseRilevato={dlg.meseRilevato}
          ricettario={ricettarioProp}
          onBack={() => setState({ ...dlg, step: 'pick' })}
          onConferma={(righeBatch) => onCommit(righeBatch)}
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

      // Classifichiamo i sheet: sedi (con layout GUSTI/PROD), totali, b2b, altri.
      const classif = classificaSheet(XLSX, wb)
      const meseAnno = parseNomeFile(file.name)

      onParsed({
        fileName: file.name,
        classif,
        meseRilevato: meseAnno,  // null se non riconosciuto
        bisognaSceglieMese: !meseAnno,
      })
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

// ── StepSetupMulti: setup unico per file multi-sheet ──────────────────────
// Mostra:
//   - selettore mese/anno (sempre cambiabile, anche se rilevato dal nome)
//   - tabella sheet rilevati con mapping sede + checkbox includi
//   - check totali cross-sheet vs sheet TOTALI (informativo)
//   - bottone "Importa N righe in M sedi"
const MESI_LABEL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function StepSetupMulti({ orgId, sedeCorrenteId, classif, fileName, meseRilevato, onBack, onConferma, ricettario }) {
  // Mese/anno: di default usa rilevato, altrimenti mese corrente.
  const oggi = new Date()
  const [mese, setMese] = useState(meseRilevato?.mese || (oggi.getMonth() + 1))
  const [anno, setAnno] = useState(meseRilevato?.anno || oggi.getFullYear())
  // Sedi dell'org (per il mapping sheet -> sede)
  const [sedi, setSedi] = useState([])
  // mappaSede[sheetName] = sede_id (selezionata dall'utente) | '' (skip)
  const [mappaSede, setMappaSede] = useState({})

  useEffect(() => {
    if (!orgId) return
    supabase.from('sedi').select('id, nome, is_default, is_sede_produzione, metodo_produzione, attiva')
      .eq('organization_id', orgId).eq('attiva', true)
      .then(({ data }) => {
        const lista = data || []
        setSedi(lista)
        // Auto-mapping iniziale: per ogni sheet sede, trova la sede dell'org
        // col nome che corrisponde. Sheet senza match -> '' (skip).
        const m = {}
        for (const sh of (classif?.sedi || [])) {
          const sede = trovaSedePerSheet(sh.sheetName, lista)
          m[sh.sheetName] = sede?.id || ''
        }
        setMappaSede(m)
      })
  }, [orgId])

  const lunediBase = useMemo(() => lunediSettimana1DelMese(mese, anno), [mese, anno])

  // Parsing in tempo reale di tutti gli sheet sede usando lunediBase corrente.
  const parsatiPerSheet = useMemo(() => {
    return (classif?.sedi || []).map(sh => ({
      sheetName: sh.sheetName,
      parsato: parseFoglioInventario(sh.matrice, lunediBase),
    }))
  }, [classif, lunediBase])

  // Check totali cross-sheet (sommiamo solo gli sheet inclusi nel mapping).
  const checkTot = useMemo(() => {
    const inclusi = parsatiPerSheet
      .filter(x => mappaSede[x.sheetName])
      .map(x => x.parsato.righe)
    if (!classif?.totali) return { coerente: true, divergenze: [] }
    return checkTotaliCrossSheet(inclusi, classif.totali.matrice)
  }, [parsatiPerSheet, mappaSede, classif])

  // Conteggio finale: numero righe totali da importare.
  const totRighe = useMemo(() => parsatiPerSheet
    .filter(x => mappaSede[x.sheetName])
    .reduce((s, x) => s + (x.parsato?.righe?.length || 0), 0)
  , [parsatiPerSheet, mappaSede])

  // Gusti orfani: presenti nel file ma non nel ricettario. Informativi:
  // l'import procede comunque ma segnaliamo che andrebbero aggiunti al
  // ricettario per gestire food cost, allergeni, categorie.
  const gustiOrfani = useMemo(() => {
    if (!ricettario?.ricette) return []
    const nomiRic = new Set(
      Object.values(ricettario.ricette || {})
        .filter(r => {
          const tipo = (r.tipo || 'fetta').toString()
          return tipo !== 'semilavorato' && tipo !== 'interno'
        })
        .map(r => (r.nome || '').toUpperCase().trim())
    )
    const trovati = new Set()
    for (const x of parsatiPerSheet) {
      if (!mappaSede[x.sheetName]) continue
      for (const g of (x.parsato?.gusti || [])) {
        if (!nomiRic.has(g)) trovati.add(g)
      }
    }
    return [...trovati].sort()
  }, [parsatiPerSheet, mappaSede, ricettario])

  const numSediIncluse = Object.values(mappaSede).filter(Boolean).length

  function confermaImport() {
    // Batch: per ogni sede, lista delle righe. Il chiamante (DialogImport)
    // le inoltra al commit.
    const batch = parsatiPerSheet
      .filter(x => mappaSede[x.sheetName])
      .map(x => ({
        sheetName: x.sheetName,
        sedeId: mappaSede[x.sheetName],
        righe: x.parsato.righe,
      }))
    onConferma(batch)
  }

  return (
    <div>
      {!meseRilevato && (
        <div style={{
          padding: '12px 14px', background: '#FEF9EB',
          border: '1px solid #FDE68A', borderRadius: 10, marginBottom: 14,
          fontSize: 12.5, color: '#78350F', lineHeight: 1.55,
        }}>
          <strong>Mese non riconosciuto dal nome file</strong>
          (<code style={{ background: '#FFFFFF', padding: '1px 6px', borderRadius: 4 }}>{fileName}</code>).
          Scegli manualmente qui sotto.
        </div>
      )}

      {/* SELETTORE MESE/ANNO: sempre cambiabile, anche post-detect (es. per
          la demo dove vogliamo trattare un file dicembre come maggio). */}
      <div style={{
        padding: 14, background: C.bgSubtle, borderRadius: 10, marginBottom: 16,
        border: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Periodo a cui appartiene il file
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
        {meseRilevato && (meseRilevato.mese !== mese || meseRilevato.anno !== anno) && (
          <div style={{ fontSize: 11.5, color: '#92400E', marginTop: 8 }}>
            ⚠️ Stai cambiando il mese rispetto a quello rilevato nel nome file ({MESI_LABEL[meseRilevato.mese - 1]} {meseRilevato.anno}).
          </div>
        )}
      </div>

      {/* MAPPING SHEET -> SEDE */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Sedi rilevate nel file ({classif?.sedi?.length || 0})
        </div>
        {(classif?.sedi || []).length === 0 ? (
          <div style={{ fontSize: 13, color: C.textSoft, fontStyle: 'italic' }}>
            Nessun foglio sede riconosciuto nel file.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {parsatiPerSheet.map((x) => {
              const nRighe = x.parsato?.righe?.length || 0
              const nGusti = x.parsato?.gusti?.length || 0
              const sedeAttuale = mappaSede[x.sheetName]
              return (
                <div key={x.sheetName} style={{
                  padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10,
                  background: sedeAttuale ? '#F0FDF4' : '#FFFFFF',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: '0 0 auto' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      Foglio: {x.sheetName}
                    </div>
                    <div style={{ fontSize: 11, color: C.textSoft }}>
                      {nGusti} gusti · {nRighe} righe
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={lblForm}>Importa nella sede</label>
                    <select value={sedeAttuale}
                      onChange={e => setMappaSede(m => ({ ...m, [x.sheetName]: e.target.value }))}
                      style={{ ...inpForm, minWidth: 200 }}>
                      <option value="">— Ignora questo foglio —</option>
                      {sedi.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.nome}{s.is_default ? ' (principale)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CHECK TOTALI */}
      {classif?.totali && numSediIncluse > 0 && (
        checkTot.divergenze.length === 0 ? (
          <div style={{
            padding: '10px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0',
            borderRadius: 10, marginBottom: 14, fontSize: 12.5, color: '#065F46',
          }}>
            ✓ Check totali OK: la somma dei fogli sede corrisponde ai totali dichiarati.
          </div>
        ) : (
          <div style={{
            padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 10, marginBottom: 14,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 6 }}>
              ⚠️ Trovati {checkTot.divergenze.length} gusti con totali divergenti
            </div>
            <div style={{ fontSize: 11.5, color: '#7F1D1D', marginBottom: 8 }}>
              La somma dei fogli sede non coincide col valore dichiarato nel foglio TOTALI (oltre il 5%).
              L'import procede comunque: ricontrolla i dati nel file originale.
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ background: '#FAFBFC' }}>
                    <th style={tdHead}>Gusto</th>
                    <th style={{ ...tdHead, textAlign: 'right' }}>Calcolato (kg)</th>
                    <th style={{ ...tdHead, textAlign: 'right' }}>Dichiarato (kg)</th>
                    <th style={{ ...tdHead, textAlign: 'right' }}>Diff %</th>
                  </tr>
                </thead>
                <tbody>
                  {checkTot.divergenze.slice(0, 20).map((d, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                      <td style={tdCell}>{d.gusto}</td>
                      <td style={{ ...tdCell, textAlign: 'right', ...TNUM }}>{(d.calcolato / 1000).toFixed(1)}</td>
                      <td style={{ ...tdCell, textAlign: 'right', ...TNUM }}>{(d.dichiarato / 1000).toFixed(1)}</td>
                      <td style={{ ...tdCell, textAlign: 'right', ...TNUM, color: '#991B1B', fontWeight: 700 }}>
                        {d.diffPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* WARNING GUSTI ORFANI: nomi nel file non presenti nel ricettario */}
      {gustiOrfani.length > 0 && (
        <div style={{
          padding: '12px 14px', background: '#FEF9EB',
          border: '1px solid #FDE68A', borderRadius: 10, marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#78350F', marginBottom: 6 }}>
            ℹ️ {gustiOrfani.length} {gustiOrfani.length === 1 ? 'gusto non e\'' : 'gusti non sono'} nel ricettario
          </div>
          <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.5, marginBottom: 8 }}>
            L'import procede comunque: questi gusti compariranno nel foglio con un badge "non a ricettario".
            Per gestire food cost, allergeni e categorie, aggiungi le ricette in <strong>Ricettario → Nuova ricetta</strong>.
          </div>
          <div style={{ fontSize: 11.5, color: '#78350F', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {gustiOrfani.map(g => (
              <span key={g} style={{ background: '#FFFFFF', padding: '2px 8px', borderRadius: 4, border: '1px solid #FCD34D', fontWeight: 600 }}>{g}</span>
            ))}
          </div>
        </div>
      )}

      {/* INFO SU SHEET IGNORATI */}
      {(classif?.b2b?.length > 0 || classif?.altri?.length > 0) && (
        <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 14, lineHeight: 1.5 }}>
          <strong>Fogli ignorati</strong> (non importati in questa fase):{' '}
          {[...(classif.b2b || []), ...(classif.altri || [])].map(x => x.sheetName).join(' · ')}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 12, borderTop: `1px solid ${C.borderSoft}` }}>
        <button onClick={onBack} style={btnSecondary}>← Carica altro file</button>
        <button onClick={confermaImport}
          disabled={totRighe === 0 || numSediIncluse === 0}
          style={{ ...btnPrimary, opacity: (totRighe === 0 || numSediIncluse === 0) ? 0.5 : 1 }}>
          Importa {totRighe} righe in {numSediIncluse} {numSediIncluse === 1 ? 'sede' : 'sedi'}
        </button>
      </div>
    </div>
  )
}

const tdHead = { padding: '6px 10px', textAlign: 'left', color: T.textSoft, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }
const tdCell = { padding: '5px 10px', color: T.text }


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

// ── VistaMese: settimane in colonna, kg venduti per gusto/settimana + totale
// Calcoliamo il venduto da righeMese (riman_prev + prod - riman - scarto)
// raggruppato per settimana ISO del mese.
function VistaMese({ gusti, righeMese, lunediIso }) {
  const m = useMemo(() => {
    // Indicizza per gusto+data
    const idx = {}
    for (const r of (righeMese || [])) {
      const k = `${r.gusto_nome}|${r.data}`
      idx[k] = r
    }
    // Per ogni gusto, calcola venduto giorno per giorno e raggruppa per settimana.
    const out = {}
    const start = new Date(lunediIso); start.setDate(1)  // primo del mese del lunediIso
    const inizioMese = new Date(start.getFullYear(), start.getMonth(), 1)
    const fineMese = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    const nGg = fineMese.getDate()
    for (const { nome } of (gusti || [])) {
      const k = normGusto(nome)
      const per_sett = [0, 0, 0, 0, 0]  // 5 settimane max
      let totProd = 0, totVend = 0
      let rimanPrev = 0
      for (let d = 1; d <= nGg; d++) {
        const dateIso = `${inizioMese.getFullYear()}-${String(inizioMese.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const r = idx[`${k}|${dateIso}`]
        if (!r) {
          rimanPrev = 0
          continue
        }
        const prod = Number(r.produzione_g) || 0
        const riman = Number(r.rimanenza_g) || 0
        const scarto = Number(r.scarto_g) || 0
        const venduto = Math.max(0, rimanPrev + prod - riman - scarto)
        totProd += prod
        totVend += venduto
        // Settimana del mese (0-indexed, max 4): (giorno - 1) / 7 arrotondato
        const sw = Math.min(4, Math.floor((d - 1) / 7))
        per_sett[sw] += venduto
        rimanPrev = riman
      }
      out[k] = { per_sett, totProd, totVend }
    }
    return out
  }, [gusti, righeMese, lunediIso])

  const meseLabel = (() => {
    const d = new Date(lunediIso)
    return `${MESI_LABEL[d.getMonth()]} ${d.getFullYear()}`
  })()

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
      <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Riepilogo mensile · {meseLabel}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Gusto</th>
              {[1,2,3,4,5].map(w => (
                <th key={w} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  W{w}
                </th>
              ))}
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#FEF9EB' }}>
                Tot. venduto
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Tot. prodotto
              </th>
            </tr>
          </thead>
          <tbody>
            {(gusti || []).map(({ nome }) => {
              const k = normGusto(nome)
              const r = m[k] || { per_sett: [0,0,0,0,0], totProd: 0, totVend: 0 }
              return (
                <tr key={k} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                  <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: C.text }}>{nome}</td>
                  {r.per_sett.map((v, i) => (
                    <td key={i} style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: v > 0 ? C.text : C.textSoft, fontSize: 12.5 }}>
                      {v > 0 ? (v / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' kg' : '—'}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 800, fontSize: 13, background: '#FEF9EB' }}>
                    {(r.totVend / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: C.textMid, fontSize: 12.5 }}>
                    {(r.totProd / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: C.textSoft, lineHeight: 1.5 }}>
        W1–W5 = settimane del mese. Il venduto e' calcolato dal differenziale di inventario; le settimane parziali a inizio/fine mese possono mostrare valori 0 se non hai compilato quei giorni.
      </div>
    </div>
  )
}

// ── VistaStorico: timeline scorrevole multi-mese (ultimi 6 mesi) ──────────
function VistaStorico({ gusti, righeStorico, inizio }) {
  const data = useMemo(() => {
    const mesi = []
    const oggi = new Date()
    const inizioD = new Date(oggi.getFullYear(), oggi.getMonth() - 5, 1)
    for (let i = 0; i < 6; i++) {
      const d = new Date(inizioD.getFullYear(), inizioD.getMonth() + i, 1)
      mesi.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: MESI_LABEL[d.getMonth()].slice(0, 3) + ` '${String(d.getFullYear()).slice(2)}`,
        month: d.getMonth(),
        year: d.getFullYear(),
      })
    }
    // Indicizza venduto per gusto+mese.
    const idx = {}
    for (const { nome } of (gusti || [])) {
      idx[normGusto(nome)] = mesi.map(() => 0)
    }
    // Calcolo venduto per riga: (riman_prev + prod - riman - scarto). Iteriamo
    // ordinato per gusto+data.
    const perGusto = {}
    for (const r of (righeStorico || [])) {
      const k = r.gusto_nome
      perGusto[k] = perGusto[k] || []
      perGusto[k].push(r)
    }
    for (const [k, righe] of Object.entries(perGusto)) {
      righe.sort((a, b) => a.data.localeCompare(b.data))
      let rimanPrev = 0
      let prevDataDay = null
      for (const r of righe) {
        const prod = Number(r.produzione_g) || 0
        const riman = Number(r.rimanenza_g) || 0
        const scarto = Number(r.scarto_g) || 0
        // Se data non e' il giorno dopo prevDataDay -> reset rimanPrev (gap).
        const d = new Date(r.data)
        if (prevDataDay !== null) {
          const diffGg = Math.round((d - prevDataDay) / 86400000)
          if (diffGg !== 1) rimanPrev = 0
        }
        const venduto = Math.max(0, rimanPrev + prod - riman - scarto)
        rimanPrev = riman
        prevDataDay = d
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const meseIdx = mesi.findIndex(m => m.key === ym)
        if (meseIdx >= 0) {
          idx[k] = idx[k] || mesi.map(() => 0)
          idx[k][meseIdx] += venduto
        }
      }
    }
    return { mesi, idx }
  }, [gusti, righeStorico])

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
      <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Storico vendite (kg) · Ultimi 6 mesi
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', left: 0, background: '#F8FAFC' }}>
                Gusto
              </th>
              {data.mesi.map(m => (
                <th key={m.key} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 80 }}>
                  {m.label}
                </th>
              ))}
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#FEF9EB' }}>
                Totale
              </th>
            </tr>
          </thead>
          <tbody>
            {(gusti || []).map(({ nome }) => {
              const k = normGusto(nome)
              const arr = data.idx[k] || data.mesi.map(() => 0)
              const tot = arr.reduce((s, v) => s + v, 0)
              const max = Math.max(1, ...arr)
              return (
                <tr key={k} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                  <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: C.text, position: 'sticky', left: 0, background: C.bgCard }}>{nome}</td>
                  {arr.map((v, i) => (
                    <td key={i} style={{ padding: '4px 8px', textAlign: 'right', ...TNUM, color: v > 0 ? C.text : C.textSoft, fontSize: 12, position: 'relative' }}>
                      {v > 0 && (
                        <div style={{ position: 'absolute', left: 4, right: 4, bottom: 2, height: 3, background: '#F0EAE6', borderRadius: 2 }}>
                          <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: T.brand, borderRadius: 2 }} />
                        </div>
                      )}
                      <span style={{ position: 'relative', zIndex: 1 }}>
                        {v > 0 ? (v / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) : '—'}
                      </span>
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 800, fontSize: 13, background: '#FEF9EB' }}>
                    {(tot / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: C.textSoft, lineHeight: 1.5 }}>
        Quantità in kg. Le barre rossastre danno il peso visivo del mese più alto per ogni gusto. Scrolla orizzontalmente per i mesi precedenti.
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
