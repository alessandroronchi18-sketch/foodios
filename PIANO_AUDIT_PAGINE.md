# Programma di revisione delle pagine

> Deciso con l'utente il 2026-09-09. Ogni pagina va rivista **come utilità, come
> esperienza d'uso e come impaginazione**, non solo ripulita dai difetti.
> L'obiettivo dichiarato: insieme devono formare il miglior gestionale per
> aziende del food.

## Metodo, quello che ha funzionato

1. **Leggere il codice a fondo**, un'area per agente, in parallelo.
2. **Ogni agente salva i parziali su file** al 25/50/75% del lavoro
   (`/tmp/audit-<pagina>/`). Serve davvero: il 9/09 un agente è morto sul
   limite di sessione dopo aver prodotto 279 righe di analisi, e quelle righe
   erano già su disco.
3. **Una seconda ondata di agenti prova a RIFIUTARE** ogni difetto rileggendo
   il codice, a gruppi di 6 (non uno per difetto: il 7/09, 113 verificatori uno
   per difetto hanno esaurito il limite e 84 sono morti senza produrre niente).
4. **Verificare contro i dati di produzione** quando il difetto riguarda le
   forme dati: tre presunti bug si sono rivelati artefatti di dati di prova
   sbagliati, e 4 su 29 sono stati smontati dagli scettici.
5. **Guardare la pagina**, non solo il DOM: resa statica in HTML dentro una
   riproduzione della topbar del Dashboard, fotografata a 1440 e 420 px. Otto
   difetti veri sono usciti solo così, fra cui un titolo duplicato.
6. Correggere prima i difetti di **correttezza e perdita dati**, poi copy,
   tipografia, colore, impaginazione.
7. **Un commit per pagina**, con il resoconto nel formato: cosa, com'era prima,
   come l'ho corretto, perché.

## Fatte

- [x] **Cassa** — 82 → 87
- [x] **Calendario** — 86 → 88
- [x] **Magazzino** (5 schede) — 83 → 91 / 88 / 87 / 86 / 80
- [x] **Produzione** — parziale: 4 difetti di perdita dati corretti,
      3 aree su 5 mai lette (vedi `AUDIT_PRODUZIONE_DA_FINIRE.md`)

## Da fare, in quest'ordine

Tutte fatte. Le prime tre hanno avuto un esito diverso da "corretta":

1. [x] **Scheda allergeni** — corretta, poi **nascosta** su decisione del
       titolare: e' un documento con valore legale (Reg. UE 1169/2011) e il
       riconoscimento non copriva gli ingredienti reali. Nascosto anche HACCP,
       e il 14/09 sono state chiuse le tre strade che ci portavano ancora.
2. [x] **Formati di vendita** — seme demo che parlava una lingua diversa dalla
       pagina, tessera che dichiarava il falso, 9 testi sotto i 12px
3. [x] ~~Menù del giorno~~ — **nascosta** il 09/09: nessun cliente reale l'ha
       mai usata (solo il demo, ultimo salvataggio 26/06), e meta' della pagina
       duplica la matrice di Menu engineering
4. [x] Nuova ricetta — 09/09
5. [x] Ricettario / gusti — 09/09
6. [x] Semilavorati — 09/09
7. [x] Fornitori — 09-10/09
8. [x] Importa dati — 10/09
9. [x] Perdite e cessioni — 09-10/09
10. [x] Scadenzario fatture — 10/09 (audit sulle 3.520 fatture vere)

## Lavoro arretrato — chiuso il 14/09/2026

- [x] **Magazzino, 84 difetti mai verificati**: verificati uno per uno sul
      codice di oggi. 52 risultavano già corretti fra il 7 e il 10 set (il
      documento non era stato aggiornato), 26 corretti il 14/09, 4 corretti a
      metà e finiti, 2 rifiutati con un fatto.
- [x] **Produzione, 3 aree mai lette + 33 difetti**: verificati. Il filo comune
      era che le correzioni del 9 set erano state fatte sulla pagina del
      titolare, e il percorso del dipendente — che passa dal server — era
      rimasto indietro: non scendeva nei semilavorati, saltava le chiavi al
      plurale, non aveva idempotenza (un secondo invio registrava due volte).
- [x] **113 formattatori di percentuale scritti a mano**: erano 124, in 30
      file. Ora c'è `lib/formatIt.js`, importabile anche da `api/` — che era il
      motivo per cui erano stati riscritti a mano — e un test di guardia.
- [x] **Le due decisioni di prodotto in attesa**: lo scarto dei prodotti finiti
      che non entrava nel registro sprechi (ora l'azzeramento è una rettifica,
      non uno spreco) e la riga di carico sbagliata che non si poteva
      correggere (ora si annulla scrivendo una riga uguale e contraria).
- [ ] **Allergeni, 74 difetti**: fermi per scelta. Riguardano la scheda, che è
      spenta, e riaprirla dipende da una copertura verificata degli ingredienti
      reali — un problema di dati, non di codice. Il difetto della libreria che
      toccava anche le pagine vive ("zucchero semolato" dichiarato con glutine)
      è stato corretto il 14/09.

## Impaginazione — il giro del 14/09

Vedi `ANALISI_PRODOTTO.md`, sezione "Impaginazione". In breve: una scala
tipografica sola tenuta da un test (261 misure fuori scala corrette, compresi
testi a 8-10px), ogni colonna di numeri incolonnata, e **32 viste rese due
volte** (versione da tavolo e versione telefono) fotografate a 1440 e 420 px e
misurate da `scripts/audit-layout.mjs`.

Come rifarlo:

```bash
# Le tre versioni. Il timeout esteso serve: con quello di default il dump
# muore a metà e lascia file HTML incompleti, che poi si misurano lo stesso.
DUMP_LAYOUT=1 npx vitest run \
  tests/unit/layoutViste.test.jsx \
  tests/unit/layoutVisteMobile.test.jsx \
  tests/unit/layoutVisteTablet.test.jsx --testTimeout=900000

# La prova VERA: la pagina si trascina di lato?
node scripts/audit-scorrimento.mjs <cartella>/viste-mobile 320
node scripts/audit-scorrimento.mjs <cartella>/viste-tablet 768

# Quanto è comodo toccarla: campi sotto i 16px (iOS zooma da solo) e
# bersagli sotto i 44px.
node scripts/audit-tocco.mjs <cartella>/viste-mobile 375
node scripts/audit-tocco.mjs <cartella>/viste-tablet 768

# Le misure fini (riquadri disallineati, testi piccoli, celle non incolonnate)
node scripts/audit-layout.mjs
DIR_VISTE=<cartella>/viste-mobile LARGH=390 node scripts/audit-layout.mjs

node scripts/foto-layout.mjs                  # le fotografie, da guardare
```

**Due trappole, imparate il 15/09/2026:**

1. **`audit-layout.mjs` segnala anche quello che è già ritagliato.** Un cerchio
   decorativo messo apposta a sbordare dall'angolo di una tessera con
   `overflow: hidden` risulta "fuori" ma non fa scorrere niente.
   `audit-scorrimento.mjs` risponde alla domanda vera.
2. **Senza emulare il tocco si misura un dispositivo che non esiste.** Chromium
   dichiara `pointer: fine` (il mouse) e le regole scritte
   `@media (pointer: coarse)` non si applicano: si vedono 95 campi "sbagliati"
   che su un iPad vero sono a posto.
