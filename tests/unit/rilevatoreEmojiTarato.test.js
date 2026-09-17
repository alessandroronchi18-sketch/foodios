// Il rilevatore di emoji misura le emoji, non le frecce.
//
// ── Il difetto ─────────────────────────────────────────────────────────
//
// Regola del titolare: mai emoji nell'interfaccia, ci sono le icone SVG del
// componente `Icon`. Diversi test la tengono, ognuno con la sua regex scritta
// a mano — e la regex scritta a mano era sbagliata nello stesso modo in
// quattro file:
//
//     /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
//     /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE0F}]/u
//
// U+2190–21FF è il blocco delle **frecce**. U+2600–27BF sono i **dingbat**,
// che contengono la spunta «✓» (U+2713) e la crocetta «✕» (U+2715). Nessuno
// dei tre è un'emoji: sono caratteri tipografici, e stanno dentro ai pulsanti
// e ai commenti di mezzo prodotto.
//
// Il 17/09/2026 uno di questi rilevatori ha bocciato una «→» dentro un
// commento e la «✓» di un pulsante. Un controllo che grida al difetto dove
// non c'è costa quanto uno che non grida mai: la prima volta si corregge il
// prodotto per niente, la seconda si spegne il controllo.
//
// ── La correzione ──────────────────────────────────────────────────────
//
// `\p{Extended_Pictographic}` è la proprietà Unicode che dice «questo è un
// pittogramma», cioè un'emoji. La usavano già `primaNotaCassa.test.jsx` e
// `importRegistroIncassi.test.jsx`: era la regola di casa, solo non scritta
// da nessuna parte. Adesso questo file la scrive, e vieta il ritorno delle
// copie tarate male.
//
// Audit RIGHELLO, 17/09/2026.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const UNIT = join(RADICE, 'tests', 'unit')
const fileDiProva = readdirSync(UNIT).filter(f => /\.test\.jsx?$/.test(f)).sort()

// I blocchi che NON sono emoji e che finivano dentro i rilevatori fatti a
// mano. Scritti spezzati (`\u{` + i numeri) per non farsi trovare dal
// setaccio qui sotto, che cerca proprio queste sequenze.
const BLOCCHI_NON_EMOJI = [
  ['2190', '21FF', 'le frecce: → ← ↑ ↓'],
  ['2600', '27BF', 'i dingbat: ✓ ✕ ✂ ✎'],
]

// Quali blocchi non-emoji compaiono in un pezzo di codice. Le righe di
// commento raccontano il difetto e citano i blocchi: non sono codice che
// gira, quindi si buttano prima di guardare.
function comprendeBlocchiNonEmoji(sorgente) {
  const vivo = sorgente.split('\n').filter(r => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n')
  return BLOCCHI_NON_EMOJI.filter(([da, a]) =>
    vivo.includes('\\u{' + da + '}') && vivo.includes('\\u{' + a + '}'))
}

describe('il righello di questo file sa riconoscere un rilevatore troppo largo', () => {
  it('guarda davvero dentro tests/unit, non una cartella vuota', () => {
    expect(fileDiProva.length, 'nessun file di prova trovato: il percorso è sbagliato')
      .toBeGreaterThan(100)
  })

  it('riconosce la regex sbagliata se qualcuno la riscrive', () => {
    // Messa insieme un pezzo alla volta: se la scrivessi per intero, il
    // setaccio qui sotto troverebbe questo stesso file.
    const U = (x) => '\\u{' + x + '}'
    const finta = 'const emoji = /[' + U('1F300') + '-' + U('1FAFF') + U('2600') + '-' + U('27BF') + ']/u'
    expect(comprendeBlocchiNonEmoji(finta).length).toBe(1)
  })

  it('e lascia passare quella giusta', () => {
    expect(comprendeBlocchiNonEmoji('const emoji = /\\p{Extended_Pictographic}/u')).toEqual([])
  })
})

describe('nessun test scambia un carattere tipografico per un\'emoji', () => {
  for (const f of fileDiProva) {
    const larghi = comprendeBlocchiNonEmoji(readFileSync(join(UNIT, f), 'utf8'))
    if (!larghi.length) continue
    it(`${f} non comprende ${larghi.map(x => x[2]).join(' né ')}`, () => {
      expect(larghi, `${f} chiama emoji dei caratteri che emoji non sono: ` +
        larghi.map(x => `U+${x[0]}–${x[1]} (${x[2]})`).join(', ') +
        '. Si usa /\\p{Extended_Pictographic}/u, come negli altri test di casa.',
      ).toEqual([])
    })
  }

  it('e la proprietà Unicode giusta separa i due insiemi', () => {
    // La prova del nove: quello che deve passare passa, quello che deve
    // cadere cade. Senza questa, «nessuno usa la regex larga» non dice niente
    // su quale sia quella giusta.
    const emoji = /\p{Extended_Pictographic}/u
    for (const c of ['→', '✓', '✕', '×', '—', '€', '·']) {
      expect(emoji.test(c), `U+${c.codePointAt(0).toString(16).toUpperCase()} non è un'emoji`).toBe(false)
    }
    for (const c of ['\u{1F370}', '☀', '⚠', '✅', '\u{1F600}']) {
      expect(emoji.test(c), `U+${c.codePointAt(0).toString(16).toUpperCase()} è un'emoji`).toBe(true)
    }
  })

  it('e i tre segni tipografici che Unicode chiama pittogrammi restano ammessi', () => {
    // Trovato correggendo `landingImpaginazione.test.jsx` il 17/09/2026:
    // passando a `\p{Extended_Pictographic}` la prova è caduta sul `©` del
    // piè di pagina. Copyright, marchio registrato e marchio commerciale sono
    // segni tipografici con una versione emoji (©️ ®️ ™️): Unicode li conta
    // fra i pittogrammi, l'italiano scritto no. Dove servono si escludono a
    // mano, e questa prova dice che l'esclusione è precisa: toglie quei tre e
    // non un'emoji di più.
    const senzaSegni = /(?![©®™])\p{Extended_Pictographic}/u
    for (const c of ['©', '®', '™']) {
      expect(senzaSegni.test(c), `${c} è un segno tipografico, non un'emoji`).toBe(false)
    }
    for (const c of ['\u{1F370}', '☀', '⚠', '✅']) {
      expect(senzaSegni.test(c), `${c} resta un'emoji`).toBe(true)
    }
  })
})
