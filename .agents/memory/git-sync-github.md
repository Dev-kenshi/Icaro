---
name: Sincronização com o GitHub
description: Como o workspace sincroniza com o repo Dev-kenshi/Icaro e as armadilhas de LFS/token.
---

- Repo remoto: https://github.com/Dev-kenshi/Icaro (branch main), remoto local `github`. Outras pessoas editam lá; rode `./scripts/src/git-sync.sh pull` antes de trabalhar e `push "msg"` depois.
- O token no segredo `GITHUB_TOKEN` consegue push normal, mas **não** faz upload de objetos Git LFS ("LFS: Not Implemented") e o repo rejeita force-push ("repository rule violations").
- **Why:** o histórico antigo do Replit (gitsafe) tinha `entregas/icaro-codigo-completo.zip` como ponteiro LFS, o que bloqueava todo push. Solução: main do GitHub é um commit limpo sobre o histórico remoto; o histórico antigo ficou na branch local `backup-historico-replit`.
- **How to apply:** nunca versionar zips/binários grandes com LFS aqui; se um push falhar com erro de LFS, verificar se algum commit novo contém ponteiro (`head -c 60 arquivo | grep git-lfs`).
