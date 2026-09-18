// @vitest-environment happy-dom
//
// Gli allergeni si propongono, non si dichiarano.
//
// Il difetto, 18/09/2026. Il titolare guarda la riga sotto il titolo
// «Allergeni presenti» — «Calcolati automaticamente dagli ingredienti
// (Reg. UE 1169/2011)» — e fa due domande a cui il prodotto non sapeva
// rispondere:
//
//   «se cambiano le direttive come facciamo noi a saperlo e ad aggiornarci?»
//   «non dobbiamo avere nessuna ripercussione legale, dobbiamo lasciare al
//    cliente l'ultima parola, noi al massimo diamo un consiglio»
//
// Il punto vero non è nemmeno la legge. L'elenco che Foodos calcola non dipende
// dal regolamento: dipende da come il cliente ha scritto le sue ricette e da
// cosa c'è davvero nelle confezioni dei suoi fornitori. Basta che un fornitore
// cambi la composizione di una base e l'elenco diventa vecchio senza che
// nessuno se ne accorga. Mettere accanto «calcolati automaticamente» e il
// numero del regolamento fa credere che il documento sia a posto perché l'ha
// fatto il computer.
//
// Com'era messa la scheda allergeni prima di questa correzione:
//   • la legenda diceva «(vuoto) = non contiene». Una casella vuota è una
//     dichiarazione di assenza che nessun essere umano aveva fatto.
//   • le celle avevano `aria-label="Senza Glutine"` e `title="Contiene Latte"`.
//   • l'unica avvertenza stava in fondo alla pagina, sotto quattordici colonne,
//     e cominciava con la parola «Disclaimer».
//   • il PDF — il foglio che il negozio stacca e dà ai suoi clienti, e che
//     viaggia senza di noi — portava in testa «Reg. UE 1169/2011 - Informazioni
//     sugli allergeni alimentari» e non aveva nessuno spazio per una firma.
//   • nella scheda HACCP, un ricettario importato da Excel (cioè quasi tutti:
//     gli allergeni salvati non ce li ha) mostrava quattordici zeri e la frase
//     «Nessun allergene rilevato in nessuna ricetta». Non è «non ce ne sono»,
//     è «non li hai ancora scritti», e un ispettore legge la prima.
//
// Quello che questi test proteggono: il programma propone, il cliente conferma.
// Il primo test è un guardiano sul sorgente: se qualcuno riaccosta «calcolati
// automaticamente» al regolamento, fallisce.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'

// ─── Il foglio di carta: jsPDF finto che si ricorda cosa gli è stato scritto ──
const disegnato = { testi: [], righe: 0, file: null }

class FintoJsPDF {
  constructor(opts = {}) {
    this.opts = opts
    this._pagine = 1
    this.internal = {
      pageSize: { getWidth: () => 297, getHeight: () => 210 },
      getNumberOfPages: () => this._pagine,
    }
  }
  setFillColor() { return this }
  setDrawColor() { return this }
  setTextColor() { return this }
  setFont() { return this }
  setFontSize() { return this }
  setLineDashPattern() { return this }
  rect() { return this }
  line() { disegnato.righe++; return this }
  text(t) {
    for (const r of Array.isArray(t) ? t : [t]) disegnato.testi.push(String(r))
    return this
  }
  // Lo spezzettamento vero di jsPDF: taglia sui 90 caratteri, così il test
  // vede il testo come lo vedrebbe la stampante (a capo compresi).
  splitTextToSize(s) {
    const parole = String(s).split(' ')
    const righe = ['']
    for (const p of parole) {
      if ((righe[righe.length - 1] + ' ' + p).trim().length > 90) righe.push(p)
      else righe[righe.length - 1] = (righe[righe.length - 1] + ' ' + p).trim()
    }
    return righe
  }
  addPage() { this._pagine++; return this }
  setPage() { return this }
  save(nome) { disegnato.file = nome; return this }
}
vi.mock('jspdf', () => ({ default: FintoJsPDF, jsPDF: FintoJsPDF }))

// Supabase: la scheda HACCP lo interroga al mount. Qui non serve nessun dato.
vi.mock('../../src/lib/supabase', () => {
  const vuoto = Promise.resolve({ data: [], error: null })
  const catena = () => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => catena()) })
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ order: () => ({ limit: () => vuoto }), gte: () => vuoto, then: undefined }),
            order: () => ({ limit: () => vuoto }),
            gte: () => ({ order: () => vuoto }),
          }),
          order: () => ({ limit: () => vuoto }),
        }),
        ...catena(),
      }),
    },
  }
})

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')

