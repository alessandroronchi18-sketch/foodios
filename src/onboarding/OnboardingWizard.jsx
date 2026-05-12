import React, { useState } from 'react'

export default function OnboardingWizard({ nomeAttivita, onComplete, onSkip }) {
  const [step, setStep] = useState(1)
  const [fileCaricato, setFileCaricato] = useState(false)
  const [dragging, setDragging] = useState(false)

  function handleFile(file) {
    if (!file) return
    setFileCaricato(true)
    setTimeout(() => setStep(3), 800)
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
        {[1,2,3].map(i => (
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
                onClick={e => e.preventDefault()}
                style={{ color: '#C0392B', fontSize: 13, textDecoration: 'none' }}
              >
                Scarica il template Excel
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
            <button onClick={onComplete} style={BTN}>
              Vai alla dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
