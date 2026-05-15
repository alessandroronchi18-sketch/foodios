import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { sload } from '../lib/storage'

const R = '#C0392B'
const TXT = '#1C0A0A'
const SOFT = '#9C7B76'
const MID = '#4A3728'
const BOR = '#E2E8F0'

const VERSION = '1.0'

const SHARED_KEYS = [
  'pasticceria-ricettario-v1',
  'pasticceria-ai-v1',
  'pasticceria-actions-v1',
  'pasticceria-esclusi-v1',
  'pasticceria-prezzi-importati-v1',
  'pasticceria-regole-v1',
  'pasticceria-semilavorati-v1',
]
const SEDE_KEYS = [
  'pasticceria-magazzino-v1',
  'pasticceria-produzione-v1',
  'pasticceria-giornaliero-v1',
  'pasticceria-chiusure-v1',
  'pasticceria-logrif-v1',
]

function fmtDate(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

async function loadXLSX() {
  if (window.XLSX) return window.XLSX
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => resolve(window.XLSX)
    s.onerror = () => reject(new Error('Impossibile caricare XLSX'))
    document.head.appendChild(s)
  })
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function supabaseErrMsg(error) {
  if (!error) return ''
  const code = error?.code || error?.status
  if (code === 403 || code === '42501') return 'Non hai i permessi per questa operazione.'
  if (code >= 500 || code === '500') return 'Errore del server. Riprova tra qualche minuto.'
  if (error.message?.includes('fetch') || error.message?.includes('network')) return 'Impossibile connettersi al server. Controlla la connessione internet.'
  return error.message || 'Errore sconosciuto.'
}

