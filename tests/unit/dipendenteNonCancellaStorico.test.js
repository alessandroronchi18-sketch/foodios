// Una chiave che il dipendente non può leggere, il dipendente non la può
// riscrivere.
//
// Il difetto, trovato il 16/09/2026 leggendo il database di produzione in sola
// lettura. Ci sono due elenchi di chiavi di `user_data`:
//
//   `is_chiave_operativa`  → le 6 su cui il dipendente può scrivere
//   `is_chiave_sensibile`  → le 12 che al dipendente sono nascoste
//
// Nessuno aveva mai guardato la loro sovrapposizione. Una chiave sta in tutti e
// due: `pasticceria-giornaliero-v1`, lo storico della produzione. E siccome
// `user_data` tiene ogni chiave come un unico blocco JSON, «scrivere» vuol dire
// «sostituire tutto»: il dipendente poteva svuotare uno storico che non vedeva,
// da tre porte diverse (DELETE sulla riga, UPDATE sulla riga, la funzione
// `fos_user_data_set_batch` che gira in SECURITY DEFINER).
//
// Sul database, il giorno in cui è stato trovato: Gelateria Demo 142 giornate
// (56 kB), Mara dei Boschi 2, Pasticceria Mara 1 una.
//
// Perché la suite era verde: `tests/07-dipendente-rls.spec.js` prova cinque
// chiavi sensibili e sono tutte e cinque NON operative. Il caso che conta —
// quella che è tutte e due le cose — non lo provava nessuno. Il righello
// misurava dappertutto tranne che nel punto rotto.
//
// La prova d'attacco vera sta in `tests/12-sicurezza-chiave-pubblica.spec.js`
// («il dipendente non cancella lo storico che non vede»), che crea
// un'organizzazione finta e prova a svuotarla davvero. Questo file guarda una
// cosa diversa: che la REGOLA resti scritta nelle migrazioni, perché un
// database si può ricreare da zero e se la migrazione sparisce il buco torna.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')
// Le migrazioni si applicano in ordine di nome: l'ultima definizione vince.
const FILE = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
const leggi = (f) => readFileSync(join(DIR, f), 'utf8')

// Prende l'ULTIMA definizione di una funzione e ne estrae le chiavi elencate.
function chiaviDi(nomeFunzione) {
  for (let i = FILE.length - 1; i >= 0; i--) {
    const sql = leggi(FILE[i])
    const re = new RegExp(`function\\s+public\\.${nomeFunzione}\\s*\\(`, 'i')
    const inizio = sql.search(re)
    if (inizio === -1) continue
    // Il corpo sta fra i due delimitatori $...$; basta il primo pezzo.
    const corpo = sql.slice(inizio, inizio + 2000)
    const elencate = corpo.match(/'[a-z0-9-]+-v\d+'/gi) || []
    if (elencate.length === 0) continue
    return { file: FILE[i], chiavi: new Set(elencate.map(s => s.slice(1, -1))) }
  }
  throw new Error(`nessuna definizione trovata per ${nomeFunzione}`)
}

// Prende l'ULTIMA definizione di una policy su user_data.
function policy(nome) {
  for (let i = FILE.length - 1; i >= 0; i--) {
    const sql = leggi(FILE[i])
    const re = new RegExp(`create\\s+policy\\s+"?${nome}"?\\s+on\\s+public\\.user_data`, 'i')
    const inizio = sql.search(re)
    if (inizio === -1) continue
    const resto = sql.slice(inizio)
    // Fino al punto e virgola che chiude l'istruzione.
    const fine = resto.indexOf(';')
    return { file: FILE[i], testo: (fine === -1 ? resto : resto.slice(0, fine)).toLowerCase() }
  }
  throw new Error(`nessuna definizione trovata per la policy ${nome}`)
}

const OPERATIVE = chiaviDi('is_chiave_operativa')
const SENSIBILI = chiaviDi('is_chiave_sensibile')
const ENTRAMBE = [...OPERATIVE.chiavi].filter(k => SENSIBILI.chiavi.has(k))

