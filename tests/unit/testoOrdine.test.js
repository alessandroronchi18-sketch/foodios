// ── Il testo che arriva al fornitore ────────────────────────────────────────
//
// Questo è l'unico pezzo di FoodOS che esce dall'azienda e finisce sotto gli
// occhi di qualcun altro: il messaggio che il fornitore legge. Se sbaglia, non
// se ne accorge un test — se ne accorge il magazziniere di DESA che scarica
// sei chili di burro nel negozio sbagliato.
//
// Il testo nasce in `src/views/OrdiniAiView.jsx:243-266` e il tono era già
// giusto: «Buongiorno», «vi chiedo gentilmente», «Grazie!». Quello che gli
// mancava è venuto fuori il 22/09/2026 guardando le bolle vere di DESA,
// ConoArtic e Vecchio Enrico:
//
//   1. **il codice dell'articolo** — sulle loro bolle ogni riga ne ha uno
//      (`Cod. 1007`, `A065/C`, `DOT.001`), ed è l'unico modo perché mandino
//      esattamente quella panna lì e non una delle altre cinque;
//   2. **l'indirizzo di consegna** — il design partner ha tre negozi, e senza
//      indirizzo il fornitore scarica dove ha scaricato l'ultima volta;
//   3. **il minimo d'ordine** — saperlo prima di mandare l'ordine, non il
//      giorno dopo al telefono.
//
// E due regole del prodotto che valgono anche qui: niente emoji, e i numeri
// all'italiana (punto delle migliaia, simbolo € DOPO la cifra).
import { describe, it, expect } from 'vitest'
import { testoOrdineWhatsApp, testoOrdineEmail, mailtoOrdine, indirizzoConsegna } from '../../src/lib/testoOrdine.js'

// I dati veri del design partner, per non provare su nomi finti.
const AZIENDA = { nome_attivita: 'Mara dei Boschi', indirizzo: 'via Berthollet 30', cap: '10125', citta: 'Torino', provincia: 'TO' }
const SEDE = { nome: 'San Salvario', indirizzo: 'via Berthollet 30', citta: 'Torino' }
const RIGHE = [
  { nome: 'Farina 00', quantitaG: 25000, codice: '1007' },      // DESA
  { nome: 'Burro', quantitaG: 6000 },
  { nome: 'Coni cialda', quantitaTesto: '20 cartoni', codice: 'A065/C' },  // ConoArtic
]

const EMOJI = /\p{Extended_Pictographic}/u

describe('Il tono resta quello di una pasticcera che scrive al suo fornitore', () => {
  it('saluta, chiede gentilmente, ringrazia', () => {
    const t = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE })
    expect(t).toMatch(/^Buongiorno, sono Mara dei Boschi\./)
    expect(t).toContain('Vi chiedo gentilmente di prepararci:')
    expect(t.trimEnd().endsWith('Grazie!')).toBe(true)
  })

  it('su WhatsApp non ci sono intestazioni da email', () => {
    const t = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE })
    for (const daUfficio of ['Oggetto:', 'Spett.le', 'Gentile', 'Cordiali saluti', 'In allegato', 'Distinti saluti']) {
      expect(t).not.toContain(daUfficio)
    }
  })

  it('niente emoji, da nessuna parte', () => {
    const w = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, minimoOrdine: 250, stimaTotale: 120, note: 'Se potete, consegna al mattino.' })
    const e = testoOrdineEmail({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, data: '2026-09-22' })
    expect(EMOJI.test(w)).toBe(false)
    expect(EMOJI.test(e.oggetto)).toBe(false)
    expect(EMOJI.test(e.corpo)).toBe(false)
  })

  it('senza il nome dell’azienda saluta lo stesso, senza spazi vuoti', () => {
    const t = testoOrdineWhatsApp({ righe: RIGHE, sede: 'via Berthollet 30, Torino' })
    expect(t).toMatch(/^Buongiorno,\n/)
    expect(t).not.toContain('sono .')
  })
})

