# ==============================================================================
# Stage 1: Build React Frontend
# ==============================================================================
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /build/frontend

# Install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Production Backend & SQLite Engine
# ==============================================================================
FROM node:20-bookworm-slim AS runner

# Install python3, make, g++ for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend production dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/ ./

# Copy compiled frontend from Stage 1 into backend's public directory
COPY --from=frontend-builder /build/frontend/dist ./public

# Create persistent data directory for SQLite database
RUN mkdir -p /app/data && chown -R node:node /app

# Switch to non-root user
USER node

# Production Environment Variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/attendance.db
ENV REGISTRATION_KEY=STATIC_REG_QR_KEY_SECRET_7890
ENV ADMIN_USERNAME=admin
ENV ADMIN_PASSWORD=admin123
ENV JWT_SECRET=spotlight_mvjce_production_secret_key_2026

# Persistent volume for SQLite data
VOLUME ["/app/data"]

EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "index.js"]
