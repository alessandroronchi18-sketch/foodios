// Quello che un import di incassi NON sa, non deve scriverlo come zero.
//
// ── I difetti, e come sono saltati fuori (audit magazzino, 16/09/2026) ────
//
// 1. IL SELL-THROUGH FINTO. Quattro punti del codice creavano una giornata a
//    partire da un file di incassi (cassa, delivery, e-commerce, registro
//    Excel) e ci scrivevano dentro `avgST: 0`.
//
//    Il sell-through è la quota di pezzi prodotti che si sono venduti. Un file
//    di incassi dice quanti euro sono entrati e non dice niente su quanti
//    pezzi si sono prodotti: quel dato non si sa. Zero però non vuol dire
//    «non lo so», vuol dire «non se n'è venduto nemmeno uno».
//
//    Lo Storico produzione filtra `avgST != null` proprio per tenere fuori le
//    giornate senza confronto (`StoricoProduzioneView.jsx:324, 444, 532`): lo
//    zero passava quel filtro e finiva nella media. Su Mara dei Boschi, che
//    ha ZERO chiusure registrate a mano e caricherebbe tutto da file, la
//    media del sell-through sarebbe stata 0% su tutto il periodo.
//
// 2. L'INCASSO CHE NON CRESCE. `importDelivery.js` aggiornava una giornata
//    già esistente con `totV: Math.round((Number(kpiPrec.totV) || 0) * 100)
//    / 100` — cioè riassegnava `totV` a se stesso. Sul PRIMO file non si
//    vedeva (la giornata nasceva dall'altro ramo, con `totV: riga.netto`), ma
//    chi lavora con Deliveroo E Glovo importa due file per lo stesso giorno:
//    il secondo aggiornava `kpi.delivery` e lasciava `totV` fermo al primo.
//    Nel conto economico mancava un canale di vendita intero, e il riquadro
//    dell'import diceva «importato» lo stesso.
//
// 3. IL DOPPIONE CHE NON SI TOGLIE. `mergeInChiusureCassa` teneva l'elenco
//    degli import di una giornata togliendo prima quelli della stessa fonte:
//    `filter(c => c.fonte !== fonte)`. Ma `c.fonte` lo scrive il parser
//    («Cassa in Cloud») e `fonte` arriva da chi chiama, che passava
//    l'identificativo del menu («cassaincloud»). Non coincidevano mai, quindi
//    il filtro non toglieva niente: reimportare lo stesso file lasciava due
//    righe uguali, tre al terzo giro.
//
// Nessuno dei tre è riproducibile sui dati di Mara: nel suo database non c'è
// nessuna chiusura di cassa registrata, quindi questi casi sono COSTRUITI e
// non misurati. Il difetto invece è letto sul codice, riga per riga.

import { describe, it, expect } from 'vitest'
import { mergeInChiusureCassa } from '../../src/lib/importCassa'
import { mergeInChiusure } from '../../src/lib/importDelivery'
import { mergeOrdiniInChiusure } from '../../src/lib/importEcommerce'

// ── 1. Il sell-through che non si sa ─────────────────────────────────────

describe('una giornata creata da un file di incassi non inventa il sell-through', () => {
  it('import di cassa: avgST resta «non lo so»', () => {
    const [g] = mergeInChiusureCassa([], [{ data: '2026-09-01', importo: 820, fonte: 'Cassa in Cloud' }], 'cassaincloud')
    expect(g.kpi.avgST).toBe(null)
    expect(g.kpi.totV).toBe(820)
  })

  it('import delivery: avgST resta «non lo so»', () => {
    const out = mergeInChiusure([], [{ data: '2026-09-01', netto: 140, fonte: 'Deliveroo' }], 'Deliveroo')
    expect(out[0].kpi.avgST).toBe(null)
  })

  it('import e-commerce: avgST resta «non lo so»', () => {
    const out = mergeOrdiniInChiusure([], [{ data: '2026-09-01', importo: 60, ordini: 2 }], 'Shopify')
    expect(out[0].kpi.avgST).toBe(null)
  })

  it('le tre fonti dicono anche che il food cost non lo sanno', () => {
    // Stessa famiglia: una giornata di soli incassi non sa cosa è stato
    // venduto né quanto sono costate le materie prime. Se `foodcost_noto`
    // fosse true, il periodo risulterebbe con food cost 0 € — cioè «gratis».
    const casi = [
      mergeInChiusureCassa([], [{ data: '2026-09-01', importo: 100, fonte: 'X' }], 'x')[0],
      mergeInChiusure([], [{ data: '2026-09-01', netto: 100, fonte: 'Glovo' }], 'Glovo')[0],
      mergeOrdiniInChiusure([], [{ data: '2026-09-01', importo: 100, ordini: 1 }], 'Shopify')[0],
    ]
    for (const g of casi) {
      expect(g.solo_totale).toBe(true)
      expect(g.foodcost_noto).toBe(false)
    }
  })

  it('zero NON è la risposta giusta: il filtro a valle lo lascerebbe passare', () => {
    // È il righello di questo test: `avgST != null` è il controllo che usa lo
    // Storico. Se un giorno qualcuno rimettesse lo 0, questo test dice perché
    // fa danno.
    const g = mergeInChiusureCassa([], [{ data: '2026-09-01', importo: 500, fonte: 'X' }], 'x')[0]
    const passaIlFiltroDelloStorico = g.kpi.avgST != null
    expect(passaIlFiltroDelloStorico).toBe(false)
  })
})

