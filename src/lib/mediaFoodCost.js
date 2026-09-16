// ── La media del food cost si fa solo su quello che si sa ──────────────
//
// 16/09/2026, aprendo il Ricettario dentro l'account vero di Mara dei Boschi:
//
//     FOOD COST MEDIO     4,8%
//     media non pesata sulle ricette
//
// Per una gelateria è un numero impossibile: il food cost normale sta fra il
// 25 e il 35 per cento. Usciva 4,8 perché 94 ingredienti su 99 non avevano un
// prezzo, quindi il costo calcolato di quasi ogni ricetta era una briciola. Il
// costo non era basso: mancava. Ed era scritto in verde, che vuol dire «va
// bene così».
//
// Il conto una metà del controllo ce l'aveva già — le ricette senza prezzo di
// vendita erano escluse, perché una percentuale su un ricavo che non esiste
// non si può fare. Mancava l'altra metà: escludere quelle di cui non si
// conosce il COSTO.
//
// Lo stesso giorno lo stesso difetto è uscito nella tabella della sensibilità
// del P&L («MANGO JERRY SPICY +51.654% FC tollerabile»). È una famiglia, non
// un caso: ovunque si divida per un costo, quel costo deve essere COMPLETO,
// non soltanto diverso da zero. Bastava un ingrediente prezzato su dodici
// perché la ricetta passasse il controllo `costo > 0`.
//
// Quello che resta fuori si conta, diviso per motivo: «manca il prezzo di
// vendita» si risolve nel Listino, «manca il prezzo di un ingrediente» si
// risolve nel Ricettario. Sono due lavori diversi, per due persone
// potenzialmente diverse, e dirlo insieme non aiuta nessuno.

/**
 * @param {Array<{ricavo:number, costo:number, mancanti?:Array}>} voci
 * @returns {{media:number|null, su:number, senzaPrezzoVendita:number, costoIncompleto:number}}
 *   `media` è la frazione (0,28 = 28%), oppure null se non c'è niente da dire.
 */
export function mediaFoodCost(voci) {
  const righe = Array.isArray(voci) ? voci : []
  let somma = 0, su = 0, senzaPrezzoVendita = 0, costoIncompleto = 0
  for (const v of righe) {
    const ricavo = Number(v?.ricavo) || 0
    if (ricavo <= 0) { senzaPrezzoVendita++; continue }
    if ((v?.mancanti || []).length > 0) { costoIncompleto++; continue }
    somma += (Number(v?.costo) || 0) / ricavo
    su++
  }
  return { media: su > 0 ? somma / su : null, su, senzaPrezzoVendita, costoIncompleto }
}
