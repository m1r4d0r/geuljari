"""글결 합본 스모크.
저장소 루트를 정적 서버로 띄우고 PC·폰 크기에서
쓰기(예시 글, 결 보기·규칙 불) → 묻기 1(결·견본 한 줄) → 2(글에서 반전 줄 누르기) → 3(글에서 끌어 남길 곳)
→ 1차 안(전체 화면 미리보기가 써지는지) → 다듬기(효과 감싸기 뒤 그 자리부터 미리보기, 넘김 바꾸기, 제안 받기)
→ 긴 쪽에서 쓰는 자리가 화면 아래에 닿으면 저절로 내리지 않고 기다리는지를 차례로 밟는다.
쓰임: python3 tests/smoke_hapbon.py [찍은 그림을 둘 폴더]   (Playwright Chromium 필요)
"""
import sys, subprocess, time, pathlib, glob
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tests' / 'out'
OUT.mkdir(parents=True, exist_ok=True)
PORT = 8795
ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)
errors = []
written = """() => { const d = document.querySelector('.sheet.is-current'); return d ? (+d.dataset.i + 1) + '쪽 ' + d.querySelectorAll('.ch:not(.pending)').length + '/' + d.querySelectorAll('.ch').length : 'none'; }"""


def launch(p):
    try:
        return p.chromium.launch(args=ARGS)
    except Exception:
        exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome') or [None])[0]
        return p.chromium.launch(executable_path=exe, args=ARGS)


def frame(pg, sel):
    return pg.query_selector(sel).content_frame()


