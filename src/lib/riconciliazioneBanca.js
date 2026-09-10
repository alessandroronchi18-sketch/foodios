// Riconciliazione con l'estratto conto della banca.
//
// IL LAVORO CHE TOGLIE. Oggi, per sapere se una fattura è stata pagata, si
// apre l'home banking, si cerca il bonifico, si torna in Foodos e si segna la
// fattura. Su 1.387 fatture aperte è il lavoro che nessuno fa, e per questo
// lo scadenzario resta gonfio.
//
// Qui si carica il CSV che ogni banca sa esportare, e il tool propone gli
// abbinamenti: quale uscita corrisponde a quale fattura. Propone — non
// applica: un abbinamento sbagliato chiude una fattura che è ancora da pagare,
// e nessuno se ne accorgerebbe.
//
// COME ABBINA, in ordine di certezza:
//   1. l'importo coincide al centesimo E il nome del fornitore compare nella
//      descrizione del movimento → certo;
//   2. l'importo coincide e la data è vicina alla scadenza → probabile;
//   3. l'importo coincide con la somma di più fatture dello stesso fornitore
//      (il bonifico cumulativo) → probabile, e si propone il gruppo;
//   4. il nome corrisponde ma l'importo no → si mostra come "da guardare",
//      perché può essere un acconto.
// Quello che non entra in nessuno di questi casi resta fuori e si dice.

import { parseNum } from './importCassa'

