-- Garantisce che user_data.version avanzi a OGNI scrittura, da qualunque
-- percorso arrivi: ssave semplice, fos_user_data_set_batch, o SQL manuale.
--
-- Contesto. La migration 20260614 ha introdotto l'optimistic concurrency
-- (colonna version + RPC user_data_set_versioned) per evitare che due utenti
-- della stessa organizzazione si sovrascrivano a vicenda i blob jsonb.
-- Il meccanismo pero' non e' mai stato collegato: al 2026-09-07 tutte e 1894
-- le righe erano ancora a version = 0, e i 49 callsite usavano ssave semplice.
--
-- Il problema di fondo e' che gli altri percorsi di scrittura fanno UPDATE
-- senza toccare version. Se il contatore non avanza, confrontarlo non rileva
-- nulla: un client con una copia vecchia in mano vedrebbe comunque il valore
-- atteso e sovrascriverebbe il lavoro altrui. Il trigger chiude questo buco
-- a livello di database, cosi' l'invariante vale anche per i percorsi che
-- non passano dalla RPC.
--
-- L'incremento avviene solo se il chiamante NON ha gia' impostato version
-- esplicitamente. Cosi' user_data_set_versioned, che scrive version + 1 per
-- conto suo, non finisce per contare due volte.
--
-- Idempotente.

create or replace function public.user_data_bump_version()
returns trigger
language plpgsql
as $$
begin
  -- new.version = old.version  → il chiamante non l'ha toccata: la avanziamo noi.
  -- new.version ≠ old.version  → l'ha impostata la RPC versionata: la lasciamo stare.
  if new.version is null or new.version = old.version then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

comment on function public.user_data_bump_version is
'Avanza user_data.version a ogni UPDATE che non la imposti esplicitamente. Rende affidabile l''optimistic concurrency di user_data_set_versioned.';

drop trigger if exists trg_user_data_bump_version on public.user_data;
create trigger trg_user_data_bump_version
  before update on public.user_data
  for each row
  execute function public.user_data_bump_version();
