# App desktop do Catálogo Pronto

App da equipe (Windows). Cada loja abre numa janela própria, num perfil de navegador
só dela, já logada no Cardapio.ai e no e-mail da loja (Proton). O painel web continua
cuidando de datas, valores e cobranças.

## Como a equipe usa

1. Abre o app e entra com o mesmo e-mail e senha do painel.
2. Vê as lojas da própria carteira (o administrador vê todas).
3. Clica em **Abrir loja**. A janela tem duas abas: **Cardapio.ai** e **E-mail da loja**.
   Na primeira vez o app preenche o login sozinho; depois a sessão fica salva no perfil
   daquela loja e ela já abre logada.
4. Se o Cardapio.ai pedir o código de verificação, o app abre a conversa "Código de acesso"
   no e-mail da loja, pega o código que chegou **depois** do pedido (nunca um antigo) e
   preenche sozinho. Sem o e-mail no cofre, o app avisa e o código é digitado à mão.
5. Ao abrir a loja, o app lê o **plano** no Cardapio.ai (nome, valor, validade, teste grátis)
   numa janela escondida. Ele aparece na barra e vai para o painel, que avisa o
   administrador quando faltam 5 dias ou menos.
6. **Conferir catálogo** lê todos os produtos da loja e compara com o que revisamos no painel:
   sem preço, preço diferente, repetidos, faltando (corrigir) e sem foto, sem descrição,
   desativados (atenção). O resultado aparece na aba Conferência e na ficha da loja.

Os logins ficam no cofre do painel: **Lojas e acessos › Logins da loja**.

## Segurança do cofre

- As senhas ficam cifradas no servidor (mesma `CHAVE_CRIPTO` das senhas do Cardapio.ai).
- O app recebe a senha só no processo principal e a preenche apenas no site do próprio
  serviço. A tela da lista de lojas nunca recebe senha.
- Cada abertura de loja pelo app e cada **Mostrar senha** no painel ficam no histórico da loja.
- **Mostrar senha** é do administrador e de quem ele liberar em Equipe e backups.
- O app tem login próprio (token). Ele cai ao sair, ao trocar a senha da conta ou ao
  desativá-la. No computador, o token fica cifrado pela conta do Windows.

## Rodar e gerar o instalador

```bash
cd desktop
npm install
node node_modules/electron/install.js   # baixa o Electron, se o npm não tiver rodado o script
npm test                                 # testes dos módulos (sem abrir janela)
npm start                                # abre o app
npm run dist                             # gera o instalador em desktop/dist
```

O endereço do painel vem preenchido. Para apontar para outro, abra
**Endereço do painel** na tela de entrar, ou defina `CATALOGO_SERVIDOR` antes de abrir.
