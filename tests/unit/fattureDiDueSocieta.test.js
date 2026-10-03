// @vitest-environment happy-dom
//
// ── Un'azienda, due società: la fattura va alla sede della sua società ──
//
// Il titolare, 03/10/2026. L'azienda del design partner è fatta di due SRL:
// una ha un negozio (Carlina), l'altra due (De Gasperi e Berthollet), e le
// fatture di questa seconda sono spese dei due negozi insieme. Sta caricando
// gli ZIP dell'Agenzia delle Entrate per tutte e due le società.
//
// Il difetto: ogni caricamento chiedeva la sede a mano (o prendeva quella
// attiva, dalla pagina Integrazioni), e TUTTE le fatture del caricamento
// finivano lì. Uno ZIP con dentro fatture di tutte e due le società non si
// poteva caricare giusto in nessun modo. Eppure il dato c'era: ogni XML dice
// a chi è intestato (`CessionarioCommittente`), e `parseFatturaXML` leggeva
// già la P.IVA — che poi nessuno usava.
//
// È lo stesso danno del 17/09/2026, quando 3.104 fatture finirono tutte su
// Carlina «perché era la sede attiva»: una spesa sulla sede sbagliata sporca
// il food cost di due negozi in direzioni opposte.
//
// Qui si prova:
//   1. la regola pura che decide dove va ogni fattura nuova (P.IVA nota → le
//      sue sedi; ignota → si chiede una volta; una sede sola → niente
//      domanda; senza P.IVA → il comportamento di prima);
//   2. il parser che legge chi riceve la fattura;
//   3. la proposta per le fatture già in archivio, che NON si spostano da
//      sole: si mostrano i numeri e si aspetta un sì.
import { describe, it, expect } from 'vitest'
import {
  normPiva, leggiMappa, unisciMappa, destinazioneDaSedi, decidiSediImport,
  applicaRisposte, nomiSedi, versoSedi, nomeSocieta, propostaSpostamenti,
  patchSpostamento, fraseSpostamento, fraseDestinazioni, domandeDaGruppi,
} from '../../src/lib/societaSedi.js'
import { parseFatturaXML } from '../../src/lib/parseFatturaXML.js'
import { importaFattureXml, fraseEsitoXml, avvisiEsitoXml } from '../../src/lib/importaFattureXml.js'

const SEDI = [
  { id: 's-carlina', nome: 'Carlina' },
  { id: 's-degasperi', nome: 'De Gasperi' },
  { id: 's-berthollet', nome: 'Berthollet' },
]
const PIVA_A = '11111111111' // la società con un negozio
const PIVA_B = '22222222222' // la società con due negozi
const MAPPA = {
  [PIVA_A]: { nome: 'ALFA SRL', sedi: ['s-carlina'] },
  [PIVA_B]: { nome: 'BETA SRL', sedi: ['s-degasperi', 's-berthollet'] },
}
const fattura = (numero, cessionario_piva, extra = {}) => ({
  numero_rif: String(numero), fornitore: 'Latteria', data_fattura: '2026-09-01', totale: 100,
  cessionario_piva, cessionario_nome: cessionario_piva === PIVA_B ? 'BETA SRL' : cessionario_piva === PIVA_A ? 'ALFA SRL' : null,
  ...extra,
})

// ── 1. La regola ────────────────────────────────────────────────────────

describe('normPiva', () => {
  it('toglie spazi, punti e il prefisso del paese', () => {
    expect(normPiva(' 111 111 111.11 ')).toBe('11111111111')
    expect(normPiva('IT11111111111')).toBe('11111111111')
    expect(normPiva('it11111111111')).toBe('11111111111')
  })
  it('un codice estero non si tocca, e il vuoto resta vuoto', () => {
    expect(normPiva('DE123456789')).toBe('DE123456789')
    expect(normPiva(null)).toBe('')
    expect(normPiva(undefined)).toBe('')
  })
})

