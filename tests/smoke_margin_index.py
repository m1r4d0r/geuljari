"""여백 색인: 펼침·빠른 전환·실제 설정 반영·단계 이동·좁은 화면 스크롤을 확인한다.
python3 tests/smoke_margin_index.py [스크린샷 폴더]
CHROMIUM 환경 변수로 설치된 브라우저 경로를 지정할 수 있다.
"""
import os
import pathlib
import subprocess
import sys
import time
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tests' / 'out'
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', 8798))
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
errors = []
try:
    time.sleep(.5)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for width, height in [(1280, 800), (390, 844), (320, 568), (844, 390)]:
            ctx = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width < 761)
            ctx.route('**/fonts.g*/**', lambda r: r.abort())
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(f'http://127.0.0.1:{PORT}/')
            pg.click('#g-skip')
            pg.click('#settings-open')
            pg.click('#sample')
            pg.click('[data-go=tune]')
            pg.wait_for_selector('#screen-main .frame.on')
            expect(pg.locator('.top')).to_be_visible()
            expect(pg.locator('.preview-bar')).to_be_visible()
            expect(pg.locator('[data-go=tune]')).to_have_attribute('aria-current', 'step')
            pg.click('#tab-toggle')
            before = pg.locator('#tab-motion').bounding_box()['y']
            frame_src = pg.locator('#screen-main .frame.on').get_attribute('src')
            pg.click('#tab-type')
            pg.wait_for_timeout(450)
            after = pg.locator('#tab-motion').bounding_box()['y']
            assert after > before + 100, (width, '다음 메뉴가 밀리지 않음', before, after)
            assert pg.locator('#panel-type').bounding_box()['y'] >= pg.locator('#tab-type').bounding_box()['y'] + 45
            expect(pg.locator('#tab-type')).to_have_attribute('aria-expanded', 'true')
            pg.locator('#panel-type input').first.evaluate("e => { e.value = 130; e.dispatchEvent(new Event('input')); }")
            pg.wait_for_function("JSON.parse(localStorage.getItem('geul.studio')).settings.size === 1.3")
            assert pg.locator('#screen-main .frame.on').get_attribute('src') == frame_src
            pg.screenshot(path=str(OUT / f'margin-{width}.png'))
            # 닫힘 예약 중 다시 열어도 활성 판이 뒤늦게 사라지지 않아야 한다.
            pg.evaluate("() => { document.getElementById('tab-type').click(); document.getElementById('tab-mood').click(); document.getElementById('tab-type').click(); }")
            pg.wait_for_timeout(500)
            expect(pg.locator('#panel-type')).to_be_visible()
            assert pg.locator('.index-item.is-open').count() == 1
            assert pg.locator('.panel:not([inert])').count() == 1
            pg.click('#panel-type .panel-x')
            expect(pg.locator('#tab-type')).to_be_focused()
            pg.wait_for_timeout(450)
            expect(pg.locator('#panel-type')).to_be_hidden()
            # 화면보다 긴 색인은 끝의 메뉴까지 굴릴 수 있다.
            pg.click('#tab-mood')
            pg.wait_for_timeout(450)
            pg.locator('#tab-ground').scroll_into_view_if_needed()
            pg.click('#tab-ground')
            pg.wait_for_timeout(450)
            expect(pg.locator('#tab-ground')).to_have_attribute('aria-expanded', 'true')
            pg.locator('#panel-ground .panel-x').scroll_into_view_if_needed()
            pg.click('#panel-ground .panel-x')
            pg.click('#hide-all')
            expect(pg.locator('.top')).to_be_hidden()
            expect(pg.locator('.preview-bar')).to_be_hidden()
            pg.click('#peek')
            expect(pg.locator('.top')).to_be_visible()
            expect(pg.locator('.preview-bar')).to_be_visible()
            pg.click('#back')
            expect(pg.locator('#s-write')).to_be_visible()
            pg.click('[data-go=tune]')
            expect(pg.locator('#s-tune')).to_be_visible()
            assert not pg.evaluate('document.documentElement.scrollWidth > innerWidth')
            # 동작 줄이기에서는 접힘이 즉시 완료된다.
            pg.emulate_media(reduced_motion='reduce')
            pg.click('#tab-toggle')
            pg.click('#tab-motion')
            pg.click('#tab-motion')
            expect(pg.locator('#panel-motion')).to_be_hidden()
            print(f'{width}×{height}: 통과', flush=True)
            ctx.close()
        browser.close()
    assert not errors, errors
finally:
    server.terminate()
    server.wait()
