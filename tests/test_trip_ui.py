"""
출장(Scope 3 · 철도) 화면 검증
─ 출장 엑셀 → 연도별 요약 · 분류하지 못한 장소 · 추정(D) 상위 운임
─ 출장 양식이 아닌 파일은 안내만
─ 장소 분류 검토표: 출처(사람·AI·규칙)·확신·이유·운임 대조 · '다름'이 맨 위 · 보기 바꾸기 · CSV
─ AI 분류 함수: 실패해도 산정은 계속 · 응답이 오면 장소가 풀림 · '모름'은 다시 묻지 않음 · 50개씩 나눠 보냄
─ 사람이 지점을 지정하면 장소 사전에 저장하고 다시 계산
─ 장소 사전: 로그인한 편집자만 읽음 · 1,000줄 넘어도 끝까지 읽음
─ 저장: 묶음 → 행 → 이전 묶음 교체 · 표가 없으면(SQL 실행 전) 미리보기만
─ 대시보드 Scope 3 카드에 출장(철도) 표시

엑셀은 실제로 읽지 않고, 파일 내용을 JSON({시트: 2차원 배열})으로 주는 가짜 XLSX 로 대신한다.
"""
import json
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
from playwright.sync_api import sync_playwright

HEAD = [
    ["관내출장현황"] + [""] * 12,
    ["번호", "출장시간", "", "출장일수", "", "출발지", "경유지", "목적지", "교통편", "왕복거리[KM]", "연비", "유가", "교통비"],
    ["부서코드", "출장시작일", "출장종료일", "박", "일", "출발지", "경유지", "목적지", "교통편", "왕복거리[KM]", "연비", "유가", "교통비"],
]


def trip(i, serial, o, d, mode, fare):
    return [i, serial, serial, "0", "1", o, "", d, mode, 0, 0, 0, fare]


# 2025-01-02 = 45659
SHEET_2025 = HEAD + [
    trip(1, 45659, "대구", "서울", "철도운임", 87000),          # A
    trip(2, 45659, "대구", "세종", "철도운임", 40000),          # B (서대구 입석 — 좌석 종류 가정 · 추정 거리라 A 아님, 2026-11-20 재정의)
    trip(3, 45660, "대구", "서울", "철도운임", 0),              # 제외
    trip(4, 45660, "비상임감사집무실", "서울", "철도운임", 43100),   # 장소 미분류 → C
    trip(5, 45690, "대구", "서울", "철도운임", 70010),          # D
    trip(6, 45690, "제주", "서울", "항공운임", 86700),          # 미산정
]
FILE = json.dumps({"2025": SHEET_2025}, ensure_ascii=False)
NOT_TRIP = json.dumps({"Sheet1": [["날짜", "사업장", "전력"], ["2024-01", "대구", 100]]}, ensure_ascii=False)

# 로그인한 편집자 + 가짜 XLSX (파일 내용을 JSON 으로 읽음)
INIT = """
localStorage.setItem('nia-env.auth', JSON.stringify({ access_token: 't', refresh_token: 'r',
  expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: 'u1', email: 'tester@nia.or.kr' } }));
window.XLSX = {
  read: buf => { const j = JSON.parse(new TextDecoder().decode(buf)); return { SheetNames: Object.keys(j), Sheets: Object.fromEntries(Object.entries(j).map(([k, v]) => [k, { '!ref': 'A1', g: v }])) }; },
  utils: { sheet_to_json: ws => ws.g }
};
"""
USERS = [dict(user_id="u1", email="tester@nia.or.kr", name="테스터", role="editor")]


CSV = """관내출장현황,,,,,,,,,,,,
번호,출장시간,,출장일수,,출발지,경유지,목적지,교통편,왕복거리[KM],연비,유가,교통비
부서코드,출장시작일,출장종료일,박,일,출발지,경유지,목적지,교통편,왕복거리[KM],연비,유가,교통비
1,2025-01-02,2025-01-02,0,1,대구,,서울,철도운임,0,0,0,"87,000"
2,2025.1.3,2025.1.3,0,1,대구,,"세종, 서울",철도운임,0,0,0,40000
3,2026년 2월 3일,2026년 2월 3일,0,1,대구,,서울,철도운임,0,0,0,87000
4,2025-01-05,2025-01-05,0,1,제주,,서울,항공운임,0,0,0,86700
5,날짜없음,,0,1,대구,,서울,철도운임,0,0,0,87000
"""


