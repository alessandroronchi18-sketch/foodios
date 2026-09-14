-- I trasferimenti fra sedi si potevano annullare, inviare e ricevere senza
-- essere nessuno.
--
-- Trovato il 14/09/2026. Le tre funzioni controllavano la proprietà così:
--
--     if v_t.organization_id <> public.get_user_org_id() then raise ...
--
-- Per un utente loggato funziona. Per un anonimo `get_user_org_id()` è NULL, e
-- in SQL `qualcosa <> NULL` non è falso: è NULL. Un `if` con condizione NULL
-- non scatta, quindi il controllo veniva semplicemente saltato e la funzione
-- andava avanti. Il difetto è di quelli che si leggono dieci volte senza
-- vederli, perché il codice *sembra* giusto.
--
-- Provato sul database di produzione con la sola chiave pubblica del sito:
-- la chiamata anonima arrivava dentro e rispondeva "Trasferimento non trovato"
-- — cioè aveva passato il controllo di proprietà e stava cercando la riga. Con
-- l'id di un trasferimento vero avrebbe proseguito: annullare un trasferimento
-- muove lo stock fra due sedi.
--
-- Qui si aggiunge la guardia che le funzioni dello stock avevano già: se chi
-- chiama non ha un'organizzazione, si alza un'eccezione e basta.

CREATE OR REPLACE FUNCTION public.trasferimento_annulla(p_id uuid)
 RETURNS trasferimenti
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t public.trasferimenti;
begin
    if public.get_user_org_id() is null then raise exception 'Utente senza organizzazione'; end if;
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;
  if v_t.organization_id <> public.get_user_org_id() then
    raise exception 'Trasferimento non appartiene all''organizzazione corrente';
  end if;

  if v_t.stato = 'annullato' then return v_t; end if;
  if v_t.stato = 'ricevuto' then
    raise exception 'Impossibile annullare un trasferimento gia ricevuto. Crea una rettifica.';
  end if;

  if v_t.stato = 'inviato' and v_t.stock_applicato and v_t.tipo = 'prodotto' then
    perform public.applica_delta_stock_pf(
      v_t.organization_id, v_t.sede_da, v_t.prodotto, v_t.quantita, v_t.unita
    );
    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, v_t.quantita, 'annullo_trasferimento', v_t.id, 'Rollback per annullamento');
  end if;

  update public.trasferimenti
    set stato = 'annullato',
        stock_applicato = false
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trasferimento_annulla(p_id uuid, p_dipendente_op uuid DEFAULT NULL::uuid)
 RETURNS trasferimenti
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t public.trasferimenti;
begin
    if public.get_user_org_id() is null then raise exception 'Utente senza organizzazione'; end if;
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;
  if v_t.organization_id <> public.get_user_org_id() then raise exception 'Trasferimento non appartiene alla organizzazione corrente'; end if;
  if v_t.stato = 'annullato' then return v_t; end if;
  if v_t.stato = 'ricevuto' then raise exception 'Impossibile annullare un trasferimento gia ricevuto. Crea una rettifica.'; end if;
  if v_t.stato = 'inviato' and v_t.stock_applicato and v_t.tipo = 'prodotto' then
    perform public.applica_delta_stock_pf(v_t.organization_id, v_t.sede_da, v_t.prodotto, v_t.quantita, v_t.unita, p_dipendente_op);
    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, v_t.quantita, 'annullo_trasferimento', v_t.id, 'Rollback per annullamento');
  end if;
  update public.trasferimenti
    set stato = 'annullato', stock_applicato = false,
        dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id)
    where id = p_id returning * into v_t;
  return v_t;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trasferimento_invia(p_id uuid)
 RETURNS trasferimenti
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t public.trasferimenti;
  v_org uuid;
  v_disponibile numeric;
