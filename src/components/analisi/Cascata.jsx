// ── Dai ricavi all'utile: la cascata È la tabella del conto ────────────
//
// ANALISI_DESIGN.md §6 e ricerca design §3.1-3.2 (scelta 1, modello IBCS):
// una riga per voce, dall'alto in basso come scende un conto, e sulla stessa
// riga voce · barra · € · % sui ricavi · differenza con l'anno prima come
// barretta da uno zero comune. Ogni passo è una barra che parte dove è
// finito il precedente; il primo e l'ultimo partono da zero. Le colonne dei
// numeri hanno la larghezza fissa di `COLONNE` (misure.js): le stesse della
// tabella e delle cause, così i numeri cadono sulla stessa verticale.
//
// 04/10/2026 (audit del design, C8 e IM11, IM13):
//   • «Da classificare» si disegnava grigia come una spesa vera, ed era la
//     barra più lunga dopo gli incassi (21,8%; 40,5% all'apertura). Adesso è
//     una zona tratteggiata in ambra, il ruolo «incompleto»: non è una spesa
//     che si conosce, è una spesa di cui non si sa la voce. La differenza
//     con l'anno prima non ha giudizio (niente rosso su un dato che manca);
//   • al telefono le etichette si tagliavano a 112 px («Servizi e
//     commi…», ne servono 135): adesso vanno su due righe;
//   • «Vedi i numeri in tabella» era alto 32 px: adesso 44, per un dito.
import React, { useState } from 'react'
import { color as T, font, radius as R, space } from '../../lib/theme'
import { euro, quotaColonna, conSegno } from '../../lib/formatoAnalisi'
import { testo, transizione, colonna, intestazione, cifreInColonna } from './misure'
import { stileIncompleto } from './incompleto'
import { RigaAvviso } from './parti'

const MENO = '−'
const finito = (x) => x != null && Number.isFinite(Number(x))
const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })

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
 * Aggiunge a ogni passo il valore dell'anno prima (`confronto`), preso dai
 * passi di allora con la stessa `chiave`. Per la pagina:
 *   <Cascata passi={conConfronto(conto.passi, contoPrima?.passi)} … />
 */
export function conConfronto(passi = [], passiPrima = []) {
  const prima = new Map((passiPrima || []).filter(p => p.chiave).map(p => [p.chiave, p.valore]))
  return passi.map(p => (p.chiave && prima.has(p.chiave) && finito(prima.get(p.chiave)) ? { ...p, confronto: Number(prima.get(p.chiave)) } : p))
}

/** Un passo «incompleto»: lo dice la pagina, e «Da classificare» lo è sempre. */
export const eIncompleto = (p) => p.incompleto === true || (p.incompleto !== false && p.chiave === 'daClassificare')

/**
 * La differenza con l'anno prima e il suo giudizio. Per una spesa la
 * differenza è «di spesa» (+ = si è speso di più = peggio), come nella
 * tabella del conto; per incassi e utile + = meglio.
 */
export function differenzaPasso(r) {
  if (!finito(r.v) || !finito(r.confronto) || eIncompleto(r)) return null
  const d = r.v - Number(r.confronto)
  if (Math.round(d) === 0) return { d: 0, verso: 'pari' }
  const peggio = r.tipo === 'meno' ? d > 0 : d < 0
  return { d, verso: peggio ? 'peggio' : 'meglio' }
}

/**
 * @param {object} p
 * @param {{ etichetta: string, valore: number|null, tipo: 'inizio'|'meno'|'aggiunta'|'fine',
 *   chiave?: string, confronto?: number|null, incompleto?: boolean, avviso?: string, nota?: string,
 *   onClick?: () => void }[]} p.passi
 *   I passi «meno» hanno `valore` positivo (quanto si toglie). Un passo con
 *   `valore` null si disegna come zona tratteggiata e dice «non lo so»: non
 *   vale zero. `confronto` è lo stesso passo un anno prima (vedi `conConfronto`).
 * @param {number|null} [p.ricavi]  per la colonna «% incassi»
 * @param {string} [p.titoloValore]  l'intestazione della colonna degli euro («agosto» → «agosto, €»)
 * @param {string} [p.titoloConfronto]  l'intestazione della differenza («su agosto 2025»)
 * @param {string} [p.evidenzia]  la `chiave` del passo di cui parla il titolo: sarà l'unica barra scura
 * @param {string} [p.avviso]  l'avvertimento che cambia come si leggono i numeri di tutta la cascata
 *   («Spese IVA compresa: le fatture di agosto non hanno l'imponibile»), sopra le intestazioni.
 *   Un passo può avere il suo (`passo.avviso`): va sotto la voce, sulla stessa riga dei numeri.
 *   ANALISI_DESIGN §6: l'avvertimento sta accanto al numero, non solo nella copertura chiusa.
 * @param {boolean} [p.isMobile]  al telefono restano voce, barra, €; le etichette vanno a capo
 */
