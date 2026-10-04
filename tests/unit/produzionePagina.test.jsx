// @vitest-environment happy-dom
//
// ── La pagina Produzione rifatta: il contratto ────────────────────────────
//
// 04/10/2026. L'audit del 03/10 aveva dato 18/100 allo Storico produzione
// (la pagina che Mara vede, perché lavora col metodo inventario). Le critiche
// del titolare: «non capisco cosa guardare, grafici inutili, mancano le cose
// che servono». Sulla pagina, con i dati veri:
//   - quattro tessere senza giudizio («↓ 53,2% vs periodo prec.» in rosso
//     anche quando il calo era un mese non registrato);
//   - la riga «62 giorni registrati…» scritta in piccolo sotto il titolo, e
//     sopra i numeri quattro riquadri gialli (caselle, gusti senza ricetta,
//     gusti senza prezzo, scarto) che spingevano i numeri sotto la piega;
//   - un grafico «Prodotto e venduto per giorno» con tre colori per tre
//     categorie, e una classifica «Top 10» che ripeteva la tabella;
//   - nessuna risposta alle domande che il titolare fa davvero: torna il
//     conto della vetrina? che giorno vendo di più? come vanno i negozi uno
//     accanto all'altro? quale gusto resta in vetrina?
//
// La pagina nuova segue ANALISI_DESIGN.md: la domanda in cima, una riga sola
// su da dove vengono i numeri, ogni numero col suo confronto, i titoli che
// dicono la conclusione, i colori per ruolo, il telefono prima. Questo file
// prova il contratto pezzo per pezzo, sui conti veri delle librerie (niente
// formule rifatte qui dentro: vedi settimaneACavalloDAnno per il perché).
import { describe, it, expect } from 'vitest'

const { vociCopertura } = await import('../../src/views/produzione/copertura.js')

// ── 1. La riga «da dove vengono i numeri» ──────────────────────────────────
const LUGLIO_AGOSTO = { n: 62, primo: '2026-07-01', ultimo: '2026-08-31', sedeGiorni: 183 }
const voce = (voci, id) => voci.find(v => v.id === id)

