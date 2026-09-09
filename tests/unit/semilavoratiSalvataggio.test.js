// Semilavorati: salvare un semilavorato ne cancellava gli allergeni.
//
// doSaveSemi ricostruiva la ricetta da zero elencando i campi uno per uno:
//   { nome, sheetName, numStampi, totImpasto1, foodCost1, ingredienti, note,
//     tipo, unita, prezzo }
// Tutto il resto veniva PERSO. Sui 7 semilavorati reali del 09/09/2026 i campi
// che sparivano erano `allergeni`, `categoria` e `congelabile`, e riguardavano
// 3 semilavorati su 7 — tra cui la PASTA FROLLA usata in 3 crostate, che
// perdeva proprio gli allergeni.
//
// Il danno e' silenzioso: si apre una base per correggere un peso, si salva, e
// gli allergeni non ci sono più. Nessun messaggio, nessun modo di accorgersene
// se non riaprendo la scheda.
//
// Questo test ricostruisce la trasformazione che fa il salvataggio, sulla forma
// vera di un semilavorato del database.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const src = readFileSync(join(RADICE, 'src', 'views', 'SemilavoratiView.jsx'), 'utf8')

describe('Semilavorati — il salvataggio non butta via campi', () => {
  it('parte dalla ricetta esistente invece di ricostruirla da zero', () => {
    const i = src.indexOf('const doSaveSemi = async () => {')
    expect(i).toBeGreaterThan(-1)
    const fn = src.slice(i, i + 1800)
    // La riga che risolve il difetto: si riparte da quello che c'è in archivio,
    // non da un oggetto vuoto. (La scelta di QUALE ricetta è affinata nel terzo
    // giro di audit, più sotto: destinazione prima, partenza come ripiego.)
    expect(fn).toMatch(/const precedente = destinazione \|\| partenza \|\| \{\}/)
    // E lo spread deve venire PRIMA dei campi del form, altrimenti li sovrascrive.
    const posSpread = fn.indexOf('...precedente')
    const posNome = fn.indexOf('nome: nomeSalvato')
    expect(posSpread).toBeGreaterThan(-1)
    expect(posSpread).toBeLessThan(posNome)
  })

  it('i campi che prima sparivano sopravvivono al salvataggio', () => {
    // Simula la trasformazione con la forma vera di PASTA FROLLA (Gelateria Demo).
    const precedente = {
      nome: 'PASTA FROLLA', sheetName: 'excel', numStampi: 1,
      ingredienti: [{ nome: 'farina', qty1stampo: 500 }],
      note: 'riposo in frigo 2 ore',
      tipo: 'semilavorato', unita: 0, prezzo: 0,
      allergeni: ['glutine', 'latte', 'uova'],
      categoria: 'Basi',
      congelabile: true,
    }
    const form = { nome: 'pasta frolla', ingredienti: [{ nome: 'farina', qty1stampo: 520 }], note: 'riposo in frigo 3 ore' }

    // La stessa costruzione che fa doSaveSemi dopo la correzione.
    const nomeSalvato = form.nome.trim().toUpperCase()
    const nuova = {
      ...precedente,
      nome: nomeSalvato,
      sheetName: precedente.sheetName || 'manuale',
      numStampi: 1, totImpasto1: 0, foodCost1: 0,
      ingredienti: form.ingredienti,
      note: form.note,
      tipo: 'semilavorato', unita: 0, prezzo: 0,
    }

    // Quello che l'utente ha modificato cambia.
    expect(nuova.ingredienti[0].qty1stampo).toBe(520)
    expect(nuova.note).toBe('riposo in frigo 3 ore')
    // Quello che non ha toccato resta. Prima di oggi qui sarebbe stato undefined.
    expect(nuova.allergeni).toEqual(['glutine', 'latte', 'uova'])
    expect(nuova.categoria).toBe('Basi')
    expect(nuova.congelabile).toBe(true)
    expect(nuova.sheetName).toBe('excel')
  })

  it('il badge distingue "senza prezzo" da "prezzo stimato"', () => {
    // Prima il badge diceva "N prezzi stimati" contando i prezzi ASSENTI, e le
    // stime vere (20 righe su 38 nei dati reali) non si vedevano mai.
    expect(src).toMatch(/const stimati = righe\.filter\(r => r\.isStima\)/)
    expect(src).toMatch(/senza prezzo/)
    expect(src).not.toMatch(/\$\{mancanti\.length\} prezzi stimati/)
  })

  it('un costo al kg di zero non viene mostrato come un costo misurato', () => {
    // GANACHE VEGANA: 2 ingredienti su 3 senza prezzo -> costo 0. La card
    // mostrava "0,00 €" sotto "COSTO / KG" mentre la tabella, per lo stesso
    // semilavorato, mostrava "-".
    expect(src).toMatch(/sm\.costoKg > 0 \? fmtKg\(sm\.costoKg\) : 'da completare'/)
  })

  it('i bottoni di salvataggio sono disabilitati durante il salvataggio', () => {
    // CLAUDE.md, "Bottoni async": senza disabled un doppio click salva due volte.
    const i = src.indexOf('onClick={handleSave}')
    expect(i).toBeGreaterThan(-1)
    expect(src.slice(i, i + 60)).toMatch(/disabled=\{saving\}/)
  })
})

