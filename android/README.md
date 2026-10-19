# Code Reader Android — protótipo nativo (2026-10-19)

Módulo Android independente dentro do repositório `0rndm123/coder`. A versão web/PC na raiz mantém-se funcional.

## Compatibilidade e arquitetura

- Android **6.0 (API 23) ou superior**; fabricante não específico. Inclui aparelhos Samsung, Xiaomi, Motorola, Google Pixel, OnePlus, Oppo, etc. Compatibilidade efetiva depende de câmara, autofocus, Camera2 e recursos do equipamento.
- **CameraX 1.4.2** para preview e processamento contínuo. Preferência pela câmara traseira; resolução de análise solicitada 1920×1080 (pode variar por equipamento).
- **ML Kit Barcode Scanning 17.3.0**, versão integrada no APK (não requer descarregar o modelo no primeiro arranque).
- Descodificação QR Code, Data Matrix, EAN/UPC, Code 128/39/93, ITF, Codabar, PDF417, Aztec e outras simbologias suportadas pelo ML Kit.
- O Data Matrix tem a particularidade de exigir que o código intersete o centro da imagem para ser reconhecido pelo ML Kit.
- Dados **locais SQLite**, sem permissões de Internet nem transmissão de códigos para terceiros. Exportação JSON Lines por Android Storage Access Framework.
- Não usa dependências proprietárias Samsung. **Não requer Internet para ler e guardar depois de instalada**.

## Compilar e instalar

1. Abrir a pasta `android/` no Android Studio atualizado, com **JDK 17**, Android SDK 35 e Gradle compatível.
2. Sincronizar o Gradle; o Android Studio pode descarregar dependências na primeira compilação.
3. Executar a configuração `app` num telemóvel Android real com câmara traseira.
4. Aceitar permissão da câmara.
5. Escolher ENTRADA ou SAÍDA, apontar ao código. A leitura regista-se imediatamente; a câmara permanece aberta para o código seguinte.
6. Fazer gesto de pinça para zoom manual quando necessário. Vibração curta indica um registo.
7. Exportar os registos em TXT/JSONL através do seletor de ficheiros Android.

**Este commit é código-fonte de protótipo e não contém APK compilado, Gradle Wrapper ou testes físicos.** Necessita de build e validação nos telemóveis alvo antes de ser utilizado em produção.

## Critérios mínimos de aceitação para utilização intensiva

- Testar QR, Data Matrix, EAN-13, Code 128, UPC e exemplares muito pequenos, incluindo os enviados no chat, em diferentes distâncias e luzes.
- Medir latência, taxa de sucesso, taxa de falsos positivos, focagem e consumo energético durante sessões longas.
- Testar pelo menos Samsung S24, um Xiaomi/Redmi e um Motorola/Pixel, e verificar funcionamento em Android 6/10/13/16.
- Rever política de duplicados: atualmente, mesmo valor+formato+movimento é ignorado durante **2,2 segundos**; leituras repetidas deliberadas após esse prazo são registadas.
- Definir requisitos para proteção/recuperação de dados, sincronização futura e atualizações seguras.

## Limitações atuais

- Sem zoom automático inteligente, deteção de áreas problemáticas, lanterna ou toque para focar; CameraX usa o autofocus disponibilizado pelo dispositivo.
- Sem histórico navegável na interface nem sincronização PostgreSQL. O contador e a exportação estão implementados.
- A gravação local não é encriptada ao nível da aplicação e a política Android de backup está desativada. Proteger os equipamentos e exportar regularmente.
- O motor ML Kit melhora as possibilidades face ao leitor web, mas **não garante equivalência ao leitor nativo Samsung**.
