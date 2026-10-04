// ── Un numero, il suo confronto, e che cosa vuol dire ───────────────────
//
// ANALISI_DESIGN.md, regole 2 e 4 e §6: un numero non sta mai da solo, e una
// stima porta la parola «stimato» dentro la tessera. Se il numero non si
// può dare, la tessera dice perché invece di scrivere zero.
//
// 04/10/2026 (audit del design misurato al pixel, C2):
//   • le tessere affiancate non erano incolonnate: etichette sfasate di 6 px
//     (imbottitura 20/22 per la grande, 14/16 per le altre) e righe sotto il
//     numero sfasate di 24,6 px nel Mese e 21,4 px nelle Previsioni, perché
//     la riga del confronto c'era solo se c'era il confronto. Adesso
//     l'imbottitura è una (20 computer, 16 telefono), la riga del confronto
//     c'è sempre e dice «nessun confronto» quando manca, e dentro
//     `FilaTessere` le tessere condividono le righe interne (subgrid): se
//     un'etichetta va a capo si alzano tutte, e i numeri restano in fila;
//   • la freccia seguiva il giudizio e non il segno («↘ +52%»): adesso la
//     direzione la dà il segno, il colore il giudizio;
//   • senza valore la risposta diventava una frase grigia da 16 px accanto a
//     numeri neri da 22: adesso resta grande, e se la pagina sa un numero
//     vicino (`noto`: «74.057 € prima del personale») mostra quello, con il
//     perché in ambra sotto;
//   • etichetta in frase normale, non in maiuscoletto; «€» più piccolo;
//     «stimato» in parole, non in una pillola; cifre proporzionali.
import React, { createContext, useContext } from 'react'
import { color as T, font, radius as R, space } from '../../lib/theme'
import { imbottitura, testo, SPAZI } from './misure'
import { Cifra, ParolaStimato, RigaConfronto, RigaMotivo, RigaAvviso } from './parti'

// Dentro `FilaTessere` la tessera prende le righe della fila (subgrid).
const InFila = createContext(false)

/**
 * La fila di tessere: una griglia le cui righe interne (etichetta · numero ·
 * avvertimento · confronto · nota) sono in comune fra tutte le tessere. Al
 * telefono una colonna sola.
 * @param {{ colonne?: string, isMobile?: boolean, children: React.ReactNode }} p
 *   `colonne` come `gridTemplateColumns` («2fr 1fr 1fr»); di base parti uguali.
 */
export function FilaTessere({ colonne = '', isMobile = false, children }) {
  const n = React.Children.toArray(children).filter(Boolean).length || 1
  const gap = isMobile ? SPAZI.fraRiquadri.telefono : SPAZI.fraRiquadri.computer
  return (
    <InFila.Provider value={true}>
      <div style={{
        display: 'grid', columnGap: gap, rowGap: gap, minWidth: 0,
        gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : (colonne || `repeat(${n}, minmax(0, 1fr))`),
      }}>
        {children}
      </div>
    </InFila.Provider>
  )
}

// Le righe di una tessera: etichetta · numero · avvertimento · confronto · nota.
const RIGHE = 5

const DIM = { normale: font.size['2xl'], grande: font.size['4xl'], grandeTelefono: font.size['3xl'] }

/**
 * @param {object} p
 * @param {string} p.etichetta
 * @param {string|null} p.valore  già formattato («124.553 €»); `null` = non disponibile
 * @param {string} [p.unita]  se `valore` è senza unità; l'euro finale si stacca da solo
 * @param {boolean} [p.stimato]
 * @param {string} [p.motivoMancante]  perché `valore` è null
 * @param {{ valore: string, etichetta?: string, stimato?: boolean }} [p.noto]
 *   il numero che si sa quando `valore` manca («74.057 €», «Utile prima del personale»)
 * @param {{ etichetta: string, onClick: () => void }} [p.azione]  per sistemare quello che manca
 * @param {{ verso: 'meglio'|'peggio'|'pari', testoDelta: string, delta?: number }|null} [p.variazione]
 * @param {string} [p.rispettoA]  «su agosto 2025»
 * @param {string} [p.valoreConfronto]  «13.400 €»
 * @param {string|null} [p.senzaConfronto]  cosa dire senza confronto; di base «nessun confronto» se c'è
 *   `rispettoA` (un confronto era atteso), altrimenti la riga resta vuota, alta uguale
 * @param {string} [p.contesto]  riga sotto, grigia
 * @param {string} [p.avviso]  l'avvertimento che cambia come si legge il numero («IVA compresa: 76
 *   fatture senza imponibile»): in ambra, nella riga subito sotto il numero (ANALISI_DESIGN §6)
 * @param {boolean} [p.grande]  numero più grande (per LA risposta c'è `NumeroPrincipale`)
 * @param {boolean} [p.isMobile]
 */
