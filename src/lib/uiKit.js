// Foodos UI kit — gli stili condivisi, perché la stessa cosa si veda uguale
// dappertutto. Si importa così:
//   import { useDevice } from './useIsMobile'
//   import { uiCard, uiInput, uiBtn } from './uiKit'
//   const dev = useDevice()
//   <input style={uiInput(dev)} />
//
// Tutti i valori vengono dai token di theme.js. Qui dentro NON si scrivono
// misure a mano: è il posto dove la misura sta scritta una volta sola.
//
// ── Nota del 15/09/2026 ────────────────────────────────────────────────────
// Questo file esisteva da mesi con **zero importatori**: 181 righe scritte
// apposta per non ripetere le misure, e nel frattempo le misure erano ripetute
// 1.619 volte altrove. Era anche fermo al mondo a due versioni (`isMobile`
// vero o falso), quindi il tablet prendeva sempre i valori del computer — che
// è precisamente il difetto trovato quel giorno.
//
// Adesso prende il dispositivo (`'telefono' | 'tablet' | 'computer'`) e i
// valori li legge da `ui` in theme.js. Le vecchie firme booleane continuano a
// funzionare, così chi le usava non si rompe.

import { color as T, radius as R, shadow as S, ui, per } from './theme'

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
  fontSize: 12,
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
// Accetta sia il dispositivo (`'telefono'`) sia il vecchio booleano, così i
// chiamanti esistenti non si rompono mentre si converte.
function dispositivo(v) {
  if (v === 'telefono' || v === 'tablet' || v === 'computer') return v
  return v ? 'telefono' : 'computer'
}

export const uiInput = (dev = 'computer') => {
  const u = per(dispositivo(dev))
  return {
  width: '100%',
  height: u(ui.ctrlH),
  padding: '0 12px',
  borderRadius: R.md,                 // 8 - input standard
  border: `1px solid ${T.borderStr}`,
  // 16px su tutto quello che si tocca, telefono E tablet: sotto quella soglia
  // iOS ingrandisce la pagina da solo appena ci si scrive dentro.
  fontSize: u(ui.inputFs),
  color: T.text,
  background: T.bgCard,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 140ms ease, box-shadow 140ms ease',
  }
}

export const uiTextarea = (dev = 'computer') => ({
  ...uiInput(dev),
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

export function uiBtn({ variant = 'primary', size = 'md', disabled = false, fullWidth = false, dev = 'computer' } = {}) {
  const d = dispositivo(dev)
  const u = per(d)
  // Su quello che si tocca il bottone normale sale a 44px: è la misura di un
  // polpastrello. Col mouse 36 bastano e si guadagna spazio.
  const sizes = {
    sm: { height: d === 'computer' ? 28 : 36, padding: '0 10px', fontSize: 12 },
    md: { height: u(ui.ctrlH),               padding: '0 14px', fontSize: 13 },
    lg: { height: 44,                        padding: '0 18px', fontSize: 14 },
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
  fontSize: 12,
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
