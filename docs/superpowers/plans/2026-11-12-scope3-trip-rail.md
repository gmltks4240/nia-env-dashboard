# Scope 3 출장(철도) 자동산정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 출장 엑셀을 올리면 철도 행을 행 단위로 판정(A~D)해 Scope 3 배출량을 미리보기·저장·표시한다.

**Architecture:** 산정은 `index.html`의 `/* @trip-start */ … /* @trip-end */` 순수 함수 블록이 맡고(기존 `@model` 블록과 같은 방식), 기준표(운임·거리·판정)는 지연 로딩하는 `data/trip-ref.js`에 둔다. 장소 해석은 내장 키워드 규칙 → `trip_places`(AI·사람 확정) → Edge Function 순으로 채운다. 저장은 Supabase REST.

**Tech Stack:** 단일 `index.html`(바닐라 JS), SheetJS(지연 로딩), Supabase(PostgREST·Edge Function/Deno), Claude API, Playwright(Python) 테스트.

**Spec:** `docs/superpowers/specs/2026-11-12-scope3-trip-rail-design.md`

## Global Constraints

- 철도 계수 0.0219 kgCO₂eq/인·km, 강릉선 권역 0.0716.
- 교통비 0원 행은 제외(`제외` 등급으로 기록), 왕복 1회 상한.
- 동대구–서울 286.7km, 수서–동대구 269.2km, 수서–서대구 261.8km, 운임 역산 151.7원/km(= 43,500 ÷ 286.7), 역산 상한 860.1km.
- 특실 = KTX 일반실 × 1.4, 100원 단위 반올림.
- AI에는 장소명 문자열만 보낸다. API 키는 화면 코드에 넣지 않는다.
- 원본 출장 데이터(장소명 포함)는 저장소에 커밋하지 않는다.
- 화면 문구는 기존 말투(해요체), 아이콘은 SVG 스프라이트, 색·간격은 기존 토큰만 쓴다(`test_design_system.py` 통과).

## 설계서와 달라지는 점

- §4.4 `trip_ref` 테이블 대신 저장소 파일 `data/trip-ref.js`에 기준표를 둔다(적용 기간·버전 포함). git 이력이 변경 기록이 되고, SQL 실행 전에도 미리보기가 동작한다.
- §4.2 사전 탑재(`seed`)는 장소 문자열 3,513개 대신 내장 키워드 규칙으로 한다. 원본 장소명을 저장소에 넣지 않기 위해서다.

## Review Focus

1. 2026-09 이후처럼 판정표에 없는 운임 체계 → 멈추지 않고 D등급으로 산정되어야 한다 (Task 2 테스트).
2. 출발지·목적지가 빈 문자열이거나 숫자인 행 → 오류 없이 C/D로 판정 (Task 2).
3. 시트 머리글이 다른 엑셀(일반 에너지 파일)을 출장 칸에 올림 → 저장 없이 안내 문구 (Task 3).
4. `trip_places` 테이블이 없는 DB(SQL 미실행) → 미리보기는 동작, 저장 때만 안내 (Task 4).
5. AI 함수 404/500/시간 초과 → 미확인 장소로 두고 산정 계속 (Task 4).

---

### Task 1: 기준표 파일

**Files:**
- Create: `tools/build_trip_ref.py` (운임·거리 엑셀 → JS)
- Create: `data/trip-ref.js`

**Interfaces:**
- Produces: `window.TRIP_REF = { version, judgment: [{fare, train, legs, km, kmQ, label}], fares: [{a, b, fare, train}], dist: [[a, b, km]], factors: {rail, gangneung} }`.
  `dist`는 같은 역쌍이면 표1 값 하나만, `fares`는 (a,b,fare) 중복 제거.

- [ ] Step 1: `tools/build_trip_ref.py <운임표.xlsx> <out.js>` 작성 — 시트 `출장운임_판정기준`, `KTX_주요일반실`, `SRT_일반실505`, `공식운행거리1412`를 읽는다.
- [ ] Step 2: 실행해 `data/trip-ref.js` 생성, 판정 14행·거리 역쌍 수·운임 수를 출력으로 확인.
- [ ] Step 3: Commit.

### Task 2: 산정 엔진

**Files:**
- Modify: `index.html` — `/* @model-end */` 뒤에 `/* @trip-start */ … /* @trip-end */` 블록 추가
- Test: `tests/test_trip_rail.py`, `tests/run_all.py`·`tests/README.md`에 등록

**Interfaces:**
- Consumes: `TRIP_REF` (Task 1)
- Produces:
  - `tripBuildRef(REF) → ref` (색인: `one`, `two`, `byCity`, `J`)
  - `tripCities(text, placeMap) → string[]` — `placeMap[text]`가 있으면 그 값, 없으면 내장 키워드 규칙
  - `tripParseSheet(name, grid) → { rows: TripRow[], error }` — `TripRow = {year, seq, date:'YYYY-MM-DD', origin, via, dest, mode, fare}`
  - `classifyRail(row, ref, placeMap) → {grade:'A'|'B'|'C'|'D'|'제외', gradeLabel, legs, km, factor, kg, basis}`
  - `tripSummarize(results) → {byYear: {y: {n, excluded, A,B,C,D, km, kg, kgD}}, byMonth: {'YYYY-MM': {km, kg}}}`

