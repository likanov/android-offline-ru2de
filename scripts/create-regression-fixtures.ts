import { openTestDb } from '../test/sqlite';
import { migrate } from '../src/core/migrations';
import { addDays } from '../src/core/calendar';
import { createProfile } from '../src/features/profiles/profileRepository';
import { WordRepository } from '../src/features/dictionary/wordRepository';
import { TopicRepository } from '../src/features/topics/topicRepository';
import { SessionRepository } from '../src/features/learning/sessionRepository';
import { AnswerService } from '../src/features/learning/answerService';
import { BackupService } from '../src/features/transfer/backupService';
import { validateBackup, validateBackupV1 } from '../src/features/transfer/backupValidation';
import { GrammarSessionRepository } from '../src/features/grammar/grammarSessionRepository';
import { GrammarAnswerService } from '../src/features/grammar/grammarAnswerService';
import { grammarTargets } from '../src/features/grammar/grammarCatalog';
import type { GrammarQuestion, GrammarSubmission } from '../src/features/grammar/grammarTypes';
import type { DayKey } from '../src/features/learning/learningTypes';
import type { BackupV1, BackupV2 } from '../src/features/transfer/backupTypes';
// Host-only generator. It is never imported by the Android application.
// Every learning state comes from persisted real questions and AnswerService.
async function createRegressionBackupV2(today: DayKey): Promise<BackupV2> {
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
    const ui=await createProfile(db,'Регрессия — 20 UI');
    const seed=(await words.list(ui.id)).find(w=>w.de==='Stuhl')!;
    const uiTopic=await topics.create(ui.id,'20 UI');
    await topics.setWordTopics(ui.id,seed.id,[uiTopic.id]);
    const relearn=await profile('Регрессия — переучивание');
    await respond(relearn.p.id,relearn.word.id,20,today);
    await words.update(relearn.p.id,relearn.word.id,{...relearn.word,ru:'переучиваемый стул'});
    await respond(relearn.p.id,relearn.word.id,19,today);
    const mastered = await profile('Регрессия — изучено');
    await respond(mastered.p.id,mastered.word.id,20,today);
    const nineteen = await profile('Регрессия — серия 19');
    await respond(nineteen.p.id,nineteen.word.id,19,today);
    const difficult = await profile('Регрессия — трудное');
    await respond(difficult.p.id,difficult.word.id,3,today,false);
    const level = await profile('Регрессия — 490 XP');
    const targets = [level.word, ...(await words.list(level.p.id)).filter(w=>w.id!==level.word.id).slice(0,2)];
    const levelTopic=await topics.create(level.p.id,'Level UI');
    await topics.setWordTopics(level.p.id,targets[2].id,[levelTopic.id]);
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

/** The legacy runner deliberately receives a v1 file. Keep grammar out of it
 * so the old APK can prove that its import path remains readable. */
export async function createRegressionBackup(today: DayKey): Promise<BackupV1> {
  const v2 = await createRegressionBackupV2(today);
  const v1 = { ...v2, version: 1 as const, profiles: v2.profiles.map(({ grammar: _grammar, ...profile }) => profile) };
  return validateBackupV1(v1);
}

function grammarAnswer(question: GrammarQuestion, right: boolean): GrammarSubmission {
  if (!right) return question.responseMode === 'choice' ? { kind: 'choice', optionId: question.options.find(option => option.id !== question.expected.optionId)!.id } : { kind: 'typed', text: 'falsch' };
  return question.responseMode === 'choice' ? { kind: 'choice', optionId: question.expected.optionId } : { kind: 'typed', text: question.expected.token };
}

/** Host-only v2 fixture. Every grammar row is created by the repositories and
 * answer service; no progress, attempt, XP or backup row is hand-written. */
export async function createGrammarRegressionBackup(today: DayKey): Promise<BackupV2> {
  addDays(today, 0);
  const source = openTestDb();
  try {
    await migrate(source.db);
    const profile = await createProfile(source.db, 'Грамматика — 18 целей');
    const sessions = new GrammarSessionRepository(source.db), answers = new GrammarAnswerService(source.db);
    async function respond(profileId: string, targetId: typeof grammarTargets[number]['id'], count: number, day: DayKey, right = true, mode: 'study'|'review' = 'study') {
      const session = (await sessions.start(profileId, { mode, lesson: 'mixed', targetIds: [targetId] }, day))!;
      for (let index = 0; index < count; index++) {
        const question = (await sessions.next(profileId, session.id, day))!;
        await answers.submit(profileId, session.id, question.attemptId, grammarAnswer(question, right), day);
      }
    }
    for (const target of grammarTargets) await respond(profile.id, target.id, 1, today);

    const errors = await createProfile(source.db, 'Грамматика — ошибка 19');
    await respond(errors.id, 'pronoun-cloze:ich', 19, today, false);

    const reviews = await createProfile(source.db, 'Грамматика — повторение');
    await respond(reviews.id, 'sein-cloze:sie_formal', 20, addDays(today, -1));
    await respond(reviews.id, 'sein-cloze:sie_formal', 1, today, true, 'review');
    // Leave an unanswered question in a second session to verify resume data.
    const resumable = (await sessions.start(reviews.id, { mode: 'study', lesson: 'mixed', targetIds: ['pronoun-cloze:du'] }, today))!;
    await sessions.next(reviews.id, resumable.id, today);

    const exported = await new BackupService(source.db).exportAll();
    const target = openTestDb();
    try {
      await migrate(target.db);
      const service = new BackupService(target.db);
      await service.restore(service.preview(JSON.stringify(exported)));
      return validateBackup(await service.exportAll());
    } finally { target.close(); }
  } finally { source.close(); }
}
