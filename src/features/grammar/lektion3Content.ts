import type {
  Lektion3ArticleItem, Lektion3InvariantGroup, Lektion3InvariantSourceItem,
  Lektion3Noun, Lektion3NounId, Lektion3PluralItem, Lektion3Target,
} from './lektion3Types';

// Trusted lesson forms, explicitly transcribed; no plural is inferred from a suffix.
export const lektion3Nouns: readonly Lektion3Noun[] = [
  { id: 'tisch', de: 'Tisch', ru: 'стол', gender: 'm', plural: 'Tische', unchanged: false },
  { id: 'buch', de: 'Buch', ru: 'книга', gender: 'n', plural: 'Bücher', unchanged: false },
  { id: 'zeitung', de: 'Zeitung', ru: 'газета', gender: 'f', plural: 'Zeitungen', unchanged: false },
  { id: 'kind', de: 'Kind', ru: 'ребёнок', gender: 'n', plural: 'Kinder', unchanged: false },
  { id: 'student', de: 'Student', ru: 'студент', gender: 'm', plural: 'Studenten', unchanged: false },
  { id: 'bild', de: 'Bild', ru: 'картина, изображение', gender: 'n', plural: 'Bilder', unchanged: false },
  { id: 'mann', de: 'Mann', ru: 'мужчина', gender: 'm', plural: 'Männer', unchanged: false },
  { id: 'kino', de: 'Kino', ru: 'кинотеатр', gender: 'n', plural: 'Kinos', unchanged: false },
  { id: 'strasse', de: 'Straße', ru: 'улица', gender: 'f', plural: 'Straßen', unchanged: false },
  { id: 'hotel', de: 'Hotel', ru: 'гостиница', gender: 'n', plural: 'Hotels', unchanged: false },
  { id: 'haus', de: 'Haus', ru: 'дом', gender: 'n', plural: 'Häuser', unchanged: false },
  { id: 'wort', de: 'Wort', ru: 'отдельное слово языка', gender: 'n', plural: 'Wörter', unchanged: false },
  { id: 'blume', de: 'Blume', ru: 'цветок', gender: 'f', plural: 'Blumen', unchanged: false },
  { id: 'hand', de: 'Hand', ru: 'рука', gender: 'f', plural: 'Hände', unchanged: false },
  { id: 'stift', de: 'Stift', ru: 'карандаш, письменный инструмент', gender: 'm', plural: 'Stifte', unchanged: false },
  { id: 'computer', de: 'Computer', ru: 'компьютер', gender: 'm', plural: 'Computer', unchanged: true },
  { id: 'lampe', de: 'Lampe', ru: 'лампа', gender: 'f', plural: 'Lampen', unchanged: false },
  { id: 'nacht', de: 'Nacht', ru: 'ночь', gender: 'f', plural: 'Nächte', unchanged: false },
  { id: 'maedchen', de: 'Mädchen', ru: 'девочка', gender: 'n', plural: 'Mädchen', unchanged: true },
  { id: 'lehrer', de: 'Lehrer', ru: 'учитель', gender: 'm', plural: 'Lehrer', unchanged: true },
  { id: 'tasche', de: 'Tasche', ru: 'сумка', gender: 'f', plural: 'Taschen', unchanged: false },
  { id: 'stuhl', de: 'Stuhl', ru: 'стул', gender: 'm', plural: 'Stühle', unchanged: false },
  { id: 'zug', de: 'Zug', ru: 'поезд', gender: 'm', plural: 'Züge', unchanged: false },
  { id: 'spielzeug', de: 'Spielzeug', ru: 'игрушка', gender: 'n', plural: 'Spielzeuge', unchanged: false },
  { id: 'zeitschrift', de: 'Zeitschrift', ru: 'журнал', gender: 'f', plural: 'Zeitschriften', unchanged: false },
  { id: 'zimmer', de: 'Zimmer', ru: 'комната', gender: 'n', plural: 'Zimmer', unchanged: true },
  { id: 'mensch', de: 'Mensch', ru: 'человек', gender: 'm', plural: 'Menschen', unchanged: false },
  { id: 'schrank', de: 'Schrank', ru: 'шкаф', gender: 'm', plural: 'Schränke', unchanged: false },
  { id: 'techniker', de: 'Techniker', ru: 'техник', gender: 'm', plural: 'Techniker', unchanged: true },
  { id: 'sportler', de: 'Sportler', ru: 'спортсмен', gender: 'm', plural: 'Sportler', unchanged: true },
  { id: 'arbeiter', de: 'Arbeiter', ru: 'рабочий', gender: 'm', plural: 'Arbeiter', unchanged: true },
  { id: 'designer', de: 'Designer', ru: 'дизайнер', gender: 'm', plural: 'Designer', unchanged: true },
  { id: 'satz', de: 'Satz', ru: 'предложение', gender: 'm', plural: 'Sätze', unchanged: false },
  { id: 'cafe', de: 'Café', ru: 'кафе', gender: 'n', plural: 'Cafés', unchanged: false },
];

