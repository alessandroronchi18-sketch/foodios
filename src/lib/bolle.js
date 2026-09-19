// ── Dalla bolla al prezzo al chilo ────────────────────────────────────────
//
// Richiesta del titolare, 19/09/2026: «il prezzo delle materie prime uno lo
// può cambiare a mano, ma deve venire automaticamente dalle fatture caricate
// nel magazzino, così si minimizza l'errore umano e si tagliano dei tempi
// morti». Il flusso: arriva la merce, si carica la bolla, si popolano le
// giacenze **e in parallelo** i prezzi vanno nelle Materie prime, e ogni
// cambio del prezzo al chilo finisce nello storico di quella pagina.
//
// Qui dentro c'è solo il conto, senza schermo e senza database: quanto costa
// un chilo di quella roba, e se quel numero può diventare il prezzo di
// listino. È la parte che decide dei soldi, quindi sta da sola e si prova da
// sola.
//
// ── Perché questo file esiste (il difetto che ha fatto nascere tutto) ──────
//
// La foto della bolla si poteva già fare, ma in due passaggi scollegati: un
// riquadro leggeva le quantità e le metteva in magazzino, un altro leggeva i
// prezzi e li scriveva in `ingredienti_costi`. Il secondo **non scriveva
// niente nello storico**: nessuna riga in `logPrezzi`, nessuna data di
// decorrenza. Quindi il P&L di un mese passato ricostruiva quel mese con i
// prezzi di oggi, e nella pagina Materie prime il prezzo cambiava senza che
// nessuno potesse sapere da dove veniva.
//
// ── Le tre regole che valgono in tutto il file ────────────────────────────
//
// 1. **Un valore che manca non è zero.** Se non si sa quanto pesa una
//    confezione, non si inventa: si dice che non si sa e quella riga non
//    tocca il prezzo. Un prezzo sbagliato è peggio di un prezzo mancante,
//    perché il prezzo mancante si vede e quello sbagliato no.
// 2. **Nessun conto nascosto.** Ogni passaggio che questo file fa per
//    arrivare ai chili lo scrive in `spiegazione`, così la schermata può
//    mostrarlo e una persona può dire «no, quel sacco è da 25 kg non da 10».
// 3. **Le conversioni non si indovinano a occhio.** Un litro di latte non
//    pesa un chilo, e quei trenta grammi di differenza sul prezzo al chilo
//    sono il 3%: su un food cost al 25% sono quasi un punto di margine.

import { leggiPrezzoKg, letturaPrezzoKg } from './formatIt'
import { normIng } from './foodcost'

/**
 * Quanto pesa un litro, in grammi.
 *
 * Non è una finezza da chimici: il latte a 1,03 e l'olio a 0,92 fanno l'11%
 * di differenza fra loro, e il prezzo al chilo ci finisce dentro tutto. Sono
 * gli stessi numeri che il riconoscimento della foto usa già da mesi
 * (`FotoOCR`, modo magazzino), qui messi in un posto solo perché adesso
 * decidono anche dei prezzi.
 *
 * La chiave si cerca **dentro** il nome, non uguale al nome: «latte intero
 * fresco alta qualità» deve trovare «latte». Le voci più lunghe vanno prima,
 * perché «latte di mandorla» non è «latte».
 */
export const PESO_DI_UN_LITRO = [
  ['latte di mandorla', 1010],
  ['latte di soia', 1030],
  ['latte di cocco', 1000],
  ['panna', 1000],
  ['latte', 1030],
  ['olio', 920],
  ['acqua', 1000],
  ['uovo', 1030],
  ['uova', 1030],
  ['albume', 1040],
  ['tuorlo', 1030],
  ['sciroppo', 1330],
  ['glucosio', 1400],
  ['vino', 990],
  ['aceto', 1010],
  ['alcool', 790],
  ['rum', 940],
]

/** Il peso di un litro di quella cosa, o `null` se non lo sappiamo. */
export function pesoDiUnLitro(nome) {
  const n = String(nome || '').toLowerCase()
  for (const [chiave, grammi] of PESO_DI_UN_LITRO) {
    if (n.includes(chiave)) return grammi
  }
  return null
}

