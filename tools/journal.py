#!/usr/bin/env python3
"""주간 개발 일지(패치노트) 만들기.

커밋을 그냥 나열하면 '무엇이 달라졌는지'가 안 읽힌다. 그래서
합쳐진 PR 을 머리기사로 두고, 커밋은 성격별로 묶어 적는다.

쓰는 법 (워크플로에서):
    python3 tools/journal.py --since 2026-11-19 --until 2026-11-26 \
        --week 2026-W48 --repo owner/name \
        --merged merged.json --open open.json --issues issues.json

--merged/--open/--issues 는 `gh pr list --json ...` 결과 파일.
없으면 그 칸은 '없음' 으로 둔다. 커밋은 이 저장소의 git log 에서 직접 읽는다.
"""
import argparse, json, pathlib, re, subprocess, sys

# 커밋 제목을 보고 성격을 나눈다. 위에서부터 처음 맞는 칸.
#  고친 것 먼저 — '팝업 색 고침' 처럼 화면 낱말이 같이 들어가는 제목이 많다.
BUCKETS = [
    ('고친 것', re.compile(
        r'고침|고친|버그|오류|틀리|틀렸|깨지|깨짐|실패|잘못|안 되던|안되던|'
        r'빠지던|사라지던|되돌림|복구')),
    ('안에서 바뀐 것', re.compile(
        r'테스트|리팩터|리팩토링|나누기|나눔|훅|워크플로|CI|문서|주석|'
        r'README|CONTRIBUTING|CLAUDE|AUDIT|DESIGN-REVIEW|\.md\b|규칙|일지|'
        r'라이선스|LICENSE|결정 기록|토큰화|구조|의존|버전 고정|캐시 번호|'
        r'config\.js|한 파일로|설정 파일|\.sql\b|스크립트|초기 업로드')),
    ('화면에서 달라진 것', re.compile(r'.')),   # 나머지 전부
]
ORDER = ['화면에서 달라진 것', '고친 것', '안에서 바뀐 것']


def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout


def commits(since):
    """[(날짜, 제목, 지은이, 짧은해시)] — merge 커밋은 뺀다."""
    out = run(['git', 'log', f'--since={since}', '--no-merges',
               '--date=short', '--pretty=format:%ad\x1f%s\x1f%an\x1f%h'])
    rows = []
    for line in out.splitlines():
        if line.count('\x1f') == 3:
            rows.append(tuple(line.split('\x1f')))
    return rows


def bucket_of(subject):
    for name, pat in BUCKETS:
        if pat.search(subject):
            return name
    return ORDER[0]


def load(path):
    if not path:
        return []
    p = pathlib.Path(path)
    if not p.exists() or not p.read_text().strip():
        return []
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError:
        return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', required=True)
    ap.add_argument('--until', required=True)
    ap.add_argument('--week', required=True)
    ap.add_argument('--repo', required=True)
    ap.add_argument('--merged')
    ap.add_argument('--open')
    ap.add_argument('--issues')
    a = ap.parse_args()

    repo = a.repo
    rows = commits(a.since)
    merged = [p for p in load(a.merged) if (p.get('mergedAt') or '') >= a.since]
    opened = load(a.open)
    issues = [i for i in load(a.issues)
              if (i.get('createdAt') or '') >= a.since or (i.get('closedAt') or '') >= a.since]

    L = []
    w = L.append
    w(f'# {a.week} 업데이트')
    w('')
    w(f'{a.since} ~ {a.until}')
    w('')
    w('<!-- 아래 "이번 주 한 줄"은 사람이 적습니다. 자동 생성분은 무슨 일이 있었나까지만 -->')
    w('')
    w('## 이번 주 한 줄')
    w('')
    w('_(무엇이 어려웠고 무엇을 배웠는지 적어 주세요)_')
    w('')

    w('## 합쳐진 작업')
    w('')
    if merged:
        for p in merged:
            who = (p.get('author') or {}).get('login', '?')
            plus, minus = p.get('additions', 0), p.get('deletions', 0)
            w(f'- **[#{p["number"]}](https://github.com/{repo}/pull/{p["number"]})** '
              f'{p["title"]} — {who} (+{plus}/-{minus})')
    else:
        w('_없음_')
    w('')

    by = {}
    for d, s, an, h in rows:
        by.setdefault(bucket_of(s), []).append((d, s, an, h))

    for name in ORDER:
        if not by.get(name):
            continue
        w(f'## {name}')
        w('')
        for d, s, an, h in by[name]:
            w(f'- {s} <sub>{d} · {an} · `{h}`</sub>')
        w('')

    if opened:
        w('## 아직 열려 있는 것')
        w('')
        for p in opened:
            who = (p.get('author') or {}).get('login', '?')
            draft = ' (초안)' if p.get('isDraft') else ''
            w(f'- [#{p["number"]}](https://github.com/{repo}/pull/{p["number"]}) '
              f'{p["title"]} — {who}{draft}')
        w('')

    if issues:
        w('## 이슈')
        w('')
        for i in issues:
            who = (i.get('author') or {}).get('login', '?')
            w(f'- [#{i["number"]}](https://github.com/{repo}/issues/{i["number"]}) '
              f'{i["title"]} — {who} · {i.get("state", "")}')
        w('')

    w('## 누가 얼마나')
    w('')
    if rows:
        cnt = {}
        for _, _, an, _ in rows:
            cnt[an] = cnt.get(an, 0) + 1
        for an, n in sorted(cnt.items(), key=lambda kv: -kv[1]):
            w(f'- {an} — 커밋 {n}개')
    else:
        w('_없음_')
    w('')
    w(f'전체 {len(rows)}개 커밋 · 합쳐진 작업 {len(merged)}건')
    w('')
    w('<!-- .github/workflows/journal.yml 이 tools/journal.py 로 만듭니다 -->')

    sys.stdout.write('\n'.join(L) + '\n')


if __name__ == '__main__':
    main()
