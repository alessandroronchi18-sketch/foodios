// La rimanenza da cui riparte la giornata, nella schermata del dipendente.
//
// Chi compila la produzione col metodo inventario scrive due numeri: quanto ha
// prodotto e quanto è rimasto. Ma il venduto si calcola come
// «rimanenza di ieri + prodotto oggi − rimanenza di oggi», e quella di ieri
// non era da nessuna parte a schermo. Si inserivano i dati alla cieca.
//
// Il punto delicato, che ha reso necessario un helper dedicato invece di
// leggere la matrice: `calcolaVendutoSettimana` copre i 7 giorni dal lunedì,
// quindi DI LUNEDÌ la domenica precedente non c'è. E allargarla a 8 giorni
// romperebbe i totali settimanali, che sommano tutte le celle — è già
// successo una volta.

import { describe, it, expect } from 'vitest'
import { rimanenzaDiPartenza, GIORNI_RIPORTO_MAX } from '../../src/lib/inventarioProduzione.js'

const riga = (gusto, data, rimanenza) => ({
  gusto_nome: gusto, data, rimanenza_g: rimanenza,
  produzione_g: 0, scarto_g: 0, spedito_g: 0,
})

describe('da quanto riparte la giornata', () => {
  it('prende la rimanenza del giorno prima', () => {
    const righe = [riga('FIORDILATTE', '2026-09-14', 3200), riga('FIORDILATTE', '2026-09-13', 900)]
    const r = rimanenzaDiPartenza(righe, '2026-09-15')
    expect(r.FIORDILATTE).toEqual({ grammi: 3200, dataIso: '2026-09-14', giorniIndietro: 1 })
  })

  it('di lunedì risale alla domenica, che è in un\'altra settimana', () => {
    // È il caso per cui questo helper esiste: la matrice settimanale, lunedì,
    // non contiene la domenica e direbbe "ieri non compilato" per sbaglio.
    const lunedi = '2026-09-14', domenica = '2026-09-13'
    const r = rimanenzaDiPartenza([riga('PISTACCHIO', domenica, 1500)], lunedi)
    expect(r.PISTACCHIO.dataIso).toBe(domenica)
    expect(r.PISTACCHIO.giorniIndietro).toBe(1)
  })

  it('se la gelateria era chiusa risale all\'ultimo giorno scritto', () => {
    // Chiusura del lunedì: martedì si riparte da domenica. Dire "ieri non è
    // stato compilato" sarebbe un falso allarme, e il venduto si calcola
    // benissimo — comprende solo due giorni invece di uno.
    const r = rimanenzaDiPartenza([riga('NOCCIOLA', '2026-09-13', 800)], '2026-09-15')
    expect(r.NOCCIOLA).toEqual({ grammi: 800, dataIso: '2026-09-13', giorniIndietro: 2 })
  })

  it('non risale all\'infinito: oltre la finestra il gusto non c\'è', () => {
    // Stessa finestra che usa il calcolo del venduto: devono dire la stessa
    // cosa, altrimenti la schermata promette un numero che il motore rifiuta.
    const troppoVecchio = '2026-08-01'
    const r = rimanenzaDiPartenza([riga('CAFFE', troppoVecchio, 500)], '2026-09-15')
    expect(r.CAFFE).toBeUndefined()
    expect(GIORNI_RIPORTO_MAX).toBe(7)
  })

  it('zero rimasto è un dato, non un dato mancante', () => {
    // "Ieri era rimasto zero" e "ieri nessuno ha scritto niente" sono due cose
    // diverse: nella prima il venduto si calcola, nella seconda no.
    const r = rimanenzaDiPartenza([riga('MENTA', '2026-09-14', 0)], '2026-09-15')
    expect(r.MENTA).toBeDefined()
    expect(r.MENTA.grammi).toBe(0)
  })

  it('più sedi sullo stesso gusto si sommano', () => {
    const righe = [riga('LIMONE', '2026-09-14', 700), riga('LIMONE', '2026-09-14', 300)]
    expect(rimanenzaDiPartenza(righe, '2026-09-15').LIMONE.grammi).toBe(1000)
  })

  it('il nome del gusto si normalizza, come ovunque', () => {
    // In produzione ci sono righe scritte "CAFFè FLORA" da un import vecchio.
    const r = rimanenzaDiPartenza([riga('caffè flora', '2026-09-14', 450)], '2026-09-15')
    expect(Object.keys(r)).toHaveLength(1)
    expect(Object.values(r)[0].grammi).toBe(450)
  })

  it('senza righe o senza data non esplode', () => {
    expect(rimanenzaDiPartenza(null, '2026-09-15')).toEqual({})
    expect(rimanenzaDiPartenza([], '2026-09-15')).toEqual({})
    expect(rimanenzaDiPartenza([riga('X', '2026-09-14', 1)], null)).toEqual({})
  })
})

describe('la schermata del dipendente la mostra', () => {
  it('accanto ai due campi, per ogni gusto', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const V = readFileSync(join(RADICE, 'src', 'views', 'InventarioSettimanaleView.jsx'), 'utf8')

    expect(V).toMatch(/rimanenzaDiPartenza\(righe, giornoOggi\)/)
    expect(V).toMatch(/rimanenzaIeri=\{rimanenzaIeri\}/)
    expect(V).toMatch(/Ieri sera ne era rimasto/)
    // E dice quando il dato non è di ieri, invece di far credere che lo sia.
    expect(V).toMatch(/Ultima rimanenza scritta/)
    expect(V).toMatch(/giorniIndietro > 1/)
  })

  it('non legge dalla matrice settimanale, che di lunedì mentirebbe', () => {
    // Guardia sul motivo per cui l'helper esiste.
    const { readFileSync } = require('node:fs')
    const V = readFileSync('src/views/InventarioSettimanaleView.jsx', 'utf8')
    expect(V).not.toMatch(/byData\[ieriIso\]/)
  })
})
