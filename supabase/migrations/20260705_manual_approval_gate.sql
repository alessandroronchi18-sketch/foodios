-- =========================================================================
-- Approvazione manuale signup (audit 2026-06-21)
-- =========================================================================
-- Anti-scam: tutti i nuovi titolari iscritti finiscono in "in attesa" finchè
-- l'admin non li approva manualmente. Estende la colonna `attivo` esistente:
-- - `attivo = null` → mai approvato, schermata "in revisione" lato app
-- - `attivo = true` → approvato, accesso normale
-- - `attivo = false` → bannato manualmente
--
-- Strategia non-distruttiva: i clienti gia` esistenti (Mara, demo, ecc.) sono
-- gia` attivati implicitamente (attivo non e` null/false → ok per gate).
-- =========================================================================

-- 1) Aggiungi colonna in_attesa (false = mai bisogno di approvazione, true = blocca app)
do $$ begin
  if to_regclass('public.organizations') is not null then
    alter table public.organizations
      add column if not exists in_attesa boolean not null default false;
    alter table public.organizations
      add column if not exists approvato_il timestamptz;
    alter table public.organizations
      add column if not exists approvato_da text;
  end if;
end $$;

-- 2) Trigger handle_new_user: nuovi titolari → in_attesa=true.
-- I dipendenti invitati (org_inviti pending) → in_attesa=false (gia` filtrati
-- da org_inviti, l'admin del titolare li gestisce gia` con approvato=false sui profili).
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
  if public.email_domain_blocked(new.email) then
    raise exception 'email_domain_blocked: dominio email non ammesso'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  select organization_id into invite_org_id from public.org_inviti
    where lower(email) = lower(new.email) and stato = 'pending'
    order by created_at desc limit 1;

  if invite_org_id is not null then
    insert into public.profiles (
      id, organization_id, email, nome_completo, ruolo, approvato
    ) values (
      new.id, invite_org_id, new.email,
      coalesce(new.raw_user_meta_data->>'nome_completo', ''),
      'dipendente', false
    );
    update public.org_inviti
      set stato = 'accettato',
          accepted_user_id = new.id,
          accepted_at = now()
      where lower(email) = lower(new.email)
        and stato = 'pending'
        and organization_id = invite_org_id;
    return new;
  end if;

  nome_attivita := coalesce(
    new.raw_user_meta_data->>'nome_attivita',
    'La mia attività'
  );
  tipo_attivita := coalesce(
    new.raw_user_meta_data->>'tipo_attivita',
    'bar'
  );
  nome_citta := coalesce(
    new.raw_user_meta_data->>'citta',
    'Torino'
  );

  -- Audit 2026-06-21: nuove org partono `in_attesa=true`. L'admin le approva
  -- manualmente dalla pagina /admin → tab "In attesa".
  insert into public.organizations (nome, tipo, in_attesa)
  values (nome_attivita, tipo_attivita, true)
  returning id
  into new_org_id;

  insert into public.sedi (
    organization_id, nome, citta, is_default
  ) values (
    new_org_id, 'Sede principale', nome_citta, true
  )
  returning id
  into new_sede_id;

  insert into public.profiles (
    id, organization_id, email, nome_completo, ruolo, approvato
  ) values (
    new.id, new_org_id, new.email,
    coalesce(new.raw_user_meta_data->>'nome_completo', ''),
    'titolare', true
  );

  return new;
end;
$$;

-- 3) Index per query veloce sulle org in attesa
create index if not exists idx_organizations_in_attesa
  on public.organizations (in_attesa, created_at desc)
  where in_attesa = true;
