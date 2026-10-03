import { notifyProfileChanged } from '../../app/refreshBus';
import type { SqlStore } from '../../core/sql';
import type { DayKey, Word, Skill } from './learningTypes';
import type { AttemptResult } from './questionTypes';
import { ownedSession, readState, eligible, TrainingError } from './sessionRepository';
import { applyAnswer } from './learningRules';
import { checkAnswer } from './normalizeAnswer';
export class AnswerService {
    constructor(private db: SqlStore) { }
    async submit(profileId: string, sessionId: string, attemptId: string, answer: string, today: DayKey): Promise<AttemptResult> {
        const result = await this.db.transaction(async (tx) => {
            const s = await ownedSession(tx, profileId, sessionId);
            const old = await tx.first<{
                profileId: string;
                sessionId: string;
                result: string;
            }>('SELECT * FROM attempts WHERE attemptId=?', [attemptId]);
            if (old) {
                if (old.profileId !== profileId)
                    throw new TrainingError('WRONG_PROFILE', 'Другой профиль');
                if (old.sessionId !== sessionId)
                    throw new TrainingError('STALE_QUESTION', 'Другое занятие');
                return JSON.parse(old.result);
            }
            const q = s.currentQuestion;
            if (s.status !== 'active' || s.result || !q || q.attemptId !== attemptId)
                throw new TrainingError('STALE_QUESTION', 'Задание устарело');
            const word = await tx.first<Word>('SELECT * FROM words WHERE profileId=? AND id=?', [profileId, q.wordId]);
            const state = await readState(tx, profileId, q.wordId);
            const qr = await tx.first<{
                status: string;
            }>('SELECT status FROM questions WHERE attemptId=?', [attemptId]);
            if (!word || word.revision !== q.revision || qr?.status !== 'active' || !eligible(state, s.mode, today) || (s.mode === 'review' && (state.reviewStage !== q.reviewStage || state.dueDay !== q.dueDay)))
                throw new TrainingError('STALE_QUESTION', 'Задание устарело');
            const right = checkAnswer(answer, q.expected), transition = applyAnswer(state, right, s.mode, today), n = transition.state;
            const result: AttemptResult = { attemptId, right, xpDelta: transition.xpDelta, state: n };
            await tx.run('UPDATE word_progress SET streak=?,learned=?,bonusAwarded=?,reviewStage=?,dueDate=?,difficult=?,totalErrors=?,recoveryErrors=?,recoveryCorrect=? WHERE profileId=? AND wordId=?', [n.streak, +n.mastered, +n.masteryBonusGranted, n.reviewStage, n.dueDay, +n.difficult, n.totalErrors, n.recoveryErrors, n.recoveryCorrect, profileId, q.wordId]);
            await tx.run('UPDATE profiles SET xp=xp+? WHERE id=?', [result.xpDelta, profileId]);
            await tx.run('INSERT INTO attempts(attemptId,profileId,sessionId,wordId,right,xpDelta,result,day) VALUES (?,?,?,?,?,?,?,?)', [attemptId, profileId, sessionId, q.wordId, +right, result.xpDelta, JSON.stringify(result), today]);
            if (transition.firstMastery)
                await tx.run('INSERT INTO rewards(profileId,wordId,attemptId,amount) VALUES (?,?,?,50)', [profileId, q.wordId, attemptId]);
            await tx.run('INSERT INTO daily_activity(profileId,day,correct,errors,xp) VALUES (?,?,?,?,?) ON CONFLICT(profileId,day) DO UPDATE SET correct=correct+excluded.correct,errors=errors+excluded.errors,xp=xp+excluded.xp', [profileId, today, +right, +!right, result.xpDelta]);
            const skill: Skill = q.kind === 'typing' ? 'writing' : q.kind === 'listening' ? 'listening' : q.kind.includes('article') ? 'article' : 'translation';
            await tx.run('INSERT INTO skill_stats(profileId,wordId,skill,correct,errors,revision) VALUES (?,?,?,?,?,?) ON CONFLICT(profileId,wordId,skill) DO UPDATE SET correct=correct+excluded.correct,errors=errors+excluded.errors,revision=excluded.revision', [profileId, q.wordId, skill, +right, +!right, q.revision]);
            await tx.run('INSERT INTO skill_history(attemptId,profileId,wordId,revision,skill,right,day) VALUES (?,?,?,?,?,?,?)', [attemptId, profileId, q.wordId, q.revision, skill, +right, today]);
            await tx.run("UPDATE questions SET status='answered' WHERE attemptId=?", [attemptId]);
            await tx.run('UPDATE sessions SET result=? WHERE id=?', [JSON.stringify(result), sessionId]);
            return result;
        });
        notifyProfileChanged(profileId);
        return result;
    }
}
