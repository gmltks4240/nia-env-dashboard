# NIA 환경경영 대시보드 — 작업 규칙

## 사용자와 일하는 방식

- **한국어로, 짧게** 답한다. 300자 이내 요청이 잦다. 사용자는 비개발자다.
- **작업이 끝나면 항상 마지막에 정리를 붙인다** (2026-11-21 사용자 규칙):
  - **한 일** — 무엇을 고쳤는지
  - **결과** — 실제 수치·테스트 결과. 추측이 아니라 확인한 값
  - **지금 위치** — 어느 작업이 끝났고 다음이 무엇인지
- 근거를 묶어서 쓰면 이해하지 못한다. 장소마다 "무엇을 보고 판단했는지"와 "실제 출장 기록·교통비"를 함께 보여 준다.
- **완료된 것과 가정한 것을 구분해 말한다.** 자기소개서용 정리에서 여러 번 문제가 됐다.
- 중간 상태를 자주 보고하면 어느 것이 최신인지 헷갈린다. 작업이 끝날 때 보고한다.
- 내부 자료의 건수를 외부 문서에 쓰는 것은 사용자가 확인해야 한다.

## 이 저장소

- `index.html`(화면 뼈대) + `css/app.css` + `js/*.js` 로 나뉘어 있다. 불러오는 순서가 중요하고,
  `index.html` 에 적힌 순서(`core` → … → `main`)대로 돈다. 최상위 `const`·`let`·`function` 은 모든 파일이 함께 쓴다.
  **새 js·css 파일을 만들면 `index.html` 에 `<script>`·`<link>` 를 넣고 `python tools/bump_version.py` 를 돌린다**(`?v=` 해시).
- Scope 3 출장은 파일 3개다. `js/manage.js` 뒤, `js/main.js` 앞에서 이 순서로 불러온다:
  - `js/trip-data.js` — 운임·거리·판정 기준표 등 생성된 데이터. **사람이 고치지 않는다**(도구가 덮어쓴다)
  - `js/trip-engine.js` — 산정·분류 엔진(순수 함수). 화면·DB 를 건드리지 않는다
  - `js/trip-ui.js` — 화면(올리기·검토표·저장)
- **원본 장소명을 커밋하지 않는다.** 장소 사전은 Supabase(비공개). `js/trip-data.js` 의 블록에는 도시·금액·구간·설명만 넣는다.
- 출장 산정 엔진은 `js/trip-engine.js` 전체(`/* @trip-start */ … /* @trip-end */`)다.
  `tests/test_trip_rail.py` 와 `tools/build_trip_seen.py` 가 이 파일을 그대로 읽어 브라우저에 넣고 돌린다.
- `js/trip-data.js` 의 생성 블록은 직접 고치지 않는다: `@trip-ref`(`tools/build_trip_ref.py`) ·
  `@trip-fare`(`build_trip_fares.py`) · `@trip-seen`(`build_trip_seen.py`). `@trip-labels` 는 직접 추가한다.
  도구에 넘기는 대상 파일은 이제 `index.html` 이 아니라 `js/trip-data.js` 다.

## 테스트

- 실행: `python tests/run_all.py`
- `pip install playwright==1.63.0` — **다른 버전은 미리 설치된 브라우저를 못 찾는다. `playwright install` 금지.**
- 엑셀 읽기: `pip install xlrd openpyxl`

## 문서

- 설계서·계획서는 `docs/superpowers/{specs,plans}/` 에 둔다.
- 인수인계는 `docs/HANDOFF-trip-scope3.md`. 세션이 바뀌면 이것부터 읽는다.
- 결정은 **근거와 날짜를 함께** 남긴다. 같은 결정이 뒤집힌 적이 있어(60,900원) 경위를 적어 두지 않으면 또 뒤집힌다.
