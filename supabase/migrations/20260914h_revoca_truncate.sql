-- TRUNCATE non lo deve avere nessuno, dal browser.
--
-- Trovato il 14/09/2026. Supabase, di suo, concede ai ruoli `anon` e
-- `authenticated` tutti i privilegi su ogni tabella nuova: SELECT, INSERT,
-- UPDATE, DELETE — e anche TRUNCATE, REFERENCES e TRIGGER.
--
-- Per i primi quattro non è un problema: sono filtrati riga per riga dalle
-- regole di isolamento, e infatti dall'esterno non si legge e non si scrive
-- niente. **TRUNCATE no**: TRUNCATE non passa dalle regole di isolamento, le
-- ignora per costruzione. Se un giorno esistesse un modo di invocarlo — una
-- funzione che lo chiama, un endpoint sbagliato — svuoterebbe una tabella
-- intera, di tutte le aziende, senza che nessuna regola lo fermi.
--
-- Oggi non è raggiungibile (l'API REST non espone TRUNCATE), quindi non è un
-- buco aperto: è un privilegio che non serve a niente e che un domani
-- trasformerebbe un errore piccolo in un disastro. Si toglie.
--
-- Stessa cosa per REFERENCES e TRIGGER: servono a chi disegna lo schema, non a
-- un'applicazione che legge e scrive righe.

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- E vale anche per le tabelle che verranno create in futuro.
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
