"""
출장(철도) Scope 3 분석 도구 — 재산정 · A 등급 검증 · 승차권 대조 표본

    python3 tools/trip.py eval   <관내출장.xls> [--places 사전.json] [--dump 결과.csv] [--grade A] [--top 25]
    python3 tools/trip.py verify <관내출장.xls> [--seed 7]
    python3 tools/trip.py sample <관내출장.xls> --out 표본.csv [--n 30] [--seed 1] [--random]

세 기능이 모두 `js/trip-engine.js` 와 `js/trip-data.js` 를 그대로 브라우저에 넣고 돌린다.
화면·DB 를 거치지 않으므로 대시보드에 저장되는 값과 같은 코드로 같은 값이 나온다.

- **eval**   연도별 등급 분포·총 배출량·판정 근거별·라벨 우선순위. `--dump` 으로 행별 CSV
- **verify** "A 가 정말 A 인가" — 방문처 교차 · 장소 셔플 · 금액 흔들기 (설계서 2026-11-20 §2)
- **sample** 승차권 대조용 층화 표본. A 가 무너질 수 있는 자리마다 행을 배정한다

장소 사전(`--places`)은 비공개라 저장소에 없다. 주지 않으면 키워드 규칙만으로 산정한다.

화면 출력은 도시·금액·건수만 담는다. 원본 장소명은 verify 의 어긋난 방문처 예시에만 나온다.
`--dump`·`--out` 으로 나오는 CSV 에는 **원본 장소명과 파일첨부 ID 가 들어 있으니 커밋하지 않는다.**

2026-11-26: eval_trip.py · verify_trip.py · sample_trip.py 세 파일을 합쳤다.
셋이 엑셀 읽기·날짜 변환·엔진 띄우기를 각각 베껴 갖고 있어 엑셀 양식이 바뀔 때마다
세 곳을 고쳐야 했다(실제로 2026-11-23 에 그 문제가 났다). 경위는 docs/decisions/003-출장-분석도구-통합.md
"""
import argparse
import csv
import datetime
import pathlib
import random
import sys
from collections import Counter, defaultdict

import xlrd
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 한 행을 산정하고, 등급·거리·배출량과 장소 판정을 함께 돌려준다
EVAL_JS = """([rows, pm]) => rows.map(r => {
    const x = classifyRail({ origin: r.origin, via: r.via, dest: r.dest, fare: r.fare, days: r.days, date: r.date }, window.__ref, pm);
    const oc = tripCities(r.origin, pm), dc = tripCities(r.dest, pm), vc = tripCities(r.via, pm);
    return { g: x.grade, label: x.gradeLabel, basis: x.basis || '', legs: x.legs, km: x.km, kg: x.kg,
             x14: !!x.x14, seenKey: x.seenKey || '',
             oc, dc, vc, seg: [...new Set([...oc, ...vc, ...dc])].sort(),
             overlap: oc.some(c => dc.includes(c)), visit: tripCities(r.visit || '', pm) };
})"""

# 수도권 지명 — 키워드 규칙이 '서울' 로 묶지만 실제 하차역이 서울역이 아닐 수 있다
METRO = ("과천", "인천", "판교", "일산", "성남", "여의도", "부천", "수원", "고양", "안양", "용인", "의정부")


