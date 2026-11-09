"""
UX 아이콘 검증
─ 탭 버튼에 SVG <use> 아이콘 존재
─ 탭/서브탭에 이모지 없음
─ KPI 라벨에 SVG 아이콘 존재
─ SVG 스프라이트 심볼 수 확인
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
from playwright.sync_api import sync_playwright

ENERGY = [erow(m, f"2026-{m:02d}", "대구본원", "전력", 100_000 + m)
          for m in range(1, 9)]


def run():
    print("\n=== test_ux_icons ===")
    mock = MockRouter(energy=ENERGY)

    with sync_playwright() as pw:
        br, ctx, p, errs = open_page(pw, mock)

        # ── 탭 아이콘 ──
        test_name("탭 SVG 아이콘")
        has_icons = p.eval_on_selector_all(".tab-btn",
            "bs=>bs.map(b=>!!b.querySelector('svg use'))")
        ok(all(has_icons), f"모든 탭에 SVG use — got {has_icons}")

        tab_texts = p.eval_on_selector_all(".tab-btn",
            "bs=>bs.map(b=>b.textContent.trim().slice(0,8))")
        ok(len(tab_texts) > 0, f"탭 텍스트 존재 — {tab_texts}")

        # ── 이모지 없음 ──
        test_name("이모지 제거")
        has_emoji = p.evaluate("""()=>/[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]/u.test(
            [...document.querySelectorAll('.tab-btn,.subtab-btn')]
            .map(b=>b.textContent).join(''))""")
        ok(has_emoji is False, f"탭/서브탭에 이모지 없음 — has_emoji={has_emoji}")

        # ── KPI 라벨 아이콘 ──
        test_name("KPI 라벨 아이콘")
        kpi_icons = p.eval_on_selector_all("#yv .kpi-label svg use",
            "us=>us.map(u=>u.getAttribute('href'))")
        ok(len(kpi_icons) > 0, f"KPI 아이콘 존재 — {kpi_icons[:4]}")

        # ── 스프라이트 심볼 ──
        test_name("SVG 스프라이트")
        sym_count = p.evaluate("()=>document.querySelectorAll('symbol[id^=i-]').length")
        ok(sym_count >= 25, f"스프라이트 심볼 25개 이상 — got {sym_count}")

        test_name("탭 순회")
        for tab in ("history", "roadmap", "outlook", "input", "manage", "dashboard"):
            p.evaluate(f"()=>document.querySelector('button[data-tab={tab}]')?.click()")
            p.wait_for_timeout(250)
        ok(len(errs) == 0, f"JS 에러 없음 — errors: {errs[:3]}")

        br.close()

    return summary()


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
