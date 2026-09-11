// Semilavorati - pagina di DIAGNOSI → CAPISCI → AGISCI (POV proprietario).
// 1) Banda diagnosi: n° semilavorati, costo medio €/kg, il più usato, il più caro.
// 2) Lista premium: per ogni semilavorato → costo (al kg / a porzione / batch), breakdown
//    ingredienti espandibile (calcolaFCDettaglio) e "Usato in N prodotti" con elenco
//    (reverse lookup su tutte le ricette che lo contengono come ingrediente).
// 3) Tabella ordinabile (costo, peso, n° utilizzi).
// 4) Form nuovo/modifica + OCR foto (logica di salvataggio invariata).
import React, { useState, useMemo } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M, typo } from '../lib/theme'
import { buildIngCosti, calcolaFC, calcolaFCDettaglio, getR, isRicettaValida, normIng, resaGrammi, PREZZI_HORECA, translateIngredienteEN, translateProdottoEN } from '../lib/foodcost'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { lessico } from '../lib/lessico'
import { trovaBasiNonDichiarate } from '../lib/basiNonDichiarate'
import FotoOCR from '../components/FotoOCR'
import Icon from '../components/Icon'
import { C, KPI, SH, PageHeader, Tip, Badge, TNUM, useSortable, SortTH } from './_shared'

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'
const SHADOW_HOVER = '0 1px 2px rgba(15,23,42,0.06), 0 18px 40px rgba(15,23,42,0.10)'

