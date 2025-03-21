FROM node:23.9.0 AS base

RUN npm install -g npm@latest

FROM base AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

FROM base AS builder

WORKDIR /app

ARG NEXT_PUBLIC_AGENT_NAME
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_USER_FILE_SIZE_LIMIT
ARG GOOGLE_GEMINI_API_KEY

ENV NEXT_PUBLIC_AGENT_NAME=$NEXT_PUBLIC_AGENT_NAME
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_USER_FILE_SIZE_LIMIT=$NEXT_PUBLIC_USER_FILE_SIZE_LIMIT
ENV GOOGLE_GEMINI_API_KEY=$GOOGLE_GEMINI_API_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM base AS runner

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/instructions ./instructions

USER nextjs

LABEL maintainer="admin@dbiteam.com"
LABEL team="Digital Banking and Business Innovation"

EXPOSE 3000

ENV TZ=UTC
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
