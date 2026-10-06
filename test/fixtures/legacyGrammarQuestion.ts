import type { SqlStore } from '../../src/core/sql';
import type { GrammarQuestion } from '../../src/features/grammar/grammarTypes';

// Literal options from the shipped catalog v1, before German-only buttons.
export function legacySiePluralQuestion(question: GrammarQuestion): GrammarQuestion {
  return {
    ...question,
    options: [
      { id: 'sie_plural', label: 'sie — они' },
      { id: 'sie_feminine', label: 'sie — она' },
      { id: 'sie_formal', label: 'Sie — Вы (вежливое обращение)' },
      { id: 'ich', label: 'ich — я' },
    ],
  };
}

export async function persistLegacySiePluralQuestion(db: SqlStore, question: GrammarQuestion): Promise<GrammarQuestion> {
  const legacy = legacySiePluralQuestion(question);
  await db.run('UPDATE grammar_questions SET payload=? WHERE attemptId=?', [JSON.stringify(legacy), legacy.attemptId]);
  await db.run('UPDATE grammar_sessions SET currentQuestion=? WHERE id=?', [JSON.stringify(legacy), legacy.sessionId]);
  return legacy;
}
