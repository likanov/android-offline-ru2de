#!/bin/sh
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TASK_ROOT=$(CDPATH= cd -- "$APP_ROOT/../.." && pwd)
AVD_ROOT="$TASK_ROOT/work/android-regression/avd"
ANDROID_AVD_HOME="$AVD_ROOT"
ANDROID_USER_HOME="$TASK_ROOT/work/android-regression/android-user"
export ANDROID_AVD_HOME ANDROID_USER_HOME
ABI=$(node -p 'process.arch === "arm64" ? "arm64-v8a" : process.arch === "x64" ? "x86_64" : "unsupported"')
if [ "$ABI" = unsupported ]; then echo HOST_ABI_UNSUPPORTED >&2; exit 2; fi
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
IMAGE="system-images;android-36;google_apis;$ABI"
if [ ! -d "$SDK/system-images/android-36/google_apis/$ABI" ]; then
  echo "SYSTEM_IMAGE_MISSING: $IMAGE; install explicitly with sdkmanager before retrying" >&2; exit 2
fi
if [ ! -x "$SDK/cmdline-tools/latest/bin/avdmanager" ]; then echo 'AVDMANAGER_MISSING' >&2; exit 2; fi
mkdir -p "$AVD_ROOT" "$ANDROID_USER_HOME"
NAME=GermanVocabulary_API36
if [ "${1:-}" = '--upgrade' ]; then NAME=GermanVocabulary_API36_Upgrade; fi
if [ ! -f "$AVD_ROOT/$NAME.ini" ]; then
  printf 'no\n' | "$SDK/cmdline-tools/latest/bin/avdmanager" create avd -n "$NAME" -k "$IMAGE" -p "$AVD_ROOT/$NAME.avd" --device pixel_9_pro_xl
fi
CONFIG="$AVD_ROOT/$NAME.avd/config.ini"
python3 - "$CONFIG" "$ABI" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); rows=dict(line.split('=',1) for line in p.read_text().splitlines() if '=' in line)
rows.update({'hw.ramSize':'8192','disk.dataPartition.size':'12G','hw.lcd.width':'1080','hw.lcd.height':'1920','hw.lcd.density':'480','hw.audioInput':'yes','hw.audioOutput':'yes','abi.type':sys.argv[2],'showDeviceFrame':'yes','fastboot.forceColdBoot':'yes','fastboot.forceFastBoot':'no'})
p.write_text('\n'.join(f'{k}={v}' for k,v in rows.items())+'\n')
PY
cat "$CONFIG"
if [ "${1:-}" = '--launch' ]; then
  exec "$SDK/emulator/emulator" -avd "$NAME" -port 5580 -memory 8192 -partition-size 12288 -no-snapshot
fi
