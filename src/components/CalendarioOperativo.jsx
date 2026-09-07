// Calendario operativo - pagina di DIAGNOSI → CAPISCI → AGISCI (POV proprietario).
// 1) Banda diagnosi del mese (solo titolare): copertura %, semaforo, streak, anomalie.
// 2) Griglia calendario premium: ogni cella con indicatori produzione/cassa + colore stato.
// 3) Pannello dettaglio giorno premium: dati produzione/cassa + link alle sezioni + nota.
//
// VINCOLO: per i dipendenti prodMap/cassaMap includono SOLO oggi/futuro e le
// statistiche storiche (completati/streak/anomalie) sono nascoste.
//
// ── Revisione 2026-09-07, dopo audit sui dati reali ────────────────────────
//
// 1. FONTE DELLA PRODUZIONE. In metodo inventario la produzione NON sta nel
//    blob `giornaliero` ma nella tabella inventario_produzione. Il calendario
//    leggeva solo il blob: per Mara, che ha 123 giorni di produzione registrata,
//    mostrava un muro di rosso e copertura 0%. Ora sceglie la fonte in base al
//    metodo dell'organizzazione.
//
// 2. GIORNI DI CHIUSURA. Il calendario dipingeva di rosso, con la legenda "Da
//    compilare", anche i giorni in cui il negozio era legittimamente chiuso.
//    Una pasticceria chiusa il lunedi' vedeva ogni lunedi' rosso per sempre e
//    non poteva mai arrivare al 100% di copertura. Ora i giorni chiusi — sia
//    ricorrenti sia straordinari — escono dal denominatore e hanno un aspetto
//    loro, neutro.
//
// 3. ACCESSIBILITA'. Le caselle erano <div onClick>: 42 elementi interattivi
//    per schermata irraggiungibili da tastiera e muti per uno screen reader.
//    Ora sono <button> con etichetta parlante.
//
// 4. LEGGIBILITA'. Niente più testo sotto i 12px, e lo stato non e' più
//    affidato al solo colore: chi non distingue il rosso dal verde vedeva tre
//    grigi uguali.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Icon from './Icon'
import { fmtp } from '../views/_shared'
import { supabase } from '../lib/supabase'
import { color as T, radius as R, shadow as S, motion as M, typo } from '../lib/theme'
import { useIsTablet } from '../lib/useIsMobile'
import { giorniConProduzione } from '../lib/inventarioProduzione'
import {
  caricaRegoleChiusura, giornoChiuso, motivoChiusura, regolaInVigore,
  impostaChiusuraRicorrente, aggiungiPeriodoChiuso, rimuoviPeriodiCheCoprono,
} from '../lib/giorniChiusura'
import {
  perGiornoSettimana, frasiDelMese, confrontoConSolito, scalaCalore,
  estremiSettimana, SIGLE_GIORNO,
} from '../lib/ritmo'
import {
  IntestazionePagina, FilaStat, Sezione, MiniBarre, Cifra, Scostamento,
  tintaCalore, num0, capPrima,
} from './PaginaUI'

const GIORNI  = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom']
const MESI    = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
// Scala tipografica del componente, ancorata ai token di theme.js. Prima erano
// numeri sparsi (9, 10, 10.5, 11, 12.5, 13.5): ritoccare la scala del prodotto
// non li avrebbe toccati, e sotto i 12px il testo non lo legge nessuno.
const FS = {
  small: typo.small.fontSize,   // 12 - minimo leggibile, etichette e pill
  body:  typo.body.fontSize,    // 14 - testo corrente
  h3:    typo.h3.fontSize,      // 15 - intestazioni di riquadro
  h1:    typo.h1.fontSize,      // 24 - numeroni dei KPI
}
// Eccezione documentata: su iOS un input sotto i 16px fa zoomare la pagina al
// focus. Vale solo per i campi di testo, non per il resto dell'interfaccia.
const FS_INPUT_IOS = 16

