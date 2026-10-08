import { lektion2Templates } from '../../src/features/grammar/lektion2Content';
import { makeGrammarQuestion, validateGrammarQuestion, checkGrammarAnswer } from '../../src/features/grammar/grammarQuestionFactory';
const input = {attemptId:'a',sessionId:'s',profileId:'p',responseMode:'typed' as const,reviewStage:null,dueDay:null,words:[]};
test('all_templates_roundtrip_through_validation', () => {
 for(const template of lektion2Templates){
  const templates=lektion2Templates.filter(t=>t.targetId===template.targetId);
  const q=makeGrammarQuestion({...input,targetId:template.targetId,variantIndex:templates.indexOf(template)});
  expect(q.catalogVersion).toBe(2);
  expect(q.templateId).toBe(template.id);
  expect(()=>validateGrammarQuestion(q)).not.toThrow();
  for(const answer of template.answers) expect(checkGrammarAnswer(q,{kind:'typed',text:answer})).toBe(true);
 }
});
test('forged_payload_rejected',()=>{
 const q=makeGrammarQuestion({...input,responseMode:'typed',targetId:'yesno-translation:sie_formal',variantIndex:0});
 for(const patch of [{expected:{sentences:['Falsch']}},{contextRu:'forged'},{templateId:'missing'},{catalogVersion:1}]) expect(()=>validateGrammarQuestion({...q,...patch} as typeof q)).toThrow('GRAMMAR_QUESTION_INVALID');
});
test('new_choices_are_german_only_and_distractors_are_wrong',()=>{
 for(const template of lektion2Templates.filter(t=>t.targetId.startsWith('professions-'))){
  const templates=lektion2Templates.filter(t=>t.targetId===template.targetId);
  const q=makeGrammarQuestion({...input,responseMode:'choice',targetId:template.targetId,variantIndex:templates.indexOf(template)});
  if(q.catalogVersion!==2 || q.presentation!=='cloze') throw new Error('Expected cloze');
  expect(new Set(q.options.map(o=>o.label)).size).toBe(q.options.length);
  for(const option of q.options){
   expect(option.label).toMatch(/^[A-Za-zäöüÄÖÜß]+$/);
   expect(checkGrammarAnswer(q,{kind:'choice',optionId:option.id})).toBe(option.label===template.answers[0]);
  }
 }
});

test('saved_cloze_option_permutations_remain_valid_after_attempt_remap', () => {
 const q=makeGrammarQuestion({...input,responseMode:'choice',targetId:'professions-pronoun:ich',variantIndex:0});
 if(q.catalogVersion!==2 || q.presentation!=='cloze') throw new Error('Expected cloze');
 const saved={...q,attemptId:'restored-attempt',options:[...q.options].reverse()};
 expect(()=>validateGrammarQuestion(saved)).not.toThrow();
 for(const options of [saved.options.map((o,i)=>i===0?{...o,label:'Falsch'}:o),saved.options.map((o,i)=>i===0?{...o,id:'seid' as const}:o),[saved.options[0],saved.options[0],...saved.options.slice(2)]]) {
  expect(()=>validateGrammarQuestion({...saved,options})).toThrow('GRAMMAR_QUESTION_INVALID');
 }
});
