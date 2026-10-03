// ── I costi del mese, dalle fatture dei fornitori ───────────────────────
//
// 03/10/2026. Il titolare: la domanda numero uno è «quanto guadagno e
// perché». Il conto economico di Mara dei Boschi diceva utile all'82% dei
// ricavi perché le 3.104 fatture fornitori non entravano MAI nel conto: a
// luglio 175.161 € di fatture, a schermo 0 € di affitto, utenze e servizi.
// Questo file è il motore che le porta dentro. Logica pura, senza database:
// le letture e le scritture stanno in `contoEconomicoArchivio.js`.
//
// Tre fatti dei dati veri, che decidono come è fatto:
//
//   1. **L'imponibile quasi sempre non c'è.** Dall'Excel di WebDesk arriva
//      solo il totale IVA compresa: 3.042 fatture su 3.104 hanno imponibile 0.
//      Lo ZIP dell'Agenzia lo completerà (`completaFatture.patchDaXml`). Fino
//      ad allora quelle fatture entrano col totale **IVA compresa, e lo si
//      dice** (`importoIvaCompresa`): un'aliquota non si inventa mai, perché
//      nella stessa fattura di una gelateria convivono il 4, il 10 e il 22%.
//   2. **Nessun fornitore ha la categoria.** Le fatture di un fornitore senza
//      voce finiscono in `daClassificare`, mai in una voce scelta a caso. La
//      schermata «Di che cosa sono queste spese?» propone la voce
//      (`suggerisciCategoria`) e il titolare conferma.
//   3. **Una fattura può essere eccezionale.** A luglio 2026 una sola fattura
//      GECKO vale 86.651 €, contro i 3.200 € delle altre dello stesso
//      fornitore: probabilmente un investimento. Un investimento non pesa su
//      un mese solo, quindi sta fuori dal conto del mese (`investimenti`), e
//      `fattureEccezionali` le indica perché il titolare decida.
//
// ── API (stabile: la usano «Il mese» e il Conto economico) ──────────────
//
//   CATEGORIE_SPESA        [{ id, nome, tipo: 'costo'|'investimento'|'escluso', descrizione }]
//   ID_CATEGORIE           { MATERIE_PRIME: 'materie-prime', … }
//   categoriaPerId(id)     → categoria | null
//   categoriaDaEtichetta(testo) → id | null
//                          accetta l'id, il nome («Materie prime») e le vecchie
//                          etichette di prodotto della pagina Fornitori
//                          («Latticini» → materie-prime).
//   chiaveFornitore(nome)  → il nome normalizzato (stessa regola di
//                          `completaFatture.normFornitore`)
//
//   suggerisciCategoria(nomeFornitore, descrizioniRighe?)
//     → null | { categoria, motivo, fonte: 'nome'|'righe', certezza: 'alta'|'media' }
//     `descrizioniRighe`: stringhe, oppure { descrizione, totale }.
//
//   importoSenzaIva(fattura)
//     → { importo: number|null, fonte: 'imponibile'|'totale_meno_imposta'|'righe'|'zero'|null, motivo }
//     Con il segno: una nota di credito è negativa.
//
//   costiPerMese(fatture, { mese: 'AAAA-MM', categoriePerFornitore, sedeId = null, sedi = [], produzionePerSede })
//   costiPerPeriodo(fatture, { dal, al, …stesse opzioni })
//     → {
//         mese,                       // 'AAAA-MM' (null per costiPerPeriodo)
//         periodo: { dal, al },
//         perCategoria: [{ id, nome, tipo: 'costo', importo, nFatture, nSenzaImponibile,
//                          importoIvaCompresa, fornitori: [{ chiave, nome, importo, nFatture }] }],
//         totaleCosti,                // somma di perCategoria, SENZA daClassificare
//         totaleCostiEDaClassificare,
//         investimenti: { importo, nFatture, nSenzaImponibile, importoIvaCompresa,
//                         fatture: [{ id, fornitore, numero, data, importo }] },
//         daClassificare: { importo, nFornitori, nFatture, nSenzaImponibile, importoIvaCompresa, fornitori },
//         esclusi: { importo, nFatture },
//         noteDiCredito: { importo, nFatture },   // negativo, GIÀ sottratto dentro le voci
//         ripartizione: null | { sedeId, criterio, certa, importoRipartito, nFatture,
//                                senzaSede: { importo, nFatture } },
//         copertura: { nFatture, nSenzaImponibile, importoIvaCompresa, nSenzaCategoria,
//                      importoSenzaCategoria, ultimaFattura, ultimaFatturaDelMese, nSenzaData },
//       }
//
//   causeVariazione(attuale, confronto, { maxFornitori = 3 })
//     → { differenza, voci: [{ id, nome, attuale, confronto, differenza, ivaMista,
//                              fornitori: [{ chiave, nome, attuale, confronto, differenza }] }],
//         investimenti: { attuale, confronto, differenza } }
//   fraseCausa(voce)      → «Materie prime +2.340 €: soprattutto DESA +1.100 €»
//   nomeBreve(nome)       → «GELINOVA GROUP» da «GELINOVA GROUP SRL società unipersonale»
//   fattureEccezionali(fatture, { categoriePerFornitore, dal })
//     → [{ id, fornitore, chiave, numero, data, importo, tipica, volteLaTipica, motivo }]
//
// ── Le regole del conto ─────────────────────────────────────────────────
//
// • **Competenza, non cassa.** Una fattura conta nel mese della sua data
//   (`data_fattura`), non in quello in cui è stata pagata: 909 movimenti di
//   cassa di Mara sono «pagati» tutti il 15/09/2026, ed è l'arretrato di tre
//   anni segnato in blocco.
// • **Le note di credito sottraggono** nella voce del loro fornitore. Una nota
//   di credito è `tipo = 'nota_credito'` OPPURE un totale negativo
//   (`fatture.isNotaCredito`): nel database vero le quattro che ci sono hanno
//   tutte `tipo = 'fattura'` e il totale col meno.
// • **La categoria della fattura vince su quella del fornitore**
//   (`categoria_spesa`, colonna nuova): GECKO resta un fornitore di materie
//   prime, la sua fattura di luglio è un investimento.
// • **Le spese condivise si dividono, e lo si dice.** Con `sedeId`:
//     – una fattura della sede conta per intero;
//     – una fattura con `sedi_condivise` (Berthollet + De Gasperi stanno in
//       un solo account WebDesk) conta per la quota della sede, in
//       proporzione ai chili prodotti nel mese della fattura
//       (`costiCondivisi.quoteDiRipartizione`, la regola scelta dal titolare
//       il 17/09); senza produzione, parti uguali e `certa: false`;
//     – una fattura senza sede e senza sedi condivise è di tutta l'azienda:
//       si divide fra `sedi` con la stessa regola. Se `sedi` non c'è, non si
//       divide e non si conta: finisce in `ripartizione.senzaSede`, perché
//       chi legge sappia che c'è.
//   `produzionePerSede` può essere un oggetto { idSede: kg } o una funzione
//   (mese 'AAAA-MM') → oggetto, per dividere ogni fattura con la produzione
//   del suo mese anche su un periodo lungo. Senza `sedeId` (tutta
//   l'azienda) niente si divide e ogni fattura conta una volta sola.
import { normFornitore } from './completaFatture'
import { isNotaCredito } from './fatture'
import { normPiva } from './societaSedi'
import { quoteDiRipartizione } from './costiCondivisi'
import { euroSegno } from './formatoAnalisi'

