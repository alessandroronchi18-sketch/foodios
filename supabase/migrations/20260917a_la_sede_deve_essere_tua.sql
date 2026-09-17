-- La sede su cui si scrive non è mai stata «la tua sede».
--
-- Trovato il 17/09/2026 con l'audit di sicurezza, provato sul database di
-- produzione impersonando in lettura un dipendente vero.
--
-- Le nove funzioni `stock_pf_*` prendono la sede come parametro. Controllano
-- l'azienda — `v_org := get_user_org_id(); if v_org is null then raise` — e
-- poi si fidano della sede che è arrivata. Nessuna delle sedici funzioni che
-- hanno un `p_sede` nomina mai la tabella `sedi`: il controllo «questa sede è
-- tua» non esiste da nessuna parte. Nemmeno nelle regole di riga, che
-- guardano solo `organization_id`.
--
-- La prova, fatta sul database vero: impersonando il dipendente di un'azienda
-- e passando come `p_sede` l'id di una sede di un'altra azienda,
-- `stock_pf_rettifica` entra, supera la guardia e arriva alla scrittura.
--
-- Le tre domande dell'audit, per queste nove funzioni:
--
--   chi ha solo la chiave pubblica   respinto, «Utente senza organizzazione»
--   un ex dipendente (o un sospeso)  respinto uguale: get_user_org_id() è NULL
--   un dipendente attivo             passa, ed è giusto: il Magazzino è la
--                                    sua pagina — ma passa anche con la sede
--                                    di un'altra azienda, e quello non lo è
--
-- ── Cosa NON si può fare, che è importante quanto il resto ─────────────────
-- Non si legge niente di nessuno. La riga nasce con l'`organization_id` di chi
-- scrive, e le regole di riga della vittima filtrano sull'azienda: quella riga
-- lei non la vede mai. Non è una fuga di dati.
--
-- ── Cosa si può fare, in ordine di quanto costa ────────────────────────────
--
-- 1. Bloccare per sempre la cancellazione di un'azienda. `sedi` è puntata da
--    30 chiavi esterne, e su `user_data`, `stock_prodotti_finiti`,
--    `movimenti_stock_pf`, `trasferimenti`, `inventario_produzione`,
--    `costi_aziendali`, `forecast_giornaliero` e `pos_scontrini` la regola è
--    ON DELETE RESTRICT. Una riga scritta da fuori su una sede altrui impedisce
--    di cancellare quella sede; e siccome `sedi.organization_id` è ON DELETE
--    CASCADE, impedisce di cancellare l'azienda intera. «Elimina cliente» nel
--    pannello admin (`admin_org_cascade_delete`) fallirebbe con un errore di
--    chiave esterna che nessuno saprebbe spiegare, e un cliente che chiede la
--    cancellazione dei suoi dati non la otterrebbe.
--
-- 2. Sporcarsi il proprio magazzino. Giacenze e movimenti attaccati a una sede
--    che nella propria barra laterale non esiste: invisibili nelle pagine,
--    contati negli export e nei totali. Sono i «prodotti fantasma» che stanno
--    in cima ai common pitfalls di CLAUDE.md.
--
-- 3. Dentro la stessa azienda: le `stock_pf_*` non guardano nemmeno
--    `profiles.laboratorio_sede_id` — che invece `trasferimenti_lettura`
--    guarda. Chi lavora in Carlina può rettificare le giacenze di Berthollet.
--    È il caso che conta di più, perché è l'unico che capita **da solo**: il
--    tablet del laboratorio è condiviso, si cambia sede o account, e in
--    memoria resta il `sedeId` di prima. La rettifica parte, il database la
--    accetta, e la riga finisce su una sede che in quella schermata non c'è.
--    Nessuno ha sbagliato niente e il pezzo è sparito: sono i «prodotti
--    fantasma» in cima ai common pitfalls di CLAUDE.md, che oggi si spiegano
--    con «trasferimento mai ricevuto» perché questa strada non la conosceva
--    nessuno.
--
--    Si chiude stretta: vale solo per chi una sede fissa ce l'ha scritta in
--    faccia, cioè gli account di laboratorio (`laboratorio_sede_id`, che
--    `api/laboratorio-crea.js` riempie solo insieme a
--    `is_laboratorio_account`). Il titolare e il dipendente che copre due
--    negozi hanno quella colonna a NULL e continuano a lavorare su tutte le
--    sedi: quella è una decisione di prodotto e non la cambia una migrazione
--    di sicurezza.
--
--    La regola non è nuova, è solo l'unica parte che mancava. `useAuth.js`
--    (righe 159-171) forza già `sedeAttiva` sulla sede del laboratorio e si
--    rifiuta di ripiegare su un'altra — «sarebbe grave imputare operazioni a
--    una sede sbagliata», audit del 29/07/2026 — e `trasferimenti_lettura` la
--    applica già in lettura. Mancava in scrittura, cioè dove fa danno.
--
-- ── Quanto è probabile, detto onesto ───────────────────────────────────────
-- Per colpire qualcun altro bisogna conoscere l'uuid di una sua sede, e gli
-- uuid non si indovinano. Misurato il 17/09/2026: righe con una sede di
-- un'altra azienda, **0** su tutte e cinque le tabelle controllate. La
-- versione che capita da sola, senza nessun malintenzionato, è un `sedeId`
-- rimasto in memoria dopo un cambio di sede o di account sul tablet condiviso:
-- oggi la scrittura riesce lo stesso e il dato sparisce dalla vista.
--
-- ── La regola c'era già, scritta in un posto solo ───────────────────────────
-- Tre endpoint la applicano, con la stessa riga identica:
--
--     api/produzione-registra.js:98   api/spreco-registra.js:79
--     api/chiusura-registra.js:86
--     «La sede deve appartenere all'org del chiamante (no cross-org /
--      cross-sede)» → altrimenti 403 «sede non valida»
--
-- Chi l'ha scritta ci aveva pensato. Solo che una regola che vive in tre
-- funzioni di server vale per quelle tre: qui si sposta dove vale per tutti,
-- cioè nel database.
--
-- ── Cosa cambia per chi lavora: niente ─────────────────────────────────────
-- Il dipendente e il titolare passano sempre la sede attiva, che è una sede
-- della loro azienda. L'unica chiamata che comincia a fallire è quella che
-- oggi riesce in silenzio e produce un dato che nessuno vedrà più.
-- Da oggi `p_sede` nullo sullo stock è un errore esplicito: la giacenza è per
-- sede, e senza sede la riga non si aggancia a niente (verificato: 0 righe
-- così in produzione, quindi non se ne perde nessuna).
--
-- Misurato in produzione il 17/09/2026, prima di scriverla:
--   righe agganciate a una sede di un'altra azienda        0 su 5 tabelle
--   account di laboratorio (`is_laboratorio_account`)      0 su 579 profili
--   profili con una sede fissa (`laboratorio_sede_id`)     0
--   aziende con più di una sede                            192 su 579
--   dati di tutta l'azienda (`sede_id` nullo)              20 righe
-- Cioè: applicandola oggi non si chiude fuori nessuno, e si mette la regola in
-- piedi prima che nasca il primo tablet di laboratorio.
--
-- Migrazione additiva e ripetibile: si può applicare due volte.


