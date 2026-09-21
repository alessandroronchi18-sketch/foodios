// ProduzioneGiornalieraView - Registrazione produzione giornaliera. Estratta da Dashboard.jsx.
// Scala il magazzino, carica stock PF, gestisce trasferimenti auto verso altre sedi,
// OCR foto appunto produzione. Richiede orgId/sedeId per persistenza e stock.

import React, { useEffect, useMemo, useState, useRef } from 'react'
import { ssave as _ssave, ssaveBatch as _ssaveBatch } from '../lib/storage'
import { supabase } from '../lib/supabase'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, motion as M, typo, font } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR, isRicettaValida, normIng, translateProdottoEN } from '../lib/foodcost'
import { labelPlurale, isGustoTipo } from '../lib/tipoRicetta'
import { caricoProduzionePF, scartoPF } from '../lib/stockPF'
import { friendlyErrorMessage } from '../lib/errors'
import { useConfirm } from '../components/ConfirmModal'
import { creaTrasferimento } from '../lib/trasferimenti'
import { SK_GIOR, SK_MAG } from '../lib/storageKeys'
import { exportProduzione } from '../lib/exportPDF'
import { gateExport, getExportCtx } from '../lib/exportGuard'
import { soloData, todayLocal } from '../lib/dateLocal'
import { lessico } from '../lib/lessico'
import { scaricaTemplateProduzione } from '../lib/produzioneTemplate'
import FotoOCR from '../components/FotoOCR'
import Icon from '../components/Icon'
import { C, TNUM, margColor, fmt, fmt0, fmtp, KPI, PageHeader } from './_shared'
import { ingredientiDaScaricare } from '../lib/scaricoIngredienti'
import { getResaIngrediente } from '../lib/rese'

// Scorciatoia alle misure del testo dai token (font.size in theme.js), come in
// MagazzinoView. Le misure ammesse sono quelle della scala: chi scrive FS.sm
// sta scegliendo «piccolo», non dodici pixel.
const FS = font.size

// ── Le due superfici calde della pagina ────────────────────────────────────
//
// Panna e sabbia: sono il fondo delle tabelle e delle righe alternate in tutto
// il prodotto (Dashboard, Magazzino, lettura foto). In `theme.js` un token per
// loro NON c'è — i fondi neutri del tema sono freddi (#F1F4F8) e cambiarli qui
// vorrebbe dire ridisegnare la pagina di testa mia. Finché il token non esiste,
// almeno il valore sta scritto una volta sola: erano cinque copie sparse, e
// cambiarne una sola faceva divergere le altre quattro.
const SUPERFICIE_CALDA = '#F8F4F2'
const RIGA_ALTERNATA = '#FDFAF7'

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

// ── Un semilavorato non si vende al banco ──────────────────────────────────
//
// Audit 2026-09-20. La vetrina (`stock_prodotti_finiti`) è lo stock da cui la
// cassa scarica le vendite: una crema pasticcera lì dentro è una riga che
// nessuno scaricherà mai, e i conti della vetrina smettono di tornare.
//
// Il guardiano esisteva dal 9 settembre, ma solo dentro il trasferimento fra
// sedi. Il percorso normale — produci e carica in vetrina — non ce l'aveva:
// corretto in un posto, lasciato nell'altro. Mara dei Boschi ha cinque
// semilavorati e ne tiene due in magazzino (base bianca, salsa zabaione);
// ventinove ricette su sessantotto usano la base bianca.
//
// Il semilavorato resta nella sessione: va registrato, il magazzino lo deve
// scalare e il food cost lo deve contare. Solo la vetrina non lo vuole.
const vaInVetrina = (reg) => reg?.tipo !== 'semilavorato'

// ── Quanto pesa un batch di semilavorato ───────────────────────────────────
// La somma delle sue dosi. È la stessa misura che usa `ingredientiDaScaricare`
// quando fa il conto al contrario ("quante volte del semilavorato servono per
// questi grammi"): se le due divergessero, produrre e consumare la stessa base
// non si pareggerebbe mai.
function pesoDiUnBatch(ric) {
  return (ric?.ingredienti || []).reduce((s, i) => s + (Number(i.qty1stampo) || 0), 0)
}

// ── Il semilavorato prodotto torna sullo scaffale ──────────────────────────
//
// Audit 2026-09-20. Il giro era aperto da una parte sola. Produrre BASE BIANCA
// scalava latte e zucchero, ma non aumentava di un grammo la voce «base
// bianca» in magazzino; poi le ventinove ricette che la usano la scalavano.
// La giacenza di una base tenuta sullo scaffale poteva solo scendere, ogni
// giorno, fino a un rosso permanente che non dipendeva da niente di reale.
//
// Rientra solo quello che il laboratorio tiene DAVVERO in magazzino: se la
// base non è sullo scaffale, `ingredientiDaScaricare` scende nei suoi
// ingredienti e il rientro non deve esistere, altrimenti si conterebbe due
// volte.
function rientroSemilavorato(nome, ric, reg, stampi, inMagazzino) {
  if (reg?.tipo !== 'semilavorato') return null
  const chiave = normIng(nome)
  if (!chiave || !inMagazzino?.has(chiave)) return null
  const grammi = pesoDiUnBatch(ric) * (Number(stampi) || 0)
  return grammi > 0 ? { chiave, grammi } : null
}

// ── I prodotti di una sessione, qualunque forma abbia ──────────────────────
//
// Audit 2026-09-20. Le sessioni non hanno tutte la stessa forma. Quelle
// registrate qui hanno `prodotti: [{ nome, stampi, vendibile }]`; quelle
// vecchie — e tutte quelle dell'account dimostrativo — hanno
// `ricette: [{ nome, numStampi }]`. Lo Storico leggeva solo la prima forma,
// quindi sull'account dimostrativo mostrava **142 sessioni tutte vuote**: zero
// stampi, nessun prodotto, «0 stampi totali» in cima. È la pagina che si fa
// vedere a chi sta valutando il programma.
//
// `vendibile: 0` sulle righe vecchie non è una stima: quelle sessioni non
// hanno mai caricato niente in vetrina, quindi non c'è niente da scaricare se
// vengono eliminate. Zero è la risposta giusta, non un ripiego.
function prodottiDiSessione(sess) {
  if (Array.isArray(sess?.prodotti) && sess.prodotti.length > 0) return sess.prodotti
  if (Array.isArray(sess?.ricette) && sess.ricette.length > 0) {
    return sess.ricette.map(r => ({
      nome: r?.nome, stampi: Number(r?.numStampi) || 0, vendibile: 0, formatoVecchio: true,
    }))
  }
  return []
}

// ── Un valore che manca non è zero ─────────────────────────────────────────
//
// Audit 2026-09-20, sui dati veri di Mara dei Boschi. Nel suo storico c'è una
// sessione nata da un evento (un compleanno) che non porta né `fcTot` né
// `ricavoTot`: quel percorso non li calcola. Lo Storico faceva `s.fcTot || 0`
// e scriveva «Food cost 0 €», «Margine 0 €». Food cost zero non vuol dire
// gratis, vuol dire che non lo sappiamo, e su una riga di bilancio le due cose
// non si possono confondere.
//
// `Number(null)` fa 0 e `Number.isFinite(0)` è vero: il controllo va fatto
// PRIMA di convertire, altrimenti non distingue niente.
function numeroNoto(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ── Il giorno si legge come giorno, non come istante ───────────────────────
//
// Audit 2026-09-20. `new Date('2026-01-01')` è mezzanotte a Greenwich, non a
// casa di chi guarda: riletta con un orologio a ovest di Greenwich diventa il
// 31 dicembre 2025. Giorno, mese e anno sbagliati tutti insieme, e la sessione
// di Capodanno finisce nell'anno prima.
//
// `sess.data` è già un GIORNO ('2026-01-01'). Si smonta e si rimonta come data
// locale: così il fuso non entra mai nel conto.
function giornoIT(giorno, opzioni) {
  const g = (giorno || '').toString().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(g)
  if (!m) return '—'
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('it-IT', opzioni)
}

// ── La resa: il magazzino perde il lordo, non il netto ─────────────────────
//
// Audit 2026-09-20. Il food cost divide il costo al grammo per la resa
// (`costoNettoPerG`): con le uova all'85%, cento grammi di ricetta costano
// come centodiciotto grammi comprati, ed è giusto — quello che si butta si
// paga. Lo scarico del magazzino però toglieva cento grammi tondi. Due conti
// sullo stesso ingrediente, uno che conta lo scarto e uno no: la giacenza
// resta più alta del vero e la differenza si scopre all'inventario.
//
// Quello che questa riga NON copre, e va detto: se la resa è impostata sul
// NOME DI UN SEMILAVORATO, il food cost la applica una volta sola al posto di
// quelle dei suoi ingredienti (il ramo `_lordo` di `calcolaFC`), mentre qui,
// dopo l'espansione, restano le rese delle foglie. Oggi non cambia niente —
// `pasticceria-rese-v1` non esiste in nessuna riga del database, quindi tutte
// le rese valgono 1,0 — ma il giorno che qualcuno ne imposta una su una base,
// i due numeri divergono di nuovo.
function grammiLordi(chiave, grammi) {
  const resa = getResaIngrediente(chiave)
  return resa > 0 ? grammi / resa : grammi
}

// ── Togliere dal magazzino quello che una sessione consuma ─────────────────
//
// Una funzione sola per i due percorsi (conferma e modifica): prima erano due
// copie, e la seconda era rimasta al comportamento di prima del 9 settembre.
//
// `rientri` è quello che la sessione RIMETTE sullo scaffale: un batch di base
// bianca prodotto e tenuto in magazzino. Entra prima di quello che esce,
// perché nella stessa giornata si fa la base e poi la si usa.
//
// Ritorna anche `scalatoPerChiave`, cioè quanto si è tolto davvero e da quale
// chiave: è l'unica informazione con cui l'eliminazione può restituire la
// quantità giusta al posto giusto. I rientri ci stanno col segno meno, così
// annullarli è la stessa somma al contrario.
function applicaConsumo(magazzino, ings, rientri, chiaviSalvate) {
  const nm = { ...(magazzino || {}) }
  const scalatoPerChiave = {}
  const nonTrovati = []
  const grezzeDi = (k) => (chiaviSalvate?.[k]?.length ? chiaviSalvate[k] : (nm[k] ? [k] : []))

  for (const [k, grammi] of Object.entries(rientri || {})) {
    if (!(grammi > 0)) continue
    const grezze = grezzeDi(k)
    if (grezze.length === 0) continue   // non è sullo scaffale: non nasce qui
    const raw = grezze[0]
    nm[raw] = { ...nm[raw], giacenza_g: (Number(nm[raw]?.giacenza_g) || 0) + grammi }
    scalatoPerChiave[raw] = (scalatoPerChiave[raw] || 0) - grammi
  }

  for (const [k, qty] of Object.entries(ings || {})) {
    if (!(qty > 0)) continue
    const grezze = grezzeDi(k)
    if (grezze.length === 0) { nonTrovati.push(k); continue }
    // Con più voci per lo stesso ingrediente si scala in ordine, fino a
    // esaurire la quantità: non si spalma a caso e non si svuota una voce
    // mentre un'altra resta piena.
    let residuo = qty
    for (const raw of grezze) {
      if (residuo <= 0) break
      const disp = Number(nm[raw]?.giacenza_g) || 0
      const preso = Math.min(disp, residuo)
      if (preso <= 0) continue
      nm[raw] = { ...nm[raw], giacenza_g: disp - preso }
      scalatoPerChiave[raw] = (scalatoPerChiave[raw] || 0) + preso
      residuo -= preso
    }
    // Quello che non c'era resta segnato: la merce è uscita comunque, e sapere
    // che la giacenza era già insufficiente serve a capire perché.
    if (residuo > 0) {
      const raw = grezze[0]
      const disp = Number(nm[raw]?.giacenza_g) || 0
      nm[raw] = { ...nm[raw], giacenza_g: disp - residuo }
      scalatoPerChiave[raw] = (scalatoPerChiave[raw] || 0) + residuo
    }
  }
  return { nm, scalatoPerChiave, nonTrovati }
}

// ── Rimettere a posto quello che una sessione aveva tolto ──────────────────
//
// Si restituisce SOLO quello che era stato davvero scalato, e sulla stessa
// chiave da cui era stato scalato. Creare una voce nuova con la quantità
// teorica è il modo in cui il magazzino si gonfia: si produceva senza scalare
// le uova (chiave «uova» non trovata), si eliminava la sessione e nasceva una
// voce «uovo» con tutta la quantità.
//
// Le sessioni vecchie non hanno `scalatoPerChiave`: per quelle si ricade su
// `ingredientiUsati`, ma senza mai inventare voci.
function annullaConsumo(magazzino, sess, chiaviSalvate) {
  const daRestituire = sess?.scalatoPerChiave && Object.keys(sess.scalatoPerChiave).length > 0
    ? sess.scalatoPerChiave
    : (sess?.ingredientiUsati || {})
  if (Object.keys(daRestituire).length === 0) return null
  const nm = { ...(magazzino || {}) }
  for (const [k, qty] of Object.entries(daRestituire)) {
    if (!Number.isFinite(Number(qty)) || Number(qty) === 0) continue
    const grezze = nm[k] ? [k] : (chiaviSalvate?.[normIng(k)] || [])
    if (grezze.length === 0) continue   // la voce non esiste più: niente da restituire
    const raw = grezze[0]
    nm[raw] = { ...nm[raw], giacenza_g: (Number(nm[raw].giacenza_g) || 0) + Number(qty) }
  }
  return nm
}

// Titolo di pannello con chip icona (gerarchia premium come la Dashboard home).
function PanelHead({ icon, title, color = C.red }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: `${color}14`, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: FS.md, flexShrink: 0 }}>{icon}</span>
      <div style={{ fontSize: FS.base, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>{title}</div>
    </div>
  )
}

