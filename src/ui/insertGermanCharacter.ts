export type GermanCharacter = 'ä' | 'ö' | 'ü' | 'ß';

export function insertGermanCharacter(
  value: string,
  selection: { start: number; end: number },
  letter: GermanCharacter,
): { value: string; selection: { start: number; end: number } } {
  const start = Math.max(0, Math.min(value.length, Math.min(selection.start, selection.end)));
  const end = Math.max(start, Math.min(value.length, Math.max(selection.start, selection.end)));
  const nextValue = `${value.slice(0, start)}${letter}${value.slice(end)}`;
  const cursor = start + letter.length;
  return { value: nextValue, selection: { start: cursor, end: cursor } };
}
