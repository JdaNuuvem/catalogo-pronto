# Painel de Produtos

A central de gestao fica em `/gestao.html`: carteira de clientes, implantacoes,
materiais, suporte, cobrancas, recebimentos, custos, repasses e relatorios.
Administradores veem toda a operacao; atendentes trabalham com sua carteira.

Cada componente financeiro tem uma cobranca: implantacao, produtos, suporte ou
plano Cardapio.ai. Registre pagamentos parciais no componente correspondente.
O plano fica reservado para pagamento a plataforma. Para servicos, lance e rateie
os custos antes de fecha-los; a metade restante e liberada ao atendente conforme
o cliente paga. Correcoes de movimentos usam estorno, preservando o historico.

Contratos ativos geram mensalidades sem duplicacao. A rotina verifica cobrancas
e backups a cada hora, com uma copia diaria do banco, fotos e perfis de navegador.
Os arquivos ficam em `dados/backups` e podem ser baixados em Equipe e backups.
Guarde uma copia fora do servidor e preserve `CHAVE_CRIPTO` separadamente.

Seu cliente entra, envia as fotos dos produtos, a IA lê cada embalagem e escreve
nome e descrição, ele revisa e aprova, e o painel cadastra tudo na loja dele no
Cardapio.ai. No fim ele recebe o link da loja para divulgar.

```
cliente envia fotos ──> IA escreve os textos ──> cliente aprova ──> publica ──> link da loja
```

A IA entra **uma vez só**, para ler as fotos. O cadastro é automação de navegador,
sem IA nenhuma.

## Como o cliente usa

1. Acessa o endereço do painel e entra com o e-mail e senha que você deu a ele.
2. Arrasta as fotos dos produtos na página.
3. Confere os cartões: nome, descrição e categoria de cada foto. Edita o que quiser
   e desmarca o que não deve subir.
4. Clica em **Publicar aprovados** e acompanha o progresso.
5. Copia o **link da loja** que aparece no fim.

Na primeira publicação o Cardapio.ai pede um código de verificação por SMS ou
e-mail. Um campo aparece na tela de progresso — o cliente digita ali. Nas vezes
seguintes a sessão já está salva e ele nem vê essa etapa.

## Como você administra

Entre com a conta de administrador e clique em **Lojas e IA** no menu lateral. Ali você cadastra
cada cliente com dois pares de credenciais:

| Credencial | Para quê |
|---|---|
| E-mail e senha do painel | o que o cliente usa para entrar **aqui** |
| E-mail e senha do Cardapio.ai | o que a automação usa para publicar na loja **dele** |

As do Cardapio.ai ficam cifradas no banco e nunca voltam para a tela.

## Instalação na VPS

Precisa de uma VPS com Docker e um domínio apontando para o IP dela.
Recomendo pelo menos **2 GB de RAM** — o Chromium é pesado.

```bash
# 1. aponte o domínio para o IP da VPS antes de continuar (registro A)

# 2. na VPS
git clone <seu-repo> painel && cd painel
cp .env.exemplo .env

# 3. gere as chaves e cole no .env
docker run --rm node:20-alpine node -e "const c=require('crypto');console.log('CHAVE_SESSAO='+c.randomBytes(32).toString('hex'));console.log('CHAVE_CRIPTO='+c.randomBytes(32).toString('hex'))"

# 4. preencha o resto do .env: DOMINIO, ANTHROPIC_API_KEY, ADMIN_EMAIL, ADMIN_SENHA

# 5. suba
docker compose up -d --build
```

O Caddy emite o certificado HTTPS sozinho na primeira subida. Acesse
`https://seudominio.com`, entre com a conta de administrador e cadastre as lojas.

Comandos do dia a dia:

```bash
docker compose logs -f painel    # acompanhar
docker compose restart painel    # reiniciar
docker compose up -d --build     # atualizar depois de mudar o código
```

## Landing page de captação

Fica em `public/lp/` e é servida pelo mesmo servidor, em `/lp/`. O formulário
grava os contatos na tabela `leads` do mesmo banco.

A oferta na página é **serviço feito por vocês**, não autoatendimento: o cliente
manda as fotos e vocês montam a loja.

| O que a página promete | Valor |
|---|---|
| Implementação, até 25 produtos | R$ 400, uma vez |
| Produto acima de 25 (foto tratada + cadastro) | R$ 3 por produto |
| Manutenção, até 20 produtos novos por mês | R$ 180 por mês |
| Prazo de entrega | até 48 horas depois das fotos |

