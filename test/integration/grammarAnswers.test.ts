import { createProfile } from '../../src/features/profiles/profileRepository';
import type { GrammarQuestion, GrammarSubmission, GrammarTargetId } from '../../src/features/grammar/grammarTypes';
import { createGrammarHarness } from '../harness';

const day = '2026-10-06';

type Harness = Awaited<ReturnType<typeof createGrammarHarness>>;

function answerFor(question: GrammarQuestion): GrammarSubmission {
  if(question.catalogVersion===2 && question.presentation==='sentence') return {kind:'typed',text:question.expected.sentences[0]};
  return question.responseMode === 'choice'
    ? {kind:'choice',optionId:question.expected.optionId}
    : {kind:'typed',text:question.expected.token};
}

function wrongFor(question: GrammarQuestion): GrammarSubmission {
  if (question.responseMode === 'typed') return {kind:'typed',text:'falsch'};
  return {kind:'choice',optionId:question.options.find(option=>option.id!==question.expected.optionId)!.id};
}

async function startOne(h: Harness, profileId: string, targetId: GrammarTargetId, mode: 'study'|'review', today = day) {
  const session = await h.grammarSessions.start(profileId, {mode,lesson:'mixed',targetIds:[targetId]}, today);
  expect(session).not.toBeNull();
  const question = await h.grammarSessions.next(profileId, session!.id, today);
  expect(question).not.toBeNull();
  if(!question || question.catalogVersion!==1) throw new Error('Expected legacy question');
  return {session:session!,question};
}

async function nextQuestion(h: Harness, profileId: string, sessionId: string, today = day) {
  const question = await h.grammarSessions.next(profileId, sessionId, today);
  expect(question).not.toBeNull();
  return question!;
}

const grammarTables = ['grammar_targets','grammar_progress','grammar_sessions','grammar_questions','grammar_attempts','grammar_rewards'];
async function answerSnapshot(h: Harness) {
  const tables = [...grammarTables,'profiles','daily_activity','word_progress'];
  return Promise.all(tables.map(table=>h.db.all(`SELECT * FROM ${table} ORDER BY rowid`)));
}

test('nine_to_ten_awards_sixty_once', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Двадцать ответов');
    const targetId: GrammarTargetId = 'pronoun-cloze:ich';
    const {session} = await startOne(h, profile.id, targetId, 'study');
    let question = (await h.grammarSessions.resume(profile.id))!.currentQuestion!;
    let result;
    for (let n=1;n<=10;n++) {
      result = await h.grammarAnswers.submit(profile.id,session.id,question.attemptId,answerFor(question),day);
      expect(result.xpDelta).toBe(n===10?60:10);
      if (n<10) question=await nextQuestion(h,profile.id,session.id);
    }
    expect(result).toMatchObject({right:true,state:{streak:10,mastered:true,dueDay:'2026-10-07'}});
    expect(await h.profile(profile.id)).toMatchObject({xp:150});
    expect(await h.grammar.getState(profile.id,targetId)).toMatchObject({attemptCount:10,variantIndex:1});
    expect(await h.db.all('SELECT targetId,attemptId,amount,day FROM grammar_rewards WHERE profileId=?',[profile.id])).toEqual([
      {targetId,attemptId:question.attemptId,amount:50,day},
    ]);
    const repeated = await h.grammarAnswers.submit(profile.id,session.id,question.attemptId,wrongFor(question),day);
    expect(repeated).toEqual(result);
    expect(await h.profile(profile.id)).toMatchObject({xp:150});
    expect((await h.db.first<{n:number}>('SELECT COUNT(*) n FROM grammar_attempts WHERE attemptId=?',[question.attemptId]))?.n).toBe(1);
  } finally { h.close(); }
});

test('error_at_nine_resets_only_grammar_target', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Ошибка на девятнадцати');
    const targetId: GrammarTargetId = 'pronoun-cloze:du';
    const progress = await h.grammar.getState(profile.id,targetId);
    await h.grammar.write(profile.id,{...progress,attemptCount:9,variantIndex:0,state:{...progress.state,streak:9}});
    const wordsBefore = await h.db.all('SELECT * FROM word_progress ORDER BY rowid');
    const {session,question} = await startOne(h,profile.id,targetId,'study');
    const result = await h.grammarAnswers.submit(profile.id,session.id,question.attemptId,wrongFor(question),day);
    expect(result).toMatchObject({right:false,xpDelta:0,state:{streak:0,totalErrors:1}});
    expect(await h.grammar.getState(profile.id,targetId)).toMatchObject({attemptCount:10,variantIndex:1,state:{streak:0,totalErrors:1}});
    expect(await h.profile(profile.id)).toMatchObject({xp:0});
    expect(await h.db.all('SELECT * FROM word_progress ORDER BY rowid')).toEqual(wordsBefore);
  } finally { h.close(); }
});

