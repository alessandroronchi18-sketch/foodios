// Primitive condivise tra le view estratte da Dashboard.jsx.
// Sono volutamente piccole e isolate per evitare il "monolite delle utility".
// Una volta che tutto è migrato, alcune potranno diventare componenti dedicati in components/.

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { color as T, radius as R, font } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from '../components/Icon'

// Palette "C.*" usata dal vecchio Dashboard.jsx - mappa diretta ai token theme.
// Usata per non riscrivere ogni accesso a C.foo nei body delle view.
export const C = {
  white:      T.bgCard,
  bgCard:     T.bgCard,
  bg:         T.bg,
  bgSubtle:   T.bgSubtle,
  text:       T.text,
  textMid:    T.textMid,
  textSoft:   T.textSoft,
  border:     T.border,
  borderStr:  T.borderStr,
  borderSoft: T.borderSoft,
  green:      T.green,
  greenLight: T.greenLight,
  amber:      T.amber,
  amberLight: T.amberLight,
  // Il bordeaux del marchio. È il colore delle AZIONI: pulsanti principali,
  // voce di menu attiva, link. Si chiama `red` per ragioni storiche.
  red:        T.brand,
  redLight:   T.brandLight,
  redDark:    T.brandDark,
  // Il rosso degli ALLARMI, che è un'altra cosa: giacenza sotto zero, scorta
  // finita, margine negativo, salvataggio fallito.
  //
  // Scelta del titolare, 14/09/2026. Prima i due lavori li faceva lo stesso
  // bordeaux: in una pagina con un allarme vero, il riquadro rosso dell'errore
  // e il pulsante rosso dell'azione avevano lo stesso colore, e l'occhio non
  // sapeva dove guardare. Due colori, due significati.
  alert:      T.red,
  // Per il TESTO rosso sopra un fondo rosso chiaro: il rosso segnale su
  // `alertLight` fa 4.41 di contrasto, appena sotto la soglia, e a 12px si
  // fatica. Il fondo e le icone restano `alert`.
  alertDark:  T.redDark,
  alertLight: T.redLight,
}

// Formattazione monospaced numerica
export const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

// Colore margine: verde ≥60, ambra 40-60, brand <40
export const margColor = pct => pct >= 60 ? C.green : pct >= 40 ? C.amber : C.red

// Formattazione valuta / percentuale.
//
// Le definizioni vivono in `lib/formatIt.js`, che non e' un modulo React e
// quindi lo possono importare anche `api/` e la generazione dei PDF. Qui
// restano solo i ri-export, così i callsite esistenti non cambiano.
export { fmt, fmt0, fmtp, fmtp0, fmtpSegno, fmtp0Segno } from '../lib/formatIt'