A mensalidade também anuncia suporte no WhatsApp para a loja **e para a impressora
de pedidos**. Se mudar qualquer um desses números, procure por eles em
`public/lp/index.html` — aparecem no herói, na comparação, nos passos e no preço.

**Antes de publicar, troque o número do WhatsApp.** Em `public/lp/index.html`:

```js
const WHATSAPP = '5521998310000';   // seu número, com 55 e DDD, só dígitos
```

Os leads aparecem em `GET /api/admin/leads` (só para o administrador). Para
exportar:

```bash
docker compose exec painel node -e "const d=require('better-sqlite3')('/dados/painel.db');console.log(['nome','whatsapp','loja','criado_em'].join(';'));d.prepare('SELECT * FROM leads ORDER BY id DESC').all().forEach(l=>console.log([l.nome,l.whatsapp,l.loja||'',l.criado_em].join(';')))" > leads.csv
```

### Domínio próprio para os anúncios

`painel.seudominio.com/lp/` funciona, mas para tráfego pago um domínio limpo
converte melhor. Aponte o segundo domínio para a mesma VPS e acrescente ao
`Caddyfile`:

```
catalogopronto.com.br {
	encode gzip
	rewrite / /lp/
	rewrite /lp /lp/
	reverse_proxy painel:3000
}
```

Assim o anúncio leva para a raiz do domínio e o formulário continua na mesma
origem — sem CORS para configurar.

### Pixel de anúncios

A página não vem com pixel. Para Meta ou Google Ads, cole o script deles logo
antes de `</head>` em `public/lp/index.html`. O evento de conversão que faz
sentido é o envio do formulário, dentro do `try` que dá certo:

```js
form.reset();
mostrar('Contato recebido. A gente chama você no WhatsApp.', true);
// aqui: fbq('track', 'Lead')  ou  gtag('event', 'conversion', {...})
```

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `CHAVE_SESSAO` | sim | assina os cookies. Mudar desloga todo mundo |
| `CHAVE_CRIPTO` | sim | cifra as senhas do Cardapio.ai. **Perder = credenciais ilegíveis** |
| `ANTHROPIC_API_KEY` | uma das duas | leitura das fotos pela IA |
| `OPENROUTER_API_KEY` | uma das duas | leitura das fotos pela IA, via OpenRouter |
| `IA_PROVEDOR` | não | `anthropic` ou `openrouter`. Sem isso, vale a chave preenchida |
| `IA_MODELO` | não | troca o modelo. Precisa aceitar imagem |
| `PHOTOROOM_API_KEY` | não | tira o fundo das fotos dos produtos (Photoroom). Sem ela, as fotos só são padronizadas |
| `OPENROUTER_SITE` | não | seu domínio, para aparecer nos rankings do OpenRouter |
| `DOMINIO` | sim | domínio do painel, usado pelo Caddy |
| `ADMIN_EMAIL` / `ADMIN_SENHA` | 1ª vez | cria a conta de administrador na primeira execução |
| `HEADLESS` | não | `false` abre o navegador com tela, só para depurar |
| `PAUSA_MS` | não | espera entre um produto e outro (padrão 1200) |

> O `.env.exemplo` ainda lista só a `ANTHROPIC_API_KEY` — acrescente as linhas
> de OpenRouter à mão a partir da tabela acima.

## Escolher a IA que lê as fotos

**Pela tela**, que é o caminho normal: entre como administrador, clique em
**Lojas** e use o bloco *Inteligência artificial*. Ali você escolhe o provedor,
o modelo e cola as chaves. Vale na hora, sem reiniciar nada.

As chaves ficam **cifradas no banco** com a mesma `CHAVE_CRIPTO` das senhas do
Cardapio.ai, e nunca voltam para a tela — só os quatro últimos caracteres, para
você reconhecer qual está lá. Campo em branco mantém a chave atual; para remover
existe um botão próprio.

O botão **Testar conexão** faz uma chamada mínima (uma imagem de 1 pixel, 16
tokens de resposta) e mostra o erro exato da API se algo estiver errado. Vale
usar antes de o cliente subir sessenta fotos e descobrir que a chave expirou.

**Por variável de ambiente** continua funcionando, como reserva:

```bash
ANTHROPIC_API_KEY=sk-ant-...        # ou
OPENROUTER_API_KEY=sk-or-...
```

