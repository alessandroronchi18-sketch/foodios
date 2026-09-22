// ── Meno viaggi, più pieni, senza lasciare il banco scoperto ────────────
//
// Il titolare, 23/09/2026: «si perde un sacco di tempo e un sacco di risorse
// con i trasferimenti da sede. Magari i trasferimenti vengono fatti anche
// tutti i giorni ma solo per un kg di gelato o per poche materie prime».
//
// ── Il quadro, misurato ──────────────────────────────────────────────────
//
// Non è un laboratorio che rifornisce tre punti vendita: **tutte e tre le
// sedi producono** (verificato in produzione: `sedi.is_sede_produzione` vero
// per Carlina, Berthollet e De Gasperi). Quindi un viaggio nasce da uno
// squilibrio, e le cause sono tre — due sono errori di previsione, una no:
// «magari un gusto lo si fa solo in un posto tipo Carlina e poi lo si
// smista». Quei viaggi ci saranno sempre, ma sono **prevedibili**.
//
// ── Le regole scelte ─────────────────────────────────────────────────────
//
// Giorni fissi, e in mezzo si esce solo se un gusto finisce davvero. E chi
// guida «non sempre» ci andrebbe comunque: quindi il costo di un viaggio non
// è una costante, e le due situazioni vanno trattate in modo diverso.
import { describe, it, expect } from 'vitest'
import {
  prossimoGiro, giorniDiCopertura, puoAspettare, decidiGiro,
  dividiProduzione, GIORNI, MINUTI_VIAGGIO,
} from '../../src/lib/giriTrasferimenti.js'

// Martedì 22 settembre 2026. Giri fissi il martedì e il venerdì.
const MARTEDI = '2026-09-22'
const MERCOLEDI = '2026-09-23'
const FISSI = [2, 5]

describe('Quando passa il prossimo giro', () => {
  it('se oggi è giorno di giro, è oggi', () => {
    expect(prossimoGiro(MARTEDI, FISSI)).toMatchObject({ giorno: MARTEDI, fraQuanti: 0, nome: 'martedì' })
  })

  it('il mercoledì, il prossimo è venerdì: fra due giorni', () => {
    expect(prossimoGiro(MERCOLEDI, FISSI)).toMatchObject({ giorno: '2026-09-25', fraQuanti: 2, nome: 'venerdì' })
  })

  it('e si può chiedere il prossimo escludendo oggi', () => {
    expect(prossimoGiro(MARTEDI, FISSI, { oggiVale: false })).toMatchObject({ fraQuanti: 3, nome: 'venerdì' })
  })

  it('con un giorno solo, gira la settimana', () => {
    // Giro il lunedì: da mercoledì si aspetta cinque giorni.
    expect(prossimoGiro(MERCOLEDI, [1])).toMatchObject({ fraQuanti: 5, nome: 'lunedì' })
  })

  it('senza giorni impostati non si inventa un giro', () => {
    expect(prossimoGiro(MARTEDI, [])).toBe(null)
    expect(prossimoGiro(MARTEDI, null)).toBe(null)
    expect(prossimoGiro('boh', FISSI)).toBe(null)
  })

  it('e i giorni scritti male si scartano, gli altri valgono', () => {
    expect(prossimoGiro(MERCOLEDI, [2, 9, -1, 'venerdì', 5])).toMatchObject({ nome: 'venerdì' })
    expect(GIORNI[5]).toBe('venerdì')
  })
})

describe('Per quanti giorni basta quello che c\'è', () => {
  it('sei chili con due al giorno fanno tre giorni', () => {
    expect(giorniDiCopertura({ giacenza: 6, consumoGiornaliero: 2 })).toBe(3)
  })

  it('zero in vetrina fa zero giorni', () => {
    expect(giorniDiCopertura({ giacenza: 0, consumoGiornaliero: 2 })).toBe(0)
  })

  it('senza consumo non si sa, e «non si sa» non è zero', () => {
    // Confonderli qui vuol dire o far uscire il furgone per niente, o
    // lasciare il banco vuoto.
    expect(giorniDiCopertura({ giacenza: 6 })).toBe(null)
    expect(giorniDiCopertura({ giacenza: 6, consumoGiornaliero: 0 })).toBe(null)
    expect(giorniDiCopertura({})).toBe(null)
  })
})