describe('La copertura dei dati: una frase per fonte', () => {
  it('senza giorni registrati non dice niente (lo dice il periodo vuoto)', () => {
    expect(vociCopertura({ copertura: { n: 0 } })).toEqual([])
  })

  it('i giorni registrati, e perché la pagina mostra quei due mesi', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, daPartenza: true }), 'inventario')
    expect(v.stato).toBe('ok')
    expect(v.testo).toBe('62 giorni registrati, dall\'01/07 al 31/08: ti mostro i due mesi fino all\'ultimo giorno registrato')
    expect(v.azione).toBeNull()
  })

  it('se i dati si fermano prima della fine del periodo è «in parte», e porta a registrare', () => {
    const vai = () => {}
    const v = voce(vociCopertura({ copertura: { ...LUGLIO_AGOSTO, n: 29, primo: '2026-08-03' }, registrazioneFerma: true, azioni: { inventario: vai } }), 'inventario')
    expect(v.stato).toBe('parziale')
    expect(v.testo).toMatch(/^29 giorni registrati, dal 03\/08 al 31\/08/)
    expect(v.testo).toMatch(/dopo il 31\/08 non c'è niente di registrato$/)
    expect(v.azione).toEqual({ etichetta: 'Registra', onClick: vai })
  })

  it('un giorno solo si dice al singolare', () => {
    const v = voce(vociCopertura({ copertura: { n: 1, primo: '2026-08-11', ultimo: '2026-08-11', sedeGiorni: 1 } }), 'inventario')
    expect(v.testo).toBe('Un giorno registrato, l\'11/08')
  })

  it('i giorni senza niente stanno dietro un tocco, sede per sede', () => {
    const v = voce(vociCopertura({
      copertura: LUGLIO_AGOSTO,
      buchi: [{ sede: 'Carlina', giorni: ['2026-08-19'] }, { sede: 'De Gasperi', giorni: [] }],
    }), 'inventario')
    expect(v.testo).not.toMatch(/19\/08/)
    expect(v.dettaglio).toMatch(/Carlina 19\/08/)
    expect(v.dettaglio).not.toMatch(/De Gasperi/)
  })

  it('il confronto vero, con le giornate', () => {
    const stesse = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, confrontoInfo: { ok: true, from: '2026-04-30', to: '2026-06-30', giorniPrev: 183 } }), 'confronto')
    expect(stesse.testo).toBe('Confronto con 30/04–30/06, con le stesse giornate registrate')
    const diverse = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, confrontoInfo: { ok: true, from: '2026-04-30', to: '2026-06-30', giorniPrev: 180 } }), 'confronto')
    expect(diverse.testo).toBe('Confronto con 30/04–30/06, 180 giornate registrate contro 183')
  })

  it('il confronto con l\'anno prima dice l\'anno', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, confrontoInfo: { ok: true, from: '2025-07-01', to: '2025-08-31', giorniPrev: 183 } }), 'confronto')
    expect(v.testo).toMatch(/^Confronto con 01\/07–31\/08 del 2025/)
  })

  it('un confronto che non si fa non è una fonte: lo dicono la barra e la tessera', () => {
    const voci = vociCopertura({ copertura: LUGLIO_AGOSTO, confrontoInfo: { ok: false, motivo: 'il periodo di confronto ha 14 giornate registrate, questo 32' } })
    expect(voce(voci, 'confronto')).toBeUndefined()
  })

  it('ricavo e margine si dichiarano stime, con cosa sono fatti', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO }), 'stima')
    expect(v.stato).toBe('stima')
    expect(v.testo).toMatch(/prezzo medio dei formati/)
    expect(v.testo).toMatch(/prezzi di oggi/)
  })

  it('i gusti senza ricetta: quanti chili e quanti euro restano fuori, e il pulsante per collegarli', () => {
    const vai = () => {}
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, senzaRicetta: { n: 10, kgVenduti: 1181.04, euroStimati: 34823.4 }, azioni: { gusti: vai } }), 'senzaRicetta')
    expect(v.testo).toBe('10 gusti senza ricetta: 1.181 kg venduti fuori dal ricavo (circa 34.823 €)')
    expect(v.azione.etichetta).toBe('Collegali')
    expect(voce(vociCopertura({ copertura: LUGLIO_AGOSTO, senzaRicetta: { n: 0 } }), 'senzaRicetta')).toBeUndefined()
  })

  it('i gusti con la ricetta ma senza prezzo: la frase è corta, i nomi dietro un tocco', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, incompleti: ['PISTACCHIO', 'MENTA'] }), 'incompleti')
    expect(v.testo).toBe('2 gusti con la ricetta ma senza prezzo o costo completo: margine non calcolato')
    expect(v.dettaglio).toBe('PISTACCHIO e MENTA')
  })

  it('le caselle da sistemare solo se ci sono', () => {
    expect(voce(vociCopertura({ copertura: LUGLIO_AGOSTO, caselle: { n: 151 } }), 'caselle').testo).toBe('151 caselle da sistemare nell\'inventario')
    expect(voce(vociCopertura({ copertura: LUGLIO_AGOSTO, caselle: { n: 1 } }), 'caselle').testo).toBe('1 casella da sistemare nell\'inventario')
    const senza = vociCopertura({ copertura: LUGLIO_AGOSTO, caselle: { n: 0 } })
    expect(senza.map(v => v.testo).join(' ')).not.toMatch(/da sistemare/)
  })

  it('lo scarto mai scritto «manca», e si dice dove finisce', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, scartoRegistrato: false }), 'scarto')
    expect(v.stato).toBe('manca')
    expect(v.testo).toBe('lo scarto, quindi quello che si butta è contato nel venduto')
    expect(voce(vociCopertura({ copertura: LUGLIO_AGOSTO, scartoRegistrato: true }), 'scarto')).toBeUndefined()
  })
})
