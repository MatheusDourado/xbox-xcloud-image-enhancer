---
paths:
  - "android/**"
---

# App Android

Fontes: `android/build.sh`, `android/README.md`, `.github/workflows/build-release.yml`.

- Versão: só `android/AndroidManifest.xml` (`versionName` e `versionCode`, formato `MMmmpp`: 10.2.1 = `100201`). O `build.sh` copia o `versionName` para `BuildConfigInfo.java`; não edite esse arquivo à mão.
- APK só via `android/build.sh` (sem Gradle; Linux com aapt, d8 ou dalvik-exchange, apksigner). Ele roda `tools/build.py` e copia os userscripts como assets. Saída em `android/dist/` (ignorado no git; o CI anexa o APK à release).
- `android/debug.keystore` é chave de teste fixa (senha `android`), pública de propósito, para que versões novas instalem por cima. Não trocar: quebra a atualização de quem já instalou.
- `minSdk 28`, `targetSdk 34`. A ponte `BxAndroid` (`MainActivity.java`) é API usada pelo painel: mudar assinatura exige mudar `src/` junto.
- No macOS o `build.sh` não roda como está (espera ferramentas do Ubuntu); confie no CI para o APK.
