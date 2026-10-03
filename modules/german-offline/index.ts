import { requireNativeModule } from "expo-modules-core";
import type { LocalFileAdapter } from "../../src/features/assistant/modelFiles";
export type CopyProgress = {
  requestId: string;
  copiedBytes: number;
  totalBytes: number;
};
type NativeFiles = Omit<LocalFileAdapter, "subscribeProgress"> & {
  readText(uri: string): Promise<string>;
  addListener(
    event: "copyProgress",
    listener: (progress: CopyProgress) => void,
  ): { remove(): void };
};
// Lazy resolution keeps dictionary/profiles usable if the optional model module fails.
export function localFiles(): LocalFileAdapter & {
  readText(uri: string): Promise<string>;
} {
  const native = requireNativeModule<NativeFiles>("GermanOfflineFiles");
  return {
    initialize: () => native.initialize(),
    exists: (path) => native.exists(path),
    remove: (path) => native.remove(path),
    copyVerified: (...args) => native.copyVerified(...args),
    cancelCopy: (id) => native.cancelCopy(id),
    readText: (uri) => native.readText(uri),
    subscribeProgress: (listener) =>
      native.addListener("copyProgress", listener),
  };
}
