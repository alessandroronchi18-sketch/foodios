// @vitest-environment happy-dom
//
// ── Gli XML dell'Agenzia completano le fatture che ci sono già ──────────
//
// Il titolare, 24/09/2026: «ho tutte le fatture su webdesk ma non riesco a
// fare un export con tutte le info necessarie — prodotti nella fattura,
// prezzo, fornitore, dati fornitore».
//
// Sul database vero, quel giorno: 3.520 fatture dal 2023, **zero** con le
// righe, **zero** con la P.IVA. Tutte dall'Excel di WebDesk. La strada è lo
// ZIP del download massivo dell'Agenzia delle Entrate, che Foodos diceva già
// di saper leggere. Provandolo sul serio, prima di chiedere al titolare di
// scaricarlo, i difetti erano cinque:
//
//   1. le fatture già presenti venivano **scartate come doppioni**, righe
//      comprese: caricare lo ZIP non avrebbe aggiunto niente;
//   2. se l'Excel e l'XML scrivono il fornitore diversamente, la fattura
//      entrava **una seconda volta**;
//   3. dentro lo ZIP si prendevano solo i `.xml`: le fatture firmate
//      (`.xml.p7m`) restavano fuori in silenzio;
//   4. i file di metadati, uno per fattura, finivano contati come «file che
//      non ho saputo leggere»;
//   5. l'estrattore si fermava a 2.000 file senza dirlo — un anno di fatture
//      con i loro metadati.
//
// E un sesto nello Scadenzario: accettava i `.p7m` e li leggeva come testo,
// quindi fallivano sempre.
import { describe, it, expect } from 'vitest'
import { leggiFattureDaFile, MAX_FILE_ARCHIVIO } from '../../src/lib/fattureXmlArchivio.js'
import {
  abbinaFatture, patchDaXml, normFornitore, completaAnagraficaFornitori,
  applicaCompletamenti, fattureEsistentiPerAbbinare,
} from '../../src/lib/completaFatture.js'
import { importaFattureXml, fraseEsitoXml, avvisiEsitoXml, promemoriaZipAgenzia, testoAvanzamentoXml } from '../../src/lib/importaFattureXml.js'
import { parseFatturaXML } from '../../src/lib/parseFatturaXML.js'

// ── Fixture ─────────────────────────────────────────────────────────────