/**
 * L'unità di misura come la scrive un fornitore, ridotta a una delle nostre.
 *
 * Sulle bolle vere si trova di tutto: «KG», «Kg.», «kg», «CF», «N.», «PZ»,
 * «LT», «Lt», «CT». Qui si normalizza, e quello che non si riconosce resta
 * `null` — che vuol dire «non lo so», non «pezzi».
 */
export function normalizzaUnita(u) {
  const s = String(u || '').toLowerCase().trim().replace(/[.\s]/g, '')
  if (!s) return null
  if (['kg', 'chilo', 'chili', 'kilo', 'kgr'].includes(s)) return 'kg'
  if (['g', 'gr', 'grammi', 'grammo'].includes(s)) return 'g'
  if (['hg', 'etto', 'etti'].includes(s)) return 'hg'
  if (['l', 'lt', 'litro', 'litri'].includes(s)) return 'l'
  if (['ml', 'millilitri'].includes(s)) return 'ml'
  if (['cl', 'centilitri'].includes(s)) return 'cl'
  if (['pz', 'pezzo', 'pezzi', 'n', 'nr', 'num', 'cf', 'conf', 'confezione',
       'ct', 'cartone', 'cartoni', 'sacco', 'sacchi', 'secchio', 'secchi',
       'bottiglia', 'bottiglie', 'latta'].includes(s)) return 'pz'
  return null
}

/**
 * Quanti grammi sono, davvero.
 *
 * @param {number} quantita   quanto ne è arrivato, nell'unità del fornitore
 * @param {string} unita      l'unità come sta scritta sulla bolla
 * @param {object} [opts]
 * @param {string} [opts.nome]             serve per il peso di un litro
 * @param {number} [opts.pesoConfezioneG]  quanto pesa UN pezzo/sacco/cartone
 * @returns {{grammi: number|null, spiegazione: string, problema: string|null}}
 */
export function inGrammi(quantita, unita, { nome = '', pesoConfezioneG = null } = {}) {
  const q = Number(quantita)
  if (!Number.isFinite(q) || q <= 0) {
    return { grammi: null, spiegazione: '', problema: 'quantità non leggibile' }
  }
  const u = normalizzaUnita(unita)
  if (!u) {
    return { grammi: null, spiegazione: '', problema: `unità di misura sconosciuta: «${unita}»` }
  }
  if (u === 'kg') return { grammi: q * 1000, spiegazione: `${fmt(q)} kg`, problema: null }
  if (u === 'g')  return { grammi: q, spiegazione: `${fmt(q)} g`, problema: null }
  if (u === 'hg') return { grammi: q * 100, spiegazione: `${fmt(q)} hg = ${fmt(q / 10)} kg`, problema: null }

  if (u === 'l' || u === 'ml' || u === 'cl') {
    const litri = u === 'l' ? q : u === 'cl' ? q / 100 : q / 1000
    const peso = pesoDiUnLitro(nome)
    if (peso == null) {
      return {
        grammi: null,
        spiegazione: '',
        problema: `${fmt(litri)} l di «${nome}»: non so quanto pesa un litro, quindi non calcolo il prezzo al chilo`,
      }
    }
    return {
      grammi: litri * peso,
      spiegazione: `${fmt(litri)} l × ${fmt(peso / 1000)} kg/l = ${fmt(litri * peso / 1000)} kg`,
      problema: null,
    }
  }

  // Pezzi, confezioni, sacchi, cartoni: senza il peso di uno non si va da
  // nessuna parte. È il caso più frequente sulle bolle vere («5 SACCHI FARINA
  // 00 25KG»), e l'unico modo di sbagliarlo di venticinque volte.
  const pc = Number(pesoConfezioneG)
  if (!Number.isFinite(pc) || pc <= 0) {
    return {
      grammi: null,
      spiegazione: '',
      problema: `${fmt(q)} ${q === 1 ? 'pezzo' : 'pezzi'}: manca il peso di uno, scrivilo tu`,
    }
  }
  return {
    grammi: q * pc,
    spiegazione: `${fmt(q)} × ${fmt(pc / 1000)} kg = ${fmt(q * pc / 1000)} kg`,
    problema: null,
  }
}

