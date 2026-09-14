-- Lo storico dei prezzi d'acquisto non lo deve leggere un dipendente.
--
-- Trovato il 14/09/2026 confrontando le chiavi che esistono davvero nel
-- database con quelle marcate come sensibili. `pasticceria-log-prezzi-v1` non
-- era nell'elenco: contiene ogni variazione di prezzo degli ingredienti, con
-- il €/kg vecchio e nuovo. È esattamente il dato commerciale che il prodotto
-- nasconde ai dipendenti — la scheda "Prezzi ingredienti" è nascosta a loro, e
-- il 14/09 mattina è stato tolto anche il totale del valore di magazzino dal
-- riquadro in cima. Restava la strada diretta: leggere la chiave.
--
-- Nota su cosa succede lato applicazione: la regola di lettura non dà errore,
-- semplicemente non restituisce righe. Il dipendente si ritrova lo storico
-- vuoto, che è quello che deve vedere, e nessuna schermata si rompe.

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
