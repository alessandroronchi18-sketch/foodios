-- ════════════════════════════════════════════════════════════════════════════
-- FIX AUDIT (2026-06-08) — robustezza inviti dipendenti.
--   1) Unicità: un solo invito PENDING per (organization_id, email) → niente
--      duplicati da insert concorrenti/API.
--   2) handle_new_user: alla registrazione marca 'accettato' SOLO l'invito
--      dell'org a cui l'utente si unisce (prima un'email invitata da due org
--      faceva consumare entrambi gli inviti pending).
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Unicità invito pending per org+email (case-insensitive).
create unique index if not exists org_inviti_pending_uq
  on public.org_inviti (organization_id, lower(email))
  where stato = 'pending';

-- 2) handle_new_user: UPDATE invito org-scoped.
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
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  select organization_id into invite_org_id
  from public.org_inviti
  where lower(email) = lower(new.email) and stato = 'pending'
  order by created_at desc
  limit 1;

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
        and organization_id = invite_org_id;  -- solo l'org a cui si unisce
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