describe('gli elenchi di chiavi dicono ancora quello che dicevano', () => {
  // Verifica del righello: se la lettura delle migrazioni si rompe (un nome di
  // file cambia, una funzione viene spostata), i controlli sotto passerebbero
  // a vuoto su insiemi vuoti. Qui si pretende che abbiano trovato qualcosa di
  // sensato prima di fidarsene.
  it('le due funzioni si leggono e contengono le chiavi attese', () => {
    expect(OPERATIVE.chiavi.size, `elenco operative vuoto (letto da ${OPERATIVE.file})`).toBeGreaterThanOrEqual(6)
    expect(SENSIBILI.chiavi.size, `elenco sensibili vuoto (letto da ${SENSIBILI.file})`).toBeGreaterThanOrEqual(10)
    expect(OPERATIVE.chiavi.has('pasticceria-magazzino-v1')).toBe(true)
    expect(SENSIBILI.chiavi.has('pasticceria-ricettario-v1')).toBe(true)
  })

  it('la sovrapposizione esiste, ed è quella che ci aspettiamo', () => {
    // Non si pretende che sia vuota: il dipendente DEVE registrare la
    // produzione, quindi quella chiave resta operativa. Si pretende che sia
    // conosciuta. Se domani ne compare un'altra, questo test lo dice, e chi la
    // aggiunge deve venire a leggere perché è un caso delicato.
    expect(ENTRAMBE).toEqual(['pasticceria-giornaliero-v1'])
  })
})

describe('le chiavi che il dipendente non legge, il dipendente non le riscrive', () => {
  // Il controllo scatta solo se c'è davvero una sovrapposizione: se un giorno
  // gli elenchi venissero separati, il problema sparirebbe alla radice e non
  // avrebbe senso pretendere la condizione nelle policy.
  const serve = ENTRAMBE.length > 0

  for (const nome of ['data_insert_own', 'data_update_own', 'data_delete_own']) {
    it(`${nome} esclude le chiavi sensibili dal ramo del dipendente`, () => {
      if (!serve) return
      const p = policy(nome)
      expect(p.testo,
        `${nome} (definita in ${p.file}) ammette il dipendente su ${ENTRAMBE.join(', ')}: ` +
        'chiavi che non può leggere e che scrivendole sostituirebbe per intero')
        .toMatch(/not\s+public\.is_chiave_sensibile\s*\(\s*data_key\s*\)/)
    })
  }

  it('anche la funzione che scavalca le regole di riga si ferma', () => {
    if (!serve) return
    // `fos_user_data_set_batch` è SECURITY DEFINER: le policy qui sopra non la
    // toccano. La guardia va ripetuta dentro, come già si fa per
    // `is_chiave_operativa`.
    let ultima = null
    for (let i = FILE.length - 1; i >= 0 && !ultima; i--) {
      const sql = leggi(FILE[i])
      if (/function\s+public\.fos_user_data_set_batch/i.test(sql)) ultima = { file: FILE[i], sql }
    }
    expect(ultima, 'fos_user_data_set_batch non è definita in nessuna migrazione').toBeTruthy()
    expect(ultima.sql.toLowerCase(),
      `fos_user_data_set_batch (ultima versione in ${ultima.file}) non rifiuta le chiavi sensibili al dipendente`)
      .toMatch(/v_dip\s+and\s+public\.is_chiave_sensibile\s*\(\s*v_key\s*\)/)
  })

  it('il magazzino resta scrivibile: la correzione non chiude il lavoro vero', () => {
    // Le altre cinque chiavi operative non sono sensibili, quindi la
    // condizione nuova non le tocca. Se qualcuno spostasse il magazzino fra le
    // sensibili, il dipendente non potrebbe più registrare i rifornimenti: qui
    // se ne accorgerebbe subito.
    expect(SENSIBILI.chiavi.has('pasticceria-magazzino-v1'),
      'il magazzino è diventato sensibile: il dipendente non può più scriverlo').toBe(false)
    expect(SENSIBILI.chiavi.has('pasticceria-chiusure-v1'),
      'le chiusure sono diventate sensibili: il dipendente non può più registrare la cassa').toBe(false)
  })
})
