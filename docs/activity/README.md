# 개발 일지

`.github/workflows/journal.yml` 이 매주 월요일 아침(KST)에 `tools/journal.py` 로 만듭니다.
**업데이트 패치노트 형식**입니다 — 합쳐진 작업을 머리에 두고, 커밋은 성격별로 묶습니다.

| 칸 | 무엇 |
|---|---|
| 합쳐진 작업 | 이번 주 merge 된 PR |
| 화면에서 달라진 것 | 쓰는 사람 눈에 보이는 변화 |
| 고친 것 | 버그 수정 |
| 안에서 바뀐 것 | 구조·테스트·문서 등 |
| 아직 열려 있는 것 · 이슈 · 누가 얼마나 | |

커밋 제목을 보고 나눕니다 (`tools/journal.py` 의 `BUCKETS`). 어긋나면 거기를 고치세요.

활동이 없던 주는 아무것도 만들지 않습니다.

**PR 로 올라옵니다.** `main` 은 PR 을 거쳐야 하고 개인 저장소에서는 bypass 목록에
GitHub Actions 를 넣을 수 없어서, 일지는 `docs/journal-YYYY-Www` 브랜치에 올라가고
`YYYY-Www 개발 일지` PR 이 열립니다. 내용을 보고 합치면 됩니다.

## 지금 돌려보려면

Actions 탭 → journal → Run workflow
