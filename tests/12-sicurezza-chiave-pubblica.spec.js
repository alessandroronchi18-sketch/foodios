// @ts-check
// Quello che si può fare con la sola chiave pubblica del sito: niente.
//
// La chiave `anon` sta dentro il sito: chiunque apra il sorgente della pagina
// ce l'ha. Il 14/09/2026 un audit ha trovato che con quella chiave si poteva:
//
//   - sovrascrivere ricettario, magazzino, produzione e chiusure di
//     un'attività, conoscendone l'id (`fos_user_data_set_batch` si fidava del
//     parametro `p_org` quando non c'era un utente loggato);
//   - alterare lo stock dei prodotti finiti (`applica_delta_stock_pf`);
//   - cancellare tutto il registro delle modifiche (`cleanup_audit_log` con
//     `retain_days = 0`);
//   - annullare, inviare e ricevere trasferimenti fra sedi: il controllo di
//     proprietà era `x <> get_user_org_id()`, che per un anonimo diventa
//     `x <> NULL`, cioè NULL, e un `if` con condizione NULL non scatta.
//
// Questo test rifà quelle chiamate e pretende che vengano respinte. Non serve
// nessun account: basta la chiave pubblica, che è il punto.

import { test, expect } from '@playwright/test'

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

const ORG_FINTA = '00000000-0000-0000-0000-000000000000'
const ID_FINTO = '11111111-1111-1111-1111-111111111111'

