# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency + Prisma files
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY . .

# Build Next.js
RUN npm run build

# Stage 2: Run
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + generated client (needed at runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/lib/generated/prisma ./lib/generated/prisma

# Databricks Apps sets DATABRICKS_APP_PORT
# Fallback to 3000 for local dev
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
