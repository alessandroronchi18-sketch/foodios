// ProduzioneGiornalieraView — Registrazione produzione giornaliera. Estratta da Dashboard.jsx.
// Scala il magazzino, carica stock PF, gestisce trasferimenti auto verso altre sedi,
// OCR foto appunto produzione. Richiede orgId/sedeId per persistenza e stock.

import React, { useEffect, useMemo, useState } from 'react'
import { ssave as _ssave, ssaveBatch as _ssaveBatch } from '../lib/storage'
import { supabase } from '../lib/supabase'
import useIsMobile from '../lib/useIsMobile'
import { color as T, motion as M } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR, isRicettaValida, normIng, translateProdottoEN } from '../lib/foodcost'
import { caricoProduzionePF, scartoPF } from '../lib/stockPF'
import { creaTrasferimento } from '../lib/trasferimenti'
import { SK_GIOR, SK_MAG } from '../lib/storageKeys'
import { exportProduzione } from '../lib/exportPDF'
import { gateExport, getExportCtx } from '../lib/exportGuard'
import { todayLocal } from '../lib/dateLocal'
import { lessico } from '../lib/lessico'
import FotoOCR from '../components/FotoOCR'
import Icon from '../components/Icon'
import { C, TNUM, margColor, fmt, fmt0, fmtp, KPI, PageHeader } from './_shared'

// Ombra premium coerente con la Dashboard home.
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// Quando un movimento stock PF resta orfano (carico riuscito ma trasferimento
// E scarto di rollback entrambi falliti), salviamo un record da reconcile a
// mano. Best-effort: se anche questa fallisce, console.error e basta.
async function registraStockOrfano({ sedeId, prodotto, pezzi, motivo }) {
  try {
    await supabase.from('error_log').insert({
      endpoint: 'produzione-giornaliera',
      operation: 'stock_pf_orphan',
      code: 'STOCK_PF_ORPHAN',
      message: `sede=${sedeId} prodotto=${prodotto} pezzi=${pezzi} motivo=${motivo || 'n/a'}`,
    })
  } catch (e) {
    console.error('registraStockOrfano insert failed', e?.message)
  }
}

// Titolo di pannello con chip icona (gerarchia premium come la Dashboard home).
function PanelHead({ icon, title, color = C.red }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: `${color}14`, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>{title}</div>
    </div>
  )
}

// Chip dei prodotti di una sessione: ordinati per pezzi prodotti (desc) e, quando
// sono tanti (es. 50), mostra solo i primi N + un chip "+X altri" che al passaggio
// del mouse (o al tap) espande l'elenco completo. Evita righe di chip infinite.
const CHIP_PROD = { background: '#F8F4F2', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 700, color: C.textMid, whiteSpace: 'nowrap' }
function ProdottiChips({ prodotti }) {
  const [aperto, setAperto] = useState(false)
  const LIMITE = 12
  const ordinati = [...(prodotti || [])].sort((a, b) => (b.stampi || 0) - (a.stampi || 0))
  const visibili = aperto ? ordinati : ordinati.slice(0, LIMITE)
  const nascosti = ordinati.length - visibili.length
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {visibili.map(p => <span key={p.nome} style={CHIP_PROD}>{p.stampi}× {p.nome}</span>)}
      {!aperto && nascosti > 0 && (
        <span role="button" tabIndex={0} onMouseEnter={() => setAperto(true)} onClick={() => setAperto(true)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAperto(true) } }}
          title="Passa il mouse per vedere tutti i prodotti"
          style={{ ...CHIP_PROD, cursor: 'pointer', background: C.redLight, borderColor: C.red, color: C.red }}>
          +{nascosti} altri
        </span>
      )}
      {aperto && ordinati.length > LIMITE && (
        <span role="button" tabIndex={0} onClick={() => setAperto(false)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAperto(false) } }}
          style={{ ...CHIP_PROD, cursor: 'pointer', color: C.textSoft }}>↑ comprimi</span>
      )}
    </div>
  )
}

