// ── La fattura non ricarica la merce già arrivata ───────────────────────
//
// ── Il difetto, trovato dall'audit del 22/09/2026 ───────────────────────
//
// Vecchio Enrico e ConoArtic — due fornitori su cinque del design partner —
// mandano prima un DDT con le sole quantità, e settimane dopo la fattura coi
// prezzi. La fattura dice da sola a quale bolla si riferisce:
//
//     #   Ddt nr. 20/26 del 05-06-2026   PZ
//
// `bollaDiQuestaFattura` lo riconosceva benissimo e rispondeva
// «solo-prezzi». La schermata ci scriveva sopra, in bell'evidenza: «la merce
// è già in magazzino: da qui prendo solo i prezzi, le quantità non si
// ricaricano».
//
// **E non era vero.** `registra()` passava al calcolo solo
// `{fornitore, numero, data, identita, forza}`: la decisione non usciva mai
// dalla schermata. `preparaScrittureBolla` caricava le quantità come una
// consegna normale, e il blocco «bolla già caricata» non scattava perché
// l'impronta era quella della **fattura**, mai vista prima.
//
// Risultato: 60 kg di pasta nocciola diventavano 120. E la schermata, invece
// di tacere, prometteva attivamente il contrario — che è il modo peggiore in
// cui un programma può sbagliare.
//
// Il pezzo che decideva era ben provato da solo; il pezzo che doveva usare la
// decisione non era mai stato collegato. Questo file li mette insieme.
import { describe, it, expect } from 'vitest'
import { preparaScrittureBolla, normalizzaUnita } from '../../src/lib/bolle.js'

const DOC = (extra) => ({ fornitore: 'Vecchio Enrico', numero: '28', identita: 've|28|2026-06-30', ...extra })
const stato = () => ({
  magazzino: { 'pasta nocciola': { nome: 'Pasta nocciola', giacenza_g: 60000, soglia_g: 10000 } },
  logRif: [],
  ingredientiCosti: { 'pasta nocciola': { costoKg: 20, costoG: 0.02 } },
  logPrezzi: [],
})
// La riga della fattura n. 28: le stesse quantità del DDT, più i prezzi.
const riga = {
  chiave: 'pasta nocciola', nome: 'Pasta nocciola', grammi: 60000,
  prezzoKg: 23, azione: 'applica', prezzoAttuale: 20,
}

describe('Quando la merce è già arrivata con la bolla', () => {
  it('la giacenza NON si tocca', () => {
    // È il difetto: prima faceva 120.000 g.
    const out = preparaScrittureBolla([riga], DOC({ soloPrezzi: true }), stato())
    expect(out.magazzino['pasta nocciola'].giacenza_g).toBe(60000)
  })

  it('e nello storico dei carichi non compare niente', () => {
    const out = preparaScrittureBolla([riga], DOC({ soloPrezzi: true }), stato())
    expect(out.logRif).toEqual([])
    expect(out.caricati).toBe(0)
  })

  it('ma i prezzi entrano: è tutto quello per cui la fattura serve', () => {
    const out = preparaScrittureBolla([riga], DOC({ soloPrezzi: true }), stato())
    expect(out.ingredientiCosti['pasta nocciola'].costoKg).toBe(23)
    expect(out.applicati).toBe(1)
  })

  it('e lo storico dei prezzi registra il cambio', () => {
    const out = preparaScrittureBolla([riga], DOC({ soloPrezzi: true }), stato())
    expect(out.logPrezzi.length).toBeGreaterThan(0)
    expect(out.logPrezzi[0].prezzoNuovo).toBe(23)
  })
})

describe('Senza la dichiarazione si comporta come una consegna', () => {
  it('la giacenza sale, come sempre', () => {
    const out = preparaScrittureBolla([riga], DOC(), stato())
    expect(out.magazzino['pasta nocciola'].giacenza_g).toBe(120000)
    expect(out.caricati).toBe(1)
  })

  it('e un valore che non è esattamente `true` non basta a fermarla', () => {
    // «Nel dubbio non caricare» sarebbe la scelta prudente su un bottone, ma
    // qui il dubbio non deve esistere: la decisione viene da una funzione che
    // risponde `true` o niente. Un `1`, una stringa o un `null` sono un
    // errore di chi chiama, e trattarli come «sì» nasconderebbe l'errore.
    for (const v of [1, 'si', 'true', null, undefined]) {
      const out = preparaScrittureBolla([riga], DOC({ soloPrezzi: v }), stato())
      expect(out.magazzino['pasta nocciola'].giacenza_g, String(v)).toBe(120000)
    }
  })
})

describe('Le unità di ConoArtic', () => {
  it('«PA» e «SC» si riconoscono: sono su ogni sua bolla', () => {
    // Trovato dall'audit: il prompt del riconoscimento le chiedeva già, e qui
    // non arrivavano. Ogni riga di coppette, bicchieri e tovaglioli mostrava
    // «unità di misura sconosciuta» e andava corretta a mano ogni volta.
    expect(normalizzaUnita('PA')).toBe('pz')
    expect(normalizzaUnita('SC')).toBe('pz')
    expect(normalizzaUnita('pa.')).toBe('pz')
    expect(normalizzaUnita('Sc')).toBe('pz')
  })

  it('e anche scritte per esteso', () => {
    for (const u of ['pacco', 'pacchi', 'scatola', 'scatole', 'collo', 'colli']) {
      expect(normalizzaUnita(u), u).toBe('pz')
    }
  })

  it('senza toccare quelle di prima', () => {
    expect(normalizzaUnita('KG')).toBe('kg')
    expect(normalizzaUnita('LT')).toBe('l')
    expect(normalizzaUnita('CF')).toBe('pz')
    expect(normalizzaUnita('NR')).toBe('pz')
    expect(normalizzaUnita('boh')).toBe(null)
  })
})
