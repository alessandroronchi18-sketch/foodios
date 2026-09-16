// @vitest-environment happy-dom
//
// Cambiare il nome a una ricetta non deve lasciarne due.
//
// Segnalato dal titolare il 16/09/2026, mentre caricava il ricettario vero:
// «se modifico il nome di una ricetta me ne trovo due duplicate nel
// ricettario: una con il nome precedente e una con il nome nuovo, tutte e due
// con gli stessi ingredienti».
//
// Il motivo: nel ricettario la CHIAVE è il nome. Il salvataggio spargeva le
// ricette di prima e aggiungeva quella nuova — e quella di prima restava al
// suo posto, con la sua vecchia chiave.
//
// Cambiare nome però vuol dire tre cose, non una, e questo test le tiene ferme
// tutte e tre. La seconda è quella che fa più danno e non si vede: chi usa
// quella ricetta come semilavorato la cerca PER NOME, e se non si aggiorna
// perde il costo di quell'ingrediente in silenzio — il food cost cala e
// sembra un miglioramento.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src', 'views', 'NuovaRicettaView.jsx'), 'utf8')

// Il pezzo di codice che decide cosa finisce nel ricettario salvato, estratto
// e fatto girare per davvero: così si misura il comportamento, non la forma.
function salva({ ricette, costi = {}, nomePrec, nuova }) {
  const normIng = (s) => String(s || '').trim().toUpperCase()
  const costiAggiornati = { ...costi }
  const ricetteAggiornate = { ...ricette }
  if (nomePrec && nomePrec !== nuova.nome) {
    delete ricetteAggiornate[nomePrec]
    const chiavePrec = normIng(nomePrec)
    for (const [k, r] of Object.entries(ricetteAggiornate)) {
      if (!Array.isArray(r?.ingredienti)) continue
      if (!r.ingredienti.some(i => normIng(i?.nome) === chiavePrec)) continue
      ricetteAggiornate[k] = {
        ...r,
        ingredienti: r.ingredienti.map(i =>
          normIng(i?.nome) === chiavePrec ? { ...i, nome: nuova.nome } : i),
      }
    }
    delete costiAggiornati[chiavePrec]
  }
  ricetteAggiornate[nuova.nome] = nuova
  return { ricette: ricetteAggiornate, ingredienti_costi: costiAggiornati }
}

describe('cambiare il nome a una ricetta', () => {
  const partenza = {
    'TORTA NOCCIOLA': { nome: 'TORTA NOCCIOLA', ingredienti: [{ nome: 'farina 00', qty1stampo: 500 }] },
    'CROSTATA': { nome: 'CROSTATA', ingredienti: [{ nome: 'farina 00', qty1stampo: 400 }] },
  }

  it('la ricetta col nome vecchio sparisce', () => {
    const out = salva({
      ricette: partenza,
      nomePrec: 'TORTA NOCCIOLA',
      nuova: { nome: 'TORTA ALLE NOCCIOLE', ingredienti: [{ nome: 'farina 00', qty1stampo: 500 }] },
    })
    expect(Object.keys(out.ricette).sort()).toEqual(['CROSTATA', 'TORTA ALLE NOCCIOLE'])
    expect(out.ricette['TORTA NOCCIOLA']).toBeUndefined()
  })

  it('senza cambiare il nome, la ricetta resta una e viene aggiornata', () => {
    const out = salva({
      ricette: partenza,
      nomePrec: 'CROSTATA',
      nuova: { nome: 'CROSTATA', ingredienti: [{ nome: 'burro', qty1stampo: 200 }] },
    })
    expect(Object.keys(out.ricette).sort()).toEqual(['CROSTATA', 'TORTA NOCCIOLA'])
    expect(out.ricette['CROSTATA'].ingredienti[0].nome).toBe('burro')
  })

  it('creando una ricetta nuova non si tocca niente di quello che c\'è', () => {
    const out = salva({
      ricette: partenza,
      nomePrec: null,
      nuova: { nome: 'BIGNÈ', ingredienti: [] },
    })
    expect(Object.keys(out.ricette).sort()).toEqual(['BIGNÈ', 'CROSTATA', 'TORTA NOCCIOLA'])
  })

  it('chi la usava come semilavorato segue il nome nuovo', () => {
    const conBase = {
      'CREMA PASTICCERA': { nome: 'CREMA PASTICCERA', tipo: 'semilavorato', ingredienti: [{ nome: 'latte intero', qty1stampo: 1000 }] },
      'BIGNÈ': { nome: 'BIGNÈ', ingredienti: [{ nome: 'Crema pasticcera', qty1stampo: 300 }, { nome: 'farina 00', qty1stampo: 200 }] },
    }
    const out = salva({
      ricette: conBase,
      nomePrec: 'CREMA PASTICCERA',
      nuova: { nome: 'CREMA CHANTILLY', tipo: 'semilavorato', ingredienti: [{ nome: 'latte intero', qty1stampo: 1000 }] },
    })
    // Il confronto è sul nome normalizzato: nel bignè era scritto con le
    // minuscole, e deve essere aggiornato lo stesso.
    expect(out.ricette['BIGNÈ'].ingredienti[0].nome).toBe('CREMA CHANTILLY')
    // E l'altro ingrediente non si tocca.
    expect(out.ricette['BIGNÈ'].ingredienti[1].nome).toBe('farina 00')
  })

  it('il costo al chilo della base non resta nel listino col nome vecchio', () => {
    const out = salva({
      ricette: { 'PASTA FROLLA': { nome: 'PASTA FROLLA', ingredienti: [] } },
      costi: { 'PASTA FROLLA': { costoKg: 4.2, costoG: 0.0042 }, 'FARINA 00': { costoKg: 0.95 } },
      nomePrec: 'PASTA FROLLA',
      nuova: { nome: 'FROLLA CLASSICA', ingredienti: [] },
    })
    expect(out.ingredienti_costi['PASTA FROLLA']).toBeUndefined()
    expect(out.ingredienti_costi['FARINA 00']).toBeDefined()
  })
})

