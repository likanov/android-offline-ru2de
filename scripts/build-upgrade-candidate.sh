#!/bin/sh
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TASK_ROOT=$(CDPATH= cd -- "$APP_ROOT/../.." && pwd)
CANDIDATE_ROOT="$TASK_ROOT/work/android-regression/upgrade-source"
SIGNING_DIR="$TASK_ROOT/work/release-signing"
COMMIT=19b2e0c1cf36eda73159aff9bb2d94b757d24144
if [ ! -f "$SIGNING_DIR/signing.env" ] || [ ! -f "$SIGNING_DIR/release.keystore" ]; then echo 'RELEASE_KEY_MISSING:build final candidate first' >&2; exit 2; fi
mkdir -p "$TASK_ROOT/work/android-regression"
if [ -e "$CANDIDATE_ROOT" ]; then
  if [ "$(git -C "$CANDIDATE_ROOT" rev-parse HEAD)" != "$COMMIT" ]; then echo UPGRADE_CHECKOUT_COMMIT_MISMATCH >&2; exit 2; fi
else
  git -C "$APP_ROOT" worktree add --detach "$CANDIDATE_ROOT" "$COMMIT"
fi
# Original product source and schema remain from Task5. Only build/signing
# configuration is patched; dependencies use the already installed local set.
if [ ! -e "$CANDIDATE_ROOT/node_modules" ]; then ln -s "$APP_ROOT/node_modules" "$CANDIDATE_ROOT/node_modules"; fi
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$CANDIDATE_ROOT/android/local.properties"
python3 - "$CANDIDATE_ROOT" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'android/app/build.gradle';s=p.read_text()
s=s.replace('    signingConfigs {','''    signingConfigs {
        release {
            storeFile file(System.getenv("VOCABULARY_KEYSTORE"))
            storePassword System.getenv("VOCABULARY_STORE_PASSWORD")
            keyAlias "vocabulary"
            keyPassword System.getenv("VOCABULARY_KEY_PASSWORD")
        }''')
s=s.replace('            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug','            signingConfig signingConfigs.release')
if 'VOCABULARY_KEYSTORE' in p.read_text():s=p.read_text()
start=s.index('    entryFile = ');end=s.index('\n',start)
s=s[:start]+'    entryFile = file("$projectRoot/upgrade-entry.js")'+s[end:]
p.write_text(s)
(root/'upgrade-entry.js').write_text("import registerRootComponent from 'expo/src/launch/registerRootComponent';\nimport App from './App';\nregisterRootComponent(App);\n")
p=root/'android/app/src/release';p.mkdir(exist_ok=True);(p/'AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"><uses-permission android:name="android.permission.INTERNET" tools:node="remove"/></manifest>\n')
PY
. "$SIGNING_DIR/signing.env"
VOCABULARY_KEYSTORE="$SIGNING_DIR/release.keystore"
export VOCABULARY_KEYSTORE VOCABULARY_STORE_PASSWORD VOCABULARY_KEY_PASSWORD
ABI=$(node -p 'process.arch === "arm64" ? "arm64-v8a" : process.arch === "x64" ? "x86_64" : "unsupported"')
if [ "$ABI" = unsupported ]; then echo HOST_ABI_UNSUPPORTED >&2; exit 2; fi
cd "$CANDIDATE_ROOT/android"
./gradlew --offline --no-daemon assembleRelease "-PreactNativeArchitectures=$ABI"
APK="$CANDIDATE_ROOT/android/app/build/outputs/apk/release/app-release.apk"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs "$APK"
MAP="$CANDIDATE_ROOT/android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map"
node "$APP_ROOT/scripts/upgrade-provenance.mjs" "$MAP"
python3 - "$APK" "$COMMIT" <<'PY'
import sys,hashlib,json
from pathlib import Path
p=Path(sys.argv[1]);h=hashlib.sha256()
with p.open('rb') as f:
 for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
Path(str(p)+'.provenance.json').write_text(json.dumps({'commit':sys.argv[2],'sha256':h.hexdigest(),'source':'original detached Task5 worktree','sourceMapVerified':True,'buildPatches':['release signing','remove INTERNET','checkout-owned Expo entry'],'dependencies':'shared locally installed node_modules; not npm-ci at Task5 lock'},indent=2)+'\n')
print(p)
PY
