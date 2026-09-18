-- ─────────────────────────────────────────────────────────────────────────
-- Riparazione: l'elenco delle chiavi riservate torna completo
-- ─────────────────────────────────────────────────────────────────────────
--
-- 18/09/2026. Questo file nasce da un errore mio, e il racconto serve più
-- del codice.
--
-- Un audit aveva segnalato che `pasticceria-log-prezzi-v1` — lo storico dei
-- cambi di prezzo, con dentro chi li ha fatti — non era fra le chiavi
-- riservate al titolare. Ho scritto la correzione copiando l'elenco delle
-- chiavi dalla migrazione che definiva la funzione **la prima volta**
-- (`20260607`), invece che dall'ultima che l'aveva riscritta
-- (`20260914e_log_prezzi_sensibile`).
--
-- Due conseguenze, tutt'e due sbagliate:
--
--   1. la segnalazione era **infondata**: `pasticceria-log-prezzi-v1` era già
--      fra le chiavi riservate dal 14/09;
--   2. riscrivendo la funzione con l'elenco vecchio ho **tolto tre chiavi**
--      che nel frattempo erano state aggiunte — `pasticceria-ricettario-v1`,
--      `pasticceria-giornaliero-v1`, `pasticceria-semilavorati-v1` — cioè ho
--      aperto al laboratorio il ricettario, la produzione giornaliera e i
--      semilavorati. Per una manciata di minuti, in produzione.
--
-- La lezione, che è quella di sempre in questo progetto: `create or replace`
-- su una funzione che elenca delle cose **non aggiunge, sostituisce**. Prima
-- di riscriverne una bisogna leggere l'ultima versione, non la prima. E un
-- audit che dice «manca X» va verificato prima di agire: era il righello a
-- sbagliare, non il prodotto.
--
-- Qui l'elenco torna quello vero, con tutte e dodici le chiavi, e con la
-- stessa firma dell'originale (`stable security definer`, non `immutable`,
-- che avevo cambiato senza accorgermene).
--
-- Il test `dipendenteNonCancellaStorico.test.js` ha visto il danno subito: è
-- lui che confronta gli elenchi delle due funzioni e si è messo in rosso.

create or replace function public.is_chiave_sensibile(k text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select k = any (array[
    'pasticceria-ai-v1',
    'pasticceria-actions-v1',
    'pasticceria-eventi-v1',
    'azienda-pagamenti-v1',
    'pasticceria-organigramma-v1',
    'pasticceria-consuntivo-turni-v1',
    'menu-giorno-v1',
    'pl-costi-fissi-v1',
    'pasticceria-ricettario-v1',
    'pasticceria-giornaliero-v1',
    'pasticceria-semilavorati-v1',
    'pasticceria-log-prezzi-v1'
  ])
$$;

grant execute on function public.is_chiave_sensibile(text) to anon, authenticated;
