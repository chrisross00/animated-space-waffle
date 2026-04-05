# --- Build stage ---
FROM node:24-alpine AS builder

WORKDIR /app

# Install root dependencies (prod only)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy shared modules (needed by both frontend build and backend runtime)
COPY shared/ ./shared/

# Install and build frontend
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend
COPY frontend/ ./frontend/
RUN npm run build --prefix frontend

# Install and build admin
COPY admin/package.json admin/package-lock.json ./admin/
RUN npm ci --prefix admin
COPY admin/ ./admin/
RUN npm run build --prefix admin

# --- Runtime stage ---
FROM node:24-alpine

WORKDIR /app

# Copy production node_modules and server files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/admin/dist ./admin/dist

# Copy server source
COPY index.js api.js auth-routes.js plaid-api.js admin-api.js ./
COPY db/ ./db/
COPY utils/ ./utils/
COPY shared/ ./shared/
COPY scripts/ ./scripts/
COPY package.json ./

EXPOSE 3000

CMD ["node", "index.js"]
