-- Trasferimenti fra sedi: tre correzioni che evitano di sbagliare il magazzino.
--
-- Audit del 15/09/2026. Al momento dell'audit la tabella `trasferimenti` ha
-- **zero righe** in produzione: 108 organizzazioni hanno i requisiti per usare
-- la pagina e non l'ha mai usata nessuno. Quindi nessun magazzino è già
-- sbagliato, e questo è il momento buono per sistemare.
--
-- ── 1. Due conferme insieme applicavano due volte lo stesso carico ────────
--
-- Le sei funzioni leggevano la riga così:
--
--     select * into v_t from public.trasferimenti where id = p_id;
--
-- senza `for update`. Il controllo che segue — «se lo stato non è 'inviato',
-- rifiuta» — leggeva uno stato che nessuno aveva bloccato. Due chiamate
-- contemporanee lo leggevano **entrambe** uguale a 'inviato', passavano
-- **entrambe**, e applicavano **entrambe** il carico.
--
-- Non è un caso di laboratorio: è il ragazzo del punto vendita che clicca
-- "Ricevuto", il wifi del negozio è lento, non succede niente per dieci
-- secondi, ricarica la pagina e riclicca. Oppure due persone che confermano lo
-- stesso arrivo da due telefoni. Risultato: la sede di arrivo si trova il
-- doppio dei pezzi, e in ricezione non c'è nessun controllo di disponibilità
-- che possa fermare il secondo passaggio.
--
-- `for update` è una parola per funzione ed è l'unica protezione che regge
-- anche se domani qualcuno sbaglia un pezzo di interfaccia.
--
-- ── 2. Il dipendente non vedeva niente e poteva fare tutto ────────────────
--
-- Il 15/09 mattina la lettura della tabella era stata chiusa al dipendente.
-- Ma queste funzioni sono SECURITY DEFINER — girano coi permessi del
-- proprietario e **saltano le regole di isolamento** — e il permesso di
-- eseguirle era concesso a chiunque fosse loggato, anzi anche a `anon`.
-- Dentro controllavano solo che chi chiama avesse un'organizzazione, e che
-- fosse quella giusta. **Il ruolo non lo guardavano.**
--
-- Il percorso: un dipendente apre Magazzino, che è una pagina sua di diritto,
-- e da lì legge `movimenti_stock_pf`, dove c'è la colonna `trasferimento_id`.
-- Si porta via gli id e chiama `trasferimento_annulla`. Lo stock si muove.
-- La porta d'ingresso chiusa e la finestra di lato aperta, di nuovo.
--
-- Decisione del titolare, 15/09/2026: **il dipendente può RICEVERE e basta.**
-- È lui che scarica il furgone alla sede, non il titolare da casa. Ma non
-- crea, non invia e non annulla: chi riceve conferma quello che è arrivato,
-- non decide cosa parte e non cancella un trasferimento in viaggio.
--
-- ── 3. Le due sedi potevano essere di aziende diverse ─────────────────────
--
-- Non era controllato da nessuna parte: né trigger, né vincolo, né dentro le
-- funzioni, che guardano solo `trasferimenti.organization_id`. Chi sa fare una
-- chiamata diretta poteva creare un trasferimento della propria azienda con la
-- sede di arrivo di un altro cliente. Non è una fuga di dati (le regole di
-- isolamento filtrano la lettura) ma è un confine che non esiste, e sporcizia
-- nel database di qualcun altro.

-- ── Le sei funzioni, riscritte con il blocco della riga ───────────────────

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
  -- Il dipendente riceve, non spedisce e non annulla (decisione del 15/09/2026).
  if public.is_dipendente() then
    raise exception 'Solo il titolare puo inviare o annullare un trasferimento';
  end if;
  select * into v_t from public.trasferimenti where id = p_id for update;
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
$function$;

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
  -- Il dipendente riceve, non spedisce e non annulla (decisione del 15/09/2026).
  if public.is_dipendente() then
    raise exception 'Solo il titolare puo inviare o annullare un trasferimento';
  end if;
  select * into v_t from public.trasferimenti where id = p_id for update;
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
$function$;

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
        data_invio = now()
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$function$;

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
          dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id)
      where id = p_id returning * into v_t;
    return v_t;
  end;
  $function$;

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
        data_ricezione = now()
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$function$;

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
        data_ricezione = now(), dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id)
    where id = p_id returning * into v_t;
  return v_t;
