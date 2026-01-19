# Standard Node.js Dockerfile for CPU deployment
# Use lightweight Node.js image

# ============================================ 
# Development Stage
# ============================================ 
FROM node:20-slim AS development

# Set environment variables
ENV NODE_ENV=development

# Install build dependencies for native modules (if any)
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (BuildKit cache speeds up repeated builds)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Start with nodemon
CMD ["npm", "run", "dev"]

# ============================================ 
# Production Stage
# ============================================ 
FROM node:20-slim AS production

# Set environment variables
ENV NODE_ENV=production
ENV TFJS_FORCE_JS=true

# Install build dependencies (often needed for tfjs-node even on CPU)
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies (BuildKit cache speeds up repeated builds)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

# Copy application code
COPY . .

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "index.js"]
