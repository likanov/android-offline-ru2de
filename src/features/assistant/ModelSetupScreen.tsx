import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Text } from "react-native";
import { useAppServices, getAssistantServices } from "../../app/AppServices";
import { AppError } from "../../core/errors";
import { Button } from "../../ui/Button";
import { Screen } from "../../ui/Screen";
import type { ModelFiles } from "./modelFiles";
import type { LanguageRuntime, ModelManifest } from "./runtimeTypes";
export type SetupServices = {
  files: Pick<ModelFiles, "installedPath" | "install">;
  runtime: LanguageRuntime;
  chooseManifest(): Promise<ModelManifest | null>;
  chooseModel(): Promise<string | null>;
  subscribeProgress?: (
    listener: (event: { copiedBytes: number; totalBytes: number }) => void,
  ) => { remove(): void };
};
export function ModelSetupScreen({ services }: { services?: SetupServices }) {
  return services ? <Setup services={services} /> : <ConnectedSetup />;
}
function ConnectedSetup() {
  const app = useAppServices();
  const services = useMemo(() => getAssistantServices(app), [app]);
  return <Setup services={services} />;
}
function Setup({ services }: { services: SetupServices }) {
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const [installed, setInstalled] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Выберите локальные описание JSON и файл GGUF.",
  );
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void services.files
      .installedPath()
      .then((path) => {
        if (mounted.current) {
          setInstalled(path);
          if (path)
            setStatus("Модель установлена. Можно загрузить её в память.");
        }
      })
      .catch(() => {
        if (mounted.current)
          setStatus("Не удалось проверить установленную модель.");
      });
    const subscription = services.subscribeProgress?.(
      ({ copiedBytes, totalBytes }) => {
        if (mounted.current && abort.current && !abort.current.signal.aborted)
          setStatus(
            `Копирование: ${Math.floor((copiedBytes / totalBytes) * 100)}%`,
          );
      },
    );
    const background = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        abort.current?.abort();
        void services.runtime.release().catch(() => {});
        if (mounted.current)
          setStatus("Модель освобождена. Загрузите её перед использованием.");
      }
    });
    return () => {
      mounted.current = false;
      abort.current?.abort();
      subscription?.remove();
      background.remove();
      void services.runtime.release().catch(() => {});
    };
  }, [services]);
  const report = (error: unknown) => {
    if (mounted.current)
      setStatus(
        error instanceof AppError && error.code === "CANCELLED"
          ? "Операция отменена."
          : error instanceof Error
            ? error.message
            : "Не удалось открыть модель.",
      );
  };
  const chooseManifest = async () => {
    try {
      const selected = await services.chooseManifest();
      if (mounted.current && selected) setManifest(selected);
    } catch (error) {
      report(error);
    }
  };
  const run = async (install: boolean) => {
    const controller = new AbortController();
    setBusy(true);
    try {
      let path = installed;
      if (install) {
        const uri = await services.chooseModel();
        if (!uri || !manifest || !mounted.current) return;
        abort.current = controller;
        if (controller.signal.aborted)
          throw new AppError("CANCELLED", "Операция отменена");
        setStatus("Проверка и копирование модели…");
        path = await services.files.install(uri, manifest, controller.signal);
        if (mounted.current) setInstalled(path);
      }
      abort.current = controller;
      if (!path || controller.signal.aborted)
        throw new AppError("CANCELLED", "Операция отменена");
      if (mounted.current) setStatus("Загрузка модели в память…");
      await services.runtime.load(path);
      if (controller.signal.aborted) {
        await services.runtime.release();
        throw new AppError("CANCELLED", "Операция отменена");
      }
      if (mounted.current) setStatus("Модель готова. Интернет не требуется.");
    } catch (error) {
      report(error);
    } finally {
      abort.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Screen>
      <Text accessibilityRole="header">Локальная модель</Text>
      <Text>
        Помощник работает на устройстве. Файл модели подготовьте на компьютере и
        перенесите в телефон.
      </Text>
      <Text accessibilityLiveRegion="polite">{status}</Text>
      {manifest && <Text>Описание: {manifest.id}</Text>}
      <Button
        title="Выбрать описание модели"
        disabled={busy}
        onPress={() => {
          void chooseManifest();
        }}
      />
      <Button
        title="Выбрать файл GGUF"
        disabled={busy || !manifest}
        onPress={() => {
          void run(true);
        }}
      />
      {installed && (
        <Button
          title="Загрузить установленную модель"
          disabled={busy}
          onPress={() => {
            void run(false);
          }}
        />
      )}
      {busy && (
        <Button
          title="Отменить"
          onPress={() => {
            abort.current?.abort();
            void services.runtime.release().catch(report);
          }}
        />
      )}
    </Screen>
  );
}
