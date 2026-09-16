// Un profilo scritto da soli non fa diventare titolare di un'azienda altrui.
//
// Il difetto, trovato il 16/09/2026 leggendo il database di produzione in sola
// lettura. La regola che permette di crearsi il profilo controlla una cosa
// sola:
//
//     profile_insert_self  →  with check (id = auth.uid())
//
// cioè «la riga deve essere tua». Niente sulle colonne che dicono di CHI sei e
// COSA puoi fare. E sopra `profiles` non c'era nessun trigger BEFORE INSERT:
// quello che esiste, `trg_guard_profile_escalation`, è BEFORE UPDATE, e in un
// inserimento non viene proprio chiamato.
//
// Letto sul database, colonna per colonna:
//
//     authenticated può INSERIRE organization_id .... sì
//     authenticated può INSERIRE ruolo .............. sì
//     authenticated può INSERIRE approvato .......... sì
//     authenticated può AGGIORNARE ruolo ............ no
//
// L'ultima riga è la chiave di lettura: la migrazione `20260914g` ha tolto i
// permessi sulle colonne in AGGIORNAMENTO e si è dimenticata l'INSERIMENTO. La
// porta davanti chiusa, quella sul retro aperta. Una richiesta sola —
// `POST /rest/v1/profiles` con l'id dell'azienda di un altro, `ruolo` titolare
// e `approvato` true — e da lì in poi `get_user_org_id()` risponde con
// l'azienda altrui: ricettario coi costi, cassa, fatture, stipendi.
//
// Serve non avere un profilo, e la strada per finirci è dentro il prodotto:
// `profiles_organization_id_fkey` è ON DELETE CASCADE, quindi cancellare
// un'organizzazione porta via il profilo e lascia in piedi l'utente, con la sua
// password e la mail confermata. Il commento in `api/lib/admin/eliminaCliente.js`
// lo diceva già: «Tracciare fallimenti per evitare utenti orfani che possono
// ancora fare login senza profilo».
//
// (Una correzione all'audit stesso: i 1.635 utenti senza profilo contati quel
// giorno sono tutti account dei test automatici, `@foodos-e2e.test` e
// `@foodios-e2e.test`. Nessun cliente vero era in quello stato. Il buco però
// non dipende da quanti ce ne sono oggi.)
//
// La prova d'attacco vera sta in `tests/12-sicurezza-chiave-pubblica.spec.js`.
// Qui si guarda che i permessi restino scritti nelle migrazioni, e — è la parte
// che ripaga — che nessuna colonna sia protetta in aggiornamento e libera in
// inserimento: la forma esatta del difetto, così non può ripresentarsi su
// un'altra colonna.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')
const FILE = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

// Le colonne di `profiles`, lette dal database il 16/09/2026.
const COLONNE = [
  'id', 'organization_id', 'email', 'nome_completo', 'ruolo', 'approvato',
  'created_at', 'dipendente_codice_set_at', 'dipendente_last_login_at',
  'dipendente_last_login_ip', 'is_laboratorio_account', 'laboratorio_sede_id',
]

// Le colonne che non descrivono la persona ma i suoi poteri. Chi le scrive
// decide a quale azienda appartiene, con che ruolo e se è abilitato.
const COLONNE_DI_POTERE = [
  'organization_id', 'ruolo', 'approvato', 'is_laboratorio_account', 'laboratorio_sede_id',
]

// Rifà in piccolo quello che fa Postgres applicando le migrazioni in ordine.
// Punto di partenza: su una tabella nuova Supabase concede tutto ai due ruoli
// pubblici, quindi ogni colonna è scrivibile finché qualcuno non la toglie.
// `saltaFile` serve alla verifica del righello qui sotto.
function colonneScrivibili(privilegio, ruolo, { saltaFile = null } = {}) {
  let concesse = new Set(COLONNE)
  const p = privilegio.toLowerCase()

  for (const f of FILE) {
    if (saltaFile && f.includes(saltaFile)) continue
    const sql = readFileSync(join(DIR, f), 'utf8').toLowerCase()
    const righe = sql.split(';')
    for (const riga of righe) {
      if (!/on\s+(public\.)?profiles\b/.test(riga)) continue
      const verbo = /^\s*(?:--[^\n]*\n\s*)*(grant|revoke)\b/.exec(riga.trim())
      if (!verbo) continue
      // Il pezzo fra il verbo e "on ... profiles" dice quali privilegi e, fra
      // parentesi, quali colonne.
      const testa = riga.slice(riga.indexOf(verbo[1]) + verbo[1].length, riga.search(/on\s+(public\.)?profiles\b/))
      if (!new RegExp(`\\b${p}\\b`).test(testa)) continue
      // I ruoli stanno dopo "to" (grant) o "from" (revoke).
      const coda = riga.slice(riga.search(/on\s+(public\.)?profiles\b/))
      const ruoli = /\b(?:to|from)\s+([^;]*)$/.exec(coda)
      if (!ruoli) continue
      const bersagli = ruoli[1].split(',').map(s => s.trim())
      if (!bersagli.includes(ruolo) && !bersagli.includes('public')) continue

      // `privilegio (col, col)` = per colonna; senza parentesi = tutta la tabella.
      const conColonne = new RegExp(`\\b${p}\\s*\\(([^)]*)\\)`).exec(testa)
      const colonne = conColonne ? conColonne[1].split(',').map(s => s.trim()) : COLONNE

      if (verbo[1] === 'revoke') for (const c of colonne) concesse.delete(c)
      else for (const c of colonne) concesse.add(c)
    }
  }
  return concesse
}

