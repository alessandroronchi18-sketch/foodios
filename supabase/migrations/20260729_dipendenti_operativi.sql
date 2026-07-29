-- ════════════════════════════════════════════════════════════════════════════
-- Dipendenti operativi (identita' post-login su tablet condiviso)
-- ════════════════════════════════════════════════════════════════════════════
-- Il modello vecchio prevedeva 1 account auth.users per ogni dipendente
-- (email personale + codice 6 cifre come password). Nella realta' delle
-- pasticcerie/gelaterie molti dipendenti non hanno email di lavoro dedicata
-- e il tablet e' FISICAMENTE condiviso: 4 persone lo usano a rotazione.
--
-- Nuovo modello a due livelli:
--   1) auth.users = 1 account "laboratorio" per sede (email + password
--      condivisa tra i colleghi che usano lo stesso tablet)
--   2) dipendenti.codice_operativo = codice 4 cifre personale (post-login,
--      il dipendente si identifica). Le operazioni vengono tracciate col
--      suo nome + cognome + id.
--
-- Sicurezza: il codice 4 cifre non e' auth vero (auth = password laboratorio
-- gia' passata). E' identity switch dentro un trust boundary. 10.000 combos
-- per org sono abbondanti (max ~50 dipendenti attivi tipici).
--
-- Compatibilita': ADDITIVE, non tocca il modello 1-account-per-dipendente
-- esistente. I dipendenti "vecchi" (con email personale + codice 6 cifre
-- password) continuano a funzionare in parallelo. Ne pre-revenue non ne
-- abbiamo, ma tanto vale non rompere il codice PIN/legacy dietro.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) profiles: marca account laboratorio + sede fissa ─────────────────────
alter table public.profiles
  add column if not exists is_laboratorio_account boolean default false;

alter table public.profiles
  add column if not exists laboratorio_sede_id uuid;

alter table public.profiles drop constraint if exists profiles_laboratorio_sede_id_fkey;
alter table public.profiles add constraint profiles_laboratorio_sede_id_fkey foreign key (laboratorio_sede_id) references public.sedi(id) on delete set null;

comment on column public.profiles.is_laboratorio_account is
  'true = account condiviso in un laboratorio (tablet fisico), post-login e'' richiesto codice operativo. Se false, e'' un account personale (titolare o dipendente col suo account).';
comment on column public.profiles.laboratorio_sede_id is
  'Sede fisica in cui vive il tablet di questo laboratorio. Fissa la sedeAttiva al login.';

-- ── 2) dipendenti: cognome (parte "pubblica" dell'anagrafica dell'org) ──────
alter table public.dipendenti
  add column if not exists cognome text;