describe('Questa cosa può aspettare il prossimo giro?', () => {
  const giro = prossimoGiro(MERCOLEDI, FISSI)   // venerdì, fra 2 giorni

  it('sì, se copre più del tempo che manca', () => {
    const d = puoAspettare({ giacenza: 8, consumoGiornaliero: 2 }, giro)   // 4 giorni
    expect(d.aspetta).toBe(true)
    expect(d.perche).toMatch(/copre ancora 4 giorni/)
  })

  it('no, se non ci arriva', () => {
    const d = puoAspettare({ giacenza: 2, consumoGiornaliero: 2 }, giro)   // 1 giorno
    expect(d.aspetta).toBe(false)
    expect(d.perche).toMatch(/non ci arriva/)
  })

  it('e nemmeno se ci arriva **esatto**: serve un giorno di margine', () => {
    // Fra «lo vedo scendere» e «il banco è vuoto a metà pomeriggio» passa
    // mezza giornata, ed è lì che il danno si fa davvero.
    const d = puoAspettare({ giacenza: 4, consumoGiornaliero: 2 }, giro)   // esattamente 2
    expect(d.aspetta).toBe(false)
  })

  it('se è già finito, no di sicuro', () => {
    expect(puoAspettare({ giacenza: 0, consumoGiornaliero: 2 }, giro)).toMatchObject({ aspetta: false, perche: 'è già finito' })
  })

  it('e se non si sa quanto se ne consuma, si chiede invece di indovinare', () => {
    const d = puoAspettare({ giacenza: 8 }, giro)
    expect(d.aspetta).toBe(null)
    expect(d.perche).toMatch(/dimmelo tu/)
  })

  it('senza giri fissi non si può dire niente', () => {
    expect(puoAspettare({ giacenza: 8, consumoGiornaliero: 2 }, null).aspetta).toBe(null)
  })
})

describe('Cosa fare adesso, vista tutta la lista', () => {
  const giro = prossimoGiro(MERCOLEDI, FISSI)   // venerdì, fra 2
  const PISTACCHIO = { prodotto: 'Pistacchio', quantita: 3, unita: 'kg', valore: 90, giacenza: 1, consumoGiornaliero: 2 }
  const FIORDILATTE = { prodotto: 'Fiordilatte', quantita: 2, unita: 'kg', valore: 50, giacenza: 10, consumoGiornaliero: 2 }

  it('se niente è urgente, si aspetta il giro e si dice perché', () => {
    const d = decidiGiro([FIORDILATTE], { giro })
    expect(d.azione).toBe('aspetta')
    expect(d.frase).toMatch(/venerdì/)
    expect(d.frase).toMatch(new RegExp(`${MINUTI_VIAGGIO} minuti`))
  })

  it('se qualcosa non ci arriva, si esce — e si porta anche il resto', () => {
    // È il punto: una volta che esci, il mezzo chilo costa zero.
    const d = decidiGiro([PISTACCHIO, FIORDILATTE], { giro })
    expect(d.azione).toBe('esci-adesso')
    expect(d.urgenti.map(r => r.prodotto)).toEqual(['Pistacchio'])
    expect(d.rimandabili.map(r => r.prodotto)).toEqual(['Fiordilatte'])
    expect(d.frase).toMatch(/90 € di merce/)
    expect(d.frase).toMatch(/già che vai porta anche il resto/)
  })

  it('e se qualcuno sta già andando, si porta tutto senza nessuna soglia', () => {
    // «Non sempre» ci andrebbe comunque: quando ci va, il viaggio è già
    // pagato e anche il mezzo chilo conviene.
    const d = decidiGiro([FIORDILATTE], { giro, staGiaAndando: true })
    expect(d.azione).toBe('porta-tutto')
    expect(d.frase).toMatch(/Il viaggio lo fai comunque/)
  })

  it('il valore si somma solo se si sa per tutte: mezzo conto non è un conto', () => {
    const d = decidiGiro([PISTACCHIO, { ...PISTACCHIO, prodotto: 'Nocciola', valore: undefined }], { giro })
    expect(d.valoreUrgente).toBe(null)
    expect(d.frase).not.toMatch(/€ di merce/)
  })

  it('quello che non si sa si mette da parte e si chiede', () => {
    const d = decidiGiro([{ prodotto: 'Cioccolato', quantita: 1, giacenza: 5 }], { giro })
    expect(d.azione).toBe('aspetta')
    expect(d.incerte).toHaveLength(1)
    expect(d.frase).toMatch(/non so quanto se ne consuma/)
  })

  it('e con la lista vuota non si dice niente', () => {
    expect(decidiGiro([], { giro }).azione).toBe('niente')
    expect(decidiGiro(null, {}).azione).toBe('niente')
  })

  it('senza giri fissi lo dice, invece di fingere di sapere', () => {
    const d = decidiGiro([FIORDILATTE], {})
    expect(d.frase).toMatch(/Imposta i giorni del giro/)
  })
})

