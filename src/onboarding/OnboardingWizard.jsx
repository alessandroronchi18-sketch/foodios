// OnboardingWizard — onboarding 4 step, time-to-value < 60s.
//
// Filosofia di design:
//   - SKIP-FRIENDLY: ogni step ha "Salta" visibile. L'utente non deve
//     decidere ora — può sempre tornare.
//   - VALUE-FIRST: lo step 2 NON chiede di caricare file ma di SCEGLIERE
//     il path (file Excel / dati demo / inizia vuoto). I dati demo
//     mostrano subito i numeri reali → "wow effect" garantito.
//   - PROOF VISIBILE: lo step 3 mostra 3 food cost calcolati con badge
//     verde/giallo/rosso. Niente placeholder vaghi.
//   - PROGRESS CHIARO: 4 dot in alto, skip annotato come "torna dopo".

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseRicettario } from '../lib/parseRicettario'
import { ssave } from '../lib/storage'
import { lessico } from '../lib/lessico'
import { seedDemoData } from '../lib/demoSeed'
import Icon from '../components/Icon'

const BRAND = '#6E0E1A'
const BRAND_DARK = '#4A0612'

// ─── Helpers UI ─────────────────────────────────────────────────────────────
async function downloadTemplate() {
  const XLSX = await new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX)
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve(window.XLSX)
    s.onerror = reject
    document.head.appendChild(s)
  })
  const wb = XLSX.utils.book_new()
  const ricette = [
    {
      nome: 'Torta Margherita',
      stampi: 1, impasto: 500, foodCost: 1.40,
      ing: [
        ['Uova', 200, 0.003, 0.60],
        ['Zucchero', 150, 0.00098, 0.15],
        ['Farina 00', 120, 0.00088, 0.11],
        ['Burro', 80, 0.0058, 0.46],
        ['Lievito per dolci', 8, 0.0075, 0.06],
        ['Scorza di limone', 5, 0.0032, 0.02],
      ],
    },
  ]
  ricette.forEach(({ nome, stampi, impasto, foodCost, ing }) => {
    const rows = [
      ['Ricetta', nome, '', '', '', impasto],
      ['Stampi', stampi, '', '', '', ''],
      ['Food cost 1 stampo (€)', '', '', '', '', foodCost],
      [],
      ['INGREDIENTE', 'Quantità (g)', '€/g', 'Costo stampo (€)', '', ''],
      [],
      [],
      ...ing.map(([n, q, cg, cs]) => [n, q, cg, cs]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws, nome)
  })
  XLSX.writeFile(wb, 'template_ricettario_foodOS.xlsx')
}

const BTN_PRIMARY = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '14px 30px',
  background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
  color: '#FFF', border: 'none', borderRadius: 11,
  fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.005em',
  cursor: 'pointer', textDecoration: 'none',
  boxShadow: `0 6px 18px rgba(110,14,26,0.30)`,
  transition: 'transform 0.12s cubic-bezier(0.32,0.72,0,1), box-shadow 0.18s',
}
const BTN_SECONDARY = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '12px 24px',
  background: '#FFF', border: '1px solid #E5E9EF',
  color: '#475264', borderRadius: 10,
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  letterSpacing: '-0.005em',
}
const BTN_GHOST = {
  background: 'transparent', border: 'none',
  color: '#8B95A7', fontSize: 13, cursor: 'pointer',
  padding: '8px 12px', letterSpacing: '-0.005em',
}

