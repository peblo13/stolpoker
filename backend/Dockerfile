FROM node:18-alpine AS base

# Minimal, consistent backend Dockerfile - consistent with `temp-poker/backend/Dockerfile`
WORKDIR /app/backend
ENV NODE_ENV=production
ARG PORT=8080
ENV PORT=${PORT}

COPY backend/package*.json ./
# Some production dependencies may need compilation; install build tools temporarily
RUN apk add --no-cache --virtual .build-deps build-base python3 && \
	ls -la && cat package.json || true && \
	npm ci --only=production --no-audit --unsafe-perm && \
	apk del .build-deps

# Copy the rest of the backend sources from the build context (backend/ directory)
COPY backend/ ./

# Perform system updates, add curl for healthcheck, create run wrapper and non-root user
USER root
RUN apk update && apk upgrade --no-cache && apk add --no-cache curl
RUN printf '#!/bin/sh\nexec node /app/backend/index.js "$@"\n' > /run.sh && chmod +x /run.sh
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app

USER appuser
EXPOSE ${PORT}
ENTRYPOINT ["/run.sh"]