describe('destinazioneDaSedi', () => {
  it('una sede: la fattura è sua', () => {
    expect(destinazioneDaSedi(['s-carlina'])).toEqual({ sedeId: 's-carlina', sediCondivise: null })
  })
  it('due sedi: spesa condivisa, e la sede resta vuota apposta', () => {
    expect(destinazioneDaSedi(['s-degasperi', 's-berthollet'])).toEqual({ sedeId: null, sediCondivise: ['s-degasperi', 's-berthollet'] })
  })
  it('la stessa sede due volte è una sede sola, non una spesa condivisa', () => {
    expect(destinazioneDaSedi(['s-carlina', 's-carlina'])).toEqual({ sedeId: 's-carlina', sediCondivise: null })
  })
  it('nessuna sede: senza sede, come prima', () => {
    expect(destinazioneDaSedi([])).toEqual({ sedeId: null, sediCondivise: null })
    expect(destinazioneDaSedi(null)).toEqual({ sedeId: null, sediCondivise: null })
  })
})

describe('decidiSediImport: dove va ogni fattura nuova', () => {
  it('P.IVA già nella mappa: le sue sedi, senza chiedere niente', () => {
    const d = decidiSediImport([fattura(1, PIVA_A), fattura(2, PIVA_B), fattura(3, PIVA_B)], { mappa: MAPPA, sedi: SEDI })
    expect(d.daChiedere).toEqual([])
    const a = d.gruppi.find(g => g.piva === PIVA_A)
    const b = d.gruppi.find(g => g.piva === PIVA_B)
    expect(a).toMatchObject({ come: 'mappa', sedi: ['s-carlina'] })
    expect(a.records.map(r => r.numero_rif)).toEqual(['1'])
    expect(b).toMatchObject({ come: 'mappa', sedi: ['s-degasperi', 's-berthollet'] })
    expect(b.records.map(r => r.numero_rif)).toEqual(['2', '3'])
  })

  it('P.IVA mai vista: si chiede, una volta per società e non per fattura', () => {
    const d = decidiSediImport([fattura(1, PIVA_B), fattura(2, PIVA_B), fattura(3, PIVA_B)], { mappa: {}, sedi: SEDI })
    expect(d.daChiedere).toHaveLength(1)
    expect(d.daChiedere[0]).toMatchObject({ piva: PIVA_B, nome: 'BETA SRL', sedi: null, come: 'chiedere' })
    expect(d.daChiedere[0].records).toHaveLength(3)
  })

  it('una P.IVA scritta in due modi è la stessa società', () => {
    const d = decidiSediImport([fattura(1, 'IT' + PIVA_B), fattura(2, PIVA_B)], { mappa: MAPPA, sedi: SEDI })
    expect(d.gruppi).toHaveLength(1)
    expect(d.gruppi[0].records).toHaveLength(2)
    expect(d.gruppi[0].come).toBe('mappa')
  })

  it('una sede sola in tutta l\'azienda: niente domanda, nemmeno per una P.IVA nuova', () => {
    const d = decidiSediImport([fattura(1, PIVA_B), fattura(2, null)], { mappa: {}, sedi: [SEDI[0]], ripiego: null })
    expect(d.daChiedere).toEqual([])
    expect(d.gruppi.every(g => g.come === 'unica' && g.sedi[0] === 's-carlina')).toBe(true)
  })

  it('nessuna sede: niente domanda, le fatture restano dell\'azienda', () => {
    const d = decidiSediImport([fattura(1, PIVA_B)], { mappa: {}, sedi: [] })
    expect(d.daChiedere).toEqual([])
    expect(d.gruppi[0].sedi).toEqual([])
  })

  it('senza P.IVA di chi riceve: il ripiego di prima (la sede attiva, da Integrazioni)', () => {
    const d = decidiSediImport([fattura(1, null)], { mappa: MAPPA, sedi: SEDI, ripiego: ['s-berthollet'] })
    expect(d.daChiedere).toEqual([])
    expect(d.gruppi[0]).toMatchObject({ piva: null, come: 'ripiego', sedi: ['s-berthollet'] })
  })

  it('senza P.IVA e senza ripiego (Scadenzario): si chiede, come si faceva prima', () => {
    const d = decidiSediImport([fattura(1, null), fattura(2, PIVA_A)], { mappa: MAPPA, sedi: SEDI, ripiego: null })
    expect(d.daChiedere).toHaveLength(1)
    expect(d.daChiedere[0].piva).toBeNull()
  })

  it('la mappa punta a una sede che non c\'è più: si chiede di nuovo invece di scrivere su una sede morta', () => {
    const d = decidiSediImport([fattura(1, PIVA_A)], { mappa: { [PIVA_A]: { nome: 'ALFA SRL', sedi: ['s-chiusa'] } }, sedi: SEDI })
    expect(d.daChiedere).toHaveLength(1)
    expect(d.daChiedere[0].nome).toBe('ALFA SRL')
  })

  it('una sede chiusa fra due: resta l\'altra, e la spesa diventa di una sede sola', () => {
    const d = decidiSediImport([fattura(1, PIVA_B)], { mappa: { [PIVA_B]: { nome: 'BETA SRL', sedi: ['s-chiusa', 's-degasperi'] } }, sedi: SEDI })
    expect(d.gruppi[0]).toMatchObject({ come: 'mappa', sedi: ['s-degasperi'] })
  })

  it('il nome della società viene dal file; se manca, dalla mappa', () => {
    const d = decidiSediImport([fattura(1, PIVA_B, { cessionario_nome: null })], { mappa: MAPPA, sedi: SEDI })
    expect(d.gruppi[0].nome).toBe('BETA SRL')
  })
})

