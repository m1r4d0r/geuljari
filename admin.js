/*
 * 글자리 관리 현황. 관리자 비밀번호를 넣으면 /api/admin에서 글 요약 목록과 날짜별 방문 수를 받아 보여 준다.
 * 비밀번호는 이 화면이 열려 있는 동안 메모리에만 두고(새로 고침에 다시 씀), 잠그기·창 닫기로 잊는다.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MSG = {
    wrong_password: '비밀번호가 맞지 않습니다.',
    admin_unset: '관리자 비밀번호가 아직 설정되지 않았습니다. Netlify 환경 변수 GEULJARI_ADMIN_PASSWORD를 넣고 다시 배포해 주세요.',
    storage_unavailable: '저장소에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
  };
  let password = '';
  let busy = false;

  const fmt = (iso) => {
    const t = Date.parse(iso);
    if (!t) return '—';
    const d = new Date(t + 9 * 3600e3);
    return d.toISOString().slice(0, 10).replace(/-/g, '.') + ' ' + d.toISOString().slice(11, 16);
  };
  const short = (date) => date.slice(5).replace('-', '.');
  function cell(text, cls) {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    if (text instanceof Node) td.append(text); else td.textContent = text;
    return td;
  }

  async function load() {
    if (busy) return;
    busy = true;
    $('msg').textContent = '';
    document.querySelectorAll('.gate .btn, #refresh').forEach((b) => { b.disabled = true; });
    try {
      let res;
      try {
        res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), cache: 'no-store' });
      } catch (e) { throw new Error('연결이 끊겼습니다. 다시 시도해 주세요.'); }
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error('시도가 많았습니다. 1분 뒤 다시 시도해 주세요.');
      if (!res.ok) throw new Error(MSG[data.error] || '현황을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
      render(data);
    } catch (e) {
      if (!$('board').hidden) lock();
      $('msg').textContent = e.message;
    } finally {
      busy = false;
      document.querySelectorAll('.gate .btn, #refresh').forEach((b) => { b.disabled = false; });
    }
  }

  function render(d) {
    $('gate').hidden = true;
    $('board').hidden = false;
    $('refresh').hidden = $('lock').hidden = false;
    $('when').textContent = fmt(d.now) + ' 기준';
    const sum = (list, k) => list.reduce((n, x) => n + x[k], 0);
    const t = d.timeline;
    const week = t.slice(0, 7);
    const c = d.counts;
    const items = [
      ['발행한 글', c.total, `공개 ${c.live} · 비공개 ${c.closed}`],
      ['삭제한 글', c.deleted, ''],
      ['오늘 새 글', t[0].created, `7일 ${sum(week, 'created')}`],
      ['오늘 편집실 방문', t[0].edit, `7일 ${sum(week, 'edit')} · ${d.keepDays}일 ${sum(t, 'edit')}`],
      ['오늘 글 읽기', t[0].read, `7일 ${sum(week, 'read')} · ${d.keepDays}일 ${sum(t, 'read')}`]
    ];
    $('sum').replaceChildren(...items.map(([name, n, note]) => {
      const box = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = name;
      const dd = document.createElement('dd');
      dd.textContent = String(n);
      if (note) { const s = document.createElement('small'); s.textContent = note; dd.append(s); }
      box.append(dt, dd);
      return box;
    }));

    $('list-n').textContent = String(d.articles.length);
    $('reads-head').textContent = `읽기(${d.keepDays}일)`;
    const rows = d.articles.map((a) => {
      const tr = document.createElement('tr');
      const st = document.createElement('span');
      st.className = 'state' + (a.live ? '' : ' off');
      st.textContent = a.live ? '공개' : '비공개';
      tr.append(cell(a.title || '제목 없는 글'), cell(st), cell(fmt(a.createdAt), 'date'), cell(fmt(a.updatedAt), 'date'), cell(String(Math.max(0, (a.revision || 1) - 1)), 'num'), cell(String(a.reads), 'num'));
      return tr;
    });
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.className = 'empty';
      const td = cell('아직 발행한 글이 없습니다.');
      td.colSpan = 6;
      tr.append(td);
      rows.push(tr);
    }
    $('list').replaceChildren(...rows);
    $('list-fine').textContent = '본문은 작성자 브라우저에서 잠겨 있어 여기서도 볼 수 없습니다. 공개 제목만 보입니다.';

    const top = Math.max(1, ...t.map((x) => Math.max(x.edit, x.read)));
    $('days').replaceChildren(...t.map((x) => {
      const tr = document.createElement('tr');
      const bar = document.createElement('div');
      bar.className = 'bar';
      [['e', x.edit], ['r', x.read]].forEach(([k, v]) => {
        const i = document.createElement('i');
        i.className = k;
        i.style.width = (v / top * 100).toFixed(1) + '%';
        bar.append(i);
      });
      tr.append(cell(short(x.date), 'date'), cell(String(x.created), 'num'), cell(String(x.edit), 'num'), cell(String(x.read), 'num'), cell(bar));
      return tr;
    }));
  }

  function lock() {
    password = '';
    $('password').value = '';
    $('board').hidden = true;
    $('gate').hidden = false;
    $('refresh').hidden = $('lock').hidden = true;
    $('when').textContent = '';
    $('password').focus();
  }

  $('gate').addEventListener('submit', (e) => {
    e.preventDefault();
    password = $('password').value;
    load();
  });
  $('refresh').addEventListener('click', load);
  $('lock').addEventListener('click', lock);
})();
