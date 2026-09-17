// Una funzione che esiste e non si raggiunge è come se non ci fosse.
//
// Audit del 16/09/2026, agente «PAGINE». Il mandato era misurare le pagine che
// non stanno nel menu: quelle che si aprono da dentro un'altra pagina, da un
// bottone o da una scheda. Contandole si è scoperto che due **non si aprivano
// affatto**:
//
//   • `importa-dati` — «Porta dentro i dati»: i modelli Excel, il registro
//     incassi del mese e il caricamento guidato di fornitori e personale. È la
//     prima cosa che serve a un cliente nuovo. Undici aperture nello storico,
//     poi la riorganizzazione del 15/09/2026 le ha tolto la porta. Il commento
//     in `menuFoodos.js` diceva «resta raggiungibile anche dal Magazzino e dai
//     Primi passi»: `grep` su entrambi, zero. E il suggerimento in
//     Impostazioni («per modificare un singolo prezzo usa Importa dati →
//     Prezzi ingredienti») mandava su una pagina che non si poteva aprire.
//   • `integrazioni` — il ramo nel Dashboard non lo raggiunge nessuno; la
//     pagina vera è la scheda in Impostazioni → Notifiche, che monta lo stesso
//     componente. Resta come rete se il nome arriva dalla ricerca.
//
// Perché nessuno se n'era accorto: la pagina aperta non sta nell'indirizzo web
// ma in `sessionStorage` (`Dashboard.jsx`), quindi non esiste un link da
// provare; la ricerca rapida cerca solo dentro le voci di menu; e il test che
// c'era (`menuRiorganizzato.test.js`) controllava l'elenco al contrario — che
// ogni voce di menu avesse una pagina, non che ogni pagina avesse una voce.
//
// Questo file guarda dall'altro lato: **per ogni pagina che il Dashboard sa
// disegnare, esiste almeno una porta**. Porta = una voce di menu, una scheda,
// o qualcuno in `src/` che scrive quel nome dentro un comando di navigazione.
//
// Le pagine spente apposta non contano: `ritirata: true` in `VISTE_FUORI_MENU`
// (ritirate il 15/09 perché non potevano funzionare) e `PAGINE_NASCOSTE`
// (scheda allergeni, HACCP, menù — scelta di responsabilità del 09/09).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  costruisciMenu, vociMenu, vociInFondo, VISTE_FUORI_MENU, VISTE_DISEGNATE,
} from '../../src/lib/menuFoodos'

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')

function tuttiISorgenti(dir = join(RADICE, 'src'), out = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) tuttiISorgenti(p, out)
    else if (/\.(jsx?|tsx?)$/.test(nome)) out.push(p)
  }
  return out
}

// Il menu con TUTTE le condizioni accese: più sedi, metodo a inventario, sede
// di produzione. È il massimo di pagine che il menu possa offrire.
const menu = () => costruisciMenu({ metodoInventario: true, sedeDiProduzione: true, piuSedi: true })
const dalMenu = () => new Set([
  ...vociMenu(menu(), true).flatMap(v => [v.id, ...(v.schede || []).map(t => t.id)]),
  ...vociInFondo().flatMap(v => [v.id, ...(v.schede || []).map(t => t.id)]),
])

