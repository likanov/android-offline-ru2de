import {
  lektion3ArticleItems, lektion3InvariantGroups, lektion3InvariantSourceItems,
  lektion3Nouns, lektion3PluralItems, lektion3Targets,
} from '../../src/features/grammar/lektion3Content';
import { lektion3Reference } from '../../src/features/grammar/lektion3Reference';

// Incorrect trusted forms, omissions, or source reordering must break this contract.
const expectedNouns = [
  ['tisch', 'Tisch', 'Tische', 'm', 'стол'],
  ['buch', 'Buch', 'Bücher', 'n', 'книга'],
  ['zeitung', 'Zeitung', 'Zeitungen', 'f', 'газета'],
  ['kind', 'Kind', 'Kinder', 'n', 'ребёнок'],
  ['student', 'Student', 'Studenten', 'm', 'студент'],
  ['bild', 'Bild', 'Bilder', 'n', 'картина, изображение'],
  ['mann', 'Mann', 'Männer', 'm', 'мужчина'],
  ['kino', 'Kino', 'Kinos', 'n', 'кинотеатр'],
  ['strasse', 'Straße', 'Straßen', 'f', 'улица'],
  ['hotel', 'Hotel', 'Hotels', 'n', 'гостиница'],
  ['haus', 'Haus', 'Häuser', 'n', 'дом'],
  ['wort', 'Wort', 'Wörter', 'n', 'отдельное слово языка'],
  ['blume', 'Blume', 'Blumen', 'f', 'цветок'],
  ['hand', 'Hand', 'Hände', 'f', 'рука'],
  ['stift', 'Stift', 'Stifte', 'm', 'карандаш, письменный инструмент'],
  ['computer', 'Computer', 'Computer', 'm', 'компьютер'],
  ['lampe', 'Lampe', 'Lampen', 'f', 'лампа'],
  ['nacht', 'Nacht', 'Nächte', 'f', 'ночь'],
  ['maedchen', 'Mädchen', 'Mädchen', 'n', 'девочка'],
  ['lehrer', 'Lehrer', 'Lehrer', 'm', 'учитель'],
  ['tasche', 'Tasche', 'Taschen', 'f', 'сумка'],
  ['stuhl', 'Stuhl', 'Stühle', 'm', 'стул'],
  ['zug', 'Zug', 'Züge', 'm', 'поезд'],
  ['spielzeug', 'Spielzeug', 'Spielzeuge', 'n', 'игрушка'],
  ['zeitschrift', 'Zeitschrift', 'Zeitschriften', 'f', 'журнал'],
  ['zimmer', 'Zimmer', 'Zimmer', 'n', 'комната'],
  ['mensch', 'Mensch', 'Menschen', 'm', 'человек'],
  ['schrank', 'Schrank', 'Schränke', 'm', 'шкаф'],
  ['techniker', 'Techniker', 'Techniker', 'm', 'техник'],
  ['sportler', 'Sportler', 'Sportler', 'm', 'спортсмен'],
  ['arbeiter', 'Arbeiter', 'Arbeiter', 'm', 'рабочий'],
  ['designer', 'Designer', 'Designer', 'm', 'дизайнер'],
  ['satz', 'Satz', 'Sätze', 'm', 'предложение'],
  ['cafe', 'Café', 'Cafés', 'n', 'кафе'],
];
const articleOrder = ['tisch', 'buch', 'zeitung', 'kind', 'student', 'bild', 'mann',
  'kino', 'strasse', 'hotel', 'haus', 'wort', 'blume', 'hand'];
const pluralOrder = ['stift', 'computer', 'kind', 'buch', 'lampe', 'strasse', 'nacht',
  'wort', 'zeitung', 'maedchen', 'lehrer', 'kino', 'tasche', 'stuhl', 'zug', 'spielzeug',
  'hotel', 'bild', 'student', 'haus', 'mann', 'hand', 'zeitschrift', 'zimmer', 'mensch'];
const invariantOrder = ['mensch', 'student', 'lehrer', 'schrank', 'stuhl', 'stift',
  'computer', 'bild', 'wort', 'haus', 'zimmer', 'kind', 'spielzeug', 'maedchen', 'mann',
  'techniker', 'zeitschrift', 'sportler', 'tisch', 'arbeiter', 'zeitung', 'blume',
  'designer', 'hotel', 'satz', 'nacht', 'stuhl', 'zug', 'cafe', 'tasche'];
const unchangedIds = ['arbeiter', 'computer', 'designer', 'lehrer', 'maedchen',
  'sportler', 'techniker', 'zimmer'];

