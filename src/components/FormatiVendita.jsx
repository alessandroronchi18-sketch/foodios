// FormatiVendita - configurazione dei "formati di vendita" generici.
// Ridisegnata col metodo Food Cost: DIAGNOSI (banda KPI) → CAPISCI (lista premium
// dei formati con breakdown del costo confezionamento) → AGISCI (form chiaro).
//
// Permette al titolare di definire come interpretare le righe di scontrino che
// non specificano il gusto/ripieno (es. "Cono piccolo", "Vaschetta 500g",
// "Panino"). Ogni formato è collegato a una CATEGORIA di ricette e a una
// quantità di base + materiali consumabili, da cui ChiusuraView stima food cost e
// riconcilia produzione e cassa. Vedi src/lib/formatiVendita.js.

import React, { useEffect, useMemo, useState } from 'react'
import { color as T, radius as R, shadow as S, typo, ui3, ui, font } from '../lib/theme'
import { sload, ssave } from '../lib/storage'
import { SK_FORMATI, SK_MATERIALI } from '../lib/storageKeys'
import { buildIngCosti, isRicettaValida, getR } from '../lib/foodcost'
import {
  nuovoFormato, avgFCperGCategoria, dettaglioFCperGCategoria, fcStimatoFormato,
  componentiNormalizzati, costoComponentiUnita, ricetteSenzaCategoria,
  componentiConOrigine, materialiRisolti, chiaveMateriale,
} from '../lib/formatiVendita'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { lessico } from '../lib/lessico'
import { KPI, fmt as fmtEuro, PageHeader, SH, CampoConElenco } from '../views/_shared'
import Icon from './Icon'
import PrezziPerSedeModal from './PrezziPerSedeModal'
import { fmtp0 } from '../lib/formatIt'

// Nessun testo sotto i 12px. Qui ce n'erano nove, due dei quali a 9 e 9,5:
// etichette in maiuscolo con letter-spacing, che sono la cosa più faticosa da
// leggere in assoluto. La pagina la usa un proprietario di sessant'anni, e i
// numeri qui dentro sono i millesimi di euro del confezionamento.
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'
const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

// Formattazione monetaria a 3 decimali (i costi di confezionamento sono centesimi
// di euro: cono cialda 0,06 €, fazzoletto 0,01 € → servono i millesimi). Separatore IT.
const fmt3 = n => `${(Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 3, maximumFractionDigits: 3 })} €`

// fontSize 16 su mobile per evitare zoom automatico iOS (regola permanente CLAUDE.md).
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: R.md, border: `1px solid ${T.borderStr}`, fontSize: font.size.lg, color: T.text, boxSizing: 'border-box', fontFamily: 'inherit', background: T.bgCard }
const labelStyle = { fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }
const cardStyle = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: SHADOW_PREMIUM }

