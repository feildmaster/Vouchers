const assert = require('node:assert/strict');
const { test } = require('node:test');

const { generate, normalize } = require('../src/util/code');

test('a code is normalized into groups of four whatever case or separators it was typed with', () => {
  assert.equal(normalize('abcd efgh jkmn'), 'ABCD-EFGH-JKMN');
  assert.equal(normalize('abcdefghjkmn'), 'ABCD-EFGH-JKMN');
  assert.equal(normalize(' ABCD-EFGH-JKMN '), 'ABCD-EFGH-JKMN');
});

test('codes with more groups than are generated today are still accepted', () => {
  assert.equal(normalize('abcdefghjkmnpqrs'), 'ABCD-EFGH-JKMN-PQRS');
  assert.equal(normalize('ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2'), 'ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2');
});

test('codes with too few or too many groups, or a partial group, are refused', () => {
  assert.equal(normalize('ABCD-EFGH'), undefined);
  assert.equal(normalize('ABCD-EFGH-JKM'), undefined);
  assert.equal(normalize('ABCD-EFGH-JKMN-P'), undefined);
  assert.equal(normalize('ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2-3456'), undefined);
});

test('anything that is not a string of letters and digits is refused', () => {
  assert.equal(normalize(undefined), undefined);
  assert.equal(normalize(123456789012), undefined);
  assert.equal(normalize('ABCD-EFGH-JK!N'), undefined);
  assert.equal(normalize(''), undefined);
});

test('a generated code is accepted as it is', () => {
  const code = generate();

  assert.equal(normalize(code), code);
});
