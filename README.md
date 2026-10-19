# Leitor de códigos multiplataforma (MVP 5 — Data Matrix)

Aplicação web para **Android/iPhone (câmara)** e **PC Windows/Linux/macOS (pistola USB/Bluetooth em modo HID/teclado)**. Também permite introduzir códigos manualmente.

## Arranque

1. Publicar `index.html` num alojamento estático HTTPS (por exemplo, Netlify Drop).
2. Abrir o mesmo endereço num browser no PC ou no telemóvel.
3. No telemóvel, tocar diretamente em **Registar entrada** (verde, ícone de câmara) ou **Registar saída** (vermelho, ícone de câmara). Isto abre a câmara para ler o código. Após uma leitura bem-sucedida, a câmara fecha e o movimento fica registado; para o próximo registo, voltar a tocar no botão pretendido.
4. Durante a leitura pode escolher a câmara num seletor. A aplicação tenta abrir a câmara traseira com resolução elevada e usa `html5-qrcode` com alternância interna entre o motor JavaScript e o motor nativo `BarcodeDetector`, quando suportado, sem executar outro descodificador nativo em paralelo. A vista da câmara ocupa mais altura no telemóvel, sem faixas laterais; quando a câmara permite, tenta aplicar focagem contínua e inicia com zoom de 1×, quando suportado (ajustável manualmente), para evitar ampliar ruído ou perder nitidez. O controlo **Zoom** permite ajustar a aproximação real da câmara e o botão **Acender luz** ativa a lanterna nos dispositivos compatíveis. Pode tocar em **Ler de fotografia** para escolher uma imagem guardada ou em **Fotografar código** para tirar uma fotografia com a câmara do telemóvel e tentar descodificá-la. Quando o código não é reconhecido, não é criado um registo.
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

Os dados são guardados em `localStorage` **por dispositivo/browser/origem**, sem sincronização. **Abrir o mesmo site no PC e no telemóvel não cria um histórico comum**. A importação TXT junta registos de outros equipamentos, evitando duplicados por `id`.

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
- As bibliotecas `html5-qrcode@2.3.8` e `zxing-wasm@3.1.5` são carregadas via CDN; o ZXing-C++ WebAssembly é usado como alternativa em fotografias de códigos difíceis. Não existe SRI nem self-hosting, pelo que esta dependência externa deve ser revista antes de produção. A biblioteca `html5-qrcode@2.3.8` é carregada via CDN, pelo que a primeira utilização da câmara requer Internet; a pistola e o modo manual não dependem dessa biblioteca.
- Não existe backend, login nem sincronização. Também não há suporte offline garantido para carregar a aplicação.
- A tabela mostra as últimas 80 leituras; a exportação inclui todas.
- Testes automáticos são limitados: validar em hardware físico, em particular pistola, câmara e comportamento do sufixo Enter/Tab.
- Não abrir automaticamente URLs contidos nos códigos; são apresentados apenas como texto.

## Data Matrix pequeno (etiquetas GS1) — melhorias de 19-10-2026

- O símbolo quadrado de pontos/módulos, diferente de QR Code, pode ser **Data Matrix**. O descodificador de vídeo suporta Data Matrix, QR Code e códigos de barras 1D.
- Eliminado o segundo `BarcodeDetector` nativo em paralelo, já que `html5-qrcode` 2.3.8 alterna internamente entre o detetor nativo e ZXing JavaScript. O limite de vídeo foi reduzido de 20 para 10 FPS para evitar sobrecarga.
- **Fotografar código** e **Ler de fotografia** analisam primeiro a imagem original e, se falhar, utilizam o motor alternativo **ZXing-C++/WebAssembly**. Também procuram em cinco regiões de imagem ampliadas (no máximo 1600×1600 px por região) para facilitar Data Matrix pequenos e fora do centro.
- As imagens são processadas **localmente no browser**. O ficheiro ou código descodificado não é enviado à CDN; esta apenas serve os ficheiros da biblioteca. Continua a existir um risco de supply chain associado a scripts externos sem SRI.
- **Teste de cobertura do exemplo fornecido:** na fotografia de 1152×1536 px, o Data Matrix à direita tem aproximadamente 142 px de largura e fica abrangido pelas cinco regiões de análise. Isto valida o enquadramento dos recortes, **não comprova que o conteúdo tenha sido descodificado**. A eficácia depende da nitidez e da capacidade real do dispositivo/browser.
- Na utilização em vídeo, centre o Data Matrix no enquadramento, aproxime até ficar nítido e experimente outra câmara/lente se necessário. Para objetos muito pequenos, a via por fotografia de alta resolução é a alternativa recomendada.

**Validação pendente:** testes de reconhecimento reais com o Samsung e webcam/PC, análise da qualidade da câmara, comparação de tempos de leitura e instalação das dependências localmente com verificação de integridade. Não considerar o reconhecimento de pequenos Data Matrix garantido sem estes testes.


## Leitura em ecrã inteiro — Samsung S24 / Android

O botão de entrada/saída abre agora um leitor que ocupa todo o ecrã disponível e solicita o modo de ecrã inteiro do browser, quando suportado. A imagem da câmara preenche o ecrã (`object-fit:cover`) e os controlos aparecem sobrepostos. Não há faixas pretas laterais: apenas a pré-visualização pode ter as margens cortadas para ajustar à área do telemóvel; a descodificação `html5-qrcode` continua a receber o fotograma completo.

O zoom inicial passa para **2× real**, limitado ao intervalo que a câmara expõe através da API do browser. O utilizador pode alterar o zoom no controlo inferior. A aplicação tenta ativar a focagem contínua; se o browser não disponibilizar estas capacidades, a imagem permanece sem zoom forçado. O motor nativo da aplicação Câmara da Samsung continua a ser diferente do motor web e o desempenho pode não ser igual.

Os testes de regressão asseguram que as opções de ecrã inteiro e zoom são configuradas no código. **Os resultados reais de focagem, resolução e velocidade requerem teste no dispositivo físico**, com QR, Data Matrix e código de barras. Após `git pull origin main`, atualizar a página no telemóvel, confirmando que deixou de existir a imagem estreita entre faixas laterais. Não limpar os dados do browser, pois o histórico é local.
