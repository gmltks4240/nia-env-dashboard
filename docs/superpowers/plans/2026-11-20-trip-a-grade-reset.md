# 출장 A 등급 재정의 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A(업무상 확정)를 "구간과 횟수가 무가정으로 확정된 행"으로 다시 정의하고, 그 밖의 행을 라벨 대상으로 내린다.

**Architecture:** `index.html` 의 `/* @trip-start */ … /* @trip-end */` 안 순수 함수만 고친다. 바꾸는 곳은 세 군데다 — ① 후보 생성(실재하지 않는 후보 제거) ② 후보 선택 순서 ③ `aLabel`(A 판정). 거리·계수 계산식은 손대지 않는다. 기관 판정기준 분기는 조기 반환을 멈추고 "새 A 가 안 될 때 쓰는 거리 공급원"으로 뒤로 옮긴다.

**Tech Stack:** 단일 파일 바닐라 JS(`index.html`) · 테스트는 Python + Playwright(`tests/`, 실행 `python tests/run_all.py`) · 오프라인 재산정 도구는 `tools/*.py`(Playwright 로 엔진을 꺼내 실행)

**Spec:** `docs/superpowers/specs/2026-11-20-trip-a-grade-reset-design.md`

## Global Constraints

- 거리·계수·배출량 **계산식을 바꾸지 않는다.** 이번 변경은 등급 판정과 후보 생성만 건드린다.
- 철도 계수 `0.0219`, 강릉선 `0.0716` kgCO₂eq/인·km — 그대로 둔다.
- 100원 단위 처리는 코레일 여객운송약관 제8조①(50원까지 버림, 50원 초과 100원) — 기존 `r100` 그대로.
- 거리 허용 폭 `TRIP_A_KM_TOL = 0.02`(2%) — 그대로.
- **장소명을 저장소에 커밋하지 않는다.** `@trip-labels` 블록에는 도시·금액·구간·설명만 넣는다.
- 화면(UI) 기능을 추가하지 않는다. 담당자가 라벨을 넣는 경로는 대화 + 커밋이다.
- 런타임 AI 호출을 넣지 않는다.
- 같은 입력에 항상 같은 결과가 나와야 한다(엔진은 순수 함수).
- 테스트는 `python tests/run_all.py` 로 전부 통과해야 한다. 기존 A 관련 단정은 **고치는 것이 아니라 새 정의의 정답으로 다시 쓴다.**

## Review Focus

1. **기관 판정기준 거리와 새 A 거리가 다른 행** — 36,900~37,300(기준표 269.2km 추정) 같은 금액이 새 경로에서 286.7km 로 풀리면 그 행의 배출량이 바뀐다. 총량이 조용히 움직이면 안 되므로 변동 건수와 tCO₂e 를 세어 보고해야 한다. → Task 5
2. **입석 왕복 제거로 설명을 잃는 행** — 그 행들은 D(추정)로 내려가며 거리가 바뀐다. 건수와 총량 변동을 세어야 한다. → Task 1
3. **`placeMap` 의 옛 형식(값이 배열)** — confidence 게이트를 넣으면 기존 호출자·테스트 픽스처가 배열을 넘긴다. 배열이 와도 깨지지 않고 "확정"으로 취급해야 한다(종전 동작 유지). → Task 4
4. **라벨 키 방향 정규화 뒤 기존 L1** — `경주→세종|43000` 이 정규화 후에도 계속 맞아야 한다. 라벨이 조용히 안 먹으면 L1·L2 가 사라진다. → Task 6
5. **왕복 n회(×2~5) 경로** — `base(f/k)` 재귀가 새 A 를 우회해 A 를 주지 않아야 한다. 왕복 n회는 가정이므로 라벨 대상이다. → Task 5

---

### Task 1: 입석·자유석 왕복 후보 제거