const articleOrder: readonly Lektion3NounId[] = [
  'tisch', 'buch', 'zeitung', 'kind', 'student', 'bild', 'mann',
  'kino', 'strasse', 'hotel', 'haus', 'wort', 'blume', 'hand',
];
export const lektion3ArticleItems: readonly Lektion3ArticleItem[] = articleOrder.flatMap((nounId, index) => [
  { id: `lektion3:3.1:${index * 2 + 1}`, sourceExercise: '3.1', sourceItem: index * 2 + 1, nounId, number: 'singular' },
  { id: `lektion3:3.1:${index * 2 + 2}`, sourceExercise: '3.1', sourceItem: index * 2 + 2, nounId, number: 'plural' },
]);

const pluralOrder: readonly Lektion3NounId[] = [
  'stift', 'computer', 'kind', 'buch', 'lampe', 'strasse', 'nacht', 'wort',
  'zeitung', 'maedchen', 'lehrer', 'kino', 'tasche', 'stuhl', 'zug', 'spielzeug',
  'hotel', 'bild', 'student', 'haus', 'mann', 'hand', 'zeitschrift', 'zimmer', 'mensch',
];
export const lektion3PluralItems: readonly Lektion3PluralItem[] = pluralOrder.map((nounId, index) => ({
  id: `lektion3:3.2:${index + 1}`,
  sourceExercise: '3.2',
  sourceItem: index + 1,
  nounId,
  contextRu: lektion3Nouns.find(noun => noun.id === nounId)!.ru,
}));

const invariantSourceOrder: readonly Lektion3NounId[] = [
  'mensch', 'student', 'lehrer', 'schrank', 'stuhl', 'stift', 'computer', 'bild',
  'wort', 'haus', 'zimmer', 'kind', 'spielzeug', 'maedchen', 'mann', 'techniker',
  'zeitschrift', 'sportler', 'tisch', 'arbeiter', 'zeitung', 'blume', 'designer',
  'hotel', 'satz', 'nacht', 'stuhl', 'zug', 'cafe', 'tasche',
];
export const lektion3InvariantSourceItems: readonly Lektion3InvariantSourceItem[] = invariantSourceOrder.map((nounId, index) => ({
  sourceExercise: '3.3', sourceItem: index + 1, nounId,
}));

const invariantPool: readonly Lektion3NounId[] = [
  'lehrer', 'computer', 'zimmer', 'maedchen', 'techniker', 'sportler', 'arbeiter', 'designer',
];
const changedPool: readonly Lektion3NounId[] = [
  'mensch', 'student', 'schrank', 'stuhl', 'stift', 'bild', 'wort', 'haus', 'kind',
  'spielzeug', 'mann', 'zeitschrift', 'tisch', 'zeitung', 'blume', 'hotel', 'satz',
  'nacht', 'zug', 'cafe', 'tasche',
];

// Each pair of groups consumes five positives and seven negatives. Thirty positive
// appearances cover each of eight nouns at least three times; 42 negatives cover
// each of 21 twice. Fixed interleaving and rotation avoid constant answer positions.
export const lektion3InvariantGroups: readonly Lektion3InvariantGroup[] = Array.from({ length: 12 }, (_, index) => {
  const secondInPair = index % 2 === 1;
  const pair = Math.floor(index / 2);
  const positiveCount = secondInPair ? 3 : 2;
  const positiveStart = pair * 5 + (secondInPair ? 2 : 0);
  const negativeStart = pair * 7 + (secondInPair ? 4 : 0);
  const expectedIds = Array.from({ length: positiveCount }, (_, offset) =>
    invariantPool[(positiveStart + offset) % invariantPool.length]);
  const negatives = Array.from({ length: 6 - positiveCount }, (_, offset) =>
    changedPool[(negativeStart + offset) % changedPool.length]);
  const combined = [...expectedIds, ...negatives];
  const interleaved = [0, 3, 1, 4, 2, 5].map(position => combined[position]);
  const nounIds = interleaved.map((_, position) => interleaved[(position + index) % 6]);
  return { id: `lektion3:3.3:group:${index + 1}`, nounIds, expectedIds };
});

export const lektion3Targets: readonly Lektion3Target[] = [
  ...articleOrder.map((nounId): Lektion3Target => ({
    id: `noun-article:${nounId}`, kind: 'noun-article', pronounId: null,
    labelRu: `Артикли: ${lektion3Nouns.find(noun => noun.id === nounId)!.de}`, catalogVersion: 3,
  })),
  ...pluralOrder.map((nounId): Lektion3Target => ({
    id: `noun-plural:${nounId}`, kind: 'noun-plural', pronounId: null,
    labelRu: `Множественное число: ${lektion3Nouns.find(noun => noun.id === nounId)!.de}`, catalogVersion: 3,
  })),
  { id: 'plural-invariant:recognition', kind: 'plural-invariant', pronounId: null,
    labelRu: 'Найдите неизменяемые формы', catalogVersion: 3 },
];
