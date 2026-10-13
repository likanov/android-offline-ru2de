import { applyGrammarAnswer } from '../grammar/grammarLearningRules';
import { replayGrammarRules } from './grammarRulesBackupValidation';
import { grammarTargets, isGrammarLesson, getGrammarTarget, getGrammarVariantCount } from '../grammar/grammarCatalog';
import { checkGrammarAnswer, validateGrammarQuestion } from '../grammar/grammarQuestionFactory';
import type { GrammarProfileBackupV3, GrammarProfileBackupV4, ProfileBackupV4, ProfileBackupV3, ProfileBackupV2 } from './backupTypes';
import type { GrammarAttemptResult, GrammarProgress, GrammarQuestion, GrammarSession, GrammarCatalogVersion } from '../grammar/grammarTypes';
import type { LearningState } from '../learning/learningTypes';

function invalid(): never {
  throw new Error('Резервная копия повреждена или имеет неподдерживаемый формат');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}
function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function emptyState() { return { streak: 0, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 } as const; }
function targetKnown(id: unknown): boolean { try { return typeof id === 'string' && !!getGrammarTarget(id as GrammarQuestion['targetId']); } catch { return false; } }
function validateQuestionSnapshot(question: GrammarQuestion, words?: ProfileBackupV3['words']): void {
  if (!targetKnown(question.targetId) || question.catalogVersion !== getGrammarTarget(question.targetId).catalogVersion) invalid();
  try { validateGrammarQuestion(question, words); } catch { invalid(); }
}
function checkProgress(row: GrammarProgress & { profileId: string }, profileId: string, requiredCorrect: 10 | 20): void {
  if (row.profileId !== profileId || !targetKnown(row.targetId) || !Number.isInteger(row.attemptCount) || row.attemptCount < 0 || !Number.isInteger(row.variantIndex) || row.variantIndex < 0 || row.variantIndex >= getGrammarVariantCount(row.targetId))
    invalid();
  const state = row.state;
  if (!state || !Number.isInteger(state.streak) || state.streak < 0 || state.streak > requiredCorrect || typeof state.mastered !== 'boolean' || typeof state.masteryBonusGranted !== 'boolean' || !Number.isInteger(state.reviewStage) || state.reviewStage < 0 || state.reviewStage > 5 || (state.dueDay !== null && !isDay(state.dueDay)) || typeof state.difficult !== 'boolean' || !Number.isInteger(state.totalErrors) || state.totalErrors < 0 || !Number.isInteger(state.recoveryErrors) || state.recoveryErrors < 0 || !Number.isInteger(state.recoveryCorrect) || state.recoveryCorrect < 0 || state.recoveryCorrect > 2)
    invalid();
  if (state.mastered !== (state.streak === requiredCorrect) || state.masteryBonusGranted < state.mastered || (state.mastered && state.dueDay === null) || (!state.mastered && (state.dueDay !== null || state.reviewStage !== 0)) || state.recoveryErrors > state.totalErrors || state.difficult !== (state.recoveryErrors >= 3) || (!state.difficult && state.recoveryCorrect !== 0))
    invalid();
  // Keep the same transition invariants as the live learning engine.
  try { applyGrammarAnswer(state, false, state.mastered ? 'review' : 'study', state.dueDay ?? '2026-01-01', requiredCorrect === 20 ? 1 : 2); } catch { invalid(); }
}
function checkQuestion(row: { question: GrammarQuestion; status: string }, profileId: string, words: ProfileBackupV3['words'], sessions: Map<string, GrammarSession>, attempts: Map<string, { result: GrammarAttemptResult }>): void {
  const question = row.question;
  if (!['active', 'answered', 'cancelled'].includes(row.status) || question.profileId !== profileId || !isUuid(question.attemptId) || !isUuid(question.sessionId) || !targetKnown(question.targetId) || !['active', 'answered', 'cancelled'].includes(row.status)) invalid();
  const session = sessions.get(question.sessionId);
  if (!session || session.profileId !== profileId || (row.status === 'active' && !session.targetIds.includes(question.targetId))) invalid();
  if (session.selection.targetIds && !session.selection.targetIds.includes(question.targetId)) invalid();
  const target = getGrammarTarget(question.targetId);
  const lesson = session.selection.lesson;
  if (lesson === 'mixed' ? target.catalogVersion !== 1 : target.kind !== (lesson === 'pronouns' ? 'pronoun-cloze' : lesson === 'sein' ? 'sein-cloze' : lesson)) invalid();
  if (!Array.isArray(question.dependencies) || question.dependencies.some(dependency => dependency.profileId !== undefined && dependency.profileId !== profileId || !isUuid(dependency.wordId) || !Number.isInteger(dependency.revision) || dependency.revision < 1)) invalid();
  const trustedWords = words.filter(word => question.dependencies.some(dependency => dependency.wordId === word.id));
  if (row.status === 'active') {
    if (trustedWords.length !== question.dependencies.length || question.dependencies.some(dependency => !trustedWords.some(word => word.id === dependency.wordId && word.profileId === profileId && word.revision === dependency.revision && word.de === dependency.de && word.ru === dependency.ru && word.gender === dependency.gender && word.plural === dependency.plural))) invalid();
    validateQuestionSnapshot(question, trustedWords);
  } else {
    // Answered/cancelled questions retain the dependency snapshot that was
    // shown to the learner; editing the current word must not rewrite history.
    validateQuestionSnapshot(question);
  }
  if (row.status === 'active' && (!session.currentQuestion || !equal(session.currentQuestion, question) || session.status !== 'active' || session.result)) invalid();
  if (row.status === 'answered' && !attempts.has(question.attemptId)) invalid();
}

