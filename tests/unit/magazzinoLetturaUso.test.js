// Magazzino: i difetti di lettura e di uso trovati dal primo audit.
//
// Sono difetti che non rompono un calcolo ma rendono la pagina inservibile, e
// alcuni portano a sbagliare un'operazione:
//
//   - 40 ingredienti su 48 dichiarati ESAURITI in rosso perché nessuno li aveva
//     mai pesati: un allarme sempre acceso copre i tre davvero finiti;
//   - la lista movimenti quasi tutta rossa in una giornata normale, perché ogni
//     vendita è un delta negativo;
//   - il modo "scarico" restava impostato dopo il salvataggio: chi caricava
//     merce nuova sottraeva invece di aggiungere;
//   - i prezzi cambiavano da soli salvando senza toccare il campo (l'input ha
//     due decimali, l'archivio quattro);
//   - le tabelle non scorrevano su telefono e i messaggi d'errore arrivavano in
//     inglese tecnico da Postgres.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const src = readFileSync(join(RADICE, 'src', 'views', 'MagazzinoView.jsx'), 'utf8')

describe('stato degli ingredienti', () => {
  it('distingue "mai contato" da "esaurito"', () => {
    // giacenza 0 può voler dire "finito" oppure "nessuno l'ha mai pesato": nel
    // magazzino reale di Mara il secondo caso è 40 su 48.
    expect(src).toMatch(/!inMagazzino \? 'mai_contato'/)
    expect(src).toMatch(/const inMagazzino = !!magPerNorm\[k\]/)
  })

  it('"mai contato" è grigio e non rosso, e sta in fondo', () => {
    expect(src).toMatch(/s === 'mai_contato' \? C\.textSoft/)
    expect(src).toMatch(/s === 'mai_contato' \? 'Mai contato'/)
    expect(src).toMatch(/mai_contato: 5/)
  })

  it('non dice "tutto ok" quando gli ingredienti non sono mai stati pesati', () => {
    expect(src).toMatch(/da inventariare/)
  })
})

