# Censimento delle date fuori dai file dell'agente DATE — 16/09/2026

Consegnato da un sotto-agente che ha esaminato tutto `src/` e `api/`.
32 difetti in tre fasce, più l'elenco dei casi verificati CORRETTI.

**Nota di contesto valida per tutto `api/`:** su Vercel il processo gira con
`TZ=UTC`, quindi lì `new Date()` **è già** UTC e ogni `toISOString().slice(0,10)`
è il giorno di Greenwich — sbagliato per l'utente italiano fra le 00:00 e le
02:00 locali.

---

## Fascia 1 — l'utente lo vede, o sposta un incasso o una produzione di giorno

1. **`src/components/ConfrontoSedi.jsx:118`** (usato a `:283` e `:179`)
   `const today = new Date().toISOString().split('T')[0]`
   È la colonna «produzione di oggi»: fra mezzanotte e le due mostra quella di
   ieri, e a `:179` conta come scadute le fatture che scadono oggi.
2. **`api/tv.js:108`** — dashboard TV appesa in laboratorio: il turno notturno
   vede i numeri di ieri fino alle 02:00.
3. **`src/components/DailyBriefCard.jsx:73`** — chi apre l'app all'una vede il
   brief di ieri, o la scheda vuota.
4. **`src/lib/venditeB2B.js:147`** — la data di una vendita B2B, cioè un
   incasso: registrata all'una di notte finisce nel giorno prima.
5. **`src/lib/venditeB2B.js:194`** — stessa cosa sulla data di incasso.
6. **`api/webhook-zucchetti.js:84`** — se la cassa non manda la data, la
   chiusura viene archiviata sotto il giorno prima e **sovrascrive** quella
   di ieri già salvata.
7. **`api/sync-delivery.js:27` e `:114-115`** — la finestra SumUp è il giorno
   UTC: ricavi delivery attribuiti al giorno sbagliato, in automatico, ogni
   notte, senza che nessuno se ne accorga.
8. **`src/components/Personale.jsx:541`** — il giorno di riferimento del
   planning turni: aperto di lunedì alle 00:30 mostra la settimana scorsa.
9. **`src/components/Personale.jsx:826` e `:928`** — l'evidenziazione «oggi»
   nel calendario turni accende la cella di ieri fino alle due.
10. **`src/components/Personale.jsx:548, 557, 560, 565, 699`** — `new Date('AAAA-MM-GG')`
    mutata coi getter/setter locali e riletta con `toISOString()`. In Italia
    torna, **finché non si attraversa il cambio ora legale**: da marzo ad
    aprile (o ottobre → novembre) tutta la griglia slitta di un giorno e i
    turni del lunedì compaiono di domenica.
11. **`src/views/QuadraturaInventarioView.jsx:30-32`** (`addDays`) — stesso
    meccanismo, e pilota i pulsanti settimana precedente/successiva (`:315-316`)
    e il filtro DB (`:287`). Il gemello CORRETTO è
    `InventarioSettimanaleView.jsx:49`, che chiude con `formatLocalDate`.
12. **`src/lib/sepa.js:92`** — il `ReqdExctnDt` del bonifico SEPA che finisce
    in banca: un XML generato all'una di notte chiede l'esecuzione per ieri.
13. **`src/lib/fornitoriDaFatture.js:44-47`** — parse locale ma riconversione
    UTC: la soglia «fornitori attivi negli ultimi 30 giorni» è **sempre** 31.
14. **`src/components/ImportWizard.jsx:262`** — mezzanotte locale del 1° del
    mese successivo riserializzata in UTC diventa l'ultimo giorno del mese
    corrente: il controllo duplicati **non guarda mai l'ultimo giorno del mese**
    e lo reimporta in silenzio.
