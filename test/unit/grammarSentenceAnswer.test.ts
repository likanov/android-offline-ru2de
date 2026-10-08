import { normalizeGrammarSentence, checkGrammarSentence } from '../../src/features/grammar/grammarSentenceAnswer';
import { makeGrammarQuestion, checkGrammarAnswer } from '../../src/features/grammar/grammarQuestionFactory';
const q=()=>makeGrammarQuestion({attemptId:'a',sessionId:'s',profileId:'p',targetId:'yesno-translation:sie_formal',responseMode:'choice',variantIndex:0,words:[],reviewStage:null,dueDay:null});
test('sentences_preserve_internal_case',()=>{
 expect(normalizeGrammarSentence('  sind   Sie Designer?  ')).toBe('sind Sie Designer');
 expect(normalizeGrammarSentence('Sind sie Designer.')).toBe('sind sie Designer');
 const question=q();
 expect(checkGrammarAnswer(question,{kind:'typed',text:question.feedback.sentenceDe})).toBe(true);
 expect(checkGrammarAnswer(question,{kind:'typed',text:question.feedback.sentenceDe.replace(' Sie ',' sie ')})).toBe(false);
 expect(normalizeGrammarSentence('Ärzte sind groß!')).toBe('ärzte sind groß');
});
test('sentence_length_and_whitespace',()=>{
 for(const text of ['','   ','x'.repeat(257)]) expect(()=>checkGrammarAnswer(q(),{kind:'typed',text})).toThrow('GRAMMAR_ANSWER_INVALID');
 expect(checkGrammarAnswer(q(),{kind:'typed',text:'x'.repeat(256)})).toBe(false);
});
test('direct_sentence_grading_rejects_forged_expected_sentences',()=>{
 const question=q();
 if(question.catalogVersion!==2 || question.presentation!=='sentence') throw new Error('Expected sentence');
 expect(()=>checkGrammarSentence({...question,expected:{sentences:['Falsch']}},'Falsch')).toThrow('GRAMMAR_QUESTION_INVALID');
});
