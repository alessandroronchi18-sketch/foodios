-- Il tetto di spesa dell'AI non contava niente. Non era alto: era scollegato.
--
-- ── Il difetto ─────────────────────────────────────────────────────────────
--
-- Le due funzioni che tengono il conto capivano di quale azienda si trattava
-- così:
--
--     select organization_id into v_org_id from public.profiles where id = auth.uid();
--     if v_org_id is null then return; end if;
--
-- Ma chi le chiama è il **server**, con la chiave di servizio, dove `auth.uid()`
-- è vuoto. Quindi l'incremento usciva subito senza scrivere, e il totale del
-- giorno tornava sempre 0. `0 >= tetto` non è mai vero: il messaggio «Limite AI
-- giornaliero raggiunto» non è mai comparso a nessuno.
--
-- Provato sul database il 15/09/2026: `ai_usage_daily` **vuota** con 327
-- organizzazioni, mentre in `rate_limits` ci sono 7 chiavi `ai:…` che
-- dimostrano che le chiamate all'AI sono state fatte davvero. Le due righe
-- insieme sono la prova: si è speso, e il contatore è rimasto a zero.
--
-- Cosa restava a difesa: dieci richieste al minuto per utente+IP. Con i modelli
-- grossi fra quelli ammessi, un solo account poteva far girare la chiave
-- aziendale a ritmo continuo, e cambiando rete il contatore ripartiva. E il
-- pannello admin "costo AI per cliente" legge la stessa tabella: mostrava 0 €
-- per tutti, quindi non c'era modo di accorgersene.
--
-- ── La correzione ──────────────────────────────────────────────────────────
--
-- L'organizzazione si passa in modo esplicito. Ma un parametro del genere non
-- si può concedere al browser — chiunque potrebbe scrivere nel contatore di
-- un'altra azienda, o azzerare il proprio. Quindi: due funzioni nuove che
-- prendono `p_org`, eseguibili **solo dal ruolo di servizio**; le vecchie
-- restano com'erano per chi chiama dal browser.
--
-- ── E i pacchetti di crediti, che la migration del 06/07 dava per fatti ─────
--
-- `20260706_ai_credit_packs.sql` scrive: «se org ha credit_remaining > 0, NON
-- conta sul cap giornaliero». Quel codice non è mai esistito, e la funzione
-- `ai_credit_remaining` **sul database non c'è**. Un cliente che paga 60 € per
-- mille chiamate sarebbe stato tagliato fuori dal tetto lo stesso — cioè lo
-- sarebbe stato dal momento in cui il tetto avesse ricominciato a funzionare.
-- Si crea qui.

-- ── Quante chiamate restano nei pacchetti comprati ─────────────────────────
create or replace function public.ai_credit_remaining(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(calls_remaining), 0)::int
  from public.ai_credit_packs_purchased
  where organization_id = p_org
    and calls_remaining > 0
    and esaurito_il is null
    and (scade_il is null or scade_il > now());
$$;

-- ── Consuma una chiamata dal pacchetto che scade prima ────────────────────
-- Restituisce true se il credito c'era ed è stato consumato: in quel caso la
-- chiamata non pesa sul tetto giornaliero.
create or replace function public.ai_credit_consuma(p_org uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  -- `for update skip locked`: due chiamate contemporanee non consumano lo
  -- stesso credito due volte, e la seconda non resta ad aspettare.
  select id into v_id
    from public.ai_credit_packs_purchased
   where organization_id = p_org
     and calls_remaining > 0
     and esaurito_il is null
     and (scade_il is null or scade_il > now())
   order by scade_il nulls last, acquistato_il
   limit 1
   for update skip locked;

  if v_id is null then return false; end if;

  update public.ai_credit_packs_purchased
     set calls_remaining = calls_remaining - 1,
         esaurito_il = case when calls_remaining - 1 <= 0 then now() else esaurito_il end
   where id = v_id;
  return true;
end;
$$;

-- ── Le due funzioni del conteggio, con l'organizzazione esplicita ─────────
create or replace function public.ai_usage_increment_org(
  p_org uuid, p_feature text, p_tokens_in integer default 0,
  p_tokens_out integer default 0, p_cost_usd numeric default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org is null then return; end if;
  insert into public.ai_usage_daily (
    organization_id, date, feature, calls,
    tokens_in_estimated, tokens_out_estimated, cost_usd_estimated, last_call_at
  ) values (
    p_org, current_date, coalesce(p_feature, 'generic'), 1,
    coalesce(p_tokens_in, 0), coalesce(p_tokens_out, 0), coalesce(p_cost_usd, 0), now()
  )
  on conflict (organization_id, date, feature)
  do update set
    calls = ai_usage_daily.calls + 1,
    tokens_in_estimated = ai_usage_daily.tokens_in_estimated + coalesce(p_tokens_in, 0),
    tokens_out_estimated = ai_usage_daily.tokens_out_estimated + coalesce(p_tokens_out, 0),
    cost_usd_estimated = ai_usage_daily.cost_usd_estimated + coalesce(p_cost_usd, 0),
    last_call_at = now();
end;
$$;

create or replace function public.ai_usage_today_total_org(p_org uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd_estimated), 0)
  from public.ai_usage_daily
  where organization_id = p_org and date = current_date;
$$;

-- Solo il server. Dal browser questi parametri sarebbero un modo per scrivere
-- nel contatore di un'altra azienda, o per azzerare il proprio.
revoke execute on function public.ai_usage_increment_org(uuid, text, integer, integer, numeric) from public, anon, authenticated;
revoke execute on function public.ai_usage_today_total_org(uuid) from public, anon, authenticated;
revoke execute on function public.ai_credit_consuma(uuid) from public, anon, authenticated;
revoke execute on function public.ai_credit_remaining(uuid) from public, anon;
grant execute on function public.ai_usage_increment_org(uuid, text, integer, integer, numeric) to service_role;
grant execute on function public.ai_usage_today_total_org(uuid) to service_role;
grant execute on function public.ai_credit_consuma(uuid) to service_role;
-- Il residuo dei crediti il titolare lo può leggere: è roba sua, e serve a
-- mostrargli quante chiamate gli restano.
grant execute on function public.ai_credit_remaining(uuid) to authenticated, service_role;
