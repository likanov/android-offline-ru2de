import { validateLektion2Question } from './lektion2QuestionFactory';
import type { GrammarSentenceQuestion } from './grammarTypes';
export function normalizeGrammarSentence(text:string):string {
 const normalized=text.normalize('NFC').trim().replace(/\s+/g,' ').replace(/[.?!]+$/,'').trimEnd();
 return normalized ? normalized[0].toLowerCase()+normalized.slice(1) : '';
}
export function checkGrammarSentence(question:GrammarSentenceQuestion,text:string):boolean {
 validateLektion2Question(question);
 if(typeof text!=='string'||text.length>256||!normalizeGrammarSentence(text)) throw new Error('GRAMMAR_ANSWER_INVALID');
 return question.expected.sentences.some(sentence=>normalizeGrammarSentence(sentence)===normalizeGrammarSentence(text));
}
