import { openTestDb } from "../sqlite";
import { migrate } from "../../src/core/migrations";
import {
  createProfile,
  getActiveProfile,
  listProfiles,
  renameProfile,
  setActiveProfile,
} from "../../src/features/profiles/profileRepository";
import type { SqlStore } from "../../src/core/sql";
const countWords = async (db: SqlStore, id: string) =>
  (await db.first<{ n: number }>(
    "SELECT count(*) n FROM words WHERE profileId=?",
    [id],
  ))!.n;
const duplicateSeedIds = (db: SqlStore, a: string, b: string) =>
  db.all(
    "SELECT a.id FROM words a JOIN words b ON a.id=b.id WHERE a.profileId=? AND b.profileId=?",
    [a, b],
  );
let db: SqlStore;
let close: () => void;
beforeEach(async () => {
  ({ db, close } = openTestDb());
  await migrate(db);
});
afterEach(() => close());
test("creates_isolated_starter_profiles", async () => {
  const p1 = await createProfile(db, "  Антон  ");
  const p2 = await createProfile(db, "Мария");
  expect(p1.name).toBe("Антон");
  expect(await countWords(db, p1.id)).toBe(40);
  expect(await countWords(db, p2.id)).toBe(40);
  expect(p1.xp).toBe(0);
  expect(await getActiveProfile(db)).toMatchObject({ id: p2.id });
  expect(await duplicateSeedIds(db, p1.id, p2.id)).toEqual([]);
  expect(
    await db.all(
      "SELECT pos,count(*) n FROM words WHERE profileId=? GROUP BY pos ORDER BY pos",
      [p1.id],
    ),
  ).toEqual([
    { pos: "adjective", n: 16 },
    { pos: "noun", n: 24 },
  ]);
  expect(
    await db.first(
      "SELECT count(*) n FROM word_progress WHERE profileId=? AND streak=0 AND learned=0 AND bonusAwarded=0",
      [p1.id],
    ),
  ).toEqual({ n: 40 });
  const word = await db.first<{ id: string }>(
    "SELECT id FROM words WHERE profileId=? LIMIT 1",
    [p1.id],
  );
  await expect(
    db.run("INSERT INTO word_progress(profileId,wordId) VALUES (?,?)", [
      p2.id,
      word!.id,
    ]),
  ).rejects.toThrow(/FOREIGN KEY/);
});
test("rejects_blank_names_without_partial_profile", async () => {
  await expect(createProfile(db, "  ")).rejects.toThrow();
  expect(await listProfiles(db)).toEqual([]);
});
test("persists_selection_and_rename_and_migration_is_idempotent", async () => {
  const first = await createProfile(db, "Первый");
  await createProfile(db, "Второй");
  await setActiveProfile(db, first.id);
  await renameProfile(db, first.id, "  Новое имя ");
  await migrate(db);
  expect(await getActiveProfile(db)).toMatchObject({
    id: first.id,
    name: "Новое имя",
  });
  expect(await countWords(db, first.id)).toBe(40);
  await expect(setActiveProfile(db, "missing")).rejects.toThrow();
  await expect(renameProfile(db, first.id, " ")).rejects.toThrow();
});
test("rolls_back_a_profile_when_copying_words_fails", async () => {
  await db.exec(
    "CREATE TRIGGER fail_seed BEFORE INSERT ON words WHEN NEW.seedKey='seed-03' BEGIN SELECT RAISE(ABORT,'disk failure'); END;",
  );
  await expect(createProfile(db, "Антон")).rejects.toThrow("disk failure");
  expect(await listProfiles(db)).toEqual([]);
  expect(await getActiveProfile(db)).toBeNull();
});
