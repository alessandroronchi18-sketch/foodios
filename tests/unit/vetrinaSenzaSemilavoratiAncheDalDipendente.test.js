// ── Un semilavorato in vetrina non ci va, da nessuna delle tre strade ─────
//
// La vetrina (`stock_prodotti_finiti`) è quello che la cassa scarica quando
// vende. Una base — la base bianca, lo zabaione — non si vende: entra dentro
// altre ricette. Caricarla in vetrina mette lì una riga che nessuno
// scaricherà mai, e che resta a gonfiare le giacenze per sempre.
//
// Sui dati veri del design partner: 5 semilavorati, 2 dei quali stanno in
// magazzino, e 29 ricette su 68 usano la base bianca.
//
// ── Perché questo file esiste (21/09/2026) ──────────────────────────────
//
// Alla produzione si arriva da **tre strade**, e il guardiano era su due:
//
//   1. il trasferimento fra sedi          — ce l'aveva dal 09/09
//   2. la pagina del titolare             — corretta il 21/09
//   3. **il percorso del dipendente**, che registra dal laboratorio e passa
//      dal server (`api/produzione-registra.js`) — **non ce l'aveva**
//
// È la forma di difetto che questo progetto ha già pagato tre volte: la
// stessa regola scritta in più posti, e uno resta indietro. Chi la trova
// guarda il codice del titolare, la vede giusta, e non pensa che il
// dipendente passi da un'altra parte.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')

describe('Il guardiano sta su tutte e tre le strade', () => {
  it('sul percorso del dipendente, che passa dal server', () => {
    const api = leggi('api/produzione-registra.js')
    // Il carico in vetrina è la chiamata a `stock_pf_carico_produzione`.
    const i = api.indexOf('stock_pf_carico_produzione')
    expect(i, 'il carico in vetrina non c\'è più: questo file va riscritto').toBeGreaterThan(0)
    // Il guardiano deve stare PRIMA della chiamata, nello stesso giro.
    const prima = api.slice(0, i)
    expect(prima).toMatch(/tipo\s*===\s*'semilavorato'/)
  })

  it('sulla pagina del titolare', () => {
    const vista = leggi('src/views/ProduzioneGiornalieraView.jsx')
    expect(vista).toMatch(/vaInVetrina/)
    expect(vista).toMatch(/tipo\s*!==\s*'semilavorato'/)
  })

  it('e nel trasferimento fra sedi', () => {
    const vista = leggi('src/views/ProduzioneGiornalieraView.jsx')
    // Il guardiano compare più di una volta: conferma, modifica, eliminazione
    // e trasferimento devono essere specchio l'una dell'altra, se no
    // eliminare porta la vetrina sotto zero su merce mai entrata.
    const quante = (vista.match(/vaInVetrina\(/g) || []).length
    expect(quante, 'il guardiano è applicato in un punto solo: le tre operazioni devono essere specchio').toBeGreaterThan(1)
  })
})

describe('Il righello di questo file', () => {
  it('i file che guarda esistono davvero', () => {
    // Se un percorso cambiasse, `readFileSync` lancerebbe invece di lasciare
    // il test verde su niente: è già una garanzia. Qui si controlla che
    // dentro ci sia il codice che ci aspettiamo.
    expect(leggi('api/produzione-registra.js')).toMatch(/prodottiSess/)
    expect(leggi('src/views/ProduzioneGiornalieraView.jsx')).toMatch(/handleConferma/)
  })

  it('e saprebbe accorgersi se il guardiano sparisse', () => {
    // Taratura: la stessa ricerca su un testo senza guardiano non trova
    // niente. Senza questa prova, un errore di battitura nel `toMatch`
    // renderebbe verdi le tre prove qui sopra per sempre.
    const finto = 'for (const p of prodotti) { await rpc("stock_pf_carico_produzione") }'
    expect(/tipo\s*===\s*'semilavorato'/.test(finto)).toBe(false)
  })
})
