// ── I prezzi delle materie prime, dalle righe delle fatture ──────────────
//
// Ottobre 2026. Il titolare sta caricando gli ZIP dell'Agenzia delle Entrate:
// tremila fatture passive 2024-2026 ricevono il dettaglio riga per riga —
// prodotto, quantità, unità, prezzo. La pagina Integrazioni prometteva già
// che da lì sarebbero usciti i prezzi delle materie prime. **Nessuna parte
// del prodotto li leggeva.**
//
// Scelta del titolare: «abbini una volta». La stessa merce torna fattura dopo
// fattura con la stessa descrizione dello stesso fornitore: si abbina quella
// coppia a una materia prima una volta sola (o si dice «non è una materia
// prima», e non ricompare), e da lì in poi ogni fattura aggiorna listino e
// storico da sé.
//
// Qui c'è solo il conto, senza schermo e senza database. Il motore è quello
// delle bolle (`bolle.js`), non un secondo:
//
//   • il prezzo al chilo di una riga lo fa `prezzoAlKgDaRiga`, con la sua
//     spiegazione e i suoi problemi — un prezzo che non si sa non è zero;
//   • che riga è (trasporto, campione, reso, testo) lo dice `classificaRiga`;
//   • se un prezzo cambia il listino o scrive solo lo storico lo decide
//     `decidiPrezzo`, e lo scrive `applicaCambiAlListino`;
//   • uno scostamento oltre il 50% (`scostamentoSospetto`) non si applica da
//     solo: va confermato.
//
// Le regole in più, che le fatture portano e le bolle no:
//
//   1. **Tre anni in un colpo.** Le fatture vecchie ricostruiscono lo storico
//      (`soloStorico`), e solo quelle più recenti dell'ultimo cambio toccano
//      il prezzo di oggi. Nello storico entra una riga **solo quando il prezzo
//      cambia**: cento consegne allo stesso prezzo sono una riga, non cento.
//   2. **Riapplicare non doppia niente.** Ogni riga di storico porta la sua
//      fattura (`origine`); se quella fattura per quella materia prima è già
//      passata, si salta.
//   3. **Le note di credito non sono prezzi d'acquisto.** Né le righe a zero
//      o in negativo (sconti, abbuoni, omaggi).
import {
  prezzoAlKgDaRiga, decidiPrezzo, applicaCambiAlListino, scostamentoSospetto,
  ultimiCambi, soloGiorno, tagliaStorico,
} from './bolle'
import { classificaRiga } from './righeBolla'
import { normFornitore, normNumero } from './completaFatture'
import { normIng, getPrezzoStoricoKg } from './foodcost'

// ── La mappa degli abbinamenti ──────────────────────────────────────────
//
// Una per azienda, come il listino. Forma:
//
//   { versione: 1,
//     gruppi:   { [chiaveGruppo]: { tipo: 'materia', chiave, nome, pesoConfezioneG? }
//                               | { tipo: 'no' } },
//     ignorate: { [idAcquisto]: { il, utente } } }
//
// `ignorate` sono i prezzi sospetti che il titolare ha guardato e scartato:
// senza, tornerebbero a chiedere conferma a ogni fattura caricata.

/** La mappa com'è salvata, ripulita: un valore storto vale «vuota». */
export function leggiAbbinamenti(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const oggetto = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? { ...x } : {})
  return { versione: 1, gruppi: oggetto(o.gruppi), ignorate: oggetto(o.ignorate) }
}

/**
 * La mappa con un abbinamento in più (o in meno, con `valore` null).
 * Non tocca quella che riceve.
 */
export function abbina(abbinamenti, chiave, valore, { utente = null, adesso = new Date().toISOString() } = {}) {
  const m = leggiAbbinamenti(abbinamenti)
  if (!chiave) return m
  if (valore == null) { delete m.gruppi[chiave]; return m }
  if (valore.tipo === 'materia') {
    const nome = String(valore.nome || '').trim()
    const k = valore.chiave || normIng(nome)
    if (!k) return m
    const pc = Number(valore.pesoConfezioneG)
    m.gruppi[chiave] = {
      tipo: 'materia', chiave: k, nome: nome || k,
      ...(Number.isFinite(pc) && pc > 0 ? { pesoConfezioneG: pc } : null),
      il: adesso, utente,
    }
  } else {
    m.gruppi[chiave] = { tipo: 'no', il: adesso, utente }
  }
  return m
}

