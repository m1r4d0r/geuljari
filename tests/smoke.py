"""글결 읽기 틀 스모크.
저장소 루트를 정적 서버로 띄우고 PC·폰 크기에서 쓰기 → 넘김(스밈) → 쓰는 중 넘기기(먼저 다 씀) → 쓸기 → 끌기 → 휠 → 길게 누르기
→ 끝 장(카드 그림·제목·눈금) → 다시 보기를 차례로 밟는다. 화면에 눈금 말고 글자가 없는지도 본다.
쓰임: python3 tests/smoke.py [찍은 그림을 둘 폴더]   (Playwright Chromium 필요: pip install playwright && playwright install chromium)
서버 포트는 GEUL_PORT로 바꿀 수 있다(기본 8791).
"""
import sys, os, subprocess, time, pathlib, glob
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tests' / 'out'
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('GEUL_PORT', 8791))

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)
errors = []
state = """() => [...document.querySelectorAll('.sheet')].map(s => (s.classList.contains('is-current')?'C':'') + (s.classList.contains('ending') ? 'end' : (s.classList.contains('fits')?'f':'s') + ':' + s.querySelectorAll('.ch:not(.pending)').length + '/' + s.querySelectorAll('.ch').length)).join('  ')"""
cur = "() => { const s = document.querySelector('.sheet.is-current'); return s.classList.contains('ending') ? 'end' : s.dataset.i + ' ' + s.querySelectorAll('.ch:not(.pending)').length + '/' + s.querySelectorAll('.ch').length; }"
ui_text = "() => [...document.querySelectorAll('.ui')].map(el => el.innerText.trim()).join('') + '|' + [...document.querySelectorAll('.ui button, .ui a')].filter(b => !b.classList.contains('dot')).length"
try:
    with sync_playwright() as p:
        args = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
        try:
            b = p.chromium.launch(args=args)
        except Exception:
            b = p.chromium.launch(executable_path=(glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome') or [None])[0], args=args)
        for (W, H, tag) in [(1280, 800, 'desk'), (390, 844, 'phone')]:
            ctx = b.new_context(viewport={'width': W, 'height': H})
            ctx.route('**/fonts.g*', lambda r: r.abort())
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(f'{tag} pageerror: {e}'))
            pg.on('console', lambda m: m.type == 'error' and 'ERR_' not in m.text and errors.append(f'{tag} {m.text}'))
            pg.goto(f'http://127.0.0.1:{PORT}/reader.html'); pg.wait_for_timeout(2500)
            print(tag, '0 writing', pg.evaluate(state))
            print(tag, 'ui text (empty|0 expected)', repr(pg.evaluate(ui_text)), '| dots', pg.evaluate("() => [...document.querySelectorAll('#dots .dot')].map(d => d.getAttribute('aria-label')).join(' ')"))
            pg.screenshot(path=str(OUT / f'{tag}-p0.png'))
            pg.wait_for_timeout(9000)
            print(tag, '0 done   ', pg.evaluate(state))
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(350)
            pg.screenshot(path=str(OUT / f'{tag}-drift.png'))
            pg.wait_for_timeout(1200)
            print(tag, '1 landed ', pg.evaluate(cur))
            pg.wait_for_timeout(400)
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(150)
            print(tag, '1 first press finishes the page, stays', pg.evaluate(cur))
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

            # 끝 장: 마지막 쪽 다음
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(150)
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(2400)
            print(tag, 'ending', pg.evaluate(cur), '| card', pg.evaluate("() => { const i = document.querySelector('.sheet.ending .end-full'); return i && [i.naturalWidth, i.naturalHeight]; }"),
                  '| title', repr(pg.evaluate("() => document.title")), '| end dot', pg.evaluate("() => document.querySelector('#dots .dot.end').getAttribute('aria-current')"),
                  '| buttons', pg.evaluate("() => [...document.querySelectorAll('.sheet.ending .end-acts > *')].map(b => b.textContent + (b.href ? '→' + b.getAttribute('href') : '')).join(' / ')"))
            print(tag, '  made', pg.text_content('.sheet.ending .end-made'), '| card()', pg.evaluate("() => { const c = GeulEnding.card(); return c && [c.canvas.width, c.canvas.height, !!c.blob]; }"))
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
            print(tag, '  stays on ending', pg.evaluate(cur))
            pg.screenshot(path=str(OUT / f'{tag}-ending.png'))
            pg.click('.sheet.ending .end-again'); pg.wait_for_timeout(700)
            print(tag, 'again from 1', pg.evaluate(state))
            pg.click('#dots .dot.end'); pg.wait_for_timeout(1200)
            print(tag, 'dot to ending', pg.evaluate(cur))
            print(tag, 'canvases', pg.evaluate("() => document.querySelectorAll('canvas.ground').length"), 'width', pg.evaluate("() => document.documentElement.scrollWidth"))
            ctx.close()
        b.close()
finally:
    srv.terminate()
real = [e for e in errors if 'swiftshader' not in e and 'ReadPixels' not in e]
print('errors:', real or 'none')
sys.exit(1 if real else 0)
