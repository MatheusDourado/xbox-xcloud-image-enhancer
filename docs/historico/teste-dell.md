# Comparação no Dell — v6

Objetivo: verificar ganho perceptível em Hellblade II e queda de cadência inferior a 5% em uma sessão de pelo menos dez minutos. Os resultados locais no Mac não substituem esta avaliação.

## Preparação

Instale somente `better-xcloud-image-filter.user.js`. Confirme painel v6, WebGL2, 1080p HQ, qualidade Alta e bitrate Ilimitado. Clique em **Restaurar tratamento**. Selecione AMD CAS e nitidez 2 nos controles nativos.

## Sessão de dez minutos

1. **Minutos 0–2: CAS em 2.** Observe uma região escura com névoa/degradês, detalhes finos e um giro de câmera repetível. Anote cadência, bitrate e resolução.
2. **Minutos 2–5: Novo tratamento, temporal 0%.** Repita a observação e o giro. Compare faixas no céu/névoa, blocos, nitidez do rosto/roupa e legibilidade durante movimento.
3. **Minutos 5–8: temporal 30%.** Repita o giro. Observe rastros atrás de Senua, duplicação nas bordas e eventuais pausas. Anote se o painel informa que a adaptação desligou o temporal; nesse caso, o resultado não valida temporal ativo.
4. **Minutos 8–10: alterne CAS em 2 e Novo tratamento.** Use a mesma cena e movimentos semelhantes. Verifique também tela cheia e se o painel continua acessível.

Não compare trechos com mudanças grandes de bitrate ou resolução como se fossem efeito do filtro. Repita o trecho afetado. A cadência exibida é a de processamento dos quadros recebidos, não o FPS interno do jogo.

## Registro

| Modo | Cadência típica | Bitrate / resolução | GPU p95, se disponível | Aparência / rastros / pausas |
| --- | --- | --- | --- | --- |
| CAS em 2 | | | | |
| Novo, temporal 0% | | | | |
| Novo, temporal 30% | | | | |

Queda de cadência (%) = `100 × (cadência CAS − cadência novo) / cadência CAS`. Compare trechos de mesma taxa recebida. Exemplo: 60 para 57 é uma queda de 5%.

Relate também: versão do Chrome, tela cheia ou janela, duração da sessão e qual modo você prefere visualmente. Uma foto pode mostrar diferenças grandes; uma captura digital ou vídeo da tela é melhor para avaliar blocos e rastros. Não inclua dados da conta.

Se não houver ganho perceptível ou houver queda de fluidez, registre isso como reprovação do perfil no Dell. O teste não exige que você aceite o filtro só porque as métricas locais melhoraram.
