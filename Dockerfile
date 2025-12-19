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

# TensorFlow.js backend - auto-detect by default
# Will try: GPU → Native CPU (AVX) → Pure JavaScript
# Override in deployment:
#   - TFJS_BACKEND=node for production servers with AVX (AMD EPYC, Intel Xeon)
#   - TFJS_BACKEND=cpu for budget CPUs without AVX (Celeron N5105, Atom)
#   - TFJS_BACKEND=gpu for GPU-enabled containers
# ENV TFJS_BACKEND=auto  # Uncomment to force auto-detection

# Copy package files
COPY package*.json ./

# Create non-root user for security BEFORE copying files
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

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

# Copy application code with correct ownership (avoids extra chown layer)
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["npm", "start"]
