// @vitest-environment happy-dom
//
// ── Lo Storico diceva cose che non sapeva ─────────────────────────────────
//
// Tre difetti, trovati il 20/09/2026 guardando i dati veri del design partner
// (Mara dei Boschi) invece del codice.
//
// 1. UN VALORE CHE MANCA NON È ZERO. Nel suo storico c'è una sessione nata da
//    un evento (un compleanno del 30 settembre): quel percorso non calcola né
//    `fcTot` né `ricavoTot`, e la sessione li porta assenti. Lo Storico faceva
//    `s.fcTot || 0` e scriveva «Food cost 0 €», «Margine 0 €». `Number(null)`
//    fa 0 e `Number.isFinite(0)` è vero: il controllo va fatto PRIMA di
//    convertire. Food cost zero non vuol dire gratis, vuol dire che non lo
//    sappiamo, e sul totale in cima quella sessione abbassava la somma senza
//    che niente lo dicesse. È il numero su cui si decidono i prezzi.
//
// 2. LE SESSIONI NEL FORMATO VECCHIO ERANO INVISIBILI. Quelle registrate qui
//    hanno `prodotti: [{nome, stampi, vendibile}]`; quelle vecchie — e tutte
//    le 142 dell'account dimostrativo — hanno `ricette: [{nome, numStampi}]`.
//    Lo Storico leggeva solo la prima forma: 142 schede vuote, «0 stampi
//    totali» in cima. È la pagina che si fa vedere a chi sta valutando il
//    programma.
//
// 3. LE DATE ERANO ISTANTI. `new Date('2026-01-01')` è mezzanotte a Greenwich,
//    non a casa di chi guarda, e `sess.data` è un GIORNO. Due conseguenze, e
//    vanno distinte perché una sola di esse si può dimostrare qui:
//
//    a) A OVEST DI GREENWICH il giorno scivola indietro: il 1° gennaio 2026
//       diventa 31/12/2025, sbagliando giorno, mese e anno insieme. Questa
//       **la suite non la prova**, e va detto invece di far finta. Il fuso dei
//       test è fissato a Europe/Rome in `vitest.config.js` — scelta del
//       16/09/2026, e giusta: Foodos lo usano pasticcerie italiane. Nei worker
//       a thread di Vitest `process.env.TZ` non si può spostare da un singolo
//       file (l'ho provato: l'assegnazione non arriva a V8). Le prove sui
//       giorni qui sotto sono quindi una rete di sicurezza sul formato, non la
//       dimostrazione di quel difetto.
//    b) UNA DATA CHE NON È UNA DATA diventava «Invalid Date» stampato a
//       schermo, in ora italiana come dovunque. Questa si prova, ed è quella
//       che un pasticcere vedrebbe davvero.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const scritte = { mag: null, gior: null }
const scarti = []

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {},
  ssaveBatch: async (voci) => {
    for (const v of (voci || [])) {
      if (v.key === 'pasticceria-magazzino-v1') scritte.mag = v.value
      if (v.key === 'pasticceria-giornaliero-v1') scritte.gior = v.value
    }
  },
  sload: async () => null, sloadAllSedi: async () => ({}),
}))
function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/stockPF', () => ({
  caricoProduzionePF: async () => ({ ok: true }),
  scartoPF: async (arg) => { scarti.push(arg); return { ok: true } },
}))
vi.mock('../../src/lib/trasferimenti', () => ({ creaTrasferimento: async () => ({ ok: true }) }))

const { default: Produzione } = await import('../../src/views/ProduzioneGiornalieraView.jsx')

const ricettario = {
  ricette: {
    ABIS: { nome: 'ABIS', tipo: 'gusto', unita: 6, prezzo: 3,
      ingredienti: [{ nome: 'latte di avena', qty1stampo: 650 }] },
    'BANANA BREAD': { nome: 'BANANA BREAD', tipo: 'fetta', unita: 11, prezzo: 4,
      ingredienti: [{ nome: 'farina 00', qty1stampo: 400 }] },
  },
  ingredienti_costi: {
    'latte di avena': { costoKg: 2, costoG: 0.002 }, 'farina 00': { costoKg: 0.95, costoG: 0.00095 },
  },
}
const magazzino = {
  'latte di avena': { nome: 'latte di avena', giacenza_g: 30000, soglia_g: 0 },
  'farina 00': { nome: 'farina 00', giacenza_g: 30000, soglia_g: 0 },
}

