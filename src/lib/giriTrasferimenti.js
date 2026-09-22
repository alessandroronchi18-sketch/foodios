// Meno viaggi, più pieni, senza lasciare il banco scoperto.
//
// ── Il problema, come l'ha posto il titolare (23/09/2026) ────────────────
//
// «si perde un sacco di tempo e un sacco di risorse con i trasferimenti da
// sede. Magari i trasferimenti vengono fatti anche tutti i giorni ma solo per
// un kg di gelato o per poche materie prime.»
//
// ── Perché nascono, misurato ─────────────────────────────────────────────
//
// Mara dei Boschi non ha un laboratorio che rifornisce tre punti vendita:
// **tutte e tre le sedi producono** (verificato: `sedi.is_sede_produzione` è
// vero per Carlina, Berthollet e De Gasperi). Quindi un viaggio nasce da uno
// squilibrio fra quello che un negozio ha fatto e quello che vende. Tre
// cause, e solo una è inevitabile:
//
//   1. un negozio ha prodotto poco → errore di previsione
//   2. un altro ha prodotto troppo → errore di previsione
//   3. **quel gusto si fa solo lì**, e poi si smista → strutturale
//
// Sul punto 3 il titolare: «magari un gusto lo si fa solo in un posto tipo
// Carlina e poi lo si smista». Quei viaggi ci saranno sempre — ma sono
// **prevedibili**, e un viaggio prevedibile non è un'emergenza: si decide
// quando si produce, e parte col giro fisso.
//
// ── Il conto che spiega perché sembra assurdo e continua a succedere ─────
//
// Un chilo di gelato sono circa otto coni: non portarlo costa 30-40 € fra
// margine perso e prodotto buttato. Il viaggio costa 40-60 minuti più una
// persona tolta dal banco. **Siamo quasi in pareggio**, ed è per questo che
// ogni singolo viaggio, preso da solo, è giustificabile — e intanto se ne
// fanno trecento all'anno.
//
// Si vince facendo **meno viaggi più pieni**, non scegliendo meglio viaggio
// per viaggio.
//
// ── Le regole scelte dal titolare ────────────────────────────────────────
//
//   • **giorni fissi**, e in mezzo si esce solo se un gusto finisce davvero
//     (risposta 2b);
//   • **chi guida non sempre ci andrebbe comunque** («non sempre»): quindi il
//     costo di un viaggio non è una costante. Quando qualcuno sta già
//     andando, la soglia non conta e si porta tutto quello che è in lista;
//     quando bisogna uscire apposta, si chiede se ne vale la pena.
//
// E una cosa che si vede dagli indirizzi: Carlina (Piazza Carlo Emanuele II)
// e Berthollet (Via Berthollet 30) sono a pochi minuti a piedi; De Gasperi è
// dall'altra parte della città. Le coppie non costano uguale, e questa
// libreria non pretende che costino uguale: il costo di ogni tratta si
// dichiara.

/** I giorni della settimana come li conta `Date`: 0 domenica … 6 sabato. */
export const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

