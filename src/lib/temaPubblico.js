// La tavolozza delle pagine che vedono anche i non clienti.
//
// Foodos ha due facce, e devono restare due:
//
//   - **dentro** (src/lib/theme.js): grigio-blu, denso, da strumento di
//     lavoro. Tabelle, numeri, schermi pieni.
//   - **fuori** (questo file): crema e bordeaux, con la serif Fraunces nei
//     titoli. È la presentazione, l'accesso, la registrazione — le pagine
//     dove qualcuno decide se fidarsi.
//
// Non è un errore che siano diverse: è una scelta. L'errore era che questi
// venti colori stavano **copiati a mano in due file** (LandingPage.jsx e
// AuthPage.jsx) e avevano già cominciato a divergere — l'accesso aveva
// `danger`/`dangerSoft` che la presentazione non aveva, la presentazione
// aveva `borderSoft` e `text` che l'accesso non aveva. Due copie della stessa
// cosa si allontanano sempre: basta ritoccare un rosso da una parte sola.
//
// Da qui in avanti la fonte è una.

export const temaPubblico = {
  // Fondi
  cream:      '#FBF8F4',
  creamDeep:  '#F4ECE3',
  paper:      '#FFFFFF',

  // Testo
  ink:        '#0F0907',
  inkSoft:    '#1A0F0D',
  text:       '#0F0907',
  textMid:    '#5C4842',
  textSoft:   '#9C887F',
  textOnDark: '#F4ECE3',

  // Marchio
  red:        '#6E0E1A',
  redDeep:    '#8B2415',
  redSoft:    '#FDF2EE',

  // Stati
  green:      '#1F7A48',
  greenSoft:  '#E8F4ED',
  amber:      '#E6BD5A',
  danger:     '#DC2626',
  dangerSoft: '#FEF2F2',

  // Bordi
  border:     '#EBE3DC',
  borderSoft: '#F4ECE3',
}

// La serif dei titoli e la sans di tutto il resto. Fraunces e Inter sono
// caricate in index.html: i fallback servono per il mezzo secondo prima che
// arrivino, e per chi blocca i font esterni.
export const SERIF_PUBBLICO = "'Fraunces', 'Iowan Old Style', 'Apple Garamond', Georgia, serif"
export const SANS_PUBBLICO  = "'Inter', system-ui, -apple-system, sans-serif"
