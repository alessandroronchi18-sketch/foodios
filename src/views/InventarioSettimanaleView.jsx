// Inventario settimanale - metodo differenziale (gelateria/yogurt/pasta fresca).
//
// Esperienza utente che replica il foglio Excel che i dipendenti già usano:
//   righe   = gusti (ricette con is_gusto=true)
//   colonne = 7 giorni × (PROD | RIMAN), in più colonna VENDUTO SETTIMANA
//
// I 7 giorni vanno da lunedi a domenica. Navigazione +/- settimana.
//
// Il venduto del giorno N e' calcolato come
//   riman(N-1) + prod(N) - riman(N) - scarto(N)
// usando il dato del lunedi della settimana precedente come "riman(N-1)" del
// lunedi corrente (la query carica un giorno in più a sinistra).
//
// Salvataggio per-cella su blur: ogni modifica di PROD o RIMAN scrive subito
// la riga (upsert su unique org+sede+gusto+data). UX da foglio di calcolo.
//
// La voce menu che porta qui appare in Dashboard solo se l'ORG e' su
// metodo='inventario' (audit 2026-07-23: metodo e' ORG-level, non più per-sede)
// AND la sede attiva ha is_sede_produzione=true.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import { C, TNUM, PageHeader } from './_shared'
import ImportWizard from '../components/ImportWizard'
import { ssave } from '../lib/storage'
import { SK_MAG } from '../lib/storageKeys'
import {
  elencoGusti, caricaSettimana, salvaCella, calcolaVendutoSettimana,
  totaliVenduti, lunediDellaSettimana, normGusto,
  scaloMagazzinoPerGusto, ricettaDelGusto,
} from '../lib/inventarioProduzione'
import { loadXLSX } from '../lib/xlsx'
import { supabase } from '../lib/supabase'
import { caricoProduzionePF } from '../lib/stockPF'

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
  if (n == null) return '-'
  return Number(n).toLocaleString('it-IT')
}

