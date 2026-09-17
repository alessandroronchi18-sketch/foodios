// @vitest-environment happy-dom
//
// La pagina si apre sulla cosa che il pulsante prometteva, e i nomi arrivano interi.
//
// Audit del 16/09/2026, agente «PAGINE». Due difetti diversi, stessa origine:
// nessuno apriva queste pagine dal percorso vero del titolare, e quindi
// nessuno aveva mai visto cosa succede al primo colpo d'occhio.
//
//  • **«Da fare» apriva una chat.** `AzioniView` si raggiunge in un modo solo:
//    la scheda «Da fare» dentro l'Assistente AI (`menuFoodos.js`). Partiva su
//    `tab = "chat"`: si premeva «Da fare» e usciva una chat con l'AI — per
//    giunta la stessa cosa della scheda di fianco, «Chiedi». Le azioni da fare
//    erano dietro un secondo clic che nessuno aveva motivo di dare.
//
//  • **Il nome della categoria mangiato, nel Marketplace.** Le etichette
//    avevano l'emoji dentro il nome, e per ripulirle la scheda del fornitore
//    buttava via la prima parola (`lbl.split(' ').slice(1)`). Sulle quattro
//    categorie **senza** emoji quella prima parola era il nome: «Frutta secca»
//    diventava «secca», «Latticini» spariva e al suo posto compariva
//    l'identificativo del database (`latticini`). Le emoji sono andate via
//    (regola del progetto: le icone si disegnano col componente `Icon`) e con
//    loro il motivo di tagliare le parole.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')
// Una riga di commento non arriva mai sullo schermo del titolare: i controlli
// sul sorgente guardano solo le righe vive.
const eCommento = (r) => /^\s*(\/\/|\*|\/\*)/.test(r)

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
  },
}))
vi.mock('../../src/lib/aiClient', () => ({ callAi: async () => ({ text: '' }) }))

const { default: AzioniView } = await import('../../src/views/AzioniView.jsx')

// La forma vera di un'azione, quella che scrive `handleAddAct` in
// `Dashboard.jsx`: il titolo sta in `label`, il testo lungo in `azione`.
// (La prima stesura di questo file inventava un campo `titolo`, e falliva
// per il motivo sbagliato: la pagina disegnava le azioni, solo che erano
// senza nome.)
const AZIONI = [
  { id: 'a1', label: 'Ricontrolla il prezzo del burro', azione: 'Il fornitore ha alzato il listino a settembre.', stato: 'aperta', createdAt: '2026-09-15T08:30:00.000Z' },
  { id: 'a2', label: 'Chiudi la cassa di sabato', azione: 'Manca la chiusura del 12.', stato: 'aperta', createdAt: '2026-09-16T08:30:00.000Z' },
]

describe('«Da fare» mostra le cose da fare', () => {
  beforeEach(cleanup)

  const props = {
    onUpdate: () => {}, onDelete: () => {}, ricettario: { ricette: {}, ingredienti_costi: {} },
    giornaliero: {}, chiusure: [], magazzino: {},
    nomeAttivita: 'Pasticceria del Corso', tipoAttivita: 'pasticceria',
  }

  it('apre sull\'elenco, non sulla chat', () => {
    const { container } = render(<AzioniView actions={AZIONI} {...props} />)
    const testo = container.textContent
    expect(testo, 'le azioni non si vedono al primo colpo d\'occhio')
      .toContain('Ricontrolla il prezzo del burro')
  })

  it('la chat resta lì, a una linguetta di distanza', () => {
    // La correzione non deve togliere niente: chi vuole chiedere una cosa
    // all'assistente da qui deve poterlo ancora fare.
    const { container } = render(<AzioniView actions={AZIONI} {...props} />)
    expect(container.textContent).toContain('Chat AI')
  })

  it('e con zero azioni non finge: lo dice', () => {
    // Quello che c'è intorno. Aprendo su una scheda vuota il rischio è il
    // contrario di prima: una pagina bianca al posto della chat.
    const { container } = render(<AzioniView actions={[]} {...props} />)
    expect(container.textContent.trim().length, 'pagina vuota').toBeGreaterThan(40)
    expect(container.textContent).toMatch(/Azioni \(0\)/)
  })

  it('le linguette si toccano col dito', () => {
    const src = leggi('src/views/AzioniView.jsx')
    expect(src, 'le linguette sono tornate sotto i 44px').toMatch(/minHeight:44/)
  })

  it('un\'azione senza data non scrive «Invalid Date»', () => {
    // 17/09/2026. Trovato rendendo la pagina per il test qui sopra: nel testo
    // uscito compariva «Invalid Date», due volte. Le azioni stanno in
    // `user_data` come jsonb — quelle salvate prima che `createdAt` esistesse
    // arrivano senza. `new Date(undefined).toLocaleDateString('it-IT')` non
    // dà errore: dà una stringa che il titolare legge come un guasto.
    const { container } = render(<AzioniView actions={[{ id: 'x', label: 'Ordina il cioccolato', azione: 'Scorta sotto il minimo.', stato: 'aperta' }]} {...props} />)
    expect(container.textContent, 'la pagina scrive ancora Invalid Date').not.toContain('Invalid Date')
    expect(container.textContent, 'la data mancante va detta, non nascosta').toContain('Data non registrata')
    expect(container.textContent).toContain('Ordina il cioccolato')
  })

  it('e con una data buona la scrive all\'italiana', () => {
    // Il contrario del test di sopra: la correzione non deve mangiare le date
    // che ci sono. 15 settembre 2026 → «15/09/2026».
    const { container } = render(<AzioniView actions={[AZIONI[0]]} {...props} />)
    expect(container.textContent).toMatch(/1[56]\/0?9\/2026/)
    expect(container.textContent).not.toContain('Data non registrata')
  })

  it('e un\'azione senza titolo non lascia la riga vuota', () => {
    // Quello che c'è intorno. `label` è il titolo in grassetto: vuoto,
    // la scheda mostrava una riga bianca, e nell'elenco delle completate
    // restava la sola spunta senza niente accanto.
    const { container } = render(<AzioniView actions={[
      { id: 'y', azione: 'Rifare il conto del margine', stato: 'aperta', createdAt: '2026-09-16T08:30:00.000Z' },
      { id: 'z', stato: 'chiusa', createdAt: '2026-09-16T08:30:00.000Z' },
    ]} {...props} />)
    expect(container.textContent).toContain('Rifare il conto del margine')
    expect(container.textContent, 'la riga chiusa senza titolo resta muta').toContain('Azione senza titolo')
  })
})

