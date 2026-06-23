# FoodOS — Architettura

Documento di architettura tecnica per developer (e Claude Code). Non sostituisce CLAUDE.md (che è la guida operativa), ma spiega **perché** il sistema è fatto così.

---

## Decisioni architettoniche fondamentali (ADR)

### ADR-001: Multi-tenant via RLS Postgres, non application-layer
**Decisione**: ogni tabella ha `organization_id` + policy RLS `for all using (organization_id = get_user_org_id())`. Le query client-side NON filtrano per org — è il DB a farlo.

**Perché**: defense-in-depth. Un bug app-side che dimentica un `.eq('organization_id', ...)` non causa cross-tenant leak. La policy RLS è invariante.

**Trade-off**: query un po' più lente (5-15%), debug più complesso (devi loggare la policy che blocca), tooling Supabase a volte limitato.

**Audit verification**: spec `tests/06-rls-isolation.spec.js` crea 2 org effimere e prova read/write cross-org → deve fallire.

---

### ADR-002: jsonb in `user_data` per dati gestionali, non tabelle separate
**Decisione**: magazzino, ricettario, chiusure, ecc. sono salvati in `user_data.data_value` jsonb keyed per `data_key`. Solo entità con FK relazionali (sedi, dipendenti, fatture, scadenze) hanno tabelle dedicate.

**Perché**: il modello dei dati cambia rapidamente nella prima fase (es. struttura ricetta, campi inventario gelaterie). Migrare schema su 50+ tenant ogni 2 settimane sarebbe ingestibile. jsonb permette evoluzione senza migration.

**Trade-off**: query SQL su dati nidificati richiede `->>`, indici JSONB; concorrenza ottimistica via `version` colonna (vedi `user_data_set_versioned` RPC).

**Audit verification**: spec `tests/unit/storage.test.js` + `tests/03-ricettario.spec.js` validano save/load + versioning + lost-update guard.

---

### ADR-003: Edge functions Vercel per API leggere, Node serverless per pesanti
**Decisione**: `api/ai.js`, `api/health.js`, `api/feedback.js` girano su Edge runtime (~50ms cold start). `api/admin.js`, `api/sdi-emit-invoice.js`, cron-* girano su Node serverless (~500ms cold start, +memoria).

**Perché**: l'Edge non supporta tutti i pacchetti npm (es. Stripe SDK richiede Node). Per le hot path UI (proxy AI) la latenza è critica.

**Trade-off**: 2 runtime diversi = onboarding sviluppatori più lungo. Mitigato da `export const config = { runtime: 'edge' }` esplicito in cima a ogni file.

**Audit verification**: `tests/unit/api-import-smoke.test.js` verifica che ogni endpoint si carichi correttamente nel proprio runtime.

---

### ADR-004: Stripe come single source of truth per billing
**Decisione**: lo stato del piano cliente è in `organizations.piano` ma viene aggiornato SOLO dal webhook Stripe (`api/stripe-webhook.js`). Non si modifica mai a mano da UI.

**Perché**: evita drift tra stato sub Stripe e stato app. Webhook idempotency via `stripe_webhook_events.processed_at`.

**Trade-off**: cambi di piano admin (gestionale-bypass) richiedono workflow esplicito che salta Stripe (es. `piano_override` flag).

**Audit verification**: `tests/07-stripe-webhook.spec.js` (DB-only) + idempotency check.

---

### ADR-005: Save-first pattern, mai `setState` prima di `await ssave`
**Decisione**: tutti gli handler che persistono dati hanno questa forma:
```js
async function handler() {
  const next = compute(...)
  try {
    await ssave(KEY, next, orgId, sedeId)
    setState(next)
    notify('Salvato')
  } catch (e) {
    notify('Errore: ' + e.message, false)
    // NON tocchiamo setState → l'UI resta sull'ultimo stato valido
  }
}
```

**Perché**: se ssave fallisce (rete persa, RLS rifiuta), lo state React resta consistente col DB. L'utente vede il valore vecchio + toast errore → niente data loss percepita.

**Trade-off**: piccolo lag UI (200-500ms) tra click e feedback. Mitigato con loading state.

**Audit verification**: audit 17 giu ha identificato 6 callsite con pattern invertito → tutti fixati.

---

### ADR-006: AI calls sempre via `/api/ai` proxy, mai diretta da client
**Decisione**: il client non chiama mai `api.anthropic.com` direttamente. Sempre tramite `/api/ai` proxy che:
- valida il Bearer token utente
- applica budget per-org (`ai_usage_daily` RPC)
- aggiunge SAFETY_PREFIX al system prompt (anti-injection)
- logga hash+len del prompt per audit forensico
- timeout 25s con AbortController

