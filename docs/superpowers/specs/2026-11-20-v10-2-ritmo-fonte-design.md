# v10.2.0 — ritmo de quadros explícito, tela a 60 Hz de verdade e pedido de 1440p

Data: 2026-11-20. Base: [pesquisa nativo](../../pesquisa/2026-11-20-nativo/RELATORIO.md), [índice de campo](../../pesquisa/2026-11-20-nativo/campo/00-INDICE.md) e [conclusões da sessão no Poco F7](../../medicoes/poco-nfs-2026-11-09/CONCLUSOES.md).

Aprovação: o usuário delegou as decisões ("tu que decide", 2026-11-20) e pediu execução autônoma. As escolhas abaixo são do agente de implementação.

## Por quê

O usuário quer imagem mais próxima de um console e ritmo de quadros estável. Relato dele:

- A 60 FPS há engasgos e cintilação; o frame time não é estável e não aparece de forma explícita no HUD.
- Só três filtros mostram diferença visível: Degradês, Cor nas bordas e Detalhe. Compressão, Antialiasing e Reconstrução neural não mostram.
- EASU + nitidez fica um pouco melhor que SGSR.

## O que a pesquisa permite aproveitar agora

| Item da pesquisa | Decisão | Motivo |
| --- | --- | --- |
| Voto de 60 Hz da View (`setRequestedFrameRate`) e touch boost desligado | **Entra** | Maior ganho já medido (tela a 60 Hz: decodificação 25 → 9 ms, desvio 7 → 2,5 ms). O app só usa `preferredDisplayModeId`, que o HyperOS transforma em limite de renderização |
| Taxa real do painel na telemetria | **Entra** | Sem ela não dá para saber se o voto pegou; era lacuna da medição de 09/11 |
| Pedido de 1440p (`tizen` + `dimensionschanged` + `userRequestedResolutionUpdate`) | **Entra como experimental** | Única alavanca de imagem que muda o que chega. Nenhum repositório prova que o servidor entrega; o `tizen` sozinho já foi medido como igual ao `windows` |
| SGSR1 no lugar de EASU + RCAS | Não entra | Já existe como opção; o usuário prefere EASU, que já é o padrão |
| Fundir passes em um shader `mediump` | Não entra | Já feito na Spec 3 (`spatial.glsl`, variantes por perfil) |
| Deblock CC0, deband do vkBasalt | Não entra | O usuário não vê efeito da Compressão; o deband atual é um dos três filtros que ele aprova |
| Croma guiado por luma (CfL) | Não entra | O WebView entrega RGB já convertido; precisa de planos Y/CbCr crus (nativo) |
| Rede de restauração nova (QuickSRNet/ECBSR) + harness VMAF | Não entra | A rede atual custa ~5 ms de GPU sem ganho visível para o usuário; treinar outra pede harness e dados (semanas) |
| `WebViewSurfaceControl`, provedor alternativo de WebView | Não entra | Flags não são graváveis pelo app em build `user` |
| Híbrido nativo, NPU, Vulkan YCbCr, geração de quadros | Não entra | Dependem das medições E2/E6–E8; não trazem pixels melhores |
| Reaplicar `jitterBufferTarget` a cada 1 s | Já existe | `smoothingTick` reaplica a cada segundo |

Filtros sem efeito visível: já saem desligados no padrão (`neural`, `cleanup`, `antialias`, `detail` = 0). Nada a rebaixar. Os algoritmos dos três filtros aprovados não mudam nesta versão: sem o olho do usuário nem harness perceptual, uma mudança seria às cegas.

## Abordagens consideradas

1. **Só fonte e tela** (60 Hz + 1440p): ataca a causa medida do engasgo, mas o usuário continua sem ver o frame time.
2. **Só filtros**: sem medição perceptual, risco de piorar o que ele já aprova.
3. **Ritmo explícito + 60 Hz real + 1440p experimental** (escolhida): o HUD mostra o problema, o app tenta resolver a causa medida e a única alavanca de imagem de origem vira opção testável.

## Design

### 1. Frame time explícito no HUD

- Compacto e lateral: a linha `RIT ±x` vira `MS 16,7 ±2,5` (tempo médio entre quadros na tela e o desvio).
- Completo: a linha Ritmo vira `16,7 ms ±2,5 · p95 18,1`.
- Fonte: `status.pacing` (`frameStats`), que já existe. Nenhuma métrica nova.

### 2. Taxa real do painel

- Ponte Android nova: `BxAndroid.getDisplayHz()` devolve `Display.getRefreshRate()` no momento da chamada.
- `status.panelHz` atualizado a cada segundo junto da telemetria; entra na linha do tempo da medição (`panelHz`) e no resumo de configuração.
- Aviso novo (painel e HUD) quando o painel está a ≥ 90 Hz e o stream chega a ~60 FPS: "Tela a 120 Hz com jogo a 60 FPS: o ritmo fica irregular. Use 60 Hz em Taxa da tela." Se o app pediu 60 Hz e o sistema manteve 120, o aviso diz isso.

### 3. Voto de 60 Hz

- `applyRefreshRate(hz)` passa a pedir também, por reflexão (API 35, o app compila contra a 34): `View.setRequestedFrameRate(hz)` no WebView e `Window.setFrameRateBoostOnTouchEnabled(false)`. Com `hz = 0` volta ao padrão do sistema.
- O padrão continua "Auto": a medição de 09/11 mostrou que o pedido antigo piorava o ritmo no HyperOS, e o voto novo ainda não foi medido. Vira padrão só depois de medição no aparelho.

### 4. Pedido de 1440p (play.xbox.com, experimental)

- `streamResolution` ganha `1440p`: `osName` `tizen`, `displayInfo` 2560×1440.
- `RTCDataChannel.prototype.send` embrulhado no document-start: na mensagem `/streaming/characteristics/dimensionschanged` troca `preferredWidth/Height` por 2560×1440 (e a área segura) com `supportsCustomResolution: true`; no canal `control`, `userRequestedResolutionUpdate` sai com `resolutionAlias: "1440"`. Se o site não enviar esse pedido, o prelude envia um depois da primeira `dimensionschanged`.
- Só age com `streamResolution: '1440p'`. Formato das mensagens: [xCloudNative](https://github.com/Ricardex742/xCloudNative) (MIT), `ChannelHandshake.kt` e `ClientDisplayDimensions.kt`.
- `status.stream.request` registra o que foi reescrito; a resolução recebida já aparece no HUD e nos avisos.

## Fora do escopo

Mudança de padrões de filtro, bitrate por SDP, 1440p no www.xbox.com (lá a resolução é do Better xCloud), parar a composição sem quadro novo (precisa de Perfetto no aparelho).

## Riscos

- O HyperOS pode ignorar o voto; o aviso e a taxa real mostram isso.
- O servidor pode ignorar o 1440p ou recusar a sessão; a opção é experimental e não é o padrão.
- Sem aparelho na sessão, 60 Hz e 1440p saem sem medição: os testes cobrem a lógica, não o efeito.

## Testes

- `tests/play.test.cjs`: normalização de `1440p`, reescrita do pedido e das mensagens do canal de dados, nenhuma reescrita nos outros modos.
- `tests/play.test.cjs`: aviso de painel a 120 Hz e `status.panelHz`.
- `tools/check.sh completo` para o HUD (harness de navegador).
