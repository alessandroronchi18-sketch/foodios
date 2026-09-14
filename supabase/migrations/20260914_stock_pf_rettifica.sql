-- Correggere una giacenza sbagliata non e' buttare merce.
--
-- Nella scheda "Prodotti finiti" c'e' un pulsante "Azzera", che serve a
-- cancellare una giacenza fantasma: merce che il sistema crede di avere e che
-- in cella non c'e' mai stata (un carico registrato due volte, una produzione
-- annullata male). Quel pulsante scriveva un movimento con causale 'scarto',
-- cioe' dichiarava che il prodotto era stato buttato.
--
-- Il risultato: chi puliva una giacenza sbagliata si vedeva peggiorare i numeri
-- degli sprechi, e il registro delle perdite conteneva roba mai prodotta. Due
-- danni: il conto degli sprechi non e' piu' vero, e chi lo guarda smette di
-- fidarsene.
--
-- La causale 'rettifica_manuale' e' gia' ammessa dal vincolo su
-- movimenti_stock_pf.causale (migration 20260615) e non era mai stata usata,
-- perche' mancava la funzione per scriverla. Questa e' quella funzione.
--
-- A differenza dello scarto, qui il delta puo' essere positivo o negativo: una
-- rettifica serve anche quando in cella c'e' piu' merce di quella registrata.

create or replace function public.stock_pf_rettifica(
  p_sede uuid,
  p_prodotto text,
  p_delta numeric,
  p_note text default null,
  p_dipendente_op uuid default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'La rettifica deve cambiare qualcosa'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, p_delta, 'pz', p_dipendente_op);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, p_delta, 'rettifica_manuale', p_note);

  return v_nuova;
end;
$$;

grant execute on function public.stock_pf_rettifica(uuid, text, numeric, text, uuid) to authenticated;