// Chi scrive un nome di pagina dentro un comando di navigazione. I nomi dei
// comandi cambiano da componente a componente (`setView`, `onNavigate`,
// `setVista`, `vai`, `apri`…), quindi si cerca la forma comune: il nome della
// pagina fra virgolette, attaccato a una parentesi aperta.
function daiComandi() {
  const trovate = new Set()
  for (const f of tuttiISorgenti()) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/\(\s*["']([a-z0-9-]+)["']\s*\)/g)) trovate.add(m[1])
    for (const m of src.matchAll(/\bview\s*:\s*["']([a-z0-9-]+)["']/g)) trovate.add(m[1])
  }
  return trovate
}

const nascoste = () => {
  const riga = leggi('src/Dashboard.jsx').match(/const PAGINE_NASCOSTE = new Set\(\[([^\]]*)\]/)
  return new Set([...riga[1].matchAll(/['"]([a-z0-9-]+)['"]/g)].map(m => m[1]))
}

// Le pagine che si raggiungono senza passare per una pagina del Dashboard:
// il loro componente è montato DENTRO un'altra pagina. Il contenuto si vede,
// il percorso `vista==="…"` no. Vanno scritte qui una per una, con il file e
// il posto in cui si aprono, e c'è una prova sotto che controlla che quel
// posto esista ancora davvero.
const ALTRE_PORTE = {
  // Impostazioni → Notifiche → «Integrazioni» monta `<IntegrazioniLazy/>`.
  integrazioni: { file: 'src/components/Impostazioni.jsx', cerca: /id: 'integrazioni', label: 'Integrazioni'/ },
}

describe('ogni pagina ha una porta', () => {
  it('nessuna pagina viva resta senza un modo di aprirla', () => {
    const menuIds = dalMenu()
    const comandi = daiComandi()
    const spente = nascoste()
    const senzaPorta = []
    for (const id of VISTE_DISEGNATE) {
      if (VISTE_FUORI_MENU[id]?.ritirata) continue   // spenta apposta il 15/09
      if (spente.has(id)) continue                   // spenta apposta il 09/09
      if (id === 'home' || id === 'home-dipendente') continue // il logo in alto
      if (menuIds.has(id) || comandi.has(id) || ALTRE_PORTE[id]) continue
      senzaPorta.push(id)
    }
    expect(senzaPorta, 'pagine che esistono e che nessuno può aprire').toEqual([])
  })

  it('le porte dichiarate fuori dal Dashboard esistono davvero', () => {
    // Senza questa prova, `ALTRE_PORTE` diventerebbe il posto dove si nasconde
    // una pagina irraggiungibile scrivendo una riga in un test.
    for (const [id, porta] of Object.entries(ALTRE_PORTE)) {
      expect(leggi(porta.file), `"${id}": la porta dichiarata in ${porta.file} non c'è più`)
        .toMatch(porta.cerca)
    }
  })

  it('«Porta dentro i dati» si apre da Impostazioni, e il Dashboard le passa la maniglia', () => {
    // Il difetto vero: la pagina c'era, il ramo del disegno c'era, e nessuno
    // la apriva. La porta sta dove `VISTE_FUORI_MENU` dice che deve stare
    // (gruppo «Impostazioni»).
    expect(VISTE_FUORI_MENU['importa-dati'].gruppo).toBe('Impostazioni')
    const imp = leggi('src/components/Impostazioni.jsx')
    expect(imp, 'manca la voce in Impostazioni').toMatch(/id: 'porta-dentro-i-dati'/)
    expect(imp, 'la voce non chiama niente').toMatch(/onImportaDati=\{onImportaDati\}/)
    const dash = leggi('src/Dashboard.jsx')
    expect(dash, 'il Dashboard non passa la maniglia')
      .toMatch(/onImportaDati=\{\(\)=>setView\("importa-dati"\)\}/)
  })

  it('la voce nuova sta nel gruppo giusto e non è una scheda inventata', () => {
    // Quello che c'è intorno: se qualcuno sposta la voce in una sezione che
    // per il dipendente non esiste, la porta si richiude senza far rumore.
    const imp = leggi('src/components/Impostazioni.jsx')
    const avanzate = imp.slice(imp.indexOf("id: 'avanzate'"), imp.indexOf("id: 'altro'"))
    expect(avanzate, 'la voce non è più dentro «Avanzate»').toMatch(/id: 'porta-dentro-i-dati'/)
  })

  it('le pagine ritirate restano fuori di proposito, e lo dichiarano', () => {
    // La rete al contrario: se una ritirata tornasse raggiungibile senza che
    // nessuno l'abbia deciso, questo test non se ne accorgerebbe — ma almeno
    // controlla che la dichiarazione ci sia, così l'elenco resta leggibile.
    for (const id of ['forecast', 'whatsapp', 'documentary', 'ai-hub', 'marketplace', 'ricette-ai']) {
      expect(VISTE_FUORI_MENU[id]?.ritirata, `"${id}" non è più dichiarata ritirata`).toBe(true)
    }
  })
})