// Una riga di commento non arriva mai sullo schermo del titolare. I guardiani
// sul sorgente devono guardare solo le righe vive, altrimenti basta raccontare
// il difetto in un commento — come si fa qui sopra — per far fallire il test.
// I blocchi /* */ (compresi i commenti JSX `{/* */}`) vengono sbiancati
// conservando gli a capo, così i numeri di riga restano quelli veri.
function righeVive(sorgente) {
  return sorgente
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((r) => (/^\s*\/\//.test(r) ? '' : r))
}

function tuttiISorgenti(dir = 'src') {
  const out = []
  for (const voce of readdirSync(join(RADICE, dir))) {
    const rel = `${dir}/${voce}`
    if (statSync(join(RADICE, rel)).isDirectory()) out.push(...tuttiISorgenti(rel))
    else if (/\.jsx?$/.test(voce)) out.push(rel)
  }
  return out
}

const FILE_ALLERGENI = [
  'src/lib/allergeni.js',
  'src/views/SchedaAllergeniView.jsx',
  'src/components/Haccp.jsx',
  'src/lib/exportPDF.js',
]

// ─────────────────────────────────────────────────────────────────────────────
describe('il guardiano: nessuna frase torna a promettere conformità', () => {
  // Questa è la formula esatta che il titolare ha letto e contestato. Vale su
  // TUTTO il prodotto, non solo sulla scheda allergeni: il giorno che ricompare
  // da qualche altra parte, il difetto è tornato identico.
  it('non accosta mai «calcolato automaticamente» al Reg. UE 1169/2011', () => {
    const promessa = /(calcolat|rilevat|generat|determinat)[oiae]\b[^\n]{0,60}automatic/i
    const norma = /1169|regolamento\s+ue|reg\.\s*ue/i
    const colpevoli = []

    for (const f of tuttiISorgenti()) {
      righeVive(leggi(f)).forEach((riga, i) => {
        if (promessa.test(riga) && norma.test(riga)) colpevoli.push(`${f}:${i + 1} → ${riga.trim()}`)
      })
    }

    expect(colpevoli, [
      'Una riga dice che gli allergeni sono calcolati automaticamente E cita il',
      'regolamento. Messe vicine, le due cose fanno credere che il documento sia',
      'a posto perché l\'ha fatto il computer. Il calcolo non soddisfa niente: è',
      'una proposta, e la conferma la dà chi produce.',
      'Il regolamento si può citare come riferimento del documento — vedi',
      'RIFERIMENTO_NORMATIVO_ALLERGENI in src/lib/allergeni.js — mai come un timbro.',
    ].join('\n')).toEqual([])
  })

  it('non presenta nessuna schermata come «le informazioni obbligatorie»', () => {
    const colpevoli = []
    for (const f of tuttiISorgenti()) {
      righeVive(leggi(f)).forEach((riga, i) => {
        if (/informazioni\s+obbligatorie/i.test(riga)) colpevoli.push(`${f}:${i + 1} → ${riga.trim()}`)
      })
    }
    // Era il sottotitolo della sintesi allergeni nell'HACCP: diceva che quella
    // tabella È l'informativa prevista dalla legge. Non lo è: è il riassunto di
    // quello che il titolare ha scritto finora.
    expect(colpevoli).toEqual([])
  })

  it('non dichiara assenze: niente «non contiene», «senza X», «assente»', () => {
    // Su una casella vuota queste parole sono la bugia più costosa che il
    // prodotto possa stampare: chi è allergico ci mangia sopra.
    const vietate = [
      [/non\s+contiene/i, '«non contiene»: nessuno l\'ha verificato'],
      [/['"`]\s*Contiene\s/i, '«Contiene X»: il programma ha letto un nome, non una confezione'],
      [/['"`]\s*Senza\s+\$\{/i, '«Senza X» su una casella vuota è una dichiarazione'],
      [/['"`]assente['"`]/i, '«assente» detto di un allergene mai controllato'],
      [/nessun\s+allergene\s+rilevato/i, '«nessun allergene rilevato» = «non ce ne sono», ma vuol dire «non li hai scritti»'],
    ]
    const colpevoli = []
    for (const f of FILE_ALLERGENI) {
      righeVive(leggi(f)).forEach((riga, i) => {
        for (const [re, perche] of vietate) {
          if (re.test(riga)) colpevoli.push(`${f}:${i + 1} — ${perche}\n    ${riga.trim()}`)
        }
      })
    }
    expect(colpevoli).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('il testo dell\'avvertenza dice tutte e tre le cose', () => {
  it('proposta, da confermare, e la versione che vale è la sua', async () => {
    const A = await import('../../src/lib/allergeni')
    const testo = `${A.AVVERTENZA_ALLERGENI_TITOLO} ${A.AVVERTENZA_ALLERGENI}`.toLowerCase()

    // 1. È una proposta ricavata da quello che ha scritto lui.
    expect(testo).toMatch(/propost/)
    expect(testo).toMatch(/ricav|hai scritto|ingredienti/)
    // 2. Va controllata: dipende dai fornitori e da quello che succede in laboratorio.
    expect(testo).toMatch(/controll/)
    expect(testo).toMatch(/fornitor/)
    expect(testo).toMatch(/laboratorio/)
    // 3. L'ultima parola è la sua.
    expect(testo).toMatch(/conferm/)
    expect(testo).toMatch(/la tua|vale/)
  })

  it('cita il regolamento come riferimento, non come timbro', async () => {
    const A = await import('../../src/lib/allergeni')
    expect(A.RIFERIMENTO_NORMATIVO_ALLERGENI).toMatch(/riferimento/i)
    expect(A.RIFERIMENTO_NORMATIVO_ALLERGENI).toMatch(/1169/)
    // La citazione non deve contenere verbi che suonano come un adempimento.
    expect(A.RIFERIMENTO_NORMATIVO_ALLERGENI).not.toMatch(/conforme|a norma|rispett|soddisf/i)
  })

  it('la legenda non dichiara niente, dice solo cosa risulta', async () => {
    const { LEGENDA_ALLERGENI } = await import('../../src/lib/allergeni')
    expect(LEGENDA_ALLERGENI.certo).toMatch(/risulta/)
    expect(LEGENDA_ALLERGENI.assente).toMatch(/non risulta/)
    expect(LEGENDA_ALLERGENI.dubbio).toMatch(/etichetta/)
    for (const v of Object.values(LEGENDA_ALLERGENI)) {
      expect(v).not.toMatch(/contiene/i)
    }
  })

  // Il testo sta scritto in un posto solo apposta: se schermo e PDF avessero
  // due copie diverse, la prima correzione ne sistemerebbe una sola.
  it('schermo e PDF pescano dallo stesso testo', () => {
    const vista = leggi('src/views/SchedaAllergeniView.jsx')
    expect(vista).toMatch(/AVVERTENZA_ALLERGENI\b/)
    expect(vista).toMatch(/AVVERTENZA_ALLERGENI_PDF/)
    expect(vista).toMatch(/LEGENDA_ALLERGENI/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
const RICETTARIO = {
  ricette: {
    'Gelato fiordilatte': { nome: 'Gelato fiordilatte', tipo: 'finito', ingredienti: [{ nome: 'latte' }, { nome: 'zucchero' }] },
    'Sorbetto limone': { nome: 'Sorbetto limone', tipo: 'finito', ingredienti: [{ nome: 'limone' }, { nome: 'acqua' }] },
    'Bacio di dama': { nome: 'Bacio di dama', tipo: 'finito', ingredienti: [{ nome: 'massa 58' }, { nome: 'cioccolato fondente' }] },
  },
}

describe('la scheda allergiche a schermo', () => {
  beforeEach(() => { disegnato.testi = []; disegnato.righe = 0; disegnato.file = null })
  afterEach(cleanup)

  it('dice subito che è una proposta, prima della tabella', async () => {
    const { default: Scheda } = await import('../../src/views/SchedaAllergeniView')
    const { container } = render(<Scheda ricettario={RICETTARIO} tipoAttivita="gelateria" />)
    const testo = container.textContent

    expect(testo).toMatch(/proposta/i)
    expect(testo).toMatch(/conferma/i)
    // E non ci sono più dichiarazioni di assenza sullo schermo.
    expect(testo).not.toMatch(/non contiene/i)

    // «Prima della tabella» non è un dettaglio: in fondo alla pagina nessuno
    // la leggeva. L'avvertenza deve comparire nel sorgente prima della <table>.
    const html = container.innerHTML
    expect(html.indexOf('proposta')).toBeGreaterThan(-1)
    expect(html.indexOf('proposta')).toBeLessThan(html.indexOf('<table'))
  })

  it('una casella vuota si legge «non risulta», non «senza»', async () => {
    const { default: Scheda } = await import('../../src/views/SchedaAllergeniView')
    const { container } = render(<Scheda ricettario={RICETTARIO} tipoAttivita="gelateria" />)
    const etichette = [...container.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'))

    expect(etichette.length).toBeGreaterThan(0)
    expect(etichette.some((e) => /non risulta dagli ingredienti/i.test(e))).toBe(true)
    for (const e of etichette) {
      expect(e).not.toMatch(/^Senza /)
      expect(e).not.toMatch(/^Contiene /)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('il PDF, che è il foglio che esce di casa', () => {
  beforeEach(() => { disegnato.testi = []; disegnato.righe = 0; disegnato.file = null })
  afterEach(cleanup)

  async function esporta() {
    const { default: Scheda } = await import('../../src/views/SchedaAllergeniView')
    render(<Scheda ricettario={RICETTARIO} tipoAttivita="gelateria" />)
    fireEvent.click(screen.getByText(/Esporta/i).closest('button'))
    // L'export importa jspdf in modo dinamico: si aspetta il microtask.
    await new Promise((r) => setTimeout(r, 0))
    return disegnato.testi.join(' ')
  }

  it('porta stampata la stessa avvertenza che c\'è a schermo', async () => {
    const carta = await esporta()
    expect(disegnato.file).toBeTruthy()

    expect(carta).toMatch(/proposta/i)
    expect(carta).toMatch(/conferm/i)
    expect(carta).toMatch(/fornitor/i)
    expect(carta).toMatch(/1169/)
  })

  it('non stampa più il regolamento come intestazione del documento', async () => {
    const carta = await esporta()
    // Prima, sotto il titolo: «Reg. UE 1169/2011 - Informazioni sugli allergeni
    // alimentari». Sembrava l'intestazione di un atto, e invece era l'uscita di
    // un calcolo su nomi di ingrediente.
    expect(carta).not.toMatch(/Informazioni sugli allergeni alimentari/i)
    expect(carta).not.toMatch(/non contiene/i)
  })

  it('lascia una riga da firmare, e si chiama «da confermare»', async () => {
    const carta = await esporta()
    // Finché non c'è una firma, il foglio deve dire da sé di essere una bozza.
    expect(carta).toMatch(/firma/i)
    expect(carta).toMatch(/[Dd]ata della conferma/)
    expect(disegnato.righe).toBeGreaterThan(0) // le due righe da firmare, disegnate
    expect(disegnato.file).toMatch(/da-confermare/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('HACCP: zero allergeni salvati non vuol dire zero allergeni', () => {
  afterEach(cleanup)

  async function apriSchedaAllergeni(ricettario) {
    const { default: Haccp } = await import('../../src/components/Haccp')
    const r = render(<Haccp orgId={null} sedeId={null} ricettario={ricettario} nomeAttivita="Prova" notify={() => {}} />)
    fireEvent.click(screen.getByText('Allergeni'))
    return r
  }

  it('lo dice a chiare lettere quando nessuna ricetta li ha scritti', async () => {
    // È lo stato di quasi tutti: le ricette importate da Excel il campo
    // `allergeni` non ce l'hanno. Prima si leggeva «Nessun allergene rilevato
    // in nessuna ricetta» sopra quattordici caselle a zero.
    const { container } = await apriSchedaAllergeni(RICETTARIO)
    const testo = container.textContent

    expect(testo).toMatch(/non sono stati scritti|non c'è ancora niente di scritto|non sono stati salvati/i)
    expect(testo).not.toMatch(/nessun allergene rilevato/i)
  })

  it('anche qui dice che è una proposta da confermare', async () => {
    const { container } = await apriSchedaAllergeni(RICETTARIO)
    expect(container.textContent).toMatch(/proposta/i)
    expect(container.textContent).toMatch(/conferm/i)
  })

  it('con gli allergeni salvati l\'avviso sparisce e restano i conteggi', async () => {
    const conAllergeni = {
      ricette: {
        'Gelato fiordilatte': { nome: 'Gelato fiordilatte', tipo: 'finito', allergeni: ['latte'], ingredienti: [] },
        'Sorbetto limone': { nome: 'Sorbetto limone', tipo: 'finito', allergeni: [], ingredienti: [] },
      },
    }
    const { container } = await apriSchedaAllergeni(conAllergeni)
    const testo = container.textContent
    expect(testo).not.toMatch(/non c'è ancora niente di scritto/i)
    expect(testo).toMatch(/Latte/)
  })
})
