import { useEffect, useMemo, useState } from 'react';
import type { SqlStore } from '../../core/sql';
import { getProgressRepository } from '../../app/AppServices';
import { subscribeProfileChanges } from '../../app/refreshBus';
import { useCurrentDay } from '../../app/useCurrentDay';
import type { ProgressSummary } from './progressRepository';
export function useProgress(db: SqlStore, profileId: string, override?: string) {
    const current = useCurrentDay(), today = override ?? current, repository = useMemo(() => getProgressRepository({ db }), [db]);
    const [result, setResult] = useState<{
        db: SqlStore;
        profileId: string;
        today: string;
        summary: ProgressSummary | null;
        error: string;
    } | null>(null);
    useEffect(() => {
        let alive = true, version = 0;
        const reload = () => {
            const request = ++version;
            void repository.summary(profileId, today).then(summary => { if (alive && request === version)
                setResult({ db, profileId, today, summary, error: '' }); }).catch(e => { if (alive && request === version)
                setResult({ db, profileId, today, summary: null, error: String(e) }); });
        };
        reload();
        const off = subscribeProfileChanges(profileId, reload);
        return () => { alive = false; off(); };
    }, [db, repository, profileId, today]);
    const matches = result?.db === db && result.profileId === profileId && result.today === today;
    return { summary: matches ? result.summary : null, error: matches ? result.error : '', today, repository };
}
