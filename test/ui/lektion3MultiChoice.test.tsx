import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GrammarQuestionView } from '../../src/features/grammar/GrammarQuestionView';
import { makeLektion3Question } from '../../src/features/grammar/lektion3QuestionFactory';
import type { Lektion3InvariantQuestion } from '../../src/features/grammar/grammarTypes';
const question=makeLektion3Question({attemptId:'a',sessionId:'s',profileId:'p',targetId:'plural-invariant:recognition',responseMode:'multi-choice',variantIndex:0,words:[],reviewStage:null,dueDay:null}) as Lektion3InvariantQuestion;
const props={currentState:null,busy:false,onNext:jest.fn(),onExplainError:jest.fn()};

test('checkbox_state_submit_and_exact_feedback',()=>{
 const onSubmit=jest.fn(); const view=render(<GrammarQuestionView {...props} question={question} result={null} onSubmit={onSubmit} />);
 expect(screen.getByTestId('grammar-multi-submit')).toBeDisabled();
 expect(screen.queryByText(/die Lehrer/)).toBeNull();
 for(const option of question.options) {
  const node=screen.getByTestId(`grammar-multi-option-${option.id}`);
  expect(node).toHaveProp('accessibilityState',expect.objectContaining({checked:false}));
  expect(node.props.accessibilityRole).toBe('checkbox');
  expect(node.props.accessibilityLabel).toBe(option.label);
  expect(StyleSheet.flatten(node.props.style).minHeight).toBeGreaterThanOrEqual(48);
 }
 fireEvent.press(screen.getByTestId('grammar-multi-option-lehrer'));
 fireEvent.press(screen.getByTestId('grammar-multi-option-student'));
 expect(screen.getByTestId('grammar-multi-option-lehrer')).toHaveProp('accessibilityState',expect.objectContaining({checked:true}));
 expect(onSubmit).not.toHaveBeenCalled();
 fireEvent.press(screen.getByTestId('grammar-multi-submit'));
 expect(onSubmit).toHaveBeenCalledWith({kind:'multi-choice',optionIds:['lehrer','student']});
 view.rerender(<GrammarQuestionView {...props} question={question} onSubmit={onSubmit} result={{attemptId:'a',targetId:question.targetId,right:false,xpDelta:0,state:{streak:0,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0},submittedAnswer:{kind:'multi-choice',optionIds:['lehrer','student']}}} />);
 expect(screen.getByTestId('grammar-multi-feedback-student')).toHaveTextContent(/Лишний выбор/);
 expect(screen.getByTestId('grammar-multi-feedback-computer')).toHaveTextContent(/Пропущено/);
 expect(screen.getAllByTestId(/^grammar-multi-feedback-/)).toHaveLength(6);
 expect(screen.getByTestId('grammar-multi-feedback-lehrer')).toHaveTextContent(/der Lehrer → die Lehrer/);
 expect(screen.getByTestId('grammar-multi-feedback-student')).toHaveTextContent(/der Student → die Studenten/);
});
test('new_question_resets_selection',()=>{
 const onSubmit=jest.fn();const view=render(<GrammarQuestionView {...props} question={question} result={null} onSubmit={onSubmit} />);
 fireEvent.press(screen.getByTestId('grammar-multi-option-lehrer'));
 view.rerender(<GrammarQuestionView {...props} question={{...question,attemptId:'new'}} result={null} onSubmit={onSubmit} />);
 expect(screen.getByTestId('grammar-multi-option-lehrer')).toHaveProp('accessibilityState',expect.objectContaining({checked:false}));
 expect(screen.getByTestId('grammar-multi-submit')).toBeDisabled();
});
