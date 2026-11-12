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

## 종료 코드

- `0` — 전체 통과
- `1` — 실패 있음
