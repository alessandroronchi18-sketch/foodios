// ── La risposta della pagina, una sola, grande ─────────────────────────
//
// ANALISI_DESIGN.md §6: «una risposta grande per pagina, 36-48 px al
// computer, con unità piccola, confronto e una frase». L'audit del 04/10
// (IM3, e «cosa manca per l'effetto figo» in tutte e quattro le pagine):
// tutto pesava uguale, riquadri bianchi identici e numeri da 22 px, e
// l'occhio non sapeva dove posarsi. Nel Mese la risposta («quanto ho
// guadagnato?») era l'elemento più debole: una frase grigia da 16 px.
//
// Uso (una volta per pagina, in cima, sotto la domanda):
//
//   <NumeroPrincipale
//     etichetta="Utile di agosto"            // che cos'è il numero, in frase normale
//     valore="12.480 €"                      // già formattato; null = non lo so
//     stimato                                // «stimato» in parole accanto al numero
//     variazione={variazione({ attuale, confronto })}   // da formatoAnalisi
//     rispettoA="su agosto 2025"             // il termine del confronto
//     valoreConfronto="11.240 €"             // il numero di allora, fra parentesi
//     frase="Su 100 € incassati te ne restano 18."      // UNA frase: il perché
//     destra={<Andamentino valori={dodiciMesi} larghezza={160} altezza={48} />}
//     isMobile={isMobile}
//   />
//
// Quando il numero non si sa:
//   valore={null}
//   motivoMancante="manca il personale: l'utile vero sarà più basso"
//   noto={{ valore: '74.057 €', etichetta: 'Utile prima del personale', stimato: true }}
//   azione={{ etichetta: 'Apri Personale', onClick: () => onNavigate('personale') }}
// → mostra grande il numero che si sa, con la sua etichetta, e sotto il
//   perché in ambra con il passaggio per sistemarlo. Senza `noto` il perché
//   diventa la risposta, grande, e non si scrive mai zero.
//
// Altre prop: `unita` (se `valore` non ha l'unità; l'euro finale si stacca
// da solo), `senzaConfronto` (cosa dire se il confronto manca; di base
// «nessun confronto» se c'è `rispettoA`), `riquadro` (dentro un riquadro
// bianco invece che sul fondo della pagina).
//
// Le cifre sono proporzionali (le tabellari servono solo in colonna), la
// freccia segue il segno e il colore il giudizio, le righe di testo sono in
// pixel tondi. Niente numeri che contano da soli all'apertura (ricerca §6.6).
import React from 'react'
import { color as T, font, radius as R, space } from '../../lib/theme'
import { imbottitura, testo } from './misure'
import { Cifra, ParolaStimato, RigaConfronto, RigaMotivo } from './parti'

const DIM = {
  computer: { numero: font.size['5xl'], frase: font.size['3xl'], confronto: font.size.md, testo: font.size.lg },
  telefono: { numero: font.size['4xl'], frase: font.size['2xl'], confronto: font.size.md, testo: font.size.md },
}

export default function NumeroPrincipale({
  etichetta, valore, unita = '', stimato = false,
  motivoMancante = 'non lo so ancora', noto = null, azione = null,
  variazione = null, rispettoA = '', valoreConfronto = '', senzaConfronto = '',
  frase = null, destra = null, riquadro = false, isMobile = false,
}) {
  const d = isMobile ? DIM.telefono : DIM.computer
  const manca = valore == null
  const conNoto = manca && noto?.valore != null
  const nome = conNoto && noto.etichetta ? noto.etichetta : etichetta

  let numero
  if (!manca || conNoto) {
    numero = (
      <>
        <Cifra valore={conNoto ? noto.valore : valore} unita={unita} dimensione={d.numero} peso={800} />
        {(conNoto ? noto.stimato : stimato) && <ParolaStimato dimensione={d.testo} />}
      </>
    )
  } else {
    numero = <span style={{ ...testo(d.frase), fontWeight: 700, color: T.textMid, letterSpacing: '-0.01em' }}>{motivoMancante}</span>
  }

  let sotto = null
  if (manca && (conNoto || azione)) sotto = <RigaMotivo motivo={conNoto ? motivoMancante : ''} azione={azione} dimensione={d.confronto} />
  else if (!manca && (variazione || rispettoA || senzaConfronto)) {
    sotto = <RigaConfronto variazione={variazione} rispettoA={rispettoA} valoreConfronto={valoreConfronto}
      senzaConfronto={senzaConfronto} dimensione={d.confronto} />
  }

  const pad = imbottitura(isMobile)
  return (
    <section aria-label={nome} style={{
      display: 'grid', alignItems: 'end', minWidth: 0,
      gridTemplateColumns: destra && !isMobile ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
      columnGap: space[6], rowGap: space[4],
      ...(riquadro ? { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: pad } : null),
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0 }}>
        <div style={{ ...testo(d.testo), fontWeight: 600, color: T.textMid }}>{nome}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space[3] }}>{numero}</div>
        {sotto}
        {frase && (
          // Una frase sola, stretta abbastanza da leggersi (~70 caratteri).
          <p style={{ margin: `${space[2]}px 0 0`, maxWidth: 640, ...testo(d.testo), color: T.text }}>{frase}</p>
        )}
      </div>
      {destra && <div style={{ minWidth: 0 }}>{destra}</div>}
    </section>
  )
}
