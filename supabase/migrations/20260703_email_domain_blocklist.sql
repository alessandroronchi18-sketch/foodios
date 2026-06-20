-- =========================================================================
-- Email domain blocklist
-- =========================================================================
-- L'admin può bannare interi domini dal signup (es. mailinator.com, tempmail).
-- Il check avviene dentro handle_new_user (security definer): raise exception
-- → l'INSERT su auth.users viene rollbackato → signup fallisce con messaggio
-- pulito.
--
-- Sicurezza: fail-open su qualsiasi errore della helper function (così un bug
-- nella blocklist non blocca TUTTI gli iscritti). Quando blocklist vuota,
-- nessun overhead percepibile.
-- =========================================================================

create table if not exists public.email_domain_blocklist (
  domain      text primary key,
  motivo      text,
  created_by  text,
  created_at  timestamptz not null default now()
);

alter table public.email_domain_blocklist enable row level security;
revoke all on public.email_domain_blocklist from public, anon, authenticated;
grant select, insert, delete on public.email_domain_blocklist to service_role;

-- Helper: ritorna true se il dominio dell'email è bloccato. Fail-open:
-- qualunque eccezione → ritorna false (preferiamo registrare un cliente in
-- più piuttosto che bloccarli tutti).
create or replace function public.email_domain_blocked(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $blocked$
declare
  v_domain text;
  v_blocked boolean;
begin
  if p_email is null then return false; end if;
  v_domain := lower(split_part(p_email, '@', 2));
  if v_domain is null or v_domain = '' then return false; end if;
  begin
    select true into v_blocked
    from public.email_domain_blocklist
    where domain = v_domain
    limit 1;
  exception when others then
    return false;  -- fail-open
  end;
  return coalesce(v_blocked, false);
end;
$blocked$;

revoke all on function public.email_domain_blocked(text) from public, anon, authenticated;

-- handle_new_user — early-exit con raise se dominio bloccato.
-- Manteniamo la stessa logica downstream (inviti + creazione org) invariata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id    uuid;
  new_sede_id   uuid;
  invite_org_id uuid;
  nome_attivita text;
  tipo_attivita text;
  nome_citta    text;
begin
  -- Early guard: dominio bloccato → blocca signup con messaggio chiaro.
  -- L'exception qui causa rollback dell'INSERT su auth.users.
  if public.email_domain_blocked(new.email) then
    raise exception 'email_domain_blocked: il dominio email di "%" non è ammesso.', new.email
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  select organization_id into invite_org_id from public.org_inviti
    where lower(email) = lower(new.email) and stato = 'pending'
    order by created_at desc limit 1;

  if invite_org_id is not null then
    insert into public.profiles (id, organization_id, email, nome_completo, ruolo, approvato)
    values (
      new.id,
      invite_org_id,
      new.email,
      coalesce(new.raw_user_meta_data->>'nome_completo', ''),
      'dipendente',
      false
    );
    update public.org_inviti
      set stato = 'accettato', accepted_user_id = new.id, accepted_at = now()
      where lower(email) = lower(new.email)
        and stato = 'pending'
        and organization_id = invite_org_id;
    return new;
  end if;

  nome_attivita := coalesce(new.raw_user_meta_data->>'nome_attivita', 'La mia attività');
  tipo_attivita := coalesce(new.raw_user_meta_data->>'tipo_attivita', 'bar');
  nome_citta    := coalesce(new.raw_user_meta_data->>'citta', 'Torino');

  insert into public.organizations (nome, tipo)
  values (nome_attivita, tipo_attivita)
  returning id into new_org_id;

  insert into public.sedi (organization_id, nome, citta, is_default)
  values (new_org_id, 'Sede principale', nome_citta, true)
  returning id into new_sede_id;

  insert into public.profiles (id, organization_id, email, nome_completo, ruolo, approvato)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome_completo', ''),
    'titolare',
    true
  );

  return new;
end;
$$;