describe('applicaRisposte', () => {
  const d = decidiSediImport([fattura(1, PIVA_B), fattura(2, null)], { mappa: {}, sedi: SEDI, ripiego: null })

  it('la risposta diventa la destinazione e la voce da ricordare', () => {
    const r = applicaRisposte(d, { [PIVA_B]: ['s-degasperi', 's-berthollet'], '': ['s-carlina'] }, SEDI)
    expect(r.mancano).toEqual([])
    expect(r.gruppi.find(g => g.piva === PIVA_B).sedi).toEqual(['s-degasperi', 's-berthollet'])
    expect(r.ricordare).toEqual({ [PIVA_B]: { nome: 'BETA SRL', sedi: ['s-degasperi', 's-berthollet'] } })
  })

  it('il gruppo senza P.IVA non si ricorda: non c\'è niente a cui legarlo', () => {
    const r = applicaRisposte(d, { [PIVA_B]: ['s-carlina'], '': ['s-carlina'] }, SEDI)
    expect(Object.keys(r.ricordare)).toEqual([PIVA_B])
  })

  it('una società senza nessuna sede scelta non passa: manca la risposta', () => {
    const r = applicaRisposte(d, { [PIVA_B]: [], '': [] }, SEDI)
    expect(r.mancano.map(g => g.piva)).toEqual([PIVA_B])
    expect(r.ricordare).toEqual({})
  })

  it('senza P.IVA si può scegliere «nessuna sede», come prima', () => {
    const r = applicaRisposte(d, { [PIVA_B]: ['s-carlina'], '': [] }, SEDI)
    expect(r.mancano).toEqual([])
    expect(r.gruppi.find(g => g.piva === null).sedi).toEqual([])
  })

  it('una sede che non è dell\'azienda non entra nella risposta', () => {
    const r = applicaRisposte(d, { [PIVA_B]: ['s-di-un-altro'], '': [] }, SEDI)
    expect(r.mancano.map(g => g.piva)).toEqual([PIVA_B])
  })
})

describe('la mappa salvata', () => {
  it('leggiMappa ripulisce chiavi, nomi e sedi doppie, e ignora i valori rotti', () => {
    expect(leggiMappa({ 'IT11111111111': { nome: ' ALFA SRL ', sedi: ['a', 'a', '', null] }, '': { sedi: ['x'] }, '333': 'rotto' }))
      .toEqual({ [PIVA_A]: { nome: 'ALFA SRL', sedi: ['a'] } })
    expect(leggiMappa(null)).toEqual({})
    expect(leggiMappa([1, 2])).toEqual({})
  })

  it('unisciMappa aggiunge senza cancellare le altre società', () => {
    const m = unisciMappa({ [PIVA_A]: MAPPA[PIVA_A] }, { [PIVA_B]: MAPPA[PIVA_B] })
    expect(Object.keys(m).sort()).toEqual([PIVA_A, PIVA_B])
  })

  it('unisciMappa sostituisce le sedi di una società già nota e ne tiene il nome', () => {
    const m = unisciMappa(MAPPA, { [PIVA_A]: { nome: '', sedi: ['s-berthollet'] } })
    expect(m[PIVA_A]).toEqual({ nome: 'ALFA SRL', sedi: ['s-berthollet'] })
  })
})

