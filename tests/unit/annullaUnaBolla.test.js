// ── Annullare una bolla registrata per sbaglio ───────────────────────────
//
// Richiesta del titolare, 22/09/2026: «fai in modo che si possa annullare con
// doppio check di sicurezza».
//
// Fino a ieri una bolla caricata sul documento sbagliato si poteva solo
// registrare una seconda volta forzandola: la giacenza restava gonfia e
// l'unico rimedio era la rettifica a mano, voce per voce, dal magazzino. Su
// una bolla da quindici righe è mezz'ora di lavoro e un'occasione di sbagliare
// a ogni riga.
//
// ── Tre cose da disfare, e tre modi diversi ─────────────────────────────
//
// 1. **La merce** si toglie leggendo il registro dei rifornimenti, non
//    ricalcolandola dalle righe della bolla: quelle nel frattempo potrebbero
//    essere state corrette, il registro no.
// 2. **Il registro non si cancella**: la riga sbagliata resta, segnata come
//    annullata, e se ne scrive una uguale e contraria. È la convenzione che il
//    magazzino usa già per l'annullo di una riga singola, ed è come si
//    correggono i registri.
// 3. **I prezzi tornano indietro solo se sono ancora quelli che quella bolla
//    aveva messo.** Se dopo è arrivata un'altra bolla, o qualcuno l'ha
//    cambiato a mano, quel numero è più recente e più vero: toccarlo vorrebbe
//    dire riscrivere il food cost di tutte le ricette che usano
//    quell'ingrediente con un prezzo di ieri. Quello che non si tocca **si
//    dice**.
import { describe, it, expect } from 'vitest'
import { annullaBolla, identitaBolla, preparaBolla, preparaScrittureBolla } from '../../src/lib/bolle'

// Una riga di bolla NON crea una voce nuova nel listino: se lo facesse, un
// nome letto male da una foto diventerebbe una materia prima. Quindi il
// listino deve già conoscerle, e queste prove partono da lì.
const LISTINO = {
  burro: { costoKg: 9, costoG: 0.009 },
  zucchero: { costoKg: 1.2, costoG: 0.0012 },
}

const DOC = { fornitore: 'Latteria Rossi', numero: 'DDT-100', data: '2026-09-20' }
const IDENT = identitaBolla(DOC)

// Una bolla registrata davvero: si passa dal codice vero, non da dati
// inventati a mano, così se cambia il formato di quello che scrive la
// registrazione queste prove se ne accorgono.
function bollaRegistrata(righe, statoIniziale = {}) {
  const doc = { ...DOC, identita: IDENT }
  const stato = {
    magazzino: {}, logRif: [], ingredientiCosti: {}, logPrezzi: [], utente: 'anita@x.it',
    ...statoIniziale,
  }
  // Si passa da `preparaBolla` come fa la schermata vera: è lui che decide se
  // un prezzo si applica, si mette solo nello storico o si lascia stare. Senza,
  // le righe arrivano senza `azione` e il listino non cambia — ed è proprio
  // quello che è successo alla prima stesura di queste prove.
  const decise = preparaBolla(righe, {
    ingredientiCosti: stato.ingredientiCosti,
    logPrezzi: stato.logPrezzi,
    dataBolla: doc.data,
  })
  return preparaScrittureBolla(decise, doc, stato)
}

/** Una riga come la legge la bolla: nome, quanto, e quanto costa al chilo. */
const riga = (nome, grammi, prezzoKg) => ({
  nome,
  quantita: grammi / 1000,
  unita: 'kg',
  imponibile: (grammi / 1000) * prezzoKg,
  aliquota: 22,
  esisteInElenco: true,
  saltata: false,
})

