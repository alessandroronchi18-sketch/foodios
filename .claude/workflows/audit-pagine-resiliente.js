export const meta = {
  name: 'audit-pagine-resiliente',
  description: 'Audit pagine FoodOS: sonda un agente, poi 2 alla volta, ognuno riprende dal proprio file su disco',
  whenToUse: 'Audit pagina-per-pagina di FoodOS quando la quota agenti e fragile: sopravvive ai session limit',
  phases: [
    { title: 'Sonda', detail: 'un solo agente: se muore la quota non c\'e, non spreco gli altri' },
    { title: 'Audit', detail: '2 pagine alla volta, stop se un intero blocco muore' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────
// Perche questa forma, e non un fan-out da 6.
//
// Il 10/09/2026 tre workflow da 6 agenti in parallelo hanno speso 788.270
// token e riportato UN solo risultato su 18: gli altri 17 sono morti su
// "session limit". Cio che si e salvato erano i file parziali su disco.
// Quindi:
//   1) SONDA: un agente solo, sulla pagina piu piccola. Se torna null la
//      quota non c'e: si esce subito invece di bruciare gli altri.
//   2) BLOCCHI DA 2: se un blocco intero muore ci si ferma. Meglio 4 pagine
//      finite che 12 a meta.
//   3) RIPRESA DAL FILE: ogni agente prima legge il proprio .md e continua
//      da dove si era interrotto il tentativo precedente. Il lavoro pagato
//      una volta non si paga due.
//   4) IL FILE E IL RISULTATO: il return strutturato e un extra. Se l'agente
//      muore dopo aver scritto, il contenuto resta.
// ─────────────────────────────────────────────────────────────────────────

const OUT = args?.out || '/tmp/audit-fase3'
const PAGINE = Array.isArray(args?.pagine) ? args.pagine : []
const GRUPPO = args?.gruppo || 'senza-nome'

const SCHEMA = {
  type: 'object',
  properties: {
    pagina: { type: 'string' },
    file_parziale: { type: 'string', description: 'percorso del file dove hai scritto tutto' },
    completata: { type: 'boolean', description: 'true solo se hai scritto ## FINE nel file' },
    difetti: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titolo: { type: 'string' },
          gravita: { type: 'string', enum: ['ALTA', 'MEDIA', 'BASSA'] },
          impedisce_o_rifinitura: { type: 'string', enum: ['impedisce', 'rifinitura'] },
          schema: { type: 'string' },
          file: { type: 'string' },
          riga: { type: 'number' },
          comera: { type: 'string' },
          danno: { type: 'string' },
          righe_reali: { type: 'string' },
          correzione: { type: 'string' },
        },
        required: ['titolo', 'gravita', 'file', 'comera', 'danno', 'correzione'],
      },
    },
    scartati: { type: 'array', items: { type: 'string' }, description: 'sospetti verificati e caduti, col motivo' },
  },
  required: ['pagina', 'completata', 'difetti'],
}

const METODO = `Sei un revisore severo di FoodOS, gestionale per pasticcerie e gelaterie italiane. Il design partner reale e Mara dei Boschi (Torino), GELATERIA con 3 sedi, metodo INVENTARIO (non a stampi).

METODO, non negoziabile:
1. LEGGI IL CODICE VERO. Cita file:riga per ogni affermazione. Se non hai letto la riga, non e un difetto.
2. NIENTE difetti ipotetici: descrivi la sequenza concreta di gesti che produce il danno, e cosa perde l'utente.
3. VERIFICA SUI DATI VERI. Credenziali Postgres di produzione in ~/.config/foodos/supabase.env (variabili PG*, caricale con "set -a; source ~/.config/foodos/supabase.env; set +a"), psql in /usr/local/opt/libpq/bin/psql. Le chiavi di public.user_data sono in src/lib/storageKeys.js. CONTA quante righe reali sono colpite da ogni difetto: e il dato che decide se vale la correzione.
4. Se controlli un numero, RICALCOLALO col modulo vero (node, o un test temporaneo). Non fidarti della lettura a occhio.
5. NON MODIFICARE NIENTE. Sei in sola lettura: nessun file di src/ o api/ va toccato. L'unica cosa che scrivi e il tuo file di report.

GLI OTTO DIFETTI CHE TORNANO SEMPRE (cercali per nome):
A) salvataggio fallito riportato come riuscito;
B) numeri inventati presentati come misurati (fallback silenziosi);
C) dato mancante che diventa zero, e zero che diventa un verdetto positivo;
D) denominatore inventato (percentuali su una base che non esiste);
E) colonne che non esistono nel DB (PostgREST 42703 -> data: null, errore ingoiato);
F) componenti definiti dentro altri componenti e usati come JSX (remount, focus perso);
G) allarme sempre acceso (una soglia che scatta su tutto);
H) stato che resta acceso (spinner, saving, modal che non si chiudono).

REGOLE DI PRODOTTO DA RICORDARE:
- Le BASI (ricette con tipo 'interno', es. BASE BIANCA) esistono perche le ricette del gelatiere sono segrete: lui inserisce SOLO il costo al kg calcolato a mano, senza le quantita degli ingredienti. Una base NON si vende mai al cliente. Chi la tratta come prodotto finito, o pretende le sue dosi, sbaglia.
- I semilavorati (tipo 'semilavorato') invece hanno le dosi e il costo si calcola.
- Simbolo dell'euro SEMPRE dopo la cifra ("1.477 €"). Mai emoji nella UI. Niente testo sotto 12px sui numeri.`

