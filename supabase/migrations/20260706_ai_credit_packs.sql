-- =========================================================================
-- Pacchetti foto/AI extra (audit 2026-06-21)
-- =========================================================================
-- Il cliente può comprare quote AI in più (per OCR scontrini/menu/fatture)
-- oltre al cap del piano. Stripe one-shot payment, no subscription.
-- Webhook checkout.session.completed → accredita la quota qui.
--
-- Catalogo prodotti (price_id Stripe da configurare):
--   foto_50:   €5    → 50 chiamate Vision incluse
--   foto_200:  €15   → 200 chiamate Vision incluse
--   foto_1000: €60   → 1000 chiamate Vision incluse
--
-- Logica budget (api/ai.js): se org ha credit_remaining > 0, NON conta sul
-- cap giornaliero del piano. Decrement avviene atomicamente via RPC.
-- =========================================================================

create table if not exists public.ai_credit_packs_purchased (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  pack_type                text not null,                       -- 'foto_50' | 'foto_200' | 'foto_1000'
  calls_included           integer not null,                    -- 50 | 200 | 1000
  calls_remaining          integer not null,                    -- decrementato a ogni call
  amount_paid_cents        integer not null default 0,
  stripe_session_id        text unique,                          -- checkout session
  stripe_payment_intent_id text,
  acquistato_il            timestamptz not null default now(),
  scade_il                 timestamptz,                          -- opzionale, 1 anno default
  esaurito_il              timestamptz                           -- settato quando calls_remaining=0
);

create index if not exists idx_credit_packs_org
  on public.ai_credit_packs_purchased (organization_id, calls_remaining desc)
  where calls_remaining > 0;

alter table public.ai_credit_packs_purchased enable row level security;

-- Il cliente vede solo i propri pacchetti (per visualizzare il saldo)
drop policy if exists "credit_packs_own" on public.ai_credit_packs_purchased;
create policy "credit_packs_own" on public.ai_credit_packs_purchased
  for select to authenticated
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

revoke all on public.ai_credit_packs_purchased from anon;
grant select on public.ai_credit_packs_purchased to authenticated;
grant all on public.ai_credit_packs_purchased to service_role;

-- RPC: ritorna il totale calls_remaining per l'org del chiamante.
create or replace function public.ai_credit_remaining()
returns integer
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_org uuid;
  v_total integer;
begin
  select organization_id into v_org from public.profiles where id = auth.uid();
  if v_org is null then return 0; end if;
  select coalesce(sum(calls_remaining), 0) into v_total
  from public.ai_credit_packs_purchased
  where organization_id = v_org and calls_remaining > 0
    and (scade_il is null or scade_il > now());
  return v_total;
end;
$$;
grant execute on function public.ai_credit_remaining() to authenticated;

-- RPC: decrementa di 1 il pack più vecchio non scaduto con credito.
-- Chiamata da api/ai.js dopo successo di una call Vision.
create or replace function public.ai_credit_consume()
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_pack_id uuid;
begin
  select organization_id into v_org from public.profiles where id = auth.uid();
  if v_org is null then return false; end if;
  -- Pesca il pack più vecchio non scaduto con credito > 0 (FIFO)
  select id into v_pack_id
  from public.ai_credit_packs_purchased
  where organization_id = v_org
    and calls_remaining > 0
    and (scade_il is null or scade_il > now())
  order by acquistato_il
  limit 1
  for update skip locked;
  if v_pack_id is null then return false; end if;
  update public.ai_credit_packs_purchased
  set calls_remaining = calls_remaining - 1,
      esaurito_il = case when calls_remaining - 1 = 0 then now() else esaurito_il end
  where id = v_pack_id;
  return true;
end;
$$;
grant execute on function public.ai_credit_consume() to authenticated, service_role;
