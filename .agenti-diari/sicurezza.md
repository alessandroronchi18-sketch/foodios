# Diario agente SICUREZZA — audit 16/09/2026

Mandato: chi può fare cosa, e dove il confine si rompe.
Regole: solo letture sul DB. Non applico migrazioni. Non committo.

---

# PRIMA DI TOCCARE IL DATABASE, LEGGI QUESTO

**Il righello della «sola lettura» si è rotto tre volte in due giorni, in tre
modi diversi. Due volte ha scritto per davvero.** Se fra sei mesi devi sondare
il database di produzione, parti da qui e non da quello che ti sembra ovvio.

### L'unico modo che funziona

```bash
psql ... <<'SQL'
begin;
set transaction read only;   -- PRIMA ISTRUZIONE dopo begin, sempre
  ...le tue query...
rollback;
SQL
```

E **provalo subito**, prima di fidarti: `create table zz_prova(x int);` deve
rispondere `ERROR: cannot execute CREATE TABLE in a read-only transaction`.
Se non risponde così, il righello è rotto e stai scrivendo in produzione.

### I tre modi in cui ha mentito

| Cosa avevo scritto | Cosa succedeva davvero |
|---|---|
| `set local default_transaction_read_only = on` **dentro** una transazione già aperta | Non serve a niente: quel flag vale per le transazioni *successive*. Le sonde hanno scritto per davvero e si sono salvate **solo** grazie al `rollback` finale |
| `PGOPTIONS='-c default_transaction_read_only=on'` | Il pooler di Supabase **non lo inoltra**: il flag resta `off`. La sonda `create table` è passata e ha creato `public.zz_sonda_righello` **in produzione** |
| `\set ON_ERROR_ROLLBACK on` in psql | Annulla `set transaction read only` senza dire niente: psql mette un SAVEPOINT prima di ogni istruzione, e `SET TRANSACTION` si comporta come `SET LOCAL`, quindi viene disfatto alla fine della sotto-transazione. Misurato: `current_setting('transaction_read_only')` passa da `on` a `off`. Le 28 istruzioni della migrazione `20260917a` sono state eseguite come se fosse per davvero |

### Cosa ho sporcato, e cosa ho rimesso a posto

Il 17/09/2026, con il secondo righello rotto, ho creato in produzione la
tabella `public.zz_sonda_righello` (una colonna, zero righe). **L'ho
cancellata io stesso quaranta secondi dopo**, dopo aver verificato che fosse
vuota e mia: `drop table public.zz_sonda_righello` → `to_regclass` risponde
NULL. Nessun dato di cliente è stato toccato, né lì né altrove; controllato
dopo ogni sonda che i conteggi fossero quelli di prima.

Con il terzo, le 28 istruzioni della migrazione non hanno lasciato niente: le
funzioni `sede_e_dell_azienda` e `sede_e_del_tuo_laboratorio` **non esistono**
nel database (verificato su `pg_proc`), e nessuna regola di riga le nomina.

### Come si controlla la sintassi di una migrazione senza applicarla

Non con `ON_ERROR_ROLLBACK`. Si spezza il file in istruzioni e si dà a ognuna
la sua transazione in sola lettura:

```
rollback; begin; set transaction read only;
<una istruzione>
```

Postgres analizza l'istruzione **prima** di accorgersi che la transazione è in
sola lettura: se torna `cannot execute CREATE FUNCTION in a read-only
transaction` la sintassi è buona, se torna `syntax error` no. Sulla
`20260917a`: 28 istruzioni su 28 respinte dal righello, zero errori di
sintassi. Attenzione a un limite: così **il corpo delle funzioni plpgsql non
viene compilato**. Quello si prova a parte, con un `do $$ ... $$` che contiene
solo i pezzi nuovi dentro un `if false then` — compila e non esegue niente.

---

## Piano (scritto prima di cominciare)
1. Verificare sul DB vero la pista «dipendente + storico produzione»
   (`pasticceria-giornaliero-v1` scrivibile ma non leggibile → rimpiazzo totale
   in `fos_user_data_set_batch` che cancella lo storico).
2. Verificare `profile_insert_self`: 1.626 `auth.users` orfani possono
   inserirsi come titolari di un'organizzazione a scelta?
3. Elencare TUTTE le funzioni SECURITY DEFINER e cercare il confronto
   `x <> get_user_org_id()` che con NULL non scatta.
4. Guardare il pannello admin (una sola password?).
5. Leggere e GIRARE `tests/12-sicurezza-chiave-pubblica.spec.js`, poi estenderlo.
6. Scrivere migrazioni additive+idempotenti in `supabase/migrations/` e test in
   `tests/unit/`.

## Stato
- [ ] 1 dipendente/storico
- [ ] 2 profiles orfani
- [ ] 3 SECURITY DEFINER
- [ ] 4 admin
- [ ] 5 righello (test 12)
- [ ] 6 migrazioni + test

## Prossimo passo
Connettermi al DB in sola lettura e fare l'inventario delle policy e delle funzioni.

---
## 25% — inventario fatto, prime due piste confermate sul DB vero

