-- Sul proprio profilo si può cambiare il nome, non il ruolo.
--
-- Stessa famiglia del difetto su `organizations`, trovato il 14/09/2026. La
-- regola dice "puoi aggiornare la TUA riga", ma il permesso di UPDATE era
-- concesso su tutte le colonne, comprese:
--
--   ruolo, approvato          → chi sei e se sei abilitato
--   organization_id           → a quale azienda appartieni
--   is_laboratorio_account,
--   laboratorio_sede_id       → i permessi dell'account di laboratorio
--   dipendente_last_login_*   → le tracce di accesso
--
-- Un trigger (`guard_profile_escalation`) già impediva a un dipendente di
-- cambiarsi ruolo o approvazione, e a chiunque di cambiare azienda: quella
-- rete c'è e regge. Ma il permesso sulle altre colonne restava, e un account
-- di laboratorio si poteva creare da soli mettendo `is_laboratorio_account` a
-- true. Meglio togliere il permesso che fidarsi solo del trigger: le due cose
-- insieme sono una rete doppia.
--
-- Cosa scrive davvero il client su questa tabella: `nome_completo` dalle
-- impostazioni. Il resto lo scrivono le funzioni serverless con la chiave di
-- servizio (creazione account laboratorio, accessi dipendente, approvazioni).

revoke update on public.profiles from authenticated;
grant update (nome_completo) on public.profiles to authenticated;
