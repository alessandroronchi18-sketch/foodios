-- =========================================================================
-- Plan pricing meta (audit 2026-06-21)
-- =========================================================================
-- Admin puo` rinominare i piani e modificarne la descrizione dal pannello
-- (oltre al prezzo gia` editabile). Cambi di NOME/DESCRIZIONE non rompono
-- nulla: la colonna DB organizations.piano resta in (trial/base/pro/enterprise),
-- il rename e` solo display marketing.
--
-- Le nuove righe Bottega/Maestro/Insegna vengono seedate qui (idempotenti
-- via on conflict). Se l'admin ha gia` modificato, NON sovrascrivo.
-- =========================================================================

-- 1) Colonne meta su plan_pricing (se mancano)
do $$ begin
  if to_regclass('public.plan_pricing') is not null then
    alter table public.plan_pricing
      add column if not exists nome_display text;
    alter table public.plan_pricing
      add column if not exists descrizione text;
    alter table public.plan_pricing
      add column if not exists attivo boolean not null default true;
  end if;
end $$;

-- 2) Seed/update Bottega · Maestro · Insegna (idempotente)
-- Stripe price IDs restano da impostare manualmente nel Stripe Dashboard
-- (creare 3 nuovi product/price o riusare i preesistenti aggiornati).
do $$ begin
  if to_regclass('public.plan_pricing') is not null then
    -- Bottega (base)
    insert into public.plan_pricing (plan, prezzo_mese_cents, stripe_price_id, nome_display, descrizione, attivo)
    values (
      'base', 6900, null, 'Bottega',
      'Per il banco singolo. Smetti di sbagliare i prezzi.',
      true
    )
    on conflict (plan) do update set
      prezzo_mese_cents = coalesce(public.plan_pricing.prezzo_mese_cents, excluded.prezzo_mese_cents),
      nome_display = coalesce(public.plan_pricing.nome_display, excluded.nome_display),
      descrizione = coalesce(public.plan_pricing.descrizione, excluded.descrizione);

    -- Maestro (pro)
    update public.plan_pricing
    set prezzo_mese_cents = 14900,
        nome_display = coalesce(nome_display, 'Maestro'),
        descrizione = coalesce(descrizione, 'Sostituisce un controller part-time. Le 23 feature AI lavorano per te 24/7.')
    where plan = 'pro';
    insert into public.plan_pricing (plan, prezzo_mese_cents, stripe_price_id, nome_display, descrizione, attivo)
    select 'pro', 14900, null, 'Maestro', 'Sostituisce un controller part-time.', true
    where not exists (select 1 from public.plan_pricing where plan = 'pro');

    -- Insegna (enterprise)
    update public.plan_pricing
    set prezzo_mese_cents = 39900,
        nome_display = coalesce(nome_display, 'Insegna'),
        descrizione = coalesce(descrizione, 'Sostituisce 1 controller + l''IT contractor. Per chi ha 3+ sedi.')
    where plan = 'enterprise';
    insert into public.plan_pricing (plan, prezzo_mese_cents, stripe_price_id, nome_display, descrizione, attivo)
    select 'enterprise', 39900, null, 'Insegna', 'Sostituisce 1 controller + l''IT contractor.', true
    where not exists (select 1 from public.plan_pricing where plan = 'enterprise');
  end if;
end $$;
