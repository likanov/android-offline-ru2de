import { TrainingError } from '../learning/sessionRepository';
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import type { SqlStore } from '../../core/sql';
import type { TrainingSelection } from '../learning/questionTypes';
import { getReviewRepository, getTrainingServices } from '../../app/AppServices';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { GoalSettings } from './GoalSettings';
import { useProgress } from './useProgress';
export function TodayScreen({ db, profileId, today: override, onStart, onProgress }: {
    db: SqlStore;
    profileId: string;
    today?: string;
    onStart: (selection: TrainingSelection) => void;
    onProgress: () => void;
}) {
    const { summary, error, today, repository } = useProgress(db, profileId, override);
    const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [next, setNext] = useState<string | null>(null);
    useEffect(() => { let alive = true; void getReviewRepository({ db }).nextDueDay(profileId, today).then(day => { if (alive)
        setNext(day); }).catch(e => { if (alive)
        setActionError(String(e)); }); return () => { alive = false; }; }, [db, profileId, today, summary]);
    async function start(mode: 'study' | 'review') { if (!summary || busy || (mode === 'study' ? summary.totalWords === summary.mastered : !summary.dueCount))
        return; setBusy(true); setActionError(''); try {
        const selection: TrainingSelection = mode === 'review' ? { mode, wordIds: (await getReviewRepository({ db }).dueWords(profileId, today)).slice(0, 5).map(w => w.id) } : { mode };
        if (mode === 'review' && !selection.wordIds?.length)
            throw new TrainingError('EMPTY_QUEUE', 'Нет доступных слов для занятия');
        const session = await getTrainingServices({ db }).sessions.start(profileId, selection, today);
        if (session)
            onStart(selection);
    }
    catch (e) {
        setActionError(String(e));
    }
    finally {
        setBusy(false);
    } }
    return <Screen><Text style={{ fontSize: 28 }}>Сегодня</Text>{error || actionError ? <Text accessibilityRole="alert">{error || actionError}</Text> : null}{summary ? <><Text>Сегодня: {summary.todayCorrect} / {summary.goal}</Text><Text>XP: {summary.xp}</Text><Text>Уровень: {summary.level}</Text><Text>До следующего уровня: {summary.xpToNextLevel} XP</Text><Text>Серия дней: {summary.dayStreak}</Text><Text>Изучено: {summary.mastered} / {summary.totalWords}</Text><Text>К повторению: {summary.dueCount}</Text>{!summary.dueCount ? <Text>На сегодня повторений нет</Text> : null}{next ? <Text>Следующее повторение: {next}</Text> : null}<GoalSettings key={`${profileId}:${summary.goal}`} repository={repository} profileId={profileId} goal={summary.goal}/></> : <Text>Загрузка…</Text>}<Button title="Изучать слова" disabled={busy || !summary || summary.totalWords === summary.mastered} onPress={() => void start('study')}/><Button title="Повторить сегодня" disabled={busy || !summary?.dueCount} onPress={() => void start('review')}/><Button title="Открыть прогресс" onPress={onProgress}/></Screen>;
}
