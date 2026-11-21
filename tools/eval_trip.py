"""
관내출장 엑셀 → 출장(철도) Scope 3 재산정·평가표

    python tools/eval_trip.py <관내출장.xls> [--places <장소사전.json>]

js/trip-engine.js 와 js/trip-data.js 를 그대로 브라우저에 넣고 모든 행을 산정해,
A 등급 재정의(2026-11-20) 뒤의 분포·총 배출량과 라벨 우선순위를 낸다.
화면·DB 를 거치지 않으므로 대시보드에 저장되는 값과 같은 코드로 같은 값이 나온다.

출력은 **도시·금액·건수만** 담는다. 원본 장소명은 출력하지 않는다(저장소·문서에 남기지 않기 위해).
장소 사전(--places)은 비공개라 저장소에 없다. 주지 않으면 키워드 규칙만으로 산정한다
(2026-11-18 수치도 사전 없이 낸 값이라 그대로 비교할 수 있다).

측정 항목은 docs/HANDOFF-trip-scope3.md 의 '작업 9 의 필수 측정 항목' 을 따른다.
"""
import argparse
import json
import pathlib
import sys
from collections import Counter, defaultdict

import xlrd
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 브라우저에서 한 시트를 다 돌려 행별 결과를 돌려준다 (장소명은 가져오지 않는다)
EVAL_JS = """([name, grid, placeMap]) => {
    const parsed = tripParseSheet(name, grid);
    if (parsed.error) return { error: parsed.error };
    const out = [];
    for (const row of parsed.rows) {
        if (row.mode !== '철도운임') { out.push({ mode: row.mode, skip: true }); continue; }
        const r = classifyRail(row, window.__ref, placeMap);
        const oc = tripCities(row.origin, placeMap), dc = tripCities(row.dest, placeMap);
        const vc = row.via ? tripCities(row.via, placeMap) : [];
        out.push({
            year: row.year, month: row.date ? row.date.slice(0, 7) : '', fare: row.fare, days: row.days,
            grade: r.grade, label: r.gradeLabel, legs: r.legs, km: r.km, kg: r.kg, x14: !!r.x14,
            basis: r.basis || '', seenKey: r.seenKey || '',
            oc, dc, vc, overlap: oc.some(c => dc.includes(c)),
        });
    }
    return { rows: out };
}"""


def load(xls):
    wb = xlrd.open_workbook(xls)
    return {sh.name: [sh.row_values(i) for i in range(sh.nrows)] for sh in wb.sheets()}


