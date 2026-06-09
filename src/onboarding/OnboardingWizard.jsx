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

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { parseRicettario } from '../lib/parseRicettario'
import { ssave } from '../lib/storage'
import Icon from '../components/Icon'

const BRAND = '#6E0E1A'
const BRAND_DARK = '#4A0612'

// ─── Dataset demo realistico (3 ricette pasticceria classica) ──────────────
// Importato direttamente nello stesso formato che parseRicettario produce,
// senza dover scaricare/caricare file Excel. L'utente vede subito il valore.
const DEMO_RICETTARIO = {
  ricette: {
    'TORTA MARGHERITA': {
      nome: 'TORTA MARGHERITA',
      tipo: 'fetta', unita: 8, prezzo: 4.00,
      ingredienti: [
        { nome: 'Uova', qty1stampo: 200, costoPerG: 0.003,   costo1stampo: 0.60 },
        { nome: 'Zucchero', qty1stampo: 150, costoPerG: 0.00098, costo1stampo: 0.15 },
        { nome: 'Farina 00', qty1stampo: 120, costoPerG: 0.00088, costo1stampo: 0.11 },
        { nome: 'Burro', qty1stampo: 80, costoPerG: 0.0058, costo1stampo: 0.46 },
        { nome: 'Lievito per dolci', qty1stampo: 8, costoPerG: 0.0075, costo1stampo: 0.06 },
        { nome: 'Scorza di limone', qty1stampo: 5, costoPerG: 0.0032, costo1stampo: 0.02 },
      ],
    },
    'CROSTATA MARMELLATA': {
      nome: 'CROSTATA MARMELLATA',
      tipo: 'fetta', unita: 8, prezzo: 3.50,
      ingredienti: [
        { nome: 'Farina 00', qty1stampo: 250, costoPerG: 0.00088, costo1stampo: 0.22 },
        { nome: 'Burro', qty1stampo: 125, costoPerG: 0.0058, costo1stampo: 0.73 },
        { nome: 'Zucchero a velo', qty1stampo: 90, costoPerG: 0.00145, costo1stampo: 0.13 },
        { nome: 'Uova', qty1stampo: 50, costoPerG: 0.003, costo1stampo: 0.15 },
        { nome: 'Marmellata', qty1stampo: 150, costoPerG: 0.004, costo1stampo: 0.60 },
      ],
    },
    'TIRAMISU': {
      nome: 'TIRAMISU',
      tipo: 'fetta', unita: 8, prezzo: 5.50,
      ingredienti: [
        { nome: 'Mascarpone', qty1stampo: 500, costoPerG: 0.0062, costo1stampo: 3.10 },
        { nome: 'Tuorli', qty1stampo: 100, costoPerG: 0.0062, costo1stampo: 0.62 },
        { nome: 'Zucchero', qty1stampo: 100, costoPerG: 0.00098, costo1stampo: 0.10 },
        { nome: 'Panna fresca', qty1stampo: 200, costoPerG: 0.0034, costo1stampo: 0.68 },
        { nome: 'Savoiardi', qty1stampo: 150, costoPerG: 0.005, costo1stampo: 0.75 },
        { nome: 'Caffè espresso', qty1stampo: 200, costoPerG: 0.014, costo1stampo: 0.28 },
        { nome: 'Cacao amaro', qty1stampo: 20, costoPerG: 0.0095, costo1stampo: 0.19 },
      ],
    },
  },
  ingredienti_costi: {
    'uova':            { costoKg: 3.00,  costoG: 0.003   },
    'zucchero':        { costoKg: 0.98,  costoG: 0.00098 },
    'farina 00':       { costoKg: 0.88,  costoG: 0.00088 },
    'burro':           { costoKg: 5.80,  costoG: 0.0058  },
    'lievito per dolci': { costoKg: 7.50, costoG: 0.0075 },
    'scorza di limone': { costoKg: 3.20, costoG: 0.0032 },
    'zucchero a velo': { costoKg: 1.45, costoG: 0.00145 },
    'marmellata':      { costoKg: 4.00, costoG: 0.004  },
    'mascarpone':      { costoKg: 6.20, costoG: 0.0062 },
    'tuorli':          { costoKg: 6.20, costoG: 0.0062 },
    'panna fresca':    { costoKg: 3.40, costoG: 0.0034 },
    'savoiardi':       { costoKg: 5.00, costoG: 0.005  },
    'caffè espresso':  { costoKg: 14.0, costoG: 0.014  },
    'cacao amaro':     { costoKg: 9.50, costoG: 0.0095 },
  },
}

// Anteprima food cost calcolati (mostrati nello step 3) — coerenti col demo.
const DEMO_FC_PREVIEW = [
  { nome: 'Torta Margherita',  fc: 1.40, prezzo: 32.00, margPct: 95.6, tone: 'green' },
  { nome: 'Crostata Marmellata', fc: 1.83, prezzo: 28.00, margPct: 93.5, tone: 'green' },
  { nome: 'Tiramisù',           fc: 5.72, prezzo: 44.00, margPct: 87.0, tone: 'amber' },
]

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

