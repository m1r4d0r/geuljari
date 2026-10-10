"""글결 편집실 스모크.
저장소 루트를 정적 서버로 띄우고 PC·폰 크기에서
글(예시 글, 쪽 면·구분선, 줄 사이에 올리면 '여기서 나누기'와 누르면 쪽 나누기, 반전 켜고 끄기, 잇기, 끌어 고르면 강조, 분위기)
→ 미리보기(화면을 채운 틀, 책갈피로 판 하나씩: 배경의 글 자리·반전 쪽의 넘어오는 결, 글씨의 글꼴, 강조 판의 효과 걸고 바꾸기,
글 상자 끌어 붙이기, Ctrl+휠·손가락 벌리기 확대와 맞춤, PC·폰 틀, 숨기기·꺼내기, 쓰는 중 넘기기 막기)
→ 글로 돌아가기 → 심상 살펴보기 페이지를 차례로 밟는다.
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
pages = "() => document.querySelectorAll('#write-ed .cp-shade').length"
frame_box = "() => { const b = document.getElementById('frame-box'); const r = b.getBoundingClientRect(); return b.style.width + 'x' + b.style.height + ' → ' + Math.round(r.width) + 'x' + Math.round(r.height); }"


def launch(p):
    try:
        return p.chromium.launch(args=ARGS)
    except Exception:
        exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome') or [None])[0]
        return p.chromium.launch(executable_path=exe, args=ARGS)


def pv(pg):
    return pg.query_selector('#pv').content_frame()


def tabs_open(pg, tag):
    if tag == 'phone' and not pg.evaluate("() => document.getElementById('tabs').classList.contains('open')"):
        pg.click('#tab-toggle'); pg.wait_for_timeout(150)


def tab(pg, tag, name):
    tabs_open(pg, tag)
    pg.click(f'.tab[data-panel="{name}"]'); pg.wait_for_timeout(350)


def div_click(pg, needle, cls):
    """쪽 사이 구분선(needle 글줄로 시작하는 쪽 바로 앞)의 단추를 누른다"""
    pg.evaluate("""([needle, cls]) => {
      const v = document.getElementById('src').value; const at = v.indexOf(needle);
      const ta = document.getElementById('src'); const m = document.getElementById('write-mirror');
      const divs = [...document.querySelectorAll('#write-ed .cp-div')];
      // 글줄 자리(y)를 재어 그 바로 위 구분선을 고른다
      const walker = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let left = at, node;
      while ((node = walker.nextNode())) { if (left < node.length) break; left -= node.length; }
      const r = document.createRange(); r.setStart(node, left); r.setEnd(node, left + 1);
      const y = r.getBoundingClientRect().top;
      const d = divs.filter(x => x.getBoundingClientRect().top < y).pop();
      d.querySelector(cls).click();
    }""", [needle, cls])


def seam_point(pg, needle):
    """needle 글줄 바로 위 줄 사이의 화면 좌표(굴려서 보이게 한 뒤)"""
    return pg.evaluate("""(needle) => {
      const ta = document.getElementById('src'); const m = document.getElementById('write-mirror');
      const at = ta.value.indexOf(needle);
      const walker = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let left = at, node;
      while ((node = walker.nextNode())) { if (left < node.length) break; left -= node.length; }
      let r = document.createRange(); r.setStart(node, left); r.setEnd(node, left + 1);
      let b = r.getBoundingClientRect(); const mb = m.getBoundingClientRect();
      ta.scrollTop += b.top - mb.top - 200; ta.dispatchEvent(new Event('scroll'));
      b = r.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(m).lineHeight);
      return [b.left + 120, b.top - (lh - b.height) / 2];
    }""", needle)


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
            print(tag, 'root opens studio', pg.evaluate("() => document.body.dataset.step"), '| empty', repr(pg.evaluate(src)))
            pg.click('#sample'); pg.wait_for_timeout(1200)
            n0 = pg.evaluate(pages)
            print(tag, 'write', pg.text_content('#count'), '| pages', n0, 'dividers', pg.evaluate("() => document.querySelectorAll('#write-ed .cp-div').length"),
                  '| night text', pg.evaluate("() => document.querySelectorAll('#write-mirror .m-night').length"), '| guessed moods', pg.evaluate("() => [...document.querySelectorAll('#moods [aria-pressed=true]')].map(b => b.textContent)"))
            pg.screenshot(path=str(OUT / f'st-{tag}-1write.png'))

            # 줄 사이: 올리면 띠, 누르면 쪽 나누기
            if tag == 'desk':
                x, y = seam_point(pg, '편지를 쓰는'); pg.wait_for_timeout(250)
                pg.mouse.move(x, y); pg.wait_for_timeout(150)
                print(tag, '  hover hint', pg.evaluate("() => !document.querySelector('#write-ed .cp-hint').hidden && document.querySelector('#write-ed .cp-hint').textContent"))
                pg.screenshot(path=str(OUT / f'st-{tag}-2hover.png'))
                pg.click('#write-ed .cp-hint'); pg.wait_for_timeout(300)
            else:
                # 폰 폭(마우스): 줄 사이 띠가 같이 뜬다. 손가락 화면의 문단 사이 '나누기'는 실기기에서 본다
                x, y = seam_point(pg, '편지를 쓰는'); pg.wait_for_timeout(250)
                pg.mouse.move(x, y); pg.wait_for_timeout(150)
                if pg.evaluate("() => !document.querySelector('#write-ed .cp-hint').hidden"):
                    pg.click('#write-ed .cp-hint'); pg.wait_for_timeout(300)
            print(tag, '  split', pg.evaluate(pages) == n0 + 1, '그랬다.\n\n\n편지' in pg.evaluate(src))
            div_click(pg, '편지를 쓰는', '.cp-rev'); pg.wait_for_timeout(300)
            print(tag, '  reverse on', pg.evaluate(marks), '| night shades', pg.evaluate("() => document.querySelectorAll('#write-ed .cp-shade.night').length"))
            div_click(pg, '편지를 쓰는', '.cp-rev'); pg.wait_for_timeout(300)
            print(tag, '  reverse off', repr(pg.evaluate(marks)))
            div_click(pg, '편지를 쓰는', '.cp-join'); pg.wait_for_timeout(300)
            print(tag, '  join', pg.evaluate(pages) == n0)
            pg.evaluate("""() => { const t = document.getElementById('src'); const a = t.value.indexOf('그랬다.') + 4; t.focus(); t.setSelectionRange(a, a); }""")
            pg.keyboard.press('Enter'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
            print(tag, '  typing still works', pg.evaluate(pages) == n0 + 1)
            div_click(pg, '편지를 쓰는', '.cp-rev'); pg.wait_for_timeout(300)
            # 끌어 고르면 강조
            pg.evaluate("""() => { const t = document.getElementById('src'); const a = t.value.indexOf('보고 싶다고'); t.focus(); t.setSelectionRange(a, a + 15); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }""")
            pg.wait_for_timeout(250)
            print(tag, '  pop', pg.evaluate("() => { const p = document.querySelector('#write-ed .cp-pop'); return !p.hidden && p.textContent; }"))
            pg.locator('#write-ed .cp-pop button', has_text='강조').first.click(); pg.wait_for_timeout(250)
            print(tag, '  emphasized', '{{보고 싶다고 쓰는 것은 너무}}' in pg.evaluate(src), '| marks', pg.evaluate("() => document.querySelectorAll('#write-mirror .m-em.focus').length"))
            pg.locator('#moods button', has_text='고요한').click(); pg.wait_for_timeout(200)
            print(tag, '  mood', pg.evaluate("() => [...document.querySelectorAll('#moods [aria-pressed=true]')].map(b => b.textContent)"), '|', pg.text_content('#count'))
            pg.screenshot(path=str(OUT / f'st-{tag}-3marked.png'))

            # 미리보기
            pg.click('#go-tune'); pg.wait_for_timeout(2600)
            print(tag, 'preview', pv(pg).evaluate(written), '| frame', pg.evaluate(frame_box), '| header hidden', pg.evaluate("() => getComputedStyle(document.querySelector('.top')).display"))
            pg.screenshot(path=str(OUT / f'st-{tag}-4preview.png'))

            # 배경: 글 자리
            tab(pg, tag, 'ground')
            print(tag, 'ground panel', pg.is_visible('#panel-ground'), pg.text_content('#panel-ground .panel-sub'), pg.evaluate("() => [...document.querySelectorAll('#panel-ground .pn-name')].map(x => x.textContent)"))
            pg.locator('#panel-ground .seg button', has_text='오른쪽').click(); pg.wait_for_timeout(500)
            print(tag, '  place', pg.evaluate(marks), '| frame shrinks above sheet' if tag == 'phone' else '', pg.evaluate(frame_box) if tag == 'phone' else '')
            pg.screenshot(path=str(OUT / f'st-{tag}-5ground.png'))
            # 반전된 쪽으로 넘겨 넘어오는 결 고르기
            fr = pv(pg)
            fr.evaluate("() => window.postMessage({ type: 'geulgyeol:goto', page: 2 }, location.origin)"); pg.wait_for_timeout(1200)
            print(tag, '  on page', pg.text_content('#panel-ground .panel-sub'), pg.evaluate("() => [...document.querySelectorAll('#panel-ground .pn-name')].map(x => x.textContent)"))
            pg.locator('#panel-ground .seg button', has_text='섬광').click(); pg.wait_for_timeout(500)
            print(tag, '  turn', pg.evaluate(marks))
            pg.wait_for_timeout(5000)
            print(tag, '  auto next shows turn', pv(pg).evaluate(written))

            # 글씨
            tab(pg, tag, 'type')
            print(tag, 'type panel', pg.is_visible('#panel-type'), '| one at a time', not pg.is_visible('#panel-ground'))
            pg.locator('#panel-type .seg button', has_text='함렛').click(); pg.wait_for_timeout(300)
            print(tag, '  font', pg.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--f-read').split(',')[0]"))

            # 강조: 3쪽 글에서 효과
            tab(pg, tag, 'mark')
            pg.evaluate("""() => { const t = document.querySelector('#panel-mark textarea'); const i = t.value.indexOf('잘 지내냐고'); t.focus(); t.setSelectionRange(i, i + 12); document.dispatchEvent(new Event('selectionchange')); }""")
            pg.wait_for_timeout(200)
            print(tag, 'mark panel', pg.text_content('#panel-mark .panel-sub'), '| fxbar', pg.evaluate("() => !document.querySelector('#panel-mark .fxbar').hidden"))
            pg.locator('#panel-mark .fx-list [data-fx="떨림"]').click(); pg.wait_for_timeout(300)
            print(tag, '  wrapped', '{{떨림:잘 지내냐고' in pg.evaluate(src))
            pg.locator('#panel-mark .fx-list [data-fx="사라짐"]').click(); pg.wait_for_timeout(300)
            print(tag, '  switched without re-drag', '{{사라짐:잘 지내냐고' in pg.evaluate(src))
            pg.wait_for_timeout(2500)
            print(tag, '  preview from there', pv(pg).evaluate(written))
            pg.screenshot(path=str(OUT / f'st-{tag}-6mark.png'))
            pg.click('#panel-mark .panel-x'); pg.wait_for_timeout(300)

            # 글 상자 끌기(PC 틀에서만 티가 난다)
            if tag == 'desk':
                fr = pv(pg)
                box = fr.evaluate("() => { const r = document.querySelector('.sheet.is-current .column').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 20]; }")
                pg.mouse.move(box[0], box[1]); pg.mouse.down(); pg.mouse.move(box[0] - 120, box[1], steps=6)
                print(tag, 'drag box guides', fr.evaluate("() => [...document.querySelectorAll('.place-guide')].map(g => g.classList.contains('on') ? g.dataset.place : '·').join(' ')"))
                pg.mouse.move(box[0] - 420, box[1], steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
                print(tag, '  dropped', pg.evaluate(marks), '| page stayed', fr.evaluate(written))

            # 확대: Ctrl+휠(PC), 두 손가락 벌리기(폰)
            if tag == 'desk':
                pg.mouse.move(640, 300); pg.keyboard.down('Control'); pg.mouse.wheel(0, -300); pg.keyboard.up('Control'); pg.wait_for_timeout(300)
                print(tag, 'zoom', pg.evaluate("() => !document.getElementById('zoom').hidden && document.getElementById('zoom-k').textContent"), pg.evaluate(frame_box))
                pg.mouse.move(640, 300); pg.mouse.down(); pg.mouse.move(540, 250, steps=4); pg.mouse.up(); pg.wait_for_timeout(200)
                print(tag, '  pan', pg.evaluate("() => document.getElementById('frame-box').style.transform"))
            else:
                cdp = ctx.new_cdp_session(pg)
                pts = lambda d: [{'x': 195 - d, 'y': 420, 'id': 1}, {'x': 195 + d, 'y': 420, 'id': 2}]
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pts(40)})
                for d in range(50, 130, 10):
                    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pts(d)}); pg.wait_for_timeout(16)
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(300)
                print(tag, 'pinch zoom', pg.evaluate("() => !document.getElementById('zoom').hidden && document.getElementById('zoom-k').textContent"), pg.evaluate(frame_box))
            pg.screenshot(path=str(OUT / f'st-{tag}-7zoom.png'))
            pg.click('#zoom-fit'); pg.wait_for_timeout(200)
            print(tag, '  fit back', pg.evaluate("() => document.getElementById('zoom').hidden"), pg.evaluate(frame_box))

            # PC·폰 틀
            tabs_open(pg, tag)
            pg.click('#device [data-device="pc"]' if tag == 'phone' else '#device [data-device="mobile"]'); pg.wait_for_timeout(400)
            print(tag, 'other device frame', pg.evaluate(frame_box))
            pg.screenshot(path=str(OUT / f'st-{tag}-8device.png'))
            pg.click('#device [data-device="mobile"]' if tag == 'phone' else '#device [data-device="pc"]'); pg.wait_for_timeout(300)
            print(tag, '  back to real size', pg.evaluate(frame_box))

            # 숨기기·꺼내기
            tabs_open(pg, tag)
            pg.click('#hide-all'); pg.wait_for_timeout(200)
            print(tag, 'hide all', pg.evaluate("() => [document.getElementById('tabs').hidden, document.querySelectorAll('.panel:not([hidden])').length, document.getElementById('peek').hidden]"))
            pg.click('#peek'); pg.wait_for_timeout(200)
            print(tag, '  peek back', pg.evaluate("() => document.getElementById('tabs').hidden"))

            # 쓰는 중 넘기기 막기, 이 쪽 다시
            fr = pv(pg)
            fr.evaluate("() => document.getElementById('again').click()"); pg.wait_for_timeout(500)
            fr.evaluate("() => document.getElementById('next').click()"); pg.wait_for_timeout(300)
            print(tag, 'skip guard', fr.evaluate(written), fr.evaluate("() => document.querySelector('.cue.busy').classList.contains('is-on')"))
            print(tag, 'h-scroll', pg.evaluate("() => document.documentElement.scrollWidth > innerWidth"))

            # 글로 돌아가기
            tabs_open(pg, tag)
            pg.click('#back'); pg.wait_for_timeout(400)
            print(tag, 'back to write', pg.evaluate("() => document.body.dataset.step"), pg.evaluate(pages), 'pages | preview stopped', pg.evaluate("() => document.getElementById('pv').src"),
                  '| marks kept', pg.evaluate(marks))

            pg.goto(f'http://127.0.0.1:{PORT}/simsang.html'); pg.wait_for_timeout(500)
            pg.click('.axis:nth-child(2) .tile:nth-of-type(1)'); pg.wait_for_timeout(1500)
            print(tag, 'simsang tiles', pg.evaluate("() => document.querySelectorAll('.tile').length"), '| playing', pg.evaluate("() => document.querySelectorAll('.tile.on .ch:not(.pending)').length + '/' + document.querySelectorAll('.tile.on .ch').length"))
            ctx.close()
        b.close()
finally:
    srv.terminate()
real = [e for e in errors if 'swiftshader' not in e and 'ReadPixels' not in e and 'GPU stall' not in e]
print('errors:', real or 'none')
