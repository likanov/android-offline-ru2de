import { AppError } from "../../core/errors";
import type { GenerationRequest, LanguageRuntime } from "./runtimeTypes";
export interface RuntimeContext {
  completion(
    params: {
      messages: GenerationRequest["messages"];
      n_predict: number;
      jinja: boolean;
      enable_thinking: boolean;
    },
    onToken?: (data: { token: string }) => void,
  ): Promise<{ text: string }>;
  stopCompletion(): Promise<void>;
  release(): Promise<void>;
}
export type ContextFactory = (params: {
  model: string;
  n_ctx: number;
  n_gpu_layers: number;
  n_threads: number;
}) => Promise<RuntimeContext>;
export class LlamaRuntime implements LanguageRuntime {
  private context?: RuntimeContext;
  private epoch = 0;
  private loading = false;
  private draining?: Promise<void>;
  private active?: { cancelled: boolean; done: Promise<void> };
  private idle?: ReturnType<typeof setTimeout>;
  constructor(private readonly factory: ContextFactory) {}
  private clearIdle() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = undefined;
  }
  private armIdle() {
    this.clearIdle();
    if (this.context) {
      this.idle = setTimeout(
        () => {
          void this.release().catch(() => {});
        },
        5 * 60 * 1000,
      );
      this.idle.unref?.();
    }
  }
  async load(path: string): Promise<void> {
    if (this.loading) throw new AppError("BUSY", "Модель уже загружается");
    this.loading = true;
    try {
      const ticket = ++this.epoch;
      if (this.context || this.active || this.draining)
        await this.disposeContext();
      if (ticket !== this.epoch)
        throw new AppError("CANCELLED", "Загрузка отменена");
      const context = await this.factory({
        model: path,
        n_ctx: 2048,
        n_gpu_layers: 0,
        n_threads: 2,
      });
      if (ticket !== this.epoch) {
        await context.release();
        throw new AppError("CANCELLED", "Загрузка отменена");
      }
      this.context = context;
      this.armIdle();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("MODEL", "Не удалось загрузить GGUF модель", error);
    } finally {
      this.loading = false;
    }
  }
  async generate(
    request: GenerationRequest,
    signal: AbortSignal,
    onText: (text: string) => void,
  ): Promise<string> {
    if (signal.aborted) throw new AppError("CANCELLED", "Запрос отменён");
    if (this.active || this.loading)
      throw new AppError("BUSY", "Помощник занят");
    const context = this.context;
    if (!context) throw new AppError("MODEL", "Сначала загрузите модель");
    if (
      !Number.isFinite(request.maxTokens) ||
      request.maxTokens < 1 ||
      !request.messages.length
    )
      throw new AppError("VALIDATION", "Пустой запрос");
    this.clearIdle();
    let finish!: () => void;
    const active = {
      cancelled: false,
      done: new Promise<void>((resolve) => {
        finish = resolve;
      }),
    };
    this.active = active;
    const cancel = () => {
      active.cancelled = true;
      void context.stopCompletion().catch(() => {});
    };
    signal.addEventListener("abort", cancel);
    try {
      const result = await context.completion(
        {
          messages: request.messages,
          n_predict: Math.min(512, Math.floor(request.maxTokens)),
          jinja: true,
          enable_thinking: false,
        },
        ({ token }) => {
          if (!signal.aborted && !active.cancelled) onText(token);
        },
      );
      if (signal.aborted || active.cancelled)
        throw new AppError("CANCELLED", "Запрос отменён");
      return result.text;
    } catch (error) {
      if (signal.aborted || active.cancelled)
        throw new AppError("CANCELLED", "Запрос отменён", error);
      if (error instanceof AppError) throw error;
      throw new AppError("MODEL", "Ошибка локального помощника", error);
    } finally {
      signal.removeEventListener("abort", cancel);
      this.active = undefined;
      finish();
      this.armIdle();
    }
  }
  async cancel(): Promise<void> {
    ++this.epoch;
    if (this.active) this.active.cancelled = true;
    await this.context?.stopCompletion();
  }
  async release(): Promise<void> {
    ++this.epoch;
    await this.disposeContext();
  }
  private disposeContext(): Promise<void> {
    this.clearIdle();
    const context = this.context;
    const active = this.active;
    this.context = undefined;
    if (!context && !active) return this.draining ?? Promise.resolve();
    if (active) active.cancelled = true;
    const dispose = async () => {
      try {
        if (active) {
          try {
            await context?.stopCompletion();
          } finally {
            await active.done;
          }
        }
      } finally {
        await context?.release();
      }
    };
    const pending = this.draining ? this.draining.then(dispose) : dispose();
    this.draining = pending;
    return pending.finally(() => {
      if (this.draining === pending) this.draining = undefined;
    });
  }
}
export function createLlamaRuntime(): LlamaRuntime {
  return new LlamaRuntime(async (params) => {
    const { initLlama } = await import("llama.rn");
    await inspectModel(params.model);
    return initLlama(params);
  });
}

export function validateModelMetadata(info: Record<string, unknown>): void {
  if (
    info["general.architecture"] !== "qwen3" ||
    Number(info["general.file_type"]) !== 15 ||
    typeof info["tokenizer.chat_template"] !== "string" ||
    !info["tokenizer.chat_template"]
  )
    throw new AppError("MODEL", "Нужна Qwen3 Q4_K_M с шаблоном диалога");
}
export async function inspectModel(path: string): Promise<void> {
  const { loadLlamaModelInfo } = await import("llama.rn");
  validateModelMetadata(
    (await loadLlamaModelInfo(path)) as Record<string, unknown>,
  );
}