// ── Le voci ─────────────────────────────────────────────────────────────

export const ID_CATEGORIE = Object.freeze({
  MATERIE_PRIME: 'materie-prime',
  CONFEZIONAMENTO: 'confezionamento',
  SERVIZI: 'servizi',
  AFFITTO: 'affitto',
  UTENZE: 'utenze',
  MANUTENZIONE: 'manutenzione',
  COMMISSIONI: 'commissioni',
  MARKETING: 'marketing',
  PERSONALE_ESTERNO: 'personale-esterno',
  ALTRO: 'altro',
  ATTREZZATURE: 'attrezzature',
  FUORI_CONTO: 'fuori-conto',
})

const ID = ID_CATEGORIE

/**
 * Le voci di spesa, nell'ordine in cui si leggono in un conto economico: prima
 * quello che si consuma per fare il gelato, poi i locali, poi il resto.
 * `tipo`: `costo` entra nel conto del mese, `investimento` sta a parte (dura
 * anni), `escluso` non entra da nessuna parte (fatture fra le proprie
 * società, doppioni, spese private).
 */
export const CATEGORIE_SPESA = Object.freeze([
  { id: ID.MATERIE_PRIME, nome: 'Materie prime', tipo: 'costo', descrizione: 'latte, panna, zucchero, frutta, cioccolato, semilavorati, caffè, bevande da rivendere' },
  { id: ID.CONFEZIONAMENTO, nome: 'Confezionamento', tipo: 'costo', descrizione: 'coni, cialde, coppette, vaschette, scatole, sacchetti' },
  { id: ID.AFFITTO, nome: 'Affitto e noleggi', tipo: 'costo', descrizione: 'affitto dei locali, spese condominiali, noleggi e leasing' },
  { id: ID.UTENZE, nome: 'Utenze', tipo: 'costo', descrizione: 'luce, gas, acqua, telefono e internet' },
  { id: ID.SERVIZI, nome: 'Servizi', tipo: 'costo', descrizione: 'commercialista, consulenti, avvocato, assicurazioni, software, pulizie, trasporti' },
  { id: ID.MANUTENZIONE, nome: 'Manutenzione', tipo: 'costo', descrizione: 'riparazioni, assistenza alle macchine, ricambi, ferramenta' },
  { id: ID.COMMISSIONI, nome: 'Commissioni', tipo: 'costo', descrizione: 'app di consegna (Glovo, Deliveroo, Just Eat), POS, banca' },
  { id: ID.MARKETING, nome: 'Marketing', tipo: 'costo', descrizione: 'pubblicità, social, stampa di volantini e menù' },
  { id: ID.PERSONALE_ESTERNO, nome: 'Personale esterno', tipo: 'costo', descrizione: 'agenzie, cooperative, collaboratori che fanno fattura' },
  { id: ID.ALTRO, nome: 'Altre spese', tipo: 'costo', descrizione: 'viaggi, pasti, piccoli acquisti: quello che non sta nelle altre voci' },
  { id: ID.ATTREZZATURE, nome: 'Attrezzature e lavori', tipo: 'investimento', descrizione: 'macchinari, arredi, ristrutturazioni: durano anni e non pesano su un mese solo' },
  { id: ID.FUORI_CONTO, nome: 'Fuori conto', tipo: 'escluso', descrizione: 'fatture fra le tue società, doppioni, spese private: non entrano nel conto' },
].map(c => Object.freeze(c)))

const PER_ID = new Map(CATEGORIE_SPESA.map(c => [c.id, c]))

/** La voce, dall'id. `null` se l'id non esiste. */
export function categoriaPerId(id) {
  return PER_ID.get(id) || null
}

const piano = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

// Le etichette di prodotto che la pagina Fornitori propone da sempre
// (`CATEGORIE_SUGG` in Fornitori.jsx). Un fornitore già segnato «Latticini»
// è un fornitore di materie prime: non va richiesto. «Attrezzature» invece
// no: può essere un investimento o una riparazione, e lo decide il titolare.
const ETICHETTE_PRODOTTO = new Map([
  ['farine', ID.MATERIE_PRIME], ['latticini', ID.MATERIE_PRIME], ['frutta', ID.MATERIE_PRIME],
  ['frutta secca', ID.MATERIE_PRIME], ['cioccolato', ID.MATERIE_PRIME], ['zuccheri', ID.MATERIE_PRIME],
  ['uova', ID.MATERIE_PRIME], ['lieviti', ID.MATERIE_PRIME], ['aromi', ID.MATERIE_PRIME],
  ['bevande', ID.MATERIE_PRIME], ['surgelati', ID.MATERIE_PRIME],
  ['imballaggi', ID.CONFEZIONAMENTO], ['pulizia', ID.ALTRO], ['altro', ID.ALTRO],
])

