#!/usr/bin/env node
// ── Il voto di ogni sezione, calcolato e non stimato ──────────────────────
//
// Richiesta del titolare, 19/09/2026: «i voti solo su basi certe, non voti
// inventati». Questo file è quella base: quattro numeri misurati sul
// repository e una formula scritta, così chiunque può rifare il conto e
// contestarlo.
//
// ── Cosa misura, e cosa NON misura ───────────────────────────────────────
//
// Misura quanto una parte del prodotto è **solida**: provata, pulita,
// raggiungibile col dito e senza difetti aperti.
//
// NON misura se quella pagina serve davvero a un pasticcere. Una pagina
// inutile ma ben provata prende un voto alto. Per quello servono i dati
// d'uso, che sono un'altra cosa e non stanno in un repository.
//
// ── Il righello ha mentito quattro volte prima di funzionare ─────────────
//
// Sta scritto perché è la lezione più cara di questo progetto:
//   1. contare i file di test che *nominavano* la pagina: «PL» trovava anche
//      «plurale» ed «esempio»;
//   2. contare solo gli import scritti in cima, mentre i test montano le
//      viste con `await import(...)`;
//   3. contare solo `it(` e non `test(`;
//   4. contare come prove i file che sono attrezzi, non test: `layoutViste*`
//      ha un `it.skipIf` che di norma non parte, e faceva sembrare coperte
//      due pagine che non avevano nemmeno una prova.
//
// ── Perché non c'è più «commit degli ultimi sette giorni» ────────────────
//
// C'era, e premiava il rimescolare: per alzare il voto sarebbe bastato
// spezzare i commit. Un termometro che si può scaldare col fiato non serve.
// Al suo posto c'è quanto una pagina si lascia usare col dito e da chi non
// vede lo schermo, che è una cosa vera e che varia davvero fra le pagine.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..')

// Una sezione è la sua pagina **più la libreria che le appartiene**, quando ce
// n'è una. Non è una finezza: 45 prove sui trasferimenti stanno sulla vista e
// 45 su `lib/trasferimenti.js`, e contarne solo metà faceva risultare scoperta
// una parte che è la più provata del prodotto. Si aggiunge solo la libreria
// che serve a quella sezione e a nessun'altra, o si conterebbe due volte.
export const SEZIONI = {
  'Ricettario': ['src/views/RicettarioView.jsx'],
  'Nuovo gusto': ['src/views/NuovaRicettaView.jsx'],
  'Semilavorati': ['src/views/SemilavoratiView.jsx'],
  'Materie prime': ['src/views/MateriePrimeView.jsx'],
  'Listino (formati di vendita)': ['src/components/FormatiVendita.jsx', 'src/lib/formatiVendita.js'],
  'Food cost (il motore)': ['src/lib/foodcost.js'],
  'Magazzino / Giacenze': ['src/views/MagazzinoView.jsx'],
  'Bolla in arrivo': ['src/views/BollaInArrivo.jsx', 'src/lib/bolle.js'],
  'Inventario settimanale': ['src/views/InventarioSettimanaleView.jsx', 'src/lib/inventarioProduzione.js'],
  'Produzione giornaliera': ['src/views/ProduzioneGiornalieraView.jsx'],
  'Cassa e prima nota': ['src/views/ChiusuraView.jsx'],
  'Calendario': ['src/components/CalendarioOperativo.jsx'],
  'Fornitori': ['src/components/Scadenzario.jsx', 'src/components/Fornitori.jsx'],
  'Fornitori ↔ materie prime': ['src/views/FornitoriMateriePrimeView.jsx', 'src/lib/fornitoriMateriePrime.js'],
  'Sprechi e omaggi': ['src/components/SpreciOmaggi.jsx', 'src/lib/movimentiSpeciali.js'],
  'P&L': ['src/views/PLView.jsx'],
  'Costi fissi': ['src/views/CostiAziendaliView.jsx'],
  'Storico produzione': ['src/views/StoricoProduzioneView.jsx'],
  'Quadratura inventario': ['src/views/QuadraturaInventarioView.jsx'],
  'Previsioni': ['src/components/PrevisioneDomanda.jsx'],
  'Vendite B2B': ['src/views/VenditeB2BView.jsx', 'src/lib/venditeB2B.js'],
  'Cashflow': ['src/views/CashflowView.jsx'],
  'Personale': ['src/components/Personale.jsx'],
  'Confronto sedi': ['src/components/ConfrontoSedi.jsx', 'src/lib/confrontoSediCalc.js'],
  'Trasferimenti fra sedi': ['src/components/TrasferimentiView.jsx', 'src/lib/trasferimenti.js'],
  'Import dati': ['src/components/ImportWizard.jsx', 'src/lib/importValidateCore.js', 'src/lib/importParse.js'],
  'Allergeni e HACCP': ['src/components/Haccp.jsx', 'src/lib/allergeni.js'],
  'Impostazioni': ['src/components/Impostazioni.jsx'],
  'Menu e navigazione': ['src/lib/menuFoodos.js', 'src/Dashboard.jsx'],
  'Pannello admin': ['src/admin/AdminPage.jsx'],
}

