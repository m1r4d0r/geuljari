"""글결 편집실 스모크.
저장소 루트를 정적 서버로 띄우고 PC·폰 크기에서
글(처음 안내 다섯 장 넘기기, 예시 글, 오른쪽 칸(분위기 제목·살펴보기, 테마의 주색·글꼴·시작, 쓰는 법 세 줄), 페이지 어디서 휠을 굴려도 본문이 굴러가는지,
쪽 면·구분선, 줄 사이 띠로 쪽 나누기, 반전 켜고 넘김 고르고 끄기, 잇기, 치고 나서 반전해도 글자가 그대로인지,
끌어 고르면 강조, 분위기, 주색, 미리보기로 넘기는 글·제목·만든 날·마지막 화면)
→ 미리보기(두 장 번갈아 쓰는 틀, 오른쪽 책갈피, 분위기 판의 주색은 다시 쓰지 않고 바로, 글씨는 다시 쓰지 않고 바로, 움직임은 다시 보기로,
배경의 바탕·넘김만 보기, 마지막 화면의 배경, 마지막 화면에서 고친 제목 받기,
글 상자를 눌러 그 자리에서 고치고 굵게·색·효과, 글 상자 끌어 붙이기, 확대, PC·폰·병렬, 숨기기, 쓰는 중 첫 넘김은 다 쓰기)
→ 글로 돌아가기 → 심상 살펴보기 페이지를 차례로 밟는다.
쓰임: python3 tests/smoke_studio.py [찍은 그림을 둘 폴더]   (Playwright Chromium 필요, 포트는 환경 변수 PORT로 바꿀 수 있음)
"""
import sys, os, json, subprocess, time, pathlib, glob
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tests' / 'out'
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', 8795))
ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)
errors = []
written = """() => { const d = document.querySelector('.sheet.is-current'); return d ? (+d.dataset.i + 1) + '쪽 ' + d.querySelectorAll('.ch:not(.pending)').length + '/' + d.querySelectorAll('.ch').length : 'none'; }"""
src = "() => document.getElementById('src').value"
marks = "() => document.getElementById('src').value.split('\\n').filter(l => l.startsWith('[[')).join(' ')"
plain = "() => Geulgyeol.stripMarks(document.getElementById('src').value).replace(/\\s+/g, '')"
pages = "() => document.querySelectorAll('#write-ed .cp-shade').length"
active_src = "() => document.querySelector('#screen-main .frame.on').src"
handed = "() => JSON.parse(localStorage.getItem('geulgyeol.preview') || '{}')"


def launch(p):
    try:
        return p.chromium.launch(args=ARGS)
    except Exception:
        exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome') or [None])[0]
        return p.chromium.launch(executable_path=exe, args=ARGS)


def pv(pg, screen='main'):
    return pg.query_selector(f'#screen-{screen} .frame.on').content_frame()


def tabs_open(pg, tag):
    if not pg.evaluate("() => document.getElementById('tabs').classList.contains('open')"):
        pg.click('#tab-toggle'); pg.wait_for_timeout(150)


def tab(pg, tag, name):
    tabs_open(pg, tag)
    pg.click(f'.tab[data-panel="{name}"]'); pg.wait_for_timeout(350)