describe('le parole a schermo', () => {
  it('le sedi si elencano come si parla', () => {
    expect(nomiSedi(['s-carlina'], SEDI)).toBe('Carlina')
    expect(nomiSedi(['s-degasperi', 's-berthollet'], SEDI)).toBe('De Gasperi e Berthollet')
    expect(nomiSedi(SEDI.map(s => s.id), SEDI)).toBe('Carlina, De Gasperi e Berthollet')
    expect(nomiSedi([], SEDI)).toBe('senza sede')
  })
  it('una sede o una spesa condivisa', () => {
    expect(versoSedi(['s-carlina'], SEDI)).toBe('a Carlina')
    expect(versoSedi(['s-degasperi', 's-berthollet'], SEDI)).toBe('condivise fra De Gasperi e Berthollet')
  })
  it('la società col nome e la P.IVA, o solo la P.IVA', () => {
    expect(nomeSocieta({ piva: PIVA_B, nome: 'BETA SRL' })).toBe(`BETA SRL (P.IVA ${PIVA_B})`)
    expect(nomeSocieta({ piva: PIVA_B, nome: '' })).toBe(`P.IVA ${PIVA_B}`)
    expect(nomeSocieta({ piva: null })).toMatch(/senza la P\.IVA/)
  })
  it('dove sono andate le nuove, coi numeri all\'italiana', () => {
    expect(fraseDestinazioni([
      { sedi: ['s-carlina'], inserite: 1040 },
      { sedi: ['s-degasperi', 's-berthollet'], inserite: 12 },
    ], SEDI)).toBe('Le nuove: 1.040 a Carlina, 12 condivise fra De Gasperi e Berthollet.')
  })
  it('una sola condivisa si dice al singolare, e le senza sede si dicono', () => {
    expect(fraseDestinazioni([
      { sedi: ['s-degasperi', 's-berthollet'], inserite: 1 },
      { sedi: [], inserite: 2 },
    ], SEDI)).toBe('Le nuove: 1 condivisa fra De Gasperi e Berthollet, 2 senza sede.')
  })
  it('due società che vanno nello stesso posto si sommano', () => {
    expect(fraseDestinazioni([
      { sedi: ['s-carlina'], inserite: 2 },
      { sedi: ['s-carlina'], inserite: 3 },
    ], SEDI)).toBe('Le nuove: 5 a Carlina.')
  })
  it('con una sede sola, o se non è entrato niente, non dice niente', () => {
    expect(fraseDestinazioni([{ sedi: ['s-carlina'], inserite: 3 }], [SEDI[0]])).toBe('')
    expect(fraseDestinazioni([{ sedi: ['s-carlina'], inserite: 0 }], SEDI)).toBe('')
  })
})

// ── 2. Il parser: chi riceve la fattura ─────────────────────────────────