/** Numero all'italiana, senza zeri inutili in coda. */
function fmt(n) {
  if (!Number.isFinite(n)) return '—'
  const s = Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(3)
  return s.replace(/\.?0+$/, '').replace('.', ',')
}

/**
 * Il prezzo al chilo di una riga di bolla.
 *
 * Due modi in cui una bolla dice quanto costa, e **non sono equivalenti**:
 *
 *   - l'imponibile di riga (il totale di quella riga, sconti già applicati)
 *   - il prezzo unitario di listino (per kg, per litro o per pezzo)
 *
 * Quando ci sono tutti e due **vince l'imponibile**, perché è quello che il
 * fornitore ti mette davvero in conto: lo sconto di riga, l'arrotondamento e
 * il prezzo speciale che ti ha fatto sono già dentro. Il prezzo unitario è
 * quello di listino, e sulle bolle vere quasi mai coincide.
 *
 * L'IVA resta fuori: il food cost di un'azienda si fa sull'imponibile, l'IVA
 * sugli acquisti si recupera. Se il documento porta solo il lordo, lo si
 * riporta a imponibile con l'aliquota che c'è scritta — e se l'aliquota non
 * c'è, la riga non fa il prezzo: al 4% e al 22% ci sono diciotto punti di
 * differenza, che sul food cost sono più di quanto valga tutto lo sforzo di
 * caricare la bolla.
 *
 * @param {object} riga
 * @param {string} riga.nome
 * @param {number} riga.quantita
 * @param {string} riga.unita
 * @param {number} [riga.pesoConfezioneG]
 * @param {number|string} [riga.imponibile]      totale della riga, senza IVA
 * @param {number|string} [riga.totaleConIva]    totale della riga, con IVA
 * @param {number} [riga.aliquotaIva]            in percentuale (4, 10, 22)
 * @param {number|string} [riga.prezzoUnitario]  di listino, per unità
 * @param {number} [riga.scontoPct]              sconto di riga, in percentuale
 * @returns {{prezzoKg: number|null, grammi: number|null, spiegazione: string[],
 *            problema: string|null, ambiguo: boolean}}
 */
export function prezzoAlKgDaRiga(riga = {}) {
  const spiegazione = []
  const { grammi, spiegazione: comeKg, problema } = inGrammi(riga.quantita, riga.unita, {
    nome: riga.nome, pesoConfezioneG: riga.pesoConfezioneG,
  })
  if (comeKg) spiegazione.push(comeKg)
  if (problema) return { prezzoKg: null, grammi: null, spiegazione, problema, ambiguo: false }

  // ── Quanto costa in tutto quella riga, senza IVA ────────────────────────
  let imponibile = null
  let ambiguo = false

  const lettoImponibile = riga.imponibile != null && riga.imponibile !== ''
    ? letturaPrezzoKg(riga.imponibile) : null
  if (lettoImponibile?.valore != null) {
    imponibile = lettoImponibile.valore
    ambiguo = ambiguo || lettoImponibile.ambiguo
    spiegazione.push(`imponibile di riga ${fmt(imponibile)} €`)
  }

  if (imponibile == null && riga.totaleConIva != null && riga.totaleConIva !== '') {
    const lordo = letturaPrezzoKg(riga.totaleConIva)
    const aliq = Number(riga.aliquotaIva)
    if (lordo?.valore == null) {
      return { prezzoKg: null, grammi, spiegazione, problema: 'il totale della riga non si legge', ambiguo }
    }
    if (!Number.isFinite(aliq) || aliq < 0 || aliq > 100) {
      return {
        prezzoKg: null, grammi, spiegazione,
        problema: 'c\'è solo il totale con IVA e non si sa l\'aliquota: il prezzo non si può ricavare',
        ambiguo,
      }
    }
    imponibile = lordo.valore / (1 + aliq / 100)
    ambiguo = ambiguo || lordo.ambiguo
    spiegazione.push(`${fmt(lordo.valore)} € con IVA al ${fmt(aliq)}% = ${fmt(imponibile)} € imponibile`)
  }

  // Niente totale di riga: si ripiega sul prezzo unitario di listino.
  if (imponibile == null && riga.prezzoUnitario != null && riga.prezzoUnitario !== '') {
    const unit = letturaPrezzoKg(riga.prezzoUnitario)
    if (unit?.valore == null) {
      return { prezzoKg: null, grammi, spiegazione, problema: 'il prezzo unitario non si legge', ambiguo }
    }
    ambiguo = ambiguo || unit.ambiguo
    const q = Number(riga.quantita)
    imponibile = unit.valore * q
    spiegazione.push(`${fmt(unit.valore)} € × ${fmt(q)} = ${fmt(imponibile)} €`)
    const sconto = Number(riga.scontoPct)
    if (Number.isFinite(sconto) && sconto > 0 && sconto < 100) {
      imponibile = imponibile * (1 - sconto / 100)
      spiegazione.push(`meno ${fmt(sconto)}% di sconto = ${fmt(imponibile)} €`)
    }
  }

  if (imponibile == null) {
    return { prezzoKg: null, grammi, spiegazione, problema: 'su questa riga non c\'è nessun prezzo', ambiguo }
  }
  if (!(imponibile > 0)) {
    // Un omaggio o una riga a zero non è un prezzo: se entrasse porterebbe a
    // zero il costo di quella materia prima in tutte le ricette.
    return { prezzoKg: null, grammi, spiegazione, problema: 'riga a zero euro: è un omaggio, non un prezzo', ambiguo }
  }

  const prezzoKg = imponibile / (grammi / 1000)
  spiegazione.push(`${fmt(imponibile)} € ÷ ${fmt(grammi / 1000)} kg = ${fmt(prezzoKg)} €/kg`)
  return { prezzoKg: arrotonda(prezzoKg, 4), grammi, spiegazione, problema: null, ambiguo }
}

