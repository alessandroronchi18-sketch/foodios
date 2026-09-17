// Una nota di credito si riconosce dall'IMPORTO, non dall'etichetta.
//
// ═══ Il difetto vero, 16/09/2026 ═══════════════════════════════════════════
//
// Censendo i punti del prodotto dove si calcola un euro, la domanda «quanto
// devo a questo fornitore» aveva TRE risposte diverse in tre file, e due
// erano sbagliate. La causa era una sola: tutte e tre decidevano se una riga
// fosse una nota di credito guardando la colonna `tipo`.
//
// Nel database di produzione `tipo = 'nota_credito'` non c'è su NESSUNA delle
// 3.520 fatture. Sono tutte «fattura». Le note di credito vere sono quattro, e
// sono fatture con il totale NEGATIVO:
//
//     Enel Energia   005067125905   05/09/2024   −365,55 €
//     MORRA S.r.l.   ...6579/02     03/01/2025    −10,00 €
//     Enel Energia   005051323743   06/07/2024    −10,00 €
//     Enel Energia   005033726412   17/04/2024    −10,00 €
//
// `parseFatturaXML` l'etichetta la scrive (TD04/TD08), ma queste fatture sono
// entrate da altre strade — CSV, gestionale, inserimento a mano — e portano
// solo il segno meno sul totale.
//
// ═══ La misura, sui dati veri ══════════════════════════════════════════════
//
// Prese le 6 fatture Enel aperte (10.189,10 €) più la nota di credito da
// −365,55 €, com'è il giorno in cui arriva e non è ancora stata usata:
//
//     Cashflow       (fatture.js)            10.189,10 €   il credito sparisce
//     Pagamenti      (pagamentiFornitore)    10.554,65 €   il credito è un DEBITO
//     dovuto vero                             9.823,55 €
//
// Trecentosessantacinque euro di scarto fra le due pagine, e 731,10 € di
// oscillazione fra la pagina peggiore e la verità. La pagina da cui partono i
// bonifici era quella sbagliata.
//
// Altri tre posti della stessa famiglia, trovati dietro allo stesso filo:
//   · `ordinePagamento` non metteva il credito in cima, quindi un bonifico
//     chiudeva fatture invece di consumare prima il credito;
//   · `testoEstrattoConto` elencava la nota di credito sotto «Ci risultano da
//     saldare» con l'importo in positivo — una lettera che chiede al fornitore
//     soldi che invece deve lui — mentre il totale in fondo era giusto: le
//     righe non tornavano col totale, nella stessa mail;
//   · `riconciliazioneBanca.proponiAbbinamenti` la teneva fra le candidate, e
//     siccome lì il residuo si calcola in valore assoluto, un'uscita da
//     365,55 € poteva chiudere la nota di credito al posto della fattura vera.
//
// Oggi le quattro note di credito sono già segnate pagate: il difetto è armato
// e non ancora sparato. Spara alla prima nota di credito ancora aperta, e
// arriva sempre, appena un fornitore sbaglia una consegna.

import { describe, it, expect } from 'vitest'
import { residuoFattura, isNotaCredito, riepilogoFatture } from '../../src/lib/fatture'
import { residuoDa, ordinePagamento, imputaPagamento, testoEstrattoConto } from '../../src/lib/pagamentiFornitore'
import { proponiAbbinamenti } from '../../src/lib/riconciliazioneBanca'
import { arricchisci } from '../../src/lib/scadenzeFatture'

// Le sei fatture Enel aperte di Mara dei Boschi, copiate dal database.
const ENEL = [
  { id: 1, fornitore: 'Enel Energia S.p.A.', numero_rif: '005405847530', data_fattura: '2026-01-15', totale: 1678.78, importo_pagato: 0, stato: 'da_pagare' },
  { id: 2, fornitore: 'Enel Energia S.p.A.', numero_rif: '005413715561', data_fattura: '2026-02-11', totale: 1801.43, importo_pagato: 0, stato: 'da_pagare' },
  { id: 3, fornitore: 'Enel Energia S.p.A.', numero_rif: '005423862683', data_fattura: '2026-03-12', totale: 1614.34, importo_pagato: 0, stato: 'da_pagare' },
  { id: 4, fornitore: 'Enel Energia S.p.A.', numero_rif: '005423862683', data_fattura: '2026-06-10', totale: 1614.34, importo_pagato: 0, stato: 'da_pagare' },
  { id: 5, fornitore: 'Enel Energia S.p.A.', numero_rif: '005413715561', data_fattura: '2026-06-20', totale: 1801.43, importo_pagato: 0, stato: 'da_pagare' },
  { id: 6, fornitore: 'Enel Energia S.p.A.', numero_rif: '005405847530', data_fattura: '2026-07-10', totale: 1678.78, importo_pagato: 0, stato: 'da_pagare' },
]
// La nota di credito vera, com'è scritta nel database: `tipo` dice «fattura».
const NC = {
  id: 7, fornitore: 'Enel Energia S.p.A.', numero_rif: '005067125905',
  data_fattura: '2026-02-20', totale: -365.55, importo_pagato: 0,
  stato: 'da_pagare', tipo: 'fattura',
}
const TUTTE = [...ENEL, NC]
const DOVUTO_VERO = 9823.55   // 10.189,10 − 365,55

