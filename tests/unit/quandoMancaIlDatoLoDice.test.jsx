// @vitest-environment happy-dom
//
// Un dato che manca non si scrive come se fosse zero.
//
// Audit del 16/09/2026, agente «PAGINE». Girando le pagine che si aprono da
// dentro un'altra pagina — quelle che nessuno apre per caso, e che quindi
// nessuno aveva mai guardato vuote — sono usciti tre modi diversi di dire
// zero al posto di «non lo so»:
//
//  1. **Nuova ricetta, senza nemmeno un ingrediente.** Bastava scrivere un
//     prezzo di vendita perché la pagina si accendesse: usciva il semaforo
//     giallo «Manca il costo di qualche ingrediente» con sotto «**0**
//     ingredienti sono senza prezzo» — un allarme su zero cose — e il
//     pannello del prezzo diceva **prezzo minimo 0,00 €**. Cioè: questa
//     torta la puoi regalare. Un food cost che non si conosce non è gratis.
//
//  2. **Semilavorati senza ricettario.** La scheda si apriva su niente:
//     titolo, striscia delle schede, e sotto il vuoto. Il Ricettario, nella
//     stessa identica condizione, il riquadro «Carica il ricettario» ce
//     l'aveva; questa pagina no. (`Dashboard.jsx`, il ramo `ricettario&&`.)
//
//  3. **Costi fissi a tabella vuota.** «COSTO MENSILE TOTALE 0 €», «COSTO
//     ANNUO STIMATO 0 €». Due bugie su tre riquadri: affitto e utenze
//     esistono comunque, e quel numero non resta lì — i costi fissi entrano
//     nel P&L, quindi il conto economico usciva sbagliato senza un segnale.
//
// Più un quarto difetto della stessa famiglia ma dal lato opposto: una cosa
// che c'è e non si vede. **La giornata del dipendente** aveva cinque
// pulsantoni e il commento in cima al file ne dichiarava sei. Il 15/09 il
// titolare ha deciso che è il dipendente a scaricare il furgone, e
// `trasferimenti` è entrato nelle sue pagine: ma questa schermata — che per
// chi sta in laboratorio col tablet È la navigazione — era rimasta com'era.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {},
}))
vi.mock('../../src/lib/costiAziendali', async () => {
  const vero = await vi.importActual('../../src/lib/costiAziendali')
  return { ...vero, caricaCostiAziendali: async () => [], salvaVoceCosto: async () => {}, eliminaVoceCosto: async () => {} }
})

const { default: NuovaRicettaView } = await import('../../src/views/NuovaRicettaView.jsx')
const { default: CostiAziendaliView } = await import('../../src/views/CostiAziendaliView.jsx')
const { default: HomeDipendente } = await import('../../src/views/HomeDipendente.jsx')

// Una ricetta con il prezzo di vendita già messo e **nessun ingrediente**: è
// lo stato di chi apre «Nuova ricetta» e comincia dal prezzo, che è come
// comincia quasi sempre un pasticcere.
const SENZA_INGREDIENTI = {
  ricette: { 'TORTA NUOVA': { nome: 'TORTA NUOVA', ingredienti: [], unita: 8, prezzo: 5, tipo: 'fetta' } },
  ingredienti_costi: {},
}
// La stessa ricetta con due ingredienti, di cui uno senza prezzo: è il caso
// per cui l'avviso giallo era stato scritto, e deve continuare a funzionare.
const UNO_SENZA_PREZZO = {
  ricette: { 'TORTA NUOVA': { nome: 'TORTA NUOVA', unita: 8, prezzo: 5, tipo: 'fetta',
    ingredienti: [{ nome: 'burro', qty1stampo: 200 }, { nome: 'vaniglia del madagascar', qty1stampo: 5 }] } },
  ingredienti_costi: { burro: { costoKg: 9.4, costoG: 0.0094 } },
}

const props = { notify: () => {}, onSave: () => {}, onEditConsumed: () => {}, tipoAttivita: 'pasticceria' }

