"""
CSV 내보내기 검증
─ 실적 조회 → 제주·재생에너지 월별 CSV 다운로드
─ 데이터 관리 → 제주·재생에너지 CSV 다운로드
─ 폐기물 선택 시 항목 필터 숨김
"""
import sys, pathlib, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
from playwright.sync_api import sync_playwright

E = []
i = 0
def _add(d, s, t, a):
    global i; i += 1
    E.append(erow(i, d, s, t, a))

for m in range(1, 13):
    _add(f"2024-{m:02d}", "제주글로벌센터", "재생에너지", 6000 + m * 100)
    _add(f"2024-{m:02d}", "제주글로벌센터", "전력", 90000)
for m in range(1, 7):
    _add(f"2025-{m:02d}", "제주글로벌센터", "재생에너지", 7000 + m * 100)
    _add(f"2025-{m:02d}", "제주글로벌센터", "전력", 88000)
    _add(f"2025-{m:02d}", "대구본원", "재생에너지", 15000)

SETTINGS = [{"key": "closed_years", "value": ["2024"]}]


def run():
    print("\n=== test_export ===")
    mock = MockRouter(energy=E, settings=SETTINGS)
    tmpdir = tempfile.mkdtemp(prefix="nia_test_")

    with sync_playwright() as pw:
        br, ctx, p, errs = open_page(pw, mock, accept_downloads=True)

        # ── ① 실적 조회 → 제주·재생에너지 월별 CSV ──
        test_name("월별 CSV")
        p.evaluate("()=>document.querySelector('button[data-tab=history]').click()")
        p.wait_for_timeout(300)
        p.evaluate("()=>document.querySelector('#nav-site .site-seg button[data-site=\"제주글로벌센터\"]').click()")
        p.wait_for_timeout(300)
        p.evaluate("()=>{const s=document.getElementById('h-cmp-etype');s.value='재생에너지';s.dispatchEvent(new Event('change'))}")
        p.wait_for_timeout(400)

        title = p.text_content("#h-ce-title") or ""
        ok("재생에너지" in title or "제주" in title, f"차트 제목 — got '{title[:40]}'")

        with p.expect_download() as dl:
            p.evaluate("()=>document.getElementById('h-mon-export').click()")
        d = dl.value
        path = f"{tmpdir}/monthly.csv"
        d.save_as(path)
        lines = open(path, encoding="utf-8-sig").read().splitlines()
        ok(len(lines) > 1, f"월별 CSV 행 존재 — {len(lines)} lines")
        ok(".csv" in d.suggested_filename, f"파일명 .csv — got '{d.suggested_filename}'")

        # ── ② 데이터 관리 → 제주·재생에너지 CSV ──
        test_name("관리 CSV")
        p.evaluate("""()=>{
            const set=(id,v)=>{const s=document.getElementById(id);s.value=v;s.dispatchEvent(new Event('change'))};
            set('m-site','제주글로벌센터'); set('m-type','energy'); set('m-item','재생에너지');
        }""")
        p.wait_for_timeout(300)

        item_val = p.eval_on_selector("#m-item", "s=>s.value")
        ok(item_val == "재생에너지", f"항목 필터 — got '{item_val}'")

        with p.expect_download() as dl2:
            p.evaluate("()=>document.getElementById('btn-export').click()")
        d2 = dl2.value
        path2 = f"{tmpdir}/manage.csv"
        d2.save_as(path2)
        mlines = open(path2, encoding="utf-8-sig").read().splitlines()
        ok(len(mlines) > 1, f"관리 CSV 행 존재 — {len(mlines)} lines")

        # CSV에 제주 재생에너지만 있는지
        types_in_csv = sorted(set(l.split('","')[3] for l in mlines[1:] if '","' in l))
        ok(types_in_csv == ["재생에너지"], f"재생에너지만 포함 — got {types_in_csv}")

        # ── ③ 폐기물 선택 시 항목 숨김 ──
        test_name("폐기물 항목 숨김")
        p.evaluate("()=>{const s=document.getElementById('m-type');s.value='waste';s.dispatchEvent(new Event('change'))}")
        p.wait_for_timeout(200)
        hidden = p.eval_on_selector("#m-item", "s=>s.hidden")
        ok(hidden is True, f"항목 필터 숨김 — hidden={hidden}")

        test_name("탭 순회")
        ok(len(errs) == 0, f"JS 에러 없음 — errors: {errs[:3]}")

        br.close()

    return summary()


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
