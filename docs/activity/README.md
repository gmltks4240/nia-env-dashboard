# 개발 일지

`.github/workflows/journal.yml` 이 매주 월요일 아침(KST)에 자동으로 만듭니다.
지난 한 주의 커밋·합쳐진 PR·열린 PR·이슈 움직임·기여자를 모아 `YYYY-Www.md` 로 남깁니다.

활동이 없던 주는 아무것도 만들지 않습니다.

**PR 로 올라옵니다.** `main` 은 PR 을 거쳐야 하고 개인 저장소에서는 bypass 목록에
GitHub Actions 를 넣을 수 없어서, 일지는 `docs/journal-YYYY-Www` 브랜치에 올라가고
`YYYY-Www 개발 일지` PR 이 열립니다. 내용을 보고 합치면 됩니다.

## 손으로 덧붙이세요

자동 생성된 것은 "무슨 일이 있었나"까지만 말해줍니다.
**그 주에 무엇이 어려웠고 무엇을 배웠는지**는 사람만 쓸 수 있습니다.
파일 아래쪽에 한두 문단 덧붙여 주세요. 그게 가장 가치 있는 기록입니다.

## 지금 돌려보려면

Actions 탭 → journal → Run workflow
