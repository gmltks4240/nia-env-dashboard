"""
키보드로 쓸 수 있는가
─ 버튼처럼 동작하는 카드·줄(role="button", tr[data-rmpop])이 Tab 으로 닿는다 (tabindex 0)
─ Enter · Space 가 클릭과 같은 일을 한다 (계산 근거 열기 · 다른 화면으로 가기)
─ Tab 으로 왔을 때 포커스 테두리가 보인다

진짜 <button> 이 아닌 요소는 키 처리를 따로 해 줘야 한다 (js/main.js 의 keydown 위임).
이 테스트는 그 위임이 빠지거나 tabindex 가 사라졌을 때 알려 준다.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
from playwright.sync_api import sync_playwright

SITES = ["대구본원", "제주글로벌센터", "서울사무소"]
ENERGY = ([erow(m * 10 + k, f"2026-{m:02d}", s, "전력", 100_000 + m * 1000 + k * 5000, 10 + k)
           for m in range(1, 9) for k, s in enumerate(SITES)]
          + [erow(900 + m, f"2026-{m:02d}", "대구본원", "도시가스", 40_000 + m * 700, 8) for m in range(1, 9)]
          + [erow(800 + m, f"2025-{m:02d}", "대구본원", "전력", 98_000 + m * 900, 10) for m in range(1, 13)])
WASTE = [wrow(m, f"2026-{m:02d}", "대구본원", 3 + m * 0.4) for m in range(1, 9)]

CALC_OPEN = "getComputedStyle(document.getElementById('calc')).display !== 'none'"
ACTIVE_TAB = "document.querySelector('.tab-btn.active')?.dataset.tab"


def go(p, tab):
    p.evaluate(f"document.querySelector('.tab-btn[data-tab={tab}]').click()")
    p.wait_for_timeout(500)


def close_calc(p):
    p.keyboard.press("Escape")
    p.wait_for_timeout(150)


def run():
    mock = MockRouter(energy=ENERGY, waste=WASTE)

    with sync_playwright() as pw:
        br, ctx, p, errs = open_page(pw, mock)

        # ── Tab 으로 닿는가 ──
        test_name("Tab 으로 닿음")
        for tab in ("home", "dashboard", "history", "roadmap", "outlook"):
            go(p, tab)
            p.evaluate(f"document.querySelectorAll('#tab-{tab} details:not([open])').forEach(d => d.open = true)")
            p.wait_for_timeout(200)
            miss = p.evaluate(f"""() => [...document.querySelectorAll(
                    '#tab-{tab} [role="button"], #tab-{tab} tr[data-rmpop]')]
                .filter(e => e.offsetParent && !e.classList.contains('kpi-placeholder') && e.tabIndex < 0)
                .map(e => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 20))""")
            ok(not miss, f"{tab}: 버튼 역할 요소가 모두 tabindex 0 — 빠진 것 {miss or '없음'}")

        # ── Enter · Space = 클릭 ──
        test_name("Enter · Space")
        go(p, "dashboard")
        for key in ("Enter", "Space"):
            p.focus("#sec-ghg .kpi-total")
            p.keyboard.press(key)
            p.wait_for_timeout(250)
            ok(p.evaluate(CALC_OPEN), f"올해 현황 총 온실가스 카드: {key} → 계산 근거 열림")
            close_calc(p)
            ok(not p.evaluate(CALC_OPEN), f"Escape → 계산 근거 닫힘 ({key} 뒤)")

        go(p, "outlook")
        p.focus("#tab-outlook tr[data-rmpop]")
        p.keyboard.press("Enter")
        p.wait_for_timeout(250)
        ok(p.evaluate(CALC_OPEN), "전망 표의 한 해(tr): Enter → 그 해 계산 근거 열림")
        close_calc(p)

        go(p, "home")
        has_go = p.evaluate("!!document.querySelector('#tab-home [data-go][role=\"button\"]')")
        ok(has_go, "메인에 다른 화면으로 가는 줄(data-go)이 있음")
        if has_go:
            p.focus('#tab-home [data-go][role="button"]')
            p.keyboard.press("Enter")
            p.wait_for_timeout(400)
            ok(p.evaluate(ACTIVE_TAB) != "home", f"메인의 줄: Enter → 다른 화면으로 감 ({p.evaluate(ACTIVE_TAB)})")

        # ── Tab 으로 왔을 때 포커스 테두리 ──
        test_name("포커스 표시")
        go(p, "dashboard")
        p.focus("#tc-wt")                      # 목표 카드 마지막 → Tab 이면 다음 카드
        p.keyboard.press("Shift+Tab")          # 키보드로 옮겨야 :focus-visible 이 켜짐
        st = p.evaluate("""() => { const a = document.activeElement, s = getComputedStyle(a);
            return { visible: a.matches(':focus-visible'), outline: s.outlineStyle, w: s.outlineWidth,
                     who: a.id || a.className } }""")
        ok(st["visible"] and st["outline"] != "none" and st["w"] != "0px",
           f"키보드 포커스에 테두리가 보임 — {st}")

        ok(not errs, f"페이지 오류 없음 — {errs[:2] if errs else '0건'}")
        br.close()

    return summary()


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
