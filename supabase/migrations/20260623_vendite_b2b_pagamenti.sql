-- Vendite B2B: tracciamento pagamenti / insoluti. Additiva e idempotente.
do $$
begin
  if to_regclass('public.vendite_b2b') is not null then
    execute 'alter table public.vendite_b2b add column if not exists pagata boolean not null default false';
    execute 'alter table public.vendite_b2b add column if not exists data_pagamento date';
    execute 'alter table public.vendite_b2b add column if not exists data_scadenza date';
  end if;
end $$;
