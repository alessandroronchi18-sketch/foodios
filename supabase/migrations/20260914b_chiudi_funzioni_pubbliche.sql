-- Le funzioni interne non devono essere chiamabili con la chiave pubblica.
--
-- Trovato il 14/09/2026 con un audit di sicurezza. Sei funzioni `SECURITY
-- DEFINER` — cioè che scavalcano le regole di isolamento, perché girano con i
-- privilegi del proprietario — erano eseguibili dal ruolo `anon`, cioè dalla
-- chiave pubblica che sta dentro il sito e che chiunque può leggere aprendo il
-- sorgente della pagina.
--
-- Quattro di queste prendono l'organizzazione (o una chiave) come PARAMETRO e
-- non controllano niente: chi conosce un id di organizzazione — un ex
-- dipendente, chiunque abbia visto un export o uno screenshot di assistenza —
-- poteva usarle senza avere un account.
--
--   fos_user_data_set_batch  → sovrascrivere ricettario, magazzino, produzione
--                              e chiusure di quell'attività (perdita dati)
--   applica_delta_stock_pf   → alterare lo stock dei prodotti finiti
--   cleanup_audit_log        → con `retain_days = 0`, cancellare tutto il
--                              registro delle modifiche (sparisce la prova)
--   rate_limit_increment     → gonfiare i contatori di qualcun altro e
--                              chiudergli fuori l'accesso
--   increment_discount_redemption → bruciare gli usi di un codice sconto
--
-- Verificato sul database di produzione: la chiamata anonima a
-- `fos_user_data_set_batch` superava il controllo e arrivava a scrivere — si è
-- fermata solo perché l'id di organizzazione usato nella prova era finto.
--
-- Qui si toglie il permesso a chi non deve averlo. Non cambia niente per il
-- prodotto: queste funzioni le chiamano le funzioni serverless con la chiave di
-- servizio (che ignora i permessi perché è proprietaria) o le altre funzioni
-- SECURITY DEFINER che le avvolgono.

-- IMPORTANTE, e costato un giro a vuoto: in Postgres una funzione nasce con
-- EXECUTE concesso a PUBLIC. Togliere il permesso ad `anon` non serve a niente
-- finché PUBLIC ce l'ha, perché `anon` lo eredita da lì. Si revoca a PUBLIC e
-- poi si concede per nome a chi deve averlo.

-- 1. Helper interno dello stock: lo chiamano solo le RPC che lo avvolgono, e
--    quelle controllano l'organizzazione dell'utente. Nessun ruolo pubblico.
revoke execute on function public.applica_delta_stock_pf(uuid, uuid, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.applica_delta_stock_pf(uuid, uuid, text, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.applica_delta_stock_pf(uuid, uuid, text, numeric, text) to service_role;
grant execute on function public.applica_delta_stock_pf(uuid, uuid, text, numeric, text, uuid) to service_role;

-- 2. Manutenzione e contatori: solo dal server.
revoke execute on function public.cleanup_audit_log(integer) from public, anon, authenticated;
revoke execute on function public.increment_discount_redemption(uuid) from public, anon, authenticated;
revoke execute on function public.rate_limit_increment(text) from public, anon, authenticated;
grant execute on function public.cleanup_audit_log(integer) to service_role;
grant execute on function public.increment_discount_redemption(uuid) to service_role;
grant execute on function public.rate_limit_increment(text) to service_role;

-- 3. La scrittura dei dati di lavoro resta all'utente loggato (dentro la
--    funzione l'organizzazione la deduce da lui, non dal parametro), ma non
--    all'anonimo.
revoke execute on function public.fos_user_data_set_batch(jsonb, uuid) from public, anon;
grant execute on function public.fos_user_data_set_batch(jsonb, uuid) to authenticated, service_role;
