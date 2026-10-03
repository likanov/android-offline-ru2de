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
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
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
export function createSqlStore(native: NativeDatabase): SqlStore {
  const executor = (connection: NativeExecutor): SqlExecutor => ({
    exec: (sql) => connection.execAsync(sql),
    run: (sql, params = []) => connection.runAsync(sql, params),
    all: (sql, params = []) => connection.getAllAsync(sql, params),
    first: (sql, params = []) => connection.getFirstAsync(sql, params),
  });
  const direct = executor(native);
  // Queue reads as well as writes: nothing on the shared connection can accidentally
  // join another caller's transaction. Transaction callbacks use their own tx.
  let pending: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const result = pending.then(work);
    pending = result.catch(() => {});
    return result;
  };
  return {
    exec: (sql) => enqueue(() => direct.exec(sql)),
    run: (sql, params) => enqueue(() => direct.run(sql, params)),
    all: <T>(sql: string, params?: SqlValue[]) =>
      enqueue(() => direct.all<T>(sql, params)),
    first: <T>(sql: string, params?: SqlValue[]) =>
      enqueue(() => direct.first<T>(sql, params)),
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
export async function openAppDb(): Promise<SqlStore> {
  const { openDatabaseAsync } = await import("expo-sqlite");
  const native = await openDatabaseAsync("german-vocabulary.db");
  await native.execAsync("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  return createSqlStore(native);
}