def div_click(pg, needle, sel):
    """쪽 사이 구분선(needle 글줄로 시작하는 쪽 바로 앞)의 요소를 누르거나 고른다"""
    return pg.evaluate("""([needle, sel]) => {
      const ta = document.getElementById('src'); const m = document.getElementById('write-mirror');
      const at = ta.value.indexOf(needle);
      const walker = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let left = at, node;
      while ((node = walker.nextNode())) { if (left < node.length) break; left -= node.length; }
      const r = document.createRange(); r.setStart(node, left); r.setEnd(node, left + 1);
      const y = r.getBoundingClientRect().top;
      const d = [...document.querySelectorAll('#write-ed .cp-div')].filter(x => x.getBoundingClientRect().top < y).pop();
      const el = d.querySelector(sel);
      if (!el) return false;
      if (el.tagName === 'SELECT') { el.value = '셔터'; el.dispatchEvent(new Event('change')); } else el.click();
      return true;
    }""", [needle, sel])


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
      return [b.left + 220, b.top - (lh - b.height) / 2];
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
            print(tag, 'root opens studio', pg.evaluate("() => document.body.dataset.step"), '| guide', pg.is_visible('#guide'))
            pg.screenshot(path=str(OUT / f'st-{tag}-0guide.png'))
            steps = []
            for i in range(5):
                steps.append(pg.evaluate("() => document.querySelector('.g-scene:not([hidden])').dataset.n + ':' + document.getElementById('g-title').textContent"))
                pg.click('#g-next'); pg.wait_for_timeout(250)
            print(tag, '  guide steps', steps, '| closed', not pg.is_visible('#guide'))
            pg.click('#settings-open'); pg.click('#sample'); pg.wait_for_timeout(1200)
            n0 = pg.evaluate(pages)
            base = pg.evaluate(plain)
            print(tag, 'write', pg.text_content('#count'), '| pages', n0, '| rests', pg.evaluate("() => getComputedStyle(document.querySelector('#write-mirror .m-sp')).backgroundColor"),
                  '| guessed moods', pg.evaluate("() => [...document.querySelectorAll('#moods [aria-pressed=true]')].map(b => b.textContent)"))
            pg.screenshot(path=str(OUT / f'st-{tag}-1write.png'))

            pg.click('#settings-open')
            # 설정 서랍: 분위기·테마 두 제목, 표 대신 조각, 요약 줄 없음, 주색 여섯과 고르기, 글꼴·시작, 쓰는 법 세 줄
            print(tag, '  rail', pg.evaluate("""() => ({
              heads: [...document.querySelectorAll('.rail h2')].map(h => h.textContent),
              look: !!document.getElementById('mood-look') && (window.GeulLook ? document.getElementById('mood-look').getClientRects().length > 0 : 'no look.js'),
              mix: !!document.getElementById('mix'), simsangLink: !!document.querySelector('.rail a[href="simsang.html"]'),
              pieces: document.querySelectorAll('#moods .piece').length,
              swatches: [...document.querySelectorAll('#themes .swatch')].map(b => b.title).join(','),
              fonts: document.querySelectorAll('#fonts .piece').length, scenes: [...document.querySelectorAll('#start-scene .piece')].map(b => b.textContent).join('/'),
              help: [...document.querySelectorAll('.rail-help p')].map(p => p.textContent) })"""))
            print(tag, '  help visible', pg.is_visible('.rail-help'), '| h-scroll', pg.evaluate("() => document.documentElement.scrollWidth > innerWidth"))
            if tag == 'desk':
                pg.locator('.rail').screenshot(path=str(OUT / f'st-{tag}-1rail.png'))
                pg.click('#settings-close')
                # 페이지 어디서 휠을 굴려도 본문이 굴러간다(오른쪽 칸, 위 막대, 아래 막대), Ctrl+휠은 그대로
                pg.evaluate("() => { const t = document.getElementById('src'); t.scrollTop = 0; }"); pg.wait_for_timeout(100)
                seen = []
                for sel in ['.top .steps', '.bar .k', '.title']:
                    r = pg.evaluate(f"() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.left + 4, r.top + r.height / 2]; }}")
                    pg.mouse.move(r[0], r[1]); pg.mouse.wheel(0, 240); pg.wait_for_timeout(600)
                    seen.append(round(pg.evaluate("() => document.getElementById('src').scrollTop")))
                mirror_follows = pg.evaluate("() => Math.abs(document.getElementById('write-mirror').scrollTop - document.getElementById('src').scrollTop) < 2")
                pg.mouse.move(1000, 300); pg.mouse.wheel(0, -2000); pg.wait_for_timeout(700)
                print(tag, '  wheel anywhere', seen, '| mirror follows', mirror_follows, '| back up', pg.evaluate("() => document.getElementById('src').scrollTop"))
                pg.keyboard.down('Control'); pg.mouse.wheel(0, 200); pg.keyboard.up('Control'); pg.wait_for_timeout(300)
                print(tag, '  ctrl+wheel leaves text', pg.evaluate("() => document.getElementById('src').scrollTop") == 0)
                # 살펴보기 덮개(look.js가 있을 때): 열리고, 열린 동안 휠은 본문을 굴리지 않는다
                if pg.evaluate("() => !!window.GeulLook"):
                    pg.click('#settings-open'); pg.click('#mood-look'); pg.wait_for_timeout(500)
                    opened = pg.evaluate("() => [...document.querySelectorAll('[role=dialog][aria-modal=true]')].some(d => d.id !== 'guide' && !d.hidden && d.getClientRects().length)")
                    pg.mouse.move(640, 400); pg.mouse.wheel(0, 300); pg.wait_for_timeout(400)
                    print(tag, '  look opens', opened, '| wheel stays', pg.evaluate("() => document.getElementById('src').scrollTop") == 0)
                    pg.screenshot(path=str(OUT / f'st-{tag}-1look.png'))
                    pg.evaluate("() => window.GeulLook.close()"); pg.wait_for_timeout(300)
            if not pg.is_visible('#write-settings'):
                pg.click('#settings-open')
            # 테마: 글꼴과 시작 장면
            pg.locator('#fonts .piece', has_text='고운바탕').click(); pg.wait_for_timeout(200)
            print(tag, '  font', pg.evaluate("() => [document.querySelector('#fonts [aria-pressed=true]').textContent, getComputedStyle(document.documentElement).getPropertyValue('--f-read').split(',')[0]]"))
            pg.locator('#start-scene .piece', has_text='다크').click(); pg.wait_for_timeout(300)
            print(tag, '  start dark', pg.evaluate("() => JSON.parse(localStorage.getItem('geul.studio') || '{}').settings"), '| first page night', pg.evaluate("() => document.querySelector('#write-ed .cp-shade').classList.contains('night')"))
            pg.wait_for_timeout(300)
            print(tag, '  saved', pg.evaluate("() => { const s = JSON.parse(localStorage.getItem('geul.studio')).settings; return s.scene + ' ' + s.ground + ' ' + s.font; }"))
            pg.locator('#start-scene .piece', has_text='라이트').click(); pg.wait_for_timeout(200)
            pg.locator('#fonts .piece', has_text='송명').click(); pg.wait_for_timeout(200)

            pg.click('#settings-close')
            # 줄 사이: 올리면 띠, 누르면 쪽 나누기
            x, y = seam_point(pg, '편지를 쓰는'); pg.wait_for_timeout(250)
            pg.mouse.move(x, y); pg.wait_for_timeout(150)
            print(tag, '  hover hint', pg.evaluate("() => !document.querySelector('#write-ed .cp-hint').hidden && document.querySelector('#write-ed .cp-hint').textContent"))
            if tag == 'desk':
                pg.screenshot(path=str(OUT / f'st-{tag}-2hover.png'))
            pg.mouse.click(x, y); pg.wait_for_timeout(300)
            print(tag, '  split by clicking the band', pg.evaluate(pages) == n0 + 1, '그랬다.\n\n\n편지' in pg.evaluate(src))
            div_click(pg, '편지를 쓰는', '.cp-rev'); pg.wait_for_timeout(300)
            print(tag, '  reverse on', pg.evaluate(marks), '| turn picker', div_click(pg, '편지를 쓰는', '.cp-turn'))
            pg.wait_for_timeout(300)
            print(tag, '  turn chosen', pg.evaluate(marks))
            div_click(pg, '편지를 쓰는', '.cp-rev'); pg.wait_for_timeout(300)
            print(tag, '  reverse off', repr(pg.evaluate(marks)))
            div_click(pg, '편지를 쓰는', '.cp-join'); pg.wait_for_timeout(300)
            print(tag, '  join', pg.evaluate(pages) == n0)
            # 치고 바로 반전해도 글자가 그대로
            pg.evaluate("""() => { const t = document.getElementById('src'); const a = t.value.indexOf('그랬다.') + 4; t.focus(); t.setSelectionRange(a, a); }""")
            pg.keyboard.press('Enter'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
            div_click(pg, '편지를 쓰는', '.cp-rev'); pg.wait_for_timeout(300)
            print(tag, '  typed then reversed, text intact', pg.evaluate(plain) == base, '| pages', pg.evaluate(pages) == n0 + 1)
            # 끌어 고르면 강조
            pg.evaluate("""() => { const t = document.getElementById('src'); const a = t.value.indexOf('보고 싶다고'); t.focus(); t.setSelectionRange(a, a + 15); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }""")
            pg.wait_for_timeout(250)
            pg.locator('#write-ed .cp-pop button', has_text='강조').first.click(); pg.wait_for_timeout(250)
            print(tag, '  emphasized', '{{보고 싶다고 쓰는 것은 너무}}' in pg.evaluate(src))
            pg.click('#settings-open')
            pg.locator('#moods button', has_text='고요한').click(); pg.wait_for_timeout(200)
            pg.click('#themes .swatch[title="자두"]'); pg.wait_for_timeout(200)
            print(tag, '  mood', pg.evaluate("() => [...document.querySelectorAll('#moods [aria-pressed=true]')].map(b => b.textContent)"), '| theme ink', pg.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--ink')"))
            pg.screenshot(path=str(OUT / f'st-{tag}-3marked.png'))
            pg.click('#settings-close')
            pg.fill('#title', '편지'); pg.wait_for_timeout(100)
            h = pg.evaluate(handed)
            print(tag, '  handed off', sorted(h.keys()), '| title', h.get('title'), '| made', h.get('made'), '| ending', h.get('ending'))

            # 미리보기
            pg.click('#go-tune'); pg.wait_for_timeout(2600)
            print(tag, 'preview', pv(pg).evaluate(written), '| frames', pg.evaluate("() => [...document.querySelectorAll('#screen-main .frame')].map(f => f.classList.contains('on') ? 'on' : 'off').join(' ')"),
                  '| header', pg.evaluate("() => getComputedStyle(document.querySelector('.top')).display"),
                  '| tabs right' if tag == 'desk' else '', pg.evaluate("() => Math.round(document.getElementById('tabs').getBoundingClientRect().right)") if tag == 'desk' else '')
            print(tag, '  theme in preview', pv(pg).evaluate("() => getComputedStyle(document.querySelector('.sheet.is-current')).getPropertyValue('--ink').trim()"))
            pg.screenshot(path=str(OUT / f'st-{tag}-4preview.png'))

            # 분위기 판: 조각과 주색. 주색은 다시 쓰지 않고 바로
            tab(pg, tag, 'mood')
            before = pg.evaluate(active_src)
            print(tag, 'mood panel', pg.evaluate("() => ({ pieces: document.querySelectorAll('#panel-mood .piece').length, swatches: document.querySelectorAll('#panel-mood .swatch').length, mix: !!document.querySelector('#panel-mood .mix') })"))
            pg.click('#panel-mood .swatch[title="솔"]'); pg.wait_for_timeout(400)
            print(tag, '  theme live', pg.evaluate(active_src) == before, '| ink', pv(pg).evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--theme-ink').trim()"))
            pg.screenshot(path=str(OUT / f'st-{tag}-4mood.png'))
            pg.click('#panel-mood .panel-x'); pg.wait_for_timeout(200)

            # 글씨: 다시 쓰지 않고 바로
            tab(pg, tag, 'type')
            before = pg.evaluate(active_src)
            pg.evaluate("() => { const r = document.querySelector('#panel-type input[type=range]'); r.value = 130; r.dispatchEvent(new Event('input')); }")
            pg.locator('#panel-type .seg button', has_text='양쪽').click(); pg.wait_for_timeout(400)
            print(tag, 'type live', pg.evaluate(active_src) == before, '| size', pv(pg).evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--fs-k')"),
                  '| align', pv(pg).evaluate("() => getComputedStyle(document.querySelector('.sheet.is-current .column')).textAlign"))
            pg.screenshot(path=str(OUT / f'st-{tag}-5type.png'))

            # 움직임: 다시 보기를 기다림
            tab(pg, tag, 'motion')
            before = pg.evaluate(active_src)
            pg.evaluate("() => { const r = document.querySelector('#panel-motion input[type=range]'); r.value = 70; r.dispatchEvent(new Event('input')); }"); pg.wait_for_timeout(300)
            print(tag, 'motion waits', pg.evaluate(active_src) == before, '| replay due', pg.evaluate("() => document.getElementById('replay').classList.contains('due')"))
            tabs_open(pg, tag)
            pg.click('#replay'); pg.wait_for_timeout(1500)
            print(tag, '  replayed', pg.evaluate(active_src) != before, '| due cleared', not pg.evaluate("() => document.getElementById('replay').classList.contains('due')"))

            # 배경: 다른 쪽 바탕은 다 쓴 모습으로, 넘김은 넘김만
            fr = pv(pg)
            fr.evaluate("() => window.postMessage({ type: 'geulgyeol:goto', page: 1 }, location.origin)"); pg.wait_for_timeout(1300)
            tab(pg, tag, 'ground')
            print(tag, 'ground', pg.text_content('#panel-ground .panel-sub'), pg.evaluate("() => [...document.querySelectorAll('#panel-ground .pn-name')].map(x => x.textContent)"))
            pg.locator('#panel-ground .seg button', has_text='잎그늘').click(); pg.wait_for_timeout(1400)
            print(tag, '  light ground', pg.evaluate(marks), '| shown done', pv(pg).evaluate(written))
            pv(pg).evaluate("() => window.postMessage({ type: 'geulgyeol:goto', page: 2 }, location.origin)"); pg.wait_for_timeout(1300)
            pg.locator('#panel-ground .seg button', has_text='섬광').click(); pg.wait_for_timeout(2400)
            print(tag, '  turn only', pg.evaluate(marks), '| landed', pv(pg).evaluate(written))
            pg.screenshot(path=str(OUT / f'st-{tag}-6ground.png'))

            # 마지막 화면: 편집실이 마지막 화면에 있다고 알면 배경 판이 그 화면의 장면·바탕을 고른다
            n = pg.evaluate("() => Geulgyeol.pages(Geulgyeol.parse(document.getElementById('src').value)).length")
            pv(pg).evaluate(f"() => window.postMessage({{ type: 'geulgyeol:goto', page: {n} }}, location.origin)"); pg.wait_for_timeout(1500)
            viewer_end = pv(pg).evaluate("() => !!document.querySelector('.sheet.ending.is-current')")

            def at_end():
                """마지막 화면이 없는 읽기 틀이면 마지막 화면에 있다는 알림을 대신 보낸다"""
                if not viewer_end:
                    pv(pg).evaluate(f"() => window.parent.postMessage({{ type: 'geulgyeol:page', page: {n}, pages: {n}, ending: true }}, location.origin)"); pg.wait_for_timeout(300)
            at_end()
            print(tag, 'ending', 'viewer has ending sheet' if viewer_end else 'simulated page message', '|', pg.text_content('#panel-ground .panel-sub'), pg.evaluate("() => [...document.querySelectorAll('#panel-ground .pn-name')].map(x => x.textContent)"))
            pg.locator('#panel-ground .seg button', has_text='다크').click(); pg.wait_for_timeout(1600)
            reloaded = 'ending' in pg.evaluate(active_src)
            at_end()
            pg.locator('#panel-ground .seg button', has_text='빛커튼').click(); pg.wait_for_timeout(1600)
            at_end()
            print(tag, '  ending ground', pg.evaluate(handed).get('ending'), '| reloaded at ending', reloaded, 'ending' in pg.evaluate(active_src), '| sub', pg.text_content('#panel-ground .panel-sub'), '| marks', pg.evaluate(marks))
            pg.screenshot(path=str(OUT / f'st-{tag}-6ending.png'))
            # 마지막 카드 문구는 편집 제목과 별도로 받는다
            pv(pg).evaluate("() => window.parent.postMessage({ type: 'geulgyeol:ending', ending: {text:'보내지 못한 편지'} }, location.origin)"); pg.wait_for_timeout(300)
            print(tag, '  title from ending', pg.evaluate("() => document.getElementById('title').value"), '|', pg.evaluate(handed).get('title'))
            pg.click('#panel-ground .panel-x'); pg.wait_for_timeout(300)
            pv(pg).evaluate("() => window.postMessage({ type: 'geulgyeol:goto', page: 2 }, location.origin)"); pg.wait_for_timeout(1300)

            # 글 상자를 눌러 그 자리에서 고치기
            fr = pv(pg)
            fr.evaluate("() => document.querySelector('.sheet.is-current .column').click()"); pg.wait_for_timeout(500)
            print(tag, 'inplace open', fr.evaluate("() => !!document.querySelector('.ip') && document.querySelector('.ip textarea').value.slice(0, 12)"))
            fr.evaluate("""() => { const t = document.querySelector('.ip textarea'); const i = t.value.indexOf('잘 지내냐고'); t.focus(); t.setSelectionRange(i, i + 6); document.dispatchEvent(new Event('selectionchange')); }""")
            pg.wait_for_timeout(200)
            print(tag, '  bar', fr.evaluate("() => !document.querySelector('.ip-bar').hidden"))
            fr.click('.ip-bar .ip-style[data-style="굵게"]'); pg.wait_for_timeout(200)
            fr.click('.ip-bar .ip-color[data-color="빨강"]'); pg.wait_for_timeout(200)
            print(tag, '  styled', '{{굵게+빨강:잘 지내냐고' in pg.evaluate(src))
            pg.screenshot(path=str(OUT / f'st-{tag}-7inplace.png'))
            fr.click('.ip-bar .ip-open:has-text("효과")'); pg.wait_for_timeout(150)
            fr.click('.ip-list [data-fx="떨림"]'); pg.wait_for_timeout(2500)
            print(tag, '  effect + replay', '{{떨림+굵게+빨강:잘 지내냐고' in pg.evaluate(src), '|', pv(pg).evaluate(written))
            fr = pv(pg)
            fr.evaluate("() => document.querySelector('.sheet.is-current .column').click()"); pg.wait_for_timeout(500)
            fr.evaluate("""() => { const t = document.querySelector('.ip textarea'); t.focus(); t.setSelectionRange(0, 0); document.execCommand('insertText', false, '정말 '); }""")
            pg.wait_for_timeout(200)
            fr.click('.ip-done'); pg.wait_for_timeout(1400)
            print(tag, '  typed in place', '정말 편지를' in pg.evaluate(src), '| shown done', pv(pg).evaluate(written))

            # 글 상자 끌기(PC), 확대
            if tag == 'desk':
                fr = pv(pg)
                box = fr.evaluate("() => { const r = document.querySelector('.sheet.is-current .column').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 20]; }")
                pg.mouse.move(box[0], box[1]); pg.mouse.down(); pg.mouse.move(box[0] - 140, box[1], steps=6)
                print(tag, 'drag box guides', fr.evaluate("() => [...document.querySelectorAll('.place-guide')].map(g => g.classList.contains('on') ? g.dataset.place : '·').join(' ')"))
                pg.mouse.move(box[0] - 420, box[1], steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
                print(tag, '  dropped', pg.evaluate(marks), '| no edit opened', not fr.evaluate("() => !!document.querySelector('.ip')"))
                pg.mouse.move(640, 300); pg.keyboard.down('Control'); pg.mouse.wheel(0, -200); pg.keyboard.up('Control'); pg.wait_for_timeout(300)
                print(tag, 'zoom', pg.evaluate("() => !document.getElementById('zoom').hidden && document.getElementById('zoom-k').textContent"))
            else:
                cdp = ctx.new_cdp_session(pg)
                pts = lambda d: [{'x': 195 - d, 'y': 600, 'id': 1}, {'x': 195 + d, 'y': 600, 'id': 2}]
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pts(40)})
                for d in range(50, 130, 10):
                    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pts(d)}); pg.wait_for_timeout(16)
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(300)
                print(tag, 'pinch zoom', pg.evaluate("() => !document.getElementById('zoom').hidden && document.getElementById('zoom-k').textContent"))
            pg.click('#zoom-fit'); pg.wait_for_timeout(200)

            # PC·폰·병렬
            tabs_open(pg, tag)
            if tag == 'desk':
                pg.click('#device [data-device="both"]'); pg.wait_for_timeout(2600)
                print(tag, 'side by side', pg.evaluate("() => [...document.querySelectorAll('.screen')].map(s => s.hidden ? 'hidden' : Math.round(s.getBoundingClientRect().width) + 'x' + Math.round(s.getBoundingClientRect().height)).join(' + ')"),
                      '| phone frame', pv(pg, 'side').evaluate(written))
                pg.screenshot(path=str(OUT / f'st-{tag}-8both.png'))
                pg.click('#device [data-device="pc"]'); pg.wait_for_timeout(400)
            else:
                print(tag, 'no side by side on phone', not pg.is_visible('#device [data-device="both"]'))
                pg.click('#device [data-device="pc"]'); pg.wait_for_timeout(400)
                print(tag, 'pc frame', pg.evaluate("() => { const r = document.getElementById('screen-main').getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }"))
                pg.screenshot(path=str(OUT / f'st-{tag}-8device.png'))
                tabs_open(pg, tag)
                pg.click('#device [data-device="mobile"]'); pg.wait_for_timeout(300)

            # 숨기기·꺼내기, 쓰는 중 첫 넘김은 다 쓰기
            tabs_open(pg, tag)
            pg.click('#hide-all'); pg.wait_for_timeout(200)
            print(tag, 'hide all', pg.evaluate("() => [document.getElementById('tabs').hidden, document.getElementById('peek').hidden]"))
            pg.click('#peek'); pg.wait_for_timeout(200)
            fr = pv(pg)
            fr.evaluate("() => window.postMessage({ type: 'geulgyeol:again' }, location.origin)"); pg.wait_for_timeout(500)
            before = fr.evaluate(written)
            fr.evaluate("() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))"); pg.wait_for_timeout(300)
            print(tag, 'skip guard: first press finishes', before, '->', fr.evaluate(written))
            print(tag, 'h-scroll', pg.evaluate("() => document.documentElement.scrollWidth > innerWidth"))

            tabs_open(pg, tag)
            pg.click('#back'); pg.wait_for_timeout(400)
            print(tag, 'back to write', pg.evaluate("() => document.body.dataset.step"), '| preview stopped', pg.evaluate("() => [...document.querySelectorAll('.frame')].every(f => !f.src || f.src === 'about:blank')"),
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
