// ── Una spesa di due negozi insieme ────────────────────────────────────
//
// Mara dei Boschi ha due account su Webdesk: uno contiene le fatture della
// Carlina, l'altro quelle di Berthollet e De Gasperi **insieme**. Il secondo
// non si può dividere leggendo i documenti: verificato il 17/09/2026 sui 142
// documenti veri — zero note, zero allegati, zero date di riferimento,
// nessun codice nel numero. Due negozi dentro un account solo, e chi emette
// la fattura non lo sa.
//
// Attribuirle a una delle due sarebbe inventare. Lasciarle «senza sede» le fa
// sparire da ogni pagina che ragiona per negozio — ed erano 189.458 € che non
// comparivano da nessuna parte.
//
// La terza strada, scelta dal titolare: **è un costo condiviso, e si divide
// su quanto ogni negozio ha prodotto**. La merce è stata consumata in
// proporzione al lavoro fatto, ed è una chiave che si spiega a un
// commercialista in una frase.
//
// Misurato sul periodo di quelle fatture (12/05 → 10/09/2026):
//     De Gasperi   7.304,5 kg   52,5%
//     Berthollet   6.618,6 kg   47,5%
//
// ── Le tre regole che tengono onesto il conto ──────────────────────────
//
// 1. **Si divide sul mese della fattura**, non sul periodo intero: una spesa
//    di giugno si divide con la produzione di giugno. Se in quel mese non c'è
//    produzione registrata, si allarga al periodo che si ha; se non c'è
//    niente nemmeno lì, si divide in parti uguali e **lo si dichiara**.
// 2. **La ripartizione non tocca mai il documento.** La fattura resta una,
//    col suo totale e il suo numero: la divisione vive solo nel momento in cui
//    si sommano i costi per negozio. Un documento diviso a metà nel database
//    sarebbe un documento falso.
// 3. **Si dice sempre che è una stima.** Una cifra ripartita non è una cifra
//    fatturata, e chi legge deve poterle distinguere.

/**
 * Le quote di ripartizione fra le sedi che condividono una spesa.
 *
 * @param {string[]} sediCondivise  gli id delle sedi che si dividono il costo
 * @param {Object<string, number>} produzionePerSede  grammi (o kg) prodotti,
 *        per id di sede, nel periodo di riferimento
 * @returns {{quote: Object<string, number>, criterio: string, certa: boolean}}
 *          `quote` somma sempre a 1. `certa` è falso quando la produzione non
 *          c'è e si è diviso in parti uguali.
 */
export function quoteDiRipartizione(sediCondivise, produzionePerSede) {
  const sedi = (sediCondivise || []).filter(Boolean)
  if (sedi.length === 0) return { quote: {}, criterio: 'nessuna sede', certa: false }
  if (sedi.length === 1) return { quote: { [sedi[0]]: 1 }, criterio: 'una sola sede', certa: true }

  const prod = produzionePerSede || {}
  const totale = sedi.reduce((s, id) => s + (Number(prod[id]) || 0), 0)

  if (!(totale > 0)) {
    // Nessuna produzione registrata: parti uguali, e si dichiara.
    const q = 1 / sedi.length
    return {
      quote: Object.fromEntries(sedi.map(id => [id, q])),
      criterio: 'parti uguali (nessuna produzione registrata nel periodo)',
      certa: false,
    }
  }

  return {
    quote: Object.fromEntries(sedi.map(id => [id, (Number(prod[id]) || 0) / totale])),
    criterio: 'in proporzione ai chili prodotti',
    certa: true,
  }
}

/**
 * Quanto tocca a una sede di un importo condiviso.
 * Restituisce `null` quando la sede non è fra quelle che condividono: è
 * diverso da zero, e va mostrato diverso.
 */
export function quotaDellaSede(importo, sedeId, sediCondivise, produzionePerSede) {
  const { quote, criterio, certa } = quoteDiRipartizione(sediCondivise, produzionePerSede)
  if (!(sedeId in quote)) return null
  return { importo: (Number(importo) || 0) * quote[sedeId], criterio, certa }
}

/**
 * Somma per sede un elenco di documenti, tenendo separato quello che è
 * fatturato a quella sede da quello che le è stato RIPARTITO.
 *
 * Tenerli separati è il punto: «hai speso 12.000 €» e «hai speso 8.000 € più
 * 4.000 € di spese comuni divise a stima» non sono la stessa frase, e chi
 * decide su quei numeri deve vedere quale delle due sta leggendo.
 */
export function totaliPerSede(documenti, produzionePerSede) {
  const out = {}
  const tocca = (id) => (out[id] = out[id] || { diretto: 0, ripartito: 0, nDiretti: 0, nRipartiti: 0, stimato: false })

  for (const d of (documenti || [])) {
    const importo = Number(d?.totale) || 0
    const condivise = Array.isArray(d?.sedi_condivise) ? d.sedi_condivise.filter(Boolean) : []

    if (condivise.length > 1) {
      const { quote, certa } = quoteDiRipartizione(condivise, produzionePerSede)
      for (const id of condivise) {
        const r = tocca(id)
        r.ripartito += importo * (quote[id] || 0)
        r.nRipartiti += 1
        if (!certa) r.stimato = true
      }
      continue
    }
    const id = condivise[0] || d?.sede_id
    if (!id) continue
    const r = tocca(id)
    r.diretto += importo
    r.nDiretti += 1
  }
  return out
}
