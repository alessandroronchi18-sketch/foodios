// La sede su cui si scrive non è mai stata «la tua sede».
//
// Difetto trovato il 17/09/2026 con l'audit di sicurezza, provato sul database
// di produzione impersonando in sola lettura un dipendente vero.
//
// Le nove funzioni `stock_pf_*` prendono la sede come parametro. Controllavano
// l'azienda — `v_org := get_user_org_id(); if v_org is null then raise` — e poi
// si fidavano della sede arrivata. Nessuna delle sedici funzioni con un
// `p_sede` nominava mai la tabella `sedi`, e le regole di riga guardavano solo
// `organization_id`: il controllo «questa sede è tua» non esisteva da nessuna
// parte.
//
// Sono due difetti in uno, e il secondo è quello che conta.
//
// 1. La sede di un'ALTRA azienda. Provato sul database vero: la chiamata entra,
//    supera la guardia e arriva alla scrittura. Non è una fuga di dati — la
//    riga nasce con l'`organization_id` di chi scrive e la vittima non la vede
//    mai — ma su `user_data`, `stock_prodotti_finiti`, `movimenti_stock_pf` e
//    `trasferimenti` la chiave esterna verso `sedi` è ON DELETE RESTRICT: una
//    riga scritta da fuori inchioda quella sede, e visto che
//    `sedi.organization_id` è ON DELETE CASCADE inchioda l'azienda intera. Un
//    cliente che chiede la cancellazione dei suoi dati non la ottiene più.
//    Per colpire lì bisogna però conoscere l'uuid di una sede altrui, e gli
//    uuid non si indovinano: in produzione quelle righe sono 0 su 5 tabelle.
//
// 2. La sede sbagliata della PROPRIA azienda, che non ha bisogno di nessun
//    malintenzionato ed è quella che capita. Il tablet del laboratorio è
//    condiviso e sta fisicamente in una sede (`profiles.laboratorio_sede_id`,
//    che riempie `api/laboratorio-crea.js`). Si cambia sede, o si passa il
//    tablet a chi lavora nell'altro negozio, e in memoria resta il `sedeId` di
//    prima. Il pezzo prodotto in Carlina finiva nel conto di Berthollet: la
//    riga c'è, ma su una sede che in quella schermata non compare. Sono i
//    «prodotti fantasma» in cima ai common pitfalls di CLAUDE.md, che oggi si
//    spiegano con «trasferimento mai ricevuto» perché questa strada non la
//    conosceva nessuno. Aziende con più di una sede, il 17/09/2026: 192 su 579.
//
// La regola non era nuova: `useAuth.js` (159-171) forza già `sedeAttiva` sulla
// sede del laboratorio e si rifiuta di ripiegare su un'altra — «sarebbe grave
// imputare operazioni a una sede sbagliata», audit del 29/07/2026 — e
// `trasferimenti_lettura` la applica in lettura dal 15/09/2026. Tre endpoint la
// applicano a mano (`produzione-registra.js`, `spreco-registra.js`,
// `chiusura-registra.js`). Mancava dove fa danno: in scrittura, nel database.
//
// La prova d'attacco sta in `tests/12-sicurezza-chiave-pubblica.spec.js`, che
// crea due aziende finte con due sedi, un tablet di laboratorio vero, e prova
// a scrivere sulla sede sbagliata per davvero. Questo file guarda una cosa
// diversa: che la REGOLA resti scritta nelle migrazioni, perché un database si
// può ricreare da zero e se la migrazione sparisce il buco torna.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RADICE, 'supabase', 'migrations')
// Le migrazioni si applicano in ordine di nome: l'ultima definizione vince.
const FILE = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

// Le nove firme che prendono la sede da chi chiama. Sei nomi, perché tre
// hanno due versioni (con e senza `p_dipendente_op`) e il lettore qui sotto
// trova la prima definizione di ogni nome dentro ogni file.
const FUNZIONI_STOCK = [
  'stock_pf_carico_produzione',
  'stock_pf_scarico_vendita',
  'stock_pf_scarto',
  'stock_pf_rettifica',
  'stock_pf_carico_b2b',
  'stock_pf_scarico_b2b',
]

