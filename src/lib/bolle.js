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
import { classificaRiga } from './righeBolla'

/**
 * Un numero come sta scritto sulla bolla: quantità, peso di una confezione.
 *
 * ── Il difetto del 21/09/2026, ed è il più caro di tutto il file ───────────
 *
 * Il prezzo passava di qui dal lettore italiano (`letturaPrezzoKg`), la
 * **quantità no**: era un `Number()` nudo. E il riconoscimento della foto è
 * scritto apposta per NON riformattare («keep the Italian format exactly as
 * printed: "1.250,50" stays "1.250,50"»), quindi la quantità arriva quasi
 * sempre come la stampa il fornitore. Con il `Number()` nudo:
 *
 *   - «10,5» → `NaN`: la riga veniva buttata con «quantità non leggibile»,
 *     merce non caricata e prezzo perso;
 *   - «1.250» → `1.25`: mille volte meno chili, quindi **mille volte più
 *     caro al chilo**. 1.250 kg a 1.000 € diventavano 800 €/kg invece di
 *     0,80 €/kg, e quel numero finiva nel food cost di ogni ricetta che usa
 *     quella materia prima.
 *
 * Due porte per lo stesso dato finiscono sempre per divergere: adesso la
 * quantità e il prezzo entrano dalla stessa, con la stessa regola italiana e
 * lo stesso modo di dire «questo numero si può leggere in due modi».
 *
 * @returns {{valore: number|null, ambiguo: boolean, negativo: boolean}}
 */
export function leggiQuantita(v) {
  if (typeof v === 'number') {
    return Number.isFinite(v)
      ? { valore: v, ambiguo: false, negativo: v < 0 }
      : { valore: null, ambiguo: false, negativo: false }
  }
  const t = String(v ?? '').replace(/€/g, '').trim()
  if (!t) return { valore: null, ambiguo: false, negativo: false }
  const negativo = /^[-−]/.test(t)
  const l = letturaPrezzoKg(negativo ? t.slice(1).trim() : t)
  if (l.valore == null) return { valore: null, ambiguo: false, negativo }
  return { valore: negativo ? -l.valore : l.valore, ambiguo: !!l.ambiguo, negativo }
}

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
 * Il peso di una confezione, letto da com'è scritta la riga.
 *
 * Non è indovinare: è leggere quello che il fornitore ha **stampato**. Sulle
 * bolle vere il peso del sacco sta nella descrizione e da nessun'altra parte
 * («FARINA TIPO 00 SACCO 25 KG», «LATTE UHT 6 X 1 L», «BURRO CONF. 500 G»), e
 * la colonna della quantità dice solo «5 SACCHI». Senza questo, cinque sacchi
 * di farina restano cinque pezzi e la riga si ferma: la persona deve battere
 * 25000 a mano ogni volta, e se non lo fa il prezzo non entra.
 *
 * Due paletti, perché la differenza fra leggere e indovinare sta lì:
 *
 *   1. **Ci vuole un'unità di peso scritta.** «CARTONE DA 12» sono dodici
 *      pezzi di qualcosa, non dodici grammi: nessun peso, riga ferma.
 *   2. **Quello che si deduce si scrive in chiaro** nella spiegazione, con il
 *      pezzo di testo da cui arriva, e la schermata lo segnala come «da
 *      controllare». Un conto dedotto e mostrato si contesta; uno dedotto e
 *      nascosto no.
 *
 * @returns {{grammi: number, testo: string}|null}
 */
