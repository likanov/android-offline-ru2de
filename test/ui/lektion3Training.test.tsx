import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TrainingHomeScreen } from '../../src/features/learning/TrainingHomeScreen';
import { GrammarTrainingScreen } from '../../src/features/grammar/GrammarTrainingScreen';
import { GrammarQuestionView } from '../../src/features/grammar/GrammarQuestionView';
import { makeLektion3Question } from '../../src/features/grammar/lektion3QuestionFactory';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { createGrammarHarness } from '../harness';
import type { GrammarLesson } from '../../src/features/grammar/grammarTypes';
import { QuestionHeader } from '../../src/ui/QuestionHeader';
const day = '2026-10-13';
const props = {result:null,currentState:null,busy:false,onSubmit:jest.fn(),onNext:jest.fn(),onExplainError:jest.fn()};

test('three_lesson_routes_have_own_summaries', async () => {
 const h=await createGrammarHarness(); const p=await createProfile(h.db,'Lektion3'); const onGrammar=jest.fn();
 for(const targetId of ['noun-article:buch','noun-plural:buch','noun-plural:lampe'] as const) {
  const progress=await h.grammar.getState(p.id,targetId);
  await h.grammar.write(p.id,{...progress,state:{...progress.state,streak:10,mastered:true,masteryBonusGranted:true,dueDay:'2000-01-01'}});
 }
 const view=render(<TrainingHomeScreen db={h.db} profileId={p.id} onVocabulary={jest.fn()} onGrammar={onGrammar} />);
 try {
  fireEvent.press(await screen.findByTestId('training-lektion3-toggle'));
  for(const [lesson,mastered,total,title] of [['noun-article',1,14,'Артикли: единственное и множественное число'],['noun-plural',2,25,'Образуйте множественное число'],['plural-invariant',0,1,'Найдите неизменяемые формы']] as const) {
   await waitFor(()=>expect(screen.getByTestId(`training-lektion3-summary-${lesson}`)).toHaveTextContent(new RegExp(`Освоено: ${mastered} / ${total}`)));
   expect(screen.getByTestId(`training-lektion3-summary-${lesson}`)).toHaveTextContent(new RegExp(`К повторению: ${mastered}`));
   fireEvent.press(screen.getByTestId(`training-lektion3-${lesson}`));
   expect(onGrammar).toHaveBeenLastCalledWith({mode:'study',lesson});
   expect(screen.getByRole('button',{name:title})).toBeTruthy();
   const review=screen.getByTestId(`training-lektion3-review-${lesson}`);
   if(mastered) {fireEvent.press(review);expect(onGrammar).toHaveBeenLastCalledWith({mode:'review',lesson});}
   else expect(review).toBeDisabled();
  }
 } finally {view.unmount();h.close();}
});

test.each<GrammarLesson>(['mixed','pronouns','sein','professions-pronoun','professions-sein','demonstrative-statement','yesno-transform','yesno-translation','noun-article','noun-plural','plural-invariant'])('all_grammar_headers_ten_word_header_twenty: %s', async lesson=>{
 const h=await createGrammarHarness(); const p=await createProfile(h.db,'Headers');
 const view=render(<GrammarTrainingScreen db={h.db} profileId={p.id} selection={{mode:'study',lesson}} today={day} onReference={jest.fn()} onExplainError={jest.fn()} />);
 try {expect(await screen.findByText('Серия: 0/10')).toBeTruthy();expect(await screen.findByTestId('grammar-prompt')).toBeTruthy();} finally {view.unmount();h.close();}
});
test('word_header_twenty',()=>{
 render(<QuestionHeader title="Слова" mode="study" state={{streak:3,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0}} />);
 expect(screen.getByText('Серия: 3/20')).toBeTruthy();
});

