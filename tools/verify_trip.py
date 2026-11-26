"""
A 등급 검증 — "A 가 정말 A 인가"를 자료 안에서 확인한다

    python tools/verify_trip.py <관내출장.xls>

실제 이동 기록(정답)이 없으므로 A 를 확률로 검증할 수는 없다(설계서 2026-11-20 §2).
대신 **틀렸다는 증거가 있는지**를 세 가지로 찾는다. 셋 다 통과해도 '맞다'는 증명은 아니고,
'흔한 방식으로는 틀린 흔적이 없다'는 뜻이다. 진짜 검증은 승차권(파일첨부) 표본 대조뿐이다.

1. 방문처 교차  — 엔진이 **쓰지 않는** `방문처` 칸이 가리키는 도시와 산정 구간이 어긋나는 A 행을 센다.
                 독립 증거이므로 어긋남은 오류의 **하한**이 된다.
2. 장소 셔플    — 출발·경유·목적을 행끼리 무작위로 섞어 돌린다. 도시쌍이 실제로 바뀐 행만 보고
                 A 비율이 얼마나 떨어지는지 본다. 거의 안 떨어지면 장소 증거가 구속하지 않는다는 뜻이다.
                 남는 비율은 '장소가 틀렸을 때 금액이 우연히 맞을 확률'(과녁 넓이)이다.
3. 금액 흔들기  — A 행의 교통비를 ±100 ~ ±1,000원 바꿔 A 가 유지되는지, 유지될 때 **거리가 바뀌는지** 본다.
                 A 의 목적은 거리 확정이므로, 과녁이 넓어도 거리가 그대로면 배출량에는 해가 없다.
                 거리가 바뀌는 행은 교통비 오기 한 번에 배출량이 달라지는 행이다.

출력은 건수·비율만 담는다. 원본 장소명은 1번의 어긋난 방문처 예시에만, 사람이 판단할 수 있도록 나온다.
"""
import argparse
import datetime
import pathlib
import random
from collections import Counter

import xlrd
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

EVAL = """([rows, pm]) => rows.map(r => {
    const x = classifyRail({ origin: r.origin, via: r.via, dest: r.dest, fare: r.fare, days: r.days, date: r.date }, window.__ref, pm);
    const seg = [...new Set([...tripCities(r.origin, pm), ...tripCities(r.via, pm), ...tripCities(r.dest, pm)])].sort();
    return { g: x.grade, km: x.km, legs: x.legs, seg, visit: tripCities(r.visit || '', pm) };
})"""


