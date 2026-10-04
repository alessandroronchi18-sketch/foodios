// ── La risposta a «Torna il conto?» ───────────────────────────────────────
//
// Una risposta grande (ANALISI_DESIGN.md §6): la differenza fra la cassa e
// l'incasso che l'inventario fa aspettare, con il giudizio scritto a parole
// («il conto torna», «da guardare», «non torna») e non con un semaforo
// (regola 7). Accanto il venduto al banco, l'incasso stimato, la cassa.
//
// Senza la cassa la tessera grande dice «non si può dire» e perché, e sotto
// un riquadro dice quello che si può dire lo stesso: quanto è uscito e
// quanto vale, se il conto della VETRINA torna (c'era + fatto − venduto =
// resta: non serve la cassa per saperlo), come va rispetto alla settimana
// prima, e cosa serve per fare il conto vero.
import React from 'react'
import { color as T, font, radius as R, ui3 } from '../../lib/theme'
import { euro, euroSegno, quota, variazione } from '../../lib/formatoAnalisi'
import { NumeroPrincipale, NumeroConConfronto, FilaTessere, Riquadro, TitoloGrafico, FraseInsight } from '../../components/analisi'
import { kg, intero } from '../produzione/numeri'

// Sotto il 5% è arrotondamento delle pesate e delle porzioni; fino al 15%
// conviene guardare; oltre il conto non torna. Le stesse soglie di prima
// (`driftTone`), dette a parole.
export function giudizio(driftPct) {
  if (driftPct == null) return null
  const a = Math.abs(driftPct)
  if (a < 5) return 'il conto torna'
  if (a < 15) return 'da guardare'
  return 'il conto non torna'
}

const kgSett = (k) => `${kg(k)} kg`
const nKg1 = (n) => new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)

/** Le frasi di «Senza la cassa, ecco cosa si può dire». */
export function frasiSenzaCassa({ kpi, kpiPrev, vetrina }) {
  const frasi = []
  frasi.push({ id: 'uscito', testo: `L'inventario dice che sono usciti ${nKg1(kpi.totVendutoG / 1000)} kg di gelato, circa ${euro(kpi.ricavoAtteso || 0)} ai prezzi dei formati.` })
  // Da dove viene quel venduto. Non è un controllo: il venduto si calcola
  // proprio da questa riga (c'era + fatto − resta), quindi «torna» sempre,
  // tranne dove manca una rimanenza. Prima (04/10, mai pubblicato) questa
  // frase diceva «Il conto della vetrina torna» in verde: una rassicurazione
  // senza verifica. Il giudizio c'è solo per le rimanenze che mancano.
  if (vetrina) {
    const n = vetrina.celleNonCalcolabili || 0
    frasi.push({
      id: 'vetrina', verso: n > 0 ? 'peggio' : 'info',
      testo: `Viene dalla vetrina: c'erano ${kgSett(vetrina.inizioG / 1000)}, ne hai fatti ${kgSett(vetrina.prodottoG / 1000)}, ne restano ${kgSett(vetrina.fineG / 1000)}.`
        + (n > 0 ? ` In ${intero(n)} ${n === 1 ? 'casella' : 'caselle'} manca la rimanenza: il venduto di quei giorni non si sa${vetrina.torna ? '' : `, con una differenza di ${kgSett(Math.abs(vetrina.differenzaG) / 1000)}`}.` : ''),
    })
  }
  // La settimana prima si confronta solo con gli stessi giorni registrati.
  if (kpiPrev && kpiPrev.giorniInventario > 0) {
    if (kpiPrev.giorniInventario === kpi.giorniInventario) {
      const v = variazione({ attuale: kpi.totVendutoG, confronto: kpiPrev.totVendutoG })
      if (v) frasi.push({ id: 'prima', verso: v.verso === 'pari' ? 'pari' : v.verso, testo: `Rispetto alla settimana prima: ${v.testoDelta} di gelato uscito (${kgSett(kpiPrev.totVendutoG / 1000)} allora).` })
    } else {
      frasi.push({ id: 'prima', testo: `Con la settimana prima non si confronta: ha ${intero(kpiPrev.giorniInventario)} giorni registrati, questa ${intero(kpi.giorniInventario)}.` })
    }
  }
  return frasi
}

