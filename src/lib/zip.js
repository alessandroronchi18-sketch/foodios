// Leggere uno ZIP, senza aggiungere una libreria.
//
// Serve per una strada precisa: dal portale dell'Agenzia delle Entrate
// (Fatture e Corrispettivi → Consultazione → download massivi) le fatture
// ricevute si scaricano **in un archivio ZIP di file XML**. È il modo con cui
// un titolare può portarsi via, da solo e con lo SPID, tutte le fatture dei
// suoi fornitori — con dentro il dettaglio riga, gli IBAN e le scadenze, cioè
// tutto quello che l'export Excel del portale del commercialista non dà.
//
// Fino al 15/09/2026 Foodos sapeva leggere un XML alla volta, anche tanti
// insieme, ma **non uno ZIP**: in tutto il progetto non c'era nessuna libreria
// di decompressione, e nessun campo accettava `.zip`. Il tappo era lì.
//
// Perché scritto a mano e non con una libreria: lo ZIP è un formato semplice e
// il pezzo difficile — sgonfiare i dati compressi — il browser lo sa già fare
// con `DecompressionStream`, che c'è ovunque dal 2023. Una dipendenza in più
// significa un CDN in più da cui dipendere (e la nostra CSP ne ammette uno
// solo), oppure un pacchetto in più da tenere aggiornato. Per ottanta righe
// non vale.
//
// Cosa NON fa, dichiarato: niente archivi cifrati con password, niente ZIP64
// (sopra i 4 GB o 65.535 file), niente metodi di compressione diversi da
// "nessuno" e "deflate". Sono i limiti giusti: lo ZIP dell'Agenzia sta dentro
// tutti e tre.

const FIRMA_FINE_DIRECTORY = 0x06054b50
const FIRMA_VOCE_DIRECTORY = 0x02014b50
const METODO_NESSUNO = 0
const METODO_DEFLATE = 8

/** Trova la coda dell'archivio, che sta in fondo e può avere un commento dopo. */
function trovaFineDirectory(vista) {
  // Il commento finale può essere lungo fino a 65.535 byte: si cerca a ritroso.
  const minimo = Math.max(0, vista.byteLength - 22 - 0xffff)
  for (let i = vista.byteLength - 22; i >= minimo; i--) {
    if (vista.getUint32(i, true) === FIRMA_FINE_DIRECTORY) return i
  }
  return -1
}

async function sgonfia(bytes) {
  // `deflate-raw` è il deflate senza intestazione zlib: è quello che usa lo ZIP.
  const flusso = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flusso).arrayBuffer())
}

/**
 * Estrae i file da un archivio ZIP.
 *
 * @param {ArrayBuffer|Uint8Array} dati
 * @param {{ soloEstensioni?: string[], maxFile?: number }} opzioni
 * @returns {Promise<Array<{ nome: string, bytes: Uint8Array }>>}
 */
export async function estraiZip(dati, opzioni = {}) {
  const buffer = dati instanceof Uint8Array ? dati.buffer : dati
  const bytes = new Uint8Array(buffer)
  const vista = new DataView(buffer)

  if (bytes.byteLength < 22) throw new Error('Questo file è troppo piccolo per essere un archivio ZIP.')
  const fine = trovaFineDirectory(vista)
  if (fine < 0) throw new Error("Non riesco ad aprire questo archivio: non sembra uno ZIP.")

  const nVoci = vista.getUint16(fine + 10, true)
  let posizione = vista.getUint32(fine + 16, true)
  if (nVoci === 0xffff || posizione === 0xffffffff) {
    throw new Error('Questo archivio è in formato ZIP64: è troppo grande. Scaricalo diviso in più parti.')
  }

  const estensioni = (opzioni.soloEstensioni || []).map(e => e.toLowerCase())
  const maxFile = opzioni.maxFile || 2000
  const fuori = []

  for (let i = 0; i < nVoci; i++) {
    if (vista.getUint32(posizione, true) !== FIRMA_VOCE_DIRECTORY) break
    const metodo      = vista.getUint16(posizione + 10, true)
    const compressi   = vista.getUint32(posizione + 20, true)
    const lunNome     = vista.getUint16(posizione + 28, true)
    const lunExtra    = vista.getUint16(posizione + 30, true)
    const lunCommento = vista.getUint16(posizione + 32, true)
    const offsetLocale = vista.getUint32(posizione + 42, true)
    const flag        = vista.getUint16(posizione + 8, true)
    const nome = new TextDecoder(flag & 0x800 ? 'utf-8' : 'utf-8')
      .decode(bytes.subarray(posizione + 46, posizione + 46 + lunNome))
    posizione += 46 + lunNome + lunExtra + lunCommento

    // Le cartelle finiscono con "/" e non hanno contenuto.
    if (nome.endsWith('/')) continue
    // Nome del file senza il percorso: dentro gli archivi dell'Agenzia i file
    // stanno in una cartella, e a noi serve solo come si chiamano.
    const base = nome.split('/').pop()
    if (!base || base.startsWith('.')) continue
    if (estensioni.length && !estensioni.some(e => base.toLowerCase().endsWith(e))) continue
    if (fuori.length >= maxFile) break
    if (flag & 0x0001) throw new Error('Questo archivio è protetto da password: non riesco ad aprirlo.')

    // Il nome e il campo extra dell'intestazione locale possono essere diversi
    // da quelli della directory: si rileggono da lì, altrimenti i dati si
    // prendono dal punto sbagliato.
    const lunNomeLocale  = vista.getUint16(offsetLocale + 26, true)
    const lunExtraLocale = vista.getUint16(offsetLocale + 28, true)
    const inizioDati = offsetLocale + 30 + lunNomeLocale + lunExtraLocale
    const grezzi = bytes.subarray(inizioDati, inizioDati + compressi)

    if (metodo === METODO_NESSUNO) fuori.push({ nome: base, bytes: grezzi.slice() })
    else if (metodo === METODO_DEFLATE) fuori.push({ nome: base, bytes: await sgonfia(grezzi) })
    // Ogni altro metodo (bzip2, lzma…) non si incontra negli archivi
    // dell'Agenzia: si salta il file invece di far fallire tutto l'archivio.
  }

  return fuori
}

/** Comodo: estrae e restituisce i file come testo. */
export async function estraiZipTesto(dati, opzioni = {}) {
  const file = await estraiZip(dati, opzioni)
  const dec = new TextDecoder('utf-8')
  return file.map(f => ({ nome: f.nome, testo: dec.decode(f.bytes) }))
}

/** True se il file comincia con la firma di un archivio ZIP ("PK\x03\x04"). */
export function sembraZip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}
