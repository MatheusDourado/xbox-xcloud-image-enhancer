# v9.5.1 — correções de cadência, suavidade e comparação RCAS

Userscript `6.7.12-imagefilter.9.5.1` e app Android **9.5.1**.

- **Limitador de FPS:** mantém os prazos dos quadros, sem reiniciar o intervalo a cada callback. Um stream de 30 FPS com chegadas alternadas de 32 e 34,67 ms deixava passar só 15 FPS com o limite em 30; o teste agora preserva os 30 FPS. Há tolerância de agendamento de 2 ms, sem acumular aumento de FPS, e reinício após pausas longas. O `script.js` original continua preservado.
- **Suavidade:** acompanha a conexão mesmo sem WebGL2, sem quadros novos e com o painel fechado. Alterar o controle aplica a solicitação imediatamente, sem reiniciar a adaptação GPU. Trocar de sessão ou sair da página libera o ajuste anterior; voltar pelo histórico retoma a aplicação.
- **Alvo e atraso:** as opções agora dizem “Alvo de 17/33/50 ms”. O painel e a configuração copiada informam suporte, aplicação parcial ou erro. O alvo solicitado não é uma garantia de atraso máximo: compare com o **buffer medido** na linha de latência. “Automático” restaura a política do navegador.
- **RCAS:** o modo de referência mantém RCAS e sua intensidade, em vez de trocar silenciosamente para CAS. Vídeo original continua sem nitidez.
- **Ritmo:** redesenhar o mesmo quadro após mudar uma opção não entra na contagem de novos quadros.
- **CI:** os testes WebGL/DOM, regressões de pixels e casos de movimento passam a bloquear builds com falhas. O relatório fica anexado ao workflow.

Validação local: **34 testes Node**, **69 verificações Chrome/WebGL/DOM**, **43 regressões de pixels** e **11 casos de movimento** passaram. A API de buffer foi exercitada também em um receptor WebRTC real criado no Chrome, sem conexão externa. Build do userscript reproduzível; APK assinado e conteúdo embarcado conferido. Não houve teste em aparelho Android, Dell/Iris Xe ou sessão autenticada de xCloud.

Arquivos: `better-xcloud-image-filter.user.js` e `android/dist/xcloud-imagefilter-9.5.1.apk`. APK mantém a assinatura de teste da série 9.x para permitir atualização sobre a versão anterior. Preferências de imagem da v9 são preservadas.

No PC, substitua o userscript no Tampermonkey e recarregue o xCloud. No Android, instale o APK por cima da 9.5. Compare o limite de FPS e os alvos de buffer na mesma sessão; informe **Copiar configuração** ao relatar os resultados.

Detalhes de verificação: [validation-v9.5.1.md](validation-v9.5.1.md).
