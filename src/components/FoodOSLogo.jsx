import { useId } from 'react'

export default function FoodOSLogo({ size = 32, style, rounded = true }) {
  const raw = useId()
  const uid = raw.replace(/[^a-zA-Z0-9]/g, '_')
  const bg   = `bg_${uid}`
  const f    = `f_${uid}`
  const gl   = `gl_${uid}`
  const sh   = `sh_${uid}`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      style={{ flexShrink: 0, display: 'block', ...style }}
      aria-label="FoodOS"
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2E0C0C"/>
          <stop offset="100%" stopColor="#140404"/>
        </linearGradient>
        <linearGradient id={f} x1="112" y1="96" x2="384" y2="416" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0614E"/>
          <stop offset="45%" stopColor="#E74C3C"/>
          <stop offset="100%" stopColor="#9B2D20"/>
        </linearGradient>
        <radialGradient id={gl} cx="50%" cy="10%" r="55%">
          <stop offset="0%" stopColor="#C0392B" stopOpacity="0.22"/>
          <stop offset="100%" stopColor="#C0392B" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={sh} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="512" height="512" rx={rounded ? 96 : 0} fill={`url(#${bg})`}/>
      <rect width="512" height="512" rx={rounded ? 96 : 0} fill={`url(#${gl})`}/>
      <rect x="2" y="2" width="508" height="508" rx={rounded ? 94 : 0}
            fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2"/>

      {/* Vertical stroke */}
      <rect x="112" y="96" width="66" height="320" rx="10" fill={`url(#${f})`}/>

      {/* Top horizontal bar */}
      <rect x="112" y="96" width="272" height="64" rx="10" fill={`url(#${f})`}/>

      {/* Middle bar with spatula/knife tip */}
      <path
        d="M 122 228 Q 112 228 112 238 L 112 278 Q 112 288 122 288 L 304 288 L 354 258 L 304 228 Z"
        fill={`url(#${f})`}
      />

      {/* Top shine on vertical stroke */}
      <rect x="112" y="96" width="66" height="80" rx="10" fill={`url(#${sh})`}/>
    </svg>
  )
}
