import type { SqlStore } from "./sql";
import { profilesSchema } from "./migrations/001_profiles";
export async function migrate(db: SqlStore): Promise<void> {
  await db.transaction(async (tx) => {
    const version = await tx.first<{ user_version: number }>(
      "PRAGMA user_version",
    );
    if ((version?.user_version ?? 0) > 1)
      throw new Error("Unsupported database version");
    if ((version?.user_version ?? 0) < 1) {
      await tx.exec(profilesSchema);
      await tx.exec("PRAGMA user_version=1;");
    }
  });
}
