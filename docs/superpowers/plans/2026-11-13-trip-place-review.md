# 출장 장소 AI 분류와 검토표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미분류 장소를 AI가 분류하고, 모든 분류를 운임과 대조해 검토·수정할 수 있게 한다.

**Architecture:** 운임 대조는 `index.html`의 `@trip` 순수 함수 블록에 더한다. 화면은 "분류하지 못한 장소" 표를 "장소 분류 검토" 표로 바꾸고, 장소 사전의 출처·확신·이유를 함께 읽는다. 초기 사전은 이 대화에서 분류해 SQL과 엑셀로 전달한다(저장소 밖).

**Tech Stack:** 단일 `index.html`(바닐라 JS), Supabase(PostgREST·Edge Function/Deno), Playwright(Python) 테스트.

**Spec:** `docs/superpowers/specs/2026-11-13-trip-place-review-design.md`

## Global Constraints

- 운임 증거는 장소를 지정하지 않는다. 대조에만 쓴다.
- 증거로 세는 조건: 반대편 장소의 도시를 알고, 두 도시가 다르고, 분류된 도시와 반대편 도시 사이에 운임표 구간이 있을 것. 경유지는 쓰지 않는다.
- 표시 값: `일치` / `다름`(증거 3건 이상, 일치 절반 미만) / `다름(건수 적음)`(증거 1~2건) / `대조 불가` / `참고`.
- 분류 우선순위: 사람 확정 → AI(사전) → 키워드 규칙 → 없음.
- AI 호출: 한 번에 50개, 동시에 3묶음, 묶음당 제한 120초. 장소명 문자열만 보낸다.
- `trip_rows`·`trip_places`는 입력·수정·관리자만 읽는다. `trip_batches`는 누구나 읽는다.
- 원본 장소명이 든 파일(사전 SQL, 검토 엑셀)은 커밋하지 않는다.
- 2026-11-12 시산값(연도별 건수·거리·배출량)은 사전을 넣지 않은 상태에서 그대로여야 한다.

## Review Focus

1. 로그인하지 않은 사람이 파일을 올림 → 장소 사전을 읽으려다 권한 오류가 나지 않고 규칙만으로 미리보기 (Task 2).
2. 장소 사전이 1,000줄을 넘음 → 전부 읽힘 (Task 2).
3. AI가 "모름"이라고 답한 장소 → 다음 업로드 때 다시 보내지 않음 (Task 2).
4. AI 묶음 하나가 실패 → 이미 받은 답은 쓰고 나머지는 규칙으로 계속 (Task 2).
5. 출발지와 목적지가 같은 도시인 행(서울→서울 43,500) → 운임 증거로 세지 않아 `다름`이 뜨지 않음 (Task 1).

---

### Task 1: 운임 대조 함수

**Files:**
- Modify: `tools/build_trip_ref.py` — 판정기준 항목에 `cities: [도시, 도시]` 추가, `VERSION = "2026-11-13"`
- Modify: `index.html` — `@trip-ref` 블록 재생성, `@trip` 블록에 함수 추가
- Test: `tests/test_trip_rail.py`

**Interfaces:**
- Produces:
  - `tripFarePairs(fare, ref) → [도시, 도시][]` — 그 금액과 맞는 판정기준·편도·두 구간 합의 도시쌍(중복 제거, `ref.pairs`에 캐시)
  - `tripPlaceEvidence(rows, ref, placeMap) → Map<장소, { hit, votes: {도시: 건수} }>`
  - `tripEvidenceMark(points, ev) → '일치'|'다름'|'다름(건수 적음)'|'대조 불가'|'참고'`

- [ ] Step 1: 테스트 추가.
  - `tripFarePairs(87000)`에 대구–서울, `tripFarePairs(49600)`에 대구–세종 포함. `tripFarePairs(70010)`은 빈 배열.
  - 행 `대구→한국프레스센터 87,000` 3건 + `43,500` 1건 → `한국프레스센터`의 `hit 4`, `votes.서울 4`.
  - 같은 행들에 사전 `{한국프레스센터: ['세종']}` → 표시 `다름`; `['서울']` → `일치`; 사전 없음 → `참고`.
  - `서울→서울 43,500` → 증거 없음. `대구→제주 87,000`(제주로 분류, 대구–제주 운임표 없음) → 증거 없음.
  - 증거 1건이고 분류와 다르면 `다름(건수 적음)`. 증거 없으면 `대조 불가`.