function arrotonda(n, decimali) {
  const f = Math.pow(10, decimali)
  return Math.round(n * f) / f
}

/**
 * Lo scostamento che merita un'occhiata prima di essere applicato.
 *
 * Non è un divieto: i prezzi delle materie prime si muovono davvero, e il
 * burro nel 2024 è raddoppiato in sei mesi. Serve a fermare l'altra famiglia
 * di scarti, quella che non è un rincaro ma un errore di lettura: «1.250»
 * letto 1.250 invece di 1,25 sono mille volte, un'unità sbagliata sono venti
 * volte, un sacco da 25 kg contato come un pezzo sono venticinque volte.
 *
 * La soglia sta al 50% perché sotto ci stanno i rincari veri, e sopra
 * cominciano gli errori di ordine di grandezza.
 */
export const SOGLIA_SCOSTAMENTO = 0.5

export function scostamentoSospetto(prezzoAttuale, prezzoNuovo) {
  const a = Number(prezzoAttuale), n = Number(prezzoNuovo)
  if (!Number.isFinite(a) || a <= 0) return false   // prima non c'era niente: non c'è scostamento
  if (!Number.isFinite(n) || n <= 0) return false
  return Math.abs(n - a) / a > SOGLIA_SCOSTAMENTO
}

/**
 * Cosa farsene, di questo prezzo.
 *
 * Il caso che rende la domanda meno ovvia di quanto sembri: si carica oggi
 * una bolla della settimana scorsa, e nel frattempo il prezzo è già stato
 * cambiato a mano ieri. La bolla è vecchia: **deve entrare nello storico**
 * (se no il P&L della settimana scorsa resta sbagliato) ma **non deve
 * diventare il prezzo di adesso**, che è più recente e più giusto.
 *
 * @returns {{azione: 'applica'|'soloStorico'|'nessuna', motivo: string}}
 *   `applica` = cambia il listino e scrive lo storico;
 *   `soloStorico` = scrive solo lo storico, il listino di oggi resta com'è;
 *   `nessuna` = il prezzo non è cambiato, non si scrive niente.
 */
