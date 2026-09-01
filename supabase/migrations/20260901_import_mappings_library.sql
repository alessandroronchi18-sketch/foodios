-- Migration: mapping library cross-cliente per import bulk.
--
-- MOTIVAZIONE (2026-09-01): il wizard di import in-app usa Claude per suggerire
-- il mapping colonne → schema Foodos. Ogni chiamata Claude costa denaro e latenza.
-- Le pasticcerie italiane hanno formati Excel simili: dopo N clienti, i pattern
-- di header ("Ragione Sociale", "Costo Ora") si ripetono. Salvare i mapping
-- confermati fa risparmiare chiamate AI ai clienti successivi (istantaneo + zero
-- costo) e diventa un asset che migliora col crescere della base clienti.
--
-- Privacy: la tabella salva SOLO nomi di colonne (termini di dominio pubblici
-- come "Ragione Sociale") e il mapping schema→colonna. NON salva mai valori
-- (importi, stipendi, nomi persone). SELECT concesso a tutti gli authenticated.
--
-- Idempotente. Nessun impatto su tabelle esistenti.

-- ── 1) Tabella globale (no organization_id) ─────────────────────────
create table if not exists public.import_mappings_library (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  headers_hash text not null,
  headers_json jsonb not null,      -- array di header originali (per debug/preview)
  mapping jsonb not null,           -- { field_target: header_originale }
  confirmed_count integer not null default 1,
  first_used_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  constraint import_mappings_library_unique unique (entity, headers_hash)
);

create index if not exists idx_import_mappings_entity_hash
  on public.import_mappings_library (entity, headers_hash);
create index if not exists idx_import_mappings_confirmed
  on public.import_mappings_library (entity, confirmed_count desc);

comment on table public.import_mappings_library is
  'Cross-cliente cache di mapping colonne per l import wizard. Zero dati clienti: solo nomi colonne generici.';

-- ── 2) RLS ────────────────────────────────────────────────────────
alter table public.import_mappings_library enable row level security;

-- Chiunque authenticated puo' leggere (la library aiuta tutti i clienti).
drop policy if exists import_mappings_read_all on public.import_mappings_library;
create policy import_mappings_read_all on public.import_mappings_library
  for select to authenticated
  using (true);

-- Nessuna policy INSERT/UPDATE/DELETE per authenticated → solo tramite RPC
-- SECURITY DEFINER. Evita che un client ostile inquini la library con junk.

-- ── 3) RPC per hash+upsert ─────────────────────────────────────────
create or replace function public.save_import_mapping(
  p_entity text,
  p_headers jsonb,
  p_mapping jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_normalized text;
  v_hash text;
  v_id uuid;
  v_headers_array text[];
  v_mapping_size integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_entity is null or length(p_entity) = 0 or length(p_entity) > 64 then
    return jsonb_build_object('ok', false, 'error', 'entity_invalid');
  end if;
  if jsonb_typeof(p_headers) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'headers_not_array');
  end if;
  if jsonb_typeof(p_mapping) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'mapping_not_object');
  end if;

  select array_agg(value::text) into v_headers_array
    from jsonb_array_elements_text(p_headers);
  if v_headers_array is null or array_length(v_headers_array, 1) = 0 then
    return jsonb_build_object('ok', false, 'error', 'headers_empty');
  end if;
  if array_length(v_headers_array, 1) > 200 then
    return jsonb_build_object('ok', false, 'error', 'headers_too_many');
  end if;

  v_mapping_size := (select count(*) from jsonb_object_keys(p_mapping));
  if v_mapping_size = 0 then
    return jsonb_build_object('ok', false, 'error', 'mapping_empty');
  end if;
  if v_mapping_size > 100 then
    return jsonb_build_object('ok', false, 'error', 'mapping_too_large');
  end if;

  -- Normalize: lower + trim + sort alfabetico, join con "|"
  select string_agg(x, '|' order by x) into v_normalized
    from (select trim(lower(unnest(v_headers_array))) as x) t
    where x <> '';

  if v_normalized is null or length(v_normalized) = 0 then
    return jsonb_build_object('ok', false, 'error', 'headers_normalized_empty');
  end if;

  v_hash := md5(v_normalized);

  insert into public.import_mappings_library (entity, headers_hash, headers_json, mapping)
    values (p_entity, v_hash, p_headers, p_mapping)
    on conflict (entity, headers_hash) do update
      set confirmed_count = public.import_mappings_library.confirmed_count + 1,
          last_used_at = now(),
          mapping = case
            when (select count(*) from jsonb_object_keys(excluded.mapping)) >
                 (select count(*) from jsonb_object_keys(public.import_mappings_library.mapping))
            then excluded.mapping
            else public.import_mappings_library.mapping
          end
    returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'hash', v_hash);
end;
$$;

revoke all on function public.save_import_mapping(text, jsonb, jsonb) from public, anon;
grant execute on function public.save_import_mapping(text, jsonb, jsonb) to authenticated;

comment on function public.save_import_mapping(text, jsonb, jsonb) is
  'Salva un mapping colonne nella library cross-cliente. Normalizza+hash headers, upsert incrementando confirmed_count.';

-- ── 4) RPC lookup (server-side) ────────────────────────────────────
-- Ricerca la migliore corrispondenza in library per (entity, hash headers).
-- Il chiamante (Edge Function) passa la stringa "header1|header2|..." gia'
-- normalizzata (lower+trim+sort): il DB calcola md5 e cerca.
-- Ritorna la riga con confirmed_count piu' alto (evita ambiguita' se piu'
-- clienti hanno confermato mapping leggermente diversi per lo stesso hash).
create or replace function public.lookup_import_mapping(
  p_entity text,
  p_normalized text
) returns table (
  id uuid,
  mapping jsonb,
  confirmed_count integer
)
language sql security definer
set search_path = public, pg_temp
as $$
  select l.id, l.mapping, l.confirmed_count
    from public.import_mappings_library l
   where l.entity = p_entity
     and l.headers_hash = md5(p_normalized)
   order by l.confirmed_count desc, l.last_used_at desc
   limit 1;
$$;

revoke all on function public.lookup_import_mapping(text, text) from public, anon;
grant execute on function public.lookup_import_mapping(text, text) to authenticated;

comment on function public.lookup_import_mapping(text, text) is
  'Cerca il mapping migliore nella library per una data entity + set headers normalizzato. Ritorna 0 o 1 riga.';
