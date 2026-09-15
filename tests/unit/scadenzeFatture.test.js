// Le fatture da pagare: quando scadono, quanto resta, quanto urge.
//
// È il conto che dice al titolare a chi deve dei soldi e da quanto. Stava
// dentro `Scadenzario.jsx` — 3.199 righe, coperte dai test all'**1%** — e
// quindi non era verificato da niente.
//
// In produzione ci sono 3.520 fatture e 415 risultano scadute. Un errore qui
// non si vede: si vede quando un fornitore telefona.

import { describe, it, expect } from 'vitest'
import {
  normNome, dataScadenza, isoScadenza, giorniAllaScadenza, urgenza, quandoScade,
  arricchisci, perUrgenza, riepilogo, FASCE, FILTRI,
} from '../../src/lib/scadenzeFatture'

const OGGI = new Date('2026-03-15T10:00:00')
const fattura = (x = {}) => ({
  id: 'f1', fornitore: 'Molino Rossi SRL', data_fattura: '2026-03-01',
  totale: 1000, importo_pagato: 0, stato: 'aperta', ...x,
})

describe('quando scade una fattura', () => {
  it('se il documento lo dice, si crede al documento', () => {
    expect(isoScadenza(fattura({ data_scadenza: '2026-04-20' }))).toBe('2026-04-20')
  })

  it('se non lo dice, trenta giorni dalla data della fattura', () => {
    expect(isoScadenza(fattura({ data_fattura: '2026-03-01' }))).toBe('2026-03-31')
  })

  it('e si può dire quanti giorni, se col fornitore è diverso', () => {
    expect(isoScadenza(fattura({ data_fattura: '2026-03-01', _termini: 60 }))).toBe('2026-04-30')
    expect(isoScadenza(fattura({ data_fattura: '2026-03-01', _termini: 0 }))).toBe('2026-03-01')
  })

  it('«trenta giorni FINE MESE» non è «trenta giorni»', () => {
    // È lo standard dei fornitori alimentari. Una fattura del 3 marzo a 30
    // giorni fine mese si paga il 30 aprile, non il 2 aprile: ventotto giorni
    // di differenza, che cambiano quali fatture sono davvero in ritardo.
    //
    // Lo Scadenzario aveva il suo calcolo che ignorava il tipo di termine,
    // mentre la previsione di cassa usava quello giusto: due pagine, due
    // scadenze diverse per la stessa fattura.
    const f = { data_fattura: '2026-03-03', _termini: 30 }
    expect(isoScadenza({ ...f, _terminiTipo: 'netti' })).toBe('2026-04-02')
    expect(isoScadenza({ ...f, _terminiTipo: 'fine_mese' })).toBe('2026-04-30')
  })

  it('e regge i mesi che finiscono il 31, dove il conto ingenuo sbaglia', () => {
    // `setMonth(mese + 1)` su una data del 31 slitta di un mese intero,
    // perché il 31 aprile non esiste: una fattura del 31 marzo finiva a fine
    // maggio invece che a fine aprile.
    expect(isoScadenza({ data_fattura: '2026-03-31', _termini: 30, _terminiTipo: 'fine_mese' })).toBe('2026-04-30')
    expect(isoScadenza({ data_fattura: '2026-01-31', _termini: 30, _terminiTipo: 'fine_mese' })).toBe('2026-03-02')
  })

  it('e febbraio, anche bisestile', () => {
    expect(isoScadenza({ data_fattura: '2026-02-10', _termini: 0, _terminiTipo: 'fine_mese' })).toBe('2026-02-28')
    expect(isoScadenza({ data_fattura: '2028-02-10', _termini: 0, _terminiTipo: 'fine_mese' })).toBe('2028-02-29')
  })

  it('senza data fattura non si inventa una scadenza', () => {
    expect(isoScadenza(fattura({ data_fattura: null }))).toBe(null)
    expect(isoScadenza(fattura({ data_fattura: 'boh' }))).toBe(null)
    expect(dataScadenza(fattura({ data_fattura: null }))).toBe(null)
    expect(isoScadenza(null)).toBe(null)
  })

  it('la data non si sposta col fuso orario', () => {
    // Una data costruita a mezzanotte in Italia, letta in UTC, diventa il
    // giorno prima. È la classe di difetto che in questo progetto è già
    // comparsa tre volte.
    const d = dataScadenza(fattura({ data_scadenza: '2026-04-20' }))
    expect(d.getDate()).toBe(20)
    expect(d.getMonth()).toBe(3)
  })
})

