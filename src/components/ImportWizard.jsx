// Import Wizard — carica un file cliente (Excel/CSV) e lo importa in bulk.
//
// Flusso in 4 step:
//   1. Scelta tipo dato + upload file
//   2. Rivedi il mapping (AI-suggerito, editabile)
//   3. Rivedi la validazione (righe valide/con errori)
//   4. Insert client-side diretto su Supabase (JWT + RLS)
//
// Privacy per costruzione: solo headers + 5 sample rows arrivano al server
// Foodos (per la chiamata AI di mapping). Tutto il resto (validation, insert)
// avviene nel browser dell'utente. I valori pieni non passano mai da Vercel.
//
// Tono UI: umano, breve, no AI-copy, no emoji, numeri IT, allineamento box.

import React, { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from './Icon'
import { loadXLSX } from '../lib/xlsx'
import { parseWorkbook, getSamples, fileToArrayBuffer } from '../lib/importParse'
import { IMPORT_SCHEMAS, getEntitySchema, listEntities } from '../lib/importSchemas'
import { validateRows, findMissingRequired, getLookupFields } from '../lib/importValidateCore'
import { callImportMap, callImportDetectFormat, saveImportMapping } from '../lib/importAiMap'
import { applyUnpivot } from '../lib/importUnpivot'
import { guessMonthIsoFromFilename } from '../lib/importDateGuess'
import { summarizeErrors } from '../lib/importErrorSummary'

const BATCH_SIZE = 200
// Righe massime per file. Era dichiarato nella schermata ("max 5.000 righe")
// e non controllato in nessun punto del codice.
const MAX_RIGHE_FILE = 5000
const MAX_PREVIEW_ROWS = 10

export default function ImportWizard({ orgId, onClose, notify, initialEntity = '' }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()

  const [step, setStep] = useState(1)
  const [entity, setEntity] = useState(initialEntity || '')
  const [file, setFile] = useState(null)
  const [parsedSheet, setParsedSheet] = useState(null)
  const [detectInfo, setDetectInfo] = useState(null)
  const [mapping, setMapping] = useState({})
  const [aiNotes, setAiNotes] = useState('')
  const [activeConversions, setActiveConversions] = useState(new Set())
  const [validationResult, setValidationResult] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [insertResult, setInsertResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const schema = useMemo(() => (entity ? getEntitySchema(entity) : null), [entity])

  // ── STEP 1 → STEP 2: parsea file, detect formato (LONG/WIDE), unpivot se serve, mapping AI
  async function goToStep2() {
    if (!file || !entity) { setError('Scegli tipo dato e carica il file.'); return }
    setError(''); setLoading(true)
    try {
      const XLSX = await loadXLSX()
      const buf = await fileToArrayBuffer(file)
      const wb = parseWorkbook(buf, XLSX)
      const sheetCount = wb.sheetNames.length
      // Il limite di 5.000 righe era scritto sotto il bottone e non applicato
      // da nessuna parte: un file da 40.000 righe partiva, e si piantava a
      // metà senza dire perché.
      const righeTotali = wb.sheetNames.reduce((a, nm) => a + ((wb.rawSheets[nm] || []).length), 0)
      if (righeTotali > MAX_RIGHE_FILE) {
        throw new Error(`Il file ha ${righeTotali.toLocaleString('it-IT', { useGrouping: 'always' })} righe: il massimo è ${MAX_RIGHE_FILE.toLocaleString('it-IT', { useGrouping: 'always' })}. Dividilo in più file (per esempio un mese per file) e caricali uno alla volta.`)
      }

      let detected = null
      const looksComplex = sheetCount > 1 || !!schema?.wideFormatWarning
      if (looksComplex) {
        // Payload detect: primi 20 righe RAW per ogni sheet.
        const sheetsPayload = {}
        for (const name of wb.sheetNames) {
          const raw = wb.rawSheets[name] || []
          sheetsPayload[name] = raw.slice(0, 20)
        }
        try {
          detected = await callImportDetectFormat({ entity, sheets: sheetsPayload })
        } catch (e) {
          detected = { format: 'long', unpivot_config: null, notes: `Riconoscimento fallito: ${e?.message || 'errore'}. Provo come formato semplice.` }
        }
      }

      let sheetForMapping = null
      if (detected?.format === 'wide' && detected.unpivot_config) {
        // Fix month_iso mancante: prima prova dal nome del file, poi chiede all'utente.
        const cfg = detected.unpivot_config
        if (Array.isArray(cfg.column_groups)) {
          for (const g of cfg.column_groups) {
            if (!g.month_iso || g.month_iso === 'null' || g.month_iso === null) {
              const fromFilename = guessMonthIsoFromFilename(file?.name || '')
              if (fromFilename) {
                g.month_iso = fromFilename
              } else {
                // Prompt utente (formato YYYY-MM). Se annulla, throw.
                const suggested = new Date().toISOString().slice(0, 7)
                const answer = window.prompt(
                  'Non riesco a capire di che mese sono questi dati. Scrivilo tu nel formato ANNO-MESE (es. 2026-05 per maggio 2026):',
                  suggested
                )
                if (!answer || !/^\d{4}-\d{2}$/.test(answer.trim())) {
                  throw new Error('Formato mese non valido. Deve essere ANNO-MESE, es. 2026-05.')
                }
                g.month_iso = answer.trim()
              }
            }
          }
        }
        const { rows: longRows, per_sheet, warnings } = applyUnpivot(wb.rawSheets, cfg)
        if (longRows.length === 0) {
          throw new Error('Formato WIDE riconosciuto ma nessuna riga estratta. Controlla il file o dimmi come è organizzato.')
        }
        const headers = Array.from(longRows.reduce((acc, r) => {
          for (const k of Object.keys(r)) acc.add(k)
          return acc
        }, new Set()))
        sheetForMapping = { headers, rows: longRows, sheetName: `(unpivot LONG da ${sheetCount} sheet)` }
        setDetectInfo({
          format: 'wide',
          unpivot_config: detected.unpivot_config,
          notes: detected.notes,
          sheetCount,
          unpivotStats: { total: longRows.length, per_sheet, warnings },
        })
      } else {
        const sheet = wb.firstSheet
        if (sheet.rows.length === 0) throw new Error('Il file non contiene righe di dati.')
        sheetForMapping = sheet
        setDetectInfo(detected ? {
          format: detected.format || 'long',
          unpivot_config: null,
          notes: detected.notes,
          sheetCount,
          unpivotStats: null,
        } : null)
      }

      setParsedSheet(sheetForMapping)

      const samples = getSamples(sheetForMapping, 5)
      const aiRes = await callImportMap({ entity, headers: sheetForMapping.headers, sampleRows: samples })
      setMapping(aiRes.mapping || {})
      setAiNotes(aiRes.notes || '')
      setStep(2)
    } catch (e) {
      setError(e?.message || 'Errore durante la lettura del file.')
    } finally { setLoading(false) }
  }

  // ── STEP 2 → STEP 3: valida tutte le righe con il mapping ────────
  async function goToStep3() {
    if (!parsedSheet || !schema) return
    const missing = findMissingRequired(mapping, schema)
    if (missing.length > 0) {
      setError(`Devi mappare i campi obbligatori: ${missing.join(', ')}`)
      return
    }
    setError(''); setLoading(true)
    try {
      // Se lo schema ha field lookup, carica le opzioni disponibili dal DB.
      const lookupFields = getLookupFields(schema)
      const lookups = {}
      for (const lf of lookupFields) {
        const { table, match_col, target_col, scope } = lf.resolver
        let q = supabase.from(table).select(`${target_col}, ${match_col}`)
        if (scope === 'org') q = q.eq('organization_id', orgId)
        const { data, error: e } = await q
        if (e) { throw new Error(`Errore lookup ${table}: ${e.message}`) }
        const map = new Map()
        for (const row of (data || [])) {
          const k = String(row[match_col] || '').trim().toLowerCase()
          if (k) map.set(k, row[target_col])
        }
        lookups[lf.name] = map
      }
      const res = validateRows(parsedSheet.rows, mapping, schema, { lookups, activeConversions })
      setValidationResult(res)
      setStep(3)
    } catch (e) {
      setError(e?.message || 'Errore nel caricamento delle opzioni.')
    } finally { setLoading(false) }
  }

  // ── STEP 3 → STEP 4: insert diretto su Supabase ─────────────────
  async function goToStep4() {
    if (!validationResult || validationResult.valid_rows.length === 0) return
    setError(''); setLoading(true)
    const prepared = validationResult.valid_rows.map(r => ({ organization_id: orgId, ...r }))

    // ═══ Check duplicati: se lo schema ha upsertOn e c'e' una colonna 'data',
    // per ogni combinazione (sede_id, YYYY-MM) unica delle righe da inserire,
    // conta quante righe esistono già nel DB. Se ≥1, chiedi conferma prima
    // di procedere. Su conferma → uso upsert (sovrascrive). Su annulla → stop.
    // Utile per: "hai già caricato luglio 2025 di Berthollet, sicuro di
    // ricaricare?". Diverso da luglio 2026 (mese-anno differente → OK).
    // ═══ Doppioni per nome, quando lo schema NON ha upsertOn.
    // `fornitori` e `dipendenti` dichiarano uniqueOn:['nome'] ma in DB non
    // esiste nessun indice unique, e il controllo qui sotto girava solo per
    // gli schemi con upsertOn (uno). Risultato: ricaricare lo stesso file
    // raddoppiava tutto e la schermata diceva "Tutto caricato!". In
    // produzione sono 283 fornitori e 290 dipendenti: un secondo
    // caricamento li portava a 566 e 580.
    // Qui non possiamo fare upsert (senza indice il database lo rifiuta):
    // controlliamo i nomi che ci sono già, li diciamo, e lasciamo scegliere
    // fra saltarli e inserirli comunque.
    let prepared2 = prepared
    const chiaveNome = !schema.upsertOn && (schema.uniqueOn || []).length === 1
      ? schema.uniqueOn[0] : null
    if (chiaveNome) {
      const nomi = [...new Set(prepared.map(r => r[chiaveNome]).filter(Boolean).map(String))]
      if (nomi.length > 0) {
        try {
          const esistenti = new Set()
          for (let i = 0; i < nomi.length; i += 200) {
            const { data } = await supabase.from(schema.table)
              .select(chiaveNome).eq('organization_id', orgId)
              .in(chiaveNome, nomi.slice(i, i + 200))
            for (const r of (data || [])) esistenti.add(String(r[chiaveNome]).trim().toLowerCase())
          }
          const doppi = prepared.filter(r => esistenti.has(String(r[chiaveNome] || '').trim().toLowerCase()))
          if (doppi.length > 0) {
            const elenco = [...new Set(doppi.map(r => r[chiaveNome]))].slice(0, 8).join(', ')
            const salta = window.confirm(
              `${doppi.length} ${doppi.length === 1 ? 'riga è' : 'righe sono'} già in Foodos con lo stesso nome:\n\n${elenco}${doppi.length > 8 ? '…' : ''}\n\n` +
              `OK = le salto e carico solo le altre ${prepared.length - doppi.length}.\n` +
              `Annulla = le carico comunque, e avrai due righe con lo stesso nome.`
            )
            if (salta) {
              prepared2 = prepared.filter(r => !esistenti.has(String(r[chiaveNome] || '').trim().toLowerCase()))
              if (prepared2.length === 0) {
                setLoading(false)
                setError('Erano tutte già presenti: non ho caricato niente.')
                return
              }
            }
          }
        } catch (e) {
          // Se il controllo non parte lo diciamo, invece di caricare doppioni
          // in silenzio.
          console.error('controllo doppioni:', e)
        }
      }
    }

    let useUpsert = false
    if (schema.upsertOn && prepared.some(r => r.data)) {
      const combos = new Set()
      for (const r of prepared) {
        if (!r.data || !r.sede_id) continue
        const yyyymm = String(r.data).slice(0, 7)  // "2026-07"
        combos.add(`${r.sede_id}|${yyyymm}`)
      }
      const dupPerCombo = []
      for (const combo of combos) {
        const [sedeId, ym] = combo.split('|')
        const [year, month] = ym.split('-')
        const dayFrom = `${ym}-01`
        const nextMonth = new Date(Number(year), Number(month), 1).toISOString().slice(0, 10)
        try {
          const { count } = await supabase.from(schema.table)
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('sede_id', sedeId)
            .gte('data', dayFrom).lt('data', nextMonth)
          if ((count || 0) > 0) {
            const sedeNome = combo.split('|')[0]  // uuid, sistemare label se si ha 'sedi' prop
            dupPerCombo.push({ sedeId, sedeNome, ym, count: count || 0 })
          }
        } catch { /* fail-open: se il check non parte, procedi con insert normale */ }
      }
      if (dupPerCombo.length > 0) {
        const list = dupPerCombo
          .map(d => `- Mese ${d.ym}: ${d.count.toLocaleString('it-IT', { useGrouping: 'always' })} righe già presenti`)
          .join('\n')
        const conferma = window.confirm(
          `Attenzione: hai già dei dati caricati per uno o più mesi che stai per importare:\n\n${list}\n\n` +
          `Se procedi, i dati esistenti verranno SOVRASCRITTI con quelli del file.\n\n` +
          `Vuoi comunque continuare?`
        )
        if (!conferma) {
          setLoading(false)
          setError('Caricamento annullato: dati esistenti per il mese scelto.')
          return
        }
        useUpsert = true
      }
    }

    setStep(4)
    setProgress({ done: 0, total: prepared2.length })
    let insertedCount = 0
    const failedBatches = []
    for (let i = 0; i < prepared2.length; i += BATCH_SIZE) {
      const chunk = prepared2.slice(i, i + BATCH_SIZE)
      // `_row_index` e' nostro, non una colonna: va togliato prima di scrivere.
      const payload = chunk.map(({ _row_index, ...resto }) => resto)  // eslint-disable-line no-unused-vars
      let queryBuilder = supabase.from(schema.table)
      let insErr, data
      if (useUpsert) {
        // Costruisci onConflict dai campi uniqueOn dello schema
        const onConflict = ['organization_id', ...(schema.uniqueOn || [])].join(',')
        const resp = await queryBuilder.upsert(payload, { onConflict }).select('id')
        insErr = resp.error; data = resp.data
      } else {
        const resp = await queryBuilder.insert(payload).select('id')
        insErr = resp.error; data = resp.data
      }
      if (insErr) {
        // `batch_start` e' l'indice dentro le righe VALIDE, che non e' la riga
        // del file: se 400 righe erano da rivedere, "riga 201" era un'altra.
        // Portiamo anche il numero di riga vero, quando c'e'.
        failedBatches.push({
          batch_start: i,
          riga_file: chunk[0]?._row_index != null ? chunk[0]._row_index + 2 : null,
          error: insErr.message,
        })
      } else {
        insertedCount += (data?.length || 0)
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, prepared2.length), total: prepared2.length })
    }
    setInsertResult({ inserted: insertedCount, failed: failedBatches, total: prepared2.length })
    setLoading(false)
    if (insertedCount > 0 && notify) notify(`Caricate ${insertedCount} righe in ${schema.label}.`, 'success')

    // Salva il mapping confermato nella library cross-cliente (fire-and-forget).
    // Se ha portato beneficio a questo cliente, servira' anche ai prossimi.
    if (insertedCount > 0 && parsedSheet?.headers?.length > 0) {
      saveImportMapping({ entity, headers: parsedSheet.headers, mapping })
    }
  }

  function reset() {
    setStep(1); setEntity(''); setFile(null); setParsedSheet(null); setDetectInfo(null)
    setMapping({}); setAiNotes(''); setActiveConversions(new Set())
    setValidationResult(null); setProgress({ done: 0, total: 0 })
    setInsertResult(null); setError(''); setLoading(false)
  }

  // ── Layout comune ─────────────────────────────────────────────────
  const CARD_BG = '#FFF'
  const BORDER = T.border || '#E5E9EF'
  const TXT = T.text || '#0E1726'
  const SOFT = T.textSoft || '#8B95A7'
  const BRAND = T.brand || '#6E0E1A'
  const GREEN = T.green || '#16A34A'
  const RED = T.red || '#C0392B'
  const AMBER = '#B45309'
  const AMBER_BG = '#FEF3C7'

  return (
    <div style={{
      background: '#F8FAFC', minHeight: '100vh',
      padding: isMobile ? 14 : isTablet ? 20 : 28, boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <Header step={step} onClose={onClose} isMobile={isMobile}/>
        <Steppers step={step} isMobile={isMobile}/>

        {error && (
          <div role="alert" style={{
            background: '#FEE2E2', color: '#7F1D1D', border: `1px solid #FCA5A5`,
            padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 14, fontWeight: 600,
          }}>{error}</div>
        )}

        <div style={{
          background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14,
          padding: isMobile ? 16 : 24,
        }}>
          {step === 1 && (
            <StepFile
              entity={entity} setEntity={setEntity}
              file={file} setFile={setFile}
              loading={loading}
              onNext={goToStep2}
              isMobile={isMobile}
              T={{ TXT, SOFT, BRAND, BORDER }}
            />
          )}
          {step === 2 && schema && parsedSheet && (
            <StepMapping
              schema={schema}
              headers={parsedSheet.headers}
              sampleRows={parsedSheet.rows.slice(0, 5)}
              detectInfo={detectInfo}
              mapping={mapping} setMapping={setMapping}
              activeConversions={activeConversions} setActiveConversions={setActiveConversions}
              aiNotes={aiNotes}
              loading={loading}
              onBack={() => setStep(1)}
              onNext={goToStep3}
              isMobile={isMobile}
              T={{ TXT, SOFT, BRAND, BORDER, RED, AMBER, AMBER_BG, GREEN }}
            />
          )}
          {step === 3 && schema && validationResult && (
            <StepValidate
              schema={schema}
              result={validationResult}
              mapping={mapping}
              onBack={() => setStep(2)}
              onNext={goToStep4}
              isMobile={isMobile}
              T={{ TXT, SOFT, BRAND, BORDER, RED, GREEN, CARD: CARD_BG, BG: T.bgSubtle }}
            />
          )}
          {step === 4 && (
            <StepInsert
              loading={loading}
              progress={progress}
              result={insertResult}
              schema={schema}
              onFinish={onClose}
              onAnother={reset}
              isMobile={isMobile}
              T={{ TXT, SOFT, BRAND, BORDER, RED, GREEN }}
            />
          )}
        </div>

        <Reassurance isMobile={isMobile} SOFT={SOFT}/>
      </div>
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────

function Header({ step, onClose, isMobile }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: isMobile ? 14 : 20,
    }}>
      <div>
        <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: '#0E1726', lineHeight: 1.1 }}>
          Carica i tuoi dati
        </div>
        <div style={{ fontSize: 13, color: '#8B95A7', marginTop: 4 }}>
          Passo {step} di 4
        </div>
      </div>
      {onClose && (
        <button onClick={onClose}
          aria-label="Chiudi"
          style={{
            background: '#FFF', border: '1px solid #E5E9EF', borderRadius: 10,
            padding: isMobile ? '10px 12px' : '8px 14px', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#0E1726',
          }}>
          <Icon name="x" size={14}/> Chiudi
        </button>
      )}
    </div>
  )
}

