// Il margine di un periodo quando di alcuni giorni non si sa il costo delle materie.
//
// Un incasso arrivato dal registro o dalla foto dello scontrino dice quanto è
// entrato, non quanto è costata la merce. Il P&L contava quei giorni con food
// cost 0: tutto l'incasso diventava margine, e l'utile risultava più alto del
// vero (settembre di Marà: ricavi 117.671 €, food cost 0 → margine «100%»).
//
// Regola (titolare, 09/10/2026): dove il costo non si sa, il margine NON si
// inventa.
//   - nessun giorno col costo noto  → margine non noto (null), né zero né 100%
//   - alcuni giorni col costo noto  → stima: ai giorni senza costo si applica
//     la percentuale di food cost dei giorni misurati, e il numero è
//     dichiarato «stima»
//   - tutti i giorni col costo noto → il conto di sempre

const c2 = (n) => Math.round(n * 100) / 100

/**
 * `agg`: { ricavi, foodcost, ricaviConFc, giorni, giorniSenzaFc } (come aggRange del P&L).
 * Ritorna { margine: number|null, noto: boolean, stimato: boolean }.
 */
export function margineLordoDelPeriodo(agg) {
  const ricavi = Number(agg?.ricavi) || 0
  const foodcost = Number(agg?.foodcost) || 0
  const conFc = Number(agg?.ricaviConFc) || 0
  const senza = Number(agg?.giorniSenzaFc) || 0
  if (!(Number(agg?.giorni) > 0) || senza === 0) return { margine: c2(ricavi - foodcost), noto: true, stimato: false }
  if (!(conFc > 0)) return { margine: null, noto: false, stimato: false }
  const fcPct = foodcost / conFc
  return { margine: c2(ricavi - foodcost - (ricavi - conFc) * fcPct), noto: true, stimato: true }
}
