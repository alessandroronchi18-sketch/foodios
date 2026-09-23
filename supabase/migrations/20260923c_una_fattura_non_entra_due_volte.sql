-- ─────────────────────────────────────────────────────────────────────────
-- Una fattura non entra due volte
-- ─────────────────────────────────────────────────────────────────────────
--
-- Fino a oggi la difesa contro le fatture doppie era **tutta nel browser**:
-- `chiaviFattureEsistenti` legge le chiavi già in archivio e `dedupFatture`
-- scarta quelle che ci sono. Funziona, ed è verificato: sulle 3.520 fatture
-- del design partner, il 23/09/2026, zero doppioni.
--
-- Ma è una difesa che si può aggirare senza volerlo:
--
--   • due persone che importano lo stesso file nello stesso momento leggono
--     tutte e due l'elenco «già presenti» PRIMA che l'altra scriva, e passano
--     tutte e due;
--   • la stessa cosa da due schede del browser, o da telefono e computer;
--   • una strada futura che scrive in `fatture` dimenticandosi degli aiutanti
--     — ed è già successo una volta: il 10/09/2026 la pagina Integrazioni
--     faceva l'import a mano, senza nessuno dei tre.
--
-- Il vincolo qui sotto è l'ultima parola, e sta dove i dati stanno davvero.
--
-- La chiave è la stessa che usa il browser (`fatturaKey` in
-- `src/lib/fattureImport.js`): numero + fornitore + data, normalizzati. Se un
-- giorno cambia lì, deve cambiare anche qui — sono due metà della stessa
-- regola, ed è la famiglia di difetti che su questo prodotto costa di più.
--
-- PERCHÉ `coalesce` DAPPERTUTTO: in Postgres due NULL non sono uguali, quindi
-- un indice unico su colonne che possono essere NULL non vincola niente
-- proprio nei casi peggiori (una fattura senza numero letto dalla foto).
-- Portandoli a stringa vuota e a una data impossibile, il vincolo vale anche
-- lì.
--
-- VERIFICATO PRIMA DI SCRIVERLO, sui dati veri in produzione: zero righe che
-- violerebbero questo indice, zero fatture senza numero. Si può creare senza
-- toccare né cancellare niente.

create unique index if not exists fatture_una_sola_volta
  on public.fatture (
    organization_id,
    upper(btrim(coalesce(numero_rif, ''))),
    upper(btrim(coalesce(fornitore, ''))),
    coalesce(data_fattura, date '1900-01-01')
  );

comment on index public.fatture_una_sola_volta is
  'La stessa fattura (numero + fornitore + data) non entra due volte nella stessa azienda. Stessa chiave di fatturaKey() nel frontend: se cambia una, cambia l''altra.';
