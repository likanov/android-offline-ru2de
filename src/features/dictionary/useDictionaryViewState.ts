import { useCallback, useRef, useState } from 'react';
import { initialDictionaryViewState, type DictionaryViewState } from './dictionaryViewState';

export function useDictionaryViewState() {
  const values = useRef(new Map<string, DictionaryViewState>());
  const [, redraw] = useState(0);
  const get = useCallback((profileId: string): DictionaryViewState => values.current.get(profileId) ?? initialDictionaryViewState(), []);
  const update = useCallback((profileId: string, value: DictionaryViewState): void => {
    values.current.set(profileId, value);
    redraw(version => version + 1);
  }, []);
  return { get, update };
}
