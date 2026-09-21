import React, { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFatturaXML, parseFatturaSMART } from '../lib/parseFatturaXML'
import { loadXLSX } from '../lib/xlsx'
import { exportScadenzario } from '../lib/exportPDF'
import { getExportCtx, gateExport } from '../lib/exportGuard'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { sload, ssave } from '../lib/storage'
import { generateSepaXml, ibanIsValid, normalizeIban, causaleFattura, bonificoText } from '../lib/sepa'
import Icon from './Icon'
import { TabellaOSchede } from '../views/_shared'
import { color as T, radius as R, shadow as S, motion as M, typo, font } from '../lib/theme'
// todayLocal: la data di OGGI nel fuso dell'utente. new Date().toISOString()
// darebbe la data UTC, che in Italia fra mezzanotte e le 2 è ancora ieri: la
// data di pagamento proposta risultava del giorno prima.
import { todayLocal } from '../lib/dateLocal'
import { pickFattura, dedupFatture, insertFattureResilient, chiaviFattureEsistenti } from '../lib/fattureImport'
import { aggiungiMovimentiInBlocco, ORIGINE_FATTURA } from '../lib/primaNota'
import {
  imputaPagamento, terminiOsservati, ricorrenti, fattureAnomale, testoEstrattoConto,
} from '../lib/pagamentiFornitore'
import { leggiEstrattoConto, proponiAbbinamenti } from '../lib/riconciliazioneBanca'
import {
  normNome, dataScadenza as dueDateObj, isoScadenza as dueDateISO,
  giorniAllaScadenza as diffDays, urgenza as computeUrgenza, quandoScade as relDayLabel,
  arricchisci, perUrgenza, riepilogo, FASCE, FILTRI,
} from '../lib/scadenzeFatture'

// Chiave storage per i dati di pagamento dell'azienda (intestatario + IBAN da
// cui partono i bonifici). Shared a livello org (sede null).
const SK_AZIENDA_PAG = 'azienda-pagamenti-v1'

const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

// I conti sulle scadenze stanno in src/lib/scadenzeFatture.js dal 16/09/2026.
// Erano qui dentro, in un file da 3.199 righe coperto dai test all'1%: sono
// i numeri che dicono al titolare a chi deve dei soldi e da quanto, e non li
// verificava niente. Scorporandoli è venuto fuori che questa pagina calcolava
// «30 giorni fine mese» come «30 giorni netti» — fino a ventotto giorni di
// differenza — mentre la previsione di cassa lo calcolava giusto.
const URGENZA_CFG = {
  scaduta:   { ...FASCE.scaduta,   pillBg: '#FEE2E2',  pillFg: '#991B1B', accent: T.red },
  settimana: { ...FASCE.settimana, pillBg: '#FFEDD5',  pillFg: '#9A3412', accent: '#C2410C' },
  mese:      { ...FASCE.mese,      pillBg: '#FEF3C7',  pillFg: '#92400E', accent: T.amber },
  futura:    { ...FASCE.futura,    pillBg: T.bgSubtle, pillFg: T.textMid, accent: T.textSoft },
  pagata:    { ...FASCE.pagata,    pillBg: '#DCFCE7',  pillFg: '#166534', accent: T.green },
}

// useGrouping:'always' obbligatorio: senza, alcuni runtime (Safari iOS private,
// Node senza ICU full) ritornano "4715" invece di "4.715". Vedi _shared.jsx.
const _NF2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
const _NF0 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' })
const fmtEuro = v => `${_NF2.format(Number(v || 0))} €`
const fmtEuro0 = v => `${_NF0.format(Math.round(Number(v || 0)))} €`
const fmtDate = d =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'

