-- Il bucket delle foto era pubblico, e chiunque poteva leggerne il contenuto.
--
-- Trovato il 14/09/2026. `ricette-foto` era marcato `public = true` e la regola
-- di lettura diceva soltanto "sei nel bucket giusto":
--
--     SELECT ... using (bucket_id = 'ricette-foto')
--
-- Nessun controllo di chi sei. Con un bucket pubblico i file si servono senza
-- autenticazione, e la regola permetteva anche di ELENCARLI: bastava la chiave
-- pubblica del sito per scaricare le foto di tutti.
--
-- Oggi il bucket è vuoto (zero file), quindi non è uscito niente. È una porta
-- aperta su una stanza vuota: si chiude prima che qualcuno ci metta qualcosa —
-- e quello che ci finirebbe sono foto di ricette e di documenti dei clienti.
--
-- Il percorso dei file è `<id utente>/<nome file>`, quindi la lettura si lega
-- alla stessa cartella che già decide chi può cancellare.

update storage.buckets set public = false where id = 'ricette-foto';

drop policy if exists ricette_foto_read on storage.objects;
create policy ricette_foto_read on storage.objects
  for select
  using (
    bucket_id = 'ricette-foto'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );
