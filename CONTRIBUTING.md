# Contribuire a FoodOS

Pochi punti chiave per chi entra nel codebase (incluso Claude Code).

## Prima di scrivere codice

1. Leggi `CLAUDE.md` (~10 min)
2. Leggi `ARCHITECTURE.md` (~15 min)
3. Verifica che la suite test sia verde: `npm test`
4. ESLint clean: `npm run lint`

## Stile commit

```
tipo(area): descrizione concisa (max 70 char)

[body opzionale, max 72 char per riga]

Co-Authored-By: <chi> <email>
```

Tipi:
- `feat`: nuova funzionalità
- `fix`: bugfix
- `chore`: deps, build, ecc.
- `docs`: documentazione
- `test`: nuovi test o fix di test
- `refactor`: senza change funzionale

## Workflow PR

1. Crea branch da `main`: `git checkout -b fix/<short-desc>`
2. Codice + test
3. Lint + test locale: `npm run check` (eseguire lint + test)
4. Commit con messaggio descrittivo
5. Push e apri PR
6. Aspetta CI: unit + lighthouse + security-audit + migration-check
7. Se CI verde, merge

## Cosa NON fare

- ❌ **Non aggiungere feature senza chiedere**: il prodotto è saturo. Bugfix solo, salvo accordo esplicito col founder.
- ❌ **Non rimuovere test**: anche se "obsoleti", verifica con git blame prima.
- ❌ **Non modificare migrations applicate**: scrivi una nuova migration con il fix.
- ❌ **Non bypassare hooks** (`--no-verify`): se ESLint o test falliscono, c'è un motivo.
- ❌ **Non committare secrets**: env vars solo in Vercel dashboard, mai in git.
- ❌ **Non scrivere copy "AI-tone"**: niente "Mi dispiace ma...", "Vorrei suggerire...". Italiano umano, frasi brevi, tono Mara pasticcera (vedi memory `feedback-no-ai-copy`).
- ❌ **Non usare numeri senza separatore migliaia**: usare `toLocaleString('it-IT', ...)`. Helpers in `src/views/_shared.jsx`.

## Cosa fare sempre

- ✅ **Save-first pattern** (vedi ARCHITECTURE.md ADR-005)
- ✅ **Mobile + tablet** ogni nuovo componente: testa su 375px, 768px, 1024px viewport
- ✅ **`.eq('organization_id', orgId)`** defense-in-depth su update/delete anche se RLS è attiva
- ✅ **`callAi()` helper** per chiamate `/api/ai`, mai fetch diretto
- ✅ **Number coercion** quando leggi numeric da Postgres (PostgREST li ritorna come stringa)
- ✅ **`Number.isFinite()` guard** prima di `.toFixed()` su input esterno
- ✅ **aria-label** su input/select senza label visibile
- ✅ **a11y testabili**: aggiungi un test in `accessibility-axe.test.jsx` per ogni nuovo form

## Test obbligatori per categoria di change

| Tipo di change | Test obbligatori |
|---|---|
| Nuova view (`.jsx`) | smoke render + import safe |
| Nuova RPC Supabase | spec Playwright DB-only |
| Nuovo endpoint API | api-import-smoke |
| Modifica template email | snapshot `emailTemplates.test.js` |
| Modifica componente shared | snapshot `components-snapshot.test.jsx` |
| Nuova feature AI | `aiClient` + test prompt structure |

## Strumenti

```bash
# Dev
npm run dev              # Vite dev server :5173
vercel dev               # API + dev server :3000

# Test
npm test                 # vitest unit + smoke
npm run test:coverage    # con coverage HTML
npm run test:e2e         # Playwright (richiede env DB)

# Lint
npm run lint             # eslint src/
npm run lint:fix         # auto-fix

# Deploy
git push                 # autodeploy via GH Action vercel-deploy.yml
vercel --prod --yes      # deploy forzato locale
```

## Per Claude Code (e altri agenti AI)

- Segui le memory in `/Users/aler/.claude/projects/-Users-aler/memory/`
- Quando in dubbio, leggi prima `CLAUDE.md`
- Per refactor architetturali, leggi `ARCHITECTURE.md` ADRs prima di proporre alternative
- Niente "fix preventivi": solo quello che è stato richiesto
- Italian language for copy, English for code comments

## In caso di dubbio

Chiedi al founder (Greg, greg@maradeiboschi.com). Meglio 5 min di chiarimento che 2 ore di lavoro nella direzione sbagliata.
