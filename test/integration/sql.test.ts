import { createSqlStore, NativeDatabase } from "../../src/core/sql";
import { openTestDb } from "../sqlite";
test("queues_outside_writes_until_exclusive_transaction_finishes", async () => {
  const { db: sqlite, close } = openTestDb();
  await sqlite.exec("CREATE TABLE entries(value TEXT)");
  // Real SQLite is the external native boundary; deliberately delay exclusive work.
  const native = {
    execAsync: sqlite.exec,
    runAsync: sqlite.run,
    getAllAsync: sqlite.all,
    getFirstAsync: sqlite.first,
    withExclusiveTransactionAsync: (
      work: Parameters<NativeDatabase["withExclusiveTransactionAsync"]>[0],
    ) =>
      sqlite.transaction(async (tx) =>
        work({
          execAsync: tx.exec,
          runAsync: tx.run,
          getAllAsync: tx.all,
          getFirstAsync: tx.first,
        }),
      ),
  };
  const db = createSqlStore(native);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const transaction = db.transaction(async (tx) => {
    await tx.run("INSERT INTO entries VALUES (?)", ["inside"]);
    entered();
    await gate;
    throw new Error("rollback");
  });
  const rejected = expect(transaction).rejects.toThrow("rollback");
  await ready;
  const outside = db.run("INSERT INTO entries VALUES (?)", ["outside"]);
  release();
  await rejected;
  await outside;
  expect(await db.all("SELECT * FROM entries")).toEqual([{ value: "outside" }]);
  close();
});
test("runs_transaction_queries_on_the_exclusive_connection", async () => {
  const main = openTestDb();
  const exclusive = openTestDb();
  await main.db.exec("CREATE TABLE entries(value TEXT)");
  await exclusive.db.exec("CREATE TABLE entries(value TEXT)");
  const native = {
    execAsync: main.db.exec,
    runAsync: main.db.run,
    getAllAsync: main.db.all,
    getFirstAsync: main.db.first,
    withExclusiveTransactionAsync: (
      work: Parameters<NativeDatabase["withExclusiveTransactionAsync"]>[0],
    ) =>
      exclusive.db.transaction(async (tx) =>
        work({
          execAsync: tx.exec,
          runAsync: tx.run,
          getAllAsync: tx.all,
          getFirstAsync: tx.first,
        }),
      ),
  };
  try {
    const db = createSqlStore(native);
    await db.transaction((tx) =>
      tx.run("INSERT INTO entries VALUES (?)", ["exclusive"]),
    );
    expect(await main.db.all("SELECT * FROM entries")).toEqual([]);
    expect(await exclusive.db.all("SELECT * FROM entries")).toEqual([
      { value: "exclusive" },
    ]);
  } finally {
    main.close();
    exclusive.close();
  }
});
test("refuses_a_transaction_connection_without_foreign_key_enforcement", async () => {
  const { db: sqlite, close } = openTestDb();
  await sqlite.exec("PRAGMA foreign_keys=OFF");
  const native = {
    execAsync: sqlite.exec,
    runAsync: sqlite.run,
    getAllAsync: sqlite.all,
    getFirstAsync: sqlite.first,
    withExclusiveTransactionAsync: (
      work: Parameters<NativeDatabase["withExclusiveTransactionAsync"]>[0],
    ) =>
      sqlite.transaction(async (tx) =>
        work({
          execAsync: tx.exec,
          runAsync: tx.run,
          getAllAsync: tx.all,
          getFirstAsync: tx.first,
        }),
      ),
  };
  const db = createSqlStore(native);
  await expect(
    db.transaction(async (tx) => tx.exec("CREATE TABLE unsafe(id TEXT)")),
  ).rejects.toThrow("foreign key");
  expect(
    await sqlite.first("SELECT name FROM sqlite_master WHERE name='unsafe'"),
  ).toBeNull();
  close();
});