export default function Cascata({ passi = [], ricavi = null, titoloValore = '', titoloConfronto = '', evidenzia = null, avviso = '', isMobile = false }) {
  const [tabella, setTabella] = useState(false)
  const { righe, min, max } = geometriaCascata(passi)
  const scala = (x) => ((x - min) / (max - min)) * 100
  const conQuota = !isMobile && ricavi > 0
  const differenze = righe.map(differenzaPasso)
  const conDifferenza = !isMobile && differenze.some(Boolean)
  const maxDiff = Math.max(1, ...differenze.filter(Boolean).map(x => Math.abs(x.d)))
  const muovi = transizione('left', 'width')

  const cifra = (r, dec = 0) => (r.v == null ? 'non lo so'
    : `${r.tipo === 'meno' && Math.round(Math.abs(r.v)) > 0 ? MENO : ''}${dec ? euro(Math.abs(r.v), { decimali: 2 }).replace(' €', '') : NF0.format(Math.abs(r.v))}`)
  const conEuro = (r) => (r.v == null ? 'non lo so' : `${cifra(r)} €`)
  const quotaDi = (r) => (ricavi > 0 && r.v != null && r.tipo !== 'inizio' ? quotaColonna(Math.abs(r.v) / ricavi * 100) : '')

  const colonne = [
    `${colonna('voce', isMobile)}px`, 'minmax(0, 1fr)', `${colonna('euro', isMobile)}px`,
    ...(conQuota ? [`${colonna('quota')}px`] : []),
    ...(conDifferenza ? [`${colonna('barretta')}px`, `${colonna('differenza')}px`] : []),
  ].join(' ')
  const griglia = { display: 'grid', gridTemplateColumns: colonne, columnGap: space[3], alignItems: 'center' }

  return (
    <div>
      {avviso && <RigaAvviso avviso={avviso} stile={{ marginBottom: space[2] }} />}
      {/* Le intestazioni: una volta, con l'euro (le celle non lo ripetono). */}
      <div aria-hidden="true" style={{ ...griglia, paddingBottom: space[2], borderBottom: `1px solid ${T.borderSoft}`, marginBottom: space[1] }}>
        <span style={intestazione}>Voce</span>
        <span />
        <span style={{ ...intestazione, textAlign: 'right' }}>{titoloValore ? `${titoloValore}, €` : '€'}</span>
        {conQuota && <span style={{ ...intestazione, textAlign: 'right', whiteSpace: 'nowrap' }}>% incassi</span>}
        {conDifferenza && <span style={{ ...intestazione, textAlign: 'right', gridColumn: 'span 2' }}>{titoloConfronto ? `${titoloConfronto}, €` : 'differenza, €'}</span>}
      </div>

      <div role="list" style={{ display: 'flex', flexDirection: 'column' }}>
        {righe.map((r, i) => {
          const incompleto = eIncompleto(r)
          const forte = r.tipo === 'inizio' || r.tipo === 'fine'
          const scuro = evidenzia ? r.chiave === evidenzia : forte
          const colore = r.negativo ? T.graficoPeggio : r.tipo === 'aggiunta' ? T.graficoMeglio : scuro ? T.graficoReale : T.graficoConfronto
          const diff = differenze[i]
          const contenuto = (
            <>
              <span style={{ ...testo(font.size.base), fontWeight: forte ? 700 : 500, color: T.text, minWidth: 0, overflowWrap: 'break-word' }}>
                {r.etichetta}
                {/* L'avvertimento del passo, sotto la voce: «IVA compresa». */}
                {r.avviso && <span style={{ display: 'block', ...testo(font.size.sm), fontWeight: 600, color: T.amberDark }}>{r.avviso}</span>}
              </span>
              <span style={{ position: 'relative', height: 16 }} aria-hidden="true">
                <span style={{ position: 'absolute', top: -4, bottom: -4, left: `${scala(0)}%`, width: 1, background: T.graficoGriglia }} />
                {r.v == null ? (
                  <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${scala(r.punto)}%`, width: 24, ...stileIncompleto }} />
                ) : (
                  <span style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${scala(r.da)}%`,
                    // La larghezza si calcola qui e non con `max()` del CSS: le
                    // pagine salvate per le foto la perdevano, e la barra
                    // spariva. Mezzo punto di minimo, perché si veda anche un
                    // passo piccolo.
                    width: `${Math.max(0.5, scala(r.a) - scala(r.da))}%`, transition: muovi,
                    ...(incompleto ? stileIncompleto : { background: colore, borderRadius: R.xs }),
                  }} />
                )}
              </span>
              <span style={{
                ...testo(font.size.base), ...cifreInColonna, fontWeight: forte ? 700 : 600,
                color: r.v == null || incompleto ? T.amberDark : r.negativo ? T.graficoPeggio : T.text,
              }}>{cifra(r)}</span>
              {conQuota && <span style={{ ...testo(font.size.sm), ...cifreInColonna, color: T.textSoft }}>{quotaDi(r)}</span>}
              {conDifferenza && (
                <span style={{ position: 'relative', height: 12 }} aria-hidden="true">
                  <span style={{ position: 'absolute', top: -6, bottom: -6, left: '50%', width: 1, background: T.graficoGriglia }} />
                  {diff && diff.d !== 0 && (
                    <span style={{
                      position: 'absolute', top: 0, bottom: 0, transition: muovi,
                      left: diff.d > 0 ? '50%' : `${50 - (Math.abs(diff.d) / maxDiff) * 50}%`,
                      width: `${Math.max(2, (Math.abs(diff.d) / maxDiff) * 50)}%`,
                      background: diff.verso === 'peggio' ? T.graficoPeggio : T.graficoMeglio,
                      borderRadius: diff.d > 0 ? `0 ${R.xs}px ${R.xs}px 0` : `${R.xs}px 0 0 ${R.xs}px`,
                    }} />
                  )}
                </span>
              )}
              {conDifferenza && (
                <span style={{ ...testo(font.size.sm), ...cifreInColonna, color: incompleto ? T.textSoft : T.textMid }}>
                  {diff ? conSegno(diff.d) : incompleto && finito(r.v) && finito(r.confronto) ? conSegno(r.v - r.confronto) : ''}
                </span>
              )}
            </>
          )
          const stile = {
            ...griglia, minHeight: 32, padding: `${space[1]}px 0`,
            border: 'none', background: 'transparent', font: 'inherit', textAlign: 'left', width: '100%',
            ...(r.tipo === 'fine' ? { borderTop: `1px solid ${T.borderStr}`, marginTop: space[1], paddingTop: space[2] } : null),
          }
          const nomeAccessibile = `${r.etichetta}: ${conEuro(r)}${incompleto ? ', spese senza voce' : ''}${r.avviso ? `, ${r.avviso}` : ''}`
          return r.onClick ? (
            <button key={i} type="button" role="listitem" onClick={r.onClick} title={r.nota || undefined}
              aria-label={`${nomeAccessibile}. Apri il dettaglio`} style={{ ...stile, cursor: 'pointer' }}>
              {contenuto}
            </button>
          ) : (
            <div key={i} role="listitem" title={r.nota || undefined} style={stile}>{contenuto}</div>
          )
        })}
      </div>

      <button type="button" onClick={() => setTabella(t => !t)} aria-expanded={tabella}
        style={{
          marginTop: space[2], border: 'none', background: 'transparent', color: T.textSoft, fontWeight: 600,
          cursor: 'pointer', padding: 0, fontFamily: 'inherit', minHeight: 44, ...testo(font.size.sm),
        }}>
        {tabella ? 'Nascondi i numeri' : 'Vedi i numeri in tabella'}
      </button>
      {tabella && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: space[1], ...testo(font.size.base) }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...intestazione, textAlign: 'left', padding: `${space[2]}px ${space[1]}px` }}>Voce</th>
              <th scope="col" style={{ ...intestazione, textAlign: 'right', padding: `${space[2]}px ${space[1]}px` }}>{titoloValore || 'Importo'}</th>
              <th scope="col" style={{ ...intestazione, textAlign: 'right', padding: `${space[2]}px ${space[1]}px` }}>% incassi</th>
              {differenze.some(Boolean) && <th scope="col" style={{ ...intestazione, textAlign: 'right', padding: `${space[2]}px ${space[1]}px` }}>{titoloConfronto || 'Differenza'}</th>}
            </tr>
          </thead>
          <tbody>
            {righe.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                <td style={{ padding: `${space[2]}px ${space[1]}px`, color: T.text }}>{r.etichetta}{eIncompleto(r) ? ' (senza voce)' : ''}</td>
                <td style={{ padding: `${space[2]}px ${space[1]}px`, ...cifreInColonna, color: T.text }}>{r.v == null ? 'non lo so' : `${cifra(r, 2)} €`}</td>
                <td style={{ padding: `${space[2]}px ${space[1]}px`, ...cifreInColonna, color: T.textSoft }}>{quotaDi(r)}</td>
                {differenze.some(Boolean) && (
                  <td style={{ padding: `${space[2]}px ${space[1]}px`, ...cifreInColonna, color: T.textMid }}>
                    {differenze[i] ? `${conSegno(differenze[i].d, { unita: '€' })}${differenze[i].verso === 'pari' ? '' : ` · ${differenze[i].verso}`}` : ''}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