// ── Secondo giro di audit, 09/09/2026 ────────────────────────────────────────
//
// Tre difetti trovati dopo la prima correzione, due dei quali causati proprio
// da quella.

describe('Semilavorati — rinominare, sovrascrivere, e il messaggio d errore', () => {
  it('rinominando, la voce col nome vecchio non resta in archivio', () => {
    // Prima restavano entrambe: l'originale e la copia rinominata. E le ricette
    // che usavano il nome vecchio puntavano a una base che l'utente credeva di
    // aver rinominato.
    const i = src.indexOf('const ricetteAggiornate =')
    expect(i).toBeGreaterThan(-1)
    const blocco = src.slice(i, i + 400)
    expect(blocco).toMatch(/if \(editMode && editMode !== nuovaRic\.nome\) delete ricetteAggiornate\[editMode\]/)
  })

  it('avvisa quali ricette usavano il nome vecchio', () => {
    // Chi usava il nome vecchio non trova più la base: il food cost cade sul
    // listino ingredienti e il numero cambia senza spiegazione.
    expect(src).toMatch(/const orfane = rinominato/)
    expect(src).toMatch(/Aggiorna l'ingrediente in/)
  })

  it('la conferma di sovrascrittura dice cosa succede a un prodotto vendibile', () => {
    // Il dialogo diceva solo "esiste già - sovrascrivere?" e accettava il nome
    // di QUALSIASI ricetta: confermando, un prodotto che si vende diventava
    // tipo:'semilavorato' con prezzo 0 e spariva da produzione, cassa, P&L,
    // formati vendita, sprechi, vendite B2B e simulatore prezzi.
    expect(src).toMatch(/const sovrascriveProdottoVendibile/)
    expect(src).toMatch(/prodotto che vendi/)
    expect(src).toMatch(/sparisce dalla produzione/)
  })

  it('non copre il messaggio del Dashboard, che dice dove sta la copia locale', () => {
    // Il toast ha un solo slot e il timer si azzera a ogni notify: il messaggio
    // della view sostituiva quello del Dashboard, che è l'unico a dire che
    // esiste una copia locale e di non chiudere la pagina.
    expect(src).toMatch(/if \(!e\?\.giaNotificato\)/)
  })
})

// ── Terzo giro ───────────────────────────────────────────────────────────────

describe('Semilavorati — nomi già occupati e basi non dichiarate', () => {
  it('i campi da conservare arrivano dalla ricetta di destinazione', () => {
    // Rinominando CREMA PASTICCERA in PASTA FROLLA (nome che esiste già), il
    // vecchio codice prendeva i campi di CREMA PASTICCERA e li scriveva sopra
    // PASTA FROLLA, che perdeva i suoi allergeni. Cioè la stessa perdita
    // corretta stamattina, che reggeva solo se il nome non cambiava.
    expect(src).toMatch(/const destinazione = ricettario\?\.ricette\?\.\[nomeSalvato\]/)
    expect(src).toMatch(/const precedente = destinazione \|\| partenza \|\| \{\}/)
  })

  it('il nome di un prodotto che si vende viene rifiutato, non solo segnalato', () => {
    // Bastava scrivere NOCCIOLA e confermare due parole perché il gusto
    // diventasse una base e sparisse da inventario, cassa e conto economico.
    // Spiegarlo non basta: la conferma resta a un clic.
    expect(src).toMatch(/setBloccoNome\(\{/)
    expect(src).toMatch(/è un prodotto che vendi, non una base/)
    expect(src).toMatch(/Scegli un altro nome/)
  })

  it('propone di dichiarare base le ricette che sono già usate come ingrediente', () => {
    // BASE BIANCA è usata in 15 ricette di Mara ma non ha il tipo: calcolaFC ne
    // prende il costo dal listino (2,31 €/kg) invece che dalla sua ricetta
    // (1,62 €/kg), e la pagina non offriva modo di accorgersene.
    expect(src).toMatch(/trovaBasiNonDichiarate/)
    expect(src).toMatch(/const dichiaraBase = async/)
    // Dichiarandola, cambia solo il tipo: ingredienti e nome non si toccano.
    const i = src.indexOf('const dichiaraBase = async')
    const fn = src.slice(i, i + 1200)
    expect(fn).toMatch(/tipo: 'semilavorato', unita: 0, prezzo: 0/)
    expect(fn).toMatch(/\.\.\.r,/)
    // E avvisa che il food cost di altre ricette si muove.
    expect(fn).toMatch(/si ricalcola sulla sua ricetta/)
  })
})
