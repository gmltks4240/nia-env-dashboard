"""
온실가스 배출계수 정확성 검증
─ 전력·도시가스·지역난방·휘발유·경유 각 1건 투입 → KPI 카드 수치 확인
─ 폐기물 사업장별 계수(대구 0.477, 제주 1.138, 서울 미산정) 확인
─ Scope 1/2 합계 확인
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
from playwright.sync_api import sync_playwright

# ── 테스트 데이터 ──
# 대구본원: 전력 1,000,000 kWh / 도시가스 10,000 Nm³ / 지역난방 1,000 GJ / 휘발유·경유 각 1,000 L
ENERGY = [
    erow(1, "2026-01", "대구본원", "전력",     1_000_000),
    erow(2, "2026-01", "대구본원", "도시가스",  10_000),
    erow(3, "2026-01", "대구본원", "지역난방",  1_000),
    erow(4, "2026-01", "대구본원", "휘발유",    1_000),
    erow(5, "2026-01", "대구본원", "경유",      1_000),
    erow(6, "2026-01", "제주글로벌센터", "전력", 500_000),
]
WASTE = [wrow(1, "2026-01", "대구본원", 1.0),
         wrow(2, "2026-01", "제주글로벌센터", 1.0),
         wrow(3, "2026-01", "서울사무소", 1.0)]
SETTINGS = [{"key": "closed_years", "value": ["2025"]}]

# 기대값 (hardcoded factors)
EXP_ELEC   = 1_000_000 * 0.0004594106       # 459.4106
EXP_GAS    = 10_000    * 0.0021649672212     # 21.6497
EXP_HEAT   = 1_000     * 0.0481938763        # 48.1939
EXP_GASOL  = 1_000     * 0.002176470768      #  2.1765
EXP_DIESEL = 1_000     * 0.0026613886511     #  2.6614
EXP_S1     = EXP_GAS + EXP_GASOL + EXP_DIESEL  # 26.488
EXP_S2     = EXP_ELEC + EXP_HEAT               # 507.604
EXP_TOTAL  = EXP_S1 + EXP_S2                   # 534.092

EXP_WASTE_DAEGU = 1.0 * 0.477114  # 0.477
EXP_WASTE_JEJU  = 1.0 * 1.138357  # 1.138


def run():
    print("\n=== test_ghg_factors ===")
    mock = MockRouter(energy=ENERGY, waste=WASTE, settings=SETTINGS)

    with sync_playwright() as pw:
        br, ctx, p, errs = open_page(pw, mock)

        # ── 대구본원 (기본 선택) ──
        test_name("대구 배출량")
        near(num_from(p, "#k-total"),      EXP_TOTAL, 0.5, "총 배출량")
        near(num_from(p, "#k-s1"),         EXP_S1,    0.5, "Scope 1")
        near(num_from(p, "#k-s2"),         EXP_S2,    0.5, "Scope 2")
        near(num_from(p, "#k-elec-co2"),   EXP_ELEC,  0.5, "전력 CO₂")
        near(num_from(p, "#k-gas-co2"),    EXP_GAS,   0.5, "도시가스 CO₂")
        near(num_from(p, "#k-heat-co2"),   EXP_HEAT,  0.5, "지역난방 CO₂")
        near(num_from(p, "#k-gasoline-co2"), EXP_GASOL, 0.5, "휘발유 CO₂")
        near(num_from(p, "#k-diesel-co2"),   EXP_DIESEL, 0.5, "경유 CO₂")

        test_name("대구 폐기물")
        near(num_from(p, "#k-waste-vol-co2"), EXP_WASTE_DAEGU, 0.01, "폐기물 CO₂")

        # ── 제주 ──
        test_name("제주 폐기물")
        p.evaluate("()=>document.querySelector('#nav-site .site-seg button[data-site=\"제주글로벌센터\"]').click()")
        p.wait_for_timeout(400)
        near(num_from(p, "#k-waste-vol-co2"), EXP_WASTE_JEJU, 0.01, "폐기물 CO₂")

        # ── 서울 (미산정) ──
        test_name("서울 폐기물 미산정")
        p.evaluate("()=>document.querySelector('#nav-site .site-seg button[data-site=\"서울사무소\"]').click()")
        p.wait_for_timeout(400)
        txt = p.text_content("#k-waste-vol-co2") or ""
        ok("미산정" in txt, f"서울 폐기물 미산정 표기 — got '{txt}'")

        # ── 탭 순회 오류 확인 ──
        test_name("탭 순회")
        for tab in ("history", "roadmap", "outlook", "input", "dashboard"):
            p.evaluate(f"()=>document.querySelector('button[data-tab={tab}]')?.click()")
            p.wait_for_timeout(300)
        ok(len(errs) == 0, f"JS 에러 없음 — errors: {errs[:3]}")

        br.close()

    return summary()


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
