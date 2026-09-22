// ── Metà delle bolle vere non ha prezzi ─────────────────────────────────
//
// Il 22/09/2026 il titolare ha fotografato 32 bolle di Mara dei Boschi. Due
// fornitori su cinque — **Vecchio Enrico e ConoArtic**, cioè metà dei
// documenti — mandano un DDT con le sole quantità: la colonna del prezzo non
// esiste proprio. I prezzi arrivano settimane dopo, con la fattura.
//
// ── Il difetto ───────────────────────────────────────────────────────────
//
// Foodos trattava quelle righe come rotte («su questa riga non c'è nessun
// prezzo») e la schermata diceva che c'era qualcosa che non andava. Ma 85 kg
// di pasta nocciola, pistacchio e granella sono arrivati davvero: il
// magazzino deve saperlo. Decisione del titolare, alla domanda «la merce
// entra lo stesso?»: **sì, le quantità entrano e i prezzi no, dicendolo**.
//
// ── E poi arriva la fattura ──────────────────────────────────────────────
//
// La fattura Vecchio Enrico n. 28 del 30/06/2026 ha come prima riga della
// tabella:
//
//     #   Ddt nr. 20/26 del 05-06-2026   PZ
//
// e sotto i prezzi veri: nocciola 23,00 €/kg, pistacchio premium 38,00 €/kg,
// totale documento 3.524,40 €. Caricando anche lei come una consegna, i 60
// kg di nocciola diventano 120. La riga di riferimento serve esattamente a
// non farlo.
//
// ── Il totale scritto a penna ────────────────────────────────────────────
//
// Su due DDT c'è a mano «Ammonta € 2.651,00» e «€ 4.743,20». Si legge e si
// mostra come **controllo**, mai per ricavare prezzi: ho provato a ricavarli
// con l'algebra da due bolle e usciva 72,20 €/kg di granella da una e 77,90
// €/kg dall'altra. Il conto tornava lo stesso, ed è per questo che non ci si
// può fidare.
import { describe, it, expect } from 'vitest'
import {
  preparaBolla, prezzoAlKgDaRiga, leggiRiferimentoDdt,
  bollaDiQuestaFattura, controlloTotaleAMano, identitaBolla,
} from '../../src/lib/bolle.js'

// La bolla Vecchio Enrico 20/26 del 05/06/2026, com'è stampata.
const VECCHIO_20 = [
  { nome: 'pasta nocciola', quantita: '60,00', unita: 'KG' },
  { nome: 'pasta pistacchio', quantita: '48,00', unita: 'KG' },
]
const IC = {
  'pasta nocciola': { costoKg: 23, costoG: 0.023 },
  'pasta pistacchio': { costoKg: 38, costoG: 0.038 },
}

describe('Un documento senza prezzi carica lo stesso la merce', () => {
  it('la riga non è più un problema, ed è pesata', () => {
    const [r] = preparaBolla([VECCHIO_20[0]], { ingredientiCosti: IC, senzaPrezzi: true })
    expect(r.problema).toBe(null)
    expect(r.grammi).toBe(60000)
    expect(r.prezzoNonSulDocumento).toBe(true)
  })

  it('e lo dice, invece di far finta di niente', () => {
    const [r] = preparaBolla([VECCHIO_20[0]], { ingredientiCosti: IC, senzaPrezzi: true })
    expect(r.avvisi.join(' ')).toMatch(/i prezzi non ci sono/)
  })

  it('ma il listino NON si tocca: non c\'è nessun prezzo da cui partire', () => {
    const [r] = preparaBolla([VECCHIO_20[0]], { ingredientiCosti: IC, senzaPrezzi: true })
    expect(r.prezzoKg).toBe(null)
    expect(r.azione).toBe('nessuna')
  })

  it('senza la dichiarazione, invece, la riga resta un problema come prima', () => {
    // Retrocompatibilità: un documento CHE HA la colonna del prezzo e la
    // lascia vuota su una riga è un buco, non un DDT puro. Le due cose non
    // si confondono.
    const [r] = preparaBolla([VECCHIO_20[0]], { ingredientiCosti: IC })
    expect(r.problema).toMatch(/nessun prezzo/)
    expect(r.prezzoNonSulDocumento).toBe(false)
  })

  it('e un prezzo che c\'è comanda comunque, anche su un documento dichiarato senza prezzi', () => {
    const [r] = preparaBolla(
      [{ nome: 'pasta nocciola', quantita: '60,00', unita: 'KG', imponibile: '1.380,00' }],
      { ingredientiCosti: IC, senzaPrezzi: true },
    )
    expect(r.prezzoKg).toBe(23)
    expect(r.prezzoNonSulDocumento).toBe(false)
  })

  it('tutte e due le righe della bolla vera entrano', () => {
    const righe = preparaBolla(VECCHIO_20, { ingredientiCosti: IC, senzaPrezzi: true })
    expect(righe.every(r => r.problema === null)).toBe(true)
    expect(righe.map(r => r.grammi)).toEqual([60000, 48000])
  })
})

