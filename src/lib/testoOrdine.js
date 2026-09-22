// ── Il testo dell'ordine al fornitore ───────────────────────────────────────
//
// Nato dentro `src/views/OrdiniAiView.jsx:243-266` (`testoGruppo` /
// `genTestoOrdine`), portato qui il 22/09/2026 perché lo usino anche il
// Magazzino e la scheda del fornitore, e perché un testo che finisce davanti
// a un cliente vero merita delle prove.
//
// Il tono è quello di prima e non si tocca: è come scrive una pasticcera al
// suo fornitore — «Buongiorno», «vi chiedo gentilmente», «Grazie!». Niente
// frasi da ufficio acquisti, niente elenchi puntati con le maiuscole, niente
// emoji, niente «Gentile Fornitore,». Chi riceve questo messaggio conosce
// Mara da otto anni.
//
// Tre cose che il testo di prima non diceva, e che sono venute fuori
// guardando le bolle vere dei fornitori (DESA, ConoArtic, Vecchio Enrico):
//
//   1. **Il codice dell'articolo.** Sulle loro bolle ogni riga ha un codice
//      (`Cod. 1007`, `A065/C`, `DOT.001`). Scrivere «panna» e basta vuol dire
//      lasciare che sia il magazziniere a indovinare quale delle sei panne.
//   2. **L'indirizzo di consegna, sempre.** Il design partner ha tre negozi.
//      Il fornitore che non lo legge scarica dove ha scaricato l'ultima
//      volta, e la merce è dall'altra parte della città.
//   3. **Il minimo d'ordine**, quando la stima non ci arriva: meglio
//      saperlo prima che ricevere la telefonata il giorno dopo.
//
// Tutto puro: nessuna data di sistema letta di nascosto (la data si passa),
// nessuna rete, niente React.

import { fmt0 } from './formatIt'
import { fmtQuantita } from './riordino'

/** Nome leggibile di un'azienda o di una sede, comunque sia stata passata. */
function nomeDi(v) {
  if (!v) return ''
  if (typeof v === 'string') return v.trim()
  return String(v.nome || v.nome_attivita || v.ragione_sociale || '').trim()
}

/** La parte «via, cap città (PR)» di un'azienda o di una sede. */
function viaDi(v) {
  if (!v || typeof v !== 'object') return ''
  const via = String(v.indirizzo || '').trim()
  const cap = String(v.cap || '').trim()
  const citta = String(v.citta || '').trim()
  const prov = String(v.provincia || '').trim()
  // La provincia sta attaccata alla città, non dopo un'altra virgola:
  // «10125 Torino (TO)», come si scrive su una busta.
  const localita = [[cap, citta].filter(Boolean).join(' '), prov ? `(${prov})` : ''].filter(Boolean).join(' ')
  return [via, localita].filter(Boolean).join(', ')
}

/**
 * La riga «dove va scaricata la merce».
 *
 * `sede` può essere l'oggetto della sede ({ nome, indirizzo, citta }) oppure
 * una stringa già scritta a mano, che in quel caso si usa così com'è.
 * Se l'indirizzo non c'è, NON si tace: resta una parentesi quadra visibile,
 * che chi copia il messaggio riempie prima di mandarlo. Un indirizzo assente
 * in silenzio è come un indirizzo sbagliato, ma senza il sospetto.
 */
export function indirizzoConsegna({ azienda, sede } = {}) {
  if (typeof sede === 'string' && sede.trim()) return sede.trim()

  const nomeAzienda = nomeDi(azienda)
  const nomeSede = nomeDi(sede)
  const via = viaDi(sede) || viaDi(azienda)

  const chi = nomeSede && nomeSede !== nomeAzienda
    ? [nomeAzienda, `(${nomeSede})`].filter(Boolean).join(' ')
    : nomeAzienda

  if (!via) return chi ? `${chi} — [scrivi qui l'indirizzo]` : "[scrivi qui l'indirizzo]"
  return chi ? `${chi} — ${via}` : via
}

/** Una riga dell'ordine: nome, codice del fornitore se c'è, quantità. */
function rigaOrdine(r) {
  const nome = String(r?.nome || r?.ingrediente || '').trim() || 'articolo senza nome'
  const codice = String(r?.codice || r?.codiceFornitore || r?.codice_fornitore || '').trim()
  // La quantità già scritta vince: serve per la merce che non si pesa
  // («20 cartoni», «6 pz»), dove i grammi non vogliono dire niente.
  const quantita = String(r?.quantitaTesto || '').trim()
    || fmtQuantita(r?.quantitaG ?? r?.quantita_g ?? r?.qtaSuggerita)
    // Mai un ordine senza quantità e senza dirlo: una riga muta viene letta
    // come «uno» dal magazziniere.
    || 'da confermare'
  const testa = codice ? `${nome} (Cod. ${codice})` : nome
  return `- ${testa}: ${quantita}`
}

/** La frase sul minimo d'ordine, solo quando si sa davvero che non ci si arriva. */
function fraseMinimo(minimoOrdine, stimaTotale) {
  const minimo = Number(minimoOrdine)
  const stima = Number(stimaTotale)
  // Se la stima non c'è (prezzi non inseriti) non si dice niente: sostenere
  // «non arrivo al minimo» senza saperlo è peggio che tacere.
  if (!(minimo > 0) || !Number.isFinite(stima) || !(stima > 0) || stima >= minimo) return null
  return `Il vostro minimo d'ordine è ${fmt0(minimo)}: fatemi sapere se conviene aggiungere qualcosa.`
}

