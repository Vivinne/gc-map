/* D2 data, layer 1: year parsing, names, sorting, country groups, shown text (equivalence, boundary, error cases). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, BY_COUNTRY_MIN, BY_ID, ERAS, architectOf, architectParts, ascii, builtOf, byCountry, byYear, cityOf, examNote, joinDot, keywordsOf, nationName, norm, shortYear, shownStyle, startYear, styleName, styleOf, toBuilding, whoOf, type Building } from './index';

const one = BUILDINGS[0]!;
const make = (over: Partial<Building>): Building => toBuilding({ ...one, ...over });

test('data: start year of a span (decades, centuries, BC, AD, unknown)', () => {
  const cases: [string, number | null][] = [
    ['1928-1931', 1928], ['1506–', 1506], ['AD 118', 118], ['BC 447-BC 432', -447], ['15th', 1450], ['1st', 50],
    ['BC 6\u4e16\u7d00', -550], ['12 \u4e16\u7d00', 1150], ['c. 1500', 1500], ['', null], ['\u2014', null], ['-', null], ['unknown', null],
  ];
  for (const [raw, y] of cases) assert.equal(startYear(raw), y, raw);
});

test('data: first part of a span as written', () => {
  for (const [raw, s] of [['1928-1931', '1928'], ['1546–1590', '1546'], ['', ''], ['\u2014', ''], ['1500\uff08note\uff09', '1500']] as const) assert.equal(shortYear(raw), s, raw);
});

// Found in test batch 2: the comment of shortYear promises "BC 447-BC 432" -> "BC 447", but the whole span comes back.
// The field (yearShort) is not shown anywhere today. Kept as a todo until the user decides (gc/restructure-progress.md).
test('data: first part of a BC span', { todo: 'defect T2-1: BC span not cut' }, () => {
  assert.equal(shortYear('BC 447-BC 432'), 'BC 447');
});

test('data: text folding for search (accents, curly quotes, case)', () => {
  assert.equal(norm('Panthéon'), 'pantheon');
  assert.equal(norm('St Peter’s'), "st peter's");
  assert.equal(norm('“A”'), '"a"');
});

test('data: city, person, country, exam line', () => {
  assert.equal(cityOf({ ...one, locLabel: 'Rome, IT', loc: '' }), 'Rome');
  assert.equal(cityOf({ ...one, locLabel: '', loc: '' }), '');
  assert.equal(whoOf({ ...one, who: '\u2014' }), '');
  assert.equal(whoOf({ ...one, who: ' Bernini ' }), 'Bernini');
  assert.equal(nationName({ ...one, nation: 'United States of America' }), 'United States');
  assert.equal(examNote({ ...one, exams: [] }), '');
  assert.equal(examNote({ ...one, exams: [2016, 2018] }), 'TEST-ARCHED 2016 / 2018');
});

test('data: oldest first; unknown years last; same year by name', () => {
  const a = make({ name: 'B', year: '1500' }), b = make({ name: 'A', year: '1500' }), c = make({ name: 'C', year: '' });
  assert.deepEqual([c, a, b].sort(byYear).map((x) => x.name), ['A', 'B', 'C']);
});

test('data: full-width punctuation as plain ASCII', () => {
  assert.equal(ascii('A\uff08B\uff09\uff0fC\uff0bD\uff1bE\uff0cF\uff1aG'), 'A (B) / C + D; E, F: G');
});

test('data: country groups: most buildings first; empty country as "-"; the list order kept inside', () => {
  const list = [make({ id: 'x1', nation: 'Italy' }), make({ id: 'x2', nation: 'France' }), make({ id: 'x3', nation: 'Italy' }), make({ id: 'x4', nation: '' })];
  const g = byCountry(list);
  assert.deepEqual(g.map((x) => [x.country, x.items.map((b) => b.id)]), [['Italy', ['x1', 'x3']], ['-', ['x4']], ['France', ['x2']]]);
  assert.equal(BY_COUNTRY_MIN, 10);
});

test('data: style shown: finer style for Modernism, category name for Others or none', () => {
  for (const b of BUILDINGS) assert.ok(shownStyle(b).length > 0, b.id);
  const modern = BUILDINGS.find((b) => styleOf(b) === 'Modernism' && b.styleCard)!;
  assert.equal(shownStyle(modern), modern.styleCard);
  const others = make({ style: 'Others', styleShown: 'Others', era: 'others' });
  assert.equal(shownStyle(others), ERAS.others.label);
  assert.equal(styleName({ ...one, styleShown: '', style: '\u53e4\u7f85\u99ac\uff08Ancient Rome\uff1anote\uff09' }), 'Ancient Rome');
});

test('data: architect line: none, one, two, three, a firm', () => {
  assert.equal(architectOf(make({ who: '' })), '-');
  assert.deepEqual(architectParts(make({ who: '' })), []);
  assert.equal(architectOf(make({ who: 'Bernini' })), 'Bernini');
  assert.equal(architectOf(make({ who: 'A / B' })), 'A and B');
  assert.equal(architectOf(make({ who: 'A / B / C' })), 'A, B and C');
  assert.deepEqual(architectParts(make({ who: 'A (design) / B' })).map((p) => p.search ?? null), ['A', null, 'B']);
  assert.equal(architectParts(make({ who: 'Herzog & de Meuron' })).length, 1);
});

test('data: built span shown, keywords with struck ones, middle-dot join', () => {
  assert.equal(builtOf(make({ built: '\u2014' })), '');
  assert.equal(builtOf(make({ built: '1546\uff0f1590' })), '1546 / 1590');
  assert.deepEqual(keywordsOf(make({ tags: ['dome', '~~tower~~'] })), [{ text: 'dome', struck: false }, { text: 'tower', struck: true }]);
  assert.equal(joinDot('1500', '', 'Rome'), '1500 · Rome');
});

test('data: every building has one place and a unique id; the 10 categories have their colours', () => {
  assert.equal(BY_ID.size, BUILDINGS.length);
  assert.ok(BUILDINGS.length >= 200);
  for (const b of BUILDINGS) assert.equal(b.points.length, 1, b.id);
  assert.equal(Object.keys(ERAS).length, 10);
  for (const e of Object.values(ERAS)) assert.match(e.color, /^#[0-9A-F]{6}$/);
});
