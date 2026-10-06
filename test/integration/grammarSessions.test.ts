import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { SessionRepository } from '../../src/features/learning/sessionRepository';
import type { GrammarAttemptResult, GrammarProgress, GrammarTargetId } from '../../src/features/grammar/grammarTypes';
import { createGrammarHarness } from '../harness';

const day = '2026-10-06';

test('grammar_and_word_sessions_resume_independently', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Оба занятия');
    const wordSession = await h.sessions.start(profile.id, {mode:'study'}, day);
    const grammarSession = await h.grammarSessions.start(profile.id, {mode:'study',lesson:'pronouns'}, day);
    expect(grammarSession).not.toBeNull();
    expect((await new SessionRepository(h.db).resume(profile.id))!.id).toBe(wordSession.id);
    expect((await h.grammarSessions.resume(profile.id))!.id).toBe(grammarSession!.id);
    expect(await h.db.first("SELECT count(*) AS n FROM sessions WHERE profileId=? AND status='active'", [profile.id])).toEqual({n:1});
    expect(await h.db.first("SELECT count(*) AS n FROM grammar_sessions WHERE profileId=? AND status='active'", [profile.id])).toEqual({n:1});
  } finally {
    h.close();
  }
});

test('resume_keeps_question_and_variant', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'grammar-session-'));
  const path = join(directory, 'db.sqlite');
  let h = await createGrammarHarness(path);
  try {
    const profile = await createProfile(h.db, 'Файловая база');
    const progress = await h.grammar.getState(profile.id, 'pronoun-cloze:er');
    await h.grammar.write(profile.id, {...progress,variantIndex:1});
    const session = await h.grammarSessions.start(profile.id, {mode:'study',lesson:'pronouns',targetIds:['pronoun-cloze:er']}, day);
    const question = await h.grammarSessions.next(profile.id, session!.id, day);
    expect(question).toMatchObject({targetId:'pronoun-cloze:er',templateId:'pronoun-cloze:er:1'});
    expect(question!.dependencies).toHaveLength(1);
    h.close();
    h = await createGrammarHarness(path);
    expect(await h.grammarSessions.resume(profile.id)).toMatchObject({
      id: session!.id,
      cursor: 0,
      currentQuestion: question,
      result: null,
    });
  } finally {
    h.close();
    rmSync(directory, {recursive:true,force:true});
  }
});

test('stale_dependency_cancelled_without_penalty', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Устаревший пример');
    const progress = await h.grammar.getState(profile.id, 'pronoun-cloze:er');
    await h.grammar.write(profile.id, {...progress,variantIndex:1,state:{...progress.state,streak:7}});
    const session = await h.grammarSessions.start(profile.id, {mode:'study',lesson:'pronouns',targetIds:['pronoun-cloze:er']}, day);
    const question = await h.grammarSessions.next(profile.id, session!.id, day);
    expect(question!.dependencies).toHaveLength(1);
    await h.db.run('UPDATE words SET revision=revision+1 WHERE id=?', [question!.dependencies[0].wordId]);
    await expect(h.grammarSessions.next(profile.id, session!.id, day)).rejects.toMatchObject({code:'GRAMMAR_QUESTION_STALE'});
    expect(await h.db.first('SELECT status FROM grammar_questions WHERE attemptId=?', [question!.attemptId])).toEqual({status:'cancelled'});
    expect(await h.db.first('SELECT count(*) AS n FROM grammar_attempts WHERE attemptId=?', [question!.attemptId])).toEqual({n:0});
    expect(await h.profile(profile.id)).toMatchObject({xp:0});
    expect(await h.grammar.getState(profile.id, 'pronoun-cloze:er')).toMatchObject({attemptCount:0,variantIndex:1,state:{streak:7,totalErrors:0}});
    expect(await h.grammarSessions.resume(profile.id)).toMatchObject({currentQuestion:null,result:null});
  } finally {
    h.close();
  }
});

function mastered(targetId: GrammarTargetId, dueDay: string): GrammarProgress {
  return {targetId,attemptCount:20,variantIndex:2,state:{streak:20,mastered:true,masteryBonusGranted:true,reviewStage:0,dueDay,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0}};
}

test('queue_fairness_and_review_once', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Очередь');
    const progress = await h.grammar.getState(profile.id, 'pronoun-cloze:ich');
    await h.grammar.write(profile.id, {...progress,attemptCount:4});
    const study = await h.grammarSessions.start(profile.id, {mode:'study',lesson:'pronouns'}, day);
    expect(study!.targetIds).toEqual([
      'pronoun-cloze:du','pronoun-cloze:er','pronoun-cloze:sie_feminine','pronoun-cloze:es','pronoun-cloze:wir',
    ]);
    expect(study!.targetIds).toHaveLength(5);
    expect(study!.targetIds.every(id => id.startsWith('pronoun-cloze:'))).toBe(true);

    const reviewTargets: GrammarTargetId[] = ['sein-cloze:ich','sein-cloze:du'];
    await h.grammar.write(profile.id, mastered(reviewTargets[0], '2026-10-04'));
    await h.grammar.write(profile.id, mastered(reviewTargets[1], '2026-10-05'));
    const review = await h.grammarSessions.start(profile.id, {mode:'review',lesson:'sein',targetIds:reviewTargets}, day);
    const first = await h.grammarSessions.next(profile.id, review!.id, day);
    expect(first!.targetId).toBe(reviewTargets[0]);
    const result: GrammarAttemptResult = {attemptId:first!.attemptId,targetId:first!.targetId,right:false,xpDelta:0,state:mastered(first!.targetId, '2026-10-07').state,submittedAnswer:{kind:'choice',optionId:'ist'}};
    await h.db.run("UPDATE grammar_questions SET status='answered' WHERE attemptId=?", [first!.attemptId]);
    await h.db.run('INSERT INTO grammar_attempts(attemptId,profileId,sessionId,targetId,right,xpDelta,result,day) VALUES (?,?,?,?,0,0,?,?)', [first!.attemptId,profile.id,review!.id,first!.targetId,JSON.stringify(result),day]);
    await h.db.run('UPDATE grammar_sessions SET result=? WHERE id=?', [JSON.stringify(result),review!.id]);
    const second = await h.grammarSessions.next(profile.id, review!.id, day);
    expect(second!.targetId).toBe(reviewTargets[1]);
    expect((await h.grammarSessions.resume(profile.id))!.targetIds).toEqual([reviewTargets[1]]);
  } finally {
    h.close();
  }
});
