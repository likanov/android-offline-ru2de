import type { SqlStore } from '../../src/core/sql';
import { BackupService } from '../../src/features/transfer/backupService';
import { createGrammarHarness } from '../harness';
import { makeGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
import { applyGrammarAnswer } from '../../src/features/grammar/grammarLearningRules';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { randomUUID } from 'expo-crypto';
async function fixture(count = 10, wrongReviewAnswers = 0) {
    const h = await createGrammarHarness();
    h.backup = new BackupService(h.db, () => count > 20 ? '2026-11-01' : '2026-10-14');
    const profile = await createProfile(h.db, 'Legacy');
    const sessionId = randomUUID(), targetId = 'sein-cloze:ich' as const;
    let state = { streak: 0, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null as string | null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 };
    const attempts: any[] = [], questions: any[] = [];
    for (let i = 0; i < count; i++) {
        const question = makeGrammarQuestion({ attemptId: randomUUID(), sessionId, profileId: profile.id, targetId, responseMode: 'choice', variantIndex: 0, words: [], reviewStage: state.mastered ? state.reviewStage : null, dueDay: state.dueDay });
        const answerDay = state.dueDay ?? '2026-10-13';
        const right = !(i >= 20 && i < 20 + wrongReviewAnswers);
        const transition = applyGrammarAnswer(state, right, state.mastered ? 'review' : 'study', answerDay, 1);
        state = transition.state;
        questions.push({ question, status: 'answered' });
        attempts.push({ profileId: profile.id, sessionId, targetId, day: answerDay, result: { attemptId: question.attemptId, targetId, right, xpDelta: transition.xpDelta, state, submittedAnswer: { kind: 'choice', optionId: right ? 'bin' : 'bist' } } });
    }
    const part: any = { profile: { ...profile, xp: attempts.reduce((sum, row) => sum + row.result.xpDelta, 0) }, words: [], progress: [], skillStats: [], skillHistory: [], topics: [], wordTopics: [], settings: { profileId: profile.id, dailyGoal: 20 }, dailyActivity: [...new Set(attempts.map(row => row.day))].map(day => ({ profileId: profile.id, day, correct: attempts.filter(row => row.day === day && row.result.right).length, errors: attempts.filter(row => row.day === day && !row.result.right).length, xp: attempts.filter(row => row.day === day).reduce((sum, row) => sum + row.result.xpDelta, 0) })), aids: [], aidWords: [], sessions: [], questions: [], attempts: [], rewards: [], grammar: { catalogVersions: [1, 2], progress: [{ profileId: profile.id, targetId, state, attemptCount: count, variantIndex: 0 }], sessions: [{ id: sessionId, profileId: profile.id, selection: { mode: 'study', lesson: 'sein', targetIds: [targetId] }, targetIds: [targetId], cursor: count, currentQuestion: null, result: null, status: 'cancelled' }], questions, attempts, rewards: count >= 20 ? [{ profileId: profile.id, targetId, attemptId: attempts[19].result.attemptId, amount: 50, day: '2026-10-13' }] : [] } };
    return { h, source: { format: 'german-vocabulary-backup', version: 3, createdAt: '2026-10-13T00:00:00.000Z', profiles: [part] } as any };
}
test('old_backups_are_validated_before_conversion', async () => {
    const { h, source } = await fixture();
    try {
        source.profiles[0].grammar.attempts[0].result.rulesVersion = 2;
        expect(() => h.backup.preview(JSON.stringify(source))).toThrow();
    }
    finally {
        h.close();
    }
});
test('old_ten_streak_gets_one_restore_bonus_and_day_is_sampled_at_restore_not_preview', async () => {
    const { h, source } = await fixture();
    let day = '2026-10-13', samples = 0;
    const service = new BackupService(h.db, () => { samples++; return day; });
    try {
        const preview = service.preview(JSON.stringify(source));
        expect(samples).toBe(0);
        expect(preview.backup.version).toBe(3);
        day = '2026-10-14';
        const restored = await service.restore(preview);
        const all = await service.exportAll();
        const part = all.profiles.find(p => p.profile.id === restored.profileIds[0])!;
        expect(samples).toBe(1);
        expect(all.version).toBe(4);
        expect(part.profile.xp).toBe(150);
        expect(part.grammar.progress[0].state).toMatchObject({ streak: 10, mastered: true, dueDay: '2026-10-15' });
        expect(part.dailyActivity).toContainEqual({ profileId: part.profile.id, day: '2026-10-14', correct: 0, errors: 0, xp: 50 });
        expect(part.grammar.rulesTransitions).toHaveLength(1);
        expect(part.grammar.rulesTransitions[0].afterAttemptId).toBe(part.grammar.attempts[9].result.attemptId);
    }
    finally {
        h.close();
    }
});
test('backup4_mixed_rules_roundtrip_and_restored_backup4_does_not_award_again', async () => {
    const { h, source } = await fixture(9);
    try {
        const restored = await h.backup.restore(h.backup.preview(JSON.stringify(source)));
        const id = restored.profileIds[0];
        await h.db.run('UPDATE app_settings SET activeProfileId=? WHERE id=1', [id]);
        const session = (await h.grammarSessions.start(id, { mode: 'study', lesson: 'sein', targetIds: ['sein-cloze:ich'] }, '2026-10-14'))!;
        const q = (await h.grammarSessions.next(id, session.id, '2026-10-14'))!;
        await h.grammarAnswers.submit(id, session.id, q.attemptId, q.responseMode === 'choice' ? { kind: 'choice', optionId: 'bin' } : { kind: 'typed', text: 'bin' }, '2026-10-14');
        const exported = await h.backup.exportAll();
        const part = exported.profiles.find(p => p.profile.id === id)!;
        expect(part.profile.xp).toBe(150);
        expect(part.grammar.attempts[0].result.rulesVersion).toBeUndefined();
        expect(part.grammar.attempts[9].result.rulesVersion).toBe(2);
        const again = await h.backup.restore(h.backup.preview(JSON.stringify({ ...exported, profiles: [part] })));
        const next = (await h.backup.exportAll()).profiles.find(p => p.profile.id === again.profileIds[0])!;
        expect(next.profile.xp).toBe(150);
        expect(next.grammar.rulesTransitions).toHaveLength(1);
        expect(next.grammar.progress[0].state).toEqual(part.grammar.progress[0].state);
    }
    finally {
        h.close();
    }
});
test.each(['anchor', 'duplicate', 'before', 'after', 'transitionXp', 'profileXp', 'dailyXp', 'rules', 'progress', 'attemptCount'] as const)('invalid_anchor_duplicate_transition_and_xp_are_atomic_%s', async (field) => {
    const { h, source } = await fixture();
    try {
        const restored = await h.backup.restore(h.backup.preview(JSON.stringify(source)));
        const exported = await h.backup.exportAll();
        const part = exported.profiles.find(p => p.profile.id === restored.profileIds[0])!;
        const valid = h.backup.preview(JSON.stringify({ ...exported, profiles: [part] }));
        const before = await h.backup.exportAll();
        const forged: any = JSON.parse(JSON.stringify(valid.backup));
        const p = forged.profiles[0], t = p.grammar.rulesTransitions[0];
        if (field === 'anchor')
            t.afterAttemptId = p.grammar.attempts[0].result.attemptId;
        if (field === 'duplicate')
            p.grammar.rulesTransitions.push(t);
        if (field === 'before')
            t.stateBefore.streak = 9;
        if (field === 'after')
            t.stateAfter.dueDay = '2026-10-20';
        if (field === 'transitionXp')
            t.xpDelta = 0;
        if (field === 'profileXp')
            p.profile.xp++;
        if (field === 'dailyXp')
            p.dailyActivity[0].xp++;
        if (field === 'rules')
            p.grammar.attempts[0].result.rulesVersion = 2;
        if (field === 'progress')
            p.grammar.progress[0].state.streak = 9;
        if (field === 'attemptCount')
            p.grammar.progress[0].attemptCount++;
        await expect(h.backup.restore({ ...valid, backup: forged })).rejects.toThrow();
        expect((await h.backup.exportAll()).profiles).toEqual(before.profiles);
    }
    finally {
        h.close();
    }
});
test('historical_twenty_results_are_not_rewritten_and_review_stage_is_preserved', async () => {
    const { h, source } = await fixture(22);
    try {
        const restored = await h.backup.restore(h.backup.preview(JSON.stringify(source)));
        const part = (await h.backup.exportAll()).profiles.find(p => p.profile.id === restored.profileIds[0])!;
        expect(part.grammar.attempts[19].result.state.streak).toBe(20);
        expect(part.grammar.attempts[19].result.rulesVersion).toBeUndefined();
        expect(part.profile.xp).toBe(270);
        expect(part.grammar.progress[0].state).toMatchObject({ streak: 10, mastered: true, reviewStage: 2, dueDay: '2026-10-24' });
        const row = await h.db.first<{
            result: string;
        }>('SELECT result FROM grammar_attempts WHERE attemptId=?', [part.grammar.attempts[19].result.attemptId]);
        expect(JSON.parse(row!.result).rulesVersion).toBeUndefined();
    }
    finally {
        h.close();
    }
});
test('legacy_restore_cancels_pending_study_question_when_transition_masters_target', async () => {
    const { h, source } = await fixture();
    try {
        const p = source.profiles[0], session = p.grammar.sessions[0];
        const question = makeGrammarQuestion({ attemptId: randomUUID(), sessionId: session.id, profileId: p.profile.id, targetId: 'sein-cloze:ich', responseMode: 'choice', variantIndex: 0, words: [], reviewStage: null, dueDay: null });
        session.status = 'active';
        session.currentQuestion = question;
        session.result = null;
        p.grammar.questions.push({ question, status: 'active' });
        const restored = await h.backup.restore(h.backup.preview(JSON.stringify(source)));
        const part = (await h.backup.exportAll()).profiles.find(p => p.profile.id === restored.profileIds[0])!;
        expect(part.grammar.questions[10].status).toBe('cancelled');
        expect(part.grammar.sessions[0].currentQuestion).toBeNull();
    }
    finally {
        h.close();
    }
});
test('duplicate_daily_transition_xp_rows_are_rejected', async () => {
    const { h, source } = await fixture();
    try {
        const restored = await h.backup.restore(h.backup.preview(JSON.stringify(source)));
        const all = await h.backup.exportAll();
        const part = all.profiles.find(p => p.profile.id === restored.profileIds[0])!;
        part.dailyActivity[1] = { ...part.dailyActivity[0] };
        expect(() => h.backup.preview(JSON.stringify({ ...all, profiles: [part] }))).toThrow();
    }
    finally {
        h.close();
    }
});
test('failure_inserting_transition_rolls_back_the_entire_prepared_graph', async () => {
    const { h, source } = await fixture();
    try {
        async function graph() {
            const tables = await h.db.all<{
                name: string;
            }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
            return Promise.all(tables.map(async (row) => ({ table: row.name, rows: await h.db.all(`SELECT * FROM ${row.name} ORDER BY rowid`) })));
        }
        const before = await graph();
        const interrupted: SqlStore = { ...h.db, transaction: work => h.db.transaction(tx => work({ ...tx, run: async (sql: string, params: any) => {
                    const result = await tx.run(sql, params);
                    if (sql.startsWith('INSERT INTO grammar_rule_transitions'))
                        throw new Error('disk full');
                    return result;
                } })) };
        const service = new BackupService(interrupted, () => '2026-10-14');
        await expect(service.restore(service.preview(JSON.stringify(source)))).rejects.toThrow('disk full');
        expect(await graph()).toEqual(before);
    }
    finally {
        h.close();
    }
});
test('mastered_legacy_difficulty_and_recovery_counters_survive_restore_without_bonus', async () => {
    const { h, source } = await fixture(24, 3);
    try {
        const restored = await h.backup.restore(h.backup.preview(JSON.stringify(source)));
        const part = (await h.backup.exportAll()).profiles.find(p => p.profile.id === restored.profileIds[0])!;
        expect(part.profile.xp).toBe(260);
        expect(part.grammar.rulesTransitions[0].xpDelta).toBe(0);
        expect(part.grammar.progress[0].state).toEqual({ streak: 10, mastered: true, masteryBonusGranted: true, reviewStage: 1, dueDay: '2026-10-20', difficult: true, totalErrors: 3, recoveryErrors: 3, recoveryCorrect: 1 });
        expect(part.grammar.progress[0].attemptCount).toBe(24);
    }
    finally {
        h.close();
    }
});
test('zero_history_transition_has_null_anchor_and_accepts_new_version_two_answer', async () => {
    const { h, source } = await fixture(0);
    try {
        const restored = await h.backup.restore(h.backup.preview(JSON.stringify(source)));
        const id = restored.profileIds[0];
        const part = (await h.backup.exportAll()).profiles.find(p => p.profile.id === id)!;
        expect(part.grammar.rulesTransitions[0]).toMatchObject({ afterAttemptId: null, xpDelta: 0 });
        await h.db.run('UPDATE app_settings SET activeProfileId=? WHERE id=1', [id]);
        const session = (await h.grammarSessions.start(id, { mode: 'study', lesson: 'sein', targetIds: ['sein-cloze:ich'] }, '2026-10-14'))!;
        const question = (await h.grammarSessions.next(id, session.id, '2026-10-14'))!;
        await h.grammarAnswers.submit(id, session.id, question.attemptId, { kind: 'choice', optionId: 'bin' }, '2026-10-14');
        expect((await h.backup.exportAll()).profiles.find(p => p.profile.id === id)!.profile.xp).toBe(10);
    }
    finally {
        h.close();
    }
});
