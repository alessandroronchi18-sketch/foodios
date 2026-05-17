import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { parseFatturaXML, parseFatturaSMART } from '../lib/parseFatturaXML'
import { parseZucchettiInfinity, parseZucchettiKassa } from '../lib/importZucchetti'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'

const C = {
  red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight,
  amber: T.amber, amberLight: T.amberLight,
  blue: T.blue, blueLight: T.blueLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft,
  border: T.border, bg: T.bg, white: T.white,
}
const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" };

const fmtTs = ts => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

const INTEGRAZIONI_CFG = [
  {
    id: 'fattura_elettronica_xml',
    nome: 'Fattura Elettronica SDI',
    icona: '📄',
    categoria: 'Fatturazione',
    descrizione: 'Importa file XML dalle fatture elettroniche italiane (formato FatturaPA) ricevute dallo SDI.',
    istruzioni: [
      'Accedi al portale SDI o al tuo provider di fatturazione (es. Aruba, Fatture in Cloud)',
      'Scarica le fatture passive in formato XML o P7M',
      'Carica il file qui sotto — supporta sia fatture singole che lotti',
    ],
    tipoFile: '.xml,.p7m',
    tipoLabel: 'XML / P7M',
    multiplo: true,
  },
  {
    id: 'fattura_smart',
    nome: 'TeamSystem FatturaSMART',
    icona: '📊',
    categoria: 'Fatturazione',
    descrizione: 'Importa l\'export Excel dal gestionale TeamSystem FatturaSMART (fatture passive).',
    istruzioni: [
      'In TeamSystem: Contabilità › Fatture passive',
      'Filtra per periodo desiderato',
      'Clicca "Esporta Excel" — il file avrà colonne Numero, Fornitore, Totale, ecc.',
    ],
    tipoFile: '.xlsx,.xls',
    tipoLabel: 'Excel (.xlsx)',
    multiplo: false,
  },
  {
    id: 'zucchetti_infinity',
    nome: 'Zucchetti Infinity',
    icona: '🔵',
    categoria: 'Contabilità',
    descrizione: 'Importa i movimenti contabili da Zucchetti Infinity (estratto conto CSV).',
    istruzioni: [
      'In Zucchetti Infinity: Contabilità › Estratti conto › Export',
      'Seleziona periodo e formato CSV',
      'Colonne richieste: Data, Causale, Dare, Avere, Saldo, Descrizione',
    ],
    tipoFile: '.csv',
    tipoLabel: 'CSV',
    multiplo: false,
    tipo: 'movimenti',
  },
  {
    id: 'zucchetti_kassa',
    nome: 'Zucchetti Kassa',
    icona: '🏪',
    categoria: 'Cassa',
    descrizione: 'Importa le vendite giornaliere da Zucchetti Kassa (cassa negozio).',
    istruzioni: [
      'In Zucchetti Kassa: Report › Export giornaliero',
      'Esporta in formato CSV o seleziona "Export standard"',
      'Colonne richieste: Data, Ora, Reparto, Importo, IVA, Metodo pagamento',
    ],
    tipoFile: '.csv',
    tipoLabel: 'CSV',
    multiplo: false,
    tipo: 'kassa',
  },
  {
    id: 'zucchetti_webhook',
    nome: 'Zucchetti Webhook (Enterprise)',
    icona: '⚡',
    categoria: 'Cassa',
    descrizione: 'Ricezione dati in real-time da Zucchetti Infinity/Kassa Enterprise tramite webhook POST.',
    istruzioni: [
      'Disponibile solo con licenza Zucchetti Enterprise',
      'Configura l\'URL webhook nel pannello Zucchetti: Impostazioni › Integrazioni › Webhook',
      'Inserisci l\'URL e il secret qui sotto — i dati arriveranno automaticamente',
    ],
    tipo: 'webhook',
  },
]

function StatoBadge({ stato, errore, lastSync }) {
  if (!lastSync) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.textSoft }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#CBD5E1', display: 'inline-block' }} />
        Non configurata
      </span>
    )
  }
  if (stato === 'errore') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.amber }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.amber, display: 'inline-block' }} />
        Errore — {errore ? errore.slice(0, 60) : 'vedi log'}
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.green }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
      Connessa — ultimo sync: {fmtTs(lastSync)}
    </span>
  )
}

