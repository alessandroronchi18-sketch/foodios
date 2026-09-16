// ── Chi può rispondere alla domanda «di quanto possono salire i costi» ──
//
// La tabella della sensibilità nel P&L risponde a una domanda sola: quanto
// possono aumentare le materie prime prima che quel prodotto smetta di
// guadagnare. Il conto è `(ricavo / food cost - 1) × 100`.
//
// È una divisione, e una divisione per un numero quasi zero esplode. Il
// 16/09/2026, dentro l'account vero, la pagina diceva:
//
//     MANGO JERRY SPICY     +51.654% FC tollerabile
//
// Cinquantunmila per cento. Non era un prodotto miracoloso: a quella ricetta
// mancavano i prezzi di quasi tutti gli ingredienti, quindi il food cost
// calcolato era una briciola. Il costo non era basso: era **incompleto**.
//
// Per chi legge la differenza è tutta. «Puoi assorbire un rincaro del 50.000%»
// e «non so quanto costa questo prodotto» sono due frasi opposte, e la
// seconda è quella vera.
//
// Un prodotto entra in tabella solo se sa rispondere:
//   · ha un prezzo di vendita (senza, non c'è ricavo da confrontare);
//   · ha un food cost maggiore di zero;
//   · e quel food cost è COMPLETO — nessun ingrediente senza prezzo.
//
// L'ultima è quella che mancava. `fc > 0` non bastava: bastava un solo
// ingrediente con il prezzo perché il costo fosse «maggiore di zero» e la
// riga passasse con un numero inventato.
//
// Gli esclusi non si nascondono: si contano e si dice perché, divisi per
// motivo — «manca il prezzo di vendita» e «manca il prezzo di un ingrediente»
// sono due problemi diversi e si risolvono in due posti diversi.

/**
 * @param {Array<{ricavo:number, fc:number, fcParziale?:boolean}>} righe
 * @returns {{validi:Array, senzaPrezzo:number, costoIncompleto:number, nEsclusi:number}}
 */
export function righeSensibilita(righe) {
  const tutte = Array.isArray(righe) ? righe : []
  const haNumeri = (r) => Number(r?.ricavo) > 0 && Number(r?.fc) > 0
  const validi = tutte.filter(r => haNumeri(r) && !r?.fcParziale)
  const senzaPrezzo = tutte.filter(r => !haNumeri(r)).length
  const costoIncompleto = tutte.filter(r => haNumeri(r) && r?.fcParziale).length
  return { validi, senzaPrezzo, costoIncompleto, nEsclusi: tutte.length - validi.length }
}

/** Il margine di sicurezza, in punti percentuali. Solo per righe già filtrate. */
export function margineDiSicurezza(riga) {
  const ricavo = Number(riga?.ricavo) || 0
  const fc = Number(riga?.fc) || 0
  if (!(ricavo > 0) || !(fc > 0)) return null
  return parseFloat(((ricavo / fc - 1) * 100).toFixed(1))
}