export default function EsportaDati({ orgId, sedi, nomeAttivita }) {
  const [loading, setLoading] = useState(null)
  const [toast, setToast] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importFile, setImportFile] = useState(null)
  const [importConfirm, setImportConfirm] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  if (!orgId) return null

  function notify(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  async function esportaTutto() {
    setLoading('json')
    try {
      const sharedData = {}
      for (const key of SHARED_KEYS) {
        sharedData[key] = await sload(key, orgId, null)
      }

      const sediData = {}
      for (const sede of (sedi || [])) {
        sediData[sede.id] = { nome: sede.nome, citta: sede.citta }
        for (const key of SEDE_KEYS) {
          sediData[sede.id][key] = await sload(key, orgId, sede.id)
        }
      }

      const { data: fatture } = await supabase
        .from('fatture')
        .select('*')
        .eq('organization_id', orgId)

      const backup = {
        metadata: {
          versione: VERSION,
          dataExport: new Date().toISOString(),
          nomeAttivita: nomeAttivita || 'Attività',
          orgId,
        },
        sharedData,
        sediData,
        fatture: fatture || [],
      }

      const nome = (nomeAttivita || 'attivita').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      downloadJSON(backup, `foodios-backup-${nome}-${fmtDate()}.json`)
      notify('Backup scaricato')
    } catch (e) {
      notify('Errore export: ' + supabaseErrMsg(e), false)
    } finally {
      setLoading(null)
    }
  }

  async function esportaExcel(tipo) {
    setLoading('excel-' + tipo)
    try {
      const XLSX = await loadXLSX()
      const wb = XLSX.utils.book_new()

      if (tipo === 'ricettario') {
        const ric = await sload('pasticceria-ricettario-v1', orgId, null)
        const ricette = Object.values(ric?.ricette || {})
        const categorie = [...new Set(ricette.map(r => r.tipo || 'altro'))]
        if (ricette.length === 0) { notify('Nessuna ricetta trovata', false); setLoading(null); return }
        for (const cat of categorie) {
          const rows = [['Nome', 'Stampi', 'Food Cost (€)', 'Tot. Impasto (g)', 'Tipo']]
          ricette.filter(r => (r.tipo || 'altro') === cat).forEach(r => {
            rows.push([r.nome, r.numStampi, r.foodCost1, r.totImpasto1, r.tipo || ''])
          })
          const ws = XLSX.utils.aoa_to_sheet(rows)
          XLSX.utils.book_append_sheet(wb, ws, cat.slice(0, 31))
        }
        XLSX.writeFile(wb, `ricettario-${fmtDate()}.xlsx`)

      } else if (tipo === 'produzione') {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90)
        const rows = [['Data', 'Prodotto', 'Stampi', 'Food Cost (€)', 'Sede']]
        for (const sede of (sedi || [])) {
          const gior = await sload('pasticceria-giornaliero-v1', orgId, sede.id)
          const sessioni = Array.isArray(gior) ? gior : []
          sessioni
            .filter(s => new Date(s.data || '') >= cutoff)
            .forEach(sess => {
              (sess.prodotti || []).forEach(p => {
                rows.push([sess.data, p.nome, p.stampi, sess.fcTot?.toFixed(2) || 0, sede.nome])
              })
            })
        }
        const ws = XLSX.utils.aoa_to_sheet(rows)
        XLSX.utils.book_append_sheet(wb, ws, 'Produzione 90gg')
        XLSX.writeFile(wb, `produzione-${fmtDate()}.xlsx`)

      } else if (tipo === 'chiusure') {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90)
        const rows = [['Data', 'Ricavi (€)', 'Note', 'Sede']]
        for (const sede of (sedi || [])) {
          const chius = await sload('pasticceria-chiusure-v1', orgId, sede.id)
          const arr = Array.isArray(chius) ? chius : []
          arr
            .filter(c => new Date(c.data || '') >= cutoff)
            .forEach(c => {
              rows.push([c.data, (c.kpi?.totV || 0).toFixed(2), c.note || '', sede.nome])
            })
        }
        const ws = XLSX.utils.aoa_to_sheet(rows)
        XLSX.utils.book_append_sheet(wb, ws, 'Chiusure 90gg')
        XLSX.writeFile(wb, `chiusure-${fmtDate()}.xlsx`)

      } else if (tipo === 'fatture') {
        const { data: fatture, error } = await supabase
          .from('fatture')
          .select('*')
          .eq('organization_id', orgId)
          .order('data_fattura', { ascending: false })
        if (error) throw error
        const rows = [['Data', 'Fornitore', 'Numero Rif.', 'Imponibile (€)', 'Imposta (€)', 'Totale (€)', 'Stato', 'Data Pagamento']]
        ;(fatture || []).forEach(f => {
          rows.push([f.data_fattura || '', f.fornitore || '', f.numero_rif || '', f.imponibile || 0, f.imposta || 0, f.totale || 0, f.stato || '', f.data_pagamento || ''])
        })
        const ws = XLSX.utils.aoa_to_sheet(rows)
        ws['!cols'] = [12, 36, 24, 14, 12, 12, 14, 16].map(wch => ({ wch }))
        XLSX.utils.book_append_sheet(wb, ws, 'Fatture')
        XLSX.writeFile(wb, `fatture-${fmtDate()}.xlsx`)
      }

      notify('File Excel scaricato')
    } catch (e) {
      notify('Errore export Excel: ' + supabaseErrMsg(e), false)
    } finally {
      setLoading(null)
    }
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.metadata?.versione) throw new Error('File non valido — non sembra un backup FoodOS')
        setImportFile(data)
        setImportPreview(data.metadata)
        setImportConfirm(false)
      } catch (err) {
        notify('File non valido: ' + err.message, false)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function eseguiImport() {
    if (!importFile) return
    setImporting(true)
    try {
      const { sharedData, sediData, fatture } = importFile

      for (const [key, value] of Object.entries(sharedData || {})) {
        if (value == null) continue
        await supabase.from('user_data').upsert({
          organization_id: orgId,
          sede_id: null,
          data_key: key,
          data_value: value,
        }, { onConflict: 'organization_id,sede_id,data_key' })
      }

      for (const [sedeId, sedeInfo] of Object.entries(sediData || {})) {
        for (const key of SEDE_KEYS) {
          const value = sedeInfo[key]
          if (value == null) continue
          await supabase.from('user_data').upsert({
            organization_id: orgId,
            sede_id: sedeId,
            data_key: key,
            data_value: value,
          }, { onConflict: 'organization_id,sede_id,data_key' })
        }
      }

      if (fatture?.length > 0) {
        await supabase.from('fatture').delete().eq('organization_id', orgId)
        const toInsert = fatture.map(f => ({ ...f, organization_id: orgId }))
        for (let i = 0; i < toInsert.length; i += 100) {
          const { error } = await supabase.from('fatture').insert(toInsert.slice(i, i + 100))
          if (error) throw error
        }
      }

      notify('Ripristino completato — ricarica la pagina per vedere i dati aggiornati')
      setImportFile(null)
      setImportPreview(null)
      setImportConfirm(false)
    } catch (e) {
      notify('Errore ripristino: ' + supabaseErrMsg(e), false)
    } finally {
      setImporting(false)
    }
  }

  const card = { background: '#FFF', borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20 }
  const secBtn = (col = '#FFF', bg = R) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 16px', background: bg, color: col, border: 'none',
    borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s',
  })

  return (
    <div style={{ maxWidth: 640 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '10px 18px', borderRadius: 10, background: toast.ok ? '#22C55E' : R, color: '#FFF', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxWidth: 360 }}>
          {toast.msg}
        </div>
      )}

      <div style={{ fontSize: 16, fontWeight: 800, color: TXT, marginBottom: 20 }}>Esporta e Backup Dati</div>

      {/* Backup JSON completo */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: TXT, marginBottom: 6 }}>💾 Backup completo</div>
        <div style={{ fontSize: 12, color: SOFT, marginBottom: 14, lineHeight: 1.6 }}>
          Scarica un file JSON con tutti i dati: ricettario, produzione, magazzino, chiusure cassa, fatture e note.<br />
          Include metadata: data export, nome attività, versione FoodOS.
        </div>
        <button onClick={esportaTutto} disabled={!!loading} style={secBtn()}>
          {loading === 'json' ? '…' : '⬇ Scarica tutti i dati (.json)'}
        </button>
      </div>

      {/* Export Excel */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: TXT, marginBottom: 6 }}>📊 Export Excel per sezione</div>
        <div style={{ fontSize: 12, color: SOFT, marginBottom: 14, lineHeight: 1.6 }}>
          Esporta ogni sezione in formato Excel per analisi o archivio.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            ['ricettario', '📖 Ricettario'],
            ['produzione', '🏭 Produzione 90gg'],
            ['chiusure', '💵 Chiusure 90gg'],
            ['fatture', '📄 Fatture'],
          ].map(([tipo, label]) => (
            <button key={tipo} onClick={() => esportaExcel(tipo)} disabled={!!loading}
              style={{ ...secBtn(R, '#FFF3F3'), border: `1px solid #FCA5A5`, color: R }}>
              {loading === 'excel-' + tipo ? '…' : label}
            </button>
          ))}
        </div>
      </div>

      {/* Import da backup */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: TXT, marginBottom: 6 }}>📥 Ripristina da backup</div>
        <div style={{ fontSize: 12, color: SOFT, marginBottom: 14, lineHeight: 1.6 }}>
          Carica un file JSON generato da FoodOS per ripristinare tutti i dati.
        </div>

        {!importPreview ? (
          <>
            <button onClick={() => fileRef.current?.click()} disabled={!!loading} style={{ ...secBtn('#92400E', '#FFFBEB'), border: '1px solid #FDE68A' }}>
              📂 Seleziona file backup (.json)
            </button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
          </>
        ) : (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 8 }}>Anteprima backup</div>
            <div style={{ fontSize: 12, color: MID, lineHeight: 1.8 }}>
              <div><b>Attività:</b> {importPreview.nomeAttivita}</div>
              <div><b>Data backup:</b> {new Date(importPreview.dataExport).toLocaleDateString('it-IT')}</div>
              <div><b>Versione FoodOS:</b> {importPreview.versione}</div>
              <div><b>Sedi:</b> {Object.keys(importFile?.sediData || {}).length}</div>
              <div><b>Fatture:</b> {(importFile?.fatture || []).length}</div>
            </div>

            {!importConfirm ? (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF0EE', borderRadius: 8, border: '1px solid #FCA5A5', fontSize: 12, color: '#7F1D1D' }}>
                <strong>⚠️ Attenzione</strong> — Questo sovrascriverà i dati attuali. Continuare?
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => setImportConfirm(true)} style={{ padding: '7px 16px', background: R, color: '#FFF', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Sì, ripristina
                  </button>
                  <button onClick={() => { setImportFile(null); setImportPreview(null) }} style={{ padding: '7px 12px', background: 'transparent', border: `1px solid ${BOR}`, borderRadius: 7, fontSize: 12, color: SOFT, cursor: 'pointer' }}>
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={eseguiImport} disabled={importing} style={{ marginTop: 12, padding: '9px 20px', background: R, color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {importing ? 'Ripristino in corso…' : 'Conferma ripristino'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Retention policy */}
      <div style={{ ...card, background: '#F8FAFC', border: `1px solid ${BOR}` }}>
        <div style={{ fontSize: 12, color: MID, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: TXT, marginBottom: 6 }}>📋 Politica di conservazione dati</div>
          I tuoi dati sono conservati per tutta la durata dell'abbonamento + 12 mesi dalla disdetta.<br />
          Puoi scaricare un backup completo in qualsiasi momento.
        </div>
      </div>
    </div>
  )
}
