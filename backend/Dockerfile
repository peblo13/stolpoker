FROM node:18.20.2-alpine3.20 AS base

# Minimal, consistent backend Dockerfile - consistent with `temp-poker/backend/Dockerfile`
WORKDIR /app/backend
ENV NODE_ENV=production
ARG PORT=8080
ENV PORT=${PORT}

COPY package*.json ./
RUN npm ci --only=production --silent

# Copy the rest of the backend sources from the build context (backend/ directory)
COPY . ./

# Perform system updates, add curl for healthcheck, create run wrapper and non-root user
USER root
RUN apk update && apk upgrade --no-cache && apk add --no-cache curl
RUN printf '#!/bin/sh\nexec node /app/backend/index.js "$@"\n' > /run.sh && chmod +x /run.sh
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app

USER appuser
EXPOSE ${PORT}
ENTRYPOINT ["/run.sh"]