/** La mappa con un prezzo sospetto messo da parte, o rimesso in lista. */
export function ignoraAcquisto(abbinamenti, idAcquisto, { utente = null, adesso = new Date().toISOString(), togli = false } = {}) {
  const m = leggiAbbinamenti(abbinamenti)
  if (!idAcquisto) return m
  if (togli) delete m.ignorate[idAcquisto]
  else m.ignorate[idAcquisto] = { il: adesso, utente }
  return m
}

// ── Le chiavi ───────────────────────────────────────────────────────────

/**
 * La descrizione come si confronta: minuscole, niente accenti né
 * punteggiatura. Le cifre restano: «sacco 25 kg» e «sacco 10 kg» sono due
 * merci diverse.
 */
export function normDescrizione(d) {
  return String(d ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Fornitore + descrizione: la coppia che si abbina una volta. */
export function chiaveGruppo(fornitore, descrizione) {
  const f = normFornitore(fornitore)
  const d = normDescrizione(descrizione)
  if (!f || !d) return null
  return `${f}|${d}`
}

/**
 * La fattura come documento, per riconoscerla nello storico. Senza numero o
 * senza data non si inventa: `null`, e quella fattura non scrive prezzi.
 */
function identitaFattura({ fornitore, numero, data } = {}) {
  const n = normNumero(numero)
  const g = soloGiorno(data)
  if (!n || !g) return null
  return `fattura|${normFornitore(fornitore)}|${n}|${g}`
}

/**
 * È una nota di credito? Lo dice il tipo del documento (TD04/TD08), oppure il
 * totale negativo: le note di credito entrate dall'Excel di WebDesk hanno il
 * tipo «fattura» e il totale col meno (4 su 3.104 nei dati veri, 03/10/2026).
 */
export function eNotaDiCredito(f) {
  if (f?.tipo === 'nota_credito') return true
  const t = Number(f?.totale)
  return Number.isFinite(t) && t < 0
}

// ── Il conto di una riga ────────────────────────────────────────────────

/**
 * Il prezzo al chilo di una riga di fattura elettronica, col motore delle
 * bolle. Il nome della materia prima abbinata serve al peso di un litro
 * («latte» pesa 1,03 kg/l); il peso di un pezzo, se il titolare l'ha scritto
 * abbinando, serve alle righe a pezzi.
 */
export function contoRigaFattura(riga = {}, abbinamento = null) {
  const materia = abbinamento?.tipo === 'materia' ? abbinamento : null
  const pc = Number(materia?.pesoConfezioneG)
  const descrizione = String(riga?.descrizione || '')
  const perConto = {
    nome: materia?.nome || descrizione,
    descrizione,
    quantita: riga?.quantita,
    unita: riga?.unita,
    imponibile: riga?.totale,
    prezzoUnitario: riga?.prezzo_unitario,
    aliquotaIva: riga?.iva_pct,
    pesoConfezioneG: Number.isFinite(pc) && pc > 0 ? pc : null,
  }
  // Che riga è lo dice il testo della fattura, non il nome che le abbiamo dato.
  const classe = classificaRiga({ ...perConto, nome: descrizione, descrizione: '' })
  const vuoto = { prezzoKg: null, grammi: null, spiegazione: [], avvisi: [], ambiguo: false, classe }
  if (riga?.quantita == null || riga?.quantita === '') return { ...vuoto, problema: 'sulla riga della fattura manca la quantità' }
  if (!String(riga?.unita ?? '').trim()) return { ...vuoto, problema: 'sulla riga della fattura manca l\'unità di misura' }
  return { ...prezzoAlKgDaRiga(perConto), classe }
}

/** Una riga che è un acquisto: importo maggiore di zero e una descrizione. */
function eAcquisto(riga) {
  const t = Number(riga?.totale)
  return Number.isFinite(t) && t > 0 && !!normDescrizione(riga?.descrizione)
}

// ── Le materie prime che esistono oggi ──────────────────────────────────
//
// Un abbinamento punta a una chiave del listino. Se quella materia prima nel
// frattempo è stata rinominata o eliminata, scriverle un prezzo vorrebbe dire
// farla **rinascere** nel listino col nome vecchio — un doppione col prezzo
// giusto, mentre quella vera resta ferma. Quindi un abbinamento a una materia
// prima che non c'è più non scrive niente, e il gruppo torna da abbinare.

/** Le chiavi delle materie prime: quelle del listino e quelle dentro le ricette. */
export function chiaviMaterie(ricettario) {
  const s = new Set(Object.keys(ricettario?.ingredienti_costi || {}).map(k => normIng(k)).filter(Boolean))
  for (const r of Object.values(ricettario?.ricette || {})) {
    for (const ing of (Array.isArray(r?.ingredienti) ? r.ingredienti : [])) {
      const k = normIng(ing?.nome || '')
      if (k) s.add(k)
    }
  }
  return s
}

/** `chiaviValide` null vuol dire «non lo so»: allora si dà per buona. */
function materiaEsiste(abb, chiaviValide) {
  return !(chiaviValide instanceof Set) || chiaviValide.has(abb.chiave)
}

// ── I gruppi da mostrare ────────────────────────────────────────────────

/**
 * Le righe di tutte le fatture, raggruppate per fornitore + descrizione e
 * ordinate per spesa, la più alta in cima: è lì che un prezzo sbagliato costa
 * di più.
 *
 * `stato` di ogni gruppo: `abbinato`, `escluso` (il titolare ha detto «non è
 * una materia prima»), `non-merce` (trasporto, campione, reso: lo dice la
 * riga da sola) o `da-abbinare`. Un gruppo abbinato a una materia prima che
 * non c'è più (rinominata, eliminata) torna `da-abbinare` e lo dice in
 * `abbinamentoPerso`.
 *
 * @param {Array} fatture `{ id, numero_rif, data_fattura, fornitore, tipo, totale, righe }`
 * @param {object} [opz]
 * @param {Set<string>} [opz.chiaviValide] le materie prime che esistono oggi
 */
export function raggruppaRigheFatture(fatture, { abbinamenti, chiaviValide = null } = {}) {
  const mappa = leggiAbbinamenti(abbinamenti)
  const perChiave = new Map()
  let noteDiCredito = 0
  let righeSenzaImporto = 0
  let fattureLette = 0

  for (const f of (Array.isArray(fatture) ? fatture : [])) {
    if (!Array.isArray(f?.righe) || !f.righe.length) continue
    fattureLette++
    if (eNotaDiCredito(f)) { noteDiCredito++; continue }
    const giorno = soloGiorno(f.data_fattura) || ''
    const idF = f.id ?? identitaFattura({ fornitore: f.fornitore, numero: f.numero_rif, data: f.data_fattura })
    for (const r of f.righe) {
      if (!eAcquisto(r)) { righeSenzaImporto++; continue }
      const k = chiaveGruppo(f.fornitore, r.descrizione)
      if (!k) { righeSenzaImporto++; continue }
      let g = perChiave.get(k)
      if (!g) {
        g = { chiave: k, fornitore: f.fornitore, descrizione: r.descrizione, volte: 0, fatture: new Set(), spesa: 0, prima: giorno, ultima: '', _riga: null, _numero: null }
        perChiave.set(k, g)
      }
      g.volte++
      g.fatture.add(idF)
      g.spesa += Number(r.totale)
      if (giorno && (!g.prima || giorno < g.prima)) g.prima = giorno
      // L'ultima riga comprata fa da vetrina: descrizione, fornitore e prezzo
      // come li scrive adesso.
      if (!g._riga || giorno >= g.ultima) {
        g._riga = r; g.ultima = giorno; g._numero = f.numero_rif || null
        g.fornitore = f.fornitore; g.descrizione = r.descrizione
      }
    }
  }

  const gruppi = [...perChiave.values()].map(g => {
    let abbinamento = mappa.gruppi[g.chiave] || null
    let abbinamentoPerso = null
    if (abbinamento?.tipo === 'materia' && !materiaEsiste(abbinamento, chiaviValide)) {
      abbinamentoPerso = abbinamento.nome || abbinamento.chiave
      abbinamento = null
    }
    const conto = contoRigaFattura(g._riga, abbinamento)
    const stato = abbinamento?.tipo === 'materia' ? 'abbinato'
      : abbinamento?.tipo === 'no' ? 'escluso'
        : !conto.classe.applicaPrezzo ? 'non-merce'
          : 'da-abbinare'
    return {
      chiave: g.chiave,
      fornitore: g.fornitore,
      descrizione: g.descrizione,
      volte: g.volte,
      fatture: g.fatture.size,
      spesa: Math.round(g.spesa * 100) / 100,
      prima: g.prima || null,
      ultima: g.ultima || null,
      ultimoNumero: g._numero,
      unita: g._riga?.unita || null,
      quantita: g._riga?.quantita ?? null,
      prezzoKg: conto.prezzoKg,
      spiegazione: conto.spiegazione || [],
      problema: conto.problema || null,
      avvisi: conto.avvisi || [],
      classe: conto.classe.tipo,
      classeMotivo: conto.classe.motivo,
      abbinamento,
      abbinamentoPerso,
      stato,
    }
  }).sort((a, b) => b.spesa - a.spesa || a.descrizione.localeCompare(b.descrizione, 'it'))

  return { gruppi, noteDiCredito, righeSenzaImporto, fattureLette }
}

// ── Il suggerimento ─────────────────────────────────────────────────────

/** Due parole sono la stessa? Uguali, o lunghe e diverse solo in fondo (nocciola/nocciole). */
function stessaParola(a, b) {
  if (a === b) return true
  return a.length >= 5 && b.length >= 5 && a.length === b.length && a.slice(0, -1) === b.slice(0, -1)
}

/**
 * La materia prima che il nome lascia pensare: tutte le parole del suo nome
 * stanno nella descrizione. Vince il nome più lungo («pasta di nocciola» su
 * «nocciola»). È una proposta da toccare col dito, non un abbinamento: chi
 * decide resta il titolare.
 *
 * @param {string} descrizione
 * @param {Array<{key: string, nome: string}>} materie
 * @returns {{key: string, nome: string}|null}
 */
export function suggerisciMateria(descrizione, materie) {
  const parole = normDescrizione(descrizione).split(' ').filter(Boolean)
  if (!parole.length) return null
  let migliore = null
  let punti = 0
  for (const m of (Array.isArray(materie) ? materie : [])) {
    const suo = normDescrizione(m?.nome).split(' ').filter(p => p.length >= 3)
    if (!suo.length) continue
    if (!suo.every(p => parole.some(q => stessaParola(p, q)))) continue
    const n = suo.join('').length
    if (n > punti) { migliore = m; punti = n }
  }
  return migliore ? { key: migliore.key, nome: migliore.nome } : null
}

// ── Dai gruppi abbinati al listino e allo storico ───────────────────────

const arrotonda4 = (n) => Math.round(Number(n) * 10000) / 10000

/** Il prezzo di listino che conta: dichiarato, maggiore di zero. */
function prezzoDiListino(voce) {
  if (!voce || voce.isStima) return null
  const kg = voce.costoKg != null ? Number(voce.costoKg)
    : voce.costoG != null ? Number(voce.costoG) * 1000
      : null
  return Number.isFinite(kg) && kg > 0 ? kg : null
}

/** «AAAA-MM-GG» del giorno prima. */
function giornoPrima(g) {
  const d = new Date(`${g}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** L'identità della fattura da cui arriva una riga di storico, se ne arriva una. */
function identitaDaOrigine(o) {
  if (!o || typeof o !== 'object' || o.tipo !== 'fattura') return null
  return identitaFattura({ fornitore: o.fornitore, numero: o.numero, data: o.data })
}

/**
 * Cosa cambiano, nel listino e nello storico, le fatture coi gruppi abbinati.
 *
 * Per ogni materia prima, le fatture in ordine di data:
 *
 *   • una fattura **più vecchia dell'ultimo cambio** di quel prezzo (a mano,
 *     da una bolla o da una fattura già passata) scrive solo lo storico, e
 *     solo se il prezzo di allora era diverso da quello che valeva il giorno
 *     prima;
 *   • le altre passano da `decidiPrezzo`: cambiano il listino se il prezzo è
 *     diverso, e scrivono lo storico;
 *   • se la materia prima non ha ancora un prezzo, comandano le fatture: alla
 *     fine il listino ha il prezzo dell'ultima.
 *
 * Più righe della stessa materia prima nella stessa fattura fanno **un**
 * prezzo, la media pesata sui chili: è quanto è costato davvero quel giorno.
 *
 * @param {Array} fatture  come le legge `raggruppaRigheFatture`
 * @param {object} ctx
 * @param {object} ctx.abbinamenti      la mappa salvata
 * @param {object} ctx.ingredientiCosti il listino di adesso
 * @param {Array}  ctx.logPrezzi        lo storico di adesso
 * @param {string[]} [ctx.forza]        prezzi sospetti confermati dal titolare (`id`)
 * @returns {{ingredientiCosti, logPrezzi, applicati, storicizzati, giaPassate,
 *   daConfermare: Array, senzaPrezzo: Array, materie: Array}}
 */
export function decidiPrezziDaFatture(fatture, {
  abbinamenti, ingredientiCosti = {}, logPrezzi = [], utente = null, forza = [], chiaviValide = null,
} = {}) {
  const mappa = leggiAbbinamenti(abbinamenti)
  const forzati = new Set(Array.isArray(forza) ? forza : [])

  // 1. Gli acquisti, per materia prima e per fattura.
  const perMateria = new Map()
  const senzaPrezzo = []
  for (const f of (Array.isArray(fatture) ? fatture : [])) {
    if (!Array.isArray(f?.righe) || !f.righe.length || eNotaDiCredito(f)) continue
    const idF = identitaFattura({ fornitore: f.fornitore, numero: f.numero_rif, data: f.data_fattura })
    if (!idF) continue
    for (const r of f.righe) {
      if (!eAcquisto(r)) continue
      const kG = chiaveGruppo(f.fornitore, r.descrizione)
      const abb = kG ? mappa.gruppi[kG] : null
      if (abb?.tipo !== 'materia' || !abb.chiave || !materiaEsiste(abb, chiaviValide)) continue
      const conto = contoRigaFattura(r, abb)
      if (!conto.classe.applicaPrezzo) continue
      if (conto.prezzoKg == null || !(conto.grammi > 0)) {
        senzaPrezzo.push({ gruppo: kG, chiave: abb.chiave, numero: f.numero_rif, data: soloGiorno(f.data_fattura), problema: conto.problema })
        continue
      }
      if (!perMateria.has(abb.chiave)) perMateria.set(abb.chiave, new Map())
      const acq = perMateria.get(abb.chiave)
      if (!acq.has(idF)) {
        // Il nome con cui si scrive lo storico deve ritrovare la stessa
        // chiave: è da lì che `getPrezzoStoricoKg` lo rilegge.
        const nome = abb.nome && normIng(abb.nome) === abb.chiave ? abb.nome : abb.chiave
        acq.set(idF, {
          id: `${idF}#${abb.chiave}`, idFattura: idF, chiave: abb.chiave, nome,
          fornitore: f.fornitore || null, numero: f.numero_rif || null, giorno: soloGiorno(f.data_fattura),
          kg: 0, euro: 0, righe: 0, gruppi: new Set(), spiegazione: [],
        })
      }
      const a = acq.get(idF)
      const kg = conto.grammi / 1000
      a.kg += kg
      a.euro += conto.prezzoKg * kg
      a.righe++
      a.gruppi.add(kG)
      a.spiegazione.push(...(conto.spiegazione || []))
    }
  }

  // 2. Materia per materia, dalla fattura più vecchia.
  let costi = { ...(ingredientiCosti || {}) }
  let log = Array.isArray(logPrezzi) ? [...logPrezzi] : []
  const giaScritte = new Set()
  for (const l of log) {
    const id = identitaDaOrigine(l?.origine)
    if (id) giaScritte.add(`${id}#${l.chiave || normIng(l.ingrediente || '')}`)
  }
  const prima = ultimiCambi(log)
  let applicati = 0
  let storicizzati = 0
  let giaPassate = 0
  let n = 0
  const marca = Date.now()
  const daConfermare = []
  const materie = []

  for (const [k, acq] of perMateria) {
    const acquisti = [...acq.values()].sort((x, y) =>
      (x.giorno < y.giorno ? -1 : x.giorno > y.giorno ? 1 : String(x.numero).localeCompare(String(y.numero), 'it', { numeric: true })))
    const listinoPrima = prezzoDiListino(costi[k])
    let listino = listinoPrima
    // Senza un prezzo di listino, la data dell'ultimo cambio non protegge
    // niente: comandano le fatture.
    let ultimo = listinoPrima == null ? null : (prima.get(k) || null)
    let righeQui = 0
    let nome = null

    for (const a of acquisti) {
      nome = a.nome
      if (giaScritte.has(a.id)) { giaPassate++; continue }
      if (mappa.ignorate[a.id] && !forzati.has(a.id)) continue
      const prezzo = arrotonda4(a.euro / a.kg)
      const vecchia = ultimo != null && a.giorno < ultimo
      let cambio
      if (vecchia) {
        // Lo storico: cosa valeva il giorno prima di questa fattura.
        const allora = getPrezzoStoricoKg(log, k, giornoPrima(a.giorno))
        if (allora != null && arrotonda4(allora) === prezzo) continue
        if (scostamentoSospetto(allora, prezzo) && !forzati.has(a.id)) {
          daConfermare.push(proposta(a, prezzo, allora, 'soloStorico'))
          continue
        }
        cambio = { chiave: k, nome: a.nome, prezzoKg: prezzo, prezzoAttuale: allora, azione: 'soloStorico' }
      } else {
        const d = decidiPrezzo({ prezzoAttuale: listino, prezzoNuovo: prezzo, dataBolla: a.giorno, dataUltimoCambio: ultimo })
        if (d.azione === 'nessuna') continue
        if (scostamentoSospetto(listino, prezzo) && !forzati.has(a.id)) {
          daConfermare.push(proposta(a, prezzo, listino, d.azione))
          continue
        }
        cambio = { chiave: k, nome: a.nome, prezzoKg: prezzo, prezzoAttuale: listino, azione: d.azione }
      }

      const r = applicaCambiAlListino([cambio], {
        ingredientiCosti: costi, logPrezzi: log, utente, tieni: Infinity,
        origine: { tipo: 'fattura', fornitore: a.fornitore, numero: a.numero, data: a.giorno },
      })
      // Un id per riga: le righe nate nello stesso millisecondo per la stessa
      // materia prima avrebbero lo stesso id, e un id doppio sparisce a chi
      // deduplica.
      log = r.logPrezzi.map((l, i) => (i < r.storicizzati ? { ...l, id: `lpf-${marca}-${n++}-${k}` } : l))
      costi = r.ingredientiCosti
      storicizzati += r.storicizzati
      righeQui += r.storicizzati
      giaScritte.add(a.id)
      if (cambio.azione === 'applica') { applicati += r.applicati; listino = prezzo; ultimo = a.giorno }
    }
    if (righeQui > 0) materie.push({ chiave: k, nome: nome || k, prima: listinoPrima, dopo: listino, righe: righeQui })
  }

  return {
    ingredientiCosti: costi,
    logPrezzi: tagliaStorico(log),
    applicati, storicizzati, giaPassate,
    daConfermare, senzaPrezzo, materie,
  }
}

