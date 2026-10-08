import { validateBackup } from '../../src/features/transfer/backupValidation';
import { remapBackup } from '../../src/features/transfer/backupRemap';
import { BackupService } from '../../src/features/transfer/backupService';
const id = '00000000-0000-4000-8000-000000000001';
function fixture() { return { format: 'german-vocabulary-backup', version: 1, createdAt: '2026-10-03T00:00:00.000Z', profiles: [{ profile: { id, name: 'A', xp: 0, createdAt: '2026-10-03T00:00:00.000Z' }, words: [], progress: [], skillStats: [], skillHistory: [], topics: [], wordTopics: [], settings: { profileId: id, dailyGoal: 20 }, dailyActivity: [], aids: [], aidWords: [], sessions: [], questions: [], attempts: [], rewards: [] }] }; }
test('validated_backup_is_a_detached_allowlisted_value_and_names_are_unique', () => { const data = fixture(); (data as any).modelPath = '/private/model.gguf'; const valid = validateBackup(data); expect(valid).not.toHaveProperty('modelPath'); data.profiles[0].profile.name = 'mutated'; expect(valid.profiles[0].profile.name).toBe('A'); const rows = remapBackup(valid, ['A', 'A восстановлено 2']); expect(rows[0].profile.name).toBe('A восстановлено 3'); expect(rows[0].profile.id).not.toBe(id); expect(rows[0].settings.profileId).toBe(rows[0].profile.id); });
test.each([undefined, null, {}, { ...fixture(), version: 2 }, { ...fixture(), createdAt: '2026-02-30T00:00:00.000Z' }, { ...fixture(), createdAt: 'yesterday' }])('rejects_invalid_root_%#', value => { expect(() => validateBackup(value)).toThrow(); });
test('rejects_unsafe_integer_and_duplicate_identity', () => { const bad = fixture(); bad.profiles[0].profile.xp = Number.MAX_SAFE_INTEGER + 1; expect(() => validateBackup(bad)).toThrow(); const duplicate = fixture(); duplicate.profiles.push(duplicate.profiles[0]); expect(() => validateBackup(duplicate)).toThrow(); });
test('oversized_json_is_rejected_before_parse', () => { expect(() => new BackupService({} as any).preview(' '.repeat(50 * 1024 * 1024 + 1))).toThrow(/50 МиБ/); });

test('v1_v2_reject_new_parts_and_unsupported_catalogs', () => {
    const base = validateBackup(fixture());
    expect(base.version).toBe(3);
    for (const catalogVersions of [[], [2], [1, 1], [1, 2]]) {
        const bad = JSON.parse(JSON.stringify(base)); bad.profiles[0].grammar.catalogVersions = catalogVersions;
        expect(() => validateBackup(bad)).toThrow();
    }
    const v2 = { ...base, version: 2, profiles: base.profiles.map(p => ({ ...p, grammar: { ...p.grammar, catalogVersion: 1 } })) };
    expect(validateBackup(v2).version).toBe(3);
    v2.profiles[0].grammar.catalogVersion = 2;
    expect(() => validateBackup(v2)).toThrow();
});