**Perché**: senza proxy, la chiave Anthropic finisce esposta. Inoltre, il budget per-org è impossibile da enforcare lato client.

**Trade-off**: latenza +30-80ms per il hop Vercel. Worth it.

**Audit verification**: `src/lib/aiClient.js` è il wrapper unificato (17 test). Tutti i 12 callsite della UI passano attraverso questo helper.

---

### ADR-007: Multi-sede via `sede_id`, NULL = dato condiviso
**Decisione**: ogni tabella per-sede ha `sede_id uuid REFERENCES sedi(id)`. Quando `sede_id` è NULL, il dato è **condiviso** tra tutte le sedi (es. ricettario, prezzi HORECA, regole rese).

**Perché**: una pasticceria con 3 sedi vuole UN ricettario master ma TRE magazzini distinti. Il NULL pattern evita di duplicare 30 ricette × 3 sedi.

**Trade-off**: query `WHERE sede_id = $1 OR sede_id IS NULL` invece di filtri semplici; FK ON DELETE va gestita con RESTRICT (vedi `20260614_sede_cascade_to_restrict.sql`).

**Audit verification**: `tests/10-produzione-multisede.spec.js` testa il flow A→B con dati shared.

---

### ADR-008: Test in 3 livelli, vitest unit + render-smoke + Playwright e2e DB-only
**Decisione**: 
- **Unit (vitest)**: logica pura helper, formatters, parsers (~50 file, 1300+ test)
- **Render-smoke (vitest + @testing-library + happy-dom)**: ogni componente React renderizza senza crash (110 file `.jsx` coperti)
- **E2E (Playwright)**: spec contro DB reale via service key, senza browser (12 spec, includono RLS isolation, PIN brute-force, produzione multi-sede)

**Perché**: il browser-based e2e richiede dev server + Chromium, che è fragile in CI. Lo skippiamo per ora. La copertura RLS + flow business critici è data dal DB-level.

**Trade-off**: nessun visual regression, nessuna verifica UX completa. Coperti parzialmente da Lighthouse CI (perf + a11y desktop).

**Audit verification**: ESLint v9 no-undef + react-hooks/rules-of-hooks + render-smoke insieme catturano la classe-bug `HeaderPersonale.isTablet undefined` che ha causato un crash production.

---

## Layout cartelle

```
foodios/
├── src/
│   ├── App.jsx                     # Routing minimale path-based + auth gating
│   ├── Dashboard.jsx               # Layout principale (2934 righe — in calo)
│   ├── auth/                       # AuthPage, PinLoginPad, useAuth hook
│   ├── admin/                      # AdminPage (3224 righe, 8 tab), PersonalizeDemoModal
│   ├── components/                 # 50+ componenti riusabili
│   │   ├── AICard.jsx              # Scaffold UI shared per feature AI
│   │   ├── ConfirmModal.jsx        # Conferme native sostitute
│   │   ├── UpgradeModal.jsx        # Gate piano superiore
│   │   ├── ChainBadge.jsx          # Badge SVG tier premium
│   │   └── ...
│   ├── lib/                        # Logica pura, testata al 90+%
│   │   ├── aiClient.js             # Wrapper unico per /api/ai (12 callsite)
│   │   ├── logger.js               # Structured logger con sanitize PII
│   │   ├── foodcost.js             # Crown jewel: ricorsivo + 427 prezzi HORECA
│   │   ├── stockPF.js              # RPC atomiche carico/scarico/scarto
│   │   ├── storage.js              # ssave/sload con retry + versioning
│   │   └── ...
│   ├── views/                      # View principali (paginate lazy via React.lazy)
│   │   ├── MagazzinoView.jsx
│   │   ├── ChiusuraView.jsx
│   │   ├── ProduzioneGiornalieraView.jsx
│   │   └── ... (40+ view)
│   └── onboarding/                 # Wizard + chat alternativi
├── api/
│   ├── ai.js                       # Proxy Claude API con budget + safety prefix
│   ├── admin.js                    # 25+ azioni admin (verificaAdmin gate)
│   ├── stripe-{checkout,portal,webhook}.js
│   ├── sdi-emit-invoice.js         # SDI via Fatture in Cloud
│   ├── cron-*.js                   # 9 cron job notturni
│   └── lib/                        # safeFetch, rateLimit, cors, validate, safeError, emailTemplates
├── supabase/
│   └── migrations/                 # 60+ migration SQL idempotenti
├── tests/
│   ├── unit/                       # 70+ file vitest
│   ├── *.spec.js                   # 12 file Playwright DB-only
│   └── load/                       # k6 load test (manuale)
└── .github/workflows/              # unit, lighthouse, smoke-prod, migration-check,
                                    # security-audit, bundle-size, vercel-deploy
```

