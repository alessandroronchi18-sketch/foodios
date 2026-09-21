-- ── La porta chiusa: rubrica vuota e schermata che non lo dice ────────────
--
-- Trovato il 21/09/2026 dal titolare, entrando con l'account del laboratorio:
-- «mi chiede il codice di 4 numeri ma non mi dà la possibilità di impostarlo
-- o modificarlo».
--
-- Com'è fatto il flusso, e perché è giusto così: l'account laboratorio è un
-- account condiviso su un tablet fisico. Chi si siede davanti al tablet si
-- identifica col proprio codice di quattro cifre, e quel codice **lo crea il
-- titolare** in Personale → Rubrica dipendenti. Il dipendente non se lo
-- imposta da solo, altrimenti il codice non identificherebbe nessuno.
--
-- Il difetto è un altro, ed è una porta chiusa senza uscita: **se la rubrica
-- è vuota, la schermata chiede un codice che non esiste** e suggerisce
-- «chiedi al titolare di verificare il tuo codice» — inutile, quando la
-- rubrica è vuota e il titolare sei tu.
--
-- Misurato sul database del 21/09/2026: un solo account laboratorio in tutto
-- il sistema, zero righe in `dipendenti_codici`, quindi **una porta chiusa
-- su una**.
--
-- La schermata non può contarli da sola: `dipendenti_codici` ha una policy
-- `titolare only`, e l'account laboratorio è un dipendente. Serve una
-- funzione che risponda a una domanda sola — «in questa azienda esiste
-- almeno un codice attivo?» — senza far vedere nessun codice a nessuno.

create or replace function public.rubrica_codici_esiste()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_quanti int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select organization_id into v_org from public.profiles where id = v_uid;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'no_org');
  end if;

  -- Si conta, non si legge: da qui non esce nessun codice, nemmeno mascherato.
  -- Un conteggio dice «la rubrica è vuota», che è quello che serve alla
  -- schermata per smettere di chiedere una cosa che non esiste. Sapere che
  -- l'azienda ha sette dipendenti non aiuta nessuno a indovinare un codice.
  select count(*) into v_quanti
  from public.dipendenti_codici d
  join public.dipendenti h on h.id = d.dipendente_id
  where d.organization_id = v_org
    and d.attivo
    and h.attivo;

  return jsonb_build_object('ok', true, 'esiste', v_quanti > 0);
end;
$$;

comment on function public.rubrica_codici_esiste() is
  'Dice solo se l''azienda di chi chiama ha almeno un codice operativo attivo. Nessun codice esce da qui: serve alla schermata del tablet per non chiedere un codice che non è mai stato creato.';

revoke all on function public.rubrica_codici_esiste() from public;
grant execute on function public.rubrica_codici_esiste() to authenticated;
