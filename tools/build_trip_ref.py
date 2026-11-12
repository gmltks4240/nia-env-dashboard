"""
운임·거리 엑셀(NIA_Scope3_KTX_SRT_…xlsx) → data/trip-ref.js

    python tools/build_trip_ref.py <운임표.xlsx> data/trip-ref.js

시트: 출장운임_판정기준 · KTX_주요일반실 · SRT_일반실505 · 공식운행거리1412
같은 역쌍에 거리가 여럿이면 거리표ID가 가장 앞선 표(표1, 고속선 대표 경로)를 쓴다.
"""
import json
import sys

import openpyxl

VERSION = "2026-11-12"


def main(src, out):
    wb = openpyxl.load_workbook(src, data_only=True)
    rows = lambda name: list(wb[name].iter_rows(min_row=2, values_only=True))

    judgment = []
    for label, train, fare, count, km, *_ in rows("출장운임_판정기준"):
        km_q = "공식"
        if km is None:
            km, km_q = 269.2, "추정"
        if train == "SRT":
            km_q = "추정"
        judgment.append(dict(fare=fare, train=train, legs=1 if "편도 1회" in count else 2,
                             km=km, kmQ=km_q, label=label))

    fares, seen = [], set()
    for train, sheet in (("KTX", "KTX_주요일반실"), ("SRT", "SRT_일반실505")):
        for _, a, b, fare, *_ in rows(sheet):
            key = (frozenset((a, b)), fare)
            if key in seen:
                continue
            seen.add(key)
            fares.append(dict(a=a, b=b, fare=fare, train=train))

    best = {}
    for table_id, _, a, b, km, *_ in rows("공식운행거리1412"):
        key = tuple(sorted((a, b)))
        if key not in best or table_id < best[key][0]:
            best[key] = (table_id, km)
    dist = [[a, b, km] for (a, b), (_, km) in sorted(best.items())]

    ref = dict(
        version=VERSION,
        source="한국철도공사 철도운행거리 2024-09-01 · KTX 주요 일반실 운임 · SR 운임현황 2026.8 · NIA 출장운임 판정기준",
        factors=dict(rail=0.0219, gangneung=0.0716),
        judgment=judgment, fares=fares, dist=dist,
    )
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("/* 출장(철도) 산정 기준표 — tools/build_trip_ref.py 가 만든 파일 (직접 고치지 마세요) */\n")
        fh.write("window.TRIP_REF = " + json.dumps(ref, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"판정 {len(judgment)}행 · 운임 {len(fares)}개 · 거리 역쌍 {len(dist)}개 → {out}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
