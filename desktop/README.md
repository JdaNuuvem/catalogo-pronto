# App desktop do Catálogo Pronto

App da equipe (Windows). Cada loja abre numa janela própria, num perfil de navegador
só dela, já logada no Cardapio.ai e no e-mail da loja (Proton). O painel web continua
cuidando de datas, valores e cobranças.

## Como a equipe usa

1. Instala pelo link **`<painel>/app-desktop/baixar`** e entra com o mesmo e-mail e senha do painel.
2. Na tela **Hoje** vê os números da carteira, os lembretes e o próximo passo de cada loja;
   em **Lojas**, busca e filtra as lojas da carteira (o administrador vê todas).
3. **Abrir loja** abre a janela da loja, com o menu: Resumo, Implantação, Ficha, Cardapio.ai,
   E-mail e Conferência. Na primeira vez o app preenche o login sozinho; depois a sessão
   fica salva no perfil daquela loja e ela já abre logada.
4. Se o Cardapio.ai pedir o código de verificação, o app abre a conversa "Código de acesso"
   no e-mail da loja, pega o código que chegou **depois** do pedido (nunca um antigo) e
   preenche sozinho. Sem o e-mail no cofre, o app avisa e o código é digitado à mão.
5. Ao abrir a loja, o app lê o **plano** no Cardapio.ai (nome, valor, validade, teste grátis)
   numa janela escondida. Ele aparece no menu e vai para o painel.
6. **Implantação** é o passo a passo da loja (ficha, endereço, marca, horários, entrega,
   pagamento, produtos, adicionais, conferência e entrega ao cliente):
   - os dados da ficha aparecem em cada passo, com **Copiar**, e um atalho abre a tela certa do Cardapio.ai;
   - **Produtos**: fotos (a IA escreve título, descrição e categoria; o fundo sai e a foto é
     padronizada), foto de **cardápio impresso** ou **importar de um link** (iFood, Anota Aí...);
     revisão e publicação pela fila do painel;
   - **Adicionais**: grupos sugeridos pela IA a partir da ficha, aprovados pela equipe;
   - **Logo e capa** prontos para o Cardapio.ai e **kit de entrega** (QR Code, cartaz em PDF,
     mensagem pronta). As mensagens saem pelo WhatsApp da operação (Evolution API) ou abrem
     no WhatsApp do computador.
7. **Ficha** abre o formulário da ficha dentro do app, para preencher junto com o cliente.
8. **Conferir catálogo** compara o publicado com o que revisamos e mostra o relatório na Conferência.

Os logins ficam no cofre do painel: **Lojas e acessos › Logins da loja**.

## Segurança

- As senhas ficam cifradas no servidor (mesma `CHAVE_CRIPTO` das senhas do Cardapio.ai).
- O app recebe a senha só no processo principal e a preenche apenas no site do próprio
  serviço. As telas do app nunca recebem senha nem o token.
- Cada abertura de loja pelo app e cada **Mostrar senha** no painel ficam no histórico da loja.
- **Mostrar senha** é do administrador e de quem ele liberar em Equipe e backups.
- O app tem login próprio (token). Ele cai ao sair, ao trocar a senha da conta ou ao
  desativá-la. No computador, o token fica cifrado pela conta do Windows.
- **Bloqueio**: depois de 15 minutos sem uso (`CATALOGO_BLOQUEIO_MIN` muda o tempo), com a
  tela do Windows bloqueada ou o computador suspenso, as lojas somem e o app pede a senha.
  Cinco senhas erradas encerram a sessão.

## Rodar, gerar o instalador e publicar uma versão

```bash
cd desktop
npm install
node node_modules/electron/install.js   # baixa o Electron, se o npm não tiver rodado o script
npm test                                 # testes dos módulos (sem abrir janela)
npm start                                # abre o app
npm run dist                             # gera o instalador em desktop/dist
```

Para publicar uma versão:

1. Suba o número em `version` no `package.json` (ex.: 0.2.0 → 0.2.1) e rode `npm run dist`.
2. Copie de `desktop/dist` para a pasta `app-desktop` dentro do volume de dados do painel
   (`/dados/app-desktop` no container): `latest.yml`, `catalogo-pronto-setup-X.exe` e
   `catalogo-pronto-setup-X.exe.blockmap`.
3. Os apps instalados conferem a cada 6 horas, baixam em segundo plano e mostram
   **Reiniciar e atualizar** na tela principal. Quem ainda não tem o app baixa em
   `<painel>/app-desktop/baixar`.

O instalador não é assinado: o Windows mostra "aplicativo desconhecido" na primeira vez
(**Mais informações › Executar assim mesmo**). Para tirar o aviso é preciso um
certificado de assinatura de código.

O endereço do painel vem preenchido. Para apontar para outro, abra
**Endereço do painel** na tela de entrar, ou defina `CATALOGO_SERVIDOR` antes de abrir.
