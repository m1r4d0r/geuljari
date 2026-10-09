#!/usr/bin/env bash
set -euo pipefail

# main에 올린 시안만 별도 배포 브랜치에 반영한다.
proposal_repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$proposal_repo_root"
if [[ -n "$(git status --porcelain -- codex-proposals)" ]]; then
  echo 'codex-proposals의 변경사항을 먼저 커밋하고 main에 푸시해 주세요.' >&2
  exit 1
fi
git fetch origin main
if ! git merge-base --is-ancestor HEAD origin/main; then
  echo '현재 커밋이 원격 main에 없습니다. main에 반영한 뒤 실행해 주세요.' >&2
  exit 1
fi
proposal_pages_commit="$(git subtree split --prefix=codex-proposals HEAD)"
git push origin "${proposal_pages_commit}:refs/heads/gh-pages"
