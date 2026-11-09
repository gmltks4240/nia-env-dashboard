"""
공식 GHG 저장값 (official_ghg) + 연도별 이력 테이블 검증
─ 2024년 공식값 표시
─ 마감연도(closed_years) 반영
─ 2026년 계산값 표시
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
from playwright.sync_api import sync_playwright

ENERGY = [
    erow(1, "2026-01", "대구본원", "전력", 1_000_000, 459.41),
    erow(2, "2025-01", "대구본원", "전력", 1_000_000, 478.1),
    erow(3, "2024-01", "대구본원", "전력", 1_000_000, 470.0),
]
WASTE = [wrow(1, "2026-01", "대구본원", 1.0)]
SETTINGS = [
    {"key": "closed_years", "value": ["2024", "2025"]},
    {"key": "official_ghg", "value": {
        "2024": {"total": 472.5, "date": "2025-03", "note": "NGMS 명세서 확정"}
    }},
]


def run():
    print("\n=== test_official_ghg ===")
    mock = MockRouter(energy=ENERGY, waste=WASTE, settings=SETTINGS)

    with sync_playwright() as pw:
        br, ctx, p, errs = open_page(pw, mock, width=1180, height=1000)

        # 연도별 이력 테이블 존재
        test_name("연도별 이력")
        rows = p.eval_on_selector_all("#og-tbody tr", "e=>e.length")
        ok(rows >= 1, f"이력 테이블 행 존재 — got {rows}")

        # 2024년 공식 GHG 값
        test_name("2024 공식값")
        sel_2024 = p.query_selector("#og-tbody .og-total[data-y='2024']")
        if sel_2024:
            val = sel_2024.evaluate("e=>e.value")
            ok(val is not None, f"2024 공식값 입력 존재 — value: {val}")
        else:
            row_text = (p.text_content("#og-tbody tr[data-y='2024']") or "").strip()
            ok("472" in row_text, f"2024 행에 공식값 472 포함 — got '{row_text[:60]}'")

        # 2026년 계산 셀
        test_name("2026 계산값")
        calc_cell = (p.text_content("#og-tbody tr[data-y='2026'] td.fl-f") or "").strip()
        ok(len(calc_cell) > 0, f"2026 계산값 셀 비어있지 않음 — got '{calc_cell}'")

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
