// Che cosa è, davvero, una riga di bolla.
//
// ── Le bolle vere del design partner, lette il 22/09/2026 ────────────────
//
// Dodici documenti di tre fornitori (Galatea, DESA, La Foglia). Fra le righe
// della merce ce ne sono altre cinque specie, e trattarle tutte come «roba
// comprata» produce un danno diverso per ognuna:
//
//   • **campione** — Galatea 001821/2 del 13/05/2026:
//         XT70249  Pasta Pistacchio Collection 300gr   NR  2  0,001  100%  0,00
//     prezzo unitario un millesimo di euro, sconto 100%, imponibile zero. Se
//     entra, la pasta di pistacchio nel listino passa da 30 €/kg a **zero** e
//     il food cost di tutti i gusti al pistacchio crolla. Decisione del
//     titolare, 22/09/2026: «saltala dicendolo».
//
//   • **omaggio** — stessa bolla:
//         60600  POLPA DI MANGO KG.3,1x4  KG  3,1  6,000  Omaggio  18,60
//     la merce è arrivata davvero (3,1 kg da caricare) e il prezzo vero si
//     sa: 6,00 €/kg. In fondo al documento «Totale Omaggi 18,60 €» e «Totale
//     da pagare 5.486,46» invece di 5.505,06. Decisione del titolare: «metti
//     il valore vero» — perché un ingrediente che *sembra* gratis fa sembrare
//     redditizia una ricetta che non lo è.
//
//   • **reso** — DESA stampa in fondo a ogni bolla la legenda:
//         (V)=Vendita (M)=Sconto in merce (O)=Omaggio (I)=Omaggio Riv. Iva
//         (R)=Reso (N)=Reso Inv.
//     e la colonna «T» su ogni riga. Un reso letto come un acquisto viene
//     **caricato** invece che scaricato: la giacenza sbaglia del doppio della
//     quantità resa. Decisione del titolare: fai come sembra opportuno — qui
//     si scarica la merce e **non si tocca il prezzo di listino**, perché un
//     documento che va nell'altro verso non è una trattativa sul prezzo.
//
//   • **servizio** — La Foglia mette su ogni consegna:
//         1 TRASPORTO   NR   1   3,00   22   3,00
//     non è merce e in magazzino non ci va, ma è un costo vero e ricorrente.
//     Decisione del titolare: «contalo da qualche parte». Resta dentro il
//     totale della fattura (che è già un costo nel P&L) e qui si dichiara a
//     parte, così si vede quanto pesa.
//
//   • **rumore** — la parte più insidiosa, perché *sembra* merce:
//         OFFERTA FINO AD ESAURIMENTO
//         PROSC.CRUDO ANTICA PIEVE(7208) A 8,98 EURO AL KG        (DESA)
//     ha un codice fra parentesi e un prezzo al chilo. E poi i muri di testo
//     legale dentro la colonna descrizione: «Assolve gli obblighi di cui
//     all'art.62…», «NON SI ACCETTANO RECLAMI…», l'IBAN, gli orari di scarico.
//
// Qui non si salva e non si decide niente da soli: si **dice che cos'è** ogni
// riga, e chi chiama mostra tutto a schermo prima di scrivere.
import { eRigaDiTotale } from './righeDiTotale'

export const TIPO = {
  MERCE: 'merce',
  CAMPIONE: 'campione',
  OMAGGIO: 'omaggio',
  RESO: 'reso',
  SERVIZIO: 'servizio',
  RUMORE: 'rumore',
}