// ── Steppers (progress) ───────────────────────────────────────────────

function Steppers({ step, isMobile }) {
  const labels = ['File', 'Mappatura', 'Verifica', 'Caricamento']
  return (
    <div style={{
      display: 'flex', gap: 6, marginBottom: 16,
      background: '#F1F5F9', padding: 4, borderRadius: 12,
    }}>
      {labels.map((label, i) => {
        const n = i + 1
        const isActive = n === step
        const isDone = n < step
        return (
          <div key={label} style={{
            flex: 1, textAlign: 'center',
            padding: isMobile ? '10px 4px' : '10px 8px',
            background: isActive ? '#FFF' : 'transparent',
            border: isActive ? '1px solid #E5E9EF' : '1px solid transparent',
            borderRadius: 8, fontSize: isMobile ? 11 : 12,
            fontWeight: 700, color: isDone ? '#16A34A' : isActive ? '#6E0E1A' : '#8B95A7',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isDone ? <Icon name="check" size={12}/> : <span style={{ opacity: 0.7 }}>{n}</span>}
            {!isMobile && <span>{label}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── STEP 1: file + entity ─────────────────────────────────────────

function StepFile({ entity, setEntity, file, setFile, loading, onNext, isMobile, T }) {
  const entities = listEntities().map(id => ({ id, schema: IMPORT_SCHEMAS[id] }))
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>
        1. Che dati vuoi caricare?
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 10, marginBottom: 22,
      }}>
        {entities.map(({ id, schema }) => (
          <button key={id} type="button" onClick={() => setEntity(id)}
            aria-pressed={entity === id}
            style={{
              textAlign: 'left', cursor: 'pointer',
              background: entity === id ? '#FDF2F4' : '#FFF',
              border: `2px solid ${entity === id ? T.brand : T.border}`,
              borderRadius: 12, padding: 14, transition: 'all 0.15s',
              minHeight: 88,
            }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 4 }}>
              {schema.label}
            </div>
            <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.4 }}>
              {schema.description}
            </div>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>
        2. Carica il tuo file
      </div>
      <label htmlFor="import-file-input"
        style={{
          display: 'block', cursor: 'pointer',
          background: file ? '#F0FDF4' : '#F8FAFC',
          border: `2px dashed ${file ? '#16A34A' : T.border}`,
          borderRadius: 12, padding: isMobile ? 22 : 32,
          textAlign: 'center', marginBottom: 8,
        }}>
        <Icon name={file ? 'check' : 'download'} size={20} color={file ? '#16A34A' : T.textSoft}/>
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: T.text }}>
          {file ? file.name : 'Trascina qui il tuo file, oppure clicca per sceglierlo dal computer'}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: T.textSoft }}>
          Excel (.xlsx, .xls) o CSV — max 5.000 righe
        </div>
        <input id="import-file-input" type="file"
          accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ display: 'none' }}/>
      </label>

      <div style={{ marginTop: 24, textAlign: 'right' }}>
        <button type="button" disabled={!file || !entity || loading} onClick={onNext}
          style={{
            background: (!file || !entity || loading) ? '#CBD5E1' : T.brand,
            color: '#FFF', border: 'none', borderRadius: 10,
            padding: isMobile ? '14px 22px' : '12px 26px', fontSize: 14, fontWeight: 700,
            cursor: (!file || !entity || loading) ? 'not-allowed' : 'pointer',
            minHeight: 44,
          }}>
          {loading ? 'Sto leggendo il file, dammi un attimo…' : 'Avanti'}
        </button>
      </div>
    </div>
  )
}