export function pesoDaDescrizione(testo, { nome = '' } = {}) {
  const t = String(testo || '').toLowerCase()
  if (!t) return null
  const perUnita = { kg: 1000, kgr: 1000, chilo: 1000, chili: 1000, g: 1, gr: 1, grammi: 1, hg: 100, etto: 100, etti: 100 }
  // «6 x 1 kg» o «1 kg x 6»: il moltiplicatore può stare da tutti e due i lati.
  const re = /(?:(\d+)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*(kgr|kg|chilo|chili|grammi|gr|g|hg|etto|etti|lt|litri|litro|l|ml|cl)\b(?:\s*[x×*]\s*(\d+))?/gi
  let scelto = null
  for (const m of t.matchAll(re)) {
    const [intero, primaN, numero, unitaTesto, dopoN] = m
    const q = leggiQuantita(numero).valore
    if (q == null || q <= 0) continue
    let grammi = null
    if (Object.prototype.hasOwnProperty.call(perUnita, unitaTesto)) {
      grammi = q * perUnita[unitaTesto]
    } else {
      // Un litro scritto nella descrizione pesa solo se sappiamo di cosa.
      const peso = pesoDiUnLitro(nome) ?? pesoDiUnLitro(t)
      if (peso == null) continue
      const litri = unitaTesto === 'ml' ? q / 1000 : unitaTesto === 'cl' ? q / 100 : q
      grammi = litri * peso
    }
    const molt = Number(primaN || dopoN)
    if (Number.isFinite(molt) && molt > 0) grammi *= molt
    if (grammi > 0) scelto = { grammi, testo: intero.trim() }
  }
  return scelto
}

/**
 * Quanti grammi sono, davvero.
 *
 * @param {number|string} quantita  quanto ne è arrivato, nell'unità del fornitore
 * @param {string} unita            l'unità come sta scritta sulla bolla
 * @param {object} [opts]
 * @param {string} [opts.nome]             serve per il peso di un litro
 * @param {number|string} [opts.pesoConfezioneG]  quanto pesa UN pezzo/sacco/cartone
 * @param {string} [opts.descrizione]      la riga come sta scritta, per leggere il formato
 * @returns {{grammi: number|null, quantita: number|null, spiegazione: string,
 *            problema: string|null, ambiguo: boolean, avvisi: string[]}}
 */
export function inGrammi(quantita, unita, { nome = '', pesoConfezioneG = null, descrizione = '' } = {}) {
  const avvisi = []
  const letta = leggiQuantita(quantita)
  const q = letta.valore
  const vuoto = { grammi: null, quantita: null, spiegazione: '', ambiguo: false, avvisi }
  if (q == null) {
    return { ...vuoto, problema: `quantità non leggibile: «${quantita}»` }
  }
  if (q < 0) {
    // Una quantità in meno è un reso o una nota di credito, non una consegna:
    // se entrasse così com'è, la merce resa verrebbe **caricata** invece che
    // scaricata. In produzione il 21/09/2026 sono 4 documenti su 3520 (0,11%).
    return { ...vuoto, problema: 'quantità negativa: è un reso o una nota di credito, non una consegna' }
  }
  if (q === 0) {
    return { ...vuoto, problema: 'riga a quantità zero: non c\'è niente da caricare' }
  }
  const u = normalizzaUnita(unita)
  if (!u) {
    return { ...vuoto, quantita: q, problema: `unità di misura sconosciuta: «${unita}»` }
  }
  const base = { quantita: q, problema: null, ambiguo: letta.ambiguo, avvisi }
  if (letta.ambiguo) {
    // L'unico caso incerto è «1.250»: punto solo, tre cifre dopo. Letto
    // all'italiana fa milleduecentocinquanta, copiato da un gestionale in
    // inglese fa 1,25. Fra i due c'è un fattore mille sul prezzo al chilo.
    avvisi.push(`la quantità «${quantita}» si può leggere ${fmt(q)} (le migliaia all'italiana) oppure ${fmt(Number(quantita))}: controlla quale delle due`)
  }
  if (u === 'kg') return { ...base, grammi: q * 1000, spiegazione: `${fmt(q)} kg` }
  if (u === 'g')  return { ...base, grammi: q, spiegazione: `${fmt(q)} g` }
  if (u === 'hg') return { ...base, grammi: q * 100, spiegazione: `${fmt(q)} hg = ${fmt(q / 10)} kg` }

  if (u === 'l' || u === 'ml' || u === 'cl') {
    const litri = u === 'l' ? q : u === 'cl' ? q / 100 : q / 1000
    const peso = pesoDiUnLitro(nome)
    if (peso == null) {
      return {
        ...vuoto, quantita: q, ambiguo: letta.ambiguo,
        problema: `${fmt(litri)} l di «${nome}»: non so quanto pesa un litro, quindi non calcolo il prezzo al chilo`,
      }
    }
    return {
      ...base,
      grammi: litri * peso,
      spiegazione: `${fmt(litri)} l × ${fmt(peso / 1000)} kg/l = ${fmt(litri * peso / 1000)} kg`,
    }
  }

  // Pezzi, confezioni, sacchi, cartoni: senza il peso di uno non si va da
  // nessuna parte. È il caso più frequente sulle bolle vere («5 SACCHI FARINA
  // 00 25KG»), e l'unico modo di sbagliarlo di venticinque volte.
  // Il peso di una confezione si scrive anche a mano, e a mano si scrive
  // all'italiana: «25.000» sono venticinquemila grammi, non venticinque. È lo
  // stesso punto incerto della quantità, quindi si dichiara allo stesso modo
  // invece di scegliere di nascosto: fra i due c'è un fattore mille sul
  // prezzo al chilo.
  const lettoPeso = leggiQuantita(pesoConfezioneG)
  let pc = lettoPeso.valore
  if (lettoPeso.ambiguo && pc > 0) {
    avvisi.push(`il peso di una confezione «${pesoConfezioneG}» si può leggere ${fmt(pc)} g (le migliaia all'italiana) oppure ${fmt(Number(pesoConfezioneG))} g: controlla quale dei due`)
  }
  if (pc == null || pc <= 0) {
    // Il peso scritto nella descrizione, se c'è: letto, non indovinato, e
    // dichiarato qui sotto nella spiegazione.
    const dalTesto = pesoDaDescrizione(descrizione || nome, { nome })
    if (dalTesto) {
      pc = dalTesto.grammi
      avvisi.push(`il peso di una confezione l'ho letto da «${dalTesto.testo}»: ${fmt(pc / 1000)} kg. Se non è così, scrivilo tu`)
    }
  }
  if (pc == null || pc <= 0) {
    return {
      ...vuoto, quantita: q, ambiguo: letta.ambiguo,
      problema: `${fmt(q)} ${q === 1 ? 'pezzo' : 'pezzi'}: manca il peso di uno, scrivilo tu`,
    }
  }
  return {
    ...base,
    ambiguo: letta.ambiguo || lettoPeso.ambiguo,
    grammi: q * pc,
    spiegazione: `${fmt(q)} × ${fmt(pc / 1000)} kg = ${fmt(q * pc / 1000)} kg`,
  }
}

/**
 * Numero all'italiana, senza zeri inutili in coda.
 *
 * ── Il difetto del 21/09/2026 ─────────────────────────────────────────────
 *
 * Gli zeri «inutili» si tolgono solo **dopo la virgola**. Qui si toglievano
 * anche prima: `25000` diventava `25`, `1250` diventava `125`, `110`
 * diventava `11`. Ed è la funzione con cui questo file scrive tutte le
 * spiegazioni e tutti gli avvisi, cioè i numeri che una persona legge per
 * decidere se il conto è giusto: l'avviso sul peso del sacco avrebbe detto
 * «si può leggere 25 g oppure 25 g».
 *
 * E già che si passa di qui, le migliaia prendono il punto italiano, come su
 * tutte le altre schermate: `25.000 g`.
 */
function fmt(n) {
  if (!Number.isFinite(n)) return '—'
  const s = Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(3)
  const pulito = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
  const [intero, decimali] = pulito.split('.')
  const conMigliaia = Number(intero).toLocaleString('it-IT', {
    useGrouping: 'always', maximumFractionDigits: 0,
  })
  return decimali ? `${conMigliaia},${decimali}` : conMigliaia
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
  const conv = inGrammi(riga.quantita, riga.unita, {
    nome: riga.nome, pesoConfezioneG: riga.pesoConfezioneG, descrizione: riga.descrizione,
  })
  const { grammi, spiegazione: comeKg, problema } = conv
  const avvisi = [...conv.avvisi]
  // La quantità l'ha già letta `inGrammi`, con la regola italiana: qui si
  // riusa **quel** numero. Rileggerlo con un `Number()` nudo vorrebbe dire
  // due letture diverse dello stesso dato nella stessa funzione — il prezzo
  // unitario moltiplicato per 1,25 e i chili contati per 1.250.
  const q = conv.quantita
  if (comeKg) spiegazione.push(comeKg)
  if (problema) return { prezzoKg: null, grammi: null, spiegazione, problema, ambiguo: conv.ambiguo, avvisi }

  // ── Quanto costa in tutto quella riga, senza IVA ────────────────────────
  let imponibile = null
  let ambiguo = conv.ambiguo

  // Una nota di credito o un reso porta gli importi col meno davanti. Non è
  // un prezzo di acquisto: se la riga entrasse, la merce resa verrebbe
  // caricata e il prezzo al chilo verrebbe da un documento che va nell'altro
  // verso. Si ferma qui, e lo dice con il suo nome.
  if (negativo(riga.imponibile) || negativo(riga.totaleConIva) || negativo(riga.prezzoUnitario)) {
    return {
      prezzoKg: null, grammi: null, spiegazione,
      problema: 'importo negativo: è una nota di credito o un reso, non una consegna',
      ambiguo, avvisi,
    }
  }

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
      return { prezzoKg: null, grammi, spiegazione, problema: 'il totale della riga non si legge', ambiguo, avvisi }
    }
    if (!Number.isFinite(aliq) || aliq < 0 || aliq > 100) {
      return {
        prezzoKg: null, grammi, spiegazione,
        problema: 'c\'è solo il totale con IVA e non si sa l\'aliquota: il prezzo non si può ricavare',
        ambiguo, avvisi,
      }
    }
    imponibile = lordo.valore / (1 + aliq / 100)
    ambiguo = ambiguo || lordo.ambiguo
    spiegazione.push(`${fmt(lordo.valore)} € con IVA al ${fmt(aliq)}% = ${fmt(imponibile)} € imponibile`)
  }

  // Il prezzo unitario di listino: serve come ripiego quando il totale di
  // riga non c'è, **e come controprova** quando c'è.
  const unit = riga.prezzoUnitario != null && riga.prezzoUnitario !== ''
    ? letturaPrezzoKg(riga.prezzoUnitario) : null
  const sconto = Number(riga.scontoPct)
  const conSconto = Number.isFinite(sconto) && sconto > 0 && sconto < 100

  if (imponibile == null && unit) {
    if (unit.valore == null) {
      return { prezzoKg: null, grammi, spiegazione, problema: 'il prezzo unitario non si legge', ambiguo, avvisi }
    }
    ambiguo = ambiguo || unit.ambiguo
    imponibile = unit.valore * q
    spiegazione.push(`${fmt(unit.valore)} € × ${fmt(q)} = ${fmt(imponibile)} €`)
    if (conSconto) {
      imponibile = imponibile * (1 - sconto / 100)
      spiegazione.push(`meno ${fmt(sconto)}% di sconto = ${fmt(imponibile)} €`)
    }
  } else if (unit?.valore != null && imponibile != null) {
    // ── L'imponibile che non torna: difetto del 21/09/2026 ────────────────
    //
    // Quando sulla riga ci sono tutti e due i numeri, uno controlla l'altro e
    // non costa niente farlo. Prima non si guardava: una riga con 10 kg a
    // 10,00 €/kg e l'imponibile letto «1.000,00» invece di «100,00» dava
    // 100 €/kg — dieci volte — e passava in silenzio, perché presa da sola
    // ogni cifra era plausibile.
    //
    // L'imponibile resta quello che vince (è quello che paghi davvero), ma
    // se i due numeri litigano di brutto la schermata lo deve dire.
    const atteso = unit.valore * q * (conSconto ? 1 - sconto / 100 : 1)
    if (atteso > 0) {
      const scarto = Math.abs(imponibile - atteso) / atteso
      if (scarto > SOGLIA_SCOSTAMENTO) {
        avvisi.push(
          `l'imponibile di riga (${fmt(imponibile)} €) non torna con ${fmt(unit.valore)} € × ${fmt(q)}${conSconto ? ` meno ${fmt(sconto)}%` : ''} = ${fmt(atteso)} €. ` +
          'Uso l\'imponibile, ma uno dei due numeri è letto male: controlla',
        )
      } else if (scarto > 0.02) {
        // Fra il 2% e il 50% è quasi sempre uno sconto di riga stampato
        // altrove: si scrive nel conto, senza allarmare.
        spiegazione.push(`(a listino sarebbero ${fmt(atteso)} €: sulla riga c'è ${fmt(imponibile)} €)`)
      }
    }
  }

  if (imponibile == null) {
    return { prezzoKg: null, grammi, spiegazione, problema: 'su questa riga non c\'è nessun prezzo', ambiguo, avvisi }
  }
  if (!(imponibile > 0)) {
    // Un omaggio o una riga a zero non è un prezzo: se entrasse porterebbe a
    // zero il costo di quella materia prima in tutte le ricette.
    return { prezzoKg: null, grammi, spiegazione, problema: 'riga a zero euro: è un omaggio, non un prezzo', ambiguo, avvisi }
  }

  const prezzoKg = imponibile / (grammi / 1000)
  spiegazione.push(`${fmt(imponibile)} € ÷ ${fmt(grammi / 1000)} kg = ${fmt(prezzoKg)} €/kg`)
  return { prezzoKg: arrotonda(prezzoKg, 4), grammi, spiegazione, problema: null, ambiguo, avvisi }
}

