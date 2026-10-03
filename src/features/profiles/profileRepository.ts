import { seedProfileTopics } from '../../core/migrations/004_topics';
import type { SqlStore } from "../../core/sql";
import type { Profile } from "../../core/types";
import { randomUUID } from "expo-crypto";
import { starterWords } from "../../data/starterWords";
import { NotFoundError, ValidationError } from "../../core/errors";
import { wordKey } from "../dictionary/wordValidation";
function profileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Введите имя профиля");
  return trimmed;
}
export async function createProfile(
  db: SqlStore,
  name: string,
): Promise<Profile> {
  const profile: Profile = {
    id: randomUUID(),
    name: profileName(name),
    xp: 0,
    createdAt: new Date().toISOString(),
  };
  await db.transaction(async (tx) => {
    await tx.run(
      "INSERT INTO profiles(id,name,xp,createdAt) VALUES (?,?,?,?)",
      [profile.id, profile.name, 0, profile.createdAt],
    );
    for (const word of starterWords) {
      const id = randomUUID();
      await tx.run(
        "INSERT INTO words(id,profileId,seedKey,seedDe,de,ru,pos,gender,plural,exampleDe,exampleRu,note,canonicalKey) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          profile.id,
          word.seedKey,
          word.seedDe,
          word.de,
          word.ru,
          word.pos,
          word.gender,
          word.plural ?? null,
          word.exampleDe ?? null,
          word.exampleRu ?? null,
          word.note ?? "",
          wordKey(word),
        ],
      );
      await tx.run("INSERT INTO word_progress(profileId,wordId) VALUES (?,?)", [
        profile.id,
        id,
      ]);
    }
    await seedProfileTopics(tx,profile.id);
    await tx.run("INSERT INTO settings(profileId) VALUES (?)", [profile.id]);
    await tx.run("UPDATE app_settings SET activeProfileId=? WHERE id=1", [
      profile.id,
    ]);
  });
  return profile;
}
export async function listProfiles(db: SqlStore): Promise<Profile[]> {
  return db.all<Profile>("SELECT * FROM profiles ORDER BY createdAt,id");
}
export async function renameProfile(
  db: SqlStore,
  id: string,
  name: string,
): Promise<void> {
  const result = await db.run("UPDATE profiles SET name=? WHERE id=?", [
    profileName(name),
    id,
  ]);
  if (!result.changes) throw new NotFoundError("Профиль не найден");
}
export async function setActiveProfile(
  db: SqlStore,
  id: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await tx.first("SELECT id FROM profiles WHERE id=?", [id])))
      throw new NotFoundError("Профиль не найден");
    await tx.run("UPDATE app_settings SET activeProfileId=? WHERE id=1", [id]);
  });
}
export async function getActiveProfile(db: SqlStore): Promise<Profile | null> {
  return db.first<Profile>(
    "SELECT p.* FROM profiles p JOIN app_settings a ON a.activeProfileId=p.id WHERE a.id=1",
  );
}