test('source_counts_and_forms_match_spec', () => {
  expect(lektion3Nouns).toHaveLength(34);
  expect(lektion3Nouns.map(n => [n.id, n.de, n.plural, n.gender, n.ru])).toEqual(expectedNouns);
  expect(new Set(lektion3Nouns.map(n => n.id)).size).toBe(34);
  expect(lektion3Nouns.every(n => /^[a-z]+$/.test(n.id))).toBe(true);
  expect(lektion3ArticleItems).toHaveLength(28);
  expect(lektion3PluralItems).toHaveLength(25);
  expect(lektion3InvariantSourceItems).toHaveLength(30);
  expect(new Set(lektion3InvariantSourceItems.map(i => i.nounId)).size).toBe(29);
  expect(lektion3ArticleItems.map(i => i.nounId)).toEqual(articleOrder.flatMap(id => [id, id]));
  expect(lektion3ArticleItems.map(i => i.number)).toEqual(articleOrder.flatMap(() => ['singular', 'plural']));
  expect(lektion3PluralItems.map(i => i.nounId)).toEqual(pluralOrder);
  expect(lektion3InvariantSourceItems.map(i => i.nounId)).toEqual(invariantOrder);
  for (const [items, exercise] of [
    [lektion3ArticleItems, '3.1'], [lektion3PluralItems, '3.2'], [lektion3InvariantSourceItems, '3.3'],
  ] as const) {
    expect(items.map(i => i.sourceItem)).toEqual(Array.from({ length: items.length }, (_, i) => i + 1));
    expect(items.every(i => i.sourceExercise === exercise)).toBe(true);
  }
  expect(new Set(lektion3ArticleItems.map(i => i.id)).size).toBe(28);
  expect(new Set(lektion3PluralItems.map(i => i.id)).size).toBe(25);
  expect(lektion3Targets).toHaveLength(40);
  expect(lektion3Targets.map(t => t.id)).toEqual([
    ...articleOrder.map(id => `noun-article:${id}`),
    ...pluralOrder.map(id => `noun-plural:${id}`), 'plural-invariant:recognition',
  ]);
  for (const target of lektion3Targets) {
    expect(target.kind).toBe(target.id.split(':')[0]);
    expect(target.catalogVersion).toBe(3);
    expect(target.pronounId).toBeNull();
    expect(target.labelRu.trim().length).toBeGreaterThan(0);
  }
});

// Deduplicating printed positions would lose the provenance of the repeated Stuhl.
test('stuhl_duplicate_keeps_two_source_positions', () => {
  expect(lektion3InvariantSourceItems.filter(i => i.nounId === 'stuhl')).toEqual([
    { sourceExercise: '3.3', sourceItem: 5, nounId: 'stuhl' },
    { sourceExercise: '3.3', sourceItem: 27, nounId: 'stuhl' },
  ]);
  expect(lektion3Nouns.filter(n => n.id === 'stuhl')).toHaveLength(1);
});

// Comparing articles instead of bare nouns misclassifies Lehrer and Computer.
test('exact_eight_unchanged_nouns', () => {
  expect(lektion3Nouns.filter(n => n.unchanged).map(n => n.id).sort()).toEqual(unchangedIds);
  for (const noun of lektion3Nouns) expect(noun.unchanged).toBe(noun.de === noun.plural);
});

// Incorrect answers, duplicate options, or a biased pool would violate recognition coverage.
test('twelve_groups_cover_all_twenty_nine', () => {
  expect(lektion3InvariantGroups).toHaveLength(12);
  expect(new Set(lektion3InvariantGroups.map(g => g.id)).size).toBe(12);
  const occurrences = new Map<string, number>();
  for (const group of lektion3InvariantGroups) {
    expect(group.nounIds).toHaveLength(6);
    expect(new Set(group.nounIds).size).toBe(6);
    expect([2, 3]).toContain(group.expectedIds.length);
    expect(new Set(group.expectedIds).size).toBe(group.expectedIds.length);
    expect([...group.expectedIds].sort()).toEqual(group.nounIds.filter(id => unchangedIds.includes(id)).sort());
    for (const id of group.nounIds) occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
  }
  expect([...occurrences.keys()].sort()).toEqual([...new Set(invariantOrder)].sort());
  for (const id of unchangedIds) expect(occurrences.get(id)).toBeGreaterThanOrEqual(3);
  for (const id of invariantOrder.filter(id => !unchangedIds.includes(id))) {
    expect(occurrences.get(id)).toBeGreaterThanOrEqual(1);
  }
  // Correct options must not always occupy the same positions in the displayed group.
  expect(new Set(lektion3InvariantGroups.map(g => g.nounIds.map((id, i) =>
    g.expectedIds.includes(id) ? i : null).filter(i => i !== null).join(','))).size).toBeGreaterThan(1);
});

// Omitting the Wort sense would ambiguously reject the alternative plural Worte.
test('word_context_is_explicit', () => {
  expect(lektion3PluralItems.find(i => i.nounId === 'wort')?.contextRu).toBe('отдельное слово языка');
  for (const item of lektion3PluralItems) expect(item.contextRu.trim().length).toBeGreaterThan(0);
});

// These reference qualifications prevent suffix-based guesses and accidental learning targets.
test('references_do_not_claim_suffix_guarantees', () => {
  expect(Object.keys(lektion3Reference)).toEqual([
    'definite-article-nominative', 'noun-plural', 'plural-invariant', 'diminutives-chen-lein',
  ]);
  const articles = lektion3Reference['definite-article-nominative'].text;
  for (const article of ['der', 'die', 'das', 'Nominativ']) expect(articles).toContain(article);
  const plural = lektion3Reference['noun-plural'].text;
  for (const text of ['Wörter', 'Worte', 'Spielzeuge', 'Cafés']) expect(plural).toContain(text);
  const invariant = lektion3Reference['plural-invariant'].text;
  for (const text of ['-er', '-el', '-n', 'не гарантируют', 'Apfel', 'Äpfel', 'умлаут', 'без артикля']) {
    expect(invariant).toContain(text);
  }
  const diminutives = lektion3Reference['diminutives-chen-lein'].text;
  for (const text of ['-chen', '-lein', 'среднего рода', 'Tischchen', 'Blümchen', 'Kindchen']) {
    expect(diminutives).toContain(text);
  }
  for (const rule of Object.values(lektion3Reference)) expect(rule.title.trim().length).toBeGreaterThan(0);
  expect(lektion3Targets.some(t => /chen-lein|tischchen|bluemchen|kindchen/.test(t.id))).toBe(false);
});