Strumenti: `psql` in sola lettura (`SET default_transaction_read_only = on`
all'inizio di ogni sessione; provato che morde: `create table` → errore).

### Confermato #1 — il dipendente cancella lo storico che non può vedere
`is_chiave_operativa` (scrivibile dal dipendente) e `is_chiave_sensibile`
(non leggibile dal dipendente) si sovrappongono su **una sola chiave**:
`pasticceria-giornaliero-v1`. Verificato con la funzione vera sul DB.
Policy `data_select_own` la esclude in lettura, `data_update_own` e
`data_insert_own` la ammettono in scrittura.
`fos_user_data_set_batch` fa `update ... set data_value = v_val` — RIMPIAZZO
TOTALE, e gira in SECURITY DEFINER quindi RLS non la ferma.
Storico a rischio, misurato oggi:
- Gelateria Demo `7d15fb9c-…4905` → 142 giornate, 56 kB
- Mara dei Boschi `889e7fc2-…8a12` → 2 giornate
- Pasticceria Mara 1 → 1 giornata

### Confermato #2 — chi non ha un profilo se ne può fare uno da titolare
`profile_insert_self` ha solo `WITH CHECK (id = auth.uid())`. Niente vincolo su
`organization_id` né su `ruolo`. Il trigger `trg_guard_profile_escalation` è
**BEFORE UPDATE**, non INSERT: sull'inserimento non guarda niente.
`ruolo` default `titolare`, `approvato` default `false` ma si può passare `true`
nell'INSERT, e `get_user_org_id()` chiede solo `approvato = true`.
Orfani oggi: **1.635** `auth.users` senza riga in `profiles` su 2.208 totali
(752 creati a settembre, 711 a giugno, 171 a luglio — tutti con email confermata).

### Già chiuso (verificato, non è più un buco)
Le `trasferimento_*` hanno ora `if public.get_user_org_id() is null then raise`
come prima riga (migrazione `20260914c`): il caso «`x <> NULL` non scatta» lì è
tappato. Idem le `stock_pf_*` (`v_org is null` → eccezione) e ad `anon` è stato
tolto l'EXECUTE su `applica_delta_stock_pf`, `cleanup_audit_log`,
`fos_user_data_set_batch`, `webhook_token_genera`.

### Righello
`tests/12-sicurezza-chiave-pubblica.spec.js` gira e fa **8/8 verde** con la
chiave `sb_publishable_`. Devo estenderlo con casi che oggi falliscono.

## Prossimo passo
Sondare in vivo le 11 SECURITY DEFINER ancora eseguibili da `anon`
(`stock_pf_*`, `track_view_open`, `suggestion_set_state`, `brief_mark_opened`,
`fos_giornaliero_dip`, `fos_ricettario_dip`, `ai_usage_increment`) e guardare
il pannello admin.

---
## 50% — sondaggio finito, una correzione importante al conteggio di ieri

### Le 11 SECURITY DEFINER ancora aperte ad `anon`: nessuna è un buco
Lette tutte sul DB (`pg_get_functiondef`). Il disegno è lo stesso per tutte:
l'organizzazione la deducono da `auth.uid()` (via `profiles` o
`get_user_org_id()`), mai da un parametro. Per un anonimo `auth.uid()` è NULL,
quindi:
- `ai_usage_increment`, `ai_usage_today_total`, `track_view_open` → `v_org is
  null then return` (esce e basta, non scrive);
- `brief_mark_opened`, `suggestion_set_state` → `organization_id in (select …
  where id = auth.uid())` → insieme vuoto → `update` su zero righe;
- `fos_giornaliero_dip`, `fos_ricettario_dip` → `organization_id =
  get_user_org_id()` cioè `= NULL` → nessuna riga;
- `compute_haccp_fuori_range`, `verify_dipendente_operativo_session`, i vari
  `log_*` e `fn_audit_*` → sono funzioni **trigger**, non chiamabili via RPC.
- `stock_pf_*` (9 firme): tutte e 9 hanno `v_org is null → raise`. Verificato.

Quindi il punto 3 del piano si chiude: **niente di nuovo da questa parte.**
Resta un'osservazione di igiene, non un buco: `is_chiave_sensibile`,
`get_user_org_id`, `get_user_ruolo`, `is_dipendente` sono leggibili da `anon` e
rispondono NULL/false — non perdono niente, ma non c'è motivo che siano
eseguibili dalla chiave pubblica.

### Correzione al buco #2: i 1.635 «orfani» NON sono persone
Ho guardato chi sono davvero, e il numero di ieri diceva la cosa sbagliata.
Tutti e 1.635 hanno l'email su `foodos-e2e.test` (752) o `foodios-e2e.test`
(882), più uno su `foodios-internal.com`: sono **gli account creati dai test
automatici**. Nessun cliente vero. Scritto come «1.635 utenti che possono
prendersi un'azienda» era allarmismo.

**Ma il buco resta, e la strada per diventare orfani è dentro il prodotto.**
`profiles_organization_id_fkey` è `ON DELETE CASCADE`: quando si cancella
un'organizzazione, le righe `profiles` spariscono, l'utente in `auth.users` no.
`azElimina` (api/lib/admin/eliminaCliente.js) cancella gli utenti auth **dopo**,
uno per uno, best-effort — e il commento nel codice lo dice già: «Tracciare
fallimenti per evitare utenti orfani che possono ancora fare login senza
profilo». Ogni cancellazione di cliente in cui quel passo fallisce fabbrica un
orfano con password valida ed email confermata. Oggi ce ne sono 1.635 così.

