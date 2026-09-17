// @vitest-environment happy-dom
//
// Quando il dato non c'è, la pagina lo dice. Non scrive zero, e non scrive
// «Invalid Date».
//
// Audit del 16-17/09/2026, agente «PAGINE». È la regola che tiene insieme le
// sette lenti di `CLAUDE.md`: un food cost sconosciuto non è «gratis», è «non
// lo so». Il problema è che nel codice il modo di sbagliare è sempre più corto
// di quello giusto — `Number(x || 0)` e `new Date(x).toLocaleDateString()` si
// scrivono senza pensarci, e producono due bugie diverse:
//
//  • **lo zero che sembra un fatto.** «Costo mensile totale 0 €» su una
//    pasticceria che l'affitto ce l'ha; «prezzo minimo 0,00 €» su una torta di
//    cui non si conosce il food cost; «Margine 0%» su un preventivo che
//    nessuno ha ancora compilato; «Ultimo: 0 record» con la spunta verde su un
//    import riuscito. Nessuno di questi numeri è misurato: sono tutti il
//    valore che resta quando non si è misurato niente.
//
//  • **la data che diventa un guasto.** `new Date('boh').toLocaleDateString()`
//    non lancia nessun errore: restituisce la stringa «Invalid Date», in
//    inglese, e quella arriva a schermo. Sulla scheda dell'azione da fare,
//    sulla scheda dell'evento, e — via `exportPreventivoPDF` — sul preventivo
//    stampato per il cliente.
//
// Come sono stati trovati: rendendo le dieci pagine «fuori menu» con dati
// bucati, cioè nello stato di un cliente nuovo o di un dato vecchio rientrato
// da un backup. È lo stato che nessuno guarda mai, perché in demo i dati ci
// sono sempre tutti.
//
// L'ultimo `describe` è la rete della famiglia: rende tutte le mie pagine e
// controlla che nessuna lasci uscire «Invalid Date», «NaN» o «undefined».

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')
// Le righe VIVE di un file: quelle che finiscono davvero a schermo. Senza
// questo passaggio i controlli sul sorgente bocciano i commenti che RACCONTANO
// il difetto — ed è successo davvero, il 17/09/2026, su due controlli diversi.
// I blocchi `/* … */` e `{/* … */}` vanno tolti per intero: dentro, le righe di
// mezzo non cominciano con nessun segno di commento.
const righeVive = (f) => leggi(f)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(r => !/^\s*\/\//.test(r))

// Tre eventi con tre buchi diversi: una data che non si legge, un preventivo
// senza righe, e un preventivo con una riga il cui food cost non si conosce.
const EVENTI = [
  { id: 'e1', nome: 'Matrimonio Rossi', cliente: 'Rossi', data: '2026-12-99', righe: [], stato: 'confermato' },
  { id: 'e2', nome: 'Battesimo', cliente: 'Bianchi', data: '', righe: [], stato: 'confermato' },
  { id: 'e3', nome: 'Compleanno', cliente: 'Verdi', data: '2099-10-04', righe: [{ nome: 'Torta mimosa', qty: 2, prezzo: 30 }], stato: 'confermato' },
]

function fluente(res) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u', email: 'anita@maradeiboschi.com' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => fluente({ data: [], error: null }),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe() {} }) }) }),
    removeChannel: () => {},
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {},
  sload: async (k) => (k === 'pasticceria-eventi-v1' ? EVENTI : null),
  ssaveBatch: async () => {},
  sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/aiClient', () => ({ callAi: async () => ({ text: '' }) }))
// A 390px: è lì che il titolare guarda i preventivi, in negozio.
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => true, useIsTablet: () => false, useDevice: () => 'telefono',
}))

// Il righello aspetta, invece di sperare.
//
// Qui c'era `new Promise(r => setTimeout(r, 120))`: si rendeva la pagina, si
// dormiva 120 millisecondi e si leggeva quello che c'era. Funzionava lanciando
// questo file da solo e falliva lanciandolo con gli altri — il 17/09/2026 il
// primo controllo ha bocciato una correzione GIUSTA perché la pagina era
// ancora su «Caricamento…»: vitest gira su più processi, e su una macchina
// carica 120 ms non bastano a far tornare `sload`.
//
// Un controllo che cambia risposta a seconda di quanto è occupato il computer
// non misura il codice, misura il computer. Ora si aspetta la condizione
// vera — la pagina ha finito di caricare e ha scritto qualcosa — e si smette
// appena è soddisfatta. Se non lo è mai, si lascia parlare il controllo vero
// qui sotto: il suo messaggio dice cosa manca, «tempo scaduto» no.
const pronta = async (v, minimo = 40) => {
  try {
    await waitFor(() => {
      const t = v.container.textContent.trim()
      if (t.length < minimo || /Caricamento/.test(t)) throw new Error('non ancora pronta')
    }, { timeout: 5000, interval: 25 })
  } catch { /* resta com'è: a dire cosa non va è l'expect che segue */ }
  return v.container.textContent
}

