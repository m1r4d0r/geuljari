/*
 * 글결 움직임 도구
 * - spring: 값 하나가 목표를 스프링처럼 따라간다. 목표를 바꾸면 지금 속도를 지닌 채 이어서 움직여서 끊기지 않는다.
 * - tween: 정해진 시간 동안 이징 곡선을 따라 값을 옮긴다(버튼·키로 한 번에 넘길 때).
 * - bezier: CSS cubic-bezier와 같은 이징 함수를 만든다.
 * 읽기 틀 2판의 진행값(페이지 넘김·반전·바탕 따라오기)이 모두 이 도구로 움직인다.
 */
(function (global) {
  'use strict';

  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 6; i++) {
        const err = sx(t) - x;
        const d = dx(t);
        if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
        t -= err / d;
      }
      t = Math.min(1, Math.max(0, t));
      return sy(t);
    };
  }

  /*
   * opts: value(처음 값), stiffness, damping, clamp([최소, 최대] — 넘으면 멈춤), onUpdate(값, 속도), onRest(값)
   * 속도 단위는 '값/초'.
   */
  function spring(opts) {
    const o = Object.assign({ value: 0, stiffness: 240, damping: 30, precision: 0.0004 }, opts);
    let x = o.value;
    let v = 0;
    let target = o.value;
    let raf = 0;
    let last = 0;

    function emit() { if (o.onUpdate) o.onUpdate(x, v); }

    function step(now) {
      const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000));
      last = now;
      const sub = 4;
      const h = dt / sub;
      for (let i = 0; i < sub; i++) {
        const a = -o.stiffness * (x - target) - o.damping * v;
        v += a * h;
        x += v * h;
        if (o.clamp) {
          if (x < o.clamp[0]) { x = o.clamp[0]; v = Math.max(0, v); }
          if (x > o.clamp[1]) { x = o.clamp[1]; v = Math.min(0, v); }
        }
      }
      if (Math.abs(x - target) < o.precision && Math.abs(v) < o.precision * 20) {
        x = target;
        v = 0;
        raf = 0;
        emit();
        if (o.onRest) o.onRest(x);
        return;
      }
      emit();
      raf = requestAnimationFrame(step);
    }

    function kick() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    }

    return {
      get value() { return x; },
      get velocity() { return v; },
      get target() { return target; },
      get moving() { return !!raf; },
      to(t, velocity) {
        target = t;
        if (velocity != null) v = velocity;
        kick();
      },
      set(val, velocity) {
        x = val;
        target = val;
        v = velocity || 0;
        cancelAnimationFrame(raf);
        raf = 0;
        emit();
      },
      stop() { cancelAnimationFrame(raf); raf = 0; },
      config(c) { Object.assign(o, c); }
    };
  }

  /* from에서 to까지 ms 동안 ease 곡선으로 옮긴다. 돌려준 객체의 cancel()로 멈춘다. */
  function tween(from, to, ms, ease, onUpdate, onDone) {
    const e = ease || ((t) => t);
    let raf = 0;
    const t0 = performance.now();
    function step(now) {
      const k = Math.min(1, (now - t0) / ms);
      onUpdate(from + (to - from) * e(k), k);
      if (k < 1) raf = requestAnimationFrame(step);
      else if (onDone) onDone();
    }
    raf = requestAnimationFrame(step);
    return { cancel() { cancelAnimationFrame(raf); } };
  }

  /* 포인터 위치 같은 2차원 값을 부드럽게 따라가는 짝 스프링 */
  function spring2(opts) {
    const sx = spring(Object.assign({}, opts, { onUpdate: () => opts.onUpdate && opts.onUpdate(sx.value, sy.value) }));
    const sy = spring(Object.assign({}, opts, { onUpdate: () => opts.onUpdate && opts.onUpdate(sx.value, sy.value) }));
    return {
      get x() { return sx.value; },
      get y() { return sy.value; },
      to(x, y) { sx.to(x); sy.to(y); }
    };
  }

  global.GeulMotion = {
    bezier,
    spring,
    spring2,
    tween,
    ease: {
      swing: bezier(0.7, 0, 0.22, 1),
      inOut: bezier(0.65, 0, 0.35, 1),
      out: bezier(0.2, 0.7, 0.25, 1)
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
