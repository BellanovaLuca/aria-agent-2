# Build della SPA e serving statico dietro nginx, che fa da reverse-proxy verso
# i microservizi (stesso schema del proxy Vite in sviluppo) e inietta la
# X-Internal-Api-Key server-side, così non arriva mai al browser.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# tzdata: permette a TZ (es. Europe/Rome) di risolvere il fuso nei log di nginx.
RUN apk add --no-cache tzdata
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# Solo INTERNAL_API_KEY viene sostituita nel template: le variabili nginx
# ($uri, $1, …) restano intatte.
ENV NGINX_ENVSUBST_FILTER=INTERNAL_API_KEY
EXPOSE 80