-- ── 0. La domanda, scritta una volta sola ───────────────────────────────────
-- STABLE e SECURITY DEFINER perché `sedi` ha le sue regole di riga e qui
-- serve la risposta vera, non quella filtrata. Non restituisce niente della
-- sede: solo sì o no.
create or replace function public.sede_e_dell_azienda(p_sede uuid, p_org uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p_sede is not null
     and p_org  is not null
     and exists (select 1 from public.sedi s
                  where s.id = p_sede and s.organization_id = p_org)
$function$;

revoke execute on function public.sede_e_dell_azienda(uuid, uuid) from public, anon;
grant  execute on function public.sede_e_dell_azienda(uuid, uuid) to authenticated, service_role;


-- ── 0-bis. La seconda domanda: è la sede di QUESTO tablet? ──────────────────
-- Serve per il caso che capita da solo. Il tablet del laboratorio è condiviso
-- e sta fisicamente in una sede: `api/laboratorio-crea.js` glielo scrive in
-- `profiles.laboratorio_sede_id`. Se in memoria resta il `sedeId` di prima —
-- dopo un cambio di sede o di account — oggi la scrittura riesce lo stesso e
-- la riga sparisce dalla vista.
--
-- Risponde «sì» in tre casi, e sono quelli che fanno lavorare la gente:
--   - chi chiama non ha una sede fissa (titolare, o dipendente che copre due
--     negozi): `laboratorio_sede_id` è NULL, e resta libero come prima;
--   - la sede passata è proprio la sua;
--   - la sede è nulla, cioè è un dato di tutta l'azienda (ricettario, prezzi,
--     regole: 20 righe in produzione) — lì la sede non c'entra niente.
--
-- Scritta al negativo (`not exists`) di proposito: se il profilo non esiste
-- affatto la risposta è «sì», e a fermare quel caso ci pensa
-- `get_user_org_id()`, che è NULL e fa alzare l'eccezione prima. Una guardia
-- sola per ogni domanda.
create or replace function public.sede_e_del_tuo_laboratorio(p_sede uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p_sede is null
      or not exists (
           select 1 from public.profiles p
            where p.id = auth.uid()
              and p.laboratorio_sede_id is not null
              and p.laboratorio_sede_id is distinct from p_sede
         )
$function$;

revoke execute on function public.sede_e_del_tuo_laboratorio(uuid) from public, anon;
grant  execute on function public.sede_e_del_tuo_laboratorio(uuid) to authenticated, service_role;


-- ── 1. Le nove funzioni dello stock ─────────────────────────────────────────
-- Corpo identico a prima, con due guardie in più dopo quella sull'azienda: la
-- sede è di questa azienda, e la sede è quella di questo tablet.
-- I messaggi dicono cosa fare, perché chi li legge è in laboratorio col
-- tablet in mano, non davanti ai log.

create or replace function public.stock_pf_carico_produzione(p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz'::text, p_note text default null::text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if not public.sede_e_dell_azienda(p_sede, v_org) then
    raise exception 'La sede indicata non è di questa azienda'
      using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
  end if;
  if not public.sede_e_del_tuo_laboratorio(p_sede) then
    raise exception 'Questo tablet è assegnato a un''altra sede'
      using hint = 'Le giacenze si correggono dalla sede dove stai lavorando.', errcode = '42501';
  end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, p_quantita, p_unita);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, p_quantita, 'produzione', p_note);

  return v_nuova;
