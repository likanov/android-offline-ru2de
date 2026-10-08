import { NotFoundError } from '../../core/errors';
import { addDays } from '../../core/calendar';
import type { SqlStore } from '../../core/sql';
import type { DayKey } from '../learning/learningTypes';
import type { GrammarTarget, GrammarLesson } from './grammarTypes';

export type GrammarProgressSummary = {
  mastered: number;
  totalTargets: number;
  dueCount: number;
  difficultCount: number;
  skills: Record<GrammarTarget['kind'], { correct: number; errors: number }>;
};

type CountRow = { mastered: number; dueCount: number; difficultCount: number };
type SkillRow = { kind: GrammarTarget['kind']; correct: number; errors: number };

function emptySkills(): GrammarProgressSummary['skills'] {
  return {
    'pronoun-cloze': { correct: 0, errors: 0 },
    'sein-cloze': { correct: 0, errors: 0 },
    'professions-pronoun': { correct: 0, errors: 0 },
    'professions-sein': { correct: 0, errors: 0 },
    'demonstrative-statement': { correct: 0, errors: 0 },
    'yesno-transform': { correct: 0, errors: 0 },
    'yesno-translation': { correct: 0, errors: 0 },
  };
}

export class GrammarProgressRepository {
  constructor(private readonly db: SqlStore) {}

  async summary(profileId: string, today: DayKey, lesson?: GrammarLesson): Promise<GrammarProgressSummary> {
    addDays(today, 0);
    if (!await this.db.first('SELECT id FROM profiles WHERE id=?', [profileId])) {
      throw new NotFoundError('Профиль не найден');
    }
    const scope = lesson === undefined ? '1=1' : lesson === 'mixed' ? 't.catalogVersion=1' : 't.kind=?';
    const scopeParams = lesson === undefined || lesson === 'mixed' ? [] :
      [lesson === 'pronouns' ? 'pronoun-cloze' : lesson === 'sein' ? 'sein-cloze' : lesson];
    const targets = await this.db.first<{ totalTargets: number }>(
      `SELECT COUNT(*) AS totalTargets FROM grammar_targets t WHERE ${scope}`, scopeParams,
    );
    const counts = await this.db.first<CountRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN mastered=1 THEN 1 ELSE 0 END),0) AS mastered,
         COALESCE(SUM(CASE WHEN mastered=1 AND dueDay IS NOT NULL AND dueDay<=? THEN 1 ELSE 0 END),0) AS dueCount,
         COALESCE(SUM(CASE WHEN difficult=1 THEN 1 ELSE 0 END),0) AS difficultCount
       FROM grammar_progress p JOIN grammar_targets t ON t.id=p.targetId
       WHERE p.profileId=? AND ${scope}`,
      [today, profileId, ...scopeParams],
    );
    const skills = emptySkills();
    const rows = await this.db.all<SkillRow>(
      `SELECT t.kind AS kind,
              COALESCE(SUM(CASE WHEN a.right=1 THEN 1 ELSE 0 END),0) AS correct,
              COALESCE(SUM(CASE WHEN a.right=0 THEN 1 ELSE 0 END),0) AS errors
       FROM grammar_attempts a
       JOIN grammar_targets t ON t.id=a.targetId
       WHERE a.profileId=? AND ${scope}
       GROUP BY t.kind`,
      [profileId, ...scopeParams],
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
