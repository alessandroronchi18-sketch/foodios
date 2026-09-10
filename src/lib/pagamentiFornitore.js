// Contabilità fornitori: come si spegne un debito con un pagamento solo.
//
// IL PROBLEMA CHE RISOLVE. Nei dati veri di Mara, CONO ARTIC ha 99 fatture
// aperte per 77.482 €. Quando parte un bonifico cumulativo, lo scadenzario
// chiedeva di segnare pagate 99 righe una per una: nessuno lo fa, quindi
// l'archivio resta indietro e smette di dire la verità.
//
// Il modo in cui funziona davvero la contabilità fornitori è l'opposto: si
// dice "ho pagato 20.000 € a CONO ARTIC il 12 settembre" e l'importo si
// imputa alle fatture più vecchie fino a esaurirsi. L'ultima toccata resta
// con un acconto; le altre si chiudono.
//
// Tre regole, e sono quelle della prassi, non nostre:
//   1. si paga il più vecchio per primo (le note di credito prima di tutto:
//      sono un credito, e un credito si usa);
//   2. l'ultima fattura toccata può restare parziale, e allora è un acconto;
//   3. se l'importo supera il dovuto, l'eccedenza NON si spalma: resta fuori
//      e va dichiarata, perché o è un errore di digitazione o è un anticipo,
//      e sono due cose diverse.

/** Residuo da pagare di una fattura (0 se pagata). Le NC sono negative. */
export function residuoDa(f) {
  if (!f || f.stato === 'pagata') return 0
  const segno = f.tipo === 'nota_credito' ? -1 : 1
  const totale = Math.abs(Number(f.totale) || 0)
  const pagato = Math.abs(Number(f.importo_pagato) || 0)
  return segno * Math.max(0, totale - pagato)
}

/**
 * Ordine di pagamento: prima le note di credito (sono crediti da usare), poi
 * le fatture dalla più vecchia. La data che conta è la scadenza quando c'è,
 * altrimenti quella del documento.
 */
export function ordinePagamento(fatture) {
  const dataOrd = (f) => String(f?.dueIso || f?.data_scadenza || f?.data_fattura || '9999-12-31').slice(0, 10)
  return [...(fatture || [])]
    .filter(f => residuoDa(f) !== 0)
    .sort((a, b) => {
      const ncA = a.tipo === 'nota_credito' ? 0 : 1
      const ncB = b.tipo === 'nota_credito' ? 0 : 1
      if (ncA !== ncB) return ncA - ncB
      const d = dataOrd(a).localeCompare(dataOrd(b))
      if (d !== 0) return d
      // A pari data, prima la più grossa: chiude più debito con lo stesso giro.
      return Math.abs(residuoDa(b)) - Math.abs(residuoDa(a))
    })
}

/**
 * Imputa un importo pagato alle fatture aperte di un fornitore.
 *
 * PURA: non scrive niente. Ritorna il piano, che il chiamante mostra prima di
 * applicarlo — un'imputazione sbagliata su 99 fatture non si disfa a mano.
 *
 * @param {Array}  fatture  fatture aperte del fornitore (anche NC)
 * @param {number} importo  quanto è stato pagato, in euro
 * @returns {{
 *   righe: Array<{ id, fornitore, numero_rif, dueIso, residuoPrima, imputato, residuoDopo, saldata, isNC }>,
 *   chiuse: number, parziali: number,
 *   usato: number, eccedenza: number, dovutoTotale: number,
 *   creditiUsati: number,
 * }}
 */
export function imputaPagamento(fatture, importo) {
  const ordinate = ordinePagamento(fatture)
  const dovutoTotale = ordinate.reduce((s, f) => s + residuoDa(f), 0)
  let disponibile = Math.max(0, Math.round((Number(importo) || 0) * 100) / 100)
  const righe = []
  let creditiUsati = 0

  for (const f of ordinate) {
    const residuoPrima = residuoDa(f)
    if (residuoPrima < 0) {
      // Nota di credito: non la si "paga", si usa. Aumenta il disponibile e
      // si chiude, perché il credito è stato speso.
      const credito = Math.abs(residuoPrima)
      disponibile += credito
      creditiUsati += credito
      righe.push({
        id: f.id, fornitore: f.fornitore, numero_rif: f.numero_rif,
        dueIso: f.dueIso || f.data_scadenza || f.data_fattura || null,
        residuoPrima, imputato: -credito, residuoDopo: 0,
        saldata: true, isNC: true,
      })
      continue
    }
    if (disponibile <= 0.004) break
    const imputato = Math.min(disponibile, residuoPrima)
    const residuoDopo = Math.round((residuoPrima - imputato) * 100) / 100
    disponibile = Math.round((disponibile - imputato) * 100) / 100
    righe.push({
      id: f.id, fornitore: f.fornitore, numero_rif: f.numero_rif,
      dueIso: f.dueIso || f.data_scadenza || f.data_fattura || null,
      residuoPrima,
      imputato: Math.round(imputato * 100) / 100,
      residuoDopo,
      saldata: residuoDopo <= 0.004,
      isNC: false,
    })
  }

  const toccate = righe.filter(r => !r.isNC)
  return {
    righe,
    chiuse: toccate.filter(r => r.saldata).length,
    parziali: toccate.filter(r => !r.saldata && r.imputato > 0).length,
    usato: Math.round(toccate.reduce((s, r) => s + r.imputato, 0) * 100) / 100,
    // Quello che resta in mano dopo aver chiuso tutto il dovuto.
    eccedenza: Math.round(disponibile * 100) / 100,
    dovutoTotale: Math.round(dovutoTotale * 100) / 100,
    creditiUsati: Math.round(creditiUsati * 100) / 100,
  }
}