// CSS futuristic-clean per tile/KPI shared. Iniettato una volta (idempotente
// se il browser carica più volte _shared - il selettore di style id evita
// duplicati).
// - fos-kpi-tile: hover lift drammatico + ombra brand colorata
// - accent strip animato superiore opzionale (className fos-kpi-accent)
// - sheen sweep al primo render (sottile riflesso che scorre, una volta sola)
// Tutto pause su prefers-reduced-motion.
if (typeof document !== 'undefined' && !document.getElementById('fos-kpi-css')) {
  const s = document.createElement('style')
  s.id = 'fos-kpi-css'
  s.textContent = `
    @keyframes _fos_kpiAccent {
      0%, 100% { background-position: 0% 50%; }
      50%      { background-position: 100% 50%; }
    }
    @keyframes _fos_kpiSheen {
      0%   { transform: translateX(-110%) skewX(-18deg); opacity: 0; }
      40%  { opacity: 0.55; }
      100% { transform: translateX(220%)  skewX(-18deg); opacity: 0; }
    }
    @keyframes _fos_shBarPulse {
      0%, 100% { background-position: 50% 0%;   box-shadow: 0 0 12px rgba(232,75,58,0.45), inset 0 1px 0 rgba(255,255,255,0.18); }
      50%      { background-position: 50% 100%; box-shadow: 0 0 18px rgba(232,75,58,0.65), inset 0 1px 0 rgba(255,255,255,0.22); }
    }
    .fos-kpi-tile {
      transition: transform 0.22s cubic-bezier(.32,.72,0,1), box-shadow 0.22s ease, border-color 0.22s ease;
    }
    .fos-kpi-tile:hover {
      transform: translateY(-4px);
      box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 18px 40px rgba(110,14,26,0.14), 0 2px 8px rgba(110,14,26,0.08);
      border-color: rgba(110,14,26,0.20);
    }
    .fos-kpi-tile.fos-kpi-highlight:hover {
      box-shadow: 0 22px 50px rgba(110,14,26,0.42), inset 0 1px 0 rgba(255,255,255,0.22);
    }
    .fos-kpi-accent {
      animation: _fos_kpiAccent 6s ease-in-out infinite;
    }
    .fos-kpi-sheen {
      animation: _fos_kpiSheen 1.6s cubic-bezier(.32,.72,0,1) 0.2s 1 forwards;
    }
    /* Section header bar - pulsa brand→corallo→brand 3s in loop */
    .fos-sh-bar {
      animation: _fos_shBarPulse 3s ease-in-out infinite;
    }
    /* Tile generiche (.fos-tile usata in 26 punti del codice).
       Qui sopra ogni tessera aveva una lineetta decorativa di 2px in cima,
       sfumata dal bordeaux a un corallo acceso. Fotografata a 390px si vede
       per quello che è: una riga rossa sopra il bordo arrotondato, su schede
       che parlano di verde (Ricavi) o di blu (Produzione), in un colore
       (#E84B3A) che nel resto del prodotto non esiste. Sei tessere nella home,
       sei righe rosse. Tolta: il colore del marchio torna a voler dire
       qualcosa. L'alzata al passaggio del mouse resta, e sul telefono non
       c'entra comunque niente perché il mouse non c'è. */
    .fos-tile {
      position: relative;
    }
    .fos-tile:hover {
      box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 20px 44px rgba(110,14,26,0.12), 0 2px 8px rgba(110,14,26,0.06) !important;
      border-color: rgba(110,14,26,0.15) !important;
    }
    /* Page container per le card grandi non-KPI (Conto economico, Costi
       extra-food, Tabella riepilogativa, ecc.): alzata al passaggio del
       mouse. Aveva anche lei la lineetta corallo in cima, per giunta
       animata in ciclo di 7 secondi: cinque schede di conto economico con
       cinque lucine che pulsano. Tolta insieme a quella delle tessere. */
    .fos-card-glow {
      position: relative;
      transition: transform 0.22s cubic-bezier(.32,.72,0,1), box-shadow 0.22s ease, border-color 0.22s ease;
    }
    .fos-card-glow:hover {
      transform: translateY(-2px);
      box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 18px 40px rgba(110,14,26,0.10) !important;
      border-color: rgba(110,14,26,0.15) !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .fos-kpi-tile, .fos-tile, .fos-card-glow { transition: none; }
      .fos-kpi-tile:hover, .fos-tile:hover, .fos-card-glow:hover { transform: none; }
      .fos-kpi-accent, .fos-kpi-sheen, .fos-sh-bar { animation: none !important; }
    }
  `
  document.head.appendChild(s)
}

