import { createGrammarHarness } from '../harness';
import { createProfile, setActiveProfile } from '../../src/features/profiles/profileRepository';
import type { GrammarProgress } from '../../src/features/grammar/grammarTypes';
import type { LearningState } from '../../src/features/learning/learningTypes';

const mastered = (dueDay: string): LearningState => ({
  streak: 20,
  mastered: true,
  masteryBonusGranted: true,
  reviewStage: 0,
  dueDay,
  difficult: false,
  totalErrors: 0,
  recoveryErrors: 0,
  recoveryCorrect: 0,
});

const difficult = (): LearningState => ({
  streak: 0,
  mastered: false,
  masteryBonusGranted: false,
  reviewStage: 0,
  dueDay: null,
  difficult: true,
  totalErrors: 3,
  recoveryErrors: 3,
  recoveryCorrect: 0,
});

async function writeProgress(h: Awaited<ReturnType<typeof createGrammarHarness>>, profileId: string, targetId: GrammarProgress['targetId'], state: LearningState): Promise<void> {
  await h.grammar.write(profileId, { targetId, state, attemptCount: state.totalErrors, variantIndex: 0 });
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('grammar_summary_is_profile_scoped', async () => {
  const h = await createGrammarHarness();
  try {
    const first = await createProfile(h.db, 'Первый');
    const second = await createProfile(h.db, 'Второй');
    await writeProgress(h, first.id, 'pronoun-cloze:ich', mastered('2026-10-02'));
    await writeProgress(h, first.id, 'sein-cloze:du', difficult());

    expect(await h.progress.summary(first.id, '2026-10-03')).toMatchObject({
      grammar: {
        mastered: 1,
        totalTargets: 18,
        dueCount: 1,
        difficultCount: 1,
        skills: {
          'pronoun-cloze': { correct: 0, errors: 0 },
          'sein-cloze': { correct: 0, errors: 0 },
        },
      },
    });
    expect(await h.progress.summary(second.id, '2026-10-03')).toMatchObject({
      grammar: { mastered: 0, totalTargets: 18, dueCount: 0, difficultCount: 0 },
    });
  } finally {
    h.close();
  }
});

test('word_mastery_does_not_include_grammar', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Первый');
    const word = (await h.words.list(profile.id))[0];
    const before = await h.progress.summary(profile.id, '2026-10-03');
    await h.db.run('UPDATE word_progress SET learned=1,streak=20,bonusAwarded=1,dueDate=? WHERE profileId=? AND wordId=?', ['2026-10-04', profile.id, word.id]);
    await writeProgress(h, profile.id, 'pronoun-cloze:ich', mastered('2026-10-04'));
    const after = await h.progress.summary(profile.id, '2026-10-03');
    expect(after.mastered).toBe(before.mastered + 1);
    expect(after.totalWords).toBe(before.totalWords);
    expect(after.grammar.mastered).toBe(1);
    expect(after.grammar.totalTargets).toBe(18);
  } finally {
    h.close();
  }
});

test('combined_xp_goal_calendar_and_level', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Первый');
    await setActiveProfile(h.db, profile.id);
    const day = '2026-10-03';
    // Seed the shared XP ledger just below the boundary; both blocks then contribute through their services.
    await h.db.run('UPDATE profiles SET xp=470 WHERE id=?', [profile.id]);
    const wordSession = (await h.sessions.start(profile.id, { mode: 'study' }, day))!;
    const wordQuestion = (await h.sessions.next(profile.id, wordSession.id, day))!;
    await h.answers.submit(profile.id, wordSession.id, wordQuestion.attemptId, wordQuestion.expected[0], day);
    expect(await h.progress.summary(profile.id, day)).toMatchObject({ xp: 480, level: 1, xpToNextLevel: 20, todayCorrect: 1, goal: 20, calendar: [{ day, correct: 1 }] });

    const grammarSession = (await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }, day))!;
    const grammarQuestion = (await h.grammarSessions.next(profile.id, grammarSession.id, day))!;
    await h.grammarAnswers.submit(profile.id, grammarSession.id, grammarQuestion.attemptId, { kind: 'choice', optionId: grammarQuestion.expected.optionId }, day);
    const seinSession = (await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'sein', targetIds: ['sein-cloze:ich'] }, day))!;
    const seinQuestion = (await h.grammarSessions.next(profile.id, seinSession.id, day))!;
    const wrongOption = seinQuestion.options.find(option => option.id !== seinQuestion.expected.optionId)!;
    await h.grammarAnswers.submit(profile.id, seinSession.id, seinQuestion.attemptId, { kind: 'choice', optionId: wrongOption.id }, day);
    // The summary reads the shared ledger exactly once; no grammar-side XP join is added.
    const beforeLevel = await h.progress.summary(profile.id, day);
    expect(beforeLevel).toMatchObject({
      xp: 490,
      level: 1,
      xpToNextLevel: 10,
      todayCorrect: 2,
      goal: 20,
      calendar: [{ day, correct: 2 }],
      grammar: { skills: { 'pronoun-cloze': { correct: 1, errors: 0 }, 'sein-cloze': { correct: 0, errors: 1 } } },
    });
    const nextWordQuestion = (await h.sessions.next(profile.id, wordSession.id, day))!;
    await h.answers.submit(profile.id, wordSession.id, nextWordQuestion.attemptId, nextWordQuestion.expected[0], day);
    const atBoundary = await h.progress.summary(profile.id, day);
    expect(atBoundary).toMatchObject({ xp: 500, level: 2, xpToNextLevel: 500, todayCorrect: 3, calendar: [{ day, correct: 3 }] });
  } finally {
    h.close();
  }
});

test('grammar_due_uses_local_day_and_includes_overdue', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Первый');
    await writeProgress(h, profile.id, 'pronoun-cloze:ich', mastered('2026-03-28'));
    await writeProgress(h, profile.id, 'pronoun-cloze:du', mastered('2026-03-29'));
    await writeProgress(h, profile.id, 'pronoun-cloze:er', mastered('2026-03-30'));
    expect((await h.progress.summary(profile.id, '2026-03-29')).grammar.dueCount).toBe(2);
    expect((await h.progress.summary(profile.id, '2026-03-30')).grammar.dueCount).toBe(3);
    // DayKey uses calendar dates, so the DST boundary does not shift the due count.
    expect((await h.progress.summary(profile.id, '2026-03-31')).grammar.dueCount).toBe(3);
  } finally {
    h.close();
  }
});