/** Un importo scritto col meno davanti: nota di credito, reso, storno. */
function negativo(v) {
  if (typeof v === 'number') return v < 0
  return /^\s*[-−]/.test(String(v ?? ''))
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
    // ── Che riga è, prima di ogni conto ───────────────────────────────────
    //
    // Sulle bolle vere ci sono cinque specie di righe oltre alla merce, e
    // ognuna fa un danno diverso se trattata come un acquisto normale: un
    // campione a 0,001 €/kg azzera il listino, un reso viene caricato invece
    // che scaricato, una frase pubblicitaria diventa una materia prima nuova.
    // Vedi `righeBolla.js` per i documenti da cui escono queste regole.
    const classe = classificaRiga(r)
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

    // Un reso non è una trattativa sul prezzo, e un campione non è un
    // prezzo: in tutti e due i casi il listino non si tocca. Il conto si fa
    // lo stesso — serve a mostrarlo a schermo — ma non diventa un'azione.
    const decisione = !classe.applicaPrezzo
      ? { azione: 'nessuna', motivo: classe.motivo }
      : conto.prezzoKg == null
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
      // Cose che il conto ha dovuto dedurre o che non tornano: si mostrano,
      // non fermano la riga. Il problema ferma, l'avviso fa guardare.
      avvisi: conto.avvisi || [],
      // Uno scostamento si misura contro un prezzo **dichiarato**. Se quello
      // di prima era una stima del prodotto, non c'è niente da cui scostarsi:
      // era già `null` per `decidiPrezzo`, e qui lo era rimasto no.
      sospetto: conto.prezzoKg != null
        && scostamentoSospetto(eraUnaStima ? null : prezzoAttuale, conto.prezzoKg),
      azione: decisione.azione,
      motivo: decisione.motivo,
      // Che specie di riga è: merce, campione, omaggio, reso, servizio,
      // rumore. La schermata mostra le prime quattro e toglie le ultime due,
      // **dicendolo**: una riga tolta in silenzio è una riga che nessuno
      // andrà mai a cercare.
      classe: classe.tipo,
      classeMotivo: classe.motivo,
      classeAvviso: classe.avviso,
      caricaMagazzino: classe.caricaMagazzino,
      segno: classe.segno,
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
  // ── Lo stesso ingrediente su due righe della stessa bolla ───────────────
  //
  // Succede davvero, e il riconoscimento della foto è scritto apposta per non
  // sommarle («due righe della stessa merce sono due consegne o due lotti, e
  // sommarle nasconderebbe un prezzo diverso»). Prima, però, la seconda riga
  // di storico diceva ancora il prezzo di listino di ieri: con farina a 0,88
  // che arriva a 1,00 e poi a 1,20 si leggeva «0,88 → 1,00» e «0,88 → 1,20»,
  // due aumenti dallo stesso punto di partenza, e la somma dei salti non
  // tornava con la differenza fra il primo e l'ultimo prezzo.
  const giaVisto = new Map()
  let n = 0

  for (const c of (cambi || [])) {
    const prezzo = Number(c?.prezzoKg)
    if (!c?.chiave || !Number.isFinite(prezzo) || prezzo <= 0) continue
    if (c.azione !== 'applica' && c.azione !== 'soloStorico') continue

    const vecchioNum = giaVisto.has(c.chiave) ? giaVisto.get(c.chiave) : Number(c.prezzoAttuale)
    // `null`, non `0`. «Prima non aveva prezzo» e «prima era gratis» sono due
    // cose diverse, e `getPrezzoStoricoKg` legge proprio questo campo per
    // ricostruire il costo di una produzione passata.
    const vecchio = Number.isFinite(vecchioNum) && vecchioNum > 0 ? vecchioNum : null
    giaVisto.set(c.chiave, prezzo)

    // Due righe identiche della stessa bolla non sono due cambi di prezzo:
    // la seconda scriverebbe una riga di storico con delta zero.
    if (vecchio != null && arrotonda(vecchio, 4) === arrotonda(prezzo, 4) && righe.some(r => r.chiave === c.chiave)) continue

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
      // L'indice nel nome: due righe della stessa materia prima nella stessa
      // bolla arrivavano nello stesso millisecondo e finivano con lo stesso
      // `id`. Un id doppio è una riga che sparisce a chi deduplica e una
      // chiave doppia per React.
      id: `lp-${Date.now()}-${n++}-${c.chiave}`,
      chiave: c.chiave,
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

  // ── La stessa bolla caricata due volte: difetto del 21/09/2026 ──────────
  //
  // L'avviso a schermo c'era già, ma era solo un avviso: il bottone
  // «Registra» restava premibile e il conto non guardava niente. Ricaricando
  // la stessa bolla la giacenza della farina passava da 25 kg a 50 kg, e
  // nello storico dei prezzi finivano due righe identiche. Succede perché la
  // foto a volte sembra non essere andata a buon fine e si rifà.
  //
  // Adesso il calcolo si ferma da solo, e non perché non si fidi della
  // schermata: perché è l'ultimo punto prima del database, e il pezzo che
  // decide dei soldi non deve dipendere da chi lo chiama. Chi vuole davvero
  // caricarla due volte lo dice con `forza: true`.
  const giaCaricata = !!documento?.identita
    && (logRif || []).some(r => r?.bolla === documento.identita)
  if (giaCaricata && documento?.forza !== true) {
    return {
      magazzino, logRif, ingredientiCosti, logPrezzi,
      caricati: 0, applicati: 0, storicizzati: 0, giaCaricata: true,
    }
  }

  // Una riga saltata a mano, o non abbinata a nessuna materia prima, non
  // entra: se entrasse si creerebbe una voce nuova nel magazzino **e nel
  // listino** partendo da un nome letto da una foto. `=== false` e `=== true`
  // apposta: chi passa righe senza questi campi (i test, un import) non
  // cambia comportamento.
  const scelte = (righe || []).filter(r => r && r.chiave && r.saltata !== true && r.esisteInElenco !== false)

  const nuovoMagazzino = { ...magazzino }
  const nuoveRighe = []
  const adesso = new Date().toISOString()
  const daDove = documento?.fornitore
    ? `bolla ${documento.fornitore}${documento?.numero ? ` n. ${documento.numero}` : ''}`
    : 'bolla'
  let n = 0

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
      // Come per lo storico: due righe della stessa merce nella stessa bolla
      // condividevano l'id, perché `Date.now()` è lo stesso millisecondo.
      id: `r-${Date.now()}-${n++}-${r.chiave}`,
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
        // L'impronta serve ad `annullaBolla` per ritrovare **quali** cambi di
        // prezzo ha fatto questa bolla. Senza, l'annullo dovrebbe indovinarlo
        // da fornitore + numero + data, e una bolla senza numero non si
        // riconoscerebbe più.
        identita: documento?.identita || null,
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
    giaCaricata,
  }
}

