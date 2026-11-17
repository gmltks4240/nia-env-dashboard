"""
출장(철도) Scope 3 산정 검증 — index.html 의 @trip-start … @trip-end 블록과 기준표(@trip-ref) 를
그대로 꺼내 판정 등급·거리·배출량을 확인한다. (화면을 띄우지 않고 산정 코드만 평가)

등급:  A 업무상 확정 → B 운임표+구간 일치 → C 운임표만 일치 → D 추정 · 교통비 0원은 제외
"""
import pathlib
import re

from playwright.sync_api import sync_playwright

import harness as H

ROOT = pathlib.Path(__file__).resolve().parent.parent


def trip_source():
    src = (ROOT / "index.html").read_text(encoding="utf-8")
    m = re.search(r"/\* @trip-start.*?\*/(.*?)/\* @trip-end \*/", src, re.S)
    assert m, "@trip-start … @trip-end 블록을 찾지 못했습니다"
    return m.group(1)


def ref_source():
    src = (ROOT / "index.html").read_text(encoding="utf-8")
    m = re.search(r"<!-- @trip-ref-start -->\s*<script>(.*?)</script>\s*<!-- @trip-ref-end -->", src, re.S)
    assert m, "@trip-ref-start … @trip-ref-end 블록을 찾지 못했습니다"
    f = re.search(r"<!-- @trip-fare-start -->\s*<script>(.*?)</script>\s*<!-- @trip-fare-end -->", src, re.S)
    assert f, "@trip-fare-start … @trip-fare-end 블록을 찾지 못했습니다"
    return m.group(1) + "\n" + f.group(1)


def open_engine(pw):
    br = pw.chromium.launch()
    page = br.new_page()
    page.set_content("<!doctype html><title>trip</title>")
    page.add_script_tag(content=ref_source())
    page.add_script_tag(content=trip_source() + "\nwindow.__ref = tripBuildRef(window.TRIP_REF, window.TRIP_FARE);"
                        "\nwindow.__c = (o, d, f, via, pm, days) => classifyRail({ origin: o, dest: d, via: via || '', fare: f, days, date: window.__date || '' }, window.__ref, pm || {});"
                        "\nwindow.__parse = tripParseSheet; window.__sum = tripSummarize;"
                        "\nwindow.__pairs = f => tripFarePairs(f, window.__ref).map(p => [...p].sort().join('-'));"
                        "\nwindow.__ev = (rows, pm) => Object.fromEntries(tripPlaceEvidence(rows, window.__ref, pm || {}));"
                        "\nwindow.__mark = tripEvidenceMark; window.__cities = t => tripCities(t, {});")
    return br, page


def tripkm(x):
    return round(x * 10) / 10


