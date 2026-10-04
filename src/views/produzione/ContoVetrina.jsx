// ── Il conto della vetrina ────────────────────────────────────────────────
//
//   in vetrina all'inizio + prodotto − venduto − scarto = in vetrina alla fine
//
// La domanda che il titolare si fa davvero («torna il conto?»), e che la
// pagina di prima non aveva: c'erano prodotto e venduto, mai quello che
// c'era e quello che è rimasto. Il conto viene da `bilancioVetrina`
// (lib/produzioneQuadro, provato al grammo sui dati veri). Dove una
// rimanenza manca il venduto di quel giorno non si sa, e la riga dice di
// quanto non torna invece di farla quadrare per forza.
//
// È uno scontrino: una voce per riga, il segno davanti, i chili incolonnati
// a destra. Si legge uguale sul telefono e sul computer.
import React from 'react'
import { color as T, font, tnum } from '../../lib/theme'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import { kg, kgTessera, intero } from './numeri'

/** Il titolo-conclusione: la vetrina è salita, scesa o rimasta com'era. */
export function titoloVetrina(b) {
  const ini = b.inizioG / 1000
  const fine = b.fineG / 1000
  const delta = fine - ini
  // Mezzo chilo su tutta la vetrina è il peso di una vaschetta mezza piena.
  if (Math.abs(delta) < 0.5) return `La vetrina è rimasta com'era: ${kgTessera(fine)}`
  return delta < 0
    ? `La vetrina è scesa da ${kgTessera(ini)} a ${kgTessera(fine)}: hai venduto più di quanto hai fatto`
    : `La vetrina è salita da ${kgTessera(ini)} a ${kgTessera(fine)}: hai fatto più di quanto hai venduto`
}

/**
 * La riga sotto il conto. Una rimanenza che manca rende il venduto di quel
 * giorno «non lo so»: se era l'ultima, il conto torna lo stesso (si chiude
 * con la conta di prima), ma quel giorno resta fuori e va detto.
 */
export function notaVetrina(b) {
  const n = b.celleNonCalcolabili || 0
  const caselle = `in ${intero(n)} ${n === 1 ? 'casella' : 'caselle'} manca la rimanenza (di quel giorno o del giorno prima) e il venduto di quel giorno non si sa`
  if (!b.torna) return `Non tornano ${kg(Math.abs(b.differenzaG) / 1000)} kg: ${caselle}.`
  if (n > 0) return `Il conto torna, ma ${caselle}: quei giorni sono fuori dal conto.`
  return 'Il conto torna: quello che deve restare è quello che hai contato.'
}

export default function ContoVetrina({ vetrina: b, scartoRegistrato, isMobile, stile = null }) {
  const righe = [
    { segno: '', voce: 'In vetrina all\'inizio', g: b.inizioG },
    { segno: '+', voce: 'Prodotto', g: b.prodottoG },
    b.ricevutoG > 0 ? { segno: '+', voce: 'Arrivato da altre sedi', g: b.ricevutoG } : null,
    b.speditoG > 0 ? { segno: '−', voce: 'Mandato ad altre sedi', g: b.speditoG } : null,
    { segno: '−', voce: 'Venduto', g: b.vendutoG },
    { segno: '−', voce: 'Scarto', g: scartoRegistrato ? b.scartoG : null, testo: scartoRegistrato ? null : 'non registrato' },
  ].filter(Boolean)
  const atteso = b.inizioG + b.prodottoG + b.ricevutoG - b.speditoG - b.scartoG - b.vendutoG
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloVetrina(b)}
        sottotitolo="Quello che c'era, più quello che hai fatto, meno quello che è uscito: è quello che deve restare." />
      <div role="table" aria-label="Il conto della vetrina" style={{ fontSize: font.size.md, color: T.text }}>
        {righe.map(r => (
          <Riga key={r.voce} segno={r.segno} voce={r.voce} valore={r.testo || `${kg(r.g / 1000)} kg`} tenue={!!r.testo} />
        ))}
        <Riga segno="=" voce="Deve restare" valore={`${kg(atteso / 1000)} kg`} forte filo />
        <Riga segno="" voce="In vetrina alla fine, contato" valore={`${kg(b.fineG / 1000)} kg`} forte />
      </div>
      <div style={{ fontSize: font.size.sm, color: b.torna ? T.textSoft : T.amberDark, marginTop: 10, lineHeight: 1.5 }}>
        {notaVetrina(b)}
        {!scartoRegistrato && ' Lo scarto non è mai stato scritto: quello che si butta è dentro il venduto.'}
      </div>
    </Riquadro>
  )
}

function Riga({ segno, voce, valore, forte = false, tenue = false, filo = false }) {
  return (
    <div role="row" style={{
      display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', gap: 8, alignItems: 'baseline',
      padding: '6px 0', borderTop: filo ? `1px solid ${T.border}` : 'none', marginTop: filo ? 4 : 0,
    }}>
      <span role="cell" aria-hidden={!segno} style={{ color: T.textSoft, fontWeight: 700, textAlign: 'center' }}>{segno}</span>
      <span role="cell" style={{ color: forte ? T.text : T.textMid, fontWeight: forte ? 700 : 500, minWidth: 0 }}>{voce}</span>
      <span role="cell" style={{ ...tnum, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: forte ? 800 : 600, color: tenue ? T.textSoft : T.text }}>{valore}</span>
    </div>
  )
}
