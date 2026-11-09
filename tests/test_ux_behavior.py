"""
UX 동작 검증
─ 인라인 오류: 숫자 아닌 값 입력 → 에러 표시 → 수정 시 해제
─ 저장 버튼 로딩 상태 (is-busy)
─ 오프라인 배너 표시/해제
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
from playwright.sync_api import sync_playwright

ENERGY = [erow(m, f"2026-{m:02d}", "대구본원", "전력", 100_000 + m)
          for m in range(1, 9)]


def run():
    print("\n=== test_ux_behavior ===")
    mock = MockRouter(energy=ENERGY)

    with sync_playwright() as pw:
        br, ctx, p, errs = open_page(pw, mock)

        # ── 인라인 오류 ──
        test_name("인라인 오류")
        p.evaluate("""()=>{
            document.body.dataset.role='admin';
            document.querySelector('button[data-tab=input]').click()
        }""")
        p.wait_for_timeout(300)

        p.evaluate("""()=>{
            const set=(id,v)=>{const s=document.getElementById(id);
                if(!s) return; s.value=v; s.dispatchEvent(new Event('change'))};
            set('e-year','2026'); set('e-site','대구본원'); set('e-type','전력');
        }""")
        p.wait_for_timeout(300)

        # 3월에 'abc' 입력 → 저장
        p.evaluate("""()=>{
            const i=document.querySelector('#energy-tbody tr[data-month="03"] [data-field="amount"]');
            i.value='abc';
            document.getElementById('e-save').click();
        }""")
        p.wait_for_timeout(300)

        err_text = p.evaluate("""()=>{
            const e=document.querySelector('#e-save').closest('.save-row').querySelector('.inline-err');
            return e && !e.hidden ? e.textContent.trim() : null
        }""")
        ok(err_text is not None, f"오류 메시지 표시 — got '{err_text}'")

        has_invalid = p.evaluate("""()=>document.querySelector(
            '#energy-tbody tr[data-month="03"] [data-field="amount"]'
        ).classList.contains('is-invalid')""")
        ok(has_invalid is True, "셀 is-invalid 클래스")

        # 값 수정 → 오류 해제
        p.evaluate("""()=>{
            const i=document.querySelector('#energy-tbody tr[data-month="03"] [data-field="amount"]');
            i.value='100003'; i.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        p.wait_for_timeout(150)

        err_cleared = p.evaluate("""()=>{
            const e=document.querySelector('#e-save').closest('.save-row').querySelector('.inline-err');
            return !e || e.hidden
        }""")
        ok(err_cleared is True, "수정 후 오류 해제")

        # ── 저장 버튼 로딩 ──
        test_name("저장 버튼 busy")
        st = p.evaluate("""()=>{
            const i=document.querySelector('#energy-tbody tr[data-month="09"] [data-field="amount"]');
            i.value='120000';
            const b=document.getElementById('e-save'); b.click();
            return {busy:b.classList.contains('is-busy'), disabled:b.disabled,
                    aria:b.getAttribute('aria-busy')}
        }""")
        ok(st.get("busy") is True, f"클릭 직후 is-busy — got {st}")
        ok(st.get("disabled") is True, "클릭 직후 disabled")

        p.wait_for_timeout(1200)
        after = p.evaluate("""()=>{
            const b=document.getElementById('e-save');
            return {busy:b.classList.contains('is-busy'), disabled:b.disabled}
        }""")
        ok(after.get("busy") is False, "완료 후 is-busy 해제")

        # ── 오프라인 배너 ──
        test_name("오프라인 배너")
        p.evaluate("()=>document.querySelector('button[data-tab=dashboard]').click()")
        p.wait_for_timeout(200)

        initial = p.eval_on_selector("#net-banner", "b=>b.hidden")
        ok(initial is True, "초기 배너 숨김")

        ctx.set_offline(True)
        p.wait_for_timeout(400)
        offline = p.evaluate("""()=>{
            const b=document.getElementById('net-banner');
            return {hidden:b.hidden, msg:document.getElementById('net-msg').textContent}
        }""")
        ok(offline.get("hidden") is False, "오프라인 시 배너 표시")
        ok("연결" in (offline.get("msg") or ""), f"배너 메시지 — got '{offline.get('msg')}'")

        ctx.set_offline(False)
        p.wait_for_timeout(2500)
        after_online = p.eval_on_selector("#net-banner", "b=>b.hidden")
        ok(after_online is True, "온라인 복귀 후 배너 숨김")

        test_name("JS 에러")
        ok(len(errs) == 0, f"JS 에러 없음 — errors: {errs[:3]}")

        br.close()

    return summary()


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
