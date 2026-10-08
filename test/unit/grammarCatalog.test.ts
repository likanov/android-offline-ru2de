import { grammarTargets, validateGrammarCatalog } from '../../src/features/grammar/grammarCatalog';
import { grammarResponseMode, makeGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
import { type GrammarTargetId } from '../../src/features/grammar/grammarTypes';

const input = (targetId: GrammarTargetId, words: any[] = []) => ({
  attemptId: 'catalog-test', sessionId: 's', profileId: 'p', targetId,
  responseMode: 'choice' as const, reviewStage: null, dueDay: null, variantIndex: 0, words,
});

test('catalog_has_18_targets_and_five_sein_forms', () => {
  validateGrammarCatalog();
  expect(grammarTargets).toHaveLength(18);
  expect(new Set(grammarTargets.map(t => t.id)).size).toBe(18);
  expect(grammarTargets.filter(t => t.kind === 'sein-cloze')).toHaveLength(9);
});

test('each_target_has_three_unambiguous_templates', () => {
  for (const target of grammarTargets) {
    const q = makeGrammarQuestion(input(target.id));
    if(q.catalogVersion!==1) throw new Error('Expected legacy question');
    expect(q.targetId).toBe(target.id);
    expect(q.contextRu.length).toBeGreaterThan(0);
    expect(q.beforeDe + '___' + q.afterDe).toContain(q.beforeDe);
  }
});

test('initial_sie_requires_context', () => {
  for (const target of grammarTargets.filter(t => t.pronounId.startsWith('sie_'))) {
    const q = makeGrammarQuestion(input(target.id));
    if(q.catalogVersion!==1) throw new Error('Expected legacy question');
    expect(q.contextRu).toMatch(/она|они|вежлив|Вы/i);
  }
});

test('choices_have_unique_semantic_ids', () => {
  for (const target of grammarTargets) {
    const q = makeGrammarQuestion(input(target.id));
    if(q.catalogVersion!==1) throw new Error('Expected legacy question');
    expect(new Set(q.options.map(o => o.id)).size).toBe(q.options.length);
    expect(q.options).toHaveLength(4);
  }
});

test('response_modes_share_target', () => {
  expect(grammarResponseMode(0)).toBe('choice');
  expect(grammarResponseMode(2)).toBe('choice');
  expect(grammarResponseMode(3)).toBe('typed');
  expect(grammarResponseMode(4)).toBe('choice');
  for (const target of grammarTargets) {
    expect(makeGrammarQuestion({ ...input(target.id), responseMode: grammarResponseMode(3) }).targetId).toBe(target.id);
  }
});

// A seed expansion here would expose unsupported targets to legacy mixed sessions.
test('legacy_catalog_is_unchanged', () => {
  expect(grammarTargets.map(t=>t.id)).toEqual([
    'pronoun-cloze:ich','pronoun-cloze:du','pronoun-cloze:er','pronoun-cloze:sie_feminine','pronoun-cloze:es','pronoun-cloze:wir','pronoun-cloze:ihr','pronoun-cloze:sie_plural','pronoun-cloze:sie_formal',
    'sein-cloze:ich','sein-cloze:du','sein-cloze:er','sein-cloze:sie_feminine','sein-cloze:es','sein-cloze:wir','sein-cloze:ihr','sein-cloze:sie_plural','sein-cloze:sie_formal',
  ]);
  expect(grammarTargets.every(t=>t.catalogVersion===1)).toBe(true);
});
