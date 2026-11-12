"""
기상연동 예측 모델 검증 — index.html 의 @model-start … @model-end 블록을 그대로 꺼내
성질을 아는 표본에 돌려 본다. (화면을 띄우지 않고 모델 코드만 평가)

모델:  pred[m] = 같은 달 평균(학습연도) + kH·ΔHDD + kC·ΔCDD
"""
import pathlib
import re

from playwright.sync_api import sync_playwright

import harness as H

HTML = pathlib.Path(__file__).resolve().parent.parent / "index.html"
MOS = [f"{m:02d}" for m in range(1, 13)]


def model_source():
    """index.html 에서 모델 순수 함수만 꺼낸다."""
    src = HTML.read_text(encoding="utf-8")
    m = re.search(r"/\* @model-start.*?\*/(.*?)/\* @model-end \*/", src, re.S)
    assert m, "@model-start … @model-end 블록을 찾지 못했습니다"
    return m.group(1)


# ─── 표본 만들기 ──────────────────────────────────
# 월별 냉난방도일 (기준 18℃) — 대구 비슷한 계절성
HDD = [520, 430, 300, 110, 15, 0, 0, 0, 0, 90, 290, 470]
CDD = [0, 0, 0, 5, 60, 140, 260, 250, 120, 15, 0, 0]


def make_wx(years, hdd_scale=None):
    """{'YYYY-MM': {hdd, cdd, full}}  · hdd_scale: 연도별 배율 (추위 변동)"""
    wx = {}
    for y in years:
        s = (hdd_scale or {}).get(y, 1.0)
        for i, m in enumerate(MOS):
            wx[f"{y}-{m}"] = {"hdd": HDD[i] * s, "cdd": CDD[i], "full": True}
    return wx


def make_hist(years, base=800_000, kh=0.0, kc=0.0, yearly=1.0, hdd_scale=None):
    """사용량 = base·(연도 배율) + kh·HDD + kc·CDD"""
    hist = {}
    for n, y in enumerate(years):
        s = (hdd_scale or {}).get(y, 1.0)
        for i, m in enumerate(MOS):
            hist[f"{y}-{m}"] = base * (yearly ** n) + kh * HDD[i] * s + kc * CDD[i]
    return hist


def run_model(page, hist, wx, train_years, cur_year, use_wx):
    return page.evaluate(
        """([hist, wx, train, cur, useWx]) =>
             { const r = forecastMonthly(hist, wx, train, cur, useWx);
               return { pred: r.map(x => x.pred), kH: r.kH, kC: r.kC, yrRate: r.yrRate }; }""",
        [hist, wx, train_years, cur_year, use_wx],
    )


def pct_err(pred, truth):
    """평균 절대 퍼센트 오차 (MAPE, %)"""
    xs = [abs(p - t) / t * 100 for p, t in zip(pred, truth) if p is not None and t]
    return sum(xs) / len(xs) if xs else None


