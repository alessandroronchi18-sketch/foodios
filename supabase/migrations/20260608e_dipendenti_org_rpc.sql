-- ════════════════════════════════════════════════════════════════════════════
-- Lista account dipendente per il TITOLARE (pagina Personale → Accessi).
-- La RLS su profiles non garantisce al titolare la lettura dei profili degli ALTRI
-- membri dell'org (per questo "Account dipendente" risultava vuoto pur essendoci
-- un dipendente). RPC dedicata SECURITY DEFINER: ritorna i dipendenti dell'org del
-- chiamante, SOLO se è titolare (un dipendente non ottiene nulla). Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.fos_dipendenti_org()
returns table (id uuid, email text, nome_completo text, approvato boolean)
language sql
security definer
set search_path = public
as $fn$
  select p.id, p.email, p.nome_completo, p.approvato
  from public.profiles p
  where p.organization_id = public.get_user_org_id()
    and p.ruolo = 'dipendente'
    and not public.is_dipendente()   -- solo il titolare può elencare gli accessi
  order by p.email
$fn$;

revoke execute on function public.fos_dipendenti_org() from anon;
grant execute on function public.fos_dipendenti_org() to authenticated;