### La prova del buco #2, pezzo per pezzo (tutto letto dal DB)
| Cosa | Valore |
|---|---|
| `profile_insert_self` WITH CHECK | `(id = auth.uid())` — e basta |
| trigger BEFORE INSERT su `profiles` | **0** |
| `authenticated` può INSERIRE `organization_id` | **sì** |
| `authenticated` può INSERIRE `ruolo` | **sì** |
| `authenticated` può INSERIRE `approvato` | **sì** |
| `authenticated` può AGGIORNARE `ruolo` | no |

L'ultima riga è la chiave di lettura: la migrazione `20260914g` ha protetto le
colonne in **UPDATE** e si è dimenticata l'**INSERT**. Chi ha un account senza
profilo scrive una riga sola e diventa titolare approvato di Mara dei Boschi.

### Il buco #1, rimisurato oggi
`pasticceria-giornaliero-v1`, unica chiave insieme operativa e sensibile:
- Gelateria Demo — 142 giornate, 56 kB, ultimo aggiornamento 20/06
- Mara dei Boschi — 2 giornate, 15/09
- Pasticceria Mara 1 — 1 giornata, 27/05

## Prossimo passo
Scrivere le due migrazioni (additive, idempotenti, NON applicate) e i test che
falliscono sul codice di oggi.

---
## 75% — le due migrazioni e i tre test ci sono, e sono verdi

Scritte (NON applicate, le applica il titolare):
- `supabase/migrations/20260916a_dipendente_non_cancella_lo_storico.sql`
- `supabase/migrations/20260916b_un_profilo_non_ti_fa_titolare.sql`

Test, tutti e tre verdi (23 casi): `dipendenteNonCancellaStorico.test.js`,
`profiloNonTiFaTitolare.test.js`, `invitoNonApprovatoNonEntra.test.js`.
Il terzo è nato guardando il pannello admin: `verificaToken` in
`api/lib/auth.js` faceva entrare chi il database considerava fuori
(`approvato = false`). Corretto lì, con `=== false` per non chiudere fuori le
righe vecchie con `approvato` nullo.

## Prossimo passo
Le 11 SECURITY DEFINER lette finora solo dagli occhi di un ANONIMO. Manca la
seconda e la terza domanda: cosa ci fa un DIPENDENTE (che ha un uid vero e
passa ogni guardia `auth.uid()`), e cosa ci fa un EX DIPENDENTE. Poi il
pannello admin. Poi i casi nuovi in `tests/12-sicurezza-chiave-pubblica.spec.js`.

---
## 90% — le 11 funzioni guardate con tre paia d'occhi, e due buchi nuovi

La domanda era una sola, ripetuta tre volte per ogni funzione: cosa ci fa **chi
ha solo la chiave pubblica**, cosa ci fa **un dipendente**, cosa ci fa **un ex
dipendente**. Tabella completa, tutto letto sul database di produzione.

| Funzione | Chiave pubblica (anonimo) | Dipendente attivo | Sospeso / ex |
|---|---|---|---|
| `stock_pf_*` (9 firme) | respinta: `v_org is null → raise` | **sì, ed è voluto**: la pagina Magazzino è sua (`VISTE_DIPENDENTE`) | no: `get_user_org_id()` è NULL |
| `track_view_open` | esce senza scrivere | sì | **sì, e non doveva** |
| `suggestion_set_state` | zero righe toccate | sì | **sì, e non doveva** |
| `brief_mark_opened` | zero righe toccate | sì | **sì, e non doveva** |
| `ai_usage_increment` | esce senza scrivere | sì | **sì, e non doveva** |
| `fos_giornaliero_dip` | nessuna riga | sì, **ma con dentro l'incasso** | no |
| `fos_ricettario_dip` | nessuna riga | sì, **ma con dentro il food cost** | no |

### Buco #3 — il food cost esce dalla funzione che serve a nasconderlo
`fos_ricettario_dip()` toglie `ingredienti_costi` e, dentro ogni ricetta,
`ingredienti` e `ingredienti_semilavorati`. Lascia `foodCost1`.
Provato per davvero, impersonando in sola lettura un profilo di Mara dei Boschi
(`begin; set local role authenticated; set_config('request.jwt.claims', …)`):
la funzione risponde **58 ricette, 58 con `foodCost1`, 7 con un valore vero** —
per esempio `{"nome":"SACHER", …, "foodCost1":1.04}`.
In tutto: 96 ricette su 96 fra Mara dei Boschi (58), Pasticceria Mara 1 (23) e
Gelateria Demo (15).
Stessa dimenticanza in `fos_giornaliero_dip`: toglie `fcTot` e
`ingredientiUsati`, lascia `ricavoTot` (l'incasso della giornata; oggi su 2
giornate).
Il prezzo di vendita resta, **ed è voluto**: sta sul cartellino in vetrina e le
schermate del dipendente lo usano (`REGOLE[nome]`, Dashboard.jsx ~1353).
Perché era verde: `tests/08-accessi-dipendenti.spec.js` controlla che non
escano `ingredienti` e `ingredienti_costi`, cioè le due cose che la funzione
toglieva. Misurava il codice, non la regola.