const TONE = {
  green: { bg: '#E7F6F0', fg: '#0E9F6E', label: 'Eccellente' },
  amber: { bg: '#FFF8EB', fg: '#D97706', label: 'Buono' },
  red:   { bg: '#FEF2F2', fg: '#DC2626', label: 'Da rivedere' },
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

export default function OnboardingWizard({ nomeAttivita, orgId, onComplete, onSkip }) {
  const [step, setStep] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState(null)
  const [parseStats, setParseStats] = useState(null)
  const [secondaSede, setSecondaSede] = useState({ nome: '', indirizzo: '', citta: '' })
  const [addingSecondaSede, setAddingSecondaSede] = useState(false)
  const [sedeSaving, setSedeSaving] = useState(false)
  const [sedeError, setSedeError] = useState(null)

  // ESC chiude il wizard (skip silenzioso)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onSkip?.() }
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
        throw new Error('Nessuna ricetta riconosciuta nel file. Verifica il template.')
      }
      await ssave('pasticceria-ricettario-v1', parsed, orgId, null)
      setParseStats({ nRicette, nIngredienti })
      setTimeout(() => setStep(3), 1200)   // → seconda sede
    } catch (e) {
      setParseError(e.message || 'Errore durante l\'analisi del file')
    } finally {
      setParsing(false)
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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FCFDFE 0%, #F4F6FA 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      {/* Top bar: progress dots + skip ghost */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: '20px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFF', fontSize: 14, fontWeight: 800, letterSpacing: '-0.5px',
            boxShadow: '0 4px 10px rgba(110,14,26,0.32)' }}>F</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0E1726', letterSpacing: '-0.01em' }}>FoodOS</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
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
        <button onClick={onSkip} style={BTN_GHOST}>
          Salta tutto →
        </button>
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
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0E1726',
              margin: '0 0 14px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Benvenuto{nomeAttivita ? ', ' : ''}<br/>
              <span style={{ color: BRAND }}>{nomeAttivita || 'la tua attività'}</span>
            </h1>
            <p style={{ color: '#475264', fontSize: 17, lineHeight: 1.55,
              marginBottom: 14, letterSpacing: '-0.005em' }}>
              In <strong style={{ color: '#0E1726', fontWeight: 600 }}>2 minuti</strong> sei operativo.
              Hai <strong style={{ color: '#0E1726', fontWeight: 600 }}>3 mesi gratuiti</strong> per esplorare.
            </p>
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16,
              padding: '14px 18px', background: '#FFF',
              border: '1px solid #E5E9EF', borderRadius: 12,
              marginBottom: 32, maxWidth: 480,
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
              {[
                ['barChart', 'Food cost in real-time'],
                ['camera', 'OCR scontrini'],
                ['store', 'Multi-sede'],
                ['shield', 'HACCP ASL-ready'],
              ].map(([ico, txt]) => (
                <div key={txt} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12.5, color: '#475264', fontWeight: 500 }}>
                  <Icon name={ico} size={14} color={BRAND} />
                  <span>{txt}</span>
                </div>
              ))}
            </div>
            <div>
              <button onClick={() => setStep(2)} style={BTN_PRIMARY}>
                Iniziamo
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ STEP 2: Scegli il path ═══════════════ */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0E1726',
              margin: '0 0 12px', letterSpacing: '-0.025em' }}>
              Come vuoi iniziare?
            </h1>
            <p style={{ color: '#8B95A7', fontSize: 14, lineHeight: 1.5, marginBottom: 28 }}>
              Tutto è modificabile dopo. Puoi anche saltare e tornare quando vuoi.
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
                  fontSize: 22, color: parseStats ? '#FFF' : '#475264',
                }}>
                  {parseError ? <Icon name="warning" size={22}/> : parseStats ? '✓' : (parsing ? <Icon name="hourglass" size={22}/> : <Icon name="folder" size={22}/>)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0E1726', marginBottom: 3,
                    letterSpacing: '-0.01em' }}>
                    {parseStats ? 'Ricettario importato!' : 'Carica il tuo ricettario Excel'}
                  </div>
                  <div style={{ fontSize: 13, color: parseError ? '#DC2626' : '#475264', lineHeight: 1.5 }}>
                    {parseError
                      ? parseError
                      : parseStats
                        ? `${parseStats.nRicette} ricette · ${parseStats.nIngredienti} prezzi importati`
                        : parsing
                          ? 'Analisi in corso…'
                          : 'Trascina qui o clicca per selezionare un file .xlsx'}
                  </div>
                  {!parseStats && !parsing && (
                    <div style={{ marginTop: 4, fontSize: 11.5, color: '#8B95A7' }}>
                      Non hai un file? <a
                        href="#"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); downloadTemplate() }}
                        style={{ color: BRAND, textDecoration: 'underline', fontWeight: 500 }}
                      >Scarica template</a>
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

              {/* Path C: inizia vuoto */}
              <button onClick={onComplete} disabled={parsing}
                style={{
                  textAlign: 'left', padding: '16px 20px',
                  background: 'transparent',
                  border: '1px dashed #CBD5E1',
                  borderRadius: 12,
                  cursor: parsing ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 14,
                  color: '#8B95A7',
                  transition: 'all 0.18s',
                }}
                onMouseEnter={e => { if (!parsing) { e.currentTarget.style.borderColor = '#94A3B8'; e.currentTarget.style.color = '#475264' } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#8B95A7' }}
              >
                <div style={{ display: 'inline-flex' }}><Icon name="bolt" size={20}/></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, letterSpacing: '-0.005em' }}>
                    Inizia vuoto, configurerò dopo
                  </div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.4 }}>
                    Vai direttamente alla dashboard senza dati.
                  </div>
                </div>
              </button>
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
              FoodOS supporta più sedi con dati separati ma ricette condivise.
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
                ].map(([label, key, placeholder]) => (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <label style={{
                      fontSize: 10.5, fontWeight: 700, color: '#8B95A7',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      marginBottom: 5, display: 'block',
                    }}>{label}</label>
                    <input
                      value={secondaSede[key]}
                      onChange={e => setSecondaSede(s => ({ ...s, [key]: e.target.value }))}
                      style={{
                        width: '100%', padding: '11px 14px',
                        border: '1px solid #E5E9EF', borderRadius: 8,
                        fontSize: 14, color: '#0E1726', background: '#FFF',
                        outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                      }}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
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