test('article_has_no_translation_or_gender_marker',()=>{
 const q=makeLektion3Question({attemptId:'a',sessionId:'s',profileId:'p',targetId:'noun-article:buch',responseMode:'choice',variantIndex:0,words:[],reviewStage:null,dueDay:null});
 render(<GrammarQuestionView question={q} {...props} />);
 expect(screen.getByTestId('grammar-context')).toHaveTextContent(/Единственное число/);
 expect(screen.getByTestId('grammar-prompt')).toHaveTextContent('___ Buch');
 expect(screen.queryByText('книга')).toBeNull();
 expect(screen.queryByText('das Buch')).toBeNull();
 expect(screen.queryByTestId('grammar-result')).toBeNull();
 expect(screen.getAllByRole('button').map(n=>n.props.accessibilityLabel)).not.toContain('das Buch');
});
test('plural_input_has_no_answer_placeholder',()=>{
 const q=makeLektion3Question({attemptId:'a',sessionId:'s',profileId:'p',targetId:'noun-plural:buch',responseMode:'typed',variantIndex:0,words:[],reviewStage:null,dueDay:null});
 render(<GrammarQuestionView question={q} {...props} />);
 expect(screen.getByTestId('grammar-prompt')).toHaveTextContent('das Buch');
 expect(screen.getByTestId('grammar-answer-input')).toHaveProp('placeholder','Ваш ответ');
 expect(screen.getByTestId('grammar-answer-input')).toHaveProp('maxLength',64);
 expect(screen.queryByText(/die Bücher/)).toBeNull();
 for(const letter of ['ä','ö','ü','ß']) expect(screen.getByRole('button',{name:letter})).toBeTruthy();
});

test('profile_switch_cannot_submit_old_selection',async()=>{
 const h=await createGrammarHarness();const p=await createProfile(h.db,'Первый');
 const view=render(<GrammarTrainingScreen db={h.db} profileId={p.id} selection={{mode:'study',lesson:'plural-invariant'}} today={day} onReference={jest.fn()} onExplainError={jest.fn()} />);
 try {
  fireEvent.press(await screen.findByTestId('grammar-multi-option-lehrer'));
  const other=await createProfile(h.db,'Второй');
  view.rerender(<GrammarTrainingScreen db={h.db} profileId={other.id} selection={{mode:'study',lesson:'plural-invariant'}} today={day} onReference={jest.fn()} onExplainError={jest.fn()} />);
  expect(screen.queryByTestId('grammar-multi-submit')).toBeNull();
  expect(await screen.findByTestId('grammar-multi-option-lehrer')).toHaveProp('accessibilityState',expect.objectContaining({checked:false}));
  expect(screen.getByTestId('grammar-multi-submit')).toBeDisabled();
  const attempts=await h.db.first<{count:number}>('SELECT COUNT(*) AS count FROM grammar_attempts');
  expect(attempts?.count).toBe(0);
 } finally {view.unmount();h.close();}
});

test.each(['noun-article','noun-plural','plural-invariant'] as const)('lektion3_training_submits_wrong_and_correct_answers_through_saved_service: %s',async lesson=>{
 const h=await createGrammarHarness();const p=await createProfile(h.db,'Ответы');
 const targetId=lesson==='plural-invariant'?'plural-invariant:recognition':`${lesson}:buch` as const;
 const view=render(<GrammarTrainingScreen db={h.db} profileId={p.id} selection={{mode:'study',lesson,targetIds:[targetId]}} today={day} onReference={jest.fn()} onExplainError={jest.fn()} />);
 try {
  if(lesson==='noun-article') fireEvent.press(await screen.findByTestId('grammar-option-der'));
  else if(lesson==='noun-plural') {fireEvent.changeText(await screen.findByTestId('grammar-answer-input'),'die Buch');fireEvent.press(screen.getByTestId('grammar-submit'));}
  else {fireEvent.press(await screen.findByTestId('grammar-multi-option-student'));fireEvent.press(screen.getByTestId('grammar-multi-submit'));}
  expect(await screen.findByText('Ошибка. Повторите правило.')).toBeTruthy();
  fireEvent.press(screen.getByTestId('grammar-next'));
  if(lesson==='noun-article') fireEvent.press(await screen.findByTestId('grammar-option-die'));
  else if(lesson==='noun-plural') {fireEvent.changeText(await screen.findByTestId('grammar-answer-input'),'die Bücher');fireEvent.press(screen.getByTestId('grammar-submit'));}
  else {fireEvent.press(await screen.findByTestId('grammar-multi-option-zimmer'));fireEvent.press(screen.getByTestId('grammar-multi-option-maedchen'));fireEvent.press(screen.getByTestId('grammar-multi-option-techniker'));fireEvent.press(screen.getByTestId('grammar-multi-submit'));}
  expect(await screen.findByText('Верно! +10 XP')).toBeTruthy();
  const progress=await h.grammar.getState(p.id,targetId);
  expect(progress.state.streak).toBe(1);
  const attempts=await h.db.all<{right:number}>('SELECT right FROM grammar_attempts WHERE profileId=? ORDER BY rowid',[p.id]);
  expect(attempts.map(a=>a.right)).toEqual([0,1]);
 } finally {view.unmount();h.close();}
});