가는 편·오는 편이 **모두** 할인 좌석인 왕복은 실재하지 않는 이동이므로 후보로 만들지 않는다(설계서 §4.1).
한쪽만 할인 좌석인 왕복은 그대로 둔다.

**Files:**
- Modify: `index.html` — `classifyRail` 안 후보 필터 (현재 `const okAll = cands.filter(c => c.dk <= TRIP_DK_MAX)` 줄, 약 4790)
- Test: `tests/test_trip_rail.py`

**Interfaces:**
- Consumes: 없음 (첫 작업)
- Produces: 후보 배열 `cands` 에서 `legs === 2 && seats.length === 2` 인 항목이 제거된 상태. 이후 Task 2·5 가 이 전제에 기댄다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```python
H.test_name("입석·자유석 왕복은 후보가 아니다 (2026-11-20)")
on("")
r = c("대구", "서울", 60900)
H.ok("입석" not in r["basis"], f"60,900 은 입석 왕복으로 설명되지 않는다 — {r['basis']}")
r = c("대구", "서울", 62700)   # 36,900 × 0.85 = 31,365 → 31,400 ; 왕복 62,800 이 아닌 값으로 두 편 입석 조합이 사라졌는지
H.ok(r["grade"] == "D" or "입석" not in r["basis"], f"두 편 모두 입석인 왕복은 후보에서 빠진다 — {r['gradeLabel']} {r['basis']}")
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: FAIL — 60,900 의 `basis` 에 "입석 … 왕복" 이 들어 있다

- [ ] **Step 3: 후보 필터에 조건을 더한다**

같은 줄에서 `c.dk <= TRIP_DK_MAX` 에 **`&& !(c.legs === 2 && c.seats.length === 2)`** 를 더한다.
`TRIP_DK_MAX` 상수는 지우지 않는다(한쪽만 할인 좌석인 왕복이 여전히 그 폭 안에 있어야 한다).
위 주석("왕복 두 편 모두 입석·자유석인 조합까지 인정")을 새 규칙과 근거(2026-11-20 사용자 확인)로 바꾼다.

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: 새 단정 PASS. 기존 단정 중 입석 왕복에 기대던 것은 이 시점에 깨져도 된다 — Task 5 에서 새 정의의 정답으로 다시 쓴다. 깨진 것을 적어 둔다.

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/test_trip_rail.py
git commit -m "출장 — 가는 편·오는 편 모두 할인 좌석인 왕복은 후보에서 제거 (90768f5 되돌림)"
```

---

### Task 2: 특실 "마지막 수단" 폐기 — 가정 개수 최소 복구

후보 선택을 `dk`(파생 단계) → 구간 수 → 좌석 선호 순으로 되돌린다. 특실을 뒤로 미루는 특별 분기를 없앤다(설계서 §4.2).

**Files:**
- Modify: `index.html` — `okAll`/`okGen`/`okc` 세 줄 (약 4790~4792)
- Test: `tests/test_trip_rail.py`

**Interfaces:**
- Consumes: Task 1 의 후보 필터
- Produces: `okc` = 필터를 통과한 후보 전체(특실 포함). 선택은 기존 `best` 정렬과 `dk0`/`t0` 단계가 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```python
H.test_name("후보 선택은 가정 개수 최소 (f7aaad4 복구)")
on("")
r = c("대구", "서울", 60900)
H.ok(r["legs"] == 1 and r["km"] == 286.7, f"60,900 → 특실 편도 286.7km (가정 1개가 2개를 이긴다) — {r['basis']} {r['km']}")
H.near(r["kg"], 6.279, 0.001, "286.7 × 0.0219 = 6.279 kg")
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: FAIL — `km` 이 546.8 로 나온다(특실이 뒤로 밀려 있어서)

- [ ] **Step 3: 특실 지연 분기를 없앤다**

`okGen` 과 "특실은 마지막에 찾는다" 주석을 지우고 `okc = okAll` 로 둔다.
`best` 정렬에 이미 있는 `x.dk - y.dk` 와 `(x.cls !== '일반') - (y.cls !== '일반')` 이 §4.2 의 1·2순위를 수행한다.
주석을 설계서 §4.2 의 순서(가정 개수 최소 → 일반실 > 입석·자유석 > 특실 → 대표역·공식거리)로 다시 쓴다.

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: 새 단정 PASS

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/test_trip_rail.py
git commit -m "출장 — 후보 선택을 가정 개수 최소로 복구, 특실 '마지막 수단' 폐기"
```