end;
$function$;


-- ── I permessi: prima erano concessi anche all'anonimo ────────────────────
--
-- La guardia dentro la funzione (`get_user_org_id() is null → eccezione`)
-- funziona e regge. Ma il permesso di CHIAMARLA non era mai stato tolto:
-- oggi la difesa è una sola, dentro, e se domani qualcuno riscrive queste
-- funzioni dimenticando quella riga il buco del 14 settembre torna identico.
-- Due reti sono meglio di una.
revoke execute on function public.trasferimento_invia(uuid) from public, anon;
revoke execute on function public.trasferimento_invia(uuid, uuid) from public, anon;
revoke execute on function public.trasferimento_annulla(uuid) from public, anon;
revoke execute on function public.trasferimento_annulla(uuid, uuid) from public, anon;
revoke execute on function public.trasferimento_ricevi(uuid, numeric, text) from public, anon;
revoke execute on function public.trasferimento_ricevi(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.trasferimento_invia(uuid) to authenticated, service_role;
grant execute on function public.trasferimento_invia(uuid, uuid) to authenticated, service_role;
grant execute on function public.trasferimento_annulla(uuid) to authenticated, service_role;
grant execute on function public.trasferimento_annulla(uuid, uuid) to authenticated, service_role;
grant execute on function public.trasferimento_ricevi(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.trasferimento_ricevi(uuid, numeric, text, uuid) to authenticated, service_role;

-- La tabella: `anon` aveva ancora tutti i permessi. Le regole di isolamento lo
-- fermano comunque, ma un permesso che non c'è non si può aggirare.
revoke all on public.trasferimenti from anon;

-- ── Il dipendente legge i trasferimenti della SUA sede ────────────────────
--
-- Non tutti quelli dell'azienda: quelli che riguardano il posto dove lavora.
-- Senza questo non vedrebbe nemmeno cosa sta per arrivargli, e non potrebbe
-- confermarlo.
drop policy if exists trasferimenti_own on public.trasferimenti;
create policy trasferimenti_lettura on public.trasferimenti
  for select using (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or sede_a in (select laboratorio_sede_id from public.profiles where id = auth.uid())
      or sede_da in (select laboratorio_sede_id from public.profiles where id = auth.uid())
    )
  );

-- Scrivere dal browser resta al titolare: il dipendente passa dalle funzioni,
-- che sanno cosa deve toccare e cosa no.
create policy trasferimenti_scrittura on public.trasferimenti
  for all using (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  ) with check (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  );

-- ── Le due sedi devono essere della stessa azienda ────────────────────────
create or replace function public.trasferimento_sedi_coerenti()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sede_da is not null and not exists (
    select 1 from public.sedi where id = new.sede_da and organization_id = new.organization_id
  ) then
    raise exception 'La sede di partenza non appartiene a questa azienda';
  end if;
  if new.sede_a is not null and not exists (
    select 1 from public.sedi where id = new.sede_a and organization_id = new.organization_id
  ) then
    raise exception 'La sede di arrivo non appartiene a questa azienda';
  end if;
  if new.sede_da is not null and new.sede_da = new.sede_a then
    raise exception 'Partenza e arrivo sono la stessa sede';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trasferimento_sedi_coerenti on public.trasferimenti;
create trigger trg_trasferimento_sedi_coerenti
  before insert or update of sede_da, sede_a, organization_id on public.trasferimenti
  for each row execute function public.trasferimento_sedi_coerenti();

-- La funzione del trigger non la chiama nessuno dall'esterno: è il database che
-- la esegue da solo prima di ogni scrittura.
revoke execute on function public.trasferimento_sedi_coerenti() from public, anon, authenticated;
