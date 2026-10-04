import { createAssistantHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { DifficultPracticeRepository } from '../../src/features/assistant/difficultPracticeRepository';
import type { LanguageRuntime } from '../../src/features/assistant/runtimeTypes';

const day = '2026-10-03';

test('difficult_selection_is_owned_flagged_ordered_and_bounded', async () => {
    const h = await createAssistantHarness();
    try {
        const p1 = await createProfile(h.db, 'A'), p2 = await createProfile(h.db, 'B');
        const p1Words = (await h.words.list(p1.id)).slice(0, 6);
        const p2Words = (await h.words.list(p2.id)).slice(0, 3);
        for (const word of [...p1Words, ...p2Words])
            await h.db.run('UPDATE word_progress SET difficult=1 WHERE profileId=? AND wordId=?', [word.profileId, word.id]);
        await h.db.run('UPDATE word_progress SET difficult=0 WHERE profileId=? AND wordId=?', [p1.id, p1Words[0].id]);

        const selected = await new DifficultPracticeRepository(h.db).select(p1.id);

        const expected = p1Words.slice(1).sort((a, b) => a.de.localeCompare(b.de) || a.id.localeCompare(b.id)).slice(0, 5);
        expect(selected.map(word => word.id)).toEqual(expected.map(word => word.id));
        expect(selected.every(word => word.profileId === p1.id)).toBe(true);
    }
    finally {
        h.close();
    }
});

test('future_review_word_can_be_practised_without_rescheduling', async () => {
    const h = await createAssistantHarness();
    try {
        const profile = await createProfile(h.db, 'A');
        const word = (await h.words.list(profile.id)).find(w => w.de === 'Stuhl')!;
        await h.db.run("UPDATE word_progress SET difficult=1,learned=1,streak=20,bonusAwarded=1,dueDate='2026-12-01' WHERE profileId=? AND wordId=?", [profile.id, word.id]);

        expect((await new DifficultPracticeRepository(h.db).select(profile.id)).map(row => row.id)).toEqual([word.id]);
        expect(await h.wordState(profile.id, word.id)).toMatchObject({ mastered: true, dueDay: '2026-12-01', difficult: true });
    }
    finally {
        h.close();
    }
});

test('empty_difficult_pool_does_not_call_runtime', async () => {
    let generated = 0;
    const runtime: LanguageRuntime = {
        load: async () => {},
        generate: async () => {
            generated += 1;
            return '{}';
        },
        cancel: async () => {},
        release: async () => {},
    };
    const h = await createAssistantHarness(runtime);
    try {
        const profile = await createProfile(h.db, 'A');

        await expect(h.assistant.generatePractice({ kind: 'difficult', profileId: profile.id, wordIds: [] }, new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'VALIDATION' });

        expect(generated).toBe(0);
        expect(await h.db.all('SELECT * FROM sessions WHERE profileId=?', [profile.id])).toEqual([]);
    }
    finally {
        await h.assistant.cancelAndRelease().catch(() => {});
        h.close();
    }
});