# ───────────────────────── 공통 ─────────────────────────
def load_rail(xls):
    """관내출장 엑셀의 철도 행만 읽는다. 두 양식(번호 칸 있음/없음) 모두 읽는다."""
    out = []
    for sh in xlrd.open_workbook(xls).sheets():
        if sh.nrows < 4:
            continue
        top = [str(v).strip() for v in sh.row_values(1)]
        sub = [str(v).strip() for v in sh.row_values(2)]
        name = [a or b for a, b in zip(top, sub)]
        if "교통편" not in name or "교통비" not in name:
            continue
        pos = lambda k: name.index(k) if k in name else -1
        iS = sub.index("출장시작일") if "출장시작일" in sub else pos("출장시간")
        # 출장 일수는 '일' 칸 → 없거나 비면 시작일·종료일로 계산 → 그래도 없으면 None.
        #  js/trip-engine.js 의 tripParseSheet 와 같은 규칙이어야 한다. 일수는 왕복 n회 판정에 쓰여
        #  거리를 바꾸므로, 어긋나면 총 배출량이 달라진다(2026-11-26 통합 때 실제로 2.4t 어긋났다)
        iE = sub.index("출장종료일") if "출장종료일" in sub else pos("출장종료일")
        iDay = name.index("일") if "일" in name else (sub.index("일") if "일" in sub else pos("출장일수"))
        c = {k: pos(k) for k in ("교통편", "출발지", "경유지", "목적지", "교통비", "방문처",
                                 "부서명", "직위", "파일첨부", "출장목적")}
        year = sh.name.strip() if sh.name.strip().isdigit() else ""
        xl = lambda v: (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v))).isoformat() if isinstance(v, float) and v > 20000 else ""
        for r in range(3, sh.nrows):
            v = sh.row_values(r)
            if str(v[c["교통편"]]).strip() != "철도운임":
                continue
            g = lambda k: str(v[c[k]]).strip() if c[k] >= 0 else ""
            date = xl(v[iS]) if iS >= 0 else ""
            dn = str(v[iDay]).strip() if iDay >= 0 else ""
            days = None
            if dn:
                try:
                    days = int(float(dn)) if float(dn) >= 1 else None
                except ValueError:
                    days = None
            if days is None and iE >= 0 and date:
                end = xl(v[iE])
                if end:
                    span = (datetime.date.fromisoformat(end) - datetime.date.fromisoformat(date)).days + 1
                    days = span if span >= 1 else None
            out.append({
                "sheet": sh.name, "row": r + 1, "year": year or date[:4],
                "origin": g("출발지"), "via": g("경유지"), "dest": g("목적지"),
                "fare": float(v[c["교통비"]] or 0), "visit": g("방문처"), "dept": g("부서명"),
                "pos": g("직위"), "att": g("파일첨부"), "purpose": g("출장목적"), "date": date,
                "days": days,
            })
    assert out, "철도운임 행을 찾지 못했습니다 (머리글에 출발지·목적지·교통편·교통비가 있어야 합니다)"
    return out


class Engine:
    """js/trip-data.js + js/trip-engine.js 를 올린 브라우저 한 장"""

    def __init__(self, pw, place_map):
        self.br = pw.chromium.launch()
        self.page = self.br.new_page()
        self.page.set_content("<!doctype html><title>trip</title>")
        self.page.add_script_tag(content=(ROOT / "js" / "trip-data.js").read_text(encoding="utf-8"))
        self.page.add_script_tag(content=(ROOT / "js" / "trip-engine.js").read_text(encoding="utf-8")
                                 + "\nwindow.__ref = tripBuildRef(window.TRIP_REF, window.TRIP_FARE);")
        self.pm = place_map

    def run(self, rows):
        out = []
        for k in range(0, len(rows), 8000):
            out += self.page.evaluate(EVAL_JS, [rows[k:k + 8000], self.pm])
        return out

    def close(self):
        self.br.close()


def kgt(rs, key="kg"):
    return sum(r[key] for r in rs) / 1000


def dump_csv(path, rows, res, only=None):
    """행별 결과 CSV — 원본 장소명·첨부 ID 포함. 커밋하지 말 것"""
    pair = [(a, b) for a, b in zip(rows, res) if not only or b["g"] == only]
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["연도", "날짜", "출발지", "경유지", "목적지", "방문처", "교통비", "출장일수",
                    "등급", "판정", "근거", "구간수", "거리km", "배출kgCO2eq",
                    "출발도시", "목적도시", "특실×1.4산식", "파일첨부"])
        for r, o in pair:
            w.writerow([r["year"], r["date"], r["origin"], r["via"], r["dest"], r["visit"],
                        int(r["fare"]), r["days"], o["g"], o["label"], o["basis"], o["legs"], o["km"], o["kg"],
                        "+".join(o["oc"]), "+".join(o["dc"]), "예" if o["x14"] else "", r["att"]])
    print(f"\n행별 CSV {len(pair):,}행 → {path}  (원본 장소명·첨부 ID 포함 · 커밋하지 말 것)")