// KPI card grande (usata da Magazzino, Chiusura, Produzione, Ricettario, ecc.)
// Look coerente con la Dashboard home: decoro radiale, chip icona, accento colore.
//
// ── 15/09/2026, riordino per il telefono ────────────────────────────────────
// Due cose tolte e una spostata.
//
// Tolti: la lineetta animata in cima (2px, bordeaux→corallo, ciclo di 6s) e il
// riflesso che attraversava la tessera al primo disegno. Su un telefono queste
// tessere stanno tre o quattro per schermata: erano tre o quattro lucine che
// pulsano e altrettanti bagliori che passano, ogni volta che si apre la
// pagina. Sono decorazioni che promettono un significato che non c'è.
//
// Spostata: sul telefono l'icona sta sulla stessa riga dell'etichetta invece
// che sopra. La tessera passa da 187px a circa 130, e su Ricettario le tre
// tessere smettono di occupare mezzo schermo prima della ricerca. Le
// minHeight di etichetta / valore / sottotitolo restano, così le tessere
// affiancate restano incolonnate fra loro.
export function KPI({ label, value, sub, color, highlight, icon, onClick }) {
  const isMobile = useIsMobile()
  const accent = color || T.brand
  const chipBg = highlight ? 'rgba(255,255,255,0.14)' : 'rgba(110,14,26,0.10)'
  const chipColor = highlight ? '#fff' : accent
  return (
    <div className={`fos-tile fos-kpi-tile${highlight ? ' fos-kpi-highlight' : ''}`} onClick={onClick} style={{
      position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
      background: highlight ? 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' : T.bgCard,
      border: `1px solid ${highlight ? '#4A0612' : T.border}`, borderRadius: R['2xl'],
      padding: isMobile ? '14px 16px' : '18px 20px',
      boxShadow: highlight ? '0 14px 34px rgba(110,14,26,0.32), inset 0 1px 0 rgba(255,255,255,0.18)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* decoro radiale d'angolo */}
      <div style={{ position: 'absolute', top: -28, right: -28, width: 92, height: 92, borderRadius: '50%',
        background: highlight ? 'rgba(255,255,255,0.07)' : `${accent}14`, opacity: 0.6, pointerEvents: 'none' }}/>
      {icon && !isMobile && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, background: chipBg, color: chipColor, fontSize: 16,
            boxShadow: highlight ? 'inset 0 1px 0 rgba(255,255,255,0.14)' : `0 4px 12px ${accent}28` }}>{icon}</span>
        </div>
      )}
      {/* Etichetta a 12px, non 10,5: è il minimo leggibile della casa, e
          questo componente disegna le tessere di TUTTE le pagine (magazzino,
          formati, scadenzario, P&L…). Il colore passa da textSoft a textMid:
          textSoft su fondo bgSubtle fa 4,31:1, sotto il minimo di
          leggibilità, e queste etichette stanno spesso su quel fondo.
          minHeight resta uniforme così le tessere affiancate restano
          incolonnate fra loro. */}
      {/* 16/09/2026, misurando le tessere dentro l'account vero: nel
          Ricettario «GUSTI» e «FOOD COST MEDIO» partivano a 8px di distanza
          l'una dall'altra, affiancate.
          Il motivo era qui: `alignItems: center`. L'altezza minima di 30px
          tiene incolonnati i VALORI (ed è giusta), ma il testo dentro quel
          riquadro veniva centrato: un'etichetta corta su una riga sola
          resta a mezz'aria e parte 7,5px più in basso, una lunga va a capo,
          riempie i 30px e parte da zero. Due tessere accanto, due quote
          diverse — e si vede.
          Con `flex-start` ogni etichetta parte dallo stesso punto, che vada
          a capo o no.
          Nota su un tentativo sbagliato: per rimettere in asse il pallino
          dell'icona (26px) con la prima riga di testo (15px) avevo messo 5px
          di spinta sul testo. Misurato sul sito vero, quei 5px rendevano il
          riquadro dell'etichetta alto 35px quando il testo va a capo e 30
          quando sta su una riga — e così, sistemate le etichette, si
          sfalsavano i NUMERI di 5px. L'altezza minima di 30 deve restare
          l'altezza vera in tutti e due i casi: due righe a 12px con
          interlinea 1,25 fanno esattamente 30. Il pallino allineato in alto
          accanto al testo va benissimo. */}
      <div style={{ position: 'relative', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
        color: highlight ? 'rgba(255,255,255,0.82)' : T.textMid, marginBottom: 6,
        minHeight: 30, lineHeight: 1.25,
        display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {icon && isMobile && (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: R.md, background: chipBg, color: chipColor, fontSize: font.size.base, flexShrink: 0 }}>{icon}</span>
        )}
        <span style={{ minWidth: 0 }}>{label}</span>
      </div>
      {/* Audit 2026-06-25: fontSize auto-shrink in base alla lunghezza del value.
          Risolve due bug:
          (1) Valori numerici con 2 decimali (es. "611,50 €") troncati con "..."
              nei box stretti del grid 2-col mobile.
          (2) Valori alfanumerici lunghi (es. "Top fornitore: CONSORZIO COOP X")
              che andavano fuori dal box.
          Bucket: short ≤6 char / medium 7-12 char / long >12 char. */}
      {(() => {
        const valStr = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
        const len = valStr.length || 6
        // I gradini stanno sulla scala del progetto (theme.js). Il 19 che
        // c'era qui non è un gradino: nella stessa schermata, due riquadri
        // affiancati con valori di lunghezza diversa uscivano uno a 19 e uno
        // a 18 o 20, e le cifre non partivano dalla stessa altezza.
        const fs = isMobile
          ? (len <= 6 ? 24 : len <= 12 ? 18 : 14)
          : (len <= 6 ? 30 : len <= 14 ? 24 : 18)
        return (
          <div style={{ position: 'relative', fontSize: fs, fontWeight: 800, color: highlight ? T.textOnDark : color || T.text,
            letterSpacing: '-0.035em', lineHeight: 1.15, minHeight: isMobile ? 28 : 32, whiteSpace: 'nowrap', overflow: 'hidden', ...TNUM }}>
            {value}
          </div>
        )
      })()}
      {sub
        ? <div style={{ position: 'relative', fontSize: 12, color: highlight ? 'rgba(255,255,255,0.7)' : T.textSoft, marginTop: 6, fontWeight: 500, minHeight: isMobile ? 28 : 32, lineHeight: 1.35 }}>{sub}</div>
        : <div style={{ minHeight: isMobile ? 28 : 32, marginTop: 6 }}/>
      }
    </div>
  )
}

