import type { Word } from '../learning/learningTypes';
import { displayGerman } from './wordValidation';

type SearchText = { exact: string; folded: string };

const foldMap: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', ё: 'е',
};

const clean = (text: string): string => text.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-DE');

export function normalizeSearch(text: string): SearchText {
  const exact = clean(text);
  return { exact, folded: exact.replace(/[äöüßё]/gu, char => foldMap[char] ?? char) };
}

function fields(word: Word): SearchText[] {
  return [word.de, displayGerman(word), word.ru, word.plural ?? ''].map(normalizeSearch);
}

function articleGender(query: string): Word['gender'] | null | undefined {
  if (query === 'der') return 'm';
  if (query === 'die') return 'f';
  if (query === 'das') return 'n';
  return undefined;
}

function rankField(field: SearchText, query: SearchText): number | null {
  if (field.exact === query.exact) return 0;
  if (field.exact.startsWith(query.exact)) return 1;
  if (field.exact.includes(query.exact)) return 2;
  if (field.folded === query.folded) return 3;
  if (field.folded.startsWith(query.folded)) return 4;
  if (field.folded.includes(query.folded)) return 5;
  return null;
}

export function searchWords<T extends Word>(rows: readonly T[], query: string): T[] {
  const normalized = normalizeSearch(query);
  if (!normalized.exact) {
    const collator = new Intl.Collator('de-DE', { sensitivity: 'base' });
    const seen = new Set<string>();
    return [...rows].filter(row => !seen.has(row.id) && (seen.add(row.id), true)).sort((a, b) => collator.compare(a.de, b.de) || a.id.localeCompare(b.id));
  }
  const article = articleGender(normalized.exact);
  const articlePrefix = /^(der|die|das)\s+/u.exec(normalized.exact);
  const searched = articlePrefix ? normalizeSearch(normalized.exact.slice(articlePrefix[0].length)) : normalized;
  const seen = new Set<string>();
  return rows
    .map((word, index) => {
      if (article !== undefined && (word.pos !== 'noun' || word.gender !== article)) return null;
      if (articlePrefix && (word.pos !== 'noun' || word.gender !== articleGender(articlePrefix[1]) || rankField(normalizeSearch(displayGerman(word)), normalized) === null)) return null;
      const rank = Math.min(...fields(word).map(field => rankField(field, searched)).filter((value): value is number => value !== null));
      return Number.isFinite(rank) ? { word, rank, index } : null;
    })
    .filter((value): value is { word: T; rank: number; index: number } => value !== null && !seen.has(value.word.id) && (seen.add(value.word.id), true))
    .sort((a, b) => a.rank - b.rank || new Intl.Collator('de-DE', { sensitivity: 'base' }).compare(a.word.de, b.word.de) || a.word.id.localeCompare(b.word.id) || a.index - b.index)
    .map(value => value.word);
}
