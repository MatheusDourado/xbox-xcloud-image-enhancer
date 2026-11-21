# Documentação

Na raiz de `docs/` fica só o que vale para a versão atual. O resto está organizado abaixo.

## Vale hoje

- [api-imagefilter.md](api-imagefilter.md): API `window.BxImageFilter` (painel, HUD, configurações, formato da medição exportada).
- [play-xbox-com.md](play-xbox-com.md): como o suporte ao site novo (play.xbox.com) funciona.
- [spec4-webgpu.md](spec4-webgpu.md): renderizador WebGPU (decisões, medições, testes).
- [third-party-v8.md](third-party-v8.md): código de terceiros e licenças (o nome é da v8; o conteúdo continua valendo).
- [release-v10.2.3.md](release-v10.2.3.md): notas da versão atual (o CI publica a release a partir deste arquivo).

## Medições

- [medicoes/poco-nfs-2026-11-09](medicoes/poco-nfs-2026-11-09/README.md): sessão real no Poco F7 ([conclusões](medicoes/poco-nfs-2026-11-09/CONCLUSOES.md), [scripts](medicoes/poco-nfs-2026-11-09/scripts)). É a base da configuração recomendada do README.
- `medicoes/spec1` a `spec4`: resultados JSON citados pelos docs das specs.

## Pesquisa

- [pesquisa/2026-11-20-nativo](pesquisa/2026-11-20-nativo/RELATORIO.md): próximo passo de qualidade de imagem (origem 1440p, restauração única, limites do WebView, caminho nativo/híbrido, hardware do Poco F7).

## Histórico

[historico/](historico/): notas de versões anteriores (v8 a v10.1.2), validações, análises (v9, v9.1), specs 1 a 3, auditoria do play.xbox.com e listas de trabalho já concluídas. Use para entender por que algo é como é, não como descrição do código atual.

## Processo

- [superpowers/specs](superpowers/specs): designs aprovados.
- [superpowers/plans](superpowers/plans): planos de implementação.
- Guia para agentes: [AGENTS.md](../AGENTS.md).