test('all_review_intervals_and_error_tomorrow', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Интервалы');
    const targetId: GrammarTargetId = 'sein-cloze:wir';
    const progress = await h.grammar.getState(profile.id,targetId);
    await h.grammar.write(profile.id,{...progress,attemptCount:9,state:{...progress.state,streak:9}});
    let current = await startOne(h,profile.id,targetId,'study','2026-10-06');
    await h.grammarAnswers.submit(profile.id,current.session.id,current.question.attemptId,answerFor(current.question),'2026-10-06');
    expect(await h.grammar.getState(profile.id,targetId)).toMatchObject({state:{reviewStage:0,dueDay:'2026-10-07'}});

    const reviews = [
      ['2026-10-07',1,'2026-10-10'],
      ['2026-10-10',2,'2026-10-17'],
      ['2026-10-17',3,'2026-10-31'],
      ['2026-10-31',4,'2026-11-30'],
      ['2026-11-30',5,'2027-01-29'],
      ['2027-01-29',5,'2027-03-30'],
    ] as const;
    for (const [today,nextStage,dueDay] of reviews) {
      current=await startOne(h,profile.id,targetId,'review',today);
      await h.grammarAnswers.submit(profile.id,current.session.id,current.question.attemptId,answerFor(current.question),today);
      expect(await h.grammar.getState(profile.id,targetId)).toMatchObject({state:{streak:10,mastered:true,reviewStage:nextStage,dueDay}});
    }
    current=await startOne(h,profile.id,targetId,'review','2027-03-30');
    const wrong=await h.grammarAnswers.submit(profile.id,current.session.id,current.question.attemptId,wrongFor(current.question),'2027-03-30');
    expect(wrong).toMatchObject({right:false,xpDelta:0,state:{streak:10,mastered:true,reviewStage:0,dueDay:'2027-03-31'}});
  } finally { h.close(); }
});

test('three_errors_and_three_correct_recovery', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Трудная цель');
    const targetId: GrammarTargetId = 'pronoun-cloze:es';
    const {session} = await startOne(h,profile.id,targetId,'study');
    let question=(await h.grammarSessions.resume(profile.id))!.currentQuestion!;
    for(let n=0;n<3;n++) {
      await h.grammarAnswers.submit(profile.id,session.id,question.attemptId,wrongFor(question),day);
      if(n<2) question=await nextQuestion(h,profile.id,session.id);
    }
    expect(await h.grammar.getState(profile.id,targetId)).toMatchObject({state:{difficult:true,totalErrors:3,recoveryErrors:3,recoveryCorrect:0}});
    for(let n=0;n<3;n++) {
      question=await nextQuestion(h,profile.id,session.id);
      await h.grammarAnswers.submit(profile.id,session.id,question.attemptId,answerFor(question),day);
    }
    expect(await h.grammar.getState(profile.id,targetId)).toMatchObject({attemptCount:6,state:{difficult:false,totalErrors:3,recoveryErrors:0,recoveryCorrect:0,streak:3}});
  } finally { h.close(); }
});

test('concurrent_submit_awards_once', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Двойное нажатие');
    const {session,question} = await startOne(h,profile.id,'sein-cloze:ihr','study');
    const answer=answerFor(question);
    const [a,b] = await Promise.all([
      h.grammarAnswers.submit(profile.id,session.id,question.attemptId,answer,day),
      h.grammarAnswers.submit(profile.id,session.id,question.attemptId,answer,day),
    ]);
    expect(a).toEqual(b);
    expect((await h.db.first<{n:number}>('SELECT COUNT(*) n FROM grammar_attempts WHERE attemptId=?',[question.attemptId]))?.n).toBe(1);
    expect(await h.profile(profile.id)).toMatchObject({xp:10});
    expect(await h.grammar.getState(profile.id,question.targetId)).toMatchObject({attemptCount:1});
  } finally { h.close(); }
});

