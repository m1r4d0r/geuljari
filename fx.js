/*
 * 글결 효과 모음
 * - 글자는 처음에 .pending(보이지 않음)으로 두고, 시간표의 시각이 되면 .pending을 떼면서 효과를 건다.
 *   시각은 자바스크립트가 직접 재기 때문에, 효과가 실행되지 않는 환경이어도 글자는 제 시각에 하나씩 나타난다.
 * - 효과는 Web Animations(element.animate)로 실행하고, 색 변수는 키프레임에 넣지 않는다.
 *   젖은 잉크 색은 .wet → .drying 클래스로 바꿔 CSS 전환으로 말린다.
 * - 초점 띠: 화면 가운데 줄만 또렷하게. 손끝: 다 쓴 어절에 손대면 다시 젖음.
 * - 문단 하나를 글자 단위로 그리는 일(buildParagraph)도 여기서 해서 읽기 틀과 효과 견본이 똑같이 움직인다.
 * 읽기 틀(reader.js)과 효과 견본(effects.js)이 함께 쓴다.
 */
(function (global) {
  'use strict';

  const canAnimate = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const caret = typeof document !== 'undefined' ? document.createElement('span') : null;
  if (caret) caret.className = 'caret';

  function animate(el, frames, opts) {
    if (!canAnimate) return null;
    try { return el.animate(frames, Object.assign({ fill: 'none' }, opts)); } catch (e) { return null; }
  }

  function wet(el, hold) {
    el.classList.remove('drying');
    el.classList.add('wet');
    clearTimeout(el._dry);
    el._dry = setTimeout(() => {
      el.classList.add('drying');
      el.classList.remove('wet');
      el._dry = setTimeout(() => el.classList.remove('drying'), 2000);
    }, hold || 1400);
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

    rise(el) {
      wet(el, 1000);
      return animate(el, [
        { opacity: 0, transform: 'translateY(.5em)', filter: 'blur(4px)' },
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }
      ], { duration: 750, easing: 'cubic-bezier(.2, .65, .25, 1)' });
    },

    bleed(el) {
      const c = getComputedStyle(el).color;
      return animate(el, [
        { opacity: 0, color: 'transparent', textShadow: `0 0 .6em ${c}` },
        { opacity: 1, color: 'transparent', textShadow: `0 0 .28em ${c}`, offset: 0.4 },
        { opacity: 1, color: c, textShadow: `0 0 0 ${c}` }
      ], { duration: 1600, easing: 'ease-out' });
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

    fall(el) {
      return animate(el, [
        { opacity: 0, transform: 'translateY(-.8em)', easing: 'cubic-bezier(.55, 0, 1, .45)' },
        { opacity: 1, transform: 'translateY(0)', offset: 0.6, easing: 'cubic-bezier(0, .55, .45, 1)' },
        { opacity: 1, transform: 'translateY(-.07em)', offset: 0.78, easing: 'cubic-bezier(.55, 0, 1, .45)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 820 });
    },

    /* 타자: 글자는 그냥 나타나고 커서가 뒤를 따라간다. 마지막 글자 뒤 잠시 깜박이다 사라진다. */
    type(el) {
      el.after(caret);
      clearTimeout(caret._off);
      caret._off = setTimeout(() => caret.remove(), 1600);
      return null;
    },

    /* 고쳐 씀: 먼저 쓴 글자에 줄을 긋고 옅게 만든다 */
    strike(el) {
      el.classList.add('struck');
      return null;
    },

    /* 벌어짐: 블록이 걸친 줄들이 가운데 줄을 기준으로 위아래로 벌어졌다가 돌아온다 */
    spread(el, item) {
      const off = (item.k - (item.n - 1) / 2) * 0.7;
      return animate(el, [
        { transform: 'translateY(0)' },
        { transform: `translateY(${off}em)`, offset: 0.35 },
        { transform: `translateY(${off}em)`, offset: 0.65 },
        { transform: 'translateY(0)' }
      ], { duration: 3600, easing: 'cubic-bezier(.45, 0, .3, 1)' });
    },

    /* 어긋남: 줄들이 번갈아 좌우로 밀렸다가 돌아온다 */
    drift(el, item) {
      const dir = item.k % 2 ? -1 : 1;
      return animate(el, [
        { transform: 'translateX(0)', filter: 'blur(0px)' },
        { transform: `translateX(${dir * 0.7}em)`, filter: 'blur(.6px)', offset: 0.4 },
        { transform: `translateX(${-dir * 0.35}em)`, offset: 0.7 },
        { transform: 'translateX(0)', filter: 'blur(0px)' }
      ], { duration: 3400, delay: item.k * 120, easing: 'ease-in-out' });
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
   * keep이 있는 항목(줄 긋기·줄 움직임·조명)은 글자를 숨기지 않고 그 시각에 효과만 건다.
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

  /* 다 쓴 모습으로 바로 놓는다(줄 그은 글자는 그어진 채로). */
  function show(items) {
    items.forEach((it) => {
      if (it.fx === 'strike') it.el.classList.add('struck');
      else if (it.fx === 'spot' || it.fx === 'unspot') it.el.classList.remove('spotlight', 'spot-ready');
      else if (!it.keep) it.el.classList.remove('pending', 'wet', 'drying');
    });
    if (caret) caret.remove();
  }

  /* 쓰기 전 모습으로 되돌린다. */
  function hide(items) {
    items.forEach((it) => {
      if (it.fx === 'strike') it.el.classList.remove('struck');
      else if (it.fx === 'spot' || it.fx === 'unspot') it.el.classList.remove('spotlight', 'spot-ready');
      else if (!it.keep) { it.el.classList.add('pending'); it.el.classList.remove('wet', 'drying'); }
    });
  }

  /* ---------- 문단 그리기 ---------- */

  /* 엔진이 짠 문단 하나를 inner 안에 줄·어절·글자로 그리고, 재생기에 넘길 항목을 돌려준다.
     어절 사이는 띄어쓰기를 몇 칸 했든 화면에는 한 칸으로 놓는다(쉬는 시간은 엔진이 이미 반영함). */
  function buildParagraph(para, inner) {
    const items = [];
    const lineEls = [];
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
          if (c.pipe) s.classList.add('after-strike');
          s.textContent = c.ch;
          w.append(s);
          items.push({ el: s, t: c.t, fx: c.anim });
          if (c.strikeAt != null) items.push({ el: s, t: c.strikeAt, fx: 'strike', keep: true });
        });
        row.append(w);
      });
      inner.append(row);
      lineEls.push(row);
    });
    (para.events || []).forEach((ev) => {
      if (ev.type === 'spot') {
        items.push({ el: inner, t: ev.t, fx: 'spot', keep: true });
        items.push({ el: inner, t: ev.end, fx: 'unspot', keep: true });
      } else {
        ev.lines.forEach((li, k) => items.push({ el: lineEls[li], t: ev.t, fx: ev.type, keep: true, k, n: ev.lines.length }));
      }
    });
    return { items, lineEls };
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
      tk.querySelectorAll('.ch:not(.pending):not(.struck)').forEach((c) => wet(c, 900));
    };
    root.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') wetToken(e); });
    root.addEventListener('pointerdown', wetToken);
  }

  global.GeulFx = { FX, animate, wet, timeline, show, hide, buildParagraph, focusBand, touchable, rnd };
})(typeof window !== 'undefined' ? window : globalThis);
