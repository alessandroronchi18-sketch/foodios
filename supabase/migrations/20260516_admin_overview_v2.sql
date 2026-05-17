-- ═══════════════════════════════════════════════════════════════════════════
-- admin_overview v2 — view completa per il pannello admin
-- Idempotente: safe da rieseguire più volte.
--
-- NB: stripe_customer_id / stripe_subscription_id non sono nello schema,
-- li ometto fino a quando non aggiungerai Stripe. Se servono in futuro:
--   alter table public.organizations add column stripe_customer_id text;
--   alter table public.organizations add column stripe_subscription_id text;
-- e ri-esegui questo file.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.admin_overview as
select
  o.id            as org_id,
  o.nome          as nome_attivita,
  o.tipo,
  o.piano,
  o.approvato     as org_approvata,
  o.attivo,
  o.trial_ends_at,
  o.mesi_bonus,
  o.referral_code_usato,
  o.created_at    as registrata_il,
  p.id            as user_id,
  p.email,
  p.nome_completo,
  p.approvato     as utente_approvato,
  (select count(*) from public.sedi s    where s.organization_id = o.id) as num_sedi,
  (select count(*) from public.user_data d where d.organization_id = o.id) as num_record,
  (select max(d.updated_at) from public.user_data d where d.organization_id = o.id) as ultimo_record_at
from public.organizations o
left join public.profiles p
  on p.organization_id = o.id
 and p.ruolo = 'titolare';

-- La view è accessibile solo via service_role (usata dalla edge function /api/admin)
-- Con anon/authenticated, RLS sulle tabelle sottostanti impedisce di vedere
-- record di altre organizzazioni.
revoke all on public.admin_overview from anon, authenticated;
grant select on public.admin_overview to service_role;