function proposta(a, prezzoKg, prezzoPrima, azione) {
  return {
    id: a.id, chiave: a.chiave, nome: a.nome, fornitore: a.fornitore, numero: a.numero,
    giorno: a.giorno, prezzoKg, prezzoPrima: prezzoPrima ?? null, azione,
    gruppi: [...a.gruppi], spiegazione: a.spiegazione.slice(0, 6),
  }
}

// ── Quello che serve alla schermata ─────────────────────────────────────

/** Quanti gruppi per stato. «Esclusi» comprende quelli che la riga esclude da sola. */
export function contaGruppi(gruppi) {
  const c = { tutti: 0, daAbbinare: 0, abbinati: 0, esclusi: 0 }
  for (const g of (Array.isArray(gruppi) ? gruppi : [])) {
    c.tutti++
    if (g.stato === 'da-abbinare') c.daAbbinare++
    else if (g.stato === 'abbinato') c.abbinati++
    else c.esclusi++
  }
  return c
}

/**
 * I gruppi di un filtro (`da-abbinare`, `abbinati`, `esclusi`, `tutti`) che
 * contengono il testo cercato, nella descrizione, nel fornitore o nel nome
 * della materia prima abbinata.
 */
export function filtraGruppi(gruppi, { filtro = 'da-abbinare', testo = '' } = {}) {
  const q = normDescrizione(testo)
  return (Array.isArray(gruppi) ? gruppi : []).filter(g => {
    if (filtro === 'da-abbinare' && g.stato !== 'da-abbinare') return false
    if (filtro === 'abbinati' && g.stato !== 'abbinato') return false
    if (filtro === 'esclusi' && g.stato !== 'escluso' && g.stato !== 'non-merce') return false
    if (!q) return true
    return normDescrizione(`${g.descrizione} ${g.fornitore} ${g.abbinamento?.nome || ''}`).includes(q)
  })
}