describe('Le quantità si scrivono all’italiana', () => {
  it('da un chilo in su, chili con un decimale', () => {
    const t = testoOrdineWhatsApp({ righe: [{ nome: 'Farina 00', quantitaG: 25000 }], azienda: AZIENDA, sede: SEDE })
    expect(t).toContain('- Farina 00: 25,0 kg')
  })

  it('sotto il chilo, grammi', () => {
    const t = testoOrdineWhatsApp({ righe: [{ nome: 'Vaniglia bacche', quantitaG: 250 }], azienda: AZIENDA, sede: SEDE })
    expect(t).toContain('- Vaniglia bacche: 300 g')
  })

  it('arrotondate al passo con cui si ordina davvero', () => {
    // Nessun fornitore prepara 1,234 kg di burro. La regola è la stessa della
    // colonna «Da ordinare» del Magazzino: mezzo chilo sopra il chilo.
    const t = testoOrdineWhatsApp({ righe: [{ nome: 'Burro', quantitaG: 1234 }], azienda: AZIENDA, sede: SEDE })
    expect(t).toContain('- Burro: 1,5 kg')
  })

  it('la merce che non si pesa si scrive com’è: cartoni, pezzi', () => {
    const t = testoOrdineWhatsApp({ righe: [{ nome: 'Coni cialda', quantitaTesto: '20 cartoni' }], azienda: AZIENDA, sede: SEDE })
    expect(t).toContain('- Coni cialda: 20 cartoni')
  })

  it('una riga senza quantità non resta muta: «da confermare»', () => {
    // Una riga senza numero il magazziniere la legge come «uno».
    const t = testoOrdineWhatsApp({ righe: [{ nome: 'Burro' }], azienda: AZIENDA, sede: SEDE })
    expect(t).toContain('- Burro: da confermare')
  })
})

describe('Il codice del fornitore accanto al nome', () => {
  it('i codici veri delle bolle: DESA, ConoArtic, Vecchio Enrico', () => {
    const t = testoOrdineWhatsApp({
      righe: [
        { nome: 'Panna UHT', quantitaG: 12000, codice: '1007' },
        { nome: 'Coni cialda', quantitaTesto: '20 cartoni', codice: 'A065/C' },
        { nome: 'Farina 00', quantitaG: 25000, codice: 'DOT.001' },
      ],
      azienda: AZIENDA, sede: SEDE,
    })
    expect(t).toContain('- Panna UHT (Cod. 1007): 12,0 kg')
    expect(t).toContain('- Coni cialda (Cod. A065/C): 20 cartoni')
    expect(t).toContain('- Farina 00 (Cod. DOT.001): 25,0 kg')
  })

  it('senza codice non si inventa niente', () => {
    const t = testoOrdineWhatsApp({ righe: [{ nome: 'Burro', quantitaG: 6000 }], azienda: AZIENDA, sede: SEDE })
    expect(t).toContain('- Burro: 6,0 kg')
    expect(t).not.toContain('Cod.')
  })
})

describe('L’indirizzo di consegna c’è sempre', () => {
  it('con la sede si scrive azienda, negozio e via', () => {
    expect(indirizzoConsegna({ azienda: AZIENDA, sede: SEDE }))
      .toBe('Mara dei Boschi (San Salvario) — via Berthollet 30, Torino')
  })

  it('se la sede non ha l’indirizzo si usa quello dell’azienda', () => {
    expect(indirizzoConsegna({ azienda: AZIENDA, sede: { nome: 'Vanchiglia' } }))
      .toBe('Mara dei Boschi (Vanchiglia) — via Berthollet 30, 10125 Torino (TO)')
  })

  it('una sede scritta a mano si usa così com’è', () => {
    expect(indirizzoConsegna({ azienda: AZIENDA, sede: 'via Giulia di Barolo 3, Torino' }))
      .toBe('via Giulia di Barolo 3, Torino')
  })

  it('se l’indirizzo non c’è NON si tace: resta un buco da riempire', () => {
    // Un indirizzo assente in silenzio è come un indirizzo sbagliato, ma
    // senza il sospetto. Il messaggio si copia a mano: la parentesi quadra
    // si vede.
    const t = testoOrdineWhatsApp({ righe: RIGHE, azienda: 'Mara dei Boschi' })
    expect(t).toContain("Consegna: Mara dei Boschi — [scrivi qui l'indirizzo].")
  })

  it('e la riga di consegna c’è anche nella mail', () => {
    const { corpo } = testoOrdineEmail({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, data: '2026-09-22' })
    expect(corpo).toContain('Consegna: Mara dei Boschi (San Salvario) — via Berthollet 30, Torino.')
  })

  it('tre negozi, tre indirizzi diversi nello stesso ordine', () => {
    const sedi = [
      { nome: 'San Salvario', indirizzo: 'via Berthollet 30', citta: 'Torino' },
      { nome: 'Vanchiglia', indirizzo: 'via Giulia di Barolo 3', citta: 'Torino' },
      { nome: 'Laboratorio', indirizzo: 'corso Regina 45', citta: 'Torino' },
    ]
    const testi = sedi.map(sede => testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede }))
    expect(new Set(testi).size).toBe(3)
    expect(testi[1]).toContain('via Giulia di Barolo 3')
  })
})

