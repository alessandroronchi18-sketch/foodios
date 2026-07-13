// ImportaDati - hub per modelli scaricabili + import file esterni.
//
// Al 13/07/2026: la sezione era vuota. La popoliamo con la prima utility -
// download del modello Excel per la produzione giornaliera - cosi' l'utente
// puo' scegliere di raccogliere la produzione a mano su carta/Excel e poi
// ricopiare, o distribuirlo ai dipendenti come check-list stampabile.

import React, { useState } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { color as T } from '../lib/theme'
import { C } from '../views/_shared'
import Icon from './Icon'
import { scaricaTemplateProduzione } from '../lib/produzioneTemplate'

export default function ImportaDati({ onImportRicettario, ricettario, nomeAttivita, notify }) {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(null)

  async function handleScaricaProduzione() {
    setLoading('produzione')
    try {
      const ricette = ricettario?.ricette ? Object.values(ricettario.ricette) : []
      await scaricaTemplateProduzione({ ricette, nomeAttivita, notify })
    } finally {
      setLoading(null)
    }
  }

  const card = {
    background: C.bgCard,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: isMobile ? '16px 18px' : '20px 22px',
    boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: isMobile ? 44 : 52, height: isMobile ? 44 : 52, borderRadius: 14, background: `linear-gradient(135deg, ${T.brand}, #4A0612)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF' }}>
          <Icon name="download" size={isMobile ? 20 : 24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Modelli e import dati</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: T.textSoft, lineHeight: 1.45 }}>
            Scarica i modelli standard per compilare i dati offline o carica un file Excel esistente.
          </p>
        </div>
      </div>

      {/* Sezione modelli */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Modelli Excel da scaricare</div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#0369A115', color: '#0369A1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="file" size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Produzione giornaliera</div>
                <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.5, marginBottom: 12 }}>
                  Modello con le tue ricette pre-elencate. Segna quanti stampi hai fatto per ogni prodotto e i pezzi al banco.
                  Stampabile o compilabile a video.
                </div>
                <button type="button" onClick={handleScaricaProduzione} disabled={loading === 'produzione'}
                  style={{
                    padding: '9px 14px', minHeight: 40,
                    background: loading === 'produzione' ? '#CBD5E1' : T.brand,
                    color: '#FFF', border: 'none', borderRadius: 8,
                    fontSize: 12.5, fontWeight: 700, cursor: loading === 'produzione' ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
                  }}>
                  <Icon name="download" size={13} />
                  {loading === 'produzione' ? 'Scarico…' : 'Scarica modello'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sezione import */}
      {onImportRicettario && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Import da file esistente</div>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${T.brand}15`, color: T.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="upload" size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Ricettario Excel</div>
                <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.5, marginBottom: 12 }}>
                  Carica un file .xlsx con le tue ricette. Foglio standard: colonne <b>nome ingrediente</b>, <b>grammi</b>, <b>prezzo €/kg</b>.
                </div>
                <label style={{
                  padding: '9px 14px', minHeight: 40,
                  background: '#FFF', color: T.brand,
                  border: `1px solid ${T.brand}55`, borderRadius: 8,
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
                }}>
                  <Icon name="upload" size={13} />
                  Scegli file Excel…
                  <input type="file" accept=".xlsx" multiple style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.length) onImportRicettario(Array.from(e.target.files)); e.target.value = '' }} />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
