import { BackupService } from '../../src/features/transfer/backupService';
const id = '00000000-0000-4000-8000-000000000001';
const empty = { streak: 0, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 };
function file(version = 4): any {
    return { format: 'german-vocabulary-backup', version, createdAt: '2026-10-13T00:00:00.000Z', profiles: [{ profile: { id, name: 'A', xp: 0, createdAt: '2026-10-13T00:00:00.000Z' }, words: [], progress: [], skillStats: [], skillHistory: [], topics: [], wordTopics: [], settings: { profileId: id, dailyGoal: 20 }, dailyActivity: [], aids: [], aidWords: [], sessions: [], questions: [], attempts: [], rewards: [], grammar: { catalogVersions: [1, 2], ...(version === 4 ? { rulesVersion: 2, rulesTransitions: [] } : {}), progress: [], sessions: [], questions: [], attempts: [], rewards: [] } }] };
}
const service = new BackupService({} as any);
const preview = (value: unknown) => service.preview(JSON.stringify(value));
test.each([3, 4])('forged_streak_without_ledger_is_rejected_v%s', version => {
    const data = file(version);
    data.profiles[0].grammar.progress.push({ profileId: id, targetId: 'sein-cloze:ich', state: { ...empty, streak: 1 }, attemptCount: 1, variantIndex: 0 });
    expect(() => preview(data)).toThrow();
});
test.each([1, 4])('forged_attempt_count_without_ledger_is_rejected_%s', attemptCount => {
    const data = file(3);
    data.profiles[0].grammar.progress.push({ profileId: id, targetId: 'sein-cloze:ich', state: empty, attemptCount, variantIndex: 0 });
    expect(() => preview(data)).toThrow();
});
test('catalog_subset_duplicate_and_unknown_versions', () => {
    const data = file();
    data.profiles[0].grammar.catalogVersions = [1];
    for (const versions of [[1], [2], [3], [1, 2], [1, 2, 3]]) {
        data.profiles[0].grammar.catalogVersions = versions;
        expect(() => preview(data)).not.toThrow();
    }
    for (const versions of [[], [1, 1], [4]]) {
        data.profiles[0].grammar.catalogVersions = versions;
        expect(() => preview(data)).toThrow();
    }
    data.profiles[0].grammar.catalogVersions = [1];
    data.profiles[0].grammar.progress.push({ profileId: id, targetId: 'professions-sein:ich', state: empty, attemptCount: 0, variantIndex: 0 });
    expect(() => preview(data)).toThrow();
});
test.each([1, 3])('unknown_rules_version_rejects_%s', version => { const data = file(); data.profiles[0].grammar.rulesVersion = version; expect(() => preview(data)).toThrow(); });
test.each([1, 3])('legacy_container_rejects_new_rules_metadata_v%s', version => {
    const data = file(version);
    data.profiles[0].grammar.rulesVersion = 2;
    expect(() => preview(data)).toThrow();
});