// Format valore per tooltip Recharts: sceglie l'unita' e i decimali in
// base al nome della serie. Copre i casi tipici di FoodOS (€, %, kg, g)
// senza dover configurare ogni <Bar unit=...> a mano.
//
// Regole (allineate a CLAUDE.md → "Formattazione numeri"):
// - € : arrotondato all'unita' se |n|>=100 (i box grandi non hanno decimali),
//       2 decimali sotto (per l'accuratezza sui piccoli importi)
// - % : sempre 1 decimale
// - kg: 1 decimale se |n|<100, intero sopra (Mara produce ~2000 kg/mese)
// - g : intero, separatore migliaia IT
// - fallback: intero IT (evita "2126.4300000000026")
export function formatChartValue(value, name) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '')
  const s = String(name || '').toLowerCase()
  if (s.includes('€') || /\b(ricavo|fatturato|costo|margine\s*€)\b/.test(s)) {
    if (Math.abs(n) >= 100) return `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' })} €`
    return `${n.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  }
  if (s.includes('%') || /\b(percent|margine\s*%)\b/.test(s)) {
    return `${n.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })}%`
  }
  if (s.includes('kg')) {
    if (Math.abs(n) >= 100) return `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' })} kg`
    return `${n.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} kg`
  }
  if (/\bg\b|grammi/.test(s)) {
    return `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' })} g`
  }
  return Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' })
}

// Tooltip Recharts condiviso (era inline in Dashboard.jsx).
// Importato da StoricoProduzioneView, PLView, ecc. - senza questo modulo dedicato
// le view post-code-split sbattevano contro `ChartTip is not defined`.
export const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '10px 14px', fontSize: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>{label}</div>
      {/* Audit 2026-07-01 MEDIUM: key={dataKey} stabile (stacked charts hanno
          ordine variabile in payload) - prima key={i} swappava i colori al
          riordino interno di Recharts. */}
      {payload.map((p, i) => (
        <div key={p.dataKey || p.name || i} style={{ color: p.color || C.red }}>
          {p.name}: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatChartValue(p.value, p.name || p.dataKey)}</b>
        </div>
      ))}
    </div>
  )
}

/** Il nome di un ingrediente come si scrive: prima lettera maiuscola, resto
 *  minuscolo, trattini bassi al posto degli spazi tolti.
 *
 *  `"zucchero_canna"` → `"Zucchero canna"`.
 *
 *  17/09/2026, richiesta del titolare: «i nomi degli ingredienti con la prima
 *  maiuscola e il resto minuscolo, sia nel Ricettario sia in Nuovo gusto».
 *  Nel Ricettario c'era già, ma scritto dentro TortaCard, dove nessun altro
 *  poteva prenderlo — e infatti in Nuovo gusto gli stessi nomi uscivano tutti
 *  in maiuscolo, perché è così che stanno scritti nel database (è la
 *  convenzione del prodotto, `prodotto_nome` sempre maiuscolo). Qui si cambia
 *  solo come si leggono: il dato salvato resta quello di prima.
 */
export function formatNome(s) {
  if (!s) return ''
  const pulito = String(s).replace(/_/g, ' ').toLowerCase().trim()
  return pulito.charAt(0).toUpperCase() + pulito.slice(1)
}

