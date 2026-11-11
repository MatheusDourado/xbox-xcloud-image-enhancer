# v10.1.3 (pré-lançamento) — textos em inglês e espanhol

Userscripts `6.7.12-imagefilter.10.1.3` (www.xbox.com, sobre o Better xCloud 6.7.12) e `10.1.3-play` (play.xbox.com), app Android **10.1.3** (`versionCode` 100103). Inclui tudo da [v10.1.2](release-v10.1.2.md). Só os textos mudaram: tratamento, padrões e medição são os mesmos da v10.1.2.

## O que mudou

### Idioma da interface
- Painel, HUD, avisos, motivos de status, botão e diálogo do play.xbox.com e avisos do app Android saem em **português**, **inglês** ou **espanhol**.
- O idioma segue a conta logada:
  1. no `www.xbox.com`, o locale do endereço (`/pt-BR/play`, `/en-US/play`, `/es-MX/play`…), que o site escolhe pela conta;
  2. no `play.xbox.com`, que não tem locale no endereço, o `<html lang>` da página;
  3. sem nenhum dos dois, o idioma do navegador (no app, o do Android).
- Idiomas sem tradução (francês, alemão, japonês…) usam **inglês**. Português de Portugal usa os textos pt-BR.
- Números seguem o idioma: `12.5 ms` / `1,234` em inglês; `12,5 ms` / `1.234` em português e espanhol.
- No app Android, os avisos nativos (configuração copiada, medição salva, injeção tardia) seguem o idioma do aparelho.

### Para quem mexe no código
- Os textos pt-BR do código são as chaves: `t('Nitidez')`, `t('O servidor está enviando {0}p.', altura)` (`src/i18n.js`).
- As traduções ficam em `src/i18n.json` (`{"texto pt": {"en": "…", "es": "…"}}`). Novo idioma = nova coluna nesse arquivo e o código em `SUPPORTED`.
- `tests/i18n.test.cjs` falha se um `t('…')` não tiver inglês e espanhol, ou se os marcadores `{0}` diferirem entre idiomas. Os testes de navegador rodam em pt-BR.
- O relatório de medição exportado não mudou de formato. Os textos dos avisos e motivos dentro dele saem no idioma da interface.