function fatturaXml({ numero = '160', data = '2026-04-09', fornitore = "MELLY'S KOMBUCHA SRL", piva = '11122233344', totale = '122.00', iban = 'IT60X0542811101000000123456', cessionario = '09876543210' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${piva}</IdCodice></IdFiscaleIVA>
        <CodiceFiscale>${piva}</CodiceFiscale>
        <Anagrafica><Denominazione>${fornitore}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede><Indirizzo>Via Nizza</Indirizzo><NumeroCivico>12</NumeroCivico><CAP>10125</CAP><Comune>Torino</Comune><Provincia>TO</Provincia><Nazione>IT</Nazione></Sede>
      <Contatti><Telefono>011123456</Telefono><Email>ordini@esempio.it</Email></Contatti>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cessionario}</IdCodice></IdFiscaleIVA></DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento>
      <TipoDocumento>TD01</TipoDocumento><Numero>${numero}</Numero><Data>${data}</Data>
      <ImportoTotaleDocumento>${totale}</ImportoTotaleDocumento>
    </DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>1</NumeroLinea><CodiceArticolo><CodiceTipo>INT</CodiceTipo><CodiceValore>KB-330</CodiceValore></CodiceArticolo><Descrizione>Kombucha zenzero 330 ml</Descrizione><Quantita>24.00</Quantita><UnitaMisura>PZ</UnitaMisura><PrezzoUnitario>2.50</PrezzoUnitario><PrezzoTotale>60.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
      <DettaglioLinee><NumeroLinea>2</NumeroLinea><Descrizione>Kombucha limone 330 ml</Descrizione><Quantita>16.00</Quantita><UnitaMisura>PZ</UnitaMisura><PrezzoUnitario>2.50</PrezzoUnitario><PrezzoTotale>40.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
      <DatiRiepilogo><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento><DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento><DataScadenzaPagamento>2026-05-31</DataScadenzaPagamento><IBAN>${iban}</IBAN></DettaglioPagamento></DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`
}

const METADATI = `<?xml version="1.0" encoding="UTF-8"?>
<ns3:FileMetadati xmlns:ns3="http://www.fatturapa.gov.it/sdi/messaggi/v1.0"><IdentificativoSdI>123</IdentificativoSdI><NomeFile>IT11122233344_00001.xml.p7m</NomeFile></ns3:FileMetadati>`

const RICEVUTA = `<?xml version="1.0"?><ns2:RicevutaConsegna xmlns:ns2="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.0"><IdentificativoSdI>1</IdentificativoSdI></ns2:RicevutaConsegna>`

const enc = new TextEncoder()

/** Busta firmata finta: byte binari prima e dopo, l'XML in chiaro in mezzo. */
function p7m(xml) {
  const testa = new Uint8Array([0x30, 0x82, 0x1f, 0x4a, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02, 0xa0])
  const coda = new Uint8Array([0xa0, 0x82, 0x05, 0x10, 0x30, 0x82, 0x04, 0xf8, 0x00, 0xff])
  const corpo = enc.encode(xml)
  const out = new Uint8Array(testa.length + corpo.length + coda.length)
  out.set(testa); out.set(corpo, testa.length); out.set(coda, testa.length + corpo.length)
  return out
}

/** Archivio ZIP senza compressione; il contenuto può essere testo o byte. */
function creaZip(file) {
  const voci = file.map(f => ({ nome: enc.encode(f.nome), dati: typeof f.contenuto === 'string' ? enc.encode(f.contenuto) : f.contenuto }))
  const pezzi = []
  const directory = []
  let offset = 0
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b }
  const u16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b }
  for (const v of voci) {
    const intestazione = [u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(v.dati.length), u32(v.dati.length), u16(v.nome.length), u16(0), v.nome]
    const inizio = offset
    for (const p of intestazione) { pezzi.push(p); offset += p.length }
    pezzi.push(v.dati); offset += v.dati.length
    directory.push([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(v.dati.length), u32(v.dati.length), u16(v.nome.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(inizio), v.nome])
  }
  const inizioDir = offset
  for (const d of directory) for (const p of d) { pezzi.push(p); offset += p.length }
  for (const p of [u32(0x06054b50), u16(0), u16(0), u16(voci.length), u16(voci.length),
    u32(offset - inizioDir), u32(inizioDir), u16(0)]) pezzi.push(p)
  const out = new Uint8Array(pezzi.reduce((s, p) => s + p.length, 0))
  let i = 0
  for (const p of pezzi) { out.set(p, i); i += p.length }
  return out
}

// Com'è una fattura in archivio dopo l'Excel di WebDesk: niente righe,
// niente P.IVA, niente IBAN.
const daExcel = (extra = {}) => ({
  id: 'f1', numero_rif: '160', fornitore: "MELLY'S KOMBUCHA SRL", data_fattura: '2026-04-09',
  totale: 122, piva: null, cf: null, iban: null, data_scadenza: null, ha_righe: false, ...extra,
})

// ── 1. L'archivio dell'Agenzia, com'è davvero ───────────────────────────

describe('lo ZIP del download massivo', () => {
  it('prende anche le fatture firmate, e metadati e ricevute non sono errori', async () => {
    const zip = creaZip([
      { nome: 'FATT_RICEVUTE/IT11122233344_00001.xml.p7m', contenuto: p7m(fatturaXml()) },
      { nome: 'FATT_RICEVUTE/IT11122233344_00001_metaDato.xml', contenuto: METADATI },
      { nome: 'FATT_RICEVUTE/IT55566677788_0AB12.xml', contenuto: fatturaXml({ numero: '7/25', fornitore: 'ALBAGEL sas', piva: '55566677788' }) },
      { nome: 'FATT_RICEVUTE/IT55566677788_0AB12_metaDato.xml', contenuto: METADATI },
      { nome: 'FATT_RICEVUTE/ricevuta.xml', contenuto: RICEVUTA },
      { nome: 'FATT_RICEVUTE/cortesia.pdf', contenuto: '%PDF-1.4' },
    ])
    const r = await leggiFattureDaFile('fatture_2026.zip', zip)
    expect(r.fatture).toBe(2)
    expect(r.records.map(x => x.numero_rif).sort()).toEqual(['160', '7/25'])
    expect(r.saltati).toBe(4)
    expect(r.illeggibili).toEqual([])
  })

  it('apre anche uno ZIP dentro lo ZIP', async () => {
    const dentro = creaZip([{ nome: 'a.xml', contenuto: fatturaXml({ numero: '1' }) }])
    const fuori = creaZip([{ nome: 'parte1.zip', contenuto: dentro }, { nome: 'b.xml', contenuto: fatturaXml({ numero: '2' }) }])
    const r = await leggiFattureDaFile('tutto.zip', fuori)
    expect(r.records.map(x => x.numero_rif).sort()).toEqual(['1', '2'])
  })

  it('una fattura rotta si segnala per nome, e le altre entrano', async () => {
    const zip = creaZip([
      { nome: 'buona.xml', contenuto: fatturaXml() },
      { nome: 'rotta.xml', contenuto: '<p:FatturaElettronica><FatturaElettronicaHeader/></p:FatturaElettronica>' },
    ])
    const r = await leggiFattureDaFile('x.zip', zip)
    expect(r.fatture).toBe(1)
    expect(r.illeggibili).toEqual(['rotta.xml'])
  })

  it('oltre i 2.000 file non si ferma: la fattura in fondo si legge', async () => {
    const file = Array.from({ length: 2100 }, (_, i) => ({ nome: `m${i}_metaDato.xml`, contenuto: METADATI }))
    file.push({ nome: 'ultima.xml', contenuto: fatturaXml({ numero: 'ULTIMA' }) })
    const r = await leggiFattureDaFile('grande.zip', creaZip(file))
    expect(r.records.map(x => x.numero_rif)).toEqual(['ULTIMA'])
    expect(r.troncato).toBe(false)
    expect(MAX_FILE_ARCHIVIO).toBeGreaterThanOrEqual(20000)
  })

  it('un .p7m caricato da solo si apre', async () => {
    const r = await leggiFattureDaFile('IT1_001.xml.p7m', p7m(fatturaXml()))
    expect(r.fatture).toBe(1)
  })
})

// ── 2. Il parser porta l'anagrafica ─────────────────────────────────────

describe('parseFatturaXML: i dati del fornitore', () => {
  it('indirizzo, contatti e la P.IVA di chi riceve', () => {
    const [f] = parseFatturaXML(fatturaXml())
    expect(f.fornitore_dati).toEqual({
      indirizzo: 'Via Nizza 12', cap: '10125', citta: 'Torino', provincia: 'TO',
      email: 'ordini@esempio.it', telefono: '011123456',
    })
    expect(f.cessionario_piva).toBe('09876543210')
    expect(f.righe).toHaveLength(2)
    expect(f.righe[0]).toMatchObject({ codice: 'KB-330', quantita: 24, unita: 'PZ', prezzo_unitario: 2.5 })
  })

  it('senza sede né contatti: campi vuoti, niente errore', () => {
    const xml = fatturaXml().replace(/<Sede>.*<\/Sede>/, '').replace(/<Contatti>.*<\/Contatti>/, '')
    const [f] = parseFatturaXML(xml)
    expect(f.fornitore_dati.indirizzo).toBeNull()
    expect(f.fornitore_dati.email).toBeNull()
  })
})

// ── 3. L'abbinamento ────────────────────────────────────────────────────

describe('abbinaFatture: completa, non doppia', () => {
  const [xml] = parseFatturaXML(fatturaXml())

  it('la fattura dall\'Excel si completa invece di essere scartata', () => {
    const ab = abbinaFatture([xml], [daExcel()])
    expect(ab.nuove).toEqual([])
    expect(ab.completa).toHaveLength(1)
    const { patch } = ab.completa[0]
    expect(patch.righe).toHaveLength(2)
    expect(patch.piva).toBe('11122233344')
    expect(patch.iban).toBe('IT60X0542811101000000123456')
    expect(patch.data_scadenza).toBe('2026-05-31')
  })

  it('non tocca mai numero, fornitore, totale, stato', () => {
    const { patch } = abbinaFatture([xml], [daExcel()]).completa[0]
    for (const k of ['numero_rif', 'fornitore', 'totale', 'stato', 'importo_pagato', 'data_pagamento', 'sede_id']) {
      expect(patch).not.toHaveProperty(k)
    }
  })

  it('il fornitore scritto in un altro modo è la stessa fattura', () => {
    const ab = abbinaFatture([xml], [daExcel({ fornitore: "Melly's Kombucha S.r.l." })])
    expect(ab.nuove).toEqual([])
    expect(ab.completa).toHaveLength(1)
  })

  it('nome diverso ma stesso numero, data e totale: la stessa fattura', () => {
    const ab = abbinaFatture([xml], [daExcel({ fornitore: 'MELLYS KOMBUCHA DI ROSSI' })])
    expect(ab.completa).toHaveLength(1)
  })

  it('stesso numero e data ma altro fornitore e altro totale: è un\'altra fattura', () => {
    const ab = abbinaFatture([xml], [daExcel({ fornitore: 'GRANO FACTORY S.R.L.', totale: 66 })])
    expect(ab.completa).toEqual([])
    expect(ab.nuove).toHaveLength(1)
  })

  it('due candidate possibili: non si tocca niente e lo si dice', () => {
    const ab = abbinaFatture([xml], [
      daExcel({ id: 'a', fornitore: 'Altro Uno' }),
      daExcel({ id: 'b', fornitore: 'Altro Due' }),
    ])
    expect(ab.completa).toEqual([])
    expect(ab.nuove).toEqual([])
    expect(ab.ambigue[0].candidati.sort()).toEqual(['a', 'b'])
  })

  it('già completa: si conta, non si riscrive', () => {
    const ab = abbinaFatture([xml], [daExcel({ ha_righe: true, piva: '1', cf: '1', iban: 'X', data_scadenza: '2026-05-01' })])
    expect(ab.completa).toEqual([])
    expect(ab.giaComplete).toBe(1)
  })

  it('un dato già scritto a mano non si sovrascrive', () => {
    const patch = patchDaXml(daExcel({ iban: 'IT00CORRETTOAMANO', data_scadenza: '2026-06-30' }), xml)
    expect(patch).not.toHaveProperty('iban')
    expect(patch).not.toHaveProperty('data_scadenza')
    expect(patch.righe).toHaveLength(2)
  })

  it('la stessa fattura due volte nello ZIP: una sola scrittura', () => {
    const ab = abbinaFatture([xml, { ...xml }], [daExcel()])
    expect(ab.completa).toHaveLength(1)
    expect(ab.doppieNelFile).toBe(1)
  })

  it('una fattura nuova due volte nello ZIP: una sola nuova', () => {
    const ab = abbinaFatture([xml, { ...xml }], [])
    expect(ab.nuove).toHaveLength(1)
  })
})

describe('normFornitore', () => {
  it('toglie forme societarie, accenti e punteggiatura', () => {
    expect(normFornitore("MELLY'S KOMBUCHA SRL")).toBe(normFornitore("Melly's Kombucha S.r.l."))
    expect(normFornitore('METRO Italia S.p.A.')).toBe('metro italia')
    expect(normFornitore('Tramezzino Itì Torino s.r.l. a socio unico')).toBe('tramezzino iti torino')
  })
  it('non fonde due fornitori che differiscono dopo «di»', () => {
    expect(normFornitore('Bar di Mario')).not.toBe(normFornitore('Bar di Luigi'))
  })
})

// ── 4. L'anagrafica dei fornitori ───────────────────────────────────────

describe('completaAnagraficaFornitori', () => {
  const [xml] = parseFatturaXML(fatturaXml())

  it('riempie solo i campi vuoti', () => {
    const [p] = completaAnagraficaFornitori([{ id: 'x', nome: "Melly's Kombucha S.r.l.", email: 'mia@mail.it' }], [xml])
    expect(p.patch).toMatchObject({ partita_iva: '11122233344', indirizzo: 'Via Nizza 12', cap: '10125', citta: 'Torino', provincia: 'TO', telefono: '011123456' })
    expect(p.patch).not.toHaveProperty('email')
  })

  it('la P.IVA vince sul nome', () => {
    const out = completaAnagraficaFornitori([
      { id: 'omonimo', nome: "MELLY'S KOMBUCHA SRL", partita_iva: '99999999999', indirizzo: 'x', cap: 'x', citta: 'x', provincia: 'x', email: 'x', telefono: 'x', codice_fiscale: 'x' },
      { id: 'giusto', nome: 'Kombucha Torino', partita_iva: '11122233344' },
    ], [xml])
    expect(out.map(o => o.id)).toEqual(['giusto'])
  })

  it('fornitore che non c\'è: nessuna scrittura', () => {
    expect(completaAnagraficaFornitori([{ id: 'x', nome: 'Altro' }], [xml])).toEqual([])
  })

  // In produzione, 03/10/2026: 315 fornitori, **nessuno** con l'IBAN. Lo
  // Scadenzario lo copiava dalla fattura, la pagina Integrazioni no: dallo
  // stesso ZIP, due risultati diversi a seconda del pulsante.
  it('copia l\'IBAN della fattura, solo se valido e solo se manca', () => {
    expect(completaAnagraficaFornitori([{ id: 'x', nome: "MELLY'S KOMBUCHA" }], [xml])[0].patch.iban).toBe('IT60X0542811101000000123456')
    const [rotto] = parseFatturaXML(fatturaXml({ iban: 'IT60X0542811101000000123457' }))
    expect(completaAnagraficaFornitori([{ id: 'x', nome: "MELLY'S KOMBUCHA" }], [rotto])[0].patch).not.toHaveProperty('iban')
    const gia = completaAnagraficaFornitori([{ id: 'x', nome: "MELLY'S KOMBUCHA", iban: 'IT02L1234512345123456789012' }], [xml])
    expect(gia[0].patch).not.toHaveProperty('iban')
  })
})

describe('testoAvanzamentoXml', () => {
  it('dice la fase e quanti ne mancano, coi numeri all\'italiana', () => {
    expect(testoAvanzamentoXml('completamento', 1200, 2799)).toBe('Completo le fatture · 1.200 di 2.799')
    expect(testoAvanzamentoXml('lettura', 0, 1)).toBe('Leggo i file…')
    expect(testoAvanzamentoXml('fornitori', 3, 315)).toBe('Aggiorno i fornitori · 3 di 315')
  })
  // `toLocaleString('it-IT')` da solo non mette il punto sotto le 5 cifre:
  // sul primo ZIP vero il riepilogo avrebbe detto «2799 fatture completate».
  it('anche il riepilogo finale ha il punto delle migliaia', () => {
    const e = { completate: 2799, nuove: 1004, giaPresenti: 0, fornitoriCompletati: 0, lette: 3803 }
    expect(fraseEsitoXml(e)).toBe('2.799 fatture completate con righe e dati del fornitore · 1.004 nuove')
  })
})

// ── 5. Le scritture sul database ────────────────────────────────────────

function fintoDb({ fatture = [], fornitori = [], falliscono = [] } = {}) {
  const log = { update: [], insert: [] }
  const tabella = (nome) => {
    const q = { _nome: nome, _filtri: {}, _range: null }
    q.select = () => q
    q.order = () => q
    q.eq = (k, v) => { q._filtri[k] = v; return q }
    q.range = (a, b) => { q._range = [a, b]; return q }
    q.update = (patch) => { q._patch = patch; return q }
    q.insert = async (righe) => { log.insert.push(...righe); fatture.push(...righe); return { error: null } }
    q.then = (ok, ko) => {
      let res
      if (q._patch) {
        if (falliscono.includes(q._filtri.id)) res = { error: { message: 'rete caduta' } }
        else { log.update.push({ tabella: nome, id: q._filtri.id, patch: q._patch }); res = { error: null } }
      } else {
        const tutte = nome === 'fatture' ? fatture : fornitori
        const [a, b] = q._range || [0, tutte.length - 1]
        res = { data: tutte.slice(a, b + 1), error: null }
      }
      return Promise.resolve(res).then(ok, ko)
    }
    return q
  }
  return { supabase: { from: tabella }, log }
}

describe('applicaCompletamenti', () => {
  it('un errore su una fattura non ferma le altre', async () => {
    const db = fintoDb({ falliscono: ['b'] })
    const completa = ['a', 'b', 'c'].map(id => ({ id, patch: { piva: '1' }, record: { numero_rif: id } }))
    const passi = []
    const r = await applicaCompletamenti(db.supabase, 'org', completa, { parallele: 2, onProgresso: (f, t) => passi.push([f, t]) })
    expect(r.fatte).toBe(2)
    expect(r.errori).toEqual([{ id: 'b', numero: 'b', messaggio: 'rete caduta' }])
    expect(passi).toEqual([[2, 3], [3, 3]])
  })
})

describe('fattureEsistentiPerAbbinare', () => {
  it('sa se una fattura ha righe senza scaricarle, e legge a pagine', async () => {
    const fatture = Array.from({ length: 1500 }, (_, i) => ({ id: String(i), numero_rif: String(i), prima_riga: i === 3 ? { n: 1 } : null }))
    const db = fintoDb({ fatture })
    const out = await fattureEsistentiPerAbbinare(db.supabase, 'org')
    expect(out).toHaveLength(1500)
    expect(out[3].ha_righe).toBe(true)
    expect(out[4].ha_righe).toBe(false)
    expect(out[0]).not.toHaveProperty('prima_riga')
  })
})

// ── 6. Il percorso intero ───────────────────────────────────────────────

describe('importaFattureXml: dallo ZIP al database', () => {
  const file = (nome, bytes) => ({ name: nome, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })

  it('completa quella che c\'è, crea quella che manca, arricchisce il fornitore', async () => {
    const db = fintoDb({
      fatture: [{ ...daExcel({ id: 'esistente' }), prima_riga: null }],
      fornitori: [{ id: 'forn1', nome: "MELLY'S KOMBUCHA SRL" }],
    })
    const zip = creaZip([
      { nome: 'a.xml.p7m', contenuto: p7m(fatturaXml()) },
      { nome: 'a_metaDato.xml', contenuto: METADATI },
      { nome: 'b.xml', contenuto: fatturaXml({ numero: '161', data: '2026-04-20' }) },
    ])
    const e = await importaFattureXml(db.supabase, { orgId: 'org', sedeId: 'sede1', files: [file('agenzia.zip', zip)] })

    expect(e.lette).toBe(2)
    expect(e.completate).toBe(1)
    expect(e.nuove).toBe(1)
    const upFattura = db.log.update.find(u => u.tabella === 'fatture')
    expect(upFattura.id).toBe('esistente')
    expect(upFattura.patch.righe).toHaveLength(2)
    expect(db.log.insert).toHaveLength(1)
    expect(db.log.insert[0]).toMatchObject({ numero_rif: '161', sede_id: 'sede1', organization_id: 'org' })
    // `fornitore_dati` non è una colonna di `fatture`: non deve finire nell'INSERT.
    expect(db.log.insert[0]).not.toHaveProperty('fornitore_dati')
    expect(db.log.insert[0].righe).toHaveLength(2)
    const upForn = db.log.update.find(u => u.tabella === 'fornitori')
    expect(upForn.patch).toMatchObject({ partita_iva: '11122233344', citta: 'Torino' })
    expect(e.fornitoriCompletati).toBe(1)
    expect(fraseEsitoXml(e)).toMatch(/1 fattura completata .* 1 nuova .* 1 scheda fornitore/)
    expect(avvisiEsitoXml(e)).toEqual([])
  })

  it('ricaricare lo stesso ZIP non aggiunge e non riscrive niente', async () => {
    const [xml] = parseFatturaXML(fatturaXml())
    const db = fintoDb({ fatture: [{ ...daExcel({ ha_righe: undefined, piva: xml.piva, cf: xml.cf, iban: xml.iban, data_scadenza: xml.data_scadenza }), prima_riga: { n: 1 } }] })
    const e = await importaFattureXml(db.supabase, { orgId: 'org', files: [file('x.zip', creaZip([{ nome: 'a.xml', contenuto: fatturaXml() }]))] })
    expect(e.completate).toBe(0)
    expect(e.nuove).toBe(0)
    expect(e.giaPresenti).toBe(1)
    expect(db.log.update.filter(u => u.tabella === 'fatture')).toEqual([])
    expect(fraseEsitoXml(e)).toMatch(/1 già completa\b/)
  })

  it('un file che non è uno ZIP né una fattura: lo dice, non si rompe', async () => {
    const db = fintoDb()
    const e = await importaFattureXml(db.supabase, { orgId: 'org', files: [file('note.xml', enc.encode('<root/>'))] })
    expect(e.lette).toBe(0)
    expect(avvisiEsitoXml(e)[0]).toMatch(/note\.xml/)
    expect(fraseEsitoXml(e)).toMatch(/non ho trovato fatture/)
  })
})

// Senza un automatismo gratuito, è il promemoria che tiene vivo il flusso:
// il titolare non deve ricordarsi di scaricare lo ZIP, glielo dice Foodos.
describe('promemoriaZipAgenzia', () => {
  it('il mese scorso è coperto: nessun avviso', () => {
    expect(promemoriaZipAgenzia('2026-09-28', '2026-10-03')).toBeNull()
    expect(promemoriaZipAgenzia('2026-10-01', '2026-10-03')).toBeNull()
  })
  it('manca solo il mese scorso', () => {
    const p = promemoriaZipAgenzia('2026-08-31', '2026-10-03')
    expect(p.titolo).toBe('Mancano le fatture complete di settembre.')
    expect(p.da).toBe('settembre')
  })
  it('mancano più mesi: dice da quale ripartire', () => {
    expect(promemoriaZipAgenzia('2026-05-12', '2026-10-03').titolo).toBe('Mancano le fatture complete da giugno a settembre.')
  })
  it('a cavallo dell\'anno scrive l\'anno dei mesi passati', () => {
    expect(promemoriaZipAgenzia('2026-11-30', '2027-01-10').titolo).toBe('Mancano le fatture complete di dicembre 2026.')
    expect(promemoriaZipAgenzia('2026-12-31', '2027-01-10')).toBeNull()
    expect(promemoriaZipAgenzia('2026-10-15', '2027-01-10').titolo).toBe('Mancano le fatture complete da novembre 2026 a dicembre 2026.')
  })
  it('nessuna fattura con le righe, ma fatture in archivio: invita a completarle', () => {
    expect(promemoriaZipAgenzia(null, '2026-10-03', true).titolo).toMatch(/non hanno ancora il dettaglio/)
  })
  it('azienda senza fatture, o data mancante: nessun avviso', () => {
    expect(promemoriaZipAgenzia(null, '2026-10-03', false)).toBeNull()
    expect(promemoriaZipAgenzia('2026-01-01', '')).toBeNull()
  })
})
