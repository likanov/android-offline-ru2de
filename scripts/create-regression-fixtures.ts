import { openTestDb } from '../test/sqlite';
import { migrate } from '../src/core/migrations';
import { addDays } from '../src/core/calendar';
import { createProfile } from '../src/features/profiles/profileRepository';
import { WordRepository } from '../src/features/dictionary/wordRepository';
import { TopicRepository } from '../src/features/topics/topicRepository';
import { SessionRepository } from '../src/features/learning/sessionRepository';
import { AnswerService } from '../src/features/learning/answerService';
import { BackupService } from '../src/features/transfer/backupService';
import { validateBackup } from '../src/features/transfer/backupValidation';
import type { DayKey } from '../src/features/learning/learningTypes';
import type { BackupV1 } from '../src/features/transfer/backupTypes';
// Host-only generator. It is never imported by the Android application.
// Every learning state comes from persisted real questions and AnswerService.
export async function createRegressionBackup(today: DayKey): Promise<BackupV1> {
  addDays(today, 0);
  const { db, close } = openTestDb();
  try {
    await migrate(db);
    const words = new WordRepository(db), sessions = new SessionRepository(db);
    const answers = new AnswerService(db), topics = new TopicRepository(db);
    async function profile(name: string) {
      const p = await createProfile(db, name);
      const word = await words.create(p.id, {de:'Prüfstuhl',ru:'контрольный стул',pos:'noun',gender:'m',note:'ä ö ü ß — заметка'});
      const topic = await topics.create(p.id, 'Регрессия');
      await topics.setWordTopics(p.id, word.id, [topic.id]);
      return {p,word};
    }
    async function respond(profileId: string, wordId: string, count: number, day: DayKey, right = true, mode: 'study'|'review' = 'study') {
      const session = await sessions.start(profileId, {mode,wordIds:[wordId]}, day);
      for (let i=0;i<count;i++) {
        const q = await sessions.next(profileId,session.id,day);
        if (!q) throw Error('Fixture training queue ended early');
        await answers.submit(profileId,session.id,q.attemptId,right ? q.expected[0] : 'заведомо неверно',day);
      }
    }
    const mastered = await profile('Регрессия — изучено');
    await respond(mastered.p.id,mastered.word.id,20,today);
    const nineteen = await profile('Регрессия — серия 19');
    await respond(nineteen.p.id,nineteen.word.id,19,today);
    const difficult = await profile('Регрессия — трудное');
    await respond(difficult.p.id,difficult.word.id,3,today,false);
    const level = await profile('Регрессия — 490 XP');
    const targets = [level.word, ...(await words.list(level.p.id)).filter(w=>w.id!==level.word.id).slice(0,2)];
    for (const [i,w] of targets.entries()) await respond(level.p.id,w.id,i===2 ? 11 : 19,today);
    for (let stage=0;stage<=5;stage++) {
      const item = await profile(`Регрессия — повторение ${stage}`);
      let day = addDays(today,-300);
      await respond(item.p.id,item.word.id,20,day);
      day = addDays(day,1);
      for (let step=0;step<stage;step++) {
        await respond(item.p.id,item.word.id,1,day,true,'review');
        day = addDays(day,[3,7,14,30,60][step]);
      }
    }
    const active = await profile('Регрессия — продолжение');
    await respond(active.p.id,active.word.id,1,today);
    const s = (await sessions.resume(active.p.id))!;
    await sessions.next(active.p.id,s.id,today);
    return validateBackup(await new BackupService(db).exportAll());
  } finally { close(); }
}
