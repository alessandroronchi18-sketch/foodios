-- ═══════════════════════════════════════════════════════════════════════════
-- FIX TRIGGER handle_new_user — idempotente
--
-- Anche se il trigger fira solo su INSERT in auth.users (non su login),
-- aggiungiamo un guard difensivo: se il profilo esiste già, non creare
-- una nuova organizzazione. Questo protegge da:
--   - re-trigger imprevisti
--   - INSERT manuali in auth.users
--   - migrazioni di dati che ri-inseriscono utenti
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id  uuid;
  new_sede_id uuid;
  nome_attivita text;
  tipo_attivita text;
  nome_citta    text;
begin
  -- GUARD: se il profilo esiste già, non duplicare org/sede/profile.
  -- Questo è il fix principale contro la perdita dati al re-login.
  if exists (select 1 from public.profiles where id = new.id) then
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

  insert into public.profiles (id, organization_id, email, nome_completo, ruolo)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome_completo', ''),
    'titolare'
  );

  return new;
end;
$$;
