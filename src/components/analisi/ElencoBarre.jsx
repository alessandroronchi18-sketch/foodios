// ── Le classifiche: un elenco a barre, e le differenze dallo zero ───────
//
// Ricerca design §3.7, §3.2-3.3 e §2.9 (scelta 13). Due forme, un pezzo:
//
// `ElencoBarre` — per «chi pesa di più» (fornitori, gusti, nature di spesa):
//   nome e valore sulla stessa riga, sotto una traccia di 8 px a tutta
//   larghezza con il riempimento. Un nome lungo non cambia mai la larghezza
//   del disegno (sta sopra la barra, non accanto); i valori a destra in cifre
//   tabellari. Al massimo 7 voci più «Altro» (Toast, Qonto): oltre, l'occhio
//   non confronta più. La prima voce (o quella di cui parla il titolo) scura,
//   le altre grigie.
//
// `ElencoDivergente` — per «che cosa è cambiato»: una riga per voce, la barra
//   parte da uno zero comune a tutte le righe e va a destra se il numero
//   sale, a sinistra se scende; il colore dice il giudizio (rosso peggio,
//   verde meglio). Ordinate per euro di impatto, al massimo 5 più «Altro».
//   Sostituisce i paragrafi del Mese («Confezioni: +11.542 € di spesa
//   rispetto ad agosto 2025, soprattutto CONO ARTIC…», cinque volte: audit
//   IM9). Le colonne hanno le larghezze della cascata (COLONNE), così le
//   cause sotto la cascata cadono sulle sue verticali.
//
// Le barre si muovono in 250 ms; l'incompleto è tratteggiato in ambra.
import React from 'react'
import { color as T, font, radius as R, space } from '../../lib/theme'
import { euro, conSegno } from '../../lib/formatoAnalisi'
import { testo, transizione, colonna, intestazione, cifreInColonna } from './misure'
import { stileIncompleto } from './incompleto'

const finito = (x) => x != null && Number.isFinite(Number(x))

/**
 * Le prime `n` voci per grandezza, e le altre sommate in «Altro (N voci)».
 * Le voci senza numero restano in fondo, così come sono.
 * @param {{ chiave?: string, etichetta: string, valore: number|null }[]} voci
 * @param {number} n
 * @param {(v) => number} [peso]  di base il valore assoluto
 */
export function primiEAltro(voci = [], n = 7, peso = (v) => Math.abs(Number(v.valore))) {
  const conNumero = voci.filter(v => finito(v.valore)).sort((a, b) => peso(b) - peso(a))
  const senza = voci.filter(v => !finito(v.valore))
  if (conNumero.length <= n) return [...conNumero, ...senza]
  const resto = conNumero.slice(n)
  const somma = resto.reduce((s, v) => s + Number(v.valore), 0)
  return [
    ...conNumero.slice(0, n),
    { chiave: '__altro', etichetta: `Altro (${resto.length} ${resto.length === 1 ? 'voce' : 'voci'})`, valore: somma, altro: true },
    ...senza,
  ]
}

const formatoEuro = (v) => euro(v)

/**
 * @param {object} p
 * @param {{ chiave?: string, etichetta: string, valore: number|null, testoValore?: string,
 *   nota?: string, incompleto?: boolean, onClick?: () => void }[]} p.voci
 * @param {number} [p.quante=7]  quante voci prima di «Altro»
 * @param {string|number|null} [p.evidenzia]  la chiave (o l'indice) della voce scura; di base la prima; null = tutte scure
 * @param {(n: number) => string} [p.formato]  come si scrive il valore (di base gli euro)
 * @param {number} [p.massimo]  fondo scala comune fra più elenchi; di base il valore più grande
 * @param {string} [p.etichetta]  il nome dell'elenco, per chi legge lo schermo
 */
