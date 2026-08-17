# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy the lockfile too and install from it. `npm install` against package.json
# alone re-resolves every range at build time, so the image could ship a
# dependency tree no test ever ran against — and a compromised patch release
# would land in a container build while CI, which uses `npm ci`, stayed green.
# `npm ci` fails loudly if package.json and the lockfile disagree, which is the
# behaviour you want in an image build.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage — nginx serving the static PWA.
# Uses the unprivileged image which runs as UID 101 and binds to port 8080
# by default (no root, no cap_net_bind_service needed).
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config: SPA routing (all paths → index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
