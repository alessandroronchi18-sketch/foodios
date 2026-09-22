// ── Cibo o imballaggio, e quanto costa uno ──────────────────────────────
//
// ConoArtic manda sulla stessa bolla due mondi diversi. Righe vere della
// D.D.T. 1207 del 13/07/2026 e della 1738 del 21/09/2026:
//
//     V570/6      GIANDUIA SCURA (KG.3)          KG   6,00   IVA 10
//     X080        COPERT.CLASS.STRACCIATELLA     KG   5,00   IVA 10
//     B085/B-16   COPPETTA BIO 16/B MARA N.250   PA   9,00   IVA 22
//     E009/A-MARA TOVAGLIOLO MARA N. 12.000      SC   1,00   IVA 22
//     B015/-IM200 BICCH.BAMBOO 200cc N.50        PA  40,00   IVA 22
//
// Il gelato va in magazzino e pesa sul food cost delle ricette. Le coppette
// no: sono materiali di confezionamento, e il loro posto è l'elenco che
// alimenta il costo dei formati — quello dove il 22/09/2026 la cialda del
// design partner valeva **0,001 €**, trenta volte meno del vero.
//
// ── Perché l'aliquota IVA e non il nome ─────────────────────────────────
//
// In Italia gli alimentari stanno al 4%, 5% o 10%, tutto il resto al 22%:
// è l'unica cosa stampata che li separa davvero. Un elenco di parole
// sbaglierebbe il giorno che arriva un prodotto nuovo, e sbaglia già oggi:
// «coppetta» è un imballaggio, ma «coppa» è un salume.
import { describe, it, expect } from 'vitest'
import { doveVa, costoDiUnPezzo, smistaBolla, prezziMaterialiDaBolla, DOVE } from '../../src/lib/smistaMerce.js'

describe('L\'aliquota dice di che mondo è la riga', () => {
  it('il gelato al 10% va in magazzino', () => {
    const d = doveVa({ nome: 'gianduia scura', aliquotaIva: 10 })
    expect(d.dove).toBe(DOVE.MAGAZZINO)
    expect(d.sicura).toBe(true)
    expect(d.perche).toMatch(/alimentare/)
  })

  it('le coppette al 22% vanno nei materiali', () => {
    const d = doveVa({ nome: 'coppetta bio', aliquotaIva: 22 })
    expect(d.dove).toBe(DOVE.MATERIALI)
    expect(d.sicura).toBe(true)
  })

  it('anche il 4% e il 5% sono cibo', () => {
    // Latte e panna di DESA stanno al 4%. Escluderli manderebbe il latte
    // fra le coppette.
    expect(doveVa({ aliquotaIva: 4 }).dove).toBe(DOVE.MAGAZZINO)
    expect(doveVa({ aliquotaIva: 5 }).dove).toBe(DOVE.MAGAZZINO)
  })

  it('senza aliquota non si indovina: si chiede', () => {
    const d = doveVa({ nome: 'qualcosa' })
    expect(d.dove).toBe(DOVE.NON_SO)
    expect(d.sicura).toBe(false)
    expect(d.perche).toMatch(/dimmi tu/)
  })

  it('e un\'aliquota strana non diventa una risposta', () => {
    for (const a of [0, 1, 99, -10, NaN, 'dieci']) {
      expect(doveVa({ aliquotaIva: a }).dove, String(a)).toBe(DOVE.NON_SO)
    }
  })

  it('il nome non conta: «coppa» è un salume, «coppetta» un imballaggio', () => {
    // È il motivo per cui non c'è nessun elenco di parole qui dentro.
    expect(doveVa({ nome: 'coppa di parma', aliquotaIva: 10 }).dove).toBe(DOVE.MAGAZZINO)
    expect(doveVa({ nome: 'coppetta bio', aliquotaIva: 22 }).dove).toBe(DOVE.MATERIALI)
  })
})