export default function ElencoBarre({ voci = [], quante = 7, evidenzia, formato = formatoEuro, massimo = null, etichetta = 'Classifica' }) {
  const righe = primiEAltro(voci, quante)
  const max = massimo ?? Math.max(1, ...righe.filter(r => finito(r.valore)).map(r => Math.abs(Number(r.valore))))
  const muovi = transizione('width')
  const scura = (r, i) => (evidenzia === null ? true
    : evidenzia === undefined ? i === 0 && !r.altro
      : typeof evidenzia === 'number' ? i === evidenzia : r.chiave === evidenzia)

  return (
    <ul aria-label={etichetta} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {righe.map((r, i) => {
        const valore = r.testoValore ?? (finito(r.valore) ? formato(Number(r.valore)) : 'non lo so')
        const larga = finito(r.valore) ? Math.max(0.5, (Math.abs(Number(r.valore)) / max) * 100) : 0
        const corpo = (
          <>
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', columnGap: space[3] }}>
              <span style={{ ...testo(font.size.md), color: T.text, fontWeight: scura(r, i) ? 600 : 500, minWidth: 0, overflowWrap: 'break-word' }}>
                {r.etichetta}
                {r.nota && <span style={{ ...testo(font.size.sm), color: T.textSoft, fontWeight: 500, marginLeft: space[2] }}>{r.nota}</span>}
              </span>
              <span style={{ ...testo(font.size.md), ...cifreInColonna, fontWeight: 600, color: finito(r.valore) && !r.incompleto ? T.text : T.amberDark }}>{valore}</span>
            </span>
            {/* La traccia: 8 px, a tutta larghezza, sempre uguale. */}
            <span aria-hidden="true" style={{ position: 'relative', display: 'block', height: 8, marginTop: space[1], borderRadius: R.xs, background: T.bgMuted }}>
              {larga > 0 && (
                <span style={{
                  position: 'absolute', top: 0, bottom: 0, left: 0, width: `${larga}%`, transition: muovi,
                  ...(r.incompleto ? stileIncompleto : { background: scura(r, i) ? T.graficoReale : T.graficoConfronto, borderRadius: R.xs }),
                }} />
              )}
            </span>
          </>
        )
        const nome = `${r.etichetta}: ${valore}${r.nota ? `, ${r.nota}` : ''}`
        return (
          <li key={r.chiave ?? i} aria-label={r.onClick ? undefined : nome}>
            {r.onClick ? (
              <button type="button" onClick={r.onClick} aria-label={`${nome}. Apri il dettaglio`} style={{
                display: 'block', width: '100%', minHeight: 44, padding: 0, border: 'none', background: 'transparent',
                font: 'inherit', textAlign: 'left', cursor: 'pointer',
              }}>{corpo}</button>
            ) : corpo}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Il giudizio di una differenza: dalla voce (`verso`) o, se manca, dal segno
 * e da `piuEMeglio` (per le spese salire è peggio).
 */
export function versoDiff(v, piuEMeglio) {
  if (v.verso) return v.verso
  if (!finito(v.valore) || Math.round(Number(v.valore)) === 0) return 'pari'
  return (Number(v.valore) > 0) === piuEMeglio ? 'meglio' : 'peggio'
}

/**
 * @param {object} p
 * @param {{ chiave?: string, etichetta: string, valore: number, verso?: 'meglio'|'peggio'|'pari',
 *   nota?: string, onClick?: () => void }[]} p.voci  `valore` è la differenza col segno (+11.542)
 * @param {number} [p.quante=5]
 * @param {boolean} [p.piuEMeglio=false]  di base sono spese: salire è peggio
 * @param {string} [p.titoloValore]  l'intestazione dei numeri («su agosto 2025, €»); senza, niente intestazioni
 * @param {boolean} [p.isMobile]
 * @param {string} [p.etichetta]
 */
export function ElencoDivergente({ voci = [], quante = 5, piuEMeglio = false, titoloValore = '', isMobile = false, etichetta = 'Che cosa è cambiato' }) {
  const righe = primiEAltro(voci, quante)
  const max = Math.max(1, ...righe.filter(r => finito(r.valore)).map(r => Math.abs(Number(r.valore))))
  const muovi = transizione('left', 'width')
  const colonne = `${colonna('voce', isMobile)}px minmax(0, 1fr) ${colonna('euro', isMobile)}px`
  const griglia = { display: 'grid', gridTemplateColumns: colonne, columnGap: space[3], alignItems: 'center' }
  const colore = { meglio: T.graficoMeglio, peggio: T.graficoPeggio, pari: T.textSoft }

  return (
    <div>
      {titoloValore && (
        <div aria-hidden="true" style={{ ...griglia, paddingBottom: space[2], borderBottom: `1px solid ${T.borderSoft}`, marginBottom: space[1] }}>
          <span style={intestazione}>Voce</span>
          {/* L'intestazione dei numeri prende anche la colonna delle barre: «su
              agosto 2025, €» non sta in 96 px e non deve andare a capo. */}
          <span style={{ ...intestazione, textAlign: 'right', gridColumn: 'span 2', whiteSpace: 'nowrap' }}>{titoloValore}</span>
        </div>
      )}
      <ul aria-label={etichetta} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {righe.map((r, i) => {
          const verso = r.altro ? 'pari' : versoDiff(r, piuEMeglio)
          const v = finito(r.valore) ? Number(r.valore) : 0
          const meta = (Math.abs(v) / max) * 50
          const testoValore = finito(r.valore) ? conSegno(v) : 'non lo so'
          const corpo = (
            <>
              <span style={{ ...testo(font.size.base), color: T.text, fontWeight: 500, minWidth: 0, overflowWrap: 'break-word' }}>
                {r.etichetta}
                {r.nota && <span style={{ display: 'block', ...testo(font.size.sm), color: T.textSoft }}>{r.nota}</span>}
              </span>
              <span aria-hidden="true" style={{ position: 'relative', height: 16 }}>
                {/* Lo zero: la stessa verticale in tutte le righe. */}
                <span style={{ position: 'absolute', top: -4, bottom: -4, left: '50%', width: 1, background: T.borderStr }} />
                {v !== 0 && (
                  <span style={{
                    position: 'absolute', top: 0, bottom: 0, transition: muovi,
                    left: v > 0 ? '50%' : `${50 - meta}%`, width: `${Math.max(0.5, meta)}%`,
                    background: r.altro ? T.graficoConfronto : colore[verso],
                    borderRadius: v > 0 ? `0 ${R.xs}px ${R.xs}px 0` : `${R.xs}px 0 0 ${R.xs}px`,
                  }} />
                )}
              </span>
              <span style={{ ...testo(font.size.base), ...cifreInColonna, fontWeight: 600, color: T.text }}>{testoValore}</span>
            </>
          )
          const nome = `${r.etichetta}: ${testoValore} €${verso !== 'pari' ? `, ${verso}` : ''}`
          // Solo il filo in alto, scritto senza mescolare `border` e `borderTop`.
          const stile = {
            ...griglia, minHeight: 36, padding: `${space[1]}px 0`,
            borderStyle: 'solid', borderColor: T.borderSoft, borderWidth: i ? '1px 0 0 0' : 0,
          }
          return (
            <li key={r.chiave ?? i} aria-label={r.onClick ? undefined : nome} style={r.onClick ? undefined : stile}>
              {r.onClick ? (
                <button type="button" onClick={r.onClick} aria-label={`${nome}. Apri il dettaglio`} style={{
                  ...stile, width: '100%', minHeight: 44, background: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer',
                }}>{corpo}</button>
              ) : corpo}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
