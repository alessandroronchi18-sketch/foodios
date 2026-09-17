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

// ── È una nota di credito? Si guarda l'importo, non l'etichetta ────────
//
// Stessa scoperta del 16/09/2026: `tipo = 'nota_credito'` in produzione non
// c'è su nessuna delle 3.520 righe. `parseFatturaXML` lo scrive quando il
// documento è TD04/TD08, ma queste fatture sono entrate da altre strade (CSV,
// gestionale, inserimento a mano) e portano solo il totale negativo.
//
// Chi decideva col solo `tipo` sbagliava in tre posti, tutti dove i soldi si
// muovono davvero:
//   · `pagamentiFornitore.ordinePagamento` non metteva i crediti per primi,
//     quindi un bonifico chiudeva fatture invece di consumare il credito;
//   · `pagamentiFornitore.testoEstrattoConto` elencava la nota di credito
//     sotto «Ci risultano da saldare», con l'importo in positivo: una lettera
//     che chiede al fornitore soldi che invece deve lui;
//   · `riconciliazioneBanca.proponiAbbinamenti` la teneva fra le fatture
//     abbinabili, e un'uscita di banca da 365,55 € poteva chiudere la nota di
//     credito da −365,55 € al posto della fattura vera.
//
// L'etichetta resta valida quando c'è: le due regole stanno insieme.
export function isNotaCredito(f) {
  if (f?.tipo === 'nota_credito') return true
  return (Number(f?.totale) || 0) < 0
}

// ── Quanto resta da pagare di una fattura: una regola sola ─────────────
//
// `totale` è il lordo, `importo_pagato` gli acconti già versati. Una nota di
// credito vale col segno meno: riduce il debito verso quel fornitore invece
// di aumentarlo.
//
// Il 16/09/2026, censendo i punti dove si calcola un euro, la stessa domanda
// aveva TRE risposte diverse in tre file, e due erano sbagliate.
//
// **Il segno di una nota di credito.** Nel database vero non esiste nemmeno
// una riga con `tipo = 'nota_credito'`: tutte e 3.520 sono «fattura», e le
// note di credito sono fatture con il totale NEGATIVO — quattro, fino a
// −365,55 €. Prendere il segno dall'ETICHETTA invece che dall'IMPORTO dava:
//   · qui, `Math.max(0, −365,55 − 0)` = **0**, e il credito spariva;
//   · in `pagamentiFornitore.js`, che faceva `Math.abs()` sui due numeri e poi
//     moltiplicava per il segno dedotto dall'etichetta, **+365,55** — cioè un
//     DEBITO dove c'è un credito. Su quelle quattro righe sono 771,10 € di
//     scarto fra le due pagine, e la pagina da cui partono i bonifici era
//     quella sbagliata.
// Oggi le quattro sono già segnate pagate, quindi il difetto è armato ma non
// ancora sparato: succede alla prima nota di credito ancora aperta, e arriva
// sempre, appena un fornitore sbaglia una consegna.
//
// **La fattura segnata pagata a mano.** Capita di segnare pagata una fattura
// senza scrivere l'importo: restano `stato = 'pagata'` e `importo_pagato = 0`.
// Lo Scadenzario lo gestiva («pagata è pagata, qualunque cosa dicano i
// numeri»), questa funzione no. In produzione sono **6 fatture per 1.597,17 €**
// che il Cashflow contava ancora da pagare mentre lo Scadenzario le dava
// chiuse: due pagine, stessi dati, due risposte.
//
// Le altre due funzioni ora chiamano questa: `scadenzeFatture.arricchisci` e
// `pagamentiFornitore.residuoDa`.
//
// Un pagato più grande del totale non produce un residuo negativo: un
// versamento in eccesso è un anticipo o un errore di digitazione, e in
// nessuno dei due casi è «debito da pagare meno di zero».
export function residuoFattura(f) {
  // Pagata è pagata, qualunque cosa dicano i numeri.
  if (f?.stato === 'pagata') return 0
  const totaleGrezzo = Number(f?.totale) || 0
  // Se è dichiarata nota di credito vale meno di zero comunque sia scritta;
  // se non è dichiarata ma l'importo è negativo, è una nota di credito lo
  // stesso — perché è quello che è.
  const importoNetto = isNotaCredito(f) ? -Math.abs(totaleGrezzo) : totaleGrezzo
  const segno = importoNetto < 0 ? -1 : 1
  const pagato = Math.abs(Number(f?.importo_pagato) || 0)
  const residuo = segno * Math.max(0, Math.abs(importoNetto) - pagato)
  // `-1 * 0` in JavaScript fa `-0`, e `(-0).toLocaleString('it-IT')` scrive
  // «-0,00». Una nota di credito usata fino all'ultimo centesimo comparirebbe
  // a schermo come «-0,00 €»: aritmeticamente è zero, ma chi legge vede un
  // segno meno e si chiede cosa vuol dire.
  return residuo === 0 ? 0 : residuo
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
