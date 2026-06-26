// Calendario operativo - pagina di DIAGNOSI → CAPISCI → AGISCI (POV proprietario).
// 1) Banda diagnosi del mese (solo titolare): copertura %, semaforo, streak, anomalie.
// 2) Griglia calendario premium: ogni cella con indicatori produzione/cassa + colore stato.
// 3) Pannello dettaglio giorno premium: dati produzione/cassa + link alle sezioni + nota.
//
// VINCOLO: per i dipendenti prodMap/cassaMap includono SOLO oggi/futuro e le
// statistiche storiche (completati/streak/anomalie) sono nascoste.

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { useIsTablet } from '../lib/useIsMobile'

const GIORNI  = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom']
const MESI    = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// Palette stato (verde/ambra/rosso = semaforo food cost coerente con le altre view)
const STATUS = { completo: T.green, parziale: T.amber, vuoto: T.red }

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

export default function CalendarioOperativo({ giornaliero, chiusure, orgId, sedeId, setView, notify, isMobile, isDipendente = false }) {
  const isTablet  = useIsTablet()
  const oggi      = useMemo(() => new Date(), [])
  const oggiStr   = useMemo(() => toISO(oggi), [oggi])
  const [anno, setAnno]   = useState(oggi.getFullYear())
  const [mese, setMese]   = useState(oggi.getMonth())
  const [sel, setSel]     = useState(null)      // selected date string
  const [note, setNote]   = useState({})        // { "YYYY-MM-DD": "testo" }
  const [notaEdit, setNotaEdit] = useState('')
  const [savingNota, setSavingNota] = useState(false)
  const [noteErr, setNoteErr] = useState(false) // table might not exist yet

  // ── lookup maps ──────────────────────────────────────────────────────────────
  // Per i DIPENDENTI: niente info dei giorni passati → includo solo oggi/futuro.
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

  // ── load notes for current month ────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return
    const from = `${anno}-${String(mese+1).padStart(2,'0')}-01`
    const to   = `${anno}-${String(mese+1).padStart(2,'0')}-${new Date(anno,mese+1,0).getDate()}`
    supabase.from('note_giornaliere')
      .select('data, nota')
      .eq('organization_id', orgId)
      .gte('data', from).lte('data', to)
      .then(({ data, error }) => {
        if (error) { setNoteErr(true); return }
        if (data) {
          const map = {}
          data.forEach(n => { map[n.data] = n.nota || '' })
          setNote(map)
        }
      })
  }, [orgId, sedeId, anno, mese])

  // ── calendar grid ─────────────────────────────────────────────────────────
  const grid = useMemo(() => buildGrid(anno, mese), [anno, mese])

  // ── diagnosi del mese (solo titolare) ───────────────────────────────────────
  const diag = useMemo(() => {
    const daysInM = new Date(anno, mese+1, 0).getDate()
    let completi = 0, totPassati = 0, soloProd = 0, soloCassa = 0, vuoti = 0, incasso = 0
    for (let d = 1; d <= daysInM; d++) {
      const k = `${anno}-${String(mese+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      if (k > oggiStr) break
      totPassati++
      const hp = !!prodMap[k], hc = !!cassaMap[k]
      if (hp && hc) completi++
      else if (hp && !hc) soloProd++
      else if (!hp && hc) soloCassa++
      else vuoti++
      if (cassaMap[k]?.kpi?.totV != null) incasso += Number(cassaMap[k].kpi.totV) || 0
    }
    // streak: giorni completi consecutivi che finiscono a/prima di oggi
    let streak = 0
    const day = new Date(oggi)
    for (let i = 0; i < 366; i++) {
      const k = toISO(day)
      if (k > oggiStr) { day.setDate(day.getDate()-1); continue }
      if (prodMap[k] && cassaMap[k]) { streak++; day.setDate(day.getDate()-1) }
      else if (k === oggiStr) { day.setDate(day.getDate()-1) } // oggi può essere ancora in corso
      else break
    }
    // anomalie = giorni passati con produzione senza cassa o cassa senza produzione
    const anomalie = soloProd + soloCassa
    const pct = totPassati > 0 ? Math.round(completi/totPassati*100) : 0
    return { completi, totPassati, soloProd, soloCassa, vuoti, anomalie, streak, pct, incasso }
  }, [prodMap, cassaMap, anno, mese, oggiStr, oggi])

  const semaforo = diag.pct >= 80 ? T.green : diag.pct >= 50 ? T.amber : T.red

  // ── navigation ───────────────────────────────────────────────────────────
  const prev = () => { setSel(null); if (mese===0){setMese(11);setAnno(a=>a-1)} else setMese(m=>m-1) }
  const next = () => { setSel(null); if (mese===11){setMese(0);setAnno(a=>a+1)} else setMese(m=>m+1) }
  const goOggi = () => { setSel(null); setAnno(oggi.getFullYear()); setMese(oggi.getMonth()) }
  const isMeseCorrente = anno === oggi.getFullYear() && mese === oggi.getMonth()

  // Toggle: ri-cliccare lo stesso giorno chiude il dettaglio.
  const handleDay = useCallback((dateStr) => {
    setSel(prev => {
      if (prev === dateStr) return null
      setNotaEdit(note[dateStr] || '')
      return dateStr
    })
  }, [note])

  // ── save note ─────────────────────────────────────────────────────────────
  const handleSalvaNota = async () => {
    if (!orgId || !sel) return
    setSavingNota(true)
    try {
      // SELECT first to handle NULL sede_id properly with upsert
      const q = supabase.from('note_giornaliere')
        .select('id').eq('organization_id', orgId).eq('data', sel)
      if (sedeId) q.eq('sede_id', sedeId); else q.is('sede_id', null)
      const { data: ex } = await q.maybeSingle()
      const payload = { organization_id: orgId, sede_id: sedeId || null, data: sel, nota: notaEdit.trim() || null }
      let saveError
      if (ex) {
        const { error } = await supabase.from('note_giornaliere').update({ nota: payload.nota }).eq('id', ex.id)
        saveError = error
      } else {
        const { error } = await supabase.from('note_giornaliere').insert(payload)
        saveError = error
      }
      if (saveError) throw saveError
      setNote(prev => ({ ...prev, [sel]: notaEdit.trim() }))
      notify?.('Nota salvata')
    } catch (e) {
      notify?.(e.message, false)
    } finally { setSavingNota(false) }
  }

  // ── status di un giorno ─────────────────────────────────────────────────────
  function getStatus(k, cur) {
    if (!cur) return null
    if (k > oggiStr) return 'futuro'
    const hp = !!prodMap[k], hc = !!cassaMap[k]
    if (hp && hc) return 'completo'
    if (hp || hc) return 'parziale'
    return 'vuoto'
  }

  // ── selected day detail ───────────────────────────────────────────────────
  const selDetail = sel ? {
    haProd:    !!prodMap[sel],
    haCassa:   !!cassaMap[sel],
    prodD:     prodMap[sel],
    cassaD:    cassaMap[sel],
    isFuture:  sel > oggiStr,
    isToday:   sel === oggiStr,
    isAnomalia: sel <= oggiStr && sel !== oggiStr && (!!prodMap[sel] !== !!cassaMap[sel]),
  } : null

  // ── mobile list: tutti i giorni del MESE selezionato (anno+mese), in ordine
  // CRESCENTE 1→N. Audit 2026-06-25: l'utente legge il calendario come si fosse
  // su carta (dal 1 in poi), non in ordine inverso "ultimo giorno prima".
  const mobileList = useMemo(() => {
    const daysInM = new Date(anno, mese+1, 0).getDate()
    const days = []
    for (let d = 1; d <= daysInM; d++) {
      days.push(`${anno}-${String(mese+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
    }
    return days
  }, [anno, mese])

  // Render del pannello dettaglio giorno - estratto in funzione così
  // su mobile possiamo inserirlo INLINE subito sotto la card cliccata
  // (audit 2026-06-24: prima compariva in fondo alla lista e non si capiva
  // dove fosse). Su desktop resta in colonna laterale sticky.
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
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.3, textTransform: 'capitalize' }}>
              {new Date(sel+'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {selDetail.isToday && <span style={{ fontSize: 9, fontWeight: 800, color: T.brand, background: T.brandLight, borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>OGGI</span>}
              {selDetail.isFuture && <span style={{ fontSize: 9, fontWeight: 700, color: T.textSoft, background: T.bgSubtle, borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>IN ARRIVO</span>}
              {selDetail.isAnomalia && (
                <span style={{ fontSize: 9, fontWeight: 800, color: T.amber, background: T.amberLight, borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="warning" size={10} /> ANOMALIA
                </span>
              )}
            </div>
          </div>
          <button aria-label="Chiudi dettaglio" onClick={()=>setSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSoft, padding: 2, lineHeight: 1, display: 'inline-flex' }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Sezioni produzione / cassa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { icon: 'package', label: 'Produzione', has: selDetail.haProd, view: 'giornaliero',
              sub: selDetail.prodD
                ? `${selDetail.prodD.prodotti?.length || 0} prodotti · ${eur0(selDetail.prodD.ricavoTot || 0)} stim.`
                : null },
            { icon: 'receipt', label: 'Cassa', has: selDetail.haCassa, view: 'chiusura',
              sub: selDetail.cassaD?.kpi?.totV != null
                ? `${eur2(selDetail.cassaD.kpi.totV)} incasso${selDetail.cassaD.kpi.totMP != null ? ` · margine ${(Number(selDetail.cassaD.kpi.totMP)||0).toFixed(1)}%` : ''}`
                : null },
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
                  <div style={{ fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, color: accent }}>
                    {has ? <Icon name="checkCircle" size={13} /> : selDetail.isFuture ? <Icon name="clock" size={13} /> : <Icon name="xCircle" size={13} />} {label}
                  </div>
                  {sub && <div style={{ fontSize: 10.5, color: T.textMid, marginTop: 2, ...tnum }}>{sub}</div>}
                  {!sub && !has && !selDetail.isFuture && <div style={{ fontSize: 10.5, color: T.textSoft, marginTop: 2 }}>Non registrata</div>}
                </div>
                {!has && !selDetail.isFuture && setView && (
                  <button onClick={()=>setView(v)} style={{
                    fontSize: 10.5, fontWeight: 700, color: T.brand, background: T.bgCard,
                    border: `1px solid ${T.brand}`, borderRadius: 8, padding: '5px 9px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>Vai</button>
                )}
              </div>
            )
          })}
        </div>

        {/* Nota */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name="edit" size={12} /> Nota del giorno
          </div>
          {noteErr ? (
            <div style={{ fontSize: 11, color: T.textMid, background: T.bgSubtle, borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>
              Esegui il SQL per <code>note_giornaliere</code> su Supabase per abilitare le note.
            </div>
          ) : (
            <>
              <textarea
                value={notaEdit}
                onChange={e => setNotaEdit(e.target.value)}
                placeholder="Aggiungi una nota…"
                rows={3}
                style={{
                  width: '100%', padding: '9px 11px', border: `1px solid ${T.border}`,
                  borderRadius: 10, fontSize: isMobile || isTablet ? 16 : 12.5, resize: 'vertical', fontFamily: 'inherit',
                  color: T.text, background: T.bgSubtle, boxSizing: 'border-box', outline: 'none', lineHeight: 1.5,
                }}
              />
              <button
                onClick={handleSalvaNota}
                disabled={savingNota || notaEdit === (note[sel]||'')}
                style={{
                  marginTop: 8, width: '100%', padding: '10px 0', minHeight: 40,
                  background: T.brand, color: '#FFF', border: 'none', borderRadius: 10,
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  opacity: (savingNota || notaEdit===(note[sel]||'')) ? 0.45 : 1,
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
            sub={diag.totPassati > 0 ? 'produzione + cassa' : 'nessun giorno trascorso'} />
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

          {/* Header: titolo mese + nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 11, background: T.brandLight, color: T.brand, flexShrink: 0 }}>
                <Icon name="calendar" size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.015em' }}>{MESI[mese]} <span style={{ ...tnum }}>{anno}</span></div>
                <div style={{ fontSize: 11.5, color: T.textSoft, ...tnum }}>
                  {diag.incasso > 0 ? `${eur0(diag.incasso)} incassati nel mese` : 'registra produzione e cassa ogni giorno'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!isMeseCorrente && (
                <button onClick={goOggi} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: isMobile ? '8px 12px' : '6px 11px', minHeight: isMobile ? 40 : isTablet ? 44 : 32,
                  borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard,
                  fontSize: 12, fontWeight: 600, color: T.textMid, cursor: 'pointer', boxShadow: S.sm,
                }}>
                  <Icon name="clock" size={13} />Oggi
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 3 }}>
                <button onClick={prev} style={{ ...NAV_BTN, width: isMobile ? 40 : isTablet ? 44 : 32, height: isMobile ? 40 : isTablet ? 44 : 32 }} aria-label="Mese precedente">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button onClick={next} style={{ ...NAV_BTN, width: isMobile ? 40 : isTablet ? 44 : 32, height: isMobile ? 40 : isTablet ? 44 : 32 }} aria-label="Mese successivo">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          </div>

          {isMobile ? (
            /* ── Mobile list view: tutti i giorni del mese selezionato ──
                Dettaglio (Produzione/Cassa/Nota) inserito INLINE subito sotto
                la card cliccata - non in fondo (audit 2026-06-24 fix UX). */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {mobileList.map(k => {
                const status  = getStatus(k, true)
                const isOggi  = k === oggiStr
                const isSel   = k === sel
                const prod    = prodMap[k]
                const cassa   = cassaMap[k]
                const totale  = cassa?.kpi?.totV
                const hasNota = !!note[k]
                const dotColor = STATUS[status]
                const d = new Date(k+'T12:00')
                return (
                  <React.Fragment key={k}>
                    <div onClick={() => handleDay(k)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                        borderRadius: 12, minHeight: 44,
                        background: isSel ? T.brandLight : T.bgCard,
                        border: isOggi ? `2px solid ${T.brand}` : isSel ? `2px solid ${T.brand}` : `1px solid ${T.border}`,
                        cursor: 'pointer', boxSizing: 'border-box',
                      }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor || T.borderStr, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: isOggi ? 800 : 600, color: isOggi ? T.brand : T.text }}>
                          {d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {isOggi && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: T.brand, background: T.brandLight, borderRadius: 4, padding: '1px 5px' }}>OGGI</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                          {prod   && <Pill bg={T.greenLight} color={T.green}><Icon name="package" size={11} /> Prod.</Pill>}
                          {cassa  && <Pill bg={T.blueLight} color={T.blue}><Icon name="receipt" size={11} /> Cassa</Pill>}
                          {hasNota && <Pill bg={T.amberLight} color={T.amber}><Icon name="edit" size={11} /></Pill>}
                          {status === 'futuro' && <Pill bg={T.bgSubtle} color={T.textSoft}>In arrivo</Pill>}
                        </div>
                      </div>
                      {totale != null && (
                        <div style={{ fontSize: 13, color: T.textMid, fontWeight: 700, flexShrink: 0, ...tnum }}>{eur0(totale)}</div>
                      )}
                    </div>
                    {isSel && renderDetail(true)}
                  </React.Fragment>
                )
              })}
            </div>
          ) : (
            <>
            {/* Day-of-week header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
              {GIORNI.map(g => (
                <div key={g} style={{
                  textAlign: 'center', fontSize: 10, fontWeight: 700, padding: '4px 0',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: (g==='Sab'||g==='Dom') ? T.brand : T.textSoft,
                }}>
                  {g}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {grid.map(({ date, cur }, idx) => {
                const k = toISO(date)
                const status   = getStatus(k, cur)
                const isOggi   = k === oggiStr
                const isWeek   = date.getDay()===0 || date.getDay()===6
                const isSel    = k === sel
                const prod     = prodMap[k]
                const cassa    = cassaMap[k]
                const totale   = cassa?.kpi?.totV
                const hasNota  = !!note[k]
                const accent   = status && status !== 'futuro' ? STATUS[status] : null

                return (
                  <div key={idx} onClick={() => cur && handleDay(k)}
                    style={{
                      borderRadius: 12, padding: '8px 7px', minHeight: 74,
                      background: isSel ? T.brandLight : !cur ? T.bgSubtle : isWeek ? T.bgSubtle : T.bgCard,
                      border: isOggi ? `2px solid ${T.brand}` : isSel ? `2px solid ${T.brand}` : `1px solid ${T.border}`,
                      borderLeft: accent && !isOggi && !isSel ? `3px solid ${accent}` : undefined,
                      cursor: cur ? 'pointer' : 'default',
                      opacity: cur ? 1 : 0.4,
                      transition: `background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}`,
                      position: 'relative', boxSizing: 'border-box',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: isOggi ? 800 : 600, color: isOggi ? T.brand : cur ? T.text : T.textFaint, ...tnum }}>
                        {date.getDate()}
                      </span>
                      {accent && (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0,
                          boxShadow: status==='completo' ? `0 0 5px ${T.green}88` : 'none',
                        }} />
                      )}
                    </div>
                    {cur && status !== 'futuro' && (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
                        {prod    && <Pill bg={T.greenLight} color={T.green}><Icon name="package" size={11} /></Pill>}
                        {cassa   && <Pill bg={T.blueLight} color={T.blue}><Icon name="receipt" size={11} /></Pill>}
                        {hasNota && <Pill bg={T.amberLight} color={T.amber}><Icon name="edit" size={11} /></Pill>}
                      </div>
                    )}
                    {totale != null && (
                      <div style={{ fontSize: 10, color: T.textMid, fontWeight: 700, marginTop: 4, ...tnum }}>
                        {eur0(totale)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
            {[[T.green,'Completo'],[T.amber,'Parziale'],[T.red,'Da compilare']].map(([c,l])=>(
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.textMid }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />{l}
              </div>
            ))}
            <div style={{ fontSize: 11, color: T.textSoft, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Icon name="package" size={12} /> Produzione
              <Icon name="receipt" size={12} /> Cassa
              <Icon name="edit" size={12} /> Nota
            </div>
          </div>
        </div>

        {/* ── ③ PANNELLO DETTAGLIO GIORNO (desktop a fianco). Su mobile e'
              già renderizzato inline subito sotto la card cliccata. ────── */}
        {!isMobile && renderDetail(false)}

      </div>

      {/* Keyframe animation */}
      <style>{`@keyframes fos_calSlideIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}

// KPI compatto della banda diagnosi - coerente con il KPI premium di _shared (chip icona + decoro).
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
      <div style={{ position: 'relative', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
        color: highlight ? 'rgba(255,255,255,0.76)' : T.textSoft, marginBottom: 6, lineHeight: 1.3,
        minHeight: 28 }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 26, fontWeight: 800, color: highlight ? T.textOnDark : accent,
        letterSpacing: '-0.03em', lineHeight: 1.05, minHeight: 30, ...tnum }}>
        {value}
      </div>
      {bar != null && (
        <div style={{ position: 'relative', height: 5, borderRadius: 3, background: highlight ? 'rgba(255,255,255,0.2)' : T.bgSubtle, marginTop: 9, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, bar))}%`, background: barColor || accent, borderRadius: 3, transition: `width ${M.durSlow} ${M.ease}` }} />
        </div>
      )}
      {sub
        ? <div style={{ position: 'relative', fontSize: 11.5, color: highlight ? 'rgba(255,255,255,0.7)' : T.textSoft, marginTop: 7, fontWeight: 500, minHeight: 32, lineHeight: 1.4 }}>{sub}</div>
        : <div style={{ minHeight: 32, marginTop: 7 }}/>
      }
    </div>
  )
}

function Pill({ bg, color, children }) {
  return (
    <span style={{ fontSize: 9, padding: '2px 5px', background: bg, color, borderRadius: 5, fontWeight: 700, lineHeight: 1.4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {children}
    </span>
  )
}

const NAV_BTN = {
  width: 32, height: 32, borderRadius: R.md, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: T.textMid,
  transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`,
}
