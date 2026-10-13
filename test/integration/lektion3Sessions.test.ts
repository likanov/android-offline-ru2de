import { createGrammarHarness } from '../harness';
import { GrammarProgressRepository } from '../../src/features/grammar/grammarProgressRepository';
import { createProfile } from '../../src/features/profiles/profileRepository';
const day = '2026-10-13';
test('invalid_empty_duplicate_unknown_ids_do_not_mutate', async () => {
    const h = await createGrammarHarness();
    try {
        const p = await createProfile(h.db, 'Invariant');
        const s = (await h.grammarSessions.start(p.id, { mode: 'study', lesson: 'plural-invariant' } as any, day))!;
        const q = (await h.grammarSessions.next(p.id, s.id, day))!;
        const before = await h.backup.exportAll();
        for (const optionIds of [[], ['lehrer', 'lehrer'], ['unknown']]) {
            await expect(h.grammarAnswers.submit(p.id, s.id, q.attemptId, { kind: 'multi-choice', optionIds } as any, day)).rejects.toMatchObject({ code: 'GRAMMAR_ANSWER_INVALID' });
            expect((await h.backup.exportAll()).profiles).toEqual(before.profiles);
        }
        expect((await h.grammarAnswers.submit(p.id, s.id, q.attemptId, { kind: 'multi-choice', optionIds: ['lehrer'] } as any, day)).right).toBe(false);
        expect(await h.db.first('SELECT COUNT(*) n FROM grammar_attempts')).toEqual({ n: 1 });
    }
    finally {
        h.close();
    }
});
test('lektion3_mastery_ten_and_once_only_bonus', async () => {
    const h = await createGrammarHarness();
    try {
        const p = await createProfile(h.db, 'Plural');
        await h.db.run('DELETE FROM word_topics WHERE profileId=?', [p.id]);
        await h.db.run('DELETE FROM word_progress WHERE profileId=?', [p.id]);
        await h.db.run('DELETE FROM words WHERE profileId=?', [p.id]);
        const s = (await h.grammarSessions.start(p.id, { mode: 'study', lesson: 'noun-plural', targetIds: ['noun-plural:buch'] } as any, day))!;
        let q: any, result: any;
        for (let i = 1; i <= 10; i++) {
            q = await h.grammarSessions.next(p.id, s.id, day);
            expect(q.responseMode).toBe('typed');
            result = await h.grammarAnswers.submit(p.id, s.id, q.attemptId, { kind: 'typed', text: 'die Bücher' }, day);
            expect(result.xpDelta).toBe(i === 10 ? 60 : 10);
            expect(result.rulesVersion).toBe(2);
        }
        expect(result.state).toMatchObject({ streak: 10, mastered: true });
        expect(await h.grammarAnswers.submit(p.id, s.id, q.attemptId, { kind: 'typed', text: 'die Bücher' }, day)).toEqual(result);
        expect(await h.profile(p.id)).toMatchObject({ xp: 150 });
        expect(await h.db.first('SELECT COUNT(*) n FROM grammar_rewards')).toEqual({ n: 1 });
        expect(await h.grammarSessions.next(p.id, s.id, day)).toBeNull();
        const summary = await new GrammarProgressRepository(h.db).summary(p.id, day, 'noun-plural' as any);
        expect(summary.totalTargets).toBe(25);
        expect((summary.skills as any)['noun-plural'].correct).toBe(10);
        expect((await new GrammarProgressRepository(h.db).summary(p.id, day, 'mixed')).totalTargets).toBe(18);
    }
    finally {
        h.close();
    }
});
test('article_sessions_alternate_number_preserve_response_modes_and_resume', async () => {
    const h = await createGrammarHarness();
    try {
        const p = await createProfile(h.db, 'Article');
        const s = (await h.grammarSessions.start(p.id, { mode: 'study', lesson: 'noun-article', targetIds: ['noun-article:buch'] }, day))!;
        for (let i = 0; i < 5; i++) {
            const q: any = await h.grammarSessions.next(p.id, s.id, day);
            expect(q.number).toBe(i % 2 === 0 ? 'singular' : 'plural');
            expect(q.responseMode).toBe(i === 3 ? 'typed' : 'choice');
            expect((await h.grammarSessions.resume(p.id))!.currentQuestion).toEqual(q);
            const answer = q.responseMode === 'choice' ? { kind: 'choice' as const, optionId: q.expected.optionId } : { kind: 'typed' as const, text: q.expected.token };
            expect((await h.grammarAnswers.submit(p.id, s.id, q.attemptId, answer, day)).right).toBe(true);
        }
    }
    finally {
        h.close();
    }
});