---

### Task 3: ×1.4 산식으로 만든 특실 금액 표시

운임표에 실제로 있는 특실 금액과 `일반실 × 1.4` 로 계산한 금액을 구분한다. ×1.4 산식은 코레일 공식 특실 운임표와 대조되지 않았으므로 가정이다(설계서 §11.2-ㄴ).

현재 `cls` 는 `'일반'` · `'특실'` · `'특실(×1.4 산식)'` 세 값인데, 운임표에 특실이 있는 구간(`tbl === true`)에서도 `plain × 1.4` 를 **같은 `'특실'`** 로 넣고 있어 `cls` 만으로는 구분되지 않는다. 명시적 표시를 둔다.

**Files:**
- Modify: `index.html` — 세그먼트 생성기 `mk`/`putS` (약 4681~4692), 후보 조립 `ref.one`/`ref.two` 매핑 (약 4781~4787)
- Test: `tests/test_trip_rail.py`

**Interfaces:**
- Consumes: 없음
- Produces: 세그먼트에 **`s14: boolean`** (true = 특실 금액이 ×1.4 산식에서 나옴). 후보에는 **`x14: boolean`** (한 구간이라도 `s14` 면 true). Task 5 의 `aLabel` 이 이것을 읽는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```python
H.test_name("×1.4 산식 특실과 운임표 특실 구분")
on("")
r = c("대구", "서울", 60800)   # 43,400(43,100 + 0.6% 할증) × 1.4 — 산식
H.ok(r.get("x14") is True, f"60,800 은 ×1.4 산식에서 나온 특실 — {r['basis']}")
r = c("대구", "서울", 60900)   # 운임표의 특실 금액
H.ok(not r.get("x14"), f"60,900 은 운임표의 특실 금액 — {r['basis']}")
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: FAIL — `x14` 가 결과에 없다

- [ ] **Step 3: `s14` 를 심고 후보까지 올린다**

`mk(cls)` 에 인자를 하나 더해(`mk(cls, s14 = false)`) 세그먼트에 `s14` 를 넣는다.
`putS` 는 두 갈래로 나눈다 — 운임표 특실(`genStops(special)`)은 `s14: false`, `plain.forEach(... r100(v * 1.4) ...)` 는 `s14: true`.
후보 조립에서 한 구간은 `x14: !!s.s14`, 두 구간 합은 `x14: !!(s1.s14 || s2.s14)` 로 올린다.
`out(...)` 결과에도 `x14` 를 실어 테스트가 볼 수 있게 한다(Task 5 에서 `aLabel` 이 쓴다).

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: 새 단정 PASS

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/test_trip_rail.py
git commit -m "출장 — ×1.4 산식으로 만든 특실 금액을 운임표 특실과 구분(s14·x14)"
```

---

### Task 4: 장소 확정 게이트 (confidence)

`confidence = high` 와 키워드 규칙만 "확정"으로 본다. `low` · `unknown` 은 장소 미확정으로 취급한다(설계서 §11.2-ㄷ).
`source`(seed/ai/human)는 보지 않는다.

**Files:**
- Modify: `index.html` — `tripCities` (약 4625~4630)
- Test: `tests/test_trip_rail.py`

