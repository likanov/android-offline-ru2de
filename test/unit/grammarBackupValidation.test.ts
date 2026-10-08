import { grammarTargets, lektion2Targets } from '../../src/features/grammar/grammarCatalog';
import { validateGrammarProfile, validateCombinedLedger } from '../../src/features/transfer/grammarBackupValidation';
import type { GrammarProfileBackup, ProfileBackupV2, ProfileBackupV3 } from '../../src/features/transfer/backupTypes';

const profileId = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000002';
function grammar(): GrammarProfileBackup {
  return { catalogVersion: 1, progress: [], sessions: [], questions: [], attempts: [], rewards: [] };
}
function part(): ProfileBackupV2 {
  return {
    profile: { id: profileId, name: 'A', xp: 0, createdAt: '2026-10-03T00:00:00.000Z' },
    words: [], progress: [], skillStats: [], skillHistory: [], topics: [], wordTopics: [],
    settings: { profileId, dailyGoal: 20 }, dailyActivity: [], aids: [], aidWords: [],
    sessions: [], questions: [], attempts: [], rewards: [], grammar: grammar(),
  };
}

test('validates_empty_grammar_section_and_catalog_is_immutable', () => {
  const value = part();
  expect(() => validateGrammarProfile(value)).not.toThrow();
  expect(grammarTargets).toHaveLength(18);
  value.grammar.catalogVersion = 2 as 1;
  expect(() => validateGrammarProfile(value)).toThrow();
});

test('rejects_unknown_target_and_cross_profile_grammar_link', () => {
  const value = part();
  value.grammar.progress.push({ profileId, targetId: 'pronoun-cloze:missing' as never, state: { streak: 0, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 }, attemptCount: 0, variantIndex: 0 });
  expect(() => validateGrammarProfile(value)).toThrow();
});

test('combined_ledger_includes_grammar_attempt_xp_once', () => {
  const value = part();
  value.profile.xp = 10;
  value.grammar.attempts.push({ profileId, sessionId: '00000000-0000-4000-8000-000000000003', targetId: 'pronoun-cloze:ich', day: '2026-10-03', result: { attemptId, targetId: 'pronoun-cloze:ich', right: true, xpDelta: 10, state: { streak: 1, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 }, submittedAnswer: { kind: 'choice', optionId: 'ich' } } });
  value.dailyActivity.push({ profileId, day: '2026-10-03', correct: 1, errors: 0, xp: 10 });
  expect(() => validateCombinedLedger(value)).not.toThrow();
  value.profile.xp = 20;
  expect(() => validateCombinedLedger(value)).toThrow();
});

test('v3_accepts_both_catalogs_with_catalog_derived_variant_limits', () => {
  const value = part();
  const { catalogVersion: _version, ...rows } = value.grammar;
  const mixed: ProfileBackupV3 = { ...value, grammar: { ...rows, catalogVersions: [1, 2] as (1 | 2)[] } };
  mixed.grammar.progress.push({ profileId, targetId: lektion2Targets[0].id, state: { streak: 0, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 }, attemptCount: 0, variantIndex: 0 });
  expect(() => validateGrammarProfile(mixed)).not.toThrow();
});

test('v2_cannot_smuggle_catalog2', () => {
  const value = part();
  value.grammar.progress.push({ profileId, targetId: lektion2Targets[0].id as never, state: { streak: 0, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 }, attemptCount: 0, variantIndex: 0 });
  expect(() => validateGrammarProfile(value)).toThrow();
});