---

## Data flow critico: signup → onboarding → produzione

```
[Utente registra]
  ↓ AuthPage.jsx → supabase.auth.signUp
  ↓ Trigger handle_new_user crea: organizations + sedi(default) + profiles
  ↓ in_attesa=true (approvazione manuale anti-scam)
  
[Admin approva]
  ↓ /admin → tab "⏳ In attesa" → azApprova
  ↓ organizations.in_attesa=false + email benvenuto via Resend
  
[Primo login utente]
  ↓ useAuth carica user + org + sedi + profile
  ↓ App.jsx detect first-login → mostra OnboardingWizard
  ↓ Wizard 4 step: tipo attività + sede default + ricettario demo + obiettivo
  ↓ Save su user_data jsonb (chiave per chiave)
  ↓ Dashboard mount → sload tutti i SK_* per (orgId, sedeId)
  
[Utente registra produzione]
  ↓ ProduzioneGiornalieraView.handleConferma
  ↓ Calcola: decremento magazzino MP + sessione + carico PF
  ↓ await ssave(SK_MAG) + await ssave(SK_GIOR) + supabase.rpc('stock_pf_carico_produzione')
  ↓ Se tutti OK: setMagazzino + setGiornaliero
  ↓ Se uno fallisce: rollback parziale + notify errore
```

---

## Performance: latency budget

| Operazione | Target p95 | Misurato | Strategia |
|---|---:|---:|---|
| First paint mobile | <2.0s | ~1.5s | Vite + code splitting + preconnect |
| Login → Dashboard | <1.5s | ~1.0s | useAuth cache + Promise.all 3 query |
| Cambio sede → reload | <800ms | ~600ms | sload solo chiavi per-sede |
| Save chiusura | <500ms | ~350ms | ssave + RPC scarico in parallelo |
| AI prompt (Sonnet) | <8s | ~5s | proxy + timeout 25s |
| AI prompt (Opus) | <15s | ~9s | timeout 60-90s |

Bundle size budget: **2.7MB gzipped totale** (workflow `bundle-size.yml`). Oggi ~1.8MB.

---

## Sicurezza: threat model

| Vector | Difesa | Test |
|---|---|---|
| Cross-tenant data leak | RLS + defense-in-depth `.eq('organization_id')` | `06-rls-isolation.spec.js` |
| Admin compromise | MFA TOTP + `ADMIN_PROD_MFA_BYPASS` temporaneo | manuale, da rimuovere |
| AI prompt injection | SAFETY_PREFIX server + sanitize zero-width client | `aiClient.test.js` |
| Stripe webhook tampering | signature verification + metadata cross-check | `07-stripe-webhook.spec.js` |
| Brute-force PIN dipendente | `pin_failed_count` + lockout 15min al 5° miss | `09-pin-login.spec.js` |
| Service-role key leak | rotated dopo ogni uso, mai in client bundle | manuale |
| AI cost runaway | budget per-org (trial $1, base $1, pro $3, chain $10/giorno) | `aiBudget.test.js` |
| SQL injection in admin | RPC `admin_safe_select` con whitelist tabelle/colonne | manuale |
| Email enum/phishing | wildcard `%`/`_` escape su `.ilike` profiles | audit 1 lug |
| Magic link replay | session id one-shot Supabase Auth nativo | infra |

---

## Decisioni rifiutate

- **Server-side rendering (Next.js)**: niente SEO critico, l'app è dietro login. SPA è più semplice da deployare su Vercel Edge.
- **GraphQL**: Supabase REST + PostgREST è più semplice e ha auto-RLS.
- **Microservizi**: troppo prematuro per 1 founder e <1000 utenti.
- **Mobile app native (React Native)**: PWA copre 95% dei casi mobile per <€10k investment vs €50k+ per app store.
- **Dark mode**: zero design partner l'ha chiesto. Costo design ~40h. Deferred.
- **Real-time multi-user collaboration** (Supabase Realtime su dati gestionali): polling 12s su admin è sufficiente. Realtime è prematuro per la scala attuale.

---

## Cosa NON è in questo documento

- Come deployare (vedi `NEXT_STEPS.md`)
- Come scrivere test (vedi `tests/README.md`)
- Come fixare bug noti (vedi `git log` + commit message)
- Come configurare env vars (vedi `NEXT_STEPS.md` + Vercel dashboard)
- Decisioni di business (vedi `ANALISI_PRODOTTO.md`)
