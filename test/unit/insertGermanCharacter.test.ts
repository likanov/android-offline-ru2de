import { insertGermanCharacter } from '../../src/ui/insertGermanCharacter';

test('inserts_at_cursor_and_replaces_selection', () => {
  expect(insertGermanCharacter('Haus', { start: 1, end: 1 }, 'ä'))
    .toEqual({ value: 'Häaus', selection: { start: 2, end: 2 } });
  expect(insertGermanCharacter('Haus', { start: 1, end: 3 }, 'ö'))
    .toEqual({ value: 'Hös', selection: { start: 2, end: 2 } });
  expect(insertGermanCharacter('Haus', { start: -2, end: 99 }, 'ü'))
    .toEqual({ value: 'ü', selection: { start: 1, end: 1 } });
});
