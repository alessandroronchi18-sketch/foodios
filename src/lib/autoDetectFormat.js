// Auto-detect invoice file format and parse it
// Returns { formato, dati, errori }
import { parseFatturaXML, parseFatturaSMART } from './parseFatturaXML.js'

export async function autoDetectFormat(file) {
  const name = file.name || ''
  const ext = name.split('.').pop().toLowerCase()

  // XML or P7M (signed XML) — try electronic invoice
  if (ext === 'xml' || ext === 'p7m') {
    let text
    try {
      text = await file.text()
    } catch (e) {
      return { formato: 'sconosciuto', dati: [], errori: ['Impossibile leggere il file: ' + e.message] }
    }

    if (text.includes('<FatturaElettronica')) {
      try {
        const dati = parseFatturaXML(text)
        return { formato: 'fattura_elettronica_xml', dati, errori: [] }
      } catch (e) {
        return { formato: 'fattura_elettronica_xml', dati: [], errori: [e.message] }
      }
    }

    return {
      formato: 'xml_generico',
      dati: [],
      errori: ['File XML non riconosciuto come fattura elettronica italiana (elemento <FatturaElettronica> non trovato)'],
    }
  }

  // Excel — try FatturaSMART (TeamSystem) format
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const dati = await parseFatturaSMART(file)
      return { formato: 'fattura_smart', dati, errori: [] }
    } catch (e) {
      return {
        formato: 'excel_generico',
        dati: [],
        errori: [e.message + ' — assicurati che il file abbia una colonna "Fornitore"'],
      }
    }
  }

  // CSV — routed to Zucchetti parsers separately
  if (ext === 'csv') {
    return {
      formato: 'csv',
      dati: [],
      errori: ['Per file CSV usa i parser Zucchetti nella sezione Integrazioni'],
    }
  }

  return {
    formato: 'sconosciuto',
    dati: [],
    errori: [`Estensione .${ext || '?'} non supportata. Usa .xml per fatture elettroniche SDI o .xlsx per FatturaSMART`],
  }
}
