# FoodOS — Integrazioni cassa italiane (matrice completa)

> Aggiornato: 2026-06-13. Risponde alla domanda "come integro la mia cassa con FoodOS?".

## TL;DR per il proprietario

**Hai una cassa qualsiasi?** Vai in **Integrazioni → "Cassa generica"** e carica il CSV di chiusura giornaliera. L'AI auto-rileva il formato.

**Hai una cassa Tilby?** Configura webhook real-time. Vendi alla cassa → 30 secondi dopo è in FoodOS.

**Non vuoi cambiare niente?** Usa **foto scontrino Z**. 1 minuto/giorno.

---

## Matrice supporto

| Marca cassa | Real-time webhook | Import CSV auto-detect | Note |
|---|:---:|:---:|---|
| **Tilby POS** | ✅ via `/api/webhook-pos` | ✅ | Cassa #1 del food artigianale IT |
| **Cassa in Cloud** (TeamSystem) | ✅ piano Business | ✅ | Diffusa nelle pasticcerie |
| **Zucchetti Infinity/Kassa** | ✅ Enterprise | ✅ | Tier Enterprise richiesto per webhook |
| **Cassanova** (Zucchetti) | ✅ stesso schema | ✅ | Alias Zucchetti food |
| **RCH Atos / Print&Pay** | — | ✅ | Casse fiscali telematiche diffuse |
| **Olivetti Form / Nettuna** | — | ✅ | Casse fiscali "classiche" |
| **Custom Q3X** | — | ✅ | Telematico fiscale (header lowercase) |
| **Epson FP-90 III** | — | ✅ | Telematico (stesso parser Custom) |
| **Salvi Cassa** | — | ✅ | Forte nel sud Italia |
| **Indaco POS** | — | ✅ | Casse touch nord Italia |
| **Polotouch** | — | ✅ | Cassa touch popolare |
| **Eko POS** (Diepoint) | — | ✅ | Cassa touch |
| **Wolf POS** | — | ✅ | Ristoranti/bar |
| **Casse SUMUP / Square / Satispay** | — | ✅ | POS pagamenti |
| **Qualsiasi altra** | — | ✅ auto-detect | Fallback Zucchetti se non riconosciuta |

Totale: **15 sistemi cassa italiani direttamente supportati** + parser fallback per chiunque altro.

---

## Come funziona end-to-end

### Modalità A — **Real-time webhook** (Tilby / Cassa in Cloud / Zucchetti Enterprise)

```
Setup iniziale (15 min, una tantum):
  1. Apri https://foodios-rose.vercel.app/ → Integrazioni → [scegli cassa]
  2. Genera SECRET (FoodOS te lo mostra)
  3. Vai sul pannello cassa → Impostazioni → Webhook esterni
  4. URL:     https://foodios-rose.vercel.app/api/webhook-pos
     Headers:
       x-pos-provider: tilby  (o cassainCloud / zucchetti / etc.)
       x-pos-secret: <secret-generato>
       x-organization-id: <tuo-org-uuid>
  5. Salva configurazione

Utilizzo quotidiano (0 sec/giorno):
  - Apri negozio, accendi cassa normale
  - Vendi
  - Ogni scontrino chiama il webhook entro 1-2 secondi
  - FoodOS aggiorna chiusure_cassa + KPI in tempo reale
  - Fine giornata: "chiusura cassa" su FoodOS = solo 1 click di conferma
```

### Modalità B — **CSV manuale** (qualunque cassa con export)

```
Setup iniziale (0 min):
  Niente da fare. La tua cassa esporta già CSV nativamente.

Utilizzo quotidiano (1 minuto/giorno):
  1. Sera, chiusura cassa fiscale → emette scontrino Z
  2. Dalla cassa: menu Report → Export CSV (giornaliero)
  3. Salva il CSV su chiavetta USB o auto-mail a te
  4. FoodOS → Integrazioni → [scegli cassa] → trascina CSV
  5. Sistema auto-rileva il formato e parsa
  6. Conferma → chiusura cassa registrata
```

### Modalità C — **Foto scontrino Z** (universale, fallback)

```
Per chi non ha export CSV o non vuole farlo:
  1. Stampa scontrino Z fiscale (fine giornata)
  2. FoodOS → Cassa → "Foto scontrino"
  3. Scatta foto → Claude Vision legge importi
  4. Conferma → chiusura registrata

Tempo: 30 secondi.
```

### Modalità D — **Inserimento manuale** (sempre disponibile)

```
Per chi non ha scontrino digitale leggibile:
  1. FoodOS → Cassa → "Inserimento manuale"
  2. Per ogni prodotto: nome (autocomplete da ricettario) + qta + prezzo
  3. "Aggiungi" → accumula nella lista
  4. Quando finito → "Conferma chiusura"

Tempo: 3-5 minuti.
```

---

## Endpoint webhook universale

`POST https://foodios-rose.vercel.app/api/webhook-pos`

### Headers richiesti