begin
    if public.get_user_org_id() is null then raise exception 'Utente senza organizzazione'; end if;
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;

  v_org := public.get_user_org_id();
  if v_t.organization_id <> v_org then
    raise exception 'Trasferimento non appartiene all''organizzazione corrente';
  end if;

  if v_t.stato not in ('bozza') then
    raise exception 'Stato non valido per invio: %', v_t.stato;
  end if;

  if v_t.quantita <= 0 then
    raise exception 'Quantita deve essere positiva';
  end if;

  if v_t.tipo = 'prodotto' then
    select coalesce(quantita, 0) into v_disponibile
      from public.stock_prodotti_finiti
      where organization_id = v_t.organization_id
        and sede_id = v_t.sede_da
        and prodotto_nome = v_t.prodotto;

    if v_disponibile < v_t.quantita then
      raise exception 'Quantita insufficiente in sede di partenza (disponibile: %, richiesto: %)',
        v_disponibile, v_t.quantita;
    end if;

    perform public.applica_delta_stock_pf(
      v_t.organization_id, v_t.sede_da, v_t.prodotto, -v_t.quantita, v_t.unita
    );

    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, -v_t.quantita, 'trasferimento_invio', v_t.id);
  end if;

  update public.trasferimenti
    set stato = 'inviato',
        stock_applicato = (v_t.tipo = 'prodotto'),
        data_invio = now()
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trasferimento_invia(p_id uuid, p_dipendente_op uuid DEFAULT NULL::uuid)
 RETURNS trasferimenti
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    v_t public.trasferimenti;
    v_org uuid;
    v_disponibile numeric;
  begin
    if public.get_user_org_id() is null then raise exception 'Utente senza organizzazione'; end if;
    select * into v_t from public.trasferimenti where id = p_id;
    if not found then raise exception 'Trasferimento non trovato'; end if;
    v_org := public.get_user_org_id();
    if v_t.organization_id <> v_org then raise exception 'Trasferimento non appartiene alla organizzazione corrente'; end if;
    if v_t.stato not in ('bozza') then raise exception 'Stato non valido per invio: %', v_t.stato; end if;
    if v_t.quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;
    if v_t.tipo = 'prodotto' then
      select coalesce(quantita, 0) into v_disponibile
        from public.stock_prodotti_finiti
        where organization_id = v_t.organization_id and sede_id = v_t.sede_da and prodotto_nome = v_t.prodotto;
      if v_disponibile < v_t.quantita then raise exception 'Quantita insufficiente in sede di partenza (disponibile: %, richiesto: %)', v_disponibile, v_t.quantita; end if;
      perform public.applica_delta_stock_pf(v_t.organization_id, v_t.sede_da, v_t.prodotto, -v_t.quantita, v_t.unita, p_dipendente_op);
      insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id)
      values (v_t.organization_id, v_t.sede_da, v_t.prodotto, -v_t.quantita, 'trasferimento_invio', v_t.id);
    end if;
    update public.trasferimenti
      set stato = 'inviato', stock_applicato = (v_t.tipo = 'prodotto'), data_invio = now(),
          dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id)
      where id = p_id returning * into v_t;
    return v_t;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.trasferimento_ricevi(p_id uuid, p_quantita_ricevuta numeric DEFAULT NULL::numeric, p_scarto_note text DEFAULT NULL::text)
 RETURNS trasferimenti
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t public.trasferimenti;
  v_qty_ric numeric;
  v_scarto numeric;
begin
    if public.get_user_org_id() is null then raise exception 'Utente senza organizzazione'; end if;
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;
  if v_t.organization_id <> public.get_user_org_id() then
    raise exception 'Trasferimento non appartiene all''organizzazione corrente';
  end if;

  if v_t.stato not in ('inviato') then
    raise exception 'Stato non valido per ricezione: %', v_t.stato;
  end if;

  v_qty_ric := coalesce(p_quantita_ricevuta, v_t.quantita);
  if v_qty_ric < 0 then raise exception 'Quantita ricevuta negativa'; end if;
  if v_qty_ric > v_t.quantita then
    raise exception 'Quantita ricevuta (%) maggiore di inviata (%)', v_qty_ric, v_t.quantita;
  end if;
  v_scarto := v_t.quantita - v_qty_ric;

  if v_t.tipo = 'prodotto' and v_qty_ric > 0 then
    perform public.applica_delta_stock_pf(
      v_t.organization_id, v_t.sede_a, v_t.prodotto, v_qty_ric, v_t.unita
    );

    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_a, v_t.prodotto, v_qty_ric, 'trasferimento_ricezione', v_t.id, p_scarto_note);
  end if;

  if v_scarto > 0 and v_t.tipo = 'prodotto' then
    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, 0, 'scarto', v_t.id, p_scarto_note);
  end if;

  update public.trasferimenti
    set stato = 'ricevuto',
        quantita_ricevuta = v_qty_ric,
        scarto_qty = v_scarto,
        scarto_note = p_scarto_note,
        data_ricezione = now()
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trasferimento_ricevi(p_id uuid, p_quantita_ricevuta numeric DEFAULT NULL::numeric, p_scarto_note text DEFAULT NULL::text, p_dipendente_op uuid DEFAULT NULL::uuid)
 RETURNS trasferimenti
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t public.trasferimenti;
  v_qty_ric numeric;
  v_scarto numeric;
begin
    if public.get_user_org_id() is null then raise exception 'Utente senza organizzazione'; end if;
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;
  if v_t.organization_id <> public.get_user_org_id() then raise exception 'Trasferimento non appartiene alla organizzazione corrente'; end if;
  if v_t.stato not in ('inviato') then raise exception 'Stato non valido per ricezione: %', v_t.stato; end if;
  v_qty_ric := coalesce(p_quantita_ricevuta, v_t.quantita);
  if v_qty_ric < 0 then raise exception 'Quantita ricevuta negativa'; end if;
  if v_qty_ric > v_t.quantita then raise exception 'Quantita ricevuta (%) maggiore di inviata (%)', v_qty_ric, v_t.quantita; end if;
  v_scarto := v_t.quantita - v_qty_ric;
  if v_t.tipo = 'prodotto' and v_qty_ric > 0 then
    perform public.applica_delta_stock_pf(v_t.organization_id, v_t.sede_a, v_t.prodotto, v_qty_ric, v_t.unita, p_dipendente_op);
    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_a, v_t.prodotto, v_qty_ric, 'trasferimento_ricezione', v_t.id, p_scarto_note);
  end if;
  if v_scarto > 0 and v_t.tipo = 'prodotto' then
    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, 0, 'scarto', v_t.id, p_scarto_note);
  end if;
  update public.trasferimenti
    set stato = 'ricevuto', quantita_ricevuta = v_qty_ric, scarto_qty = v_scarto, scarto_note = p_scarto_note,
        data_ricezione = now(), dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id)
    where id = p_id returning * into v_t;
  return v_t;
end;
$function$
