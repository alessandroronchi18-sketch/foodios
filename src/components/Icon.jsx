// Set icone SVG condiviso - sostituisce le emoji nella UI con icone vettoriali
// ad alta definizione (nitide a ogni zoom, colore via prop). REGOLA: niente emoji.
// Uso: <Icon name="package" size={16} color="#6E0E1A" /> oppure <Icon name="check" />
// Stile: line icons 24x24, stroke currentColor (ereditano il colore del testo).

import React from 'react'

// Ogni voce è il CONTENUTO dell'<svg> (path/shape). viewBox 0 0 24 24.
const P = {
  // documenti / dati
  barChart:   '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  trendUp:    '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  trendDown:  '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
  file:       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  fileText:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  receipt:    '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/>',
  clipboard:  '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  folder:     '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  calendar:   '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  book:       '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  edit:       '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  // azioni
  save:       '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  trash:      '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  plus:       '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  refresh:    '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  search:     '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  download:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload:     '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  hourglass:  '<path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  // oggetti / business
  package:    '<path d="M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  building:   '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6"/><line x1="15" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="9" y2="10"/><line x1="15" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="9" y2="14"/><line x1="15" y1="14" x2="15" y2="14"/><path d="M9 22v-4h6v4"/>',
  bank:       '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  store:      '<path d="M3 9l1-5h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M3 9h18"/>',
  factory:    '<path d="M2 20a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8l-7 4V8l-7 4V4a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/>',
  pin:        '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  camera:     '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  bulb:       '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
  target:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trophy:     '<path d="M6 9a6 6 0 0 0 12 0V3H6zM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3M9 21h6M12 15v6"/>',
  gift:       '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  ticket:     '<path d="M3 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><line x1="13" y1="5" x2="13" y2="19"/>',
  briefcase:  '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  palette:    '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H16c3.3 0 6-2.7 6-6 0-4.9-4.5-8.6-10-8.6z"/>',
  // soldi
  money:      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><line x1="6" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/>',
  euro:       '<path d="M18 7a6 6 0 1 0 0 10M4 11h8M4 14h7"/>',
  card:       '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  cart:       '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  // trasporti
  truck:      '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  scooter:    '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 18h6M18 18V7h2M6 18l4-9h5l3 6"/>',
  // comunicazione
  mail:       '<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2 6 12 13 22 6"/>',
  chat:       '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
  // persone
  user:       '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  robot:      '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4M8 2h8"/><circle cx="8.5" cy="14" r="1.5"/><circle cx="15.5" cy="14" r="1.5"/>',
  // sicurezza
  lock:       '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  lockOpen:   '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  logout:     '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  key:        '<path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 0-1 1l9.5-9.5m-2.9 2.9 2 2m-4-4 2 2"/>',
  shield:     '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  // stato / segnali
  warning:    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/>',
  alert:      '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/>',
  checkCircle:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  xCircle:    '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  check:      '<polyline points="20 6 9 17 4 12"/>',
  x:          '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  party:      '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01"/><path d="M22 2 11 13M11 13l2.5 2.5M11 13l-2.5-2.5"/>',
  bolt:       '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  bug:        '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2M5 7l3 2M19 13h-3M5 13h3M19 19l-3-2M5 19l3-2M12 2v4"/>',
  snow:       '<line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><path d="m20 16-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>',
  star:       '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  gear:       '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  tv:         '<rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/>',
  // dot colorati (pallini di stato) - riempiti
  dot:        '<circle cx="12" cy="12" r="6"/>',
  // categorie attività (landing)
  cake:       '<path d="M4 21h16M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7M4 16h16M12 4v4M12 4c-.7 0-1.3-.5-1.3-1.2C10.7 2 12 .8 12 .8s1.3 1.2 1.3 2C13.3 3.5 12.7 4 12 4z"/>',
  coffee:     '<path d="M18 8h1a3 3 0 0 1 0 6h-1M3 8h15v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM6 2v2M10 2v2M14 2v2"/>',
  iceCream:   '<path d="M8 8a4 4 0 0 1 8 0M7 8h10l-5 13z"/>',
  restaurant: '<path d="M7 2v20M5 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2M17 2c-1.5 0-3 1.5-3 5s1.5 4 3 4v11"/>',
  broom:      '<path d="M19.4 4.6 14 10M9.5 21.5 3 15l4-4 6.5 6.5zM13 11l-2 2M22 2l-6 6"/>',
  pause:      '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  frown:      '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  // frecce / navigazione
  arrowR:     '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  arrowL:     '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  chevR:      '<polyline points="9 18 15 12 9 6"/>',
  chevDown:   '<polyline points="6 9 12 15 18 9"/>',
  // AI / magic
  sparkles:   '<path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6 12 3z"/><path d="M19 14l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>',
  bell:       '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  sun:        '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  lightbulb:  '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 3 2 4 3 6h8c1-2 3-3 3-6a7 7 0 0 0-7-7z"/>',
  copy:       '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  // riproduzione
  play:       '<polygon points="6 4 20 12 6 20 6 4"/>',
  // undo (freccia indietro ad arco)
  undo:       '<polyline points="9 14 4 9 9 4"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  // hardware / sensori
  thermometer:'<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4 4 0 1 0 5 0z"/>',
  phone:      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z"/>',
  archive:    '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/>',
  wallet:     '<path d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-4"/><circle cx="18" cy="14" r="1.5"/>',
}