export function Badge({ label, color = 'green' }) {
  const s = {
    green: { bg: C.greenLight, c: C.green },
    red:   { bg: C.redLight,   c: C.red   },
    amber: { bg: C.amberLight, c: C.amber },
    gray:  { bg: '#F3F3F3',    c: '#888'  },
  }[color] || { bg: '#F3F3F3', c: '#888' }
  return (
    <span style={{
      background: s.bg, color: s.c, fontSize: 12, fontWeight: 600,
      padding: '3px 8px', borderRadius: 12, letterSpacing: '0.04em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// senzaPrezzo: la ricetta non ha un prezzo di vendita impostato, quindi il
// margine non e' basso ne' eccellente: non si sa. Audit 2026-09-09 - prima
// una ricetta senza prezzo arrivava qui con pct 0 e usciva "Basso - rivedere"
// in rosso, mandando a rivedere il food cost quando mancava solo il prezzo.
export const margBadge = (pct, senzaPrezzo = false) => {
  if (senzaPrezzo) return <Badge label="Prezzo da impostare" color="gray"/>
  if (pct === null || pct === undefined) return null
  if (pct >= 70) return <Badge label="Eccellente" color="green"/>
  if (pct >= 55) return <Badge label="Buono" color="green"/>
  if (pct >= 40) return <Badge label="Accettabile" color="amber"/>
  return <Badge label="Basso - rivedere" color="red"/>
}

// Tooltip su hover (portato fuori dal flow per essere always-on-top)
// ── La spiegazione si apre anche col dito ──────────────────────────────
//
// 17/09/2026, segnalato dal titolare: «controlla che i mouseover funzionino in
// tutto il tool, tipo ora in quella sezione non funzionano».
//
// Non era quella sezione: era questo componente. Reagiva SOLO a
// `onMouseEnter`, cioè a un mouse. Su un telefono o su un tablet quel gesto
// non esiste e la spiegazione non si apriva mai — e il tablet è proprio dove
// sta chi lavora in laboratorio. Ogni «?» del prodotto era muto per metà
// delle persone che lo usano.
//
// Ora apre in tre modi, uno per ogni modo di usare il prodotto:
//   · il mouse ci passa sopra → si apre e si chiude da sola;
//   · il dito tocca           → si apre, e si richiude toccando di nuovo o
//                               toccando altrove;
//   · la tastiera ci arriva   → si apre col fuoco, si chiude con Esc.
//
// Si chiude anche quando la pagina scorre o cambia dimensione: la spiegazione
// è posizionata in coordinate di finestra, e restare aperta mentre il suo
// bersaglio scivola via vorrebbe dire indicare la cosa sbagliata.
export function Tip({ text, children, width = 220 }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const ref = useRef(null)
  const misura = (el) => {
    const r = el.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 8 })
  }
  const handleEnter = (e) => { misura(e.currentTarget); setShow(true) }
  // `stopPropagation` serve perché altrimenti il click che apre arriva anche
  // al `document` qui sotto, che la richiuderebbe nello stesso istante.
  const handleTocco = (e) => {
    e.stopPropagation()
    if (show) { setShow(false); return }
    misura(e.currentTarget)
    setShow(true)
  }

  useEffect(() => {
    if (!show) return undefined
    const chiudi = () => setShow(false)
    const conEsc = (e) => { if (e.key === 'Escape') setShow(false) }
    document.addEventListener('click', chiudi)
    document.addEventListener('keydown', conEsc)
    window.addEventListener('scroll', chiudi, true)
    window.addEventListener('resize', chiudi)
    return () => {
      document.removeEventListener('click', chiudi)
      document.removeEventListener('keydown', conEsc)
      window.removeEventListener('scroll', chiudi, true)
      window.removeEventListener('resize', chiudi)
    }
  }, [show])

  if (!text) return children
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      tabIndex={0} role="button" aria-label={`Spiegazione: ${text}`}
      onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}
      onClick={handleTocco}
      onFocus={handleEnter} onBlur={() => setShow(false)}>
      {children}
      {show && (
        <span style={{
          position: 'fixed',
          left: Math.min(pos.x - width / 2, window.innerWidth - width - 8),
          top: pos.y,
          transform: 'translateY(-100%)',
          zIndex: 99999,
          background: T.tooltipBg,
          color: 'rgba(255,255,255,0.92)',
          fontSize: 12, fontWeight: 500, lineHeight: 1.55,
          padding: '10px 14px', borderRadius: 8,
          width, pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          whiteSpace: 'normal',
          textAlign: 'left',
          letterSpacing: 'normal',
          textTransform: 'none',
        }}>
          {text}
          <span style={{
            position: 'absolute', left: '50%', top: '100%',
            transform: 'translateX(-50%)',
            border: '5px solid transparent',
            borderTopColor: '#1C0A0A',
          }}/>
        </span>
      )}
    </span>
  )
}

// Page header standard (titolo gestito dalla topbar, qui solo subtitle + action)
//
// Su mobile il sottotitolo prende una riga sua e le azioni scendono sotto.
// Prima avevano `flex: 1, minWidth: 0`: invece di mandare i pulsanti a capo,
// il testo si strizzava accanto a loro e una frase di dieci parole finiva su
// quattro righe alte quanto i bottoni.
export function PageHeader({ subtitle, action }) {
  const isMobile = useIsMobile()
  if (!subtitle && !action) return null
  return (
    <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: isMobile ? 12 : 16, flexWrap: 'wrap' }}>
      {subtitle && <div style={{ fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5, fontWeight: 500, flex: isMobile ? '1 1 100%' : 1, minWidth: 0 }}>{subtitle}</div>}
      {action}
    </div>
  )
}

// Tabella primitives (PLTable, SensTable, etc.)
export const TD = ({ children, right, bold, color, mono, small }) => (
  // Audit layout 2026-09-14: le cifre tabellari si mettevano solo con `mono`,
  // quindi nella stessa tabella la colonna dei ricavi era incolonnata e quella
  // delle percentuali no — e le percentuali sono proprio quelle che si leggono
  // una sotto l'altra. Le cifre tabellari non fanno danno sul testo (agiscono
  // solo sui numeri), quindi valgono per tutte le celle. `mono` resta per
  // compatibilità con i callsite, ma non cambia più niente.
  <td style={{
    padding: '10px 14px', textAlign: right ? 'right' : 'left',
    fontWeight: bold ? 700 : 500, color: color || C.text,
    ...TNUM,
    fontSize: small ? 12 : 12, whiteSpace: 'nowrap',
  }}>{children}</td>
)

