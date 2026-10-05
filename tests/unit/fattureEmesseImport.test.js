// Fatture emesse da Fattura SMART → vendite all'ingrosso (06/10/2026).
//
// Il racconto: la tabella `vendite_b2b` di Mara aveva zero righe, mentre il
// titolare ha l'elenco di 187 fatture emesse a bar e ristoranti. Importarle
// come vendite con un importo e basta aveva un rischio: `scorporaB2B` somma il
// `totale` di ogni vendita al ricavo stimato dai chili. Le fatture non hanno
// chili, quindi i chili restavano al prezzo del banco E l'importo della
// fattura si sommava sopra: lo stesso gelato contato due volte (qui: 500 kg
// a 10 €/kg = 5.000 € di banco, più 560 € di fattura = 5.560 €, mentre il
// ricavo vero era 5.000 €). Le vendite nate da fattura sono «solo registro».
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: () => ({}) } }))

import { scorporaB2B } from '../../src/lib/inventarioProduzione'
import {
  leggiRigheEmesse, anteprimaEmesse, venditeDaEmesse, eElencoEmesse, eSoloRegistro, chiaveCliente, sedeDalNomeFile,
} from '../../src/lib/fattureEmesse'

const INTEST = ['Numero', 'Suffisso', 'Anno', 'Data', 'Tipo Documento', 'Cliente', 'Codice Fiscale', 'Partita IVA', 'Imponibile',
  'Tipo cassa previdenza', 'Cassa Previdenza', 'Imposta', 'Importo Art. 15', 'Bollo', 'Totale', 'Ritenuta', 'Netto a pagare', 'Note piede', 'Stato', 'Esito']
const fat = (numero, anno, data, cliente, imp, iva, stato = 'Scaduta', esito = 'Accettato dal Cliente', tipo = 'Fattura - SERVIZI', piva = '123') =>
  [String(numero), '', anno, new Date(data + 'T00:00:00'), tipo, cliente, piva, piva, imp, 'Nessuna Cassa Previdenza', 0, iva, 0, 0, imp + iva, 0, imp + iva, '', stato, esito]
const FOGLIO = [
  ['Elenco documenti'], ['Elenco documenti presenti in Fattura SMART'], [''], INTEST,
  fat(31, 2026, '2026-09-23', 'I CARBONARI S.R.L', 560, 56),
  fat(30, 2026, '2026-09-17', 'SAVOIA21 SOCIETA\' A RESPONSABILITA\' LIMITATA', 132, 29.04, 'Pagato'),
  fat(29, 2026, '2026-01-10', 'SAVOIA21 SRL', 100, 22),
  fat(15, 2023, '2023-04-03', 'OATLY EMEA AB', 500, 50, 'Scaduta', 'Non recapitabile al Cliente (definitivo)', 'Fattura - SERVIZI', ''),
  fat(14, 2023, '2023-03-27', 'GASTRONOMIA DA ANNA', 28, 2.8),
  fat(14, 2023, '2023-03-27', 'GASTRONOMIA DA ANNA', 28, 2.8),
  fat(5, 2023, '2023-05-01', 'LUOGO DIVINO SRL', 40, 4, 'Scaduta', 'Accettato dal Cliente', 'Nota di credito - SERVIZI'),
]

describe('doppio conteggio con le fatture importate (rosso sul codice di prima)', () => {
  const importata = { stato: 'fatturata', totale: 560, righe: [{ prodotto: 'FATTURA 31/2026', qta: 1, unita: 'pz', prezzo: 560, totale: 560, fonte: 'fattura_smart' }] }
  it('una vendita nata da fattura non si somma al ricavo stimato dai chili', () => {
    const r = scorporaB2B({ kg: 500, euroKg: 10, venditeB2B: [importata] })
    expect(r.ricaviTotali).toBe(5000)
    expect(r.ricaviB2b).toBe(0)
  })
  it('una vendita vera di un bar (con chili) continua a contare come prima', () => {
    const vera = { stato: 'consegnata', totale: 300, righe: [{ prodotto: 'NOCCIOLA', qta: 20, unita: 'kg', prezzo: 15, totale: 300 }] }
    const r = scorporaB2B({ kg: 500, euroKg: 10, venditeB2B: [vera, importata] })
    expect(r.b2bKg).toBe(20)
    expect(r.ricaviB2b).toBe(300)
    expect(r.ricaviTotali).toBe(480 * 10 + 300)
  })
  it('una vendita a pezzi fatta a mano (senza fonte) resta nei ricavi', () => {
    const pz = { stato: 'consegnata', totale: 50, righe: [{ prodotto: 'CONI', qta: 100, unita: 'pz', prezzo: 0.5, totale: 50 }] }
    expect(scorporaB2B({ kg: 100, euroKg: 10, venditeB2B: [pz] }).ricaviB2b).toBe(50)
  })
  it('eSoloRegistro: serve che TUTTE le righe vengano da fattura', () => {
    expect(eSoloRegistro(importata)).toBe(true)
    expect(eSoloRegistro({ righe: [] })).toBe(false)
    expect(eSoloRegistro({ righe: [{ fonte: 'fattura_smart' }, { prodotto: 'X' }] })).toBe(false)
    expect(eSoloRegistro(null)).toBe(false)
  })
})