describe('La merce torna da dov\'è venuta', () => {
  it('la giacenza torna esattamente com\'era', () => {
    const prima = { burro: { nome: 'burro', giacenza_g: 5000, soglia_g: 0, ultimoRifornimento: null } }
    const dopoCarico = bollaRegistrata([riga('burro', 25000, 9)], { magazzino: prima, ingredientiCosti: LISTINO })
    expect(dopoCarico.magazzino.burro.giacenza_g).toBe(30000)

    const annullata = annullaBolla(IDENT, { ...dopoCarico, utente: 'anita@x.it' })
    expect(annullata.magazzino.burro.giacenza_g).toBe(5000)
  })

  it('anche con più righe in una bolla sola', () => {
    const dopo = bollaRegistrata([riga('burro', 25000, 9), riga('zucchero', 50000, 1.2)], { ingredientiCosti: LISTINO })
    const ann = annullaBolla(IDENT, { ...dopo, utente: 'x' })
    expect(ann.magazzino.burro.giacenza_g).toBe(0)
    expect(ann.magazzino.zucchero.giacenza_g).toBe(0)
    expect(ann.tolti).toBe(2)
  })

  it('e quello che è arrivato DOPO la bolla non si tocca', () => {
    // Fra la bolla sbagliata e l'annullo può essere passato un rifornimento
    // vero. Togliere «tutto quello che c'è» invece di «quello che ha messo
    // lei» cancellerebbe anche quello.
    const dopo = bollaRegistrata([riga('burro', 25000, 9)], { ingredientiCosti: LISTINO })
    const conAltro = {
      ...dopo,
      magazzino: { ...dopo.magazzino, burro: { ...dopo.magazzino.burro, giacenza_g: 25000 + 8000 } },
    }
    const ann = annullaBolla(IDENT, { ...conAltro, utente: 'x' })
    expect(ann.magazzino.burro.giacenza_g).toBe(8000)
  })
})

