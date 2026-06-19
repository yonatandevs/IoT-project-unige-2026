FROM node:22-alpine3.24 AS builder
WORKDIR /app
COPY visualization/package*.json ./
RUN npm ci
COPY visualization/ .
COPY shared/ /shared
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY visualization/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80