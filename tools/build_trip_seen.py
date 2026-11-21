"""
관내출장 엑셀 → js/trip-data.js 안의 '반복 확인된 파생 금액' 목록 (TRIP_SEEN)

    python tools/build_trip_seen.py <관내출장.xls> js/trip-data.js

할증(통합 전 KTX 0.6%)·정차역 할인(SRT·통합 뒤 KTX 0.2%)으로 운임표 금액에서 파생한 금액과 '왕복 n회'로 맞춘 금액은,
같은 구간·기간(운임 개편 전/후)·금액이 자료에 3번 이상 나온 것만 A(업무상 확정)로 본다.
한두 번만 나온 파생 금액은 우연히 맞았을 수 있어 B 로 둔다. 이 목록이 그 기준이다.

js/trip-data.js 의 /* @trip-seen-start */ … /* @trip-seen-end */ 사이를 새로 쓴다(없으면 @trip-fare-end 뒤에 넣음).
산정 엔진은 js/trip-engine.js 를 그대로 읽어 브라우저에 넣는다.
원본 엑셀(장소명이 들어 있음)은 저장소에 넣지 않는다. 목록에는 도시쌍·기간·금액·건수만 들어간다.
"""
import json
import pathlib
import re
import sys
from collections import Counter

import xlrd
from playwright.sync_api import sync_playwright

MIN = 3
ROOT = pathlib.Path(__file__).resolve().parent.parent


def block(src, start, end):
    m = re.search(re.escape(start) + r"(.*?)" + re.escape(end), src, re.S)
    return m.group(1) if m else ""


def main(xls, out):
    html = open(out, encoding="utf-8").read()
    engine = (ROOT / "js" / "trip-engine.js").read_text(encoding="utf-8")
    ref = block(html, "/* @trip-ref-start */", "/* @trip-ref-end */")
    fare = block(html, "/* @trip-fare-start */", "/* @trip-fare-end */")
    assert ref and fare, f"{out} 에서 기준표(@trip-ref · @trip-fare)를 찾지 못했습니다"

    wb = xlrd.open_workbook(xls)
    sheets = {sh.name: [sh.row_values(i) for i in range(sh.nrows)] for sh in wb.sheets()}

    with sync_playwright() as pw:
        br = pw.chromium.launch()
        page = br.new_page()
        page.set_content("<!doctype html><title>seen</title>")
        page.add_script_tag(content=ref + "\n" + fare)   # TRIP_SEEN 없이 돌려야 파생 금액이 모두 A 후보로 나온다
        page.add_script_tag(content=engine + "\nwindow.__ref = tripBuildRef(window.TRIP_REF, window.TRIP_FARE);")
        keys = page.evaluate("""sheets => {
            const out = [];
            for (const [name, grid] of Object.entries(sheets)) {
                for (const row of tripParseSheet(name, grid).rows) {
                    if (row.mode !== '철도운임' || !(row.fare > 0)) continue;
                    const r = classifyRail(row, window.__ref, {});
                    if (r.seenKey && (r.grade === 'A' || /×[0-9]+$/.test(r.seenKey))) out.push(r.seenKey);
                }
            }
            return out;
        }""", sheets)
        br.close()

    cnt = Counter(keys)
    kept = {k: n for k, n in sorted(cnt.items()) if n >= MIN}
    seen = {"version": "2026-11-18", "source": "관내출장 철도 행 2023-01 ~ 2026-10", "min": MIN, "keys": kept}
    blk = ("/* @trip-seen-start */\n"
           "/* 출장(철도) 반복 확인된 파생 금액 — tools/build_trip_seen.py 가 만든 블록 (직접 고치지 마세요) */\n"
           "window.TRIP_SEEN = " + json.dumps(seen, ensure_ascii=False, separators=(",", ":")) + ";\n"
           "/* @trip-seen-end */")
    s, e = html.find("/* @trip-seen-start */"), html.find("/* @trip-seen-end */")
    if s >= 0:
        html = html[:s] + blk + html[e + len("/* @trip-seen-end */"):]
    else:
        anchor = "/* @trip-fare-end */"
        html = html.replace(anchor, anchor + "\n" + blk)
    open(out, "w", encoding="utf-8").write(html)
    print(f"파생 금액 {len(cnt)}가지(행 {sum(cnt.values())}) 중 {MIN}번 이상 {len(kept)}가지(행 {sum(kept.values())}) → {out}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