end;
$function$;

create or replace function public.stock_pf_carico_produzione(p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz'::text, p_note text default null::text, p_dipendente_op uuid default null::uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if not public.sede_e_dell_azienda(p_sede, v_org) then
    raise exception 'La sede indicata non è di questa azienda'
      using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
  end if;
  if not public.sede_e_del_tuo_laboratorio(p_sede) then
    raise exception 'Questo tablet è assegnato a un''altra sede'
      using hint = 'Le giacenze si correggono dalla sede dove stai lavorando.', errcode = '42501';
  end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, p_quantita, p_unita, p_dipendente_op);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, p_quantita, 'produzione', p_note);

  return v_nuova;
end;
$function$;

create or replace function public.stock_pf_scarico_vendita(p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz'::text, p_note text default null::text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if not public.sede_e_dell_azienda(p_sede, v_org) then
    raise exception 'La sede indicata non è di questa azienda'
      using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
  end if;
  if not public.sede_e_del_tuo_laboratorio(p_sede) then
    raise exception 'Questo tablet è assegnato a un''altra sede'
      using hint = 'Le giacenze si correggono dalla sede dove stai lavorando.', errcode = '42501';
  end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, p_unita);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'vendita', p_note);

  return v_nuova;
end;
$function$;

create or replace function public.stock_pf_scarico_vendita(p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz'::text, p_note text default null::text, p_dipendente_op uuid default null::uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if not public.sede_e_dell_azienda(p_sede, v_org) then
    raise exception 'La sede indicata non è di questa azienda'
      using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
  end if;
  if not public.sede_e_del_tuo_laboratorio(p_sede) then
    raise exception 'Questo tablet è assegnato a un''altra sede'
      using hint = 'Le giacenze si correggono dalla sede dove stai lavorando.', errcode = '42501';
  end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, p_unita, p_dipendente_op);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'vendita', p_note);

  return v_nuova;
end;
$function$;

create or replace function public.stock_pf_scarto(p_sede uuid, p_prodotto text, p_quantita numeric, p_note text default null::text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if not public.sede_e_dell_azienda(p_sede, v_org) then
    raise exception 'La sede indicata non è di questa azienda'
      using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
  end if;
  if not public.sede_e_del_tuo_laboratorio(p_sede) then
    raise exception 'Questo tablet è assegnato a un''altra sede'
      using hint = 'Le giacenze si correggono dalla sede dove stai lavorando.', errcode = '42501';
  end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, 'pz');

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'scarto', p_note);

  return v_nuova;
end;
$function$;

