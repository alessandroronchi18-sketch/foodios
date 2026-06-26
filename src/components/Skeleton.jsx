// Skeleton - placeholder animati per loading states.
//
// Uso:
//   <Skeleton width="60%" height={14} />
//   <SkeletonText lines={3} />
//   <SkeletonCard count={4} cols={2} />
//   <SkeletonList count={5} />
//   <SkeletonTable rows={4} cols={3} />
//
// Animazione: shimmer CSS keyframes globali iniettati una volta (vedi useEffect
// in Skeleton). NON usa motion library per zero-cost on cold paint.

import React, { useEffect } from 'react'
import { color as T } from '../lib/theme'

const SHIMMER_ID = '__foodios_skel_kf'

function ensureKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SHIMMER_ID)) return
  const style = document.createElement('style')
  style.id = SHIMMER_ID
  style.textContent = `
  @keyframes _fos_skel {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }`
  document.head.appendChild(style)
}

const BG = `linear-gradient(90deg, ${T.bgSubtle || '#F1F5F9'} 0%, ${T.border || '#E5E9EF'} 50%, ${T.bgSubtle || '#F1F5F9'} 100%)`

// Atomico: barra rettangolare animata. width/height accettano number (px) o stringa.
export default function Skeleton({
  width = '100%',
  height = 12,
  radius = 6,
  style: extra = {},
}) {
  useEffect(() => { ensureKeyframes() }, [])
  return (
    <div
      aria-hidden="true"
      style={{
        width, height, borderRadius: radius,
        background: BG,
        backgroundSize: '200% 100%',
        animation: '_fos_skel 1.4s ease-in-out infinite',
        ...extra,
      }}
    />
  )
}

// Multi-linea testo: utile per paragrafi/descrizioni in caricamento.
export function SkeletonText({ lines = 3, gap = 8, lastShorter = true }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={lastShorter && i === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  )
}

// Card singola con header + body skeleton.
export function SkeletonCard({ height = 120, padding = 16 }) {
  return (
    <div style={{
      background: T.bgCard || '#fff',
      border: `1px solid ${T.border || '#E5E9EF'}`,
      borderRadius: 12, padding,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Skeleton width={32} height={32} radius="50%" />
        <div style={{ flex: 1 }}>
          <Skeleton height={14} width="50%" style={{ marginBottom: 6 }} />
          <Skeleton height={11} width="35%" />
        </div>
      </div>
      <SkeletonText lines={2} />
      {height > 120 && <div style={{ marginTop: 12 }}><SkeletonText lines={1} /></div>}
    </div>
  )
}

// Griglia di card: n elementi su `cols` colonne (responsive con grid).
export function SkeletonGrid({ count = 4, cols = 2, gap = 12 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap,
    }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

// Lista verticale di righe (utile per Trasferimenti, Personale, Scadenzario).
export function SkeletonList({ count = 4, height = 64, gap = 10 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          background: T.bgCard || '#fff',
          border: `1px solid ${T.border || '#E5E9EF'}`,
          borderRadius: 10,
          minHeight: height,
        }}>
          <Skeleton width={40} height={40} radius={8} />
          <div style={{ flex: 1 }}>
            <Skeleton height={13} width="55%" style={{ marginBottom: 6 }} />
            <Skeleton height={10} width="35%" />
          </div>
          <Skeleton width={70} height={24} radius={6} />
        </div>
      ))}
    </div>
  )
}

// Tabella skeleton: utile per Storico, Personale, P&L.
export function SkeletonTable({ rows = 4, cols = 3 }) {
  return (
    <div style={{
      background: T.bgCard || '#fff',
      border: `1px solid ${T.border || '#E5E9EF'}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
        background: '#F8FAFC', padding: '10px 14px', gap: 12,
      }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height={10} width="55%" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{
          display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
          padding: '14px', gap: 12, borderTop: `1px solid ${T.border || '#E5E9EF'}`,
        }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={13} width={c === 0 ? '70%' : '45%'} />
          ))}
        </div>
      ))}
    </div>
  )
}
