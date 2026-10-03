import React from "react";
import { AppState } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { ModelSetupScreen } from "../../src/features/assistant/ModelSetupScreen";
// Catches loading the context before verified installation and losing cancellation UI.
test("installs_local_selection_then_loads_and_shows_ready", async () => {
  let installed = false;
  let loaded = false;
  render(
    <ModelSetupScreen
      services={{
        files: {
          installedPath: async () => null,
          install: async (uri: string) => {
            if (uri !== "content://selected-model") throw Error("wrong source");
            installed = true;
            return "/models/verified.gguf";
          },
        },
        runtime: {
          generate: async () => "",
          load: async (path: string) => {
            if (!installed || path !== "/models/verified.gguf")
              throw Error("unverified model");
            loaded = true;
          },
          release: async () => {},
          cancel: async () => {},
        },
        chooseManifest: async () => ({
          id: "qwen3",
          sourceRevision: "a".repeat(40),
          quantization: "Q4_K_M",
          fileName: "qwen.gguf",
          bytes: 8,
          sha256: "b".repeat(64),
          runtimeVersion: "0.12.9",
        }),
        chooseModel: async () => "content://selected-model",
      }}
    />,
  );
  fireEvent.press(
    await screen.findByRole("button", { name: "Выбрать описание модели" }),
  );
  await screen.findByText("Описание: qwen3");
  fireEvent.press(screen.getByRole("button", { name: "Выбрать файл GGUF" }));
  await screen.findByText("Модель готова. Интернет не требуется.");
  expect(loaded).toBe(true);
});

// Android SAF opens another Activity. Catches treating document selection as an active copy.
test("system_picker_background_does_not_cancel_selected_install", async () => {
  let lifecycle!: (state: import("react-native").AppStateStatus) => void;
  const event = jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, listener) => {
      lifecycle = listener;
      return { remove: () => {} };
    });
  let installed = false;
  try {
    render(
      <ModelSetupScreen
        services={{
          files: {
            installedPath: async () => null,
            install: async (_uri, _manifest, signal) => {
              if (signal.aborted)
                throw Error("Picker incorrectly cancelled installation");
              installed = true;
              return "/models/verified.gguf";
            },
          },
          runtime: {
            generate: async () => "",
            load: async () => {},
            release: async () => {},
            cancel: async () => {},
          },
          chooseManifest: async () => ({
            id: "qwen3",
            sourceRevision: "a".repeat(40),
            quantization: "Q4_K_M",
            fileName: "qwen.gguf",
            bytes: 8,
            sha256: "b".repeat(64),
            runtimeVersion: "0.12.9",
          }),
          chooseModel: async () => {
            lifecycle("background");
            lifecycle("active");
            return "content://selected-model";
          },
        }}
      />,
    );
    fireEvent.press(
      await screen.findByRole("button", { name: "Выбрать описание модели" }),
    );
    await screen.findByText("Описание: qwen3");
    fireEvent.press(screen.getByRole("button", { name: "Выбрать файл GGUF" }));
    await screen.findByText("Модель готова. Интернет не требуется.");
    expect(installed).toBe(true);
  } finally {
    event.mockRestore();
  }
});
