---
name: medicao-aparelho
description: Roteiro de medição no aparelho Android (Poco F7) por adb Wi-Fi, DevTools remoto e Perfetto, e onde salvar o resultado. Use quando uma mudança de shader, desempenho, fluidez ou rede precisar de número real no aparelho.
---

# Medição no aparelho

Fontes: `docs/historico/auditoria-play-xbox-com.md` (seção 9, protocolo e comandos), `docs/medicoes/poco-nfs-2026-11-09/` (sessão real: `README.md`, `CONCLUSOES.md`, `scripts/`). Leia a seção 9 antes da primeira sessão.

A medição é feita com o usuário no aparelho; o agente prepara, conduz e analisa. Não invente número: o que não foi medido fica marcado como não medido.

## Preparar

1. Parear e conectar: `adb pair IP:PORTA` → `adb connect IP:PORTA` → `adb devices -l`.
2. Fixar versões no relatório: commit, APK (`dumpsys package com.imagefilter.xcloud | grep versionName`), WebView (`dumpsys webviewupdate`), `BxBuild.sourceSha256`.
3. Tela em **60 Hz** nas Configurações do aparelho **antes** de abrir o jogo (a 120 Hz a decodificação vai de ~9 para ~25 ms). Sair para as Configurações durante o jogo derruba o stream.
4. DevTools remoto: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`; scripts em `scripts/`: `cdp.cjs` (avaliar expressão), `persist.cjs` (injetar em toda carga), `rec.js` (gravador: status por segundo, rVFC, LoAF).

## Medir

- Uma variável por vez, mesma cena, ABAB a cada 2–3 min; um jogo a 30 FPS e outro a 60 FPS.
- Térmico em paralelo a cada 30 s: `scripts/thermal.sh` ou `scripts/caps.sh` (limite de clock, temperatura).
- Perfetto: configs `scripts/*.pbtx` (`lean.pbtx` = frametimeline, `gpu_work_period`, frequência de CPU). No WebGL2 do Poco a GPU do painel vem de fence (limite superior, ~1,8× o real): custo de GPU real só pelo Perfetto.
- Na série longa, desconecte o DevTools (divide o rádio com o stream). Painel → "Iniciar medição" / "Encerrar e exportar medição" (schema da exportação em `docs/api-imagefilter.md`).
- RTT inicial acima de ~50 ms: sair e entrar na fila de novo.

## Salvar

- Pasta nova `docs/medicoes/<aparelho>-<jogo>-<AAAA-MM-DD>/` com `README.md` (condições, versões, números por corrida), `CONCLUSOES.md` (o que muda no produto) e `scripts/` novos ou alterados.
- Dados brutos (`*-rec.json`, `*-measurement.json`, `*.log`, `screens/`, `traces/`) ficam fora do git (`.gitignore`). Cite-os pelo nome no README.
- Análise: `scripts/an.py` (Perfetto + medição + gravação) como ponto de partida.