// ── Le due formule di PRIMA, ricopiate qui per far vedere lo scarto ────────
const residuoVecchioFatture = (f) => {
  const segno = f?.tipo === 'nota_credito' ? -1 : 1
  return segno * Math.max(0, (Number(f?.totale) || 0) - (Number(f?.importo_pagato) || 0))
}
const residuoVecchioPagamenti = (f) => {
  if (!f || f.stato === 'pagata') return 0
  const segno = f.tipo === 'nota_credito' ? -1 : 1
  return segno * Math.max(0, Math.abs(Number(f.totale) || 0) - Math.abs(Number(f.importo_pagato) || 0))
}
const somma = (lista, fn) => Math.round(lista.reduce((s, f) => s + fn(f), 0) * 100) / 100

// ═══ 1. RIPRODUCE ═════════════════════════════════════════════════════════
describe('il difetto di prima: il segno preso dall etichetta', () => {
  it('la vecchia formula del Cashflow faceva sparire il credito', () => {
    // `Math.max(0, -365,55 - 0)` = 0. Il credito non c'è più.
    expect(residuoVecchioFatture(NC)).toBe(0)
    expect(somma(TUTTE, residuoVecchioFatture)).toBe(10189.10)
  })

  it('la vecchia formula dei Pagamenti lo trasformava in un debito', () => {
    // `Math.abs(-365,55)` col segno dedotto da `tipo = 'fattura'`: +365,55.
    expect(residuoVecchioPagamenti(NC)).toBe(365.55)
    expect(somma(TUTTE, residuoVecchioPagamenti)).toBe(10554.65)
  })

  it('le due pagine si contraddicevano di 365,55 € sugli stessi dati', () => {
    const cashflow = somma(TUTTE, residuoVecchioFatture)
    const pagamenti = somma(TUTTE, residuoVecchioPagamenti)
    expect(pagamenti - cashflow).toBeCloseTo(365.55, 2)
    // E nessuna delle due diceva il numero giusto: 731,10 € di oscillazione
    // fra la peggiore e la verità.
    expect(pagamenti - DOVUTO_VERO).toBeCloseTo(731.10, 2)
  })

  it('la vecchia regola di ordinamento non metteva il credito in cima', () => {
    // `tipo === 'nota_credito'` è falso su tutte: restava l'ordine per data, e
    // la fattura del 15 gennaio veniva prima del credito del 20 febbraio.
    const vecchioOrdine = [...TUTTE]
      .filter(f => residuoVecchioPagamenti(f) !== 0)
      .sort((a, b) => {
        const ncA = a.tipo === 'nota_credito' ? 0 : 1
        const ncB = b.tipo === 'nota_credito' ? 0 : 1
        if (ncA !== ncB) return ncA - ncB
        return String(a.data_fattura).localeCompare(String(b.data_fattura))
      })
    expect(vecchioOrdine[0].id).toBe(1)     // una fattura, non il credito
  })
})

// ═══ 2. LA CORREZIONE ═════════════════════════════════════════════════════
describe('adesso il segno si prende dall importo', () => {
  it('riconosce la nota di credito anche senza etichetta', () => {
    expect(isNotaCredito(NC)).toBe(true)
    expect(isNotaCredito(ENEL[0])).toBe(false)
  })

  it('e continua a fidarsi dell etichetta quando c è', () => {
    // Un fornitore che manda l'XML TD04 scrive il totale in positivo e
    // l'etichetta giusta: vale meno di zero lo stesso.
    expect(isNotaCredito({ totale: 100, tipo: 'nota_credito' })).toBe(true)
    expect(residuoFattura({ totale: 100, tipo: 'nota_credito' })).toBe(-100)
  })

  it('il residuo della nota di credito è negativo: è un credito', () => {
    expect(residuoFattura(NC)).toBe(-365.55)
    expect(residuoDa(NC)).toBe(-365.55)
  })

  it('le tre pagine ora dicono lo stesso numero, e è quello giusto', () => {
    const anag = {}
    const daScadenzario = arricchisci(TUTTE, anag)
      .reduce((s, f) => s + f.residuo, 0)
    expect(somma(TUTTE, residuoFattura)).toBe(DOVUTO_VERO)
    expect(somma(TUTTE, residuoDa)).toBe(DOVUTO_VERO)
    expect(Math.round(daScadenzario * 100) / 100).toBe(DOVUTO_VERO)
  })

  it('il credito va in cima all ordine di pagamento: prima si usa', () => {
    const ordine = ordinePagamento(TUTTE)
    expect(ordine[0].id).toBe(NC.id)
  })
})

