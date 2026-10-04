// ── La risposta della Produzione: il venduto, e accanto il resto ─────────
//
// ANALISI_DESIGN.md, regole 1, 2 e 4 e §6: il primo numero è la risposta (il
// venduto, grande e solo: `NumeroPrincipale`), ogni numero ha il suo
// confronto, le stime portano la parola «stimato» nell'etichetta. Sotto, le
// altre quattro tessere in una fila (`FilaTessere`): etichette, numeri e
// righe del confronto sulla stessa linea.
//
// Prima: «Venduto stimato 11.787,0 kg ↓ 53,2% vs periodo prec.» in rosso,
// con il calo che era un mese non registrato, e «Margine (100,0%)». Poi (04/10,
// dopo i pezzi comuni nuovi) la tessera grande del venduto, alta due file,
// aveva il numero spinto in fondo e un vuoto sopra: la risposta adesso è il
// `NumeroPrincipale`, come il pezzo comune chiede.
import React from 'react'
import { euro, quota, variazione, percentualeSegno } from '../../lib/formatoAnalisi'
import { variazionePct, conGiorno } from '../../lib/produzioneAnalisi'
import { NumeroPrincipale, NumeroConConfronto, FilaTessere } from '../../components/analisi'
import { kgTessera, quanti } from './numeri'

/**
 * Il testo del confronto di un numero che non è né meglio né peggio (il
 * prodotto: farne di più non è un bene in sé), da mettere nella riga sotto.
 */
export function confrontoNeutro(attuale, prima, etichetta, formato) {
  if (prima == null || attuale == null) return null
  const p = percentualeSegno(variazionePct(attuale, prima))
  return `${etichetta} ${formato(prima)}${p ? ` (${p})` : ''}`
}

/**
 * @param {object} p
 * @param {object} p.totali  da `sommaGusti`
 * @param {object|null} p.totaliPrev  lo stesso, nel periodo di confronto (null = nessun confronto)
 * @param {'periodoPrec'|'annoPrec'|'nessuno'} p.confronto
 * @param {object|null} p.confrontoInfo
 * @param {{ n: number, ultimo?: string }} p.copertura
 * @param {boolean} [p.registrazioneFerma]  i dati si fermano prima della fine del periodo
 * @param {boolean} p.scartoRegistrato
 * @param {{ n: number, euroStimati: number|null }} p.senzaRicetta
 * @param {number} p.nGusti  i gusti con un movimento nel periodo
 */
export default function Tessere({
  totali, totaliPrev, confronto, confrontoInfo, copertura, registrazioneFerma = false, scartoRegistrato,
  senzaRicetta, nGusti, isMobile, isTablet,
}) {
  const prima = totaliPrev || null
  const rispettoA = confronto === 'annoPrec' ? 'sull\'anno prima' : 'sul periodo prima'
  const etichettaPrima = confronto === 'annoPrec' ? 'anno prima' : 'periodo prima'
  // Un confronto era atteso se l'utente non ha scelto «nessuno»: allora la
  // riga dice «nessun confronto» e perché; se no resta vuota.
  const atteso = confronto !== 'nessuno'
  const perche = !prima && confrontoInfo && !confrontoInfo.ok && confrontoInfo.motivo
    ? `nessun confronto: ${confrontoInfo.motivo}` : 'nessun confronto'
  const riga = (v, valorePrima) => (v
    ? { variazione: v, rispettoA, valoreConfronto: valorePrima }
    : { rispettoA: '', senzaConfronto: atteso ? perche : null })

  const vVenduto = prima ? variazione({ attuale: totali.vend, confronto: prima.vend }) : null
  const vRicavo = prima ? variazione({ attuale: totali.ricavo, confronto: prima.ricavo }) : null
  const vMargine = prima && totali.margine != null && prima.margine != null
    ? variazione({ attuale: totali.margine, confronto: prima.margine }) : null
  const vScarto = prima && scartoRegistrato ? variazione({ attuale: totali.scarto, confronto: prima.scarto, piuEMeglio: false }) : null

  const mediaGiorno = copertura?.n > 0 ? totali.vend / copertura.n : null
  const colonne = isMobile ? '' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))'

  return (
    <>
      <NumeroPrincipale isMobile={isMobile}
        etichetta="Venduto"
        valore={kgTessera(totali.vend)}
        {...riga(vVenduto, prima ? kgTessera(prima.vend) : '')}
        // L'avvertimento che cambia come si legge il numero sta accanto al
        // numero (§6): se i dati si fermano prima, si dice qui.
        frase={[
          mediaGiorno != null ? `${kgTessera(mediaGiorno)} al giorno registrato, in media.` : null,
          registrazioneFerma && copertura?.ultimo ? `Registrato fino ${conGiorno('al', copertura.ultimo)}: dopo non c'è niente.` : null,
        ].filter(Boolean).join(' ') || null} />
      <FilaTessere colonne={colonne} isMobile={isMobile}>
        <NumeroConConfronto isMobile={isMobile}
          etichetta="Prodotto"
          valore={kgTessera(totali.prod)}
          senzaConfronto={confrontoNeutro(totali.prod, prima?.prod, etichettaPrima, kgTessera)}
          contesto={nGusti > 0 ? quanti(nGusti, 'gusto', 'gusti') : ''} />
        <NumeroConConfronto isMobile={isMobile}
          etichetta="Ricavo stimato"
          valore={euro(totali.ricavo)}
          {...riga(vRicavo, prima ? euro(prima.ricavo) : '')}
          contesto={senzaRicetta?.n > 0
            ? `mancano ${quanti(senzaRicetta.n, 'gusto senza ricetta', 'gusti senza ricetta')}${senzaRicetta.euroStimati != null ? ` (circa ${euro(senzaRicetta.euroStimati)})` : ''}`
            : 'chili venduti per il prezzo medio dei formati'} />
        <NumeroConConfronto isMobile={isMobile}
          etichetta="Margine stimato"
          valore={totali.margine != null ? euro(totali.margine) : null}
          motivoMancante="non calcolabile"
          {...riga(vMargine, vMargine ? euro(prima.margine) : '')}
          contesto={totali.margine == null
            ? 'nessun gusto ha prezzo e costo completi'
            : `${quota(totali.margPct)} del ricavo${totali.nConMargine < totali.nConVendita ? ` · su ${totali.nConMargine} gusti su ${totali.nConVendita}` : ''}`} />
        <NumeroConConfronto isMobile={isMobile}
          etichetta="Scarto"
          valore={scartoRegistrato ? kgTessera(totali.scarto) : null}
          motivoMancante="non registrato"
          {...riga(vScarto, vScarto ? kgTessera(prima.scarto) : '')}
          contesto={scartoRegistrato
            ? (totali.prod > 0 ? `${quota((totali.scarto / totali.prod) * 100)} del prodotto` : '')
            : 'mai scritto: quello che si butta è dentro il venduto'} />
      </FilaTessere>
    </>
  )
}