export function validateGrammarProfile(part: ProfileBackupV3 | ProfileBackupV2 | ProfileBackupV4, context: { catalogVersions: readonly GrammarCatalogVersion[]; rulesVersion?: 2 } = { catalogVersions: [1, 2] }): void {
  if (part && part.grammar && 'catalogVersion' in part.grammar) {
    if (part.grammar.catalogVersion !== 1 || 'catalogVersions' in part.grammar) invalid();
    const legacyTargets = new Set(grammarTargets.filter(target => target.catalogVersion === 1).map(target => target.id));
    for (const id of [...part.grammar.progress.map(row => row.targetId), ...part.grammar.sessions.flatMap(row => [...row.targetIds, ...(row.selection.targetIds ?? [])]), ...part.grammar.questions.map(row => row.question.targetId), ...part.grammar.attempts.map(row => row.targetId), ...part.grammar.rewards.map(row => row.targetId)]) if (!legacyTargets.has(id)) invalid();
    if (part.grammar.questions.some(row => row.question.catalogVersion !== 1)) invalid();
    const { catalogVersion: _legacyVersion, ...grammar } = part.grammar;
    return validateGrammarProfile({ ...part, grammar: { ...grammar, catalogVersions: [1] } }, { catalogVersions: [1] });
  }
  if (!isRecord(part) || !isRecord(part.profile) || !isUuid(part.profile.id) || !isRecord(part.grammar)) invalid();
  const profileId = part.profile.id;
  const grammar = part.grammar as GrammarProfileBackupV3 | GrammarProfileBackupV4;
  if (context.rulesVersion !== 2 && ('rulesVersion' in grammar || 'rulesTransitions' in grammar || grammar.attempts?.some(row => row.result?.rulesVersion !== undefined && row.result.rulesVersion !== 1) || grammar.sessions?.some(row => row.result?.rulesVersion !== undefined && row.result.rulesVersion !== 1))) invalid();
  if (!Array.isArray(grammar.catalogVersions) || (context.rulesVersion === 2 ? grammar.catalogVersions.length === 0 : grammar.catalogVersions.length !== context.catalogVersions.length) || new Set(grammar.catalogVersions).size !== grammar.catalogVersions.length || grammar.catalogVersions.some(version => !context.catalogVersions.includes(version)) || !Array.isArray(grammar.progress) || !Array.isArray(grammar.sessions) || !Array.isArray(grammar.questions) || !Array.isArray(grammar.attempts) || !Array.isArray(grammar.rewards)) invalid();
  for (const id of [...grammar.progress.map(row => row.targetId), ...grammar.sessions.flatMap(row => [...row.targetIds, ...(row.selection?.targetIds ?? [])]), ...grammar.questions.map(row => row.question.targetId), ...grammar.attempts.map(row => row.targetId), ...grammar.rewards.map(row => row.targetId)]) {
    if (!targetKnown(id) || !grammar.catalogVersions.some(version=>version===getGrammarTarget(id).catalogVersion)) invalid();
  }
  const targetIds = new Set<string>();
  for (const row of grammar.progress) {
    if (targetIds.has(row.targetId)) invalid();
    targetIds.add(row.targetId);
    if (!targetKnown(row.targetId) || !context.catalogVersions.includes(getGrammarTarget(row.targetId).catalogVersion)) invalid();
    checkProgress(row, profileId, context.rulesVersion === 2 ? 10 : 20);
  }
  const sessions = new Map<string, GrammarSession>();
  for (const session of grammar.sessions) {
    if (!session.selection || (session.selection.targetIds !== undefined && (!Array.isArray(session.selection.targetIds) || new Set(session.selection.targetIds).size !== session.selection.targetIds.length || session.selection.targetIds.some(id => !targetKnown(id))))) invalid();
    if (!isUuid(session.id) || sessions.has(session.id) || session.profileId !== profileId || !['study', 'review'].includes(session.selection.mode) || !(context.rulesVersion===2 ? isGrammarLesson(session.selection.lesson) : ['mixed', 'pronouns', 'sein', 'professions-pronoun', 'professions-sein', 'demonstrative-statement', 'yesno-transform', 'yesno-translation'].includes(session.selection.lesson)) || !Array.isArray(session.targetIds) || new Set(session.targetIds).size !== session.targetIds.length || session.targetIds.some(id => !targetKnown(id)) || !Number.isInteger(session.cursor) || session.cursor < 0 || !['active', 'completed', 'cancelled'].includes(session.status)) invalid();
    if (session.status === 'active' && session.currentQuestion === null && session.result !== null) invalid();
    if (session.currentQuestion === null && session.result !== null) invalid();
    const lesson = session.selection.lesson;
    if (!context.catalogVersions.includes(2) && !['mixed', 'pronouns', 'sein'].includes(lesson)) invalid();
    for (const id of [...session.targetIds, ...(session.selection.targetIds ?? [])]) {
      const target = getGrammarTarget(id);
      if (lesson === 'mixed' ? target.catalogVersion !== 1 : target.kind !== (lesson === 'pronouns' ? 'pronoun-cloze' : lesson === 'sein' ? 'sein-cloze' : lesson)) invalid();
    }
    sessions.set(session.id, session);
  }
  if (grammar.sessions.filter(session => session.status === 'active').length > 1) invalid();
  const attempts = new Map<string, { result: GrammarAttemptResult }>();
  for (const row of grammar.attempts) {
    if (!isUuid(row.profileId) || row.profileId !== profileId || !isUuid(row.sessionId) || !targetKnown(row.targetId) || !isDay(row.day) || !row.result || row.result.attemptId === undefined || !isUuid(row.result.attemptId) || row.result.attemptId !== row.result.attemptId || row.result.targetId !== row.targetId || typeof row.result.right !== 'boolean' || ![0, 10, 60].includes(row.result.xpDelta)) invalid();
    if (attempts.has(row.result.attemptId)) invalid();
    const session = sessions.get(row.sessionId);
    if (!session || session.profileId !== profileId) invalid();
    attempts.set(row.result.attemptId, { result: row.result });
  }
  const questions = new Map<string, { question: GrammarQuestion; status: string }>();
  for (const row of grammar.questions) {
    if (questions.has(row.question.attemptId)) invalid();
    questions.set(row.question.attemptId, row);
    checkQuestion(row, profileId, part.words, sessions, attempts);
  }
  for (const row of grammar.attempts) {
    const question = questions.get(row.result.attemptId);
    if (!question || question.status !== 'answered' || question.question.sessionId !== row.sessionId || question.question.targetId !== row.targetId || row.result.right !== (row.result.right === true)) invalid();
    let answeredRight: boolean;
    try { answeredRight = checkGrammarAnswer(question.question, row.result.submittedAnswer); } catch { invalid(); }
    if (answeredRight !== row.result.right) invalid();
  }
  // Replay each target's immutable attempt stream. This rejects forged states,
  // XP deltas, and mastery bonuses while retaining the persisted final state.
  if (context.rulesVersion !== 2) {
    const replay = new Map<string, LearningState>();
    for (const row of grammar.attempts) {
      const current = replay.get(row.targetId) ?? emptyState();
      let transition;
      try { transition = applyGrammarAnswer(current, row.result.right, current.mastered ? 'review' : 'study', row.day, 1); } catch { invalid(); }
      if (!equal(transition.state, row.result.state) || transition.xpDelta !== row.result.xpDelta) invalid();
      replay.set(row.targetId, transition.state);
    }
    for (const progress of grammar.progress) {
      const expected = replay.get(progress.targetId) ?? emptyState();
      if (!equal(expected, progress.state) || progress.attemptCount !== grammar.attempts.filter(row => row.targetId === progress.targetId).length) invalid();
    }
    for (const target of replay.keys()) if (!targetIds.has(target)) invalid();
  }
  for (const session of grammar.sessions) {
    if (!session.currentQuestion) continue;
    const row = questions.get(session.currentQuestion.attemptId);
    if (!row || row.question.sessionId !== session.id || !equal(row.question, session.currentQuestion)) invalid();
    if (session.result) {
      const attempt = attempts.get(session.result.attemptId);
      if (!attempt || !equal(attempt.result, session.result)) invalid();
    }
  }
  const rewardTargets = new Set<string>();
  const rewardAttempts = new Set<string>();
  for (const reward of grammar.rewards) {
    if (reward.profileId !== profileId || !targetKnown(reward.targetId) || !isUuid(reward.attemptId) || reward.amount !== 50 || !isDay(reward.day) || rewardTargets.has(reward.targetId) || rewardAttempts.has(reward.attemptId)) invalid();
    const attempt = attempts.get(reward.attemptId)?.result;
    if (!attempt || attempt.targetId !== reward.targetId || !attempt.right || !attempt.state.mastered || !attempt.state.masteryBonusGranted || reward.day !== grammar.attempts.find(item => item.result.attemptId === reward.attemptId)?.day) invalid();
    rewardTargets.add(reward.targetId); rewardAttempts.add(reward.attemptId);
  }
  if (context.rulesVersion === 2) replayGrammarRules(grammar as GrammarProfileBackupV4);
  else for (const progress of grammar.progress) if (progress.state.masteryBonusGranted !== rewardTargets.has(progress.targetId)) invalid();
}