// ── STEP 2: mapping editabile ─────────────────────────────────────

// Fogli davvero letti dall'unpivot. `sheetCount` e' il numero di fogli del
// file, non quelli da cui sono uscite delle righe: dirlo come se fossero la
// stessa cosa nascondeva i fogli scartati.
function fogliLetti(detectInfo) {
  const ps = detectInfo?.unpivotStats?.per_sheet
  if (ps && typeof ps === 'object') {
    const n = Object.values(ps).filter(v => (typeof v === 'number' ? v : v?.rows || v?.total || 0) > 0).length
    if (n > 0) return n
  }
  return detectInfo?.sheetCount || 0
}

function StepMapping({ schema, headers, sampleRows, detectInfo, mapping, setMapping, activeConversions, setActiveConversions, aiNotes, loading, onBack, onNext, isMobile, T }) {
  function changeMap(fieldName, headerOrEmpty) {
    setMapping(prev => {
      const next = { ...prev }
      if (!headerOrEmpty) delete next[fieldName]
      else next[fieldName] = headerOrEmpty
      return next
    })
  }

  function toggleConversion(label) {
    setActiveConversions(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const mappedCols = new Set(Object.values(mapping))

  return (
    <div>
      {detectInfo?.format === 'wide' && detectInfo.unpivotStats && (
        <div style={{
          background: '#F0FDF4', border: `1px solid ${T.green}`,
          borderRadius: 10, padding: 14, marginBottom: 14,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <Icon name="check" size={18} color={T.green}/>
          <div style={{ fontSize: 14, color: '#14532D', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Ho letto il tuo file.</div>
            Ho trovato <b>{detectInfo.unpivotStats.total.toLocaleString('it-IT', { useGrouping: 'always' })} righe di produzione</b>
            {' '}in {fogliLetti(detectInfo)} {fogliLetti(detectInfo) === 1 ? 'foglio' : 'fogli'}
            {detectInfo.sheetCount > fogliLetti(detectInfo) ? ` su ${detectInfo.sheetCount}` : ''}.
            {' '}Ora dimmi solo che riga corrisponde a cosa.
            {/* I fogli che applyUnpivot ha scartato erano raccolti in
                unpivotStats.warnings e non venivano mostrati da nessuna parte,
                mentre il riquadro verde continuava a dire "nei tuoi 3 fogli".
                Mara ha 3 sedi = 3 fogli: se uno ha l'intestazione spostata,
                un mese intero di una sede entrava a zero senza un avviso. */}
            {(detectInfo.unpivotStats.warnings || []).length > 0 && (
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, color: T.amber }}>
                {detectInfo.unpivotStats.warnings.slice(0, 6).map((w, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>
        Controlla che sia tutto giusto
      </div>
      <div style={{ fontSize: 13, color: T.textSoft, marginBottom: 16, lineHeight: 1.5 }}>
        A sinistra i campi di Foodos, a destra le tue colonne. Se qualcosa non torna,
        scegli la colonna giusta dal menù a tendina.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {schema.fields.map(f => {
          const current = mapping[f.name] || ''
          return (
            <div key={f.name} style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '200px 1fr auto',
              gap: 10, alignItems: 'center',
              padding: 10, background: '#FAFBFC',
              border: `1px solid ${T.border}`, borderRadius: 10,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                  {f.label || f.name}
                  {f.required && <span style={{ color: T.red, marginLeft: 4 }}>*</span>}
                </div>
                <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2, lineHeight: 1.35 }}>
                  {f.hint}
                </div>
              </div>
              <select value={current} onChange={e => changeMap(f.name, e.target.value)}
                aria-label={`Colonna per ${f.label || f.name}`}
                style={{
                  padding: isMobile ? '12px 10px' : '10px 12px',
                  fontSize: isMobile ? 16 : 14,
                  border: `1px solid ${current ? T.border : '#FCA5A5'}`,
                  borderRadius: 8, background: '#FFF', color: T.text,
                  width: '100%', boxSizing: 'border-box',
                }}>
                <option value="">— non caricare —</option>
                {headers.map(h => {
                  const takenByOther = mappedCols.has(h) && current !== h
                  return (
                    <option key={h} value={h} disabled={takenByOther}>
                      {h}{takenByOther ? ' (già usata)' : ''}
                    </option>
                  )
                })}
              </select>
              {!isMobile && (
                <div style={{ fontSize: 11, color: T.textSoft, whiteSpace: 'nowrap' }}>
                  {current ? headerSampleValue(sampleRows, current) : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {Array.isArray(schema.unitConversions) && schema.unitConversions.length > 0 && (
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD',
          borderRadius: 10, padding: 12, marginBottom: 18,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#075985', marginBottom: 8 }}>
            Opzioni di conversione (opzionale)
          </div>
          {schema.unitConversions.map(conv => (
            <label key={conv.label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0', fontSize: 13, color: '#0C4A6E', cursor: 'pointer',
            }}>
              <input type="checkbox"
                checked={activeConversions.has(conv.label)}
                onChange={() => toggleConversion(conv.label)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span>{conv.label}</span>
            </label>
          ))}
        </div>
      )}

      {schema.wideFormatWarning && (
        <div style={{
          background: T.amberLight, color: T.amber,
          border: '1px solid #FCD34D', borderRadius: 10,
          padding: 12, marginBottom: 12, fontSize: 12, lineHeight: 1.5,
        }}>
          <b>Nota:</b> {schema.wideFormatWarning}
        </div>
      )}

      {aiNotes && (
        <div style={{
          background: T.amberLight, color: T.amber,
          border: `1px solid #FCD34D`, borderRadius: 10,
          padding: 12, marginBottom: 18, fontSize: 12, lineHeight: 1.5,
        }}>
          {aiNotes}
        </div>
      )}

      <BackNext onBack={onBack} onNext={onNext} isMobile={isMobile} T={T}
        nextLabel={loading ? 'Preparo…' : 'Avanti'} nextDisabled={loading}/>
    </div>
  )
}

function headerSampleValue(rows, col) {
  for (const r of rows) {
    const v = r?.[col]
    if (v != null && String(v).trim() !== '') return `es. "${String(v).slice(0, 22)}"`
  }
  return ''
}

// ── STEP 3: validation preview ────────────────────────────────────

function StepValidate({ schema, result, mapping = {}, onBack, onNext, isMobile, T }) {
  const { valid_rows, invalid_rows, stats } = result
  const [showErrors, setShowErrors] = useState(false)
  const problem = summarizeErrors(invalid_rows)
  const allBad = stats.valid === 0 && stats.invalid > 0

  // Audit 2026-09-09: i campi non mappati prendevano il loro `default` in
  // silenzio (importValidateCore riga 90). Nei dati reali `scarto_g` e' 0 su
  // TUTTE le 8.793 righe importate, e `note` e' vuota su tutte: le due colonne
  // non erano nel file e nessuno lo ha mai detto all'utente. Uno zero messo dal
  // software e' indistinguibile da uno zero misurato, e poi finisce nelle rese e
  // nel food cost. Qui lo dichiariamo prima di caricare, che e' l'unico momento
  // in cui si può ancora tornare indietro e aggiungere la colonna al file.
  const campiConDefault = (schema.fields || []).filter(f =>
    !mapping[f.name] && f.default !== undefined && !f.hidden
  )
  const descriviDefault = (f) => {
    if (f.default === 0) return 'resta 0'
    if (f.default === true) return 'resta sì'
    if (f.default === false) return 'resta no'
    if (f.default === null || f.default === '') return 'resta vuoto'
    return `resta ${f.default}`
  }

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>
        Ecco cosa ho capito dai tuoi dati
      </div>
      <div style={{ fontSize: 13, color: T.textSoft, marginBottom: 16, lineHeight: 1.5 }}>
        Ho letto tutte le righe e controllato che i valori siano nel formato giusto.
        Qui vedi il riepilogo, prima di caricare per davvero.
      </div>

      {allBad && problem && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #F59E0B',
          borderRadius: 10, padding: 14, marginBottom: 16,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <Icon name="info" size={18} color="#B45309"/>
          <div style={{ fontSize: 13.5, color: '#78350F', lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{problem.title}</div>
            <div>{problem.hint}</div>
          </div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr',
        gap: 10, marginBottom: 20,
      }}>
        <StatBox label="Righe lette" value={stats.total} T={T}/>
        <StatBox label="Pronte da caricare" value={stats.valid} color={T.green} T={T}/>
        <StatBox label="Da rivedere" value={stats.invalid} color={stats.invalid > 0 ? T.red : T.textSoft} T={T}/>
      </div>

      {campiConDefault.length > 0 && stats.valid > 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <div style={{ ...typo.bodyStrong, color: T.text, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="info" size={15} />
            {campiConDefault.length === 1 ? 'Un campo non è nel tuo file' : `${campiConDefault.length} campi non sono nel tuo file`}
          </div>
          <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, lineHeight: 1.6, marginBottom: 8 }}>
            Li carico con il valore predefinito. Se ti servono davvero, torna indietro e aggiungi la colonna al file:
            dopo il caricamento non si distinguono da un valore che hai scritto tu.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {campiConDefault.map(f => (
              <span key={f.name} style={{ fontSize: typo.small.fontSize, fontWeight: 600, color: T.text, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 9px' }}>
                {f.label || f.name}: {descriviDefault(f)}
              </span>
            ))}
          </div>
        </div>
      )}

      {valid_rows.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            Anteprima prime {Math.min(MAX_PREVIEW_ROWS, valid_rows.length)} righe
          </div>
          <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr>
                  {schema.fields.map(f => (
                    <th key={f.name} style={{
                      textAlign: 'left', padding: '10px 12px',
                      fontWeight: 700, color: T.text, borderBottom: `1px solid ${T.border}`,
                      whiteSpace: 'nowrap',
                    }}>{f.label || f.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valid_rows.slice(0, MAX_PREVIEW_ROWS).map((r, i) => (
                  <tr key={i}>
                    {schema.fields.map(f => (
                      <td key={f.name} style={{
                        padding: '10px 12px', borderBottom: `1px solid #F1F5F9`,
                        color: T.text,
                        fontVariantNumeric: f.type === 'number' ? 'tabular-nums' : 'normal',
                        textAlign: f.type === 'number' ? 'right' : 'left',
                        whiteSpace: 'nowrap', maxWidth: 220,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{formatCell(r[f.name], f.type)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invalid_rows.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <button type="button" onClick={() => setShowErrors(s => !s)}
            style={{
              background: '#FEE2E2', color: '#7F1D1D',
              border: `1px solid #FCA5A5`, borderRadius: 10,
              padding: '12px 14px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', width: '100%', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
            <span>Vedi i dettagli delle {invalid_rows.length.toLocaleString('it-IT', { useGrouping: 'always' })} righe da rivedere</span>
            <Icon name={showErrors ? 'chevU' : 'chevD'} size={12}/>
          </button>
          {showErrors && (
            <div style={{
              marginTop: 8, padding: 12, background: '#FFFBEB',
              border: `1px solid #FCD34D`, borderRadius: 10,
              maxHeight: 240, overflowY: 'auto',
            }}>
              {invalid_rows.slice(0, 20).map(inv => (
                <div key={inv.row_index} style={{
                  fontSize: 12, color: '#78350F',
                  padding: '6px 0', borderBottom: '1px solid #FCD34D',
                }}>
                  <b>Riga {inv.row_index + 2}:</b> {inv.errors.join(' · ')}
                </div>
              ))}
              {invalid_rows.length > 20 && (
                <div style={{ fontSize: 11, color: '#78350F', marginTop: 6, fontStyle: 'italic' }}>
                  …e altre {invalid_rows.length - 20} righe con problemi simili
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <BackNext
        onBack={onBack}
        onNext={onNext}
        nextDisabled={valid_rows.length === 0}
        nextLabel={valid_rows.length === 0 ? 'Non posso caricare, torna indietro' : `Carica ${valid_rows.length.toLocaleString('it-IT', { useGrouping: 'always' })} righe`}
        isMobile={isMobile} T={T}
      />
    </div>
  )
}

// Riconosce pattern ricorrenti negli errori di validazione e li spiega
// all'utente in linguaggio semplice, con un suggerimento pratico.
function StatBox({ label, value, color, T }) {
  return (
    <div style={{
      background: '#F8FAFC', border: `1px solid ${T.border}`,
      borderRadius: 10, padding: 14, minHeight: 78,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{
        fontSize: 24, fontWeight: 800, color: color || T.text,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{Number(value || 0).toLocaleString('it-IT', { useGrouping: 'always' })}</div>
      <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function formatCell(v, type) {
  if (v == null || v === '') return '—'
  if (type === 'number') return Number(v).toLocaleString('it-IT', { useGrouping: 'always' })
  if (type === 'boolean') return v ? 'sì' : 'no'
  return String(v)
}

// ── STEP 4: insert + progress ─────────────────────────────────────

function StepInsert({ loading, progress, result, schema, onFinish, onAnother, isMobile, T }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  if (loading || !result) {
    return (
      <div style={{ padding: '30px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>
          Sto caricando i tuoi dati, un attimo…
        </div>
        <div style={{
          height: 10, background: '#F1F5F9', borderRadius: 999,
          maxWidth: 480, margin: '0 auto', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: T.brand, transition: 'width 0.3s ease',
          }}/>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: T.textSoft, fontVariantNumeric: 'tabular-nums' }}>
          {progress.done.toLocaleString('it-IT', { useGrouping: 'always' })} di {progress.total.toLocaleString('it-IT', { useGrouping: 'always' })} righe
        </div>
      </div>
    )
  }
  const failedCount = result.failed?.length || 0
  const successAll = result.inserted === result.total
  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 10, marginBottom: 20,
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: successAll ? '#DCFCE7' : '#FEF3C7',
          color: successAll ? T.green : '#B45309',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={successAll ? 'check' : 'info'} size={26}/>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text, textAlign: 'center' }}>
          {successAll ? 'Tutto caricato!' : 'Caricamento fatto, con qualche intoppo.'}
        </div>
        <div style={{ fontSize: 14, color: T.textSoft, textAlign: 'center', maxWidth: 480, lineHeight: 1.5 }}>
          {`Ho salvato ${result.inserted.toLocaleString('it-IT', { useGrouping: 'always' })} righe in ${schema.label}.`}
          {failedCount > 0 && ` Alcuni gruppi (${failedCount}) non sono passati — controlla sotto.`}
        </div>
      </div>

      {failedCount > 0 && (
        <div style={{
          background: '#FEE2E2', border: `1px solid #FCA5A5`,
          borderRadius: 10, padding: 12, marginBottom: 18, fontSize: 12.5, color: '#7F1D1D', lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Dettaglio degli intoppi:</div>
          {result.failed.slice(0, 5).map((f, i) => (
            <div key={i}>
              {f.riga_file != null
                ? `Dalla riga ${f.riga_file.toLocaleString('it-IT', { useGrouping: 'always' })} del tuo foglio`
                : `Dal blocco che comincia alla riga ${(f.batch_start + 1).toLocaleString('it-IT', { useGrouping: 'always' })} di quelle valide`}: {f.error}
            </div>
          ))}
        </div>
      )}

      <div style={{
        display: 'flex', gap: 10,
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'center', marginTop: 10,
      }}>
        <button type="button" onClick={onAnother}
          style={{
            background: '#FFF', color: T.brand, border: `1.5px solid ${T.brand}`,
            borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', minHeight: 44,
          }}>
          Carica un altro file
        </button>
        <button type="button" onClick={onFinish}
          style={{
            background: T.brand, color: '#FFF', border: 'none',
            borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', minHeight: 44,
          }}>
          Chiudi
        </button>
      </div>
    </div>
  )
}

// ── Back/Next helper ─────────────────────────────────────────────

function BackNext({ onBack, onNext, nextDisabled, nextLabel = 'Avanti', isMobile, T }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 10,
      marginTop: 20, flexDirection: isMobile ? 'column-reverse' : 'row',
    }}>
      <button type="button" onClick={onBack}
        style={{
          background: '#FFF', color: T.text, border: `1px solid ${T.border}`,
          borderRadius: 10, padding: isMobile ? '14px 22px' : '12px 22px',
          fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 44,
        }}>
        Indietro
      </button>
      <button type="button" onClick={onNext} disabled={nextDisabled}
        style={{
          background: nextDisabled ? '#CBD5E1' : T.brand,
          color: '#FFF', border: 'none', borderRadius: 10,
          padding: isMobile ? '14px 22px' : '12px 26px', fontSize: 14, fontWeight: 700,
          cursor: nextDisabled ? 'not-allowed' : 'pointer', minHeight: 44,
        }}>
        {nextLabel}
      </button>
    </div>
  )
}

// ── Reassurance footer ───────────────────────────────────────────

function Reassurance({ isMobile, SOFT }) {
  return (
    <div style={{
      marginTop: 18, padding: 14,
      background: 'rgba(15,23,42,0.02)', border: '1px dashed #E5E9EF',
      borderRadius: 10, fontSize: 12, color: SOFT, lineHeight: 1.55,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <Icon name="shield" size={14}/>
      <div>
        <b style={{ color: '#334155' }}>Il file non viene salvato da noi.</b>{' '}
        Per capire com'è fatto il tuo foglio, le <b>prime righe</b> (intestazioni e
        alcuni valori di esempio) vengono lette dal nostro servizio di
        riconoscimento automatico: serve a proporti l'abbinamento delle colonne.
        Non restano memorizzate. Tutto il resto del file va dal tuo browser
        direttamente al database della tua attività.
        {' '}Se il foglio contiene dati delle persone — nomi, stipendi — e preferisci
        non farli passare da lì, abbina le colonne a mano: il riconoscimento
        automatico non è obbligatorio.
      </div>
    </div>
  )
}