test('inactive_profile_rejected', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Старый профиль');
    const {session,question} = await startOne(h,profile.id,'pronoun-cloze:er','study');
    await createProfile(h.db, 'Активный профиль');
    await expect(h.grammarAnswers.submit(profile.id,session.id,question.attemptId,answerFor(question),day)).rejects.toMatchObject({code:'INACTIVE_PROFILE'});
    expect((await h.db.first<{n:number}>('SELECT COUNT(*) n FROM grammar_attempts WHERE attemptId=?',[question.attemptId]))?.n).toBe(0);
    expect(await h.grammar.getState(profile.id,question.targetId)).toMatchObject({attemptCount:0,state:{streak:0}});
  } finally { h.close(); }
});

test('answer_failure_rolls_back_all_tables', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Откат');
    const {session,question} = await startOne(h,profile.id,'sein-cloze:du','study');
    await h.db.exec("CREATE TRIGGER fail_grammar_activity BEFORE INSERT ON daily_activity BEGIN SELECT RAISE(ABORT,'grammar injected'); END;");
    const before=await answerSnapshot(h);
    await expect(h.grammarAnswers.submit(profile.id,session.id,question.attemptId,answerFor(question),day)).rejects.toThrow('grammar injected');
    expect(await answerSnapshot(h)).toEqual(before);
    await h.db.exec('DROP TRIGGER fail_grammar_activity');
    await expect(h.grammarAnswers.submit(profile.id,session.id,question.attemptId,answerFor(question),day)).resolves.toMatchObject({right:true,xpDelta:10});
  } finally { h.close(); }
});

test('wrong_target_or_response_mode_rejected', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Некорректный ответ');
    const {session,question} = await startOne(h,profile.id,'pronoun-cloze:ich','study');
    const wrongMode: GrammarSubmission = question.responseMode==='choice'
      ? {kind:'typed',text:question.expected.token}
      : {kind:'choice',optionId:question.expected.optionId};
    await expect(h.grammarAnswers.submit(profile.id,session.id,question.attemptId,wrongMode,day)).rejects.toMatchObject({code:'GRAMMAR_ANSWER_INVALID'});
    expect((await h.db.first<{n:number}>('SELECT COUNT(*) n FROM grammar_attempts WHERE attemptId=?',[question.attemptId]))?.n).toBe(0);

    const other=await h.grammar.getState(profile.id,'pronoun-cloze:du');
    await h.grammar.write(profile.id,other);
    await h.db.run('UPDATE grammar_questions SET targetId=? WHERE attemptId=?',['pronoun-cloze:du',question.attemptId]);
    await expect(h.grammarAnswers.submit(profile.id,session.id,question.attemptId,answerFor(question),day)).rejects.toMatchObject({code:'GRAMMAR_QUESTION_STALE'});
    expect(await h.db.first('SELECT status FROM grammar_questions WHERE attemptId=?',[question.attemptId])).toEqual({status:'cancelled'});
    expect((await h.grammarSessions.resume(profile.id))!.currentQuestion).toBeNull();
  } finally { h.close(); }
});

test('stale_dependency_is_cancelled_without_scoring', async () => {
  const h = await createGrammarHarness();
  try {
    const profile = await createProfile(h.db, 'Изменённый пример');
    const targetId: GrammarTargetId = 'pronoun-cloze:er';
    const progress=await h.grammar.getState(profile.id,targetId);
    await h.grammar.write(profile.id,{...progress,variantIndex:1});
    const {session,question}=await startOne(h,profile.id,targetId,'study');
    expect(question.dependencies).toHaveLength(1);
    await h.db.run('UPDATE words SET revision=revision+1 WHERE id=?',[question.dependencies[0].wordId]);
    await expect(h.grammarAnswers.submit(profile.id,session.id,question.attemptId,answerFor(question),day)).rejects.toMatchObject({code:'GRAMMAR_QUESTION_STALE'});
    expect(await h.db.first('SELECT status FROM grammar_questions WHERE attemptId=?',[question.attemptId])).toEqual({status:'cancelled'});
    expect(await h.profile(profile.id)).toMatchObject({xp:0});
    expect(await h.grammar.getState(profile.id,targetId)).toMatchObject({attemptCount:0,variantIndex:1,state:{streak:0,totalErrors:0}});
  } finally { h.close(); }
});