export default function Risposta({ kpi, kpiPrev, euroKg, vetrina, onCassa, isMobile, isTablet }) {
  const g = giudizio(kpi.driftPct)
  const retail = kpi.retailKg ?? kpi.totVendutoKg
  const retailPrima = kpiPrev ? (kpiPrev.retailKg ?? kpiPrev.totVendutoKg) : null
  const stessiGiorni = kpiPrev && kpiPrev.giorniInventario > 0 && kpiPrev.giorniInventario === kpi.giorniInventario
  const vVenduto = stessiGiorni ? variazione({ attuale: retail, confronto: retailPrima }) : null
  // Anche la cassa si confronta solo a parità di giorni con la cassa: due
  // chiusure contro sette non sono un calo.
  const vCassa = kpi.cassaRegistrata && kpiPrev?.cassaRegistrata && kpiPrev.giorniCassa === kpi.giorniCassa
    ? variazione({ attuale: kpi.cassaEffettiva, confronto: kpiPrev.cassaEffettiva }) : null
  // La riga del confronto (pezzo comune, §6) c'è sempre: con la settimana
  // prima confrontabile dice di quanto, se no perché non si confronta.
  const senzaVenduto = kpiPrev && kpiPrev.giorniInventario > 0 && !stessiGiorni
    ? `nessun confronto: la settimana prima ha ${kpiPrev.giorniInventario} giorni registrati, questa ${kpi.giorniInventario}`
    : 'nessun confronto'
  const senzaCassa = !kpi.cassaRegistrata ? null
    : kpiPrev?.cassaRegistrata ? `nessun confronto: la settimana prima ha la cassa in ${kpiPrev.giorniCassa} giorni, questa in ${kpi.giorniCassa}`
      : 'nessun confronto: la settimana prima non ha la cassa'
  const colonne = ui3(isMobile, isTablet, { telefono: '', tablet: 'repeat(3, minmax(0, 1fr))', computer: 'repeat(3, minmax(0, 1fr))' })
  const fra = isMobile ? 16 : 24
  const frase = kpi.driftEur == null ? null
    // Senza percentuale (l'inventario non fa aspettare niente in quei giorni)
    // il giudizio non si dà: si dicono i due numeri.
    : `${g ? `${g[0].toUpperCase() + g.slice(1)}: ${quota(kpi.driftPct)} dell'incasso stimato.` : `${euro(kpi.cassaConfrontata)} incassati contro ${euro(kpi.attesoConfrontato || 0)} stimati: la percentuale non si calcola.`}${kpi.giorniConfrontati < kpi.giorniInventario
      ? ` La cassa c'è per ${kpi.giorniConfrontati} ${kpi.giorniConfrontati === 1 ? 'giorno' : 'giorni'} su ${kpi.giorniInventario} con l'inventario: il confronto è fatto solo su quelli (${euro(kpi.cassaConfrontata)} incassati contro ${euro(kpi.attesoConfrontato)} stimati).`
      : ''}`
  // La frase grande è corta; il dettaglio («nessuna chiusura questa
  // settimana») sta nella tessera della cassa accanto.
  const motivo = !kpi.cassaRegistrata ? 'manca la cassa' : (kpi.motivoConfronto || 'manca la cassa')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: fra }}>
      {/* La risposta, grande e sola (NumeroPrincipale). Senza la cassa il
          motivo è la risposta, e «Registra la cassa» sta sotto: l'azione
          che cambia come si legge il numero sta accanto al numero (§6), non
          solo dentro la copertura chiusa. */}
      <NumeroPrincipale isMobile={isMobile}
        etichetta="Differenza con la cassa"
        valore={kpi.driftEur != null ? euroSegno(kpi.driftEur) : null}
        motivoMancante={`Non si può dire: ${motivo}`}
        azione={!kpi.cassaRegistrata && onCassa ? { etichetta: 'Registra la cassa', onClick: onCassa } : null}
        frase={frase} />
      <FilaTessere colonne={colonne} isMobile={isMobile}>
        <NumeroConConfronto isMobile={isMobile}
          etichetta={kpi.b2bKg > 0 ? 'Venduto al banco' : 'Venduto'}
          valore={`${nKg1(retail)} kg`}
          variazione={vVenduto} rispettoA={vVenduto ? 'sulla settimana prima' : ''} valoreConfronto={vVenduto ? `${nKg1(retailPrima)} kg` : ''}
          senzaConfronto={vVenduto ? '' : senzaVenduto}
          contesto={kpi.b2bKg > 0 ? `${nKg1(kpi.totVendutoKg)} kg in tutto, ${nKg1(kpi.b2bKg)} all'ingrosso` : 'dall\'inventario'} />
        <NumeroConConfronto isMobile={isMobile}
          etichetta="Incasso stimato" stimato
          valore={euro(kpi.ricavoAtteso || 0)}
          contesto={`kg × ${euro(euroKg, { decimali: 2 }).replace(' €', '')} €/kg medio dei formati`} />
        <NumeroConConfronto isMobile={isMobile}
          etichetta="Cassa"
          valore={kpi.cassaRegistrata ? euro(kpi.cassaEffettiva) : null}
          motivoMancante="non registrata"
          variazione={vCassa} rispettoA={vCassa ? 'sulla settimana prima' : ''}
          senzaConfronto={vCassa ? '' : senzaCassa}
          contesto={kpi.cassaRegistrata
            ? `incassato in ${kpi.giorniCassa} ${kpi.giorniCassa === 1 ? 'giorno' : 'giorni'}`
            : 'nessuna chiusura questa settimana'} />
      </FilaTessere>

      {!kpi.cassaRegistrata && kpi.totVendutoG !== 0 && (
        <Riquadro isMobile={isMobile}>
          <div data-senza-cassa>
            <TitoloGrafico titolo="Senza la cassa il confronto non si può fare."
              sottotitolo="Ecco cosa si può dire lo stesso, e cosa serve per fare il conto vero." />
            {frasiSenzaCassa({ kpi, kpiPrev, vetrina }).map(f => (
              <FraseInsight key={f.id} verso={f.verso || 'info'}>{f.testo}</FraseInsight>
            ))}
            <FraseInsight verso="azione">
              Per sapere se il conto torna serve l&apos;incasso vero di ogni giorno: basta il totale della chiusura, in Cassa.
            </FraseInsight>
            {onCassa && (
              <button type="button" onClick={onCassa} style={{
                marginTop: 8, minHeight: 44, padding: '8px 16px', borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${T.brand}`, background: T.brand, color: T.white, fontSize: font.size.md, fontWeight: 700,
              }}>
                Vai alla Cassa
              </button>
            )}
          </div>
        </Riquadro>
      )}
    </div>
  )
}
