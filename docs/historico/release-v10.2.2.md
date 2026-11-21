# v10.2.2 — Botão Xbox volta a abrir o guia no app e cores da barra de atraso no painel

Userscripts `6.7.12-imagefilter.10.2.2` (www.xbox.com, sobre o Better xCloud 6.7.12) e `10.2.2-play` (play.xbox.com), app Android **10.2.2** (`versionCode` 100202). Inclui tudo da [v10.2.1](release-v10.2.1.md). Nenhum filtro de imagem mudou.

## O que mudou

### App com play.xbox.com: o botão Xbox abre o guia de novo
- No app, com o HUD ligado, o botão Xbox não fazia nada: nem o do controle nem o da tela. Não dava para abrir o guia ("Sair do jogo", convidar, configurações), e para sair do jogo era preciso fechar o app. No Chrome, sem o script, o guia abria normalmente.
- Causa: com o HUD ligado, o script punha o `<style>` e o HUD dentro do `<html>` antes de o `<head>` existir, porque o app injeta o script no começo do documento. A página que o React recebia já não batia com a do servidor, e a hidratação falhava (erro React #418). O site então desenhava a página de novo do zero e deixava de abrir os diálogos, entre eles o guia.
- Agora o HUD e o estilo dele só entram depois que o documento termina de ser lido (`DOMContentLoaded`), e o site hidrata sem erro.

### Painel: cores da barra de atraso
- A barra "Atraso estimado do vídeo" e a legenda dela usam agora as mesmas cores do HUD completo: rede azul, buffer roxo, decodificação laranja, tratamento verde e espera da Fluidez rosa listrada. Antes, o painel ainda mostrava os tons de cinza.

## Para quem mexe no código
- `src/hud.js`: o primeiro `update()` espera o `DOMContentLoaded` quando `document.readyState` é `loading`.
- `src/panel.js`: cores da `.bxif-stackbar` e da legenda iguais às do `SEG` do `hud.js`.
