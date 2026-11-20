---
paths:
  - "src/shaders/**"
  - "src/webgpu/**"
  - "src/restoration-engine.js"
  - "src/webgpu-engine.js"
---

# Shaders (GLSL / WGSL)

Fontes: `tools/build.py`, `docs/spec4-webgpu.md` (Decisões, Testes).

- O build reescreve shaders: `finish.glsl` é embutido em `rcas`, `sgsr` e no CAS (marcador `/* FINISH_COLOR */`), e o CAS sobe para `highp`. Leia `tools/build.py` antes de mudar esses arquivos ou os marcadores.
- Passe que existe nas duas linguagens (`spatial`, `easu`, `rcas`, `sgsr`, `copy`) precisa mudar nas duas. A equivalência é provada pela suíte `webgpu-equivalence` (comparação de pixels), não por geração automática. Rode `tools/check.sh completo`.
- Coordenadas: o WebGL2 sobe o quadro com `UNPACK_FLIP_Y` (linha 0 embaixo); o WGSL converte para o referencial do GL e só inverte a linha na leitura. Mantenha isso, ou o dither e os deslocamentos dos Degradês divergem.
- Precisão: no Poco o WebGL2 usa `mediump`; o WGSL usa `f32` em tudo. Mudança de precisão muda custo e resultado; meça.
- Variantes do `spatial` são `override` do WGSL preenchidos por `BxRestoration.spatialProfile`: decida o que compilar ali, não duplicando lógica.
- Os testes do CI rodam em SwiftShader, sem GPU real: não medem custo no Adreno. Mudança que pode custar GPU precisa de medição no aparelho (skill `medicao-aparelho`) ou ser declarada como não medida.
