import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../ui/Button';
import type { LearningState } from '../learning/learningTypes';
import type { GrammarAttemptResult, PreLektion3Question, GrammarSubmission } from './grammarTypes';
import { GrammarTypedAnswer } from './GrammarTypedAnswer';
import { normalizeGrammarSentence } from './grammarSentenceAnswer';
import { grammarChoiceOptions } from './grammarChoiceOptions';
export function GrammarQuestionView({ question, result, currentState, busy, onSubmit, onNext, onExplainError, onReference }: {
  question: PreLektion3Question;
  result: GrammarAttemptResult | null;
  currentState: LearningState | null;
  busy: boolean;
  onSubmit: (answer: GrammarSubmission) => void;
  onNext: () => void;
  onExplainError: () => void;
  onReference?: () => void;
}) {
  const sentence=question.catalogVersion===2 && question.presentation==='sentence';
  const submittedText = result?.submittedAnswer.kind==='typed' ? result.submittedAnswer.text : null;
  const expectedTexts = question.catalogVersion===2 && question.presentation==='sentence' ? question.expected.sentences : [question.expected.token];
  const caseError = result && !result.right && submittedText!==null && expectedTexts.some(text=>normalizeGrammarSentence(text).toLowerCase()===normalizeGrammarSentence(submittedText).toLowerCase());
  const sieCaseError = caseError && submittedText !== null && expectedTexts.some(text => {
    const expected = normalizeGrammarSentence(text);
    const submitted = normalizeGrammarSentence(submittedText);
    return expected.toLowerCase() === submitted.toLowerCase() && expected.split(' ').some((token,index) =>
      /^(sie|Sie)$/.test(token) && submitted.split(' ')[index] !== token);
  });
  return <View>
    <Text testID="grammar-context" style={{ fontSize: 17 }}>{question.contextRu}</Text>
    <Text testID="grammar-prompt" style={{ fontSize: 25 }}>{question.catalogVersion===2 && question.presentation==='sentence' ? question.promptRu : `${question.beforeDe}___${question.afterDe}`}</Text>
    {sentence && question.sourceSentenceDe ? <Text testID="grammar-source">{question.sourceSentenceDe}</Text> : null}
    {!result && !sentence && question.responseMode === 'choice' ? <View>{(question.catalogVersion===1?grammarChoiceOptions(question):question.options).map(option => <Button key={option.id} testID={`grammar-option-${option.id}`} title={option.label} disabled={busy} onPress={() => onSubmit({ kind: 'choice', optionId: option.id })} />)}</View> : null}
    {!result && question.responseMode === 'typed' ? <GrammarTypedAnswer maxLength={sentence?256:64} disabled={busy} onSubmit={text => onSubmit({ kind: 'typed', text })} /> : null}
    {result ? <View testID="grammar-result"><Text>{result.right ? `Верно! +${result.xpDelta} XP` : 'Ошибка. Повторите правило.'}</Text>{caseError ? <Text>{sieCaseError ? 'Проверьте регистр букв: Sie и sie имеют разное значение.' : 'Проверьте регистр букв.'}</Text> : null}<Text>Ответ: {question.feedback.sentenceDe}</Text><Text>{question.feedback.translationRu}</Text><Text>{question.feedback.explanationRu}</Text>{result.right && currentState?.mastered ? <Text>Освоение завершено.</Text> : null}{question.reviewStage !== null && !result.right ? <Text>Освоение сохранено, следующее повторение назначено на завтра.</Text> : null}{currentState ? <Text testID="grammar-streak">Серия: {currentState.streak}/10</Text> : null}{!result.right ? <Button title="Объяснить ошибку" variant="secondary" testID="grammar-error-open" disabled={busy} onPress={onExplainError} /> : null}<Button title="Продолжить" testID="grammar-next" disabled={busy} onPress={onNext} /></View> : null}
    <Button title="Справочник" variant="secondary" testID="grammar-reference-open" disabled={busy} onPress={() => onReference?.()} />
  </View>;
}