// Le parole che in `fornitori.categoria` vogliono dire due cose. «Attrezzature»
// è l'id della voce degli investimenti, ma è ANCHE un'etichetta di prodotto
// che la pagina Fornitori propone da sempre: un fornitore segnato così prima
// del 03/10 finirebbe negli investimenti e le sue fatture uscirebbero dal
// conto del mese, facendo salire l'utile. Trovato dal test il 03/10/2026.
const AMBIGUE = new Set(['attrezzature'])

const PER_TESTO = new Map()
for (const c of CATEGORIE_SPESA) {
  PER_TESTO.set(piano(c.id), c.id)
  PER_TESTO.set(piano(c.nome), c.id)
}
for (const [k, v] of ETICHETTE_PRODOTTO) if (!PER_TESTO.has(k)) PER_TESTO.set(k, v)
for (const k of AMBIGUE) PER_TESTO.delete(k)

/**
 * Da quello che c'è scritto in `fornitori.categoria` all'id della voce: il
 * nome («Materie prime»), l'id, o una vecchia etichetta di prodotto. `null`
 * se non si riconosce o se è ambigua: un'etichetta che non si capisce non
 * diventa una voce a caso.
 */
export function categoriaDaEtichetta(testo) {
  if (testo == null || testo === '') return null
  return PER_TESTO.get(piano(testo)) || null
}

/** Un id esatto (mappe, `categoria_spesa`), o in subordine un'etichetta. */
const idDa = (v) => (typeof v === 'string' && PER_ID.has(v) ? v : categoriaDaEtichetta(v))

/** La chiave con cui si cerca un fornitore: il nome senza forme societarie. */
export function chiaveFornitore(nome) {
  return normFornitore(nome)
}

// ── Il nome corto, per le frasi ─────────────────────────────────────────

