// VoiceButton - pulsante "tieni premuto per parlare" riusabile.
// Si nasconde se il browser non supporta Web Speech API.
//
// Uso:
//   <VoiceButton lang="it-IT" onTranscript={(text, {isFinal}) => {...}} />

import React from 'react'
import useVoiceInput from '../lib/useVoiceInput'

export default function VoiceButton({
  lang = 'it-IT',
  onTranscript,
  size = 44,
  ariaLabel = 'Premi e parla per dettare',
  hint = null,
}) {
  const { supported, listening, start, stop } = useVoiceInput({
    lang,
    continuous: false,
    interim: true,
    onResult: (text, meta) => {
      if (onTranscript) onTranscript(text, meta)
    },
  })

  if (!supported) return null

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={hint || ariaLabel}
      onPointerDown={(e) => { e.preventDefault(); start() }}
      onPointerUp={(e) => { e.preventDefault(); stop() }}
      onPointerLeave={() => stop()}
      onPointerCancel={() => stop()}
      style={{
        width: size, height: size,
        minWidth: size, minHeight: size,
        borderRadius: '50%',
        background: listening ? '#DC2626' : '#1F2937',
        color: '#FFF',
        border: 'none',
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: listening
          ? '0 0 0 6px rgba(220,38,38,0.18), 0 4px 12px rgba(220,38,38,0.35)'
          : '0 2px 8px rgba(0,0,0,0.20)',
        transition: 'box-shadow 0.15s ease, background 0.15s ease, transform 0.08s ease',
        transform: listening ? 'scale(1.05)' : 'scale(1)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <svg width={Math.round(size * 0.45)} height={Math.round(size * 0.45)}
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    </button>
  )
}