**Interfaces:**
- Consumes: 없음
- Produces: `tripCities(text, placeMap)` 가 **확정된 도시만** 돌려준다. `placeMap` 의 값으로 두 형식을 받는다 — 배열(옛 형식, 확정으로 본다)과 `{ points: string[], confidence: 'high'|'low'|'unknown' }`. Task 5 의 ① 이 "`O` 와 `D` 가 모두 비어 있지 않다"로 ①을 판정한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```python
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
```

`cities(text, placeMap)` 헬퍼를 테스트에 추가한다 — `page.evaluate` 로 `tripCities` 를 직접 부른다.

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: FAIL — `low` · `unknown` 이 `["서울"]` 을 돌려준다

- [ ] **Step 3: `tripCities` 가 confidence 를 읽게 한다**

`placeMap[t]` 가 배열이면 지금처럼 그대로 쓴다. 객체면 `confidence === 'high'` 일 때만 `points` 를 쓰고, 그 밖(`low`·`unknown`)에는 빈 배열을 돌려준다. 어느 쪽도 아니면 키워드 규칙(`TRIP_PAT`)으로 넘어간다.

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: 새 단정 4개 PASS, 기존 장소 사전 테스트도 PASS(배열 형식을 쓰므로)

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/test_trip_rail.py
git commit -m "출장 — 장소 확정은 confidence high 만, low·unknown 은 미확정 (옛 배열 형식 하위호환)"
```

---

### Task 5: 새 A 판정으로 교체 · 기관 판정기준 분기를 뒤로

`aLabel` 을 설계서 §4 의 네 조건으로 바꾸고, 기관 판정기준 분기의 조기 반환을 없앤다.

**Files:**
- Modify: `index.html` — 기관 판정기준 분기 `if (j) return out('A', …)` (약 4777~4778) · `aLabel` 과 그 아래 반환부 (약 4810~4836)
- Test: `tests/test_trip_rail.py`

**Interfaces:**
- Consumes: Task 1 의 후보 필터 · Task 2 의 선택 순서 · Task 3 의 `x14` · Task 4 의 `tripCities`
- Produces: 등급 문자열 — `A 업무상 확정(운임표)` 계열(기존 글자를 유지), 그 밖은 기존 `B`/`C`/`D`. 기관 기준표 거리로 떨어진 행은 **`B 기관 판정기준(장소 미확인)`**. Task 7 이 이 등급을 확정/추정 2단계로 접는다.

새 A 의 네 조건(모두 만족):

| | 구현 |
|---|---|
| ① 구간 | `O.length && D.length && top === 2` — 출발·목적이 모두 확정되고 그 구간과 일치. **선이동(`oneCity`) 예외는 없앤다** |
| ② 금액 | 후보가 `okc` 에 있고 `!c.x14` — 운임 계열이면 할증·정차역·입석·자유석·운임표 특실 모두 허용, ×1.4 산식만 배제 |
| ③ 횟수 | `peers` 특별 취급 없이 `mm` 전체가 `legs` 가 같고 거리 차이 2% 이내 |
| ④ 거리 | `c.q === '공식'` |

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```python
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
r = c("대구", "서울", 174000, days=4)
H.ok(r["grade"] != "A", f"왕복 n회(n≥2)는 가정이므로 A 아님 — {r['gradeLabel']} {r['legs']}")
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: FAIL — 선이동·기관 기준표·×1.4 가 아직 A 로 나온다

- [ ] **Step 3: 기관 판정기준 분기를 거리 공급원으로 내린다**

`const j = doubled(f) ? null : ref.J.get(f);` 는 그대로 두고, **그 자리에서 반환하지 않는다.**
후보 경로를 먼저 돌리고, `aLabel` 이 서면 A 를 돌려준다. A 가 아니고 `j` 가 있으면
`out('B', 'B 기관 판정기준(장소 미확인)' + (j.kmQ === '공식' ? '' : '(거리 추정)'), j.legs, j.km, `${j.train} ${j.label}`)` 를 돌려준다 —
**거리는 기준표 값을 그대로 쓴다**(설계서 §11.2-ㄱ). `j` 도 없으면 기존 `B`/`C`/`D` 반환부로 간다.