/** Quanto pesa un viaggio, se nessuno lo dichiara: mezz'ora di lavoro. */
export const MINUTI_VIAGGIO = 45

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** «AAAA-MM-GG» → il giorno della settimana, senza passare per i fusi. */
function giornoSettimana(giorno) {
  const m = String(giorno || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()
}

function piuGiorni(giorno, n) {
  const m = String(giorno || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Quando passa il prossimo giro.
 *
 * @param {string} oggi    «AAAA-MM-GG»
 * @param {number[]} giorni  i giorni fissi, 0 domenica … 6 sabato
 * @param {boolean} [oggiVale]  se oggi è giorno di giro, conta oggi
 * @returns {{giorno: string, fraQuanti: number, nome: string}|null}
 */
export function prossimoGiro(oggi, giorni, opzioni) {
  const { oggiVale = true } = opzioni || {}
  const validi = [...new Set((Array.isArray(giorni) ? giorni : [])
    .map(g => num(g)).filter(g => g != null && g >= 0 && g <= 6))]
  const oggiG = giornoSettimana(oggi)
  if (!validi.length || oggiG == null) return null
  for (let i = oggiVale ? 0 : 1; i <= 7; i++) {
    const g = (oggiG + i) % 7
    if (validi.includes(g)) {
      return { giorno: piuGiorni(oggi, i), fraQuanti: i, nome: GIORNI[g] }
    }
  }
  return null
}

/**
 * Per quanti giorni basta quello che c'è.
 *
 * `null` quando il consumo non si sa: «non lo so» e «finisce oggi» sono due
 * cose diverse, e confonderle qui vuol dire o far uscire il furgone per
 * niente o lasciare il banco vuoto.
 */
export function giorniDiCopertura(riga) {
  const { giacenza, consumoGiornaliero } = riga && typeof riga === 'object' ? riga : {}
  const g = num(giacenza)
  const c = num(consumoGiornaliero)
  if (g == null || c == null || c <= 0) return null
  return g <= 0 ? 0 : g / c
}

/**
 * Questa richiesta può aspettare il prossimo giro?
 *
 * @returns {{aspetta: boolean|null, copre: number|null, perche: string}}
 *   `aspetta: null` vuol dire «non lo so», e chi mostra il dato lo deve dire.
 */
export function puoAspettare(richiesta, giro) {
  const copre = giorniDiCopertura(richiesta || {})
  const fra = giro?.fraQuanti
  if (copre == null) {
    return {
      aspetta: null, copre: null,
      perche: 'non so quanto se ne consuma qui: dimmelo tu se può aspettare',
    }
  }
  if (fra == null) {
    return { aspetta: null, copre, perche: 'non c’è nessun giro fisso impostato' }
  }
  if (copre <= 0) {
    return { aspetta: false, copre, perche: 'è già finito' }
  }
  // Il margine di un giorno non è prudenza generica: è il tempo che passa fra
  // «lo vedo scendere» e «il banco è vuoto a metà pomeriggio», che è quando
  // il danno si fa davvero.
  const aspetta = copre >= fra + 1
  return {
    aspetta,
    copre,
    perche: aspetta
      ? `copre ancora ${arrotonda(copre)} ${arrotonda(copre) === 1 ? 'giorno' : 'giorni'}, e il giro passa fra ${fra === 0 ? 'oggi' : `${fra} ${fra === 1 ? 'giorno' : 'giorni'}`}`
      : `copre ${arrotonda(copre)} ${arrotonda(copre) === 1 ? 'giorno' : 'giorni'} e il giro passa fra ${fra}: non ci arriva`,
  }
}

const arrotonda = (n) => Math.max(0, Math.round(n))

/**
 * Cosa fare adesso, vista tutta la lista che si è accumulata.
 *
 * Due situazioni diverse, e il titolare ha detto che capitano tutt'e due
 * («non sempre» ci andrebbe comunque):
 *
 *   • **qualcuno sta già andando** — allora non c'è nessuna soglia da
 *     superare: si porta tutto quello che è in lista, anche il mezzo chilo,
 *     perché il viaggio lo si fa lo stesso;
 *   • **bisogna uscire apposta** — allora si esce solo per quello che non
 *     arriva al prossimo giro, e si dice quanto vale.
 *
 * @param {Array}  richieste  `[{ prodotto, quantita, unita, valore, giacenza, consumoGiornaliero }]`
 * @param {object} ctx
 * @param {object} [ctx.giro]          da `prossimoGiro`
 * @param {boolean} [ctx.staGiaAndando]
 * @param {number} [ctx.minutiViaggio]
 * @returns {{azione: 'porta-tutto'|'esci-adesso'|'aspetta'|'niente',
 *            urgenti: Array, rimandabili: Array, incerte: Array,
 *            valoreUrgente: number|null, frase: string}}
 */
export function decidiGiro(richieste, ctx) {
  // `= {}` vale solo per `undefined`: un `null` passato apposta lo scavalca e
  // la destrutturazione esplode. Arriva davvero, da uno stato non ancora
  // caricato.
  const { giro = null, staGiaAndando = false, minutiViaggio = MINUTI_VIAGGIO } = ctx || {}
  const elenco = (Array.isArray(richieste) ? richieste : []).filter(Boolean)
  if (!elenco.length) {
    return { azione: 'niente', urgenti: [], rimandabili: [], incerte: [], valoreUrgente: null, frase: 'Non c’è niente in lista.' }
  }

  const urgenti = []
  const rimandabili = []
  const incerte = []
  for (const r of elenco) {
    const d = puoAspettare(r, giro)
    const conNota = { ...r, ...d }
    if (d.aspetta === null) incerte.push(conNota)
    else if (d.aspetta) rimandabili.push(conNota)
    else urgenti.push(conNota)
  }

  const conValore = urgenti.filter(r => num(r.valore) != null)
  const valoreUrgente = conValore.length === urgenti.length && urgenti.length
    ? conValore.reduce((s, r) => s + num(r.valore), 0)
    : null

  if (staGiaAndando) {
    const n = elenco.length
    return {
      azione: 'porta-tutto', urgenti, rimandabili, incerte, valoreUrgente,
      frase: `Stai andando: porta tutto, ${n} ${n === 1 ? 'cosa' : 'cose'}. Il viaggio lo fai comunque, quindi anche il mezzo chilo conviene.`,
    }
  }

  if (urgenti.length) {
    const quanto = valoreUrgente != null
      ? ` per ${valoreUrgente.toLocaleString('it-IT', { maximumFractionDigits: 0 })} € di merce`
      : ''
    return {
      azione: 'esci-adesso', urgenti, rimandabili, incerte, valoreUrgente,
      frase: `${urgenti.length} ${urgenti.length === 1 ? 'cosa non arriva' : 'cose non arrivano'} al prossimo giro${quanto}: conviene uscire, e già che vai porta anche il resto (${rimandabili.length + incerte.length} in lista).`,
    }
  }

  // Senza giri fissi tutto finisce fra le «incerte», ma la causa è una sola
  // e non è il consumo: è che non c'è nessun giro. Dire «non so quanto se ne
  // consuma» manderebbe a contare la vetrina chi invece deve solo scegliere
  // due giorni sul calendario.
  const q = elenco.length
  if (!giro) {
    return {
      azione: 'aspetta', urgenti, rimandabili, incerte, valoreUrgente,
      frase: `${q} ${q === 1 ? 'cosa in lista' : 'cose in lista'}. Imposta i giorni del giro e ti dico quando conviene partire.`,
    }
  }

  if (incerte.length && !rimandabili.length) {
    return {
      azione: 'aspetta', urgenti, rimandabili, incerte, valoreUrgente,
      frase: `Di ${incerte.length === 1 ? 'questa cosa' : `queste ${incerte.length} cose`} non so quanto se ne consuma qui: dimmi tu se possono aspettare ${giro.nome}.`,
    }
  }

  return {
    azione: 'aspetta', urgenti, rimandabili, incerte, valoreUrgente,
    frase: `${q} ${q === 1 ? 'cosa può aspettare' : 'cose possono aspettare'} ${giro.nome}: uscire adesso costa ${minutiViaggio} minuti e non serve a niente.`,
  }
}

/**
 * Il gusto che si fa in un posto solo, diviso fra i negozi quando si produce.
 *
 * È il caso strutturale: «un gusto lo si fa solo in un posto tipo Carlina e
 * poi lo si smista». Deciderlo **quando si produce** è quello che toglie i
 * viaggi: la roba parte già divisa e viaggia col giro fisso, invece di
 * generare una corsa il giorno che un banco resta vuoto.
 *
 * Le quote sono pesi relativi, non percentuali: si scrivono come vengono
 * («Carlina 5, Berthollet 3, De Gasperi 2») e il conto le normalizza.
 *
 * @returns {{per: Array<{sedeId, quota, quantita}>, resto: number}}
 *   `resto` è quello che avanza dall'arrotondamento e resta dove si produce:
 *   spartirlo avrebbe voluto dire inventare grammi che nessuno pesa.
 */
export function dividiProduzione(totale, quote, opzioni) {
  const { passo = 0.1 } = opzioni || {}
  const tot = num(totale)
  const righe = (Array.isArray(quote) ? quote : []).filter(q => q && q.sedeId && num(q.quota) > 0)
  if (tot == null || tot <= 0 || !righe.length) return { per: [], resto: tot == null ? 0 : Math.max(0, tot) }
  const somma = righe.reduce((s, q) => s + num(q.quota), 0)
  const p = num(passo) > 0 ? num(passo) : 0.1
  let dato = 0
  const per = righe.map(q => {
    const esatta = tot * (num(q.quota) / somma)
    // Si arrotonda **in giù** al passo pratico: mezzo etto in più a un
    // negozio è mezzo etto in meno a un altro, e chi lo pesa se ne accorge.
    const quantita = Math.floor(esatta / p) * p
    dato += quantita
    return { sedeId: q.sedeId, quota: num(q.quota), quantita: parseFloat(quantita.toFixed(3)) }
  })
  return { per, resto: parseFloat(Math.max(0, tot - dato).toFixed(3)) }
}

// ── Già che vai da quella parte ─────────────────────────────────────────
//
// Il titolare, 23/09/2026: «magari il negozio che rifornisce un ingrediente
// si trova vicino a De Gasperi, quindi uno esce a consegnare e nel frattempo
// compra la materia prima».
//
// È il risparmio più grosso di tutta questa storia — il viaggio si fa
// comunque — ed è anche il più facile da perdere: se nessuno se lo ricorda
// **al momento giusto**, si fa due volte la stessa strada in due giorni.
//
// Foodos lo sa perché lo sa già: i fornitori hanno il campo «da quale sede si
// passa comodi», e gli ordini mandati e non ancora arrivati sono in tabella.
// Qui si mettono insieme.

/**
 * Cosa c'è da ritirare, andando in quella sede.
 *
 * Un fornitore entra solo se **tutte e tre** le cose sono vere: si passa di
 * lì, da lui si ritira (se consegna lui, passare è un giro in più per
 * niente), e c'è qualcosa da prendere. Due su tre non bastano: ognuna delle
 * tre, da sola, manderebbe qualcuno a vuoto.
 *
 * @param {string} sedeId    dove si sta andando
 * @param {Array}  fornitori `[{ id, nome, vicino_a_sede, si_ritira, telefono }]`
 * @param {Array}  ordini    `[{ fornitore_id, stato, ... }]` gli ordini aperti
 * @returns {{tappe: Array, frase: string|null}}
 */
export function ritiriSullaStrada(sedeId, fornitori, ordini) {
  const sede = String(sedeId || '')
  if (!sede) return { tappe: [], frase: null }

  const aperti = new Map()
  for (const o of (Array.isArray(ordini) ? ordini : [])) {
    // «Inviato» vuol dire chiesto e non ancora arrivato: è quello che si può
    // andare a prendere. Un ordine ricevuto è già a casa, una bozza non è
    // mai stata chiesta a nessuno.
    if (!o?.fornitore_id || o?.stato !== 'inviato') continue
    const k = String(o.fornitore_id)
    aperti.set(k, (aperti.get(k) || 0) + 1)
  }

  const tappe = []
  for (const f of (Array.isArray(fornitori) ? fornitori : [])) {
    if (!f?.id || String(f.vicino_a_sede || '') !== sede) continue
    if (f.si_ritira !== true) continue
    const quanti = aperti.get(String(f.id)) || 0
    if (!quanti) continue
    tappe.push({
      fornitoreId: String(f.id),
      nome: f.nome || 'fornitore',
      telefono: f.telefono || null,
      ordini: quanti,
    })
  }
  tappe.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))

  if (!tappe.length) return { tappe: [], frase: null }
  const nomi = tappe.map(t => t.nome).join(', ')
  return {
    tappe,
    frase: tappe.length === 1
      ? `Già che vai da quella parte: da ${nomi} c'è un ordine pronto da ritirare.`
      : `Già che vai da quella parte: ci sono ordini pronti da ${nomi}.`,
  }
}
