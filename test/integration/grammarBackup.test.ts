import { createProfile } from '../../src/features/profiles/profileRepository';
import type { GrammarQuestion, GrammarSubmission } from '../../src/features/grammar/grammarTypes';
import { createGrammarHarness } from '../harness';
import { persistLegacySiePluralQuestion } from '../fixtures/legacyGrammarQuestion';

const day = '2026-10-06';
function answer(question: GrammarQuestion): GrammarSubmission {
  return question.responseMode === 'choice' ? { kind: 'choice', optionId: question.expected.optionId } : { kind: 'typed', text: ('token' in question.expected ? question.expected.token : question.expected.sentences[0]) };
}

test('restore_remaps_all_profile_links_v3_roundtrip_preserves_grammar_session_question_and_attempt', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Грамматика');
    const state = await h.grammar.getState(profile.id, 'pronoun-cloze:er');
    await h.grammar.write(profile.id, { ...state, variantIndex: 1 });
    const session = (await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'mixed', targetIds: ['pronoun-cloze:er'] }, day))!;
    const question = (await h.grammarSessions.next(profile.id, session.id, day))!;
    const result = await h.grammarAnswers.submit(profile.id, session.id, question.attemptId, answer(question), day);
    const backup = await h.backup.exportAll();
    expect(backup.version).toBe(3);
    expect(backup.profiles[0].grammar.attempts[0].result).toEqual(result);
    expect(backup.profiles[0].grammar.questions[0].status).toBe('answered');
    const legacy = { ...backup, version: 2, profiles: backup.profiles.map(({ grammar: {catalogVersions: _versions, ...grammar}, ...part }) => ({ ...part, grammar: { ...grammar, catalogVersion: 1 } })) };
    const restored = await h.backup.restore(h.backup.preview(JSON.stringify(legacy)));
    const restoredId = restored.profileIds[0];
    const restoredBackup = await h.backup.exportAll();
    const restoredPart = restoredBackup.profiles.find(part => part.profile.id === restoredId)!;
    expect(restoredPart.grammar.attempts[0].result.targetId).toBe('pronoun-cloze:er');
    expect(restoredPart.grammar.attempts[0].result.attemptId).not.toBe(result.attemptId);
    expect(restoredPart.grammar.questions[0].question.profileId).toBe(restoredId);
    expect(restoredPart.grammar.questions[0].question.dependencies[0].profileId).toBe(restoredId);
    expect(restoredPart.profile.xp).toBe(10);
  } finally { h.close(); }
});

test('v1_import_is_normalized_with_empty_grammar', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'V1');
    const v2 = await h.backup.exportAll();
    const v1 = { ...v2, version: 1, profiles: v2.profiles.map(({ grammar: _grammar, ...part }) => part) };
    const preview = h.backup.preview(JSON.stringify(v1));
    expect(preview.backup.version).toBe(3);
    expect(preview.grammarTargetCount).toBe(0);
    const restored = await h.backup.restore(preview);
    expect(restored.profileIds).toHaveLength(1);
    expect((await h.backup.exportAll()).profiles.find(part => part.profile.id === restored.profileIds[0])!.grammar.progress).toEqual([]);
    expect(profile.id).not.toBe(restored.profileIds[0]);
  } finally { h.close(); }
});

test('v2_rejects_forged_grammar_result_and_cross_ledger_attempt_ids', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'A');
    const grammarSession = (await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'mixed', targetIds: ['pronoun-cloze:er'] }, day))!;
    const grammarQuestion = (await h.grammarSessions.next(profile.id, grammarSession.id, day))!;
    await h.grammarAnswers.submit(profile.id, grammarSession.id, grammarQuestion.attemptId, answer(grammarQuestion), day);
    const wordSession = (await h.sessions.start(profile.id, { mode: 'study', wordIds: [(await h.words.list(profile.id))[0].id] }, day));
    const wordQuestion = (await h.sessions.next(profile.id, wordSession.id, day))!;
    await h.answers.submit(profile.id, wordSession.id, wordQuestion.attemptId, wordQuestion.expected[0], day);
    const source = await h.backup.exportAll();
    const forgedState = JSON.parse(JSON.stringify(source));
    forgedState.profiles[0].grammar.attempts[0].result.state.streak = 0;
    expect(() => h.backup.preview(JSON.stringify(forgedState))).toThrow();
    const forgedAnswer = JSON.parse(JSON.stringify(source));
    forgedAnswer.profiles[0].grammar.attempts[0].result.submittedAnswer = { kind: 'choice', optionId: 'du' };
    expect(() => h.backup.preview(JSON.stringify(forgedAnswer))).toThrow();
    const duplicate = JSON.parse(JSON.stringify(source));
    duplicate.profiles[0].grammar.attempts[0].result.attemptId = duplicate.profiles[0].attempts[0].attemptId;
    expect(() => h.backup.preview(JSON.stringify(duplicate))).toThrow();
  } finally { h.close(); }
});

test.each(['sie_plural', 'sie_feminine'] as const)('legacy_v2_restores_historical_%s_and_continues_with_german_only_choices', async optionId => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Старая версия');
    const session = (await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:sie_plural'] }, day))!;
    const question = (await h.grammarSessions.next(profile.id, session.id, day))!;
    await persistLegacySiePluralQuestion(h.db, question);
    const result = await h.grammarAnswers.submit(profile.id, session.id, question.attemptId, { kind: 'choice', optionId }, day);
    const right = optionId === 'sie_plural';
    expect(result.right).toBe(right);
    const backup = await h.backup.exportAll();
    const restored = await h.backup.restore(h.backup.preview(JSON.stringify(backup)));
    const restoredId = restored.profileIds[0];
    const reopened = (await h.grammarSessions.resume(restoredId))!;
    expect(reopened.result).toMatchObject({ right, xpDelta: right ? 10 : 0, submittedAnswer: { kind: 'choice', optionId } });
    if(reopened.currentQuestion?.catalogVersion!==1) throw new Error('Expected legacy question');
    expect(reopened.currentQuestion.options[0].label).toBe('sie — они');
    expect(await h.profile(restoredId)).toMatchObject({ xp: right ? 10 : 0 });
    const next = (await h.grammarSessions.next(restoredId, reopened.id, day))!;
    if(next.catalogVersion!==1) throw new Error('Expected legacy question');
    expect(next.options.map(option => option.label).sort()).toEqual(['Du', 'Er', 'Ich', 'Sie']);
  } finally { h.close(); }
});

test('legacy_v2_restores_unanswered_question_and_accepts_current_distractor', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Без ответа');
    const session = (await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:sie_plural'] }, day))!;
    const question = (await h.grammarSessions.next(profile.id, session.id, day))!;
    await persistLegacySiePluralQuestion(h.db, question);
    const restored = await h.backup.restore(h.backup.preview(JSON.stringify(await h.backup.exportAll())));
    const restoredId = restored.profileIds[0];
    await h.db.run('UPDATE app_settings SET activeProfileId=? WHERE id=1', [restoredId]);
    const reopened = (await h.grammarSessions.resume(restoredId))!;
    const result = await h.grammarAnswers.submit(restoredId, reopened.id, reopened.currentQuestion!.attemptId, { kind: 'choice', optionId: 'du' }, day);
    expect(result).toMatchObject({ right: false, xpDelta: 0, state: { streak: 0, totalErrors: 1 } });
    const after = await h.backup.exportAll();
    expect(() => h.backup.preview(JSON.stringify(after))).not.toThrow();
  } finally { h.close(); }
});
