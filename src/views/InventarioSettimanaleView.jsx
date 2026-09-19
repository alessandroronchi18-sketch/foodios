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
import { color as T, radius as R, shadow as S, font, space as SP, typo, ui, ui3, z as Z } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmModal'
import { C, TNUM, PageHeader, TabellaOSchede } from './_shared'
import ImportWizard from '../components/ImportWizard'
import Skeleton from '../components/Skeleton'
import { ssave, sload } from '../lib/storage'
import { SK_MAG } from '../lib/storageKeys'
import {
  elencoGusti, caricaSettimana, salvaCella, calcolaVendutoSettimana,
  rimanenzaDiPartenza,
  totaliVenduti, dettaglioVenduto, serieVendutoMultiSede,
  totaliPerGusto, GIORNI_RIPORTO_MAX, lunediDellaSettimana, normGusto,
  scaloMagazzinoPerGusto, ricettaDelGusto,
  fetchAllInventarioProduzione, caricaStoricoMensile,
  COLONNE_VENDUTO, colonneSenzaRicevuto, eColonnaRicevutoMancante,
} from '../lib/inventarioProduzione'
import { loadXLSX } from '../lib/xlsx'
import { supabase } from '../lib/supabase'
import { caricoProduzionePF } from '../lib/stockPF'
import { formatLocalDate, todayLocal, aggiungiGiorni } from '../lib/dateLocal'

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
// Nomi lunghi dei mesi in italiano (VistaMese e VistaStorico usano indici 0..11).
const MESI_LABEL = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

function addDays(dateIso, n) {
  const d = new Date(dateIso); d.setDate(d.getDate() + n)
  return formatLocalDate(d)
}

function fmtRange(lunediIso) {
  const lun = new Date(lunediIso + 'T12:00')
  const dom = new Date(lunediIso + 'T12:00'); dom.setDate(dom.getDate() + 6)
  const f = d => d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  return `${f(lun)} - ${f(dom)} ${dom.getFullYear()}`
}

function fmtG(n) {
  if (n == null) return '-'
  return Number(n).toLocaleString('it-IT', { useGrouping: 'always' })
}

// Scorciatoia per le dimensioni del testo dai token (font.size).
const TS = font.size

