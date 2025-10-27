FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget --quiet --spider http://localhost:8080/healthz || exit 1
CMD ["node","server.js"]
