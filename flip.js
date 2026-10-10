/*
 * 글결 반전 넘김
 * 두 장(from, to) 사이를 진행값 p(0~1)로 그린다. 축은 무대 바닥선의 가운데다.
 * - sweep(쓸기): 바닥에 누워 있던 바늘이 축을 중심으로 180도를 휙 쓸고, 바늘이 지나간 자리부터 새 장이 보인다. 장 자체는 움직이지 않는다.
 * - disc(회전): 두 장이 한 몸처럼 축을 중심으로 180도 돈다. 새 장은 처음에 바닥 아래에 거꾸로 붙어 있다가 돌아 올라온다.
 *   돌아가는 동안 장이 비운 자리로 무대 뒤의 어둠이 잠깐 드러난다.
 * - iris(조리개): 영사기 조리개가 열리듯 화면 가운데에서 둥근 구멍이 넓어지며 새 장이 드러난다. 가장자리에 빛 고리가 돈다.
 * - blinds(셔터): 가로 살이 한꺼번에 벌어지며 새 장이 드러난다. 스위치를 내린 듯 짧고 또렷하다.
 * - curtain(막): 영사 스크린이 위에서 내려오듯 새 장이 위에서부터 덮고, 아랫단에 빛줄이 따라 내려온다.
 * - sunrise(해돋이): 새 장이 아래에서부터 차오르고, 차오르는 끝 위로 따뜻한 빛이 떠오른다.
 * - sunset(해넘이): 새 장이 위에서부터 내려오고, 끝 아래로 빛이 지며 앞 장은 노을빛으로 저문다.
 * - shatter(깨짐): 한 점에서 금이 번진 뒤 앞 장이 유리 조각처럼 쏟아져 내리고 그 뒤로 새 장이 드러난다.
 *   조각은 앞 장을 복제해 잘라 만든다(바탕 캔버스는 복제되지 않아 종이색만 남는다).
 * - flash(섬광): 찰칵 하고 하얗게 번쩍이는 사이에 장이 바뀌고, 빛이 빠지며 새 장이 드러난다.
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
    const sun = document.createElement('i');
    sun.className = 'flip-sun';
    const flash = document.createElement('i');
    flash.className = 'flip-flash';
    const crack = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    crack.setAttribute('class', 'flip-crack');
    const lights = [trail, glow, hand, axis, ring, edge, sun, flash, crack];
    lights.forEach((n) => n.setAttribute('aria-hidden', 'true'));
    stage.append(...lights);
    let shards = [];

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
      if (mode === 'shatter') breakGlass(from);
    }

    /* 깨짐: 맞은 자리에서 뻗는 금을 따라 앞 장을 조각으로 나눈다. 조각마다 앞 장의 복제를 잘라 쓴다. */
    function breakGlass(from) {
      const { W, H } = g;
      const P = [W * 0.56, H * 0.44];
      const D = Math.hypot(W, H);
      const n = 7;
      const angles = [];
      for (let k = 0; k < n; k++) angles.push(((k + 0.25 + Math.random() * 0.5) / n) * Math.PI * 2);
      const rings = [D * (0.12 + Math.random() * 0.05), D * (0.34 + Math.random() * 0.08), D * 1.6];
      const at = (a, r) => [P[0] + Math.cos(a) * r, P[1] + Math.sin(a) * r];
      const polys = [];
      for (let k = 0; k < n; k++) {
        const a0 = angles[k];
        const a1 = angles[(k + 1) % n] + (k === n - 1 ? Math.PI * 2 : 0);
        polys.push({ pts: [P, at(a0, rings[0]), at(a1, rings[0])], ring: 0 });
        polys.push({ pts: [at(a0, rings[0]), at(a0, rings[1]), at(a1, rings[1]), at(a1, rings[0])], ring: 1 });
        polys.push({ pts: [at(a0, rings[1]), at(a0, rings[2]), at(a1, rings[2]), at(a1, rings[1])], ring: 2 });
      }
      shards = polys.map((pl) => {
        const el = from.cloneNode(true);
        el.classList.add('flip-shard');
        el.classList.remove('is-current');
        el.removeAttribute('data-i');
        el.style.clipPath = `polygon(${pl.pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
        const cx = pl.pts.reduce((a, p) => a + p[0], 0) / pl.pts.length;
        const cy = pl.pts.reduce((a, p) => a + p[1], 0) / pl.pts.length;
        const dx = cx - P[0];
        const dy = cy - P[1];
        const len = Math.hypot(dx, dy) || 1;
        stage.append(el);
        const sc = from.querySelector(contentSel || '.scroll');
        const sc2 = el.querySelector(contentSel || '.scroll');
        if (sc && sc2) sc2.scrollTop = sc.scrollTop;
        return {
          el,
          ox: `${(cx / W * 100).toFixed(1)}% ${(cy / H * 100).toFixed(1)}%`,
          vx: (dx / len) * W * (0.08 + pl.ring * 0.05),
          vy: (dy / len) * H * 0.06,
          rot: (Math.random() - 0.5) * (40 + pl.ring * 30),
          lag: pl.ring * 0.06 + Math.random() * 0.05
        };
      });
      shards.forEach((sh) => { sh.el.style.transformOrigin = sh.ox; });
      const d = [];
      angles.forEach((a) => d.push(`M${P[0].toFixed(1)} ${P[1].toFixed(1)} L${at(a, rings[0]).map((v) => v.toFixed(1)).join(' ')} L${at(a, rings[1]).map((v) => v.toFixed(1)).join(' ')} L${at(a, rings[2]).map((v) => v.toFixed(1)).join(' ')}`));
      [0, 1].forEach((r) => d.push('M' + angles.concat(angles[0]).map((a) => at(a, rings[r]).map((v) => v.toFixed(1)).join(' ')).join(' L')));
      crack.setAttribute('viewBox', `0 0 ${W} ${H}`);
      crack.innerHTML = `<path d="${d.join(' ')}" />`;
      from.style.visibility = 'hidden';
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
      } else if (mode === 'sunrise' || mode === 'sunset') {
        const e = q * q * (3 - 2 * q);
        const up = mode === 'sunrise';
        const y = up ? g.H * (1 - e) : g.H * e;
        to.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
        to.style.clipPath = q >= 0.9995 ? '' : (up ? `inset(${y.toFixed(1)}px 0 0 0)` : `inset(0 0 ${(g.H - y).toFixed(1)}px 0)`);
        from.style.filter = up ? '' : `sepia(${(0.6 * e).toFixed(3)}) brightness(${(1 - 0.35 * e).toFixed(3)})`;
        sun.classList.toggle('down', !up);
        sun.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
        sun.style.opacity = String(lit * Math.min(1, mid * 1.6));
        glow.style.opacity = String(0.3 * mid * lit);
        [hand, axis, trail, ring, edge, flash, crack].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'shatter') {
        const CR = 0.24;
        const c = Math.min(1, q / CR);
        const f = Math.max(0, (q - CR) / (1 - CR));
        to.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
        crack.style.opacity = String(q < CR ? c : Math.max(0, 1 - f * 3));
        shards.forEach((sh) => {
          const t = Math.max(0, (f - sh.lag) / (1 - sh.lag));
          const shake = q < CR ? (Math.random() - 0.5) * 1.5 * c : 0;
          const x = sh.vx * t + shake;
          const y = sh.vy * t + g.H * 1.25 * t * t;
          sh.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${(sh.rot * t).toFixed(2)}deg)`;
          sh.el.style.opacity = String(t > 0.55 ? Math.max(0, 1 - (t - 0.55) / 0.45) : 1);
          sh.el.style.visibility = q >= 0.9995 ? 'hidden' : 'visible';
        });
        flash.style.opacity = String(q < CR ? 0.12 * c * c : 0);
        [hand, axis, trail, ring, edge, sun, glow].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'flash') {
        const T0 = 0.42;
        const before = q < T0;
        const f = before ? Math.pow(q / T0, 2.2) : Math.pow(1 - (q - T0) / (1 - T0), 1.6);
        to.style.visibility = before ? 'hidden' : 'visible';
        from.style.visibility = before ? '' : 'hidden';
        (before ? from : to).style.filter = `brightness(${(1 + 1.4 * f).toFixed(3)}) contrast(${(1 - 0.3 * f).toFixed(3)})`;
        flash.style.opacity = String(f);
        [hand, axis, trail, ring, edge, sun, glow, crack].forEach((n) => { n.style.opacity = '0'; });
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
          s.style.filter = '';
        });
        [pair.fromText, pair.toText].forEach((t) => {
          if (!t) return;
          t.style.opacity = '';
          t.style.transform = '';
        });
      }
      pair = null;
      shards.forEach((sh) => sh.el.remove());
      shards = [];
      crack.innerHTML = '';
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
