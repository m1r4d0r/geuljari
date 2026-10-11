/*
 * 글결 반전 넘김
 * 두 장(from, to) 사이를 진행값 p(0~1)로 그린다. 축은 무대 바닥선의 가운데다.
 * - sweep(쓸기): 바닥에 누워 있던 바늘이 축을 중심으로 180도를 휙 쓸고, 바늘이 지나간 자리부터 새 장이 보인다. 장 자체는 움직이지 않는다.
 * - disc(회전): 두 장이 한 몸처럼 축을 중심으로 180도 돈다. 새 장은 처음에 바닥 아래에 거꾸로 붙어 있다가 돌아 올라온다.
 *   돌아가는 동안 장이 비운 자리로 무대 뒤의 어둠이 잠깐 드러난다.
 * - iris(조리개): 영사기 조리개가 열리듯 화면 가운데의 빛점에서 둥근 구멍이 넓어지며 새 장이 드러난다. 가장자리에 빛 고리가 돈다.
 * - bloom(피어남): 바닥 가운데의 빛점에서 둥근 원이 부풀어 오르며 새 장이 드러난다. 다크로 가면 어두운 원, 라이트로 가면 밝은 원이다.
 *   원 가장자리는 살짝 번지고 얇은 빛테가 두르며, 빛테는 원이 가장 빨리 부푸는 한가운데에서 가장 밝다. 되돌아갈 때는 원이 바닥으로 오므라든다.
 * - blinds(셔터): 가로 살이 한꺼번에 벌어지며 새 장이 드러난다. 스위치를 내린 듯 짧고 또렷하다.
 * - curtain(막): 영사 스크린이 위에서 내려오듯 새 장이 위에서부터 덮고, 아랫단에 빛줄이 따라 내려온다.
 * - sunrise(해돋이): 아래 지평에 먼저 빛이 돌고, 새 장이 아래에서부터 차오르며 차오르는 끝 위로 따뜻한 빛이 떠오른다.
 * - sunset(해넘이): 새 장이 위에서부터 내려오고, 끝 아래로 빛이 지며 앞 장은 노을빛으로 저문다.
 * - flash(섬광): 찰칵 하고 하얗게 번쩍이는 사이에 장이 바뀌고, 빛이 빠지며 새 장이 드러난다.
 * - drift(스밈): 장면이 같은 페이지끼리. 새 장이 위에서 옅게 겹쳐 오고, 글은 넘기는 방향으로 조금 밀리며 바뀐다.
 * dir=1이면 시계방향(앞으로), dir=-1이면 반시계방향(되돌아가기).
 * 장(.sheet)은 무대 크기 그대로 겹쳐 있어야 하고, 무대는 position이 있는 요소여야 한다.
 *
 * render(p, light)는 p와 light만으로 그린다. 장의 모양은 p로만 정해지고 light는 빛 요소의 세기만 바꾼다.
 * 시간에 따라 저절로 움직이는 것이 없어서 손가락으로 끌면 그대로 따라오고 되돌릴 수 있다.
 * 단추·키·휠로 넘길 때의 시간과 빠르기는 timing(mode)가 정한다: 바닥 빛이 먼저 들어오는 lead, 움직이는 run, 빛이 빠지는 tail(ms),
 * run에 거는 빠르기 곡선 ease(0~1→0~1, 처음과 끝은 정확히 0과 1이고 거꾸로 가지 않는다). 넘김마다 처음·한가운데·끝의 빠르기가 다르다.
 */
