import { createGrammarHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { lektion2Targets } from '../../src/features/grammar/grammarCatalog';
import { sameGrammarSelection } from '../../src/features/grammar/grammarSessionRepository';
import type { GrammarQuestion, GrammarSubmission } from '../../src/features/grammar/grammarTypes';
const day = '2026-10-08';
function answer(q: GrammarQuestion): GrammarSubmission { if(q.catalogVersion===3) throw new Error('Expected pre-Lektion3 question'); return q.catalogVersion === 2 && q.presentation === 'sentence' ? { kind: 'typed', text: q.expected.sentences[0] } : q.responseMode === 'choice' ? { kind: 'choice', optionId: q.expected.optionId } : { kind: 'typed', text: q.expected.token }; }
test('new_goal_starts_at_zero', async () => { const h = await createGrammarHarness(); try {
    const p = await createProfile(h.db, 'New');
    for (const t of lektion2Targets) {
        expect(await h.grammar.getState(p.id, t.id)).toMatchObject({ state: { streak: 0 }, variantIndex: 0 });
        const s = await h.grammarSessions.start(p.id, { mode: 'study', lesson: t.kind, targetIds: [t.id] }, day);
        expect(await h.grammarSessions.next(p.id, s!.id, day)).toMatchObject({ catalogVersion: 2, targetId: t.id });
    }
}
finally {
    h.close();
} });
test('lesson_selection_cannot_resume_other_lesson', () => { expect(sameGrammarSelection({ mode: 'study', lesson: 'mixed' }, { mode: 'study', lesson: 'professions-sein' })).toBe(false); expect(sameGrammarSelection({ mode: 'study', lesson: 'mixed' }, { mode: 'study', lesson: 'mixed', targetIds: [] })).toBe(false); expect(sameGrammarSelection({ mode: 'study', lesson: 'mixed', targetIds: ['sein-cloze:ich', 'sein-cloze:du'] }, { mode: 'study', lesson: 'mixed', targetIds: ['sein-cloze:du', 'sein-cloze:ich'] })).toBe(true); });
test('duplicate_submit_after_resume_awards_once', async () => { const h = await createGrammarHarness(); try {
    const p = await createProfile(h.db, 'Resume');
    const s = await h.grammarSessions.start(p.id, { mode: 'study', lesson: 'professions-sein', targetIds: ['professions-sein:ich'] }, day);
    const q = (await h.grammarSessions.next(p.id, s!.id, day))!;
    const r = await h.grammarAnswers.submit(p.id, s!.id, q.attemptId, answer(q), day);
    await h.grammarSessions.resume(p.id);
    expect(await h.grammarAnswers.submit(p.id, s!.id, q.attemptId, answer(q), day)).toEqual(r);
    expect(await h.profile(p.id)).toMatchObject({ xp: 10 });
}
finally {
    h.close();
} });
test('empty_dictionary_can_finish_lesson', async () => { const h = await createGrammarHarness(); try {
    const p = await createProfile(h.db, 'Empty');
    await h.db.run('DELETE FROM word_progress WHERE profileId=?', [p.id]);
    await h.db.run('DELETE FROM word_topics WHERE profileId=?', [p.id]);
    await h.db.run('DELETE FROM words WHERE profileId=?', [p.id]);
    const s = await h.grammarSessions.start(p.id, { mode: 'study', lesson: 'yesno-transform', targetIds: ['yesno-transform:noun'] }, day);
    for (let i = 0; i < 10; i++) {
        const q = (await h.grammarSessions.next(p.id, s!.id, day))!;
        await h.grammarAnswers.submit(p.id, s!.id, q.attemptId, answer(q), day);
    }
    expect(await h.grammarSessions.next(p.id, s!.id, day)).toBeNull();
    expect(await h.profile(p.id)).toMatchObject({ xp: 150 });
}
finally {
    h.close();
} });
test('new_target_resets_recovers_and_keeps_mastery_in_all_review_intervals', async () => {
    const h = await createGrammarHarness();
    try {
        const p = await createProfile(h.db, 'Transitions');
        const targetId = 'professions-sein:ich' as const;
        const selection = { mode: 'study' as const, lesson: 'professions-sein' as const, targetIds: [targetId] };
        const s = (await h.grammarSessions.start(p.id, selection, day))!;
        async function submit(right: boolean, today = day, sessionId = s.id) { const q = (await h.grammarSessions.next(p.id, sessionId, today))!; if(q.catalogVersion!==2)throw new Error('Expected Lektion2'); return h.grammarAnswers.submit(p.id, sessionId, q.attemptId, right ? answer(q) : q.responseMode === 'typed' ? { kind: 'typed', text: 'falsch' } : { kind: 'choice', optionId: q.options.find(o => o.id !== q.expected.optionId)!.id }, today); }
        for (let i = 0; i < 9; i++)
            await submit(true);
        expect(await h.grammar.getState(p.id, targetId)).toMatchObject({ state: { streak: 9 } });
        await submit(false);
        expect(await h.grammar.getState(p.id, targetId)).toMatchObject({ state: { streak: 0 } });
        await submit(false);
        await submit(false);
        expect(await h.grammar.getState(p.id, targetId)).toMatchObject({ state: { difficult: true } });
        for (let i = 0; i < 3; i++)
            await submit(true);
        expect(await h.grammar.getState(p.id, targetId)).toMatchObject({ state: { difficult: false } });
        for (let i = 3; i < 10; i++)
            await submit(true);
        expect(await h.profile(p.id)).toMatchObject({ xp: 240 });
        expect(await h.grammar.getState(p.id, targetId)).toMatchObject({ state: { mastered: true, dueDay: '2026-10-09' } });
        const intervals = [['2026-10-09', 1, '2026-10-12'], ['2026-10-12', 2, '2026-10-19'], ['2026-10-19', 3, '2026-11-02'], ['2026-11-02', 4, '2026-12-02'], ['2026-12-02', 5, '2027-01-31'], ['2027-01-31', 5, '2027-04-01']] as const;
        for (const [today, reviewStage, dueDay] of intervals) {
            const review = (await h.grammarSessions.start(p.id, { ...selection, mode: 'review' }, today))!;
            await submit(true, today, review.id);
            expect(await h.grammar.getState(p.id, targetId)).toMatchObject({ state: { mastered: true, reviewStage, dueDay } });
        }
        const review = (await h.grammarSessions.start(p.id, { ...selection, mode: 'review' }, '2027-04-01'))!;
        await submit(false, '2027-04-01', review.id);
        expect(await h.grammar.getState(p.id, targetId)).toMatchObject({ state: { mastered: true, streak: 10, reviewStage: 0, dueDay: '2027-04-02' } });
    }
    finally {
        h.close();
    }
});