// La forma societaria e quello che viene dopo («sas di Vecchio Enrico & C.»).
// La «&» invece no: «MORE & MACINE» è il nome.
const FORMA_SOCIETARIA = /[\s,]+(?:s\.?\s?r\.?\s?l\.?s?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?s\.?|soc(?:ieta|ietà)?'?\.?|di|d\.i\.|a socio unico|con (?:socio|unico))(?=[\s,.]|$)/i

/** «GELINOVA GROUP SRL società unipersonale» → «GELINOVA GROUP». */
export function nomeBreve(nome) {
  const s = String(nome ?? '').trim()
  if (!s) return ''
  const m = FORMA_SOCIETARIA.exec(' ' + s)
  const corto = m ? (' ' + s).slice(0, m.index).trim() : s
  // Il punto finale resta: «S.I.A.E.» è una sigla, non una frase.
  const pulito = corto.replace(/[\s,;:-]+$/, '').trim()
  return pulito.length >= 2 ? pulito : s
}

// ── Proporre la voce di un fornitore ────────────────────────────────────
//
// Dalle parole del nome e, quando ci sono, dalle righe delle fatture. Mai
// una certezza finta: se il nome non dice niente la risposta è `null`, e il
// titolare sceglie. `certezza: 'alta'` vuol dire che la proposta è pronta
// per la conferma in blocco; `media` la propone ma non la spunta da sola.
//
// Il conservatorismo è voluto: una proposta sbagliata confermata in blocco
// costa più di una casella da riempire. Per lo stesso motivo nessuna regola
// propone «Attrezzature e lavori» con certezza alta: un investimento esce
// dal conto del mese e fa salire l'utile, e quello lo decide solo il
// titolare.

const R = (categoria, certezza, re) => ({ categoria, certezza, re })

// L'ordine conta: la prima che trova vince. Le regole strette (marchi, nomi
// che non lasciano dubbi) vengono prima di quelle larghe.
const REGOLE_NOME = [
  // Viaggi: «Nuovo Trasporto Viaggiatori» non è un corriere. «Italo» da solo
  // no: è anche un nome di persona.
  // E la ricarica dell'auto elettrica non è la luce del negozio, anche se
  // «Enel X Way» comincia con ENEL.
  R(ID.ALTRO, 'alta', /\b(ENEL X WAY|BE CHARGE|TRENITALIA|NUOVO TRASPORTO VIAGGIATORI|HOTEL|OSTELLO|EASYPARK|TELEPASS|AUTOSTRADE|FARMACIA|LIBRERIA|RISTORANTE|TRATTORIA|OSTERIA|PIZZERIA)\b/),
  // Le app di consegna e i pagamenti elettronici.
  R(ID.COMMISSIONI, 'alta', /\b(DELIVEROO|FOODINHO|GLOVO|JUST ?EAT|UBER ?EATS|NUMIA|NEXI|SUMUP|SATISPAY|WORLDLINE|AXEPTA|ZETTLE|PAYPAL|SCALAPAY)\b/),
  R(ID.COMMISSIONI, 'media', /\b(BANCA|BANCO|CREDITO COOPERATIVO)\b/),
  // Energia, acqua, telefono.
  R(ID.UTENZE, 'alta', /\b(ENEL|IREN|A2A|HERA|EDISON|PLENITUDE|SORGENIA|ACEA|SMAT|ITALGAS|ENGIE|ILLUMIA|OCTOPUS|AXPO|DOLOMITI ENERGIA|ENERGIA|FASTWEB|TIM|TELECOM|VODAFONE|WIND ?TRE|ILIAD|ACQUEDOTTO)\b/),
  // Professionisti e servizi.
  R(ID.SERVIZI, 'alta', /\b(COMMERCIALIST\w*|DOTTORI COMMERCIALISTI|NOTA(I|IO|RILE)|AVVOCAT\w*|STUDIO|STP|CONSULEN\w*|PAGHE|TEAMSYSTEM|ZUCCHETTI|ARUBA|SANIFICAZION\w*|PULIZI\w*|DISINFESTAZION\w*|DERATTIZZAZION\w*|TRASLOC\w*|ASSICURAZION\w*|ASSICURATRICE|VIGILANZA|LAVANDERIA|SIAE|S I A E)\b/),
  R(ID.SERVIZI, 'media', /\b(CENTRO SERVIZI|SICUREZZA|SPEDIZION\w*|CORRIER\w*|LOGISTICA|SOFTWARE|INFORMATICA)\b/),
  // I locali e i noleggi.
  R(ID.AFFITTO, 'alta', /\b(IMMOBILIAR\w*|CONDOMINIO|LOCAZION\w*|NOLEGG\w*|LEASING|EUROPCAR|HERTZ|SIXT|UNIRENT)\b/),
  R(ID.AFFITTO, 'media', /\b(COMUNIONE EREDITARIA|AUTORIMESSA|GARAGE)\b/),
  // Riparazioni.
  R(ID.MANUTENZIONE, 'alta', /\b(MANUTENZION\w*|RIPARAZION\w*|RICAMBI|FERRAMENTA|ANTINCENDIO|ESTINTORI|ASSISTENZA TECNICA)\b/),
  R(ID.MANUTENZIONE, 'media', /\b(IDRAULIC\w*|ELETTRICIST\w*|FRIGORIST\w*|REFRIGERAZION\w*)\b/),
  // Pubblicità e stampa.
  R(ID.MARKETING, 'alta', /\b(PUBBLICIT\w*|MARKETING|TIPOGRAFI\w*|PIXARTPRINTING|PRINTING)\b/),
  R(ID.MARKETING, 'media', /\b(GRAFICA|COMUNICAZIONE|CENTROCOPIE|COPISTERIA|FOTOGRAF\w*)\b/),
  // Lavoro da fuori.
  R(ID.PERSONALE_ESTERNO, 'alta', /\b(LAVORO TEMPORANEO|INTERINAL\w*|ADECCO|RANDSTAD|MANPOWER|GI GROUP|OPENJOBMETIS|UMANA)\b/),
  // Coni e contenitori. «CONO» solo come parola: «ICONA» non è un cono.
  R(ID.CONFEZIONAMENTO, 'alta', /\b(CONO|CONI|CIALD\w*|IMBALLAG\w*|PACK\w*|COPPETT\w*|VASCHETT\w*|CONTENITOR\w*|SHOPPER|SACCHETT\w*|CARTOTECNIC\w*|ASTUCC\w*)\b/),
  // Il caffè: ma una ditta «Coffee Tech» ripara le macchine, non vende caffè.
  R(ID.MATERIE_PRIME, 'alta', /\b(TORREFAZION\w*)\b/),
  // Marchi noti di ingredienti per gelateria, pasticceria e caffetteria.
  R(ID.MATERIE_PRIME, 'alta', /\b(AGRIMONTANA|GIUSO|CALLEBAUT|PREGEL|MEC3|FABBRI|BABBI|COMPRITAL|IRCA|ELENKA|LEAGEL|PERNIGOTTI|PARIANI|GIRAUDI|PEYRANO|VENCHI|DOMORI|VALRHONA|SANDALJ|LAVAZZA|ILLY|VERGNANO)\b/),
  // Le parole degli ingredienti.
  R(ID.MATERIE_PRIME, 'alta', /\b(LATTE|LATTERIA|LATTIER\w*|LATTICIN\w*|CASEAR\w*|CASEIFICI\w*|ZUCCHER\w*|FRUTTA|ORTOFRUTT\w*|CIOCCOLAT\w*|CACAO|SEMILAVORAT\w*|MOLINO|MULINO|FARIN\w*|UOVA|AVICOL\w*|AGRICOL\w*|SALUMI|SALUMERIA|AGRISALUMERIA|MACELLERIA|FORMAGG\w*|NOCCIOL\w*|PISTACCH\w*|MIELE|APICOLTUR\w*|CONFETTUR\w*|CANDIT\w*|DROGHERIA|PANIFICI\w*|AZ AGR)\b/),
  R(ID.MATERIE_PRIME, 'media', /\b(METRO ITALIA|DOLCIARI\w*|INGREDIENT\w*|GRANO|ALIMENTAR[EI])\b/),
  // Lavori ai locali: possono essere un investimento, ma anche una
  // riparazione. Si propone, non si spunta.
  R(ID.ATTREZZATURE, 'media', /\b(COSTRUZION\w*|EDIL\w*|ARREDAMENT\w*|ARREDI)\b/),
]

// Caffè e coffee come parola, ma non le ditte che riparano le macchine.
const CAFFE = /\b(CAFFE|COFFEE)\b/
const CAFFE_MACCHINE = /\b(TECH|SERVICE|MACCHIN\w*|ASSISTENZA)\b/

const perRegola = (s) => ' ' + String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' '

function dalNome(nome) {
  const s = perRegola(nome)
  if (!s.trim()) return null
  for (const r of REGOLE_NOME) {
    const m = r.re.exec(s)
    if (m) return { categoria: r.categoria, certezza: r.certezza, parola: m[0].trim() }
  }
  const c = CAFFE.exec(s)
  if (c && !CAFFE_MACCHINE.test(s)) return { categoria: ID.MATERIE_PRIME, certezza: 'alta', parola: c[0].trim() }
  return null
}

// Le righe: le parole dei prodotti, non delle ditte.
const REGOLE_RIGA = [
  R(ID.CONFEZIONAMENTO, 'alta', /\b(CONO|CONI|CIALD\w*|COPPETT\w*|VASCHETT\w*|PALETTIN\w*|CUCCHIAIN\w*|TOVAGLIOL\w*|SACCHETT\w*|SHOPPER|BICCHIER\w*|COPERCH\w*|VASSOI\w*|SCATOL\w*|ETICHETT\w*|POLISTIROL\w*|ASTUCC\w*|VASCHETTE)\b/),
  R(ID.UTENZE, 'alta', /\b(ENERGIA|KWH|SMC|GAS NATURALE|FORNITURA GAS|FORNITURA LUCE|TRAFFICO TELEFONICO|BOLLETTA)\b/),
  R(ID.COMMISSIONI, 'alta', /\b(COMMISSION\w*|SERVIZIO DI CONSEGNA|TRANSATO)\b/),
  R(ID.AFFITTO, 'alta', /\b(AFFITTO|LOCAZION\w*|NOLEGG\w*|CANONE DI LOCAZIONE|SPESE CONDOMINIALI)\b/),
  R(ID.SERVIZI, 'alta', /\b(CONSULENZ\w*|ONORARI\w*|TENUTA CONTABILITA|ELABORAZIONE PAGHE|ELABORAZIONE CEDOLINI|DICHIARAZIONE DEI REDDITI|BILANCIO|PULIZIA|SANIFICAZION\w*|TRASPORTO)\b/),
  R(ID.MANUTENZIONE, 'alta', /\b(MANUTENZION\w*|RIPARAZION\w*|INTERVENTO TECNICO|MANODOPERA|RICAMBI\w*|USCITA TECNICO|DIRITTO DI CHIAMATA)\b/),
  R(ID.MARKETING, 'alta', /\b(PUBBLICIT\w*|VOLANTIN\w*|SPONSOR\w*|INSERZION\w*)\b/),
  R(ID.MATERIE_PRIME, 'alta', /\b(PANNA|LATTE|ZUCCHERO|DESTROSIO|SACCAROSIO|GLUCOSIO|INULINA|FRUTTA|FRAGOL\w*|LIMON\w*|BANAN\w*|NOCCIOL\w*|PISTACCH\w*|MANDORL\w*|CIOCCOLAT\w*|CACAO|COPERTURA|VARIEGAT\w*|UOVA|TUORL\w*|BURRO|FARINA|YOGURT|MASCARPONE|RICOTTA|CAFFE|MIELE|VANIGLI\w*|PASTA DI|PASTA PURA|BASE PER|NEUTRO|STABILIZZANT\w*|LATTE IN POLVERE|ACQUA MINERALE|BIBIT\w*|SUCCO|SUCCHI)\b/),
]

function dallaRiga(testo) {
  const s = perRegola(testo)
  for (const r of REGOLE_RIGA) {
    const m = r.re.exec(s)
    if (m) return { categoria: r.categoria, parola: m[0].trim() }
  }
  return null
}

function dalleRighe(righe) {
  const elenco = (Array.isArray(righe) ? righe : [])
    .map(r => (typeof r === 'string' ? { descrizione: r, totale: null } : { descrizione: r?.descrizione, totale: r?.totale }))
    .filter(r => r.descrizione && String(r.descrizione).trim())
  if (elenco.length === 0) return null
  // Si pesa per importo quando c'è: dieci righe di cucchiaini non valgono
  // una riga di panna da 800 €. Senza importi, una riga vale uno.
  const conImporto = elenco.every(r => Number.isFinite(Number(r.totale)) && r.totale !== null && r.totale !== '')
  const peso = (r) => (conImporto ? Math.abs(Number(r.totale)) : 1)
  const totale = elenco.reduce((s, r) => s + peso(r), 0)
  if (!(totale > 0)) return null
  const perCat = new Map()
  for (const r of elenco) {
    const d = dallaRiga(r.descrizione)
    if (!d) continue
    const x = perCat.get(d.categoria) || { peso: 0, n: 0, parole: [] }
    x.peso += peso(r)
    x.n += 1
    if (x.parole.length < 3 && !x.parole.includes(d.parola)) x.parole.push(d.parola)
    perCat.set(d.categoria, x)
  }
  // Nessuna riga riconosciuta: le righe non dicono niente, né a favore né
  // contro il nome.
  if (perCat.size === 0) return null
  const [categoria, x] = [...perCat.entries()].sort((a, b) => b[1].peso - a[1].peso)[0]
  const quota = x.peso / totale
  return { categoria, quota, n: x.n, nTot: elenco.length, parole: x.parole, conImporto, miste: quota < 0.7 }
}

/**
 * La voce proposta per un fornitore.
 *
 * @param {string} nomeFornitore
 * @param {(string|{descrizione: string, totale?: number})[]} [descrizioniRighe]
 * @returns {null | { categoria: string, motivo: string, fonte: 'nome'|'righe', certezza: 'alta'|'media' }}
 */
export function suggerisciCategoria(nomeFornitore, descrizioniRighe = []) {
  const n = dalNome(nomeFornitore)
  const r = dalleRighe(descrizioniRighe)
  const nomeVoce = (id) => categoriaPerId(id)?.nome.toLowerCase()

  // Le righe dicono cosa si è comprato davvero: quando parlano chiaro
  // vincono sul nome. Cono Artic si chiama «cono», ma se l'80% di quello che
  // fattura è panna, è un fornitore di materie prime.
  if (r && !r.miste && r.categoria) {
    const pct = Math.round(r.quota * 100)
    const quanto = r.conImporto ? `il ${pct}% della spesa nelle righe` : `${r.n} righe su ${r.nTot}`
    return {
      categoria: r.categoria,
      motivo: `${quanto} è ${nomeVoce(r.categoria)} (${r.parole.join(', ')})`,
      fonte: 'righe',
      certezza: r.quota >= 0.85 && r.categoria !== ID.ATTREZZATURE ? 'alta' : 'media',
    }
  }
  if (n) {
    const miste = r && r.miste
    return {
      categoria: n.categoria,
      motivo: `nel nome c'è «${n.parola}»${miste ? ', ma le righe delle fatture non lo confermano' : ''}`,
      fonte: 'nome',
      certezza: miste ? 'media' : n.certezza,
    }
  }
  return null
}

// ── Quanto costa senza IVA ──────────────────────────────────────────────

const numero = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const arrot = (v) => Math.round(v * 100) / 100

/**
 * L'importo della fattura senza IVA, e da dove viene.
 *
 * In ordine: l'imponibile, se c'è; altrimenti il totale meno l'imposta, se
 * l'imposta c'è; altrimenti la somma delle righe, se ogni riga ha la sua
 * aliquota e le righe tornano col totale. Altrimenti `null` con il motivo:
 * non si scorpora mai con un'aliquota supposta.
 *
 * Con il segno: le note di credito sono negative.
 */
export function importoSenzaIva(f) {
  const segno = isNotaCredito(f) ? -1 : 1
  const tot = numero(f?.totale)
  const imp = numero(f?.imponibile)
  const iva = numero(f?.imposta)

  if (imp != null && imp !== 0) return { importo: arrot(segno * Math.abs(imp)), fonte: 'imponibile', motivo: null }

  if (iva != null && iva !== 0 && tot != null && tot !== 0) {
    const netto = Math.abs(tot) - Math.abs(iva)
    if (netto > 0) return { importo: arrot(segno * netto), fonte: 'totale_meno_imposta', motivo: null }
    return { importo: null, fonte: null, motivo: "l'imposta è più grande del totale: il dato è da controllare" }
  }

  const righe = Array.isArray(f?.righe) ? f.righe : []
  if (righe.length) {
    const tutte = righe.every(r => numero(r?.totale) != null && numero(r?.iva_pct) != null)
    if (tutte) {
      const netto = righe.reduce((s, r) => s + Number(r.totale), 0)
      const lordo = righe.reduce((s, r) => s + Number(r.totale) * (1 + Number(r.iva_pct) / 100), 0)
      const tolleranza = Math.max(1, Math.abs(tot || 0) * 0.02)
      if (!tot || Math.abs(Math.abs(lordo) - Math.abs(tot)) <= tolleranza) {
        return { importo: arrot(segno * Math.abs(netto)), fonte: 'righe', motivo: null }
      }
      return { importo: null, fonte: null, motivo: 'le righe non tornano col totale della fattura' }
    }
  }

  if (tot === 0) return { importo: 0, fonte: 'zero', motivo: null }
  if (tot == null) return { importo: null, fonte: null, motivo: 'manca il totale' }
  return { importo: null, fonte: null, motivo: "c'è solo il totale con l'IVA" }
}

/** L'importo lordo, col segno giusto: quello che si usa quando l'IVA non si sa togliere. */
function lordoConSegno(f) {
  const tot = numero(f?.totale) || 0
  return arrot((isNotaCredito(f) ? -1 : 1) * Math.abs(tot))
}

// ── Di che voce è una fattura ───────────────────────────────────────────

function leggiMappa(mappa, chiave) {
  if (!mappa || !chiave) return null
  if (mappa instanceof Map) return mappa.get(chiave) ?? null
  return Object.prototype.hasOwnProperty.call(mappa, chiave) ? mappa[chiave] : null
}

/** L'id della voce di una fattura: la sua, poi quella del fornitore (P.IVA, poi nome). */
export function categoriaDellaFattura(f, categoriePerFornitore) {
  const propria = idDa(f?.categoria_spesa)
  if (propria) return propria
  const piva = f?.piva ? normPiva(f.piva) : ''
  const daPiva = piva ? idDa(leggiMappa(categoriePerFornitore, 'piva:' + piva)) : null
  if (daPiva) return daPiva
  return idDa(leggiMappa(categoriePerFornitore, chiaveFornitore(f?.fornitore)))
}

// ── Le date ─────────────────────────────────────────────────────────────

const giorno = (d) => {
  const s = String(d ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function limitiMese(mese) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mese ?? ''))
  if (!m) throw new Error(`mese non valido: «${mese}» (serve AAAA-MM)`)
  const ultimo = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
  return { dal: `${mese}-01`, al: `${mese}-${String(ultimo).padStart(2, '0')}` }
}