create or replace function public.stock_pf_scarto(p_sede uuid, p_prodotto text, p_quantita numeric, p_note text default null::text, p_dipendente_op uuid default null::uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if not public.sede_e_dell_azienda(p_sede, v_org) then
    raise exception 'La sede indicata non è di questa azienda'
      using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
  end if;
  if not public.sede_e_del_tuo_laboratorio(p_sede) then
    raise exception 'Questo tablet è assegnato a un''altra sede'
      using hint = 'Le giacenze si correggono dalla sede dove stai lavorando.', errcode = '42501';
  end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, 'pz', p_dipendente_op);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'scarto', p_note);

  return v_nuova;
end;
$function$;

create or replace function public.stock_pf_rettifica(p_sede uuid, p_prodotto text, p_delta numeric, p_note text default null::text, p_dipendente_op uuid default null::uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if not public.sede_e_dell_azienda(p_sede, v_org) then
    raise exception 'La sede indicata non è di questa azienda'
      using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
  end if;
  if not public.sede_e_del_tuo_laboratorio(p_sede) then
    raise exception 'Questo tablet è assegnato a un''altra sede'
      using hint = 'Le giacenze si correggono dalla sede dove stai lavorando.', errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then raise exception 'La rettifica deve cambiare qualcosa'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, p_delta, 'pz', p_dipendente_op);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, p_delta, 'rettifica_manuale', p_note);

  return v_nuova;
end;
$function$;

create or replace function public.stock_pf_carico_b2b(p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz'::text, p_note text default null::text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_org uuid := public.get_user_org_id(); v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if not public.sede_e_dell_azienda(p_sede, v_org) then
    raise exception 'La sede indicata non è di questa azienda'
      using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
  end if;
  if not public.sede_e_del_tuo_laboratorio(p_sede) then
    raise exception 'Questo tablet è assegnato a un''altra sede'
      using hint = 'Le giacenze si correggono dalla sede dove stai lavorando.', errcode = '42501';
  end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;
  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, p_quantita, p_unita);
  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, p_quantita, 'annullo_vendita_b2b', p_note);
  return v_nuova;
end; $function$;

create or replace function public.stock_pf_scarico_b2b(p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz'::text, p_note text default null::text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_org uuid := public.get_user_org_id(); v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if not public.sede_e_dell_azienda(p_sede, v_org) then
    raise exception 'La sede indicata non è di questa azienda'
      using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
  end if;
  if not public.sede_e_del_tuo_laboratorio(p_sede) then
    raise exception 'Questo tablet è assegnato a un''altra sede'
      using hint = 'Le giacenze si correggono dalla sede dove stai lavorando.', errcode = '42501';
  end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;
  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, p_unita);
  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'vendita_b2b', p_note);
  return v_nuova;
end; $function$;


