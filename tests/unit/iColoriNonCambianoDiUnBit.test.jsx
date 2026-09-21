// @vitest-environment happy-dom
/**
 * Dare un nome a un colore non deve cambiarlo di un bit.
 * ===========================================================================
 *
 * ── Il difetto, 21/09/2026 ────────────────────────────────────────────────
 *
 * Impostazioni e Costi fissi erano appena state ripulite, ma tenevano ancora
 * una manciata di colori scritti a mano che in `src/lib/theme.js` non avevano
 * un token: `#E2E8F0` (48 volte in 16 file), `#1C0A0A` (38 in 21), `#FFFBEB`
 * (18 in 14), `#FDE68A` (13 in 8), `#F4EEEA` (10 in 4), `#4A3728`, `#9C7B76`,
 * `#FBF6F2`. E `ImpostazioniSedi.jsx` aveva in cima una tavolozza ricopiata a
 * mano — `const R`, `TXT`, `SOFT`, `MID`, `BOR` — che di quei cinque valori ne
 * azzeccava uno solo: gli altri quattro erano tinte che nel tema NON esistono.
 *
 * Il pericolo vero non è che manchi il nome: è come si finisce per darglielo.
 * Ogni colore di questo gruppo ha accanto un token che gli somiglia —
 * `#E2E8F0` accanto a `border` (#E5E9EF), `#FFFBEB` accanto a `amberLight`
 * (#FFF8EB), `#4A3728` accanto a `textMid` (#475264) — e la tentazione, a chi
 * riordina, è di «arrotondare» al vicino perché «a occhio è uguale». A occhio
 * da soli sì; affiancati sulla stessa scheda no, e con un solo `replace` si
 * ridipingono 48 punti del prodotto senza che nessuno l'abbia deciso.
 *
 * Quindi: i token sono nati con lo STESSO identico esadecimale che avevano i
 * letterali. Questo file tiene ferma quella regola, ed è scritto per fallire
 * il giorno in cui qualcuno sposta una tinta di un bit pensando che sia un
 * dettaglio di riordino.
 *
 * ── Come si rimettono i difetti per vedere le prove diventare rosse ───────
 *
 *  - gruppo 1: in `theme.js` metti `bordoTenue: '#E5E9EF'` («tanto è il
 *    border»). Rosso.
 *  - gruppo 2: rimetti `color: '#4A3728'` in `Impostazioni.jsx`. Rosso.
 *  - gruppo 3: rimetti in cima a `ImpostazioniSedi.jsx` la tavolozza
 *    `const BOR = '#E2E8F0'`. Rosso.
 *  - gruppo 4/5: le pagine si montano davvero e nessun numero esce «NaN» o
 *    «undefined». È il contorno: un riordino di colori non deve rompere il
 *    rendering, e un rendering rotto non si vede da un grep sul sorgente.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { color as T } from '../../src/lib/theme'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (p) => readFileSync(join(RADICE, p), 'utf8')

// ═════════════════════════════════════════════════════════════════════════
//  Il mondo intorno alle due pagine
// ═════════════════════════════════════════════════════════════════════════

// Una sede vera, con l'indirizzo: così si disegnano il nome (testoBrunoForte),
// la riga dell'indirizzo (testoBrunoTenue) e i tre pulsanti di riga, fra cui
// quello ambra «Default» che porta la coppia d'avviso.
const SEDE = {
  id: 's1', nome: 'Carlina', indirizzo: 'Via Carlo Alberto 1', citta: 'Torino',
  is_default: false, attiva: true, is_sede_produzione: false,
}

const db = { sedi: [SEDE] }

/** Catena Supabase minima: incatenabile e attendibile allo stesso tempo. */
function catena(tabella) {
  const c = {
    select: () => c, eq: () => c, is: () => c, in: () => c, or: () => c,
    neq: () => c, order: () => c, limit: () => c,
    insert: () => Promise.resolve({ error: null }),
    update: () => c,
    then: (risolvi) => risolvi({ data: tabella === 'sedi' ? db.sedi : [], error: null }),
  }
  return c
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: (tabella) => catena(tabella),
  },
}))

// I costi fissi veri di una pasticceria: affitto, luce, assicurazione annuale.
const VOCI = [
  { id: 'a', voce: 'Affitto laboratorio', importo: 1500, periodicita: 'mensile', categoria: 'affitti', sede_id: null, attivo: true },
  { id: 'b', voce: 'Energia elettrica', importo: 500, periodicita: 'mensile', categoria: 'utenze', sede_id: null, attivo: true },
  { id: 'c', voce: 'RC e infortuni', importo: 1200, periodicita: 'annuale', categoria: 'assicurazioni', sede_id: null, attivo: true },
]

