# Estágio 1: Build da aplicação React + Vite
FROM node:20-alpine AS builder

WORKDIR /app

# Copia manifests de pacotes
COPY package*.json ./

# Instala dependências
RUN npm ci

# Copia código-fonte e compila para produção
COPY . .
RUN npm run build

# Estágio 2: Servidor Web Nginx
FROM nginx:alpine

# Remove configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia configuração customizada com proxy reverso e SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia build estático compilado
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
