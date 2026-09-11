import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { sload } from '../lib/storage'
import { color as T } from '../lib/theme'
import Icon from './Icon'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { formatLocalDate } from '../lib/dateLocal'

const R = T.brand
const TXT = T.text
const SOFT = T.textSoft
const MID = T.textMid
const BOR = T.border

// Versione 2: il backup porta via TUTTO.
//
// La versione 1 diceva "Scarica un file JSON con tutti i dati" ma portava via
// 12 chiavi scelte a mano su 34, più la tabella delle fatture. Misurato sui
// dati veri di Mara dei Boschi l'11/09/2026, restavano fuori dal "backup
// completo": 7.012 righe di inventario_produzione (tutta la storia della
// produzione, il cuore del lavoro), 315 fornitori, 3 dipendenti, 4 turni.
//
// E c'era di peggio. Questo progetto Supabase ha `db-max-rows: 1000`: una
// select senza paginazione torna al massimo mille righe. Delle 3.104 fatture
// di Mara ne finivano nel file 1.000. Poi il ripristino CANCELLAVA tutte e
// 3.104 le fatture prima di reinserire quelle del file. Un ripristino fatto
// per sicurezza ne avrebbe distrutte 2.104, scrivendo "Ripristino completato".
//
// Da qui in avanti: niente elenchi scritti a mano (si legge cosa c'e'),
// tutto paginato, e il ripristino non cancella niente.
const VERSION = '2.0'

// Le tabelle con i dati inseriti dall'utente. Fuori restano i log, la
// telemetria e il derivato (previsioni, brief AI): si ricalcolano, e
// gonfierebbero il file senza aggiungere niente che non si possa rifare.
const TABELLE = [
  'sedi', 'fornitori', 'fatture', 'extracted_invoices', 'ordini_fornitori',
  'inventario_produzione', 'stock_prodotti_finiti', 'movimenti_stock_pf', 'trasferimenti',
  'chiusure_cassa', 'chiusure_periodo', 'chiusure_ricorrenti', 'movimenti_cassa', 'pos_scontrini',
  'clienti_b2b', 'vendite_b2b',
  'dipendenti', 'turni',
  'costi_aziendali', 'cashflow_eventi', 'competitor_prices', 'note_giornaliere',
  'haccp_apparecchi', 'haccp_temperature', 'haccp_checklist_template', 'haccp_checklist_log',
]

// Legge una tabella intera a pagine da 1.000.
//
// Serve perché il server taglia a 1.000 righe qualunque select: senza questo
// giro il backup di Mara conteneva un terzo delle sue fatture e nessuno lo
// diceva.
const PAGINA = 1000
async function leggiTutto(tabella, orgId) {
  const righe = []
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase.from(tabella).select('*')
      .eq('organization_id', orgId).range(offset, offset + PAGINA - 1)
    if (error) throw error
    const lotto = data || []
    righe.push(...lotto)
    if (lotto.length < PAGINA) break
  }
  return righe
}

function fmtDate(d = new Date()) {
  return formatLocalDate(d).replace(/-/g, '')
}