export default function NumeroConConfronto({
  etichetta, valore, unita = '', stimato = false, motivoMancante = 'non lo so ancora', noto = null, azione = null,
  variazione = null, rispettoA = '', valoreConfronto = '', senzaConfronto = '', contesto = '', avviso = '',
  grande = false, isMobile = false,
}) {
  const inFila = useContext(InFila)
  const manca = valore == null
  const conNoto = manca && noto?.valore != null
  const dim = grande ? (isMobile ? DIM.grandeTelefono : DIM.grande) : DIM.normale
  const pad = imbottitura(isMobile)

  let numero
  if (!manca || conNoto) {
    numero = (
      <>
        <Cifra valore={conNoto ? noto.valore : valore} unita={unita} dimensione={dim} />
        {(conNoto ? noto.stimato : stimato) && <ParolaStimato />}
      </>
    )
  } else {
    // Senza numero la frase resta grande: è la risposta, non una nota.
    const dimFrase = grande ? font.size['2xl'] : font.size.xl
    numero = <span style={{ ...testo(dimFrase), fontWeight: 700, color: T.textMid }}>{motivoMancante}</span>
  }

  // Lo spazio fra le righe è un'imbottitura in alto (4 px) e non lo spazio
  // della griglia: così la riga dell'avvertimento, quando non c'è, è alta zero
  // e non lascia 4 px in più.
  const sopra = { paddingTop: space[1] }
  const rigaSotto = manca
    ? (conNoto ? <RigaMotivo motivo={motivoMancante} azione={azione} stile={sopra} /> : (
      azione ? <RigaMotivo motivo="" azione={azione} stile={sopra} /> : <RigaConfronto senzaConfronto={null} stile={sopra} />
    ))
    // «nessun confronto» solo se un confronto era atteso (c'è `rispettoA` o la
    // pagina dice perché manca): le Previsioni non confrontano, e tre volte
    // «nessun confronto» sarebbe rumore. La riga c'è comunque, alta uguale.
    : <RigaConfronto variazione={variazione} rispettoA={rispettoA} valoreConfronto={valoreConfronto}
      senzaConfronto={senzaConfronto || (rispettoA ? '' : null)} stile={sopra} />

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: pad, minWidth: 0,
      display: 'grid', rowGap: 0, alignContent: 'start',
      // Cinque righe: etichetta · numero · avvertimento · confronto · nota.
      // In fila sono quelle della fila, condivise. Da sola (le pagine che non
      // usano `FilaTessere`): se la griglia della pagina la allunga, lo
      // spazio in più va sopra il numero, così numero, confronto e nota
      // restano in fila con le tessere accanto.
      ...(inFila ? { gridRow: `span ${RIGHE}`, gridTemplateRows: 'subgrid' } : { gridTemplateRows: 'auto 1fr auto auto auto' }),
    }}>
      {/* L'etichetta sta in fondo alla sua riga: se quella accanto va a capo,
          questa resta attaccata al suo numero. */}
      <div style={{ ...testo(font.size.base), fontWeight: 500, color: T.textSoft, minHeight: 20, alignSelf: 'end' }}>
        {conNoto && noto.etichetta ? noto.etichetta : etichetta}
      </div>
      {/* I numeri di una fila sulla stessa linea di base, anche se uno è più grande. */}
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space[2], alignSelf: 'last baseline', ...sopra }}>
        {numero}
      </div>
      <RigaAvviso avviso={avviso} stile={sopra} />
      {rigaSotto}
      <div style={{ ...testo(font.size.sm), color: T.textSoft, ...(contesto ? sopra : null) }}>{contesto}</div>
    </div>
  )
}