### Buco #4 — «Sospendi» non sospende del tutto
Il pulsante in Personale → Laboratori (`Personale.jsx` ~1738) mette
`approvato = false`. Ma quattro funzioni SECURITY DEFINER si leggono l'azienda
da sole con `select organization_id from profiles where id = auth.uid()`, senza
`approvato`, mentre `get_user_org_id()` lo controlla. Il token resta valido,
quindi il tablet di chi se n'è andato può ancora: bruciare il budget AI
(`ai_usage_increment`, il costo lo passa chi chiama, tetto **5,00 $/giorno**:
una chiamata e l'assistente si spegne fino a domani), archiviare i suggerimenti
del titolare, far sparire il riepilogo del mattino, gonfiare le statistiche.
Oggi non è mai successo: 579 profili, tutti `approvato = true`.
Di più: `ai_usage_increment` e `ai_usage_today_total` **nessuno le chiama**
(cercate in `src/` e `api/`: il server usa le `_org`, di solo `service_role`).
Sono superficie e basta.

### Pannello admin (punto 4 del piano) — chiuso
`verificaAdmin` sta in un posto solo (`api/admin.js` la importa, niente copia
divergente). Email + MFA aal2; le deroghe (`DISABLE_ADMIN_MFA`,
`ADMIN_MFA_WHITELIST`) valgono solo senza `VERCEL_URL`, cioè mai in un deploy.
Resta `ADMIN_PROD_MFA_BYPASS`, che però **si disattiva da sola** appena il
fondatore attiva un secondo fattore. Sul database: `auth.mfa_factors` è
**vuota** — zero fattori, di nessuno. Quindi oggi, in produzione, il pannello
admin è protetto da **una sola password**. Non è codice da scrivere: sono due
minuti in Impostazioni → Sicurezza.

### Trovato e NON corretto (lo scrivo perché non si perda)
`movimenti_stock_pf` ha la colonna `created_by` e **nessuna delle funzioni la
riempie**: 24 movimenti in produzione, 0 con l'autore (10 vendite, 9 produzioni,
3 invii, 2 annulli). `stock_pf_rettifica` (che il dipendente può chiamare, ed è
voluto) scrive una riga `rettifica_manuale` senza dire chi l'ha fatta. Il
registro dice che sono spariti dei pezzi, non dice chi l'ha scritto. Non l'ho
toccato: i file del magazzino sono di un altro agente in questo momento.

## Fatto in questo passo
- `supabase/migrations/20260916d_il_dipendente_non_vede_i_conti.sql` (NON applicata):
  i due filtri riscritti **a elenco di ammessi** invece che a sottrazione, le
  cinque funzioni che passano da `get_user_org_id()`, e i permessi tolti ad
  `anon`/`authenticated` sulle due funzioni AI morte.
  Provata a secco in sola lettura su tutti i dati veri: 96/96 ricette escono
  senza food cost e con nome+prezzo+stampi, 145/145 giornate senza
  incasso/fcTot e con data+contenuto.
- `tests/12-sicurezza-chiave-pubblica.spec.js`: tre prove d'attacco nuove
  (il laboratorio che non vede i conti, il sospeso che non scrive più niente,
  e il controllo opposto: il dipendente attivo lavora ancora).
- `tests/unit/ilLaboratorioNonVedeIConti.test.js`: 11 controlli sulle
  migrazioni. **Verificato che falliscono prima della correzione**: tolta la
  migrazione, 6 su 11 diventano rossi (i 5 verdi sono i controlli del righello
  e quelli del verso opposto, che devono passare sempre).

## Prossimo passo
Suite intera + eslint + controllo accenti, poi il riassunto finale.

---
## Ripresa del 17/09/2026 — tre migrazioni sono APPLICATE in produzione

Il titolare le ha lette una per una e applicate: `20260916a`, `20260916b`,
`20260916d`. Quello che ha verificato lui, e che vale più di quello che avevo
scritto io:

- **20260916a** — il commento della migrazione era **sbagliato**. Diceva che la
  pagina Produzione «non scrive dal browser»: falso, `ProduzioneGiornalieraView`
  scrive in quattro punti (righe 200, 278, 551, 651). La migrazione è sicura per
  un altro motivo, che ho riverificato adesso sul codice:
  - riga **551**: è il ramo `if (isDipendente)` (riga 535) e passa da
    `/api/produzione-registra`, cioè dal server con la chiave di servizio, poi
    fa `return` a riga 586 — il dipendente non arriva mai più in basso;
  - riga **651**: `handleConferma` del **titolare**, dopo quel `return`;
  - righe **200** e **278**: modifica ed elimina sessione, che stanno nella
    linguetta **Storico**, al dipendente preclusa (riga 757 gli mostra solo
    «Nuova sessione», riga 1205 chiude il pannello con `!isDipendente`).
  → commento della migrazione da correggere. FATTO in questo passo.
