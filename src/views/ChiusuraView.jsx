// ChiusuraView — Chiusura cassa giornaliera. Estratta da Dashboard.jsx.
// OCR scontrini (Claude Vision), batch multi-scontrino, import delivery/cassa,
// confronto produzione vs venduto, scarico automatico stock PF.
//
// Richiede orgId/sedeId come props (persistenza ssave + scarico stock).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ssave as _ssave, sload } from '../lib/storage'
import { backgroundManager, uploadManager } from '../lib/backgroundManager'
import { compressImage } from '../lib/imageUtils'
import useIsMobile from '../lib/useIsMobile'
import { color as T } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR, isRicettaValida } from '../lib/foodcost'
import { scaricoVenditaPF } from '../lib/stockPF'
import { SK_CHIUS, SK_FORMATI, SK_MOV } from '../lib/storageKeys'
import { riconciliaFormati } from '../lib/formatiVendita'
import { aggregaGiorno } from '../lib/movimentiSpeciali'
import { parseDeliveroo, parseJustEat, parseGlovo, parseGenericCSV, applyGenericMapping, mergeInChiusure } from '../lib/importDelivery'
import { parseFile as parseCassaFile, mergeInChiusureCassa } from '../lib/importCassa'
import { C, KPI, PageHeader, margColor, fmt, fmtp } from './_shared'

// Persiste fra unmount/remount durante l'analisi AI di uno scontrino
const _receiptPending = { current: null }