// ── 2. Due file delivery per lo stesso giorno ────────────────────────────

describe('due piattaforme delivery nello stesso giorno', () => {
  const primo = [{ data: '2026-09-01', netto: 100, fonte: 'Deliveroo' }]
  const secondo = [{ data: '2026-09-01', netto: 60, fonte: 'Glovo' }]

  it('l\'incasso del giorno cresce col secondo file', () => {
    const dopoUno = mergeInChiusure([], primo, 'Deliveroo')
    expect(dopoUno[0].kpi.totV).toBe(100)
    const dopoDue = mergeInChiusure(dopoUno, secondo, 'Glovo')
    // Prima della correzione qui restava 100: i 60 € di Glovo entravano in
    // `kpi.delivery` e sparivano dall'incasso.
    expect(dopoDue[0].kpi.totV).toBe(160)
    expect(dopoDue[0].kpi.delivery).toBe(160)
  })

  it('margine e marginalità seguono l\'incasso nuovo', () => {
    // Restavano calcolati sul totale vecchio: una marginalità giusta su un
    // ricavo sbagliato è più insidiosa di un numero palesemente rotto.
    const out = mergeInChiusure(mergeInChiusure([], primo, 'Deliveroo'), secondo, 'Glovo')
    expect(out[0].kpi.totM).toBe(160)
    expect(out[0].kpi.totMP).toBe(100)
  })

  it('reimportare lo stesso file non raddoppia l\'incasso', () => {
    const uno = mergeInChiusure([], primo, 'Deliveroo')
    const due = mergeInChiusure(uno, secondo, 'Glovo')
    const ancora = mergeInChiusure(due, primo, 'Deliveroo')
    expect(ancora[0].kpi.totV).toBe(160)
    expect(ancora[0].delivery).toHaveLength(2)
  })

  it('il totale della cassa non si somma a se stesso, il delivery sì', () => {
    // Due import di cassa nello stesso giorno sono due letture dello stesso
    // incasso (il registratore fiscale e il lettore di carte), non due
    // incassi: `mergeInChiusureCassa` infatti sovrascrive. Il delivery invece
    // è un canale a parte e si somma.
    const conCassa = mergeInChiusureCassa([], [{ data: '2026-09-01', importo: 500, fonte: 'Cassa in Cloud' }], 'cassaincloud')
    const conDelivery = mergeInChiusure(conCassa, primo, 'Deliveroo')
    expect(conDelivery[0].kpi.totV).toBe(600)
    const riletturaCassa = mergeInChiusureCassa(conDelivery, [{ data: '2026-09-01', importo: 520, fonte: 'Cassa in Cloud' }], 'cassaincloud')
    const conAltroDelivery = mergeInChiusure(riletturaCassa, secondo, 'Glovo')
    // 520 di cassa (l'ultima lettura) + 100 + 60 di delivery.
    expect(conAltroDelivery[0].kpi.totV).toBe(680)
  })
})

// ── 3. Il doppione nell'elenco degli import ──────────────────────────────

describe('reimportare lo stesso file di cassa', () => {
  const riga = { data: '2026-09-01', importo: 820, fonte: 'Cassa in Cloud' }

  it('non lascia due righe uguali nell\'elenco degli import', () => {
    // Prima ne restavano due, e al terzo caricamento tre.
    const uno = mergeInChiusureCassa([], [riga], 'cassaincloud')
    const due = mergeInChiusureCassa(uno, [riga], 'cassaincloud')
    const tre = mergeInChiusureCassa(due, [riga], 'cassaincloud')
    expect(tre[0].cassaImport).toHaveLength(1)
  })

  it('funziona anche se chi chiama passa la fonte «giusta»', () => {
    const uno = mergeInChiusureCassa([], [riga], 'Cassa in Cloud')
    const due = mergeInChiusureCassa(uno, [riga], 'Cassa in Cloud')
    expect(due[0].cassaImport).toHaveLength(1)
  })

  it('due casse diverse restano due righe distinte', () => {
    // Il filtro deve togliere il doppione, non fare piazza pulita: se una
    // gelateria carica il fiscale e poi il lettore di carte, sono due letture
    // e l'elenco deve ricordarle entrambe.
    const uno = mergeInChiusureCassa([], [riga], 'cassaincloud')
    const due = mergeInChiusureCassa(uno, [{ data: '2026-09-01', importo: 300, fonte: 'SumUp' }], 'sumup')
    expect(due[0].cassaImport).toHaveLength(2)
    expect(due[0].cassaImport.map(c => c.fonte).sort()).toEqual(['Cassa in Cloud', 'SumUp'])
  })
})
