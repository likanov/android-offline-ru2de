import { openTestDb } from '../sqlite';
import { createSchema8GrammarFixture } from '../fixtures/grammarSchema8';
import { GrammarSessionRepository } from '../../src/features/grammar/grammarSessionRepository';
import { migrateGrammarMastery } from '../../src/core/migrations/009_grammar_mastery';
import { AppServicesContext, getGrammarServices } from '../../src/app/AppServices';
import { ActiveProfileProvider } from '../../src/app/ActiveProfileProvider';
import { Navigation } from '../../src/app/navigation';
import { localDay, addDays } from '../../src/core/calendar';
import { GrammarAnswerError } from '../../src/features/grammar/grammarAnswerService';
import { makeGrammarQuestion } from "../../src/features/grammar/grammarQuestionFactory";
import { GrammarQuestionView } from "../../src/features/grammar/GrammarQuestionView";

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createGrammarHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { TrainingHomeScreen } from '../../src/features/learning/TrainingHomeScreen';
import { GrammarTrainingScreen } from '../../src/features/grammar/GrammarTrainingScreen';
import { persistLegacySiePluralQuestion } from '../fixtures/legacyGrammarQuestion';

test('training_home_opens_both_blocks_and_resumes', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  const view = render(<TrainingHomeScreen db={h.db} profileId={profile.id} onVocabulary={jest.fn()} onGrammar={jest.fn()} />);
  expect(await screen.findByText('Тренировка')).toBeTruthy();
  expect(screen.getByTestId('training-vocabulary-start')).toBeTruthy();
  expect(screen.getByTestId('training-grammar-start')).toBeTruthy();
  view.unmount(); h.close();
});
test('grammar_saved_streak_is_visible_before_submit', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  await h.db.run("INSERT INTO grammar_progress(profileId,targetId,catalogVersion,streak,mastered,masteryBonusGranted,reviewStage,dueDay,difficult,totalErrors,recoveryErrors,recoveryCorrect,attemptCount,variantIndex) VALUES (?,?,1,7,0,0,0,NULL,0,0,0,0,0,0)", [profile.id, 'pronoun-cloze:ich']);
  const view = render(<GrammarTrainingScreen db={h.db} profileId={profile.id} profileName={profile.name} today="2026-10-03" selection={{ mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }} onReference={jest.fn()} onExplainError={jest.fn()} />);
  try { expect(await screen.findByText('Серия: 7/10')).toBeTruthy(); expect(screen.queryByText(`Профиль: ${profile.id}`)).toBeNull(); } finally { view.unmount(); h.close(); }
});

test('feedback_hides_expected_before_submit_and_keyboard_submit_and_feedback_visible', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  const view = render(<GrammarTrainingScreen db={h.db} profileId={profile.id} today="2026-10-03" selection={{ mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }} onReference={jest.fn()} onExplainError={jest.fn()} />);
  const option = (await screen.findAllByTestId(/grammar-option-/))[0];
  expect(screen.queryByTestId('grammar-result')).toBeNull();
  fireEvent.press(option);
  await screen.findByTestId('grammar-result');
  expect(screen.getByTestId('grammar-next')).toBeTruthy();
  view.unmount(); h.close();
});

test('answered_feedback_survives_reopen_and_reference_returns_to_same_question', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  const props = { db: h.db, profileId: profile.id, today: '2026-10-03' as const, selection: { mode: 'study' as const, lesson: 'pronouns' as const, targetIds: ['pronoun-cloze:ich' as const] }, onReference: jest.fn(), onExplainError: jest.fn() };
  const first = render(<GrammarTrainingScreen {...props} />);
  fireEvent.press((await screen.findAllByTestId(/grammar-option-/))[0]);
  await screen.findByTestId('grammar-result');
  const q = (await h.grammarSessions.resume(profile.id))!.currentQuestion!;
  first.unmount();
  const second = render(<GrammarTrainingScreen {...props} />);
  expect(await screen.findByTestId('grammar-result')).toBeTruthy();
  expect((await h.grammarSessions.resume(profile.id))!.currentQuestion!.attemptId).toBe(q.attemptId);
  second.unmount(); h.close();
});

