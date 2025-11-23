FROM node:18-alpine

# Use single-stage build so artifacts are present in final image
WORKDIR /app/backend

# Install only what we need; keep image small
COPY backend/package*.json ./
RUN npm install --only=production --silent

# Copy backend source
COPY backend/ ./

# Create a small run wrapper to ensure the process is launched consistently
RUN printf '#!/bin/sh\nexec node /app/backend/index.js "$@"\n' > /run.sh \
  && chmod +x /run.sh

# Default port used by Fly
ARG PORT=8080
ENV PORT=${PORT}
EXPOSE ${PORT}

# Launch via wrapper so platform can append args if needed
ENTRYPOINT ["/run.sh"]