/**
 * Termini di pagamento REALI di un fornitore, imparati da come è stato pagato.
 *
 * PERCHE': nei dati veri nessuna delle 3.520 fatture porta la data di
 * scadenza, quindi la pagina le calcola tutte a 30 giorni dal documento. Ma
 * ogni fornitore ha le sue condizioni, e chi paga sa quali sono: si vedono
 * dalle date di pagamento già registrate.
 *
 * Ritorna null quando non c'è abbastanza storia: due pagamenti non fanno una
 * regola, e un numero inventato qui sposterebbe tutte le scadenze future.
 */
export function terminiOsservati(fatture, { minimo = 3 } = {}) {
  const giorni = []
  for (const f of (fatture || [])) {
    if (f?.stato !== 'pagata') continue
    const dF = String(f.data_fattura || '').slice(0, 10)
    const dP = String(f.data_pagamento || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dF) || !/^\d{4}-\d{2}-\d{2}$/.test(dP)) continue
    const [y1, m1, g1] = dF.split('-').map(Number)
    const [y2, m2, g2] = dP.split('-').map(Number)
    const gg = Math.round((Date.UTC(y2, m2 - 1, g2) - Date.UTC(y1, m1 - 1, g1)) / 86400000)
    // Fuori da questa forbice non è un termine di pagamento: è un dato
    // sbagliato (pagamento prima della fattura, o vecchio di due anni).
    if (gg < 0 || gg > 240) continue
    giorni.push(gg)
  }
  if (giorni.length < minimo) return null
  giorni.sort((a, b) => a - b)
  // La MEDIANA, non la media: un pagamento in ritardo di sei mesi non deve
  // spostare il termine di tutti gli altri.
  const mid = Math.floor(giorni.length / 2)
  const mediana = giorni.length % 2 ? giorni[mid] : Math.round((giorni[mid - 1] + giorni[mid]) / 2)
  return {
    giorni: mediana,
    campione: giorni.length,
    min: giorni[0],
    max: giorni[giorni.length - 1],
    // I termini commerciali sono numeri tondi: si propone il più vicino fra
    // quelli usati davvero, così sulla scheda del fornitore si scrive "60"
    // e non "57".
    proposto: [0, 15, 30, 45, 60, 90, 120].reduce(
      (best, v) => Math.abs(v - mediana) < Math.abs(best - mediana) ? v : best, 30),
  }
}

/**
 * Fatture ricorrenti: stesso fornitore, una al mese, importi simili.
 * Sono le bollette e i canoni — luce, gas, telefono, commercialista — e non
 * hanno bisogno dello stesso controllo di una fornitura di merce: serve solo
 * sapere se questo mese è arrivata e se costa come sempre.
 */
export function ricorrenti(fatture, { minMesi = 3 } = {}) {
  const perFornitore = {}
  for (const f of (fatture || [])) {
    const nome = String(f?.fornitore || '').trim()
    if (!nome) continue
    const mese = String(f.data_fattura || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(mese)) continue
    if (!perFornitore[nome]) perFornitore[nome] = { nome, mesi: new Map(), importi: [] }
    const g = perFornitore[nome]
    g.mesi.set(mese, (g.mesi.get(mese) || 0) + 1)
    g.importi.push(Math.abs(Number(f.totale) || 0))
  }
  const out = []
  for (const g of Object.values(perFornitore)) {
    const mesi = [...g.mesi.keys()].sort()
    if (mesi.length < minMesi) continue
    // Una al mese (o quasi): se in un mese ce ne sono tre, è una fornitura,
    // non un canone.
    const perMese = [...g.mesi.values()]
    const mediaPerMese = perMese.reduce((s, v) => s + v, 0) / perMese.length
    if (mediaPerMese > 1.6) continue
    // Mesi consecutivi: un canone non salta sei mesi.
    const buchi = contaBuchi(mesi)
    if (buchi > Math.max(1, Math.floor(mesi.length / 4))) continue
    const media = g.importi.reduce((s, v) => s + v, 0) / g.importi.length
    const scarto = media > 0
      ? Math.sqrt(g.importi.reduce((s, v) => s + (v - media) ** 2, 0) / g.importi.length) / media
      : 0
    out.push({
      nome: g.nome, mesi: mesi.length, primoMese: mesi[0], ultimoMese: mesi[mesi.length - 1],
      mediaImporto: Math.round(media * 100) / 100,
      // Quanto ballano gli importi: sotto il 25% è un canone, sopra è una
      // fornitura che capita di ordinare ogni mese.
      variabilita: Math.round(scarto * 100) / 100,
      ricorrenza: scarto <= 0.25 ? 'canone' : 'mensile-variabile',
    })
  }
  return out.sort((a, b) => b.mediaImporto - a.mediaImporto)
}