test('grammar_choice_then_typing_same_target', async () => {
  const h = await createGrammarHarness();
  const profile = await createProfile(h.db, 'A');
  await h.db.run("INSERT INTO grammar_progress(profileId,targetId,catalogVersion,streak,mastered,masteryBonusGranted,reviewStage,dueDay,difficult,totalErrors,recoveryErrors,recoveryCorrect,attemptCount,variantIndex) VALUES (?,?,1,0,0,0,0,NULL,0,0,0,0,3,0)", [profile.id, 'pronoun-cloze:ich']);
  const view = render(<GrammarTrainingScreen db={h.db} profileId={profile.id} today="2026-10-03" selection={{ mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }} onReference={jest.fn()} onExplainError={jest.fn()} />);
  const input = await screen.findByTestId('grammar-answer-input');
  fireEvent.changeText(input, 'Ich');
  fireEvent.press(screen.getByTestId('grammar-submit'));
  await screen.findByTestId('grammar-result');
  view.unmount(); h.close();
});

test.each([
  { label: 'Sie', right: true, xp: 10, streak: 1, errors: 0 },
  { label: 'Du', right: false, xp: 0, streak: 0, errors: 1 },
])('resumed_legacy_question_grades_$label_from_four_german_only_buttons', async ({ label, right, xp, streak, errors }) => {
  const h = await createGrammarHarness();
  let view: ReturnType<typeof render> | undefined;
  try {
    const profile = await createProfile(h.db, 'Продолжение');
    const selection = { mode: 'study' as const, lesson: 'pronouns' as const, targetIds: ['pronoun-cloze:sie_plural' as const] };
    const session = (await h.grammarSessions.start(profile.id, selection, '2026-10-06'))!;
    const question = (await h.grammarSessions.next(profile.id, session.id, '2026-10-06'))!;
    const legacy = await persistLegacySiePluralQuestion(h.db, question);
    view = render(<GrammarTrainingScreen db={h.db} profileId={profile.id} today="2026-10-06" selection={selection} onReference={jest.fn()} onExplainError={jest.fn()} />);
    const buttons = await screen.findAllByTestId(/grammar-option-/);
    expect(buttons.map(button => button.props.accessibilityLabel).sort()).toEqual(['Du', 'Er', 'Ich', 'Sie']);
    for (const name of ['Du', 'Er', 'Ich', 'Sie']) {
      expect(screen.getByText(name)).toBeTruthy();
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByTestId('grammar-context')).toHaveTextContent('Контекст: они.');
    expect(screen.queryByTestId('grammar-result')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: label }));
    await screen.findByTestId('grammar-result');
    expect(screen.getByText(legacy.feedback.translationRu)).toBeTruthy();
    expect((await h.grammarSessions.resume(profile.id))!.result).toMatchObject({ right, xpDelta: xp });
    expect(await h.grammar.getState(profile.id, 'pronoun-cloze:sie_plural')).toMatchObject({ attemptCount: 1, state: { streak, totalErrors: errors } });
    expect(await h.profile(profile.id)).toMatchObject({ xp });
  } finally {
    view?.unmount();
    h.close();
  }
});

