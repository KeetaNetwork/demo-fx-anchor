ARG NODE_IMAGE=us-central1-docker.pkg.dev/mimetic-algebra-344104/keeta/nodejs-base-20@sha256:77c6a086e53d1a81e1d58bc9679ed2426e9badd0fb79fdd1a61455f0f40b8b4a
FROM ${NODE_IMAGE} AS base

# 
# Build stage
# 
FROM base AS builder

RUN apk add --no-cache gcompat || :
WORKDIR /app

ARG SOURCE_DIR=.

COPY ${SOURCE_DIR} .

RUN npm ci --omit=dev

#
# Runner stage
#
FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 demo-kyc-provider

COPY --from=builder --chown=demo-kyc-provider:nodejs /app/* /app/

USER demo-kyc-provider
EXPOSE 8080

ENV PORT 8080
ENV NODE_ENV production

CMD ["node", "main.cjs"]
