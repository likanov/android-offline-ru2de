import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTestDb } from "../sqlite";
import { migrate } from "../../src/core/migrations";
import {
  createProfile,
  getActiveProfile,
} from "../../src/features/profiles/profileRepository";
test("retains_profile_and_40_words_after_closing_and_reopening_sqlite", async () => {
  const directory = mkdtempSync(join(tmpdir(), "german-vocabulary-"));
  const path = join(directory, "profiles.db");
  let opened = openTestDb(path);
  try {
    await migrate(opened.db);
    const profile = await createProfile(opened.db, "Антон");
    opened.close();
    opened = openTestDb(path);
    await migrate(opened.db);
    expect(await getActiveProfile(opened.db)).toMatchObject({
      id: profile.id,
      name: "Антон",
      xp: 0,
    });
    expect(
      await opened.db.first("SELECT count(*) n FROM words WHERE profileId=?", [
        profile.id,
      ]),
    ).toEqual({ n: 40 });
    expect(
      await opened.db.first(
        "SELECT seedKey,seedDe,de,ru,gender FROM words WHERE profileId=? AND seedKey=?",
        [profile.id, "seed-13"],
      ),
    ).toEqual({
      seedKey: "seed-13",
      seedDe: "Straße",
      de: "Straße",
      ru: "улица",
      gender: "f",
    });
    expect(
      await opened.db.first(
        "SELECT seedKey,de,gender FROM words WHERE profileId=? AND seedKey=?",
        [profile.id, "seed-40"],
      ),
    ).toEqual({ seedKey: "seed-40", de: "gelb", gender: null });
  } finally {
    opened.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
