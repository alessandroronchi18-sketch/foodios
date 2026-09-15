// Aprire uno ZIP di fatture: era il tappo della strada migliore.
//
// Dal portale dell'Agenzia delle Entrate le fatture ricevute si scaricano in
// un archivio ZIP di XML. È il modo con cui un titolare si porta via da solo,
// con lo SPID, tutte le fatture dei fornitori — col dettaglio riga, gli IBAN e
// le scadenze, cioè quello che l'export Excel del portale del commercialista
// non dà. Foodos sapeva leggere gli XML singoli, anche molti insieme, ma non
// un archivio: in tutto il progetto non c'era nessuna libreria per aprirli.

import { describe, it, expect } from 'vitest'
import { estraiZip, estraiZipTesto, sembraZip } from '../../src/lib/zip.js'

// Costruisce un vero archivio ZIP (metodo "nessuna compressione"), così il
// test legge un file nel formato vero e non una finta.
function creaZip(file) {
  const enc = new TextEncoder()
  const voci = file.map(f => ({ nome: enc.encode(f.nome), dati: enc.encode(f.contenuto) }))
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
  const lunDir = offset - inizioDir
  for (const p of [u32(0x06054b50), u16(0), u16(0), u16(voci.length), u16(voci.length),
    u32(lunDir), u32(inizioDir), u16(0)]) pezzi.push(p)

  const totale = pezzi.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(totale)
  let i = 0
  for (const p of pezzi) { out.set(p, i); i += p.length }
  return out
}

describe('estrarre i file da un archivio', () => {
  const zip = creaZip([
    { nome: 'IT01234567890_00001.xml', contenuto: '<FatturaElettronica>uno</FatturaElettronica>' },
    { nome: 'IT01234567890_00002.xml', contenuto: '<FatturaElettronica>due</FatturaElettronica>' },
    { nome: 'lettura/note.txt', contenuto: 'non è una fattura' },
  ])

  it('riconosce un archivio dalla sua firma', () => {
    expect(sembraZip(zip)).toBe(true)
    expect(sembraZip(new TextEncoder().encode('<xml/>'))).toBe(false)
  })

  it('tira fuori tutti i file', async () => {
    const f = await estraiZip(zip)
    expect(f.map(x => x.nome)).toEqual(['IT01234567890_00001.xml', 'IT01234567890_00002.xml', 'note.txt'])
  })

  it('sa filtrare per estensione: dall\'Agenzia servono solo gli XML', async () => {
    const f = await estraiZipTesto(zip, { soloEstensioni: ['.xml'] })
    expect(f).toHaveLength(2)
    expect(f[0].testo).toContain('uno')
    expect(f[1].testo).toContain('due')
  })

  it('toglie il percorso e tiene solo il nome del file', async () => {
    // Negli archivi dell'Agenzia i file stanno dentro una cartella.
    const f = await estraiZip(zip)
    expect(f.some(x => x.nome.includes('/'))).toBe(false)
  })

  it('rispetta un tetto al numero di file', async () => {
    expect(await estraiZip(zip, { maxFile: 1 })).toHaveLength(1)
  })
})

describe('quando non è un archivio, lo dice', () => {
  it('un file qualunque', async () => {
    await expect(estraiZip(new TextEncoder().encode('questo è un XML, non uno zip'.repeat(3))))
      .rejects.toThrow(/non sembra uno ZIP/)
  })

  it('un file troppo corto', async () => {
    await expect(estraiZip(new Uint8Array(4))).rejects.toThrow(/troppo piccolo/)
  })
})
