# NIA 환경경영 대시보드 — 테스트

Playwright headless 기반 E2E 테스트. Supabase를 mock하여 로컬에서 실행 가능.

## 사전 준비

```bash
pip install playwright
playwright install chromium
```

## 실행

```bash
# 전체 실행
python tests/run_all.py

# 개별 실행
python tests/test_ghg_factors.py
```

## 테스트 목록

| 파일 | 검증 내용 |
|------|-----------|
| `test_ghg_factors.py` | 배출계수 계산 (전력·도시가스·지역난방·휘발유·경유), Scope 1/2 합계, 폐기물 사업장별 계수 |
| `test_factor_log.py` | 배출계수 현행 테이블, 변경이력 표시 |
| `test_official_ghg.py` | 공식 GHG 저장값, 마감연도, 연도별 이력 |
| `test_export.py` | CSV 다운로드 (실적 조회, 데이터 관리), 항목 필터 |
| `test_ux_icons.py` | SVG 아이콘 적용, 이모지 제거, 스프라이트 심볼 |
| `test_ux_behavior.py` | 인라인 오류, 저장 버튼 로딩, 오프라인 배너 |
| `test_forecast.py` | 기상연동 예측 모델 (같은 달 평균·기온 민감도 복원·추세 보정·추세 상한·학습연도 1개) — 화면 없이 모델 함수만 검증 |
| `test_design_system.py` | 디자인 시스템 규칙 (반픽셀 글자 금지·모서리 둥글기 가족·transition 토큰과 곡선·움직임 줄이기) — 화면 없이 CSS 선언만 검사 |
| `test_skeleton_rings.py` | 스켈레톤 로딩, RE100/EV 링, 삭제·되돌리기·확정 |
| `test_keyboard.py` | 버튼처럼 동작하는 카드·줄이 Tab 으로 닿고, Enter·Space 가 클릭과 같고, 포커스 테두리가 보이는지 |
| `test_trip_rail.py` | 출장(철도) Scope 3 산정 (판정 등급 A~D·A 확대 기준(운임표·반복 확인·자유석·선이동)·거리·계수·0원 제외·왕복 횟수·강릉선 역 추정·기간별 운임표·정차역 할인·좌석 종류·장소 키워드·장소 사전·엑셀 시트 읽기·운임 대조) — 화면 없이 `js/trip-engine.js` 만 검증 |
| `test_trip_ui.py` | 출장(Scope 3) 화면 — 업로드·요약, 장소 분류 검토표(출처·확신·운임 대조·보기·CSV), AI 분류 함수(실패·응답·모름·50개씩 묶음), 사람 확정, 장소 사전 읽기(편집자만·1,000줄 이상), 저장, SQL 실행 전, Scope 3 카드 |

## GitHub 에서 자동 실행

`.github/workflows/tests.yml` — PR 을 올리거나 `main` 에 합칠 때마다 위 전체가 돌고,
결과가 PR 화면에 ✓ / ✗ 로 뜹니다. 실패한 채로 합치지 못하게 하려면 저장소
**Settings → Rules → Rulesets** 에서 `main` 에 "Require status checks to pass" 를 켜고 `tests` 를 고르면 됩니다.

## 종료 코드

- `0` — 전체 통과
- `1` — 실패 있음