function elencoRighe(righe) {
  return (Array.isArray(righe) ? righe : []).filter(Boolean).map(rigaOrdine)
}

/**
 * Il messaggio da incollare in WhatsApp.
 *
 * @param {object} p
 * @param {string|object} [p.fornitore] a chi va (non compare nel testo: su
 *        WhatsApp si scrive già alla persona giusta, e ripeterle il suo nome
 *        fa sembrare il messaggio un modulo)
 * @param {Array<object>} p.righe  { nome, quantitaG | quantitaTesto, codice }
 * @param {string|object} [p.azienda] chi ordina
 * @param {string|object} [p.sede]    dove va consegnata
 * @param {string} [p.note]           una riga in più, se serve
 * @param {number} [p.minimoOrdine]   minimo d'ordine del fornitore, in euro
 * @param {number} [p.stimaTotale]    stima dell'ordine, in euro
 * @returns {string}
 */
export function testoOrdineWhatsApp({ righe, azienda, sede, note, minimoOrdine, stimaTotale } = {}) {
  const nomeAzienda = nomeDi(azienda)
  const elenco = elencoRighe(righe)
  const minimo = fraseMinimo(minimoOrdine, stimaTotale)

  const blocchi = []
  blocchi.push(nomeAzienda ? `Buongiorno, sono ${nomeAzienda}.` : 'Buongiorno,')
  blocchi.push(elenco.length
    ? ['Vi chiedo gentilmente di prepararci:', ...elenco].join('\n')
    : 'Vi chiedo gentilmente di prepararci un ordine (ve lo scrivo qui sotto).')
  blocchi.push(`Consegna: ${indirizzoConsegna({ azienda, sede })}.`)
  if (String(note || '').trim()) blocchi.push(String(note).trim())
  if (minimo) blocchi.push(minimo)
  blocchi.push('Grazie!')

  return blocchi.join('\n\n')
}

/**
 * L'ordine come email: oggetto e corpo.
 *
 * L'oggetto serve al fornitore per ritrovarlo fra trecento messaggi: dentro
 * ci va chi ordina, quale negozio e di che giorno è. Stessi parametri di
 * `testoOrdineWhatsApp`, più `data` (`AAAA-MM-GG` o già scritta all'italiana;
 * non si legge l'orologio di nascosto, così il testo è sempre lo stesso a
 * parità di dati).
 *
 * @returns {{oggetto: string, corpo: string}}
 */
export function testoOrdineEmail({ righe, azienda, sede, note, minimoOrdine, stimaTotale, data } = {}) {
  const nomeAzienda = nomeDi(azienda)
  const nomeSede = nomeDi(sede)
  const elenco = elencoRighe(righe)
  const minimo = fraseMinimo(minimoOrdine, stimaTotale)

  const chi = [nomeAzienda || 'ordine', nomeSede && nomeSede !== nomeAzienda ? `(${nomeSede})` : '']
    .filter(Boolean).join(' ')
  const quando = dataItaliana(data)
  const oggetto = [`Ordine ${chi}`.trim(), quando].filter(Boolean).join(' — ')

  const blocchi = []
  blocchi.push('Buongiorno,')
  blocchi.push(elenco.length
    ? ['vi chiedo gentilmente di prepararci il seguente ordine:', ...elenco].join('\n')
    : 'vi chiedo gentilmente di prepararci un ordine.')
  blocchi.push(`Consegna: ${indirizzoConsegna({ azienda, sede })}.`)
  if (String(note || '').trim()) blocchi.push(String(note).trim())
  if (minimo) blocchi.push(minimo)
  blocchi.push(nomeAzienda ? `Grazie e a presto,\n${nomeAzienda}` : 'Grazie e a presto!')

  return { oggetto, corpo: blocchi.join('\n\n') }
}

/** Una data come la scrive un italiano. Accetta `AAAA-MM-GG`, una Date, o una stringa già pronta. */
function dataItaliana(v) {
  if (!v) return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s
}

/**
 * L'indirizzo `mailto:` con oggetto e corpo già dentro.
 *
 * Va codificato con `encodeURIComponent` e non con `encodeURI`: quest'ultimo
 * lascia passare `&` e `#`, e basta un «panna & co» o un «cod. #12» nel corpo
 * perché il client di posta tagli il messaggio a metà. I ritorni a capo
 * diventano `%0A`, che è l'unico modo perché il corpo arrivi su più righe.
 *
 * `a` può essere un indirizzo, più indirizzi separati da virgola o
 * punto e virgola, o un elenco.
 */
export function mailtoOrdine({ a, oggetto, corpo } = {}) {
  const destinatari = (Array.isArray(a) ? a : String(a ?? '').split(/[;,]/))
    .map(s => String(s ?? '').trim())
    .filter(Boolean)
    // La chiocciola si lascia leggibile: `%40` è valido ma alcuni client
    // Android lo mostrano così com'è nel campo «A».
    .map(s => encodeURIComponent(s).replace(/%40/g, '@'))
    .join(',')

  const parti = []
  if (String(oggetto || '').trim()) parti.push(`subject=${encodeURIComponent(oggetto)}`)
  if (String(corpo || '').trim()) parti.push(`body=${encodeURIComponent(corpo)}`)
  return `mailto:${destinatari}${parti.length ? `?${parti.join('&')}` : ''}`
}
