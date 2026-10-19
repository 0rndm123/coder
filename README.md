# Leitor de códigos multiplataforma (MVP 6 - revisão arquitetural experimental)

Aplicação web para **Android/iPhone (câmara)** e **PC Windows/Linux/macOS (pistola USB/Bluetooth em modo HID/teclado)**. Também permite introduzir códigos manualmente.

## Arranque

1. Publicar **a pasta completa do repositório** num alojamento estático HTTPS, incluindo `assets/`. Enviar apenas `index.html` já não funciona nesta branch.
2. Abrir o mesmo endereço num browser no PC ou no telemóvel.
3. No telemóvel, tocar diretamente em **Registar entrada** (verde, ícone de câmara) ou **Registar saída** (vermelho, ícone de câmara). Isto abre a câmara para ler o código. Após uma leitura bem-sucedida, a câmara fecha e o movimento fica registado; para o próximo registo, voltar a tocar no botão pretendido.
4. Durante a leitura pode escolher a câmara num seletor. A aplicação tenta abrir a câmara traseira com resolução elevada e combina a biblioteca JavaScript com o motor nativo `BarcodeDetector`, quando o browser o suporta. A vista da câmara ocupa mais altura no telemóvel, sem faixas laterais; quando a câmara permite, aplica focagem contínua e zoom inicial de 1× (sem ampliação digital forçada). O controlo **Zoom** permite ajustar a aproximação real da câmara e o botão **Acender luz** ativa a lanterna nos dispositivos compatíveis. Pode tocar em **Ler de fotografia** para escolher uma imagem guardada ou em **Fotografar código** para tirar uma fotografia com a câmara do telemóvel e tentar descodificá-la. Quando o código não é reconhecido, não é criado um registo.
5. **PC com pistola**: escolher a operação no seletor de movimento para pistola/registo manual. Ligar a pistola em **USB HID/Keyboard Wedge** ou **Bluetooth HID**, clicar em **Ativar pistola** e fazer a leitura; o campo deve permanecer focado. Configurar sufixo **Enter** (preferencial) ou **Tab**.
6. Em qualquer dispositivo, consultar o histórico, confirmar a coluna **Movimento** e **Exportar TXT**.

É possível usar a webcam do PC ou uma pistola Bluetooth emparelhada com telemóvel, desde que o hardware e browser suportem estes modos.

### Compatibilidade da pistola

- **USB HID ou Bluetooth HID**: suportados como entrada de texto, sem API nem drivers específicos.
- **USB serial/porta COM ou protocolo proprietário**: **não suportados** por este MVP; exigem integração adicional.
- A pistola tem de ser capaz de descodificar o código: um leitor **1D** não lê QR Code (2D).
- A ligação HID transmite normalmente o **valor** e não a **simbologia**. O formato é guardado como `DESCONHECIDO` nas leituras da pistola; a câmara identifica-o quando a biblioteca o disponibiliza.
- O campo precisa de ter **foco**. Se clicar noutro controlo, volte a ativar a pistola. O browser tem de estar em primeiro plano.
- Cada leitura com pistola é registada, mesmo que o valor se repita. Para a câmara, cada botão inicia um registo individual e a leitura fecha após ser guardada.

## Movimentos (entrada/saída)

- **Câmara:** cada botão grande com ícone de câmara inicia uma leitura imediatamente com a operação correspondente, sem uma seleção prévia. O leitor fecha após uma leitura registada, evitando repetições involuntárias.
- **Pistola e registo manual:** escolher o movimento no seletor separado antes de registar; assim o movimento não depende de uma sessão de câmara anterior.
- Os dados já existentes continuam legíveis. Registos antigos sem `movement` aparecem com movimento não indicado (—). A importação TXT antiga continua suportada.
- Se a câmara ou a fotografia não reconhecerem o código, não é criado um registo. Confirmar sempre a mensagem de sucesso ou o histórico.

## Registos e ficheiros

A mesma estrutura de dados é usada em todos os equipamentos. Exportação TXT em formato **JSON Lines** (um objeto por linha):

```json
{"id":"123e4567-e89b-12d3-a456-426614174000","scanned_at":"2026-10-19T10:21:00.000Z","format":"DESCONHECIDO","value":"05601234567890","source":"scanner_hid","movement":"entrada"}
```

Campos: `id` (identificador único), `scanned_at` (timestamp UTC ISO 8601), `format` (simbologia ou `DESCONHECIDO`), `value` (texto, preserva zeros iniciais), `source` (`camera`, `scanner_hid`, `manual`, `importado`), `movement` (`entrada` ou `saida` nos novos registos; ausente em registos antigos).

