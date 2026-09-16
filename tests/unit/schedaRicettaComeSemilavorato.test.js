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
