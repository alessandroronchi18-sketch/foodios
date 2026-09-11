// RicettarioView + TortaCard - estratti da Dashboard.jsx.
// TortaCard è il card espandibile usato sia dal Ricettario che dai Semilavorati.

import React, { useEffect, useMemo, useState } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import {
  buildIngCosti, calcolaFC, getR, isRicettaValida, normIng, REGOLE, resaGrammi, costoRigaIngrediente } from '../lib/foodcost'
import { ALLERGENI, ALLERGENE_COLORS } from '../lib/allergeni'
import { lessico } from '../lib/lessico'
import { labelPlurale, labelSingolare, tipoEffettivo } from '../lib/tipoRicetta'
import { useListinoSede, getRegSede } from '../lib/listinoSede'
import { useRicavoFlat } from '../lib/useRicavoFlat'
import PrezziPerSedeModal from '../components/PrezziPerSedeModal'
import { exportRicettaPDF } from '../lib/exportPDF'
import { gateExport, getExportCtx } from '../lib/exportGuard'
import Icon from '../components/Icon'
import {
  C, TNUM, margColor, margBadge, Badge, Tip, KPI,
} from './_shared'

const fmt  = v => `${Number(v).toLocaleString('it-IT', { useGrouping: 'always',minimumFractionDigits:2,maximumFractionDigits:2})} €`
const fmtp = v => `${Number(v).toFixed(1)}%`
const PIE_COLORS = [C.red, '#E07040', '#D4A030', '#5B8FCE', '#7B7B7B', '#A0522D']