async function chiama(percorso, corpo) {
  const r = await fetch(`${URL}/rest/v1/${percorso}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  return { stato: r.status, corpo: await r.json().catch(() => ({})) }
}

// Due modi di dire di no, e vanno bene tutti e due.
//
// 16/09/2026: un test falliva perche' pretendeva la frase «Utente senza
// organizzazione», cioe' il rifiuto che arriva da DENTRO la funzione, dopo che
// l'anonimo l'ha potuta chiamare. Nel frattempo a `anon` e' stato tolto il
// permesso di eseguirla, e la risposta e' diventata «permission denied for
// function»: fermato sulla porta, senza nemmeno entrare.
//
// Il test stava misurando la frase invece della sicurezza, e bocciava un
// miglioramento. Quello che conta e' una cosa sola: la chiamata non passa.
//
// 17/09/2026: sta qui, fuori da tutti i `describe`, perche' era dichiarata
// dentro il primo e usata anche in un altro — cioe' fuori dal suo campo
// visivo. Quel test non falliva: esplodeva con «respinta is not defined»
// prima di provare qualunque cosa. L'ha trovata `eslint --quiet`, non la
// suite, perche' i test e2e qui non girano senza la chiave di servizio.
function respinta(risposta, nome) {
  const messaggio = String(risposta.corpo?.message || '')
  const allaPorta = /permission denied/i.test(messaggio)
  const allInterno = messaggio.includes('Utente senza organizzazione')
  expect(allaPorta || allInterno,
    `${nome}: doveva essere respinta, ha risposto «${messaggio || '(nessun messaggio)'}»`).toBe(true)
}

test.describe('con la sola chiave pubblica non si fa niente', () => {
  test.skip(!URL || !ANON, 'servono SUPABASE_URL e SUPABASE_ANON_KEY')

  test('non si leggono i dati di lavoro di nessuno', async () => {
    const r = await fetch(`${URL}/rest/v1/user_data?select=*&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
    const corpo = await r.json().catch(() => ({}))
    // O permesso negato sulla tabella, o nessuna riga: mai un dato.
    if (Array.isArray(corpo)) expect(corpo.length).toBe(0)
    else expect(corpo.code).toBe('42501')
  })

  test('non si scrive nei dati di lavoro di un\'altra azienda', async () => {
    const { corpo } = await chiama('rpc/fos_user_data_set_batch', {
      p_items: [{ data_key: 'pasticceria-magazzino-v1', sede_id: null, data_value: { intruso: true } }],
      p_org: ORG_FINTA,
    })
    expect(corpo.code).toBe('42501')
    expect(String(corpo.message || '')).toContain('permission denied')
  })

  test('non si cancella il registro delle modifiche', async () => {
    const { corpo } = await chiama('rpc/cleanup_audit_log', { retain_days: 0 })
    expect(corpo.code).toBe('42501')
  })

  test('non si tocca lo stock dei prodotti finiti', async () => {
    // Sei parametri, non cinque: con cinque l'API non sa quale delle due
    // versioni scegliere e risponde prima di arrivare al permesso.
    const { corpo } = await chiama('rpc/applica_delta_stock_pf', {
      p_org: ORG_FINTA, p_sede: ID_FINTO, p_prodotto: 'X', p_delta: 999, p_unita: 'pz', p_dipendente_op: null,
    })
    expect(corpo.code).toBe('42501')
  })

  test('non si comandano i trasferimenti fra sedi', async () => {
    respinta(await chiama('rpc/trasferimento_annulla', {
      p_id: ID_FINTO, p_dipendente_op: null,
    }), 'trasferimento_annulla')

    respinta(await chiama('rpc/trasferimento_ricevi', {
      p_id: ID_FINTO, p_quantita_ricevuta: 1, p_scarto_note: null, p_dipendente_op: null,
    }), 'trasferimento_ricevi')

    // La terza: nessuno la controllava, ed e' quella che fa uscire la merce.
    respinta(await chiama('rpc/trasferimento_invia', {
      p_id: ID_FINTO, p_dipendente_op: null,
    }), 'trasferimento_invia')
  })

  test('non si leggono le chiavi delle casse', async () => {
    // Con la chiave di un cliente si scriverebbero incassi nella sua cassa.
    // Nella tabella c'è solo l'impronta, ma non deve uscire nemmeno quella.
    const r = await fetch(`${URL}/rest/v1/webhook_token?select=*&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
    const corpo = await r.json().catch(() => ({}))
    if (Array.isArray(corpo)) expect(corpo.length).toBe(0)
    else expect(corpo.code).toBe('42501')
  })

  test('non si genera la chiave di una cassa senza account', async () => {
    const { corpo } = await chiama('rpc/webhook_token_genera', { p_provider: 'tilby' })
    expect(corpo.code).toBe('42501')
    expect(String(corpo.message || '')).toContain('permission denied')
  })

  test('non si inserisce una fattura in un\'azienda altrui', async () => {
    const { corpo } = await chiama('fatture', { fornitore: 'intruso', totale: 1, organization_id: ORG_FINTA })
    expect(['42501', '23503']).toContain(corpo.code)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Audit del 16/09/2026: la chiave pubblica non basta più, ma un account sì.
//
// I test qui sopra chiudono la porta all'anonimo. Sotto ci sono due difetti di
// un'altra famiglia: chi un accesso ce l'ha — il dipendente in laboratorio, o
// chiunque abbia un account rimasto senza profilo — con una richiesta sola
// arriva dove non deve. Trovati leggendo il database di produzione in sola
// lettura, e chiusi dalle migrazioni `20260916a` e `20260916b`.
//
// Questi non si provano con la sola chiave pubblica: serve un account vero.
// Perciò creano organizzazioni EFFIMERE con la chiave di servizio, attaccano
// quelle, e le cancellano. Nessun dato di cliente viene toccato.
// ─────────────────────────────────────────────────────────────────────────────

import { hasDbEnv, serviceClient, createEphemeralOrg, createDipendenteIn, cleanupOrg } from './helpers/db.js'

// L'unica chiave che il dipendente può SCRIVERE senza poterla LEGGERE.
const CHIAVE_CIECA = 'pasticceria-giornaliero-v1'
// Chiave di controllo: operativa e non sensibile. Deve restare scrivibile,
// altrimenti la correzione ha rotto il lavoro di tutti i giorni.
const CHIAVE_DI_CONTROLLO = 'pasticceria-magazzino-v1'

const STORICO_FINTO = [
  { id: 'g-1', data: '2026-09-01', prodotti: [{ nome: 'BABA', stampi: 4 }], fcTot: 12.5 },
  { id: 'g-2', data: '2026-09-02', prodotti: [{ nome: 'BABA', stampi: 6 }], fcTot: 18.9 },
  { id: 'g-3', data: '2026-09-03', prodotti: [{ nome: 'BABA', stampi: 5 }], fcTot: 15.2 },
]

test.describe('il dipendente non cancella lo storico che non vede', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  // Il difetto, in una riga: `pasticceria-giornaliero-v1` è l'unica chiave che
  // sta insieme in `is_chiave_operativa` (il dipendente ci scrive) e in
  // `is_chiave_sensibile` (il dipendente non la legge). E `user_data` tiene
  // ogni chiave come un blocco unico, quindi scrivere vuol dire sostituire
  // tutto. Sul database di produzione, il 16/09/2026: Gelateria Demo 142
  // giornate, Mara dei Boschi 2, Pasticceria Mara 1 una.
  //
  // Perché nessuno se n'era accorto: `tests/07-dipendente-rls.spec.js` prova
  // cinque chiavi sensibili, e sono tutte e cinque NON operative. Il caso che
  // conta — quella che è tutte e due le cose — non lo provava nessuno.
  test('tre porte chiuse e una che resta aperta', async () => {
    const svc = serviceClient()
    let titolare = null, dip = null
    try {
      titolare = await createEphemeralOrg(svc, 'storico-tit')
      dip = await createDipendenteIn(svc, titolare.orgId, 'storico-dip')

      const seminato = {
        organization_id: titolare.orgId, sede_id: titolare.sedeId,
        data_key: CHIAVE_CIECA, data_value: STORICO_FINTO,
        updated_at: new Date().toISOString(),
      }
      const { error: seedErr } = await svc.from('user_data').insert(seminato)
      expect(seedErr, 'seed dello storico').toBeFalsy()

      const quanteGiornate = async () => {
        const { data } = await svc.from('user_data').select('data_value')
          .eq('organization_id', titolare.orgId).eq('data_key', CHIAVE_CIECA).maybeSingle()
        return Array.isArray(data?.data_value) ? data.data_value.length : -1
      }

      // Il righello prima della misura: lo storico c'è davvero, e il
      // dipendente davvero non lo vede. Se una di queste due salta, i tre
      // controlli dopo passerebbero per il motivo sbagliato.
      expect(await quanteGiornate(), 'lo storico deve esistere').toBe(3)
      const { data: letto } = await dip.userClient.from('user_data')
        .select('data_key').eq('organization_id', titolare.orgId).eq('data_key', CHIAVE_CIECA)
      expect((letto || []).length, 'il dipendente non deve leggere lo storico').toBe(0)

      // Porta 1 — la cancellazione diretta della riga.
      // `data_delete_own` ammetteva il dipendente su ogni chiave operativa.
      const { error: delErr } = await dip.userClient.from('user_data').delete()
        .eq('organization_id', titolare.orgId).eq('data_key', CHIAVE_CIECA)
      expect(await quanteGiornate(),
        `DELETE diretto: lo storico non deve sparire (errore: ${delErr?.message || 'nessuno'})`).toBe(3)

      // Porta 2 — la riscrittura diretta del blocco.
      const { error: updErr } = await dip.userClient.from('user_data')
        .update({ data_value: [] })
        .eq('organization_id', titolare.orgId).eq('data_key', CHIAVE_CIECA)
      expect(await quanteGiornate(),
        `UPDATE diretto: lo storico non deve svuotarsi (errore: ${updErr?.message || 'nessuno'})`).toBe(3)

      // Porta 3 — la funzione. Gira in SECURITY DEFINER, quindi le regole di
      // riga non la fermano: la guardia deve stare dentro di lei.
      const { error: rpcErr } = await dip.userClient.rpc('fos_user_data_set_batch', {
        p_items: [{ data_key: CHIAVE_CIECA, sede_id: titolare.sedeId, data_value: [] }],
        p_org: titolare.orgId,
      })
      expect(rpcErr, 'la funzione deve rifiutare, non solo non trovare la riga').toBeTruthy()
      expect(await quanteGiornate(), 'RPC: lo storico non deve svuotarsi').toBe(3)

      // La porta che resta aperta: il magazzino è il lavoro del dipendente.
      // Se questo controllo fallisce, la correzione ha chiuso troppo e il
      // laboratorio non registra più niente.
      const { error: magErr } = await dip.userClient.rpc('fos_user_data_set_batch', {
        p_items: [{ data_key: CHIAVE_DI_CONTROLLO, sede_id: titolare.sedeId, data_value: { giacenze: [{ nome: 'FARINA', qta: 7 }] } }],
        p_org: titolare.orgId,
      })
      expect(magErr, 'il dipendente deve poter scrivere il magazzino').toBeFalsy()
    } finally {
      await cleanupOrg(svc, dip)
      await cleanupOrg(svc, titolare)
    }
  })
})

test.describe('un profilo scritto da soli non fa diventare titolare', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  // Il difetto: `profile_insert_self` controlla solo `id = auth.uid()`, e su
  // `profiles` non c'era nessun trigger BEFORE INSERT. Chi ha un account senza
  // riga in `profiles` scrive una riga con l'azienda di un altro, `ruolo`
  // titolare e `approvato` true, e da quel momento `get_user_org_id()` risponde
  // con l'azienda altrui.
  //
  // Diventare "senza profilo" non è esotico: `profiles_organization_id_fkey` è
  // ON DELETE CASCADE, quindi ogni cancellazione di cliente porta via il
  // profilo e lascia l'utente. Qui sotto si ricrea esattamente quello stato.
  test('chi resta senza profilo non si assegna l\'azienda di un altro', async () => {
    const svc = serviceClient()
    let vittima = null, intruso = null
    try {
      vittima = await createEphemeralOrg(svc, 'vittima')
      intruso = await createEphemeralOrg(svc, 'intruso')

      const { error: seedErr } = await svc.from('user_data').insert({
        organization_id: vittima.orgId, sede_id: null,
        data_key: 'pasticceria-ricettario-v1',
        data_value: { ricette: { BABA: { costo: 1.23 } } },
        updated_at: new Date().toISOString(),
      })
      expect(seedErr, 'seed del ricettario della vittima').toBeFalsy()

      // Lo stato da cui parte l'attacco: utente vivo, profilo sparito. È quello
      // che lascia dietro la cancellazione di un cliente quando il passo
      // "cancella anche l'utente" non riesce. Il token dell'intruso è stato
      // emesso prima e resta valido: i JWT non si accorgono di niente.
      const { error: orfErr } = await svc.from('profiles').delete().eq('id', intruso.userId)
      expect(orfErr, 'creazione dello stato orfano').toBeFalsy()

      // L'attacco: una riga sola.
      const { error: attErr } = await intruso.userClient.from('profiles').insert({
        id: intruso.userId,
        email: intruso.email,
        organization_id: vittima.orgId,
        ruolo: 'titolare',
        approvato: true,
      })
      expect(attErr, 'inserire un profilo in un\'azienda altrui deve fallire').toBeTruthy()

      // E la prova che conta: il profilo non è finito nell'azienda della
      // vittima. Si controlla con la chiave di servizio, perché il rifiuto
      // potrebbe arrivare da un vincolo diverso da quello che ci interessa.
      const { data: profiliVittima } = await svc.from('profiles')
        .select('id, ruolo, approvato').eq('organization_id', vittima.orgId)
      expect((profiliVittima || []).some(p => p.id === intruso.userId),
        'l\'intruso non deve comparire fra i profili della vittima').toBe(false)

      // Il ricettario della vittima resta invisibile.
      const { data: rubato } = await intruso.userClient.from('user_data')
        .select('data_key').eq('organization_id', vittima.orgId)
      expect((rubato || []).length, 'l\'intruso non deve leggere i dati della vittima').toBe(0)
    } finally {
      await cleanupOrg(svc, intruso)
      await cleanupOrg(svc, vittima)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Audit del 16/09/2026, seconda parte: quello che resta aperto a chi è DENTRO.
//
// Le due famiglie qui sotto non si aprono con la chiave pubblica e nemmeno con
// un account qualsiasi: servono i panni del dipendente. Sono il tipo di difetto
// che non si vede da fuori e che costa quando qualcuno se ne va.
// Chiuse dalla migrazione `20260916d`.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('il laboratorio non vede i conti', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  // Il difetto: `fos_ricettario_dip()` e `fos_giornaliero_dip()` sono le due
  // funzioni che consegnano al dipendente i dati che la RLS gli nega, dopo
  // averli ripuliti. Ripulivano per elenco di cose da togliere, e l'elenco era
  // vecchio: usciva `foodCost1` (il food cost della ricetta) e usciva
  // `ricavoTot` (l'incasso della giornata).
  //
  // Sul database di produzione il 16/09/2026: 96 ricette su 96 portavano fuori
  // il food cost — 58 di Mara dei Boschi, 23 di Pasticceria Mara 1, 15 di
  // Gelateria Demo.
  //
  // Perché non l'aveva visto nessuno: `tests/08-accessi-dipendenti.spec.js`
  // controlla che non escano `ingredienti` e `ingredienti_costi`, cioè le due
  // cose che la funzione toglieva davvero. Misurava il codice, non la regola.
  test('il food cost e l\'incasso non escono, il nome e il prezzo sì', async () => {
    const svc = serviceClient()
    let titolare = null, dip = null
    try {
      titolare = await createEphemeralOrg(svc, 'conti-tit')
      dip = await createDipendenteIn(svc, titolare.orgId, 'conti-dip')

      const { error: errRic } = await svc.from('user_data').insert({
        organization_id: titolare.orgId, sede_id: null,
        data_key: 'pasticceria-ricettario-v1',
        data_value: {
          ingredienti_costi: { farina: { costoKg: 1.2 } },
          ricette: {
            'BABA AL RUM': {
              nome: 'BABA AL RUM', tipo: 'pezzo', unita: 12, prezzo: 3.5,
              numStampi: 4, totImpasto1: 900, foodCost1: 7.4,
              ingredienti: [{ nome: 'farina', qty1stampo: 500 }],
            },
          },
        },
        updated_at: new Date().toISOString(),
      })
      expect(errRic, 'seed del ricettario').toBeFalsy()

      const { error: errGior } = await svc.from('user_data').insert({
        organization_id: titolare.orgId, sede_id: titolare.sedeId,
        data_key: 'pasticceria-giornaliero-v1',
        data_value: [{
          id: 'g-conti', data: '2026-09-16', creataAt: new Date().toISOString(),
          ricette: [{ nome: 'BABA AL RUM', numStampi: 4 }],
          fcTot: 29.6, ricavoTot: 168, ingredientiUsati: [{ nome: 'farina', g: 2000 }],
        }],
        updated_at: new Date().toISOString(),
      })
      expect(errGior, 'seed dello storico').toBeFalsy()

      // Il righello prima della misura: la strada diretta dev'essere chiusa,
      // altrimenti non staremmo provando la funzione ma un dettaglio.
      const { data: raw } = await dip.userClient.from('user_data')
        .select('data_key').eq('organization_id', titolare.orgId)
        .in('data_key', ['pasticceria-ricettario-v1', 'pasticceria-giornaliero-v1'])
      expect((raw || []).length, 'la lettura diretta dev\'essere negata al dipendente').toBe(0)

      // ── Il ricettario ──────────────────────────────────────────────────
      const { data: ric, error: ricErr } = await dip.userClient.rpc('fos_ricettario_dip')
      expect(ricErr, `fos_ricettario_dip: ${ricErr?.message || ''}`).toBeFalsy()
      const baba = ric?.ricette?.['BABA AL RUM']
      expect(baba, 'la ricetta deve arrivare').toBeTruthy()

      expect(baba.foodCost1, 'il food cost della ricetta NON deve uscire').toBeUndefined()
      expect(baba.ingredienti, 'gli ingredienti NON devono uscire').toBeUndefined()
      expect(ric.ingredienti_costi, 'i costi degli ingredienti NON devono uscire').toBeUndefined()

      // Il controllo opposto, che vale quanto gli altri tre: se la pulizia
      // svuota la ricetta, il laboratorio non sa più cosa produrre.
      expect(baba.nome, 'il nome serve in laboratorio').toBe('BABA AL RUM')
      expect(baba.numStampi, 'gli stampi servono in laboratorio').toBe(4)
      expect(baba.totImpasto1, 'i grammi di impasto servono in laboratorio').toBe(900)
      // Il prezzo di vendita resta: è scritto sul cartellino in vetrina, e le
      // schermate del dipendente lo usano (REGOLE[nome] in Dashboard.jsx).
      expect(baba.prezzo, 'il prezzo di vendita resta').toBe(3.5)

      // ── Lo storico ─────────────────────────────────────────────────────
      const { data: gior, error: giorErr } = await dip.userClient
        .rpc('fos_giornaliero_dip', { p_sede: titolare.sedeId })
      expect(giorErr, `fos_giornaliero_dip: ${giorErr?.message || ''}`).toBeFalsy()
      const giornata = (gior || [])[0]
      expect(giornata, 'la giornata deve arrivare').toBeTruthy()

      expect(giornata.ricavoTot, 'l\'incasso della giornata NON deve uscire').toBeUndefined()
      expect(giornata.fcTot, 'il food cost della giornata NON deve uscire').toBeUndefined()
      expect(giornata.ingredientiUsati, 'gli ingredienti usati NON devono uscire').toBeUndefined()

      expect(giornata.data, 'la data serve in laboratorio').toBe('2026-09-16')
      expect(giornata.ricette?.length, 'cosa si è prodotto serve in laboratorio').toBe(1)
    } finally {
      await cleanupOrg(svc, dip)
      await cleanupOrg(svc, titolare)
    }
  })
})

test.describe('«sospeso» vuol dire sospeso', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  // Il difetto: il pulsante «Sospendi» in Personale → Laboratori mette
  // `approvato = false`. Tutte le regole di riga passano da
  // `get_user_org_id()`, che chiede `coalesce(approvato, true) = true`: per
  // loro il sospeso è fuori. Quattro funzioni SECURITY DEFINER invece si
  // leggevano l'azienda da sole, con `select organization_id from profiles
  // where id = auth.uid()`, senza guardare `approvato`. Il token resta valido
  // (i JWT non si accorgono di niente), quindi il tablet del laboratorio in
  // mano a chi se n'è andato continuava a funzionare per quelle quattro cose.
  //
  // La peggiore è `ai_usage_increment`: il costo lo passa chi chiama, il tetto
  // è 5,00 $ al giorno per azienda, e una chiamata sola spegne l'assistente
  // fino al giorno dopo.
  //
  // Il 16/09/2026 nessuno era sospeso (579 profili, tutti approvati): non è
  // mai successo. Si chiude adesso perché adesso non costa niente.
  test('chi è stato sospeso non scrive più niente a nome dell\'azienda', async () => {
    const svc = serviceClient()
    let titolare = null, dip = null
    try {
      titolare = await createEphemeralOrg(svc, 'sosp-tit')
      dip = await createDipendenteIn(svc, titolare.orgId, 'sosp-dip')

      const { data: brief, error: briefErr } = await svc.from('daily_briefs').insert({
        organization_id: titolare.orgId, data: '2026-09-16',
        contenuto: 'Riepilogo di prova', tipo: 'giornaliero',
      }).select('id').single()
      expect(briefErr, 'seed del riepilogo').toBeFalsy()

      const { data: sugg, error: suggErr } = await svc.from('ai_suggestions').insert({
        organization_id: titolare.orgId, tipo: 'prova', titolo: 'Suggerimento di prova',
        descrizione: 'Serve solo al test', dedup_key: `test-${Date.now()}`, stato: 'nuovo',
      }).select('id').single()
      expect(suggErr, 'seed del suggerimento').toBeFalsy()

      // Il righello: finché è attivo, il dipendente segna il riepilogo come
      // letto. Se questo non funziona, il resto del test proverebbe il nulla.
      const { error: primaErr } = await dip.userClient.rpc('brief_mark_opened', { brief_id: brief.id })
      expect(primaErr, `da attivo deve poter segnare il riepilogo: ${primaErr?.message || ''}`).toBeFalsy()
      const { data: b0 } = await svc.from('daily_briefs').select('opened_at').eq('id', brief.id).single()
      expect(b0?.opened_at, 'da attivo il riepilogo risulta letto').toBeTruthy()

      // Si rimette com'era e si sospende. Il token del dipendente è stato
      // emesso prima: è esattamente quello che ha in mano chi è appena stato
      // sospeso.
      await svc.from('daily_briefs').update({ opened_at: null }).eq('id', brief.id)
      const { error: sospErr } = await svc.from('profiles')
        .update({ approvato: false }).eq('id', dip.userId)
      expect(sospErr, 'sospensione del dipendente').toBeFalsy()

      // Controprova che la sospensione morde dove è sempre morsa.
      const { data: letto } = await dip.userClient.from('user_data')
        .select('data_key').eq('organization_id', titolare.orgId)
      expect((letto || []).length, 'da sospeso non legge più i dati').toBe(0)

      // 1. La spesa AI dell'azienda. Cinque dollari: il tetto di una giornata.
      await dip.userClient.rpc('ai_usage_increment', {
        p_feature: 'intruso', p_tokens_in: 0, p_tokens_out: 0, p_cost_usd: 5,
      })
      const { data: spesa } = await svc.from('ai_usage_daily')
        .select('cost_usd_estimated').eq('organization_id', titolare.orgId)
      const speso = (spesa || []).reduce((t, r) => t + Number(r.cost_usd_estimated || 0), 0)
      expect(speso, 'un sospeso non deve poter bruciare il budget AI dell\'azienda').toBe(0)

      // 2. Il riepilogo del mattino del titolare.
      await dip.userClient.rpc('brief_mark_opened', { brief_id: brief.id })
      const { data: b1 } = await svc.from('daily_briefs').select('opened_at').eq('id', brief.id).single()
      expect(b1?.opened_at, 'un sospeso non deve poter segnare come letto il riepilogo del titolare').toBeNull()

      // 3. I suggerimenti dell'AI del titolare.
      await dip.userClient.rpc('suggestion_set_state', {
        sugg_id: sugg.id, new_state: 'rifiutato', reason: 'intruso',
      })
      const { data: s1 } = await svc.from('ai_suggestions').select('stato').eq('id', sugg.id).single()
      expect(s1?.stato, 'un sospeso non deve poter archiviare i suggerimenti del titolare').toBe('nuovo')

      // 4. Le statistiche di utilizzo.
      await dip.userClient.rpc('track_view_open', { p_view_name: 'intruso' })
      const { data: viste } = await svc.from('view_usage_daily')
        .select('view_name').eq('organization_id', titolare.orgId).eq('view_name', 'intruso')
      expect((viste || []).length, 'un sospeso non deve scrivere nelle statistiche').toBe(0)
    } finally {
      await cleanupOrg(svc, dip)
      await cleanupOrg(svc, titolare)
    }
  })

  // Quello che c'è intorno: la stessa correzione non deve chiudere fuori chi
  // lavora. Un dipendente attivo continua a fare tutte e quattro le cose.
  test('il dipendente attivo continua a lavorare', async () => {
    const svc = serviceClient()
    let titolare = null, dip = null
    try {
      titolare = await createEphemeralOrg(svc, 'attivo-tit')
      dip = await createDipendenteIn(svc, titolare.orgId, 'attivo-dip')

      const { data: sugg } = await svc.from('ai_suggestions').insert({
        organization_id: titolare.orgId, tipo: 'prova', titolo: 'Suggerimento di prova',
        descrizione: 'Serve solo al test', dedup_key: `test-attivo-${Date.now()}`, stato: 'nuovo',
      }).select('id').single()

      const { error: trackErr } = await dip.userClient.rpc('track_view_open', { p_view_name: 'produzione' })
      expect(trackErr, `il dipendente attivo deve poter tracciare: ${trackErr?.message || ''}`).toBeFalsy()
      const { data: viste } = await svc.from('view_usage_daily')
        .select('open_count').eq('organization_id', titolare.orgId).eq('view_name', 'produzione')
      expect((viste || []).length, 'la statistica del dipendente attivo si scrive').toBe(1)

      await dip.userClient.rpc('suggestion_set_state', { sugg_id: sugg.id, new_state: 'letto', reason: null })
      const { data: s1 } = await svc.from('ai_suggestions').select('stato').eq('id', sugg.id).single()
      expect(s1?.stato, 'il dipendente attivo segna il suggerimento come letto').toBe('letto')
    } finally {
      await cleanupOrg(svc, dip)
      await cleanupOrg(svc, titolare)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Audit del 17/09/2026: la sede su cui si scrive non è mai stata «la tua sede».
//
// Le nove `stock_pf_*` prendono la sede come parametro. Controllano l'azienda
// — `v_org := get_user_org_id(); if v_org is null then raise` — e poi si fidano
// della sede che è arrivata. Nessuna delle sedici funzioni che hanno un
// `p_sede` nomina mai la tabella `sedi`, e le regole di riga guardavano solo
// `organization_id`: il controllo «questa sede è tua» non esisteva da nessuna
// parte.
//
// Provato sul database di produzione, in sola lettura, impersonando un
// dipendente vero e passando come `p_sede` una sede di un'altra azienda: la
// chiamata entra, supera la guardia e arriva fino alla scrittura.
//
// Non è una fuga di dati: la riga nasce con l'`organization_id` di chi scrive,
// e la vittima non la vede mai. Il danno è un altro, e dura: su `user_data`,
// `stock_prodotti_finiti`, `movimenti_stock_pf` e `trasferimenti` la chiave
// esterna verso `sedi` è ON DELETE RESTRICT. Una riga scritta da fuori su una
// sede altrui impedisce di cancellare quella sede e — visto che
// `sedi.organization_id` è ON DELETE CASCADE — l'azienda intera. Un cliente
// che chiede la cancellazione dei suoi dati non la ottiene più.
//
// La regola esisteva già, scritta in tre endpoint (`produzione-registra.js:98`,
// `spreco-registra.js:79`, `chiusura-registra.js:86`) con la stessa riga:
// «La sede deve appartenere all'org del chiamante». Valeva per quei tre.
// Chiusa dalla migrazione `20260917a`.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('la sede di un altro non è una sede tua', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  test('non si scrive nulla su una sede che non è della propria azienda', async () => {
    const svc = serviceClient()
    let vittima = null, intruso = null, dip = null
    try {
      vittima = await createEphemeralOrg(svc, 'sede-vittima')
      intruso = await createEphemeralOrg(svc, 'sede-intruso')
      dip = await createDipendenteIn(svc, intruso.orgId, 'sede-dip')

      expect(vittima.sedeId, 'la vittima deve avere una sede').toBeTruthy()
      expect(intruso.sedeId, 'l\'intruso deve avere una sede').toBeTruthy()

      const righeSullaSedeDellaVittima = async () => {
        const [{ data: st }, { data: mv }, { data: ud }] = await Promise.all([
          svc.from('stock_prodotti_finiti').select('id').eq('sede_id', vittima.sedeId),
          svc.from('movimenti_stock_pf').select('id').eq('sede_id', vittima.sedeId),
          svc.from('user_data').select('id').eq('sede_id', vittima.sedeId).eq('organization_id', intruso.orgId),
        ])
        return (st || []).length + (mv || []).length + (ud || []).length
      }

      // ── Il righello, prima della misura ────────────────────────────────
      // Sulla PROPRIA sede la stessa chiamata deve funzionare, altrimenti i
      // controlli sotto passerebbero perché non funziona niente.
      const { error: suaErr } = await intruso.userClient.rpc('stock_pf_rettifica', {
        p_sede: intruso.sedeId, p_prodotto: 'BABA', p_delta: 3, p_note: 'righello', p_dipendente_op: null,
      })
      expect(suaErr, `sulla propria sede deve funzionare: ${suaErr?.message || ''}`).toBeFalsy()
      const { data: suo } = await svc.from('stock_prodotti_finiti')
        .select('quantita').eq('organization_id', intruso.orgId).eq('sede_id', intruso.sedeId)
      expect((suo || []).length, 'la scrittura sulla propria sede è arrivata').toBe(1)

      // E la vittima parte pulita.
      expect(await righeSullaSedeDellaVittima(), 'nessuno ha ancora toccato la sede della vittima').toBe(0)

      // ── Porta 1: la funzione dello stock, con la sede di un altro ──────
      const { error: attErr } = await intruso.userClient.rpc('stock_pf_rettifica', {
        p_sede: vittima.sedeId, p_prodotto: 'INTRUSO', p_delta: 999, p_note: 'attacco', p_dipendente_op: null,
      })
      expect(attErr, 'la rettifica su una sede altrui deve essere rifiutata').toBeTruthy()

      // ── Porta 2: la stessa cosa dal tablet del laboratorio ─────────────
      const { error: dipErr } = await dip.userClient.rpc('stock_pf_carico_produzione', {
        p_sede: vittima.sedeId, p_prodotto: 'INTRUSO', p_quantita: 5,
        p_unita: 'pz', p_note: 'attacco', p_dipendente_op: null,
      })
      expect(dipErr, 'il carico su una sede altrui deve essere rifiutato anche al dipendente').toBeTruthy()

      // ── Porta 3: i dati di lavoro, con la sede di un altro ─────────────
      const { error: udErr } = await intruso.userClient.rpc('fos_user_data_set_batch', {
        p_items: [{ data_key: 'pasticceria-magazzino-v1', sede_id: vittima.sedeId, data_value: { intruso: true } }],
        p_org: intruso.orgId,
      })
      expect(udErr, 'scrivere i dati di lavoro su una sede altrui deve essere rifiutato').toBeTruthy()

      // ── Porta 4: la tabella dritta, senza passare da nessuna funzione ──
      // Le funzioni girano in SECURITY DEFINER e le regole di riga non le
      // toccano: sono due strade diverse e vanno chiuse tutte e due.
      const { error: direttoErr } = await intruso.userClient.from('stock_prodotti_finiti').insert({
        organization_id: intruso.orgId, sede_id: vittima.sedeId,
        prodotto_nome: 'INTRUSO', quantita: 1, unita: 'pz',
      })
      expect(direttoErr, 'la scrittura diretta con una sede altrui deve essere rifiutata').toBeTruthy()

      // La prova che conta: sulla sede della vittima non è rimasto niente.
      expect(await righeSullaSedeDellaVittima(),
        'nessuna riga deve essere agganciata alla sede della vittima').toBe(0)

      // ── Il danno vero: la vittima deve restare cancellabile ────────────
      // `sedi` è puntata da 30 chiavi esterne e su queste tabelle la regola è
      // ON DELETE RESTRICT: una riga scritta da fuori inchioda la sede, e con
      // lei l'azienda. È il motivo per cui questo difetto conta anche se non
      // fa uscire un solo dato.
      const { error: delErr } = await svc.from('organizations').delete().eq('id', vittima.orgId)
      expect(/foreign key|viola|sedi|stock/i.test(String(delErr?.message || '')),
        `la vittima deve restare cancellabile, invece: ${delErr?.message || ''}`).toBe(false)

      // ── Il verso opposto: chi lavora continua a lavorare ───────────────
      const { error: lavoroErr } = await dip.userClient.rpc('stock_pf_carico_produzione', {
        p_sede: intruso.sedeId, p_prodotto: 'BABA', p_quantita: 6,
        p_unita: 'pz', p_note: 'produzione vera', p_dipendente_op: null,
      })
      expect(lavoroErr, `il dipendente deve poter caricare la SUA sede: ${lavoroErr?.message || ''}`).toBeFalsy()

      const { error: magErr } = await dip.userClient.rpc('fos_user_data_set_batch', {
        p_items: [{ data_key: 'pasticceria-magazzino-v1', sede_id: intruso.sedeId, data_value: { FARINA: 12 } }],
        p_org: intruso.orgId,
      })
      expect(magErr, `il dipendente deve poter scrivere il magazzino della SUA sede: ${magErr?.message || ''}`).toBeFalsy()

      // E le chiavi di tutta l'azienda, che stanno su `sede_id` nullo, non
      // devono essere state chiuse fuori per sbaglio.
      const { error: condivisaErr } = await intruso.userClient.rpc('fos_user_data_set_batch', {
        p_items: [{ data_key: 'pasticceria-magazzino-v1', sede_id: null, data_value: { condivisa: true } }],
        p_org: intruso.orgId,
      })
      expect(condivisaErr, `la chiave condivisa (sede nulla) deve restare scrivibile: ${condivisaErr?.message || ''}`).toBeFalsy()
    } finally {
      // Prima l'intruso: se qualcosa fosse riuscito a passare, le sue righe
      // sono quelle che impediscono di cancellare la vittima.
      await cleanupOrg(svc, dip)
      await cleanupOrg(svc, intruso)
      await cleanupOrg(svc, vittima)
    }
  })

})

test.describe('lo stock con la sola chiave pubblica', () => {
  // Sta in un `describe` suo, e non insieme al test qui sopra, per una ragione
  // che si è vista il 17/09/2026: questo non ha bisogno di nessun account, gli
  // basta la chiave pubblica. Stando dentro il blocco precedente ereditava il
  // `test.skip(!hasDbEnv)` e in locale non girava mai — un controllo di
  // sicurezza saltato in silenzio è come se non ci fosse.
  test.skip(!URL || !ANON, 'servono SUPABASE_URL e SUPABASE_ANON_KEY')

  test('nemmeno indovinando la sede si tocca lo stock', async () => {
    // Le nove `stock_pf_*` sono ancora eseguibili da `anon`, ed è voluto: la
    // guardia sta dentro. Questo controllo prova che ci sia davvero, su tutte
    // le firme chiamabili senza ambiguità di tipo.
    const chiamate = [
      ['stock_pf_rettifica', { p_sede: ID_FINTO, p_prodotto: 'X', p_delta: 1, p_note: null, p_dipendente_op: null }],
      ['stock_pf_carico_produzione', { p_sede: ID_FINTO, p_prodotto: 'X', p_quantita: 1, p_unita: 'pz', p_note: null, p_dipendente_op: null }],
      ['stock_pf_scarico_vendita', { p_sede: ID_FINTO, p_prodotto: 'X', p_quantita: 1, p_unita: 'pz', p_note: null, p_dipendente_op: null }],
      ['stock_pf_scarto', { p_sede: ID_FINTO, p_prodotto: 'X', p_quantita: 1, p_note: null, p_dipendente_op: null }],
      ['stock_pf_carico_b2b', { p_sede: ID_FINTO, p_prodotto: 'X', p_quantita: 1, p_unita: 'pz', p_note: null }],
      ['stock_pf_scarico_b2b', { p_sede: ID_FINTO, p_prodotto: 'X', p_quantita: 1, p_unita: 'pz', p_note: null }],
    ]
    for (const [nome, corpo] of chiamate) {
      respinta(await chiama(`rpc/${nome}`, corpo), nome)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Audit del 17/09/2026, seconda parte: la sede sbagliata della PROPRIA azienda.
//
// Il blocco qui sopra chiude la sede di un'ALTRA azienda, e per colpire lì
// bisogna conoscere l'uuid di una sede altrui: gli uuid non si indovinano, e
// in produzione quelle righe sono zero. Questo blocco chiude il caso che non
// ha bisogno di nessun malintenzionato, e che infatti è quello che capita.
//
// Il tablet del laboratorio è condiviso e sta fisicamente in una sede:
// `api/laboratorio-crea.js` glielo scrive in `profiles.laboratorio_sede_id`.
// Si cambia sede — o si passa il tablet a chi lavora nell'altro negozio — e in
// memoria resta il `sedeId` di prima. La rettifica parte con la sede vecchia.
// Fino a oggi il database la accettava: nessuna delle nove `stock_pf_*` guarda
// `laboratorio_sede_id`, e `trasferimenti_lettura` invece lo guarda dal
// 15/09/2026. Il pezzo prodotto in Carlina finiva nel conto di Berthollet.
//
// Il danno non è un furto: è un numero che non torna e che nessuno sa
// spiegare. La riga c'è, ma su una sede che in quella schermata non compare —
// sono i «prodotti fantasma» in cima ai common pitfalls di CLAUDE.md, che oggi
// si spiegano con «trasferimento mai ricevuto» perché questa strada non la
// conosceva nessuno.
//
// Il prodotto la regola ce l'aveva già scritta in due posti su tre:
// `useAuth.js` (159-171) forza `sedeAttiva` sulla sede del laboratorio e si
// rifiuta di ripiegare su un'altra — «sarebbe grave imputare operazioni a una
// sede sbagliata», audit del 29/07/2026 — e `trasferimenti_lettura` la applica
// in lettura. Mancava in scrittura, cioè dove fa danno.
// Chiusa dalla migrazione `20260917a`.
//
// Si chiude stretta, e il verso opposto conta quanto il resto: vale solo per
// chi una sede fissa ce l'ha scritta addosso. Il titolare e il dipendente che
// copre due negozi hanno `laboratorio_sede_id` a NULL e continuano a lavorare
// su tutte le sedi.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('il tablet del laboratorio lavora sulla sua sede', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  // Una seconda sede nella stessa azienda: è la condizione perché il difetto
  // esista. In produzione il 17/09/2026 le aziende con più di una sede sono
  // 192 su 579.
  async function secondaSede(svc, orgId, nome) {
    const { data, error } = await svc.from('sedi')
      .insert({ organization_id: orgId, nome, attiva: true })
      .select('id').single()
    if (error) throw new Error('seconda sede: ' + error.message)
    return data.id
  }

  // Il tablet: un dipendente con la sede scritta addosso, come lo crea
  // `api/laboratorio-crea.js`.
  async function rendiTablet(svc, userId, sedeId) {
    const { error } = await svc.from('profiles')
      .update({ is_laboratorio_account: true, laboratorio_sede_id: sedeId })
      .eq('id', userId)
    if (error) throw new Error('account di laboratorio: ' + error.message)
  }

  test('con la sede vecchia in memoria non scrive più niente sull\'altra sede', async () => {
    const svc = serviceClient()
    let tit = null, tablet = null
    try {
      tit = await createEphemeralOrg(svc, 'lab-tit')
      const carlina = tit.sedeId
      const berthollet = await secondaSede(svc, tit.orgId, 'E2E Berthollet')
      tablet = await createDipendenteIn(svc, tit.orgId, 'lab-dip')
      await rendiTablet(svc, tablet.userId, carlina)

      const giacenzeSu = async (sedeId) => {
        const { data } = await svc.from('stock_prodotti_finiti')
          .select('prodotto_nome, quantita').eq('organization_id', tit.orgId).eq('sede_id', sedeId)
        return data || []
      }
      const movimentiSu = async (sedeId) => {
        const { data } = await svc.from('movimenti_stock_pf')
          .select('id').eq('organization_id', tit.orgId).eq('sede_id', sedeId)
        return (data || []).length
      }

      // ── Il righello, prima della misura ────────────────────────────────
      // Sulla SUA sede il tablet lavora. Se non lavorasse, i controlli sotto
      // passerebbero perché non funziona niente, non perché la regola morde.
      const { error: suaErr } = await tablet.userClient.rpc('stock_pf_carico_produzione', {
        p_sede: carlina, p_prodotto: 'BABA', p_quantita: 10,
        p_unita: 'pz', p_note: 'produzione vera', p_dipendente_op: null,
      })
      expect(suaErr, `sulla sua sede il tablet deve lavorare: ${suaErr?.message || ''}`).toBeFalsy()
      expect((await giacenzeSu(carlina)).length, 'la produzione è arrivata sulla sua sede').toBe(1)
      expect(await movimentiSu(berthollet), 'l\'altra sede parte pulita').toBe(0)

      // ── L'incidente: il `sedeId` vecchio rimasto in memoria ────────────
      // Nessun malintenzionato. Il tablet passa la sede che ha in mano, e
      // quella sede è dell'azienda giusta: il controllo «è della tua azienda»
      // qui non serve a niente.
      const { error: rettErr } = await tablet.userClient.rpc('stock_pf_rettifica', {
        p_sede: berthollet, p_prodotto: 'BABA', p_delta: -4,
        p_note: 'sedeId vecchio in memoria', p_dipendente_op: null,
      })
      expect(rettErr, 'la rettifica sull\'altra sede deve essere rifiutata').toBeTruthy()

      const { error: caricoErr } = await tablet.userClient.rpc('stock_pf_carico_produzione', {
        p_sede: berthollet, p_prodotto: 'SACHER', p_quantita: 6,
        p_unita: 'pz', p_note: 'sedeId vecchio in memoria', p_dipendente_op: null,
      })
      expect(caricoErr, 'il carico sull\'altra sede deve essere rifiutato').toBeTruthy()

      const { error: scartoErr } = await tablet.userClient.rpc('stock_pf_scarto', {
        p_sede: berthollet, p_prodotto: 'BABA', p_quantita: 2,
        p_note: 'sedeId vecchio in memoria', p_dipendente_op: null,
      })
      expect(scartoErr, 'lo scarto sull\'altra sede deve essere rifiutato').toBeTruthy()

      // ── I dati di lavoro, stessa strada ────────────────────────────────
      const { error: udErr } = await tablet.userClient.rpc('fos_user_data_set_batch', {
        p_items: [{ data_key: 'pasticceria-magazzino-v1', sede_id: berthollet, data_value: { FARINA: 99 } }],
        p_org: tit.orgId,
      })
      expect(udErr, 'il magazzino dell\'altra sede non si riscrive dal tablet').toBeTruthy()

      // ── E la tabella dritta, senza passare da nessuna funzione ─────────
      const { error: direttoErr } = await tablet.userClient.from('stock_prodotti_finiti').insert({
        organization_id: tit.orgId, sede_id: berthollet,
        prodotto_nome: 'FANTASMA', quantita: 3, unita: 'pz',
      })
      expect(direttoErr, 'la scrittura diretta sull\'altra sede deve essere rifiutata').toBeTruthy()

      // ── La prova che conta: niente prodotti fantasma ───────────────────
      // Non basta che la chiamata dia errore: quello che rompe i conti è la
      // riga rimasta su una sede che in quella schermata non c'è.
      expect((await giacenzeSu(berthollet)).length,
        'sull\'altra sede non deve esserci nessuna giacenza scritta dal tablet').toBe(0)
      expect(await movimentiSu(berthollet),
        'sull\'altra sede non deve esserci nessun movimento scritto dal tablet').toBe(0)

      // E la giacenza della sua sede non è stata scalata da una rettifica
      // partita per sbaglio: i 10 pezzi prodotti sono ancora 10.
      const sua = await giacenzeSu(carlina)
      expect(Number(sua[0]?.quantita), 'la giacenza della sua sede resta quella vera').toBe(10)
    } finally {
      await cleanupOrg(svc, tablet)
      await cleanupOrg(svc, tit)
    }
  })

  test('chi copre due negozi continua a coprirli, e il titolare pure', async () => {
    // Il verso opposto, e vale quanto l'altro: la regola nuova deve mordere
    // solo chi ha una sede scritta addosso. Un dipendente normale e il
    // titolare hanno `laboratorio_sede_id` a NULL e devono restare liberi su
    // tutte le sedi — è una decisione di prodotto, non la cambia una
    // migrazione di sicurezza.
    const svc = serviceClient()
    let tit = null, dip = null
    try {
      tit = await createEphemeralOrg(svc, 'due-negozi-tit')
      const prima = tit.sedeId
      const seconda = await secondaSede(svc, tit.orgId, 'E2E Secondo negozio')
      dip = await createDipendenteIn(svc, tit.orgId, 'due-negozi-dip')

      const { data: profilo } = await svc.from('profiles')
        .select('laboratorio_sede_id').eq('id', dip.userId).single()
      expect(profilo?.laboratorio_sede_id, 'il dipendente normale non ha una sede fissa').toBeNull()

      for (const [nome, sede] of [['la prima', prima], ['la seconda', seconda]]) {
        const { error } = await dip.userClient.rpc('stock_pf_carico_produzione', {
          p_sede: sede, p_prodotto: 'BABA', p_quantita: 2,
          p_unita: 'pz', p_note: 'copro due negozi', p_dipendente_op: null,
        })
        expect(error, `il dipendente deve poter caricare ${nome} sede: ${error?.message || ''}`).toBeFalsy()
      }

      for (const [nome, sede] of [['la prima', prima], ['la seconda', seconda]]) {
        const { error } = await tit.userClient.rpc('stock_pf_rettifica', {
          p_sede: sede, p_prodotto: 'BABA', p_delta: 1, p_note: 'inventario', p_dipendente_op: null,
        })
        expect(error, `il titolare deve poter rettificare ${nome} sede: ${error?.message || ''}`).toBeFalsy()
      }

      // E le chiavi di tutta l'azienda, che stanno su `sede_id` nullo, non
      // devono essere state chiuse fuori per sbaglio da una guardia che parla
      // di sedi.
      const { error: condivisaErr } = await tit.userClient.rpc('fos_user_data_set_batch', {
        p_items: [{ data_key: 'pasticceria-magazzino-v1', sede_id: null, data_value: { condivisa: true } }],
        p_org: tit.orgId,
      })
      expect(condivisaErr, `la chiave di tutta l'azienda resta scrivibile: ${condivisaErr?.message || ''}`).toBeFalsy()
    } finally {
      await cleanupOrg(svc, dip)
      await cleanupOrg(svc, tit)
    }
  })
})