Os dados são guardados em `localStorage` **por dispositivo/browser/origem**, sem sincronização. A comunicação entre separadores informa de alterações noutro separador, mas não evita perdas em gravações simultâneas. **Abrir o mesmo site no PC e no telemóvel não cria um histórico comum**. A importação TXT junta registos de outros equipamentos, evitando duplicados por `id`.

O TXT é gerado quando o utilizador carrega em **Exportar TXT**; não há escrita automática contínua no mesmo ficheiro. Limpar os dados do browser, usar modo privado ou exceder a quota pode fazer perder registos: exportar regularmente.

A aplicação mantém a chave de armazenamento `leitor_codigos_mvp_v1` para preservar os dados locais do protótipo anterior, desde que o URL/origem do site se mantenha.

## PostgreSQL — fase seguinte

```sql
CREATE TABLE IF NOT EXISTS scan_events (
    id TEXT PRIMARY KEY,
    scanned_at TIMESTAMPTZ NOT NULL,
    format TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT NOT NULL,
    movement TEXT CHECK (movement IN ('entrada','saida')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Pode importar o JSONL com Python, `json.loads` e `INSERT ... ON CONFLICT (id) DO NOTHING`, ou fazer sincronização HTTPS com uma API FastAPI que valide, autentique e grave as leituras. **Nunca** colocar credenciais PostgreSQL no código do browser.

## Dependências e limitações

- A câmara requer HTTPS e permissão do utilizador (exceto contextos locais seguros, como `localhost`). A preferência pela câmara traseira e pela resolução elevada depende do browser e não é garantida em todos os dispositivos.
- O descodificador nativo `BarcodeDetector` está disponível apenas nalguns browsers, sendo complementado pelo leitor `html5-qrcode` já existente; não equivale a abrir a aplicação nativa de leitura QR do telemóvel.
- A qualidade da focagem e a lente selecionada podem diferir da app nativa. O enquadramento do vídeo é ampliado visualmente e pode ocultar as margens da imagem; a descodificação continua a trabalhar com os fotogramas da câmara. O zoom real, a focagem contínua e a lanterna só funcionam quando o browser expõe essas capacidades através de `MediaStreamTrack.getCapabilities` e `applyConstraints`. Se o vídeo não reconhecer um QR Code, aproxime-o até ficar nítido, escolha outra lente/câmara ou use **Fotografar código**. Valide o registo pela mensagem de sucesso e pelo histórico.
- A biblioteca `html5-qrcode@2.3.8` é carregada via CDN, pelo que a primeira utilização da câmara requer Internet; a pistola e o modo manual não dependem dessa biblioteca.
- Não existe backend, login nem sincronização. Também não há suporte offline garantido para carregar a aplicação.
- A tabela mostra as últimas 80 leituras; a exportação inclui todas.
- Testes automáticos são limitados: validar em hardware físico, em particular pistola, câmara e comportamento do sufixo Enter/Tab.
- Não abrir automaticamente URLs contidos nos códigos; são apresentados apenas como texto.
## Arquitetura, testes e segurança (branch de revisão)

Este projeto ainda é um MVP. A separação de ficheiros e os testes de domínio não substituem uma API, controlo de acessos, armazenamento transacional ou revisão de segurança independente.

| Ficheiro | Responsabilidade |
| --- | --- |
| `index.html` | Estrutura e semântica da interface |
| `assets/styles.css` | Estilos e disposição da câmara |
| `assets/app.js` | UI, adaptação à câmara, pistola e persistência local |
| `assets/scan-domain.js` | Validação, importação e deduplicação sem dependências de browser |
| `tests/scan-domain.test.cjs` | Testes unitários executados pelo Node |
| `.github/workflows/validate.yml` | Validação automática em alterações ao GitHub |

Para testar localmente, com Node.js 22:

```sh
node --check assets/app.js
node --check assets/scan-domain.js
node --test tests/*.test.cjs
```

Ver [arquitetura e roadmap](docs/ARCHITECTURE.md) e [riscos de segurança](docs/SECURITY.md).

**Limitação de segurança importante**: o descodificador `html5-qrcode` continua a ser carregado de um CDN externo sem SRI. A CSP desta branch é um controlo inicial; a aplicação não deve ser considerada pronta para produção com dados sensíveis. É necessária validação real do funcionamento do leitor com a CSP ativa.

**Limites atuais**: cada valor pode ter no máximo 16.384 caracteres; cada importação aceita até 20.000 eventos e 5 MiB. Dados anteriores incompatíveis devem ser exportados e verificados antes de integrar esta branch.
