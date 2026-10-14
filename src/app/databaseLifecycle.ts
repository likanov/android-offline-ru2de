import type { OwnedSqlStore, SqlStore } from "../core/sql";

// Own the database from opening through teardown, including late initialization.
export function mountAppDatabase(options: {
  open: () => Promise<OwnedSqlStore>;
  migrate: (db: SqlStore) => Promise<void>;
  onReady: (db: OwnedSqlStore) => void;
  onError: () => void;
}): () => void {
  let mounted = true;
  let db: OwnedSqlStore | undefined;
  let disposal: Promise<void> | undefined;
  const dispose = () => disposal ??= db!.dispose();
  void (async () => {
    try {
      db = await options.open();
      if (!mounted) { await dispose(); return; }
      await options.migrate(db);
      if (mounted) options.onReady(db);
      else await dispose();
    } catch {
      if (db) await dispose().catch(() => {});
      if (mounted) options.onError();
    }
  })();
  return () => {
    mounted = false;
    if (db) void dispose().catch(() => {});
  };
}
