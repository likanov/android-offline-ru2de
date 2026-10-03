import type { SqlStore, SqlExecutor, SqlValue } from '../../core/sql';
import type { Profile } from '../../core/types';
import { AppError } from '../../core/errors';
import { notifyProfileChanged } from '../../app/refreshBus';
import { BACKUP_MAX_BYTES, type BackupV1, type ProfileBackup, type RestorePreview } from './backupTypes';
import { validateBackup } from './backupValidation';
import { remapBackup } from './backupRemap';
// Table names and columns are application constants. File values are always bound parameters.
const tables = { words: 'words', progress: 'word_progress', skillStats: 'skill_stats', topics: 'topics', wordTopics: 'word_topics', dailyActivity: 'daily_activity', aids: 'aids', aidWords: 'aid_words', sessions: 'sessions', questions: 'questions', attempts: 'attempts', skillHistory: 'skill_history', rewards: 'rewards' } as const;
const columns = { profiles: 'id,name,xp,createdAt', words: 'id,profileId,seedKey,seedDe,de,ru,pos,gender,plural,exampleDe,exampleRu,note,icon,revision,canonicalKey', word_progress: 'profileId,wordId,streak,learned,bonusAwarded,reviewStage,dueDate,difficult,totalErrors,recoveryErrors,recoveryCorrect', skill_stats: 'profileId,wordId,skill,correct,errors,revision', skill_history: 'attemptId,profileId,wordId,revision,skill,right,day', topics: 'id,profileId,name', word_topics: 'profileId,wordId,topicId', settings: 'profileId,dailyGoal', daily_activity: 'profileId,day,correct,errors,xp', aids: 'id,profileId,content,stale', aid_words: 'aidId,profileId,wordId,revision', sessions: 'id,profileId,mode,wordIds,cursor,kindIndex,currentQuestion,result,status', questions: 'attemptId,profileId,sessionId,wordId,revision,payload,status', attempts: 'attemptId,profileId,sessionId,wordId,right,xpDelta,result,day', rewards: 'profileId,wordId,attemptId,amount' } as const;
const jsonColumns = new Set(['wordIds', 'currentQuestion', 'result', 'payload']);
type Row = Record<string, unknown>;
function decode(row: Row): Row { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, jsonColumns.has(key) && typeof value === 'string' ? JSON.parse(value) : value])); }
async function insert(tx: SqlExecutor, table: keyof typeof columns, row: object) { const keys = columns[table].split(','), values = row as Row; await tx.run(`INSERT INTO ${table}(${columns[table]}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(key => jsonColumns.has(key) && values[key] !== null ? JSON.stringify(values[key]) : values[key]) as SqlValue[]); }
export class BackupService {
    constructor(private db: SqlStore) { }
    async exportAll(): Promise<BackupV1> {
        const snapshot = await this.db.transaction(async (tx) => {
            const profiles: ProfileBackup[] = [];
            for (const profile of await tx.all<Profile>('SELECT * FROM profiles ORDER BY rowid')) {
                const part: Row = { profile, settings: await tx.first('SELECT profileId,dailyGoal FROM settings WHERE profileId=?', [profile.id]) };
                for (const [key, table] of Object.entries(tables))
                    part[key] = (await tx.all<Row>(`SELECT * FROM ${table} WHERE profileId=? ORDER BY rowid`, [profile.id])).map(decode);
                const attempts = part.attempts as ProfileBackup['attempts'];
                part.rewards = (part.rewards as Omit<ProfileBackup['rewards'][number], 'day'>[]).map(r => ({ ...r, day: attempts.find(a => a.attemptId === r.attemptId)!.day }));
                profiles.push(part as ProfileBackup);
            }
            return { format: 'german-vocabulary-backup' as const, version: 1 as const, createdAt: new Date().toISOString(), profiles };
        });
        return validateBackup(snapshot);
    }
    preview(text: string): RestorePreview {
        if (typeof text !== 'string')
            throw new AppError('VALIDATION', 'Нужен JSON файл');
        let bytes = 0;
        for (const char of text) {
            const code = char.codePointAt(0)!;
            bytes += code <= 127 ? 1 : code <= 2047 ? 2 : code <= 65535 ? 3 : 4;
            if (bytes > BACKUP_MAX_BYTES)
                throw new AppError('VALIDATION', 'Файл превышает допустимый размер (50 МиБ)');
        }
        let value: unknown;
        try {
            value = JSON.parse(text.replace(/^\uFEFF/u, ''));
        }
        catch (error) {
            throw new AppError('VALIDATION', 'Не удалось прочитать JSON резервной копии', error);
        }
        const backup = validateBackup(value);
        return { backup, profileCount: backup.profiles.length, wordCount: backup.profiles.reduce((n, p) => n + p.words.length, 0) };
    }
    async restore(preview: RestorePreview): Promise<{
        profileIds: string[];
    }> {
        // Revalidate a detached value before opening the transaction, even if caller mutated a preview.
        const backup = validateBackup(preview.backup);
        const profileIds = await this.db.transaction(async (tx) => {
            const names = (await tx.all<{
                name: string;
            }>('SELECT name FROM profiles')).map(p => p.name), profiles = remapBackup(backup, names);
            for (const p of profiles) {
                await insert(tx, 'profiles', p.profile);
                await insert(tx, 'settings', p.settings);
                for (const [key, table] of Object.entries(tables))
                    for (const row of p[key as keyof typeof tables])
                        await insert(tx, table, row);
            }
            return profiles.map(p => p.profile.id);
        });
        for (const id of profileIds)
            notifyProfileChanged(id);
        return { profileIds };
    }
}
