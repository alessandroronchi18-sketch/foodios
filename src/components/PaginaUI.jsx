// Primitive di impaginazione: "una schermata, una domanda".
//
// Il difetto che queste primitive esistono per correggere. Le pagine di Foodos
// aprivano con quattro tessere grandi e uguali, e quattro numeri della stessa
// dimensione non sono una gerarchia: sono un elenco. Chi arriva alla pagina
// deve leggerli tutti e decidere da solo quale conta, ogni volta.
//
// Qui l'ordine è: una frase vera in italiano che risponde alla domanda della
// pagina, poi i numeri che la sostengono in tono minore, poi le azioni. I
// numeri non spariscono — smettono di gridare tutti insieme.
//
// Tre regole tipografiche, che sono quasi tutto il lavoro:
//
//   1. L'unità è più piccola e più chiara della cifra. "12.480 €" con l'euro
//      a 0,78em e in grigio si legge come una quantità; con l'euro grande come
//      la cifra si legge come una stringa di testo.
//   2. Ogni cifra è tabular-nums e allineata a destra nella sua colonna,
//      così le migliaia stanno una sopra l'altra e si confrontano a occhio.
//   3. Etichetta, valore e nota hanno altezze minime uniformi: due riquadri
//      affiancati restano incolonnati anche se uno dei tre testi va a capo.

import React, { useState } from 'react'
import { color as T, typo, radius as R, font } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from './Icon'

const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

// Rapporto fra l'unità e la cifra. È volutamente RELATIVO e non un valore in
// pixel: l'euro deve rimpicciolirsi insieme al numero, che nella stessa pagina
// compare a quattro dimensioni diverse. Sta in una costante perché scritto
// inline il controllo sui token lo leggerebbe come una misura a mano — e non lo
// è, deriva dalla scala invece di scavalcarla.
const EM_UNITA = 0.78
const EM_STACCO = 0.22

const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const NF2 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Maiuscola sulla PRIMA lettera, non su ogni parola.
 *
 * `textTransform: capitalize` sembra la scorciatoia e non lo è: in italiano i
 * giorni e i mesi vanno minuscoli, e produceva "Lunedì 7 Settembre" — che in
 * un prodotto italiano si nota subito.
 */
export const capPrima = (s) => {
  const t = String(s ?? '')
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

/** Numero italiano senza unità: le migliaia col punto, sempre. */
export const num0 = (v) => NF0.format(Math.round(Number(v) || 0))
export const num2 = (v) => NF2.format(Number(v) || 0)

/**
 * Una cifra con la sua unità: l'unità più piccola e più chiara.
 * `decimali` solo dove servono davvero — nei riquadri grandi si arrotonda
 * all'unità, i centesimi li si guarda nel dettaglio.
 */
export function Cifra({ valore, unita = '€', decimali = false, size, peso = 800, colore = T.text, style }) {
  return (
    <span style={{ ...tnum, fontSize: size, fontWeight: peso, color: colore, letterSpacing: '-0.02em', whiteSpace: 'nowrap', ...style }}>
      {decimali ? num2(valore) : num0(valore)}
      {unita && (
        <span style={{ fontSize: `${EM_UNITA}em`, fontWeight: 600, color: T.textSoft, marginLeft: `${EM_STACCO}em`, letterSpacing: 0 }}>{unita}</span>
      )}
    </span>
  )
}

/**
 * L'apertura della pagina: il soggetto, UNA frase, le azioni.
 *
 * ATTENZIONE alla gerarchia, ed è la cosa che questa primitiva esiste per
 * rispettare. Il titolo della pagina lo disegna già la topbar del Dashboard —
 * 28px, maiuscolo, gradiente bordeaux: "CASSA", "CALENDARIO". La prima
 * versione di questa intestazione ci metteva sopra un secondo titolo grande
 * più un occhiello con lo stesso testo del titolo della topbar: tre righe per
 * dire la stessa cosa, prima di arrivare a un'informazione.
 *
 * Quindi qui il `titolo` è di SECONDO livello — il soggetto che la topbar non
 * può sapere: "Settembre 2026", non "Calendario" — e si mette solo dove serve
 * un ancoraggio, come nel calendario che si sfoglia mese per mese.
 *
 * La `frase` non è un sottotitolo decorativo: è la risposta alla domanda per
 * cui si è aperta la pagina, calcolata sui dati. Dove non c'è un soggetto da
 * ancorare diventa lei la riga principale (`fraseForte`), perché è la cosa che
 * vale di più da leggere. Se i dati non bastano si dice quello — non si
 * riempie con un incoraggiamento.
 */
export function IntestazionePagina({ titolo, frase, fraseForte = false, azioni, sotto }) {
  const isMobile = useIsMobile()
  const stileFrase = fraseForte
    ? { ...(isMobile ? typo.h3 : typo.h2), fontWeight: 600, color: T.text, letterSpacing: '-0.01em' }
    : { ...typo.body, color: T.textMid }

  return (
    <div style={{ marginBottom: isMobile ? 16 : 20 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 14, flexWrap: 'wrap', marginBottom: sotto ? 14 : 0,
      }}>
        <div style={{ minWidth: 0, flex: '1 1 300px' }}>
          {titolo && (
            <h2 style={{
              margin: 0, ...(isMobile ? typo.h3 : typo.h2), color: T.text,
              textWrap: 'balance',
            }}>{titolo}</h2>
          )}
          {frase && (
            <p style={{
              margin: titolo ? '5px 0 0' : 0, ...stileFrase, lineHeight: 1.45,
              maxWidth: '64ch', textWrap: 'pretty',
            }}>{frase}</p>
          )}
        </div>
        {azioni && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>{azioni}</div>
        )}
      </div>
      {sotto}
    </div>
  )
}