// alias: più emoji → stessa icona
const ALIAS = {
  trendDownUp: 'trendUp', cake: 'gift', cupcake: 'gift',
  boltSm: 'bolt',          // piccolo fulmine → stesso glyph di bolt
  checkCirc: 'checkCircle', // typo storico → alias all'icona corretta
}

const FILLED = new Set(['dot', 'star', 'bolt', 'party', 'play', 'sparkles'])

export default function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.8, style, title, ...rest }) {
  const key = ALIAS[name] || name
  const body = P[key]
  if (!body) {
    // fallback: pallino neutro, così non si rompe mai il layout
    return <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true" {...rest}><circle cx="12" cy="12" r="4" fill={color === 'currentColor' ? color : color} /></svg>
  }
  const filled = FILLED.has(key)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={filled ? 'none' : color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'text-bottom', ...style }}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + body }}
      {...rest} />
  )
}

// Mappa emoji → nome icona, per le sostituzioni automatiche/manuali.
export const EMOJI_TO_ICON = {
  '📊': 'barChart', '📈': 'trendUp', '📉': 'trendDown',
  '📄': 'fileText', '📋': 'clipboard', '🧾': 'receipt', '📂': 'folder', '📁': 'folder',
  '📅': 'calendar', '📆': 'calendar', '📖': 'book', '📝': 'edit', '✏': 'edit', '✏️': 'edit',
  '💾': 'save', '🗑': 'trash', '🗑️': 'trash', '➕': 'plus', '🔄': 'refresh', '🔁': 'refresh',
  '🔍': 'search', '⬇': 'download', '⬇️': 'download', '⬆': 'upload', '⬆️': 'upload', '📤': 'upload', '📥': 'download',
  '⏳': 'hourglass', '⏰': 'clock', '⏱': 'clock', '🕐': 'clock',
  '📦': 'package', '🏢': 'building', '🏛': 'bank', '🏛️': 'bank', '🏪': 'store', '🏭': 'factory',
  '📍': 'pin', '📷': 'camera', '📸': 'camera', '💡': 'bulb', '🎯': 'target', '🏆': 'trophy',
  '🎁': 'gift', '🎟': 'ticket', '🎟️': 'ticket', '💼': 'briefcase', '🎨': 'palette',
  '💰': 'money', '💶': 'euro', '💵': 'money', '💳': 'card', '💸': 'money', '🛒': 'cart', '🛍': 'cart',
  '🚚': 'truck', '🛵': 'scooter', '🏍': 'scooter',
  '📧': 'mail', '✉': 'mail', '✉️': 'mail', '💬': 'chat', '🗨': 'chat',
  '👤': 'user', '👥': 'users', '🤖': 'robot', '📺': 'tv',
  '🔐': 'lock', '🔒': 'lock', '🔓': 'lockOpen', '🔑': 'key', '🛡': 'shield', '🛡️': 'shield',
  '⚠': 'warning', '⚠️': 'warning', '🚨': 'alert', '✅': 'checkCircle', '❌': 'xCircle',
  '🎉': 'party', '🎊': 'party', '⚡': 'bolt', '🐛': 'bug', '❄': 'snow', '❄️': 'snow',
  '⭐': 'star', '🌟': 'star', '★': 'star', '⚙': 'gear', '⚙️': 'gear',
  '🍰': 'gift', '🧁': 'gift', '🟢': 'dot', '🟡': 'dot', '🔴': 'dot', '🟠': 'dot', '⚪': 'dot', '⚫': 'dot',
}
