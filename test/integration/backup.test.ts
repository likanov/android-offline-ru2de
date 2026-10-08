import { execFileSync } from 'node:child_process';
import { randomUUID } from 'expo-crypto';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { BackupService } from '../../src/features/transfer/backupService';
import type { SqlStore } from '../../src/core/sql';
const day = '2026-10-03';
let h: Awaited<ReturnType<typeof createWordHarness>>;
beforeEach(async () => { h = await createWordHarness(); });
afterEach(() => h.close());
async function snapshot() { const tables = await h.db.all<{
    name: string;
}>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"); return Promise.all(tables.map(async (t) => [t.name, await h.db.all(`SELECT * FROM ${t.name} ORDER BY rowid`)])); }
test('restored_answered_session_is_not_rewarded_again', async () => {
    const p1 = await createProfile(h.db, 'Антон'), p2 = await createProfile(h.db, 'Второй');
    const words = await h.words.list(p1.id), w = words[0];
    await h.words.update(p1.id, w.id, { ...w, note: 'Моя заметка' });
    await h.db.run('UPDATE settings SET dailyGoal=150,reminderEnabled=1,reminderHour=8 WHERE profileId=?',[p1.id]);
    const aid = randomUUID();
    await h.db.run('INSERT INTO aids(id,profileId,content) VALUES (?,?,?)', [aid, p1.id, '{"mnemonic":"подсказка"}']);
    for (const word of words.slice(0, 2))
        await h.db.run('INSERT INTO aid_words(aidId,profileId,wordId,revision) VALUES (?,?,?,?)', [aid, p1.id, word.id, 1]);
    await h.db.run('UPDATE word_progress SET streak=19 WHERE wordId=?', [w.id]);
    const s = await h.sessions.start(p1.id, { mode: 'study', wordIds: [w.id] }, day), q = (await h.sessions.next(p1.id, s.id, day))!;
    await h.answers.submit(p1.id, s.id, q.attemptId, q.expected[0], day);
    const backup = new BackupService(h.db), data = await backup.exportAll();
    expect(data.profiles).toHaveLength(2);
    expect(JSON.stringify(data)).not.toMatch(/modelPath|\.gguf|activeProfileId|reminderHour/);
    const restored = await backup.restore(backup.preview(JSON.stringify(data)));
    expect(restored.profileIds).toHaveLength(2);
    expect(await h.db.first('SELECT count(*) AS n FROM profiles')).toEqual({ n: 4 });
    const restoredP1 = restored.profileIds[0], session = (await h.sessions.resume(restoredP1))!;
    expect(await h.profile(restoredP1)).toMatchObject({ name: 'Антон восстановлено 2', xp: 60 });
    expect(await h.answers.submit(restoredP1, session.id, session.currentQuestion!.attemptId, 'wrong', day)).toEqual(session.result);
    expect((await h.profile(restoredP1))!.xp).toBe(60);
    expect(await h.db.first('SELECT activeProfileId FROM app_settings')).toEqual({ activeProfileId: p2.id });
    expect((await h.words.list(restoredP1)).find(x => x.note === 'Моя заметка')).toBeTruthy();
    expect(await h.db.all('SELECT * FROM aid_words WHERE profileId=?', [restoredP1])).toHaveLength(2);
    expect(await h.db.first('SELECT content FROM aids WHERE profileId=?',[restoredP1])).toEqual({content:'{"mnemonic":"подсказка"}'});
    expect(await h.db.first('SELECT dailyGoal,reminderEnabled,reminderHour FROM settings WHERE profileId=?',[restoredP1])).toEqual({dailyGoal:150,reminderEnabled:0,reminderHour:19});
    expect(await h.db.all('SELECT * FROM topics WHERE profileId=?', [restoredP1])).toHaveLength(data.profiles[0].topics.length);
    expect(await h.db.all('SELECT * FROM skill_history WHERE profileId=?', [restoredP1])).toHaveLength(1);
    const exported = await backup.exportAll();
    expect(exported.profiles[2].rewards[0].day).toBe(day);
});
test('invalid_or_interrupted_restore_is_atomic', async () => {
    await createProfile(h.db, 'A');
    const service = new BackupService(h.db), data = await service.exportAll(), before = await snapshot();
    for (const mutate of [(d: any) => d.version = 4, (d: any) => d.profiles[0].words[0].profileId = randomUUID(), (d: any) => d.profiles[0].words[1].id = d.profiles[0].words[0].id, (d: any) => d.createdAt = '2026-02-30T12:00:00.000Z', (d: any) => d.profiles[0].profile.xp = -1, (d: any) => d.profiles[0].profile.xp = 10]) {
        const bad = JSON.parse(JSON.stringify(data));
        mutate(bad);
        expect(() => service.preview(JSON.stringify(bad))).toThrow();
        expect(await snapshot()).toEqual(before);
    }
    const broken: SqlStore = { ...h.db, transaction: work => h.db.transaction(tx => work({ ...tx, run: async (sql, params) => { const result = await tx.run(sql, params); if (sql.startsWith('INSERT INTO profiles'))
                throw new Error('disk full'); return result; } })) };
    await expect(new BackupService(broken).restore(service.preview(JSON.stringify(data)))).rejects.toThrow('disk full');
    expect(await snapshot()).toEqual(before);
    const preview = service.preview(JSON.stringify(data));
    preview.backup.profiles[0].profile.xp = 2;
    await expect(service.restore(preview)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
});
test('restored_active_question_continues_and_historical_revisions_survive', async () => {
    const p = await createProfile(h.db, 'A'), w = (await h.words.list(p.id))[0];
    const s = await h.sessions.start(p.id, { mode: 'study', wordIds: [w.id] }, day), q = (await h.sessions.next(p.id, s.id, day))!;
    await h.answers.submit(p.id, s.id, q.attemptId, q.expected[0], day);
    await h.words.update(p.id, w.id, { ...w, ru: 'новый перевод' });
    const active = await h.sessions.start(p.id, { mode: 'study', wordIds: [w.id] }, day);
    await h.sessions.next(p.id, active.id, day);
    const service = new BackupService(h.db), result = await service.restore(service.preview(JSON.stringify(await service.exportAll()))), resumed = (await h.sessions.resume(result.profileIds[0]))!;
    expect(resumed.currentQuestion!.revision).toBe(2);
    expect(await h.answers.submit(result.profileIds[0], resumed.id, resumed.currentQuestion!.attemptId, resumed.currentQuestion!.expected[0], day)).toMatchObject({ right: true, xpDelta: 10 });
});
test('rejects_corrupt_rewards_schedule_active_content_and_skill_totals', async () => {
    const p = await createProfile(h.db, 'A'), w = (await h.words.list(p.id))[0];
    await h.db.run('UPDATE word_progress SET streak=19 WHERE wordId=?', [w.id]);
    const s = await h.sessions.start(p.id, { mode: 'study', wordIds: [w.id] }, day), q = (await h.sessions.next(p.id, s.id, day))!;
    await h.answers.submit(p.id, s.id, q.attemptId, q.expected[0], day);
    const service = new BackupService(h.db), mastered = await service.exportAll(), before = await snapshot();
    const corruptions: [
        string,
        (p: any) => void
    ][] = [['reward amount', p => p.rewards[0].amount = 100], ['reward date', p => p.rewards[0].day = '2026-10-04'], ['missing reward', p => p.rewards = []], ['duplicate reward', p => p.rewards.push({ ...p.rewards[0] })], ['schedule', p => p.progress.find((r: any) => r.learned).dueDate = null], ['stage', p => p.progress.find((r: any) => r.learned).reviewStage = 6], ['streak', p => p.progress.find((r: any) => r.learned).streak = 19], ['skill totals', p => p.skillStats[0].correct = 99], ['daily totals', p => p.dailyActivity[0].xp = 0], ['historical reward result', p => { p.attempts[0].result.state = { ...p.attempts[0].result.state, mastered: false, streak: 0, reviewStage: 0, dueDay: null }; p.sessions[0].result = p.attempts[0].result; }]];
    for (const [label, mutate] of corruptions) {
        const bad = JSON.parse(JSON.stringify(mastered));
        mutate(bad.profiles[0]);
        let rejected = false;
        try {
            service.preview(JSON.stringify(bad));
        }
        catch {
            rejected = true;
        }
        expect({ label, rejected }).toEqual({ label, rejected: true });
        const preview = service.preview(JSON.stringify(mastered)); preview.backup = bad;
        await expect(service.restore(preview)).rejects.toThrow();
        expect(await snapshot()).toEqual(before);
    }
    const review = await h.sessions.start(p.id, { mode: 'review', wordIds: [w.id] }, '2026-10-04');
    await h.sessions.next(p.id, review.id, '2026-10-04');
    const active = await service.exportAll();
    for (const key of ['prompt', 'expected', 'revision', 'dueDay']) {
        const bad = JSON.parse(JSON.stringify(active)), part = bad.profiles[0], row = part.questions.find((q: any) => q.status === 'active'), session = part.sessions.find((s: any) => s.status === 'active');
        const value = key === 'expected' ? ['forged'] : key === 'revision' ? 99 : key === 'dueDay' ? '2026-10-05' : 'forged';
        row.payload[key] = value;
        session.currentQuestion[key] = value;
        if (key === 'revision')
            row.revision = value;
        expect(() => service.preview(JSON.stringify(bad))).toThrow();
    }
});
test.each(['distractor', 'typing alias'] as const)('export_survives_editing_an_active_question_%s', async dependency => {
    const p = await createProfile(h.db, 'A');
    const vocabulary = await h.words.list(p.id), target = vocabulary.find(w => w.pos === 'noun')!;
    let other = dependency === 'typing alias'
        ? await h.words.create(p.id, {de:'Sitz',ru:target.ru,pos:'noun',gender:target.gender})
        : vocabulary.find(w => w.id !== target.id && w.pos === 'noun')!;
    const session = await h.sessions.start(p.id, {mode:'study',wordIds:[target.id]}, day);
    let question = (await h.sessions.next(p.id, session.id, day))!;
    if(dependency === 'typing alias') {
        await h.sessions.cancelQuestion(p.id, session.id);
        await h.sessions.next(p.id, session.id, day);
        await h.sessions.cancelQuestion(p.id, session.id);
        question = (await h.sessions.next(p.id, session.id, day))!;
        expect(question.kind).toBe('typing');
        expect(question.expected).toContain(`${{m:'der',f:'die',n:'das'}[other.gender!]} ${other.de}`);
    } else {
        expect(question.kind).toBe('ru-de');
        other = vocabulary.find(w => w.id !== target.id && question.options.includes(`${{m:'der',f:'die',n:'das'}[w.gender!]} ${w.de}`))!;
        expect(other).toBeTruthy();
    }
    await h.words.update(p.id, other.id, {...other,de:`${other.de}Neu`,ru:'новый зависимый перевод'});
    // Export must handle this reachable persisted state, without weakening import validation.
    const data = await h.backup.exportAll();
    expect(data.profiles[0].sessions[0].currentQuestion).toBeNull();
    expect(data.profiles[0].questions.find(q => q.attemptId === question.attemptId)!.status).toBe('cancelled');
    expect((await h.words.get(p.id,target.id)).revision).toBe(target.revision);
    const restored = await h.backup.restore(h.backup.preview(JSON.stringify(data)));
    const resumed = (await h.sessions.resume(restored.profileIds[0]))!;
    const next = (await h.sessions.next(restored.profileIds[0],resumed.id,day))!;
    expect(await h.answers.submit(restored.profileIds[0],resumed.id,next.attemptId,next.expected[0],day)).toMatchObject({right:true,xpDelta:10});
});

test('android_roundtrip_state_validator_accepts_real_remapped_backup_and_duplicate_submission', async () => {
    const p = await createProfile(h.db, 'Регрессия — продолжение');
    const w = await h.words.create(p.id, {de:'Prüfstuhl',ru:'контрольный стул',pos:'noun',gender:'m'});
    const s = await h.sessions.start(p.id, {mode:'study',wordIds:[w.id]}, day);
    const q = (await h.sessions.next(p.id,s.id,day))!;
    await h.answers.submit(p.id,s.id,q.attemptId,q.expected[0],day);
    await h.sessions.next(p.id,s.id,day);
    await h.words.update(p.id,w.id,{...w,ru:'новый перевод'});
    const aid = randomUUID();
    await h.db.run('INSERT INTO aids(id,profileId,content) VALUES (?,?,?)',[aid,p.id,JSON.stringify({format:'assistant-aid-v1',wordId:w.id,mode:'association',ruleTopic:null,referenceTitle:null,text:'Проверенная подсказка'})]);
    await h.db.run('INSERT INTO aid_words(aidId,profileId,wordId,revision) VALUES (?,?,?,?)',[aid,p.id,w.id,2]);
    const before = await h.backup.exportAll();
    const result = await h.backup.restore(h.backup.preview(JSON.stringify(before)));
    const restoreCheckpoint = await h.backup.exportAll();
    const restoredId = result.profileIds[0], word = (await h.words.list(restoredId)).find(w=>w.de==='Prüfstuhl')!;
    const session = await h.sessions.start(restoredId,{mode:'study',wordIds:[word.id]},day);
    const next = (await h.sessions.next(restoredId,session.id,day))!;
    const answered = await h.answers.submit(restoredId,session.id,next.attemptId,next.expected[0],day);
    expect(answered.xpDelta).toBe(10);
    const answeredBackup = await h.backup.exportAll();
    expect(await h.answers.submit(restoredId,session.id,next.attemptId,next.expected[0],day)).toEqual(answered);
    expect(await h.answers.submit(restoredId,session.id,next.attemptId,'wrong',day)).toEqual(answered);
    const after = await h.backup.exportAll();
    expect(after.profiles).toEqual(answeredBackup.profiles);
    const script = `import {verifyScenarioState} from './scripts/regression-state.mjs';
      import {readFileSync} from 'node:fs';
      const e=JSON.parse(readFileSync(0,'utf8'));
      console.log(JSON.stringify(verifyScenarioState('transfer.json-roundtrip',e.after,e)));`;
    const validation = execFileSync(process.execPath,['--input-type=module','-e',script],{input:JSON.stringify({before,restoreCheckpoint,after}),encoding:'utf8'});
    expect(JSON.parse(validation)).toEqual({ok:true,errors:[]});
});

test('v3_roundtrip_all_word_parts_and_unicode_and_case_survive_roundtrip', async () => {
    const p = await createProfile(h.db, 'POS');
    const parts = ['noun','adjective','number','verb','pronoun','adverb','preposition','conjunction','phrase'] as const;
    for (const [i, pos] of parts.entries()) await h.words.create(p.id, { de: pos === 'pronoun' ? 'Sie' : pos === 'phrase' ? 'Cafe\u0301' : `Probe${i}`, ru: `перевод${i}`, pos, gender: pos === 'noun' ? 'm' : null });
    const service = new BackupService(h.db), data = await service.exportAll();
    expect(data.version).toBe(3);
    expect(data.profiles[0].grammar).toHaveProperty('catalogVersions', [1]);
    for (const version of [1, 2]) {
        const legacy = JSON.parse(JSON.stringify(data)); legacy.version = version;
        if (version === 1) delete legacy.profiles[0].grammar;
        else { legacy.profiles[0].grammar.catalogVersion = 1; delete legacy.profiles[0].grammar.catalogVersions; }
        expect(() => service.preview(JSON.stringify(legacy))).toThrow();
    }
    const original = await h.words.list(p.id);
    const restored = await service.restore(service.preview(JSON.stringify(data)));
    const words = await h.words.list(restored.profileIds[0]);
    expect(words.map(w => [w.de, w.ru, w.pos])).toEqual(original.map(w => [w.de, w.ru, w.pos]));
    expect(words.some(w => w.de === 'Sie')).toBe(true);
    expect(words.some(w => w.de === 'Café')).toBe(true);
    expect(await h.words.list(p.id)).toEqual(original);
});