def run():
    page_src = model_source()
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        page = br.new_page()
        page.set_content("<!doctype html><title>model</title>")
        page.add_script_tag(content=page_src)

        # ── 1. 해마다 똑같으면 그대로 맞혀야 한다 ──
        H.test_name("일정한 사용량")
        yrs = ["2024", "2025"]
        hist = make_hist(yrs)
        wx = make_wx(yrs + ["2026"])
        r = run_model(page, hist, wx, yrs, "2026", True)
        H.ok(all(p is not None for p in r["pred"]), f"12개월 모두 예측 — {sum(p is not None for p in r['pred'])}개")
        H.ok(pct_err(r["pred"], [800_000] * 12) < 0.01,
             f"오차 거의 0 — MAPE {pct_err(r['pred'], [800_000]*12):.4f}%")

        # ── 2. 기온이 끌고 가는 사용량이면 민감도를 되찾아야 한다 ──
        H.test_name("기온 민감도 복원")
        yrs = ["2024", "2025"]
        scale = {"2024": 0.85, "2025": 1.15}      # 학습연도끼리 추위가 달라야 기울기가 보임
        hist = make_hist(yrs, base=500_000, kh=300, hdd_scale=scale)
        wx = make_wx(yrs + ["2026"], hdd_scale=scale)
        r = run_model(page, hist, wx, yrs, "2026", True)
        H.ok(abs(r["kH"] - 300) / 300 < 0.05, f"kH ≈ 300 — got {r['kH']:.1f}")
        H.ok(r["kC"] < 1, f"kC ≈ 0 (냉방 영향 없음) — got {r['kC']:.2f}")

        # ── 2-b. 추위가 심했던 해를 '늘어나는 추세'로 오해하면 안 된다 ──
        #        (2025년이 2024년보다 추워서 총량은 늘었지만, 실제 추세는 없음)
        H.test_name("날씨를 추세로 오해하지 않기")
        H.ok(abs(r["yrRate"] - 1) < 0.01,
             f"연변화율 ≈ 1.00 — got {r['yrRate']:.4f} (날씨 몫을 빼고 계산)")

        # ── 3. 날씨 보정을 끄면 기울기가 0이고 같은 달 평균이 바탕이 된다 ──
        H.test_name("날씨 보정 끄기")
        flat_y = ["2024", "2025"]
        flat_h = make_hist(flat_y)                      # 추세도 날씨 변동도 없는 자료
        flat_w = make_wx(flat_y + ["2026"])
        r = run_model(page, flat_h, flat_w, flat_y, "2026", False)
        H.ok(r["kH"] == 0 and r["kC"] == 0, f"기울기 0 — kH {r['kH']}, kC {r['kC']}")
        exp = [(flat_h[f"2024-{m}"] + flat_h[f"2025-{m}"]) / 2 for m in MOS]
        H.ok(pct_err(r["pred"], exp) < 0.01, "같은 달 평균과 일치")

        # ── 4. 실적이 있는 달은 예측하지 않는다 ──
        H.test_name("실적 있는 달")
        yrs = ["2024", "2025"]
        hist = make_hist(yrs)
        hist["2026-01"] = 777_000
        wx = make_wx(yrs + ["2026"])
        r = run_model(page, hist, wx, yrs, "2026", True)
        H.ok(r["pred"][0] is None, f"1월은 예측 없음 — got {r['pred'][0]}")
        H.ok(r["pred"][1] is not None, "2월은 예측 있음")

        # ── 5. 감축 추세가 있을 때 (이 기관의 실제 상황) ──
        H.test_name("감축 추세")
        yrs = ["2024", "2025"]
        drop = 0.92                                  # 해마다 8% 감축 중
        hist = make_hist(yrs, base=800_000, yearly=drop)
        wx = make_wx(yrs + ["2026"])
        r = run_model(page, hist, wx, yrs, "2026", True)
        truth = [800_000 * drop ** 2] * 12           # 추세가 이어지면 2026년 실제값
        got = r["pred"][0]
        bias = (got - truth[0]) / truth[0] * 100
        H.ok(True, f"2026 실제(추세 유지) {truth[0]:,.0f} · 모델 예측 {got:,.0f}")
        H.ok(abs(bias) < 2.0,
             f"추세 반영 오차 2% 이내 — 실제로는 {bias:+.1f}% (양수 = 과대예측)")
        H.ok(abs(r["yrRate"] - drop) < 0.005, f"연변화율 ≈ {drop} — got {r['yrRate']:.4f}")

        # ── 6. 날씨와 무관한 항목(차량연료·재생에너지)도 추세는 따라가야 한다 ──
        H.test_name("추세 — 날씨 보정 없는 항목")
        r = run_model(page, hist, wx, yrs, "2026", False)
        bias = (r["pred"][0] - truth[0]) / truth[0] * 100
        H.ok(abs(bias) < 2.0, f"추세 반영 오차 2% 이내 — {bias:+.1f}%")

        # ── 7. 자료가 튀어도 예측이 멀리 가지 않아야 한다 (추세 상한) ──
        H.test_name("추세 상한")
        yrs = ["2024", "2025"]
        hist = make_hist(yrs, base=800_000, yearly=0.3)   # 1년 만에 70% 급감 = 자료 이상
        wx = make_wx(yrs + ["2026"])
        r = run_model(page, hist, wx, yrs, "2026", True)
        H.ok(r["yrRate"] >= 0.85 - 1e-9, f"연변화율이 0.85 아래로 안 내려감 — got {r['yrRate']:.4f}")
        H.ok(r["pred"][0] > 0, f"예측이 0으로 붕괴하지 않음 — {r['pred'][0]:,.0f}")

        # ── 8. 학습연도가 한 해뿐이면 추세를 쓰지 않는다 ──
        H.test_name("학습연도 1개")
        r = run_model(page, make_hist(["2025"]), make_wx(["2025", "2026"]), ["2025"], "2026", True)
        H.ok(r["yrRate"] == 1, f"연변화율 1 고정 — got {r['yrRate']}")
        H.ok(pct_err(r["pred"], [800_000] * 12) < 0.01, "작년 값 그대로")

        br.close()
    return H.summary()