- [ ] **Step 4: `aLabel` 을 네 조건으로 다시 쓴다**

`c.cls !== '일반'` 조기 반환, `oneCity` 선이동 예외, `ipSeat`/`corridor` 좌석 제한, `peers` 특별 취급, `TRIP_SEEN` 조건(④)을 모두 뺀다.
대신 위 표의 네 조건을 넣는다. 등급 글자는 기존 `A 업무상 확정(운임표)` / `(운임표 · 할증/정차역)` 체계를 유지하고,
운임표 특실이면 `(운임표 특실)`, 입석·자유석이면 `(좌석 종류)` 를 쓴다.
`seenKey` 는 계속 채운다 — `tools/build_trip_seen.py` 가 라벨 우선순위를 세는 데 쓴다(설계서 §10).

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `python tests/run_all.py`
Expected: 새 단정 전부 PASS. 기존 A 단정 중 새 정의와 어긋나는 것은 **새 정의의 정답으로 다시 쓴다**(고치는 것이 아니다). 전부 통과까지 간다.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/test_trip_rail.py
git commit -m "출장 — A 를 '구간·횟수가 무가정으로 확정'으로 재정의, 기관 판정기준은 거리 공급원으로"
```

---

### Task 6: L2 라벨 추가 · 라벨 키 방향 무관

**Files:**
- Modify: `index.html` — `@trip-labels` 블록 (약 4005~4013) · `classifyRail` 의 라벨 조회 (약 4740~4745)
- Test: `tests/test_trip_rail.py`

**Interfaces:**
- Consumes: Task 5 의 등급 체계
- Produces: 라벨 키를 `[...O, ...D]` 를 정렬해 `|` 로 이은 꼴로 만든다. `TRIP_LABELS.items[].key` 도 같은 규칙으로 적는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```python
H.test_name("라벨 — 방향 무관 · L2 (2026-11-20)")
on("2026-08-26")
r = c("경주", "세종", 43000)
H.ok(r["label"] == "L1" and r["km"] == 332.5, f"L1 유지 — {r['gradeLabel']} {r['km']}")
r = c("세종", "경주", 43000)
H.ok(r["label"] == "L1", "라벨은 방향이 반대여도 맞는다")
on("")
r = c("대구", "서울", 60900)
H.ok(r["label"] == "L2" and r["legs"] == 1 and r["km"] == 286.7, f"L2 — 대구–서울 특실 편도 286.7km — {r['gradeLabel']}")
H.ok(r["gradeLabel"] == "A 업무상 확정(사용자 확인)", f"라벨은 A 지위 — {r['gradeLabel']}")
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `python tests/test_trip_rail.py`
Expected: FAIL — 역방향이 안 맞고 L2 가 없다

- [ ] **Step 3: 키를 정규화하고 L2 를 넣는다**