describe('La fattura dice a quale bolla si riferisce', () => {
  it('«Ddt nr. 20/26 del 05-06-2026» si legge tutto', () => {
    expect(leggiRiferimentoDdt('Ddt nr. 20/26 del 05-06-2026'))
      .toMatchObject({ numero: '20/26', data: '2026-06-05' })
  })

  it('e anche gli altri modi di scriverlo', () => {
    expect(leggiRiferimentoDdt('rif. DDT 1685 del 14/09/2026')).toMatchObject({ numero: '1685', data: '2026-09-14' })
    expect(leggiRiferimentoDdt('D.D.T. n. 004617/002 del 19/09/26')).toMatchObject({ numero: '004617/002', data: '2026-09-19' })
    expect(leggiRiferimentoDdt('Documento di trasporto 17139/26 del 05.09.2026')).toMatchObject({ numero: '17139/26', data: '2026-09-05' })
    expect(leggiRiferimentoDdt('bolla 39/26 del 3/7/2026')).toMatchObject({ numero: '39/26', data: '2026-07-03' })
  })

  it('l\'anno a due cifre è duemila', () => {
    expect(leggiRiferimentoDdt('DDT 12/26 del 28/05/26').data).toBe('2026-05-28')
  })

  it('una riga che non parla di bolle non inventa niente', () => {
    for (const t of ['', null, 'PASTA NOCCIOLA PIEMONTE I.G.P.', 'Totale documento 3.524,40', 'IT70U0306922540100000008183']) {
      expect(leggiRiferimentoDdt(t), String(t)).toBe(null)
    }
  })
})

describe('La merce non si carica due volte', () => {
  const FORN = 'Vecchio Enrico'
  const identita = identitaBolla({ fornitore: FORN, numero: '20/26', data: '2026-06-05' })
  const LOGRIF = [{ bolla: identita, data: '2026-06-05T09:00:00.000Z' }]

  it('se la bolla risulta già caricata, la fattura porta solo i prezzi', () => {
    const r = bollaDiQuestaFattura('Ddt nr. 20/26 del 05-06-2026', { fornitore: FORN, logRif: LOGRIF })
    expect(r.giaCaricata).toBe(true)
    expect(r.cosaFare).toBe('solo-prezzi')
    expect(r.quando).toBe('2026-06-05')
  })

  it('se non risulta caricata, si carica tutto come una consegna normale', () => {
    // Decisione del titolare: «si carica tutto».
    const r = bollaDiQuestaFattura('Ddt nr. 99/26 del 05-06-2026', { fornitore: FORN, logRif: LOGRIF })
    expect(r.giaCaricata).toBe(false)
    expect(r.cosaFare).toBe('carica-tutto')
  })

  it('e una fattura senza riferimento si carica tutta, senza domande', () => {
    expect(bollaDiQuestaFattura(null, { fornitore: FORN, logRif: LOGRIF }).cosaFare).toBe('carica-tutto')
  })

  it('senza la data non si finge di riconoscerla', () => {
    // Un documento che non si sa riconoscere è peggio di uno nuovo: si dice.
    const r = bollaDiQuestaFattura('Ddt nr. 20/26', { fornitore: FORN, logRif: LOGRIF })
    expect(r.cosaFare).toBe('non-so')
    expect(r.identita).toBe(null)
  })

  it('la bolla di un altro fornitore non conta', () => {
    const r = bollaDiQuestaFattura('Ddt nr. 20/26 del 05-06-2026', { fornitore: 'ConoArtic', logRif: LOGRIF })
    expect(r.giaCaricata).toBe(false)
  })
})