function LogTable({ logs }) {
  if (!logs?.length) return (
    <div style={{ fontSize: 11, color: C.textSoft, padding: '10px 0' }}>Nessun log disponibile.</div>
  )
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr style={{ background: '#FAF8F7' }}>
          {['Data/Ora', 'Stato', 'Records', 'Errore'].map(h => (
            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: C.textSoft,
              textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 9,
              borderBottom: `1px solid ${C.border}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {logs.map((l, i) => (
          <tr key={l.id || i} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: '6px 10px', color: C.textMid, whiteSpace: 'nowrap' }}>{fmtTs(l.created_at)}</td>
            <td style={{ padding: '6px 10px' }}>
              <span style={{
                background: l.stato === 'ok' ? C.greenLight : l.stato === 'errore' ? C.redLight : C.amberLight,
                color: l.stato === 'ok' ? C.green : l.stato === 'errore' ? C.red : C.amber,
                padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700,
              }}>
                {l.stato === 'ok' ? '✓ OK' : l.stato === 'errore' ? '✕ Errore' : l.stato}
              </span>
            </td>
            <td style={{ padding: '6px 10px', color: C.text, fontWeight: 600 }}>
              {l.records_importati ?? '—'}
            </td>
            <td style={{ padding: '6px 10px', color: C.red, fontSize: 10, maxWidth: 200,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l.errore || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Integrazioni({ orgId }) {
  const [logs, setLogs] = useState({})
  const [loading, setLoading] = useState(true)
  const [importLoading, setImportLoading] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [toast, setToast] = useState(null)
  const [risultato, setRisultato] = useState(null)

  const notify = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const logSync = useCallback(async (integrazione, stato, records, errore) => {
    if (!orgId) return
    try {
      await supabase.from('sync_log').insert({
        organization_id: orgId,
        integrazione,
        stato,
        records_importati: records || 0,
        errore: errore || null,
      })
    } catch { /* non-critical */ }
  }, [orgId])

  const loadLogs = useCallback(async () => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sync_log')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error

      // Group by integrazione, last 10 each
      const grouped = {}
      for (const row of (data || [])) {
        if (!grouped[row.integrazione]) grouped[row.integrazione] = []
        if (grouped[row.integrazione].length < 10) grouped[row.integrazione].push(row)
      }
      setLogs(grouped)
    } catch (e) {
      // sync_log table might not exist yet — show banner only
      setLogs({})
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { loadLogs() }, [loadLogs])

  const getLastLog = (id) => logs[id]?.[0] || null

  async function handleImport(cfg, files) {
    if (!files?.length || !orgId) return
    setImportLoading(cfg.id)
    setRisultato(null)
    let imported = 0
    let lastErr = null

    for (const file of Array.from(files)) {
      try {
        if (cfg.id === 'fattura_elettronica_xml') {
          const text = await file.text()
          const records = parseFatturaXML(text)
          const toInsert = records.map(r => ({ ...r, organization_id: orgId }))
          for (let i = 0; i < toInsert.length; i += 100) {
            const { error } = await supabase.from('fatture').insert(toInsert.slice(i, i + 100))
            if (error) throw error
          }
          imported += records.length

        } else if (cfg.id === 'fattura_smart') {
          const records = await parseFatturaSMART(file)
          const toInsert = records.map(r => ({ ...r, organization_id: orgId }))
          for (let i = 0; i < toInsert.length; i += 100) {
            const { error } = await supabase.from('fatture').insert(toInsert.slice(i, i + 100))
            if (error) throw error
          }
          imported += records.length

        } else if (cfg.id === 'zucchetti_infinity') {
          const text = await file.text()
          const movimenti = parseZucchettiInfinity(text)
          const dataKey = `zucchetti_infinity_${new Date().toISOString().slice(0, 10)}`
          const { error: zInfErr } = await supabase.from('user_data').upsert({
            organization_id: orgId,
            sede_id: null,
            data_key: dataKey,
            data_value: { movimenti, importato_il: new Date().toISOString() },
          }, { onConflict: 'organization_id,sede_id,data_key' })
          if (zInfErr) throw zInfErr
          imported += movimenti.length
          setRisultato({ tipo: 'movimenti', movimenti, cfgId: cfg.id })

        } else if (cfg.id === 'zucchetti_kassa') {
          const text = await file.text()
          const { vendite, chiusure_giornaliere } = parseZucchettiKassa(text)
          for (const ch of chiusure_giornaliere) {
            const { error: zKassaErr } = await supabase.from('user_data').upsert({
              organization_id: orgId,
              sede_id: null,
              data_key: `chiusura_${ch.data}`,
              data_value: { ...ch, source: 'zucchetti_kassa' },
            }, { onConflict: 'organization_id,sede_id,data_key' })
            if (zKassaErr) throw zKassaErr
          }
          imported += vendite.length
          setRisultato({ tipo: 'kassa', chiusure: chiusure_giornaliere, cfgId: cfg.id })
        }

        await logSync(cfg.id, 'ok', imported, null)
      } catch (e) {
        lastErr = e.message
        await logSync(cfg.id, 'errore', 0, e.message)
        notify('Errore: ' + e.message, false)
      }
    }

    await loadLogs()
    setImportLoading(null)
    if (!lastErr && imported > 0) {
      notify(`✓ ${imported} record importati correttamente`)
    }
  }

  const btnStyle = (primary) => ({
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: primary ? 'none' : `1px solid ${C.border}`,
    background: primary ? C.red : C.white, color: primary ? C.white : C.textMid,
    display: 'inline-flex', alignItems: 'center', gap: 5,
  })

  const card = {
    background: C.white, borderRadius: 12,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 12,
    overflow: 'hidden',
  }

  if (!orgId) return (
    <div style={{ padding: 48, textAlign: 'center', color: C.textSoft }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.textMid }}>Login richiesto</div>
    </div>
  )

  const categorie = [...new Set(INTEGRAZIONI_CFG.map(c => c.categoria))]

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 999,
          background: toast.ok ? C.green : C.red, color: C.white,
          padding: '10px 20px', borderRadius: 9, fontSize: 12, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: "-0.025em", lineHeight: 1.15 }}>Integrazioni</h1>
        <div style={{ fontSize: 13, color: T.textSoft, marginTop: 4, letterSpacing: "-0.005em" }}>
          Connetti FoodOS ai tuoi software di contabilità e fatturazione.
        </div>
      </div>

      {/* SQL migration reminder */}
      <div style={{ background: C.blueLight, border: `1px solid #BFDBFE`, borderRadius: 10,
        padding: '12px 16px', marginBottom: 20, fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: C.blue, marginBottom: 3 }}>
          ℹ️ Setup richiesto (una volta sola)
        </div>
        <div style={{ color: '#1D4ED8', lineHeight: 1.5 }}>
          Esegui lo script <code style={{ background: 'rgba(37,99,235,0.1)', padding: '1px 4px', borderRadius: 3 }}>supabase_sync_log.sql</code> in
          {' '}<a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: C.blue }}>Supabase SQL Editor</a>{' '}
          per abilitare il log dei sync.
        </div>
      </div>

      {categorie.map(cat => (
        <div key={cat} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: 10 }}>{cat}</div>

          {INTEGRAZIONI_CFG.filter(c => c.categoria === cat).map(cfg => {
            const lastLog = getLastLog(cfg.id)
            const intLogs = logs[cfg.id] || []
            const isExp = expanded === cfg.id
            const isLoading = importLoading === cfg.id

            return (
              <div key={cfg.id} style={card}>
                {/* Card header — clickable */}
                <div
                  onClick={() => setExpanded(isExp ? null : cfg.id)}
                  style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
                    cursor: 'pointer', userSelect: 'none' }}>
                  <div style={{ fontSize: 22, flexShrink: 0 }}>{cfg.icona}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{cfg.nome}</div>
                    <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>{cfg.descrizione}</div>
                    <div style={{ marginTop: 6 }}>
                      <StatoBadge
                        stato={lastLog?.stato}
                        errore={lastLog?.errore}
                        lastSync={lastLog?.created_at}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 18, color: C.textSoft, flexShrink: 0,
                    transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</div>
                </div>

                {/* Expanded panel */}
                {isExp && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 20px' }}>
                    {/* How-to */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMid, marginBottom: 6,
                        textTransform: 'uppercase', letterSpacing: '0.05em' }}>Come si usa</div>
                      <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {cfg.istruzioni.map((step, i) => (
                          <li key={i} style={{ fontSize: 12, color: C.textMid, lineHeight: 1.55 }}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    {/* Webhook info */}
                    {cfg.tipo === 'webhook' ? (
                      <div style={{ background: C.bg, borderRadius: 8, padding: 14, marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.textMid, marginBottom: 10 }}>
                          Configurazione Zucchetti Enterprise
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 10, color: C.textSoft, marginBottom: 4, fontWeight: 600 }}>URL WEBHOOK</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <code style={{ flex: 1, fontSize: 11, background: C.white, border: `1px solid ${C.border}`,
                                borderRadius: 6, padding: '7px 10px', color: C.text, display: 'block', wordBreak: 'break-all',
                                minWidth: 0 }}>
                                {window.location.origin}/api/webhook-zucchetti
                              </code>
                              <button
                                onClick={() => navigator.clipboard?.writeText(window.location.origin + '/api/webhook-zucchetti')
                                  .then(() => notify('URL copiato negli appunti'))}
                                style={{ ...btnStyle(false), flexShrink: 0 }}>
                                📋 Copia
                              </button>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: C.textSoft, marginBottom: 4, fontWeight: 600 }}>HEADERS RICHIESTI</div>
                            <code style={{ fontSize: 10, background: C.white, border: `1px solid ${C.border}`,
                              borderRadius: 6, padding: '9px 12px', color: C.textMid, display: 'block', lineHeight: 2 }}>
                              x-organization-id: {orgId}<br />
                              x-zucchetti-secret: {'<ZUCCHETTI_WEBHOOK_SECRET da Vercel env>'}<br />
                              Content-Type: application/json
                            </code>
                          </div>
                          <div style={{ fontSize: 11, color: C.amber, padding: '8px 10px', background: C.amberLight,
                            borderRadius: 6 }}>
                            ⚠️ Imposta <code>ZUCCHETTI_WEBHOOK_SECRET</code> nelle variabili d'ambiente Vercel per proteggere l'endpoint.
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* File upload area */
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                        <label style={{ ...btnStyle(true), cursor: 'pointer' }}>
                          {isLoading ? '⏳ Importazione…' : `📂 Importa ${cfg.tipoLabel}`}
                          <input
                            type="file"
                            accept={cfg.tipoFile}
                            multiple={!!cfg.multiplo}
                            style={{ display: 'none' }}
                            disabled={!!isLoading}
                            onChange={e => e.target.files?.length && handleImport(cfg, e.target.files)}
                          />
                        </label>
                        {lastLog?.stato === 'ok' && (
                          <span style={{ fontSize: 11, color: C.green }}>
                            ✓ Ultimo: {lastLog.records_importati} record — {fmtTs(lastLog.created_at)}
                          </span>
                        )}
                        {lastLog?.stato === 'errore' && (
                          <span style={{ fontSize: 11, color: C.red }}>
                            ✕ {lastLog.errore?.slice(0, 80)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Import result preview */}
                    {risultato?.cfgId === cfg.id && (
                      <div style={{ background: C.greenLight, border: `1px solid #BBF7D0`,
                        borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                        {risultato.tipo === 'movimenti' && (
                          <>
                            <div style={{ fontWeight: 700, fontSize: 12, color: C.green, marginBottom: 6 }}>
                              ✓ {risultato.movimenti.length} movimenti importati da Zucchetti Infinity
                            </div>
                            <div style={{ display: 'flex', gap: 20, fontSize: 11, color: C.green }}>
                              <span>Uscite: €{risultato.movimenti.filter(m => m.tipo === 'uscita')
                                .reduce((s, m) => s + m.importo, 0)
                                .toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                              <span>Entrate: €{risultato.movimenti.filter(m => m.tipo === 'entrata')
                                .reduce((s, m) => s + m.importo, 0)
                                .toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </>
                        )}
                        {risultato.tipo === 'kassa' && (
                          <>
                            <div style={{ fontWeight: 700, fontSize: 12, color: C.green, marginBottom: 6 }}>
                              ✓ {risultato.chiusure.length} giorni importati da Zucchetti Kassa
                            </div>
                            <div style={{ fontSize: 11, color: C.green }}>
                              Totale: €{risultato.chiusure.reduce((s, c) => s + c.totale, 0)
                                .toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Sync log */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMid, marginBottom: 8,
                        textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Ultimi sync{intLogs.length > 0 ? ` (${intLogs.length})` : ''}
                      </div>
                      {loading
                        ? <div style={{ fontSize: 11, color: C.textSoft }}>Caricamento…</div>
                        : <LogTable logs={intLogs} />
                      }
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