describe('Quanto costa una coppetta', () => {
  it('9 pacchi da 250 a 180,00 € fanno 0,08 € l\'una', () => {
    const r = costoDiUnPezzo({
      nome: 'coppetta bio', descrizione: 'COPPETTA BIO 16/B MARA N.250',
      quantita: '9,00', imponibile: '180,00',
    })
    expect(r.pezzi).toBe(250)
    expect(r.totPezzi).toBe(2250)
    expect(r.costoPezzo).toBeCloseTo(0.08, 6)
    expect(r.perche).toMatch(/2\.250/)
  })

  it('e una scatola da 12.000 tovaglioli a 60,00 € fa mezzo centesimo l\'uno', () => {
    // Nei formati del design partner il «Fazzoletto» vale 0,001 €.
    const r = costoDiUnPezzo({
      nome: 'tovagliolo', descrizione: 'TOVAGLIOLO MARA N. 12.000',
      quantita: '1,00', imponibile: '60,00',
    })
    expect(r.totPezzi).toBe(12000)
    expect(r.costoPezzo).toBeCloseTo(0.005, 6)
  })

  it('i pezzi si contano anche quando il prezzo non c\'è', () => {
    // Metà delle bolle vere non ha prezzi: il DDT porta le quantità e la
    // fattura arriva dopo. Sapere che sono entrate 2.000 coppette serve lo
    // stesso.
    const r = costoDiUnPezzo({
      nome: 'bicchiere bamboo', descrizione: 'BICCH.BAMBOO 200cc N.50', quantita: '40,00',
    })
    expect(r.totPezzi).toBe(2000)
    expect(r.costoPezzo).toBe(null)
    expect(r.problema).toMatch(/i pezzi li conto, il costo no/)
  })

  it('senza i pezzi per confezione non si inventa niente', () => {
    const r = costoDiUnPezzo({ nome: 'roba', descrizione: 'ROBA VARIA', quantita: 3, imponibile: '30,00' })
    expect(r.costoPezzo).toBe(null)
    expect(r.pezzi).toBe(null)
    expect(r.problema).toMatch(/quanti pezzi/)
  })

  it('e il numero già letto dal riconoscimento vince su quello nel testo', () => {
    const r = costoDiUnPezzo({
      nome: 'coppetta', descrizione: 'COPPETTA BIO 16/B MARA N.250',
      pezziPerConfezione: 200, quantita: 1, imponibile: '20,00',
    })
    expect(r.pezzi).toBe(200)
    expect(r.costoPezzo).toBeCloseTo(0.1, 6)
  })

  it('una quantità illeggibile ferma il conto invece di dare zero', () => {
    const r = costoDiUnPezzo({ descrizione: 'COPPETTA N.250', quantita: 'tante', imponibile: '20,00' })
    expect(r.costoPezzo).toBe(null)
    expect(r.problema).toMatch(/quante confezioni/)
  })
})

describe('Una bolla ConoArtic intera', () => {
  // La D.D.T. 1207 del 13/07/2026, righe vere.
  const BOLLA = [
    { nome: 'gianduia scura', descrizione: 'GIANDUIA SCURA (KG.3)', quantita: '6,00', unita: 'KG', aliquotaIva: 10 },
    { nome: 'coppetta bio', descrizione: 'COPPETTA BIO 16/B MARA N.250', quantita: '9,00', unita: 'PA', aliquotaIva: 22, imponibile: '180,00' },
    { nome: 'tovagliolo', descrizione: 'TOVAGLIOLO MARA N. 12.000', quantita: '1,00', unita: 'SC', aliquotaIva: 22, imponibile: '60,00' },
    { nome: 'bicchiere bamboo', descrizione: 'BICCH.BAMBOO 200cc N.50', quantita: '40,00', unita: 'PA', aliquotaIva: 22 },
    { nome: 'roba senza aliquota', quantita: '1,00' },
  ]

  it('il gelato da una parte, gli imballaggi dall\'altra', () => {
    const { righe, materiali, nonSo } = smistaBolla(BOLLA)
    expect(righe[0]._dove.dove).toBe(DOVE.MAGAZZINO)
    expect(materiali).toHaveLength(3)
    expect(nonSo).toHaveLength(1)
  })

  it('e per gli imballaggi si sa il costo di un pezzo, dove il prezzo c\'è', () => {
    const { materiali } = smistaBolla(BOLLA)
    const conPrezzo = materiali.filter(r => r._pezzi?.costoPezzo != null)
    expect(conPrezzo).toHaveLength(2)
    expect(conPrezzo[0]._pezzi.costoPezzo).toBeCloseTo(0.08, 6)
  })

  it('e lo dice, invece di smistare in silenzio', () => {
    // Una regola automatica che non si vede è una regola che sbaglia in
    // silenzio: qui la schermata deve poter mostrare cosa è successo.
    const { avvisi } = smistaBolla(BOLLA)
    const t = avvisi.join(' | ')
    expect(t).toMatch(/3 righe sono materiale di confezionamento/)
    expect(t).toMatch(/costo dei formati/)
    expect(t).toMatch(/1 riga non ha l/)
  })
})

