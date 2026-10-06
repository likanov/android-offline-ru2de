import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { WordRepository } from '../../src/features/dictionary/wordRepository';

let h: Awaited<ReturnType<typeof createWordHarness>>;
beforeEach(async () => { h = await createWordHarness(); });
afterEach(() => h.close());

test('repository_searches_article_plural_and_aliases_inside_owner_scope', async () => {
  const p1 = (await createProfile(h.db, 'A')).id;
  const p2 = (await createProfile(h.db, 'B')).id;
  const words = new WordRepository(h.db);
  const other = (await words.list(p2)).find(item => item.de === 'Buch')!;
  expect((await words.list(p1, { query: 'das Buch' })).map(item => item.de)).toEqual(['Buch']);
  expect((await words.list(p1, { query: 'Bücher' })).map(item => item.de)).toEqual(['Buch']);
  expect((await words.list(p1, { query: 'ребенок' })).map(item => item.de)).toEqual(['Kind']);
  expect((await words.list(p1, { query: 'Strasse' })).map(item => item.de)).toEqual(['Straße']);
  expect((await words.list(p1, { query: 'Buch' })).some(item => item.id === other.id)).toBe(false);
});

test('repository_keeps_state_topic_and_difficulty_filters_with_search', async () => {
  const profileId = (await createProfile(h.db, 'A')).id;
  const words = new WordRepository(h.db);
  const topic = await h.topics.create(profileId, 'Предметы');
  const buch = (await words.list(profileId)).find(item => item.de === 'Buch')!;
  await h.topics.setWordTopics(profileId, buch.id, [topic.id]);
  await h.db.run('UPDATE word_progress SET learned=1,difficult=1 WHERE profileId=? AND wordId=?', [profileId, buch.id]);
  expect((await words.list(profileId, { query: 'das', state: 'mastered', difficult: true, topicId: topic.id })).map(item => item.de)).toEqual(['Buch']);
  expect((await words.list(profileId, { query: 'das', state: 'learning' })).some(item => item.de === 'Buch')).toBe(false);
});
