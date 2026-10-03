import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { SessionRepository } from '../../src/features/learning/sessionRepository';
import { AnswerService } from '../../src/features/learning/answerService';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTestDb } from '../sqlite';
import { migrate } from '../../src/core/migrations';
let h: any, p1: string, p2: string, w: any, s: any, a: any;
const day = '2026-10-03';
beforeEach(async () => { h = await createWordHarness(); p1 = (await createProfile(h.db, 'A')).id; p2 = (await createProfile(h.db, 'B')).id; w = (await h.words.list(p1)).find((x: any) => x.de === 'Stuhl'); s = new SessionRepository(h.db); a = AnswerService ? new AnswerService(h.db) : null; });
afterEach(() => h.close());
async function question(mode = 'study') { const session = await s.start(p1, { mode, wordIds: [w.id] }, day); expect(session).not.toBeNull(); return { session, q: await s.next(p1, session.id, day) }; }
test('duplicate_and_stale_submission_are_not_rewarded', async () => { const { session, q } = await question(); const first = await a.submit(p1, session.id, q.attemptId, 'der Stuhl', day); expect(first).toMatchObject({ right: true, xpDelta: 10, state: { streak: 1 } }); expect(await a.submit(p1, session.id, q.attemptId, 'wrong', day)).toEqual(first); expect(await h.profile(p1)).toMatchObject({ xp: 10 }); expect(await h.db.first('SELECT count(*) AS n FROM attempts WHERE attemptId=?', [q.attemptId])).toEqual({ n: 1 }); await expect(a.submit(p2, session.id, q.attemptId, 'der Stuhl', day)).rejects.toMatchObject({ code: 'WRONG_PROFILE' }); expect((await s.resume(p1)).currentQuestion).toEqual(q); expect((await s.resume(p1)).result).toEqual(first); await s.next(p1, session.id, day); await expect(a.submit(p1, session.id, 'different', 'der Stuhl', day)).rejects.toMatchObject({ code: 'STALE_QUESTION' }); });
test('storage_failure_rolls_back_entire_answer', async () => { const { session, q } = await question(); await h.db.exec("CREATE TRIGGER fail_xp BEFORE UPDATE OF xp ON profiles BEGIN SELECT RAISE(ABORT,'injected'); END;"); const before = await snapshot(); await expect(a.submit(p1, session.id, q.attemptId, 'der Stuhl', day)).rejects.toThrow('injected'); expect(await snapshot()).toEqual(before); await h.db.exec('DROP TRIGGER fail_xp'); expect(await a.submit(p1, session.id, q.attemptId, 'der Stuhl', day)).toMatchObject({ xpDelta: 10 }); });
async function snapshot() { const tables = ['profiles', 'word_progress', 'sessions', 'questions', 'attempts', 'rewards', 'daily_activity', 'skill_stats', 'skill_history']; return Promise.all(tables.map(t => h.db.all('SELECT * FROM ' + t))); }
test('mastery_bonus_and_finished_pool_persist', async () => { await h.db.run('UPDATE word_progress SET streak=19 WHERE wordId=?', [w.id]); const { session, q } = await question(); expect(await a.submit(p1, session.id, q.attemptId, q.expected[0], day)).toMatchObject({ xpDelta: 60, state: { mastered: true, dueDay: '2026-10-04' } }); expect(await h.db.first('SELECT amount,attemptId FROM rewards WHERE wordId=?', [w.id])).toEqual({ amount: 50, attemptId: q.attemptId }); expect(await s.next(p1, session.id, day)).toBeNull(); expect(await s.resume(p1)).toBeNull(); });
test('wrong_answer_resets_19_to_zero', async () => { await h.db.run('UPDATE word_progress SET streak=19 WHERE wordId=?', [w.id]); const { session, q } = await question(); expect(await a.submit(p1, session.id, q.attemptId, 'wrong', day)).toMatchObject({ xpDelta: 0, state: { streak: 0, totalErrors: 1 } }); });
test('different_old_review_attempt_id_is_rejected', async () => { await h.db.run('UPDATE word_progress SET streak=20,learned=1,bonusAwarded=1,dueDate=? WHERE wordId=?', [day, w.id]); const { session, q } = await question('review'); await a.submit(p1, session.id, q.attemptId, q.expected[0], day); await expect(a.submit(p1, session.id, 'old-review', q.expected[0], day)).rejects.toMatchObject({ code: 'STALE_QUESTION' }); expect(await s.next(p1, session.id, day)).toBeNull(); });
test('lexical_edit_cancels_question_and_removes_queue_word', async () => { const { session, q } = await question(); await h.words.update(p1, w.id, { ...w, ru: 'мой стул' }); await expect(a.submit(p1, session.id, q.attemptId, 'der Stuhl', day)).rejects.toMatchObject({ code: 'STALE_QUESTION' }); expect((await s.resume(p1)).wordIds).toEqual([]); expect(await s.next(p1, session.id, day)).toBeNull(); });
test('cancel_and_rotation_preserve_progress_and_one_active_session', async () => { const { session, q } = await question(); await s.cancelQuestion(p1, session.id); const next = await s.next(p1, session.id, day); expect(next.attemptId).not.toBe(q.attemptId); expect(next.kind).toBe('de-ru'); expect(await h.wordState(p1, w.id)).toMatchObject({ streak: 0 }); const kinds = [next.kind]; for (let i = 0; i < 5; i++) {
    await s.cancelQuestion(p1, session.id);
    kinds.push((await s.next(p1, session.id, day)).kind);
} expect(kinds).toEqual(['de-ru', 'typing', 'definite-article', 'indefinite-article', 'ru-de', 'de-ru']); await s.start(p1, { mode: 'study' }, day); expect(await h.db.first("SELECT count(*) AS n FROM sessions WHERE profileId=? AND status='active'", [p1])).toEqual({ n: 1 }); expect((await s.resume(p1)).wordIds).toHaveLength(5); });
test('concurrent_taps_only_commit_once', async () => { const { session, q } = await question(); const results = await Promise.all([a.submit(p1, session.id, q.attemptId, q.expected[0], day), a.submit(p1, session.id, q.attemptId, q.expected[0], day)]); expect(results[1]).toEqual(results[0]); expect(await h.profile(p1)).toMatchObject({ xp: 10 }); expect(await h.attemptCount(q.attemptId)).toBe(1); });
test('bonus_survives_lexical_revision_and_history_is_retained', async () => { await h.db.run('UPDATE word_progress SET streak=19 WHERE wordId=?', [w.id]); let { session, q } = await question(); await a.submit(p1, session.id, q.attemptId, q.expected[0], day); await h.words.update(p1, w.id, { ...w, ru: 'мой стул' }); expect(await h.db.all('SELECT * FROM skill_stats WHERE wordId=?', [w.id])).toHaveLength(0); expect(await h.db.all('SELECT * FROM skill_history WHERE wordId=?', [w.id])).toHaveLength(1); await h.db.run('UPDATE word_progress SET streak=19 WHERE wordId=?', [w.id]); ({ session, q } = await question()); expect(await a.submit(p1, session.id, q.attemptId, q.expected[0], day)).toMatchObject({ xpDelta: 10 }); expect(await h.db.all('SELECT * FROM rewards WHERE wordId=?', [w.id])).toHaveLength(1); expect(await h.db.first('SELECT revision,correct FROM skill_stats WHERE wordId=?', [w.id])).toEqual({ revision: 2, correct: 1 }); });
test('audio_availability_controls_listening_and_adjectives_skip_articles', async () => { const adj = (await h.words.list(p1)).find((x: any) => x.pos === 'adjective'); const audio = new SessionRepository(h.db, async () => true); const session = await audio.start(p1, { mode: 'study', wordIds: [adj.id] }, day); const kinds = []; for (let i = 0; i < 4; i++) {
    kinds.push((await audio.next(p1, session.id, day))!.kind);
    await audio.cancelQuestion(p1, session.id);
} expect(kinds).toEqual(['ru-de', 'de-ru', 'typing', 'listening']); });
test('database_reopen_preserves_question_and_committed_answer', async () => { const directory = mkdtempSync(join(tmpdir(), 'german-training-')); const path = join(directory, 'db.sqlite'); let store = openTestDb(path); try {
    await migrate(store.db);
    const p = await createProfile(store.db, 'Persisted');
    const repo = new SessionRepository(store.db);
    const session = await repo.start(p.id, { mode: 'study' }, day);
    const q = (await repo.next(p.id, session.id, day))!;
    store.close();
    store = openTestDb(path);
    expect((await new SessionRepository(store.db).resume(p.id))!.currentQuestion).toEqual(q);
    const result = await new AnswerService(store.db).submit(p.id, session.id, q.attemptId, q.expected[0], day);
    store.close();
    store = openTestDb(path);
    expect((await new SessionRepository(store.db).resume(p.id))!.result).toEqual(result);
    expect(await new AnswerService(store.db).submit(p.id, session.id, q.attemptId, 'wrong', day)).toEqual(result);
}
finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
} });

test('five_noun_pool_rotates_each_word_across_types_after_repository_restart', async () => {
    const nouns = (await h.words.list(p1)).filter((word: { pos: string }) => word.pos === 'noun').slice(0, 5);
    const session = await s.start(p1, { mode: 'study', wordIds: nouns.map((word: { id: string }) => word.id) }, day);
    const byWord = new Map<string, string[]>();
    for (let round = 0; round < 5; round++) {
        // Recreate the repository at every round to require persisted rotation state.
        s = new SessionRepository(h.db);
        const seen = new Set<string>();
        for (let i = 0; i < 5; i++) {
            const q = await s.next(p1, session.id, day);
            seen.add(q.wordId);
            byWord.set(q.wordId, [...(byWord.get(q.wordId) ?? []), q.kind]);
            await a.submit(p1, session.id, q.attemptId, q.expected[0], day);
        }
        expect(seen.size).toBe(5);
    }
    for (const kinds of byWord.values()) {
        expect(new Set(kinds).size).toBe(5);
        expect([...kinds].sort()).toEqual(['de-ru', 'definite-article', 'indefinite-article', 'ru-de', 'typing']);
    }
});