/**
 * I numeri di sostegno, in tono minore: una fila di voci separate da linee
 * sottili, non quattro scatole con l'ombra.
 *
 * Ogni voce: { label, valore (nodo o numero), unita, sub, colore, onClick }.
 * Le altezze minime tengono incolonnate etichette e valori fra voci diverse.
 */
export function FilaStat({ voci, compatta = false }) {
  const isMobile = useIsMobile()
  const vive = (voci || []).filter(Boolean)
  if (vive.length === 0) return null
  const size = compatta
    ? (isMobile ? typo.h3.fontSize : typo.h2.fontSize)
    : (isMobile ? typo.h2.fontSize : typo.h1.fontSize)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile
        ? `repeat(${Math.min(2, vive.length)}, minmax(0, 1fr))`
        : `repeat(${vive.length}, minmax(0, 1fr))`,
      gap: 0,
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
      overflow: 'hidden',
    }}>
      {vive.map((v, i) => {
        const interattiva = typeof v.onClick === 'function'
        const Elemento = interattiva ? 'button' : 'div'
        return (
          <Elemento key={v.label || i}
            {...(interattiva ? { type: 'button', onClick: v.onClick } : {})}
            style={{
              textAlign: 'left', font: 'inherit', background: 'transparent',
              padding: isMobile ? '13px 14px' : '15px 18px',
              borderTop: isMobile && i >= 2 ? `1px solid ${T.border}` : 'none',
              borderLeft: (isMobile ? i % 2 === 1 : i > 0) ? `1px solid ${T.border}` : 'none',
              borderRight: 'none', borderBottom: 'none',
              cursor: interattiva ? 'pointer' : 'default',
              minWidth: 0, display: 'block', width: '100%',
            }}>
            {/* L'etichetta va a capo, non viene tagliata. Con `nowrap` e
                l'ellissi su quattro colonne strette si leggeva "Incassa…",
                "Da regi…": un'etichetta troncata non dice cosa misura il
                numero che ha sotto, ed è il numero a perdere senso. L'altezza
                minima su due righe tiene le cifre incolonnate fra le voci. */}
            <div style={{
              ...typo.small, color: T.textSoft, fontWeight: 600, marginBottom: 4,
              minHeight: 34, lineHeight: 1.35, textWrap: 'pretty',
            }}>
              {v.label}
            </div>
            <div style={{ minHeight: Math.round(size * 1.25), display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {typeof v.valore === 'number'
                ? <Cifra valore={v.valore} unita={v.unita} decimali={v.decimali} size={size} colore={v.colore || T.text} />
                : <span style={{ ...tnum, fontSize: size, fontWeight: 800, color: v.colore || T.text, letterSpacing: '-0.02em' }}>{v.valore}</span>}
            </div>
            <div style={{ ...typo.caption, color: T.textSoft, minHeight: 16, marginTop: 3, lineHeight: 1.35 }}>
              {v.sub || ''}
            </div>
          </Elemento>
        )
      })}
    </div>
  )
}

/**
 * Sezione con intestazione a filo, apribile.
 *
 * Le pagine lunghe avevano tutto aperto sempre: chi entra per registrare
 * l'incasso scorreva sette riquadri prima di trovare il campo. Quello che non
 * serve adesso resta chiuso, ma il titolo dice cosa c'è dentro — una sezione
 * chiusa che non si annuncia è una sezione che nessuno apre.
 */
