# Runbook — Branch protection main

Procedura **una tantum** da fare una sola volta sul repo GitHub `foodios`
(alessandroronchi18-sketch/foodios). Tempo: 5 minuti. Effetto: nessun merge
diretto su `main` senza PR + CI verde + 1 review (anche del proprietario).

Tutela contro: **deploy rotto perché merge frettoloso bypassa CI**, push
diretto a main accidentale, force-push storico.

## Step 1 — Vai su GitHub → Settings → Branches

URL diretto: https://github.com/alessandroronchi18-sketch/foodios/settings/branches

Clicca **Add branch protection rule** (o **Add rule** se è la prima).

## Step 2 — Configura la rule

Compila esattamente così:

| Campo | Valore |
|---|---|
| **Branch name pattern** | `main` |
| ☑ Require a pull request before merging | ON |
| ↳ Required approvals | `1` (te stesso o stub, basta una review) |
| ↳ Dismiss stale PR approvals when new commits are pushed | ON |
| ☑ Require status checks to pass before merging | ON |
| ↳ Require branches to be up to date before merging | ON |
| ↳ Status checks required | seleziona: `unit` (Unit tests workflow), `playwright` (se configurato), `migration-check` (auto-comment, opzionale come gate) |
| ☑ Require conversation resolution before merging | ON |
| ☑ Restrict who can push to matching branches | ON (solo te) |
| ☑ Do not allow bypassing the above settings | ON (anche per admin — protegge te da te stesso quando hai fretta) |
| ☐ Allow force pushes | OFF |
| ☐ Allow deletions | OFF |

Salva con **Create**.

## Step 3 — Test rapido (opzionale, 1 minuto)

Apri un terminale:

```bash
git checkout main
git pull origin main
echo "test" >> /tmp/dummy.md
git checkout -b test/branch-protection
git push -u origin test/branch-protection
# Ora prova a fare PR da test/branch-protection → main
# Senza review + CI green, GitHub deve mostrare "Merge button disabled".
```

Quando ti convinci che funziona, chiudi la PR e cancella il branch.

## Step 4 — Configura Vercel Preview comments (opzionale, 2 minuti)

Se hai l'app Vercel GitHub installata, ogni PR riceve auto-commento con URL
del preview deploy. Verifica su:
https://vercel.com/alessandroronchi18-7807s-projects/foodios/git

Se il bot Vercel non commenta sulle PR:
1. Vercel Dashboard → Project → Settings → Git → "Pull Request Comments" → ON

## Step 5 — Workflow obbligatori

Dopo questa configurazione, il workflow per un fix diventa:

```bash
git checkout main && git pull
git checkout -b fix/qualcosa
# ...edits...
git add -A && git commit -m "fix(area): descrizione"
git push -u origin fix/qualcosa
gh pr create --fill   # oppure UI GitHub
# Aspetta CI verde (smoke + unit + playwright)
# Aspetta review (anche tua, "Approve" su PR propria)
# Merge da UI (squash o no-ff a scelta)
```

## Bypass d'emergenza

Solo per HOTFIX prod assolutamente bloccanti. Settings → Branches → Edit rule
→ togli temporaneamente ☑ "Do not allow bypassing", fai il push diretto,
riabilita SUBITO. Lascia traccia in un commit message tipo:

```
fix(emergency): hotfix prod XYZ — bypass branch protection

Bypass autorizzato da me stesso il YYYY-MM-DD HH:MM perché [motivo].
Branch protection riabilitata immediatamente dopo.
```

## Workflow CI configurati

| Workflow | Trigger | Cosa fa |
|---|---|---|
| `unit.yml` | push main, PR | npm test + build sanity |
| `playwright.yml` | PR (se secret presenti) | e2e RLS isolation, stock PF, Stripe webhook |
| `vercel-deploy.yml` | push main | vercel build prebuilt + alias promote |
| `smoke-prod.yml` | post-deploy + cron 6h | curl endpoints critici prod |
| `migration-check.yml` | PR con file in `supabase/migrations/` | commenta sulla PR con reminder |

## Verifica branch protection ATTIVA

Da terminale:

```bash
gh api repos/alessandroronchi18-sketch/foodios/branches/main/protection \
  --jq '.required_pull_request_reviews.required_approving_review_count, .required_status_checks.contexts'
```

Output atteso: `1` + array di workflow.

Se ritorna 404, la branch protection NON è attiva. Rifai lo Step 1.