describe('Marketplace — il nome della categoria arriva intero', () => {
  it('nessuna etichetta perde la prima parola', async () => {
    const src = leggi('src/views/MarketplaceView.jsx')
    // 17/09/2026 — questo controllo bocciava il codice corretto. Il taglio non
    // c'è più da ieri, ma la riga che lo racconta sì: sta nel commento in cima
    // al file, dove serve. Si guardano le righe VIVE, come fa il controllo
    // sulle emoji qui sotto — un commento non arriva a schermo.
    const righeVive = src.split('\n').filter(r => !eCommento(r))
    const colpevoli = righeVive.filter(r => /lbl\??\.split\(' '\)\.slice\(1\)/.test(r))
    expect(colpevoli, 'il taglio della prima parola è tornato').toEqual([])
    // Le otto categorie hanno un nome che comincia con una lettera, non con
    // un'immagine: se qualcuno rimettesse un'emoji davanti, il nome
    // ricomincerebbe a non corrispondere a quello che si legge nella scheda.
    const blocco = src.slice(src.indexOf('const CATEGORIE = ['), src.indexOf(']', src.indexOf('const CATEGORIE = [')))
    const etichette = [...blocco.matchAll(/lbl: '([^']+)'/g)].map(m => m[1])
    expect(etichette.length).toBe(8)
    for (const e of etichette) expect(e, `"${e}" non comincia con una lettera`).toMatch(/^\p{L}/u)
  })

  it('e nessuna pagina mia è tornata a usare le emoji al posto delle icone', async () => {
    // Quello che c'è intorno: il difetto nasceva dall'emoji dentro il testo.
    // 17/09/2026 — questo controllo era tarato male e bocciava roba giusta.
    // Comprendeva il blocco delle FRECCE (U+2190-21FF) e i dingbat
    // (U+2600-27BF), quindi segnalava come emoji la «→» dentro un commento
    // («DIAGNOSI → CAPISCI → AGISCI») e la «✓» dei pulsanti. Non sono emoji:
    // sono segni tipografici, e il prodotto li usa apposta — «Apri il
    // Ricettario →» sta in produzione.
    //
    // La regola del progetto è un'altra: niente PITTOGRAMMI al posto delle
    // icone. La proprietà Unicode che li descrive esiste, la usano già
    // `emailTemplates` e gli altri test di questa casa, e non prende né le
    // frecce né le spunte.
    //
    // E si guardano solo le righe che finiscono a schermo: un'emoji dentro un
    // commento non la vede nessun cliente.
    const pittogramma = /\p{Extended_Pictographic}/u
    for (const f of ['src/views/MarketplaceView.jsx', 'src/views/RecipeInventorView.jsx',
                     'src/views/SemilavoratiView.jsx', 'src/components/ImportaDati.jsx',
                     'src/views/HomeDipendente.jsx']) {
      const righe = leggi(f).split('\n')
      const colpevoli = righe
        .map((r, i) => [i + 1, r])
        .filter(([, r]) => !eCommento(r) && pittogramma.test(r))
      expect(colpevoli, `${f}: emoji al posto del componente Icon`).toEqual([])
    }
  })
})