describe('quanti giorni mancano', () => {
  it('conta i giorni, non le ore', () => {
    // Una fattura che scade oggi alle 23:00 scade oggi, non «fra 0,04 giorni».
    const oggi = new Date('2026-03-15T23:00:00')
    expect(giorniAllaScadenza(new Date('2026-03-15T00:30:00'), oggi)).toBe(0)
  })

  it('negativo quando è già passata', () => {
    expect(giorniAllaScadenza(new Date('2026-03-10T12:00:00'), OGGI)).toBe(-5)
    expect(giorniAllaScadenza(new Date('2026-03-20T12:00:00'), OGGI)).toBe(5)
  })

  it('senza data, niente', () => {
    expect(giorniAllaScadenza(null, OGGI)).toBe(null)
  })

  it('e regge il cambio dell\'ora legale', () => {
    // L'ultima domenica di marzo la giornata dura 23 ore: un conto fatto in
    // millisecondi darebbe 29,96 giorni e li arrotonderebbe a 29.
    const prima = new Date('2026-03-25T12:00:00')
    const dopo = new Date('2026-04-25T12:00:00')
    expect(giorniAllaScadenza(dopo, prima)).toBe(31)
  })
})

describe('in che fascia cade', () => {
  const con = (scad) => urgenza(fattura({ data_scadenza: scad }), OGGI)

  it('le quattro fasce, come le direbbe una persona', () => {
    expect(con('2026-03-10')).toBe('scaduta')      // cinque giorni fa
    expect(con('2026-03-15')).toBe('settimana')    // oggi
    expect(con('2026-03-22')).toBe('settimana')    // fra sette giorni
    expect(con('2026-03-23')).toBe('mese')         // fra otto
    expect(con('2026-04-14')).toBe('mese')         // fra trenta
    expect(con('2026-04-15')).toBe('futura')       // fra trentuno
  })

  it('una pagata è pagata, qualunque data abbia', () => {
    expect(urgenza(fattura({ data_scadenza: '2020-01-01', stato: 'pagata' }), OGGI)).toBe('pagata')
  })

  it('senza data finisce fra le future, non fra le scadute', () => {
    // Dichiarare scaduto qualcosa che non si sa quando scade manderebbe il
    // titolare a pagare per primo il fornitore sbagliato.
    expect(urgenza(fattura({ data_fattura: null }), OGGI)).toBe('futura')
  })
})

describe('come si dice a parole', () => {
  it('in italiano, non in numeri', () => {
    expect(quandoScade(-1)).toBe('1 giorno fa')
    expect(quandoScade(-5)).toBe('5 giorni fa')
    expect(quandoScade(0)).toBe('oggi')
    expect(quandoScade(1)).toBe('domani')
    expect(quandoScade(12)).toBe('tra 12 giorni')
  })

  it('senza giorni non dice niente', () => {
    expect(quandoScade(null)).toBe('')
    expect(quandoScade(undefined)).toBe('')
  })
})

describe('quanto resta da pagare', () => {
  const uno = (x) => arricchisci([fattura(x)], {}, OGGI)[0]

  it('tutto, se non hai ancora pagato niente', () => {
    expect(uno({ totale: 1000 }).residuo).toBe(1000)
  })

  it('il resto, se hai già dato un acconto', () => {
    expect(uno({ totale: 1000, importo_pagato: 300 }).residuo).toBe(700)
  })

  it('zero, se è segnata pagata — anche se i numeri dicono altro', () => {
    // Capita: si segna pagata a mano senza aggiornare l'importo.
    expect(uno({ totale: 1000, importo_pagato: 0, stato: 'pagata' }).residuo).toBe(0)
  })

  it('una nota di credito vale col segno meno: riduce il debito', () => {
    const nc = uno({ tipo: 'nota_credito', totale: 200 })
    expect(nc.residuo).toBe(-200)
    expect(nc.isNC).toBe(true)
    expect(nc.segno).toBe(-1)
  })

  it('e una nota di credito già rimborsata in parte', () => {
    expect(uno({ tipo: 'nota_credito', totale: 200, importo_pagato: 50 }).residuo).toBe(-150)
  })

  it('un totale mancante o storto vale zero, non «NaN»', () => {
    for (const t of [null, undefined, '', 'mille', {}]) {
      expect(uno({ totale: t }).residuo, String(t)).toBe(0)
    }
  })
})

