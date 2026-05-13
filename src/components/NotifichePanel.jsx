import React from 'react'

const TIPO_ICONS = {
  magazzino_sotto_soglia: '⚠️',
  fattura_in_scadenza:    '📄',
  report_disponibile:     '📊',
  trial_in_scadenza:      '🎉',
  pagamento_confermato:   '✅',
  sync_completata:        '🔄',
}

const C = {
  red: '#C0392B', text: '#0F172A', textMid: '#475569', textSoft: '#94A3B8',
  border: '#E2E8F0', bg: '#F8FAFC', white: '#FFFFFF', green: '#16A34A',
}

function fmtData(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function NotifichePanel({ notifiche, nonLette, onSegnaLetta, onSegnaTutte, onClose }) {
  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 300 }}
      />
      {/* panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
        background: C.white, zIndex: 301, boxShadow: '-4px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif",
      }}>
        {/* header */}
        <div style={{
          padding: '20px 20px 16px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: C.text }}>
            🔔 Notifiche
            {nonLette > 0 && (
              <span style={{
                marginLeft: 8, background: C.red, color: '#fff',
                fontSize: 10, fontWeight: 800, padding: '2px 7px',
                borderRadius: 12, verticalAlign: 'middle',
              }}>{nonLette}</span>
            )}
          </div>
          {nonLette > 0 && (
            <button onClick={onSegnaTutte} style={{
              fontSize: 11, fontWeight: 600, color: C.red, background: 'none',
              border: 'none', cursor: 'pointer', padding: '4px 8px',
              borderRadius: 6, whiteSpace: 'nowrap',
            }}>
              Segna tutte come lette
            </button>
          )}
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: C.textSoft, padding: 4, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {notifiche.length === 0 ? (
            <div style={{
              padding: 40, textAlign: 'center', color: C.textSoft,
              fontSize: 13,
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔔</div>
              Nessuna notifica
            </div>
          ) : notifiche.map(n => (
            <div
              key={n.id}
              onClick={() => !n.letta && onSegnaLetta(n.id)}
              style={{
                padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
                background: n.letta ? C.white : '#FEF2F2',
                cursor: n.letta ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>
                  {TIPO_ICONS[n.tipo] || '🔔'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: n.letta ? 500 : 700,
                    color: C.text, marginBottom: 3,
                  }}>
                    {n.titolo}
                  </div>
                  {n.messaggio && (
                    <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5, marginBottom: 4 }}>
                      {n.messaggio}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.textSoft }}>
                      {fmtData(n.created_at)}
                    </span>
                    {n.link && (
                      <a href={n.link} style={{
                        fontSize: 11, fontWeight: 700, color: C.red,
                        textDecoration: 'none',
                      }}>
                        Vai →
                      </a>
                    )}
                  </div>
                </div>
                {!n.letta && (
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: C.red, flexShrink: 0, marginTop: 5,
                  }} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
