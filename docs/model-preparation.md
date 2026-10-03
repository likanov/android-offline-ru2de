# Local Qwen model preparation

The app never downloads a model or calls a network inference service. Prepare the
model on a computer, transfer the GGUF and its JSON manifest into the phone's
Downloads folder, then open **Локальная модель → Выбрать описание модели → Выбрать
файл GGUF**. The system document picker grants access to the selected content URI;
no broad storage permission or JavaScript base64 copy is required.

## Prepared candidate

- Official source: [Qwen/Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B).
- Source revision: `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e`.
- Converter/quantizer: [llama.cpp b10256](https://github.com/ggml-org/llama.cpp/releases/tag/b10256), commit `6c8dcaa7ae41fa9f4aa2b3b68ee82cb8b2a03632`.
- The official macOS ARM64 tools archive was verified against the release's
  SHA-256: `e5cf39e8fef6edcdf81da4748095737d5a2cf8dc20c79e073b4d8606fbdfe7fa`.
- Conversion: official safetensors → GGUF F16 → Q4_K_M. This candidate was actually
  converted and quantized; it is not an assumed official prequantized Q4 download.
- Output: `Qwen3-1.7B-Q4_K_M.gguf`, **1,282,438,944 bytes**.
- SHA-256: `72309900a0aab765e1963ee9ff73aaf5e8c8a754e92c0099d5d55dfca9490f15`.
- Runtime: pinned `llama.rn 0.12.9`, compatible with this native Expo SDK 56 / RN 0.85.3
  build and its New Architecture.
- The small generated manifest is tracked as `docs/model-manifest.json`. Weights,
  F16 intermediates, quantized files and the preparation environment stay outside
  Git under `work/model-preparation/`.

## Reproduce

Use Python 3.12 in an isolated environment, Git, Node 22 and a matching llama.cpp
checkout. The tested environment uses `scripts/requirements-model.txt`; Qwen
conversion succeeded with its pinned torch 2.10.0. The upstream general converter
requirements include newer Torch for other architectures, which was unnecessary
for this verified Qwen conversion.

From the enclosing task directory, not the app directory:

```sh
python3.12 -m venv work/model-preparation/venv
work/model-preparation/venv/bin/python -m pip install -r outputs/german-vocabulary/scripts/requirements-model.txt
git clone --depth 1 --branch b10256 https://github.com/ggml-org/llama.cpp.git work/model-preparation/llama.cpp
```

Download the official b10256 tools archive for your platform, verify its release
checksum, and extract it under `work/model-preparation/`. Alternatively build
`llama-quantize` from that exact checkout with CMake. On macOS ARM64:

```sh
curl -fL https://github.com/ggml-org/llama.cpp/releases/download/b10256/llama-b10256-bin-macos-arm64.tar.gz -o work/model-preparation/llama-tools.tar.gz
shasum -a 256 work/model-preparation/llama-tools.tar.gz
tar -xzf work/model-preparation/llama-tools.tar.gz -C work/model-preparation
work/model-preparation/venv/bin/python outputs/german-vocabulary/scripts/prepare-model.py \
  --work-dir work/model-preparation \
  --llama-dir work/model-preparation/llama.cpp \
  --quantizer work/model-preparation/llama-b10256/llama-quantize \
  --node work/toolchains/node-runtime/node_modules/node/bin/node
```

The script pins the source revision, rejects a changed converter checkout,
records source provenance, converts to F16, quantizes to Q4_K_M, then streams the
actual output through SHA-256 to generate `model-manifest.json`. It requires
roughly 10 GB for the weights/intermediates/output plus the isolated Python tools.
`--offline` reruns conversion using downloaded sources only after checking the
saved source revision receipt. Both online download and the offline preparation
script were exercised for this candidate.

## Installation and lifecycle

Android copies a local `content://` or `file://` URI in 1 MiB chunks, checks free
space for the expected size plus 16 MiB, emits progress, verifies exact length,
GGUFv3 and SHA-256, fsyncs and atomically renames a private temporary file. Model
filenames contain the hash and a unique request suffix. A replacement therefore
cannot overwrite a file still mapped by a native context. JavaScript never holds
the model bytes. JSON descriptions are limited to 64 KiB.

Before changing the SQLite saved model path, llama.rn reads native GGUF metadata.
The candidate must be Qwen3, file type 15 (Q4_K_M), with a chat template. Copy,
metadata, database or cancellation failure retains the previous model path and
removes the new file. `.partial` files left by an interrupted process are removed
when the next model file service initializes. Older complete installed files are
retained intentionally, as they can still be in use; repeated replacements use
additional storage. Automatic complete-version pruning is not implemented.

One native CPU context uses `n_ctx=2048`, `n_gpu_layers=0`, `n_threads=2` and the
model's Jinja chat template with `enable_thinking=false`. Callers request 256
maximum tokens for a short answer or 512 for text; the adapter enforces an absolute
512-token cap. Concurrent generation is rejected. Cancellation stops native
completion and suppresses its late tokens/result. A cancelled native load is
released as soon as initialization returns; llama.rn does not expose an immediate
initialization abort. Contexts are released on leaving setup, backgrounding and
five minutes of idle time. A later consumer must load the installed path again
if the context was released.

Expo Go cannot run this native inference/file module. Build a native APK with
`scripts/toolchain.sh` and the pinned SDK 56 template. No cloud inference, model
network request, vocabulary write, grading or XP operation is present in this
runtime adapter.
