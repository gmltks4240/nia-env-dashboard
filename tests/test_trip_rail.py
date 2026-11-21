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
    n = re.search(r"<!-- @trip-seen-start -->\s*<script>(.*?)</script>\s*<!-- @trip-seen-end -->", src, re.S)
    assert n, "@trip-seen-start … @trip-seen-end 블록을 찾지 못했습니다"
    lb = re.search(r"<!-- @trip-labels-start -->\s*<script>(.*?)</script>\s*<!-- @trip-labels-end -->", src, re.S)
    assert lb, "@trip-labels-start … @trip-labels-end 블록을 찾지 못했습니다"
    return m.group(1) + "\n" + f.group(1) + "\n" + n.group(1) + "\n" + lb.group(1)


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
                        "\nwindow.__mark = tripEvidenceMark; window.__cities = (t, pm) => tripCities(t, pm || {});")
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
        #  2026-11-20 재정의: 선이동 관행(서울→서울 = 본원 구간)은 가정이므로 A 가 아니다. 금액이 기관 판정기준표에 있어 등급만 B 로 내리고 거리는 기준표 값 그대로
        H.ok(r["grade"] == "B" and "기관 판정기준" in r["gradeLabel"] and r["legs"] == 1 and r["km"] == 286.7,
             f"서울→서울 43,500 → 선이동은 A 가 아니고 기준표 거리 286.7km — {r['gradeLabel']} {r['km']}")

        H.test_name("왕복 횟수 (대개 1회 · 교통비가 왕복 운임의 n배이고 출장이 n일 이상이면 n회)")
        r = c("대구", "서울", 174000, days=3)
        #  왕복 n회(n ≥ 2)는 교통비 배수와 일수로 추론한 가정이라 A 가 아니다(설계서 §4) — 거리는 종전과 같다
        H.ok(r["grade"] == "B" and r["legs"] == 4 and r["km"] == 1146.8 and not r.get("check"), f"174,000 · 3일 → 왕복 2회 1,146.8km · 가정이므로 B — {r['gradeLabel']} {r['km']}")
        H.near(r["kg"], 25.115, 0.001, "1,146.8 × 0.0219 = 25.115 kg")
        r = c("대구", "서울", 174000, days=2)
        H.ok(r["legs"] == 4 and r["km"] == 1146.8, "174,000 · 2일 → 왕복 2회 (날마다 오간 경우)")
        r = c("대구", "서울", 174000, days=1)
        H.ok(r["grade"] == "B" and r["legs"] == 2 and r["km"] == 573.4 and r.get("check") and "확인 필요" in r["gradeLabel"], f"174,000 · 당일 → 왕복 1회 + 확인 필요 — {r['gradeLabel']}")
        r = c("대구", "서울", 174000)
        H.ok(r["legs"] == 2 and r["km"] == 573.4 and r.get("check"), "174,000 · 일수 모름 → 왕복 1회 + 확인 필요")
        r = c("대구", "서울", 261000, days=5)
        H.ok(r["grade"] == "B" and r["legs"] == 6 and r["km"] == 1720.2, f"261,000 · 5일 → 왕복 3회 — {r['km']}")
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

        H.test_name("기관 판정기준표는 거리 공급원 (2026-11-20)")
        r = c("대구", "성남", 37000)
        #  수서 구간은 공식 거리표에 없어 ④(공식 거리)에서 탈락한다 — 등급은 B, 거리는 기준표의 269.2km
        H.ok(r["grade"] == "B" and "기관 판정기준" in r["gradeLabel"] and "거리 추정" in r["gradeLabel"] and r["km"] == 269.2, f"SRT 수서 37,000 → 269.2km·거리 추정 — {r['gradeLabel']}")

        H.test_name("B 운임표+구간 일치")
        r = c("대구", "세종", 49600)
        H.ok(r["grade"] == "A" and r["legs"] == 2 and r["km"] == 324, f"49,600 대구→세종 → 동대구↔오송 왕복 324km — {r['basis']} {r['km']}")
        r = c("대구", "서울", 80400)
        H.ok(r["grade"] == "B" and "거리 추정" in r["gradeLabel"] and r["km"] == 555.9, f"80,400 = KTX 43,500 + SRT 36,900 → 555.9km · 수서 구간은 추정 거리라 A 아님 — {r['basis']} {r['km']}")
        r = c("대구", "서울", 60900)
        H.ok(r["legs"] == 1 and r["km"] == 286.7 and "특실" in r["basis"] and "왕복" not in r["basis"].replace("입석 왕복이 아니다", ""),
             f"60,900 → 특실 편도 286.7km (입석 왕복 아님 · 지금은 L2 라벨이 못 박는다) · 2026-11-20 사용자 확인: 양쪽 모두 할인 좌석인 왕복은 없다 · 등급은 작업 5 에서 정한다 — {r['basis']} {r['km']}")
        H.test_name("후보 선택은 가정 개수 최소 (f7aaad4 복구) — 특실을 뒤로 미루지 않는다")
        r = c("대구", "서울", 60900)
        H.ok(r["legs"] == 1 and r["km"] == 286.7 and "특실" in r["basis"], f"60,900 → 특실 편도 286.7km (좌석 가정 1개가 입석 왕복 2개를 이긴다) — {r['basis']} {r['km']}")
        H.near(r["kg"], 6.279, 0.001, "286.7 × 0.0219 = 6.279 kg")
        r = c("대구", "부산", 33600)
        H.ok(r["legs"] == 2 and r["km"] == 261.4 and "동대구↔부산 왕복 특실" in r["basis"], f"33,600 → 같은 구간 왕복 특실 261.4km (구간이 다른 SRT+KTX 일반 왕복 268.8km 보다 가정이 적다) — {r['basis']} {r['km']}")
        r = c("대구", "서울", 121800)
        H.ok(r["legs"] == 2 and r["km"] == 573.4, f"121,800 → 왕복 1회 — {r['gradeLabel']}")

        H.test_name("C·D 와 예외 입력")
        r = c("", "", 49600)
        H.ok(r["grade"] in ("C", "D") and r["km"] > 0, f"장소가 비어도 산정 — {r['gradeLabel']} {r['km']}km")
        r = c("대구", "서울", 70010)
        H.ok(r["grade"] == "D" and r["legs"] == 2 and r["km"] == 573.4, f"어느 운임표와도 맞지 않는 70,010 → D·구간 거리 왕복 — {r['basis']}")
        r = c("대구", "서울", 28200)
        H.ok(r["grade"] == "D" and r["legs"] == 1 and r["km"] == 286.7, f"28,200 → D·편도 (기준 편도의 1.5배 미만) — {r['basis']}")
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
        H.ok(r["grade"] == "D" and r["legs"] == 1 and r["km"] == tripkm(286.7 + 223.2), "대구→강릉은 금액과 관계없이 서울 경유로 봄 (실제 자료에 동해선 직통 후보 0건 — 직통 추정 규칙 없음)")
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
        H.ok(r["grade"] == "A" and r["legs"] == 2 and r["km"] == 573.4, f"9월 이후 78,000 = 39,000 × 2 → 동대구↔서울 왕복 — {r['basis']}")
        r = c("대구", "서울", 39000)
        H.ok(r["grade"] == "A" and r["legs"] == 1 and r["km"] == 286.7, "9월 이후 39,000 → 편도")
        r = c("대구", "세종", 44600)
        H.ok(r["grade"] == "A" and r["km"] == 324, f"9월 이후 44,600 = 22,300 × 2 → 동대구↔오송 왕복 — {r['basis']}")
        r = c("대구", "서울", 56600)
        #  2026-11-20 재정의: 운임표에 적힌 특실 금액은 가정이 아니고 좌석 종류는 거리를 바꾸지 않는다(설계서 §2.1) → A
        H.ok(r["grade"] == "A" and r["legs"] == 1 and "특실" in r["basis"] and r["gradeLabel"] == "A 업무상 확정(운임표 특실)", f"9월 이후 56,600 = 운임표 특실 편도 → A — {r['gradeLabel']}")
        r = c("대구", "서울", 87000)
        H.ok(r["grade"] == "D" and r["km"] == 573.4, "9월 이후에는 옛 판정기준(87,000 → A)을 쓰지 않음 · 구간 거리로 추정")
        r = c("대구", "강릉", 133200)
        H.ok(r["grade"] == "B" and r["km"] == 1019.8, "9월 이후 대구→강릉 왕복 = (39,000 + 27,600) × 2")
        H.test_name("좌석 종류 (입석 15% 할인 · 자유석 5% 할인)")
        on("")
        r = c("대구", "서울", 60800)
        H.ok(r["grade"] == "B" and r["legs"] == 1 and r["km"] == 286.7 and "특실 가정" in r["gradeLabel"], f"60,800 = 43,400(43,100 + 무정차 할증 0.6%) × 1.4 — 다른 설명이 없어 마지막 수단으로 B(특실 가정) — {r['gradeLabel']}")
        r = c("대구", "서울", 60600)
        H.ok(r["grade"] == "B" and r["legs"] == 1 and r["km"] == 286.7 and "특실 가정" in r["gradeLabel"], f"60,600 = 오송 환승 43,300 × 1.4 — 마지막 수단으로 B(특실 가정) — {r['gradeLabel']}")
        r = c("대구", "서울", 56600, days=None)
        H.ok(r["grade"] in ("B", "D"), "통합 전 56,600 은 통합 뒤 특실 금액이라 여기서는 안 맞아도 된다")
        r = c("대구", "세종", 40900)
        H.ok(r["grade"] == "B" and r["legs"] == 2 and 300 < r["km"] < 330 and "입석" in r["basis"] and "좌석 종류 가정" in r["gradeLabel"], f"40,900 → 좌석 + 입석 왕복 · 등급에 좌석 가정 표시 — {r['gradeLabel']} {r['basis']}")
        r = c("대구", "세종", 48400)
        H.ok(r["grade"] == "A" and r["legs"] == 2 and r["km"] == 324 and "자유석" in r["basis"], f"48,400 = 24,800 + 23,600(자유석) → 왕복 · 좌석 종류는 거리를 바꾸지 않아 A — {r['gradeLabel']} {r['basis']}")
        r = c("대구", "서울", 87000)
        H.ok("좌석 종류 가정" not in r["gradeLabel"], "운임표 금액 그대로인 행에는 좌석 가정 표시가 없음")
        r = c("대구", "서울", 61800)
        H.ok(r["legs"] == 1 and r["km"] == 286.7 and "입석" not in r["basis"],
             f"61,800 = SRT 서대구↔수서 30,900 × 2 → 입석 왕복으로 설명되지 않는다 · 2026-11-20 사용자 확인: 양쪽 모두 할인 좌석인 왕복은 없다 — {r['basis']}")
        r = c("대구", "세종", 40000)
        H.ok(r["grade"] == "B" and r["legs"] == 2 and "입석" in r["basis"], f"40,000 → 좌석 + 입석 왕복 — {r['basis']}")
        r = c("대구", "서울", 29200)
        H.ok(r["grade"] == "D", "입석은 그 구간 대표 운임에서만 파생 — 수원 경유 완행(34,500)의 입석 29,200 은 만들지 않음")
        r = c("대구", "서울", 21700)
        H.ok(r["grade"] == "D", "좌석 종류로도 설명되지 않는 금액(편도의 49.9%)은 추정으로 남김")

        H.test_name("정차역 수에 따른 금액 차이 (중간 정차역 4개부터 0.2%씩 할인 · 통합 전 KTX 무정차 0.6% 할증)")
        on("2026-10-05")
        for fare, pct in ((38900, "0.2%"), (38800, "0.4%"), (38700, "0.8%")):
            r = c("대구", "서울", fare)
            H.ok(r["grade"] == "A" and r["legs"] == 1 and r["km"] == 286.7 and f"정차역 할인 {pct}" in r["basis"], f"9월 이후 {fare:,} = 39,000 에서 {pct} 할인 → A·편도 — {r['basis']}")
        r = c("대구", "서울", 77500)
        H.ok(r["grade"] == "A" and r["legs"] == 2 and r["km"] == 573.4, f"9월 이후 77,500 → 동대구↔서울 왕복 (두 편의 정차역 수가 다름) — {r['basis']}")
        r = c("대구", "서울", 78000)
        H.ok("할인" not in r["basis"], f"운임표 금액 그대로면 할인 표시 없음 — {r['basis']}")
        on("2026-03-10")
        r = c("대구", "세종", 46900)
        H.ok(r["grade"] == "A" and r["legs"] == 2 and r["km"] == 324 and "SRT" in r["basis"] and "정차역 할인" in r["basis"], f"46,900 = KTX 24,800 + SRT 22,100(22,300 에서 정차역 할인) → 동대구↔오송 왕복 — {r['basis']}")
        r = c("대구", "세종", 22100)
        H.ok(r["grade"] == "A" and r["legs"] == 1 and r["km"] == 162, "22,100 → SRT 동대구→오송 편도")
        r = c("대구", "서울", 43800)
        H.ok(r["grade"] == "A" and r["legs"] == 1 and r["km"] == 286.7, "43,800 = 43,500 무정차 할증 0.6% → 편도")
        on("")
        r = c("서울", "서울", 41300)
        #  선이동 관행은 2026-11-20 재정의에서 가정으로 보아 A 에서 빠졌다. 후보 선택(본원 구간 우선)은 그대로여서 거리는 286.7km
        H.ok(r["grade"] == "C" and r["legs"] == 1 and r["km"] == 286.7 and "서울" in r["basis"] and "자유석" in r["basis"],
             f"서울→서울 41,300 = 43,500 의 자유석 — 광명 좌석(41,300)과도 같은 금액이지만 서울역 자유석으로 봄 (2026-11-17 사용자 확인) · 선이동이라 A 는 아님 — {r['gradeLabel']} {r['basis']}")
        r = c("서울", "서울", 43800)
        H.ok(r["grade"] == "C" and r["legs"] == 1 and r["km"] == 286.7, f"서울→서울 행은 본원(대구)과의 구간으로 보되 선이동은 A 가 아님 — {r['gradeLabel']} {r['basis']}")

        H.test_name("A 업무상 확정 — 공식 운임표로 구간·횟수가 하나로 정해지는 행 (2026-11-18)")
        on("2025-05-01")
        r = c("대구", "세종", 49600)
        H.ok(r["grade"] == "A" and r["gradeLabel"] == "A 업무상 확정(운임표)" and r["km"] == 324, f"49,600 대구→세종 = 24,800 × 2 → A(운임표) — {r['gradeLabel']}")
        r = c("대구", "세종", 46900)
        H.ok(r["grade"] == "A" and "할증/정차역" in r["gradeLabel"], f"46,900 = 24,800 + SRT 22,100 — 정차역 할인 파생이지만 1,453번 나와서 A — {r['gradeLabel']}")
        r = c("대구", "서울", 41300)
        #  좌석 종류(자유석·입석)는 거리를 바꾸지 않아 더 이상 A 탈락 사유가 아니다 — 구간이 확정됐으므로 A(좌석 종류)
        H.ok(r["grade"] == "A" and r["gradeLabel"] == "A 업무상 확정(좌석 종류)", f"대구→서울 41,300 = 자유석 → A(좌석 종류) — {r['gradeLabel']}")
        r = c("대구", "세종", 48400)
        H.ok(r["grade"] == "A" and r["gradeLabel"] == "A 업무상 확정(좌석 종류)", f"대구–세종 자유석도 같은 근거로 A — 사용자 확인이 있는 구간만 열어 두지 않는다 — {r['gradeLabel']}")
        r = c("대구", "세종", 40000)
        #  서대구 구간은 공식 거리표에 없다 → ④(공식 거리)에서 탈락. 입석이라서가 아니다
        H.ok(r["grade"] == "B" and "거리 추정" in r["gradeLabel"], f"40,000 은 서대구 추정 거리라 A 가 아님(입석 때문이 아니다) — {r['gradeLabel']} {r['basis']}")
        r = c("서울", "서울", 147400)
        H.ok(r["grade"] != "A", f"같은 도시로 적힌 행은 구간이 확정되지 않아 A 가 아님 — {r['gradeLabel']} {r['basis']}")
        r = c("어딘가", "모르는곳", 49600)
        H.ok(r["grade"] == "C", "장소를 모르면 금액이 맞아도 A 가 아님 (운임으로 장소를 정하지 않는다)")
        r = c("대구", "서울", 78000)
        #  ③ 은 ② 를 통과한 후보 전체를 본다(설계서 §4) — 자유석 설명(555.9km)이 573.4km 와 2% 넘게 벌어지므로 횟수·거리가 하나로 정해지지 않는다
        H.ok(r["grade"] == "B" and r["km"] == 573.4, f"78,000 = 34,500 + 43,500 — 거리가 다른 자유석 설명(555.9km)이 함께 있어 A 가 아니다 — {r['gradeLabel']}")
        #  파생 금액의 반복 확인(TRIP_SEEN)은 더 이상 등급 조건이 아니다 — 할증·정차역 할인은 거리를 바꾸지 않으므로(설계서 §2.1).
        #  seenKey 는 생성 도구가 라벨 우선순위를 세는 데 계속 쓰므로 그대로 채운다
        r = c("대구", "세종", 46900)
        H.ok(r["grade"] == "A" and "할증/정차역" in r["gradeLabel"] and r.get("seenKey") == "대구|세종|전|46900", f"파생 금액도 A 이고 seenKey 는 계속 채운다 — {r['gradeLabel']} {r.get('seenKey')}")
        r = c("대구", "서울", 173600, days=3)
        H.ok(r["grade"] == "B" and r["legs"] == 4 and r["km"] == 1146.8, f"173,600 = 86,800 × 2 · 3일 — 왕복 2회는 가정이라 B(거리는 그대로) — {r['gradeLabel']}")
        r = c("대구", "서울", 173600, days=1)
        H.ok(r["grade"] == "B" and r.get("check"), f"같은 금액이라도 당일이면 횟수 확인 필요 — {r['gradeLabel']}")
        on("")
        r = c("모르는곳", "어딘가", 49600)
        H.ok(r["grade"] == "C" and r["km"] == 324, f"장소를 모를 때는 운임표 금액 그대로인 후보(동대구↔오송 왕복)가 정차역 변형 후보보다 먼저 — {r['basis']}")

        on("2026-08-31")
        r = c("대구", "서울", 87000)
        H.ok(r["grade"] == "A", "8월 31일까지는 옛 운임 · 판정기준 그대로")
        r = c("대구", "서울", 78000)
        H.ok(r["km"] == 573.4, "8월 이전의 78,000 도 대구–서울 왕복 거리")
        on("")
        r = c("대구", "천안아산", 58600)
        H.ok(r["grade"] == "A" and r["km"] == 381.4, f"전 구간 운임표: 대구→천안아산 58,600 = 29,300 × 2 → A — {r['basis']}")
        r = c("대구", "김천구미", 13200)
        H.ok(r["legs"] == 1 and "특실" in r["basis"] and r["grade"] == "A" and "운임표 특실" in r["gradeLabel"], f"짧은 구간 특실도 운임표 금액(8,400 + 최저 요금 4,800 = 13,200)이면 A — {r['gradeLabel']} {r['basis']}")
        #  운임표에 적힌 특실 금액은 가정이 아니다 — 60,300 은 옛 기준표의 동대구–서울 특실 운임(dk 0)
        r = c("대구", "서울", 60300)
        H.ok(r["grade"] == "A" and r["gradeLabel"] == "A 업무상 확정(운임표 특실)" and r["km"] == 286.7, f"60,300 — 운임표 특실이므로 A — {r['gradeLabel']} {r['basis']}")

        H.test_name("사용자 확인 라벨 (L1 · 2026-11-20)")
        on("2026-08-26")
        r = c("경주", "세종", 43000)
        H.ok(r["grade"] == "A" and r["gradeLabel"] == "A 업무상 확정(사용자 확인)" and r["legs"] == 2 and r["km"] == 332.5 and r["label"] == "L1", f"경주→세종 43,000 = SRT 경주–오송 27,500 + KTX 오송–용산 입석 15,500 → 332.5km — {r['gradeLabel']} {r['km']}")
        H.near(r["kg"], 7.282, 0.001, "332.5 × 0.0219 = 7.282 kg")
        r = c("경주", "세종", 43100)
        H.ok(r.get("label") is None, "금액이 다르면 라벨을 쓰지 않음")
        on("2026-10-05")
        r = c("경주", "세종", 43000)
        H.ok(r.get("label") is None, "라벨은 운임 개편 전(period=전) 행에만")
        on("")

        H.test_name("라벨 — 방향 무관 · L2 (2026-11-20)")
        on("2026-08-26")
        r = c("세종", "경주", 43000)
        H.ok(r["label"] == "L1" and r["km"] == 332.5, f"라벨은 방향이 반대여도 맞는다 — {r['gradeLabel']} {r['km']}")
        on("")
        r = c("대구", "서울", 60900)
        H.ok(r["label"] == "L2" and r["legs"] == 1 and r["km"] == 286.7, f"L2 — 대구–서울 특실 편도 286.7km — {r['gradeLabel']}")
        H.ok(r["gradeLabel"] == "A 업무상 확정(사용자 확인)", f"라벨 경로를 통과(규칙만이면 '운임표 특실') — {r['gradeLabel']}")
        r = c("서울", "대구", 60900)
        H.ok(r["label"] == "L2", "L2 도 역방향 일치")
        r = c("대구", "서울", 60300)
        H.ok(r.get("label") is None and r["gradeLabel"] == "A 업무상 확정(운임표 특실)", f"60,300 은 라벨 아님 — {r['gradeLabel']}")

        H.test_name("장소 사전")
        r0 = c("비상임감사집무실", "서울", 43100)
        r1 = c("비상임감사집무실", "서울", 43100, "", {"비상임감사집무실": ["대구"]})
        H.ok(r0["grade"] not in ("A", "B") and r1["grade"] in ("A", "B"), f"사전에 대구로 등록하면 장소가 맞아 등급이 올라감 — {r0['grade']} → {r1['grade']}")
        r = c("대구", "서울 광화문", 87300, "", {"대구": ["부산"]})
        H.ok("부산" in r["basis"] and r["km"] > 400, f"사전 값이 내장 규칙보다 우선 — 출발지를 부산으로 보고 부산-서울 구간 — {r['basis']}")

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

        H.test_name("키워드 규칙 추가분 (2026-11-18)")
        cc = lambda t: page.evaluate("t => __cities(t)", t)
        cities = lambda t, pm: page.evaluate("([t, pm]) => __cities(t, pm)", [t, pm])
        for t, want in (("경산", ["대구"]), ("자택(경산시)", ["대구"]), ("국회의사당", ["서울"]), ("행정안전부 회의실", ["세종"]), ("과학기술정보통신부", ["세종"]),
                        ("식품의약품안전처 회의실", ["세종"]), ("한국프레스센터", ["서울"]), ("가산디지털단지", ["서울"]), ("의정부", ["서울"]), ("사울", ["서울"]),
                        ("새종", ["세종"]), ("댜구", ["대구"]), ("소상공인시장진흥공단 회의실", ["대전"]), ("한국도로공사", ["김천구미"]), ("진해", ["창원"])):
            H.ok(cc(t) == want, f"{t} → {want} — {cc(t)}")
        H.ok(cc("ETRI 서울사무소") == ["서울"], f"ETRI 서울사무소는 대전이 아니라 서울 — {cc('ETRI 서울사무소')}")
        H.ok(cc("ETRI") == ["대전"], "ETRI(본원) → 대전")

        H.test_name("장소 확정은 confidence high 만 (2026-11-20)")
        on("")
        pm = {"가하나": {"points": ["서울"], "confidence": "high"},
              "나둘": {"points": ["서울"], "confidence": "low"},
              "다셋": {"points": ["서울"], "confidence": "unknown"},
              "라넷": ["서울"]}
        H.ok(cities("가하나", pm) == ["서울"], "high 는 확정")
        H.ok(cities("나둘", pm) == [], "low 는 미확정")
        H.ok(cities("다셋", pm) == [], "unknown 은 미확정")
        H.ok(cities("라넷", pm) == ["서울"], "옛 배열 형식은 확정으로 본다(하위호환)")
        H.ok(cities("대구", pm) == ["대구"], "사전에 없으면 키워드 규칙(확정)")
        # 엣지 — "거점 없음"(points 비움: 원주·춘천 등 철도 거점이 없는 지역)도 미확정과 똑같이 []. 둘 다 구간을 정할 수 없어 A 가 될 수 없다(2026-11-20).
        #   엔진 확인: 거점없음 high(points 비움) → cities=[] → C 운임표만 일치
        #             모름 unknown              → cities=[] → C
        #             low(points 있음)          → cities=[] → C
        #             확정 high(points 있음)     → cities=['대구'] → A 업무상 확정(운임표)
        pm2 = {"에가": {"points": ["서울"]}, "비가": {"confidence": "high"}, "공가": {"points": [], "confidence": "high"}, "널가": None}
        H.ok(cities("에가", pm2) == [], "confidence 가 없으면 high 가 아니므로 미확정(high 만 확정)")
        H.ok(cities("비가", pm2) == [], "points 가 없으면 돌려줄 지점이 없어 미확정")
        H.ok(cities("공가", pm2) == [], "points 를 비운 high 는 '거점 없음' — 모름과 똑같이 구간을 정할 수 없으므로 미확정이 맞다")
        #  '에가·비가·공가' 는 TRIP_PAT 에 걸리지 않는 이름이라 "사전에서 미확정"과 "키워드 규칙으로 내려가 우연히 빈 배열"이 구별되지 않는다.
        #  키워드에 걸리는 이름으로 한 번 더 — 사전 항목이 있으면 키워드 규칙으로 내려가지 않는다는 것을 잠근다
        H.ok(cities("대구", {"대구": {"points": [], "confidence": "high"}}) == [],
             "키워드에 걸리는 이름이라도 사전이 '거점 없음'이면 미확정 — 키워드 규칙으로 내려가지 않는다")
        H.ok(cities("널가", pm2) == [] and cities("대구", {"대구": None}) == ["대구"],
             "사전 값이 null 이면 항목이 없는 것으로 보아 키워드 규칙으로 — 안 걸리는 이름은 [], 걸리는 이름은 그 도시")
        # 49,600 원: 대구→서울 운임표(43,800)와 맞지 않는 금액 — 출발지가 확정이면 구간 거리를 적용하고, 미확정이면 운임만으로 구간을 추정한다
        rh = c("가하나", "서울", 49600, "", {"가하나": {"points": ["대구"], "confidence": "high"}})
        rl = c("가하나", "서울", 49600, "", {"가하나": {"points": ["대구"], "confidence": "low"}})
        H.ok(rh["km"] == 286.7 and "동대구-서울" in rh["basis"], f"high 면 출발지가 대구로 확정 — {rh['km']}km {rh['basis']}")
        H.ok(rl["km"] != rh["km"] and "동대구-서울" not in rl["basis"], f"같은 금액·장소명이라도 low 면 출발지 미확정 — 산정이 달라짐 — {rl['km']}km {rl['basis']}")

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

        H.test_name("입석·자유석 왕복은 후보가 아니다 (2026-11-20)")
        on("")
        #  62,700 = SRT 동대구–수서 입석 31,400 + 서대구–수서 입석 31,300 → 변경 전에는 '두 편 모두 입석 왕복' 으로 B 였다
        r = c("대구", "서울", 62700)
        H.ok(r["legs"] == 1 and "입석" not in r["basis"], f"62,700 — 두 편 모두 할인 좌석인 왕복은 후보에서 빠진다 — {r['gradeLabel']} {r['basis']}")
        r = c("대구", "세종", 40900)
        H.ok(r["legs"] == 2 and "입석" in r["basis"], f"대구→세종 40,900 — 한쪽만 입석인 왕복은 그대로 남는다 — {r['basis']}")

        H.test_name("×1.4 산식 특실과 운임표 특실 구분 (2026-11-21)")
        on("")
        r = c("대구", "서울", 60800)   # 43,400(43,100 + 0.6% 할증) × 1.4 — 산식
        H.ok(r.get("x14") is True, f"60,800 은 ×1.4 산식에서 나온 특실 — {r['basis']}")
        r = c("대구", "서울", 60900)   # 운임표의 특실 금액
        H.ok(r.get("x14") is False and "특실" in r["basis"] and r["legs"] == 1, f"60,900 은 운임표의 특실 금액 — {r['basis']}")
        r = c("대구", "서울", 41300)   # 특실이 아닌 일반 금액
        H.ok(r.get("x14") is False, f"일반실 금액은 x14 false — {r['basis']}")
        r = c("대구", "부산", 33600)   # 두 구간 합
        H.ok(r.get("x14") is False and r["legs"] == 2 and "특실" in r["basis"], f"두 구간이어도 산식이 없으면 x14 는 서지 않는다(왕복이면 무조건 true 인 버그 방지) — 대구→부산 33,600 = 운임표 특실 16,800 × 2 — x14={r.get('x14')} {r['basis']}")
        r = c("대구", "서울", 109100)   # 48,300(운임표 특실) + 60,800(43,400 × 1.4 산식)
        H.ok(r.get("x14") is True and r["legs"] == 2 and r["km"] == 573.4,
             f"두 구간 중 한 편만 ×1.4 산식이어도 x14 가 선다 — 그래서 이 행은 작업 5 에서 A 가 되지 않는다 — x14={r.get('x14')} {r['legs']}회 {r['km']}km {r['basis']}")

        H.test_name("새 A 정의 — 구간·횟수가 무가정으로 확정 (2026-11-20)")
        on("")
        r = c("대구", "서울", 43100)
        H.ok(r["grade"] == "A" and r["km"] == 286.7, f"정차역 할인 금액도 장소가 맞으면 A — {r['gradeLabel']} {r['basis']}")
        r = c("대구", "서울", 60900)
        H.ok(r["grade"] == "A" and r["legs"] == 1 and r["km"] == 286.7, f"운임표 특실 편도는 A — {r['gradeLabel']}")
        r = c("대구", "서울", 60800)
        H.ok(r["grade"] != "A", f"×1.4 산식 특실은 A 가 아니다 — {r['gradeLabel']}")
        r = c("서울", "서울", 43500)
        H.ok(r["grade"] != "A", f"선이동(서울→서울)은 A 가 아니다 — {r['gradeLabel']}")
        r = c("대구", "부산", 87000)
        H.ok(r["grade"] != "A" and "기관 판정기준" in r["gradeLabel"], f"기관 기준표 금액만 맞으면 A 아님, 거리는 기준표 값 — {r['gradeLabel']} {r['km']}")
        r = c("비상임감사집무실", "서울", 43100)
        H.ok(r["grade"] != "A", f"장소를 모르면 금액이 맞아도 A 아님 — {r['gradeLabel']}")
        #  87,000 은 43,500 × 2 = 왕복 1회다. 왕복 1회는 산술이라 가정으로 보지 않는다(설계서 §4) → 일수와 무관하게 A.
        #  (브리프 Step 1 은 이 금액을 '왕복 n회' 로 적었으나 n ≥ 2 가 되는 금액은 174,000 이다 — 설계서 §4 를 따랐다)
        r = c("대구", "서울", 87000, days=3)
        H.ok(r["grade"] == "A" and r["legs"] == 2 and r["km"] == 573.4, f"왕복 1회는 가정이 아니므로 A — {r['gradeLabel']} {r['legs']}")
        r = c("대구", "서울", 174000, days=3)
        H.ok(r["grade"] != "A" and r["legs"] == 4 and r["km"] == 1146.8, f"왕복 n회(n≥2)는 가정이므로 A 아님 — {r['gradeLabel']} {r['legs']}")
        #  Ruling I — 왕복 n회 경로(base(f/k))의 x14 전파: 218,200 = 109,100 × 2 이고 109,100 = 48,300(운임표 특실) + 60,800(43,400 × 1.4 산식)
        r = c("대구", "서울", 218200, days=3)
        H.ok(r.get("x14") is True and r["grade"] != "A", f"왕복 n회 경로에서도 ×1.4 산식 표시가 전파되고 A 가 아니다 — x14={r.get('x14')} {r['gradeLabel']}")
        #  ② 가 허용하는 것: 운임표에 적힌 특실 금액(60,900 = 동대구–서울 특실 운임)과 입석·자유석 (16,400 = 대전–동대구 19,300 의 입석 15% 할인, 공식 거리 126.9km)
        r = c("대구", "서울", 60900)
        H.ok(r["grade"] == "A" and r["gradeLabel"] == "A 업무상 확정(사용자 확인)", f"운임표 특실 60,900 은 L2 라벨이 먼저 A 로 확정한다 — {r['gradeLabel']}")
        r = c("대구", "서울", 60300)
        H.ok(r["grade"] == "A" and r["gradeLabel"] == "A 업무상 확정(운임표 특실)", f"라벨이 없는 운임표 특실(60,300)은 규칙으로 ② 를 통과한다 — {r['gradeLabel']}")
        r = c("대구", "대전", 16400)
        H.ok(r["grade"] == "A" and r["gradeLabel"] == "A 업무상 확정(좌석 종류)" and r["legs"] == 1 and r["km"] == 126.9 and "입석" in r["basis"],
             f"입석도 ② 를 통과한다 — 종전에는 대구–서울 자유석만 예외적으로 A 였다 — {r['gradeLabel']} {r['basis']}")

        H.ok(not errors, f"JS 오류 없음 — {errors[:2]}")
        br.close()
    return H.summary()


if __name__ == "__main__":
    import sys
    sys.exit(0 if run() else 1)
