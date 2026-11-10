#!/usr/bin/env python3
"""
NIA 환경경영 대시보드 — 전체 테스트 실행
  python tests/run_all.py
종료 코드: 0 = 전체 통과, 1 = 실패 있음
"""
import sys, importlib, pathlib, time

# UTF-8 stdout (Windows cmd 대응)
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

TESTS = [
    "test_ghg_factors",
    "test_factor_log",
    "test_official_ghg",
    "test_export",
    "test_ux_icons",
    "test_ux_behavior",
    "test_skeleton_rings",
    "test_forecast",
    "test_design_system",
]

def main():
    t0 = time.time()
    results = {}
    all_ok = True

    for name in TESTS:
        # 각 모듈의 하네스 카운터 초기화
        import harness
        harness._pass = 0
        harness._fail = 0
        harness._current_test = ""

        mod = importlib.import_module(name)
        try:
            passed = mod.run()
        except Exception as exc:
            print(f"\n  CRASH {name}: {exc}")
            passed = False

        results[name] = passed
        if not passed:
            all_ok = False

    elapsed = time.time() - t0
    print("\n" + "=" * 50)
    print(f"  전체 결과  ({elapsed:.1f}s)")
    print("=" * 50)
    for name, ok in results.items():
        mark = "PASS" if ok else "FAIL"
        print(f"  {mark}  {name}")
    print("=" * 50)

    if all_ok:
        print("  모든 테스트 통과!")
    else:
        failed = [n for n, v in results.items() if not v]
        print(f"  실패: {', '.join(failed)}")

    return 0 if all_ok else 1

if __name__ == "__main__":
    sys.exit(main())