// Chip dei prodotti di una sessione: ordinati per pezzi prodotti (desc) e, quando
// sono tanti (es. 50), mostra solo i primi N + un chip "+X altri" che al passaggio
// del mouse (o al tap) espande l'elenco completo. Evita righe di chip infinite.
const CHIP_PROD = { background: SUPERFICIE_CALDA, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: FS.sm, fontWeight: 700, color: C.textMid, whiteSpace: 'nowrap' }
function ProdottiChips({ prodotti, dito = false }) {
  const [aperto, setAperto] = useState(false)
  const LIMITE = 12
  const ordinati = [...(prodotti || [])].sort((a, b) => (b.stampi || 0) - (a.stampi || 0))
  const visibili = aperto ? ordinati : ordinati.slice(0, LIMITE)
  const nascosti = ordinati.length - visibili.length
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {visibili.map(p => <span key={p.nome} style={CHIP_PROD}>{(Number(p.stampi)||0).toLocaleString('it-IT', { useGrouping: 'always' })}× {p.nome}</span>)}
      {!aperto && nascosti > 0 && (
        <span role="button" tabIndex={0} onMouseEnter={() => setAperto(true)} onClick={() => setAperto(true)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAperto(true) } }}
          title="Passa il mouse per vedere tutti i prodotti"
          style={{ ...CHIP_PROD, cursor: 'pointer', minHeight: dito ? 44 : undefined, display: 'inline-flex', alignItems: 'center', background: C.redLight, borderColor: C.red, color: C.red }}>
          +{nascosti} altri
        </span>
      )}
      {aperto && ordinati.length > LIMITE && (
        <span role="button" tabIndex={0} onClick={() => setAperto(false)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAperto(false) } }}
          style={{ ...CHIP_PROD, cursor: 'pointer', minHeight: dito ? 44 : undefined, color: C.textSoft, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {/* Audit 2026-09-09: era il glifo "↑". Il progetto ha il componente
              Icon con SVG proprio per non dipendere dai glifi, che cambiano
              forma da un sistema all'altro e i lettori di schermo leggono a
              modo loro. */}
          <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevDown" size={11} /></span>
          comprimi
        </span>
      )}
    </div>
  )
}

