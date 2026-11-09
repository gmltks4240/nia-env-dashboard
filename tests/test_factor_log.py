"""
배출계수 변경이력 (ghg_factor_log) UI 검증
─ 현행 계수 테이블 표시 확인
─ 변경이력 목록 표시 확인
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
from playwright.sync_api import sync_playwright

ENERGY = [erow(1, "2026-01", "대구본원", "전력", 1_000_000)]
WASTE = [wrow(1, "2026-01", "대구본원", 1.0)]
SETTINGS = [
    {"key": "ghg_factor_log", "value": [
        {"date": "2025-01", "note": "NGMS 유효계수로 개정", "by": "테스트",
         "at": "2026-11-06T00:00:00Z", "factors": {}}
    ]}
]


def run():
    print("\n=== test_factor_log ===")
    mock = MockRouter(energy=ENERGY, waste=WASTE, settings=SETTINGS)

    with sync_playwright() as pw:
        br, ctx, p, errs = open_page(pw, mock)

        # 현행 계수 테이블
        test_name("현행 계수 표")
        rows = p.eval_on_selector_all("#fl-now tr", "els=>els.length")
        ok(rows >= 5, f"계수 테이블 5행 이상 — got {rows}")

        first_text = (p.text_content("#fl-now tr:first-child") or "").strip()
        ok("전력" in first_text or "kWh" in first_text,
           f"첫 행에 전력/kWh — got '{first_text[:40]}'")

        power_cell = (p.text_content("#fl-now tr:first-child .fl-f") or "").strip()
        ok("0.000459" in power_cell or "0.4594" in power_cell,
           f"전력 계수값 표시 — got '{power_cell}'")

        # 변경이력 목록
        test_name("변경이력 목록")
        list_text = (p.text_content("#fl-list") or "").strip()
        ok("NGMS" in list_text or "개정" in list_text,
           f"이력 텍스트 — got '{list_text[:60]}'")

        # 탭 순회
        test_name("탭 순회")
        for tab in ("history", "roadmap", "outlook", "input", "manage", "dashboard"):
            p.evaluate(f"()=>document.querySelector('button[data-tab={tab}]')?.click()")
            p.wait_for_timeout(250)
        ok(len(errs) == 0, f"JS 에러 없음 — errors: {errs[:3]}")

        br.close()

    return summary()


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
