// CameraButton - scatta foto con la fotocamera del device.
// Usa input[capture] per aprire direttamente la fotocamera su mobile
// (no galleria → meno tap per il dipendente).
//
// Uso:
//   <CameraButton onCapture={(file) => uploadOnSupabase(file)} />
//   <CameraButton label="Foto inventario" facingMode="environment" />

import React, { useRef } from 'react'

export default function CameraButton({
  onCapture,
  label = 'Scatta foto',
  size = 'md',
  facingMode = 'environment',  // 'user' = frontale, 'environment' = posteriore
  accept = 'image/*',
  multiple = false,
}) {
  const inputRef = useRef(null)

  function handleClick() {
    inputRef.current?.click()
  }

  function handleChange(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    if (onCapture) {
      if (multiple) onCapture(files)
      else onCapture(files[0])
    }
    // Reset così la stessa foto può essere selezionata di nuovo dopo.
    e.target.value = ''
  }

  const padding = size === 'lg' ? '14px 20px' : size === 'sm' ? '8px 12px' : '11px 16px'
  const fontSize = size === 'lg' ? 15 : size === 'sm' ? 12 : 13
  const minHeight = size === 'lg' ? 52 : size === 'sm' ? 36 : 44

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={facingMode}
        multiple={multiple}
        onChange={handleChange}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />
      <button
        type="button"
        onClick={handleClick}
        style={{
          padding,
          minHeight,
          background: '#1F2937',
          color: '#FFF',
          border: 'none',
          borderRadius: 10,
          fontSize,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {label}
      </button>
    </>
  )
}