def upload(p, content, name="출장.xls"):
    p.evaluate("()=>{document.querySelector('button[data-tab=input]').click();document.querySelector('.subtab-btn[data-sub=trip]').click()}")
    data = content if isinstance(content, bytes) else content.encode("utf-8")
    p.set_input_files("#trip-file", files=[dict(name=name, mimeType="application/vnd.ms-excel", buffer=data)])
    p.wait_for_function("document.getElementById('trip-info').textContent && !/읽는 중|분류 중/.test(document.getElementById('trip-info').textContent)", timeout=10000)
    p.wait_for_timeout(200)


def review(p, view=None):
    """장소 분류 검토표의 줄 — [장소, 출장, 분류, 출처, 확신, 이유, 운임이 가리키는 곳, 운임 대조]"""
    if view:
        p.select_option("#trip-rv-filter", view)
        p.wait_for_timeout(100)
    return p.evaluate("()=>[...document.querySelectorAll('#trip-review tbody tr')].filter(tr=>tr.querySelector('select')).map(tr=>[...tr.cells].slice(0,8).map(td=>td.textContent.trim()))")


def cells(p, year="2025"):
    return p.evaluate(f"()=>[...document.querySelectorAll('#trip-summary tr[data-year=\"{year}\"] td')].map(td=>td.textContent.trim())")


