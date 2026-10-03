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
"$TOOLS/aapt" dump badging "$APK" | head -n 6
python3 - "$APK" <<'PY'
import sys,zipfile,hashlib,json
path=sys.argv[1]
with zipfile.ZipFile(path) as apk:
 names=apk.namelist()
 assert 'assets/index.android.bundle' in names,'RELEASE_JS_MISSING'
 wav=[n for n in names if n.endswith('.wav')]
 assert len(wav)==40,f'EXPECTED_40_WAV_GOT_{len(wav)}'
h=hashlib.sha256()
with open(path,'rb') as f:
 for data in iter(lambda:f.read(1024*1024),b''): h.update(data)
print(json.dumps({'apk':path,'sha256':h.hexdigest(),'wavCount':len(wav)},indent=2))
PY
