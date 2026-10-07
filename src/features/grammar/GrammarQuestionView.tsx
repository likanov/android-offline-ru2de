import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../ui/Button';
import type { GrammarAttemptResult, GrammarQuestion, GrammarSubmission } from './grammarTypes';
import { GrammarTypedAnswer } from './GrammarTypedAnswer';
import { grammarChoiceOptions } from './grammarChoiceOptions';
export function GrammarQuestionView({ question, result, busy, onSubmit, onNext, onExplainError, onReference }: {
  question: GrammarQuestion;
  result: GrammarAttemptResult | null;
  busy: boolean;
  onSubmit: (answer: GrammarSubmission) => void;
  onNext: () => void;
  onExplainError: () => void;
  onReference?: () => void;
}) {
  return <View>
    <Text testID="grammar-context" style={{ fontSize: 17 }}>{question.contextRu}</Text>
    <Text testID="grammar-prompt" style={{ fontSize: 25 }}>{question.beforeDe}___{question.afterDe}</Text>
    {!result && question.responseMode === 'choice' ? <View>{grammarChoiceOptions(question).map(option => <Button key={option.id} testID={`grammar-option-${option.id}`} title={option.label} disabled={busy} onPress={() => onSubmit({ kind: 'choice', optionId: option.id })} />)}</View> : null}
    {!result && question.responseMode === 'typed' ? <GrammarTypedAnswer disabled={busy} onSubmit={text => onSubmit({ kind: 'typed', text })} /> : null}
    {result ? <View testID="grammar-result"><Text>{result.right ? `Верно! +${result.xpDelta} XP` : 'Ошибка. Повторите правило.'}</Text><Text>Ответ: {question.feedback.sentenceDe}</Text><Text>{question.feedback.translationRu}</Text><Text>{question.feedback.explanationRu}</Text>{result.right && result.state.mastered ? <Text>Освоение завершено.</Text> : null}{question.reviewStage !== null && !result.right ? <Text>Освоение сохранено, следующее повторение назначено на завтра.</Text> : null}<Text testID="grammar-streak">Серия: {result.state.streak}/20</Text>{!result.right ? <Button title="Объяснить ошибку" variant="secondary" testID="grammar-error-open" disabled={busy} onPress={onExplainError} /> : null}<Button title="Продолжить" testID="grammar-next" disabled={busy} onPress={onNext} /></View> : null}
    <Button title="Справочник" variant="secondary" testID="grammar-reference-open" disabled={busy} onPress={() => onReference?.()} />
  </View>;
}