export const TH = ({ children, right }) => (
  // Audit 2026-07-01 LOW: fontSize 8 era sotto-soglia AA su retina/mobile.
  // 10 con letterSpacing un po' ridotto resta compatto ma leggibile.
  <th style={{
    padding: '10px 14px', textAlign: right ? 'right' : 'left',
    fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: C.textSoft,
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  }}>{children}</th>
)

// Hook ordinabile (riusato da PLTable, SensTable, TopIngredientiTable, ecc.)
export function useSortable(defaultKey, defaultDir = 'desc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)
  const toggleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return prev }
      setSortDir('desc'); return key
    })
  }, [])
  const sort = (arr, getValue) => [...arr].sort((a, b) => {
    const va = getValue ? getValue(a, sortKey) : (a[sortKey] ?? 0)
    const vb = getValue ? getValue(b, sortKey) : (b[sortKey] ?? 0)
    const mul = sortDir === 'desc' ? -1 : 1
    return typeof va === 'string' ? mul * va.localeCompare(vb) : mul * (va - vb)
  })
  return { sortKey, sortDir, toggleSort, sort }
}

// Header tabella sortable.
// Audit 2026-07-01 LOW: a11y keyboard. role=button + tabIndex + Enter/Space.
// aria-sort indica direzione corrente per screen reader.
export function SortTH({ k, children, right, active, dir, onToggle, tip }) {
  return (
    <th
      role="button"
      tabIndex={0}
      aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}
      onClick={() => onToggle(k)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(k)
        }
      }}
      title={tip || undefined}
      style={{
        padding: '10px 16px', textAlign: right ? 'right' : 'left',
        // 12px e un grigio leggibile: era 10px con #94A3B8 sul bianco, cioè
        // 2,56:1 — sotto la metà del minimo. Queste sono le intestazioni con
        // cui si ordina una tabella: se non si leggono, non si clicca.
        fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
        textTransform: 'uppercase', whiteSpace: 'nowrap',
        color: active ? '#6E0E1A' : T.textMid,
        borderBottom: '1px solid #E2E8F0',
        background: active ? '#FEF2F2' : 'transparent',
        cursor: 'pointer', userSelect: 'none',
        transition: 'background 0.15s',
        textDecoration: tip ? 'underline dotted' : 'none', textUnderlineOffset: 3,
      }}>
      {/* Il verso dell'ordinamento con l'icona, non coi caratteri ▼▲: quelli
          cambiano forma da un dispositivo all'altro e non si allineano al
          testo. `aria-sort` qui sopra lo dice già a chi usa lo screen reader. */}
      {children}
      {active && (
        <Icon name={dir === 'desc' ? 'chevDown' : 'chevUp'} size={11}
          style={{ marginLeft: 4, verticalAlign: 'middle' }} />
      )}
    </th>
  )
}