try:
    with sync_playwright() as p:
        b = launch(p)
        for (W, H, tag) in [(1280, 800, 'desk'), (390, 844, 'phone')]:
            ctx = b.new_context(viewport={'width': W, 'height': H})
            ctx.route('**/fonts.g*/**', lambda r: r.abort())
            pg = ctx.new_page()
            pg.on('pageerror', lambda e, t=tag: errors.append(f'{t} pageerror: {e}'))
            pg.on('console', lambda m, t=tag: m.type == 'error' and 'ERR_' not in m.text and errors.append(f'{t} {m.text}'))
            pg.on('dialog', lambda d: d.accept())
            pg.goto(f'http://127.0.0.1:{PORT}/hapbon/index.html'); pg.wait_for_timeout(600)
            print(tag, 'empty', repr(pg.evaluate("() => document.getElementById('src').value")), '| title', repr(pg.evaluate("() => document.getElementById('title').value")))
            pg.screenshot(path=str(OUT / f'hb-{tag}-0empty.png'))
            pg.click('#sample'); pg.wait_for_timeout(400)
            print(tag, 'rules', pg.evaluate("() => [...document.querySelectorAll('.rule')].map(r => r.dataset.rule + (r.classList.contains('on') ? '●' : '○') + r.querySelector('.n').textContent).join(' ')"),
                  '| gyeol', pg.evaluate("() => [document.querySelectorAll('.g-page').length, document.querySelectorAll('.g-sp.rest').length, document.querySelectorAll('.g-m').length]"))
            pg.screenshot(path=str(OUT / f'hb-{tag}-1write.png'))

            pg.click('#go-ask'); pg.wait_for_timeout(900)
            print(tag, 'Q1', pg.text_content('#ask-title'), '| moods', pg.evaluate("() => [...document.querySelectorAll('#moods [aria-pressed=true]')].map(b => b.textContent)"),
                  '| sample', pg.evaluate("() => document.querySelectorAll('#sample-line .ch:not(.pending)').length + '/' + document.querySelectorAll('#sample-line .ch').length"))
            print(tag, '  prepared', pg.evaluate("() => { const v = document.getElementById('src').value; return [(v.match(/\\[\\[/g)||[]).length, (v.match(/\\{\\{/g)||[]).length]; }"), '| toast', pg.text_content('#toast'))
            pg.screenshot(path=str(OUT / f'hb-{tag}-2q1.png'))
            pg.click('#moods button:nth-child(9)'); pg.wait_for_timeout(300)
            print(tag, '  mix', pg.text_content('#mix'))
            pg.click('#ask-next'); pg.wait_for_timeout(500)
            print(tag, 'Q2', pg.text_content('#turn-line'))
            # 글에서 "그리고 잉크" 줄을 누른다
            pg.evaluate("""() => { const t = document.getElementById('src'); const i = t.value.indexOf('그리고 잉크'); t.focus(); t.setSelectionRange(i + 2, i + 2); t.dispatchEvent(new PointerEvent('pointerup')); }""")
            pg.wait_for_timeout(300)
            print(tag, '  turn now', pg.text_content('#turn-line'))
            pg.screenshot(path=str(OUT / f'hb-{tag}-3q2.png'))
            pg.click('#ask-next'); pg.wait_for_timeout(500)
            # 두 줄에 걸쳐 끌어 고르기
            pg.evaluate("""() => { const t = document.getElementById('src'); const a = t.value.indexOf('그날도'); const b = t.value.indexOf('오랜만이었다.') + 7; t.focus(); t.setSelectionRange(a, b); t.dispatchEvent(new PointerEvent('pointerup')); }""")
            pg.wait_for_timeout(300)
            print(tag, 'Q3 focus', repr(pg.text_content('#focus-line')))
            pg.screenshot(path=str(OUT / f'hb-{tag}-4q3.png'))
            pg.click('#ask-next'); pg.wait_for_timeout(3500)
            print(tag, '1차 안 full', not pg.evaluate("() => document.getElementById('pv-layer').hidden"), frame(pg, '#pv-full-frame').evaluate(written))
            pg.screenshot(path=str(OUT / f'hb-{tag}-5full.png'))

            pg.click('#pv-tune'); pg.wait_for_timeout(500)
            if tag == 'phone':
                pg.click('#tabs [data-tab="paper"]'); pg.wait_for_timeout(200)
            pg.evaluate("""() => { const t = document.getElementById('src'); const i = t.value.indexOf('잘 지내냐고'); t.focus(); t.setSelectionRange(i, i + 30); document.dispatchEvent(new Event('selectionchange')); }""")
            pg.wait_for_timeout(200)
            print(tag, 'tune fxbar', not pg.evaluate("() => document.getElementById('fxbar').hidden"))
            pg.click('#fx-list [data-fx="떨림"]'); pg.wait_for_timeout(300)
            print(tag, '  wrapped', '{{떨림:잘 지내냐고' in pg.evaluate("() => document.getElementById('src').value"), '| where', pg.text_content('#pv-where'))
            if tag == 'phone':
                pg.click('#tabs [data-tab="look"]'); pg.wait_for_timeout(300)
            pg.wait_for_timeout(2500)
            print(tag, '  preview from there', frame(pg, '#pv').evaluate(written))
            pg.screenshot(path=str(OUT / f'hb-{tag}-6tune.png'))
            if tag == 'phone':
                pg.click('#tabs [data-tab="set"]'); pg.wait_for_timeout(200)
            pg.click('#set-turn button:nth-child(2)'); pg.wait_for_timeout(300)
            print(tag, '  turn set', pg.text_content('#toast'), '| tags', pg.evaluate("() => document.querySelectorAll('#pagelist .tag').length"), 'sugg', pg.evaluate("() => [...document.querySelectorAll('#pagelist .tag')].filter(t => !t.querySelector('.box.on')).length"))
            sug = pg.locator('#pagelist button.tag:not(:has(.box.on))').first
            if sug.count():
                sug.click(); pg.wait_for_timeout(300)
                print(tag, '  accepted ->', pg.evaluate("() => (document.getElementById('src').value.match(/\\{\\{/g) || []).length"))
            pg.screenshot(path=str(OUT / f'hb-{tag}-7set.png'), full_page=True)

            # 긴 쪽에서 기다리기: 전체 화면으로 열어 2쪽에서 쓰는 자리를 지켜본다
            pg.click('#open-full'); pg.wait_for_timeout(1200)
            fr = frame(pg, '#pv-full-frame')
            fr.evaluate("() => document.getElementById('next').click()"); pg.wait_for_timeout(300)
            fr.evaluate("() => document.getElementById('next').click()"); pg.wait_for_timeout(8000)
            print(tag, 'gate', fr.evaluate("() => { const s = document.querySelector('.sheet.is-current'); return [s.classList.contains('fits') ? 'fits' : 'overflow', Math.round(s.querySelector('.scroll').scrollTop), document.querySelector('.cue').classList.contains('is-on')]; }"), fr.evaluate(written))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            print(tag, 'esc closes', pg.evaluate("() => document.getElementById('pv-layer').hidden"))
            print(tag, 'h-scroll', pg.evaluate("() => document.documentElement.scrollWidth > innerWidth"), '| mirror=input', pg.evaluate("() => document.getElementById('mirror').scrollHeight === document.getElementById('src').scrollHeight"))
            ctx.close()
        b.close()
finally:
    srv.terminate()
real = [e for e in errors if 'swiftshader' not in e and 'ReadPixels' not in e and 'GPU stall' not in e]
print('errors:', real or 'none')
