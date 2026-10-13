import { AppError } from '../../core/errors';
import type { SqlStore } from '../../core/sql';
import { grammarReference } from '../grammar/grammarQuestionFactory';
import type { GrammarAttemptResult, GrammarQuestion, PreLektion3Question } from '../grammar/grammarTypes';

export type GrammarErrorContext = {
  question: PreLektion3Question;
  result: GrammarAttemptResult;
  reference: { title: string; text: string };
};

function parseJson<T>(value: string, message: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new AppError('VALIDATION', message, error);
  }
}

/**
 * Reads the immutable question and accepted failed result.  The explanation
 * deliberately uses the question payload, rather than re-reading a word, so
 * editing a card cannot rewrite a historical answer.
 */
export async function loadGrammarErrorContext(
  db: SqlStore,
  profileId: string,
  attemptId: string,
): Promise<GrammarErrorContext> {
  const active = await db.first<{ activeProfileId: string | null }>(
    'SELECT activeProfileId FROM app_settings WHERE id=1',
  );
  if (active?.activeProfileId !== profileId)
    throw new AppError('WRONG_PROFILE', 'Выберите этот профиль');
  const row = await db.first<{
    attemptProfileId: string | null;
    attemptRight: number | null;
    result: string | null;
    questionProfileId: string | null;
    questionPayload: string | null;
    questionStatus: string | null;
  }>(`SELECT a.profileId AS attemptProfileId,a.right AS attemptRight,a.result,
            q.profileId AS questionProfileId,q.payload AS questionPayload,q.status AS questionStatus
      FROM grammar_attempts a
      LEFT JOIN grammar_questions q ON q.attemptId=a.attemptId
      WHERE a.attemptId=?`, [attemptId]);
  if (!row?.result || !row.questionPayload)
    throw new AppError('STALE_QUESTION', 'Задание устарело');
  if (row.attemptProfileId !== profileId || row.questionProfileId !== profileId)
    throw new AppError('WRONG_PROFILE', 'Другой профиль');
  if (row.questionStatus !== 'answered' || row.attemptRight !== 0)
    throw new AppError('VALIDATION', 'Объяснение доступно только после ошибки');
  const question = parseJson<GrammarQuestion>(row.questionPayload, 'Задание повреждено');
  const result = parseJson<GrammarAttemptResult>(row.result, 'Результат повреждён');
  if (question.attemptId !== attemptId || result.attemptId !== attemptId || result.right)
    throw new AppError('VALIDATION', 'Результат задания недействителен');
  if (question.catalogVersion===3) throw new AppError('VALIDATION', 'Для этого правила нет справки');
  const reference = grammarReference[question.feedback.ruleId];
  if (!reference)
    throw new AppError('VALIDATION', 'Для этого правила нет справки');
  return { question, result, reference };
}
