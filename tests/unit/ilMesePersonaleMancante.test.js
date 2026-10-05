// 05/10/2026 — Il mese: l'utile non si calcola perché il personale non ha i
// costi. È un limite del dato, e la pagina doveva dirlo bene.
//
// Com'era: «l'utile vero sarà più basso: manca il personale». Sui dati veri
// di Mara in Personale ci sono 18 persone attive, tutte con stipendio e costo
// orario vuoti (create dalle foto dei turni): la frase non diceva né quante,
// né che i costi vuoti sono il problema, e il pulsante era «Apri Personale»,
// senza dire cosa farci.
// Adesso: «In Personale ci sono 18 persone attive senza stipendio né costo
// orario. Senza questi costi l'utile non si può calcolare», col pulsante
// «Metti i costi in Personale» e, grande, il numero vero prima del personale.
import { describe, it, expect } from 'vitest'
import { personaleDelMese, spiegaPersonaleMancante } from '../../src/lib/ilMese.js'

const DICIOTTO = Array.from({ length: 18 }, (_, i) => ({
  id: `d${i}`, nome: `P${i}`, attivo: true, stipendio_lordo_mensile: i === 0 ? 0 : null, costo_orario: i === 0 ? 0 : null, sede_id: 's1',
}))

describe('spiegaPersonaleMancante', () => {
  it('con 18 persone attive senza costi, dice quante e cosa manca (il caso di Mara)', () => {
    const p = personaleDelMese(DICIOTTO, { mese: '2026-08' })
    expect(p.valore).toBeNull()
    expect(spiegaPersonaleMancante(p)).toBe(
      'In Personale ci sono 18 persone attive senza stipendio né costo orario. Senza questi costi l\'utile non si può calcolare')
  })

  it('una persona sola: singolare', () => {
    const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 0 }], { mese: '2026-08' })
    expect(spiegaPersonaleMancante(p)).toMatch(/^In Personale c'è 1 persona attiva senza stipendio/)
  })

  it('con persone non attive ma con lo stipendio, le dice con i lordi al mese', () => {
    const dip = [...DICIOTTO.slice(0, 2),
      { attivo: false, stipendio_lordo_mensile: 2500 }, { attivo: false, stipendio_lordo_mensile: 2539 }, { attivo: false, stipendio_lordo_mensile: 3000 }]
    const t = spiegaPersonaleMancante(personaleDelMese(dip, { mese: '2026-08' }))
    expect(t).toMatch(/2 persone attive senza stipendio/)
    expect(t).toMatch(/3 persone con lo stipendio sono segnate non attive \(8\.039 € lordi al mese\)/)
  })

  it('nessuno in Personale: lo dice', () => {
    expect(spiegaPersonaleMancante(personaleDelMese([], { mese: '2026-08' }))).toMatch(/^In Personale non c'è nessuno/)
  })

  it('non inventa niente se non riceve il personale', () => {
    expect(() => spiegaPersonaleMancante(null)).not.toThrow()
  })
})
