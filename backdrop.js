/*
 * 글결 바탕
 * 이미지 없이 코드로 그리는 장면 바탕. 장(.sheet)마다 바탕 층을 하나 깔고, 지금 보이는 장만 움직인다.
 * 그리는 방식은 셋이다.
 *   gl·2d: 캔버스 한 장(WebGL1 셰이더, 원고지만 Canvas2D)을 프레임마다 다시 그린다.
 *   dom: 흐린 빛 덩이 몇 개를 CSS 애니메이션으로 밀고 간다. 색은 여기서 정해 변수로 얹고, 모양은 backdrop.css.
 *   css: 층을 만들지 않는다. 장의 data-ground를 보고 CSS(backdrop.css, reader.css 끝의 편지지 부분)가 그린다.
 * 라이트
 *   - window(창빛, 기본): 비스듬히 떨어지는 창문 모양의 볕. 구름이 지나가듯 밝기가 숨 쉬듯 바뀐다.
 *   - wongoji(원고지): 칸이 줄지어 놓인 원고지. 바깥 테두리는 겹줄, 빛이 아주 천천히 비스듬히 지나간다.
 *   - leaf(잎그늘): 나뭇잎 사이로 드는 볕. 바람에 잎이 흔들리듯 볕 조각이 느리게 일렁인다.
 *   - dawn(새벽): 아래에서 번져 오르는 옅은 새벽빛과 그 위를 천천히 흐르는 엷은 안개 결.
 * 다크
 *   - projector(영사광, 기본): 바닥 가운데(반전의 축)에서 위로 퍼지는 영사기 빛과 그 안에 떠도는 먼지.
 *   - drape(빛커튼): 아랫단이 밝고 위로 갈수록 바래는 빛의 커튼. 결이 세로로 잘게 일렁인다.
 *   - caustic(물빛): 물에 비친 빛이 천장에 어른거리듯, 위쪽에 흐린 빛 그물이 아주 느리게 일렁인다.
 *   - typing(타자): 어두운 방의 화면. 흐린 글자 덩이가 한 줄씩 타자되고, 줄이 차면 위로 밀려 올라가며 바랜다. 커서는 쉴 때만 깜빡인다.
 * 라이트·다크 둘 다
 *   - letter(편지지, css): 책상 면 위에 글 상자만 한 편지지 한 장. 글줄 아래로 옅은 줄이 그어져 있고 움직이지 않는다.
 *   - plain(단색, css): 장면의 종이색 하나. 아무것도 그리지 않는다.
 *   - aurora(오로라, dom): 주색 빛 덩이 둘과 주색에서 색상을 비튼 덩이 하나가 서로 다른 주기(51·64·43초)로 천천히 밀려다닌다.
 *     위에 고운 낟알과 비껴 든 유리 빛을 얹는다. 라이트에서는 옅게, 다크에서는 빛나게.
 * 포인터(마우스·손가락)를 움직이면 바탕이 그쪽으로 아주 조금, 느리게 따라온다(편지지는 그대로).
 * 바탕 층은 곁에 둘 장(keep)에만 만들고 나머지는 거둬서, 페이지가 많아도 WebGL 문맥이 몇 개만 산다.
 *   곁에 둔 장의 오로라는 멈춰 있고 지금 그리는 장만 흐른다.
 * setSpeed로 흐르는 빠르기를 바꿀 수 있다(머무르기 때 느려짐).
 * 움직임 줄이기 설정이면 한 번만 그리고 멈춘다(오로라는 처음 자세로 선다). WebGL을 못 쓰면 바탕 없이 종이색만 남는다.
 * still(kind, w, h, scene, opts)은 바탕 하나를 w×h 캔버스에 멈춘 한 장면으로 그려 돌려준다(끝 장의 카드 그림).
 *   종이색까지 칠한 완성된 그림이고, 색은 지금 문서의 장면 색과 주색 변수를 산 바탕과 같은 길로 읽는다.
 *   opts.clear([위, 아래], 캔버스 좌표)를 주면 편지지는 그 띠에 줄을 긋지 않는다(카드의 제목 자리).
 */