// Le due sessioni vere di Mara dei Boschi, copiate dal database il 20/09/2026.
const sessioneDaEvento = {
  id: 'g-evento-hnop3x43mu3515iv-1789505006940',
  data: '2026-09-30',
  note: "Per l'evento: senza nome (Compleanno Alessandro)",
  daEvento: 'hnop3x43mu3515iv',
  prodotti: [{ nome: 'ABIS', stampi: 1, vendibile: 1, congelabile: false }],
  // Niente fcTot, niente ricavoTot, niente ingredientiUsati: è il dato vero.
}
const sessioneNormale = {
  id: 'g-1788256620128', data: '2026-09-01', note: '',
  fcTot: 2.417, ricavoTot: 18,
  prodotti: [{ nome: 'ABIS', stampi: 1, vendibile: 1, congelabile: false }],
  ingredientiUsati: { 'latte di avena': 650 },
  scalatoPerChiave: { 'latte di avena': 650 },
  destinazioneSedeId: null, destinazioneSedeNome: null,
}

const props = {
  ricettario, magazzino, setMagazzino: () => {}, giornaliero: [], setGiornaliero: () => {},
  notify: () => {}, sedi: [{ id: 's1', nome: 'Torino', attiva: true }],
  sedeAttiva: { id: 's1', nome: 'Torino' }, orgId: 'org-1', sedeId: 's1',
}

beforeEach(() => { scritte.mag = null; scritte.gior = null; scarti.length = 0; cleanup() })

async function apriStorico(giornaliero) {
  const v = render(<Produzione {...props} giornaliero={giornaliero} />)
  await waitFor(() => expect(v.container.textContent).toContain('ABIS'))
  fireEvent.click([...v.container.querySelectorAll('button')].find(b => /^Storico$/.test(b.textContent.trim())))
  // Il righello: si aspetta che lo Storico abbia disegnato i suoi KPI, non che
  // la linguetta sia stata premuta.
  await waitFor(() => expect(v.container.textContent).toContain('Sessioni'))
  return v
}

describe('il righello: che cosa può misurare questa suite', () => {
  it('i test girano in ora italiana, e lì il giorno non scivola', () => {
    // Verifica dichiarata, non nascosta: in Europe/Rome le due forme danno lo
    // stesso giorno, quindi le prove qui sotto NON dimostrano il difetto del
    // fuso. Se un giorno la suite girasse a ovest di Greenwich, questa riga
    // cadrebbe e direbbe a chi legge che la situazione è cambiata.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Rome')
    expect(new Date('2026-01-01').toLocaleDateString('it-IT')).toBe('01/01/2026')
  })
})

describe('storico — un numero che manca si dice, non si inventa', () => {
  it('la sessione senza food cost scrive un trattino, non «0 €»', async () => {
    const v = await apriStorico([sessioneDaEvento])
    expect(v.container.textContent).toContain('—')
    expect(v.container.textContent).not.toContain('0 €')
  })

  it('una sessione che il food cost ce l\'ha lo mostra', async () => {
    const v = await apriStorico([sessioneNormale])
    expect(v.container.textContent).toContain('2 €')
  })

  it('un food cost VERAMENTE zero resta zero: lo zero è una risposta', async () => {
    const gratis = { ...sessioneNormale, id: 'g-0', fcTot: 0, ricavoTot: 0 }
    const v = await apriStorico([gratis])
    expect(v.container.textContent).toContain('0 €')
  })

  it('il totale dichiara su quante sessioni è fatto', async () => {
    const v = await apriStorico([sessioneDaEvento, sessioneNormale])
    expect(v.container.textContent).toContain('su 1 sessione su 2')
  })

  it('con tutti i numeri a posto non dice niente di strano', async () => {
    const v = await apriStorico([sessioneNormale, { ...sessioneNormale, id: 'g-2' }])
    expect(v.container.textContent).toContain('somma sessioni')
    expect(v.container.textContent).not.toContain('sessioni su 2')
  })

  it('il margine complessivo è un trattino se manca un pezzo', async () => {
    const v = await apriStorico([sessioneDaEvento, sessioneNormale])
    expect(v.container.textContent).toContain('manca il costo o il ricavo di qualche sessione')
  })

  it('se nessuna sessione porta il numero lo dice a parole', async () => {
    const v = await apriStorico([sessioneDaEvento])
    expect(v.container.textContent).toContain('nessuna sessione lo riporta')
  })

  it('il totale non somma come zero quello che non sa', async () => {
    // Due sessioni, una sola col food cost: il totale deve essere quello
    // dell'unica che lo porta, e va detto.
    const v = await apriStorico([sessioneDaEvento, sessioneNormale])
    expect(v.container.textContent).toContain('2 €')
    expect(v.container.textContent).toContain('su 1 sessione su 2')
  })

  it('la spiegazione del trattino è a portata di mouse', async () => {
    const v = await apriStorico([sessioneDaEvento])
    const conSpiegazione = [...v.container.querySelectorAll('[title]')]
      .filter(e => /non porta questo numero/i.test(e.getAttribute('title')))
    expect(conSpiegazione.length).toBeGreaterThan(0)
  })
})

