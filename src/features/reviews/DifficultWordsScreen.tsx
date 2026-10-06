import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { DayKey } from '../learning/learningTypes';
import type { TrainingSelection } from '../learning/questionTypes';
import { getReviewRepository, getTrainingServices } from '../../app/AppServices';
import { type DifficultWord } from './reviewRepository';
import { localDay } from '../../core/calendar';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
export function DifficultWordsScreen({ db, profileId, today = localDay(new Date()), onStart, onPractice }: {
    db: SqlStore; profileId: string; today?: DayKey; onStart: (selection: TrainingSelection) => void; onPractice?: (wordIds: string[]) => void;
}) {
    const reviews = useMemo(() => getReviewRepository({ db }), [db]);
    const [words, setWords] = useState<DifficultWord[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState(''), [preview, setPreview] = useState(false);
    useEffect(() => {
        let alive = true;
        void reviews.difficultWords(profileId, today).then(rows => { if (alive) { setWords(rows); setBusy(false); } }).catch(e => { if (alive) { setError(String(e)); setBusy(false); } });
        return () => { alive = false; };
    }, [reviews, profileId, today]);
    const study = words.filter(row => row.eligible && row.dueDay === null);
    const due = words.filter(row => row.eligible && row.dueDay !== null);
    const practice = words.slice(0, 5);
    async function start(mode: 'study' | 'review') {
        const pool = mode === 'study' ? study : due;
        if (busy || !pool.length) return;
        setBusy(true); setError('');
        try {
            const selection: TrainingSelection = { mode, wordIds: pool.map(row => row.word.id) };
            await getTrainingServices({ db }).sessions.start(profileId, selection, today);
            onStart(selection);
        } catch (e) { setError(String(e)); } finally { setBusy(false); }
    }
    return <Screen><Text style={{ fontSize: 28 }}>Трудные слова</Text>{error ? <Text accessibilityRole="alert">{error}</Text> : null}
        {busy ? <Text>Загрузка…</Text> : !words.length ? <Text>Трудных слов пока нет</Text> : null}
        {words.map(row => <View key={row.word.id}><Text>{row.word.de} — {row.word.ru}</Text>
            <Text>{row.dueDay ? `Следующее повторение: ${row.dueDay}` : 'Первоначальное изучение'}</Text>
            {!row.eligible ? <Text>Повторение пока недоступно</Text> : null}</View>)}
        {preview ? <><Text>Практика без XP и изменения серии</Text><Text>Выбрано: {practice.map(row => row.word.de).join(', ')}</Text><Button title="Начать практику" onPress={() => onPractice?.(practice.map(row => row.word.id))}/></> : null}
        {onPractice ? <Button title="Практика с помощником" disabled={busy || !practice.length} onPress={() => setPreview(true)}/> : null}
        <Button title="Изучать трудные слова" disabled={busy || !study.length} onPress={() => void start('study')}/>
        <Button title="Повторить трудные слова" disabled={busy || !due.length} onPress={() => void start('review')}/>
    </Screen>;
}
