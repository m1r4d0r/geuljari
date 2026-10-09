"""분리된 시안 파일을 서버 없이 여는 독립 HTML로 묶는다."""
from pathlib import Path
import argparse
import base64
import re

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='저장된 독립 HTML과 일치하는지 확인한다.')
args = parser.parse_args()

html = (root / 'index.html').read_text(encoding='utf-8')
font_css = (root / 'fonts.css').read_text(encoding='utf-8')
for url in re.findall(r'url\(([^)]+)\)', font_css):
    data = (root / url).read_bytes()
    mime = 'font/woff2' if data[:4] == b'wOF2' else 'font/woff' if data[:4] == b'wOFF' else 'font/ttf'
    font_css = font_css.replace(url, 'data:' + mime + ';base64,' + base64.b64encode(data).decode())

replacements = {
    '<link rel="stylesheet" href="fonts.css">': '<style>' + font_css + '</style>',
    '<link rel="stylesheet" href="studio.css">': '<style>' + (root / 'studio.css').read_text(encoding='utf-8') + '</style>',
    "script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:;": "script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:;",
}
for name in ('sample.js', 'intent.js', 'studio.js'):
    replacements[f'<script src="{name}"></script>'] = '<script>' + (root / name).read_text(encoding='utf-8') + '</script>'
for old, new in replacements.items():
    if old not in html:
        raise SystemExit(f'묶을 요소를 찾지 못했습니다: {old}')
    html = html.replace(old, new)
html = re.sub(r'<nav class="proposal-links"[^>]*>.*?</nav>\n', '', html, flags=re.S)
licenses = '\n'.join(p.read_text(encoding='utf-8') for p in sorted((root / 'fonts').glob('*OFL.txt')))
html = html.replace('</html>', '<!-- Bundled fonts: SIL Open Font License 1.1\n' + licenses.replace('--', '—') + '\n-->\n</html>')
target = root / 'downloads' / 'geulgyeol-first-draft.html'
if args.check:
    if not target.exists() or target.read_text(encoding='utf-8') != html:
        raise SystemExit('독립 HTML을 다시 생성해야 합니다. --check 없이 실행해 주세요.')
    print('독립 HTML이 소스와 일치합니다.')
else:
    target.parent.mkdir(exist_ok=True)
    target.write_text(html, encoding='utf-8')
    print(f'생성: {target.relative_to(root)} ({target.stat().st_size:,} bytes)')
