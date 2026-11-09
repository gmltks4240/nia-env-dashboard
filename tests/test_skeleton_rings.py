"""
스켈레톤 로딩 + 링 차트 + 삭제/되돌리기 검증
─ 데이터 로딩 전 스켈레톤 표시
─ RE100 링 차트 렌더링
─ EV(친환경차) 링 차트 렌더링
─ 행 삭제 → 스낵바 → 되돌리기 → 확정 삭제
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
from playwright.sync_api import sync_playwright

E = []
for m in range(1, 11):
    E.append(erow(len(E)+1, f"2026-{m:02d}", "대구본원", "전력", 240_000))
    E.append(erow(len(E)+1, f"2026-{m:02d}", "대구본원", "재생에너지", 12_000))
E.append(dict(id="b1", date="2026-03", site="대구본원", type="재생에너지 구매",
              amount=250_000, ghg=0, created_at=TS))
METRICS = [
    dict(id="m1", period="2026", site="대구본원", item="업무용 차량", value=7, created_at=TS),
    dict(id="m2", period="2026", site="대구본원", item="친환경차", value=3, created_at=TS),
]


def run():
    print("\n=== test_skeleton_rings ===")
    mock = MockRouter(energy=E, metrics=METRICS)
    mock.hold_energy = True

    with sync_playwright() as pw:
        br, ctx, p, errs = open_page(pw, mock, wait_load=False)
        p.wait_for_timeout(700)

        # ── 스켈레톤 ──
        test_name("스켈레톤")
        sk_visible = p.evaluate("""()=>
            getComputedStyle(document.getElementById('loading')).display!=='none'
            && !!document.querySelector('#loading .sk-card')""")
        ok(sk_visible is True, "스켈레톤 카드 표시")

        sk_blocks = p.evaluate("()=>document.querySelectorAll('#loading .sk-b').length")
        ok(sk_blocks >= 3, f"스켈레톤 블록 3개 이상 — got {sk_blocks}")

        # 데이터 릴리스
        mock.release_energy()
        p.wait_for_function(
            "getComputedStyle(document.getElementById('loading')).display==='none'",
            timeout=15000)
        p.wait_for_timeout(600)

        # ── 링 차트 ──
        test_name("RE100 링")
        p.evaluate("()=>document.querySelector('button[data-tab=dashboard]').click()")
        p.wait_for_timeout(400)

        re_ring = p.evaluate("""()=>{
            const s=document.querySelector('#re-chart svg.tg-ring');
            return s ? {arcs:s.querySelectorAll('circle').length,
                        center:s.querySelector('text')?.textContent,
                        aria:s.getAttribute('aria-label')} : null
        }""")
        ok(re_ring is not None, "RE100 링 SVG 존재")
        if re_ring:
            ok(re_ring.get("arcs", 0) >= 2, f"링 원호 2개 이상 — got {re_ring['arcs']}")
            ok(re_ring.get("center") is not None, f"링 중앙 텍스트 — got '{re_ring.get('center')}'")

        test_name("EV 링")
        ev_ring = p.evaluate("""()=>{
            const s=document.querySelector('#k-ev-bar svg.tg-ring');
            return s ? {aria:s.getAttribute('aria-label')} : null
        }""")
        ok(ev_ring is not None, "EV 링 SVG 존재")

        ev_sub = p.text_content("#k-ev-sub") or ""
        ok(len(ev_sub) > 0, f"EV 부가 텍스트 — got '{ev_sub[:30]}'")

        # ── 삭제/되돌리기 ──
        test_name("삭제·되돌리기")
        p.evaluate("""()=>{
            document.body.dataset.role='admin';
            document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));
            document.getElementById('tab-manage').classList.add('active');
        }""")
        p.wait_for_timeout(200)

        # 연도 필터 해제
        p.evaluate("()=>{const s=document.getElementById('m-year');s.value='';s.dispatchEvent(new Event('change'))}")
        p.wait_for_timeout(300)

        n0 = p.evaluate("()=>document.querySelectorAll('#manage-tbody .btn-del').length")
        first_id = p.evaluate("()=>document.querySelector('#manage-tbody .btn-del').dataset.id")

        # 삭제 클릭
        p.evaluate("()=>document.querySelector('#manage-tbody .btn-del').click()")
        p.wait_for_timeout(250)

        n1 = p.evaluate("()=>document.querySelectorAll('#manage-tbody .btn-del').length")
        ok(n1 < n0, f"행 숨김 — {n0}→{n1}")

        gone = p.evaluate(f"()=>!document.querySelector('#manage-tbody .btn-del[data-id=\"{first_id}\"]')")
        ok(gone is True, "삭제된 행 DOM에서 제거")

        # 스낵바
        snack = p.evaluate("""()=>({
            hidden:document.getElementById('snackbar').hidden,
            msg:document.getElementById('sn-msg').textContent
        })""")
        ok(snack.get("hidden") is False, "스낵바 표시")
        ok(len(snack.get("msg", "")) > 0, f"스낵바 메시지 — '{snack.get('msg')}'")

        # 되돌리기
        p.evaluate("()=>document.getElementById('sn-undo').click()")
        p.wait_for_timeout(300)
        n2 = p.evaluate("()=>document.querySelectorAll('#manage-tbody .btn-del').length")
        ok(n2 == n0, f"되돌리기 후 행 복원 — {n2}")

        sn_hidden = p.evaluate("()=>document.getElementById('snackbar').hidden")
        ok(sn_hidden is True, "되돌리기 후 스낵바 숨김")

        ok(len(mock.deletes) == 0, f"되돌리기 후 DELETE 미전송 — {len(mock.deletes)}")

        # 6초 후에도 DELETE 없음
        p.wait_for_timeout(6500)
        ok(len(mock.deletes) == 0, f"6초 후에도 DELETE 없음 — {len(mock.deletes)}")

        # 확정 삭제
        test_name("확정 삭제")
        p.evaluate("()=>document.querySelector('#manage-tbody .btn-del').click()")
        p.wait_for_timeout(6800)
        ok(len(mock.deletes) > 0, f"확정 삭제 DELETE 전송 — {len(mock.deletes)}")

        del_hidden = p.evaluate("()=>document.getElementById('snackbar').hidden")
        ok(del_hidden is True, "확정 삭제 후 스낵바 숨김")

        test_name("JS 에러")
        ok(len(errs) == 0, f"JS 에러 없음 — errors: {errs[:3]}")

        br.close()

    return summary()


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
