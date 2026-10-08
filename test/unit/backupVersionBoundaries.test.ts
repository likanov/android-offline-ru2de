import { BackupService } from '../../src/features/transfer/backupService';
import { remapBackup } from '../../src/features/transfer/backupRemap';
const id = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const service = new BackupService({} as any);
function file(version = 3): any {
  return { format: 'german-vocabulary-backup', version, createdAt: '2026-10-03T00:00:00.000Z', profiles: [{ profile: { id, name: 'A', xp: 0, createdAt: '2026-10-03T00:00:00.000Z' }, words: [], progress: [], skillStats: [], skillHistory: [], topics: [], wordTopics: [], settings: { profileId: id, dailyGoal: 20 }, dailyActivity: [], aids: [], aidWords: [], sessions: [], questions: [], attempts: [], rewards: [], grammar: { ...(version === 2 ? { catalogVersion: 1 } : { catalogVersions: [1] }), progress: [], sessions: [{ id: sessionId, profileId: id, selection: { mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:ich'] }, targetIds: ['pronoun-cloze:ich'], cursor: 0, currentQuestion: null, result: null, status: 'cancelled' }], questions: [], attempts: [], rewards: [] } }] };
}
function preview(value: unknown) { return service.preview(JSON.stringify(value)); }
test.each([undefined, null, 2])('v2_requires_exact_legacy_catalog_version_%s', catalogVersion => {
  const data = file(2); data.profiles[0].grammar.catalogVersion = catalogVersion; data.profiles[0].grammar.catalogVersions = [1];
  expect(() => preview(data)).toThrow();
});
test('v2_rejects_plural_container_discriminator_even_with_catalog1', () => {
  const data = file(2); data.profiles[0].grammar.catalogVersions = [1]; expect(() => preview(data)).toThrow();
});
test.each([undefined, [], [2], [1]])('v3_rejects_legacy_discriminator_instead_of_bypassing_catalog_versions_%s', catalogVersions => {
  const data = file(); data.profiles[0].grammar.catalogVersion = 1; data.profiles[0].grammar.catalogVersions = catalogVersions;
  expect(() => preview(data)).toThrow();
});
test.each([2, 3])('version_%s_checks_selection_target_ids', version => {
  for (const targetIds of [['professions-pronoun:ich'], ['unknown'], ['pronoun-cloze:ich', 'pronoun-cloze:ich'], 'pronoun-cloze:ich']) {
    const data = file(version); data.profiles[0].grammar.sessions[0].selection.targetIds = targetIds;
    expect(() => preview(data)).toThrow();
  }
});
test.each([1, 2, 3])('valid_version_%s_migrates_and_remaps_roundtrip', version => {
  const data = file(version); if (version === 1) delete data.profiles[0].grammar;
  const valid = preview(data).backup;
  expect(valid.version).toBe(3);
  const profiles = remapBackup(valid, []);
  const roundtrip = preview({ ...valid, profiles }).backup;
  expect(roundtrip.profiles[0].profile.id).not.toBe(id);
  expect(roundtrip.profiles[0].settings.profileId).toBe(roundtrip.profiles[0].profile.id);
  expect(roundtrip.profiles[0].grammar.catalogVersions).toEqual([1]);
  if (version !== 1) expect(roundtrip.profiles[0].grammar.sessions[0].selection.targetIds).toEqual(['pronoun-cloze:ich']);
});
