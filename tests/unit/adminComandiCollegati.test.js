// I comandi del pannello admin devono arrivare davvero a destinazione.
//
// Il pannello e l'endpoint sono due file lontani, e il collegamento fra loro
// è una stringa. Il 15/09/2026 sei comandi su trentasei erano scollegati:
// l'endpoint pretendeva un `orgId` da tutti tranne un elenco di eccezioni, e
// quei sei non erano nell'elenco. Rispondevano «orgId mancante» e basta.
// Riscontro: in `admin_log`, su tutto lo storico, nessuno dei sei era mai
// andato a buon fine — editor SQL, blocca dominio, sblocca dominio, codice
// sconto ad-hoc, approva e rifiuta cambio metodo.
//
// Questi test leggono i due file veri e verificano che continuino a parlarsi.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = join(import.meta.dirname, '../..')
const ADMIN_API = readFileSync(join(RADICE, 'api/admin.js'), 'utf8')

// I file del pannello, tutti insieme, con il nome davanti per i messaggi.
const PANNELLO = readdirSync(join(RADICE, 'src/admin'))
  .filter(f => f.endsWith('.jsx') || f.endsWith('.js'))
  .map(f => ({ file: `src/admin/${f}`, testo: readFileSync(join(RADICE, 'src/admin', f), 'utf8') }))

// Via i commenti, o si finisce per verificare le spiegazioni invece del codice:
// è già successo cinque volte in questo progetto.
const vivo = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(r => !/^\s*(\/\/|\*)/.test(r)).join('\n')

const API_VIVA = vivo(ADMIN_API)

/** Le azioni gestite dallo switch di api/admin.js. */
function azioniGestite() {
  return new Set([...API_VIVA.matchAll(/case\s+'([a-z_0-9]+)'\s*:/g)].map(m => m[1]))
}

/** L'elenco delle azioni che l'endpoint pretende accompagnate da un orgId. */
function azioniConOrgId() {
  const blocco = API_VIVA.match(/const azioniConOrgId = new Set\(\[([\s\S]*?)\]\)/)
  expect(blocco, 'azioniConOrgId non trovato in api/admin.js').toBeTruthy()
  return new Set([...blocco[1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]))
}

/**
 * Le azioni che il pannello chiama **senza** passare dal collaboratore
 * `azione(orgId, tipo, …)`, cioè costruendo il corpo a mano. Sono quelle a
 * rischio: se il corpo non contiene `orgId`, l'endpoint le rifiuta.
 */
function chiamateAMano() {
  const fuori = []
  for (const { file, testo } of PANNELLO) {
    const t = vivo(testo)
    for (const m of t.matchAll(/JSON\.stringify\(\{([^}]*)\}/g)) {
      const corpo = m[1]
      const tipo = corpo.match(/tipo:\s*'([a-z_0-9]+)'/)
      if (!tipo) continue
      fuori.push({ file, tipo: tipo[1], mandaOrgId: /\borgId\b/.test(corpo) })
    }
  }
  return fuori
}

describe('pannello admin: i comandi arrivano a destinazione', () => {
  it('ogni comando che il pannello chiama esiste nell\'endpoint', () => {
    const gestite = azioniGestite()
    // `azione(org, 'x')` passa il tipo come secondo argomento.
    const viaCollaboratore = new Set()
    for (const { testo } of PANNELLO) {
      for (const m of vivo(testo).matchAll(/\bazione\(\s*[^,]+,\s*'([a-z_0-9]+)'/g)) {
        viaCollaboratore.add(m[1])
      }
    }
    const aMano = new Set(chiamateAMano().map(c => c.tipo))
    for (const tipo of [...viaCollaboratore, ...aMano]) {
      expect(gestite.has(tipo), `il pannello chiama "${tipo}" ma l'endpoint non lo gestisce`).toBe(true)
    }
  })

  it('nessun comando chiamato senza orgId è fra quelli che lo pretendono', () => {
    const pretendono = azioniConOrgId()
    const rotti = chiamateAMano()
      .filter(c => !c.mandaOrgId && pretendono.has(c.tipo))
      .map(c => `${c.tipo} (${c.file})`)
    expect(rotti, `comandi che risponderebbero «orgId mancante»:\n  ${rotti.join('\n  ')}`).toEqual([])
  })

  it('i sei comandi che erano scollegati non pretendono più un orgId', () => {
    const pretendono = azioniConOrgId()
    for (const t of ['sql_query', 'email_blocklist_aggiungi', 'email_blocklist_rimuovi',
                     'genera_codice_ad_hoc', 'metodo_richiesta_approva', 'metodo_richiesta_rifiuta']) {
      expect(pretendono.has(t), `"${t}" è tornato a pretendere un orgId`).toBe(false)
    }
  })

  it('le azioni che agiscono su un cliente preciso lo pretendono davvero', () => {
    // Il verso opposto: un comando distruttivo che smette di chiedere su chi
    // agire è peggio di uno che non parte.
    const pretendono = azioniConOrgId()
    for (const t of ['elimina', 'blocca', 'riattiva', 'impersona', 'cambia_piano',
                     'reset_password', 'regala_mesi', 'estendi_trial']) {
      expect(pretendono.has(t), `"${t}" non chiede più su quale cliente agire`).toBe(true)
    }
  })

  it('ogni azione elencata in azioniConOrgId esiste davvero nello switch', () => {
    const gestite = azioniGestite()
    for (const t of azioniConOrgId()) {
      expect(gestite.has(t), `azioniConOrgId elenca "${t}", che lo switch non gestisce`).toBe(true)
    }
  })

  it('l\'elenco è scritto in positivo, non come elenco di eccezioni', () => {
    // La forma vecchia («tutte tranne queste») faceva nascere rotto ogni
    // comando nuovo: chi lo scriveva non sapeva di dover aggiungere il
    // proprio nome a un elenco in un altro punto del file.
    expect(API_VIVA).not.toMatch(/azioniSenzaOrgId/)
  })
})