const norm = (v) => String(v ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

/** Un numero scritto all'italiana o all'inglese, o null se non è un numero. */
function num(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v).trim().replace(/[€\s]/g, '')
  if (!t) return null
  // «1.234,50» → 1234.50 ; «1234.50» resta com'è ; «15,43» → 15.43
  const it = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t)
  const n = Number(it ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Le parole che, nella colonna dello sconto o nella descrizione, dicono che
// quella merce non è stata pagata. «Omaggio» lo scrive Galatea per esteso.
const PAROLE_OMAGGIO = ['omaggio', 'in omaggio', 'gratis', 'free', 'gratuito']
const PAROLE_CAMPIONE = ['campione', 'campioni', 'sample', 'samples', 'assaggio', 'degustazione', 'prova gratuita']
const PAROLE_RESO = ['reso', 'resi', 'resa merce', 'restituzione', 'nota di credito', 'accredito']

// I servizi: non sono merce, ma sono soldi che escono.
const PAROLE_SERVIZIO = [
  'trasporto', 'trasporti', 'spese di trasporto', 'spese trasporto', 'spedizione',
  'spese di spedizione', 'porto', 'contributo conai', 'conai', 'imballaggio',
  'imballo', 'cauzione', 'cauzioni', 'bolli', 'imposta di bollo', 'diritti fissi',
  'spese incasso', 'spese di incasso', 'costi accessori',
]

// Il rumore: testo che finisce nella colonna della descrizione ma non è una
// riga di documento. Tutte frasi lette sulle bolle vere del 22/09/2026.
const FRASI_RUMORE = [
  'assolve gli obblighi', 'non si accettano reclami', 'in ottemperanza al reg',
  'per la tracciabilita', 'contenuti nel presente documento', 'categoria :',
  'ove non indicato', 'coordinate bancarie', 'prendere visione',
  'vogliate aggiornare', 'orario di scarico', 'consegna solo di',
  'scarico all\'interno', 'consegna tassativa', 'consegna richiesta',
  'fino ad esaurimento', 'legenda', 'condizioni di vendita', 'il presente documento',
  'contributo ambientale', 'imballaggio a perdere', 'ministero industria',
  'il pagamento e dimostrato', 'dichiaro di aver ricevuto', 'firma del destinatario',
  'aspetto esteriore', 'causale trasporto', 'tipo di pagamento', 'saldo precedente',
  'privacy policy', 'verifica idoneita', 'riserva per',
]

/** Un IBAN italiano dentro il testo: è una coordinata bancaria, non merce. */
const IBAN = /\bit\d{2}[a-z]\d{10}[0-9a-z]{12}\b/i

/**
 * Che riga è, e cosa deve farne il magazzino.
 *
 * @param {object} riga  come la legge la foto: `{nome, descrizione, quantita,
 *   unita, prezzoUnitario, imponibile, scontoPct, scontoTesto, tipoRiga, aliquotaIva}`
 * @returns {{tipo: string, motivo: string, caricaMagazzino: boolean,
 *            segno: 1|-1, applicaPrezzo: boolean, avviso: string|null}}
 */
export function classificaRiga(riga = {}) {
  const testo = norm(`${riga?.nome || ''} ${riga?.descrizione || ''}`)
  const sconto = norm(riga?.scontoTesto)
  const t = norm(riga?.tipoRiga)
  const q = num(riga?.quantita)
  const unit = num(riga?.prezzoUnitario)
  const imp = num(riga?.imponibile)
  const pct = num(riga?.scontoPct)

  const dice = (elenco, dove) => elenco.some(p => dove === p || dove.includes(p))

  // ── Rumore: si toglie per primo, se no una frase promozionale con dentro
  //    un prezzo al chilo diventa una materia prima nuova.
  if (!testo) {
    return esito(TIPO.RUMORE, 'riga senza descrizione', { avviso: null })
  }
  if (IBAN.test(testo) || dice(FRASI_RUMORE, testo) || FRASI_RUMORE.some(f => testo.startsWith(f))) {
    return esito(TIPO.RUMORE, 'testo del documento, non merce', { avviso: null })
  }
  if (eRigaDiTotale(riga?.nome) || eRigaDiTotale(riga?.descrizione)) {
    return esito(TIPO.RUMORE, 'riga di totale', { avviso: null })
  }
  // Niente quantità **e** niente importo: non è una riga, è una nota.
  if ((q == null || q === 0) && imp == null && unit == null) {
    return esito(TIPO.RUMORE, 'nessun numero su questa riga', { avviso: null })
  }

  // ── Reso: la colonna T di DESA, o la parola scritta.
  if (t === 'r' || t === 'n' || dice(PAROLE_RESO, testo)) {
    return esito(TIPO.RESO, 'merce che torna indietro', {
      caricaMagazzino: true, segno: -1, applicaPrezzo: false,
      avviso: 'è un reso: la merce si scarica dal magazzino e il prezzo di listino non si tocca',
    })
  }

  // ── Servizio: trasporto, imballo, bolli.
  if (dice(PAROLE_SERVIZIO, testo)) {
    return esito(TIPO.SERVIZIO, 'servizio, non merce', {
      avviso: 'non è merce: non entra in magazzino, ma resta un costo nel totale del documento',
    })
  }

  // ── Campione: sconto pieno, o prezzo simbolico con importo zero.
  //    Il millesimo di euro è il numero che i gestionali mettono quando un
  //    prezzo non c'è: se entra nel listino non si nota più.
  const scontoPieno = pct != null && pct >= 99.5
  const prezzoSimbolico = unit != null && unit > 0 && unit <= 0.01
  const importoZero = imp != null && Math.abs(imp) < 0.005
  if (dice(PAROLE_CAMPIONE, testo) || dice(PAROLE_CAMPIONE, sconto)
      || (scontoPieno && (importoZero || prezzoSimbolico))
      || (prezzoSimbolico && importoZero)) {
    return esito(TIPO.CAMPIONE, 'campione: arrivato per farlo provare', {
      avviso: 'è un campione: non entra né in magazzino né nel listino. Se lo usi davvero, aggiungilo a mano',
    })
  }

  // ── Omaggio: merce arrivata davvero, non pagata, col prezzo vero scritto.
  if (t === 'o' || t === 'i' || t === 'm'
      || dice(PAROLE_OMAGGIO, sconto) || dice(PAROLE_OMAGGIO, testo)) {
    return esito(TIPO.OMAGGIO, 'merce in omaggio', {
      caricaMagazzino: true, applicaPrezzo: true,
      avviso: 'è un omaggio: la merce entra in magazzino e il prezzo resta quello vero di listino, non zero',
    })
  }

  return esito(TIPO.MERCE, 'merce comprata', {})
}

function esito(tipo, motivo, { caricaMagazzino, segno, applicaPrezzo, avviso } = {}) {
  const merce = tipo === TIPO.MERCE
  return {
    tipo,
    motivo,
    caricaMagazzino: caricaMagazzino != null ? caricaMagazzino : merce,
    segno: segno || 1,
    applicaPrezzo: applicaPrezzo != null ? applicaPrezzo : merce,
    avviso: avviso !== undefined ? avviso : null,
  }
}