describe('Eventi — la data storta e il preventivo non ancora compilato', () => {
  beforeEach(cleanup)

  const props = {
    orgId: 'org-1', sedeId: 's1', notify: () => {},
    ricettario: { ricette: {}, ingredienti_costi: {} },
    nomeAttivita: 'Pasticceria del Corso', tipoAttivita: 'pasticceria',
  }

  const rendi = async () => {
    const { default: EventiView } = await import('../../src/components/Eventi.jsx')
    const v = render(<EventiView {...props} />)
    return await pronta(v)
  }

  it('una data che non si legge non diventa «Invalid Date»', async () => {
    // `new Date('2026-12-99T12:00:00')` non lancia: dà una data non valida, e
    // `toLocaleDateString` su quella scrive «Invalid Date». Il `try/catch` che
    // c'era intorno non poteva servire a niente, perché non c'è niente da
    // prendere. Lo si vedeva sulla scheda dell'evento, al posto del giorno del
    // catering.
    const testo = await rendi()
    expect(testo, 'la scheda dell\'evento scrive ancora «Invalid Date»').not.toContain('Invalid Date')
    expect(testo, 'una data illeggibile va segnalata, non nascosta').toContain('Data da controllare')
  })

  it('e la data che si legge resta scritta in italiano', async () => {
    // Il contrario: la correzione non deve mangiarsi le date buone.
    const testo = await rendi()
    expect(testo).toContain('04 ottobre 2099')
  })

  it('un preventivo senza righe non dichiara «Margine 0%»', async () => {
    // Un evento appena creato non è un evento che rende zero: è un evento che
    // non è ancora stato preventivato. Prima diceva «Ricavo 0 € · Margine 0% ·
    // Saldo 0 €», col margine pure colorato come un margine brutto e il saldo
    // verde — cioè «pagato» su una cosa che nessuno ha mai quotato.
    const testo = await rendi()
    expect(testo, 'il margine inventato è tornato').not.toMatch(/Margine\s*-?0\s*%/)
    expect(testo).toContain('Preventivo ancora da compilare')
  })

  it('e quando il food cost di una riga non si sa, il margine lo dichiara', async () => {
    // Quello che c'è intorno. L'evento «Compleanno» ha una torta a 30 € e
    // nessuna ricetta col suo costo: il conto esce «margine 100%», che letto
    // da solo sembra un affare e invece è un dato che manca. La stessa cosa
    // l'archivio la diceva già («più basso del vero»); la scheda no.
    const testo = await rendi()
    expect(testo).toMatch(/riga è senza food cost|righe sono senza food cost/)
    expect(testo, 'l\'avviso deve dire in che verso sbaglia').toContain('più alto del vero')
  })

  it('e non scrive «1 prodotti»', async () => {
    // Stessa famiglia del `contaEventi` che c'era già in cima al file: «0
    // evento» e «1 prodotti» sono il segno che il numero è stato incollato
    // davanti a una parola fissa.
    const testo = await rendi()
    expect(testo, 'il plurale è tornato sbagliato').not.toMatch(/\b1 prodotti\b/)
    expect(testo).toContain('1 prodotto')
    expect(testo, 'zero prodotti si dice a parole').toContain('nessun prodotto')
  })
})

describe('Integrazioni — un import riuscito di cui non si sa quanto ha portato', () => {
  // Questi due controlli guardano il sorgente e non la pagina resa: le schede
  // delle integrazioni si aprono solo dopo che il controllo del backend è
  // andato a buon fine, e in un test unitario quel backend non c'è. Meglio un
  // controllo sul sorgente che nessun controllo — ma vale la pena saperlo, se
  // un giorno la pagina diventa rendibile qui dentro.
  const F = 'src/components/Integrazioni.jsx'

  it('«Ultimo: 0 record» non si scrive più', () => {
    // `Number(lastLog.records_importati || 0)`: un import andato bene di cui
    // non si sa quante righe ha portato usciva come «Ultimo: 0 record», con la
    // spunta verde accanto. La lettura è l'opposto della verità — «è andata
    // bene e non è entrato niente». Il registro qui sotto, sulla stessa
    // colonna, scriveva già «-».
    const colpevoli = righeVive(F).filter(r => /records_importati\s*\|\|\s*0/.test(r))
    expect(colpevoli, 'lo zero al posto del «non lo so» è tornato').toEqual([])
  })

  it('e le due schermate dicono la stessa cosa sullo stesso numero', () => {
    // Il difetto vero era l'incoerenza: lo stesso campo, tre posti, due
    // risposte diverse. Adesso ogni riga che tocca `records_importati` passa
    // da un controllo sul vuoto — compresa quella che SCRIVE nel registro,
    // che con `records || 0` trasformava un «non lo so» in uno zero a
    // database, cioè in un fatto.
    // Si guarda l'ISTRUZIONE, non la riga: il ternario che decide cosa
    // scrivere sta su due righe, e un controllo riga per riga bocciava la
    // seconda metà di una cosa giusta.
    const piatto = righeVive(F).join(' ').replace(/\s+/g, ' ')
    const punti = [...piatto.matchAll(/records_importati/g)].map(m => m.index)
    expect(punti.length, 'il campo è sparito: controllo da riscrivere').toBeGreaterThanOrEqual(3)
    for (const i of punti) {
      const intorno = piatto.slice(Math.max(0, i - 90), i + 90)
      expect(intorno, `senza controllo sul vuoto: …${intorno.slice(60, 150)}…`).toMatch(/==\s*null/)
    }
  })

  it('e un orario illeggibile nel registro non diventa «Invalid Date»', () => {
    // `fmtTs` controllava solo il timestamp vuoto. Su uno illeggibile scriveva
    // «Invalid Date Invalid Date» nella colonna Data/Ora del registro
    // importazioni — l'unico posto dove si guarda quando un import va storto.
    const src = leggi(F)
    const corpo = src.slice(src.indexOf('const fmtTs'), src.indexOf('const fmtTs') + 420)
    expect(corpo, 'fmtTs non controlla più la data non valida').toMatch(/Number\.isNaN\(d\.getTime\(\)\)/)
  })
})

