/*
 * 글결 반전 넘김
 * 두 장(from, to) 사이를 진행값 p(0~1)로 그린다. 축은 무대 바닥선의 가운데다.
 * - sweep(쓸기): 바닥에 누워 있던 바늘이 축을 중심으로 180도를 휙 쓸고, 바늘이 지나간 자리부터 새 장이 보인다. 장 자체는 움직이지 않는다.
 * - disc(회전): 두 장이 한 몸처럼 축을 중심으로 180도 돈다. 새 장은 처음에 바닥 아래에 거꾸로 붙어 있다가 돌아 올라온다.
 *   돌아가는 동안 장이 비운 자리로 무대 뒤의 어둠이 잠깐 드러난다.
 * - iris(조리개): 영사기 조리개가 열리듯 화면 가운데에서 둥근 구멍이 넓어지며 새 장이 드러난다. 가장자리에 빛 고리가 돈다.
 * - blinds(셔터): 가로 살이 한꺼번에 벌어지며 새 장이 드러난다. 스위치를 내린 듯 짧고 또렷하다.
 * - curtain(막): 영사 스크린이 위에서 내려오듯 새 장이 위에서부터 덮고, 아랫단에 빛줄이 따라 내려온다.
 * - drift(스밈): 장면이 같은 페이지끼리. 새 장이 위에서 옅게 겹쳐 오고, 글은 넘기는 방향으로 조금 밀리며 바뀐다.
 * dir=1이면 시계방향(앞으로), dir=-1이면 반시계방향(되돌아가기).
 * 장(.sheet)은 무대 크기 그대로 겹쳐 있어야 하고, 무대는 position이 있는 요소여야 한다.
 */