export function validateCombinedLedger(part: ProfileBackupV3 | ProfileBackupV2 | ProfileBackupV4): void {
  const wordXp = part.attempts.reduce((sum, attempt) => sum + attempt.xpDelta, 0);
  const grammarXp = part.grammar.attempts.reduce((sum, attempt) => sum + attempt.result.xpDelta, 0);
  const transitions = 'rulesTransitions' in part.grammar ? part.grammar.rulesTransitions : [];
  if (part.profile.xp !== wordXp + grammarXp + transitions.reduce((sum, row) => sum + row.xpDelta, 0)) invalid();
  const days = new Map<string, { correct: number; errors: number; xp: number }>();
  const add = (day: string, right: boolean, xp: number) => {
    const value = days.get(day) ?? { correct: 0, errors: 0, xp: 0 };
    value.correct += right ? 1 : 0; value.errors += right ? 0 : 1; value.xp += xp; days.set(day, value);
  };
  for (const attempt of part.attempts) add(attempt.day, !!attempt.right, attempt.xpDelta);
  for (const attempt of part.grammar.attempts) add(attempt.day, attempt.result.right, attempt.result.xpDelta);
  for (const transition of transitions) {
    if (transition.xpDelta === 0) continue;
    const value = days.get(transition.day) ?? { correct: 0, errors: 0, xp: 0 };
    value.xp += transition.xpDelta; days.set(transition.day, value);
  }
  if (new Set(part.dailyActivity.map(row => row.day)).size !== part.dailyActivity.length) invalid();
  if (part.dailyActivity.length !== days.size) invalid();
  for (const row of part.dailyActivity) {
    const expected = days.get(row.day);
    if (!expected || row.profileId !== part.profile.id || row.correct !== expected.correct || row.errors !== expected.errors || row.xp !== expected.xp) invalid();
  }
}