15. **`api/lib/aiEngine.js:269`** — tutto il file usa `localIsoDate()` apposta
    (c'è il commento di audit a `:97-100`), ma il ciclo «chiusure mancanti negli
    ultimi 3 giorni» è rimasto indietro: l'AI segnala come non chiuso un giorno
    che è stato chiuso.

## Fascia 2 — finestre e confronti che sbagliano al bordo

16. **`src/views/CashflowView.jsx:161-165`** — fra mezzanotte e le due la
    chiusura di oggi risulta «nel futuro» ed è esclusa dalla media su cui si
    basa tutta la previsione di cassa.
17. **`src/views/MenuEngineeringView.jsx:92-96`** — il primo e l'ultimo giorno
    entrano o escono secondo l'ora in cui apri la pagina.
18. **`src/views/OrdiniAiView.jsx:100-103`** — identico, e alimenta il consumo
    medio che decide **le quantità da ordinare**.
19. **`src/views/OrdiniAiView.jsx:75`** — colonna `date` filtrata con un giorno
    UTC (impatto piccolo, stessa famiglia).
20. **`src/components/Haccp.jsx:786`** — il default del campo «Da» nell'export
    HACCP propone il 31° giorno. Il `to` accanto usa già `todayLocal()`.
21. **`src/components/ConfrontoSedi.jsx:190`** — `lunIso` riporta il lunedì alla
    domenica. Oggi non viene disegnato, ma è una mina per chi lo userà.
22. **`src/lib/inventarioImport.js:218-220`** (`addGiorni`) — salta di un giorno
    se l'intervallo importato attraversa il cambio ora legale.
23. **`src/views/VenditeB2BView.jsx:140` + `:145`** — `todayLocal()` riportato a
    mezzanotte UTC contro un mezzogiorno locale: il filtro «ultimo trimestre»
    taglia con ~10 ore di sfasamento. (`:173` invece è CORRETTO.)
24. **`src/lib/costiAziendali.js:174`** — il 1° del mese fra mezzanotte e le due
    il mese di riferimento è quello precedente, e i costi una tantum si
    spalmano su un mese in più.
25. **`src/Dashboard.jsx:1656`** — la decorrenza di un prezzo ingrediente parte
    dalle 02:00 anziché da mezzanotte: un prezzo «da oggi» resta inattivo per
    le prime due ore (`:1706`).
26. **`src/lib/importCassa.js:395`** — se l'XML non porta la data, il movimento
    di cassa viene datato ieri.
27. **`api/sdi-emit-invoice.js:327-328`** e **`api/lib/fattureInCloud.js:151`** —
    **data di emissione di una fattura elettronica**, con rilevanza fiscale.
    Server in UTC: un'emissione dopo mezzanotte italiana, e in particolare a
    cavallo del 31/12 o di fine mese, viene datata al giorno o al mese
    precedente, con effetti su progressivo e liquidazione.
28. **`api/sdi-emit-invoice.js:203`** — due retry del webhook a cavallo della
    mezzanotte UTC producono due chiavi di idempotenza diverse, quindi **due
    fatture**. Meglio agganciare la chiave alla data fattura o a un id stabile.

## Fascia 3 — pannello admin e diagnostica interna (stesso difetto, impatto basso)

29. **`api/admin.js:93, 144-145, 382-383, 1114, 1354`** — giorni e mesi di
    calendario costruiti in UTC contro colonne `date`.
30. **`api/lib/admin/salute.js:48`**, **`api/lib/admin/usoPagine.js:17`**,
    **`api/lib/admin/telemetriaAi.js:33`** — stessa famiglia su colonne-giorno.
31. **`api/webhook-pos.js:103`** — il contatore «scontrini sincronizzati oggi»
    spezza la giornata alle 02:00 italiane e apre due righe di `sync_log`.
32. **`src/lib/exportPDF.js:82`** — il timestamp stampato in fondo a ogni PDF
    è indietro di due ore rispetto a quando l'utente ha premuto Esporta.

---

## Verificati e CORRETTI — non «sistemarli» in peggio

- `src/views/MagazzinoView.jsx:718` — `+ 'T00:00:00'` poi `toISOString()`: parse
  locale, istante assoluto giusto.
- `src/lib/giorniChiusura.js:107-108` — ancorato a `T12:00`, il mezzogiorno
  assorbe l'offset.
- `src/lib/movimentiSpeciali.js:105-106` — bordi locali contro un istante.
- `src/components/Eventi.jsx:40, 61, 391` e `src/views/PLView.jsx:1015-1016, 747, 762`
  — `T00:00:00` o `Date.UTC` su entrambi i lati.
- `src/lib/inventarioImport.js:468-470` e `src/lib/importValidateCore.js:82-84`
  — seriale Excel costruito con `Date.UTC`.
- `src/views/InventarioSettimanaleView.jsx:49, 331, 337, 644` e
  `src/lib/inventarioProduzione.js:1066-1074` — chiudono con `formatLocalDate`.
- `src/components/SpreciOmaggi.jsx:124`, `src/lib/scadenzeFatture.js:60-64`,
  `src/lib/riconciliazioneBanca.js:87-93`, `src/lib/pagamentiFornitore.js:154, 185`.
- Tutti i `new Date().toISOString()` che scrivono `created_at`, `updated_at`,
  `expires_at`, `ts`: sono **istanti assoluti**, e UTC è la forma giusta.
- Nomi di file esportati e `src/components/Mfa.jsx:44`: irrilevanti.

## Fragili ma oggi corretti in Italia
`new Date('AAAA-MM-GG').toLocaleDateString('it-IT')` senza `T12:00` —
`Scadenzario.jsx:1829,1833`, `ProduzioneGiornalieraView.jsx:1240,1241,1344`,
`MagazzinoView.jsx:1771,1793`, `CashflowView.jsx:503`, `TrasferimentiView.jsx:36`,
`AdminPage.jsx:125`. Mezzanotte UTC cade alle 01:00/02:00 dello stesso giorno
locale, quindi in Italia si legge giusto — ma basta un fuso negativo o un
`Intl` con timezone esplicito per far comparire il giorno prima.
`CashflowView.jsx:512` e `:626` usano già `T12:00:00`: `:503` è anche
incoerente col vicino.

## Nessuna data grezza a schermo
Gli unici `${...data}` non formattati sono chiavi interne
(`InventarioSettimanaleView.jsx:299,667`, `QuadraturaInventarioView.jsx:644`),
una colonna CSV (`ExportContabilita.jsx:89`) e il prompt testuale per l'AI
(`AzioniView.jsx:94,101`).
