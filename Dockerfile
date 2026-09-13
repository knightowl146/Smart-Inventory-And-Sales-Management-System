# syntax=docker/dockerfile:1
# ---- Backend image for the Smart Inventory & Sales Management System API ----
# Not required for the Render deployment (Render builds directly from
# package.json using its native Node runtime - see render.yaml), but keeps
# the app portable to Railway, Fly.io, or a plain VPS/self-hosted box with
# zero rework, and is the reference image if you outgrow the PaaS tiers.
#
# This image is for the backend API ONLY. The frontend (frontend/) is a
# static Vite build meant to be hosted separately (e.g. Vercel) - see
# frontend/vercel.json and the README's Deployment section.

FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies first so this layer is cached unless package*.json changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest of the backend source. .dockerignore keeps frontend/, tests/,
# node_modules, and other irrelevant content out of the build context.
COPY . .

# Run as a non-root user rather than root inside the container
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ENV NODE_ENV=production
EXPOSE 3000

# Uses the app's own /health endpoint (added during the security-hardening
# pass) - reports 200 when Mongo is connected, 503 otherwise, so the
# container orchestrator can tell "running" apart from "actually ready".
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Run the server directly (not via `npm start`) so SIGTERM reaches the node
# process straight away - server.js already has a graceful-shutdown handler
# for it (closes the HTTP server, lets in-flight requests finish).
CMD ["node", "server.js"]
