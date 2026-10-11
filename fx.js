/*
 * 글결 효과 모음
 * - 글자는 처음에 .pending(보이지 않음)으로 두고, 시간표의 시각이 되면 .pending을 떼면서 효과를 건다.
 *   시각은 자바스크립트가 직접 재기 때문에, 효과가 실행되지 않는 환경이어도 글자는 제 시각에 하나씩 나타난다.
 * - 효과는 Web Animations(element.animate)로 실행하고, 색 변수는 키프레임에 넣지 않는다.
 *   글자색을 키프레임에 담는 번짐은 recolor()가 지금 색으로 다시 끼운다(편집실에서 주색을 바꿀 때).
 *   젖은 잉크 색은 .wet → .drying 클래스로 바꿔 CSS 전환으로 말린다.
 * - 초점 띠: 화면 가운데 줄만 또렷하게. 손끝: 다 쓴 어절에 손대면 다시 젖음.
 * - 퇴장 효과(vanish·scatter·erase·dim·fold·sink)는 끝 모습 클래스(EXIT_END)를 붙여 두고 그 위에서 물러나는 움직임만 건다.
 *   움직임이 끝나면 끝 모습이 남는다(사라짐·흩날림·지워짐·가라앉음은 .gone, 희미해짐은 .dimmed, 걷힘은 .folded).
 * - 꾸밈(굵게·기울임·밑줄·취소선·색)은 글자에 s-b·s-i·s-u·s-s·c-색 클래스로 붙인다. 모양은 glyph.css.
 * - setPace(k): 모든 효과 시간을 1/k로 줄이고 늘인다(조판의 속도).
 * - 문단 하나를 글자 단위로 그리는 일(buildParagraph)도 여기서 해서 읽기 틀과 효과 견본이 똑같이 움직인다.
 * 읽기 틀(reader.js)과 효과 견본(effects.js)이 함께 쓴다.
 */
