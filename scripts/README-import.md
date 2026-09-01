# Import bulk — guida operativa

Tool per caricare dati di un cliente nella prima volta (founder-assisted).

## Cosa fa

`scripts/import-any.mjs` accetta un file **Excel o CSV** eterogeneo (colonne del cliente, non un template rigido), chiede a Claude di mappare le colonne allo schema Foodos, valida ogni riga e inserisce in Supabase.

## Entità supportate (v1)

| Entità   | Tabella Supabase | Campi principali |
|----------|------------------|------------------|
| `fornitori`  | `public.fornitori`  | nome (req), contatto, email, telefono, note |
| `dipendenti` | `public.dipendenti` | nome (req), ruolo, tipo_contratto, costo_orario, ore_settimana, note, attivo |

Estensione prossima (v2): `ricettario`, `magazzino`, `chiusure` (JSON blob in user_data — richiedono adapter dedicato).

## Setup una tantum

### 1. Env vars in `.env.local`

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...          # Supabase → Settings → API → service_role secret
ANTHROPIC_API_KEY=sk-ant-...         # Anthropic Console
```

**Sicurezza**: la `SUPABASE_SERVICE_KEY` bypassa RLS. Non committarla mai, non condividerla. Rimuovila da `.env.local` quando hai finito la sessione di import.

### 2. Cartella cliente

Convention: `import-data/<nome-cliente>/`

```
import-data/
└── mara/
    ├── fornitori-originale.xlsx      ← file inviato dal cliente
    ├── personale-originale.xlsx
    └── (log auto-generati)
```

La cartella `import-data/` è git-ignored — nulla di questo finisce in repo.

## Esempio: importare fornitori di Mara

1. **Ottieni l'org_id del cliente** dal SQL Editor Supabase:
   ```sql
   select id, name from public.organizations where name ilike '%mara%';
   ```

2. **Metti il file cliente** in `import-data/mara/fornitori.xlsx`.

3. **Dry-run prima** per vedere cosa succederebbe senza scrivere nulla:
   ```bash
   node scripts/import-any.mjs \
     --file import-data/mara/fornitori.xlsx \
     --entity fornitori \
     --org <org_id> \
     --dry-run
   ```

4. **Rilancia senza --dry-run** quando ti convince:
   ```bash
   node scripts/import-any.mjs \
     --file import-data/mara/fornitori.xlsx \
     --entity fornitori \
     --org <org_id>
   ```

Il tool ti guida interattivamente (conferma mapping → conferma insert). Log salvato in `import-data/import-fornitori-<timestamp>.log`.

## Cosa aspettarsi

### Mapping AI

Claude legge gli header + 5 sample rows del file cliente e propone il mapping. Es. file con colonne `"Ragione Sociale" · "Referente" · "Cellulare"` → schema fornitori:

```
nome     [required] ← "Ragione Sociale" (conf 1.00)
contatto [opz]      ← "Referente"       (conf 0.90)
telefono [opz]      ← "Cellulare"       (conf 0.95)
```

Tu confermi (o rifiuti) prima di procedere.

### Validation

Verifica tipi (email valida, numero in range, ecc.), required, min/max. Righe con errori vengono elencate ma non bloccano le valide.

### Insert

Batch da 200 righe. Se un batch fallisce, gli altri procedono. `organization_id` viene forzato dal CLI (`--org`), NON è mai preso dal file cliente.

## Limitazioni note (v1)

- **No upsert**: rilanciare l'import raddoppia le righe. Usa solo per la prima volta, o cancella prima le righe esistenti.
- **Solo primo sheet** dell'xlsx. Se il file ha più sheet, esporta/duplica quello che ti serve.
- **Max 5000 righe/file** per non superare i limiti Supabase Edge/rate limit.
- **Ricettario non supportato qui**: passa dalla UI in-app (`Ricettario → Importa da Excel`) — il file ricettario non deve mai passare da te per privacy cliente.

## Troubleshooting

**"ANTHROPIC_API_KEY mancante"**: verifica `.env.local`.

**"Field obbligatori senza match"**: Claude non è riuscita a mappare un field required. Rinomina la colonna sorgente per essere più esplicita (es. "Nome fornitore" invece di "Cliente") o edita il mapping a mano nel codice (TODO: `--map` flag per passare un JSON di mapping override).

**"Batch fallito con RLS"**: se non stai usando service_key (o hai un errore di permission), lo script fallisce sull'insert. Verifica `SUPABASE_SERVICE_KEY`.
