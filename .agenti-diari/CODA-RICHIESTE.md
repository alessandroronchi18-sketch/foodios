# Coda delle richieste del titolare

## FATTO — 17/09, terzo giro

- [x] **12. I mouseover non funzionano.** Causa vera: `Tip` copre 23
      spiegazioni, ma nel prodotto ce ne sono **226 come `title=` nativi**, che
      su schermo tattile non si aprono mai e col mouse arrivano dopo ~1s.
      Nuovo `src/components/SpiegazioniAlTocco.jsx`, montato una volta al tetto
      dell'app: vale per tutte, presenti e future. 11 test.
- [x] **Selettore sedi nel Ricettario** → nascosto dietro
      `SELETTORE_SEDI_NEL_RICETTARIO = false` in `Dashboard.jsx`. Audit sui
      dati veri: **0 righe** di prezzi per sede in tutto il prodotto. Si
      rimette con una parola. 6 test.
- [x] **Fascia legale** (Privacy · Termini · Cookie · Contatti · © Foodos):
      su tablet 20px invece di 28, senza ombra, testo al 26%.
- [x] **Cestino del Listino scentrato**: mancava `justifyContent`. Trovato e
      corretto anche il secondo caso (× della chiusura di cassa). 3 test.
- [x] **Nota «ingredienti per 1 kg»**: era dentro la colonna «Tipo» (un terzo
      di riga) e sfondava la griglia. Ora riga sola sotto i tre campi.
- [x] **Tessere semilavorati**: avvisi «senza prezzo» incolonnati anche quando
      manca «prezzo stimato»; targhetta «Costo / kg» da 56px a 40px, alta come
      i pulsanti Costo e Dove. 5 test.

## DA FARE — Ricettario

1. **Nella scheda «Gusti» il riquadro «Semilavorati» a destra non serve.**
   Metterci qualcos'altro di utile.
2. **Audit: i due pulsanti «Nuovo gusto» e «Aggiorna ricettario gusti» stanno
   bene lì?**
3. **La scheda che si apre cliccando un gusto: troppe informazioni messe a
   caso.** Riorganizzare.
4. **Le quattro tessere a destra vanno a quadrato**, due sopra e due sotto.
5. **Togliere la scritta grigia piccola a sinistra** («cost 2,39 ecc»).
6. **Allergeni dietro un pulsante** «Allergeni».
7. **Nomi degli ingredienti con la prima maiuscola e il resto minuscolo**,
   in Ricettario e in Nuovo gusto.
8. **Restringere ancora le barre di ogni gusto e il loro contenuto.**
9. **Idem le tessere nella visualizzazione a riquadri.**
10. **Nei riquadri, il nome del gusto in grassetto e nel rosso di Foodos.**

## RISPOSTE DATE

- «Dove vedo tutte le materie prime e i prezzi?» → **Magazzino → scheda
  «Prezzi ingredienti»** (nascosta ai dipendenti).

## REGOLA IMPARATA (tre volte)

La fotografia dei token (`check-design-tokens.mjs --aggiorna`) va rifatta **per
ultima**, subito prima del commit.
