/**
 * FoodOS Logo — bordeaux invariante, F armoniosa.
 *
 * Il colore è hardcoded (#6E0E1A) e non può essere cambiato: deve essere
 * identico ovunque nell'app. Il prop `color` è ignorato volutamente.
 *
 * props:
 *   size     — px (default 32)
 *   variant  — 'icon' | 'horizontal' | 'wordmark' (default 'icon')
 *   tone     — 'light' | 'dark' (default 'light')
 *                light = wordmark dark (su sfondo chiaro)
 *                dark  = wordmark light (su sfondo scuro)
 *   style    — applicato al wrapper (boxShadow, borderRadius, margin…)
 */
const LOGO_COLOR = '#6E0E1A' // bordeaux — invariante

export default function Logo({
  size = 32,
  variant = 'icon',
  tone = 'light',
  style,
  ...rest
}) {
  // Scarta eventuale prop `color` esterno: il colore del logo è invariante.
  if ('color' in rest) delete rest.color
  const Mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="FoodOS"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path
        fill={LOGO_COLOR}
        fillRule="evenodd"
        d="M 14 0 L 50 0 C 58 0 64 6 64 14 L 64 50 C 64 58 58 64 50 64 L 14 64 C 6 64 0 58 0 50 L 0 14 C 0 6 6 0 14 0 Z M 19 14 L 49 14 L 49 23 L 29 23 L 29 29 L 44 29 L 44 37 L 29 37 L 29 50 L 19 50 Z"
      />
    </svg>
  )

  if (variant === 'icon') {
    return (
      <span style={{ display: 'inline-flex', lineHeight: 0, ...style }} {...rest}>
        {Mark}
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
      {Mark}
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
