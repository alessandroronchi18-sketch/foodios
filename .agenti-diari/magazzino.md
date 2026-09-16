# Diario agente MAGAZZINO — audit Foodos 16/09/2026

## Mandato
Importazioni e movimenti di merce: tutto quello che fa entrare e uscire quantità.
Se un movimento si perde, ogni numero a valle è sbagliato e nessuno se ne accorge.

## Piano (scritto prima di cominciare)
1. Leggere REGOLE.md + CLAUDE.md. [fatto]
2. Mappare i file: inventarioProduzione.js, inventarioImport.js, trasferimenti.js,
   autoDetectFormat.js, import*.js, parse*.js, MagazzinoView, InventarioSettimanaleView,
   ImportWizard.
3. Verificare le 6 piste note, una per una, sul codice.
4. Aprire il DB di Mara (`889e7fc2-...`) e misurare la PARTITA DOPPIA per sede/periodo:
   rimanenza iniziale + entrate − uscite − venduto = rimanenza finale.
5. Per ogni difetto: misura prima → correzione → misura dopo → tre test.

## Stato
- [x] REGOLE.md e CLAUDE.md letti
- [ ] Mappa dei file di import/movimento
- [ ] Piste 1-6 verificate sul codice
- [ ] Connessione DB + partita doppia
- [ ] Correzioni
- [ ] Test

## Prossimo passo
Leggere inventarioProduzione.js e autoDetectFormat.js.

---
## Checkpoint 25% — 16/09, mappa e prime conferme

Connessione DB OK. Org Mara `889e7fc2-…`, 3 sedi:
Carlina `e0d3370b`, Berthollet `af9f2192`, De Gasperi `bbb7554e`.

### Cosa c'è davvero nei dati di Mara (misurato)
- `inventario_produzione`: 7.013 righe (Berthollet 2.177, Carlina 2.636,
  De Gasperi 2.200), dal 2026-05-01 al 2026-09-15.
- `trasferimenti`: **1 riga sola** (Carlina→Berthollet, 1 pz, stato `inviato`,
  15/09). La pagina trasferimenti di fatto non è usata.
- `vendite_b2b`: **0 righe**.
- `user_data`: NESSUNA chiave `pasticceria-chiusure-v1` → **zero chiusure**.
- `spedito_g` totale: 1 g (Carlina). `scarto_g` totale: 0 su tutte le sedi.

### Partita doppia sui dati veri (query SQL, formula di `cellaVenduto`)
| sede | celle | non calcolabili | negative | kg negativi | kg venduti |
|---|---|---|---|---|---|
| Berthollet | 2.177 | 27 | 205 | −1.046,5 | 7.154,7 |
| Carlina | 2.636 | 30 | 95 | −309,1 | 10.385,4 |
| De Gasperi | 2.200 | 30 | 275 | −1.232,3 | 7.813,1 |
| **totale** | **7.013** | **87** | **575** | **−2.587,9** | **25.353,2** |

575 celle su 7.013 (8,2%) non quadrano, per 2.587,9 kg. È il buco da spiegare.

### Piste — stato
1. Seconda importazione consegne stesso giorno → **CONFERMATA sul codice**,
   `src/lib/importDelivery.js:198-200`: nel ramo `soloTotale` scrive
   `totV: kpiPrec.totV` — cioè si riassegna da solo. Il netto della SECONDA
   fonte non entra mai in `totV`. Non riproducibile sui dati di Mara (0 chiusure):
   serve un caso di prova.
2. Trasferimenti in entrata → **CONFERMATA, difetto di SCHEMA**:
   `inventario_produzione` ha `spedito_g` e NON ha `ricevuto_g`
   (verificato in information_schema). `confermaRicezione` in
   `src/components/TrasferimentiView.jsx:396` non scrive nulla nell'inventario
   della sede che riceve. Su Mara non è misurabile (1 solo trasferimento).
3. kg B2B due volte → da verificare: `kpiQuadraturaSettimana` sottrae i B2B,
   `ricaviDaInventario`/`totaliPerGusto` (usati da PLView e AnalisiInventario)
   NO. Su Mara 0 vendite B2B → serve caso di prova.
4. `avgST: 0` finto → **CONFERMATA**: `importEcommerce.js:156`,
   `importCassa.js:494`, `importDelivery.js:220`. A valle
   `StoricoProduzioneView` filtra `avgST != null`: lo zero entra nella media.
5. `inventarioImport.js` scollegato → da verificare.
6. `parseEkoPos`/`parseWolf` fuori da `PATTERNS` → **CONFERMATA**,
   `importCassa.js:355-370`. Da verificare anche `parseFile` (riga 432): il
   dispatch conosce solo 7 sistemi su 15 e sugli altri lancia
   «Sistema non riconosciuto».

## Prossimo passo
Leggere `inventarioImport.js`, `ImportWizard.jsx`, `ImportaDatiView` (dove?).
