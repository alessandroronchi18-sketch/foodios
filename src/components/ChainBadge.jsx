// ChainBadge — badge SVG che marca le feature esclusive del piano Chain.
//
// Non e' una emoji ma un SVG nitido a ogni resolution (gradient bordeaux→oro
// + sparkle). Pensato per stare a fianco del label nel menu.

import React from 'react'

export default function ChainBadge({ active = false, size = 14, title = 'Funzione esclusiva piano Chain' }) {
  const id = React.useId().replace(/:/g, '')
  // Colore: più "premium" quando NON active (cosi spicca su sfondo chiaro).
  // Quando active (item selezionato in red light bg), virata su tono caldo neutro.
  return (
    <span role="img" title={title} aria-label={title}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`gold-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#FFD86B" />
            <stop offset="55%"  stopColor="#E89B43" />
            <stop offset="100%" stopColor="#6E0E1A" />
          </linearGradient>
        </defs>
        {/* Diamante stilizzato: 4 punte + center glow. Tutto vector → nitido a ogni zoom. */}
        <path
          d="M12 3.2 L14.6 9.4 L20.8 12 L14.6 14.6 L12 20.8 L9.4 14.6 L3.2 12 L9.4 9.4 Z"
          fill={`url(#gold-${id})`}
          stroke="rgba(110,14,26,0.45)"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
        {/* Punti di luce piccoli (3) per dare sensazione di luccichio */}
        <circle cx="18.5" cy="5.5" r="0.9" fill="#FFE9A0" opacity={active ? 0.7 : 0.9}/>
        <circle cx="5.5" cy="18.5" r="0.7" fill="#FFE9A0" opacity={active ? 0.5 : 0.7}/>
        <circle cx="20" cy="17" r="0.5" fill="#FFE9A0" opacity={active ? 0.4 : 0.6}/>
      </svg>
    </span>
  )
}
