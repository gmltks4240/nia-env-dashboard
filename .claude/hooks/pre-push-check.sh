#!/bin/bash
# git push 직전에 도는 검사.
#
# 3명이 같은 파일을 동시에 고치면, 먼저 merge 한 사람 것을 나중 사람이 덮어쓰거나
# 충돌을 손으로 풀다 남의 작업을 지우게 된다. 그걸 푸시 전에 미리 알려 준다.
#
# 겹치는 파일이 있으면 푸시를 멈추고(종료코드 2) 무엇이 겹치는지 알린다.
# 확인하고 그대로 밀 때:  PREPUSH_OK=1 git push ...
#
# 손으로 돌려보려면:  echo '{"tool_input":{"command":"git push"}}' | .claude/hooks/pre-push-check.sh
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# 한글 파일명을 그대로 보여 준다
git() { command git -c core.quotepath=false "$@"; }

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)

# git push 가 아니면 통과
printf '%s' "$cmd" | grep -Eq '(^|[;&|]|\s)git\s+(-[^ ]+\s+)*push(\s|$)' || exit 0

# 확인 끝났다고 알려 온 경우 통과
[ "${PREPUSH_OK:-}" = "1" ] && exit 0
printf '%s' "$cmd" | grep -q 'PREPUSH_OK=1' && exit 0

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

me=$(git symbolic-ref --short -q HEAD) || exit 0
[ "$me" = "main" ] && exit 0
# 내가 밀어 넣을 원격 브랜치 (추적 중인 것). 나 자신과 겹친다고 말하면 안 된다
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>/dev/null || echo "origin/$me")

# 비교 기준을 최신으로. 실패해도 있는 것으로 검사한다.
timeout 20 git fetch --quiet --prune origin >/dev/null 2>&1

git rev-parse --verify -q origin/main >/dev/null || exit 0

# 내가 main 이후 건드린 파일
base=$(git merge-base HEAD origin/main 2>/dev/null) || exit 0
mine=$(git diff --name-only "$base" HEAD 2>/dev/null)
[ -n "$mine" ] || exit 0

report=""
while read -r other; do
  [ -n "$other" ] || continue
  case "$other" in origin/main|origin/HEAD|"origin/$me"|"$upstream") continue ;; esac

  # 이미 main 에 다 들어간 브랜치는 건너뛴다
  [ "$(git rev-list --count "origin/main..$other" 2>/dev/null || echo 0)" -gt 0 ] || continue

  ob=$(git merge-base "$other" origin/main 2>/dev/null) || continue
  theirs=$(git diff --name-only "$ob" "$other" 2>/dev/null)
  [ -n "$theirs" ] || continue

  both=$(comm -12 <(printf '%s\n' "$mine" | sort -u) <(printf '%s\n' "$theirs" | sort -u))
  [ -n "$both" ] || continue

  who=$(git log -1 --format='%an' "$other" 2>/dev/null)
  when=$(git log -1 --format='%ad' --date=short "$other" 2>/dev/null)
  report="${report}
  ${other#origin/}  (${who} · ${when})
$(printf '%s\n' "$both" | sed 's/^/      /')"
done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin)

[ -n "$report" ] || exit 0

cat >&2 <<MSG
[푸시 전 겹침 검사] 멈췄습니다.

'$me' 에서 고친 파일을, 아직 main 에 안 들어간 다른 브랜치도 건드리고 있습니다.
$report

먼저 push 되는 쪽이 이기지 않습니다. 나중에 merge 하는 쪽이 충돌을 풀다가
상대 작업을 지우기 쉬운 상태입니다.

사용자에게 위 목록을 보여 주고 어떻게 할지 확인하세요. 고르는 길:
  1) 상대 브랜치를 먼저 받아 합치고 푸시   git merge origin/<상대브랜치>
  2) 겹치는 파일을 이번 푸시에서 빼기
  3) 확인했고 그대로 민다                 PREPUSH_OK=1 git push ...
MSG
exit 2
