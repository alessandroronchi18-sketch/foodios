// La scheda di una ricetta è fatta come quella di un semilavorato.
//
// Il titolare, il 16/09/2026: «il layout e il design di nuovo gusto e nuovo
// semilavorato sono diversi, come mai? mi piace molto di più quello di nuovo
// semilavorato, prendi quello come esempio e correggi e modifica l'altro».
//
// Le due schede fanno la stessa cosa — dai un nome, metti gli ingredienti,
// guarda quanto costa — ed erano disegnate in due modi diversi:
//
//   Nuovo semilavorato   una colonna, etichette di sezione in maiuscoletto
//                        grigio, nessuna icona
//   Nuovo gusto          due colonne (modulo a sinistra, conto del costo
//                        appiccicato a destra da 340px) e quattro riquadri
//                        colorati da 30px con dentro un'icona, uno per
//                        sezione
//
// Due colonne si leggono in tempi diversi: si compila a sinistra e il numero
// cambia a destra. E quattro icone colorate in una scheda sola fanno sembrare
// affollata una pagina che ha gli stessi campi dell'altra.
//
// Ora anche la scheda della ricetta scende in una colonna sola — nome,
// ingredienti, allergeni, e in fondo quanto costa, che è l'ordine in cui si
// fa il lavoro — con le stesse etichette dei semilavorati.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RICETTA = readFileSync(join(RADICE, 'src', 'views', 'NuovaRicettaView.jsx'), 'utf8')

describe('la scheda della ricetta', () => {
  it('scende in una colonna sola, senza il pannello di lato da 340px', () => {
    expect(RICETTA).not.toMatch(/gridTemplateColumns: isMobile \? "1fr" : isTablet \? "1fr" : "1fr 340px"/)
    expect(RICETTA).toMatch(/ref=\{formRef\} style=\{\{ display: "flex", flexDirection: "column"/)
  })

  it('le intestazioni di sezione non hanno più il riquadro colorato con l\'icona', () => {
    const head = RICETTA.slice(RICETTA.indexOf('function PanelHead'), RICETTA.indexOf('function PanelHead') + 1400)
    expect(head).not.toMatch(/borderRadius: R\.lg, background: `\$\{color\}14`/)
    // La stessa etichetta dei semilavorati: maiuscoletto piccolo, grigio.
    expect(head).toMatch(/textTransform: 'uppercase'/)
    expect(head).toMatch(/color: C\.textSoft/)
  })

  it('e le scritte non dicono più «a destra», che non è più vero', () => {
    // Una scritta che descrive un layout che non c'è più è peggio di nessuna
    // scritta: manda a cercare una cosa dove non sta.
    expect(RICETTA).not.toMatch(/a destra vedi food cost/)
    expect(RICETTA).not.toMatch(/L'anteprima a destra/)
  })
})

describe('un riquadro solo, come nei semilavorati', () => {
  it('le sezioni del modulo si separano con un filo, non con sei cornici', () => {
    // Sei riquadri con bordo e ombra facevano sembrare il doppio del lavoro
    // una scheda che ha gli stessi campi dell'altra.
    expect(RICETTA).toMatch(/const sezione = \{ paddingTop:/)
    expect(RICETTA).toMatch(/borderTop: `1px solid \$\{C\.borderSoft\}`/)
    // Restano solo i due riquadri dei risultati (costo e prezzo minimo).
    const quanti = (RICETTA.match(/style=\{cardStyle\}/g) || []).length
    expect(quanti, 'riquadri con cornice rimasti').toBeLessThanOrEqual(2)
  })
})

describe('i punti di partenza rapidi sono stati tolti', () => {
  // 17/09/2026, scelta del titolare: stavano sopra il campo del nome, e la
  // prima cosa che si vedeva aprendo «Nuovo gusto» era un elenco di gusti
  // vecchi. Il test si gira invece di cancellarlo: dice che è stata una
  // scelta, non una dimenticanza — e se un domani qualcuno li rimettesse per
  // sbaglio, qui si vede.
  it('non compaiono più nella scheda', () => {
    // Si guardano solo le righe VIVE: la frase compare ancora nel commento
    // che racconta perché è stata tolta, ed è giusto che ci resti. È lo
    // stesso equivoco del rilevatore di emoji corretto stanotte — un
    // controllo che legge i commenti boccia la spiegazione di se stesso.
    const vive = RICETTA.split('\n')
      .filter(r => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r))
      .join('\n')
    expect(vive).not.toMatch(/Parti da una che hai già/)
  })

  it('e non è rimasto il codice che li disegnava', () => {
    expect(RICETTA).not.toMatch(/ricettePerPartire\.length > 0 &&/)
  })
})
