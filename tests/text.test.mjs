import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require('../engine.js');
require('../tune.js');
require('../geul-file.js');
const E = globalThis.Geulgyeol;

test('끊을 자리: 뒤 어절에 brk, 글자로 세지 않음', () => {
  const row = E.parse('가나 다라 ｜마바  사아').paragraphs[0].rows[0];
  assert.deepEqual(row.tokens.map((t) => t.cells.map((c) => c.ch).join('') + (t.brk ? '*' : '')), ['가나', '다라', '마바*', '사아']);
  assert.equal(row.tokens[3].gap, 2);
  assert.equal(E.stats('가 ｜나').noSpaces, 2);
  assert.equal(E.mask('가 ｜나'), '■ ｜■');
});

test('글만 복사: 표시를 빼고 쉼은 한 칸, 쪽 나눔은 빈 줄 하나, 들여쓰기는 남김', () => {
  const src = '[[다크]]\n가나  다라 ｜{{번짐:마바}}\n\n\n\n  들여 쓴 줄\n\n[[라이트:원고지]]\n{{끝}}';
  assert.equal(globalThis.GeulFile.plainText(src), '가나 다라 마바\n\n  들여 쓴 줄\n\n끝');
});

test('호흡: 긴·짧은은 글 상자 폭만, 빼면 저절로', () => {
  const T = globalThis.GeulTune;
  assert.equal(T.fromMoods(['긴']).measure, 34);
  assert.equal(T.fromMoods(['짧은', '젖은']).measure, 18);
  assert.equal(T.setAxis(T.fromMoods(['긴']), '호흡', null).measure, 0);
});

test('축을 바꾸면 그 축이 맡은 값만 바뀜', () => {
  const T = globalThis.GeulTune;
  const s = T.normalize({ speed: 1.3, rest: 3, flow: '떠오름', size: 1.2 });
  const o = T.setAxis(s, '심상', '종이');
  assert.equal(o.ground, '원고지'); assert.equal(o.altGround, '타자'); assert.equal(o.turnLight, '글리치');
  assert.equal(o.speed, 1.3); assert.equal(o.rest, 3); assert.equal(o.flow, '떠오름'); assert.equal(o.size, 1.2);
  assert.equal(T.setAxis(s, '호흡', '긴').flow, '떠오름');
  assert.equal(T.AXES.some((a) => a.name === '숨'), false);
  const r = T.retire(['고요한', '빛'], { speed: 0.85, rest: 2 });
  assert.deepEqual(r.moods, ['빛']); assert.equal(r.settings.speed, 1); assert.equal(r.settings.rest, 1);
});