// ── I due colori che distinguono PROD da RIMAN ──────────────────────────────
//
// Nella tabella della settimana ci sono sette giorni per due colonne: senza un
// segno che le distingua, seguire la colonna giusta scorrendo di lato è un
// lavoro. Il colore lì serve davvero.
//
// Erano un azzurro e un arancione scritti a mano in sei punti. Misurati in un browser
// vero sul fondo della pagina facevano 2,64 e 2,05 contro i 4,5 richiesti: il
// secondo è un giallo su quasi-bianco, praticamente invisibile — e sono
// intestazioni CLICCABILI, quindi chi non le vedeva non sapeva nemmeno di poter
// ordinare la tabella. Adesso fanno 5,4 e 4,9 sul fondo peggiore, e sono
// scritti in un posto solo.
const COL_PROD = '#0369A1'
const COL_RIMAN = '#8F6109'

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
  // Quanto è alto un controllo che si tocca. Un polpastrello misura 44px: qui
  // c'erano dieci `minHeight: altCtrl` scritti a mano, e 40 non è una misura, è
  // "quasi". Adesso la misura è una sola e sta in theme.js.
  const altCtrl = ui3(isMobile, isTablet, ui.ctrlH)
  // Gusti per cui abbiamo già detto "non ha una ricetta": una volta basta.
  const avvisatiSenzaRicetta = useRef(new Set())
  // Giorno mostrato dalla vista "Oggi": si può tornare a ieri per chiudere
  // una giornata dimenticata.
  const chiediConferma = useConfirm()
  const [giornoOggi, setGiornoOggi] = useState(() => todayLocal())
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
      return (n / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 0, maximumFractionDigits: 2 })
    }
    return n.toLocaleString('it-IT', { useGrouping: 'always' })
  }
  // Parse input utente -> grammi (per CellInput/BigField).
  const parseToG = (val) => {
    const n = Number((val || '').toString().replace(',', '.')) || 0
    return unitaDisplay === 'kg' ? Math.round(n * 1000) : Math.round(n)
  }

  // Lista gusti = unione di ricettario + gusti orfani (presenti in DB ma
  // non nel ricettario). Così un file importato con nomi non ancora a
  // ricettario non viene "nascosto" nel foglio settimanale.
  // Cambiare il giorno nella vista "Oggi" sposta anche la settimana caricata,
  // perché la matrice contiene solo i 7 giorni caricati.
  //
  // Prima questo stava in un useEffect che guardava sia `giornoOggi` sia
  // `lunediIso`, e il risultato era che **i bottoni "settimana precedente" e
  // "mese precedente" non funzionavano**: si premeva, `lunediIso` tornava
  // indietro, l'effetto scattava, vedeva che `giornoOggi` (cioè oggi) era
  // fuori da quella settimana e riportava tutto al punto di partenza. Dalla
  // settimana corrente non si usciva.
  //
  // È il difetto classico dell'effetto che "corregge" uno stato guardandone un
  // altro: due comandi che scrivono la stessa variabile si combattono, e vince
  // quello che parte per ultimo. La correzione non è aggiustare la condizione,
  // è non avere l'effetto: chi cambia il giorno sposta anche la settimana, in
  // un gesto solo, e chi cambia la settimana non viene disturbato.
  const cambiaGiorno = useCallback((nuovoGiorno) => {
    setGiornoOggi(nuovoGiorno)
    setLunediIso(prec => {
      const fine = addDays(prec, 6)
      return (nuovoGiorno < prec || nuovoGiorno > fine)
        ? lunediDellaSettimana(nuovoGiorno)
        : prec
    })
  }, [])

  // I 7 giorni della settimana mostrata. `righe` ne contiene di più: i
  // giorni PRIMA del lunedi servono come rimanenza di partenza per il calcolo
  // del venduto, ma non vanno contati. Tutto cio' che si somma a schermo usa
  // questa lista, non `righe`: la banda dei KPI in cima sommava la produzione
  // di 8 giorni mentre la tabella sotto ne mostrava 7, e i due numeri non
  // tornavano mai.
  const righeSettimana = useMemo(() => {
    const fine = addDays(lunediIso, 6)
    return (righe || []).filter(r => r.data >= lunediIso && r.data <= fine)
  }, [righe, lunediIso])

  const gusti = useMemo(() => elencoGusti(ricettario, righeSettimana), [ricettario, righeSettimana])

  // Gusti senza una ricetta con gli ingredienti: la produzione si registra,
  // ma il magazzino non si scala e quei chili non hanno food cost.
  //
  // Prima non c'era nessun segno a schermo tranne un triangolino arancione
  // accanto al nome: nei dati veri di Mara sono 21 gusti su 32, per
  // 10.788 kg su 25.754 prodotti — il 42% dei chili senza food cost, in
  // silenzio. Un contatore che lo dice vale più di ventuno triangolini.
  const senzaRicetta = useMemo(() => {
    const nomi = []
    for (const g of (gusti || [])) {
      const ric = ricettaDelGusto(ricettario, g.nome)
      const pesa = (ric?.ingredienti || []).some(i => Number(i?.qty1stampo) > 0)
      if (!pesa) nomi.push(normGusto(g.nome))
    }
    const set = new Set(nomi)
    let kgSenza = 0, kgTot = 0
    for (const r of righeSettimana) {
      const kg = (Number(r.produzione_g) || 0) / 1000
      kgTot += kg
      if (set.has(normGusto(r.gusto_nome))) kgSenza += kg
    }
    return {
      nomi, set,
      n: nomi.length,
      nTot: (gusti || []).length,
      kgSenza, kgTot,
      pct: kgTot > 0 ? (kgSenza / kgTot * 100) : 0,
    }
  }, [gusti, ricettario, righeSettimana])

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
              // Nome NORMALIZZATO nella chiave: in produzione ci sono righe
              // scritte "CAFFè FLORA" da un import vecchio, e la pagina cerca
              // "CAFFÈ FLORA". Con la chiave grezza quelle righe finivano in
              // un secondo gruppo invisibile.
              const g = normGusto(r.gusto_nome)
              const k = `${g}|${r.data}`
              if (!map[k]) {
                map[k] = { gusto_nome: g, data: r.data, produzione_g: 0, rimanenza_g: 0, scarto_g: 0, spedito_g: 0 }
              }
              map[k].produzione_g += Number(r.produzione_g) || 0
              // Se una sede non ha scritto la rimanenza, il totale delle sedi
              // non si sa. Sommarla come zero abbassava il gelato in vetrina
              // e il venduto del gruppo usciva gonfiato di quella quantità.
              map[k].rimanenza_g = (map[k].rimanenza_g == null || r.rimanenza_g == null)
                ? null
                : map[k].rimanenza_g + (Number(r.rimanenza_g) || 0)
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
    let alive = true
    const d = new Date(lunediIso + 'T12:00')
    const inizio = formatLocalDate(new Date(d.getFullYear(), d.getMonth(), 1))
    const fine = formatLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 1))
    // fine e' esclusivo → sottraggo 1 giorno per usare lte.
    // Il giorno prima si toglie in GIORNI. `new Date('2026-10-01')` è
    // mezzanotte a Greenwich: togliere 86.400.000 ms e rileggere con
    // `formatLocalDate` torna solo perché l'Italia è avanti rispetto a
    // Greenwich. Con un fuso indietro la finestra del mese si accorcia di un
    // giorno da tutte e due le parti, e il primo e l'ultimo giorno del mese
    // sparirebbero dall'inventario.
    const fineIncl = aggiungiGiorni(fine, -1)
    // Si caricano anche i giorni PRIMA del primo del mese: la rimanenza del
    // giorno precedente e' la giacenza di partenza, e senza quella il primo
    // giorno del mese non si puo' calcolare. Prima partiva dal giorno 1 e il
    // conto del giorno 1 usciva gonfiato (come se la vasca fosse vuota).
    const inizioConGiacenza = aggiungiGiorni(inizio, -GIORNI_RIPORTO_MAX)
    fetchAllInventarioProduzione(orgId, {
      sedeIds: sediProdIds,
      dataFrom: inizioConGiacenza,
      dataTo: fineIncl,
    }).then(data => {
      if (!alive) return
      // Le righe delle diverse sedi NON si sommano qui: ci pensa il motore,
      // che calcola sede per sede e poi somma. Sommarle prima sottraeva due
      // volte i trasferimenti interni (spedito da una sede + rimanenza
      // dell'altra).
      setMeseData({ righe: data || [], inizio, fine })
    }).catch(e => { if (alive) console.error('fetch mese:', e) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, orgId, sediKey, lunediIso, isAllSedi])

  // Caricamento dati STORICO (ultimi 6 mesi) quando si apre vista storico.
  // Usa la RPC storico_inventario_per_mese quando disponibile (aggregazione
  // lato DB, veloce anche su anni di dati); fallback trasparente a fetch
  // paginato + aggregazione client-side se la migration non e' applicata.
  useEffect(() => {
    if (vista !== 'storico' || !orgId || sediProdIds.length === 0) return
    let alive = true
    const oggi = new Date()
    const inizio = formatLocalDate(new Date(oggi.getFullYear(), oggi.getMonth() - 5, 1))
    const fineIso = formatLocalDate(oggi)
    caricaStoricoMensile(orgId, sediProdIds, inizio, fineIso)
      .then(({ perMese }) => {
        if (!alive) return
        setStoricoData({ perMese: perMese || [], inizio })
      })
      .catch(e => { if (alive) console.error('caricaStoricoMensile:', e) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, orgId, sediKey, isAllSedi])

  const matrice = useMemo(() => calcolaVendutoSettimana(righe, lunediIso), [righe, lunediIso])
  // Quanto era rimasto il giorno prima di quello che si sta compilando. Si
  // legge dalle righe grezze e non dalla matrice, che copre solo i 7 giorni
  // dal lunedì: di lunedì la domenica precedente non ci sarebbe.
  const rimanenzaIeri = useMemo(
    () => rimanenzaDiPartenza(righe, giornoOggi),
    [righe, giornoOggi])
  const totali = useMemo(() => totaliVenduti(matrice), [matrice])
  // Quante celle non tornano e quante non si possono calcolare, per gusto:
  // il totale del venduto non va mostrato muto quando dietro c'e' un giorno
  // in cui i conti non quadrano.
  const dettaglio = useMemo(() => dettaglioVenduto(matrice), [matrice])
  // Totale PROD settimanale per gusto (somma dei 7 giorni). Serve alla colonna
  // "Tot. prodotto" della vista Settimana, uniformata con Mese e Storico.
  const totaliProdSettimana = useMemo(() => {
    const out = {}
    for (const key of Object.keys(matrice || {})) {
      let sum = 0
      for (const cell of Object.values(matrice[key] || {})) {
        sum += Number(cell?.prod) || 0
      }
      out[key] = sum
    }
    return out
  }, [matrice])

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
      if (key === 'totProd') {
        return sgn * ((totaliProdSettimana[ak] || 0) - (totaliProdSettimana[bk] || 0))
      }
      // { tipo: 'prod'|'riman', giorno }
      const dIso = (() => { const d = new Date(lunediIso + 'T12:00'); d.setDate(d.getDate() + key.giorno); return formatLocalDate(d) })()
      const av = (matrice[ak]?.[dIso] || {})[key.tipo === 'prod' ? 'prod' : 'riman'] || 0
      const bv = (matrice[bk]?.[dIso] || {})[key.tipo === 'prod' ? 'prod' : 'riman'] || 0
      return sgn * (av - bv)
    })
    return arr
  }, [gusti, sort, matrice, totali, totaliProdSettimana, lunediIso])

  // Insieme dei nomi (normalizzati) dei gusti con almeno un dato compilato nel
  // periodo attualmente visualizzato. Un gusto e' "compilato" se, per la vista
  // corrente, esiste almeno una riga in cui uno tra prod / riman / scarto /
  // spedito e' > 0. Alimenta il toggle "Solo gusti compilati".
  const gustiCompilatiSet = useMemo(() => {
    const set = new Set()
    let source = []
    if (vista === 'oggi') {
      const oggiIso = todayLocal()
      source = (righe || []).filter(r => r.data === oggiIso)
    } else if (vista === 'settimana') {
      source = righeSettimana
    } else if (vista === 'mese') {
      source = meseData?.righe || []
    } else if (vista === 'storico') {
      // storicoData ora e' aggregato per mese: ogni riga ha prod/venduto/scarto>0
      // se il gusto ha dati in quel mese. Un gusto e' "compilato" se compare in
      // almeno una riga aggregata (con qualunque valore positivo).
      const setSt = new Set()
      for (const r of (storicoData?.perMese || [])) {
        const p = Number(r.prod_g) || 0
        const v = Number(r.venduto_g) || 0
        const s = Number(r.scarto_g) || 0
        if (p > 0 || v > 0 || s > 0) setSt.add(normGusto(r.gusto_nome))
      }
      return setSt
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
  }, [vista, righe, righeSettimana, meseData, storicoData])

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
  // Totali del MESE dal motore condiviso, per la banda KPI in alto. Serve che
  // la banda e la tabella della vista Mese leggano lo stesso numero: prima la
  // banda se lo ricalcolava con una formula sua e i due numeri non tornavano.
  const totaliMese = useMemo(() => {
    const righeMese = meseData?.righe || []
    if (vista !== 'mese' || righeMese.length === 0) return { venduto: 0, celleNonQuadrate: 0, da: null, a: null }
    const d = new Date(lunediIso + 'T12:00')
    const da = formatLocalDate(new Date(d.getFullYear(), d.getMonth(), 1))
    const a = formatLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    const tot = totaliPerGusto(righeMese, { da, a })
    let venduto = 0, celleNonQuadrate = 0
    for (const t of Object.values(tot)) {
      venduto += t.vendTot
      celleNonQuadrate += t.celleNonQuadrate
    }
    return { venduto, celleNonQuadrate, da, a }
  }, [vista, meseData, lunediIso])

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
      // `ricevuto_g` fa parte della riga come le altre: se non la si rilegge,
      // il patch che parte da `...serverRow` non la porta e chi guarda questo
      // codice non sa nemmeno che esiste. Col ripiego per il database che non
      // ce l'ha ancora (42703): senza, la rilettura fallirebbe in blocco e la
      // protezione contro le due schede aperte sulla stessa cella — che è il
      // motivo per cui questa query esiste — smetterebbe di funzionare in
      // silenzio.
      const colonneRiga = 'produzione_g, rimanenza_g, scarto_g, spedito_g, ricevuto_g'
      const leggiRiga = (cols) => supabase
        .from('inventario_produzione')
        .select(cols)
        .eq('organization_id', orgId).eq('sede_id', sedeId)
        .eq('gusto_nome', gustoNome).eq('data', dataIso)
        .maybeSingle()
      let resRiga = await leggiRiga(colonneRiga)
      if (eColonnaRicevutoMancante(resRiga.error, colonneRiga)) {
        resRiga = await leggiRiga(colonneSenzaRicevuto(colonneRiga))
      }
      const serverRow = resRiga.data
      // Confronto NORMALIZZATO: le righe in memoria possono avere il nome
      // scritto in un'altra grafia (import vecchi). Col confronto grezzo la
      // riga esistente non si trovava, il patch partiva da zero e il gusto
      // si sdoppiava in due serie.
      const esistenteMem = righe.find(r => normGusto(r.gusto_nome) === gustoNome && r.data === dataIso) || {}
      // Usa il server come fonte di verita' se ha dati più recenti.
      const esistente = serverRow
        ? { ...esistenteMem, ...serverRow }
        : esistenteMem
      // Audit 2026-07-01 HIGH: spread `...serverRow` per preservare campi
      // futuri (es. note) e spedito_g aggiunto in audit precedente.
      const patch = {
        ...(serverRow || {}),
        produzione_g: esistente.produzione_g || 0,
        // `?? null` e non `|| 0`: se la rimanenza di quella cella non è mai
        // stata scritta, salvare la PROD non deve scriverci sopra uno zero.
        // Con `|| 0` bastava compilare il PROD di oggi perché il giorno dopo
        // il venduto uscisse negativo di tutto il gelato che era in vetrina.
        rimanenza_g: esistente.rimanenza_g ?? null,
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
        // Se il gusto non ha una ricetta, il magazzino non si scala: prima
        // succedeva senza un fiato. Lo diciamo una volta per gusto, non a
        // ogni cella, per non diventare un fastidio.
        if (!ric && Number(valore) > 0 && !avvisatiSenzaRicetta.current.has(gustoNome)) {
          avvisatiSenzaRicetta.current.add(gustoNome)
          notify?.(`${gustoNome} non ha una ricetta: la produzione la registro, ma il magazzino non si scala e questi chili non hanno food cost. La ricetta si aggiunge dal Ricettario.`, true)
        }
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
        const idx = prev.findIndex(r => normGusto(r.gusto_nome) === gustoNome && r.data === dataIso)
        if (idx >= 0) {
          const next = [...prev]; next[idx] = { ...prev[idx], ...saved }
          return next
        }
        return [...prev, saved]
      })
    } catch (e) {
      console.error('salvaCella:', e)
      // Il messaggio di PostgREST ("JSON object requested, multiple (or no)
      // rows returned") non dice niente a un gelatiere. Il dettaglio va nel
      // console, a schermo va cosa e' successo e cosa fare.
      console.error('salvaCella:', e)
      notify?.(`Non ho salvato ${campo === 'produzione_g' ? 'la produzione' : 'la rimanenza'} di ${gustoNome} del ${new Date(dataIso + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' })}: controlla la connessione e riprova.`, false)
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
        prodByGustoOffset[`${normGusto(r.gusto_nome)}|${diffGg}`] = p
      }
      const totCells = Object.keys(prodByGustoOffset).length
      if (totCells === 0) {
        notify?.('La settimana scorsa non aveva nessuna produzione da copiare.', true)
        return
      }
      const conferma = await chiediConferma({
        title: 'Copio la produzione della settimana scorsa?',
        message:
          `Prendo i valori di produzione della settimana ${fmtRange(lunediScorso)} e li porto in questa.\n\n` +
          `Celle da copiare: ${totCells.toLocaleString('it-IT', { useGrouping: 'always' })}.\n` +
          'Le celle già compilate restano come sono.',
        confirmLabel: 'Copia',
        cancelLabel: 'Annulla',
      })
      if (!conferma) return

      // Trova le celle vuote in this week e copia il PROD scorso.
      // Iteriamo per gusto+offset. Se righeDb attuale ha produzione_g=0 su
      // quella coppia, salviamo.
      const righeDbNow = righeSettimana
      const idxNow = new Map()
      for (const r of righeDbNow) {
        idxNow.set(`${normGusto(r.gusto_nome)}|${r.data}`, r)
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

  // Spostarsi di un mese.
  //
  // `lunediIso` è il cursore di tutta la pagina, e il suo nome dice che deve
  // essere un lunedì: la vista Settimana ci conta sopra per disegnare i sette
  // giorni. Prima la navigazione per mese lo metteva sul PRIMO del mese, che è
  // lunedì una volta su sette: tornando alla scheda Settimana la tabella
  // partiva da un mercoledì qualunque.
  //
  // Si punta al lunedì della settimana che contiene il 15. Il 15 è sempre
  // dentro il mese, e il lunedì di quella settimana cade fra il 9 e il 15 —
  // quindi è sempre nello stesso mese, e l'etichetta in cima resta giusta.
  // Il mezzogiorno serve a non farsi spostare di un giorno dal fuso orario.
  const vaiAlMese = (anno, mese) => {
    const dentroIlMese = new Date(anno, mese, 15, 12, 0, 0)
    setLunediIso(lunediDellaSettimana(formatLocalDate(dentroIlMese)))
  }
  const meseDelCursore = () => {
    const d = new Date(lunediIso + 'T12:00')
    return { anno: d.getFullYear(), mese: d.getMonth() }
  }
  const mesePrec = () => { const { anno, mese } = meseDelCursore(); vaiAlMese(anno, mese - 1) }
  const meseSucc = () => { const { anno, mese } = meseDelCursore(); vaiAlMese(anno, mese + 1) }
  const meseCorrente = () => { const d = new Date(); vaiAlMese(d.getFullYear(), d.getMonth()) }
  const meseLabel = () => {
    const d = new Date(lunediIso + 'T12:00')
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
            // Il livello del tema, non un 9998 scritto a mano: il riquadro di
            // conferma sta a `z.modal + 10` e deve poter uscire SOPRA a questo.
            // Con 9998 la domanda «sovrascrivo il mese?» finiva dietro e il
            // caricamento restava fermo su un pulsante che sembrava morto.
            zIndex: Z.modal, overflowY: 'auto', padding: 0,
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
          <div style={{ fontSize: 12, color: '#1E3A8A', lineHeight: 1.5, marginBottom: 10 }}>
            <Icon name="store" size={13} style={{ marginRight: 6, verticalAlign: 'middle' }}/><strong>Vista aggregata</strong> - Somma delle sedi selezionate qui sotto.
            Compilazione e import disabilitati: per modificare i dati, seleziona una sede
            specifica dal selettore in alto.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>
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
                    padding: '8px 14px', minHeight: altCtrl,
                    border: `1px solid ${sel ? '#1D4ED8' : '#BFDBFE'}`,
                    background: sel ? '#1D4ED8' : '#FFFFFF',
                    color: sel ? '#FFFFFF' : '#1E3A8A',
                    borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                  {sel && <Icon name="check" size={12} color="#FFFFFF" />}{s.nome}
                </button>
              )
            })}
            {sediProduttive.length > 1 && sediFiltro && sediFiltro.size < sediProduttive.length && (
              <button onClick={() => setSediFiltro(new Set(sediProduttive.map(s => s.id)))}
                style={{ padding: '8px 12px', minHeight: altCtrl, fontSize: 12, fontWeight: 600, color: '#1E3A8A', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Seleziona tutte
              </button>
            )}
          </div>
        </div>
      )}

      {/* Segmented control Oggi/Settimana + bottone Importa file */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Le quattro schede. Il contenitore fuori va già a capo, questo no:
            su un telefono da 320px "Storico" finiva fuori dallo schermo e la
            pagina si trascinava di lato di 10px (misurato il 15/09/2026). */}
        <div style={{
          display: 'inline-flex', gap: 2, padding: 4, flexWrap: 'wrap',
          maxWidth: '100%', minWidth: 0,
          background: C.bgSubtle, borderRadius: 10,
        }}>
          {[['oggi','Oggi'], ['settimana','Settimana'], ['mese','Mese'], ['storico','Storico']].map(([k, lbl]) => {
            const sel = vista === k
            return (
              <button key={k} onClick={() => setVista(k)}
                style={{
                  padding: isTablet ? '10px 18px' : '8px 16px', minHeight: altCtrl, fontSize: 12, fontWeight: 700,
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
            padding: '8px 16px', minHeight: altCtrl,
            background: isAllSedi ? '#94A3B8' : T.brand,
            color: '#FFFFFF', border: 'none', borderRadius: 8,
            fontSize: 12, fontWeight: 700,
            cursor: isAllSedi ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            opacity: isAllSedi ? 0.6 : 1,
          }}>
          <Icon name="upload" size={14} color="#FFFFFF" />
          Carica foglio produzione
        </button>

        {/* `saving` e' l'OGGETTO delle celle in salvataggio: un oggetto vuoto
            in JavaScript e' un valore "vero", quindi il bottone "Ripeti
            settimana scorsa" nasceva disabilitato e non si poteva cliccare
            mai. Con lui anche il cursore "attendi" e l'opacita' al 60% erano
            sempre accesi: sembrava un bottone rotto, e lo era. */}
        {vista === 'settimana' && !isAllSedi && (
          <button onClick={ripetiSettimanaScorsa}
            disabled={Object.keys(saving).length > 0}
            title="Copia i valori di PRODUZIONE dalla settimana scorsa in questa settimana. Sovrascrive solo le celle vuote."
            style={{
              padding: '8px 16px', minHeight: altCtrl,
              background: '#FFFFFF', color: T.brand,
              border: `1px solid ${T.brand}`, borderRadius: 8,
              fontSize: 12, fontWeight: 700,
              cursor: Object.keys(saving).length > 0 ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: Object.keys(saving).length > 0 ? 0.6 : 1,
            }}>
            <Icon name="clock" size={14} color={T.brand} />
            Ripeti settimana scorsa
          </button>
        )}

        {/* Un bordeaux solo per schermata. Accanto al bottone pieno di
            "Carica foglio produzione" questo era bordeaux anche lui, bordo e
            scritta: due azioni principali affiancate sono zero azioni
            principali, e su una pagina che serve a scrivere due numeri il
            colore del marchio finiva su tutto tranne che sui numeri. */}
        {!isAllSedi && (sedi || []).filter(s => s.id !== sedeId && s.attiva !== false).length > 0 && (
          <button onClick={() => setShipDlg({ gusto: '', kg: '', destSedeId: '' })}
            style={{
              padding: '8px 16px', minHeight: altCtrl,
              background: C.white, color: C.textMid,
              border: `1px solid ${C.border}`, borderRadius: 8,
              fontSize: TS.sm, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <Icon name="truck" size={14} color={C.textMid} />
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
                padding: '8px 14px', minHeight: altCtrl,
                background: soloCompilati ? T.brand : '#FFFFFF',
                color: soloCompilati ? '#FFFFFF' : C.textMid,
                border: `1px solid ${soloCompilati ? T.brand : C.border}`,
                borderRadius: 8,
                fontSize: 12, fontWeight: 700,
                cursor: attivabile ? 'pointer' : 'not-allowed',
                opacity: attivabile ? 1 : 0.5,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
              <Icon name="check" size={14} color={soloCompilati ? '#FFFFFF' : C.textMid} />
              <span>Solo compilati</span>
              <span style={{
                fontSize: 12, fontWeight: 800,
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
            padding: '8px 12px', minHeight: altCtrl, marginLeft: 'auto',
            background: '#F8FAFC', color: C.textMid,
            border: `1px solid ${C.border}`, borderRadius: 8,
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
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
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textSoft }}>Settimana</div>
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
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textSoft }}>Mese</div>
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
          rows={vista === 'settimana' ? righeSettimana : (meseData?.righe || [])}
          periodo={vista === 'settimana' ? 'questa settimana' : 'questo mese'}
          unita={unitaDisplay}
          vendutoG={vista === 'settimana' ? totaliColonnaSettimana.venduto : totaliMese.venduto}
          celleNonQuadrate={vista === 'settimana'
            ? Object.values(dettaglio).reduce((a, d) => a + d.celleNonQuadrate, 0)
            : totaliMese.celleNonQuadrate}
          da={vista === 'mese' ? totaliMese.da : null}
          a={vista === 'mese' ? totaliMese.a : null}
        />
      )}

      {/* Contatore dei gusti senza ricetta. Non e' un allarme: e' un fatto che
          cambia il significato di tutti i numeri della pagina, e va scritto. */}
      {!loading && senzaRicetta.n > 0 && (vista === 'settimana' || vista === 'oggi') && (
        <div style={{
          background: T.amberLight, border: `1px solid ${T.amber}55`, borderRadius: R.lg,
          padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10,
          alignItems: 'flex-start', flexWrap: 'wrap',
        }}>
          <Icon name="alert" size={14} color={T.amberDark || T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: TS.base, color: T.amberDark || T.amber, lineHeight: 1.5, flex: 1, minWidth: 180 }}>
            <b>{senzaRicetta.n} gust{senzaRicetta.n === 1 ? 'o' : 'i'} su {senzaRicetta.nTot} senza ricetta</b>
            {senzaRicetta.kgSenza > 0 && (
              <>: sono {senzaRicetta.kgSenza.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} kg su {senzaRicetta.kgTot.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} di questa settimana
                {' '}({senzaRicetta.pct.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })}%)</>
            )}
            . La produzione la registro, ma per loro il magazzino non si scala e non c'è food cost.
            <div style={{ marginTop: 3, fontSize: TS.sm, color: T.amber }}>
              {senzaRicetta.nomi.slice(0, 6).join(', ')}{senzaRicetta.nomi.length > 6 ? ` e altri ${senzaRicetta.nomi.length - 6}` : ''}
            </div>
          </div>
          {onNavigate && (
            <button onClick={() => onNavigate('ricettario')}
              style={{
                padding: '9px 14px', minHeight: altCtrl, background: C.white, color: T.amberDark || T.amber,
                border: `1px solid ${T.amber}55`, borderRadius: R.md, fontSize: TS.base, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              Vai al Ricettario
            </button>
          )}
        </div>
      )}

      {/* Il riquadro azzurro che c'era qui diceva «sul cellulare la tabella
          settimanale scorre in orizzontale, per compilare in fretta usa
          Oggi». Da quando la settimana sul telefono è fatta a schede non
          scorre più in orizzontale, quindi l'avviso era diventato falso — e
          intanto si mangiava la prima schermata con un consiglio che nessuno
          seguiva. Chi vuole compilare un giorno solo ha comunque la scheda
          «Oggi» nella barra qui sopra. */}

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
              border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
            }}>
            Mostra tutti i gusti
          </button>
        </div>
      )}

      {loading && vista === 'oggi' ? (
        /* Mentre i dati arrivano si vedono le schede, vuote: quando arrivano
           si riempiono e basta. Prima c'era la scritta "Caricamento…" in
           mezzo alla pagina, poi di colpo tre schede alte 190px: il contenuto
           saltava sotto il pollice, ed è la cosa che fa sembrare un'app fatta
           male. */
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP[3] }} aria-busy="true">
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.xl,
              padding: SP[4], boxShadow: S.xs,
            }}>
              <Skeleton width="58%" height={19} radius={R.sm} style={{ marginBottom: SP[3] }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: SP[3] }}>
                <div>
                  <Skeleton width="70%" height={12} radius={R.xs} style={{ marginBottom: 6 }} />
                  <Skeleton height={52} radius={R.lg} />
                </div>
                <div>
                  <Skeleton width="70%" height={12} radius={R.xs} style={{ marginBottom: 6 }} />
                  <Skeleton height={52} radius={R.lg} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
      ) : vista === 'oggi' ? (
        <VistaOggi
          gusti={gustiVisibili} matrice={matrice} saving={saving}
          onSave={handleSave} readOnly={isAllSedi}
          unita={unitaDisplay}
          giornoIso={giornoOggi}
          onCambiaGiorno={cambiaGiorno}
          rimanenzaIeri={rimanenzaIeri}
        />
      ) : vista === 'mese' ? (
        <VistaMese gusti={gustiVisibili} righeMese={meseData?.righe || []} lunediIso={lunediIso} unita={unitaDisplay} onClickGusto={setDrilldownGusto} />
      ) : vista === 'storico' ? (
        <VistaStorico gusti={gustiVisibili} perMese={storicoData?.perMese || []} inizio={storicoData?.inizio} unita={unitaDisplay} onClickGusto={setDrilldownGusto} onOpenReport={onNavigate ? () => onNavigate('storico') : null} />
      ) : isMobile ? (
        // Sul telefono la stessa settimana diventa una scheda per gusto: la
        // tabella qui sotto è larga 1.280px e non ci sta. Vedi SchedeSettimana.
        <SchedeSettimana
          gusti={gustiVisibili}
          matrice={matrice}
          lunediIso={lunediIso}
          saving={saving}
          onSave={handleSave}
          readOnly={isAllSedi}
          unita={unitaDisplay}
          fmt={fmtUnita}
          totaliProd={totaliProdSettimana}
          totaliVend={totali}
          dettaglio={dettaglio}
          onClickGusto={setDrilldownGusto}
          sort={sort}
          onToggleSort={toggleSort}
          totaliColonna={totaliColonnaSettimana}
          soloCompilati={soloCompilati}
        />
      ) : (
        // telefono: schede — vedi SchedeSettimana, il ramo `isMobile` qui sopra.
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
                        fontSize: 12, fontWeight: 800, color: C.text,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        whiteSpace: 'nowrap', lineHeight: 1.2,
                      }}>
                        {g} {giornoN}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 6, gap: 4 }}>
                        <SortChip label="PROD" color={COL_PROD}
                          active={sort.by?.tipo === 'prod' && sort.by?.giorno === i} dir={sort.dir}
                          onClick={() => toggleSort({ tipo: 'prod', giorno: i })}
                        />
                        <SortChip label="RIMAN" color={COL_RIMAN}
                          active={sort.by?.tipo === 'riman' && sort.by?.giorno === i} dir={sort.dir}
                          onClick={() => toggleSort({ tipo: 'riman', giorno: i })}
                        />
                      </div>
                    </th>
                  )
                })}
                {/* Totali sticky-right: sempre visibili senza scrollare fino
                    in fondo. Uso gli stessi nomi delle viste Mese/Storico
                    per uniformita' (Tot. prodotto / Tot. venduto). */}
                <SortableHeader
                  label="Tot. prodotto"
                  onClick={() => toggleSort('totProd')}
                  active={sort.by === 'totProd'} dir={sort.dir}
                  style={{ ...thTot, borderLeft: `2px solid ${C.borderStr}`, position: 'sticky', right: 120, zIndex: 3, background: '#F0FDF4', color: '#166534', boxShadow: '-2px 0 0 rgba(15,23,42,0.04)' }}
                />
                <SortableHeader
                  label="Tot. venduto"
                  onClick={() => toggleSort('venduto')}
                  active={sort.by === 'venduto'} dir={sort.dir}
                  style={{ ...thTot, position: 'sticky', right: 0, zIndex: 3 }}
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
                      <NomeGustoConFlag nome={nome} orfano={orfano} onClick={setDrilldownGusto} />
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
                              accent={COL_PROD} readOnly={isAllSedi}
                              unita={unitaDisplay}
                              onCommit={v => handleSave(gustoKey, dIso, 'produzione_g', v)}
                            />
                          </td>
                          {/* Se il conto del giorno non torna (rimanenza scritta
                              più alta di quanto c'era) la cella della rimanenza
                              si segna in rosso col perché. Prima il venduto
                              negativo veniva azzerato in silenzio e non c'era
                              modo di accorgersi di aver sbagliato la pesata. */}
                          <td
                            title={cell.quadra === false
                              ? `Qui il conto non torna di ${fmtUnita(Math.abs(cell.venduto))}${unitaDisplay === 'kg' ? ' kg' : ' g'}: la rimanenza scritta e' più alta del disponibile (rimasto ieri ${fmtUnita(cell.rimanPrec || 0)} + prodotto ${fmtUnita(cell.prod || 0)}). O manca una produzione, o la pesata va corretta.`
                              : (cell.registrata && cell.venduto == null
                                ? 'Manca la rimanenza del giorno prima: per questo giorno il venduto non si puo\' calcolare.'
                                : undefined)}
                            style={{
                              ...tdInput,
                              background: cell.quadra === false ? T.redLight : '#FFFEFB',
                              boxShadow: cell.quadra === false ? `inset 0 0 0 1.5px ${T.red}66` : undefined,
                              cursor: cell.quadra === false ? 'help' : undefined,
                            }}>
                            <CellInput
                              value={cell.riman || ''}
                              saving={!!saving[kRim]}
                              accent={cell.quadra === false ? T.red : COL_RIMAN} readOnly={isAllSedi}
                              unita={unitaDisplay}
                              onCommit={v => handleSave(gustoKey, dIso, 'rimanenza_g', v)}
                            />
                          </td>
                        </React.Fragment>
                      )
                    })}
                    {/* Totali sticky-right: la cella prodotto e' verde,
                        la venduto ambra (coerente con Storico). */}
                    <td style={{ ...tdTot, borderLeft: `2px solid ${C.borderStr}`, position: 'sticky', right: 120, zIndex: 1, background: '#F0FDF4', color: '#166534', boxShadow: '-2px 0 0 rgba(15,23,42,0.04)' }}>
                      {fmtUnita(totaliProdSettimana[gustoKey] || 0)}{unitaDisplay === 'kg' ? ' kg' : ' g'}
                    </td>
                    {(() => {
                      const q = dettaglio[gustoKey] || { celleNonQuadrate: 0, celleNonCalcolabili: 0 }
                      const problemi = q.celleNonQuadrate + q.celleNonCalcolabili
                      const titolo = problemi === 0 ? undefined
                        : [
                          q.celleNonQuadrate > 0 ? `${q.celleNonQuadrate} giorn${q.celleNonQuadrate === 1 ? 'o' : 'i'} in cui il conto non torna (celle in rosso)` : null,
                          q.celleNonCalcolabili > 0 ? `${q.celleNonCalcolabili} giorn${q.celleNonCalcolabili === 1 ? 'o' : 'i'} senza la rimanenza del giorno prima: non entra nel totale` : null,
                        ].filter(Boolean).join('. ')
                      return (
                        <td title={titolo} style={{
                          ...tdTot, position: 'sticky', right: 0, zIndex: 1,
                          cursor: problemi > 0 ? 'help' : undefined,
                        }}>
                          {fmtUnita(totali[gustoKey] || 0)}{unitaDisplay === 'kg' ? ' kg' : ' g'}
                          {problemi > 0 && (
                            <span style={{
                              marginLeft: 4, color: q.celleNonQuadrate > 0 ? T.red : T.amber,
                              fontSize: TS.sm, fontWeight: 800,
                            }}>{q.celleNonQuadrate > 0 ? '!' : '?'}</span>
                          )}
                        </td>
                      )
                    })()}
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
                    fontSize: 12, fontWeight: 800,
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
                          fontSize: 12, fontWeight: 800, color: '#0369A1',
                          background: '#F1F5F9',
                          borderLeft: `1px solid ${C.border}`,
                          fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'",
                          whiteSpace: 'nowrap',
                        }}>
                          {c.prod ? `${fmtUnita(c.prod)}${suffix}` : '—'}
                        </td>
                        <td style={{
                          padding: '10px 6px', textAlign: 'center',
                          fontSize: 12, fontWeight: 800, color: '#B45309',
                          background: '#F1F5F9',
                          fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'",
                          whiteSpace: 'nowrap',
                        }}>
                          {c.riman ? `${fmtUnita(c.riman)}${suffix}` : '—'}
                        </td>
                      </React.Fragment>
                    )
                  })}
                  {(() => {
                    // Totali di riga: sommo PROD e VENDUTO su tutti i giorni della settimana
                    // per tutti i gusti visibili → usati nelle celle sticky-right del tfoot.
                    let totProdSett = 0
                    for (const g of gustiVisibili) {
                      totProdSett += Number(totaliProdSettimana[normGusto(g.nome)]) || 0
                    }
                    return (
                      <>
                        <td style={{
                          ...tdTot,
                          borderLeft: `2px solid ${C.borderStr}`,
                          position: 'sticky', right: 120, zIndex: 2,
                          background: '#BBF7D0', color: '#166534',
                          fontWeight: 900, fontSize: 14,
                          boxShadow: '-2px 0 0 rgba(15,23,42,0.04)',
                        }}>
                          {fmtUnita(totProdSett)}{unitaDisplay === 'kg' ? ' kg' : ' g'}
                        </td>
                        <td style={{
                          ...tdTot,
                          position: 'sticky', right: 0, zIndex: 2,
                          background: '#FDE68A', fontWeight: 900, fontSize: 14,
                        }}>
                          {fmtUnita(totaliColonnaSettimana.venduto || 0)}{unitaDisplay === 'kg' ? ' kg' : ' g'}
                        </td>
                      </>
                    )
                  })()}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <div style={{ marginTop: SP[4], fontSize: TS.sm, color: C.textSoft, lineHeight: 1.55, maxWidth: 720 }}>
        Quantità in <strong>{unitaDisplay === 'kg' ? 'chilogrammi' : 'grammi'}</strong>. Salvataggio automatico uscendo dal campo (Tab o clic fuori).
      </div>

      {shipDlg && (
        <DialogSpedizione
          state={shipDlg}
          setState={setShipDlg}
          gusti={gustiOrdinati}
          sedi={sedi}
          sedeOrigineId={sedeId}
          righeOggi={(righe || []).filter(r => r.data === todayLocal())}
          onConferma={async ({ gusto, kg, destSedeId }) => {
            // Metodo e' org-level: dentro questa view (che gira solo se
            // metodoProduzione='inventario') tutte le sedi is_sede_produzione
            // ricevono come inventario. Le non-produttive prendono via stock PF.
            try {
              const qtaG = Math.round(Number(kg) * 1000)
              const oggiIso = todayLocal()
              const sedeOrigineNome = (sedi || []).find(s => s.id === sedeId)?.nome || 'sede origine'
              // 1) scarico sede origine: somma a SPEDITO_G (NON scarto_g)
              const cella = (righe || []).find(r => r.gusto_nome === gusto && r.data === oggiIso)
              const destSede = (sedi || []).find(s => s.id === destSedeId)
              const destInventario = !!destSede?.is_sede_produzione
              const notaOrigine = `Spediti ${Number(kg).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} kg a ${destSede?.nome || 'altra sede'}`
              const notaOrigineTot = cella?.note ? `${cella.note} · ${notaOrigine}` : notaOrigine
              await salvaCella(orgId, sedeId, gusto, oggiIso, {
                produzione_g: cella?.produzione_g || 0,
                // `?? null` e non `|| 0`: registrare una spedizione non è
                // pesare la vetrina. Con `|| 0` bastava spedire due chili
                // perché la cella dichiarasse «stasera non è rimasto niente»,
                // e il giorno dopo il venduto uscisse negativo di tutto il
                // gelato che invece c'era. È il difetto da 2.470 kg, qui
                // entrato da un'altra porta.
                rimanenza_g: cella?.rimanenza_g ?? null,
                scarto_g: cella?.scarto_g || 0,
                spedito_g: (cella?.spedito_g || 0) + qtaG,
                note: notaOrigineTot,
              })
              // 2) carico destinazione
              if (destInventario) {
                // `ricevuto_g` va letta per poterla SOMMARE: in un giorno
                // possono arrivare due spedizioni dello stesso gusto, e la
                // seconda non deve cancellare la prima. Se il database non ha
                // ancora la colonna (migrazione 20260916c) si rilegge senza,
                // e la somma riparte da zero — meglio di una schermata rotta.
                const colonneDest = 'produzione_g, rimanenza_g, scarto_g, spedito_g, ricevuto_g, note'
                const leggiDest = (cols) => supabase.from('inventario_produzione')
                  .select(cols)
                  .eq('organization_id', orgId).eq('sede_id', destSedeId)
                  .eq('gusto_nome', normGusto(gusto)).eq('data', oggiIso)
                  .maybeSingle()
                let resDest = await leggiDest(colonneDest)
                if (eColonnaRicevutoMancante(resDest.error, colonneDest)) {
                  resDest = await leggiDest(colonneSenzaRicevuto(colonneDest))
                }
                const cellDest = resDest.data
                const notaDest = `Ricevuti ${Number(kg).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} kg da ${sedeOrigineNome}`
                const notaDestTot = cellDest?.note ? `${cellDest.note} · ${notaDest}` : notaDest
                await salvaCella(orgId, destSedeId, gusto, oggiIso, {
                  produzione_g: cellDest?.produzione_g || 0,
                  // La merce che ARRIVA si scrive in `ricevuto_g`, non dentro
                  // la rimanenza. Sommarla lì diceva due bugie in una riga:
                  // che stasera in vetrina ci fossero esattamente quei chili
                  // (nessuno li ha ancora pesati) e che fossero sempre stati
                  // lì. Nel conto del venduto le due cose non si equivalgono:
                  // con la rimanenza gonfiata il negozio che riceve risulta
                  // vendere meno di zero il giorno dell'arrivo e troppo il
                  // giorno dopo. Sui dati di Mara questo movimento perso vale
                  // 1.263 kg, il 49% di tutto lo scostamento.
                  rimanenza_g: cellDest?.rimanenza_g ?? null,
                  scarto_g: cellDest?.scarto_g || 0,
                  spedito_g: cellDest?.spedito_g || 0,
                  ricevuto_g: (cellDest?.ricevuto_g || 0) + qtaG,
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
              console.error('spedizione fra sedi:', e)
      notify?.('Non ho registrato la spedizione: controlla la connessione e riprova. Se il problema resta, la merce non e\' stata spostata.', false)
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
  const chiediConferma = useConfirm()
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

  // `Z.modal` e non 9999: la conferma «spedisci comunque?» disegna a
  // `z.modal + 10`, e con 9999 qui sotto usciva DIETRO a questa finestra —
  // invisibile, con il pulsante che sembrava non fare niente.
  return (
    <div role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z.modal, padding: 16 }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, maxWidth: 460, width: '100%', padding: '24px 26px', boxShadow: '0 20px 60px rgba(15,23,42,0.30)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Icon name="truck" size={20} color={T.brand} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>Spedisci kg a un'altra sede</h2>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: C.textSoft, lineHeight: 1.5 }}>
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
              const suffix = disp > 0 ? ` — ${disp.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} kg disponibili` : ' — nessuna disponibilità oggi'
              return (
                <option key={g.nome} value={key}>{g.nome}{suffix}</option>
              )
            })}
          </select>
          {state.gusto && (
            <div style={{ fontSize: 12, color: C.textSoft, marginTop: 6 }}>
              Disponibile oggi: <b style={{ color: dispKg > 0 ? '#166534' : '#B45309' }}>
                {dispKg.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} kg
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
              <Icon name="alert" size={12} color="#92400E" /> Stai spedendo <b>{kgRichiesti.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} kg</b>
              {' '}ma la sede oggi ne ha solo <b>{dispKg.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} kg</b> disponibili.
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
            onClick={async () => {
              if (oltreDisp) {
                const kg = n => n.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })
                const conferma = await chiediConferma({
                  title: 'Spedisci più di quello che risulta in sede?',
                  message:
                    `Stai spedendo ${kg(kgRichiesti)} kg, ma oggi in sede ne risultano ${kg(dispKg)} kg.\n\n` +
                    'Vai avanti solo se hai rimanenza del giorno prima o altre giacenze.',
                  confirmLabel: 'Spedisci comunque',
                  cancelLabel: 'Annulla',
                  destructive: true,
                })
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


const tdHead = { padding: '6px 10px', textAlign: 'left', color: T.textSoft, fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }
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
const lblForm = { display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textSoft, marginBottom: 6 }
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
        <span style={{ fontSize: 12, color: active ? T.brand : 'transparent', fontWeight: 800 }}>
          <Icon name={active ? (dir === 'asc' ? 'chevUp' : 'chevDown') : 'sortable'} size={11} />
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
        fontSize: 12, color: active ? T.brand : color, fontWeight: 700,
        padding: '2px 4px', borderRadius: 4,
        background: active ? '#FEE2E2' : 'transparent',
        display: 'inline-flex', alignItems: 'center', gap: 2,
        outlineOffset: 2,
      }}>
      {label}
      {/* I triangolini erano i caratteri "▲" e "▼": caratteri tipografici
          usati da icona. Il progetto ha chevUp/chevDown. */}
      {active && <Icon name={dir === 'asc' ? 'chevUp' : 'chevDown'} size={11} />}
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
          <p style={{ margin: 0, fontSize: 13, color: C.textMid, lineHeight: 1.55 }}>
            {s.testo}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 22 }}>
          <button onClick={onClose}
            style={{ padding: '10px 14px', minHeight: 44, background: 'transparent', border: 'none', color: C.textSoft, fontSize: TS.sm, fontWeight: 600, cursor: 'pointer' }}>
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
  const isMobile = useIsMobile()
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
        // Il nome del gusto apre il suo storico: è un bersaglio, e sul
        // telefono era alto quanto la riga di testo (19px). Un dito ne
        // richiede 44, altrimenti si colpisce quello sopra o quello sotto.
        ...(clickable && isMobile ? { minHeight: 44 } : null),
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
  const isMobile = useIsMobile()
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
  // Il trattino vale solo per lo zero. I NEGATIVI si scrivono col segno: da
  // quando il venduto non viene più troncato a zero, un conto che non torna
  // esce negativo, e mostrarlo come "-" lo faceva sembrare un giorno senza
  // dati invece di un dato da correggere.
  const fmtVal = (g) => {
    if (!g) return '-'
    if (unita === 'kg') {
      return (g / 1000).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 }) + ' kg'
    }
    return g.toLocaleString('it-IT', { useGrouping: 'always' }) + ' g'
  }
  const m = useMemo(() => {
    // Il venduto lo calcola il motore condiviso, lo stesso della vista
    // settimana. Prima questa vista se lo ricalcolava per conto suo — quinta
    // copia della formula nel progetto — con tre differenze che facevano
    // uscire numeri diversi nella STESSA pagina: azzerava la giacenza a ogni
    // giorno non registrato (non solo dopo una settimana), troncava a zero i
    // conti che non tornavano, e ignorava i chili spediti alle altre sedi.
    const serie = serieVendutoMultiSede(righeMese || [])
    const start = new Date(lunediIso + 'T12:00')
    const annoMese = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
    const out = {}
    for (const { nome } of (gusti || [])) {
      const k = normGusto(nome)
      const per_sett = [0, 0, 0, 0, 0]  // 5 settimane max
      let totProd = 0, totVend = 0, nonQuadra = 0
      for (const c of (serie[k] || [])) {
        // Le righe includono i giorni prima del mese (giacenza di partenza):
        // servono al conto, ma non sono dati di questo mese.
        if (!c.data.startsWith(annoMese)) continue
        totProd += c.prod
        if (c.venduto != null) {
          totVend += c.venduto
          // Settimana del mese (0-indexed, max 4).
          const giorno = Number(c.data.slice(8, 10))
          per_sett[Math.min(4, Math.floor((giorno - 1) / 7))] += c.venduto
        }
        if (c.quadra === false) nonQuadra++
      }
      out[k] = { per_sett, totProd, totVend, nonQuadra }
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
    const d = new Date(lunediIso + 'T12:00')
    return `${MESI_LABEL[d.getMonth()]} ${d.getFullYear()}`
  })()

  return (
    // Sul telefono il riquadro esterno sparisce: dentro ci sono già le schede
    // per gusto, e una scheda dentro una scheda fa due cornici a un centimetro
    // l'una dall'altra e ruba sedici pixel di larghezza per lato.
    <div style={isMobile
      ? { background: 'transparent', border: 'none', padding: 0 }
      : { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
      <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Riepilogo mensile · {meseLabel}
      </div>
      {/* Sul telefono la tabella del mese (otto colonne, 680px di larghezza
          minima) diventa una scheda per gusto: i due totali grandi in alto,
          le cinque settimane sotto in fila. Il punto esclamativo dei giorni
          che non tornano era un `title`: sul telefono non lo vedeva nessuno,
          quindi qui la frase è scritta per esteso. */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 2 }}>
            {[['Gusto', 'nome'], ['Prodotto', 'totProd'], ['Venduto', 'totVend']].map(([label, key]) => {
              const active = sort.by === key
              return (
                <button key={key} onClick={() => toggleSort(key)}
                  aria-label={`Ordina per ${label}${active ? (sort.dir === 'asc' ? ', crescente' : ', decrescente') : ''}`}
                  style={{
                    minHeight: 44, padding: '10px 12px', borderRadius: 999,
                    border: `1px solid ${active ? T.brand : C.border}`,
                    background: active ? C.redLight : C.bgCard,
                    color: active ? T.brand : C.textSoft,
                    fontSize: TS.base, fontWeight: 700, fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                  }}>
                  {label}
                  {active && <Icon name={sort.dir === 'asc' ? 'chevUp' : 'chevDown'} size={12} />}
                </button>
              )
            })}
          </div>
          {gustiOrdinati.map(({ nome, orfano }) => {
            const k = normGusto(nome)
            const r = m[k] || { per_sett: [0, 0, 0, 0, 0], totProd: 0, totVend: 0, nonQuadra: 0 }
            return (
              <div key={k} style={{
                border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
                background: C.bgCard,
              }}>
                <div style={{ padding: '10px 12px', fontSize: TS.lg, fontWeight: 800, color: C.text }}>
                  <NomeGustoConFlag nome={nome} orfano={orfano} onClick={onClickGusto} />
                </div>
                <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px' }}>
                  <div style={{ flex: 1, background: C.greenLight, borderRadius: 10, padding: '8px 10px', minWidth: 0 }}>
                    <div style={{ fontSize: TS.sm, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prodotto</div>
                    <div style={{ fontSize: TS.lg, fontWeight: 800, color: C.green, ...TNUM }}>{fmtVal(r.totProd)}</div>
                  </div>
                  <div style={{ flex: 1, background: C.amberLight, borderRadius: 10, padding: '8px 10px', minWidth: 0 }}>
                    <div style={{ fontSize: TS.sm, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Venduto</div>
                    <div style={{ fontSize: TS.lg, fontWeight: 800, color: T.brand, ...TNUM }}>{fmtVal(r.totVend)}</div>
                  </div>
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                  borderTop: `1px solid ${C.borderSoft}`, background: C.bgSubtle,
                }}>
                  {r.per_sett.map((v, i) => (
                    <div key={i} style={{
                      padding: '8px 4px', textAlign: 'center',
                      borderLeft: i === 0 ? 'none' : `1px solid ${C.borderSoft}`,
                    }}>
                      <div style={{ fontSize: TS.sm, fontWeight: 700, color: C.textSoft, letterSpacing: '0.04em' }}>W{i + 1}</div>
                      <div style={{ fontSize: TS.sm, fontWeight: 700, color: v > 0 ? C.text : C.textSoft, ...TNUM }}>{fmtVal(v)}</div>
                    </div>
                  ))}
                </div>
                {r.nonQuadra > 0 && (
                  <div style={{
                    borderTop: `1px solid ${C.borderSoft}`, background: T.amberLight,
                    padding: '8px 12px', fontSize: TS.sm, lineHeight: 1.45, color: T.amberDark,
                  }}>
                    {r.nonQuadra === 1
                      ? 'Un giorno di questo mese non torna: la rimanenza scritta è più alta del disponibile. Il totale lo conta col suo segno.'
                      : `${r.nonQuadra} giorni di questo mese non tornano: la rimanenza scritta è più alta del disponibile. Il totale li conta col loro segno.`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
      // telefono: schede — vedi il ramo `isMobile` qui sopra.
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <SortableHeader
                label="Gusto"
                onClick={() => toggleSort('nome')}
                active={sort.by === 'nome'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}
              />
              {[1,2,3,4,5].map(w => {
                const key = { tipo: 'w', settimana: w - 1 }
                const active = sort.by?.tipo === 'w' && sort.by?.settimana === w - 1
                return (
                  <SortableHeader key={w}
                    label={`W${w}`}
                    onClick={() => toggleSort(key)}
                    active={active} dir={sort.dir}
                    style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  />
                )
              })}
              {/* Ordine colonne totali uniformato a Settimana e Storico:
                  prima Tot. prodotto (verde), poi Tot. venduto (ambra). */}
              <SortableHeader
                label="Tot. prodotto"
                onClick={() => toggleSort('totProd')}
                active={sort.by === 'totProd'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F0FDF4' }}
              />
              <SortableHeader
                label="Tot. venduto"
                onClick={() => toggleSort('totVend')}
                active={sort.by === 'totVend'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#FEF9EB' }}
              />
            </tr>
          </thead>
          <tbody>
            {gustiOrdinati.map(({ nome, orfano }) => {
              const k = normGusto(nome)
              const r = m[k] || { per_sett: [0,0,0,0,0], totProd: 0, totVend: 0, nonQuadra: 0 }
              return (
                <tr key={k} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                  <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: C.text }}>
                    <NomeGustoConFlag nome={nome} orfano={orfano} onClick={onClickGusto} />
                  </td>
                  {r.per_sett.map((v, i) => (
                    <td key={i} style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: v > 0 ? C.text : C.textSoft, fontSize: 12 }}>
                      {fmtVal(v)}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: '#166534', fontWeight: 800, fontSize: 13, background: '#F0FDF4' }}>
                    {fmtVal(r.totProd)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 800, fontSize: 13, background: '#FEF9EB' }}>
                    {fmtVal(r.totVend)}
                    {r.nonQuadra > 0 && (
                      <span
                        title={r.nonQuadra === 1
                          ? 'Un giorno di questo mese non torna: la rimanenza scritta è più alta del disponibile. Il totale lo conta col suo segno.'
                          : `${r.nonQuadra} giorni di questo mese non tornano: la rimanenza scritta è più alta del disponibile. Il totale li conta col loro segno.`}
                        style={{ color: T.amber, marginLeft: 5, cursor: 'help', fontWeight: 800 }}
                      >!</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
      <div style={{ marginTop: 12, fontSize: 12, color: C.textSoft, lineHeight: 1.5 }}>
        W1–W5 = settimane del mese. Il venduto e' calcolato dal differenziale di inventario; le settimane parziali a inizio/fine mese possono mostrare valori 0 se non hai compilato quei giorni.
      </div>
    </div>
  )
}

// ── VistaStorico: timeline scorrevole multi-mese (ultimi 6 mesi) ──────────
// perMese = array di { gusto_nome, mese ('YYYY-MM'), prod_g, venduto_g, scarto_g }
// pre-aggregato dal DB (RPC storico_inventario_per_mese) o dal client come
// fallback. VistaStorico si limita a costruire la griglia gusto x mese.
function VistaStorico({ gusti, perMese, inizio, unita = 'g', onClickGusto, onOpenReport }) {
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
      ? (g / 1000).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })
      : g.toLocaleString('it-IT', { useGrouping: 'always' })
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
    // perMese e' già aggregato: solo conversione in indice per gusto/mese.
    // Include anche gusti "orfani" (nel DB ma non nel ricettario) accodandoli
    // in fondo alla lista visibile — così i dati storici non spariscono se
    // qualcuno elimina la ricetta.
    const idx = {}
    const totProd = {}
    const totScarto = {}
    const nomiGusti = new Set()
    for (const { nome } of (gusti || [])) {
      const k = normGusto(nome)
      idx[k] = mesi.map(() => 0)
      totProd[k] = 0
      totScarto[k] = 0
      nomiGusti.add(k)
    }
    const gustiOrfani = []
    for (const r of (perMese || [])) {
      const k = normGusto(r.gusto_nome)
      if (!nomiGusti.has(k)) {
        nomiGusti.add(k)
        gustiOrfani.push({ nome: r.gusto_nome, orfano: true })
        idx[k] = mesi.map(() => 0)
        totProd[k] = 0
        totScarto[k] = 0
      }
      const meseIdx = mesi.findIndex(m => m.key === r.mese)
      if (meseIdx >= 0) idx[k][meseIdx] += Number(r.venduto_g) || 0
      totProd[k] += Number(r.prod_g) || 0
      totScarto[k] += Number(r.scarto_g) || 0
    }
    return { mesi, idx, totProd, totScarto, gustiOrfani }
  }, [gusti, perMese])

  // Ordina i gusti in base al sort scelto: 'nome' (localeCompare IT), un
  // singolo mese (chiave YYYY-MM), 'totProd', 'totVend' (= somma su mesi),
  // 'totScarto'. Include gli orfani (nel DB ma non nel ricettario) in coda.
  const gustiOrdinati = useMemo(() => {
    const arr = [...(gusti || []), ...(data.gustiOrfani || [])]
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
      const tuttiGusti = [...(gusti || []), ...(data.gustiOrfani || [])]
      for (const { nome } of tuttiGusti) {
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
      const ts = todayLocal()
      XLSX.writeFile(wb, `storico-produzione-${ts}.xlsx`)
    } catch (e) {
      console.error('Export xlsx fallito:', e)
    }
  }

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Storico vendite ({unita}) · Ultimi 6 mesi
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onOpenReport && (
            <button onClick={onOpenReport}
              title="Apri il report analitico completo con KPI, grafici e trend"
              style={{
                padding: '8px 14px', minHeight: 36,
                background: T.brand, color: '#FFFFFF', border: 'none', borderRadius: 8,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
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
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            }}>
            <Icon name="download" size={13} color={T.brand}/>
            Esporta Excel
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <TabellaOSchede

          minWidth={720}
          righe={gustiOrdinati}
          chiave={({ nome }) => normGusto(nome)}
          vuoto="Nessun gusto nello storico."
          apriEtichetta="Mese per mese"
          titolo={({ nome, orfano }) => <NomeGustoConFlag nome={nome} orfano={orfano} onClick={onClickGusto} />}
          colonne={[
            { k: 'prod', label: 'Totale prodotto', forte: true, colore: C.green,
              cella: ({ nome }) => `${fmtTot(data.totProd[normGusto(nome)] || 0)} ${unita}` },
            { k: 'vend', label: 'Totale venduto', forte: true, colore: T.brand,
              cella: ({ nome }) => {
                const arr = data.idx[normGusto(nome)] || data.mesi.map(() => 0)
                return `${fmtTot(arr.reduce((s, v) => s + v, 0))} ${unita}`
              } },
          ]}
          dettaglio={({ nome }) => {
            const arr = data.idx[normGusto(nome)] || data.mesi.map(() => 0)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: TS.sm }}>
                {data.mesi.map((m, i) => (
                  <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: C.textSoft, textTransform: 'capitalize' }}>{m.label}</span>
                    <span style={{ fontWeight: 700, color: arr[i] > 0 ? C.text : C.textSoft, ...TNUM }}>
                      {fmtTot(arr[i] || 0)} {unita}
                    </span>
                  </div>
                ))}
              </div>
            )
          }}
          intestazione={<><thead>
            <tr style={{ background: '#F8FAFC' }}>
              <SortableHeader
                label="Gusto"
                onClick={() => toggleSort('nome')}
                active={sort.by === 'nome'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', left: 0, background: '#F8FAFC' }}
              />
              {data.mesi.map(m => {
                const key = { tipo: 'mese', meseKey: m.key }
                const active = sort.by?.tipo === 'mese' && sort.by?.meseKey === m.key
                return (
                  <SortableHeader key={m.key}
                    label={m.label}
                    onClick={() => toggleSort(key)}
                    active={active} dir={sort.dir}
                    style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 80 }}
                  />
                )
              })}
              <SortableHeader
                label="Tot. prodotto"
                onClick={() => toggleSort('totProd')}
                active={sort.by === 'totProd'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F0FDF4' }}
              />
              <SortableHeader
                label="Tot. venduto"
                onClick={() => toggleSort('totVend')}
                active={sort.by === 'totVend'} dir={sort.dir}
                style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#FEF9EB' }}
              />
              {/* Tot. scarto nascosta per ora: la colonna esiste ancora nei
                  dati e viene esportata in Excel, ma non e' mostrata in UI. */}
            </tr>
          </thead></>}
          corpo={<><tbody>
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
                </tr>
              )
            })}
          </tbody></>}
        />
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: C.textSoft, lineHeight: 1.5 }}>
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
    const from = formatLocalDate(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 90))
    // Le colonne sono quelle del motore (`COLONNE_VENDUTO`), non un elenco
    // scritto a mano: qui mancavano `spedito_g` e `ricevuto_g`, cioè tutti e
    // due i movimenti fra negozi. Il pannello diceva quindi «venduto» anche
    // ai chili spediti a un'altra sede, e dava per non spiegato il gelato
    // arrivato — lo stesso numero, sullo stesso gusto, diverso da quello
    // della tabella settimanale che le colonne le aveva.
    const colonne = `${COLONNE_VENDUTO}, sede_id`
    const interroga = (cols) => {
      let q = supabase.from('inventario_produzione')
        .select(cols)
        .eq('organization_id', orgId)
        .eq('gusto_nome', normGusto(gusto))
        .gte('data', from)
        .order('data')
        .limit(100000)
      const sediSet = (isAllSedi && Array.isArray(sediProdIds) && sediProdIds.length > 0) ? sediProdIds : (sedeId ? [sedeId] : [])
      if (sediSet.length > 0) q = q.in('sede_id', sediSet)
      return q
    }
    // Finché la migrazione 20260916c non è applicata la colonna `ricevuto_g`
    // non esiste e il database risponde 42703. Senza questo secondo giro il
    // pannello resterebbe vuoto — un dato mancante che diventa una schermata
    // bianca è peggio del dato mancante.
    interroga(colonne).then(async (res) => {
      if (eColonnaRicevutoMancante(res.error, colonne)) {
        return interroga(colonneSenzaRicevuto(colonne))
      }
      return res
    }).then(({ data }) => {
      if (!alive) return
      // Venduto con la regola condivisa, e con le sedi trattate come le
      // tratta il resto del prodotto: `serieVendutoMultiSede` calcola NEGOZIO
      // PER NEGOZIO e somma dopo. Qui invece le righe delle tre sedi venivano
      // schiacciate su una chiave sola PRIMA del conto, e con una spedizione
      // interna di mezzo gli stessi chili venivano tolti due volte — una come
      // `spedito` dalla sede che manda, una come rimanenza che non torna in
      // quella che riceve. È la differenza che su Mara vale 1.263 kg.
      // La normalizzazione del nome resta: due grafie dello stesso gusto
      // («Caffè Flora» e «CAFFÈ FLORA») sono lo stesso gusto.
      const gKey = normGusto(gusto)
      const serie = serieVendutoMultiSede((data || []).map(r => ({ ...r, gusto_nome: gKey })))
      const arr = (serie[gKey] || []).map(c => ({
        data: c.data, prod: c.prod, riman: c.riman, scarto: c.scarto,
        venduto: c.venduto, quadra: c.quadra,
      }))
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
    let prod = 0, scarto = 0, venduto = 0, nonQuadrano = 0
    for (const r of rows) {
      // Il venduto arriva già calcolato dalla regola condivisa, col segno.
      if (r.venduto != null) venduto += r.venduto
      if (r.quadra === false) nonQuadrano++
      prod += r.prod; scarto += r.scarto
    }
    const giorni = rows.length
    const avgProd = giorni > 0 ? prod / giorni : 0
    return { prod, venduto, scarto, giorni, avgProd, nonQuadrano, prodByDay: rows.map(r => r.prod) }
  }, [rows])

  const fmt = (g) => {
    if (g <= 0) return '0'
    return unita === 'kg'
      ? (g / 1000).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })
      : g.toLocaleString('it-IT', { useGrouping: 'always' })
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
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
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
                borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 12, color: C.text, lineHeight: 1.5,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Note dal ricettario</div>
                {noteRicettario}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// `da`/`a` delimitano il periodo: le righe arrivano con qualche giorno in più
