"""
A 등급 승차권 대조용 표본 뽑기 — 층화 표본 (오류 유형 찾기용)

    python tools/sample_trip.py <관내출장.xls> --out 표본.csv [--n 30] [--seed 1]

A 가 무너질 수 있는 자리마다 행을 골라 넣는다. 자료가 대구↔서울 몇 금액에 몰려 있어
무작위로 뽑으면 30행 중 20행이 같은 금액이 되고, 위험한 유형은 한 행도 안 들어온다.

**이 표본은 오류율을 재는 용도가 아니다.** 층을 일부러 치우치게 뽑았으므로 "30행 중 1건 틀림 = 3.3%"
같은 계산을 하면 안 된다. 오류 **유형**을 찾는 용도이고, 비율이 필요하면 무작위 표본을 따로 뽑아야 한다
(`--random` 으로 뽑을 수 있다. 무작위 30행에서 0건 틀리면 오류율 9.5% 이하(95% 신뢰)까지 말할 수 있다).

나오는 CSV 에는 **원본 장소명과 파일첨부 ID 가 들어 있으니 커밋하지 않는다.**
뒤쪽 빈 칸(실제구간·실제좌석·실제횟수·인원·판정맞음)은 사용자가 승차권을 보고 채운다.
"""
import argparse
import csv
import datetime
import pathlib
import random
from collections import Counter

import xlrd
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

EVAL = """([rows, pm]) => rows.map(r => {
    const x = classifyRail({ origin: r.origin, via: r.via, dest: r.dest, fare: r.fare, days: r.days, date: r.date }, window.__ref, pm);
    return { g: x.grade, label: x.gradeLabel, basis: x.basis || '', legs: x.legs, km: x.km, kg: x.kg,
             oc: tripCities(r.origin, pm), dc: tripCities(r.dest, pm), vc: tripCities(r.via, pm),
             visit: tripCities(r.visit || '', pm) };
})"""

# 수도권 지명 — 키워드 규칙이 '서울' 로 묶지만 실제 하차역이 서울역이 아닐 수 있다
METRO = ("과천", "인천", "판교", "일산", "성남", "여의도", "부천", "수원", "고양", "안양", "용인", "의정부")


def load(xls):
    sh = xlrd.open_workbook(xls).sheets()[0]
    top = [str(v).strip() for v in sh.row_values(1)]
    sub = [str(v).strip() for v in sh.row_values(2)]
    name = [a or b for a, b in zip(top, sub)]
    idx = lambda k: name.index(k) if k in name else -1
    iS = sub.index("출장시작일") if "출장시작일" in sub else idx("출장시간")
    cols = {k: idx(k) for k in ("교통편", "출발지", "경유지", "목적지", "교통비", "방문처",
                                "출장일수", "부서명", "직위", "파일첨부", "출장목적")}
    out = []
    for r in range(3, sh.nrows):
        v = sh.row_values(r)
        if str(v[cols["교통편"]]).strip() != "철도운임":
            continue
        g = lambda k: str(v[cols[k]]).strip() if cols[k] >= 0 else ""
        d = v[iS]
        out.append({
            "row": r + 1, "origin": g("출발지"), "via": g("경유지"), "dest": g("목적지"),
            "fare": float(v[cols["교통비"]] or 0), "visit": g("방문처"), "dept": g("부서명"),
            "pos": g("직위"), "att": g("파일첨부"), "purpose": g("출장목적"),
            "date": (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(d))).isoformat() if isinstance(d, float) else "",
            "days": int(float(v[cols["출장일수"]])) if cols["출장일수"] >= 0 and g("출장일수") else None,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xls")
    ap.add_argument("--out", required=True, help="표본 CSV 경로 (원본 장소명·첨부 ID 포함 — 커밋 금지)")
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--random", action="store_true", help="층화 대신 무작위로 뽑는다 (오류율 측정용)")
    a = ap.parse_args()

    rows = load(a.xls)
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        page = br.new_page()
        page.set_content("<!doctype html><title>sample</title>")
        page.add_script_tag(content=(ROOT / "js" / "trip-data.js").read_text(encoding="utf-8"))
        page.add_script_tag(content=(ROOT / "js" / "trip-engine.js").read_text(encoding="utf-8")
                            + "\nwindow.__ref = tripBuildRef(window.TRIP_REF, window.TRIP_FARE);")

        def run(rs):
            o = []
            for k in range(0, len(rs), 8000):
                o += page.evaluate(EVAL, [rs[k:k + 8000], {}])
            return o

        base = run(rows)
        A = [i for i, o in enumerate(base) if o["g"] == "A"]
        # 금액을 +100원 흔들었을 때 거리·횟수가 바뀌는 행 (가장 취약한 자리)
        pert = run([{**rows[i], "fare": rows[i]["fare"] + 100} for i in A])
        km_moves = {i for i, x in zip(A, pert) if x["g"] == "A" and abs(x["km"] - base[i]["km"]) >= 0.05}
        leg_moves = {i for i, x in zip(A, pert) if x["g"] == "A" and x["legs"] != base[i]["legs"]}
        br.close()

    rnd = random.Random(a.seed)
    picked, used = [], set()

    def take(n, why, check, pool):
        pool = [i for i in pool if i not in used]
        rnd.shuffle(pool)
        for i in pool[:n]:
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
             [i for i in A if base[i]["visit"] and not set(base[i]["visit"]) & set(base[i]["oc"] + base[i]["dc"] + base[i]["vc"])])
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

    hd = ["번호", "확인 목적", "확인할 것",
          "날짜", "부서명", "직위", "출발지", "경유지", "목적지", "방문처", "교통비", "출장일수", "출장목적", "파일첨부",
          "[산정] 등급", "[산정] 판정", "[산정] 근거", "[산정] 구간수", "[산정] 거리km", "[산정] 배출kgCO2eq",
          "▶ 실제 구간(어디서→어디)", "▶ 실제 좌석", "▶ 실제 횟수(편도/왕복n)", "▶ 인원", "▶ 산정이 맞음(O/X)", "▶ 메모"]
    with open(a.out, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(hd)
        for n, (i, why, check) in enumerate(picked, 1):
            r, o = rows[i], base[i]
            w.writerow([n, why, check,
                        r["date"], r["dept"], r["pos"], r["origin"], r["via"], r["dest"], r["visit"],
                        int(r["fare"]), r["days"], r["purpose"], r["att"],
                        o["g"], o["label"], o["basis"], o["legs"], o["km"], o["kg"],
                        "", "", "", "", "", ""])
    print(f"A {len(A):,}행에서 {len(picked)}행 뽑음 → {a.out}  (원본 장소명·첨부 ID 포함 · 커밋하지 말 것)")
    for why, n in Counter(w for _, w, _ in picked).items():
        print(f"  {n:>2}행  {why}")


if __name__ == "__main__":
    main()