- **20260916b** — provata una registrazione vera dentro una transazione
  annullata: il trigger crea il profilo con ruolo titolare, organizzazione e
  approvazione, come prima. Nessuna regressione.
- **20260916d** — confrontati i campi sui dati veri: smette di passare **solo
  `foodCost1`**, cioè esattamente quello che doveva sparire. Le quattro
  funzioni ora passano da `get_user_org_id()`.

### Cosa resta (il lavoro di oggi)
1. Correggere il commento di `20260916a` (fuorviante per chi lo leggerà).
2. Le SECURITY DEFINER ancora eseguibili da `anon` non ancora sondate **in
   vivo**: `stock_pf_*`, `fos_giornaliero_dip`, `fos_ricettario_dip`. Tre paia
   d'occhi: chiave pubblica, dipendente, ex dipendente.
3. Pannello admin (ri-guardarlo dopo le migrazioni applicate).
4. Estendere `tests/12-sicurezza-chiave-pubblica.spec.js` con i casi nuovi:
   **ognuno deve fallire PRIMA della correzione.**

## Prossimo passo
Correggere il commento di `20260916a`, poi risondare le funzioni sul DB vero
con lo stato POST-migrazioni.

---
## Buco #5 — la sede di un altro non è mai stata «di un altro»

Sondate in vivo le nove `stock_pf_*`, con tre paia d'occhi. Le prime due
risposte sono quelle attese, la terza no.

| Chi | Cosa succede |
|---|---|
| chiave pubblica (`anon`) | respinta: `Utente senza organizzazione`. Provate tutte e sei le firme chiamabili |
| ex dipendente / uid senza profilo | respinta allo stesso modo (`get_user_org_id()` è NULL) |
| dipendente attivo, sede SUA | funziona, ed è giusto: il Magazzino è la sua pagina |
| **dipendente attivo, sede DI UN'ALTRA AZIENDA** | **funziona** |

Provato sul database di produzione impersonando il dipendente vero di «Casa
Anita» e passando come `p_sede` una sede di Mara dei Boschi: la chiamata entra,
supera la guardia sull'organizzazione e arriva fino alla scrittura.
Nessuna delle 16 funzioni che prendono un `p_sede` nomina mai la tabella
`sedi`: il controllo «questa sede è tua» non esiste da nessuna parte. Nemmeno
nelle regole di riga: `stock_pf_own`, `mov_stock_pf_own`, `data_*_own` e
`trasferimenti_scrittura` controllano solo `organization_id`.

**Cosa NON si può fare (dirlo è importante quanto il resto):** non si legge
niente di altri. La riga nasce con l'`organization_id` di chi scrive, quindi la
vittima non la vede mai. Non è una fuga di dati.

**Cosa si può fare davvero, in ordine di quanto costa:**
1. `sedi` è puntata da 30 chiavi esterne, e su `user_data`,
   `stock_prodotti_finiti`, `movimenti_stock_pf`, `trasferimenti`,
   `inventario_produzione`, `costi_aziendali`, `forecast_giornaliero`,
   `pos_scontrini` la regola è **ON DELETE RESTRICT**. Una riga scritta da
   fuori su una sede altrui **impedisce per sempre di cancellare quella sede**
   — e siccome `sedi.organization_id` è `ON DELETE CASCADE`, impedisce di
   cancellare **l'intera azienda**. «Elimina cliente» nel pannello admin
   (`admin_org_cascade_delete`, `api/lib/admin/eliminaCliente.js`) fallirebbe
   con un errore di chiave esterna che nessuno saprebbe spiegare. Un cliente
   che chiede la cancellazione dei suoi dati non la può ottenere.
2. Si sporca il proprio magazzino: giacenze e movimenti agganciati a una sede
   che nella propria barra laterale non esiste. Sono invisibili nelle pagine e
   contati negli export e nei totali — cioè i «prodotti fantasma» che stanno
   in cima ai common pitfalls di CLAUDE.md.
3. Dentro la stessa azienda: le `stock_pf_*` non guardano nemmeno
   `profiles.laboratorio_sede_id`, che invece `trasferimenti_lettura` guarda.
   Chi lavora in Carlina può rettificare le giacenze di Berthollet.

**Quanto è probabile, detto onesto:** per colpire un altro bisogna conoscere
l'uuid di una sua sede, e gli uuid non si indovinano. Oggi in produzione le
righe con una sede di un'altra azienda sono **0** su tutte e cinque le tabelle
controllate. La versione che succede da sola, senza nessun malintenzionato, è
un `sedeId` vecchio rimasto in memoria dopo un cambio di sede o di account sul
tablet condiviso: la scrittura riesce lo stesso e sparisce dalla vista.

### Lezione sul righello (mi sono quasi fatto male) — vedi il cappello in cima
La prima sonda usava `set local default_transaction_read_only = on` **dentro**
una transazione già aperta: non serve a niente, il flag vale solo per le
transazioni successive. Le chiamate hanno scritto davvero, e si sono salvate
solo per il `rollback` finale. Verificato subito dopo: `SONDA` non esiste in
nessuna tabella, i totali di produzione sono quelli di ieri (24 movimenti, 21
giacenze, 0 righe su «Casa Anita»). Il modo giusto è **`set transaction read
only`** come prima istruzione dopo `begin`, e si vede che morde perché
l'errore diventa `cannot execute SELECT FOR UPDATE in a read-only transaction`
— che poi è anche la prova che la chiamata era arrivata fin lì.