describe('lettura del formato «emesse»', () => {
  it('lo riconosce per «Cliente» e lo distingue dalle ricevute («Fornitore»)', () => {
    expect(eElencoEmesse(FOGLIO)).toBe(true)
    const ricevute = [['x'], ['Numero', 'Data', 'Fornitore', 'Imponibile', 'Totale']]
    expect(eElencoEmesse(ricevute)).toBe(false)
    expect(leggiRigheEmesse(ricevute)).toBeNull()
    expect(leggiRigheEmesse([])).toBeNull()
  })
  it('legge le colonne per nome, con date locali e importi', () => {
    const { fatture } = leggiRigheEmesse(FOGLIO)
    expect(fatture).toHaveLength(7)
    const f = fatture[0]
    expect(f).toMatchObject({ numero: '31', anno: 2026, data: '2026-09-23', cliente: 'I CARBONARI S.R.L', imponibile: 560, imposta: 56, totale: 616, chiave: '31/2026', pagata: false })
    expect(fatture[1].pagata).toBe(true)
    expect(fatture[3].nonRecapitabile).toBe(true)
  })
  it('la nota di credito ha gli importi col segno meno', () => {
    const nc = leggiRigheEmesse(FOGLIO).fatture[6]
    expect(nc.notaCredito).toBe(true)
    expect(nc.imponibile).toBe(-40)
  })
  it('chiaveCliente toglie forma societaria e punteggiatura', () => {
    expect(chiaveCliente('SAVOIA21 SOCIETA\' A RESPONSABILITA\' LIMITATA')).toBe('savoia21')
    expect(chiaveCliente('SAVOIA21 SRL')).toBe('savoia21')
    expect(chiaveCliente('Scardala Gianpaolo')).toBe('scardala gianpaolo')
  })
})

describe('anteprima: solo conti, nessuna scrittura', () => {
  const { fatture } = leggiRigheEmesse(FOGLIO)
  it('conta clienti, anni, mesi, doppioni, note di credito, non recapitabili', () => {
    const a = anteprimaEmesse(fatture)
    expect(a.nLette).toBe(7)
    expect(a.doppioniNelFile).toHaveLength(1)
    expect(a.nDaCaricare).toBe(6)
    expect(a.nClienti).toBe(5)               // SAVOIA21 ×2 (nome diverso, stesso cliente)
    expect(a.noteCredito).toEqual({ n: 1, imponibile: -40 })
    expect(a.nonRecapitabili).toEqual({ n: 1, imponibile: 500 })
    expect(a.perAnno.map(x => [x.anno, x.n])).toEqual([['2023', 3], ['2026', 3]])
    expect(a.perMese.map(x => x.mese)).toEqual(['2023-03', '2023-04', '2023-05', '2026-01', '2026-09'])
    expect(a.imponibile).toBe(1280)  // 560+132+100+500+28-40
    expect(a.primaData).toBe('2023-03-27')
  })
  it('«solo dal 2026» lascia fuori le vecchie e lo dice', () => {
    const a = anteprimaEmesse(fatture, { dal: '2026-01-01' })
    expect(a.nDaCaricare).toBe(3)
    expect(a.fuoriPeriodo).toHaveLength(3)
    expect(a.perAnno).toHaveLength(1)
  })
  it('le fatture già in archivio sono doppioni e non si ricaricano', () => {
    const gia = venditeDaEmesse(anteprimaEmesse(fatture).daCaricare).slice(0, 2)
    const a = anteprimaEmesse(fatture, { esistenti: gia })
    expect(a.giaPresenti).toHaveLength(2)
    expect(a.nDaCaricare).toBe(4)
  })
  it('da incassare: «Pagato» no, tutto il resto sì; con la data scelta si possono considerare incassate le vecchie', () => {
    expect(anteprimaEmesse(fatture).daIncassare.n).toBe(4)   // 6 meno 1 pagata meno 1 nota credito
    expect(anteprimaEmesse(fatture, { incassateFinoAl: '2026-06-30' }).daIncassare.n).toBe(1)
  })
})