export default function FormatiVendita({ orgId, ricettario, onSaveRicettario, notify, tipoAttivita, sedi = [] }) {
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  // 18/09/2026 — «isMobile ? grande : piccolo» lascia fuori il tablet, che si
  // tocca col dito esattamente come un telefono. È la seconda volta che
  // succede: il 15/09 la stessa forma aveva lasciato 95 campi sotto la misura
  // anti-zoom su iPad. Qui la domanda si fa una volta e si chiama col suo
  // nome, così non si può più rispondere per metà.
  const dito = isMobile || isTablet
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const [formati, setFormati] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // formato in editing, o null
  // Quale delle due spiegazioni è aperta: 'serve' | 'materiali' | null.
  // Una per volta: aperte insieme tornerebbero le nove righe di prima.
  const [aiuto, setAiuto] = useState(null)
  // I materiali di confezionamento dell'azienda: [{ nome, costo, unita }]
  const [materiali, setMateriali] = useState([])
  const [pannelloMateriali, setPannelloMateriali] = useState(false)
  const [nuovoMat, setNuovoMat] = useState({ nome: '', costo: '' })
  // Quale materiale ha aperto il collegamento al magazzino (indice, o null).
  const [matCollega, setMatCollega] = useState(null)
  const [expanded, setExpanded] = useState(null) // id formato col breakdown aperto
  const [prezziSedeTarget, setPrezziSedeTarget] = useState(null) // formato per cui aprire modal "Prezzi per sede"
  const [assegnando, setAssegnando] = useState(false)
  const hasMultiSede = Array.isArray(sedi) && sedi.filter(s => s?.attiva !== false).length > 1

  // Categorie disponibili dalle ricette (per il dropdown).
  const categorie = useMemo(() => {
    const set = new Set()
    for (const r of Object.values(ricettario?.ricette || {})) {
      if (!isRicettaValida(r.nome)) continue
      const tipo = getR(r.nome, r).tipo
      if (tipo === 'semilavorato' || tipo === 'interno') continue
      const c = String(r.categoria || '').trim()
      if (c) set.add(c)
    }
    return [...set].sort()
  }, [ricettario])

  useEffect(() => {
    let alive = true
    if (!orgId) { setLoading(false); return }
    Promise.all([
      sload(SK_FORMATI, orgId, null),
      sload(SK_MATERIALI, orgId, null),
    ]).then(([f, m]) => {
      if (!alive) return
      setFormati(Array.isArray(f) ? f : [])
      setMateriali(Array.isArray(m) ? m : [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [orgId])

  // ── I materiali di confezionamento si scrivono una volta sola ──────────
  //
  // 18/09/2026, il titolare: «c'è margine di errore se l'utente scrive
  // coppettp o fazzolettp. e poi i costi per singola coppetta o singolo
  // fazzoletto sono molto bassi. possiamo invertire il calcolo: l'utente in
  // quella pagina inserisce tutti i prodotti che usa legati alla vendita —
  // cucchiaini, fazzoletti, coppette — e spiega quanto spende per ognuno. una
  // volta salvati, quando clicca nuovo formato e fa "aggiungi materiale"
  // compare l'elenco fisso. se un prodotto non viene aggiunto prima, non
  // compare nell'elenco».
  //
  // Prima ogni formato portava i suoi materiali scritti a mano, nome e prezzo.
  // Due guai, tutt'e due silenziosi: «coppettp» diventava un materiale nuovo
  // che nessuno notava, e il costo — tre o quattro millesimi di euro — andava
  // ribattuto a ogni formato, con uno zero in più o in meno che non si vede.
  // Scrivendolo una volta sola, correggerlo lo corregge dappertutto.
  //
  // L'elenco da cui si sceglie comprende anche i materiali che stanno già
  // dentro i formati salvati: chi ha compilato prima di oggi non si trova il
  // suo lavoro fuori elenco.
  // ── Il prezzo risolto, una volta sola per tutta la pagina ─────────────
  //
  // Un materiale può portare il suo prezzo scritto a mano, oppure essere
  // legato a una materia prima: in quel caso il prezzo lo fa l'ultima bolla e
  // non lo riscrive più nessuno. Da qui in giù la pagina usa SEMPRE questo
  // elenco, mai `materiali` grezzo — se no il costo di un cono dipende da
  // quale riga di codice lo sta guardando.
  const materialiVivi = useMemo(() => materialiRisolti(materiali, ingCosti), [materiali, ingCosti])

  const nomiMateriali = useMemo(() => {
    const s = new Map()
    for (const m of materiali) {
      const n = String(m?.nome || '').trim()
      if (n) s.set(chiaveMateriale(n), n)
    }
    for (const f of formati) {
      for (const c of (f?.componenti || [])) {
        const n = String(c?.nome || '').trim()
        if (n && !s.has(chiaveMateriale(n))) s.set(chiaveMateriale(n), n)
      }
    }
    return [...s.values()].sort((a, b) => a.localeCompare(b, 'it'))
  }, [materiali, formati])

  const materialeDetto = (nome) => {
    const k = chiaveMateriale(nome)
    return k ? materialiVivi.find(x => chiaveMateriale(x.nome) === k) || null : null
  }

  const costoDiMateriale = (nome) => {
    const m = materialeDetto(nome)
    return m && Number.isFinite(Number(m.costo)) ? Number(m.costo) : null
  }

  // I materiali che si possono collegare al magazzino: le materie prime che
  // hanno un prezzo dichiarato, non le stime.
  const nomiMateriePrime = useMemo(() => Object.keys(ricettario?.ingredienti_costi || {})
    .filter(Boolean).sort((a, b) => a.localeCompare(b, 'it')), [ricettario])

  const persistMateriali = async (arr) => {
    try {
      await ssave(SK_MATERIALI, arr, orgId, null)
    } catch (e) {
      notify?.('Errore salvataggio materiali: ' + (e.message || 'rete'), false)
      return false
    }
    setMateriali(arr)
    return true
  }

  const persist = async (arr) => {
    // SAVE FIRST per evitare data-loss.
    try {
      await ssave(SK_FORMATI, arr, orgId, null)
    } catch (e) {
      notify?.('Errore salvataggio formati: ' + (e.message || 'rete'), false)
      return
    }
    setFormati(arr)
  }

  const salva = async () => {
    if (!form.nome.trim()) { notify?.('Dai un nome al formato (es. "Cono piccolo")', false); return }
    if (!form.categoria.trim()) { notify?.('Scegli la categoria di ricette collegata', false); return }
    // Il costo che finisce nel formato è quello dell'elenco, quando l'elenco
    // ce l'ha. Resta scritto anche lì — è una copia di servizio, la legge chi
    // guarda un formato senza avere l'elenco sotto mano — ma non è più la
    // fonte: se i due numeri litigano, vince l'elenco.
    const componenti = (Array.isArray(form.componenti) ? form.componenti : [])
      .map(c => {
        const nome = String(c?.nome || '').trim()
        const dallElenco = costoDiMateriale(nome)
        return {
          nome,
          qta: Number(c?.qta) || 0,
          costo: dallElenco != null ? dallElenco : Number(c?.costo) || 0,
        }
      })
      .filter(c => c.nome && c.qta > 0)
    const pulito = {
      id: form.id,
      nome: form.nome.trim(),
      categoria: form.categoria.trim(),
      alias: (Array.isArray(form.alias) ? form.alias : String(form.alias || '').split(','))
        .map(a => a.trim()).filter(Boolean),
      baseQtaG: Number(form.baseQtaG) || 0,
      componenti,
      prezzoDefault: Number(form.prezzoDefault) || 0,
    }
    const idx = formati.findIndex(f => f.id === pulito.id)
    const arr = idx >= 0 ? formati.map(f => f.id === pulito.id ? pulito : f) : [...formati, pulito]
    await persist(arr)
    setForm(null)
    notify?.(`Formato "${pulito.nome}" salvato`)
  }

  // Quando si apre il form (nuovo o modifica), normalizza i componenti (anche da
  // formato legacy con solo costoContenitore).
  const apriEditor = (base) => {
    setForm({ ...base, componenti: componentiNormalizzati(base) })
  }

  // Assegna una categoria a TUTTE le ricette che non ne hanno.
  //
  // Serve perché senza categoria una ricetta non entra in nessuna stima di
  // food cost dei formati: sui dati del design partner sono 25 su 27, quindi
  // il food cost di tutti i coni e le vaschette si reggeva su due ricette.
  // Farlo a mano vuol dire aprire venticinque schede.
  const assegnaCategoriaATutte = async (categoria) => {
    if (assegnando || !categoria?.trim()) return
    if (typeof onSaveRicettario !== 'function') {
      notify?.('Non posso salvare le ricette da questa pagina', false)
      return
    }
    setAssegnando(true)
    const ricette = { ...(ricettario?.ricette || {}) }
    let n = 0
    for (const r of senzaCategoria) {
      const chiave = Object.keys(ricette).find(k => ricette[k]?.nome === r.nome)
      if (!chiave) continue
      ricette[chiave] = { ...ricette[chiave], categoria: categoria.trim() }
      n++
    }
    try {
      // SAVE FIRST: se il salvataggio non riesce non si dice che è fatto.
      await onSaveRicettario({ ...(ricettario || {}), ricette }, {}, true)
      notify?.(`${n === 1 ? 'Una ricetta è entrata' : `${n} ricette sono entrate`} nella categoria "${categoria.trim()}": ora contano nel food cost dei formati.`)
    } catch (e) {
      notify?.('Non ho potuto salvare: ' + (e?.message || 'rete'), false)
    } finally {
      setAssegnando(false)
    }
  }

  const elimina = async (id) => {
    await persist(formati.filter(f => f.id !== id))
    notify?.('Formato eliminato')
  }

  // Ricette che non entreranno in nessuna stima perché non hanno una categoria
  // scritta. Sul design partner sono 25 su 27, e senza dirlo il proprietario
  // non ha modo di capire perché le stime dei formati sono fragili.
  const senzaCategoria = useMemo(() => ricetteSenzaCategoria(ricettario), [ricettario])
  const nRicetteTotali = useMemo(() => {
    let n = 0
    for (const r of Object.values(ricettario?.ricette || {})) {
      if (!isRicettaValida(r.nome)) continue
      const tipo = getR(r.nome, r).tipo
      if (tipo === 'semilavorato' || tipo === 'interno') continue
      n++
    }
    return n
  }, [ricettario])

  // ── Righe arricchite: costo materiali, FC categoria, FC stimato/unità, margine ─
  const rows = useMemo(() => formati.map(f => {
    const det = dettaglioFCperGCategoria(f.categoria, ricettario, ingCosti)
    const avg = det.valore
    const componenti = componentiConOrigine(f, materialiVivi)
    const costoMateriali = costoComponentiUnita(f, materialiVivi)
    const fcBase = (Number(f.baseQtaG) || 0) * (avg || 0)
    const fcUnit = fcStimatoFormato(f, avg || 0, materialiVivi)
    const prezzo = Number(f.prezzoDefault) || 0
    // Il margine si calcola solo se il food cost si SA.
    //
    // Qui c'era `fcUnit >= 0`, e con `fcUnit` a zero — cioè con la categoria
    // senza nessun gusto pesato, che è il caso vero del design partner —
    // usciva `(1 - 0 / prezzo) * 100`, cioè **margine 100%** su un formato di
    // cui non si sa quanto costa. È il difetto archetipico di questo prodotto,
    // quello scritto in CLAUDE.md: il dato che manca diventa una buona
    // notizia. E l'anteprima nell'editor, due schermate più in là, usava già
    // la condizione giusta: la stessa pagina diceva due cose diverse dello
    // stesso formato.
    const fcNoto = avg != null && fcUnit > 0
    const margPct = prezzo > 0 && fcNoto ? (1 - fcUnit / prezzo) * 100 : null
    return { f, avg, componenti, costoMateriali, fcBase, fcUnit, prezzo, margPct, fcKnown: avg != null, nUsate: det.nUsate }
  }), [formati, ricettario, ingCosti, materialiVivi])

  // ── Diagnosi (banda KPI) ──────────────────────────────────────────────────────
  const diag = useMemo(() => {
    const n = rows.length
    const conMateriali = rows.filter(r => r.costoMateriali > 0)
    // La media si fa sui formati che HANNO dei materiali, non su tutti: con
    // quattro formati configurati e uno solo compilato, dividere per quattro
    // dà un numero che non è il costo di nessuno.
    const costoMedioMat = conMateriali.length > 0
      ? conMateriali.reduce((s, r) => s + r.costoMateriali, 0) / conMateriali.length
      : 0
    // "Più costoso" solo se c'è davvero un costo.
    //
    // Prima il reduce partiva da null e prendeva il primo elemento come
    // migliore: con tutti i materiali a zero — che è il caso reale del design
    // partner, 5 formati su 5 senza materiali — la tessera diceva "formato più
    // costoso: 0,000 €" e sotto il nome del PRIMO formato dell'elenco. Un nome
    // scelto dall'ordinamento presentato come un dato.
    const piuCostoso = conMateriali.reduce(
      (best, r) => !best || r.costoMateriali > best.costoMateriali ? r : best, null)
    const senzaCategoria = rows.filter(r => !r.fcKnown).length
    const senzaMateriali = n - conMateriali.length
    return { n, costoMedioMat, piuCostoso, senzaCategoria, senzaMateriali, nConMateriali: conMateriali.length }
  }, [rows])

  if (loading) return <div style={{ padding: 24, color: T.textSoft, fontSize: font.size.base }}>Caricamento…</div>

  // Anteprima FC per il formato in editing.
  const previewFC = (() => {
    if (!form || !form.categoria) return null
    const avg = avgFCperGCategoria(form.categoria, ricettario, ingCosti)
    const fcUnit = fcStimatoFormato(form, avg || 0, materialiVivi)
    const fcComponenti = costoComponentiUnita(form, materialiVivi)
    const baseG = Number(form.baseQtaG) || 0
    const prezzo = Number(form.prezzoDefault) || 0
    // Stessa condizione dell'elenco, parola per parola: due schermate della
    // stessa pagina non possono rispondere in modo diverso sullo stesso
    // formato.
    const margPct = prezzo > 0 && avg != null && fcUnit > 0 ? (1 - fcUnit / prezzo) * 100 : null
    return { avg, fcUnit, fcComponenti, baseG, prezzo, margPct }
  })()

  const isEditing = !!form && formati.some(f => f.id === form.id)

  const nuovoBtn = !form && (
    <button onClick={() => apriEditor(nuovoFormato())}
      style={{ padding: '10px 16px', minHeight: dito ? 44 : 38, borderRadius: R.md, border: 'none', background: T.brand, color: T.textOnDark,
        fontSize: font.size.base, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.005em',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: S.brand }}>
      <Icon name="plus" size={15} />Nuovo formato
    </button>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        subtitle="I formati senza gusto della tua cassa (vaschette, coni, scatole): quanto ti costa confezionarli e quanto incidono sul food cost."
        action={nuovoBtn}
      />

      {/* ── Le due spiegazioni lunghe stanno dietro due pulsanti ────────
          18/09/2026, richiesta del titolare: «queste scritte sono troppo
          invasive, racchiudile in due pulsanti, così se uno ha bisogno di
          sapere a cosa serve clicca e viene fuori la spiegazione, e l'altro è
          un alert idem che si deve cliccare, così la pagina viene più pulita
          ed elegante».

          Erano due riquadri pieni di testo uno sopra l'altro, prima ancora dei
          numeri: nove righe da leggere per arrivare alla pagina. Chi apre il
          Listino la seconda volta le ha già lette, e gliele si rimetteva
          davanti ogni giorno.

          Restano tutt'e due, e nessuna delle due perde una parola: quella che
          spiega a cosa serve la pagina, e l'avviso sui materiali mancanti —
          che è la cosa più importante qui dentro, perché finché mancano il
          margine che la cassa mostra è più alto del vero. L'avviso però non
          diventa muto: il pulsante resta color ambra e dice **quanti** formati
          sono scoperti, così il segnale si vede anche chiuso. È la differenza
          fra nascondere un problema e non ripeterne la spiegazione. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: aiuto ? 10 : 18 }}>
        <button type="button" onClick={() => setAiuto(a => a === 'serve' ? null : 'serve')}
          aria-expanded={aiuto === 'serve'}
          style={{ minHeight: dito ? 44 : 36, padding: '0 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${T.border}`, background: aiuto === 'serve' ? T.bgSubtle : 'transparent',
            color: T.textMid, fontSize: typo.small.fontSize, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name={aiuto === 'serve' ? 'chevDown' : 'chevR'} size={12} />A cosa serve
        </button>
        <button type="button" onClick={() => setPannelloMateriali(v => !v)}
          aria-expanded={pannelloMateriali}
          style={{ minHeight: dito ? 44 : 36, padding: '0 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${T.border}`, background: pannelloMateriali ? T.bgSubtle : 'transparent',
            color: T.textMid, fontSize: typo.small.fontSize, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="package" size={12} />I tuoi materiali
          <span style={{ color: T.textSoft, fontWeight: 600 }}>{nomiMateriali.length}</span>
        </button>
        {diag.n > 0 && diag.senzaMateriali > 0 && (
          <button type="button" onClick={() => setAiuto(a => a === 'materiali' ? null : 'materiali')}
            aria-expanded={aiuto === 'materiali'}
            style={{ minHeight: dito ? 44 : 36, padding: '0 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${T.amber}66`, background: aiuto === 'materiali' ? T.amberLight : 'transparent',
              color: T.amber, fontSize: typo.small.fontSize, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="package" size={12} />
            {diag.senzaMateriali === diag.n
              ? (diag.n === 1 ? 'Manca il confezionamento' : `Manca il confezionamento su tutti e ${diag.n}`)
              : `Manca il confezionamento su ${diag.senzaMateriali} di ${diag.n}`}
          </button>
        )}
      </div>

      {aiuto === 'serve' && (
        <div style={{ background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 18px', marginBottom: 16, fontSize: typo.small.fontSize, color: T.textMid, lineHeight: 1.6, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, marginTop: 1, color: T.textSoft }}><Icon name="receipt" size={16} /></span>
          <span>
            Se la tua cassa batte righe senza il gusto (es. <i>"Cono piccolo"</i>, <i>"Vaschetta 500g"</i>, <i>"Panino"</i>),
            qui le colleghi a una <b>categoria di ricette</b>. In chiusura cassa il ricavo viene contato per intero e il food cost stimato come
            media dei gusti di quella categoria, più i materiali di confezionamento - così cassa e produzione tornano anche senza il dettaglio del gusto.
          </span>
        </div>
      )}

      {aiuto === 'materiali' && diag.n > 0 && diag.senzaMateriali > 0 && (
        <div style={{ background: T.amberLight, border: `1px solid ${T.amber}55`, borderRadius: 10, padding: '13px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ color: T.amber, flexShrink: 0, display: 'inline-flex', marginTop: 1 }}><Icon name="package" size={16} /></span>
          <div style={{ minWidth: 0, fontSize: typo.small.fontSize, color: T.textMid, lineHeight: 1.55 }}>
            Sono il cono, la vaschetta, il coperchio, il fazzoletto: pochi centesimi l&rsquo;uno, ma li paghi su ogni pezzo che vendi. Finché mancano, il food cost stimato conta solo il gelato — quindi il margine che vedi in chiusura cassa è più alto di quello vero.
          </div>
        </div>
      )}

      {pannelloMateriali && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: isMobile ? '14px 14px' : '16px 18px', marginBottom: 18 }}>
          <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text, marginBottom: 3 }}>I materiali di confezionamento</div>
          <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, lineHeight: 1.55, marginBottom: 12 }}>
            Cono, coppetta, cucchiaino, fazzoletto, vaschetta: scrivili qui una volta sola con quanto ti costa <b>uno</b>. Poi, quando componi un formato, li scegli da questo elenco — così il nome è sempre lo stesso e il prezzo si corregge in un posto solo.
          </div>

          {materiali.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {materiali.map((m, i) => {
                const vivo = materialiVivi[i] || {}
                const legato = vivo.origine === 'magazzino'
                const apre = matCollega === i
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 96px 40px' : '2fr 130px 40px', gap: 8, alignItems: 'center' }}>
                      <input style={inputStyle} value={m.nome || ''} aria-label={`Nome del materiale ${i + 1}`}
                        onChange={e => setMateriali(arr => arr.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                        onBlur={() => persistMateriali(materiali)} />
                      {legato ? (
                        <div style={{ ...inputStyle, textAlign: 'right', ...TNUM, background: T.bgSubtle, color: vivo.costo == null ? T.red : T.textMid, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, cursor: 'help' }}
                          title={vivo.problema || `${fmt3(vivo.costo)} a pezzo: ${(Number(m.pesoG) || 0).toLocaleString('it-IT')} g di «${m.legatoA}». Lo aggiorna la bolla.`}>
                          <Icon name="package" size={11} />
                          <span>{vivo.costo == null ? '—' : fmt3(vivo.costo)}</span>
                        </div>
                      ) : (
                        <input style={{ ...inputStyle, textAlign: 'right', ...TNUM }} value={m.costo ?? ''} inputMode="decimal"
                          aria-label={`Costo di un ${m.nome || 'materiale'}`} placeholder="es. 0,060"
                          onChange={e => setMateriali(arr => arr.map((x, j) => j === i ? { ...x, costo: e.target.value.replace(',', '.') } : x))}
                          onBlur={() => persistMateriali(materiali)} />
                      )}
                      <button onClick={() => persistMateriali(materiali.filter((_, j) => j !== i))}
                        aria-label={`Togli ${m.nome || 'il materiale'}`} title="Togli"
                        style={{ width: 36, height: 36, padding: 0, background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: R.sm, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>

                    {/* Il collegamento al magazzino: scritto una volta, poi il
                        prezzo lo fanno le bolle e non lo riapre più nessuno. */}
                    <button type="button" onClick={() => setMatCollega(apre ? null : i)} aria-expanded={apre}
                      style={{ alignSelf: 'flex-start', padding: '2px 0', background: 'transparent', border: 'none', color: legato ? T.brand : T.textSoft, fontSize: typo.caption.fontSize, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Icon name={legato ? 'package' : 'truck'} size={11} />
                      {legato
                        ? `segue «${m.legatoA}» · ${(Number(m.pesoG) || 0).toLocaleString('it-IT')} g a pezzo`
                        : 'fai decidere il prezzo alle bolle'}
                    </button>

                    {apre && (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 130px auto', gap: 8, alignItems: 'end', padding: '9px 11px', background: T.bgSubtle, borderRadius: R.sm, marginBottom: 4 }}>
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 4 }}>Quale materia prima</label>
                          <CampoConElenco
                            id={`legame-${i}`}
                            valore={m.legatoA || ''}
                            onCambia={(v) => setMateriali(arr => arr.map((x, j) => j === i ? { ...x, legatoA: v } : x))}
                            voci={nomiMateriePrime}
                            placeholder="es. cialde cono"
                            ariaLabel={`Materia prima collegata a ${m.nome || 'questo materiale'}`}
                            stile={inputStyle}
                            nomeElenco="materie prime"
                            elencoFemminile
                          />
                        </div>
                        <div>
                          {/* Il prezzo del magazzino è al chilo. Per sapere
                              quanto costa UN pezzo serve quanto pesa un pezzo:
                              senza, il conto non si può fare e non si inventa. */}
                          <label style={{ ...labelStyle, marginBottom: 4 }}>Quanto pesa uno (g)</label>
                          <input style={{ ...inputStyle, textAlign: 'right', ...TNUM }} value={m.pesoG ?? ''} inputMode="decimal"
                            aria-label={`Peso di un ${m.nome || 'pezzo'} in grammi`} placeholder="es. 5"
                            onChange={e => setMateriali(arr => arr.map((x, j) => j === i ? { ...x, pesoG: e.target.value.replace(',', '.') } : x))} />
                        </div>
                        <div style={{ display: 'flex', gap: 7 }}>
                          <button type="button" onClick={async () => { if (await persistMateriali(materiali)) setMatCollega(null) }}
                            style={{ padding: '9px 14px', minHeight: 40, background: T.brand, color: T.white, border: 'none', borderRadius: R.md, fontSize: typo.small.fontSize, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                            Collega
                          </button>
                          {legato && (
                            <button type="button" onClick={async () => {
                              const arr = materiali.map((x, j) => j === i ? { ...x, legatoA: null, pesoG: null } : x)
                              if (await persistMateriali(arr)) setMatCollega(null)
                            }}
                              style={{ padding: '9px 12px', minHeight: 40, background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: typo.small.fontSize, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                              Stacca
                            </button>
                          )}
                        </div>
                        <div style={{ gridColumn: '1 / -1', fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.5 }}>
                          {vivo.problema
                            ? vivo.problema
                            : legato && vivo.costo != null
                              ? `Adesso: ${fmt3(vivo.costo)} a pezzo. Quando carichi una bolla di «${m.legatoA}», questo numero e tutti i formati che lo usano si spostano da soli.`
                              : 'Scegli la materia prima che compri col fornitore e scrivi quanto pesa un pezzo: il prezzo lo farà l’ultima bolla.'}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 96px' : '2fr 130px', gap: 8, alignItems: 'center' }}>
            <input style={inputStyle} value={nuovoMat.nome} aria-label="Nome del materiale da aggiungere"
              placeholder="es. Cono cialda piccolo"
              onChange={e => setNuovoMat(v => ({ ...v, nome: e.target.value }))} />
            <input style={{ ...inputStyle, textAlign: 'right', ...TNUM }} value={nuovoMat.costo} inputMode="decimal"
              aria-label="Costo di un pezzo in euro" placeholder="es. 0,060"
              onChange={e => setNuovoMat(v => ({ ...v, costo: e.target.value.replace(',', '.') }))} />
          </div>
          <button
            onClick={async () => {
              const nome = nuovoMat.nome.trim()
              if (!nome) { notify?.('Scrivi il nome del materiale', false); return }
              if (nomiMateriali.some(n => n.toLowerCase() === nome.toLowerCase())) {
                notify?.(`"${nome}" c'è già fra i tuoi materiali`, false); return
              }
              // Il costo può mancare: un materiale senza prezzo si dichiara
              // mancante e si vede, uno salvato a zero direbbe «gratis» e
              // sparirebbe dentro il food cost senza un fiato.
              const grezzo = String(nuovoMat.costo).trim()
              const costo = grezzo === '' ? null : Number(grezzo)
              if (grezzo !== '' && !Number.isFinite(costo)) { notify?.('Il costo dev’essere un numero, per esempio 0,060', false); return }
              if (await persistMateriali([...materiali, { nome, costo }])) {
                setNuovoMat({ nome: '', costo: '' })
                notify?.(`"${nome}" aggiunto ai materiali`)
              }
            }}
            style={{ marginTop: 8, padding: '9px 14px', minHeight: 40, background: 'transparent', color: T.textMid, border: `1px dashed ${T.borderStr}`, borderRadius: R.md, fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            <Icon name="plus" size={13} />Aggiungi ai materiali
          </button>
        </div>
      )}

      {/* ① DIAGNOSI */}
      {diag.n > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: ui3(isMobile, isTablet, ui.grid4), gap: isMobile ? 10 : 16, marginBottom: 26 }}>
          <KPI icon={<Icon name="package" size={18} />} label="Formati configurati" value={diag.n.toLocaleString('it-IT', { useGrouping: 'always' })}
            sub={diag.n === 1 ? 'formato di vendita' : 'formati di vendita'} />
          <KPI icon={<Icon name="money" size={18} />} label="Confezionamento medio"
            value={diag.nConMateriali > 0 ? fmt3(diag.costoMedioMat) : 'da compilare'}
            color={diag.nConMateriali > 0 ? undefined : T.textSoft}
            sub={diag.nConMateriali > 0
              ? (diag.senzaMateriali > 0
                  ? `su ${diag.nConMateriali} formati di ${diag.n}`
                  : 'materiali per unità')
              : 'nessun materiale inserito'} />
          <KPI icon={<Icon name="barChart" size={18} />} label="Formato più costoso"
            value={diag.piuCostoso ? fmt3(diag.piuCostoso.costoMateriali) : '—'}
            sub={diag.piuCostoso ? diag.piuCostoso.f.nome : 'servono i materiali di confezionamento'}
            color={diag.piuCostoso ? T.amber : T.textSoft} />
          <KPI icon={<Icon name="receipt" size={18} />} label="Senza food cost" value={diag.senzaCategoria.toLocaleString('it-IT', { useGrouping: 'always' })}
            color={diag.senzaCategoria ? T.amber : T.green}
            sub={diag.senzaCategoria ? 'solo materiali stimati' : 'tutti collegati'} />
        </div>
      )}

      {/* Perché le stime sono fragili. Il food cost di un cono o di una
          vaschetta non si misura: si stima sul costo al grammo dei gusti
          della sua categoria. Se le ricette non hanno una categoria scritta
          restano fuori da ogni stima — sul design partner sono 25 su 27, e
          senza dirlo il proprietario vede un numero in verde senza sapere
          che si regge sul 7% del ricettario. */}
      {!loading && senzaCategoria.length > 0 && formati.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9,
          background: T.amberLight, border: `1px solid ${T.amber}55`, borderRadius: 12,
          padding: isMobile ? 12 : '12px 16px', marginBottom: 24,
          fontSize: typo.small.fontSize, color: T.amberDark, lineHeight: 1.55,
        }}>
          <Icon name="alert" size={14} color={T.amberDark} style={{ flexShrink: 0, marginTop: 3 }} />
          <span>
            <strong>
              {senzaCategoria.length === 1
                ? 'Una ricetta non ha una categoria'
                : `${senzaCategoria.length} ricette su ${nRicetteTotali} non hanno una categoria`}
            </strong>
            {' '}e quindi non entrano nel food cost stimato dei formati qui sotto.
            {senzaCategoria.length >= 3 && <> Le prime: {senzaCategoria.slice(0, 3).map(r => r.nome).join(', ')}.</>}
            {' '}Scrivi una categoria nelle ricette (per una gelateria basta &quot;Gusto&quot;)
            e le stime si appoggeranno su tutto il ricettario invece che su una parte.
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Le categorie già in uso, più quella tipica del mestiere:
                  un clic invece di venticinque schede da aprire. */}
              {[...new Set([...(categorie || []), tipoAttivita === 'gelateria' ? 'Gusto' : 'Generale'])].slice(0, 4).map(cat => (
                <button key={cat} type="button" disabled={assegnando}
                  onClick={() => assegnaCategoriaATutte(cat)}
                  style={{
                    padding: '7px 13px', minHeight: dito ? 44 : 36, borderRadius: 9,
                    border: `1px solid ${T.amber}`, background: T.bgCard, color: T.amberDark,
                    fontSize: typo.small.fontSize, fontWeight: 700,
                    cursor: assegnando ? 'default' : 'pointer', opacity: assegnando ? 0.6 : 1,
                  }}>
                  {assegnando ? 'Salvo…' : `Mettile tutte in "${cat}"`}
                </button>
              ))}
            </div>
          </span>
        </div>
      )}

      {/* ② FORM CREAZIONE / MODIFICA */}
      {form && (
        <div style={{ ...cardStyle, padding: isMobile ? 16 : 22, marginBottom: 24 }}>
          <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.brand }}><Icon name={isEditing ? 'edit' : 'plus'} size={16} /></span>
            {isEditing ? 'Modifica formato' : 'Nuovo formato di vendita'}
          </div>
          {/* 18/09/2026: «rivedi la grandezza di tutte le box quando si clicca
              nuovo formato, falle anche più piccole, intelligenti e coerenti,
              non usando spazio inutile». Il modulo era tutto a respiro largo —
              18px sotto la spiegazione, 16 fra i campi, 18 sopra l'anteprima —
              e per arrivare al pulsante Salva si scorreva. Le misure scendono
              dove sono aria e restano dove servono a separare due cose
              diverse. */}
          <div style={{ fontSize: font.size.sm, color: T.textSoft, marginBottom: 12 }}>
            Dai un nome uguale a come appare sullo scontrino, collega la categoria di gusti e descrivi cosa serve per confezionarlo.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Nome formato (come sullo scontrino)</label>
              <input style={inputStyle} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="es. Cono piccolo" />
            </div>
            <div>
              <label style={labelStyle}>Categoria ricette collegata</label>
              <input style={inputStyle} list="categorie-list" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="es. Gelato" />
              <datalist id="categorie-list">{categorie.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
              <label style={labelStyle}>Alias / altri nomi sullo scontrino (separati da virgola)</label>
              <input style={inputStyle} value={Array.isArray(form.alias) ? form.alias.join(', ') : form.alias}
                onChange={e => setForm({ ...form, alias: e.target.value })} placeholder="es. cono p, cono 1 gusto, conetto" />
            </div>
            <div>
              <label style={labelStyle}>Base consumata per unità (grammi)</label>
              <input style={inputStyle} type="number" min="0" value={form.baseQtaG} onChange={e => setForm({ ...form, baseQtaG: e.target.value })} placeholder="es. 80" />
            </div>
            <div>
              <label style={labelStyle}>Prezzo di vendita (€, informativo)</label>
              <input style={inputStyle} type="number" min="0" step="0.01" value={form.prezzoDefault} onChange={e => setForm({ ...form, prezzoDefault: e.target.value })} placeholder="es. 2.60" />
            </div>
          </div>

          {/* Distinta materiali consumabili */}
          <div style={{ marginTop: 22 }}>
            <label style={labelStyle}>Materiali di confezionamento per unità</label>
            <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, marginBottom: 10, lineHeight: 1.5 }}>
              Tutto ciò che va con la vendita: contenitore + accessori (cono cialda, fazzoletto, palettina, coppetta, cucchiaino…). Il food cost del formato somma queste voci.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {/* Su telefono e tablet le caselle sono più larghe: a 56 e 84 px
                  il testo di aiuto ("es. 0,060") era tagliato a metà e
                  l'unità di misura non si leggeva. */}
              {(form.componenti || []).length > 0 && (
                <div style={{ ...labelStyle, display: 'grid', gridTemplateColumns: isMobile ? '1fr 74px 96px 44px' : '2fr 80px 110px 100px 40px', gap: 8, marginBottom: 0, alignItems: 'end' }}>
                  <span>Materiale</span>
                  <span style={{ textAlign: 'right' }}>Qtà</span>
                  <span style={{ textAlign: 'right' }}>€/unità</span>
                  {!isMobile && <span style={{ textAlign: 'right' }}>Costo</span>}
                  <span />
                </div>
              )}
              {(form.componenti || []).map((c, i) => {
                // Il prezzo lo dice l'elenco, quando l'elenco ce l'ha: qui la
                // casella diventa di sola lettura invece di lasciar credere
                // che si possa correggere in due posti diversi.
                const mat = materialeDetto(c.nome)
                const daElenco = mat != null && Number.isFinite(Number(mat.costo))
                const eff = daElenco ? Number(mat.costo) : (Number(c.costo) || 0)
                const subtot = (Number(c.qta) || 0) * eff
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 74px 96px 44px' : '2fr 80px 110px 100px 40px', gap: 8, alignItems: 'center' }}>
                    {/* Si sceglie, non si scrive. «coppettp» non entra più, e
                        il costo arriva dall'elenco invece di essere ribattuto
                        a mano ogni volta — erano tre millesimi di euro, quelli
                        in cui uno zero in più non si vede. */}
                    <CampoConElenco
                      id={`materiale-${i}`}
                      valore={c.nome || ''}
                      onCambia={(v) => setForm(f => ({ ...f, componenti: f.componenti.map((x, j) => {
                        if (j !== i) return x
                        const costo = costoDiMateriale(v)
                        return { ...x, nome: v, ...(costo != null ? { costo } : {}) }
                      }) }))}
                      voci={nomiMateriali}
                      placeholder="es. Cono cialda piccolo"
                      ariaLabel={`Materiale ${i + 1}`}
                      stile={inputStyle}
                      soloDallElenco
                      onCreaNuova={(nome) => { setPannelloMateriali(true); setNuovoMat({ nome, costo: '' }) }}
                      etichettaCrea="Aggiungilo ai materiali"
                      nomeElenco="materiali di confezionamento"
                    />
                    <input style={{ ...inputStyle, textAlign: 'right', ...TNUM }} type="number" min="0" step="0.01" value={c.qta ?? ''} placeholder="es. 1"
                      onChange={e => setForm(f => ({ ...f, componenti: f.componenti.map((x, j) => j === i ? { ...x, qta: e.target.value } : x) }))}/>
                    {daElenco ? (
                      <div style={{ ...inputStyle, textAlign: 'right', ...TNUM, background: T.bgSubtle, color: T.textMid, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, cursor: 'help' }}
                        title={mat.origine === 'magazzino'
                          ? `${fmt3(eff)} — lo dice il magazzino: «${mat.legatoA}» per ${(Number(mat.pesoG) || 0).toLocaleString('it-IT')} g a pezzo. Cambia quando arriva una bolla nuova.`
                          : `${fmt3(eff)} — lo dice il tuo elenco dei materiali. Per correggerlo apri «I tuoi materiali»: cambia in tutti i formati insieme.`}>
                        <Icon name={mat.origine === 'magazzino' ? 'package' : 'lock'} size={11} />
                        <span>{fmt3(eff)}</span>
                      </div>
                    ) : (
                      <input style={{ ...inputStyle, textAlign: 'right', ...TNUM }} type="number" min="0" step="0.001" value={c.costo ?? ''} placeholder="es. 0,060"
                        onChange={e => setForm(f => ({ ...f, componenti: f.componenti.map((x, j) => j === i ? { ...x, costo: e.target.value } : x) }))}/>
                    )}
                    {!isMobile && <span style={{ textAlign: 'right', fontSize: font.size.sm, fontWeight: 700, color: T.textMid, ...TNUM }}>{fmt3(subtot)}</span>}
                    <button onClick={() => setForm(f => ({ ...f, componenti: f.componenti.filter((_, j) => j !== i) }))} title="Rimuovi materiale"
                      style={{ padding: '8px 0', width: 36, background: T.brandLight, color: T.brand, border: 'none', borderRadius: R.sm, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                )
              })}
              <button onClick={() => setForm(f => ({ ...f, componenti: [...(f.componenti || []), { nome: '', qta: '', costo: '' }] }))}
                style={{ alignSelf: 'flex-start', marginTop: 4, padding: '8px 14px', background: 'transparent', color: T.textMid, border: `1px dashed ${T.borderStr}`, borderRadius: R.md, fontSize: font.size.sm, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={13} />Aggiungi materiale
              </button>
            </div>
          </div>

          {/* Anteprima FC del formato in editing */}
          {previewFC && (
            <div style={{ marginTop: 14, padding: '11px 14px', background: previewFC.avg == null ? T.amberLight : T.greenLight, border: `1px solid ${previewFC.avg == null ? T.amber : T.green}33`, borderRadius: R.md }}>
              {previewFC.avg == null ? (
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: font.size.sm, color: T.amberDark, lineHeight: 1.55 }}>
                  <span style={{ flexShrink: 0, marginTop: 1, color: T.amber }}><Icon name="warning" size={15} /></span>
                  <span>Nessuna {LEX.ricetta} con categoria <b>"{form.categoria}"</b> (con peso definito): il food cost coprirà solo i materiali di confezionamento. Assegna la categoria ai {LEX.prodotti} nel {LEX.Ricettario} per stimare anche il prodotto.</span>
                </div>
              ) : (
                // Grid uniforme 4 col: ogni stat ha stesso label (10/700/0.08em) +
                // value (18/800) + hint (10.5). Incolonnati perfettamente tra di
                // loro su desktop; mobile passa a 2x2.
                // L'anteprima di quello che stai scrivendo e il conto della
                // scheda già salvata mostravano gli stessi quattro numeri in
                // due forme diverse: quattro riquadri qui, quattro riquadri là,
                // e nessuna delle due diceva che si tratta di una somma.
                // Adesso sono la stessa cosa scritta nello stesso modo — chi
                // ha capito il conto una volta lo ritrova uguale.
                <div style={{ display: 'flex', gap: isMobile ? 12 : 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ minWidth: 190, flex: '1 1 190px' }}>
                    <RigaConto label="Materiali" val={fmt3(previewFC.fcComponenti)} />
                    <RigaConto label={`Prodotto · ${previewFC.baseG.toLocaleString('it-IT', { useGrouping: 'always' })} g`}
                      val={fmt3(previewFC.baseG * previewFC.avg)}
                      hint={`Food cost ${form.categoria}: ${fmtEuro(previewFC.avg * 1000)}/kg`} />
                    <div style={{ borderTop: `1px solid ${T.borderStr}`, marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                      <span style={{ fontSize: typo.small.fontSize, fontWeight: 800, color: T.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Food cost / unità</span>
                      <span style={{ fontSize: font.size.lg, fontWeight: 900, color: T.text, ...TNUM, letterSpacing: '-0.02em' }}>{fmt3(previewFC.fcUnit)}</span>
                    </div>
                  </div>
                  {previewFC.margPct != null && (
                    <div style={{ flexShrink: 0, textAlign: isMobile ? 'left' : 'right', minWidth: 130 }}>
                      <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Margine stimato</div>
                      <div style={{ fontSize: font.size['2xl'], fontWeight: 900, ...TNUM, letterSpacing: '-0.03em', lineHeight: 1.1,
                        color: previewFC.margPct >= 60 ? T.green : previewFC.margPct >= 40 ? T.amber : T.brand }}>
                        {fmtp0(previewFC.margPct)}
                      </div>
                      {form.prezzo > 0 && <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, ...TNUM }}>su {fmtEuro(Number(form.prezzo) || 0)} di prezzo</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={salva}
              style={{ padding: '11px 20px', minHeight: dito ? 44 : 40, background: T.green, color: T.textOnDark, border: 'none', borderRadius: R.md, fontWeight: 700, fontSize: font.size.base, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon name="check" size={15} />Salva formato
            </button>
            <button onClick={() => setForm(null)}
              style={{ padding: '11px 20px', minHeight: dito ? 44 : 40, background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: font.size.base, fontWeight: 500, cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}

      {/* ③ LISTA PREMIUM DEI FORMATI */}
      {formati.length === 0 && !form ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '56px 32px', color: T.textSoft }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 14, background: T.brandLight, color: T.brand, marginBottom: 14 }}>
            <Icon name="package" size={22} />
          </div>
          <div style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, marginBottom: 6 }}>Nessun formato configurato</div>
          <div style={{ fontSize: font.size.base, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>
            Aggiungi un formato se la tua cassa batte prodotti senza il dettaglio del {LEX.prodotto} (vaschette, coni, scatole, panini).
          </div>
        </div>
      ) : formati.length > 0 && (
        <>
          <SH sub="Clicca un formato per vedere com'è composto il costo di confezionamento. Il food cost stimato somma i materiali e la quota di prodotto.">I tuoi formati</SH>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(r => {
              const f = r.f
              const open = expanded === f.id
              const margCol = r.margPct == null ? T.textSoft : r.margPct >= 60 ? T.green : r.margPct >= 40 ? T.amber : T.brand
              return (
                <div key={f.id} style={{ ...cardStyle, overflow: 'hidden' }}>
                  {/* La riga che si apre è un pulsante, non un `<div>`.

                      Era `<div onClick>`: con la tastiera non ci si arriva e un
                      lettore di schermo non sa che si possa toccare. In una
                      pagina con dieci formati sono dieci comandi invisibili.
                      `aria-expanded` dice anche se è già aperta. */}
                  <button type="button" onClick={() => setExpanded(open ? null : f.id)}
                    aria-expanded={open}
                    aria-label={`${f.nome}: ${open ? 'chiudi' : 'apri'} il dettaglio del costo`}
                    style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', font: 'inherit', color: 'inherit',
                      padding: isMobile ? '14px 16px' : '16px 20px', display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 18, flexWrap: 'wrap', cursor: 'pointer' }}>
                    <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, background: T.brandLight, color: T.brand }}>
                      <Icon name="package" size={19} />
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text }}>{f.nome}</div>
                      <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, marginTop: 3 }}>
                        Categoria: <b style={{ color: T.textMid }}>{f.categoria || '-'}</b> · base {(Number(f.baseQtaG) || 0).toLocaleString('it-IT', { useGrouping: 'always' })}g · {r.componenti.length} {r.componenti.length === 1 ? 'materiale' : 'materiali'}
                        {f.alias?.length > 0 && <> · alias: {f.alias.join(', ')}</>}
                      </div>
                    </div>

                    {/* mini-stat */}
                    <div style={{ display: 'flex', gap: isMobile ? 16 : 26, alignItems: 'center' }}>
                      <MiniStat label="Confezione" val={fmt3(r.costoMateriali)} />
                      <MiniStat label="Food cost / unità" val={fmt3(r.fcUnit)} color={r.fcKnown ? T.text : T.amber} title={r.fcKnown ? undefined : 'Stima sui soli materiali: categoria senza gusti pesati'} />
                      {r.margPct != null && <MiniStat label="Margine" val={fmtp0(r.margPct)} color={margCol} />}
                    </div>

                    {!isMobile && (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        {hasMultiSede && (
                          <button onClick={(e) => { e.stopPropagation(); setPrezziSedeTarget(f) }}
                            title="Prezzi diversi per sede"
                            style={{ padding: '8px 12px', background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: R.sm, fontSize: font.size.sm, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Icon name="pin" size={13} />Prezzi / sede
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); apriEditor(f) }}
                          style={{ padding: '8px 12px', background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: R.sm, fontSize: font.size.sm, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Icon name="edit" size={13} />Modifica
                        </button>
                        {/* L'eliminazione non deve gridare su ogni riga.
                            Era su fondo bordeaux chiaro con il testo bordeaux e
                            il peso 600: su cinque formati diventavano cinque
                            avvisi rossi, più forti di "Modifica" che e' l'azione
                            che si usa davvero. Ora e' un'icona sola, discreta,
                            col nome del formato nell'etichetta per chi usa un
                            lettore di schermo. Il colore torna nel momento in
                            cui serve: al passaggio del mouse. */}
                          {/* 17/09/2026, segnalato dal titolare: «centra
                              l'immagine del cestino della spazzatura nei
                              pulsanti dove e' presente, ora sono tutti spostati
                              a sinistra». Il pulsante e' un quadrato di 32px
                              (40 sul telefono) con dentro una sola icona da
                              14: c'era `alignItems: 'center'`, che centra in
                              verticale, ma mancava `justifyContent`, che
                              centra in orizzontale — quindi l'icona si
                              appoggiava al bordo sinistro e restavano 18px di
                              vuoto a destra. Il `gap: 5` non serviva a niente:
                              regola lo spazio FRA più figli, e qui il figlio
                              e' uno solo. */}
                        <button onClick={(e) => { e.stopPropagation(); elimina(f.id) }}
                          aria-label={`Elimina il formato ${f.nome}`}
                          title={`Elimina ${f.nome}`}
                          style={{ width: dito ? 44 : 32, height: dito ? 44 : 32, padding: 0, background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: R.sm, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    )}
                    <span style={{ color: T.textSoft, flexShrink: 0, display: 'inline-flex' }}><Icon name={open ? 'chevDown' : 'chevR'} size={16} /></span>
                  </button>

                  {/* breakdown espandibile */}
                  {open && (
                    <div style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgSubtle, padding: isMobile ? '14px 16px' : '16px 20px' }}>
                      <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                        Composizione del food cost per unità
                      </div>

                      {/* materiali di confezionamento */}
                      {r.componenti.length === 0 ? (
                        <div style={{ fontSize: font.size.sm, color: T.textSoft, marginBottom: 12 }}>Nessun materiale di confezionamento definito.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                          {r.componenti.map((c, j) => {
                            const subtot = c.qta * c.costo
                            const pctCosto = r.fcUnit > 0 ? subtot / r.fcUnit * 100 : 0
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: font.size.sm }}>
                                <span style={{ flex: '0 0 38%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text, fontWeight: 500 }}>
                                  {/* Da dove viene il prezzo. Senza, un numero
                                      preso dalla bolla e uno battuto a mano
                                      due anni fa si leggono uguali. */}
                                  {c.origine === 'magazzino' && (
                                    <span style={{ color: T.brand, marginRight: 4, cursor: 'help' }} title="Il prezzo lo fa l'ultima bolla di magazzino">
                                      <Icon name="package" size={11} />
                                    </span>
                                  )}
                                  {c.fuoriElenco && (
                                    <span style={{ color: T.amber, marginRight: 4, cursor: 'help' }} title={`«${c.nome}» non è fra i tuoi materiali: questo prezzo è scritto dentro il formato e non lo aggiorna nessuno. Aprilo in «I tuoi materiali» per correggerlo una volta sola.`}>
                                      <Icon name="warning" size={11} />
                                    </span>
                                  )}
                                  {c.senzaPrezzo && (
                                    <span style={{ color: T.amber, marginRight: 4, cursor: 'help' }} title={`«${c.nome}» è fra i tuoi materiali ma senza prezzo: qui resta il numero vecchio del formato.`}>
                                      <Icon name="warning" size={11} />
                                    </span>
                                  )}
                                  {c.nome} <span style={{ color: T.textSoft, ...TNUM }}>· {c.qta.toLocaleString('it-IT', { useGrouping: 'always' })} × {fmt3(c.costo)}</span>
                                </span>
                                <span style={{ flex: 1, height: 7, background: T.bgCard, borderRadius: 4, overflow: 'hidden' }}>
                                  <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pctCosto)}%`, background: 'rgba(110,14,26,0.45)' }} />
                                </span>
                                <span style={{ flex: '0 0 70px', textAlign: 'right', ...TNUM, color: T.text, fontWeight: 600 }}>{fmt3(subtot)}</span>
                                <span style={{ flex: '0 0 44px', textAlign: 'right', ...TNUM, color: T.textSoft }}>{fmtp0(pctCosto)}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* ── Il conto, scritto come un conto ──────────────
                          18/09/2026, richiesta del titolare: «rivedi
                          impaginazione di tutte queste cose, miglioratele
                          tutte da qualsiasi punto di vista: ottimizzazione
                          dello spazio, intuitività, bellezza ed eleganza anche
                          nei colori».

                          Erano quattro riquadri affiancati e tutti uguali:
                          Materiali · Prodotto · Food cost stimato · Margine.
                          Ma quei quattro numeri non sono quattro cose alla
                          pari — sono **una somma**: materiali più prodotto
                          fanno il food cost, e il margine è quello che resta
                          del prezzo. Disegnarli in fila nascondeva l'unica
                          cosa che c'era da capire, e costringeva a rifare il
                          conto a mente per verificare che tornasse.

                          Adesso è scritto come si scrive un conto: i due
                          addendi, una riga, il totale. Il margine sta a parte,
                          perché non è un addendo: è la risposta. Il colore
                          torna a fare il suo mestiere — grigio per gli
                          addendi, che sono passaggi, e colore solo sui due
                          numeri su cui si decide. */}
                      <div style={{ borderTop: `1px dashed ${T.border}`, paddingTop: 12, display: 'flex', gap: isMobile ? 14 : 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ minWidth: 190, flex: '1 1 190px' }}>
                          <RigaConto label="Materiali" val={fmt3(r.costoMateriali)} />
                          <RigaConto
                            label={`Prodotto · ${(Number(f.baseQtaG) || 0).toLocaleString('it-IT', { useGrouping: 'always' })} g`}
                            val={r.fcKnown ? fmt3(r.fcBase) : '—'}
                            hint={r.fcKnown
                              ? `Food cost ${f.categoria}: ${fmtEuro(r.avg * 1000)}/kg · su ${r.nUsate} ${r.nUsate === 1 ? 'ricetta' : 'ricette'}`
                              : `categoria senza ${LEX.prodotti} pesati`} />
                          <div style={{ borderTop: `1px solid ${T.borderStr}`, marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                            <span style={{ fontSize: typo.small.fontSize, fontWeight: 800, color: T.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Food cost / unità</span>
                            <span style={{ fontSize: font.size.lg, fontWeight: 900, color: r.fcKnown ? T.text : T.amber, ...TNUM, letterSpacing: '-0.02em' }}>{fmt3(r.fcUnit)}</span>
                          </div>
                          {!r.fcKnown && (
                            <div style={{ fontSize: typo.small.fontSize, color: T.amber, marginTop: 4, lineHeight: 1.45 }}>
                              Incompleto: la categoria non ha ricette pesate, quindi il costo del prodotto non si sa.
                            </div>
                          )}
                        </div>

                        {r.prezzo > 0 && (
                          <div style={{ flexShrink: 0, textAlign: isMobile ? 'left' : 'right', minWidth: 130 }}>
                            <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Margine</div>
                            <div style={{ fontSize: font.size['2xl'], fontWeight: 900, color: margCol, ...TNUM, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                              {r.margPct != null ? fmtp0(r.margPct) : '—'}
                            </div>
                            <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, ...TNUM }}>
                              {r.margPct != null
                                ? `su ${fmtEuro(r.prezzo)} di prezzo`
                                : 'senza il costo del prodotto il margine non si sa'}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* azioni su mobile (nel breakdown per non affollare la riga) */}
                      {isMobile && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                          {hasMultiSede && (
                            <button onClick={(e) => { e.stopPropagation(); setPrezziSedeTarget(f) }}
                              style={{ padding: '10px', background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: R.sm, fontSize: font.size.base, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <Icon name="pin" size={14} />Prezzi per sede
                            </button>
                          )}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={(e) => { e.stopPropagation(); apriEditor(f) }}
                              style={{ flex: 1, padding: '10px', background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: R.sm, fontSize: font.size.base, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <Icon name="edit" size={14} />Modifica
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); elimina(f.id) }}
                              style={{ flex: 1, padding: '10px', background: T.brandLight, color: T.brand, border: 'none', borderRadius: R.sm, fontSize: font.size.base, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <Icon name="trash" size={14} />Elimina
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      {prezziSedeTarget && (
        <PrezziPerSedeModal
          open={!!prezziSedeTarget}
          onClose={() => setPrezziSedeTarget(null)}
          orgId={orgId}
          sedi={sedi}
          target={{ kind: 'formato', formato: prezziSedeTarget }}
          notify={notify}
        />
      )}
    </div>
  )
}

// Mini statistica nella riga del formato (label + valore).
function MiniStat({ label, val, color, title }) {
  return (
    <div style={{ textAlign: 'right' }} title={title}>
      <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, whiteSpace: 'nowrap', cursor: title ? 'help' : 'default' }}>{label}</div>
      <div style={{ fontSize: font.size.md, fontWeight: 800, color: color || T.text, ...TNUM }}>{val}</div>
    </div>
  )
}

// Totale nel breakdown espanso.
/** Una riga del conto: l'etichetta a sinistra, il numero a destra, e i
 *  numeri incolonnati fra loro. Sono passaggi, non risultati: restano in
 *  grigio, perché il colore serve a far trovare le due cifre che contano. */
function RigaConto({ label, val, hint }) {
  return (
    <div title={hint} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '3px 0', cursor: hint ? 'help' : 'default' }}>
      <span style={{ fontSize: typo.small.fontSize, color: T.textSoft, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: font.size.base, fontWeight: 600, color: T.textMid, ...TNUM, whiteSpace: 'nowrap' }}>{val}</span>
    </div>
  )
}

function BreakdownTot({ label, val, hint, color, big }) {
  return (
    <div title={hint}>
      <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 4, minHeight: 32, cursor: hint ? 'help' : 'default' }}>{label}</div>
      <div style={{ fontSize: big ? 18 : 15, fontWeight: 800, color: color || T.text, letterSpacing: '-0.02em', ...TNUM }}>{val}</div>
      {hint && <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

// Statistica nell'anteprima del form.
function PreviewStat({ label, val, hint, color }) {
  // Uniforme: label 10/700/0.08em uppercase, value 18/800 tabular,
  // hint 10.5 textSoft. Tutti gli stat hanno la stessa altezza grazie
  // a minHeight + flex column.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 56 }}>
      <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: T.textSoft, lineHeight: 1.2, minHeight: 30, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: font.size.xl, fontWeight: 800, color: color || T.text, letterSpacing: '-0.02em', ...TNUM, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
      {hint && <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hint}</div>}
    </div>
  )
}
