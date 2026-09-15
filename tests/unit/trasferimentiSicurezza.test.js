// Trasferimenti fra sedi: l'audit del 15/09/2026.
//
// Il titolare l'ha definita «molto importante»: ci passano materie prime e
// prodotti finiti fra i punti vendita, e uno sbaglio lì significa **magazzino
// sbagliato in due sedi contemporaneamente**.
//
// Contesto misurato sul database: la tabella `trasferimenti` ha **zero righe**
// in produzione, con 108 organizzazioni che avrebbero i requisiti per usare la
// pagina. Nessun magazzino è già sbagliato: i difetti erano tutti latenti.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')
const migrazione = (pezzo) => {
  const DIR = join(RADICE, 'supabase', 'migrations')
  return readFileSync(join(DIR, readdirSync(DIR).find(f => f.includes(pezzo))), 'utf8')
}

const VIEW = leggi('src', 'components', 'TrasferimentiView.jsx')
const MIGR = migrazione('trasferimenti_blocco_riga_e_ruoli')
const STOCK = migrazione('stock_pf_unita_e_valore')

describe('la merce non si scala due volte', () => {
  it('l\'invio controlla se la scrittura è andata a buon fine', () => {
    // La libreria di Supabase NON lancia eccezioni: restituisce un oggetto con
    // dentro `error`. Senza controllarlo, il codice andava avanti fino a
    // «Trasferimento inviato» mentre la riga restava bozza con
    // `stock_applicato = false`. L'utente rivedeva la bozza, cliccava "Invia",
    // e il magazzino veniva scalato una SECONDA volta. In silenzio.
    expect(VIEW).toMatch(/const \{ error: errInvio, data: righeTocche \}/)
    expect(VIEW).toMatch(/if \(errInvio\) throw errInvio/)
  })

  it('e scrive solo se la riga è ancora una bozza', () => {
    // Se qualcun altro ha già agito, non si passa.
    const invio = VIEW.slice(VIEW.indexOf('errInvio'), VIEW.indexOf('errInvio') + 900)
    expect(invio).toMatch(/\.eq\('stato', 'bozza'\)/)
    expect(invio).toMatch(/già inviato da qualcun altro/)
  })

  it('l\'annullamento fa lo stesso, nel verso opposto', () => {
    // Senza controllo: la merce tornava nella sede di partenza, la riga restava
    // "inviato", e il secondo clic la rimetteva dentro una seconda volta.
    expect(VIEW).toMatch(/const \{ error: errAnn, data: righeTocche \}/)
    expect(VIEW).toMatch(/if \(errAnn\) throw errAnn/)
    const ann = VIEW.slice(VIEW.indexOf('errAnn'), VIEW.indexOf('errAnn') + 700)
    expect(ann).toMatch(/\.eq\('stato', 'inviato'\)/)
  })
})

describe('due conferme insieme non applicano due volte lo stesso carico', () => {
  it('tutte e sei le funzioni bloccano la riga mentre la leggono', () => {
    // Senza `for update`, due chiamate contemporanee leggevano ENTRAMBE lo
    // stato 'inviato', passavano entrambe, e caricavano entrambe. Non è un caso
    // di laboratorio: è il wifi lento del negozio, la pagina ricaricata, il
    // secondo clic. O due persone che confermano lo stesso arrivo.
    // Solo le righe vive: il commento in testa al file mostra apposta la forma
    // vecchia, per far vedere cos'era.
    const vive = MIGR.split('\n').filter(r => !r.trim().startsWith('--')).join('\n')
    const blocchi = vive.match(/select \* into v_t from public\.trasferimenti where id = p_id[^;]*;/g) || []
    expect(blocchi.length, 'devono essere sei letture').toBe(6)
    for (const b of blocchi) expect(b, `manca "for update": ${b}`).toContain('for update')
  })
})

