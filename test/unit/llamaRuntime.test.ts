import {
  LlamaRuntime,
  validateModelMetadata,
} from "../../src/features/assistant/llamaRuntime";
const request = {
  requestId: "second",
  messages: [{ role: "user" as const, content: "Ein Satz" }],
  maxTokens: 256,
};
// Catches returning stale text or emitting callbacks for an already aborted request.
test("cancel_does_not_leak_previous_result", async () => {
  const runtime = new LlamaRuntime(async () => ({
    completion: async () => ({ text: "previous result" }),
    stopCompletion: async () => {},
    release: async () => {},
  }));
  await runtime.load("/models/qwen.gguf");
  await runtime.generate(
    { ...request, requestId: "first" },
    new AbortController().signal,
    () => {},
  );
  const abort = new AbortController();
  abort.abort();
  const received: string[] = [];
  await expect(
    runtime.generate(request, abort.signal, (text: string) =>
      received.push(text),
    ),
  ).rejects.toMatchObject({ code: "CANCELLED" });
  expect(received).toEqual([]);
});

// Catches streamed late tokens/result escaping after an in-flight abort.
test("in_flight_abort_suppresses_late_tokens_and_result", async () => {
  const abort = new AbortController();
  const tokens: string[] = [];
  let stopped = false;
  const runtime = new LlamaRuntime(async () => ({
    completion: async (_params, onToken) => {
      onToken?.({ token: "Hallo" });
      abort.abort();
      onToken?.({ token: "stale" });
      return { text: "Hallo stale" };
    },
    stopCompletion: async () => {
      stopped = true;
    },
    release: async () => {},
  }));
  await runtime.load("/models/qwen.gguf");
  await expect(
    runtime.generate(request, abort.signal, (text) => tokens.push(text)),
  ).rejects.toMatchObject({ code: "CANCELLED" });
  expect(tokens).toEqual(["Hallo"]);
  expect(stopped).toBe(true);
});

// Catches native context leaks when release/background races with initialization.
test("release_during_load_releases_late_context", async () => {
  let finish!: (context: any) => void;
  let released = false;
  const runtime = new LlamaRuntime(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const loading = runtime.load("/models/qwen.gguf");
  const expectation = expect(loading).rejects.toMatchObject({
    code: "CANCELLED",
  });
  await runtime.release();
  finish({
    completion: async () => ({ text: "bad" }),
    stopCompletion: async () => {},
    release: async () => {
      released = true;
    },
  });
  await expectation;
  expect(released).toBe(true);
});

// Catches accidentally enabling GPU/thinking or dropping the measured CPU settings/token cap.
test("uses_cpu_settings_and_caps_output_at_512", async () => {
  let init: unknown;
  let params: unknown;
  const runtime = new LlamaRuntime(async (options) => {
    init = options;
    return {
      completion: async (options) => {
        params = options;
        return { text: "Ein Satz" };
      },
      stopCompletion: async () => {},
      release: async () => {},
    };
  });
  await runtime.load("/models/qwen.gguf");
  expect(init).toEqual({
    model: "/models/qwen.gguf",
    n_ctx: 2048,
    n_gpu_layers: 0,
    n_threads: 2,
  });
  expect(
    await runtime.generate(
      { ...request, maxTokens: 10000 },
      new AbortController().signal,
      () => {},
    ),
  ).toBe("Ein Satz");
  expect(params).toMatchObject({
    n_predict: 512,
    jinja: true,
    enable_thinking: false,
  });
  await runtime.release();
});

// Catches trusting a valid GGUF header while accepting a different architecture/quantization.
test.each([
  {
    "general.architecture": "llama",
    "general.file_type": 15,
    "tokenizer.chat_template": "template",
  },
  {
    "general.architecture": "qwen3",
    "general.file_type": 7,
    "tokenizer.chat_template": "template",
  },
  { "general.architecture": "qwen3", "general.file_type": 15 },
])("rejects_incompatible_model_metadata %j", async (metadata) => {
  expect(() => validateModelMetadata(metadata)).toThrow();
});

// Catches a foreground load resurrecting a context after background release while the old context is draining.
test("release_while_replacing_model_cancels_replacement", async () => {
  let finishRelease!: () => void;
  let factoryCalls = 0;
  const runtime = new LlamaRuntime(async () => {
    ++factoryCalls;
    return {
      completion: async () => ({ text: "text" }),
      stopCompletion: async () => {},
      release: () =>
        new Promise<void>((resolve) => {
          finishRelease = resolve;
        }),
    };
  });
  await runtime.load("/models/old.gguf");
  const replacement = runtime.load("/models/new.gguf");
  const expected = expect(replacement).rejects.toMatchObject({
    code: "CANCELLED",
  });
  const releasing = runtime.release();
  finishRelease();
  await releasing;
  await expected;
  expect(factoryCalls).toBe(1);
});

// Supplementary lifecycle regression: a forgotten idle timer would retain native memory.
test("releases_context_after_five_minutes_idle", async () => {
  jest.useFakeTimers();
  let released = false;
  const runtime = new LlamaRuntime(async () => ({
    completion: async () => ({ text: "ok" }),
    stopCompletion: async () => {},
    release: async () => {
      released = true;
    },
  }));
  try {
    await runtime.load("/models/qwen.gguf");
    jest.advanceTimersByTime(299999);
    await Promise.resolve();
    expect(released).toBe(false);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(released).toBe(true);
    await expect(
      runtime.generate(request, new AbortController().signal, () => {}),
    ).rejects.toMatchObject({ code: "MODEL" });
  } finally {
    await runtime.release();
    jest.useRealTimers();
  }
});

// Supplementary serialization regression: never allow overlapping native contexts.
test("rejects_a_second_generation_until_cancelled_native_work_finishes", async () => {
  let finish!: (result: { text: string }) => void;
  const runtime = new LlamaRuntime(async () => ({
    completion: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    stopCompletion: async () => {},
    release: async () => {},
  }));
  await runtime.load("/models/qwen.gguf");
  const first = runtime.generate(
    request,
    new AbortController().signal,
    () => {},
  );
  const cancelled = expect(first).rejects.toMatchObject({ code: "CANCELLED" });
  await runtime.cancel();
  await expect(
    runtime.generate(
      { ...request, requestId: "overlap" },
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toMatchObject({ code: "BUSY" });
  finish({ text: "discard me" });
  await cancelled;
  await runtime.release();
});

// Catches two native contexts overlapping when a foreground reload races with background disposal.
test("load_waits_for_releasing_context", async () => {
  let finishRelease!: () => void;
  let factoryCalls = 0;
  const runtime = new LlamaRuntime(async () => {
    ++factoryCalls;
    return {
      completion: async () => ({ text: "text" }),
      stopCompletion: async () => {},
      release:
        factoryCalls === 1
          ? () =>
              new Promise<void>((resolve) => {
                finishRelease = resolve;
              })
          : async () => {},
    };
  });
  await runtime.load("/models/old.gguf");
  const releasing = runtime.release();
  const loading = runtime.load("/models/new.gguf");
  await Promise.resolve();
  expect(factoryCalls).toBe(1);
  finishRelease();
  await releasing;
  await loading;
  expect(factoryCalls).toBe(2);
  await runtime.release();
});