-- ── 2b) dipendenti_codici: tabella SEPARATA per il codice operativo ─────────
-- SICUREZZA: se mettessimo codice_operativo direttamente sulla tabella
-- dipendenti, un dipendente loggato tramite account laboratorio potrebbe
-- fare SELECT (RLS dipendenti_own permette read a tutta l'org) e leggere
-- i codici dei colleghi → potrebbe loggarsi come loro. La policy RLS di
-- Postgres e' riga-based, non colonna-based, quindi non si puo' filtrare
-- una singola colonna. Soluzione: tabella dedicata con policy stretta:
-- SELECT/INSERT/UPDATE/DELETE solo per ruolo=titolare. Il dipendente NON
-- vede mai la tabella direttamente. L'unica funzione che legge codici e'
-- dipendente_operativo_valida (SECURITY DEFINER, bypassa RLS).
create table if not exists public.dipendenti_codici (
  dipendente_id uuid primary key references public.dipendenti(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  codice_operativo varchar(4) not null,
  attivo boolean not null default true,
  set_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint dipendenti_codici_format check (codice_operativo ~ '^[0-9]{4}$')
);

-- Unicita' del codice per org, solo tra quelli attivi (se disattivo il codice
-- puo' essere riassegnato a un altro dipendente in futuro).
create unique index if not exists uq_dipendenti_codici_attivo
  on public.dipendenti_codici (organization_id, codice_operativo)
  where attivo = true;

create index if not exists idx_dipendenti_codici_org
  on public.dipendenti_codici (organization_id);

alter table public.dipendenti_codici enable row level security;

-- RLS: solo il titolare dell'org puo' leggere/scrivere. Il dipendente non
-- deve mai vedere questa tabella. La validazione codice al login avviene
-- tramite RPC SECURITY DEFINER, non con select diretto.
drop policy if exists "dipendenti_codici_titolare_only" on public.dipendenti_codici;
create policy "dipendenti_codici_titolare_only" on public.dipendenti_codici
  for all
  using (
    organization_id = public.get_user_org_id()
    and not public.is_dipendente()
  )
  with check (
    organization_id = public.get_user_org_id()
    and not public.is_dipendente()
  );

comment on table public.dipendenti_codici is
  'Codici operativi 4 cifre dei dipendenti. Tabella separata da dipendenti per RLS piu'' stretta: solo il titolare puo'' SELECT (il dipendente logato via laboratorio non deve vedere i codici dei colleghi).';

-- ── 3) audit_log: traccia identita' operativa dell'operatore ────────────────
alter table public.audit_log
  add column if not exists dipendente_operativo_id uuid;

alter table public.audit_log drop constraint if exists audit_log_dipendente_operativo_id_fkey;
alter table public.audit_log add constraint audit_log_dipendente_operativo_id_fkey foreign key (dipendente_operativo_id) references public.dipendenti(id) on delete set null;

create index if not exists idx_audit_log_dip_op
  on public.audit_log (organization_id, dipendente_operativo_id, created_at desc)
  where dipendente_operativo_id is not null;

comment on column public.audit_log.dipendente_operativo_id is
  'ID persona operante (dipendente rubrica). Se null: azione del titolare direttamente col suo account, o legacy.';

-- ── 4) Tabelle operative: colonna dipendente_operativo_id ───────────────────
-- Aggiunta nullable per non rompere insert legacy. Il client la include quando
-- la sessione ha un dipendente selezionato.
alter table public.stock_prodotti_finiti add column if not exists dipendente_operativo_id uuid;
alter table public.trasferimenti         add column if not exists dipendente_operativo_id uuid;
alter table public.haccp_temperature     add column if not exists dipendente_operativo_id uuid;
alter table public.haccp_checklist_log   add column if not exists dipendente_operativo_id uuid;
alter table public.vendite_b2b           add column if not exists dipendente_operativo_id uuid;

-- FK: drop + add, idempotenti senza DO blocks (SQL editor Supabase ha problemi
-- coi dollar-quoted tags nested). On delete set null: se il dipendente viene
-- rimosso, la riga resta ma perde il tracciante.
alter table public.stock_prodotti_finiti drop constraint if exists stock_prodotti_finiti_dipendente_operativo_id_fkey;
alter table public.stock_prodotti_finiti add constraint stock_prodotti_finiti_dipendente_operativo_id_fkey foreign key (dipendente_operativo_id) references public.dipendenti(id) on delete set null;

alter table public.trasferimenti drop constraint if exists trasferimenti_dipendente_operativo_id_fkey;
alter table public.trasferimenti add constraint trasferimenti_dipendente_operativo_id_fkey foreign key (dipendente_operativo_id) references public.dipendenti(id) on delete set null;

alter table public.haccp_temperature drop constraint if exists haccp_temperature_dipendente_operativo_id_fkey;
alter table public.haccp_temperature add constraint haccp_temperature_dipendente_operativo_id_fkey foreign key (dipendente_operativo_id) references public.dipendenti(id) on delete set null;

alter table public.haccp_checklist_log drop constraint if exists haccp_checklist_log_dipendente_operativo_id_fkey;
alter table public.haccp_checklist_log add constraint haccp_checklist_log_dipendente_operativo_id_fkey foreign key (dipendente_operativo_id) references public.dipendenti(id) on delete set null;