export function decidiPrezzo({ prezzoAttuale, prezzoNuovo, dataBolla, dataUltimoCambio }) {
  const nuovo = Number(prezzoNuovo)
  if (!Number.isFinite(nuovo) || nuovo <= 0) {
    return { azione: 'nessuna', motivo: 'non c\'è un prezzo da scrivere' }
  }
  const attuale = Number(prezzoAttuale)
  const cEraPrima = Number.isFinite(attuale) && attuale > 0
  if (cEraPrima && arrotonda(attuale, 4) === arrotonda(nuovo, 4)) {
    return { azione: 'nessuna', motivo: 'il prezzo è lo stesso di prima' }
  }
  if (!cEraPrima) {
    return { azione: 'applica', motivo: 'prima non aveva prezzo' }
  }
  const g1 = soloGiorno(dataBolla)
  const g2 = soloGiorno(dataUltimoCambio)
  if (g1 && g2 && g1 < g2) {
    return {
      azione: 'soloStorico',
      motivo: `la bolla è del ${italiana(g1)} e il prezzo è già stato cambiato il ${italiana(g2)}: lo storico lo registra, il prezzo di oggi resta quello più recente`,
    }
  }
  return { azione: 'applica', motivo: 'la bolla è la cosa più recente che abbiamo' }
}