export default function ChiusuraView({ ricettario, giornaliero, chiusure, setChiusure, notify, orgId, sedeId, isDipendente = false }) {
  const isMobile = useIsMobile()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const ssave = (key, val) => _ssave(key, val, orgId, sedeId)

  const ricetteNote = useMemo(() => {
    const out = {}
    for (const [, r] of Object.entries(ricettario?.ricette || {})) {
      if (isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato')
        out[r.nome.toUpperCase().trim()] = r
    }
    return out
  }, [ricettario])

  // Formati di vendita (config shared): mappano le righe scontrino senza dettaglio
  // gusto/ripieno (cono, vaschetta, panino…) a una categoria di ricette.
  const [formati, setFormati] = useState([])
  useEffect(() => {
    let alive = true
    if (!orgId) return
    sload(SK_FORMATI, orgId, null).then(v => { if (alive) setFormati(Array.isArray(v) ? v : []) })
    return () => { alive = false }
  }, [orgId])

  // Sprechi e omaggi della sede (movimenti speciali del giorno).
  const [movimenti, setMovimenti] = useState([])
  useEffect(() => {
    let alive = true
    if (!orgId || !sedeId) return
    sload(SK_MOV, orgId, sedeId).then(v => { if (alive) setMovimenti(Array.isArray(v) ? v : []) })
    return () => { alive = false }
  }, [orgId, sedeId])

  const today = new Date().toISOString().slice(0, 10)
  const [dataFiltro, setDataFiltro] = useState(today)

  const sessione = useMemo(() =>
    [...(giornaliero || [])].filter(s => s.data === dataFiltro).sort((a, b) => b.id.localeCompare(a.id))[0] || null
  , [giornaliero, dataFiltro])

  const chiusuraSalvata = useMemo(() =>
    (chiusure || []).find(c => c.data === dataFiltro) || null
  , [chiusure, dataFiltro])

  const [img, setImg] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [venduto, setVenduto] = useState(null)
  const [error, setError] = useState(null)
  const [salvato, setSalvato] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (chiusuraSalvata) { setVenduto(chiusuraSalvata.venduto); setSalvato(true) }
    else { setVenduto(null); setSalvato(false) }
  }, [chiusuraSalvata])

  useEffect(() => {
    const p = _receiptPending.current
    if (!p) return
    if (p.loading) { setLoading(true); return }
    if (p.venduto !== null) {
      setVenduto(p.venduto)
      if (p.dataEstratta && /^\d{4}-\d{2}-\d{2}$/.test(p.dataEstratta)) setDataFiltro(p.dataEstratta)
      setLoading(false)
      _receiptPending.current = null
    } else if (p.error) {
      setError(p.error); setLoading(false); _receiptPending.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const PROMPT = `Sei un OCR per scontrini di bar/pasticceria italiani.
Estrai queste informazioni dallo scontrino:
1. DATA: cerca la data dello scontrino in qualsiasi formato (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, "12 marzo 2026", ecc). Convertila sempre in formato ISO YYYY-MM-DD. Se non trovi la data metti null.
2. PRODOTTI PASTICCERIA: estrai SOLO i prodotti della categoria PASTICCERIA (la sezione che inizia con "> N PASTICCERIA" e finisce alla prossima sezione "> N ALTRO").
   Per ogni riga prodotto estrai: nome esatto come scritto, quantita venduta (numero prima del nome), prezzo totale riga (numero a destra).
   Calcola prezzoUnitario = totale / quantita.
   Ignora righe di sconto (es "sconto 30%"), totali di categoria, intestazioni, e prodotti di altre categorie (GELATO, BIBITE, ecc).
Rispondi SOLO JSON valido senza markdown ne testi extra:
{"data":"YYYY-MM-DD o null","prodotti":[{"nome":"NOME","qta":numero,"totale":euro_numero,"prezzoUnitario":euro_numero}]}`

  const [batchMode, setBatchMode] = useState(false)
  const [batchFiles, setBatchFiles] = useState([])
  const [batchProgress, setBatchProg] = useState(null)
  const [batchResults, setBatchResults] = useState([])

  const [importModal, setImportModal] = useState(null)
  const [importPiattaforma, setImportPiattaforma] = useState('deliveroo')
  const [importSistema, setImportSistema] = useState('cassaincloud')
  const [importPreview, setImportPreview] = useState(null)
  const [importGenericMapping, setImportGenericMapping] = useState({ data: '', importo: '', comm: '' })
  const [importLoading, setImportLoading] = useState(false)
  const importFileRef = useRef(null)

  const readFile64 = f => new Promise(res => {
    const r = new FileReader()
    r.onload = ev => res({ data64: ev.target.result.split(',')[1], preview: ev.target.result, mediaType: f.type || 'image/jpeg' })
    r.readAsDataURL(f)
  })

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setVenduto(null); setError(null); setSalvato(false)
    const compressed = await Promise.all(files.map(f => compressImage(f)))
    if (compressed.length === 1) {
      setBatchMode(false); setBatchFiles([]); setBatchResults([])
      const read = await readFile64(compressed[0])
      setPreview(read.preview); setImg(read.data64)
    } else {
      setBatchMode(true)
      const reads = await Promise.all(compressed.map(readFile64))
      setBatchFiles(reads)
      setPreview(reads[0].preview); setImg(reads[0].data64)
      notify(`📷 ${reads.length} scontrini selezionati — premi "Leggi tutti" per elaborarli`)
    }
  }

  const analyzeReceipt = async (imgData, mediaType) => {
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 2000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imgData } },
          { type: 'text', text: PROMPT },
        ] }],
      }),
    })
    const d = await r.json()
    const text = d.content?.find(b => b.type === 'text')?.text || '{}'
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  }

  const handleAnalizza = () => {
    if (!img) return
    setLoading(true); setError(null); setVenduto(null)
    const imgSnap = img
    _receiptPending.current = { loading: true, venduto: null, error: null, dataEstratta: null }
    backgroundManager.add(`scontrino-${Date.now()}`, {
      tipo: 'ai_analisi', nome: 'Analisi scontrino AI',
      fn: async (onProgress) => { onProgress(20); const obj = await analyzeReceipt(imgSnap, 'image/jpeg'); onProgress(100); return obj },
      onComplete: (obj) => {
        const prodotti = obj.prodotti || []
        const dataEstratta = (obj.data && /^\d{4}-\d{2}-\d{2}$/.test(obj.data)) ? obj.data : null
        _receiptPending.current = { loading: false, venduto: prodotti, error: null, dataEstratta }
        setVenduto(prodotti)
        if (dataEstratta) {
          setDataFiltro(dataEstratta)
          notify(`📅 Data estratta dallo scontrino: ${new Date(dataEstratta + 'T12:00').toLocaleDateString('it-IT')}`)
        }
        setLoading(false)
      },
      onError: (err) => {
        _receiptPending.current = { loading: false, venduto: null, error: err.message, dataEstratta: null }
        setError(err.message); setLoading(false)
      },
    })
  }

  const handleAnalizzaBatch = () => {
    if (!batchFiles.length) return
    setLoading(true); setBatchProg('0/' + batchFiles.length); setBatchResults([])
    const filesSnap = batchFiles.slice()
    const chiusureSnap = (chiusure || []).slice()
    const todaySnap = today
    backgroundManager.add(`batch-scontrini-${Date.now()}`, {
      tipo: 'ai_analisi', nome: `Analisi batch ${filesSnap.length} scontrini`,
      fn: async (onProgress) => {
        const nuoveChiusure = [...chiusureSnap]
        const results = []
        let saved = 0, skipped = 0
        for (let i = 0; i < filesSnap.length; i++) {
          onProgress(Math.round((i / filesSnap.length) * 90))
          setBatchProg(`${i + 1}/${filesSnap.length}`)
          try {
            const obj = await analyzeReceipt(filesSnap[i].data64, filesSnap[i].mediaType)
            const prodotti = obj.prodotti || []
            const dataRaw = obj.data
            const dataStr = dataRaw && /^\d{4}-\d{2}-\d{2}$/.test(dataRaw) ? dataRaw : todaySnap
            if (!prodotti.length) { results.push({ data: dataStr, prodotti: [], salvato: false, error: 'Nessun prodotto estratto' }); skipped++; continue }
            const rec = { id: `ch-${dataStr}-${Date.now()}`, data: dataStr, salvatoAt: new Date().toISOString(), venduto: prodotti, confronto: [], kpi: {}, dataEstrattaDaScontrino: !!dataRaw }
            const idx = nuoveChiusure.findIndex(c => c.data === dataStr)
            if (idx >= 0) nuoveChiusure[idx] = rec; else nuoveChiusure.push(rec)
            results.push({ data: dataStr, prodotti, salvato: true, error: null })
            saved++
          } catch (e) { results.push({ data: '?', prodotti: [], salvato: false, error: e.message }); skipped++ }
        }
        nuoveChiusure.sort((a, b) => b.data.localeCompare(a.data))
        await ssave(SK_CHIUS, nuoveChiusure)
        onProgress(100)
        return { nuoveChiusure, results, saved, skipped }
      },
      onComplete: ({ nuoveChiusure, results, saved, skipped }) => {
        setChiusure(nuoveChiusure); setBatchResults(results); setBatchProg(null); setLoading(false)
        notify(`✓ ${saved} chiusure salvate${skipped > 0 ? ` · ${skipped} saltate` : ''}`)
      },
      onError: (err) => { setBatchProg(null); setLoading(false); notify(`⚠ Errore batch: ${err.message}`, false) },
    })
  }

  const confronto = useMemo(() => {
    if (!venduto) return []
    const prodottiOggi = {}
    for (const p of (sessione?.prodotti || [])) prodottiOggi[p.nome.toUpperCase().trim()] = p.stampi || 0
    return venduto.flatMap(v => {
      const nup = v.nome.toUpperCase().trim()
      const mk = Object.keys(ricetteNote).find(k =>
        k === nup || k.includes(nup) || nup.includes(k) ||
        k.replace(/[^A-Z0-9]/g, '').includes(nup.replace(/[^A-Z0-9]/g, '')) ||
        nup.replace(/[^A-Z0-9]/g, '').includes(k.replace(/[^A-Z0-9]/g, ''))
      )
      if (!mk) return []
      const ric = ricetteNote[mk]
      const reg = getR(mk, ric)
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      const stampiP = prodottiOggi[mk] || 0
      const unitaP = stampiP * reg.unita
      const unitaV = v.qta
      const unitaR = Math.max(0, unitaP - unitaV)
      const st = unitaP > 0 ? (unitaV / unitaP * 100) : null
      const rv = v.totale || (v.prezzoUnitario * v.qta) || 0
      const fcV = unitaP > 0 ? (unitaV / unitaP) * fc * stampiP : (unitaV / reg.unita) * fc
      const marg = rv - fcV
      const spreco = unitaR > 0 ? (unitaR / reg.unita) * fc : 0
      return [{ nome: mk, nomeScont: v.nome, stampiP, unitaP, unitaV, unitaR, st, rv, fcV, marg, spreco, reg, fc, inProd: stampiP > 0 }]
    })
  }, [venduto, sessione, ricetteNote, ingCosti])

  // Righe generiche (cono/vaschetta/panino) riconciliate via formati di vendita.
  const matchedRecipeNames = useMemo(() => new Set(confronto.map(r => r.nomeScont)), [confronto])
  const formatiRiconc = useMemo(() =>
    riconciliaFormati(venduto || [], formati, sessione, ricettario, ingCosti, matchedRecipeNames)
  , [venduto, formati, sessione, ricettario, ingCosti, matchedRecipeNames])

  // Sprechi e omaggi del giorno per la sede attiva.
  const aggMov = useMemo(() => aggregaGiorno(movimenti, dataFiltro), [movimenti, dataFiltro])

  // Drift porzioni per categoria: prodotto - venduto teorico - omaggi - sprechi.
  // Drift positivo = consumo reale piu' alto del teorico (mano abbondante / residui non gestiti).
  // Drift negativo = consumo reale piu' basso (mano stretta / vendite non registrate).
  const driftPerCategoria = useMemo(() => formatiRiconc.categorie.map(c => {
    const mov = aggMov.perCategoria[c.categoria] || { gSpreco: 0, gOmaggio: 0 }
    const consumatoTeorico = c.gVenduti + mov.gOmaggio + mov.gSpreco
    const drift = c.gProdotti - consumatoTeorico
    const driftPct = c.gProdotti > 0 ? (drift / c.gProdotti) * 100 : null
    return { ...c, gOmaggio: mov.gOmaggio, gSpreco: mov.gSpreco, consumatoTeorico, drift, driftPct }
  }), [formatiRiconc.categorie, aggMov])

  // I totali includono SIA le ricette riconosciute per nome SIA i formati generici,
  // SIA il food cost di sprechi/omaggi (sono costi reali per l'azienda).
  // Cosi' cassa e produzione coincidono anche senza il dettaglio del gusto, e il
  // margine giornaliero riflette l'impatto reale delle perdite.
  const fmtV = formatiRiconc.righe.reduce((s, r) => s + r.rv, 0)
  const fmtFC = formatiRiconc.righe.reduce((s, r) => s + r.fcV, 0)
  const movFC = (aggMov.tot.eurSpreco || 0) + (aggMov.tot.eurOmaggio || 0)
  const totV = confronto.reduce((s, r) => s + r.rv, 0) + fmtV
  const totFC = confronto.reduce((s, r) => s + r.fcV, 0) + fmtFC + movFC
  const totM = totV - totFC
  const totS = confronto.reduce((s, r) => s + r.spreco, 0) + (aggMov.tot.eurSpreco || 0)
  const totMP = totV > 0 ? (totM / totV * 100) : 0
  const stL = confronto.filter(r => r.st !== null)
  const avgST = stL.length > 0 ? stL.reduce((s, r) => s + r.st, 0) / stL.length : 0
  const stC = st => st >= 85 ? C.green : st >= 65 ? C.amber : C.red
  const fmtKg = g => g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`

  const handleSalva = async () => {
    if (!venduto || (confronto.length === 0 && formatiRiconc.righe.length === 0)) return
    const rec = {
      id: `ch-${dataFiltro}`, data: dataFiltro, salvatoAt: new Date().toISOString(), venduto,
      confronto: confronto.map(r => ({ nome: r.nome, stampiP: r.stampiP, unitaP: r.unitaP, unitaV: r.unitaV, unitaR: r.unitaR, st: r.st, rv: r.rv, fcV: r.fcV, marg: r.marg, spreco: r.spreco, inProd: r.inProd })),
      // Righe generiche riconciliate via formati di vendita (categoria, no gusto).
      formati: formatiRiconc.righe.map(r => ({ nome: r.nome, categoria: r.categoria, unitaV: r.unitaV, rv: r.rv, fcV: r.fcV, marg: r.marg })),
      kpi: { totV, totFC, totM, totS, totMP, avgST },
    }
    const eraGiaChiusa = !!chiusuraSalvata
    const nuove = [...(chiusure || []).filter(c => c.data !== dataFiltro), rec]
    setChiusure(nuove)
    await ssave(SK_CHIUS, nuove)
    setSalvato(true)

    // Scarico automatico stock PF (solo prima chiusura del giorno)
    if (!eraGiaChiusa && orgId && sedeId) {
      for (const row of confronto) {
        const venduti = Number(row.unitaV || 0)
        if (venduti <= 0) continue
        try {
          await scaricoVenditaPF({ sedeId, prodotto: row.nome, quantita: venduti, unita: 'pz', note: `Chiusura ${dataFiltro}` })
        } catch (e) {
          console.error('Errore scarico vendita PF:', row.nome, e?.message)
        }
      }
    }
    notify(`✓ Chiusura del ${new Date(dataFiltro + 'T12:00').toLocaleDateString('it-IT')} salvata nello storico`)
  }

  const handleImportDeliveryFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportLoading(true); setImportPreview(null)
    const piattaforma = importPiattaforma
    const id = `delivery-${file.name}-${Date.now()}`
    uploadManager.add(id, file, async (onProgress) => {
      onProgress(30)
      let result
      if (piattaforma === 'deliveroo') result = { tipo: 'aggregated', righe: parseDeliveroo(await file.text()) }
      else if (piattaforma === 'justeat') result = { tipo: 'aggregated', righe: parseJustEat(await file.text()) }
      else if (piattaforma === 'glovo') result = { tipo: 'aggregated', righe: await parseGlovo(file) }
      else { const g = parseGenericCSV(await file.text()); result = { tipo: 'generic', ...g } }
      onProgress(100)
      return result
    }, {
      onComplete: (result) => { setImportPreview(result); setImportLoading(false) },
      onError: (err) => { notify(`⚠ ${err.message}`); setImportLoading(false) },
    })
  }

  const handleConfirmDelivery = async () => {
    if (!importPreview) return
    let righe = importPreview.righe || []
    if (importPreview.tipo === 'generic') {
      righe = applyGenericMapping(importPreview.rows, importGenericMapping.data, importGenericMapping.importo, importGenericMapping.comm, 'Generico')
    }
    const nuove = mergeInChiusure(chiusure || [], righe, importPiattaforma)
    setChiusure(nuove); await ssave(SK_CHIUS, nuove)
    notify(`✓ ${righe.length} giorni importati da ${importPiattaforma}`)
    setImportModal(null); setImportPreview(null)
  }

  const handleImportCassaFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportLoading(true); setImportPreview(null)
    const sistema = importSistema
    const id = `cassa-${file.name}-${Date.now()}`
    uploadManager.add(id, file, async (onProgress) => {
      onProgress(30); const righe = await parseCassaFile(sistema, file); onProgress(100)
      return { tipo: 'aggregated', righe }
    }, {
      onComplete: (result) => { setImportPreview(result); setImportLoading(false) },
      onError: (err) => { notify(`⚠ ${err.message}`); setImportLoading(false) },
    })
  }

  const handleConfirmCassa = async () => {
    if (!importPreview?.righe) return
    const nuove = mergeInChiusureCassa(chiusure || [], importPreview.righe, importSistema)
    setChiusure(nuove); await ssave(SK_CHIUS, nuove)
    notify(`✓ ${importPreview.righe.length} giorni importati da ${importSistema}`)
    setImportModal(null); setImportPreview(null)
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader
        subtitle="Chiudi la giornata — foto scontrino, import delivery o manuale"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setImportModal('delivery'); setImportPreview(null) }}
              style={{ padding: '8px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.textMid, cursor: 'pointer', whiteSpace: 'nowrap' }}>Delivery</button>
            <button onClick={() => { setImportModal('cassa'); setImportPreview(null) }}
              style={{ padding: '8px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.textMid, cursor: 'pointer', whiteSpace: 'nowrap' }}>Sistema cassa</button>
          </div>
        }
      />

      {importModal === 'delivery' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: '24px', maxWidth: 540, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflowY: 'auto', maxHeight: '90vh' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 4 }}>🛵 Importa da piattaforma delivery</div>
            <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 18 }}>Seleziona la piattaforma e carica il file export CSV/Excel.</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Piattaforma</div>
              <select value={importPiattaforma} onChange={e => { setImportPiattaforma(e.target.value); setImportPreview(null) }}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 12, color: C.text }}>
                <option value="deliveroo">Deliveroo (CSV)</option>
                <option value="justeat">JustEat (CSV)</option>
                <option value="glovo">Glovo / Foodinho (Excel)</option>
                <option value="generico">Formato generico (CSV)</option>
              </select>
            </div>
            <label style={{ display: 'block', padding: '12px', background: '#F8F4F2', border: `1px dashed ${C.borderStr}`, borderRadius: 10, textAlign: 'center', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.textMid, marginBottom: 14 }}>
              📂 {importLoading ? 'Lettura file…' : 'Carica file export'}
              <input ref={importFileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleImportDeliveryFile}/>
            </label>
            {importPreview?.tipo === 'aggregated' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 8 }}>✓ {importPreview.righe.length} giorni rilevati</div>
                <div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead><tr style={{ background: '#F8F4F2' }}>
                      {['Data', 'Importo', 'Commissione', 'Netto', 'Ordini'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Data' ? 'left' : 'right', fontWeight: 700, color: C.textSoft }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{importPreview.righe.map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? '#FDFAF7' : C.white }}>
                        <td style={{ padding: '5px 10px', fontWeight: 700, color: C.text }}>{r.data}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: C.green }}>€{(r.importo || 0).toFixed(2)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: C.red }}>€{(r.commissione || 0).toFixed(2)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700 }}>€{(r.netto || 0).toFixed(2)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: C.textSoft }}>{r.ordini}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            {importPreview?.tipo === 'generic' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 8 }}>📋 Mappa le colonne</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {[['Data', 'data'], ['Importo', 'importo'], ['Commissione (opz.)', 'comm']].map(([label, key]) => (
                    <div key={key}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, marginBottom: 4 }}>{label}</div>
                      <select value={importGenericMapping[key] || ''} onChange={e => setImportGenericMapping(m => ({ ...m, [key]: e.target.value }))}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: 11 }}>
                        <option value="">—</option>
                        {(importPreview.headers || []).map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {importPreview && (
                <button onClick={handleConfirmDelivery} style={{ flex: 1, padding: '10px', background: C.green, color: C.white, border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>✓ Importa in Cassa</button>
              )}
              <button onClick={() => { setImportModal(null); setImportPreview(null) }} style={{ padding: '10px 16px', background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 12, cursor: 'pointer' }}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {importModal === 'cassa' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: '24px', maxWidth: 540, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflowY: 'auto', maxHeight: '90vh' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 4 }}>🖥 Importa da sistema cassa</div>
            <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 18 }}>Seleziona il sistema e carica il file export (CSV o XML).</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Sistema cassa</div>
              <select value={importSistema} onChange={e => { setImportSistema(e.target.value); setImportPreview(null) }}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 12, color: C.text }}>
                <option value="cassaincloud">Cassa in Cloud (CSV)</option>
                <option value="sumup">SumUp (CSV)</option>
                <option value="zucchetti">Zucchetti Infinity/Kassa (CSV o XML)</option>
                <option value="lightspeed">Lightspeed (CSV)</option>
                <option value="square">Square (CSV)</option>
                <option value="fattura_xml">Fattura Elettronica SDI (XML)</option>
              </select>
            </div>
            <label style={{ display: 'block', padding: '12px', background: '#F8F4F2', border: `1px dashed ${C.borderStr}`, borderRadius: 10, textAlign: 'center', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.textMid, marginBottom: 14 }}>
              📂 {importLoading ? 'Lettura file…' : 'Carica file export'}
              <input type="file" accept=".csv,.xml,.xlsx" style={{ display: 'none' }} onChange={handleImportCassaFile}/>
            </label>
            {importPreview?.tipo === 'aggregated' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 8 }}>✓ {importPreview.righe.length} record rilevati</div>
                <div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead><tr style={{ background: '#F8F4F2' }}>
                      {['Data', 'Importo', 'IVA', 'Righe', 'Fonte'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Data' || h === 'Fonte' ? 'left' : 'right', fontWeight: 700, color: C.textSoft }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{importPreview.righe.map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? '#FDFAF7' : C.white }}>
                        <td style={{ padding: '5px 10px', fontWeight: 700, color: C.text }}>{r.data}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: C.green }}>€{(r.importo || 0).toFixed(2)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: C.textSoft }}>€{(r.iva || 0).toFixed(2)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right' }}>{r.righe || 1}</td>
                        <td style={{ padding: '5px 10px', color: C.textMid, fontSize: 9 }}>{r.fonte}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {importPreview && (
                <button onClick={handleConfirmCassa} style={{ flex: 1, padding: '10px', background: C.green, color: C.white, border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>✓ Importa in Cassa</button>
              )}
              <button onClick={() => { setImportModal(null); setImportPreview(null) }} style={{ padding: '10px 16px', background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 12, cursor: 'pointer' }}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Data chiusura</div>
          <input type="date" value={dataFiltro} onChange={e => { setDataFiltro(e.target.value); setVenduto(null); setPreview(null); setImg(null); setSalvato(false) }}
            style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: 12, color: C.text }}/>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          {sessione ? (
            <div style={{ background: C.greenLight, border: `1px solid ${C.green}25`, borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.green }}>✓ Produzione trovata per questa data</div>
              <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{(sessione.prodotti || []).map(p => `${p.stampi}× ${p.nome}`).join(' · ') || '—'}</div>
            </div>
          ) : (
            <div style={{ background: '#FFF8EE', border: `1px solid ${C.amber}25`, borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.amber }}>⚠ Nessuna produzione registrata per questa data</div>
              <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>Il confronto prodotto/venduto non sarà disponibile, ma i ricavi verranno salvati.</div>
            </div>
          )}
        </div>
        {chiusuraSalvata && (
          <div style={{ background: '#EEF8EE', border: `1px solid ${C.green}30`, borderRadius: 8, padding: '8px 14px', fontSize: 10, fontWeight: 700, color: C.green }}>
            ✓ Chiusura già salvata · {fmt(chiusuraSalvata.kpi.totV)} ricavi
          </div>
        )}
      </div>

      <div style={{ background: '#F8F4F2', border: `2px dashed ${C.borderStr}`, borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>🧾 Foto scontrino di chiusura</div>
          <div style={{ fontSize: 10, color: C.textSoft, marginTop: 2 }}>Claude legge solo la sezione PASTICCERIA · Prodotti non nel ricettario vengono ignorati</div>
        </div>
        {!preview ? (
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '22px', background: C.white, border: `1px dashed ${C.borderStr}`, borderRadius: 10, cursor: 'pointer' }}>
            <span style={{ fontSize: 28 }}>🧾</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.textMid }}>Tocca per fotografare lo scontrino</span>
            <span style={{ fontSize: 10, color: C.textSoft }}>Seleziona più scontrini insieme — ogni data viene letta automaticamente</span>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile}/>
          </label>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ position: 'relative' }}>
              <img src={preview} alt="scontrino" style={{ width: '100%', borderRadius: 10, border: `1px solid ${C.border}`, display: 'block' }}/>
              <button onClick={() => { setPreview(null); setImg(null); setVenduto(null); setSalvato(false); if (inputRef.current) inputRef.current.value = '' }}
                style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>✕</button>
              <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFile}/>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!venduto && !loading && !error && (
                <button onClick={batchMode ? handleAnalizzaBatch : handleAnalizza} style={{ padding: '13px', background: C.red, color: C.white, border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 10px rgba(110,14,26,0.25)' }}>
                  {batchMode ? `📊 Leggi tutti (${batchFiles.length} scontrini)` : '🔍 Leggi scontrino con AI'}
                </button>
              )}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', background: C.white, borderRadius: 9, border: `1px solid ${C.border}` }}>
                  <style>{`@keyframes spinC{to{transform:rotate(360deg)}}`}</style>
                  <div style={{ width: 16, height: 16, border: `2px solid ${C.redLight}`, borderTopColor: C.red, borderRadius: '50%', animation: 'spinC 0.8s linear infinite', flexShrink: 0 }}/>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{batchProgress ? `Scontrino ${batchProgress} in corso…` : 'Lettura scontrino in corso…'}</div>
                </div>
              )}
              {error && (
                <div style={{ padding: '12px', background: C.redLight, borderRadius: 9 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 6 }}>⚠ {error}</div>
                  <button onClick={handleAnalizza} style={{ padding: '6px 14px', background: C.red, color: C.white, border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Riprova</button>
                </div>
              )}
              {venduto && !loading && (
                <div style={{ background: C.white, border: `1px solid ${C.green}30`, borderRadius: 10, padding: '14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 8 }}>✓ {venduto.length} prodotti letti dalla sezione PASTICCERIA</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto', marginBottom: 10 }}>
                    {venduto.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 8px', background: '#F8F4F2', borderRadius: 5 }}>
                        <span style={{ fontWeight: 600, color: C.text }}>{p.qta}× {p.nome}</span>
                        <span style={{ color: C.green, fontWeight: 700 }}>{fmt(p.totale || 0)}</span>
                      </div>
                    ))}
                  </div>
                  {!salvato ? (
                    (confronto.length > 0 || formatiRiconc.righe.length > 0) ? (
                      <button onClick={handleSalva} style={{ width: '100%', padding: '11px', background: C.green, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>💾 Salva chiusura nello storico</button>
                    ) : (
                      <div style={{ fontSize: 10, color: C.amber }}>⚠ Nessun prodotto del ricettario o formato di vendita trovato — verifica i nomi</div>
                    )
                  ) : (
                    <div style={{ padding: '9px 14px', background: C.greenLight, borderRadius: 8, fontSize: 11, fontWeight: 700, color: C.green }}>✓ Chiusura salvata nello storico</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {(confronto.length > 0 || formatiRiconc.righe.length > 0) && (
        <>
          {(() => {
            const matched = new Set([...matchedRecipeNames, ...formatiRiconc.nomiMatchati])
            const nonRic = (venduto || []).filter(v => !matched.has(v.nome))
            if (nonRic.length === 0) return null
            return (
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>
                <b style={{ color: '#92400E' }}>{nonRic.length} prodotto/i non riconosciuti</b> dal ricettario, esclusi dai totali e dal food cost:{' '}
                {nonRic.slice(0, 6).map(p => p.nome).join(' · ')}{nonRic.length > 6 ? ` · +${nonRic.length - 6}` : ''}
              </div>
            )
          })()}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : `repeat(${isDipendente ? 2 : 5},1fr)`, gap: 10, marginBottom: 24 }}>
            <KPI icon="💰" label="Ricavo reale" value={fmt(totV)} highlight/>
            {!isDipendente && <KPI icon="📈" label="Margine" value={fmt(totM)} color={margColor(totMP)} sub={fmtp(totMP)}/>}
            {!isDipendente && <KPI icon="🧾" label="Food cost" value={fmt(totFC)} color={C.red}/>}
            <KPI icon="🎯" label="Sell-through" value={fmtp(avgST)} color={stC(avgST)} sub="% vendute"/>
            {!isDipendente && <KPI icon="🗑" label="Spreco" value={fmt(totS)} color={totS > 5 ? C.red : C.green} sub="FC perso"/>}
          </div>

          {confronto.length > 0 && (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '13px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Produzione vs Venduto · {new Date(dataFiltro + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
              {salvato && <div style={{ fontSize: 10, fontWeight: 700, color: C.green }}>✓ Salvato</div>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    {[
                      'Prodotto', 'Prodotte', 'Vendute', 'Rimaste', 'Sell-T%', 'Ricavo reale',
                      ...(isDipendente ? [] : ['FC venduto', 'Margine', 'Spreco FC']),
                    ].map((h, i) => (
                      <th key={i} style={{ padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confronto.map((r, i) => (
                    <tr key={r.nome} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: C.text }}>
                        {r.nome}
                        {!r.inProd && <span style={{ marginLeft: 5, fontSize: 8, background: C.amberLight, color: C.amber, padding: '1px 5px', borderRadius: 3, fontWeight: 700, whiteSpace: 'nowrap' }}>solo venduto</span>}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: C.textMid }}>{r.inProd ? r.unitaP : '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: C.text }}>{r.unitaV}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: r.unitaR > 0 ? 700 : 400, color: r.unitaR > 0 ? C.amber : C.green }}>
                        {r.inProd ? (r.unitaR > 0 ? `${r.unitaR} ⚠` : '0 ✓') : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                        {r.st !== null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                            <div style={{ width: 34, height: 5, background: '#EEE', borderRadius: 3 }}><div style={{ width: `${Math.min(100, r.st)}%`, height: 5, background: stC(r.st), borderRadius: 3 }}/></div>
                            <span style={{ fontWeight: 700, color: stC(r.st), minWidth: 28, textAlign: 'right' }}>{r.st.toFixed(0)}%</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: C.green, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.rv)}</td>
                      {!isDipendente && <td style={{ padding: '9px 12px', textAlign: 'right', color: C.red }}>{fmt(r.fcV)}</td>}
                      {!isDipendente && <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: margColor(r.rv > 0 ? (r.marg / r.rv * 100) : 0), fontVariantNumeric: 'tabular-nums' }}>{fmt(r.marg)}</td>}
                      {!isDipendente && <td style={{ padding: '9px 12px', textAlign: 'right', color: r.spreco > 2 ? C.red : C.textSoft, fontWeight: r.spreco > 2 ? 700 : 400 }}>{r.spreco > 0.01 ? fmt(r.spreco) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F0EAE6', borderTop: `2px solid ${C.borderStr}` }}>
                    <td colSpan={5} style={{ padding: '9px 12px', fontWeight: 900, color: C.text, fontSize: 12 }}>TOTALE GIORNATA</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 900, color: C.green, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{fmt(totV)}</td>
                    {!isDipendente && <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: C.red }}>{fmt(totFC)}</td>}
                    {!isDipendente && <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 900, color: margColor(totMP), fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{fmt(totM)}</td>}
                    {!isDipendente && <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: totS > 5 ? C.red : C.textSoft }}>{fmt(totS)}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          )}

          {formatiRiconc.righe.length > 0 && (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '13px 20px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Formati di vendita</div>
                <div style={{ fontSize: 10, color: C.textSoft, marginTop: 2 }}>Righe senza dettaglio gusto/ripieno · food cost stimato sulla media della categoria</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#F8F4F2' }}>
                      {['Formato', 'Categoria', 'Vendute', 'Ricavo', ...(isDipendente ? [] : ['FC stimato', 'Margine'])].map((h, i) => (
                        <th key={i} style={{ padding: '9px 12px', textAlign: i <= 1 ? 'left' : 'right', fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {formatiRiconc.righe.map((r, i) => (
                      <tr key={r.formatoId} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: C.text }}>
                          {r.nome}
                          {!r.fcStimato && <span style={{ marginLeft: 5, fontSize: 8, background: C.amberLight, color: C.amber, padding: '1px 5px', borderRadius: 3, fontWeight: 700, whiteSpace: 'nowrap' }}>no gusti in categoria</span>}
                        </td>
                        <td style={{ padding: '9px 12px', color: C.textMid }}>{r.categoria || '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: C.text }}>{r.unitaV}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: C.green, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.rv)}</td>
                        {!isDipendente && <td style={{ padding: '9px 12px', textAlign: 'right', color: C.red }}>{fmt(r.fcV)}</td>}
                        {!isDipendente && <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: margColor(r.rv > 0 ? (r.marg / r.rv * 100) : 0), fontVariantNumeric: 'tabular-nums' }}>{fmt(r.marg)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {driftPerCategoria.some(c => c.st !== null || c.gProdotti > 0) && (() => {
                const driftColor = (pct) => {
                  if (pct == null) return C.textSoft
                  const a = Math.abs(pct)
                  return a < 5 ? C.green : a < 10 ? C.amber : C.red
                }
                return (
                  <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, background: '#FBFAF8' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Riconciliazione per categoria · prodotto − venduto − sprechi − omaggi
                    </div>
                    {driftPerCategoria.filter(c => c.gProdotti > 0 || c.gVenduti > 0).map(c => (
                      <div key={c.categoria} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '120px 1fr auto', gap: 10, fontSize: 11, marginBottom: 6, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: C.text }}>{c.categoria}</span>
                        <span style={{ color: C.textMid }}>
                          prodotto {fmtKg(c.gProdotti)} · venduto {fmtKg(c.gVenduti)}
                          {c.gOmaggio > 0 && <> · omaggi {fmtKg(c.gOmaggio)}</>}
                          {c.gSpreco > 0 && <> · sprechi {fmtKg(c.gSpreco)}</>}
                        </span>
                        <span style={{ fontWeight: 800, color: driftColor(c.driftPct), whiteSpace: 'nowrap' }}>
                          {c.driftPct == null ? '—' : (
                            <>
                              drift {c.drift >= 0 ? '+' : ''}{fmtKg(c.drift)} ({c.driftPct >= 0 ? '+' : ''}{c.driftPct.toFixed(0)}%)
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, fontSize: 10, color: C.textSoft, lineHeight: 1.6 }}>
                      Drift positivo: hai consumato piu' del teorico (mano abbondante o residui non gestiti).
                      Drift negativo: hai consumato meno (mano stretta o vendite non scontrinate).
                      |drift| &lt; 5% = ok · 5-10% = da monitorare · &gt; 10% = da approfondire.
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {!isDipendente && confronto.filter(r => r.spreco > 2).length > 0 && (
            <div style={{ background: '#FFF8EE', border: `1px solid ${C.amber}30`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 10 }}>💡 Ottimizza la produzione di domani</div>
              {confronto.filter(r => r.spreco > 2).map(r => (
                <div key={r.nome} style={{ fontSize: 11, color: C.amber, lineHeight: 1.9 }}>
                  <b>{r.nome}</b>: rimaste {r.unitaR} {r.reg?.tipo === 'fetta' ? 'fette' : 'pezzi'} · spreco {fmt(r.spreco)} · considera <b>{Math.ceil(r.unitaV / r.reg.unita)} stampi</b> invece di {r.stampiP}
                </div>
              ))}
            </div>
          )}

          {confronto.length > 0 && (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 16 }}>Sell-through per prodotto</div>
            {confronto.filter(r => r.st !== null).sort((a, b) => b.st - a.st).map(r => (
              <div key={r.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 160, fontSize: 11, fontWeight: 600, color: C.text, flexShrink: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nome}</div>
                <div style={{ flex: 1, height: 20, background: '#F0EAE6', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: 20, width: `${Math.min(100, r.st)}%`, background: stC(r.st), borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 7, minWidth: r.st > 8 ? 32 : 0 }}>
                    {r.st > 8 && <span style={{ fontSize: 10, fontWeight: 800, color: C.white }}>{r.st.toFixed(0)}%</span>}
                  </div>
                </div>
                <div style={{ width: 100, textAlign: 'right', fontSize: 11 }}>
                  <span style={{ fontWeight: 700, color: C.text }}>{r.unitaV}</span>
                  <span style={{ color: C.textSoft }}>{r.inProd ? ` / ${r.unitaP}` : ''}</span>
                  <span style={{ color: C.green, fontWeight: 700, marginLeft: 5 }}>{fmt(r.rv)}</span>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14, display: 'flex', gap: 14, fontSize: 10, color: C.textSoft, flexWrap: 'wrap' }}>
              {[[C.green, '>=85% ottimo'], [C.amber, '65-84% buono'], [C.red, '<65% ottimizzare']].map(([c, l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: c, display: 'inline-block' }}/>{l}</span>
              ))}
            </div>
          </div>
          )}
        </>
      )}

      {venduto && confronto.length === 0 && formatiRiconc.righe.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '36px', background: C.bgCard, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Nessun prodotto del ricettario trovato</div>
          <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 8 }}>I nomi sullo scontrino non corrispondono alle ricette. Se la cassa batte prodotti generici (cono, vaschetta, panino…), configura i <b>Formati di vendita</b>.</div>
          <div style={{ fontSize: 10, color: C.textSoft }}>Letti: {venduto.map(p => p.nome).join(', ')}</div>
        </div>
      )}
    </div>
  )
}