describe('nuova ricetta — senza ingredienti non dice «zero»', () => {
  beforeEach(cleanup)

  it('non inventa un prezzo minimo di 0,00 €', () => {
    const { container } = render(
      <NuovaRicettaView ricettario={SENZA_INGREDIENTI} editingRicetta="TORTA NUOVA" {...props} />)
    const testo = container.textContent
    expect(testo).toContain('Il prezzo minimo si calcola dal food cost')
    expect(testo, 'il prezzo minimo non può essere 0,00 €').not.toMatch(/prezzo minimo[^.]{0,40}0,00 €/i)
  })

  it('non dà l\'allarme «0 ingredienti sono senza prezzo»', () => {
    const { container } = render(
      <NuovaRicettaView ricettario={SENZA_INGREDIENTI} editingRicetta="TORTA NUOVA" {...props} />)
    const testo = container.textContent
    expect(testo, 'un avviso su zero cose').not.toContain('0 ingredienti sono senza prezzo')
    expect(testo).toContain('Ancora nessun ingrediente')
    expect(testo).toContain('finché non ci sono, il food cost non si può dire')
  })

  it('ma con un ingrediente senza prezzo l\'avviso torna, e conta bene', () => {
    // Quello che c'è intorno: la correzione non deve spegnere l'allarme vero.
    const { container } = render(
      <NuovaRicettaView ricettario={UNO_SENZA_PREZZO} editingRicetta="TORTA NUOVA" {...props} />)
    const testo = container.textContent
    expect(testo).toContain('1 ingrediente è senza prezzo')
    expect(testo).not.toContain('Ancora nessun ingrediente')
  })

  it('e il semaforo non dà mai un verdetto quando non sa il costo', () => {
    for (const ric of [SENZA_INGREDIENTI, UNO_SENZA_PREZZO]) {
      cleanup()
      const { container } = render(
        <NuovaRicettaView ricettario={ric} editingRicetta="TORTA NUOVA" {...props} />)
      const testo = container.textContent
      expect(testo, 'verdetto dato senza sapere il food cost').not.toMatch(/Food cost 0,0\s?%/)
    }
  })
})

describe('costi fissi — a tabella vuota non scrive 0 €', () => {
  beforeEach(cleanup)

  it('i tre riquadri dicono «-», non zero euro', async () => {
    const { container } = render(<CostiAziendaliView orgId="org-1" sedeId="s1" sedi={[{ id: 's1', nome: 'Corso Vittorio' }]} notify={() => {}} />)
    await new Promise(r => setTimeout(r, 30))
    const testo = container.textContent
    expect(testo, 'un costo mensile di 0 € è una bugia: affitto e utenze esistono')
      .not.toMatch(/COSTO MENSILE TOTALE\s*0\s?€/i)
    expect(testo).not.toMatch(/COSTO ANNUO STIMATO\s*0\s?€/i)
  })
})

describe('la giornata del dipendente — la merce arrivata si vede', () => {
  beforeEach(cleanup)
  const dip = { user: { email: 'luca@maradeiboschi.com' }, isInventario: false, setView: () => {}, notify: () => {} }
  const due = [{ id: 's1', nome: 'Corso Vittorio', attiva: true }, { id: 's2', nome: 'Berthollet', attiva: true }]

  it('con due negozi c\'è il pulsantone per confermare cosa è sceso dal furgone', () => {
    const { container } = render(<HomeDipendente {...dip} sedi={due} sedeAttiva={due[0]} />)
    expect(container.textContent).toContain('Merce')
    expect(container.textContent).toContain('sceso dal furgone')
  })

  it('con un negozio solo non compare: sarebbe un pulsante verso il vuoto', () => {
    const { container } = render(<HomeDipendente {...dip} sedi={[due[0]]} sedeAttiva={due[0]} />)
    expect(container.textContent).not.toContain('sceso dal furgone')
  })

  it('i pulsantoni portano solo su pagine che il dipendente può aprire', async () => {
    // Quello che c'è intorno: è già successo una volta. L'HACCP era il quinto
    // pulsante, la pagina è stata nascosta il 09/09, e il pulsante è rimasto
    // lì a portare su uno schermo bianco fino al 14/09.
    const { VISTE_DIPENDENTE } = await import('../../src/lib/menuFoodos')
    const src = leggi('src/views/HomeDipendente.jsx')
    const dentroAzioni = src.slice(src.indexOf('const azioni = useMemo'), src.indexOf('function vai('))
    const destinazioni = [...dentroAzioni.matchAll(/^\s*id: (?:isInventario \? )?'([a-z0-9-]+)'(?: : '([a-z0-9-]+)')?/gm)]
      .flatMap(m => [m[1], m[2]]).filter(Boolean)
    expect(destinazioni.length, 'nessun pulsantone trovato: il test non sta guardando niente').toBeGreaterThan(4)
    for (const d of destinazioni) {
      expect(VISTE_DIPENDENTE.has(d), `il pulsantone "${d}" porta su una pagina che il dipendente non può aprire`).toBe(true)
    }
  })
})

describe('semilavorati senza ricettario — non è più uno schermo bianco', () => {
  it('il Dashboard disegna il riquadro che spiega, come fa per il Ricettario', () => {
    const dash = leggi('src/Dashboard.jsx')
    expect(dash, 'manca il ramo per il ricettario assente')
      .toMatch(/\{!ricettario&&vista==="semilavorati"&&\(/)
    expect(dash).toMatch(/Prima serve il \{LEX\.Ricettario\.toLowerCase\(\)\}/)
    // E il pulsante che riporta dove si carica, con la misura di un dito.
    const pezzo = dash.slice(dash.indexOf('{!ricettario&&vista==="semilavorati"'))
      .slice(0, 1400)
    expect(pezzo).toMatch(/setView\("ricettario"\)/)
    expect(pezzo, 'il pulsante è sotto i 44px').toMatch(/minHeight:44/)
  })
})
