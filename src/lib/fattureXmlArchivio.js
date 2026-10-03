// ── Tutte le fatture dentro un file: ZIP, XML o P7M ─────────────────────
//
// Lo ZIP del «download massivo» dell'Agenzia delle Entrate non contiene solo
// fatture. Per ognuna c'è anche un file di **metadati** (`…_metaDato.xml`),
// molte fatture sono **firmate** (`.xml.p7m`), e a volte nell'archivio ci sono
// ricevute dello SDI o un altro ZIP.
//
// Prima di oggi l'archivio si apriva prendendo solo i `.xml`: le fatture
// firmate restavano fuori senza che nessuno lo dicesse, e i metadati finivano
// contati come «file che non ho saputo leggere» — un allarme falso per ogni
// fattura vera. Qui ogni file viene riconosciuto per quello che è.
import { parseFatturaXML, estraiXmlDaP7m } from './parseFatturaXML'
import { estraiZip, sembraZip } from './zip'

const PROFONDITA_MAX = 3
export const MAX_FILE_ARCHIVIO = 30000

/** Che cosa c'è in un testo XML: una fattura, dei metadati, o altro. */
function tipoXml(testo) {
  if (/<([A-Za-z0-9_]+:)?FatturaElettronica[\s>]/.test(testo)) return 'fattura'
  if (/<([A-Za-z0-9_]+:)?FileMetadati[\s>]|metaDato/i.test(testo.slice(0, 2000))) return 'metadati'
  // Ricevute e notifiche dello SDI (consegna, scarto, esito…).
  if (/<([A-Za-z0-9_]+:)?(RicevutaConsegna|NotificaScarto|NotificaEsito|NotificaMancataConsegna|MetadatiInvioFile|AttestazioneTrasmissioneFattura)[\s>]/.test(testo)) return 'ricevuta'
  return 'ignoto'
}

/**
 * Legge un file e tira fuori tutte le fatture che contiene.
 *
 * @param {string} nome
 * @param {Uint8Array} bytes
 * @returns {Promise<{ records: object[], fatture: number, saltati: number, illeggibili: string[] }>}
 *   `fatture`: documenti fattura trovati · `saltati`: metadati e ricevute
 *   (normali in un archivio dell'Agenzia, non sono un errore) ·
 *   `illeggibili`: nomi dei file che sembravano fatture e non si aprono ·
 *   `troncato`: l'archivio aveva più file di quanti se ne leggono in una volta.
 */
export async function leggiFattureDaFile(nome, bytes) {
  const esito = { records: [], fatture: 0, saltati: 0, illeggibili: [], troncato: false }
  await leggi(nome, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), esito, 0)
  return esito
}

async function leggi(nome, bytes, esito, profondita) {
  if (sembraZip(bytes)) {
    if (profondita >= PROFONDITA_MAX) { esito.illeggibili.push(nome); return }
    // Il tetto dell'estrattore era 2.000 file, e si fermava lì **senza dirlo**:
    // un anno di fatture dell'Agenzia sono già circa 2.000 file (ognuna col
    // suo file di metadati), tre anni circa 6.000. Qui il tetto è alto e, se
    // lo si tocca, si dice.
    const dentro = await estraiZip(bytes.byteOffset ? bytes.slice() : bytes, { maxFile: MAX_FILE_ARCHIVIO })
    if (dentro.length >= MAX_FILE_ARCHIVIO) esito.troncato = true
    for (const f of dentro) await leggi(f.nome, f.bytes, esito, profondita + 1)
    return
  }

  let testo
  if (/\.p7m$/i.test(nome)) {
    testo = estraiXmlDaP7m(bytes)
    if (!testo) { esito.illeggibili.push(nome); return }
  } else if (/\.xml$/i.test(nome) || profondita === 0) {
    testo = new TextDecoder('utf-8').decode(bytes)
  } else {
    // Dentro un archivio: PDF di cortesia, fogli di stile, indici. Non sono
    // fatture e non sono errori.
    esito.saltati++
    return
  }

  const tipo = tipoXml(testo)
  if (tipo === 'metadati' || tipo === 'ricevuta') { esito.saltati++; return }
  if (tipo !== 'fattura') { esito.illeggibili.push(nome); return }
  try {
    const records = parseFatturaXML(testo)
    esito.records.push(...records)
    esito.fatture += records.length
  } catch {
    esito.illeggibili.push(nome)
  }
}
