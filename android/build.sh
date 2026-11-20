#!/usr/bin/env bash
# Builds the Android APK without Gradle/Android SDK.
# Ubuntu 24.04: apt-get install aapt dalvik-exchange zipalign apksigner openjdk-21-jdk-headless
# or the Android SDK build-tools (aapt, d8, zipalign, apksigner) on PATH.
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' AndroidManifest.xml)
OUT=build
ANDROID_JAR=${ANDROID_JAR:-$OUT/android-34.jar}
rm -rf "$OUT/gen" "$OUT/classes" "$OUT/assets" "$OUT"/*.apk "$OUT"/*.dex
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/assets" dist
sed -i "s/VERSION = \"[^\"]*\"/VERSION = \"$VERSION\"/" src/com/imagefilter/xcloud/BuildConfigInfo.java
if [ ! -f "$ANDROID_JAR" ]; then
  # Platform API 34 stubs + framework resources (same content as the SDK's platforms/android-34/android.jar).
  curl -fsSL -o "$ANDROID_JAR" https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
fi
(cd .. && python3 tools/build.py)
cp ../better-xcloud-image-filter.user.js "$OUT/assets/userscript.js"
cp ../xcloud-image-filter-play.user.js "$OUT/assets/play.js"
aapt package -f -m -J "$OUT/gen" -M AndroidManifest.xml -S res -I "$ANDROID_JAR"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')
# CI uses the runner's SDK build-tools (d8); dalvik-exchange is the apt route.
if command -v d8 >/dev/null; then
  d8 --min-api 26 --lib "$ANDROID_JAR" --output "$OUT" $(find "$OUT/classes" -name '*.class')
else
  dalvik-exchange --dex --min-sdk-version=26 --output="$OUT/classes.dex" "$OUT/classes"
fi
aapt package -f -M AndroidManifest.xml -S res -A "$OUT/assets" -I "$ANDROID_JAR" -F "$OUT/unsigned.apk"
(cd "$OUT" && aapt add -f unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
# Fixed test key so new builds install over old ones. It is not a secret and is not meant for store releases.
apksigner sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias imagefilter \
  --out "dist/xcloud-imagefilter-$VERSION.apk" "$OUT/aligned.apk"
apksigner verify --print-certs "dist/xcloud-imagefilter-$VERSION.apk" | head -1
sha256sum "dist/xcloud-imagefilter-$VERSION.apk"
