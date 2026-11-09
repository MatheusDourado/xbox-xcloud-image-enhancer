# Próxima sessão — testes da v10.1.0 no Poco F7 (adb por Wi-Fi)

Este é um checklist de handoff para a sessão de testes no aparelho. O detalhe de cada passo fica em outros dois documentos:
- seção 9 de [auditoria-play-xbox-com.md](auditoria-play-xbox-com.md): comandos, Perfetto e snippets;
- [release-v10.1.0.md](release-v10.1.0.md): o que mudou nesta versão.

O formato da medição exportada (schema 3) está em [api-imagefilter.md](api-imagefilter.md#medição--relatório-de-apiexportmeasurement-schema-3).

## 0. Preparar

1. Instale o APK `xcloud-imagefilter-10.1.0.apk`. Ele vem da release `v10.1.0-beta.1` ou de `android/dist/`.
   - Ele instala por cima da 10.0.0, porque usa a mesma chave de teste.
   - No Chrome ou no Tampermonkey, use `xcloud-image-filter-play.user.js` 10.1.0-play.
2. No celular, ative Opções do desenvolvedor → **Depuração por Wi-Fi**.
3. No PC, pareie e confira a conexão:
   ```sh
   adb pair IP:PORTA_DE_PAREAMENTO
   adb connect IP:PORTA
   adb devices -l
   ```
4. Abra o app, entre num jogo e, no PC, abra `chrome://inspect#devices`. O WebView do app já é depurável (`MainActivity.java:57`).
5. No console, confira que é a build nova: `BxBuild.version` deve ser `6.7.12-imagefilter.10.1.0` ou `10.1.0-play`.

## 1. Antes de qualquer A/B: o que está rodando de verdade

Rode isto no console e anote o resultado:

```js
const S=BxImageFilter.status,P=BxImageFilter.playHost?.player?.(),E=P?.bxEngine;
({resolution:S.resolution,display:S.display,net:S.net&&{w:S.net.width,h:S.net.height,fps:S.net.fpsReceived,mbps:S.net.bitrateMbps,codec:S.net.codec},
  neural:S.neural,measurement:S.measurement,adaptation:S.adaptation,float:E?.floatTargets,revision:E?.budget.revision,
  renderer:S.renderer.active,settings:BxImageFilter.configText()})
```

Confira três coisas:
- **Resolução recebida:** 1080p ou 720p? No site novo não há o "1080p HQ" do Better xCloud.
- **`neural`:** `running`, `no-float` ou `cut`. A partir desta versão, o painel e o HUD também avisam.
- **`revision`:** precisa ser `0`. Se for maior, a redução automática já cortou etapas.

## 2. Fixar as condições

- No painel:
  - **Aliviar GPU acima de = Nunca**, para a cadência não cortar a rede nem os degradês no meio do teste;
  - **Taxa da tela = 60 Hz**;
  - **Renderizador = WebGL2**, ou Auto.
- Feche o painel, deixe o HUD desligado ou compacto e **desconecte o DevTools** durante as séries longas. O adb e o DevTools dividem o rádio com o stream.
- Em paralelo, registre a temperatura a cada 30 s com `adb shell dumpsys thermalservice`.

## 3. Séries (uma variável por vez, mesma cena, ABAB de 2–3 min)

| # | Variável | Pergunta |
|---|---|---|
| a | Rede neural 0 × 100% (com Detalhe 1 e depois Detalhe 0) | custo real e se a rede soma algo ou só cancela o Detalhe (auditoria 5.5) |
| b | Detalhe 100% × 20–35% | redundância com a Nitidez; a GPU não muda |
| c | Degradês 100% × 60% × 0 | textura fina × banding |
| d | Saída Nativa × Auto; em Auto, EASU × SGSR | microdetalhe com a ampliação feita no shader, e não pelo compositor |
| e | Comparação Original × Tratada | linha de base do ritmo do `<video>`, sem tratamento |
| f | Fluidez desligada × Equilibrada × Equilibrada + Captura direta | engasgos vindos da chegada dos quadros × da GPU |

Faça um jogo a 30 FPS e outro a 60 FPS (`timeline[].fpsReceived`). Nos screencaps, use uma cena parada e tire `adb exec-out screencap -p > nome.png` em cada configuração.

Descarte os primeiros segundos depois de cada troca:
- ligar a rede realoca ~41,5 MB;
- uma variante nova do `spatial` compila na primeira vez.

O evento `compile`/`target` da medição mostra quando isso aconteceu.

## 4. O que ler na medição exportada

Puxe o arquivo com `adb pull "/sdcard/Download/xCloud ImageFilter/"` e leia:

- **`segments[].passes`:** sequências como `upload,nnFeatures,nnApply,spatial@…,casFiltered#1`. Provam se a rede, o SGSR ou o EASU rodaram de fato.
- **`segments[].gpu`:** `method: 'fence'` significa limite superior. Para a ocupação real da GPU, use o Perfetto (`gpu_work_period`).
- **`display`:** p95, p99 e hitches.
- **`cpu`, `slack` e `pipeline`:**
  - `cpu` alto aponta para o main thread;
  - `slack` negativo indica quadro pronto depois do vsync;
  - `pipeline` é o tempo de rede + decodificação até a tela.
- **`videoSkipped`, `pacerDropped`.**
- **`events`:** `degrade` com o motivo (não deve aparecer com "Nunca"), `compile`, `target` e `renderer`.
- **`timeline`:** `width`/`height` da fonte, `display`, `refreshHz`, `bitrateMbps` e `bitsPerPixel`.
- **`status`:** `neural`, `adaptation` e `resolution`.

## 5. Critérios (fixados antes de olhar os números)

- **Fluidez:**
  - a configuração candidata não pode piorar `display.p99` nem os hitches por minuto;
  - `videoSkipped` não pode subir;
  - a ocupação da GPU deve ficar em ≤ ~50% a 30 FPS (regra da Spec 2).
- **Imagem:** a textura fina (vegetação, asfalto, tecido) não pode perder contraste nos screencaps, e não pode aparecer cintilação nova num pan lento.

## 6. Resultado esperado desta sessão

Um conjunto de medições exportadas e screencaps, com os números anotados. Com eles se decide:
- se a rede fica ligada;
- os valores de Detalhe e Degradês;
- Nativa ou Auto com SGSR;
- quais itens "precisa medir antes" da seção 12.1 da auditoria valem a fase seguinte.
