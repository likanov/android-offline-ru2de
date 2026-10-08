import { checkAnswer } from "../../src/features/learning/normalizeAnswer";

import type { Word } from '../../src/features/learning/learningTypes';
import { buildQuestion } from '../../src/features/learning/questionFactory';
const w: Word = { id: 'w', profileId: 'p', de: 'Stuhl', ru: 'стул', pos: 'noun', gender: 'm', plural: null, exampleDe: null, exampleRu: null, note: '' };
test('ambiguous_translation_has_one_option', () => { const other = { ...w, id: 'o', de: 'Hocker' }; const q = buildQuestion(w, [w, other, { ...w, id: 'x', de: 'Tisch', ru: 'стол' }], 'ru-de', 'a'); expect(q).toMatchObject({ kind: 'ru-de', expected: ['der Stuhl'] }); expect(q!.options).toContain('der Stuhl'); expect(q!.options).not.toContain('der Hocker'); expect(new Set(q!.options).size).toBe(q!.options.length); expect(buildQuestion(w, [w, other], 'typing', 'b')!.expected).toEqual(['der Stuhl', 'der Hocker']); });
test('single_adjective_falls_back_to_typing_and_articles_hide_marker', () => { const adj: Word = { ...w, pos: 'adjective', gender: null, de: 'gut' }; expect(buildQuestion(adj, [adj], 'ru-de', 'a')).toMatchObject({ kind: 'typing', options: [] }); expect(buildQuestion(adj, [adj], 'definite-article', 'a')).toBeNull(); expect(buildQuestion(w, [w], 'definite-article', 'a')).toMatchObject({ markerVisible: false, expected: ['der'] }); expect(buildQuestion(w, [w], 'indefinite-article', 'a')).toMatchObject({ expected: ['ein'] }); expect(buildQuestion(w, [w], 'listening', 'a')).toMatchObject({ prompt: 'Прослушайте слово', markerVisible: false }); });

test('numbers_use_number_distractors_and_no_articles_or_markers',()=>{
 const number:Word={...w,pos:'number',gender:null,de:'sechzehn',ru:'шестнадцать'};
 const other:Word={...number,id:'two',de:'siebzehn',ru:'семнадцать'};
 const q=buildQuestion(number,[number,other,w,{...number,id:'foreign',profileId:'other',de:'acht',ru:'восемь'}],'ru-de','a');
 expect(q).toMatchObject({kind:'ru-de',expected:['sechzehn'],markerVisible:false});expect(q!.options.slice().sort()).toEqual(['sechzehn','siebzehn']);
 expect(buildQuestion(number,[number,other],'definite-article','a')).toBeNull();expect(buildQuestion(number,[number,other],'indefinite-article','a')).toBeNull();
});
test('single_number_falls_back_to_typing_and_digits_are_not_answers',()=>{
 const number:Word={...w,pos:'number',gender:null,de:'sechzehn',ru:'шестнадцать'};
 const q=buildQuestion(number,[number,w],'ru-de','a');expect(q).toMatchObject({kind:'typing',expected:['sechzehn'],options:[]});
 expect(checkAnswer('16',q!.expected)).toBe(false);expect(checkAnswer('sechzehn',q!.expected)).toBe(true);
});