export function Sezione({
  icona, titolo, sub, destra, children,
  apribile = false, apertaDiDefault = true, contorno = true, denso = false,
}) {
  const isMobile = useIsMobile()
  const [aperta, setAperta] = useState(apertaDiDefault)
  const mostra = apribile ? aperta : true

  const testa = (
    <>
      {icona && (
        <span style={{
          width: 28, height: 28, borderRadius: R.md, background: T.bgSubtle, color: T.textMid,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name={icona} size={14} />
        </span>
      )}
      <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <span style={{ ...typo.h3, color: T.text, display: 'block' }}>{titolo}</span>
        {sub && <span style={{ ...typo.small, color: T.textSoft, display: 'block', marginTop: 2, lineHeight: 1.4 }}>{sub}</span>}
      </span>
    </>
  )

  return (
    <section style={{
      background: contorno ? T.bgCard : 'transparent',
      border: contorno ? `1px solid ${T.border}` : 'none',
      borderRadius: R.xl, marginBottom: 14, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: isMobile ? '13px 14px' : '14px 18px',
        borderBottom: mostra && contorno ? `1px solid ${T.borderSoft}` : 'none',
      }}>
        {apribile ? (
          <button type="button" onClick={() => setAperta(v => !v)} aria-expanded={aperta}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              font: 'inherit', minHeight: 32, textAlign: 'left',
            }}>
            {testa}
            <span style={{
              color: T.textSoft, flexShrink: 0, display: 'inline-flex',
              transform: aperta ? 'rotate(180deg)' : 'none', transition: 'transform 140ms ease',
            }}>
              <Icon name="chevDown" size={15} />
            </span>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>{testa}</div>
        )}
        {destra && <div style={{ flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>{destra}</div>}
      </div>
      {mostra && (
        <div style={{ padding: denso ? 0 : (isMobile ? '14px' : '16px 18px') }}>{children}</div>
      )}
    </section>
  )
}

/**
 * Lo scostamento dal solito, in chiaro.
 *
 * Compare solo quando c'è qualcosa da dire: sotto il 10% di differenza fra due
 * giovedì siamo nel rumore, e una freccia verde ogni giorno insegna a non
 * guardarla più.
 */
export function Scostamento({ confronto, mostraSempre = false }) {
  if (!confronto) return null
  const { verso, pct, tipico, nome } = confronto
  if (verso === 'in linea' && !mostraSempre) {
    return (
      <span style={{ ...typo.small, color: T.textSoft }}>
        come un {nome} normale · di solito {num0(tipico)} €
      </span>
    )
  }
  const su = verso === 'sopra'
  const colore = su ? T.green : T.amber
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        ...typo.small, fontWeight: 700, color: colore,
        background: su ? T.greenLight : T.amberLight, border: `1px solid ${colore}33`,
        borderRadius: R.full, padding: '3px 9px',
      }}>
        <Icon name={su ? 'trendUp' : 'trendDown'} size={12} />
        <span style={tnum}>{su ? '+' : ''}{Math.round(pct)}%</span>
      </span>
      <span style={{ ...typo.small, color: T.textSoft }}>
        di {verso} rispetto a un {nome} normale ({num0(tipico)} €)
      </span>
    </span>
  )
}

/**
 * Barre orizzontali per confronti brevi (i giorni della settimana).
 * Voci: { etichetta, valore, nota, forte }.
 */