### Pannello admin — ricontrollato oggi, identico
`auth.mfa_factors`: **0 righe, 0 verificate**, su 2.214 utenti. Finché è così,
`ADMIN_PROD_MFA_BYPASS` resta attivo (si spegne da sé al primo fattore
verificato) e il pannello admin è protetto **da una sola password**. Non è
codice: sono due minuti in Impostazioni → Sicurezza.

## Prossimo passo
Migrazione `20260917a` (NON applicata) + i casi nuovi in
`tests/12-sicurezza-chiave-pubblica.spec.js`, che devono fallire PRIMA.

---
## 100% — chiuso. Riepilogo di tutto, dal più caro al meno caro

Due giorni di lavoro, cinque buchi e una cosa che non è codice. Qui sotto sono
in ordine di **quanto costano davvero se restano lì**, non di quanto sono
difficili da spiegare. Ogni riga dice chi può fare cosa, con i nomi veri.

### 1. Il pannello admin è protetto da una sola password — NON è codice, e non l'ho chiuso io
Su 2.214 utenti, `auth.mfa_factors` ha **zero righe**: nessuno, nemmeno il
fondatore, ha un secondo fattore. Finché è così `ADMIN_PROD_MFA_BYPASS` resta
attivo (si spegne da solo al primo fattore verificato) e **chi ha la password
del fondatore entra nel pannello admin**: da lì vede l'elenco di tutti i
clienti, i loro incassi, e ha il pulsante che cancella un cliente intero.
È il buco più caro che c'è, e si chiude in due minuti in
Impostazioni → Sicurezza: nessuno deve scrivere una riga di codice.
Ricontrollato oggi, identico a ieri.

### 2. Chi resta senza profilo si prende l'azienda di un altro — CHIUSO (`20260916b`, applicata)
Con un account che ha perso la sua riga in `profiles` bastava **una INSERT
sola** — `organization_id` di un'altra azienda, `ruolo: titolare`,
`approvato: true` — e da quel momento `get_user_org_id()` rispondeva con
l'azienda altrui: ricettario, food cost, incassi, tutto.
Restare senza profilo non è esotico: `profiles_organization_id_fkey` è ON
DELETE CASCADE, quindi **ogni cancellazione di cliente** porta via il profilo e
lascia l'utente con la sua password. `azElimina` cancella gli utenti dopo, uno
per uno, best-effort: ogni volta che quel passo non riesce, fabbrica uno di
questi. Oggi ce ne sono 1.635 — e su questo ho corretto me stesso: sono
**tutti** account dei test automatici (`foodos-e2e.test`, `foodios-e2e.test`),
nessun cliente vero. Scriverlo come «1.635 persone possono prendersi
un'azienda» era allarmismo. Il buco però era vero, e la strada per diventare
orfani è dentro il prodotto.

### 3. Il dipendente cancella lo storico che non gli è dato vedere — CHIUSO (`20260916a`, applicata)
`pasticceria-giornaliero-v1` è l'unica chiave che sta **insieme** fra quelle
che il dipendente può scrivere e quelle che non può leggere. `user_data` tiene
ogni chiave come un blocco unico, quindi scrivere vuol dire **sostituire
tutto**. Un dipendente che salva la giornata di oggi cancellava tutto lo
storico, senza sapere nemmeno cosa stava cancellando.
Quanto storico: Gelateria Demo **142 giornate** (56 kB), Mara dei Boschi 2,
Pasticceria Mara 1 una.

### 4. Il food cost e l'incasso escono dalla funzione che serve a nasconderli — CHIUSO (`20260916d`, applicata)
`fos_ricettario_dip()` è la funzione che consegna al laboratorio le ricette
ripulite. Ripuliva **per elenco di cose da togliere**, e l'elenco era rimasto
indietro: passava `foodCost1`. Provato impersonando un profilo vero: la SACHER
di Mara dei Boschi arrivava con `foodCost1: 1.04`. In tutto **96 ricette su
96** (58 Mara dei Boschi, 23 Pasticceria Mara 1, 15 Gelateria Demo).
Stessa dimenticanza su `fos_giornaliero_dip`: passava `ricavoTot`, l'incasso
della giornata. Chi lavora al banco leggeva i margini dell'azienda.
Corretto riscrivendole **a elenco di ammessi** invece che a sottrazione: da
oggi esce solo quello che è scritto che deve uscire. Il prezzo di vendita
resta, ed è voluto: sta sul cartellino in vetrina.

### 5. «Sospendi» non sospendeva del tutto — CHIUSO (`20260916d`, applicata)
Il pulsante in Personale → Laboratori mette `approvato = false`, e tutte le
regole di riga lo rispettano. Quattro funzioni no: si leggevano l'azienda da
sole con `select organization_id from profiles where id = auth.uid()`, senza
guardare l'approvazione. Il token resta valido (i JWT non si accorgono di
niente), quindi **il tablet di chi se n'è andato ieri** poteva ancora:
bruciare il budget AI dell'azienda — il costo lo passa chi chiama e il tetto è
**5,00 $ al giorno**, cioè una chiamata sola e l'assistente si spegne fino a
domani — archiviare i suggerimenti del titolare, far sparire il riepilogo del
mattino, gonfiare le statistiche.
Non è mai successo: 579 profili, tutti approvati. Si è chiuso adesso perché
adesso non costava niente.

