import { useId } from 'react'

/**
 * FoodOS Logo
 *
 * props:
 *   size      — px (default 32). For 'icon' = square side, for 'horizontal' = icon height.
 *   variant   — 'icon' | 'horizontal' | 'wordmark' (default 'icon')
 *   tone      — 'light' | 'dark' (default 'light')
 *                  light = wordmark dark (use on light bg)
 *                  dark  = wordmark light (use on dark bg)
 *   style     — applied to the outer wrapper (shadows, borderRadius, margins…)
 */
export default function Logo({
  size = 32,
  variant = 'icon',
  tone = 'light',
  style,
  ...rest
}) {
  const raw = useId()
  const uid = raw.replace(/[^a-zA-Z0-9]/g, '_')
  const bg = `bg_${uid}`
  const f  = `f_${uid}`
  const gl = `gl_${uid}`
  const sh = `sh_${uid}`

  const Mark = ({ s }) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="FoodOS"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1F1812"/>
          <stop offset="100%" stopColor="#0A0604"/>
        </linearGradient>
        <linearGradient id={f} x1="13" y1="9" x2="45" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#D8453A"/>
          <stop offset="50%" stopColor="#C0392B"/>
          <stop offset="100%" stopColor="#9F2E1F"/>
        </linearGradient>
        <radialGradient id={gl} cx="22%" cy="18%" r="65%">
          <stop offset="0%"   stopColor="#C0392B" stopOpacity="0.16"/>
          <stop offset="100%" stopColor="#C0392B" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={sh} x1="0" y1="13" x2="0" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.22)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>

      {/* Rounded container */}
      <rect width="64" height="64" rx="14" fill={`url(#${bg})`}/>
      <rect width="64" height="64" rx="14" fill={`url(#${gl})`}/>
      <rect x="0.5" y="0.5" width="63" height="63" rx="13.5"
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>

      {/* F monogram — calligraphic wedge bars (top flat, bottom tapers up to sharp tip) */}
      <path
        d="M 17 13 L 47 13 L 27 23 L 27 30 L 40 30 L 27 38 L 27 51 L 17 51 Z"
        fill={`url(#${f})`}
      />
      {/* Top shine (light catching the upper portion of the F) */}
      <path
        d="M 17 13 L 47 13 L 33 20 L 17 20 Z"
        fill={`url(#${sh})`}
        opacity="0.85"
      />
    </svg>
  )

  if (variant === 'icon') {
    return (
      <span style={{ display: 'inline-flex', lineHeight: 0, ...style }} {...rest}>
        <Mark s={size} />
      </span>
    )
  }

  const textColor = tone === 'dark' ? '#F5EFE7' : '#1A130E'
  const fontSize  = Math.round(size * 0.62)

  if (variant === 'wordmark') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          fontSize,
          fontWeight: 800,
          letterSpacing: '-0.028em',
          color: textColor,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          ...style,
        }}
        {...rest}
      >
        FoodOS
      </span>
    )
  }

  // horizontal
  const gap = Math.max(6, Math.round(size * 0.32))
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        ...style,
      }}
      {...rest}
    >
      <Mark s={size} />
      <span
        style={{
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          fontSize,
          fontWeight: 800,
          letterSpacing: '-0.028em',
          color: textColor,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        FoodOS
      </span>
    </span>
  )
}