/**
 * Annullare una bolla registrata per sbaglio.
 *
 * Richiesta del titolare, 22/09/2026: «fai in modo che si possa annullare con
 * doppio check di sicurezza». Fino a ieri una bolla caricata sul documento
 * sbagliato si poteva solo registrare una seconda volta forzandola: la
 * giacenza restava gonfia e l'unico rimedio era la rettifica a mano, voce per
 * voce, dal magazzino.
 *
 * ── Tre cose da disfare, e tre modi diversi ─────────────────────────────
 *
 * 1. **La merce.** Si toglie esattamente quello che quella bolla aveva messo,
 *    voce per voce, leggendolo dal registro dei rifornimenti — non
 *    ricalcolandolo dalle righe della bolla, che nel frattempo potrebbero
 *    essere state corrette.
 *
 * 2. **Il registro.** Non si cancella niente: si segna la riga sbagliata come
 *    annullata e se ne scrive una **uguale e contraria**. È la convenzione che
 *    il magazzino usa già per l'annullo di una riga singola, ed è come si
 *    correggono i registri: un registro da cui si cancella non è più un
 *    registro.
 *
 * 3. **I prezzi.** Qui sta la parte delicata. Il prezzo di una materia prima
 *    torna indietro **solo se è ancora quello che quella bolla aveva messo**:
 *    se dopo la bolla qualcuno l'ha cambiato a mano, o è arrivata un'altra
 *    bolla, quel numero è più recente e più vero, e toccarlo vorrebbe dire
 *    riscrivere il food cost di tutte le ricette che usano quell'ingrediente
 *    con un prezzo di ieri. Quello che non si tocca viene **detto**, non
 *    taciuto.
 *
 * Lo storico dei prezzi non si cancella mai: si aggiunge una riga che dice
 * che quel cambio è stato annullato, così fra sei mesi si capisce perché il
 * burro è tornato a 9,00 €/kg.
 *
 * @param {string} identita  l'impronta della bolla (`identitaBolla`)
 * @param {object} stato     `{ magazzino, logRif, ingredientiCosti, logPrezzi, utente }`
 * @returns {{magazzino, logRif, ingredientiCosti, logPrezzi, tolti, prezziRimessi, prezziNonRimessi, trovata}}
 */