조회 키를 `[...new Set([...O, ...D])].sort().join('|') + '|' + f` 로 바꾼다.
`@trip-labels` 블록의 L1 키를 같은 꼴(`경주|세종|43000`)로 고치고, L2 를 더한다 —
`{"id":"L2","key":"대구|서울|60900","period":"전","legs":1,"km":286.7,"basis":"KTX 동대구→서울 편도 특실 (운임표 60,900) — 입석 왕복이 아니다","confirmed":"2026-11-20"}`.
블록 주석의 키 설명도 새 규칙으로 고친다.

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `python tests/run_all.py`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/test_trip_rail.py
git commit -m "출장 — 라벨 키를 방향 무관으로 정규화, L2(대구–서울 60,900 = 특실 편도) 추가"
```

---

### Task 7: 등급 표기를 확정/추정 2단계로

대외에 보이는 곳은 **확정**(A + 사용자 확인 라벨) / **추정**(나머지) 두 단계로 접는다. 내부 B·C·D 는 그대로 남긴다(설계서 §7).

**Files:**
- Modify: `index.html` — `tripSummarize` 와 Scope 3 카드 표기
- Test: `tests/test_trip_ui.py`

**Interfaces:**
- Consumes: Task 5 의 등급 문자열
- Produces: `tripSummarize` 결과에 `확정` · `추정` 두 집계를 더한다(기존 `A`/`B`/`C`/`D` 는 유지).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```python
H.test_name("등급 표기 2단계 (확정/추정)")
s = page.evaluate("tripSummarize(window.__rows)")
H.ok(s["확정"] + s["추정"] == s["n"], f"확정 + 추정 = 산정 건수 — {s['확정']} + {s['추정']} vs {s['n']}")
txt = [t.inner_text() for t in page.query_selector_all(".s3-card .s3-sub")]
H.ok(any("확정" in t and "추정" in t for t in txt), f"Scope 3 카드에 확정·추정이 함께 보인다 — {txt}")
```

기존 `[Scope 3 카드]` 단정(현재 `'출장(철도) 137.5 tCO₂eq · 전사 · 추정 20%'`)을 새 표기로 다시 쓴다.
선택자(`.s3-card .s3-sub`)는 그 단정이 지금 쓰는 것을 그대로 쓴다 — 테스트 파일에서 확인해 맞춘다.

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `python tests/test_trip_ui.py`
Expected: FAIL

- [ ] **Step 3: 집계와 표기를 더한다**

`tripSummarize` 에 `확정 = A 건수`, `추정 = 나머지` 를 더하고, Scope 3 카드의 "추정 N%" 를 `확정 N% · 추정 M%` 로 바꾼다. 추정분 tCO₂e 도 함께 낸다(설계서 §6.2 의 "추정분 X t (Y%)").

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `python tests/run_all.py`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/test_trip_ui.py
git commit -m "출장 — 대외 등급 표기를 확정/추정 2단계로 (내부 B·C·D 유지)"
```

---

### Task 8: 재산정·평가 도구 `tools/eval_trip.py`

전후 비교 숫자를 뽑는다. `tools/build_trip_seen.py` 와 같은 방식이다.

**Files:**
- Create: `tools/eval_trip.py`
- Test: `tests/test_eval_trip.py`

**Interfaces:**
- Consumes: `index.html` 의 엔진·기준표 블록
- Produces: CLI — `python tools/eval_trip.py <관내출장.xls> index.html [--places <사전덤프.json>]`. 표준출력에 연도별 표(산정 건수 · 확정 · 추정 · 내부 B·C·D · tCO₂e)와 라벨 대상 조합 상위 목록(구간·기간·금액·건수)을 낸다.

- [ ] **Step 1: 지표 계산 함수의 실패하는 테스트를 쓴다**

```python
def test_summarize_rows():
    rows = [{"year": 2023, "grade": "A", "kg": 1000.0}, {"year": 2023, "grade": "D", "kg": 500.0}]
    s = summarize(rows)
    assert s[2023]["확정"] == 1 and s[2023]["추정"] == 1
    assert s[2023]["t"] == 1.5                      # 1,500 kg → 1.5 t
    assert s[2023]["확정률"] == 50.0
```

숫자를 내는 코드는 검증된 뒤에 쓴다(설계서 §8.3).

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `python tests/test_eval_trip.py`
Expected: FAIL — `summarize` 가 없다

- [ ] **Step 3: `summarize(rows) -> dict` 를 구현한다**

`tools/eval_trip.py` 에 둔다. 연도별로 `확정`(등급이 `A` 로 시작) · `추정`(나머지) 건수, 내부 B·C·D 건수, kg 합을 t 로(소수 1자리), 확정률(%)을 낸다.

- [ ] **Step 4: 조합 집계 `combos(rows) -> list` 를 구현한다**

