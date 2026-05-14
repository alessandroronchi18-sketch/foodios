import React from 'react'
import { useUploadManager } from '../lib/useUploadManager'
import { uploadManager } from '../lib/uploadManager'

const ICON = { uploading: '⏳', done: '✅', error: '⚠️' }
const STATUS_COLOR = { uploading: '#475569', done: '#16A34A', error: '#C0392B' }
const STATUS_LABEL = { uploading: 'In corso…', done: 'Completato', error: null }

export default function UploadToast() {
  const uploads = useUploadManager()
  if (!uploads.length) return null

  return (
    <>
      <style>{`
        @keyframes _ut_slideIn {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 320, width: 'calc(100vw - 48px)',
        pointerEvents: 'none',
      }}>
        {uploads.map(u => (
          <div key={u.id} style={{
            background: '#FFF', borderRadius: 12, padding: '12px 14px',
            boxShadow: '0 8px 32px rgba(15,23,42,0.18)', border: '1px solid #E2E8F0',
            animation: '_ut_slideIn 0.22s ease',
            pointerEvents: 'all',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 17, lineHeight: '20px', flexShrink: 0 }}>{ICON[u.status]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: '#1C0A0A',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: 2,
                }}>
                  {u.name}
                </div>
                <div style={{ fontSize: 11, color: STATUS_COLOR[u.status] }}>
                  {u.status === 'error' ? u.error : STATUS_LABEL[u.status]}
                </div>
              </div>
              {(u.status === 'done' || u.status === 'error') && (
                <button
                  onClick={() => uploadManager.clear(u.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#94A3B8', fontSize: 18, lineHeight: 1, padding: '0 2px',
                    flexShrink: 0,
                  }}
                >×</button>
              )}
            </div>

            {u.status === 'uploading' && (
              <div style={{ marginTop: 8 }}>
                <div style={{
                  height: 4, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', background: '#C0392B', borderRadius: 4,
                    width: `${u.progress}%`, transition: 'width 0.35s ease',
                  }} />
                </div>
                <div style={{
                  fontSize: 10, color: '#94A3B8', marginTop: 3, textAlign: 'right',
                }}>
                  {u.progress}%
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