### 6. La sede su cui si scrive non è mai stata «la tua sede» — SCRITTA, NON APPLICATA (`20260917a`)
Sono due cose in una, e **la seconda è quella che conta**.

**La sede di un'altra azienda.** Le nove `stock_pf_*` prendono la sede come
parametro, controllano l'azienda e poi si fidano. Nessuna delle sedici funzioni
con un `p_sede` nomina mai la tabella `sedi`. Provato sul database vero,
impersonando un dipendente: la chiamata entra, supera ogni guardia e **arriva
alla scrittura** — l'ultima riga del registro dice
`applica_delta_stock_pf line 7`, cioè il `select ... for update` con cui la
scrittura comincia.
Non è una fuga di dati: la riga nasce con l'azienda di chi scrive, la vittima
non la vede mai. Il danno è un altro e dura. Su cinque tabelle la chiave
esterna verso `sedi` è ON DELETE RESTRICT, e `sedi.organization_id` è ON DELETE
CASCADE: **una riga scritta da fuori inchioda quella sede, e con lei l'azienda
intera**. «Elimina cliente» nel pannello admin fallirebbe con un errore di
chiave esterna che nessuno saprebbe spiegare, e un cliente che chiede la
cancellazione dei suoi dati non la otterrebbe più.
Quanto è probabile, detto onesto: per colpire qualcun altro bisogna conoscere
l'uuid di una sua sede, e gli uuid non si indovinano. Un ex dipendente che
l'uuid della sede ce l'ha ancora nella cronologia del browser non ci fa niente
di utile per sé — `get_user_org_id()` per lui è NULL e viene respinto prima.

**La sede sbagliata della propria azienda, ed è quella che capita.** Il tablet
del laboratorio è condiviso e sta fisicamente in una sede. Si cambia sede, o lo
si passa a chi lavora nell'altro negozio, e in memoria resta il `sedeId` di
prima. La rettifica parte con la sede vecchia, **il database la accetta**, e il
pezzo prodotto in Carlina finisce nel conto di Berthollet: la riga c'è, ma su
una sede che in quella schermata non compare. Sono i **«prodotti fantasma»** in
cima ai common pitfalls di CLAUDE.md, quelli che oggi si spiegano con
«trasferimento mai ricevuto» perché questa strada non la conosceva nessuno.
Nessun malintenzionato, nessuno che abbia sbagliato qualcosa: solo un numero
che non torna. Aziende con più di una sede oggi: **192 su 579**.
La regola il prodotto ce l'aveva già scritta in due posti su tre —
`useAuth.js` (159-171) forza `sedeAttiva` sulla sede del laboratorio e si
rifiuta di ripiegare su un'altra, «sarebbe grave imputare operazioni a una sede
sbagliata» (audit 29/07/2026), e `trasferimenti_lettura` la applica in lettura
dal 15/09. Mancava in scrittura, cioè dove fa danno. Tre endpoint la applicano
a mano (`produzione-registra.js:98`, `spreco-registra.js:79`,
`chiusura-registra.js:86`): una regola che vive in tre funzioni di server vale
per quelle tre.
Si chiude **stretta**: solo per chi ha una sede scritta addosso
(`laboratorio_sede_id`, che `api/laboratorio-crea.js` riempie insieme a
`is_laboratorio_account`). Il titolare e il dipendente che copre due negozi
hanno quella colonna a NULL e restano liberi su tutte le sedi — quella è una
decisione di prodotto e non la cambia una migrazione di sicurezza.
Oggi in produzione: **0** account di laboratorio, **0** righe su una sede
altrui su cinque tabelle. Applicarla non toglie niente a nessuno.

### 7. Il registro non dice chi ha scritto — TROVATO, NON CORRETTO
`movimenti_stock_pf` ha la colonna `created_by` e **nessuna funzione la
riempie**: 24 movimenti in produzione, zero con l'autore. `stock_pf_rettifica`
— che il dipendente può chiamare, ed è voluto — scrive una riga
`rettifica_manuale` senza dire chi l'ha fatta. Il registro dice che sono
spariti dei pezzi, non dice chi l'ha scritto. Non l'ho toccato: i file del
magazzino erano di un altro agente.

### 8. Un test di sicurezza che esplodeva invece di provare qualcosa — CORRETTO oggi
In `tests/12-sicurezza-chiave-pubblica.spec.js` la funzione `respinta` era
dichiarata **dentro** il primo `describe` e usata anche in un altro: quel test
non falliva, moriva con `respinta is not defined` prima di provare qualunque
cosa. L'ha trovata `eslint --quiet`, non la suite, perché quei test in locale
non girano (manca la chiave di servizio). Spostata a livello di file.
Insieme: il controllo «con la sola chiave pubblica non si tocca lo stock» aveva
ereditato un `test.skip(!hasDbEnv)` che non gli serviva — gli basta la chiave
pubblica — e in locale non girava mai. Ora sta in un `describe` suo e gira: un
controllo di sicurezza saltato in silenzio è come se non ci fosse.