# ───────────────────────── eval ─────────────────────────
def cmd_eval(a, rows, eng):
    res = eng.run(rows)
    calc = [o for o in res if o["g"] != "제외"]
    print(f"\n철도 {len(rows):,}행 (산정 {len(calc):,} · 제외 {len(res) - len(calc):,})")

    print("\n== 연도별 ==")
    print(f"{'연도':>6} {'산정':>8} {'A':>8} {'B':>8} {'C':>8} {'D':>8} {'A%':>6} {'만km':>9} {'tCO2e':>8}")
    tot = Counter()
    for y in sorted({r["year"] for r, o in zip(rows, res) if o["g"] != "제외"}):
        g = [o for r, o in zip(rows, res) if o["g"] != "제외" and r["year"] == y]
        c = Counter(o["g"] for o in g)
        km, kg = sum(o["km"] for o in g), kgt(g)
        print(f"{y:>6} {len(g):>8,} {c['A']:>8,} {c['B']:>8,} {c['C']:>8,} {c['D']:>8,}"
              f" {c['A'] / len(g) * 100:>5.1f}% {km / 1e4:>9,.1f} {kg:>8.1f}")
        tot += c
        tot["n"] += len(g); tot["km"] += km
    kg_all = kgt(calc)
    print(f"{'합계':>6} {tot['n']:>8,} {tot['A']:>8,} {tot['B']:>8,} {tot['C']:>8,} {tot['D']:>8,}"
          f" {tot['A'] / tot['n'] * 100:>5.1f}% {tot['km'] / 1e4:>9,.1f} {kg_all:>8.1f}")
    print(f"\n확정(A) {tot['A'] / tot['n'] * 100:.1f}% · 추정(B·C·D) {(tot['n'] - tot['A']) / tot['n'] * 100:.1f}%"
          f" · 총 배출량 {kg_all:.1f} tCO2e")

    print("\n== 판정 근거별 ==")
    for label, n in Counter(o["label"] for o in calc).most_common():
        print(f"{n:>8,}  {label}")
    x14 = [o for o in calc if o["x14"]]
    print(f"\n×1.4 산식 특실(A 아님): {len(x14):,}행 · {kgt(x14):.1f} tCO2e")

    ov = [o for o in calc if o["overlap"]]
    print(f"\n== 출발·목적에 같은 도시가 있는 행 ==\n{len(ov):,}행 · 편도로 봄 {kgt(ov):.1f} tCO2e"
          f" · 왕복이었다면 {kgt(ov) * 2:.1f} tCO2e (차이 {kgt(ov):+.1f} t, 총량의 {kgt(ov) / kg_all * 100:.1f}%)")

    need = [o for o in calc if o["g"] != "A"]
    key = lambda o: ("+".join(o["seg"]) or "미확정", int(o["km"] * 0) + 0)   # 자리 맞춤용 (아래에서 교통비로 다시 묶는다)
    combos, kg_by = Counter(), defaultdict(float)
    for r, o in zip(rows, res):
        if o["g"] in ("제외", "A"):
            continue
        k = ("+".join(o["seg"]) or "미확정", int(r["fare"]))
        combos[k] += 1
        kg_by[k] += o["kg"] / 1000
    print(f"\n== 라벨 대상 (A 아닌 행) ==\n{len(need):,}행 · 조합 {len(combos):,}가지 · {kgt(need):.1f} tCO2e")
    print(f"\n건수 상위 {a.top}가지 (도시 집합 · 교통비 · 건수 · tCO2e)")
    for (cities, fare), n in combos.most_common(a.top):
        print(f"{n:>7,}  {fare:>9,}원  {kg_by[(cities, fare)]:>7.1f} t  {cities}")

    if a.dump:
        dump_csv(a.dump, rows, res, a.grade)


