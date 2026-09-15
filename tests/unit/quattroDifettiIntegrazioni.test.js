// I quattro difetti trovati leggendo il codice durante l'audit su Webdesk.
//
// Nessuno era nella lista delle cose da fare: sono usciti guardando il codice
// per rispondere a un'altra domanda. Tre su quattro erano promesse scritte e
// mai mantenute.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { estraiXmlDaP7m } from '../../src/lib/parseFatturaXML.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

describe('1. il nome del fornitore di Fattura Smart', () => {
  const UI = leggi('src', 'components', 'Integrazioni.jsx')

  it('non è più attribuito a TeamSystem', () => {
    // Fattura Smart è di Wolters Kluwer: lo dichiara la pagina di accesso di
    // webdesk.it, che avvisa «Le sue credenziali di webdesk/Fattura Smart sono
    // personali» e porta il copyright Wolters Kluwer in fondo. Il cliente con
    // webdesk leggeva "TeamSystem", cercava un programma che non ha, e il
    // percorso di menu indicato non esiste.
    // Si guardano le righe che il cliente legge, non i commenti che
    // raccontano il difetto. E attenzione: "Cassa in Cloud (TeamSystem)" è
    // corretto e deve restare — quella è davvero di TeamSystem.
    const vive = UI.split('\n').filter(r => !r.trim().startsWith('//')).join('\n')
    expect(vive).not.toContain('TeamSystem FatturaSMART')
    expect(vive).not.toContain('In TeamSystem: Contabilità')
    expect(vive).toContain('Fattura Smart (Wolters Kluwer)')
    expect(vive, 'Cassa in Cloud è davvero di TeamSystem').toContain('Cassa cloud TeamSystem')
  })

  it('e la scheda dice cosa quell\'export NON porta dentro', () => {
    expect(UI).toMatch(/ma non il dettaglio delle righe/)
  })
})

describe('2. il dettaglio riga delle fatture non si butta più', () => {
  const PARSER = leggi('src', 'lib', 'parseFatturaXML.js')

  it('si leggono quantità, prezzo unitario, unità e aliquota', () => {
    // Prima si scorreva già DettaglioLinee, ma si tenevano solo le prime tre
    // descrizioni incollate in `note`. Su 3.520 fatture già importate, il
    // dettaglio è passato dal browser ed è finito nel cestino.
    for (const campo of ['NumeroLinea', 'CodiceArticolo CodiceValore', 'Quantita',
                         'UnitaMisura', 'PrezzoUnitario', 'PrezzoTotale', 'AliquotaIVA']) {
      expect(PARSER, `manca ${campo}`).toContain(campo)
    }
    expect(PARSER).toMatch(/righe,\s*\n\s*\}\)/)
  })

  it('e `pickFattura` non le butta via in silenzio', () => {
    // Il passo che si dimentica sempre: il parser le legge, ma se la colonna
    // non è nell'elenco delle colonne sicure viene scartata senza un fiato.
    expect(leggi('src', 'lib', 'fattureImport.js')).toMatch(/'righe',/)
  })

  it('c\'è la colonna dove metterle', () => {
    const { readdirSync } = require('node:fs')
    const DIR = join(RADICE, 'supabase', 'migrations')
    const M = readFileSync(join(DIR, readdirSync(DIR).find(f => f.includes('fatture_righe'))), 'utf8')
    expect(M).toMatch(/add column if not exists righe jsonb/)
    expect(M).toMatch(/using gin \(righe\)/)
  })
})

describe('3. le fatture firmate (.p7m) si aprono davvero', () => {
  it('l\'XML si tira fuori dalla busta binaria', () => {
    // Il .p7m era negli elenchi dei file accettati ma veniva letto come testo:
    // dentro una busta binaria `<FatturaElettronica` non si trova mai in quel
    // modo, quindi falliva sempre. Promesso e mai mantenuto.
    const xml = '<?xml version="1.0"?><p:FatturaElettronica><Prova>ciao</Prova></p:FatturaElettronica>'
    const busta = new Uint8Array([
      ...[0x30, 0x82, 0x0a, 0x1b, 0x06, 0x09, 0x2a],   // inizio busta, binario
      ...new TextEncoder().encode(xml),
      ...[0x00, 0x01, 0xff, 0xfe],                      // coda della firma
    ])
    expect(estraiXmlDaP7m(busta)).toBe(xml)
  })

  it('gli accenti dei fornitori restano giusti', () => {
    // Il ritaglio si fa sui byte grezzi e va riletto come UTF-8, altrimenti
    // "Società" diventa "SocietÃ ".
    const xml = '<FatturaElettronica><Denominazione>Società Agricola Caffè</Denominazione></FatturaElettronica>'
    const busta = new Uint8Array([0x30, 0x82, ...new TextEncoder().encode(xml), 0x00])
    expect(estraiXmlDaP7m(busta)).toContain('Società Agricola Caffè')
  })

  it('e se non c\'è niente dentro lo dice, invece di dare un XML rotto', () => {
    expect(estraiXmlDaP7m(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull()
  })
})

describe('4. il registro non si gonfia di una riga per scontrino', () => {
  const WH = leggi('api', 'webhook-pos.js')

  it('si aggiorna la riga del giorno invece di aprirne una nuova', () => {
    // Una gelateria da 400 scontrini al giorno scriveva 400 righe di registro
    // al giorno — 140.000 l'anno per dire 400 volte la stessa cosa. La pagina
    // ne mostra le ultime dieci.
    expect(WH).toMatch(/async function registraSync/)
    expect(WH).toMatch(/records_importati: \(esistente\.records_importati \|\| 0\) \+ 1/)
    expect(WH).toMatch(/\.gte\('created_at', inizioGiornata\.toISOString\(\)\)/)
  })

  it('ma se il registro non si scrive, lo scontrino entra lo stesso', () => {
    const f = WH.slice(WH.indexOf('async function registraSync'))
    expect(f.slice(0, 1400)).toMatch(/catch \{ \/\* nota, non controllo \*\/ \}/)
  })
})

describe('e lo ZIP dell\'Agenzia, che era il tappo', () => {
  const UI = leggi('src', 'components', 'Integrazioni.jsx')

  it('la scheda accetta gli archivi e spiega dove prenderli', () => {
    expect(UI).toMatch(/tipoFile: '\.zip,\.xml,\.p7m'/)
    expect(UI).toMatch(/Consultazione e download massivi/)
    expect(UI).toMatch(/Entra con SPID/)
  })

  it('un file rotto dentro l\'archivio non fa fallire tutto l\'archivio', () => {
    expect(UI).toMatch(/illeggibili\.push\(f\.nome\)/)
    expect(UI).toMatch(/Gli altri sono entrati/)
  })
})