describe('Il righello di questo file', () => {
  it('senza l\'aliquota tutto finirebbe in «non so»: è il motivo del file', () => {
    const senza = smistaBolla([{ nome: 'coppetta bio', quantita: 1 }])
    expect(senza.materiali).toHaveLength(0)
    expect(senza.nonSo).toHaveLength(1)
  })

  it('e niente cade su dati storti', () => {
    for (const s of [null, undefined, {}, 'ciao', 42, []]) {
      expect(() => doveVa(s)).not.toThrow()
      expect(() => costoDiUnPezzo(s)).not.toThrow()
      expect(() => smistaBolla(s)).not.toThrow()
    }
    expect(smistaBolla(null).righe).toEqual([])
  })
})

describe('Il prezzo dei materiali, portato dalla bolla', () => {
  // La riga vera: nove pacchi da 250 coppette a 180,00 € fanno 0,08 l'una.
  const RIGHE = [{
    nome: 'Coppetta', descrizione: 'COPPETTA BIO 16/B MARA N.250',
    quantita: '9,00', imponibile: '180,00', aliquotaIva: 22,
  }, {
    nome: 'Fazzoletto', descrizione: 'TOVAGLIOLO MARA N. 12.000',
    quantita: '1,00', imponibile: '60,00', aliquotaIva: 22,
  }]
  const materiali = (m) => smistaBolla(RIGHE).materiali && prezziMaterialiDaBolla(m, smistaBolla(RIGHE).materiali)

  it('riempie i materiali che un prezzo non ce l\'hanno', () => {
    const { vuoti, diversi } = materiali([{ nome: 'Coppetta', costo: null }, { nome: 'Fazzoletto', costo: '' }])
    expect(vuoti.map(v => v.nome).sort()).toEqual(['Coppetta', 'Fazzoletto'])
    expect(diversi).toEqual([])
    expect(vuoti.find(v => v.nome === 'Coppetta').costo).toBeCloseTo(0.08, 6)
  })

  it('e mostra, senza toccarlo, quello che un prezzo ce l\'ha già', () => {
    // È il segnaposto vero del design partner: 0,002 € per la coppetta.
    const { vuoti, diversi } = materiali([{ nome: 'Coppetta', costo: 0.002 }])
    expect(vuoti).toEqual([])
    expect(diversi).toHaveLength(1)
    expect(diversi[0]).toMatchObject({ nome: 'Coppetta', attuale: 0.002 })
    expect(diversi[0].costo).toBeCloseTo(0.08, 6)
  })

  it('un materiale che nell\'elenco non c\'è si propone come nuovo', () => {
    const { nuovi } = materiali([])
    expect(nuovi.map(n => n.nome).sort()).toEqual(['Coppetta', 'Fazzoletto'])
  })

  it('e un prezzo identico non è un cambio', () => {
    const { vuoti, diversi } = materiali([{ nome: 'Coppetta', costo: 0.08 }, { nome: 'Fazzoletto', costo: 0.005 }])
    expect(vuoti).toEqual([])
    expect(diversi).toEqual([])
  })

  it('il nome si riconosce anche scritto con maiuscole e spazi diversi', () => {
    const { vuoti } = materiali([{ nome: '  COPPETTA  ', costo: null }])
    expect(vuoti).toHaveLength(1)
    expect(vuoti[0].nome).toBe('  COPPETTA  ')
  })

  it('una riga senza costo per pezzo non propone niente', () => {
    // Metà delle bolle non ha prezzi: i pezzi si contano, il costo no.
    const senzaPrezzo = smistaBolla([{ nome: 'Coppetta', descrizione: 'COPPETTA BIO 16/B MARA N.250', quantita: '9,00', aliquotaIva: 22 }])
    const r = prezziMaterialiDaBolla([{ nome: 'Coppetta', costo: null }], senzaPrezzo.materiali)
    expect(r.vuoti).toEqual([])
    expect(r.nuovi).toEqual([])
  })

  it('e niente cade su dati storti', () => {
    for (const s of [null, undefined, 'ciao', 42, {}]) {
      expect(() => prezziMaterialiDaBolla(s, s)).not.toThrow()
    }
  })
})
