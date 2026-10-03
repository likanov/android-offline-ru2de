#!/bin/sh
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TASK_ROOT=$(CDPATH= cd -- "$APP_ROOT/../.." && pwd)
TOOLS="$TASK_ROOT/work/toolchains"
if [ -x "$TOOLS/node-runtime/node_modules/node/bin/node" ]; then
  PATH="$TOOLS/node-runtime/node_modules/node/bin:$PATH"
fi
if [ -d "$TOOLS/jdk17/Contents/Home" ]; then
  JAVA_HOME="$TOOLS/jdk17/Contents/Home"
elif [ -d /Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home ]; then
  JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home
fi
if [ -n "${JAVA_HOME:-}" ]; then export JAVA_HOME; PATH="$JAVA_HOME/bin:$PATH"; fi
if [ -d "$TOOLS/android-sdk" ]; then ANDROID_HOME="$TOOLS/android-sdk"; export ANDROID_HOME; PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"; fi
export PATH
GRADLE_USER_HOME="$TOOLS/gradle"
export GRADLE_USER_HOME
EXPO_NO_TELEMETRY=1
export EXPO_NO_TELEMETRY
exec "$@"
