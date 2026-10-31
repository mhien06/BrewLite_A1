FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001

# Compose starts this container only after PostgreSQL passes its health check.
# Apply pending migrations before the API starts accepting requests.
CMD ["sh", "-c", "npm run prisma:deploy && npm run start:prod"]
