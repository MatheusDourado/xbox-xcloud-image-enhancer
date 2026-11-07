# Spec 2 — Estudo de eficiência de GPU

Registro da Spec 2 na branch `claude/specs-autonomas`, iniciado em 2026-11-06.

## Resumo

**Estado:** em andamento. Este resumo é parcial e será trocado pelo final, com o ranking.

## Registro de decisões e problemas

- **Sem ffmpeg:** o clipe H.264 é codificado no Chrome do Vostro com WebCodecs. Nada foi instalado.
- **Bancada no WebView:** o app recusa HTTP sem TLS, então o CDP serve a bancada em `https://bench.invalid`. O app não muda.
- **Tela ligada:** nenhuma configuração do sistema foi alterada. O app usa `FLAG_KEEP_SCREEN_ON`, e o `dumpsys power` mostra `SCREEN_BRIGHT_WAKE_LOCK` em nome do app enquanto ele está na frente.
- **Sensores:** as primeiras medições gravaram `cpu0` e `gpu` da lista em cache do `thermalservice`, que só atualiza em eventos de limiar. Esses dois campos são inválidos nos arquivos gravados antes da correção; `tempC`, `level` e `thermal` estão corretos. A leitura passou a usar os valores atuais do HAL.
- **Alvo 16F:** a primeira rodada do Vostro deu `glError` 1282 e 0,017 ms em `spatial16F` e `copy1280x16F`, porque `readPixels` em RGBA8 não funciona em alvo float. Corrigido, e as rodadas foram refeitas.
