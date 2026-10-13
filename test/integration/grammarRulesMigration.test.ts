import { migrateGrammarMastery } from '../../src/core/migrations/009_grammar_mastery';
import { randomUUID } from 'node:crypto';
import type { SqlStore } from '../../src/core/sql';
import { GrammarSessionRepository } from '../../src/features/grammar/grammarSessionRepository';
import { GrammarAnswerService } from '../../src/features/grammar/grammarAnswerService';
import { makeGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
import type { GrammarTargetId, GrammarQuestion } from '../../src/features/grammar/grammarTypes';
import { createProfile, setActiveProfile } from '../../src/features/profiles/profileRepository';
import { createGrammarHarness } from '../harness';
import { openTestDb } from '../sqlite';
import { createSchema8GrammarFixture, exportSchema8GrammarFixture } from '../fixtures/grammarSchema8';
const oldDay = '2026-10-06', day = '2026-10-13';
async function step9(db: SqlStore) {
    await db.schemaTransaction(async (tx) => { await migrateGrammarMastery(tx, day); await tx.exec('PRAGMA user_version=9'); });
}
async function snapshot(db: SqlStore) {
    const tables = await db.all<{
        name: string;
    }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    return { version: await db.first('PRAGMA user_version'), schema: await db.all("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name"), rows: await Promise.all(tables.map(async ({ name }) => ({ name, rows: await db.all(`SELECT * FROM ${name} ORDER BY rowid`) }))) };
}
async function pending(db: SqlStore, profileId: string, targetId: GrammarTargetId, mode: 'study' | 'review', ids: GrammarTargetId[] = [targetId]) {
    const sessionId = randomUUID();
    const progress = await db.first<{
        attemptCount: number;
        variantIndex: number;
        reviewStage: number;
        dueDay: string | null;
    }>('SELECT * FROM grammar_progress WHERE profileId=? AND targetId=?', [profileId, targetId]);
    const q = makeGrammarQuestion({ attemptId: randomUUID(), sessionId, profileId, targetId, responseMode: 'choice', variantIndex: progress!.variantIndex, words: [], reviewStage: mode === 'review' ? progress!.reviewStage : null, dueDay: mode === 'review' ? progress!.dueDay : null });
    await db.run("INSERT INTO grammar_sessions(id,profileId,selection,targetIds,currentQuestion,status) VALUES (?,?,?,?,?,'active')", [sessionId, profileId, JSON.stringify({ mode, lesson: 'pronouns', targetIds: ids }), JSON.stringify(ids), JSON.stringify(q)]);
    await db.run("INSERT INTO grammar_questions(attemptId,profileId,sessionId,targetId,catalogVersion,kind,responseMode,payload,status) VALUES (?,?,?,?,1,?,?,?,'active')", [q.attemptId, profileId, sessionId, targetId, q.kind, q.responseMode, JSON.stringify(q)]);
    return q;
}
function answer(q: GrammarQuestion) { if (q.catalogVersion !== 1)
    throw new Error('Expected legacy question'); return q.responseMode === 'choice' ? { kind: 'choice' as const, optionId: q.expected.optionId } : { kind: 'typed' as const, text: q.expected.token }; }
test('schema8_upgrade_boundary_states_and_one_bonus', async () => {
    const h = openTestDb();
    try {
        const f = await createSchema8GrammarFixture(h.db, oldDay);
        const backup = await exportSchema8GrammarFixture(h.db);
        expect(backup.version).toBe(3);
        expect(backup.profiles[0].grammar.attempts).toHaveLength(58);
        expect(backup.profiles[0].grammar.attempts.every(a => a.result.rulesVersion === undefined)).toBe(true);
        const history = await h.db.all('SELECT * FROM grammar_attempts ORDER BY rowid');
        const questions = await h.db.all('SELECT * FROM grammar_questions ORDER BY rowid');
        await h.db.exec('CREATE INDEX custom_grammar_progress ON grammar_progress(profileId,streak)');
        await step9(h.db);
        for (const profileId of f.profileIds) {
            const rows = await h.db.all('SELECT targetId,streak,mastered,masteryBonusGranted,rulesVersion,dueDay,attemptCount FROM grammar_progress WHERE profileId=? ORDER BY rowid', [profileId]);
            expect(rows).toEqual(f.targetIds.map((targetId, index) => ({ targetId, streak: [0, 9, 10, 10, 10][index], mastered: +(index >= 2), masteryBonusGranted: +(index >= 2), rulesVersion: 2, dueDay: index < 2 ? null : index === 4 ? '2026-10-07' : '2026-10-14', attemptCount: [0, 9, 10, 19, 20][index] })));
            expect(await h.db.first('SELECT xp FROM profiles WHERE id=?', [profileId])).toEqual({ xp: 730 });
            expect(await h.db.all('SELECT xpDelta FROM grammar_rule_transitions WHERE profileId=? AND xpDelta>0', [profileId])).toEqual([{ xpDelta: 50 }, { xpDelta: 50 }]);
        }
        expect(await h.db.all('SELECT * FROM grammar_attempts ORDER BY rowid')).toEqual(history);
        expect(await h.db.all('SELECT * FROM grammar_questions ORDER BY rowid')).toEqual(questions);
        expect(await h.db.all('PRAGMA foreign_key_check')).toEqual([]);
        expect(await h.db.first("SELECT name FROM sqlite_master WHERE name='custom_grammar_progress'")).toEqual({ name: 'custom_grammar_progress' });
        const transitions = await h.db.all<{
            targetId: string;
            afterAttemptId: string | null;
            stateBefore: string;
            stateAfter: string;
        }>('SELECT * FROM grammar_rule_transitions WHERE profileId=? ORDER BY rowid', [f.profileIds[0]]);
        expect(transitions).toHaveLength(5);
        expect(transitions[0].afterAttemptId).toBeNull();
        expect(JSON.parse(transitions[3].stateBefore).streak).toBe(19);
        expect(JSON.parse(transitions[3].stateAfter).streak).toBe(10);
        expect(transitions[3].afterAttemptId).toBe(backup.profiles[0].grammar.attempts.filter(a => a.targetId === f.targetIds[3]).at(-1)!.result.attemptId);
        const prior = backup.profiles[0].grammar.attempts.at(-1)!;
        expect(await new GrammarAnswerService(h.db).submit(f.profileIds[0], prior.sessionId, prior.result.attemptId, prior.result.submittedAnswer, day)).toEqual(prior.result);
        await expect(h.db.run('UPDATE grammar_progress SET streak=11 WHERE profileId=? AND targetId=?', [f.profileIds[0], f.targetIds[0]])).rejects.toThrow();
        await expect(h.db.run('UPDATE grammar_rule_transitions SET afterAttemptId=? WHERE profileId=? AND targetId=?', ['missing', f.profileIds[0], f.targetIds[0]])).rejects.toThrow();
    }
    finally {
        h.close();
    }
});
test('repeat_migration_is_idempotent', async () => { const h = openTestDb(); try {
    await createSchema8GrammarFixture(h.db, oldDay);
    await step9(h.db);
    const before = await snapshot(h.db);
    await step9(h.db);
    expect(await snapshot(h.db)).toEqual(before);
}
finally {
    h.close();
} });
test('migration_failure_rolls_back_state_and_xp', async () => { const h = openTestDb(); try {
    await createSchema8GrammarFixture(h.db, oldDay);
    await h.db.exec("CREATE TRIGGER fail_migration BEFORE INSERT ON daily_activity BEGIN SELECT RAISE(ABORT,'migration injected'); END;");
    const before = await snapshot(h.db);
    await expect(step9(h.db)).rejects.toThrow('migration injected');
    expect(await snapshot(h.db)).toEqual(before);
    expect(await h.db.first('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    await h.db.exec('DROP TRIGGER fail_migration');
    await step9(h.db);
}
finally {
    h.close();
} });
test('auto_mastery_is_not_an_answer', async () => { const h = openTestDb(); try {
    const f = await createSchema8GrammarFixture(h.db, oldDay);
    const words = await h.db.all('SELECT * FROM word_progress ORDER BY rowid');
    await step9(h.db);
    expect(await h.db.all('SELECT * FROM word_progress ORDER BY rowid')).toEqual(words);
    for (const p of f.profileIds) {
        expect(await h.db.all('SELECT day,correct,errors,xp FROM daily_activity WHERE profileId=? ORDER BY day', [p])).toEqual([{ day: oldDay, correct: 58, errors: 0, xp: 630 }, { day, correct: 0, errors: 0, xp: 100 }]);
        expect(await h.db.first('SELECT COUNT(*) n FROM grammar_attempts WHERE profileId=?', [p])).toEqual({ n: 58 });
        expect(await h.db.first('SELECT SUM(attemptCount) n FROM grammar_progress WHERE profileId=?', [p])).toEqual({ n: 58 });
    }
}
finally {
    h.close();
} });
test('pending_auto_mastered_question_is_cancelled', async () => { const h = openTestDb(); try {
    const f = await createSchema8GrammarFixture(h.db, oldDay);
    const q = await pending(h.db, f.profileIds[0], f.targetIds[2], 'study', [f.targetIds[2], f.targetIds[1]]);
    await step9(h.db);
    expect(await h.db.first('SELECT status,payload FROM grammar_questions WHERE attemptId=?', [q.attemptId])).toEqual({ status: 'cancelled', payload: JSON.stringify(q) });
    const repo = new GrammarSessionRepository(h.db);
    expect(await repo.resume(f.profileIds[0])).toMatchObject({ currentQuestion: null, result: null, status: 'active' });
    expect((await repo.next(f.profileIds[0], q.sessionId, day))!.targetId).toBe(f.targetIds[1]);
}
finally {
    h.close();
} });
test('pending_nine_and_due_review_survive', async () => { const h = openTestDb(); try {
    const f = await createSchema8GrammarFixture(h.db, oldDay);
    const nine = await pending(h.db, f.profileIds[0], f.targetIds[1], 'study');
    const review = await pending(h.db, f.profileIds[1], f.targetIds[4], 'review');
    await step9(h.db);
    const repo = new GrammarSessionRepository(h.db);
    expect(await repo.next(nine.profileId, nine.sessionId, day)).toEqual(nine);
    expect(await repo.next(review.profileId, review.sessionId, day)).toEqual(review);
}
finally {
    h.close();
} });
test('new_live_grammar_uses_rules2', async () => { const h = await createGrammarHarness(); try {
    const p = await createProfile(h.db, 'Live');
    const s = (await h.grammarSessions.start(p.id, { mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }, day))!;
    let q: GrammarQuestion | null = null;
    let result;
    for (let n = 1; n <= 10; n++) {
        q = await h.grammarSessions.next(p.id, s.id, day);
        result = await h.grammarAnswers.submit(p.id, s.id, q!.attemptId, answer(q!), day);
        expect(result.rulesVersion).toBe(2);
        expect(result.xpDelta).toBe(n === 10 ? 60 : 10);
    }
    expect(result).toMatchObject({ state: { streak: 10, mastered: true } });
    expect(await h.grammarAnswers.submit(p.id, s.id, q!.attemptId, answer(q!), day)).toEqual(result);
    expect(await h.profile(p.id)).toMatchObject({ xp: 150 });
    expect(await h.db.first('SELECT rulesVersion,attemptCount FROM grammar_progress WHERE profileId=?', [p.id])).toEqual({ rulesVersion: 2, attemptCount: 10 });
}
finally {
    h.close();
} });
test('inactive_profile_cannot_submit', async () => { const h = await createGrammarHarness(); try {
    const a = await createProfile(h.db, 'A');
    const s = (await h.grammarSessions.start(a.id, { mode: 'study', lesson: 'pronouns' }, day))!;
    const q = (await h.grammarSessions.next(a.id, s.id, day))!;
    const b = await createProfile(h.db, 'B');
    await expect(h.grammarAnswers.submit(a.id, s.id, q.attemptId, answer(q), day)).rejects.toMatchObject({ code: 'INACTIVE_PROFILE' });
    expect(await h.db.first('SELECT COUNT(*) n FROM grammar_attempts')).toEqual({ n: 0 });
    await setActiveProfile(h.db, b.id);
}
finally {
    h.close();
} });
