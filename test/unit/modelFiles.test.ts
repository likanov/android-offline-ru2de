import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelFiles } from "../../src/features/assistant/modelFiles";
import { openTestDb } from "../sqlite";

const manifest = {
  id: "qwen3",
  sourceRevision: "a".repeat(40),
  quantization: "Q4_K_M",
  fileName: "qwen.gguf",
  bytes: 8,
  sha256: "b".repeat(64),
  runtimeVersion: "0.12.9",
};
// Catches replacing the saved path or leaving a partial file when native copy fails.
test("failed_install_preserves_previous_model", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-files-"));
  const { db, close } = openTestDb();
  const adapter = {
    initialize: async () => dir,
    exists: async () => true,
    remove: async (path: string) => {
      await rm(path, { force: true });
    },
    cancelCopy: async () => {},
    copyVerified: async (_uri: string, destination: string) => {
      await writeFile(destination, "GGUF"); // Error after first block.
      throw new Error("Disk full after first block");
    },
  };
  try {
    await db.exec(
      "CREATE TABLE local_model(id INTEGER PRIMARY KEY, path TEXT NOT NULL, manifest TEXT NOT NULL)",
    );
    const previous = join(dir, "previous.gguf");
    await writeFile(previous, "previous valid bytes");
    await db.run("INSERT INTO local_model VALUES(1,?,?)", [
      previous,
      JSON.stringify(manifest),
    ]);
    const files = new ModelFiles(db, adapter);
    await expect(
      files.install("content://broken", manifest, new AbortController().signal),
    ).rejects.toMatchObject({ code: "STORAGE" });
    expect(await files.installedPath()).toBe(previous);
    expect(await readdir(dir)).toEqual(["previous.gguf"]);
    expect(await readFile(previous, "utf8")).toBe("previous valid bytes");
  } finally {
    close();
    await rm(dir, { recursive: true, force: true });
  }
});

// Catches switching the saved model after cancellation races with native success.
test("cancelled_install_keeps_previous_path_and_cleans_new_file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-cancel-"));
  const { db, close } = openTestDb();
  const abort = new AbortController();
  let cancelled = false;
  const adapter = {
    initialize: async () => dir,
    exists: async () => true,
    remove: async (path: string) => {
      await rm(path, { force: true });
    },
    cancelCopy: async () => {
      cancelled = true;
    },
    copyVerified: async (_uri: string, destination: string) => {
      await writeFile(destination, "GGUFtest");
      abort.abort();
      return destination;
    },
  };
  try {
    const files = new ModelFiles(db, adapter);
    await expect(
      files.install("content://cancel", manifest, abort.signal),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(await files.installedPath()).toBeNull();
    expect(await readdir(dir)).toEqual([]);
    expect(cancelled).toBe(true);
  } finally {
    close();
    await rm(dir, { recursive: true, force: true });
  }
});

// Catches accepting an unbounded/malformed checksum or incompatible runtime contract.
test.each([
  { ...manifest, bytes: -1 },
  { ...manifest, sha256: "../escape" },
  { ...manifest, runtimeVersion: "9.0.0" },
])("rejects_invalid_manifest_before_copy %j", async (invalid) => {
  const { db, close } = openTestDb();
  let copied = false;
  const files = new ModelFiles(db, {
    initialize: async () => "/models",
    exists: async () => false,
    remove: async () => {},
    cancelCopy: async () => {},
    copyVerified: async () => {
      copied = true;
      return "/models/new";
    },
  });
  try {
    await expect(
      files.install("file:///qwen.gguf", invalid, new AbortController().signal),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(copied).toBe(false);
  } finally {
    close();
  }
});

// Catches publishing a checksum-valid GGUF whose runtime metadata is incompatible.
test("invalid_runtime_metadata_preserves_previous_model", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-metadata-"));
  const { db, close } = openTestDb();
  const adapter = {
    initialize: async () => dir,
    exists: async () => true,
    remove: async (path: string) => {
      await rm(path, { force: true });
    },
    cancelCopy: async () => {},
    copyVerified: async (_uri: string, destination: string) => {
      await writeFile(destination, "GGUFtest");
      return destination;
    },
  };
  try {
    const files = new ModelFiles(db, adapter, async () => {
      throw Error("Wrong architecture");
    });
    await expect(
      files.install(
        "file:///wrong.gguf",
        manifest,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "STORAGE" });
    expect(await files.installedPath()).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  } finally {
    close();
    await rm(dir, { recursive: true, force: true });
  }
});

// Supplementary commit regression using a real SQLite abort trigger.
test("database_publish_failure_removes_new_copy", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-db-fail-"));
  const { db, close } = openTestDb();
  const adapter = {
    initialize: async () => dir,
    exists: async () => true,
    remove: async (path: string) => {
      await rm(path, { force: true });
    },
    cancelCopy: async () => {},
    copyVerified: async (_uri: string, destination: string) => {
      await writeFile(destination, "GGUFtest");
      return destination;
    },
  };
  try {
    const files = new ModelFiles(db, adapter);
    const previous = await files.install(
      "file:///qwen.gguf",
      manifest,
      new AbortController().signal,
    );
    await db.exec(
      "CREATE TRIGGER block_model BEFORE UPDATE ON local_model BEGIN SELECT RAISE(ABORT,'disk error'); END",
    );
    await expect(
      files.install(
        "file:///qwen.gguf",
        manifest,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "STORAGE" });
    expect(await files.installedPath()).toBe(previous);
    expect((await readdir(dir)).length).toBe(1);
  } finally {
    close();
    await rm(dir, { recursive: true, force: true });
  }
});
