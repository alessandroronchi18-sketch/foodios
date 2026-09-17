-- Un trasferimento non diceva chi l'ha mandato né chi l'ha ricevuto.
--
-- Richiesta del titolare, 17/09/2026: «nei trasferimenti dammi la possibilità
-- anche di segnare chi trasferisce cosa».
--
-- È lo stesso difetto corretto ieri sui movimenti di magazzino
-- (`20260917b`), e qui è più grave, perché un trasferimento ha DUE momenti e
-- DUE persone: chi carica il furgone e chi firma l'arrivo.
--
-- Cosa c'era, verificato sul database il 17/09/2026:
--
--     `created_by`                colonna presente, NESSUNO la riempie
--     `dipendente_operativo_id`   colonna presente, NESSUNO la riempie
--     `trasferimento_invia`       firma `(p_id uuid)` — nessun operatore
--     `trasferimento_ricevi`      idem
--     trasferimenti in produzione 1, con zero autori
--
-- Le due funzioni scrivono `data_invio` e `data_ricezione` — cioè QUANDO —
-- e non scrivono da nessuna parte CHI. Il giorno in cui arrivano otto
-- vaschette invece di dieci, il registro dice che ne mancano due e non dice
-- chi ha caricato né chi ha contato.
--
-- ── Perché due colonne nuove e non quella che c'è già ──────────────────
--
-- `dipendente_operativo_id` è una colonna sola. Riempirla due volte
-- significherebbe che il secondo cancella il primo: si saprebbe chi ha
-- ricevuto e si perderebbe chi ha mandato. Le due domande sono diverse e
-- vogliono due risposte.
--
-- `created_by` resta quello che è: chi ha CREATO la riga, cioè chi ha deciso
-- il trasferimento — che può non essere nessuno dei due.
--
-- ── Perché qui servono le funzioni e non un valore predefinito ─────────
--
-- Sui movimenti di magazzino è bastato `default auth.uid()`: c'è un momento
-- solo, quello dell'inserimento. Qui i momenti sono tre (creo, mando,
-- ricevo) e un valore predefinito ne conosce uno solo. Quindi le due
-- funzioni si toccano — ma con una riga ciascuna, presa dalla loro
-- definizione esatta e rimessa identica per il resto.
--
-- `coalesce(inviato_da, auth.uid())` e non un'assegnazione secca: se un
-- giorno si potrà correggere un trasferimento già inviato, il primo nome non
-- deve essere sovrascritto da chi lo ritocca.
--
-- Il server, che gira con la chiave di servizio, lascerà NULL: vuol dire
-- «l'ha fatto il programma», non «non si sa».
--
-- Migrazione additiva e ripetibile.


-- ── 1. Le colonne ───────────────────────────────────────────────────────
alter table public.trasferimenti
  add column if not exists inviato_da uuid null references auth.users(id) on delete set null;

alter table public.trasferimenti
  add column if not exists ricevuto_da uuid null references auth.users(id) on delete set null;

alter table public.trasferimenti
  alter column created_by set default auth.uid();

comment on column public.trasferimenti.inviato_da is
  'Chi ha confermato la partenza della merce. NULL = l''ha fatto il programma '
  '(funzione serverless), oppure il trasferimento è anteriore al 17/09/2026.';
comment on column public.trasferimenti.ricevuto_da is
  'Chi ha firmato l''arrivo e contato i pezzi. Diverso da inviato_da: sono due '
  'persone e due momenti, e una colonna sola ne avrebbe perso uno.';
comment on column public.trasferimenti.created_by is
  'Chi ha deciso il trasferimento, cioè chi ha creato la riga. Si riempie da '
  'sé con auth.uid(). Può non essere né chi manda né chi riceve.';


-- ── 2. Le due funzioni, identiche tranne una riga ciascuna ──────────────
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
  -- Il dipendente riceve, non spedisce e non annulla (decisione del 15/09/2026).
  if public.is_dipendente() then
    raise exception 'Solo il titolare puo inviare o annullare un trasferimento';
  end if;
  select * into v_t from public.trasferimenti where id = p_id for update;
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
        inviato_da = coalesce(inviato_da, auth.uid()),
        data_invio = now()
    where id = p_id
    returning * into v_t;

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
  select * into v_t from public.trasferimenti where id = p_id for update;
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
        ricevuto_da = coalesce(ricevuto_da, auth.uid()),
        data_ricezione = now()
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$function$

;

-- ── 3. Le versioni che il prodotto chiama davvero ───────────────────────
--
-- Correzione dentro la correzione, 17/09/2026. Le funzioni esistono in DUE
-- versioni: `(p_id)` e `(p_id, p_dipendente_op)`. La prima passata di questa
-- migrazione aveva aggiornato la prima — e il prodotto chiama la seconda
-- (`src/lib/trasferimenti.js:94` e `:103` passano sempre `p_dipendente_op`).
-- Una migrazione applicata e inutile: il difetto sarebbe rimasto intero.
--
-- La versione giusta e' anche la piu' ricca, ed e' il motivo per cui vale la
-- pena distinguere. Sul tablet del laboratorio l'account e' condiviso:
-- `auth.uid()` dice quale tablet, `p_dipendente_op` dice quale PERSONA. Le
-- due risposte sono diverse e servono tutt'e due — per capire chi ha contato
-- otto vaschette invece di dieci serve il nome, non il tablet.
--
-- `dipendente_operativo_id` resta com'e' per non rompere chi la legge, ma e'
-- una colonna sola per due momenti: con il `coalesce` chi manda resta e chi
-- riceve si perde. Le quattro colonne nuove tengono separati i due momenti.

alter table public.trasferimenti
  add column if not exists inviato_da_dip uuid null;
alter table public.trasferimenti
  add column if not exists ricevuto_da_dip uuid null;

comment on column public.trasferimenti.inviato_da_dip is
  'La PERSONA che ha caricato, quando il tablet e'' condiviso (il dipendente '
  'operativo scelto sulla schermata). inviato_da dice invece quale ACCOUNT.';
comment on column public.trasferimenti.ricevuto_da_dip is
  'La persona che ha contato i pezzi all''arrivo. Separata da inviato_da_dip: '
  'dipendente_operativo_id e'' una colonna sola per due momenti, e con il '
  'coalesce chi riceve si perdeva.';

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
  -- Il dipendente riceve, non spedisce e non annulla (decisione del 15/09/2026).
  if public.is_dipendente() then
    raise exception 'Solo il titolare puo inviare o annullare un trasferimento';
  end if;
    select * into v_t from public.trasferimenti where id = p_id for update;
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
          dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id),
          inviato_da = coalesce(inviato_da, auth.uid()),
          inviato_da_dip = coalesce(inviato_da_dip, p_dipendente_op)
      where id = p_id returning * into v_t;
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
  select * into v_t from public.trasferimenti where id = p_id for update;
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
        data_ricezione = now(), dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id),
        ricevuto_da = coalesce(ricevuto_da, auth.uid()),
        ricevuto_da_dip = coalesce(ricevuto_da_dip, p_dipendente_op)
    where id = p_id returning * into v_t;
  return v_t;
end;
$function$

;
