/* 원문은 브라우저 메모리에서만 다룬다. 뜻의 확정 대신 관찰 가능한 단서를 반환한다. */
(function (global) {
  'use strict';
  const MOODS = {
    warm: { label: '따뜻한', temperature: 1, speed: .98, rest: 1.1, description: '따뜻한 종이와 부드러운 빛' },
    cool: { label: '서늘한', temperature: -1, speed: 1, rest: 1.1, description: '차분한 회청색과 선명한 글자' },
    quiet: { label: '고요한', temperature: 0, speed: .88, rest: 1.3, description: '느린 흐름과 조금 긴 쉼' },
    wistful: { label: '아련한', temperature: .3, speed: .92, rest: 1.25, description: '천천히 또렷해지는 글자와 여운' },
    tense: { label: '팽팽한', temperature: -.2, speed: 1.12, rest: .85, description: '짧은 호흡과 또렷한 전환' },
    light: { label: '가벼운', temperature: .2, speed: 1.08, rest: .9, description: '가볍게 이어지는 흐름' }
  };
  const normalize = text => String(text).replace(/\r\n?/g, '\n');
  const graphemes = text => typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)].map(s => s.segment)
    : Array.from(text);
  const count = text => graphemes(text).length;
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko', { granularity: 'sentence' }) : null;
  const turnRE = /^[“"'‘]?\s*(하지만|그런데|그러나|그렇지만|반면|그럼에도|그러다|문득|그 순간)(?:\s|[,，])/u;

  function sentences(raw) {
    const text = normalize(raw), out = [];
    for (const line of text.matchAll(/[^\n]+/gu)) {
      const segments = segmenter ? [...segmenter.segment(line[0])] : [{ segment: line[0], index: 0 }];
      for (const part of segments) {
        const leading = part.segment.length - part.segment.trimStart().length;
        const value = part.segment.trim();
        if (!value) continue;
        const start = line.index + part.index + leading;
        out.push({ id: `s${start}`, start, end: start + value.length, text: value, length: count(value), words: value.split(/\s+/u).length, turnCue: turnRE.test(value) });
      }
    }
    return out;
  }

  function profile(keys) {
    const picked = [...new Set(keys)].filter(key => MOODS[key]).slice(0, 2).map(key => MOODS[key]);
    const average = name => picked.length ? picked.reduce((sum, m) => sum + m[name], 0) / picked.length : ({ temperature: 0, speed: 1, rest: 1 })[name];
    return { labels: picked.map(m => m.label), temperature: average('temperature'), speed: average('speed'), rest: average('rest'), effect: keys.includes('wistful') ? 'rise' : 'flow', reveal: keys.includes('wistful') ? 1300 : keys.includes('tense') ? 520 : 850, description: picked.length ? picked.map(m => m.description).join(' · ') : '글의 생김새에 맞춰 첫 안을 만들어요.' };
  }

  function analyze(raw) {
    const text = normalize(raw), list = sentences(text);
    const explicitBreaks = [...text.matchAll(/\n(?:[\t ]*\n){2,}/gu)].map(m => m.index + m[0].length);
    const rests = [...text.matchAll(/\S([\t ]{2,})(?=\S)/gu)].map(m => ({ offset: m.index + 1, length: m[1].length }));
    const wordCounts = new Map();
    for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
      const word = match[0];
      if (count(word) < 2 || /^(나는|내가|우리는|그것은|그렇게|하지만|그리고|그래서|그런데|것이다|있다|했다|하는|있는)$/u.test(word)) continue;
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
    const repeated = [...wordCounts].filter(([, total]) => total >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word, total]) => ({ word, total }));
    const short = list.filter(s => s.words <= 4 && s.length <= 20);
    const turns = list.filter(s => s.turnCue);
    const quoted = list.filter(s => /[“”「」『』"]/.test(s.text));
    const nightWords = [...new Set([...text.matchAll(/(?<![가-힣])(밤(?:하늘|공기|바다|중)?|어둠|새벽|그늘)(?=[이가을를은는의에도과와]|\s|[.,!?]|$)/gu)].map(m => m[1]))];
    const focusCandidates = list.filter(s => s.length >= 5 && s.length <= 65).map(s => ({ ...s, score: (s.words <= 7 ? 2 : 0) + (s.end === text.trimEnd().length ? 1 : 0) + (s.turnCue ? .5 : 0) + (repeated.some(r => s.text.includes(r.word)) ? .5 : 0) })).sort((a, b) => b.score - a.score || a.start - b.start).slice(0, 3);
    return { text, sentences: list, explicitBreaks, rests, repeated, short, turns, quoted, nightWords, focusCandidates, length: count(text.replace(/\n/gu, '')), wordCount: (text.match(/\S+/gu) || []).length };
  }

  function selectedSentence(analysis, id) { return analysis.sentences.find(s => s.id === id) || null; }

  function paginate(analysis, turnId, focusId) {
    const text = analysis.text;
    if (!text.trim()) return [];
    const turn = selectedSentence(analysis, turnId), focus = selectedSentence(analysis, focusId);
    const fixed = [...new Set([0, ...analysis.explicitBreaks, ...(turn && turn.start > 0 ? [turn.start] : []), text.length])].sort((a, b) => a - b);
    const ranges = [];
    for (let i = 0; i < fixed.length - 1; i++) {
      let begin = fixed[i], end = fixed[i + 1];
      while (end - begin > 520) {
        const eligible = analysis.sentences.filter(s => s.end > begin + 130 && s.end <= begin + 440 && s.end < end && !(focus && s.end > focus.start && s.end < focus.end));
        let cut = eligible.at(-1)?.end;
        if (!cut) {
          const look = text.slice(begin, Math.min(end, begin + 440));
          const gaps = [...look.matchAll(/\s+/gu)].filter(m => m.index > 130 && !(focus && begin + m.index > focus.start && begin + m.index < focus.end));
          cut = gaps.length ? begin + gaps.at(-1).index + gaps.at(-1)[0].length : null;
        }
        if (!cut) {
          if (focus && focus.start <= begin + 440 && focus.end > begin + 440) cut = focus.end;
          else cut = begin + graphemes(text.slice(begin, end)).slice(0, 330).join('').length;
        }
        if (cut >= end || cut <= begin) break;
        ranges.push([begin, cut]); begin = cut;
      }
      ranges.push([begin, end]);
    }
    return ranges.map(([begin, end]) => {
      const raw = text.slice(begin, end), lead = raw.length - raw.trimStart().length;
      return { start: begin + lead, end: end - (raw.length - raw.trimEnd().length), text: raw.trim(), afterTurn: !!turn && begin >= turn.start };
    }).filter(p => p.text);
  }

  function plan(raw, choices = {}) {
    const analysis = analyze(raw), appearance = profile(choices.moods || []);
    const focus = selectedSentence(analysis, choices.focus), turn = selectedSentence(analysis, choices.turn);
    const pages = paginate(analysis, choices.turn, choices.focus);
    const reasons = [];
    if (analysis.explicitBreaks.length) reasons.push(`빈 줄 둘 이상인 곳 ${analysis.explicitBreaks.length}군데를 쪽 경계로 남겼어요.`);
    if (pages.length > analysis.explicitBreaks.length + 1 + (turn ? 1 : 0)) reasons.push('긴 부분은 문장 경계와 어절을 우선해 나눴어요.');
    if (analysis.rests.length) reasons.push(`두 칸 이상 띈 ${analysis.rests.length}군데에서는 한 호흡 더 쉬어요.`);
    if (analysis.short.length) reasons.push(`짧은 문장 ${analysis.short.length}개는 조금 더 천천히 읽혀요.`);
    if (focus) reasons.push(`고른 문장 “${focus.text}” 앞뒤에서 더 머물고, 얇은 밑줄로 표시해요.`);
    if (turn) reasons.push(`고른 전환점 “${turn.text}”에서 새 쪽을 시작하고 바탕의 낮밤을 바꿔요.`);
    if (appearance.labels.length) reasons.push(`고른 느낌 ${appearance.labels.join(' · ')}을 종이의 색, 등장 속도, 쉼에 적용했어요.`);
    if (!reasons.length) reasons.push('문장 끝에서 짧게 쉬며, 어절 길이에 맞춰 자연스럽게 이어 써요.');
    return { analysis, appearance, focus, turn, pages, reasons };
  }

  function timeline(page, draft, options = {}) {
    const speed = (options.speed || 1) * draft.appearance.speed;
    const rest = (options.rest || 1) * draft.appearance.rest;
    const tokens = [], shortIds = new Set(draft.analysis.short.map(s => s.id));
    let at = 400, previousEnd = 0;
    for (const m of page.text.matchAll(/\S+/gu)) {
      const start = page.start + m.index, end = start + m[0].length;
      const sentence = draft.analysis.sentences.find(s => start >= s.start && start < s.end);
      const focus = !!draft.focus && start < draft.focus.end && end > draft.focus.start;
      const before = page.text.slice(previousEnd, m.index);
      const wideGap = /[^\n\S]{2,}/u.test(before);
      if (wideGap) at += Math.min(before.replace(/\n/g, '').length - 1, 6) * 240 * rest;
      if (before.includes('\n')) at += 150 * rest;
      if (focus && start === draft.focus.start) at += 520 * rest;
      const short = sentence && shortIds.has(sentence.id);
      tokens.push({ text: m[0], start, end, before: before.replace(/[^\n\S]{2,}/gu, ' '), at: at / speed, focus, short: !!short });
      at += Math.max(80, count(m[0]) * (short ? 48 : 30));
      if (/[.!?。！？…][”’"']?$/u.test(m[0])) at += (m[0].includes('…') ? 420 : 200) * rest;
      else if (/[,，;:][”’"']?$/u.test(m[0])) at += 75 * rest;
      if (focus && end >= draft.focus.end) at += 650 * rest;
      previousEnd = m.index + m[0].length;
    }
    return { tokens, duration: at / speed + draft.appearance.reveal };
  }
  global.GeulIntent = { MOODS, normalize, sentences, analyze, profile, plan, timeline, paginate, graphemes };
})(globalThis);
