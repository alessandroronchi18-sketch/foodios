// ── Un cono piccolo non pesa come una vaschetta da un chilo ────────────
//
// 16/09/2026, misurando il P&L sui formati veri di Mara dei Boschi:
//
//     CONO PICCOLO      100 g   3,50 €  →  35,00 €/kg
//     CONO MEDIO        140 g   4,50 €  →  32,14 €/kg
//     CONO GRANDE       180 g   5,50 €  →  30,56 €/kg
//     VASCHETTA 1 KG   1000 g  28,00 €  →  28,00 €/kg
//     VASCHETTA ½ KG    500 g  14,00 €  →  28,00 €/kg
//
// Il prezzo medio al chilo veniva calcolato come media aritmetica di quei
// cinque numeri: **30,74 €/kg**. Ma quei cinque numeri non sono confrontabili
// fra loro — il primo descrive cento grammi, il quarto un chilo. Facendone la
// media semplice, i coni, che sono i formati più cari al chilo e i più
// piccoli, contano dieci volte il loro peso.
//
// Il prezzo medio vero di un chilo di gelato, se ne vendi uno di ogni
// formato, è la somma degli incassi diviso la somma dei chili: **28,91 €/kg**.
// La differenza è **+6,34% su ogni ricavo di gusto**. Sui chili prodotti da
// Mara in un mese (circa 6.900) fa **12.700 € al mese di ricavo inventato**,
// che si propagano nel margine, nel food cost in percentuale e nel confronto
// fra le due sedi.
//
// Questo conto stava scritto due volte, in due file diversi e tutte e due
// sbagliato allo stesso modo: `avgPrezzoPerKgCategoria` (formatiVendita.js,
// usata dal P&L e dal Menù) e `euroKgMedioFormati` (inventarioProduzione.js,
// usata dalla Quadratura e dalla stima dei ricavi da inventario). Ora la
// regola sta qui, in un posto solo, e tutte e due la chiamano.
//
// **Quello che questa media ancora non sa**, e chi la mostra deve dirlo: pesa
// i formati come se se ne vendesse uno di ciascuno. Il mix di vendita vero —
// quante vaschette contro quanti coni — non è in questi dati. Resta una
// stima, ma una stima che non gonfia sistematicamente il ricavo.

/**
 * Prezzo medio di vendita al chilo, pesato sui grammi.
 *
 * @param {Array<{baseQtaG:number, prezzoDefault:number}>} formati
 * @returns {number|null} €/kg, oppure null se non c'è nessun formato con
 *   sia un peso sia un prezzo — «non lo so» invece di un numero inventato.
 */
export function prezzoMedioAlKg(formati) {
  if (!Array.isArray(formati)) return null
  let grammi = 0, euro = 0
  for (const f of formati) {
    const g = Number(f?.baseQtaG) || 0
    const p = Number(f?.prezzoDefault) || 0
    // Un formato senza peso (una ricarica tessera, un servizio) o senza
    // prezzo non dice niente sul prezzo al chilo: resta fuori del tutto, non
    // entra come zero.
    if (g <= 0 || p <= 0) continue
    grammi += g
    euro += p
  }
  if (grammi <= 0) return null
  return (euro / grammi) * 1000
}
