import { applyGrammarAnswer } from '../../src/features/grammar/grammarLearningRules';
import { validateLearningState } from '../../src/features/learning/learningRules';
import { AppError } from '../../src/core/errors';
import { state } from '../fixtures';

// Catches using the dictionary threshold for current grammar answers.
test('grammar_nine_to_ten_awards_sixty', () => {
  const original = state({streak:9});
  expect(applyGrammarAnswer(original,true,'study','2026-10-13')).toMatchObject({state:{streak:10,mastered:true,masteryBonusGranted:true,reviewStage:0,dueDay:'2026-10-14'},xpDelta:60,firstMastery:true});
  expect(original).toEqual(state({streak:9}));
  expect(applyGrammarAnswer(state({streak:9,masteryBonusGranted:true}),true,'study','2026-10-13',2)).toMatchObject({xpDelta:10,firstMastery:false});
});
test('legacy_nineteen_to_twenty_remains_valid', () => {
  expect(applyGrammarAnswer(state({streak:19}),true,'study','2026-10-13',1)).toMatchObject({state:{streak:20,mastered:true,dueDay:'2026-10-14'},xpDelta:60});
});
test('grammar_nine_error_resets', () => {
  expect(applyGrammarAnswer(state({streak:9}),false,'study','2026-10-13',2)).toMatchObject({state:{streak:0,mastered:false,totalErrors:1,recoveryErrors:1},xpDelta:0,firstMastery:false});
});
// Catches changing the shared review schedule while reducing mastery threshold.
test.each([[0,1,'2026-10-16'],[1,2,'2026-10-20'],[2,3,'2026-10-27'],[3,4,'2026-11-12'],[4,5,'2026-12-12'],[5,5,'2026-12-12']])('review_intervals_are_unchanged stage %i', (stage,nextStage,dueDay) => {
  expect(applyGrammarAnswer(state({streak:10,mastered:true,masteryBonusGranted:true,reviewStage:Number(stage),dueDay:'2026-10-13'}),true,'review','2026-10-13')).toMatchObject({state:{streak:10,mastered:true,reviewStage:nextStage,dueDay},xpDelta:10,firstMastery:false});
});
test('grammar review error retains mastery and schedules tomorrow', () => {
  expect(applyGrammarAnswer(state({streak:10,mastered:true,masteryBonusGranted:true,reviewStage:4,dueDay:'2026-10-13'}),false,'review','2026-10-13')).toMatchObject({state:{streak:10,mastered:true,reviewStage:0,dueDay:'2026-10-14'},xpDelta:0});
});
test('grammar difficult recovery remains three consecutive successes', () => {
  let current = state({difficult:true,totalErrors:3,recoveryErrors:3});
  current = applyGrammarAnswer(current,true,'study','2026-10-13').state;
  current = applyGrammarAnswer(current,true,'study','2026-10-13').state;
  expect(current).toMatchObject({difficult:true,recoveryCorrect:2});
  expect(applyGrammarAnswer(current,true,'study','2026-10-13').state).toMatchObject({difficult:false,recoveryErrors:0,recoveryCorrect:0,totalErrors:3});
});
test('threshold validation rejects states inconsistent with the selected policy', () => {
  expect(() => validateLearningState(state({streak:10}),{requiredCorrect:10})).toThrow(AppError);
  expect(() => applyGrammarAnswer(state({streak:19}),true,'study','2026-10-13')).toThrow(AppError);
  expect(() => applyGrammarAnswer(state(),true,'study','2026-02-29')).toThrow(AppError);
});
