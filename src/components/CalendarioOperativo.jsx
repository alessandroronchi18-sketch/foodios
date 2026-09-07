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
import { supabase } from '../lib/supabase'
import { color as T, radius as R, shadow as S, motion as M, typo } from '../lib/theme'
import { useIsTablet } from '../lib/useIsMobile'
import { giorniConProduzione } from '../lib/inventarioProduzione'

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

// Giorno della settimana in numerazione ISO: 1 = lunedi ... 7 = domenica.
// Corrisponde a organizations.giorni_chiusura.
function isoWeekday(d) {
  const js = d.getDay()          // 0 = domenica
  return js === 0 ? 7 : js
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
  const [giorniChiusura, setGiorniChiusura] = useState([])   // ISO 1..7
  const [apriChiusure, setApriChiusure] = useState(false)
  const [savingChiusure, setSavingChiusure] = useState(false)
  const [prodInventario, setProdInventario] = useState(null) // Set di date, o null

  const isMetodoInventario = metodoProduzione === 'inventario'

  // ── giorni di chiusura ricorrenti dell'organizzazione ───────────────────
  useEffect(() => {
    if (!orgId) return
    let vivo = true
    supabase.from('organizations').select('giorni_chiusura').eq('id', orgId).maybeSingle()
      .then(({ data }) => { if (vivo && data) setGiorniChiusura(data.giorni_chiusura || []) })
    return () => { vivo = false }
  }, [orgId])

  const salvaGiorniChiusura = async (nuovi) => {
    const prima = giorniChiusura
    setGiorniChiusura(nuovi)          // ottimistico: il toggle deve rispondere subito
    setSavingChiusure(true)
    const { error } = await supabase.from('organizations')
      .update({ giorni_chiusura: nuovi }).eq('id', orgId)
    setSavingChiusure(false)
    if (error) {
      setGiorniChiusura(prima)        // rollback: lo schermo non deve mentire
      notify?.('Non riesco a salvare i giorni di chiusura. Riprova.', false)
    }
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
  const inAvvio  = useMemo(
    () => (chiusure || []).length === 0 && (giornaliero || []).length === 0 && !prodInventario?.size,
    [chiusure, giornaliero, prodInventario])
  const cassaRichiesta = usaCassa || inAvvio

  // "In questo giorno si è prodotto?" — unica domanda che il calendario pone,
  // risposta da fonti diverse a seconda del metodo.
  const haProduzione = useCallback((k) => {
    if (isDipendente && k < oggiStr) return false
    if (isMetodoInventario) return prodInventario ? prodInventario.has(k) : false
    return !!prodMap[k]
  }, [isMetodoInventario, prodInventario, prodMap, isDipendente, oggiStr])

  // ── chiusure: ricorrenti (settimanali) + straordinarie (sul giorno) ─────
  const isChiuso = useCallback((k) => {
    if (note[k]?.chiuso) return true
    const d = new Date(k + 'T12:00')
    return giorniChiusura.includes(isoWeekday(d))
  }, [note, giorniChiusura])

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
      .select('data, nota, chiuso')
      .eq('organization_id', orgId)
      .gte('data', meseDa).lte('data', meseA)
    q = sedeId ? q.eq('sede_id', sedeId) : q.is('sede_id', null)
    q.then(({ data, error }) => {
      // Scarta le risposte in ritardo: navigando veloce fra i mesi, la risposta
      // lenta di ottobre poteva arrivare dopo quella di novembre e sovrascriverla.
      if (mia !== richiestaNote.current) return
      if (error) { setNoteErr(true); return }
      const map = {}
      for (const n of (data || [])) map[n.data] = { nota: n.nota || '', chiuso: !!n.chiuso }
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
      // Se l'azienda non usa la cassa, "completo" vuol dire solo produzione.
      if (hp && (hc || !cassaRichiesta)) completi++
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
      if (haProduzione(k) && (cassaMap[k] || !cassaRichiesta)) { streak++; day.setDate(day.getDate()-1) }
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
    if (cassaRichiesta) {
      for (let d = 1; d <= daysInM; d++) {
        const k = `${anno}-${String(mese+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        if (k >= oggiStr) break
        if (isChiuso(k)) continue
        if (haProduzione(k) !== !!cassaMap[k]) anomalie++
      }
    }
    const pct = totPassati > 0 ? Math.round(completi/totPassati*100) : 0
    return { completi, totPassati, soloProd, soloCassa, vuoti, anomalie, streak, pct, incasso, chiusi }
  }, [haProduzione, cassaMap, anno, mese, oggiStr, oggi, isChiuso, cassaRichiesta])

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

  // ── salvataggio nota / chiusura straordinaria ───────────────────────────
  const scriviGiorno = async (patch) => {
    if (!orgId || !sel) return
    setSavingNota(true)
    try {
      const q = supabase.from('note_giornaliere')
        .select('id').eq('organization_id', orgId).eq('data', sel)
      if (sedeId) q.eq('sede_id', sedeId); else q.is('sede_id', null)
      const { data: ex } = await q.maybeSingle()

      const attuale = note[sel] || { nota: '', chiuso: false }
      const payload = {
        organization_id: orgId, sede_id: sedeId || null, data: sel,
        nota: patch.nota !== undefined ? (patch.nota.trim() || null) : (attuale.nota || null),
        chiuso: patch.chiuso !== undefined ? patch.chiuso : attuale.chiuso,
      }
      const { error } = ex
        ? await supabase.from('note_giornaliere')
            .update({ nota: payload.nota, chiuso: payload.chiuso }).eq('id', ex.id)
        : await supabase.from('note_giornaliere').insert(payload)
      if (error) throw error

      setNote(prev => ({ ...prev, [sel]: { nota: payload.nota || '', chiuso: payload.chiuso } }))
      notify?.(patch.chiuso !== undefined
        ? (patch.chiuso ? 'Giorno segnato come chiuso' : 'Giorno riaperto')
        : 'Nota salvata')
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
    if (hp && (hc || !cassaRichiesta)) return 'completo'
    if (hp || hc) return 'parziale'
    return 'vuoto'
  }, [isChiuso, oggiStr, haProduzione, cassaMap, cassaRichiesta])

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
    isAnomalia: cassaRichiesta && sel < oggiStr && !isChiuso(sel)
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
    parti.push(haProduzione(k) ? 'produzione registrata' : 'produzione mancante')
    if (cassaRichiesta) parti.push(cassaMap[k] ? 'cassa registrata' : 'cassa mancante')
    if (note[k]?.nota) parti.push('con nota')
    return `${data}: ${parti.join(', ')}`
  }, [getStatus, haProduzione, cassaMap, note, cassaRichiesta])

  // Pannello dettaglio: estratto in funzione perché su mobile va inserito
  // INLINE subito sotto la card cliccata (audit 2026-06-24: prima compariva in
  // fondo alla lista e non si capiva dove fosse). Su desktop resta laterale.
  const renderDetail = (inline) => {
    if (!sel || !selDetail) return null
    return (
      <div style={{
        width: inline ? '100%' : (isMobile || isTablet ? '100%' : 288), flexShrink: 0,
        background: T.bgCard, borderRadius: 16, border: `1px solid ${T.border}`,
        boxShadow: SHADOW_PREMIUM,
        padding: 20, position: (inline || isMobile || isTablet) ? 'static' : 'sticky', top: 24,
        marginTop: inline ? 4 : (isMobile || isTablet ? 16 : 0),
        marginBottom: inline ? 6 : 0,
        animation: 'fos_calSlideIn 0.16s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: FS.h3, fontWeight: 700, color: T.text, lineHeight: 1.3, textTransform: 'capitalize' }}>
              {new Date(sel+'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              {selDetail.isToday && <Badge color={T.brand} bg={T.brandLight}>OGGI</Badge>}
              {selDetail.isFuture && <Badge color={T.textSoft} bg={T.bgSubtle}>IN ARRIVO</Badge>}
              {selDetail.isChiuso && <Badge color={T.textMid} bg={T.bgSubtle}>CHIUSO</Badge>}
              {selDetail.isAnomalia && (
                <Badge color={T.amber} bg={T.amberLight}><Icon name="warning" size={12} /> ANOMALIA</Badge>
              )}
            </div>
          </div>
          <button aria-label="Chiudi dettaglio" onClick={()=>setSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSoft, padding: 4, lineHeight: 1, display: 'inline-flex' }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Produzione / cassa. Su un giorno chiuso non ha senso chiederle. */}
        {!selDetail.isChiuso && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {[
              { icon: 'package', label: 'Produzione', has: selDetail.haProd,
                view: isMetodoInventario ? 'inventario-gusti' : 'giornaliero',
                sub: (!isMetodoInventario && selDetail.prodD)
                  ? `${selDetail.prodD.prodotti?.length || 0} prodotti · ${eur0(selDetail.prodD.ricavoTot || 0)} stim.`
                  : (selDetail.haProd ? 'registrata nel foglio produzione' : null) },
              // La cassa compare solo se l'azienda la usa, oppure se quel
              // giorno ce l'ha comunque: non si insegue chi tiene la cassa
              // altrove con un riquadro rosso tutti i giorni.
              ...((cassaRichiesta || selDetail.haCassa) ? [{
                icon: 'receipt', label: 'Cassa', has: selDetail.haCassa, view: 'chiusura',
                sub: selDetail.cassaD?.kpi?.totV != null
                  ? `${eur2(selDetail.cassaD.kpi.totV)} incasso${selDetail.cassaD.kpi.totMP != null ? ` · margine ${(Number(selDetail.cassaD.kpi.totMP)||0).toFixed(1)}%` : ''}`
                  : null }] : []),
            ].map(({ icon, label, has, sub, view: v }) => {
              const accent = has ? T.green : selDetail.isFuture ? T.textSoft : T.brand
              const bg     = has ? T.greenLight : selDetail.isFuture ? T.bgSubtle : T.redLight
              const bd     = has ? T.green+'33' : selDetail.isFuture ? T.border : T.red+'33'
              return (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px',
                  borderRadius: 12, background: bg, border: `1px solid ${bd}`,
                }}>
                  <span style={{ display: 'inline-flex', lineHeight: 1 }}><Icon name={icon} size={18} color={accent} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.body, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, color: accent }}>
                      {has ? <Icon name="checkCircle" size={14} /> : selDetail.isFuture ? <Icon name="clock" size={14} /> : <Icon name="xCircle" size={14} />} {label}
                    </div>
                    {sub && <div style={{ fontSize: FS.small, color: T.textMid, marginTop: 3, ...tnum }}>{sub}</div>}
                    {!sub && !has && !selDetail.isFuture && <div style={{ fontSize: FS.small, color: T.textSoft, marginTop: 3 }}>Non registrata</div>}
                  </div>
                  {!has && !selDetail.isFuture && setView && (
                    <button onClick={()=>setView(v)} style={{
                      fontSize: FS.small, fontWeight: 700, color: T.brand, background: T.bgCard,
                      border: `1px solid ${T.brand}`, borderRadius: 8, padding: '7px 11px',
                      minHeight: 36, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>Vai</button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Chiusura straordinaria: solo su giorni non futuri e solo per il titolare. */}
        {!isDipendente && !selDetail.isFuture && !noteErr && (
          <button
            onClick={() => scriviGiorno({ chiuso: !(note[sel]?.chiuso) })}
            disabled={savingNota}
            style={{
              width: '100%', marginBottom: 14, padding: '9px 12px', minHeight: 40,
              borderRadius: 10, cursor: 'pointer', fontSize: FS.small, fontWeight: 700,
              border: `1px solid ${T.border}`, background: T.bgSubtle, color: T.textMid,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
            <Icon name={note[sel]?.chiuso ? 'checkCircle' : 'clock'} size={14} />
            {note[sel]?.chiuso ? 'Eravamo aperti, riapri il giorno' : 'Eravamo chiusi questo giorno'}
          </button>
        )}

        {/* Nota */}
        <div>
          <div style={{ fontSize: FS.small, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name="edit" size={13} /> Nota del giorno
          </div>
          {noteErr ? (
            <div style={{ fontSize: FS.small, color: T.textMid, background: T.bgSubtle, borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>
              Le note non sono disponibili in questo momento. Riprova più tardi.
            </div>
          ) : (
            <>
              <textarea
                value={notaEdit}
                onChange={e => setNotaEdit(e.target.value)}
                placeholder="Aggiungi una nota…"
                rows={3}
                aria-label="Nota del giorno"
                style={{
                  width: '100%', padding: '9px 11px', border: `1px solid ${T.border}`,
                  borderRadius: 10, fontSize: isMobile || isTablet ? FS_INPUT_IOS : FS.body, resize: 'vertical', fontFamily: 'inherit',
                  color: T.text, background: T.bgSubtle, boxSizing: 'border-box', lineHeight: 1.5,
                }}
              />
              <button
                onClick={() => scriviGiorno({ nota: notaEdit })}
                disabled={savingNota || notaEdit === (note[sel]?.nota || '')}
                style={{
                  marginTop: 8, width: '100%', padding: '10px 0', minHeight: 40,
                  background: T.brand, color: '#FFF', border: 'none', borderRadius: 10,
                  fontSize: FS.body, fontWeight: 700, cursor: 'pointer',
                  opacity: (savingNota || notaEdit===(note[sel]?.nota || '')) ? 0.45 : 1,
                  transition: `opacity ${M.durBase} ${M.ease}`,
                }}>
                {savingNota ? 'Salvo…' : 'Salva nota'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

      {/* ── ① BANDA DIAGNOSI (solo titolare) ──────────────────────────────── */}
      {!isDipendente && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)',
          gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 18,
        }}>
          <Kpi icon="checkCircle" label={`Giorni completi · ${MESI[mese]}`}
            value={`${diag.completi}/${diag.totPassati}`} color={T.text}
            sub={diag.totPassati > 0
              ? `produzione + cassa${diag.chiusi ? ` · ${diag.chiusi} gg di chiusura esclusi` : ''}`
              : 'nessun giorno da registrare'} />
          <Kpi icon="barChart" label="Copertura mese" value={`${diag.pct}%`} color={semaforo}
            sub={diag.pct >= 80 ? 'sotto controllo' : diag.pct >= 50 ? 'da migliorare' : 'molti giorni scoperti'}
            bar={diag.pct} barColor={semaforo} />
          <Kpi icon="warning" label="Giorni con anomalie"
            value={String(diag.anomalie)} color={diag.anomalie ? T.amber : T.green}
            sub={diag.anomalie
              ? `${diag.soloProd} senza cassa · ${diag.soloCassa} senza prod.`
              : 'nessuna anomalia'} />
          <Kpi icon="trendUp" label="Giorni di fila"
            value={String(diag.streak)} highlight
            sub={diag.streak >= 1 ? 'completi consecutivi' : 'chiudi oggi per ripartire'} />
        </div>
      )}

      <div style={{ display: isMobile ? 'block' : 'flex', gap: isTablet ? 14 : 24, alignItems: 'flex-start', flexDirection: isTablet ? 'column' : 'row' }}>

        {/* ── ② GRIGLIA CALENDARIO ───────────────────────────────────────── */}
        <div style={{
          flex: 1, minWidth: 0,
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
          boxShadow: SHADOW_PREMIUM, padding: isMobile ? 14 : 18,
        }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 11, background: T.brandLight, color: T.brand, flexShrink: 0 }}>
                <Icon name="calendar" size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: FS.h3, fontWeight: 700, color: T.text, letterSpacing: '-0.015em' }}>{MESI[mese]} <span style={{ ...tnum }}>{anno}</span></div>
                <div style={{ fontSize: FS.small, color: T.textSoft, ...tnum }}>
                  {diag.incasso > 0 ? `${eur0(diag.incasso)} incassati nel mese` : 'registra produzione e cassa ogni giorno'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!isMeseCorrente && (
                <button onClick={goOggi} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: isMobile ? '8px 12px' : '6px 11px', minHeight: isMobile ? 40 : isTablet ? 44 : 34,
                  borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard,
                  fontSize: FS.small, fontWeight: 600, color: T.textMid, cursor: 'pointer', boxShadow: S.sm,
                }}>
                  <Icon name="clock" size={13} />Oggi
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 3 }}>
                <button onClick={prev} style={{ ...NAV_BTN, width: isMobile ? 40 : isTablet ? 44 : 34, height: isMobile ? 40 : isTablet ? 44 : 34 }} aria-label="Mese precedente">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button onClick={next} style={{ ...NAV_BTN, width: isMobile ? 40 : isTablet ? 44 : 34, height: isMobile ? 40 : isTablet ? 44 : 34 }} aria-label="Mese successivo">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Giorni di chiusura ricorrenti. Sta qui e non nelle impostazioni
              perché è qui che ci si accorge del problema: guardando i lunedì
              tutti rossi. */}
          {!isDipendente && (
            <div style={{ marginBottom: 14 }}>
              <button
                onClick={() => setApriChiusure(v => !v)}
                aria-expanded={apriChiusure}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36,
                  padding: '7px 11px', borderRadius: R.md, cursor: 'pointer',
                  border: `1px solid ${T.border}`, background: T.bgSubtle,
                  fontSize: FS.small, fontWeight: 600, color: T.textMid,
                }}>
                <Icon name="calendar" size={13} />
                {giorniChiusura.length > 0
                  ? `Chiuso il ${giorniChiusura.slice().sort((a,b)=>a-b).map(n => GIORNI[n-1]).join(', ')}`
                  : 'Imposta i giorni di chiusura'}
              </button>
              {apriChiusure && (
                <div style={{ marginTop: 9, padding: '12px 13px', background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                  <div style={{ fontSize: FS.small, color: T.textMid, marginBottom: 9, lineHeight: 1.5 }}>
                    Nei giorni di chiusura non ti verrà chiesto di registrare nulla, e non peseranno sulla copertura del mese.
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {GIORNI.map((g, i) => {
                      const iso = i + 1
                      const attivo = giorniChiusura.includes(iso)
                      return (
                        <button key={g} disabled={savingChiusure}
                          aria-pressed={attivo}
                          onClick={() => salvaGiorniChiusura(
                            attivo ? giorniChiusura.filter(n => n !== iso) : [...giorniChiusura, iso]
                          )}
                          style={{
                            minWidth: 52, minHeight: 40, padding: '8px 10px', borderRadius: 10,
                            cursor: 'pointer', fontSize: FS.small, fontWeight: 700,
                            border: `1px solid ${attivo ? T.brand : T.border}`,
                            background: attivo ? T.brandLight : T.bgCard,
                            color: attivo ? T.brand : T.textMid,
                          }}>
                          {g}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {isMobile ? (
            /* ── Lista mobile: tutti i giorni del mese selezionato ──
                Dettaglio inserito INLINE subito sotto la card cliccata. */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {mobileList.map(k => {
                const status  = getStatus(k, true)
                const isOggi  = k === oggiStr
                const isSel   = k === sel
                const cassa   = cassaMap[k]
                const totale  = cassa?.kpi?.totV
                const hasNota = !!note[k]?.nota
                const st      = STATUS[status]
                const d = new Date(k+'T12:00')
                return (
                  <React.Fragment key={k}>
                    <button onClick={() => handleDay(k)}
                      aria-label={etichettaGiorno(k)}
                      aria-pressed={isSel}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                        borderRadius: 12, minHeight: 48, width: '100%', textAlign: 'left',
                        background: isSel ? T.brandLight : status === 'chiuso' ? T.bgSubtle : T.bgCard,
                        border: isOggi || isSel ? `2px solid ${T.brand}` : `1px solid ${T.border}`,
                        cursor: 'pointer', boxSizing: 'border-box', font: 'inherit',
                      }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: st?.color || T.borderStr, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: FS.body, fontWeight: isOggi ? 800 : 600, color: isOggi ? T.brand : T.text }}>
                          {d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {isOggi && <span style={{ marginLeft: 6, fontSize: FS.small, fontWeight: 800, color: T.brand }}>· oggi</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                          {status === 'chiuso'
                            ? <Pill bg={T.bgSubtle} color={T.textMid}>Chiuso</Pill>
                            : status === 'futuro'
                              ? <Pill bg={T.bgSubtle} color={T.textSoft}>In arrivo</Pill>
                              : <>
                                  <Pill bg={haProduzione(k) ? T.greenLight : T.bgSubtle} color={haProduzione(k) ? T.green : T.textSoft}>
                                    <Icon name="package" size={12} /> {haProduzione(k) ? 'Prod.' : 'No prod.'}
                                  </Pill>
                                  <Pill bg={cassa ? T.blueLight : T.bgSubtle} color={cassa ? T.blue : T.textSoft}>
                                    <Icon name="receipt" size={12} /> {cassa ? 'Cassa' : 'No cassa'}
                                  </Pill>
                                </>}
                          {hasNota && <Pill bg={T.amberLight} color={T.amber}><Icon name="edit" size={12} /> Nota</Pill>}
                        </div>
                      </div>
                      {totale != null && (
                        <div style={{ fontSize: FS.body, color: T.textMid, fontWeight: 700, flexShrink: 0, ...tnum }}>{eur0(totale)}</div>
                      )}
                    </button>
                    {isSel && renderDetail(true)}
                  </React.Fragment>
                )
              })}
            </div>
          ) : (
            <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
              {GIORNI.map(g => (
                <div key={g} style={{
                  textAlign: 'center', fontSize: FS.small, fontWeight: 700, padding: '4px 0',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: (g==='Sab'||g==='Dom') ? T.brand : T.textSoft,
                }}>
                  {g}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {grid.map(({ date, cur }, idx) => {
                const k = toISO(date)
                const status   = getStatus(k, cur)
                const isOggi   = k === oggiStr
                const isWeek   = date.getDay()===0 || date.getDay()===6
                const isSel    = k === sel
                const cassa    = cassaMap[k]
                const totale   = cassa?.kpi?.totV
                const hasNota  = !!note[k]?.nota
                const st       = status && status !== 'futuro' ? STATUS[status] : null
                const accent   = st?.color || null

                if (!cur) {
                  return <div key={idx} style={{ borderRadius: 12, minHeight: 78, background: T.bgSubtle, opacity: 0.4 }} />
                }
                return (
                  <button key={idx} onClick={() => handleDay(k)}
                    aria-label={etichettaGiorno(k)}
                    aria-pressed={isSel}
                    title={etichettaGiorno(k)}
                    style={{
                      borderRadius: 12, padding: '8px 7px', minHeight: 78,
                      textAlign: 'left', font: 'inherit', width: '100%',
                      background: isSel ? T.brandLight : status === 'chiuso' ? T.bgSubtle : isWeek ? T.bgSubtle : T.bgCard,
                      border: isOggi || isSel ? `2px solid ${T.brand}` : `1px solid ${T.border}`,
                      borderLeft: accent && !isOggi && !isSel ? `3px solid ${accent}` : undefined,
                      cursor: 'pointer',
                      transition: `background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}`,
                      position: 'relative', boxSizing: 'border-box',
                      display: 'flex', flexDirection: 'column',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: FS.body, fontWeight: isOggi ? 800 : 600, color: isOggi ? T.brand : T.text, ...tnum }}>
                        {date.getDate()}
                      </span>
                      {accent && (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0,
                          boxShadow: status==='completo' ? `0 0 5px ${T.green}88` : 'none',
                        }} />
                      )}
                    </div>
                    {/* Lo stato in parole: il colore da solo non basta. */}
                    {st && (
                      <div style={{ fontSize: FS.small, fontWeight: 600, color: accent, marginTop: 3, lineHeight: 1.2 }}>
                        {st.breve}
                      </div>
                    )}
                    {status === 'futuro' && (
                      <div style={{ fontSize: FS.small, color: T.textSoft, marginTop: 3, lineHeight: 1.2 }}>·</div>
                    )}
                    {hasNota && (
                      <div style={{ marginTop: 3, display: 'inline-flex', color: T.amber }}>
                        <Icon name="edit" size={12} />
                      </div>
                    )}
                    {totale != null && (
                      <div style={{ fontSize: FS.small, color: T.textMid, fontWeight: 700, marginTop: 'auto', ...tnum }}>
                        {eur0(totale)}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            </>
          )}

          {/* Legenda */}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
            {['completo','parziale','vuoto','chiuso'].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: FS.small, color: T.textMid }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS[s].color }} />
                <span><strong style={{ fontWeight: 700 }}>{STATUS[s].breve}</strong> {STATUS[s].label.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ③ DETTAGLIO GIORNO (desktop a fianco; su mobile è già inline) ── */}
        {!isMobile && renderDetail(false)}

      </div>

      <style>{`@keyframes fos_calSlideIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}

function Badge({ color, bg, children }) {
  return (
    <span style={{
      fontSize: FS.small, fontWeight: 800, color, background: bg, borderRadius: 6,
      padding: '3px 7px', letterSpacing: '0.03em',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>{children}</span>
  )
}

// KPI compatto della banda diagnosi - coerente con il KPI premium di _shared.
function Kpi({ icon, label, value, sub, color, highlight, bar, barColor }) {
  const accent = color || T.brand
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: highlight ? T.brandGradient : T.bgCard,
      border: `1px solid ${highlight ? T.brandDarker : T.border}`, borderRadius: 16,
      padding: '16px 18px',
      boxShadow: highlight ? '0 14px 34px rgba(110,14,26,0.30), inset 0 1px 0 rgba(255,255,255,0.18)' : SHADOW_PREMIUM,
    }}>
      <div style={{ position: 'absolute', top: -28, right: -28, width: 84, height: 84, borderRadius: '50%',
        background: highlight ? 'rgba(255,255,255,0.07)' : `${accent}14`, opacity: 0.6, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', marginBottom: 11 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 11,
          background: highlight ? 'rgba(255,255,255,0.14)' : 'rgba(110,14,26,0.10)', color: highlight ? '#fff' : accent }}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div style={{ position: 'relative', fontSize: FS.small, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
        color: highlight ? 'rgba(255,255,255,0.76)' : T.textSoft, marginBottom: 6, lineHeight: 1.3,
        minHeight: 30 }}>{label}</div>
      <div style={{ position: 'relative', fontSize: FS.h1, fontWeight: 800, color: highlight ? T.textOnDark : accent,
        letterSpacing: '-0.03em', lineHeight: 1.05, minHeight: 30, ...tnum }}>
        {value}
      </div>
      {bar != null && (
        <div style={{ position: 'relative', height: 5, borderRadius: 3, background: highlight ? 'rgba(255,255,255,0.2)' : T.bgSubtle, marginTop: 9, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, bar))}%`, background: barColor || accent, borderRadius: 3, transition: `width ${M.durSlow} ${M.ease}` }} />
        </div>
      )}
      {sub
        ? <div style={{ position: 'relative', fontSize: FS.small, color: highlight ? 'rgba(255,255,255,0.7)' : T.textSoft, marginTop: 7, fontWeight: 500, minHeight: 34, lineHeight: 1.4 }}>{sub}</div>
        : <div style={{ minHeight: 34, marginTop: 7 }}/>
      }
    </div>
  )
}

function Pill({ bg, color, children }) {
  return (
    <span style={{ fontSize: FS.small, padding: '3px 7px', background: bg, color, borderRadius: 6, fontWeight: 700, lineHeight: 1.4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {children}
    </span>
  )
}

const NAV_BTN = {
  width: 34, height: 34, borderRadius: R.md, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: T.textMid,
  transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`,
}
