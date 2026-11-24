#!/bin/bash
# 세션이 시작될 때마다 자동으로 도는 스크립트.
#  1) origin 의 최신 변경을 받아온다 (안전할 때만 자동으로 합치고, 아니면 알려만 준다)
#  2) 테스트가 바로 돌도록 playwright 를 깔아 둔다
# 손으로 돌려보려면: ./.claude/hooks/session-start.sh
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"

# ── 1. 남이 올린 것 받아오기 ─────────────────────────────
if git rev-parse --git-dir >/dev/null 2>&1; then
  if git fetch --quiet --all --prune 2>/dev/null; then
    branch=$(git symbolic-ref --short -q HEAD || echo '')
    up=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '')

    if [ -n "$up" ]; then
      behind=$(git rev-list --count "HEAD..$up" 2>/dev/null || echo 0)
      ahead=$(git rev-list --count "$up..HEAD" 2>/dev/null || echo 0)
      dirty=$(git status --porcelain | head -1)

      if [ "$behind" -gt 0 ]; then
        if [ "$ahead" -eq 0 ] && [ -z "$dirty" ]; then
          git merge --ff-only --quiet "$up"
          echo "[시작] $up 의 새 커밋 ${behind}개를 받아 최신으로 맞췄습니다."
        else
          echo "[시작] ⚠ $up 보다 ${behind}개 뒤처져 있습니다 (내 쪽 ${ahead}개 앞섬${dirty:+, 저장 안 한 변경 있음})."
          echo "        작업 전에 합치세요:  git merge $up"
        fi
      fi
    fi

    # main 과 얼마나 벌어졌는지 (작업 브랜치일 때만)
    if [ -n "$branch" ] && [ "$branch" != "main" ] && git rev-parse --verify -q origin/main >/dev/null; then
      gap=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo 0)
      [ "$gap" -gt 0 ] && echo "[시작] origin/main 에 이 브랜치에 없는 커밋이 ${gap}개 있습니다. 충돌이 걱정되면 지금 합치세요:  git merge origin/main"
    fi
  else
    echo "[시작] origin 에 연결하지 못했습니다. 네트워크 없이 작업합니다."
  fi
fi

# ── 2. 테스트 준비 (playwright) ──────────────────────────
# CI(.github/workflows/tests.yml)와 같은 버전이어야 결과가 갈리지 않는다.
PW_VER=1.65.1
purelib=$(python3 -I -c 'import sysconfig; print(sysconfig.get_path("purelib"))')
hashes="$purelib/.session-start.sha256"

if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  echo "[시작] playwright==$PW_VER 설치 중…"
  PIP_ROOT_USER_ACTION=ignore python3 -m pip install --quiet --disable-pip-version-check "playwright==$PW_VER"
  sha256sum .claude/hooks/session-start.sh .github/workflows/tests.yml 2>/dev/null > "$hashes" || rm -f "$hashes"
fi

# 브라우저 — 컨테이너에 미리 깔려 있으면 그걸 쓰고, 없으면 내려받는다.
if [ -d /opt/pw-browsers ]; then
  export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
  echo 'export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers' >> "${CLAUDE_ENV_FILE:-/dev/null}"
fi

if ! python3 -m playwright install chromium chromium-headless-shell >/dev/null 2>&1; then
  # 내려받기가 막힌 환경: 미리 깔린 빌드를 playwright 가 찾는 이름으로 이어 준다.
  linked=0
  while read -r want; do
    [ -n "$want" ] || continue
    [ -e "$want" ] && continue
    dir=$(dirname "$want"); base=$(basename "$want"); fam=${base%-*}
    have=$(ls -d "$dir/${fam}-"* 2>/dev/null | grep -v "$base\$" | sort -V | tail -1 || true)
    if [ -n "$have" ] && [ -d "$have" ]; then ln -sfn "$have" "$want"; linked=1; fi
  done < <(python3 -m playwright install --dry-run chromium chromium-headless-shell 2>/dev/null \
             | awk '/Install location:/{print $3}')
  [ "$linked" = 1 ] && echo "[시작] 브라우저를 내려받지 못해 컨테이너에 있는 빌드로 이어 뒀습니다."
fi

echo "[시작] 준비 끝 ·  테스트: python3 tests/run_all.py  ·  규칙: CLAUDE.md"
