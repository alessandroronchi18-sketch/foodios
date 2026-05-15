import React from 'react'
import { useBackgroundJobs } from '../lib/useBackgroundJobs'
import { backgroundManager } from '../lib/backgroundManager'

const ICONE = {
  upload:       '📤',
  ai_analisi:   '🤖',
  excel_import: '📊',
  pdf_export:   '📄',
  sync:         '🔄',
}

const COLORI = {
  pending: '#94A3B8',
  running: '#3B82F6',
  done:    '#059669',
  error:   '#DC2626',
}

export default function BackgroundToast() {
  const jobs = useBackgroundJobs()
  if (!jobs.length) return null

  return (
    <>
      <style>{`
        @keyframes _bg_slideIn {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 320, width: 'calc(100vw - 48px)',
        pointerEvents: 'none',
      }}>
        {jobs.map(job => (
          <div key={job.id} style={{
            background: '#FFF', borderRadius: 12, padding: '12px 14px',
            boxShadow: '0 8px 32px rgba(15,23,42,0.18)', border: '1px solid #E2E8F0',
            animation: '_bg_slideIn 0.22s ease',
            pointerEvents: 'all',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 17, lineHeight: '20px', flexShrink: 0 }}>
                {ICONE[job.tipo] || '⚙️'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: '#1C0A0A',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: 2,
                }}>
                  {job.nome}
                </div>
                <div style={{ fontSize: 11, color: COLORI[job.status] }}>
                  {job.status === 'pending' && 'In attesa…'}
                  {job.status === 'running' && `${job.progress}%`}
                  {job.status === 'done'    && '✅ Completato'}
                  {job.status === 'error'   && '❌ ' + (job.error || 'Errore')}
                </div>
              </div>
              {(job.status === 'done' || job.status === 'error') && (
                <button
                  onClick={() => backgroundManager.remove(job.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                >×</button>
              )}
            </div>

            {/* Progress bar */}
            {job.status === 'running' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 4, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', background: '#C0392B', borderRadius: 4,
                    width: `${job.progress}%`, transition: 'width 0.35s ease',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 3, textAlign: 'right' }}>
                  {job.progress}%
                </div>
              </div>
            )}

            {/* Retry */}
            {job.status === 'error' && (
              <button
                onClick={() => backgroundManager.retry(job.id)}
                style={{
                  marginTop: 6, width: '100%', padding: '4px 0',
                  background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6,
                  color: '#DC2626', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                🔄 Riprova
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