describe('colori: il rosso solo dove c è da agire', () => {
  it('nei movimenti il rosso è riservato agli scarti', () => {
    // Ogni chiusura scrive una vendita per prodotto: i delta negativi sono la
    // normalità, e colorarli di rosso rendeva rossa tutta la pagina.
    expect(src).toMatch(/m\.causale === 'scarto' \? C\.red : C\.text/)
  })

  it('"Inviato" non è rosso: mandare merce a un altra sede è normale', () => {
    expect(src).not.toMatch(/trasferimento_invio.*#DC2626/)
    expect(src).toMatch(/trasferimento_invio: \{ lbl: 'Inviato', ic: 'truck', col: T\.blue \}/)
  })

  it('nello storico carichi i prelievi non sono verdi come i carichi', () => {
    expect(src).toMatch(/Number\(r\.quantita_g\) < 0 \? C\.amber : C\.green/)
  })
})

describe('numeri e date', () => {
  it('i delta dei movimenti hanno il punto delle migliaia', () => {
    expect(src).toMatch(/Math\.abs\(d\)\.toLocaleString\('it-IT'\)/)
  })

  it('le date dicono anche l anno, o quanti giorni sono passati', () => {
    // Senza anno, una giacenza ferma da un anno sembrava di ieri — e questa
    // colonna è l'unico posto dove si vedono le giacenze morte.
    expect(src).toMatch(/const dataLeggibile = \(iso\) =>/)
    expect(src).toMatch(/year: 'numeric'/)
    expect(src).toMatch(/giorni === 1\) return `ieri/)
  })

  it('il simbolo euro sta dopo la cifra', () => {
    // Regola della casa, ed è come si scrive in italiano.
    expect(src).not.toMatch(/>€ \{/)
  })
})

describe('operazioni che si possono sbagliare', () => {
  it('dopo un salvataggio il form torna su "carico"', () => {
    // Il modo restava impostato: chi registrava uno scarico e poi caricava
    // merce nuova sottraeva invece di aggiungere.
    expect(src).toMatch(/setQuickLoad\(null\); setFormMode\('carico'\)/)
  })

  it('il form dice quanto ce n è adesso e quanto resterà', () => {
    expect(src).toMatch(/Adesso in magazzino:/)
    expect(src).toMatch(/andrebbe sotto zero/)
  })

  it('salvare un prezzo senza toccarlo non lo cambia', () => {
    // L'input mostra due decimali, l'archivio ne ha quattro: il confronto
    // esatto faceva scendere 0,8825 a 0,88 da solo.
    expect(src).toMatch(/const visto = Math\.round\(\(Number\(row\.prezzoKg\) \|\| 0\) \* 100\) \/ 100/)
    expect(src).toMatch(/Math\.abs\(v - visto\) < 0\.005/)
  })

  it('un nome di soli spazi non crea una voce senza nome', () => {
    expect(src).toMatch(/if \(!newIngNome \|\| !newIngNome\.trim\(\)\)/)
  })

  it('le finestre si chiudono con Esc, ma non mentre salvano', () => {
    expect(src).toMatch(/if \(e\.key === 'Escape' && !saving\) setScartoForm\(null\)/)
    expect(src).toMatch(/onClick=\{\(\) => \{ if \(!saving\) setScartoForm\(null\) \}\}/)
    expect(src).toMatch(/if \(!salvandoPrezzo\) setConfirmKey\(null\)/)
  })
})

describe('quello che la pagina dichiara di non sapere', () => {
  it('dice quando giorni di scorta e riordino sono stime', () => {
    // Senza sessioni di produzione registrate il consumo è un'ipotesi del
    // software: un impasto per ricetta a settimana.
    expect(src).toMatch(/stimato: ultimi7\.length === 0/)
    expect(src).toMatch(/sono stime/)
  })

  it('distingue il prezzo che hai scritto da quello di mercato', () => {
    // Nel ricettario reale sono 6 prezzi veri su 422.
    expect(src).toMatch(/isStima: !!c\?\.isStima/)
    expect(src).toMatch(/stima di mercato/)
  })

  it('dice quando la lista dei movimenti è tagliata', () => {
    expect(src).toMatch(/ce ne sono altri più indietro/)
    expect(src).toMatch(/Mostra altri 100 movimenti/)
  })

  it('nello storico prezzi si vede da quando vale e chi l ha cambiato', () => {
    expect(src).toMatch(/l\.decorre_da \|\| l\.data/)
    expect(src).toMatch(/\(futuro\)/)
    expect(src).toMatch(/String\(l\.utente\)\.split\('@'\)\[0\]/)
  })
})

describe('leggibilità e mobile', () => {
  it('le tabelle scorrono su telefono invece di schiacciarsi', () => {
    // Un wrapper in overflowX auto non basta: senza minWidth la tabella non
    // supera mai il contenitore e lo scroll non parte.
    const minWidths = src.match(/minWidth: \d+/g) || []
    expect(minWidths.length).toBeGreaterThanOrEqual(6)
  })

  it('la barra delle schede è dichiarata come tale e segnala che scorre', () => {
    expect(src).toMatch(/role="tablist"/)
    expect(src).toMatch(/aria-selected=\{tab === id\}/)
    expect(src).toMatch(/WebkitMaskImage: isMobile/)
  })

  it('le etichette dei campi sono <label> collegate al loro campo', () => {
    for (const id of ['mag-ing-input', 'mag-qty-input', 'mag-note-input']) {
      expect(src, `htmlFor di ${id}`).toContain(`htmlFor="${id}"`)
      expect(src, `id di ${id}`).toContain(`id="${id}"`)
    }
  })

  it('c è la ricerca sulle giacenze, come nella scheda prezzi', () => {
    expect(src).toMatch(/const \[magSearch, setMagSearch\]/)
    expect(src).toMatch(/const righeFiltrate = magSearch\.trim\(\)/)
  })

  it('la tabella si apre con quello che manca, non con quello che è a posto', () => {
    expect(src).toMatch(/useSortable\('stato', 'asc'\)/)
  })
})

describe('messaggi in italiano, non in inglese tecnico', () => {
  it('non mostra il messaggio grezzo del database', () => {
    // e.message arriva da Postgres o dalla rete: "duplicate key value violates
    // unique constraint", "Failed to fetch", "JWT expired".
    expect(src).not.toMatch(/notify\(`Errore soglia: \$\{e\.message/)
    expect(src).not.toMatch(/notify\('Errore: ' \+ e\.message/)
    expect(src).not.toMatch(/Salvataggio magazzino fallito: \$\{e\.message/)
  })

  it('dice cosa è successo e cosa fare', () => {
    expect(src).toMatch(/Non ho potuto salvare il magazzino: le giacenze non sono cambiate/)
    expect(src).toMatch(/la voce è ancora al suo posto/)
  })

  it('il dettaglio tecnico va in console, per chi deve indagare', () => {
    const conErrore = (src.match(/console\.error\('\[magazzino\]/g) || []).length
    expect(conErrore).toBeGreaterThanOrEqual(5)
  })
})

describe('stati vuoti che dicono come uscirne', () => {
  it('lo stock vuoto spiega tutte le strade, non una sola', () => {
    expect(src).toMatch(/si riempie in tre modi/)
    expect(src).toMatch(/trasferimento/)
  })

  it('lo storico vuoto offre di registrare un carico', () => {
    expect(src).toMatch(/Registra un carico/)
    expect(src).toMatch(/Si riempie da sola man mano/)
  })
})