// davanti (la giacenza di partenza, che serve al conto del primo giorno) e
// quei giorni non sono produzione del periodo.
function KpiCompactBar({ rows, periodo, unita = 'g', vendutoG = null, celleNonQuadrate = 0, da = null, a = null }) {
  const isMobile = useIsMobile()
  const stats = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { prod: 0, venduto: 0, scarto: 0, scartoPct: 0, gustiN: 0, gustiRimanAlta: [] }
    }
    let prod = 0, scarto = 0
    // Aggreghiamo per gusto: prod totale, scarto totale, rimanenza finale.
    const perG = {}
    for (const r of rows) {
      if (da && r.data < da) continue
      if (a && r.data > a) continue
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
    // Il venduto lo passa SEMPRE la pagina (`vendutoG`), che lo prende dal
    // motore condiviso — la stessa fonte della colonna "Tot. venduto" dieci
    // centimetri sotto. Qui c'era anche una formula di ripiego
    // (prodotto - scarto - rimanenza finale, senza la giacenza di partenza)
    // usata dalla vista Mese: era la sesta variante del conto nel progetto, e
    // faceva sì che la banda in alto e la tabella sotto dicessero due numeri
    // diversi. Ora la vista Mese passa il suo totale e il ripiego non serve.
    const scartoPct = prod > 0 ? (scarto / prod) * 100 : 0
    return { prod, venduto: vendutoG || 0, scarto, scartoPct, gustiN: Object.keys(perG).length, gustiRimanAlta }
  }, [rows, vendutoG, da, a])

  const fmt = (g) => {
    if (g <= 0) return '0'
    return unita === 'kg'
      ? (g / 1000).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })
      : g.toLocaleString('it-IT', { useGrouping: 'always' })
  }
  // Lo scarto e' "misurato" solo se almeno una riga del periodo ne ha uno.
  const scartoMisurato = Array.isArray(rows) && rows.some(r => (Number(r.scarto_g) || 0) > 0)
  const scartoColor = stats.scartoPct >= 5 ? '#B91C1C' : stats.scartoPct >= 2 ? '#B45309' : '#166534'
  const scartoBg = stats.scartoPct >= 5 ? '#FEF2F2' : stats.scartoPct >= 2 ? '#FEF9EB' : '#F0FDF4'

  const hasAlerts = stats.scartoPct >= 5 || stats.gustiRimanAlta.length > 0 || celleNonQuadrate > 0
  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 8, marginBottom: 14,
    }}>
      {/* Tre riquadri affiancati. Le colonne erano `1fr 1fr 1fr`: `1fr` non
          scende sotto la larghezza del contenuto, e con le scritte su una riga
          sola («Venduto stimato», «non registrato») la fascia diventava larga
          581px dentro uno schermo da 390 — la pagina della settimana e quella
          del mese scorrevano di lato di 191px e 149px. È lo stesso difetto già
          corretto nei campi grandi di questa pagina: ci vuole `minmax(0,1fr)`.
          Sul telefono i riquadri passano a due per riga, con lo scarto sotto a
          tutta larghezza: a tre stavano in 108px l'uno e le scritte finivano
          troncate coi puntini. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile
          ? 'minmax(0,1fr) minmax(0,1fr)'
          : 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
        gap: 8,
      }}>
        <KpiTile label={`Prodotto ${periodo}`} value={fmt(stats.prod)} unit={unita} color={C.text} bg="#F8FAFC"/>
        <KpiTile label="Venduto stimato" value={fmt(stats.venduto)} unit={unita} color={T.brand} bg="#FEF9EB"/>
        {/* Lo scarto e' una colonna OPZIONALE, e in produzione non e' mai
            stata compilata: su tutte le righe vale 0. Mostrare "0" col
            semaforo verde e' un complimento su un dato che non esiste. Se in
            tutto il periodo non c'e' nemmeno una riga con scarto, si scrive
            che non e' registrato, in grigio, senza semaforo.
            E la percentuale va con la virgola italiana, non col punto. */}
        {scartoMisurato ? (
          <KpiTile label={`Scarto ${stats.scartoPct > 0 ? '(' + stats.scartoPct.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%)' : ''}`.trim()}
            value={fmt(stats.scarto)} unit={unita} color={scartoColor} bg={scartoBg} largo={isMobile}/>
        ) : (
          <KpiTile label="Scarto" value="non registrato" unit="" color={C.textSoft} bg={C.bgSubtle} largo={isMobile}/>
        )}
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
              padding: '3px 10px', fontSize: 12, fontWeight: 700,
            }} title="Lo scarto e' oltre il 5% del prodotto: probabilmente stai producendo piu di quanto vendi.">
              <Icon name="alert" size={12} color={T.red} /> Scarto sopra il 5%
            </span>
          )}
          {celleNonQuadrate > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: T.redLight, color: T.red,
              border: `1px solid ${T.red}55`, borderRadius: R.full,
              padding: '3px 10px', fontSize: TS.sm, fontWeight: 700,
            }} title="In queste giornate la rimanenza scritta e' più alta di quanto c'era a disposizione: o manca una produzione, o la pesata e' sbagliata. Il venduto di quelle celle e' negativo e resta nel totale col suo segno.">
              {celleNonQuadrate} giornat{celleNonQuadrate === 1 ? 'a' : 'e'} in cui il conto non torna
            </span>
          )}
          {stats.gustiRimanAlta.length > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#FEF9EB', color: '#B45309',
              border: '1px solid #FCD34D', borderRadius: 999,
              padding: '3px 10px', fontSize: TS.sm, fontWeight: 700,
            }} title={`Gusti con rimanenza superiore alla produzione del periodo: ${stats.gustiRimanAlta.slice(0, 8).join(', ')}`}>
              <Icon name="alert" size={12} color={T.amber} /> {stats.gustiRimanAlta.length} gust{stats.gustiRimanAlta.length === 1 ? 'o' : 'i'} con rimanenza alta
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// `largo` = il riquadro prende tutta la riga (sul telefono lo scarto sta sotto
// agli altri due).
function KpiTile({ label, value, unit, color, bg, largo = false }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      background: bg, borderRadius: 10, padding: '10px 12px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      minHeight: 52, minWidth: 0,
      gridColumn: largo ? '1 / -1' : undefined,
    }}>
      {/* Sul telefono l'etichetta va a capo invece di troncarsi coi puntini
          («Prodotto questa settimana» in 163px non ci sta su una riga), e
          tiene un'altezza fissa di due righe così i numeri dei riquadri
          affiancati restano incolonnati fra loro. */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: C.textSoft,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        overflow: 'hidden',
        ...(isMobile && !largo
          ? { whiteSpace: 'normal', lineHeight: 1.25, minHeight: 30 }
          : { textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
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
// VistaOggi lavora su UN giorno, e il giorno si può cambiare.
//
// Prima la data era fissa a oggi e non c'era nessun modo di spostarla: la
// rimanenza di ieri sera, se nessuno l'aveva scritta prima di chiudere, dal
// telefono non si recuperava più — e questa e' la vista di default sul
// telefono, quella che la pagina stessa consiglia per compilare in fretta.
// Senza la rimanenza di ieri il venduto di oggi non si calcola, quindi un
// giorno dimenticato ne rovinava due.
function VistaOggi({ gusti, matrice, saving, onSave, readOnly, unita = 'g', giornoIso, onCambiaGiorno, rimanenzaIeri = {} }) {
  const oggiIso = giornoIso || todayLocal()
  const isOggi = oggiIso === todayLocal()
  // Il giorno prima. Serve per mostrare accanto a ogni gusto quanto era
  // rimasto ieri sera: e' il numero da cui riparte la giornata.
  const ieriIso = (() => {
    const d = new Date(oggiIso + 'T12:00'); d.setDate(d.getDate() - 1)
    return formatLocalDate(d)
  })()
  const nomeGiorno = new Date(oggiIso + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' })
  const spostaGiorno = (delta) => {
    if (!onCambiaGiorno) return
    const d = new Date(oggiIso + 'T12:00')
    d.setDate(d.getDate() + delta)
    const nuovo = formatLocalDate(d)
    // Nel futuro non si produce: il limite e' oggi.
    if (nuovo > todayLocal()) return
    onCambiaGiorno(nuovo)
  }
  return (
    <div>
      {onCambiaGiorno && (
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', gap: SP[2], alignItems: 'center', marginBottom: SP[3] }}>
          <button onClick={() => spostaGiorno(-1)} aria-label="Giorno prima"
            style={{ minHeight: 44, borderRadius: R.md, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: TS.lg, color: C.textMid }}>←</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: TS.base, fontWeight: 800, color: C.text, textTransform: 'capitalize' }}>{nomeGiorno}</div>
            {!isOggi && <div style={{ fontSize: TS.sm, color: T.brand, fontWeight: 700 }}>stai compilando un giorno passato</div>}
          </div>
          <button onClick={() => spostaGiorno(1)} aria-label="Giorno dopo" disabled={isOggi}
            style={{ minHeight: 44, borderRadius: R.md, border: `1px solid ${C.border}`, background: isOggi ? C.bgSubtle : C.white, cursor: isOggi ? 'default' : 'pointer', fontSize: TS.lg, color: isOggi ? C.textSoft : C.textMid }}>→</button>
        </div>
      )}
      {/* Il giorno normale non è un avviso.
          Prima questa striscia era gialla TUTTI i giorni, e sotto c'erano tre
          (o trenta) riquadri gialli uno sotto l'altro: la pagina in cui non
          c'è niente che non va era la più allarmata del prodotto, e quando
          qualcosa non andava davvero non si distingueva. Adesso il giorno
          corrente è una riga neutra e il giallo resta a chi sta compilando un
          giorno passato, che è il caso fuori dall'ordinario. */}
      <div style={{
        background: isOggi ? C.bgSubtle : T.amberLight,
        border: `1px solid ${isOggi ? C.border : `${T.amber}55`}`, borderRadius: R.lg,
        padding: `${SP[3]}px ${SP[4]}px`, marginBottom: SP[3], fontSize: TS.sm,
        lineHeight: 1.5, color: isOggi ? C.textMid : (T.amberDark || T.amber),
      }}>
        <strong style={{ textTransform: 'capitalize', color: isOggi ? C.text : 'inherit' }}>{isOggi ? `Oggi ${nomeGiorno}` : nomeGiorno}</strong>
        &nbsp;- Compila PROD (quanto hai prodotto) e RIMAN (quanto e' rimasto a fine giornata). I valori si salvano automaticamente.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP[3] }}>
        {gusti.map(({ nome, orfano }) => {
          const gKey = normGusto(nome)
          const byData = matrice[gKey] || {}
          const cell = byData[oggiIso] || { prod: 0, riman: 0, venduto: null }
          // Quanto era rimasto ieri sera. `undefined` = ieri non e' stato
          // compilato per niente, ed e' una cosa diversa da "era rimasto zero":
          // senza quel numero il venduto di oggi non si puo' calcolare.
          const ieri = rimanenzaIeri[gKey]
          const rimanIeri = ieri ? ieri.grammi : null
          // Due modi di non saperlo: il giorno prima non è stato registrato
          // affatto, oppure è stato registrato ma la casella RIMAN. è rimasta
          // vuota. In tutti e due i casi il venduto di oggi non si calcola, e
          // va detto — prima il secondo caso arrivava qui come `null` e
          // mandava in errore il `toLocaleString` qui sotto.
          const ieriMancante = !ieri || ieri.grammi == null
          const ieriNonScritta = !!ieri && ieri.grammi == null
          const kProd = `${gKey}|${oggiIso}|produzione_g`
          const kRim = `${gKey}|${oggiIso}|rimanenza_g`
          return (
            <div key={gKey} style={{
              background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.xl,
              padding: SP[4],
              boxShadow: S.xs,
            }}>
              {/* Il nome del gusto è la cosa che si cerca scorrendo trenta
                  schede uguali: stava a 15px, cioè tre pixel sopra le
                  etichette, e scorrendo non emergeva. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP[2], marginBottom: SP[3] }}>
                <div style={{ fontSize: TS.lg, fontWeight: 700, color: C.text, letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {nome}
                  {orfano && <IconaOrfano />}
                </div>
                {cell.venduto != null && (
                  <div style={{ fontSize: 12, color: C.textSoft }}>
                    venduto stimato: <strong style={{ color: T.brand, ...TNUM }}>
                      {unita === 'kg'
                        ? (Number(cell.venduto) / 1000).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 2 }) + ' kg'
                        : Number(cell.venduto).toLocaleString('it-IT', { useGrouping: 'always' }) + ' g'}
                    </strong>
                  </div>
                )}
              </div>
              {/* Da quanto si riparte. Prima questa riga non c'era, e il
                  dipendente inseriva i numeri alla cieca: non sapeva con
                  quanto gelato aveva aperto il banco, e soprattutto non si
                  accorgeva se ieri nessuno aveva chiuso i conti — che e' il
                  caso in cui il venduto di oggi esce sbagliato. */}
              {/* Da quanto si riparte: nel caso normale è una riga di testo,
                  non un riquadro. Con un riquadro pieno per gusto, una
                  gelateria con trenta gusti aveva trenta rettangoli colorati e
                  due campi da compilare: il contorno pesava più del lavoro.
                  Quando il dato manca resta un filo giallo a sinistra — si
                  vede scorrendo, e non riempie la scheda. */}
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
                marginBottom: SP[3],
                padding: ieriMancante ? `${SP[2]}px ${SP[3]}px` : 0,
                borderRadius: ieriMancante ? R.sm : 0,
                background: ieriMancante ? T.amberLight : 'transparent',
                borderLeft: ieriMancante ? `3px solid ${T.amber}` : 'none',
                fontSize: TS.sm, lineHeight: 1.45,
                color: ieriMancante ? (T.amberDark || T.amber) : C.textSoft,
              }}>
                {ieriMancante ? (
                  <>
                    {/* `flex: 1` sul testo: senza, la frase è troppo lunga
                        per stare accanto all'icona, va tutta a capo e
                        l'icona resta da sola su una riga sua. Tre righe
                        invece di due, per ogni gusto. */}
                    <Icon name="warning" size={12} color={T.amberDark || T.amber} />
                    <span style={{ flex: 1, minWidth: 0 }}>{ieriNonScritta
                      ? `La rimanenza di ${new Date(ieri.dataIso + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' })} non è stata scritta: il venduto di oggi non si calcola.`
                      : 'Non risulta nessuna rimanenza negli ultimi giorni: il venduto di oggi non si calcola.'}</span>
                  </>
                ) : (
                  <>
                    <Icon name="arrowR" size={12} color={C.textSoft} />
                    <span>{ieri.giorniIndietro === 1 ? 'Ieri sera ne era rimasto' : 'Ultima rimanenza scritta'}</span>
                    <strong style={{ color: C.text, ...TNUM }}>
                      {unita === 'kg'
                        ? (rimanIeri / 1000).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 2 }) + ' kg'
                        : rimanIeri.toLocaleString('it-IT', { useGrouping: 'always' }) + ' g'}
                    </strong>
                    {/* Se l'ultimo dato non e' di ieri lo si dice: il venduto
                        di oggi comprendera' anche i giorni in mezzo, e chi
                        legge deve sapere perché il numero è grosso. */}
                    {ieri.giorniIndietro > 1 && (
                      <span style={{ color: T.amberDark || T.amber }}>
                        di {new Date(ieri.dataIso + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        {' '}— i {ieri.giorniIndietro - 1} giorn{ieri.giorniIndietro === 2 ? 'o' : 'i'} in mezzo non {ieri.giorniIndietro === 2 ? 'è' : 'sono'} stat{ieri.giorniIndietro === 2 ? 'o' : 'i'} compilat{ieri.giorniIndietro === 2 ? 'o' : 'i'}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: SP[3] }}>
                <BigField
                  label="PROD oggi"
                  value={cell.prod || 0}
                  saving={!!saving[kProd]} readOnly={readOnly}
                  unita={unita}
                  onCommit={v => onSave(gKey, oggiIso, 'produzione_g', v)}
                />
                <BigField
                  label="RIMAN. fine giornata"
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
function BigField({ label, value, saving, onCommit, readOnly, unita = 'g' }) {
  const [focused, setFocused] = useState(false)
  // Formato visualizzato (in focus = numero "grezzo" senza migliaia, fuori focus = migliaia IT)
  const toDisplay = (g, withSeparator) => {
    if (g === 0 || g == null || g === '') return ''
    if (unita === 'kg') {
      const num = Number(g) / 1000
      return withSeparator
        ? num.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 2 })
        : String(num).replace('.', ',')
    }
    const num = Number(g)
    return withSeparator ? num.toLocaleString('it-IT', { useGrouping: 'always' }) : String(num)
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
    // Audit layout 2026-09-14: senza `minWidth: 0` la colonna della griglia si
    // allarga fino al contenuto più lungo e la pagina scorre di lato: su
    // telefono l'inventario sforava di 124px.
    <label style={{ display: 'block', minWidth: 0 }}>
      {/* minHeight fisso: le due etichette affiancate restano incolonnate
          anche quando una va a capo e l'altra no. */}
      <div style={{ fontSize: TS.sm, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, minHeight: 28, lineHeight: 1.25 }}>
        {label}
      </div>
      {/* Pieno o vuoto, non azzurro o arancione.
          Il bordo del campo compilato era azzurro per PROD e arancione per
          RIMAN: due colori che nel resto del prodotto non esistono, e uno dei
          due è lo stesso arancione che qui accanto vuol dire "attenzione". I
          due campi si distinguono già dall'etichetta e dalla posizione;
          quello che serve vedere è se il numero c'è. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: saving ? T.brandLight : (readOnly ? C.bgSubtle : (local ? C.white : C.bgSubtle)),
        border: `2px solid ${local ? C.borderStr : C.border}`,
        borderRadius: R.lg, padding: `0 ${SP[3]}px`,
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
            fontSize: TS.xl, fontWeight: 700, color: C.text, textAlign: 'right',
            padding: '12px 0', minWidth: 0,
            cursor: readOnly ? 'default' : 'text',
            ...TNUM,
          }}
        />
        <span style={{ fontSize: TS.sm, color: C.textSoft, fontWeight: 600 }}>{unita}</span>
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
        width: '100%', minWidth: 64,
        // Sul telefono il campo è più alto: nelle schede c'è lo spazio, e un
        // campo da scrivere col pollice non può essere alto quanto una riga di
        // testo. La dimensione della scritta NON si tocca qui: `index.html`
        // porta già tutti i campi a 16px sui dispositivi a tocco (telefono e
        // tablet), che è la soglia sotto cui iOS ingrandisce la pagina.
        padding: isMobile ? '12px 10px' : '10px 8px', textAlign: 'right',
        fontSize: TS.base, fontFamily: 'inherit', boxSizing: 'border-box',
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

// ── La settimana sul telefono: una scheda per gusto ──────────────────────────
//
// La tabella della settimana è larga 1.280px: sedici colonne (il gusto, sette
// giorni per due valori, due totali). Su un telefono da 390px sono tre
// schermate e mezza di scorrimento orizzontale. Il titolare l'ha detto così:
// «in produzione se vedo settimana o mese non riesco a leggere nulla, la
// tabella è troppo grande».
//
// Stessi dati, girati di novanta gradi: una scheda per gusto, dentro sette
// righe (una per giorno) con i due campi affiancati. Niente scorrimento
// orizzontale, i campi restano larghi abbastanza da scriverci col pollice, e
// il totale della settimana sta nell'intestazione della scheda invece che otto
// colonne più in là.
//
// Due cose cambiano rispetto al desktop, di proposito:
//  - i giorni che non quadrano non si spiegano più con un `title` (sul
//    telefono il passaggio del mouse non esiste, quindi quel messaggio era
//    scritto per nessuno): stanno in chiaro in fondo alla scheda;
//  - l'ordinamento per singolo giorno sparisce — sono quattordici comandi che
//    su un telefono non si colpiscono — e restano i tre veri: gusto, prodotto,
//    venduto.
function SchedeSettimana({
  gusti, matrice, lunediIso, saving, onSave, readOnly, unita, fmt,
  totaliProd, totaliVend, dettaglio, onClickGusto,
  sort, onToggleSort, totaliColonna, soloCompilati,
}) {
  const suffix = unita === 'kg' ? ' kg' : ' g'
  const oggiIso = todayLocal()

  // I sette giorni stanno dentro una scheda che si apre.
  //
  // Aperte tutte, con venti gusti la pagina è lunga quindicimila pixel: per
  // arrivare all'ultimo gusto ci vogliono trentacinque passate di pollice, e
  // sul telefono la settimana serve per **guardare** la settimana e sistemare
  // un giorno saltato, non per compilare (per quello c'è «Oggi», ed è più
  // rapida). Chiuse, la stessa pagina sta in tre schermate e il totale di ogni
  // gusto si legge senza aprire niente.
  //
  // Partono aperte solo le schede che hanno qualcosa che non va: sono quelle
  // per cui si entra qui.
  const [aperti, setAperti] = useState(null)
  const apri = (k) => setAperti(prev => {
    const s = new Set(prev === null ? [] : prev)
    if (s.has(k)) s.delete(k); else s.add(k)
    return s
  })

  const chip = (label, key) => {
    const active = sort.by === key
    return (
      <button
        key={key}
        onClick={() => onToggleSort(key)}
        aria-label={`Ordina per ${label}${active ? (sort.dir === 'asc' ? ', crescente' : ', decrescente') : ''}`}
        style={{
          minHeight: 44, padding: '10px 12px', borderRadius: 999,
          border: `1px solid ${active ? T.brand : C.border}`,
          background: active ? C.redLight : C.bgCard,
          color: active ? T.brand : C.textSoft,
          fontSize: TS.base, fontWeight: 700, fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
        }}>
        {label}
        {active && <Icon name={sort.dir === 'asc' ? 'chevUp' : 'chevDown'} size={12} />}
      </button>
    )
  }

  return (
    <div>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {chip('Gusto', 'nome')}
          {chip('Prodotto', 'totProd')}
          {chip('Venduto', 'venduto')}
        </div>
        <button
          onClick={() => setAperti(prev => {
            const tutte = new Set(gusti.map(g => normGusto(g.nome)))
            const giaAperte = prev !== null && prev.size >= tutte.size
            return giaAperte ? new Set() : tutte
          })}
          style={{
            minHeight: 44, padding: '10px 12px', borderRadius: 999,
            border: `1px solid ${C.border}`, background: C.bgCard, color: C.textSoft,
            fontSize: TS.base, fontWeight: 700, fontFamily: 'inherit',
            flexShrink: 0, whiteSpace: 'nowrap', cursor: 'pointer',
          }}>
          {aperti !== null && aperti.size >= gusti.length && gusti.length > 0 ? 'Chiudi tutte' : 'Apri tutte'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {gusti.map(({ nome, orfano }) => {
          const gustoKey = normGusto(nome)
          const byData = matrice[gustoKey] || {}
          // I giorni con qualcosa da dire: o il conto non torna, o manca la
          // rimanenza del giorno prima e quindi il venduto non si calcola.
          const avvisi = []
          for (let i = 0; i < 7; i++) {
            const dIso = addDays(lunediIso, i)
            const cell = byData[dIso]
            if (!cell) continue
            if (cell.quadra === false) {
              avvisi.push({
                giorno: `${GIORNI[i]} ${new Date(dIso + 'T12:00').getDate()}`,
                tipo: 'rosso',
                testo: `il conto non torna di ${fmt(Math.abs(cell.venduto))}${suffix}: la rimanenza scritta è più alta di quello che c'era (rimasto ieri ${fmt(cell.rimanPrec || 0)}${suffix} + prodotto ${fmt(cell.prod || 0)}${suffix}). O manca una produzione, o la pesata va corretta.`,
              })
            } else if (cell.registrata && cell.venduto == null) {
              avvisi.push({
                giorno: `${GIORNI[i]} ${new Date(dIso + 'T12:00').getDate()}`,
                tipo: 'ambra',
                testo: 'manca la rimanenza del giorno prima, quindi il venduto di questo giorno non si può calcolare e non entra nel totale.',
              })
            }
          }

          const aperta = aperti === null ? avvisi.length > 0 : aperti.has(gustoKey)

          return (
            <div key={gustoKey} style={{
              background: C.bgCard, border: `1px solid ${avvisi.length > 0 ? `${T.red}44` : C.border}`, borderRadius: 14,
              boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.04)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 14px', borderBottom: aperta ? `1px solid ${C.borderSoft}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: TS.lg, fontWeight: 800, color: C.text }}>
                    <NomeGustoConFlag nome={nome} orfano={orfano} onClick={onClickGusto} />
                  </div>
                  <button
                    onClick={() => apri(gustoKey)}
                    aria-expanded={aperta}
                    aria-label={`${aperta ? 'Chiudi' : 'Apri'} i sette giorni di ${nome}`}
                    style={{
                      width: 44, height: 44, flexShrink: 0, borderRadius: 10,
                      border: `1px solid ${C.border}`, background: aperta ? C.bgSubtle : C.bgCard,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: C.textSoft,
                    }}>
                    <Icon name={aperta ? 'chevUp' : 'chevDown'} size={16} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, background: C.greenLight, borderRadius: 10, padding: '8px 10px',
                    minWidth: 0,
                  }}>
                    <div style={{ fontSize: TS.sm, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Prodotto
                    </div>
                    <div style={{ fontSize: TS.lg, fontWeight: 800, color: C.green, ...TNUM }}>
                      {fmt(totaliProd[gustoKey] || 0)}{suffix}
                    </div>
                  </div>
                  <div style={{
                    flex: 1, background: C.amberLight, borderRadius: 10, padding: '8px 10px',
                    minWidth: 0,
                  }}>
                    <div style={{ fontSize: TS.sm, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Venduto
                    </div>
                    <div style={{ fontSize: TS.lg, fontWeight: 800, color: T.brand, ...TNUM }}>
                      {fmt(totaliVend[gustoKey] || 0)}{suffix}
                    </div>
                  </div>
                </div>
              </div>

              {aperta && (
              <div style={{ padding: '4px 10px 10px' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '58px 1fr 1fr', gap: 8,
                  padding: '8px 4px 4px',
                }}>
                  <span />
                  <span style={{ fontSize: TS.sm, fontWeight: 800, color: COL_PROD, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    Prodotto
                  </span>
                  <span style={{ fontSize: TS.sm, fontWeight: 800, color: COL_RIMAN, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    Rimasto
                  </span>
                </div>
                {GIORNI.map((g, i) => {
                  const dIso = addDays(lunediIso, i)
                  const cell = byData[dIso] || { prod: 0, riman: 0 }
                  const kProd = `${gustoKey}|${dIso}|produzione_g`
                  const kRim = `${gustoKey}|${dIso}|rimanenza_g`
                  const oggi = dIso === oggiIso
                  const rotto = cell.quadra === false
                  return (
                    <div key={dIso} style={{
                      display: 'grid', gridTemplateColumns: '58px 1fr 1fr', gap: 8,
                      alignItems: 'center', padding: '3px 4px',
                    }}>
                      <div style={{
                        fontSize: TS.sm, fontWeight: oggi ? 800 : 700,
                        color: oggi ? T.brand : C.textSoft,
                        textTransform: 'uppercase', letterSpacing: '0.03em',
                        whiteSpace: 'nowrap',
                      }}>
                        {g} {new Date(dIso + 'T12:00').getDate()}
                      </div>
                      <div style={{
                        background: C.bgCard, border: `1px solid ${C.border}`,
                        borderRadius: 10, overflow: 'hidden',
                      }}>
                        <CellInput
                          value={cell.prod || ''}
                          saving={!!saving[kProd]}
                          accent={COL_PROD} readOnly={readOnly}
                          unita={unita}
                          onCommit={v => onSave(gustoKey, dIso, 'produzione_g', v)}
                        />
                      </div>
                      <div style={{
                        background: rotto ? T.redLight : C.bgCard,
                        border: `1px solid ${rotto ? `${T.red}66` : C.border}`,
                        borderRadius: 10, overflow: 'hidden',
                      }}>
                        <CellInput
                          value={cell.riman || ''}
                          saving={!!saving[kRim]}
                          accent={rotto ? T.red : COL_RIMAN} readOnly={readOnly}
                          unita={unita}
                          onCommit={v => onSave(gustoKey, dIso, 'rimanenza_g', v)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              )}

              {avvisi.length > 0 && (
                <div style={{
                  borderTop: `1px solid ${C.borderSoft}`,
                  background: avvisi.some(a => a.tipo === 'rosso') ? T.redLight : T.amberLight,
                  padding: '10px 14px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  {avvisi.map((a, idx) => (
                    <div key={idx} style={{ fontSize: TS.sm, lineHeight: 1.45, color: a.tipo === 'rosso' ? T.redDark : T.amberDark }}>
                      <b style={{ textTransform: 'uppercase' }}>{a.giorno}</b> · {a.testo}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {gusti.length > 0 && (
        <div style={{
          marginTop: 12, background: C.bgSubtle, border: `1px solid ${C.borderStr}`,
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{
              fontSize: TS.sm, fontWeight: 800, color: C.textSoft,
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
            }}>
              Totale settimana {soloCompilati ? '(solo compilati)' : ''}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: C.greenLight, borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: TS.sm, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Prodotto
                </div>
                <div style={{ fontSize: TS.xl, fontWeight: 900, color: C.green, ...TNUM }}>
                  {fmt(gusti.reduce((s, g) => s + (Number(totaliProd[normGusto(g.nome)]) || 0), 0))}{suffix}
                </div>
              </div>
              <div style={{ flex: 1, background: C.amberLight, borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: TS.sm, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Venduto
                </div>
                <div style={{ fontSize: TS.xl, fontWeight: 900, color: T.brand, ...TNUM }}>
                  {fmt(totaliColonna.venduto || 0)}{suffix}
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding: '6px 14px 12px' }}>
            {GIORNI.map((g, i) => {
              const dIso = addDays(lunediIso, i)
              const c = totaliColonna.perGiorno[dIso] || { prod: 0, riman: 0 }
              return (
                <div key={dIso} style={{
                  display: 'grid', gridTemplateColumns: '58px 1fr 1fr', gap: 8,
                  padding: '6px 0', fontSize: TS.base,
                  borderTop: i === 0 ? 'none' : `1px solid ${C.borderSoft}`,
                }}>
                  <span style={{ fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', fontSize: 12 }}>
                    {g} {new Date(dIso + 'T12:00').getDate()}
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 800, color: COL_PROD, ...TNUM }}>
                    {c.prod ? `${fmt(c.prod)}${suffix}` : '—'}
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 800, color: COL_RIMAN, ...TNUM }}>
                    {c.riman ? `${fmt(c.riman)}${suffix}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stili tabella ─────────────────────────────────────────────────────────
// Audit 2026-06-24: header colonne giorno della settimana erano tagliati su
// mobile (es. "GIO 4" sovrapposto a PROD/RIMAN). Soluzione: minWidth 72px
// per cella input + sticky left sulla colonna GUSTO + minWidth tabella 1280
// così su 375px lo scroll orizzontale funziona ma il contesto resta visibile.
const thGusto = {
  padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700,
  color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em',
  position: 'sticky', left: 0, background: '#F8FAFC', zIndex: 2,
  minWidth: 160,
  boxShadow: '2px 0 0 rgba(15,23,42,0.04)',
}
const thGiorno = { padding: '8px 4px', textAlign: 'center', whiteSpace: 'nowrap' }
const thTot = {
  padding: '12px 14px', textAlign: 'right', fontSize: 12, fontWeight: 800,
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

