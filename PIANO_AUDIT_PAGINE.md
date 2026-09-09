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

1. [x] **Scheda allergeni** — corretta, poi **nascosta** su decisione del
       titolare: e' un documento con valore legale (Reg. UE 1169/2011) e il
       riconoscimento non copriva gli ingredienti reali. Nascosto anche HACCP.
2. [x] **Formati di vendita** — seme demo che parlava una lingua diversa dalla
       pagina, tessera che dichiarava il falso, 9 testi sotto i 12px
3. [x] ~~Menù del giorno~~ — **nascosta** il 09/09: nessun cliente reale l'ha
       mai usata (solo il demo, ultimo salvataggio 26/06), e meta' della pagina
       duplica la matrice di Menu engineering
4. [ ] Nuova ricetta
5. [ ] Ricettario / gusti
6. [ ] Semilavorati
7. [ ] Fornitori
8. [ ] Importa dati
9. [ ] Perdite e cessioni
10. [ ] Scadenzario fatture

## Lavoro arretrato che resta aperto

- **Produzione**: 3 aree mai lette (storico/modifica/eliminazione — la più
  importante, perché tocca la restituzione al magazzino; foto OCR; struttura e
  testo) + 12 difetti sostenuti e non verificati.
  Riprendere: `Workflow({scriptPath: '~/.claude/projects/-Users-aler-foodos/9f6951b3-*/workflows/scripts/audit-produzione-profondo-wf_39f23348-967.js', resumeFromRunId: 'wf_39f23348-967'})`
- **Magazzino**: 84 difetti sostenuti e non verificati
  (`AUDIT_MAGAZZINO_DA_VERIFICARE.md`), più due decisioni di prodotto in attesa:
  lo scarto dei prodotti finiti che non entra nel registro sprechi, e una riga
  di carico sbagliata che non si può correggere.
- **113 formattatori di percentuale scritti a mano** in 20 file, tutti col
  punto invece della virgola. Bonifica a sé.
