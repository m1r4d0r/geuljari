/*
 * 글결 효과 견본
 * 읽기 틀에 들어 있는 효과를 실제로 움직여 보여 준다.
 * 저절로 붙는 효과와 블록으로 지정하는 효과는 엔진과 fx.js를 그대로 써서 읽기 틀과 똑같이 움직이고,
 * 아직 읽기 틀에 없는 후보만 이 파일 안에서 따로 움직인다.
 * 줄이 화면에 들어오면 한 번 저절로 움직이고, 다시를 누르거나 글을 누르면 되풀이한다.
 * 고르기로 표시한 효과는 아래 막대에서 목록으로 복사할 수 있다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const G = window.GeulFx;
  if (!E || !G) return;

  const main = document.getElementById('specimen');
  const pickedEl = document.getElementById('picked');
  const copyBtn = document.getElementById('copy-picks');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const PICKS = 'geulgyeol.picks';
  const STATUS = { now: '저절로', block: '블록 지정', idea: '후보' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장할 수 없는 환경에서는 넘어간다 */ } }
  };

  /* 견본 페이지의 낮밤을 바꾼다. 처음에는 보는 사람의 밝기 설정을 따른다. */
  function toggleScene() {
    const root = document.documentElement;
    const theme = root.getAttribute('data-theme');
    const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const now = root.getAttribute('data-scene') || (dark ? 'night' : 'day');
    root.setAttribute('data-scene', now === 'night' ? 'day' : 'night');
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 읽기 틀과 같은 엔진·같은 그리기로 움직이는 견본 */
  function engine(src) {
    return (stage) => {
      const para = E.parse(src).paragraphs.find((p) => !p.sceneOnly);
      const inner = el('div', 'inner');
      stage.append(inner);
      const { items } = G.buildParagraph(para, inner);
      return G.timeline(items);
    };
  }

  /* 후보 견본용: 한 줄을 어절(.tk)과 글자(.ch)로 나눠 넣는다. */
  function writeLine(parent, text) {
    const line = el('div', 'ln');
    const chars = [];
    text.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { line.append(el('span', 'sp', part)); return; }
      const tk = el('span', 'tk');
      E.graphemes(part).forEach((c) => {
        const s = el('span', 'ch', c);
        tk.append(s);
        chars.push(s);
      });
      line.append(tk);
    });
    parent.append(line);
    return { line, chars };
  }

  function steps(list) {
    const timers = list.map(([ms, fn]) => setTimeout(fn, ms));
    return { cancel() { timers.forEach(clearTimeout); } };
  }

  /* ---------- 효과 목록 ---------- */

  const GROUPS = [
    {
      title: '글자가 오는 방식',
      items: [
        {
          id: 'fade', name: '스밈', status: 'now',
          desc: '보통 문단에 저절로 쓰임. 고른 속도로 옅게 떠오르고, 마침표 뒤에서 조금 더 쉬며, 문단이 길수록 조금 빨라짐',
          play: engine('창문을 열자 젖은 공기가 방 안으로 천천히 들어왔다. 종이 끝이 조금 들렸다가 가라앉았다. 나는 펜을 내려놓았다.')
        },
        {
          id: 'rise', name: '떠오름', status: 'block', syntax: '{{…}}',
          desc: '이름 없이 감싸면 이 효과. 한 번 쉬고 문장마다(줄이 바뀌면 줄마다) 한꺼번에 아래에서 떠오르며 초점이 맞고, 잠시 쪽빛으로 젖었다 마름',
          play: engine('오래 망설였다.\n{{그래도 나는 거기 있었다. 끝까지.\n네가 몰랐더라도.}}')
        },
        {
          id: 'bleed', name: '번짐', status: 'block', syntax: '{{번짐:…}}',
          desc: '흐린 얼룩에서 글자가 또렷해짐. 회상이나 꿈 장면',
          play: engine('그 이름은 {{번짐:아직 마르지 않았다.}}')
        },
        {
          id: 'type', name: '타자', status: 'block', syntax: '{{타자:…}}',
          desc: '자판을 치듯 들쭉날쭉 찍히고 커서가 따라감. 메시지, 기록, 편지',
          play: engine('{{타자:받는 사람: 아직 정하지 못함}}')
        },
        {
          id: 'focus', name: '초점', status: 'block', syntax: '{{초점:…}}',
          desc: '블록 전체가 흐릿하게 한꺼번에 놓이고 천천히 초점이 맞음. 기억이 돌아오는 순간',
          play: engine('{{초점:어디선가 본 적 있는 골목이었다.}}')
        },
        {
          id: 'gather', name: '모여듦', status: 'block', syntax: '{{모여듦:…}}',
          desc: '흩어져 있던 글자가 제자리로 모여 문장이 됨. 생각이 정리되는 장면',
          play: engine('{{모여듦:흩어졌던 말들이 겨우 한 문장이 되었다.}}')
        },
        {
          id: 'tremble', name: '떨림', status: 'block', syntax: '{{떨림:…}}',
          desc: '나타난 뒤에도 몇 초 동안 미세하게 떨림. 추위, 두려움, 참는 울음',
          play: engine('{{떨림:손끝이 자꾸만 떨렸다.}}')
        },
        {
          id: 'rewrite', name: '고쳐 씀', status: 'block', syntax: '{{고쳐 씀:먼저 쓴 말|바꿀 말}}',
          desc: '먼저 쓴 말에 줄이 그어지고 바꿀 말이 떠오름',
          play: engine('나는 너를 {{고쳐 씀:미워했다|그리워했다}}.')
        }
      ]
    },
    {
      title: '시간과 리듬',
      items: [
        {
          id: 'short', name: '한숨', status: 'now',
          desc: '어절 4개·12자 이하인 짧은 줄에 저절로 쓰임. 한 번 뜸을 들이고 천천히 씀',
          play: engine('그날 밤 나는 아무 말도 하지 않고 창밖만 오래 내다보았다.\n괜찮다고,\n말했다.')
        },
        {
          id: 'drip', name: '흘러내림', status: 'now', syntax: '{{흘러내림:…}}',
          desc: '한 글자씩 띄워 쓴 어절이 이어지면 저절로 계단처럼 떨어짐. 띄워 쓰지 않은 글은 블록으로 지정',
          play: engine('참았던 것이\n녹 아 내 렸 다.')
        },
        {
          id: 'rest', name: '쉼', status: 'now',
          desc: '띄어쓰기를 두 칸 넘게 하면 한 칸마다 0.3초 쉼. 쉼 앞 글자는 점점 느려지고, 쉼 뒤 글자는 천천히 시작해 원래 속도로 돌아옴. 화면에는 한 칸으로 보임',
          play: engine('손을 뻗었다가     멈췄다.')
        },
        {
          id: 'rush', name: '숨가쁨', status: 'block', syntax: '{{숨가쁨:…}}',
          desc: '갈수록 빨라짐. 달리기, 고백, 몰아치는 장면',
          play: engine('{{숨가쁨:뛰고 또 뛰어서 숨이 턱 끝까지 차오를 때까지 멈추지 않고 골목을 지나 다리를 건너 마침내 그 집 앞에 섰다}}')
        },
        {
          id: 'flash', name: '한 낱말씩', status: 'idea',
          desc: '낱말이 한가운데에 하나씩 떴다 사라진 뒤 문장 전체가 놓임. 한 번 누를 때 한 생각씩 보여 주는 방식',
          play: (s) => {
            const slot = el('div', 'flash-slot');
            const words = ['이제', '정말', '끝이다.'];
            const { chars } = writeLine(s, words.join(' '));
            s.prepend(slot);
            chars.forEach((c) => c.classList.add('pending'));
            const list = words.map((w, i) => [i * 900, () => {
              slot.textContent = w;
              G.animate(slot, [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)', offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 880, easing: 'ease-out' });
            }]);
            list.push([words.length * 900 + 200, () => {
              slot.textContent = '';
              chars.forEach((c) => { c.classList.remove('pending'); G.FX.fade(c); });
            }]);
            return steps(list);
          }
        }
      ]
    },
    {
      title: '화면과 공간',
      items: [
        {
          id: 'scene', name: '낮밤', status: 'now', syntax: '[[밤]] · [[낮]] · [[밤:오로라]]',
          desc: '이 표시만 적은 줄에서 새 페이지가 시작됨. 넘길 때 바닥선 가운데를 축으로 바늘이 시계방향으로 180도 쓸고, 바늘이 지나간 자리부터 새 장면이 글과 함께 드러남. 되돌아가면 반시계방향. 바탕은 [[밤:오로라]]처럼 고를 수 있음. 밤·낮 바꾸기를 누르면 이 견본 페이지의 색만 바뀜',
          manual: true,
          play: (s) => { writeLine(s, '해가 지자 방 안의 글자들이 하나씩 어두워졌다.'); return null; },
          replay: toggleScene
        },
        {
          id: 'spot', name: '조명', status: 'block', syntax: '{{조명:…}}',
          desc: '블록이 나오는 동안 같은 문단의 다른 글자를 어둡게 두고 블록만 밝힘. 블록은 떠오름처럼 문장 단위로 나옴. 독백처럼 한 줄에 무게를 둘 때',
          play: engine('그 집 앞에서 한참을 서 있었다.\n{{조명:문을 열면 네가 있을 것 같았다.}}\n열지 않으면 계속 있을 것 같았다.')
        },
        {
          id: 'big', name: '크게', status: 'block', syntax: '{{크게:…}}',
          desc: '블록을 송명체로 크게 세움. 마지막 한마디',
          play: engine('그리고 마지막으로\n{{크게:안녕.}}')
        },
        {
          id: 'spread', name: '벌어짐', status: 'block', syntax: '{{벌어짐:…}}',
          desc: '블록이 걸친 줄들이 잠시 위아래로 벌어졌다가 돌아옴. 감정이 터지는 순간',
          play: engine('{{벌어짐:그 말을 듣는 순간\n발밑이 조금 멀어졌다.\n아무것도 들리지 않았다.}}')
        },
        {
          id: 'drift', name: '어긋남', status: 'block', syntax: '{{어긋남:…}}',
          desc: '블록이 걸친 줄들이 좌우로 살짝 어긋났다가 돌아옴. 어지러움, 취기, 혼란',
          play: engine('{{어긋남:방이 조금 기울어진 것 같았다.\n아니, 내가 기울어진 걸까.\n창틀이 천천히 흘러갔다.}}')
        }
      ]
    },
    {
      title: '읽는 사람과 함께',
      items: [
        {
          id: 'scrub', name: '스크롤로 감기', status: 'idea',
          desc: '내리는 만큼 써지고 올리면 다시 지워짐. 읽는 사람이 속도를 쥐는 방식. 이 줄을 화면 위아래로 움직여 보세요',
          manual: true,
          play: (s) => {
            const { chars } = writeLine(s, '내가 한 걸음 다가가면 너도 한 걸음 다가오는 것 같았고, 내가 멈추면 너도 그 자리에 멈췄다.');
            scrubbers.push({ stage: s, chars });
            updateScroll();
            return null;
          }
        },
        {
          id: 'band', name: '초점 띠', status: 'now',
          desc: '스크롤 방식의 기본. 화면 가운데 줄만 또렷하고 위아래로 갈수록 옅고 흐려짐. 읽기 틀 위 오른쪽 초점 띠 단추로 끌 수 있음. 스크롤해 보세요',
          manual: true,
          play: (s) => {
            const lines = [
              '편지를 쓰는 일은 오랜만이었다.',
              '마지막으로 손으로 쓴 글을 보낸 게',
              '언제였는지 기억나지 않는다.',
              '메시지는 쓰는 즉시 도착하고,',
              '도착하는 즉시 읽히고,',
              '읽히는 즉시 답을 기다리게 만든다.'
            ].map((t) => writeLine(s, t).line);
            bands.push(lines);
            updateScroll();
            return null;
          }
        },
        {
          id: 'touch', name: '손끝', status: 'now',
          desc: '읽기 틀 전체에 켜져 있음. 다 쓴 어절에 손을 대거나 마우스를 올리면 그 어절이 잠깐 다시 젖음',
          manual: true,
          play: (s) => {
            writeLine(s, '젖은 공기가 들어와 종이 끝을 살짝 들어 올렸다.');
            G.touchable(s);
            return null;
          }
        }
      ]
    }
  ];

  /* ---------- 스크롤에 붙는 견본 ---------- */

  const scrubbers = [];
  const bands = [];
  let ticking = false;

  function updateScroll() {
    const vh = window.innerHeight;
    scrubbers.forEach(({ stage, chars }) => {
      const r = stage.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.5)));
      const n = Math.round(p * chars.length);
      chars.forEach((c, i) => c.classList.toggle('pending', i >= n));
    });
    bands.forEach((lines) => G.focusBand(lines, true));
  }

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; updateScroll(); });
  }, { passive: true });
  window.addEventListener('resize', updateScroll);

  /* ---------- 고르기 ---------- */

  const byId = {};
  GROUPS.forEach((g) => g.items.forEach((it) => { byId[it.id] = it; }));
  let picks = [];
  try { picks = JSON.parse(store.get(PICKS) || '[]'); } catch (e) { picks = []; }
  picks = picks.filter((id) => byId[id]);

  function syncPicks() {
    store.set(PICKS, JSON.stringify(picks));
    document.querySelectorAll('[data-pick]').forEach((b) => {
      const on = picks.includes(b.dataset.pick);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '골랐음' : '고르기';
    });
    pickedEl.textContent = picks.length
      ? `고른 효과 ${picks.length}개 · ${picks.map((id) => byId[id].name).join(', ')}`
      : '고른 효과 없음';
    copyBtn.disabled = !picks.length;
  }

  copyBtn.addEventListener('click', () => {
    const text = '글결 효과 고름: ' + picks.map((id) => `${byId[id].name}(${STATUS[byId[id].status]})`).join(', ');
    const ok = () => { copyBtn.textContent = '복사됨'; setTimeout(() => { copyBtn.textContent = '목록 복사'; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, () => { pickedEl.textContent = text; });
    } else {
      pickedEl.textContent = text;
    }
  });

  /* ---------- 그리기 ---------- */

  function mount(item) {
    const row = el('section', 'fx');
    row.id = item.id;
    const meta = el('div', 'meta');
    const head = el('h3', 'name', item.name);
    const status = el('span', 'status', STATUS[item.status]);
    status.dataset.status = item.status;
    head.append(status);
    meta.append(head);
    if (item.syntax) meta.append(el('p', 'syntax', item.syntax));
    meta.append(el('p', 'desc', item.desc));
    const acts = el('p', 'acts');
    const again = el('button', 'tbtn', item.id === 'scene' ? '밤·낮 바꾸기' : '다시');
    again.type = 'button';
    const pick = el('button', 'tbtn pick', '고르기');
    pick.type = 'button';
    pick.dataset.pick = item.id;
    if (!(item.manual && !item.replay)) acts.append(again);
    acts.append(pick);
    meta.append(acts);

    const stage = el('div', 'stage');
    stage.dataset.fx = item.id;
    row.append(meta, stage);

    let ctl = null;
    item.run = () => {
      if (ctl && ctl.cancel) ctl.cancel();
      stage.textContent = '';
      ctl = item.play(stage);
    };

    again.addEventListener('click', () => (item.replay ? item.replay() : item.run()));
    pick.addEventListener('click', () => {
      picks = picks.includes(item.id) ? picks.filter((p) => p !== item.id) : picks.concat(item.id);
      syncPicks();
    });
    if (!item.manual) stage.addEventListener('click', () => item.run());
    return row;
  }

  GROUPS.forEach((g) => {
    const sec = el('section', 'group');
    sec.append(el('h2', '', g.title));
    g.items.forEach((it) => sec.append(mount(it)));
    main.append(sec);
  });
  syncPicks();

  /* 화면에 들어온 견본은 한 번 저절로 움직인다(움직임 줄이기 설정이면 다시를 눌렀을 때만). */
  GROUPS.forEach((g) => g.items.forEach((it) => { if (it.manual) it.run(); }));
  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting || seen.has(en.target)) return;
      seen.add(en.target);
      byId[en.target.dataset.fx].run();
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.stage').forEach((st) => {
    const it = byId[st.dataset.fx];
    if (it.manual) return;
    if (reduce.matches) { st.append(el('p', 'hint', '다시를 누르면 움직임')); return; }
    io.observe(st);
  });
  updateScroll();
})();
