"""글결 먹지판 편집실 스모크.
저장소 루트를 정적 서버로 띄우고 PC·폰 크기에서 쓰기 → 묻기(낱말·문장·반전 고르기) → 1차 안(미리보기가 써지는지, 제안 받아들이기)
→ 다듬기(고른 자리에 효과 감싸기, 조판 바꾸기)를 차례로 밟는다.
쓰임: python3 tests/smoke_meokji.py [찍은 그림을 둘 폴더]   (Playwright Chromium 필요)
"""
import sys, subprocess, time, pathlib, glob
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tests' / 'out'
OUT.mkdir(parents=True, exist_ok=True)
PORT = 8792

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)
errors = []
written = """() => { const d = document.querySelector('.sheet.is-current'); return d ? d.querySelectorAll('.ch:not(.pending)').length + '/' + d.querySelectorAll('.ch').length : 'none'; }"""


def launch(p):
    try:
        return p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    except Exception:
        exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome') or [None])[0]
        return p.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])


try:
    with sync_playwright() as p:
        b = launch(p)
        for (W, H, tag) in [(1280, 800, 'desk'), (390, 844, 'phone')]:
            ctx = b.new_context(viewport={'width': W, 'height': H})
            ctx.route('**/fonts.g*/**', lambda r: r.abort())
            pg = ctx.new_page()
            pg.on('pageerror', lambda e, t=tag: errors.append(f'{t} pageerror: {e}'))
            pg.on('console', lambda m, t=tag: m.type == 'error' and 'ERR_' not in m.text and errors.append(f'{t} {m.text}'))
            pg.goto(f'http://127.0.0.1:{PORT}/meokji/index.html'); pg.wait_for_timeout(800)
            print(tag, 'write', pg.evaluate("() => [document.getElementById('src').value.length, document.getElementById('count-w').textContent, document.querySelectorAll('#gyeol i').length]"))
            pg.screenshot(path=str(OUT / f'mk-{tag}-1write.png'))

            pg.click('#go-ask'); pg.wait_for_timeout(300)
            print(tag, 'ask moods', pg.evaluate("() => [...document.querySelectorAll('#moods [aria-pressed=true]')].map(b => b.textContent)"),
                  '| focus', pg.text_content('#focus-text'), '| turn', pg.text_content('#turn-page'), pg.text_content('#turn-line'))
            pg.screenshot(path=str(OUT / f'mk-{tag}-2ask.png'), full_page=True)
            pg.click('#moods button:nth-child(1)'); pg.wait_for_timeout(100)
            print(tag, 'mix', pg.text_content('#mix'))
            pg.locator('.sent', has_text='종이는 그렇지 않다.').click(); pg.wait_for_timeout(100)
            print(tag, 'focus now', pg.text_content('#focus-text'))
            pg.click('#turn-mode'); pg.locator('.pk', has_text='그리고 잉크 한 방울이').click(); pg.wait_for_timeout(100)
            print(tag, 'turn now', pg.text_content('#turn-page'), pg.text_content('#turn-line'))

            pg.click('#go-draft'); pg.wait_for_timeout(4500)
            print(tag, 'draft facts', pg.text_content('#facts'))
            print(tag, 'draft preview written', pg.query_selector('#pv-draft').content_frame().evaluate(written))
            print(tag, 'pages', pg.evaluate("() => [...document.querySelectorAll('#pagelist li')].map(li => li.querySelector('.pg-n').textContent + ' ' + [...li.querySelectorAll('.tag')].map(t => (t.querySelector('.box.on') ? '■' : '□') + t.textContent).join(' / '))"))
            pg.screenshot(path=str(OUT / f'mk-{tag}-3draft.png'), full_page=True)
            sug = pg.locator('button.tag[aria-pressed=false]').first
            if sug.count():
                sug.click(); pg.wait_for_timeout(300)
                print(tag, 'accepted ->', pg.evaluate("() => document.querySelectorAll('button.tag[aria-pressed=true]').length"))

            pg.click('#go-refine'); pg.wait_for_timeout(1500)
            v = pg.evaluate("() => document.getElementById('marked').value")
            print(tag, 'refine marks', v.count('{{'), v.count('[['), '| mirror', pg.evaluate("() => ['.m-em','.m-sp','.m-page','.m-scene'].map(s => s + ':' + document.querySelectorAll(s).length).join(' ')"))
            pg.evaluate("""() => { const t = document.getElementById('marked'); const i = t.value.indexOf('그날도 그랬다.'); t.focus(); t.setSelectionRange(i, i + 8); document.dispatchEvent(new Event('selectionchange')); }""")
            pg.wait_for_timeout(150)
            print(tag, 'fxbar shown', pg.evaluate("() => !document.getElementById('fxbar').hidden"))
            pg.click('#fxbar [data-fx="번짐"]'); pg.wait_for_timeout(200)
            print(tag, 'wrapped', '{{번짐:그날도 그랬다.}}' in pg.evaluate("() => document.getElementById('marked').value"))
            pg.click('#set-scene button:nth-child(2)'); pg.wait_for_timeout(2800)
            print(tag, 'refine scene', pg.evaluate("() => [...document.querySelectorAll('#set-ground button')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' ')"),
                  '| preview', pg.query_selector('#pv-refine').content_frame().evaluate("() => document.querySelector('.sheet') && document.querySelector('.sheet').dataset.scene + ' ' + document.querySelector('.sheet').dataset.ground"))
            pg.screenshot(path=str(OUT / f'mk-{tag}-4refine.png'), full_page=True)
            # 표시층과 입력창의 글자 자리가 같은지: 마지막 글자 위치 비교
            print(tag, 'mirror height vs input', pg.evaluate("() => [document.getElementById('mirror').scrollHeight, document.getElementById('marked').scrollHeight]"))
            print(tag, 'h-scroll', pg.evaluate("() => document.documentElement.scrollWidth > innerWidth"))
            ctx.close()
        b.close()
finally:
    srv.terminate()
real = [e for e in errors if 'swiftshader' not in e and 'ReadPixels' not in e and 'GPU stall' not in e]
print('errors:', real or 'none')
