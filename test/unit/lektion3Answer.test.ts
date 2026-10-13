import { checkGrammarAnswer, makeGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
function make(targetId: string): any { return makeGrammarQuestion({ attemptId: 'a', sessionId: 's', profileId: 'p', targetId, responseMode: 'choice', variantIndex: 0, words: [], reviewStage: null, dueDay: null } as any); }
test('plural_requires_full_phrase_and_keeps_umlaut_case', () => {
    const q = make('noun-plural:buch');
    expect(q).toMatchObject({ presentation: 'phrase', responseMode: 'typed', sourcePhraseDe: 'das Buch', expected: { phrases: ['die Bücher'] } });
    for (const text of ['die Bücher', 'Die Bücher', 'die Bu\u0308cher', '  die   Bücher  '])
        expect(checkGrammarAnswer(q, { kind: 'typed', text })).toBe(true);
    for (const text of ['die bücher', 'die Bucher', 'Bücher', 'die Buch'])
        expect(checkGrammarAnswer(q, { kind: 'typed', text })).toBe(false);
});
test('invariant_order_independent_exact_set', () => {
    const q = make('plural-invariant:recognition');
    expect(q.expected.optionIds).toEqual(['lehrer', 'computer']);
    expect(checkGrammarAnswer(q, { kind: 'multi-choice', optionIds: ['computer', 'lehrer'] } as any)).toBe(true);
    expect(checkGrammarAnswer(q, { kind: 'multi-choice', optionIds: ['lehrer'] } as any)).toBe(false);
    expect(checkGrammarAnswer(q, { kind: 'multi-choice', optionIds: ['computer', 'lehrer', 'mensch'] } as any)).toBe(false);
    for (const optionIds of [[], ['lehrer', 'lehrer'], ['unknown'], ['designer']])
        expect(() => checkGrammarAnswer(q, { kind: 'multi-choice', optionIds } as any)).toThrow('GRAMMAR_ANSWER_INVALID');
});

test('typed_article_accepts_initial_capital', () => {
    const q = make('noun-article:buch');
    const typed = {...q,responseMode:'typed'};
    expect(checkGrammarAnswer(typed,{kind:'typed',text:'Das'})).toBe(true);
    expect(checkGrammarAnswer(typed,{kind:'typed',text:'das Buch'})).toBe(false);
    expect(checkGrammarAnswer(typed,{kind:'typed',text:'DAS'})).toBe(false);
    const plural = makeGrammarQuestion({...q,responseMode:'typed',variantIndex:1,words:[]}) as any;
    expect(checkGrammarAnswer(plural,{kind:'typed',text:'Die'})).toBe(true);
});
test('plural_answer_limit_is_64',()=>{
    expect(()=>checkGrammarAnswer(make('noun-plural:buch'),{kind:'typed',text:'die '+ 'B'.repeat(61)})).toThrow('GRAMMAR_ANSWER_INVALID');
});