// Estrae il corpo di una funzione da un file di migrazione. I delimitatori
// cambiano da file a file ($$ nelle vecchie, $function$ nelle nuove): si legge
// quello che c'è invece di darlo per scontato.
function corpiIn(file, nomeFunzione) {
  const sql = readFileSync(join(DIR, file), 'utf8')
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nomeFunzione}\\s*\\(`, 'gi')
  const fuori = []
  let m
  while ((m = re.exec(sql)) !== null) {
    const resto = sql.slice(m.index)
    const tag = resto.match(/\bas\s+(\$[a-z_]*\$)/i)
    if (!tag) continue
    const dopoApertura = resto.indexOf(tag[1]) + tag[1].length
    const chiusura = resto.indexOf(tag[1], dopoApertura)
    // Via i commenti prima di leggere: un apostrofo italiano dentro un
    // commento («dov'è andato») sballa il conteggio degli apici.
    fuori.push(resto.slice(dopoApertura, chiusura === -1 ? undefined : chiusura).replace(/--[^\n]*/g, ''))
  }
  return fuori
}

function definizioni(nomeFunzione) {
  return FILE.flatMap(f => corpiIn(f, nomeFunzione).map(corpo => ({ file: f, corpo })))
}

function ultimaDefinizione(nomeFunzione) {
  const tutte = definizioni(nomeFunzione)
  if (!tutte.length) throw new Error(`nessuna definizione di ${nomeFunzione} nelle migrazioni`)
  return tutte[tutte.length - 1]
}

// Le due domande, nell'ordine in cui le fa la funzione.
const CHIEDE_AZIENDA = /sede_e_dell_azienda\s*\(/
const CHIEDE_LABORATORIO = /sede_e_del_tuo_laboratorio\s*\(/

describe('il righello: le migrazioni si leggono davvero', () => {
  it('trova tutte le firme delle funzioni dello stock, vecchie e nuove', () => {
    // Se il lettore qui sopra si rompe (un file rinominato, un delimitatore
    // diverso), tutti i controlli sotto passerebbero a vuoto.
    for (const nome of FUNZIONI_STOCK) {
      expect(definizioni(nome).length,
        `${nome}: devono esserci almeno la versione di prima e la correzione`).toBeGreaterThan(1)
    }
    // Nove firme corrette in tutto: tre funzioni ne hanno due, con e senza
    // `p_dipendente_op`. Si contano le definizioni che hanno la guardia nuova,
    // in qualunque file stiano.
    const corrette = FUNZIONI_STOCK
      .flatMap(n => definizioni(n))
      .filter(d => CHIEDE_LABORATORIO.test(d.corpo))
    expect(corrette.length, 'le firme corrette devono essere nove').toBe(9)
  })

  it('e sa riconoscere il difetto quando c\'è: sulle versioni di prima lo trova', () => {
    // La verifica del righello sul caso vero e non su uno finto: le versioni
    // precedenti il difetto ce l'avevano tutte, e il controllo lo deve vedere.
    for (const nome of FUNZIONI_STOCK) {
      const prima = definizioni(nome)[0]
      expect(CHIEDE_AZIENDA.test(prima.corpo),
        `${nome} in ${prima.file} non controllava la sede: è il difetto`).toBe(false)
      expect(CHIEDE_LABORATORIO.test(prima.corpo),
        `${nome} in ${prima.file} non guardava il laboratorio: è il difetto`).toBe(false)
    }
    // E la guardia che c'era già dev'essere lì: se sparisse quella, il
    // confronto sopra direbbe «corretto» su una funzione senza difese.
    for (const nome of FUNZIONI_STOCK) {
      expect(definizioni(nome)[0].corpo,
        `${nome}: la guardia sull'organizzazione c'era già`).toMatch(/get_user_org_id\s*\(\)/)
    }
  })
})

describe('le due domande che ogni scrittura sullo stock deve passare', () => {
  it('la sede è di questa azienda', () => {
    for (const nome of FUNZIONI_STOCK) {
      const { corpo, file } = ultimaDefinizione(nome)
      expect(CHIEDE_AZIENDA.test(corpo),
        `${nome} (${file}) deve chiedere se la sede è dell'azienda`).toBe(true)
    }
  })

  it('la sede è quella di questo tablet', () => {
    // È la guardia che ferma l'incidente senza malintenzionati: il `sedeId`
    // vecchio rimasto in memoria dopo un cambio di sede o di account.
    for (const nome of FUNZIONI_STOCK) {
      const { corpo, file } = ultimaDefinizione(nome)
      expect(CHIEDE_LABORATORIO.test(corpo),
        `${nome} (${file}) deve chiedere se la sede è quella del tablet`).toBe(true)
    }
  })

  it('le chiede prima di scrivere, non dopo', () => {
    // Una guardia dopo la scrittura non è una guardia. Si controlla che
    // entrambe le domande vengano prima della chiamata che tocca lo stock.
    for (const nome of FUNZIONI_STOCK) {
      const { corpo, file } = ultimaDefinizione(nome)
      const scrittura = corpo.search(/applica_delta_stock_pf\s*\(/)
      expect(scrittura, `${nome} (${file}): non trovo la scrittura`).toBeGreaterThan(-1)
      for (const [cosa, dove] of [['la sede', CHIEDE_AZIENDA], ['il laboratorio', CHIEDE_LABORATORIO]]) {
        const posizione = corpo.search(dove)
        // Prima che «prima», deve esserci: senza questa riga il controllo
        // passerebbe a vuoto su una funzione che la guardia non ce l'ha
        // affatto (-1 è sempre minore di qualunque posizione).
        expect(posizione, `${nome} (${file}): ${cosa} non si controlla affatto`).toBeGreaterThan(-1)
        expect(posizione, `${nome} (${file}): ${cosa} si controlla PRIMA di scrivere`).toBeLessThan(scrittura)
      }
    }
  })

  it('e la guardia sull\'organizzazione, che c\'era già, non è stata persa per strada', () => {
    // Quello che c'è intorno: correggendo si riscrive tutto il corpo della
    // funzione, ed è lì che si perdono le difese vecchie.
    for (const nome of FUNZIONI_STOCK) {
      const { corpo, file } = ultimaDefinizione(nome)
      expect(corpo.replace(/\s+/g, ' '),
        `${nome} (${file}) deve ancora rifiutare chi non ha organizzazione`)
        .toMatch(/v_org is null then raise/i)
    }
  })
})

