import { NotFoundError } from '../../core/errors';
import { addDays } from '../../core/calendar';
import type { SqlStore } from '../../core/sql';
import type { DayKey } from '../learning/learningTypes';
import type { GrammarKind } from './grammarTypes';

export type GrammarProgressSummary = {
  mastered: number;
  totalTargets: number;
  dueCount: number;
  difficultCount: number;
  skills: Record<GrammarKind, { correct: number; errors: number }>;
};

type CountRow = { mastered: number; dueCount: number; difficultCount: number };
type SkillRow = { kind: GrammarKind; correct: number; errors: number };

function emptySkills(): GrammarProgressSummary['skills'] {
  return {
    'pronoun-cloze': { correct: 0, errors: 0 },
    'sein-cloze': { correct: 0, errors: 0 },
  };
}

export class GrammarProgressRepository {
  constructor(private readonly db: SqlStore) {}

  async summary(profileId: string, today: DayKey): Promise<GrammarProgressSummary> {
    addDays(today, 0);
    if (!await this.db.first('SELECT id FROM profiles WHERE id=?', [profileId])) {
      throw new NotFoundError('Профиль не найден');
    }
    const targets = await this.db.first<{ totalTargets: number }>(
      'SELECT COUNT(*) AS totalTargets FROM grammar_targets WHERE catalogVersion=1',
    );
    const counts = await this.db.first<CountRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN mastered=1 THEN 1 ELSE 0 END),0) AS mastered,
         COALESCE(SUM(CASE WHEN mastered=1 AND dueDay IS NOT NULL AND dueDay<=? THEN 1 ELSE 0 END),0) AS dueCount,
         COALESCE(SUM(CASE WHEN difficult=1 THEN 1 ELSE 0 END),0) AS difficultCount
       FROM grammar_progress
       WHERE profileId=?`,
      [today, profileId],
    );
    const skills = emptySkills();
    const rows = await this.db.all<SkillRow>(
      `SELECT t.kind AS kind,
              COALESCE(SUM(CASE WHEN a.right=1 THEN 1 ELSE 0 END),0) AS correct,
              COALESCE(SUM(CASE WHEN a.right=0 THEN 1 ELSE 0 END),0) AS errors
       FROM grammar_attempts a
       JOIN grammar_targets t ON t.id=a.targetId AND t.catalogVersion=1
       WHERE a.profileId=?
       GROUP BY t.kind`,
      [profileId],
    );
    for (const row of rows) {
      if (row.kind in skills) skills[row.kind] = { correct: row.correct, errors: row.errors };
    }
    return {
      mastered: counts?.mastered ?? 0,
      totalTargets: targets?.totalTargets ?? 0,
      dueCount: counts?.dueCount ?? 0,
      difficultCount: counts?.difficultCount ?? 0,
      skills,
    };
  }
}
