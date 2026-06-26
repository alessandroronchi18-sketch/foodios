// ProductAutocomplete - input con suggerimenti reali da ricettario / stock PF / magazzino MP.
//
// Comportamento:
//   - Per tipo='prodotto': pesca dal RICETTARIO (nome ricetta) + opzionale stock_prodotti_finiti.
//   - Per tipo='semilavorato': pesca dal ricettario semilavorati (categoria=semilavorato).
//   - Per tipo='materia_prima': pesca dal MAGAZZINO MP (chiavi user_data pasticceria-magazzino-v1).
//
// L'utente puo' scrivere liberamente MA quando seleziona un suggerimento il
// valore viene normalizzato (case+trim). Onblur senza match valido -> non
// rifiuta, ma il parent dovrebbe validare prima del save.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { sload } from '../lib/storage'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'

const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const BORDER = T.border || '#E5E9EF'

export default function ProductAutocomplete({
  value,
  onChange,
  tipo = 'prodotto',           // 'prodotto' | 'semilavorato' | 'materia_prima'
  orgId,
  sedeId,
  placeholder = 'Inizia a digitare…',
  style = {},
  required = true,
}) {
  const [opzioni, setOpzioni] = useState([])      // array {nome, hint?}
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    async function load() {
      const set = new Map()  // nome -> hint
      try {
        if (tipo === 'prodotto' || tipo === 'semilavorato') {
          const ric = await sload('pasticceria-ricettario-v1', orgId, null)
          if (Array.isArray(ric)) {
            for (const r of ric) {
              const isSemi = r?.categoria === 'semilavorato' || r?.tipo === 'semilavorato'
              if (tipo === 'semilavorato' && !isSemi) continue
              if (tipo === 'prodotto' && isSemi) continue
              const n = (r.nome || '').trim()
              if (n) set.set(n.toUpperCase(), 'ricettario')
            }
          }
          // Aggiungo anche eventuali stock_prodotti_finiti come hint extra (solo per prodotto)
          if (tipo === 'prodotto' && sedeId) {
            const { data: stock } = await supabase
              .from('stock_prodotti_finiti')
              .select('prodotto_nome')
              .eq('organization_id', orgId)
              .eq('sede_id', sedeId)
              .limit(200)
            for (const s of (stock || [])) {
              const n = (s.prodotto_nome || '').trim()
              if (n && !set.has(n)) set.set(n, 'in stock')
            }
          }
        } else if (tipo === 'materia_prima') {
          if (!sedeId) { setOpzioni([]); return }
          const mag = await sload('pasticceria-magazzino-v1', orgId, sedeId)
          if (mag && typeof mag === 'object') {
            for (const nome of Object.keys(mag)) {
              if (!nome) continue
              const g = Number(mag[nome]?.giacenza_g ?? mag[nome]?.giacenza ?? 0)
              set.set(nome, `giacenza ${Math.round(g)}g`)
            }
          }
        }
      } catch (e) { console.warn('autocomplete load:', e.message) }
      if (alive) {
        const arr = Array.from(set.entries()).map(([nome, hint]) => ({ nome, hint }))
        arr.sort((a, b) => a.nome.localeCompare(b.nome))
        setOpzioni(arr)
      }
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId, tipo])

  const filtered = useMemo(() => {
    const q = (value || '').toLowerCase().trim()
    if (!q) return opzioni.slice(0, 12)
    return opzioni.filter(o => o.nome.toLowerCase().includes(q)).slice(0, 12)
  }, [value, opzioni])

  useEffect(() => { setFocusIdx(0) }, [filtered.length])

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function pick(o) {
    onChange?.(o.nome)
    setOpen(false)
    inputRef.current?.focus()
  }

  function onKey(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (filtered[focusIdx]) pick(filtered[focusIdx]) }
    if (e.key === 'Escape')    { setOpen(false) }
  }

  const matchesExisting = !!opzioni.find(o => o.nome.toUpperCase() === (value || '').toUpperCase().trim())
  const showWarning = required && value && !matchesExisting

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <input ref={inputRef}
        value={value || ''}
        onChange={e => { onChange?.(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: `1px solid ${showWarning ? '#D97706' : BORDER}`,
          fontSize: 14, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box',
        }} />
      {showWarning && (
        <div style={{ marginTop: 4, fontSize: 11, color: '#92400E' }}>
          ⚠️ Nessun match esatto. Seleziona da elenco o verifica il nome.
        </div>
      )}
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#FFF', border: `1px solid ${BORDER}`, borderRadius: 8,
          boxShadow: '0 8px 24px rgba(15,23,42,0.15)', zIndex: 30,
          maxHeight: 280, overflowY: 'auto',
        }}>
          {filtered.map((o, i) => (
            <button key={o.nome}
              onMouseEnter={() => setFocusIdx(i)}
              onClick={() => pick(o)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '8px 12px', background: i === focusIdx ? '#F1F5F9' : 'transparent',
                border: 'none', borderBottom: `1px solid ${BORDER}`,
                fontSize: 13, color: TXT, textAlign: 'left', cursor: 'pointer',
              }}>
              <span style={{ fontWeight: 600 }}>{o.nome}</span>
              {o.hint && <span style={{ fontSize: 10.5, color: SOFT, fontStyle: 'italic' }}>{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