// ── La sede ─────────────────────────────────────────────────────────────

const idSede = (s) => (s && typeof s === 'object' ? s.id : s)

/**
 * Quanto di una fattura tocca alla sede. `null` = non è sua.
 * @returns {{ quota: number, ripartita: boolean, criterio?: string, certa?: boolean } | null | 'senza-sede'}
 */
function quotaSede(f, sedeId, sedi, produzionePerSede) {
  if (!sedeId) return { quota: 1, ripartita: false }
  const condivise = Array.isArray(f?.sedi_condivise) ? f.sedi_condivise.filter(Boolean) : []
  const prod = typeof produzionePerSede === 'function'
    ? produzionePerSede(String(giorno(f?.data_fattura) || '').slice(0, 7))
    : produzionePerSede
  if (condivise.length > 1) {
    if (!condivise.includes(sedeId)) return null
    const q = quoteDiRipartizione(condivise, prod)
    return { quota: q.quote[sedeId] || 0, ripartita: true, criterio: q.criterio, certa: q.certa }
  }
  const sua = condivise[0] || f?.sede_id
  if (sua) return sua === sedeId ? { quota: 1, ripartita: false } : null
  const tutte = (Array.isArray(sedi) ? sedi : []).map(idSede).filter(Boolean)
  if (!tutte.includes(sedeId)) return 'senza-sede'
  const q = quoteDiRipartizione(tutte, prod)
  return { quota: q.quote[sedeId] || 0, ripartita: true, criterio: q.criterio, certa: q.certa }
}