### Igiene, non buchi
`is_chiave_sensibile`, `get_user_org_id`, `get_user_ruolo`, `is_dipendente`
sono eseguibili con la chiave pubblica e rispondono NULL/false: non perdono
niente, ma non c'è motivo che siano lì. Le undici SECURITY DEFINER aperte ad
`anon` le ho lette tutte: l'organizzazione la deducono da `auth.uid()`, mai da
un parametro, quindi per un anonimo escono a vuoto. Il punto 3 del piano si
chiude senza novità.

## Cosa lascio, file per file

**Migrazioni** (`supabase/migrations/`, nessuna applicata da me):
- `20260916a_dipendente_non_cancella_lo_storico.sql` — applicata dal titolare
- `20260916b_un_profilo_non_ti_fa_titolare.sql` — applicata dal titolare
- `20260916d_il_dipendente_non_vede_i_conti.sql` — applicata dal titolare
- `20260917a_la_sede_deve_essere_tua.sql` — **scritta, da leggere e applicare**

**Test** (48 controlli in cinque file, più due prove d'attacco nuove):
- `tests/unit/dipendenteNonCancellaStorico.test.js` (5)
- `tests/unit/profiloNonTiFaTitolare.test.js` (7)
- `tests/unit/invitoNonApprovatoNonEntra.test.js` (5)
- `tests/unit/ilLaboratorioNonVedeIConti.test.js` (11)
- `tests/unit/laSedeDeveEssereTua.test.js` (18, nuovo oggi)
- `tests/12-sicurezza-chiave-pubblica.spec.js` — da 8 a 17 prove

**Codice**: `api/lib/auth.js`, dove `verificaToken` faceva entrare chi il
database considerava fuori (`approvato = false`). Corretto con `=== false`, per
non chiudere fuori le righe vecchie con `approvato` nullo.

## Il righello, sui test nuovi
`laSedeDeveEssereTua.test.js`: **18 verdi con la migrazione, 13 rossi senza**.
I 5 che restano verdi sono quelli che devono restare verdi sempre — i controlli
del righello (sanno riconoscere il difetto sulle versioni vecchie) e quelli del
verso opposto (le difese che c'erano già non si sono perse).

Le due prove d'attacco nuove nello spec 12 **non le ho potute far girare**:
servono `SUPABASE_SERVICE_KEY` e qui non c'è, quindi si saltano. Lo scrivo
invece di far finta. Quello che ho potuto provare, sul database vero, è la
stessa cosa da due lati:
- **prima**: nessuna delle nove `stock_pf_*` in produzione nomina `sedi` o
  `laboratorio_sede_id` (letto da `pg_get_functiondef`, 9 firme su 9), e una
  chiamata impersonata con la sede sbagliata arriva fino alla scrittura;
- **dopo**: l'espressione esatta delle due guardie nuove, provata sui dati
  veri, risponde `sua sede → passa`, `altra sede della stessa azienda →
  respinta`, `sede di un'altra azienda → respinta`, `sede nulla (dato di tutta
  l'azienda) → passa`.

## Stato della suite quando ho chiuso
`npx vitest run` intero, 17/09/2026 ore 12:11: **4.137 verdi, 7 rossi, 5
saltati** su 268 file. **Nessuno dei sette è mio**, e lo scrivo con i nomi
perché non si perda tempo a cercarli:

| File | Rossi | Di chi è |
|---|---|---|
| `tests/unit/confrontoSediGiornoItaliano.test.jsx` | 4 | agente DATE |
| `tests/unit/accessibility-axe.test.jsx` | 2 | agente PAGINE |
| `tests/unit/attrezziCheSannoDireNo.test.js` | 1 | agente RIGHELLO |

Sono tre file che in questo momento hanno un altro agente dentro: la suite è in
movimento, non rotta da questo lavoro. Il giro precedente, due ore prima, ne
aveva cinque **diversi** (due erano scadenze a 25 secondi su
`universal-import-smoke`, con la macchina che faceva girare cinque agenti
insieme e la suite che ci metteva venti minuti invece di uno).

I sette file di sicurezza, girati da soli: **92 controlli, tutti verdi.**
`eslint --quiet` pulito sui due file miei, `check-italian-grammar.mjs` pulito.

`node scripts/check-migrazioni-applicate.mjs` mette le due funzioni nuove fra
le GIALLE — «manca nel database ma nessuno la usa», che è giusto: non le chiama
nessuno da `src/` o `api/`, vivono dentro SQL. **Non aggiungono nessun rosso.**
L'unico rosso di quello script è di un altro agente
(`inventario_produzione.ricevuto_g`, migrazione `20260916c`).

## Prossimo passo
Per il titolare, in ordine:
1. **Accendere il secondo fattore** sull'account admin. Due minuti, ed è il
   buco più caro dei sette.
2. Leggere e applicare `20260917a`.
3. Decidere cosa fare di `created_by` sui movimenti di magazzino: oggi il
   registro non dice chi ha rettificato una giacenza.