async function loadXLSX() {
  if (window.XLSX) return window.XLSX
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'
    s.crossOrigin = 'anonymous'
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
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
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
      // Tutto quello che c'e' in user_data, senza elenchi scritti a mano:
      // le chiavi si leggono dal database. Se domani ne nasce una nuova
      // finisce nel backup da sola, senza che nessuno debba ricordarsene.
      const userData = await leggiTutto('user_data', orgId)

      const tabelle = {}
      const conteggi = {}
      const fuori = []
      for (const t of TABELLE) {
        try {
          const righe = await leggiTutto(t, orgId)
          tabelle[t] = righe
          conteggi[t] = righe.length
        } catch (e) {
          // Una tabella che non si riesce a leggere va DETTA, non saltata in
          // silenzio: chi tiene il file deve sapere cosa non c'e' dentro.
          fuori.push({ tabella: t, motivo: supabaseErrMsg(e) })
        }
      }
      conteggi.user_data = userData.length

      const backup = {
        metadata: {
          versione: VERSION,
          dataExport: new Date().toISOString(),
          nomeAttivita: nomeAttivita || 'Attività',
          orgId,
          conteggi,
          tabelleNonLette: fuori,
          completo: fuori.length === 0,
        },
        userData,
        tabelle,
      }

      const totale = Object.values(conteggi).reduce((a, b) => a + b, 0)
      const nome = (nomeAttivita || 'attivita').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      downloadJSON(backup, `foodos-backup-${nome}-${fmtDate()}.json`)
      notify(fuori.length === 0
        ? `Backup scaricato: ${totale.toLocaleString('it-IT', { useGrouping: 'always' })} righe`
        : `Backup scaricato: ${totale.toLocaleString('it-IT', { useGrouping: 'always' })} righe, ma ${fuori.length === 1 ? 'una tabella non si è letta' : `${fuori.length} tabelle non si sono lette`}`,
        fuori.length === 0)
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
        // Excel rifiuta : \\ / ? * [ ] nei nomi dei fogli e non accetta due
        // fogli con lo stesso nome: una categoria scritta con una barra faceva
        // fallire tutto l'export con un errore che non spiegava niente.
        const usati = new Set()
        for (const cat of categorie) {
          const rows = [['Nome', 'Stampi', 'Food Cost (€)', 'Tot. Impasto (g)', 'Tipo']]
          ricette.filter(r => (r.tipo || 'altro') === cat).forEach(r => {
            rows.push([r.nome, r.numStampi, r.foodCost1, r.totImpasto1, r.tipo || ''])
          })
          let nome = String(cat).replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'altro'
          if (usati.has(nome)) { let i = 2; while (usati.has(`${nome.slice(0, 28)} ${i}`)) i++; nome = `${nome.slice(0, 28)} ${i}` }
          usati.add(nome)
          const ws = XLSX.utils.aoa_to_sheet(rows)
          XLSX.utils.book_append_sheet(wb, ws, nome)
        }
        XLSX.writeFile(wb, `ricettario-${fmtDate()}.xlsx`)

      } else if (tipo === 'produzione') {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90)
        const rows = [['Data', 'Prodotto', 'Stampi', 'Food Cost (€)', 'Sede']]
        for (const sede of (sedi || [])) {
          const gior = await sload('pasticceria-giornaliero-v1', orgId, sede.id)
          const sessioni = Array.isArray(gior) ? gior : []
          sessioni
            // Una data illeggibile dava NaN, il confronto era falso e la riga
            // spariva dal file senza che nessuno lo dicesse. Ora si tiene e si
            // vede nel foglio.
            .filter(s => { const d = new Date(s.data || ''); return isNaN(d.getTime()) || d >= cutoff })
            .forEach(sess => {
              (sess.prodotti || []).forEach(p => {
                // Il food cost della sessione: se non c'e' la cella resta
                // vuota. Scriverci 0 vuol dire "questa produzione non e'
                // costata niente", che non e' mai vero.
                rows.push([sess.data || 'data mancante', p.nome, p.stampi, Number.isFinite(sess.fcTot) ? Number(sess.fcTot.toFixed(2)) : '', sede.nome])
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
            .filter(c => { const d = new Date(c.data || ''); return isNaN(d.getTime()) || d >= cutoff })
            .forEach(c => {
              // Stessa regola: una chiusura senza incasso registrato lascia la
              // cella vuota. Con lo 0 il commercialista legge una giornata a
              // zero incassi, che e' una cosa diversa da "non registrata".
              const v = Number(c?.kpi?.totV ?? c?.totale)
              rows.push([c.data || 'data mancante', Number.isFinite(v) ? Number(v.toFixed(2)) : '', c.note || '', sede.nome])
            })
        }
        const ws = XLSX.utils.aoa_to_sheet(rows)
        XLSX.utils.book_append_sheet(wb, ws, 'Chiusure 90gg')
        XLSX.writeFile(wb, `chiusure-${fmtDate()}.xlsx`)

      } else if (tipo === 'fatture') {
        // Paginato: senza, il foglio conteneva 1.000 fatture su 3.104 e
        // sembrava che le altre non esistessero.
        const fatture = (await leggiTutto('fatture', orgId))
          .sort((a, b) => String(b.data_fattura || '').localeCompare(String(a.data_fattura || '')))
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
        if (!data.metadata?.versione) throw new Error('File non valido - non sembra un backup Foodos')
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
      // Il ripristino NON cancella niente.
      //
      // Prima, sulle fatture, faceva delete di tutta l'organizzazione e poi
      // reinseriva quelle del file. Siccome il file ne conteneva al massimo
      // 1.000 (il server taglia li'), un ripristino sulle 3.104 fatture di
      // Mara ne avrebbe distrutte 2.104 — annunciando "Ripristino completato".
      //
      // Ora ogni riga si sovrascrive per id: quello che c'e' nel file torna
      // com'era, quello che nel file non c'e' resta dov'e'.
      const esiti = []
      const scrivi = async (tabella, righe, onConflict) => {
        const arr = (righe || []).filter(Boolean)
        if (arr.length === 0) return
        let scritte = 0
        for (let i = 0; i < arr.length; i += 100) {
          const lotto = arr.slice(i, i + 100).map(r => ({ ...r, organization_id: orgId }))
          const { error } = await supabase.from(tabella).upsert(lotto, { onConflict })
          if (error) { esiti.push({ tabella, errore: supabaseErrMsg(error), scritte }); return }
          scritte += lotto.length
        }
        esiti.push({ tabella, scritte })
      }

      if (importFile.metadata?.versione?.startsWith('2')) {
        await scrivi('user_data', importFile.userData, 'organization_id,sede_id,data_key')
        // Le sedi per prime: le altre tabelle ci puntano.
        const tab = importFile.tabelle || {}
        for (const t of ['sedi', ...TABELLE.filter(x => x !== 'sedi')]) {
          if (tab[t]) await scrivi(t, tab[t], 'id')
        }
      } else {
        // File vecchio (versione 1): si ripristina quello che contiene, ma
        // con le stesse regole — sovrascrivere si', cancellare no.
        const { sharedData, sediData, fatture } = importFile
        const righeUD = []
        for (const [key, value] of Object.entries(sharedData || {})) {
          if (value == null) continue
          righeUD.push({ organization_id: orgId, sede_id: null, data_key: key, data_value: value })
        }
        for (const [sedeId, sedeInfo] of Object.entries(sediData || {})) {
          for (const [key, value] of Object.entries(sedeInfo || {})) {
            if (value == null || key === 'nome' || key === 'citta') continue
            righeUD.push({ organization_id: orgId, sede_id: sedeId, data_key: key, data_value: value })
          }
        }
        await scrivi('user_data', righeUD, 'organization_id,sede_id,data_key')
        await scrivi('fatture', fatture, 'id')
      }

      const falliti = esiti.filter(e => e.errore)
      const totale = esiti.reduce((a, e) => a + (e.scritte || 0), 0)
      if (falliti.length > 0) {
        notify(`Ripristinate ${totale.toLocaleString('it-IT', { useGrouping: 'always' })} righe, ma ${falliti.length === 1 ? 'una tabella non è passata' : `${falliti.length} tabelle non sono passate`}: ${falliti.map(f => f.tabella).join(', ')}`, false)
      } else {
        notify(`Ripristinate ${totale.toLocaleString('it-IT', { useGrouping: 'always' })} righe · ricarica la pagina per vederle`)
        setImportFile(null)
        setImportPreview(null)
        setImportConfirm(false)
      }
    } catch (e) {
      notify('Errore ripristino: ' + supabaseErrMsg(e), false)
    } finally {
      setImporting(false)
    }
  }

  const card = { background: '#FFF', borderRadius: 12, padding: isMobile ? '16px 16px' : '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20 }
  const touchH = isTablet ? 44 : isMobile ? 42 : 36
  const secBtn = (col = '#FFF', bg = R) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 16px', minHeight: touchH,
    background: bg, color: col, border: 'none',
    borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer',
    opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s',
  })

  return (
    <div style={{ maxWidth: 640 }}>
      {toast && (
        <div style={{
          position: 'fixed',
          top: isMobile ? 12 : 20,
          left: isMobile ? 12 : undefined,
          right: isMobile ? 12 : 20,
          zIndex: 9999, padding: '10px 18px', borderRadius: 10,
          background: toast.ok ? '#22C55E' : R, color: '#FFF',
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          maxWidth: isMobile ? 'none' : 360,
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ fontSize: 16, fontWeight: 800, color: TXT, marginBottom: 20 }}>Esporta e Backup Dati</div>

      {/* Backup JSON completo */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: TXT, marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="save" size={16} color={R} /> Backup completo</div>
        <div style={{ fontSize: 12, color: SOFT, marginBottom: 14, lineHeight: 1.6 }}>
          Scarica un file con tutto quello che hai inserito: ricettario, produzione giorno per giorno, magazzino, cassa, fatture e fornitori, dipendenti e turni, HACCP, clienti e vendite B2B, costi. Sul file c'è scritto quante righe contiene per ogni tabella, così puoi controllare che ci sia tutto.<br />
          Include metadata: data export, nome attività, versione Foodos.
        </div>
        <button onClick={esportaTutto} disabled={!!loading} style={secBtn()}>
          {loading === 'json' ? '…' : <><Icon name="download" size={14} /> Scarica tutti i dati (.json)</>}
        </button>
      </div>

      {/* Export Excel */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: TXT, marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="barChart" size={16} color={R} /> Export Excel per sezione</div>
        <div style={{ fontSize: 12, color: SOFT, marginBottom: 14, lineHeight: 1.6 }}>
          Un foglio Excel per sezione, da aprire o da mandare al commercialista. Produzione e chiusure contengono gli ultimi 90 giorni; ricettario e fatture sono completi.
        </div>
        <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, flexWrap: 'wrap', gap: 8 }}>
          {[
            ['ricettario', 'book', 'Ricettario'],
            ['produzione', 'factory', 'Produzione 90gg'],
            ['chiusure', 'money', 'Chiusure 90gg'],
            ['fatture', 'fileText', 'Fatture'],
          ].map(([tipo, ico, label]) => (
            <button key={tipo} onClick={() => esportaExcel(tipo)} disabled={!!loading}
              style={{ ...secBtn(R, '#FFF3F3'), border: `1px solid #FCA5A5`, color: R, justifyContent: 'center' }}>
              {loading === 'excel-' + tipo ? '…' : <><Icon name={ico} size={14} /> {label}</>}
            </button>
          ))}
        </div>
      </div>

      {/* Import da backup */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: TXT, marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="download" size={16} color={R} /> Ripristina da backup</div>
        <div style={{ fontSize: 12, color: SOFT, marginBottom: 14, lineHeight: 1.6 }}>
          Carica un file generato da Foodos. Le righe del file tornano come erano; quello che nel file non c'è resta dov'è. Il ripristino non cancella niente.
        </div>

        {!importPreview ? (
          <>
            <button onClick={() => fileRef.current?.click()} disabled={!!loading} style={{ ...secBtn('#92400E', '#FFFBEB'), border: '1px solid #FDE68A' }}>
              <Icon name="folder" size={14} /> Seleziona file backup (.json)
            </button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
          </>
        ) : (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 8 }}>Anteprima backup</div>
            <div style={{ fontSize: 12, color: MID, lineHeight: 1.8 }}>
              <div><b>Attività:</b> {importPreview.nomeAttivita}</div>
              <div><b>Data backup:</b> {new Date(importPreview.dataExport).toLocaleDateString('it-IT')}</div>
              <div><b>Versione Foodos:</b> {importPreview.versione}</div>
              {/* Il conteggio arriva dal file stesso. Prima erano due righe
                  fisse ("Sedi", "Fatture") lette dal formato vecchio: su un
                  backup nuovo mostravano 0 e 0, e sembrava un file vuoto. */}
              {importPreview.conteggi
                ? Object.entries(importPreview.conteggi)
                    .filter(([, n]) => n > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([t, n]) => (
                      <div key={t}><b>{t.replace(/_/g, ' ')}:</b> {n.toLocaleString('it-IT', { useGrouping: 'always' })} {n === 1 ? 'riga' : 'righe'}</div>
                    ))
                : <>
                    <div><b>Sedi:</b> {Object.keys(importFile?.sediData || {}).length}</div>
                    <div><b>Fatture:</b> {(importFile?.fatture || []).length}</div>
                  </>}
              {importPreview.completo === false && (
                <div style={{ color: T.amberDark, marginTop: 6 }}>
                  Questo backup è incompleto: quando è stato fatto, {(importPreview.tabelleNonLette || []).length === 1 ? 'una tabella non si è letta' : `${(importPreview.tabelleNonLette || []).length} tabelle non si sono lette`}.
                </div>
              )}
            </div>

            {!importConfirm ? (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF0EE', borderRadius: 8, border: '1px solid #FCA5A5', fontSize: 12, color: '#7F1D1D' }}>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="warning" size={14} /> Attenzione</strong> - Le righe che stanno anche nel file verranno riscritte com'erano il giorno del backup: le modifiche fatte dopo su quelle righe si perdono. Tutto il resto resta com'è. Continuare?
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => setImportConfirm(true)} style={{ padding: '7px 16px', minHeight: touchH, background: R, color: '#FFF', border: 'none', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', flex: isMobile ? '1 1 auto' : '0 0 auto' }}>
                    Sì, ripristina
                  </button>
                  <button onClick={() => { setImportFile(null); setImportPreview(null) }} style={{ padding: '7px 12px', minHeight: touchH, background: 'transparent', border: `1px solid ${BOR}`, borderRadius: 8, fontSize: isMobile ? 13 : 12, color: SOFT, cursor: 'pointer', flex: isMobile ? '1 1 auto' : '0 0 auto' }}>
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={eseguiImport} disabled={importing} style={{ marginTop: 12, padding: '9px 20px', minHeight: touchH, background: R, color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}>
                {importing ? 'Ripristino in corso…' : 'Conferma ripristino'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Retention policy */}
      <div style={{ ...card, background: '#F8FAFC', border: `1px solid ${BOR}` }}>
        <div style={{ fontSize: 12, color: MID, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: TXT, marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="clipboard" size={15} color={R} /> Politica di conservazione dati</div>
          I tuoi dati sono conservati per tutta la durata dell'abbonamento + 12 mesi dalla disdetta.<br />
          Puoi scaricare un backup completo in qualsiasi momento.
        </div>
      </div>
    </div>
  )
}
