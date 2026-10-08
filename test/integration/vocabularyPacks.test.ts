import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { parseCsv, csvRowToWord } from '../../src/features/transfer/csvParser';
import { wordKey } from '../../src/features/dictionary/wordValidation';
import { starterWords } from '../../src/data/starterWords';

const topics = ['Знакомство и общение', 'Семья и люди', 'Дом и быт', 'Еда и напитки', 'Покупки и одежда', 'Работа и учёба', 'Город и транспорт', 'Время и распорядок', 'Здоровье и тело', 'Досуг и погода'].map(name => `A1 · ${name}`);
const numbers = 'null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig'.split(' ');
const load = (name: string) => readFileSync(resolve(__dirname, '../../content/vocabulary', name), 'utf8');

function assertPackContent() {
  const numberText = load('numbers-0-20.csv'), a1Text = load('a1-300.csv');
  const numberRows = parseCsv(numberText).rows.map(csvRowToWord);
  const a1Rows = parseCsv(a1Text).rows.map(csvRowToWord);
  expect(numberRows.map(row => row.draft.de)).toEqual(numbers);
  expect(numberRows.map(row => row.draft.ru)).toEqual('ноль один два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать двадцать'.split(' '));
  numberRows.forEach((row, index) => expect(row.draft.note).toMatch(new RegExp(`^${index}(?:;|$)`)));
  expect(numberRows[1].draft.note).toContain('ein/eine');
  expect(numberRows[16].draft.note).toContain('без s');
  expect(numberRows[17].draft.note).toContain('без en');
  expect(numberRows.every(row => row.draft.pos === 'number' && row.draft.gender === null && !row.draft.plural && row.topicName === 'Числа 0–20')).toBe(true);
  expect(a1Rows).toHaveLength(300);
  expect(new Set(a1Rows.map(row => wordKey(row.draft))).size).toBe(300);
  expect(a1Rows.some(row => numbers.includes(row.draft.de))).toBe(false);
  expect([...new Set(a1Rows.map(row => row.topicName))]).toEqual(topics);
  for (const topic of topics) expect(a1Rows.filter(row => row.topicName === topic)).toHaveLength(30);
  for (const { draft } of [...numberRows, ...a1Rows]) {
    expect(draft.exampleDe?.trim()).toBeTruthy();
    expect(draft.exampleRu?.trim()).toBeTruthy();
    if (draft.pos === 'noun') {
      expect(['m', 'f', 'n']).toContain(draft.gender);
      if (!draft.plural) expect(draft.note?.trim()).toBeTruthy();
    } else {
      expect(draft.gender).toBeNull();
      expect(draft.plural).toBeFalsy();
    }
  }
  // Exact seed keys ensure importing cannot create alternative translations of starters.
  for (const seed of starterWords) {
    const match = a1Rows.find(row => row.draft.de === seed.de);
    expect(match).toBeDefined();
    expect(wordKey(match!.draft)).toBe(wordKey(seed));
  }
  expect(a1Rows.find(row => row.draft.de === 'sie')?.draft.ru).toBe('она / они');
  expect(a1Rows.find(row => row.draft.de === 'Sie')?.draft.ru).toBe('Вы (вежливое обращение)');
  return { numberText, a1Text };
}

test('packs_content_roundtrips_through_production_parser', () => { assertPackContent(); });

test('packs_have_exact_counts_and_import_idempotently', async () => {
  const { numberText, a1Text } = assertPackContent();
  const h = await createWordHarness();
  try {
    const p = await createProfile(h.db, 'Pack review');
    const seed = (await h.words.list(p.id, { query: 'стол' })).find(word => word.de === 'Tisch')!;
    await h.db.run('UPDATE word_progress SET streak=19,totalErrors=2 WHERE profileId=? AND wordId=?', [p.id, seed.id]);
    const session = await h.sessions.start(p.id, { mode: 'study', wordIds: [seed.id] }, '2026-10-08');
    const question = (await h.sessions.next(p.id, session.id, '2026-10-08'))!;
    expect(await h.answers.submit(p.id, session.id, question.attemptId, question.expected[0], '2026-10-08')).toMatchObject({ right: true, xpDelta: 60 });
    const historyTables = ['sessions', 'questions', 'attempts', 'rewards', 'daily_activity', 'skill_history'];
    const historyBefore = await Promise.all(historyTables.map(table => h.db.all(`SELECT * FROM ${table} WHERE profileId=? ORDER BY rowid`, [p.id])));
    const beforeWords = await h.db.all('SELECT * FROM words WHERE profileId=? ORDER BY id', [p.id]);
    const beforeProgress = await h.db.all('SELECT * FROM word_progress WHERE profileId=? ORDER BY wordId', [p.id]);
    const beforeSkills = await h.db.all('SELECT * FROM skill_stats WHERE profileId=? ORDER BY wordId,skill', [p.id]);
    const oldTopics = await h.topics.wordTopics(p.id, seed.id);
    expect(await h.csv.commit(await h.csv.preview(p.id, numberText))).toEqual({ added: 21, duplicates: 0, invalid: 0 });
    expect(await h.csv.commit(await h.csv.preview(p.id, a1Text))).toEqual({ added: 300 - starterWords.length, duplicates: starterWords.length, invalid: 0 });
    for (const [text, count] of [[numberText, 21], [a1Text, 300]] as const) {
      expect(await h.csv.commit(await h.csv.preview(p.id, text))).toEqual({ added: 0, duplicates: count, invalid: 0 });
    }
    for (const row of beforeWords) expect(await h.db.first('SELECT * FROM words WHERE id=?', [(row as { id: string }).id])).toEqual(row);
    for (const row of beforeProgress) expect(await h.db.first('SELECT * FROM word_progress WHERE profileId=? AND wordId=?', [p.id, (row as { wordId: string }).wordId])).toEqual(row);
    for (const row of beforeSkills) expect(await h.db.first('SELECT * FROM skill_stats WHERE profileId=? AND wordId=? AND skill=?', [p.id, (row as { wordId: string }).wordId, (row as { skill: string }).skill])).toEqual(row);
    expect(await h.topics.wordTopics(p.id, seed.id)).toEqual(expect.arrayContaining(oldTopics));
    for (const topic of ['Числа 0–20', ...topics]) {
      const membership = await h.db.first<{ n: number }>('SELECT count(*) AS n FROM word_topics wt JOIN topics t ON t.id=wt.topicId WHERE wt.profileId=? AND t.name=?', [p.id, topic]);
      expect(membership?.n).toBe(topic === 'Числа 0–20' ? 21 : 30);
    }
    expect((await h.words.list(p.id)).length).toBe(321);
    expect((await h.profile(p.id))?.xp).toBe(60);
    expect(await Promise.all(historyTables.map(table => h.db.all(`SELECT * FROM ${table} WHERE profileId=? ORDER BY rowid`, [p.id])))).toEqual(historyBefore);
  } finally { h.close(); }
});
