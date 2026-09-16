// Foodos - design tokens
// Single source of truth for the redesign. Import the slices you need:
//   import { color, space, radius, font, shadow, motion, layout, z } from './lib/theme'
//
// Existing components may still use the local `C` palette in Dashboard.jsx - that
// palette is kept untouched. New / redesigned UI should reach for these tokens.

export const color = {
  // Brand - bordeaux invariante, deve coincidere con LOGO_COLOR in Logo.jsx
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
  //
  // Audit 2026-06-24: textSoft passato da #8B95A7 (ratio 3.0 su #FFF) a
  // #64748B (ratio 4.6 su #FFF) per soddisfare WCAG AA su body text.
  //
  // 15/09/2026 — **la misura era giusta e il fondo sbagliato**. #64748B fa
  // 4.6 su bianco puro, ma le pagine di Foodos non sono bianche: il fondo è
  // #FAF7F2, le tessere #FDFAF7, le tabelle #F8F4F2, i riquadri #F1F4F8. Su
  // quei fondi il rapporto scende a 4.31–4.45, sotto la soglia di 4.5.
  //
  // Non è un cavillo: chi usa Foodos ha spesso sessant'anni, lavora sotto i
  // neon di un laboratorio e guarda il telefono con le mani infarinate. Una
  // scritta grigio chiaro su panna lì non si legge.
  //
  // Misurato in un browser vero con axe-core (`scripts/audit-contrasto.mjs`),
  // non in happy-dom: i test di accessibilità del progetto girano senza
  // disegnare niente, e axe salta il controllo del contrasto. Erano 467
  // scritte sotto soglia su 32 pagine, e 291 venivano da questo solo colore.
  //
  // #5A6B80 fa 4.95 sul fondo peggiore, e a occhio è lo stesso grigio.
  // textFaint resta solo per metadati/timestamp non critici.
  text:         '#0E1726',
  textMid:      '#475264',
  textSoft:     '#5A6B80',
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
  //
  // Verde e ambra sono scesi di tono il 15/09/2026 per lo stesso motivo del
  // grigio: misurati in un browser vero, #0E9F6E faceva 2.84–3.38 e #D97706
  // faceva 3.02–3.18 sui fondi dell'app, contro i 4.5 richiesti. Sono i
  // colori con cui si scrive «Margine 99%» e «In scadenza»: due delle poche
  // cose che si leggono di sfuggita, di corsa, in laboratorio.
  //
  // I nuovi fanno 4.92 e 4.75 sul fondo peggiore. La tinta è la stessa: in
  // affiancata si vede che sono più scuri, da soli no.
  green:      '#0A7350',
  greenLight: '#E7F6F0',
  amber:      '#B45309',
  // Ambra scura per il TESTO sopra amberLight: l'ambra normale su quel fondo
  // ha poco contrasto. Quattro punti del progetto scrivevano già
  // `T.amberDark || T.amber` aspettandosi questo colore, e ricadevano sempre
  // sul secondo perché la chiave non esisteva.
  amberDark:  '#92400E',
  amberLight: '#FFF8EB',
  red:        '#DC2626',
  // Rosso scuro per il TESTO sopra redLight, come `amberDark` sta a `amber`.
  //
  // Il rosso segnale resta #DC2626 — è la scelta del titolare del 14/09/2026,
  // e non cambia: è il colore che dice «guarda qui». Ma scritto a 12–13px
  // sopra il suo stesso fondo chiaro fa 4.41 di contrasto, appena sotto la
  // soglia: «Urgente» e «~ 3,00 kg» nel magazzino erano fra le scritte meno
  // leggibili di tutto il programma, e sono esattamente quelle che si leggono
  // di corsa. Il fondo, il bordo e le icone restano #DC2626; cambia solo il
  // testo che ci sta sopra.
  redDark:    '#B91C1C',
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

  // Audit layout 2026-09-14: `2xs` e `xs` valevano 10 e 11 px, cioè sotto la
  // soglia di leggibilità che questo progetto si è dato (12). Erano il modo in
  // cui il testo minuscolo rientrava dalla finestra: chi scriveva
  // `font.size.xs` non stava scegliendo 11px, stava scegliendo "piccolo".
  // I nomi restano, così nessun callsite cambia; il valore no.
  size: {
    '2xs': 12, xs: 12, sm: 12, base: 13, md: 14, lg: 16,
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

// Tabular numerals - spread su qualsiasi cella numerica (prezzi, KPI, colonne).
export const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum', 'cv11', 'ss01'" };

// Typography presets - single source of truth della scala. Usa così:
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
  caption:    { fontFamily: _stack, fontSize: 12, fontWeight: 500, letterSpacing: '0.01em',   lineHeight: 1.35 },
  overline:   { fontFamily: _stack, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',   lineHeight: 1.3, textTransform: 'uppercase' },

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

// Motion - all timings use the same easing for coherence
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

// ─── Le misure che cambiano fra le tre versioni ──────────────────────────────
//
// **Un valore, tre versioni, scritto una volta sola.**
//
// Il problema che risolve, misurato il 15/09/2026: 109 punti in 51 file
// scrivevano la stessa misura tre volte — `isMobile ? X : isTablet ? Y : Z` — e
// 1.619 la scrivevano due. Chi ne cambia una sola fa divergere le altre, ed è
// esattamente quello che era successo: il tablet aveva 95 campi di testo sotto
// i 16px perché la regola anti-zoom era scritta `isMobile ? 16 : 13`, e su iPad
// `isMobile` è falso. Nessuno l'aveva deciso.
//
// Come si usa:
//
//     import { useDevice } from '../lib/useIsMobile'
//     import { ui, per } from '../lib/theme'
//
//     const dev = useDevice(), u = per(dev)
//     <button style={{ minHeight: u(ui.ctrlH), padding: u(ui.cardPad) }}>
//
// Da qui in poi chi cambia l'altezza dei controlli la cambia in un posto, e le
// tre versioni si muovono insieme **per costruzione**.
//
// I valori qui sotto non sono inventati: sono quelli già più usati nel
// progetto, contati sulle occorrenze reali.
export const ui = {
  // Altezza dei controlli che si toccano. 44px è la misura di un polpastrello:
  // vale per telefono E tablet, che è il punto che si era perso.
  ctrlH:    { telefono: 44, tablet: 44, computer: 36 },
  // Altezza dei controlli secondari (pastiglie, filtri).
  ctrlHsm:  { telefono: 40, tablet: 44, computer: 34 },
  // Testo dentro i campi. Sotto i 16px iOS ingrandisce la pagina da solo:
  // la regola globale in index.html lo impedisce già per tutto quello che si
  // tocca, questo serve dove il campo non è un <input>.
  inputFs:  { telefono: 16, tablet: 16, computer: 13 },
  // Imbottitura delle schede.
  cardPad:  { telefono: '18px 16px', tablet: '20px 22px', computer: '24px 28px' },
  cardPadSm:{ telefono: '14px 16px', tablet: '16px 18px', computer: '16px 20px' },
  // Griglie: quante colonne stanno bene.
  grid2:    { telefono: '1fr',      tablet: 'repeat(2, 1fr)', computer: 'repeat(2, 1fr)' },
  grid3:    { telefono: '1fr',      tablet: 'repeat(2, 1fr)', computer: 'repeat(3, 1fr)' },
  grid4:    { telefono: '1fr 1fr',  tablet: 'repeat(2, 1fr)', computer: 'repeat(4, 1fr)' },
  // Spazi fra gli elementi.
  gapSm:    { telefono: 8,  tablet: 10, computer: 12 },
  gap:      { telefono: 10, tablet: 14, computer: 16 },
  // Margine laterale della pagina. Il fondo del telefono tiene conto della
  // barra di navigazione.
  // Il 88px in fondo teneva spazio per la barra di navigazione del telefono,
  // tolta il 16/09/2026 su decisione del titolare: le stesse quattro voci
  // erano già nel menu. Su una pagina che si scorre a lungo erano 88px che
  // non si riprendevano mai.
  pagePad:  { telefono: '16px 16px 28px', tablet: '16px 20px 28px', computer: '16px 0 28px' },
}

/**
 * Prende il valore giusto per il dispositivo.
 *
 *     const u = per(useDevice())
 *     u(ui.ctrlH)   // 44 su telefono e tablet, 36 su computer
 *
 * Se il dispositivo non è fra i tre (non dovrebbe succedere) ricade sul
 * computer, che è la versione più conservativa.
 */
export const per = (dispositivo) => (tripla) =>
  (tripla && (tripla[dispositivo] ?? tripla.computer))

/**
 * La stessa cosa di `per`, ma partendo dai due booleani che i componenti hanno
 * già sottomano. Serve a convertire i punti esistenti senza doverli
 * riscrivere: la misura si sposta qui dentro subito, e il passaggio a
 * `useDevice()` si fa con calma.
 *
 *     padding: ui3(isMobile, isTablet, ui.cardPad)
 *
 * invece di `isMobile ? '18px 16px' : isTablet ? '20px 22px' : '24px 28px'`,
 * che è la forma in cui chi cambia un valore fa divergere gli altri due.
 */
export const ui3 = (isMobile, isTablet, tripla) =>
  per(isMobile ? 'telefono' : isTablet ? 'tablet' : 'computer')(tripla)

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
