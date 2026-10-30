# ==============================================================================
# Stage 1: Build React Frontend Assets
# ==============================================================================
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /build/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Production Backend & Static Serving Engine
# ==============================================================================
FROM node:22-bookworm-slim AS runner

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
RUN npm ci --omit=dev

# Copy backend application source
COPY backend/ ./

# Copy compiled frontend distribution from Stage 1 into backend's public directory
COPY --from=frontend-builder /build/frontend/dist ./public

# Setup persistent directories for SQLite database storage
RUN mkdir -p /data /app/data && chmod 777 /data /app/data

# Production Runtime Configuration
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/attendance.db

# Expose HTTP port
EXPOSE 8080

# Container Healthcheck (polls authoritative /api/health endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

# Start the application
CMD ["node", "index.js"]
