"""글결 편집실 스모크.
저장소 루트를 정적 서버로 띄우고 PC·폰 크기에서
쓰기(예시 글, 편집창 표시) → 짜기(줄 사이를 눌러 쪽 나누기, 반전 켜고 끄기, 잇기, 끌어 남기기, 심상)
→ 다듬기(무대 미리보기가 써지는지, 쪽 눈금으로 넘기기, PC·모바일 틀, 이 쪽 쪽지의 자리·넘김, 전체 쪽지의 글꼴,
글 쪽지에서 효과 감싸기와 다시 고르지 않고 바꾸기, 숨기기·꺼내기, 띠 흐려짐, 쓰는 중 넘기기 막기, 이 쪽 다시)
→ 심상 살펴보기 페이지를 차례로 밟는다.
쓰임: python3 tests/smoke_studio.py [찍은 그림을 둘 폴더]   (Playwright Chromium 필요)
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
src = "() => document.getElementById('src').value"
marks = "() => document.getElementById('src').value.split('\\n').filter(l => l.startsWith('[[')).join(' ')"
pages = "() => document.querySelectorAll('#cp-paper .cp-page').length"


def launch(p):
    try:
        return p.chromium.launch(args=ARGS)
    except Exception:
        exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome') or [None])[0]
        return p.chromium.launch(executable_path=exe, args=ARGS)


def pv(pg):
    return pg.query_selector('#pv').content_frame()


def select_in(pg, needle, length):
    """짜기 화면에서 needle이 든 글자 span을 찾아 length 글자를 끌어 고른 것처럼 만든다"""
    pg.evaluate("""([needle, n]) => {
      const sp = [...document.querySelectorAll('#cp-paper [data-o]')].find(s => s.textContent.includes(needle));
      const node = sp.firstChild; const i = node.data.indexOf(needle);
      const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + n);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.getElementById('cp-paper').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }""", [needle, length])


try:
    with sync_playwright() as p:
        b = launch(p)
        for (W, H, tag) in [(1280, 800, 'desk'), (390, 844, 'phone')]:
            ctx = b.new_context(viewport={'width': W, 'height': H}, has_touch=(tag == 'phone'))
            ctx.route('**/fonts.g*/**', lambda r: r.abort())
            pg = ctx.new_page()
            pg.on('pageerror', lambda e, t=tag: errors.append(f'{t} pageerror: {e}'))
            pg.on('console', lambda m, t=tag: m.type == 'error' and 'ERR_' not in m.text and errors.append(f'{t} {m.text}'))
            pg.on('dialog', lambda d: d.accept())
            pg.goto(f'http://127.0.0.1:{PORT}/'); pg.wait_for_timeout(600)
            print(tag, 'root opens studio', pg.evaluate("() => document.body.dataset.step"), '| empty', repr(pg.evaluate("() => document.getElementById('src').value")))
            pg.click('#sample'); pg.wait_for_timeout(400)
            print(tag, 'write marks', pg.evaluate("() => ['.m-page','.m-sp','.m-em'].map(s => s + ':' + document.querySelectorAll(s).length).join(' ')"), '|', pg.text_content('#count-w'))
            pg.screenshot(path=str(OUT / f'st-{tag}-1write.png'))

            # 짜기
            pg.click('#go-compose'); pg.wait_for_timeout(500)
            n0 = pg.evaluate(pages)
            print(tag, 'compose pages', n0, '| moods', pg.evaluate("() => [...document.querySelectorAll('#cp-moods [aria-pressed=true]')].map(b => b.textContent)"), '| mix', pg.text_content('#cp-mix'))
            # '그날도 그랬다.' 줄 바로 뒤의 틈
            idx = pg.evaluate("""() => { const s = [...document.querySelectorAll('.cp-seam')]; return s.findIndex(x => x.previousElementSibling && x.previousElementSibling.textContent.includes('그날도 그랬다')); }""")
            seam = pg.locator('.cp-seam').nth(idx)
            if tag == 'desk':
                seam.hover(); pg.wait_for_timeout(250)
                print(tag, '  seam hint on hover', pg.evaluate("(i) => getComputedStyle(document.querySelectorAll('.cp-seam')[i].querySelector('.cp-seam-hint')).opacity", idx))
                pg.screenshot(path=str(OUT / f'st-{tag}-2hover.png'))
            seam.click(); pg.wait_for_timeout(300)
            print(tag, '  split', pg.evaluate(pages) == n0 + 1, '그랬다.\n\n\n편지' in pg.evaluate(src))
            div = "() => [...document.querySelectorAll('.cp-div')].find(d => d.nextElementSibling && d.nextElementSibling.textContent.includes('편지를 쓰는'))"
            pg.evaluate("() => { const d = (" + div + ")(); d.querySelector('.cp-rev').click(); }")
            pg.wait_for_timeout(300)
            print(tag, '  reverse on', pg.evaluate(marks), '| night pages', pg.evaluate("() => document.querySelectorAll('.cp-page[data-scene=night]').length"))
            pg.evaluate("() => { const d = (" + div + ")(); d.querySelector('.cp-rev').click(); }"); pg.wait_for_timeout(200)
            print(tag, '  reverse off', repr(pg.evaluate(marks)))
            pg.evaluate("() => { const d = (" + div + ")(); d.querySelector('.cp-join').click(); }"); pg.wait_for_timeout(200)
            print(tag, '  join', pg.evaluate(pages) == n0)
            seam = pg.locator('.cp-seam').nth(idx); seam.click(); pg.wait_for_timeout(200)
            pg.evaluate("() => { const d = (" + div + ")(); d.querySelector('.cp-rev').click(); }"); pg.wait_for_timeout(200)
            select_in(pg, '보고 싶다고', 15); pg.wait_for_timeout(250)
            print(tag, '  pop', pg.evaluate("() => !document.getElementById('cp-pop').hidden && document.getElementById('cp-pop').textContent"))
            pg.locator('#cp-pop button', has_text='남기기').click(); pg.wait_for_timeout(250)
            print(tag, '  kept', '{{보고 싶다고 쓰는 것은 너무' in pg.evaluate(src), '| focus spans', pg.evaluate("() => document.querySelectorAll('.cp-em.focus').length"))
            pg.locator('#cp-moods button', has_text='숨찬').click(); pg.wait_for_timeout(200)
            print(tag, '  mood', pg.evaluate("() => [...document.querySelectorAll('#cp-moods [aria-pressed=true]')].map(b => b.textContent)"), '|', pg.text_content('#count-c'))
            pg.screenshot(path=str(OUT / f'st-{tag}-3compose.png'))

            # 다듬기
            pg.click('#go-tune'); pg.wait_for_timeout(3000)
            print(tag, 'tune preview', pv(pg).evaluate(written), '| frame', pg.evaluate("() => { const b = document.getElementById('frame-box'); const r = b.getBoundingClientRect(); return b.style.width + ' → ' + Math.round(r.width) + 'x' + Math.round(r.height); }"))
            print(tag, '  ticks', pg.evaluate("() => document.querySelectorAll('#ticks .tick').length"), 'dark', pg.evaluate("() => document.querySelectorAll('#ticks .tick.dark').length"), 'turn marks', pg.evaluate("() => document.querySelectorAll('#ticks .tick-turn').length"))
            pg.screenshot(path=str(OUT / f'st-{tag}-4tune.png'))
            pg.locator('#ticks .tick').nth(2).click(); pg.wait_for_timeout(1800)
            print(tag, '  tick goto', pv(pg).evaluate(written), '| current tick', pg.evaluate("() => document.querySelector('#ticks [aria-current=true]').textContent"))
            pg.click('#device [data-device="mobile"]'); pg.wait_for_timeout(300)
            print(tag, '  mobile frame', pg.evaluate("() => { const r = document.getElementById('frame-box').getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }"))
            pg.screenshot(path=str(OUT / f'st-{tag}-5mobile.png'))
            pg.click('#device [data-device="pc"]'); pg.wait_for_timeout(200)

            # 이 쪽 쪽지
            pg.click('.ruler-act [data-slip="page"]'); pg.wait_for_timeout(300)
            print(tag, 'page slip', pg.is_visible('#slip-page'), pg.text_content('#slip-page .stamp'), '| rows', pg.evaluate("() => [...document.querySelectorAll('#slip-page .sl-name')].map(x => x.textContent)"))
            pg.locator('#slip-page .seg button', has_text='가운데').click(); pg.wait_for_timeout(400)
            print(tag, '  place', pg.evaluate(marks))
            # 반전이 있는 쪽으로
            night = pg.evaluate("() => [...document.querySelectorAll('#ticks .tick')].findIndex(t => t.classList.contains('dark'))")
            pg.locator('#ticks .tick').nth(night).click(); pg.wait_for_timeout(1200)
            print(tag, '  on night page', pg.text_content('#slip-page .stamp'), pg.evaluate("() => [...document.querySelectorAll('#slip-page .sl-name')].map(x => x.textContent)"))
            pg.locator('#slip-page .seg button', has_text='섬광').click(); pg.wait_for_timeout(500)
            print(tag, '  turn', pg.evaluate(marks))
            pg.wait_for_timeout(5000)
            print(tag, '  auto next shows turn', pv(pg).evaluate(written))
            pg.screenshot(path=str(OUT / f'st-{tag}-6page.png'))

            # 전체 쪽지
            pg.click('.ruler-act [data-slip="all"]'); pg.wait_for_timeout(300)
            print(tag, 'all slip', pg.is_visible('#slip-all'), '| one sheet on phone', pg.is_visible('#slip-page'))
            pg.locator('#slip-all .seg button', has_text='함렛').click(); pg.wait_for_timeout(300)
            print(tag, '  font', pg.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--f-read').split(',')[0]"))
            pg.screenshot(path=str(OUT / f'st-{tag}-7all.png'))

            # 글 쪽지: 3쪽 글에서 효과
            pg.locator('#ticks .tick').nth(2).click(); pg.wait_for_timeout(1500)
            pg.click('.ruler-act [data-slip="text"]'); pg.wait_for_timeout(300)
            pg.evaluate("""() => { const t = document.querySelector('#slip-text textarea'); const i = t.value.indexOf('잘 지내냐고'); t.focus(); t.setSelectionRange(i, i + 12); document.dispatchEvent(new Event('selectionchange')); }""")
            pg.wait_for_timeout(200)
            print(tag, 'text slip', pg.text_content('#slip-text .stamp'), '| fxbar', pg.evaluate("() => !document.querySelector('#slip-text .fxbar').hidden"))
            pg.locator('#slip-text .fx-list [data-fx="떨림"]').click(); pg.wait_for_timeout(300)
            print(tag, '  wrapped', '{{떨림:잘 지내냐고' in pg.evaluate(src))
            pg.locator('#slip-text .fx-list [data-fx="사라짐"]').click(); pg.wait_for_timeout(300)
            print(tag, '  switched without re-drag', '{{사라짐:잘 지내냐고' in pg.evaluate(src), '| pressed', pg.evaluate("() => [...document.querySelectorAll('#slip-text .fx-list [aria-pressed=true]')].map(b => b.dataset.fx)"))
            pg.wait_for_timeout(2500)
            print(tag, '  preview from there', pv(pg).evaluate(written))
            pg.screenshot(path=str(OUT / f'st-{tag}-8text.png'))

            # 숨기기·꺼내기, 흐려짐
            pg.click('#hide-all'); pg.wait_for_timeout(200)
            print(tag, 'hide all', pg.evaluate("() => [document.getElementById('ruler').hidden, document.querySelectorAll('.slip:not([hidden])').length, document.getElementById('peek').hidden]"))
            pg.click('#peek'); pg.wait_for_timeout(200)
            print(tag, '  peek back', pg.evaluate("() => [document.getElementById('ruler').hidden, document.querySelectorAll('.slip:not([hidden])').length]"))
            pg.wait_for_timeout(3000)
            print(tag, '  idle fades', pg.evaluate("() => document.getElementById('stage').classList.contains('idle')"))

            # 쓰는 중 넘기기 막기, 이 쪽 다시
            pg.locator('#ticks .tick').nth(2).click(); pg.wait_for_timeout(1500)
            fr = pv(pg)
            fr.evaluate("() => document.getElementById('again').click()"); pg.wait_for_timeout(500)
            fr.evaluate("() => document.getElementById('next').click()"); pg.wait_for_timeout(300)
            print(tag, 'skip guard', fr.evaluate(written), fr.evaluate("() => document.querySelector('.cue.busy').classList.contains('is-on')"))
            pg.wait_for_timeout(4000)
            fr.evaluate("() => document.getElementById('again').click()"); pg.wait_for_timeout(600)
            print(tag, '  again (this page only)', fr.evaluate(written))
            print(tag, 'h-scroll', pg.evaluate("() => document.documentElement.scrollWidth > innerWidth"))

            # 단계 오가기: 다시 짜기로 갔다 오면 표시가 그대로
            pg.click('.steps [data-go="compose"]'); pg.wait_for_timeout(300)
            print(tag, 'back to compose', pg.evaluate(pages), 'pages | preview stopped', pg.evaluate("() => document.getElementById('pv').src"))
            pg.click('.steps [data-go="write"]'); pg.wait_for_timeout(300)
            print(tag, 'back to write', pg.evaluate("() => document.getElementById('src').value === JSON.parse(localStorage.getItem('geul.studio')).source"))

            pg.goto(f'http://127.0.0.1:{PORT}/simsang.html'); pg.wait_for_timeout(500)
            pg.click('.axis:nth-child(2) .tile:nth-of-type(1)'); pg.wait_for_timeout(1500)
            print(tag, 'simsang tiles', pg.evaluate("() => document.querySelectorAll('.tile').length"), '| playing', pg.evaluate("() => document.querySelectorAll('.tile.on .ch:not(.pending)').length + '/' + document.querySelectorAll('.tile.on .ch').length"))
            ctx.close()
        b.close()
finally:
    srv.terminate()
real = [e for e in errors if 'swiftshader' not in e and 'ReadPixels' not in e and 'GPU stall' not in e]
print('errors:', real or 'none')
