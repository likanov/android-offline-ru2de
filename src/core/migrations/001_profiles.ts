export const profilesSchema = `
CREATE TABLE profiles(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(trim(name))>0), xp INTEGER NOT NULL DEFAULT 0 CHECK(xp>=0), createdAt TEXT NOT NULL);
CREATE TABLE words(
 id TEXT PRIMARY KEY NOT NULL, profileId TEXT NOT NULL REFERENCES profiles(id),
 seedKey TEXT, seedDe TEXT, de TEXT NOT NULL, ru TEXT NOT NULL,
 pos TEXT NOT NULL CHECK(pos IN ('noun','adjective')), gender TEXT CHECK(gender IN ('m','f','n')),
 plural TEXT, exampleDe TEXT, exampleRu TEXT, note TEXT NOT NULL DEFAULT '',
 UNIQUE(profileId,id), UNIQUE(profileId,seedKey),
 CHECK((pos='noun' AND gender IS NOT NULL) OR (pos='adjective' AND gender IS NULL))
);
CREATE TABLE word_progress(
 profileId TEXT NOT NULL, wordId TEXT NOT NULL,
 streak INTEGER NOT NULL DEFAULT 0 CHECK(streak BETWEEN 0 AND 20),
 learned INTEGER NOT NULL DEFAULT 0 CHECK(learned IN (0,1)),
 bonusAwarded INTEGER NOT NULL DEFAULT 0 CHECK(bonusAwarded IN (0,1)),
 reviewStage INTEGER NOT NULL DEFAULT 0, dueDate TEXT,
 difficult INTEGER NOT NULL DEFAULT 0, recoveryErrors INTEGER NOT NULL DEFAULT 0, recoveryCorrect INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(profileId,wordId), FOREIGN KEY(profileId,wordId) REFERENCES words(profileId,id)
);
CREATE TABLE settings(profileId TEXT PRIMARY KEY REFERENCES profiles(id), dailyGoal INTEGER NOT NULL DEFAULT 20 CHECK(dailyGoal BETWEEN 1 AND 200));
CREATE TABLE app_settings(id INTEGER PRIMARY KEY CHECK(id=1), activeProfileId TEXT REFERENCES profiles(id));
INSERT INTO app_settings(id,activeProfileId) VALUES(1,NULL);
`;