describe('storico — le sessioni nel formato vecchio si vedono', () => {
  const vecchia = {
    id: 'demo-gior-2026-03-23-0', data: '2026-03-23', _demo: true,
    note: '[Demo] Sessione mattino',
    ricette: [
      { nome: 'ABIS', numStampi: 2, _demo: true },
      { nome: 'BANANA BREAD', numStampi: 3, _demo: true },
    ],
  }

  it('gli stampi totali non sono più zero', async () => {
    const v = await apriStorico([vecchia])
    // 2 + 3 = 5 stampi. Prima: «0 stampi totali».
    expect(v.container.textContent).toContain('5 stampi totali')
  })

  it('i prodotti compaiono nella scheda', async () => {
    const v = await apriStorico([vecchia])
    expect(v.container.textContent).toContain('2× ABIS')
    expect(v.container.textContent).toContain('3× BANANA BREAD')
  })

  it('e il numero di stampi della sessione è quello giusto', async () => {
    const v = await apriStorico([vecchia])
    const etichetta = [...v.container.querySelectorAll('div')].find(d => d.textContent.trim() === 'Stampi')
    expect(etichetta).toBeTruthy()
    expect(etichetta.nextSibling.textContent.trim()).toBe('5')
  })

  it('il formato nuovo continua a vincere quando c\'è', async () => {
    const mista = { ...vecchia, prodotti: [{ nome: 'ABIS', stampi: 9, vendibile: 9 }] }
    const v = await apriStorico([mista])
    expect(v.container.textContent).toContain('9 stampi totali')
  })

  it('una sessione vecchia non ha caricato niente in vetrina, quindi eliminarla non scarta', async () => {
    const v = await apriStorico([vecchia])
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Elimina$/.test(b.textContent.trim())))
    const campo = await waitFor(() => {
      const c = v.container.querySelector('input[placeholder="ELIMINA"]')
      expect(c).toBeTruthy(); return c
    })
    fireEvent.change(campo, { target: { value: 'ELIMINA' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Elimina e reintegra/i.test(b.textContent)))
    await waitFor(() => expect(scritte.gior).toBeTruthy(), { timeout: 3000 })
    expect(scarti).toHaveLength(0)
  })

  it('anche la finestra di conferma elenca i prodotti del formato vecchio', async () => {
    const v = await apriStorico([vecchia])
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Elimina$/.test(b.textContent.trim())))
    await waitFor(() => expect(v.container.querySelector('input[placeholder="ELIMINA"]')).toBeTruthy())
    const finestra = v.container.querySelector('input[placeholder="ELIMINA"]').closest('div[style*="border-radius"]')
      || v.container
    expect(finestra.textContent).toContain('2× ABIS')
  })
})

