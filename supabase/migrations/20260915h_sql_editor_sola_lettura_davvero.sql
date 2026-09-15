-- ════════════════════════════════════════════════════════════════════════════
-- L'editor SQL del pannello admin diventa di sola lettura per davvero
-- ════════════════════════════════════════════════════════════════════════════
--
-- COM'ERA. `admin_safe_select` prende un pezzo di SQL scritto a mano e lo
-- esegue con `execute format(...)`, come `postgres`, cioè con tutti i poteri
-- del database. L'unica difesa era una manciata di espressioni regolari in
-- JavaScript (api/lib/admin/sqlEditor.js): "deve cominciare con SELECT o
-- WITH", "niente insert/update/delete", "le tabelle dopo FROM devono essere
-- in elenco".
--
-- IL BUCO. Una query può scrivere **senza contenere nessuna di quelle
-- parole e senza nessun FROM**:
--
--     select admin_org_cascade_delete('<id-di-un-cliente>')
--
-- Comincia con SELECT, non ha parole vietate, non nomina nessuna tabella:
-- supera tutti e tre i controlli. E cancella un cliente intero.
--
-- Provato il 15/09/2026 sul database di produzione, dentro una transazione
-- poi annullata: con una tabella usa-e-getta e una funzione che la modifica,
-- il valore è passato da 1 a 77. La scrittura è reale.
--
-- (Il caso segnalato con `WITH x AS (UPDATE ...)` invece **non** passa: la
-- query viene incapsulata in una sottoquery, e Postgres non accetta una CTE
-- che scrive se non è al primo livello. Quello era già chiuso.)
--
-- LA CORREZIONE. Una riga: la transazione diventa di sola lettura prima di
-- eseguire la query. Non è un elenco di cose vietate da tenere aggiornato —
-- è il motore stesso che rifiuta qualsiasi scrittura, comunque la si scriva:
--
--     cannot execute UPDATE in a read-only transaction
--
-- `set local` vale fino alla fine della transazione, e ogni chiamata RPC è
-- una transazione sua: le altre funzioni non ne risentono. Le letture
-- normali continuano a funzionare identiche (verificato).
--
-- Resta anche il filtro in JavaScript, irrigidito nello stesso giro: due
-- serrature indipendenti, e quella che regge da sola è questa.

create or replace function public.admin_safe_select(p_query text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  if p_query is null or length(p_query) > 4500 then
    raise exception 'query non valida';
  end if;

  -- La serratura vera. Qualunque cosa la query provi a scrivere — insert,
  -- update, delete, o una funzione che lo fa per conto suo — da qui in poi
  -- il motore la rifiuta.
  set local transaction_read_only = on;

  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', p_query)
    into v_result;
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

-- Il permesso di eseguirla resta dove era: solo il ruolo di servizio, cioè
-- solo le funzioni del server. Ribadito qui perché un `create or replace`
-- non tocca i permessi, ma se un giorno la funzione venisse ricreata da zero
-- ripartirebbe con `execute` a tutti.
revoke all on function public.admin_safe_select(text) from public;
revoke all on function public.admin_safe_select(text) from anon;
revoke all on function public.admin_safe_select(text) from authenticated;
grant execute on function public.admin_safe_select(text) to service_role;

comment on function public.admin_safe_select(text) is
  'Editor SQL del pannello admin. Transazione in sola lettura: nessuna query può scrivere, nemmeno chiamando una funzione che scrive. Vedi 20260915h.';