describe('la scrittura dei dati di lavoro passa dalle stesse domande', () => {
  const { corpo, file } = ultimaDefinizione('fos_user_data_set_batch')

  it('controlla la sede, e il laboratorio', () => {
    expect(CHIEDE_AZIENDA.test(corpo), `fos_user_data_set_batch (${file})`).toBe(true)
    expect(CHIEDE_LABORATORIO.test(corpo), `fos_user_data_set_batch (${file})`).toBe(true)
  })

  it('senza chiudere fuori le chiavi di tutta l\'azienda', () => {
    // Ricettario, prezzi e regole stanno su `sede_id` nullo: 20 righe in
    // produzione. Una guardia che parla di sedi non deve toccarle.
    expect(corpo, 'la sede nulla resta ammessa').toMatch(/v_sede is not null and not public\.sede_e_dell_azienda/)
  })

  it('e non ha perso le due guardie del 16/09', () => {
    // Quello che c'è intorno, di nuovo: questa funzione era già stata
    // riscritta il 16/09 per impedire al dipendente di cancellare lo storico
    // che non può leggere.
    const piatto = corpo.replace(/\s+/g, ' ')
    expect(piatto, 'la chiave dev\'essere operativa').toMatch(/is_chiave_operativa/)
    expect(piatto, 'la chiave sensibile non si riscrive dal browser').toMatch(/is_chiave_sensibile/)
  })
})

// L'ultima versione di una regola di riga, cercata in TUTTE le migrazioni e
// non nel file che l'ha introdotta: un giorno quel file verrà rinominato o
// accorpato, e il test deve difendere la regola invece del nome di un file.
// Se non c'è da nessuna parte ritorna stringa vuota, così i controlli sotto
// dicono «manca» invece di esplodere all'import.
function politica(nome) {
  let ultima = ''
  for (const f of FILE) {
    const sql = readFileSync(join(DIR, f), 'utf8')
    const i = sql.lastIndexOf(`create policy ${nome} `)
    if (i === -1) continue
    const fine = sql.indexOf(');', i)
    ultima = sql.slice(i, fine === -1 ? undefined : fine)
  }
  return ultima
}

// Tutte le migrazioni in una stringa sola, per i controlli sui permessi.
const TUTTO = FILE.map(f => readFileSync(join(DIR, f), 'utf8')).join('\n')

