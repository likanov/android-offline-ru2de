import { applyAnswer } from '../learning/learningRules';
import { grammarTargets } from '../grammar/grammarCatalog';
import { checkGrammarAnswer, makeGrammarQuestion, validateGrammarQuestion } from '../grammar/grammarQuestionFactory';
import type { GrammarProfileBackup, ProfileBackupV2 } from './backupTypes';
import type { GrammarAttemptResult, GrammarProgress, GrammarQuestion, GrammarSession } from '../grammar/grammarTypes';
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
function targetKnown(id: unknown): boolean { return typeof id === 'string' && grammarTargets.some(target => target.id === id); }
function validateQuestionSnapshot(question: GrammarQuestion, words?: ProfileBackupV2['words']): void {
  const variantIndex = Number(question.templateId.split(':').pop());
  const inputWords = words ?? question.dependencies.map(dependency => ({ id: dependency.wordId, profileId: dependency.profileId ?? question.profileId, de: dependency.de, ru: dependency.ru, pos: 'noun' as const, gender: dependency.gender, plural: dependency.plural, exampleDe: null, exampleRu: null, note: '', revision: dependency.revision }));
  const expected = makeGrammarQuestion({ attemptId: question.attemptId, sessionId: question.sessionId, profileId: question.profileId, targetId: question.targetId, responseMode: question.responseMode, reviewStage: question.reviewStage, dueDay: question.dueDay, variantIndex, words: inputWords });
  const sorted = (items: unknown[]) => JSON.stringify([...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if (sorted(question.options) !== sorted(expected.options)) invalid();
  const canonical = { ...question, options: expected.options };
  try { validateGrammarQuestion(canonical, words); } catch { invalid(); }
}
function checkProgress(row: GrammarProgress & { profileId: string }, profileId: string): void {
  if (row.profileId !== profileId || !targetKnown(row.targetId) || !Number.isInteger(row.attemptCount) || row.attemptCount < 0 || !Number.isInteger(row.variantIndex) || row.variantIndex < 0 || row.variantIndex > 2)
    invalid();
  const state = row.state;
  if (!state || !Number.isInteger(state.streak) || state.streak < 0 || state.streak > 20 || typeof state.mastered !== 'boolean' || typeof state.masteryBonusGranted !== 'boolean' || !Number.isInteger(state.reviewStage) || state.reviewStage < 0 || state.reviewStage > 5 || (state.dueDay !== null && !isDay(state.dueDay)) || typeof state.difficult !== 'boolean' || !Number.isInteger(state.totalErrors) || state.totalErrors < 0 || !Number.isInteger(state.recoveryErrors) || state.recoveryErrors < 0 || !Number.isInteger(state.recoveryCorrect) || state.recoveryCorrect < 0 || state.recoveryCorrect > 2)
    invalid();
  if (state.mastered !== (state.streak === 20) || state.masteryBonusGranted < state.mastered || (state.mastered && state.dueDay === null) || (!state.mastered && (state.dueDay !== null || state.reviewStage !== 0)) || state.recoveryErrors > state.totalErrors || state.difficult !== (state.recoveryErrors >= 3) || (!state.difficult && state.recoveryCorrect !== 0))
    invalid();
  // Keep the same transition invariants as the live learning engine.
  try { applyAnswer(state, false, state.mastered ? 'review' : 'study', state.dueDay ?? '2026-01-01'); } catch { invalid(); }
}
function checkQuestion(row: { question: GrammarQuestion; status: string }, profileId: string, words: ProfileBackupV2['words'], sessions: Map<string, GrammarSession>, attempts: Map<string, { result: GrammarAttemptResult }>): void {
  const question = row.question;
  if (!['active', 'answered', 'cancelled'].includes(row.status) || question.profileId !== profileId || !isUuid(question.attemptId) || !isUuid(question.sessionId) || !targetKnown(question.targetId) || !['active', 'answered', 'cancelled'].includes(row.status)) invalid();
  const session = sessions.get(question.sessionId);
  if (!session || session.profileId !== profileId || !session.targetIds.includes(question.targetId)) invalid();
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

export function validateGrammarProfile(part: ProfileBackupV2): void {
  if (!isRecord(part) || !isRecord(part.profile) || !isUuid(part.profile.id) || !isRecord(part.grammar)) invalid();
  const profileId = part.profile.id;
  const grammar = part.grammar as GrammarProfileBackup;
  if (grammar.catalogVersion !== 1 || !Array.isArray(grammar.progress) || !Array.isArray(grammar.sessions) || !Array.isArray(grammar.questions) || !Array.isArray(grammar.attempts) || !Array.isArray(grammar.rewards)) invalid();
  const targetIds = new Set<string>();
  for (const row of grammar.progress) {
    if (targetIds.has(row.targetId)) invalid();
    targetIds.add(row.targetId);
    checkProgress(row, profileId);
  }
  const sessions = new Map<string, GrammarSession>();
  for (const session of grammar.sessions) {
    if (!isUuid(session.id) || sessions.has(session.id) || session.profileId !== profileId || !['study', 'review'].includes(session.selection.mode) || !['mixed', 'pronouns', 'sein'].includes(session.selection.lesson) || !Array.isArray(session.targetIds) || new Set(session.targetIds).size !== session.targetIds.length || session.targetIds.some(id => !targetKnown(id)) || !Number.isInteger(session.cursor) || session.cursor < 0 || !['active', 'completed', 'cancelled'].includes(session.status)) invalid();
    if (session.status === 'active' && session.currentQuestion === null && session.result !== null) invalid();
    if (session.currentQuestion === null && session.result !== null) invalid();
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
  const replay = new Map<string, LearningState>();
  for (const row of grammar.attempts) {
    const current = replay.get(row.targetId) ?? emptyState();
    let transition;
    try { transition = applyAnswer(current, row.result.right, current.mastered ? 'review' : 'study', row.day); } catch { invalid(); }
    if (!equal(transition.state, row.result.state) || transition.xpDelta !== row.result.xpDelta) invalid();
    replay.set(row.targetId, transition.state);
  }
  for (const progress of grammar.progress) {
    const expected = replay.get(progress.targetId);
    if (expected && !equal(expected, progress.state)) invalid();
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
  for (const progress of grammar.progress) if (progress.state.masteryBonusGranted !== rewardTargets.has(progress.targetId)) invalid();
}

export function validateCombinedLedger(part: ProfileBackupV2): void {
  const wordXp = part.attempts.reduce((sum, attempt) => sum + attempt.xpDelta, 0);
  const grammarXp = part.grammar.attempts.reduce((sum, attempt) => sum + attempt.result.xpDelta, 0);
  if (part.profile.xp !== wordXp + grammarXp) invalid();
  const days = new Map<string, { correct: number; errors: number; xp: number }>();
  const add = (day: string, right: boolean, xp: number) => {
    const value = days.get(day) ?? { correct: 0, errors: 0, xp: 0 };
    value.correct += right ? 1 : 0; value.errors += right ? 0 : 1; value.xp += xp; days.set(day, value);
  };
  for (const attempt of part.attempts) add(attempt.day, !!attempt.right, attempt.xpDelta);
  for (const attempt of part.grammar.attempts) add(attempt.day, attempt.result.right, attempt.result.xpDelta);
  if (part.dailyActivity.length !== days.size) invalid();
  for (const row of part.dailyActivity) {
    const expected = days.get(row.day);
    if (!expected || row.profileId !== part.profile.id || row.correct !== expected.correct || row.errors !== expected.errors || row.xp !== expected.xp) invalid();
  }
}