def load(xls):
    sh = xlrd.open_workbook(xls).sheets()[0]
    top = [str(v).strip() for v in sh.row_values(1)]
    sub = [str(v).strip() for v in sh.row_values(2)]
    name = [a or b for a, b in zip(top, sub)]
    need = ("교통편", "출발지", "경유지", "목적지", "교통비")
    miss = [k for k in need if k not in name]
    assert not miss, f"머리글에서 {miss} 를 찾지 못했습니다"
    I = {k: name.index(k) for k in need}
    iS = sub.index("출장시작일") if "출장시작일" in sub else name.index("출장시간")
    iD = name.index("출장일수") if "출장일수" in name else -1
    iV = name.index("방문처") if "방문처" in name else -1
    out = []
    for r in range(3, sh.nrows):
        v = sh.row_values(r)
        if str(v[I["교통편"]]).strip() != "철도운임":
            continue
        d = v[iS]
        out.append({
            "origin": str(v[I["출발지"]]).strip(), "via": str(v[I["경유지"]]).strip(),
            "dest": str(v[I["목적지"]]).strip(), "fare": float(v[I["교통비"]] or 0),
            "visit": str(v[iV]).strip() if iV >= 0 else "",
            "date": (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(d))).isoformat() if isinstance(d, float) else "",
            "days": int(float(v[iD])) if iD >= 0 and str(v[iD]).strip() else None,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xls")
    ap.add_argument("--seed", type=int, default=7, help="장소 셔플 씨앗 (바꿔 돌려 안정성을 본다)")
    a = ap.parse_args()
    rows = load(a.xls)

    with sync_playwright() as pw:
        br = pw.chromium.launch()
        page = br.new_page()
        page.set_content("<!doctype html><title>verify</title>")
        page.add_script_tag(content=(ROOT / "js" / "trip-data.js").read_text(encoding="utf-8"))
        page.add_script_tag(content=(ROOT / "js" / "trip-engine.js").read_text(encoding="utf-8")
                            + "\nwindow.__ref = tripBuildRef(window.TRIP_REF, window.TRIP_FARE);")

        def run(rs):
            out = []
            for k in range(0, len(rs), 8000):
                out += page.evaluate(EVAL, [rs[k:k + 8000], {}])
            return out

        base = run(rows)
        A = [i for i, o in enumerate(base) if o["g"] == "A"]
        calc = [o for o in base if o["g"] != "제외"]
        print(f"철도 {len(rows):,}행 · 산정 {len(calc):,} · A {len(A):,} ({len(A) / len(calc) * 100:.1f}%)")

        # ── 1. 방문처 교차 ───────────────────────────────
        withv = [i for i in A if base[i]["visit"]]
        bad = [i for i in withv if not set(base[i]["visit"]) & set(base[i]["seg"])]
        print(f"\n[1] 방문처 교차 — 엔진이 쓰지 않는 독립 증거")
        if not withv:
            print("    방문처 칸이 없어 건너뜀")
        else:
            print(f"    방문처가 도시로 풀리는 A 행 {len(withv):,} · 구간과 어긋남 {len(bad):,} ({len(bad) / len(withv) * 100:.2f}%)")
            print("    어긋난 예시 (방문처 → 그 도시 vs 산정 구간) — 회사 이름이 지명과 같은 경우가 섞여 있다:")
            ex = Counter((rows[i]["visit"], "+".join(base[i]["visit"]), "+".join(base[i]["seg"])) for i in bad)
            for (v, vc, seg), n in ex.most_common(10):
                print(f"      {n:>4,}  {v[:28]:<28} → {vc:<10} vs {seg}")

        # ── 2. 장소 셔플 ─────────────────────────────────
        random.seed(a.seed)
        idx = list(range(len(rows)))
        random.shuffle(idx)
        srows = [{**rows[i], "origin": rows[j]["origin"], "via": rows[j]["via"], "dest": rows[j]["dest"]}
                 for i, j in enumerate(idx)]
        sout = run(srows)
        chg = [i for i in range(len(rows)) if base[i]["g"] != "제외" and base[i]["seg"] != sout[i]["seg"]]
        ba = sum(1 for i in chg if base[i]["g"] == "A")
        sa = sum(1 for i in chg if sout[i]["g"] == "A")
        print(f"\n[2] 장소 셔플 (씨앗 {a.seed}) — 도시쌍이 실제로 바뀐 {len(chg):,}행만")
        print(f"    원래 장소 A {ba / len(chg) * 100:.1f}%  →  섞은 장소 A {sa / len(chg) * 100:.1f}%"
              f"  (떨어진 폭 {ba / len(chg) * 100 - sa / len(chg) * 100:.1f}%p)")
        print(f"    남은 {sa / len(chg) * 100:.1f}% = 장소가 틀렸을 때 금액이 우연히 맞을 확률(과녁 넓이)")

        # ── 3. 금액 흔들기 ───────────────────────────────
        print(f"\n[3] 금액 흔들기 — A {len(A):,}행")
        print(f"    {'흔든 금액':>10}{'A 유지':>10}{'거리 같음':>11}{'거리 다름':>11}{'횟수 다름':>11}")
        for d in (100, -100, 500, -500, 1000, -1000):
            o = run([{**rows[i], "fare": rows[i]["fare"] + d} for i in A])
            keep = [(base[i], x) for i, x in zip(A, o) if x["g"] == "A"]
            same = sum(1 for b, x in keep if abs(b["km"] - x["km"]) < 0.05)
            legs = sum(1 for b, x in keep if b["legs"] != x["legs"])
            print(f"    {d:>+9,}원{len(keep):>10,}{same:>11,}{len(keep) - same:>11,}{legs:>11,}"
                  f"   거리 바뀜 {(len(keep) - same) / len(A) * 100:>4.1f}% of A")
        br.close()

    print("\n거리가 바뀌는 행 = 교통비가 100원만 달라도 배출량이 달라지는 행. 이 비율이 A 의 취약점이다.")
    print("진짜 검증은 승차권(파일첨부) 표본 대조뿐이다 — 이 도구로는 '틀린 흔적이 없다'까지만 말할 수 있다.")


if __name__ == "__main__":
    main()