describe('il dipendente riceve, e basta', () => {
  // Decisione del titolare, 15/09/2026: è lui che scarica il furgone alla sede.
  // Ma non crea, non invia e non annulla.
  it('le funzioni che spediscono e annullano rifiutano il dipendente', () => {
    const invia = MIGR.match(/FUNCTION public\.trasferimento_invia[\s\S]*?\$function\$;/g) || []
    const annulla = MIGR.match(/FUNCTION public\.trasferimento_annulla[\s\S]*?\$function\$;/g) || []
    expect(invia.length + annulla.length, 'quattro versioni fra invia e annulla').toBe(4)
    for (const f of [...invia, ...annulla]) {
      expect(f, 'manca il controllo del ruolo').toMatch(/if public\.is_dipendente\(\) then/)
    }
  })

  it('ma la ricezione no: quella è il suo lavoro', () => {
    const ricevi = MIGR.match(/FUNCTION public\.trasferimento_ricevi[\s\S]*?\$function\$;/g) || []
    expect(ricevi.length).toBe(2)
    for (const f of ricevi) expect(f).not.toMatch(/is_dipendente\(\) then\s*\n\s*raise exception 'Solo il titolare/)
  })

  it('vede solo i trasferimenti della sua sede, non quelli delle altre', () => {
    expect(MIGR).toMatch(/sede_a in \(select laboratorio_sede_id from public\.profiles where id = auth\.uid\(\)\)/)
    expect(MIGR).toMatch(/sede_da in \(select laboratorio_sede_id/)
  })

  it('la pagina gli nasconde i comandi che il database rifiuterebbe', () => {
    // Non basta il blocco sul database: mostrargli bottoni che poi danno
    // errore è un modo per farlo sentire stupido.
    expect(VIEW).toMatch(/soloRicezione = false/)
    expect(VIEW).toMatch(/\{!soloRicezione && <button onClick=\{\(\) => setShowForm/)
    expect(VIEW).toMatch(/\{!soloRicezione && <button onClick=\{\(\) => azInvia/)
    expect(VIEW).toMatch(/\{!soloRicezione && <button onClick=\{\(\) => azAnnulla/)
  })

  it('e il Dashboard gliela apre passando il ruolo', () => {
    const D = leggi('src', 'Dashboard.jsx')
    expect(D).toMatch(/soloRicezione=\{isDip\}/)
    expect(D).toMatch(/'trasferimenti',/)
  })
})

describe('le funzioni non sono più aperte all\'anonimo', () => {
  it('il permesso di chiamarle è tolto, non solo la guardia dentro', () => {
    // La guardia dentro la funzione regge, ma è una difesa sola: se domani
    // qualcuno riscrive quelle funzioni e dimentica quella riga, il buco del
    // 14 settembre torna identico.
    for (const f of ['trasferimento_invia(uuid)', 'trasferimento_annulla(uuid)',
                     'trasferimento_ricevi(uuid, numeric, text)']) {
      expect(MIGR, `manca la revoca per ${f}`).toContain(`revoke execute on function public.${f} from public, anon`)
    }
    expect(MIGR).toMatch(/revoke all on public\.trasferimenti from anon/)
  })
})

describe('le due sedi devono essere della stessa azienda', () => {
  it('c\'è un trigger che lo controlla', () => {
    // Non era controllato da nessuna parte: né trigger, né vincolo, né dentro
    // le funzioni. Si poteva creare un trasferimento verso la sede di un altro
    // cliente.
    expect(MIGR).toMatch(/create trigger trg_trasferimento_sedi_coerenti/)
    expect(MIGR).toMatch(/La sede di partenza non appartiene a questa azienda/)
    expect(MIGR).toMatch(/La sede di arrivo non appartiene a questa azienda/)
  })

  it('e nemmeno partenza e arrivo possono coincidere', () => {
    expect(MIGR).toMatch(/Partenza e arrivo sono la stessa sede/)
  })
})

describe('chili e pezzi non si sommano fra loro', () => {
  it('se l\'unità è diversa ci si ferma, non si converte a caso', () => {
    // 20 pezzi di torta non sono 20 kg, e il fattore lo sa solo chi la produce.
    expect(STOCK).toMatch(/v_unita_esistente is not null and v_unita_esistente <> v_unita/)
    expect(STOCK).toMatch(/non li posso sommare/)
  })

  it('e c\'è una funzione sola, non tre sovrapposte', () => {
    // Con tre versioni tutte con valori predefiniti, una chiamata a cinque
    // argomenti combaciava con due di loro e Postgres si rifiutava di
    // scegliere. Un controllo aggiunto a una delle tre non proteggeva le altre.
    expect(STOCK).toMatch(/drop function if exists public\.applica_delta_stock_pf\(uuid, uuid, text, numeric, text\);/)
    expect(STOCK).toMatch(/drop function if exists public\.applica_delta_stock_pf\(uuid, uuid, text, numeric, text, uuid\);/)
    expect(STOCK).toMatch(/^create function public\.applica_delta_stock_pf\(/m)
    // Drop e create insieme: o valgono tutti e due, o non cambia niente.
    expect(STOCK).toMatch(/begin;[\s\S]*drop function[\s\S]*create function[\s\S]*commit;/)
  })
})

describe('il valore della merce arriva a destinazione', () => {
  it('si scrive quando la riga nasce', () => {
    // Prima l'insert non passava `valore_unit`: la riga nella sede di arrivo
    // nasceva a zero, e il magazzino di quella sede valeva zero euro.
    expect(STOCK).toMatch(/valore_unit, updated_at, dipendente_operativo_id/)
    expect(STOCK).toMatch(/p_valore_unit, now\(\), p_dipendente_op/)
  })

  it('ma non sovrascrive quello che la sede già conosce', () => {
    expect(STOCK).toMatch(/valore_unit = coalesce\(public\.stock_prodotti_finiti\.valore_unit, excluded\.valore_unit\)/)
  })
})

describe('i chili spediti finiscono nell\'inventario, da tutte e due le strade', () => {
  it('anche dal pulsante "Invia subito"', () => {
    // Lo faceva solo il percorso "salva bozza → poi invia". Il pulsante grande
    // rosso passava dritto alla funzione del database e saltava il passaggio:
    // stesso trasferimento, due strade, due risultati — e quella sbagliata era
    // il bottone più visibile. I chili partiti risultavano venduti al banco.
    const salva = VIEW.slice(VIEW.indexOf('async function salvaBozza'), VIEW.indexOf('async function azInvia'))
    expect(salva).toMatch(/aggiungiSpedito\(orgId, form\.sede_da, prodottoSalvato/)
    expect(salva).toMatch(/metodoProduzione === 'inventario' && form\.tipo === 'prodotto'/)
  })
})

describe('una sede non si archivia con la merce in mezzo alla strada', () => {
  const SEDI = leggi('src', 'components', 'ImpostazioniSedi.jsx')

  it('anche le bozze bloccano l\'archiviazione, non solo i trasferimenti partiti', () => {
    // Prima le bozze passavano: si archiviava la sede, la bozza restava, e chi
    // cliccava "Invia" ci riusciva. Merce scalata dalla partenza e accreditata
    // a una sede che nell'interfaccia non esiste più.
    expect(SEDI).toMatch(/\.in\('stato', \['bozza', 'inviato'\]\)/)
    expect(SEDI).not.toMatch(/\.eq\('stato', 'inviato'\)/)
  })

  it('e i nomi delle sedi archiviate restano leggibili nello storico', () => {
    // `sediMap` era costruito solo sulle sedi attive: un trasferimento verso
    // una sede poi archiviata mostrava «Bozza verso —».
    expect(VIEW).toMatch(/const sediMap = Object\.fromEntries\(\(sedi \|\| \[\]\)\.map/)
  })

  it('la voce di menu conta le sedi attive, non tutte', () => {
    const D = leggi('src', 'Dashboard.jsx')
    expect(D).toMatch(/\(sedi\|\|\[\]\)\.filter\(x=>x\.attiva!==false\)\.length>1\) && navItem\("trasferimenti"/)
  })
})

describe('un errore non si mostra come una conferma', () => {
  it('la cancellazione di un modello usa `false`, non la stringa "error"', () => {
    // `notify(msg, ok = true)`: la stringa 'error' è un valore vero, quindi il
    // messaggio usciva VERDE, come se fosse andato tutto bene.
    expect(VIEW).not.toMatch(/notify\?\.\([^)]*, 'error'\)/)
    expect(VIEW).toMatch(/Non sono riuscito a cancellare il modello, riprova', false\)/)
  })
})