export default function InventarioSettimanaleView({ orgId, sedeId, sedi, sedeAttiva, ricettario, magazzino, setMagazzino, tipoAttivita, metodoProduzione = 'stampi', notify, onNavigate }) {
  // "Tutte le sedi" attivo: vista AGGREGATA read-only. Somma PROD/RIMAN di
  // tutte le sedi produttive dell'org (il metodo e' org-level, quindi tutte
  // le sedi produttive di questa org hanno lo stesso metodo). Niente save,
  // niente import: si sceglie prima una sede specifica.
  const isAllSedi = sedeAttiva?._all === true
  // Sedi produttive dell'org tra cui scegliere quando isAllSedi. Il filtro
  // sul metodo e' implicito: questa view compare solo se metodoProduzione
  // dell'org e' 'inventario' (gate in Dashboard).
  const sediProduttive = useMemo(() => (sedi || [])
    .filter(s => s.attiva !== false && s.is_sede_produzione)
  , [sedi])
  // Sub-selezione utente: array di sede_id da aggregare. Default: tutte.
  const [sediFiltro, setSediFiltro] = useState(null)
  useEffect(() => {
    if (isAllSedi && sediFiltro === null) {
      setSediFiltro(new Set(sediProduttive.map(s => s.id)))
    }
  }, [isAllSedi, sediProduttive, sediFiltro])
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
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
  // Toggle "Solo gusti compilati": nasconde le righe che nel periodo attivo
  // non hanno mai avuto un dato (produzione / rimanenza / scarto / spedito).
  // Non persistito: e' uno strumento di focus temporaneo, ogni ricarica
  // riparte con tutti i gusti visibili.
  const [soloCompilati, setSoloCompilati] = useState(false)
  // Onboarding al primo accesso.
  // Persistenza doppia: localStorage per il flash iniziale + user_data (Supabase)
  // come source-of-truth. Così sopravvive cambio device/browser/Safari private.
  // Chiave user_data: 'inventario-onboarding-visto-v1'.
  const SK_ONB_INV = 'inventario-onboarding-visto-v1'
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return !localStorage.getItem('foodos_inventario_onboarding_v1') } catch { return false }
  })
  // Conferma dal DB: se orgId disponibile e user_data dice "visto", nascondi.
  useEffect(() => {
    if (!orgId) return
    let alive = true
    sload(SK_ONB_INV, orgId, null).then(v => {
      if (!alive) return
      if (v && (v === true || v === 1 || v?.visto === true)) {
        setShowOnboarding(false)
        try { localStorage.setItem('foodos_inventario_onboarding_v1', '1') } catch {}
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [orgId])
  const chiudiOnboarding = () => {
    try { localStorage.setItem('foodos_inventario_onboarding_v1', '1') } catch {}
    setShowOnboarding(false)
    // Persisti su DB fire-and-forget: al prossimo login (anche altro device) skippa.
    if (orgId) {
      ssave(SK_ONB_INV, { visto: true, ts: new Date().toISOString() }, orgId, null).catch(() => {})
    }
  }
  // Ordinamento gusti: di default alfabetico ascendente. Click sui label di
  // header colonna (PROD/RIMAN giorno N o VENDUTO SETT) toggla la metrica
  // di sort e direzione.
  // sort.by: 'nome' | { tipo: 'prod'|'riman', giorno: 0..6 } | 'venduto'
  // sort.dir: 'asc' | 'desc'
  const [sort, setSort] = useState({ by: 'nome', dir: 'asc' })
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [drilldownGusto, setDrilldownGusto] = useState(null)
  // Stato dialog spedizione kg → sede destinazione. null = chiuso.
  const [shipDlg, setShipDlg] = useState(null)
  // Unita' di visualizzazione: 'g' (default) o 'kg'. Persistita in localStorage.
  const [unitaDisplay, setUnitaDisplay] = useState(() => {
    if (typeof window === 'undefined') return 'g'
    try { return localStorage.getItem('foodos_inventario_unita_v1') || 'g' } catch { return 'g' }
  })
  const toggleUnita = () => {
    setUnitaDisplay(u => {
      const next = u === 'g' ? 'kg' : 'g'
      try { localStorage.setItem('foodos_inventario_unita_v1', next) } catch {}
      return next
    })
  }
  // Helper formatter: converte grammi al valore visualizzato + suffisso.
  const fmtUnita = (g) => {
    if (g == null || g === '') return ''
    const n = Number(g) || 0
    if (unitaDisplay === 'kg') {
      return (n / 1000).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    }
    return n.toLocaleString('it-IT')
  }
  // Parse input utente -> grammi (per CellInput/BigField).
  const parseToG = (val) => {
    const n = Number((val || '').toString().replace(',', '.')) || 0
    return unitaDisplay === 'kg' ? Math.round(n * 1000) : Math.round(n)
  }

  // Lista gusti = unione di ricettario + gusti orfani (presenti in DB ma
  // non nel ricettario). Così un file importato con nomi non ancora a
  // ricettario non viene "nascosto" nel foglio settimanale.
  const gusti = useMemo(() => elencoGusti(ricettario, righe), [ricettario, righe])

  // ID delle sedi su cui leggere: una se sede attiva, oppure il sub-set
  // selezionato dall'utente in modalita' isAllSedi.
  // NB: dichiarato PRIMA dei useEffect così possono usarlo come dep.
  const sediProdIds = useMemo(() => {
    if (!isAllSedi) return sedeId ? [sedeId] : []
    if (sediFiltro instanceof Set && sediFiltro.size > 0) return [...sediFiltro]
    return sediProduttive.map(s => s.id)
  }, [isAllSedi, sedeId, sediProduttive, sediFiltro])
  // Chiave stabile delle sedi attive (per evitare re-render infiniti dato
  // che sediProdIds e' un array nuovo a ogni render anche se memoizzato).
  const sediKey = sediProdIds.join(',')

  useEffect(() => {
    let alive = true
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    if (isAllSedi) {
      // Aggregazione cross-sede: usiamo il sub-set scelto dall'utente
      // (sediProdIds), oppure tutte le produttive se non c'e' filtro.
      Promise.all(sediProdIds.map(id => caricaSettimana(orgId, id, lunediIso)))
        .then(perSede => {
          if (!alive) return
          // Somma per (gusto, data).
          const map = {}
          for (const arr of perSede) {
            for (const r of (arr || [])) {
              const k = `${r.gusto_nome}|${r.data}`
              if (!map[k]) {
                map[k] = { gusto_nome: r.gusto_nome, data: r.data, produzione_g: 0, rimanenza_g: 0, scarto_g: 0, spedito_g: 0 }
              }
              map[k].produzione_g += Number(r.produzione_g) || 0
              map[k].rimanenza_g += Number(r.rimanenza_g) || 0
              map[k].scarto_g += Number(r.scarto_g) || 0
              map[k].spedito_g += Number(r.spedito_g) || 0
            }
          }
          setRighe(Object.values(map))
          setLoading(false)
        })
        .catch(e => { if (alive) { console.error(e); setLoading(false) } })
    } else {
      if (!sedeId) { setLoading(false); return }
      caricaSettimana(orgId, sedeId, lunediIso)
        .then(data => { if (alive) { setRighe(data); setLoading(false) } })
        .catch(e => { if (alive) { console.error(e); setLoading(false) } })
    }
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sedeId, lunediIso, isAllSedi, sediKey])

  // Caricamento dati MESE quando si seleziona la vista mese.
  useEffect(() => {
    if (vista !== 'mese' || !orgId || sediProdIds.length === 0) return
    const d = new Date(lunediIso)
    const inizio = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    const fine = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
    supabase.from('inventario_produzione')
      .select('gusto_nome, data, produzione_g, rimanenza_g, scarto_g, spedito_g, sede_id')
      .eq('organization_id', orgId).in('sede_id', sediProdIds)
      .gte('data', inizio).lt('data', fine)
      .limit(100000)  // evita il default supabase-js di 1000 → tagliava dati con molte sedi/gusti
      .then(({ data }) => {
        // Aggrega per (gusto, data) se isAllSedi (somma sedi)
        if (isAllSedi) {
          const map = {}
          for (const r of (data || [])) {
            const k = `${r.gusto_nome}|${r.data}`
            if (!map[k]) map[k] = { gusto_nome: r.gusto_nome, data: r.data, produzione_g: 0, rimanenza_g: 0, scarto_g: 0, spedito_g: 0 }
            map[k].produzione_g += Number(r.produzione_g) || 0
            map[k].rimanenza_g += Number(r.rimanenza_g) || 0
            map[k].scarto_g += Number(r.scarto_g) || 0
            map[k].spedito_g += Number(r.spedito_g) || 0
          }
          setMeseData({ righe: Object.values(map), inizio, fine })
        } else {
          setMeseData({ righe: data || [], inizio, fine })
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, orgId, sediKey, lunediIso, isAllSedi])

  // Caricamento dati STORICO (ultimi 6 mesi) quando si apre vista storico.
  useEffect(() => {
    if (vista !== 'storico' || !orgId || sediProdIds.length === 0) return
    const oggi = new Date()
    const inizio = new Date(oggi.getFullYear(), oggi.getMonth() - 5, 1).toISOString().slice(0, 10)
    supabase.from('inventario_produzione')
      .select('gusto_nome, data, produzione_g, rimanenza_g, scarto_g, spedito_g, sede_id')
      .eq('organization_id', orgId).in('sede_id', sediProdIds)
      .gte('data', inizio)
      .order('data')
      .limit(100000)  // evita il default supabase-js di 1000 (con 3 sedi × 6 mesi supera facile)
      .then(({ data }) => {
        if (isAllSedi) {
          // Aggreghiamo per (gusto, data) sommando sedi. La logica del venduto
          // poi e' calcolata in VistaStorico (richiede continuita' giornaliera);
          // sommare RIMAN cross-sede e' coerente perché RIMAN(N-1)+PROD(N)-RIMAN(N)
          // sommato per sede e' uguale a (sum RIMAN_prev) + (sum PROD) - (sum RIMAN).
          const map = {}
          for (const r of (data || [])) {
            const k = `${r.gusto_nome}|${r.data}`
            if (!map[k]) map[k] = { gusto_nome: r.gusto_nome, data: r.data, produzione_g: 0, rimanenza_g: 0, scarto_g: 0, spedito_g: 0 }
            map[k].produzione_g += Number(r.produzione_g) || 0
            map[k].rimanenza_g += Number(r.rimanenza_g) || 0
            map[k].scarto_g += Number(r.scarto_g) || 0
            map[k].spedito_g += Number(r.spedito_g) || 0
          }
          setStoricoData({ righe: Object.values(map), inizio })
        } else {
          setStoricoData({ righe: data || [], inizio })
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, orgId, sediKey, isAllSedi])

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

  // Insieme dei nomi (normalizzati) dei gusti con almeno un dato compilato nel
  // periodo attualmente visualizzato. Un gusto e' "compilato" se, per la vista
  // corrente, esiste almeno una riga in cui uno tra prod / riman / scarto /
  // spedito e' > 0. Alimenta il toggle "Solo gusti compilati".
  const gustiCompilatiSet = useMemo(() => {
    const set = new Set()
    let source = []
    if (vista === 'oggi') {
      const oggiIso = new Date().toISOString().slice(0, 10)
      source = (righe || []).filter(r => r.data === oggiIso)
    } else if (vista === 'settimana') {
      source = righe || []
    } else if (vista === 'mese') {
      source = meseData?.righe || []
    } else if (vista === 'storico') {
      source = storicoData?.righe || []
    }
    for (const r of source) {
      const p = Number(r.produzione_g) || 0
      const rim = Number(r.rimanenza_g) || 0
      const sc = Number(r.scarto_g) || 0
      const sp = Number(r.spedito_g) || 0
      if (p > 0 || rim > 0 || sc > 0 || sp > 0) {
        set.add(normGusto(r.gusto_nome))
      }
    }
    return set
  }, [vista, righe, meseData, storicoData])

  // Lista finale che finisce nelle sotto-viste: se il toggle e' spento,
  // e' identica a gustiOrdinati; se acceso, tiene solo i gusti presenti nel
  // set dei compilati per il periodo attivo.
  const gustiVisibili = useMemo(() => {
    if (!soloCompilati) return gustiOrdinati
    return gustiOrdinati.filter(g => gustiCompilatiSet.has(normGusto(g.nome)))
  }, [soloCompilati, gustiOrdinati, gustiCompilatiSet])

  // Totali di colonna per la vista Settimana: per ogni giorno la somma dei
  // PROD e delle RIMAN su tutti i gusti attualmente visibili, più il totale
  // di VENDUTO SETT. Segue gustiVisibili, quindi se filtro "Solo compilati"
  // e' attivo i totali riflettono solo i gusti in lista.
  const totaliColonnaSettimana = useMemo(() => {
    const perGiorno = {}
    for (let i = 0; i < 7; i++) {
      perGiorno[addDays(lunediIso, i)] = { prod: 0, riman: 0 }
    }
    let venduto = 0
    for (const g of gustiVisibili) {
      const key = normGusto(g.nome)
      const byData = matrice[key] || {}
      for (let i = 0; i < 7; i++) {
        const dIso = addDays(lunediIso, i)
        const c = byData[dIso]
        if (c) {
          perGiorno[dIso].prod += Number(c.prod) || 0
          perGiorno[dIso].riman += Number(c.riman) || 0
        }
      }
      venduto += Number(totali[key]) || 0
    }
    return { perGiorno, venduto }
  }, [gustiVisibili, matrice, totali, lunediIso])

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
  // errore mostriamo il toast - lo state torna allo stato precedente al
  // prossimo reload (sufficiente per evitare drift duraturo).
  const handleSave = useCallback(async (gustoNome, dataIso, campo, valore) => {
    const k = `${gustoNome}|${dataIso}|${campo}`
    setSaving(s => ({ ...s, [k]: true }))
    try {
      // L2: per evitare race su 2 tab aperte sulla stessa cella, RILEGGIAMO
      // lo stato attuale dal DB prima di calcolare il delta MP. Se l'altra
      // tab ha già salvato un PROD diverso da quello in memoria, ci adattiamo
      // al valore reale.
      const { data: serverRow } = await supabase
        .from('inventario_produzione')
        .select('produzione_g, rimanenza_g, scarto_g, spedito_g')
        .eq('organization_id', orgId).eq('sede_id', sedeId)
        .eq('gusto_nome', gustoNome).eq('data', dataIso)
        .maybeSingle()
      const esistenteMem = righe.find(r => r.gusto_nome === gustoNome && r.data === dataIso) || {}
      // Usa il server come fonte di verita' se ha dati più recenti.
      const esistente = serverRow
        ? { ...esistenteMem, ...serverRow }
        : esistenteMem
      // Audit 2026-07-01 HIGH: spread `...serverRow` per preservare campi
      // futuri (es. note) e spedito_g aggiunto in audit precedente.
      const patch = {
        ...(serverRow || {}),
        produzione_g: esistente.produzione_g || 0,
        rimanenza_g: esistente.rimanenza_g || 0,
        scarto_g: esistente.scarto_g || 0,
        spedito_g: esistente.spedito_g || 0,
        [campo]: Number(valore) || 0,
      }

      // Audit 2026-07-01 HIGH: pre-calcolo magazzino. Se devo scalare, SCALO
      // PRIMA di salvare inventario - se ssave magazzino fallisce, NON salvo
      // inventario (rollback implicito). Prima l'ordine era invertito: salvare
      // inventario poi magazzino → drift permanente su rete persa.
      let nuovoMagazzinoTarget = null
      let ingredientiScalatiTarget = []
      if (campo === 'produzione_g' && setMagazzino && ricettario) {
        const ric = ricettaDelGusto(ricettario, gustoNome)
        const oldProd = Number(esistente.produzione_g) || 0
        const newProd = Number(valore) || 0
        const delta = newProd - oldProd
        if (ric && delta !== 0) {
          const { nuovoMagazzino, ingredientiScalati } = scaloMagazzinoPerGusto(magazzino || {}, ric, delta)
          nuovoMagazzinoTarget = nuovoMagazzino
          ingredientiScalatiTarget = ingredientiScalati
        }
      }

      // Save-first magazzino: se ssave SK_MAG fallisce, esce con errore PRIMA
      // di toccare l'inventario.
      if (nuovoMagazzinoTarget && ingredientiScalatiTarget.length > 0) {
        try {
          await ssave(SK_MAG, nuovoMagazzinoTarget, orgId, sedeId)
          setMagazzino(nuovoMagazzinoTarget)
        } catch (e) {
          console.error('ssave magazzino prima di inventario:', e)
          notify?.('Errore aggiornamento magazzino, inventario NON salvato (riprova)', false)
          setSaving(s => { const n = { ...s }; delete n[k]; return n })
          return
        }
      }

      // Salvataggio inventario DOPO il magazzino (ordine inverso rispetto al
      // vecchio codice - vedi audit HIGH sopra).
      const saved = await salvaCella(orgId, sedeId, gustoNome, dataIso, patch)

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

  // Copia produzione (SOLO campo produzione_g) dalla settimana precedente in
  // questa settimana. Applica solo alle celle attualmente vuote (produzione_g=0
  // o null) per non sovrascrivere lavoro già inserito dal dipendente.
  async function ripetiSettimanaScorsa() {
    if (!orgId || !sedeId || isAllSedi) return
    try {
      const lunediScorso = addDays(lunediIso, -7)
      const scorsa = await caricaSettimana(orgId, sedeId, lunediScorso)
      // Mappa: (gusto, dayOffset 0-6) → produzione_g scorsa
      const prodByGustoOffset = {}
      for (const r of (scorsa || [])) {
        const diffGg = Math.round(
          (new Date(r.data).getTime() - new Date(lunediScorso).getTime()) / 86400000
        )
        if (diffGg < 0 || diffGg > 6) continue
        const p = Number(r.produzione_g) || 0
        if (p <= 0) continue
        prodByGustoOffset[`${r.gusto_nome}|${diffGg}`] = p
      }
      const totCells = Object.keys(prodByGustoOffset).length
      if (totCells === 0) {
        notify?.('La settimana scorsa non aveva nessuna produzione da copiare.', true)
        return
      }
      const conferma = window.confirm(
        `Copio i valori di PRODUZIONE della settimana ${fmtRange(lunediScorso)} in questa settimana?\n\nCelle da copiare: ${totCells}.\nLe celle già compilate non verranno toccate.`
      )
      if (!conferma) return

      // Trova le celle vuote in this week e copia il PROD scorso.
      // Iteriamo per gusto+offset. Se righeDb attuale ha produzione_g=0 su
      // quella coppia, salviamo.
      const righeDbNow = righe || []
      const idxNow = new Map()
      for (const r of righeDbNow) {
        idxNow.set(`${r.gusto_nome}|${r.data}`, r)
      }
      let scritte = 0, skip = 0
      for (const [key, prodScorsa] of Object.entries(prodByGustoOffset)) {
        const [gusto, offStr] = key.split('|')
        const off = Number(offStr)
        const dataIso = addDays(lunediIso, off)
        const nowKey = `${gusto}|${dataIso}`
        const rNow = idxNow.get(nowKey)
        const prodNow = Number(rNow?.produzione_g) || 0
        if (prodNow > 0) { skip++; continue }
        try {
          await handleSave(gusto, dataIso, 'produzione_g', prodScorsa)
          scritte++
        } catch { skip++ }
      }
      notify?.(
        `Copiate ${scritte} celle di produzione da settimana scorsa.` +
        (skip > 0 ? ` ${skip} salt${skip === 1 ? 'ata' : 'ate'} (già compilate o errore).` : ''),
        true
      )
    } catch (e) {
      console.error('ripetiSettimanaScorsa', e)
      notify?.('Errore nel copiare la settimana scorsa.', false)
    }
  }

  const mesePrec = () => {
    const d = new Date(lunediIso)
    const primo = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    setLunediIso(primo.toISOString().slice(0, 10))
  }
  const meseSucc = () => {
    const d = new Date(lunediIso)
    const primo = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    setLunediIso(primo.toISOString().slice(0, 10))
  }
  const meseCorrente = () => {
    const d = new Date()
    const primo = new Date(d.getFullYear(), d.getMonth(), 1)
    setLunediIso(primo.toISOString().slice(0, 10))
  }
  const meseLabel = () => {
    const d = new Date(lunediIso)
    const nomi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
                  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
    return `${nomi[d.getMonth()].charAt(0).toUpperCase() + nomi[d.getMonth()].slice(1)} ${d.getFullYear()}`
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (!orgId) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
  }
  // Quando "Tutte le sedi" e' attivo non serve sedeId: aggreghiamo cross-sede.
  if (!sedeId && !isAllSedi) {
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
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: isMobile ? 96 : 24, boxSizing: 'border-box', width: '100%' }}>
      <PageHeader subtitle="Registra produzione e rimanenza giornaliere. Il venduto si calcola da sé: rimanenza ieri + produzione oggi − rimanenza oggi − scarto." />

      {showOnboarding && !isAllSedi && <OnboardingInventario onClose={chiudiOnboarding} />}
      {showImportWizard && (
        <div role="dialog" aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setShowImportWizard(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
            zIndex: 9998, overflowY: 'auto', padding: 0,
          }}>
          <ImportWizard
            orgId={orgId}
            initialEntity="produzione_inventario"
            notify={notify}
            onClose={() => setShowImportWizard(false)}
          />
        </div>
      )}

      {drilldownGusto && (
        <DrilldownGustoModal
          gusto={drilldownGusto}
          orgId={orgId}
          sedeId={sedeId}
          isAllSedi={isAllSedi}
          sediProdIds={sediProdIds}
          unita={unitaDisplay}
          ricettario={ricettario}
          onClose={() => setDrilldownGusto(null)}
        />
      )}

      {isAllSedi && (
        <div style={{
          padding: '12px 14px', background: '#EFF6FF',
          border: '1px solid #BFDBFE', borderRadius: 10, marginBottom: 12,
        }}>
          <div style={{ fontSize: 12.5, color: '#1E3A8A', lineHeight: 1.5, marginBottom: 10 }}>
            <Icon name="globe" size={13} style={{ marginRight: 6, verticalAlign: 'middle' }}/><strong>Vista aggregata</strong> - Somma delle sedi selezionate qui sotto.
            Compilazione e import disabilitati: per modificare i dati, seleziona una sede
            specifica dal selettore in alto.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>
              Aggrega:
            </span>
            {sediProduttive.map(s => {
              const sel = !sediFiltro || sediFiltro.has(s.id)
              return (
                <button key={s.id}
                  onClick={() => setSediFiltro(prev => {
                    const next = new Set(prev || sediProduttive.map(x => x.id))
                    if (next.has(s.id)) next.delete(s.id)
                    else next.add(s.id)
                    // Non lasciare set vuoto: l'utente in tal caso vede 'tutte' di nuovo
                    if (next.size === 0) return new Set(sediProduttive.map(x => x.id))
                    return next
                  })}
                  style={{
                    padding: '8px 14px', minHeight: 40,
                    border: `1px solid ${sel ? '#1D4ED8' : '#BFDBFE'}`,
                    background: sel ? '#1D4ED8' : '#FFFFFF',
                    color: sel ? '#FFFFFF' : '#1E3A8A',
                    borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                  {sel && <Icon name="check" size={12} color="#FFFFFF" />}{s.nome}
                </button>
              )
            })}
            {sediProduttive.length > 1 && sediFiltro && sediFiltro.size < sediProduttive.length && (
              <button onClick={() => setSediFiltro(new Set(sediProduttive.map(s => s.id)))}
                style={{ padding: '8px 12px', minHeight: 40, fontSize: 12, fontWeight: 600, color: '#1E3A8A', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Seleziona tutte
              </button>
            )}
          </div>
        </div>
      )}

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
                  padding: isTablet ? '10px 18px' : '8px 16px', minHeight: isTablet ? 44 : 40, fontSize: 12.5, fontWeight: 700,
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  background: sel ? C.bgCard : 'transparent',
                  color: sel ? C.text : C.textMid,
                  boxShadow: sel ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                }}>{lbl}</button>
            )
          })}
        </div>
        <button onClick={() => setShowImportWizard(true)}
          disabled={isAllSedi}
          title={isAllSedi ? 'Per importare, seleziona prima una sede specifica' : 'Apri il caricamento guidato per fogli di produzione'}
          style={{
            padding: '8px 16px', minHeight: 40,
            background: isAllSedi ? '#94A3B8' : T.brand,
            color: '#FFFFFF', border: 'none', borderRadius: 8,
            fontSize: 12.5, fontWeight: 700,
            cursor: isAllSedi ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            opacity: isAllSedi ? 0.6 : 1,
          }}>
          <Icon name="upload" size={14} color="#FFFFFF" />
          Carica foglio produzione
        </button>

        {vista === 'settimana' && !isAllSedi && (
          <button onClick={ripetiSettimanaScorsa}
            disabled={saving}
            title="Copia i valori di PRODUZIONE dalla settimana scorsa in questa settimana. Sovrascrive solo le celle vuote."
            style={{
              padding: '8px 16px', minHeight: 40,
              background: '#FFFFFF', color: T.brand,
              border: `1px solid ${T.brand}`, borderRadius: 8,
              fontSize: 12.5, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: saving ? 0.6 : 1,
            }}>
            <Icon name="clock" size={14} color={T.brand} />
            Ripeti settimana scorsa
          </button>
        )}

        {!isAllSedi && (sedi || []).filter(s => s.id !== sedeId && s.attiva !== false).length > 0 && (
          <button onClick={() => setShipDlg({ gusto: '', kg: '', destSedeId: '' })}
            style={{
              padding: '8px 16px', minHeight: 40,
              background: '#FFFFFF', color: T.brand,
              border: `1px solid ${T.brand}`, borderRadius: 8,
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <Icon name="truck" size={14} color={T.brand} />
            Spedisci a sede
          </button>
        )}

        {/* Toggle "Solo gusti compilati": nasconde dal foglio i gusti che nel
            periodo attivo non hanno alcun dato. Non tocca i dati, e' solo un
            filtro visivo. Il numero accanto = quanti gusti resterebbero. */}
        {(() => {
          const totale = gustiOrdinati.length
          const visibili = soloCompilati ? gustiVisibili.length : gustiCompilatiSet.size
          const attivabile = totale > 0
          return (
            <button
              onClick={() => setSoloCompilati(v => !v)}
              disabled={!attivabile}
              aria-pressed={soloCompilati}
              title={soloCompilati
                ? 'Mostra di nuovo tutti i gusti del ricettario'
                : 'Nascondi i gusti senza alcun dato nel periodo visualizzato'}
              style={{
                padding: '8px 14px', minHeight: 40,
                background: soloCompilati ? T.brand : '#FFFFFF',
                color: soloCompilati ? '#FFFFFF' : C.textMid,
                border: `1px solid ${soloCompilati ? T.brand : C.border}`,
                borderRadius: 8,
                fontSize: 12.5, fontWeight: 700,
                cursor: attivabile ? 'pointer' : 'not-allowed',
                opacity: attivabile ? 1 : 0.5,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
              <Icon name="check" size={14} color={soloCompilati ? '#FFFFFF' : C.textMid} />
              <span>Solo compilati</span>
              <span style={{
                fontSize: 11, fontWeight: 800,
                padding: '2px 7px', borderRadius: 999,
                background: soloCompilati ? 'rgba(255,255,255,0.22)' : C.bgSubtle,
                color: soloCompilati ? '#FFFFFF' : C.textSoft,
                fontVariantNumeric: 'tabular-nums',
              }}>{visibili}/{totale}</span>
            </button>
          )
        })()}

        {/* Toggle unita' visualizzazione: g <-> kg. Persistito in localStorage. */}
        <button onClick={toggleUnita}
          title={`Visualizza in ${unitaDisplay === 'g' ? 'kg' : 'g'}`}
          style={{
            padding: '8px 12px', minHeight: 40, marginLeft: 'auto',
            background: '#F8FAFC', color: C.textMid,
            border: `1px solid ${C.border}`, borderRadius: 8,
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
          <span style={{ color: unitaDisplay === 'g' ? T.brand : C.textSoft }}>g</span>
          <span style={{ color: C.borderStr }}>·</span>
          <span style={{ color: unitaDisplay === 'kg' ? T.brand : C.textSoft }}>kg</span>
        </button>
      </div>

      {/* Toolbar navigazione settimana (solo modalita' settimana) - grid 3 col uguali su mobile,
          così Sett.prec / Questa sett / Sett.succ non si schiacciano. Il range data va sopra. */}
      {vista === 'settimana' && (
        <div style={{
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center', gap: 12, marginBottom: 20,
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: isMobile ? '12px 14px' : '12px 16px',
          boxSizing: 'border-box',
        }}>
          <div style={{ flex: 1, textAlign: isMobile ? 'left' : 'center', order: isMobile ? 0 : 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSoft }}>Settimana</div>
            <div style={{ fontSize: isMobile ? 16 : 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{fmtRange(lunediIso)}</div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
            order: isMobile ? 1 : 0,
          }}>
            <button onClick={settimanaPrec}
              style={{ padding: '10px 8px', minHeight: 44, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.textMid }}>
              ← Sett. prec.
            </button>
            <button onClick={oggi}
              style={{ padding: '10px 8px', minHeight: 44, background: '#F8FAFC', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: T.brand }}>
              Questa sett.
            </button>
            <button onClick={settimanaSucc}
              style={{ padding: '10px 8px', minHeight: 44, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.textMid }}>
              Sett. succ. →
            </button>
          </div>
        </div>
      )}

      {/* Toolbar navigazione mese - simmetrica a quella settimana, così l'utente
          può scorrere anche i mesi precedenti/successivi. */}
      {vista === 'mese' && (
        <div style={{
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center', gap: 12, marginBottom: 20,
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: isMobile ? '12px 14px' : '12px 16px',
          boxSizing: 'border-box',
        }}>
          <div style={{ flex: 1, textAlign: isMobile ? 'left' : 'center', order: isMobile ? 0 : 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSoft }}>Mese</div>
            <div style={{ fontSize: isMobile ? 16 : 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{meseLabel()}</div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
            order: isMobile ? 1 : 0,
          }}>
            <button onClick={mesePrec}
              style={{ padding: '10px 8px', minHeight: 44, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.textMid }}>
              ← Mese prec.
            </button>
            <button onClick={meseCorrente}
              style={{ padding: '10px 8px', minHeight: 44, background: '#F8FAFC', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: T.brand }}>
              Questo mese
            </button>
            <button onClick={meseSucc}
              style={{ padding: '10px 8px', minHeight: 44, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.textMid }}>
              Mese succ. →
            </button>
          </div>
        </div>
      )}

      {/* Mini KPI banner: solo Settimana e Mese, mai su Oggi (che e' la vista dei
          dipendenti). 3 numeri compatti, colori tenui: non deve dominare la pagina. */}
      {!loading && (vista === 'settimana' || vista === 'mese') && (
        <KpiCompactBar
          rows={vista === 'settimana' ? righe : (meseData?.righe || [])}
          periodo={vista === 'settimana' ? 'questa settimana' : 'questo mese'}
          unita={unitaDisplay}
        />
      )}

      {/* Suggerimento su mobile per la vista Settimana: 16 colonne su 375px
          sono scomode da compilare — invitiamo a passare a Oggi. */}
      {!loading && isMobile && vista === 'settimana' && (
        <div style={{
          background: '#EFF6FF', border: '1px solid #BFDBFE',
          borderRadius: 10, padding: 12, marginBottom: 12,
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 12.5, color: '#1E3A8A', flex: 1, lineHeight: 1.45 }}>
            Sul cellulare la tabella settimanale scorre in orizzontale. Per compilare in fretta usa <b>Oggi</b>.
          </div>
          <button onClick={() => setVista('oggi')}
            style={{
              padding: '10px 16px', minHeight: 40,
              background: '#1D4ED8', color: '#FFFFFF',
              border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer',
            }}>
            Vai a Oggi
          </button>
        </div>
      )}

      {/* Empty state per il filtro "Solo compilati": se sto filtrando e non
          resta nessun gusto, evito la tabella vuota e do all'utente una
          scorciatoia per tornare alla lista completa. */}
      {!loading && soloCompilati && gustiVisibili.length === 0 && (
        <div style={{
          background: C.bgCard, border: `1px dashed ${C.border}`, borderRadius: 12,
          padding: '18px 20px', marginBottom: 16,
          display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 13, color: C.textMid, flex: 1, lineHeight: 1.5 }}>
            Nessun gusto ha dati nel periodo selezionato. Rimuovi il filtro per vedere tutta la lista o cambia periodo.
          </div>
          <button onClick={() => setSoloCompilati(false)}
            style={{
              padding: '8px 14px', minHeight: 36,
              background: T.brand, color: '#FFFFFF',
              border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer',
            }}>
            Mostra tutti i gusti
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
      ) : vista === 'oggi' ? (
        <VistaOggi
          gusti={gustiVisibili} matrice={matrice} saving={saving}
          onSave={handleSave} readOnly={isAllSedi}
          unita={unitaDisplay}
        />
      ) : vista === 'mese' ? (
        <VistaMese gusti={gustiVisibili} righeMese={meseData?.righe || []} lunediIso={lunediIso} unita={unitaDisplay} onClickGusto={setDrilldownGusto} />
      ) : vista === 'storico' ? (
        <VistaStorico gusti={gustiVisibili} righeStorico={storicoData?.righe || []} inizio={storicoData?.inizio} unita={unitaDisplay} onClickGusto={setDrilldownGusto} onOpenReport={onNavigate ? () => onNavigate('storico') : null} />
      ) : (
        // Settimana × 7 giorni × 2 colonne (PROD/RIMAN) + GUSTO + TOT = 16 colonne.
        // Su 375px non ci stanno, quindi tabella scrolla orizzontalmente e
        // la prima colonna GUSTO è sticky (left:0) per non perdere il contesto.
        // minWidth calcolato così: 160 GUSTO + 14*72 PROD/RIMAN + 110 TOT = ~1278.
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
          overflowX: 'auto', overflowY: 'visible',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
          WebkitOverflowScrolling: 'touch',
        }}>
          <table style={{ width: '100%', minWidth: 1280, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <SortableHeader
                  label="GUSTO"
                  onClick={() => toggleSort('nome')}
                  active={sort.by === 'nome'} dir={sort.dir}
                  style={thGusto}
                />
                {GIORNI.map((g, i) => {
                  // Calcolo data del giorno N per mostrare "gio 4" leggibile.
                  const dIso = addDays(lunediIso, i)
                  const giornoN = new Date(dIso).getDate()
                  return (
                    <th key={g} colSpan={2} style={{ ...thGiorno, borderLeft: `1px solid ${C.border}`, minWidth: 144 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 800, color: C.text,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        whiteSpace: 'nowrap', lineHeight: 1.2,
                      }}>
                        {g} {giornoN}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 6, gap: 4 }}>
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
                  )
                })}
                <SortableHeader
                  label="VENDUTO SETT."
                  onClick={() => toggleSort('venduto')}
                  active={sort.by === 'venduto'} dir={sort.dir}
                  style={{ ...thTot, borderLeft: `2px solid ${C.borderStr}` }}
                />
              </tr>
            </thead>
            <tbody>
              {gustiVisibili.map(({ nome, orfano }) => {
                const gustoKey = normGusto(nome)
                const byData = matrice[gustoKey] || {}
                return (
                  <tr key={gustoKey} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                    <td style={tdGusto}>
                      <NomeGustoConFlag nome={nome} orfano={orfano} onClick={onClickGusto} />
                    </td>
                    {GIORNI.map((_, i) => {
                      const dIso = addDays(lunediIso, i)
                      const cell = byData[dIso] || { prod: 0, riman: 0 }
                      const kProd = `${gustoKey}|${dIso}|produzione_g`
                      const kRim = `${gustoKey}|${dIso}|rimanenza_g`
                      return (
                        <React.Fragment key={dIso}>
                          <td style={{ ...tdInput, borderLeft: `1px solid ${C.border}`, background: '#FFFFFF' }}>
                            <CellInput
                              value={cell.prod || ''}
                              saving={!!saving[kProd]}
                              accent="#0EA5E9" readOnly={isAllSedi}
                              unita={unitaDisplay}
                              onCommit={v => handleSave(gustoKey, dIso, 'produzione_g', v)}
                            />
                          </td>
                          <td style={{ ...tdInput, background: '#FFFEFB' }}>
                            <CellInput
                              value={cell.riman || ''}
                              saving={!!saving[kRim]}
                              accent="#F59E0B" readOnly={isAllSedi}
                              unita={unitaDisplay}
                              onCommit={v => handleSave(gustoKey, dIso, 'rimanenza_g', v)}
                            />
                          </td>
                        </React.Fragment>
                      )
                    })}
                    <td style={{ ...tdTot, borderLeft: `2px solid ${C.borderStr}` }}>
                      {fmtUnita(totali[gustoKey] || 0)}{unitaDisplay === 'kg' ? ' kg' : ' g'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Riga totali di colonna: PROD e RIMAN sommati per giorno su
                tutti i gusti visibili, più totale VENDUTO SETT. Nasconde se
                non ci sono gusti (empty state gestito sopra). */}
            {gustiVisibili.length > 0 && (
              <tfoot>
                <tr style={{ background: '#F1F5F9', borderTop: `2px solid ${C.borderStr}` }}>
                  <td style={{
                    ...tdGusto,
                    background: '#F1F5F9',
                    fontSize: 11, fontWeight: 800,
                    color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    Totali {soloCompilati ? '(filtrati)' : ''}
                  </td>
                  {GIORNI.map((_, i) => {
                    const dIso = addDays(lunediIso, i)
                    const c = totaliColonnaSettimana.perGiorno[dIso] || { prod: 0, riman: 0 }
                    const suffix = unitaDisplay === 'kg' ? ' kg' : ' g'
                    return (
                      <React.Fragment key={dIso}>
                        <td style={{
                          padding: '10px 6px', textAlign: 'center',
                          fontSize: 12.5, fontWeight: 800, color: '#0369A1',
                          background: '#F1F5F9',
                          borderLeft: `1px solid ${C.border}`,
                          fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'",
                          whiteSpace: 'nowrap',
                        }}>
                          {c.prod ? `${fmtUnita(c.prod)}${suffix}` : '—'}
                        </td>
                        <td style={{
                          padding: '10px 6px', textAlign: 'center',
                          fontSize: 12.5, fontWeight: 800, color: '#B45309',
                          background: '#F1F5F9',
                          fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'",
                          whiteSpace: 'nowrap',
                        }}>
                          {c.riman ? `${fmtUnita(c.riman)}${suffix}` : '—'}
                        </td>
                      </React.Fragment>
                    )
                  })}
                  <td style={{
                    ...tdTot,
                    borderLeft: `2px solid ${C.borderStr}`,
                    background: '#FDE68A', fontWeight: 900, fontSize: 14,
                  }}>
                    {fmtUnita(totaliColonnaSettimana.venduto || 0)}{unitaDisplay === 'kg' ? ' kg' : ' g'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11.5, color: C.textSoft, lineHeight: 1.55, maxWidth: 720 }}>
        Quantità in <strong>{unitaDisplay === 'kg' ? 'chilogrammi' : 'grammi'}</strong>. Salvataggio automatico uscendo dal campo (Tab o clic fuori).
      </div>

      {shipDlg && (
        <DialogSpedizione
          state={shipDlg}
          setState={setShipDlg}
          gusti={gustiOrdinati}
          sedi={sedi}
          sedeOrigineId={sedeId}
          righeOggi={(righe || []).filter(r => r.data === new Date().toISOString().slice(0, 10))}
          onConferma={async ({ gusto, kg, destSedeId }) => {
            // Metodo e' org-level: dentro questa view (che gira solo se
            // metodoProduzione='inventario') tutte le sedi is_sede_produzione
            // ricevono come inventario. Le non-produttive prendono via stock PF.
            try {
              const qtaG = Math.round(Number(kg) * 1000)
              const oggiIso = new Date().toISOString().slice(0, 10)
              const sedeOrigineNome = (sedi || []).find(s => s.id === sedeId)?.nome || 'sede origine'
              // 1) scarico sede origine: somma a SPEDITO_G (NON scarto_g)
              const cella = (righe || []).find(r => r.gusto_nome === gusto && r.data === oggiIso)
              const destSede = (sedi || []).find(s => s.id === destSedeId)
              const destInventario = !!destSede?.is_sede_produzione
              const notaOrigine = `Spediti ${Number(kg).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg a ${destSede?.nome || 'altra sede'}`
              const notaOrigineTot = cella?.note ? `${cella.note} · ${notaOrigine}` : notaOrigine
              await salvaCella(orgId, sedeId, gusto, oggiIso, {
                produzione_g: cella?.produzione_g || 0,
                rimanenza_g: cella?.rimanenza_g || 0,
                scarto_g: cella?.scarto_g || 0,
                spedito_g: (cella?.spedito_g || 0) + qtaG,
                note: notaOrigineTot,
              })
              // 2) carico destinazione
              if (destInventario) {
                const { data: cellDest } = await supabase.from('inventario_produzione')
                  .select('produzione_g, rimanenza_g, scarto_g, spedito_g, note')
                  .eq('organization_id', orgId).eq('sede_id', destSedeId)
                  .eq('gusto_nome', gusto).eq('data', oggiIso)
                  .maybeSingle()
                const notaDest = `Ricevuti ${Number(kg).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg da ${sedeOrigineNome}`
                const notaDestTot = cellDest?.note ? `${cellDest.note} · ${notaDest}` : notaDest
                await salvaCella(orgId, destSedeId, gusto, oggiIso, {
                  produzione_g: cellDest?.produzione_g || 0,
                  rimanenza_g: (cellDest?.rimanenza_g || 0) + qtaG,
                  scarto_g: cellDest?.scarto_g || 0,
                  spedito_g: cellDest?.spedito_g || 0,
                  note: notaDestTot,
                })
              } else {
                await caricoProduzionePF({
                  sedeId: destSedeId, prodotto: gusto,
                  quantita: qtaG, unita: 'g',
                  note: `Trasferimento da ${sedeOrigineNome}`,
                })
              }
              // Refresh righe della sede attiva.
              const fresh = await caricaSettimana(orgId, sedeId, lunediIso)
              setRighe(fresh)
              setShipDlg(null)
              notify?.(`Spediti ${kg} kg di ${gusto} a ${destSede?.nome || 'destinazione'}`, true)
            } catch (e) {
              console.error('spedizione:', e)
              notify?.('Errore spedizione: ' + (e.message || 'rete'), false)
            }
          }}
        />
      )}
    </div>
  )
}

// ── Dialog spedizione kg → sede destinazione ─────────────────────────────
// Audit 2026-09-03: aggiunto controllo disponibilità + preview kg nel dropdown
// + warning se richiesto > disponibile + copy corretto (era "scarto" invece di
// "spedito", frase ingannevole).
function DialogSpedizione({ state, setState, gusti, sedi, sedeOrigineId, righeOggi, onConferma }) {
  const update = (k, v) => setState(s => ({ ...s, [k]: v }))
  const close = () => setState(null)
  const sediDest = (sedi || []).filter(s => s.id !== sedeOrigineId && s.attiva !== false)

  // Calcola disponibile OGGI per ogni gusto:
  //   disponibile = produzione_g − scarto_g − spedito_g
  // (Non include la rimanenza del giorno precedente perché non l'abbiamo qui:
  //  quella e' la vetrina "già esposta", che tecnicamente potresti anche spedire
  //  ma tipicamente e' meno onesto. Se serve, l'utente aggiunge a mano.)
  const dispPerGusto = useMemo(() => {
    const m = {}
    for (const r of (righeOggi || [])) {
      const d = (Number(r.produzione_g) || 0) - (Number(r.scarto_g) || 0) - (Number(r.spedito_g) || 0)
      m[r.gusto_nome] = Math.max(0, d)
    }
    return m
  }, [righeOggi])

  const gustiConDati = (gusti || []).filter(g => {
    const key = (g.nome || '').toUpperCase().trim()
    return (dispPerGusto[key] || 0) > 0
  })
  const gustiBase = gustiConDati.length > 0 ? gustiConDati : (gusti || [])

  const dispGrammi = dispPerGusto[state.gusto] || 0
  const dispKg = dispGrammi / 1000
  const kgRichiesti = Number(state.kg) || 0
  const oltreDisp = kgRichiesti > 0 && kgRichiesti > dispKg
  const canConferma = state.gusto && kgRichiesti > 0 && state.destSedeId

  return (
    <div role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, maxWidth: 460, width: '100%', padding: '24px 26px', boxShadow: '0 20px 60px rgba(15,23,42,0.30)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Icon name="truck" size={20} color={T.brand} />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.text }}>Spedisci kg a un'altra sede</h2>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: C.textSoft, lineHeight: 1.5 }}>
          I chili spediti vengono sottratti dalla disponibilità di oggi della sede attuale
          (colonna interna &quot;spedito&quot;, non scarto). La sede destinataria li riceve come
          rimanenza (se in metodo inventario) o come stock vetrina (se in metodo stampi).
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={lblForm}>Gusto</label>
          <select value={state.gusto} onChange={e => update('gusto', e.target.value)} style={inpForm}>
            <option value="">- Seleziona -</option>
            {gustiBase.map(g => {
              const key = normGusto(g.nome)
              const disp = (dispPerGusto[key] || 0) / 1000
              const suffix = disp > 0 ? ` — ${disp.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg disponibili` : ' — nessuna disponibilità oggi'
              return (
                <option key={g.nome} value={key}>{g.nome}{suffix}</option>
              )
            })}
          </select>
          {state.gusto && (
            <div style={{ fontSize: 11.5, color: C.textSoft, marginTop: 6 }}>
              Disponibile oggi: <b style={{ color: dispKg > 0 ? '#166534' : '#B45309' }}>
                {dispKg.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg
              </b>
            </div>
          )}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lblForm}>Quantità (kg)</label>
          <input type="number" min="0" step="0.1" value={state.kg}
            onChange={e => update('kg', e.target.value)}
            placeholder="es. 2.5"
            style={{
              ...inpForm,
              borderColor: oltreDisp ? '#FCA5A5' : inpForm.border,
            }} />
          {oltreDisp && (
            <div style={{
              marginTop: 8, padding: '8px 10px',
              background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8,
              fontSize: 12, color: '#7F1D1D', lineHeight: 1.45,
            }}>
              ⚠ Stai spedendo <b>{kgRichiesti.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg</b>
              {' '}ma la sede oggi ne ha solo <b>{dispKg.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg</b> disponibili.
              Puoi comunque procedere se sai di avere rimanenza del giorno prima da spedire.
            </div>
          )}
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={lblForm}>Sede destinazione</label>
          <select value={state.destSedeId} onChange={e => update('destSedeId', e.target.value)} style={inpForm}>
            <option value="">- Seleziona -</option>
            {sediDest.map(s => (
              <option key={s.id} value={s.id}>
                {s.nome} ({s.is_sede_produzione ? 'inventario' : 'stock vetrina'})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={close} style={btnSecondary}>Annulla</button>
          <button disabled={!canConferma}
            onClick={() => {
              if (oltreDisp) {
                const conferma = window.confirm(
                  `Attenzione: stai spedendo ${kgRichiesti.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg ma la sede oggi ne ha solo ${dispKg.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg disponibili.\n\nProcedi solo se sai che hai rimanenza del giorno prima o altre giacenze.\n\nConfermi la spedizione?`
                )
                if (!conferma) return
              }
              onConferma(state)
            }}
            style={{
              ...btnPrimary,
              opacity: canConferma ? 1 : 0.5,
              cursor: canConferma ? 'pointer' : 'not-allowed',
              background: oltreDisp && canConferma ? '#B45309' : btnPrimary.background,
            }}>
            {oltreDisp ? 'Spedisci comunque' : 'Spedisci'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dialog import file (wizard 4 step) ────────────────────────────────────
// Step:
//   1. 'pick'    - scegli file (drag&drop o input)
//   2. 'mese'    - se mese non rilevato dal nome file, scelta manuale
//   3. 'preview' - mostra diff vs DB (nuovi/divergenti/identici)
//   4. 'apply'   - confermato, applica via onCommit
// Legacy: DialogImport/StepPick/StepSetupMulti rimossi (2026-09-03).
// Rimpiazzati dal wizard universale in components/ImportWizard.jsx.


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
  width: '100%', padding: '10px 12px', minHeight: 44,
  border: `1px solid ${T.border}`, borderRadius: 8,
  fontSize: 16, color: T.text, outline: 'none', background: '#FFFFFF',
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
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick && onClick()
    }
  }
  return (
    <span onClick={onClick} onKeyDown={handleKey}
      role="button" tabIndex={0}
      aria-label={`Ordina per ${label}${active ? (dir === 'asc' ? ' (crescente)' : ' (decrescente)') : ''}`}
      title="Clicca (o premi Invio) per ordinare i gusti su questa colonna"
      style={{
        cursor: 'pointer', userSelect: 'none',
        fontSize: 9, color: active ? T.brand : color, fontWeight: 700,
        padding: '2px 4px', borderRadius: 4,
        background: active ? '#FEE2E2' : 'transparent',
        display: 'inline-flex', alignItems: 'center', gap: 2,
        outlineOffset: 2,
      }}>
      {label}
      {active && <span style={{ fontSize: 8 }}>{dir === 'asc' ? '▲' : '▼'}</span>}
    </span>
  )
}

// ── Onboarding al primo accesso a "Inventario gusti" ──────────────────────
// Modal full-screen che spiega il flusso in 3 step. localStorage flag per
// non rimostrarlo (chiudibile anche con ESC o click backdrop).
function OnboardingInventario({ onClose }) {
  const [step, setStep] = useState(0)
  const steps = [
    {
      iconName: 'clipboard',
      titolo: 'Benvenuto nell\'inventario',
      testo: 'Questo metodo è pensato per chi produce gusti (gelato, yogurt) ma vende formati (cono, coppetta, vaschetta). Il sistema calcola quanto hai venduto a partire da quanto produci e quanto ti resta a fine giornata.',
    },
    {
      iconName: 'edit',
      titolo: 'Compila ogni giorno due valori',
      testo: 'Per ogni gusto inserisci PROD (grammi prodotti) e RIMAN (grammi rimasti a fine giornata). Il VENDUTO si calcola da solo: RIMAN di ieri + PROD di oggi − RIMAN di oggi. Niente scontrini da abbinare.',
    },
    {
      iconName: 'upload',
      titolo: 'Hai già un foglio Excel?',
      testo: 'Premi "Importa file" in alto per caricare il foglio settimanale che usi oggi. Riconosciamo il mese dal nome del file, mappiamo le sedi e ti chiediamo conferma prima di salvare.',
    },
  ]
  const last = step === steps.length - 1
  const s = steps[step]
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 16, maxWidth: 460, width: '100%',
        boxShadow: '0 20px 60px rgba(15,23,42,0.30)',
        padding: '28px 28px 22px',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 18 }}>
          {steps.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 22 : 8, height: 8, borderRadius: 4,
              background: i === step ? T.brand : (i < step ? '#FCA5A5' : C.border),
              transition: 'width 0.2s ease, background 0.2s ease',
            }} />
          ))}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'rgba(110,14,26,0.10)', color: T.brand,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14,
          }}>
            <Icon name={s.iconName} size={30} color={T.brand} />
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.01em', marginBottom: 10 }}>
            {s.titolo}
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, color: C.textMid, lineHeight: 1.55 }}>
            {s.testo}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 22 }}>
          <button onClick={onClose}
            style={{ padding: '10px 14px', minHeight: 40, background: 'transparent', border: 'none', color: C.textSoft, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Salta
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)}
                style={{ padding: '10px 18px', minHeight: 44, background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.textMid, cursor: 'pointer' }}>
                Indietro
              </button>
            )}
            <button onClick={() => last ? onClose() : setStep(step + 1)}
              style={{ padding: '10px 22px', minHeight: 44, background: T.brand, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#FFFFFF', cursor: 'pointer' }}>
              {last ? 'Iniziamo' : 'Avanti →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Icona "gusto non a ricettario" con tooltip ────────────────────────────
// Tooltip portalato su document.body con position:fixed: l'overlay scrollabile
// orizzontale della tabella (overflowX:auto) creava un nuovo paint context che
// CLIPPAVA il tooltip absolute → l'utente vedeva solo un lampo. Con il portal
// il tooltip esce da qualsiasi overflow container.
function IconaOrfano() {
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState(null)
  const ref = useRef(null)

  const open = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      // Posizioniamo SOPRA l'icona, centrato sul triggering element.
      setPos({ top: r.top + window.scrollY - 8, left: r.left + r.width / 2 + window.scrollX })
    }
    setHover(true)
  }
  const close = () => setHover(false)

  return (
    <span
      ref={ref}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onTouchStart={() => (hover ? close() : open())}
      tabIndex={0}
      aria-label="Gusto non nel ricettario"
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%',
        background: '#FEF3C7', color: '#92400E',
        cursor: 'help',
        flexShrink: 0,
      }}>
      <Icon name="warning" size={11} color="#92400E" />
      {hover && pos && typeof document !== 'undefined' && createPortal(
        <div role="tooltip" style={{
          position: 'absolute', top: pos.top, left: pos.left,
          transform: 'translate(-50%, -100%)',
          width: 280, padding: '10px 14px',
          background: '#0F172A', color: '#F8FAFC',
          borderRadius: 10, fontSize: 12, fontWeight: 500, lineHeight: 1.5,
          textAlign: 'left',
          boxShadow: '0 12px 32px rgba(15,23,42,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset',
          zIndex: 2147483600, pointerEvents: 'none',
        }}>
          <strong style={{ color: '#FCD34D', display: 'block', marginBottom: 3 }}>Gusto non nel ricettario</strong>
          Aggiungilo da <em>Ricettario → Nuova ricetta</em> per gestire food cost, allergeni e categorie.
        </div>,
        document.body
      )}
    </span>
  )
}

// ── Nome gusto + (eventuale) icona warning incolonnata a destra ───────────
// Nome a sinistra, icona di alert a destra della cella. Usa justify-content:
// space-between così l'icona resta sempre allineata al margine destro
// indipendentemente dalla lunghezza del nome.
function NomeGustoConFlag({ nome, orfano, onClick }) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      onClick={clickable ? () => onClick(nome) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(nome) } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? 'Clicca per vedere lo storico di questo gusto' : undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%',
        cursor: clickable ? 'pointer' : 'default',
      }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</span>
      {orfano && <IconaOrfano />}
    </div>
  )
}

// ── VistaMese: settimane in colonna, kg venduti per gusto/settimana + totale
// Calcoliamo il venduto da righeMese (riman_prev + prod - riman - scarto)
// raggruppato per settimana ISO del mese.
function VistaMese({ gusti, righeMese, lunediIso, unita = 'g', onClickGusto }) {
  // Sort locale: cliccando l'header di una colonna (settimana, tot venduto,
  // tot prodotto) i gusti si riordinano. Default: nome A->Z.
  const [sort, setSort] = useState({ by: 'nome', dir: 'asc' })
  const toggleSort = (key) => {
    setSort(prev => {
      const same = JSON.stringify(prev.by) === JSON.stringify(key)
      if (same) return { by: key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { by: key, dir: key === 'nome' ? 'asc' : 'desc' }
    })
  }
  const fmtVal = (g) => {
    if (g <= 0) return '-'
    if (unita === 'kg') {
      return (g / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' kg'
    }
    return g.toLocaleString('it-IT') + ' g'
  }
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

  // Applica il sort scelto dall'utente. Nome usa localeCompare IT; per le
  // colonne numeriche pesca dai risultati calcolati in m (per_sett / totVend /
  // totProd). Gusti senza dati restano visibili con valori 0.
  const gustiOrdinati = useMemo(() => {
    const arr = [...(gusti || [])]
    const key = sort.by
    const sgn = sort.dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const an = (a.nome || '').toUpperCase()
      const bn = (b.nome || '').toUpperCase()
      if (key === 'nome') return sgn * an.localeCompare(bn, 'it')
      const ak = normGusto(a.nome); const bk = normGusto(b.nome)
      const ra = m[ak] || { per_sett: [0,0,0,0,0], totProd: 0, totVend: 0 }
      const rb = m[bk] || { per_sett: [0,0,0,0,0], totProd: 0, totVend: 0 }
      let av = 0, bv = 0
      if (key === 'totVend') { av = ra.totVend; bv = rb.totVend }
      else if (key === 'totProd') { av = ra.totProd; bv = rb.totProd }
      else if (key && key.tipo === 'w') {
        av = ra.per_sett[key.settimana] || 0
        bv = rb.per_sett[key.settimana] || 0
      }
      return sgn * (av - bv)
    })
    return arr
  }, [gusti, sort, m])

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
              <SortableHeader
                label="Gusto"
                onClick={() => toggleSort('nome')}
                active={sort.by === 'nome'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              />
              {[1,2,3,4,5].map(w => {
                const key = { tipo: 'w', settimana: w - 1 }
                const active = sort.by?.tipo === 'w' && sort.by?.settimana === w - 1
                return (
                  <SortableHeader key={w}
                    label={`W${w}`}
                    onClick={() => toggleSort(key)}
                    active={active} dir={sort.dir}
                    style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                  />
                )
              })}
              <SortableHeader
                label="Tot. venduto"
                onClick={() => toggleSort('totVend')}
                active={sort.by === 'totVend'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#FEF9EB' }}
              />
              <SortableHeader
                label="Tot. prodotto"
                onClick={() => toggleSort('totProd')}
                active={sort.by === 'totProd'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              />
            </tr>
          </thead>
          <tbody>
            {gustiOrdinati.map(({ nome, orfano }) => {
              const k = normGusto(nome)
              const r = m[k] || { per_sett: [0,0,0,0,0], totProd: 0, totVend: 0 }
              return (
                <tr key={k} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                  <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: C.text }}>
                    <NomeGustoConFlag nome={nome} orfano={orfano} onClick={onClickGusto} />
                  </td>
                  {r.per_sett.map((v, i) => (
                    <td key={i} style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: v > 0 ? C.text : C.textSoft, fontSize: 12.5 }}>
                      {fmtVal(v)}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 800, fontSize: 13, background: '#FEF9EB' }}>
                    {fmtVal(r.totVend)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: C.textMid, fontSize: 12.5 }}>
                    {fmtVal(r.totProd)}
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
function VistaStorico({ gusti, righeStorico, inizio, unita = 'g', onClickGusto, onOpenReport }) {
  // Sort locale: header cliccabili su Gusto, ciascun mese, e i 3 totali.
  const [sort, setSort] = useState({ by: 'nome', dir: 'asc' })
  const toggleSort = (key) => {
    setSort(prev => {
      const same = JSON.stringify(prev.by) === JSON.stringify(key)
      if (same) return { by: key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { by: key, dir: key === 'nome' ? 'asc' : 'desc' }
    })
  }
  const fmtTot = (g) => {
    if (g <= 0) return '-'
    return unita === 'kg'
      ? (g / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })
      : g.toLocaleString('it-IT')
  }
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
    // Indicizza venduto per gusto+mese + totali prodotto/scarto per gusto.
    const idx = {}
    const totProd = {}
    const totScarto = {}
    for (const { nome } of (gusti || [])) {
      idx[normGusto(nome)] = mesi.map(() => 0)
      totProd[normGusto(nome)] = 0
      totScarto[normGusto(nome)] = 0
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
        totProd[k] = (totProd[k] || 0) + prod
        totScarto[k] = (totScarto[k] || 0) + scarto
      }
    }
    return { mesi, idx, totProd, totScarto }
  }, [gusti, righeStorico])

  // Ordina i gusti in base al sort scelto: 'nome' (localeCompare IT), un
  // singolo mese (chiave YYYY-MM), 'totProd', 'totVend' (= somma su mesi),
  // 'totScarto'.
  const gustiOrdinati = useMemo(() => {
    const arr = [...(gusti || [])]
    const key = sort.by
    const sgn = sort.dir === 'asc' ? 1 : -1
    const sumArr = (a) => (a || []).reduce((s, v) => s + v, 0)
    arr.sort((a, b) => {
      const an = (a.nome || '').toUpperCase()
      const bn = (b.nome || '').toUpperCase()
      if (key === 'nome') return sgn * an.localeCompare(bn, 'it')
      const ak = normGusto(a.nome); const bk = normGusto(b.nome)
      const arrA = data.idx[ak] || []
      const arrB = data.idx[bk] || []
      let av = 0, bv = 0
      if (key === 'totProd') { av = data.totProd[ak] || 0; bv = data.totProd[bk] || 0 }
      else if (key === 'totScarto') { av = data.totScarto[ak] || 0; bv = data.totScarto[bk] || 0 }
      else if (key === 'totVend') { av = sumArr(arrA); bv = sumArr(arrB) }
      else if (key && key.tipo === 'mese') {
        const i = data.mesi.findIndex(m => m.key === key.meseKey)
        if (i >= 0) { av = arrA[i] || 0; bv = arrB[i] || 0 }
      }
      return sgn * (av - bv)
    })
    return arr
  }, [gusti, sort, data])

  async function esportaXlsx() {
    try {
      const XLSX = await loadXLSX()
      const header = ['Gusto', ...data.mesi.map(m => m.label), 'Tot. prodotto', 'Tot. venduto', 'Tot. scarto']
      const rows = [header]
      for (const { nome } of (gusti || [])) {
        const k = normGusto(nome)
        const arr = data.idx[k] || data.mesi.map(() => 0)
        const tot = arr.reduce((s, v) => s + v, 0)
        const toUnit = (g) => unita === 'kg' ? Number((g / 1000).toFixed(2)) : g
        rows.push([
          nome,
          ...arr.map(toUnit),
          toUnit(data.totProd[k] || 0),
          toUnit(tot),
          toUnit(data.totScarto[k] || 0),
        ])
      }
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, `Storico ${unita}`)
      const ts = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `storico-produzione-${ts}.xlsx`)
    } catch (e) {
      console.error('Export xlsx fallito:', e)
    }
  }

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Storico vendite ({unita}) · Ultimi 6 mesi
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onOpenReport && (
            <button onClick={onOpenReport}
              title="Apri il report analitico completo con KPI, grafici e trend"
              style={{
                padding: '8px 14px', minHeight: 36,
                background: T.brand, color: '#FFFFFF', border: 'none', borderRadius: 8,
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
              }}>
              <Icon name="barChart" size={13} color="#FFFFFF"/>
              Report analitico completo
            </button>
          )}
          <button onClick={esportaXlsx}
            title="Scarica lo storico in Excel"
            style={{
              padding: '8px 14px', minHeight: 36,
              background: '#FFFFFF', color: T.brand, border: `1px solid ${T.brand}55`, borderRadius: 8,
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            }}>
            <Icon name="download" size={13} color={T.brand}/>
            Esporta Excel
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <SortableHeader
                label="Gusto"
                onClick={() => toggleSort('nome')}
                active={sort.by === 'nome'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', left: 0, background: '#F8FAFC' }}
              />
              {data.mesi.map(m => {
                const key = { tipo: 'mese', meseKey: m.key }
                const active = sort.by?.tipo === 'mese' && sort.by?.meseKey === m.key
                return (
                  <SortableHeader key={m.key}
                    label={m.label}
                    onClick={() => toggleSort(key)}
                    active={active} dir={sort.dir}
                    style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 80 }}
                  />
                )
              })}
              <SortableHeader
                label="Tot. prodotto"
                onClick={() => toggleSort('totProd')}
                active={sort.by === 'totProd'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#F0FDF4' }}
              />
              <SortableHeader
                label="Tot. venduto"
                onClick={() => toggleSort('totVend')}
                active={sort.by === 'totVend'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#FEF9EB' }}
              />
              <SortableHeader
                label="Tot. scarto"
                onClick={() => toggleSort('totScarto')}
                active={sort.by === 'totScarto'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#FEF2F2' }}
              />
            </tr>
          </thead>
          <tbody>
            {gustiOrdinati.map(({ nome, orfano }) => {
              const k = normGusto(nome)
              const arr = data.idx[k] || data.mesi.map(() => 0)
              const tot = arr.reduce((s, v) => s + v, 0)
              const max = Math.max(1, ...arr)
              return (
                <tr key={k} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                  <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: C.text, position: 'sticky', left: 0, background: C.bgCard, minWidth: 180 }}>
                    <NomeGustoConFlag nome={nome} orfano={orfano} onClick={onClickGusto} />
                  </td>
                  {arr.map((v, i) => (
                    <td key={i} style={{ padding: '4px 8px', textAlign: 'right', ...TNUM, color: v > 0 ? C.text : C.textSoft, fontSize: 12, position: 'relative' }}>
                      {v > 0 && (
                        <div style={{ position: 'absolute', left: 4, right: 4, bottom: 2, height: 3, background: '#F0EAE6', borderRadius: 2 }}>
                          <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: T.brand, borderRadius: 2 }} />
                        </div>
                      )}
                      <span style={{ position: 'relative', zIndex: 1 }}>
                        {fmtTot(v)}
                      </span>
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: '#166534', fontWeight: 800, fontSize: 13, background: '#F0FDF4' }}>
                    {fmtTot(data.totProd[k] || 0)} {unita}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 800, fontSize: 13, background: '#FEF9EB' }}>
                    {fmtTot(tot)} {unita}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: '#B91C1C', fontWeight: 800, fontSize: 13, background: '#FEF2F2' }}>
                    {fmtTot(data.totScarto[k] || 0)} {unita}
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

// ── KpiCompactBar: mini-banner con 3 numeri sintetici per il titolare ─────
// Su Settimana e Mese. Volutamente compatto (~52px altezza), colori tenui:
// il dipendente che apre Produzione non deve essere sommerso di numeri.
// Deep dive analitici stanno in P&L, Confronto sedi, Storico.
// ── DrilldownGustoModal: dettaglio storico 90 giorni di un singolo gusto ──
// Aperto quando l'utente clicca sul nome di un gusto in Settimana/Mese/Storico.
// Compact: 4 KPI + sparkline giornaliera + note ricettario. Non e' un editor.
function DrilldownGustoModal({ gusto, orgId, sedeId, isAllSedi, sediProdIds, unita = 'g', ricettario, onClose }) {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId || !gusto) return
    let alive = true
    setLoading(true)
    const oggi = new Date()
    const from = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 90).toISOString().slice(0, 10)
    let q = supabase.from('inventario_produzione')
      .select('data, produzione_g, rimanenza_g, scarto_g, sede_id')
      .eq('organization_id', orgId)
      .eq('gusto_nome', gusto)
      .gte('data', from)
      .order('data')
      .limit(100000)
    const sediSet = (isAllSedi && Array.isArray(sediProdIds) && sediProdIds.length > 0) ? sediProdIds : (sedeId ? [sedeId] : [])
    if (sediSet.length > 0) q = q.in('sede_id', sediSet)
    q.then(({ data }) => {
      if (!alive) return
      // Aggrega per data (somma cross-sede se piu di una)
      const perData = {}
      for (const r of (data || [])) {
        if (!perData[r.data]) perData[r.data] = { data: r.data, prod: 0, riman: 0, scarto: 0 }
        perData[r.data].prod += Number(r.produzione_g) || 0
        perData[r.data].riman += Number(r.rimanenza_g) || 0
        perData[r.data].scarto += Number(r.scarto_g) || 0
      }
      const arr = Object.values(perData).sort((a, b) => a.data.localeCompare(b.data))
      setRows(arr); setLoading(false)
    }).catch(() => { if (alive) { setRows([]); setLoading(false) } })
    return () => { alive = false }
  }, [orgId, gusto, sedeId, isAllSedi, sediProdIds])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stats = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { prod: 0, venduto: 0, scarto: 0, giorni: 0, avgProd: 0, prodByDay: [] }
    }
    let prod = 0, scarto = 0
    let rimanPrev = 0, prevD = null, venduto = 0
    for (const r of rows) {
      const d = new Date(r.data)
      if (prevD !== null) {
        const diff = Math.round((d - prevD) / 86400000)
        if (diff !== 1) rimanPrev = 0
      }
      const v = Math.max(0, rimanPrev + r.prod - r.riman - r.scarto)
      venduto += v
      rimanPrev = r.riman; prevD = d
      prod += r.prod; scarto += r.scarto
    }
    const giorni = rows.length
    const avgProd = giorni > 0 ? prod / giorni : 0
    return { prod, venduto, scarto, giorni, avgProd, prodByDay: rows.map(r => r.prod) }
  }, [rows])

  const fmt = (g) => {
    if (g <= 0) return '0'
    return unita === 'kg'
      ? (g / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })
      : g.toLocaleString('it-IT')
  }
  const noteRicettario = useMemo(() => {
    if (!ricettario?.ricette) return null
    const gU = String(gusto || '').trim().toUpperCase()
    const r = Object.values(ricettario.ricette).find(x => String(x.nome || '').trim().toUpperCase() === gU)
    return r?.note || null
  }, [ricettario, gusto])

  const maxProd = Math.max(1, ...stats.prodByDay)

  return (
    <div role="dialog" aria-modal="true" aria-label={`Dettaglio ${gusto}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 16, maxWidth: 620, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(15,23,42,0.30)',
        padding: '22px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Dettaglio gusto · Ultimi 90 giorni
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{gusto}</h2>
          </div>
          <button onClick={onClose} aria-label="Chiudi"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.textSoft, width: 40, height: 40, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={18}/>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Caricamento…</div>
        ) : stats.giorni === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Nessun dato nei 90 giorni.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              <KpiTile label="Prodotto" value={fmt(stats.prod)} unit={unita} color={C.text} bg="#F8FAFC"/>
              <KpiTile label="Venduto stimato" value={fmt(stats.venduto)} unit={unita} color={T.brand} bg="#FEF9EB"/>
              <KpiTile label="Scarto" value={fmt(stats.scarto)} unit={unita} color={stats.scarto > 0 ? '#B91C1C' : C.textSoft} bg={stats.scarto > 0 ? '#FEF2F2' : '#F8FAFC'}/>
              <KpiTile label="Media giornaliera" value={fmt(stats.avgProd)} unit={unita} color="#166534" bg="#F0FDF4"/>
            </div>

            {/* Sparkline giornaliera semplice: divs colorate */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Andamento produzione ({stats.giorni} giorni con dati)
              </div>
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 1,
                height: 60, background: '#F8FAFC', borderRadius: 8, padding: 6,
              }}>
                {stats.prodByDay.map((v, i) => (
                  <div key={i} title={`${rows[i]?.data}: ${fmt(v)} ${unita}`}
                    style={{
                      flex: 1, minWidth: 2,
                      height: `${(v / maxProd) * 100}%`,
                      background: v > 0 ? T.brand : 'transparent',
                      borderRadius: 1, opacity: 0.9,
                    }}/>
                ))}
              </div>
            </div>

            {noteRicettario && (
              <div style={{
                background: '#F8FAFC', border: `1px solid ${C.border}`,
                borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 12.5, color: C.text, lineHeight: 1.5,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Note dal ricettario</div>
                {noteRicettario}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function KpiCompactBar({ rows, periodo, unita = 'g' }) {
  const stats = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { prod: 0, venduto: 0, scarto: 0, scartoPct: 0, gustiN: 0, gustiRimanAlta: [] }
    }
    let prod = 0, scarto = 0
    // Aggreghiamo per gusto: prod totale, scarto totale, rimanenza finale.
    const perG = {}
    for (const r of rows) {
      const p = Number(r.produzione_g) || 0
      const s = Number(r.scarto_g) || 0
      const rm = Number(r.rimanenza_g) || 0
      prod += p; scarto += s
      const g = r.gusto_nome
      if (!perG[g]) perG[g] = { prod: 0, scarto: 0, rimanFin: 0, rimanFinData: null }
      perG[g].prod += p
      perG[g].scarto += s
      if (!perG[g].rimanFinData || r.data > perG[g].rimanFinData) {
        perG[g].rimanFinData = r.data
        perG[g].rimanFin = rm
      }
    }
    // Alert "rimanenza alta": rimanenza finale > 100% della produzione totale
    // del periodo per quel gusto = probabilmente venditure lente.
    const gustiRimanAlta = Object.entries(perG)
      .filter(([, v]) => v.prod > 0 && v.rimanFin > v.prod)
      .map(([g]) => g)
    const rimanFinale = Object.values(perG).reduce((s, v) => s + v.rimanFin, 0)
    const venduto = Math.max(0, prod - scarto - rimanFinale)
    const scartoPct = prod > 0 ? (scarto / prod) * 100 : 0
    return { prod, venduto, scarto, scartoPct, gustiN: Object.keys(perG).length, gustiRimanAlta }
  }, [rows])

  const fmt = (g) => {
    if (g <= 0) return '0'
    return unita === 'kg'
      ? (g / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })
      : g.toLocaleString('it-IT')
  }
  const scartoColor = stats.scartoPct >= 5 ? '#B91C1C' : stats.scartoPct >= 2 ? '#B45309' : '#166534'
  const scartoBg = stats.scartoPct >= 5 ? '#FEF2F2' : stats.scartoPct >= 2 ? '#FEF9EB' : '#F0FDF4'

  const hasAlerts = stats.scartoPct >= 5 || stats.gustiRimanAlta.length > 0
  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 8, marginBottom: 14,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8,
      }}>
        <KpiTile label={`Prodotto ${periodo}`} value={fmt(stats.prod)} unit={unita} color={C.text} bg="#F8FAFC"/>
        <KpiTile label="Venduto stimato" value={fmt(stats.venduto)} unit={unita} color={T.brand} bg="#FEF9EB"/>
        <KpiTile label={`Scarto ${stats.scartoPct > 0 ? '(' + stats.scartoPct.toFixed(1) + '%)' : ''}`.trim()} value={fmt(stats.scarto)} unit={unita} color={scartoColor} bg={scartoBg}/>
      </div>
      {hasAlerts && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.borderSoft || '#F1F5F9'}`,
        }}>
          {stats.scartoPct >= 5 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#FEF2F2', color: '#B91C1C',
              border: '1px solid #FCA5A5', borderRadius: 999,
              padding: '3px 10px', fontSize: 11, fontWeight: 700,
            }} title="Lo scarto e' oltre il 5% del prodotto: probabilmente stai producendo piu di quanto vendi.">
              ⚠ Scarto sopra il 5%
            </span>
          )}
          {stats.gustiRimanAlta.length > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#FEF9EB', color: '#B45309',
              border: '1px solid #FCD34D', borderRadius: 999,
              padding: '3px 10px', fontSize: 11, fontWeight: 700,
            }} title={`Gusti con rimanenza superiore alla produzione del periodo: ${stats.gustiRimanAlta.slice(0, 8).join(', ')}`}>
              ⚠ {stats.gustiRimanAlta.length} gust{stats.gustiRimanAlta.length === 1 ? 'o' : 'i'} con rimanenza alta
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function KpiTile({ label, value, unit, color, bg }) {
  return (
    <div style={{
      background: bg, borderRadius: 10, padding: '10px 12px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      minHeight: 52,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: C.textSoft,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 800, color, ...TNUM, marginTop: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value} <span style={{ fontSize: 12, color: C.textSoft, fontWeight: 600 }}>{unit}</span>
      </div>
    </div>
  )
}

// ── VistaOggi: lista verticale mobile-first per il dipendente ─────────────
// Mostra SOLO il giorno corrente (today). Per ogni gusto, 2 input grandi
// (PROD, RIMAN). Pensata per essere usata in laboratorio dal cellulare.
function VistaOggi({ gusti, matrice, saving, onSave, readOnly, unita = 'g' }) {
  const oggiIso = new Date().toISOString().slice(0, 10)
  return (
    <div>
      <div style={{
        background: '#FEF9EB', border: '1px solid #FCD34D', borderRadius: 10,
        padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400E',
      }}>
        <strong>Oggi {new Date(oggiIso).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' })}</strong>
        &nbsp;- Compila PROD (quanto hai prodotto) e RIMAN (quanto e' rimasto a fine giornata). I valori si salvano automaticamente.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {gusti.map(({ nome, orfano }) => {
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
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {nome}
                  {orfano && <IconaOrfano />}
                </div>
                {cell.venduto != null && (
                  <div style={{ fontSize: 11, color: C.textSoft }}>
                    venduto stimato: <strong style={{ color: T.brand, ...TNUM }}>
                      {unita === 'kg'
                        ? (Number(cell.venduto) / 1000).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' kg'
                        : Number(cell.venduto).toLocaleString('it-IT') + ' g'}
                    </strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <BigField
                  label="PROD oggi"
                  accent="#0EA5E9"
                  value={cell.prod || 0}
                  saving={!!saving[kProd]} readOnly={readOnly}
                  unita={unita}
                  onCommit={v => onSave(gKey, oggiIso, 'produzione_g', v)}
                />
                <BigField
                  label="RIMAN. fine giornata"
                  accent="#F59E0B"
                  value={cell.riman || 0}
                  saving={!!saving[kRim]} readOnly={readOnly}
                  unita={unita}
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
// Su blur formattiamo con punto migliaia IT (1.100, 2.000, 3.500). Su focus
// togliamo il punto così l'utente può editare senza confusione.
function BigField({ label, accent, value, saving, onCommit, readOnly, unita = 'g' }) {
  const [focused, setFocused] = useState(false)
  // Formato visualizzato (in focus = numero "grezzo" senza migliaia, fuori focus = migliaia IT)
  const toDisplay = (g, withSeparator) => {
    if (g === 0 || g == null || g === '') return ''
    if (unita === 'kg') {
      const num = Number(g) / 1000
      return withSeparator
        ? num.toLocaleString('it-IT', { maximumFractionDigits: 2 })
        : String(num).replace('.', ',')
    }
    const num = Number(g)
    return withSeparator ? num.toLocaleString('it-IT') : String(num)
  }
  const [local, setLocal] = useState(toDisplay(value, true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLocal(toDisplay(value, focused === false)) }, [value, unita, focused])
  const parse = (s) => Number((s || '').replace(/\./g, '').replace(',', '.')) || 0
  const commit = () => {
    const raw = parse(local)
    const g = unita === 'kg' ? Math.round(raw * 1000) : Math.round(raw)
    if (g !== Number(value || 0)) onCommit(g)
    setFocused(false)
  }
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, minHeight: 28, lineHeight: 1.25 }}>
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: saving ? 'rgba(110,14,26,0.04)' : (readOnly ? '#F1F5F9' : '#FAFBFC'),
        border: `2px solid ${local ? accent : C.border}`,
        borderRadius: 10, padding: '0 10px',
        minHeight: 52,
      }}>
        <input
          type="text"
          inputMode="numeric"
          value={local}
          readOnly={readOnly}
          onFocus={() => { setFocused(true); setLocal(toDisplay(value, false)) }}
          onChange={e => { if (!readOnly) setLocal(e.target.value.replace(/[^\d.,]/g, '')) }}
          onBlur={readOnly ? undefined : commit}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          placeholder="0"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 18, fontWeight: 700, color: C.text, textAlign: 'right',
            padding: '12px 0', minWidth: 0,
            cursor: readOnly ? 'default' : 'text',
            ...TNUM,
          }}
        />
        <span style={{ fontSize: 12, color: C.textSoft, fontWeight: 600 }}>{unita}</span>
      </div>
    </label>
  )
}

// ── Cella input controllata con salvataggio on-blur ───────────────────────
// Lo state locale serve solo a non commitare ad ogni keypress. Su blur (o
// Enter) chiama onCommit con il valore numerico finale. Su mobile font 16
// per non far zoomare iOS. Quando NON è in focus, numeri ≥1000 con punto
// migliaia IT (1.100, 2.000, 3.500): leggibilità a colpo d'occhio.
function CellInput({ value, saving, accent, onCommit, readOnly, unita = 'g' }) {
  const isMobile = useIsMobile()
  const [focused, setFocused] = useState(false)
  // Grouping manuale (1234567 → "1.234.567"): garantito su qualsiasi runtime,
  // anche se Intl ICU non è full. Fallback safe per il display in cella.
  const groupIT = (intStr) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const toDisplay = (g, withSeparator) => {
    if (g === '' || g === 0 || g == null) return ''
    if (unita === 'kg') {
      const num = Number(g) / 1000
      if (!withSeparator) return String(num).replace('.', ',')
      const [intP, decP] = num.toFixed(2).split('.')
      const decTrim = decP.replace(/0+$/, '')
      return groupIT(intP) + (decTrim ? ',' + decTrim : '')
    }
    const num = Math.round(Number(g))
    if (!withSeparator) return String(num)
    return groupIT(String(num))
  }
  const [local, setLocal] = useState(toDisplay(value, true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLocal(toDisplay(value, focused === false)) }, [value, unita, focused])
  const parse = (s) => Number((s || '').replace(/\./g, '').replace(',', '.')) || 0
  const commit = () => {
    const raw = parse(local)
    const g = unita === 'kg' ? Math.round(raw * 1000) : Math.round(raw)
    if (g !== Number(value || 0)) onCommit(g)
    setFocused(false)
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      value={local}
      readOnly={readOnly}
      onFocus={() => { setFocused(true); setLocal(toDisplay(value, false)) }}
      onChange={e => { if (!readOnly) setLocal(e.target.value.replace(/[^\d.,]/g, '')) }}
      onBlur={readOnly ? undefined : commit}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
      style={{
        width: '100%', minWidth: 64, padding: '10px 8px', textAlign: 'right',
        fontSize: isMobile ? 16 : 13, fontFamily: 'inherit', boxSizing: 'border-box',
        border: 'none', outline: 'none',
        background: saving ? 'rgba(110,14,26,0.05)' : 'transparent',
        color: C.text, fontWeight: local ? 700 : 400,
        borderBottom: `2px solid ${local ? accent : 'transparent'}`,
        cursor: readOnly ? 'default' : 'text',
        ...TNUM,
      }}
    />
  )
}

// ── Stili tabella ─────────────────────────────────────────────────────────
// Audit 2026-06-24: header colonne giorno della settimana erano tagliati su
// mobile (es. "GIO 4" sovrapposto a PROD/RIMAN). Soluzione: minWidth 72px
// per cella input + sticky left sulla colonna GUSTO + minWidth tabella 1280
// così su 375px lo scroll orizzontale funziona ma il contesto resta visibile.
const thGusto = {
  padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em',
  position: 'sticky', left: 0, background: '#F8FAFC', zIndex: 2,
  minWidth: 160,
  boxShadow: '2px 0 0 rgba(15,23,42,0.04)',
}
const thGiorno = { padding: '8px 4px', textAlign: 'center', whiteSpace: 'nowrap' }
const thTot = {
  padding: '12px 14px', textAlign: 'right', fontSize: 11, fontWeight: 800,
  color: T.brand, textTransform: 'uppercase', letterSpacing: '0.06em',
  background: '#FEF3C7', minWidth: 120, whiteSpace: 'nowrap',
}
const tdGusto = {
  padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.text,
  position: 'sticky', left: 0, background: C.bgCard, zIndex: 1,
  minWidth: 160,
  boxShadow: '2px 0 0 rgba(15,23,42,0.04)',
}
const tdInput = { padding: 0, minWidth: 72 }
const tdTot = {
  padding: '10px 14px', textAlign: 'right', fontSize: 14, fontWeight: 800,
  color: T.brand, background: '#FEF9EB',
  fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'",
  whiteSpace: 'nowrap',
}

