"""
NIA 환경경영 대시보드 — 공통 테스트 하네스
Playwright headless + Supabase mock routing
"""
import json, re, sys, pathlib

HTML = str(pathlib.Path(__file__).resolve().parent.parent / "index.html")
TS = "2026-09-01T00:00:00+00:00"


# ─── 데이터 헬퍼 ───────────────────────────────────
def erow(i, date, site, typ, amount, ghg=0):
    return dict(id=f"e{i}", date=date, site=site, type=typ,
                amount=amount, ghg=ghg, created_at=TS)

def wrow(i, date, site, ton):
    return dict(id=f"w{i}", date=date, site=site, bag_size=100,
                qty=round(ton * 1000 / 0.174 / 100),
                weight_kg=ton * 1000, weight_ton=ton,
                scope="Scope 3", created_at=TS)


# ─── Mock 라우터 ───────────────────────────────────
class MockRouter:
    """Supabase REST / Auth / 외부 API 가로채기"""

    def __init__(self, energy=None, waste=None, settings=None, metrics=None):
        self.tables = {
            "energy": energy or [],
            "waste": waste or [],
            "env_settings": settings or [],
            "env_metrics": metrics or [],
        }
        self.deletes = []          # DELETE 요청 URL 수집
        self.hold_energy = False   # True 면 /energy 응답을 보류 (스켈레톤 테스트)
        self._held = []

    def _body(self, url):
        m = re.search(r"/rest/v1/([a-z_]+)", url)
        if not m:
            return "[]"
        return json.dumps(self.tables.get(m.group(1), []), ensure_ascii=False)

    def _ok(self, req):
        req.fulfill(
            status=200,
            content_type="application/json",
            headers={"access-control-allow-origin": "*"},
            body=self._body(req.request.url),
        )

    def route(self, req):
        url = req.request.url

        # Supabase REST
        if "supabase.co/rest" in url:
            if req.request.method == "DELETE":
                self.deletes.append(url)
                req.fulfill(status=204, body="")
                return
            if self.hold_energy and "/energy" in url:
                self._held.append(req)
                return
            self._ok(req)
            return

        # Supabase Auth
        if "supabase.co/auth" in url:
            req.fulfill(status=200, content_type="application/json", body="{}")
            return

        # 외부 API (날씨, 폰트)
        if any(x in url for x in ("open-meteo", "fonts.goog", "fonts.gstatic")):
            req.fulfill(status=200, content_type="application/json", body="{}")
            return

        req.continue_()

    def release_energy(self):
        """보류된 /energy 응답 모두 전송"""
        self.hold_energy = False
        for r in self._held:
            self._ok(r)
        self._held.clear()


# ─── 브라우저 + 페이지 열기 ──────────────────────────
def open_page(pw, mock, *, width=1280, height=900, accept_downloads=False,
              device_scale_factor=1, wait_load=True):
    """Chromium 열고 index.html 로드. (br, ctx, page, errors) 반환"""
    br = pw.chromium.launch()
    opts = dict(viewport={"width": width, "height": height},
                locale="ko-KR", timezone_id="Asia/Seoul",
                device_scale_factor=device_scale_factor)
    if accept_downloads:
        opts["accept_downloads"] = True
    ctx = br.new_context(**opts)
    ctx.route("**/*", mock.route)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("file://" + HTML)
    if wait_load:
        page.wait_for_function(
            "getComputedStyle(document.getElementById('loading')).display==='none'",
            timeout=15000,
        )
        page.wait_for_timeout(600)
    return br, ctx, page, errors


# ─── 어서션 유틸 ───────────────────────────────────
_pass = 0
_fail = 0
_current_test = ""


def test_name(name):
    global _current_test
    _current_test = name


def ok(cond, msg=""):
    global _pass, _fail
    label = f"  [{_current_test}] {msg}" if _current_test else f"  {msg}"
    if cond:
        _pass += 1
        print(f"  PASS {label}")
    else:
        _fail += 1
        print(f"  FAIL {label}")


def near(actual, expected, tol=0.05, msg=""):
    """숫자 근사치 비교"""
    if actual is None:
        ok(False, f"{msg} — got None, expected ~{expected}")
        return
    ok(abs(actual - expected) <= tol,
       f"{msg} — got {actual}, expected ~{expected}")


def summary():
    total = _pass + _fail
    print(f"\n  Result: {_pass}/{total} passed, {_fail} failed")
    return _fail == 0


def num_from(page, sel):
    """셀렉터의 텍스트에서 첫 번째 숫자 추출"""
    txt = page.text_content(sel) or ""
    m = re.search(r"[\d,.]+", txt)
    return float(m.group().replace(",", "")) if m else None