describe('i termini concordati col fornitore', () => {
  const anagrafiche = {
    'MOLINO ROSSI SRL': { termini_pagamento: 60, termini_tipo: 'fine_mese', iban: 'IT60X0542811101000000123456' },
  }

  it('si applicano cercando il fornitore per nome', () => {
    const r = arricchisci([fattura({ data_fattura: '2026-03-03' })], anagrafiche, OGGI)[0]
    expect(r.dueIso).toBe('2026-05-30')   // fine marzo + 60
    expect(r._termini).toBe(60)
    expect(r._terminiTipo).toBe('fine_mese')
  })

  it('il nome si riconosce anche scritto storto', () => {
    const r = arricchisci([fattura({ fornitore: '  molino   rossi srl  ' })], anagrafiche, OGGI)[0]
    expect(r._termini).toBe(60)
  })

  it('un fornitore sconosciuto prende i trenta giorni predefiniti', () => {
    const r = arricchisci([fattura({ fornitore: 'Mai Visto SRL', data_fattura: '2026-03-01' })], anagrafiche, OGGI)[0]
    expect(r.dueIso).toBe('2026-03-31')
    expect(r._terminiTipo).toBe('netti')
  })

  it('l\'IBAN del fornitore si usa se la fattura non ne porta uno suo', () => {
    expect(arricchisci([fattura()], anagrafiche, OGGI)[0].iban).toBe('IT60X0542811101000000123456')
    expect(arricchisci([fattura({ iban: 'IT99X999' })], anagrafiche, OGGI)[0].iban).toBe('IT99X999')
  })

  it('dice se la scadenza è dedotta o letta dal documento', () => {
    // In produzione è dedotta per tutte e 3.520: chi programma i pagamenti su
    // quelle date lavora su una convenzione, non su un accordo col fornitore.
    expect(arricchisci([fattura()], {}, OGGI)[0].dueStimata).toBe(true)
    expect(arricchisci([fattura({ data_scadenza: '2026-04-20' })], {}, OGGI)[0].dueStimata).toBe(false)
  })

  it('un elenco vuoto o storto non fa esplodere niente', () => {
    expect(arricchisci([], {}, OGGI)).toEqual([])
    expect(arricchisci(null, {}, OGGI)).toEqual([])
    expect(arricchisci('non un elenco', {}, OGGI)).toEqual([])
  })
})

describe('come si raggruppano', () => {
  const lista = [
    fattura({ id: 'a', data_scadenza: '2026-03-10', totale: 100 }),   // scaduta
    fattura({ id: 'b', data_scadenza: '2026-03-01', totale: 500 }),   // scaduta, più vecchia
    fattura({ id: 'c', data_scadenza: '2026-03-01', totale: 900 }),   // stessa data, più grossa
    fattura({ id: 'd', data_scadenza: '2026-03-18' }),                // settimana
    fattura({ id: 'e', data_scadenza: '2026-04-01' }),                // mese
    fattura({ id: 'f', data_scadenza: '2027-01-01' }),                // futura
    fattura({ id: 'g', stato: 'pagata', data_scadenza: '2026-03-01' }),
  ]
  const g = perUrgenza(arricchisci(lista, {}, OGGI))

  it('ognuna nella sua fascia', () => {
    expect(g.scaduta.map(f => f.id).sort()).toEqual(['a', 'b', 'c'])
    expect(g.settimana.map(f => f.id)).toEqual(['d'])
    expect(g.mese.map(f => f.id)).toEqual(['e'])
    expect(g.futura.map(f => f.id)).toEqual(['f'])
    expect(g.pagata.map(f => f.id)).toEqual(['g'])
  })

  it('le più vecchie per prime, e a parità di data le più grosse', () => {
    // Sono quelle da guardare per prime.
    expect(g.scaduta.map(f => f.id)).toEqual(['c', 'b', 'a'])
  })

  it('un elenco vuoto dà cinque fasce vuote, non undefined', () => {
    const v = perUrgenza([])
    expect(Object.keys(v).sort()).toEqual(['futura', 'mese', 'pagata', 'scaduta', 'settimana'])
    for (const k of Object.keys(v)) expect(v[k]).toEqual([])
    expect(perUrgenza(null).scaduta).toEqual([])
  })
})

