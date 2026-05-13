import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

async function downloadTemplate() {
  const XLSX = await new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX)
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => resolve(window.XLSX)
    s.onerror = reject
    document.head.appendChild(s)
  })

  const wb = XLSX.utils.book_new()

  // Formato atteso da parseRicettario:
  // Row 0: [label, NomeRicetta, "", "", "", totImpasto]
  // Row 1: [label, numStampi]
  // Row 2: [label, "", "", "", "", foodCost1]
  // Rows 3-6: intestazioni/vuote
  // Row 7+: [nome_ingrediente, qty_g, costoPerG, costo1stampo]

  const ricette = [
    {
      nome: 'Torta Margherita',
      stampi: 1, impasto: 500, foodCost: 3.20,
      ing: [
        ['Uova',          200, 0.003, 0.60],
        ['Zucchero',      150, 0.00098, 0.15],
        ['Farina 00',     120, 0.00088, 0.11],
        ['Burro',          80, 0.0058, 0.46],
        ['Lievito per dolci', 8, 0.0075, 0.06],
        ['Scorza di limone', 5, 0.0032, 0.02],
      ],
    },
    {
      nome: 'Crostata Marmellata',
      stampi: 1, impasto: 420, foodCost: 2.80,
      ing: [
        ['Farina 00',     250, 0.00088, 0.22],
        ['Burro',         125, 0.0058, 0.73],
        ['Zucchero a velo', 90, 0.00145, 0.13],
        ['Uova',           50, 0.003, 0.15],
        ['Marmellata',    150, 0.004, 0.60],
        ['Sale fino',       1, 0.0004, 0.00],
      ],
    },
    {
      nome: 'Tiramisù',
      stampi: 1, impasto: 800, foodCost: 5.60,
      ing: [
        ['Mascarpone',    500, 0.0062, 3.10],
        ['Tuorli',        100, 0.0062, 0.62],
        ['Zucchero',      100, 0.00098, 0.10],
        ['Panna fresca',  200, 0.0034, 0.68],
        ['Savoiardi',     150, 0.005, 0.75],
        ['Caffè espresso', 200, 0.014, 0.28],
        ['Rum',            30, 0.012, 0.36],
        ['Cacao amaro in polvere', 20, 0.0095, 0.19],
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

export default function OnboardingWizard({ nomeAttivita, orgId, onComplete, onSkip }) {
  const [step, setStep] = useState(1)
  const [fileCaricato, setFileCaricato] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [secondaSede, setSecondaSede] = useState({ nome: '', indirizzo: '', citta: '' })
  const [addingSecondaSede, setAddingSecondaSede] = useState(false)
  const [sedeSaving, setSedeSaving] = useState(false)

  function handleFile(file) {
    if (!file) return
    setFileCaricato(true)
    setTimeout(() => setStep(3), 800)
  }

  async function handleAggiungiSecondaSede() {
    if (!secondaSede.nome.trim() || !orgId) return
    setSedeSaving(true)
    try {
      await supabase.from('sedi').insert({
        organization_id: orgId,
        nome: secondaSede.nome.trim(),
        indirizzo: secondaSede.indirizzo.trim() || null,
        citta: secondaSede.citta.trim() || null,
        is_default: false,
        attiva: true,
      })
    } catch {}
    setSedeSaving(false)
    onComplete()
  }

  const BTN = {
    display: 'inline-block',
    padding: '14px 32px',
    background: '#C0392B',
    color: '#FFF',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    textDecoration: 'none',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FDFAF7',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      {/* Progress dots */}
      <div style={{ position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            width: i === step ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: i === step ? '#C0392B' : '#E8DDD8',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>

        {/* ── STEP 1: Benvenuto ── */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 64, marginBottom: 20 }}>🎉</div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#1C0A0A', margin: '0 0 12px' }}>
              Benvenuto in FoodOS,<br />{nomeAttivita || 'la tua attività'}!
            </h1>
            <p style={{ color: '#6B4C44', fontSize: 16, lineHeight: 1.7, marginBottom: 12 }}>
              Hai <strong>3 mesi gratuiti</strong> per esplorare tutto.
              Nessuna carta di credito.
            </p>
            <p style={{ color: '#9C7B76', fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>
              FoodOS ti aiuta a calcolare il food cost di ogni ricetta,
              gestire il magazzino e capire se stai guadagnando davvero.
            </p>
            <button onClick={() => setStep(2)} style={BTN}>
              Iniziamo →
            </button>
          </div>
        )}

        {/* ── STEP 2: Carica ricettario ── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 64, marginBottom: 20 }}>📂</div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#1C0A0A', margin: '0 0 12px' }}>
              Carica il tuo ricettario
            </h1>
            <p style={{ color: '#6B4C44', fontSize: 15, lineHeight: 1.7, marginBottom: 28 }}>
              Importa il file Excel con le tue ricette e FoodOS calcolerà
              automaticamente il food cost di ogni prodotto.
            </p>

            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => document.getElementById('file-input-onboarding').click()}
              style={{
                border: `2px dashed ${dragging ? '#C0392B' : '#E8DDD8'}`,
                borderRadius: 16,
                padding: '40px 24px',
                marginBottom: 24,
                cursor: 'pointer',
                background: dragging ? '#FEF0EE' : '#FFF',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>{fileCaricato ? '✅' : '📊'}</div>
              <p style={{ color: '#6B4C44', fontSize: 14, margin: 0 }}>
                {fileCaricato
                  ? 'File caricato! Analisi in corso…'
                  : 'Trascina qui il file Excel, o clicca per selezionarlo'
                }
              </p>
              <input
                id="file-input-onboarding"
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
              <button onClick={onSkip} style={{
                padding: '12px 24px',
                background: 'transparent',
                border: '1px solid #E8DDD8',
                borderRadius: 8,
                color: '#9C7B76',
                fontSize: 14,
                cursor: 'pointer',
              }}>
                Salta per ora
              </button>
              <span style={{ color: '#9C7B76', fontSize: 13 }}>·</span>
              <a
                href="#"
                onClick={e => { e.preventDefault(); downloadTemplate() }}
                style={{ color: '#C0392B', fontSize: 13, textDecoration: 'none' }}
              >
                📥 Scarica template Excel
              </a>
            </div>
          </div>
        )}

        {/* ── STEP 3: Prima analisi ── */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 64, marginBottom: 20 }}>📈</div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#1C0A0A', margin: '0 0 12px' }}>
              Ecco i tuoi food cost 👆
            </h1>
            <p style={{ color: '#6B4C44', fontSize: 15, lineHeight: 1.7, marginBottom: 8 }}>
              Ora puoi vedere i margini di ogni prodotto, ottimizzare i prezzi
              e tracciare la produzione giornaliera.
            </p>
            <p style={{ color: '#9C7B76', fontSize: 13, lineHeight: 1.6, marginBottom: 32 }}>
              Tutto aggiornato in tempo reale, da qualsiasi dispositivo.
            </p>
            <button onClick={() => setStep(4)} style={BTN}>
              Avanti →
            </button>
          </div>
        )}

        {/* ── STEP 4: Altri punti vendita ── */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 64, marginBottom: 20 }}>🏪</div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#1C0A0A', margin: '0 0 12px' }}>
              Hai altri punti vendita?
            </h1>
            <p style={{ color: '#6B4C44', fontSize: 15, lineHeight: 1.7, marginBottom: 28 }}>
              FoodOS supporta più sedi per la stessa attività.
              Puoi aggiungerne altre in qualsiasi momento dalle Impostazioni.
            </p>

            {!addingSecondaSede ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button onClick={() => setAddingSecondaSede(true)} style={BTN}>
                  Sì, aggiungi seconda sede
                </button>
                <button onClick={onComplete} style={{
                  padding: '12px 32px', background: 'transparent',
                  border: '1px solid #E8DDD8', borderRadius: 10,
                  color: '#9C7B76', fontSize: 15, cursor: 'pointer',
                }}>
                  No, ho solo una sede →
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'left', background: '#FFF', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1C0A0A', marginBottom: 16 }}>Seconda sede</div>
                {[
                  ['Nome sede *', 'nome', 'Es. Sede Centro'],
                  ['Indirizzo', 'indirizzo', 'Via Roma 1'],
                  ['Città', 'citta', 'Torino'],
                ].map(([label, key, placeholder]) => (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#9C7B76', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>
                      {label}
                    </label>
                    <input
                      value={secondaSede[key]}
                      onChange={e => setSecondaSede(s => ({ ...s, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 9, fontSize: 13, color: '#1C0A0A', background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={handleAggiungiSecondaSede} disabled={!secondaSede.nome.trim() || sedeSaving}
                    style={{ ...BTN, padding: '12px 24px', fontSize: 14, opacity: !secondaSede.nome.trim() ? 0.5 : 1 }}>
                    {sedeSaving ? 'Salvataggio…' : 'Aggiungi e vai alla dashboard →'}
                  </button>
                  <button onClick={onComplete} style={{ padding: '12px 16px', background: 'transparent', border: '1px solid #E8DDD8', borderRadius: 10, color: '#9C7B76', fontSize: 14, cursor: 'pointer' }}>
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
