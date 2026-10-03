import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Catches fabricated size/checksum metadata rather than hashing the actual GGUF.
test("manifest_records_real_bytes_and_sha256", () => {
  const dir = mkdtempSync(join(tmpdir(), "manifest-"));
  try {
    const model = join(dir, "qwen.gguf"),
      manifest = join(dir, "manifest.json");
    writeFileSync(model, Buffer.from([71, 71, 85, 70, 3, 0, 0, 0]));
    execFileSync(process.execPath, [
      "scripts/model-manifest.mjs",
      model,
      "70d244cc86ccca08cf5af4e1e306ecf908b1ad5e",
      manifest,
    ]);
    expect(JSON.parse(readFileSync(manifest, "utf8"))).toMatchObject({
      bytes: 8,
      sha256:
        "527ee9a8eac07fc69af277c264ea5bf5c0f037c442b5c3336c18aa10d2096bd6",
      runtimeVersion: "0.12.9",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