describe('il riepilogo in cima alla pagina', () => {
  const lista = [
    fattura({ id: 'a', data_scadenza: '2026-03-10', totale: 1000 }),                    // scaduta
    fattura({ id: 'b', data_scadenza: '2026-03-18', totale: 500 }),                     // settimana
    fattura({ id: 'c', data_scadenza: '2026-04-01', totale: 300, importo_pagato: 100 }),// mese, acconto
    fattura({ id: 'd', data_scadenza: '2027-01-01', totale: 200 }),                     // futura
    fattura({ id: 'e', data_scadenza: '2026-03-20', totale: 150, tipo: 'nota_credito' }),// credito
    fattura({ id: 'f', data_scadenza: '2026-01-01', totale: 999, stato: 'pagata' }),     // pagata
  ]
  const r = riepilogo(perUrgenza(arricchisci(lista, {}, OGGI)))

  it('«da pagare» è il netto: le note di credito scalano', () => {
    // 1000 + 500 + 200 + 200 - 150 = 1750
    expect(r.daPagare).toBe(1750)
  })

  it('ma i crediti si contano anche a parte', () => {
    // Senza, un totale più basso del previsto sembrerebbe un errore di conto.
    expect(r.creditiNC).toBe(150)
    expect(r.nNC).toBe(1)
  })

  it('lo scaduto e la settimana si leggono da soli', () => {
    expect(r.scaduto).toBe(1000)
    expect(r.settimanaTot).toBe(350)   // 500 della settimana - 150 di credito
  })

  it('i conteggi non includono le note di credito', () => {
    // «Quattro fatture da pagare» deve voler dire quattro fatture, non tre e
    // un credito.
    expect(r.nDaPagare).toBe(4)
    expect(r.nScadute).toBe(1)
    expect(r.nSettimana).toBe(1)
  })

  it('le pagate restano fuori dal totale', () => {
    expect(r.daPagare).not.toContain(999)
    expect(String(r.daPagare)).not.toBe('2749')
  })

  it('dice quante scadenze sono dedotte invece che lette dal documento', () => {
    // Se sono tutte, il riepilogo è un'ipotesi e va dichiarato.
    const soloDedotte = riepilogo(perUrgenza(arricchisci([fattura()], {}, OGGI)))
    expect(soloDedotte.nStimate).toBe(1)
    expect(r.nStimate).toBe(0)   // queste hanno tutte la data dal documento
  })

  it('senza fatture dà tutti zeri, non NaN', () => {
    const v = riepilogo(perUrgenza([]))
    for (const [k, n] of Object.entries(v)) {
      expect(Number.isFinite(n), `${k} = ${n}`).toBe(true)
      expect(n).toBe(0)
    }
    expect(riepilogo(null).daPagare).toBe(0)
    expect(riepilogo(undefined).nDaPagare).toBe(0)
  })

  it('i totali sono arrotondati al centesimo', () => {
    const cent = riepilogo(perUrgenza(arricchisci([
      fattura({ data_scadenza: '2026-03-10', totale: 10.1 }),
      fattura({ data_scadenza: '2026-03-10', totale: 20.2 }),
    ], {}, OGGI)))
    expect(cent.scaduto).toBe(30.3)   // non 30.299999999999997
  })
})

describe('come si chiamano le fasce e i filtri', () => {
  it('ogni fascia ha un nome in italiano e un ordine', () => {
    for (const [id, c] of Object.entries(FASCE)) {
      expect(typeof c.label, id).toBe('string')
      expect(typeof c.header, id).toBe('string')
      expect(typeof c.sub, id).toBe('string')
      expect(Number.isInteger(c.order), id).toBe(true)
    }
  })

  it('l\'ordine mette per prime le scadute', () => {
    const ordinate = Object.entries(FASCE).sort((a, b) => a[1].order - b[1].order).map(x => x[0])
    expect(ordinate).toEqual(['scaduta', 'settimana', 'mese', 'futura', 'pagata'])
  })

  it('ogni filtro punta a fasce che esistono', () => {
    for (const f of FILTRI) {
      for (const g of f.gruppi) expect(FASCE[g], `${f.id} → ${g}`).toBeTruthy()
    }
  })

  it('«Tutte» non comprende le pagate', () => {
    // Sono la maggioranza e seppellirebbero quelle da pagare.
    expect(FILTRI.find(f => f.id === 'tutte').gruppi).not.toContain('pagata')
  })
})

describe('il nome del fornitore come chiave', () => {
  it('maiuscolo, senza spazi doppi, senza spazi ai lati', () => {
    expect(normNome('  molino   rossi  srl ')).toBe('MOLINO ROSSI SRL')
    expect(normNome('Molino Rossi SRL')).toBe('MOLINO ROSSI SRL')
  })

  it('regge il vuoto e i tipi sbagliati', () => {
    for (const v of ['', null, undefined]) expect(normNome(v)).toBe('')
    expect(normNome(42)).toBe('42')
  })
})