describe('Il gusto che si fa in un posto solo e si smista', () => {
  // «Magari un gusto lo si fa solo in un posto tipo Carlina e poi lo si
  // smista.» È il caso strutturale: deciderlo **quando si produce** è quello
  // che toglie i viaggi, perché la roba parte già divisa.
  const QUOTE = [
    { sedeId: 'carlina', quota: 5 },
    { sedeId: 'berthollet', quota: 3 },
    { sedeId: 'gasperi', quota: 2 },
  ]

  it('dieci chili si dividono cinque, tre e due', () => {
    const { per, resto } = dividiProduzione(10, QUOTE)
    expect(per.map(p => p.quantita)).toEqual([5, 3, 2])
    expect(resto).toBe(0)
  })

  it('le quote sono pesi, non percentuali: si scrivono come vengono', () => {
    const { per } = dividiProduzione(10, [{ sedeId: 'a', quota: 1 }, { sedeId: 'b', quota: 1 }])
    expect(per.map(p => p.quantita)).toEqual([5, 5])
  })

  it('l\'arrotondamento va in giù, e quello che avanza resta dove si produce', () => {
    // Mezzo etto in più a un negozio è mezzo etto in meno a un altro, e chi
    // lo pesa se ne accorge. Meglio che avanzi dove è stato fatto.
    const { per, resto } = dividiProduzione(10, [
      { sedeId: 'a', quota: 1 }, { sedeId: 'b', quota: 1 }, { sedeId: 'c', quota: 1 },
    ])
    expect(per.map(p => p.quantita)).toEqual([3.3, 3.3, 3.3])
    expect(resto).toBeCloseTo(0.1, 3)
  })

  it('senza quote non si divide niente, e il totale resta tutto lì', () => {
    expect(dividiProduzione(10, [])).toEqual({ per: [], resto: 10 })
    expect(dividiProduzione(10, null)).toEqual({ per: [], resto: 10 })
  })

  it('e una quota a zero o negativa non prende niente', () => {
    const { per } = dividiProduzione(10, [{ sedeId: 'a', quota: 1 }, { sedeId: 'b', quota: 0 }, { sedeId: 'c', quota: -3 }])
    expect(per.map(p => p.sedeId)).toEqual(['a'])
    expect(per[0].quantita).toBe(10)
  })
})

describe('Il righello di questo file', () => {
  it('niente cade su dati storti', () => {
    for (const s of [null, undefined, 'ciao', 42, {}, []]) {
      expect(() => prossimoGiro(s, s)).not.toThrow()
      expect(() => giorniDiCopertura(s)).not.toThrow()
      expect(() => puoAspettare(s, s)).not.toThrow()
      expect(() => decidiGiro(s, s)).not.toThrow()
      expect(() => dividiProduzione(s, s)).not.toThrow()
    }
  })

  it('e le prove saprebbero accorgersi se il margine sparisse', () => {
    // Taratura: senza il giorno di margine, «copre esattamente due giorni e
    // il giro è fra due» diventerebbe rimandabile, e sarebbe sbagliato.
    const giro = prossimoGiro(MERCOLEDI, FISSI)
    expect(puoAspettare({ giacenza: 4, consumoGiornaliero: 2 }, giro).aspetta).toBe(false)
    expect(puoAspettare({ giacenza: 6, consumoGiornaliero: 2 }, giro).aspetta).toBe(true)
  })
})
