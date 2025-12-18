# Multi-stage Dockerfile for spaced-repetition-capstone-server
# Production stage serves the Express API with TensorFlow.js ML models

# ============================================
# Development Stage
# ============================================
FROM node:20-alpine AS development

# Set working directory
WORKDIR /app

# Install build dependencies for TensorFlow.js
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Start with nodemon for hot reloading
CMD ["npm", "run", "dev"]

# ============================================
# Production Stage (Default)
# ============================================
FROM node:20-slim AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
# Note: TensorFlow.js requires build dependencies
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    npm ci --only=production && \
    npm cache clean --force && \
    apt-get remove -y python3 make g++ && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["npm", "start"]
