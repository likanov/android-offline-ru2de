import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import type { SqlStore } from '../../core/sql';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { TypedAnswer } from '../learning/TypedAnswer';
import type { AssistantService } from './assistantService';
import type { ClozeExercise, ClozePractice, PracticeRequest } from './practiceTypes';
import { gradeCloze } from './practiceValidation';

export function PracticeScreen({ profileId, request, assistant, onBack }: {
    db: SqlStore;
    profileId: string;
    request: Extract<PracticeRequest, { kind: 'cloze' | 'difficult' }>;
    assistant: AssistantService;
    onBack(): void;
}) {
    const [practice, setPractice] = useState<ClozePractice | null>(null);
    const [index, setIndex] = useState(0);
    const [answer, setAnswer] = useState<{ value: string; right: boolean } | null>(null);
    const [status, setStatus] = useState('Создаём упражнение…');
    const [busy, setBusy] = useState(true);
    const abort = useRef<AbortController | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        abort.current = controller;
        setBusy(true);
        setStatus('Создаём упражнение…');
        void assistant.generatePractice(request, controller.signal, () => {}).then(result => {
            if (!controller.signal.aborted && (result.kind === 'cloze' || result.kind === 'difficult')) {
                setPractice(result);
                setStatus('');
            }
        }).catch(error => {
            if (!controller.signal.aborted)
                setStatus(error instanceof Error ? error.message : 'Не удалось создать упражнение');
        }).finally(() => {
            if (!controller.signal.aborted)
                setBusy(false);
        });
        return () => {
            controller.abort();
            void assistant.cancelAndRelease().catch(() => {});
        };
    }, [assistant, request]);
    const exercise: ClozeExercise | null = practice?.exercises[index] ?? null;
    function submit(value: string) {
        if (!exercise || answer)
            return;
        setAnswer({ value, right: gradeCloze(exercise, value) });
    }
    function next() {
        setAnswer(null);
        if (practice && index + 1 < practice.exercises.length)
            setIndex(index + 1);
        else
            setStatus('Практика завершена');
    }
    return <Screen>
        <Text accessibilityRole="header">Практика с пропуском</Text>
        <Text>Практика без XP и изменения серии</Text>
        {busy ? <ActivityIndicator accessibilityLabel="Помощник работает"/> : null}
        {status ? <Text testID="practice-summary">{status}</Text> : null}
        {exercise ? <>
            <Text>Вставьте немецкое слово</Text>
            <Text>{answer ? exercise.sentenceDe : `${exercise.before}___${exercise.after}`}</Text>
            {answer ? <><Text>{answer.right ? 'Верно' : 'Ошибка'}</Text><Text>Ответ: {exercise.expected.join(' / ')}</Text><Text>{exercise.translationRu}</Text><Button title="Дальше" testID="practice-next" onPress={next}/></> : <TypedAnswer onSubmit={submit}/>}
        </> : null}
        <Button title="К карточке" onPress={onBack}/>
    </Screen>;
}