describe('Nessuna delle mie dieci pagine lascia uscire una data rotta', () => {
  beforeEach(cleanup)

  // La rete della famiglia. Ogni pagina resa nello stato di un cliente nuovo:
  // niente ricettario, niente costi, niente listino. È lo stato in cui i buchi
  // si vedono, ed è quello che in demo non capita mai.
  const bugie = (testo) => {
    const trovate = []
    if (testo.includes('Invalid Date')) trovate.push('Invalid Date')
    if (/\bNaN\b/.test(testo)) trovate.push('NaN')
    if (/\bundefined\b/.test(testo)) trovate.push('undefined')
    if (/\bnull\b/.test(testo)) trovate.push('null')
    return trovate
  }

  const vuoto = { ricette: {}, ingredienti_costi: {} }
  const sedi = [{ id: 's1', nome: 'Corso Vittorio', attiva: true }]

  const PAGINE = [
    ['Nuova ricetta', '../../src/views/NuovaRicettaView.jsx',
      { ricettario: vuoto, notify: () => {}, onSave: () => {}, editingRicetta: null, onEditConsumed: () => {}, tipoAttivita: 'pasticceria' }],
    ['Semilavorati', '../../src/views/SemilavoratiView.jsx',
      { ricettario: vuoto, onSave: () => {}, notify: () => {}, tipoAttivita: 'pasticceria' }],
    ['Costi fissi', '../../src/views/CostiAziendaliView.jsx',
      { orgId: 'org-1', sedeId: 's1', sedi, notify: () => {} }],
    ['Da fare', '../../src/views/AzioniView.jsx',
      { actions: [], onUpdate: () => {}, onDelete: () => {}, ricettario: vuoto, giornaliero: {}, chiusure: [], magazzino: {}, nomeAttivita: 'Pasticceria del Corso', tipoAttivita: 'pasticceria' }],
    ['Ordinazioni', '../../src/components/Eventi.jsx',
      { orgId: 'org-1', sedeId: 's1', ricettario: vuoto, notify: () => {}, nomeAttivita: 'Pasticceria del Corso', tipoAttivita: 'pasticceria' }],
    ['La tua giornata', '../../src/views/HomeDipendente.jsx',
      { user: { email: 'luca@maradeiboschi.com' }, sedeAttiva: sedi[0], sedi, isInventario: false, setView: () => {}, notify: () => {} }],
    ['Marketplace', '../../src/views/MarketplaceView.jsx', {}],
    ['Inventa ricette', '../../src/views/RecipeInventorView.jsx',
      { orgId: 'org-1', user: { email: 'anita@maradeiboschi.com' }, nomeAttivita: 'Pasticceria del Corso' }],
    ['Porta dentro i dati', '../../src/components/ImportaDati.jsx',
      { orgId: 'org-1', sedi, onImportRicettario: () => {}, ricettario: vuoto, nomeAttivita: 'Pasticceria del Corso', notify: () => {} }],
  ]

  it.each(PAGINE)('%s non scrive «Invalid Date», «NaN» né «undefined»', async (nome, percorso, props) => {
    const { default: Pagina } = await import(/* @vite-ignore */ percorso)
    const v = render(<Pagina {...props} />)
    const testo = await pronta(v)
    expect(testo.trim().length, `${nome}: schermo bianco`).toBeGreaterThan(40)
    expect(bugie(testo), `${nome}: parole da programma a schermo`).toEqual([])
    v.unmount()
  })
})
