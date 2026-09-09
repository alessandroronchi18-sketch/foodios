// Helper condivisi sulle fatture fornitore.
//
// Nascono il 09/09/2026 da un censimento sulle query: SEI file leggevano la
// tabella `fatture` con nomi di colonna che non esistono (`importo_lordo`,
// `fornitore_nome`, `iva`, `importo`, `data_emissione`). PostgREST risponde
// 42703 e `data` arriva null: chi la usava vedeva zero fatture e dava un
// verdetto su zero. Il caso peggiore era il Cashflow, che mostrava un KPI verde
// "Cassa fra 60 giorni" mentre lo Scadenziario, sulla stessa base dati, contava
// 81.079 € già scaduti.
//
// Le due informazioni che ogni pagina ricalcolava a modo suo stanno qui, così
// il conto è uno solo.

// Termini di pagamento predefiniti quando il fornitore non ne ha di suoi.
// 30 giorni data fattura è lo standard del settore alimentare.
export const GIORNI_PAGAMENTO_DEFAULT = 30

/**
 * Quanto resta da pagare di una fattura.
 * `totale` è il lordo, `importo_pagato` gli acconti già versati.
 * Una nota di credito (tipo 'nota_credito') vale col segno negativo: riduce il
 * debito verso quel fornitore invece di aumentarlo.
 */
export function residuoFattura(f) {
  const totale = Number(f?.totale) || 0
  const pagato = Number(f?.importo_pagato) || 0
  const segno = f?.tipo === 'nota_credito' ? -1 : 1
  return segno * Math.max(0, totale - pagato)
}

// Come si contano i giorni di pagamento.
//
// 'netti'     30 giorni dalla data della fattura. Il conteggio semplice.
// 'fine_mese' 30 giorni dalla FINE DEL MESE della fattura: è lo standard dei
//             fornitori alimentari ("30 gg d.f. f.m."). Una fattura del 3
//             marzo a 30 giorni fine mese si paga il 30 aprile, non il 2
//             aprile: sono 28 giorni di differenza, e su 211 fatture scadute
//             cambia completamente quali sono davvero in ritardo.
export const TIPI_TERMINE = {
  netti: { label: 'giorni dalla data fattura', breve: 'gg d.f.' },
  fine_mese: { label: 'giorni dalla fine del mese', breve: 'gg f.m.' },
}

/**
 * Scadenza di una fattura, e se è un dato certo o una stima.
 *
 * Audit 2026-09-09: in produzione `data_scadenza` è vuota su 418 fatture su 418
 * (gli XML di questi fornitori non portano il blocco DatiPagamento). La data
 * mostrata è quindi sempre derivata da data_fattura + 30 giorni, ma veniva
 * presentata come certa ("scade il 31/01/2026 · 5 giorni fa"). Chi programma i
 * pagamenti su quelle date sta lavorando su una convenzione, non su un accordo:
 * va detto. 106 di quelle date cadono di sabato o domenica, che è un altro
 * segnale che non vengono dal fornitore.
 *
 * @returns {{ iso: string|null, stimata: boolean, giorniTermine: number }}
 */
export function scadenzaFattura(f, giorniTermine = GIORNI_PAGAMENTO_DEFAULT) {
  const tipo = f?._terminiTipo === 'fine_mese' ? 'fine_mese' : 'netti'
  if (f?.data_scadenza && /^\d{4}-\d{2}-\d{2}/.test(String(f.data_scadenza))) {
    return { iso: String(f.data_scadenza).slice(0, 10), stimata: false, giorniTermine, tipo }
  }
  if (!f?.data_fattura) return { iso: null, stimata: true, giorniTermine, tipo }
  const base = String(f.data_fattura).slice(0, 10)
  // Mezzogiorno per non farsi spostare dal fuso: la data conta, l'ora no.
  const d = new Date(`${base}T12:00:00`)
  if (isNaN(d.getTime())) return { iso: null, stimata: true, giorniTermine, tipo }
  const termini = Number.isFinite(Number(f?._termini)) ? Number(f._termini) : giorniTermine
  let riferimento = d
  if (tipo === 'fine_mese') {
    // Ultimo giorno del mese della fattura. Va costruito esplicitamente:
    // `setMonth(getMonth() + 1)` su una data del 31 slitta di un mese intero,
    // perché il 31 aprile non esiste e JavaScript lo porta al 1 maggio (una
    // fattura del 31 marzo finiva a fine maggio invece che a fine aprile).
    // `new Date(anno, mese + 1, 0)` è il giorno 0 del mese successivo, cioè
    // l'ultimo di questo: regge febbraio e gli anni bisestili da sé.
    riferimento = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0)
  }
  riferimento.setDate(riferimento.getDate() + termini)
  const iso = `${riferimento.getFullYear()}-${String(riferimento.getMonth() + 1).padStart(2, '0')}-${String(riferimento.getDate()).padStart(2, '0')}`
  return { iso, stimata: true, giorniTermine: termini, tipo }
}

/**
 * Somma i residui di una lista di fatture, dicendo quante scadenze sono stimate.
 * Serve alle pagine che mostrano un totale "in scadenza": se le date sono tutte
 * derivate, il totale per periodo è un'ipotesi e va dichiarato.
 */
export function riepilogoFatture(fatture, { entroIso = null } = {}) {
  const lista = Array.isArray(fatture) ? fatture : []
  let totale = 0, n = 0, stimate = 0
  for (const f of lista) {
    const { iso, stimata } = scadenzaFattura(f)
    if (entroIso && (!iso || iso > entroIso)) continue
    totale += residuoFattura(f)
    n++
    if (stimata) stimate++
  }
  return { totale: +totale.toFixed(2), n, stimate, tutteStimate: n > 0 && stimate === n }
}
