import { upgradeGrammarState, createGrammarRulesTransition } from '../../src/features/grammar/grammarRulesUpgrade';
import { AppError } from '../../src/core/errors';
import { state } from '../fixtures';

// Catches premature upgrade mastery, failure to cap the streak, or repeated bonuses.
test.each([[0,false,0,null],[9,false,0,null],[10,true,50,'2026-10-14'],[19,true,50,'2026-10-14'],[20,true,0,'2026-10-20']] as const)('upgrade_zero_nine_ten_nineteen_twenty: %i', (streak,mastered,xpDelta,dueDay) => {
  const original = state({streak,...(streak === 20 ? {mastered:true,masteryBonusGranted:true,reviewStage:2,dueDay:'2026-10-20'} : {})});
  const snapshot = {...original};
  expect(upgradeGrammarState(original,'2026-10-13')).toEqual({state:{...snapshot,streak:streak >= 10 ? 10 : streak,mastered,masteryBonusGranted:mastered,reviewStage:streak === 20 ? 2 : 0,dueDay},xpDelta});
  expect(original).toEqual(snapshot);
});
test('upgrade never repeats a previously granted mastery bonus', () => {
  expect(upgradeGrammarState(state({streak:19,masteryBonusGranted:true}),'2026-10-13')).toMatchObject({state:{streak:10,mastered:true,dueDay:'2026-10-14'},xpDelta:0});
});
test('upgrade_preserves_difficult_and_review_schedule', () => {
  const original = state({streak:20,mastered:true,masteryBonusGranted:true,reviewStage:4,dueDay:'2026-11-03',difficult:true,totalErrors:8,recoveryErrors:4,recoveryCorrect:2});
  expect(upgradeGrammarState(original,'2026-10-13')).toEqual({state:{...original,streak:10},xpDelta:0});
  const unmastered = {...original,streak:19,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null};
  expect(upgradeGrammarState(unmastered,'2026-10-13')).toEqual({state:{...unmastered,streak:10,mastered:true,masteryBonusGranted:true,dueDay:'2026-10-14'},xpDelta:50});
});
test('upgrade rejects invalid days and impossible legacy states', () => {
  expect(() => upgradeGrammarState(state(),'2026-02-29')).toThrow(AppError);
  expect(() => upgradeGrammarState(state({streak:20}),'2026-10-13')).toThrow(AppError);
  expect(() => upgradeGrammarState(state({streak:21}),'2026-10-13')).toThrow(AppError);
  expect(() => upgradeGrammarState(state({streak:10,mastered:true,masteryBonusGranted:true,dueDay:'2026-10-14'}),'2026-10-13')).toThrow(AppError);
});
test('transition records independent before and after snapshots', () => {
  const input = {profileId:'profile-1',targetId:'sein-cloze:ich' as const,afterAttemptId:'attempt-9',day:'2026-10-13',stateBefore:state({streak:19})};
  const result = createGrammarRulesTransition(input);
  expect(result).toEqual({...input,fromRulesVersion:1,toRulesVersion:2,stateAfter:state({streak:10,mastered:true,masteryBonusGranted:true,dueDay:'2026-10-14'}),xpDelta:50});
  expect(result.stateBefore).not.toBe(input.stateBefore);
  expect(result.stateAfter).not.toBe(input.stateBefore);
  expect(createGrammarRulesTransition({...input,afterAttemptId:null,stateBefore:state()}).afterAttemptId).toBeNull();
});
