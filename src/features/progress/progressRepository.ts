import type { SqlStore } from '../../core/sql';
import type { DayKey, Skill } from '../learning/learningTypes';
import { NotFoundError, AppError } from '../../core/errors';
import { levelForXp } from '../learning/learningRules';
import { addDays } from '../../core/calendar';
import { ReviewRepository } from '../reviews/reviewRepository';
import { dayStreak } from './dailyStreak';
import { notifyProfileChanged } from '../../app/refreshBus';
export type ProfileSettings = {
    dailyGoal: number;
};
export type ProgressSummary = {
    xp: number;
    level: number;
    xpToNextLevel: number;
    mastered: number;
    totalWords: number;
    dueCount: number;
    todayCorrect: number;
    goal: number;
    dayStreak: number;
    skills: Record<Skill, {
        correct: number;
        total: number;
    }>;
    calendar: {
        day: DayKey;
        correct: number;
    }[];
};
export class ProgressRepository {
    constructor(private db: SqlStore) { }
    async settings(profileId: string): Promise<ProfileSettings> {
        const settings = await this.db.first<ProfileSettings>('SELECT dailyGoal FROM settings WHERE profileId=?', [profileId]);
        if (!settings)
            throw new NotFoundError('Профиль не найден');
        return settings;
    }
    async setGoal(profileId: string, count: number): Promise<void> {
        if (!Number.isInteger(count) || count < 1 || count > 200)
            throw new AppError('VALIDATION', 'Цель должна быть от 1 до 200');
        const result = await this.db.run('UPDATE settings SET dailyGoal=? WHERE profileId=?', [count, profileId]);
        if (!result.changes)
            throw new NotFoundError('Профиль не найден');
        notifyProfileChanged(profileId);
    }
    async summary(profileId: string, today: DayKey): Promise<ProgressSummary> {
        addDays(today, 0);
        const profile = await this.db.first<{
            xp: number;
        }>('SELECT xp FROM profiles WHERE id=?', [profileId]);
        if (!profile)
            throw new NotFoundError('Профиль не найден');
        const settings = await this.settings(profileId);
        const words = await this.db.first<{
            totalWords: number;
            mastered: number;
        }>('SELECT COUNT(*) AS totalWords,COALESCE(SUM(p.learned),0) AS mastered FROM words w JOIN word_progress p ON p.profileId=w.profileId AND p.wordId=w.id WHERE w.profileId=?', [profileId]);
        const calendar = await this.db.all<{
            day: DayKey;
            correct: number;
        }>('SELECT day,correct FROM daily_activity WHERE profileId=? AND day<=? ORDER BY day', [profileId, today]);
        const history = await this.db.all<{
            skill: Skill;
            correct: number;
            total: number;
        }>('SELECT h.skill,SUM(a.right) AS correct,COUNT(*) AS total FROM attempts a JOIN skill_history h ON h.attemptId=a.attemptId WHERE a.profileId=? GROUP BY h.skill', [profileId]);
        const skills: ProgressSummary['skills'] = { translation: { correct: 0, total: 0 }, writing: { correct: 0, total: 0 }, article: { correct: 0, total: 0 }, listening: { correct: 0, total: 0 } };
        for (const row of history)
            skills[row.skill] = { correct: row.correct, total: row.total };
        return { xp: profile.xp, level: levelForXp(profile.xp), xpToNextLevel: 500 - profile.xp % 500, mastered: words!.mastered, totalWords: words!.totalWords, dueCount: (await new ReviewRepository(this.db).dueWords(profileId, today)).length, todayCorrect: calendar.find(d => d.day === today)?.correct ?? 0, goal: settings.dailyGoal, dayStreak: dayStreak(calendar.filter(d => d.correct > 0).map(d => d.day), today), skills, calendar };
    }
}