function contaBuchi(mesiOrdinati) {
  let buchi = 0
  for (let i = 1; i < mesiOrdinati.length; i++) {
    const [y1, m1] = mesiOrdinati[i - 1].split('-').map(Number)
    const [y2, m2] = mesiOrdinati[i].split('-').map(Number)
    buchi += (y2 * 12 + m2) - (y1 * 12 + m1) - 1
  }
  return buchi
}

/**
 * Fatture fuori scala rispetto alla storia di quel fornitore.
 *
 * PERCHE': nei dati veri GECKO CIOCCOLATI ha UNA fattura da 86.651 €, l'11,5%
 * di tutto il debito aperto. Può essere giusta, ma è anche la forma esatta di
 * un errore di importo — un punto nel posto sbagliato. Meglio guardarla
 * adesso che scoprirlo quando si paga.
 *
 * Serve almeno un po' di storia per avere una mediana: con due fatture non si
 * dice che la terza è anomala.
 */
export function fattureAnomale(fatture, { fattore = 5, minStoria = 4, sogliaMinima = 500 } = {}) {
  const perFornitore = {}
  for (const f of (fatture || [])) {
    const nome = String(f?.fornitore || '').trim()
    if (!nome) continue
    if (!perFornitore[nome]) perFornitore[nome] = []
    perFornitore[nome].push(f)
  }
  const out = []
  for (const [nome, lista] of Object.entries(perFornitore)) {
    const importi = lista.map(f => Math.abs(Number(f.totale) || 0)).filter(v => v > 0).sort((a, b) => a - b)
    if (importi.length < minStoria) continue
    const mid = Math.floor(importi.length / 2)
    const mediana = importi.length % 2 ? importi[mid] : (importi[mid - 1] + importi[mid]) / 2
    if (mediana <= 0) continue
    for (const f of lista) {
      const v = Math.abs(Number(f.totale) || 0)
      if (v < sogliaMinima) continue          // sotto questa cifra non vale l'allarme
      const rapporto = v / mediana
      if (rapporto >= fattore) {
        out.push({
          id: f.id, fornitore: nome, numero_rif: f.numero_rif,
          data_fattura: f.data_fattura, totale: v,
          mediana: Math.round(mediana * 100) / 100,
          quanteVolte: Math.round(rapporto * 10) / 10,
          stato: f.stato,
        })
      }
    }
  }
  return out.sort((a, b) => b.totale - a.totale)
}

/**
 * Testo dell'estratto conto da mandare al fornitore.
 *
 * PERCHE': con 99 fatture aperte con lo stesso fornitore, prima o poi si deve
 * fare il punto. Un elenco scritto da mandare su WhatsApp o per mail evita la
 * telefonata in cui si leggono i numeri a voce.
 */
export function testoEstrattoConto(fornitore, fatture, { nomeAzienda = '', oggiIso = null } = {}) {
  const aperte = ordinePagamento(fatture).filter(f => !f.tipo || f.tipo !== 'nota_credito')
  const nc = ordinePagamento(fatture).filter(f => f.tipo === 'nota_credito')
  const eur = (v) => `${Number(v || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  const data = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '-'
  const totale = aperte.reduce((s, f) => s + residuoDa(f), 0) + nc.reduce((s, f) => s + residuoDa(f), 0)
  const righe = [
    `Buongiorno,`,
    ``,
    `vi scrivo per allineare le partite aperte${nomeAzienda ? ` con ${nomeAzienda}` : ''}${oggiIso ? ` alla data del ${data(oggiIso)}` : ''}.`,
    ``,
    `Ci risultano da saldare:`,
  ]
  for (const f of aperte) {
    const acconto = Math.abs(Number(f.importo_pagato) || 0)
    righe.push(`- fattura ${f.numero_rif || 's.n.'} del ${data(f.data_fattura)}: ${eur(Math.abs(residuoDa(f)))}`
      + (acconto > 0 ? ` (già versato un acconto di ${eur(acconto)})` : ''))
  }
  if (nc.length > 0) {
    righe.push(``, `A nostro credito:`)
    for (const f of nc) {
      righe.push(`- nota di credito ${f.numero_rif || 's.n.'} del ${data(f.data_fattura)}: ${eur(Math.abs(residuoDa(f)))}`)
    }
  }
  righe.push(
    ``,
    `Totale a saldo: ${eur(totale)}.`,
    ``,
    `Se qualcosa non vi torna fatecelo sapere, così controlliamo insieme.`,
    `Grazie,`,
    nomeAzienda || '',
  )
  return righe.filter(r => r !== undefined).join('\n')
}
