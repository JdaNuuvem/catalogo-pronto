# Imagem oficial do Playwright: ja traz o Chromium e todas as bibliotecas de
# sistema que ele precisa. Instalar isso a mao numa VPS limpa e a parte que
# mais da trabalho, entao vale usar a imagem pronta.
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

ENV NODE_ENV=production
WORKDIR /app

# O better-sqlite3 e modulo nativo e nao tem binario pronto para o Node desta
# imagem, entao precisa ser compilado — dai o python3, make e g++.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Copia so os manifestos primeiro para aproveitar o cache de camadas do Docker:
# mudar o codigo nao reinstala as dependencias.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Os dados (banco, fotos enviadas, perfis de navegador) vivem num volume,
# fora da imagem, para sobreviver a cada novo deploy.
ENV PASTA_DADOS=/dados
VOLUME ["/dados"]

EXPOSE 3000

# Roda sem privilegio de root. O usuario pwuser ja vem na imagem.
RUN mkdir -p /dados && chown -R pwuser:pwuser /dados /app
USER pwuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "servidor.js"]
