# Validação v9.5.1 — 2026-10-13

Base: `3057c9c` (v9.5). Testes locais em macOS com Chrome headless e Playwright 1.60.0; estes resultados não medem desempenho ou qualidade percebida no hardware alvo.

## Reprodução e correção

- Limitador real extraído do userscript: 60 chegadas em dois segundos, com intervalos alternados de 32 e 34,67 ms, limite 30 FPS. Antes: 30 quadros desenhados. Depois: 60. Também verificados 60 → 30 FPS por dez segundos, pausa longa, mudança de limite, limite zero e caminho de 60 FPS.
- Suavidade sem instanciar player WebGL: antes o receptor permanecia sem ajuste. Agora recebe o alvo e retorna a `null` ao restaurar o padrão. Testes cobrem troca de conexão, pagehide/pageshow, receptor incompatível, erro de um receptor sem impedir outro e alternativa legada em segundos.
- Comparação RCAS em WebGL real, com os demais tratamentos desligados: antes os pixels diferiam porque a referência usava CAS. Agora os pixels são iguais. O original permanece igual independentemente de selecionar CAS ou RCAS.
- Redesenho após alterar nitidez: antes acrescentava uma amostra de cadência sem quadro novo. Agora mantém o número de amostras.

## Resultados

| Verificação | Resultado |
| --- | --- |
| `node --test tests/*.cjs` | 34 passaram |
| Chrome/WebGL/DOM | 69 passaram |
| Regressões de pixels | 43 passaram |
| Movimento sintético | 11 casos passaram |
| Receptor WebRTC do Chrome | Alvo em milissegundos aceito e padrão restaurado |
| Userscript e player | Verificação de sintaxe passou |
| Build repetido | Userscript e bundle idênticos byte a byte |
| APK | Assinatura verificada; certificado igual ao da 9.5; userscript embarcado idêntico ao distribuído |

O APK local foi compilado com JDK 17, stubs Android API 34 e Android SDK Build Tools 35.0.0 (aapt, d8, zipalign, apksigner). O script de build Ubuntu existente continua disponível. A versão é `9.5.1`, código `90501`, mesmo pacote e certificado da 9.5.

## Reproduzir

```sh
python3 tools/build.py
node --test tests/*.cjs
node --check better-xcloud-image-filter.user.js
node --check player/player.js
python3 -m pip install playwright==1.60.0
python3 -m playwright install chromium
python3 tools/run-browser-tests.py
```

Para usar o Chrome já instalado: `python3 tools/run-browser-tests.py --channel chrome`. O runner gera os harnesses, inicia um servidor local temporário, espera cada resultado, grava `output/playwright/results.json` e retorna erro se algum caso falhar. A CI instala Chromium e executa o mesmo runner antes de gerar o APK.

## Limites

Nenhum aparelho Android estava conectado. Não houve sessão autenticada de xCloud, avaliação no Dell/Poco, medição de temperatura ou validação da latência de controles. Os testes de receptor confirmam a API local, não a regularidade de uma rede móvel nem que o navegador entregue exatamente o atraso solicitado. A assinatura Android permanece a chave de teste versionada no repositório já utilizada no projeto; a migração para assinatura privada não faz parte desta correção.
