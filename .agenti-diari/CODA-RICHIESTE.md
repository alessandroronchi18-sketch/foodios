# Coda delle richieste del titolare

## FATTE

**Tabella ingredienti** (17/09): ordine per quantità, riordino congelato
mentre si scrive, colonne ordinabili. **Mouseover**: `Tip` reagiva solo a
`onMouseEnter` — su telefono e tablet ogni «?» era muto. 21 test.

**Ricettario** (17/09): margine e food cost a 0% nei riquadri (il ricavo si
calcolava col prezzo della scheda, che per un gusto non esiste); i due
pulsanti Gusti/Semilavorati diventati un controllo segmentato; barre dei
gusti strette da 16px a 9px di bordo interno, con `minHeight: 44`.

**Spese di due negozi** (17/09): 189.458 € invisibili ora divisi sui chili
prodotti. **Import fatture**: chiede di che negozio sono. **Trasferimenti**:
registrano chi manda e chi riceve.

---

## DA FARE — la scheda di un gusto (Ricettario)

Aprendo un gusto compaiono tutte insieme: 4 tessere, le azioni, e **quattro
pannelli** (distinta costi, composizione food cost, conto per stampo, conto
al kg). Troppo, e disordinato.
→ Quello che serve sempre resta; il resto dietro pulsanti.

## DA FARE — la pagina «Nuovo gusto» (richieste del 17/09)

1. **Togliere l'avviso** «Adesso è il bottone Nuova ricetta in cima al
   Ricettario» — e in **tutte** le altre sezioni (è `AvvisoSpostamento`).
2. **Togliere «parti da una che hai già»**.
3. **Nome gusto, categoria, tipo**: barre lunghe senza motivo. Affiancarle.
4. **Il flusso «congelabile»**: verificare che funzioni. Per il gelato non
   serve.
5. **La frase** «Aggiungi ogni ingrediente in grammi per 1 kg di gusto
   finito» è corretta? Il totale degli ingredienti può non fare 1 kg preciso.
   → da riscrivere dicendo il vero.
6. **«Ingredienti» e «Ingrediente»** uno sotto l'altro: brutto.
7. **La barra «Ingrediente»**: cliccandola l'elenco compare *di fianco*.
   Rifarla: l'elenco deve comparire **sempre sotto la barra**.
8. **La riga della tabella ingredienti è scoordinata**: grandezze di
   carattere diverse, posizioni non in linea. Da riorganizzare bene.
9. **Togliere le freccette** che aumentano e diminuiscono i grammi: si deve
   poter solo scrivere (per sbaglio si cambia una quantità).
10. **La sezione «Resa» occupa troppo**: riassumerla.

## DECISIONE APERTA per il titolare

**Il selettore delle sedi nel Ricettario.** Non è decorativo — serve ai
prezzi diversi per negozio — ma nei dati di Mara la chiave
`pasticceria-listino-sede-v1` **non esiste**: un listino unico per tutte e
tre le sedi, quindi cambiare sede non cambia un numero. E la finestra dei
prezzi per sede mostra già tutte le sedi insieme, quindi il selettore non
serve nemmeno a impostarli.
→ Proposta: mostrarlo solo quando esiste almeno un prezzo diverso per sede.
È l'estensione della regola già presente («nascondilo quando non può
cambiare niente»), che oggi guarda solo il numero di sedi.
