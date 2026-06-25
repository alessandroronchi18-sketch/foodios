// Perdite & cessioni — pagina OWNER-POV che unifica "Sprechi e omaggi" e
// "Discrepanze" in un'unica vista DIAGNOSI → CAPISCI → AGISCI (stile Food Cost).
//
// Risponde a una sola domanda del proprietario: "quanto prodotto se n'e' andato
// senza incasso, perche', e quanto mi e' costato?".
//
// MODELLO DATI (low-risk, non distruttivo):
//   - Store canonico = SK_MOV ('pasticceria-movimenti-speciali-v1', per-sede).
//     Le nuove registrazioni scrivono SEMPRE qui, con `tipo` ∈ {spreco, omaggio}
//     (INVARIATO: la cassa/aggregaGiorno somma per tipo) e una `causale` ricca:
//       spreco  → scarto | avanzo | errore_produzione | ammanco
//       omaggio → regalo | cortesia
//   - LETTURA LEGACY (sola lettura, nessuna migrazione): all'avvio carichiamo
//     ANCHE SK_DISCREPANZE ('pasticceria-discrepanze-v1') e ci pieghiamo dentro
//     quei record storici, normalizzati alla stessa shape di display, con i loro
//     € gia' stimati. Non scriviamo/eliminiamo mai SK_DISC. De-dup per id.
//     I tipi storici 'porzione_grande'/'porzione_piccola' sono DRIFT di porzionatura,
//     non perdite discrete: li mostriamo come insight informativo, NON come movimenti.
//
// DIPENDENTE: vede solo la registrazione rapida (+ la propria lista del giorno),
// nessuna diagnosi/totale aziendale. Salvataggio via /api/spreco-registra INVARIATO.
//
// SAVE-FIRST: aggiungiMovimento/eliminaMovimento fanno `await ssave` prima di
// restituire; aggiorniamo lo state solo dopo. Firma export e shape movimento immutate.

import React, { useEffect, useMemo, useState } from 'react'
import { color as T } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import { KPI, SH, PageHeader } from '../views/_shared'
import { buildIngCosti, calcolaFC, getR, isRicettaValida } from '../lib/foodcost'
import { sload } from '../lib/storage'
import { supabase } from '../lib/supabase'
import { todayLocal } from '../lib/dateLocal'
import {
  nuovoMovimento, caricaMovimenti, aggiungiMovimento, eliminaMovimento,
  filtraPerIntervallo,
} from '../lib/movimentiSpeciali'
import { scartoPF } from '../lib/stockPF'

const SK_DISCREPANZE = 'pasticceria-discrepanze-v1'

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'
const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

const C = {
  bg: T.bg, bgCard: T.bgCard, bgSubtle: T.bgSubtle, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.bgCard,
  border: T.border, borderStr: T.borderStr, borderSoft: T.borderSoft,
}
// Azzurro coerente per "omaggio" (cessione gratuita, non perdita per errore).
const BLU = '#0369A1'
const BLU_LIGHT = '#E0F2FE'

// ── Tassonomia causali (owner-POV) ───────────────────────────────────────────
// tipo resta 'spreco'|'omaggio' (vincolo cassa). Il dettaglio sta nella causale.
// Audit 2026-07-01 batch 11 Sprechi/Omaggi: categorie ASL standard
// (Reg. UE 1169 + best practice food safety). Servono per:
//   - Report ASL annuale (categoria → totali kg + €)
//   - Note di credito fornitore (danneggiato_trasporto, scaduto-da-fornitore)
//   - R&D budget (test_ricetta separato da cortesia cliente)
const CAUSALI = {
  spreco: [
    { id: 'scaduto',           label: 'Scaduto',              desc: 'Prodotto oltre data di scadenza: smaltimento HACCP obbligatorio' },
    { id: 'scarto',            label: 'Scarto / buttato',     desc: 'Prodotto gettato: contaminazione, caduto, non conforme' },
    { id: 'avanzo',            label: 'Avanzo fine giornata', desc: 'Prodotto invenduto a fine giornata, non recuperabile' },
    { id: 'errore_produzione', label: 'Errore in produzione', desc: 'Venuto male in lavorazione/cottura, non vendibile' },
    { id: 'danneggiato_trasporto', label: 'Danneggiato trasporto', desc: 'Arrivato non conforme dal fornitore: rivendicare nota di credito' },
    { id: 'ammanco',           label: 'Ammanco',              desc: 'Sparizione non spiegata da inventario o cassa' },
  ],
  omaggio: [
    { id: 'regalo',     label: 'Regalo al cliente',  desc: 'Prodotto ceduto gratis: cortesia, recupero cliente, fidelizzazione' },
    { id: 'cortesia',   label: 'Assaggio / promo',   desc: 'Assaggio cliente al banco, evento, fidelizzazione' },
    { id: 'test_ricetta', label: 'Test ricetta / R&D', desc: 'Prova interna: NON è omaggio cliente. Budget separato per ricerca prodotto' },
  ],
}
const CAUSALE_LABEL = {}
for (const t of ['spreco', 'omaggio']) for (const c of CAUSALI[t]) CAUSALE_LABEL[c.id] = c.label

