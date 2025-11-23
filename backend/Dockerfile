FROM node:18-alpine

# Single-stage image built from repo root with app files at /app/backend
WORKDIR /app/backend

# Copy package.json and install runtime deps
COPY backend/package*.json ./
RUN npm install --only=production --silent

# Copy backend code to the container
COPY backend/ ./

# Create a root index proxy so Fly's default 'node /app/index.js' doesn't fail
RUN mkdir -p /app && printf "module.exports = require('./backend/index.js');\n" > /app/index.js

# Small bootstrap wrapper used by the runtime environment
RUN printf '#!/bin/sh\nexec node /app/backend/index.js "$@"\n' > /run.sh \
  && chmod +x /run.sh

# Set port and expose for reference
ARG PORT=8080
ENV PORT=${PORT}
EXPOSE ${PORT}

# Entry point launches the server via the wrapper
ENTRYPOINT ["/run.sh"]
