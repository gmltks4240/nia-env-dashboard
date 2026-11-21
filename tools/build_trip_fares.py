"""
코레일 KTX 운임표(.xls) → js/trip-data.js 안의 기간별 운임표

    python tools/build_trip_fares.py <2025 KTX 운임표.xls> <2026 KTX 운임표.xls> js/trip-data.js

js/trip-data.js 의 /* @trip-fare-start */ … /* @trip-fare-end */ 사이를 새로 씁니다(없으면 @trip-ref-end 바로 뒤에 넣음).

· 2025년판 = 2026-08-31 까지 · 2026년판 = 2026-09-01(KTX·SRT 통합, 운임 평균 10% 인하)부터
· 한 행 = [역, 역, 일반실 운임, 특실 계(없으면 0)] — 같은 역쌍이 경로(경주·구포·수원 경유 등)에 따라 운임이 여럿일 수 있어 모두 둠
· 기준표(@trip-ref)의 거리표에 있는 역(과 수서·서대구)끼리의 행만 넣음: 거리를 모르는 구간은 산정에 쓰지 못하므로
· 강릉선(서울–횡성·둔내·평창·진부·강릉)은 일반실(A) 운임을 gangneung 에 따로 둠
"""
import json
import re
import sys

import xlrd

CUTOVER = "2026-09-01"
GANG = ["횡성", "둔내", "평창", "진부", "강릉"]


def parse(path):
    """모든 시트의 (역, 역, 일반실 운임, 특실 계) · 일반실(A)/(B) 가 있는 시트는 (A)"""
    out = []
    for sh in xlrd.open_workbook(path).sheets():
        h = next(i for i in range(12) if any("일반실" in str(v) for v in sh.row_values(i)))
        top = [str(v).replace(" ", "") for v in sh.row_values(h)]
        gi = next(i for i, v in enumerate(top) if v.startswith("일반실"))
        si = next((i for i, v in enumerate(top) if v == "특실"), None)
        for r in range(h + 2, sh.nrows):
            v = sh.row_values(r)
            if not (isinstance(v[1], str) and isinstance(v[2], str) and v[1].strip() and v[2].strip() and isinstance(v[gi], float)):
                continue
            sp = int(v[si + 2]) if si is not None and isinstance(v[si + 2], float) else 0
            out.append((v[1].strip(), v[2].strip(), int(v[gi]), sp))
    return out


def main(pre, post, out):
    html = open(out, encoding="utf-8").read()
    m = re.search(r"window\.TRIP_REF = (\{.*?\});\n/\* @trip-ref-end \*/", html, re.S)
    assert m, f"{out} 에서 기준표(@trip-ref)를 찾지 못했습니다"
    known = {s for a, b, _ in json.loads(m.group(1))["dist"] for s in (a, b)} | {"수서", "서대구"}

    periods, gang = [], {}
    for label, path, frm, to in (("2025", pre, None, "2026-08-31"), ("2026", post, CUTOVER, None)):
        rows = parse(path)
        keep = sorted({(min(a, b), max(a, b), f, sp) for a, b, f, sp in rows if a in known and b in known})
        g = {s: sorted({f for a, b, f, _ in rows if {a, b} == {"서울", s}}) for s in GANG}
        assert all(len(v) == 1 for v in g.values()), f"강릉선 운임을 읽지 못했습니다: {g}"
        gang[label] = {s: v[0] for s, v in g.items()}
        periods.append({"label": f"코레일 KTX 운임표 {label}", "from": frm, "to": to, "rows": [list(r) for r in keep]})
        print(f"{label}: 전체 {len(rows)}행 → 거리표에 있는 역쌍 {len(keep)}행")
    assert gang["2025"] == gang["2026"], "강릉선 운임이 두 해가 다릅니다 — 기간별로 나눠야 합니다"

    fare = {"version": "2026-11-17", "source": "한국철도공사 KTX 운임표 2025년판(2024-12 저장) · 2026년판(2026-10 저장, 통합 후)",
            "cutover": CUTOVER, "gangneung": gang["2026"], "periods": periods}
    block = ("/* @trip-fare-start */\n"
             "/* 출장(철도) 기간별 KTX 운임표 — tools/build_trip_fares.py 가 만든 블록 (직접 고치지 마세요) */\n"
             "window.TRIP_FARE = " + json.dumps(fare, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + ";\n"
             "/* @trip-fare-end */")
    s, e = html.find("/* @trip-fare-start */"), html.find("/* @trip-fare-end */")
    if s >= 0:
        html = html[:s] + block + html[e + len("/* @trip-fare-end */"):]
    else:
        anchor = "/* @trip-ref-end */"
        assert anchor in html
        html = html.replace(anchor, anchor + "\n" + block)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"강릉선 {fare['gangneung']} → {out}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
