ARG NODE_IMAGE=us-central1-docker.pkg.dev/mimetic-algebra-344104/keeta/nodejs-base-24@sha256:35dad0b86faf6f794c3457cee95711ad346ed90ae028b3de8af0364f1d1dbe45
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
RUN adduser --system --uid 1001 demo-fx-anchor

COPY --from=builder --chown=demo-fx-anchor:nodejs /app/ /app/

USER demo-fx-anchor
EXPOSE 8080

ENV PORT 8080
ENV NODE_ENV production

CMD ["node", "main.cjs"]
