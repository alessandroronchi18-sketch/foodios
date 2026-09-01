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
import { color as T } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from './Icon'
import { loadXLSX } from '../lib/xlsx'
import { parseWorkbook, getSamples, fileToArrayBuffer } from '../lib/importParse'
import { IMPORT_SCHEMAS, getEntitySchema, listEntities } from '../lib/importSchemas'
import { validateRows, findMissingRequired } from '../lib/importValidateCore'
import { callImportMap } from '../lib/importAiMap'

const BATCH_SIZE = 200
const MAX_PREVIEW_ROWS = 10

export default function ImportWizard({ orgId, onClose, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()

  const [step, setStep] = useState(1)
  const [entity, setEntity] = useState('')
  const [file, setFile] = useState(null)
  const [parsedSheet, setParsedSheet] = useState(null) // { headers, rows }
  const [mapping, setMapping] = useState({})
  const [aiNotes, setAiNotes] = useState('')
  const [validationResult, setValidationResult] = useState(null) // { valid_rows, invalid_rows, stats }
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [insertResult, setInsertResult] = useState(null) // { inserted, failed }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const schema = useMemo(() => (entity ? getEntitySchema(entity) : null), [entity])

  // ── STEP 1 → STEP 2: parsea file e chiama AI mapping ─────────────
  async function goToStep2() {
    if (!file || !entity) { setError('Scegli tipo dato e carica il file.'); return }
    setError(''); setLoading(true)
    try {
      const XLSX = await loadXLSX()
      const buf = await fileToArrayBuffer(file)
      const wb = parseWorkbook(buf, XLSX)
      const sheet = wb.firstSheet
      if (sheet.rows.length === 0) throw new Error('Il file non contiene righe di dati.')
      setParsedSheet(sheet)

      const samples = getSamples(sheet, 5)
      const aiRes = await callImportMap({ entity, headers: sheet.headers, sampleRows: samples })
      setMapping(aiRes.mapping || {})
      setAiNotes(aiRes.notes || '')
      setStep(2)
    } catch (e) {
      setError(e?.message || 'Errore durante la lettura del file.')
    } finally { setLoading(false) }
  }

  // ── STEP 2 → STEP 3: valida tutte le righe con il mapping ────────
  function goToStep3() {
    if (!parsedSheet || !schema) return
    const missing = findMissingRequired(mapping, schema)
    if (missing.length > 0) {
      setError(`Devi mappare i campi obbligatori: ${missing.join(', ')}`)
      return
    }
    setError('')
    const res = validateRows(parsedSheet.rows, mapping, schema)
    setValidationResult(res)
    setStep(3)
  }

  // ── STEP 3 → STEP 4: insert diretto su Supabase ─────────────────
  async function goToStep4() {
    if (!validationResult || validationResult.valid_rows.length === 0) return
    setError(''); setLoading(true)
    setStep(4)
    const prepared = validationResult.valid_rows.map(r => ({ organization_id: orgId, ...r }))
    setProgress({ done: 0, total: prepared.length })
    let insertedCount = 0
    const failedBatches = []
    for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
      const chunk = prepared.slice(i, i + BATCH_SIZE)
      const { data, error: insErr } = await supabase.from(schema.table).insert(chunk).select('id')
      if (insErr) {
        failedBatches.push({ batch_start: i, error: insErr.message })
      } else {
        insertedCount += (data?.length || 0)
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, prepared.length), total: prepared.length })
    }
    setInsertResult({ inserted: insertedCount, failed: failedBatches, total: prepared.length })
    setLoading(false)
    if (insertedCount > 0 && notify) notify(`Caricate ${insertedCount} righe in ${schema.label}.`, 'success')
  }

  function reset() {
    setStep(1); setEntity(''); setFile(null); setParsedSheet(null); setMapping({})
    setAiNotes(''); setValidationResult(null); setProgress({ done: 0, total: 0 })
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
              mapping={mapping} setMapping={setMapping}
              aiNotes={aiNotes}
              onBack={() => setStep(1)}
              onNext={goToStep3}
              isMobile={isMobile}
              T={{ TXT, SOFT, BRAND, BORDER, RED, AMBER, AMBER_BG }}
            />
          )}
          {step === 3 && schema && validationResult && (
            <StepValidate
              schema={schema}
              result={validationResult}
              onBack={() => setStep(2)}
              onNext={goToStep4}
              isMobile={isMobile}
              T={{ TXT, SOFT, BRAND, BORDER, RED, GREEN }}
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
      <div style={{ fontSize: 16, fontWeight: 700, color: T.TXT, marginBottom: 12 }}>
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
              border: `2px solid ${entity === id ? T.BRAND : T.BORDER}`,
              borderRadius: 12, padding: 14, transition: 'all 0.15s',
              minHeight: 88,
            }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.TXT, marginBottom: 4 }}>
              {schema.label}
            </div>
            <div style={{ fontSize: 12, color: T.SOFT, lineHeight: 1.4 }}>
              {schema.description}
            </div>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: T.TXT, marginBottom: 12 }}>
        2. Carica il tuo file
      </div>
      <label htmlFor="import-file-input"
        style={{
          display: 'block', cursor: 'pointer',
          background: file ? '#F0FDF4' : '#F8FAFC',
          border: `2px dashed ${file ? '#16A34A' : T.BORDER}`,
          borderRadius: 12, padding: isMobile ? 22 : 32,
          textAlign: 'center', marginBottom: 8,
        }}>
        <Icon name={file ? 'check' : 'download'} size={20} color={file ? '#16A34A' : T.SOFT}/>
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: T.TXT }}>
          {file ? file.name : 'Trascina qui il file oppure clicca per sceglierlo'}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: T.SOFT }}>
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
            background: (!file || !entity || loading) ? '#CBD5E1' : T.BRAND,
            color: '#FFF', border: 'none', borderRadius: 10,
            padding: isMobile ? '14px 22px' : '12px 26px', fontSize: 14, fontWeight: 700,
            cursor: (!file || !entity || loading) ? 'not-allowed' : 'pointer',
            minHeight: 44,
          }}>
          {loading ? 'Analizzo il file…' : 'Avanti'}
        </button>
      </div>
    </div>
  )
}

