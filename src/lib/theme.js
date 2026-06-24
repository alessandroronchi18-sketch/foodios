// FoodOS — design tokens
// Single source of truth for the redesign. Import the slices you need:
//   import { color, space, radius, font, shadow, motion, layout, z } from './lib/theme'
//
// Existing components may still use the local `C` palette in Dashboard.jsx — that
// palette is kept untouched. New / redesigned UI should reach for these tokens.

export const color = {
  // Brand — bordeaux invariante, deve coincidere con LOGO_COLOR in Logo.jsx
  brand:        '#6E0E1A',
  brandDark:    '#8A1726',
  brandDarker:  '#4A0612',
  brandLight:   '#FBEEF0',
  brandSoft:    '#F5D9DD',
  brandGradient:'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)',

  // Surfaces
  bg:           '#F7F8FA',
  bgCard:       '#FFFFFF',
  bgSubtle:     '#F1F4F8',
  bgMuted:      '#EEF1F6',
  bgSide:       '#0A0D14',
  bgSideRaised: '#11151E',

  // Text
  // Audit 2026-06-24: textSoft passato da #8B95A7 (ratio 3.0 su #FFF) a
  // #64748B (ratio 4.6 su #FFF) per soddisfare WCAG AA su body text.
  // textFaint resta solo per metadati/timestamp non critici.
  text:         '#0E1726',
  textMid:      '#475264',
  textSoft:     '#64748B',
  textFaint:    '#94A3B8',
  textOnDark:        '#FFFFFF',
  textOnDarkStrong:  'rgba(255,255,255,0.94)',
  textOnDarkMid:     'rgba(255,255,255,0.68)',
  textOnDarkSoft:    'rgba(255,255,255,0.42)',
  textOnDarkFaint:   'rgba(255,255,255,0.28)',

  // Borders
  border:     '#E5E9EF',
  borderStr:  '#D4D9E2',
  borderSoft: '#EEF1F6',
  borderOnDark:      'rgba(255,255,255,0.06)',
  borderOnDarkStr:   'rgba(255,255,255,0.10)',
  borderOnDarkSoft:  'rgba(255,255,255,0.04)',

  // Semantic
  green:      '#0E9F6E',
  greenLight: '#E7F6F0',
  amber:      '#D97706',
  amberLight: '#FFF8EB',
  red:        '#DC2626',
  redLight:   '#FEF2F2',
  blue:       '#2563EB',
  blueLight:  '#EFF6FF',

  white: '#FFFFFF',
  black: '#000000',
};

// 4-based spacing scale
export const space = {
  0: 0, px: 1,
  1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24,
  7: 28, 8: 32, 10: 40, 12: 48, 14: 56, 16: 64,
};

export const radius = {
  none: 0,
  xs:  4,
  sm:  6,
  md:  8,
  lg:  10,
  xl:  12,
  '2xl': 16,
  '3xl': 20,
  full: 9999,
};

// ─── Typography ──────────────────────────────────────────────────────────────
// Stack: Inter per UI/dati densi + JetBrains Mono per codici/ID. I numeri non
// usano una mono dedicata ma Inter con `font-variant-numeric: tabular-nums` per
// allineamento colonne senza spezzare il ritmo tipografico.