export default function ProduzioneGiornalieraView({ ricettario, magazzino, setMagazzino, giornaliero, setGiornaliero, notify, sedi = [], sedeAttiva = null, orgId, sedeId, isDipendente = false, LEX = lessico() }) {
  const isMobile = useIsMobile()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const ricette = Object.values(ricettario?.ricette || {}).filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato')
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it')) // lista prodotti in ordine alfabetico
  const ssave = (key, val) => _ssave(key, val, orgId, sedeId)
  // Scrittura atomica di più chiavi insieme (magazzino + giornaliero): o entrambe o nessuna.
  const ssaveBatch = (items) => _ssaveBatch(items, orgId, sedeId)

  const [tab, setTab] = useState('nuova')
  const [deleteSessConf, setDeleteSessConf] = useState(null)
  const [deleteSessPin, setDeleteSessPin] = useState('')
  const [deletingSess, setDeletingSess] = useState(false)
  // Modifica sessione storico: id sessione in edit, righe editate, step conferma.
  const [editSessId, setEditSessId] = useState(null)
  const [editRows, setEditRows] = useState({})     // { nome: { stampi, vendibile } }
  const [editConfirm, setEditConfirm] = useState(false) // doppia conferma
  const [savingEdit, setSavingEdit] = useState(false)

  function apriModificaSessione(sess) {
    const rows = {}
    for (const p of (sess.prodotti || [])) rows[p.nome] = { stampi: p.stampi ?? 0, vendibile: p.vendibile ?? p.stampi ?? 0 }
    setEditRows(rows); setEditSessId(sess.id); setEditConfirm(false)
    setDeleteSessConf(null)
  }
  function annullaModifica() { setEditSessId(null); setEditRows({}); setEditConfirm(false) }

  // Calcola ingredienti/fc/ricavo per una lista prodotti (stesso motore della conferma).
  const computeSessione = (prodotti) => {
    const ings = {}; let fcTot = 0, ricavoTot = 0
    for (const p of prodotti) {
      const ric = ricettario?.ricette?.[p.nome] || ricettario?.ricette?.[(p.nome || '').toUpperCase().trim()]
      if (!ric) continue
      const reg = getR(p.nome, ric)
      const q = Number(p.stampi) || 0, qv = Number(p.vendibile) || q
      ricavoTot += qv * (Number(reg.unita) || 0) * (Number(reg.prezzo) || 0)
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      fcTot += q * fc
      for (const ing of (ric.ingredienti || [])) { const k = normIng(ing.nome); ings[k] = (ings[k] || 0) + ing.qty1stampo * q }
    }
    return { ings, fcTot, ricavoTot }
  }

  // Salva le modifiche a una sessione: ripristina gli effetti vecchi e applica i
  // nuovi (magazzino + stock PF), con SAVE FIRST. Doppia conferma a monte.
  const salvaModificheSessione = async (sess) => {
    if (savingEdit) return
    setSavingEdit(true)
    const nuoviProdotti = (sess.prodotti || [])
      .map(p => { const e = editRows[p.nome] || {}; return { ...p, stampi: Number(e.stampi) || 0, vendibile: Number(e.vendibile) || 0 } })
      .filter(p => p.stampi > 0 || p.vendibile > 0)
    const agg = computeSessione(nuoviProdotti)
    const oldIngs = sess.ingredientiUsati || {}
    // magazzino: parti dall'attuale, ri-aggiungi i vecchi ingredienti, sottrai i nuovi.
    const nm = { ...(magazzino || {}) }
    const keys = new Set([...Object.keys(oldIngs), ...Object.keys(agg.ings)])
    for (const k of keys) {
      const delta = (oldIngs[k] || 0) - (agg.ings[k] || 0) // >0 = restituito, <0 = consumato
      const base = nm[k]?.giacenza_g || 0
      nm[k] = nm[k] ? { ...nm[k], giacenza_g: Math.max(0, base + delta) } : { nome: k, giacenza_g: Math.max(0, delta), soglia_g: 0, ultimoRifornimento: null }
    }
    const nuovaSess = { ...sess, prodotti: nuoviProdotti, ingredientiUsati: agg.ings, fcTot: agg.fcTot, ricavoTot: agg.ricavoTot }
    const ng = (giornaliero || []).map(s => s.id === sess.id ? nuovaSess : s)

    try {
      await ssaveBatch([{ key: SK_GIOR, value: ng }, { key: SK_MAG, value: nm }])
    } catch (e) {
      setSavingEdit(false)
      notify(`Impossibile salvare le modifiche: ${e.message || 'errore di rete'}. Riprova.`, false)
      return
    }

    // Stock PF: applica il delta dei pezzi vendibili per prodotto.
    const sedeProduttiva = sedeAttiva?.id
    const destDiversa = sess.destinazioneSedeId && sess.destinazioneSedeId !== sedeProduttiva
    const stockErrors = []
    if (orgId && sedeProduttiva && !destDiversa) {
      const oldVend = {}; for (const p of (sess.prodotti || [])) oldVend[p.nome] = Number(p.vendibile || 0) || Number(p.stampi || 0)
      const newVend = {}; for (const p of nuoviProdotti) newVend[p.nome] = Number(p.vendibile || 0) || Number(p.stampi || 0)
      const allNomi = new Set([...Object.keys(oldVend), ...Object.keys(newVend)])
      for (const nome of allNomi) {
        const ric = ricettario?.ricette?.[nome] || ricettario?.ricette?.[(nome || '').toUpperCase().trim()]
        const reg = ric ? getR(nome, ric) : null
        const uf = Number(reg?.unita); const factor = Number.isFinite(uf) && uf > 0 ? uf : 1
        const deltaPezzi = ((newVend[nome] || 0) - (oldVend[nome] || 0)) * factor
        if (Math.abs(deltaPezzi) < 0.0001) continue
        const prodottoKey = (nome || '').toUpperCase().trim()
        try {
          if (deltaPezzi > 0) await caricoProduzionePF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: deltaPezzi, unita: 'pz', note: `Modifica sessione del ${sess.data}` })
          else await scartoPF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: -deltaPezzi, note: `Modifica sessione del ${sess.data}` })
        } catch (e) { stockErrors.push(`${nome}: ${e.message}`) }
      }
    }

    setGiornaliero(ng); setMagazzino(nm)
    annullaModifica(); setSavingEdit(false)
    if (destDiversa) notify('Sessione modificata. Stock prodotti finiti NON ritoccato (destinazione altra sede).', false)
    else if (stockErrors.length > 0) notify(`Sessione modificata ma alcuni stock non aggiornati: ${stockErrors.slice(0,3).map(s=>s.split(':')[0]).join(', ')}. Controlla Magazzino → Prodotti finiti.`, false)
    else notify('Sessione modificata — magazzino e vetrina aggiornati')
  }

  // Elimina sessione produzione:
  // 1. Calcola magazzino post-reintegro ingredienti
  // 2. Salva PRIMA su server (ssave) — se fallisce, abort senza toccare state
  // 3. Stock prodotti finiti: scarta i pezzi della sessione (causale 'scarto').
  //    Eccezione: se la sessione era con destinazione altra sede, il transfer
  //    ha gia' mosso lo stock — non lo ritocchiamo, avvisiamo l'utente.
  // 4. Aggiorna state locale solo dopo conferma server
  const handleDeleteSessione = async (sess) => {
    if (deleteSessPin !== 'ELIMINA' || deletingSess) return
    setDeletingSess(true)

    const ng = (giornaliero || []).filter(s => s.id !== sess.id)
    let nm = null
    if (sess.ingredientiUsati && Object.keys(sess.ingredientiUsati).length > 0) {
      nm = { ...magazzino }
      for (const [k, qty] of Object.entries(sess.ingredientiUsati)) {
        if (nm[k]) nm[k] = { ...nm[k], giacenza_g: (nm[k].giacenza_g || 0) + qty }
        else nm[k] = { nome: k, giacenza_g: qty, soglia_g: 0, ultimoRifornimento: null }
      }
    }

    // SAVE FIRST: se fallisce, niente state mutation -> niente dati persi.
    try {
      await ssaveBatch(nm ? [{ key: SK_GIOR, value: ng }, { key: SK_MAG, value: nm }] : [{ key: SK_GIOR, value: ng }])
    } catch (e) {
      setDeletingSess(false)
      notify(`Impossibile eliminare la sessione: ${e.message || 'errore di rete'}. Riprova.`, false)
      return
    }

    // Stock prodotti finiti: scarta i pezzi. Per destinazione altra sede,
    // tentiamo anche l'annullo del trasferimento ricevente (audit 2026-06-17
    // HIGH: prima si lasciava lo stock destinato in vetrina dell'altra sede,
    // creando doppio conteggio).
    const sedeProduttiva = sedeAttiva?.id
    const destDiversa = sess.destinazioneSedeId && sess.destinazioneSedeId !== sedeProduttiva
    const scartoErrors = []
    // Sede target dello scarto: produttiva se no destinazione, altrimenti la
    // sede di destinazione (è lei che ha lo stock dal trasferimento).
    const sedeScarto = destDiversa ? sess.destinazioneSedeId : sedeProduttiva
    if (orgId && sedeScarto) {
      for (const p of (sess.prodotti || [])) {
        const vendibile = Number(p.vendibile || 0) || Number(p.stampi || 0)
        if (vendibile <= 0) continue
        const ric = ricettario?.ricette?.[p.nome] || ricettario?.ricette?.[(p.nome || '').toUpperCase().trim()]
        const reg = ric ? getR(p.nome, ric) : null
        const unitaFactor = Number(reg?.unita)
        const pezzi = vendibile * (Number.isFinite(unitaFactor) && unitaFactor > 0 ? unitaFactor : 1)
        if (pezzi <= 0) continue
        const prodottoKey = (p.nome || '').toUpperCase().trim()
        try {
          await scartoPF({ sedeId: sedeScarto, prodotto: prodottoKey, quantita: pezzi, note: `Annullo sessione del ${sess.data}${destDiversa ? ' (trasferimento annullato)' : ''}` })
        } catch (e) { scartoErrors.push(`${p.nome}: ${e.message}`) }
      }
    }

    // Apply state mutations
    setGiornaliero(ng)
    if (nm) setMagazzino(nm)
    setDeleteSessConf(null); setDeleteSessPin(''); setDeletingSess(false)

    const baseMsg = 'Sessione eliminata — ingredienti restituiti al magazzino'
    if (destDiversa && scartoErrors.length === 0) {
      notify(`${baseMsg}, e stock annullato anche sulla sede destinazione del trasferimento.`)
    } else if (scartoErrors.length > 0) {
      // Ghost stock: il giornaliero è aggiornato (su Supabase + locale) ma alcuni
      // pezzi sono ancora in stock_prodotti_finiti. L'utente deve correggere
      // manualmente dal pannello Magazzino → tab Prodotti finiti, altrimenti
      // le vendite future scaricheranno da uno stock fantasma.
      notify(
        `Sessione eliminata e magazzino aggiornato MA alcuni prodotti finiti non sono stati scaricati dalla vetrina: ${scartoErrors.slice(0, 3).map(s => s.split(':')[0]).join(', ')}. Vai in Magazzino → Prodotti finiti per correggere a mano.`,
        false,
      )
    } else {
      notify(`${baseMsg} e stock vetrina aggiornato`)
    }
  }

  const [data, setData] = useState(todayLocal())
  const [qtaMap, setQtaMap] = useState({})
  const [vendibileMap, setVendMap] = useState({})
  const [sessNote, setSessNote] = useState('')
  const [prodottiNonRicettario, setProdottiNonRicettario] = useState([])
  // Inizializzato a null (non ''): tutti i check downstream sono ` && val`,
  // quindi gestiscono entrambi i casi, ma null e' la rappresentazione canonica
  // di "nessuna destinazione" e ssave persiste null in `sess.destinazioneSedeId`.
  const [destinazioneSedeId, setDestinazioneSedeId] = useState(null)
  const [confermando, setConfermando] = useState(false)
  const [salvando, setSalvando] = useState(false)  // distinto da `confermando` (UI conferma) per evitare double-submit

  // Escape chiude la modal di delete se aperta (a meno che sia in corso una
  // operazione che non possiamo annullare a meta').
  useEffect(() => {
    if (!deleteSessConf) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !deletingSess) {
        setDeleteSessConf(null); setDeleteSessPin('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSessConf, deletingSess])

  const sediAttive = (sedi || []).filter(s => s.attiva !== false)
  const haPiuSedi = sediAttive.length > 1
  const sediMapProd = Object.fromEntries(sediAttive.map(s => [s.id, s]))

  const CONGELABILI_DEFAULT = ['BANANA BREAD', 'TORTA DI CAROTE', 'COOKIES', 'CARROT CAKE']
  const isCongelabile = (nome) => {
    const norm = (nome || '').toString().toUpperCase().trim()
    const r = ricettario?.ricette?.[norm] || ricettario?.ricette?.[nome]
    if (r && typeof r.congelabile === 'boolean') return r.congelabile
    return CONGELABILI_DEFAULT.some(c => norm.includes(c))
  }

  // Audit 2026-07-01 MEDIUM: parseFloat('1,5') tronca a 1 (locale IT).
  const parseIT = (val) => parseFloat(String(val).replace(',', '.')) || 0
  const setQ = (nome, val) => {
    const n = parseIT(val)
    setQtaMap(m => ({ ...m, [nome]: n }))
    if (!isCongelabile(nome)) setVendMap(m => ({ ...m, [nome]: n }))
  }
  const setV = (nome, val) => setVendMap(m => ({ ...m, [nome]: parseIT(val) }))

  const riepilogo = useMemo(() => {
    const ings = {}
    let fcTot = 0, ricavoTot = 0, stampiTot = 0, nProdotti = 0
    for (const ric of ricette) {
      const q = qtaMap[ric.nome] || 0
      const qv = vendibileMap[ric.nome] || q
      if (!q && !qv) continue
      nProdotti++
      stampiTot += q
      const reg = getR(ric.nome, ric)
      ricavoTot += qv * (Number(reg.unita) || 0) * (Number(reg.prezzo) || 0)
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      fcTot += q * fc
      for (const ing of (ric.ingredienti || [])) {
        const k = normIng(ing.nome)
        ings[k] = (ings[k] || 0) + ing.qty1stampo * q
      }
    }
    return { ings, fcTot, ricavoTot, stampiTot, nProdotti }
  }, [qtaMap, vendibileMap, ricette, ingCosti, ricettario])

  const problemi = useMemo(() => {
    return Object.entries(riepilogo.ings).filter(([k, qty]) => {
      const giac = magazzino?.[k]?.giacenza_g || 0
      return giac < qty
    }).map(([k, qty]) => ({ nome: k, richiesto: qty, disponibile: magazzino?.[k]?.giacenza_g || 0 }))
  }, [riepilogo, magazzino])

  const hasQta = Object.values(qtaMap).some(v => v > 0) || Object.values(vendibileMap).some(v => v > 0)

  // Conferma sessione produzione:
  // 1. Calcola magazzino e sessione nuovi
  // 2. SAVE FIRST: ssave SK_MAG + SK_GIOR. Se fallisce, abort senza state mutation
  //    (evita data loss: l'UI non mostra "salvato" se in realta' non lo e').
  // 3. Aggiorna state locale
  // 4. RPC stock_pf (carico produzione + eventuale trasferimento auto). Errori
  //    qui sono notificati ma non bloccano: la sessione e' gia' salvata.
  // Stock PF (carico vetrina + eventuale trasferimento) — condiviso tra il flusso
  // titolare e quello dipendente. Usa solo nome/vendibile (niente ingredienti).
  // Variante: SOLO trasferimento (no carico). Usata dal flusso dipendente,
  // dove il server ha già fatto il carico stock PF in produzione-registra.
  const eseguiTrasferimentoAuto = async () => {
    const sedeProduttiva = sedeAttiva?.id
    if (!orgId || !sedeProduttiva) return
    const sedeDest = destinazioneSedeId && destinazioneSedeId !== sedeProduttiva ? destinazioneSedeId : null
    if (!sedeDest) return
    const errors = []
    for (const r of ricette) {
      const stampi = qtaMap[r.nome] || 0
      const vendibile = vendibileMap[r.nome] || stampi
      if (vendibile <= 0) continue
      const reg = getR(r.nome, r)
      const unitaFactor = Number(reg.unita)
      const pezzi = vendibile * (Number.isFinite(unitaFactor) && unitaFactor > 0 ? unitaFactor : 1)
      if (pezzi <= 0) continue
      const prodottoKey = r.nome.toUpperCase().trim()
      try {
        await creaTrasferimento({ orgId, sedeDa: sedeProduttiva, sedeA: sedeDest, tipo: 'prodotto', prodotto: prodottoKey, quantita: pezzi, unita: 'pz', note: `Da produzione del ${data}`, autoInvia: true })
      } catch (e) {
        errors.push(`${r.nome}: ${e.message}`)
      }
    }
    if (errors.length) notify('Alcuni trasferimenti falliti: ' + errors.slice(0, 2).join('; '), false)
  }

  const eseguiStockPF = async () => {
    const sedeProduttiva = sedeAttiva?.id
    if (!orgId || !sedeProduttiva) return
    const sedeDest = destinazioneSedeId && destinazioneSedeId !== sedeProduttiva ? destinazioneSedeId : null
    const stockErrors = [], transferErrors = []
    // Tracking carichi riusciti per registrare orfani in caso di rollback fallito.
    const caricati = []
    for (const r of ricette) {
      const stampi = qtaMap[r.nome] || 0
      const vendibile = vendibileMap[r.nome] || stampi
      if (vendibile <= 0) continue
      const reg = getR(r.nome, r)
      const unitaFactor = Number(reg.unita)
      const pezzi = vendibile * (Number.isFinite(unitaFactor) && unitaFactor > 0 ? unitaFactor : 1)
      if (pezzi <= 0) continue
      const prodottoKey = r.nome.toUpperCase().trim()
      try {
        await caricoProduzionePF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: pezzi, unita: 'pz', note: `Sessione ${data}${sessNote ? ' · ' + sessNote : ''}` })
        caricati.push({ prodotto: prodottoKey, pezzi })
      } catch (e) { stockErrors.push(`${r.nome}: ${e.message}`); continue }
      if (sedeDest) {
        try {
          await creaTrasferimento({ orgId, sedeDa: sedeProduttiva, sedeA: sedeDest, tipo: 'prodotto', prodotto: prodottoKey, quantita: pezzi, unita: 'pz', note: `Da produzione del ${data}`, autoInvia: true })
        } catch (e) {
          transferErrors.push(`${r.nome}: ${e.message}`)
          try {
            await scartoPF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: pezzi, note: 'Rollback trasferimento fallito' })
          } catch (rb) {
            // Audit 2026-06-17 CRITICAL: se anche scartoPF fallisce, ghost stock
            // permanente. Salviamo l'orfano in tabella per recupero manuale.
            await registraStockOrfano({ sedeId: sedeProduttiva, prodotto: prodottoKey, pezzi, motivo: `rollback trasferimento fallito + scarto fallito: ${rb?.message || rb}` })
          }
        }
      }
    }
    if (stockErrors.length || transferErrors.length) {
      notify('Alcuni movimenti stock falliti: ' + [...stockErrors, ...transferErrors].slice(0, 2).join('; '), false)
    }
  }

  const handleConferma = async () => {
    if (!hasQta || salvando) return
    setSalvando(true)

    // DIPENDENTE: niente ingredienti lato client → lo scarico magazzino e la
    // scrittura del giornaliero li fa il server (api/produzione-registra), che
    // restituisce dati SANITIZZATI (senza composizione/costi). Lo stock PF resta
    // qui (non richiede gli ingredienti). Save-first garantito dal server.
    if (isDipendente) {
      const prodottiPayload = ricette
        .filter(r => (qtaMap[r.nome] || 0) > 0 || (vendibileMap[r.nome] || 0) > 0)
        .map(r => ({ nome: r.nome, stampi: qtaMap[r.nome] || 0, vendibile: vendibileMap[r.nome] || qtaMap[r.nome] || 0, congelabile: isCongelabile(r.nome) }))
      let resp
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/produzione-registra', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({
            sedeId, data, prodotti: prodottiPayload, note: sessNote,
            destinazioneSedeId: destinazioneSedeId || null,
            destinazioneSedeNome: destinazioneSedeId ? (sediMapProd[destinazioneSedeId]?.nome || null) : null,
          }),
        })
        resp = await res.json().catch(() => null)
        if (!res.ok || !resp?.ok) throw new Error(resp?.error || `errore server (${res.status})`)
      } catch (e) {
        setSalvando(false)
        notify(`Salvataggio fallito: ${e.message || 'errore di rete'}. I dati non sono stati persi, riprova.`, false)
        return
      }
      setMagazzino(resp.magazzino); setGiornaliero(resp.giornaliero)
      // Stock PF: il server fa già il carico vetrina. Qui gestiamo SOLO l'eventuale
      // trasferimento auto verso un'altra sede (è un'operazione cross-sede che il
      // server attualmente non esegue lato dipendente).
      if (destinazioneSedeId && destinazioneSedeId !== sedeAttiva?.id) {
        await eseguiTrasferimentoAuto()
      }
      const orfani = Array.isArray(resp.stockOrfani) ? resp.stockOrfani : []
      setQtaMap({}); setVendMap({}); setSessNote(''); setConfermando(false); setSalvando(false)
      const msgDest = destinazioneSedeId && destinazioneSedeId !== sedeAttiva?.id ? ` — trasferimento inviato a ${sediMapProd[destinazioneSedeId]?.nome || 'destinazione'}` : ''
      if (orfani.length > 0) {
        notify(`Produzione registrata${msgDest}, ma ${orfani.length} prodotti non hanno aggiornato lo stock vetrina (riconciliare a mano)`, false)
      } else {
        notify(`Produzione registrata${msgDest} — magazzino e stock vetrina aggiornati`)
      }
      return
    }

    const nm = { ...(magazzino || {}) }
    for (const [k, qty] of Object.entries(riepilogo.ings)) {
      if (nm[k]) nm[k] = { ...nm[k], giacenza_g: Math.max(0, (nm[k].giacenza_g || 0) - qty) }
    }
    const sess = {
      id: `g-${Date.now()}`, data,
      prodotti: ricette.filter(r => (qtaMap[r.nome] || 0) > 0 || (vendibileMap[r.nome] || 0) > 0).map(r => ({
        nome: r.nome, stampi: qtaMap[r.nome] || 0, vendibile: vendibileMap[r.nome] || qtaMap[r.nome] || 0, congelabile: isCongelabile(r.nome),
      })),
      note: sessNote, ingredientiUsati: riepilogo.ings, fcTot: riepilogo.fcTot, ricavoTot: riepilogo.ricavoTot,
      destinazioneSedeId: destinazioneSedeId || null,
      destinazioneSedeNome: destinazioneSedeId ? (sediMapProd[destinazioneSedeId]?.nome || null) : null,
    }
    const ng = [sess, ...(giornaliero || [])]

    // SAVE FIRST: se ssave fallisce -> niente state mutation, niente reset form.
    try {
      await ssaveBatch([{ key: SK_MAG, value: nm }, { key: SK_GIOR, value: ng }])
    } catch (e) {
      setSalvando(false)
      notify(`Salvataggio fallito: ${e.message || 'errore di rete'}. I dati non sono stati persi, riprova.`, false)
      return
    }

    // State mutations
    setMagazzino(nm); setGiornaliero(ng)

    // Stock prodotti finiti via RPC (best-effort: errori notificati ma non bloccanti)
    const sedeProduttiva = sedeAttiva?.id
    if (orgId && sedeProduttiva) {
      const stockErrors = []
      const transferErrors = []
      const sedeDest = destinazioneSedeId && destinazioneSedeId !== sedeProduttiva ? destinazioneSedeId : null
      for (const r of ricette) {
        const stampi = qtaMap[r.nome] || 0
        const vendibile = vendibileMap[r.nome] || stampi
        if (vendibile <= 0) continue
        const reg = getR(r.nome, r)
        const unitaFactor = Number(reg.unita)
        const pezzi = vendibile * (Number.isFinite(unitaFactor) && unitaFactor > 0 ? unitaFactor : 1)
        if (pezzi <= 0) continue
        const prodottoKey = r.nome.toUpperCase().trim()
        try {
          await caricoProduzionePF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: pezzi, unita: 'pz', note: `Sessione ${data}${sess.note ? ' · ' + sess.note : ''}` })
        } catch (e) { stockErrors.push(`${r.nome}: ${e.message}`); continue }
        if (sedeDest) {
          try {
            await creaTrasferimento({ orgId, sedeDa: sedeProduttiva, sedeA: sedeDest, tipo: 'prodotto', prodotto: prodottoKey, quantita: pezzi, unita: 'pz', note: `Da produzione del ${data}`, autoInvia: true })
          } catch (e) {
            transferErrors.push(`${r.nome}: ${e.message}`)
            try {
              await scartoPF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: pezzi, note: 'Rollback trasferimento fallito' })
            } catch (rb) { console.error('Rollback carico fallito:', rb) }
          }
        }
      }
      if (stockErrors.length || transferErrors.length) {
        notify('Alcuni movimenti stock falliti: ' + [...stockErrors, ...transferErrors].slice(0, 2).join('; '), false)
      }
    }

    setQtaMap({}); setVendMap({}); setSessNote(''); setConfermando(false); setSalvando(false)
    const msgDest = destinazioneSedeId && destinazioneSedeId !== sedeAttiva?.id ? ` — trasferimento inviato a ${sediMapProd[destinazioneSedeId]?.nome || 'destinazione'}` : ''
    notify(`Produzione registrata${msgDest} — magazzino e stock vetrina aggiornati`)
    setTab('storico')
  }

  const fmtG = g => g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
  const margPct = riepilogo.ricavoTot > 0 ? ((riepilogo.ricavoTot - riepilogo.fcTot) / riepilogo.ricavoTot * 100) : 0

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHeader
        subtitle={`${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} · Il magazzino si aggiorna automaticamente`}
        action={(giornaliero || []).length > 0 && (
          <button onClick={() => {
            const sess = (giornaliero || [])[0]
            // Le sessioni sono salvate con un array `prodotti` [{nome, stampi, ...}],
            // non con una mappa `qtaMap` (che non viene mai persistita) → senza questo
            // l'export PDF produceva sempre un documento vuoto.
            const items = (sess?.prodotti || []).flatMap(p => {
              const qty = p.stampi || 0
              const r = ricettario?.ricette?.[p.nome] || ricettario?.ricette?.[(p.nome || '').toUpperCase()]
              const { tot: fcR } = r ? calcolaFC(r, ingCosti, ricettario) : { tot: 0 }
              return qty > 0 ? [{ nome: p.nome, quantita: qty, unita: 'stampi', costo: fcR, categoria: r?.categoria || 'Altro' }] : []
            })
            const c = getExportCtx()
            gateExport('produzione', { data: sess?.data }, window.__foodos_notify).then(ok => { if (ok) exportProduzione(items, sess?.data, c.nomeAttivita, c.email) })
          }}
            style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgCard, fontSize: 12, fontWeight: 600, color: C.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            PDF
          </button>
        )}
      />

      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: `1px solid ${T.border}` }}>
        {/* Il dipendente vede solo "Nuova sessione" (oggi): niente storico giorni passati. */}
        {(isDipendente ? [['nuova', 'Nuova sessione']] : [['nuova', 'Nuova sessione'], ['storico', 'Storico']]).map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === id ? 600 : 500, color: tab === id ? T.text : T.textSoft,
              borderBottom: tab === id ? `2px solid ${T.brand}` : '2px solid transparent', marginBottom: -1,
              transition: `color ${M.durFast} ${M.ease}` }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'nuova' && (
        <div>
          <FotoOCR mode="produzione" notify={notify} ricettario={ricettario} onResult={res => {
            const nuovaMap = { ...qtaMap }
            const ignorati = []
            let importati = 0
            for (const p of (res.prodotti || [])) {
              const nomeIT = translateProdottoEN(p.nome || '')
              const match = ricette.find(r => {
                const rn = r.nome.toUpperCase(); const pn = nomeIT.toUpperCase()
                return rn === pn || rn.includes(pn) || pn.includes(rn)
              })
              if (!match) { ignorati.push({ nome: nomeIT, stampi: p.stampi || 0 }); continue }
              nuovaMap[match.nome] = (nuovaMap[match.nome] || 0) + (p.stampi || 0)
              importati++
            }
            setQtaMap(nuovaMap)
            setProdottiNonRicettario(ignorati)
            if (ignorati.length > 0) notify(`${importati} prodotti importati · ${ignorati.length} non riconosciuti (ignorati nei calcoli)`)
            else notify(`Importati ${importati} prodotti — controlla i valori`)
          }}/>

          {prodottiNonRicettario && prodottiNonRicettario.length > 0 && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flexShrink: 0, marginTop: 1, color: '#92400E' }}><Icon name="warning" size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#92400E', fontSize: 12, marginBottom: 4 }}>
                  {prodottiNonRicettario.length} prodotto/i non riconosciuti dal ricettario — ignorati nei calcoli
                </div>
                <div style={{ fontSize: 11, color: '#78350F', lineHeight: 1.55 }}>Per includerli, aggiungi prima la ricetta. Lista solo informativa:</div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {prodottiNonRicettario.map((p, i) => (
                    <span key={i} style={{ background: '#FFF', border: '1px solid #FCD34D', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#78350F' }}>
                      {p.nome}{p.stampi ? ` · ${p.stampi}` : ''}
                    </span>
                  ))}
                </div>
                <button onClick={() => setProdottiNonRicettario([])} style={{ marginTop: 8, background: 'none', border: 'none', color: '#92400E', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Nascondi</button>
              </div>
            </div>
          )}

          {/* Banda diagnosi LIVE: si aggiorna mentre aggiungi prodotti. */}
          {!isDipendente && (() => {
            const margine = riepilogo.ricavoTot - riepilogo.fcTot
            const mc = hasQta ? margColor(margPct) : C.textSoft
            const semaforo = !hasQta ? 'Inizia ad aggiungere i prodotti di oggi'
              : margPct >= 60 ? 'Margine sano' : margPct >= 40 ? 'Margine da tenere d’occhio' : 'Margine basso — rivedi i prezzi'
            return (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 14 }}>
                <KPI icon={<Icon name="package" size={18} />} label="Stampi totali"
                  value={riepilogo.stampiTot.toLocaleString('it-IT')}
                  sub={riepilogo.nProdotti ? `${riepilogo.nProdotti} prodotti in sessione` : 'nessun prodotto'} />
                <KPI icon={<Icon name="money" size={18} />} label="Ricavo potenziale"
                  value={fmt0(riepilogo.ricavoTot)} color={C.green}
                  sub="se vendi tutto il banco" />
                <KPI icon={<Icon name="receipt" size={18} />} label="Food cost stimato"
                  value={fmt0(riepilogo.fcTot)} color={C.red}
                  sub={riepilogo.ricavoTot > 0 ? `${fmtp(riepilogo.fcTot / riepilogo.ricavoTot * 100)} sul ricavo` : 'materie prime'} />
                <KPI icon={<Icon name="trendUp" size={18} />} label="Margine lordo"
                  value={fmt0(margine)} highlight
                  sub={`${hasQta ? fmtp(margPct) + ' · ' : ''}${semaforo}`} />
              </div>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 24 }}>
            <div>
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Data produzione</div>
                    <input type="date" value={data} onChange={e => setData(e.target.value)}
                      style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: 12, color: C.text }}/>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 420 }}>
                    <thead>
                      <tr style={{ background: '#F8F4F2' }}>
                        {[
                          { h: LEX.Prodotto, sub: `${LEX.ricetta} · pezzi/stampo` },
                          { h: 'FC/stampo', sub: 'costo materie prime' },
                          { h: 'Stampi prodotti', sub: 'quanti stampi/teglie' },
                          { h: 'Pezzi al banco', sub: 'esposti per la vendita' },
                        ].map(({ h, sub }, i) => (
                          <th key={i} title={sub} style={{ padding: '10px 14px', textAlign: i < 2 ? 'left' : 'center', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ricette.map((ric, i) => {
                        const reg = getR(ric.nome, ric)
                        const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
                        const q = qtaMap[ric.nome] || 0
                        const vq = vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : q
                        const cong = isCongelabile(ric.nome)
                        return (
                          <tr key={ric.nome} style={{ borderBottom: `1px solid ${C.border}`, background: (q > 0 || vq > 0) ? '#FFF9F9' : i % 2 === 0 ? C.white : '#FDFAF7' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text }}>
                              {ric.nome}
                              <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: 9, color: C.textSoft }}>
                                  1 stampo → <b style={{ color: C.text }}>{reg.unita} {reg.tipo === 'fetta' ? 'fette' : 'pezzi'}</b> × {fmt(reg.prezzo)}
                                </span>
                                {q > 0 && reg.unita > 0 && (
                                  <span style={{ fontSize: 8, fontWeight: 700, background: '#FEF7F5', color: C.red, padding: '1px 6px', borderRadius: 3 }}>
                                    {q} × {reg.unita} = {q * reg.unita} pezzi al banco
                                  </span>
                                )}
                                {cong && <span style={{ fontSize: 8, fontWeight: 700, background: '#E8F4FF', color: '#2980B9', padding: '1px 6px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="snow" size={9} /> congelabile</span>}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', color: C.red }}>{fmt(fc)}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <button aria-label="Diminuisci" onClick={() => setQ(ric.nome, Math.max(0, (qtaMap[ric.nome] || 0) - 1))} style={{ width: isMobile ? 40 : 26, height: isMobile ? 40 : 26, borderRadius: 5, border: `1px solid ${C.borderStr}`, background: C.white, fontSize: 13, cursor: 'pointer', fontWeight: 700, color: C.textMid }}>−</button>
                                <input type="number" min="0" value={q || ''} onChange={e => setQ(ric.nome, e.target.value)}
                                  style={{ width: 48, padding: '4px', borderRadius: 5, border: `1px solid ${q > 0 ? C.red : C.borderStr}`, background: C.white, fontSize: isMobile ? 16 : 13, textAlign: 'center', fontWeight: 800, color: q > 0 ? C.red : C.text }}/>
                                <button aria-label="Aumenta" onClick={() => setQ(ric.nome, (qtaMap[ric.nome] || 0) + 1)} style={{ width: isMobile ? 40 : 26, height: isMobile ? 40 : 26, borderRadius: 5, border: `1px solid ${C.borderStr}`, background: C.white, fontSize: 13, cursor: 'pointer', fontWeight: 700, color: C.textMid }}>+</button>
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {cong ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                  <button aria-label="Diminuisci vendibile" onClick={() => setV(ric.nome, Math.max(0, (vendibileMap[ric.nome] || q) - 1))} style={{ width: isMobile ? 40 : 26, height: isMobile ? 40 : 26, borderRadius: 5, border: '1px solid #BDE', background: '#F0F8FF', fontSize: 13, cursor: 'pointer', fontWeight: 700, color: '#2980B9' }}>−</button>
                                  <input type="number" min="0" value={vq || ''} onChange={e => setV(ric.nome, e.target.value)}
                                    style={{ width: 48, padding: '4px', borderRadius: 5, border: `1px solid ${vq > 0 ? '#2980B9' : C.borderStr}`, background: '#F0F8FF', fontSize: isMobile ? 16 : 13, textAlign: 'center', fontWeight: 800, color: vq > 0 ? '#2980B9' : C.text }}/>
                                  <button aria-label="Aumenta vendibile" onClick={() => setV(ric.nome, (vendibileMap[ric.nome] || q) + 1)} style={{ width: isMobile ? 40 : 26, height: isMobile ? 40 : 26, borderRadius: 5, border: '1px solid #BDE', background: '#F0F8FF', fontSize: 13, cursor: 'pointer', fontWeight: 700, color: '#2980B9' }}>+</button>
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: C.textSoft }}>= {LEX.prodotti}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 240px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Note sessione</div>
                    <input type="text" value={sessNote} onChange={e => setSessNote(e.target.value)} placeholder="es. produzione weekend, teglia extra…"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: 12, color: C.text, boxSizing: 'border-box' }}/>
                  </div>
                  {haPiuSedi && (
                    <div style={{ flex: '1 1 200px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Destinazione</div>
                      <select value={destinazioneSedeId || ''} onChange={e => setDestinazioneSedeId(e.target.value || null)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: 12, color: C.text, background: C.bgCard, boxSizing: 'border-box' }}>
                        <option value="">Questa sede ({sedeAttiva?.nome || '—'})</option>
                        {sediAttive.filter(s => s.id !== sedeAttiva?.id).map(s => (
                          <option key={s.id} value={s.id}>Per: {s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', boxShadow: SHADOW_PREMIUM }}>
                <PanelHead icon={<Icon name="barChart" size={16} />} title="Riepilogo sessione" color={C.text} />
                {!hasQta ? (
                  <div style={{ color: C.textSoft, fontSize: 11, textAlign: 'center', padding: '20px 0' }}>Inserisci gli stampi prodotti</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ricette.filter(r => qtaMap[r.nome] > 0).map(ric => {
                      const reg = getR(ric.nome, ric)
                      const q = qtaMap[ric.nome]
                      const qv = vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : q
                      const pezziVetrina = qv * (reg.unita || 1)
                      return (
                        <div key={ric.nome} style={{ fontSize: 11, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ color: C.text, fontWeight: 700 }}>{q} stampi · {ric.nome}</span>
                            {!isDipendente && <span style={{ fontWeight: 700, color: C.green }}>{fmt(qv * reg.unita * reg.prezzo)}</span>}
                          </div>
                          {reg.unita > 1 && (
                            <div style={{ fontSize: 10, color: C.textSoft, marginTop: 2 }}>
                              → <b style={{ color: C.red }}>{pezziVetrina} {reg.tipo === 'fetta' ? 'fette' : 'pezzi'}</b> al banco
                              {q !== qv && <span style={{ color: '#92400E', marginLeft: 6 }}>({qv} vendibili oggi, {q - qv} in freezer)</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {!isDipendente && (() => {
                      const mc = margColor(margPct)
                      const mbg = margPct >= 60 ? C.greenLight : margPct >= 40 ? C.amberLight : C.redLight
                      return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.red, paddingTop: 4 }}>
                          <span>Food cost totale</span><span style={{ fontWeight: 700, ...TNUM }}>−{fmt(riepilogo.fcTot)}</span>
                        </div>
                        <div style={{ marginTop: 4, padding: '12px 14px', background: mbg, border: `1px solid ${mc}25`, borderRadius: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: mc }}>Margine lordo</span>
                            <span style={{ fontSize: 18, fontWeight: 900, color: mc, ...TNUM }}>{fmt(riepilogo.ricavoTot - riepilogo.fcTot)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                            <span style={{ color: C.textMid }}>Margine %</span>
                            <span style={{ fontWeight: 700, color: mc, ...TNUM }}>{margPct.toFixed(1)}%</span>
                          </div>
                        </div>
                      </>
                      )
                    })()}
                  </div>
                )}
              </div>

              {hasQta && (
                <div style={{ background: '#FEF7F5', border: `1px solid ${C.red}30`, borderRadius: 16, padding: '16px', boxShadow: '0 1px 2px rgba(110,14,26,0.05), 0 8px 22px rgba(110,14,26,0.06)' }}>
                  <PanelHead icon={<Icon name="gift" size={16} />} title="Stock vetrina dopo la sessione" color={C.red} />
                  <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.55, marginBottom: 8 }}>
                    Una volta confermata, questi pezzi finiscono nello stock vetrina disponibile per la vendita:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ricette.filter(r => (vendibileMap[r.nome] != null ? vendibileMap[r.nome] : qtaMap[r.nome] || 0) > 0).map(ric => {
                      const reg = getR(ric.nome, ric)
                      const qv = vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : (qtaMap[ric.nome] || 0)
                      const pezzi = qv * (reg.unita || 1)
                      return (
                        <span key={ric.nome} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: C.white, border: `1px solid ${C.red}25`, color: C.text, fontWeight: 700 }}>
                          {ric.nome} <span style={{ color: C.red }}>+{pezzi}</span> <span style={{ fontWeight: 500, color: C.textSoft }}>{reg.tipo === 'fetta' ? 'fette' : 'pezzi'}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {hasQta && !isDipendente && (
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', boxShadow: SHADOW_PREMIUM }}>
                  <PanelHead icon={<Icon name="receipt" size={16} />} title="Ingredienti da scalare" color={C.text} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                    {Object.entries(riepilogo.ings).sort((a, b) => b[1] - a[1]).map(([k, qty]) => {
                      const giac = magazzino?.[k]?.giacenza_g || 0
                      const ok = giac >= qty
                      return (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, padding: '5px 8px', borderRadius: 6, background: ok ? '#F8FAF8' : C.redLight }}>
                          <span style={{ fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{k}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ color: C.red, fontWeight: 700 }}>−{fmtG(qty)}</span>
                            <span style={{ color: ok ? C.green : C.red, fontSize: 9 }}>{ok ? `→ ${fmtG(giac - qty)}` : 'insuff.'}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {problemi.length > 0 && !isDipendente && (
                <div style={{ background: C.redLight, border: `1px solid ${C.red}25`, borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.red, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="warning" size={13} />Scorte insufficienti</div>
                  {problemi.map(p => (
                    <div key={p.nome} style={{ fontSize: 10, color: C.red, marginBottom: 4 }}>
                      <b style={{ textTransform: 'capitalize' }}>{p.nome}</b>: servono {fmtG(p.richiesto)}, disponibili {fmtG(p.disponibile)}
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: C.red, marginTop: 8, opacity: 0.7 }}>Puoi procedere comunque — il magazzino andrà a 0.</div>
                </div>
              )}

              {hasQta && (
                !confermando ? (
                  <button onClick={() => setConfermando(true)} style={{ padding: '14px', background: C.red, color: C.white, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(110,14,26,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Icon name="checkCircle" size={16} />Conferma produzione</button>
                ) : (
                  <div style={{ background: C.redLight, border: `1px solid ${C.red}30`, borderRadius: 10, padding: '16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 10 }}>Confermi? Il magazzino verrà scalato.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleConferma} disabled={salvando}
                        style={{ flex: 1, padding: '10px', background: salvando ? '#9C887F' : C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: salvando ? 'wait' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
                        {salvando ? 'Salvataggio…' : 'Sì, conferma'}
                      </button>
                      <button onClick={() => setConfermando(false)} disabled={salvando}
                        style={{ flex: 1, padding: '10px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.6 : 1 }}>
                        Annulla
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {!isDipendente && tab === 'storico' && (
        <div>
          {(!giornaliero || giornaliero.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: C.textSoft }}>
              <div style={{ marginBottom: 12, color: C.textSoft }}><Icon name="clipboard" size={36} /></div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Nessuna sessione registrata</div>
              <button onClick={() => setTab('nuova')} style={{ padding: '9px 22px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="plus" size={13} />Prima sessione</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                const tot = giornaliero.reduce((a, s) => {
                  a.ric += s.ricavoTot || 0; a.fc += s.fcTot || 0
                  a.stampi += (s.prodotti || []).reduce((x, p) => x + (Number(p.stampi) || 0), 0)
                  return a
                }, { ric: 0, fc: 0, stampi: 0 })
                const mtot = tot.ric - tot.fc
                const mpct = tot.ric > 0 ? (mtot / tot.ric * 100) : 0
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 6 }}>
                    <KPI icon={<Icon name="calendar" size={18} />} label="Sessioni" value={giornaliero.length.toLocaleString('it-IT')} sub={`${tot.stampi.toLocaleString('it-IT')} stampi totali`} />
                    <KPI icon={<Icon name="money" size={18} />} label="Ricavo potenziale" value={fmt0(tot.ric)} color={C.green} sub="somma sessioni" />
                    <KPI icon={<Icon name="receipt" size={18} />} label="Food cost" value={fmt0(tot.fc)} color={C.red} sub={tot.ric > 0 ? `${fmtp(tot.fc / tot.ric * 100)} sul ricavo` : 'materie prime'} />
                    <KPI icon={<Icon name="trendUp" size={18} />} label="Margine lordo" value={fmt0(mtot)} highlight sub={tot.ric > 0 ? `${fmtp(mpct)} sul ricavo` : '—'} />
                  </div>
                )
              })()}
              {giornaliero.map((sess) => (
                <div key={sess.id} className={editSessId === sess.id ? undefined : 'fos-tile'} style={{ background: C.bgCard, border: `1px solid ${deleteSessConf?.id === sess.id ? C.red : C.border}`, borderRadius: 16, padding: '16px 20px', boxShadow: SHADOW_PREMIUM }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums', minWidth: 86, display: 'inline-block' }}>{new Date(sess.data).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.textSoft, textTransform: 'capitalize' }}>{new Date(sess.data).toLocaleDateString('it-IT', { weekday: 'long' })}</span>
                        </div>
                        {sess.destinazioneSedeNome && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FEF3C7', color: '#92400E', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="truck" size={11} />Per: {sess.destinazioneSedeNome}</span>
                        )}
                      </div>
                      {sess.note && <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>{sess.note}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      {!isDipendente && (() => {
                        const stampiSess = (sess.prodotti || []).reduce((x, p) => x + (Number(p.stampi) || 0), 0)
                        const margSess = (sess.ricavoTot || 0) - (sess.fcTot || 0)
                        const mPctSess = (sess.ricavoTot || 0) > 0 ? margSess / sess.ricavoTot * 100 : 0
                        const mcSess = margColor(mPctSess)
                        return (
                          <div style={{ display: 'flex', gap: isMobile ? 12 : 18, textAlign: 'right', alignItems: 'flex-start' }}>
                            {!isMobile && <div><div style={{ fontSize: 8, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Stampi</div><div style={{ fontSize: 14, fontWeight: 800, color: C.text, ...TNUM }}>{stampiSess.toLocaleString('it-IT')}</div></div>}
                            <div><div style={{ fontSize: 8, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Ricavo pot.</div><div style={{ fontSize: 14, fontWeight: 800, color: C.green, ...TNUM }}>{fmt0(sess.ricavoTot || 0)}</div></div>
                            <div><div style={{ fontSize: 8, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Food cost</div><div style={{ fontSize: 14, fontWeight: 800, color: C.red, ...TNUM }}>{fmt0(sess.fcTot || 0)}</div></div>
                            <div><div style={{ fontSize: 8, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Margine</div><div style={{ fontSize: 14, fontWeight: 800, color: mcSess, ...TNUM }}>{fmt0(margSess)}</div></div>
                          </div>
                        )
                      })()}
                      <button onClick={() => editSessId === sess.id ? annullaModifica() : apriModificaSessione(sess)}
                        style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.borderStr}`, background: C.white, color: C.textMid, fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>{editSessId === sess.id ? <><Icon name="x" size={11} />Chiudi</> : <><Icon name="edit" size={11} />Modifica</>}</button>
                      <button onClick={() => { setDeleteSessConf(sess); setDeleteSessPin(''); annullaModifica() }}
                        style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="trash" size={11} />Elimina</button>
                    </div>
                  </div>
                  {editSessId === sess.id ? (
                    <div style={{ marginTop: 12, padding: '14px 16px', background: '#F8F4F2', border: `1px solid ${C.borderStr}`, borderRadius: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 4 }}>Modifica quantità prodotte</div>
                      <div style={{ fontSize: 10, color: C.textSoft, marginBottom: 10, lineHeight: 1.5 }}>Cambia gli stampi o i pezzi vendibili. Metti <b>0</b> per togliere un prodotto. Magazzino e vetrina verranno riallineati di conseguenza.</div>
                      {/* Intestazioni colonne */}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 64px 64px' : '1fr 90px 90px', gap: 8, marginBottom: 4 }}>
                        <div/>
                        <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, textAlign: 'center' }}>Stampi</div>
                        <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, textAlign: 'center' }}>Vendibili</div>
                      </div>
                      {(sess.prodotti || []).map(p => (
                        <div key={p.nome} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 64px 64px' : '1fr 90px 90px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                          <input type="number" min="0" inputMode="decimal" value={editRows[p.nome]?.stampi ?? ''} disabled={editConfirm}
                            onChange={e => setEditRows(m => ({ ...m, [p.nome]: { ...m[p.nome], stampi: e.target.value } }))}
                            style={{ padding: '7px 8px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.white, textAlign: 'right' }}/>
                          <input type="number" min="0" inputMode="decimal" value={editRows[p.nome]?.vendibile ?? ''} disabled={editConfirm}
                            onChange={e => setEditRows(m => ({ ...m, [p.nome]: { ...m[p.nome], vendibile: e.target.value } }))}
                            style={{ padding: '7px 8px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.white, textAlign: 'right' }}/>
                        </div>
                      ))}
                      {!editConfirm ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button onClick={() => setEditConfirm(true)} style={{ flex: 1, padding: '9px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Salva modifiche</button>
                          <button onClick={annullaModifica} style={{ padding: '9px 14px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Annulla</button>
                        </div>
                      ) : (
                        <div style={{ marginTop: 12, padding: '12px 14px', background: '#FFF8EE', border: `1px solid ${C.amber}`, borderRadius: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="warning" size={13} />Confermi le modifiche?</div>
                          <div style={{ fontSize: 10, color: C.textMid, marginBottom: 10, lineHeight: 1.5 }}>Questa azione riallinea il <b>magazzino</b> (ingredienti) e la <b>vetrina</b> (stock prodotti finiti) in base alle nuove quantità. Non è automaticamente reversibile.</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => salvaModificheSessione(sess)} disabled={savingEdit} style={{ flex: 1, padding: '9px', background: C.amber, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: savingEdit ? 'not-allowed' : 'pointer', opacity: savingEdit ? 0.6 : 1 }}>{savingEdit ? 'Salvataggio…' : 'Sì, conferma e aggiorna'}</button>
                            <button onClick={() => setEditConfirm(false)} disabled={savingEdit} style={{ padding: '9px 14px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Indietro</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <ProdottiChips prodotti={sess.prodotti} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {deleteSessConf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setDeleteSessConf(null); setDeleteSessPin('') } }}>
          <div style={{ background: C.white, borderRadius: 14, padding: '28px 32px', maxWidth: 460, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.red, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="trash" size={16} />Elimina sessione di produzione</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>
              <b>{new Date(deleteSessConf.data).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</b>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 12px' }}>
              {(deleteSessConf.prodotti || []).map(p => (
                <span key={p.nome} style={{ background: '#F8F4F2', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 9px', fontSize: 10, fontWeight: 700, color: C.textMid }}>{p.stampi}× {p.nome}</span>
              ))}
            </div>
            {deleteSessConf.ingredientiUsati && Object.keys(deleteSessConf.ingredientiUsati).length > 0 ? (
              <div style={{ background: '#F0FFF4', border: '1px solid #C6EDD3', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: '#1B7A3E' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="refresh" size={12} /><b>Gli ingredienti verranno restituiti al magazzino:</b></span>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(deleteSessConf.ingredientiUsati).map(([k, qty]) => (
                    <span key={k} style={{ background: '#D4F0DC', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 600, textTransform: 'capitalize' }}>
                      {k}: +{qty >= 1000 ? (qty / 1000).toFixed(2) + 'kg' : Math.round(qty) + 'g'}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: '#B45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="warning" size={13} />Questa sessione non ha dati sugli ingredienti usati — il magazzino non verrà aggiornato.
              </div>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, marginBottom: 6 }}>Scrivi <b style={{ color: C.red }}>ELIMINA</b> per confermare:</div>
            <input autoFocus value={deleteSessPin} onChange={e => setDeleteSessPin(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleDeleteSessione(deleteSessConf) }}
              placeholder="ELIMINA"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 7, border: `2px solid ${deleteSessPin === 'ELIMINA' ? C.red : '#DDD'}`, fontSize: 14, fontWeight: 800, color: C.red, letterSpacing: '0.1em', marginBottom: 16, outline: 'none' }}/>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleDeleteSessione(deleteSessConf)}
                disabled={deleteSessPin !== 'ELIMINA' || deletingSess}
                style={{ flex: 1, padding: '11px', background: (deleteSessPin === 'ELIMINA' && !deletingSess) ? C.red : '#EEE', color: (deleteSessPin === 'ELIMINA' && !deletingSess) ? C.white : '#AAA', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: (deleteSessPin === 'ELIMINA' && !deletingSess) ? 'pointer' : 'not-allowed' }}>
                {deletingSess ? 'Eliminazione…' : 'Elimina e reintegra magazzino'}
              </button>
              <button onClick={() => { setDeleteSessConf(null); setDeleteSessPin('') }} disabled={deletingSess} style={{ flex: 1, padding: '11px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: deletingSess ? 'not-allowed' : 'pointer', opacity: deletingSess ? 0.6 : 1 }}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
