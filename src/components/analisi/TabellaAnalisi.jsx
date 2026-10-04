// ── La tabella di numeri dell'Analisi, una sola ─────────────────────────
//
// Audit del design del 04/10 (C5, CE1, CE4, PR7): il Conto e le Previsioni
// facevano le tabelle ognuno a modo suo — intestazioni in maiuscolo
// spaziato nel Conto e normali nelle Previsioni, celle 9/8 contro 10, righe
// alte 44, 47 o 53 px — e al telefono la tabella del Conto (608 px in 354)
// faceva scorrere via anche la colonna dei nomi, senza dire che c'era
// altro a destra. Questo pezzo è la tabella di tutte le pagine:
//   • intestazioni in un solo stile (`intestazione`), a destra sopra i numeri,
//     con l'euro nell'intestazione e non in ogni cella (ricerca §4.5);
//   • numeri a destra in cifre tabellari, meno vero, quote con un decimale,
//     colonne di larghezza fissa da COLONNE (le stesse della cascata);
//   • righe alte uguali (44 px), la riga che si apre ha il bersaglio da 44;
//   • al telefono la prima colonna resta ferma e il resto scorre, con una
//     sfumatura a destra finché c'è altro da vedere; le colonne `soloComputer`
//     (per esempio «agosto 2025», che la differenza contiene già) si tolgono.
//
// Uso:
//   <TabellaAnalisi etichetta="Il conto di agosto" isMobile={isMobile}
//     colonne={[
//       { chiave: 'voce', titolo: 'Voce' },
//       { chiave: 'mese', titolo: 'agosto', tipo: 'euro' },
//       { chiave: 'prima', titolo: 'agosto 2025', tipo: 'euro', soloComputer: true },
//       { chiave: 'diff', titolo: 'differenza', tipo: 'differenza' },
//       { chiave: 'quota', titolo: '% incassi', tipo: 'quota' },
//       { chiave: 'andamento', titolo: '12 mesi', tipo: 'nodo', larghezza: 88 },
//     ]}
//     righe={[{ chiave: 'mp', celle: { voce: 'Materie prime', mese: -15000, prima: -13000,
//       diff: { valore: 2000, verso: 'peggio' }, quota: 12.1, andamento: <Andamentino … /> },
//       onClick: apri, aperta: false }]} />
// Tipi: 'testo' (di base), 'euro', 'quota', 'numero', 'differenza'
// ({ valore, verso, incompleto }), 'nodo' (qualunque cosa, già disegnata).
// Una riga `forte` è un totale (grassetto, filo sopra); `incompleto` la
// scrive in ambra.
import React, { useEffect, useRef, useState } from 'react'
import { color as T, font, space } from '../../lib/theme'
import { quotaColonna, conSegno } from '../../lib/formatoAnalisi'
import Icon from '../Icon'
import { testo, colonna, intestazione, cifreInColonna } from './misure'

const MENO = '−'
const finito = (x) => x != null && Number.isFinite(Number(x))
const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const NUMERICI = new Set(['euro', 'quota', 'numero', 'differenza'])
// Anche i disegni nelle celle (gli andamentini) stanno a destra, sotto la loro intestazione.
const A_DESTRA = new Set([...NUMERICI, 'nodo'])
const ALTEZZA_RIGA = 44

/** La larghezza di una colonna: data dalla pagina, o quella comune per il suo tipo. */
function larghezza(c, i, isMobile) {
  if (c.larghezza) return c.larghezza
  if (i === 0) return colonna('voce', isMobile)
  if (c.tipo === 'euro' || c.tipo === 'numero') return colonna('euro', isMobile)
  if (c.tipo === 'quota') return colonna('quota', isMobile)
  if (c.tipo === 'differenza') return colonna('euro', isMobile) + colonna('barretta', isMobile)
  return colonna('euro', isMobile)
}

/** Il contenuto di una cella, scritto come vuole il suo tipo. */
function cella(c, v, riga) {
  // Una cella che la pagina non ha dato resta vuota; `null` vuol dire «non lo so».
  if (v === undefined) return ''
  if (c.tipo === 'nodo') return <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{v}</div>
  if (c.tipo === 'euro' || c.tipo === 'numero') {
    if (!finito(v)) return v == null ? <span style={{ color: T.amberDark }}>non lo so</span> : v
    const n = Number(v)
    return `${n < 0 && Math.round(Math.abs(n)) > 0 ? MENO : ''}${NF0.format(Math.abs(n))}`
  }
  if (c.tipo === 'quota') return finito(v) ? quotaColonna(v) : ''
  if (c.tipo === 'differenza') {
    const d = v && typeof v === 'object' ? v : { valore: v }
    if (!finito(d.valore)) return ''
    const incompleto = d.incompleto || riga.incompleto
    const verso = incompleto ? null : d.verso
    const colore = incompleto ? T.amberDark : verso === 'peggio' ? T.graficoPeggio : verso === 'meglio' ? T.graficoMeglio : T.textMid
    return (
      <span style={{ color: colore, fontWeight: verso && verso !== 'pari' ? 600 : 500 }}>
        {conSegno(Number(d.valore))}{verso && verso !== 'pari' ? ` · ${verso}` : ''}
      </span>
    )
  }
  return v ?? ''
}

