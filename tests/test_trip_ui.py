"""
출장(Scope 3 · 철도) 화면 검증
─ 출장 엑셀 → 연도별 요약 · 분류하지 못한 장소 · 추정(D) 상위 운임
─ 출장 양식이 아닌 파일은 안내만
─ AI 분류 함수: 실패해도 산정은 계속 · 응답이 오면 장소가 풀림
─ 사람이 지점을 지정하면 장소 사전에 저장하고 다시 계산
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
    trip(2, 45659, "대구", "세종", "철도운임", 49600),          # B
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
2,2025.1.3,2025.1.3,0,1,대구,,"세종, 서울",철도운임,0,0,0,49600
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
        ok("AI 분류 함수가 아직 배포되지 않았어요" in info, "AI 함수가 없으면 안내하고 계속")
        unk = p.evaluate("()=>[...document.querySelectorAll('#trip-unknown select')].map(s=>s.dataset.raw)")
        ok(unk == ["비상임감사집무실"], f"분류하지 못한 장소 목록 — {unk}")
        d = p.text_content("#trip-dtop")
        ok("70,010" in d and "구간 동대구-서울" in d, "추정(D) 상위 운임 표")
        ok(mock.calls and mock.calls[0][1] == {"places": ["비상임감사집무실"]}, f"AI 로는 장소명만 보냄 — {mock.calls[:1]}")

        test_name("사람 확정")
        mock.writes.clear()
        p.select_option("#trip-unknown select", "대구")
        p.wait_for_timeout(400)
        c = cells(p)
        ok(c[4] == "50.0%" and c[5] == "0.0%", f"지점을 고르면 C → B 로 다시 계산 — B {c[4]} C {c[5]}")
        w = [x for x in mock.writes if x[1] == "trip_places"]
        ok(len(w) == 1 and w[0][2][0]["raw"] == "비상임감사집무실" and w[0][2][0]["points"] == ["대구"] and w[0][2][0]["source"] == "human",
           f"장소 사전에 '사람 확정'으로 저장 — {w[:1]}")
        ok(p.evaluate("()=>!document.querySelector('#trip-unknown select')"), "목록에서 사라짐")

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

        # ── 3) AI 응답 있음 · 500 ──
        test_name("AI 분류")
        ai = {"results": [{"raw": "비상임감사집무실", "points": ["대구", "달나라"], "confidence": "high", "reason": "NIA 본원"}]}
        mock = MockRouter(tables={"app_users": USERS}, functions={"classify-places": (200, ai)})
        br, ctx, p, errs3 = open_page(pw, mock, init_script=INIT)
        upload(p, FILE)
        c = cells(p)
        ok(c[4] == "50.0%" and c[5] == "0.0%", f"AI 가 분류하면 B 로 — B {c[4]} C {c[5]}")
        ok(p.evaluate("()=>!document.querySelector('#trip-unknown select')"), "미분류 장소 없음 (목록 밖 값 '달나라'는 버림)")
        errs += errs3
        br.close()

        mock = MockRouter(tables={"app_users": USERS}, functions={"classify-places": (500, {"error": "x"})})
        br, ctx, p, errs4 = open_page(pw, mock, init_script=INIT)
        upload(p, FILE)
        c = cells(p)
        ok(c[1] == "4" and "AI 분류 함수 오류 (500)" in p.text_content("#trip-info"), "함수가 실패해도 산정은 계속")
        errs += errs4
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