// ── Il conto ────────────────────────────────────────────────────────────

const nuovaVoce = (c) => ({
  id: c ? c.id : null, nome: c ? c.nome : 'Da classificare', tipo: c ? c.tipo : 'costo',
  importo: 0, nFatture: 0, nSenzaImponibile: 0, importoIvaCompresa: 0, _fornitori: new Map(),
})

function aggiungi(voce, f, valore, lordo) {
  voce.importo += valore
  voce.nFatture += 1
  if (lordo) { voce.nSenzaImponibile += 1; voce.importoIvaCompresa += valore }
  const chiave = chiaveFornitore(f?.fornitore)
  const x = voce._fornitori.get(chiave) || { chiave, nome: String(f?.fornitore ?? '').trim(), importo: 0, nFatture: 0 }
  x.importo += valore
  x.nFatture += 1
  voce._fornitori.set(chiave, x)
}

function chiudiVoce(v) {
  const fornitori = [...v._fornitori.values()]
    .map(x => ({ ...x, importo: arrot(x.importo) }))
    .sort((a, b) => b.importo - a.importo || a.nome.localeCompare(b.nome, 'it'))
  return {
    id: v.id, nome: v.nome, tipo: v.tipo,
    importo: arrot(v.importo), nFatture: v.nFatture, nSenzaImponibile: v.nSenzaImponibile,
    importoIvaCompresa: arrot(v.importoIvaCompresa), fornitori,
  }
}

/**
 * I costi di un periodo, per voce. Vedi l'API in cima al file.
 *
 * @param {object[]} fatture  righe di `fatture`: id, fornitore, piva, numero_rif,
 *   data_fattura, totale, imponibile, imposta, tipo, righe, sede_id,
 *   sedi_condivise, categoria_spesa (le ultime facoltative)
 * @param {object} o
 * @param {string} o.dal  'AAAA-MM-GG' compreso
 * @param {string} o.al   'AAAA-MM-GG' compreso
 */
