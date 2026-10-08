#!/bin/sh
set -eu
umask 077
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TASK_ROOT=$(CDPATH= cd -- "$APP_ROOT/../.." && pwd)
SIGNING_DIR="${VOCABULARY_SIGNING_DIR:-$TASK_ROOT/work/release-signing}"
mkdir -p "$SIGNING_DIR"
# Private material lives outside the repository and is reused by upgrade builds.
if [ ! -f "$SIGNING_DIR/signing.env" ]; then
  umask 077
  PASSWORD=$(openssl rand -hex 24)
  printf "VOCABULARY_STORE_PASSWORD='%s'\nVOCABULARY_KEY_PASSWORD='%s'\n" "$PASSWORD" "$PASSWORD" > "$SIGNING_DIR/signing.env"
fi
. "$SIGNING_DIR/signing.env"
VOCABULARY_KEYSTORE="$SIGNING_DIR/release.keystore"
export VOCABULARY_KEYSTORE VOCABULARY_STORE_PASSWORD VOCABULARY_KEY_PASSWORD
if [ ! -f "$VOCABULARY_KEYSTORE" ]; then
  keytool -genkeypair -keystore "$VOCABULARY_KEYSTORE" -storepass:env VOCABULARY_STORE_PASSWORD -keypass:env VOCABULARY_KEY_PASSWORD -alias vocabulary -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=German Vocabulary, OU=Personal, O=Personal, C=DE' >/dev/null
fi
ABI=$(node -p 'process.arch === "arm64" ? "arm64-v8a" : process.arch === "x64" ? "x86_64" : "unsupported"')
if [ "$ABI" = unsupported ]; then echo HOST_ABI_UNSUPPORTED >&2; exit 2; fi
cd "$APP_ROOT/android"
./gradlew --offline --no-daemon assembleRelease "-PreactNativeArchitectures=${VOCABULARY_ABI:-$ABI}"
APK="$APP_ROOT/android/app/build/outputs/apk/release/app-release.apk"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
TOOLS="$SDK/build-tools/36.0.0"
"$TOOLS/apksigner" verify --verbose --print-certs "$APK"
PERMISSIONS=$("$TOOLS/aapt" dump permissions "$APK")
if printf '%s\n' "$PERMISSIONS" | rg -q 'android.permission.INTERNET'; then echo 'RELEASE_HAS_INTERNET' >&2; exit 1; fi
BADGING_FILE=$(mktemp "${TMPDIR:-/tmp}/vocabulary-badging.XXXXXX")
trap 'rm -f "$BADGING_FILE"' EXIT INT HUP TERM
"$TOOLS/aapt" dump badging "$APK" > "$BADGING_FILE"
head -n 6 "$BADGING_FILE"
ASSET_LIST=$(mktemp "${TMPDIR:-/tmp}/vocabulary-assets.XXXXXX")
trap 'rm -f "$BADGING_FILE" "$ASSET_LIST"' EXIT INT HUP TERM
"$TOOLS/aapt" list "$APK" > "$ASSET_LIST"
grep -qx 'assets/index.android.bundle' "$ASSET_LIST" || { echo 'RELEASE_JS_MISSING' >&2; exit 1; }
for LIB_ABI in $(printf '%s' "${VOCABULARY_ABI:-$ABI}" | tr ',' ' '); do
  for LIB_NAME in librnllama.so librnllama_jni.so; do
    LIB_PATH="lib/$LIB_ABI/$LIB_NAME"
    grep -Fqx "$LIB_PATH" "$ASSET_LIST" || { echo "RELEASE_MODEL_NATIVE_LIBRARY_MISSING:$LIB_PATH" >&2; exit 1; }
  done
done
WAV_COUNT=$(grep -c '\.wav$' "$ASSET_LIST" || true)
if [ "$WAV_COUNT" -ne 40 ]; then echo "EXPECTED_40_WAV_GOT_$WAV_COUNT" >&2; exit 1; fi
SHA256=$(openssl dgst -sha256 -r "$APK" | awk '{print $1}')
printf '{\n  "apk": "%s",\n  "sha256": "%s",\n  "wavCount": %s\n}\n' "$APK" "$SHA256" "$WAV_COUNT"