- [ ] Step 2: 실패 확인 (`python tests/test_trip_rail.py`).
- [ ] Step 3: 빌더와 함수 구현, `python tools/build_trip_ref.py <운임표.xlsx> index.html`로 블록 재생성.
- [ ] Step 4: 통과 확인. 실제 4개 연도 파일로 시산값이 그대로인지 대조.
- [ ] Step 5: Commit.

### Task 2: 장소 사전 읽기와 AI 호출

**Files:**
- Modify: `index.html` — `tripLoadPlaces`, `tripAskAI`, `tripRun`
- Modify: `supabase/functions/classify-places/index.ts` — "모름"도 기록, 지점 기준 보강
- Modify: `supabase/trip_scope3.sql` — 읽기 권한
- Test: `tests/test_trip_ui.py`

**Interfaces:**
- `tripLoadPlaces() → { map: {raw: points}, meta: {raw: {source, confidence, reason}}, missing }` — 입력·수정 권한이 없으면 요청하지 않고 빈 값. 1,000줄씩 `order=raw.asc`로 끝까지 읽음.
- `tripAskAI(raws, onStep) → { got: {raw: {points, confidence, reason}}, note }` — "모름"도 `points: []`, `confidence: 'unknown'`으로 돌려줌.
- `trip.placeMeta[raw] = { source: 'human'|'ai', confidence, reason }`

- [ ] Step 1: 테스트 추가.
  - 로그인 없이 올리면 `trip_places` 요청이 없고 요약이 나온다.
  - `trip_places` 1,500줄 → 요청 2번, 1,200번째 줄의 분류가 적용된다.
  - 사전에 `confidence: 'unknown'`인 장소 → AI 호출 본문에 그 장소가 없다.
  - 장소 120개 → AI 호출 3번, 각 50개 이하. 두 번째 묶음이 500이면 첫 묶음 답은 적용되고 안내가 뜬다.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 구현.
- [ ] Step 4: 통과 확인, 전체 테스트.
- [ ] Step 5: Commit.

### Task 3: 장소 분류 검토표

**Files:**
- Modify: `index.html` — `#sub-trip` 패널(검토표·보기 선택·CSV), `tripCompute`, `tripRender`, `tripSetPlace`
- Test: `tests/test_trip_ui.py`

**Interfaces:**
- `trip.review = [{ raw, n, points, label, source, confidence, reason, hint, mark, rank }]` — `source`: `사람`|`AI`|`규칙`|`없음`; `rank`: 0 `다름` · 1 미분류 · 2 AI 모름 · 3 확신 낮음·`다름(건수 적음)` · 4 나머지.
- 요소: `#trip-review`(표), `#trip-rv-filter`(보기), `#trip-rv-n`(개수), `#trip-rv-dl`(검토표 CSV). 고치기는 `select[data-raw]`.

- [ ] Step 1: 테스트 — 기존 "분류하지 못한 장소" 검증을 검토표 기준으로 바꾸고 추가.
  - 미분류 장소가 "확인 필요"에 `미분류`로 나온다. 지점을 고르면 출처가 `사람`이 되고 다시 계산된다.
  - 사전이 틀린 장소(운임 증거 3건이 다른 곳)는 맨 위에 `다름`으로 나온다.
  - AI가 분류한 장소는 출처 `AI`, 확신, 이유가 보인다. "모름"은 `모름`으로 "확인 필요"에 남는다.
  - 보기를 "전체"로 바꾸면 규칙 분류도 보인다. 검토표 CSV에 모든 장소가 들어 있다.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 구현.
- [ ] Step 4: 통과 확인, 전체 테스트(`python tests/run_all.py`).
- [ ] Step 5: Commit.

### Task 4: 초기 사전과 검토 엑셀 (저장소 밖)

- [ ] Step 1: 미분류 687개와 규칙이 2곳 이상으로 본 장소·헷갈리는 키워드 장소 목록을 뽑는다.
- [ ] Step 2: 장소 이름만 보고 분류한다(운임 증거는 보지 않는다).
- [ ] Step 3: Task 1의 함수로 운임 대조를 돌려 일치율을 재고, `다름`을 하나씩 확인한다.
- [ ] Step 4: `trip_scope3.sql` + 사전 insert를 합친 SQL과 검토 엑셀을 만들어 전달한다.
- [ ] Step 5: 사전을 넣은 상태의 연도별 결과를 넣기 전과 비교해 보고한다.

### Task 5: AI 함수 로컬 검증

- [ ] Step 1: Deno를 npm으로 설치할 수 있으면 `deno check`와, 가짜 Supabase·Claude 서버를 붙인 실행으로 권한 확인·분류·사전 기록 흐름을 확인한다.
- [ ] Step 2: 설치할 수 없으면 확인한 범위와 못 한 범위를 그대로 보고한다.