alter table public.vendite_b2b drop constraint if exists vendite_b2b_dipendente_operativo_id_fkey;
alter table public.vendite_b2b add constraint vendite_b2b_dipendente_operativo_id_fkey foreign key (dipendente_operativo_id) references public.dipendenti(id) on delete set null;

-- ── 5) _audit_log_row: accetta anche dipendente_operativo_id ────────────────
-- Backward-compat: il vecchio signature senza p_dipendente_op_id continua a
-- esistere come wrapper. I trigger nuovi passano l'id, i vecchi (se qualcuno
-- ancora chiama la vecchia signature) hanno null → audit_log.dipendente_operativo_id null.
create or replace function public._audit_log_row(
  p_org uuid,
  p_table text,
  p_op text,
  p_row_id text,
  p_label text,
  p_meta jsonb,
  p_dipendente_op_id uuid
) returns void as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_ruolo text;
begin
  if v_uid is null then return; end if;
  select email, ruolo into v_email, v_ruolo
  from public.profiles where id = v_uid;

  insert into public.audit_log (
    organization_id, user_id, user_email, table_name, operation,
    row_id, new_data, changed_by, dipendente_operativo_id, created_at
  ) values (
    p_org, v_uid, v_email, p_table, p_op,
    p_row_id,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('ruolo', v_ruolo, 'label', p_label),
    v_uid, p_dipendente_op_id, now()
  );
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public._audit_log_row(uuid, text, text, text, text, jsonb, uuid) from public, anon, authenticated;

