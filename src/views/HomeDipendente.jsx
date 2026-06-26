// HomeDipendente — landing dedicata al ruolo dipendente.
// Sostituisce la home generica con 6 pulsantoni XL ottimizzati per
// laboratorio (mani sporche, tablet, mobilità). Mobile-first.
//
// Wired in Dashboard.jsx come view 'home-dipendente'. Il routing
// degli isDip ora punta qui invece che direttamente a 'giornaliero'.

import React, { useMemo } from 'react'
import Icon from '../components/Icon'
import { color as T } from '../lib/theme'
import { isStandalonePWA } from '../lib/pwa'

const BRAND = T.brand || '#6E0E1A'
const TXT = T.text || '#0E1726'
const SOFT = T.textSoft || '#8B95A7'
const CARD = T.bgCard || '#FFFFFF'
const BORDER = T.border || '#E5E9EF'

// ── Helper: data corrente formattata "lunedì 18 giugno" ──────────────────────
function oggiLabel() {
  try {
    const d = new Date()
    const giorno = d.toLocaleDateString('it-IT', { weekday: 'long' })
    const giornoNum = d.getDate()
    const mese = d.toLocaleDateString('it-IT', { month: 'long' })
    return `${giorno.charAt(0).toUpperCase()}${giorno.slice(1)} ${giornoNum} ${mese}`
  } catch {
    return new Date().toLocaleDateString('it-IT')
  }
}

function partOfDayGreeting() {
  const h = new Date().getHours()
  if (h < 6) return 'Notte serena'
  if (h < 12) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

export default function HomeDipendente({
  user,
  sedeAttiva,
  isInventario,
  setView,
  notify,
}) {
  const nomeDip = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'collega'
  const standalone = isStandalonePWA()

  // 6 azioni operative principali. L'ordine riflette il flusso di una giornata:
  // 1) inventario mattutino o produzione, 2) chiusura, 3) magazzino, 4) sprechi,
  // 5) HACCP, 6) calendario.
  const azioni = useMemo(() => [
    {
      id: isInventario ? 'inventario-gusti' : 'giornaliero',
      label: isInventario ? 'Inventario\ngusti' : 'Registra\nproduzione',
      hint: isInventario ? 'Residui mattino + produzione' : 'Cosa stai producendo oggi',
      icon: 'factory',
      bg: 'linear-gradient(135deg, #6E0E1A 0%, #8B1B2C 100%)',
      iconColor: '#FFE7C7',
    },
    {
      id: 'chiusura',
      label: 'Chiusura\ncassa',
      hint: 'Scontrini + incasso del giorno',
      icon: 'wallet',
      bg: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
      iconColor: '#D1FAE5',
    },
    {
      id: 'magazzino',
      label: 'Magazzino',
      hint: 'Stock materie prime',
      icon: 'archive',
      bg: 'linear-gradient(135deg, #1F2937 0%, #4B5563 100%)',
      iconColor: '#E5E7EB',
    },
    {
      id: 'sprechi-omaggi',
      label: 'Sprechi\nomaggi',
      hint: 'Registra perdita o regalo',
      icon: 'trash',
      bg: 'linear-gradient(135deg, #B45309 0%, #D97706 100%)',
      iconColor: '#FEF3C7',
    },
    {
      id: 'haccp',
      label: 'HACCP',
      hint: 'Temperature + checklist',
      icon: 'thermometer',
      bg: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
      iconColor: '#DBEAFE',
    },
    {
      id: 'calendario',
      label: 'Calendario',
      hint: 'Eventi e impegni',
      icon: 'calendar',
      bg: 'linear-gradient(135deg, #6D28D9 0%, #A78BFA 100%)',
      iconColor: '#EDE9FE',
    },
  ], [isInventario])

  function vai(id) {
    if (!setView) return
    setView(id)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
      padding: '20px 16px 80px',
    }}>
      <style>{`
        @keyframes fos-dip-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .fos-dip-tile {
          animation: fos-dip-pop 0.28s cubic-bezier(.32,.72,0,1) both;
        }
        .fos-dip-tile:active {
          transform: scale(0.97);
          transition: transform 0.05s ease;
        }
        @media (max-width: 360px) {
          .fos-dip-grid { gap: 10px !important; }
        }
      `}</style>

      {/* Header: saluto + sede + data */}
      <div style={{ maxWidth: 880, margin: '0 auto 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {partOfDayGreeting()}
        </div>
        <h1 style={{
          margin: '4px 0 6px',
          fontSize: 26, fontWeight: 800,
          color: TXT, letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}>
          Ciao {nomeDip}
        </h1>
        <div style={{ fontSize: 13, color: SOFT, fontWeight: 500 }}>
          {oggiLabel()}
          {sedeAttiva?.nome && (
            <> · <strong style={{ color: TXT }}>{sedeAttiva.nome}</strong></>
          )}
        </div>
      </div>

      {/* Griglia 6 azioni — 2 colonne su mobile, 3 su tablet+ */}
      <div className="fos-dip-grid" style={{
        maxWidth: 880,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
        gap: 14,
      }}>
        {azioni.map((a, i) => (
          <button
            key={a.id}
            className="fos-dip-tile"
            onClick={() => vai(a.id)}
            style={{
              position: 'relative',
              minHeight: 148,
              padding: '20px 18px',
              borderRadius: 18,
              background: a.bg,
              border: 'none',
              cursor: 'pointer',
              color: '#FFF',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 6px 20px rgba(15,23,42,0.10)',
              animationDelay: `${i * 30}ms`,
              overflow: 'hidden',
            }}
            aria-label={a.label.replace('\n', ' ') + ' — ' + a.hint}
          >
            {/* Dot decorativo in alto a destra */}
            <div style={{
              position: 'absolute', top: -20, right: -20,
              width: 80, height: 80, borderRadius: '50%',
              background: 'rgba(255,255,255,0.10)',
              pointerEvents: 'none',
            }}/>

            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(255,255,255,0.18)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: a.iconColor,
              backdropFilter: 'blur(4px)',
            }}>
              <Icon name={a.icon} size={22} />
            </div>

            <div>
              <div style={{
                fontSize: 19, fontWeight: 800,
                letterSpacing: '-0.01em',
                lineHeight: 1.15,
                whiteSpace: 'pre-line',
                marginBottom: 4,
              }}>
                {a.label}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 500,
                color: 'rgba(255,255,255,0.78)',
                lineHeight: 1.35,
              }}>
                {a.hint}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Hint installa PWA per chi non l'ha installato */}
      {!standalone && (
        <div style={{
          maxWidth: 880,
          margin: '24px auto 0',
          padding: '14px 16px',
          background: CARD,
          border: `1px dashed ${BORDER}`,
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: '#F1F5F9',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: BRAND,
          }}>
            <Icon name="phone" size={18} />
          </div>
          <div style={{ flex: 1, fontSize: 12.5, color: SOFT, lineHeight: 1.5 }}>
            <strong style={{ color: TXT }}>Suggerimento</strong>: aggiungi Foodos alla schermata Home per accedere come app
            <span style={{ fontStyle: 'italic' }}> (tap sul menu del browser → "Aggiungi a Home")</span>.
          </div>
        </div>
      )}

      {/* Footer dipendente: minimal */}
      <div style={{
        maxWidth: 880,
        margin: '40px auto 0',
        textAlign: 'center',
        fontSize: 11, color: SOFT, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        Foodos · modalità dipendente
      </div>
    </div>
  )
}
