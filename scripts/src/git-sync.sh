#!/usr/bin/env bash
# Ícaro · sincronização bidirecional com o GitHub (Dev-kenshi/Icaro).
# Uso:
#   ./scripts/src/git-sync.sh push ["mensagem"]  → manda as mudanças daqui para o GitHub
#   ./scripts/src/git-sync.sh pull               → traz as mudanças do GitHub para cá
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${GITHUB_TOKEN:?Segredo GITHUB_TOKEN não configurado no ambiente.}"
REMOTE="https://github.com/Dev-kenshi/Icaro.git"
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="http.extraHeader"
export GIT_CONFIG_VALUE_0="Authorization: Basic $(printf "x-access-token:%s" "$GITHUB_TOKEN" | base64 -w0)"
git config user.name >/dev/null 2>&1 || git config user.name "Icaro"
git config user.email >/dev/null 2>&1 || git config user.email "icaro@users.noreply.github.com"

case "${1:-}" in
  push)
    git fetch "$REMOTE" main 2>/dev/null || true
    if git rev-parse -q --verify FETCH_HEAD >/dev/null && ! git merge-base --is-ancestor FETCH_HEAD HEAD; then
      echo "O GitHub tem mudanças novas. Trazendo antes do push..."
      git merge FETCH_HEAD -m "Merge das mudanças do GitHub" || { echo "Conflito. Resolva os arquivos marcados e rode o push de novo."; exit 1; }
    fi
    if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
      git add -A
      git commit -m "${2:-Atualização do Ícaro (workspace Replit)}" || true
    fi
    git push --no-verify "$REMOTE" main:main
    echo "Push concluído → $REMOTE (branch main)"
    ;;
  pull)
    git fetch "$REMOTE" main
    git merge FETCH_HEAD -m "Merge das mudanças do GitHub" || { echo "Conflito. Resolva os arquivos marcados e faça commit."; exit 1; }
    echo "Pull concluído. Revise o que chegou com: git log --oneline -10"
    ;;
  *)
    echo "Uso: $0 push [mensagem] | pull" >&2; exit 1;;
esac
