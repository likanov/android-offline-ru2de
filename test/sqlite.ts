import { createRequire } from "node:module";
import { createSqlStore } from "../src/core/sql";
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
  return {
    db: createSqlStore({
      execAsync: executor.exec,
      runAsync: executor.run,
      getAllAsync: executor.all,
      getFirstAsync: executor.first,
      withExclusiveTransactionAsync: async work => {
        native.exec("BEGIN IMMEDIATE");
        try {
          await work({execAsync:executor.exec,runAsync:executor.run,getAllAsync:executor.all,getFirstAsync:executor.first});
          native.exec("COMMIT");
        } catch(error) { native.exec("ROLLBACK"); throw error; }
      },
    }),
    close: () => native.close(),
  };
}