/** «AAAA-MM-GG» da qualunque forma di data, o `null`. */
export function soloGiorno(d) {
  if (!d) return null
  if (typeof d === 'string') {
    const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    const it = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (it) return `${it[3]}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}`
    return null
  }
  if (d instanceof Date && !isNaN(d)) {
    // Giorno LOCALE: `toISOString` a est di Greenwich riporta il giorno prima,
    // ed è il difetto che a settembre ha spostato indietro di un giorno tutte
    // le decorrenze dei prezzi.
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return null
}

function italiana(giorno) {
  return String(giorno).split('-').reverse().join('/')
}

/**
 * Il nome con cui una bolla si riconosce, per non caricarla due volte.
 *
 * Caricare due volte la stessa bolla raddoppia le giacenze e mette due righe
 * identiche nello storico dei prezzi. Succede: la foto non sembra essere
 * andata a buon fine, si rifà. L'identità è fornitore + numero + data, tutto
 * ridotto a minuscole senza spazi e punteggiatura, perché «N. 1234/A» e
 * «n1234/a» sono lo stesso documento.
 *
 * Se manca il numero **non si inventa un'identità**: si risponde `null`, che
 * vuol dire «questa bolla non so riconoscerla», e chi chiama deve avvisare
 * invece di dare per scontato che sia nuova o che sia doppia.
 */
export function identitaBolla({ fornitore, numero, data } = {}) {
  const n = String(numero || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!n) return null
  const f = String(fornitore || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const g = soloGiorno(data)
  if (!g) return null
  return `${f}|${n}|${g}`
}

/**
 * Prepara una bolla intera: ogni riga diventa una riga da rivedere a schermo.
 *
 * Non salva niente e non decide niente da sola. Restituisce, per ogni riga,
 * quanti grammi sono, quanto costa al chilo, cosa ha fatto per arrivarci e
 * **cosa non ha potuto fare**. La schermata mostra tutto e la persona
 * conferma: è la differenza fra un aiuto e un danno automatico.
 *
 * @param {Array} righe  come le legge il riconoscimento della foto
 * @param {object} ctx
 * @param {object} ctx.ingredientiCosti  `ricettario.ingredienti_costi`
 * @param {Array}  [ctx.logPrezzi]       lo storico, per sapere l'ultimo cambio
 * @param {string} ctx.dataBolla         il giorno del documento
 * @returns {Array} una riga per riga di bolla, pronta da mostrare
 */
export function preparaBolla(righe, { ingredientiCosti = {}, logPrezzi = [], dataBolla } = {}) {
  const ultimoCambioPer = ultimiCambi(logPrezzi)
  return (righe || []).map((r, i) => {
    const nome = String(r?.nome || '').trim()
    const chiave = nome ? normIng(nome) : ''
    const voce = chiave ? ingredientiCosti[chiave] : null
    const prezzoAttuale = voce?.costoKg != null ? Number(voce.costoKg)
      : voce?.costoG != null ? Number(voce.costoG) * 1000
      : null
    // Un prezzo che il prodotto ha stimato da solo non è un prezzo dichiarato:
    // una bolla vera lo deve poter sostituire senza fare storie.
    const eraUnaStima = !!voce?.isStima

    const conto = prezzoAlKgDaRiga({ ...r, nome })
    const esisteInElenco = !!chiave && Object.prototype.hasOwnProperty.call(ingredientiCosti, chiave)

    const decisione = conto.prezzoKg == null
      ? { azione: 'nessuna', motivo: conto.problema || 'niente prezzo' }
      : decidiPrezzo({
        prezzoAttuale: eraUnaStima ? null : prezzoAttuale,
        prezzoNuovo: conto.prezzoKg,
        dataBolla,
        dataUltimoCambio: ultimoCambioPer.get(chiave) || null,
      })

    return {
      indice: i,
      nome,
      chiave,
      esisteInElenco,
      grammi: conto.grammi,
      prezzoAttuale: eraUnaStima ? null : prezzoAttuale,
      eraUnaStima,
      prezzoKg: conto.prezzoKg,
      spiegazione: conto.spiegazione,
      problema: conto.problema,
      ambiguo: conto.ambiguo,
      sospetto: conto.prezzoKg != null && scostamentoSospetto(prezzoAttuale, conto.prezzoKg),
      azione: decisione.azione,
      motivo: decisione.motivo,
    }
  })
}

/** L'ultimo giorno in cui il prezzo di ogni materia prima è cambiato. */
export function ultimiCambi(logPrezzi = []) {
  const m = new Map()
  for (const e of (logPrezzi || [])) {
    const k = normIng(e?.ingrediente || '')
    if (!k) continue
    const g = soloGiorno(e?.decorre_da || e?.data)
    if (!g) continue
    const prima = m.get(k)
    if (!prima || g > prima) m.set(k, g)
  }
  return m
}

export { leggiPrezzoKg }

/**
 * Applica una serie di cambi di prezzo al listino e allo storico.
 *
 * Restituisce i due oggetti nuovi senza scrivere niente: sta a chi chiama
 * salvarli, e salvarli **insieme**. È la parte che prima stava dentro il
 * Dashboard, dove nessun test poteva arrivarci — ed è esattamente la parte
 * che decide quanto costa ogni ricetta del ricettario.
 *
 * @param {Array} cambi  `{ chiave, nome, prezzoKg, prezzoAttuale, azione }`
 *   dove `azione` è `'applica'` (cambia il listino e scrive lo storico) o
 *   `'soloStorico'` (scrive solo lo storico: la bolla è più vecchia
 *   dell'ultimo cambio, quindi il prezzo di oggi non si tocca).
 * @param {object} ctx
 * @param {object} ctx.ingredientiCosti  il listino di adesso
 * @param {Array}  ctx.logPrezzi         lo storico di adesso
 * @param {object} ctx.origine           da dove arriva: `{tipo, fornitore, numero, data}`
 * @param {string} [ctx.utente]
 * @param {string} [ctx.giorno]          da quando valgono, «AAAA-MM-GG»
 * @param {number} [ctx.tieni]           quante righe di storico conservare
 * @returns {{ingredientiCosti: object, logPrezzi: Array, applicati: number, storicizzati: number}}
 */
export function applicaCambiAlListino(cambi, {
  ingredientiCosti = {}, logPrezzi = [], origine = { tipo: 'manuale' },
  utente = null, giorno = null, tieni = 500,
} = {}) {
  const costi = { ...ingredientiCosti }
  const righe = []
  const adesso = new Date().toISOString()
  const g = giorno || soloGiorno(origine?.data) || soloGiorno(new Date())
  const decorre = `${g}T00:00:00.000Z`
  let applicati = 0

  for (const c of (cambi || [])) {
    const prezzo = Number(c?.prezzoKg)
    if (!c?.chiave || !Number.isFinite(prezzo) || prezzo <= 0) continue
    if (c.azione !== 'applica' && c.azione !== 'soloStorico') continue

    const vecchioNum = Number(c.prezzoAttuale)
    // `null`, non `0`. «Prima non aveva prezzo» e «prima era gratis» sono due
    // cose diverse, e `getPrezzoStoricoKg` legge proprio questo campo per
    // ricostruire il costo di una produzione passata.
    const vecchio = Number.isFinite(vecchioNum) && vecchioNum > 0 ? vecchioNum : null

    if (c.azione === 'applica') {
      // Quattro decimali al chilo e sei al grammo: è la forma con cui il
      // resto del prodotto scrive `ingredienti_costi` da sempre, e
      // `buildIngCosti` si aspetta tutti e due i campi.
      costi[c.chiave] = {
        costoKg: parseFloat(prezzo.toFixed(4)),
        costoG: parseFloat((prezzo / 1000).toFixed(6)),
      }
      applicati++
    }

    righe.push({
      id: `lp-${Date.now()}-${c.chiave}`,
      data: adesso,
      decorre_da: decorre,
      ingrediente: c.nome || c.chiave,
      prezzoVecchio: vecchio,
      prezzoNuovo: prezzo,
      delta: vecchio == null ? null : prezzo - vecchio,
      deltaPct: vecchio != null && vecchio > 0 ? ((prezzo - vecchio) / vecchio * 100) : null,
      utente: utente || null,
      // Da dove arriva questo numero. Senza, fra un mese nessuno sa più
      // perché il burro è passato da 9,00 a 9,50 €/kg.
      origine,
      soloStorico: c.azione === 'soloStorico' || undefined,
    })
  }

  return {
    ingredientiCosti: costi,
    logPrezzi: [...righe, ...(logPrezzi || [])].slice(0, tieni),
    applicati,
    storicizzati: righe.length,
  }
}

/**
 * Tutto quello che una bolla scrive, calcolato prima di scrivere niente.
 *
 * Quattro pezzi di dati cambiano insieme quando arriva la merce, e stanno in
 * due posti diversi: le **giacenze e il registro dei rifornimenti** sono
 * della sede, il **listino e lo storico dei prezzi** sono dell'azienda —
 * come la pagina Materie prime, che infatti il selettore delle sedi non ce
 * l'ha. Qui si preparano tutti e quattro; chi chiama li salva in una volta
 * sola, perché finire con la merce caricata e il prezzo no (o viceversa) è
 * peggio che non aver fatto niente: sembra a posto.
 *
 * @param {Array}  righe      le righe confermate a schermo
 * @param {object} documento  `{ fornitore, numero, data, identita }`
 * @param {object} stato      `{ magazzino, logRif, ingredientiCosti, logPrezzi, utente }`
 * @returns {{magazzino, logRif, ingredientiCosti, logPrezzi, caricati, applicati, storicizzati}}
 */
export function preparaScrittureBolla(righe, documento = {}, stato = {}) {
  const { magazzino = {}, logRif = [], ingredientiCosti = {}, logPrezzi = [], utente = null } = stato
  const scelte = (righe || []).filter(r => r && r.chiave)

  const nuovoMagazzino = { ...magazzino }
  const nuoveRighe = []
  const adesso = new Date().toISOString()
  const daDove = documento?.fornitore
    ? `bolla ${documento.fornitore}${documento?.numero ? ` n. ${documento.numero}` : ''}`
    : 'bolla'

  for (const r of scelte) {
    const g = Number(r.grammi)
    if (!Number.isFinite(g) || g <= 0) continue
    const prima = nuovoMagazzino[r.chiave]
    nuovoMagazzino[r.chiave] = {
      nome: prima?.nome || r.nome,
      giacenza_g: (prima?.giacenza_g || 0) + g,
      soglia_g: prima?.soglia_g || 0,
      ultimoRifornimento: adesso,
    }
    nuoveRighe.push({
      id: `r-${Date.now()}-${r.chiave}`,
      data: adesso,
      ingrediente: r.nome,
      quantita_g: g,
      note: daDove,
      utente,
      // L'impronta del documento: serve a riconoscere una bolla già caricata
      // quando la foto sembra non essere andata a buon fine e si riprova.
      bolla: documento?.identita || undefined,
    })
  }

  const prezzi = applicaCambiAlListino(
    scelte.filter(r => r.azione === 'applica' || r.azione === 'soloStorico'),
    {
      ingredientiCosti, logPrezzi, utente,
      origine: {
        tipo: 'bolla',
        fornitore: documento?.fornitore || null,
        numero: documento?.numero || null,
        data: documento?.data || null,
      },
    },
  )

  return {
    magazzino: nuovoMagazzino,
    logRif: [...nuoveRighe, ...(logRif || [])],
    ingredientiCosti: prezzi.ingredientiCosti,
    logPrezzi: prezzi.logPrezzi,
    caricati: nuoveRighe.length,
    applicati: prezzi.applicati,
    storicizzati: prezzi.storicizzati,
  }
}