def city_key(r):
    """라벨 키 — 도시 집합(방향 무관) + 교통비. 장소를 모르면 '미확정'."""
    cities = sorted(set(r["oc"]) | set(r["dc"]) | set(r["vc"]))
    return (("+".join(cities) if cities else "미확정"), r["fare"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xls")
    ap.add_argument("--places", help="장소 사전 JSON {장소: {points, confidence}} (비공개, 없으면 규칙만)")
    ap.add_argument("--top", type=int, default=25, help="라벨 우선순위로 보여 줄 조합 수")
    a = ap.parse_args()

    place_map = json.loads(pathlib.Path(a.places).read_text(encoding="utf-8")) if a.places else {}
    sheets = load(a.xls)
    engine = (ROOT / "js" / "trip-engine.js").read_text(encoding="utf-8")
    data = (ROOT / "js" / "trip-data.js").read_text(encoding="utf-8")

    rows = []
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        page = br.new_page()
        page.set_content("<!doctype html><title>eval</title>")
        page.add_script_tag(content=data)
        page.add_script_tag(content=engine + "\nwindow.__ref = tripBuildRef(window.TRIP_REF, window.TRIP_FARE);")
        for name, grid in sheets.items():
            res = page.evaluate(EVAL_JS, [name, grid, place_map])
            if res.get("error"):
                sys.exit(f"{name}: {res['error']}")
            rows += res["rows"]
        br.close()

    rail = [r for r in rows if not r.get("skip")]
    other = Counter(r["mode"] for r in rows if r.get("skip"))
    calc = [r for r in rail if r["grade"] != "제외"]

    # ── 1) 연도별 분포와 총 배출량 ──────────────────────
    print(f"\n철도 {len(rail):,}행 (산정 {len(calc):,} · 제외 {len(rail) - len(calc):,})"
          f" · 철도 외 {sum(other.values()):,}행 {dict(other)}")
    print("\n== 연도별 ==")
    print(f"{'연도':>6} {'산정':>8} {'A':>8} {'B':>8} {'C':>8} {'D':>8} {'A%':>6} {'만km':>9} {'tCO2e':>8}")
    tot = Counter()
    for y in sorted({r["year"] for r in calc}):
        g = [r for r in calc if r["year"] == y]
        c = Counter(r["grade"] for r in g)
        km, kg = sum(r["km"] for r in g), sum(r["kg"] for r in g)
        print(f"{y:>6} {len(g):>8,} {c['A']:>8,} {c['B']:>8,} {c['C']:>8,} {c['D']:>8,}"
              f" {c['A'] / len(g) * 100:>5.1f}% {km / 1e4:>9,.1f} {kg / 1000:>8.1f}")
        tot += c
        tot["n"] += len(g); tot["km"] += km; tot["kg"] += kg
    print(f"{'합계':>6} {tot['n']:>8,} {tot['A']:>8,} {tot['B']:>8,} {tot['C']:>8,} {tot['D']:>8,}"
          f" {tot['A'] / tot['n'] * 100:>5.1f}% {tot['km'] / 1e4:>9,.1f} {tot['kg'] / 1000:>8.1f}")
    print(f"\n확정(A) {tot['A'] / tot['n'] * 100:.1f}% · 추정(B·C·D) {(tot['n'] - tot['A']) / tot['n'] * 100:.1f}%"
          f" · 총 배출량 {tot['kg'] / 1000:.1f} tCO2e")

    # ── 2) 판정 근거별 ──────────────────────────────────
    print("\n== 판정 근거별 ==")
    for label, n in Counter(r["label"] for r in calc).most_common():
        print(f"{n:>8,}  {label}")
    x14 = [r for r in calc if r["x14"]]
    print(f"\n×1.4 산식 특실(A 아님): {len(x14):,}행 · {sum(r['kg'] for r in x14) / 1000:.1f} tCO2e")

    # ── 3) 출발 도시 ∩ 목적 도시 ≠ ∅ (측정 항목 4) ──────
    ov = [r for r in calc if r["overlap"]]
    print(f"\n== 출발·목적에 같은 도시가 있는 행 ==\n{len(ov):,}행 · 지금은 편도로 봄 {sum(r['kg'] for r in ov) / 1000:.1f} tCO2e"
          f" · 왕복이었다면 {sum(r['kg'] for r in ov) * 2 / 1000:.1f} tCO2e"
          f" (차이 {sum(r['kg'] for r in ov) / 1000:+.1f} t, 총량의 {sum(r['kg'] for r in ov) / tot['kg'] * 100:.1f}%)")

    # ── 4) 라벨 대상 조합 (측정 항목 6) ─────────────────
    need = [r for r in calc if r["grade"] != "A"]
    combos = Counter(city_key(r) for r in need)
    kg_by = defaultdict(float)
    for r in need:
        kg_by[city_key(r)] += r["kg"]
    print(f"\n== 라벨 대상 (A 아닌 행) ==\n{len(need):,}행 · 조합 {len(combos):,}가지"
          f" · {sum(kg_by.values()) / 1000:.1f} tCO2e")
    print(f"\n건수 상위 {a.top}가지 (도시 집합 · 교통비 · 건수 · tCO2e)")
    for (cities, fare), n in combos.most_common(a.top):
        print(f"{n:>7,}  {fare:>9,}원  {kg_by[(cities, fare)] / 1000:>7.1f} t  {cities}")


if __name__ == "__main__":
    main()