(function (global) {
  'use strict';

  /* opts.content: 장 안에서 글이 담긴 요소를 찾는 선택자(스밈에서 글만 밀 때 씀) */
  function create(stage, opts) {
    const contentSel = (opts && opts.content) || null;
    const trail = document.createElement('i');
    trail.className = 'flip-trail';
    const glow = document.createElement('i');
    glow.className = 'flip-glow';
    const hand = document.createElement('i');
    hand.className = 'flip-hand';
    const axis = document.createElement('i');
    axis.className = 'flip-axis';
    const ring = document.createElement('i');
    ring.className = 'flip-ring';
    const edge = document.createElement('i');
    edge.className = 'flip-edge';
    const lights = [trail, glow, hand, axis, ring, edge];
    lights.forEach((n) => n.setAttribute('aria-hidden', 'true'));
    stage.append(...lights);

    let pair = null;
    let g = null;

    function measure() {
      const r = stage.getBoundingClientRect();
      const R = Math.hypot(r.width / 2, r.height) * 1.12;
      g = { W: r.width, H: r.height, R };
      stage.style.setProperty('--flip-r', R + 'px');
    }

    function begin(from, to, mode, dir, axis) {
      if (pair && pair.from === from && pair.to === to && pair.mode === mode && pair.dir === dir) return;
      clear();
      measure();
      pair = {
        from, to, mode, dir: dir < 0 ? -1 : 1, axis: axis === 'y' ? 'y' : 'x',
        fromText: contentSel ? from.querySelector(contentSel) : null,
        toText: contentSel ? to.querySelector(contentSel) : null
      };
      from.classList.add('is-moving');
      to.classList.add('is-moving');
      from.style.zIndex = '1';
      to.style.zIndex = '2';
    }

    function wedge(p) {
      const { W, H, R } = g;
      const d = pair.dir;
      const start = d > 0 ? 180 : 360;
      const end = start + d * 180 * p;
      const n = Math.max(2, Math.ceil(Math.abs(end - start) / 5));
      const pts = [`${W / 2}px ${H}px`];
      for (let k = 0; k <= n; k++) {
        const a = ((start + (end - start) * (k / n)) * Math.PI) / 180;
        pts.push(`${(W / 2 + R * Math.cos(a)).toFixed(1)}px ${(H + R * Math.sin(a)).toFixed(1)}px`);
      }
      return { poly: `polygon(${pts.join(',')})`, angle: end };
    }

    /* p: 진행값(0~1), light: 바늘·축 빛의 세기(0~1, 생략하면 진행 중일 때 1) */
    function render(p, light) {
      if (!pair) return;
      const q = Math.min(1, Math.max(0, p));
      const lit = light == null ? (q > 0 && q < 1 ? 1 : 0) : light;
      const mid = Math.sin(Math.PI * q);
      const { from, to, mode, dir } = pair;

      if (mode === 'drift') {
        const e = q * q * (3 - 2 * q);
        const shift = (pair.axis === 'x' ? g.W : g.H) * 0.06;
        const mv = (v) => (pair.axis === 'x' ? `translate3d(${v}px,0,0)` : `translate3d(0,${v}px,0)`);
        to.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
        to.style.opacity = String(e);
        from.style.transform = '';
        to.style.transform = '';
        if (pair.fromText) {
          pair.fromText.style.opacity = String(1 - e);
          pair.fromText.style.transform = mv(-shift * e);
        }
        if (pair.toText) pair.toText.style.transform = mv(shift * (1 - e));
        lights.forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'iris') {
        const e = q * q * (3 - 2 * q);
        const R = Math.hypot(g.W, g.H) * 0.56 * e;
        to.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
        to.style.clipPath = q >= 0.9995 ? '' : `circle(${R.toFixed(1)}px at 50% 50%)`;
        to.style.transform = q >= 0.9995 ? '' : `scale(${(1.04 - 0.04 * e).toFixed(4)})`;
        ring.style.width = ring.style.height = (R * 2).toFixed(1) + 'px';
        ring.style.opacity = String(mid * lit);
        glow.style.opacity = String(0.4 * mid * lit);
        [hand, axis, trail, edge].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'blinds') {
        const e = q * q * (3 - 2 * q);
        const band = Math.max(28, g.H / 9);
        const open = (band * e).toFixed(2);
        const m = q >= 0.9995 ? '' : `repeating-linear-gradient(to bottom, #000 0, #000 ${open}px, transparent ${open}px, transparent ${band.toFixed(2)}px)`;
        to.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
        to.style.webkitMaskImage = m;
        to.style.maskImage = m;
        trail.style.background = `repeating-linear-gradient(to bottom, rgba(255,244,222,0) 0, rgba(255,244,222,0) ${open}px, rgba(255,244,222,.5) ${open}px, rgba(255,244,222,0) ${(+open + 2).toFixed(2)}px, rgba(255,244,222,0) ${band.toFixed(2)}px)`;
        trail.style.opacity = String(mid * lit);
        [hand, axis, glow, ring, edge].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'curtain') {
        const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        const y = g.H * e;
        to.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
        to.style.clipPath = q >= 0.9995 ? '' : `inset(0 0 ${(g.H - y).toFixed(1)}px 0)`;
        from.style.transform = `translate3d(0, ${(y * 0.06).toFixed(1)}px, 0)`;
        edge.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
        edge.style.opacity = String(lit * (q < 0.98 ? 1 : 0));
        [hand, axis, trail, glow, ring].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'sweep') {
        from.style.transform = '';
        to.style.transform = '';
        if (q <= 0.0005) {
          to.style.visibility = 'hidden';
          to.style.clipPath = '';
        } else {
          to.style.visibility = 'visible';
          if (q >= 0.9995) {
            to.style.clipPath = '';
          } else {
            const w = wedge(q);
            to.style.clipPath = w.poly;
          }
        }
        const angle = (dir > 0 ? 180 : 360) + dir * 180 * q;
        hand.style.transform = `rotate(${angle}deg)`;
        hand.style.opacity = String(lit);
        const conic = angle + 90;
        trail.style.background = dir > 0
          ? `conic-gradient(from ${conic - 16}deg at 50% 100%, rgba(255,244,222,0) 0deg, rgba(255,244,222,.16) 16deg, rgba(255,244,222,0) 16.2deg)`
          : `conic-gradient(from ${conic}deg at 50% 100%, rgba(255,244,222,.16) 0deg, rgba(255,244,222,0) 16deg)`;
        trail.style.opacity = String(mid * lit);
        axis.style.opacity = '0';
        ring.style.opacity = '0';
        edge.style.opacity = '0';
        glow.style.opacity = String(0.6 * mid * lit);
      } else {
        to.style.clipPath = '';
        to.style.visibility = 'visible';
        const a = dir * 180 * q;
        from.style.transform = `rotate(${a}deg)`;
        to.style.transform = `rotate(${a - dir * 180}deg)`;
        axis.style.transform = `rotate(${a}deg)`;
        axis.style.opacity = String(lit);
        hand.style.opacity = '0';
        trail.style.opacity = '0';
        ring.style.opacity = '0';
        edge.style.opacity = '0';
        glow.style.opacity = String(mid * lit);
      }
    }

    /* 넘김을 끝내고 남길 장만 남긴다. keepTo=true면 새 장, false면 원래 장 */
    function finish(keepTo) {
      if (!pair) return;
      const { from, to } = pair;
      const keep = keepTo ? to : from;
      const drop = keepTo ? from : to;
      clear();
      keep.classList.add('is-current');
      drop.classList.remove('is-current');
    }

    function clear() {
      if (pair) {
        [pair.from, pair.to].forEach((s) => {
          s.classList.remove('is-moving');
          s.style.transform = '';
          s.style.clipPath = '';
          s.style.zIndex = '';
          s.style.visibility = '';
          s.style.opacity = '';
          s.style.webkitMaskImage = '';
          s.style.maskImage = '';
        });
        [pair.fromText, pair.toText].forEach((t) => {
          if (!t) return;
          t.style.opacity = '';
          t.style.transform = '';
        });
      }
      pair = null;
      lights.forEach((n) => { n.style.opacity = '0'; });
    }

    window.addEventListener('resize', () => { if (pair) measure(); });

    return {
      begin,
      render,
      finish,
      clear,
      get active() { return !!pair; },
      get mode() { return pair && pair.mode; }
    };
  }

  global.GeulFlip = { create };
})(typeof window !== 'undefined' ? window : globalThis);