vi.mock('../../src/lib/costiAziendali', async () => {
  const vero = await vi.importActual('../../src/lib/costiAziendali')
  return { ...vero, caricaCostiAziendali: () => Promise.resolve(VOCI) }
})

const ImpostazioniSedi = (await import('../../src/components/ImpostazioniSedi.jsx')).default
const CostiAziendaliView = (await import('../../src/views/CostiAziendaliView.jsx')).default

const SORGENTI = {
  'src/lib/theme.js': leggi('src/lib/theme.js'),
  'src/components/Impostazioni.jsx': leggi('src/components/Impostazioni.jsx'),
  'src/views/CostiAziendaliView.jsx': leggi('src/views/CostiAziendaliView.jsx'),
  'src/components/ImpostazioniSedi.jsx': leggi('src/components/ImpostazioniSedi.jsx'),
}

afterEach(() => cleanup())

// ═════════════════════════════════════════════════════════════════════════
//  1. Il valore dei token: identico a quello che c'era prima
// ═════════════════════════════════════════════════════════════════════════

// nome del token, esadecimale con cui è nato, dove nasceva scritto a mano.
const NATI_A_MANO = [
  ['bordoTenue',      '#E2E8F0', 'bordo dei riquadri e dei campi in Impostazioni'],
  ['testoBrunoForte', '#1C0A0A', 'titoli e testo forte delle pagine panna'],
  ['testoBruno',      '#4A3728', 'testo descrittivo di Impostazioni'],
  ['testoBrunoTenue', '#9C7B76', 'etichette maiuscole di ImpostazioniSedi'],
  ['fondoAvviso',     '#FFFBEB', 'fondo del riquadro d\'avviso'],
  ['bordoAvviso',     '#FDE68A', 'filo del riquadro d\'avviso'],
  ['fondoCaldo',      '#FBF6F2', 'superficie panna dei costi fissi'],
  ['fondoCaldoScuro', '#F4EEEA', 'superficie panna, il gradino sotto'],
]