// Section header con barra brand. Audit 2026-06-25: barra ora gradient
// brand→corallo→brand con pulse + glow brand sottile. Propaga automaticamente
// a tutte le view che usano SH (PLView, Eventi, SpreciOmaggi, ecc.).
export function SH({ children, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, marginTop: 32 }}>
      <div className="fos-sh-bar" aria-hidden="true" style={{
        width: 4, height: 20, borderRadius: 3, flexShrink: 0, alignSelf: 'center',
        background: 'linear-gradient(180deg, #6E0E1A 0%, #E84B3A 50%, #6E0E1A 100%)',
        backgroundSize: '100% 200%',
        boxShadow: '0 0 12px rgba(232,75,58,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
      }}/>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.015em' }}>{children}</h2>
        {sub && <div style={{ fontSize: 12, color: T.textSoft, marginTop: 3, letterSpacing: '-0.005em', lineHeight: 1.55 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Una tabella che sul telefono diventa un elenco di schede ────────────────
//
// Il problema, detto dal titolare guardando «Produzione» dal telefono: «non
// riesco a leggere nulla, la tabella è troppo grande». Misurate, le tabelle
// larghe rimaste nel programma erano sei, da 720 a 1.215 pixel, dentro uno
// schermo da 390: da due a tre schermate di scorrimento laterale per leggere
// una riga sola, e nel frattempo l'intestazione della colonna è sparita a
// sinistra, quindi non si sa nemmeno più che numero si sta guardando.
//
// Una tabella è una griglia: si legge per colonne, confrontando righe fra
// loro. Su uno schermo alto e stretto quel confronto non è possibile e basta,
// e allungare la pagina di lato non lo rende possibile: lo rende faticoso.
// Quindi sul telefono si cambia mestiere — una scheda per riga, con i numeri
// uno sotto l'altro accanto al loro nome. Si perde il confronto a colpo
// d'occhio fra righe (che sul telefono non c'era comunque) e si guadagna che
// ogni singola riga si legge tutta, senza muovere niente.
//
// Come si usa:
//
//   <TabellaOSchede
//     righe={list} chiave={(r) => r.k} minWidth={720}
//     titolo={(r) => r.nome}
//     colonne={[
//       { k: 'qty',      label: 'Qty tot.',  destra: true, cella: (r) => `${r.qty}g` },
//       { k: 'costoTot', label: 'Costo',     destra: true, cella: (r) => euro(r.costoTot), forte: true },
//     ]}
//     intestazione={<tr>…</tr>}          // la thead vera, solo per il computer
//     piede={<tr>…</tr>}                 // la tfoot vera, solo per il computer
//     riassunto={(r) => …}               // opzionale: cosa mostrare in cima alla scheda
//   />
//
// Le colonne con `nascondiSuTelefono` restano solo nella tabella: servono a
// chi confronta (una barra di avanzamento, un pallino colorato) e in una
// scheda sono rumore.
export function TabellaOSchede({
  righe, chiave, colonne, titolo, riassunto,
  minWidth, intestazione, piede, corpo,
  dettaglio, apriEtichetta = 'Apri il dettaglio',
  // La riga dei totali in fondo alla tabella: nelle schede non può essere una
  // riga, quindi la si passa già fatta (di solito una scheda in più).
  riepilogoTelefono,
  vuoto = 'Niente da mostrare.',
}) {
  const isMobile = useIsMobile()
  // `dettaglio` = la riga che sul computer si apre cliccandoci sopra. Nelle
  // schede diventa un pulsante esplicito: su una scheda intera «cliccabile»
  // non si capisce dove finisce il bersaglio, e scorrendo col pollice si apre
  // per sbaglio.
  const [aperte, setAperte] = useState(() => new Set())

  if (!isMobile) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm, minWidth }}>
          {intestazione}
          {corpo}
          {piede}
        </table>
      </div>
    )
  }

  if (!righe || righe.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: C.textSoft, fontSize: font.size.base }}>{vuoto}</div>
  }

  const visibili = colonne.filter(c => !c.nascondiSuTelefono)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {righe.map((r, i) => (
        <div key={chiave ? chiave(r, i) : i} style={{
          border: `1px solid ${C.border}`, borderRadius: 12,
          background: C.bgCard, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 12px', borderBottom: `1px solid ${C.borderSoft}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            order: 0,
          }}>
            <div style={{ fontSize: font.size.md, fontWeight: 800, color: C.text, minWidth: 0, flex: 1 }}>
              {titolo ? titolo(r, i) : null}
            </div>
            {riassunto ? <div style={{ flexShrink: 0 }}>{riassunto(r, i)}</div> : null}
          </div>
          {dettaglio && (
            <button
              onClick={() => setAperte(prev => {
                const n = new Set(prev); const k = chiave ? chiave(r, i) : i
                if (n.has(k)) n.delete(k); else n.add(k)
                return n
              })}
              aria-expanded={aperte.has(chiave ? chiave(r, i) : i)}
              style={{
                width: '100%', minHeight: 44, padding: '10px 12px',
                border: 'none', borderTop: `1px solid ${C.borderSoft}`,
                background: C.bgSubtle, color: C.textSoft,
                fontSize: font.size.sm, fontWeight: 700, fontFamily: 'inherit',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: 'pointer', order: 2,
              }}>
              {apriEtichetta}
              <Icon name={aperte.has(chiave ? chiave(r, i) : i) ? 'chevUp' : 'chevDown'} size={12} />
            </button>
          )}
          {dettaglio && aperte.has(chiave ? chiave(r, i) : i) && (
            <div style={{ padding: '12px', borderTop: `1px solid ${C.borderSoft}`, order: 3 }}>
              {dettaglio(r, i)}
            </div>
          )}
          <div style={{ order: 1 }}>
            {visibili.map((c, ci) => (
              <div key={c.k || ci} style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 12, padding: '8px 12px',
                borderTop: ci === 0 ? 'none' : `1px solid ${C.borderSoft}`,
              }}>
                <span style={{
                  fontSize: font.size.sm, fontWeight: 700, color: C.textSoft,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  flexShrink: 0, maxWidth: '55%',
                }}>{c.label}</span>
                <span style={{
                  fontSize: font.size.base, fontWeight: c.forte ? 800 : 600,
                  color: c.colore || C.text, textAlign: 'right',
                  minWidth: 0, ...TNUM,
                }}>{c.cella(r, i)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {riepilogoTelefono}
    </div>
  )
}

// ── Un campo con l'elenco delle scelte, che si apre toccandolo ──────────────
//
// Sostituisce il paio «campo di testo + `<datalist>` + una fila di
// pulsantini». Quel paio aveva due difetti, tutti e due segnalati dal
// titolare il 16/09/2026:
//
//  - **il `<datalist>` mostra solo le voci che contengono quello che c'è già
//    scritto nel campo.** Nella scheda di un gusto la categoria parte
//    compilata con «Gusto», quindi toccando la freccia si vedeva una voce
//    sola: sembrava che le altre non esistessero. «Mi compare di default
//    gusto e se clicco compare solo quello come opzione.»
//  - **i pulsantini sotto** («Crema», «Frutta», «Cioccolato»…) erano un
//    secondo comando per la stessa cosa, occupavano tre righe e ripetevano
//    quello che il campo già sapeva. «Togli quei piccoli box e tutti i valori
//    scritti lì dentro mettili in un elenco che compare quando clicco il box.»
//
// Qui l'elenco si apre al tocco e mostra SEMPRE tutte le voci; scrivendo si
// restringe; si può anche scrivere una voce che non c'è (è una categoria,
// non un codice). Frecce, Invio ed Esc funzionano da tastiera.
export function CampoConElenco({
  valore, onCambia, voci = [], placeholder, ariaLabel, stile,
  id = 'campo-elenco',
}) {
  const [aperto, setAperto] = useState(false)
  const [evidenziata, setEvidenziata] = useState(-1)
  const contenitore = useRef(null)

  // Chiudere toccando fuori: senza questo l'elenco resta aperto sopra il
  // resto della scheda e copre i campi sotto.
  useEffect(() => {
    if (!aperto) return
    const fuori = (e) => { if (!contenitore.current?.contains(e.target)) setAperto(false) }
    document.addEventListener('mousedown', fuori)
    document.addEventListener('touchstart', fuori)
    return () => {
      document.removeEventListener('mousedown', fuori)
      document.removeEventListener('touchstart', fuori)
    }
  }, [aperto])

  const scritto = String(valore || '').trim().toLowerCase()
  // Quando il campo contiene ESATTAMENTE una delle voci (il caso della
  // categoria precompilata) l'elenco resta intero: è lì che il `<datalist>`
  // sbagliava.
  const esatta = voci.some(v => v.toLowerCase() === scritto)
  const mostrate = (!scritto || esatta) ? voci : voci.filter(v => v.toLowerCase().includes(scritto))

  const scegli = (v) => { onCambia(v); setAperto(false); setEvidenziata(-1) }

  const daTastiera = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!aperto) { setAperto(true); setEvidenziata(0); return }
      setEvidenziata(i => Math.min(i + 1, mostrate.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setEvidenziata(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && aperto && evidenziata >= 0 && mostrate[evidenziata]) {
      e.preventDefault()
      scegli(mostrate[evidenziata])
    } else if (e.key === 'Escape') {
      setAperto(false); setEvidenziata(-1)
    }
  }

  return (
    <div ref={contenitore} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={valore || ''}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={aperto}
          aria-controls={`${id}-elenco`}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={e => { onCambia(e.target.value); setAperto(true); setEvidenziata(-1) }}
          onFocus={() => setAperto(true)}
          onClick={() => setAperto(true)}
          onKeyDown={daTastiera}
          placeholder={placeholder}
          style={{ ...stile, paddingRight: 44 }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={aperto ? 'Chiudi l\'elenco' : 'Apri l\'elenco'}
          onClick={() => setAperto(a => !a)}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 44,
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.textSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Icon name={aperto ? 'chevUp' : 'chevDown'} size={16} />
        </button>
      </div>

      {aperto && mostrate.length > 0 && (
        <ul
          id={`${id}-elenco`}
          role="listbox"
          style={{
            position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, right: 0,
            margin: 0, padding: 4, listStyle: 'none',
            maxHeight: 260, overflowY: 'auto',
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
            boxShadow: '0 10px 28px rgba(15,23,42,0.12)',
          }}>
          {mostrate.map((v, i) => {
            const scelta = v.toLowerCase() === scritto
            return (
              <li
                key={v}
                role="option"
                aria-selected={scelta}
                onMouseDown={(e) => { e.preventDefault(); scegli(v) }}
                onMouseEnter={() => setEvidenziata(i)}
                style={{
                  padding: '11px 12px', minHeight: 44, display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 8,
                  borderRadius: 8, cursor: 'pointer',
                  background: i === evidenziata ? C.bgSubtle : 'transparent',
                  color: scelta ? T.brand : C.text,
                  fontSize: font.size.md, fontWeight: scelta ? 800 : 500,
                }}>
                {v}
                {scelta && <Icon name="check" size={14} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