function promptPagina(p) {
  const file = `${OUT}/${p.key}.md`
  return `${METODO}

PAGINA ASSEGNATA: ${p.key}
File principale: /Users/aler/foodos/${p.file}${p.righe ? ` (${p.righe} righe: leggilo TUTTO, non a campione)` : ''}
${p.extra ? `Altri file e tabelle rilevanti: ${p.extra}` : ''}

DA VERIFICARE:
${p.focus}

PRIMA DI COMINCIARE — RIPRESA:
Il file ${file} puo GIA esistere: e il tuo report di un tentativo precedente interrotto a meta.
Se esiste, LEGGILO per primo. Non ripetere i difetti che ci sono gia: riprendi da dove si era fermato
e aggiungi in append solo il nuovo. Se contiene la riga "## FINE" hai finito: ritorna subito i difetti
che ci trovi, senza rifare il lavoro.

COME SCRIVERE (il file e il risultato, il return e un extra):
- scrivi in APPEND su ${file} ogni volta che hai finito di verificare un difetto, non alla fine;
- ogni difetto in questo formato: titolo in italiano dal punto di vista di chi usa il tool, gravita,
  se IMPEDISCE il servizio o e RIFINITURA, lo schema noto (A-H) se corrisponde, file:riga, com'era,
  il danno concreto in una scena reale, quante righe reali sono colpite (dal DB), la correzione;
- annota anche i SOSPETTI CADUTI ("sembrava un difetto, ho verificato, non lo e, perche...");
- l'ULTIMA cosa che scrivi e la riga "## FINE" seguita dal conteggio dei difetti.

Meglio 8 difetti solidi che 30 fragili: ognuno che non regge costa tempo e fiducia.
Se non riesci a leggere tutto il file, DILLO nel report invece di fingere.`
}

if (PAGINE.length === 0) {
  log('nessuna pagina in args.pagine: niente da fare')
  return { gruppo: GRUPPO, difetti: [], pagine_ok: 0, pagine_totali: 0 }
}

// La sonda va sulla pagina piu piccola del gruppo: costa meno scoprire cosi
// che la quota non c'e.
const ordinate = [...PAGINE].sort((a, b) => (a.righe || 9999) - (b.righe || 9999))
const sondaPagina = ordinate[0]
const resto = ordinate.slice(1)

phase('Sonda')
log(`gruppo ${GRUPPO}: sondo con ${sondaPagina.key} (${sondaPagina.righe || '?'} righe)`)
const sonda = await agent(promptPagina(sondaPagina), {
  label: `sonda:${sondaPagina.key}`, phase: 'Sonda', schema: SCHEMA,
})
if (!sonda) {
  log('la sonda non e tornata: quota agenti non disponibile. Mi fermo qui invece di bruciare le altre ' + resto.length + ' pagine.')
  return { gruppo: GRUPPO, bloccato: true, difetti: [], pagine_ok: 0, pagine_totali: PAGINE.length }
}

phase('Audit')
const risultati = [sonda]
let fermato = false
for (let i = 0; i < resto.length; i += 2) {
  const blocco = resto.slice(i, i + 2)
  log(`blocco ${Math.floor(i / 2) + 1}: ${blocco.map(p => p.key).join(' + ')}`)
  const r = await parallel(blocco.map(p => () => agent(promptPagina(p), {
    label: p.key, phase: 'Audit', schema: SCHEMA,
  })))
  const vivi = r.filter(Boolean)
  risultati.push(...vivi)
  if (vivi.length === 0) {
    log(`blocco intero perso (${blocco.map(p => p.key).join(', ')}): mi fermo. I parziali sono su disco in ${OUT} e la prossima esecuzione riprende da li.`)
    fermato = true
    break
  }
}

const difetti = risultati.flatMap(r => (r.difetti || []).map(d => ({ ...d, pagina: r.pagina })))
const complete = risultati.filter(r => r.completata).map(r => r.pagina)
const incomplete = risultati.filter(r => !r.completata).map(r => r.pagina)
const nonProvate = fermato
  ? ordinate.filter(p => !risultati.some(r => r.pagina === p.key)).map(p => p.key)
  : []
if (nonProvate.length) log(`pagine non provate: ${nonProvate.join(', ')}`)

return {
  gruppo: GRUPPO,
  difetti,
  alta: difetti.filter(d => d.gravita === 'ALTA').length,
  impediscono: difetti.filter(d => d.impedisce_o_rifinitura === 'impedisce').length,
  scartati: risultati.flatMap(r => r.scartati || []),
  pagine_complete: complete,
  pagine_incomplete: incomplete,
  pagine_non_provate: nonProvate,
  pagine_ok: risultati.length,
  pagine_totali: PAGINE.length,
}