/** Via i commenti e le stringhe: qui contano le chiamate, non i racconti. */
function soloCodice(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
}

/** Quante prove VERE contiene un file di test. */
function proveDi(testo) {
  const s = soloCodice(testo)
  // `it.skipIf`, `it.skip`, `describe.skip`: sono attrezzi, non prove.
  const vive = s.replace(/\b(it|test|describe)\s*\.\s*(skip|skipIf|todo)\s*\([^)]*\)\s*\(/g, ' SALTATA(')
  return (vive.match(/(?:^|[^.\w])(?:it|test)\s*\(\s*(?:''|""|``)/gm) || []).length
}

function tuttiIFile(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) tuttiIFile(p, out)
    else if (/\.jsx?$/.test(n)) out.push(p)
  }
  return out
}

export function misura() {
  const tests = readdirSync(join(RADICE, 'tests/unit'))
    .filter(n => /\.test\.jsx?$/.test(n))
    .map(n => join(RADICE, 'tests/unit', n))
  const testo = Object.fromEntries(tests.map(t => [t, readFileSync(t, 'utf8')]))
  const prove = Object.fromEntries(tests.map(t => [t, proveDi(testo[t])]))
  // Le deviazioni si contano ADESSO, non si leggono dalla fotografia.
  //
  // `scripts/design-tokens-baseline.json` è lo scatto dell'ultimo aggiornamento:
  // leggerlo faceva risultare il Cashflow a 5,8 deviazioni ogni 100 righe
  // quando erano già state portate a zero. Un voto letto da una fotografia
  // vecchia è un voto sbagliato, e questa è la quinta volta che il righello
  // mente su questo stesso conto.
  //
  // Le regole sono le stesse di `scripts/check-design-tokens.mjs`.
  const REGOLE_TOKEN = [
    /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g,
    /fontSize:\s*'?\d+/g,
    /is(?:Mobile|Tablet)\s*\?[^?:\n]{0,70}:\s*is(?:Tablet|Mobile)\s*\?/g,
    /fontSize:\s*isMobile\s*\?\s*16\s*:/g,
  ]

  const righe = []
  for (const [nome, file] of Object.entries(SEZIONI)) {
    const pat = file.map(f => new RegExp(`['"][^'"]*/${f.split('/').pop().replace(/\.jsx?$/, '')}(\\.jsx?)?['"]`))
    const quali = tests.filter(t => pat.some(p => p.test(testo[t])))
    const nProve = quali.reduce((a, t) => a + prove[t], 0)

    let dev = 0, nRighe = 0, finestre = 0, divClick = 0
    for (const f of file) {
      const src = readFileSync(join(RADICE, f), 'utf8')
      nRighe += src.split('\n').length
      const codice = soloCodice(src)
      // I commenti non contano: un colore citato in una spiegazione non è una
      // deviazione. `soloCodice` toglie anche le stringhe, quindi il conto è
      // un po' più prudente di quello del cancello, e va bene così.
      const perToken = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
      for (const re of REGOLE_TOKEN) dev += (perToken.match(re) || []).length
      finestre += (codice.match(/(?:^|[^.\w$])(?:window\s*\.\s*(?:prompt|confirm|alert)\s*\(|(?<!await\s)(?:prompt|confirm|alert)\s*\((?!\s*\{))/g) || []).length
      // Un `<div onClick>` è un comando invisibile a chi usa la tastiera o a
      // un lettore di schermo. Contarli però è più difficile di quanto sembri,
      // e questo conteggio ha sbagliato due volte prima di funzionare:
      //
      //   1. `<div[^>]{0,400}?onClick` — `[^>]` si ferma sul `>` di `=>`,
      //      quindi non arrivava mai a leggere il corpo del gestore;
      //   2. `<div[\s\S]{0,400}?onClick` — la finestra larga agganciava
      //      l'`onClick` di un elemento ANNIDATO e contava il `<div>` di fuori.
      //      La media di tutto il prodotto è scesa di otto punti in un colpo,
      //      e non era cambiata una riga di prodotto.
      //
      // Si fa al contrario: si parte da ogni `onClick` e si guarda **indietro**
      // fino al tag che lo possiede. Se quel tag è un `div`, è un candidato.
      //
      // Due forme non sono comandi e non si contano, o si finisce a
      // «correggere» codice giusto per far salire un numero:
      //   `onClick={e => e.stopPropagation()}` — è un BLOCCO del clic, serve a
      //      non far chiudere la finestra cliccandoci dentro. Non fa niente.
      //   un tag che ha già un `role` — è il velo di una finestra, che un
      //      ruolo ce l'ha e si chiude anche con Esc.
      for (const m of codice.matchAll(/onClick\s*=\s*\{/g)) {
        const prima = codice.slice(Math.max(0, m.index - 400), m.index)
        const apre = prima.lastIndexOf('<')
        if (apre === -1) continue
        const tag = prima.slice(apre)
        if (!/^<div[\s>]/.test(tag)) continue        // non è un div
        if (/\brole\s*=/.test(tag)) continue          // ha già un ruolo
        const corpo = codice.slice(m.index, m.index + 120)
        if (/=>\s*e\.stopPropagation\(\)\s*\}/.test(corpo)) continue
        divClick++
      }
    }
    const dev100 = nRighe ? Math.round(dev * 1000 / nRighe) / 10 : 0

    const pProve = nProve === 0 ? 0 : nProve < 10 ? 10 : nProve < 25 ? 20 : nProve < 50 ? 30 : nProve < 90 ? 38 : 45
    const pDesign = dev100 === 0 ? 20 : dev100 < 2 ? 17 : dev100 < 5 ? 13 : dev100 < 8 ? 9 : 5
    // Nel pannello admin le finestre native sono **ammesse da CLAUDE.md**
    // («alert() ammesso solo in admin per azioni distruttive»): lo apre il
    // titolare dal computer, non un pasticcere dal telefono. Toglierle lì non
    // è un miglioramento, e un termometro che punisce chi rispetta la regola
    // scritta è un termometro rotto.
    const finestreCheContano = nome === 'Pannello admin' ? 0 : finestre
    const brutti = finestreCheContano + divClick
    const pTocco = brutti === 0 ? 15 : brutti <= 2 ? 11 : brutti <= 5 ? 7 : 3
    const voto = pProve + pDesign + pTocco + 20

    righe.push({ nome, prove: nProve, file: quali.length, dev, dev100, righe: nRighe, finestre, divClick, voto })
  }
  return righe.sort((a, b) => b.voto - a.voto)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = misura()
  const p = (s, n) => String(s).padEnd(n)
  const d = (s, n) => String(s).padStart(n)
  console.log(p('sezione', 30) + d('prove', 6) + d('dev/100r', 10) + d('finestre', 9) + d('divClick', 9) + d('VOTO', 6))
  for (const x of r) {
    console.log(p(x.nome, 30) + d(x.prove, 6) + d(x.dev100, 10) + d(x.finestre, 9) + d(x.divClick, 9) + d(x.voto, 6))
  }
  const media = Math.round(r.reduce((a, x) => a + x.voto, 0) / r.length)
  console.log(`\nmedia ${media}/100 su ${r.length} sezioni · sotto 90: ${r.filter(x => x.voto < 90).length}`)
}
