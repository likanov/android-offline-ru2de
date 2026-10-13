import { grammarExpectedAnswer } from '../grammar/grammarPresentation';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Text } from 'react-native';
import type { SqlStore } from '../../core/sql';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import type { AssistantService } from './assistantService';
import type { GrammarErrorContext } from './grammarErrorContext';
import { loadGrammarErrorContext } from './grammarErrorContext';
import type { GrammarErrorExplanation } from './practiceTypes';

export function GrammarExplanationScreen({ db, profileId, attemptId, assistant, onModelSetup, onBack }: {
  db: SqlStore;
  profileId: string;
  attemptId: string;
  assistant: AssistantService;
  onModelSetup(): void;
  onBack(): void;
}) {
  const [context, setContext] = useState<GrammarErrorContext | null>(null);
  const [generated, setGenerated] = useState<GrammarErrorExplanation | null>(null);
  const [stream, setStream] = useState('');
  const [status, setStatus] = useState('Загрузка сохранённой ошибки…');
  const [busy, setBusy] = useState(true);
  const [modelError, setModelError] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    void loadGrammarErrorContext(db, profileId, attemptId).then(value => {
      if (alive.current && controllerRef.current === controller && !controller.signal.aborted) {
        setContext(value);
        setStatus('Локальное правило');
      }
    }).catch(error => {
      if (alive.current && controllerRef.current === controller && !controller.signal.aborted)
        setStatus(error instanceof Error ? error.message : 'Не удалось открыть ошибку');
    }).finally(() => {
      if (alive.current && controllerRef.current === controller && !controller.signal.aborted)
        setBusy(false);
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
  }, [assistant, attemptId, db, profileId]);

  async function explain() {
    if (!context || busy || generated)
      return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setBusy(true);
    setModelError(false);
    setStream('');
    setStatus('Помощник объясняет…');
    try {
      const value = await assistant.generatePractice(
        { kind: 'grammar-error', profileId, attemptId },
        controller.signal,
        token => {
          if (alive.current && controllerRef.current === controller && !controller.signal.aborted)
            setStream(previous => previous + token);
        },
      );
      if (alive.current && controllerRef.current === controller && !controller.signal.aborted && value.kind === 'grammar-error') {
        setGenerated(value);
        setStream(value.text);
        setStatus('Подробное объяснение');
      }
    } catch (error) {
      if (alive.current && controllerRef.current === controller && !controller.signal.aborted) {
        const code = (error as { code?: string })?.code;
        setModelError(code === 'MODEL');
        setStatus(code === 'CANCELLED' ? 'Генерация отменена' : error instanceof Error ? error.message : 'Не удалось объяснить ошибку');
      }
    } finally {
      if (alive.current && controllerRef.current === controller && !controller.signal.aborted)
        setBusy(false);
    }
  }

  const result = context?.result;
  const answer = result?.submittedAnswer;
  let submitted = 'Ответ не сохранён';
  if (answer?.kind === 'typed') submitted = answer.text;
  else if (answer?.kind === 'choice') submitted = answer.optionId;
  else if (answer?.kind === 'multi-choice' && context?.question.catalogVersion === 3 && context.question.kind === 'plural-invariant') {
    const labels = new Map(context.question.options.map(option => [option.id, option.label]));
    submitted = answer.optionIds.map(id => labels.get(id) ?? id).join(', ');
  }
  return <Screen>
    <Text accessibilityRole="header" style={{ fontSize: 28 }}>Разбор грамматической ошибки</Text>
    {busy ? <ActivityIndicator accessibilityLabel="Помощник работает" /> : null}
    <Text testID="grammar-explanation-status" accessibilityLiveRegion="polite">{status}</Text>
    {context ? <>
      <Text testID="grammar-error-context">{context.question.contextRu}</Text>
      <Text>Ваш ответ: {submitted}</Text>
      <Text>Правильный ответ: {grammarExpectedAnswer(context.question)}</Text>
      <Text>{context.question.feedback.sentenceDe}</Text>
      <Text>{context.question.feedback.translationRu}</Text>
      <Text testID="grammar-error-reference-title">{context.reference.title}</Text>
      <Text testID="grammar-error-reference-text">{context.reference.text}</Text>
      <Button title="Объяснить подробнее" testID="grammar-explain-more" disabled={busy || !!generated} onPress={() => void explain()} />
    </> : null}
    {stream ? <Text testID="grammar-error-explanation-text">{stream}</Text> : null}
    {modelError ? <Button title="Настроить локальную модель" onPress={onModelSetup} /> : null}
    <Button title="К тренировке" onPress={onBack} />
  </Screen>;
}
