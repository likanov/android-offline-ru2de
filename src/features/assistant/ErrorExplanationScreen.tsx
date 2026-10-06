import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Text } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import type { AssistantService } from './assistantService';
import type { ErrorExplanation } from './practiceTypes';

export function ErrorExplanationScreen({ profileId, attemptId, assistant, onModelSetup, onBack }: {
    profileId: string;
    attemptId: string;
    assistant: AssistantService;
    onModelSetup(): void;
    onBack(): void;
}) {
    const [result, setResult] = useState<ErrorExplanation | null>(null);
    const [text, setText] = useState('');
    const [status, setStatus] = useState('Загрузка модели и разбор ошибки…');
    const [busy, setBusy] = useState(true);
    const [modelError, setModelError] = useState(false);
    const abort = useRef<AbortController | null>(null);
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        const controller = new AbortController();
        abort.current = controller;
        void assistant.generatePractice({ kind: 'error', profileId, attemptId }, controller.signal, token => {
            if (alive.current && abort.current === controller && !controller.signal.aborted)
                setText(previous => previous + token);
        }).then(value => {
            if (alive.current && abort.current === controller && !controller.signal.aborted) {
                if (value.kind !== 'error')
                    return;
                setResult(value);
                setText(value.text);
                setStatus('Объяснение помощника');
            }
        }).catch(error => {
            if (alive.current && abort.current === controller) {
                const code = (error as { code?: string })?.code;
                setModelError(code === 'MODEL');
                setText('');
                setStatus(code === 'CANCELLED' ? 'Генерация отменена' : error instanceof Error ? error.message : 'Не удалось объяснить ошибку');
            }
        }).finally(() => {
            if (alive.current && abort.current === controller) {
                setBusy(false);
                abort.current = null;
            }
        });
        const background = AppState.addEventListener('change', state => {
            if (state !== 'active') {
                controller.abort();
                void assistant.cancelAndRelease().catch(() => {});
            }
        });
        return () => {
            alive.current = false;
            controller.abort();
            background.remove();
            void assistant.cancelAndRelease().catch(() => {});
        };
    }, [assistant, profileId, attemptId]);
    const answer = result ? result.submittedAnswer ?? 'Ответ не сохранён' : null;
    return <Screen>
        <Text accessibilityRole="header">Разбор ошибки</Text>
        {busy ? <ActivityIndicator accessibilityLabel="Помощник работает"/> : null}
        <Text testID="assistant-status" accessibilityLiveRegion="polite">{status}</Text>
        {result ? <>
            <Text>Ваш ответ: {answer}</Text>
            <Text>Правильный ответ: {result.expected.join(' / ')}</Text>
            {result.referenceTitle ? <Text>{result.referenceTitle}</Text> : null}
        </> : null}
        {text ? <Text testID="error-explanation-text">{text}</Text> : null}
        {modelError ? <Button title="Установить локальную модель" onPress={onModelSetup}/> : null}
        <Button title="К тренировке" onPress={onBack}/>
    </Screen>;
}
