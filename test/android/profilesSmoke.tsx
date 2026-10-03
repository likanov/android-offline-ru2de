// Test-only entry for an embedded native validation APK. The product entry stays
// expo/AppEntry; this module is selected only by a temporary Gradle init script.
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { registerRootComponent } from "expo";
import { openAppDb } from "../../src/core/sql";
import { migrate } from "../../src/core/migrations";
import {
  getActiveProfile,
  listProfiles,
} from "../../src/features/profiles/profileRepository";

async function verifyNativeProfiles() {
  const db = await openAppDb();
  await migrate(db);
  const profiles = await listProfiles(db);
  if (profiles.length !== 2)
    throw new Error(
      `Expected 2 UI-created profiles, received ${profiles.length}`,
    );
  const active = await getActiveProfile(db);
  if (active?.name !== "Anton")
    throw new Error(`Saved selection changed: ${active?.name}`);
  const counts = await db.all<{ name: string; words: number }>(
    "SELECT p.name,count(w.id) words FROM profiles p JOIN words w ON w.profileId=p.id GROUP BY p.id ORDER BY p.name",
  );
  if (counts.some((row) => row.words !== 40))
    throw new Error(`Wrong starter count: ${JSON.stringify(counts)}`);
  const keys = await db.transaction((tx) =>
    tx.first<{ foreign_keys: number }>("PRAGMA foreign_keys"),
  );
  if (keys?.foreign_keys !== 1)
    throw new Error("Native transaction foreign keys disabled");
  const options = await db.all<{ compile_options: string }>(
    "PRAGMA compile_options",
  );
  const defaultForeignKeys = options.some(
    (row) => row.compile_options === "DEFAULT_FOREIGN_KEYS",
  );
  if (!defaultForeignKeys)
    throw new Error("Native SQLite default-foreign-keys flag absent");
  const word = await db.first<{ id: string }>(
    "SELECT id FROM words WHERE profileId=? LIMIT 1",
    [profiles[0].id],
  );
  let rejection = "";
  try {
    await db.transaction((tx) =>
      tx.run("INSERT INTO word_progress(profileId,wordId) VALUES (?,?)", [
        profiles[1].id,
        word!.id,
      ]),
    );
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
  if (!rejection.includes("FOREIGN KEY constraint failed"))
    throw new Error(
      `Cross-profile link not rejected by native FK: ${rejection}`,
    );
  return {
    status: "PASS",
    active: active.name,
    counts,
    transactionForeignKeys: keys.foreign_keys,
    defaultForeignKeys,
    crossProfileRejected: true,
  };
}

function NativeProfilesSmoke() {
  const [result, setResult] = useState("Running native SQLite checks");
  useEffect(() => {
    void verifyNativeProfiles()
      .then((report) => {
        const text = JSON.stringify(report);
        console.log(`NATIVE_PROFILES_RESULT ${text}`);
        setResult(text);
      })
      .catch((error) => {
        const text = `FAIL ${String(error)}`;
        console.error(`NATIVE_PROFILES_RESULT ${text}`);
        setResult(text);
      });
  }, []);
  return (
    <View
      style={{
        flex: 1,
        padding: 48,
        paddingTop: 100,
        backgroundColor: "#ffffff",
      }}
    >
      <Text selectable style={{ fontSize: 20, color: "#111111" }}>
        {result}
      </Text>
    </View>
  );
}

registerRootComponent(NativeProfilesSmoke);
