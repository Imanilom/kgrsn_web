FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

# Set max old space size sesuai kapasitas VPS (768MB) agar Node GC berjalan lancar & tidak SIGSEGV
ENV NODE_OPTIONS="--max_old_space_size=768"
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# Argument build untuk menyuntikkan URL API backend ke file JS Next.js static
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build


FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Batasi heap Node.js di runtime agar tidak OOM (server RAM kecil)
ENV NODE_OPTIONS="--max_old_space_size=300"
ENV NEXT_TELEMETRY_DISABLED=1

# Salin output standalone dan aset static yang diperlukan saja (tanpa menyalin seluruh node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
