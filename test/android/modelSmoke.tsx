// Test-only native receipt. This entry is embedded only by model-validation.gradle.
import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { registerRootComponent } from "expo";
import { openAppDb } from "../../src/core/sql";
import { migrate } from "../../src/core/migrations";
import { localFiles } from "../../modules/german-offline";
import { ModelFiles } from "../../src/features/assistant/modelFiles";
import {
  createLlamaRuntime,
  inspectModel,
} from "../../src/features/assistant/llamaRuntime";
import manifest from "../../docs/model-manifest.json";
function Smoke() {
  const [status, setStatus] = useState("Running offline model smoke…");
  useEffect(() => {
    void (async () => {
      const runtime = createLlamaRuntime();
      try {
        const db = await openAppDb();
        await migrate(db);
        const adapter = localFiles();
        const files = new ModelFiles(db, adapter, inspectModel);
        const source =
          "file:///data/user/0/com.personal.germanvocabulary/files/incoming.gguf";
        const copyStarted = Date.now();
        const path = await files.install(
          source,
          manifest,
          new AbortController().signal,
        );
        const copyMs = Date.now() - copyStarted;
        let failedInstallPreserved = false;
        try {
          await files.install(
            source,
            { ...manifest, sha256: "0".repeat(64) },
            new AbortController().signal,
          );
        } catch (error) {
          failedInstallPreserved =
            (error as { code: string }).code === "STORAGE" &&
            (await files.installedPath()) === path;
        }
        if (!failedInstallPreserved)
          throw Error("Failed native copy replaced previous model");
        const abort = new AbortController();
        const progress = adapter.subscribeProgress?.(() => abort.abort());
        let cancelledInstallPreserved = false;
        try {
          await files.install(source, manifest, abort.signal);
        } catch (error) {
          cancelledInstallPreserved =
            (error as { code: string }).code === "CANCELLED" &&
            (await files.installedPath()) === path;
        } finally {
          progress?.remove();
        }
        if (!cancelledInstallPreserved)
          throw Error("Cancelled native copy replaced previous model");
        const { loadLlamaModelInfo } = await import("llama.rn");
        const metadata = (await loadLlamaModelInfo(path)) as Record<
          string,
          unknown
        >;
        const loadStarted = Date.now();
        await runtime.load(path);
        const loadMs = Date.now() - loadStarted;
        const started = Date.now();
        const tokens: string[] = [];
        const text = await runtime.generate(
          {
            requestId: "native-smoke",
            messages: [
              {
                role: "system",
                content:
                  "You are a German tutor. Reply with one short German sentence and its Russian translation. Do not include explanations.",
              },
              {
                role: "user",
                content:
                  "Write a simple German sentence about a house, then translate it into Russian.",
              },
            ],
            maxTokens: 256,
          },
          new AbortController().signal,
          (token) => tokens.push(token),
        );
        const responseMs = Date.now() - started;
        if (!text.trim() || tokens.length === 0)
          throw Error("No real streamed generation");
        const cancelled = new AbortController();
        cancelled.abort();
        let cancelledResultRejected = false;
        try {
          await runtime.generate(
            {
              requestId: "cancelled-smoke",
              messages: [{ role: "user", content: "Hallo" }],
              maxTokens: 256,
            },
            cancelled.signal,
            () => {
              throw Error("Late cancelled callback");
            },
          );
        } catch (error) {
          cancelledResultRejected =
            (error as { code: string }).code === "CANCELLED";
        }
        await runtime.release();
        const receipt = {
          status: "PASS",
          model: manifest,
          copyMs,
          loadMs,
          responseMs,
          text,
          streamedTokens: tokens.length,
          architecture: metadata["general.architecture"],
          fileType: metadata["general.file_type"],
          failedInstallPreserved,
          cancelledInstallPreserved,
          cancelledResultRejected,
        };
        console.log("MODEL_SMOKE " + JSON.stringify(receipt));
        setStatus(JSON.stringify(receipt));
      } catch (error) {
        await runtime.release().catch(() => {});
        console.error(
          "MODEL_SMOKE " +
            JSON.stringify({
              status: "FAIL",
              error: String(error),
              stack: error instanceof Error ? error.stack : "",
            }),
        );
        setStatus(String(error));
      }
    })();
  }, []);
  return <Text style={{ margin: 48 }}>{status}</Text>;
}
registerRootComponent(Smoke);
