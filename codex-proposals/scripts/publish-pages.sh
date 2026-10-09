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
proposal_source="$(git rev-parse HEAD)"
proposal_tree="$(git rev-parse "${proposal_source}:codex-proposals")"
proposal_parent_args=()
proposal_remote_ref="$(git ls-remote --heads origin refs/heads/gh-pages)"
if [[ -n "$proposal_remote_ref" ]]; then
  git fetch origin refs/heads/gh-pages
  proposal_parent="$(git rev-parse FETCH_HEAD)"
  if [[ "$(git rev-parse "${proposal_parent}^{tree}")" == "$proposal_tree" ]]; then
    echo '배포 브랜치에 이미 같은 시안이 있습니다.'
    exit 0
  fi
  proposal_parent_args=(-p "$proposal_parent")
fi
# 작업 폴더를 바꾸지 않고 시안 폴더의 트리로 배포 커밋을 만든다.
proposal_pages_commit="$(git commit-tree "$proposal_tree" "${proposal_parent_args[@]}" -m "Publish design proposals from ${proposal_source}")"
git push origin "${proposal_pages_commit}:refs/heads/gh-pages"