test('sentence_prompt_has_source_and_no_artificial_blank', () => {
 const question=makeGrammarQuestion({attemptId:'sentence',sessionId:'s',profileId:'p',targetId:'yesno-transform:noun',variantIndex:0,responseMode:'choice',reviewStage:null,dueDay:null,words:[]});
 const view=render(<GrammarQuestionView currentState={null} question={question} result={null} busy={false} onSubmit={jest.fn()} onNext={jest.fn()} onExplainError={jest.fn()} />);
 expect(screen.getByTestId('grammar-prompt')).toHaveTextContent('Преобразуйте утверждение в вопрос.');
 expect(screen.getByTestId('grammar-source')).toHaveTextContent('Das Buch ist neu.');
 expect(screen.queryByText(/___/)).toBeNull();
 expect(screen.getByTestId('grammar-answer-input').props.maxLength).toBe(256);
 view.unmount();
});
test('sentence_case_error_explains_internal_case_without_marking_correct',()=>{
 const question=makeGrammarQuestion({attemptId:'case',sessionId:'s',profileId:'p',targetId:'yesno-translation:sie_formal',variantIndex:0,responseMode:'typed',reviewStage:null,dueDay:null,words:[]});
 const view=render(<GrammarQuestionView currentState={null} question={question} busy={false} result={{attemptId:'case',targetId:question.targetId,right:false,xpDelta:0,submittedAnswer:{kind:'typed',text:question.feedback.sentenceDe.replace(' Sie ',' sie ')},state:{streak:0,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:1,recoveryErrors:0,recoveryCorrect:0}}} onSubmit={jest.fn()} onNext={jest.fn()} onExplainError={jest.fn()} />);
 expect(screen.getByText('Проверьте регистр букв: Sie и sie имеют разное значение.')).toBeTruthy();
 expect(screen.queryByText(/Верно!/)).toBeNull();
 view.unmount();
});

test('five_lesson_entries_start_correct_selection', async () => {
 const h=await createGrammarHarness(); const p=await createProfile(h.db,'A'); const onGrammar=jest.fn();
 const view=render(<TrainingHomeScreen db={h.db} profileId={p.id} onVocabulary={jest.fn()} onGrammar={onGrammar} />);
 fireEvent.press(await screen.findByTestId('training-lektion2-toggle'));
 for(const lesson of ['professions-pronoun','professions-sein','demonstrative-statement','yesno-transform','yesno-translation']) {
  fireEvent.press(screen.getByTestId(`training-lektion2-${lesson}`)); expect(onGrammar).toHaveBeenLastCalledWith({mode:'study',lesson});
 }
 view.unmount();h.close();
});

test('profile_switch_does_not_submit_old_answer', async () => {
 const h=await createGrammarHarness(); const a=await createProfile(h.db,'A');
 const selection={mode:'study' as const,lesson:'yesno-transform' as const,targetIds:['yesno-transform:noun' as const]};
 const props={db:h.db,today:'2026-10-08',selection,onReference:jest.fn(),onExplainError:jest.fn()};
 const view=render(<GrammarTrainingScreen {...props} profileId={a.id} />);
 try {
  fireEvent.changeText(await screen.findByTestId('grammar-answer-input'),'Ist das Buch neu?');
  const b=await createProfile(h.db,'B');
  view.rerender(<GrammarTrainingScreen {...props} profileId={b.id} />);
  const input=await screen.findByTestId('grammar-answer-input'); expect(input).toHaveProp('value','');
  expect(await h.db.first('SELECT attemptId FROM grammar_attempts WHERE profileId=?',[a.id])).toBeNull();
 } finally {view.unmount();h.close();}
});

test('german_only_options_before_feedback',()=>{
 const question=makeGrammarQuestion({attemptId:'choices',sessionId:'s',profileId:'p',targetId:'professions-pronoun:ich',variantIndex:0,responseMode:'choice',reviewStage:null,dueDay:null,words:[]});
 const view=render(<GrammarQuestionView currentState={null} question={question} result={null} busy={false} onSubmit={jest.fn()} onNext={jest.fn()} onExplainError={jest.fn()} />);
 try {
  for(const button of screen.getAllByTestId(/grammar-option-/)) expect(button.props.accessibilityLabel).not.toMatch(/[А-Яа-яЁё]/);
  expect(screen.queryByText(question.feedback.translationRu)).toBeNull();
  expect(screen.queryByTestId('grammar-result')).toBeNull();
 } finally {view.unmount();}
});


