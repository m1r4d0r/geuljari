"""완성 HTML의 오프라인 동작과 주요 사용자 경로를 점검한다."""
from pathlib import Path
import argparse
import functools
import http.server
import os
import threading
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', help='검증할 사이트의 루트 URL')
args = parser.parse_args()
html = (root / 'downloads' / 'geulgyeol-first-draft.html').read_text(encoding='utf-8')

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = None
if args.url:
    base_url = args.url.rstrip('/') + '/'
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(root.parent)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base_url = f'http://127.0.0.1:{server.server_port}/{root.name}/'

chromium_path = os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=chromium_path)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, permissions=[])
    page = context.new_page()
    errors, external = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: external.append(r.url) if r.url.startswith(('http:', 'https:')) and not r.url.startswith(base_url) else None)
    page.goto(base_url, wait_until='networkidle')
    assert page.locator('script[src]').count() == 3
    page.evaluate('document.fonts.ready')
    expect(page.locator('#generate')).to_be_disabled()
    page.click('#sample')
    page.click('[data-mood="warm"]')
    page.click('[data-mood="quiet"]')
    page.click('[data-mood="tense"]')
    assert page.locator('[data-mood][aria-pressed="true"]').count() == 2
    page.click('#choose-focus')
    page.locator('.sentence-option').filter(has_text='나는 늘 급하다.').click()
    page.click('#choose-turn')
    page.locator('.sentence-option').filter(has_text='그리고 잉크 한 방울이').click()
    page.click('#generate')
    expect(page.locator('#result')).to_be_visible()
    expect(page.locator('#refine')).to_be_hidden()
    expect(page.locator('#draft-title')).to_have_text('따뜻한 · 고요한 결로 읽어요.')
    assert page.locator('#reading-text .focus').count() > 0
    print('PASS intake, optional intentions, at most two moods, first draft')

    page.wait_for_timeout(700)
    page.click('#play')
    expect(page.locator('#play')).to_have_text('계속 읽기')
    shown = page.locator('#reading-text .word:not(.pending)').count()
    page.wait_for_timeout(700)
    assert page.locator('#reading-text .word:not(.pending)').count() == shown
    page.click('#play')
    page.click('#mobile-mode')
    page.wait_for_timeout(400)
    assert page.locator('#device').bounding_box()['width'] == 390
    expect(page.locator('#draft-title')).to_have_text('따뜻한 · 고요한 결로 읽어요.')
    found = False
    for index in range(page.locator('#page-nav button').count()):
        page.click(f'#page-nav [data-page="{index}"]')
        if page.locator('#reading-text').inner_text().startswith('그리고 잉크'):
            expect(page.locator('#reading-stage')).to_have_attribute('data-scene', 'night')
            found = True
            break
    assert found
    print('PASS pause/resume, mobile mode preserves state, chosen reversal starts night page')

    page.click('#refine-toggle')
    expect(page.locator('#refine')).to_be_visible()
    page.locator('#speed').fill('1.4')
    expect(page.locator('#speed-output')).to_have_text('1.4×')
    page.locator('#rest').fill('1.7')
    expect(page.locator('#rest-output')).to_have_text('1.7×')
    page.click('#scene-options [data-scene="day"]')
    expect(page.locator('#reading-stage')).to_have_attribute('data-scene', 'day')
    page.click('#effect-options [data-effect="rise"]')
    expect(page.locator('#reading-stage')).to_have_attribute('data-effect', 'rise')
    page.click('#desktop-mode')
    page.wait_for_timeout(400)
    page.click('#back-input')
    expect(page.locator('#choose-focus')).to_have_class('intent-link chosen')
    page.locator('#source').fill('그날도 그랬다.\n\n\n종이는 그렇지 않다.')
    expect(page.locator('#input-message')).to_contain_text('다시 골라')
    expect(page.locator('#choose-focus')).to_contain_text('꼭 남기고 싶은')
    page.click('#sample')
    expect(page.locator('#source')).to_have_value('그날도 그랬다.\n\n\n종이는 그렇지 않다.')
    page.click('#generate')
    assert page.locator('#page-nav button').count() == 2
    assert page.locator('#reading-text .focus').count() == 0
    print('PASS refinement, desktop mode, edited source invalidates old anchors, sample preserves existing input')

    page.emulate_media(reduced_motion='reduce')
    expect(page.locator('#play')).to_be_disabled()
    assert page.locator('#reading-text .pending').count() == 0
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth') == 390
    page.click('#refine-toggle')
    page.click('#refine-focus')
    expect(page.locator('#picker-layer')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.locator('#picker-layer')).to_be_hidden()
    print('PASS reduced motion, physical 390px viewport, no horizontal overflow, keyboard dismissal')

    page.click('#back-input')
    page.locator('#source').fill('밤이 깊어지면 <img src="https://invalid.example/test" onerror="window.injected=1"> 책상 위의 소리가 지워진다.')
    page.click('#generate')
    assert page.locator('#reading-text img').count() == 0
    assert page.evaluate('window.injected === undefined')
    assert not external, external
    assert not errors, errors
    print('PASS input remains text, no requests outside the site, zero JavaScript errors')

    page.goto(base_url + 'layout-studies/', wait_until='networkidle')
    for layout in ('book', 'stage', 'score'):
        page.click(f'.directions [data-layout="{layout}"]')
        expect(page.locator('body')).to_have_attribute('data-layout', layout)
    assert page.locator('#manuscript').input_value()
    assert not errors, errors
    print('PASS all three earlier layout studies load and switch')

    offline = browser.new_context(viewport={'width': 1440, 'height': 1000})
    offline.set_offline(True)
    offline_page = offline.new_page()
    offline_requests = []
    offline_page.on('request', lambda r: offline_requests.append(r.url) if r.url.startswith(('http:', 'https:')) else None)
    offline_page.on('pageerror', lambda e: errors.append(str(e)))
    offline_page.set_content(html)
    offline_page.click('#sample')
    offline_page.click('#generate')
    expect(offline_page.locator('#result')).to_be_visible()
    assert not offline_requests, offline_requests
    assert not errors, errors
    print('PASS downloadable standalone HTML works offline without external requests')
    browser.close()
if server:
    server.shutdown()
    server.server_close()
