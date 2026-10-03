import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { open, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
const [file, revision, output] = process.argv.slice(2);
if (!file || !output || !/^[a-f0-9]{40}$/.test(revision ?? ""))
  throw Error(
    "Usage: node scripts/model-manifest.mjs MODEL.gguf SOURCE_REVISION OUTPUT.json",
  );
const handle = await open(file, "r");
const header = Buffer.alloc(8);
try {
  await handle.read(header, 0, 8, 0);
} finally {
  await handle.close();
}
if (header.toString("ascii", 0, 4) !== "GGUF" || header.readUInt32LE(4) !== 3)
  throw Error("Expected GGUF v3");
const hash = createHash("sha256");
for await (const chunk of createReadStream(file)) hash.update(chunk);
const manifest = {
  id: "Qwen3-1.7B-Q4_K_M",
  sourceRevision: revision,
  quantization: "Q4_K_M",
  fileName: basename(file),
  bytes: (await stat(file)).size,
  sha256: hash.digest("hex"),
  runtimeVersion: "0.12.9",
};
await writeFile(output, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest));