// ═══ 3. QUELLO CHE C'È INTORNO ════════════════════════════════════════════
describe('il resto della famiglia', () => {
  it('un bonifico consuma prima il credito e poi paga le fatture', () => {
    const piano = imputaPagamento(TUTTE, 5000)
    expect(piano.creditiUsati).toBe(365.55)
    expect(piano.dovutoTotale).toBe(DOVUTO_VERO)
    // 5.000 € di bonifico + 365,55 € di credito = 5.365,55 € da imputare:
    // chiude le prime tre fatture (5.094,55 €) e lascia un acconto sulla quarta.
    expect(piano.chiuse).toBe(3)
    expect(piano.parziali).toBe(1)
    expect(piano.usato).toBe(5365.55)
    expect(piano.eccedenza).toBe(0)
  })

  it('la riga del credito nel piano è segnata come tale', () => {
    const riga = imputaPagamento(TUTTE, 5000).righe.find(r => r.id === NC.id)
    expect(riga.isNC).toBe(true)
    expect(riga.residuoPrima).toBe(-365.55)
    expect(riga.residuoDopo).toBe(0)
  })

  it('la lettera al fornitore mette il credito sotto «A nostro credito»', () => {
    const t = testoEstrattoConto('Enel Energia S.p.A.', TUTTE, { nomeAzienda: 'Mara dei Boschi' })
    const iCredito = t.indexOf('A nostro credito')
    expect(iCredito).toBeGreaterThan(-1)
    // Prima finiva sopra, nell'elenco «Ci risultano da saldare», e chiedeva a
    // Enel 365,55 € che invece doveva Enel.
    expect(t.indexOf('005067125905')).toBeGreaterThan(iCredito)
  })

  it('e le righe della lettera tornano col totale scritto in fondo', () => {
    const t = testoEstrattoConto('Enel Energia S.p.A.', TUTTE, { nomeAzienda: 'Mara dei Boschi' })
    expect(t).toContain('Totale a saldo: 9.823,55 €')
  })

  it('un uscita di banca non può chiudere una nota di credito', () => {
    // Un bonifico di 365,55 € a Enel. Prima la nota di credito restava fra le
    // candidate e, col residuo in valore assoluto, era un abbinamento esatto:
    // un clic chiudeva il documento sbagliato.
    const mov = [{ data: '2026-03-01', descrizione: 'BONIFICO ENEL ENERGIA', importo: -365.55 }]
    const { abbinamenti } = proponiAbbinamenti(mov, TUTTE)
    expect(abbinamenti.some(a => a.fattura?.id === NC.id)).toBe(false)
  })

  it('una fattura segnata pagata a mano non resta nel dovuto', () => {
    // `stato = 'pagata'` con `importo_pagato = 0`: in produzione sono 6
    // fatture per 1.597,17 € che il Cashflow contava ancora da pagare mentre
    // lo Scadenzario le dava chiuse.
    expect(residuoFattura({ totale: 1000, importo_pagato: 0, stato: 'pagata' })).toBe(0)
    expect(residuoDa({ totale: 1000, importo_pagato: 0, stato: 'pagata' })).toBe(0)
  })

  it('anche le quattro note di credito vere sono chiuse, come stanno nel DB', () => {
    // Nel database hanno `importo_pagato` NEGATIVO (−365,55) e stato «pagata»:
    // né il segno né lo stato devono produrre un residuo.
    const reale = { ...NC, importo_pagato: -365.55, stato: 'pagata' }
    expect(residuoFattura(reale)).toBe(0)
  })

  it('un credito già usato a metà resta credito per la parte non usata', () => {
    const mezzo = { ...NC, importo_pagato: 200 }
    expect(residuoFattura(mezzo)).toBeCloseTo(-165.55, 2)
  })

  it('un acconto più grande del credito non capovolge il segno', () => {
    // Non esiste «credito negativo»: al massimo è zero. E deve essere zero
    // vero, non «meno zero»: `-1 * 0` in JavaScript fa `-0`, che
    // `toLocaleString('it-IT')` scrive «-0,00» — un segno meno a schermo su un
    // importo nullo.
    expect(residuoFattura({ ...NC, importo_pagato: 500 })).toBe(0)
    expect(Object.is(residuoFattura({ ...NC, importo_pagato: 500 }), -0)).toBe(false)
    expect((0).toLocaleString('it-IT', { minimumFractionDigits: 2 })).toBe('0,00')
  })

  it('il riepilogo per periodo somma il credito col segno meno', () => {
    // Entro fine marzo scadono la fattura di gennaio (scadenza 14/02), quella
    // di febbraio (13/03) e il credito (22/03).
    const r = riepilogoFatture(TUTTE, { entroIso: '2026-03-31' })
    expect(r.n).toBe(3)
    expect(r.totale).toBeCloseTo(1678.78 + 1801.43 - 365.55, 2)
    // Nessuna di queste date viene dal documento: sono tutte derivate.
    expect(r.tutteStimate).toBe(true)
  })

  it('senza note di credito niente cambia', () => {
    // Il righello: se togliendo la nota di credito i numeri non si muovessero,
    // questo file non starebbe misurando niente.
    expect(somma(ENEL, residuoFattura)).toBe(10189.10)
    expect(somma(ENEL, residuoVecchioFatture)).toBe(10189.10)
    expect(ordinePagamento(ENEL)[0].id).toBe(1)
  })
})
