# Coda delle richieste del titolare

## 17/09/2026 — la tabella degli ingredienti quando si modifica una ricetta

Richiesta testuale: *«quando modifico una ricetta e vedo la lista degli
ingredienti nella tabella degli ingredienti fammeli vedere in ordine di qty e
aggiornameli live in base alla qty che metto e dammi la possibilità di ordinare
le colonne toccando le etichette. poi controlla che i mouseover funzionino in
tutto il tool. tipo ora in quella sezione non funzionano.»*

Tre cose distinte:

1. **Ordine per quantità, di suo.** Aprendo la modifica di una ricetta gli
   ingredienti si vedono dal più pesante al più leggero. È l'ordine con cui si
   ragiona su un impasto: quello che sposta il food cost sta in cima.

2. **Riordino dal vivo mentre si scrive.** Cambiando una quantità la riga si
   sposta da sola. Attenzione: se la riga si muove **mentre** si sta scrivendo
   dentro il campo, il dito perde il posto e si scrive nella riga sbagliata.
   Va trovato il momento giusto per riordinare — a fuoco perso, non a ogni
   tasto — e va provato sul telefono, non solo col mouse.

3. **Colonne ordinabili toccando l'etichetta.** Esiste già `SortTH` in
   `src/views/_shared.jsx`: si usa quello, non se ne scrive un altro. Sul
   telefono l'etichetta è un bersaglio da 44px.

4. **I mouseover in tutto il prodotto.** Nella tabella degli ingredienti oggi
   non funzionano. Da controllare ovunque: c'è il componente `Tip` in
   `_shared.jsx` e gli attributi `title=`. Su un dispositivo che si tocca il
   mouseover non esiste: serve che l'informazione sia raggiungibile anche col
   dito (tocco che apre, o testo sempre visibile).

Da fare DOPO l'audit in corso — ordine esplicito del titolare: *«però fallo
dopo, prima finisci quello che stai facendo»*.