- [ ] Step 1: 실패하는 테스트 작성. 사례와 기대값:
  - 87,000 대구→서울 → A, legs 2, km 573.4, kg 12.557
  - 43,500 서울→서울 → A, legs 1, km 286.7
  - 49,600 대구→세종 → B, legs 2, km 324
  - 80,400 대구→서울 → B, km 555.9 (KTX 43,500 + SRT 36,900)
  - 60,900 대구→서울 → B, legs 1, km 286.7, basis에 '특실'
  - 174,000 대구→서울 → A, legs 2
  - 0원 → 제외, kg 0
  - 77,500 대구→서울(판정표에 없는 새 운임) → D, legs 2, km 573.4
  - 30,000 대구→강릉 → D, factor 0.0716
  - 49,600 `''`→`''` → C 또는 D, 오류 없음
  - 43,100 '비상임감사집무실'→'서울', placeMap {'비상임감사집무실':['대구']} → B
  - `tripParseSheet`: 머리글 3행 + 2행 표본 → rows 2개, 날짜 엑셀 일련번호 45293 → '2024-01-02'; 머리글이 다르면 `error`
- [ ] Step 2: 실행해 실패 확인 (`python tests/test_trip_rail.py`).
- [ ] Step 3: 검토용 스크립트(설계서 §3.5)의 판정 순서를 그대로 JS로 옮긴다.
- [ ] Step 4: 테스트 통과 확인. 실제 4개 연도 파일로 돌려 설계서 §9와 같은지 로컬 대조(파일은 커밋하지 않음).
- [ ] Step 5: Commit.

### Task 3: 업로드·미리보기 화면

**Files:**
- Modify: `index.html` — 입력 탭에 서브탭 `data-sub="trip"`, `#sub-trip` 패널, 스타일, 이벤트
- Test: `tests/test_trip_ui.py`

**Interfaces:**
- Consumes: Task 2 함수, 기존 `loadXlsx`, `showToast`, `canEdit`
- Produces: `tripState = {rows, results, summary, placeMap, unknown}`; `tripRun(file)`; `tripRender()`

- [ ] Step 1: 테스트 — 표본 xlsx를 `#trip-file`에 넣으면 `#trip-summary`에 연도 행과 등급 비율, `#trip-dl`(행별 CSV) 버튼이 나온다. 출장 양식이 아닌 파일이면 `#trip-info`에 안내 문구가 나오고 요약은 비어 있다.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 패널 구현 — 끌어놓기 칸, 진행 문구, 요약표(연도·산정·제외·A~D 비율·만 인·km·tCO₂e), 추정(D) 상위 운임 10개, 미확인 장소 목록, CSV 내보내기.
- [ ] Step 4: 통과 확인, 전체 테스트(`python tests/run_all.py`).
- [ ] Step 5: Commit.

### Task 4: 저장·장소 사전·AI 함수

**Files:**
- Create: `supabase/trip_scope3.sql` (`trip_places`, `trip_batches`, `trip_rows`, RLS — `auth_roles.sql` 방식)
- Create: `supabase/functions/classify-places/index.ts`
- Modify: `index.html` — 장소 조회·AI 호출·저장·사람 확정
- Test: `tests/test_trip_ui.py`에 추가, `tests/harness.py` MockRouter에 `trip_*` 표와 `/functions/v1/` 응답

**Interfaces:**
- Edge Function: `POST /functions/v1/classify-places {places: string[]}` → `{results: [{raw, points: string[], confidence, reason}]}`; 허용 코드 밖 값은 `points: []`, `confidence: 'unknown'`.
- `tripLoadPlaces(raws) → placeMap`; `tripAskAI(raws) → placeMap 추가분`(실패 시 `{}`); `tripSave()`.
- `env_metrics` 항목: `item = '출장_철도_kgCO2e'`, `'출장_철도_인km'`, `site = '전사'`, `period = 'YYYY-MM'`.

- [ ] Step 1: 테스트 — (a) AI 함수가 500이면 요약이 그대로 나오고 미확인 목록에 장소가 남는다. (b) AI 응답이 오면 미확인이 줄고 등급이 바뀐다. (c) 저장을 누르면 `trip_batches` 1건, `trip_rows`, `env_metrics` POST가 나간다. (d) `trip_places` 조회가 404면 미리보기는 동작하고 저장 때 SQL 안내가 나온다. (e) 미확인 장소에 지점을 지정하면 `trip_places`에 `source: 'human'` POST 후 재산정된다.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: SQL·함수·화면 구현.
- [ ] Step 4: 통과 확인, 전체 테스트.
- [ ] Step 5: Commit.

### Task 5: 대시보드 표시

**Files:**
- Modify: `index.html` — Scope 3 카드·근거 패널에 출장(철도) 추가
- Test: `tests/test_trip_ui.py`에 추가

- [ ] Step 1: 테스트 — `env_metrics`에 `출장_철도_kgCO2e` 값이 있으면 Scope 3 카드 보조 문구에 출장(철도) 톤수가 보이고, 근거 패널에 산식과 계수(0.0219)가 나온다. 값이 없으면 기존 화면과 같다.
- [ ] Step 2: 실패 확인 → 구현 → 통과 → 전체 테스트.
- [ ] Step 3: Commit, push.
