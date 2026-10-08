import { validateBackupV2 } from '../../src/features/transfer/backupValidation';
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

async function mixedCatalogFixture() {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'Оба каталога');
  const old = (await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }, day))!;
  for (let index = 0; index < 20; index++) {
    const question = (await h.grammarSessions.next(profile.id, old.id, day))!;
    await h.grammarAnswers.submit(profile.id, old.id, question.attemptId, answer(question), day);
  }
  await h.grammarSessions.next(profile.id, old.id, day);
  const state = await h.grammar.getState(profile.id, 'yesno-transform:pronoun');
  await h.grammar.write(profile.id, { ...state, attemptCount: 19 });
  const session = (await h.grammarSessions.start(profile.id, { mode: 'study', lesson: 'yesno-transform', targetIds: ['yesno-transform:pronoun'] }, day))!;
  const active = (await h.grammarSessions.next(profile.id, session.id, day))!;
  expect(active).toMatchObject({ catalogVersion: 2, presentation: 'sentence' });
  return { h, profile, active, backup: await h.backup.exportAll() };
}

function withoutRemappedIds(value: unknown, ids = new Map<string, string>()): unknown {
  if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) {
    if (!ids.has(value)) ids.set(value, `<uuid-${ids.size}>`);
    return ids.get(value);
  }
  if (Array.isArray(value)) return value.map(child => withoutRemappedIds(child, ids));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'name' ? '<name>' : withoutRemappedIds(child, ids)]));
  return value;
}

test('mixed_catalog_roundtrip_preserves_active_sentence', async () => {
  const { h, profile, active, backup } = await mixedCatalogFixture();
  try {
    expect(backup.profiles[0].grammar.catalogVersions).toEqual([1, 2]);
    expect(backup.profiles[0].grammar.progress.find(row => row.targetId === 'pronoun-cloze:ich')!.state.mastered).toBe(true);
    expect(backup.profiles[0].profile.xp).toBe(250);
    const restored = await h.backup.restore(h.backup.preview(JSON.stringify(backup)));
    const after = (await h.backup.exportAll()).profiles.find(part => part.profile.id === restored.profileIds[0])!;
    expect(withoutRemappedIds(after)).toEqual(withoutRemappedIds(backup.profiles[0]));
    expect(after.profile.id).not.toBe(profile.id);
    const resumed = (await h.grammarSessions.resume(after.profile.id))!;
    expect(resumed.currentQuestion!.templateId).toBe(active.templateId);
    expect(resumed.currentQuestion!.targetId).toBe(active.targetId);
    expect(resumed.currentQuestion!.attemptId).not.toBe(active.attemptId);
    expect(resumed.currentQuestion).toEqual(after.grammar.questions.find(row => row.status === 'active')!.question);
  } finally { h.close(); }
});

test.each(['expected', 'template', 'catalogVersion', 'lesson', 'attempt', 'reward'] as const)('unknown_template_rejected_atomically_and_forged_expected_sentence_rejected_%s', async field => {
  const { h, backup } = await mixedCatalogFixture();
  try {
    const forged = JSON.parse(JSON.stringify(backup));
    const grammar = forged.profiles[0].grammar;
    const row = grammar.questions.find((item: { status: string }) => item.status === 'active');
    const session = grammar.sessions.find((item: { status: string }) => item.status === 'active');
    if (field === 'expected') row.question.expected.sentences = ['Ist falsch?'];
    if (field === 'template') row.question.templateId = 'missing-template';
    if (field === 'catalogVersion') row.question.catalogVersion = 1;
    if (field === 'lesson') session.selection.lesson = 'pronouns';
    if (field === 'attempt') grammar.attempts[0].sessionId = session.id;
    if (field === 'reward') grammar.rewards[0].targetId = 'yesno-transform:pronoun';
    if (['expected', 'template', 'catalogVersion'].includes(field)) session.currentQuestion = row.question;
    expect(() => h.backup.preview(JSON.stringify(forged))).toThrow();
    await expect(h.backup.restore({ ...h.backup.preview(JSON.stringify(backup)), backup: forged })).rejects.toThrow();
    expect((await h.backup.exportAll()).profiles).toHaveLength(1);
  } finally { h.close(); }
});

test('v2_cannot_smuggle_catalog2_even_with_legacy_container', async () => {
  const { h, backup } = await mixedCatalogFixture();
  try {
    const legacy = { ...backup, version: 2, profiles: backup.profiles.map(({ grammar: { catalogVersions: _versions, ...grammar }, ...part }) => ({ ...part, grammar: { ...grammar, catalogVersion: 1 } })) };
    expect(() => validateBackupV2(legacy)).toThrow();
    expect(() => h.backup.preview(JSON.stringify(legacy))).toThrow();
    expect((await h.backup.exportAll()).profiles).toHaveLength(1);
  } finally { h.close(); }
});