/**
 * @param {object} p
 * @param {{ chiave: string, titolo: string, tipo?: string, larghezza?: number, soloComputer?: boolean }[]} p.colonne
 * @param {{ chiave: string, celle: object, forte?: boolean, incompleto?: boolean,
 *   onClick?: () => void, aperta?: boolean, sotto?: React.ReactNode }[]} p.righe
 *   `sotto` è quello che si apre sotto la riga (per esempio i fornitori della voce).
 * @param {string} p.etichetta  il nome della tabella, per chi legge lo schermo
 * @param {boolean} [p.isMobile]
 */
export default function TabellaAnalisi({ colonne = [], righe = [], etichetta = '', isMobile = false }) {
  const visibili = colonne.filter(c => !(isMobile && c.soloComputer))
  const larghe = visibili.map((c, i) => larghezza(c, i, isMobile))
  const minima = larghe.reduce((s, x) => s + x, 0) + space[2] * 2 * visibili.length
  const scorrevole = useRef(null)
  const [altroADestra, setAltroADestra] = useState(false)

  // Al telefono la sfumatura a destra dice che c'è altro, finché c'è.
  useEffect(() => {
    const el = scorrevole.current
    if (!el) return undefined
    const guarda = () => setAltroADestra(el.scrollWidth - el.clientWidth - el.scrollLeft > 2)
    guarda()
    el.addEventListener('scroll', guarda, { passive: true })
    window.addEventListener('resize', guarda)
    return () => { el.removeEventListener('scroll', guarda); window.removeEventListener('resize', guarda) }
  }, [isMobile, visibili.length, righe.length])

  const imb = `${space[2]}px ${space[2]}px`
  const ferma = (i) => (i === 0 ? {
    position: 'sticky', left: 0, zIndex: 1, background: T.bgCard,
    // Il filo a destra della colonna ferma: si vede quando il resto scorre sotto.
    boxShadow: isMobile ? `1px 0 0 ${T.borderSoft}` : 'none',
  } : null)

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <div ref={scorrevole} style={{ overflowX: 'auto', minWidth: 0 }}>
        <table aria-label={etichetta || undefined} style={{
          width: '100%', minWidth: minima, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed',
          ...testo(font.size.base),
        }}>
          <colgroup>
            {visibili.map((c, i) => <col key={c.chiave} style={{ width: i === 0 && !c.larghezza ? 'auto' : larghe[i] }} />)}
          </colgroup>
          <thead>
            <tr>
              {visibili.map((c, i) => (
                <th key={c.chiave} scope="col" style={{
                  ...intestazione, ...ferma(i), padding: imb, textAlign: A_DESTRA.has(c.tipo) ? 'right' : 'left',
                  borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', overflow: 'visible',
                }}>
                  {c.titolo}{c.tipo === 'euro' || c.tipo === 'differenza' ? ', €' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righe.map(r => {
              const fondo = r.forte ? { borderTop: `1px solid ${T.borderStr}` } : { borderTop: `1px solid ${T.borderSoft}` }
              return (
                <React.Fragment key={r.chiave}>
                  <tr>
                    {visibili.map((c, i) => {
                      const v = r.celle?.[c.chiave]
                      const numerica = NUMERICI.has(c.tipo)
                      const stile = {
                        ...ferma(i), ...fondo, padding: imb, height: ALTEZZA_RIGA, boxSizing: 'border-box', verticalAlign: 'middle',
                        fontWeight: r.forte ? 700 : i === 0 ? 500 : 600,
                        color: r.incompleto && numerica ? T.amberDark : T.text,
                        ...(numerica ? cifreInColonna : { textAlign: 'left' }),
                      }
                      if (i === 0) {
                        return (
                          <th key={c.chiave} scope="row" style={stile}>
                            {r.onClick ? (
                              // Tutta la cella è il pulsante: alto quanto la riga (44 px).
                              <button type="button" onClick={r.onClick} aria-expanded={r.aperta ?? undefined} style={{
                                display: 'flex', alignItems: 'center', gap: space[1], width: '100%', minHeight: ALTEZZA_RIGA,
                                margin: `-${space[2]}px 0`, padding: 0, border: 'none', background: 'transparent',
                                font: 'inherit', fontWeight: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer',
                              }}>
                                <Icon name={r.aperta ? 'chevD' : 'chevR'} size={14} color={T.textSoft} />
                                <span style={{ minWidth: 0, overflowWrap: 'break-word' }}>{cella(c, v, r)}</span>
                              </button>
                            ) : cella(c, v, r)}
                          </th>
                        )
                      }
                      return <td key={c.chiave} style={stile}>{cella(c, v, r)}</td>
                    })}
                  </tr>
                  {r.aperta && r.sotto && (
                    <tr>
                      <td colSpan={visibili.length} style={{ padding: `0 0 ${space[2]}px`, borderTop: 'none' }}>{r.sotto}</td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {altroADestra && (
        <div aria-hidden="true" style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: space[6], pointerEvents: 'none',
          background: `linear-gradient(to left, ${T.bgCard}, ${T.bgCard}00)`,
        }} />
      )}
    </div>
  )
}