| Header | Valore | Esempio |
|---|---|---|
| `x-pos-provider` | id cassa | `tilby`, `cassainCloud`, `rch`, `olivetti`, `custom`, `salvi`, `indaco`, `polotouch`, `ekopos`, `wolf`, `zucchetti` |
| `x-pos-secret` | shared secret | (env var lato server: `POS_TILBY_SECRET` ecc.) |
| `x-organization-id` | UUID org FoodOS | `61a4c0e2-...` |
| `Content-Type` | `application/json` | |

### Body JSON (formato universale)

```json
{
  "data": "2026-06-13",
  "ora": "14:32:18",
  "numero_scontrino": "T1-A-00138",
  "totale_lordo": 12.50,
  "iva": 1.13,
  "metodo_pagamento": "CARTA",
  "sede_id": "uuid-sede-opzionale",
  "righe": [
    { "prodotto": "Cannolo siciliano", "quantita": 2, "prezzo": 3.50, "totale": 7.00, "iva_pct": 10 },
    { "prodotto": "Cappuccino",        "quantita": 1, "prezzo": 1.50, "totale": 1.50, "iva_pct": 10 }
  ]
}
```

### Risposte

- **200** `{ ok: true, scontrino_id, provider }` → scontrino salvato
- **401** `{ error: 'Unauthorized' }` → secret sbagliato
- **409** `{ error: 'Already imported', scontrino_id }` → idempotent (stesso numero_scontrino già visto)
- **422** `{ error: '...' }` → payload invalido (es. totale_lordo fuori range)

### Idempotency

Se mandi 2 volte lo stesso `numero_scontrino` per la stessa org/provider/data → ritorna 409 con l'id dell'inserzione precedente. Sicuro al replay (es. retry di rete della cassa).

---

## CSV parser auto-detect

Quando l'utente carica un CSV via UI Integrazioni → "Cassa generica":

1. Sistema legge la prima riga (header)
2. Tenta 10 pattern regex (ordine decrescente di specificità):
   - `ALIQ. IVA` → **Olivetti** (95% confidence)
   - `numero scontrino` o `cassiere` → **Tilby** (90%)
   - `tipo pag.` o `chiusura giornaliera` → **RCH** (85%)
   - `receipt number` → **Lightspeed** (90%)
   - `id transazione satispay` → **Satispay** (95%)
   - `squareup` o `fees, net` → **Square** (85%)
   - `transaction type sale` → **SumUp** (85%)
   - `metodo pagamento, prodotto` → **Cassa in Cloud** (85%)
   - `^dt;` lowercase → **Custom Q3X** (80%)
   - `scontrino, reparto` → **Salvi/Indaco/Polotouch** (65%)
   - `data, importo` generico → **Zucchetti** (50%)
3. Sceglie il parser con confidence più alta
4. Parsa, aggrega per giorno, mostra preview
5. Se confidence < 0.50 mostra warning "Formato non riconosciuto" → fallback Zucchetti

API: `import { autoDetectCassaFormat } from '@/lib/importCassa'`

---

## Setup secret per ogni provider (lato server)

Per attivare un webhook real-time bisogna settare l'env var corrispondente su Vercel:

| Provider | Env var Vercel |
|---|---|
| `tilby` | `POS_TILBY_SECRET` |
| `cassainCloud` | `POS_CASSAINCLOUD_SECRET` |
| `rch` | `POS_RCH_SECRET` |
| `olivetti` | `POS_OLIVETTI_SECRET` |
| `custom` | `POS_CUSTOM_SECRET` |
| `salvi` | `POS_SALVI_SECRET` |
| `indaco` | `POS_INDACO_SECRET` |
| `polotouch` | `POS_POLOTOUCH_SECRET` |
| `ekopos` | `POS_EKOPOS_SECRET` |
| `wolf` | `POS_WOLF_SECRET` |
| `zucchetti` | `ZUCCHETTI_WEBHOOK_SECRET` (legacy) |

I secret sono **per organizzazione**: ogni cliente FoodOS che attiva una cassa real-time ha il suo secret unico. La generazione del secret avviene quando il cliente clicca "Genera webhook" nella UI Integrazioni.

---

## Roadmap

### v1 (oggi) — ✅ implementato
- 15 casse italiane supportate via CSV
- Auto-detect formato
- Webhook universale `/api/webhook-pos`
- Tabella `pos_scontrini` con RLS + idempotency

### v2 (3-6 mesi)
- **API real-time** per Tilby (l'integrazione più richiesta)
- **API real-time** per Cassa in Cloud
- **Cron settimanale** che aggrega `pos_scontrini` → `chiusure_cassa` (per P&L)
- **UI Integrazioni**: bottone "Genera webhook" che crea secret + mostra istruzioni copy-paste

### v3 (6-12 mesi)
- **App PWA "FoodOS Cassa"** che fa da cassa nativa
- **Integrazione Stripe Terminal** per pagamenti
- **Stampante fiscale** via API (Epson FP-90 III come default)

---

## Per il proprietario in 1 frase

> Hai una cassa, qualunque sia: **esporta CSV** o **scatta foto allo scontrino Z**. FoodOS legge e aggiorna tutto. Per il real-time servono Tilby/Cassa in Cloud/Zucchetti Enterprise, che però sono il 60% del mercato food artigianale italiano.
