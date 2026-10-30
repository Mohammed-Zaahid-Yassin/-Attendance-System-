# ==============================================================================
# Stage 1: Build React Frontend Assets
# ==============================================================================
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /build/frontend

# Install frontend dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build static distribution
COPY frontend/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Production Backend & Static Serving Engine
# ==============================================================================
FROM node:20-bookworm-slim AS runner

# Install compilation tools for native C++ modules (better-sqlite3) and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production backend dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev && \
    apt-get purge -y --auto-remove python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy backend application source
COPY backend/ ./

# Copy compiled frontend distribution from Stage 1 into backend's public directory
COPY --from=frontend-builder /build/frontend/dist ./public

# Setup persistent directory for SQLite database storage
RUN mkdir -p /app/data && chown -R node:node /app

# Non-root user execution
USER node

# Production Runtime Configuration
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/attendance.db

# Expose HTTP port
EXPOSE 3001

# Container Healthcheck (polls authoritative /api/health endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Graceful signal handling via Node.js
CMD ["node", "index.js"]
