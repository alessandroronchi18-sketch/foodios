import React, { useState, useEffect, useRef, useMemo } from 'react'
import COMUNI_ITALIANI from '../lib/comuniItaliani'

// Lookup case-insensitive O(1) sui ~7900 comuni — creata una sola volta.
const COMUNI_LOWER_MAP = new Map(COMUNI_ITALIANI.map(c => [c.toLowerCase(), c]))

// Autocomplete città con SCELTA FORZATA dalla lista ISTAT.
// value è sempre '' oppure una voce esatta di COMUNI_ITALIANI.
// Se l'utente digita e non conferma dalla lista, al blur torniamo all'ultimo
// valore valido (o vuoto) — così `citta` sul DB non contiene mai errori di battitura.

const TXT = '#1C0A0A'
const SOFT = '#9C7B76'
const BOR = '#E2E8F0'
const CREAM = '#FAF6F2'
const RED = '#B34747'

export default function CittaAutocomplete({ value, onChange, inputStyle, placeholder = 'Es. Torino', required = false }) {
  const [q, setQ] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const wrapRef = useRef(null)

  useEffect(() => { setQ(value || '') }, [value])

  const matches = useMemo(() => {
    const s = (q || '').trim()
    if (s.length < 1) return []
    const needle = s.toLowerCase()
    const starts = []
    const contains = []
    for (const c of COMUNI_ITALIANI) {
      const cl = c.toLowerCase()
      if (cl.startsWith(needle)) starts.push(c)
      else if (cl.includes(needle)) contains.push(c)
      if (starts.length >= 8) break
    }
    return [...starts, ...contains].slice(0, 8)
  }, [q])

  useEffect(() => { setHi(0) }, [q])

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        // click fuori: se q non è una voce esatta valida, ripristina value
        commitOrRevert()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, value])

  function commit(nome) {
    setQ(nome)
    onChange(nome)
    setOpen(false)
  }

  function commitOrRevert() {
    const s = (q || '').trim()
    if (!s) { onChange(''); return }
    // match esatto (case-insensitive) con una voce della lista — O(1)
    const exact = COMUNI_LOWER_MAP.get(s.toLowerCase())
    if (exact) { setQ(exact); onChange(exact) }
    else {
      // primo suggerimento se c'è, altrimenti reset
      if (matches.length > 0) commit(matches[0])
      else { setQ(value || ''); onChange(value || '') }
    }
  }

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (matches.length) setHi(h => Math.min(h + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (matches.length) setHi(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && matches.length) { e.preventDefault(); commit(matches[hi] || matches[0]) }
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Tab') {
      // Tab conferma il primo suggerimento se disponibile e diverso
      if (open && matches.length) commit(matches[hi] || matches[0])
    }
  }

  const isValid = !q || COMUNI_LOWER_MAP.get(q.toLowerCase()) === q
  const showError = q && !open && !isValid

  const baseInp = inputStyle || {
    width: '100%', padding: '8px 12px', border: `1px solid ${BOR}`,
    borderRadius: 8, fontSize: 13, color: TXT, background: CREAM,
    outline: 'none', boxSizing: 'border-box',
  }
  const inpStyle = showError
    ? { ...baseInp, borderColor: RED, background: '#FFF5F5' }
    : baseInp

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} onKeyDown={handleKey}>
      <input
        type="text"
        value={q}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        onChange={e => { setQ(e.target.value); setOpen(true); if (value) onChange('') }}
        onFocus={() => setOpen(true)}
        style={inpStyle}
      />
      {showError && (
        <div style={{ fontSize: 11, color: RED, marginTop: 4 }}>
          Seleziona un comune dalla lista
        </div>
      )}
      {open && matches.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            zIndex: 999, background: '#FFF', border: `1px solid ${BOR}`,
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            overflow: 'hidden', maxHeight: 320, overflowY: 'auto',
          }}>
          {matches.map((c, i) => (
            <div
              key={c}
              role="option"
              aria-selected={i === hi}
              onMouseDown={e => { e.preventDefault(); commit(c) }}
              onMouseEnter={() => setHi(i)}
              style={{
                padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                color: TXT, fontWeight: i === hi ? 700 : 500,
                background: i === hi ? CREAM : 'transparent',
              }}>
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