(function (global) {
  'use strict';

  const M = global.GeulMotion;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const entries = [];
  let raf = 0;
  let last = performance.now();
  let clock = 0;
  let speed = 1;
  let speedTarget = 1;
  let px = 0;
  let py = 0;
  const follow = M ? M.spring2({ stiffness: 12, damping: 8, onUpdate: (x, y) => { px = x; py = y; nudge(); } }) : null;

  /* 종류별 그리는 방식과 해상도(화면 1px당 캔버스 화소) */
  const KINDS = {
    window: { engine: 'gl', scale: () => 0.5 },
    wongoji: { engine: '2d', scale: () => Math.min(2, window.devicePixelRatio || 1) },
    leaf: { engine: 'gl', scale: () => 0.5 },
    dawn: { engine: 'gl', scale: () => 0.4 },
    letter: { engine: 'css' },
    plain: { engine: 'css' },
    aurora: { engine: 'dom' },
    projector: { engine: 'gl', scale: () => 0.6 },
    drape: { engine: 'gl', scale: () => 0.5 },
    caustic: { engine: 'gl', scale: () => 0.8 },
    typing: { engine: 'gl', scale: () => 0.6 }
  };
  /* 다크 장면에만 있는 바탕(still에서 장면을 적지 않았을 때 씀) */
  const NIGHT_ONLY = ['projector', 'drape', 'caustic', 'typing'];
  /* 장면 색 변수가 없는 문서에서 쓸 색 */
  const FALLBACK = { day: { paper: '#ECEDF0', ink: '#2C2F6B' }, night: { paper: '#0E1317', ink: '#DCE1DA' } };

  /* ---------- 셰이더 ---------- */

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const COMMON = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uPtr;
    uniform vec3 uInk;
    uniform vec3 uPaper;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
      return v;
    }
    vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
    vec4 grain(float amt) { float g = hash(vUv * uRes + fract(uTime * 0.37) * 91.0) * amt; return vec4(vec3(g), g); }
  `;

  const FRAG = {
    window: `
      float rect(vec2 q, vec2 h, float s) { vec2 d = abs(q) - h; return 1.0 - smoothstep(-s, s, max(d.x, d.y)); }
      void main() {
        float asp = uRes.x / uRes.y;
        vec2 p = vec2(vUv.x * asp, vUv.y);
        float t = uTime;
        vec2 c = vec2(asp * 0.64, 0.56) + vec2(sin(t * 0.013), cos(t * 0.011)) * 0.03 + uPtr * vec2(0.035, -0.02);
        vec2 q = p - c;
        float an = -0.42;
        q = mat2(cos(an), -sin(an), sin(an), cos(an)) * q;
        q.x += q.y * 0.55;
        float soft = 0.045;
        float win = rect(q, vec2(0.44, 0.31), soft);
        float bar = max(1.0 - smoothstep(0.012, 0.012 + soft, abs(q.x)), 1.0 - smoothstep(0.012, 0.012 + soft, abs(q.y)));
        float light = win * (1.0 - bar * 0.8);
        light *= 0.68 + 0.32 * fbm(vec2(t * 0.03, 0.0) + q * 1.3);
        vec4 warm = vec4(vec3(1.0, 0.975, 0.92) * light * 0.34, light * 0.34);
        float edge = smoothstep(0.25, 1.15, length(vUv - 0.5) * 1.6);
        float shadeA = 0.045 * (1.0 - light) + 0.035 * edge;
        gl_FragColor = over(warm, vec4(uInk * shadeA, shadeA));
      }
    `,
    leaf: `
      void main() {
        float asp = uRes.x / uRes.y;
        vec2 p = vec2(vUv.x * asp, vUv.y) + uPtr * vec2(0.03, -0.02);
        float t = uTime * 0.05;
        vec2 w = vec2(fbm(p * 1.4 + vec2(t, 0.0)), fbm(p * 1.4 + vec2(0.0, t * 0.8) + 5.0));
        float n = fbm(p * 3.2 + w * 1.6 + vec2(t * 0.6, -t * 0.4));
        float spots = smoothstep(0.5, 0.66, n) * (0.7 + 0.3 * fbm(p * 0.7 + t * 0.2));
        float shade = (1.0 - spots) * (0.05 + 0.05 * fbm(p * 1.1 - t * 0.3));
        vec4 sun = vec4(vec3(1.0, 0.97, 0.86) * spots * 0.32, spots * 0.32);
        float edge = 0.03 * smoothstep(0.3, 1.2, length(vUv - 0.5) * 1.6);
        gl_FragColor = over(sun, vec4(uInk * (shade + edge), shade + edge));
      }
    `,
    dawn: `
      void main() {
        float asp = uRes.x / uRes.y;
        vec2 p = vec2(vUv.x * asp, vUv.y);
        float t = uTime * 0.015;
        float h = vUv.y + uPtr.y * 0.01;
        float glow = exp(-h * 2.4);
        float haze = fbm(vec2(p.x * 0.8 + t, h * 3.0 - t * 0.5));
        vec3 warm = mix(vec3(1.0, 0.84, 0.70), vec3(0.97, 0.93, 0.88), smoothstep(0.0, 0.55, h));
        float a = glow * (0.30 + 0.14 * haze);
        float bands = 0.035 * smoothstep(0.45, 0.75, fbm(vec2(p.x * 0.5 - t * 0.7, h * 8.0)));
        gl_FragColor = over(vec4(warm * a, a), vec4(uInk * bands, bands));
      }
    `,
    drape: `
      void main() {
        float asp = uRes.x / uRes.y;
        float y = 1.0 - vUv.y;
        float x = vUv.x * asp + uPtr.x * 0.03;
        float t = uTime * 0.02;
        vec3 acc = vec3(0.0);
        float A = 0.0;
        for (int k = 0; k < 2; k++) {
          float fk = float(k);
          float warp = fbm(vec2(x * 0.55 + t + fk * 4.0, t * 0.35 + fk)) - 0.5;
          float xx = x + warp * 1.4;
          float edge = 0.24 + fk * 0.09 + 0.18 * (fbm(vec2(xx * 0.9 + fk * 2.0, t * 0.5)) - 0.5) + uPtr.y * 0.012;
          float above = edge - y;
          float lower = smoothstep(-0.035, 0.0, above);
          float body = lower * (0.35 * exp(-max(above, 0.0) * 3.0) + 0.65 * exp(-max(above, 0.0) * 14.0));
          float rays = 0.4 + 0.6 * fbm(vec2(xx * 22.0, t * 2.0 + fk * 3.0));
          float patchy = 0.25 + 0.75 * smoothstep(0.22, 0.6, fbm(vec2(xx * 0.8 - t * 0.5, fk * 7.0)));
          float I = body * rays * patchy * (1.0 - fk * 0.35);
          vec3 col = mix(vec3(0.42, 0.80, 0.66), vec3(0.55, 0.46, 0.82), smoothstep(0.02, 0.24, above));
          acc += col * I;
          A += I;
        }
        float a = clamp(A * 0.62, 0.0, 0.62);
        vec3 col = acc / max(A, 0.001);
        float vig = 0.14 * smoothstep(0.35, 1.2, length(vUv - vec2(0.5, 0.45)) * 1.5);
        vec4 c = over(vec4(col * a, a), vec4(vec3(0.0), vig));
        gl_FragColor = over(grain(0.035), c);
      }
    `,
    projector: `
      void main() {
        float asp = uRes.x / uRes.y;
        vec2 p = vec2(vUv.x * asp, vUv.y);
        vec2 o = vec2(0.5 * asp, -0.06);
        vec2 d = p - o;
        float ang = atan(d.x, d.y) + uPtr.x * 0.04;
        float r = length(d);
        float t = uTime;
        float cone = smoothstep(0.44, 0.08, abs(ang));
        float fall = exp(-r * 0.95);
        float haze = 0.5 + 0.5 * fbm(vec2(p.x * 2.4, p.y * 1.5 - t * 0.022));
        float flick = 0.94 + 0.06 * noise(vec2(t * 7.0, 0.0));
        float I = cone * fall * haze * flick * 0.17;
        float dust = 0.0;
        for (int L = 0; L < 3; L++) {
          float fl = float(L);
          float sc = 16.0 + fl * 13.0;
          vec2 q = p * sc + vec2(sin(t * 0.07 + fl) * 2.0, -t * (0.18 + fl * 0.07));
          vec2 id = floor(q);
          vec2 f = fract(q) - 0.5;
          float h = hash(id + fl * 7.1);
          vec2 off = vec2(hash(id + 3.3), hash(id + 9.1)) - 0.5;
          float m = smoothstep(0.07, 0.0, length(f - off * 0.7)) * step(0.88, h);
          dust += m * (0.45 + 0.55 * sin(t * 1.3 + h * 40.0));
        }
        I += max(dust, 0.0) * cone * fall * 0.55;
        float a = clamp(I, 0.0, 1.0);
        float vig = 0.25 * smoothstep(0.3, 1.2, length(vUv - vec2(0.5, 0.3)) * 1.4);
        vec4 c = over(vec4(vec3(1.0, 0.94, 0.82) * a, a), vec4(vec3(0.0), vig));
        gl_FragColor = over(grain(0.045), c);
      }
    `,
    caustic: `
      float web(vec2 uv, float t) {
        vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
        vec2 i = p;
        float c = 1.0;
        float inten = 0.005;
        for (int n = 0; n < 5; n++) {
          float tt = t * (1.0 - 3.5 / float(n + 1));
          i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
        }
        c /= 5.0;
        c = 1.17 - pow(c, 1.4);
        return pow(abs(c), 8.0);
      }
      void main() {
        float asp = uRes.x / uRes.y;
        vec2 uv = vec2(vUv.x * asp, vUv.y) * 0.95 + uPtr * 0.01;
        float t = uTime * 0.06 + 23.0;
        float c = web(uv, t);
        float top = smoothstep(0.0, 0.85, vUv.y);
        float drift = 0.6 + 0.4 * fbm(vec2(vUv.x * 2.0 + uTime * 0.005, vUv.y * 1.5));
        float a = clamp(c * 0.34 * top * drift, 0.0, 0.4);
        vec4 light = vec4(vec3(0.78, 0.90, 1.0) * a, a);
        float vig = 0.2 * smoothstep(0.35, 1.2, length(vUv - vec2(0.5, 0.55)) * 1.5);
        vec4 col = over(light, vec4(vec3(0.0), vig));
        gl_FragColor = over(grain(0.035), col);
      }
    `,
    typing: `
      float box(vec2 q, vec2 h, float s) { vec2 d = abs(q) - h; return 1.0 - smoothstep(-s, s, max(d.x, d.y)); }
      void main() {
        float asp = uRes.x / uRes.y;
        vec2 p = vec2(vUv.x * asp, 1.0 - vUv.y) + uPtr * vec2(0.02, 0.012);
        float t = uTime;
        float rh = 0.085;
        float cw = 0.05;
        float cols = floor(asp * 0.84 / cw);
        float x0 = (asp - cols * cw) * 0.5;
        float now = t / 7.0;
        float cur = floor(now);
        float fr = fract(now);
        float lift = rh * (1.0 - smoothstep(0.0, 0.08, fr));
        float k = (p.y - 0.64 - lift) / rh;
        float row = floor(k + 0.5);
        float ly = (k - row) * rh;
        float line = cur + row;
        float c = floor((p.x - x0) / cw);
        float lx = p.x - x0 - (c + 0.5) * cw;
        float len = floor(cols * (0.45 + 0.5 * hash(vec2(line, 3.1))));
        float typed = line < cur ? len : floor(min(fr / 0.8, 1.0) * len);
        float inRow = step(0.0, c) * step(c, cols - 1.0) * step(row, 0.0) * step(-8.0, row);
        float space = step(hash(vec2(line, c)), 0.17) * step(1.0, c);
        float on = inRow * step(c, typed - 1.0) * (1.0 - space);
        float tall = 0.75 + 0.25 * hash(vec2(c, line + 7.0));
        float g = box(vec2(lx, ly), vec2(cw * 0.34, rh * 0.25 * tall), 0.007) * on;
        float fresh = 1.0 + 1.4 * step(cur, line) * step(typed - 1.0, c) * (1.0 - smoothstep(0.0, 0.02, fr - (typed / len) * 0.8));
        float fade = exp(-(cur - line) * 0.32) * smoothstep(0.02, 0.3, p.y);
        float blink = fr < 0.8 ? 1.0 : step(0.5, fract(t * 1.1));
        float cursor = box(vec2(lx + cw * 0.38, ly), vec2(0.004, rh * 0.32), 0.003) * step(cur, line) * step(line, cur) * step(typed, c) * step(c, typed) * blink;
        float I = g * 0.075 * fade * fresh + cursor * 0.24;
        I *= 0.86 + 0.14 * sin(vUv.y * uRes.y * 1.4);
        float glow = 0.05 * exp(-length((vUv - vec2(0.5, 0.45)) * vec2(1.0, 1.3)) * 2.4) * (0.96 + 0.04 * noise(vec2(t * 6.0, 0.0)));
        vec3 phos = mix(uInk, vec3(0.62, 0.95, 0.78), 0.55);
        float a = clamp(I + glow, 0.0, 0.5);
        float vig = 0.24 * smoothstep(0.3, 1.2, length(vUv - 0.5) * 1.5);
        vec4 col = over(vec4(phos * a, a), vec4(vec3(0.0), vig));
        gl_FragColor = over(grain(0.04), col);
      }
    `
  };

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[글결 바탕]', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program(e) {
    const gl = e.gl;
    if (e.programs[e.kind]) return e.programs[e.kind];
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, COMMON + FRAG[e.kind]);
    if (!vs || !fs) return null;
    const pr = gl.createProgram();
    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.bindAttribLocation(pr, 0, 'aPos');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    const u = {};
    ['uRes', 'uTime', 'uPtr', 'uInk', 'uPaper'].forEach((n) => { u[n] = gl.getUniformLocation(pr, n); });
    e.programs[e.kind] = { pr, u };
    return e.programs[e.kind];
  }

  /* 화면 전체를 덮는 사각형 하나를 올려 둔 WebGL 문맥 */
  function glContext(canvas, keep) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: !!keep });
    if (!gl) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return gl;
  }

  function loseGl(gl) {
    const lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  }

  /* ---------- 색 ---------- */

  /* '#RGB'·'#RRGGBB'·'rgb(…)' → [0~1, 0~1, 0~1]. 읽을 수 없으면 null */
  function parse(str) {
    const c = (str || '').trim();
    if (c[0] === '#') {
      const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
      const n = parseInt(h, 16);
      if (Number.isNaN(n)) return null;
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map((s) => parseFloat(s) / 255);
    return null;
  }
  const rgb = (str) => parse(str) || [0.1, 0.1, 0.1];
  const css = (c, a) => `rgba(${c.map((v) => Math.round(v * 255)).join(',')},${a == null ? 1 : a})`;
  const mixC = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  function toHsl([r, g, b]) {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    const d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return [(h + 360) % 360, s, l];
  }

  function fromHsl(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)];
  }

  function readColors(e) {
    const cs = getComputedStyle(e.sheet);
    e.ink = rgb(cs.getPropertyValue('--ink'));
    e.paper = rgb(cs.getPropertyValue('--paper'));
  }

  /*
   * 장이 없을 때 장면 색 읽기: data-scene을 단 빈 요소를 잠깐 붙여 읽기 틀의 장면 변수를 그대로 받는다.
   * 장면 변수가 없는 문서(편집실 등)에서는 주색 변수(--theme-*, --night-*)를, 그것도 없으면 FALLBACK을 쓴다.
   */
  function sceneColors(scene) {
    const night = scene === 'night';
    const probe = document.createElement('i');
    probe.dataset.scene = night ? 'night' : 'day';
    probe.hidden = true;
    (document.body || document.documentElement).append(probe);
    const cs = getComputedStyle(probe);
    const get = (n) => cs.getPropertyValue(n).trim();
    const own = parse(get('--paper'));
    const paper = own || parse(night ? get('--theme-night-paper') || get('--night-paper') : '') || parse(FALLBACK[probe.dataset.scene].paper);
    const ink = (own && parse(get('--ink'))) || parse(night ? get('--theme-night-ink') || get('--night-ink') : get('--theme-ink') || get('--ink')) || parse(FALLBACK[probe.dataset.scene].ink);
    probe.remove();
    return { paper, ink };
  }

  /* 주색: 편집실이 고른 --theme-ink, 없으면 라이트 장면의 먹 */
  function themeInk() {
    return parse(getComputedStyle(document.documentElement).getPropertyValue('--theme-ink')) || sceneColors('day').ink;
  }

  /* ---------- 오로라 ---------- */

  /*
   * 빛 덩이 셋의 색(0~1 rgb)과 세기. 1·3은 주색의 색상, 2는 주색에서 색상을 비튼 장식색.
   * 무채색에 가까운 주색도 빛으로 보이게 채도에 바닥을 둔다. 라이트는 옅게, 다크는 밝고 세게.
   */
  function auroraTones(theme, night) {
    const [h, s0] = toHsl(theme);
    const s = Math.min(0.8, Math.max(night ? 0.5 : 0.34, s0 * 1.3));
    const deco = (h + 322) % 360;
    if (night) {
      return [
        { c: fromHsl(h, s, 0.62), a: 0.62 },
        { c: fromHsl(deco, s, 0.62), a: 0.5 },
        { c: fromHsl(h, s * 0.85, 0.72), a: 0.34 }
      ];
    }
    return [
      { c: fromHsl(h, s, 0.48), a: 0.36 },
      { c: fromHsl(deco, s, 0.6), a: 0.34 },
      { c: fromHsl(h, s * 0.85, 0.58), a: 0.22 }
    ];
  }

  /* 빛 덩이 자리(정사각형 빛 판에 대한 비율, backdrop.css의 .au-1~3과 같음). still에서 씀 */
  const BLOBS = [
    { x: -0.3, y: -0.45, w: 1.1, h: 0.8 },
    { x: 0.38, y: -0.1, w: 1.0, h: 0.95 },
    { x: -0.1, y: 0.7, w: 0.9, h: 0.9 }
  ];

  function buildAurora(e) {
    const layer = document.createElement('div');
    layer.className = 'ground ground-aurora';
    layer.setAttribute('aria-hidden', 'true');
    const field = document.createElement('i');
    field.className = 'au-field';
    [1, 2, 3].forEach((k) => {
      const b = document.createElement('i');
      b.className = 'au au-' + k;
      field.append(b);
    });
    const grain = document.createElement('i');
    grain.className = 'au-grain';
    const glass = document.createElement('i');
    glass.className = 'au-glass';
    layer.append(field, grain, glass);
    /* 자세는 문서 시계에 맞춰 정한다. 장마다 다르고, 거뒀다 다시 만들어도 처음 자세로 돌아가지 않는다 */
    const t = (performance.now() + entries.indexOf(e) * 17000) / 1000;
    layer.style.setProperty('--au-t', (-t).toFixed(2) + 's');
    e.sheet.prepend(layer);
    e.node = layer;
    e.field = field;
    paintAurora(e);
    rate(e);
  }

  function paintAurora(e) {
    if (!e.node) return;
    e.node.style.setProperty('--au-size', Math.max(e.sheet.clientWidth, e.sheet.clientHeight) * 1.06 + 'px');
    const night = e.sheet.dataset.scene === 'night';
    auroraTones(themeInk(), night).forEach((t, i) => e.node.style.setProperty('--au-' + (i + 1), css(t.c, t.a)));
  }

  function rate(e) {
    if (!e.node || !e.node.getAnimations) return;
    e.node.getAnimations({ subtree: true }).forEach((a) => a.updatePlaybackRate(speedTarget));
  }

  /* 포인터를 따라 빛 덩이 판을 조금 옮긴다 */
  function nudge() {
    entries.forEach((e) => {
      if (e.field && e.active) e.field.style.transform = `translate3d(${(px * 1.2).toFixed(3)}%, ${(py * 0.9).toFixed(3)}%, 0)`;
    });
  }

  /* ---------- 원고지 ---------- */

  function rand(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* 칸 크기는 장의 짧은 변에 맞춘다. 칸 줄 사이에 좁은 띠를 두고, 바깥은 겹줄로 두른다 */
  function buildWongoji(e) {
    const pad = Math.round(28 * e.scale);
    const w = e.w + pad * 2;
    const h = e.h + pad * 2;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const c = off.getContext('2d');
    const r = rand(20261011);
    const ink = e.ink.map((v) => Math.round(v * 255)).join(',');
    const rule = '178,84,64';

    for (let i = 0; i < 40; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = (60 + r() * 180) * e.scale;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      const light = r() < 0.6;
      g.addColorStop(0, light ? 'rgba(255,255,255,0.10)' : `rgba(${ink},0.018)`);
      g.addColorStop(1, light ? 'rgba(255,255,255,0)' : `rgba(${ink},0)`);
      c.fillStyle = g;
      c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    const cell = Math.max(26 * e.scale, Math.round(Math.min(e.w, e.h) / 16));
    const gap = Math.round(cell * 0.32);
    const band = cell + gap;
    const cols = Math.floor((e.w - cell * 1.6) / cell);
    const rows = Math.floor((e.h - cell * 1.6 + gap) / band);
    const gw = cols * cell;
    const gh = rows * band - gap;
    const x0 = Math.round(pad + (e.w - gw) / 2) + 0.5;
    const y0 = Math.round(pad + (e.h - gh) / 2) + 0.5;
    const lw = Math.max(1, e.scale * 0.8);

    c.lineWidth = lw;
    c.strokeStyle = `rgba(${rule},0.16)`;
    c.beginPath();
    for (let j = 0; j < rows; j++) {
      const y = y0 + j * band;
      c.moveTo(x0, y);
      c.lineTo(x0 + gw, y);
      c.moveTo(x0, y + cell);
      c.lineTo(x0 + gw, y + cell);
      for (let i = 1; i < cols; i++) {
        const x = x0 + i * cell;
        c.moveTo(x, y);
        c.lineTo(x, y + cell);
      }
    }
    c.stroke();

    const o = Math.round(cell * 0.28);
    c.strokeStyle = `rgba(${rule},0.24)`;
    c.lineWidth = lw * 1.6;
    c.strokeRect(x0 - o, y0 - o, gw + o * 2, gh + o * 2);
    c.lineWidth = lw;
    c.strokeRect(x0 - o + lw * 3, y0 - o + lw * 3, gw + o * 2 - lw * 6, gh + o * 2 - lw * 6);
    e.off = { off, pad };
  }

  function drawWongoji(e, t, ptr) {
    const { ctx, w, h } = e;
    if (!e.off) buildWongoji(e);
    const { off, pad } = e.off;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(off, -pad + ptr[0] * pad * 0.4, -pad + ptr[1] * pad * 0.4);
    const s = ((t * 0.000012) % 1.6) - 0.3;
    const g = ctx.createLinearGradient(w * (s - 0.35), 0, w * (s + 0.35), h);
    g.addColorStop(0, 'rgba(255,250,238,0)');
    g.addColorStop(0.5, 'rgba(255,250,238,0.14)');
    g.addColorStop(1, 'rgba(255,250,238,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    const ink = e.ink.map((x) => Math.round(x * 255)).join(',');
    v.addColorStop(0, `rgba(${ink},0)`);
    v.addColorStop(1, `rgba(${ink},0.05)`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---------- 바탕 층 ---------- */

  function drop(e) {
    e.built = false;
    if (!e.node) return;
    if (e.gl) loseGl(e.gl);
    e.node.remove();
    e.node = null;
    e.field = null;
    e.gl = null;
    e.ctx = null;
    e.programs = {};
    e.off = null;
  }

  function build(e) {
    drop(e);
    e.built = true;
    e.engine = KINDS[e.kind].engine;
    if (e.kind === 'wongoji' && e.sheet.querySelector('.ln')) { e.engine = 'css'; return; }
    if (e.engine === 'css') return;
    if (e.engine === 'dom') { buildAurora(e); return; }
    const canvas = document.createElement('canvas');
    canvas.className = 'ground';
    canvas.setAttribute('aria-hidden', 'true');
    e.sheet.prepend(canvas);
    e.node = canvas;
    if (e.engine === 'gl') e.gl = glContext(canvas, false);
    else e.ctx = canvas.getContext('2d');
    size(e);
  }

  function size(e) {
    if (!e.node) return;
    if (e.engine === 'dom') { paintAurora(e); return; }
    const r = e.sheet.getBoundingClientRect();
    e.scale = KINDS[e.kind].scale();
    const w = Math.max(1, Math.round(r.width * e.scale));
    const h = Math.max(1, Math.round(r.height * e.scale));
    if (e.node.width !== w || e.node.height !== h) {
      e.node.width = w;
      e.node.height = h;
      e.off = null;
    }
    e.w = w;
    e.h = h;
    readColors(e);
  }

  function drawGl(e, t, ptr) {
    const gl = e.gl;
    if (!gl) return;
    const P = program(e);
    if (!P) return;
    gl.viewport(0, 0, e.w, e.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(P.pr);
    gl.uniform2f(P.u.uRes, e.w, e.h);
    gl.uniform1f(P.u.uTime, t / 1000);
    gl.uniform2f(P.u.uPtr, ptr[0], ptr[1]);
    gl.uniform3fv(P.u.uInk, e.ink);
    gl.uniform3fv(P.u.uPaper, e.paper);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- 그리기 순환 ---------- */

  function frame(now) {
    raf = 0;
    const dt = Math.min(64, now - last);
    last = now;
    speed += (speedTarget - speed) * Math.min(1, dt / 400);
    clock += dt * speed;
    const t = clock;
    let any = false;
    entries.forEach((e) => {
      if (!e.active || !e.node || e.engine === 'dom') return;
      any = true;
      if (e.engine === 'gl') drawGl(e, t, [px, py]);
      else drawWongoji(e, t, [px, py]);
    });
    if (any && !reduce.matches) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function find(sheet) { return entries.find((e) => e.sheet === sheet); }

  /* 장을 등록하고 data-ground에 바탕 종류를 적는다. 층은 setActive의 keep에 들 때 만든다 */
  function mount(sheet, kind) {
    const e = { sheet, kind: KINDS[kind] ? kind : 'window', active: false, built: false, programs: {}, node: null };
    sheet.dataset.ground = e.kind;
    entries.push(e);
    return e;
  }

  /* 장의 바탕 종류를 바꾼다. 둘 다 셰이더면 캔버스를 그대로 쓰고, 아니면 층을 새로 만든다 */
  function setKind(sheet, kind) {
    const e = find(sheet);
    if (!e || !KINDS[kind] || e.kind === kind) return;
    const sameGl = KINDS[kind].engine === 'gl' && e.engine === 'gl' && e.node;
    e.kind = kind;
    sheet.dataset.ground = kind;
    if (!e.built) return;
    if (sameGl) size(e);
    else build(e);
    setLive(e);
    kick();
  }

  /* 오로라는 지금 그리는 장만 흐르게 한다 */
  function setLive(e) {
    if (e.engine === 'dom' && e.node) e.node.classList.toggle('is-live', e.active);
  }

  /* sheets: 지금 그릴 장들. keep: 층을 남겨 둘 장들(생략하면 sheets와 같음). 둘 다에 없는 장의 층은 거둔다 */
  function setActive(sheets, keep) {
    const hold = keep || sheets;
    let changed = false;
    entries.forEach((e) => {
      const on = sheets.includes(e.sheet);
      const held = on || hold.includes(e.sheet);
      if (held && !e.built) { build(e); changed = true; }
      if (!held && e.built) drop(e);
      if (on && !e.active) { size(e); changed = true; }
      if (on !== e.active) changed = true;
      e.active = on;
      setLive(e);
    });
    if (changed) kick();
  }

  function setSpeed(k) {
    speedTarget = k;
    entries.forEach(rate);
    kick();
  }

  function pointer(nx, ny) {
    if (follow) follow.to(nx, ny);
    if (reduce.matches) kick();
  }

  function refresh() {
    entries.forEach(size);
    kick();
  }

  window.addEventListener('resize', refresh);

  /* ---------- 멈춘 한 장면(still) ---------- */

  const STILL_T = 24000;

  function stillGl(kind, out, colors) {
    const tmp = document.createElement('canvas');
    tmp.width = out.width;
    tmp.height = out.height;
    const gl = glContext(tmp, true);
    if (!gl) return;
    const e = { kind, gl, w: tmp.width, h: tmp.height, programs: {}, ink: colors.ink, paper: colors.paper };
    drawGl(e, STILL_T, [0, 0]);
    if (e.programs[kind]) out.getContext('2d').drawImage(tmp, 0, 0);
    loseGl(gl);
  }

  function stillWongoji(out, colors) {
    const tmp = document.createElement('canvas');
    tmp.width = out.width;
    tmp.height = out.height;
    const e = { ctx: tmp.getContext('2d'), w: tmp.width, h: tmp.height, scale: 1, ink: colors.ink };
    drawWongoji(e, STILL_T, [0, 0]);
    out.getContext('2d').drawImage(tmp, 0, 0);
  }

  /* 고운 낟알 한 장(회색 잡음 타일). 오로라에는 overlay로, 편지지에는 곱하기·스크린으로 얹는다 */
  function grainTile(seed) {
    const n = 128;
    const tile = document.createElement('canvas');
    tile.width = tile.height = n;
    const c = tile.getContext('2d');
    const img = c.createImageData(n, n);
    const r = rand(seed);
    for (let i = 0; i < n * n; i++) {
      const v = Math.round(128 + (r() + r() - 1) * 64);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return tile;
  }

  function stillAurora(out, colors, night) {
    const c = out.getContext('2d');
    const { width: w, height: h } = out;
    /* 빛 덩이: 흐르는 길의 3할쯤 와 있는 자세(backdrop.css의 keyframes와 같은 길) */
    const moves = [[0.18, 0.07, 1.04], [-0.16, 0.13, 1.04], [0.24, -0.17, 1.09]];
    auroraTones(themeInk(), night).forEach((t, i) => {
      const b = BLOBS[i];
      const [mx, my, sc] = moves[i];
      const side = Math.max(w, h) * 1.06;
      const bw = b.w * side;
      const bh = b.h * side;
      const cx = (w - side) / 2 + b.x * side + bw / 2 + mx * bw;
      const cy = (h - side) / 2 + b.y * side + bh / 2 + my * bh;
      c.save();
      c.globalCompositeOperation = night ? 'screen' : 'source-over';
      c.translate(cx, cy);
      c.scale((bw / 2) * sc, (bh / 2) * sc);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      [[0, 1], [0.22, 0.78], [0.46, 0.46], [0.7, 0.18], [1, 0]].forEach(([at, k]) => g.addColorStop(at, css(t.c, t.a * k)));
      c.fillStyle = g;
      c.fillRect(-1, -1, 2, 2);
      c.restore();
    });
    c.save();
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = night ? 0.3 : 0.22;
    c.fillStyle = c.createPattern(grainTile(4127), 'repeat');
    c.fillRect(0, 0, w, h);
    c.restore();
    const L = Math.hypot(w, h);
    const gl = c.createLinearGradient(w / 2 - Math.cos(0.49) * L / 2, h / 2 - Math.sin(0.49) * L / 2, w / 2 + Math.cos(0.49) * L / 2, h / 2 + Math.sin(0.49) * L / 2);
    const hi = night ? 0.07 : 0.22;
    [[0, hi], [0.34, hi * 0.18], [0.52, 0], [0.78, hi * 0.45], [1, 0]].forEach(([at, a]) => gl.addColorStop(at, `rgba(255,255,255,${a})`));
    c.fillStyle = gl;
    c.fillRect(0, 0, w, h);
    vignette(c, w, h, night ? 0.3 : 0.1);
  }

  function vignette(c, w, h, a) {
    const v = c.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.45, w / 2, h * 0.46, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${a})`);
    c.fillStyle = v;
    c.fillRect(0, 0, w, h);
  }

  /* 편지지: 책상 면 가운데에 줄 그은 종이 한 장(backdrop.css의 편지지와 같은 섞음). clear 띠([위, 아래])에는 줄을 긋지 않는다 */
  function stillLetter(out, colors, night, clear) {
    const c = out.getContext('2d');
    const { width: w, height: h } = out;
    const { paper, ink } = colors;
    const desk = night ? mixC(paper, [0, 0, 0], 0.22) : mixC(paper, ink, 0.09);
    const sheet = night ? mixC(paper, ink, 0.1) : mixC(paper, [1, 1, 1], 0.62);
    c.fillStyle = css(desk);
    c.fillRect(0, 0, w, h);
    vignette(c, w, h, night ? 0.28 : 0.06);
    const ph = Math.round(h * 0.84);
    const pw = Math.round(Math.min(w * 0.86, Math.max(ph * 0.78, w * 0.62)));
    const x = Math.round((w - pw) / 2);
    const y = Math.round((h - ph) / 2);
    const u = Math.min(w, h) / 630;
    c.save();
    c.shadowColor = night ? 'rgba(0,0,0,0.55)' : css(ink, 0.2);
    c.shadowBlur = 44 * u;
    c.shadowOffsetY = 18 * u;
    c.fillStyle = css(sheet);
    c.fillRect(x, y, pw, ph);
    c.restore();
    c.save();
    c.shadowColor = night ? 'rgba(0,0,0,0.4)' : css(ink, 0.12);
    c.shadowBlur = 3 * u;
    c.shadowOffsetY = 1 * u;
    c.fillStyle = css(sheet);
    c.fillRect(x, y, pw, ph);
    c.restore();
    c.save();
    c.beginPath();
    c.rect(x, y, pw, ph);
    c.clip();
    c.globalCompositeOperation = night ? 'screen' : 'multiply';
    c.globalAlpha = night ? 0.05 : 0.06;
    c.fillStyle = c.createPattern(grainTile(2027), 'repeat');
    c.fillRect(x, y, pw, ph);
    c.restore();
    const gap = Math.max(14, Math.round(ph / 14));
    const mx = Math.round(pw * 0.07);
    c.fillStyle = night ? css(ink, 0.12) : css(ink, 0.14);
    for (let ry = y + gap * 1.6; ry < y + ph - gap * 0.9; ry += gap) {
      const ly = Math.round(ry);
      if (clear && ly >= clear[0] && ly <= clear[1]) continue;
      c.fillRect(x + mx, ly, pw - mx * 2, Math.max(1, Math.round(u)));
    }
    c.fillStyle = night ? css(ink, 0.1) : css(ink, 0.12);
    c.fillRect(x, y, pw, Math.max(1, Math.round(u)));
  }

  /*
   * 바탕 kind를 w×h 캔버스에 멈춘 한 장면으로 그린다. scene은 'day'|'night'(없으면 바탕으로 짐작). opts.clear는 편지지의 줄 없는 띠.
   * 종이색을 먼저 칠하고 그 위에 바탕을 얹은 완성된 그림을 돌려준다. 셰이더 바탕은 잠깐 쓴 WebGL 문맥을 바로 놓는다.
   * WebGL을 못 쓰면 산 바탕처럼 종이색만 남은 그림, 모르는 바탕이거나 캔버스를 못 만들면 null.
   */
  function still(kind, w, h, scene, opts) {
    try {
      if (!KINDS[kind]) return null;
      const W = Math.max(1, Math.round(w || 0));
      const H = Math.max(1, Math.round(h || 0));
      const night = scene ? scene === 'night' : NIGHT_ONLY.includes(kind);
      const colors = sceneColors(night ? 'night' : 'day');
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const c = out.getContext('2d');
      if (!c) return null;
      c.fillStyle = css(colors.paper);
      c.fillRect(0, 0, W, H);
      const engine = KINDS[kind].engine;
      if (engine === 'gl') stillGl(kind, out, colors);
      else if (engine === '2d') stillWongoji(out, colors);
      else if (kind === 'aurora') stillAurora(out, colors, night);
      else if (kind === 'letter') stillLetter(out, colors, night, opts && Array.isArray(opts.clear) ? opts.clear : null);
      return out;
    } catch (err) {
      return null;
    }
  }

  /* 넘김 파편이 같은 순간의 바탕을 공유한다. WebGL은 읽기 직전에 다시 그려 버퍼를 확보한다. */
  function snapshot(sheet) {
    const e = entries.find((item) => item.sheet === sheet);
    if (!e || !e.node || !['gl', '2d'].includes(e.engine)) return null;
    if (e.engine === 'gl') drawGl(e, clock, [px, py]);
    const out = document.createElement('canvas');
    out.width = e.node.width;
    out.height = e.node.height;
    out.getContext('2d').drawImage(e.node, 0, 0);
    return out;
  }

  global.GeulBackdrop = { snapshot, KINDS, mount, setKind, setActive, setSpeed, pointer, refresh, still };
})(typeof window !== 'undefined' ? window : globalThis);