// ── Il velo di una finestra ────────────────────────────────────────────────
//
// Sopra ogni finestra di questa pagina c'era un `<div onClick>` che la
// chiudeva. Col dito o col mouse funziona; con la tastiera no, e a un lettore
// di schermo quel rettangolo non risulta nemmeno esistere — resta una
// finestra che si apre e non si sa come si chiude.
//
// Il rimedio è quello già usato in `Personale.jsx`: il velo è un `<button>`
// vero, che si raggiunge con Tab e dice cosa fa, e la finestra si chiude
// anche con Esc. Il riquadro bianco va messo sopra (`position: relative`),
// altrimenti il velo se lo mangia.
function VeloFinestra({ onChiudi, colore = 'rgba(15,23,42,0.5)', attivo = true }) {
  useEffect(() => {
    if (!attivo) return undefined
    const suTasto = e => { if (e.key === 'Escape') onChiudi?.() }
    document.addEventListener('keydown', suTasto)
    return () => document.removeEventListener('keydown', suTasto)
  }, [onChiudi, attivo])
  return (
    <button type="button" onClick={() => attivo && onChiudi?.()} aria-label="Chiudi la finestra"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none',
        padding: 0, margin: 0, background: colore, cursor: attivo ? 'default' : 'not-allowed' }} />
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Scadenzario({ orgId, sedeId, sedi = [], pagina = 'scadenzario', onNavigate }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [fatture, setFatture]             = useState([])
  // Storico completo caricato su richiesta: per default la pagina tiene le
  // aperte e le pagate recenti, non tutte le 3.520.
  const [storicoCompleto, setStoricoCompleto] = useState(false)
  const [pagateTotali, setPagateTotali]   = useState(null)
  const [loading, setLoading]             = useState(true)
  const [importLoading, setImportLoading] = useState(false)
  // Quali gruppi di scadenza hanno "mostra tutte" attivo. Sta qui e non dentro
  // Gruppo perché quel componente viene chiamato come funzione: vedi il
  // commento dentro Gruppo.
  const [gruppiEspansi, setGruppiEspansi] = useState({})
  // Conferma e stato dell'operazione "segna pagate" in blocco.
  const [bloccoConf, setBloccoConf] = useState(null)   // { items, titolo } | null
  const [bloccoLoading, setBloccoLoading] = useState(false)
  const [filtro, setFiltro]               = useState('tutte')
  // Lo scope sede è comandato dal SELETTORE GLOBALE in topbar (un solo controllo):
  // sede specifica → solo quella + condivise; "Tutte le sedi" (sedeId assente) → tutte.
  const scopeSede = sedeId ? 'attiva' : 'tutte'

  // ── «Sei sicuro che queste fatture sono di…» ──────────────────────────
  //
  // Richiesta del titolare, 17/09/2026, e nasce da un danno vero: le 3.104
  // fatture di Mara sono finite TUTTE su Carlina, non perché qualcuno
  // l'avesse deciso ma perché era la sede attiva nel momento dell'import.
  // Le 142 del secondo account Webdesk — quelle di Berthollet e De Gasperi —
  // sono rimaste senza sede e sono sparite da ogni pagina: 189.458 €
  // invisibili.
  //
  // Il selettore in alto serve a guardare, e nessuno pensa che decida anche
  // dove finiscono i documenti che sta caricando. Quindi prima di scrivere si
  // chiede, dicendo a chiare lettere dove andranno.
  //
  // E non è solo un sì/no: si può cambiare, e si possono scegliere DUE sedi.
  // È il caso di Mara — un account fornitore che copre due negozi — e allora
  // la spesa si dichiara condivisa e si divide sui chili prodotti
  // (`src/lib/costiCondivisi.js`), invece di essere attribuita a caso.
  const [confermaSede, setConfermaSede] = useState(null)   // { files, avvia }
  const [sediScelte, setSediScelte] = useState(() => (sedeId ? [sedeId] : []))
  const [toast, setToast]                 = useState(null)
  const [pagandoId, setPagandoId]         = useState(null)
  // "Registra anche l'uscita in Cassa": accesa per default, e ricordata fra
  // una sessione e l'altra. Chi tiene la prima nota altrove la spegne una
  // volta sola.
  const [registraInCassa, setRegistraInCassa] = useState(() => {
    try { return localStorage.getItem('foodos-scad-uscita-cassa') !== 'no' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('foodos-scad-uscita-cassa', registraInCassa ? 'si' : 'no') } catch { /* niente */ }
  }, [registraInCassa])
  // Data locale del browser (not UTC): toISOString() darebbe il giorno
  // precedente per chiunque sia a UTC+ tra le 00:00 e le 00:59 locali.
  const [dataPag, setDataPag]             = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [eliminandoId, setEliminandoId]   = useState(null)
  // Vista: 'scadenza' (timeline urgenza) | 'fornitore' (rollup) | 'cassa' (forward)
  const [vista, setVista]                 = useState('scadenza')

  // ── Le schermate che si aprono DA questa ────────────────────────────────
  //
  // Richiesta del titolare, 19/09/2026: le tre tessere in cima («Da pagare»,
  // «Scadute», «In scadenza») erano tre numeri fermi, e premendole cambiava
  // solo il filtro dell'elenco qui sotto. Parole sue: «non si devono aprire
  // nella stessa pagina, deve essere un'altra».
  //
  // Sono pagine vere, dichiarate in `menuFoodos.js` e disegnate dal Dashboard:
  // hanno un nome proprio nella riga in cima, stanno nella storia del browser
  // (il tasto «indietro» funziona) e ognuna ha il suo ritorno. Il Dashboard le
  // monta tutte nello stesso punto dell'albero, quindi passare dall'una
  // all'altra non rilegge le fatture da capo.
  //
  // `sottoPaginaLocale` serve solo quando il componente è montato senza
  // `onNavigate` (le prove, una futura anteprima): le tessere continuano a
  // funzionare invece di non fare niente.
  const [sottoPaginaLocale, setSottoPaginaLocale] = useState(null)
  const sottoPagina = (pagina && pagina !== 'scadenzario') ? pagina : sottoPaginaLocale
  const vaiA = (p) => {
    if (typeof onNavigate === 'function') onNavigate(p || 'scadenzario')
    else setSottoPaginaLocale(p || null)
  }

  // Lo smistamento delle fatture senza punto vendita: quali righe sono
  // spuntate e a quale sede vanno quelle spuntate.
  const [selSenzaSede, setSelSenzaSede] = useState(() => new Set())
  const [sedeBulk, setSedeBulk]         = useState('')
  const [rigaSede, setRigaSede]         = useState(null)   // id della fattura in salvataggio

  // La pagina degli IBAN: quello che si sta scrivendo, e chi è già fatto.
  const [ibanBozze, setIbanBozze]       = useState({})
  const [ibanFatti, setIbanFatti]       = useState(() => new Set())
  const [ibanSalvando, setIbanSalvando] = useState(null)
  // L'elenco degli IBAN da scrivere si congela quando si entra nella pagina.
  // Senza, ogni riga salvata sparirebbe e le altre salirebbero di un posto:
  // si scriverebbe l'IBAN del fornitore sbagliato al secondo invio.
  const elencoIbanRef = useRef(null)
  useEffect(() => {
    if (sottoPagina !== 'fornitori-senza-iban') elencoIbanRef.current = null
    if (sottoPagina !== 'fatture-senza-sede') setSelSenzaSede(new Set())
  }, [sottoPagina])
  const [search, setSearch]               = useState('')
  // Anagrafica fornitori (enrichment: iban di default, termini) keyed per nome_norm
  const [fornitori, setFornitori]         = useState([])
  // Dati pagamento azienda (debtor del bonifico SEPA)
  const [azienda, setAzienda]             = useState({ nome: '', iban: '', bic: '' })
  const [editAzienda, setEditAzienda]     = useState(false)
  const [sepaConfirm, setSepaConfirm]     = useState(null) // {items, totale} | null
  const [ibanAlert, setIbanAlert]         = useState(null) // {tipo:'azienda'|'fornitore', fornitore} | null
  const [selFatt, setSelFatt]             = useState(() => new Set()) // singole fatture selezionate (vista Per scadenza)
  const [actionsOpen, setActionsOpen]     = useState(false)
  const actionsRef = useRef(null)
  useEffect(() => {
    if (!actionsOpen) return
    const onDoc = (e) => { if (actionsRef.current && !actionsRef.current.contains(e.target)) setActionsOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setActionsOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [actionsOpen])
  // Selezione fatture per il bonifico massivo
  const [selez, setSelez]                 = useState(() => new Set())
  // Pagamento: stato esteso (acconto + metodo) per il popup "segna pagata"
  const [pagImporto, setPagImporto]       = useState('')
  const [pagMetodo, setPagMetodo]         = useState('bonifico')
  // Editing anagrafica fornitore (IBAN/termini) dal rollup
  const [editForn, setEditForn]           = useState(null) // nome_norm in edit
  // Pagamento cumulativo: un bonifico, un importo, le fatture si chiudono
  // dalla più vecchia. { nome_norm, nome, testo } | null
  const [pagCum, setPagCum]               = useState(null)
  const [pagCumSaving, setPagCumSaving]   = useState(false)
  // Quale settimana del calendario è aperta a mostrare i fornitori.
  const [settimanaAperta, setSettimanaAperta] = useState(null)
  // Assegnazione del punto vendita alle fatture che non l'hanno. La tendina
  // «assegna tutte a una sede» è diventata la pagina di smistamento (vedi
  // `PaginaSmistamento`): qui resta solo la spia del salvataggio in corso.
  const [sedeSaving, setSedeSaving]       = useState(false)
  // Riconciliazione con la banca: { movimenti, abbinamenti, nonAbbinati,
  // avvisi, scelti: Set } | null
  const [banca, setBanca]                 = useState(null)
  const [bancaSaving, setBancaSaving]     = useState(false)
  const [editFornData, setEditFornData]   = useState({ iban: '', termini: 30, categoria: '' })
  // Set di fornitori (nome_norm) con dropdown fatture espanso.
  const [expandedForn, setExpandedForn]   = useState(() => new Set())
  const toggleExpandForn = (nomeNorm) => setExpandedForn(prev => {
    const next = new Set(prev)
    if (next.has(nomeNorm)) next.delete(nomeNorm); else next.add(nomeNorm)
    return next
  })
  // Eliminazione bulk con doppia conferma (modale + frase da digitare)
  const [bulkOpen, setBulkOpen]           = useState(false)
  const [bulkConfirm, setBulkConfirm]     = useState('')
  const [bulkDeleting, setBulkDeleting]   = useState(false)

  const haPiuSedi = (sedi || []).filter(s => s.attiva !== false).length > 1

  const notify = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    loadFatture()
    loadFornitori()
    loadAzienda()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sedeId])

  async function loadFornitori() {
    try {
      // Solo i campi che questa pagina usa: nome per l'abbinamento, IBAN e
      // termini per il bonifico e la scadenza, categoria per il riepilogo.
      const { data, error } = await supabase.from('fornitori')
        .select('id, nome, iban, termini_pagamento, termini_tipo, categoria, attivo')
        .eq('organization_id', orgId)
      if (error) {
        // tabella non ancora creata (migration non applicata) → enrichment vuoto
        if (/does not exist|schema cache|could not find/i.test(error.message || '')) { setFornitori([]); return }
        throw error
      }
      setFornitori(data || [])
    } catch { setFornitori([]) }
  }

  async function loadAzienda() {
    try {
      const a = await sload(SK_AZIENDA_PAG, orgId, null)
      if (a && typeof a === 'object') setAzienda({ nome: a.nome || '', iban: a.iban || '', bic: a.bic || '' })
    } catch { /* nessun dato salvato */ }
  }

  async function salvaAzienda(next) {
    try {
      // Sanity check: l'IBAN azienda NON deve coincidere con quello di
      // nessun fornitore (altrimenti staresti pagando te stesso o c'e'
      // un errore di battitura). Blocco salvataggio + alert.
      const ibanAz = normalizeIban(next?.iban || '')
      if (ibanIsValid(ibanAz)) {
        const collision = fornitori.find(f => normalizeIban(f.iban || '') === ibanAz)
        if (collision) {
          setIbanAlert({ tipo: 'azienda', fornitore: collision.nome })
          return
        }
      }
      await ssave(SK_AZIENDA_PAG, next, orgId, null)
      setAzienda(next)
      setEditAzienda(false)
      notify('Dati di pagamento azienda salvati')
    } catch (e) {
      notify('Errore salvataggio: ' + (e?.message || 'rete'), false)
    }
  }

  // Mappa nome normalizzato → fornitore (anagrafica esistente). Il match è sul
  // nome (la tabella `fornitori` non ha nome_norm): normalizziamo lato JS.
  const fornitoriMap = useMemo(() => {
    const m = {}
    for (const f of fornitori) m[normNome(f.nome)] = f
    return m
  }, [fornitori])

  // Salva IBAN/termini/categoria sull'anagrafica fornitori ESISTENTE.
  // Find-or-insert per nome normalizzato (niente onConflict: la tabella legacy
  // non ha un vincolo unico su nome).
  async function salvaFornitore(nome, patch) {
    const key = normNome(nome)
    try {
      const esistente = fornitori.find(f => normNome(f.nome) === key)
      const newIban = patch.iban !== undefined ? (normalizeIban(patch.iban) || null) : (esistente?.iban || null)
      // Sanity check: l'IBAN del fornitore NON deve coincidere con l'IBAN
      // dell'azienda (altrimenti staresti pagando te stesso, errore comune
      // di copia-incolla durante l'import anagrafica).
      if (newIban && ibanIsValid(newIban) && ibanIsValid(azienda.iban) && newIban === normalizeIban(azienda.iban)) {
        setIbanAlert({ tipo: 'fornitore', fornitore: nome })
        return
      }
      const fields = {
        iban: newIban,
        termini_pagamento: patch.termini_pagamento !== undefined ? patch.termini_pagamento : (esistente?.termini_pagamento ?? 30),
        // Come si contano i giorni: 'netti' dalla data fattura, 'fine_mese'
        // dalla fine del mese (lo standard dei fornitori alimentari).
        termini_tipo: patch.termini_tipo !== undefined ? patch.termini_tipo : (esistente?.termini_tipo || 'netti'),
        categoria: patch.categoria !== undefined ? (patch.categoria || null) : (esistente?.categoria || null),
      }
      let error
      if (esistente) {
        ({ error } = await supabase.from('fornitori').update(fields).eq('id', esistente.id))
      } else {
        ({ error } = await supabase.from('fornitori').insert({ organization_id: orgId, nome, ...fields }))
      }
      if (error) throw error
      setEditForn(null)
      await loadFornitori()
      notify('Anagrafica fornitore aggiornata')
    } catch (e) {
      notify('Errore: ' + (e?.message || 'salvataggio fallito') + ' - verifica la migration scadenzario', false)
    }
  }

  // Colonne che questa pagina usa davvero. Prima era `select('*')`: su Mara
  // sono 856 kB scaricati a ogni apertura per 3.104 righe, di cui solo 152 kB
  // servono (le fatture aperte). `note`, `allegato_url`, `piva`, `cf` e
  // `data_rif` non vengono mostrati da nessuna parte, e `note` è la colonna
  // più pesante. Il peso cresce per sempre: fra un anno sono 2 MB a ogni clic.
  const COLONNE = 'id, numero_rif, data_fattura, data_scadenza, tipo, fornitore, totale, imponibile, imposta, stato, importo_pagato, data_pagamento, metodo_pagamento, iban, sede_id'

  // Quante fatture PAGATE si tengono in pagina: le ultime, non tutte.
  // Su Mara le pagate sono 2.133 e sono la parte che non serve al lavoro di
  // oggi. Chi cerca una fattura vecchia clicca "carica tutto lo storico".
  const GIORNI_PAGATE = 120

  async function loadFatture(tutto = storicoCompleto) {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    try {
      const applicaSede = (q) => (scopeSede === 'attiva' && sedeId)
        ? q.or(`sede_id.eq.${sedeId},sede_id.is.null`)
        : q
      const base = () => applicaSede(
        supabase.from('fatture').select(COLONNE).eq('organization_id', orgId)
      ).order('data_fattura', { ascending: false })

      let righe
      if (tutto) {
        const { data, error } = await base()
        if (error) throw error
        righe = data || []
      } else {
        // Due richieste, non una: tutte le aperte (quelle su cui si lavora) e
        // le pagate recenti (per controllare quello che si è appena saldato).
        const limite = new Date()
        limite.setDate(limite.getDate() - GIORNI_PAGATE)
        const limiteIso = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`
        const [aperte, pagate] = await Promise.all([
          base().neq('stato', 'pagata'),
          base().eq('stato', 'pagata').gte('data_fattura', limiteIso),
        ])
        if (aperte.error) throw aperte.error
        if (pagate.error) throw pagate.error
        righe = [...(aperte.data || []), ...(pagate.data || [])]
      }
      setFatture(righe)
      // Quante pagate restano fuori: la pagina lo deve dire, altrimenti il
      // filtro "Pagate" sembra vuoto quando invece è solo parziale.
      if (!tutto) {
        const { count } = await applicaSede(
          supabase.from('fatture').select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId).eq('stato', 'pagata')
        )
        setPagateTotali(count || 0)
      } else {
        setPagateTotali(null)
      }
    } catch (e) {
      console.error('[scadenzario] loadFatture', e)
      notify('Non riesco a caricare le fatture: controlla la connessione e riprova.', false)
    } finally {
      setLoading(false)
    }
  }

  // Carica l'estratto conto della banca e propone gli abbinamenti.
  //
  // PERCHE': per sapere se una fattura è stata pagata, oggi si apre l'home
  // banking, si cerca il bonifico, si torna qui e si segna la fattura. Su
  // 1.387 fatture aperte è il lavoro che nessuno fa — ed è la ragione per cui
  // lo scadenzario resta gonfio e smette di dire la verità.
  //
  // PROPONE, non applica: un abbinamento sbagliato chiude una fattura ancora
  // da pagare, e non se ne accorgerebbe nessuno.
  async function handleImportBanca(file) {
    if (!file) return
    setImportLoading(true)
    try {
      const testo = await file.text()
      const { movimenti, avvisi } = leggiEstrattoConto(testo)
      if (movimenti.length === 0) {
        notify(avvisi[0] || 'In questo file non trovo uscite da abbinare.', false)
        setImportLoading(false)
        return
      }
      // Serve TUTTO lo storico aperto per abbinare: le fatture vecchie sono
      // proprio quelle che si pagano in ritardo.
      const { abbinamenti, nonAbbinati } = proponiAbbinamenti(movimenti, fattureExt)
      setBanca({
        nomeFile: file.name,
        movimenti, avvisi, abbinamenti, nonAbbinati,
        // I "certi" partono spuntati, gli altri no: la conferma è un gesto,
        // non un automatismo.
        // Gli indici devono essere quelli di `abbinamenti`, non della lista
        // filtrata.
        //
        // Prima era `.filter(certo).map((a, i) => i)`: l'indice contato sulla
        // lista FILTRATA. Con tre uscite [incerta, certa, certa] il filtro dà
        // due elementi e gli indici {0, 1}, che nella lista intera puntano
        // alla PRIMA (incerta) e alla seconda. Risultato: partiva spuntata
        // un'uscita da controllare, e una sicura restava fuori — e alla
        // conferma venivano segnate pagate **le fatture sbagliate**.
        //
        // Si vedeva solo quando la prima uscita del file non era sicura,
        // motivo per cui era rimasto lì.
        scelti: new Set(abbinamenti.reduce((acc, a, i) => {
          if (a.certezza === 'certo') acc.push(i)
          return acc
        }, [])),
      })
      const nCerti = abbinamenti.filter(a => a.certezza === 'certo').length
      notify(`${movimenti.length} uscite lette · ${abbinamenti.length} abbinate (${nCerti} sicure) · ${nonAbbinati.length} da guardare`)
    } catch (e) {
      console.error('[scadenzario] estratto conto', e)
      notify('Non riesco a leggere questo estratto conto: esportalo in CSV dalla banca e riprova.', false)
    } finally {
      setImportLoading(false)
    }
  }

  // Applica gli abbinamenti spuntati: segna pagate le fatture e, se serve,
  // registra le uscite in prima nota.
  async function applicaAbbinamenti() {
    if (!banca) return
    const scelti = [...banca.scelti].map(i => banca.abbinamenti[i]).filter(Boolean)
    if (!scelti.length) return
    setBancaSaving(true)
    try {
      const patchPerId = {}
      for (const a of scelti) {
        for (const rf of a.fatture) {
          const f = fatture.find(x => x.id === rf.id)
          const totale = Math.abs(Number(f?.totale) || 0)
          patchPerId[rf.id] = {
            stato: 'pagata',
            data_pagamento: a.movimento.data,
            importo_pagato: totale,
            metodo_pagamento: 'bonifico',
          }
        }
      }
      const ids = Object.keys(patchPerId)
      let fatti = 0
      const LOTTO = 20
      for (let i = 0; i < ids.length; i += LOTTO) {
        const lotto = ids.slice(i, i + LOTTO)
        const esiti = await Promise.all(lotto.map(async (id) => {
          const { error } = await supabase.from('fatture').update(patchPerId[id]).eq('id', id)
          return error ? null : id
        }))
        fatti += esiti.filter(Boolean).length
      }
      setFatture(prev => prev.map(x => patchPerId[x.id] ? { ...x, ...patchPerId[x.id] } : x))
      // In prima nota UNA riga per movimento bancario: il bonifico è uno,
      // anche quando copre cinque fatture.
      let inCassa = 0
      if (registraInCassa) {
        const righe = scelti.map(a => ({
          data: a.movimento.data,
          importo: a.movimento.importo,
          descrizione: a.fatture.length === 1
            ? `${a.fatture[0].fornitore}${a.fatture[0].numero_rif ? ` · fatt. ${a.fatture[0].numero_rif}` : ''}`
            : `${a.fatture[0].fornitore} · ${a.fatture.length} fatture`,
          fornitore: a.fatture[0].fornitore,
          documento: 'fattura',
        }))
        if (righe.length && await registraUscitaCassa(righe)) inCassa = righe.length
      }
      setBanca(null)
      const coda = inCassa > 0 ? ` · ${inCassa} ${inCassa === 1 ? 'uscita registrata' : 'uscite registrate'} in Cassa` : ''
      if (fatti === ids.length) {
        notify(`${fatti} ${fatti === 1 ? 'fattura segnata' : 'fatture segnate'} come pagate dall'estratto conto${coda}`)
      } else {
        notify(`Segnate ${fatti} di ${ids.length}: sulle altre il salvataggio non è riuscito, riprova.${coda}`, false)
      }
    } catch (e) {
      console.error('[scadenzario] applicaAbbinamenti', e)
      notify('Non ho potuto applicare gli abbinamenti: controlla la connessione e riprova.', false)
    } finally {
      setBancaSaving(false)
    }
  }

  // Cosa si fa DOPO aver inserito le fatture, e vale per tutte e tre le
  // strade di import (Excel, XML, FatturaSMART).
  //
  // 1. L'IBAN trovato nel documento si salva sul FORNITORE. La fattura
  //    elettronica lo porta nel blocco DatiPagamento quando il fornitore lo
  //    mette: ogni IBAN trovato è un IBAN che non devi scrivere a mano, e
  //    sblocca il bonifico per tutte le sue fatture, anche quelle future.
  //    (Nei file di Mara quel blocco non c'era: 0 su 3.520. Ma i prossimi
  //    fornitori lo metteranno, e da oggi lo raccogliamo.)
  //
  // 2. I FORNITORI NUOVI si dicono. Il momento giusto per aggiungere IBAN e
  //    termini è adesso, mentre hai il documento in mano — non sei mesi dopo
  //    quando il bonifico non parte e non ti ricordi chi sono.
  async function dopoImport(recordsInseriti) {
    const nuoviIban = []
    const nomiVisti = new Set()
    const nomiNuovi = []
    for (const r of (recordsInseriti || [])) {
      const nome = String(r?.fornitore || '').trim()
      if (!nome) continue
      const k = normNome(nome)
      if (!nomiVisti.has(k)) {
        nomiVisti.add(k)
        const anag = fornitoriMap[k]
        if (!anag) nomiNuovi.push(nome)
        const ibanDoc = String(r?.iban || '').replace(/\s+/g, '').toUpperCase()
        // Solo se il fornitore non ce l'ha già e l'IBAN del documento è valido:
        // un IBAN sbagliato scritto in anagrafica è peggio di nessun IBAN,
        // perché il file dei bonifici lo scarta in silenzio.
        if (ibanDoc && ibanIsValid(ibanDoc) && !anag?.iban) {
          nuoviIban.push({ nome, iban: ibanDoc })
        }
      }
    }
    for (const v of nuoviIban) {
      try { await salvaFornitore(v.nome, { iban: v.iban }) } catch { /* lo dice il riepilogo */ }
    }
    if (nuoviIban.length > 0) {
      notify(`${nuoviIban.length} ${nuoviIban.length === 1 ? 'IBAN preso' : 'IBAN presi'} dalle fatture e ${nuoviIban.length === 1 ? 'salvato' : 'salvati'} in anagrafica: ${nuoviIban.slice(0, 3).map(v => v.nome).join(', ')}${nuoviIban.length > 3 ? '…' : ''}`)
    }
    if (nomiNuovi.length > 0) {
      notify(`${nomiNuovi.length} ${nomiNuovi.length === 1 ? 'fornitore nuovo' : 'fornitori nuovi'}: ${nomiNuovi.slice(0, 4).join(', ')}${nomiNuovi.length > 4 ? ` e altri ${nomiNuovi.length - 4}` : ''}. Aggiungi IBAN e termini dalla vista Per fornitore, così il bonifico parte e le scadenze sono quelle vere.`, true)
    }
    try { await loadFornitori() } catch { /* niente */ }
  }

  // Apre la conferma invece di importare subito. Il file resta in mano
  // nostra: si scrive solo dopo che qualcuno ha detto dove.
  function chiediSede(files, avvia) {
    setSediScelte(sedeId ? [sedeId] : [])
    setConfermaSede({ files, avvia })
  }

  async function handleImportExcel(files, sediDestinazione = null) {
    if (!orgId) return
    const dest = Array.isArray(sediDestinazione) ? sediDestinazione.filter(Boolean) : (sedeId ? [sedeId] : [])
    setImportLoading(true)
    let imported = 0, scartati = 0
    const inseriti = []
    // Le chiavi vengono dal DATABASE, non dalla lista in pagina: quella è
    // filtrata per sede e, da oggi, non contiene tutte le pagate. Con le
    // chiavi parziali un doppione di un'altra sede (o di una fattura vecchia
    // non caricata) passava il controllo ed entrava due volte.
    const seen = await chiaviFattureEsistenti(supabase, orgId)
    for (const file of Array.from(files || [])) {
      try {
        const records = await parseFatturaSMART(file)
        if (!records.length) { notify('Nessuna fattura trovata nel file', false); continue }
        const { nuovi, scartati: sc } = dedupFatture(records, seen)
        scartati += sc
        // Una sede sola: la fattura è sua. Due o più: è una spesa
        // condivisa, e `sede_id` resta vuoto apposta — l'attribuzione la fa
        // la ripartizione sui chili prodotti, non un'assegnazione a caso.
        const unaSola = dest.length === 1 ? dest[0] : null
        const toInsert = nuovi.map(r => ({
          ...pickFattura(r, orgId, unaSola),
          ...(dest.length > 1 ? { sedi_condivise: dest } : null),
        }))
        await insertFattureResilient(supabase, toInsert)
        // I record ORIGINALI (non quelli ripuliti): pickFattura tiene solo le
        // colonne della tabella, e l'IBAN del documento ci serve qui.
        inseriti.push(...nuovi)
        imported += nuovi.length
      } catch (e) {
        const msg = e?.message || (typeof e === 'string' ? e : '') || 'errore sconosciuto'
        notify('Errore import ' + file.name + ': ' + msg, false)
      }
    }
    if (imported > 0) {
      notify(`${imported} fatture importate${scartati > 0 ? ` · ${scartati} già presenti, saltate` : ''}`)
      try { await loadFatture() } catch { /* il toast di esito è già stato mostrato */ }
      try { await dopoImport(inseriti) } catch (e) { console.error('[scadenzario] dopoImport', e) }
    } else if (scartati > 0) {
      notify(`${scartati} fatture erano già presenti - nessun duplicato aggiunto`, false)
    }
    setImportLoading(false)
  }

  async function handleImportXML(files, sediDestinazione = null) {
    if (!orgId) return
    const dest = Array.isArray(sediDestinazione) ? sediDestinazione.filter(Boolean) : (sedeId ? [sedeId] : [])
    setImportLoading(true)
    let imported = 0, scartati = 0
    const inseriti = []
    // Le chiavi vengono dal DATABASE, non dalla lista in pagina: quella è
    // filtrata per sede e, da oggi, non contiene tutte le pagate. Con le
    // chiavi parziali un doppione di un'altra sede (o di una fattura vecchia
    // non caricata) passava il controllo ed entrava due volte.
    const seen = await chiaviFattureEsistenti(supabase, orgId)
    for (const file of Array.from(files || [])) {
      try {
        const text = await file.text()
        const records = parseFatturaXML(text)
        if (!records.length) { notify('Nessuna fattura trovata nel file XML', false); continue }
        const { nuovi, scartati: sc } = dedupFatture(records, seen)
        scartati += sc
        // Una sede sola: la fattura è sua. Due o più: è una spesa
        // condivisa, e `sede_id` resta vuoto apposta — l'attribuzione la fa
        // la ripartizione sui chili prodotti, non un'assegnazione a caso.
        const unaSola = dest.length === 1 ? dest[0] : null
        const toInsert = nuovi.map(r => ({
          ...pickFattura(r, orgId, unaSola),
          ...(dest.length > 1 ? { sedi_condivise: dest } : null),
        }))
        await insertFattureResilient(supabase, toInsert)
        // I record ORIGINALI (non quelli ripuliti): pickFattura tiene solo le
        // colonne della tabella, e l'IBAN del documento ci serve qui.
        inseriti.push(...nuovi)
        imported += nuovi.length
      } catch (e) {
        notify('Errore import XML ' + file.name + ': ' + (e?.message || 'sconosciuto'), false)
      }
    }
    if (imported > 0) {
      notify(`${imported} fatture XML importate${scartati > 0 ? ` · ${scartati} già presenti, saltate` : ''}`)
      try { await loadFatture() } catch { /* il toast di esito è già stato mostrato */ }
      try { await dopoImport(inseriti) } catch (e) { console.error('[scadenzario] dopoImport', e) }
    } else if (scartati > 0) {
      notify(`${scartati} fatture erano già presenti - nessun duplicato aggiunto`, false)
    }
    setImportLoading(false)
  }

  async function handleImportSMART(files, sediDestinazione = null) {
    if (!orgId) return
    const dest = Array.isArray(sediDestinazione) ? sediDestinazione.filter(Boolean) : (sedeId ? [sedeId] : [])
    setImportLoading(true)
    let imported = 0, scartati = 0
    const inseriti = []
    // Le chiavi vengono dal DATABASE, non dalla lista in pagina: quella è
    // filtrata per sede e, da oggi, non contiene tutte le pagate. Con le
    // chiavi parziali un doppione di un'altra sede (o di una fattura vecchia
    // non caricata) passava il controllo ed entrava due volte.
    const seen = await chiaviFattureEsistenti(supabase, orgId)
    for (const file of Array.from(files || [])) {
      try {
        const records = await parseFatturaSMART(file)
        if (!records.length) { notify('Nessuna fattura trovata nel file FatturaSMART', false); continue }
        const { nuovi, scartati: sc } = dedupFatture(records, seen)
        scartati += sc
        // Una sede sola: la fattura è sua. Due o più: è una spesa
        // condivisa, e `sede_id` resta vuoto apposta — l'attribuzione la fa
        // la ripartizione sui chili prodotti, non un'assegnazione a caso.
        const unaSola = dest.length === 1 ? dest[0] : null
        const toInsert = nuovi.map(r => ({
          ...pickFattura(r, orgId, unaSola),
          ...(dest.length > 1 ? { sedi_condivise: dest } : null),
        }))
        await insertFattureResilient(supabase, toInsert)
        // I record ORIGINALI (non quelli ripuliti): pickFattura tiene solo le
        // colonne della tabella, e l'IBAN del documento ci serve qui.
        inseriti.push(...nuovi)
        imported += nuovi.length
      } catch (e) {
        notify('Errore import FatturaSMART ' + file.name + ': ' + (e?.message || 'sconosciuto'), false)
      }
    }
    if (imported > 0) {
      notify(`${imported} fatture FatturaSMART importate${scartati > 0 ? ` · ${scartati} già presenti, saltate` : ''}`)
      try { await loadFatture() } catch { /* il toast di esito è già stato mostrato */ }
      try { await dopoImport(inseriti) } catch (e) { console.error('[scadenzario] dopoImport', e) }
    } else if (scartati > 0) {
      notify(`${scartati} fatture erano già presenti - nessun duplicato aggiunto`, false)
    }
    setImportLoading(false)
  }

  // Registra in prima nota le uscite dei pagamenti appena segnati.
  //
  // PERCHE': segnare pagata una fattura NON scriveva niente in Cassa, e la
  // Cassa è la sola pagina che sa quanti soldi sono usciti davvero (il conto
  // economico legge le uscite da lì). Il ciclo passivo finiva nello
  // scadenzario e non arrivava mai al conto: si pagavano i fornitori e in
  // Cassa non compariva un euro.
  //
  // Le righe portano `origine: 'fattura-pagata'`, così si distinguono da
  // quelle scritte a mano e da quelle importate dal registro: se un domani
  // servirà rifarle, si sa quali sono.
  async function registraUscitaCassa(righe) {
    if (!orgId || !Array.isArray(righe) || righe.length === 0) return false
    try {
      const n = await aggiungiMovimentiInBlocco(
        orgId,
        righe.map(r => ({ ...r, sede_id: sedeId || null, categoria: 'Fornitori' })),
        ORIGINE_FATTURA,
      )
      return n > 0
    } catch (e) {
      console.error('[scadenzario] uscita in prima nota', e)
      notify('Fattura segnata pagata, ma non ho potuto registrare l\'uscita in Cassa: aggiungila a mano dalla prima nota.', false)
      return false
    }
  }

  // Segna pagata o registra un ACCONTO. Se l'importo inserito copre il residuo
  // → saldata; altrimenti aggiorna solo importo_pagato (pagamento parziale).
  // Salva anche il metodo. Resiliente: se le colonne nuove non esistono, ripiega
  // sul semplice stato=pagata.
  async function segnaComePagata(id) {
    const f = fatture.find(x => x.id === id)
    const totale = Math.abs(Number(f?.totale) || 0)
    const giaPagato = Number(f?.importo_pagato) || 0
    const importoInput = pagImporto !== ''
      ? Math.max(0, Number(String(pagImporto).replace(',', '.')) || 0)
      : Math.max(0, totale - giaPagato)
    const nuovoPagato = Math.round((giaPagato + importoInput) * 100) / 100
    const saldata = nuovoPagato >= totale - 0.01
    const patch = saldata
      ? { stato: 'pagata', data_pagamento: dataPag, importo_pagato: totale, metodo_pagamento: pagMetodo }
      : { importo_pagato: nuovoPagato, metodo_pagamento: pagMetodo }
    try {
      let applied = patch
      let { error } = await supabase.from('fatture').update(patch).eq('id', id)
      if (error && /does not exist|schema cache|could not find|PGRST204/i.test(error.message || '')) {
        applied = { stato: 'pagata', data_pagamento: dataPag } // fallback pre-migration
        error = (await supabase.from('fatture').update(applied).eq('id', id)).error
      }
      if (error) throw error
      setFatture(prev => prev.map(x => x.id === id ? { ...x, ...applied } : x))
      setPagandoId(null); setPagImporto('')
      // Pagare una fattura è un'uscita di soldi veri: se non finisce in prima
      // nota, la Cassa e il conto economico non la vedono mai. Prima
      // succedeva esattamente questo — il ciclo passivo si fermava qui.
      // Non lo facciamo di nascosto: dipende dalla spunta "registra anche
      // l'uscita in Cassa", accesa per default e ricordata.
      let inCassa = false
      if (registraInCassa && importoInput > 0) {
        inCassa = await registraUscitaCassa([{
          data: dataPag,
          importo: importoInput,
          descrizione: `${f?.fornitore || 'Fornitore'}${f?.numero_rif ? ` · fatt. ${f.numero_rif}` : ''}`,
          fornitore: f?.fornitore || null,
          documento: 'fattura',
        }])
      }
      notify((saldata || applied.stato === 'pagata'
        ? 'Fattura saldata'
        : `Acconto registrato (${fmtEuro(importoInput)}) · residuo ${fmtEuro(totale - nuovoPagato)}`)
        + (inCassa ? ' · uscita registrata in Cassa' : ''))
    } catch (e) {
      notify('Errore: ' + (e?.message || 'aggiornamento fallito'), false)
    }
  }

  // Assegna un punto vendita alle fatture che non ce l'hanno.
  //
  // A lotti e con l'esito vero: su 142 righe, dire "fatto" quando ne sono
  // passate 100 sarebbe la stessa bugia che abbiamo corretto altrove.
  async function assegnaSede(items, nuovaSedeId) {
    if (!nuovaSedeId || !items?.length) return
    setSedeSaving(true)
    try {
      const ids = items.map(f => f.id)
      let fatti = 0
      const LOTTO = 100
      for (let i = 0; i < ids.length; i += LOTTO) {
        const lotto = ids.slice(i, i + LOTTO)
        const { error } = await supabase.from('fatture')
          .update({ sede_id: nuovaSedeId }).in('id', lotto).eq('organization_id', orgId)
        if (!error) fatti += lotto.length
        else console.error('[scadenzario] assegnaSede', error)
      }
      const nomeSede = (sedi || []).find(x => x.id === nuovaSedeId)?.nome || 'quel punto vendita'
      if (fatti === ids.length) {
        notify(`${fatti} ${fatti === 1 ? 'fattura assegnata' : 'fatture assegnate'} a ${nomeSede}`)
      } else {
        notify(`Assegnate ${fatti} di ${ids.length}: sulle altre il salvataggio non è riuscito, riprova.`, false)
      }
      await loadFatture()
    } catch (e) {
      console.error('[scadenzario] assegnaSede', e)
      notify('Non ho potuto assegnare il punto vendita: controlla la connessione e riprova.', false)
    } finally {
      setSedeSaving(false)
    }
  }

  // Copia negli appunti l'estratto conto di un fornitore, pronto da mandare
  // su WhatsApp o per mail.
  //
  // PERCHE': con 99 fatture aperte con lo stesso fornitore, prima o poi vi
  // dovete allineare. Finora l'unica strada era leggere i numeri al telefono
  // o rifare l'elenco a mano.
  async function copiaEstrattoConto(gruppo) {
    const testo = testoEstrattoConto(gruppo.nome, gruppo.items, {
      nomeAzienda: azienda.nome || '',
      oggiIso: dataPag,
    })
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(testo)
        notify(`Estratto conto di ${gruppo.nome} copiato: incollalo nel messaggio al fornitore.`)
        return
      }
    } catch { /* si prova il ripiego */ }
    try {
      const ta = document.createElement('textarea')
      ta.value = testo
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus(); ta.select(); ta.setSelectionRange(0, testo.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      notify(ok
        ? `Estratto conto di ${gruppo.nome} copiato: incollalo nel messaggio al fornitore.`
        : 'Copia non riuscita: apri il fornitore e leggi le fatture dall\'elenco.', ok)
    } catch {
      notify('Copia non supportata da questo browser.', false)
    }
  }

  // Applica il piano di imputazione di un pagamento cumulativo.
  //
  // Il piano arriva già calcolato da imputaPagamento (che è puro e testato) e
  // viene mostrato all'utente PRIMA: su 99 fatture un'imputazione sbagliata
  // non si disfa a mano.
  async function applicaPagamentoCumulativo(piano, dataIso, fornitoreNome) {
    const daScrivere = piano.righe.filter(r => r.imputato !== 0)
    if (!daScrivere.length) return
    setPagCumSaving(true)
    try {
      const fatte = []
      const LOTTO = 20
      for (let i = 0; i < daScrivere.length; i += LOTTO) {
        const lotto = daScrivere.slice(i, i + LOTTO)
        const esiti = await Promise.all(lotto.map(async (r) => {
          const f = fatture.find(x => x.id === r.id)
          const totale = Math.abs(Number(f?.totale) || 0)
          // Una nota di credito usata si chiude per intero; una fattura
          // saldata pure; una parziale porta l'acconto nuovo.
          const patch = r.saldata
            ? { stato: 'pagata', data_pagamento: dataIso, importo_pagato: totale, metodo_pagamento: 'bonifico' }
            : { importo_pagato: Math.round((totale - r.residuoDopo) * 100) / 100, metodo_pagamento: 'bonifico' }
          const { error } = await supabase.from('fatture').update(patch).eq('id', r.id)
          return error ? null : { id: r.id, patch }
        }))
        for (const e of esiti) if (e) fatte.push(e)
      }
      if (fatte.length) {
        const perId = Object.fromEntries(fatte.map(e => [e.id, e.patch]))
        setFatture(prev => prev.map(x => perId[x.id] ? { ...x, ...perId[x.id] } : x))
      }
      // L'uscita in Cassa è UNA, non una per fattura: il bonifico è uno.
      let inCassa = false
      if (registraInCassa && piano.usato > 0) {
        inCassa = await registraUscitaCassa([{
          data: dataIso,
          importo: piano.usato,
          descrizione: `${fornitoreNome} · ${piano.chiuse + piano.parziali} fatture`,
          fornitore: fornitoreNome,
          documento: 'fattura',
        }])
      }
      setPagCum(null)
      const parti = []
      if (piano.chiuse > 0) parti.push(`${piano.chiuse} ${piano.chiuse === 1 ? 'fattura chiusa' : 'fatture chiuse'}`)
      if (piano.parziali > 0) parti.push(`${piano.parziali} con acconto`)
      if (piano.creditiUsati > 0) parti.push(`${fmtEuro(piano.creditiUsati)} di note di credito usate`)
      if (inCassa) parti.push('uscita registrata in Cassa')
      if (fatte.length < daScrivere.length) {
        notify(`Applicate ${fatte.length} righe di ${daScrivere.length}: sulle altre il salvataggio non è riuscito, riprova.`, false)
      } else {
        notify(parti.join(' · ') || 'Pagamento registrato')
      }
    } catch (e) {
      console.error('[scadenzario] pagamento cumulativo', e)
      notify('Non ho potuto registrare il pagamento: controlla la connessione e riprova.', false)
    } finally {
      setPagCumSaving(false)
    }
  }

  // Segna pagate più fatture in una volta.
  //
  // Audit 2026-09-09: l'unico modo di segnare pagata una fattura era una alla
  // volta, e Mara ne ha 211 scadute: 211 clic, ognuno con il popup da aprire e
  // confermare. Chi paga il bonifico cumulativo a un fornitore ha appena
  // saldato dieci fatture insieme, e registrarle una per una è lavoro che
  // nessuno fa — quindi lo scadenziario resta indietro e smette di servire.
  // La data è una sola: il giorno in cui il bonifico è partito.
  async function segnaPagateInBlocco(items, dataIso) {
    const daFare = (items || []).filter(f => f.stato !== 'pagata')
    if (!daFare.length) return
    setBloccoLoading(true)
    try {
      // Un update per fattura: l'importo pagato va portato al totale di
      // ciascuna, quindi un update unico non saprebbe cosa scrivere. A lotti,
      // per non aprire 211 richieste tutte insieme.
      const fatte = []
      const LOTTO = 20
      for (let i = 0; i < daFare.length; i += LOTTO) {
        const lotto = daFare.slice(i, i + LOTTO)
        const esiti = await Promise.all(lotto.map(async (f) => {
          const totale = Math.abs(Number(f.totale) || 0)
          const patch = { stato: 'pagata', data_pagamento: dataIso, importo_pagato: totale }
          const { error } = await supabase.from('fatture').update(patch).eq('id', f.id)
          return error ? null : { id: f.id, patch }
        }))
        for (const e of esiti) if (e) fatte.push(e)
      }
      if (fatte.length) {
        const perId = Object.fromEntries(fatte.map(e => [e.id, e.patch]))
        setFatture(prev => prev.map(x => perId[x.id] ? { ...x, ...perId[x.id] } : x))
      }
      setBloccoConf(null)
      // Le uscite in prima nota: una riga per fattura pagata, così in Cassa si
      // ritrova il pagamento con il nome del fornitore e il numero del
      // documento, invece di un totale muto.
      let inCassa = 0
      if (registraInCassa && fatte.length) {
        const perIdF = Object.fromEntries(daFare.map(f => [f.id, f]))
        const righe = fatte.map(e => {
          const f = perIdF[e.id]
          const importo = Math.abs(Number(f?.totale) || 0) - (Number(f?.importo_pagato) || 0)
          return {
            data: dataIso,
            importo: Math.max(0, Math.round(importo * 100) / 100),
            descrizione: `${f?.fornitore || 'Fornitore'}${f?.numero_rif ? ` · fatt. ${f.numero_rif}` : ''}`,
            fornitore: f?.fornitore || null,
            documento: 'fattura',
          }
        }).filter(r => r.importo > 0)
        if (righe.length && await registraUscitaCassa(righe)) inCassa = righe.length
      }
      // Se qualcuna non passa va detto: il numero a schermo dopo l'operazione
      // deve corrispondere a quello che è successo davvero.
      const codaCassa = inCassa > 0 ? ` · ${inCassa} ${inCassa === 1 ? 'uscita registrata' : 'uscite registrate'} in Cassa` : ''
      if (fatte.length === daFare.length) {
        notify(`${fatte.length} ${fatte.length === 1 ? 'fattura segnata' : 'fatture segnate'} come pagate${codaCassa}`)
      } else {
        notify(`Segnate ${fatte.length} di ${daFare.length}: sulle altre il salvataggio non è riuscito, riprova.${codaCassa}`, false)
      }
    } catch (e) {
      notify('Errore: ' + (e?.message || 'aggiornamento fallito'), false)
    } finally {
      setBloccoLoading(false)
    }
  }
  // ── Bonifico ────────────────────────────────────────────────────────────────
  // Genera e scarica il file SEPA pain.001 con le fatture selezionate.
  function generaBonificoSEPA(items) {
    if (!ibanIsValid(azienda.iban)) {
      setEditAzienda(true)
      notify('Inserisci prima l’IBAN dell’azienda (in alto) per generare il bonifico.', false)
      return
    }
    const payments = items.map(f => ({
      id: f.id,
      beneficiario: f.fornitore,
      iban: f.iban,
      importo: Math.abs(f.residuo || f.totale || 0),
      causale: causaleFattura(f),
    }))
    try {
      const today = new Date()
      const exec = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const { xml, included, skipped, totale } = generateSepaXml({ debtor: azienda, payments, executionDate: exec })
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bonifico_sepa_${exec}.xml`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      notify(`Bonifico SEPA pronto: ${included.length} pagamenti · ${fmtEuro(totale)}${skipped.length ? ` · ${skipped.length} saltati (IBAN mancante)` : ''} - caricalo nell'home banking`)
    } catch (e) {
      notify('Bonifico non generato: ' + (e?.message || 'errore') + (e?.skipped?.length ? ` (${e.skipped.length} senza IBAN)` : ''), false)
    }
  }

  // Copia i dati del bonifico della singola fattura negli appunti.
  async function copiaBonifico(f) {
    const txt = bonificoText({ beneficiario: f.fornitore, iban: f.iban, importo: Math.abs(f.residuo || f.totale || 0), causale: causaleFattura(f) })
    try {
      await navigator.clipboard.writeText(txt)
      notify('Dati bonifico copiati')
    } catch {
      notify('Copia non riuscita - IBAN: ' + (normalizeIban(f.iban) || 'n/d'), false)
    }
  }

  const toggleSelez = (id) => setSelez(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  function chiediElimina(id) {
    setEliminandoId(id)
    setPagandoId(null)
  }

  async function eliminaFattura(id) {
    try {
      const { error } = await supabase.from('fatture').delete().eq('id', id)
      if (error) throw error
      setFatture(prev => prev.filter(f => f.id !== id))
      setEliminandoId(null)
      notify('Fattura eliminata')
    } catch (e) {
      notify('Errore: ' + (e?.message || 'eliminazione fallita'), false)
    }
  }

  // Elimina in blocco TUTTE le fatture attualmente caricate (rispetta lo scope
  // sede corrente). Protetta da doppia conferma: modale + frase "ELIMINA".
  async function eliminaTutte() {
    if (bulkConfirm.trim().toUpperCase() !== 'ELIMINA') return
    setBulkDeleting(true)
    try {
      const ids = fatture.map(f => f.id).filter(Boolean)
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from('fatture').delete().in('id', ids.slice(i, i + 200))
        if (error) throw error
      }
      const n = ids.length
      setFatture([])
      setBulkOpen(false)
      setBulkConfirm('')
      notify(`Eliminate ${n} ${n === 1 ? 'fattura' : 'fatture'}`)
    } catch (e) {
      notify('Errore eliminazione: ' + (e?.message || 'riprova'), false)
    } finally {
      setBulkDeleting(false)
    }
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  const fattureExt = useMemo(
    () => arricchisci(fatture, fornitoriMap, new Date()).map(f => ({ ...f, ibanValido: ibanIsValid(f.iban) })),
    [fatture, fornitoriMap]
  )
  const gruppi = useMemo(() => perUrgenza(fattureExt), [fattureExt])
  const summary = useMemo(() => riepilogo(gruppi), [gruppi])

  // Termini di pagamento IMPARATI da come hai pagato finora, per fornitore.
  // Nei dati veri nessuna fattura porta la scadenza, quindi la pagina le
  // calcola tutte a 30 giorni: ma ogni fornitore ha le sue condizioni, e si
  // vedono dalle date di pagamento già registrate. Serve lo storico
  // completo: sulle sole fatture aperte non c'è nessun pagamento da guardare.
  const terminiImparati = useMemo(() => {
    const perFornitore = {}
    for (const f of fatture) {
      const k = normNome(f.fornitore)
      if (!k) continue
      if (!perFornitore[k]) perFornitore[k] = []
      perFornitore[k].push(f)
    }
    const out = {}
    for (const [k, lista] of Object.entries(perFornitore)) {
      const t = terminiOsservati(lista)
      if (t) out[k] = t
    }
    return out
  }, [fatture])

  // Fatture fuori scala rispetto alla storia del loro fornitore.
  const anomale = useMemo(() => fattureAnomale(fatture), [fatture])

  // Canoni e bollette: una al mese, importi simili. Non hanno bisogno dello
  // stesso controllo di una fornitura di merce.
  const fisseMensili = useMemo(() => ricorrenti(fatture), [fatture])

  // Le fatture scadute da tanto: quelle che quasi sempre sono già state
  // pagate e mai segnate come tali.
  //
  // PERCHE' SERVE UNO STRUMENTO: l'importazione porta dentro TUTTI i
  // documenti come "da pagare", anche quelli di due anni fa. Sui dati veri
  // erano 2.126 fatture per 1,13 milioni che risultavano debito, e l'unico
  // modo di sistemarle era una alla volta, oppure "Segna pagate" su un gruppo
  // che mescola le vecchie con quelle di ieri. Nessuno lo fa a mano: quindi
  // lo scadenzario resta gonfio e smette di dire la verità.
  const VECCHIE_GIORNI = 180
  const vecchieDaSistemare = useMemo(() => {
    const limite = new Date()
    limite.setDate(limite.getDate() - VECCHIE_GIORNI)
    const limiteIso = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`
    const items = fattureExt.filter(f =>
      f.stato !== 'pagata' && !f.isNC && f.dueIso && f.dueIso < limiteIso)
    return { items, n: items.length, totale: items.reduce((s, f) => s + Math.abs(f.residuo || 0), 0) }
  }, [fattureExt])

  // Fatture senza punto vendita.
  //
  // PERCHE' CONTA: il Confronto sedi raggruppa per sede, quindi una fattura
  // con la sede vuota non entra nel conto di nessun negozio — resta visibile
  // qui (il filtro tiene anche le condivise) e invisibile là. Nei dati veri
  // sono 142 fatture, tutte aperte.
  const senzaSede = useMemo(() => {
    if (!Array.isArray(sedi) || sedi.filter(x => x?.attiva !== false).length < 2) return { items: [], n: 0, totale: 0 }
    const items = fattureExt.filter(f => !f.sede_id && f.stato !== 'pagata')
    return { items, n: items.length, totale: items.reduce((sm, f) => sm + Math.abs(f.residuo || 0), 0) }
  }, [fattureExt, sedi])

  // Fornitori a cui devi dei soldi e di cui NON hai l'IBAN.
  //
  // PERCHE' È IL PRIMO PROBLEMA DI QUESTA PAGINA: il bonifico SEPA è la
  // funzione che dovrebbe far risparmiare più tempo di tutte, e sui dati veri
  // non può partire per nessuna fattura — 0 documenti su 3.520 portano un
  // IBAN, e in anagrafica ce l'ha 1 fornitore su 615. Le caselle di spunta
  // ci sono, il pulsante c'è, e non succede niente: la barra del bonifico
  // compare solo se almeno una fattura ha un IBAN valido, quindi non compare
  // mai e nessuno capisce perché.
  // Ora la pagina lo dice, e mette in cima i fornitori che pesano di più:
  // scrivere cinque IBAN sblocca la maggior parte dell'importo.
  const senzaIban = useMemo(() => {
    const map = {}
    for (const f of fattureExt) {
      if (f.stato === 'pagata' || f.isNC) continue
      if (f.ibanValido) continue
      const k = normNome(f.fornitore)
      if (!k) continue
      if (!map[k]) map[k] = { nome_norm: k, nome: f.fornitore, tot: 0, n: 0 }
      map[k].tot += Math.abs(f.residuo || 0)
      map[k].n++
    }
    const righe = Object.values(map).sort((a, b) => b.tot - a.tot)
    return {
      righe,
      n: righe.length,
      totale: righe.reduce((s, r) => s + r.tot, 0),
    }
  }, [fattureExt])

  const gruppiVisibili = useMemo(() => {
    return (FILTRI.find(x => x.id === filtro) || FILTRI[0]).gruppi
  }, [filtro])

  // La ricerca guarda il fornitore, il numero, la DATA e l'IMPORTO.
  // Prima solo i primi due: con 1.387 fatture aperte, cercare "1.240" o
  // "marzo" non trovava niente, e per una fattura di cui si ricorda la cifra
  // — il caso più frequente quando arriva un sollecito — non c'era strada.
  const matchSearch = (f) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    if ((f.fornitore || '').toLowerCase().includes(q)) return true
    if ((f.numero_rif || '').toLowerCase().includes(q)) return true
    // Date: sia come le scrive il database (2026-04-08) sia all'italiana
    // (08/04/2026), e anche solo l'anno o il mese.
    const iso = String(f.data_fattura || '')
    if (iso.includes(q)) return true
    if (iso && iso.split('-').reverse().join('/').includes(q)) return true
    if (String(f.dueIso || '').includes(q)) return true
    // Importo: con la virgola e col punto, e anche col punto delle migliaia.
    const qNum = q.replace(/\./g, '').replace(',', '.')
    if (qNum && /^[0-9.]+$/.test(qNum)) {
      const tot = Math.abs(Number(f.totale) || 0)
      if (String(tot).startsWith(qNum) || String(Math.round(tot)).startsWith(qNum)) return true
    }
    return false
  }

  // Audit 2026-09-09: due difetti in tre righe.
  //  1. la ricerca non era applicata qui. Cercando un fornitore che non esiste,
  //     le righe a schermo diventavano zero ma `n` restava > 0, quindi il ramo
  //     "Nessuna fattura per questo filtro" non scattava: pagina bianca senza
  //     una parola, e i contatori in cima continuavano a dire "70 fatture ·
  //     9.415 €" come se ci fosse qualcosa.
  //  2. il totale sommava `f.totale`, cioè il LORDO, mentre le card KPI in
  //     cima usano il residuo (netto degli acconti e delle note di credito):
  //     due numeri diversi per la stessa cosa nella stessa schermata.
  const totaliFiltrati = useMemo(() => {
    const items = gruppiVisibili.flatMap(k => gruppi[k] || []).filter(matchSearch)
    return {
      n: items.length,
      tot: items.reduce((s, f) => s + (Number(f.residuo) || 0), 0),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gruppi, gruppiVisibili, search])

  // Match ricerca (fornitore o numero documento)
  // ── Rollup per fornitore (solo aperte, netto NC) ─────────────────────────────
  const rollupFornitori = useMemo(() => {
    const map = {}
    for (const f of fattureExt) {
      if (f.stato === 'pagata') continue
      if (!matchSearch(f)) continue
      const key = normNome(f.fornitore)
      if (!map[key]) {
        const anag = fornitoriMap[key]
        map[key] = {
          nome: f.fornitore, nome_norm: key, n: 0, nFatt: 0, nNC: 0,
          totale: 0, scaduto: 0, iban: f.iban || anag?.iban || '',
          termini: anag?.termini_pagamento ?? null, terminiTipo: anag?.termini_tipo || 'netti', categoria: anag?.categoria || '',
          anyScaduta: false, items: [],
        }
      }
      const g = map[key]
      g.n++
      if (f.isNC) g.nNC++; else g.nFatt++
      g.totale += f.residuo
      if (f.urgenza === 'scaduta') { g.scaduto += f.residuo; g.anyScaduta = true }
      if (!g.iban && f.iban) g.iban = f.iban
      g.items.push(f)
    }
    return Object.values(map).sort((a, b) => b.totale - a.totale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fattureExt, fornitoriMap, search])

  // Mappa di TUTTE le fatture per fornitore (incluse le pagate). Usato per
  // il dropdown espandibile: il rollup principale mostra solo gli aperti,
  // qui consentiamo anche di vedere lo storico pagamenti.
  const tutteFatturePerFornitore = useMemo(() => {
    const map = {}
    for (const f of fattureExt) {
      const key = normNome(f.fornitore)
      if (!map[key]) map[key] = []
      map[key].push(f)
    }
    // Ordina dal più recente (data_fattura desc) al più vecchio.
    for (const arr of Object.values(map)) {
      arr.sort((a, b) => (b.data_fattura || '').localeCompare(a.data_fattura || ''))
    }
    return map
  }, [fattureExt])

  // ── Cassa in uscita: bucket per settimana (forward) ──────────────────────────
  const cashflow = useMemo(() => {
    const scaduto = { label: 'Scaduto', tot: 0, n: 0, scaduto: true }
    const buckets = []
    for (let w = 0; w < 8; w++) buckets.push({ label: w === 0 ? 'Questa sett.' : `+${w} sett.`, tot: 0, n: 0 })
    const oltre = { label: 'Oltre', tot: 0, n: 0 }
    // Ogni settimana si porta dietro A CHI si paga, non solo quanto: la
    // domanda della mattina è "questa settimana chi devo pagare", e un
    // importo da solo non ci risponde.
    for (const b of [scaduto, ...buckets, oltre]) b.perFornitore = {}
    const conta = (b, f) => {
      const k = String(f.fornitore || '—').trim()
      b.perFornitore[k] = (b.perFornitore[k] || 0) + f.residuo
    }
    for (const f of fattureExt) {
      if (f.stato === 'pagata') continue
      const amt = f.residuo
      if (f.dueDays == null) { oltre.tot += amt; oltre.n++; conta(oltre, f); continue }
      if (f.dueDays < 0) { scaduto.tot += amt; scaduto.n++; conta(scaduto, f); continue }
      const w = Math.floor(f.dueDays / 7)
      if (w < 8) { buckets[w].tot += amt; buckets[w].n++; conta(buckets[w], f) }
      else { oltre.tot += amt; oltre.n++; conta(oltre, f) }
    }
    const all = [scaduto, ...buckets, oltre]
    const max = Math.max(1, ...all.map(b => Math.abs(b.tot)))
    let cum = 0
    return all.map(b => {
      cum += b.tot
      const top = Object.entries(b.perFornitore)
        .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
        .slice(0, 5)
        .map(([nome, tot]) => ({ nome, tot }))
      return { ...b, cum, max, top, nFornitori: Object.keys(b.perFornitore).length }
    })
  }, [fattureExt])

  async function exportExcel() {
    try {
      const XLSX = await loadXLSX()
      const items = gruppiVisibili.flatMap(k => gruppi[k] || []).filter(matchSearch)
      // Il foglio che va dal commercialista deve dire anche quanto è stato
      // pagato e quanto resta: prima usciva solo il totale lordo, quindi gli
      // acconti sparivano e il residuo andava ricalcolato a mano. E la
      // scadenza va marcata quando è stimata da noi, non letta dal documento.
      const rows = [
        ['Data fattura', 'Data scadenza', 'Scadenza stimata', 'Fornitore', 'Numero Rif.', 'Tipo',
         'Imponibile €', 'Imposta €', 'Totale €', 'Pagato €', 'Residuo €', 'Stato', 'Data pagamento', 'Metodo'],
        ...items.map(f => [
          f.data_fattura || '',
          f.dueIso || '',
          f.dueStimata ? 'sì' : 'no',
          f.fornitore,
          f.numero_rif || '',
          f.isNC ? 'nota di credito' : 'fattura',
          f.imponibile || 0,
          f.imposta || 0,
          f.totale || 0,
          f.pagato || 0,
          Math.abs(f.residuo || 0),
          f.stato === 'pagata' ? 'pagata' : (URGENZA_CFG[f.urgenza]?.label || '-'),
          f.data_pagamento || '',
          f.metodo_pagamento || '',
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch:12 },{ wch:12 },{ wch:10 },{ wch:36 },{ wch:24 },{ wch:16 },{ wch:14 },{ wch:12 },{ wch:12 },{ wch:12 },{ wch:12 },{ wch:16 },{ wch:14 },{ wch:12 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Fatture')
      // Nome file con la data LOCALE (toISOString a mezzanotte dà il giorno
      // prima) e col filtro attivo dentro, così due export dello stesso
      // giorno non si sovrascrivono e si capisce cosa contengono.
      const oggi = new Date()
      const dataFile = `${oggi.getFullYear()}${String(oggi.getMonth() + 1).padStart(2, '0')}${String(oggi.getDate()).padStart(2, '0')}`
      XLSX.writeFile(wb, `fatture_${filtro}_${dataFile}.xlsx`)
    } catch (e) {
      notify('Errore export: ' + (e?.message || 'sconosciuto'), false)
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────
  const card = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }
  // Touch target: 40 desktop, 44 tablet/mobile (pattern Foodos)
  const minTouch = isMobile ? 44 : (isTablet ? 44 : 40)
  const pill = (active) => ({
    padding: isMobile ? '9px 16px' : '7px 14px',
    minHeight: minTouch,
    // Lo stato scelto è bordeaux, come ogni stato attivo del prodotto. Era
    // T.text, cioè quasi nero: la pastiglia "Tutte" riempita di nero era la
    // cosa più scura della pagina, e quello che gridava era un filtro fermo
    // sul valore di partenza.
    borderRadius: 9999, border: `1px solid ${active ? T.brand : T.border}`, cursor: 'pointer',
    fontSize: isMobile ? 13 : 12, fontWeight: active ? 600 : 500, letterSpacing: '-0.005em',
    background: active ? T.brand : T.bgCard,
    color: active ? T.textOnDark : T.textMid,
    display: 'inline-flex', alignItems: 'center',
    transition: `background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`,
  })
  const primaryBtn = { padding: isMobile ? '11px 18px' : '10px 16px', minHeight: minTouch, background: T.brandGradient, color: T.textOnDark, border: 'none', borderRadius: R.md, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, letterSpacing: '-0.005em', boxShadow: S.brandSoft, boxSizing: 'border-box' }
  const ghostBtn = { padding: isMobile ? '10px 16px' : '8px 16px', minHeight: minTouch, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: T.textMid, letterSpacing: '-0.005em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: S.xs, boxSizing: 'border-box' }

  if (!orgId) return (
    <div style={{ padding: 40, textAlign: 'center', color: T.textSoft }}>Caricamento in corso...</div>
  )

  // ─── Azioni inline (pagata / elimina) ────────────────────────────────────────
  function ActionsCell({ f, compact = false }) {
    const isPag = pagandoId === f.id
    const isDel = eliminandoId === f.id

    // «Segna pagata» e il cestino erano alti 30px sul tablet: `isMobile` da
    // solo lascia fuori il tablet, che però si tocca col dito esattamente
    // come un telefono. Trovato il 19/09/2026 misurando le schermate nuove a
    // 820px. Il dito è il dito: la regola sta in `minTouch`, che vale 44 sia
    // sul telefono sia sul tablet.
    const dito = isMobile || isTablet
    const tinyBtnH = dito ? minTouch : (compact ? 30 : 34)
    const fieldFs = isMobile ? 16 : 12
    const fieldPad = isMobile ? '10px 12px' : '7px 10px'

    if (isDel) {
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: T.brand, fontWeight: 700, whiteSpace: 'nowrap' }}>Sicuro?</span>
          <button onClick={() => eliminaFattura(f.id)}
            style={{ padding: isMobile ? '10px 14px' : '6px 12px', minHeight: tinyBtnH, background: T.brand, color: T.white, border: 'none', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer' }}>
            Sì, elimina
          </button>
          <button onClick={() => setEliminandoId(null)}
            style={{ padding: isMobile ? '10px 14px' : '6px 11px', minHeight: tinyBtnH, background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 600, cursor: 'pointer' }}>
            Annulla
          </button>
        </div>
      )
    }

    if (isPag) {
      const totale = Math.abs(Number(f.totale) || 0)
      const residuoTot = Math.max(0, totale - (Number(f.importo_pagato) || 0))
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'auto auto auto', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Data
              <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)} aria-label="Data pagamento"
                style={{ padding: fieldPad, minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: fieldFs, color: T.text, boxSizing: 'border-box', width: '100%' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Importo
              <input type="number" inputMode="decimal" value={pagImporto} onChange={e => setPagImporto(e.target.value)}
                placeholder={`${Number(residuoTot || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
                title="Vuoto = salda l'intero residuo. Importo minore = acconto."
                aria-label="Importo pagato"
                style={{ padding: fieldPad, minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: fieldFs, color: T.text, boxSizing: 'border-box', width: '100%' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', gridColumn: isMobile ? '1 / -1' : 'auto' }}>
              Metodo
              <select value={pagMetodo} onChange={e => setPagMetodo(e.target.value)}
                aria-label="Metodo di pagamento"
                style={{ padding: fieldPad, minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: fieldFs, color: T.text, background: T.bgCard, boxSizing: 'border-box', width: '100%' }}>
                <option value="bonifico">Bonifico</option>
                <option value="contanti">Contanti</option>
                <option value="riba">RiBa</option>
                <option value="rid">RID/SDD</option>
                <option value="carta">Carta</option>
                <option value="altro">Altro</option>
              </select>
            </label>
          </div>
          {/* La spunta che collega lo scadenzario alla Cassa: pagare una
              fattura è un'uscita di soldi veri, e finché non arrivava in prima
              nota il conto economico non la vedeva. Accesa per default, e
              ricordata: chi tiene la prima nota altrove la spegne una volta. */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, margin: '2px 0 10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={registraInCassa}
              onChange={e => setRegistraInCassa(e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 1, accentColor: T.brand, cursor: 'pointer', flexShrink: 0 }} />
            <span style={{ fontSize: font.size.base, color: T.textMid, lineHeight: 1.45 }}>
              Registra anche l'uscita in <b>Cassa</b>, così il pagamento entra nel conto economico.
            </span>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button aria-label="Annulla pagamento" onClick={() => { setPagandoId(null); setPagImporto('') }}
              style={{ padding: '8px 14px', minHeight: minTouch, background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: isMobile ? 1 : '0 0 auto' }}>
              Annulla
            </button>
            <button onClick={() => segnaComePagata(f.id)} aria-label="Conferma pagamento"
              style={{ padding: '8px 16px', minHeight: minTouch, background: T.green, color: T.white, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: isMobile ? 1 : '0 0 auto' }}>
              <Icon name="check" size={13} /> Conferma
            </button>
          </div>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {f.stato === 'pagata' ? (
          <span style={{ fontSize: 12, color: T.green, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {f.data_pagamento ? fmtDate(f.data_pagamento) : 'Pagata'}
          </span>
        ) : (
          <button onClick={() => { setPagandoId(f.id); setEliminandoId(null); setPagImporto(''); setPagMetodo('bonifico'); setDataPag(todayLocal()) }}
            aria-label={f.pagato > 0 ? 'Salda o registra acconto' : 'Segna come pagata'}
            style={{ padding: isMobile ? '9px 14px' : (compact ? '6px 11px' : '7px 12px'), minHeight: tinyBtnH, background: '#F0FDF4', color: T.green, border: `1px solid ${T.green}`, borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name="check" size={12} /> {f.pagato > 0 ? 'Salda/acconto' : 'Segna pagata'}
          </button>
        )}
        {f.stato !== 'pagata' && f.ibanValido && (
          <button onClick={() => copiaBonifico(f)} title="Copia dati bonifico (IBAN, importo, causale)"
            aria-label="Copia dati bonifico"
            style={{ padding: isMobile ? '9px 14px' : '7px 11px', minHeight: tinyBtnH, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name="copy" size={12} /> Bonifico
          </button>
        )}
        <button onClick={() => chiediElimina(f.id)}
          aria-label="Elimina fattura" title="Elimina fattura"
          style={{ padding: isMobile ? '9px 12px' : '7px 9px', minHeight: tinyBtnH, minWidth: minTouch, background: 'transparent', color: T.textSoft, border: 'none', cursor: 'pointer', borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = T.brand }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textSoft }}>
          <svg width={isMobile ? 16 : 14} height={isMobile ? 16 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
    )
  }

  // ─── Tabella desktop row ─────────────────────────────────────────────────────
  function RigaTabella({ f, cfg, i, last }) {
    const isDel = eliminandoId === f.id
    const isPag = pagandoId === f.id
    const isScaduta = f.urgenza === 'scaduta'
    const baseBg = isDel ? '#FEF2F2' : (isPag ? '#F0FDF4' : (i % 2 === 0 ? T.bgCard : '#FAFAFA'))

    // Inline edit (pagamento) → rendiamo una riga "full-width" con span colonne,
    // così il form pulito non resta compresso nella cella azioni.
    if (isPag) {
      return (
        <React.Fragment key={f.id}>
          <tr style={{ borderBottom: `none`, background: baseBg, boxShadow: isScaduta ? `inset 3px 0 0 0 ${T.red}` : 'none' }}>
            <td style={{ padding: '8px 12px 6px', fontWeight: 600, color: T.text, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: baseBg, zIndex: 1 }}>
              <span title={f.fornitore}>{f.fornitore}</span>
            </td>
            <td colSpan={5} style={{ textAlign: 'right', ...tnum, padding: '8px 12px 6px', color: T.textSoft, fontSize: 12 }}>
              {f.numero_rif || '-'} · {fmtDate(f.data_fattura)} · {f.dueStimata ? 'scadenza calcolata' : 'scade'} {fmtDate(f.dueIso)} · totale <span style={{ color: T.text, fontWeight: 700, ...tnum }}>{fmtEuro(f.totale)}</span>
            </td>
            <td style={{ padding: '8px 12px 6px' }} />
          </tr>
          <tr style={{ borderBottom: last ? 'none' : `1px solid ${T.border}`, background: baseBg }}>
            <td colSpan={7} style={{ padding: '6px 14px 14px' }}>
              {ActionsCell({ f, compact: true })}
            </td>
          </tr>
        </React.Fragment>
      )
    }

    const isSel = selFatt.has(f.id)
    const isPagabile = f.stato !== 'pagata' && f.ibanValido && f.residuo > 0
    return (
      <tr style={{
        borderBottom: last ? 'none' : `1px solid ${T.border}`,
        background: isSel ? '#FFF8F7' : baseBg,
        boxShadow: isScaduta ? `inset 3px 0 0 0 ${T.red}` : 'none',
      }}>
        <td style={{ padding: '10px 12px', fontWeight: 600, color: T.text, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: isSel ? '#FFF8F7' : baseBg, zIndex: 1 }}>
          {/* Checkbox SEPA per singola fattura (vista Per scadenza) */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <input type="checkbox" checked={isSel} onChange={(e) => {
              if (!isPagabile) {
                e.preventDefault()
                if (f.stato === 'pagata') { notify('Questa fattura è già marcata come pagata.', false); return }
                if (!f.ibanValido) { notify(`Aggiungi l'IBAN a ${f.fornitore} per includerla nel bonifico SEPA.`, false); setEditForn(normNome(f.fornitore)); return }
                notify('Fattura senza residuo da pagare.', false); return
              }
              setSelFatt(prev => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n })
            }}
              title={isPagabile ? 'Includi nel bonifico SEPA' : (f.stato === 'pagata' ? 'Gia pagata' : !f.ibanValido ? 'IBAN fornitore mancante - clicca per aggiungerlo' : 'Residuo nullo')}
              style={{ width: 20, height: 20, margin: 8, cursor: 'pointer', accentColor: T.brand, opacity: isPagabile ? 1 : 0.45, flexShrink: 0 }} />
            <span title={f.fornitore} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{f.fornitore}</span>
          </span>
        </td>
        <td style={{ padding: '10px 12px', color: T.textMid, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
          <span title={f.numero_rif || ''}>{f.numero_rif || '-'}</span>
        </td>
        <td style={{ padding: '10px 12px', color: T.textMid, whiteSpace: 'nowrap', ...tnum }}>
          {fmtDate(f.data_fattura)}
        </td>
        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
          {f.stato === 'pagata' ? (
            <span style={{ color: T.textSoft }}>-</span>
          ) : f.dueIso ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ color: T.text, fontWeight: 500, ...tnum }}
                title={f.dueStimata ? 'Data calcolata: data fattura + 30 giorni. Il documento del fornitore non la porta scritta.' : undefined}>
                {fmtDate(f.dueIso)}{f.dueStimata && <span style={{ color: T.textSoft, fontWeight: 400 }}> *</span>}
              </span>
              <span style={{ fontSize: 12, color: isScaduta ? T.red : T.textSoft, fontWeight: isScaduta ? 600 : 500 }}>
                {relDayLabel(f.dueDays)}
              </span>
            </div>
          ) : (
            <span style={{ color: T.textSoft }}>-</span>
          )}
        </td>
        <td style={{
          padding: '10px 12px', textAlign: 'right',
          fontWeight: isScaduta ? 800 : 700,
          color: isScaduta ? T.red : T.text,
          letterSpacing: '-0.015em', whiteSpace: 'nowrap', ...tnum,
        }}>
          {fmtEuro(f.totale)}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <span style={{
            background: cfg.pillBg, color: cfg.pillFg,
            padding: '4px 10px', borderRadius: 9, fontSize: 12, fontWeight: 700,
            letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}>{cfg.label}</span>
        </td>
        <td style={{
          padding: '8px 12px',
          position: 'sticky', right: 0, zIndex: 1,
          background: isSel ? T.brandLight : baseBg,
          boxShadow: '-2px 0 0 rgba(15,23,42,0.06)',
        }}>
          {ActionsCell({ f, compact: true })}
        </td>
      </tr>
    )
  }

  // ─── Card mobile ─────────────────────────────────────────────────────────────
  function CardMobile({ f, cfg }) {
    const isDel = eliminandoId === f.id
    const isPag = pagandoId === f.id
    const isScaduta = f.urgenza === 'scaduta'

    return (
      <div key={f.id} style={{
        background: T.bgCard,
        border: `1px solid ${isDel ? '#FCA5A5' : (isScaduta ? '#FCA5A5' : T.border)}`,
        borderLeft: `4px solid ${cfg.accent}`,
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 10,
        boxShadow: isScaduta ? '0 1px 2px rgba(110,14,26,0.06)' : '0 1px 2px rgba(15,23,42,0.03)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <div title={f.fornitore} style={{ fontWeight: 700, fontSize: 14, color: T.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.005em' }}>
            {f.fornitore}
          </div>
          <span style={{
            background: cfg.pillBg, color: cfg.pillFg,
            padding: '3px 9px', borderRadius: 9, fontSize: 12, fontWeight: 700,
            letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{cfg.label}</span>
        </div>
        <div title={`${f.numero_rif || ''} · ${fmtDate(f.data_fattura)}`} style={{ fontSize: 12, color: T.textSoft, marginBottom: 10, ...tnum, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.numero_rif || '-'} · fattura {fmtDate(f.data_fattura)}
          {f.stato !== 'pagata' && f.dueIso && (
            <>
              {' · '}
              <span style={{ color: isScaduta ? T.red : T.textMid, fontWeight: isScaduta ? 600 : 500 }}>
                scadenza {fmtDate(f.dueIso)} ({relDayLabel(f.dueDays)})
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: 18, fontWeight: isScaduta ? 800 : 700,
            color: isScaduta ? T.red : T.text,
            letterSpacing: '-0.02em', ...tnum,
          }}>
            {fmtEuro(f.totale)}
          </div>
          {!isDel && !isPag && ActionsCell({ f })}
        </div>
        {isPag && (
          <div style={{ marginTop: 12, padding: 12, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10 }}>
            {ActionsCell({ f })}
          </div>
        )}
        {isDel && (
          <div style={{ marginTop: 12, padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: T.brand, fontWeight: 600, marginBottom: 10 }}>
              Sei sicuro? L'azione non è reversibile.
            </div>
            {ActionsCell({ f })}
          </div>
        )}
      </div>
    )
  }

  // ─── Sezione gruppo ──────────────────────────────────────────────────────────
  function Gruppo({ keyU, items }) {
    // Audit 2026-09-09: questa funzione aveva uno stato locale proprio. Ora
    // viene CHIAMATA come funzione (non più come elemento JSX) per non far
    // rimontare le righe a ogni render del padre, e in quel modo uno stato
    // locale qui sarebbe uno stato del padre dichiarato in numero variabile
    // dentro un .map(): le regole degli hook di React lo vietano e lo stato si
    // corromperebbe. Ora vive nel padre, che non si rimonta — ed è anche la
    // cura vera del difetto, perché "Mostra tutte le 211" non si azzera più
    // quando il gruppo viene ridisegnato.
    const shownAll = !!gruppiEspansi[keyU]
    const setShownAll = (v) => setGruppiEspansi(g => ({
      ...g,
      [keyU]: typeof v === 'function' ? v(!!g[keyU]) : !!v,
    }))
    if (!items.length) return null
    const cfg = URGENZA_CFG[keyU]
    const totaleGruppo = items.reduce((s, f) => s + (f.totale || 0), 0)
    const isUrgent = keyU === 'scaduta'

    return (
      <section key={keyU} style={{
        ...card,
        overflow: 'hidden',
        marginBottom: 14,
        borderLeft: `4px solid ${cfg.accent}`,
      }}>
        {/* Header gruppo */}
        <div style={{
          padding: isMobile ? '14px 14px' : '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
          borderBottom: `1px solid ${T.border}`,
          background: isUrgent ? '#FEF2F2' : T.bgCard,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            <span aria-label={`${items.length} fatture`} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 28, height: 28, padding: '0 8px', borderRadius: 9, background: cfg.pillBg, color: cfg.pillFg,
              fontSize: 12, fontWeight: 800, ...tnum,
            }}>{items.length.toLocaleString('it-IT', { useGrouping: 'always' })}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>
                {cfg.header}
              </div>
              <div style={{ fontSize: 12, color: T.textSoft, letterSpacing: '-0.005em', marginTop: 1 }}>
                {cfg.sub}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Segna pagate tutte quelle del gruppo. Audit 2026-09-09: prima
                l'unica strada era una alla volta, e sulle 211 scadute di Mara
                erano 211 clic col popup da confermare ogni volta. */}
            {items.some(f => f.stato !== 'pagata') && (
              <button type="button"
                onClick={() => setBloccoConf({ items, titolo: cfg.header })}
                disabled={bloccoLoading}
                style={{
                  padding: '9px 13px', minHeight: minTouch, borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.bgCard,
                  ...typo.small, fontWeight: 700, color: T.textSoft,
                  cursor: bloccoLoading ? 'default' : 'pointer', whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                <Icon name="check" size={12} /> Segna pagate
              </button>
            )}
            <div style={{
              fontSize: isMobile ? 15 : 16, fontWeight: 800,
              color: isUrgent ? T.brand : T.text,
              letterSpacing: '-0.015em', ...tnum, whiteSpace: 'nowrap',
            }}>
              {fmtEuro(totaleGruppo)}
            </div>
          </div>
        </div>

        {/* Body - Audit 2026-07-01 batch 10 Performance: paginazione UI a 60
            elementi per evitare lag su scadenzari grandi (1000+ fatture). */}
        {(() => {
          const PAGE_SIZE = 60
          const isPaginated = items.length > PAGE_SIZE && !shownAll
          const view = isPaginated ? items.slice(0, PAGE_SIZE) : items
          return (
            <>
              {isMobile ? (
                <div style={{ padding: 8 }}>
                  {view.map(f => CardMobile({ f, cfg }))}
                </div>
              ) : (
                // telefono: schede — vedi `CardMobile` nel ramo qui sopra.
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontSize: 12, ...tnum }}>
                    <thead>
                      <tr style={{ background: '#FAFAF8' }}>
                        {[
                          'Fornitore', 'Numero', 'Data fatt.', 'Scadenza', 'Totale', 'Stato', 'Azioni',
                        ].map((l, idx) => (
                          <th key={l} style={{
                            padding: '10px 12px',
                            textAlign: idx === 4 ? 'right' : 'left',
                            fontSize: 12, fontWeight: 700,
                            color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em',
                            borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
                            // Prima colonna ancorata a sinistra (il nome del
                            // fornitore, che serve a capire di che riga si
                            // parla) e ULTIMA ancorata a destra: su tablet in
                            // verticale la colonna Azioni, dove stanno "segna
                            // pagata" e il cestino, finiva fuori schermo e si
                            // scopriva solo scorrendo di lato.
                            position: (idx === 0 || l === 'Azioni') ? 'sticky' : 'static',
                            left: idx === 0 ? 0 : 'auto',
                            right: l === 'Azioni' ? 0 : 'auto',
                            background: '#FAFAF8',
                            boxShadow: l === 'Azioni' ? '-2px 0 0 rgba(15,23,42,0.06)' : undefined,
                            zIndex: (idx === 0 || l === 'Azioni') ? 2 : 1,
                          }}>{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {view.map((f, i) => (
                        RigaTabella({ f, cfg, i, last: i === view.length - 1 })
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {isPaginated && (
                <div style={{
                  padding: '14px 16px', textAlign: 'center',
                  borderTop: `1px solid ${T.border}`, background: '#FAFAF6',
                }}>
                  <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 10, ...tnum }}>
                    Mostrate <strong>{view.length.toLocaleString('it-IT', { useGrouping: 'always' })}</strong> di <strong>{items.length.toLocaleString('it-IT', { useGrouping: 'always' })}</strong> fatture.
                  </div>
                  <button onClick={() => setShownAll(true)}
                    aria-label={`Mostra tutte le ${items.length} fatture`}
                    style={{
                      padding: '10px 22px', minHeight: minTouch, borderRadius: 9,
                      border: `1px solid ${T.border}`, background: T.bgCard,
                      fontSize: 13, fontWeight: 700, color: T.text, cursor: 'pointer',
                    }}>
                    Mostra tutte ({items.length.toLocaleString('it-IT', { useGrouping: 'always' })})
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </section>
    )
  }

  // ─── Vista: rollup per fornitore ─────────────────────────────────────────────
  //
  // Le larghezze dei posti fissi della riga. Misurate sul contenuto più lungo
  // che ci deve stare: «scaduto 123.456 €» per il bollino, «123.456,78 €» per
  // il dovuto, «Ho pagato» col simbolo per il pulsante verde.
  const LARG_SCADUTO = 150
  const LARG_DOVUTO = 120
  const LARG_HO_PAGATO = 124
  const LARG_ICONA_FORN = minTouch

  function RollupView() {
    if (!rollupFornitori.length) {
      return <div style={{ ...card, padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
        Nessuna fattura aperta{search ? ' per la ricerca' : ''}.
      </div>
    }
    const totGlob = rollupFornitori.reduce((s, g) => s + g.totale, 0)
    return (
      <div style={{ ...card, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: isMobile ? '14px 16px' : '14px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Dovuto per fornitore</div>
            <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>{rollupFornitori.length.toLocaleString('it-IT', { useGrouping: 'always' })} fornitori · netto note di credito · spunta per il bonifico</div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, ...tnum, whiteSpace: 'nowrap' }}>{fmtEuro(totGlob)}</div>
        </div>
        {rollupFornitori.map(g => {
          const isEdit = editForn === g.nome_norm
          const selectable = g.items.some(f => f.ibanValido && f.residuo > 0)
          const sel = selez.has(g.nome_norm)
          const ibanN = normalizeIban(g.iban)
          const isExpanded = expandedForn.has(g.nome_norm)
          const tutteFatture = tutteFatturePerFornitore[g.nome_norm] || []
          return (
            <div key={g.nome_norm} style={{ borderBottom: `1px solid ${T.border}`, padding: isMobile ? '12px 14px' : '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12, flexWrap: 'wrap' }}>
                {/* Checkbox SEPA: se IBAN fornitore manca, NON disabilitiamo a
                    livello browser (era cursor:not-allowed = simbolo di divieto,
                    user frustrato). Invece: click apre subito l'edit fornitore
                    con IBAN focused + toast spiegazione. */}
                <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={sel} onChange={(e) => {
                    if (!selectable) {
                      e.preventDefault()
                      setEditForn(g.nome_norm)
                      notify(`Aggiungi l'IBAN a ${g.nome} per includerlo nel bonifico SEPA.`, false)
                      return
                    }
                    toggleSelez(g.nome_norm)
                  }}
                    title={selectable ? 'Includi nel bonifico SEPA' : `IBAN mancante: clicca per aggiungerlo a ${g.nome}`}
                    aria-label={`Seleziona ${g.nome} per bonifico SEPA`}
                    style={{ width: 20, height: 20, margin: 10, cursor: 'pointer', accentColor: T.brand, opacity: selectable ? 1 : 0.6 }} />
                </span>
                {/* Il nome del fornitore apre e chiude le sue fatture: è un
                    comando, e quindi è un `<button>`. Era un `<div onClick>`,
                    cioè invisibile a chi gira con Tab e muto per un lettore di
                    schermo, che non aveva modo di sapere né che si poteva
                    premere né se la riga era aperta. `aria-expanded` lo dice. */}
                <button type="button" style={{ minWidth: 0, flex: 1, cursor: 'pointer',
                    background: 'none', border: 'none', padding: 0, margin: 0, textAlign: 'left', font: 'inherit', color: 'inherit' }}
                  onClick={() => toggleExpandForn(g.nome_norm)}
                  aria-expanded={isExpanded}
                  aria-label={`${g.nome}: ${isExpanded ? 'nascondi' : 'mostra'} tutte le fatture`}
                  title="Mostra tutte le fatture di questo fornitore">
                  <span style={{ fontWeight: 700, fontSize: isMobile ? 14 : 13, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden="true" style={{ color: T.textSoft, transition: 'transform .15s ease', display: 'inline-flex', alignItems: 'center', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}><Icon name="chevR" size={13} color={T.textSoft} /></span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nome}</span>
                  </span>
                  <span title={ibanN ? `IBAN ${ibanN}` : 'IBAN mancante'} style={{ display: 'block', fontSize: 12, color: T.textSoft, ...tnum, marginLeft: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.nFatt} fatt.{g.nNC > 0 ? ` · ${g.nNC} NC` : ''}{g.termini != null ? ` · ${g.termini}gg` : ''}
                    {' · '}{ibanN ? `${ibanN.slice(0, 2)}…${ibanN.slice(-4)}` : <span style={{ color: T.brand, fontWeight: 600 }}>no IBAN</span>}
                    {tutteFatture.length > g.n && <span style={{ marginLeft: 6, color: T.textSoft }}>· +{tutteFatture.length - g.n} pagate</span>}
                  </span>
                </button>
                {/* ── I posti fissi della riga ──────────────────────────
                    Segnalato dal titolare il 19/09/2026: «le cifre devono
                    stare sempre incolonnate fra di loro, le box verdi con
                    "ho pagato" idem, e le altre box pure. Se manca una box in
                    una riga non è che scalano tutte le altre».
                    Aveva ragione ed era il difetto classico del `flex` senza
                    posti fissi: il bollino rosso «scaduto …», il pulsante
                    verde «Ho pagato» e la copia dell'estratto conto compaiono
                    solo a certe condizioni, e quando uno mancava la riga si
                    richiudeva verso destra trascinandosi dietro tutto il
                    resto. Il fornitore senza scaduto aveva il totale dieci
                    centimetri più in là di quello sopra.
                    Il rimedio è quello che il progetto usa già altrove
                    (`LARG_AVVISO_PREZZO` in `SemilavoratiView.jsx`): ogni
                    posto ha una larghezza sua e, quando non ha niente da
                    mostrare, resta vuoto invece di sparire. */}
                <div data-colonne-fornitore="" style={{
                  display: 'grid', alignItems: 'center', gap: 8, flexShrink: 0,
                  marginLeft: isMobile ? 28 : 0,
                  width: isMobile ? 'calc(100% - 28px)' : 'auto',
                  gridTemplateColumns: isMobile
                    ? `1fr ${LARG_ICONA_FORN}px ${LARG_ICONA_FORN}px`
                    : `${LARG_SCADUTO}px ${LARG_DOVUTO}px ${LARG_HO_PAGATO}px ${LARG_ICONA_FORN}px ${LARG_ICONA_FORN}px`,
                }}>
                  <div data-posto="scaduto" style={{ gridColumn: isMobile ? '1 / 2' : 'auto', display: 'flex', justifyContent: isMobile ? 'flex-start' : 'flex-end', minWidth: 0 }}>
                    {g.scaduto > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '4px 9px', borderRadius: 9, whiteSpace: 'nowrap', ...tnum }}>scaduto {fmtEuro0(g.scaduto)}</span>}
                  </div>
                  <div data-posto="dovuto" style={{ gridColumn: isMobile ? '2 / 4' : 'auto', fontSize: isMobile ? 15 : 16, fontWeight: 800, color: g.totale < 0 ? T.green : T.text, ...tnum, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtEuro(g.totale)}</div>
                  {/* Un bonifico, un importo. Con 99 fatture aperte allo
                      stesso fornitore, segnarle pagate una per una è lavoro
                      che nessuno fa: si scrive quanto è partito e le fatture
                      si chiudono dalla più vecchia. */}
                  <div data-posto="ho-pagato" style={{ gridColumn: isMobile ? '1 / 2' : 'auto', display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
                    {g.items.some(f => f.residuo > 0) && (
                      <button onClick={(e) => { e.stopPropagation(); setPagCum({ nome_norm: g.nome_norm, nome: g.nome, testo: '' }) }}
                        aria-label={`Registra un pagamento a ${g.nome}`}
                        title="Ho pagato una cifra a questo fornitore: la imputo alle fatture più vecchie"
                        style={{
                          width: '100%', padding: '0 10px', minHeight: minTouch, borderRadius: 8,
                          border: 'none', background: T.green, color: T.white,
                          fontSize: font.size.base, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        }}>
                        <Icon name="euro" size={13} /> Ho pagato
                      </button>
                    )}
                  </div>
                  {/* L'estratto conto da mandare al fornitore: "queste ci
                      risultano aperte, ti torna?". Con decine di fatture è
                      l'unico modo di allinearsi senza leggere i numeri al
                      telefono. */}
                  <div data-posto="estratto-conto" style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                    {g.items.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); copiaEstrattoConto(g) }}
                        aria-label={`Copia l'estratto conto di ${g.nome}`}
                        title="Copia l'elenco delle fatture aperte, pronto da mandare al fornitore"
                        style={{ ...ghostBtn, padding: 0, minHeight: minTouch, width: LARG_ICONA_FORN }}>
                        <Icon name="copy" size={14} />
                      </button>
                    )}
                  </div>
                  <div data-posto="anagrafica" style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); if (isEdit) { setEditForn(null) } else { setEditForn(g.nome_norm); setEditFornData({ iban: g.iban || '', termini: g.termini ?? 30, terminiTipo: g.terminiTipo || 'netti', categoria: g.categoria || '' }) } }}
                      aria-label="Modifica anagrafica fornitore"
                      title="Anagrafica fornitore (IBAN, termini)" style={{ ...ghostBtn, padding: 0, minHeight: minTouch, width: LARG_ICONA_FORN }}><Icon name="gear" size={14} /></button>
                  </div>
                </div>
              </div>

              {/* Dropdown fatture (pagate + non pagate) */}
              {isExpanded && tutteFatture.length > 0 && (
                <div style={{ marginTop: 10, marginLeft: isMobile ? 0 : 30, padding: 0, background: T.bgSubtle, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${T.border}`, background: '#FAFBFC' }}>
                    {tutteFatture.length} fatture totali · {tutteFatture.filter(f => f.stato === 'pagata').length} pagate · {tutteFatture.filter(f => f.stato !== 'pagata').length} aperte
                  </div>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 520 : 'auto' }}>
                    <thead>
                      <tr style={{ background: '#FFFFFF' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Numero</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data</th>
                        {!isMobile && <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}><span title="Le date con * sono calcolate come data fattura + 30 giorni: il documento del fornitore non le porta scritte." style={{ cursor: 'help' }}>Scadenza</span></th>}
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Importo</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tutteFatture.map(f => {
                        const isPagata = f.stato === 'pagata'
                        const isNC = f.isNC
                        return (
                          <tr key={f.id} style={{
                            borderTop: `1px solid ${T.borderSoft}`,
                            background: isPagata ? '#F0FDF4' : '#FFFFFF',
                          }}>
                            <td style={{ padding: '7px 10px', fontSize: 12, color: T.text, fontWeight: 600, ...tnum, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.numero_rif || '-'}
                              {isNC && <span style={{ marginLeft: 4, fontSize: 12, padding: '1px 4px', background: '#DBEAFE', color: '#1E40AF', borderRadius: 3, fontWeight: 700 }}>NC</span>}
                            </td>
                            <td style={{ padding: '7px 10px', fontSize: 12, color: T.textMid, ...tnum }}>
                              {f.data_fattura ? new Date(f.data_fattura).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}
                            </td>
                            {!isMobile && (
                              <td style={{ padding: '7px 10px', fontSize: 12, color: f.urgenza === 'scaduta' && !isPagata ? T.brand : T.textSoft, ...tnum, fontWeight: f.urgenza === 'scaduta' && !isPagata ? 700 : 400 }}>
                                {f.dueIso ? new Date(f.dueIso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}
                              </td>
                            )}
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: isNC ? T.green : T.text, ...tnum }}>
                              {fmtEuro(f.importoNetto)}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                              {isPagata ? (
                                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: '#DCFCE7', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Pagata
                                </span>
                              ) : f.urgenza === 'scaduta' ? (
                                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Scaduta
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: '#FEF9C3', color: '#854D0E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Aperta
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
              {isEdit && (
                <div style={{ marginTop: 12, padding: 14, background: T.bgSubtle, borderRadius: 12, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'center' }}>
                  <input placeholder="IBAN fornitore" value={editFornData.iban} onChange={e => setEditFornData(d => ({ ...d, iban: e.target.value }))}
                    aria-label="IBAN fornitore"
                    style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${editFornData.iban && !ibanIsValid(editFornData.iban) ? T.brand : T.border}`, borderRadius: 9, fontSize: 13, flex: isMobile ? '1 1 100%' : '1 1 240px', minWidth: 0, width: isMobile ? '100%' : 'auto', boxSizing: 'border-box', ...tnum }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: isMobile ? '100%' : 'auto' }}>
                    <input type="number" inputMode="numeric" placeholder="Termini (gg)" value={editFornData.termini} onChange={e => setEditFornData(d => ({ ...d, termini: e.target.value }))}
                      title="Giorni di pagamento (per derivare la scadenza quando non è nell'XML)"
                      aria-label="Termini di pagamento in giorni"
                      style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, width: isMobile ? '100%' : 120, boxSizing: 'border-box' }} />
                    {/* I termini VERI, imparati da come hai pagato: la mediana
                        dei giorni fra fattura e pagamento su questo fornitore.
                        Non li scriviamo noi — si propongono, e li confermi tu:
                        cambiano la scadenza di tutte le sue fatture future. */}
                    {(() => {
                      const t = terminiImparati[g.nome_norm]
                      if (!t || String(t.proposto) === String(editFornData.termini)) return null
                      return (
                        <button type="button"
                          onClick={() => setEditFornData(d => ({ ...d, termini: String(t.proposto) }))}
                          title={`Su ${t.campione} pagamenti registrati, di solito paghi dopo ${t.giorni} giorni (dal minimo di ${t.min} al massimo di ${t.max}).`}
                          style={{
                            padding: '6px 9px', borderRadius: 7, border: `1px dashed ${T.blue}`,
                            background: T.blueLight, color: T.blue, fontSize: font.size.sm,
                            fontWeight: 700, cursor: 'pointer', textAlign: 'left', lineHeight: 1.35,
                          }}>
                          Di solito paghi a {t.giorni} gg · usa {t.proposto}
                        </button>
                      )
                    })()}
                  </div>
                  {/* Come si contano quei giorni. Audit 2026-09-09: c'era solo il
                      numero, e il calcolo era sempre "dalla data fattura". I
                      fornitori alimentari lavorano quasi tutti a fine mese: una
                      fattura del 3 marzo a 30 gg f.m. si paga il 30 aprile, non
                      il 2 aprile. Ventotto giorni di differenza su ogni riga. */}
                  <select value={editFornData.terminiTipo || 'netti'}
                    onChange={e => setEditFornData(d => ({ ...d, terminiTipo: e.target.value }))}
                    aria-label="Come si contano i giorni di pagamento"
                    style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, width: isMobile ? '100%' : 'auto', color: T.text, background: T.bgCard, cursor: 'pointer' }}>
                    <option value="netti">giorni dalla data fattura</option>
                    <option value="fine_mese">giorni dalla fine del mese</option>
                  </select>
                  <input placeholder="Categoria (opz.)" value={editFornData.categoria} onChange={e => setEditFornData(d => ({ ...d, categoria: e.target.value }))}
                    aria-label="Categoria fornitore"
                    style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, flex: isMobile ? '1 1 100%' : '1 1 160px', minWidth: 0, width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
                    <button onClick={() => salvaFornitore(g.nome, { iban: editFornData.iban, termini_pagamento: Number(editFornData.termini) || 30, termini_tipo: editFornData.terminiTipo || 'netti', categoria: editFornData.categoria })}
                      style={{ ...primaryBtn, flex: isMobile ? 1 : '0 0 auto' }}>Salva</button>
                    <button onClick={() => setEditForn(null)} style={{ ...ghostBtn, flex: isMobile ? 1 : '0 0 auto' }}>Annulla</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Vista: cassa in uscita (forward) ────────────────────────────────────────
  // Le spese fisse: bollette, canoni, professionisti.
  //
  // PERCHE' SEPARARLE: Enel ha 19 fatture, una al mese, sempre uguali. Non
  // serve controllarle 19 volte: serve sapere se quella del mese è arrivata e
  // se costa come sempre. Mescolate alle forniture di merce sono solo rumore
  // in un elenco di 1.387 righe.
  // Il riconoscimento è nei dati, non in una lista di nomi scritta da noi:
  // una al mese, per almeno tre mesi, senza buchi, e con gli importi che non
  // ballano troppo (sopra il 25% di scarto è una fornitura che capita di
  // ordinare ogni mese, non un canone).
  function FisseView() {
    const oggi = new Date()
    const meseCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`
    // Ultimo importo e ultimo mese di ciascuna fissa, per dire "questo mese
    // è arrivata" e "costa come sempre".
    const perNome = {}
    for (const f of fatture) {
      const k = String(f.fornitore || '').trim()
      if (!k) continue
      const mese = String(f.data_fattura || '').slice(0, 7)
      if (!perNome[k] || mese > perNome[k].mese) {
        perNome[k] = { mese, importo: Math.abs(Number(f.totale) || 0), stato: f.stato }
      }
    }
    const totaleMese = fisseMensili.reduce((sm, r) => sm + r.mediaImporto, 0)
    return (
      <div style={{ ...card, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: isMobile ? '14px 16px' : '14px 20px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: font.size.lg, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Spese fisse mensili</div>
          <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 2 }}>
            {fisseMensili.length.toLocaleString('it-IT', { useGrouping: 'always' })} voci che tornano ogni mese,
            per circa {fmtEuro0(totaleMese)} al mese. Riconosciute dai tuoi dati: una al mese, per almeno tre mesi.
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <TabellaOSchede

          minWidth={620}
          righe={fisseMensili}
          chiave={(r) => r.nome}
          vuoto="Nessuna spesa fissa riconosciuta."
          titolo={(r) => (
            <span>
              {r.nome}
              {r.ricorrenza === 'mensile-variabile' && (
                <span title="Gli importi ballano molto da un mese all'altro: è una fornitura che ordini ogni mese, non un canone fisso."
                  style={{ marginLeft: 6, fontSize: font.size.xs, fontWeight: 700, color: T.amber, background: T.amberLight, padding: '1px 7px', borderRadius: 999 }}>
                  variabile
                </span>
              )}
            </span>
          )}
          riassunto={(r) => {
            const ultima = perNome[r.nome]
            const arrivata = ultima?.mese === meseCorrente
            return arrivata
              ? <span style={{ fontSize: font.size.sm, fontWeight: 700, color: T.green, background: T.greenLight, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>arrivata</span>
              : <span style={{ fontSize: font.size.sm, fontWeight: 700, color: T.amber, background: T.amberLight, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>non ancora</span>
          }}
          colonne={[
            { k: 'media', label: 'Di solito', cella: (r) => fmtEuro(r.mediaImporto) },
            { k: 'ultima', label: 'Ultima', forte: true, cella: (r) => {
              const ultima = perNome[r.nome]; return ultima ? fmtEuro(ultima.importo) : '-'
            } },
            { k: 'diff', label: 'Differenza', cella: (r) => {
              const ultima = perNome[r.nome]
              if (!ultima) return '-'
              const diff = ultima.importo - r.mediaImporto
              const diffPct = r.mediaImporto > 0 ? (diff / r.mediaImporto) * 100 : 0
              const fuori = Math.abs(diffPct) >= 20
              return <span style={{ fontWeight: fuori ? 800 : 500, color: fuori ? (diff > 0 ? T.brand : T.green) : T.textSoft }}>{diff > 0 ? '+' : ''}{fmtEuro0(diff)}</span>
            } },
            { k: 'da', label: 'Da quando', cella: (r) => `${r.primoMese.split('-').reverse().join('/')} · ${r.mesi} mesi` },
          ]}
          intestazione={<><thead>
              <tr style={{ background: T.bgSubtle }}>
                {[['Voce', 'left'], ['Di solito', 'right'], ['Ultima', 'right'], ['Differenza', 'right'], ['Questo mese', 'left'], ['Da quando', 'left']].map(([h, al]) => (
                  <th key={h} style={{
                    padding: '10px 12px', textAlign: al, fontSize: font.size.sm, fontWeight: 700,
                    color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.06em',
                    borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead></>}
          corpo={<><tbody>
              {fisseMensili.map(r => {
                const ultima = perNome[r.nome]
                const arrivata = ultima?.mese === meseCorrente
                const diff = ultima ? ultima.importo - r.mediaImporto : 0
                const diffPct = r.mediaImporto > 0 ? (diff / r.mediaImporto) * 100 : 0
                // Sopra il 20% di scostamento vale la pena guardarla: una
                // bolletta che raddoppia è la prima cosa da controllare.
                const fuori = Math.abs(diffPct) >= 20
                return (
                  <tr key={r.nome} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: T.text, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.nome}
                      {r.ricorrenza === 'mensile-variabile' && (
                        <span title="Gli importi ballano molto da un mese all'altro: è una fornitura che ordini ogni mese, non un canone fisso."
                          style={{ marginLeft: 6, fontSize: font.size.xs, fontWeight: 700, color: T.amber, background: T.amberLight, padding: '1px 7px', borderRadius: 999, cursor: 'help' }}>
                          variabile
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: T.textMid, ...tnum, whiteSpace: 'nowrap' }}>{fmtEuro(r.mediaImporto)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: T.text, ...tnum, whiteSpace: 'nowrap' }}>{ultima ? fmtEuro(ultima.importo) : '-'}</td>
                    <td style={{ ...tnum, padding: '10px 12px', textAlign: 'right', fontWeight: fuori ? 800 : 500, color: !ultima ? T.textSoft : fuori ? (diff > 0 ? T.brand : T.green) : T.textSoft, ...tnum, whiteSpace: 'nowrap' }}>
                      {ultima ? `${diff > 0 ? '+' : ''}${fmtEuro0(diff)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {arrivata
                        ? <span style={{ fontSize: font.size.sm, fontWeight: 700, color: T.green, background: T.greenLight, padding: '3px 9px', borderRadius: 999 }}>arrivata</span>
                        : <span title={`L'ultima che ho è di ${ultima?.mese || '—'}.`} style={{ fontSize: font.size.sm, fontWeight: 700, color: T.amber, background: T.amberLight, padding: '3px 9px', borderRadius: 999, cursor: 'help' }}>non ancora</span>}
                    </td>
                    <td style={{ padding: '10px 12px', color: T.textSoft, ...tnum, whiteSpace: 'nowrap' }}>
                      {r.primoMese.split('-').reverse().join('/')} · {r.mesi} mesi
                    </td>
                  </tr>
                )
              })}
            </tbody></>}
        />
        </div>
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, fontSize: font.size.sm, color: T.textSoft, lineHeight: 1.5 }}>
          "Non ancora" vuol dire che per questo mese non ho ancora una fattura di quella voce: o non è
          arrivata, o non è stata caricata. La colonna "Differenza" confronta l'ultima con la media di
          tutte le altre.
        </div>
      </div>
    )
  }

  function CassaView() {
    return (
      <div style={{ ...card, padding: isMobile ? 16 : 22, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Cassa in uscita - prossime settimane</div>
          {!isMobile && <div style={{ fontSize: 12, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Settimana · Importo · Cumulato</div>}
        </div>
        <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 18 }}>Quanto esce e quando (netto note di credito). A destra il saldo cumulato. Clicca una settimana per vedere a chi va.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cashflow.map((b, i) => {
            const pct = Math.min(100, (Math.abs(b.tot) / b.max) * 100)
            const col = b.scaduto ? T.brand : (b.tot < 0 ? T.green : '#F97316')
            return (
              <div key={i}>
                <div
                  onClick={() => b.n > 0 && setSettimanaAperta(settimanaAperta === i ? null : i)}
                  role={b.n > 0 ? 'button' : undefined}
                  tabIndex={b.n > 0 ? 0 : undefined}
                  onKeyDown={e => { if (b.n > 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSettimanaAperta(settimanaAperta === i ? null : i) } }}
                  title={b.n > 0 ? `${b.n} fatture · ${b.nFornitori} fornitori · clicca per vedere a chi va` : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, cursor: b.n > 0 ? 'pointer' : 'default', minHeight: 40 }}>
                  <div style={{ width: isMobile ? 78 : 96, fontSize: 12, color: b.scaduto ? T.brand : T.textMid, fontWeight: b.scaduto ? 700 : 500, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</div>
                  <div style={{ flex: 1, height: 24, background: T.bgSubtle, borderRadius: 7, position: 'relative', overflow: 'hidden' }}>
                    {b.tot !== 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: col, borderRadius: 7, minWidth: b.n ? 6 : 0, transition: 'width 0.3s' }} />}
                  </div>
                  <div style={{ width: isMobile ? 84 : 104, textAlign: 'right', fontSize: 13, fontWeight: 700, color: b.tot < 0 ? T.green : T.text, ...tnum, flexShrink: 0, whiteSpace: 'nowrap' }}>{b.n ? fmtEuro0(b.tot) : '-'}</div>
                  {!isMobile && <div style={{ width: 96, textAlign: 'right', fontSize: 12, color: T.textSoft, ...tnum, flexShrink: 0, whiteSpace: 'nowrap' }} title="Saldo cumulato">{fmtEuro0(b.cum)}</div>}
                </div>
                {settimanaAperta === i && b.top.length > 0 && (
                  <div style={{ margin: '6px 0 10px', marginLeft: isMobile ? 0 : 110, padding: '10px 12px', background: T.bgSubtle, borderRadius: 9 }}>
                    <div style={{ fontSize: font.size.sm, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      A chi va{b.nFornitori > b.top.length ? ` · i ${b.top.length} più grossi su ${b.nFornitori}` : ''}
                    </div>
                    {b.top.map(t => (
                      <div key={t.nome} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 3 }}>
                        <span style={{ fontSize: font.size.base, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                        <span style={{ fontSize: font.size.base, fontWeight: 700, color: t.tot < 0 ? T.green : T.text, ...tnum, whiteSpace: 'nowrap' }}>{fmtEuro(t.tot)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Lascia spazio in fondo per la SEPA bar quando ci sono selezioni

  // Il messaggio che compare in alto a destra. In una funzione perché lo
  // mostrano anche le schermate che si aprono da qui.
  function Toast() {
    if (!toast) return null
    return (
      <div role="status" aria-live="polite" style={{ position: 'fixed', top: 16, right: 16, left: isMobile ? 16 : 'auto', maxWidth: isMobile ? 'auto' : 420, zIndex: 999, background: toast.ok ? T.green : T.brand, color: T.white, padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 10, lineHeight: 1.35 }}>
        <Icon name={toast.ok ? 'check' : 'warning'} size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>{toast.msg}</span>
      </div>
    )
  }

  // Il riquadro che conferma «segno pagate N fatture». Sta in una funzione
  // perché lo usano due schermate: l'elenco per scadenza e le tre pagine che
  // si aprono dalle tessere. Senza, su quelle pagine il pulsante «Segna
  // pagate» dei gruppi non avrebbe fatto comparire niente.
  function ConfermaBlocco() {
    // Dice quante fatture e quanto, e chiede la data del pagamento (una
    // sola: il giorno in cui il bonifico è partito). Senza i numeri davanti,
    // «segna pagate» su 211 fatture è un bottone che nessuno oserebbe premere.
    if (!bloccoConf) return null
    const daFare = bloccoConf.items.filter(f => f.stato !== 'pagata')
    const somma = daFare.reduce((acc, f) => acc + (Number(f.residuo) || Math.abs(Number(f.totale) || 0)), 0)
    return (
      <div style={{ ...card, padding: isMobile ? '14px 16px' : '16px 20px', marginBottom: 16, border: `2px solid ${T.brand}` }}>
        <div style={{ ...typo.bodyStrong, fontWeight: 800, color: T.text, marginBottom: 6, letterSpacing: '-0.01em' }}>
          Segno pagate {daFare.length} {daFare.length === 1 ? 'fattura' : 'fatture'} di "{bloccoConf.titolo}"
        </div>
        <div style={{ ...typo.small, color: T.textSoft, lineHeight: 1.55, marginBottom: 12 }}>
          In tutto <b style={{ color: T.text, ...tnum }}>{fmtEuro(somma)}</b>.
          Metto la stessa data di pagamento su tutte: usa il giorno in cui è partito il bonifico.
          Se qualcuna l'hai pagata in un altro giorno, correggila dopo dalla sua riga.
        </div>
        {/* La stessa spunta del pagamento singolo: in blocco pesa
            ancora di più, perché sono decine di uscite in una volta.
            Sulle fatture vecchie conviene tenerla SPENTA: quelle sono
            già state pagate nella realtà, e registrarle in cassa oggi
            sposterebbe l'uscita nel mese sbagliato. */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={registraInCassa}
            onChange={e => setRegistraInCassa(e.target.checked)}
            style={{ width: 20, height: 20, marginTop: 1, accentColor: T.brand, cursor: 'pointer', flexShrink: 0 }} />
          <span style={{ ...typo.small, color: T.textMid, lineHeight: 1.45 }}>
            Registra anche <b>{daFare.length} {daFare.length === 1 ? 'uscita' : 'uscite'} in Cassa</b>, con la data del pagamento.
            {' '}Se stai sistemando fatture vecchie già pagate, lascia questa spunta spenta:
            altrimenti l'uscita finisce nel mese di oggi invece che in quello in cui è avvenuta.
          </span>
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ ...typo.small, fontWeight: 700, color: T.textSoft, marginBottom: 4 }}>Data del pagamento</div>
            <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)}
              aria-label="Data del pagamento per tutte le fatture selezionate"
              style={{ padding: '9px 11px', minHeight: minTouch, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, color: T.text }} />
          </div>
          <button type="button" onClick={() => segnaPagateInBlocco(bloccoConf.items, dataPag)} disabled={bloccoLoading || !dataPag}
            style={{ padding: '10px 16px', minHeight: minTouch, borderRadius: 8, border: 'none', background: (bloccoLoading || !dataPag) ? T.border : T.brand, color: '#fff', ...typo.body, fontWeight: 800, cursor: (bloccoLoading || !dataPag) ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check" size={14} /> {bloccoLoading ? 'Le segno…' : `Sì, segna ${daFare.length} pagate`}
          </button>
          <button type="button" onClick={() => setBloccoConf(null)} disabled={bloccoLoading}
            style={{ padding: '10px 14px', minHeight: minTouch, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, ...typo.body, fontWeight: 700, color: T.textSoft, cursor: 'pointer' }}>
            Annulla
          </button>
        </div>
      </div>
    )
  }

  // «Attenzione: IBAN identico». In una funzione perché serve anche alla
  // pagina dove si scrivono gli IBAN uno dopo l'altro: è proprio lì che il
  // copia-incolla sbagliato è più facile.
  function AvvisoIbanUguale() {
    if (!ibanAlert) return null
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}>
        <VeloFinestra onChiudi={() => setIbanAlert(null)} />
        <div role="dialog" aria-modal="true" aria-label="Attenzione: IBAN identico"
          style={{ background: T.bgCard, borderRadius: 16, padding: '26px 28px', maxWidth: 480, width: '100%', boxShadow: '0 24px 60px rgba(204,0,0,0.28)', position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: T.brand }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: '#FEE2E2', color: T.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="warning" size={24} />
            </span>
            <div style={{ fontSize: 16, fontWeight: 900, color: T.brand, letterSpacing: '-0.01em' }}>Attenzione: IBAN identico</div>
          </div>
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6, marginBottom: 14 }}>
            {ibanAlert.tipo === 'azienda'
              ? <>L'IBAN che stai impostando per <b>la tua azienda</b> è esattamente uguale a quello del fornitore <b>{ibanAlert.fornitore}</b>. Sarebbe come pagare te stesso. Probabile errore di copia-incolla.</>
              : <>L'IBAN che stai impostando per il fornitore <b>{ibanAlert.fornitore}</b> è esattamente uguale all'IBAN della tua azienda. Sarebbe come pagare te stesso. Probabile errore di copia-incolla.</>}
          </div>
          <div style={{ background: T.bgSubtle || '#F8FAFC', border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 14px', fontSize: 12, color: T.textMid, lineHeight: 1.55, marginBottom: 18 }}>
            <b style={{ color: T.text }}>Cosa fare:</b> ricontrolla l'IBAN su una fattura cartacea / PEC del fornitore e inseriscilo correttamente. Se davvero usi lo stesso conto (raro), forza il salvataggio - ma sappi che il bonifico SEPA fallirà perché la banca rifiuta debtor == creditor.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setIbanAlert(null)} style={{ ...primaryBtn, padding: '10px 24px' }}>
              Ho capito, correggo
            </button>
          </div>
        </div>
      </div>
    )
  }


  // La barra del bonifico SEPA, in fondo allo schermo quando qualcosa è
  // spuntato. Sta in una funzione perché la mostrano anche le tre schermate
  // che si aprono dalle tessere: lì le caselle di spunta delle righe ci sono,
  // e senza questa barra spuntare una fattura non faceva comparire niente.
  function BarraBonifico() {
    if (!(selez.size > 0 || selFatt.size > 0)) return null
    // selez = fornitori (vista Per fornitore) -> includi tutte le fatture
    //         pagabili di quei fornitori.
    // selFatt = singole fatture (vista Per scadenza) -> includi solo
    //           quelle specifiche, se pagabili.
    const byFornitore = fattureExt.filter(f => f.stato !== 'pagata' && f.ibanValido && f.residuo > 0 && selez.has(normNome(f.fornitore)))
    const bySingolaFt = fattureExt.filter(f => f.stato !== 'pagata' && f.ibanValido && f.residuo > 0 && selFatt.has(f.id))
    // Dedup per id
    const seen = new Set()
    const selItems = [...byFornitore, ...bySingolaFt].filter(f => seen.has(f.id) ? false : (seen.add(f.id), true))
    const tot = selItems.reduce((s, f) => s + Math.abs(f.residuo), 0)
    const numFornitori = new Set(selItems.map(f => normNome(f.fornitore))).size
    return (
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 900, background: T.bgCard, borderTop: `1px solid ${T.border}`, boxShadow: '0 -6px 24px rgba(15,23,42,0.14)', padding: isMobile ? '12px 14px' : '14px 28px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 14 }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 600, ...tnum, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selItems.length.toLocaleString('it-IT', { useGrouping: 'always' })} fattur{selItems.length === 1 ? 'a' : 'e'} pagabil{selItems.length === 1 ? 'e' : 'i'} · {numFornitori} fornitor{numFornitori === 1 ? 'e' : 'i'} · <span style={{ color: T.brand, fontWeight: 800 }}>{fmtEuro(tot)}</span>
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, width: isMobile ? '100%' : 'auto' }}>
          <button onClick={() => { setSelez(new Set()); setSelFatt(new Set()) }} aria-label="Deseleziona tutti" style={{ ...ghostBtn, flex: isMobile ? 1 : '0 0 auto' }}>Deseleziona</button>
          <button onClick={() => {
            if (!ibanIsValid(azienda.iban)) { setEditAzienda(true); notify('Inserisci prima l\'IBAN azienda per generare il bonifico.', false); return }
            const tot = selItems.reduce((s, f) => s + Math.abs(f.residuo || f.totale || 0), 0)
            setSepaConfirm({ items: selItems, totale: tot })
          }} disabled={!selItems.length}
            aria-label="Genera bonifico SEPA"
            style={{ ...primaryBtn, flex: isMobile ? 1 : '0 0 auto', opacity: selItems.length ? 1 : 0.5 }}>
            <Icon name="download" size={14} /> Genera bonifico SEPA
          </button>
        </div>
      </div>
    )
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // LE SCHERMATE CHE SI APRONO DA QUESTA
  //
  // Si chiamano come funzioni e non come tag, come tutto il resto di questo
  // file: un componente dichiarato qui dentro e usato come `<Testata/>`
  // verrebbe rimontato a ogni disegno, e i campi perderebbero il fuoco mentre
  // ci si scrive dentro. È lo stesso motivo scritto sopra `Gruppo`.
  // ═══════════════════════════════════════════════════════════════════════════

  // La testata: il ritorno, il nome della pagina, e i due numeri che la
  // riassumono.
  function Testata({ titolo, spiega, n, tot, etichette = ['fattura', 'fatture'] }) {
    return (
      <div style={{ ...card, padding: isMobile ? '14px 16px' : '18px 22px', marginBottom: 14 }}>
        <button type="button" onClick={() => vaiA(null)}
          aria-label="Torna a Fornitori"
          style={{ ...ghostBtn, marginBottom: 12, minHeight: minTouch }}>
          <Icon name="arrowL" size={14} /> Fornitori
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? font.size.xl : font.size['2xl'], fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>{titolo}</h2>
            <div style={{ fontSize: font.size.base, color: T.textSoft, marginTop: 4, lineHeight: 1.5, maxWidth: 640 }}>{spiega}</div>
          </div>
          {n != null && (
            <div style={{ textAlign: isMobile ? 'left' : 'right', flexShrink: 0 }}>
              <div style={{ fontSize: isMobile ? font.size['2xl'] : font.size['3xl'], fontWeight: 800, color: T.text, ...tnum, letterSpacing: '-0.025em' }}>{fmtEuro0(tot)}</div>
              <div style={{ fontSize: font.size.sm, color: T.textSoft, ...tnum }}>
                {n.toLocaleString('it-IT', { useGrouping: 'always' })} {n === 1 ? etichette[0] : etichette[1]}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Lo stesso campo di ricerca della pagina principale: chi arriva qui dentro
  // cerca la fattura che gli hanno sollecitato, non vuole tornare indietro.
  function Cerca() {
    return (
      <div style={{ position: 'relative', marginBottom: 14, maxWidth: isMobile ? '100%' : 340 }}>
        <label htmlFor="scad-cerca-sotto" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textSoft, display: 'flex', pointerEvents: 'none' }}>
          <Icon name="search" size={15} />
        </label>
        <input id="scad-cerca-sotto" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cerca fornitore, numero o importo…"
          aria-label="Cerca fornitore, numero o importo"
          style={{ width: '100%', padding: isMobile ? '11px 12px 11px 36px' : '10px 14px 10px 36px', minHeight: minTouch, borderRadius: 9, border: `1px solid ${T.border}`, fontSize: font.size.base, color: T.text, boxSizing: 'border-box', outline: 'none' }} />
      </div>
    )
  }

  // Le tre schermate che si aprono dalle tessere: stesso elenco, fasce
  // diverse. Riusano `Gruppo`, quindi hanno anche «Segna pagate» di gruppo,
  // le azioni di riga e la paginazione a 60.
  function PaginaElenco({ titolo, spiega, chiavi, vuoto }) {
    const blocchi = chiavi
      .map(k => ({ k, items: (gruppi[k] || []).filter(matchSearch) }))
      .filter(b => b.items.length > 0)
    const n = blocchi.reduce((s, b) => s + b.items.length, 0)
    const tot = blocchi.reduce((s, b) => s + b.items.reduce((a, f) => a + (Number(f.residuo) || 0), 0), 0)
    return (
      <>
        {Testata({ titolo, spiega, n, tot })}
        {Cerca()}
        {ConfermaBlocco()}
        {loading
          ? <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: font.size.base }}>Caricamento…</div>
          : n === 0
            ? <div style={{ ...card, padding: 40, textAlign: 'center', color: T.textSoft, fontSize: font.size.base, lineHeight: 1.6 }}>
                {search ? 'Nessuna fattura per questa ricerca.' : vuoto}
              </div>
            : blocchi.map(b => Gruppo({ keyU: b.k, items: b.items }))}
      </>
    )
  }

  // ── Smistare le fatture senza punto vendita ──────────────────────────────
  //
  // Richiesta del titolare, 19/09/2026: «un tot a un punto vendita, un tot a
  // un altro». Prima c'era un solo comando, «Assegna tutte le 24 a…», e con
  // tre negozi mandava in blocco a uno solo quello che è di tre.
  //
  // Qui si può fare in tutt'e due i modi: la tendina su ogni riga per le
  // fatture che si riconoscono a occhio, e le caselle di spunta con
  // «assegna le selezionate» per i blocchi grossi.
  const LARG_IMPORTO_SMISTA = 130
  const LARG_SCEGLI_SEDE = 210

  function PaginaSmistamento() {
    const attive = (sedi || []).filter(s => s?.attiva !== false)
    const items = senzaSede.items.filter(matchSearch)
    const selezionate = items.filter(f => selSenzaSede.has(f.id))
    const tutteSpuntate = items.length > 0 && selezionate.length === items.length
    const tot = items.reduce((s, f) => s + Math.abs(Number(f.residuo) || 0), 0)
    const spunta = (id) => setSelSenzaSede(prev => {
      const nuovo = new Set(prev)
      if (nuovo.has(id)) nuovo.delete(id); else nuovo.add(id)
      return nuovo
    })
    return (
      <>
        {Testata({
          titolo: 'Fatture senza punto vendita',
          spiega: attive.length < 2
            ? 'Hai un solo punto vendita attivo: non c’è niente da smistare.'
            : 'Il Confronto sedi raggruppa per punto vendita: una fattura senza sede non entra nel conto di nessun negozio. Mandane un po’ a uno e un po’ a un altro — dalla tendina della riga, oppure spuntandone diverse e assegnandole insieme.',
          n: loading ? null : items.length, tot,
        })}
        {!loading && items.length > 0 && Cerca()}
        {/* Finché le fatture si stanno leggendo non si scrive «non c'è niente
            da smistare»: sarebbe una bugia che dura un secondo, ma è la
            differenza fra «non lo so ancora» e «zero». */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: font.size.base }}>Caricamento…</div>
        ) : items.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: T.textSoft, fontSize: font.size.base, lineHeight: 1.6 }}>
            {search ? 'Nessuna fattura per questa ricerca.' : 'Tutte le fatture hanno il loro punto vendita. Nel Confronto sedi entrano tutte.'}
          </div>
        ) : (
          <>
            <div style={{ ...card, padding: isMobile ? '12px 14px' : '12px 18px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button"
                onClick={() => setSelSenzaSede(tutteSpuntate ? new Set() : new Set(items.map(f => f.id)))}
                style={{ ...ghostBtn, minHeight: minTouch }}>
                <Icon name={tutteSpuntate ? 'x' : 'check'} size={14} />
                {tutteSpuntate ? 'Togli la selezione' : `Spunta tutte (${items.length.toLocaleString('it-IT', { useGrouping: 'always' })})`}
              </button>
              <span style={{ fontSize: font.size.base, color: T.textMid, ...tnum }}>
                {selezionate.length.toLocaleString('it-IT', { useGrouping: 'always' })} {selezionate.length === 1 ? 'selezionata' : 'selezionate'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }} />
              <select value={sedeBulk} onChange={e => setSedeBulk(e.target.value)}
                aria-label="Punto vendita per le fatture selezionate"
                style={{ minHeight: minTouch, padding: '0 12px', borderRadius: 9, border: `1px solid ${T.border}`, fontSize: font.size.base, color: T.text, background: T.bgCard, cursor: 'pointer', width: isMobile ? '100%' : LARG_SCEGLI_SEDE, boxSizing: 'border-box' }}>
                <option value="">Scegli il punto vendita…</option>
                {attive.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <button type="button"
                disabled={sedeSaving || !sedeBulk || selezionate.length === 0}
                onClick={async () => { await assegnaSede(selezionate, sedeBulk); setSelSenzaSede(new Set()) }}
                style={{ ...primaryBtn, minHeight: minTouch, width: isMobile ? '100%' : 'auto', opacity: (sedeSaving || !sedeBulk || selezionate.length === 0) ? 0.5 : 1, cursor: (sedeSaving || !sedeBulk || selezionate.length === 0) ? 'default' : 'pointer' }}>
                <Icon name="store" size={14} />
                {sedeSaving ? 'Assegno…' : `Assegna le ${selezionate.length.toLocaleString('it-IT', { useGrouping: 'always' })} spuntate`}
              </button>
            </div>
            <div style={{ ...card, overflow: 'hidden' }}>
              {items.map(f => {
                const spuntata = selSenzaSede.has(f.id)
                const inCorso = rigaSede === f.id
                return (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    padding: isMobile ? '10px 12px' : '10px 16px',
                    borderTop: `1px solid ${T.borderSoft}`,
                    background: spuntata ? T.brandLight : (inCorso ? T.greenLight : 'transparent'),
                  }}>
                    <input type="checkbox" checked={spuntata} onChange={() => spunta(f.id)}
                      aria-label={`Seleziona la fattura ${f.numero_rif || ''} di ${f.fornitore}`}
                      style={{ width: 20, height: 20, margin: 8, accentColor: T.brand, cursor: 'pointer', flexShrink: 0 }} />
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div title={f.fornitore} style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fornitore}</div>
                      <div style={{ fontSize: font.size.sm, color: T.textSoft, ...tnum, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.numero_rif || 'senza numero'} · {fmtDate(f.data_fattura)}
                      </div>
                    </div>
                    <div style={{ width: isMobile ? 'auto' : LARG_IMPORTO_SMISTA, textAlign: 'right', flexShrink: 0, fontSize: font.size.md, fontWeight: 700, color: T.text, ...tnum, whiteSpace: 'nowrap' }}>
                      {fmtEuro(Math.abs(Number(f.residuo) || 0))}
                    </div>
                    <select value="" disabled={sedeSaving}
                      onChange={async (e) => {
                        const scelta = e.target.value
                        if (!scelta) return
                        setRigaSede(f.id)
                        try { await assegnaSede([f], scelta) } finally { setRigaSede(null) }
                      }}
                      aria-label={`Punto vendita della fattura ${f.numero_rif || ''} di ${f.fornitore}`}
                      style={{ width: isMobile ? '100%' : LARG_SCEGLI_SEDE, minHeight: minTouch, padding: '0 10px', borderRadius: 9, border: `1px solid ${T.border}`, fontSize: font.size.base, color: T.text, background: T.bgCard, cursor: 'pointer', flexShrink: 0, boxSizing: 'border-box' }}>
                      <option value="">{inCorso ? 'Assegno…' : 'Manda a…'}</option>
                      {attive.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </>
    )
  }

  // ── Scrivere gli IBAN uno dopo l'altro ───────────────────────────────────
  //
  // Richiesta del titolare, 19/09/2026: l'avviso in cima era un riquadro
  // intero che diceva «manca l'IBAN a 38 fornitori» e offriva cinque pulsanti
  // «Scrivi l'IBAN», ognuno dei quali portava via dalla pagina. Adesso
  // l'avviso è una riga e questa è la pagina dove si scrivono tutti, in fila,
  // senza uscire e rientrare: invio salva e porta il cursore sul successivo.
  async function salvaIbanRiga(r, i) {
    const val = String(ibanBozze[r.nome_norm] || '').trim()
    if (!ibanIsValid(val)) { notify('Questo IBAN non è valido: ricontrolla lettere e cifre.', false); return }
    // Lo stesso controllo di `salvaFornitore`, ma prima: se l'IBAN è quello
    // dell'azienda il salvataggio non avviene, e segnare la riga come fatta
    // sarebbe una bugia.
    if (ibanIsValid(azienda.iban) && normalizeIban(val) === normalizeIban(azienda.iban)) {
      setIbanAlert({ tipo: 'fornitore', fornitore: r.nome })
      return
    }
    setIbanSalvando(r.nome_norm)
    try {
      await salvaFornitore(r.nome, { iban: val })
      setIbanFatti(prev => new Set(prev).add(r.nome_norm))
      const prossimo = document.getElementById(`iban-forn-${i + 1}`)
      if (prossimo) prossimo.focus()
    } finally {
      setIbanSalvando(null)
    }
  }

  function PaginaIban() {
    // L'elenco si congela quando si entra: senza, ogni riga salvata sparirebbe
    // e le altre salirebbero di un posto sotto le dita di chi scrive.
    if (!elencoIbanRef.current && senzaIban.righe.length > 0) elencoIbanRef.current = senzaIban.righe
    const righe = elencoIbanRef.current || []
    const fatti = righe.filter(r => ibanFatti.has(r.nome_norm)).length
    const restano = righe.filter(r => !ibanFatti.has(r.nome_norm))
    const totRestante = restano.reduce((s, r) => s + r.tot, 0)
    return (
      <>
        {Testata({
          titolo: 'IBAN dei fornitori',
          spiega: loading
            ? 'Sto leggendo le fatture aperte per capire a chi manca l’IBAN.'
            : righe.length === 0
              ? 'Tutti i fornitori a cui devi dei soldi hanno il loro IBAN: il bonifico può partire.'
              : 'L’IBAN si scrive una volta sola e vale per tutte le fatture di quel fornitore, anche quelle future. Sono in ordine di quanto pesano: scriverne cinque sblocca la maggior parte dell’importo. Invio salva e passa al successivo.',
          n: loading ? null : restano.length, tot: totRestante, etichette: ['fornitore da fare', 'fornitori da fare'],
        })}
        {/* Vale qui la stessa regola dello smistamento: «nessun IBAN da
            scrivere» si dice solo quando lo si sa davvero. */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: font.size.base }}>Caricamento…</div>
        ) : righe.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: T.textSoft, fontSize: font.size.base, lineHeight: 1.6 }}>
            Nessun IBAN da scrivere.
          </div>
        ) : (
          <>
            <div style={{ ...card, padding: isMobile ? '12px 14px' : '12px 18px', marginBottom: 14, fontSize: font.size.base, color: T.textMid, ...tnum }}>
              <b style={{ color: T.text }}>{fatti.toLocaleString('it-IT', { useGrouping: 'always' })}</b> di {righe.length.toLocaleString('it-IT', { useGrouping: 'always' })} fatti
              {fatti > 0 && <span style={{ color: T.green, fontWeight: 700 }}> · {fmtEuro0(righe.filter(r => ibanFatti.has(r.nome_norm)).reduce((s, r) => s + r.tot, 0))} sbloccati</span>}
            </div>
            <div style={{ ...card, overflow: 'hidden' }}>
              {righe.map((r, i) => {
                const fatto = ibanFatti.has(r.nome_norm)
                const bozza = ibanBozze[r.nome_norm] ?? ''
                const valido = ibanIsValid(bozza)
                return (
                  <div key={r.nome_norm} style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    padding: isMobile ? '10px 12px' : '10px 16px',
                    borderTop: `1px solid ${T.borderSoft}`,
                    background: fatto ? T.greenLight : 'transparent',
                  }}>
                    <div style={{ flex: '1 1 190px', minWidth: 0 }}>
                      <div title={r.nome} style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nome}</div>
                      <div style={{ fontSize: font.size.sm, color: T.textSoft, ...tnum }}>
                        {r.n.toLocaleString('it-IT', { useGrouping: 'always' })} {r.n === 1 ? 'fattura' : 'fatture'} · {fmtEuro(r.tot)}
                      </div>
                    </div>
                    <input id={`iban-forn-${i}`} value={bozza}
                      onChange={e => setIbanBozze(b => ({ ...b, [r.nome_norm]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); salvaIbanRiga(r, i) } }}
                      placeholder="IT00 A000 0000 0000 0000 0000 000"
                      aria-label={`IBAN di ${r.nome}`}
                      style={{
                        flex: '1 1 260px', minWidth: 0, minHeight: minTouch, padding: '0 12px',
                        borderRadius: 9, border: `1px solid ${bozza && !valido ? T.red : T.border}`,
                        fontSize: font.size.base, color: T.text, boxSizing: 'border-box', ...tnum,
                      }} />
                    <button type="button"
                      onClick={() => salvaIbanRiga(r, i)}
                      disabled={!valido || ibanSalvando === r.nome_norm}
                      style={{
                        ...primaryBtn, minHeight: minTouch, minWidth: 104, flexShrink: 0,
                        background: fatto ? T.green : T.brandGradient,
                        opacity: (!valido || ibanSalvando === r.nome_norm) ? 0.5 : 1,
                        cursor: (!valido || ibanSalvando === r.nome_norm) ? 'default' : 'pointer',
                      }}>
                      <Icon name={fatto ? 'check' : 'save'} size={14} />
                      {ibanSalvando === r.nome_norm ? 'Salvo…' : fatto ? 'Salvato' : 'Salva'}
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </>
    )
  }

  function SottoPagine() {
    if (sottoPagina === 'fatture-da-pagare') {
      return PaginaElenco({
        titolo: 'Da pagare',
        spiega: 'Tutte le fatture aperte, dalla più urgente alla più lontana. Gli importi sono netti delle note di credito e degli acconti già versati.',
        chiavi: ['scaduta', 'settimana', 'mese', 'futura'],
        vuoto: 'Non c’è niente da pagare: tutte le fatture caricate risultano saldate.',
      })
    }
    if (sottoPagina === 'fatture-scadute') {
      return PaginaElenco({
        titolo: 'Scadute',
        spiega: 'Le fatture il cui termine è già passato. Sono quelle su cui arriva il sollecito, e quelle che pesano sul rapporto col fornitore.',
        chiavi: ['scaduta'],
        vuoto: 'Nessuna fattura scaduta. Tutto in regola.',
      })
    }
    if (sottoPagina === 'fatture-in-scadenza') {
      return PaginaElenco({
        titolo: 'In scadenza',
        spiega: 'Le fatture che scadono nei prossimi sette giorni: quelle da mettere nel bonifico di questa settimana.',
        chiavi: ['settimana'],
        vuoto: 'Nei prossimi sette giorni non scade niente.',
      })
    }
    if (sottoPagina === 'fatture-senza-sede') return PaginaSmistamento()
    if (sottoPagina === 'fornitori-senza-iban') return PaginaIban()
    return null
  }

  const padBottom = selez.size > 0 ? (isMobile ? 200 : 96) : (isMobile ? 80 : 0)

  // Una delle schermate che si aprono da qui. Non è un filtro su questa
  // pagina: è un'altra pagina, con il suo nome e il suo ritorno.
  if (sottoPagina) {
    return (
      <div style={{ maxWidth: 1180, padding: isMobile ? 12 : 0, paddingBottom: padBottom }}>
        {Toast()}
        {AvvisoIbanUguale()}
        {SottoPagine()}
        {BarraBonifico()}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 1180, padding: isMobile ? 12 : 0, paddingBottom: padBottom }}>
      {/* Toast */}
      {Toast()}

      {/* Modale eliminazione bulk - doppia conferma (frase da digitare) */}
      {bulkOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {/* Mentre sta cancellando il velo non chiude niente: `attivo={false}`
              vale sia per il clic sia per Esc. */}
          <VeloFinestra colore="rgba(15,23,42,0.55)" attivo={!bulkDeleting}
            onChiudi={() => { setBulkOpen(false); setBulkConfirm('') }} />
          <div role="dialog" aria-modal="true" aria-label="Eliminare tutte le fatture?"
            style={{ position: 'relative', background: T.bgCard, borderRadius: 16, maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: '#FEE2E2', color: T.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>
              </span>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>Eliminare tutte le fatture?</div>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.6, marginBottom: 16 }}>
                Stai per eliminare <b style={{ color: T.brand }}>{fatture.length} {fatture.length === 1 ? 'fattura' : 'fatture'}</b>{haPiuSedi ? (scopeSede === 'attiva' ? ' della sede attiva (e condivise)' : ' di tutte le sedi') : ''}. <b>L'azione è irreversibile</b>: una volta eliminate non si possono recuperare.
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 7 }}>
                Per confermare scrivi <b style={{ color: T.brand, letterSpacing: '0.05em' }}>ELIMINA</b>
              </div>
              <input value={bulkConfirm} onChange={e => setBulkConfirm(e.target.value)} placeholder="ELIMINA" autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && bulkConfirm.trim().toUpperCase() === 'ELIMINA') eliminaTutte() }}
                style={{ width: '100%', padding: '11px 12px', minHeight: isMobile ? 44 : 'auto', border: `1px solid ${bulkConfirm && bulkConfirm.trim().toUpperCase() !== 'ELIMINA' ? '#F3C7C2' : T.border}`, borderRadius: 9, fontSize: 14, boxSizing: 'border-box', letterSpacing: '0.06em', textTransform: 'uppercase', outline: 'none' }} />
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <button onClick={() => { setBulkOpen(false); setBulkConfirm('') }} disabled={bulkDeleting} style={{ ...ghostBtn, flex: isMobile ? 1 : '0 0 auto' }}>Annulla</button>
              <button onClick={eliminaTutte}
                disabled={bulkConfirm.trim().toUpperCase() !== 'ELIMINA' || bulkDeleting}
                aria-label={`Elimina ${fatture.length} fatture`}
                style={{ padding: '11px 18px', minHeight: minTouch, borderRadius: R.md, border: 'none', background: T.brand, color: '#fff', fontSize: 13, fontWeight: 700, flex: isMobile ? 1 : '0 0 auto',
                  cursor: (bulkConfirm.trim().toUpperCase() === 'ELIMINA' && !bulkDeleting) ? 'pointer' : 'not-allowed',
                  opacity: (bulkConfirm.trim().toUpperCase() === 'ELIMINA' && !bulkDeleting) ? 1 : 0.5 }}>
                {bulkDeleting ? 'Eliminazione…' : `Elimina ${fatture.length.toLocaleString('it-IT', { useGrouping: 'always' })} ${fatture.length === 1 ? 'fattura' : 'fatture'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', marginBottom: 20, gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 14 : 13, color: T.textSoft, letterSpacing: '-0.005em', ...tnum }}>
            {/* Audit 2026-09-09: qui la spesa era chiamata "fatturato", su
                fatture di FORNITORI, cioè su quello che l'azienda SPENDE.
                Per Mara sono 82.676 EUR, che letti come fatturato dicono
                l'opposto della verita' sul suo stato di salute. */}
            {fatture.length.toLocaleString('it-IT', { useGrouping: 'always' })} {fatture.length === 1 ? 'fattura' : 'fatture'} dai fornitori · {fmtEuro(fatture.reduce((s,f) => s+(f.totale||0), 0))} di spesa registrata
          </div>
        </div>
        {/* Toolbar consolidato: 1 CTA primario "Importa .xlsx" + 1 dropdown
            "Altre azioni" con TUTTI gli altri (Import XML SDI, FatturaSMART,
            Export Excel/PDF, Elimina tutte). Sostituisce 6 bottoni inline. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: isMobile ? '100%' : 'auto', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <label style={{ ...primaryBtn, cursor: 'pointer', flex: isMobile ? 1 : '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {importLoading ? <><Icon name="hourglass" size={14} /> Importazione…</> : <><Icon name="folder" size={14} /> Importa .xlsx</>}
            <input type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }}
              onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) chiediSede(files, handleImportExcel) }} />
          </label>
          <div ref={actionsRef} style={{ position: 'relative', flex: '0 0 auto' }}>
            <button onClick={() => setActionsOpen(o => !o)}
              aria-label="Altre azioni" aria-expanded={actionsOpen}
              style={{ ...ghostBtn, padding: isMobile ? '10px 14px' : '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
              Altre azioni
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: actionsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {actionsOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                minWidth: 240,
                background: 'linear-gradient(180deg, #FFFFFF 0%, #FBF6F2 100%)',
                border: `1px solid ${T.border}`, borderRadius: 12,
                boxShadow: '0 18px 48px rgba(15,23,42,0.22), 0 0 0 1px rgba(255,255,255,0.6) inset',
                padding: 6, zIndex: 100, overflow: 'hidden',
                animation: '_fos_scadenzario_drop 180ms cubic-bezier(.32,.72,0,1)',
              }}>
                <style>{`@keyframes _fos_scadenzario_drop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                <div aria-hidden="true" style={{ height: 2, margin: '-6px -6px 6px', background: 'linear-gradient(90deg, #E84B3A 0%, #FFB350 50%, #6E0E1A 100%)', opacity: 0.7 }}/>
                {/* IMPORT alternativi */}
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 10px 4px' }}>Importa da altro</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: 13, color: T.text, cursor: 'pointer', fontWeight: 500 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F4EEEA' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Icon name="fileText" size={14} color={T.textSoft} /> XML SDI
                  <input type="file" accept=".xml,.p7m" multiple style={{ display: 'none' }}
                    onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) { setActionsOpen(false); chiediSede(files, handleImportXML) } }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: font.size.base, color: T.text, cursor: 'pointer', fontWeight: 500 }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.bgSubtle }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  title="Il CSV dei movimenti che scarichi dalla banca: cerco quali uscite corrispondono a quali fatture">
                  <Icon name="bank" size={14} color={T.textSoft} /> Estratto conto banca
                  <input type="file" accept=".csv,.txt" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setActionsOpen(false); handleImportBanca(f) } }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: 13, color: T.text, cursor: 'pointer', fontWeight: 500 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F4EEEA' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <Icon name="barChart" size={14} color={T.textSoft} /> FatturaSMART
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                    onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) { setActionsOpen(false); chiediSede(files, handleImportSMART) } }} />
                </label>
                {fatture.length > 0 && (
                  <>
                    <div style={{ height: 1, background: T.border, margin: '6px 4px' }}/>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 10px 4px' }}>Esporta</div>
                    <button onClick={() => { setActionsOpen(false); exportExcel() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: 13, color: T.text, cursor: 'pointer', fontWeight: 500, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F4EEEA' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <Icon name="download" size={14} color={T.textSoft} /> Esporta Excel
                    </button>
                    <button onClick={async () => {
                      setActionsOpen(false);
                      const list = gruppiVisibili.flatMap(k => gruppi[k] || []);
                      if (!(await gateExport('scadenzario', { n_items: list.length }, window.__foodos_notify))) return;
                      const c = getExportCtx();
                      exportScadenzario(list, c.nomeAttivita, c.email);
                    }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: 13, color: T.text, cursor: 'pointer', fontWeight: 500, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F4EEEA' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <Icon name="fileText" size={14} color={T.textSoft} /> Esporta PDF
                    </button>
                    <div style={{ height: 1, background: T.border, margin: '6px 4px' }}/>
                    <button onClick={() => { setActionsOpen(false); setBulkConfirm(''); setBulkOpen(true) }}
                      title="Elimina tutte le fatture caricate"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: 13, color: T.brand, cursor: 'pointer', fontWeight: 600, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                      Elimina tutte le fatture
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Le tre tessere. Non sono numeri fermi e non sono filtri: ognuna apre
          una pagina sua, con il suo nome in cima e il suo ritorno. Richiesta
          del titolare, 19/09/2026: «non si devono aprire nella stessa pagina,
          deve essere un'altra». */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
        gap: isMobile ? 12 : 14,
        marginBottom: isMobile ? 16 : 22,
      }}>
        {[
          {
            label: 'Da pagare',
            val: fmtEuro0(summary.daPagare),
            exact: fmtEuro(summary.daPagare),
            sub: `${summary.nDaPagare.toLocaleString('it-IT', { useGrouping: 'always' })} ${summary.nDaPagare === 1 ? 'fattura aperta' : 'fatture aperte'}`,
            color: summary.daPagare > 0 ? T.text : T.textSoft,
            accent: T.text,
            onClick: () => vaiA('fatture-da-pagare'),
            apre: 'Apri l\'elenco di tutte le fatture aperte',
          },
          {
            label: 'Scadute',
            val: fmtEuro0(summary.scaduto),
            exact: fmtEuro(summary.scaduto),
            sub: summary.nScadute > 0
              ? `${summary.nScadute.toLocaleString('it-IT', { useGrouping: 'always' })} ${summary.nScadute === 1 ? 'fattura' : 'fatture'} da regolare subito`
              : 'nessuna fattura scaduta',
            color: summary.scaduto > 0 ? T.brand : T.green,
            accent: summary.scaduto > 0 ? T.brand : T.green,
            onClick: () => vaiA('fatture-scadute'),
            apre: 'Apri l\'elenco delle fatture scadute',
            urgent: summary.scaduto > 0,
          },
          {
            label: 'In scadenza',
            val: fmtEuro0(summary.settimanaTot),
            exact: fmtEuro(summary.settimanaTot),
            sub: summary.nSettimana > 0
              ? `${summary.nSettimana.toLocaleString('it-IT', { useGrouping: 'always' })} ${summary.nSettimana === 1 ? 'fattura' : 'fatture'} questa settimana`
              : 'nulla in scadenza',
            color: summary.settimanaTot > 0 ? '#9A3412' : T.textSoft,
            accent: summary.settimanaTot > 0 ? '#F97316' : T.border,
            onClick: () => vaiA('fatture-in-scadenza'),
            apre: 'Apri l\'elenco delle fatture che scadono entro sette giorni',
          },
        ].map(k => (
          <button key={k.label} type="button" onClick={k.onClick}
            aria-label={`${k.label}: ${k.exact}. ${k.sub}. ${k.apre}`}
            style={{
              ...card,
              padding: isMobile ? '16px 18px 16px 20px' : isTablet ? '16px 20px 16px 22px' : '18px 22px 18px 24px',
              textAlign: 'left',
              cursor: 'pointer',
              font: 'inherit',
              position: 'relative',
              // Sul telefono le tre tessere sono impilate a tutta larghezza:
              // non c'è niente di affiancato da incolonnare, e con l'etichetta
              // in alto a sinistra e la cifra in basso a destra restava un
              // vuoto largo mezza pagina in diagonale. 124px per scrivere
              // "0 €" per tre volte, cioè quasi mezzo schermo di telefono
              // prima della prima fattura.
              minHeight: isMobile ? 0 : isTablet ? 130 : 138,
              // Sul telefono etichetta e cifra stanno sulla stessa riga e la
              // riga di spiegazione va sotto: le cifre delle tre tessere
              // impilate cadono comunque tutte alla stessa ascissa, che è il
              // motivo per cui erano a destra.
              display: 'flex', flexDirection: 'column',
              ...(isMobile ? { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10 } : null),
              borderLeft: `4px solid ${k.accent}`,
              boxShadow: k.urgent ? '0 1px 2px rgba(110,14,26,0.08), 0 10px 28px rgba(110,14,26,0.10)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
              transition: `box-shadow ${M.durBase} ${M.ease}, transform ${M.durBase} ${M.ease}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,23,42,0.08), 0 16px 36px rgba(15,23,42,0.08)'; e.currentTarget.style.transform = 'translateY(-3px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = k.urgent ? '0 1px 2px rgba(110,14,26,0.08), 0 10px 28px rgba(110,14,26,0.10)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'; e.currentTarget.style.transform = 'translateY(0)' }}>
            {/* Le tre tessere stanno affiancate: etichetta, importo e riga
                sotto devono essere INCOLONNATI fra loro. Prima il valore era
                allineato a sinistra dentro il bottone, quindi le tre cifre
                partivano da tre punti diversi e l'occhio non poteva
                confrontarle. Ora sono a destra, con le altezze minime
                uguali, come le altre bande del prodotto. */}
            <div style={{ fontSize: font.size.sm, fontWeight: 600, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.05em', minHeight: isMobile ? 0 : 30, display: 'flex', alignItems: isMobile ? 'center' : 'flex-start', lineHeight: 1.3, textAlign: 'left', flex: isMobile ? 1 : 'none', minWidth: 0 }}>
              <span style={{ flex: isMobile ? 'none' : 1, minWidth: 0 }}>{k.label}</span>
              <span aria-hidden="true" style={{ display: 'inline-flex', color: T.textSoft, marginLeft: 6, flexShrink: 0 }}><Icon name="chevR" size={14} /></span>
            </div>
            <div title={k.exact} style={{
              // Su tablet il corpo scende: con importi a sette cifre il
              // numero a 28px veniva troncato coi puntini.
              fontSize: isMobile ? font.size['3xl'] : isTablet ? font.size['3xl'] : 28, fontWeight: 700, color: k.color, lineHeight: 1.05,
              letterSpacing: '-0.025em', ...tnum,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              minHeight: isMobile ? 0 : 38, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0,
            }}>{k.val}</div>
            <div style={{ fontSize: font.size.sm, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.35, minHeight: isMobile ? 0 : 34, marginTop: isMobile ? 4 : 6, width: isMobile ? '100%' : 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: isMobile ? 'flex-start' : 'flex-end', textAlign: isMobile ? 'left' : 'right' }}>{k.sub}</div>
          </button>
        ))}
      </div>

      {/* Le fatture senza punto vendita.
          Il Confronto sedi raggruppa per negozio, quindi una fattura con la
          sede vuota non entra nel conto di nessuno.
          Qui c'è solo l'avviso: lo smistamento vero è una pagina a parte.
          Prima il pulsante apriva una tendina e mandava TUTTE le fatture a
          una sede sola — il titolare ne ha tre e vanno divise: «un tot a un
          punto vendita, un tot a un altro» (19/09/2026). */}
      {!loading && senzaSede.n > 0 && (
        <div style={{ ...card, padding: isMobile ? '12px 14px' : '12px 18px', marginBottom: 14, borderLeft: `4px solid ${T.blue}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="store" size={16} color={T.blue} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 200, fontSize: font.size.base, color: T.textMid, lineHeight: 1.5 }}>
            <b style={{ color: T.text }}>{senzaSede.n.toLocaleString('it-IT', { useGrouping: 'always' })} {senzaSede.n === 1 ? 'fattura' : 'fatture'} senza punto vendita</b>
            {' '}per {fmtEuro(senzaSede.totale)}: nel Confronto sedi non entrano nel conto di nessun negozio.
          </div>
          <button type="button" onClick={() => vaiA('fatture-senza-sede')}
            style={{ ...ghostBtn, minHeight: minTouch, flexShrink: 0, width: isMobile ? '100%' : 'auto' }}>
            <Icon name="store" size={14} /> Smistale fra i negozi
          </button>
        </div>
      )}

      {/* Fatture fuori scala rispetto alla storia del loro fornitore.
          Nei dati veri: GECKO CIOCCOLATI ha UNA fattura da 86.651 €, l'11,5%
          di tutto il debito. Può essere giusta — o può essere un punto nel
          posto sbagliato, che è esattamente la forma che ha questo errore.
          Meglio guardarla adesso che scoprirlo quando si paga. */}
      {!loading && anomale.length > 0 && (
        <div style={{ ...card, padding: isMobile ? '14px' : '14px 18px', marginBottom: 14, borderLeft: `4px solid ${T.amber}` }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Icon name="alert" size={16} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, marginBottom: 3 }}>
                {anomale.length === 1 ? 'Una fattura è fuori scala' : `${anomale.length} fatture sono fuori scala`}
              </div>
              <div style={{ fontSize: font.size.base, color: T.textMid, lineHeight: 1.5, marginBottom: 8 }}>
                Molto più grandi del solito per quel fornitore. Può essere giusto — o può essere
                un punto nel posto sbagliato: vale un controllo prima di pagarle.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {anomale.slice(0, 5).map(a => (
                  <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: font.size.base }}>
                    <span style={{ fontWeight: 700, color: T.text, flex: 1, minWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.fornitore}
                    </span>
                    <span style={{ color: T.textMid, ...tnum, whiteSpace: 'nowrap' }}>
                      fatt. {a.numero_rif || 's.n.'} · <b>{fmtEuro(a.totale)}</b>
                    </span>
                    <span style={{ color: T.amber, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {a.quanteVolte.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })}× il solito ({fmtEuro0(a.mediana)})
                    </span>
                    <button type="button" onClick={() => { setVista('scadenza'); setFiltro('tutte'); setSearch(a.numero_rif || a.fornitore) }}
                      style={{ padding: '6px 11px', minHeight: 36, borderRadius: 7, border: `1px solid ${T.border}`, background: T.bgCard, color: T.textMid, fontSize: font.size.sm, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Vedila
                    </button>
                  </div>
                ))}
                {anomale.length > 5 && (
                  <div style={{ fontSize: font.size.sm, color: T.textSoft }}>… e altre {anomale.length - 5}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Le fatture vecchie da sistemare: uno strumento, non un lavoro a mano.
          Non fa niente da sé: apre la stessa conferma di "Segna pagate", con
          scritto quante sono e da quanto. */}
      {!loading && vecchieDaSistemare.n > 0 && (
        <div style={{ ...card, padding: isMobile ? '14px' : '14px 18px', marginBottom: 14, borderLeft: `4px solid ${T.textSoft}` }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Icon name="clock" size={16} color={T.textSoft} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, marginBottom: 3 }}>
                {vecchieDaSistemare.n.toLocaleString('it-IT', { useGrouping: 'always' })} {vecchieDaSistemare.n === 1 ? 'fattura scaduta' : 'fatture scadute'} da più di sei mesi
              </div>
              <div style={{ fontSize: font.size.base, color: T.textMid, lineHeight: 1.5 }}>
                Valgono {fmtEuro(vecchieDaSistemare.totale)} e stanno gonfiando il totale da pagare.
                Se le hai già saldate — succede sempre, perché l'importazione porta dentro tutti i
                documenti come "da pagare" — puoi segnarle pagate in un colpo, invece di aprirle una
                per una. Controlla prima l'elenco: quello che segni pagato non torna indietro da solo.
              </div>
            </div>
            <button type="button"
              onClick={() => setBloccoConf({ items: vecchieDaSistemare.items, titolo: 'scadute da più di sei mesi' })}
              disabled={bloccoLoading}
              style={{
                padding: '10px 16px', minHeight: 44, borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.bgCard, color: T.textMid,
                fontSize: font.size.base, fontWeight: 700, cursor: bloccoLoading ? 'default' : 'pointer',
                whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
              }}>
              <Icon name="check" size={14} /> Segnale pagate
            </button>
          </div>
        </div>
      )}

      {/* Perché il bonifico non parte, e come sbloccarlo.
          Sui dati veri: 0 fatture su 3.520 portano un IBAN e in anagrafica
          ce l'ha 1 fornitore su 615.
          Era un riquadro intero con cinque pulsanti «Scrivi l'IBAN», e ognuno
          di quei pulsanti portava via dalla pagina. Richiesta del titolare,
          19/09/2026: «deve diventare una o due righe con un pulsante, e il
          pulsante porta a una pagina dove quei 38 IBAN si scrivono uno dopo
          l'altro senza uscire e rientrare». */}
      {!loading && senzaIban.n > 0 && (
        <div style={{ ...card, padding: isMobile ? '12px 14px' : '12px 18px', marginBottom: 14, borderLeft: `4px solid ${T.amber}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="bank" size={16} color={T.amber} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 200, fontSize: font.size.base, color: T.textMid, lineHeight: 1.5 }}>
            <b style={{ color: T.text }}>Il bonifico automatico non può partire: manca l'IBAN a {senzaIban.n.toLocaleString('it-IT', { useGrouping: 'always' })} {senzaIban.n === 1 ? 'fornitore' : 'fornitori'}</b>
            {' '}per {fmtEuro(senzaIban.totale)} da pagare.
          </div>
          <button type="button" onClick={() => vaiA('fornitori-senza-iban')}
            style={{ ...primaryBtn, minHeight: minTouch, flexShrink: 0, width: isMobile ? '100%' : 'auto' }}>
            <Icon name="bank" size={14} /> Scrivi gli IBAN
          </button>
        </div>
      )}

      {/* Conto pagamenti azienda (debtor del bonifico SEPA) */}
      <div style={{ ...card, padding: isMobile ? '12px 14px' : '12px 18px', marginBottom: 16, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 12 : 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.textMid, fontWeight: 600, flexShrink: 0 }}>
          <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: ibanIsValid(azienda.iban) ? '#EFF6FF' : T.bgSubtle, color: ibanIsValid(azienda.iban) ? '#1D4ED8' : T.textSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </span>
          Conto pagamenti
        </span>
        {!editAzienda ? (
          <>
            {/* Sul telefono la frase va a capo invece di troncarsi: "serve
                per generare i …" non dice niente, e questa è la riga che
                spiega perché il bottone rosso qui accanto esiste. L'IBAN vero
                resta su una riga sola, che è un codice e a capo si legge
                peggio. */}
            <span title={ibanIsValid(azienda.iban) ? `${azienda.nome ? azienda.nome + ' · ' : ''}${normalizeIban(azienda.iban)}` : ''} style={{ fontSize: 12, color: ibanIsValid(azienda.iban) ? T.text : T.textSoft, ...tnum, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: (isMobile && !ibanIsValid(azienda.iban)) ? 'normal' : 'nowrap', lineHeight: 1.45 }}>
              {ibanIsValid(azienda.iban) ? `${azienda.nome ? azienda.nome + ' · ' : ''}${normalizeIban(azienda.iban)}` : 'IBAN azienda non impostato - serve per generare i bonifici SEPA'}
            </span>
            {/* CTA: se IBAN mancante, bottone primario (rosso) ben visibile.
                Se gia impostato, ghost button discreto per modifica. */}
            {ibanIsValid(azienda.iban) ? (
              <button onClick={() => setEditAzienda(true)} aria-label="Modifica conto pagamenti" style={{ ...ghostBtn, padding: isMobile ? '10px 16px' : '7px 14px', flexShrink: 0 }}>
                Modifica
              </button>
            ) : (
              <button onClick={() => setEditAzienda(true)} aria-label="Imposta IBAN azienda"
                style={{ ...primaryBtn, padding: isMobile ? '10px 16px' : '8px 16px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, boxShadow: '0 2px 8px rgba(110,14,26,0.25)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                Imposta IBAN ora →
              </button>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'center', flex: 1, width: '100%' }}>
            <input placeholder="Intestatario conto (azienda)" value={azienda.nome} onChange={e => setAzienda(a => ({ ...a, nome: e.target.value }))}
              style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, minWidth: 0, flex: isMobile ? '1 1 100%' : '1 1 200px', width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }} />
            <input placeholder="IBAN azienda" value={azienda.iban} onChange={e => setAzienda(a => ({ ...a, iban: e.target.value }))}
              style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${azienda.iban && !ibanIsValid(azienda.iban) ? T.brand : T.border}`, borderRadius: 9, fontSize: 13, minWidth: 0, flex: isMobile ? '1 1 100%' : '1 1 240px', width: isMobile ? '100%' : 'auto', boxSizing: 'border-box', ...tnum }} />
            <input placeholder="BIC (opz.)" value={azienda.bic} onChange={e => setAzienda(a => ({ ...a, bic: e.target.value }))}
              style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, width: isMobile ? '100%' : 130, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, width: isMobile ? '100%' : 'auto' }}>
              <button onClick={() => salvaAzienda(azienda)} disabled={!ibanIsValid(azienda.iban)} style={{ ...primaryBtn, flex: isMobile ? 1 : '0 0 auto', opacity: !ibanIsValid(azienda.iban) ? 0.5 : 1 }}>Salva</button>
              <button onClick={() => { setEditAzienda(false); loadAzienda() }} style={{ ...ghostBtn, flex: isMobile ? 1 : '0 0 auto' }}>Annulla</button>
            </div>
          </div>
        )}
      </div>

      {/* Toggle vista + ricerca */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 12, marginBottom: 16 }}>
        {/* Sul telefono le tre (o quattro) viste vanno su due colonne, non
            tutte in fila. In fila ognuna aveva 71px: «Cassa in uscita» ne
            chiede 80 e finiva tagliata a «Cassa in usc…», che è un'etichetta
            che non dice più cosa fa. */}
        <div style={{
          display: isMobile ? 'grid' : 'flex',
          gridTemplateColumns: isMobile ? '1fr 1fr' : undefined,
          background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: 10,
          padding: 3, gap: isMobile ? 3 : 2, width: isMobile ? '100%' : 'auto',
        }}>
          {[
            { id: 'scadenza', label: 'Per scadenza', icon: 'calendar' },
            { id: 'fornitore', label: 'Per fornitore', icon: 'factory' },
            { id: 'cassa', label: 'Cassa in uscita', icon: 'money' },
            // Le fisse compaiono come vista solo se ce ne sono: una scheda
            // vuota è un invito a cliccare per niente.
            ...(fisseMensili.length > 0 ? [{ id: 'fisse', label: 'Fisse mensili', icon: 'refresh' }] : []),
          ].map(v => {
            const active = vista === v.id
            return (
              <button key={v.id} onClick={() => setVista(v.id)}
                aria-pressed={active}
                aria-label={`Vista ${v.label}`}
                style={{ padding: isMobile ? '9px 8px' : '8px 14px', minHeight: minTouch, borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: active ? 700 : 500, letterSpacing: '-0.005em',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  flex: isMobile ? 1 : '0 0 auto',
                  background: active ? T.bgCard : 'transparent', color: active ? T.text : T.textMid,
                  boxShadow: active ? '0 1px 3px rgba(15,23,42,0.10)' : 'none', transition: 'all 0.14s' }}>
                <Icon name={v.icon} size={14} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</span>
              </button>
            )
          })}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: isMobile ? '100%' : 320, width: isMobile ? '100%' : 'auto' }}>
          <label htmlFor="scad-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textSoft, display: 'flex', pointerEvents: 'none' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </label>
          <input id="scad-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca fornitore o numero…"
            aria-label="Cerca fornitore o numero"
            style={{ width: '100%', padding: isMobile ? '11px 12px 11px 36px' : '10px 14px 10px 36px', minHeight: minTouch, borderRadius: 9, border: `1px solid ${T.border}`, fontSize: 13, color: T.text, boxSizing: 'border-box', outline: 'none' }} />
        </div>
      </div>

        {/* Riconciliazione con l'estratto conto: si VEDONO gli abbinamenti
            prima di applicarli. I "certi" arrivano spuntati, gli altri no. */}
        {banca && (
          <div style={{ ...card, padding: isMobile ? '14px 16px' : '18px 22px', marginBottom: 16, border: `2px solid ${T.blue}` }}>
            <div style={{ ...typo.bodyStrong, fontWeight: 800, color: T.text, marginBottom: 4 }}>
              Estratto conto: {banca.movimenti.length} uscite lette da {banca.nomeFile}
            </div>
            <div style={{ ...typo.small, color: T.textSoft, lineHeight: 1.55, marginBottom: 12 }}>
              Ho cercato quali corrispondono alle tue fatture aperte. Spunta quelle giuste e le segno
              pagate: quelle sicure sono già spuntate, le altre le decidi tu.
              {banca.avvisi.length > 0 && <div style={{ marginTop: 4, color: T.amber }}>{banca.avvisi.join(' ')}</div>}
            </div>

            {banca.abbinamenti.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto', marginBottom: 12 }}>
                {banca.abbinamenti.map((a, i) => {
                  const spuntato = banca.scelti.has(i)
                  const col = a.certezza === 'certo' ? T.green : a.certezza === 'probabile' ? T.blue : T.amber
                  return (
                    <label key={i} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px',
                      background: spuntato ? T.bgSubtle : T.bgCard, border: `1px solid ${spuntato ? col : T.border}`,
                      borderRadius: 9, cursor: 'pointer',
                    }}>
                      <input type="checkbox" checked={spuntato}
                        onChange={e => setBanca(b => {
                          const scelti = new Set(b.scelti)
                          if (e.target.checked) scelti.add(i); else scelti.delete(i)
                          return { ...b, scelti }
                        })}
                        style={{ width: 20, height: 20, marginTop: 1, accentColor: T.brand, cursor: 'pointer', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: font.size.base, fontWeight: 700, color: T.text, ...tnum }}>
                            {String(a.movimento.data).split('-').reverse().join('/')} · {fmtEuro(a.movimento.importo)}
                          </span>
                          <span style={{ fontSize: font.size.xs, fontWeight: 700, color: col, background: `${col}18`, padding: '1px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {a.certezza}
                          </span>
                        </div>
                        <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.movimento.descrizione || 'senza descrizione'}
                        </div>
                        <div style={{ fontSize: font.size.base, color: T.textMid, marginTop: 4, lineHeight: 1.45 }}>
                          → {a.fatture.map(rf => `${rf.fornitore}${rf.numero_rif ? ` fatt. ${rf.numero_rif}` : ''}`).join(' + ')}
                          <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 1 }}>{a.motivo}</div>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            {banca.nonAbbinati.length > 0 && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ ...typo.small, fontWeight: 700, color: T.textMid, cursor: 'pointer', padding: '6px 0' }}>
                  {banca.nonAbbinati.length} {banca.nonAbbinati.length === 1 ? 'uscita che non ho abbinato' : 'uscite che non ho abbinato'} — guardale
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {banca.nonAbbinati.map((mv, i) => (
                    <div key={i} style={{ fontSize: font.size.base, color: T.textMid, padding: '6px 10px', background: T.bgSubtle, borderRadius: 7 }}>
                      <span style={{ ...tnum, fontWeight: 700, color: T.text }}>
                        {String(mv.data).split('-').reverse().join('/')} · {fmtEuro(mv.importo)}
                      </span>
                      {' — '}{mv.descrizione || 'senza descrizione'}
                      <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 1 }}>{mv.motivo}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={registraInCassa} onChange={e => setRegistraInCassa(e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 1, accentColor: T.brand, cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ ...typo.small, color: T.textMid, lineHeight: 1.45 }}>
                Registra in <b>Cassa</b> un'uscita per ogni movimento spuntato, con la data della banca.
                Se le uscite di questo periodo le hai già in prima nota, lascia spento per non contarle due volte.
              </span>
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={applicaAbbinamenti} disabled={bancaSaving || banca.scelti.size === 0}
                style={{
                  padding: '11px 18px', minHeight: 44, borderRadius: 8, border: 'none',
                  background: (bancaSaving || banca.scelti.size === 0) ? T.border : T.blue, color: '#fff',
                  ...typo.body, fontWeight: 800, cursor: (bancaSaving || banca.scelti.size === 0) ? 'default' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                <Icon name="check" size={14} />
                {bancaSaving ? 'Applico…' : `Segna pagate le ${banca.scelti.size} spuntate`}
              </button>
              <button type="button" onClick={() => setBanca(null)} disabled={bancaSaving}
                style={{ padding: '11px 16px', minHeight: 44, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, ...typo.body, fontWeight: 700, color: T.textSoft, cursor: 'pointer' }}>
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Pagamento cumulativo: si scrive l'importo e si VEDE il piano
            prima di applicarlo. Su 99 fatture un'imputazione sbagliata non
            si disfa a mano, quindi niente automatismi silenziosi. */}
        {pagCum && (() => {
          const gruppo = rollupFornitori.find(g => g.nome_norm === pagCum.nome_norm)
          const aperte = gruppo?.items || []
          const importoNum = Number(String(pagCum.testo).replace(/\./g, '').replace(',', '.')) || 0
          const piano = importoNum > 0 ? imputaPagamento(aperte, importoNum) : null
          const dovuto = aperte.reduce((sm, f) => sm + (f.residuo || 0), 0)
          return (
            <div style={{ ...card, padding: isMobile ? '14px 16px' : '18px 22px', marginBottom: 16, border: `2px solid ${T.green}` }}>
              <div style={{ ...typo.bodyStrong, fontWeight: 800, color: T.text, marginBottom: 4 }}>
                Ho pagato {pagCum.nome}
              </div>
              <div style={{ ...typo.small, color: T.textSoft, lineHeight: 1.55, marginBottom: 12 }}>
                In tutto gli devi <b style={{ color: T.text, ...tnum }}>{fmtEuro(dovuto)}</b> su {aperte.length} {aperte.length === 1 ? 'fattura' : 'fatture'}.
                Scrivi quanto è partito: chiudo le più vecchie fino a esaurire l'importo, e l'ultima resta con un acconto.
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={{ ...typo.small, fontWeight: 700, color: T.textSoft, marginBottom: 4 }}>Quanto hai pagato</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input type="text" inputMode="decimal" value={pagCum.testo} autoFocus
                      onChange={e => setPagCum(p => ({ ...p, testo: e.target.value }))}
                      placeholder={String(Math.round(Math.max(0, dovuto)))}
                      aria-label="Importo pagato al fornitore"
                      style={{ padding: '10px 12px', minHeight: minTouch, width: 150, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 15, fontWeight: 700, color: T.text, ...tnum }} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: T.textMid }}>€</span>
                  </div>
                </div>
                <div>
                  <div style={{ ...typo.small, fontWeight: 700, color: T.textSoft, marginBottom: 4 }}>Quando</div>
                  <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)}
                    aria-label="Data del pagamento"
                    style={{ padding: '9px 11px', minHeight: minTouch, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, color: T.text }} />
                </div>
                {dovuto > 0 && (
                  <button type="button" onClick={() => setPagCum(p => ({ ...p, testo: String(Math.round(dovuto * 100) / 100).replace('.', ',') }))}
                    style={{ padding: '9px 13px', minHeight: minTouch, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, ...typo.small, fontWeight: 700, color: T.textMid, cursor: 'pointer' }}>
                    Ho pagato tutto
                  </button>
                )}
              </div>

              {piano && piano.righe.length > 0 && (
                <div style={{ background: T.bgSubtle, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                  <div style={{ ...typo.small, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                    Cosa faccio con {fmtEuro(importoNum)}:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                    {piano.righe.slice(0, 40).map(r => (
                      <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: font.size.base }}>
                        <span style={{ color: T.textMid, minWidth: 96, ...tnum }}>
                          {r.dueIso ? String(r.dueIso).slice(0, 10).split('-').reverse().join('/') : '-'}
                        </span>
                        <span style={{ color: T.text, flex: 1, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.isNC ? 'nota di credito' : 'fatt.'} {r.numero_rif || 's.n.'}
                        </span>
                        <span style={{ ...tnum, color: T.textMid, whiteSpace: 'nowrap' }}>
                          {r.isNC
                            ? `uso ${fmtEuro(Math.abs(r.imputato))} di credito`
                            : r.saldata
                              ? `chiusa · ${fmtEuro(r.imputato)}`
                              : `acconto ${fmtEuro(r.imputato)} · resta ${fmtEuro(r.residuoDopo)}`}
                        </span>
                      </div>
                    ))}
                    {piano.righe.length > 40 && (
                      <div style={{ fontSize: font.size.sm, color: T.textSoft }}>… e altre {piano.righe.length - 40} righe</div>
                    )}
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}`, ...typo.small, color: T.textMid, lineHeight: 1.5 }}>
                    <b>{piano.chiuse}</b> {piano.chiuse === 1 ? 'fattura si chiude' : 'fatture si chiudono'}
                    {piano.parziali > 0 ? `, ${piano.parziali} resta con un acconto` : ''}.
                    {piano.eccedenza > 0.004 && (
                      <div style={{ marginTop: 4, color: T.brand, fontWeight: 700 }}>
                        Attenzione: {fmtEuro(piano.eccedenza)} restano fuori, perché superano quello che gli devi.
                        Controlla l'importo: se hai pagato davvero di più, è un anticipo e va segnato a parte.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={registraInCassa} onChange={e => setRegistraInCassa(e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 1, accentColor: T.brand, cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ ...typo.small, color: T.textMid, lineHeight: 1.45 }}>
                  Registra in <b>Cassa</b> un'unica uscita da {fmtEuro(piano?.usato || 0)}: il bonifico è uno, e in prima nota deve comparire una riga sola.
                </span>
              </label>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button"
                  onClick={() => applicaPagamentoCumulativo(piano, dataPag, pagCum.nome)}
                  disabled={pagCumSaving || !piano || piano.usato <= 0 || !dataPag}
                  style={{
                    padding: '11px 18px', minHeight: 44, borderRadius: 8, border: 'none',
                    background: (pagCumSaving || !piano || piano.usato <= 0) ? T.border : T.green,
                    color: '#fff', ...typo.body, fontWeight: 800,
                    cursor: (pagCumSaving || !piano || piano.usato <= 0) ? 'default' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                  <Icon name="check" size={14} />
                  {pagCumSaving ? 'Registro…' : piano ? `Registra ${fmtEuro(piano.usato)}` : 'Scrivi l\'importo'}
                </button>
                <button type="button" onClick={() => setPagCum(null)} disabled={pagCumSaving}
                  style={{ padding: '11px 16px', minHeight: 44, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, ...typo.body, fontWeight: 700, color: T.textSoft, cursor: 'pointer' }}>
                  Annulla
                </button>
              </div>
            </div>
          )
        })()}

      {/* Vista PER FORNITORE - chiamata come funzione (non <RollupView/>): così
          NON viene rimontata a ogni render e gli input non perdono il focus. */}
      {vista === 'fornitore' && !loading && fatture.length > 0 && RollupView()}

      {/* Vista CASSA IN USCITA */}
      {vista === 'cassa' && !loading && fatture.length > 0 && CassaView()}

      {/* Vista FISSE MENSILI */}
      {vista === 'fisse' && !loading && fatture.length > 0 && FisseView()}

      {/* Filtri rapidi - solo nella vista per scadenza */}
      {vista === 'scadenza' && (<>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Filtra fatture" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTRI.map(f => {
            const active = filtro === f.id
            const count = f.gruppi.reduce((s, k) => s + (gruppi[k]?.length || 0), 0)
            return (
              <button key={f.id} role="tab" aria-selected={active} onClick={() => setFiltro(f.id)} style={pill(active)}>
                {f.label}
                {fatture.length > 0 && (
                  <span style={{
                    marginLeft: 8, fontSize: 12, fontWeight: 700,
                    color: active ? 'rgba(255,255,255,0.7)' : T.textSoft,
                    ...tnum,
                  }}>
                    {/* Sul filtro "Pagate" il numero è parziale finché non si
                        carica lo storico: dirlo, invece di far sembrare che le
                        vecchie siano sparite. */}
                    {count.toLocaleString('it-IT', { useGrouping: 'always' })}
                    {f.id === 'pagate' && pagateTotali != null && pagateTotali > count ? ` di ${pagateTotali.toLocaleString('it-IT', { useGrouping: 'always' })}` : ''}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {/* Lo storico completo si carica quando serve: per default la pagina
            tiene le fatture aperte e le pagate degli ultimi quattro mesi.
            Prima scaricava tutto a ogni apertura — 856 kB su 3.104 righe per
            mostrarne 152 kB di utili — e il peso cresce per sempre. */}
        {!storicoCompleto && pagateTotali != null && pagateTotali > (gruppi.pagata?.length || 0) && (
          <button type="button"
            onClick={() => { setStoricoCompleto(true); loadFatture(true) }}
            style={{
              padding: '8px 14px', minHeight: 40, borderRadius: 999,
              border: `1px solid ${T.border}`, background: T.bgCard, color: T.textMid,
              fontSize: font.size.base, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            title={`In pagina ci sono le fatture aperte e le pagate degli ultimi 4 mesi. In archivio ce ne sono ${pagateTotali.toLocaleString('it-IT', { useGrouping: 'always' })} pagate in tutto.`}>
            <Icon name="clock" size={13} />
            Carica anche lo storico pagato
          </button>
        )}
        <div style={{ flex: 1 }} />
        {totaliFiltrati.n > 0 && (
          <div style={{ fontSize: 12, color: T.textSoft, letterSpacing: '-0.005em', ...tnum, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            <strong style={{ color: T.text }}>{totaliFiltrati.n.toLocaleString('it-IT', { useGrouping: 'always' })}</strong> {totaliFiltrati.n === 1 ? 'fattura' : 'fatture'} · <strong style={{ color: T.text }}>{fmtEuro(totaliFiltrati.tot)}</strong>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: font.size.base }}>Caricamento…</div>
      ) : fatture.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: isMobile ? '40px 20px' : '60px 40px' }}>
          <div aria-hidden="true" style={{ width: 72, height: 72, borderRadius: R.lg, background: T.bgSubtle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.textSoft, marginBottom: 18 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, color: T.text, marginBottom: 8, letterSpacing: '-0.015em' }}>Nessuna fattura</div>
          <div style={{ fontSize: 13, color: T.textSoft, marginBottom: 24, maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.55 }}>
            Importa l'export Excel di FatturaSMART o un file XML SDI per iniziare a tenere traccia delle scadenze.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <label style={{ ...primaryBtn, cursor: 'pointer' }}>
              <Icon name="folder" size={14} /> Importa .xlsx
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) chiediSede(files, handleImportExcel) }} />
            </label>
            <label style={{ ...ghostBtn, cursor: 'pointer' }}>
              <Icon name="fileText" size={14} /> XML SDI
              <input type="file" accept=".xml,.p7m" multiple style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) chiediSede(files, handleImportXML) }} />
            </label>
          </div>
        </div>
      ) : totaliFiltrati.n === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
          {filtro === 'scadute'     ? 'Nessuna fattura scaduta. Tutto in regola.' :
           filtro === 'in_scadenza' ? 'Nessuna fattura in scadenza nei prossimi 30 giorni.' :
           filtro === 'pagate'      ? 'Nessuna fattura ancora segnata come pagata.' :
                                       'Nessuna fattura per questo filtro.'}
        </div>
      ) : (
        <div>
          {ConfermaBlocco()}
          {gruppiVisibili.map(k => {
            const items = (gruppi[k] || []).filter(matchSearch)
            return items.length ? Gruppo({ keyU: k, items }) : null
          })}
        </div>
      )}
      </>)}

      {BarraBonifico()}

      {/* Modale ALLARME IBAN duplicato — azienda == fornitore */}
      {AvvisoIbanUguale()}

      {/* Modale conferma generazione SEPA — chiarisce che il file scaricato
          va caricato nell'home banking, NON viene inviato automaticamente. */}
      {sepaConfirm && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
          <VeloFinestra onChiudi={() => setSepaConfirm(null)} />
          <div role="dialog" aria-modal="true" aria-label="Generazione bonifico SEPA"
            style={{ background: T.bgCard, borderRadius: 16, padding: '24px 26px', maxWidth: 520, width: '100%', boxShadow: '0 24px 60px rgba(15,23,42,0.32)', position: 'relative', overflow: 'hidden' }}>
            <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #E84B3A 0%, #FFB350 50%, #6E0E1A 100%)' }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: '#EFF6FF', color: '#1D4ED8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="download" size={20} />
              </span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>Generazione bonifico SEPA</div>
                <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>{sepaConfirm.items.length} {sepaConfirm.items.length === 1 ? 'pagamento' : 'pagamenti'} · <b style={{ color: T.brand }}>{fmtEuro(sepaConfirm.totale)}</b></div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6, marginBottom: 14 }}>
              Sto per scaricare un file <b>bonifico_sepa_*.xml</b>. È un foglio bancario: tu lo dai alla tua banca e la banca paga i fornitori per te.
              <br /><br />
              <b style={{ color: T.brand }}>Foodos non invia soldi</b>: prepara solo il file. Sei tu che dici alla tua banca di pagare.
            </div>
            <div style={{ background: T.bgSubtle || '#F8FAFC', border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 12, color: T.textMid, lineHeight: 1.65 }}>
              <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>Come fare passo passo:</div>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                <li>Clicca "Scarica" qui sotto - il file finisce nei tuoi <b>Download</b></li>
                <li><b>NON aprirlo con Word/Excel</b> (li mostra male). Lascialo dov'è.</li>
                <li>Vai sul sito della tua banca (home banking), fai login</li>
                <li>Cerca <b>"Bonifico multiplo"</b>, <b>"SEPA"</b> o <b>"Bonifico massivo"</b></li>
                <li>Carica il file <code style={{ background: '#FFF', padding: '1px 5px', borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 12 }}>.xml</code> appena scaricato (trascina o "Sfoglia")</li>
                <li>La banca elenca tutti i pagamenti: verifica gli importi</li>
                <li>Conferma con il <b>codice OTP / firma digitale</b> richiesto dalla banca</li>
                <li>Torna in Foodos e clicca <b>"Segna pagata"</b> sulle fatture</li>
              </ol>
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: '#78350F', lineHeight: 1.55, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="warning" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Se non sai quale sezione cercare nella tua banca, prova "Bonifici" → "Carica file" oppure chiama l'assistenza banca: dì che vuoi caricare un <b>file SEPA pain.001</b> per bonifici multipli.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={() => setSepaConfirm(null)}
                style={{ ...ghostBtn, padding: '10px 18px' }}>
                Annulla
              </button>
              <button onClick={() => { const items = sepaConfirm.items; setSepaConfirm(null); generaBonificoSEPA(items) }}
                style={{ ...primaryBtn, padding: '10px 22px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="download" size={14} /> Scarica il file XML
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── «Sei sicuro che queste fatture sono di…» ────────────────────
          Le 3.104 fatture di Mara sono finite tutte su Carlina perché era la
          sede attiva quando qualcuno ha premuto Importa. Il selettore in alto
          serve a guardare, e nessuno immagina che decida anche dove finiscono
          i documenti. Quindi lo si dice prima, e si può cambiare. */}
      {confermaSede && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <VeloFinestra colore="rgba(15,23,42,0.55)" onChiudi={() => setConfermaSede(null)} />
          <div role="dialog" aria-modal="true" aria-label="Di quale negozio sono queste fatture?"
            style={{ position: 'relative', background: T.white, borderRadius: 16, padding: 24, maxWidth: 460, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: font.size.xl, fontWeight: 800, color: T.text, marginBottom: 6 }}>
              Di quale negozio sono queste fatture?
            </div>
            <div style={{ fontSize: font.size.base, color: T.textSoft, lineHeight: 1.6, marginBottom: 18 }}>
              {confermaSede.files.length === 1
                ? 'Stai per caricare un file.'
                : `Stai per caricare ${confermaSede.files.length} file.`}
              {' '}Una volta dentro, le fatture restano dove le metti adesso.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {(sedi || []).map(sd => {
                const scelta = sediScelte.includes(sd.id)
                return (
                  <button key={sd.id} type="button"
                    onClick={() => setSediScelte(p => p.includes(sd.id) ? p.filter(x => x !== sd.id) : [...p, sd.id])}
                    style={{ minHeight: 44, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      textAlign: 'left', fontSize: font.size.md, fontWeight: scelta ? 700 : 500,
                      border: `2px solid ${scelta ? T.red : T.border}`,
                      background: scelta ? T.redLight : T.white, color: T.text,
                      display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${scelta ? T.red : T.borderStr}`, background: scelta ? T.red : 'transparent',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {scelta && <Icon name="check" size={12} color={T.white} />}
                    </span>
                    {sd.nome}
                  </button>
                )
              })}
            </div>

            {/* Due negozi insieme: è il caso di un account fornitore che ne
                copre due. Si dichiara invece di attribuire a caso. */}
            {sediScelte.length > 1 && (
              <div style={{ fontSize: font.size.sm, color: T.textMid, background: T.bgSubtle,
                border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, marginBottom: 14, lineHeight: 1.55 }}>
                <b style={{ color: T.text }}>Spesa di {sediScelte.length} negozi insieme.</b> Non verrà
                attribuita a uno solo: si dividerà fra loro in proporzione ai chili prodotti, e nelle
                pagine resterà scritto che è una ripartizione.
              </div>
            )}
            {sediScelte.length === 0 && (
              <div style={{ fontSize: font.size.sm, color: T.amber, marginBottom: 14, lineHeight: 1.55 }}>
                Se non scegli nessun negozio le fatture restano dell&apos;azienda, e non compariranno
                nelle pagine che ragionano per sede.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfermaSede(null)}
                style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: `1px solid ${T.borderStr}`,
                  background: T.white, color: T.text, fontWeight: 700, fontSize: font.size.base, cursor: 'pointer' }}>
                Annulla
              </button>
              <button type="button"
                onClick={() => { const { files, avvia } = confermaSede; setConfermaSede(null); avvia(files, sediScelte) }}
                style={{ minHeight: 44, padding: '0 22px', borderRadius: 10, border: 'none',
                  background: T.red, color: T.white, fontWeight: 800, fontSize: font.size.base, cursor: 'pointer' }}>
                {sediScelte.length === 1
                  ? `Sì, sono di ${(sedi || []).find(x => x.id === sediScelte[0])?.nome || 'questo negozio'}`
                  : sediScelte.length > 1 ? 'Sì, sono di questi negozi' : 'Carica senza negozio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
