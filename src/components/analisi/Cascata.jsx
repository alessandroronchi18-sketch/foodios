// ── Dai ricavi all'utile, una riga per passo ────────────────────────────
//
// ANALISI_DESIGN.md, regola 8: sopra il conto economico, la cascata. È
// orizzontale apposta: le etichette si leggono per intero anche sul telefono
// (una cascata a colonne a 420 px vuole le scritte ruotate), e l'occhio
// scende come scende un conto. Ogni passo è una barra che parte dove è finito
// il precedente; il primo e l'ultimo partono da zero.
import React, { useState } from 'react'
import { color as T, font } from '../../lib/theme'
import { euro, quota } from '../../lib/formatoAnalisi'

const MENO = '−'

/** Le posizioni delle barre, separate dal disegno così si provano da sole. */
export function geometriaCascata(passi = []) {
  let corrente = 0
  const righe = passi.map(p => {
    const v = p.valore == null ? null : Number(p.valore)
    let da = 0, a = 0
    if (p.tipo === 'inizio' || p.tipo === 'fine') {
      da = 0; a = v ?? 0
      if (v != null) corrente = v
    } else if (p.tipo === 'meno') {
      da = corrente - (v ?? 0); a = corrente; corrente = da
    } else {
      da = corrente; a = corrente + (v ?? 0); corrente = a
    }
    return { ...p, v, da: Math.min(da, a), a: Math.max(da, a), punto: corrente, negativo: p.tipo === 'fine' && (v ?? 0) < 0 }
  })
  const min = Math.min(0, ...righe.map(r => r.da))
  const max = Math.max(1, ...righe.map(r => r.a))
  return { righe, min, max }
}

/**
 * @param {{ passi: { etichetta: string, valore: number|null, tipo: 'inizio'|'meno'|'aggiunta'|'fine',
 *   nota?: string, onClick?: () => void }[], ricavi?: number|null, isMobile?: boolean }} p
 *   I passi «meno» hanno `valore` positivo (quanto si toglie). Un passo con
 *   `valore` null si disegna vuoto e dice «non lo so»: non vale zero.
 */
export default function Cascata({ passi = [], ricavi = null, isMobile = false }) {
  const [tabella, setTabella] = useState(false)
  const { righe, min, max } = geometriaCascata(passi)
  const scala = (x) => ((x - min) / (max - min)) * 100
  const largEtichetta = isMobile ? 112 : 176
  const testoValore = (r, dec = 0) => (r.v == null ? 'non lo so'
    : `${r.tipo === 'meno' ? MENO : ''}${euro(Math.abs(r.v), { decimali: dec })}`)
  return (
    <div>
      <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {righe.map((r, i) => {
          const colore = r.tipo === 'inizio' ? T.graficoReale
            : r.tipo === 'fine' ? (r.negativo ? T.red : T.graficoReale)
              : r.tipo === 'aggiunta' ? T.green : T.graficoConfronto
          const pctRicavi = ricavi > 0 && r.v != null && r.tipo !== 'inizio' ? quota(Math.abs(r.v) / ricavi * 100) : null
          const forte = r.tipo === 'inizio' || r.tipo === 'fine'
          const contenuto = (
            <>
              <span style={{ fontSize: font.size.base, fontWeight: forte ? 800 : 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.etichetta}
              </span>
              <span style={{ position: 'relative', height: 18 }} aria-hidden="true">
                <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${scala(0)}%`, width: 1, background: T.graficoGriglia }} />
                {r.v == null ? (
                  <span style={{ position: 'absolute', top: 2, bottom: 2, left: `${scala(r.punto)}%`, width: 24, border: `1px dashed ${T.amber}`, borderRadius: 4 }} />
                ) : (
                  <span style={{
                    position: 'absolute', top: 2, bottom: 2, left: `${scala(r.da)}%`,
                    width: `max(2px, ${scala(r.a) - scala(r.da)}%)`, background: colore, borderRadius: 4,
                  }} />
                )}
              </span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: font.size.base, fontWeight: forte ? 800 : 600, color: r.v == null ? T.amberDark : r.negativo ? T.red : T.text }}>{testoValore(r)}</span>
                {pctRicavi && !isMobile && <span style={{ fontSize: font.size.sm, color: T.textSoft, marginLeft: 6 }}>{pctRicavi}</span>}
              </span>
            </>
          )
          const stile = {
            display: 'grid', gridTemplateColumns: `${largEtichetta}px minmax(0, 1fr) ${isMobile ? 84 : 124}px`, gap: 10, alignItems: 'center',
            minHeight: 30, border: 'none', background: 'transparent', font: 'inherit', textAlign: 'left', width: '100%',
            borderTop: r.tipo === 'fine' ? `1px solid ${T.borderStr}` : 'none',
            padding: r.tipo === 'fine' ? '6px 0 2px' : '2px 0', marginTop: r.tipo === 'fine' ? 4 : 0,
          }
          return r.onClick ? (
            <button key={i} type="button" role="listitem" onClick={r.onClick} title={r.nota || undefined}
              aria-label={`${r.etichetta}: ${testoValore(r)}. Apri il dettaglio`} style={{ ...stile, cursor: 'pointer' }}>
              {contenuto}
            </button>
          ) : (
            <div key={i} role="listitem" title={r.nota || undefined} style={stile}>{contenuto}</div>
          )
        })}
      </div>
      <button type="button" onClick={() => setTabella(t => !t)} aria-expanded={tabella}
        style={{ marginTop: 8, border: 'none', background: 'transparent', color: T.textSoft, fontSize: font.size.sm, fontWeight: 600, cursor: 'pointer', padding: '6px 0', fontFamily: 'inherit', minHeight: 32 }}>
        {tabella ? 'Nascondi i numeri' : 'Vedi i numeri in tabella'}
      </button>
      {tabella && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4, fontSize: font.size.base }}>
          <tbody>
            {righe.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                <td style={{ padding: '6px 4px', color: T.text }}>{r.etichetta}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.text }}>{testoValore(r, 2)}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right', color: T.textSoft, fontVariantNumeric: 'tabular-nums' }}>
                  {ricavi > 0 && r.v != null && r.tipo !== 'inizio' ? quota(Math.abs(r.v) / ricavi * 100) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
