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
    return m.group(1)


def open_engine(pw):
    br = pw.chromium.launch()
    page = br.new_page()
    page.set_content("<!doctype html><title>trip</title>")
    page.add_script_tag(content=ref_source())
    page.add_script_tag(content=trip_source() + "\nwindow.__ref = tripBuildRef(window.TRIP_REF);"
                        "\nwindow.__c = (o, d, f, via, pm) => classifyRail({ origin: o, dest: d, via: via || '', fare: f }, window.__ref, pm || {});"
                        "\nwindow.__parse = tripParseSheet; window.__sum = tripSummarize;")
    return br, page


def run():
    with sync_playwright() as pw:
        br, page = open_engine(pw)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        c = lambda o, d, f, via="", pm=None: page.evaluate("([o,d,f,v,pm]) => __c(o,d,f,v,pm)", [o, d, f, via, pm or {}])

        H.test_name("A 업무상 확정")
        r = c("대구", "서울", 87000)
        H.ok(r["grade"] == "A" and r["legs"] == 2, f"87,000 → A·왕복 — {r['gradeLabel']} legs {r['legs']}")
        H.near(r["km"], 573.4, 0.01, "거리 573.4km")
        H.near(r["kg"], 12.557, 0.001, "573.4 × 0.0219 = 12.557 kg")
        r = c("서울", "서울", 43500)
        H.ok(r["grade"] == "A" and r["legs"] == 1 and r["km"] == 286.7, f"서울→서울 43,500 → 편도 286.7km (선이동 관행) — {r}")
        r = c("대구", "서울", 174000)
        H.ok(r["grade"] == "A" and r["legs"] == 2 and r["km"] == 573.4, "174,000 → 왕복 1회 상한")
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
        r = c("어딘가", "모르는곳", 30000)
        H.ok(r["grade"] == "D" and abs(r["km"] - 30000 / (43500 / 286.7)) < 0.1, f"구간을 몰라도 운임 역산 — {r['km']}km")
        r = c("어딘가", "모르는곳", 999999)
        H.near(r["km"], 860.1, 0.01, "운임 역산 상한 860.1km")
        r = c(12345, None, 43100)
        H.ok(r["grade"] in ("C", "D") and r["km"] > 0, f"숫자·빈 값 장소도 오류 없이 — {r['gradeLabel']}")

        H.test_name("제외·강릉선")
        r = c("대구", "서울", 0)
        H.ok(r["grade"] == "제외" and r["kg"] == 0 and r["km"] == 0, "교통비 0원 → 제외")
        r = c("대구", "강릉", 30000)
        H.ok(r["grade"] == "D" and r["factor"] == 0.0716, f"강릉 → 계수 0.0716 — {r['factor']}")
        r = c("대구", "원주", 30000)
        H.ok(r["factor"] == 0.0219, "원주는 기본 계수 0.0219")

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

        H.ok(not errors, f"JS 오류 없음 — {errors[:2]}")
        br.close()
    return H.summary()


if __name__ == "__main__":
    import sys
    sys.exit(0 if run() else 1)
