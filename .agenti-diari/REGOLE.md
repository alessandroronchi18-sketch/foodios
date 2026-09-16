# Regole per gli agenti dell'audit del 16/09/2026

## Il diario è obbligatorio
Scrivi in `.agenti-diari/<tuo-nome>.md` PRIMA di cominciare (il piano), poi al
25%, 50%, 75% e alla fine. Se ti interrompi, chi riprende deve poter ripartire
da dove eri, non dall'inizio. Scrivi: cosa hai già guardato, cosa hai trovato,
cosa resta.

## Ogni difetto corretto lascia dei test
Non «aggiungi un test». Sono TRE cose:
1. Il test che RIPRODUCE il difetto: deve fallire sul codice di prima.
2. Il test della CORREZIONE: verifica che la soluzione faccia quello che dice.
3. I test di QUELLO CHE C'È INTORNO: un difetto è quasi sempre il membro
   visibile di una famiglia.
Il commento in cima al file di test racconta il difetto vero, con la data e
come è stato scoperto. Un test senza quel racconto sembra una regola
arbitraria e prima o poi qualcuno lo cancella.
File in `tests/unit/`, nome in italiano che dice cosa protegge.

## Verifica il righello prima della misura
Su questo progetto sei strumenti di misura sono stati trovati rotti in una
settimana. Se il tuo controllo trova 0 problemi, DIMOSTRA che saprebbe
trovarne uno (provalo su un caso finto). Se ne trova 80, sospetta di te
prima che del codice.

## Le sette lenti
Design · imprenditore · CEO · CFO · direttore HR · ingegnere · economista.
La regola che le tiene insieme: **dire sempre quello che non si sa**. Un dato
che manca non si scrive come se fosse zero. Un food cost sconosciuto non è
«gratis», è «non lo so».

## Lingua e stile
Italiano umano, frasi brevi. Numeri ≥1000 col punto delle migliaia; il simbolo
€ SEMPRE dopo la cifra («1.477 €»). Mai emoji nell'interfaccia: c'è il
componente `Icon`. Accenti veri nei commenti: più, già, perché, così, è —
mai `piu'`, `gia'`, `perche'`. C'è un controllo che blocca la pubblicazione.

## Cosa NON devi fare
- NON fare `git commit` e NON fare `git push`. Modifica i file e basta:
  rivedo e pubblico io.
- NON toccare file fuori dalla tua lista assegnata: un altro agente ci sta
  lavorando nello stesso momento.
- NON scrivere MAI nei dati veri dei clienti. Le query SQL di sola lettura
  vanno bene (credenziali in `~/.config/foodos/supabase.env`, psql sta in
  `/usr/local/opt/libpq/bin/psql`). Niente DROP/DELETE/UPDATE/TRUNCATE.

## Come si verifica il lavoro
`npx vitest run tests/unit/<tuo-file>.test.js` per il tuo,
`npx eslint <file> --quiet` per la forma,
`node scripts/check-italian-grammar.mjs` per gli accenti.
Alla fine la suite intera deve restare verde: 3.649 test oggi.