def run():
    with sync_playwright() as pw:
        br, page = open_engine(pw)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        c = lambda o, d, f, via="", pm=None, days=None: page.evaluate("([o,d,f,v,pm,n]) => __c(o,d,f,v,pm,n)", [o, d, f, via, pm or {}, days])

        H.test_name("A 업무상 확정")
        r = c("대구", "서울", 87000)
        H.ok(r["grade"] == "A" and r["legs"] == 2, f"87,000 → A·왕복 — {r['gradeLabel']} legs {r['legs']}")
        H.near(r["km"], 573.4, 0.01, "거리 573.4km")
        H.near(r["kg"], 12.557, 0.001, "573.4 × 0.0219 = 12.557 kg")
        r = c("서울", "서울", 43500)
        H.ok(r["grade"] == "A" and r["legs"] == 1 and r["km"] == 286.7, f"서울→서울 43,500 → 편도 286.7km (선이동 관행) — {r}")

        H.test_name("왕복 횟수 (대개 1회 · 교통비가 왕복 운임의 n배이고 출장이 n일 이상이면 n회)")
        r = c("대구", "서울", 174000, days=3)
        H.ok(r["grade"] == "A" and r["legs"] == 4 and r["km"] == 1146.8 and not r.get("check"), f"174,000 · 3일 → 왕복 2회 1,146.8km — {r['gradeLabel']} {r['km']}")
        H.near(r["kg"], 25.115, 0.001, "1,146.8 × 0.0219 = 25.115 kg")
        r = c("대구", "서울", 174000, days=2)
        H.ok(r["legs"] == 4 and r["km"] == 1146.8, "174,000 · 2일 → 왕복 2회 (날마다 오간 경우)")
        r = c("대구", "서울", 174000, days=1)
        H.ok(r["grade"] == "A" and r["legs"] == 2 and r["km"] == 573.4 and r.get("check") and "확인 필요" in r["gradeLabel"], f"174,000 · 당일 → 왕복 1회 + 확인 필요 — {r['gradeLabel']}")
        r = c("대구", "서울", 174000)
        H.ok(r["legs"] == 2 and r["km"] == 573.4 and r.get("check"), "174,000 · 일수 모름 → 왕복 1회 + 확인 필요")
        r = c("대구", "서울", 261000, days=5)
        H.ok(r["grade"] == "A" and r["legs"] == 6 and r["km"] == 1720.2, f"261,000 · 5일 → 왕복 3회 — {r['km']}")
        r = c("대구", "서울", 261000, days=2)
        H.ok(r["legs"] == 4 and r["km"] == 1146.8 and r.get("check"), "261,000 · 2일 → 일수만큼 2회 + 확인 필요")
        r = c("대구", "세종", 99200, days=2)
        H.ok(r["grade"] == "B" and r["legs"] == 4 and r["km"] == 648, f"99,200 대구→세종 · 2일 → 동대구↔오송 왕복 2회 648km — {r['basis']}")
        r = c("대구", "서울", 87000, days=5)
        H.ok(r["legs"] == 2 and r["km"] == 573.4 and not r.get("check"), "87,000 · 5일 → 금액이 1회분이면 길어도 왕복 1회")
        r = c("대구", "서울", 121800, days=3)
        H.ok(r["legs"] == 2 and r["km"] == 573.4 and not r.get("check"), "121,800 · 3일 → 특실 왕복 1회 (2회 아님)")
        r = c("대구", "서울", 87000 * 2 + 100, days=3)
        H.ok(r["grade"] == "D" and r["km"] == 573.4, "정확한 배수가 아니면 지금처럼 D·왕복 1회")

        H.test_name("A 업무상 확정 (계속)")
        r = c("대구", "성남", 37000)
        H.ok(r["grade"] == "A" and "거리 추정" in r["gradeLabel"] and r["km"] == 269.2, f"SRT 수서 37,000 → 269.2km·거리 추정 — {r['gradeLabel']}")

        H.test_name("B 운임표+구간 일치")
        r = c("대구", "세종", 49600)
        H.ok(r["grade"] == "B" and r["legs"] == 2 and r["km"] == 324, f"49,600 대구→세종 → 동대구↔오송 왕복 324km — {r['basis']} {r['km']}")
        r = c("대구", "서울", 80400)
        H.ok(r["grade"] == "B" and r["km"] == 555.9, f"80,400 = KTX 43,500 + SRT 36,900 → 555.9km — {r['basis']} {r['km']}")
        r = c("대구", "서울", 60900)
        H.ok(r["grade"] == "B" and r["legs"] == 1 and r["km"] == 286.7 and "특실" in r["basis"], f"60,900 → 특실 편도 — {r['basis']}")
        r = c("대구", "서울", 121800)
        H.ok(r["legs"] == 2 and r["km"] == 573.4, f"121,800 → 왕복 1회 — {r['gradeLabel']}")

        H.test_name("C·D 와 예외 입력")
        r = c("", "", 49600)
        H.ok(r["grade"] in ("C", "D") and r["km"] > 0, f"장소가 비어도 산정 — {r['gradeLabel']} {r['km']}km")
        r = c("대구", "서울", 70010)
        H.ok(r["grade"] == "D" and r["legs"] == 2 and r["km"] == 573.4, f"어느 운임표와도 맞지 않는 70,010 → D·구간 거리 왕복 — {r['basis']}")
        r = c("대구", "서울", 38800)
        H.ok(r["grade"] == "D" and r["legs"] == 1 and r["km"] == 286.7, f"38,800 → D·편도 (기준 편도의 1.5배 미만) — {r['basis']}")
        r = c("어딘가", "모르는곳", 30050)
        H.ok(r["grade"] == "D" and abs(r["km"] - 30050 / (43500 / 286.7)) < 0.1, f"구간을 몰라도 운임 역산 — {r['km']}km")
        r = c("어딘가", "모르는곳", 999999)
        H.near(r["km"], 860.1, 0.01, "운임 역산 상한 860.1km")
        r = c(12345, None, 43100)
        H.ok(r["grade"] in ("C", "D") and r["km"] > 0, f"숫자·빈 값 장소도 오류 없이 — {r['gradeLabel']}")

        H.test_name("제외·강릉선")
        r = c("대구", "서울", 0)
        H.ok(r["grade"] == "제외" and r["kg"] == 0 and r["km"] == 0, "교통비 0원 → 제외")
        r = c("서울", "강릉", 55200)
        H.ok(r["grade"] == "B" and r["legs"] == 2 and r["km"] == 446.4 and r["factor"] == 0.0716, f"서울→강릉 55,200 = 27,600 × 2 → B · 서울↔강릉 왕복 446.4km · 계수 0.0716 — {r['basis']}")
        r = c("서울", "진부", 43800)
        H.ok(r["grade"] == "B" and r["km"] == 365.8, f"서울→진부 43,800 = 21,900 × 2 (역별 운임표) → B · 365.8km — {r['basis']}")
        r = c("서울", "강릉", 50000)
        H.ok(r["grade"] == "D" and r["legs"] == 2 and r["km"] == 446.4, "운임표와 다른 금액이면 D(추정) · 역 거리는 그대로")
        H.near(r["kg"], 31.962, 0.001, "446.4 × 0.0716 = 31.962 kg")
        r = c("서울", "강릉", 27600)
        H.ok(r["legs"] == 1 and r["km"] == 223.2, "서울→강릉 27,600 → 편도 223.2km")
        r = c("대구", "강릉", 142200)
        H.ok(r["grade"] == "B" and r["legs"] == 2 and r["km"] == 1019.8 and not r.get("check"), f"대구→강릉 142,200 = (43,500 + 27,600) × 2 → B · 동대구-서울-강릉 왕복 1,019.8km — {r['basis']}")
        H.near(r["kg"], 573.4 * 0.0219 + 446.4 * 0.0716, 0.001, "서울까지는 0.0219, 강릉선만 0.0716 (12.557 + 31.962 = 44.520 kg)")
        r = c("대구", "진부", 71000)
        H.ok(r["legs"] == 1 and r["km"] == tripkm(286.7 + 182.9), f"대구→진부 → 내리는 역은 진부(182.9km) 편도 — {r['basis']}")
        r = c("본원", "평창 알펜시아", 130000)
        H.ok(r["legs"] == 2 and r["km"] == tripkm(2 * (286.7 + 166.6)), f"본원→평창 → 평창역(166.6km) 왕복 — {r['km']}")
        r = c("대구", "강릉", 30000)
        H.ok(r["legs"] == 1 and r.get("check") and "동해선" in r["basis"], f"대구→강릉 30,000 → 서울 경유보다 훨씬 쌈: 경로 확인 필요 — {r['gradeLabel']}")
        r = c("강릉", "평창", 8400)
        H.ok(r["km"] == 56.6 and r["factor"] == 0.0716, f"강릉→평창 → 강릉선 안에서 56.6km — {r['basis']}")
        r = c("모르는곳", "강릉", 400000)
        H.ok(r["km"] <= 860.1, f"반대쪽을 모르면 운임 역산, 상한 860.1km — {r['km']}")
        r = c("대구", "서울, 강릉", 142200)
        H.ok(r["km"] == 1019.8, "목적지가 '서울, 강릉'이어도 대구에서 출발한 것으로")
        r = c("대구", "원주", 30000)
        H.ok(r["factor"] == 0.0219, "원주는 기본 계수 0.0219")

        H.test_name("기간별 운임표 (2026-09-01 KTX·SRT 통합 · 코레일 KTX 운임표 2025·2026년판)")
        on = lambda d: page.evaluate("d => { window.__date = d; }", d)
        on("2026-10-05")
        r = c("대구", "서울", 78000)
        H.ok(r["grade"] == "B" and r["legs"] == 2 and r["km"] == 573.4, f"9월 이후 78,000 = 39,000 × 2 → 동대구↔서울 왕복 — {r['basis']}")
        r = c("대구", "서울", 39000)
        H.ok(r["grade"] == "B" and r["legs"] == 1 and r["km"] == 286.7, "9월 이후 39,000 → 편도")
        r = c("대구", "세종", 44600)
        H.ok(r["grade"] == "B" and r["km"] == 324, f"9월 이후 44,600 = 22,300 × 2 → 동대구↔오송 왕복 — {r['basis']}")
        r = c("대구", "서울", 56600)
        H.ok(r["grade"] == "B" and r["legs"] == 1 and "특실" in r["basis"], f"9월 이후 특실 편도는 56,600 (일반실 × 1.4 가 아님) — {r['basis']}")
        r = c("대구", "서울", 87000)
        H.ok(r["grade"] == "D" and r["km"] == 573.4, "9월 이후에는 옛 판정기준(87,000 → A)을 쓰지 않음 · 구간 거리로 추정")
        r = c("대구", "강릉", 133200)
        H.ok(r["grade"] == "B" and r["km"] == 1019.8, "9월 이후 대구→강릉 왕복 = (39,000 + 27,600) × 2")
        on("2026-08-31")
        r = c("대구", "서울", 87000)
        H.ok(r["grade"] == "A", "8월 31일까지는 옛 운임 · 판정기준 그대로")
        r = c("대구", "서울", 78000)
        H.ok(r["km"] == 573.4, "8월 이전의 78,000 도 대구–서울 왕복 거리")
        on("")
        r = c("대구", "천안아산", 58600)
        H.ok(r["grade"] == "B" and r["km"] == 381.4, f"전 구간 운임표: 대구→천안아산 58,600 = 29,300 × 2 → B — {r['basis']}")
        r = c("대구", "김천구미", 13200)
        H.ok(r["grade"] == "B" and r["legs"] == 1 and "특실" in r["basis"], f"짧은 구간 특실은 운임표 금액(8,400 + 최저 요금 4,800 = 13,200) — {r['basis']}")
        r = c("대구", "서울", 60900)
        H.ok(r["grade"] == "B" and "특실" in r["basis"] and "산식" not in r["basis"], "60,900 특실은 산식이 아니라 운임표에서")

        H.test_name("장소 사전")
        r0 = c("비상임감사집무실", "서울", 43100)
        r1 = c("비상임감사집무실", "서울", 43100, "", {"비상임감사집무실": ["대구"]})
        H.ok(r0["grade"] != "B" and r1["grade"] == "B", f"사전에 대구로 등록하면 B로 — {r0['grade']} → {r1['grade']}")
        r = c("대구", "서울 광화문", 87300, "", {"대구": ["부산"]})
        H.ok(r["grade"] != "B", "사전 값이 내장 규칙보다 우선")

        H.test_name("엑셀 시트 읽기")
        grid = [
            ["관내출장현황"] + [""] * 12,
            ["번호", "출장시간", "", "출장일수", "", "출발지", "경유지", "목적지", "교통편", "왕복거리[KM]", "연비", "유가", "교통비"],
            ["부서코드", "출장시작일", "출장종료일", "박", "일", "출발지", "경유지", "목적지", "교통편", "왕복거리[KM]", "연비", "유가", "교통비"],
            [1, 45293, 45294, "1", "2", "서울", "", "대구", "철도운임", 0, 0, 0, 87000],
            [2, 45293, 45293, "0", "1", " 본원 ", "", "기재부", "자가차량", 191.5, 12.52, 1492, 34440],
            ["", "", "", "", "", "", "", "", "", "", "", "", ""],
        ]
        p = page.evaluate("g => __parse('2024', g)", grid)
        H.ok(len(p["rows"]) == 2 and not p["error"], f"행 2개 — {len(p['rows'])}")
        a = p["rows"][0]
        H.ok(a["date"] == "2024-01-02" and a["year"] == "2024" and a["mode"] == "철도운임" and a["fare"] == 87000, f"날짜·교통편·교통비 — {a}")
        H.ok(a["days"] == 2 and p["rows"][1]["days"] == 1, f"출장 일수는 '일' 칸(머리글 아랫줄)에서 — {a['days']}, {p['rows'][1]['days']}")
        g2 = [["번호", "출장시작일", "출장종료일", "출발지", "목적지", "교통편", "교통비"], [1, "2025-03-04", "2025-03-06", "대구", "서울", "철도운임", 174000], [2, "2025-03-04", "", "대구", "서울", "철도운임", 174000]]
        p2 = page.evaluate("g => __parse('x', g)", g2)
        H.ok(p2["rows"][0]["days"] == 3 and p2["rows"][1]["days"] is None, f"'일' 칸이 없으면 시작일·종료일로, 그것도 없으면 모름 — {[r['days'] for r in p2['rows']]}")
        H.ok(p["rows"][1]["origin"] == "본원", "장소 앞뒤 공백 제거")
        p = page.evaluate("g => __parse('Sheet1', g)", [["날짜", "사업장", "전력"], ["2024-01", "대구", 100]])
        H.ok(not p["rows"] and "출장 양식이 아니에요" in p["error"], f"다른 양식은 안내 — {p['error']}")

        H.test_name("합계")
        s = page.evaluate("""() => __sum([
            { row: { year: '2024', date: '2024-01-02' }, res: __c('대구', '서울', 87000) },
            { row: { year: '2024', date: '2024-01-09' }, res: __c("대구", "서울", 70010) },
            { row: { year: '2024', date: '2024-02-01' }, res: __c('대구', '서울', 0) } ])""")
        y = s["byYear"]["2024"]
        H.ok(y["n"] == 2 and y["excluded"] == 1 and y["A"] == 1 and y["D"] == 1, f"연도 합계 — {y}")
        H.near(s["byMonth"]["2024-01"]["kg"], 2 * 12.557, 0.01, "1월 배출량")
        H.ok("2024-02" not in s["byMonth"], "제외 행은 월 합계에 없음")

        H.test_name("운임 대조")
        pr = page.evaluate("f => __pairs(f)", 87000)
        H.ok("대구-서울" in pr, f"87,000 은 대구–서울 구간 — {pr}")
        pr = page.evaluate("f => __pairs(f)", 49600)
        H.ok("대구-세종" in pr, f"49,600 은 대구–세종 구간 — {pr}")
        H.ok(page.evaluate("f => __pairs(f)", 70010) == [], "어느 운임표와도 맞지 않으면 빈 목록")
        trip = lambda o, d, f: dict(origin=o, dest=d, via="", fare=f)
        rows = [trip("대구", "한국프레스센터", 87000)] * 3 + [trip("대구", "한국프레스센터", 43500)]
        ev = lambda rows, pm=None: page.evaluate("([r, pm]) => __ev(r, pm)", [rows, pm or {}])
        mark = lambda pts, e: page.evaluate("([p, e]) => __mark(p, e)", [pts, e])
        e = ev(rows).get("한국프레스센터")
        H.ok(e and e["hit"] == 4 and e["votes"] == {"서울": 4}, f"분류 전 장소도 운임이 가리키는 곳을 모음 — {e}")
        H.ok(mark([], e) == "참고", "지점이 없으면 '참고'")
        e = ev(rows, {"한국프레스센터": ["서울"]}).get("한국프레스센터")
        H.ok(mark(["서울"], e) == "일치", f"분류와 운임이 같으면 '일치' — {e}")
        e = ev(rows, {"한국프레스센터": ["세종"]}).get("한국프레스센터")
        H.ok(e and e["votes"] == {"서울": 4} and mark(["세종"], e) == "다름", f"세종으로 잘못 분류하면 '다름' — {e}")
        e = ev(rows[:1], {"한국프레스센터": ["세종"]}).get("한국프레스센터")
        H.ok(mark(["세종"], e) == "다름(건수 적음)", "증거가 1~2건이면 '다름(건수 적음)'")
        H.ok(mark(["서울"], None) == "대조 불가" and mark(["서울"], {"hit": 0, "votes": {}}) == "대조 불가", "증거가 없으면 '대조 불가'")
        e = ev([trip("서울", "서울", 43500), trip("서울사무소", "서울", 43500)])
        H.ok("서울" not in e and "서울사무소" not in e, f"같은 도시 안 이동은 증거로 세지 않음 — {list(e)}")
        e = ev([trip("대구", "제주", 87000)] * 3)
        H.ok("제주" not in e, f"운임표가 없는 구간(대구–제주)은 대조하지 않음 — {list(e)}")
        e = ev([trip("대구", "서울", 87000), trip("모르는곳", "서울", 87000), trip("대구", "서울", 0)])
        H.ok(e["서울"]["hit"] == 1 and e["대구"]["hit"] == 1 and e["모르는곳"]["votes"] == {"대구": 1}, f"양쪽 장소 모두에 증거 · 0원 행은 제외 — {e}")
        e = ev([dict(origin="대구", dest="세종", via="한국프레스센터", fare=49600)])
        H.ok("한국프레스센터" not in e, "경유지는 대조에 쓰지 않음")
        e = ev([trip("대구", "세종, 서울", 87000), trip("대구", "세종, 서울", 49600)])
        H.ok(mark(["서울", "세종"], e["세종, 서울"]) == "일치", f"여러 곳이 적힌 장소는 어느 쪽과 맞아도 '일치' — {e['세종, 서울']}")

        H.test_name("키워드 규칙의 함정")
        ct = lambda t: page.evaluate("t => __cities(t)", t)
        for text, want, why in [
            ("서울NIA사무소", ["서울"], "'NIA'를 대구 본원으로 읽지 않음"), ("NIA무교청사", ["서울"], "무교청사는 서울"), ("NIA 글로벌센터", ["제주"], "글로벌센터는 제주"),
            ("NIA본원", ["대구"], "본원은 그대로 대구"), ("NIA", ["대구"], "NIA 만 있으면 대구"), ("대구 NIA 데이터센터", ["대구"], "대구 NIA"),
            ("해운대구", ["부산"], "'해운대구'의 '대구'"), ("청주 청렴연수원", ["세종"], "'연수원'의 '수원'"), ("중앙교육연수원 배움관", [], "연수원만으로는 서울이 아님"),
            ("수원시청", ["서울"], "수원은 그대로 수도권"), ("김천혁신도시", ["김천구미"], "다른 도시의 혁신도시"), ("나주 혁신도시", ["나주"], "나주 혁신도시"),
            ("충북혁신도시(진천)", [], "충북혁신도시는 거점 없음"), ("혁신도시", ["대구"], "혁신도시만 있으면 대구"),
            ("세종대학교", ["서울"], "세종대는 서울"), ("세종문화회관", ["서울"], "세종문화회관은 서울"), ("세종시청", ["세종"], "세종시는 그대로"),
            ("세종대전광주", ["세종", "대전", "광주송정"], "'세종대전'은 세종대가 아님"), ("서울 글로벌센터", ["서울"], "서울의 글로벌센터는 제주가 아님"),
            ("서울정부청사", ["서울"], "정부서울청사"), ("과천 정부청사", ["서울"], "정부과천청사"), ("대전 정부청사", ["대전"], "정부대전청사"), ("정부청사", ["세종"], "정부청사만 있으면 세종"),
            ("경기도 광주", ["서울"], "경기 광주"), ("광주", ["광주송정"], "광주는 그대로"), ("전북정읍", ["정읍"], "전북 + 도시"), ("전북스마트쉼센터", ["전주"], "전북만 있으면 전주"),
            ("양산부산대병원", [], "양산부산대병원은 부산이 아님"), ("부산역", ["부산"], "부산은 그대로"), ("대구 중구", ["대구"], "다른 도시의 중구"), ("서울 중구 무교동", ["서울"], "서울 중구"),
            ("월드컵경기장", [], "'경기장'의 '경기'"), ("경기도 고양시", ["서울"], "경기도는 그대로"), ("서울아산병원", ["서울"], "아산병원은 천안아산이 아님"), ("충남아산시", ["천안아산"], "아산시는 그대로"),
        ]:
            got = ct(text)
            H.ok(sorted(got) == sorted(want), f"{why}: {text} → {got}")

        H.ok(not errors, f"JS 오류 없음 — {errors[:2]}")
        br.close()
    return H.summary()


if __name__ == "__main__":
    import sys
    sys.exit(0 if run() else 1)
