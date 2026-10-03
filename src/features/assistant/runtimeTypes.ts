export type ModelManifest = {
  id: string;
  sourceRevision: string;
  quantization: string;
  fileName: string;
  bytes: number;
  sha256: string;
  runtimeVersion: string;
};
export type GenerationRequest = {
  requestId: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  maxTokens: number;
};
export interface LanguageRuntime {
  load(path: string): Promise<void>;
  generate(
    request: GenerationRequest,
    signal: AbortSignal,
    onText: (text: string) => void,
  ): Promise<string>;
  cancel(): Promise<void>;
  release(): Promise<void>;
}