/** Normalizza un nome per il confronto: via accenti, forme societarie, punti. */
export function normPerConfronto(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(S\.?R\.?L\.?|S\.?P\.?A\.?|S\.?A\.?S\.?|S\.?N\.?C\.?|SOCIETA|UNIPERSONALE|DI|E|&)\b/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Il nome del fornitore compare nella descrizione del movimento?
 *
 * Non un confronto esatto: la banca scrive "BONIF. A FAVORE DI CONO ARTIC
 * COMMERCIALE SRL VIA..." e noi abbiamo "CONO ARTIC COMMERCIALE SRL". Si
 * cercano le parole significative del nome dentro la descrizione.
 */
export function nomeNellaDescrizione(nomeFornitore, descrizione) {
  const nome = normPerConfronto(nomeFornitore)
  const desc = normPerConfronto(descrizione)
  if (!nome || !desc) return 0
  const parole = nome.split(' ').filter(p => p.length >= 3)
  if (parole.length === 0) return 0
  // Le parole CORTE si cercano intere, non come pezzo: senza il confine di
  // parola "DESA" scatta dentro "DESALINIZZAZIONE" e il bonifico dell'acqua
  // verrebbe abbinato alla fattura del fornitore.
  // Quelle lunghe (sei lettere o più) si cercano anche come pezzo, perché le
  // banche troncano i nomi lunghi nella descrizione.
  const trovata = (p) => p.length >= 6
    ? desc.includes(p)
    : new RegExp(`\\b${p}\\b`).test(desc)
  const trovate = parole.filter(trovata).length
  return trovate / parole.length
}

const GG = 86400000
function giorniTra(isoA, isoB) {
  if (!isoA || !isoB) return null
  const [y1, m1, g1] = String(isoA).slice(0, 10).split('-').map(Number)
  const [y2, m2, g2] = String(isoB).slice(0, 10).split('-').map(Number)
  if (!y1 || !y2) return null
  return Math.round((Date.UTC(y2, m2 - 1, g2) - Date.UTC(y1, m1 - 1, g1)) / GG)
}

/**
 * Legge l'estratto conto da un CSV.
 *
 * Le banche italiane esportano tutte colonne diverse, quindi le si riconosce
 * dal nome dell'intestazione invece di pretendere un formato: data, importo (o
 * dare/avere separati), descrizione.
 *
 * Ritorna solo le USCITE: le entrate di un estratto conto non c'entrano con le
 * fatture da pagare.
 */
export function leggiEstrattoConto(testo) {
  const righe = String(testo || '').split(/\r?\n/).map(r => r.trimEnd()).filter(r => r.trim())
  if (righe.length < 2) return { movimenti: [], avvisi: ['Il file sembra vuoto.'] }
  const sep = [';', '\t', ','].map(c => ({ c, n: (righe[0].match(new RegExp(`\\${c}`, 'g')) || []).length }))
    .sort((a, b) => b.n - a.n)[0].c
  const cella = (r) => r.split(sep).map(v => v.replace(/^["']|["']$/g, '').trim())
  const head = cella(righe[0]).map(h => h.toUpperCase())

  const trova = (...chiavi) => head.findIndex(h => chiavi.some(k => h.includes(k)))
  const iData = trova('DATA CONTABILE', 'DATA VALUTA', 'DATA OPERAZIONE', 'DATA')
  const iDesc = trova('DESCRIZIONE', 'CAUSALE', 'OPERAZIONE', 'DETTAGLI', 'MEMO')
  const iImporto = trova('IMPORTO', 'AMOUNT')
  const iDare = trova('DARE', 'USCITE', 'ADDEBIT', 'DEBIT')
  const iAvere = trova('AVERE', 'ENTRATE', 'ACCREDIT', 'CREDIT')

  const avvisi = []
  if (iData < 0) avvisi.push('Non trovo la colonna della data: dev\'esserci un\'intestazione con scritto "data".')
  if (iImporto < 0 && iDare < 0) avvisi.push('Non trovo la colonna dell\'importo: serve una colonna "importo", oppure "dare" e "avere" separate.')
  if (iData < 0 || (iImporto < 0 && iDare < 0)) return { movimenti: [], avvisi }

  const movimenti = []
  let scartate = 0
  for (let i = 1; i < righe.length; i++) {
    const c = cella(righe[i])
    const dataIso = normalizzaData(c[iData])
    if (!dataIso) { scartate++; continue }
    let importo
    if (iImporto >= 0) importo = parseNum(c[iImporto])
    else importo = -Math.abs(parseNum(c[iDare])) + Math.abs(parseNum(iAvere >= 0 ? c[iAvere] : 0))
    // Solo le uscite: in un estratto conto sono negative (o nella colonna dare).
    if (!(importo < 0)) continue
    movimenti.push({
      riga: i + 1,
      data: dataIso,
      importo: Math.round(Math.abs(importo) * 100) / 100,
      descrizione: iDesc >= 0 ? (c[iDesc] || '') : '',
    })
  }
  if (scartate > 0) avvisi.push(`${scartate} righe senza una data leggibile: le ho saltate.`)
  if (movimenti.length === 0) avvisi.push('Nessuna uscita trovata: in questo estratto conto ci sono solo entrate, o gli importi non si leggono.')
  return { movimenti, avvisi }
}

/** Date italiane, americane o ISO → ISO. Null se non si capisce. */
export function normalizzaData(v) {
  const s = String(v || '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    let [, g, mm, a] = m
    if (a.length === 2) a = `20${a}`
    // Formato italiano: giorno prima. Se il primo numero è oltre 12 è
    // sicuramente il giorno; se il secondo è oltre 12, era americano.
    let giorno = Number(g), mese = Number(mm)
    if (mese > 12 && giorno <= 12) { const t = giorno; giorno = mese; mese = t }
    if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return null
    return `${a}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
  }
  return null
}

/**
 * Propone gli abbinamenti fra le uscite della banca e le fatture aperte.
 *
 * PURA. Ritorna { abbinamenti, nonAbbinati } e non tocca niente.
 * Ogni abbinamento porta il perché e la certezza, perché è l'utente che
 * decide: chiudere per sbaglio una fattura ancora da pagare è un danno che
 * non si vede.
 */
export function proponiAbbinamenti(movimenti, fatture, { giorniTolleranza = 45 } = {}) {
  const aperte = (fatture || []).filter(f => f?.stato !== 'pagata' && f?.tipo !== 'nota_credito')
  const usate = new Set()
  const abbinamenti = []
  const nonAbbinati = []

  const residuo = (f) => {
    const tot = Math.abs(Number(f.totale) || 0)
    const pag = Math.abs(Number(f.importo_pagato) || 0)
    return Math.round((tot - pag) * 100) / 100
  }
  const vicino = (a, b) => Math.abs(a - b) < 0.02

  for (const mv of (movimenti || [])) {
    const candidate = aperte.filter(f => !usate.has(f.id))

    // 1) importo esatto + nome nella descrizione = certo
    let scelta = null, motivo = '', certezza = ''
    for (const f of candidate) {
      if (!vicino(residuo(f), mv.importo)) continue
      const somiglianza = nomeNellaDescrizione(f.fornitore, mv.descrizione)
      if (somiglianza >= 0.6) {
        scelta = [f]; certezza = 'certo'
        motivo = `l'importo coincide e "${f.fornitore}" compare nella descrizione del movimento`
        break
      }
    }

    // 2) importo esatto e data vicina alla scadenza = probabile
    if (!scelta) {
      const perData = candidate
        .filter(f => vicino(residuo(f), mv.importo))
        .map(f => ({ f, gg: Math.abs(giorniTra(f.dueIso || f.data_scadenza || f.data_fattura, mv.data) ?? 9999) }))
        .filter(x => x.gg <= giorniTolleranza)
        .sort((a, b) => a.gg - b.gg)
      if (perData.length === 1) {
        scelta = [perData[0].f]; certezza = 'probabile'
        motivo = `l'importo coincide e la data è a ${perData[0].gg} giorni dalla scadenza`
      } else if (perData.length > 1) {
        scelta = [perData[0].f]; certezza = 'da confermare'
        motivo = `${perData.length} fatture hanno questo importo: propongo quella con la scadenza più vicina`
      }
    }

    // 3) il bonifico cumulativo: la somma di più fatture dello stesso fornitore
    if (!scelta) {
      const perFornitore = {}
      for (const f of candidate) {
        const som = nomeNellaDescrizione(f.fornitore, mv.descrizione)
        if (som < 0.6) continue
        const k = f.fornitore
        if (!perFornitore[k]) perFornitore[k] = []
        perFornitore[k].push(f)
      }
      for (const [nome, lista] of Object.entries(perFornitore)) {
        const gruppo = sottoinsiemeCheSomma(lista, mv.importo)
        if (gruppo) {
          scelta = gruppo; certezza = 'probabile'
          motivo = `è la somma di ${gruppo.length} fatture di ${nome}`
          break
        }
      }
    }

    // 4) nome sì, importo no: può essere un acconto, si mostra e si decide
    if (!scelta) {
      const stessoNome = candidate
        .map(f => ({ f, som: nomeNellaDescrizione(f.fornitore, mv.descrizione) }))
        .filter(x => x.som >= 0.6)
        .sort((a, b) => Math.abs(residuo(a.f) - mv.importo) - Math.abs(residuo(b.f) - mv.importo))
      if (stessoNome.length > 0) {
        nonAbbinati.push({
          ...mv,
          motivo: `il nome corrisponde a ${stessoNome[0].f.fornitore}, ma l'importo no (in fattura ${residuo(stessoNome[0].f).toFixed(2)}): può essere un acconto`,
          suggerito: stessoNome[0].f.id,
        })
        continue
      }
      nonAbbinati.push({ ...mv, motivo: 'non trovo nessuna fattura aperta che corrisponda', suggerito: null })
      continue
    }

    for (const f of scelta) usate.add(f.id)
    abbinamenti.push({
      movimento: mv,
      fatture: scelta.map(f => ({
        id: f.id, fornitore: f.fornitore, numero_rif: f.numero_rif,
        data_fattura: f.data_fattura, residuo: residuo(f),
      })),
      certezza, motivo,
      // Quando il bonifico è cumulativo l'importo si spalma sulle fatture del
      // gruppo, ed è sempre esatto perché il gruppo somma a quell'importo.
      totale: Math.round(scelta.reduce((s, f) => s + residuo(f), 0) * 100) / 100,
    })
  }
  return { abbinamenti, nonAbbinati }
}

/**
 * Sottoinsieme di fatture che somma esattamente a un importo.
 *
 * Prova prima le combinazioni piccole (2, 3, 4 fatture), che sono il caso
 * reale di un bonifico cumulativo. Oltre non cerca: con 99 fatture aperte le
 * combinazioni sono troppe e il rischio di un abbinamento casuale supera
 * l'utilità.
 */
export function sottoinsiemeCheSomma(fatture, importo, { maxElementi = 4, maxCandidate = 24 } = {}) {
  const res = (f) => Math.round((Math.abs(Number(f.totale) || 0) - Math.abs(Number(f.importo_pagato) || 0)) * 100) / 100
  const lista = [...fatture]
    .filter(f => res(f) > 0 && res(f) <= importo + 0.02)
    .sort((a, b) => String(a.data_fattura || '').localeCompare(String(b.data_fattura || '')))
    .slice(0, maxCandidate)
  const vicino = (v) => Math.abs(v - importo) < 0.02

  // Il caso più frequente: si paga tutto l'aperto di quel fornitore.
  const tutte = lista.reduce((s, f) => s + res(f), 0)
  if (vicino(tutte) && lista.length >= 2) return lista

  for (let k = 2; k <= Math.min(maxElementi, lista.length); k++) {
    const trovato = combina(lista, k, 0, [], 0)
    if (trovato) return trovato
  }
  return null

  function combina(arr, k, start, acc, somma) {
    if (acc.length === k) return vicino(somma) ? [...acc] : null
    for (let i = start; i < arr.length; i++) {
      const v = res(arr[i])
      if (somma + v > importo + 0.02) continue
      acc.push(arr[i])
      const r = combina(arr, k, i + 1, acc, Math.round((somma + v) * 100) / 100)
      acc.pop()
      if (r) return r
    }
    return null
  }
}
