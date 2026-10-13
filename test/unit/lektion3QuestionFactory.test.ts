import { makeGrammarQuestion, validateGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
import { getGrammarVariantCount, getGrammarCatalogVersions } from '../../src/features/grammar/grammarCatalog';
import { lektion3Targets } from '../../src/features/grammar/lektion3Content';
const input = { attemptId: 'test-attempt', sessionId: 'session', profileId: 'profile', responseMode: 'choice', variantIndex: 0, words: [], reviewStage: null, dueDay: null };
function make(targetId: string, variantIndex = 0, responseMode = 'choice'): any { return makeGrammarQuestion({ ...input, targetId, variantIndex, responseMode } as any); }
test('article_alternates_singular_plural_and_mode', () => {
    const singular = make('noun-article:buch');
    expect(singular).toMatchObject({ catalogVersion: 3, kind: 'noun-article', presentation: 'cloze', number: 'singular', responseMode: 'choice', beforeDe: '', afterDe: ' Buch', expected: { optionId: 'das', token: 'das' }, dependencies: [] });
    expect(singular.options.map((o: any) => o.label).sort()).toEqual(['das', 'der', 'die']);
    const plural = make('noun-article:buch', 1, 'typed');
    expect(plural).toMatchObject({ number: 'plural', responseMode: 'typed', afterDe: ' Bücher', expected: { optionId: 'die', token: 'die' } });
    expect(plural.contextRu).not.toContain('книга');
});
test('snapshot_rejects_tampered_expected_and_options', () => {
    for (const id of ['noun-article:buch', 'noun-plural:buch', 'plural-invariant:recognition']) {
        const q = make(id);
        expect(() => validateGrammarQuestion(q)).not.toThrow();
        const expected = JSON.parse(JSON.stringify(q));
        expected.expected = q.kind === 'noun-article' ? { optionId: 'der', token: 'der' } : q.kind === 'noun-plural' ? { phrases: ['die Buch'] } : { optionIds: ['mensch'] };
        expect(() => validateGrammarQuestion(expected)).toThrow('GRAMMAR_QUESTION_INVALID');
        if (q.options) {
            const altered = JSON.parse(JSON.stringify(q));
            altered.options[0].label = 'bad';
            expect(() => validateGrammarQuestion(altered)).toThrow('GRAMMAR_QUESTION_INVALID');
            const reordered = { ...q, attemptId: 'remapped', options: [...q.options].reverse() };
            expect(() => validateGrammarQuestion(reordered)).not.toThrow();
        }
    }
});
test('empty_dictionary_generates_every_target', () => {
    expect(getGrammarCatalogVersions()).toEqual([1, 2, 3]);
    for (const t of lektion3Targets) {
        const count = t.kind === 'noun-article' ? 2 : t.kind === 'noun-plural' ? 1 : 12;
        expect(getGrammarVariantCount(t.id as any)).toBe(count);
        for (let n = 0; n < count; n++) {
            const q = make(t.id, n);
            expect(q.dependencies).toEqual([]);
            expect(() => validateGrammarQuestion(q)).not.toThrow();
            const visible = JSON.stringify({ contextRu: q.contextRu, sourcePhraseDe: q.sourcePhraseDe, options: q.options });
            expect(visible).not.toContain('translationRu');
            expect(visible).not.toContain('gender');
        }
    }
});

test('invariant_choices_show_singular_phrases', () => {
    const q = make('plural-invariant:recognition');
    expect(q.options.map((option:any)=>option.label).sort()).toEqual(['der Computer','der Lehrer','der Mensch','der Schrank','der Student','der Stuhl']);
});
test('wort_preserves_sense_context_without_other_translations',()=>{
    expect(make('noun-plural:wort').contextRu).toContain('отдельное слово языка');
    expect(make('noun-plural:buch').contextRu).not.toContain('книга');
});