-- Wrapper vecchia signature (backward compat): chiama la nuova con NULL.
create or replace function public._audit_log_row(
  p_org uuid,
  p_table text,
  p_op text,
  p_row_id text,
  p_label text,
  p_meta jsonb
) returns void as $$
begin
  perform public._audit_log_row(p_org, p_table, p_op, p_row_id, p_label, p_meta, null::uuid);
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public._audit_log_row(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- ── 6) Aggiorna i 5 trigger audit_log per leggere NEW.dipendente_operativo_id
create or replace function public.log_stock_pf_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_op text := lower(TG_OP);
  v_label text;
  v_delta numeric;
  v_dip_op uuid;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := format('Movimento scorta prodotto: %s (%s pz)',
      coalesce(NEW.prodotto_nome, '?'),
      coalesce(NEW.qta_delta::text, '0'));
    v_delta := NEW.qta_delta;
    v_dip_op := NEW.dipendente_operativo_id;
  elsif v_op = 'update' then
    v_label := format('Movimento scorta modificato: %s', coalesce(NEW.prodotto_nome, '?'));
    v_delta := NEW.qta_delta;
    v_dip_op := NEW.dipendente_operativo_id;
  else
    v_label := format('Movimento scorta annullato: %s', coalesce(OLD.prodotto_nome, '?'));
    v_delta := OLD.qta_delta;
    v_dip_op := OLD.dipendente_operativo_id;
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'stock_prodotti_finiti', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'sede_id', coalesce(NEW.sede_id, OLD.sede_id),
      'prodotto', coalesce(NEW.prodotto_nome, OLD.prodotto_nome),
      'delta', v_delta,
      'tipo', coalesce(NEW.tipo, OLD.tipo)
    ),
    v_dip_op
  );
  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.log_trasferimento_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_op text := lower(TG_OP);
  v_label text;
  v_dip_op uuid;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := format('Trasferimento creato: %s (%s pz)',
      coalesce(NEW.prodotto_nome, '?'),
      coalesce(NEW.qta::text, '0'));
    v_dip_op := NEW.dipendente_operativo_id;
  elsif v_op = 'update' then
    v_label := format('Trasferimento aggiornato: %s (stato: %s)',
      coalesce(NEW.prodotto_nome, '?'),
      coalesce(NEW.stato, '?'));
    v_dip_op := NEW.dipendente_operativo_id;
  else
    v_label := format('Trasferimento annullato: %s', coalesce(OLD.prodotto_nome, '?'));
    v_dip_op := OLD.dipendente_operativo_id;
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'trasferimenti', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'sede_partenza', coalesce(NEW.sede_partenza_id, OLD.sede_partenza_id),
      'sede_arrivo', coalesce(NEW.sede_arrivo_id, OLD.sede_arrivo_id),
      'prodotto', coalesce(NEW.prodotto_nome, OLD.prodotto_nome),
      'qta', coalesce(NEW.qta, OLD.qta),
      'stato', coalesce(NEW.stato, OLD.stato)
    ),
    v_dip_op
  );
  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.log_haccp_temperature_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_op text := lower(TG_OP);
  v_label text;
  v_dip_op uuid;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := format('Rilevata temperatura: %s C', coalesce(NEW.temperatura::text, '?'));
    if NEW.fuori_range = true then
      v_label := v_label || ' (FUORI RANGE)';
    end if;
    v_dip_op := NEW.dipendente_operativo_id;
  elsif v_op = 'update' then
    v_label := 'Rilevazione temperatura modificata';
    v_dip_op := NEW.dipendente_operativo_id;
  else
    v_label := 'Rilevazione temperatura eliminata';
    v_dip_op := OLD.dipendente_operativo_id;
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'haccp_temperature', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'apparecchio_id', coalesce(NEW.apparecchio_id, OLD.apparecchio_id),
      'temperatura', coalesce(NEW.temperatura, OLD.temperatura),
      'fuori_range', coalesce(NEW.fuori_range, OLD.fuori_range),
      'operatore', coalesce(NEW.operatore, OLD.operatore)
    ),
    v_dip_op
  );
  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.log_haccp_checklist_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_op text := lower(TG_OP);
  v_label text;
  v_dip_op uuid;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := 'Task HACCP completato';
    v_dip_op := NEW.dipendente_operativo_id;
  elsif v_op = 'update' then
    v_label := 'Task HACCP aggiornato';
    v_dip_op := NEW.dipendente_operativo_id;
  else
    v_label := 'Task HACCP eliminato';
    v_dip_op := OLD.dipendente_operativo_id;
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'haccp_checklist_log', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'template_id', coalesce(NEW.template_id, OLD.template_id),
      'operatore', coalesce(NEW.operatore, OLD.operatore),
      'esito', coalesce(NEW.esito, OLD.esito)
    ),
    v_dip_op
  );
  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.log_vendita_b2b_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_op text := lower(TG_OP);
  v_label text;
  v_dip_op uuid;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;

  if v_op = 'insert' then
    v_label := format('Vendita B2B registrata: %s',
      coalesce(NEW.cliente_nome, NEW.numero_documento, '?'));
    v_dip_op := NEW.dipendente_operativo_id;
  elsif v_op = 'update' then
    v_label := format('Vendita B2B modificata: %s', coalesce(NEW.numero_documento, '?'));
    v_dip_op := NEW.dipendente_operativo_id;
  else
    v_label := format('Vendita B2B eliminata: %s', coalesce(OLD.numero_documento, '?'));
    v_dip_op := OLD.dipendente_operativo_id;
  end if;

  perform public._audit_log_row(
    coalesce(NEW.organization_id, OLD.organization_id),
    'vendite_b2b', v_op,
    coalesce(NEW.id::text, OLD.id::text),
    v_label,
    jsonb_build_object(
      'cliente', coalesce(NEW.cliente_nome, OLD.cliente_nome),
      'documento', coalesce(NEW.numero_documento, OLD.numero_documento),
      'totale', coalesce(NEW.totale, OLD.totale)
    ),
    v_dip_op
  );
  return coalesce(NEW, OLD);
end;
$$;

-- ── 7) RPC dipendente_operativo_valida ──────────────────────────────────────
-- Chiamata dal client post-login-laboratorio con il codice inserito nel
-- tastierino. Ritorna dettagli del dipendente se valido; il client li tiene
-- in localStorage/context per il turno.
create or replace function public.dipendente_operativo_valida(p_codice text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_dip record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select organization_id into v_org from public.profiles where id = v_uid;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'no_org');
  end if;

  if p_codice is null or p_codice !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'codice_formato_invalido');
  end if;

  -- Match via join: codice deve essere attivo + dipendente HR deve essere attivo
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
    return jsonb_build_object('ok', false, 'error', 'codice_non_valido');
  end if;

  update public.dipendenti_codici
     set last_used_at = now()
   where dipendente_id = v_dip.id;

  return jsonb_build_object(
    'ok', true,
    'id', v_dip.id,
    'nome', v_dip.nome,
    'cognome', v_dip.cognome,
    'ruolo', v_dip.ruolo
  );