describe('le vendite che si scriverebbero', () => {
  it('una riga a pezzi per fattura, fatturata, senza scarico di magazzino, importo senza IVA', () => {
    const v = venditeDaEmesse(anteprimaEmesse(leggiRigheEmesse(FOGLIO).fatture).daCaricare)
    expect(v).toHaveLength(6)
    expect(v[0]).toMatchObject({ stato: 'fatturata', stock_scaricato: false, totale: 560, data: '2026-09-23', pagata: false, sede_id: null })
    expect(v[0].righe[0]).toMatchObject({ unita: 'pz', fonte: 'fattura_smart', iva: 56 })
    expect(v[0].note).toBe('Fattura 31/2026 · Fattura SMART')
    expect(v.every(eSoloRegistro)).toBe(true)
    expect(v[1].pagata).toBe(true)
    expect(v.find(x => x.totale === 500).note).toMatch(/non recapitabile/)
  })
})

// Secondo giro, 06/10/2026: nel file di Mara ci sono clienti che non sono ingrosso
// (FONDO FOR.TE. 17.185 € in una fattura sola, MARAMIA 12.279 €) e le righe
// importate restavano senza sede, cioè in tutte le sedi.
describe('clienti esclusi dall\'anteprima', () => {
  const { fatture } = leggiRigheEmesse(FOGLIO)
  it('togliere un cliente aggiorna i totali ma lo lascia nell\'elenco, segnato', () => {
    const a = anteprimaEmesse(fatture, { clientiEsclusi: ['savoia21'] })
    expect(a.nDaCaricare).toBe(4)            // 6 meno le due SAVOIA21 caricabili
    expect(a.nEsclusi).toBe(2)
    expect(a.imponibile).toBe(1280 - 232)
    expect(a.perCliente.find(c => c.chiave === 'savoia21')).toMatchObject({ escluso: true, n: 2 })
    expect(a.nClienti).toBe(a.perCliente.length - 1)
    expect(a.perAnno.reduce((s, x) => s + x.n, 0)).toBe(4)
  })
  it('le vendite scritte non contengono il cliente escluso', () => {
    const a = anteprimaEmesse(fatture, { clientiEsclusi: ['savoia21'] })
    expect(venditeDaEmesse(a.daCaricare).some(v => /SAVOIA/.test(v.cliente_nome))).toBe(false)
  })
  it('senza esclusi tutto come prima', () => {
    expect(anteprimaEmesse(fatture).nEsclusi).toBe(0)
  })
})
describe('la sede dal nome del file', () => {
  const sedi = [{ id: 'a', nome: 'Mara dei Boschi Carlina' }, { id: 'b', nome: 'Mara dei Boschi Berthollet' }, { id: 'c', nome: 'Mara dei Boschi De Gasperi' }]
  it('«Fatture x carlina (1).xlsx» è Carlina', () => { expect(sedeDalNomeFile('Fatture x carlina (1).xlsx', sedi)).toBe('a') })
  it('un nome che non dice niente, o due sedi insieme, non indovina', () => {
    expect(sedeDalNomeFile('fatture.xlsx', sedi)).toBeNull()
    expect(sedeDalNomeFile('carlina berthollet.xlsx', sedi)).toBeNull()
    expect(sedeDalNomeFile('mara dei boschi.xlsx', sedi)).toBeNull()
  })
  it('la sede scelta finisce nelle vendite', () => {
    expect(venditeDaEmesse(anteprimaEmesse(leggiRigheEmesse(FOGLIO).fatture).daCaricare, { sedeId: 'a' }).every(v => v.sede_id === 'a')).toBe(true)
  })
})
