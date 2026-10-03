#!/usr/bin/env python3
"""Prepare the candidate from official weights; outputs must stay outside Git."""
import argparse
import json
import pathlib
import subprocess
import sys

SOURCE_REVISION = "70d244cc86ccca08cf5af4e1e306ecf908b1ad5e"
LLAMA_REVISION = "6c8dcaa7ae41fa9f4aa2b3b68ee82cb8b2a03632"  # b10256


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", type=pathlib.Path, required=True)
    parser.add_argument("--llama-dir", type=pathlib.Path, required=True)
    parser.add_argument("--quantizer", type=pathlib.Path, required=True)
    parser.add_argument("--node", default="node")
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    work = args.work_dir.resolve()
    llama = args.llama_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    revision = subprocess.check_output(["git", "-C", str(llama), "rev-parse", "HEAD"], text=True).strip()
    if revision != LLAMA_REVISION:
        raise ValueError("Expected unmodified llama.cpp b10256 at " + LLAMA_REVISION)
    if subprocess.check_output(["git", "-C", str(llama), "status", "--porcelain"], text=True).strip():
        raise ValueError("Converter checkout has local changes")
    from huggingface_hub import snapshot_download
    source = work / "source"
    if not args.offline:
        snapshot_download("Qwen/Qwen3-1.7B", revision=SOURCE_REVISION,
                          local_dir=source, cache_dir=work / "hf-cache",
                          allow_patterns=["*.json", "*.safetensors", "*.txt", "LICENSE"])
        (work / "source-revision.json").write_text(json.dumps({"repo": "Qwen/Qwen3-1.7B", "revision": SOURCE_REVISION}) + "\n")
    else:
        receipt = json.loads((work / "source-revision.json").read_text())
        if receipt["revision"] != SOURCE_REVISION:
            raise ValueError("Offline source revision is not verified")
    f16 = work / "Qwen3-1.7B-F16.gguf"
    q4 = work / "Qwen3-1.7B-Q4_K_M.gguf"
    subprocess.run([sys.executable, str(llama / "convert_hf_to_gguf.py"), str(source),
                    "--outfile", str(f16), "--outtype", "f16"], check=True)
    subprocess.run([str(args.quantizer.resolve()), str(f16), str(q4), "Q4_K_M"], check=True)
    script = pathlib.Path(__file__).with_name("model-manifest.mjs")
    subprocess.run([args.node, str(script), str(q4), SOURCE_REVISION, str(work / "model-manifest.json")], check=True)


if __name__ == "__main__":
    main()