describe('Il minimo d’ordine si dice solo quando lo si sa', () => {
  it('quando la stima non ci arriva, lo si scrive con il € dopo la cifra', () => {
    const t = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, minimoOrdine: 250, stimaTotale: 120 })
    expect(t).toContain("Il vostro minimo d'ordine è 250 €: fatemi sapere se conviene aggiungere qualcosa.")
  })

  it('col punto delle migliaia, come tutti gli altri numeri del prodotto', () => {
    const t = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, minimoOrdine: 1500, stimaTotale: 900 })
    expect(t).toContain('1.500 €')
    expect(t).not.toContain('€ 1.500')
  })

  it('se la stima ci arriva non si dice niente', () => {
    const t = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, minimoOrdine: 250, stimaTotale: 300 })
    expect(t).not.toContain('minimo')
  })

  it('se la stima NON si sa non si dice niente lo stesso', () => {
    // Senza i prezzi in listino la stima è 0. Scrivere «non arrivo al minimo»
    // senza saperlo è peggio che tacere: il fornitore aggiunge merce che non
    // serviva.
    const t = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, minimoOrdine: 250, stimaTotale: 0 })
    expect(t).not.toContain('minimo')
    const t2 = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, minimoOrdine: 250 })
    expect(t2).not.toContain('minimo')
  })

  it('e se il fornitore non ha un minimo, nemmeno', () => {
    const t = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, stimaTotale: 120 })
    expect(t).not.toContain('minimo')
  })

  it('la stima in euro non finisce MAI nel testo', () => {
    // Un numero mandato al fornitore diventa un prezzo concordato. La stima
    // serve a noi per sapere se si arriva al minimo, non a lui.
    const t = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, minimoOrdine: 250, stimaTotale: 137 })
    expect(t).not.toContain('137')
  })
})

describe('L’oggetto della mail serve a ritrovarla', () => {
  it('chi ordina, quale negozio, che giorno', () => {
    const { oggetto } = testoOrdineEmail({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, data: '2026-09-22' })
    expect(oggetto).toBe('Ordine Mara dei Boschi (San Salvario) — 22/09/2026')
  })

  it('la data si passa, non si legge l’orologio di nascosto', () => {
    // Così il testo è sempre lo stesso a parità di dati, e si può provare.
    const a = testoOrdineEmail({ righe: RIGHE, azienda: AZIENDA, data: new Date(2026, 8, 22) }).oggetto
    const b = testoOrdineEmail({ righe: RIGHE, azienda: AZIENDA, data: '2026-09-22' }).oggetto
    const c = testoOrdineEmail({ righe: RIGHE, azienda: AZIENDA, data: '22/09/2026' }).oggetto
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(b).toBe('Ordine Mara dei Boschi — 22/09/2026')
  })

  it('senza data l’oggetto non resta con un trattino appeso', () => {
    expect(testoOrdineEmail({ righe: RIGHE, azienda: AZIENDA }).oggetto).toBe('Ordine Mara dei Boschi')
  })

  it('il corpo ha saluto, elenco, indirizzo e firma', () => {
    const { corpo } = testoOrdineEmail({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, data: '2026-09-22' })
    expect(corpo.startsWith('Buongiorno,')).toBe(true)
    expect(corpo).toContain('vi chiedo gentilmente di prepararci il seguente ordine:')
    expect(corpo).toContain('- Farina 00 (Cod. 1007): 25,0 kg')
    expect(corpo).toContain('Consegna: ')
    expect(corpo.trimEnd().endsWith('Grazie e a presto,\nMara dei Boschi')).toBe(true)
  })

  it('la nota del titolare entra prima dei saluti', () => {
    const { corpo } = testoOrdineEmail({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, note: 'Se potete, consegna al mattino: nel pomeriggio siamo chiusi.' })
    expect(corpo).toContain('Se potete, consegna al mattino: nel pomeriggio siamo chiusi.')
    expect(corpo.indexOf('Se potete')).toBeLessThan(corpo.indexOf('Grazie'))
  })
})