# ──────────────────────── verify ────────────────────────
def cmd_verify(a, rows, eng):
    base = eng.run(rows)
    A = [i for i, o in enumerate(base) if o["g"] == "A"]
    calc = [o for o in base if o["g"] != "제외"]
    print(f"\n철도 {len(rows):,}행 · 산정 {len(calc):,} · A {len(A):,} ({len(A) / len(calc) * 100:.1f}%)")
    print("\n정답(실제 이동 기록)이 없어 A 를 확률로 검증할 수는 없다(설계서 2026-11-20 §2).")
    print("아래 셋은 '틀렸다는 증거가 있는지'를 찾는 것이다. 진짜 검증은 승차권(파일첨부) 표본 대조뿐이다.")

    withv = [i for i in A if base[i]["visit"]]
    bad = [i for i in withv if not set(base[i]["visit"]) & set(base[i]["seg"])]
    print("\n[1] 방문처 교차 — 엔진이 쓰지 않는 독립 증거")
    if not withv:
        print("    방문처 칸이 없어 건너뜀")
    else:
        print(f"    방문처가 도시로 풀리는 A 행 {len(withv):,} · 구간과 어긋남 {len(bad):,} ({len(bad) / len(withv) * 100:.2f}%)")
        print("    어긋난 예시 (방문처 → 그 도시 vs 산정 구간) — 회사 이름이 지명과 같은 경우가 섞여 있다:")
        for (v, vc, seg), n in Counter((rows[i]["visit"], "+".join(base[i]["visit"]), "+".join(base[i]["seg"])) for i in bad).most_common(10):
            print(f"      {n:>4,}  {v[:28]:<28} → {vc:<10} vs {seg}")

    random.seed(a.seed)
    idx = list(range(len(rows)))
    random.shuffle(idx)
    srows = [{**rows[i], "origin": rows[j]["origin"], "via": rows[j]["via"], "dest": rows[j]["dest"]}
             for i, j in enumerate(idx)]
    sout = eng.run(srows)
    chg = [i for i in range(len(rows)) if base[i]["g"] != "제외" and base[i]["seg"] != sout[i]["seg"]]
    ba = sum(1 for i in chg if base[i]["g"] == "A")
    sa = sum(1 for i in chg if sout[i]["g"] == "A")
    print(f"\n[2] 장소 셔플 (씨앗 {a.seed}) — 도시쌍이 실제로 바뀐 {len(chg):,}행만")
    print(f"    원래 장소 A {ba / len(chg) * 100:.1f}%  →  섞은 장소 A {sa / len(chg) * 100:.1f}%"
          f"  (떨어진 폭 {(ba - sa) / len(chg) * 100:.1f}%p)")
    print(f"    남은 {sa / len(chg) * 100:.1f}% = 장소가 틀렸을 때 금액이 우연히 맞을 확률(과녁 넓이)")

    print(f"\n[3] 금액 흔들기 — A {len(A):,}행")
    print(f"    {'흔든 금액':>10}{'A 유지':>10}{'거리 같음':>11}{'거리 다름':>11}{'횟수 다름':>11}")
    for d in (100, -100, 500, -500, 1000, -1000):
        o = eng.run([{**rows[i], "fare": rows[i]["fare"] + d} for i in A])
        keep = [(base[i], x) for i, x in zip(A, o) if x["g"] == "A"]
        same = sum(1 for b, x in keep if abs(b["km"] - x["km"]) < 0.05)
        legs = sum(1 for b, x in keep if b["legs"] != x["legs"])
        print(f"    {d:>+9,}원{len(keep):>10,}{same:>11,}{len(keep) - same:>11,}{legs:>11,}"
              f"   거리 바뀜 {(len(keep) - same) / len(A) * 100:>4.1f}% of A")
    print("\n거리가 바뀌는 행 = 교통비가 100원만 달라도 배출량이 달라지는 행. 이 비율이 A 의 취약점이다.")


