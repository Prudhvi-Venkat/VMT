# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

ENV PORT=5000 \
    NODE_ENV=production

EXPOSE 5000

CMD ["node", "src/server.js"]
