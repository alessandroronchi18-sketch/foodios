// Foodios UI kit - stili condivisi per garantire allineamento e coerenza visiva
// fra tutti i componenti. Importare come:
//   import { uiCard, uiInput, uiBtn, uiLabel, uiTable } from '../lib/uiKit'
//
// Tutti i valori derivano dai design token in theme.js. NON aggiungere stili
// hardcoded qui - fanno parte del sistema.

import { color as T, radius as R, shadow as S } from './theme'

// ─── CARD ────────────────────────────────────────────────────────────────────
export const uiCard = (opts = {}) => ({
  background: T.bgCard,
  borderRadius: R.xl,                 // 12 - standard per card di contenuto
  border: `1px solid ${T.border}`,
  boxShadow: S.sm,
  padding: opts.padding || '18px 20px',
  ...opts,
})

export const uiCardCompact = (opts = {}) => ({
  background: T.bgCard,
  borderRadius: R.lg,                 // 10 - card piccola / inline
  border: `1px solid ${T.border}`,
  padding: '12px 14px',
  ...opts,
})

// ─── LABEL / SECTION HEADER ──────────────────────────────────────────────────
export const uiLabel = {
  fontSize: 11,
  fontWeight: 700,
  color: T.textSoft,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
  display: 'block',
}

export const uiSectionTitle = {
  fontSize: 15,
  fontWeight: 700,
  color: T.text,
  letterSpacing: '-0.01em',
  marginBottom: 4,
}

// ─── INPUT ───────────────────────────────────────────────────────────────────
export const uiInput = (isMobile = false) => ({
  width: '100%',
  height: 40,
  padding: '0 12px',
  borderRadius: R.md,                 // 8 - input standard
  border: `1px solid ${T.borderStr}`,
  fontSize: isMobile ? 16 : 13,       // 16 mobile per disattivare zoom iOS
  color: T.text,
  background: T.bgCard,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 140ms ease, box-shadow 140ms ease',
})

export const uiTextarea = (isMobile = false) => ({
  ...uiInput(isMobile),
  height: 'auto',
  minHeight: 64,
  padding: '10px 12px',
  resize: 'vertical',
})

// ─── BUTTONS ─────────────────────────────────────────────────────────────────
// Tre taglie: sm (28h), md (36h), lg (44h). Tutti hanno stessa border-radius.
const BTN_BASE = {
  border: 'none',
  borderRadius: R.md,                 // 8 - coerente con input
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap',
  transition: 'background 120ms ease, color 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
  fontFamily: 'inherit',
}

export function uiBtn({ variant = 'primary', size = 'md', disabled = false, fullWidth = false } = {}) {
  const sizes = {
    sm: { height: 28, padding: '0 10px', fontSize: 11 },
    md: { height: 36, padding: '0 14px', fontSize: 13 },
    lg: { height: 44, padding: '0 18px', fontSize: 14 },
  }
  const variants = {
    primary:   { background: T.brand,    color: '#FFF',     boxShadow: '0 1px 2px rgba(110,14,26,0.18)' },
    secondary: { background: T.bgCard,   color: T.text,     border: `1px solid ${T.border}` },
    ghost:     { background: 'transparent', color: T.textMid, border: `1px solid ${T.border}` },
    danger:    { background: T.brandLight, color: T.brand,  border: `1px solid ${T.brandSoft}` },
    success:   { background: T.greenLight, color: T.green },
  }
  return {
    ...BTN_BASE,
    ...sizes[size],
    ...variants[variant],
    ...(fullWidth ? { width: '100%' } : {}),
    ...(disabled ? { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' } : {}),
  }
}

// ─── TABLE ───────────────────────────────────────────────────────────────────
export const uiTable = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontSize: 13,
  color: T.text,
}

export const uiTh = {
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  color: T.textSoft,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '10px 14px',
  background: T.bgSubtle,
  borderBottom: `1px solid ${T.border}`,
  whiteSpace: 'nowrap',
}

export const uiTd = {
  padding: '12px 14px',
  borderBottom: `1px solid ${T.borderSoft}`,
  verticalAlign: 'middle',
  fontSize: 13,
  color: T.text,
}

export const uiTdNum = {
  ...uiTd,
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

// ─── TAB BAR ─────────────────────────────────────────────────────────────────
export const uiTabBar = (isMobile = false) => ({
  display: 'flex',
  gap: 2,
  marginBottom: isMobile ? 16 : 20,
  borderBottom: `1px solid ${T.border}`,
  overflowX: isMobile ? 'auto' : 'visible',
})

export const uiTab = (active) => ({
  padding: '10px 16px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  color: active ? T.text : T.textSoft,
  borderBottom: active ? `2px solid ${T.brand}` : '2px solid transparent',
  marginBottom: -1,
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap',
  transition: 'color 120ms ease, border-color 120ms ease',
  fontFamily: 'inherit',
})

// ─── SEMANTIC SPACING ────────────────────────────────────────────────────────
export const uiGap = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24,
}

export const uiPageContainer = (isMobile = false) => ({
  maxWidth: 1040,
  margin: '0 auto',
  padding: isMobile ? 12 : 0,
})