(function (global) {
  'use strict';

  const canAnimate = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const caret = typeof document !== 'undefined' ? document.createElement('span') : null;
  if (caret) caret.className = 'caret';

  let pace = 1;
  function setPace(k) { pace = k > 0 ? k : 1; }

  function animate(el, frames, opts) {
    if (!canAnimate) return null;
    const o = Object.assign({ fill: 'none' }, opts);
    /* 글 전체 속도에 글자마다의 배율(쪽 속도·강조 블록 속도, data-pace)을 곱한다 */
    const k = pace * ((el && el.dataset && Number(el.dataset.pace)) || 1);
    if (o.duration) o.duration /= k;
    if (o.delay) o.delay /= k;
    try { return el.animate(frames, o); } catch (e) { return null; }
  }

  /* soak: 이미 쓴 글자를 다시 적실 때. 색이 한 번에 바뀌지 않고 천천히 배어든다 */
  function wet(el, hold, soak) {
    el.classList.remove('drying');
    el.classList.toggle('soak', !!soak);
    el.classList.add('wet');
    clearTimeout(el._dry);
    el._dry = setTimeout(() => {
      el.classList.add('drying');
      el.classList.remove('wet', 'soak');
      el._dry = setTimeout(() => el.classList.remove('drying'), 2000);
    }, (hold || 1400) / (pace * ((el.dataset && Number(el.dataset.pace)) || 1)));
  }

  /* 번짐: 글자색을 키프레임에 담아 그림자로 번지다가 또렷해진다 */
  const bleedFrames = (c) => [
    { opacity: 0, color: 'transparent', textShadow: `0 0 .6em ${c}` },
    { opacity: 1, color: 'transparent', textShadow: `0 0 .28em ${c}`, offset: 0.4 },
    { opacity: 1, color: c, textShadow: `0 0 0 ${c}` }
  ];
  const bleeding = new Set();

  /* 글자색(주색)이 바뀌면 번지는 중인 글자의 키프레임을 새 색으로 바꿔 끼운다(움직임의 시각은 그대로) */
  function recolor() {
    bleeding.forEach((a) => {
      const el = a.effect && a.effect.target;
      if (!el) return;
      a.effect.setKeyframes([]);
      a.effect.setKeyframes(bleedFrames(getComputedStyle(el).color));
    });
  }

  /* 글자 하나(또는 줄 하나)에 거는 효과. 돌려주는 값은 Animation(없으면 null). */
  const FX = {
    none() { return null; },

    fade(el) {
      return animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
    },

    /* 쉼 앞뒤 글자: 조금 더 천천히 떠오른다 */
    soft(el) {
      return animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 1000, easing: 'ease-out' });
    },

    /* 떠오름: 흐림(filter) 없이 위치·투명도만 움직여 글자가 많아도 끊기지 않게. 거의 다 올라온 뒤 천천히 자리에 앉는다 */
    rise(el) {
      wet(el, 1000);
      return animate(el, [
        { opacity: 0, transform: 'translate3d(0, .42em, 0)' },
        { opacity: .85, transform: 'translate3d(0, .06em, 0)', offset: .55 },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' }
      ], { duration: 1100, easing: 'cubic-bezier(.33, 0, .2, 1)' });
    },

    bleed(el) {
      const a = animate(el, bleedFrames(getComputedStyle(el).color), { duration: 1600, easing: 'ease-out' });
      if (a) {
        bleeding.add(a);
        const done = () => bleeding.delete(a);
        a.finished.then(done, done);
      }
      return a;
    },

    focus(el) {
      return animate(el, [
        { opacity: 0, filter: 'blur(10px)', transform: 'scale(1.05)' },
        { opacity: 0.75, filter: 'blur(3px)', offset: 0.5 },
        { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' }
      ], { duration: 2400, easing: 'cubic-bezier(.3, .1, .2, 1)' });
    },

    gather(el) {
      const x = rnd(-2.6, 2.6);
      const y = rnd(-1.8, 1.8);
      const r = rnd(-45, 45);
      return animate(el, [
        { opacity: 0, transform: `translate(${x}em, ${y}em) rotate(${r}deg)` },
        { opacity: 1, transform: 'translate(0, 0) rotate(0deg)' }
      ], { duration: 1500, easing: 'cubic-bezier(.16, .84, .3, 1)' });
    },

    tremble(el) {
      FX.fade(el);
      return animate(el, [
        { transform: 'translate(0, 0)' },
        { transform: 'translate(.035em, -.02em)' },
        { transform: 'translate(-.03em, .025em)' },
        { transform: 'translate(.02em, .03em)' },
        { transform: 'translate(0, 0)' }
      ], { duration: 240, iterations: 16, easing: 'linear' });
    },

    /* 흘러내림: 위에서 천천히 내려와 튀지 않고 자리에 앉는다 */
    fall(el) {
      return animate(el, [
        { opacity: 0, transform: 'translateY(-.7em)', filter: 'blur(1.5px)' },
        { opacity: 1, transform: 'translateY(-.12em)', filter: 'blur(0px)', offset: 0.55 },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 1300, easing: 'cubic-bezier(.25, .1, .25, 1)' });
    },

    /* 타자: 글자는 그냥 나타나고 커서가 뒤를 따라간다. 마지막 글자 뒤 잠시 깜박이다 사라진다. */
    type(el) {
      el.after(caret);
      clearTimeout(caret._off);
      caret._off = setTimeout(() => caret.remove(), 1600);
      return null;
    },

    /* 사라짐: 옅어지며 흐려지고 살짝 떠서 사라진다 */
    vanish(el) {
      el.classList.add('gone');
      return animate(el, [
        { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)' },
        { opacity: 0, filter: 'blur(3px)', transform: 'translateY(-.18em)' }
      ], { duration: 1100, easing: 'cubic-bezier(.4, 0, .6, 1)' });
    },

    /* 흩날림: 글자마다 바람에 날리듯 옆으로 흩어지며 사라진다 */
    scatter(el) {
      el.classList.add('gone');
      const x = rnd(1.4, 3.6);
      const y = rnd(-1.4, 0.5);
      const r = rnd(-60, 60);
      if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
      return animate(el, [
        { opacity: 1, transform: 'translate(0, 0) rotate(0deg)' },
        { opacity: 0, transform: `translate(${x}em, ${y}em) rotate(${r}deg)` }
      ], { duration: 1300, easing: 'cubic-bezier(.3, .1, .6, 1)' });
    },

    /* 지워짐: 줄이 그어진 뒤 옅어지며 사라진다 */
    erase(el) {
      el.classList.add('gone', 'erasing');
      return animate(el, [
        { opacity: 1, textDecorationColor: 'currentColor' },
        { opacity: 1, offset: 0.4 },
        { opacity: 0 }
      ], { duration: 1500, easing: 'ease-in' });
    },

    /* 희미해짐: 옅어진 채로 남는다(뒤에 오는 글이 앞으로 나선다) */
    dim(el) {
      el.classList.add('dimmed');
      return animate(el, [
        { opacity: 1, filter: 'blur(0px)' },
        { opacity: 0.22, filter: 'blur(.6px)' }
      ], { duration: 1200, easing: 'ease-in-out' });
    },

    /* 걷힘: 사라지면서 자리도 좁혀, 뒤의 글이 다가와 메운다 */
    fold(el) {
      const w = el.getBoundingClientRect().width;
      if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
      el.classList.add('folding');
      const a = animate(el, [
        { opacity: 1, width: w + 'px' },
        { opacity: 0, width: w + 'px', offset: 0.45 },
        { opacity: 0, width: '0px' }
      ], { duration: 1100, easing: 'cubic-bezier(.4, 0, .2, 1)' });
      const done = () => { el.classList.add('folded'); el.classList.remove('folding'); };
      if (a) a.finished.then(done, () => {}); else done();
      return a;
    },

    /* 가라앉음: 천천히 아래로 가라앉으며 흐려진다 */
    sink(el) {
      el.classList.add('gone');
      if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
      return animate(el, [
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' },
        { opacity: 0, transform: 'translateY(.6em)', filter: 'blur(2px)' }
      ], { duration: 1400, easing: 'cubic-bezier(.45, 0, .55, 1)' });
    },

    /* 조명: 문단의 다른 글자를 어둡게 하고(.lit 글자만 밝게) 얼마 뒤 되돌린다 */
    spot(el) {
      el.classList.add('spot-ready', 'spotlight');
      return null;
    },
    unspot(el) {
      el.classList.remove('spotlight');
      setTimeout(() => el.classList.remove('spot-ready'), 1000);
      return null;
    }
  };

  /*
   * 시간표 재생기. items: [{ el, t(ms), fx, keep?, k?, n? }]
   * keep이 있는 항목(퇴장·조명)은 글자를 숨기지 않고 그 시각에 효과만 건다.
   * opts.gate(item)가 false를 돌려주면 그 글자 앞에서 시간을 멈추고, true가 될 때까지 기다렸다가 이어 간다.
   * opts.from(ms)을 주면 그 시각 앞의 글자는 다 쓴 모습으로 바로 놓고 그 시각부터 재생한다.
   * 화면 갱신마다 흐른 시간을 더하되 한 번에 64ms까지만 더해서, 탭이 가려졌다 돌아와도 밀린 글자가 한꺼번에 쏟아지지 않는다.
   */
  function timeline(items, opts) {
    const o = opts || {};
    const list = items.slice().sort((a, b) => a.t - b.t);
    const running = [];
    let i = 0;
    let elapsed = 0;
    let last = null;
    let raf = 0;
    let ended = false;

    list.forEach((it) => { if (!it.keep) it.el.classList.add('pending'); });
    if (o.from > 0) {
      while (i < list.length && list[i].t < o.from) i++;
      show(list.slice(0, i));
      elapsed = o.from;
    }

    function reveal(it) {
      if (!it.keep) it.el.classList.remove('pending');
      const fn = FX[it.fx] || FX.fade;
      const a = fn(it.el, it);
      if (a) running.push(a);
      if (o.onReveal) o.onReveal(it, i);
    }

    function end() {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      if (o.onDone) o.onDone();
    }

    function frame(now) {
      if (last === null) last = now;
      elapsed += Math.min(now - last, 64);
      last = now;
      while (i < list.length && list[i].t <= elapsed) {
        if (o.gate && !list[i].keep && !o.gate(list[i])) { elapsed = list[i].t; break; }
        reveal(list[i++]);
      }
      if (i < list.length) raf = requestAnimationFrame(frame);
      else end();
    }

    raf = requestAnimationFrame(frame);

    return {
      finish() {
        cancelAnimationFrame(raf);
        running.forEach((a) => { try { a.finish(); } catch (e) { /* 이미 끝난 효과 */ } });
        show(list);
        end();
      },
      cancel() {
        ended = true;
        cancelAnimationFrame(raf);
        running.forEach((a) => { try { a.cancel(); } catch (e) { /* 이미 끝난 효과 */ } });
      },
      get done() { return ended; }
    };
  }

  /* 퇴장 효과마다 끝 모습 */
  const EXIT_END = { vanish: 'gone', scatter: 'gone', erase: 'gone', sink: 'gone', dim: 'dimmed', fold: 'folded' };

  /* 다 쓴 모습으로 바로 놓는다(퇴장한 글자는 물러난 채로). */
  function show(items) {
    items.forEach((it) => {
      if (EXIT_END[it.fx]) it.el.classList.add(EXIT_END[it.fx]);
      else if (it.fx === 'spot' || it.fx === 'unspot') it.el.classList.remove('spotlight', 'spot-ready');
      else if (!it.keep) it.el.classList.remove('pending', 'wet', 'drying');
    });
    if (caret) caret.remove();
  }

  /* 쓰기 전 모습으로 되돌린다. */
  function hide(items) {
    items.forEach((it) => {
      if (EXIT_END[it.fx]) it.el.classList.remove('gone', 'dimmed', 'folded', 'folding', 'erasing');
      else if (it.fx === 'spot' || it.fx === 'unspot') it.el.classList.remove('spotlight', 'spot-ready');
      else if (!it.keep) { it.el.classList.add('pending'); it.el.classList.remove('wet', 'drying'); }
    });
  }

  /* ---------- 문단 그리기 ---------- */

  /* 글자 꾸밈 클래스 */
  function decorate(el, c) {
    if (c.pace && c.pace !== 1) el.dataset.pace = String(c.pace);
    if (c.st) for (const k of c.st) el.classList.add('s-' + k);
    if (c.color && c.color[0] === '#') el.style.color = c.color;
    else if (c.color) el.classList.add('c-' + c.color);
  }

  /* 엔진이 짠 문단 하나를 inner 안에 줄·어절·글자로 그리고, 재생기에 넘길 항목을 돌려준다.
     어절 사이는 띄어쓰기를 몇 칸 했든 화면에는 한 칸으로 놓는다(쉬는 시간은 엔진이 이미 반영함).
     밑줄·취소선이 앞뒤 어절에 이어지면 사이 칸에도 긋는다. */
  function buildParagraph(para, inner) {
    const items = [];
    const lineEls = [];
    const cellEls = new Map();
    para.lines.forEach((line) => {
      const row = document.createElement('div');
      row.className = 'ln';
      row.dataset.kind = line.kind;
      if (line.indent) row.style.setProperty('--indent', line.indent);
      if (line.dripDepth) row.style.setProperty('--drip', line.dripDepth);
      line.tokens.forEach((tk, ti) => {
        if (ti > 0) {
          const sp = document.createElement('span');
          sp.className = 'sp';
          sp.textContent = ' ';
          const a = line.tokens[ti - 1].cells[line.tokens[ti - 1].cells.length - 1];
          const b = tk.cells[0];
          ['u', 's'].forEach((k) => { if (a.st && b.st && a.st.includes(k) && b.st.includes(k)) sp.classList.add('s-' + k); });
          row.append(sp);
        }
        const w = document.createElement('span');
        w.className = 'tk';
        w.dataset.role = tk.role;
        if (tk.long) w.dataset.long = '';
        if (tk.role === 'drip') w.style.setProperty('--k', tk.dripIndex);
        tk.cells.forEach((c) => {
          const s = document.createElement('span');
          s.className = 'ch';
          s.dataset.a = c.anim;
          if (c.em) s.classList.add('em');
          if (c.cls) s.classList.add(c.cls);
          decorate(s, c);
          s.textContent = c.ch;
          cellEls.set(c, s);
          w.append(s);
          items.push({ el: s, t: c.t, fx: c.anim });
        });
        row.append(w);
      });
      inner.append(row);
      lineEls.push(row);
    });
    (para.events || []).forEach((ev) => {
      if (ev.type === 'exit') {
        ev.cells.forEach((c, k) => {
          const el = cellEls.get(c);
          if (el) items.push({ el, t: 0, fx: ev.fx, keep: true, exit: true, hold: ev.hold, k });
        });
      } else if (ev.type === 'spot') {
        items.push({ el: inner, t: ev.t, fx: 'spot', keep: true });
        items.push({ el: inner, t: ev.end, fx: 'unspot', keep: true });
      }
    });
    deferExits(items);
    return { items, lineEls };
  }

  /* 퇴장은 글을 끝까지 쓴 뒤에: 마지막 글자가 자리 잡고 hold만큼 머문 다음 글자마다 조금씩 어긋나 물러난다.
     읽기 틀은 쪽의 문단을 다 모은 뒤 한 번 더 불러 쪽 끝으로 맞춘다. */
  const EXIT_AFTER = 900;
  function deferExits(items) {
    const exits = items.filter((it) => it.exit);
    if (!exits.length) return;
    const last = items.reduce((m, it) => (it.keep ? m : Math.max(m, it.t)), 0);
    const hold = Math.max(...exits.map((it) => it.hold || 1400));
    const step = window.Geulgyeol ? window.Geulgyeol.TIME.exitStagger : 45;
    exits.forEach((it) => { it.t = last + EXIT_AFTER + hold + it.k * step; });
  }

  /* ---------- 초점 띠 ---------- */

  /* 화면 가운데 띠 안의 줄은 또렷하게, 위아래로 멀어질수록 옅고 흐리게 한다. */
  function focusBand(lines, on) {
    const vh = window.innerHeight;
    const mid = vh / 2;
    const flat = vh * 0.14;
    const fall = vh * 0.36;
    lines.forEach((ln) => {
      if (!on) {
        if (ln._band) { ln.style.opacity = ''; ln.style.filter = ''; ln._band = 0; }
        return;
      }
      const r = ln.getBoundingClientRect();
      if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) return;
      const d = Math.min(1, Math.max(0, Math.abs(r.top + r.height / 2 - mid) - flat) / fall);
      const key = Math.round(d * 40) + 1;
      if (ln._band === key) return;
      ln._band = key;
      ln.style.opacity = d ? String((1 - 0.74 * d).toFixed(3)) : '';
      ln.style.filter = d > 0.04 ? `blur(${(d * 2).toFixed(2)}px)` : '';
    });
  }

  /* ---------- 손끝 ---------- */

  /* 다 쓴 어절에 손을 대거나 마우스를 올리면 그 어절이 잠깐 다시 젖는다. */
  function touchable(root) {
    const wetToken = (e) => {
      const tk = e.target.closest && e.target.closest('.tk');
      if (!tk || !root.contains(tk)) return;
      tk.querySelectorAll('.ch:not(.pending):not(.gone):not(.dimmed)').forEach((c) => {
        if (!c.classList.contains('wet')) wet(c, 1300, true);
      });
    };
    root.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') wetToken(e); });
    root.addEventListener('pointerdown', wetToken);
  }

  global.GeulFx = { FX, EXIT_END, animate, wet, timeline, show, hide, buildParagraph, deferExits, decorate, focusBand, touchable, rnd, setPace, recolor };
})(typeof window !== 'undefined' ? window : globalThis);