const fmtKg  = v => `${Number(v || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const fmtBatch = v => `${Number(v || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const fmtPeso = g => g >= 1000 ? `${(g / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(g).toLocaleString('it-IT', { useGrouping: 'always' })} g`

// ─── Card premium di un singolo semilavorato ─────────────────────────────────
function SemiCard({ sm, ricettario, ingCosti, onEdit, onDelete, LEX }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState(null)  // 'ingredienti' | 'usato' | null

  const { righe, tot: fc } = useMemo(() => calcolaFCDettaglio(sm.ric, ingCosti, ricettario), [sm.ric, ingCosti, ricettario])
  // Audit 2026-09-09: `mancante` significa PREZZO ASSENTE (l'ingrediente vale
  // zero nel calcolo), `isStima` significa prezzo medio di mercato al posto del
  // tuo. Sono due cose diverse e la pagina le confondeva: il badge diceva
  // "N prezzi stimati" contando i mancanti, e le stime vere non si vedevano da
  // nessuna parte. Sui dati reali sono 20 righe su 38, e per FROLLA PER CROSTATE
  // e CREMA PASTICCERA il costo al kg e' al 100% listino di mercato.
  const mancanti = righe.filter(r => r.mancante)
  const stimati = righe.filter(r => r.isStima)

  const cardStyle = {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden',
    boxShadow: SHADOW_PREMIUM, transition: `box-shadow ${M.durBase} ${M.ease}, transform ${M.durBase} ${M.ease}`,
  }

  return (
    <div style={cardStyle}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = SHADOW_HOVER; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = SHADOW_PREMIUM; e.currentTarget.style.transform = 'translateY(0)' }}>

      {/* Header riga - su mobile: card collapsed di default con chevron, tap per espandere */}
      <div style={{ padding: isMobile ? '14px 16px' : '18px 20px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobile ? 14 : 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: R.full, background: T.brandLight, color: T.brand, fontSize: typo.small.fontSize, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              <Icon name="package" size={11} />Base
            </span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.015em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{sm.nome}</h3>
            {mancanti.length > 0 && <Badge label={mancanti.length === 1 ? '1 senza prezzo' : `${mancanti.length} senza prezzo`} color="red" />}
            {stimati.length > 0 && <Badge label={stimati.length === 1 ? '1 prezzo stimato' : `${stimati.length} prezzi stimati`} color="amber" />}
          </div>
          {/* Sub-text incolonnato: peso a larghezza fissa (110px) → il separatore
              "·" e "usato in N prodotti" iniziano alla STESSA x tra card diverse,
              indipendentemente dal numero di cifre del peso (818 g vs 1,05 kg). */}
          <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, letterSpacing: '-0.005em', ...TNUM, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ display: 'inline-block', minWidth: 110, color: T.textMid, fontWeight: 600 }}>{fmtPeso(sm.peso)} batch</span>
            <span style={{ color: T.borderStr }}>·</span>
            <span style={{ fontWeight: 600, color: T.textMid }}>{sm.nUsi > 0 ? `usato in ${sm.nUsi} ${sm.nUsi === 1 ? 'prodotto' : 'prodotti'}` : 'non ancora usato'}</span>
          </div>
        </div>

        {/* KPI compatto: solo Costo/kg (richiesta utente 26/06), più grande e
            prominente. Tooltip via Tip portal - stessa esperienza di Ricette. */}
        {/* Audit 2026-09-09: quando il costo e' 0 perché gli ingredienti non hanno
            prezzo (GANACHE VEGANA: 2 su 3 senza prezzo) qui usciva "0,00 €" in
            grande sotto "COSTO / KG", come se una base al cioccolato costasse
            zero. La tabella sotto, per lo stesso semilavorato, mostrava "-".
            Ora dicono la stessa cosa, e dicono perché. */}
        <Tip text={sm.costoKg > 0
          ? "Costo materie prime per chilo di semilavorato prodotto"
          : "Non si può calcolare: manca il prezzo di uno o più ingredienti. Caricali e il costo compare."} width={260}>
          <div style={{ background: T.brandLight, padding: '12px 18px', borderRadius: R.md, textAlign: 'center', minHeight: 56, minWidth: 130, cursor: 'help', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, border: `1px solid ${T.brand}25`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)', flexShrink: 0 }}>
            <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.textSoft, lineHeight: 1, whiteSpace: 'nowrap' }}>Costo / kg</div>
            <div style={{ fontSize: sm.costoKg > 0 ? 17 : 13, fontWeight: sm.costoKg > 0 ? 900 : 700, color: sm.costoKg > 0 ? T.brand : T.textSoft, letterSpacing: '-0.015em', whiteSpace: 'nowrap', lineHeight: 1.1, ...TNUM }}>{sm.costoKg > 0 ? fmtKg(sm.costoKg) : 'da completare'}</div>
          </div>
        </Tip>

        {/* Azioni: su mobile in flexWrap pieni a 40px+ */}
        <div style={{ display: 'flex', gap: 6, alignSelf: isMobile ? 'stretch' : 'center', flexShrink: 0, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <button onClick={() => setTab(t => t === 'ingredienti' ? null : 'ingredienti')}
            style={tabBtn(tab === 'ingredienti', isMobile)}>
            <Icon name="receipt" size={13} />Costo
          </button>
          <button onClick={() => setTab(t => t === 'usato' ? null : 'usato')}
            style={tabBtn(tab === 'usato', isMobile)}>
            <Icon name="barChart" size={13} />Dove
          </button>
          <button onClick={() => onEdit(sm.nome)} aria-label="Modifica" style={iconBtn()}
            onMouseEnter={e => { e.currentTarget.style.background = T.bgSubtle; e.currentTarget.style.color = T.text }}
            onMouseLeave={e => { e.currentTarget.style.background = T.bgCard; e.currentTarget.style.color = T.textMid }}>
            <Icon name="edit" size={14} />
          </button>
          <button onClick={() => onDelete(sm.nome)} aria-label="Elimina" style={iconBtn(true)}
            onMouseEnter={e => { e.currentTarget.style.background = T.brandLight; e.currentTarget.style.color = T.brand; e.currentTarget.style.borderColor = 'rgba(110,14,26,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = T.bgCard; e.currentTarget.style.color = T.textSoft; e.currentTarget.style.borderColor = T.border }}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {/* Pannello: breakdown costo - header con totale, righe incolonnate con
          quantità/barra/costo/% perfettamente allineati. Numeri tabular ovunque,
          whiteSpace nowrap per evitare a-capo nelle celle strette. */}
      {tab === 'ingredienti' && (
        <div style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgSubtle, padding: isMobile ? '14px 16px' : '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Composizione del costo del batch</div>
            <div style={{ fontSize: typo.small.fontSize, color: T.textMid, ...TNUM, whiteSpace: 'nowrap' }}>Totale <b style={{ color: T.text, fontWeight: 800 }}>{fmtKg(fc)}</b></div>
          </div>
          {righe.length === 0 ? (
            <div style={{ fontSize: typo.small.fontSize, color: T.textSoft }}>Nessun ingrediente con quantità.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {righe.map((ing, j) => {
                const pctCosto = fc > 0 ? (ing.costo / fc * 100) : 0
                return (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, fontSize: typo.small.fontSize, minHeight: 28 }}>
                    <span style={{ flex: isMobile ? '0 0 38%' : '0 0 30%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: ing.mancante ? T.amber : T.text, fontWeight: j === 0 ? 700 : 600, textTransform: 'capitalize' }}>
                      {ing.nome}{ing.isSemilavorato ? ' (semilav.)' : ''}{ing.mancante ? ' · n/d' : ''}
                    </span>
                    <span style={{ flex: '0 0 60px', textAlign: 'right', ...TNUM, color: T.textSoft, fontSize: typo.small.fontSize, whiteSpace: 'nowrap' }}>{Math.round(ing.qty).toLocaleString('it-IT', { useGrouping: 'always' })} g</span>
                    <span style={{ flex: 1, height: 7, background: T.bgCard, borderRadius: 4, overflow: 'hidden', minWidth: 24 }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pctCosto)}%`, background: j === 0 ? T.brand : 'rgba(110,14,26,0.45)', transition: 'width 240ms ease' }} />
                    </span>
                    <span style={{ flex: '0 0 72px', textAlign: 'right', ...TNUM, color: T.text, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtKg(ing.costo)}</span>
                    <span style={{ flex: '0 0 44px', textAlign: 'right', ...TNUM, color: T.textSoft, fontSize: typo.small.fontSize, fontWeight: 600, whiteSpace: 'nowrap' }}>{pctCosto.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          )}
          {mancanti.length > 0 && (
            <div style={{ marginTop: 12, padding: '8px 11px', background: C.amberLight, borderRadius: 8, fontSize: typo.small.fontSize, color: C.amber, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="warning" size={13} /> Prezzi mancanti: {mancanti.map(m => m.nome).join(', ')} - il costo è sottostimato.
            </div>
          )}
        </div>
      )}

      {/* Pannello: dove è usato */}
      {tab === 'usato' && (
        <div style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgSubtle, padding: isMobile ? '14px 16px' : '16px 20px' }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Usato in {sm.nUsi} {sm.nUsi === 1 ? 'prodotto' : 'prodotti'}
          </div>
          {sm.usato.length === 0 ? (
            <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, lineHeight: 1.5 }}>
              Questo semilavorato non è ancora ingrediente di nessuna {LEX?.ricetta || 'ricetta'}. Aggiungi il suo nome (es. <em>"{sm.nome.toLowerCase()}"</em>) come ingrediente in un prodotto per usarlo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sm.usato.map(u => (
                <div key={u.nome} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.full, fontSize: typo.small.fontSize }}>
                  <span style={{ fontWeight: 600, color: T.text, textTransform: 'capitalize' }}>{u.nome.toLowerCase()}</span>
                  <span style={{ ...TNUM, color: T.textSoft, fontSize: typo.small.fontSize }}>{Math.round(u.qty).toLocaleString('it-IT', { useGrouping: 'always' })} g</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function tabBtn(active, isMobile) {
  return {
    padding: '10px 12px', minHeight: 40, borderRadius: R.md, border: `1px solid ${active ? T.brand : T.border}`,
    background: active ? T.brandLight : 'transparent', fontSize: typo.small.fontSize, fontWeight: 600,
    color: active ? T.brand : T.textMid, cursor: 'pointer', letterSpacing: '-0.005em',
    display: 'inline-flex', alignItems: 'center', gap: 5, flex: isMobile ? 1 : 'none', justifyContent: 'center',
    transition: `background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}`,
  }
}
function iconBtn(danger) {
  return {
    width: 40, height: 40, padding: 0, borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard,
    color: danger ? T.textSoft : T.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}`,
  }
}

// ─── SEMILAVORATI VIEW ────────────────────────────────────────────────────────
export default function SemilavoratiView({ ricettario, onSave, notify, tipoAttivita }) {
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])

  // Ricette che l'azienda usa come ingrediente senza averle dichiarate basi.
  // Audit 2026-09-09: BASE BIANCA e' usata in 15 ricette del ricettario di Mara
  // ma non ha tipo 'semilavorato', quindi calcolaFC ne prende il costo dal
  // listino (2,31 EUR/kg) invece che dalla sua ricetta (1,62 EUR/kg). Questa
  // pagina, che elenca solo chi ha già il tipo giusto, diceva "1 base interna"
  // e "Il più usato: nessun utilizzo" mentre la base della gelateria era
  // altrove e costava il 42% in più del dovuto.
  const basiDaDichiarare = useMemo(
    () => trovaBasiNonDichiarate(ricettario, ingCosti),
    [ricettario, ingCosti])
  const [candidatiAperti, setCandidatiAperti] = useState(false)

  // ── Modello dati arricchito: costo, peso, reverse-lookup "dove è usato" ──────
  const semilavorati = useMemo(() => {
    const ricette = ricettario?.ricette || {}
    const semi = Object.values(ricette).filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo === 'semilavorato')

    // Reverse lookup: per ogni semilavorato, trova le ricette che lo contengono
    // come ingrediente. Match per nome normalizzato (chiave o ric.nome).
    return semi.map(ric => {
      const nomeKeyNorm = normIng((ric.nome || '').toLowerCase())
      const usato = []
      for (const r of Object.values(ricette)) {
        if (r.nome === ric.nome) continue
        if (!isRicettaValida(r.nome)) continue
        for (const ing of (r.ingredienti || [])) {
          if (normIng((ing.nome || '').toLowerCase()) === nomeKeyNorm) {
            usato.push({ nome: r.nome, qty: ing.qty1stampo || 0 })
            break
          }
        }
      }
      usato.sort((a, b) => b.qty - a.qty)

      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      // Il peso è la RESA dichiarata, non la somma degli ingredienti.
      //
      // Una base che cuoce perde acqua: 1.100 g di ingredienti possono dare
      // 1.000 g di crema. Dividendo il costo per la somma degli ingredienti,
      // il costo al chilo usciva più BASSO del vero — e questo è il numero su
      // cui si decide se una base conviene farla o comprarla. `resaGrammi`
      // usa la resa scritta dall'utente e ricade sulla somma solo se non c'è.
      // Lo stesso errore era già stato corretto nei formati di vendita a
      // luglio, ma qui era rimasto.
      const peso = resaGrammi(ric)
      const costoKg = peso > 0 ? (fc / peso * 1000) : 0
      return { ric, nome: ric.nome, fc, peso, costoKg, usato, nUsi: usato.length }
    })
  }, [ricettario, ingCosti])

  // ── Diagnosi ──────────────────────────────────────────────────────────────────
  const diag = useMemo(() => {
    const n = semilavorati.length
    const validi = semilavorati.filter(s => s.costoKg > 0)
    const costoMedioKg = validi.length ? validi.reduce((s, x) => s + x.costoKg, 0) / validi.length : 0
    const piuUsato = semilavorati.reduce((best, s) => (!best || s.nUsi > best.nUsi) ? s : best, null)
    const piuCaro = validi.reduce((best, s) => (!best || s.costoKg > best.costoKg) ? s : best, null)
    // Audit 2026-09-09: i semilavorati a costo 0 (ingredienti senza prezzo) sono
    // esclusi giustamente dalla media e da "il più caro", ma nessuno lo diceva:
    // la media sembrava riguardare tutte le basi. Ora il KPI può dichiararlo.
    return { n, costoMedioKg, piuUsato, piuCaro, nValidi: validi.length }
  }, [semilavorati])

  // ── Tabella ordinabile ────────────────────────────────────────────────────────
  const { sortKey, sortDir, toggleSort, sort } = useSortable('nUsi', 'desc')
  const rowsSorted = useMemo(() => sort(semilavorati, (s, k) => s[k] ?? 0), [semilavorati, sortKey, sortDir])

  // ── Stato form (logica salvataggio invariata) ────────────────────────────────
  const empty = { nome: '', note: '', resa_g: '', ingredienti: [] }
  const [form, setForm] = useState(empty)
  const [editMode, setEditMode] = useState(null)
  const [newIngNome, setNewIngNome] = useState('')
  const [newIngQty, setNewIngQty] = useState('')
  const [deleteConf, setDeleteConf] = useState(null)
  const [deletePin, setDeletePin] = useState('')
  const [overwriteConf, setOverwriteConf] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const tuttiIng = useMemo(() => {
    const s = new Set()
    for (const ric of Object.values(ricettario?.ricette || {}))
      for (const ing of (ric.ingredienti || [])) s.add(normIng(ing.nome))
    for (const k of Object.keys(PREZZI_HORECA)) s.add(k)
    return [...s].filter(k => k && k.length > 1).sort()
  }, [ricettario])

  const addIng = () => {
    if (!newIngNome.trim() || !newIngQty) return
    setForm(f => ({ ...f, ingredienti: [...f.ingredienti, { nome: newIngNome.trim(), qty1stampo: parseFloat(newIngQty) || 0, costoPerG: 0, costo1stampo: 0 }] }))
    setNewIngNome(''); setNewIngQty('')
  }
  const removeIng = i => setForm(f => ({ ...f, ingredienti: f.ingredienti.filter((_, j) => j !== i) }))

  const loadForEdit = nome => {
    const r = ricettario?.ricette?.[nome]
    if (!r) return
    setForm({ nome: r.nome, note: r.note || '', resa_g: r.resa_g ? String(r.resa_g) : '', ingredienti: r.ingredienti.map(i => ({ ...i })) })
    setEditMode(nome)
    setShowForm(true)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const [saving, setSaving] = useState(false)
  // Nome rifiutato perché appartiene a un prodotto che si vende: teniamo i
  // dettagli per poterli mostrare, invece di un "no" senza spiegazione.
  const [bloccoNome, setBloccoNome] = useState(null)

  // Quante ricette usano questo nome come ingrediente. Serve per dire cosa si
  // sta toccando: la stessa informazione che il pannello di eliminazione mostra.
  const contaUsiComeIngrediente = (nome) => {
    const k = normIng(nome)
    return Object.values(ricettario?.ricette || {})
      .filter(r => r.nome !== nome && (r.ingredienti || []).some(i => normIng(i.nome) === k))
      .length
  }
  const doSaveSemi = async () => {
    if (saving) return
    setSaving(true)
    const nomeSalvato = form.nome.trim().toUpperCase()
    // Audit 2026-09-09 ALTA: la ricetta era ricostruita da zero, quindi ogni
    // campo non elencato qui veniva PERSO al salvataggio: allergeni, categoria,
    // congelabile. Sui 7 semilavorati reali ne colpiva 3, tra cui la PASTA
    // FROLLA usata in 3 crostate, che perdeva proprio gli allergeni. Ora si
    // parte da quello che c'e' e si sovrascrivono solo i campi del form.
    // Audit 2026-09-09 (terzo giro): `[editMode || nomeSalvato]` prendeva sempre
    // la ricetta VECCHIA quando si era in modifica, anche se il nome nel form era
    // cambiato. Rinominando CREMA PASTICCERA in PASTA FROLLA (nome che esiste
    // già), i campi scritti sopra PASTA FROLLA erano quelli di CREMA PASTICCERA:
    // PASTA FROLLA perdeva i suoi allergeni ("glutine", "latte", "uova") perché
    // l'altra non ne ha. Cioè la stessa perdita di allergeni corretta stamattina,
    // che però reggeva solo finché il nome non cambiava.
    // La regola giusta: i campi da conservare sono quelli della ricetta che sta
    // AL POSTO dove stiamo scrivendo. Se lì non c'è niente, quelli di partenza.
    const destinazione = ricettario?.ricette?.[nomeSalvato]
    const partenza = editMode ? ricettario?.ricette?.[editMode] : null
    const precedente = destinazione || partenza || {}
    const nuovaRic = {
      ...precedente,
      nome: nomeSalvato,
      sheetName: precedente.sheetName || 'manuale',
      numStampi: 1, totImpasto1: 0, foodCost1: 0,
      ingredienti: form.ingredienti,
      note: form.note,
      // 0 vuol dire "non dichiarata": a valle `resaGrammi` ricade sulla somma
      // degli ingredienti.
      resa_g: Number(form.resa_g) || 0,
      tipo: 'semilavorato', unita: 0, prezzo: 0,
    }
    // Audit 2026-09-09 (secondo giro): rinominando un semilavorato la voce col
    // NOME VECCHIO restava in archivio, quindi ne comparivano due — l'originale
    // e la copia rinominata — e le ricette che usavano il nome vecchio
    // continuavano a puntare a una base che l'utente credeva di aver rinominato.
    // Ora la vecchia chiave viene rimossa nello stesso salvataggio.
    const ricetteAggiornate = { ...(ricettario?.ricette || {}) }
    if (editMode && editMode !== nuovaRic.nome) delete ricetteAggiornate[editMode]
    ricetteAggiornate[nuovaRic.nome] = nuovaRic
    const nuovoRic = { ...(ricettario || {}), ricette: ricetteAggiornate }
    // Audit 2026-07-01 HIGH: await + try/catch su onSave (potrebbe essere
    // async lato Dashboard.handleSaveRicetta), altrimenti notifichiamo "salvato"
    // mentre il DB ha rifiutato.
    try {
      await onSave(nuovoRic, {}, true)
      // Chi usava il nome vecchio ora non trova più la base: il suo food cost
      // cade sul listino ingredienti (o sparisce). Va detto subito, perché da
      // fuori il numero cambia senza spiegazione.
      const rinominato = editMode && editMode !== nuovaRic.nome
      const orfane = rinominato
        ? Object.values(ricettario?.ricette || {})
            .filter(r => r.nome !== editMode && (r.ingredienti || []).some(i => normIng(i.nome) === normIng(editMode)))
            .map(r => r.nome)
        : []
      if (orfane.length > 0) {
        notify(`"${editMode}" ora si chiama "${nuovaRic.nome}". Aggiorna l'ingrediente in: ${orfane.slice(0, 3).join(', ')}${orfane.length > 3 ? ` e altre ${orfane.length - 3}` : ''}`, false)
      } else {
        notify(`Semilavorato "${nuovaRic.nome}" salvato`)
      }
      setForm(empty); setEditMode(null); setOverwriteConf(null); setShowForm(false)
    } catch (e) {
      // Se il Dashboard ha già spiegato il problema (e detto dove sta la copia
      // locale), non lo copriamo: il toast ha un solo slot.
      if (!e?.giaNotificato) notify('Non ho potuto salvare: ' + (e?.message || 'errore di rete'), false)
    } finally { setSaving(false) }
  }
  // La ricetta che stiamo per sovrascrivere e' un prodotto che si vende (non una
  // base)? Serve al dialogo di conferma per dire cosa succede davvero.
  const sovrascriveProdottoVendibile = (() => {
    if (!overwriteConf) return false
    const r = ricettario?.ricette?.[overwriteConf]
    if (!r) return false
    const tipo = getR(overwriteConf, r).tipo
    return tipo !== 'semilavorato' && tipo !== 'interno'
  })()

  // Dichiara BASE una ricetta che l'azienda usa già come ingrediente.
  //
  // Correzione del 09/09/2026 (dal titolare): la prima versione scriveva
  // `tipo: 'semilavorato'`, cioè faceva CALCOLARE al sistema il costo dalle
  // quantità. È il modello sbagliato per una gelateria: le dosi delle basi sono
  // il segreto del laboratorio e non si caricano su un servizio online. Il
  // gelataio elenca gli ingredienti (per gli allergeni), calcola a mano quanto
  // gli costa un chilo e inserisce solo quel numero.
  // Quindi il tipo giusto è `interno`: non si vende, e il costo si legge dal
  // listino invece di essere ricavato dalle quantità.
  const dichiaraBase = async (candidato) => {
    if (saving) return
    setSaving(true)
    try {
      const r = ricettario?.ricette?.[candidato.nome]
      if (!r) { notify('Non trovo più questa ricetta, ricarica la pagina', false); return }
      const nuovoRic = {
        ...(ricettario || {}),
        ricette: {
          ...(ricettario?.ricette || {}),
          [candidato.nome]: { ...r, tipo: 'interno', unita: 0, prezzo: 0 },
        },
      }
      await onSave(nuovoRic, {}, true)
      // Se nel listino non c'è un prezzo suo, ogni ricetta che la usa la conta
      // ZERO: il food cost di quelle ricette risulta più basso del vero. Va
      // detto subito, con l'indicazione di dove si mette.
      const suo = ingCosti[normIng(candidato.nome)]
      if (!suo || suo.isStima) {
        notify(`"${candidato.nome}" ora è una base e non comparirà più tra i prodotti da vendere. Adesso scrivi quanto ti costa un chilo: aprila da Ricettario e compila "Costo al kg della base".`, false)
      } else {
        notify(`"${candidato.nome}" ora è una base: costa ${fmtKg(Number(suo.costoKg) || 0)} e non comparirà più tra i prodotti da vendere.`)
      }
    } catch (e) {
      if (!e?.giaNotificato) notify('Non ho potuto salvare: ' + (e?.message || 'errore di rete'), false)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    if (!form.nome.trim() || form.ingredienti.length === 0) { notify('Inserisci nome e almeno un ingrediente', false); return }
    const nomeUp = form.nome.trim().toUpperCase()
    const esiste = ricettario?.ricette?.[nomeUp]
    const isEditing = editMode === nomeUp
    // Audit 2026-09-09 ALTA: questa conferma accettava il nome di QUALSIASI
    // ricetta. Bastava scrivere NOCCIOLA (o CARAMELLO, o LIMONE: nomi di gusti
    // che Mara ha davvero) e confermare due parole, e il gusto diventava una
    // base: tipo 'semilavorato', prezzo e unità a zero, ingredienti sostituiti.
    // Da quel momento spariva da inventario di produzione, formati di vendita,
    // sprechi, P&L, chiusura cassa, vendite B2B, simulatore prezzi e ricettario
    // (dieci file lo escludono per tipo).
    // Spiegarlo nel dialogo non basta: la conferma resta a un clic e il gesto è
    // quello di chi sta creando una base nuova, non di chi vuole cancellare un
    // gusto. Quindi qui NON si passa: si chiede un altro nome. Per trasformare
    // davvero un prodotto in base si va sulla sua scheda, dove si vede cosa è.
    if (esiste && !isEditing) {
      const tipoEsistente = getR(nomeUp, esiste).tipo
      if (tipoEsistente !== 'semilavorato' && tipoEsistente !== 'interno') {
        const nIng = (esiste.ingredienti || []).length
        setBloccoNome({
          nome: nomeUp,
          nIng,
          usato: contaUsiComeIngrediente(nomeUp),
        })
        return
      }
      setOverwriteConf(nomeUp)
      return
    }
    doSaveSemi()
  }

  const handleDelete = async nome => {
    if (deletePin !== 'ELIMINA') { notify('Scrivi ELIMINA per confermare', false); return }
    if (saving) return
    setSaving(true)
    const nuovoRic = { ...ricettario, ricette: Object.fromEntries(Object.entries(ricettario.ricette || {}).filter(([k]) => k !== nome)) }
    try {
      await onSave(nuovoRic, {}, true)
      setDeleteConf(null); setDeletePin(''); setEditMode(null); setForm(empty)
      notify(`"${nome}" eliminato`)
    } catch (e) {
      notify('Errore eliminazione: ' + (e?.message || 'sconosciuto'), false)
    } finally { setSaving(false) }
  }

  // Live cost calc del form - Audit 2026-07-01 HIGH: usare calcolaFC con
  // ricettario per ricorrere su semilavorati nidificati (es. crema → pasta
  // frolla con sub-semilavorato). Prima sommava solo costi diretti.
  const fcLive = useMemo(() => {
    const ricFake = { nome: form.nome || 'preview', ingredienti: form.ingredienti }
    try {
      const { tot } = calcolaFC(ricFake, ingCosti, ricettario)
      return tot || 0
    } catch {
      return 0
    }
  }, [form.ingredienti, form.nome, ingCosti, ricettario])
  const pesoLive = form.ingredienti.reduce((s, i) => s + (i.qty1stampo || 0), 0)
  // Anteprima sulla resa dichiarata, come il calcolo vero: altrimenti il
  // numero nel form e quello in elenco non tornano.
  const resaLive = Number(form.resa_g) > 0 ? Number(form.resa_g) : pesoLive
  const costoKgLive = resaLive > 0 ? fcLive / resaLive * 1000 : 0

  const openNew = () => { setForm(empty); setEditMode(null); setShowForm(true); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }

  const headerAction = (
    <button onClick={openNew}
      style={{ padding: '10px 16px', borderRadius: R.md, border: 'none', background: T.brand, color: '#fff',
        fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: S.brand }}>
      <Icon name="plus" size={15} />Nuovo semilavorato
    </button>
  )

  const kpiCols = isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)'

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        subtitle="Impasti, creme e basi interne: quanto ti costano al kg e in quali prodotti finiscono."
        action={headerAction}
      />

      {/* Ricette che sono basi di fatto ma non lo dicono al sistema.
          Il food cost che ne dipende e' sbagliato finche' non lo sono. */}
      {basiDaDichiarare.length > 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${C.amber}55`, borderRadius: 14, padding: isMobile ? '14px 16px' : '16px 20px', marginBottom: 20, boxShadow: S.lg }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flexShrink: 0, marginTop: 2, color: C.amber }}><Icon name="lightbulb" size={18} /></span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em', marginBottom: 3 }}>
                {basiDaDichiarare.length === 1
                  ? `"${basiDaDichiarare[0].nome}" è una base, ma il sistema non lo sa`
                  : `${basiDaDichiarare.length} ricette sono basi, ma il sistema non lo sa`}
              </div>
              <div style={{ fontSize: typo.small.fontSize, color: C.textMid, lineHeight: 1.55 }}>
                {basiDaDichiarare.length === 1
                  ? <>La usi come ingrediente in {basiDaDichiarare[0].nUsi} ricette, ma per il sistema è ancora un prodotto da vendere: compare in produzione, in cassa e nel conto economico con un prezzo che non ha.</>
                  : <>Le usi come ingrediente in altre ricette, ma per il sistema sono ancora prodotti da vendere: compaiono in produzione, in cassa e nel conto economico con un prezzo che non hanno.</>}
              </div>
            </div>
            <button type="button" onClick={() => setCandidatiAperti(v => !v)}
              aria-expanded={candidatiAperti}
              style={{ padding: '10px 16px', minHeight: 40, borderRadius: 8, border: 'none', background: T.brand, color: '#fff', fontSize: typo.small.fontSize, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Icon name={candidatiAperti ? 'x' : 'chevDown'} size={14} />
              {candidatiAperti ? 'Chiudi' : 'Guarda quali'}
            </button>
          </div>

          {candidatiAperti && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {basiDaDichiarare.map(b => (
                <div key={b.nome} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', background: T.bgCard }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 5 }}>{b.nome}</div>
                  <div style={{ fontSize: typo.small.fontSize, color: C.textMid, lineHeight: 1.6, marginBottom: 8 }}>
                    Usata in <b>{b.nUsi} {b.nUsi === 1 ? 'ricetta' : 'ricette'}</b>: {b.usataIn.slice(0, 4).join(', ')}{b.usataIn.length > 4 ? ` e altre ${b.usataIn.length - 4}` : ''}.
                  </div>
                  {/* Il costo di una base e' quello che l'utente ha scritto nel
                      listino: e' lui a calcolarlo, perché le dosi non stanno qui.
                      Il conto sulle quantita' serve solo come CONTROLLO per chi
                      le ha caricate: se i due numeri sono lontani, uno dei due va
                      rivisto. Non proponiamo di sostituire il suo prezzo. */}
                  {b.costoKgDaListino != null ? (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: C.text, background: C.bgSubtle, borderRadius: 6, padding: '5px 9px', ...TNUM }}>
                        costo che hai scritto: {fmtKg(b.costoKgDaListino)}
                      </span>
                      {b.costoKgDaRicetta > 0 && Math.abs(b.differenzaKg) > b.costoKgDaListino * 0.15 && (
                        <span style={{ fontSize: typo.small.fontSize, color: C.amber, lineHeight: 1.5 }}>
                          sommando le quantità che hai caricato verrebbe {fmtKg(b.costoKgDaRicetta)}: controlla quale dei due è aggiornato
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: typo.small.fontSize, color: C.amber, lineHeight: 1.55, marginBottom: 8 }}>
                      Non hai ancora scritto quanto ti costa un chilo di questa base: finché manca,
                      ogni ricetta che la usa la conta zero e il suo food cost risulta più basso del vero.
                    </div>
                  )}
                  {b.autoCiclo && (
                    <div style={{ fontSize: typo.small.fontSize, color: C.amber, lineHeight: 1.55, marginBottom: 8 }}>
                      Attenzione: fra i suoi ingredienti c'è una riga con lo stesso nome — la versione
                      comprata, non questa ricetta. Quella riga continuerà a costare come da listino,
                      ed è giusto: è un prodotto diverso che si chiama uguale.
                    </div>
                  )}
                  {b.costoIncompleto && (
                    <div style={{ fontSize: typo.small.fontSize, color: C.amber, lineHeight: 1.55, marginBottom: 8 }}>
                      Dentro questa ricetta manca il prezzo di {b.mancanti.slice(0, 3).join(', ')}: il costo che vedi è più basso del vero.
                    </div>
                  )}
                  <button type="button" onClick={() => dichiaraBase(b)} disabled={saving}
                    style={{ padding: '10px 16px', minHeight: 40, borderRadius: 8, border: 'none', background: saving ? C.borderStr : T.brand, color: '#fff', fontSize: typo.small.fontSize, fontWeight: 800, cursor: saving ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="package" size={14} /> Dichiarala base
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ① DIAGNOSI */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: isMobile ? 10 : 16, marginBottom: 26 }}>
        <KPI icon={<Icon name="package" size={18} />} label="Semilavorati" value={String(diag.n)}
          sub={diag.n === 1 ? 'base interna' : 'basi interne'} />
        <KPI icon={<Icon name="receipt" size={18} />} label="Costo medio / kg"
          value={diag.nValidi === 0 ? '—' : fmtKg(diag.costoMedioKg)}
          color={diag.nValidi === 0 ? T.textSoft : T.brand}
          sub={diag.nValidi === 0
            ? 'serve il prezzo degli ingredienti'
            : diag.nValidi < diag.n
              ? `su ${diag.nValidi} ${diag.nValidi === 1 ? 'base' : 'basi'} di ${diag.n}: le altre non hanno tutti i prezzi`
              : 'materie prime'} />
        <KPI icon={<Icon name="barChart" size={18} />} label="Il più usato"
          value={diag.piuUsato && diag.piuUsato.nUsi > 0 ? `${diag.piuUsato.nUsi}×` : '-'}
          sub={diag.piuUsato && diag.piuUsato.nUsi > 0 ? diag.piuUsato.nome : 'nessun utilizzo'} />
        <KPI icon={<Icon name="trendUp" size={18} />} label="Il più caro" color={T.brand}
          value={diag.piuCaro ? fmtKg(diag.piuCaro.costoKg) : '-'}
          sub={diag.piuCaro ? `${diag.piuCaro.nome} · al kg` : 'serve un prezzo'} />
      </div>

      {/* Empty state */}
      {semilavorati.length === 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, padding: isMobile ? '36px 20px' : '56px 24px', textAlign: 'center', boxShadow: SHADOW_PREMIUM, marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: T.brandLight, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.brand, marginBottom: 14 }}>
            <Icon name="package" size={28} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6, letterSpacing: '-0.01em' }}>Nessun semilavorato</div>
          <div style={{ fontSize: 13, color: T.textSoft, maxWidth: 360, margin: '0 auto 18px', lineHeight: 1.5 }}>
            Aggiungi basi interne come crema pasticcera, pasta frolla o fruit curd: ne calcoli il costo al kg e vedi in quali prodotti le usi.
          </div>
          {headerAction}
        </div>
      )}

      {/* ② LISTA PREMIUM */}
      {semilavorati.length > 0 && (
        <>
          <SH sub="Apri 'Costo' per la composizione, 'Dove' per i prodotti che lo usano.">I tuoi semilavorati</SH>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {semilavorati.map(sm => (
              <React.Fragment key={sm.nome}>
                <SemiCard sm={sm} ricettario={ricettario} ingCosti={ingCosti}
                  onEdit={loadForEdit} onDelete={n => setDeleteConf(n)} LEX={LEX} />
                {deleteConf === sm.nome && (
                  <div style={{ padding: '12px 16px', background: C.redLight, borderRadius: 12, border: `1px solid rgba(110,14,26,0.25)` }}>
                    <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: C.red, marginBottom: 8 }}>Scrivi <strong>ELIMINA</strong> per confermare l'eliminazione di "{sm.nome}"</div>
                    {sm.nUsi > 0 && (
                      <div style={{ fontSize: typo.small.fontSize, color: C.red, marginBottom: 8, padding: '6px 10px', background: '#FEF3F2', border: '1px dashed rgba(110,14,26,0.4)', borderRadius: 6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Icon name="warning" size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span>Questo semilavorato è usato in <strong>{sm.nUsi} {sm.nUsi === 1 ? 'ricetta' : 'ricette'}</strong>. Eliminandolo, quelle ricette troveranno l&rsquo;ingrediente &ldquo;{sm.nome}&rdquo; senza ricetta sorgente (il food cost potrebbe risultare diverso).</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input value={deletePin} onChange={e => setDeletePin(e.target.value)} placeholder="ELIMINA"
                        style={{ flex: 1, minWidth: 120, padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13 }} />
                      <button onClick={() => handleDelete(sm.nome)}
                        style={{ padding: '8px 14px', background: C.red, color: '#fff', border: 'none', borderRadius: 8, fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer' }}>Conferma</button>
                      <button onClick={() => { setDeleteConf(null); setDeletePin('') }}
                        style={{ padding: '8px 12px', background: C.white, color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: typo.small.fontSize, cursor: 'pointer' }}>Annulla</button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* ③ TABELLA ORDINABILE */}
          <SH sub="Ordina per costo, peso o numero di utilizzi.">Riepilogo</SH>
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: SHADOW_PREMIUM, marginBottom: 28 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}>Semilavorato</SortTH>
                    <SortTH k="peso" active={sortKey === 'peso'} dir={sortDir} onToggle={toggleSort} right tip="Peso totale dell'impasto/batch">Peso batch</SortTH>
                    <SortTH k="fc" active={sortKey === 'fc'} dir={sortDir} onToggle={toggleSort} right tip="Costo materie prime dell'intero batch">Costo batch</SortTH>
                    <SortTH k="costoKg" active={sortKey === 'costoKg'} dir={sortDir} onToggle={toggleSort} right tip="Costo per chilo di semilavorato">Costo / kg</SortTH>
                    <SortTH k="nUsi" active={sortKey === 'nUsi'} dir={sortDir} onToggle={toggleSort} right tip="In quanti prodotti finiti è usato">Usato in</SortTH>
                  </tr>
                </thead>
                <tbody>
                  {rowsSorted.map((s, i) => (
                    <tr key={s.nome} style={{ borderTop: i ? `1px solid ${T.borderSoft}` : 'none' }}>
                      <td style={{ padding: '11px 16px', fontWeight: 700, color: T.text, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span title={s.nome}>{s.nome}</span>
                      </td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', ...TNUM, color: T.textMid, whiteSpace: 'nowrap' }}>{fmtPeso(s.peso)}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', ...TNUM, color: T.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtBatch(s.fc)}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 700, whiteSpace: 'nowrap' }}>{s.costoKg > 0 ? fmtKg(s.costoKg) : '-'}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', ...TNUM, whiteSpace: 'nowrap' }}>
                        {s.nUsi > 0
                          ? <span style={{ fontWeight: 700, color: T.text }}>{s.nUsi} {s.nUsi === 1 ? 'prodotto' : 'prodotti'}</span>
                          : <span style={{ color: T.textSoft }}>-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ④ FORM NUOVO / MODIFICA */}
      {(showForm || editMode) && (
        <>
          <SH>{editMode ? `Modifica: ${editMode}` : 'Nuovo semilavorato'}</SH>

          {/* Foto rapida - sopra il form */}
          <div style={{ marginBottom: 12 }}>
            <FotoOCR mode="ricetta" notify={notify} ricettario={ricettario} onResult={res => {
              const SKIP = ['ingrediente', 'ingredient', 'ingredienti', 'nome ingrediente in minuscolo', 'n/d', 'nan', 'undefined', '']
              const UNIT_G = { g: 1, gr: 1, grammi: 1, grammo: 1, kg: 1000, chilo: 1000, chilogrammo: 1000,
                ml: 1, millilitri: 1, l: 1000, litro: 1000, litri: 1000, cl: 10, centilitri: 10, dl: 100, decilitri: 100,
                cucchiaio: 15, cucchiai: 15, tbsp: 15, cucchiaino: 5, cucchiaini: 5, tsp: 5,
                tazza: 240, cup: 240, tazze: 240, bicchiere: 200, bicchieri: 200,
                noce: 15, pizzico: 2, pizzichi: 2, qb: 0, pz: 1 }
              const toGrams = (i) => {
                if (i.qty != null && i.qty !== '') return parseFloat(i.qty) || 0
                const q = parseFloat(i.quantita) || 0
                const u = (i.unita || 'g').toLowerCase().trim()
                return Math.round(q * (UNIT_G[u] ?? 1))
              }
              const ings = (res.ingredienti || [])
                .map(i => ({ nome: translateIngredienteEN((i.nome || '').toLowerCase().trim()), qty1stampo: toGrams(i), costoPerG: 0, costo1stampo: 0 }))
                .filter(i => !SKIP.includes(i.nome.toLowerCase().trim()) && i.qty1stampo > 0)
              const nomeIT = (translateProdottoEN(res.nome || '') || '').toUpperCase()
              setForm(f => ({ ...f, nome: nomeIT || f.nome, note: res.note || f.note, ingredienti: ings.length > 0 ? ings : f.ingredienti }))
              if (ings.length > 0) notify(`Importato: ${nomeIT || 'semilavorato'} con ${ings.length} ingredienti`)
              else notify('Nessun ingrediente valido estratto dalla foto', false)
            }} />
          </div>

          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, padding: isMobile ? 18 : 22, boxShadow: SHADOW_PREMIUM }}>
            {/* Template rapidi */}
            {!editMode && !form.nome && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="bolt" size={12} /> Template rapidi</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { nome: 'CREMA PASTICCERA', note: 'Mescola latte+uova+zucchero+amido. Cuoci a fuoco medio.', ings: [{ nome: 'latte intero', q: 500 }, { nome: 'tuorlo', q: 100 }, { nome: 'zucchero', q: 150 }, { nome: 'amido di mais', q: 40 }, { nome: 'bacca di vaniglia', q: 3 }] },
                    { nome: 'FRUIT PER CROSTATE', note: 'Riduzione frutta fresca con zucchero.', ings: [{ nome: 'fragola', q: 300 }, { nome: 'zucchero', q: 80 }, { nome: 'succo di limone', q: 20 }, { nome: 'pectina', q: 5 }] },
                    { nome: 'PASTA FROLLA', note: 'Impasto base per crostate e biscotti.', ings: [{ nome: 'farina 00', q: 300 }, { nome: 'burro', q: 150 }, { nome: 'zucchero a velo', q: 100 }, { nome: 'tuorlo', q: 40 }, { nome: 'scorza di limone', q: 3 }] },
                  ].map(t => (
                    <button key={t.nome} onClick={() => setForm({ nome: t.nome, note: t.note, ingredienti: t.ings.map(i => ({ nome: i.nome, qty1stampo: i.q, costoPerG: 0, costo1stampo: 0 })) })}
                      style={{ padding: '6px 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgSubtle, color: T.textMid, fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {t.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 2fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Nome</div>
                  <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value.toUpperCase() }))}
                    placeholder="es. CREMA PASTICCERA"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, fontWeight: 700, color: C.text, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Note</div>
                  <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="es. 180°C per 30 min"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, color: C.text, boxSizing: 'border-box' }} />
                </div>
                {/* La resa mancava, e non era un dettaglio: una base che cuoce
                    perde acqua (1.100 g di ingredienti danno 1.000 g di
                    crema). Senza la resa il costo al chilo si calcolava sulla
                    somma degli ingredienti e usciva più BASSO del vero — ed è
                    il numero su cui si decide se una base conviene farla o
                    comprarla. Da qui non si poteva scrivere: si poteva solo
                    dalla pagina delle ricette. */}
                <div>
                  <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Resa (g)</div>
                  <input type="number" inputMode="decimal" min="0" step="10"
                    value={form.resa_g} onChange={e => setForm(f => ({ ...f, resa_g: e.target.value }))}
                    placeholder={pesoLive > 0 ? String(Math.round(pesoLive)) : 'g'}
                    title="Quanto viene fuori a fine lavorazione. Se cuocendo perde acqua è meno della somma degli ingredienti. Lasciandolo vuoto uso la somma."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, color: C.text, boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
                </div>
              </div>

              {/* Ingredienti */}
              <div>
                <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Ingredienti ({form.ingredienti.length})</div>
                {form.ingredienti.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 11px', background: T.bgSubtle, borderRadius: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: typo.small.fontSize, color: T.text, fontWeight: 600, textTransform: 'capitalize' }}>{ing.nome}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.brand, ...TNUM }}>{ing.qty1stampo} g</span>
                      <button aria-label="Rimuovi ingrediente" onClick={() => removeIng(i)} style={{ background: 'none', border: 'none', color: T.textSoft, cursor: 'pointer', display: 'inline-flex', padding: 2 }}><Icon name="x" size={13} /></button>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <div style={{ flex: isMobile ? '1 1 100%' : 2 }}>
                    <input value={newIngNome}
                      onChange={e => setNewIngNome(e.target.value)}
                      onKeyDown={onEnterAutoComplete(tuttiIng, newIngNome, setNewIngNome, () => { if (newIngQty) addIng() })}
                      placeholder="ingrediente" list="semi-ing-list"
                      style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, boxSizing: 'border-box' }} />
                    <datalist id="semi-ing-list">{tuttiIng.map(k => <option key={k} value={k} />)}</datalist>
                  </div>
                  <div style={{ flex: 1, minWidth: isMobile ? 100 : 'auto' }}>
                    <input type="number" inputMode="decimal" min="0" value={newIngQty} onChange={e => setNewIngQty(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addIng()}
                      placeholder="g"
                      style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={addIng} style={{ padding: '11px 14px', minHeight: 44, background: T.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, flex: isMobile ? 1 : 'none', justifyContent: 'center' }}><Icon name="plus" size={14} />Aggiungi</button>
                </div>
              </div>

              {/* Live preview */}
              {form.ingredienti.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: 10 }}>
                  {[
                    { lbl: 'Peso batch', val: fmtPeso(pesoLive), c: T.text },
                    { lbl: 'Costo batch', val: fmtBatch(fcLive), c: T.brand },
                    { lbl: 'Costo / kg', val: costoKgLive > 0 ? fmtKg(costoKgLive) : '-', c: T.brand },
                  ].map(({ lbl, val, c }) => (
                    <div key={lbl} style={{ padding: '10px 12px', background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                      <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{lbl}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: c, ...TNUM }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {bloccoNome && (
                <div style={{ padding: '12px 14px', background: C.redLight, border: `2px solid ${C.red}`, borderRadius: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: typo.small.fontSize, fontWeight: 800, color: C.red, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="warning" size={14} /> "{bloccoNome.nome}" è un prodotto che vendi, non una base
                  </div>
                  <div style={{ fontSize: typo.small.fontSize, color: C.textMid, lineHeight: 1.55, marginBottom: 9 }}>
                    Ha {bloccoNome.nIng === 1 ? 'un ingrediente' : `${bloccoNome.nIng} ingredienti`}
                    {bloccoNome.usato > 0 && <> ed è usato in {bloccoNome.usato} {bloccoNome.usato === 1 ? 'ricetta' : 'ricette'}</>}.
                    Salvandolo come base perderebbe prezzo e unità, e sparirebbe da inventario, cassa, formati di vendita e conto economico.
                    <b> Scegli un altro nome.</b> Se vuoi davvero trasformarlo in una base, fallo dalla sua scheda nel ricettario, dove vedi cosa stai cambiando.
                  </div>
                  <button onClick={() => setBloccoNome(null)}
                    style={{ padding: '9px 14px', minHeight: 40, background: C.white, border: `1px solid ${C.borderStr}`, borderRadius: 8, fontSize: typo.small.fontSize, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>
                    Ho capito, cambio nome
                  </button>
                </div>
              )}

              {overwriteConf && (
                <div style={{ padding: '12px 14px', background: C.amberLight, border: `2px solid ${C.amber}`, borderRadius: 10 }}>
                  {/* Audit 2026-09-09: il dialogo diceva solo "esiste già -
                      sovrascrivere?" e accettava il nome di QUALSIASI ricetta.
                      Confermando, un prodotto che si vende diventa
                      tipo:'semilavorato' con unita 0 e prezzo 0, e da quel
                      momento sparisce da produzione, cassa, P&L, formati
                      vendita, sprechi, vendite B2B e simulatore prezzi (dieci
                      file lo escludono per tipo). Il dialogo di eliminazione
                      spiega le conseguenze, questo no. */}
                  <div style={{ fontSize: typo.small.fontSize, fontWeight: 800, color: C.amber, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="warning" size={14} /> "{overwriteConf}" esiste già
                  </div>
                  <div style={{ fontSize: typo.small.fontSize, color: C.textMid, lineHeight: 1.55, marginBottom: 9 }}>
                    {sovrascriveProdottoVendibile
                      ? <>È un <b>prodotto che vendi</b>, non una base. Se continui diventa un semilavorato: sparisce dalla produzione, dalla cassa, dai formati di vendita e dal conto economico, e il suo prezzo di vendita va a zero. Se volevi creare una base nuova, cambia nome.</>
                      : <>Il contenuto della base verrà sostituito con quello che hai scritto qui. Gli ingredienti di prima non si recuperano.</>}
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={doSaveSemi} disabled={saving} style={{ padding: '10px 14px', minHeight: 40, background: saving ? C.border : C.amber, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: typo.small.fontSize, cursor: saving ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="checkCircle" size={14} /> Sovrascrivi</button>
                    <button onClick={() => setOverwriteConf(null)} style={{ padding: '8px 12px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: typo.small.fontSize, color: C.textMid, cursor: 'pointer' }}>Annulla</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handleSave} disabled={saving}
                  style={{ flex: 1, minWidth: 200, padding: '12px', background: saving ? C.borderStr : T.brand, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: saving ? 'default' : 'pointer', boxShadow: S.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Icon name="save" size={15} /> {saving ? 'Salvo…' : (editMode ? 'Aggiorna semilavorato' : 'Salva semilavorato')}
                </button>
                <button onClick={() => { setEditMode(null); setForm(empty); setShowForm(false); setOverwriteConf(null) }}
                  style={{ padding: '12px 16px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {editMode ? 'Annulla modifica' : 'Chiudi'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, padding: '11px 14px', background: T.brandLight, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: typo.small.fontSize, color: T.textMid, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
            <Icon name="bulb" size={14} color={T.brand} style={{ marginTop: 2, flexShrink: 0 }} /><span>Per usare un semilavorato in una {LEX.ricetta}, aggiungi il suo nome come ingrediente (es. <em>"crema pasticcera"</em>) con la quantità in grammi - il costo si calcola automaticamente.</span>
          </div>
        </>
      )}
    </div>
  )
}
