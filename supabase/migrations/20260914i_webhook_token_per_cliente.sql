-- La cassa che scrive gli incassi deve avere una chiave SUA, non una per marca.
--
-- Com'era, fino al 14/09/2026. Il webhook delle casse (`/api/webhook-pos`) è la
-- porta da cui un registratore manda dentro Foodos gli incassi della giornata.
-- Per dimostrare di essere davvero la cassa chiedeva una parola d'ordine, ma la
-- parola d'ordine era **una per marca** (una per Tilby, una per RCH, una per
-- Cassa in Cloud), e l'attività a cui appartenevano gli incassi era scritta in
-- un'intestazione della richiesta:
--
--     x-pos-secret:       <segreto della marca>
--     x-organization-id:  <a quale attività scrivere>   ← creduto sulla parola
--
-- Quindi chi aveva quella parola d'ordine poteva scrivere incassi in QUALSIASI
-- attività su Foodos, cambiando l'id nell'intestazione. Oggi quei segreti li ha
-- solo il fondatore e nessuna integrazione è accesa, quindi non è esposto
-- niente. Ma il giorno che si collega una marca di casse, quel fornitore — o
-- chiunque se la faccia dare da lui — scriverebbe nella cassa di tutti.
--
-- Com'è adesso. Ogni attività ha la sua chiave, e **la chiave stessa dice di
-- chi è**: il webhook non crede più all'intestazione, guarda la chiave e da
-- quella ricava l'organizzazione.
--
-- Della chiave si salva solo l'impronta (SHA-256), come per una password: se un
-- domani qualcuno leggesse questa tabella non ci troverebbe chiavi utilizzabili.
-- La chiave in chiaro si vede una volta sola, quando la si genera.

create table if not exists public.webhook_token (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  provider         text not null,
  -- impronta della chiave, non la chiave
  token_hash       text not null unique,
  -- primi caratteri, per far riconoscere all'utente quale chiave è
  token_prefisso   text not null,
  creato_il        timestamptz not null default now(),
  creato_da        uuid,
  ultimo_uso_il    timestamptz,
  revocato_il      timestamptz,
  constraint webhook_token_provider_non_vuoto check (length(trim(provider)) > 0)
);

-- Una chiave attiva per attività e marca: generarne una nuova revoca la vecchia.
create unique index if not exists uq_webhook_token_attivo
  on public.webhook_token (organization_id, provider)
  where revocato_il is null;

create index if not exists idx_webhook_token_hash
  on public.webhook_token (token_hash) where revocato_il is null;

alter table public.webhook_token enable row level security;

-- Il titolare vede le SUE chiavi (prefisso e date, non l'impronta completa):
-- serve a sapere se ne ha una attiva e da quando.
drop policy if exists webhook_token_read_own on public.webhook_token;
create policy webhook_token_read_own on public.webhook_token
  for select using (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  );

-- Scrittura: nessuno dal browser. Si passa dalla funzione qui sotto, che
-- genera la chiave lei e restituisce il chiaro una volta sola.
-- Supabase concede in automatico tutto su ogni tabella nuova ad anon e
-- authenticated: qui si riprende indietro e si ridà solo la lettura al
-- titolare loggato. Le regole di isolamento qui sopra da sole basterebbero,
-- ma un permesso che non c'è non può essere aggirato da una policy sbagliata.
revoke all on public.webhook_token from anon, authenticated;
grant select on public.webhook_token to authenticated;

-- Genera (o rigenera) la chiave di una marca per la PROPRIA attività.
-- L'organizzazione la deduce da chi chiama: non è un parametro.
create or replace function public.webhook_token_genera(p_provider text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org   uuid := public.get_user_org_id();
  v_prov  text := lower(trim(coalesce(p_provider, '')));
  v_token text;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if public.is_dipendente() then raise exception 'Solo il titolare può generare una chiave'; end if;
  if v_prov = '' then raise exception 'Marca della cassa mancante'; end if;

  -- 32 byte casuali in esadecimale: non si indovina.
  v_token := encode(gen_random_bytes(32), 'hex');

  update public.webhook_token
     set revocato_il = now()
   where organization_id = v_org and provider = v_prov and revocato_il is null;

  insert into public.webhook_token (organization_id, provider, token_hash, token_prefisso, creato_da)
  values (v_org, v_prov, encode(digest(v_token, 'sha256'), 'hex'), left(v_token, 6), auth.uid());

  return v_token;
end;
$$;

revoke execute on function public.webhook_token_genera(text) from public, anon;
grant execute on function public.webhook_token_genera(text) to authenticated, service_role;
