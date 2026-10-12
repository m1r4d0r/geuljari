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

test('호흡: 긴·짧은은 글 상자 폭만, 고르지 않으면 저절로', () => {
  const T = globalThis.GeulTune;
  assert.equal(T.fromMoods(['긴']).measure, 34);
  assert.equal(T.fromMoods(['짧은', '고요한']).measure, 18);
  assert.equal(T.fromMoods(['고요한'], T.fromMoods(['긴'])).measure, 0);
});
