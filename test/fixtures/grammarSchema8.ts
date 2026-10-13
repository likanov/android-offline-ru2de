import { randomUUID } from 'node:crypto';
import type { SqlStore } from '../../src/core/sql';
import type { DayKey, LearningState } from '../../src/features/learning/learningTypes';
import type { GrammarTargetId, GrammarAttemptResult } from '../../src/features/grammar/grammarTypes';
import { profilesSchema } from '../../src/core/migrations/001_profiles';
import { wordDetailsSchema } from '../../src/core/migrations/002_word_details';
import { learningSchema } from '../../src/core/migrations/003_learning';
import { topicsSchema } from '../../src/core/migrations/004_topics';
import { grammarSchema, seedGrammarTargets } from '../../src/core/migrations/006_grammar';
import { migrateWordParts } from '../../src/core/migrations/007_word_parts';
import { migrateLektion2 } from '../../src/core/migrations/008_lektion2';
import { applyGrammarAnswer } from '../../src/features/grammar/grammarLearningRules';
import { makeGrammarQuestion, grammarResponseMode } from '../../src/features/grammar/grammarQuestionFactory';
import type { BackupV3, ProfileBackupV3 } from '../../src/features/transfer/backupTypes';
import { validateBackup } from '../../src/features/transfer/backupValidation';
export async function createSchema8GrammarFixture(db: SqlStore, day: DayKey): Promise<{
    profileIds: string[];
    targetIds: GrammarTargetId[];
}> {
    await db.transaction(async (tx) => {
        await tx.exec(profilesSchema);
        await tx.exec(wordDetailsSchema);
        await tx.exec(learningSchema);
        await tx.exec(topicsSchema);
        await tx.exec(`ALTER TABLE settings ADD COLUMN reminderEnabled INTEGER NOT NULL DEFAULT 0 CHECK(reminderEnabled IN (0,1));
      ALTER TABLE settings ADD COLUMN reminderHour INTEGER NOT NULL DEFAULT 19 CHECK(reminderHour BETWEEN 0 AND 23);
      ALTER TABLE settings ADD COLUMN reminderMinute INTEGER NOT NULL DEFAULT 0 CHECK(reminderMinute BETWEEN 0 AND 59);`);
        await tx.exec(grammarSchema);
        await seedGrammarTargets(tx);
    });
    await db.schemaTransaction(async (tx) => { await migrateWordParts(tx); await migrateLektion2(tx); await tx.exec('PRAGMA user_version=8'); });
    const profileIds = [randomUUID(), randomUUID()];
    const targetIds: GrammarTargetId[] = ['pronoun-cloze:ich', 'pronoun-cloze:du', 'pronoun-cloze:er', 'pronoun-cloze:sie_feminine', 'pronoun-cloze:es'];
    await db.transaction(async (tx) => {
        for (const [profileIndex, profileId] of profileIds.entries()) {
            await tx.run('INSERT INTO profiles(id,name,xp,createdAt) VALUES (?,?,0,?)', [profileId, `Schema8 ${profileIndex}`, `${day}T12:00:00.000Z`]);
            await tx.run('INSERT INTO settings(profileId) VALUES (?)', [profileId]);
            // A dictionary row at 19 proves grammar conversion never touches dictionary progress.
            const wordId = randomUUID();
            await tx.run("INSERT INTO words(id,profileId,de,ru,pos,gender,canonicalKey) VALUES (?,?,'Buch','книга','noun','n',?)", [wordId, profileId, JSON.stringify(['buch', 'книга', 'noun', 'n'])]);
            await tx.run('INSERT INTO word_progress(profileId,wordId,streak) VALUES (?,?,19)', [profileId, wordId]);
            for (const [index, targetId] of targetIds.entries()) {
                const count = [0, 9, 10, 19, 20][index];
                const sessionId = randomUUID();
                await tx.run("INSERT INTO grammar_progress(profileId,targetId) VALUES (?,?)", [profileId, targetId]);
                await tx.run("INSERT INTO grammar_sessions(id,profileId,selection,targetIds,status) VALUES (?,?,?,?,'completed')", [sessionId, profileId, JSON.stringify({ mode: 'study', lesson: 'pronouns', targetIds: [targetId] }), JSON.stringify([targetId])]);
                let state: LearningState = { streak: 0, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 };
                for (let n = 0; n < count; n++) {
                    const question = makeGrammarQuestion({ attemptId: randomUUID(), sessionId, profileId, targetId, responseMode: grammarResponseMode(n), variantIndex: n % 3, words: [], reviewStage: null, dueDay: null });
                    if (question.catalogVersion !== 1)
                        throw new Error('Schema8 fixture requires legacy target');
                    const answer = question.responseMode === 'choice' ? { kind: 'choice' as const, optionId: question.expected.optionId } : { kind: 'typed' as const, text: question.expected.token };
                    const transition = applyGrammarAnswer(state, true, 'study', day, 1);
                    state = transition.state;
                    const result: GrammarAttemptResult = { attemptId: question.attemptId, targetId, right: true, xpDelta: transition.xpDelta, state, submittedAnswer: answer };
                    await tx.run("INSERT INTO grammar_questions(attemptId,profileId,sessionId,targetId,catalogVersion,kind,responseMode,payload,status) VALUES (?,?,?,?,1,?,?,?,'answered')", [question.attemptId, profileId, sessionId, targetId, question.kind, question.responseMode, JSON.stringify(question)]);
                    await tx.run('INSERT INTO grammar_attempts(attemptId,profileId,sessionId,targetId,right,xpDelta,result,day) VALUES (?,?,?,?,1,?,?,?)', [question.attemptId, profileId, sessionId, targetId, result.xpDelta, JSON.stringify(result), day]);
                    await tx.run('UPDATE grammar_sessions SET currentQuestion=?,result=? WHERE id=?', [JSON.stringify(question), JSON.stringify(result), sessionId]);
                    await tx.run('UPDATE profiles SET xp=xp+? WHERE id=?', [result.xpDelta, profileId]);
                    await tx.run('INSERT INTO daily_activity(profileId,day,correct,errors,xp) VALUES (?,?,1,0,?) ON CONFLICT(profileId,day) DO UPDATE SET correct=correct+1,xp=xp+excluded.xp', [profileId, day, result.xpDelta]);
                    if (transition.firstMastery)
                        await tx.run('INSERT INTO grammar_rewards(profileId,targetId,attemptId,amount,day) VALUES (?,?,?,50,?)', [profileId, targetId, question.attemptId, day]);
                }
                await tx.run('UPDATE grammar_progress SET streak=?,mastered=?,masteryBonusGranted=?,reviewStage=?,dueDay=?,attemptCount=?,variantIndex=? WHERE profileId=? AND targetId=?', [state.streak, +state.mastered, +state.masteryBonusGranted, state.reviewStage, state.dueDay, count, count % 3, profileId, targetId]);
            }
        }
        await tx.run('UPDATE app_settings SET activeProfileId=? WHERE id=1', [profileIds[0]]);
    });
    return { profileIds, targetIds };
}
/** Frozen schema8 / backup3 export contract; deliberately independent of live BackupService. */
export async function exportSchema8GrammarFixture(db: SqlStore): Promise<BackupV3> {
    type Row = Record<string, unknown>;
    const tables = { words: 'words', progress: 'word_progress', skillStats: 'skill_stats', skillHistory: 'skill_history', topics: 'topics', wordTopics: 'word_topics', dailyActivity: 'daily_activity', aids: 'aids', aidWords: 'aid_words', sessions: 'sessions', questions: 'questions', attempts: 'attempts', rewards: 'rewards' };
    const json = new Set(['wordIds', 'currentQuestion', 'result', 'payload']);
    const snapshot = await db.transaction(async (tx) => {
        const profiles: ProfileBackupV3[] = [];
        for (const profile of await tx.all<ProfileBackupV3['profile']>('SELECT * FROM profiles ORDER BY rowid')) {
            const part: Row = { profile, settings: await tx.first('SELECT profileId,dailyGoal FROM settings WHERE profileId=?', [profile.id]) };
            for (const [key, table] of Object.entries(tables))
                part[key] = (await tx.all<Row>(`SELECT * FROM ${table} WHERE profileId=? ORDER BY rowid`, [profile.id])).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, json.has(key) && typeof value === 'string' ? JSON.parse(value) : value])));
            const attempts = part.attempts as ProfileBackupV3['attempts'];
            part.rewards = (part.rewards as Omit<ProfileBackupV3['rewards'][number], 'day'>[]).map(row => ({ ...row, day: attempts.find(a => a.attemptId === row.attemptId)!.day }));
            part.grammar = { catalogVersions: [1, 2],
                progress: (await tx.all<Row>('SELECT * FROM grammar_progress WHERE profileId=? ORDER BY rowid', [profile.id])).map(row => ({ profileId: profile.id, targetId: row.targetId, attemptCount: row.attemptCount, variantIndex: row.variantIndex, state: { streak: row.streak, mastered: !!row.mastered, masteryBonusGranted: !!row.masteryBonusGranted, reviewStage: row.reviewStage, dueDay: row.dueDay, difficult: !!row.difficult, totalErrors: row.totalErrors, recoveryErrors: row.recoveryErrors, recoveryCorrect: row.recoveryCorrect } })),
                sessions: (await tx.all<Row>('SELECT * FROM grammar_sessions WHERE profileId=? ORDER BY rowid', [profile.id])).map(row => ({ ...row, selection: JSON.parse(String(row.selection)), targetIds: JSON.parse(String(row.targetIds)), currentQuestion: row.currentQuestion ? JSON.parse(String(row.currentQuestion)) : null, result: row.result ? JSON.parse(String(row.result)) : null })),
                questions: (await tx.all<Row>('SELECT * FROM grammar_questions WHERE profileId=? ORDER BY rowid', [profile.id])).map(row => ({ question: JSON.parse(String(row.payload)), status: row.status })),
                attempts: (await tx.all<Row>('SELECT * FROM grammar_attempts WHERE profileId=? ORDER BY rowid', [profile.id])).map(row => ({ profileId: profile.id, sessionId: row.sessionId, targetId: row.targetId, day: row.day, result: JSON.parse(String(row.result)) })),
                rewards: await tx.all('SELECT * FROM grammar_rewards WHERE profileId=? ORDER BY rowid', [profile.id]) };
            profiles.push(part as ProfileBackupV3);
        }
        return { format: 'german-vocabulary-backup' as const, version: 3 as const, createdAt: '2026-10-13T12:00:00.000Z', profiles };
    });
    const valid = validateBackup(snapshot);
    if (valid.version !== 3) throw new Error('Schema8 must export backup3');
    return valid;
}
