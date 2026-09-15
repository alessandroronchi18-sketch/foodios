-- Il codice a 4 cifre del dipendente si poteva provare all'infinito.
--
-- Come funziona. Il tablet del laboratorio entra in Foodos con un account
-- condiviso (una email e una password sole per tutto il banco). Poi ogni
-- persona si riconosce con il PROPRIO codice di 4 cifre, e da lì in avanti
-- tutto quello che fa — la produzione registrata, lo spreco, il carico di
-- merce — resta scritto a suo nome.
--
-- Il difetto, trovato il 15/09/2026. `dipendente_operativo_valida` non
-- contava i tentativi. Quattro cifre sono **diecimila combinazioni**: chi ha
-- il tablet in mano — cioè chiunque lavori lì — poteva provarle tutte con un
-- programmino e presentarsi come un collega. Non si rubano dati (il tablet
-- quei dati li vede già): si ruba il NOME sotto alle operazioni. In un
-- registro che serve proprio a sapere chi ha fatto cosa, è tutto.
--
-- I documenti interni dicevano che esisteva una funzione `verify_dipendente_pin`
-- con un blocco dopo 5 errori. Quella funzione **nel database non c'è**:
-- controllato. Chi ha riscritto il percorso operativo nel luglio 2026 non se
-- l'è portata dietro, e il documento è rimasto indietro.
--
-- La correzione: non un muro, un'attesa che cresce.
--
-- Un muro dopo 5 errori qui farebbe più danni del problema: il tablet è
-- condiviso, quindi bloccare "l'account" vuol dire bloccare TUTTO il banco —
-- e basterebbe un dispettoso che digita cinque codici a caso per fermare il
-- laboratorio in piena produzione. Invece dopo qualche errore si aspetta, e
-- l'attesa si allunga:
--
--   1-3 errori  → niente. Un codice si sbaglia, capita.
--   4°  →  3 secondi      7°  → 30 secondi
--   5°  →  5 secondi      8°  →  1 minuto
--   6°  → 15 secondi      9° e oltre → 2 minuti
--
-- Con due minuti di attesa, provare diecimila combinazioni richiede più di
-- tredici giorni senza mai staccare. Chi invece ha sbagliato a digitare due
-- volte non si accorge che esista un limite.

create table if not exists public.dipendente_codice_tentativi (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  -- Chi stava usando il tablet: l'account condiviso del laboratorio.
  auth_user_id     uuid not null,
  riuscito         boolean not null,
  creato_il        timestamptz not null default now()
);

create index if not exists idx_dip_tentativi_utente
  on public.dipendente_codice_tentativi (auth_user_id, creato_il desc);

alter table public.dipendente_codice_tentativi enable row level security;

-- Nessuno la legge o la scrive dal browser: la riempie la funzione qui sotto,
-- che gira con i privilegi del proprietario.
revoke all on public.dipendente_codice_tentativi from anon, authenticated;

-- Secondi da aspettare dopo `n` errori recenti. Stessa forma della scala usata
-- per il login (api/login-guard.js): impercettibile in buona fede, proibitiva
-- per un programma.
create or replace function public.attesa_codice_dipendente(n integer)
returns integer
language sql
immutable
as $$
  select case
    when n <= 3 then 0
    when n = 4  then 3
    when n = 5  then 5
    when n = 6  then 15
    when n = 7  then 30
    when n = 8  then 60
    else 120
  end;
$$;

create or replace function public.dipendente_operativo_valida(p_codice text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid        uuid := auth.uid();
  v_org        uuid;
  v_dip        record;
  v_session_id uuid;
  v_falliti    integer;
  v_ultimo     timestamptz;
  v_attesa     integer;
  v_manca      integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select organization_id into v_org from public.profiles where id = v_uid;
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'no_org'); end if;
  if p_codice is null or p_codice !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'codice_formato_invalido');
  end if;

  -- ── Quanti errori ha fatto questo tablet negli ultimi 15 minuti ──────────
  select count(*), max(creato_il)
    into v_falliti, v_ultimo
    from public.dipendente_codice_tentativi
   where auth_user_id = v_uid
     and riuscito = false
     and creato_il > now() - interval '15 minutes';

  v_attesa := public.attesa_codice_dipendente(coalesce(v_falliti, 0));
  if v_attesa > 0 and v_ultimo is not null then
    -- L'attesa si conta dall'ultimo errore, non dal primo: altrimenti
    -- basterebbe far scorrere la finestra per ricominciare da capo.
    v_manca := ceil(extract(epoch from (v_ultimo + make_interval(secs => v_attesa)) - now()));
    if v_manca > 0 then
      return jsonb_build_object('ok', false, 'error', 'troppi_tentativi', 'attesa_sec', v_manca);
    end if;
  end if;

  select d.id, d.nome, d.cognome, d.ruolo
    into v_dip
    from public.dipendenti d
    join public.dipendenti_codici c on c.dipendente_id = d.id
   where d.organization_id = v_org
     and c.organization_id = v_org
     and c.codice_operativo = p_codice
     and c.attivo = true
     and d.attivo = true;

  if not found then
    insert into public.dipendente_codice_tentativi (organization_id, auth_user_id, riuscito)
      values (v_org, v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'codice_non_valido');
  end if;

  -- Codice giusto: si riparte da zero, così chi ha sbagliato e poi ha
  -- ricordato non si porta dietro l'attesa per un quarto d'ora.
  delete from public.dipendente_codice_tentativi
   where auth_user_id = v_uid and riuscito = false;
  insert into public.dipendente_codice_tentativi (organization_id, auth_user_id, riuscito)
    values (v_org, v_uid, true);

  update public.dipendenti_codici set last_used_at = now() where dipendente_id = v_dip.id;
  update public.dipendente_operativo_sessioni
     set terminata_at = now()
   where auth_user_id = v_uid and terminata_at is null;
  insert into public.dipendente_operativo_sessioni (organization_id, auth_user_id, dipendente_id)
    values (v_org, v_uid, v_dip.id)
    returning id into v_session_id;

  return jsonb_build_object('ok', true, 'id', v_dip.id, 'nome', v_dip.nome,
                            'cognome', v_dip.cognome, 'ruolo', v_dip.ruolo,
                            'session_id', v_session_id);
end;
$function$;

revoke execute on function public.dipendente_operativo_valida(text) from public, anon;
grant execute on function public.dipendente_operativo_valida(text) to authenticated, service_role;
revoke execute on function public.attesa_codice_dipendente(integer) from public, anon;
grant execute on function public.attesa_codice_dipendente(integer) to authenticated, service_role;