const xml = ({ cessionario = `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${PIVA_B}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>BETA SRL</Denominazione></Anagrafica>`, extra = '' } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <CedentePrestatore><DatiAnagrafici>
      <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>99999999999</IdCodice></IdFiscaleIVA>
      <Anagrafica><Denominazione>LATTERIA SRL</Denominazione></Anagrafica>
    </DatiAnagrafici></CedentePrestatore>
    <CessionarioCommittente><DatiAnagrafici>${cessionario}</DatiAnagrafici>${extra}</CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento>
    <TipoDocumento>TD01</TipoDocumento><Numero>7</Numero><Data>2026-09-01</Data><ImportoTotaleDocumento>10.00</ImportoTotaleDocumento>
  </DatiGeneraliDocumento></DatiGenerali></FatturaElettronicaBody>
</p:FatturaElettronica>`

describe('parseFatturaXML: chi riceve la fattura', () => {
  it('P.IVA e ragione sociale della società', () => {
    const [f] = parseFatturaXML(xml())
    expect(f.cessionario_piva).toBe(PIVA_B)
    expect(f.cessionario_nome).toBe('BETA SRL')
    // Non è il fornitore: la denominazione del cedente resta sua.
    expect(f.fornitore).toBe('LATTERIA SRL')
  })

  it('una ditta individuale: nome e cognome', () => {
    const [f] = parseFatturaXML(xml({ cessionario: `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${PIVA_A}</IdCodice></IdFiscaleIVA><Anagrafica><Nome>Mara</Nome><Cognome>Rossi</Cognome></Anagrafica>` }))
    expect(f.cessionario_nome).toBe('Mara Rossi')
  })

  it('il prefisso del paese dentro il codice non fa una società nuova', () => {
    const [f] = parseFatturaXML(xml({ cessionario: `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>IT${PIVA_B}</IdCodice></IdFiscaleIVA>` }))
    expect(f.cessionario_piva).toBe(PIVA_B)
    expect(f.cessionario_nome).toBeNull()
  })

  it('senza P.IVA (un privato): vuota, non inventata', () => {
    const [f] = parseFatturaXML(xml({ cessionario: '<CodiceFiscale>RSSMRA80A01L219X</CodiceFiscale><Anagrafica><Nome>Mario</Nome><Cognome>Rossi</Cognome></Anagrafica>' }))
    expect(f.cessionario_piva).toBeNull()
  })

  it('il rappresentante fiscale non prende il posto della società', () => {
    const [f] = parseFatturaXML(xml({
      cessionario: `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${PIVA_B}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>BETA SRL</Denominazione></Anagrafica>`,
      extra: '<RappresentanteFiscale><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>55555555555</IdCodice></IdFiscaleIVA><Denominazione>RAPPRESENTANTE SPA</Denominazione></RappresentanteFiscale>',
    }))
    expect(f.cessionario_piva).toBe(PIVA_B)
    expect(f.cessionario_nome).toBe('BETA SRL')
  })
})

// ── 3. Le fatture già in archivio: si propone, non si sposta ────────────

describe('propostaSpostamenti', () => {
  const archivio = [
    // Di BETA ma finite su Carlina con l'import di settembre: da spostare.
    { id: 'f1', sede_id: 's-carlina', sedi_condivise: null, cessionario_piva: PIVA_B, totale: 1000 },
    { id: 'f2', sede_id: 's-carlina', sedi_condivise: null, cessionario_piva: PIVA_B, totale: 234.5 },
    // Di BETA e già condivise giuste (in un altro ordine): non si toccano.
    { id: 'f3', sede_id: null, sedi_condivise: ['s-berthollet', 's-degasperi'], cessionario_piva: PIVA_B, totale: 50 },
    // Di BETA, senza sede: da spostare anche questa.
    { id: 'f4', sede_id: null, sedi_condivise: null, cessionario_piva: PIVA_B, totale: 10 },
    // Di ALFA, già su Carlina: a posto.
    { id: 'f5', sede_id: 's-carlina', sedi_condivise: null, cessionario_piva: PIVA_A, totale: 70 },
    // Di ALFA ma condivisa per sbaglio: torna a Carlina.
    { id: 'f6', sede_id: null, sedi_condivise: ['s-degasperi', 's-berthollet'], cessionario_piva: PIVA_A, totale: 30 },
    // Di una società che la mappa non conosce: non si indovina.
    { id: 'f7', sede_id: 's-carlina', sedi_condivise: null, cessionario_piva: '33333333333', totale: 5 },
    // Senza P.IVA (dall'Excel, mai completata): fuori.
    { id: 'f8', sede_id: 's-carlina', sedi_condivise: null, cessionario_piva: null, totale: 5 },
  ]

  it('mostra solo quelle fuori posto, per società, coi numeri', () => {
    const p = propostaSpostamenti(archivio, MAPPA, SEDI)
    const beta = p.find(g => g.piva === PIVA_B)
    const alfa = p.find(g => g.piva === PIVA_A)
    expect(p).toHaveLength(2)
    expect(beta.ids.sort()).toEqual(['f1', 'f2', 'f4'])
    expect(beta.n).toBe(3)
    expect(beta.totale).toBe(1244.5)
    expect(beta.verso).toEqual({ sedeId: null, sediCondivise: ['s-degasperi', 's-berthollet'] })
    expect(beta.da).toEqual([
      { sedi: ['s-carlina'], condivisa: false, n: 2, totale: 1234.5 },
      { sedi: [], condivisa: false, n: 1, totale: 10 },
    ])
    expect(alfa.ids).toEqual(['f6'])
    expect(alfa.verso).toEqual({ sedeId: 's-carlina', sediCondivise: null })
  })

  it('la frase dice da dove, verso dove e quanto vale', () => {
    const [beta] = propostaSpostamenti(archivio.slice(0, 2), MAPPA, SEDI)
    expect(fraseSpostamento(beta, SEDI)).toBe('2 fatture di BETA SRL oggi su Carlina → condivise fra De Gasperi e Berthollet · 1.235 €')
    const [tutte] = propostaSpostamenti(archivio.filter(f => f.cessionario_piva === PIVA_B), MAPPA, SEDI)
    expect(fraseSpostamento(tutte, SEDI)).toBe('3 fatture di BETA SRL oggi (2 su Carlina, 1 senza sede) → condivise fra De Gasperi e Berthollet · 1.245 €')
  })

  it('le colonne da scrivere: sede vuota e due sedi, o una sede e niente condivise', () => {
    const p = propostaSpostamenti(archivio, MAPPA, SEDI)
    expect(patchSpostamento(p.find(g => g.piva === PIVA_B))).toEqual({ sede_id: null, sedi_condivise: ['s-degasperi', 's-berthollet'] })
    expect(patchSpostamento(p.find(g => g.piva === PIVA_A))).toEqual({ sede_id: 's-carlina', sedi_condivise: null })
  })

  it('tutto già al suo posto: nessuna proposta', () => {
    expect(propostaSpostamenti(archivio.filter(f => ['f3', 'f5'].includes(f.id)), MAPPA, SEDI)).toEqual([])
  })

  it('con una sede sola non c\'è niente da spostare', () => {
    expect(propostaSpostamenti(archivio, MAPPA, [SEDI[0]])).toEqual([])
  })

  it('la mappa punta a sedi chiuse: non si sposta niente verso il nulla', () => {
    expect(propostaSpostamenti(archivio, { [PIVA_B]: { nome: 'BETA SRL', sedi: ['s-chiusa'] } }, SEDI)).toEqual([])
  })
})


// ── 4. Il percorso intero: dai file XML alle righe scritte ──────────────
//
// I pezzi giusti da soli non bastano (è la famiglia di difetti più cara di
// questo progetto: chi decide e chi scrive, mai collegati). Qui si parte dai
// file, si passa dal parser, dalla decisione e dalla domanda, e si guarda
// cosa arriva davvero all'INSERT.

const fileXml = (numero, piva, nome, data = '2026-09-01') => {
  const testo = xml({ cessionario: piva
    ? `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${piva}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>${nome}</Denominazione></Anagrafica>`
    : '<CodiceFiscale>RSSMRA80A01L219X</CodiceFiscale>' })
    .replace('<Numero>7</Numero>', `<Numero>${numero}</Numero>`)
    .replace('<Data>2026-09-01</Data>', `<Data>${data}</Data>`)
  const bytes = new TextEncoder().encode(testo)
  return { name: `IT99999999999_${numero}.xml`, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
}

/** Il database finto: fatture già in archivio, INSERT e UPDATE registrati. */
function fintoDb(esistenti = []) {
  const log = { insert: [], update: [] }
  const tabella = (nome) => {
    const q = { _f: {} }
    q.select = () => q
    q.order = () => q
    q.eq = (k, v) => { q._f[k] = v; return q }
    q.range = () => q
    q.update = (patch) => { q._patch = patch; return q }
    q.insert = async (righe) => { log.insert.push(...righe); return { error: null } }
    q.then = (ok, ko) => {
      let res
      if (q._patch) { log.update.push({ tabella: nome, id: q._f.id, patch: q._patch }); res = { error: null } }
      else res = { data: nome === 'fatture' ? esistenti : [], error: null }
      return Promise.resolve(res).then(ok, ko)
    }
    return q
  }
  return { supabase: { from: tabella }, log }
}

const ALFA = ['11111111111', 'ALFA SRL']
const BETA = ['22222222222', 'BETA SRL']

describe('importaFattureXml con due società: il percorso intero', () => {
  it('società già note: nessuna domanda, ogni fattura alla sua sede, e la P.IVA scritta', async () => {
    const db = fintoDb()
    const e = await importaFattureXml(db.supabase, {
      orgId: 'org', files: [fileXml(1, ...ALFA), fileXml(2, ...BETA), fileXml(3, ...BETA)],
      societa: { mappa: MAPPA, sedi: SEDI, ripiego: null },
      chiediSedi: async () => { throw new Error('non doveva chiedere') },
    })
    expect(e.nuove).toBe(3)
    const per = (n) => db.log.insert.find(r => r.numero_rif === String(n))
    expect(per(1)).toMatchObject({ sede_id: 's-carlina', cessionario_piva: ALFA[0] })
    expect(per(1)).not.toHaveProperty('sedi_condivise')
    for (const n of [2, 3]) {
      expect(per(n).sede_id).toBeNull()
      expect(per(n).sedi_condivise).toEqual(['s-degasperi', 's-berthollet'])
      expect(per(n).cessionario_piva).toBe(BETA[0])
    }
    // `cessionario_nome` serve alla domanda, non è una colonna.
    expect(per(1)).not.toHaveProperty('cessionario_nome')
    expect(fraseEsitoXml(e)).toBe('3 nuove. Le nuove: 1 a Carlina, 2 condivise fra De Gasperi e Berthollet.')
  })

  it('società mai vista: una domanda sola, PRIMA di scrivere, e la risposta si ricorda', async () => {
    const db = fintoDb()
    const domande = []
    const ricordate = []
    const e = await importaFattureXml(db.supabase, {
      orgId: 'org', files: [fileXml(1, ...BETA, '2026-03-02'), fileXml(2, ...BETA, '2026-08-30'), fileXml(3, ...ALFA)],
      societa: { mappa: { [ALFA[0]]: MAPPA[ALFA[0]] }, sedi: SEDI, ripiego: null },
      chiediSedi: async (d) => {
        domande.push(d)
        // Nel momento della domanda non è stato scritto niente.
        expect(db.log.insert).toEqual([])
        expect(db.log.update).toEqual([])
        return { [BETA[0]]: ['s-degasperi', 's-berthollet'] }
      },
      ricordaSocieta: async (voci) => { ricordate.push(voci) },
    })
    expect(domande).toHaveLength(1)
    expect(domande[0]).toEqual([{ chiave: BETA[0], piva: BETA[0], nome: 'BETA SRL', n: 2, dal: '2026-03-02', al: '2026-08-30' }])
    expect(ricordate).toEqual([{ [BETA[0]]: { nome: 'BETA SRL', sedi: ['s-degasperi', 's-berthollet'] } }])
    expect(e.nuove).toBe(3)
    expect(db.log.insert.filter(r => r.sedi_condivise).map(r => r.numero_rif).sort()).toEqual(['1', '2'])
    expect(db.log.insert.find(r => r.numero_rif === '3').sede_id).toBe('s-carlina')
  })

  it('annullare la domanda non scrive niente: né nuove, né completamenti', async () => {
    const db = fintoDb([{ id: 'vecchia', numero_rif: '9', fornitore: 'LATTERIA SRL', data_fattura: '2026-09-01', totale: 10, prima_riga: null, cessionario_piva: null }])
    const e = await importaFattureXml(db.supabase, {
      orgId: 'org', files: [fileXml(9, ...BETA), fileXml(1, ...BETA)],
      societa: { mappa: {}, sedi: SEDI, ripiego: null },
      chiediSedi: async () => null,
    })
    expect(e.annullato).toBe(true)
    expect(db.log.insert).toEqual([])
    expect(db.log.update).toEqual([])
    expect(fraseEsitoXml(e)).toBe('Caricamento annullato: non ho scritto niente.')
  })

  it('la fattura già in archivio si completa con la P.IVA, ma NON cambia sede da sola', async () => {
    const db = fintoDb([{ id: 'vecchia', numero_rif: '9', fornitore: 'LATTERIA SRL', data_fattura: '2026-09-01', totale: 10, prima_riga: null, cessionario_piva: null, sede_id: 's-carlina' }])
    const e = await importaFattureXml(db.supabase, {
      orgId: 'org', files: [fileXml(9, ...BETA)],
      societa: { mappa: MAPPA, sedi: SEDI, ripiego: null },
    })
    expect(e.completate).toBe(1)
    expect(e.nuove).toBe(0)
    const up = db.log.update.find(u => u.tabella === 'fatture')
    expect(up.patch.cessionario_piva).toBe(BETA[0])
    expect(up.patch).not.toHaveProperty('sede_id')
    expect(up.patch).not.toHaveProperty('sedi_condivise')
  })

  it('una sede sola in azienda: nessuna domanda, tutto lì, anche una società nuova', async () => {
    const db = fintoDb()
    const e = await importaFattureXml(db.supabase, {
      orgId: 'org', files: [fileXml(1, ...BETA), fileXml(2, null)],
      societa: { mappa: {}, sedi: [SEDI[0]], ripiego: null },
      chiediSedi: async () => { throw new Error('non doveva chiedere') },
    })
    expect(e.nuove).toBe(2)
    expect(db.log.insert.every(r => r.sede_id === 's-carlina' && !r.sedi_condivise)).toBe(true)
  })

  it('senza P.IVA di chi riceve: la sede attiva, come faceva Integrazioni', async () => {
    const db = fintoDb()
    await importaFattureXml(db.supabase, {
      orgId: 'org', files: [fileXml(1, null), fileXml(2, ...ALFA)],
      societa: { mappa: MAPPA, sedi: SEDI, ripiego: ['s-berthollet'] },
      chiediSedi: async () => { throw new Error('non doveva chiedere') },
    })
    expect(db.log.insert.find(r => r.numero_rif === '1').sede_id).toBe('s-berthollet')
    expect(db.log.insert.find(r => r.numero_rif === '2').sede_id).toBe('s-carlina')
  })

  it('se la scelta non si riesce a ricordare, le fatture entrano lo stesso e lo si dice', async () => {
    const db = fintoDb()
    const e = await importaFattureXml(db.supabase, {
      orgId: 'org', files: [fileXml(1, ...BETA)],
      societa: { mappa: {}, sedi: SEDI, ripiego: null },
      chiediSedi: async () => ({ [BETA[0]]: ['s-degasperi'] }),
      ricordaSocieta: async () => { throw new Error('rete caduta') },
    })
    expect(e.nuove).toBe(1)
    expect(db.log.insert[0].sede_id).toBe('s-degasperi')
    expect(avvisiEsitoXml(e)[0]).toMatch(/Non sono riuscito a ricordare .*BETA SRL.*rete caduta/)
  })

  it('una risposta senza sedi per una società non scrive niente', async () => {
    const db = fintoDb()
    const e = await importaFattureXml(db.supabase, {
      orgId: 'org', files: [fileXml(1, ...BETA)],
      societa: { mappa: {}, sedi: SEDI, ripiego: null },
      chiediSedi: async () => ({ [BETA[0]]: [] }),
    })
    expect(e.annullato).toBe(true)
    expect(db.log.insert).toEqual([])
  })

  it('senza `societa`, come prima: tutte verso la sede passata', async () => {
    const db = fintoDb()
    await importaFattureXml(db.supabase, { orgId: 'org', sedeId: 's-carlina', files: [fileXml(1, ...BETA), fileXml(2, ...ALFA)] })
    expect(db.log.insert.every(r => r.sede_id === 's-carlina')).toBe(true)
  })
})

describe('domandeDaGruppi', () => {
  it('il gruppo senza P.IVA ha la chiave vuota e niente date se mancano', () => {
    expect(domandeDaGruppi([{ piva: null, nome: '', records: [{}, {}] }]))
      .toEqual([{ chiave: '', piva: null, nome: '', n: 2, dal: null, al: null }])
  })
})
