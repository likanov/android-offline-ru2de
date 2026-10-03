import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { ProgressRepository } from '../../src/features/progress/progressRepository';
import { subscribeProfileChanges } from '../../src/app/refreshBus';
test('goal_streak_and_historical_statistics', async () => {
    const h = await createWordHarness();
    try {
        const p = await createProfile(h.db, 'A'), other = await createProfile(h.db, 'B'), progress = new ProgressRepository(h.db);
        const w = (await h.words.list(p.id)).find(w => w.de === 'Stuhl')!;
        const session = await h.sessions.start(p.id, { mode: 'study', wordIds: [w.id] }, '2026-10-03');
        for (let i = 0; i < 3; i++) {
            const q = (await h.sessions.next(p.id, session!.id, '2026-10-03'))!;
            await h.answers.submit(p.id, session!.id, q.attemptId, q.expected[0], '2026-10-03');
        }
        const summary = await progress.summary(p.id, '2026-10-03');
        expect(summary).toMatchObject({ todayCorrect: 3, xp: 30, level: 1, xpToNextLevel: 470, goal: 20, dayStreak: 1, skills: { translation: { correct: 2, total: 2 }, writing: { correct: 1, total: 1 } }, calendar: [{ day: '2026-10-03', correct: 3 }] });
        await h.words.get(p.id, w.id);
        expect(await progress.summary(p.id, '2026-10-03')).toEqual(summary);
        await h.words.update(p.id, w.id, { ...w, ru: 'мой стул' });
        expect((await progress.summary(p.id, '2026-10-03')).skills).toEqual(summary.skills);
        expect(await h.db.all('SELECT * FROM skill_stats WHERE wordId=?', [w.id])).toHaveLength(0);
        for (const count of [1, 200]) {
            await progress.setGoal(p.id, count);
            expect(await progress.settings(p.id)).toEqual({ dailyGoal: count });
        }
        for (const count of [0, 201, 1.5, NaN])
            await expect(progress.setGoal(p.id, count)).rejects.toMatchObject({ code: 'VALIDATION' });
        expect(await progress.summary(other.id, '2026-10-03')).toMatchObject({ xp: 0, todayCorrect: 0, goal: 20, dayStreak: 0 });
        for (const [xp, level, remaining] of [[499, 1, 1], [500, 2, 500]]) {
            await h.db.run('UPDATE profiles SET xp=? WHERE id=?', [xp, p.id]);
            expect(await progress.summary(p.id, '2026-10-03')).toMatchObject({ level, xpToNextLevel: remaining });
        }
        await h.db.run("INSERT INTO profiles(id,name,createdAt) VALUES ('empty','Empty','2026-10-03')");
        await h.db.run("INSERT INTO settings(profileId) VALUES ('empty')");
        expect(await progress.summary('empty', '2026-10-03')).toMatchObject({ mastered: 0, totalWords: 0, dueCount: 0 });
    }
    finally {
        h.close();
    }
});
test('refresh follows successful commits and unsubscribes by profile', async () => {
    const h = await createWordHarness();
    try {
        const p = await createProfile(h.db, 'A');
        let calls = 0;
        const off = subscribeProfileChanges(p.id, () => calls++);
        const progress = new ProgressRepository(h.db);
        await expect(progress.setGoal(p.id, 0)).rejects.toMatchObject({ code: 'VALIDATION' });
        expect(calls).toBe(0);
        await progress.setGoal(p.id, 12);
        expect(calls).toBe(1);
        const s = (await h.sessions.start(p.id, { mode: 'study' }, '2026-10-03'))!;
        const q = (await h.sessions.next(p.id, s.id, '2026-10-03'))!;
        await h.answers.submit(p.id, s.id, q.attemptId, q.expected[0], '2026-10-03');
        expect(calls).toBe(2);
        off();
        await progress.setGoal(p.id, 13);
        expect(calls).toBe(2);
    }
    finally {
        h.close();
    }
});
test('wrong_answers_are_historical_attempts_but_do_not_extend_day_streak', async () => {
    const h = await createWordHarness();
    try {
        const p = await createProfile(h.db, 'A');
        const s = (await h.sessions.start(p.id, { mode: 'study' }, '2026-10-02'))!;
        let q = (await h.sessions.next(p.id, s.id, '2026-10-02'))!;
        await h.answers.submit(p.id, s.id, q.attemptId, q.expected[0], '2026-10-02');
        q = (await h.sessions.next(p.id, s.id, '2026-10-03'))!;
        await h.answers.submit(p.id, s.id, q.attemptId, 'wrong', '2026-10-03');
        expect(await h.progress.summary(p.id, '2026-10-03')).toMatchObject({ xp: 10, todayCorrect: 0, dayStreak: 1, skills: { translation: { correct: 1, total: 2 } } });
        expect(await h.progress.summary(p.id, '2026-10-04')).toMatchObject({ dayStreak: 0 });
    }
    finally {
        h.close();
    }
});

test.each(['study','review'] as const)('empty %s queue does not replace an existing active session', async mode => {
 const h=await createWordHarness();try {
  const p=await createProfile(h.db,'A');
  const active=await h.sessions.start(p.id,{mode:'study'},'2026-10-03');
  const question=await h.sessions.next(p.id,active.id,'2026-10-03');
  const word=(await h.words.list(p.id))[10];
  await h.db.run("UPDATE word_progress SET learned=1,streak=20,dueDate='2026-10-05' WHERE wordId=?",[word.id]);
  await expect(h.sessions.start(p.id,{mode,wordIds:[word.id]},'2026-10-03')).rejects.toMatchObject({code:'EMPTY_QUEUE'});
  expect(await h.sessions.resume(p.id)).toMatchObject({id:active.id,currentQuestion:question,status:'active'});
  expect(await h.db.first('SELECT COUNT(*) AS n FROM sessions WHERE profileId=?',[p.id])).toEqual({n:1});
  expect(await h.db.first('SELECT status FROM questions WHERE attemptId=?',[question!.attemptId])).toEqual({status:'active'});
  await expect(h.sessions.start(p.id,{mode,wordIds:[]},'2026-10-03')).rejects.toMatchObject({code:'EMPTY_QUEUE'});
 }finally{h.close();}
});
