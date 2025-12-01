# Multi-stage Dockerfile for CHIRP Radio Frontend
# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_USE_CMS_API=true
ARG VITE_CMS_API_URL=""
ARG NODE_ENV=production

# Set environment variables for build
ENV VITE_USE_CMS_API=$VITE_USE_CMS_API
ENV VITE_CMS_API_URL=$VITE_CMS_API_URL
ENV NODE_ENV=$NODE_ENV

# Build the application
RUN npm run build

# Build Storybook
RUN npm run build-storybook

# Stage 2: Production server
FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy Storybook build to /storybook path
COPY --from=builder /app/storybook-static /usr/share/nginx/html/storybook

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