export function MiniBarre({ voci, unita = '€' }) {
  const vive = (voci || []).filter(Boolean)
  const max = Math.max(1, ...vive.map(v => Number(v.valore) || 0))
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {vive.map(v => {
        const val = Number(v.valore) || 0
        const q = Math.max(val > 0 ? 3 : 0, Math.round((val / max) * 100))
        return (
          <div key={v.etichetta} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ ...typo.small, color: v.forte ? T.text : T.textMid, fontWeight: v.forte ? 700 : 500, width: 34, flexShrink: 0 }}>
              {v.etichetta}
            </div>
            <div style={{ flex: 1, minWidth: 0, height: 8, background: T.bgSubtle, borderRadius: R.full, overflow: 'hidden' }}>
              <div style={{
                width: `${q}%`, height: '100%', borderRadius: R.full,
                background: v.forte ? T.brand : T.brandSoft,
                transition: 'width 200ms ease',
              }} />
            </div>
            <div style={{ ...tnum, ...typo.small, color: val > 0 ? T.textMid : T.textFaint, fontWeight: 600, width: 66, textAlign: 'right', flexShrink: 0 }}>
              {val > 0 ? `${num0(val)} ${unita}` : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Navigatore di giornata: freccia, data in chiaro, freccia, più "Oggi".
 *
 * Sostituisce l'`input type=date` su una pagina che si apre ogni giorno.
 * Il campo data resta raggiungibile — ci sono casi in cui si salta a un mese
 * indietro — ma non è più l'unico modo di muoversi di un giorno.
 */
export function NavGiorno({ data, onCambia, max, min, bloccata = false, etichettaBloccata }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const lato = isMobile ? 44 : isTablet ? 44 : 38

  const sposta = (giorni) => {
    const d = new Date(data + 'T12:00')
    d.setDate(d.getDate() + giorni)
    const iso = d.toISOString().slice(0, 10)
    if (max && iso > max) return
    if (min && iso < min) return
    onCambia(iso)
  }

  const testo = capPrima(new Date(data + 'T12:00').toLocaleDateString('it-IT',
    { weekday: 'long', day: 'numeric', month: 'long' }))
  const oggi = new Date().toISOString().slice(0, 10)
  const eOggi = data === oggi

  const bottone = {
    width: lato, height: lato, borderRadius: R.md, cursor: 'pointer',
    background: T.bgCard, border: `1px solid ${T.borderStr}`, color: T.textMid,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }

  if (bloccata) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', minHeight: lato,
        background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: R.lg,
        ...typo.bodyStrong, color: T.text,
      }}>
        <Icon name="calendar" size={15} />{etichettaBloccata || testo}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={() => sposta(-1)} style={bottone} aria-label="Giorno precedente">
          <Icon name="chevR" size={15} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div style={{
          minWidth: isMobile ? 0 : 210, flex: isMobile ? '1 1 auto' : '0 0 auto',
          padding: '0 4px', textAlign: 'center',
        }}>
          <div style={{ ...typo.bodyStrong, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {testo}
          </div>
          <div style={{ ...typo.caption, color: T.textSoft }}>
            {eOggi ? 'oggi' : new Date(data + 'T12:00').toLocaleDateString('it-IT', { year: 'numeric' })}
          </div>
        </div>
        <button type="button" onClick={() => sposta(1)}
          disabled={!!max && data >= max}
          style={{ ...bottone, opacity: (!!max && data >= max) ? 0.4 : 1, cursor: (!!max && data >= max) ? 'not-allowed' : 'pointer' }}
          aria-label="Giorno successivo">
          <Icon name="chevR" size={15} />
        </button>
      </div>
      {!eOggi && (
        <button type="button" onClick={() => onCambia(oggi)}
          style={{
            padding: '0 13px', minHeight: lato, borderRadius: R.md, cursor: 'pointer',
            background: T.bgCard, border: `1px solid ${T.borderStr}`, color: T.textMid,
            ...typo.small, fontWeight: 700, fontFamily: 'inherit',
          }}>Oggi</button>
      )}
      {/* Il campo data serve per i salti lunghi, ma la data in chiaro è già
          accanto alle frecce: ripeterla due volte confonde. Quindi resta solo
          l'icona, e il campo nativo ci sta sopra invisibile — restringerlo a
          26px lo faceva rendere comunque, e si vedeva un pezzo di testo
          tagliato che sembrava un errore. */}
      <label style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: lato, height: lato, borderRadius: R.md, cursor: 'pointer', overflow: 'hidden',
        background: T.bgCard, border: `1px solid ${T.borderStr}`, color: T.textSoft,
      }}>
        <Icon name="calendar" size={15} />
        <input type="date" value={data} max={max} min={min}
          onChange={e => e.target.value && onCambia(e.target.value)}
          aria-label="Scegli una data"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, border: 'none', padding: 0, cursor: 'pointer',
            fontSize: font.size.lg, colorScheme: 'light',
          }} />
      </label>
    </div>
  )
}

/**
 * Tinta di calore per la griglia del calendario.
 *
 * Un'unica tinta dal chiaro allo scuro del marchio: il calendario si legge
 * come un oggetto solo, e l'intensità dice l'incasso senza bisogno di leggere
 * le cifre. `color-mix` fa il lavoro; dove non c'è si scalano tre gradini di
 * token, che è meno bello ma non è mai rotto.
 */
const SUPPORTA_MIX = typeof globalThis.CSS?.supports === 'function'
  && globalThis.CSS.supports('background', `color-mix(in srgb, ${T.brand} 50%, ${T.bgCard})`)

export function tintaCalore(peso) {
  const p = Math.max(0, Math.min(1, Number(peso) || 0))
  if (p <= 0.02) return { background: T.bgCard, color: T.text, forte: false }
  // Dal 5% al 71%. La prima versione arrivava al 92% partendo dall'8, e con la
  // compressione a radice quadrata il giorno PIÙ DEBOLE del mese finiva già a
  // metà scala: la griglia si leggeva come un blocco unico di bordeaux e la
  // mappa non distingueva più niente. Il tetto basso lascia il chiaro al
  // chiaro e tiene lo scuro per le giornate che lo meritano.
  const q = Math.round(5 + p * 66)
  const forte = q >= 46
  if (!SUPPORTA_MIX) {
    const bg = q >= 46 ? T.brand : q >= 26 ? T.brandSoft : T.brandLight
    return { background: bg, color: q >= 46 ? T.textOnDark : T.text, forte }
  }
  return {
    background: `color-mix(in srgb, ${T.brand} ${q}%, ${T.bgCard})`,
    color: forte ? T.textOnDark : T.text,
    forte,
  }
}