// ─── TortaCard ───────────────────────────────────────────────────────────────
// `ricavoFlatKg` (opzionale, solo per tipo='gusto'): prezzo medio €/kg di vendita
// stimato dai Formati vendita della categoria del gusto. Serve perché i gusti
// (gelateria/yogurt) hanno prezzo=0 sulla ricetta — il prezzo di vendita vive
// sui formati (cono/coppetta/vaschetta), non sulla singola ricetta. Senza
// questo valore il margine risulterebbe 0% (audit 2026-07-28).
function TortaCard({ ric, ingCosti, ricettario, onUpdateRegola, onEdit, variant = 'ricetta', ricavoFlatKg = null, sedi = [], orgId = null, notify = null, listinoSede = null, sedeAttivaNome = null, metodoProduzione = 'stampi' }) {
  // Audit 2026-06-22 CRITICAL: TUTTI gli hook DEVONO essere chiamati prima
  // dell'early return (regole React). Il vecchio codice metteva 3 useState +
  // 1 useEffect DOPO `if (reg.tipo === 'interno') return null` → hook order
  // diverso tra render → silent state corruption.
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  // Audit 2026-06-24: card collapsed di default - su mobile e desktop.
  // L'utente vede solo nome + 1 KPI essenziale; al tap si espande l'header
  // pieno con KPI inline + bottoni. Riduce "minestrone" visivo richiesto
  // dal design partner.
  const [expanded, setExpanded] = useState(false)
  // reg effettivo: se sedeAttiva ha override sul prezzo/unita di questa
  // ricetta, li applica sopra il base. Se listinoSede e' null (vista "tutte
  // le sedi") il reg e' il base org.
  const reg = getRegSede(ric.nome, ric, listinoSede)
  // Tipo EFFETTIVO. Le ricette importate da Excel non hanno il campo `tipo`
  // (il foglio del cliente non ce l'ha): 24 delle 27 di Mara. Senza tipo
  // cadevano su "fetta", quindi per una GELATERIA il food cost al kg non
  // veniva calcolato e il ricavo usciva "8 fette x 0 EUR" = 0, anche con i
  // formati di vendita configurati a circa 35 EUR/kg. Un tipo scelto a mano
  // vince sempre: qui si copre solo il caso del tipo assente.
  const tipoEff = ric?.tipo ? reg.tipo : tipoEffettivo(ric, metodoProduzione)
  const isSemi = variant === 'semilavorato' || tipoEff === 'semilavorato'
  // Segnale visivo: c'e' override attivo su questa sede? (usato per un
  // piccolo badge accanto al bottone "Prezzi / sede")
  const hasOverride = !!listinoSede?.ricette?.[ric.nome]

  const [editPrezzo, setEditPrezzo] = useState(reg.prezzo)
  const [editUnita, setEditUnita] = useState(reg.unita)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [savingRegola, setSavingRegola] = useState(false)
  const [prezziSedeOpen, setPrezziSedeOpen] = useState(false)
  const hasMultiSede = Array.isArray(sedi) && sedi.filter(s => s?.attiva !== false).length > 1
  // Sort della Distinta costi - click sulle etichette dell'header riordina.
  // Default: alfabetico ascendente (richiesta utente 13/07/2026: più facile
  // trovare un ingrediente noto per nome che per costo).
  const [sortKey, setSortKey] = useState('nome')
  const [sortDir, setSortDir] = useState('asc')
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir(key === 'nome' ? 'asc' : 'desc') }
  }

  // Reset state quando cambia ricetta (impersonation admin / cambio org).
  useEffect(() => {
    setEditPrezzo(reg.prezzo)
    setEditUnita(reg.unita)
  }, [ric.nome, reg.prezzo, reg.unita])

  // Early return DOPO tutti gli hook.
  if (tipoEff === 'interno') return null

  // Audit 2026-09-09: tre difetti in questa funzione.
  //  1. `onUpdateRegola(...)` senza await, seguito da `setEditMode(false)`:
  //     l'editor si chiudeva prima di sapere l'esito. Se il salvataggio
  //     falliva, il valore digitato era perso (riaprendo si ricarica
  //     reg.prezzo) e restava solo un toast rosso.
  //  2. Nessun `disabled` durante l'attesa (CLAUDE.md, "Bottoni async"):
  //     doppio click = due salvataggi.
  //  3. `parseFloat(editPrezzo) || reg.prezzo`: 0 e' falsy, quindi mettere
  //     prezzo 0 era IMPOSSIBILE (tornava al vecchio valore) mentre un
  //     prezzo negativo passava senza controlli, malgrado il min="0".
  const handleSaveRegola = async () => {
    if (savingRegola) return
    const pRaw = String(editPrezzo ?? '').replace(',', '.').trim()
    const uRaw = String(editUnita ?? '').trim()
    const p = pRaw === '' ? reg.prezzo : parseFloat(pRaw)
    const u = uRaw === '' ? reg.unita : parseInt(uRaw, 10)
    if (!Number.isFinite(p) || p < 0) {
      notify && notify('Il prezzo non è valido: scrivi un numero, per esempio 4,50', false)
      return
    }
    if (!Number.isFinite(u) || u <= 0) {
      notify && notify('Le unità per stampo devono essere almeno 1', false)
      return
    }
    setSavingRegola(true)
    try {
      // Audit 2026-07-01 HIGH: non mutare il singleton REGOLE - onUpdateRegola
      // persiste il dato nella ricetta, getR lo legge da li. Mutare REGOLE
      // significa inquinare org B dopo impersonation di org A.
      await onUpdateRegola(ric.nome, { prezzo: p, unita: u })
      setEditMode(false)
    } catch {
      // Il messaggio l'ha già mostrato il Dashboard. Qui teniamo aperto
      // l'editor col valore digitato, così si può riprovare senza riscriverlo.
    } finally {
      setSavingRegola(false)
    }
  }

  const { tot: fc, mancanti } = calcolaFC(ric, ingCosti, ricettario)
  const pesoTotSemi = (ric.ingredienti || []).reduce((s, i) => s + (i.qty1stampo || 0), 0)
  const costoGSemi = pesoTotSemi > 0 ? fc / pesoTotSemi : 0

  // Per i GUSTI (gelateria): ricavo e margine si calcolano al KG finito
  // usando (a) il prezzo medio dei Formati vendita della categoria (ricavo
  // flat uguale per tutti i gusti di quella categoria) e (b) il food cost
  // specifico del gusto per kg finito (fc totale ingredienti / resa in kg).
  // La resa è quella DICHIARATA dall'utente (ric.resa_g) — copre il caso
  // reale in cui gli ingredienti pesano 1010g per 1 kg finito (evaporazione)
  // o 950g (overrun d'aria montata). Fallback su somma ingredienti se resa
  // non specificata (ricette pregresse).
  const isGusto = tipoEff === 'gusto'
  const resaG = resaGrammi(ric)
  const fcPerKg = isGusto && resaG > 0 ? (fc / resaG) * 1000 : 0
  const ricavoFlatOk = isGusto && Number(ricavoFlatKg) > 0
  const ricavo = isGusto
    ? (ricavoFlatOk ? Number(ricavoFlatKg) : 0)
    : parseFloat((reg.unita * reg.prezzo).toFixed(2))
  const foodCostForMarg = isGusto ? fcPerKg : fc
  const margine = parseFloat((ricavo - foodCostForMarg).toFixed(2))
  const margPct = ricavo > 0 ? (margine / ricavo * 100) : 0
  const fcUnita = reg.unita > 0 ? fc / reg.unita : 0
  const mrgUnita = reg.prezzo - fcUnita
  // Audit 2026-09-09 ALTA: 24 delle 27 ricette del design partner non hanno un
  // prezzo di vendita salvato (importate da Excel). Il vecchio getR ci metteva
  // "8 fette x 4,00 EUR" di suo, e da li' uscivano Ricavo 32,00 EUR, margine
  // 92-99% e badge verde "Eccellente" su una GELATERIA. Ora getR marca il caso
  // e la card lo dichiara invece di riempirlo con numeri inventati.
  const senzaPrezzo = !!reg.senzaRegola && !isGusto
  const mc = margColor(margPct)
  const mbg = margPct >= 60 ? C.greenLight : margPct >= 40 ? C.amberLight : C.redLight

  const SEMI = { bg: '#FAF6FF', border: '#C9A4DC', accent: '#8E44AD', accentLight: '#F0E4FA', panel: '#F5F0FA', divider: '#E5D4F0' }

  const ING_SKIP_DISPLAY = ['ingrediente', 'ingredient', 'ingredienti', 'n/d', 'nan', 'undefined', 'nome ingrediente in minuscolo']
  // formatNome: "zucchero_canna" → "Zucchero canna" (underscore→spazio,
  // prima lettera maiuscola, resto minuscolo).
  const formatNome = (s) => {
    if (!s) return ''
    const cleaned = String(s).replace(/_/g, ' ').toLowerCase().trim()
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }
  const ingListBase = (ric.ingredienti || [])
    .filter(ing => !ING_SKIP_DISPLAY.includes(normIng(ing.nome || '').toLowerCase().trim()))
    .map(ing => {
      // Audit 2026-09-09: il costo di riga era `ingCosti[nome] * grammi`, che non
      // conosce i semilavorati (una base usata come ingrediente usciva "n/d" con
      // costo 0 mentre il totale fc la contava per ricorsione: la somma delle
      // percentuali non faceva 100) ne' le rese (righe più basse del totale).
      // costoRigaIngrediente e' la stessa funzione che alimenta la tabella di
      // Nuova Ricetta e calcolaFCDettaglio: un solo conto per tutte le pagine.
      const c = ingCosti[normIng(ing.nome)]
      const rg = costoRigaIngrediente(ing, ingCosti, ricettario)
      const costoCalc = rg.costo
      return { ...ing, nomeDisplay: formatNome(ing.nome), costoCalc, costoPerGCalc: c?.costoG || 0, pct: fc > 0 ? (costoCalc / fc * 100) : 0, isStima: rg.isStima, mancante: rg.mancante, isSemilavorato: rg.isSemilavorato, motivoCosto: rg.motivo }
    })
  // Sort sincrono (niente useMemo: siamo dopo l'early return su tipo
  // 'interno', e useMemo violerebbe le rules-of-hooks). N ingredienti per
  // ricetta è < 50 → sort O(n log n) trascurabile.
  // Quanti ingredienti stanno usando un prezzo medio di mercato invece del tuo.
  // Distinto dai `mancanti` di calcolaFC, che non hanno prezzo per niente.
  const nStimati = ingListBase.filter(i => i.isStima).length
  // Audit 2026-09-09: ogni numero che deriva dal prezzo di vendita va sostituito
  // con un trattino quando quel prezzo non e' stato impostato. Prima usciva il
  // valore calcolato su un prezzo inventato (4,00 €), indistinguibile da un dato vero.
  const seHaPrezzo = (v) => senzaPrezzo ? '—' : v
  const ingList = [...ingListBase].sort((a, b) => {
    if (sortKey === 'nome') {
      const sa = a.nomeDisplay || '', sb = b.nomeDisplay || ''
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    }
    const va = a[sortKey], vb = b[sortKey]
    const na = Number(va) || 0, nb = Number(vb) || 0
    return sortDir === 'asc' ? na - nb : nb - na
  })

  // Composizione FC: tutti gli ingredienti con costo > 0, niente aggregazione
  // "Altri" (richiesta utente 26/06: voglio vedere ogni ingrediente).
  const pieData = ingList.filter(i => i.costoCalc > 0)

  // ─── Card COLLAPSED ───────────────────────────────────────────────
  // Mostra solo: nome + badge qualità + 1 KPI chiave (Margine % per ricette,
  // Costo/kg per semilavorati) + chevron. Tap → espande l'header pieno.
  if (!expanded) {
    // Per i gusti: se non abbiamo un ricavo flat stimato, mostriamo il food
    // cost/kg come KPI primario (è il dato che c'è) e "Configura formati"
    // come hint secondario. Se c'è il ricavo, mostriamo Margine% + Ricavo/kg.
    const kpiPrim = isSemi
      ? { lbl: 'Costo / kg', val: fmt(costoGSemi * 1000), c: SEMI.accent }
      : (isGusto && !ricavoFlatOk)
        ? { lbl: 'Costo / kg', val: fmt(fcPerKg), c: C.red }
        : senzaPrezzo
          ? { lbl: 'Margine', val: 'prezzo da impostare', c: C.textSoft }
          : { lbl: 'Margine', val: fmtp(margPct), c: mc }
    const kpiSec = isSemi
      ? { lbl: 'Peso batch', val: pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT', { useGrouping: 'always' })} g`, c: C.text }
      : (isGusto && !ricavoFlatOk)
        ? { lbl: 'Ricavo/kg', val: 'Configura formati', c: C.textSoft }
        : isGusto
          ? { lbl: 'Ricavo / kg', val: fmt(ricavo), c: C.text }
          : { lbl: 'Ricavo', val: seHaPrezzo(fmt(ricavo)), c: senzaPrezzo ? C.textSoft : C.text }
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true) } }}
        className="fos-tile"
        style={{
          background: isSemi ? SEMI.bg : T.bgCard, border: `1px solid ${isSemi ? SEMI.border : T.border}`,
          borderRadius: 18, overflow: 'hidden', cursor: 'pointer',
          boxShadow: isSemi ? '0 1px 2px rgba(142,68,173,0.05), 0 10px 28px rgba(142,68,173,0.07)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
          padding: isMobile ? '14px 16px' : '14px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            {isSemi && (
              <span style={{ padding: '2px 7px', borderRadius: 5, background: SEMI.accentLight, color: SEMI.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Semilavorato</span>
            )}
            {!isSemi && margBadge(margPct, senzaPrezzo)}
            {/* Card chiusa: "N stime" era la stessa bugia della card aperta, in più
                corto. Chi non apre la card vede solo questo. */}
            {mancanti.length > 0 && (
              <Badge label={mancanti.length === 1 ? '1 senza prezzo' : `${mancanti.length} senza prezzo`} color="red"/>
            )}
            {mancanti.length === 0 && nStimati > 0 && (
              <Badge label={nStimati === 1 ? '1 stimato' : `${nStimati} stimati`} color="amber"/>
            )}
          </div>
          <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ric.nome}
          </div>
          <div style={{ fontSize: 12, color: C.textSoft, marginTop: 3, ...TNUM }}>
            {kpiSec.lbl}: <span style={{ color: C.textMid, fontWeight: 700 }}>{kpiSec.val}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, lineHeight: 1 }}>{kpiPrim.lbl}</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: kpiPrim.c, marginTop: 4, ...TNUM, lineHeight: 1 }}>{kpiPrim.val}</div>
        </div>
        <div style={{ flexShrink: 0, color: C.textSoft, lineHeight: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    )
  }

  // ─── Card EXPANDED (header pieno + dettaglio opzionale) ─────────────
  // Click sulla zona vuota dell'header → collapse (richiesta UX 26/06):
  // se riclicco la card si richiude. Lo fa solo se il click NON è su un
  // bottone, input, h3 (modifica), label o link - quelli mantengono il
  // loro handler.
  const collapseOnEmptyClick = (e) => {
    if (e.target.closest('button, input, textarea, h3, label, a, svg')) return
    if (open) { setOpen(false); setExpanded(false); return }
    setExpanded(false)
  }
  return (
    <div className={open ? undefined : 'fos-tile'} style={{
      background: isSemi ? SEMI.bg : T.bgCard,
      border: `1px solid ${isSemi ? SEMI.border : T.border}`,
      borderRadius: 18, overflow: 'hidden',
      boxShadow: isSemi ? '0 1px 2px rgba(142,68,173,0.05), 0 10px 28px rgba(142,68,173,0.07)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
      position: 'relative',
    }}>
      {/* Accent bar futuristic in cima al card expanded - gradient brand animato.
          Solo quando il dettaglio è aperto, così il card collapsed resta minimale. */}
      {open && (
        <>
          <div aria-hidden="true" style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: isSemi
              ? `linear-gradient(90deg, ${SEMI.accent} 0%, #B58FCE 50%, ${SEMI.accent} 100%)`
              : 'linear-gradient(90deg, #E84B3A 0%, #FFB350 50%, #6E0E1A 100%)',
            backgroundSize: '200% 100%',
            animation: '_fos_ric_accent 6s ease-in-out infinite',
            zIndex: 1,
          }}/>
          <style>{`
            @keyframes _fos_ric_accent {
              0%, 100% { background-position: 0% 50%; }
              50%      { background-position: 100% 50%; }
            }
            @media (prefers-reduced-motion: reduce) {
              [data-fos-accent] { animation: none !important; }
            }
          `}</style>
        </>
      )}
      {/* Header - cliccabile per chiudere/comprimere */}
      <div onClick={collapseOnEmptyClick} style={{ padding: isMobile ? '14px 16px' : '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: open ? `1px solid ${isSemi ? SEMI.divider : C.border}` : 'none', cursor: 'pointer' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            {isSemi && (
              <span style={{ padding: '3px 8px', borderRadius: 5, background: SEMI.accentLight, color: SEMI.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 }}>Semilavorato</span>
            )}
            {/* Titolo futuristic: gradient bordeaux → quasi-nero, uppercase
                letterspaced 0.02em, fontWeight 800. Match con il titolo h1
                del topbar globale per coerenza visiva. */}
            <h3 onClick={onEdit ? () => onEdit(ric.nome) : undefined}
              style={{
                margin: 0,
                fontSize: isMobile ? 15 : 17,
                fontWeight: 800,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                lineHeight: 1.25,
                cursor: onEdit ? 'pointer' : 'default',
                backgroundImage: isSemi
                  ? `linear-gradient(135deg, #1C0A0A 0%, ${SEMI.accent} 60%, #1C0A0A 100%)`
                  : 'linear-gradient(135deg, #1C0A0A 0%, #6E0E1A 60%, #1C0A0A 100%)',
                backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
              {ric.nome}
            </h3>
          </div>
          {/* Etichette qualità/avvisi su riga dedicata: così restano allineate
              nella stessa posizione sotto ogni gusto, indipendentemente dalla
              lunghezza del nome. */}
          {(!isSemi || mancanti.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5, minHeight: 22 }}>
              {!isSemi && (isGusto && !ricavoFlatOk
                ? <Badge label="Ricavo/kg da configurare" color="amber"/>
                : <Tip text={senzaPrezzo
                    ? 'Non c’è un prezzo di vendita salvato, quindi il margine non si può calcolare. Impostalo col bottone Prezzo qui sotto.'
                    : isGusto
                      ? `Margine ${fmtp(margPct)}: ricavo ${fmt(ricavo)}/kg (media formati) − costo ${fmt(fcPerKg)}/kg.`
                      : `Margine: ${fmtp(margPct)}. Ricavo ${fmt(ricavo)} − FC ${fmt(fc)}.`} width={280}>{margBadge(margPct, senzaPrezzo)}</Tip>
              )}
              {/* Audit 2026-09-09 ALTA: questo badge diceva "N prezzi stimati" con il
                  tooltip "FC calcolato su stime HoReCa" contando gli ingredienti che
                  NON hanno prezzo, e che calcolaFC esclude dal totale valendo ZERO.
                  Caso reale NOCCIOLA: base bianca 1000 g (2,31 €) + pasta nocciola
                  110 g (0 €, nessun prezzo) -> card "Food cost 2,31 €", "1 prezzo
                  stimato", composizione "Base bianca 100%". La pasta nocciola sta a
                  25-40 €/kg: il food cost vero e' più che DOPPIO.
                  E le stime HoReCa vere (isStima) non erano contate da nessuna parte:
                  SENSIBILE ha albume e burro entrambi stimati e non mostrava nulla,
                  ABIS ha lo zafferano che fa il 99% del food cost da listino medio.
                  Ora sono due cose distinte, perché sono due problemi distinti. */}
              {mancanti.length > 0 && (
                <Tip text={`Questi ingredienti non hanno prezzo e valgono ZERO nel calcolo: ${mancanti.join(', ')}. Il food cost vero e' più alto.`} width={300}><Badge label={mancanti.length === 1 ? '1 senza prezzo' : `${mancanti.length} senza prezzo`} color="red"/></Tip>
              )}
              {nStimati > 0 && (
                <Tip text="Prezzo preso dal listino medio di mercato, non dal tuo. Caricando i tuoi prezzi il food cost diventa il tuo." width={300}><Badge label={nStimati === 1 ? '1 prezzo stimato' : `${nStimati} prezzi stimati`} color="amber"/></Tip>
              )}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.4 }}>
            {isSemi
              ? `Base interna · ${pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT', { useGrouping: 'always' })} g`} per batch${ric.totImpasto1 > 0 ? ` · ${ric.totImpasto1}g impasto` : ''}`
              : isGusto
                ? (ricavoFlatOk
                    ? `Gusto · costo ${fmt(fcPerKg)}/kg · ricavo medio ${fmt(ricavo)}/kg (dai formati)`
                    : `Gusto · costo ${fmt(fcPerKg)}/kg · aggiungi formati vendita per stimare il margine`)
                : senzaPrezzo
                  ? `Prezzo di vendita da impostare${ric.totImpasto1 > 0 ? ` · ${ric.totImpasto1}g impasto` : ''}`
                  : `${reg.unita} ${labelPlurale(tipoEff)} × ${fmt(reg.prezzo)}${ric.totImpasto1 > 0 ? ` · ${ric.totImpasto1}g impasto` : ''}`}
          </div>
          {(ric.allergeni || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {(ric.allergeni || []).map(aid => {
                const a = ALLERGENI.find(x => x.id === aid)
                if (!a) return null
                return (
                  <span key={aid} style={{ fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${ALLERGENE_COLORS[aid]}18`, color: ALLERGENE_COLORS[aid], border: `1px solid ${ALLERGENE_COLORS[aid]}40` }}>
                    {a.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* KPI inline - su mobile occupano tutta la riga (grid 4 col), su desktop
            ognuna ha minWidth 86 così tutti i box hanno la stessa larghezza:
            niente "fisarmonica" tra ricette con margine 1 cifra vs 4 cifre. */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? `repeat(${isSemi ? 3 : 4}, 1fr)` : `repeat(${isSemi ? 3 : 4}, minmax(86px, 1fr))`, gap: isMobile ? 6 : 6, alignItems: 'stretch', flexShrink: 0, flexBasis: isMobile ? '100%' : 'auto', width: isMobile ? '100%' : 'auto' }}>
          {(isSemi ? [
            { lbl: 'Peso batch', val: pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT', { useGrouping: 'always' })} g`, c: C.text, bg: SEMI.panel },
            { lbl: 'Costo batch', val: fmt(fc), c: SEMI.accent, bg: SEMI.accentLight, bold: true },
            { lbl: 'Costo / kg', val: fmt(costoGSemi * 1000), c: SEMI.accent, bg: SEMI.accentLight, bold: true },
          ] : isGusto ? (
            // GUSTO gelateria: KPI ragionati sul kg. Se non c'e' ricavo flat
            // stimato (nessun formato vendita configurato per la categoria),
            // mostriamo solo costo/kg + hint dove sistemarlo.
            ricavoFlatOk ? [
              { lbl: 'Ricavo / kg', val: fmt(ricavo), c: C.text, bg: '#F8F4F2' },
              { lbl: 'Margine / kg', val: fmt(margine), c: mc, bg: mbg, bold: true },
              { lbl: 'Margine %', val: fmtp(margPct), c: mc, bg: mbg, bold: true },
              { lbl: 'Costo / kg', val: fmt(fcPerKg), c: C.red, bg: C.redLight },
            ] : [
              { lbl: 'Costo / kg', val: fmt(fcPerKg), c: C.red, bg: C.redLight, bold: true },
              { lbl: 'Peso batch', val: pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT', { useGrouping: 'always' })} g`, c: C.text, bg: '#F8F4F2' },
              { lbl: 'Ricavo / kg', val: 'n/d', c: C.textSoft, bg: '#F8F4F2' },
              { lbl: 'Margine %', val: 'n/d', c: C.textSoft, bg: '#F8F4F2' },
            ]
          ) : [
            // Ordine (26/06): Ricavo, Margine, Margine %, Food cost a destra.
            { lbl: 'Ricavo', val: seHaPrezzo(fmt(ricavo)), c: C.text, bg: '#F8F4F2' },
            { lbl: 'Margine', val: seHaPrezzo(fmt(margine)), c: senzaPrezzo ? C.textSoft : mc, bg: senzaPrezzo ? C.bgSubtle : mbg, bold: true },
            { lbl: 'Margine %', val: seHaPrezzo(fmtp(margPct)), c: senzaPrezzo ? C.textSoft : mc, bg: senzaPrezzo ? C.bgSubtle : mbg, bold: true },
            { lbl: 'Food cost', val: fmt(fc), c: C.red, bg: C.redLight },
          ]).map(({ lbl, val, c, bg, bold }, i) => (
            // KPI futuristic: subtle inset highlight + ring borderColor brand
            // sui prominent (bold). Tabular nums + monospace digits.
            <div key={i} style={{
              background: bg,
              padding: isMobile ? '7px 6px' : '8px 10px',
              borderRadius: 10,
              border: bold ? `1px solid ${c}30` : `1px solid transparent`,
              boxShadow: bold ? `inset 0 1px 0 rgba(255,255,255,0.6), 0 0 0 1px ${c}10` : 'inset 0 1px 0 rgba(255,255,255,0.5)',
              textAlign: 'center', minWidth: 0, minHeight: 48,
              display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden',
            }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 3, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lbl}</div>
              <div style={{ fontSize: isMobile ? 11.5 : 13, fontWeight: bold ? 900 : 700, color: c, ...TNUM, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Actions - su mobile su riga dedicata, bottoni grid 2 colonne uniformi
            con il bottone "Riduci card" full-width sopra come barra principale. */}
        <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, gap: 6, alignItems: 'stretch', flexShrink: 0, flexWrap: 'wrap', flexBasis: isMobile ? '100%' : 'auto', width: isMobile ? '100%' : 'auto' }}>
          <button onClick={() => { setExpanded(false); setOpen(false); setEditMode(false) }}
            aria-label="Riduci card"
            title="Riduci"
            style={{ height: isMobile ? 40 : 34, ...(isMobile ? { gridColumn: '1 / -1' } : { width: 34 }), borderRadius: 7, border: `1px solid ${isSemi ? SEMI.border : C.borderStr}`, background: 'transparent', cursor: 'pointer', color: isSemi ? SEMI.accent : C.textMid, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            {isMobile && <span>Riduci</span>}
          </button>
          <button onClick={() => setOpen(o => !o)}
            style={{ height: isMobile ? 40 : 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${isSemi ? SEMI.border : C.borderStr}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: isSemi ? SEMI.accent : C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            {open ? '▲ Chiudi' : '▼ Dettaglio'}
          </button>
          {/* Edit rapido prezzo/n°fette: solo per stampi. Per i gusti (gelateria)
              il prezzo vive su Formati vendita. Nascosto se la sede attiva ha
              un OVERRIDE prezzo (audit 2026-07-31): il quick edit scriverebbe
              su SK_RIC (base org-wide) sovrascrivendo il valore anche per le
              altre sedi. Se c'è override, l'utente usa "Prezzi / sede" che
              apre la modale batch multi-sede. */}
          {!isSemi && tipoEff !== 'gusto' && !hasOverride && (
            <button onClick={() => { setEditPrezzo(reg.prezzo); setEditUnita(reg.unita); setEditMode(e => !e) }}
              style={{ height: isMobile ? 40 : 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${editMode ? C.red : C.borderStr}`, background: editMode ? C.redLight : 'transparent', fontSize: 12, fontWeight: 700, color: editMode ? C.red : C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Icon name="edit" size={13} /> Prezzo
            </button>
          )}
          {/* Prezzi per sede: visibile solo se l'org ha 2+ sedi attive. Vale
              per stampi/pezzi E gusti (i gusti fissano il prezzo/kg per sede).
              Badge "•" se la sede attualmente selezionata ha un override. */}
          {!isSemi && hasMultiSede && orgId && (
            <button onClick={() => setPrezziSedeOpen(true)}
              title={hasOverride ? `Prezzo override attivo per ${sedeAttivaNome || 'questa sede'}` : 'Prezzi diversi per sede'}
              style={{ height: isMobile ? 40 : 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${hasOverride ? C.red : C.borderStr}`, background: hasOverride ? C.redLight : 'transparent', fontSize: 12, fontWeight: 700, color: hasOverride ? C.red : C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Icon name="map" size={13} /> Prezzi / sede{hasOverride ? ' •' : ''}
            </button>
          )}
          {onEdit && (
            <button onClick={() => onEdit(ric.nome)}
              style={{ height: isMobile ? 40 : 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.red}`, background: C.red, color: C.white, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Icon name="edit" size={13} /> Modifica
            </button>
          )}
          <button onClick={async () => {
            // Audit 2026-07-01 MEDIUM: prevenire doppio PDF su double-click.
            if (exportingPdf) return
            setExportingPdf(true)
            try {
              if (!(await gateExport('ricettario', { nome: ric.nome }, window.__foodos_notify))) return
              const c = getExportCtx()
              exportRicettaPDF(ric, { tot: fc, perc: ricavo > 0 ? fc / ricavo * 100 : 0 }, ingCosti, c.nomeAttivita, c.email)
            } finally { setExportingPdf(false) }
          }}
            disabled={exportingPdf}
            style={{ height: isMobile ? 40 : 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${isSemi ? SEMI.border : C.borderStr}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: isSemi ? SEMI.accent : C.textMid, cursor: exportingPdf ? 'not-allowed' : 'pointer', opacity: exportingPdf ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, ...(isMobile && isSemi ? { gridColumn: '1 / -1' } : {}) }}>
            <Icon name="fileText" size={13} /> {exportingPdf ? '…' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Edit inline */}
      {editMode && (
        <div style={{ padding: '14px 24px', background: '#FFF8F7', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Modifica prezzo / {labelPlurale(tipoEff)}:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase' }}>N°</label>
            <input type="number" inputMode="numeric" min="1" max="100" value={editUnita} onChange={e => setEditUnita(e.target.value)}
              style={{ width: isMobile ? 80 : 64, padding: '8px 8px', minHeight: isMobile ? 44 : 'auto', borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, fontWeight: 700, color: C.text, textAlign: 'center' }}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase' }}>€ / {labelSingolare(tipoEff)}</label>
            <input type="number" inputMode="decimal" min="0" step="0.1" value={editPrezzo} onChange={e => setEditPrezzo(e.target.value)}
              style={{ width: isMobile ? 90 : 72, padding: '8px 8px', minHeight: isMobile ? 44 : 'auto', borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, fontWeight: 700, color: C.text, textAlign: 'center' }}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: C.white, borderRadius: 7, border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: C.textSoft }}>Ricavo stimato:</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: C.green, ...TNUM }}>{fmt((parseFloat(editPrezzo) || 0) * (parseInt(editUnita) || 0))}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button onClick={() => setEditMode(false)} disabled={savingRegola} style={{ padding: '9px 14px', minHeight: 40, borderRadius: 7, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: C.textMid, cursor: savingRegola ? 'default' : 'pointer', opacity: savingRegola ? 0.5 : 1 }}>Annulla</button>
            {/* disabled durante l'attesa: senza, un doppio click salvava due volte. */}
            <button onClick={handleSaveRegola} disabled={savingRegola} style={{ padding: '9px 18px', minHeight: 40, borderRadius: 7, border: 'none', background: savingRegola ? C.borderStr : C.red, color: C.white, fontSize: 12, fontWeight: 800, cursor: savingRegola ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="save" size={13} /> {savingRegola ? 'Salvo…' : 'Salva'}</button>
          </div>
        </div>
      )}

      {/* Dettaglio aperto - Layout 2×2: 4 pannelli stessa larghezza, altezza
          naturale basata sul contenuto. Più ingredienti = pannelli più alti;
          meno = più compatti. `align-items: stretch` (default grid) garantisce
          che i pannelli nella stessa RIGA siano alti uguali (max della riga),
          minimizzando lo spazio vuoto. */}
      {open && (() => {
        // Futuristic panel: gradient verticale leggero + accent line top + box shadow.
        // Identical look per tutti e 4 i pannelli → coerenza visiva del quadrato.
        const PANEL_STYLE = {
          background: 'linear-gradient(180deg, #FBF5F2 0%, #F4ECE7 100%)',
          borderRadius: 12, padding: 16, boxSizing: 'border-box',
          position: 'relative', overflow: 'hidden',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
        }
        const PANEL_ACCENT = (
          <div aria-hidden="true" style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, #E84B3A 0%, #FFB350 50%, #6E0E1A 100%)',
            opacity: 0.7,
          }}/>
        )
        const PANEL_TITLE_STYLE = { fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.02em' }
        return (
        <div style={{ padding: isMobile ? '16px 14px 20px' : '24px 24px 28px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18, boxSizing: 'border-box', width: '100%', minWidth: 0 }}>
          {/* PANEL 1 - Distinta costi (senza titolo) */}
          <div style={PANEL_STYLE}>
            {PANEL_ACCENT}
            {/* Container tabella: overflowX auto + scroll hint a destra (sfumatura)
                per segnalare visivamente che ci sono altre colonne da scrollare.
                minWidth 480 cosi le 5 colonne (Ingr/g/€-g/Costo/%FC) non si
                comprimono troppo su mobile 375px. */}
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: C.white }}>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: isMobile ? 480 : 'auto' }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    {[
                      ['Ingrediente', 'Materia prima usata nella ricetta', 'nome'],
                      ['g / st.', 'Grammi di ingrediente per UNO stampo (o batch) della ricetta', 'qty1stampo'],
                      ['€ / g', "Costo di un grammo dell'ingrediente (prezzo materia prima ÷ 1000 se al kg)", 'costoPerGCalc'],
                      ['Costo', 'Costo di questo ingrediente per uno stampo = g/st. × €/g', 'costoCalc'],
                      ['%FC', 'Peso percentuale di questo ingrediente sul food cost totale della ricetta', 'pct'],
                    ].map(([h, tip, key], i) => {
                      const isActive = sortKey === key
                      const arrow = isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
                      return (
                        <th key={h}
                          onClick={() => toggleSort(key)}
                          style={{ padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: isActive ? C.text : C.textSoft, borderBottom: `1px solid ${C.border}`, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                          <Tip text={tip} width={240}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{h}{arrow}</span>
                          </Tip>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {ingList.map((ing, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: C.text }}>
                        {ing.nomeDisplay}
                        {ing.isStima && <span style={{ fontSize: 7, marginLeft: 4, background: C.amberLight, color: C.amber, padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>stima</span>}
                        {ing.mancante && <span style={{ fontSize: 7, marginLeft: 4, background: C.redLight, color: C.red, padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>n/d</span>}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: C.textMid, ...TNUM, whiteSpace: 'nowrap' }}>{ing.qty1stampo}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: C.textSoft, ...TNUM, fontSize: 12, whiteSpace: 'nowrap' }}>{ing.costoPerGCalc > 0 ? ing.costoPerGCalc.toFixed(4) : '-'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: ing.costoCalc > 0 ? C.text : C.textSoft, ...TNUM, whiteSpace: 'nowrap' }}>{ing.costoCalc > 0 ? fmt(ing.costoCalc) : '-'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                        {ing.pct > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 44, height: 5, background: '#EEE', borderRadius: 3, flexShrink: 0 }}>
                              <div style={{ width: `${Math.min(100, ing.pct)}%`, height: 5, background: ing.pct > 30 ? C.red : ing.pct > 15 ? C.amber : '#AAB', borderRadius: 3 }}/>
                            </div>
                            <span style={{ fontSize: 12, color: C.textMid, width: 30, textAlign: 'right', fontWeight: 700, ...TNUM }}>{ing.pct.toFixed(0)}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* TOTALE: padding e fontSize IDENTICI alle celle sopra
                      → tutti i totali (g, costo, %FC) perfettamente incolonnati
                      con i valori delle righe ingredienti. */}
                  {(() => {
                    const totG   = ingList.reduce((s, x) => s + (Number(x.qty1stampo) || 0), 0)
                    const totPct = ingList.reduce((s, x) => s + (Number(x.pct) || 0), 0)
                    return (
                      <tr style={{ background: '#F0EAE6', borderTop: `2px solid ${C.borderStr}` }}>
                        <td style={{ padding: '9px 12px', fontWeight: 800, fontSize: 12, color: C.text, letterSpacing: '0.05em' }}>TOTALE</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 900, fontSize: 12, color: C.text, ...TNUM, whiteSpace: 'nowrap' }}>{Math.round(totG)}</td>
                        <td/>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 900, fontSize: 12, color: C.red, ...TNUM, whiteSpace: 'nowrap' }}>{fmt(fc)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 900, fontSize: 12, color: C.text, ...TNUM, whiteSpace: 'nowrap' }}>{Math.round(totPct)}%</td>
                      </tr>
                    )
                  })()}
                </tfoot>
              </table>
              </div>
              {/* Scroll hint: sfumatura bianco→trasparente sul lato destro per
                  indicare visivamente che si può scrollare la tabella. Solo mobile. */}
              {isMobile && (
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 28, pointerEvents: 'none',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.95) 100%)' }}/>
              )}
            </div>
          </div>

          {/* PANEL 2 - Composizione food cost */}
          {pieData.length > 0 && (() => {
            const totPie = pieData.reduce((s, x) => s + (x.costoCalc || 0), 0) || 1
            return (
            <div style={PANEL_STYLE}>
              {PANEL_ACCENT}
              <div style={PANEL_TITLE_STYLE}><Icon name="barChart" size={14} /> Composizione food cost</div>
              {pieData.map((ing, i) => {
                const pct = ing.costoCalc / totPie * 100
                const col = PIE_COLORS[i % PIE_COLORS.length]
                return (
                  // Grid 3 col: nome (1fr ellipsis) | € (right) | % (right).
                  // Larghezze fisse sulle ultime due → tutti gli € sono uno
                  // sotto l'altro e tutte le % sono uno sotto l'altro.
                  <div key={i} style={{ marginBottom: 10, minHeight: 26 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 78px 44px', alignItems: 'baseline', gap: 10, fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{formatNome(ing.nome)}</span>
                      <span style={{ color: C.textMid, fontWeight: 700, ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>{fmt(ing.costoCalc)}</span>
                      <span style={{ color: C.textSoft, fontWeight: 600, ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: col, borderRadius: 3, transition: 'width 320ms cubic-bezier(.32,.72,0,1)' }}/>
                    </div>
                  </div>
                )
              })}
            </div>
            )
          })()}

          {/* PANEL 3 - Conto economico per stampo. Escluso per gusti: prezzo su Formati vendita. */}
          {!isSemi && reg.tipo !== 'gusto' && (
            <div style={PANEL_STYLE}>
              {PANEL_ACCENT}
              <div style={PANEL_TITLE_STYLE}><Icon name="money" size={14} /> Conto economico per stampo</div>
              {/* 4 righe perfettamente incolonnate */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { lbl: 'Ricavo',         val: seHaPrezzo(fmt(ricavo)),  c: senzaPrezzo ? C.textSoft : C.green, bg: senzaPrezzo ? C.bgSubtle : C.greenLight, brd: senzaPrezzo ? C.border : `${C.green}25` },
                  { lbl: 'Food cost',      val: `−${fmt(fc)}`,  c: C.red,   bg: C.redLight,   brd: `${C.red}20` },
                  { lbl: 'Margine lordo',  val: seHaPrezzo(fmt(margine)),  c: senzaPrezzo ? C.textSoft : mc, bg: senzaPrezzo ? C.bgSubtle : mbg, brd: senzaPrezzo ? C.border : `${mc}25`, prominent: true },
                  { lbl: 'Margine %',      val: seHaPrezzo(fmtp(margPct)), c: senzaPrezzo ? C.textSoft : mc, bg: senzaPrezzo ? C.bgSubtle : mbg, brd: senzaPrezzo ? C.border : `${mc}25` },
                ].map((r, i) => (
                  <div key={i} style={{
                    padding: '11px 14px', background: r.bg, border: `1px solid ${r.brd}`, borderRadius: 8,
                    display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', minHeight: 44, columnGap: 12,
                  }}>
                    <span style={{ fontSize: 12, color: r.c, fontWeight: r.prominent ? 800 : 700, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{r.lbl}</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: r.c, ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PANEL 4 - Conto economico al KG per gusto (gelateria). Il ricavo/kg
              e' la media dei formati vendita della categoria: uguale per tutti
              i gusti di quella categoria (ricavo flat). Il costo varia gusto per
              gusto. Se non ci sono formati, mostriamo solo costo + CTA. */}
          {!isSemi && reg.tipo === 'gusto' && (
            <div style={PANEL_STYLE}>
              {PANEL_ACCENT}
              <div style={PANEL_TITLE_STYLE}><Icon name="gift" size={14} /> Conto economico al kg</div>
              {ricavoFlatOk ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { lbl: 'Ricavo / kg',    val: fmt(ricavo),    c: C.green, bg: C.greenLight, brd: `${C.green}25` },
                      { lbl: 'Food cost / kg', val: `−${fmt(fcPerKg)}`, c: C.red, bg: C.redLight, brd: `${C.red}20` },
                      { lbl: 'Margine / kg',   val: fmt(margine),   c: mc,      bg: mbg,          brd: `${mc}25`, prominent: true },
                      { lbl: 'Margine %',      val: fmtp(margPct),  c: mc,      bg: mbg,          brd: `${mc}25` },
                    ].map((r, i) => (
                      <div key={i} style={{
                        padding: '11px 14px', background: r.bg, border: `1px solid ${r.brd}`, borderRadius: 8,
                        display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', minHeight: 44, columnGap: 12,
                      }}>
                        <span style={{ fontSize: 12, color: r.c, fontWeight: r.prominent ? 800 : 700, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{r.lbl}</span>
                        <span style={{ fontSize: 15, fontWeight: 900, color: r.c, ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSoft, marginTop: 10, lineHeight: 1.45 }}>
                    Ricavo/kg = prezzo medio dei <b>Formati vendita</b> della categoria &ldquo;{ric.categoria || 'Gelato'}&rdquo; (uguale per tutti i gusti). Il costo varia gusto per gusto.
                  </div>
                </>
              ) : (
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '14px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft }}>Food cost / kg</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: C.red, ...TNUM }}>{fmt(fcPerKg)}</div>
                  </div>
                  <div style={{ padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7, fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                    Per stimare il margine di questo gusto, configura almeno un <b>Formato vendita</b> per la categoria &ldquo;{ric.categoria || 'Gelato'}&rdquo; (cono, coppetta, vaschetta) — trovi il pannello in Cassa → Formati vendita.
                  </div>
                </div>
              )}
            </div>
          )}
          {!isSemi && reg.tipo !== 'gusto' && (
            <div style={PANEL_STYLE}>
              {PANEL_ACCENT}
              <div style={PANEL_TITLE_STYLE}><Icon name="gift" size={14} /> Per singola {reg.tipo}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { lbl: 'Prezzo',    val: seHaPrezzo(fmt(reg.prezzo)), c: senzaPrezzo ? C.textSoft : C.text },
                  { lbl: 'Food cost', val: fmt(fcUnita),    c: C.red },
                  { lbl: 'Margine',   val: seHaPrezzo(fmt(mrgUnita)), c: senzaPrezzo ? C.textSoft : (mrgUnita > 0 ? C.green : C.red) },
                ].map(({ lbl, val, c }) => (
                  <div key={lbl} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '11px 8px', textAlign: 'center', minHeight: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, lineHeight: 1 }}>{lbl}</div>
                    <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 900, color: c, ...TNUM, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PANEL 3 alt - Riepilogo batch (semi only) */}
          {isSemi && (
            <div style={{ ...PANEL_STYLE, background: `linear-gradient(180deg, ${SEMI.panel} 0%, ${SEMI.accentLight} 100%)` }}>
              <div aria-hidden="true" style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, ${SEMI.accent} 0%, #B58FCE 50%, ${SEMI.accent} 100%)`,
                opacity: 0.7,
              }}/>
              <div style={PANEL_TITLE_STYLE}><Icon name="bank" size={14} /> Riepilogo batch</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { lbl: 'Peso totale',   val: pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT', { useGrouping: 'always' })} g`, c: C.text },
                  { lbl: 'Costo / kg',    val: fmt(costoGSemi * 1000), c: SEMI.accent },
                  { lbl: 'Costo / 100 g', val: fmt(costoGSemi * 100),  c: SEMI.accent },
                ].map(({ lbl, val, c }) => (
                  <div key={lbl} style={{ background: C.white, border: `1px solid ${SEMI.divider}`, borderRadius: 7, padding: '11px 8px', textAlign: 'center', minHeight: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, lineHeight: 1 }}>{lbl}</div>
                    <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 900, color: c, ...TNUM, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        )
      })()}
      {prezziSedeOpen && (
        <PrezziPerSedeModal
          open={prezziSedeOpen}
          onClose={() => setPrezziSedeOpen(false)}
          orgId={orgId}
          sedi={sedi}
          target={{ kind: 'ricetta', ric }}
          notify={notify}
        />
      )}
    </div>
  )
}

// ─── RicettarioView ──────────────────────────────────────────────────────────
export default function RicettarioView({ ricettario, onUpdateRegola, onUpload, onEditRicetta, orgId, sedi = [], sedeAttiva = null, notify = null, LEX = lessico(), metodoProduzione = 'stampi' }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  // Listino per-sede: se sedeAttiva e' impostata (non "tutte le sedi"), tutte
  // le card usano i prezzi override; altrimenti i base.
  const isAllSedi = sedeAttiva?._all === true
  const sedeIdCorrente = isAllSedi ? null : (sedeAttiva?.id || null)
  const { listino: listinoSede } = useListinoSede(orgId, sedeIdCorrente)

  const ricette = useMemo(() => Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato'), [ricettario])
  const semilavorati = useMemo(() => Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo === 'semilavorato'), [ricettario])

  // Ricavo flat €/kg per gusti: delegato a useRicavoFlat che internamente
  // applica anche l'override formati sede (fonte unica di verita').
  const { ricavoFlatFor, byCategoria: ricavoFlatByCategoria } = useRicavoFlat(orgId, ricettario, sedeIdCorrente)

  const [search, setSearch] = useState('')
  // Default: alfabetico ascendente (richiesta utente 13/07/2026: più facile
  // trovare una ricetta per nome che per margine).
  const [sortBy, setSortBy] = useState('nome_az')
  const [gridView, setGridView] = useState(false)

  // Ricavo effettivo di una ricetta, coerente per stampi E gusti:
  //   - stampi/pezzi: reg.unita × reg.prezzo (come prima)
  //   - gusto: ricavoFlatKg × pesoStampoKg (dai formati vendita, uguale
  //     per categoria) — se non stimabile, ricavo=0 → ricetta esclusa dai
  //     KPI di sintesi (invece che avere margine 0% che inquina la media).
  const ricavoEffettivo = (ric) => {
    const reg = getR(ric.nome, ric)
    if (reg.tipo === 'gusto') {
      const rk = ricavoFlatFor(ric)
      if (!rk || rk <= 0) return 0
      const resaG = resaGrammi(ric)
      if (resaG <= 0) return 0
      return rk * (resaG / 1000)
    }
    return reg.unita * reg.prezzo
  }

  // Audit 2026-09-09: il KPI va accompagnato dal numero di ricette su cui e'
  // calcolato. Le ricette senza prezzo di vendita sono escluse (giusto: non si
  // può calcolare una percentuale su un ricavo che non esiste), ma nel database
  // reale sono 24 su 27: senza dirlo, "Food cost medio 28%" sembra il food cost
  // dell'azienda mentre riguarda 3 ricette. Prima era anche peggio, perché il
  // prezzo inventato di 4,00 € le faceva entrare tutte e usciva 5,6% in verde.
  const { valore: fcMedio, conteggio: fcMedioSu } = ricette.length === 0
    ? { valore: 0, conteggio: 0 }
    : (() => {
        let tot = 0, cnt = 0
        for (const ric of ricette) {
          const ricavo = ricavoEffettivo(ric)
          if (ricavo <= 0) continue
          const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
          tot += fc / ricavo; cnt++
        }
        return { valore: cnt > 0 ? tot / cnt : 0, conteggio: cnt }
      })()

  const filtered = useMemo(() => {
    let arr = ricette.filter(r => r.nome.toLowerCase().includes(search.toLowerCase()))
    arr = [...arr].sort((a, b) => {
      if (sortBy === 'nome_az') return a.nome.localeCompare(b.nome)
      if (sortBy === 'nome_za') return b.nome.localeCompare(a.nome)
      const { tot: fca } = calcolaFC(a, ingCosti, ricettario), { tot: fcb } = calcolaFC(b, ingCosti, ricettario)
      const ricavA = ricavoEffettivo(a), ricavB = ricavoEffettivo(b)
      const fcpa = ricavA > 0 ? fca / ricavA : Infinity
      const fcpb = ricavB > 0 ? fcb / ricavB : Infinity
      if (sortBy === 'fc_asc')  return fcpa - fcpb
      if (sortBy === 'fc_desc') return fcpb - fcpa
      const ma = ricavA > 0 ? ((ricavA - fca) / ricavA * 100) : -Infinity
      const mb = ricavB > 0 ? ((ricavB - fcb) / ricavB * 100) : -Infinity
      if (sortBy === 'margine_asc') return ma - mb
      if (sortBy === 'margine_desc') return mb - ma
      return a.nome.localeCompare(b.nome) // fallback: alfabetico
    })
    return arr
  // ricavoFlatByCategoria è la nuova dipendenza: se cambiano i formati, il
  // sort/fcMedio dei gusti si aggiornano.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricette, search, sortBy, ingCosti, ricettario, ricavoFlatByCategoria])

  // Bottone Aggiorna come elemento riusabile: lo posizioniamo in alto a destra
  // (allineato visivamente con il sede selector nella topbar) E lo passiamo a
  // PageTitleHero come 'action' per averli sulla stessa riga del titolo.
  const aggiornaBtn = onUpload && (
    <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px',
      background: T.brandGradient, borderRadius: R.md, cursor: 'pointer',
      fontSize: 13, fontWeight: 700, color: '#fff', boxShadow: S.brandSoft,
      whiteSpace: 'nowrap', alignSelf: isMobile ? 'stretch' : 'auto', flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      Aggiorna {LEX.Ricettario.toLowerCase()}
      <input type="file" accept=".xlsx" multiple style={{ display: 'none' }} onChange={e => e.target.files.length && onUpload(Array.from(e.target.files))}/>
    </label>
  )

  return (
    <div onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()}
      style={{ maxWidth: 1200, margin: '0 auto', userSelect: 'none' }}>
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: isMobile ? 12 : 14, marginBottom: ricette.length > 0 ? 18 : 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.5, fontWeight: 500 }}>
              {ricette.length > 0
                ? <>Margini e food cost di ogni {LEX.ricetta}, ricalcolati sui prezzi delle materie prime.</>
                : LEX.nessunaRicetta}
            </div>
          </div>
          {aggiornaBtn}
        </div>

        {ricette.length > 0 && (() => {
          const ric = ricette.length, semi = semilavorati.length
          const subRicette = semi > 0
            ? `+ ${semi} semilavorat${semi === 1 ? 'o' : 'i'} (${ric + semi} voci totali)`
            : 'menu attivo'
          return (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: isMobile ? 10 : 16 }}>
              <KPI label={LEX.ricette} value={ric} icon={<Icon name="gift" size={18} />} color={T.text} sub={subRicette} />
              <KPI label="Food cost medio"
                value={fcMedioSu === 0 ? '—' : `${(fcMedio * 100).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                icon={<Icon name="barChart" size={18} />}
                color={fcMedioSu === 0 ? T.textSoft : fcMedio < 0.30 ? T.green : fcMedio < 0.35 ? T.amber : T.brand}
                sub={fcMedioSu === 0
                  ? 'serve il prezzo di vendita di almeno una ricetta'
                  : fcMedioSu < ric
                    ? `su ${fcMedioSu} ${fcMedioSu === 1 ? 'ricetta' : 'ricette'} di ${ric}: le altre non hanno prezzo`
                    : 'media non pesata sulle ricette'} />
              <KPI label="Semilavorati" value={semi} icon={<Icon name="gift" size={18} />} color="#8E44AD" sub="basi e impasti interni" />
            </div>
          )
        })()}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isMobile ? 16 : 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Cerca ${LEX.ricetta}…`}
            style={{ width: '100%', padding: '10px 12px', minHeight: isMobile || isTablet ? 44 : 'auto', border: `1px solid ${T.border}`, borderRadius: R.md,
              fontSize: isMobile || isTablet ? 16 : 13, color: T.text, background: T.bgCard, outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box', boxShadow: S.xs }}/>
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '10px 32px 10px 12px', minHeight: isMobile || isTablet ? 44 : 'auto', border: `1px solid ${T.border}`, borderRadius: R.md,
            fontSize: isMobile || isTablet ? 16 : 13, color: T.text, background: T.bgCard, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
          <option value="margine_desc">Margine ↓</option>
          <option value="margine_asc">Margine ↑</option>
          <option value="fc_asc">Food cost ↑</option>
          <option value="fc_desc">Food cost ↓</option>
          <option value="nome_az">Nome A → Z</option>
          <option value="nome_za">Nome Z → A</option>
        </select>
        <div style={{ display: 'flex', gap: 2, padding: 3, background: T.bgSubtle, borderRadius: R.md }}>
          <button onClick={() => setGridView(false)} style={{ width: 34, height: 32, padding: 0, border: 'none', borderRadius: R.sm, background: !gridView ? T.bgCard : 'transparent', cursor: 'pointer', color: !gridView ? T.text : T.textSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button onClick={() => setGridView(true)} style={{ width: 34, height: 32, padding: 0, border: 'none', borderRadius: R.sm, background: gridView ? T.bgCard : 'transparent', cursor: 'pointer', color: gridView ? T.text : T.textSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
        </div>
      </div>

      {ricette.length > 0 && filtered.length === 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: '40px 24px', textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 500, marginBottom: 4 }}>Nessun risultato</div>
          <div style={{ fontSize: 13, color: T.textSoft }}>Prova con un altro termine.</div>
        </div>
      )}

      {filtered.length > 0 && (gridView ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 32 }}>
          {filtered.map(ric => {
            const reg = getR(ric.nome, ric)
            const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
            const ricavo = reg.prezzo * reg.unita
            const marg = ricavo > 0 ? (ricavo - fc) / ricavo * 100 : 0
            const fcPct = ricavo > 0 ? fc / ricavo * 100 : 0
            const mC = marg >= 60 ? T.green : marg >= 40 ? T.amber : T.brand
            const fC = fcPct <= 30 ? T.green : fcPct <= 40 ? T.amber : T.brand
            return (
              <div key={ric.nome} className="fos-tile" onClick={() => onEditRicetta && onEditRicetta(ric.nome)}
                style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{ric.nome}</div>
                  <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2, ...TNUM }}>{reg.unita || '?'} {reg.tipo || 'pz'} · {fmt(reg.prezzo)}</div>
                </div>
                {/* Ordine richiesto (26/06): MARGINE a sinistra, FOOD COST a destra.
                    Label "Food cost" per esteso (non più "FC" criptico). */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ padding: '10px 12px', background: T.bgSubtle, borderRadius: R.md }}>
                    <div style={{ fontSize: 12, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Margine</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: mC, ...TNUM }}>{marg.toFixed(0)}%</div>
                  </div>
                  <div style={{ padding: '10px 12px', background: T.bgSubtle, borderRadius: R.md }}>
                    <div title="Food Cost: rapporto costo ingredienti / ricavo. Target tipico 25-35% in pasticceria, 22-30% in gelateria." style={{ fontSize: 12, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, cursor: 'help' }}>Food cost</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: fC, ...TNUM }}>{fcPct.toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          {filtered.map(ric => <TortaCard metodoProduzione={metodoProduzione} key={ric.nome} ric={ric} ingCosti={ingCosti} ricettario={ricettario} onUpdateRegola={onUpdateRegola} onEdit={onEditRicetta} ricavoFlatKg={ricavoFlatFor(ric)} sedi={sedi} orgId={orgId} notify={notify} listinoSede={listinoSede} sedeAttivaNome={sedeAttiva?.nome}/>)}
        </div>
      ))}

      {semilavorati.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, paddingTop: 24, borderTop: `1px solid ${T.borderSoft}` }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Semilavorati</h2>
              <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>Impasti, creme e basi interne</div>
            </div>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: '#F5EBFB', color: '#8E44AD', fontSize: 12, fontWeight: 600 }}>{semilavorati.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {semilavorati.map(ric => (
              <TortaCard metodoProduzione={metodoProduzione} key={ric.nome} ric={ric} ingCosti={ingCosti} ricettario={ricettario} onUpdateRegola={onUpdateRegola} onEdit={onEditRicetta} variant="semilavorato"/>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
