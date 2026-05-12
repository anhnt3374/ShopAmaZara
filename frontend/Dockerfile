# Multi-stage Dockerfile for AmaZara.
# Stage 1 installs deps and builds the Vite app.
# Stage 2 serves the static bundle through nginx with SPA-fallback routing.

# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first to leverage Docker layer cache when only source changes.
COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM nginx:1.27-alpine AS runtime

# SPA fallback config (any unknown path serves index.html).
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