O que está no painel tem prioridade; o ambiente entra quando o painel não tem
nada. O bloco mostra de onde veio a chave em uso (`painel` ou `ambiente`).

| Provedor | Modelo padrão | Onde pegar a chave |
|---|---|---|
| `anthropic` | `claude-sonnet-5` | console.anthropic.com |
| `openrouter` | `google/gemini-2.5-flash` | openrouter.ai/keys |

**Trocar de modelo** com `IA_MODELO`. Ele precisa aceitar imagem — o trabalho é
ler o rótulo da embalagem. Alguns que conferi no catálogo do OpenRouter, do mais
barato ao mais caro por milhão de tokens de entrada:

| `IA_MODELO` | Entrada |
|---|---|
| `qwen/qwen3.7-flash` | US$ 0,03 |
| `openai/gpt-4o-mini` | US$ 0,15 |
| `openai/gpt-5-mini` | US$ 0,25 |
| `google/gemini-2.5-flash` | US$ 0,30 |
| `google/gemini-2.5-pro` | US$ 1,25 |
| `anthropic/claude-sonnet-5` | US$ 2,00 |

Preço não é o único critério: modelo fraco lê rótulo errado, e aí alguém revisa
o texto à mão — o que era o trabalho que o painel deveria eliminar. Vale testar
com fotos reais antes de fixar o mais barato.

Logado como administrador, o topo do painel mostra qual provedor e modelo estão
ativos. O cliente não vê essa informação.

As duas chaves precisam de **pelo menos 32 caracteres**. O servidor recusa subir sem elas.

**Guarde uma cópia da `CHAVE_CRIPTO` em lugar seguro.** Se ela se perder, as senhas
do Cardapio.ai já salvas ficam ilegíveis e cada loja precisa ser reconectada.

## Rodar na sua máquina

```powershell
npm install
npx playwright install chromium
npm run chaves          # copie a saída para o .env
$env:CHAVE_SESSAO="..." ; $env:CHAVE_CRIPTO="..." ; $env:ANTHROPIC_API_KEY="..."
$env:ADMIN_EMAIL="voce@exemplo.com" ; $env:ADMIN_SENHA="uma-senha-boa"
$env:HEADLESS="false"   # útil para ver o navegador trabalhando
npm start
```

## Backup

Tudo que importa vive no volume `dados`:

```bash
docker compose exec painel tar czf - /dados > backup-$(date +%F).tar.gz
```

O `painel.db` guarda as contas e as credenciais cifradas. Sem a `CHAVE_CRIPTO`,
o backup não serve para restaurar as conexões com o Cardapio.ai — guarde as duas
coisas, em lugares separados.

## Estrutura

| Arquivo | O que é |
|---|---|
| `servidor.js` | rotas HTTP, upload, publicação, admin |
| `public/index.html` | painel do cliente |
| `public/admin.html` | cadastro de lojas |
| `lib/banco.js` | SQLite, contas e criptografia das credenciais |
| `lib/sessao.js` | cookies assinados e controle de acesso |
| `lib/fila.js` | uma publicação por loja de cada vez |
| `lib/cardapio.js` | automação do Cardapio.ai |
| `lib/ia.js` | leitura das fotos |
| `categorias.txt` | categorias oferecidas à IA e ao seletor |

## Decisões que valem saber

**Uma publicação por loja de cada vez.** Cada loja tem seu próprio perfil de
navegador; dois processos no mesmo perfil corrompem a sessão. Lojas diferentes
publicam em paralelo sem problema.

**As fotos ficam isoladas por loja.** Cada loja só enxerga os arquivos da própria
pasta, e o nome do arquivo é sanitizado — uma loja não alcança a foto de outra.

**O progresso usa Server-Sent Events.** Por isso o Caddy vai com `flush_interval -1`:
sem isso o cliente veria todas as mensagens de uma vez, no fim.

## Limites conhecidos

- **Sessão do Cardapio.ai expira.** Quando isso acontece o painel pede o código MFA
  de novo. É o comportamento do Cardapio.ai, não dá para contornar.
- **Preço precisa de revisão.** A leitura da foto começa com preço 0; informe o
  preço correto na revisão. A publicação exige preço positivo.
- **Uma loja do Cardapio.ai por conta.** Se um cliente tiver duas lojas, cadastre
  duas contas no painel.
