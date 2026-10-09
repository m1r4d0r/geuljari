"""글결 읽기 틀 스모크.
저장소 루트를 정적 서버로 띄우고 PC·폰 크기에서 쓰기 → 넘김(스밈) → 쓸기 → 끌기 → 휠 → 길게 누르기 → 처음부터를 차례로 밟는다.
쓰임: python3 tests/smoke.py [찍은 그림을 둘 폴더]   (Playwright Chromium 필요: pip install playwright && playwright install chromium)
"""
import sys, subprocess, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tests' / 'out'
OUT.mkdir(parents=True, exist_ok=True)
PORT = 8791

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)
errors = []
state = """() => [...document.querySelectorAll('.sheet')].map(s => (s.classList.contains('is-current')?'C':'') + (s.classList.contains('fits')?'f':'s') + ':' + s.querySelectorAll('.ch:not(.pending)').length + '/' + s.querySelectorAll('.ch').length).join('  ')"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
        for (W, H, tag) in [(1280, 800, 'desk'), (390, 844, 'phone')]:
            ctx = b.new_context(viewport={'width': W, 'height': H})
            ctx.route('**/fonts.g*', lambda r: r.abort())
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(f'{tag} pageerror: {e}'))
            pg.on('console', lambda m: m.type == 'error' and 'ERR_' not in m.text and errors.append(f'{tag} {m.text}'))
            pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(2500)
            print(tag, '0 writing', pg.evaluate(state))
            pg.screenshot(path=str(OUT / f'{tag}-p0.png'))
            pg.wait_for_timeout(9000)
            print(tag, '0 done   ', pg.evaluate(state))
            pg.click('#next'); pg.wait_for_timeout(350)
            pg.screenshot(path=str(OUT / f'{tag}-drift.png'))
            pg.wait_for_timeout(1200)
            print(tag, '1 landed ', pg.evaluate(state))
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(200)
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(520)
            pg.screenshot(path=str(OUT / f'{tag}-sweep.png'))
            pg.wait_for_timeout(3500)
            print(tag, '2 night  ', pg.evaluate(state))
            pg.mouse.move(W*0.8, H*0.5); pg.mouse.down(); pg.mouse.move(W*0.8 - W*0.35, H*0.5, steps=6); pg.wait_for_timeout(100)
            pg.mouse.up(); pg.wait_for_timeout(2500)
            print(tag, '3 drag   ', pg.evaluate(state))
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(100)
            for _ in range(4):
                pg.mouse.wheel(0, 120); pg.wait_for_timeout(40)
            pg.wait_for_timeout(2500)
            print(tag, '4 wheel  ', pg.evaluate(state))
            pg.screenshot(path=str(OUT / f'{tag}-last.png'))
            box = pg.evaluate("() => { const l = document.querySelector('.sheet.is-current .ln'); const r = l.getBoundingClientRect(); return [r.x + 20, r.y + r.height/2]; }")
            pg.mouse.move(*box); pg.mouse.down(); pg.wait_for_timeout(800)
            print(tag, 'linger', pg.evaluate("() => document.querySelector('.sheet.is-current').classList.contains('lingering')"))
            pg.mouse.up(); pg.wait_for_timeout(200)
            pg.click('#replay'); pg.wait_for_timeout(400)
            print(tag, 'replay  ', pg.evaluate(state))
            print(tag, 'canvases', pg.evaluate("() => document.querySelectorAll('canvas.ground').length"), 'width', pg.evaluate("() => document.documentElement.scrollWidth"))
            ctx.close()
        b.close()
finally:
    srv.terminate()
real = [e for e in errors if 'swiftshader' not in e and 'ReadPixels' not in e]
print('errors:', real or 'none')
sys.exit(1 if real else 0)
