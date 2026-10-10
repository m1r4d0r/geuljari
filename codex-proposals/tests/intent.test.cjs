const assert = require('node:assert/strict');
require('../intent.js');
const E = globalThis.GeulIntent;
let passed = 0;
function check(name, run) { run(); passed++; console.log(`PASS ${name}`); }
check('empty input produces no pages', () => assert.equal(E.plan('  \n ').pages.length, 0));
check('one blank line remains within a page; two blank lines split', () => {
  assert.equal(E.plan('한 문장.\n\n다음 문장.').pages.length, 1);
  assert.equal(E.plan('한 문장.\n\n\n다음 문장.').pages.length, 2);
});
check('chosen reversal preserves text and starts a new night page', () => {
  const text = '종이는 그렇지 않다. 그런데 그날은 달랐다. 마지막 문장이다.';
  const target = E.sentences(text)[1], draft = E.plan(text, { turn: target.id });
  assert.equal(draft.pages.length, 2); assert.equal(draft.pages[1].start, target.start);
  assert.equal(draft.pages[1].afterTurn, true);
  assert.equal(draft.pages.map(p => p.text).join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
});
check('punctuation and double spaces create observable longer pauses', () => {
  const a=E.plan('지우려다가 그만두었다.'), b=E.plan('지우려다가   그만두었다.');
  const ta=E.timeline(a.pages[0],a),tb=E.timeline(b.pages[0],b);
  assert.ok(tb.tokens[1].at>ta.tokens[1].at);assert.equal(tb.tokens[1].before,' ');
});
check('explicit emphasis marks only the chosen occurrence', () => {
  const text='그날도 그랬다. 그날도 그랬다.', sentence=E.sentences(text)[1];
  const d=E.plan(text,{focus:sentence.id}),events=E.timeline(d.pages[0],d).tokens;
  assert.ok(events.filter(t=>t.focus).every(t=>t.start>=sentence.start));
  assert.equal(events.filter(t=>t.focus).length,2);
});
check('an unbroken long string paginates without losing graphemes', () => {
  const text='가족👩‍👩‍👧‍👧'.repeat(200),d=E.plan(text);
  assert.ok(d.pages.length>1);assert.equal(d.pages.map(p=>p.text).join(''),text);
  d.pages.forEach(p=>assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(p.text)));
});
check('all raw visible text survives automatic pagination', () => {
  const text=('밤이 깊어지면 책상 위의 소리가 하나씩 지워진다. '.repeat(40))+'\n\n\n마르기 전에 보내야지.';
  const d=E.plan(text);assert.ok(d.pages.length>2);
  assert.equal(d.pages.map(p=>p.text).join('').replace(/\s/g,''),text.replace(/\s/g,''));
});
check('meaning cues are suggestions, not automatic twists or emphasis', () => {
  const d=E.plan('하지만 밤이 되었다. 밤은 길었다.');assert.equal(d.focus,null);assert.equal(d.turn,null);
  assert.equal(d.pages[0].afterTurn,false);assert.ok(d.analysis.turns.length>0);assert.ok(d.analysis.nightWords.includes('밤'));
  assert.equal(E.analyze('밤나무를 보았다.').nightWords.length,0);
});
check('mood combinations and speed change actual timings', () => {
  const text='그날도 그랬다. 종이는 그렇지 않다.',d=E.plan(text,{moods:['warm','quiet']});
  assert.ok(d.appearance.temperature>0);assert.ok(d.appearance.rest>1);
  assert.ok(E.timeline(d.pages[0],d,{speed:1.5}).duration<E.timeline(d.pages[0],d,{speed:.6}).duration);
});
check('decimal numbers remain intact and stale intent does not apply', () => {
  const d=E.plan('속도는 1.5배였다. 그날도 그랬다.',{focus:'s99999',turn:'s99999'});
  assert.ok(d.analysis.sentences[0].text.includes('1.5'));assert.equal(d.focus,null);assert.equal(d.turn,null);
});
console.log(`${passed} meaningful analysis checks passed.`);
