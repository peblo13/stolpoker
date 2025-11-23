# Backend Dockerfile for poker-table
# Use Node 18 base image for parity with repo 'engines'
FROM node:18-alpine AS build

# Upgrade Alpine packages to address vulnerabilities
RUN apk update && apk upgrade

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --silent --production

# Copy application code
COPY . .

# Expose port from ENV (default 9000)
ARG PORT=9000
ENV PORT=${PORT}

# Run by default with node index.js (as in package.json start)
CMD ["node", "index.js"]
