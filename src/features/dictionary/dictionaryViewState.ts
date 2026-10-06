import type { WordFilter } from './wordRepository';

export type DictionaryViewState = {
  filter: WordFilter;
  filtersExpanded: boolean;
  scrollOffset: number;
};

export function initialDictionaryViewState(): DictionaryViewState {
  return { filter: { state: 'all' }, filtersExpanded: false, scrollOffset: 0 };
}