// Mappa dei tipi storici Discrepanze → { tipo, causale } del modello unificato.
// porzione_* NON sono movimenti discreti (drift di porzionatura) → li escludiamo
// dalla lista e li conteggiamo a parte come insight.
const LEGACY_MAP = {
  regalo:            { tipo: 'omaggio', causale: 'regalo' },
  scarto:            { tipo: 'spreco',  causale: 'scarto' },
  avanzo:            { tipo: 'spreco',  causale: 'avanzo' },
  errore_produzione: { tipo: 'spreco',  causale: 'errore_produzione' },
  furto:             { tipo: 'spreco',  causale: 'ammanco' },
}

const inputS = { width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.borderStr}`, fontSize: 16, color: C.text, boxSizing: 'border-box', fontFamily: 'inherit', background: C.white }
const labelS = { fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, display: 'block' }

const fmt = n => `${(Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const fmt0 = n => { const v = Number(n); return `${Math.round(Number.isFinite(v) ? v : 0).toLocaleString('it-IT')} €` }
const fmtp = n => `${(Number.isFinite(Number(n)) ? Number(n) : 0).toFixed(0)}%`
const fmtQta = (q, u) => `${(Number(q) || 0).toLocaleString('it-IT')} ${u || ''}`.trim()
const fmtN = n => (Number(n) || 0).toLocaleString('it-IT')
const fmtTs = iso => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function cardStyle() { return { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: SHADOW_PREMIUM } }

// Mese corrente in YYYY-MM
function meseCorrente() { return todayLocal().slice(0, 7) }
// Estremi [da, a] del mese YYYY-MM
function estremiMese(ym) {
  const [y, m] = ym.split('-').map(Number)
  const da = `${ym}-01`
  const ultimo = new Date(y, m, 0).getDate()
  const a = `${ym}-${String(ultimo).padStart(2, '0')}`
  return { da, a }
}

// Normalizza un record legacy Discrepanze nella shape di display unificata.
// Non muta SK_DISC: produce solo un oggetto read-only marcato `_legacy`.
function normalizzaLegacy(it) {
  const map = LEGACY_MAP[it.tipo]
  if (!map) return null // porzione_* o tipi ignoti → non sono movimenti discreti
  const fcTot = Number(it.costo_totale) || 0
  const qta = Number(it.quantita) || 0
  const ts = it.data ? `${it.data}T12:00:00` : (it.updated_at || new Date().toISOString())
  return {
    id: `disc-${it.id}`,               // prefisso per de-dup vs SK_MOV
    ts,
    tipo: map.tipo,
    causale: map.causale,
    categoria: '',
    prodotto: it.prodotto || '',
    qta,
    unita: 'pz',
    fcUnit: qta > 0 ? fcTot / qta : (Number(it.costo_unita) || 0),
    fcTot,
    valoreOmaggio: map.tipo === 'omaggio' ? (Number(it.mancato_ricavo) || 0) : 0,
    note: it.note || '',
    autore_email: null,
    autore_ruolo: null,
    autore_uid: null,
    _legacy: true,
  }
}

export default function SpreciOmaggi({ orgId, sedeId, sedeAttiva, ricettario, auth, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const confirmDialog = useConfirm()
  const isDip = auth?.isDipendente
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])

  const [movs, setMovs] = useState([])         // SK_MOV (sorgente scrittura)
  const [legacy, setLegacy] = useState([])     // SK_DISC normalizzati (sola lettura)
  const [legacyDrift, setLegacyDrift] = useState([]) // porzione_* storici (insight)
  // Audit 2026-07-01 batch 11: ricavi mese per soglia % alert.
  const [chiusureMese, setChiusureMese] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('tutti')
  const [filtroCausale, setFiltroCausale] = useState('tutte')
  const [mese, setMese] = useState(meseCorrente())

  // Suggerimenti per il campo "Cosa" (ricette valide vendibili + categorie).
  const suggerimenti = useMemo(() => {
    const out = new Set()
    for (const r of Object.values(ricettario?.ricette || {})) {
      if (!isRicettaValida(r.nome)) continue
      const tipo = getR(r.nome, r).tipo
      if (tipo === 'semilavorato' || tipo === 'interno') continue
      out.add(r.nome)
      const cat = String(r.categoria || '').trim()
      if (cat) out.add(cat)
    }
    return [...out].sort()
  }, [ricettario])

  useEffect(() => {
    let alive = true
    if (!orgId || !sedeId) { setLoading(false); return }
    // SK_MOV sempre. SK_DISC solo per il titolare (read-only, fold storico).
    const pMov = caricaMovimenti(orgId, sedeId)
    const pDisc = isDip ? Promise.resolve([]) : sload(SK_DISCREPANZE, orgId, sedeId || null)
    // Carica chiusure (titolare only — il dipendente ha view sanitizzata).
    const pChius = isDip ? Promise.resolve([]) : sload('pasticceria-chiusure-v1', orgId, sedeId)
    Promise.all([pMov, pDisc, pChius]).then(([arr, disc, chius]) => {
      if (!alive) return
      setMovs(Array.isArray(arr) ? arr : [])
      setChiusureMese(Array.isArray(chius) ? chius : [])
      const discArr = Array.isArray(disc) ? disc : []
      const norm = []
      const drift = []
      for (const it of discArr) {
        if (it.tipo === 'porzione_grande' || it.tipo === 'porzione_piccola') { drift.push(it); continue }
        const n = normalizzaLegacy(it)
        if (n) norm.push(n)
      }
      setLegacy(norm)
      setLegacyDrift(drift)
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [orgId, sedeId, isDip])

  // Lista unificata: SK_MOV + legacy SK_DISC, de-dup per id (SK_MOV vince).
  const tutti = useMemo(() => {
    const seen = new Set(movs.map(m => m.id))
    const merged = [...movs]
    for (const l of legacy) if (!seen.has(l.id)) merged.push(l)
    return merged.sort((a, b) => new Date(b.ts) - new Date(a.ts))
  }, [movs, legacy])

  const { da, a } = useMemo(() => estremiMese(mese), [mese])

  // Periodo selezionato (mese) — pilota diagnosi e lista.
  const periodo = useMemo(() => filtraPerIntervallo(tutti, da, a), [tutti, da, a])

  const lista = useMemo(() => {
    let arr = periodo
    if (filtroTipo !== 'tutti') arr = arr.filter(m => m.tipo === filtroTipo)
    if (filtroCausale !== 'tutte') arr = arr.filter(m => (m.causale || '') === filtroCausale)
    return arr
  }, [periodo, filtroTipo, filtroCausale])

  // ── DIAGNOSI: aggregati sul mese selezionato ──────────────────────────────
  const diag = useMemo(() => {
    let valSpreco = 0, valOmaggio = 0, ricavoMancato = 0, nSpreco = 0, nOmaggio = 0
    const perCausale = {}    // causaleId → { eur, n }
    const perProdotto = {}   // nome → { nome, eur, qtaG, qtaPz, n }
    for (const m of periodo) {
      const nome = m.prodotto || m.categoria || '(senza nome)'
      const fc = Number(m.fcTot) || (Number(m.fcUnit) || 0) * (Number(m.qta) || 0)
      const qta = Number(m.qta) || 0
      const caus = m.causale || (m.tipo === 'spreco' ? 'scarto' : 'regalo')
      if (!perCausale[caus]) perCausale[caus] = { id: caus, eur: 0, n: 0, tipo: m.tipo }
      perCausale[caus].eur += fc
      perCausale[caus].n++
      if (!perProdotto[nome]) perProdotto[nome] = { nome, eur: 0, qtaG: 0, qtaPz: 0, n: 0 }
      perProdotto[nome].eur += fc
      if (m.unita === 'g') perProdotto[nome].qtaG += qta; else perProdotto[nome].qtaPz += qta
      perProdotto[nome].n++
      if (m.tipo === 'spreco') { valSpreco += fc; nSpreco++ }
      else if (m.tipo === 'omaggio') { valOmaggio += fc; nOmaggio++; ricavoMancato += (Number(m.valoreOmaggio) || 0) }
    }
    const totPerso = valSpreco + valOmaggio
    const classifica = Object.values(perProdotto).filter(p => p.eur > 0).sort((x, y) => y.eur - x.eur).slice(0, 8)
    const causaliOrd = Object.values(perCausale).filter(c => c.eur > 0).sort((x, y) => y.eur - x.eur)
    const maxEur = classifica.length ? classifica[0].eur : 0
    const causaPrinc = causaliOrd[0] || null
    const causaPct = causaPrinc && totPerso > 0 ? (causaPrinc.eur / totPerso * 100) : 0
    return {
      valSpreco, valOmaggio, totPerso, ricavoMancato, nSpreco, nOmaggio,
      nTot: periodo.length, classifica, causaliOrd, maxEur, causaPrinc, causaPct,
    }
  }, [periodo])

  // Audit 2026-07-01 batch 11: soglia % sprechi vs ricavi del mese filtrato.
  // Best-practice food: sotto 2% ottimo, 2-5% normale, sopra 5% allerta.
  // Calcolo solo per titolare (dipendente ha valori sanitizzati).
  const sogliaInfo = useMemo(() => {
    if (isDip) return null
    const ricavi = chiusureMese
      .filter(c => (c?.data || '').startsWith(mese))
      .reduce((s, c) => s + Number(c?.kpi?.totV || c?.totale || 0), 0)
    if (ricavi <= 0) return null
    // Audit 2026-06-22: typo `aggregat` → `diag` (la variabile useMemo sopra).
    // Causava ReferenceError silente che faceva fallire useMemo e nascondeva
    // il badge soglia sprechi.
    const pct = (diag.totPerso / ricavi) * 100
    let livello = 'ok'
    if (pct >= 5) livello = 'alto'
    else if (pct >= 2) livello = 'medio'
    return { ricavi, pct, livello }
  }, [chiusureMese, mese, diag.totPerso, isDip])

  // Food cost del mese (dal ricettario reale) — per l'incidenza % della perdita.
  // Solo titolare: il dipendente ha ricettario sanitizzato (FC=0) → niente diagnosi.
  const fcMeseStimato = useMemo(() => {
    if (isDip) return 0
    let tot = 0
    for (const r of Object.values(ricettario?.ricette || {})) {
      if (!isRicettaValida(r.nome)) continue
      const { tot: t } = calcolaFC(r, ingCosti, ricettario)
      if (Number.isFinite(t)) tot += t
    }
    return tot
  }, [ricettario, ingCosti, isDip])

  // Lista del giorno del dipendente (calcolata sempre, usata solo nel ramo isDip
  // — gli hook restano incondizionati per non violare le rules of hooks).
  const oggi = todayLocal()
  const mieDelGiorno = useMemo(() => movs
    .filter(m => (m.ts || '').slice(0, 10) === oggi && m.autore_uid === auth?.user?.id)
    .sort((x, y) => new Date(y.ts) - new Date(x.ts)),
    [movs, oggi, auth])

  // Incidenza % della perdita sul food cost: heuristica grezza ma utile come ordine
  // di grandezza. Manteniamo soglie semaforo prudenti.
  const incidenza = fcMeseStimato > 0 ? (diag.totPerso / fcMeseStimato * 100) : 0
  const incColor = incidenza <= 3 ? C.green : incidenza <= 8 ? C.amber : C.red
  const incLabel = incidenza <= 3 ? 'Sotto controllo' : incidenza <= 8 ? 'Da tenere d’occhio' : 'Alto — indagare'

  // Suggerimento fc unitario dalla ricetta quando il "Cosa" combacia.
  const autoFcDaRicetta = (nome) => {
    const ric = ricettario?.ricette?.[(nome || '').toUpperCase().trim()] || ricettario?.ricette?.[nome]
    if (!ric) return null
    const reg = getR(ric.nome, ric)
    const { tot } = calcolaFC(ric, ingCosti, ricettario)
    if (!Number.isFinite(tot) || !reg?.unita) return null
    return { fcUnit: tot / reg.unita, unita: 'pz', categoria: ric.categoria || '', prezzo: reg.prezzo || 0 }
  }

  const apri = (tipo) => setForm({ ...nuovoMovimento(tipo), causale: CAUSALI[tipo][0].id })

  const onProdottoChange = (nome) => {
    const auto = autoFcDaRicetta(nome)
    setForm(f => ({
      ...f,
      prodotto: nome,
      ...(auto ? {
        fcUnit: auto.fcUnit.toFixed(3),
        unita: auto.unita,
        categoria: auto.categoria,
        ...(f.tipo === 'omaggio' && !f.valoreOmaggio && auto.prezzo ? { valoreOmaggio: String(auto.prezzo) } : {}),
      } : {}),
    }))
  }

  const setTipo = (k) => setForm(f => ({ ...f, tipo: k, causale: CAUSALI[k][0].id }))

  // ── SALVATAGGIO — SAVE-FIRST. Handler dipendente e shape movimento INVARIATI. ──
  const salva = async () => {
    if (!form) return
    if (!form.prodotto.trim() && !form.categoria.trim()) { notify?.('Specifica almeno il prodotto o la categoria', false); return }
    if (!(Number(form.qta) > 0)) { notify?.('Quantita non valida', false); return }
    if (!sedeId) { notify?.('Seleziona una sede prima', false); return }
    const fcUnit = Number(form.fcUnit) || 0
    const qta = Number(form.qta) || 0
    const fcTot = fcUnit * qta
    const valoreOmaggio = form.tipo === 'omaggio' ? (Number(form.valoreOmaggio) || 0) * qta : 0
    try {
      if (isDip) {
        // DIPENDENTE: ricettario SANITIZZATO (calcolaFC=0) → fc ricalcolato server-side
        // col ricettario reale. Il server fa SAVE-FIRST e restituisce l'array aggiornato.
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/spreco-registra', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({
            sedeId,
            movimento: {
              ...form,
              prodotto: form.prodotto.trim(),
              categoria: (form.categoria || '').trim(),
              qta, fcUnit, valoreOmaggio: Number(form.valoreOmaggio) || 0,
            },
          }),
        })
        const resp = await res.json().catch(() => null)
        if (!res.ok || !resp?.ok) throw new Error(resp?.error || `errore server (${res.status})`)
        setMovs(Array.isArray(resp.movimenti) ? resp.movimenti : [])
        setForm(null)
        notify?.(`${form.tipo === 'spreco' ? 'Perdita' : 'Omaggio'} registrato`)
        return
      }
      const saved = await aggiungiMovimento(orgId, sedeId, {
        ...form,
        prodotto: form.prodotto.trim(),
        categoria: (form.categoria || '').trim(),
        qta, fcUnit, fcTot, valoreOmaggio,
      })
      setMovs(prev => [saved, ...prev])
      // Scarico stock_prodotti_finiti se l'unita' e' pz e il prodotto matcha
      // una ricetta dell'azienda. Best-effort: in caso di errore il movimento
      // resta comunque salvato (il modello SK_MOV e' la verita' contabile) ma
      // l'utente vede un avviso — meglio di un drift silenzioso dello stock
      // vetrina che generava "ghost stock" sulle vendite successive.
      if ((form.unita || 'pz') === 'pz' && form.prodotto.trim()) {
        try {
          const prodottoKey = form.prodotto.trim().toUpperCase()
          const causale = `${form.tipo}:${form.causale || ''}`
          await scartoPF({ sedeId, prodotto: prodottoKey, quantita: qta, note: causale })
        } catch (e) {
          console.warn('[SpreciOmaggi] scartoPF fallito (movimento salvato):', e.message)
          notify?.('Movimento salvato ma scarico vetrina non riuscito: verifica lo stock', false)
        }
      }
      setForm(null)
      notify?.(`${form.tipo === 'spreco' ? 'Perdita' : 'Omaggio'} registrato`)
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    }
  }

  const elimina = async (mov) => {
    if (mov._legacy) { notify?.('Record storico (Discrepanze): non eliminabile da qui', false); return }
    const ok = await confirmDialog({
      title: `Eliminare ${mov.tipo === 'spreco' ? 'la perdita' : "l'omaggio"}?`,
      message: `Registrato il ${fmtTs(mov.ts)}.`,
      confirmLabel: 'Elimina', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    try {
      const arr = await eliminaMovimento(orgId, sedeId, mov.id)
      setMovs(arr)
      notify?.('Eliminato')
    } catch (e) { notify?.(e.message, false) }
  }

  const tipoBadge = (t) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 11,
      background: t === 'spreco' ? C.amberLight : BLU_LIGHT,
      color: t === 'spreco' ? C.amber : BLU,
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      <Icon name={t === 'spreco' ? 'trash' : 'gift'} size={11} /> {t === 'spreco' ? 'perdita' : 'omaggio'}
    </span>
  )

  // Causali selezionabili nel filtro (in base al tipo scelto).
  const causaliFiltro = filtroTipo === 'spreco' ? CAUSALI.spreco
    : filtroTipo === 'omaggio' ? CAUSALI.omaggio
    : [...CAUSALI.spreco, ...CAUSALI.omaggio]

  // ── FORM (registrazione rapida) — condiviso titolare/dipendente ──────────────
  const formCard = form && (
    <div style={{ ...cardStyle(), padding: isMobile ? 16 : 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: form.tipo === 'spreco' ? C.amberLight : BLU_LIGHT, color: form.tipo === 'spreco' ? C.amber : BLU, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={form.tipo === 'spreco' ? 'trash' : 'gift'} size={16} />
        </span>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Nuova registrazione</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[['spreco', 'trash', 'Perdita'], ['omaggio', 'gift', 'Omaggio']].map(([k, ico, lbl]) => (
          <button key={k} onClick={() => setTipo(k)}
            style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none',
              background: form.tipo === k ? (k === 'spreco' ? C.amber : BLU) : C.bgSubtle,
              color: form.tipo === k ? '#fff' : C.textMid,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name={ico} size={15} /> {lbl}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
          <label style={labelS}>Causale</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CAUSALI[form.tipo].map(c => (
              <button key={c.id} onClick={() => setForm(f => ({ ...f, causale: c.id }))} title={c.desc}
                style={{ padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${form.causale === c.id ? (form.tipo === 'spreco' ? C.amber : BLU) : C.border}`,
                  background: form.causale === c.id ? (form.tipo === 'spreco' ? C.amberLight : BLU_LIGHT) : C.bgCard,
                  color: form.causale === c.id ? (form.tipo === 'spreco' ? C.amber : BLU) : C.textMid,
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
          <label style={labelS}>Cosa (prodotto o categoria)</label>
          <input style={inputS} list="prod-sugg-list" value={form.prodotto || ''}
            onChange={e => onProdottoChange(e.target.value)}
            placeholder="Es. Torta di carote, Gelato, Pistacchio…" />
          <datalist id="prod-sugg-list">
            {suggerimenti.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label style={labelS}>Quantità</label>
          <input style={inputS} type="number" min="0" step="0.01" value={form.qta || ''}
            onChange={e => setForm(f => ({ ...f, qta: e.target.value }))} placeholder="80" />
        </div>
        <div>
          <label style={labelS}>Unità</label>
          <select style={inputS} value={form.unita || 'g'} onChange={e => setForm(f => ({ ...f, unita: e.target.value }))}>
            <option value="g">grammi</option>
            <option value="pz">pezzi</option>
          </select>
        </div>
        <div>
          <label style={labelS}>Costo unitario (€/{form.unita || 'unità'})</label>
          <input style={inputS} type="number" min="0" step="0.001" value={form.fcUnit || ''}
            onChange={e => setForm(f => ({ ...f, fcUnit: e.target.value }))} placeholder="0.012" />
        </div>
        {form.tipo === 'omaggio' && (
          <div>
            <label style={labelS}>Prezzo unitario di vendita (€)</label>
            <input style={inputS} type="number" min="0" step="0.01" value={form.valoreOmaggio || ''}
              onChange={e => setForm(f => ({ ...f, valoreOmaggio: e.target.value }))} placeholder="2.60" />
          </div>
        )}
        <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
          <label style={labelS}>Note (opzionale)</label>
          <input style={inputS} value={form.note || ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="dettagli aggiuntivi…" />
        </div>
      </div>

      <div style={{ marginTop: 14, padding: '11px 14px', background: C.bgSubtle, border: `1px dashed ${C.border}`, borderRadius: 10, fontSize: 12.5, color: C.textMid }}>
        Costo totale: <b style={{ color: C.text, ...TNUM }}>{fmt((Number(form.fcUnit) || 0) * (Number(form.qta) || 0))}</b>
        {form.tipo === 'omaggio' && Number(form.valoreOmaggio) > 0 && (
          <> · ricavo mancato: <b style={{ color: BLU, ...TNUM }}>{fmt((Number(form.valoreOmaggio) || 0) * (Number(form.qta) || 0))}</b></>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={salva}
          style={{ padding: '11px 22px', background: C.green, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Icon name="plus" size={15} /> Registra
        </button>
        <button onClick={() => setForm(null)}
          style={{ padding: '11px 22px', background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13.5, cursor: 'pointer' }}>
          Annulla
        </button>
      </div>
    </div>
  )

  const azioniRapide = !form && (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
      <button onClick={() => apri('spreco')}
        style={{ flex: 1, minWidth: 160, padding: '14px', background: C.amberLight, color: C.amber, border: `1px solid ${C.amber}40`, borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <Icon name="trash" size={16} /> Registra perdita
      </button>
      <button onClick={() => apri('omaggio')}
        style={{ flex: 1, minWidth: 160, padding: '14px', background: BLU_LIGHT, color: BLU, border: `1px solid ${BLU}40`, borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <Icon name="gift" size={16} /> Registra omaggio
      </button>
    </div>
  )

  // ── VISTA DIPENDENTE: solo registrazione rapida + propria lista del giorno ────
  if (isDip) {
    return (
      <div style={{ maxWidth: 760 }}>
        <PageHeader subtitle={`Registra cio' che va perso (caduto, scaduto, errori) o che regali, cosi' resta tracciato e non sembra un ammanco di cassa${sedeAttiva ? ` · sede ${sedeAttiva.nome}` : ''}.`} />
        {azioniRapide}
        {formCard}
        <SH sub="Le tue registrazioni di oggi.">Registrate oggi</SH>
        <div style={{ ...cardStyle(), padding: isMobile ? 14 : 18 }}>
          {loading ? (
            <div style={{ fontSize: 13, color: C.textSoft }}>Caricamento…</div>
          ) : mieDelGiorno.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.textSoft }}>
              <Icon name="checkCircle" size={16} color={C.green} /> Nessuna registrazione oggi.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mieDelGiorno.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: `1px solid ${C.borderSoft}`, paddingBottom: 8 }}>
                  {tipoBadge(m.tipo)}
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.prodotto || m.categoria || '—'}</span>
                  <span style={{ fontSize: 12, color: C.textSoft }}>{CAUSALE_LABEL[m.causale] || m.causale}</span>
                  <span style={{ fontSize: 12, color: C.textMid, ...TNUM }}>{fmtQta(m.qta, m.unita)}</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => elimina(m)} title="Elimina"
                    style={{ padding: '5px 8px', background: 'transparent', color: C.red, border: `1px solid ${C.redLight}`, borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="trash" size={12} /> Elimina
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── VISTA TITOLARE: diagnosi → registrazione → breakdown ─────────────────────
  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader
        subtitle={`Quanto prodotto se n'e' andato senza incasso, perche', e quanto ti e' costato. Perdite (scarti, avanzi, errori, ammanchi) e omaggi (regali, assaggi)${sedeAttiva ? ` · sede ${sedeAttiva.nome}` : ''}.`}
      />

      {/* Selettore mese */}
      <div style={{ ...cardStyle(), padding: isMobile ? '12px 14px' : '12px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={labelS}>Mese</label>
          <input style={{ ...inputS, width: 'auto' }} type="month" value={mese} onChange={e => setMese(e.target.value)} />
        </div>
        {legacy.length > 0 && (
          <div style={{ fontSize: 11.5, color: C.textSoft, paddingBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="clipboard" size={13} /> Include {fmtN(legacy.length)} record storici da “Discrepanze”.
          </div>
        )}
      </div>

      {/* Audit 2026-07-01 batch 11: banner soglia % sprechi vs ricavi mese.
          Visibile solo se ricavi noti e %>2 (livello medio o alto). */}
      {sogliaInfo && sogliaInfo.livello !== 'ok' && (
        <div role="alert" style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: sogliaInfo.livello === 'alto' ? '#FEF2F2' : '#FEF9C3',
          border: `1.5px solid ${sogliaInfo.livello === 'alto' ? '#FCA5A5' : '#FDE68A'}`,
          color: sogliaInfo.livello === 'alto' ? '#991B1B' : '#854D0E',
        }}>
          <Icon name="warning" size={18} color={sogliaInfo.livello === 'alto' ? '#DC2626' : '#CA8A04'} />
          <div style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.5 }}>
            <strong>{sogliaInfo.livello === 'alto' ? 'Sprechi elevati' : 'Attenzione sprechi'}</strong>:
            stai perdendo <strong>{fmtp(sogliaInfo.pct)}</strong> dei ricavi del mese
            ({fmt0(diag.totPerso)} su {fmt0(sogliaInfo.ricavi)}).
            {sogliaInfo.livello === 'alto'
              ? ' Sopra 5% indica un problema strutturale: rivedi porzioni, scorte, scarti produzione.'
              : ' Tra 2% e 5% e\' fisiologico ma migliorabile.'}
          </div>
        </div>
      )}

      {/* (1) DIAGNOSI — banda KPI del mese */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 10 : 16, marginBottom: 14 }}>
        <KPI icon={<Icon name="trendDown" size={18} />} label="Perdita totale del mese" value={fmt0(diag.totPerso)} highlight
          sub={`${fmt0(diag.valSpreco)} perdite · ${fmt0(diag.valOmaggio)} omaggi`} />
        <KPI icon={<Icon name="receipt" size={18} />} label="Incidenza sul food cost" value={fcMeseStimato > 0 ? fmtp(incidenza) : '—'} color={incColor}
          sub={fcMeseStimato > 0 ? incLabel : 'food cost non disponibile'} />
        <KPI icon={<Icon name="warning" size={18} />} label="Causa principale" value={diag.causaPrinc ? (CAUSALE_LABEL[diag.causaPrinc.id] || diag.causaPrinc.id) : '—'} color={T.text}
          sub={diag.causaPrinc ? `${fmtp(diag.causaPct)} · ${fmt0(diag.causaPrinc.eur)}` : 'nessun evento'} />
        <KPI icon={<Icon name="clipboard" size={18} />} label="Eventi nel mese" value={fmtN(diag.nTot)} color={T.brand}
          sub={`${fmtN(diag.nSpreco)} perdite · ${fmtN(diag.nOmaggio)} omaggi`} />
      </div>

      {/* Drift porzionatura (insight informativo dai dati storici Discrepanze) */}
      {legacyDrift.length > 0 && (
        <div style={{ ...cardStyle(), padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, background: C.bgSubtle }}>
          <Icon name="alert" size={15} color={C.amber} />
          <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>
            <b style={{ color: C.text }}>Drift di porzionatura</b> — {fmtN(legacyDrift.length)} segnalazioni storiche di porzioni fuori standard
            (abbondanti/ridotte) erodono margine ma non sono perdite discrete. Tienile a mente quando rivedi le rese delle ricette.
          </div>
        </div>
      )}

      {/* Azioni rapide / form */}
      {azioniRapide}
      {formCard}

      {/* (2) PER CAUSALE — dove va il valore perso */}
      <SH sub="Quanto pesa ogni causa di perdita nel mese. Il primo e' quello su cui agire per primo.">Per causale</SH>
      <div style={{ ...cardStyle(), padding: isMobile ? 14 : 18, marginBottom: 24 }}>
        {diag.causaliOrd.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.textSoft, padding: '8px 0' }}>
            <Icon name="checkCircle" size={16} color={C.green} /> Nessuna perdita registrata nel mese. Ottimo controllo.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {diag.causaliOrd.map((c, i) => {
              const pct = diag.totPerso > 0 ? (c.eur / diag.totPerso * 100) : 0
              const col = c.tipo === 'omaggio' ? BLU : C.amber
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
                  <span style={{ flex: isMobile ? '0 0 40%' : '0 0 32%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: i === 0 ? 700 : 500, color: C.text }} title={CAUSALE_LABEL[c.id] || c.id}>
                    {CAUSALE_LABEL[c.id] || c.id}
                  </span>
                  <span style={{ flex: 1, height: 18, background: C.bgSubtle, borderRadius: 6, overflow: 'hidden', minWidth: 40 }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.max(4, pct)}%`, background: i === 0 ? col : `${col}73`, transition: 'width 0.3s' }} />
                  </span>
                  <span style={{ flex: '0 0 70px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: C.text, ...TNUM }}>{fmt(c.eur)}</span>
                  <span style={{ flex: '0 0 44px', textAlign: 'right', fontSize: 11.5, color: C.textSoft, ...TNUM }}>{fmtp(pct)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* (3) PER PRODOTTO — dove perdi piu' valore */}
      <SH sub="I prodotti che ti costano di piu' in perdite e omaggi nel mese.">Prodotti con piu' perdite</SH>
      <div style={{ ...cardStyle(), padding: isMobile ? 14 : 18, marginBottom: 24 }}>
        {diag.classifica.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.textSoft, padding: '8px 0' }}>
            <Icon name="checkCircle" size={16} color={C.green} /> Nessun prodotto con perdite nel mese.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {diag.classifica.map((p, i) => {
              const pct = diag.maxEur > 0 ? (p.eur / diag.maxEur * 100) : 0
              const qtaStr = [p.qtaG ? `${fmtN(p.qtaG)} g` : null, p.qtaPz ? `${fmtN(p.qtaPz)} pz` : null].filter(Boolean).join(' · ')
              return (
                <div key={p.nome} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
                  <span style={{ flex: isMobile ? '0 0 38%' : '0 0 30%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: i === 0 ? 700 : 500, color: C.text }} title={p.nome}>{p.nome}</span>
                  <span style={{ flex: 1, height: 18, background: C.bgSubtle, borderRadius: 6, overflow: 'hidden', minWidth: 40 }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.max(4, pct)}%`, background: i === 0 ? C.red : 'rgba(110,14,26,0.45)', transition: 'width 0.3s' }} />
                  </span>
                  <span style={{ flex: '0 0 70px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: C.text, ...TNUM }}>{fmt(p.eur)}</span>
                  {!isMobile && <span style={{ flex: '0 0 96px', textAlign: 'right', fontSize: 11.5, color: C.textSoft, ...TNUM }}>{qtaStr || `${fmtN(p.n)} reg.`}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* (4) ELENCO MOVIMENTI DEL MESE */}
      <SH sub="Tutti gli eventi del mese, dal piu' recente. Filtra per tipo o causale.">Movimenti del mese</SH>
      <div style={{ ...cardStyle(), padding: isMobile ? '12px 14px' : '12px 18px', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelS}>Tipo</label>
          <select style={{ ...inputS, width: 'auto' }} value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setFiltroCausale('tutte') }}>
            <option value="tutti">Tutti</option>
            <option value="spreco">Solo perdite</option>
            <option value="omaggio">Solo omaggi</option>
          </select>
        </div>
        <div>
          <label style={labelS}>Causale</label>
          <select style={{ ...inputS, width: 'auto' }} value={filtroCausale} onChange={e => setFiltroCausale(e.target.value)}>
            <option value="tutte">Tutte</option>
            {causaliFiltro.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ ...cardStyle(), overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {['Quando', 'Tipo', 'Cosa', 'Qta', 'Causale', 'Costo', 'Autore', ''].map((h, i) => (
                  <th key={i} title={h === 'Qta' ? 'Quantità (grammi o pezzi)' : h === 'Costo' ? 'Food cost del prodotto perso/omaggiato' : undefined}
                    style={{ padding: '11px 14px', textAlign: (i === 3 || i === 5) ? 'right' : 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', ...((h === 'Qta' || h === 'Costo') ? { cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3 } : null) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: C.textSoft }}>Caricamento…</td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: C.textSoft }}>Nessun movimento nel mese selezionato.</td></tr>
              ) : lista.map((m, i) => (
                <tr key={m.id} style={{ borderTop: i ? `1px solid ${C.borderSoft}` : 'none' }}>
                  <td style={{ padding: '11px 14px', color: C.textMid, whiteSpace: 'nowrap', ...TNUM }}>{fmtTs(m.ts)}</td>
                  <td style={{ padding: '11px 14px' }}>{tipoBadge(m.tipo)}</td>
                  <td style={{ padding: '11px 14px', color: C.text, fontWeight: 600 }}>
                    {m.prodotto || m.categoria || '—'}
                    {m.note && <span style={{ color: C.textSoft, fontWeight: 400 }}> — {m.note}</span>}
                  </td>
                  <td style={{ padding: '11px 14px', color: C.text, whiteSpace: 'nowrap', textAlign: 'right', ...TNUM }}>{fmtQta(m.qta, m.unita)}</td>
                  <td style={{ padding: '11px 14px', color: C.textMid }}>{CAUSALE_LABEL[m.causale] || m.causale || '—'}</td>
                  <td style={{ padding: '11px 14px', color: m.tipo === 'spreco' ? C.amber : BLU, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right', ...TNUM }}>
                    {fmt(m.fcTot)}
                    {m.tipo === 'omaggio' && Number(m.valoreOmaggio) > 0 && (
                      <span style={{ color: C.textSoft, fontWeight: 400, marginLeft: 6 }}>(− {fmt(m.valoreOmaggio)} ricavo)</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px', color: C.textSoft, fontSize: 11 }}>
                    {m._legacy ? <span style={{ padding: '1px 5px', borderRadius: 4, background: C.bgSubtle, color: C.textSoft, fontSize: 8, fontWeight: 700 }}>STORICO</span> : (m.autore_email || '—')}
                    {m.autore_ruolo === 'dipendente' && <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: C.amberLight, color: C.amber, fontSize: 8, fontWeight: 700 }}>DIP</span>}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {!m._legacy && (
                      <button onClick={() => elimina(m)} title="Elimina"
                        style={{ padding: '5px 8px', background: 'transparent', color: C.red, border: `1px solid ${C.redLight}`, borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="trash" size={12} /> Elimina
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