export default function ProduzioneGiornalieraView({ ricettario, magazzino, setMagazzino, giornaliero, setGiornaliero, notify, sedi = [], sedeAttiva = null, orgId, sedeId, isDipendente = false, nomeAttivita = '', LEX = lessico() }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  // ── Questa pagina si usa col dito ──────────────────────────────────────
  //
  // Audit 2026-09-20. È la pagina che si apre alle sei del mattino, in
  // laboratorio, su un tablet, con le mani infarinate. La misura di un comando
  // va decisa sul DITO, non sulla larghezza dello schermo: `isMobile` è falso
  // su un iPad, quindi tutto quello che era scritto `isMobile ? … : …`
  // consegnava al tablet la versione da mouse. I due pulsanti della sessione
  // (Modifica, Elimina) erano alti 28 px, e i campi per correggere le quantità
  // pure. È lo stesso errore che il 18/09 aveva lasciato duecento bersagli da
  // 30 px nel Ricettario.
  const dito = isMobile || isTablet
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  // Include anche i semilavorati (richiesta utente 13/07/2026: molti laboratori
  // producono batch settimanali di frolla/creme/impasti e vogliono tracciarli qui).
  // Escludiamo solo tipo='interno' (che serve solo come componente in altre ricette).
  const ricette = Object.values(ricettario?.ricette || {}).filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno')
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it')) // lista prodotti in ordine alfabetico
  const ssave = (key, val) => _ssave(key, val, orgId, sedeId)
  // Scrittura atomica di più chiavi insieme (magazzino + giornaliero): o entrambe o nessuna.
  const ssaveBatch = (items) => _ssaveBatch(items, orgId, sedeId)

  const [tab, setTab] = useState('nuova')
  // Toolbar collassabile per "Parti da una foto": OCR nascosto dietro chip
  // per dare più peso al flusso primario di inserimento manuale.
  const [showFotoPanel, setShowFotoPanel] = useState(false)
  // Search bar sulla tabella ricette (evita di scrollare 50+ righe).
  const [ricSearch, setRicSearch] = useState('')
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
    for (const p of prodottiDiSessione(sess)) rows[p.nome] = { stampi: p.stampi ?? 0, vendibile: p.vendibile ?? p.stampi ?? 0 }
    setEditRows(rows); setEditSessId(sess.id); setEditConfirm(false)
    setDeleteSessConf(null)
  }
  function annullaModifica() { setEditSessId(null); setEditRows({}); setEditConfirm(false) }

  // Calcola ingredienti/fc/ricavo per una lista prodotti (stesso motore della conferma).
  //
  // Audit 2026-09-20: qui c'era una SECONDA copia del calcolo, rimasta a com'era
  // prima del 9 settembre. Leggeva gli ingredienti della ricetta così come sono
  // scritti, quindi su una crostata vedeva la riga «pasta frolla» invece di
  // farina e burro. Effetto: si registrava una crostata (il magazzino perdeva
  // farina e burro), poi bastava correggere un numero in quella sessione e il
  // magazzino si riprendeva farina e burro e nasceva una voce «pasta frolla»
  // negativa che non esiste sullo scaffale. Correggere una cifra faceva
  // comparire merce. Ora il motore è uno solo, `ingredientiDaScaricare`.
  const computeSessione = (prodotti) => {
    const ings = {}; const rientri = {}; let fcTot = 0, ricavoTot = 0
    for (const p of prodotti) {
      const ric = ricettario?.ricette?.[p.nome] || ricettario?.ricette?.[(p.nome || '').toUpperCase().trim()]
      if (!ric) continue
      const reg = getR(p.nome, ric)
      const q = Number(p.stampi) || 0
      // Zero pezzi al banco vuol dire ricavo zero, non ricavo pieno: `|| q`
      // leggeva lo zero come «campo non compilato».
      const qv = p.vendibile != null ? (Number(p.vendibile) || 0) : q
      ricavoTot += qv * (Number(reg.unita) || 0) * (Number(reg.prezzo) || 0)
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      fcTot += q * fc
      const espanso = ingredientiDaScaricare(ric, q, ricettario, chiaviInMagazzino)
      for (const [k, g] of Object.entries(espanso.ings)) ings[k] = (ings[k] || 0) + grammiLordi(k, g)
      const rientro = rientroSemilavorato(p.nome, ric, reg, q, chiaviInMagazzino)
      if (rientro) rientri[rientro.chiave] = (rientri[rientro.chiave] || 0) + rientro.grammi
    }
    return { ings, rientri, fcTot, ricavoTot }
  }

  // Salva le modifiche a una sessione: ripristina gli effetti vecchi e applica i
  // nuovi (magazzino + stock PF), con SAVE FIRST. Doppia conferma a monte.
  const salvaModificheSessione = async (sess) => {
    if (savingEdit) return
    setSavingEdit(true)
    // Audit 2026-09-20: era `Number(e.stampi) || 0`. In laboratorio si scrive
    // «1,5» — la virgola è il separatore decimale italiano e la tastiera del
    // tablet propone quella — e `Number('1,5')` è NaN, cioè zero: la riga
    // usciva dalla sessione. Stesso `parseIT` del resto della pagina.
    const prodottiModificati = prodottiDiSessione(sess)
      .map(p => { const e = editRows[p.nome] || {}; return { ...p, stampi: parseIT(e.stampi), vendibile: parseIT(e.vendibile) } })
    const nuoviProdotti = prodottiModificati.filter(p => p.stampi > 0 || p.vendibile > 0)
    // Audit 2026-09-14: un prodotto portato a zero spariva dalla sessione senza
    // che nessuno lo dicesse. Chi svuota il campo per correggere una cifra si
    // ritrova la riga cancellata, e per rimetterla deve rifare la sessione.
    const tolti = prodottiModificati.filter(p => !(p.stampi > 0 || p.vendibile > 0)).map(p => p.nome)
    if (tolti.length > 0) {
      const ok = await confirm({
        title: tolti.length === 1 ? 'Tolgo questo prodotto dalla sessione?' : `Tolgo ${tolti.length} prodotti dalla sessione?`,
        message: tolti.length === 1
          ? `"${tolti[0]}" resta senza quantità. Se l'hai svuotato per sbaglio, rimettici il numero.`
          : `Restano senza quantità: ${tolti.slice(0, 4).join(', ')}${tolti.length > 4 ? ` e altri ${tolti.length - 4}` : ''}. Se li hai svuotati per sbaglio, rimettici i numeri.`,
        confirmLabel: 'Toglili',
        cancelLabel: 'Torna indietro',
        destructive: true,
      })
      if (!ok) { setSavingEdit(false); return }
    }
    const agg = computeSessione(nuoviProdotti)
    // Magazzino: prima si annulla ESATTAMENTE quello che la sessione aveva
    // tolto (`scalatoPerChiave`, chiave per chiave), poi si applica il consumo
    // nuovo con lo stesso motore della conferma.
    //
    // Prima si faceva la differenza fra `ingredientiUsati` vecchi e nuovi. Due
    // difetti in una riga: gli `ingredientiUsati` sono la quantità TEORICA
    // (non quello che c'era davvero da scalare), e la differenza si applicava
    // a chiavi che potevano non esistere, creandole. Annulla-e-riapplica usa
    // il percorso già provato e lascia `scalatoPerChiave` aggiornato: senza,
    // dopo una modifica l'eliminazione avrebbe restituito le quantità della
    // sessione di prima.
    const ripristinato = annullaConsumo(magazzino, sess, chiaviSalvate) || { ...(magazzino || {}) }
    const { nm, scalatoPerChiave, nonTrovati } = applicaConsumo(ripristinato, agg.ings, agg.rientri, chiaviSalvate)
    const nuovaSess = {
      ...sess, prodotti: nuoviProdotti, ingredientiUsati: agg.ings, scalatoPerChiave,
      fcTot: agg.fcTot, ricavoTot: agg.ricavoTot,
    }
    const ng = (giornaliero || []).map(s => s.id === sess.id ? nuovaSess : s)

    try {
      await ssaveBatch([{ key: SK_GIOR, value: ng }, { key: SK_MAG, value: nm }])
    } catch (e) {
      setSavingEdit(false)
      notify(`Non ho potuto salvare le modifiche: ${friendlyErrorMessage(e)} Le modifiche non sono state applicate.`, false)
      return
    }

    // Stock PF: applica il delta dei pezzi vendibili per prodotto.
    const sedeProduttiva = sedeAttiva?.id
    const destDiversa = sess.destinazioneSedeId && sess.destinazioneSedeId !== sedeProduttiva
    const stockErrors = []
    if (orgId && sedeProduttiva && !destDiversa) {
      const vendDi = (p) => p?.vendibile != null ? Math.max(0, Number(p.vendibile) || 0) : Number(p?.stampi || 0)
      const oldVend = {}; for (const p of prodottiDiSessione(sess)) oldVend[p.nome] = vendDi(p)
      const newVend = {}; for (const p of nuoviProdotti) newVend[p.nome] = vendDi(p)
      const allNomi = new Set([...Object.keys(oldVend), ...Object.keys(newVend)])
      for (const nome of allNomi) {
        const ric = ricettario?.ricette?.[nome] || ricettario?.ricette?.[(nome || '').toUpperCase().trim()]
        const reg = ric ? getR(nome, ric) : null
        // Un semilavorato non sta in vetrina, quindi non ha nemmeno un delta da
        // applicarle. Senza questo, correggere una sessione ci rimetteva dentro
        // quello che la conferma ha smesso di metterci.
        if (!vaInVetrina(reg)) continue
        const uf = Number(reg?.unita); const factor = Number.isFinite(uf) && uf > 0 ? uf : 1
        const deltaPezzi = ((newVend[nome] || 0) - (oldVend[nome] || 0)) * factor
        if (Math.abs(deltaPezzi) < 0.0001) continue
        const prodottoKey = (nome || '').toUpperCase().trim()
        try {
          if (deltaPezzi > 0) await caricoProduzionePF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: deltaPezzi, unita: 'pz', note: `Modifica sessione del ${sess.data}` })
          else await scartoPF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: -deltaPezzi, note: `Modifica sessione del ${sess.data}` })
        } catch (e) { stockErrors.push(`${nome}: ${friendlyErrorMessage(e)}`) }
      }
    }

    setGiornaliero(ng); setMagazzino(nm)
    annullaModifica(); setSavingEdit(false)
    if (destDiversa) notify('Sessione modificata. Stock prodotti finiti NON ritoccato (destinazione altra sede).', false)
    else if (stockErrors.length > 0) notify(`Sessione modificata ma alcuni stock non aggiornati: ${stockErrors.slice(0,3).map(s=>s.split(':')[0]).join(', ')}. Controlla Magazzino → Prodotti finiti.`, false)
    // Gli ingredienti che in magazzino non ci sono: la modifica è salva, ma il
    // food cost li ha contati e la giacenza no. Lo diceva la conferma e non lo
    // diceva la modifica, ed è la stessa informazione.
    else if (nonTrovati.length > 0) notify(`Sessione modificata. ${nonTrovati.length === 1 ? 'Un ingrediente non era' : `${nonTrovati.length} ingredienti non erano`} in magazzino, quindi non ${nonTrovati.length === 1 ? 'è stato scalato' : 'sono stati scalati'}: ${nonTrovati.slice(0, 3).join(', ')}.`, false)
    else notify('Sessione modificata - magazzino e vetrina aggiornati')
  }

  // Elimina sessione produzione:
  // 1. Calcola magazzino post-reintegro ingredienti
  // 2. Salva PRIMA su server (ssave) - se fallisce, abort senza toccare state
  // 3. Stock prodotti finiti: scarta i pezzi della sessione (causale 'scarto').
  //    Eccezione: se la sessione era con destinazione altra sede, il transfer
  //    ha già mosso lo stock - non lo ritocchiamo, avvisiamo l'utente.
  // 4. Aggiorna state locale solo dopo conferma server
  const handleDeleteSessione = async (sess) => {
    if (deleteSessPin !== 'ELIMINA' || deletingSess) return
    setDeletingSess(true)

    const ng = (giornaliero || []).filter(s => s.id !== sess.id)
    // `annullaConsumo` restituisce SOLO quello che era stato davvero scalato, e
    // sulla stessa chiave da cui era stato scalato. Anche i rientri di un
    // semilavorato tornano indietro: stanno in `scalatoPerChiave` col segno
    // meno, quindi la stessa somma li toglie.
    const nm = annullaConsumo(magazzino, sess, chiaviSalvate)

    // SAVE FIRST: se fallisce, niente state mutation -> niente dati persi.
    try {
      await ssaveBatch(nm ? [{ key: SK_GIOR, value: ng }, { key: SK_MAG, value: nm }] : [{ key: SK_GIOR, value: ng }])
    } catch (e) {
      setDeletingSess(false)
      notify(`Non ho potuto eliminare la sessione: ${friendlyErrorMessage(e)} Niente è cambiato.`, false)
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
      for (const p of prodottiDiSessione(sess)) {
        // Zero al banco vuol dire zero in vetrina: non c'è niente da scartare.
        const vendibile = p.vendibile != null ? Math.max(0, Number(p.vendibile) || 0) : Number(p.stampi || 0)
        if (vendibile <= 0) continue
        const ric = ricettario?.ricette?.[p.nome] || ricettario?.ricette?.[(p.nome || '').toUpperCase().trim()]
        const reg = ric ? getR(p.nome, ric) : null
        // In vetrina non c'era mai entrato: non si scarta. Deve essere lo
        // specchio esatto della conferma, altrimenti eliminare una sessione
        // porta la vetrina sotto zero su un prodotto che non ci ha mai messo
        // piede.
        if (!vaInVetrina(reg)) continue
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

    const baseMsg = 'Sessione eliminata - ingredienti restituiti al magazzino'
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
  const [salvando, setSalvando] = useState(false)
  // Id della sessione in corso: si azzera solo dopo un salvataggio riuscito.
  const sessioneIdRef = useRef(null)
  const confirm = useConfirm()

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
  // Audit 2026-09-14: un numero negativo passava. "-5" stampi non si scrive per
  // scelta, si scrive per un tasto premuto male, e portava in giro un ricavo
  // negativo e una sessione con quantità impossibili.
  const parseIT = (val) => Math.max(0, parseFloat(String(val).replace(',', '.')) || 0)
  const setQ = (nome, val) => {
    const n = parseIT(val)
    setQtaMap(m => ({ ...m, [nome]: n }))
    if (!isCongelabile(nome)) setVendMap(m => ({ ...m, [nome]: n }))
  }
  const setV = (nome, val) => setVendMap(m => ({ ...m, [nome]: parseIT(val) }))

  // Chiavi normalizzate presenti in magazzino: servono allo scarico per sapere
  // se un semilavorato e' tenuto sullo scaffale (si scarica quello) o va risolto
  // nei suoi ingredienti.
  const chiaviInMagazzino = useMemo(
    () => new Set(Object.keys(magazzino || {}).map(k => normIng(k))),
    [magazzino])

  const riepilogo = useMemo(() => {
    const ings = {}
    const rientri = {}
    const nonScaricabili = []
    let fcTot = 0, ricavoTot = 0, stampiTot = 0, nProdotti = 0
    for (const ric of ricette) {
      const q = qtaMap[ric.nome] || 0
      // Zero pezzi al banco vuol dire ricavo zero, non ricavo pieno.
      const qv = vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : q
      if (!q && !qv) continue
      nProdotti++
      stampiTot += q
      const reg = getR(ric.nome, ric)
      ricavoTot += qv * (Number(reg.unita) || 0) * (Number(reg.prezzo) || 0)
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      fcTot += q * fc
      // Audit 2026-09-09 ALTA: qui si prendevano gli ingredienti della ricetta
      // COSI' COME SONO SCRITTI. Ma una ricetta può contenere un semilavorato
      // ("pasta frolla" dentro "crostata mele"): calcolaFC (riga sopra) scende
      // nella sua ricetta e conta farina e burro nel costo, mentre il magazzino
      // cercava una voce "pasta frolla" e, non trovandola, non scaricava
      // NIENTE. Nei dati di produzione nessuno dei 7 semilavorati e' tenuto in
      // magazzino: ogni crostata prodotta lasciava il magazzino pieno mentre il
      // food cost contava la frolla, e lo scostamento si scopriva
      // all'inventario un mese dopo senza poter risalire alla causa.
      const espanso = ingredientiDaScaricare(ric, q, ricettario, chiaviInMagazzino)
      for (const [k, g] of Object.entries(espanso.ings)) {
        // `grammiLordi`: dal magazzino esce il peso comprato, non quello che
        // finisce nell'impasto. Vedi il commento in cima al file.
        ings[k] = (ings[k] || 0) + grammiLordi(k, g)
      }
      for (const nd of espanso.nonEspandibili) {
        if (!nonScaricabili.some(x => x.nome === nd.nome)) nonScaricabili.push(nd)
      }
      const rientro = rientroSemilavorato(ric.nome, ric, reg, q, chiaviInMagazzino)
      if (rientro) rientri[rientro.chiave] = (rientri[rientro.chiave] || 0) + rientro.grammi
    }
    return { ings, rientri, fcTot, ricavoTot, stampiTot, nProdotti, nonScaricabili }
  }, [qtaMap, vendibileMap, ricette, ingCosti, ricettario, chiaviInMagazzino])

  // Le chiavi con cui il magazzino è SALVATO, raggruppate per nome canonico.
  //
  // `riepilogo.ings` è indicizzato con `normIng`, che porta i plurali al
  // singolare: "uova" diventa "uovo". Ma il magazzino conserva le chiavi come
  // sono state scritte, e in produzione ce ne sono di non canoniche ("uova",
  // "nocciole", "mirtilli", "mandorle", "noci" su un'azienda reale). Senza
  // questa mappa, chi cerca `magazzino["uovo"]` non trova niente.
  const chiaviSalvate = useMemo(() => {
    const out = {}
    for (const raw of Object.keys(magazzino || {})) {
      const k = normIng(raw)
      if (!out[k]) out[k] = []
      out[k].push(raw)
    }
    return out
  }, [magazzino])

  // Audit 2026-09-14: la giacenza veniva letta da `magazzino[k]`, cioè dalla
  // chiave canonica. Ma il magazzino conserva le chiavi come le ha scritte
  // l'utente — "uova" mentre il calcolo usa "uovo" — e su quelle voci la
  // giacenza risultava zero: la pagina dichiarava "scorte insufficienti" su un
  // ingrediente che c'era, e lo faceva ogni singolo giorno. Lo scarico era già
  // stato corretto il 9 set; l'allarme leggeva ancora nel posto sbagliato.
  const giacenzaDi = (k) => {
    const grezze = magazzino?.[k] ? [k] : (chiaviSalvate[k] || [])
    return grezze.reduce((tot, raw) => tot + (Number(magazzino?.[raw]?.giacenza_g) || 0), 0)
  }
  // Quanto c'è davvero a disposizione: la giacenza più quello che la sessione
  // stessa rimette sullo scaffale. Chi la mattina fa la base bianca e poi la
  // usa nei gusti non ha un problema di scorte, e senza questa somma la pagina
  // gli dichiarava «scorte insufficienti» su una base appena fatta.
  const disponibileDi = (k) => giacenzaDi(k) + (riepilogo.rientri[k] || 0)
  const problemi = useMemo(() => {
    return Object.entries(riepilogo.ings).filter(([k, qty]) => disponibileDi(k) < qty)
      .map(([k, qty]) => ({ nome: k, richiesto: qty, disponibile: disponibileDi(k) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riepilogo, magazzino, chiaviSalvate])

  // Le sessioni già registrate per il giorno scelto: registrarne una seconda è
  // legittimo (mattina e pomeriggio), ma va detto — senza avviso si finisce per
  // registrare due volte la stessa.
  const sessioniStessoGiorno = useMemo(
    () => (giornaliero || []).filter(g => g?.data === data),
    [giornaliero, data])

  const hasQta = Object.values(qtaMap).some(v => v > 0) || Object.values(vendibileMap).some(v => v > 0)

  // Conferma sessione produzione:
  // 1. Calcola magazzino e sessione nuovi
  // 2. SAVE FIRST: ssave SK_MAG + SK_GIOR. Se fallisce, abort senza state mutation
  //    (evita data loss: l'UI non mostra "salvato" se in realta' non lo e').
  // 3. Aggiorna state locale
  // 4. RPC stock_pf (carico produzione + eventuale trasferimento auto). Errori
  //    qui sono notificati ma non bloccano: la sessione e' già salvata.
  // Stock PF (carico vetrina + eventuale trasferimento) - condiviso tra il flusso
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
      // Audit 2026-09-14: `|| stampi` leggeva lo zero come "campo non
      // compilato". Chi produce dieci stampi e ne mette a banco zero (tutto
      // in congelatore) si vedeva caricare in vetrina, o spedire all'altra
      // sede, dieci stampi di merce che al banco non c'è. Il percorso del
      // titolare era stato corretto il 9 set, questi no: stesso dato, due
      // risultati diversi a seconda di chi registra.
      const vendibile = vendibileMap[r.nome] != null ? vendibileMap[r.nome] : stampi
      if (vendibile <= 0) continue
      const reg = getR(r.nome, r)
      // Audit 2026-09-09: un batch di semilavorato finiva nello stock dei
      // PRODOTTI FINITI, cioè nella vetrina da cui la cassa scarica le vendite.
      // Ma una crema pasticcera non si vende al banco: la vetrina si riempiva
      // di righe che nessuno avrebbe mai scaricato, e i suoi conti non
      // tornavano più. Il semilavorato resta nella sessione (va registrato, e
      // il suo food cost va contato) ma non entra in vetrina.
      if (!vaInVetrina(reg)) continue
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

  // Qui c'era `eseguiStockPF`, 45 righe che nessuno chiamava.
  //
  // Audit 2026-09-14: era una copia del carico in vetrina, tenuta in vita da
  // nessuno. Dentro c'era però l'unica protezione seria contro lo stock
  // fantasma — se il trasferimento fallisce e anche lo storno fallisce, la
  // merce resta in vetrina senza che nessuno lo sappia — e quella protezione,
  // stando in una funzione morta, non è mai entrata in funzione. Ora sta dentro
  // `handleConferma`, che è il percorso vero.

  const handleConferma = async () => {
    if (!hasQta || salvando) return
    setSalvando(true)

    // DIPENDENTE: niente ingredienti lato client → lo scarico magazzino e la
    // scrittura del giornaliero li fa il server (api/produzione-registra), che
    // restituisce dati SANITIZZATI (senza composizione/costi). Lo stock PF resta
    // qui (non richiede gli ingredienti). Save-first garantito dal server.
    if (isDipendente) {
      // L'id della sessione lo fa il client, una volta sola, e resta lo stesso
      // se si riprova.
      //
      // Audit 2026-09-14: il tablet in laboratorio perde la rete a metà. Il
      // server ha scritto, la risposta non arriva, e il messaggio diceva "I
      // dati non sono stati persi, riprova": chi riprovava registrava la stessa
      // produzione due volte, e il magazzino veniva scalato due volte. Ora al
      // secondo invio il server trova la sessione già scritta e non tocca nulla.
      if (!sessioneIdRef.current) sessioneIdRef.current = `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const prodottiPayload = ricette
        .filter(r => (qtaMap[r.nome] || 0) > 0 || (vendibileMap[r.nome] || 0) > 0)
        .map(r => ({ nome: r.nome, stampi: qtaMap[r.nome] || 0, vendibile: vendibileMap[r.nome] != null ? vendibileMap[r.nome] : (qtaMap[r.nome] || 0), congelabile: isCongelabile(r.nome) }))
      let resp
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/produzione-registra', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({
            sedeId, data, prodotti: prodottiPayload, note: sessNote, sessioneId: sessioneIdRef.current,
            destinazioneSedeId: destinazioneSedeId || null,
            destinazioneSedeNome: destinazioneSedeId ? (sediMapProd[destinazioneSedeId]?.nome || null) : null,
          }),
        })
        resp = await res.json().catch(() => null)
        if (!res.ok || !resp?.ok) throw new Error(resp?.error || `errore server (${res.status})`)
      } catch (e) {
        setSalvando(false)
        notify(`Non ho potuto registrare la produzione: ${friendlyErrorMessage(e)} Quello che hai scritto è ancora qui: riprova.`, false)
        return
      }
      setMagazzino(resp.magazzino); setGiornaliero(resp.giornaliero)
      // Stock PF: il server fa già il carico vetrina. Qui gestiamo SOLO l'eventuale
      // trasferimento auto verso un'altra sede (è un'operazione cross-sede che il
      // server attualmente non esegue lato dipendente).
      if (destinazioneSedeId && destinazioneSedeId !== sedeAttiva?.id) {
        await eseguiTrasferimentoAuto()
      }
      sessioneIdRef.current = null
      const orfani = Array.isArray(resp.stockOrfani) ? resp.stockOrfani : []
      // Audit 2026-09-14: la destinazione restava impostata dopo il
      // salvataggio. La produzione dopo partiva per l'altra sede senza che
      // nessuno l'avesse chiesto, e il campo è in fondo alla pagina: chi non
      // scorre non lo vede.
      setQtaMap({}); setVendMap({}); setSessNote(''); setDestinazioneSedeId(null); setConfermando(false); setSalvando(false)
      const msgDest = destinazioneSedeId && destinazioneSedeId !== sedeAttiva?.id ? ` - trasferimento inviato a ${sediMapProd[destinazioneSedeId]?.nome || 'destinazione'}` : ''
      if (orfani.length > 0) {
        notify(`Produzione registrata${msgDest}, ma ${orfani.length} prodotti non hanno aggiornato lo stock vetrina (riconciliare a mano)`, false)
      } else {
        notify(`Produzione registrata${msgDest} - magazzino e stock vetrina aggiornati`)
      }
      return
    }

    // Lo scarico deve trovare l'ingrediente anche se è salvato col nome
    // vecchio, e va registrato QUANTO si è scalato davvero.
    //
    // Bug: `if (nm[k])` saltava in silenzio ogni ingrediente la cui chiave in
    // magazzino non fosse canonica. Su un'azienda reale sono cinque su
    // trentacinque: si produceva, il food cost veniva calcolato, e le uova non
    // venivano mai scalate. La giacenza restava quella di sempre, e nessuno
    // poteva accorgersene guardando la pagina.
    //
    // Si tiene anche traccia di quanto e' stato effettivamente sottratto per
    // chiave, così l'eliminazione della sessione può restituire esattamente
    // quello — e non una quantità teorica su una chiave inventata.
    let erroriMovimenti = []
    const { nm, scalatoPerChiave, nonTrovati } = applicaConsumo(magazzino, riepilogo.ings, riepilogo.rientri, chiaviSalvate)
    const sess = {
      id: `g-${Date.now()}`, data,
      prodotti: ricette.filter(r => (qtaMap[r.nome] || 0) > 0 || (vendibileMap[r.nome] || 0) > 0).map(r => ({
        nome: r.nome, stampi: qtaMap[r.nome] || 0, vendibile: vendibileMap[r.nome] != null ? vendibileMap[r.nome] : (qtaMap[r.nome] || 0), congelabile: isCongelabile(r.nome),
      })),
      note: sessNote,
      // `ingredientiUsati` resta per compatibilità con le sessioni vecchie e
      // con la modifica, ma si salva anche cosa e' stato scalato DAVVERO e da
      // quale chiave: è l'unica informazione con cui l'eliminazione può
      // restituire la quantita' giusta al posto giusto.
      ingredientiUsati: riepilogo.ings,
      scalatoPerChiave,
      fcTot: riepilogo.fcTot, ricavoTot: riepilogo.ricavoTot,
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
        // Zero è una risposta, non un campo vuoto: `|| stampi` la
        // sovrascriveva. Chi produce dieci stampi e mette a banco zero pezzi
        // (tutto in congelatore, o tutto scartato) si vedeva caricare in
        // vetrina dieci stampi di merce che non c'è.
        const vendibile = vendibileMap[r.nome] != null ? vendibileMap[r.nome] : stampi
        if (vendibile <= 0) continue
        const reg = getR(r.nome, r)
        // Il semilavorato non entra in vetrina. Il guardiano c'era solo nel
        // trasferimento fra sedi (audit 9 set) e qui — che è il percorso di
        // tutti i giorni — no: un batch di base bianca finiva nello stock da
        // cui la cassa scarica le vendite, e non ne usciva mai più.
        if (!vaInVetrina(reg)) continue
        const unitaFactor = Number(reg.unita)
        const pezzi = vendibile * (Number.isFinite(unitaFactor) && unitaFactor > 0 ? unitaFactor : 1)
        if (pezzi <= 0) continue
        const prodottoKey = r.nome.toUpperCase().trim()
        try {
          await caricoProduzionePF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: pezzi, unita: 'pz', note: `Sessione ${data}${sess.note ? ' · ' + sess.note : ''}` })
        } catch (e) { stockErrors.push(`${r.nome}: ${friendlyErrorMessage(e)}`); continue }
        if (sedeDest) {
          try {
            await creaTrasferimento({ orgId, sedeDa: sedeProduttiva, sedeA: sedeDest, tipo: 'prodotto', prodotto: prodottoKey, quantita: pezzi, unita: 'pz', note: `Da produzione del ${data}`, autoInvia: true })
          } catch (e) {
            transferErrors.push(`${r.nome}: ${e.message}`)
            try {
              await scartoPF({ sedeId: sedeProduttiva, prodotto: prodottoKey, quantita: pezzi, note: 'Rollback trasferimento fallito' })
            } catch (rb) {
              // Il carico in vetrina è passato, il trasferimento no, e non si è
              // riusciti nemmeno a stornarlo: quei pezzi restano in vetrina
              // senza essere mai stati venduti né spediti. Si registra l'orfano,
              // così esiste da qualche parte e si può recuperare a mano.
              console.error('Rollback carico fallito:', rb)
              await registraStockOrfano({ sedeId: sedeProduttiva, prodotto: prodottoKey, pezzi, motivo: `rollback trasferimento fallito + storno fallito: ${rb?.message || 'errore'}` })
            }
          }
        }
      }
      erroriMovimenti = [...stockErrors, ...transferErrors]
    }

    setQtaMap({}); setVendMap({}); setSessNote(''); setDestinazioneSedeId(null); setConfermando(false); setSalvando(false)
    // UN SOLO messaggio.
    //
    // Prima l'avviso sui movimenti falliti veniva emesso qui sopra e subito
    // dopo arrivava "magazzino e stock vetrina aggiornati": la barra dei
    // messaggi ne mostra uno alla volta, quindi il secondo cancellava il primo.
    // L'utente leggeva che era tutto a posto proprio quando non lo era, e la
    // vetrina restava senza quei prodotti senza che nessuno lo sapesse.
    const msgDest = destinazioneSedeId && destinazioneSedeId !== sedeAttiva?.id ? ` · trasferimento inviato a ${sediMapProd[destinazioneSedeId]?.nome || 'destinazione'}` : ''
    if (erroriMovimenti.length > 0) {
      notify(`Produzione registrata${msgDest}, ma ${erroriMovimenti.length === 1 ? 'un prodotto non' : `${erroriMovimenti.length} prodotti non`} sono entrati nello stock vetrina: ${erroriMovimenti.slice(0, 2).join('; ')}. Sistemali da Magazzino, scheda Prodotti finiti.`, false)
    } else if (nonTrovati.length > 0) {
      // Gli ingredienti che in magazzino non ci sono: la produzione è salva,
      // ma il food cost li ha contati e la giacenza no.
      notify(`Produzione registrata${msgDest}. ${nonTrovati.length === 1 ? 'Un ingrediente non era' : `${nonTrovati.length} ingredienti non erano`} in magazzino, quindi non ${nonTrovati.length === 1 ? 'e\' stato' : 'sono stati'} scalati: ${nonTrovati.slice(0, 3).join(', ')}.`, false)
    } else {
      notify(`Produzione registrata${msgDest} · magazzino e stock vetrina aggiornati`)
    }
    setTab('storico')
  }

  const fmtG = g => g >= 1000 ? `${(Number(g) / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(g)||0).toLocaleString('it-IT', { useGrouping: 'always' })} g`
  const margPct = riepilogo.ricavoTot > 0 ? ((riepilogo.ricavoTot - riepilogo.fcTot) / riepilogo.ricavoTot * 100) : 0

  return (
    // paddingBottom 96 su mobile per non far coprire i bottoni dal FAB (bottom 78 + halo).
    // boxSizing border-box sui figli evita overflow su 375px.
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: isMobile ? 96 : 24, boxSizing: 'border-box', width: '100%', overflowX: 'hidden' }}>
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
            style={{ padding: dito ? '12px 18px' : '8px 16px', minHeight: dito ? 44 : undefined, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgCard, fontSize: FS.sm, fontWeight: 600, color: C.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            PDF
          </button>
        )}
      />

      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: `1px solid ${T.border}` }}>
        {/* Il dipendente vede solo "Nuova sessione" (oggi): niente storico giorni passati. */}
        {(isDipendente ? [['nuova', 'Nuova sessione']] : [['nuova', 'Nuova sessione'], ['storico', 'Storico']]).map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: dito ? '14px 18px' : '10px 16px', minHeight: dito ? 44 : undefined, border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: FS.base, fontWeight: tab === id ? 600 : 500, color: tab === id ? T.text : T.textSoft,
              borderBottom: tab === id ? `2px solid ${T.brand}` : '2px solid transparent', marginBottom: -1,
              transition: `color ${M.durFast} ${M.ease}` }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'nuova' && (
        <div>
          {/* Shortcut "parti da una foto" + "scarica modello" - collassati
              per non intralciare il flusso primario (inserimento manuale). */}
          <div style={{ marginBottom: showFotoPanel ? 12 : 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowFotoPanel(v => !v)} aria-expanded={showFotoPanel}
              style={{
                padding: isMobile ? '11px 14px' : '12px 16px',
                background: showFotoPanel ? `${T.brand}0F` : T.white,
                border: `1px solid ${showFotoPanel ? T.brand : 'rgba(15,23,42,0.10)'}`,
                borderRadius: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'inherit',
                color: showFotoPanel ? T.brand : C.text,
                transition: 'all 0.15s ease',
                boxShadow: showFotoPanel ? `0 4px 12px ${T.brand}22` : 'none',
              }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: showFotoPanel ? T.brand : `${T.brand}15`, color: showFotoPanel ? T.white : T.brand, flexShrink: 0 }}>
                <Icon name="camera" size={15} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                <span style={{ fontSize: FS.base, fontWeight: 700, lineHeight: 1.2 }}>Parti da una foto</span>
                <span style={{ fontSize: FS.sm, color: showFotoPanel ? T.brand : C.textSoft, fontWeight: 500, marginTop: 2, opacity: showFotoPanel ? 0.8 : 1 }}>Estrai i prodotti da un appunto</span>
              </span>
              <Icon name="chevDown" size={12} color={showFotoPanel ? T.brand : C.textSoft} />
            </button>

            {/* Scarica modello Excel: check-list stampabile per registrare la produzione a mano */}
            <button type="button" onClick={() => scaricaTemplateProduzione({ ricette, nomeAttivita, notify })} title="Scarica un modello Excel pre-compilato con le tue ricette"
              style={{
                padding: isMobile ? '11px 14px' : '12px 16px',
                background: T.white,
                border: '1px solid rgba(15,23,42,0.10)',
                borderRadius: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'inherit',
                color: C.text,
              }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: `${T.blue}15`, color: T.blue, flexShrink: 0 }}>
                <Icon name="download" size={15} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                <span style={{ fontSize: FS.base, fontWeight: 700, lineHeight: 1.2 }}>Scarica modello</span>
                <span style={{ fontSize: FS.sm, color: C.textSoft, fontWeight: 500, marginTop: 2 }}>Excel pre-compilato per la produzione</span>
              </span>
            </button>
          </div>

          {showFotoPanel && (
            <div style={{ background: C.bgCard, border: `1px solid ${T.brand}22`, borderRadius: 14, padding: isMobile ? '14px 16px' : '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: FS.sm, color: C.textMid, marginBottom: 12, lineHeight: 1.5 }}>
                Carica una foto dell'appunto di produzione (o listino): estraggo io prodotti e stampi, poi tu confermi.
              </div>
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
                setShowFotoPanel(false) // chiude pannello dopo l'import
                if (ignorati.length > 0) notify(`${importati} prodotti importati · ${ignorati.length} non riconosciuti (ignorati nei calcoli)`)
                else notify(`Importati ${importati} prodotti - controlla i valori`)
              }}/>
            </div>
          )}

          {prodottiNonRicettario && prodottiNonRicettario.length > 0 && (
            <div style={{ background: C.amberLight, border: `1px solid ${T.amber}40`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flexShrink: 0, marginTop: 1, color: C.amberDark }}><Icon name="warning" size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: C.amberDark, fontSize: FS.sm, marginBottom: 4 }}>
                  {prodottiNonRicettario.length} prodotto/i non riconosciuti dal ricettario - ignorati nei calcoli
                </div>
                <div style={{ fontSize: FS.sm, color: C.amberDark, lineHeight: 1.55 }}>Per includerli, aggiungi prima la ricetta. Lista solo informativa:</div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {prodottiNonRicettario.map((p, i) => (
                    <span key={i} style={{ background: T.white, border: `1px solid ${T.amber}40`, borderRadius: 6, padding: '3px 8px', fontSize: FS.sm, color: C.amberDark }}>
                      {p.nome}{p.stampi ? ` · ${p.stampi}` : ''}
                    </span>
                  ))}
                </div>
                <button onClick={() => setProdottiNonRicettario([])} style={{ marginTop: 8, minHeight: dito ? 44 : undefined, background: 'none', border: 'none', color: T.amberDark, fontSize: FS.sm, fontWeight: 600, cursor: 'pointer', padding: dito ? '0 8px' : 0, textDecoration: 'underline' }}>Nascondi</button>
              </div>
            </div>
          )}

          {/* Banda diagnosi LIVE: si aggiorna mentre aggiungi prodotti. */}
          {!isDipendente && (() => {
            const margine = riepilogo.ricavoTot - riepilogo.fcTot
            const mc = hasQta ? margColor(margPct) : C.textSoft
            const semaforo = !hasQta ? 'Inizia ad aggiungere i prodotti di oggi'
              : margPct >= 60 ? 'Margine sano' : margPct >= 40 ? 'Margine da tenere d’occhio' : 'Margine basso - rivedi i prezzi'
            return (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 14 }}>
                <KPI icon={<Icon name="package" size={18} />} label="Stampi totali"
                  value={riepilogo.stampiTot.toLocaleString('it-IT', { useGrouping: 'always' })}
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

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: isMobile ? 14 : 24, width: '100%' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)', boxSizing: 'border-box', width: '100%' }}>
                <div style={{ padding: isMobile ? '14px 16px' : '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-end', gap: isMobile ? 12 : 16, flexDirection: isMobile ? 'column' : 'row' }}>
                  <div style={{ flex: '0 0 auto', minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Data produzione</div>
                    {/* Audit 2026-09-14: la data si poteva svuotare (e allora la
                        sessione finiva senza data) e si poteva mettere nel
                        futuro. Il tetto è oggi: una produzione di domani non
                        esiste ancora. */}
                    <input type="date" value={data} max={todayLocal()}
                      onChange={e => setData(e.target.value || todayLocal())}
                      style={{ padding: dito ? '12px' : '9px 12px', minHeight: dito ? 44 : undefined, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: dito ? FS.lg : FS.sm, color: C.text, boxSizing: 'border-box', width: isMobile ? '100%' : 'auto', maxWidth: isMobile ? '100%' : undefined }}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Cerca prodotto
                    {sessioniStessoGiorno.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: typo.small.fontSize, color: C.amber, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="warning" size={12} />
                        {sessioniStessoGiorno.length === 1
                          ? 'Per questo giorno una sessione c\'è già: questa si aggiunge, non la sostituisce.'
                          : `Per questo giorno ci sono già ${sessioniStessoGiorno.length} sessioni: questa si aggiunge.`}
                      </div>
                    )}
                  </div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textSoft, display: 'inline-flex', pointerEvents: 'none' }}>
                        <Icon name="search" size={14} />
                      </span>
                      <input type="text" value={ricSearch} onChange={e => setRicSearch(e.target.value)}
                        placeholder={`Filtra fra ${ricette.length} ${ricette.length === 1 ? 'prodotto' : 'prodotti'}...`}
                        aria-label="Cerca prodotto"
                        style={{ padding: dito ? '12px 12px 12px 32px' : '9px 12px 9px 32px', minHeight: dito ? 44 : undefined, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: dito ? FS.lg : FS.base, color: C.text, boxSizing: 'border-box', width: '100%' }} />
                      {ricSearch && (
                        <button type="button" onClick={() => setRicSearch('')} aria-label="Pulisci ricerca"
                          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: dito ? 36 : 26, height: dito ? 36 : 26, background: 'transparent', border: 'none', color: C.textSoft, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
                          <Icon name="x" size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  {/* Su telefono la quarta colonna ("Pezzi al banco") restava
                      fuori dallo schermo e si scopriva solo scorrendo di
                      lato: la larghezza minima scende, e il testo va a capo
                      invece di spingere le colonne fuori. */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FS.sm, minWidth: isMobile ? 0 : 420, tableLayout: isMobile ? 'fixed' : 'auto' }}>
                    <thead>
                      <tr style={{ background: SUPERFICIE_CALDA }}>
                        {[
                          { h: LEX.Prodotto, sub: `${LEX.ricetta} · pezzi/stampo` },
                          { h: 'FC/stampo', sub: 'costo materie prime' },
                          { h: 'Stampi prodotti', sub: 'quanti stampi/teglie' },
                          { h: 'Pezzi al banco', sub: 'esposti per la vendita' },
                        ].map(({ h, sub }, i) => (
                          <th key={i} title={sub} style={{ padding: '10px 14px', textAlign: i < 2 ? 'left' : i === 2 ? 'right' : 'center', fontSize: FS.sm, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const q = ricSearch.trim().toLowerCase()
                        const filtered = q ? ricette.filter(r => (r.nome || '').toLowerCase().includes(q)) : ricette
                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={4} style={{ padding: '20px 14px', textAlign: 'center', fontSize: FS.sm, color: C.textSoft }}>
                                Nessun prodotto trovato per "{ricSearch}".{' '}
                                <button type="button" onClick={() => setRicSearch('')} style={{ background: 'transparent', border: 'none', color: T.brand, fontSize: FS.sm, fontWeight: 600, cursor: 'pointer', minHeight: dito ? 44 : undefined, padding: dito ? '0 8px' : 0, fontFamily: 'inherit' }}>Pulisci ricerca</button>
                              </td>
                            </tr>
                          )
                        }
                        return filtered.map((ric, i) => {
                        const reg = getR(ric.nome, ric)
                        const isSemi = reg.tipo === 'semilavorato'
                        const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
                        const q = qtaMap[ric.nome] || 0
                        const vq = vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : q
                        const cong = isCongelabile(ric.nome)
                        return (
                          <tr key={ric.nome} style={{ borderBottom: `1px solid ${C.border}`, background: (q > 0 || vq > 0) ? T.brandLight : i % 2 === 0 ? C.white : RIGA_ALTERNATA }}>
                            <td style={{ textAlign: 'right', ...TNUM, padding: '10px 14px', fontWeight: 700, color: C.text }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {ric.nome}
                                {isSemi && <span style={{ fontSize: FS.sm, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, background: T.bgSubtle, color: T.textMid }}>Semi</span>}
                              </span>
                              <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: FS.sm, color: C.textSoft }}>
                                  {isSemi
                                    ? <>1 batch diventa <b style={{ color: C.text }}>base per altre ricette</b></>
                                    : isGustoTipo(reg.tipo)
                                      ? <>1 batch rende <b style={{ color: C.text }}>{reg.unita} kg di gusto</b> (prezzo su formati vendita)</>
                                      : <>1 stampo rende <b style={{ color: C.text }}>{reg.unita} {labelPlurale(reg.tipo)}</b> × {fmt(reg.prezzo)}</>
                                  }
                                </span>
                                {q > 0 && reg.unita > 0 && (
                                  <span style={{ fontSize: FS.sm, fontWeight: 700, background: C.redLight, color: C.red, padding: '2px 7px', borderRadius: 4 }}>
                                    {q} × {reg.unita} = {(q * reg.unita).toLocaleString('it-IT', { useGrouping: 'always' })} pezzi al banco
                                  </span>
                                )}
                                {cong && <span style={{ fontSize: FS.sm, fontWeight: 700, background: T.blueLight, color: T.blue, padding: '2px 7px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="snow" size={12} /> congelabile</span>}
                              </div>
                            </td>
                            {/* Colonna di soldi: a destra e con le cifre a
                                larghezza fissa, altrimenti i numeri ballano
                                da una riga all'altra e non si confrontano. */}
                            <td style={{ padding: '10px 14px', color: C.red, textAlign: 'right', ...TNUM }}>{fmt(fc)}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <button aria-label="Diminuisci" onClick={() => setQ(ric.nome, Math.max(0, (qtaMap[ric.nome] || 0) - 1))} style={{ width: dito ? 44 : 30, height: dito ? 44 : 30, borderRadius: 5, border: `1px solid ${C.borderStr}`, background: C.white, cursor: 'pointer', color: C.textMid, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="minus" size={16} /></button>
                                <input type="number" min="0" value={q || ''} onChange={e => setQ(ric.nome, e.target.value)}
                                  style={{ width: 56, minHeight: dito ? 44 : undefined, padding: '8px 4px', borderRadius: 5, border: `1px solid ${q > 0 ? C.red : C.borderStr}`, background: C.white, fontSize: dito ? FS.lg : FS.md, textAlign: 'center', fontWeight: 800, color: q > 0 ? C.red : C.text }}/>
                                <button aria-label="Aumenta" onClick={() => setQ(ric.nome, (qtaMap[ric.nome] || 0) + 1)} style={{ width: dito ? 44 : 30, height: dito ? 44 : 30, borderRadius: 5, border: `1px solid ${C.borderStr}`, background: C.white, cursor: 'pointer', color: C.textMid, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={16} /></button>
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {cong ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                  <button aria-label="Diminuisci vendibile" onClick={() => setV(ric.nome, Math.max(0, (vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : q) - 1))} style={{ width: dito ? 44 : 30, height: dito ? 44 : 30, borderRadius: 5, border: `1px solid ${T.blue}40`, background: T.blueLight, cursor: 'pointer', color: T.blue, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="minus" size={16} /></button>
                                  <input type="number" min="0" value={vq || ''} onChange={e => setV(ric.nome, e.target.value)}
                                    style={{ width: 56, minHeight: dito ? 44 : undefined, padding: '8px 4px', borderRadius: 5, border: `1px solid ${vq > 0 ? T.blue : C.borderStr}`, background: T.blueLight, fontSize: dito ? FS.lg : FS.md, textAlign: 'center', fontWeight: 800, color: vq > 0 ? T.blue : C.text }}/>
                                  <button aria-label="Aumenta vendibile" onClick={() => setV(ric.nome, (vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : q) + 1)} style={{ width: dito ? 44 : 30, height: dito ? 44 : 30, borderRadius: 5, border: `1px solid ${T.blue}40`, background: T.blueLight, cursor: 'pointer', color: T.blue, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={16} /></button>
                                </div>
                              ) : (
                                <span style={{ fontSize: FS.sm, color: C.textSoft }}>= {LEX.prodotti}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                      })()}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: isMobile ? '14px 16px' : '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: isMobile ? '1 1 auto' : '1 1 240px', width: isMobile ? '100%' : 'auto', minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Note sessione</div>
                    <input type="text" value={sessNote} onChange={e => setSessNote(e.target.value)} placeholder="es. produzione weekend, teglia extra…"
                      style={{ width: '100%', padding: dito ? '12px' : '10px 12px', minHeight: dito ? 44 : undefined, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: dito ? FS.lg : FS.sm, color: C.text, boxSizing: 'border-box' }}/>
                  </div>
                  {haPiuSedi && (
                    <div style={{ flex: isMobile ? '1 1 auto' : '1 1 200px', width: isMobile ? '100%' : 'auto', minWidth: 0 }}>
                      <div style={{ fontSize: FS.sm, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Destinazione</div>
                      <select value={destinazioneSedeId || ''} onChange={e => setDestinazioneSedeId(e.target.value || null)}
                        style={{ width: '100%', padding: dito ? '12px' : '10px 12px', minHeight: dito ? 44 : undefined, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: dito ? FS.lg : FS.sm, color: C.text, background: C.bgCard, boxSizing: 'border-box' }}>
                        <option value="">Questa sede ({sedeAttiva?.nome || '-'})</option>
                        {sediAttive.filter(s => s.id !== sedeAttiva?.id).map(s => (
                          <option key={s.id} value={s.id}>Per: {s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, width: '100%' }}>
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? '16px' : '20px', boxShadow: SHADOW_PREMIUM, boxSizing: 'border-box', width: '100%' }}>
                <PanelHead icon={<Icon name="barChart" size={16} />} title="Riepilogo sessione" color={C.text} />
                {!hasQta ? (
                  <div style={{ color: C.textSoft, fontSize: FS.base, textAlign: 'center', padding: '20px 0' }}>Inserisci gli stampi prodotti</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ricette.filter(r => qtaMap[r.nome] > 0).map(ric => {
                      const reg = getR(ric.nome, ric)
                      const q = qtaMap[ric.nome]
                      const qv = vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : q
                      const pezziVetrina = qv * (reg.unita || 1)
                      return (
                        <div key={ric.nome} style={{ fontSize: FS.sm, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ color: C.text, fontWeight: 700 }}>{q} stampi · {ric.nome}</span>
                            {!isDipendente && <span style={{ fontWeight: 700, color: C.green, ...TNUM }}>{fmt(qv * reg.unita * reg.prezzo)}</span>}
                          </div>
                          {reg.unita > 1 && (
                            <div style={{ fontSize: FS.sm, color: C.textSoft, marginTop: 2 }}>
                              <Icon name="arrowR" size={11} style={{ verticalAlign: 'middle' }} /> <b style={{ color: C.red }}>{pezziVetrina.toLocaleString('it-IT', { useGrouping: 'always' })} {labelPlurale(reg.tipo)}</b> al banco
                              {q !== qv && <span style={{ color: C.amberDark, marginLeft: 6 }}>({qv} vendibili oggi, {q - qv} in freezer)</span>}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FS.sm, color: C.red, paddingTop: 4 }}>
                          <span>Food cost totale</span><span style={{ fontWeight: 700, ...TNUM }}>−{fmt(riepilogo.fcTot)}</span>
                        </div>
                        <div style={{ marginTop: 4, padding: '12px 14px', background: mbg, border: `1px solid ${mc}25`, borderRadius: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: FS.sm, fontWeight: 800, color: mc }}>Margine lordo</span>
                            <span style={{ fontSize: FS.xl, fontWeight: 900, color: mc, ...TNUM }}>{fmt(riepilogo.ricavoTot - riepilogo.fcTot)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FS.sm, marginTop: 4 }}>
                            <span style={{ color: C.textMid }}>Margine %</span>
                            {/* Audit 2026-09-09: toFixed usa il punto decimale, quindi il
                                margine usciva "33.3%" invece di "33,3%". */}
                            <span style={{ fontWeight: 700, color: mc, ...TNUM }}>{margPct.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
                          </div>
                        </div>
                      </>
                      )
                    })()}
                  </div>
                )}
              </div>

              {hasQta && (
                <div style={{ background: C.redLight, border: `1px solid ${C.red}30`, borderRadius: 16, padding: isMobile ? '14px' : '16px', boxShadow: '0 1px 2px rgba(110,14,26,0.05), 0 8px 22px rgba(110,14,26,0.06)', boxSizing: 'border-box', width: '100%' }}>
                  <PanelHead icon={<Icon name="gift" size={16} />} title="Stock vetrina dopo la sessione" color={C.red} />
                  <div style={{ fontSize: FS.sm, color: C.textMid, lineHeight: 1.55, marginBottom: 8 }}>
                    Una volta confermata, questi pezzi finiscono nello stock vetrina disponibile per la vendita:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ricette.filter(r => (vendibileMap[r.nome] != null ? vendibileMap[r.nome] : qtaMap[r.nome] || 0) > 0).map(ric => {
                      const reg = getR(ric.nome, ric)
                      const qv = vendibileMap[ric.nome] != null ? vendibileMap[ric.nome] : (qtaMap[ric.nome] || 0)
                      const pezzi = qv * (reg.unita || 1)
                      return (
                        <span key={ric.nome} style={{ fontSize: FS.sm, padding: '6px 10px', borderRadius: 6, background: C.white, border: `1px solid ${C.red}25`, color: C.text, fontWeight: 700 }}>
                          {ric.nome} <span style={{ color: C.red }}>+{pezzi.toLocaleString('it-IT', { useGrouping: 'always' })}</span> <span style={{ fontWeight: 500, color: C.textSoft }}>{labelPlurale(reg.tipo)}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {hasQta && !isDipendente && (
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? '16px' : '20px', boxShadow: SHADOW_PREMIUM, boxSizing: 'border-box', width: '100%' }}>
                  <PanelHead icon={<Icon name="receipt" size={16} />} title="Ingredienti da scalare" color={C.text} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                    {Object.entries(riepilogo.ings).sort((a, b) => b[1] - a[1]).map(([k, qty]) => {
                      // Audit 2026-09-20, terza volta che esce lo stesso
                      // difetto: qui si leggeva `magazzino[k]`, cioè la chiave
                      // canonica («uovo»), mentre il magazzino tiene la chiave
                      // che ha scritto l'utente («uova»). Risultato: giacenza
                      // zero e «non basta» in rosso su un ingrediente pieno.
                      // Lo scarico era stato corretto il 9 settembre, l'allarme
                      // il 14, questo riquadro no.
                      const giac = disponibileDi(k)
                      const ok = giac >= qty
                      return (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: FS.sm, padding: '6px 8px', borderRadius: 6, background: ok ? T.bgSubtle : C.redLight }}>
                          <span style={{ fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{k}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ color: C.red, fontWeight: 700 }}>−{fmtG(qty)}</span>
                            <span style={{ color: ok ? C.green : C.red, fontSize: FS.sm }}>{ok ? `resta ${fmtG(giac - qty)}` : 'non basta'}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Righe su cui il magazzino non si può muovere. Audit 2026-09-09:
                  prima venivano ignorate in silenzio, e il magazzino restava
                  pieno senza che nessuno lo dicesse. Una base ('interno') non si
                  espande perché le sue dosi sono tenute per sé dal
                  laboratorio: il costo al kg e' scritto a mano e le quantita'
                  non sono un dato su cui scalare le giacenze. */}
              {riepilogo.nonScaricabili.length > 0 && !isDipendente && (
                <div style={{ background: C.amberLight, border: `1px solid ${C.amber}40`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                  <div style={{ fontSize: typo.small.fontSize, fontWeight: 800, color: C.amber, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="warning" size={13} /> Queste non vengono scalate dal magazzino
                  </div>
                  {riepilogo.nonScaricabili.map(nd => (
                    <div key={nd.nome} style={{ fontSize: typo.small.fontSize, color: C.textMid, marginBottom: 4, lineHeight: 1.5 }}>
                      <b style={{ textTransform: 'capitalize', color: C.text }}>{nd.nome}</b>: {nd.motivo}
                    </div>
                  ))}
                </div>
              )}

              {problemi.length > 0 && !isDipendente && (
                <div style={{ background: C.redLight, border: `1px solid ${C.red}25`, borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: FS.sm, fontWeight: 800, color: C.alert, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={15} />Scorte insufficienti</div>
                  {problemi.map(p => (
                    <div key={p.nome} style={{ fontSize: FS.sm, color: C.red, marginBottom: 4 }}>
                      <b style={{ textTransform: 'capitalize' }}>{p.nome}</b>: servono {fmtG(p.richiesto)}, disponibili {fmtG(p.disponibile)}
                    </div>
                  ))}
                  <div style={{ fontSize: FS.sm, color: C.red, marginTop: 8 }}>Puoi procedere comunque - il magazzino andrà a 0.</div>
                </div>
              )}

              {hasQta && (
                !confermando ? (
                  <button onClick={() => setConfermando(true)} style={{ padding: isMobile ? '15px' : '14px', minHeight: 48, width: '100%', background: C.red, color: C.white, border: 'none', borderRadius: 12, fontWeight: 800, fontSize: FS.md, cursor: 'pointer', boxShadow: '0 2px 8px rgba(110,14,26,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxSizing: 'border-box' }}><Icon name="checkCircle" size={16} />Conferma produzione</button>
                ) : (
                  <div style={{ background: C.redLight, border: `1px solid ${C.red}30`, borderRadius: 12, padding: isMobile ? '14px' : '16px', boxSizing: 'border-box', width: '100%' }}>
                    <div style={{ fontSize: FS.sm, fontWeight: 700, color: C.red, marginBottom: 10 }}>Confermi? Il magazzino verrà scalato.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleConferma} disabled={salvando}
                        style={{ flex: 1, padding: isMobile ? '12px' : '10px', minHeight: 44, background: salvando ? T.textMid : C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: FS.base, cursor: salvando ? 'wait' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
                        {salvando ? 'Salvataggio…' : 'Sì, conferma'}
                      </button>
                      <button onClick={() => setConfermando(false)} disabled={salvando}
                        style={{ flex: 1, padding: isMobile ? '12px' : '10px', minHeight: 44, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, fontSize: FS.base, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.6 : 1 }}>
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
              <div style={{ fontSize: FS.md, fontWeight: 600, color: C.text, marginBottom: 8 }}>Nessuna sessione registrata</div>
              <button onClick={() => setTab('nuova')} style={{ padding: dito ? '13px 24px' : '9px 22px', minHeight: dito ? 44 : undefined, background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: FS.sm, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="plus" size={13} />Prima sessione</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                // Un totale si dice su quante sessioni è calcolato.
                //
                // Audit 2026-09-20, sui dati veri: `s.fcTot || 0` sommava come
                // zero le sessioni che il food cost non ce l'hanno (quelle
                // nate da un evento non lo calcolano). Il totale usciva più
                // basso del vero senza che niente lo dicesse — ed è un numero
                // su cui si decidono i prezzi.
                const tot = giornaliero.reduce((a, s) => {
                  const ric = numeroNoto(s.ricavoTot), fc = numeroNoto(s.fcTot)
                  if (ric != null) { a.ric += ric; a.nRic++ }
                  if (fc != null) { a.fc += fc; a.nFc++ }
                  a.stampi += prodottiDiSessione(s).reduce((x, p) => x + (Number(p.stampi) || 0), 0)
                  return a
                }, { ric: 0, fc: 0, stampi: 0, nRic: 0, nFc: 0 })
                const nSess = giornaliero.length
                // Il margine ha senso solo sulle sessioni che hanno TUTTI E
                // DUE i numeri: mescolare un ricavo noto con un costo ignoto
                // fa un margine inventato.
                const completo = tot.nRic === nSess && tot.nFc === nSess
                const mtot = tot.ric - tot.fc
                const mpct = tot.ric > 0 ? (mtot / tot.ric * 100) : 0
                const su = (n) => n === nSess ? 'somma sessioni' : `su ${n.toLocaleString('it-IT')} ${n === 1 ? 'sessione' : 'sessioni'} su ${nSess.toLocaleString('it-IT')}`
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 6 }}>
                    <KPI icon={<Icon name="calendar" size={18} />} label="Sessioni" value={nSess.toLocaleString('it-IT', { useGrouping: 'always' })} sub={`${tot.stampi.toLocaleString('it-IT', { useGrouping: 'always' })} stampi totali`} />
                    <KPI icon={<Icon name="money" size={18} />} label="Ricavo potenziale" value={tot.nRic === 0 ? '—' : fmt0(tot.ric)} color={C.green} sub={tot.nRic === 0 ? 'nessuna sessione lo riporta' : su(tot.nRic)} />
                    <KPI icon={<Icon name="receipt" size={18} />} label="Food cost" value={tot.nFc === 0 ? '—' : fmt0(tot.fc)} color={C.red} sub={tot.nFc === 0 ? 'nessuna sessione lo riporta' : tot.ric > 0 && completo ? `${fmtp(tot.fc / tot.ric * 100)} sul ricavo` : su(tot.nFc)} />
                    <KPI icon={<Icon name="trendUp" size={18} />} label="Margine lordo" value={completo ? fmt0(mtot) : '—'} highlight sub={!completo ? 'manca il costo o il ricavo di qualche sessione' : tot.ric > 0 ? `${fmtp(mpct)} sul ricavo` : '-'} />
                  </div>
                )
              })()}
              {giornaliero.map((sess) => (
                <div key={sess.id} className={editSessId === sess.id ? undefined : 'fos-tile'} style={{ background: C.bgCard, border: `1px solid ${deleteSessConf?.id === sess.id ? C.red : C.border}`, borderRadius: 16, padding: isMobile ? '14px 16px' : '16px 20px', boxShadow: SHADOW_PREMIUM }}>
                  {/* Header sessione: su mobile in colonna (data sopra, KPI grid, bottoni full-width)
                      → niente più 4 colonnine schiacciate che fanno wrap caotico. */}
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: isMobile ? 12 : 8, marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: FS.md, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{giornoIT(sess.data, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                          <span style={{ fontSize: FS.sm, fontWeight: 600, color: C.textSoft, textTransform: 'capitalize' }}>{giornoIT(sess.data, { weekday: 'long' })}</span>
                        </div>
                        {/* Audit 2026-09-20: nello storico vero di Mara dei
                            Boschi c'è una sessione datata 30 settembre, nata
                            dal modulo Eventi, mentre oggi è il 19. Il campo
                            data di questa pagina il futuro non lo accetta
                            (`max={todayLocal()}`), ma chi arriva da un evento
                            scavalca il campo. Una produzione non ancora fatta
                            che si legge come le altre gonfia il ricavo e il
                            food cost del periodo: va detto che è in programma,
                            non che è successa. */}
                        {soloData(sess.data) > todayLocal() && (
                          <span style={{ fontSize: FS.sm, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: C.amberLight, color: C.amberDark, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                            title="Questa produzione è datata avanti nel tempo: è in programma, non ancora fatta.">
                            <Icon name="calendar" size={12} />In programma
                          </span>
                        )}
                        {sess.destinazioneSedeNome && (
                          <span style={{ fontSize: FS.sm, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: C.amberLight, color: C.amberDark, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="truck" size={13} />Per: {sess.destinazioneSedeNome}</span>
                        )}
                      </div>
                      {sess.note && <div style={{ fontSize: FS.sm, color: C.textSoft, marginTop: 4 }}>{sess.note}</div>}
                    </div>
                    {!isDipendente && (() => {
                      const stampiSess = prodottiDiSessione(sess).reduce((x, p) => x + (Number(p.stampi) || 0), 0)
                      // Quello che la sessione non riporta resta un trattino.
                      // Scrivere «0 €» dove non sappiamo il costo è la stessa
                      // bugia di scrivere «gratis».
                      const ricSess = numeroNoto(sess.ricavoTot), fcSess = numeroNoto(sess.fcTot)
                      const noti = ricSess != null && fcSess != null
                      const margSess = noti ? ricSess - fcSess : null
                      const mPctSess = noti && ricSess > 0 ? margSess / ricSess * 100 : 0
                      const mcSess = noti ? margColor(mPctSess) : C.textSoft
                      const nonSo = 'Questa sessione non porta questo numero: non è stato calcolato quando è stata registrata.'
                      // minWidth sulla cella: senza, su schermi stretti le
                      // quattro celle si comprimono e i numeri delle sessioni
                      // affiancate non risultano più incolonnati fra loro.
                      const kpiCell = { display: 'flex', flexDirection: 'column', gap: 2, alignItems: isMobile ? 'flex-start' : 'flex-end', minWidth: isMobile ? 0 : 92, minHeight: isMobile ? 40 : 42 }
                      const kpiLabel = { fontSize: FS.sm, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, lineHeight: 1.2, minHeight: 15 }
                      const kpiVal   = { fontSize: FS.md, fontWeight: 800, ...TNUM, lineHeight: 1.1 }
                      return (
                        <div style={{
                          display: isMobile ? 'grid' : 'flex',
                          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : undefined,
                          gap: isMobile ? 8 : 18,
                          textAlign: isMobile ? 'left' : 'right',
                          alignItems: 'flex-start',
                        }}>
                          {/* Una cella sola: i due rami isMobile / !isMobile
                              erano identici carattere per carattere. */}
                          <div style={kpiCell}><div style={kpiLabel}>Stampi</div><div style={{ ...kpiVal, color: C.text }}>{stampiSess.toLocaleString('it-IT', { useGrouping: 'always' })}</div></div>
                          <div style={kpiCell}><div style={kpiLabel}>Ricavo pot.</div><div title={ricSess == null ? nonSo : undefined} style={{ ...kpiVal, color: ricSess == null ? C.textSoft : C.green }}>{ricSess == null ? '—' : fmt0(ricSess)}</div></div>
                          <div style={kpiCell}><div style={kpiLabel}>Food cost</div><div title={fcSess == null ? nonSo : undefined} style={{ ...kpiVal, color: fcSess == null ? C.textSoft : C.red }}>{fcSess == null ? '—' : fmt0(fcSess)}</div></div>
                          {!isMobile && <div style={kpiCell}><div style={kpiLabel}>Margine</div><div title={noti ? undefined : nonSo} style={{ ...kpiVal, color: mcSess }}>{noti ? fmt0(margSess) : '—'}</div></div>}
                          {isMobile && <div style={{ ...kpiCell, gridColumn: 'span 3', alignItems: 'flex-start', borderTop: `1px dashed ${C.border}`, paddingTop: 6 }}><div style={kpiLabel}>Margine</div><div title={noti ? undefined : nonSo} style={{ ...kpiVal, color: mcSess }}>{noti ? fmt0(margSess) : '—'}</div></div>}
                        </div>
                      )
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => editSessId === sess.id ? annullaModifica() : apriModificaSessione(sess)}
                      style={{ flex: isMobile ? 1 : 'unset', padding: dito ? '12px 16px' : '6px 12px', minHeight: dito ? 44 : 'auto', borderRadius: 6, border: `1px solid ${C.borderStr}`, background: C.white, color: C.textMid, fontSize: dito ? FS.base : FS.sm, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{editSessId === sess.id ? <><Icon name="x" size={dito ? 13 : 12} />Chiudi</> : <><Icon name="edit" size={dito ? 13 : 12} />Modifica</>}</button>
                    <button onClick={() => { setDeleteSessConf(sess); setDeleteSessPin(''); annullaModifica() }}
                      style={{ flex: isMobile ? 1 : 'unset', padding: dito ? '12px 16px' : '6px 12px', minHeight: dito ? 44 : 'auto', borderRadius: 6, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: dito ? FS.base : FS.sm, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Icon name="trash" size={dito ? 13 : 12} />Elimina</button>
                  </div>
                  {editSessId === sess.id ? (
                    <div style={{ marginTop: 12, padding: '14px 16px', background: SUPERFICIE_CALDA, border: `1px solid ${C.borderStr}`, borderRadius: 10 }}>
                      <div style={{ fontSize: FS.sm, fontWeight: 800, color: C.text, marginBottom: 4 }}>Modifica quantità prodotte</div>
                      <div style={{ fontSize: FS.sm, color: C.textSoft, marginBottom: 10, lineHeight: 1.5 }}>Cambia gli stampi o i pezzi vendibili. Metti <b>0</b> per togliere un prodotto. Magazzino e vetrina verranno riallineati di conseguenza.</div>
                      {/* Intestazioni colonne */}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 64px 64px' : '1fr 90px 90px', gap: 8, marginBottom: 4 }}>
                        <div/>
                        <div style={{ fontSize: FS.sm, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, textAlign: 'center' }}>Stampi</div>
                        <div style={{ fontSize: FS.sm, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, textAlign: 'center' }}>Vendibili</div>
                      </div>
                      {prodottiDiSessione(sess).map(p => (
                        <div key={p.nome} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 70px 70px' : '1fr 90px 90px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: FS.sm, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                          <input type="number" min="0" inputMode="decimal" value={editRows[p.nome]?.stampi ?? ''} disabled={editConfirm}
                            onChange={e => setEditRows(m => ({ ...m, [p.nome]: { ...m[p.nome], stampi: e.target.value } }))}
                            style={{ padding: '8px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: dito ? FS.lg : FS.sm, color: C.text, background: C.white, textAlign: 'right', minHeight: dito ? 44 : 'auto' }}/>
                          <input type="number" min="0" inputMode="decimal" value={editRows[p.nome]?.vendibile ?? ''} disabled={editConfirm}
                            onChange={e => setEditRows(m => ({ ...m, [p.nome]: { ...m[p.nome], vendibile: e.target.value } }))}
                            style={{ padding: '8px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: dito ? FS.lg : FS.sm, color: C.text, background: C.white, textAlign: 'right', minHeight: dito ? 44 : 'auto' }}/>
                        </div>
                      ))}
                      {!editConfirm ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button onClick={() => setEditConfirm(true)} style={{ flex: 1, padding: '11px', minHeight: 44, background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: FS.base, cursor: 'pointer' }}>Salva modifiche</button>
                          <button onClick={annullaModifica} style={{ padding: '11px 16px', minHeight: 44, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, fontSize: FS.base, cursor: 'pointer' }}>Annulla</button>
                        </div>
                      ) : (
                        <div style={{ marginTop: 12, padding: '12px 14px', background: C.amberLight, border: `1px solid ${C.amber}`, borderRadius: 8 }}>
                          <div style={{ fontSize: FS.sm, fontWeight: 800, color: C.amber, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="warning" size={13} />Confermi le modifiche?</div>
                          <div style={{ fontSize: FS.sm, color: C.textMid, marginBottom: 10, lineHeight: 1.5 }}>Questa azione riallinea il <b>magazzino</b> (ingredienti) e la <b>vetrina</b> (stock prodotti finiti) in base alle nuove quantità. Non è automaticamente reversibile.</div>
                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
                            <button onClick={() => salvaModificheSessione(sess)} disabled={savingEdit} style={{ flex: 1, padding: '11px', minHeight: 44, background: C.amber, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: FS.base, cursor: savingEdit ? 'not-allowed' : 'pointer', opacity: savingEdit ? 0.6 : 1 }}>{savingEdit ? 'Salvataggio…' : 'Sì, conferma e aggiorna'}</button>
                            <button onClick={() => setEditConfirm(false)} disabled={savingEdit} style={{ padding: '11px 16px', minHeight: 44, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, fontSize: FS.base, cursor: 'pointer' }}>Indietro</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <ProdottiChips prodotti={prodottiDiSessione(sess)} dito={dito} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {deleteSessConf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => {
            // Audit 2026-09-14: lo sfondo chiudeva la finestra anche mentre
            // l'eliminazione era in corso. Chi tocca fuori crede di aver
            // annullato, e invece la sessione sta sparendo lo stesso.
            if (deletingSess) return
            if (e.target === e.currentTarget) { setDeleteSessConf(null); setDeleteSessPin('') }
          }}>
          <div style={{ background: C.white, borderRadius: 14, padding: isMobile ? '20px 18px' : '28px 32px', maxWidth: 460, width: '90%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: FS.md, fontWeight: 900, color: C.red, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="trash" size={16} />Elimina sessione di produzione</div>
            <div style={{ fontSize: FS.base, color: C.text, marginBottom: 4 }}>
              <b>{giornoIT(deleteSessConf.data, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</b>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 12px' }}>
              {prodottiDiSessione(deleteSessConf).map(p => (
                <span key={p.nome} style={{ background: SUPERFICIE_CALDA, border: `1px solid ${C.border}`, borderRadius: 5, padding: '4px 9px', fontSize: FS.sm, fontWeight: 700, color: C.textMid }}>{(Number(p.stampi)||0).toLocaleString('it-IT', { useGrouping: 'always' })}× {p.nome}</span>
              ))}
            </div>
            {deleteSessConf.ingredientiUsati && Object.keys(deleteSessConf.ingredientiUsati).length > 0 ? (
              <div style={{ background: C.greenLight, border: `1px solid ${C.green}30`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: FS.sm, color: C.green }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="refresh" size={12} /><b>Gli ingredienti verranno restituiti al magazzino:</b></span>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(deleteSessConf.ingredientiUsati).map(([k, qty]) => (
                    <span key={k} style={{ background: `${C.green}20`, borderRadius: 4, padding: '3px 8px', fontSize: FS.sm, fontWeight: 600, textTransform: 'capitalize' }}>
                      {/* Audit 2026-09-09: "1.25kg" col punto decimale e senza
                          spazio prima dell'unita'. In italiano si scrive
                          "1,25 kg", e i grammi vogliono il punto delle
                          migliaia: 8400 g e' "8.400 g". */}
                      {k}: +{qty >= 1000
                        ? `${(qty / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
                        : `${Math.round(qty).toLocaleString('it-IT', { useGrouping: 'always' })} g`}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: C.amberLight, border: `1px solid ${T.amber}40`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: FS.sm, color: C.amberDark, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="warning" size={13} />Questa sessione non ha dati sugli ingredienti usati - il magazzino non verrà aggiornato.
              </div>
            )}
            <div style={{ fontSize: FS.sm, fontWeight: 700, color: C.textSoft, marginBottom: 6 }}>Scrivi <b style={{ color: C.red }}>ELIMINA</b> per confermare:</div>
            <input autoFocus value={deleteSessPin} onChange={e => setDeleteSessPin(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleDeleteSessione(deleteSessConf) }}
              placeholder="ELIMINA"
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 7, border: `2px solid ${deleteSessPin === 'ELIMINA' ? C.red : C.borderStr}`, fontSize: FS.md, fontWeight: 800, color: C.red, letterSpacing: '0.1em', marginBottom: 16, outline: 'none', minHeight: 44 }}/>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
              <button onClick={() => handleDeleteSessione(deleteSessConf)}
                disabled={deleteSessPin !== 'ELIMINA' || deletingSess}
                style={{ flex: 1, padding: '12px', minHeight: 44, background: (deleteSessPin === 'ELIMINA' && !deletingSess) ? C.red : C.borderSoft, color: (deleteSessPin === 'ELIMINA' && !deletingSess) ? C.white : C.textMid, border: 'none', borderRadius: 8, fontSize: FS.base, fontWeight: 800, cursor: (deleteSessPin === 'ELIMINA' && !deletingSess) ? 'pointer' : 'not-allowed' }}>
                {deletingSess ? 'Eliminazione…' : 'Elimina e reintegra magazzino'}
              </button>
              <button onClick={() => { setDeleteSessConf(null); setDeleteSessPin('') }} disabled={deletingSess} style={{ flex: 1, padding: '12px', minHeight: 44, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: FS.base, fontWeight: 700, cursor: deletingSess ? 'not-allowed' : 'pointer', opacity: deletingSess ? 0.6 : 1 }}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