# ──────────────────────── sample ────────────────────────
def cmd_sample(a, rows, eng):
    base = eng.run(rows)
    A = [i for i, o in enumerate(base) if o["g"] == "A"]
    pert = eng.run([{**rows[i], "fare": rows[i]["fare"] + 100} for i in A])
    km_moves = {i for i, x in zip(A, pert) if x["g"] == "A" and abs(x["km"] - base[i]["km"]) >= 0.05}
    leg_moves = {i for i, x in zip(A, pert) if x["g"] == "A" and x["legs"] != base[i]["legs"]}

    rnd = random.Random(a.seed)
    picked, used = [], set()

    def take(n, why, check, pool):
        pool = [i for i in pool if i not in used]
        rnd.shuffle(pool)
        for i in pool[:max(0, n)]:
            used.add(i)
            picked.append((i, why, check))

    if a.random:
        take(a.n, "무작위", "산정 결과가 승차권과 맞는지", list(A))
    else:
        fare_of = lambda f: [i for i in A if abs(rows[i]["fare"] - f) < 1]
        take(5, "최대 덩어리 87,000원 (A 배출량의 약 1/3)", "정말 왕복 1회인가 · 1인분인가", fare_of(87000))
        take(3, "둘째 덩어리 49,600원 (대구↔오송 왕복)", "정말 왕복 1회인가 · 오송에서 내렸는가", fare_of(49600))
        take(3, "43,500원 편도", "편도가 맞는가 (돌아온 교통비가 따로 있는가)", fare_of(43500))
        take(4, "교통비 100원 차이로 거리가 달라지는 행", "교통비가 정확한가 · 구간이 맞는가", sorted(km_moves))
        take(2, "교통비 100원 차이로 편도↔왕복이 뒤집히는 행", "횟수가 맞는가 (거리가 2배 달라진다)", sorted(leg_moves))
        take(3, "방문처가 산정 구간과 어긋난 행", "어디까지 열차로 갔는가",
             [i for i in A if base[i]["visit"] and not set(base[i]["visit"]) & set(base[i]["seg"])])
        take(3, "수도권 지명을 '서울'로 묶은 행", "실제 하차역이 어디인가 (서울역·광명·수서 등)",
             [i for i in A if any(k in rows[i]["origin"] or k in rows[i]["dest"] for k in METRO)])
        take(2, "운임표 특실로 본 행", "정말 특실인가", [i for i in A if "특실" in base[i]["label"]])
        take(2, "입석·자유석으로 본 행", "정말 입석·자유석인가", [i for i in A if "좌석 종류" in base[i]["label"]])
        take(2, "경유지로 목적 도시를 잡은 행", "열차는 경유지까지만 탔는가",
             [i for i in A if base[i]["vc"] and not base[i]["dc"]])
        take(1, "사용자 확인 라벨로 A 가 된 행", "라벨 설명이 맞는가", [i for i in A if "사용자 확인" in base[i]["label"]])
        take(a.n - len(picked), "할증·정차역 할인에서 파생된 금액", "교통비가 정확한가",
             [i for i in A if "할증/정차역" in base[i]["label"]])
        take(a.n - len(picked), "보충 (무작위)", "산정 결과가 승차권과 맞는지", list(A))

    with open(a.out, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["번호", "확인 목적", "확인할 것",
                    "날짜", "부서명", "직위", "출발지", "경유지", "목적지", "방문처", "교통비", "출장일수", "출장목적", "파일첨부",
                    "[산정] 등급", "[산정] 판정", "[산정] 근거", "[산정] 구간수", "[산정] 거리km", "[산정] 배출kgCO2eq",
                    "▶ 실제 구간(어디서→어디)", "▶ 실제 좌석", "▶ 실제 횟수(편도/왕복n)", "▶ 인원", "▶ 산정이 맞음(O/X)", "▶ 메모"])
        for n, (i, why, check) in enumerate(picked, 1):
            r, o = rows[i], base[i]
            w.writerow([n, why, check, r["date"], r["dept"], r["pos"], r["origin"], r["via"], r["dest"], r["visit"],
                        int(r["fare"]), r["days"], r["purpose"], r["att"],
                        o["g"], o["label"], o["basis"], o["legs"], o["km"], o["kg"], "", "", "", "", "", ""])
    print(f"\nA {len(A):,}행에서 {len(picked)}행 뽑음 → {a.out}  (원본 장소명·첨부 ID 포함 · 커밋하지 말 것)")
    for why, n in Counter(w for _, w, _ in picked).items():
        print(f"  {n:>2}행  {why}")
    if not a.random:
        print("\n층을 일부러 치우치게 뽑았으므로 오류율 계산에 쓰면 안 된다(오류 '유형'을 찾는 표본이다).")
        print("비율이 필요하면 --random 으로 무작위 표본을 따로 뽑는다 — 30행에서 0건 틀리면 오류율 9.5% 이하(95% 신뢰).")


# ───────────────────────── 실행 ─────────────────────────
def main():
    ap = argparse.ArgumentParser(description="출장(철도) Scope 3 분석 — eval · verify · sample")
    ap.add_argument("--places", help="장소 사전 JSON {장소: {points, confidence}} (비공개, 없으면 규칙만)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("eval", help="재산정 · 등급 분포 · 라벨 우선순위")
    e.add_argument("xls")
    e.add_argument("--top", type=int, default=25, help="라벨 우선순위로 보여 줄 조합 수")
    e.add_argument("--dump", help="행별 결과 CSV (원본 장소명 포함 — 커밋 금지)")
    e.add_argument("--grade", help="--dump 을 이 등급만 (예: A)")

    v = sub.add_parser("verify", help="A 등급 검증 3종")
    v.add_argument("xls")
    v.add_argument("--seed", type=int, default=7, help="장소 셔플 씨앗 (바꿔 돌려 안정성을 본다)")

    s = sub.add_parser("sample", help="승차권 대조용 층화 표본")
    s.add_argument("xls")
    s.add_argument("--out", required=True, help="표본 CSV 경로 (원본 장소명·첨부 ID 포함 — 커밋 금지)")
    s.add_argument("--n", type=int, default=30)
    s.add_argument("--seed", type=int, default=1)
    s.add_argument("--random", action="store_true", help="층화 대신 무작위로 뽑는다 (오류율 측정용)")

    a = ap.parse_args()
    import json
    place_map = json.loads(pathlib.Path(a.places).read_text(encoding="utf-8")) if a.places else {}
    rows = load_rail(a.xls)
    with sync_playwright() as pw:
        eng = Engine(pw, place_map)
        try:
            {"eval": cmd_eval, "verify": cmd_verify, "sample": cmd_sample}[a.cmd](a, rows, eng)
        finally:
            eng.close()


if __name__ == "__main__":
    sys.exit(main())
