export type SqlValue = string | number | null;
export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(
    sql: string,
    params?: SqlValue[],
  ): Promise<{ changes: number; lastInsertRowId: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
}
export interface SqlStore extends SqlExecutor {
  // Startup table rebuilds only. The callback must use tx, never queued db methods.
  schemaTransaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
export interface OwnedSqlStore extends SqlStore {
  dispose(): Promise<void>;
}
export interface NativeExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    params: SqlValue[],
  ): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
}
export interface NativeDatabase extends NativeExecutor {
  withExclusiveTransactionAsync(
    work: (tx: NativeExecutor) => Promise<void>,
  ): Promise<void>;
}
export function createSqlStore(native: NativeDatabase, close: () => Promise<void> = async () => {}): OwnedSqlStore {
  let disposed = false;
  let closed = false;
  let disposal: Promise<void> | undefined;
  const executor = (connection: NativeExecutor): SqlExecutor => ({
    exec: (sql) => closed ? Promise.reject(new Error("SQLite store disposed")) : connection.execAsync(sql),
    run: (sql, params = []) => closed ? Promise.reject(new Error("SQLite store disposed")) : connection.runAsync(sql, params),
    all: (sql, params = []) => closed ? Promise.reject(new Error("SQLite store disposed")) : connection.getAllAsync(sql, params),
    first: (sql, params = []) => closed ? Promise.reject(new Error("SQLite store disposed")) : connection.getFirstAsync(sql, params),
  });
  const direct = executor(native);
  // Queue reads as well as writes: nothing on the shared connection can accidentally
  // join another caller's transaction. Transaction callbacks use their own tx.
  let pending: Promise<unknown> = Promise.resolve();
  const queued = new Set<() => void>();
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    if (disposed) return Promise.reject(new Error("SQLite store disposed"));
    // Caller cancellation is independent of the connection's drain barrier.
    // A stalled active query must not keep canceled queued callers pending.
    return new Promise<T>((resolve, reject) => {
      const cancel = () => reject(new Error("SQLite store disposed"));
      queued.add(cancel);
      const execution = pending.then(() => {
        queued.delete(cancel);
        if (disposed) throw new Error("SQLite store disposed");
        return work();
      });
      pending = execution.catch(() => {});
      void execution.then(resolve, reject);
    });
  };
  return {
    dispose: () => {
      if (!disposal) {
        disposed = true;
        for (const cancel of queued) cancel();
        queued.clear();
        // Cancel queued work, let the active operation finish, then close once.
        disposal = pending.then(async () => { closed = true; await close(); });
      }
      return disposal;
    },
    exec: (sql) => enqueue(() => direct.exec(sql)),
    run: (sql, params) => enqueue(() => direct.run(sql, params)),
    all: <T>(sql: string, params?: SqlValue[]) =>
      enqueue(() => direct.all<T>(sql, params)),
    first: <T>(sql: string, params?: SqlValue[]) =>
      enqueue(() => direct.first<T>(sql, params)),
    schemaTransaction: <T>(work: (tx: SqlExecutor) => Promise<T>) =>
      enqueue(async () => {
        const original = await direct.first<{ foreign_keys: number }>("PRAGMA foreign_keys");
        if (!original) throw new Error("Cannot read SQLite foreign key setting");
        let begun = false;
        try {
          await direct.exec("PRAGMA foreign_keys=OFF");
          const disabled = await direct.first<{ foreign_keys: number }>("PRAGMA foreign_keys");
          if (disabled?.foreign_keys !== 0) throw new Error("Cannot disable foreign keys before schema transaction");
          await direct.exec("BEGIN IMMEDIATE");
          begun = true;
          const result = await work(direct);
          if ((await direct.all("PRAGMA foreign_key_check")).length)
            throw new Error("Schema migration violates foreign key relationships");
          await direct.exec("COMMIT");
          begun = false;
          return result;
        } catch (error) {
          if (begun) await direct.exec("ROLLBACK");
          throw error;
        } finally {
          await direct.exec(`PRAGMA foreign_keys=${original.foreign_keys ? "ON" : "OFF"}`);
          const restored = await direct.first<{ foreign_keys: number }>("PRAGMA foreign_keys");
          if (restored?.foreign_keys !== original.foreign_keys)
            throw new Error("Cannot restore SQLite foreign key setting");
        }
      }),
    transaction: <T>(work: (tx: SqlExecutor) => Promise<T>) =>
      enqueue(async () => {
        let result!: T;
        await native.withExclusiveTransactionAsync(async (tx) => {
          // Expo creates a fresh connection and begins before this callback. PRAGMA
          // foreign_keys cannot be switched inside BEGIN; the build flag supplies
          // the default for each connection. Refuse unsafe native builds explicitly.
          const enabled = await tx.getFirstAsync<{ foreign_keys: number }>(
            "PRAGMA foreign_keys",
            [],
          );
          if (enabled?.foreign_keys !== 1)
            throw new Error(
              "SQLite foreign key enforcement is required on transaction connections",
            );
          result = await work(executor(tx));
        });
        return result;
      }),
  };
}
export async function openAppDb(): Promise<OwnedSqlStore> {
  const { openDatabaseAsync } = await import("expo-sqlite");
  // A remounted Android surface must not share a native binding with an old
  // wrapper: expo-sqlite's GC hook can invalidate that pooled binding.
  const native = await openDatabaseAsync("german-vocabulary.db", { useNewConnection: true });
  try {
    await native.execAsync("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    return createSqlStore(native, () => native.closeAsync());
  } catch (error) {
    await native.closeAsync().catch(() => {});
    throw error;
  }
}
