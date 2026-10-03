export const wordDetailsSchema = `
ALTER TABLE words ADD COLUMN icon TEXT;
ALTER TABLE words ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE words ADD COLUMN canonicalKey TEXT;
ALTER TABLE word_progress ADD COLUMN totalErrors INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX words_canonical ON words(profileId,canonicalKey);
CREATE TABLE skill_stats(
 profileId TEXT NOT NULL, wordId TEXT NOT NULL, skill TEXT NOT NULL,
 correct INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(profileId,wordId,skill), FOREIGN KEY(profileId,wordId) REFERENCES words(profileId,id)
);
CREATE TABLE aids(id TEXT PRIMARY KEY NOT NULL, profileId TEXT NOT NULL REFERENCES profiles(id), content TEXT NOT NULL, stale INTEGER NOT NULL DEFAULT 0, UNIQUE(profileId,id));
CREATE TABLE aid_words(aidId TEXT NOT NULL,profileId TEXT NOT NULL,wordId TEXT NOT NULL,revision INTEGER NOT NULL,
 PRIMARY KEY(aidId,wordId), FOREIGN KEY(profileId,aidId) REFERENCES aids(profileId,id), FOREIGN KEY(profileId,wordId) REFERENCES words(profileId,id));
`;
