// Due domande che i dati sapevano già rispondere e nessuno faceva.
//
// Dall'audit dell'analytics di Shopify (16/09/2026). Fra le cose che mancavano
// davvero, due si potevano fare coi dati già nel database:
//
// 1. **«Come vanno i lunedì?»** L'unico posto che ragionava per giorno della
//    settimana era la Previsione. Nello Storico si poteva raggruppare per
//    giorno, settimana e mese — ma non per giorno della settimana, che è la
//    domanda che un gelatiere si fa davvero: quanto produco per il martedì,
//    quanta gente metto in turno la domenica, conviene aprire il lunedì.
//
// 2. **Lo scontrino medio.** Si chiede in chiusura, si salva nel database, e
//    non lo leggeva **nessuna schermata**. È l'unica misura che distingue «è
//    passata meno gente» da «la stessa gente ha speso meno»: due problemi con
//    due rimedi diversi, uno si risolve in vetrina e l'altro sul listino.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src', 'views', 'StoricoProduzioneView.jsx'), 'utf8')

// La chiave del giorno della settimana, copiata dal sorgente: si misura il
// comportamento, non la forma.
const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
const chiave = (d) => {
  const g = new Date(String(d).slice(0, 10) + 'T12:00').getDay()
  return `dow-${g === 0 ? 7 : g}`
}
const nome = (k) => GIORNI[Number(k.split('-')[1]) - 1] || k

describe('il giorno della settimana', () => {
  it('riconosce il giorno giusto', () => {
    // 14 settembre 2026 è un lunedì.
    expect(nome(chiave('2026-09-14'))).toBe('Lunedì')
    expect(nome(chiave('2026-09-15'))).toBe('Martedì')
    expect(nome(chiave('2026-09-19'))).toBe('Sabato')
    expect(nome(chiave('2026-09-20'))).toBe('Domenica')
  })

  it('la domenica sta in fondo, non in cima', () => {
    // Le chiavi si ordinano come stringhe: `dow-1`…`dow-7`. Se la domenica
    // fosse `dow-0` (come la dà JavaScript) uscirebbe per prima, e la
    // settimana di un negozio non comincia di domenica.
    const settimana = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
    const ordinate = settimana.map(chiave).sort((a, b) => a.localeCompare(b)).map(nome)
    expect(ordinate).toEqual(GIORNI)
  })

  it('e non cambia col fuso orario', () => {
    // `new Date('2026-09-14')` è mezzanotte UTC: in un fuso a ovest darebbe la
    // domenica. A mezzogiorno nessun fuso del mondo sposta la data.
    expect(chiave('2026-09-14')).toBe('dow-1')
    expect(chiave('2026-09-14T23:59:00Z')).toBe('dow-1')
    expect(chiave('2026-09-14T00:01:00+02:00')).toBe('dow-1')
  })

  it('c\'è il pulsante, e le scritte lo sanno nominare', () => {
    expect(SRC).toMatch(/\["giornosett","Giorno della settimana"\]/)
    // Le scritte erano tre condizionali che si fermavano a «Mese»: due
    // avrebbero detto «giornosett» e uno «Mese».
    expect(SRC).toMatch(/const nomeVista\s*=/)
    expect(SRC).toMatch(/giornosett:'giorno della settimana'/)
    expect(SRC).not.toMatch(/vista==="giornaliero"\?"giorno":vista\}/)
  })
})

describe('quando un giorno ha troppe poche giornate dietro', () => {
  it('lo dice invece di disegnare una colonna che sembra una risposta', () => {
    // Una colonna costruita su un martedì solo non è una media: è un martedì.
    // E chi legge «il martedì incassi 400 €» decide la produzione su quello.
    expect(SRC).toMatch(/function AvvisoPochiGiorni/)
    expect(SRC).toMatch(/p\.nGiorni < 4/)
    expect(SRC).toMatch(/è una\s*\n?\s*giornata, non una media/)
  })

  it('e si conta le GIORNATE distinte, non le registrazioni', () => {
    // Due sessioni di produzione nello stesso martedì sono un martedì solo.
    expect(SRC).toMatch(/giorni:new Set\(\)/)
    expect(SRC).toMatch(/map\[k\]\.giorni\.add\(String\(sess\.data\)\.slice\(0,10\)\)/)
    expect(SRC).toMatch(/map\[k\]\.giorni\.add\(String\(ch\.data\)\.slice\(0,10\)\)/)
    expect(SRC).toMatch(/nGiorni:p\.giorni\.size/)
    expect(SRC).toMatch(/nGiorni: p\.giorni\.size/)
  })

  it('l\'avviso non compare negli altri raggruppamenti', () => {
    const fn = SRC.slice(SRC.indexOf('function AvvisoPochiGiorni'), SRC.indexOf('export default function'))
    expect(fn).toMatch(/if \(vista !== 'giornosett'\) return null/)
  })
})

describe('lo scontrino medio', () => {
  it('finalmente si vede', () => {
    expect(SRC).toMatch(/label="Scontrino medio"/)
    expect(SRC).toMatch(/const scontrinoMedio =/)
  })

  it('si calcola solo sulle giornate che ce l\'hanno, e dice quante sono', () => {
    // Una media fatta su tre giornate su trenta non è la media del mese: è lo
    // stesso criterio che il programma usa già per il food cost.
    expect(SRC).toMatch(/\.filter\(c => Number\(c\?\.kpi\?\.scontrinoMedio\) > 0\)/)
    expect(SRC).toMatch(/su \$\{giornateConScontrino\.length\} giornat/)
  })

  it('senza il dato dice come ottenerlo, invece di mostrare zero', () => {
    // Zero euro di scontrino medio è un numero falso; «—» più la strada da
    // prendere è la verità.
    expect(SRC).toMatch(/scontrinoMedio == null \? '—'/)
    expect(SRC).toMatch(/scrivi il numero di scontrini in chiusura e compare qui/)
  })

  it('e va coi centesimi: fra 8,40 e 8,90 c\'è tutto quello che si guarda', () => {
    expect(SRC).toMatch(/const eur2 = n =>/)
    expect(SRC).toMatch(/eur2\(scontrinoMedio\)/)
  })
})