end;
$$;

revoke all on function public.dipendente_operativo_valida(text) from public, anon;
grant execute on function public.dipendente_operativo_valida(text) to authenticated;

comment on function public.dipendente_operativo_valida(text) is
  'Valida un codice operativo (4 cifre) nell''org corrente. Ritorna dati dipendente se ok. Aggiorna last_used_at. Non setta stato server-side: il client tiene l''id in localStorage.';

-- ── 8) fos_dipendenti_org: aggiungi dettagli laboratorio + codici operativi ─
-- Estende la vista che Personale.jsx usa per la tab Accessi. Ora ritorna
-- anche il flag is_laboratorio_account e la sede fissata.
-- La signature cambia (aggiungo 3 colonne) → serve DROP prima di CREATE.
drop function if exists public.fos_dipendenti_org();
create or replace function public.fos_dipendenti_org()
returns table (
  id uuid,
  email text,
  nome_completo text,
  approvato boolean,
  is_laboratorio_account boolean,
  laboratorio_sede_id uuid,
  laboratorio_sede_nome text,
  dipendente_codice_set_at timestamptz,
  dipendente_last_login_at timestamptz
)
language sql security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.email,
    p.nome_completo,
    p.approvato,
    coalesce(p.is_laboratorio_account, false) as is_laboratorio_account,
    p.laboratorio_sede_id,
    s.nome as laboratorio_sede_nome,
    p.dipendente_codice_set_at,
    p.dipendente_last_login_at
  from public.profiles p
  left join public.sedi s on s.id = p.laboratorio_sede_id
  where p.organization_id = public.get_user_org_id()
    and p.ruolo = 'dipendente'
    and not public.is_dipendente()   -- solo il titolare puo' elencare gli accessi
  order by p.nome_completo nulls last, p.email;
$$;

revoke all on function public.fos_dipendenti_org() from public, anon;
grant execute on function public.fos_dipendenti_org() to authenticated;

-- ── 9) RPC stockPF: accetta dipendente_operativo_id per audit trail ─────────
-- Le RPC scrivono su stock_prodotti_finiti (che ora ha colonna
-- dipendente_operativo_id). Il trigger legge NEW.dipendente_operativo_id per
-- audit_log. Estendiamo la signature senza rompere chi ancora chiama la
-- vecchia (default = null).
create or replace function public.applica_delta_stock_pf(
  p_org uuid,
  p_sede uuid,
  p_prodotto text,
  p_delta numeric,
  p_unita text default 'pz',
  p_dipendente_op uuid default null
) returns numeric
language plpgsql security definer
set search_path = public
as $$
declare
  v_nuova numeric;
begin
  insert into public.stock_prodotti_finiti (organization_id, sede_id, prodotto_nome, quantita, unita, updated_at, dipendente_operativo_id)
  values (p_org, p_sede, p_prodotto, p_delta, coalesce(p_unita, 'pz'), now(), p_dipendente_op)
  on conflict (organization_id, sede_id, prodotto_nome)
  do update set
    quantita   = public.stock_prodotti_finiti.quantita + excluded.quantita,
    dipendente_operativo_id = excluded.dipendente_operativo_id,
    updated_at = now()
  returning quantita into v_nuova;
  return v_nuova;
end;
$$;

create or replace function public.stock_pf_carico_produzione(
  p_sede uuid,
  p_prodotto text,
  p_quantita numeric,
  p_unita text default 'pz',
  p_note text default null,
  p_dipendente_op uuid default null
) returns numeric
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, p_quantita, p_unita, p_dipendente_op);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, p_quantita, 'produzione', p_note);
  return v_nuova;