(function (global) {
  'use strict';

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const smooth = (q) => q * q * (3 - 2 * q);

  /* 앞은 k1제곱으로 붙고 뒤는 k2제곱으로 내려앉는 곡선. a는 가장 빠른 때(0~1)이고, 두 토막이 그 자리에서 같은 빠르기로 이어진다 */
  function powInOut(a, k1, k2) {
    const m = (a * k2) / (k1 * (1 - a) + a * k2);
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return t < a ? m * Math.pow(t / a, k1) : 1 - (1 - m) * Math.pow((1 - t) / (1 - a), k2);
    };
  }

  /* 섬광: 앞 장이 하얗게 타오르는 데까지(진행값 0.42)는 짧게 터지고, 남은 길은 길게 빠진다 */
  function popFade(at, peak) {
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return t < at ? peak * (t / at) : peak + (1 - peak) * ((t - at) / (1 - at));
    };
  }

  function bez(x1, y1, x2, y2) {
    const M = global.GeulMotion;
    return M && M.bezier ? M.bezier(x1, y1, x2, y2) : smooth;
  }

  /* 넘김마다의 시간(ms)과 run 곡선. 곡선은 처음 부를 때 만든다 */
  const TIMING = {
    /* 쓸기: 바늘이 바닥에서 뜸을 들였다가 한가운데를 휙 긋고, 넘치지 않게 내려앉는다 */
    sweep: { lead: 170, run: 680, tail: 260, make: () => powInOut(0.46, 3.2, 2.8) },
    /* 회전: 무거운 판이 돌 듯 천천히 붙고 천천히 선다 */
    disc: { lead: 170, run: 860, tail: 260, make: () => powInOut(0.5, 2.4, 2.4) },
    /* 조리개: 빛점에서 머뭇거리다 기계처럼 열리고 조용히 멈춘다 */
    iris: { lead: 0, run: 820, tail: 0, make: () => powInOut(0.4, 2.2, 3) },
    /* 피어남: 바닥의 빛점이 뜸을 들이다 부풀고 천천히 자리 잡는다(안내 장면의 곡선) */
    bloom: { lead: 0, run: 1100, tail: 0, make: () => bez(0.6, 0, 0.3, 1) },
    /* 셔터: 짧게 탁 */
    blinds: { lead: 0, run: 460, tail: 0, make: () => powInOut(0.3, 2, 4) },
    /* 막: 무게대로 점점 빨리 떨어지다가 바닥에 닿기 전에 부드럽게 선다 */
    curtain: { lead: 160, run: 900, tail: 200, make: () => powInOut(0.68, 2, 3.5) },
    /* 해돋이: 지평의 빛이 오른 뒤 천천히 차오르고 길게 자리 잡는다 */
    sunrise: { lead: 280, run: 1150, tail: 260, make: () => powInOut(0.42, 2, 2.4) },
    /* 해넘이: 비교적 일찍 내려오고 노을로 길게 저문다 */
    sunset: { lead: 220, run: 1150, tail: 260, make: () => powInOut(0.38, 1.8, 3) },
    /* 섬광: 순간 번쩍하고 천천히 빠진다 */
    flash: { lead: 0, run: 950, tail: 0, make: () => popFade(0.11, 0.42) },
    /* 스밈: 머뭇거림 없이 스며들고 길게 가라앉는다(render 안의 겹침 곡선과 합쳐서) */
    drift: { lead: 0, run: 780, tail: 0, make: () => bez(0.3, 0.1, 0.45, 1) }
  };
  /* 모르는 넘김: 쓸기와 같은 바닥 빛과 휘두름 */
  const FALLBACK = { lead: 170, run: 640, tail: 260, make: () => (global.GeulMotion && global.GeulMotion.ease ? global.GeulMotion.ease.swing : smooth) };

  function timing(mode) {
    const t = Object.prototype.hasOwnProperty.call(TIMING, mode) ? TIMING[mode] : FALLBACK;
    if (!t.ease) t.ease = t.make();
    return { lead: t.lead, run: t.run, tail: t.tail, ease: t.ease };
  }

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
    const lights = [trail, glow, hand, axis, ring, edge, sun, flash];
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
      /* 피어남을 되돌릴 때는 지금 장이 원 안에 남아 오므라들므로 위에 둔다 */
      const coverFrom = mode === 'bloom' && pair.dir < 0;
      from.style.zIndex = coverFrom ? '2' : '1';
      to.style.zIndex = coverFrom ? '1' : '2';
      ring.classList.toggle('is-low', mode === 'bloom');
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
      const q = clamp01(p);
      const lit = light == null ? (q > 0 && q < 1 ? 1 : 0) : clamp01(light);
      const mid = Math.sin(Math.PI * q);
      const { from, to, mode, dir } = pair;

      if (mode === 'drift') {
        const e = smooth(q);
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
        /* 구멍이 막 열릴 때는 고리가 가운데의 빛점으로 보이고, 열리는 한가운데에서 가장 밝다 */
        const R = Math.hypot(g.W, g.H) * 0.56 * q;
        const whole = q >= 0.9995;
        /* 새 장은 화면 가운데를 축으로 조금 크게 있다가 제자리로 온다. 구멍도 장과 함께 커지므로 그만큼 줄여 고리와 맞춘다 */
        const sc = 1.04 - 0.04 * smooth(q);
        to.style.visibility = R > 0.5 ? 'visible' : 'hidden';
        to.style.transformOrigin = '50% 50%';
        to.style.clipPath = whole ? '' : `circle(${(R / sc).toFixed(1)}px at 50% 50%)`;
        to.style.transform = whole ? '' : `scale(${sc.toFixed(4)})`;
        /* 고리 선은 구멍 안쪽 가장자리에 얹어서 어느 쪽 장이 밝든 보이게 한다 */
        ring.style.width = ring.style.height = (Math.max(0, R - 1.5) * 2).toFixed(1) + 'px';
        ring.style.opacity = String(lit * (0.55 + 0.45 * mid) * (1 - Math.pow(q, 6)));
        glow.style.opacity = String(0.4 * mid * lit);
        [hand, axis, trail, edge, sun, flash].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'bloom') {
        /* 원 안에 드는 장: 앞으로는 새 장, 되돌아갈 때는 지금 장이 원 안에 있다가 바닥으로 오므라든다 */
        const back = dir < 0;
        const cover = back ? from : to;
        const base = back ? to : from;
        const k = back ? 1 - q : q;
        const swell = Math.sin(Math.PI * k);
        const r = g.R * k;
        const soft = 1.5 + 9 * swell;
        const whole = k >= 0.9995;
        /* 원 안의 장은 바닥 가운데를 축으로 조금 크게 있다가 제자리로 내려앉는다. 원 모양 가림도 장과 함께 커지므로 그만큼 줄여 화면에서 r이 되게 한다 */
        const sc = 1 + 0.035 * (1 - smooth(k));
        const m = whole ? '' : `radial-gradient(circle at 50% 100%, #000 ${(Math.max(0, r - soft) / sc).toFixed(1)}px, transparent ${(r / sc).toFixed(1)}px)`;
        base.style.visibility = 'visible';
        base.style.webkitMaskImage = '';
        base.style.maskImage = '';
        base.style.transform = '';
        cover.style.visibility = r > 0.5 ? 'visible' : 'hidden';
        cover.style.webkitMaskImage = m;
        cover.style.maskImage = m;
        cover.style.transformOrigin = '50% 100%';
        cover.style.transform = whole ? '' : `scale(${sc.toFixed(4)})`;
        /* 빛테는 번진 가장자리의 한가운데에 두른다. 원이 막 생길 때는 바닥의 빛점으로 보이고, 부푸는 한가운데에서 가장 밝다 */
        ring.style.width = ring.style.height = (Math.max(0, r - soft / 2) * 2).toFixed(1) + 'px';
        ring.style.opacity = String(lit * (0.6 + 0.4 * swell) * (1 - Math.pow(k, 6)));
        /* 바닥의 빛은 원보다 먼저 밝아 있다가 원이 커질수록 물러난다 */
        glow.style.opacity = String(0.55 * lit * Math.pow(1 - k, 1.5));
        [hand, axis, trail, edge, sun, flash].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'blinds') {
        const band = Math.max(28, g.H / 9);
        const open = (band * q).toFixed(2);
        const m = q >= 0.9995 ? '' : `repeating-linear-gradient(to bottom, #000 0, #000 ${open}px, transparent ${open}px, transparent ${band.toFixed(2)}px)`;
        to.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
        to.style.webkitMaskImage = m;
        to.style.maskImage = m;
        trail.style.background = `repeating-linear-gradient(to bottom, rgba(255,244,222,0) 0, rgba(255,244,222,0) ${open}px, rgba(255,244,222,.5) ${open}px, rgba(255,244,222,0) ${(+open + 2).toFixed(2)}px, rgba(255,244,222,0) ${band.toFixed(2)}px)`;
        trail.style.opacity = String(mid * lit);
        [hand, axis, glow, ring, edge, sun, flash].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'curtain') {
        const y = g.H * q;
        to.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
        to.style.clipPath = q >= 0.9995 ? '' : `inset(0 0 ${(g.H - y).toFixed(1)}px 0)`;
        from.style.transform = `translate3d(0, ${(y * 0.06).toFixed(1)}px, 0)`;
        edge.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
        /* 빛줄은 위에서 먼저 켜지고, 떨어지는 동안 가장 밝다가 바닥에 닿으며 꺼진다 */
        edge.style.opacity = String(lit * (0.7 + 0.3 * mid) * clamp01((1 - q) / 0.05));
        [hand, axis, trail, glow, ring, sun, flash].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'sunrise' || mode === 'sunset') {
        const up = mode === 'sunrise';
        const y = up ? g.H * (1 - q) : g.H * q;
        to.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
        to.style.clipPath = q >= 0.9995 ? '' : (up ? `inset(${y.toFixed(1)}px 0 0 0)` : `inset(0 0 ${(g.H - y).toFixed(1)}px 0)`);
        /* 해넘이의 노을빛은 내려오는 끝보다 조금 늦게 짙어진다 */
        const dusk = q * q * (2 - q);
        from.style.filter = up ? '' : `sepia(${(0.6 * dusk).toFixed(3)}) brightness(${(1 - 0.35 * dusk).toFixed(3)})`;
        sun.classList.toggle('down', !up);
        sun.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
        /* 불이 들어오면 지평에 빛이 먼저 돌고, 차오르는 동안 가장 밝다 */
        sun.style.opacity = String(lit * Math.min(1, 0.4 + 1.6 * mid) * (1 - Math.pow(q, 8)));
        glow.style.opacity = String(0.3 * mid * lit);
        [hand, axis, trail, ring, edge, flash].forEach((n) => { n.style.opacity = '0'; });
      } else if (mode === 'flash') {
        const T0 = 0.42;
        const before = q < T0;
        const f = before ? Math.pow(q / T0, 2.2) : Math.pow(1 - (q - T0) / (1 - T0), 1.6);
        to.style.visibility = before ? 'hidden' : 'visible';
        from.style.visibility = before ? '' : 'hidden';
        (before ? from : to).style.filter = `brightness(${(1 + 1.4 * f).toFixed(3)}) contrast(${(1 - 0.3 * f).toFixed(3)})`;
        (before ? to : from).style.filter = '';
        flash.style.opacity = String(f);
        [hand, axis, trail, ring, edge, sun, glow].forEach((n) => { n.style.opacity = '0'; });
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
        /* 바늘은 바닥에서 켜져 있다가 휙 긋는 한가운데에서 가장 밝다 */
        hand.style.opacity = String(lit * (0.75 + 0.25 * mid));
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
          s.style.transformOrigin = '';
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

  global.GeulFlip = { create, timing };
})(typeof window !== 'undefined' ? window : globalThis);
