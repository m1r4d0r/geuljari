/*
 * 글 파일과 관리 파일을 사람이 읽을 수 있는 글로 쓰고 읽어요.
 * 글 파일: 제목·처음 쓴 날, 본문(표시 그대로), 글 전체 설정을 '이름: 값' 줄로 담아요. 본문만 남아도 글과 쪽별 연출은 그대로예요.
 * 관리 파일: 발행한 글의 전체 링크와 작성자 비밀번호 두 줄이에요. 예전 JSON 관리 파일도 읽어요.
 * 전역 GeulFile.
 */
(function () {
  'use strict';
  const DOC_HEAD = '글자리 글 파일', KEY_HEAD = '글자리 관리 파일';
  const BODY = '━━ 본문 ━━', BODY_END = '━━ 본문 끝 ━━', SETS = '━━ 설정 ━━';
  const ALIGN = { left: '왼쪽', center: '가운데', right: '오른쪽' };
  const ALIGN_BACK = { '왼쪽': 'left', '가운데': 'center', '오른쪽': 'right' };
  const FOLLOW = '(편집 제목을 따름)';

  // 설정 줄: [이름, 스냅숏에서 꺼내기, 스냅숏에 넣기]. 넣을 때 값 검사는 편집실의 normalize가 맡아요.
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
  const LINES = [
    ['분위기', (d) => d.moods.join(', '), (d, v) => { d.moods = v.split(',').map((w) => w.trim()).filter(Boolean); }],
    ['분위기를 직접 고름', (d) => (d.moodsTouched ? '예' : '아니요'), (d, v) => { d.moodsTouched = v === '예'; }],
    ['나타나는 결', (d) => d.settings.flow, (d, v) => { d.settings.flow = v; }],
    ['쓰는 빠르기', (d) => d.settings.speed, (d, v) => { d.settings.speed = num(v); }],
    ['띄어 쓴 쉼', (d) => d.settings.rest, (d, v) => { d.settings.rest = num(v); }],
    ['마르는 빠르기', (d) => d.settings.dry, (d, v) => { d.settings.dry = v; }],
    ['시작 장면', (d) => d.settings.scene, (d, v) => { d.settings.scene = v; }],
    ['시작 바탕', (d) => d.settings.ground, (d, v) => { d.settings.ground = v; }],
    ['장면이 바뀔 때 넘김', (d) => d.settings.turn, (d, v) => { d.settings.turn = v; }],
    ['글꼴', (d) => d.settings.font, (d, v) => { d.settings.font = v; }],
    ['글자 크기', (d) => d.settings.size, (d, v) => { d.settings.size = num(v); }],
    ['글 상자 폭', (d) => (d.settings.measure ? d.settings.measure + '자' : '저절로'), (d, v) => { d.settings.measure = num(v.replace(/자$/, '')) || 0; }],
    ['정렬', (d) => d.settings.align, (d, v) => { d.settings.align = v; }],
    ['주색', (d) => d.settings.theme, (d, v) => { d.settings.theme = v; }],
    ['끝 장 장면', (d) => d.ending.scene, (d, v) => { d.ending.scene = v; }],
    ['끝 장 바탕', (d) => d.ending.ground, (d, v) => { d.ending.ground = v; }],
    ['카드 문구', (d) => (d.ending.text == null ? FOLLOW : d.ending.text), (d, v) => { d.ending.text = v === FOLLOW ? null : v; }],
    ['카드 글자 크기', (d) => d.ending.size, (d, v) => { d.ending.size = num(v); }],
    ['카드 문구 폭', (d) => d.ending.width, (d, v) => { d.ending.width = num(v); }],
    ['카드 가로 위치', (d) => d.ending.x, (d, v) => { d.ending.x = num(v); }],
    ['카드 세로 위치', (d) => d.ending.y, (d, v) => { d.ending.y = num(v); }],
    ['카드 정렬', (d) => ALIGN[d.ending.align] || '가운데', (d, v) => { d.ending.align = ALIGN_BACK[v]; }]
  ];

  const oneLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  function writeDoc(d) {
    return [
      DOC_HEAD,
      '글자리 편집실의 ‘불러오기’에 이 파일을 놓으면 글과 설정이 그대로 돌아와요.',
      '본문의 {{…}}는 강조, [[…]]는 쪽 표시, 빈 줄 둘은 쪽 나눔, 두 칸 띄어쓰기는 쉼이에요.',
      '',
      '제목: ' + oneLine(d.title),
      '처음 쓴 날: ' + oneLine(d.made),
      '',
      BODY,
      d.source.replace(/\r\n?/g, '\n'),
      BODY_END,
      '',
      SETS,
      ...LINES.map(([name, get]) => name + ': ' + oneLine(get(d))),
      ''
    ].join('\n');
  }

  function field(lines, name) {
    const pre = name + ': ';
    const line = lines.find((l) => l.startsWith(pre));
    return line == null ? null : line.slice(pre.length);
  }

  function readDoc(text) {
    const a = text.indexOf('\n' + BODY + '\n'), b = text.lastIndexOf('\n' + BODY_END);
    if (a < 0 || b < a) return null;
    const head = text.slice(0, a).split('\n');
    const tail = text.slice(b + BODY_END.length + 1).split('\n');
    const d = { version: 1, title: field(head, '제목') || '', made: field(head, '처음 쓴 날') || '',
      source: text.slice(a + BODY.length + 2, b), settings: {}, moods: [], moodsTouched: false, ending: {} };
    for (const [name, , put] of LINES) {
      const v = field(tail, name);
      if (v != null && v.trim() !== '') put(d, v.trim());
    }
    return d;
  }

  function writeKey(url, password) {
    return [KEY_HEAD, '링크와 작성자 비밀번호가 함께 들어 있어요. 다른 사람에게 보내지 말아 주세요.', '',
      '링크: ' + url, '비밀번호: ' + password, ''].join('\n');
  }

  function readKey(text) {
    if (text.startsWith(KEY_HEAD)) {
      const lines = text.split('\n');
      return { url: (field(lines, '링크') || '').trim(), password: field(lines, '비밀번호') || '' };
    }
    try {
      const d = JSON.parse(text);
      if (d && d.format === 'geuljari-key' && d.version === 1) return { url: String(d.url || ''), password: String(d.password || '') };
    } catch (e) { /* JSON이 아니면 관리 파일이 아니에요 */ }
    return null;
  }

  /* 파일 글을 읽어 { kind: 'doc', doc } 또는 { kind: 'key', url, password }로, 둘 다 아니면 null */
  function read(raw) {
    const text = String(raw).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (text.startsWith(DOC_HEAD)) { const doc = readDoc(text); return doc && { kind: 'doc', doc }; }
    const key = readKey(text);
    return key && { kind: 'key', ...key };
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.hidden = true;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 파일 이름에 쓸 수 없는 글자는 빼고 앞 24자만 써요.
  const safeName = (s) => oneLine(s).replace(/[\\/:*?"<>|#%{}\[\]]/g, '').slice(0, 24).trim();

  window.GeulFile = { writeDoc, writeKey, read, download, safeName };
})();
