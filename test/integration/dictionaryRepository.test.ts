import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { DictionaryRepository, filterDictionaryEntries } from '../../src/features/dictionary/dictionaryRepository';
import { wordLearningLabel, formatReviewDay } from '../../src/features/dictionary/dictionaryPresentation';

let h: Awaited<ReturnType<typeof createWordHarness>>;
beforeEach(async () => { h = await createWordHarness(); });
afterEach(() => h.close());

test('dictionary_status_distinguishes_new_started_mastered_and_difficult', async () => {
  const profileId = (await createProfile(h.db, 'A')).id;
  const words = await h.words.list(profileId);
  await h.db.run('UPDATE word_progress SET streak=7 WHERE wordId=?', [words[0].id]);
  await h.db.run('UPDATE word_progress SET streak=20,learned=1,dueDate=? WHERE wordId=?', ['2026-10-07', words[1].id]);
  await h.db.run('UPDATE word_progress SET difficult=1 WHERE wordId=?', [words[2].id]);
  const snapshot = await new DictionaryRepository(h.db).load(profileId);
  expect(snapshot.entries.find(item => item.id === words[0].id)?.learning).toMatchObject({ streak: 7, started: true, mastered: false });
  expect(snapshot.entries.find(item => item.id === words[1].id)?.learning).toMatchObject({ streak: 20, started: true, mastered: true, dueDay: '2026-10-07' });
  expect(snapshot.entries.find(item => item.id === words[2].id)?.learning).toMatchObject({ difficult: true, started: false });
  expect(wordLearningLabel(snapshot.entries.find(item => item.id === words[0].id)!.learning)).toBe('В процессе · 7/20');
});

test('zero_streak_after_error_still_has_started_status', async () => {
  const profileId = (await createProfile(h.db, 'A')).id;
  const word = (await h.words.list(profileId))[0];
  const session = await h.sessions.start(profileId, { mode: 'study', wordIds: [word.id] }, '2026-10-03');
  const question = await h.sessions.next(profileId, session.id, '2026-10-03');
  await h.answers.submit(profileId, session.id, question!.attemptId, 'неверно', '2026-10-03');
  const entry = (await new DictionaryRepository(h.db).load(profileId)).entries.find(item => item.id === word.id)!;
  expect(entry.learning).toMatchObject({ streak: 0, started: true, mastered: false });
});

test('lexical_reset_ignores_attempts_of_previous_revision', async () => {
  const profileId = (await createProfile(h.db, 'A')).id;
  const word = (await h.words.list(profileId))[0];
  const session = await h.sessions.start(profileId, { mode: 'study', wordIds: [word.id] }, '2026-10-03');
  const question = await h.sessions.next(profileId, session.id, '2026-10-03');
  await h.answers.submit(profileId, session.id, question!.attemptId, 'неверно', '2026-10-03');
  await h.words.update(profileId, word.id, { ...word, ru: 'новый перевод' });
  const entry = (await new DictionaryRepository(h.db).load(profileId)).entries.find(item => item.id === word.id)!;
  expect(entry.learning).toMatchObject({ streak: 0, started: false, mastered: false, dueDay: null });
});

test('snapshot_filters_use_same_search_and_profile_scope', async () => {
  const profileId = (await createProfile(h.db, 'A')).id;
  const snapshot = await new DictionaryRepository(h.db).load(profileId);
  const result = filterDictionaryEntries(snapshot, { query: 'das Buch', state: 'learning' });
  expect(result.map(item => item.de)).toEqual(['Buch']);
  await h.db.run('UPDATE word_progress SET learned=1 WHERE profileId=? AND wordId=?', [profileId, result[0].id]);
  expect(filterDictionaryEntries(await new DictionaryRepository(h.db).load(profileId), { query: 'das Buch', state: 'learning' })).toEqual([]);
});

test('review_day_format_does_not_shift_with_timezone', () => {
  expect(formatReviewDay('2026-10-07')).toBe('07.10.2026');
});
