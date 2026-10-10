/*
 * 글결 반전 시험
 * 진행값 pos(0=낮, 1=밤) 하나가 아래 막대에서 고른 넘김(쓸기·조리개·피어남…)의 그림 전체를 정한다. 넘김을 고르면 반대쪽 장까지 한 번 넘겨 보인다.
 * - 끌기: 손가락·마우스를 옆(또는 위)으로 끄는 만큼 pos가 따라오고, 놓으면 빠르기를 지닌 채 스프링으로 마저 가거나 돌아간다.
 * - 휠: 굴리는 만큼 pos가 움직이고, 멈추면 넘던 쪽으로 마저 간다.
 * - 단추·방향키: 넘김마다 정한 시간과 빠르기(GeulFlip.timing)로 넘어간다. 바닥 빛을 쓰는 넘김은 불이 먼저 들어온 뒤(스위치) 움직인다.
 * 글은 장 안에 있어서 바탕과 함께 쓸린다. 위 오른쪽에서 낮·밤 바탕을 골라 바꿔 볼 수 있다.
 */
(function () {
  'use strict';
  const M = window.GeulMotion;
  const F = window.GeulFlip;
  const B = window.GeulBackdrop;
  if (!M || !F || !B) return;

  const stage = document.getElementById('stage');
  const [day, night] = stage.querySelectorAll('.sheet');
  const nextBtn = document.getElementById('next');
  const backBtn = document.getElementById('back');
  const picks = document.querySelectorAll('.pick');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  [day, night].forEach((s) => B.mount(s, s.dataset.ground));
  const flip = F.create(stage);

  let pos = 0;
  let tw = null;
  let turn = 'sweep';
  const turnBtns = document.querySelectorAll('.turns [data-turn]');

  const spring = M.spring({
    value: 0,
    stiffness: 150,
    damping: 23,
    clamp: [0, 1],
    onUpdate: (x) => draw(x)
  });

  /* pos를 그린다. light를 주면 넘김이 멈춰 있어도 바늘에 그만큼 불을 켠다 */
  function draw(p, light) {
    pos = p;
    const resting = (p <= 0.0005 || p >= 0.9995) && !light;
    if (resting) {
      if (flip.active) flip.finish(p >= 0.5);
      else {
        day.classList.toggle('is-current', p < 0.5);
        night.classList.toggle('is-current', p >= 0.5);
      }
      B.setActive([p >= 0.5 ? night : day], [day, night]);
    } else {
      flip.begin(day, night, turn, 1);
      flip.render(p, light);
      B.setActive([day, night]);
    }
    nextBtn.disabled = p >= 0.9995 && resting;
    backBtn.disabled = p <= 0.0005 && resting;
  }

  /* ---------- 넘기기 ---------- */

  function stopAll() {
    spring.stop();
    if (tw) { tw.cancel(); tw = null; }
  }

  /* 단추·키로 넘기기: 불 켜기 → 넘김마다의 곡선으로 움직이기 → 불 끄기. 시간이 0인 단계는 건너뛴다 */
  function go(target) {
    if (Math.abs(pos - target) < 0.001 && !flip.active) return;
    stopAll();
    if (reduce.matches) { spring.set(target); return; }
    const from = pos;
    const T = F.timing(turn);
    const phase = (ms, a, b, ease, paint, done) => {
      if (ms > 0) tw = M.tween(a, b, ms, ease, paint, done);
      else { paint(b); done(); }
    };
    phase(T.lead, 0, 1, M.ease.out, (l) => draw(from, l), () => {
      phase(T.run, from, target, T.ease, (x) => draw(x, 1), () => {
        phase(T.tail, 1, 0, M.ease.out, (l) => draw(target, l), () => {
          tw = null;
          spring.set(target);
        });
      });
    });
  }

  /* ---------- 끌기 ---------- */

  let drag = null;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    stopAll();
    stage.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: pos, axis: null, samples: [[performance.now(), pos]] };
    stage.classList.add('is-dragging');
    draw(pos, 1);
  });

  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    B.pointer((e.clientX / r.width) * 2 - 1, (e.clientY / r.height) * 2 - 1);
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    const d = drag.axis === 'x' ? -dx / (r.width * 0.62) : -dy / (r.height * 0.62);
    const p = clamp(drag.from + d, 0, 1);
    draw(p, 1);
    drag.samples.push([performance.now(), p]);
    if (drag.samples.length > 8) drag.samples.shift();
  });

  function release(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now();
    const old = drag.samples.find(([t]) => now - t < 100) || drag.samples[0];
    const dt = Math.max(16, now - old[0]) / 1000;
    const v = (pos - old[1]) / dt;
    let target;
    if (v > 1.1) target = 1;
    else if (v < -1.1) target = 0;
    else target = pos >= 0.5 ? 1 : 0;
    drag = null;
    stage.classList.remove('is-dragging');
    spring.set(pos, v);
    spring.to(target, v);
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  /* ---------- 휠 ---------- */

  let wheelTimer = 0;
  let wheelFrom = null;
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopAll();
    if (wheelFrom == null) wheelFrom = pos >= 0.5 ? 1 : 0;
    const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const d = raw * (e.deltaMode === 1 ? 33 : 1);
    draw(clamp(pos + d / 900, 0, 1), 1);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      const target = wheelFrom === 0 ? (pos > 0.28 ? 1 : 0) : (pos < 0.72 ? 0 : 1);
      wheelFrom = null;
      spring.set(pos);
      spring.to(target);
    }, 140);
  }, { passive: false });

  /* ---------- 단추·키 ---------- */

  nextBtn.addEventListener('click', () => go(1));
  backBtn.addEventListener('click', () => go(0));
  turnBtns.forEach((b) => b.addEventListener('click', () => {
    turn = b.dataset.turn;
    turnBtns.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    go(pos >= 0.5 ? 0 : 1);
  }));
  document.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(0); }
  });
  picks.forEach((row) => {
    const sheet = row.dataset.for === 'day' ? day : night;
    row.querySelectorAll('[data-ground]').forEach((b) => b.addEventListener('click', () => {
      B.setKind(sheet, b.dataset.ground);
      row.querySelectorAll('[data-ground]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      if (sheet !== (pos >= 0.5 ? night : day) && !flip.active) go(sheet === night ? 1 : 0);
    }));
  });

  window.addEventListener('resize', () => draw(pos));
  draw(0);
})();