const euroKg = (v) => `${Number(v).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`

/**
 * Cosa dire dopo un abbinamento: cosa è cambiato nel listino e nello
 * storico, o perché non è cambiato niente. Un abbinamento che non muove
 * nessun prezzo senza dire perché sembra un abbinamento non riuscito.
 */
export function fraseDopoAbbinamento({ descrizione, materia, chiaveGruppo: kG, esito }) {
  const testa = `«${descrizione}» ora è ${materia.nome}.`
  const m = (esito?.materie || []).find(x => x.chiave === materia.key)
  const sospetti = (esito?.daConfermare || []).filter(x => x.chiave === materia.key).length
  const coda = sospetti ? ` ${sospetti === 1 ? 'Un prezzo è' : `${sospetti} prezzi sono`} da confermare: ${sospetti === 1 ? 'lo trovi' : 'li trovi'} in cima.` : ''
  if (m) {
    const listino = m.dopo != null && m.dopo !== m.prima
      ? `Listino: ${euroKg(m.dopo)}${m.prima != null ? ` (prima ${euroKg(m.prima)})` : ''}.`
      : m.dopo != null ? `Il listino resta a ${euroKg(m.dopo)}.` : ''
    return `${testa} ${listino} Storico: ${m.righe} ${m.righe === 1 ? 'riga' : 'righe'} dalle fatture.${coda}`.replace(/\s+/g, ' ').trim()
  }
  if (sospetti) return `${testa}${coda}`
  const problema = (esito?.senzaPrezzo || []).find(x => x.gruppo === kG)?.problema
  if (problema) return `${testa} Nessun prezzo cambiato: su queste righe il prezzo al chilo non si calcola (${problema}).`
  return `${testa} Nessun prezzo cambiato: le fatture dicono gli stessi prezzi che hai già.`
}
