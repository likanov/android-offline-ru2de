import { AppError } from "../../core/errors";
import type { SqlStore } from "../../core/sql";
import type { ModelManifest } from "./runtimeTypes";
export interface LocalFileAdapter {
  initialize(): Promise<string>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  copyVerified(
    uri: string,
    destination: string,
    expectedBytes: number,
    expectedSha256: string,
    requestId: string,
  ): Promise<string>;
  cancelCopy(requestId: string): Promise<void>;
  subscribeProgress?(
    listener: (progress: {
      requestId: string;
      copiedBytes: number;
      totalBytes: number;
    }) => void,
  ): { remove(): void };
}
export class ModelFiles {
  private ready?: Promise<string>;
  private installing = false;
  constructor(
    private readonly db: SqlStore,
    private readonly adapter: LocalFileAdapter,
    private readonly validate?: (path: string) => Promise<void>,
  ) {}
  private initialize(): Promise<string> {
    return (this.ready ??= (async () => {
      await this.db.exec(
        "CREATE TABLE IF NOT EXISTS local_model(id INTEGER PRIMARY KEY CHECK(id=1), path TEXT NOT NULL, manifest TEXT NOT NULL)",
      );
      return this.adapter.initialize();
    })());
  }
  async installedPath(): Promise<string | null> {
    await this.initialize();
    const row = await this.db.first<{ path: string }>(
      "SELECT path FROM local_model WHERE id=1",
    );
    return row && (await this.adapter.exists(row.path)) ? row.path : null;
  }
  async install(
    uri: string,
    manifest: ModelManifest,
    signal: AbortSignal,
  ): Promise<string> {
    if (signal.aborted) throw new AppError("CANCELLED", "Установка отменена");
    if (
      !manifest ||
      !Number.isSafeInteger(manifest.bytes) ||
      manifest.bytes < 8 ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      !/^[a-f0-9]{40}$/.test(manifest.sourceRevision) ||
      manifest.runtimeVersion !== "0.12.9" ||
      manifest.quantization !== "Q4_K_M" ||
      !manifest.id ||
      !manifest.fileName ||
      !/^(content|file):/.test(uri)
    )
      throw new AppError("VALIDATION", "Неверный файл описания модели");
    if (this.installing)
      throw new AppError("BUSY", "Установка уже выполняется");
    this.installing = true;
    let destination: string | undefined;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cancel = () => {
      void this.adapter.cancelCopy(requestId).catch(() => {});
    };
    try {
      const directory = await this.initialize();
      if (signal.aborted) throw new AppError("CANCELLED", "Установка отменена");
      destination = `${directory}/${manifest.sha256}-${requestId}.gguf`;
      signal.addEventListener("abort", cancel);
      const path = await this.adapter.copyVerified(
        uri,
        destination,
        manifest.bytes,
        manifest.sha256,
        requestId,
      );
      await this.validate?.(path);
      await this.db.transaction(async (tx) => {
        if (signal.aborted)
          throw new AppError("CANCELLED", "Установка отменена");
        await tx.run(
          "INSERT INTO local_model(id,path,manifest) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET path=excluded.path,manifest=excluded.manifest",
          [path, JSON.stringify(manifest)],
        );
        if (signal.aborted)
          throw new AppError("CANCELLED", "Установка отменена");
      });
      return path;
    } catch (error) {
      if (destination) await this.adapter.remove(destination).catch(() => {});
      if (
        signal.aborted ||
        (error instanceof AppError && error.code === "CANCELLED")
      )
        throw new AppError("CANCELLED", "Установка отменена", error);
      throw new AppError(
        "STORAGE",
        "Не удалось установить локальную модель",
        error,
      );
    } finally {
      signal.removeEventListener("abort", cancel);
      this.installing = false;
    }
  }
}
