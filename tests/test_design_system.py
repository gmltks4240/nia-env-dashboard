"""
디자인 시스템 규칙 — '스케일은 하나만' 이 흐트러지지 않게 지킨다.
화면을 띄우지 않고 index.html 의 CSS 선언만 읽어서 검사한다.

지키는 것
  · 글자 크기에 소수점(12.5px 같은 반픽셀)을 쓰지 않는다 — 일반 모니터에서 뭉개진다
  · 모서리 둥글기는 정해진 가족 안에서만 고른다
  · transition 은 길이를 직접 쓰지 않고 토큰을 쓰고, 곡선(ease-out)을 반드시 적는다
"""
import pathlib
import re

import harness as H

_RAW = (pathlib.Path(__file__).resolve().parent.parent / "index.html").read_text(encoding="utf-8")
# 주석 안의 설명 문구를 선언으로 오인하지 않게 걷어낸다 (/* … */ 와 줄 끝 //)
SRC = re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", _RAW, flags=re.S))

RADIUS_OK = {"0", "2", "4", "6", "8", "10", "12", "16", "999"}


def run():
    # ── 글자 크기: 반픽셀 금지 ──
    H.test_name("글자 크기")
    frac = re.findall(r"font-size:\s*([0-9]+\.[0-9]+)px", SRC)
    H.ok(not frac, f"소수점 크기 없음 — {sorted(set(frac)) if frac else '0곳'}")
    sizes = sorted({int(v) for v in re.findall(r"font-size:\s*([0-9]+)px", SRC)})
    STEPS = {10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 44}
    off = sorted(set(sizes) - STEPS)
    H.ok(not off, f"글자 크기가 정해진 단계 안 — 벗어난 값 {off if off else '없음'}")
    weights = sorted({int(v) for v in re.findall(r"font-weight:\s*([0-9]+)", SRC)})
    H.ok(not any(w >= 700 for w in weights), f"굵기 700 이상 없음 (400/500/600 만) — {weights}")

    # ── 모서리 둥글기: 정해진 가족만 ──
    H.test_name("모서리 둥글기")
    bad = set()
    for decl in re.findall(r"border-radius:\s*([^;}\n]*)", SRC):
        if "var(" in decl or "%" in decl:
            continue
        for v in re.findall(r"([0-9]+)px", decl):
            if v not in RADIUS_OK:
                bad.add(v + "px")
    H.ok(not bad, f"허용 값만 사용 — 벗어난 값 {sorted(bad) if bad else '없음'}")

    # ── 색의 역할: --primary 하나로 뭉뚱그리지 않는다 ──
    H.test_name("색의 역할")
    H.ok("var(--primary)" not in SRC and "--primary:" not in SRC, "--primary 를 쓰지 않음 (accent/focus/chart-* 로 역할 분리)")
    for tok in ("--accent", "--focus", "--chart-elec", "--chart-s1", "--chart-pred"):
        H.ok(f"{tok}:" in SRC, f"{tok} 정의됨")
    H.ok("cssVar('--chart-" in SRC, "JS 차트 색이 CSS 토큰을 읽음 (팔레트 두 벌 금지)")

    # ── 층위(다크): 그림자는 다크용 처방, 오버레이는 블러 ──
    H.test_name("층위")
    for tok in ("--shadow:", "--shadow-md:"):
        line = next((l for l in SRC.splitlines() if l.strip().startswith(tok)), "")
        H.ok("rgba(255,255,255" in line, f"{tok[:-1]} 에 윗선 빛(inset 흰색) 포함 — 검은 그림자만으로는 다크에서 안 보임")
    H.ok("backdrop-filter:blur" in SRC, "모달 오버레이에 블러")

    # ── 누름 피드백: :active 가 있어야 한다 (모바일에선 유일한 반응) ──
    H.test_name("누름 피드백")
    H.ok(SRC.count(":active") >= 6, f":active 규칙 {SRC.count(':active')}개 (0이면 안 됨)")
    H.ok("scale(.98)" in SRC, "단추 누름 scale(.98)")
    H.ok("translateY(-1px)" in SRC, "선택 가능한 카드 hover 들림")

    # ── 묶음 B: 대문자 라벨 없음 · 팝업 진입 애니메이션 · 입력 포커스 링 ──
    H.test_name("컴포넌트")
    css = SRC[SRC.index("<style>"):SRC.index("</style>")]
    H.ok("text-transform:uppercase" not in css, "대문자 변환 라벨 없음 (자간 벌린 대문자는 템플릿 티)")
    H.ok("@keyframes modal-in" in css and "animation:modal-in" in css, "팝업 진입 애니메이션")
    H.ok("color-mix(in srgb,var(--focus)" in css, "입력 포커스 링이 --focus 토큰")

    # ── 반응형 분기점: 6단계만 (480 560 640 767 1023 1120) ──
    H.test_name("분기점")
    bps = sorted({int(v) for v in re.findall(r"@media[^{]*?\(max-width:\s*([0-9]+)px\)", SRC)})   # 미디어 쿼리만 (일반 max-width 속성 제외)
    off = sorted(set(bps) - {480, 560, 640, 767, 1023, 1120})
    H.ok(not off, f"max-width 분기점이 6단계 안 — 벗어난 값 {off if off else '없음'}")
    H.ok("min-width:641px" in SRC and "min-width:601px" not in SRC, "min-width 짝이 max-width:640 과 맞음")

    # ── 간격: 2px 격자 (홀수 px 금지, 1px 은 헤어라인으로 허용) ──
    H.test_name("간격")
    odd = sorted({int(v) for v in re.findall(r"(?:padding|gap|margin)[a-z-]*:[^;}\"']*?\b(\d+)px", SRC) if int(v) % 2 and int(v) > 1})
    H.ok(not odd, f"padding/gap/margin 에 홀수 px 없음 — {odd if odd else '없음'}")

    # ── 모션: 길이는 토큰으로, 곡선은 반드시 ──
    H.test_name("모션")
    trans = re.findall(r"transition:\s*([^;}\n]*)", SRC)
    H.ok(len(trans) > 20, f"transition 선언 {len(trans)}개")
    hard = [t for t in trans if re.search(r"[0-9]+(\.[0-9]+)?m?s", t)]
    H.ok(not hard, f"길이를 직접 쓴 곳 없음 — {hard[:3] if hard else '0곳'}")
    noease = [t for t in trans if "ease" not in t and "--t-" not in t and "cubic" not in t]
    H.ok(not noease, f"곡선 없는 선언 없음 — {noease[:3] if noease else '0곳'}")

    # ── 움직임 줄이기 설정이 길이 토큰을 0으로 만드는가 ──
    H.test_name("움직임 줄이기")
    m = re.search(r"@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\{([^}]*)\}", SRC)
    H.ok(m is not None, "reduced-motion 블록 존재")
    if m:
        zeros = dict(re.findall(r"(--dur-[a-z0-9]+):\s*([0-9]+)ms", m.group(1)))
        H.ok(zeros and all(v == "0" for v in zeros.values()),
             f"길이 토큰이 모두 0 — {zeros}")

    return H.summary()
