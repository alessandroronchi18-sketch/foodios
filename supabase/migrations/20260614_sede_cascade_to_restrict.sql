-- Audit reliability 2026-06-14 PM: cambia FK sede da CASCADE → RESTRICT.
-- Scenario evitato: un DELETE accidentale su sedi (admin distratto, bug,
-- compromissione service_role) distrugge irrecuperabilmente la storia
-- per-sede (stock, movimenti, daily_briefs, pos_scontrini, ecc.).
-- Con RESTRICT, l'eliminazione fisica della sede fallisce finché esistono
-- dati → l'admin DEVE prima fare soft-delete (sedi.attiva=false) e migrare
-- dati altrove. Idempotente.

-- user_data per-sede: la più grossa, contiene storico chiusure/giornaliero/magazzino
alter table public.user_data
  drop constraint if exists user_data_sede_id_fkey;
alter table public.user_data
  add constraint user_data_sede_id_fkey
  foreign key (sede_id)
  references public.sedi(id)
  on delete restrict;

-- stock_prodotti_finiti: storico carico/scarico vetrina
alter table public.stock_prodotti_finiti
  drop constraint if exists stock_prodotti_finiti_sede_id_fkey;
alter table public.stock_prodotti_finiti
  add constraint stock_prodotti_finiti_sede_id_fkey
  foreign key (sede_id)
  references public.sedi(id)
  on delete restrict;

-- movimenti_stock_pf: audit trail movimenti
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='movimenti_stock_pf') then
    execute 'alter table public.movimenti_stock_pf drop constraint if exists movimenti_stock_pf_sede_id_fkey';
    execute 'alter table public.movimenti_stock_pf add constraint movimenti_stock_pf_sede_id_fkey foreign key (sede_id) references public.sedi(id) on delete restrict';
  end if;
end $$;

-- pos_scontrini: real-time receipts
alter table public.pos_scontrini
  drop constraint if exists pos_scontrini_sede_fk;
alter table public.pos_scontrini
  add constraint pos_scontrini_sede_fk
  foreign key (sede_id)
  references public.sedi(id)
  on delete restrict;

-- daily_briefs: AI brief mattutini (sede-specific)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='daily_briefs') then
    execute 'alter table public.daily_briefs drop constraint if exists daily_briefs_sede_id_fkey';
    execute 'alter table public.daily_briefs add constraint daily_briefs_sede_id_fkey foreign key (sede_id) references public.sedi(id) on delete restrict';
  end if;
end $$;

-- ai_suggestions: suggerimenti proattivi per-sede
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='ai_suggestions') then
    execute 'alter table public.ai_suggestions drop constraint if exists ai_suggestions_sede_id_fkey';
    execute 'alter table public.ai_suggestions add constraint ai_suggestions_sede_id_fkey foreign key (sede_id) references public.sedi(id) on delete restrict';
  end if;
end $$;

-- forecast_giornaliero: previsioni vendite
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='forecast_giornaliero') then
    execute 'alter table public.forecast_giornaliero drop constraint if exists forecast_giornaliero_sede_id_fkey';
    execute 'alter table public.forecast_giornaliero add constraint forecast_giornaliero_sede_id_fkey foreign key (sede_id) references public.sedi(id) on delete restrict';
  end if;
end $$;

-- costi_aziendali: costi P&L per-sede
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='costi_aziendali') then
    execute 'alter table public.costi_aziendali drop constraint if exists costi_aziendali_sede_id_fkey';
    execute 'alter table public.costi_aziendali add constraint costi_aziendali_sede_id_fkey foreign key (sede_id) references public.sedi(id) on delete restrict';
  end if;
end $$;

-- inventario_produzione: gusti settimanali (gelaterie)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='inventario_produzione') then
    execute 'alter table public.inventario_produzione drop constraint if exists inventario_produzione_sede_id_fkey';
    execute 'alter table public.inventario_produzione add constraint inventario_produzione_sede_id_fkey foreign key (sede_id) references public.sedi(id) on delete restrict';
  end if;
end $$;

-- Aggiunge FK CASCADE su organizations per error_log, audit_log e
-- discount_redemptions: oggi non hanno FK -> alla cancellazione org restano
-- come "ghost rows" che puntano a org inesistenti.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='error_log') then
    -- Aggiungi colonna org_id se non esiste, e FK
    execute 'alter table public.error_log drop constraint if exists error_log_org_id_fkey';
    -- Solo se esiste la colonna org_id
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='error_log' and column_name='org_id') then
      execute 'alter table public.error_log add constraint error_log_org_id_fkey foreign key (org_id) references public.organizations(id) on delete set null';
    end if;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='audit_log') then
    execute 'alter table public.audit_log drop constraint if exists audit_log_organization_id_fkey';
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='audit_log' and column_name='organization_id') then
      execute 'alter table public.audit_log add constraint audit_log_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete set null';
    end if;
  end if;
end $$;