describe('i token nuovi valgono esattamente il colore che avevano', () => {
  it.each(NATI_A_MANO)('%s vale %s', (nome, atteso) => {
    expect(T[nome], `color.${nome} non c'è in theme.js`).toBeDefined()
    expect(T[nome]).toBe(atteso)
  })

  it('sono scritti tutti in maiuscolo a sei cifre, come il resto del tema', () => {
    for (const [nome] of NATI_A_MANO) expect(T[nome]).toMatch(/^#[0-9A-F]{6}$/)
  })
})

describe('nessuno li «arrotonda» al token che gli somiglia', () => {
  // È il modo esatto in cui si perde un colore: non cancellandolo, ma
  // uniformandolo al vicino perché a occhio sembra lo stesso. Ogni riga qui
  // è una coppia che qualcuno potrebbe voler fondere, e non deve.
  const COPPIE = [
    ['bordoTenue',      'border',     '#E2E8F0', '#E5E9EF'],
    ['fondoAvviso',     'amberLight', '#FFFBEB', '#FFF8EB'],
    ['testoBruno',      'textMid',    '#4A3728', '#475264'],
    ['testoBrunoTenue', 'textSoft',   '#9C7B76', '#5A6B80'],
    ['fondoCaldo',      'bgSubtle',   '#FBF6F2', '#F1F4F8'],
    ['fondoCaldoScuro', 'bgMuted',    '#F4EEEA', '#EEF1F6'],
  ]

  it.each(COPPIE)('%s resta diverso da %s', (nuovo, vicino, vNuovo, vVicino) => {
    expect(T[nuovo]).toBe(vNuovo)
    expect(T[vicino]).toBe(vVicino)
    expect(T[nuovo]).not.toBe(T[vicino])
  })

  it('testoBrunoForte e tooltipBg hanno lo stesso valore, ed è voluto', () => {
    // Il fondo dei fumetti di spiegazione È il testo bruno forte. Sono due
    // mestieri diversi e hanno due nomi apposta: chi un giorno schiarisce il
    // fumetto non deve ridipingere trentotto titoli. Prima che
    // `testoBrunoForte` esistesse, cinque punti di Impostazioni scrivevano
    // `color: T.tooltipBg` proprio perché la cifra era quella giusta sotto il
    // nome sbagliato.
    expect(T.testoBrunoForte).toBe(T.tooltipBg)
    expect(T.testoBrunoForte).toBe('#1C0A0A')
  })
})

describe('ogni token nuovo dice a cosa serve', () => {
  // Un token senza il perché è un token che la prossima persona fonde con il
  // vicino in buona fede: è esattamente il rischio che questi nomi esistono
  // per evitare.
  const tema = SORGENTI['src/lib/theme.js']

  it('il setaccio guarda davvero dentro theme.js', () => {
    expect(tema.length).toBeGreaterThan(2000)
  })

  it.each(NATI_A_MANO)('%s ha una riga di commento sopra o accanto', (nome) => {
    const righe = tema.split('\n')
    const i = righe.findIndex(r => new RegExp(`^\\s*${nome}\\s*:`).test(r))
    expect(i, `${nome} non è definito in theme.js`).toBeGreaterThan(-1)
    const accanto = /\/\//.test(righe[i])
    const sopra = righe.slice(Math.max(0, i - 25), i).some(r => /^\s*\/\//.test(r))
    expect(accanto || sopra, `${nome} è senza spiegazione`).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  2. Le pagine non tengono più quei letterali
// ═════════════════════════════════════════════════════════════════════════

describe('i colori scritti a mano sono spariti dalle due pagine', () => {
  const PAGINE = [
    'src/components/Impostazioni.jsx',
    'src/views/CostiAziendaliView.jsx',
    'src/components/ImpostazioniSedi.jsx',
  ]

  it('il setaccio ha davvero letto le pagine', () => {
    for (const p of PAGINE) expect(SORGENTI[p].length).toBeGreaterThan(5000)
  })

  it.each(PAGINE)('%s non contiene più gli esadecimali che ora hanno un nome', (p) => {
    const rimasti = NATI_A_MANO
      .map(([, hex]) => hex)
      .filter(hex => new RegExp(hex, 'i').test(SORGENTI[p]))
    expect(rimasti, `ancora scritti a mano in ${p}`).toEqual([])
  })

  it.each(PAGINE)('%s importa i colori dal tema', (p) => {
    expect(SORGENTI[p]).toMatch(/import \{[^}]*color[^}]*\} from '\.\.\/lib\/theme'/)
  })

  it('ImpostazioniSedi non ricopia più la tavolozza in cima al file', () => {
    // Era: const R = '#6E0E1A' / TXT / SOFT / MID / BOR. Quattro valori su
    // cinque non corrispondevano a nessun token del tema, e nessuno poteva
    // accorgersene perché non c'era niente con cui confrontarli.
    const src = SORGENTI['src/components/ImpostazioniSedi.jsx']
    expect(src).not.toMatch(/const\s+(R|TXT|SOFT|MID|BOR)\s*=\s*['"]#/)
  })

  it('i letterali usati una volta sola restano letterali, e va bene così', () => {
    // #F4ECE7, #FEF7F4 e #F4D5C4 compaiono una volta in tutto src/: un nome
    // costerebbe più di quanto renda. Questa prova è qui perché il prossimo
    // che passa non li aggiunga «per simmetria» — e perché se un giorno si
    // moltiplicano, il conteggio vada rifatto invece che indovinato.
    const src = SORGENTI['src/views/CostiAziendaliView.jsx']
    for (const hex of ['#F4ECE7', '#FEF7F4', '#F4D5C4']) {
      const quante = (src.match(new RegExp(hex, 'gi')) || []).length
      expect(quante, `${hex} in CostiAziendaliView`).toBe(1)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  3. A schermo il colore è ancora quello. Non «simile»: quello.
// ═════════════════════════════════════════════════════════════════════════

/** #RRGGBB o rgb(r, g, b) → 'r,g,b'. Serve perché il motore di rendering dei
 *  test può restituire l'una o l'altra forma, e la prova non deve dipendere
 *  da quale delle due sceglie. */
function rgb(c) {
  const s = String(c || '').trim()
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s)
  if (m) return [1, 2, 3].map(i => parseInt(m[i], 16)).join(',')
  m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s)
  if (m) return [1, 2, 3].map(i => Number(m[i])).join(',')
  return s
}

describe('ImpostazioniSedi si disegna con gli stessi colori di prima', () => {
  beforeEach(() => { db.sedi = [SEDE] })

  async function monta() {
    const u = render(<ImpostazioniSedi orgId="org-test" />)
    await waitFor(() => expect(u.container.textContent).toContain('Carlina'))
    return u
  }

  it('il titolo della pagina è ancora #1C0A0A', async () => {
    await monta()
    const titolo = screen.getByText('Gestione Sedi')
    expect(rgb(titolo.style.color)).toBe(rgb('#1C0A0A'))
  })

  it('l\'indirizzo della sede è ancora #9C7B76', async () => {
    await monta()
    const riga = screen.getByText('Via Carlo Alberto 1, Torino')
    expect(rgb(riga.style.color)).toBe(rgb('#9C7B76'))
  })

  it('il pulsante Modifica ha ancora il filo #E2E8F0 e il testo #4A3728', async () => {
    await monta()
    const b = screen.getByRole('button', { name: 'Modifica' })
    expect(rgb(b.style.borderColor)).toBe(rgb('#E2E8F0'))
    expect(rgb(b.style.color)).toBe(rgb('#4A3728'))
  })

  it('il pulsante Default porta ancora la coppia d\'avviso #FFFBEB / #FDE68A', async () => {
    await monta()
    const b = screen.getByRole('button', { name: 'Default' })
    expect(rgb(b.style.backgroundColor || b.style.background)).toBe(rgb('#FFFBEB'))
    expect(rgb(b.style.borderColor)).toBe(rgb('#FDE68A'))
  })

  it('il pulsante Disattiva è ancora il bordeaux del marchio', async () => {
    // `const R = '#6E0E1A'` era l'unico valore della tavolozza ricopiata che
    // coincideva davvero col tema. Ora lo legge da lì.
    await monta()
    const b = screen.getByRole('button', { name: 'Disattiva' })
    expect(rgb(b.style.color)).toBe(rgb(T.brand))
    expect(rgb(b.style.color)).toBe(rgb('#6E0E1A'))
  })
})

describe('Costi fissi si disegna con gli stessi colori di prima', () => {
  async function monta() {
    const u = render(
      <CostiAziendaliView orgId="org-test" sedeId={null} sedi={[]} notify={() => {}} />
    )
    await waitFor(() => expect(u.container.textContent).toContain('Affitto laboratorio'))
    return u
  }

  it('le tessere delle voci più care sono ancora #FBF6F2', async () => {
    const u = await monta()
    const tessere = [...u.container.querySelectorAll('div')].filter(
      d => rgb(d.style.backgroundColor || d.style.background) === rgb('#FBF6F2')
    )
    expect(tessere.length, 'nessuna tessera panna a schermo').toBeGreaterThan(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  4. Quello che c'è intorno: le pagine si disegnano, e non dicono NaN
// ═════════════════════════════════════════════════════════════════════════

/** Ogni pezzo di testo per conto suo: `textContent` incolla i fratelli senza
 *  spazio e farebbe nascere parole che a schermo non ci sono. */
function testiSingoli(radice) {
  const fuori = []
  const giro = (n) => {
    if (n.nodeType === 3) {
      const t = (n.nodeValue || '').trim()
      if (t) fuori.push(t)
      return
    }
    n.childNodes && n.childNodes.forEach(giro)
  }
  giro(radice)
  return fuori
}

const PAROLE_DA_PROGRAMMATORE = /\bNaN\b|\bundefined\b|\bnull\b|\[object Object\]|\bInvalid Date\b/

describe('le pagine si disegnano e non fanno uscire parole da programmatore', () => {
  it('ImpostazioniSedi con una sede vera', async () => {
    const u = render(<ImpostazioniSedi orgId="org-test" />)
    await waitFor(() => expect(u.container.textContent).toContain('Carlina'))
    for (const t of testiSingoli(u.container)) {
      expect(t, `si legge a schermo: «${t}»`).not.toMatch(PAROLE_DA_PROGRAMMATORE)
    }
  })

  it('ImpostazioniSedi senza nessuna sede', async () => {
    db.sedi = []
    const u = render(<ImpostazioniSedi orgId="org-test" />)
    await waitFor(() => expect(u.container.textContent).toContain('Gestione Sedi'))
    for (const t of testiSingoli(u.container)) {
      expect(t, `si legge a schermo: «${t}»`).not.toMatch(PAROLE_DA_PROGRAMMATORE)
    }
    db.sedi = [SEDE]
  })

  it('Costi fissi con i costi veri di una pasticceria', async () => {
    const u = render(
      <CostiAziendaliView orgId="org-test" sedeId={null} sedi={[]} notify={() => {}} />
    )
    await waitFor(() => expect(u.container.textContent).toContain('Affitto laboratorio'))
    for (const t of testiSingoli(u.container)) {
      expect(t, `si legge a schermo: «${t}»`).not.toMatch(PAROLE_DA_PROGRAMMATORE)
    }
  })

  it('e il totale mensile è ancora quello giusto: 1.500 + 500 + 1.200/12 = 2.100', async () => {
    // Il contorno che conta davvero: un riordino di colori non deve spostare
    // un numero. 2.100 € al mese è il totale dei costi fissi di questo elenco,
    // ed è il numero che entra nel punto di pareggio.
    const u = render(
      <CostiAziendaliView orgId="org-test" sedeId={null} sedi={[]} notify={() => {}} />
    )
    await waitFor(() => expect(u.container.textContent).toContain('Affitto laboratorio'))
    expect(u.container.textContent).toContain('2.100')
  })
})
