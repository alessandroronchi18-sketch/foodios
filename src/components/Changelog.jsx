import React from 'react'
import { CHANGELOG } from '../lib/changelog'

const C = {
  red: '#C0392B', text: '#0F172A', textMid: '#475569', textSoft: '#94A3B8',
  border: '#E2E8F0', bg: '#F8FAFC', white: '#FFFFFF', green: '#16A34A',
  greenLight: '#F0FDF4', redLight: '#FEF2F2',
}

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  return `${parseInt(d, 10)} ${mesi[parseInt(m, 10) - 1]} ${y}`
}

export function NovitaModal({ onClose, onVediTutte }) {
  const latest = CHANGELOG[0]
  if (!latest) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)',
      fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      <div style={{
        background: C.white, borderRadius: 18, padding: '32px 36px',
        maxWidth: 480, width: '92%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 20, color: C.textSoft, lineHeight: 1, padding: 4,
        }}>✕</button>

        <div style={{ fontSize: 28, marginBottom: 6 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 4 }}>
          Novità in FoodOS {latest.versione}
        </div>
        <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 20 }}>
          {fmtData(latest.data)}
        </div>

        {latest.novita.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              ✨ Nuove funzionalità
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
              {latest.novita.map((n, i) => (
                <li key={i} style={{ fontSize: 13, color: C.text, marginBottom: 6, lineHeight: 1.5 }}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {latest.fix.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              🔧 Fix
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
              {latest.fix.map((f, i) => (
                <li key={i} style={{ fontSize: 13, color: C.textMid, marginBottom: 4 }}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onVediTutte} style={{
            flex: 1, padding: '10px 16px', background: C.redLight, color: C.red,
            border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            Vedi tutte le novità
          </button>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px 16px', background: C.red, color: '#fff',
            border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            Inizia →
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChangelogView() {
  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6 }}>
        📋 Novità & Changelog
      </div>
      <div style={{ fontSize: 13, color: C.textSoft, marginBottom: 32 }}>
        Tutte le versioni e gli aggiornamenti di FoodOS
      </div>

      <div style={{ position: 'relative', paddingLeft: 28 }}>
        {/* timeline line */}
        <div style={{
          position: 'absolute', left: 6, top: 8, bottom: 0,
          width: 2, background: C.border,
        }} />

        {CHANGELOG.map((entry, idx) => (
          <div key={entry.versione} style={{ marginBottom: 32, position: 'relative' }}>
            {/* dot */}
            <div style={{
              position: 'absolute', left: -28, top: 6,
              width: 14, height: 14, borderRadius: '50%',
              background: idx === 0 ? C.red : C.border,
              border: `2px solid ${idx === 0 ? C.red : '#CBD5E1'}`,
              boxSizing: 'border-box',
            }} />

            <div style={{
              background: C.white, borderRadius: 14,
              padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              border: idx === 0 ? `1px solid rgba(192,57,43,0.15)` : `1px solid ${C.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                  fontSize: 15, fontWeight: 800, color: idx === 0 ? C.red : C.text,
                }}>
                  v{entry.versione}
                </div>
                {idx === 0 && (
                  <span style={{
                    background: C.redLight, color: C.red,
                    fontSize: 9, fontWeight: 800, padding: '2px 8px',
                    borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>Ultima</span>
                )}
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 12, color: C.textSoft }}>{fmtData(entry.data)}</div>
              </div>

              {entry.novita.length > 0 && (
                <div style={{ marginBottom: entry.fix.length > 0 ? 12 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    ✨ Nuove funzionalità
                  </div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
                    {entry.novita.map((n, i) => (
                      <li key={i} style={{ fontSize: 13, color: C.text, marginBottom: 5, lineHeight: 1.5 }}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {entry.fix.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    🔧 Fix e miglioramenti
                  </div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
                    {entry.fix.map((f, i) => (
                      <li key={i} style={{ fontSize: 13, color: C.textMid, marginBottom: 4 }}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