describe('Il mailto: è il pezzo che si rompe in silenzio', () => {
  const corpo = "Buongiorno,\n\n- Panna & co (Cod. #12): 2,0 kg\n\nConsegna: via Berthollet 30, Torino.\n\nGrazie e a presto,\nMara dei Boschi"
  const oggetto = 'Ordine Mara dei Boschi (San Salvario) — 22/09/2026'

  // Si legge il parametro a mano, spezzando sulle & VERE: quelle del testo
  // devono essere codificate, e se non lo fossero questo `split` le
  // scambierebbe per separatori — che è esattamente il difetto da trovare.
  const parametro = (url, nome) => {
    const pezzo = url.slice(url.indexOf('?') + 1).split('&').find(p => p.startsWith(`${nome}=`))
    return pezzo ? decodeURIComponent(pezzo.slice(nome.length + 1)) : null
  }

  it('il corpo torna indietro identico, capi riga compresi', () => {
    const url = mailtoOrdine({ a: 'ordini@desa.it', oggetto, corpo })
    expect(parametro(url, 'body')).toBe(corpo)
    expect(parametro(url, 'subject')).toBe(oggetto)
  })

  it('la e commerciale e il cancelletto non tagliano il messaggio a metà', () => {
    // È il difetto classico: con `encodeURI` la & resta & e il client di
    // posta legge «co (Cod. » come un parametro nuovo. Il fornitore riceve
    // mezza riga d'ordine e nessuno se ne accorge.
    const url = mailtoOrdine({ a: 'ordini@desa.it', oggetto, corpo })
    expect(url).toContain('%26')
    expect(url).toContain('%23')
    expect(url.split('&')).toHaveLength(2)  // solo quello fra subject e body
  })

  it('i ritorni a capo diventano %0A, o arriva tutto su una riga sola', () => {
    expect(mailtoOrdine({ a: 'x@y.it', corpo: 'a\nb' })).toContain('%0A')
  })

  it('gli accenti sopravvivono', () => {
    const url = mailtoOrdine({ a: 'x@y.it', corpo: 'Il minimo è 250 €' })
    expect(parametro(url, 'body')).toBe('Il minimo è 250 €')
  })

  it('la chiocciola resta leggibile nel campo «A»', () => {
    expect(mailtoOrdine({ a: 'ordini@desa.it', oggetto: 'x' })).toMatch(/^mailto:ordini@desa\.it\?/)
  })

  it('più destinatari, comunque siano scritti', () => {
    expect(mailtoOrdine({ a: ['a@x.it', 'b@y.it'] })).toBe('mailto:a@x.it,b@y.it')
    expect(mailtoOrdine({ a: 'a@x.it; b@y.it' })).toBe('mailto:a@x.it,b@y.it')
  })

  it('senza indirizzo si apre comunque la mail vuota, invece di non fare niente', () => {
    const url = mailtoOrdine({ oggetto: 'Ordine', corpo: 'Buongiorno,' })
    expect(url.startsWith('mailto:?')).toBe(true)
  })

  it('senza niente non produce una stringa storta', () => {
    expect(mailtoOrdine()).toBe('mailto:')
  })
})

describe('Il righello: questi controlli saprebbero accorgersi se il testo si rompesse', () => {
  // Un controllo che passa su qualunque testo non controlla niente. Qui sotto
  // ci sono i quattro modi realistici in cui questo messaggio si rompe — sono
  // i quattro difetti veri del testo di prima — e si verifica che almeno uno
  // dei controlli CADREBBE su ognuno.
  const vero = testoOrdineWhatsApp({ righe: RIGHE, azienda: AZIENDA, sede: SEDE, minimoOrdine: 250, stimaTotale: 120 })

  const controlli = [
    { nome: "l'indirizzo di consegna c'è", ok: t => /\nConsegna: .+\.\n/.test(t) },
    { nome: 'il codice del fornitore è accanto al nome', ok: t => t.includes('(Cod. 1007)') },
    { nome: 'le quantità sono in chili', ok: t => t.includes('25,0 kg') },
    { nome: 'niente emoji', ok: t => !EMOJI.test(t) },
    { nome: 'il € sta dopo la cifra', ok: t => !/€\s*\d/.test(t) },
  ]

  it('sul testo vero passano tutti', () => {
    for (const c of controlli) expect(c.ok(vero), c.nome).toBe(true)
  })

  it('e ognuno cade sul difetto che è lì per trovare', () => {
    const rotti = {
      "senza l'indirizzo": [vero.replace(/\nConsegna: .+\n/, '\n'), "l'indirizzo di consegna c'è"],
      'senza i codici': [vero.replace(' (Cod. 1007)', ''), 'il codice del fornitore è accanto al nome'],
      'quantità in grammi': [vero.replace('25,0 kg', '25000 g'), 'le quantità sono in chili'],
      'con le emoji': [vero.replace('Grazie!', 'Grazie! 🙏'), 'niente emoji'],
      'euro davanti': [vero.replace('250 €', '€ 250'), 'il € sta dopo la cifra'],
    }
    for (const [difetto, [testo, controlloAtteso]] of Object.entries(rotti)) {
      const caduti = controlli.filter(c => !c.ok(testo)).map(c => c.nome)
      expect(caduti, difetto).toContain(controlloAtteso)
    }
  })
})