describe('Il registro si corregge, non si cancella', () => {
  it('la riga sbagliata resta, segnata come annullata', () => {
    const dopo = bollaRegistrata([riga('burro', 25000, 9)], { ingredientiCosti: LISTINO })
    const ann = annullaBolla(IDENT, { ...dopo, utente: 'x' })
    const vecchia = ann.logRif.find(r => r.bolla === IDENT)
    expect(vecchia, 'la riga della bolla è sparita dal registro').toBeTruthy()
    expect(vecchia.annullata).toBe(true)
  })

  it('e accanto c\'è la riga uguale e contraria', () => {
    const dopo = bollaRegistrata([riga('burro', 25000, 9)], { ingredientiCosti: LISTINO })
    const ann = annullaBolla(IDENT, { ...dopo, utente: 'anita@x.it' })
    const contraria = ann.logRif.find(r => Number(r.quantita_g) === -25000)
    expect(contraria).toBeTruthy()
    expect(contraria.ingrediente).toBe('burro')
    expect(contraria.note).toMatch(/annullo della bolla/)
    expect(contraria.utente).toBe('anita@x.it')
  })

  it('le righe contrarie hanno id diversi fra loro', () => {
    // Due voci della stessa bolla nello stesso millisecondo: se condividono
    // l'id, la seconda sovrascrive la prima nelle liste con `key`.
    const dopo = bollaRegistrata([riga('burro', 25000, 9), riga('zucchero', 50000, 1.2)], { ingredientiCosti: LISTINO })
    const ann = annullaBolla(IDENT, { ...dopo, utente: 'x' })
    const ids = ann.logRif.filter(r => Number(r.quantita_g) < 0).map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('I prezzi tornano indietro solo se sono ancora suoi', () => {
  it('il prezzo che ha messo lei torna a quello di prima', () => {
    const listino = { burro: { costoKg: 9, costoG: 0.009 } }
    const dopo = bollaRegistrata([riga('burro', 25000, 11)], { ingredientiCosti: listino })
    expect(dopo.ingredientiCosti.burro.costoKg).toBe(11)

    const ann = annullaBolla(IDENT, { ...dopo, utente: 'x' })
    expect(ann.ingredientiCosti.burro.costoKg).toBe(9)
    expect(ann.prezziRimessi).toHaveLength(1)
    expect(ann.prezziRimessi[0]).toMatchObject({ nome: 'burro', da: 11, a: 9 })
  })

  it('ma se dopo è cambiato, NON si tocca — e lo si dice', () => {
    // È la regola che protegge il food cost: un prezzo più recente è più vero
    // di quello che c'era prima della bolla sbagliata.
    const listino = { burro: { costoKg: 9, costoG: 0.009 } }
    const dopo = bollaRegistrata([riga('burro', 25000, 11)], { ingredientiCosti: listino })
    const cambiatoDopo = {
      ...dopo,
      ingredientiCosti: { burro: { costoKg: 12.5, costoG: 0.0125 } },
    }
    const ann = annullaBolla(IDENT, { ...cambiatoDopo, utente: 'x' })
    expect(ann.ingredientiCosti.burro.costoKg, 'ha riscritto un prezzo più recente').toBe(12.5)
    expect(ann.prezziRimessi).toHaveLength(0)
    expect(ann.prezziNonRimessi).toHaveLength(1)
    expect(ann.prezziNonRimessi[0]).toMatchObject({ nome: 'burro', attuale: 12.5, suo: 11 })
  })

  it('un primo prezzo torna a non esserci, invece di diventare zero', () => {
    // Prima della bolla quell'ingrediente non aveva prezzo. Rimetterci zero
    // vorrebbe dire «è gratis», che è la bugia di famiglia di questo prodotto.
    // La vaniglia è in elenco ma senza prezzo: è il caso vero di chi ha
    // appena creato la materia prima e aspetta la prima bolla.
    const dopo = bollaRegistrata([riga('vaniglia', 1000, 120)], { ingredientiCosti: { vaniglia: {} } })
    expect(dopo.ingredientiCosti.vaniglia.costoKg).toBe(120)
    const ann = annullaBolla(IDENT, { ...dopo, utente: 'x' })
    expect(ann.ingredientiCosti.vaniglia, 'è rimasto un prezzo a zero').toBeUndefined()
  })

  it('lo storico dei prezzi non si cancella: si aggiunge la riga dell\'annullo', () => {
    // Fra sei mesi qualcuno si chiederà perché il burro è tornato a 9,00.
    const listino = { burro: { costoKg: 9, costoG: 0.009 } }
    const dopo = bollaRegistrata([riga('burro', 25000, 11)], { ingredientiCosti: listino })
    const ann = annullaBolla(IDENT, { ...dopo, utente: 'x' })
    const vecchia = ann.logPrezzi.find(l => l.origine?.identita === IDENT && l.origine?.tipo === 'bolla')
    expect(vecchia.annullata).toBe(true)
    const nuova = ann.logPrezzi.find(l => l.origine?.tipo === 'annullo-bolla')
    expect(nuova).toBeTruthy()
    expect(nuova.prezzoVecchio).toBe(11)
    expect(nuova.prezzoNuovo).toBe(9)
  })
})

describe('Quando non c\'è niente da annullare', () => {
  it('un\'impronta che non esiste non tocca niente', () => {
    const dopo = bollaRegistrata([riga('burro', 25000, 9)], { ingredientiCosti: LISTINO })
    const ann = annullaBolla('bolla-mai-vista', { ...dopo, utente: 'x' })
    expect(ann.trovata).toBe(false)
    expect(ann.magazzino).toBe(dopo.magazzino)
    expect(ann.logRif).toBe(dopo.logRif)
  })

  it('e nemmeno un\'impronta vuota', () => {
    const dopo = bollaRegistrata([riga('burro', 25000, 9)], { ingredientiCosti: LISTINO })
    expect(annullaBolla(null, { ...dopo }).trovata).toBe(false)
    expect(annullaBolla('', { ...dopo }).trovata).toBe(false)
  })

  it('annullare due volte non toglie la merce due volte', () => {
    // Il doppio clic, o il ritorno indietro del browser.
    const dopo = bollaRegistrata([riga('burro', 25000, 9)], {
      magazzino: { burro: { nome: 'burro', giacenza_g: 5000, soglia_g: 0, ultimoRifornimento: null } },
      ingredientiCosti: LISTINO,
    })
    const una = annullaBolla(IDENT, { ...dopo, utente: 'x' })
    const due = annullaBolla(IDENT, { ...una, utente: 'x' })
    expect(due.trovata, 'la seconda volta ha trovato ancora qualcosa da togliere').toBe(false)
    expect(una.magazzino.burro.giacenza_g).toBe(5000)
  })
})

describe('Il righello di questo file', () => {
  it('la registrazione vera scrive l\'impronta, se no l\'annullo non trova niente', () => {
    const dopo = bollaRegistrata([riga('burro', 25000, 11)], { ingredientiCosti: { burro: { costoKg: 9, costoG: 0.009 } } })
    expect(dopo.logRif.some(r => r.bolla === IDENT), 'il registro non porta l\'impronta').toBe(true)
    expect(dopo.logPrezzi.some(l => l.origine?.identita === IDENT), 'lo storico prezzi non porta l\'impronta').toBe(true)
  })

  it('e l\'impronta di due bolle diverse non coincide', () => {
    expect(identitaBolla({ ...DOC, numero: 'DDT-101' })).not.toBe(IDENT)
  })
})