추정 행만 모아 `(구간, 기간, 금액)` 으로 세고 건수 내림차순으로 돌려준다. 장소명은 넣지 않는다.
설계서 §6.2 의 3건 기준으로 "라벨 대상"과 "꼬리"를 갈라 건수를 함께 낸다.

- [ ] **Step 5: 엔진 구동부를 붙인다**

`tools/build_trip_seen.py` 의 `block()` + `sync_playwright` + `page.add_script_tag` 구조를 그대로 쓴다.
`@trip-labels` 블록도 함께 주입한다(`build_trip_seen.py` 는 주입하지 않으므로 그대로 베끼면 라벨이 빠진다).
`--places` 가 주어지면 `placeMap` 으로 넘기고, 출력 머리말에 **"장소 사전: 있음/없음"** 을 반드시 적는다(설계서 §11.3).

- [ ] **Step 6: 테스트를 돌려 통과를 확인한다**

Run: `python tests/run_all.py`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add tools/eval_trip.py tests/test_eval_trip.py tests/run_all.py
git commit -m "출장 — 재산정·평가 도구 eval_trip.py (확정/추정 분포·라벨 대상 조합)"
```

---

### Task 9: 실제 자료로 재산정하고 변동을 기록

**사용자에게 관내출장 엑셀(2023~2026)을 받아야 시작한다.** 파일이 없으면 이 작업은 대기한다.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-20-trip-a-grade-reset-design.md` (§11.4 를 실측값으로) · `docs/HANDOFF-trip-scope3.md` (현재 수치 표)
- Modify: `index.html` — 필요하면 `@trip-seen` 블록 재생성

- [ ] **Step 1: 재산정한다**

```bash
python tools/eval_trip.py <관내출장.xls> index.html
```

- [ ] **Step 2: Review Focus 의 변동을 센다**

세 가지를 각각 건수와 tCO₂e 로 낸다 — ① 기관 기준표 거리와 새 A 거리가 달라진 행 ② 입석 왕복이 사라져 설명을 잃은 행 ③ 총 배출량 변동(651.1t 기준).
총량이 움직였으면 **수치와 이유를 함께** 적는다(설계서 §3 실패 조건).

- [ ] **Step 3: 유형별 우연 일치율을 다시 계산한다**

설계서 §8.5 가 확정 비율과 **나란히 제시하라**고 한 숫자다. §10 이 빌더에게 남긴 항목이기도 하다.
방법은 앞선 설계 §13.3-2 와 같다 — 주요 구간 × 개편 전/후에 **100원 단위로 모든 금액을 넣어** A 가 되는 비율(과녁 크기)을 세고,
실제 자료의 비(非)운임표 행 비율로 보정한다. 종전 값은 유형별 0.5~3.7% · 가중 평균 1.5% 였다.
새 정의는 ①장소를 필수로 요구하므로 낮아질 것으로 보나 **확인해야 한다.**
**추정임을 반드시 명시한다**(가정에 기댄 값이다).

- [ ] **Step 4: `TRIP_SEEN` 을 다시 만들지 판단한다**

새 A 는 `TRIP_SEEN` 을 조건으로 쓰지 않는다(Task 5). 라벨 우선순위 산출용으로만 남길지 결정하고 설계서 §10 에 적는다.
남긴다면 `python tools/build_trip_seen.py <관내출장.xls> index.html` 로 다시 만든다.

- [ ] **Step 5: 문서를 갱신한다**

설계서 §11.4 의 추정을 실측값으로 바꾸고, 인수인계 문서의 "현재 수치" 표를 확정/추정 표기로 다시 쓴다.
우연 일치율은 확정 비율 바로 옆에 적는다(§8.5).

- [ ] **Step 6: 커밋**

```bash
git add docs/ index.html
git commit -m "출장 — 새 A 정의로 재산정, 확정/추정 분포와 총량 변동 기록"
```
