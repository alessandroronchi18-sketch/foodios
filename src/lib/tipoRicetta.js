// Etichette e helper per il campo `tipo` di una ricetta.
//
// I tipi supportati sono:
//   - 'fetta'         → pasticceria / torte-per-fetta
//   - 'pezzo'         → pasticceria / lievitati / pane / paste (unità intera)
//   - 'gusto'         → gelateria (produzione in kg, prezzo su formati vendita)
//   - 'interno'       → BASE: componente non venduto, il cui costo al kg lo
//                        scrive l'utente nel listino ingredienti. calcolaFC NON
//                        apre la sua ricetta (il ramo semilavorato controlla
//                        `tipo === 'semilavorato'`, foodcost.js:957): cerca il
//                        nome nel listino e usa quel prezzo.
//                        E' il modello delle basi da gelateria, e la ragione e'
//                        commerciale, non tecnica: le quantita' di una base sono
//                        il segreto del laboratorio e un gelataio non le carica
//                        su un servizio online. Elenca gli ingredienti (servono
//                        per gli allergeni), calcola il costo al kg a mano e
//                        inserisce solo quello.
//   - 'semilavorato'  → ingrediente composto di cui il sistema CALCOLA il costo
//                        dalle quantita' scritte nella sua ricetta.
//
// Centralizzare qui evita branching sparso `tipo === 'fetta' ? 'fette' : 'pezzi'`
// (audit 2026-07-23) che non copriva 'gusto' e mostrava "pezzi" al gelataio.

export function labelPlurale(tipo) {
  switch (tipo) {
    case 'fetta': return 'fette'
    case 'pezzo': return 'pezzi'
    case 'gusto': return 'kg'
    default:      return 'pezzi'
  }
}

export function labelSingolare(tipo) {
  switch (tipo) {
    case 'fetta': return 'fetta'
    case 'pezzo': return 'pezzo'
    case 'gusto': return 'kg'
    default:      return 'pezzo'
  }
}

// Vero se la ricetta è un gusto (gelateria). Serve per condizionare UI/logica
// che parlano di "stampi / fette / prezzo per unità" — concetti che per un
// gusto non hanno senso (il prezzo di vendita vive su Formati vendita).
export function isGustoTipo(tipo) {
  return tipo === 'gusto'
}

// Vero se il tipo NON è un output finito venduto (semilavorato / uso interno).
export function isSemiOInterno(tipo) {
  return tipo === 'semilavorato' || tipo === 'interno'
}

// Descrizione dell'unità di misura del campo `unita` (per tooltip / hint UI).
// Serve nei form dove `unita` significa cose diverse in base al tipo (fette per
// stampo vs kg per batch vs unità singola).
export function descrizioneUnita(tipo) {
  switch (tipo) {
    case 'fetta': return 'fette per stampo'
    case 'gusto': return 'kg per batch (gusto gelateria)'
    default:      return 'unità'
  }
}

// Tipo EFFETTIVO di una ricetta, tenendo conto del metodo di produzione
// dell'azienda.
//
// Perché serve: il parser dei file Excel non scrive `tipo` (il foglio del
// cliente non ce l'ha), quindi 24 delle 27 ricette del design partner — una
// GELATERIA — arrivavano senza tipo e a valle venivano trattate come torte a
// fette. Conseguenza: il food cost al kg, che e' IL numero che un gelataio
// guarda, non veniva calcolato; il ricavo usciva 8 fette x 0 EUR = 0 anche se
// i formati di vendita erano configurati (circa 35 EUR/kg); e la pagina
// scriveva "fette" sotto NOCCIOLA.
//
// La regola e' la stessa già scritta in elencoGusti (inventarioProduzione.js):
// il titolare sceglie il metodo UNA volta nelle impostazioni, e in modalita'
// inventario tutte le ricette che non sono basi o semilavorati sono gusti.
// Un tipo scelto a mano dall'utente vince sempre: qui si copre solo il caso
// del tipo ASSENTE.
export function tipoEffettivo(ric, metodoProduzione) {
  const t = ric?.tipo
  if (t) return t
  return metodoProduzione === 'inventario' ? 'gusto' : 'fetta'
}
