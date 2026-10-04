// ── Le tessere della Produzione: il venduto, e accanto il resto ──────────
//
// ANALISI_DESIGN.md, regole 1, 2 e 4: il primo numero è la risposta (il
// venduto, grande), ogni numero ha il suo confronto, le stime portano la
// parola «stimato» dentro la tessera. Un numero che non si sa (margine senza
// costi, scarto mai scritto) dice perché invece di scrivere zero.
//
// Prima: «Venduto stimato 11.787,0 kg ↓ 53,2% vs periodo prec.» in rosso,
// con il calo che era un mese non registrato, e «Margine (100,0%)».
import React from 'react'
import { ui3 } from '../../lib/theme'
import { euro, quota, variazione, percentualeSegno } from '../../lib/formatoAnalisi'
import { variazionePct } from '../../lib/produzioneAnalisi'
import { NumeroConConfronto } from '../../components/analisi'
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
 * @param {{ n: number }} p.copertura
 * @param {boolean} p.scartoRegistrato
 * @param {{ n: number, euroStimati: number|null }} p.senzaRicetta
 * @param {number} p.nGusti  i gusti con un movimento nel periodo
 */
export default function Tessere({
  totali, totaliPrev, confronto, confrontoInfo, copertura, scartoRegistrato,
  senzaRicetta, nGusti, isMobile, isTablet,
}) {
  const prima = totaliPrev || null
  const rispettoA = confronto === 'annoPrec' ? 'sull\'anno prima' : 'sul periodo prima'
  const etichettaPrima = confronto === 'annoPrec' ? 'anno prima' : 'periodo prima'
  const perche = !prima && confrontoInfo && !confrontoInfo.ok && confrontoInfo.motivo
    ? `nessun confronto: ${confrontoInfo.motivo}` : null

  const vVenduto = prima ? variazione({ attuale: totali.vend, confronto: prima.vend }) : null
  const vRicavo = prima ? variazione({ attuale: totali.ricavo, confronto: prima.ricavo }) : null
  const vMargine = prima && totali.margine != null && prima.margine != null
    ? variazione({ attuale: totali.margine, confronto: prima.margine }) : null
  const vScarto = prima && scartoRegistrato ? variazione({ attuale: totali.scarto, confronto: prima.scarto, piuEMeglio: false }) : null

  const mediaGiorno = copertura?.n > 0 ? totali.vend / copertura.n : null
  const colonne = ui3(isMobile, isTablet, { telefono: '1fr', tablet: '1fr 1fr', computer: '1.3fr 1fr 1fr' })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: colonne, gap: isMobile ? 16 : 24 }}>
      <div style={{ display: 'grid', gridRow: !isMobile && !isTablet ? 'span 2' : 'auto', gridColumn: isTablet && !isMobile ? '1 / -1' : 'auto' }}>
        <NumeroConConfronto grande isMobile={isMobile}
          etichetta="Venduto"
          valore={kgTessera(totali.vend)}
          variazione={vVenduto} rispettoA={rispettoA} valoreConfronto={prima ? kgTessera(prima.vend) : ''}
          contesto={[
            mediaGiorno != null ? `${kgTessera(mediaGiorno)} al giorno registrato, in media` : null,
            perche,
          ].filter(Boolean).join(' · ')} />
      </div>
      <NumeroConConfronto isMobile={isMobile}
        etichetta="Prodotto"
        valore={kgTessera(totali.prod)}
        contesto={[
          nGusti > 0 ? quanti(nGusti, 'gusto', 'gusti') : null,
          confrontoNeutro(totali.prod, prima?.prod, etichettaPrima, kgTessera),
        ].filter(Boolean).join(' · ')} />
      <NumeroConConfronto isMobile={isMobile}
        etichetta="Ricavo stimato"
        valore={euro(totali.ricavo)}
        variazione={vRicavo} rispettoA={rispettoA} valoreConfronto={prima ? euro(prima.ricavo) : ''}
        contesto={senzaRicetta?.n > 0
          ? `mancano ${quanti(senzaRicetta.n, 'gusto senza ricetta', 'gusti senza ricetta')}${senzaRicetta.euroStimati != null ? ` (circa ${euro(senzaRicetta.euroStimati)})` : ''}`
          : 'chili venduti per il prezzo medio dei formati'} />
      <NumeroConConfronto isMobile={isMobile}
        etichetta="Margine stimato"
        valore={totali.margine != null ? euro(totali.margine) : null}
        motivoMancante="non calcolabile"
        variazione={vMargine} rispettoA={rispettoA} valoreConfronto={vMargine ? euro(prima.margine) : ''}
        contesto={totali.margine == null
          ? 'nessun gusto ha prezzo e costo completi'
          : `${quota(totali.margPct)} del ricavo${totali.nConMargine < totali.nConVendita ? ` · su ${totali.nConMargine} gusti su ${totali.nConVendita}` : ''}`} />
      <NumeroConConfronto isMobile={isMobile}
        etichetta="Scarto"
        valore={scartoRegistrato ? kgTessera(totali.scarto) : null}
        motivoMancante="non registrato"
        variazione={vScarto} rispettoA={rispettoA} valoreConfronto={vScarto ? kgTessera(prima.scarto) : ''}
        contesto={scartoRegistrato
          ? (totali.prod > 0 ? `${quota((totali.scarto / totali.prod) * 100)} del prodotto` : '')
          : 'mai scritto: quello che si butta è dentro il venduto'} />
    </div>
  )
}
