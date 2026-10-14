import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../ui/Button';
import type { LearningState } from '../learning/learningTypes';
import type { GrammarAttemptResult, GrammarQuestion, GrammarSubmission } from './grammarTypes';
import { GrammarTypedAnswer } from './GrammarTypedAnswer';
import { normalizeGrammarSentence } from './grammarSentenceAnswer';
import { grammarChoiceOptions } from './grammarChoiceOptions';
import { GrammarMultiChoiceAnswer } from './GrammarMultiChoiceAnswer';
import { grammarQuestionPrompt } from './grammarPresentation';
export function GrammarQuestionView({ question, result, currentState, busy, onSubmit, onNext, onExplainError, onReference, onRepeatAudio, onStopAudio, audioUnavailable = false }: {
  question: GrammarQuestion;
  result: GrammarAttemptResult | null;
  currentState: LearningState | null;
  busy: boolean;
  onSubmit: (answer: GrammarSubmission) => void;
  onNext: () => void;
  onExplainError: () => void;
  onReference?: () => void;
  onRepeatAudio?: () => void;
  onStopAudio?: () => void;
  audioUnavailable?: boolean;
}) {
  const prompt = grammarQuestionPrompt(question);
  const invariant = question.catalogVersion === 3 && question.kind === 'plural-invariant' ? question : null;
  const sentence=question.catalogVersion===2 && question.presentation==='sentence';
  const submittedText = result?.submittedAnswer.kind==='typed' ? result.submittedAnswer.text : null;
  const expectedTexts = question.catalogVersion===2 && question.presentation==='sentence' ? question.expected.sentences : question.catalogVersion !== 3 ? [question.expected.token] : [];
  const caseError = result && !result.right && submittedText!==null && expectedTexts.some(text=>normalizeGrammarSentence(text).toLowerCase()===normalizeGrammarSentence(submittedText).toLowerCase());
  const sieCaseError = caseError && submittedText !== null && expectedTexts.some(text => {
    const expected = normalizeGrammarSentence(text);
    const submitted = normalizeGrammarSentence(submittedText);
    return expected.toLowerCase() === submitted.toLowerCase() && expected.split(' ').some((token,index) =>
      /^(sie|Sie)$/.test(token) && submitted.split(' ')[index] !== token);
  });
  return <View>
    {question.contextRu !== prompt.prompt ? <Text testID="grammar-context" style={{ fontSize: 17 }}>{question.contextRu}</Text> : null}
    <Text testID="grammar-prompt" style={{ fontSize: 25 }}>{prompt.prompt}</Text>
    {prompt.sourceDe ? <Text testID="grammar-source">{prompt.sourceDe}</Text> : null}
    {!result && 'options' in question && question.responseMode === 'choice' ? <View>{(question.catalogVersion===1?grammarChoiceOptions(question):question.options).map(option => <Button key={option.id} testID={`grammar-option-${option.id}`} title={option.label} disabled={busy} onPress={() => onSubmit({ kind: 'choice', optionId: option.id })} />)}</View> : null}
    {!result && question.responseMode === 'typed' ? <GrammarTypedAnswer key={`${question.profileId}:${question.attemptId}`} maxLength={sentence?256:64} disabled={busy} onSubmit={text => onSubmit({ kind: 'typed', text })} /> : null}
    {!result && invariant ? <GrammarMultiChoiceAnswer key={`${question.profileId}:${question.attemptId}`} options={invariant.options} disabled={busy} onSubmit={optionIds => onSubmit({ kind: 'multi-choice', optionIds })} /> : null}
    {result && invariant ? <View>{invariant.feedback.items.map(item => {
      const selected = result.submittedAnswer.kind === 'multi-choice' && result.submittedAnswer.optionIds.includes(item.nounId);
      const expected = invariant.expected.optionIds.includes(item.nounId);
      const status = selected && !expected ? 'Лишний выбор' : !selected && expected ? 'Пропущено' : expected ? 'Неизменяемая форма' : 'Форма меняется';
      return <View key={item.nounId} testID={`grammar-multi-feedback-${item.nounId}`}><Text>{status}</Text><Text>{item.singularDe} → {item.pluralDe}</Text><Text>{item.translationRu}</Text></View>;
    })}</View> : null}
    {result ? <View testID="grammar-result"><Text>{result.right ? `Верно! +${result.xpDelta} XP` : 'Ошибка. Повторите правило.'}</Text>{caseError ? <Text>{sieCaseError ? 'Проверьте регистр букв: Sie и sie имеют разное значение.' : 'Проверьте регистр букв.'}</Text> : null}{!invariant ? <><Text>Ответ: {question.feedback.sentenceDe}</Text><Text>{question.feedback.translationRu}</Text></> : null}<Text>{question.feedback.explanationRu}</Text>{result.right && currentState?.mastered ? <Text>Освоение завершено.</Text> : null}{question.reviewStage !== null && !result.right ? <Text>Освоение сохранено, следующее повторение назначено на завтра.</Text> : null}{currentState ? <Text testID="grammar-streak">Серия: {currentState.streak}/10</Text> : null}{onRepeatAudio ? <Button title="Повторить озвучку" variant="secondary" testID="grammar-result-audio-repeat" disabled={busy} onPress={onRepeatAudio} /> : null}{onStopAudio ? <Button title="Остановить озвучку" variant="secondary" testID="grammar-result-audio-stop" disabled={busy} onPress={onStopAudio} /> : null}{audioUnavailable ? <Text>Офлайн-озвучка недоступна.</Text> : null}{!result.right ? <Button title="Объяснить ошибку" variant="secondary" testID="grammar-error-open" disabled={busy} onPress={onExplainError} /> : null}<Button title="Продолжить" testID="grammar-next" disabled={busy} onPress={onNext} /></View> : null}
    <Button title="Справочник" variant="secondary" testID="grammar-reference-open" disabled={busy} onPress={() => onReference?.()} />
  </View>;
}