export function costiPerPeriodo(fatture, {
  dal, al, categoriePerFornitore = null, sedeId = null, sedi = [], produzionePerSede = null, mese = null,
} = {}) {
  if (!giorno(dal) || !giorno(al)) throw new Error('periodo non valido: servono dal e al come AAAA-MM-GG')
  const voci = new Map()
  const daClassificare = nuovaVoce(null)
  const invest = { ...nuovaVoce(categoriaPerId(ID.ATTREZZATURE)), fatture: [] }
  const esclusi = { importo: 0, nFatture: 0 }
  const note = { importo: 0, nFatture: 0 }
  const rip = { importoRipartito: 0, nFatture: 0, criteri: new Set(), certa: true, senzaSede: { importo: 0, nFatture: 0 } }
  const cop = {
    nFatture: 0, nSenzaImponibile: 0, importoIvaCompresa: 0, nSenzaCategoria: 0, importoSenzaCategoria: 0,
    ultimaFattura: null, ultimaFatturaDelMese: null, nSenzaData: 0,
  }

  for (const f of (Array.isArray(fatture) ? fatture : [])) {
    const d = giorno(f?.data_fattura)
    if (!d) { cop.nSenzaData += 1; continue }
    if (!cop.ultimaFattura || d > cop.ultimaFattura) cop.ultimaFattura = d
    if (d < dal || d > al) continue

    const q = quotaSede(f, sedeId, sedi, produzionePerSede)
    if (q == null) continue
    const senza = importoSenzaIva(f)
    const intero = senza.importo != null ? senza.importo : lordoConSegno(f)
    if (q === 'senza-sede') {
      rip.senzaSede.importo += intero
      rip.senzaSede.nFatture += 1
      continue
    }
    if (!(q.quota > 0)) continue
    const valore = intero * q.quota
    const lordo = senza.importo == null
    if (q.ripartita) {
      rip.importoRipartito += valore
      rip.nFatture += 1
      if (q.criterio) rip.criteri.add(q.criterio)
      if (q.certa === false) rip.certa = false
    }

    cop.nFatture += 1
    if (!cop.ultimaFatturaDelMese || d > cop.ultimaFatturaDelMese) cop.ultimaFatturaDelMese = d
    if (lordo) { cop.nSenzaImponibile += 1; cop.importoIvaCompresa += valore }
    if (isNotaCredito(f)) { note.importo += valore; note.nFatture += 1 }

    const cat = categoriaPerId(categoriaDellaFattura(f, categoriePerFornitore))
    if (!cat) {
      aggiungi(daClassificare, f, valore, lordo)
      cop.nSenzaCategoria += 1
      cop.importoSenzaCategoria += valore
      continue
    }
    if (cat.tipo === 'escluso') { esclusi.importo += valore; esclusi.nFatture += 1; continue }
    if (cat.tipo === 'investimento') {
      aggiungi(invest, f, valore, lordo)
      invest.fatture.push({ id: f?.id ?? null, fornitore: f?.fornitore ?? '', numero: f?.numero_rif ?? null, data: d, importo: arrot(valore), ivaCompresa: lordo })
      continue
    }
    if (!voci.has(cat.id)) voci.set(cat.id, nuovaVoce(cat))
    aggiungi(voci.get(cat.id), f, valore, lordo)
  }

  const perCategoria = CATEGORIE_SPESA.filter(c => voci.has(c.id)).map(c => chiudiVoce(voci.get(c.id)))
  const totaleCosti = arrot(perCategoria.reduce((s, v) => s + v.importo, 0))
  const dc = chiudiVoce(daClassificare)
  const iv = chiudiVoce(invest)

  return {
    mese,
    periodo: { dal, al },
    perCategoria,
    totaleCosti,
    totaleCostiEDaClassificare: arrot(totaleCosti + dc.importo),
    investimenti: {
      importo: iv.importo, nFatture: iv.nFatture, nSenzaImponibile: iv.nSenzaImponibile,
      importoIvaCompresa: iv.importoIvaCompresa,
      fatture: invest.fatture.sort((a, b) => b.importo - a.importo),
    },
    daClassificare: {
      importo: dc.importo, nFornitori: dc.fornitori.length, nFatture: dc.nFatture,
      nSenzaImponibile: dc.nSenzaImponibile, importoIvaCompresa: dc.importoIvaCompresa, fornitori: dc.fornitori,
    },
    esclusi: { importo: arrot(esclusi.importo), nFatture: esclusi.nFatture },
    noteDiCredito: { importo: arrot(note.importo), nFatture: note.nFatture },
    ripartizione: sedeId ? {
      sedeId,
      criterio: rip.criteri.size ? [...rip.criteri].join('; ') : null,
      certa: rip.certa,
      importoRipartito: arrot(rip.importoRipartito),
      nFatture: rip.nFatture,
      senzaSede: { importo: arrot(rip.senzaSede.importo), nFatture: rip.senzaSede.nFatture },
    } : null,
    copertura: {
      ...cop,
      importoIvaCompresa: arrot(cop.importoIvaCompresa),
      importoSenzaCategoria: arrot(cop.importoSenzaCategoria),
    },
  }
}

/** I costi di un mese ('AAAA-MM'). Stessa forma di `costiPerPeriodo`. */
export function costiPerMese(fatture, { mese, ...resto } = {}) {
  const { dal, al } = limitiMese(mese)
  return costiPerPeriodo(fatture, { ...resto, dal, al, mese })
}

// ── Perché i costi sono cambiati ────────────────────────────────────────

const quotaLorda = (v) => (v && Math.abs(v.importo) > 0 ? Math.abs(v.importoIvaCompresa || 0) / Math.abs(v.importo) : 0)

/**
 * Le voci che spiegano la differenza fra due periodi, in €, dalla più
 * pesante. Dentro ogni voce, i fornitori che hanno pesato di più.
 *
 * `ivaMista` avverte quando una voce è senza IVA in un mese e IVA compresa
 * nell'altro: una parte della differenza è l'IVA, non una spesa vera.
 *
 * @param {ReturnType<typeof costiPerPeriodo>} attuale
 * @param {ReturnType<typeof costiPerPeriodo>} confronto
 */