export default function OnboardingWizard({ nomeAttivita, tipoAttivita, orgId, onComplete, onSkip }) {
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const [step, setStep] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState(null)
  // Audit 2026-07-01 HIGH: cleanup setTimeout per unmount.
  const stepTimerRef = useRef(null)
  useEffect(() => () => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
  }, [])
  const [parseStats, setParseStats] = useState(null)
  // Demo data state — sede risolta dal DB al primo uso (org appena creata).
  const [demoSeeding, setDemoSeeding] = useState(false)
  const [demoStats, setDemoStats] = useState(null)
  const [demoError, setDemoError] = useState(null)
  const [secondaSede, setSecondaSede] = useState({ nome: '', indirizzo: '', citta: '' })
  const [addingSecondaSede, setAddingSecondaSede] = useState(false)
  const [sedeSaving, setSedeSaving] = useState(false)
  const [sedeError, setSedeError] = useState(null)

  // ESC chiude il wizard (skip silenzioso) — ma non se l'utente sta scrivendo
  // in un input (digitare ESC mentre compili "Nome sede" non deve far saltare
  // tutto l'onboarding).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const tag = (e.target?.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      onSkip?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  // ─── STEP 2 path A: carica file Excel reale ──
  async function handleFile(file) {
    if (!file || !orgId) return
    setParsing(true)
    setParseError(null)
    setParseStats(null)
    try {
      const parsed = await parseRicettario(file)
      const nRicette = Object.keys(parsed?.ricette || {}).length
      const nIngredienti = Object.keys(parsed?.ingredienti_costi || {}).length
      if (nRicette === 0 && nIngredienti === 0) {
        throw new Error(`Nessuna ${LEX.ricetta} riconosciuta nel file. Verifica il template.`)
      }
      await ssave('pasticceria-ricettario-v1', parsed, orgId, null)
      setParseStats({ nRicette, nIngredienti })
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      stepTimerRef.current = setTimeout(() => setStep(3), 1200)   // → seconda sede
    } catch (e) {
      setParseError(e.message || 'Errore durante l\'analisi del file')
    } finally {
      setParsing(false)
    }
  }

  // ─── STEP 2 path B: demo data 1-click ──
  async function handleDemoSeed() {
    if (!orgId || demoSeeding) return
    setDemoSeeding(true)
    setDemoError(null)
    try {
      // Risolvi la sede principale (creata dal trigger di registrazione).
      const { data: sediRow } = await supabase
        .from('sedi')
        .select('id')
        .eq('organization_id', orgId)
        .order('created_at')
        .limit(1)
        .maybeSingle()
      const sedeId = sediRow?.id || null
      const res = await seedDemoData({ orgId, sedeId })
      setDemoStats(res.counts)
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      // 1.5s per vedere la conferma, poi vai a step 3 (seconda sede).
      stepTimerRef.current = setTimeout(() => setStep(3), 1500)
    } catch (e) {
      setDemoError(e.message || 'Errore durante il caricamento dei dati demo')
    } finally {
      setDemoSeeding(false)
    }
  }

  // ─── STEP 3: seconda sede ──
  async function handleAggiungiSecondaSede() {
    if (!secondaSede.nome.trim() || !orgId) return
    setSedeSaving(true)
    setSedeError(null)
    // NB: il client Supabase NON lancia su errore DB — restituisce { error }.
    // Vanno controllati sia l'error sia eventuali eccezioni di rete.
    let dbError = null
    try {
      const { error } = await supabase.from('sedi').insert({
        organization_id: orgId,
        nome: secondaSede.nome.trim(),
        indirizzo: secondaSede.indirizzo.trim() || null,
        citta: secondaSede.citta.trim() || null,
        is_default: false,
        attiva: true,
      })
      dbError = error
    } catch (e) {
      dbError = e
    }
    setSedeSaving(false)
    if (dbError) {
      // Non chiamare onComplete: l'utente crederebbe la sede creata. Mostra errore
      // e lascia ritentare (o usare "Salta"). La sede comparirà al prossimo reload.
      setSedeError(dbError.message || 'Errore durante il salvataggio della sede. Riprova.')
      return
    }
    onComplete()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="onboard-h1" style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FCFDFE 0%, #F4F6FA 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '88px 16px 32px',  // padding-top 88 per dare spazio al top bar fixed
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      {/* Top bar fixed: logo F + FoodOS · progress dots centrate · Salta tutto.
          Su mobile la riga e' stretta — riduciamo spacing e il "Salta tutto"
          dello Step 1 e' sotto al bottone Iniziamo (qui solo da Step 2 in poi). */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        padding: '14px 16px',
        background: 'rgba(252,253,254,0.92)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(229,233,239,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFF', fontSize: 14, fontWeight: 800, letterSpacing: '-0.5px',
            boxShadow: '0 4px 10px rgba(110,14,26,0.32)' }}>F</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0E1726', letterSpacing: '-0.01em' }}>FoodOS</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              width: i === step ? 24 : 6,
              height: 6, borderRadius: 3,
              background: i <= step ? BRAND : '#E5E9EF',
              opacity: i === step ? 1 : i < step ? 0.5 : 0.4,
              transition: 'all 0.3s cubic-bezier(0.32,0.72,0,1)',
            }} />
          ))}
        </div>
        {/* Step 1: nessun skip qui (e' sotto al CTA Iniziamo). Step 2+: skip qui. */}
        {step >= 2 ? (
          <button onClick={onSkip} style={BTN_GHOST}>
            Salta tutto →
          </button>
        ) : (
          <div style={{ width: 60, flexShrink: 0 }} />
        )}
      </div>

      <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>

        {/* ═══════════════ STEP 1: Benvenuto ═══════════════ */}
        {step === 1 && (
          <div>
            <div style={{
              width: 76, height: 76, borderRadius: 20,
              background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFF', boxShadow: '0 14px 36px rgba(110,14,26,0.36)',
              marginBottom: 28,
            }}>
              <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1.5px' }}>F</span>
            </div>
            <h1 id="onboard-h1" style={{ fontSize: 32, fontWeight: 700, color: '#0E1726',
              margin: '0 0 14px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Benvenuto{nomeAttivita ? ', ' : ''}<br/>
              <span style={{ color: BRAND }}>{nomeAttivita || 'la tua attività'}</span>
            </h1>
            <p style={{ color: '#475264', fontSize: 17, lineHeight: 1.7,
              marginBottom: 24, letterSpacing: '-0.005em', textAlign: 'center' }}>
              In <strong style={{ color: '#0E1726', fontWeight: 600 }}>2 minuti</strong> sei operativo.<br/>
              Hai <strong style={{ color: '#0E1726', fontWeight: 600 }}>3 mesi gratuiti</strong> per esplorare.
            </p>
            {/* 4 feature key icon, allineate in grid 2x2 — icone tutte alla stessa coord X */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto',
              justifyContent: 'center', alignItems: 'center',
              columnGap: 28, rowGap: 12,
              padding: '16px 20px', background: '#FFF',
              border: '1px solid #E5E9EF', borderRadius: 12,
              marginBottom: 28, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
              {[
                ['barChart', 'Food cost real-time'],
                ['camera',   'OCR scontrini'],
                ['store',    'Multi-sede'],
                ['package',  'Magazzino & sprechi'],
              ].map(([ico, txt]) => (
                <div key={txt} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 13, color: '#475264', fontWeight: 500, justifyContent: 'flex-start' }}>
                  <Icon name={ico} size={16} color={BRAND} />
                  <span style={{ whiteSpace: 'nowrap' }}>{txt}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <button onClick={() => setStep(2)} style={BTN_PRIMARY}>
                Iniziamo
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
              <button onClick={onSkip} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#64748B', fontSize: 14, fontWeight: 600,
                padding: '8px 16px', textDecoration: 'underline',
                fontFamily: 'inherit',
              }}>
                Salta tutto e vai alla dashboard
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ STEP 2: Scegli il path ═══════════════ */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0E1726',
              margin: '20px 0 16px', letterSpacing: '-0.025em' }}>
              Come vuoi iniziare?
            </h1>
            <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.55, marginBottom: 32,
              maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
              Tutto si modifica dopo. Puoi saltare e tornare quando vuoi.
            </p>

            <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
              {/* Carica il ricettario Excel */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault()
                  setDragging(false)
                  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
                }}
                onClick={() => document.getElementById('file-input-onboarding').click()}
                style={{
                  textAlign: 'left', padding: '20px 22px',
                  background: dragging ? '#FEF0EE' : (parseStats ? '#F0FDF4' : '#FFF'),
                  border: `2px ${parsing ? 'dashed' : 'solid'} ${dragging ? BRAND : (parseStats ? '#16A34A' : '#E5E9EF')}`,
                  borderRadius: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 16,
                  transition: 'all 0.18s',
                  boxShadow: parseStats ? '0 4px 14px rgba(22,163,74,0.18)' : '0 1px 2px rgba(15,23,42,0.04)',
                }}
                onMouseEnter={e => { if (!parseStats && !dragging) e.currentTarget.style.borderColor = BRAND }}
                onMouseLeave={e => { if (!parseStats && !dragging) e.currentTarget.style.borderColor = '#E5E9EF' }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: parseStats ? '#16A34A' : '#F1F4F8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: parseStats ? '#FFF' : '#475264',
                }}>
                  {parseError ? <Icon name="warning" size={22}/> : parseStats ? <Icon name="check" size={22} color="#FFF"/> : (parsing ? <Icon name="hourglass" size={22}/> : <Icon name="folder" size={22}/>)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0E1726', marginBottom: 3,
                    letterSpacing: '-0.01em' }}>
                    {parseStats ? `${LEX.Ricettario} importato!` : `Carica il tuo ${LEX.Ricettario.toLowerCase()} Excel`}
                  </div>
                  <div style={{ fontSize: 13, color: parseError ? '#DC2626' : '#475264', lineHeight: 1.5 }}>
                    {parseError
                      ? parseError
                      : parseStats
                        ? `${parseStats.nRicette} ${LEX.ricette} · ${parseStats.nIngredienti} prezzi importati`
                        : parsing
                          ? 'Analisi in corso…'
                          : 'Trascina qui o clicca per selezionare un file .xlsx'}
                  </div>
                  {!parseStats && !parsing && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); downloadTemplate() }}
                        style={{
                          background: '#FFF',
                          border: `1px solid ${BRAND}`,
                          color: BRAND,
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      ><Icon name="download" size={12}/> Scarica template Excel</button>
                    </div>
                  )}
                </div>
                <input
                  id="file-input-onboarding"
                  type="file" accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }} disabled={parsing}
                  onChange={e => handleFile(e.target.files[0])}
                />
              </div>

              {/* Path B: demo data 1-click (anti "schermata vuota") */}
              <button onClick={handleDemoSeed} disabled={demoSeeding || parsing || !!parseStats}
                style={{
                  textAlign: 'left', padding: '20px 22px',
                  background: demoStats ? '#F0FDF4' : '#FFFBEB',
                  border: `2px solid ${demoStats ? '#16A34A' : '#FBBF24'}`,
                  borderRadius: 14,
                  cursor: (demoSeeding || parsing || parseStats) ? 'not-allowed' : 'pointer',
                  opacity: (parsing || parseStats) ? 0.55 : 1,
                  display: 'flex', alignItems: 'center', gap: 16,
                  transition: 'all 0.18s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { if (!demoSeeding && !parsing && !parseStats && !demoStats) e.currentTarget.style.borderColor = '#F59E0B' }}
                onMouseLeave={e => { if (!demoSeeding && !demoStats) e.currentTarget.style.borderColor = '#FBBF24' }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: demoStats ? '#16A34A' : '#FEF3C7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: demoStats ? '#FFF' : '#92400E',
                }}>
                  {demoStats ? <Icon name="check" size={22} color="#FFF"/> : <Icon name={demoSeeding ? 'hourglass' : 'sparkles'} size={22}/>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0E1726', marginBottom: 3, letterSpacing: '-0.01em' }}>
                    {demoStats
                      ? 'Dati demo caricati'
                      : demoSeeding
                        ? 'Carico i dati demo…'
                        : 'Esplora con dati di esempio'}
                  </div>
                  <div style={{ fontSize: 13, color: demoError ? '#DC2626' : '#475264', lineHeight: 1.5 }}>
                    {demoError
                      ? demoError
                      : demoStats
                        ? `${demoStats.ricette} ricette · ${demoStats.ingredienti} ingredienti · ${demoStats.chiusure} chiusure · 1 fattura. Pronti da esplorare.`
                        : '5 ricette tipo, magazzino e chiusure cassa precaricate. Rimuovi tutto con 1 click.'}
                  </div>
                </div>
              </button>

              {/* Path C: inizia vuoto — stesso layout dei box sopra, palette neutra */}
              <button onClick={onComplete} disabled={parsing}
                style={{
                  textAlign: 'left', padding: '20px 22px',
                  background: '#F8FAFC',
                  border: '2px solid #E5E9EF',
                  borderRadius: 14,
                  cursor: parsing ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 16,
                  transition: 'all 0.18s',
                  fontFamily: 'inherit',
                  width: '100%',
                }}
                onMouseEnter={e => { if (!parsing) e.currentTarget.style.borderColor = '#94A3B8' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E9EF' }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: '#FFFFFF',
                  border: '1px solid #E5E9EF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#64748B',
                }}>
                  <Icon name="bolt" size={22}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0E1726', marginBottom: 3, letterSpacing: '-0.01em' }}>
                    Inizia vuoto
                  </div>
                  <div style={{ fontSize: 13, color: '#475264', lineHeight: 1.5 }}>
                    Vai diretto alla dashboard. Aggiungi ricette e dati quando vuoi.
                  </div>
                </div>
              </button>

              {/* Hint gelateria/laboratorio — meno prominente, fuori dai 3 box azione */}
              <div style={{
                padding: '10px 14px', background: '#F0F9FF',
                border: '1px solid #BAE6FD', borderRadius: 10,
                fontSize: 12, color: '#075985', lineHeight: 1.5,
                display: 'flex', alignItems: 'flex-start', gap: 8,
                marginTop: 4,
              }}>
                <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2 }} color="#0284C7"/>
                <div>
                  Hai una gelateria o un laboratorio con gusti e formati separati?
                  Attiva l'<strong>Inventario gusti</strong> dopo, da <strong>Impostazioni → Sedi</strong>.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ STEP 3: Multi-sede ═══════════════ */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: 12, color: BRAND }}><Icon name="store" size={50}/></div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0E1726',
              margin: '0 0 12px', letterSpacing: '-0.025em' }}>
              Hai altri punti vendita?
            </h1>
            <p style={{ color: '#475264', fontSize: 14, lineHeight: 1.55, marginBottom: 28 }}>
              FoodOS supporta più sedi con dati separati ma {LEX.ricette} condivise.
              Aggiungile anche più tardi da <strong>Impostazioni → Sedi</strong>.
            </p>

            {!addingSecondaSede ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <button onClick={() => setAddingSecondaSede(true)} style={BTN_PRIMARY}>
                  Sì, aggiungi seconda sede
                </button>
                <button onClick={onComplete} style={{ ...BTN_SECONDARY, padding: '12px 28px' }}>
                  Ho una sola sede →
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'left', background: '#FFF', borderRadius: 14,
                padding: 24, boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
                border: '1px solid #E5E9EF' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0E1726',
                  marginBottom: 16, letterSpacing: '-0.01em' }}>Nuova sede</div>
                {[
                  ['Nome sede *', 'nome', 'Es. Centro città'],
                  ['Indirizzo', 'indirizzo', 'Via Roma 1'],
                  ['Città', 'citta', 'Torino'],
                ].map(([label, key, placeholder]) => {
                  const inputId = `sede2-${key}`
                  return (
                    <div key={key} style={{ marginBottom: 12 }}>
                      <label htmlFor={inputId} style={{
                        fontSize: 10.5, fontWeight: 700, color: '#8B95A7',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        marginBottom: 5, display: 'block',
                      }}>{label}</label>
                      <input
                        id={inputId}
                        value={secondaSede[key]}
                        onChange={e => setSecondaSede(s => ({ ...s, [key]: e.target.value }))}
                        style={{
                          width: '100%', padding: '11px 14px',
                          border: '1px solid #E5E9EF', borderRadius: 8,
                          fontSize: 16, color: '#0E1726', background: '#FFF',
                          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                        }}
                        placeholder={placeholder}
                      />
                    </div>
                  )
                })}
                {sedeError && (
                  <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 13, lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <Icon name="warning" size={14} style={{ marginTop: 2, flexShrink: 0 }}/><span>{sedeError}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  <button onClick={handleAggiungiSecondaSede}
                    disabled={!secondaSede.nome.trim() || sedeSaving}
                    style={{
                      ...BTN_PRIMARY, flex: 1, padding: '12px 18px', fontSize: 14,
                      opacity: !secondaSede.nome.trim() ? 0.5 : 1,
                    }}>
                    {sedeSaving ? 'Salvataggio…' : 'Aggiungi e vai alla dashboard →'}
                  </button>
                  <button onClick={onComplete}
                    style={{ ...BTN_SECONDARY, padding: '12px 18px', fontSize: 13 }}>
                    Salta
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