describe('storico — una produzione di domani si dichiara', () => {
  // Nello storico vero di Mara dei Boschi c'è una sessione datata 30 settembre
  // registrata il 15: arriva dal modulo Eventi, che il tetto del campo data
  // (`max` = oggi) non ce l'ha. Una produzione non ancora fatta, letta come
  // le altre, gonfia il ricavo e il food cost del periodo.
  const domani = new Date(Date.now() + 5 * 86400000)
  const giornoAvanti = `${domani.getFullYear()}-${String(domani.getMonth() + 1).padStart(2, '0')}-${String(domani.getDate()).padStart(2, '0')}`

  it('una sessione datata avanti porta scritto «In programma»', async () => {
    const v = await apriStorico([{ ...sessioneNormale, id: 'g-futura', data: giornoAvanti }])
    expect(v.container.textContent).toContain('In programma')
  })

  it('una sessione di ieri no', async () => {
    const ieri = new Date(Date.now() - 86400000)
    const g = `${ieri.getFullYear()}-${String(ieri.getMonth() + 1).padStart(2, '0')}-${String(ieri.getDate()).padStart(2, '0')}`
    const v = await apriStorico([{ ...sessioneNormale, id: 'g-ieri', data: g }])
    expect(v.container.textContent).not.toContain('In programma')
  })

  it('e nemmeno una di oggi: il confine è oggi compreso', async () => {
    const oggi = new Date()
    const g = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
    const v = await apriStorico([{ ...sessioneNormale, id: 'g-oggi', data: g }])
    expect(v.container.textContent).not.toContain('In programma')
  })
})

describe('storico — le date sono giorni, non istanti', () => {
  it('il 1° gennaio resta il 1° gennaio', async () => {
    const capodanno = { ...sessioneNormale, id: 'g-cap', data: '2026-01-01' }
    const v = await apriStorico([capodanno])
    expect(v.container.textContent).toContain('01/01/2026')
    expect(v.container.textContent).not.toContain('31/12/2025')
  })

  it('il giorno della settimana segue la data giusta', async () => {
    // Il 1° gennaio 2026 è un giovedì. Letto come 31/12/2025 sarebbe mercoledì.
    const capodanno = { ...sessioneNormale, id: 'g-cap', data: '2026-01-01' }
    const v = await apriStorico([capodanno])
    expect(v.container.textContent.toLowerCase()).toContain('giovedì')
  })

  it('il primo del mese non scivola nel mese prima', async () => {
    const primoMarzo = { ...sessioneNormale, id: 'g-mar', data: '2026-03-01' }
    const v = await apriStorico([primoMarzo])
    expect(v.container.textContent).toContain('01/03/2026')
  })

  it('il 29 febbraio di un anno bisestile si legge come tale', async () => {
    const bisestile = { ...sessioneNormale, id: 'g-bis', data: '2028-02-29' }
    const v = await apriStorico([bisestile])
    expect(v.container.textContent).toContain('29/02/2028')
  })

  it('una data che non c\'è diventa un trattino, non «Invalid Date»', async () => {
    const rotta = { ...sessioneNormale, id: 'g-rotta', data: null }
    const v = await apriStorico([rotta])
    expect(v.container.textContent).not.toContain('Invalid Date')
    expect(v.container.textContent).toContain('—')
  })

  it('e nemmeno una data scritta storta stampa «Invalid Date»', async () => {
    const storta = { ...sessioneNormale, id: 'g-storta', data: 'trenta settembre' }
    const v = await apriStorico([storta])
    expect(v.container.textContent).not.toContain('Invalid Date')
  })

  it('«Invalid Date» non compare nemmeno nella finestra di eliminazione', async () => {
    const rotta = { ...sessioneNormale, id: 'g-rotta', data: null }
    const v = await apriStorico([rotta])
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Elimina$/.test(b.textContent.trim())))
    await waitFor(() => expect(v.container.querySelector('input[placeholder="ELIMINA"]')).toBeTruthy())
    expect(v.container.textContent).not.toContain('Invalid Date')
  })

  it('anche la finestra di eliminazione scrive la data giusta', async () => {
    const capodanno = { ...sessioneNormale, id: 'g-cap', data: '2026-01-01' }
    const v = await apriStorico([capodanno])
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Elimina$/.test(b.textContent.trim())))
    await waitFor(() => expect(v.container.querySelector('input[placeholder="ELIMINA"]')).toBeTruthy())
    expect(v.container.textContent).toContain('1 gennaio 2026')
    expect(v.container.textContent).not.toContain('dicembre 2025')
  })
})