export function annullaBolla(identita, stato = {}) {
  const { magazzino = {}, logRif = [], ingredientiCosti = {}, logPrezzi = [], utente = null } = stato
  const vuoto = {
    magazzino, logRif, ingredientiCosti, logPrezzi,
    tolti: 0, prezziRimessi: [], prezziNonRimessi: [], trovata: false,
  }
  if (!identita) return vuoto

  const righe = (logRif || []).filter(r => r?.bolla === identita && !r?.annullata)
  const prezzi = (logPrezzi || []).filter(l => l?.origine?.identita === identita && !l?.annullata)
  if (righe.length === 0 && prezzi.length === 0) return vuoto

  const adesso = new Date().toISOString()

  // ── 1 e 2. la merce esce, e il registro se lo ricorda ──────────────────
  const nuovoMagazzino = { ...magazzino }
  const contrarie = []
  let n = 0
  for (const r of righe) {
    const g = Number(r.quantita_g) || 0
    const chiave = normIng(r.ingrediente)
    if (!chiave) continue
    const prima = nuovoMagazzino[chiave] || Object.entries(nuovoMagazzino)
      .find(([k]) => normIng(k) === chiave)?.[1]
    const raw = nuovoMagazzino[chiave] ? chiave
      : Object.keys(nuovoMagazzino).find(k => normIng(k) === chiave) || chiave
    nuovoMagazzino[raw] = {
      nome: prima?.nome || r.ingrediente,
      giacenza_g: Math.round((Number(prima?.giacenza_g) || 0) - g),
      soglia_g: prima?.soglia_g || 0,
      ultimoRifornimento: prima?.ultimoRifornimento || null,
    }
    contrarie.push({
      id: `r-ann-${Date.now()}-${n++}-${chiave}`,
      data: adesso,
      ingrediente: r.ingrediente,
      quantita_g: -g,
      note: `annullo della bolla del ${soloGiorno(r.data) || '—'}`,
      annulla_id: r.id,
      utente,
    })
  }

  // ── 3. i prezzi, solo quelli ancora suoi ───────────────────────────────
  const nuoviCosti = { ...ingredientiCosti }
  const rimessi = []
  const nonRimessi = []
  const righeStorico = []
  for (const l of prezzi) {
    const chiave = normIng(l.ingrediente)
    if (!chiave) continue
    const attuale = Number(nuoviCosti[chiave]?.costoKg)
    const messoDaLei = Number(l.prezzoNuovo)
    // Lo scarto di un millesimo: i prezzi si scrivono con quattro decimali, e
    // un confronto esatto fra numeri in virgola mobile non torna mai.
    const ancoraSuo = Number.isFinite(attuale) && Number.isFinite(messoDaLei)
      && Math.abs(attuale - messoDaLei) < 0.0005
    if (!ancoraSuo) {
      nonRimessi.push({ nome: l.ingrediente, attuale: Number.isFinite(attuale) ? attuale : null, suo: messoDaLei })
      continue
    }
    const vecchio = l.prezzoVecchio
    if (vecchio == null) {
      // Prima di quella bolla un prezzo non c'era: togliendola torna a non
      // esserci. Un prezzo inventato sarebbe peggio del buco.
      delete nuoviCosti[chiave]
    } else {
      nuoviCosti[chiave] = {
        costoKg: parseFloat(Number(vecchio).toFixed(4)),
        costoG: parseFloat((Number(vecchio) / 1000).toFixed(6)),
      }
    }
    rimessi.push({ nome: l.ingrediente, da: messoDaLei, a: vecchio })
    righeStorico.push({
      id: `lp-ann-${Date.now()}-${chiave}`,
      data: adesso,
      decorre_da: adesso,
      ingrediente: l.ingrediente,
      prezzoVecchio: messoDaLei,
      prezzoNuovo: vecchio,
      delta: vecchio == null ? null : Number(vecchio) - messoDaLei,
      deltaPct: vecchio != null && messoDaLei > 0 ? ((Number(vecchio) - messoDaLei) / messoDaLei * 100) : null,
      utente,
      origine: { tipo: 'annullo-bolla', identita, fornitore: l.origine?.fornitore || null, numero: l.origine?.numero || null },
    })
  }

  return {
    magazzino: nuovoMagazzino,
    logRif: [
      ...contrarie,
      ...(logRif || []).map(r => (r?.bolla === identita ? { ...r, annullata: true } : r)),
    ],
    ingredientiCosti: nuoviCosti,
    logPrezzi: [
      ...righeStorico,
      ...(logPrezzi || []).map(l => (l?.origine?.identita === identita ? { ...l, annullata: true } : l)),
    ],
    tolti: contrarie.length,
    prezziRimessi: rimessi,
    prezziNonRimessi: nonRimessi,
    trovata: true,
  }
}
