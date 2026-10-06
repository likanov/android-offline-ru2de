import { useCallback, useEffect, useRef, useState } from 'react';
import type { SqlStore } from '../../core/sql';
import { subscribeProfileChanges } from '../../app/refreshBus';
import { DictionaryRepository } from './dictionaryRepository';
import type { DictionarySnapshot } from './dictionaryTypes';

type DictionaryDataStatus = 'loading' | 'ready' | 'error';
export type DictionaryData = {
  snapshot: DictionarySnapshot | null;
  status: DictionaryDataStatus;
  error: string | null;
  reload: () => void;
};

export function useDictionaryData(db: SqlStore, profileId: string): DictionaryData {
  const [snapshot, setSnapshot] = useState<DictionarySnapshot | null>(null);
  const [status, setStatus] = useState<DictionaryDataStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const requestVersion = useRef(0);
  const reload = useCallback(() => setVersion(value => value + 1), []);

  useEffect(() => {
    let alive = true;
    const request = ++requestVersion.current;
    const repository = new DictionaryRepository(db);
    setStatus('loading');
    setError(null);
    void repository.load(profileId).then(value => {
      if (!alive || request !== requestVersion.current) return;
      setSnapshot(value); setStatus('ready');
    }).catch(reason => {
      if (!alive || request !== requestVersion.current) return;
      setSnapshot(null); setStatus('error'); setError(reason instanceof Error ? reason.message : 'Не удалось загрузить словарь');
    });
    const unsubscribe = subscribeProfileChanges(profileId, reload);
    return () => { alive = false; unsubscribe(); };
  }, [db, profileId, reload, version]);

  return { snapshot, status, error, reload };
}