-- ── 2. La scrittura dei dati di lavoro ──────────────────────────────────────
-- Stesso corpo della migrazione 20260916a, con il controllo della sede in più.
-- Qui la sede nulla è legittima: le chiavi condivise di tutta l'azienda
-- (ricettario, prezzi, regole) stanno su `sede_id is null`, e in produzione
-- sono 20 righe.
create or replace function public.fos_user_data_set_batch(p_items jsonb, p_org uuid default null::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org  uuid;
  v_dip  boolean;
  it     jsonb;
  v_key  text;
  v_val  jsonb;
  v_sede uuid;
begin
  if auth.uid() is not null then
    v_org := public.get_user_org_id();
    v_dip := public.is_dipendente();
  else
    v_org := p_org;
    v_dip := false;
  end if;
  if v_org is null then raise exception 'Organizzazione non determinabile'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_key  := it->>'data_key';
    v_val  := it->'data_value';
    v_sede := nullif(it->>'sede_id', '')::uuid;

    if v_dip and not public.is_chiave_operativa(v_key) then
      raise exception 'Operazione non consentita sulla chiave %', v_key;
    end if;

    -- La riga della 20260916a: scrivere qui vuol dire sostituire tutto il
    -- blocco. Chi non può leggere il blocco non sa cosa sta sostituendo,
    -- quindi non lo sostituisce.
    if v_dip and public.is_chiave_sensibile(v_key) then
      raise exception 'La chiave % non si può riscrivere dal browser: contiene dati che il tuo profilo non legge', v_key;
    end if;

    -- Le righe nuove: o è una chiave di tutta l'azienda (sede nulla), o la
    -- sede dev'essere una sede di questa azienda — e, se chi scrive è un
    -- tablet di laboratorio, dev'essere la sua.
    if v_sede is not null and not public.sede_e_dell_azienda(v_sede, v_org) then
      raise exception 'La sede indicata non è di questa azienda'
        using hint = 'Riapri la pagina e scegli di nuovo la sede.', errcode = '42501';
    end if;

    if not public.sede_e_del_tuo_laboratorio(v_sede) then
      raise exception 'Questo tablet è assegnato a un''altra sede'
        using hint = 'Riapri la pagina: la sede in memoria non è più quella giusta.', errcode = '42501';
    end if;

    update public.user_data
       set data_value = v_val, updated_at = now()
     where organization_id = v_org and data_key = v_key
       and (sede_id = v_sede or (v_sede is null and sede_id is null));
    if not found then
      insert into public.user_data (organization_id, sede_id, data_key, data_value, updated_at)
      values (v_org, v_sede, v_key, v_val, now());
    end if;
  end loop;
end $function$;

revoke execute on function public.fos_user_data_set_batch(jsonb, uuid) from public, anon;
grant  execute on function public.fos_user_data_set_batch(jsonb, uuid) to authenticated, service_role;


-- ── 3. La seconda rete: le regole di riga ───────────────────────────────────
-- Le funzioni qui sopra girano in SECURITY DEFINER e le regole di riga non le
-- toccano: per questo il controllo sta dentro di loro. Ma le stesse tabelle si
-- scrivono anche dritte per dritte dal browser, e lì le regole sono l'unica
-- difesa — e guardavano solo l'azienda. Si aggiungono le stesse due domande
-- **solo in scrittura** (`with check`): in lettura no, perché filtrare per
-- sede ogni riga letta costerebbe una chiamata di funzione per riga e
-- nasconderebbe righe già scritte, che è un altro problema e non si risolve
-- di nascosto.
--
-- `trasferimenti_scrittura` non prende la guardia del laboratorio: inviare e
-- annullare è del titolare (`not is_dipendente()`), e un account di
-- laboratorio è un dipendente. `trasferimento_ricevi` invece la sede non se la
-- fa passare — la legge dalla riga del trasferimento (`v_t.sede_a`) — quindi
-- non è di questa famiglia e resta com'è.

drop policy if exists data_insert_own on public.user_data;
create policy data_insert_own on public.user_data
  for insert to public
  with check (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or (public.is_chiave_operativa(data_key) and not public.is_chiave_sensibile(data_key))
    )
    and (sede_id is null or public.sede_e_dell_azienda(sede_id, organization_id))
    and public.sede_e_del_tuo_laboratorio(sede_id)
  );

drop policy if exists data_update_own on public.user_data;
create policy data_update_own on public.user_data
  for update to public
  using (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or (public.is_chiave_operativa(data_key) and not public.is_chiave_sensibile(data_key))
    )
  )
  with check (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or (public.is_chiave_operativa(data_key) and not public.is_chiave_sensibile(data_key))
    )
    and (sede_id is null or public.sede_e_dell_azienda(sede_id, organization_id))
    and public.sede_e_del_tuo_laboratorio(sede_id)
  );

-- La cancellazione resta com'era: chi cancella non crea agganci nuovi.

drop policy if exists stock_pf_own on public.stock_prodotti_finiti;
create policy stock_pf_own on public.stock_prodotti_finiti
  for all to public
  using (organization_id = public.get_user_org_id())
  with check (
    organization_id = public.get_user_org_id()
    and public.sede_e_dell_azienda(sede_id, organization_id)
    and public.sede_e_del_tuo_laboratorio(sede_id)
  );

drop policy if exists mov_stock_pf_own on public.movimenti_stock_pf;
create policy mov_stock_pf_own on public.movimenti_stock_pf
  for all to public
  using (organization_id = public.get_user_org_id())
  with check (
    organization_id = public.get_user_org_id()
    and public.sede_e_dell_azienda(sede_id, organization_id)
    and public.sede_e_del_tuo_laboratorio(sede_id)
  );

drop policy if exists trasferimenti_scrittura on public.trasferimenti;
create policy trasferimenti_scrittura on public.trasferimenti
  for all to public
  using (organization_id = public.get_user_org_id() and not public.is_dipendente())
  with check (
    organization_id = public.get_user_org_id()
    and not public.is_dipendente()
    and public.sede_e_dell_azienda(sede_da, organization_id)
    and public.sede_e_dell_azienda(sede_a, organization_id)
  );