describe('la seconda rete: le regole di riga', () => {
  // Le funzioni girano in SECURITY DEFINER e le regole di riga non le toccano:
  // per questo la guardia sta dentro di loro. Ma le stesse tabelle si scrivono
  // anche dritte dal browser, e lì le regole sono l'unica difesa.

  it('lo stock e i movimenti non accettano una sede che non è tua', () => {
    for (const nome of ['stock_pf_own', 'mov_stock_pf_own']) {
      const p = politica(nome)
      expect(CHIEDE_AZIENDA.test(p), `${nome}: la sede dev'essere dell'azienda`).toBe(true)
      expect(CHIEDE_LABORATORIO.test(p), `${nome}: e dev'essere quella del tablet`).toBe(true)
    }
  })

  it('i dati di lavoro nemmeno, in insert e in update', () => {
    for (const nome of ['data_insert_own', 'data_update_own']) {
      const p = politica(nome)
      expect(CHIEDE_AZIENDA.test(p), `${nome}: la sede dev'essere dell'azienda`).toBe(true)
      expect(CHIEDE_LABORATORIO.test(p), `${nome}: e dev'essere quella del tablet`).toBe(true)
    }
  })

  it('i trasferimenti controllano tutte e due le sedi', () => {
    const p = politica('trasferimenti_scrittura')
    expect(p, 'la sede di partenza').toMatch(/sede_e_dell_azienda\(sede_da/)
    expect(p, 'la sede di arrivo').toMatch(/sede_e_dell_azienda\(sede_a/)
  })

  it('e in lettura no, di proposito', () => {
    // Filtrare per sede ogni riga letta costerebbe una chiamata di funzione
    // per riga e nasconderebbe righe già scritte: è un altro problema e non si
    // risolve di nascosto. Se un giorno qualcuno lo aggiunge, questo test
    // glielo fa notare invece di lasciarglielo scoprire da un cliente che non
    // vede più il suo magazzino.
    const insert = politica('data_insert_own')
    expect(insert.includes('with check'), 'la guardia sta in scrittura').toBe(true)
    const update = politica('data_update_own')
    const primaDelWithCheck = update.slice(0, update.indexOf('with check'))
    expect(CHIEDE_LABORATORIO.test(primaDelWithCheck),
      'in `using` (cioè in lettura) la guardia del laboratorio NON ci va').toBe(false)
  })
})

describe('le due domande rispondono «sì» a chi deve lavorare', () => {
  const corpoLab = (definizioni('sede_e_del_tuo_laboratorio')[0] || {}).corpo || ''

  it('la funzione del laboratorio esiste e non è a portata di browser anonimo', () => {
    expect(corpoLab, 'la funzione dev\'esserci in una migrazione').toBeTruthy()
    expect(TUTTO).toMatch(/revoke execute on function public\.sede_e_del_tuo_laboratorio\(uuid\) from public, anon;/)
    expect(TUTTO).toMatch(/revoke execute on function public\.sede_e_dell_azienda\(uuid, uuid\) from public, anon;/)
  })

  it('chi non ha una sede fissa resta libero su tutte le sedi', () => {
    // Il titolare, e il dipendente che copre due negozi: `laboratorio_sede_id`
    // a NULL. È una decisione di prodotto e non la cambia una migrazione di
    // sicurezza. Scritta al negativo (`not exists`) proprio per questo.
    expect(corpoLab.replace(/\s+/g, ' ')).toMatch(/not exists/)
    expect(corpoLab).toMatch(/laboratorio_sede_id is not null/)
  })

  it('e la sede nulla passa, perché è un dato di tutta l\'azienda', () => {
    expect(corpoLab).toMatch(/p_sede is null/)
  })

  it('la domanda sull\'azienda invece pretende una sede: senza, la riga non si aggancia a niente', () => {
    const corpoOrg = (definizioni('sede_e_dell_azienda')[0] || {}).corpo || ''
    expect(corpoOrg, 'la funzione dev\'esserci in una migrazione').toBeTruthy()
    expect(corpoOrg).toMatch(/p_sede is not null/)
    expect(corpoOrg).toMatch(/from public\.sedi/)
  })
})

describe('la regola che c\'era già, nei tre endpoint che l\'avevano capita', () => {
  // La famiglia intorno al difetto: qualcuno la regola l'aveva scritta, in tre
  // funzioni di server su tre. Una regola che vive in tre endpoint vale per
  // quei tre — ma se un giorno la si toglie da lì pensando «tanto c'è nel
  // database», il database la applica solo alle funzioni che ha, non alle
  // scritture che passano dalla chiave di servizio (che bypassa le RLS).
  const ENDPOINT = ['api/produzione-registra.js', 'api/spreco-registra.js', 'api/chiusura-registra.js']

  it('controllano ancora che la sede sia dell\'organizzazione di chi chiama', () => {
    for (const rel of ENDPOINT) {
      const testo = readFileSync(join(RADICE, rel), 'utf8').replace(/\s+/g, ' ')
      expect(testo, `${rel}: la sede va cercata dentro l'org di chi chiama`)
        .toMatch(/from\('sedi'\)[^;]*\.eq\('organization_id', orgId\)/)
    }
  })
})
