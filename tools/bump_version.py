#!/usr/bin/env python3
"""css/app.css · js/*.js 를 고친 뒤 실행: index.html 의 ?v= 를 파일 내용 해시로 맞춘다.

GitHub Pages 는 파일을 10분 캐시한다. 주소의 ?v= 가 바뀌어야 방문자가 새 파일을 받고,
새 index.html 과 옛 app.js 가 섞여 깨지는 일이 없다. (tests/test_design_system 이 어긋나면 알려 줌)

  python tools/bump_version.py
"""
import hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def assets(html):
    """index.html 이 불러오는 우리 파일 (css/·js/ 아래, ?v= 붙은 것)"""
    return re.findall(r'(?:href|src)="((?:css|js)/[^"?]+)\?v=', html)


def digest(rel):
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]


def main():
    html_p = ROOT / "index.html"
    html = html_p.read_text(encoding="utf-8")
    found = assets(html)
    for rel in found:
        html, n = re.subn(rf'({re.escape(rel)})\?v=[0-9a-f]+', rf'\g<1>?v={digest(rel)}', html)
        if n != 1:
            sys.exit(f"index.html 에서 {rel}?v= 를 {n}곳 찾음 (1곳이어야 함)")
    html_p.write_text(html, encoding="utf-8")
    missing = sorted({str(p.relative_to(ROOT)) for d in ("css", "js") for p in (ROOT / d).glob("*.*")} - set(found))
    if missing:
        sys.exit(f"index.html 이 불러오지 않는 파일: {missing} — <script>/<link> 를 추가할 것")
    print("\n".join(f"{a}?v={digest(a)}" for a in found))


if __name__ == "__main__":
    main()