test('stale_submit_recovery_reenables_new_question_without_old_feedback', async () => {
 const h=await createGrammarHarness(); const p=await createProfile(h.db,'A');
 const services=getGrammarServices({db:h.db});
 let rejectSubmit!:(error:Error)=>void;
 const submit=jest.spyOn(services.answers,'submit').mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectSubmit=reject;}));
 const view=render(<GrammarTrainingScreen db={h.db} profileId={p.id} today="2026-10-08" selection={{mode:'study',lesson:'yesno-transform',targetIds:['yesno-transform:noun']}} onReference={jest.fn()} onExplainError={jest.fn()} />);
 try {
  fireEvent.changeText(await screen.findByTestId('grammar-answer-input'),'Ist das Buch neu?');
  const old=(await services.sessions.resume(p.id))!;
  fireEvent.press(screen.getByTestId('grammar-submit'));
  expect(screen.getByTestId('grammar-answer-input')).toHaveProp('editable',false);
  await services.sessions.cancelQuestion(p.id,old.id);
  await act(async()=>{rejectSubmit(new GrammarAnswerError('GRAMMAR_QUESTION_STALE','stale'));});
  await waitFor(()=>expect(screen.getByTestId('grammar-answer-input')).toHaveProp('editable',true));
  expect(screen.queryByTestId('grammar-result')).toBeNull();
  expect(screen.getByTestId('grammar-answer-input')).toHaveProp('value','');
  expect((await services.sessions.resume(p.id))!.currentQuestion!.attemptId).not.toBe(old.currentQuestion!.attemptId);
  fireEvent.changeText(screen.getByTestId('grammar-answer-input'),'Ist das Buch neu?');
  fireEvent.press(screen.getByTestId('grammar-submit')); await screen.findByTestId('grammar-result');
  expect(submit).toHaveBeenCalledTimes(2);
 } finally {view.unmount();submit.mockRestore();h.close();}
});

test.each(['profile','day'] as const)('pending_submit_does_not_leak_feedback_after_%s_change',async change=>{
 const h=await createGrammarHarness();const a=await createProfile(h.db,'A'); const services=getGrammarServices({db:h.db});
 let resolveSubmit!:(value:Awaited<ReturnType<typeof services.answers.submit>>)=>void;
 const submit=jest.spyOn(services.answers,'submit').mockImplementationOnce(()=>new Promise(resolve=>{resolveSubmit=resolve;}));
 const props={db:h.db,selection:{mode:'study' as const,lesson:'yesno-transform' as const,targetIds:['yesno-transform:noun' as const]},onReference:jest.fn(),onExplainError:jest.fn()};
 const view=render(<GrammarTrainingScreen {...props} profileId={a.id} today="2026-10-08" />);
 try {
  fireEvent.changeText(await screen.findByTestId('grammar-answer-input'),'Ist das Buch neu?');
  const old=(await services.sessions.resume(a.id))!.currentQuestion!;
  fireEvent.press(screen.getByTestId('grammar-submit'));
  const b=change==='profile'?await createProfile(h.db,'B'):a;
  view.rerender(<GrammarTrainingScreen {...props} profileId={b.id} today={change==='day'?'2026-10-09':'2026-10-08'} />);
  await waitFor(()=>expect(screen.getByTestId('grammar-answer-input')).toHaveProp('editable',true));
  await act(async()=>resolveSubmit({attemptId:old.attemptId,targetId:old.targetId,right:true,xpDelta:10,submittedAnswer:{kind:'typed',text:'Ist das Buch neu?'},state:{streak:1,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0}}));
  expect(screen.queryByTestId('grammar-result')).toBeNull();
  expect(screen.getByTestId('grammar-answer-input')).toHaveProp('editable',true);
 } finally {view.unmount();submit.mockRestore();h.close();}
});

test('noun_capitalization_feedback_does_not_claim_sie_error',()=>{
 const question=makeGrammarQuestion({attemptId:'case',sessionId:'s',profileId:'p',targetId:'yesno-transform:noun',variantIndex:0,responseMode:'typed',reviewStage:null,dueDay:null,words:[]});
 const view=render(<GrammarQuestionView currentState={null} question={question} busy={false} result={{attemptId:'case',targetId:question.targetId,right:false,xpDelta:0,submittedAnswer:{kind:'typed',text:'Ist das buch neu?'},state:{streak:0,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:1,recoveryErrors:0,recoveryCorrect:0}}} onSubmit={jest.fn()} onNext={jest.fn()} onExplainError={jest.fn()} />);
 expect(screen.getByText('Проверьте регистр букв.')).toBeTruthy();
 expect(screen.queryByText(/Sie и sie/)).toBeNull();view.unmount();
});

