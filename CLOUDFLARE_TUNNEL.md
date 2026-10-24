# Cloudflare Tunnel para o leitor de códigos

## Teste rápido no telemóvel

1. Instalar **cloudflared** no Windows e confirmar `cloudflared --version`.
2. Executar `start.bat` e manter a janela aberta. A aplicação fica em `http://localhost:8200/`.
3. Noutra janela executar `start-tunnel.bat`. Sem token configurado, inicia um **Quick Tunnel**.
4. Abrir no telemóvel o URL `https://....trycloudflare.com` mostrado na consola.
5. Autorizar a câmara e confirmar que as leituras ficam registadas.

O URL temporário muda quando se inicia um novo Quick Tunnel. Qualquer pessoa com esse endereço poderá aceder à aplicação. Não utilizar Quick Tunnel como serviço público permanente.

## Túnel próprio e persistente (opcional)

1. No painel Cloudflare Zero Trust, criar um túnel independente para o leitor de códigos (por exemplo `qr-scanner`).
2. Configurar o **Public Hostname** para o domínio/subdomínio pretendido, com serviço **HTTP** e URL de origem `localhost:8200`.
3. Proteger o hostname com uma política Cloudflare Access apropriada antes de expor dados operacionais.
4. Obter o token do conector no painel da Cloudflare; **nunca inserir o token num ficheiro versionado, no código web ou no GitHub**.
5. Na consola Windows que executará `start-tunnel.bat`, definir `set "QR_TUNNEL_TOKEN=COLOCAR_TOKEN_AQUI"` (não guardar o token no repositório) e depois executar `start-tunnel.bat`.
6. Manter o servidor local e o processo cloudflared em execução. Para execução contínua, configurar um serviço Windows seguindo a documentação oficial.

O script deteta a variável `QR_TUNNEL_TOKEN`: se existir, arranca o túnel permanente; caso contrário, usa o túnel temporário.

## Segurança e limitações

- O servidor `python -m http.server` de `start.bat` é adequado apenas para **testes e desenvolvimento**, não para produção.
- A aplicação ainda guarda os registos em `localStorage` por browser/dispositivo; não há sincronização de dados nem autenticação na aplicação.
- A câmara só funciona num contexto seguro HTTPS ou localhost. Aceder por `http://IP_DO_PC:8200` a partir do telemóvel normalmente não permite usar a câmara.
- O Cloudflare Tunnel não instala por si só a Cloudflare Access, não configura um domínio e não protege automaticamente o histórico local.
- Para terminar o túnel, premir Ctrl+C na respetiva janela. Para acesso persistente, o computador tem de estar ligado.
- Não associar a aplicação ao túnel de outra aplicação sem definir uma rota/hostname separado.