describe('il simulatore dei permessi sa trovare un buco', () => {
  // Regola del progetto: se un controllo non trova niente, deve prima
  // dimostrare che saprebbe trovare qualcosa. Qui si rilegge la storia
  // togliendo la migrazione del 14/09 che ha protetto le colonne in
  // aggiornamento: senza di lei, `ruolo` deve risultare modificabile.
  it('senza la 20260914g il ruolo risulta modificabile', () => {
    const senza = colonneScrivibili('update', 'authenticated', { saltaFile: '20260914g' })
    expect(senza.has('ruolo'), 'il simulatore non vede nemmeno il buco che c\'era davvero').toBe(true)
  })

  it('con la 20260914g il ruolo non è più modificabile', () => {
    expect(colonneScrivibili('update', 'authenticated').has('ruolo')).toBe(false)
  })
})

describe('su profiles nessuna colonna di potere si scrive dal browser', () => {
  for (const colonna of COLONNE_DI_POTERE) {
    it(`${colonna}: né in inserimento né in aggiornamento`, () => {
      const ins = colonneScrivibili('insert', 'authenticated')
      const upd = colonneScrivibili('update', 'authenticated')
      expect(ins.has(colonna),
        `un utente loggato può INSERIRE profiles.${colonna}: con una riga sola si assegna azienda e ruolo`).toBe(false)
      expect(upd.has(colonna),
        `un utente loggato può AGGIORNARE profiles.${colonna}`).toBe(false)
    })
  }

  it('quello che resta basta a descrivere una persona', () => {
    // Se si chiude troppo, il trigger di registrazione continua a funzionare
    // (gira con la chiave di servizio, i permessi non lo toccano) ma un domani
    // un profilo non si potrebbe più nemmeno creare con nome e mail.
    const ins = colonneScrivibili('insert', 'authenticated')
    for (const c of ['id', 'email', 'nome_completo']) {
      expect(ins.has(c), `senza ${c} un profilo non si può nemmeno scrivere`).toBe(true)
    }
    expect(colonneScrivibili('update', 'authenticated').has('nome_completo'),
      'dalle impostazioni si deve poter cambiare il proprio nome').toBe(true)
  })

  it('protetto in aggiornamento vuol dire protetto anche in inserimento', () => {
    // La forma esatta del difetto del 16/09: le due liste erano diverse. Se
    // domani si protegge una colonna nuova pensando solo all'UPDATE, questo
    // test lo dice prima che diventi una porta.
    const ins = colonneScrivibili('insert', 'authenticated')
    const upd = colonneScrivibili('update', 'authenticated')
    const soloInserimento = [...ins].filter(c => !upd.has(c) && c !== 'id' && c !== 'email')
    expect(soloInserimento,
      'colonne che non si possono aggiornare ma si possono inserire: è da lì che si entra').toEqual([])
  })
})

describe('la guardia sull\'inserimento è scritta e attaccata', () => {
  const tutte = FILE.map(f => readFileSync(join(DIR, f), 'utf8')).join('\n').toLowerCase()

  it('esiste un trigger BEFORE INSERT su profiles', () => {
    expect(tutte,
      'i permessi da soli non bastano: una regola di riga scritta domani potrebbe riaprire tutto')
      .toMatch(/create\s+trigger\s+\w+\s+before\s+insert\s+on\s+public\.profiles/)
  })

  it('la guardia lascia passare la registrazione e il server', () => {
    // `handle_new_user` e le funzioni serverless girano senza un utente
    // davanti: `auth.uid()` è nullo. Se la guardia non li escludesse,
    // nessuno potrebbe più registrarsi.
    const inizio = tutte.indexOf('function public.guard_profile_insert_self')
    expect(inizio, 'la funzione di guardia non c\'è').toBeGreaterThan(-1)
    const corpo = tutte.slice(inizio, inizio + 2000)
    expect(corpo, 'la guardia non lascia passare chi non ha un utente (registrazione, chiave di servizio)')
      .toMatch(/auth\.uid\(\)\s+is\s+null/)
    expect(corpo, 'la guardia non rifiuta l\'azienda scelta da chi si scrive il profilo')
      .toMatch(/new\.organization_id\s+is\s+not\s+null/)
    expect(corpo, 'la guardia non rifiuta l\'auto-approvazione')
      .toMatch(/new\.approvato/)
  })
})