def run():
    print("\n=== test_trip_ui ===")

    with sync_playwright() as pw:
        # ── 1) AI 함수 없음(404) · 표는 있음 ──
        mock = MockRouter(tables={"app_users": USERS})
        br, ctx, p, errs = open_page(pw, mock, init_script=INIT)

        test_name("미리보기")
        upload(p, FILE)
        ok(p.evaluate("()=>!document.getElementById('trip-out').hidden"), "요약이 나타남")
        c = cells(p)
        ok(len(c) == 10 and c[1] == "4" and c[2] == "1", f"2025년: 산정 4건 · 제외 1건 — {c}")
        ok(c[3] == "25.0%" and c[4] == "25.0%" and c[5] == "25.0%" and c[6] == "25.0%", f"A·B·C·D 각 25% — {c[3:7]}")
        info = p.text_content("#trip-info")
        ok("항공운임 1" in info, f"철도 외 교통편은 미산정 건수로 — '{info[:80]}'")
        ok("AI" not in info, f"AI 안내 문구가 없다 — 자동 호출을 지웠으므로(2026-11-26) '{info[:80]}'")
        rv = review(p)
        ok(len(rv) == 1 and rv[0][0] == "비상임감사집무실" and rv[0][2] == "미분류" and rv[0][3] == "없음", f"확인 필요에 미분류 장소 — {rv}")
        ok(rv and "대구 1건" in rv[0][6] and rv[0][7] == "참고", f"미분류 장소에는 운임이 가리키는 곳을 참고로 — {rv[0][6:] if rv else None}")
        ok("확인 필요 1개" in p.text_content("#trip-rv-n") and "전체 4개" in p.text_content("#trip-rv-n"), f"개수 — '{p.text_content('#trip-rv-n')}'")
        rv = review(p, "all")
        by = {r[0]: r for r in rv}
        ok(by.get("대구", [None] * 8)[3] == "규칙" and by["대구"][2] == "대구" and by["서울"][7] == "일치", f"전체 보기에는 규칙 분류와 운임 대조 — {by.get('서울')}")
        review(p, "need")
        d = p.text_content("#trip-dtop")
        ok("70,010" in d and "구간 동대구-서울" in d, "추정(D) 상위 운임 표")
        # 사전에 없는 장소가 있어도 바깥으로 아무것도 보내지 않는다 — 유료 AI 호출을 지운 뒤의 핵심 보장
        ok(mock.calls == [], f"사전에 없는 장소가 있어도 Edge Function(유료 AI)을 부르지 않는다 — {mock.calls}")

        test_name("사람 확정")
        mock.writes.clear()
        p.select_option("#trip-review select", "대구")
        p.wait_for_timeout(400)
        c = cells(p)
        ok(c[3] == "50.0%" and c[4] == "25.0%" and c[5] == "0.0%", f"지점을 고르면 C → A 로 다시 계산 (운임표 그대로 · 장소 일치) — A {c[3]} B {c[4]} C {c[5]}")
        w = [x for x in mock.writes if x[1] == "trip_places"]
        ok(len(w) == 1 and w[0][2][0]["raw"] == "비상임감사집무실" and w[0][2][0]["points"] == ["대구"] and w[0][2][0]["source"] == "human",
           f"장소 사전에 '사람 확정'으로 저장 — {w[:1]}")
        ok(review(p) == [], "확인 필요에서 사라짐")
        rv = review(p, "human")
        ok(len(rv) == 1 and rv[0][0] == "비상임감사집무실" and rv[0][2] == "대구" and rv[0][3] == "사람" and rv[0][7] == "일치", f"사람 확정으로 표시 — {rv}")
        with p.expect_download() as dl:
            p.click("#trip-rv-dl")
        csv = pathlib.Path(dl.value.path()).read_text(encoding="utf-8-sig")
        ok(csv.count("\n") == 4 and '"비상임감사집무실","1","대구","사람"' in csv and '"운임 대조"' in csv, f"검토표 CSV 에 모든 장소 — {csv[:120]!r}")
        review(p, "need")

        test_name("저장")
        mock.writes.clear(); mock.deletes.clear()
        p.click("#trip-save")
        p.wait_for_function("document.getElementById('trip-save').textContent === '저장'", timeout=10000)
        p.wait_for_timeout(300)
        b = [x for x in mock.writes if x[0] == "POST" and x[1] == "trip_batches"]
        r = [x for x in mock.writes if x[0] == "POST" and x[1] == "trip_rows"]
        ok(len(b) == 1 and b[0][2][0]["year"] == 2025 and b[0][2][0]["status"] == "saving", f"묶음 1건 (저장 중 상태로 시작) — {len(b)}")
        s = b[0][2][0]["summary"] if b else {}
        ok(s.get("n") == 4 and s.get("excluded") == 1 and "2025-01" in s.get("months", {}) and "2025-02" in s.get("months", {}), f"묶음 요약에 월별 합계 — {list(s.get('months', {}))}")
        rows = r[0][2] if r else []
        ok(len(rows) == 5 and all(x["batch_id"] == b[0][2][0]["id"] for x in rows), f"철도 행 5건(제외 포함) — {len(rows)}")
        ok({x["grade"] for x in rows} == {"A", "B", "D", "제외"}, f"행마다 판정 등급 — {sorted({x['grade'] for x in rows})}")
        ok(not any(k in rows[0] for k in ("email", "dept")) and rows[0]["factor"] == 0.0219, "행에 계수·근거가 남음")
        pt = [x for x in mock.writes if x[0] == "PATCH" and x[1] == "trip_batches"]
        ok(len(pt) == 2 and pt[0][2] == {"status": "active"} and pt[1][2] == {"status": "replaced"}, f"새 묶음 활성 → 이전 묶음 교체 — {[x[2] for x in pt]}")
        ok(any("trip_rows" in u and "batch_id=neq." in u for u in mock.deletes), "이전 묶음의 행만 지움")
        br.close()

        # ── 2) 다른 양식 ──
        mock = MockRouter(tables={"app_users": USERS})
        br, ctx, p, errs2 = open_page(pw, mock, init_script=INIT)
        test_name("다른 양식")
        upload(p, NOT_TRIP)
        ok("출장 양식이 아니에요" in p.text_content("#trip-info"), "안내 문구")
        ok(p.evaluate("()=>document.getElementById('trip-out').hidden && document.getElementById('trip-info').classList.contains('err')"), "요약은 비어 있음")
        errs += errs2
        br.close()

        # ── 2-1) CSV ──
        mock = MockRouter(tables={"app_users": USERS})
        br, ctx, p, errs_csv = open_page(pw, mock, init_script=INIT.split("window.XLSX")[0])
        test_name("CSV")
        upload(p, CSV, "출장.csv")
        a, b = cells(p, "2025"), cells(p, "2026")
        ok(a and a[1] == "2" and b and b[1] == "1", f"연도를 출장시작일에서 읽음 (2025-01-02 · 2025.1.3 · 2026년 2월 3일) — 2025 {a[1:2]} 2026 {b[1:2]}")
        ok(a[3] == "50.0%" and a[4] == "50.0%", f"쉼표 든 금액(\"87,000\")과 따옴표 안 쉼표 장소도 읽음 — A {a[3]} B {a[4]}")
        info = p.text_content("#trip-info")
        ok("항공운임 1" in info and "읽지 못한 철도 1건" in info, f"날짜를 못 읽은 행은 빼고 알림 — '{info[:90]}'")
        ok(not p.evaluate("()=>!!document.querySelector('script[src*=sheetjs]')"), "CSV 는 엑셀 도구를 불러오지 않음")
        upload(p, CSV.encode("euc-kr"), "출장_엑셀저장.csv")
        ok(cells(p, "2025")[1] == "2", "한글 엑셀이 저장한 CSV(EUC-KR)도 읽음")
        upload(p, "날짜,사업장,전력\n2024-01,대구,100\n", "에너지.csv")
        ok("출장 양식이 아니에요" in p.text_content("#trip-info"), "출장 양식이 아닌 CSV 는 안내")
        errs += errs_csv
        br.close()

        # ── 3) 사전의 분류를 그대로 쓴다 (2026-11-26: AI 자동 호출을 지워 사전만 본다) ──
        #     AI 가 분류한 항목은 source='ai' 로 사전에 들어가 있고, 화면은 그것을 출처 'AI' 로 보여 준다.
        #     분류는 대화에서 한 번 해 사전에 넣는 방식이다 — docs/decisions/002-AI-자동분류-제거.md
        test_name("사전의 AI 분류")
        dic = [dict(raw="비상임감사집무실", points=["대구"], confidence="high", reason="NIA 본원", source="ai")]
        mock = MockRouter(tables={"app_users": USERS, "trip_places": dic})
        br, ctx, p, errs3 = open_page(pw, mock, init_script=INIT)
        upload(p, FILE)
        c = cells(p)
        ok(c[3] == "50.0%" and c[4] == "25.0%" and c[5] == "0.0%", f"사전이 분류하면 C → A — A {c[3]} B {c[4]} C {c[5]}")
        ok(review(p) == [], "확인 필요 없음")
        rv = review(p, "ai")
        ok(len(rv) == 1 and rv[0][2:6] == ["대구", "AI", "높음", "NIA 본원"], f"사전의 AI 분류는 출처·확신·이유가 보임 — {rv}")
        ok(mock.calls == [], f"Edge Function 을 부르지 않는다 — {mock.calls}")
        errs += errs3
        br.close()

        test_name("사전의 모름")
        known = [dict(raw="비상임감사집무실", points=[], confidence="unknown", reason="위치를 알 수 없음", source="ai")]
        mock = MockRouter(tables={"app_users": USERS, "trip_places": known})
        br, ctx, p, errs_u = open_page(pw, mock, init_script=INIT)
        upload(p, FILE)
        rv = review(p)
        ok(len(rv) == 1 and rv[0][2:6] == ["모름", "AI", "—", "위치를 알 수 없음"], f"사전에 '모름'인 장소는 확인 필요에 남음 — {rv}")
        ok(cells(p)[5] == "25.0%", "모름인 장소의 행은 운임만으로 판정(C)")
        errs += errs_u
        br.close()

        # ── 3-3) 운임과 다른 분류가 맨 위 ──
        test_name("운임 대조")
        wrong = [dict(raw="한국프레스센터", points=["세종"], confidence="high", reason="세종 소재", source="ai"),
                 dict(raw="버텍스코리아", points=["서울"], confidence="low", reason="서울 추정", source="ai")]
        f2 = json.dumps({"2025": HEAD + [trip(i, 45659, "대구", "한국프레스센터", "철도운임", 87000) for i in (1, 2, 3)]
                         + [trip(4, 45659, "대구", "버텍스코리아", "철도운임", 87000)]}, ensure_ascii=False)
        mock = MockRouter(tables={"app_users": USERS, "trip_places": wrong})
        br, ctx, p, errs_w = open_page(pw, mock, init_script=INIT)
        upload(p, f2)
        rv = review(p)
        ok(len(rv) == 2 and rv[0][0] == "한국프레스센터" and rv[0][7] == "다름" and "서울 3건" in rv[0][6], f"운임이 다른 곳을 가리키면 맨 위에 '다름' — {rv[:1]}")
        ok(len(rv) == 2 and rv[1][0] == "버텍스코리아" and rv[1][4] == "낮음" and rv[1][7] == "일치", f"확신 낮음도 확인 필요에 — {rv[1:]}")
        ok(mock.calls == [], "사전에 있는 장소는 AI 에 보내지 않음")
        errs += errs_w
        br.close()

        # ── 3-4) 장소 사전 읽기: 편집자만 · 1,000줄 넘어도 끝까지 ──
        test_name("장소 사전 읽기")
        big = [dict(raw=f"zz{i:04d}", points=["세종"] if i == 1199 else ["서울"], confidence="high", reason="", source="ai") for i in range(1500)]
        f3 = json.dumps({"2025": HEAD + [trip(1, 45659, "대구", "zz1199", "철도운임", 49600)]}, ensure_ascii=False)
        mock = MockRouter(tables={"app_users": USERS, "trip_places": big})
        br, ctx, p, errs_p = open_page(pw, mock, init_script=INIT)
        upload(p, f3)
        g = [u for t, u in mock.gets if t == "trip_places"]
        ok(len(g) == 2 and "offset=0" in g[0] and "offset=1000" in g[1], f"1,000줄씩 두 번 읽음 — {len(g)}")
        ok(cells(p)[3] == "100.0%", f"1,200번째 줄의 분류(세종)가 적용됨 — 49,600 대구→세종 은 A — A {cells(p)[3]}")
        errs += errs_p
        br.close()
        mock = MockRouter(tables={"trip_places": big})
        br, ctx, p, errs_p = open_page(pw, mock, init_script=INIT.split("localStorage.setItem")[0] + "window.XLSX" + INIT.split("window.XLSX")[1])
        upload(p, FILE)
        ok(not [t for t, u in mock.gets if t == "trip_places"] and mock.calls == [], "로그인하지 않으면 장소 사전·AI 를 부르지 않음")
        ok(cells(p)[1] == "4" and "장소 사전 표가 없어요" not in p.text_content("#trip-info"), "규칙만으로 미리보기")
        errs += errs_p
        br.close()

        # ── 4) 표가 없음 (SQL 실행 전) ──
        test_name("SQL 실행 전")
        mock = MockRouter(tables={"app_users": USERS}, missing={"trip_places", "trip_batches", "trip_rows"})
        br, ctx, p, errs5 = open_page(pw, mock, init_script=INIT)
        upload(p, FILE)
        ok(cells(p)[1] == "4", "미리보기는 동작")
        ok("trip_scope3.sql" in p.text_content("#trip-info"), "SQL 실행 안내")
        p.click("#trip-save")
        p.wait_for_function("document.getElementById('trip-save').textContent === '저장'", timeout=10000)
        ok(p.evaluate("()=>[...document.querySelectorAll('.toast')].some(t=>/trip_scope3\\.sql/.test(t.textContent))"), "저장하면 SQL 안내 토스트")
        errs += errs5
        br.close()

        # ── 5) 대시보드 표시 ──
        test_name("Scope 3 카드")
        batch = dict(year=2026, mode="rail", ref_version="2026-11-12", created_at=TS,
                     summary=dict(n=100, excluded=5, A=50, B=30, C=0, D=20, km=57340, kg=137500, kgD=21500, months={}))
        mock = MockRouter(energy=[erow(1, "2026-01", "대구본원", "전력", 100000)], tables={"trip_batches": [batch]})
        br, ctx, p, errs6 = open_page(pw, mock)
        t = p.evaluate("()=>[...document.querySelectorAll('[id$=\"k-trip-sub\"]')].filter(e=>!e.hidden).map(e=>e.textContent)")
        ok(t and all("출장(철도) 137.5" in x and "추정 20%" in x for x in t), f"출장(철도) 톤수·추정 비율 — {t[:1]}")
        errs += errs6
        br.close()

        mock = MockRouter(energy=[erow(1, "2026-01", "대구본원", "전력", 100000)], missing={"trip_batches"})
        br, ctx, p, errs7 = open_page(pw, mock)
        ok(p.evaluate("()=>[...document.querySelectorAll('[id$=\"k-trip-sub\"]')].every(e=>e.hidden)"), "산정 결과가 없으면 기존 화면 그대로")
        errs += errs7
        br.close()

        test_name("")
        ok(not errs, f"JS 오류 없음 — {errs[:2]}")
    return summary()


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
