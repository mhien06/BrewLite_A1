FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# A reset while downloading a tarball can abort npm ci despite fetch retries.
# Retry the clean install at most three times, reusing npm's download cache.
RUN for attempt in 1 2 3; do \
      if npm ci --foreground-scripts --loglevel=http; then exit 0; fi; \
      if [ "$attempt" -eq 3 ]; then exit 1; fi; \
      echo "npm ci failed; retrying with download cache (attempt $((attempt + 1))/3)"; \
      sleep 3; \
    done

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001

# Compose starts this container only after PostgreSQL passes its health check.
# Apply pending migrations before the API starts accepting requests.
CMD ["sh", "-c", "npm run prisma:deploy && npm run start:prod"]
