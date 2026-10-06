import type { Word } from '../../src/features/learning/learningTypes';
import { searchWords } from '../../src/features/dictionary/dictionarySearch';

const word = (overrides: Partial<Word>): Word => ({
  id: overrides.id ?? overrides.de ?? 'w', profileId: 'p', de: overrides.de ?? 'Buch',
  ru: overrides.ru ?? 'книга', pos: overrides.pos ?? 'noun', gender: overrides.gender ?? 'n',
  plural: overrides.plural ?? null, exampleDe: null, exampleRu: null, note: '', ...overrides,
});

test('search_finds_article_plural_and_spelling_variants', () => {
  const buch = word({ id: 'buch', de: 'Buch', ru: 'книга', gender: 'n', plural: 'Bücher' });
  const kind = word({ id: 'kind', de: 'Kind', ru: 'ребёнок', gender: 'n', plural: 'Kinder' });
  const gruen = word({ id: 'gruen', de: 'grün', ru: 'зелёный', pos: 'adjective', gender: null });
  const strasse = word({ id: 'strasse', de: 'Straße', ru: 'улица', gender: 'f', plural: 'Straßen' });
  expect(searchWords([buch], 'das Buch')).toEqual([buch]);
  expect(searchWords([buch], 'Bücher')).toEqual([buch]);
  expect(searchWords([kind], 'ребенок')).toEqual([kind]);
  expect(searchWords([gruen], 'gruen')).toEqual([gruen]);
  expect(searchWords([strasse], 'Strasse')).toEqual([strasse]);
});

test('article_only_query_selects_nouns_by_gender', () => {
  const words = [
    word({ id: 'm', de: 'Tisch', ru: 'стол', gender: 'm' }),
    word({ id: 'f', de: 'Lampe', ru: 'лампа', gender: 'f' }),
    word({ id: 'n', de: 'Buch', ru: 'книга', gender: 'n' }),
    word({ id: 'a', de: 'neu', ru: 'новый', pos: 'adjective', gender: null }),
  ];
  expect(searchWords(words, 'DER').map(item => item.id)).toEqual(['m']);
  expect(searchWords(words, 'die').map(item => item.id)).toEqual(['f']);
  expect(searchWords(words, 'das').map(item => item.id)).toEqual(['n']);
});

test('exact_spelling_ranks_above_folded_alternative_and_keeps_both_records', () => {
  const exact = word({ id: 'exact', de: 'Straße', ru: 'улица' });
  const alternative = word({ id: 'alternative', de: 'Strasse', ru: 'другая улица' });
  expect(searchWords([alternative, exact], 'Straße').map(item => item.id)).toEqual(['exact', 'alternative']);
});

test('search_handles_nfd_whitespace_literals_empty_query_and_deduplicates', () => {
  const umlaut = word({ id: 'umlaut', de: 'Grün', ru: 'зелёный' });
  const alpha = word({ id: 'alpha', de: 'Äpfel', ru: 'яблоки' });
  const percent = word({ id: 'percent', de: '100%', ru: 'сто процентов' });
  expect(searchWords([umlaut], ' GRU\u0308N ')).toEqual([umlaut]);
  expect(searchWords([percent], '%')).toEqual([percent]);
  expect(searchWords([umlaut, alpha, umlaut], '').map(item => item.id)).toEqual(['alpha', 'umlaut']);
});
