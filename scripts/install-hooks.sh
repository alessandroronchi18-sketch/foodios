#!/usr/bin/env bash
# Installa i git hooks locali (idempotente).
# Chiamato da `npm run postinstall` — così ogni `npm ci` o `npm install`
# reinstalla i hook. I file in .git/hooks/ non sono versionati.
#
# Pre-push: blocca il push se ESLint trova errori, se i test falliscono, o
# se la build crasha. Il root cause del bug "non vedo cambiamenti su mobile"
# del 24/06 è stato proprio: lint errors -> CI fail -> nessun deploy ->
# nessuna versione nuova in production.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

# Crea la dir hooks se non esiste (alcuni clone --no-checkout la saltano).
mkdir -p "$HOOKS_DIR"

# ── pre-push: lint + test + build ──────────────────────────────────────────
cat > "$HOOKS_DIR/pre-push" <<'HOOK_EOF'
#!/usr/bin/env bash
# pre-push: blocca push se non passano lint + test + build.
# Bypass solo in casi straordinari con: git push --no-verify

set -e

# Leggi i ref che verranno pushati. Skippa se e' solo un delete branch o un tag.
push_main=0
while read -r local_ref local_sha remote_ref _remote_sha; do
  case "$local_ref" in
    refs/heads/main) push_main=1 ;;
    refs/tags/*) ;;
    *) ;;
  esac
done

# Solo push diretti su main vengono validati. Branch personali (feat/*, fix/*)
# possono pushare senza gate — la PR fara' il check su GitHub Actions.
if [ "$push_main" -ne 1 ]; then
  exit 0
fi

echo "▶ pre-push: lint + test + build prima di pushare su main"
echo

# 1) ESLint
echo "[1/3] ESLint…"
if ! npx eslint src/ --max-warnings 200; then
  echo
  echo "ESLint ha trovato errori. Push abortito."
  echo "Per pushare comunque (sconsigliato): git push --no-verify"
  exit 1
fi

# 2) Test
echo
echo "[2/3] Unit tests (vitest)…"
if ! npm test --silent; then
  echo
  echo "Test falliti. Push abortito."
  echo "Per pushare comunque (sconsigliato): git push --no-verify"
  exit 1
fi

# 3) Build production
echo
echo "[3/3] Build production…"
if ! npm run build --silent 2>&1 | tail -5; then
  echo
  echo "Build production fallito. Push abortito."
  echo "Per pushare comunque (sconsigliato): git push --no-verify"
  exit 1
fi

echo
echo "Pre-push OK — push autorizzato."
HOOK_EOF

chmod +x "$HOOKS_DIR/pre-push"

# ── post-merge: avviso se package.json cambia dopo merge/pull ──
cat > "$HOOKS_DIR/post-merge" <<'HOOK_EOF'
#!/usr/bin/env bash
# Avvisa se package.json e' cambiato dopo merge/pull.
changed_files="$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD 2>/dev/null || true)"
if echo "$changed_files" | grep -qE "^(package\.json|package-lock\.json)$"; then
  echo "package.json modificato. Esegui: npm ci"
fi
HOOK_EOF
chmod +x "$HOOKS_DIR/post-merge"

echo "Git hooks installati:"
echo "  - .git/hooks/pre-push (lint + test + build su push a main)"
echo "  - .git/hooks/post-merge (avviso npm ci se package.json cambia)"
