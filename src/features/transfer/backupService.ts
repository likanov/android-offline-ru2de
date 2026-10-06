import type { SqlStore, SqlExecutor, SqlValue } from '../../core/sql';
import type { Profile } from '../../core/types';
import { AppError } from '../../core/errors';
import { notifyProfileChanged } from '../../app/refreshBus';
import { BACKUP_MAX_BYTES, type BackupV2, type GrammarProfileBackup, type ProfileBackup, type ProfileBackupV2, type RestorePreview } from './backupTypes';
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
    async exportAll(): Promise<BackupV2> {
        const snapshot = await this.db.transaction(async (tx) => {
            const profiles: ProfileBackup[] = [];
            for (const profile of await tx.all<Profile>('SELECT * FROM profiles ORDER BY rowid')) {
                const part: Row = { profile, settings: await tx.first('SELECT profileId,dailyGoal FROM settings WHERE profileId=?', [profile.id]) };
                for (const [key, table] of Object.entries(tables))
                    part[key] = (await tx.all<Row>(`SELECT * FROM ${table} WHERE profileId=? ORDER BY rowid`, [profile.id])).map(decode);
                const attempts = part.attempts as ProfileBackup['attempts'];
                part.rewards = (part.rewards as Omit<ProfileBackup['rewards'][number], 'day'>[]).map(r => ({ ...r, day: attempts.find(a => a.attemptId === r.attemptId)!.day }));
                const progressRows = await tx.all<Row>('SELECT * FROM grammar_progress WHERE profileId=? ORDER BY rowid', [profile.id]);
                const grammar: GrammarProfileBackup = {
                    catalogVersion: 1,
                    progress: progressRows.map(row => ({ profileId: profile.id, targetId: row.targetId as ProfileBackupV2['grammar']['progress'][number]['targetId'], state: { streak: Number(row.streak), mastered: !!row.mastered, masteryBonusGranted: !!row.masteryBonusGranted, reviewStage: Number(row.reviewStage), dueDay: row.dueDay as string | null, difficult: !!row.difficult, totalErrors: Number(row.totalErrors), recoveryErrors: Number(row.recoveryErrors), recoveryCorrect: Number(row.recoveryCorrect) }, attemptCount: Number(row.attemptCount), variantIndex: Number(row.variantIndex) })),
                    sessions: (await tx.all<Row>('SELECT * FROM grammar_sessions WHERE profileId=? ORDER BY rowid', [profile.id])).map(row => ({ ...row, selection: JSON.parse(String(row.selection)), targetIds: JSON.parse(String(row.targetIds)), currentQuestion: row.currentQuestion ? JSON.parse(String(row.currentQuestion)) : null, result: row.result ? JSON.parse(String(row.result)) : null })) as ProfileBackupV2['grammar']['sessions'],
                    questions: (await tx.all<Row>('SELECT * FROM grammar_questions WHERE profileId=? ORDER BY rowid', [profile.id])).map(row => ({ question: JSON.parse(String(row.payload)), status: row.status as 'active' | 'answered' | 'cancelled' })),
                    attempts: (await tx.all<Row>('SELECT * FROM grammar_attempts WHERE profileId=? ORDER BY rowid', [profile.id])).map(row => ({ profileId: profile.id, sessionId: String(row.sessionId), targetId: row.targetId as ProfileBackupV2['grammar']['attempts'][number]['targetId'], day: String(row.day), result: JSON.parse(String(row.result)) })),
                    rewards: (await tx.all<Row>('SELECT * FROM grammar_rewards WHERE profileId=? ORDER BY rowid', [profile.id])).map(row => ({ profileId: profile.id, targetId: row.targetId as ProfileBackupV2['grammar']['rewards'][number]['targetId'], attemptId: String(row.attemptId), amount: 50 as const, day: String(row.day) })),
                };
                part.grammar = grammar;
                profiles.push(part as ProfileBackup);
            }
            return { format: 'german-vocabulary-backup' as const, version: 2 as const, createdAt: new Date().toISOString(), profiles: profiles as ProfileBackupV2[] };
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
        return { backup, profileCount: backup.profiles.length, wordCount: backup.profiles.reduce((n, p) => n + p.words.length, 0), grammarTargetCount: backup.profiles.reduce((n, p) => n + p.grammar.progress.length, 0) };
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
                for (const progress of p.grammar.progress) {
                    const s = progress.state;
                    await tx.run('INSERT INTO grammar_progress(profileId,targetId,catalogVersion,streak,mastered,masteryBonusGranted,reviewStage,dueDay,difficult,totalErrors,recoveryErrors,recoveryCorrect,attemptCount,variantIndex) VALUES (?,?,1,?,?,?,?,?,?,?,?,?,?,?)', [p.profile.id, progress.targetId, s.streak, +s.mastered, +s.masteryBonusGranted, s.reviewStage, s.dueDay, +s.difficult, s.totalErrors, s.recoveryErrors, s.recoveryCorrect, progress.attemptCount, progress.variantIndex]);
                }
                for (const session of p.grammar.sessions) await tx.run('INSERT INTO grammar_sessions(id,profileId,selection,targetIds,cursor,currentQuestion,result,status) VALUES (?,?,?,?,?,?,?,?)', [session.id, p.profile.id, JSON.stringify(session.selection), JSON.stringify(session.targetIds), session.cursor, session.currentQuestion ? JSON.stringify(session.currentQuestion) : null, session.result ? JSON.stringify(session.result) : null, session.status]);
                for (const row of p.grammar.questions) await tx.run('INSERT INTO grammar_questions(attemptId,profileId,sessionId,targetId,catalogVersion,kind,responseMode,payload,status) VALUES (?,?,?,?,?,?,?,?,?)', [row.question.attemptId, p.profile.id, row.question.sessionId, row.question.targetId, row.question.catalogVersion, row.question.kind, row.question.responseMode, JSON.stringify(row.question), row.status]);
                for (const row of p.grammar.attempts) await tx.run('INSERT INTO grammar_attempts(attemptId,profileId,sessionId,targetId,right,xpDelta,result,day) VALUES (?,?,?,?,?,?,?,?)', [row.result.attemptId, p.profile.id, row.sessionId, row.targetId, +row.result.right, row.result.xpDelta, JSON.stringify(row.result), row.day]);
                for (const row of p.grammar.rewards) await tx.run('INSERT INTO grammar_rewards(profileId,targetId,attemptId,amount,day) VALUES (?,?,?,?,?)', [p.profile.id, row.targetId, row.attemptId, row.amount, row.day]);
            }
            return profiles.map(p => p.profile.id);
        });
        for (const id of profileIds)
            notifyProfileChanged(id);
        return { profileIds };
    }
}