export function causeVariazione(attuale, confronto, { maxFornitori = 3 } = {}) {
  const tutte = (r) => [...(r?.perCategoria || []), ...(r?.daClassificare?.nFatture ? [{ ...r.daClassificare, id: null, nome: 'Da classificare' }] : [])]
  const A = new Map(tutte(attuale).map(v => [v.id ?? '', v]))
  const B = new Map(tutte(confronto).map(v => [v.id ?? '', v]))
  const chiavi = [...new Set([...A.keys(), ...B.keys()])]

  const voci = chiavi.map(k => {
    const a = A.get(k)
    const b = B.get(k)
    const fa = new Map((a?.fornitori || []).map(x => [x.chiave, x]))
    const fb = new Map((b?.fornitori || []).map(x => [x.chiave, x]))
    const fornitori = [...new Set([...fa.keys(), ...fb.keys()])]
      .map(ch => {
        const x = fa.get(ch)
        const y = fb.get(ch)
        const at = x?.importo || 0
        const co = y?.importo || 0
        return { chiave: ch, nome: (x || y).nome, attuale: arrot(at), confronto: arrot(co), differenza: arrot(at - co) }
      })
      .filter(x => Math.abs(x.differenza) >= 1)
      .sort((p, q) => Math.abs(q.differenza) - Math.abs(p.differenza))
      .slice(0, maxFornitori)
    const at = a?.importo || 0
    const co = b?.importo || 0
    const c = k ? categoriaPerId(k) : null
    return {
      id: k || null,
      nome: c ? c.nome : (a || b).nome,
      attuale: arrot(at),
      confronto: arrot(co),
      differenza: arrot(at - co),
      // Solo se la voce c'è in tutti e due i mesi: contro un mese vuoto non
      // c'è IVA da mescolare (trovato sul conto vero di luglio, 03/10).
      ivaMista: Math.abs(at) > 0 && Math.abs(co) > 0 && Math.abs(quotaLorda(a) - quotaLorda(b)) > 0.2,
      fornitori,
    }
  })
    .filter(v => Math.abs(v.differenza) >= 1)
    .sort((p, q) => Math.abs(q.differenza) - Math.abs(p.differenza))

  const ia = attuale?.investimenti?.importo || 0
  const ib = confronto?.investimenti?.importo || 0
  return {
    differenza: arrot((attuale?.totaleCostiEDaClassificare || 0) - (confronto?.totaleCostiEDaClassificare || 0)),
    voci,
    investimenti: { attuale: arrot(ia), confronto: arrot(ib), differenza: arrot(ia - ib) },
  }
}

/**
 * La frase di una causa: «Materie prime +2.340 €: soprattutto DESA +1.100 €».
 * Si citano solo i fornitori che vanno nello stesso verso della voce: dire
 * «costi su, soprattutto X» con X sceso sarebbe una frase falsa.
 */
export function fraseCausa(voce) {
  if (!voce) return ''
  const testa = `${voce.nome} ${euroSegno(voce.differenza)}`
  const concordi = (voce.fornitori || []).filter(f => Math.sign(f.differenza) === Math.sign(voce.differenza)).slice(0, 2)
  if (!concordi.length) return testa
  const pezzi = concordi.map(f => `${nomeBreve(f.nome)} ${euroSegno(f.differenza)}`)
  return `${testa}: soprattutto ${pezzi.join(' e ')}`
}

// ── Le fatture fuori misura ─────────────────────────────────────────────

const mediana = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const SOGLIA_EURO = 5000
const VOLTE = 5
const SOGLIA_UNICA = 10000

/**
 * Le fatture molto più grandi del solito per quel fornitore: candidate a
 * essere un investimento. Non decide niente, le indica.
 *
 * Una fattura è fuori misura se vale almeno 5.000 € e almeno cinque volte la
 * fattura tipica (la mediana delle ALTRE fatture dello stesso fornitore); se
 * il fornitore ha meno di due altre fatture, se vale almeno 10.000 €. Restano
 * fuori le note di credito, le fatture che hanno già una voce loro e quelle
 * di fornitori già segnati come investimento o fuori conto.
 *
 * @param {object[]} fatture  serve lo storico: la tipica si misura su tutte
 * @param {{ categoriePerFornitore?: object, dal?: string }} [o]  `dal`: indica
 *   solo le fatture da quel giorno in poi
 */
export function fattureEccezionali(fatture, { categoriePerFornitore = null, dal = null } = {}) {
  const perFornitore = new Map()
  for (const f of (Array.isArray(fatture) ? fatture : [])) {
    if (isNotaCredito(f)) continue
    const k = chiaveFornitore(f?.fornitore)
    if (!perFornitore.has(k)) perFornitore.set(k, [])
    perFornitore.get(k).push(f)
  }
  const out = []
  for (const [chiave, elenco] of perFornitore) {
    for (const f of elenco) {
      const d = giorno(f?.data_fattura)
      if (dal && (!d || d < dal)) continue
      if (idDa(f?.categoria_spesa)) continue
      const tipoFornitore = categoriaPerId(categoriaDellaFattura({ ...f, categoria_spesa: null }, categoriePerFornitore))?.tipo
      if (tipoFornitore === 'investimento' || tipoFornitore === 'escluso') continue
      const importo = Math.abs(numero(f?.totale) || 0)
      const altre = elenco.filter(x => x !== f).map(x => Math.abs(numero(x?.totale) || 0)).filter(x => x > 0)
      let tipica = null
      let motivo = null
      if (altre.length >= 2) {
        tipica = mediana(altre)
        if (importo >= SOGLIA_EURO && importo >= VOLTE * tipica) {
          motivo = `${Math.round(importo / tipica).toLocaleString('it-IT', { useGrouping: 'always' })} volte la sua fattura tipica`
        }
      } else if (importo >= SOGLIA_UNICA) {
        motivo = altre.length ? 'molto più grande delle altre di questo fornitore' : 'unica fattura di questo fornitore'
      }
      if (!motivo) continue
      out.push({
        id: f?.id ?? null, fornitore: f?.fornitore ?? '', chiave, numero: f?.numero_rif ?? null, data: d,
        importo: arrot(importo), tipica: tipica != null ? arrot(tipica) : null,
        volteLaTipica: tipica ? Math.round((importo / tipica) * 10) / 10 : null, motivo,
      })
    }
  }
  return out.sort((a, b) => b.importo - a.importo)
}
