FROM node:22-alpine3.24
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]