export const font = {
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",

  numeric: { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum', 'cv11', 'ss01'" },

  size: {
    '2xs': 10, xs: 11, sm: 12, base: 13, md: 14, lg: 16,
    xl: 18, '2xl': 22, '3xl': 28, '4xl': 36, '5xl': 48,
  },

  weight: {
    regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
  },

  tracking: {
    tight:   '-0.02em',
    snug:    '-0.01em',
    normal:  '0',
    wide:    '0.02em',
    wider:   '0.06em',
    widest:  '0.12em',
  },

  leading: {
    tight:   1.1,
    snug:    1.25,
    normal:  1.4,
    relaxed: 1.55,
    loose:   1.7,
  },
};

// Tabular numerals — spread su qualsiasi cella numerica (prezzi, KPI, colonne).
export const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum', 'cv11', 'ss01'" };

// Typography presets — single source of truth della scala. Usa così:
//   import { typo, tnum, getTypo } from './lib/theme'
//   <h1 style={typo.h1}>…</h1>
//   <span style={{ ...typo.numSm }}>€12.345,67</span>
//   const t = getTypo(isMobile); <h1 style={t.h1}>…</h1>
const _stack = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const typo = {
  display:    { fontFamily: _stack, fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em',  lineHeight: 1.1 },
  h1:         { fontFamily: _stack, fontSize: 24, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.2 },
  h2:         { fontFamily: _stack, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em',  lineHeight: 1.3 },
  h3:         { fontFamily: _stack, fontSize: 15, fontWeight: 600, letterSpacing: '-0.005em', lineHeight: 1.35 },
  body:       { fontFamily: _stack, fontSize: 14, fontWeight: 400, letterSpacing: 0,          lineHeight: 1.5 },
  bodyStrong: { fontFamily: _stack, fontSize: 14, fontWeight: 600, letterSpacing: 0,          lineHeight: 1.5 },
  small:      { fontFamily: _stack, fontSize: 12, fontWeight: 500, letterSpacing: 0,          lineHeight: 1.4 },
  caption:    { fontFamily: _stack, fontSize: 11, fontWeight: 500, letterSpacing: '0.01em',   lineHeight: 1.35 },
  overline:   { fontFamily: _stack, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',   lineHeight: 1.3, textTransform: 'uppercase' },

  // Numerici (tabular-nums incluso)
  num:   { fontFamily: _stack, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15,
           fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum', 'cv11', 'ss01'" },
  numSm: { fontFamily: _stack, fontSize: 14, fontWeight: 600, letterSpacing: 0,          lineHeight: 1.3,
           fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum', 'cv11', 'ss01'" },
  numLg: { fontFamily: _stack, fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1,
           fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum', 'cv11', 'ss01'" },

  // Codice/ID (vera mono)
  code:  { fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
           fontSize: 12, fontWeight: 500, letterSpacing: 0, lineHeight: 1.4 },
};

// Mobile: titoli scalati −15/20%, body invariato (≥14px per touch).
export const typoMobile = {
  ...typo,
  display: { ...typo.display, fontSize: 26 },
  h1:      { ...typo.h1,      fontSize: 20 },
  h2:      { ...typo.h2,      fontSize: 16 },
  h3:      { ...typo.h3,      fontSize: 14 },
  num:     { ...typo.num,     fontSize: 18 },
  numLg:   { ...typo.numLg,   fontSize: 24 },
};

export const getTypo = (isMobile) => (isMobile ? typoMobile : typo);

export const shadow = {
  none: 'none',
  xs:   '0 1px 2px rgba(15,23,42,0.04)',
  sm:   '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.04)',
  md:   '0 4px 12px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)',
  lg:   '0 10px 30px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.04)',
  xl:   '0 20px 50px rgba(15,23,42,0.12), 0 4px 12px rgba(15,23,42,0.05)',
  inner:'inset 0 1px 2px rgba(15,23,42,0.06)',
  brand:    '0 6px 20px rgba(110,14,26,0.28)',
  brandSoft:'0 2px 8px rgba(110,14,26,0.18)',
  drawer:   '4px 0 30px rgba(0,0,0,0.32)',
  fab:      '0 8px 24px rgba(110,14,26,0.42)',
};

// Motion — all timings use the same easing for coherence
export const motion = {
  ease:    'cubic-bezier(0.32, 0.72, 0, 1)',
  spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
  durFast:    '0.12s',
  durBase:    '0.18s',
  durSlow:    '0.28s',
  durLazy:    '0.40s',
};

export const breakpoint = {
  mobile:  767,
  tablet:  1023,
  desktop: 1280,
  wide:    1536,
};

export const z = {
  base:    0,
  raised:  10,
  sticky:  30,
  overlay: 49,
  drawer:  50,
  fab:     55,
  bottomNav: 50,
  topbar:  30,
  toast:   100,
  modal:   200,
  popover: 300,
};

export const layout = {
  sidebarWidth:    240,
  topbarHeight:    56,
  bottomNavHeight: 64,
  contentMaxWidth: 1440,
  contentPadX:     { mobile: 16, desktop: 32 },
  contentPadY:     { mobile: 16, desktop: 28 },
};

// Common keyframes (inject once via <style>)
export const keyframes = `
  @keyframes fos_pageIn  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fos_fadeIn  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fos_pulse   { 0%, 100% { box-shadow: 0 0 0 0 rgba(110,14,26,0.55); } 50% { box-shadow: 0 0 0 5px rgba(110,14,26,0); } }
  @keyframes fos_slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
`;