// ── STEP 2: mapping editabile ─────────────────────────────────────

function StepMapping({ schema, headers, sampleRows, mapping, setMapping, aiNotes, onBack, onNext, isMobile, T }) {
  function changeMap(fieldName, headerOrEmpty) {
    setMapping(prev => {
      const next = { ...prev }
      if (!headerOrEmpty) delete next[fieldName]
      else next[fieldName] = headerOrEmpty
      return next
    })
  }

  const mappedCols = new Set(Object.values(mapping))

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.TXT, marginBottom: 6 }}>
        Rivedi la mappatura
      </div>
      <div style={{ fontSize: 13, color: T.SOFT, marginBottom: 16, lineHeight: 1.5 }}>
        Per ogni campo di Foodos, scegli da quale colonna del tuo file prendere il valore.
        L abbiamo pre-compilato per te, ma puoi cambiarlo.
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
              border: `1px solid ${T.BORDER}`, borderRadius: 10,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.TXT }}>
                  {f.name}
                  {f.required && <span style={{ color: T.RED, marginLeft: 4 }}>*</span>}
                </div>
                <div style={{ fontSize: 11, color: T.SOFT, marginTop: 2, lineHeight: 1.35 }}>
                  {f.hint}
                </div>
              </div>
              <select value={current} onChange={e => changeMap(f.name, e.target.value)}
                aria-label={`Colonna per ${f.name}`}
                style={{
                  padding: isMobile ? '12px 10px' : '10px 12px',
                  fontSize: isMobile ? 16 : 14,
                  border: `1px solid ${current ? T.BORDER : '#FCA5A5'}`,
                  borderRadius: 8, background: '#FFF', color: T.TXT,
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
                <div style={{ fontSize: 11, color: T.SOFT, whiteSpace: 'nowrap' }}>
                  {current ? headerSampleValue(sampleRows, current) : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {aiNotes && (
        <div style={{
          background: T.AMBER_BG, color: T.AMBER,
          border: `1px solid #FCD34D`, borderRadius: 10,
          padding: 12, marginBottom: 18, fontSize: 12, lineHeight: 1.5,
        }}>
          {aiNotes}
        </div>
      )}

      <BackNext onBack={onBack} onNext={onNext} isMobile={isMobile} T={T} nextLabel="Avanti"/>
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

function StepValidate({ schema, result, onBack, onNext, isMobile, T }) {
  const { valid_rows, invalid_rows, stats } = result
  const [showErrors, setShowErrors] = useState(false)
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.TXT, marginBottom: 6 }}>
        Ecco cosa carichiamo
      </div>
      <div style={{ fontSize: 13, color: T.SOFT, marginBottom: 16, lineHeight: 1.5 }}>
        Abbiamo controllato i tuoi dati riga per riga. Ecco il riepilogo.
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr',
        gap: 10, marginBottom: 20,
      }}>
        <StatBox label="Totali" value={stats.total} T={T}/>
        <StatBox label="Da caricare" value={stats.valid} color={T.GREEN} T={T}/>
        <StatBox label="Con errori" value={stats.invalid} color={stats.invalid > 0 ? T.RED : T.SOFT} T={T}/>
      </div>

      {valid_rows.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.TXT, marginBottom: 8 }}>
            Anteprima prime {Math.min(MAX_PREVIEW_ROWS, valid_rows.length)} righe
          </div>
          <div style={{ overflowX: 'auto', border: `1px solid ${T.BORDER}`, borderRadius: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr>
                  {schema.fields.map(f => (
                    <th key={f.name} style={{
                      textAlign: 'left', padding: '10px 12px',
                      fontWeight: 700, color: T.TXT, borderBottom: `1px solid ${T.BORDER}`,
                      whiteSpace: 'nowrap',
                    }}>{f.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valid_rows.slice(0, MAX_PREVIEW_ROWS).map((r, i) => (
                  <tr key={i}>
                    {schema.fields.map(f => (
                      <td key={f.name} style={{
                        padding: '10px 12px', borderBottom: `1px solid #F1F5F9`,
                        color: T.TXT,
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
              padding: '10px 14px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', width: '100%', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
            <span>Righe con errori: {invalid_rows.length} (non verranno caricate)</span>
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
        nextLabel={valid_rows.length === 0 ? 'Nessuna riga da caricare' : `Carica ${valid_rows.length} righe`}
        isMobile={isMobile} T={T}
      />
    </div>
  )
}

function StatBox({ label, value, color, T }) {
  return (
    <div style={{
      background: '#F8FAFC', border: `1px solid ${T.BORDER}`,
      borderRadius: 10, padding: 14, minHeight: 78,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{
        fontSize: 24, fontWeight: 800, color: color || T.TXT,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{Number(value || 0).toLocaleString('it-IT')}</div>
      <div style={{ fontSize: 12, color: T.SOFT, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function formatCell(v, type) {
  if (v == null || v === '') return '—'
  if (type === 'number') return Number(v).toLocaleString('it-IT')
  if (type === 'boolean') return v ? 'sì' : 'no'
  return String(v)
}

// ── STEP 4: insert + progress ─────────────────────────────────────

function StepInsert({ loading, progress, result, schema, onFinish, onAnother, isMobile, T }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  if (loading || !result) {
    return (
      <div style={{ padding: '30px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.TXT, marginBottom: 12 }}>
          Caricamento in corso…
        </div>
        <div style={{
          height: 10, background: '#F1F5F9', borderRadius: 999,
          maxWidth: 480, margin: '0 auto', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: T.BRAND, transition: 'width 0.3s ease',
          }}/>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: T.SOFT, fontVariantNumeric: 'tabular-nums' }}>
          {progress.done.toLocaleString('it-IT')} di {progress.total.toLocaleString('it-IT')} righe
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
          color: successAll ? T.GREEN : '#B45309',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={successAll ? 'check' : 'info'} size={26}/>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.TXT, textAlign: 'center' }}>
          {successAll ? 'Fatto.' : 'Caricamento completato con alcuni errori.'}
        </div>
        <div style={{ fontSize: 14, color: T.SOFT, textAlign: 'center' }}>
          {`Ho caricato ${result.inserted.toLocaleString('it-IT')} righe in ${schema.label}.`}
          {failedCount > 0 && ` ${failedCount} lotto/i non è passato.`}
        </div>
      </div>

      {failedCount > 0 && (
        <div style={{
          background: '#FEE2E2', border: `1px solid #FCA5A5`,
          borderRadius: 10, padding: 12, marginBottom: 18, fontSize: 12, color: '#7F1D1D',
        }}>
          {result.failed.slice(0, 5).map((f, i) => (
            <div key={i}>Lotto a partire da riga {f.batch_start + 1}: {f.error}</div>
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
            background: '#FFF', color: T.BRAND, border: `1.5px solid ${T.BRAND}`,
            borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', minHeight: 44,
          }}>
          Carica un altro file
        </button>
        <button type="button" onClick={onFinish}
          style={{
            background: T.BRAND, color: '#FFF', border: 'none',
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
          background: '#FFF', color: T.TXT, border: `1px solid ${T.BORDER}`,
          borderRadius: 10, padding: isMobile ? '14px 22px' : '12px 22px',
          fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 44,
        }}>
        Indietro
      </button>
      <button type="button" onClick={onNext} disabled={nextDisabled}
        style={{
          background: nextDisabled ? '#CBD5E1' : T.BRAND,
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
        <b style={{ color: '#334155' }}>Il tuo file resta sul tuo computer.</b>{' '}
        Foodos non lo memorizza. Al server arrivano solo i nomi delle colonne
        (per aiutarci a suggerirti come mapparle). I valori — importi, stipendi,
        ricette — vanno dal tuo browser direttamente al database della tua attività,
        senza passare da noi.
      </div>
    </div>
  )
}