end;
$$;

create or replace function public.stock_pf_scarico_vendita(
  p_sede uuid,
  p_prodotto text,
  p_quantita numeric,
  p_unita text default 'pz',
  p_note text default null,
  p_dipendente_op uuid default null
) returns numeric
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, p_unita, p_dipendente_op);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'vendita', p_note);
  return v_nuova;
end;
$$;

create or replace function public.stock_pf_scarto(
  p_sede uuid,
  p_prodotto text,
  p_quantita numeric,
  p_note text default null,
  p_dipendente_op uuid default null
) returns numeric
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, 'pz', p_dipendente_op);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'scarto', p_note);
  return v_nuova;
end;
$$;

-- ── 10) RPC trasferimenti: tracciano il dipendente operativo ─────────────────
-- Audit 2026-07-29 MEDIO 2: senza questo, un trasferimento inviato da Marco e
-- ricevuto da Anna risultava nel Registro come "Marco" perche' la UPDATE su
-- stato='ricevuto' non toccava la colonna dipendente_operativo_id. Estendiamo
-- le 3 RPC per accettare p_dipendente_op (nullable) e propagare la colonna.
create or replace function public.trasferimento_invia(p_id uuid, p_dipendente_op uuid default null)
returns public.trasferimenti
language plpgsql security definer
set search_path = public
as $$
declare
  v_t public.trasferimenti;
  v_org uuid;
  v_disponibile numeric;
begin
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;

  v_org := public.get_user_org_id();
  if v_t.organization_id <> v_org then
    raise exception 'Trasferimento non appartiene alla organizzazione corrente';
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
      v_t.organization_id, v_t.sede_da, v_t.prodotto, -v_t.quantita, v_t.unita, p_dipendente_op
    );

    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, -v_t.quantita, 'trasferimento_invio', v_t.id);
  end if;

  update public.trasferimenti
    set stato = 'inviato',
        stock_applicato = (v_t.tipo = 'prodotto'),
        data_invio = now(),
        dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id)
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$$;

create or replace function public.trasferimento_ricevi(
  p_id uuid,
  p_quantita_ricevuta numeric default null,
  p_scarto_note text default null,
  p_dipendente_op uuid default null
)
returns public.trasferimenti
language plpgsql security definer
set search_path = public
as $$
declare
  v_t public.trasferimenti;
  v_qty_ric numeric;
  v_scarto numeric;
begin
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;
  if v_t.organization_id <> public.get_user_org_id() then
    raise exception 'Trasferimento non appartiene alla organizzazione corrente';
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
      v_t.organization_id, v_t.sede_a, v_t.prodotto, v_qty_ric, v_t.unita, p_dipendente_op
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
        data_ricezione = now(),
        dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id)
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$$;

create or replace function public.trasferimento_annulla(p_id uuid, p_dipendente_op uuid default null)
returns public.trasferimenti
language plpgsql security definer
set search_path = public
as $$
declare
  v_t public.trasferimenti;
begin
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;
  if v_t.organization_id <> public.get_user_org_id() then
    raise exception 'Trasferimento non appartiene alla organizzazione corrente';
  end if;

  if v_t.stato = 'annullato' then return v_t; end if;
  if v_t.stato = 'ricevuto' then
    raise exception 'Impossibile annullare un trasferimento gia ricevuto. Crea una rettifica.';
  end if;

  if v_t.stato = 'inviato' and v_t.stock_applicato and v_t.tipo = 'prodotto' then
    perform public.applica_delta_stock_pf(
      v_t.organization_id, v_t.sede_da, v_t.prodotto, v_t.quantita, v_t.unita, p_dipendente_op
    );
    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, v_t.quantita, 'annullo_trasferimento', v_t.id, 'Rollback per annullamento');
  end if;

  update public.trasferimenti
    set stato = 'annullato',
        stock_applicato = false,
        dipendente_operativo_id = coalesce(p_dipendente_op, dipendente_operativo_id)
    where id = p_id
    returning * into v_t;
  return v_t;
end;
$$;
