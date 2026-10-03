import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { WordRepository } from '../../src/features/dictionary/wordRepository';
import { genderPresentation } from '../../src/features/dictionary/wordValidation';
let h: Awaited<ReturnType<typeof createWordHarness>>, words: any, p1: string, p2: string, stool: any;
beforeEach(async () => {
    h = await createWordHarness();
    p1 = (await createProfile(h.db, 'A')).id;
    p2 = (await createProfile(h.db, 'B')).id;
    words = new WordRepository(h.db);
    stool = (await words.list(p1, {})).find((w: any) => w.de === 'Stuhl');
});
afterEach(() => h.close());
test('lexical_edit_resets_only_word_learning', async () => {
    await h.db.run('UPDATE profiles SET xp=750 WHERE id=?', [p1]);
    await h.db.run('UPDATE word_progress SET streak=20,learned=1,bonusAwarded=1,dueDate=? WHERE profileId=?', ['2026-10-05', p1]);
    await h.db.run('INSERT INTO skill_stats(profileId,wordId,skill,correct,errors) VALUES (?,?,?,?,?)', [p1, stool.id, 'writing', 4, 2]);
    await h.db.run('INSERT INTO aids(id,profileId,content,stale) VALUES (?,?,?,0)', ['aid', p1, 'fixture']);
    await h.db.run('INSERT INTO aid_words(aidId,profileId,wordId,revision) VALUES (?,?,?,1)', ['aid', p1, stool.id]);
    expect(await words.update(p1, stool.id, { ...stool, ru: 'мой стул' })).toMatchObject({ learningReset: true, word: { revision: 2 } });
    expect(await h.db.first('SELECT streak,learned,bonusAwarded,dueDate FROM word_progress WHERE wordId=?', [stool.id])).toEqual({ streak: 0, learned: 0, bonusAwarded: 1, dueDate: null });
    expect(await h.profile(p1)).toMatchObject({ xp: 750 });
    expect(await h.wordState(p1, stool.id)).toMatchObject({ streak: 0, mastered: false, dueDay: null, masteryBonusGranted: true });
    expect(await h.db.first('SELECT streak FROM word_progress WHERE profileId=? AND wordId<>? LIMIT 1', [p1, stool.id])).toEqual({ streak: 20 });
    expect(await h.db.all('SELECT * FROM skill_stats WHERE wordId=?', [stool.id])).toEqual([]);
    expect(await h.db.first('SELECT stale FROM aids WHERE id=?', ['aid'])).toEqual({ stale: 1 });
    await expect(words.get(p2, stool.id)).rejects.toMatchObject({ code: 'WRONG_PROFILE' });
    await expect(words.update(p2, stool.id, stool)).rejects.toMatchObject({ code: 'WRONG_PROFILE' });
});
test('metadata_edit_preserves_learning', async () => {
    await h.db.run('UPDATE word_progress SET streak=9,difficult=1 WHERE wordId=?', [stool.id]);
    expect(await words.update(p1, stool.id, { ...stool, icon: 'chair', plural: 'Stühle', note: 'note', exampleDe: 'Ein Stuhl.', exampleRu: 'Стул.' })).toMatchObject({ learningReset: false, word: { icon: 'chair', revision: 1 } });
    expect(await h.db.first('SELECT streak,difficult FROM word_progress WHERE wordId=?', [stool.id])).toEqual({ streak: 9, difficult: 1 });
});
test('canonical_duplicate_and_same_translation', async () => {
    await words.create(p1, { de: 'Hocker', ru: 'стул', pos: 'noun', gender: 'm' });
    await expect(words.create(p1, { de: ' STUHL ', ru: ' СТУЛ ', pos: 'noun', gender: 'm' })).rejects.toMatchObject({ code: 'DUPLICATE' });
    await words.create(p1, { de: 'Tür', ru: 'дверь', pos: 'noun', gender: 'f' });
    await expect(words.create(p1, { de: 'Tu\u0308r', ru: 'дверь', pos: 'noun', gender: 'f' })).rejects.toMatchObject({ code: 'DUPLICATE' });
    expect((await words.list(p1, { query: 'STUHL' })).map((w: any) => w.de)).toEqual(['Stuhl']);
    expect((await words.list(p1, { query: 'стул' })).map((w: any) => w.de)).toEqual(['Hocker', 'Stuhl']);
    await h.db.run('UPDATE word_progress SET learned=1,difficult=1 WHERE wordId=?', [stool.id]);
    expect((await words.list(p1, { state: 'mastered', difficult: true })).map((w: any) => w.id)).toEqual([stool.id]);
    expect((await words.list(p1, { state: 'learning' })).some((w: any) => w.id === stool.id)).toBe(false);
});
test('validates_gender_and_presents_articles', async () => {
    for (const draft of [{ de: '', ru: 'x', pos: 'noun', gender: 'm' }, { de: 'x', ru: ' ', pos: 'noun', gender: 'm' }, { de: 'x', ru: 'x', pos: 'noun', gender: null }])
        await expect(words.create(p1, draft)).rejects.toMatchObject({ code: 'VALIDATION' });
    const adjective = await words.create(p1, { de: ' nett ', ru: 'милый', pos: 'adjective', gender: 'm' });
    expect(adjective).toMatchObject({ de: 'nett', gender: null });
    expect(genderPresentation(adjective)).toMatchObject({ article: null, color: null });
    expect(genderPresentation(stool)).toMatchObject({ article: 'der', color: '#2a63bd' });
    expect(genderPresentation({ ...stool, gender: 'f' })).toMatchObject({ article: 'die', color: '#cf4c86' });
    expect(genderPresentation({ ...stool, gender: 'n' })).toMatchObject({ article: 'das', color: '#32815b' });
    const nouns = (await words.list(p1, {})).filter((w: any) => w.pos === 'noun');
    expect(nouns.filter((w: any) => w.plural && w.exampleDe && w.exampleRu)).toHaveLength(24);
});
test('noun_case_is_standardized_without_losing_umlauts', async () => {
    expect(await words.create(p1, { de: ' BÄUMCHEN ', ru: 'деревце', pos: 'noun', gender: 'n' })).toMatchObject({ de: 'Bäumchen' });
});
