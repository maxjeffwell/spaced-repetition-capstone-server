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

# Install all dependencies
RUN npm install

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

# Install production dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "index.js"]