describe('Il totale scritto a penna è un controllo, non un prezzo', () => {
  const RIGHE = [
    { chiave: 'pasta nocciola', grammi: 50000 },
    { chiave: 'pasta pistacchio', grammi: 30000 },
  ]

  it('dice quanto verrebbe coi prezzi che hai già', () => {
    // 50 kg × 23 + 30 kg × 38 = 1.150 + 1.140 = 2.290 €
    const c = controlloTotaleAMano(RIGHE, '2.651,00', IC)
    expect(c.atteso).toBeCloseTo(2290, 2)
    expect(c.scritto).toBeCloseTo(2651, 2)
    expect(c.differenza).toBeCloseTo(361, 2)
  })

  it('e lo scrive in una frase che si capisce', () => {
    const c = controlloTotaleAMano(RIGHE, '2.651,00', IC)
    expect(c.frase).toMatch(/2\.290/)
    expect(c.frase).toMatch(/2\.651/)
    expect(c.frase).toMatch(/mancano/)
    expect(c.frase).toMatch(/lo dirà la fattura/)
  })

  it('quando torna, lo dice senza allarmare', () => {
    const c = controlloTotaleAMano(RIGHE, '2.290,00', IC)
    expect(c.frase).toMatch(/torna/)
    expect(c.frase).not.toMatch(/mancano/)
  })

  it('le righe senza prezzo di listino restano fuori dal conto, e si dicono', () => {
    const c = controlloTotaleAMano([...RIGHE, { chiave: 'granella', grammi: 5000 }], '2.651,00', IC)
    expect(c.coperte).toBe(2)
    expect(c.scoperte).toBe(1)
    expect(c.frase).toMatch(/1 riga non ha un prezzo di listino/)
  })

  it('una stima non conta come prezzo dichiarato', () => {
    // `buildIngCosti` riempie i buchi con le stime HORECA. Contarle dentro
    // un controllo le farebbe passare per numeri misurati.
    const conStima = { ...IC, granella: { costoKg: 20, costoG: 0.02, isStima: true } }
    const c = controlloTotaleAMano([...RIGHE, { chiave: 'granella', grammi: 5000 }], '2.651,00', conStima)
    expect(c.coperte).toBe(2)
    expect(c.scoperte).toBe(1)
  })

  it('e le righe saltate non si contano', () => {
    const c = controlloTotaleAMano([...RIGHE, { chiave: 'pasta nocciola', grammi: 99000, saltata: true }], '2.651,00', IC)
    expect(c.atteso).toBeCloseTo(2290, 2)
  })

  it('senza nessun prezzo di listino lo dice, invece di mostrare uno zero', () => {
    const c = controlloTotaleAMano(RIGHE, '2.651,00', {})
    expect(c.atteso).toBe(null)
    expect(c.frase).toMatch(/non posso confrontarlo con niente/)
  })

  it('e senza il numero a mano non c\'è niente da dire', () => {
    expect(controlloTotaleAMano(RIGHE, null, IC).frase).toBe(null)
    expect(controlloTotaleAMano(RIGHE, '', IC).frase).toBe(null)
  })
})

describe('Il righello di questo file', () => {
  it('senza la dichiarazione il conto si comporta come ieri', () => {
    // Taratura: se `senzaPrezzi` non facesse niente, il primo gruppo di
    // prove qui sopra sarebbe indistinguibile da questo.
    const a = prezzoAlKgDaRiga({ nome: 'x', quantita: 10, unita: 'KG' })
    const b = prezzoAlKgDaRiga({ nome: 'x', quantita: 10, unita: 'KG' }, { senzaPrezzi: true })
    expect(a.problema).toBeTruthy()
    expect(b.problema).toBe(null)
    expect(a.grammi).toBe(b.grammi)
  })

  it('e niente di tutto questo cade su dati storti', () => {
    for (const s of [null, undefined, {}, [], 'ciao']) {
      expect(() => leggiRiferimentoDdt(s)).not.toThrow()
      expect(() => controlloTotaleAMano(s, s, s)).not.toThrow()
      expect(() => bollaDiQuestaFattura(s, s)).not.toThrow()
    }
  })
})
