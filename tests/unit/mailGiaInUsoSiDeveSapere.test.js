// ── «Mail già in uso» va detto, e va detto guardando dappertutto ─────────
//
// Richiesta del titolare, 21/09/2026: «se inserisco una mail il sistema deve
// controllare se quella mail è già presente in qualsiasi punto del nostro
// sistema, se è già presente deve dare l'avviso, mail già in uso».
//
// ── Il difetto, misurato ────────────────────────────────────────────────
//
// `api/laboratorio-crea.js` controllava così:
//
//     supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
//
// cioè **guardava i primi duecento utenti**. Al 21/09/2026 in `auth.users` ce
// ne sono **2.343**: il 91% delle mail esistenti era invisibile al controllo.
// Una mail già di qualcun altro passava, nasceva un secondo accesso sulla
// stessa identità, e il guaio si scopriva il giorno in cui uno dei due non
// riusciva più a entrare.
//
// Non è un difetto teorico che scatta a un certo numero di clienti: scattava
// già, e in silenzio. Il controllo diceva «libera» perché non aveva guardato,
// non perché avesse guardato e trovato niente — che è il modo peggiore in cui
// un controllo può sbagliare.
//
// ── Cosa prova questo file ──────────────────────────────────────────────
//
// Che la regola resti **scritta nella migrazione** (un database si ricrea da
// zero, e se la migrazione sparisce il buco torna) e che l'endpoint non torni
// a paginare.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RADICE, 'supabase', 'migrations')
const FILE = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

/** Il corpo dell'ultima definizione di una funzione, fra tutte le migrazioni. */
function corpoUltimo(nome) {
  let ultimo = null
  for (const f of FILE) {
    const sql = readFileSync(join(DIR, f), 'utf8')
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nome}\\s*\\(`, 'gi')
    let m
    while ((m = re.exec(sql)) !== null) {
      const resto = sql.slice(m.index)
      const tag = resto.match(/\bas\s+(\$[a-z_]*\$)/i)
      if (!tag) continue
      const apre = resto.indexOf(tag[1]) + tag[1].length
      const chiude = resto.indexOf(tag[1], apre)
      ultimo = resto.slice(apre, chiude === -1 ? undefined : chiude).replace(/--[^\n]*/g, '')
    }
  }
  return ultimo
}

describe('La funzione che dice se una mail è già in uso', () => {
  const corpo = corpoUltimo('email_gia_in_uso')

  it('esiste nelle migrazioni', () => {
    expect(corpo, 'la funzione non c\'è: un database ricreato da zero non avrebbe il controllo').toBeTruthy()
  })

  it('guarda gli accessi, i profili E gli inviti in sospeso', () => {
    // Gli inviti sono i più insidiosi: chi è stato invitato e non è ancora
    // entrato NON ha un utente, quindi un controllo su `auth.users` non lo
    // vede. Due persone invitate con la stessa mail in due aziende diverse,
    // e la prima che accetta si prende l'altra.
    expect(corpo).toMatch(/auth\.users/)
    expect(corpo).toMatch(/public\.profiles/)
    expect(corpo).toMatch(/org_inviti/)
  })

  it('confronta senza distinguere le maiuscole', () => {
    // «Mario@x.it» e «mario@x.it» sono la stessa persona, e nessuno se lo
    // ricorda quando scrive.
    const lower = (corpo.match(/lower\(/g) || []).length
    expect(lower, 'il confronto è sensibile alle maiuscole').toBeGreaterThanOrEqual(3)
  })

  it('non fa uscire di chi è la mail, solo se è occupata', () => {
    // Sapere che una mail è occupata serve a chi compila un modulo. Sapere di
    // quale azienda è, no: sarebbe un modo per farsi raccontare chi sono i
    // clienti di Foodos.
    expect(corpo).not.toMatch(/organization_id'\s*,/)
    expect(corpo).toMatch(/'in_uso'/)
  })

  it('e a un dipendente non risponde', () => {
    // Gli account li crea il titolare: un dipendente non ha nessun motivo di
    // poter provare indirizzi uno per uno.
    expect(corpo).toMatch(/is_dipendente\(\)/)
  })

  it('una mail scritta male non risulta «libera»', () => {
    // Rispondere «libera» a chi ha sbagliato a scrivere lo manderebbe avanti
    // convinto, e l'errore si scoprirebbe al primo tentativo di accesso.
    expect(corpo).toMatch(/'valida'/)
  })
})

describe('Il permesso di chiamarla', () => {
  it('è dato ai soli autenticati, non a chi passa di lì', () => {
    const tutte = FILE.map(f => readFileSync(join(DIR, f), 'utf8')).join('\n')
    expect(tutte).toMatch(/grant execute on function public\.email_gia_in_uso\(text\) to authenticated/)
    expect(tutte).toMatch(/revoke all on function public\.email_gia_in_uso\(text\) from public/)
  })
})

describe('L\'endpoint che crea il laboratorio', () => {
  const testoIntero = readFileSync(join(RADICE, 'api/laboratorio-crea.js'), 'utf8')
  // Via i commenti prima di cercare: il commento che **spiega** la correzione
  // nomina `listUsers({ page: 1, perPage: 200 })`, ed è giusto che lo faccia —
  // senza, fra sei mesi nessuno sa più perché quella riga è sparita. Ma un
  // controllo che legge anche i racconti trova il difetto nella sua stessa
  // spiegazione. Qui contano le chiamate, non le storie.
  const src = testoIntero
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

  it('non pagina più fra i primi duecento utenti', () => {
    // È il difetto: `perPage: 200` su 2.343 utenti.
    expect(src).not.toMatch(/listUsers\s*\(\s*\{[^}]*perPage/)
  })

  it('chiede al database, che li guarda tutti', () => {
    expect(src).toMatch(/email_gia_in_uso/)
  })

  it('e se non riesce a verificare NON crea l\'account', () => {
    // Un account doppio si disfa molto peggio di quanto costi riprovare fra
    // un minuto: nel dubbio ci si ferma.
    const i = src.indexOf('email_gia_in_uso')
    const dopo = src.slice(i, i + 900)
    expect(dopo).toMatch(/errUsata/)
    expect(dopo).toMatch(/503|Riprova/)
  })

  it('il messaggio dice cosa fare, non solo che c\'è un problema', () => {
    // Qui si guarda il file intero: il messaggio è una stringa, e `src` le
    // stringhe non le toglie ma i commenti sì — va bene comunque.
    expect(testoIntero).toMatch(/già in uso/)
    expect(testoIntero).toMatch(/laboratorio-torino@/)
  })
})

describe('Il righello di questo file', () => {
  it('saprebbe accorgersi se la funzione sparisse', () => {
    // Taratura: la stessa ricerca su un nome inventato non trova niente.
    // Senza questa prova, un errore di battitura nel nome renderebbe verdi
    // tutte le prove qui sopra per sempre.
    expect(corpoUltimo('funzione_che_non_esiste_mai')).toBe(null)
  })

  it('e legge davvero le migrazioni, non una cartella vuota', () => {
    expect(FILE.length).toBeGreaterThan(20)
  })
})