const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// Palette stato (verde/ambra/rosso = semaforo food cost coerente con le altre view).
// Ogni stato porta anche una PAROLA, non solo un colore: circa un uomo su dodici
// non distingue il rosso dal verde e senza etichetta vedrebbe tre grigi uguali.
const STATUS = {
  completo: { color: T.green, label: 'Completo',     breve: 'OK' },
  parziale: { color: T.amber, label: 'Parziale',     breve: 'Metà' },
  vuoto:    { color: T.red,   label: 'Da compilare', breve: '—' },
  chiuso:   { color: T.textSoft, label: 'Chiuso',    breve: 'Chiuso' },
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function buildGrid(anno, mese) {
  const first   = new Date(anno, mese, 1)
  const daysInM = new Date(anno, mese+1, 0).getDate()
  const startDow = (first.getDay() + 6) % 7   // Mon=0 … Sun=6
  const cells = []
  for (let i = startDow-1; i >= 0; i--)
    cells.push({ date: new Date(anno, mese, -i), cur: false })
  for (let d = 1; d <= daysInM; d++)
    cells.push({ date: new Date(anno, mese, d), cur: true })
  while (cells.length % 7 !== 0) {
    const n = cells.length - startDow - daysInM + 1
    cells.push({ date: new Date(anno, mese+1, n), cur: false })
  }
  return cells
}

// useGrouping:'always' obbligatorio: senza, "4715" appare senza separatore migliaia
// su Safari iOS private / Node senza ICU full. Vedi _shared.jsx.
const _NF0_CAL = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const _NF2_CAL = new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const eur0 = v => `${_NF0_CAL.format(Math.round(Number(v) || 0))} €`
const eur2 = v => `${_NF2_CAL.format(Number(v) || 0)} €`

export default function CalendarioOperativo({
  giornaliero, chiusure, orgId, sedeId, setView, notify, isMobile,
  isDipendente = false, metodoProduzione = 'stampi',
}) {
  const isTablet  = useIsTablet()
  const oggi      = useMemo(() => new Date(), [])
  const oggiStr   = useMemo(() => toISO(oggi), [oggi])
  const [anno, setAnno]   = useState(oggi.getFullYear())
  const [mese, setMese]   = useState(oggi.getMonth())
  const [sel, setSel]     = useState(null)      // data selezionata, stringa ISO
  const [note, setNote]   = useState({})        // { "YYYY-MM-DD": { nota, chiuso } }
  const [notaEdit, setNotaEdit] = useState('')
  const [savingNota, setSavingNota] = useState(false)
  const [noteErr, setNoteErr] = useState(false)
  const [apriChiusure, setApriChiusure] = useState(false)
  const [savingChiusure, setSavingChiusure] = useState(false)
  const [prodInventario, setProdInventario] = useState(null) // Set di date, o null
  // Su mobile il mese futuro sta chiuso. Ventitré righe "in arrivo" fra oggi e
  // il ritmo della settimana sono ventitré scorrimenti per arrivare a una cosa
  // utile: i giorni che non sono ancora arrivati non hanno niente da dire.
  const [mostraFuturi, setMostraFuturi] = useState(false)

  const isMetodoInventario = metodoProduzione === 'inventario'

  // ── regole di chiusura: ricorrenti con validità + intervalli ────────────
  const [regole, setRegole] = useState({ ricorrenti: [], periodi: [] })

  const ricaricaRegole = useCallback(async () => {
    if (!orgId) return
    const r = await caricaRegoleChiusura(orgId, sedeId)
    setRegole(r)
  }, [orgId, sedeId])

  useEffect(() => { ricaricaRegole() }, [ricaricaRegole])

  // I giorni della settimana attualmente in vigore, per i pulsanti.
  const giorniChiusura = useMemo(
    () => regolaInVigore(regole.ricorrenti, oggiStr)?.giorni || [],
    [regole.ricorrenti, oggiStr])

  // Cambiare abitudine vale DA OGGI IN POI. Il passato resta com'era: se
  // d'inverno chiudevi il lunedì e da giugno no, i lunedì di gennaio devono
  // continuare a risultare chiusi.
  const salvaGiorniChiusura = async (nuovi) => {
    setSavingChiusure(true)
    try {
      await impostaChiusuraRicorrente(orgId, sedeId, nuovi, oggiStr)
      await ricaricaRegole()
      notify?.(nuovi.length
        ? `Da oggi risulti chiuso il ${nuovi.slice().sort((a,b)=>a-b).map(n => GIORNI[n-1]).join(', ')}. I mesi passati restano come erano.`
        : 'Da oggi non risulti più chiuso in nessun giorno fisso.')
    } catch (e) {
      notify?.(`Non riesco a salvare i giorni di chiusura: ${e.message}`, false)
    } finally { setSavingChiusure(false) }
  }

  // ── produzione: la fonte dipende dal metodo dell'organizzazione ─────────
  // Con metodo inventario la produzione sta in inventario_produzione, non nel
  // blob `giornaliero`. Chiediamo le sole date del mese visibile.
  const meseDa = useMemo(() => `${anno}-${String(mese+1).padStart(2,'0')}-01`, [anno, mese])
  const meseA  = useMemo(() => `${anno}-${String(mese+1).padStart(2,'0')}-${String(new Date(anno,mese+1,0).getDate()).padStart(2,'0')}`, [anno, mese])

  useEffect(() => {
    if (!isMetodoInventario || !orgId) { setProdInventario(null); return }
    let vivo = true
    giorniConProduzione(orgId, sedeId, meseDa, meseA)
      .then(set => { if (vivo) setProdInventario(set) })
    return () => { vivo = false }
  }, [isMetodoInventario, orgId, sedeId, meseDa, meseA])

  // ── mappe di lookup ─────────────────────────────────────────────────────
  // Per i DIPENDENTI: niente info dei giorni passati → solo oggi/futuro.
  const prodMap = useMemo(() => {
    const m = {}
    for (const g of (giornaliero || [])) if (g.data && (!isDipendente || g.data >= oggiStr)) m[g.data] = g
    return m
  }, [giornaliero, isDipendente, oggiStr])

  const cassaMap = useMemo(() => {
    const m = {}
    for (const c of (chiusure || [])) if (c.data && (!isDipendente || c.data >= oggiStr)) m[c.data] = c
    return m
  }, [chiusure, isDipendente, oggiStr])

  // ── quali moduli usa davvero questa azienda ─────────────────────────────
  // Il calendario dava per scontato che tutti registrino sia la produzione sia
  // la cassa. Mara registra la produzione tutti i giorni ma tiene la cassa
  // altrove: pretendere entrambe le faceva vedere 121 "anomalie" e copertura
  // 0% su quattro mesi di lavoro impeccabile.
  //
  // Un attrezzo che pretende un flusso che il cliente non segue viene
  // abbandonato. Quindi osserviamo invece di pretendere: se non esiste NESSUNA
  // chiusura di cassa, quel modulo non fa parte del loro modo di lavorare e non
  // entra nel giudizio. Se non c'è ancora niente di niente siamo in avvio, e
  // allora le chiediamo entrambe per guidare i primi passi.
  const usaCassa = useMemo(() => (chiusure || []).length > 0, [chiusure])
  // Simmetrico, e mancava: la regola valeva solo per la cassa. Chi registra la
  // cassa ogni giorno ma tiene la produzione su carta si vedeva OGNI giornata
  // segnata "registrata a metà" — un pallino d'ambra su tutto il mese, per un
  // modo di lavorare che non ha niente di sbagliato. Con la mappa di calore il
  // difetto è diventato evidente: le giornate migliori del mese portavano tutte
  // un segnale di allarme.
  const usaProduzione = useMemo(
    () => (giornaliero || []).length > 0 || !!prodInventario?.size,
    [giornaliero, prodInventario])
  const inAvvio  = useMemo(
    () => (chiusure || []).length === 0 && (giornaliero || []).length === 0 && !prodInventario?.size,
    [chiusure, giornaliero, prodInventario])
  const cassaRichiesta = usaCassa || inAvvio
  const produzioneRichiesta = usaProduzione || inAvvio

  // "In questo giorno si è prodotto?" — unica domanda che il calendario pone,
  // risposta da fonti diverse a seconda del metodo.
  const haProduzione = useCallback((k) => {
    if (isDipendente && k < oggiStr) return false
    if (isMetodoInventario) return prodInventario ? prodInventario.has(k) : false
    return !!prodMap[k]
  }, [isMetodoInventario, prodInventario, prodMap, isDipendente, oggiStr])

  // ── chiusure: ricorrenti (settimanali) + straordinarie (sul giorno) ─────
  const isChiuso = useCallback((k) => giornoChiuso(k, regole), [regole])
  const perchéChiuso = useCallback((k) => motivoChiusura(k, regole), [regole])

  // ── note del mese visibile ──────────────────────────────────────────────
  // Il filtro sede va applicato anche in LETTURA: prima si leggeva per sola
  // organizzazione ma si scriveva per sede, quindi in un'azienda con più punti
  // vendita comparivano le note delle altre sedi e modificandole se ne creava
  // una nuova invece di aggiornare quella che si stava guardando.
  const richiestaNote = useRef(0)
  useEffect(() => {
    if (!orgId) return
    const mia = ++richiestaNote.current
    setNote({})   // il mese nuovo non deve mostrare le note del mese prima
    let q = supabase.from('note_giornaliere')
      .select('data, nota')
      .eq('organization_id', orgId)
      .gte('data', meseDa).lte('data', meseA)
    q = sedeId ? q.eq('sede_id', sedeId) : q.is('sede_id', null)
    q.then(({ data, error }) => {
      // Scarta le risposte in ritardo: navigando veloce fra i mesi, la risposta
      // lenta di ottobre poteva arrivare dopo quella di novembre e sovrascriverla.
      if (mia !== richiestaNote.current) return
      if (error) { setNoteErr(true); return }
      const map = {}
      for (const n of (data || [])) map[n.data] = { nota: n.nota || '' }
      setNote(map)
    })
  }, [orgId, sedeId, meseDa, meseA])

  const grid = useMemo(() => buildGrid(anno, mese), [anno, mese])

  // ── diagnosi del mese (solo titolare) ───────────────────────────────────
  const diag = useMemo(() => {
    const daysInM = new Date(anno, mese+1, 0).getDate()
    let completi = 0, totPassati = 0, soloProd = 0, soloCassa = 0, vuoti = 0, incasso = 0, chiusi = 0
    for (let d = 1; d <= daysInM; d++) {
      const k = `${anno}-${String(mese+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      if (k > oggiStr) break
      if (isChiuso(k)) { chiusi++; continue }   // chiuso = fuori dal denominatore
      totPassati++
      const hp = haProduzione(k), hc = !!cassaMap[k]
      // "Completo" vuol dire: c'è tutto quello che questa azienda registra
      // davvero. Non tutto quello che il programma sa fare.
      if ((hp || !produzioneRichiesta) && (hc || !cassaRichiesta)) completi++
      else if (hp && !hc) soloProd++
      else if (!hp && hc) soloCassa++
      else vuoti++
      if (cassaMap[k]?.kpi?.totV != null) incasso += Number(cassaMap[k].kpi.totV) || 0
    }
    // Streak: giorni completi consecutivi fino a oggi. I giorni di chiusura non
    // spezzano la serie — chi chiude il lunedì non deve perdere lo streak.
    let streak = 0
    const day = new Date(oggi)
    for (let i = 0; i < 366; i++) {
      const k = toISO(day)
      if (k > oggiStr || isChiuso(k)) { day.setDate(day.getDate()-1); continue }
      if ((haProduzione(k) || !produzioneRichiesta) && (cassaMap[k] || !cassaRichiesta)) { streak++; day.setDate(day.getDate()-1) }
      else if (k === oggiStr) { day.setDate(day.getDate()-1) } // oggi può essere in corso
      else break
    }
    // Anomalia = giorno CHIUSO nel senso di concluso, con solo metà dei dati.
    // Oggi non conta: alle 9 del mattino la cassa non è ancora stata fatta, e
    // segnalarlo come anomalia per tutta la giornata è solo rumore.
    // L'anomalia è "metà giornata registrata": ha senso solo se l'azienda usa
    // entrambi i moduli. Chi non fa la cassa in Foodos non ha 121 anomalie, ha
    // un modo di lavorare diverso.
    let anomalie = 0
    if (cassaRichiesta && produzioneRichiesta) {
      for (let d = 1; d <= daysInM; d++) {
        const k = `${anno}-${String(mese+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        if (k >= oggiStr) break
        if (isChiuso(k)) continue
        if (haProduzione(k) !== !!cassaMap[k]) anomalie++
      }
    }
    const pct = totPassati > 0 ? Math.round(completi/totPassati*100) : 0
    return { completi, totPassati, soloProd, soloCassa, vuoti, anomalie, streak, pct, incasso, chiusi }
  }, [haProduzione, cassaMap, anno, mese, oggiStr, oggi, isChiuso, cassaRichiesta, produzioneRichiesta])

  const semaforo = diag.pct >= 80 ? T.green : diag.pct >= 50 ? T.amber : T.red

  // ── navigazione ─────────────────────────────────────────────────────────
  const prev = () => { setSel(null); if (mese===0){setMese(11);setAnno(a=>a-1)} else setMese(m=>m-1) }
  const next = () => { setSel(null); if (mese===11){setMese(0);setAnno(a=>a+1)} else setMese(m=>m+1) }
  const goOggi = () => { setSel(null); setAnno(oggi.getFullYear()); setMese(oggi.getMonth()) }
  const isMeseCorrente = anno === oggi.getFullYear() && mese === oggi.getMonth()

  // Ri-cliccare lo stesso giorno chiude il dettaglio.
  const handleDay = useCallback((dateStr) => {
    setSel(prev => {
      if (prev === dateStr) return null
      setNotaEdit(note[dateStr]?.nota || '')
      return dateStr
    })
  }, [note])

  // ── chiusura del singolo giorno ─────────────────────────────────────────
  // Un giorno solo è un intervallo che comincia e finisce lo stesso giorno:
  // stesso meccanismo delle ferie, nessun terzo modo di dire la stessa cosa.
  const cambiaChiusuraGiorno = async (chiudi) => {
    if (!orgId || !sel) return
    setSavingNota(true)
    try {
      if (chiudi) await aggiungiPeriodoChiuso(orgId, sedeId, sel, sel, null)
      else        await rimuoviPeriodiCheCoprono(orgId, sedeId, sel)
      await ricaricaRegole()
      notify?.(chiudi ? 'Giorno segnato come chiusura' : 'Giorno riaperto')
    } catch (e) {
      notify?.(`Non riesco a salvare: ${e.message}`, false)
    } finally { setSavingNota(false) }
  }

  // ── salvataggio nota ────────────────────────────────────────────────────
  const salvaNota = async (testo) => {
    if (!orgId || !sel) return
    setSavingNota(true)
    try {
      const q = supabase.from('note_giornaliere')
        .select('id').eq('organization_id', orgId).eq('data', sel)
      if (sedeId) q.eq('sede_id', sedeId); else q.is('sede_id', null)
      const { data: ex } = await q.maybeSingle()
      const nota = (testo || '').trim() || null
      const { error } = ex
        ? await supabase.from('note_giornaliere').update({ nota }).eq('id', ex.id)
        : await supabase.from('note_giornaliere')
            .insert({ organization_id: orgId, sede_id: sedeId || null, data: sel, nota })
      if (error) throw error
      setNote(prev => ({ ...prev, [sel]: { nota: nota || '' } }))
      notify?.('Nota salvata')
    } catch (e) {
      notify?.(e.message, false)
    } finally { setSavingNota(false) }
  }

  // ── stato di un giorno ──────────────────────────────────────────────────
  const getStatus = useCallback((k, cur) => {
    if (!cur) return null
    if (isChiuso(k)) return 'chiuso'
    if (k > oggiStr) return 'futuro'
    const hp = haProduzione(k), hc = !!cassaMap[k]
    if ((hp || !produzioneRichiesta) && (hc || !cassaRichiesta)) return 'completo'
    if (hp || hc) return 'parziale'
    return 'vuoto'
  }, [isChiuso, oggiStr, haProduzione, cassaMap, cassaRichiesta, produzioneRichiesta])

  const selDetail = sel ? {
    haProd:    haProduzione(sel),
    haCassa:   !!cassaMap[sel],
    prodD:     prodMap[sel],
    cassaD:    cassaMap[sel],
    isFuture:  sel > oggiStr,
    isToday:   sel === oggiStr,
    isChiuso:  isChiuso(sel),
    // Anomalia solo su giornate concluse e solo se l'azienda usa entrambi i
    // moduli: coerente con il KPI qui sopra, che prima diceva un'altra cosa.
    isAnomalia: cassaRichiesta && produzioneRichiesta && sel < oggiStr && !isChiuso(sel)
      && (haProduzione(sel) !== !!cassaMap[sel]),
  } : null

  // Lista mobile: tutti i giorni del mese in ordine crescente 1→N. Audit
  // 2026-06-25: l'utente legge il calendario come fosse su carta.
  const mobileList = useMemo(() => {
    const daysInM = new Date(anno, mese+1, 0).getDate()
    const days = []
    for (let d = 1; d <= daysInM; d++) {
      days.push(`${anno}-${String(mese+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
    }
    return days
  }, [anno, mese])

  // Etichetta per screen reader e per il title al passaggio del mouse.
  const etichettaGiorno = useCallback((k) => {
    const d = new Date(k + 'T12:00')
    const data = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    const st = getStatus(k, true)
    if (st === 'chiuso') return `${data}: chiuso`
    if (st === 'futuro') return `${data}: in arrivo`
    const parti = []
    if (produzioneRichiesta) parti.push(haProduzione(k) ? 'produzione registrata' : 'produzione mancante')
    if (cassaRichiesta) parti.push(cassaMap[k] ? 'cassa registrata' : 'cassa mancante')
    const inc = cassaMap[k]?.kpi?.totV
    if (inc != null) parti.push(`${num0(inc)} euro incassati`)
    if (note[k]?.nota) parti.push('con nota')
    return `${data}: ${parti.join(', ')}`
  }, [getStatus, haProduzione, cassaMap, note, cassaRichiesta, produzioneRichiesta])
  // ── il ritmo: quanto vale ogni giorno della settimana ───────────────────
  //
  // Su tre mesi e non sul mese visibile. Con un solo mese un sabato di sagra
  // sposta il "solito sabato" e il confronto diventa inaffidabile proprio nel
  // momento in cui serve. Tre mesi sono il minimo per dire qualcosa di vero
  // senza risalire a stagioni diverse.
  const daTreMesi = useMemo(() => {
    const d = new Date(meseA + 'T12:00')
    d.setDate(d.getDate() - 84)
    return d.toISOString().slice(0, 10)
  }, [meseA])

  const ritmo = useMemo(
    () => perGiornoSettimana(chiusure, { from: daTreMesi, to: meseA }),
    [chiusure, daTreMesi, meseA])

  const ritmoMax = useMemo(() => Math.max(0, ...ritmo.map(v => v.tipico)), [ritmo])

  // Il giorno forte e quello debole si misurano sulla stessa finestra di tre
  // mesi del ritmo, NON sul mese visibile. Sono un fatto sul negozio, non su
  // settembre: nella prima settimana di un mese non esiste nemmeno un sabato
  // ripetuto, e la frase spariva proprio quando la pagina si apriva.
  const estremiRitmo = useMemo(
    () => estremiSettimana(chiusure, { from: daTreMesi, to: meseA }),
    [chiusure, daTreMesi, meseA])

  // ── il mese in una frase ────────────────────────────────────────────────
  const giorniAperti = useMemo(() => {
    const daysInM = new Date(anno, mese + 1, 0).getDate()
    let n = 0
    for (let d = 1; d <= daysInM; d++) {
      const k = `${anno}-${String(mese + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (k > oggiStr) break
      if (!isChiuso(k)) n++
    }
    return n
  }, [anno, mese, oggiStr, isChiuso])

  const mesePanorama = useMemo(
    () => frasiDelMese(chiusure, { from: meseDa, to: meseA, giorniAperti }),
    [chiusure, meseDa, meseA, giorniAperti])

  // La scala di calore si costruisce sul mese visibile: l'intensità dice
  // "molto o poco PER QUESTO MESE", che è la domanda che si fa guardandolo.
  const scala = useMemo(() => {
    const valori = []
    const daysInM = new Date(anno, mese + 1, 0).getDate()
    for (let d = 1; d <= daysInM; d++) {
      const k = `${anno}-${String(mese + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const v = cassaMap[k]?.kpi?.totV
      if (v != null) valori.push(Number(v) || 0)
    }
    return scalaCalore(valori)
  }, [anno, mese, cassaMap])

  // Il confronto del giorno selezionato con un giorno come quello.
  const confrontoSel = useMemo(
    () => (sel && cassaMap[sel] ? confrontoConSolito(chiusure, sel) : null),
    [sel, cassaMap, chiusure])

  const frase = useMemo(() => {
    const p = mesePanorama
    if (!usaCassa) {
      // Chi tiene la cassa altrove non deve leggere "0 €": per lui questa
      // pagina parla di produzione, e va detto invece di mostrargli un vuoto.
      if (diag.totPassati === 0) return 'Questo mese non ha ancora giornate da registrare.'
      const coda = diag.chiusi ? `, escluse le ${diag.chiusi} di chiusura` : ''
      return diag.completi === 0
        ? `Nessuna giornata di produzione registrata, su ${diag.totPassati} aperte${coda}.`
        : `${diag.completi} giornate di produzione registrate su ${diag.totPassati}${coda}.`
    }
    if (p.giorni === 0) {
      return p.daRegistrare > 0
        ? `Di ${MESI[mese].toLowerCase()} non c'è ancora nessun incasso: ${p.daRegistrare} ${p.daRegistrare === 1 ? 'giornata aperta' : 'giornate aperte'} da registrare.`
        : `Di ${MESI[mese].toLowerCase()} non c'è ancora nessun incasso registrato.`
    }
    const parti = [
      `${num0(p.totale)} € in ${p.giorni} ${p.giorni === 1 ? 'giornata' : 'giornate'}, ${num0(p.media)} € al giorno in media.`,
    ]
    const e = estremiRitmo
    if (e) {
      const r = e.rapporto
      const quanto = r >= 2.8 ? 'più del triplo' : r >= 1.8 ? 'il doppio' : r >= 1.35 ? 'una volta e mezza' : null
      if (quanto) parti.push(`Il ${e.migliore.nome} incassa ${quanto} del ${e.peggiore.nome}.`)
    }
    if (p.daRegistrare > 0) {
      parti.push(`${p.daRegistrare} ${p.daRegistrare === 1 ? 'giornata' : 'giornate'} da registrare.`)
    }
    return parti.join(' ')
  }, [mesePanorama, mese, usaCassa, diag, estremiRitmo])

  // ── il giorno: dettaglio ────────────────────────────────────────────────
  // Su mobile va INLINE subito sotto la card toccata: in fondo alla lista non
  // si capiva dove fosse finito. Su desktop è la colonna di destra, che resta
  // sempre della stessa larghezza — riservarle lo spazio tiene la griglia
  // immobile invece di farla restringere sotto il dito al clic.
  const renderDetail = () => {
    if (!sel || !selDetail) return null
    const cassa = selDetail.cassaD
    const totale = cassa?.kpi?.totV
    const kpi = cassa?.kpi || {}
    const canali = [
      ['POS', kpi.pos], ['Contanti', kpi.contanti], ['Delivery', kpi.delivery],
    ].filter(([, v]) => v != null && Number(v) > 0)

    return (
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
          padding: isMobile ? '13px 14px' : '15px 17px', borderBottom: `1px solid ${T.borderSoft}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...typo.h3, color: T.text, lineHeight: 1.3 }}>
              {capPrima(new Date(sel + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              {selDetail.isToday && <Badge color={T.brand} bg={T.brandLight}>oggi</Badge>}
              {selDetail.isFuture && <Badge color={T.textSoft} bg={T.bgSubtle}>in arrivo</Badge>}
              {selDetail.isChiuso && <Badge color={T.textMid} bg={T.bgSubtle}>chiuso</Badge>}
              {selDetail.isAnomalia && <Badge color={T.amber} bg={T.amberLight}>a metà</Badge>}
            </div>
          </div>
          <button aria-label="Chiudi il dettaglio" onClick={() => setSel(null)}
            style={{
              width: 32, height: 32, flexShrink: 0, borderRadius: R.md, cursor: 'pointer',
              background: 'transparent', border: 'none', color: T.textSoft,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: isMobile ? '14px' : '16px 17px', display: 'grid', gap: 14 }}>

          {/* L'incasso, se c'è: è il numero per cui si apre un giorno. */}
          {totale != null && (
            <div>
              <div style={{ ...typo.small, color: T.textSoft, fontWeight: 600, marginBottom: 3 }}>Incassato</div>
              <Cifra valore={totale} decimali size={isMobile ? typo.h1.fontSize : typo.display.fontSize} />
              {confrontoSel && (
                <div style={{ marginTop: 7 }}><Scostamento confronto={confrontoSel} /></div>
              )}
              {canali.length > 0 && (
                <div style={{
                  display: 'flex', gap: 0, marginTop: 12,
                  border: `1px solid ${T.borderSoft}`, borderRadius: R.md, overflow: 'hidden',
                }}>
                  {canali.map(([nome, v], i) => (
                    <div key={nome} style={{
                      flex: 1, minWidth: 0, padding: '8px 10px',
                      borderLeft: i > 0 ? `1px solid ${T.borderSoft}` : 'none',
                    }}>
                      <div style={{ ...typo.caption, color: T.textSoft, minHeight: 15 }}>{nome}</div>
                      <div style={{ minHeight: 19, marginTop: 2 }}>
                        <Cifra valore={v} size={typo.small.fontSize} peso={700} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cos'è registrato e cosa manca. Su un giorno chiuso non si chiede. */}
          {!selDetail.isChiuso && (
            <div style={{ display: 'grid', gap: 7 }}>
              {[
                ...(produzioneRichiesta || selDetail.haProd ? [{ icona: 'package', nome: 'Produzione', ha: selDetail.haProd,
                  vista: isMetodoInventario ? 'inventario-gusti' : 'giornaliero',
                  nota: (!isMetodoInventario && selDetail.prodD)
                    ? `${selDetail.prodD.prodotti?.length || 0} prodotti`
                    : (selDetail.haProd ? 'registrata' : null) }] : []),
                ...((cassaRichiesta || selDetail.haCassa) ? [{
                  icona: 'receipt', nome: 'Cassa', ha: selDetail.haCassa, vista: 'chiusura',
                  nota: kpi.totMP != null && selDetail.haCassa
                    ? `margine ${fmtp(Number(kpi.totMP) || 0)}` : null,
                }] : []),
              ].map(({ icona, nome, ha, nota, vista }) => (
                <div key={nome} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderRadius: R.md, background: T.bgSubtle,
                  border: `1px solid ${ha ? T.borderSoft : T.borderStr}`,
                  borderStyle: ha || selDetail.isFuture ? 'solid' : 'dashed',
                }}>
                  <Icon name={icona} size={16} color={ha ? T.green : T.textSoft} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...typo.small, fontWeight: 700, color: T.text }}>{nome}</div>
                    <div style={{ ...typo.caption, color: T.textSoft, marginTop: 1 }}>
                      {ha ? (nota || 'registrata') : selDetail.isFuture ? 'in arrivo' : 'da registrare'}
                    </div>
                  </div>
                  {!ha && !selDetail.isFuture && setView && (
                    <button onClick={() => setView(vista)}
                      style={{
                        ...typo.small, fontWeight: 700, color: T.brand, fontFamily: 'inherit',
                        background: T.bgCard, border: `1px solid ${T.brand}`, borderRadius: R.md,
                        padding: '0 12px', minHeight: 36, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>Registra</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Perché risulta chiuso: senza spiegazione sembra un errore. */}
          {selDetail.isChiuso && (
            <div style={{ ...typo.small, color: T.textMid, lineHeight: 1.5 }}>
              Risulta chiuso — {perchéChiuso(sel) || 'chiusura programmata'}. Nei giorni di chiusura non ti chiediamo di registrare nulla, e non pesano sul conto del mese.
            </div>
          )}

          {/* Chiusura straordinaria del singolo giorno, solo al titolare. */}
          {!isDipendente && !selDetail.isFuture && (
            <button onClick={() => cambiaChiusuraGiorno(!selDetail.isChiuso)} disabled={savingNota}
              style={{
                ...typo.small, fontWeight: 700, fontFamily: 'inherit', minHeight: 40,
                background: 'transparent', border: `1px solid ${T.borderStr}`, borderRadius: R.md,
                color: T.textMid, cursor: savingNota ? 'default' : 'pointer', padding: '0 13px',
                justifySelf: 'start',
              }}>
              {selDetail.isChiuso ? 'Riapri questo giorno' : 'Segna come chiuso'}
            </button>
          )}

          {/* Nota del giorno */}
          <div>
            <label htmlFor="fos-cal-nota" style={{ ...typo.small, color: T.textSoft, fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Nota del giorno
            </label>
            <textarea id="fos-cal-nota" value={notaEdit} onChange={e => setNotaEdit(e.target.value)}
              placeholder="Sagra in piazza, forno rotto, ordine grosso…" rows={2}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 11px', resize: 'vertical',
                border: `1px solid ${T.borderStr}`, borderRadius: R.md, fontFamily: 'inherit',
                fontSize: FS_INPUT_IOS, color: T.text, lineHeight: 1.45, background: T.bgCard,
              }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button onClick={() => salvaNota(notaEdit)}
                disabled={savingNota || notaEdit === (note[sel]?.nota || '')}
                style={{
                  ...typo.small, fontWeight: 700, fontFamily: 'inherit', minHeight: 38, padding: '0 14px',
                  borderRadius: R.md, border: 'none', cursor: 'pointer',
                  background: (savingNota || notaEdit === (note[sel]?.nota || '')) ? T.bgMuted : T.brand,
                  color: (savingNota || notaEdit === (note[sel]?.nota || '')) ? T.textSoft : T.textOnDark,
                }}>
                {savingNota ? 'Salvo…' : 'Salva la nota'}
              </button>
              {noteErr && <span style={{ ...typo.caption, color: T.amber }}>Le note non si caricano.</span>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── una casella della griglia ───────────────────────────────────────────
  //
  // È il cuore del redesign. Prima ogni casella diceva lo stato di
  // COMPILAZIONE — "OK", "Metà", "—" — che è la cosa meno interessante che si
  // possa sapere di una giornata, e non dava nessun senso di grandezza: non si
  // vedeva che il sabato vale il triplo del martedì.
  //
  // Ora il fondo è tanto più intenso quanto più si è incassato. Il mese si
  // legge come una mappa, senza leggere una cifra. Lo stato di compilazione
  // resta, ma come segno: il tratteggio vuol dire "da registrare", e il
  // tratteggio si vede anche da chi non distingue i colori.
  const Casella = ({ k, date, alta }) => {
    const status = getStatus(k, true)
    const isOggi = k === oggiStr
    const isSel  = k === sel
    const totale = cassaMap[k]?.kpi?.totV
    const hasNota = !!note[k]?.nota
    const peso = totale != null ? scala(totale) : 0
    const tinta = tintaCalore(peso)
    const daFare = status === 'vuoto' || status === 'parziale'
    const chiuso = status === 'chiuso'
    const futuro = status === 'futuro'

    const coloreNumero = tinta.forte ? T.textOnDark
      : chiuso ? T.textFaint
      : futuro ? T.textSoft
      : isOggi ? T.brand : T.text

    return (
      <button onClick={() => handleDay(k)}
        aria-label={etichettaGiorno(k)} aria-pressed={isSel} title={etichettaGiorno(k)}
        style={{
          position: 'relative', width: '100%', minHeight: alta, padding: '7px 8px',
          textAlign: 'left', font: 'inherit', cursor: 'pointer', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', borderRadius: R.lg,
          background: chiuso ? T.bgSubtle : totale != null ? tinta.background : T.bgCard,
          border: `1px ${daFare && !futuro ? 'dashed' : 'solid'} ${
            isSel || isOggi ? T.brand : daFare && !futuro ? T.borderStr : T.borderSoft}`,
          boxShadow: isSel ? `inset 0 0 0 1px ${T.brand}` : 'none',
          transition: 'background 140ms ease, border-color 140ms ease',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <span style={{
            ...tnum, ...typo.small, fontWeight: isOggi ? 800 : 700, color: coloreNumero,
          }}>{date.getDate()}</span>
          {hasNota && (
            <span style={{ display: 'inline-flex', color: tinta.forte ? T.textOnDarkMid : T.amber, flexShrink: 0 }}>
              <Icon name="edit" size={11} />
            </span>
          )}
        </div>

        <div style={{ marginTop: 'auto' }}>
          {totale != null ? (
            <span style={{
              ...tnum, ...typo.small, fontWeight: 800,
              color: tinta.forte ? T.textOnDark : T.text, letterSpacing: '-0.02em',
            }}>{num0(totale)}<span style={{ fontWeight: 600, opacity: 0.7 }}> €</span></span>
          ) : chiuso ? (
            <span style={{ ...typo.caption, color: T.textFaint }}>chiuso</span>
          ) : daFare ? (
            <span style={{ ...typo.caption, color: T.textSoft }}>da fare</span>
          ) : null}
        </div>

        {/* Mezza giornata registrata: segno in alto a destra, non un colore. */}
        {status === 'parziale' && (
          <span style={{
            position: 'absolute', top: 6, right: hasNota ? 22 : 6,
            width: 6, height: 6, borderRadius: '50%', background: T.amber,
          }} />
        )}
      </button>
    )
  }

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

      <IntestazionePagina
        titolo={`${MESI[mese]} ${anno}`}
        frase={frase}
        azioni={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isMeseCorrente && (
              <button onClick={goOggi} style={{
                ...typo.small, fontWeight: 700, fontFamily: 'inherit', minHeight: isMobile ? 44 : 38,
                padding: '0 13px', borderRadius: R.md, cursor: 'pointer',
                background: T.bgCard, border: `1px solid ${T.borderStr}`, color: T.textMid,
              }}>Oggi</button>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={prev} aria-label="Mese precedente" style={navBtn(isMobile)}>
                <Icon name="chevR" size={15} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button onClick={next} aria-label="Mese successivo" style={navBtn(isMobile)}>
                <Icon name="chevR" size={15} />
              </button>
            </div>
          </div>
        }
        sotto={!isDipendente && (
          <FilaStat voci={[
            usaCassa && { label: 'Incassato nel mese', valore: mesePanorama.totale, sub: mesePanorama.giorni > 0 ? `${mesePanorama.giorni} giornate registrate` : 'nessuna giornata' },
            usaCassa && { label: 'Media al giorno', valore: mesePanorama.media, sub: mesePanorama.giorni > 0 ? 'sulle giornate registrate' : '—' },
            usaCassa && mesePanorama.giornoMigliore
              ? {
                  label: 'Giornata migliore', valore: mesePanorama.giornoMigliore.incasso,
                  sub: new Date(mesePanorama.giornoMigliore.data + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' }),
                  onClick: () => handleDay(mesePanorama.giornoMigliore.data),
                }
              : null,
            {
              label: 'Da registrare',
              valore: usaCassa ? mesePanorama.daRegistrare : diag.totPassati - diag.completi,
              unita: '',
              colore: (usaCassa ? mesePanorama.daRegistrare : diag.totPassati - diag.completi) > 0 ? T.amber : T.green,
              sub: diag.chiusi > 0 ? `${diag.chiusi} gg di chiusura esclusi` : 'giornate aperte senza dati',
            },
          ].filter(Boolean)} />
        )}
      />

      <div style={{
        display: 'grid', gap: isMobile ? 14 : 18, alignItems: 'start',
        gridTemplateColumns: (isMobile || isTablet) ? '1fr' : 'minmax(0, 1fr) 320px',
      }}>

        {/* ── LA MAPPA DEL MESE ───────────────────────────────────────────── */}
        <div style={{ minWidth: 0, display: 'grid', gap: isMobile ? 14 : 18 }}>
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
            padding: isMobile ? 13 : 17,
          }}>
            {isMobile ? (
              /* Su mobile la griglia a sette colonne dà caselle da 40px:
                 illeggibili e impossibili da centrare col dito. Lista, con la
                 barra di calore a sinistra che fa lo stesso lavoro del fondo. */
              <div style={{ display: 'grid', gap: 5 }}>
                {(mostraFuturi ? mobileList : mobileList.filter(k => k <= oggiStr)).map(k => {
                  const status = getStatus(k, true)
                  const totale = cassaMap[k]?.kpi?.totV
                  const peso = totale != null ? scala(totale) : 0
                  const tinta = tintaCalore(peso)
                  const isOggi = k === oggiStr
                  const isSel = k === sel
                  const d = new Date(k + 'T12:00')
                  const daFare = status === 'vuoto' || status === 'parziale'
                  return (
                    <React.Fragment key={k}>
                      <button onClick={() => handleDay(k)} aria-label={etichettaGiorno(k)} aria-pressed={isSel}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 11, width: '100%', minHeight: 52,
                          padding: '9px 12px 9px 9px', borderRadius: R.lg, textAlign: 'left',
                          font: 'inherit', cursor: 'pointer', boxSizing: 'border-box',
                          background: isSel ? T.brandLight : T.bgCard,
                          border: `1px ${daFare ? 'dashed' : 'solid'} ${isSel || isOggi ? T.brand : daFare ? T.borderStr : T.borderSoft}`,
                        }}>
                        <span style={{
                          width: 5, alignSelf: 'stretch', borderRadius: R.full, flexShrink: 0,
                          background: totale != null ? tinta.background : 'transparent',
                          border: totale != null ? 'none' : `1px dashed ${T.borderStr}`,
                        }} />
                        <span style={{ width: 30, flexShrink: 0 }}>
                          <span style={{ ...tnum, ...typo.bodyStrong, color: isOggi ? T.brand : T.text, display: 'block' }}>{d.getDate()}</span>
                          <span style={{ ...typo.caption, color: T.textSoft, display: 'block' }}>{SIGLE_GIORNO[(d.getDay() + 6) % 7]}</span>
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {totale != null ? (
                            <Cifra valore={totale} size={typo.body.fontSize} />
                          ) : (
                            <span style={{ ...typo.small, color: T.textSoft }}>
                              {status === 'chiuso' ? 'chiuso' : status === 'futuro' ? 'in arrivo' : 'da registrare'}
                            </span>
                          )}
                          {status === 'parziale' && (
                            <span style={{ ...typo.caption, color: T.amber, display: 'block', marginTop: 1 }}>registrata a metà</span>
                          )}
                        </span>
                        {!!note[k]?.nota && <Icon name="edit" size={12} color={T.amber} />}
                      </button>
                      {isSel && <div style={{ margin: '2px 0 6px' }}>{renderDetail()}</div>}
                    </React.Fragment>
                  )
                })}
                {!mostraFuturi && mobileList.some(k => k > oggiStr) && (
                  <button onClick={() => setMostraFuturi(true)}
                    style={{
                      minHeight: 46, borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
                      background: T.bgCard, border: `1px dashed ${T.borderStr}`, color: T.textMid,
                      ...typo.small, fontWeight: 700, marginTop: 3,
                    }}>
                    Mostra i {mobileList.filter(k => k > oggiStr).length} giorni che restano
                  </button>
                )}
                {mostraFuturi && (
                  <button onClick={() => setMostraFuturi(false)}
                    style={{
                      minHeight: 46, borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
                      background: T.bgCard, border: `1px dashed ${T.borderStr}`, color: T.textMid,
                      ...typo.small, fontWeight: 700, marginTop: 3,
                    }}>
                    Nascondi i giorni futuri
                  </button>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 7 }}>
                  {GIORNI.map(g => (
                    <div key={g} style={{
                      ...typo.overline, textAlign: 'center', paddingBottom: 2,
                      color: (g === 'Sab' || g === 'Dom') ? T.textMid : T.textSoft,
                    }}>{g}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
                  {grid.map(({ date, cur }, idx) => cur
                    ? <Casella key={idx} k={toISO(date)} date={date} alta={isTablet ? 74 : 82} />
                    : <div key={idx} style={{ minHeight: isTablet ? 74 : 82, borderRadius: R.lg, background: T.bgSubtle, opacity: 0.35 }} />
                  )}
                </div>
              </>
            )}

            {/* Legenda: la scala di calore, non un elenco di stati. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              marginTop: 15, paddingTop: 13, borderTop: `1px solid ${T.borderSoft}`,
            }}>
              {usaCassa && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ ...typo.caption, color: T.textSoft }}>poco</span>
                  <span style={{ display: 'flex', gap: 2 }}>
                    {[0.12, 0.35, 0.58, 0.8, 1].map(p => (
                      <span key={p} style={{ width: 17, height: 11, borderRadius: 3, background: tintaCalore(p).background, border: `1px solid ${T.borderSoft}` }} />
                    ))}
                  </span>
                  <span style={{ ...typo.caption, color: T.textSoft }}>molto incassato</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...typo.caption, color: T.textSoft }}>
                <span style={{ width: 15, height: 11, borderRadius: 3, border: `1px dashed ${T.borderStr}` }} />
                da registrare
              </div>
              {mobileList.some(k => getStatus(k, true) === 'parziale') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...typo.caption, color: T.textSoft }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.amber }} />
                  registrata a metà
                </div>
              )}
            </div>
          </div>

          {/* ── IL RITMO DELLA SETTIMANA ─────────────────────────────────────
              La cosa che nessun gestionale del loro giro mostra, e che serve
              ogni settimana: quanto vale ogni giorno. Da qui si decide quanto
              produrre e chi mettere al banco. */}
          {usaCassa && ritmoMax > 0 && (
            <Sezione icona="barChart" titolo="Il ritmo della settimana"
              sub="Incasso tipico di ogni giorno, sugli ultimi tre mesi. Serve a decidere quanto produrre e chi mettere al banco.">
              <MiniBarre voci={ritmo.map(v => ({
                etichetta: v.sigla,
                valore: v.tipico,
                forte: v.tipico === ritmoMax,
              }))} />
              <div style={{ ...typo.caption, color: T.textSoft, marginTop: 11, lineHeight: 1.5 }}>
                È la mediana e non la media: una sagra o un Ferragosto non devono spostare quello che consideri un giorno normale.
                {ritmo.some(v => v.giorni === 1) && ' I giorni con una sola giornata in archivio dicono ancora poco.'}
              </div>
            </Sezione>
          )}

          {/* Giorni di chiusura fissi. Stanno qui perché è guardando il
              calendario che ci si accorge del problema. */}
          {!isDipendente && (
            <Sezione icona="calendar" apribile apertaDiDefault={false}
              titolo={giorniChiusura.length > 0
                ? `Chiuso il ${giorniChiusura.slice().sort((a, b) => a - b).map(n => GIORNI[n - 1]).join(', ')}`
                : 'Giorni di chiusura'}
              sub="Nei giorni di chiusura non ti chiediamo di registrare nulla e non pesano sul conto del mese.">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {GIORNI.map((g, i) => {
                  const iso = i + 1
                  const attivo = giorniChiusura.includes(iso)
                  return (
                    <button key={g} disabled={savingChiusure} aria-pressed={attivo}
                      onClick={() => salvaGiorniChiusura(
                        attivo ? giorniChiusura.filter(n => n !== iso) : [...giorniChiusura, iso])}
                      style={{
                        minWidth: 54, minHeight: 42, borderRadius: R.md, cursor: 'pointer',
                        ...typo.small, fontWeight: 700, fontFamily: 'inherit',
                        border: `1px solid ${attivo ? T.brand : T.borderStr}`,
                        background: attivo ? T.brand : T.bgCard,
                        color: attivo ? T.textOnDark : T.textMid,
                      }}>{g}</button>
                  )
                })}
              </div>
              <div style={{ ...typo.caption, color: T.textSoft, marginTop: 10, lineHeight: 1.5 }}>
                Vale da oggi in avanti: i mesi passati restano come erano, così il calendario di gennaio continua a raccontare come lavoravi a gennaio.
              </div>
            </Sezione>
          )}
        </div>

        {/* ── IL GIORNO ───────────────────────────────────────────────────────
            Su desktop la colonna esiste sempre, anche vuota. Prima il pannello
            era in `position: fixed` in alto a destra, sganciato dal layout:
            copriva il contenuto e non seguiva lo scorrimento. */}
        {!isMobile && (
          <div style={{ minWidth: 0, position: isTablet ? 'static' : 'sticky', top: 16 }}>
            {sel ? renderDetail() : (
              <div style={{
                background: T.bgCard, border: `1px dashed ${T.borderStr}`, borderRadius: R.xl,
                padding: '22px 18px', textAlign: 'center',
              }}>
                <div style={{ display: 'inline-flex', color: T.textFaint, marginBottom: 9 }}>
                  <Icon name="calendar" size={22} />
                </div>
                <div style={{ ...typo.small, color: T.textMid, lineHeight: 1.5 }}>
                  Tocca un giorno per vedere com'è andato, cosa manca e per lasciarci una nota.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const navBtn = (isMobile) => ({
  width: isMobile ? 44 : 38, height: isMobile ? 44 : 38, borderRadius: R.md,
  background: T.bgCard, border: `1px solid ${T.borderStr}`, color: T.textMid,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
})

function Badge({ color, bg, children }) {
  return (
    <span style={{
      ...typo.caption, fontWeight: 700, color, background: bg, borderRadius: R.full,
      padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>{children}</span>
  )
}
