import React, { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { DayKey, Word } from '../learning/learningTypes';
import type { TrainingSelection } from '../learning/questionTypes';
import { getReviewRepository, getTrainingServices } from '../../app/AppServices';

import { useCurrentDay } from '../../app/useCurrentDay';
import { localDay } from '../../core/calendar';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
export function ReviewsScreen({ db, profileId, today: injectedDay, onStart }: {
    db: SqlStore; profileId: string; today?: DayKey; onStart: (selection: TrainingSelection) => void;
}) {
    const calendarDay = useCurrentDay(), today = injectedDay ?? calendarDay;
    const reviews = useMemo(() => getReviewRepository({ db }), [db]);
    const [words, setWords] = useState<Word[]>([]), [nextDay, setNextDay] = useState<DayKey | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
    useEffect(() => {
        let alive = true;
        void Promise.all([reviews.dueWords(profileId, today), reviews.nextDueDay(profileId, today)]).then(([due, next]) => {
            if (alive) { setWords(due); setNextDay(next); setBusy(false); }
        }).catch(e => { if (alive) { setError(String(e)); setBusy(false); } });
        return () => { alive = false; };
    }, [reviews, profileId, today]);
    async function start() {
        if (busy || !words.length) return;
        setBusy(true); setError('');
        try {
            // Select the oldest five before SessionRepository applies its pool limit.
            const selection: TrainingSelection = { mode: 'review', wordIds: words.slice(0, 5).map(w => w.id) };
            await getTrainingServices({ db }).sessions.start(profileId, selection, injectedDay ?? localDay(new Date()));
            onStart(selection);
        } catch (e) { setError(String(e)); } finally { setBusy(false); }
    }
    return <Screen><Text style={{ fontSize: 28 }}>Повторения</Text>{error ? <Text accessibilityRole="alert">{error}</Text> : null}
        {busy ? <Text>Загрузка…</Text> : words.length ? <Text>К повторению: {words.length}</Text> : <Text>На сегодня повторений нет</Text>}
        {words.map(word => <Text key={word.id}>{word.de} — {word.ru}</Text>)}
        {nextDay ? <Text>Следующее повторение: {nextDay}</Text> : null}
        <Button title="Начать повторение" disabled={busy || !words.length} onPress={() => void start()}/>
    </Screen>;
}