describe('la correzione è nel codice vero, non solo qui', () => {
  it('il salvataggio toglie la chiave del nome precedente', () => {
    expect(SRC).toMatch(/delete ricetteAggiornate\[nomePrec\]/)
  })

  it('e aggiorna chi la usava come ingrediente', () => {
    expect(SRC).toMatch(/normIng\(i\?\.nome\) === chiavePrec \? \{ \.\.\.i, nome: nuovaRic\.nome \}/)
  })

  it('e toglie dal listino il costo della base col nome vecchio', () => {
    expect(SRC).toMatch(/delete costiAggiornati\[chiavePrec\]/)
  })
})

describe('cancellare una ricetta non lascia il popup «modifiche non salvate»', () => {
  // Segnalato dal titolare il 16/09/2026: «quando elimino una ricetta, dopo
  // averla eliminata se cambio pagina mi dice che ci sono modifiche non
  // salvate e mi compare il pop up, ma non ci sono modifiche, ho cancellato la
  // ricetta semplicemente».
  //
  // La guardia confronta il modulo a schermo con un riferimento («com'era
  // quando l'ho aperto»). Aprendo una ricetta per modificarla, il riferimento
  // diventa quella ricetta; cancellandola il modulo si svuotava ma il
  // riferimento restava pieno, e i due non combaciavano più: la guardia
  // leggeva «ci sono modifiche» per un modulo vuoto e una ricetta che non
  // esiste più.
  it('chi cancella azzera anche il riferimento della guardia', () => {
    const blocco = SRC.slice(SRC.indexOf('const handleDeleteRicetta'), SRC.indexOf('const doSaveRicetta'))
    expect(blocco).toMatch(/setForm\(empty\)/)
    expect(blocco, 'il riferimento della guardia resta pieno').toMatch(/initialFormRef\.current = empty/)
  })

  it('e ogni altro punto che svuota il modulo fa lo stesso', () => {
    // Tre punti svuotano il modulo: dopo il salvataggio, dopo la cancellazione,
    // e il pulsante «annulla». Tutti e tre devono azzerare il riferimento,
    // altrimenti il popup compare quando non serve.
    const punti = [...SRC.matchAll(/setForm\(empty\)/g)].map(m => m.index)
    for (const i of punti) {
      const intorno = SRC.slice(i, i + 900)
      expect(intorno, `setForm(empty) a ${i} senza azzerare il riferimento`)
        .toMatch(/initialFormRef\.current = (empty|\{ \.\.\.form \})/)
    }
  })
})