test('catalog2_due_review_is_reachable_and_scoped_through_home_selection_and_real_training',async()=>{
 const h=await createGrammarHarness();const p=await createProfile(h.db,'Review');
 await h.db.run("INSERT INTO grammar_progress(profileId,targetId,catalogVersion,streak,mastered,masteryBonusGranted,reviewStage,dueDay,difficult,totalErrors,recoveryErrors,recoveryCorrect,attemptCount,variantIndex) VALUES (?, 'yesno-transform:noun',2,10,1,1,0,'2000-01-01',0,0,0,0,20,0)",[p.id]);
 const view=render(<AppServicesContext.Provider value={{db:h.db}}><ActiveProfileProvider><Navigation /></ActiveProfileProvider></AppServicesContext.Provider>);
 try {
  await screen.findByText('Активный профиль: Review');fireEvent.press(screen.getByTestId('nav-training'));
  await waitFor(()=>expect(screen.getByText('Освоено: 0 / 18')).toBeTruthy());
  expect(screen.getByTestId('grammar-review-start')).toBeDisabled();
  fireEvent.press(screen.getByTestId('training-lektion2-toggle'));
  const review=await screen.findByTestId('training-lektion2-review-yesno-transform');
  expect(review).toBeEnabled();expect(screen.getByTestId('training-lektion2-review-professions-sein')).toBeDisabled();
  fireEvent.press(review);
  fireEvent.changeText(await screen.findByTestId('grammar-answer-input'),'Ist das Buch neu?');
  fireEvent.press(screen.getByTestId('grammar-submit'));await screen.findByTestId('grammar-result');
  expect(await h.grammar.getState(p.id,'yesno-transform:noun')).toMatchObject({state:{mastered:true,masteryBonusGranted:true,reviewStage:1,dueDay:addDays(localDay(new Date()),3)}});
  expect((await h.profile(p.id))!.xp).toBe(10);
  expect((await h.grammarSessions.resume(p.id))!.selection).toEqual({mode:'review',lesson:'yesno-transform'});
  expect((await getGrammarServices({db:h.db}).progress.summary(p.id,localDay(new Date()),'yesno-transform')).dueCount).toBe(0);
 }finally{view.unmount();h.close();}
});

test('resumed_historical_result_displays_current_ten_streak_and_original_xp', async()=>{
 const h=openTestDb();let view:ReturnType<typeof render>|undefined;
 try{
  const f=await createSchema8GrammarFixture(h.db,'2026-10-06');
  const row=await h.db.first<{id:string}>('SELECT id FROM grammar_sessions WHERE profileId=? AND targetIds=?',[f.profileIds[0],JSON.stringify([f.targetIds[4]])]);
  await h.db.run("UPDATE grammar_sessions SET status='active' WHERE id=?",[row!.id]);
  await h.db.schemaTransaction(async tx=>{await migrateGrammarMastery(tx,'2026-10-13');await tx.exec('PRAGMA user_version=9');});
  view=render(<GrammarTrainingScreen db={h.db} profileId={f.profileIds[0]} today="2026-10-13" selection={{mode:'study',lesson:'pronouns',targetIds:[f.targetIds[4]]}} onReference={jest.fn()} onExplainError={jest.fn()}/>);
  await screen.findByTestId('grammar-result');
  expect(screen.getAllByText('Серия: 10/10')).toHaveLength(2);
  expect(screen.getByText('Верно! +60 XP')).toBeTruthy();expect(screen.getByText('Освоение завершено.')).toBeTruthy();
  expect((await new GrammarSessionRepository(h.db).resume(f.profileIds[0]))!.result!.state.streak).toBe(20);
 }finally{view?.unmount();h.close();}
});
