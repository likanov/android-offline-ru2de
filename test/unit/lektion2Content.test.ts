import { lektion2Templates } from '../../src/features/grammar/lektion2Content';
import { lektion2Targets, getGrammarTarget, getGrammarVariantCount, getGrammarCatalogVersions } from '../../src/features/grammar/grammarCatalog';

test('lektion2_has_24_targets_and_complete_source_coverage', () => {
  expect(lektion2Targets).toHaveLength(24);
  expect(getGrammarCatalogVersions()).toEqual([1, 2]);
  for (const [exercise, count] of [['2.9',42],['2.10',8],['2.11',10],['2.12',8],['2.13',11],['2.14',20]] as const) {
    expect(new Set(lektion2Templates.filter(t=>t.sourceExercise===exercise && t.sourceItem!==null).map(t=>t.sourceItem)).size).toBe(count);
  }
  expect(new Set(lektion2Templates.map(t=>t.id)).size).toBe(lektion2Templates.length);
  expect(lektion2Templates.find(t=>t.sentenceDe==='Ist das Buch neu?')?.answers).toEqual(['Ist das Buch neu?']);
});

test('every_target_has_contextual_variants', () => {
  for(const target of lektion2Targets) {
    expect(getGrammarTarget(target.id)).toEqual(target);
    expect(getGrammarVariantCount(target.id)).toBeGreaterThan(1);
    for(const t of lektion2Templates.filter(t=>t.targetId===target.id)) {
      expect(t.contextRu.length).toBeGreaterThan(0);
      expect(t.explanationRu.length).toBeGreaterThan(0);
      expect(t.answers.length).toBeGreaterThan(0);
    }
  }
});

test('trusted_answers_preserve_agreement_and_address_context', () => {
  expect(lektion2Templates.find(t=>t.sourceExercise==='2.10' && t.sourceItem===6)?.answers).toEqual(['Sie']);
  expect(lektion2Templates.find(t=>t.sourceExercise==='2.11' && t.sourceItem===4)?.answers).toEqual(['seid']);
  expect(lektion2Templates.find(t=>t.sourceExercise==='2.12' && t.sourceItem===2)?.answers).toEqual(['Dieses Kind ist Sportler.']);
  const transform=lektion2Templates.filter(t=>t.sourceExercise==='2.13' && t.sourceItem===2);
  expect(transform.map(t=>t.answers[0])).toEqual(['Sind sie Programmierer?', 'Sind Sie Programmierer?']);
  expect(transform.map(t=>t.contextRu)).toEqual(['Речь о группе: они.', 'Вежливое обращение.']);
  expect(lektion2Templates.filter(t=>t.sourceExercise==='2.14' && t.sourceItem===9).map(t=>t.answers[0])).toEqual(['Seid ihr Designer?', 'Sind Sie Designer?']);
});

// Wrong sein agreement or lost professional combinations must fail this check.
test('profession_bank_covers_each_person_with_correct_sein', () => {
  for (const [person, token, form] of [
    ['ich','Ich','bin'],['du','Du','bist'],['er','Er','ist'],['wir','Wir','sind'],
    ['ihr','Ihr','seid'],['sie_plural','Sie','sind'],['sie_formal','Sie','sind'],
  ]) {
    const variants=lektion2Templates.filter(t=>t.sourceExercise==='2.9' && t.targetId===`professions-sein:${person}`);
    expect(variants).toHaveLength(6);
    expect(variants.map(t=>t.sentenceDe)).toEqual([
      `${token} ${form} Lehrer.`,`${token} ${form} Programmierer.`,`${token} ${form} Designer.`,
      `${token} ${form} Manager.`,`${token} ${form} Sportler.`,`${token} ${form} Arbeiter.`,
    ]);
    expect(variants.every(t=>t.answers.length===1 && t.answers[0]===form)).toBe(true);
  }
});
