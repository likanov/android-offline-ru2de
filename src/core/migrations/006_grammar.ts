import { grammarTargets } from '../../features/grammar/grammarCatalog';
import type { SqlExecutor } from '../sql';

export const grammarSchema = `
CREATE TABLE grammar_targets(
 id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('pronoun-cloze','sein-cloze')),
 pronounId TEXT NOT NULL CHECK(pronounId IN ('ich','du','er','sie_feminine','es','wir','ihr','sie_plural','sie_formal')),
 labelRu TEXT NOT NULL CHECK(length(trim(labelRu))>0),
 catalogVersion INTEGER NOT NULL CHECK(catalogVersion=1),
 ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal BETWEEN 0 AND 17),
 UNIQUE(id,catalogVersion)
);
CREATE TABLE grammar_progress(
 profileId TEXT NOT NULL REFERENCES profiles(id),
 targetId TEXT NOT NULL,
 catalogVersion INTEGER NOT NULL DEFAULT 1 CHECK(catalogVersion=1),
 streak INTEGER NOT NULL DEFAULT 0 CHECK(streak BETWEEN 0 AND 20),
 mastered INTEGER NOT NULL DEFAULT 0 CHECK(mastered IN (0,1)),
 masteryBonusGranted INTEGER NOT NULL DEFAULT 0 CHECK(masteryBonusGranted IN (0,1)),
 reviewStage INTEGER NOT NULL DEFAULT 0 CHECK(reviewStage BETWEEN 0 AND 5),
 dueDay TEXT,
 difficult INTEGER NOT NULL DEFAULT 0 CHECK(difficult IN (0,1)),
 totalErrors INTEGER NOT NULL DEFAULT 0 CHECK(totalErrors>=0),
 recoveryErrors INTEGER NOT NULL DEFAULT 0 CHECK(recoveryErrors>=0),
 recoveryCorrect INTEGER NOT NULL DEFAULT 0 CHECK(recoveryCorrect BETWEEN 0 AND 2),
 attemptCount INTEGER NOT NULL DEFAULT 0 CHECK(attemptCount>=0),
 variantIndex INTEGER NOT NULL DEFAULT 0 CHECK(variantIndex BETWEEN 0 AND 2),
 PRIMARY KEY(profileId,targetId),
 FOREIGN KEY(targetId,catalogVersion) REFERENCES grammar_targets(id,catalogVersion),
 CHECK(mastered=(streak=20)),
 CHECK(masteryBonusGranted>=mastered),
 CHECK((mastered=1 AND dueDay IS NOT NULL) OR (mastered=0 AND dueDay IS NULL AND reviewStage=0)),
 CHECK(totalErrors>=recoveryErrors),
 CHECK(difficult=(recoveryErrors>=3)),
 CHECK(difficult=1 OR recoveryCorrect=0)
);
CREATE TABLE grammar_sessions(
 id TEXT PRIMARY KEY NOT NULL,
 profileId TEXT NOT NULL REFERENCES profiles(id),
 selection TEXT NOT NULL,
 targetIds TEXT NOT NULL,
 cursor INTEGER NOT NULL DEFAULT 0 CHECK(cursor>=0),
 currentQuestion TEXT,
 result TEXT,
 status TEXT NOT NULL CHECK(status IN ('active','completed','cancelled')),
 UNIQUE(profileId,id)
);
CREATE UNIQUE INDEX grammar_sessions_active ON grammar_sessions(profileId) WHERE status='active';
CREATE TABLE grammar_questions(
 attemptId TEXT PRIMARY KEY NOT NULL,
 profileId TEXT NOT NULL,
 sessionId TEXT NOT NULL,
 targetId TEXT NOT NULL,
 catalogVersion INTEGER NOT NULL CHECK(catalogVersion=1),
 kind TEXT NOT NULL CHECK(kind IN ('pronoun-cloze','sein-cloze')),
 responseMode TEXT NOT NULL CHECK(responseMode IN ('choice','typed')),
 payload TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','answered','cancelled')),
 FOREIGN KEY(profileId,sessionId) REFERENCES grammar_sessions(profileId,id),
 FOREIGN KEY(profileId,targetId) REFERENCES grammar_progress(profileId,targetId),
 FOREIGN KEY(targetId,catalogVersion) REFERENCES grammar_targets(id,catalogVersion)
);
CREATE UNIQUE INDEX grammar_questions_active ON grammar_questions(sessionId) WHERE status='active';
CREATE TABLE grammar_attempts(
 attemptId TEXT PRIMARY KEY NOT NULL REFERENCES grammar_questions(attemptId),
 profileId TEXT NOT NULL,
 sessionId TEXT NOT NULL,
 targetId TEXT NOT NULL,
 right INTEGER NOT NULL CHECK(right IN (0,1)),
 xpDelta INTEGER NOT NULL CHECK(xpDelta>=0),
 result TEXT NOT NULL,
 day TEXT NOT NULL,
 UNIQUE(attemptId,profileId,targetId),
 FOREIGN KEY(profileId,sessionId) REFERENCES grammar_sessions(profileId,id),
 FOREIGN KEY(profileId,targetId) REFERENCES grammar_progress(profileId,targetId)
);
CREATE TABLE grammar_rewards(
 profileId TEXT NOT NULL,
 targetId TEXT NOT NULL,
 attemptId TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount=50),
 day TEXT NOT NULL,
 PRIMARY KEY(profileId,targetId),
 FOREIGN KEY(profileId,targetId) REFERENCES grammar_progress(profileId,targetId),
 FOREIGN KEY(attemptId,profileId,targetId) REFERENCES grammar_attempts(attemptId,profileId,targetId)
);
`;

export async function seedGrammarTargets(tx: SqlExecutor): Promise<void> {
  for (const [ordinal, target] of grammarTargets.entries()) {
    await tx.run(
      'INSERT INTO grammar_targets(id,kind,pronounId,labelRu,catalogVersion,ordinal) VALUES (?,?,?,?,?,?)',
      [target.id, target.kind, target.pronounId, target.labelRu, target.catalogVersion, ordinal],
    );
  }
}
