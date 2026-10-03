import { createRequire } from "node:module";
import type { SqlExecutor, SqlStore, SqlValue } from "../src/core/sql";
const { DatabaseSync } = createRequire(__filename)(
  "node:sqlite",
) as typeof import("node:sqlite");
export function openTestDb(path = ":memory:"): {
  db: SqlStore;
  close: () => void;
} {
  const native = new DatabaseSync(path);
  native.exec("PRAGMA foreign_keys=ON;");
  const executor: SqlExecutor = {
    exec: async (sql) => {
      native.exec(sql);
    },
    run: async (sql, params: SqlValue[] = []) => {
      const r = native.prepare(sql).run(...params);
      return {
        changes: Number(r.changes),
        lastInsertRowId: Number(r.lastInsertRowid),
      };
    },
    all: async <T>(sql: string, params: SqlValue[] = []) =>
      native.prepare(sql).all(...params) as T[],
    first: async <T>(sql: string, params: SqlValue[] = []) =>
      (native.prepare(sql).get(...params) as T | undefined) ?? null,
  };
  let pending: Promise<unknown> = Promise.resolve();
  return {
    db: {
      ...executor,
      transaction: <T>(work: (tx: SqlExecutor) => Promise<T>) => {
        const operation = pending.then(async () => {
          native.exec("BEGIN IMMEDIATE");
          try {
            const result = await work(executor);
            native.exec("COMMIT");
            return result;
          } catch (error) {
            native.exec("ROLLBACK");
            throw error;
          }
        });
        pending = operation.catch(() => {});
        return operation;
      },
    },
    close: () => native.close(),
  };
}
