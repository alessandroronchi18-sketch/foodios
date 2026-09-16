# Diario agente SICUREZZA — audit 16/09/2026

Mandato: chi può fare cosa, e dove il confine si rompe.
Regole: solo letture sul DB. Non applico migrazioni. Non committo.

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
