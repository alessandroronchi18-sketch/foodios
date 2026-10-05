// ── I totali dei costi fissi, nel kit dell'Analisi ───────────────────────
//
// 05/10/2026. Sotto «Già dalle fatture» la pagina era ancora del design
// vecchio: tre riquadri con gradiente e cerchio decorativo, «COSTO MENSILE
// TOTALE» in maiuscolo spaziato, «-» per il vuoto. Con zero voci (Mara oggi)
// si leggeva «-», «-», «-»: non diceva cosa scrivere. Nelle fatture di Mara
// non c'è l'affitto dei negozi (solo il garage): è un dato da chiedere.
//
// Due difetti di conto, stesso giorno:
//  • il totale delle voci e quello «già dalle fatture» non erano mai messi
//    insieme né distinti: chi leggeva «1.200 €» non sapeva se fosse tutto il
//    fisso del mese o solo la parte scritta a mano. Adesso il numero grande
//    dice da cosa è fatto («1.000 € dalle tue voci + 200 € già dalle fatture»);
//  • con zero voci le fatture sono comunque un fisso noto: si mostra quello,
//    come numero che si sa, e il resto come cosa da scrivere, mai zero.
// Per una sede sola le fatture non si dividono per sede in modo sicuro: lì
// il totale è delle sole voci, e la frase lo dice.
import React from 'react'
import { color as T, font, space } from '../../lib/theme'
import { fmt0, fmtp0 } from '../../lib/formatIt'
import { NumeroPrincipale, Riquadro, TitoloGrafico, ElencoBarre, RigaAvviso, Cifra, testo } from '../analisi'
import { CATEGORIE_DEFAULT } from '../../lib/costiAziendali'

const parteVoci = (n) => `${n} ${n === 1 ? 'voce' : 'voci'}`

/**
 * Cosa c'è dentro il totale dei fissi, in parole.
 * @param {object} p
 * @param {number} p.totVoci       euro al mese delle voci scritte (ambito scelto)
 * @param {number} p.nVoci         voci attive
 * @param {number|null} p.totFatture  euro al mese già dalle fatture; null = non si somma
 * @returns {{ totale: number, frase: string }}
 */
export function composizioneFissi({ totVoci = 0, nVoci = 0, totFatture = null }) {
  const dalle = `${fmt0(totVoci)} dalle tue ${parteVoci(nVoci)}`
  if (totFatture == null) return { totale: totVoci, frase: `${dalle}. Le spese già dalle fatture sono nel conto e non si sommano qui.` }
  if (!(totFatture > 0)) return { totale: totVoci, frase: `${dalle}. Dalle fatture non arriva nessuna spesa fissa.` }
  return { totale: totVoci + totFatture, frase: `${dalle} + ${fmt0(totFatture)} già dalle fatture.` }
}

/**
 * Cosa chiedere con zero voci. L'affitto dei negozi si chiede sempre: il
 * garage che arriva in fattura (Mara) è un affitto, ma non è quello dei
 * negozi, e la prima versione di oggi lo toglieva dall'invito per questo.
 */
export function invitoPrimaVoce() {
  return 'Scrivi qui l\'affitto di ogni negozio, le rate, le assicurazioni, la TARI: non arrivano in fattura.'
}

export default function TotaliCostiFissi({
  isMobile = false, nVoci = 0, nAttive = 0, nNonAttive = 0, totMese = 0, totAnno = 0, costoGiorno = 0,
  topCategoria = null, topVoci = [], totFatture = null,
  vociSenzaImporto = 0,
}) {
  const vuoto = nVoci === 0
  const { totale, frase } = composizioneFissi({ totVoci: totMese, nVoci: nAttive, totFatture })
  const attive = `${nAttive} ${nAttive === 1 ? 'voce attiva' : 'voci attive'}`
  const fuori = nNonAttive > 0 ? ` · ${nNonAttive} finit${nNonAttive === 1 ? 'a' : 'e'} o non ancora iniziat${nNonAttive === 1 ? 'a' : 'e'}` : ''
  const avvisoSenzaImporto = vociSenzaImporto > 0
    ? `${vociSenzaImporto === 1 ? 'Una voce non ha' : `${vociSenzaImporto} voci non hanno`} un importo leggibile: il totale qui sopra è più basso del vero, e lo stesso vale nel P&L. Aprila e scrivi l'importo per rimetterla nel conto.`
    : ''
  return (
    <>
      <Riquadro isMobile={isMobile} stile={{ marginBottom: space[5] }}>
        <NumeroPrincipale isMobile={isMobile}
          etichetta="Costo mensile totale"
          valore={vuoto ? null : fmt0(totale)}
          motivoMancante={invitoPrimaVoce()}
          frase={vuoto ? null : (
            <>
              {frase}
              <span style={{ display: 'block', color: T.textSoft, ...testo(font.size.sm) }}>{attive}{fuori}</span>
            </>
          )} />
        {avvisoSenzaImporto && (
          <div role="status" style={{ marginTop: space[3] }}><RigaAvviso avviso={avvisoSenzaImporto} dimensione={font.size.base} /></div>
        )}
        {vuoto ? (
          <div style={{ marginTop: space[3], color: T.textSoft, ...testo(font.size.sm) }}>Non lo sappiamo ancora: nessuna voce inserita.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: space[4], marginTop: space[4], paddingTop: space[4], borderTop: `1px solid ${T.border}` }}>
            <Dato etichetta="Costo annuo stimato" valore={fmt0(totAnno)} sotto={`Mensile × 12 · ${fmt0(costoGiorno)} al giorno`} />
            <Dato etichetta="Categoria principale" valore={topCategoria ? fmt0(topCategoria.value) : '-'}
              sotto={topCategoria ? `${topCategoria.label} · ${fmtp0(topCategoria.pct)} del totale` : 'Aggiungi voci per vedere il dettaglio'} />
          </div>
        )}
      </Riquadro>
      {topVoci.length > 0 && (
        <Riquadro isMobile={isMobile} stile={{ marginBottom: space[5] }}>
          <TitoloGrafico titolo="Voci più care del mese" sottotitolo="Le tre che pesano di più sul totale: da qui si comincia a tagliare." />
          <ElencoBarre etichetta="Voci più care del mese"
            voci={topVoci.map(v => ({
              chiave: v.id, etichetta: v.voce, valore: v.mensile, testoValore: `${fmt0(v.mensile)}/mese`,
              nota: `${CATEGORIE_DEFAULT.find(c => c.id === v.categoria)?.label || v.categoria || 'Altro'}${totMese > 0 ? ` · ${fmtp0((v.mensile / totMese) * 100)}` : ''}`,
            }))} />
        </Riquadro>
      )}
    </>
  )
}

function Dato({ etichetta, valore, sotto }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: T.textMid, fontWeight: 600, minHeight: 20, ...testo(font.size.base) }}>{etichetta}</div>
      <div style={{ minHeight: 32, display: 'flex', alignItems: 'baseline' }}><Cifra valore={valore} dimensione={font.size['2xl']} peso={800} /></div>
      <div style={{ color: T.textSoft, minHeight: 40, overflow: 'hidden', ...testo(font.size.sm) }}>{sotto}</div>
    </div>
  )
}
